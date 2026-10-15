import { TripError } from '../trips.js';
import { outingUrl } from './sorties.js';

// Admin « Voyages » : des sorties regroupées (journées entières). Un voyage est celui d'un photographe, ou commun aux
// deux (réglé par qui gère toutes les sorties). Portée « les miennes » : ses voyages, ses journées.
// Enregistré dans le plugin d'administration (session d'admin exigée, comme le reste de /admin).
export function registerTrips(app, { repo, render, done, failed, P, W, withReady }) {
  const trips = app.trips;
  const fmtDay = (day, t, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => new Intl.DateTimeFormat(t.locale, { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  const span = (tr, t) => (!tr.from ? t('aucune journée') : tr.from === tr.to ? fmtDay(tr.from, t) : t('du {from} au {to}', { from: fmtDay(tr.from, t), to: fmtDay(tr.to, t) }));
  const sees = (request, tr) => { const s = request.scope('sorties.voir'); return Boolean(s && (s.all || (tr.author_id != null && tr.author_id === s.authorId))); };
  const manages = (request, tr) => request.owns('sorties.gerer', tr.author_id ?? -2);
  const load = request => { const tr = trips.get(Number(request.params.id)); return tr && sees(request, tr) ? tr : null; };
  const back = id => `/admin/voyages/${id}`;
  const names = () => new Map(repo.authors().map(a => [a.id, a]));

  app.get('/admin/voyages', P('sorties.voir'), async (request, reply) => {
    const authors = names();
    const list = trips.list().filter(tr => sees(request, tr)).map(tr => ({ ...tr, span: span(tr, request.t), who: tr.author_id ? authors.get(tr.author_id)?.name || '' : request.t('les deux photographes'),
      cover: tr.cover && withReady(tr.cover) }));
    return render(request, reply, 'trips', { title: request.t('Voyages'), list, authors: request.mine('sorties.gerer', repo.authors(), 'id'), allTrips: Boolean(request.scope('sorties.gerer')?.all) });
  });

  app.post('/admin/voyages', W('sorties.gerer'), async (request, reply) => {
    const s = request.scope('sorties.gerer');
    // Voyage commun (les deux photographes) : seulement pour qui gère toutes les sorties.
    const wanted = Number(request.body?.author_id) || null;
    const authorId = s.all ? wanted : s.authorId;
    if (!s.all && (!authorId || authorId < 0)) return failed(reply, '/admin/voyages', request.t('Aucun photographe lié à votre compte.'));
    try {
      const id = trips.create({ name: request.body?.name, authorId });
      return done(reply, back(id), request.t('Voyage créé : rattachez-y ses journées.'));
    } catch (err) {
      if (!(err instanceof TripError)) throw err;
      return failed(reply, '/admin/voyages', request.t.msg(err.message));
    }
  });

  app.get('/admin/voyages/:id', P('sorties.voir'), async (request, reply) => {
    const tr = load(request);
    if (!tr) return reply.callNotFound();
    const authors = names();
    const outings = app.outings.list({ author: tr.author_id ?? null });
    const inTrip = new Set(tr.days.map(d => `${d.author_id}:${d.day}`));
    // Journées du voyage (avec leur sortie : lieu, photos, personnes, état), dans l'ordre du voyage.
    const days = tr.days.map(d => {
      const parts = outings.filter(o => o.author.id === d.author_id && o.day === d.day);
      const photos = parts.flatMap(o => o.photos), people = new Map(parts.flatMap(o => o.people).map(e => [e.id, e]));
      return { ...d, author: authors.get(d.author_id), when: fmtDay(d.day, request.t, { weekday: 'long', day: 'numeric', month: 'long' }), place: parts.find(o => o.place)?.place || '',
        url: outingUrl({ author: authors.get(d.author_id) || { slug: '' }, day: d.day, starts: '00:00' }), nPhotos: new Set(photos.map(p => p.id)).size, nPeople: people.size,
        strip: [...new Map(photos.map(p => [p.id, p])).values()].slice(0, 5).map(withReady).filter(p => p.ready) };
    });
    // Journées proches à proposer : celles du photographe du voyage (ou des deux), pas encore rattachées ailleurs.
    const index = trips.dayIndex();
    const nearby = outings.filter(o => !inTrip.has(`${o.author.id}:${o.day}`) && request.owns('sorties.gerer', o.author.id))
      .filter((o, i, all) => all.findIndex(x => x.author.id === o.author.id && x.day === o.day) === i).slice(0, 60)
      .map(o => ({ author: o.author, day: o.day, when: fmtDay(o.day, request.t), place: o.place, other: index.get(`${o.author.id}:${o.day}`) || null }));
    const photos = trips.photos(tr.id).filter(p => request.owns('photos.voir', p.author_id)).map(p => ({ ...withReady(p), level: app.readiness.state(p, null, request.t).site.level }));
    return render(request, reply, 'trip', {
      title: tr.name, tr: { ...tr, span: span(tr, request.t), who: tr.author_id ? authors.get(tr.author_id)?.name || '' : request.t('les deux photographes') },
      days, nearby, photos, manage: manages(request, tr), authors: request.mine('sorties.gerer', repo.authors(), 'id'), allTrips: Boolean(request.scope('sorties.gerer')?.all),
      readyDrafts: photos.filter(p => p.status === 'draft' && !p.review && p.level === 'ok').length,
    });
  });

  // Nom, textes (trois langues), photographe (commun : qui gère toutes les sorties).
  app.post('/admin/voyages/:id', W('sorties.gerer'), async (request, reply) => {
    const tr = load(request);
    if (!tr) return reply.callNotFound();
    if (!manages(request, tr)) return app.forbid(request, reply);
    const body = { ...request.body };
    delete body.public;                                                    // page publique : réglée à part (plus tard)
    if ('author_id' in body) {
      if (!request.scope('sorties.gerer')?.all) delete body.author_id;
      else body.author_id = Number(body.author_id) || null;
    }
    try {
      trips.update(tr.id, body);
    } catch (err) {
      if (!(err instanceof TripError)) throw err;
      return failed(reply, back(tr.id), request.t.msg(err.message));
    }
    return done(reply, back(tr.id), request.t('Voyage enregistré.'));
  });

  app.post('/admin/voyages/:id/supprimer', W('sorties.gerer'), async (request, reply) => {
    const tr = load(request);
    if (!tr) return reply.callNotFound();
    if (!manages(request, tr)) return app.forbid(request, reply);
    trips.remove(tr.id);
    return done(reply, '/admin/voyages', request.t('Voyage « {name} » supprimé : ses sorties et ses photos restent.', { name: tr.name }));
  });

  // Rattacher des journées : cochées dans la liste, ou toutes celles entre deux dates. Seulement les journées que le
  // compte gère, et celles du photographe du voyage quand il en a un.
  app.post('/admin/voyages/:id/journees', W('sorties.gerer'), async (request, reply) => {
    const tr = load(request);
    if (!tr) return reply.callNotFound();
    if (!manages(request, tr)) return app.forbid(request, reply);
    const body = request.body || {};
    let days = [].concat(body.jours || []).map(v => { const [a, d] = String(v).split(':'); return { author_id: Number(a), day: d }; });
    try {
      if (body.du || body.au) days = days.concat(trips.daysBetween(String(body.du || body.au), String(body.au || body.du), tr.author_id ?? (Number(body.photographe) || null)));
    } catch (err) {
      if (!(err instanceof TripError)) throw err;
      return failed(reply, back(tr.id), request.t.msg(err.message));
    }
    days = days.filter(d => request.owns('sorties.gerer', d.author_id) && (tr.author_id == null || d.author_id === tr.author_id));
    if (!days.length) return failed(reply, back(tr.id), request.t('Aucune journée de prise de vue à rattacher.'));
    const n = trips.addDays(tr.id, days);
    return done(reply, back(tr.id), n > 1 ? request.t('{n} journées rattachées au voyage.', { n }) : request.t('{n} journée rattachée au voyage.', { n }));
  });
  app.post('/admin/voyages/:id/journees/retirer', W('sorties.gerer'), async (request, reply) => {
    const tr = load(request);
    if (!tr) return reply.callNotFound();
    if (!manages(request, tr)) return app.forbid(request, reply);
    const [a, d] = String(request.body?.jour || '').split(':');
    trips.removeDay(tr.id, Number(a), d);
    return done(reply, back(tr.id), request.t('Journée retirée du voyage (la sortie reste).'));
  });

  // Depuis une sortie : la rattacher à un voyage, ou l'en détacher.
  app.post('/admin/sorties/:author/:day/voyage', W('sorties.gerer'), async (request, reply) => {
    const a = repo.authors().find(x => x.slug === request.params.author);
    const to = `/admin/sorties/${request.params.author}/${request.params.day}`;
    if (!a || !/^\d{4}-\d{2}-\d{2}$/.test(request.params.day)) return reply.callNotFound();
    const current = trips.tripOf(a.id, request.params.day);
    const id = Number(request.body?.voyage) || 0;
    if (!id) {
      if (current && manages(request, current)) trips.removeDay(current.id, a.id, request.params.day);
      return done(reply, to, request.t('Sortie détachée de son voyage.'));
    }
    const tr = trips.get(id);
    if (!tr || !sees(request, tr) || !manages(request, tr) || (tr.author_id != null && tr.author_id !== a.id)) return failed(reply, to, request.t('Ce voyage ne peut pas recevoir cette sortie.'));
    trips.addDays(tr.id, [{ author_id: a.id, day: request.params.day }]);
    return done(reply, to, request.t('Sortie rattachée au voyage « {name} ».', { name: tr.name }));
  });

  // Proposer (ou publier) d'un coup les photos prêtes du voyage, comme pour une sortie.
  app.post('/admin/voyages/:id/proposer', W('photos.proposer'), async (request, reply) => {
    const tr = load(request);
    if (!tr) return reply.callNotFound();
    const ids = trips.photos(tr.id).filter(p => p.status === 'draft' && !p.review && request.owns('photos.proposer', p.author_id)).map(p => p.id);
    const r = await app.review.propose(ids, { sub: request.session.sub, name: request.session.name });
    const n = r.proposed.length;
    return done(reply, back(tr.id), n > 1 ? request.t('{n} photos proposées à la publication.', { n }) : n ? request.t('{n} photo proposée à la publication.', { n }) : request.t('Aucune photo proposée.'));
  });
  app.post('/admin/voyages/:id/publier', W('photos.publier'), async (request, reply) => {
    const tr = load(request);
    if (!tr) return reply.callNotFound();
    const drafts = trips.photos(tr.id).filter(p => p.status === 'draft' && request.owns('photos.publier', p.author_id)).map(p => p.id);
    const g = app.readiness.gate(drafts);
    const before = repo.setStatuses(Object.fromEntries(g.ok.map(id => [id, 'published'])));
    app.instagram.onPublished(Object.keys(before).map(Number));
    for (const id of Object.keys(before).map(Number)) app.review.clear(id);
    const n = g.ok.length, rest = g.verify.length + g.blocked.length, t = request.t;
    const published = n > 1 ? t('{n} photos publiées.', { n }) : n === 1 ? t('1 photo publiée.') : t('0 photo publiée.');
    const left = rest > 1 ? t('{n} restent en brouillon (à vérifier ou bloquées) : ouvrez leur fiche.', { n: rest }) : t('1 reste en brouillon (à vérifier ou bloquée) : ouvrez leur fiche.');
    return done(reply, back(tr.id), `${published}${rest ? ` ${left}` : ''}`);
  });
}
