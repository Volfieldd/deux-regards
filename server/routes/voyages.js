import { TripError, isDay } from '../trips.js';
import { outingUrl } from './sorties.js';
import { noterLot } from '../journal-libelles.js';

// Admin « Voyages » : des sorties regroupées (journées entières). Un voyage est celui d'un photographe, ou commun aux
// deux (réglé par qui gère toutes les sorties). Portée « les miennes » : ses voyages, ses journées.
// Enregistré dans le plugin d'administration (session d'admin exigée, comme le reste de /admin).
export function registerTrips(app, { repo, render, done, failed, P, W, withReady, noteChanges = () => {} }) {
  const trips = app.trips;
  // Date d'une journée ; impossible à écrire (enregistrée avant le contrôle des dates) : telle quelle, jamais d'erreur.
  const fmtDay = (day, t, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => (isDay(day) ? new Intl.DateTimeFormat(t.locale, { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)) : String(day));
  const span = (tr, t) => (!tr.from ? t('aucune journée') : tr.from === tr.to ? fmtDay(tr.from, t) : t('du {from} au {to}', { from: fmtDay(tr.from, t), to: fmtDay(tr.to, t) }));
  const sees = (request, tr) => { const s = request.scope('sorties.voir'); return Boolean(s && (s.all || (tr.author_id != null && tr.author_id === s.authorId))); };
  const manages = (request, tr) => request.owns('sorties.gerer', tr.author_id ?? -2);
  // Le voyage d'un autre photographe, hors de la portée du compte : introuvable comme un voyage qui n'existe pas, mais
  // signalé à la Vigie (« hors portée », cas DS10 ; registre docs/etudes/vigie-besoins-des-briques.md, BV-14), comme les
  // photos et les fiches (server/routes/admin.js). Un identifiant inconnu n'est pas signalé.
  // Détail commun des objets à plusieurs auteurs (BV-14 : billets, galeries, accès, voyages) : objet, numéro, et si la
  // requête écrivait (règle ecriture_hors_portee de la Vigie, vigie/regles/85-galeries-carnets.yml).
  const outOfScope = (request, perm = 'sorties.voir', id = null) => app.securite.emit('authz_fail', { request, emetteur: 'server/routes/voyages.js · portée',
    detail: { raison: 'hors portée', permission: perm, objet: 'voyage', id: Number.isSafeInteger(id) ? id : null, ecriture: request.method !== 'GET' && request.method !== 'HEAD' } });
  const load = request => {
    const tr = trips.get(Number(request.params.id));
    if (!tr) return null;
    if (sees(request, tr)) return tr;
    outOfScope(request, 'sorties.voir', tr.id);
    return null;
  };
  const back = id => `/admin/voyages/${id}`;
  const names = () => new Map(repo.authors().map(a => [a.id, a]));
  // Voyage commun : « les deux photographes » quand il y en a deux, sinon « tous les photographes ».
  const everyone = (t, n = repo.authors().length) => (n === 2 ? t('les deux photographes') : t('tous les photographes'));
  // Page publique : la mettre en ligne demande le droit de publier sur le site (comme une photo) ; modifier les
  // textes d'une page déjà en ligne, celui de modifier les photos publiées. Voyage commun : portée « tout ».
  const canPublish = (request, tr) => request.owns('photos.publier', tr.author_id ?? -2);
  const canEditPublic = (request, tr) => request.owns('photos.publiees.modifier', tr.author_id ?? -2);
  const TEXTS = ['name', 'name_en', 'name_de', 'intro', 'intro_en', 'intro_de'];
  // Publier les photos prêtes d'un coup : jamais une photo programmée par le modérateur (sa date compte) ni une photo
  // renvoyée au photographe (elle attend sa correction). Une photo proposée, elle, est validée en la publiant.
  const HELD = ['programmee', 'a_reprendre'];

  app.get('/admin/voyages', P('sorties.voir'), async (request, reply) => {
    const authors = names();
    const list = trips.list().filter(tr => sees(request, tr)).map(tr => ({ ...tr, span: span(tr, request.t), who: tr.author_id ? authors.get(tr.author_id)?.name || '' : everyone(request.t),
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
    const inTrip = new Set(tr.days.map(d => `${d.author_id}:${d.day}`));
    // Seulement les sorties des journées du voyage, et les 60 journées les plus récentes à proposer : pas tout l'historique.
    const outings = app.outings.ofDays(tr.days);
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
    const nearby = app.outings.list({ author: tr.author_id ?? null, skip: (a, day) => inTrip.has(`${a}:${day}`) || !request.owns('sorties.gerer', a), max: 60 })
      .filter((o, i, all) => all.findIndex(x => x.author.id === o.author.id && x.day === o.day) === i).slice(0, 60)
      .map(o => ({ author: o.author, day: o.day, when: fmtDay(o.day, request.t), place: o.place, other: index.get(`${o.author.id}:${o.day}`) || null }));
    const people = new Map();                      // rencontres déchiffrées une fois pour toutes les photos
    const photos = trips.photos(tr.id).filter(p => request.owns('photos.voir', p.author_id)).map(p => ({ ...withReady(p), level: app.readiness.state(p, people, request.t).site.level }));
    const publishing = Boolean(request.can('photos.publier'));
    return render(request, reply, 'trip', {
      title: tr.name, tr: { ...tr, span: span(tr, request.t), who: tr.author_id ? authors.get(tr.author_id)?.name || '' : everyone(request.t) },
      days, nearby, photos, manage: manages(request, tr), authors: request.mine('sorties.gerer', repo.authors(), 'id'), allTrips: Boolean(request.scope('sorties.gerer')?.all),
      // Le bouton compte ce que sa route enverra : publier (hors programmées et renvoyées), ou proposer (hors circuit).
      readyDrafts: photos.filter(p => p.status === 'draft' && p.level === 'ok' && (publishing ? !HELD.includes(p.review) : !p.review)).length,
      pagePublish: canPublish(request, tr),
      // Traducteur réglé : « Proposer une traduction » des textes de la page (admin v2).
      translate: app.translator.enabled,
    });
  });

  // Nom, textes (trois langues), photographe (commun : qui gère toutes les sorties).
  app.post('/admin/voyages/:id', W('sorties.gerer'), async (request, reply) => {
    const tr = load(request);
    if (!tr) return reply.callNotFound();
    if (!manages(request, tr)) return app.forbid(request, reply);
    // Page publique : case à cocher (absente du formulaire quand elle est décochée, d'où le champ témoin public_set).
    const body = { ...request.body };
    if (body.public_set) body.public = body.public === 'on' || body.public === true;
    else delete body.public;
    if ('author_id' in body) {
      if (!request.scope('sorties.gerer')?.all) delete body.author_id;
      else body.author_id = Number(body.author_id) || null;
    }
    // Mettre la page en ligne, ou changer les textes d'une page en ligne : le circuit de publication s'applique (un
    // photographe sans « publier sans validation » ne met rien en ligne seul). La retirer du site reste possible.
    const t = request.t;
    // Admin v2 : chaque champ s'enregistre quand on le quitte (fetch JSON, un champ à la fois) ; la réponse est alors en
    // JSON, avec l'erreur sous le champ. Sans script (v1 et v2), le formulaire entier et la redirection, comme avant.
    const json = Boolean(request.headers.accept) && !request.headers.accept.includes('text/html');
    const refuse = text => (json ? reply.code(422).send({ error: text }) : failed(reply, back(tr.id), text));
    if (body.public === true && !tr.public && !canPublish(request, tr)) return refuse(t('Mettre la page du voyage en ligne demande le droit de publier sur le site : demandez-le à un administrateur.'));
    const changes = TEXTS.some(k => k in body && String(body[k] ?? '').replace(/\r\n/g, '\n').trim() !== String(tr[k] ?? ''));
    if (tr.public && body.public !== false && changes && !canEditPublic(request, tr)) return refuse(t('La page du voyage est en ligne : ses textes ne se modifient qu’avec le droit de modifier les photos publiées.'));
    let after;
    try {
      after = trips.update(tr.id, body);
    } catch (err) {
      if (!(err instanceof TripError)) throw err;
      return refuse(request.t.msg(err.message));
    }
    // Journal : les noms des champs changés, jamais leurs valeurs (comme une série ou une photo).
    const COLS = ['name', 'slug', 'name_en', 'name_de', 'intro', 'intro_en', 'intro_de', 'public', 'author_id'];
    noteChanges(request, Object.fromEntries(COLS.map(k => [k, tr[k]])), Object.fromEntries(COLS.map(k => [k, after?.[k]])));
    if (json) return { ok: true, voyage: { name: after.name, slug: after.slug, public: Boolean(after.public) } };
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
    // Une journée déjà dans un autre voyage y est déplacée : seulement si le compte gère aussi cet autre voyage (un
    // photographe ne vide pas un voyage commun en rattachant ses journées au sien).
    const index = trips.dayIndex();
    const before = days.length;
    days = days.filter(d => { const o = index.get(`${d.author_id}:${d.day}`); return !o || o.id === tr.id || manages(request, trips.get(o.id)); });
    if (!days.length) return failed(reply, back(tr.id), before ? request.t('Ces journées sont dans un voyage que vous ne gérez pas.') : request.t('Aucune journée de prise de vue à rattacher.'));
    const n = trips.addDays(tr.id, days);
    return done(reply, back(tr.id), n > 1 ? request.t('{n} journées rattachées au voyage.', { n }) : request.t('{n} journée rattachée au voyage.', { n }));
  });
  app.post('/admin/voyages/:id/journees/retirer', W('sorties.gerer'), async (request, reply) => {
    const tr = load(request);
    if (!tr) return reply.callNotFound();
    if (!manages(request, tr)) return app.forbid(request, reply);
    const [a, d] = String(request.body?.jour || '').split(':');
    if (!request.owns('sorties.gerer', Number(a))) return app.forbid(request, reply);     // ses journées seulement
    trips.removeDay(tr.id, Number(a), d);
    return done(reply, back(tr.id), request.t('Journée retirée du voyage (la sortie reste).'));
  });

  // Depuis une sortie : la rattacher à un voyage, ou l'en détacher.
  app.post('/admin/sorties/:author/:day/voyage', W('sorties.gerer'), async (request, reply) => {
    const a = repo.authors().find(x => x.slug === request.params.author);
    const to = `/admin/sorties/${request.params.author}/${request.params.day}`;
    if (!a || !isDay(request.params.day)) return reply.callNotFound();
    const current = trips.tripOf(a.id, request.params.day);
    const id = Number(request.body?.voyage) || 0;
    // La sortie est dans un voyage que le compte ne gère pas (voyage commun) : ni détachée, ni déplacée.
    if (current && current.id !== id && !manages(request, current)) return failed(reply, to, request.t('Cette sortie est dans un voyage que vous ne gérez pas.'));
    if (!id) {
      if (current) trips.removeDay(current.id, a.id, request.params.day);
      return done(reply, to, request.t('Sortie détachée de son voyage.'));
    }
    const tr = trips.get(id);
    if (tr && !sees(request, tr)) outOfScope(request, 'sorties.gerer', tr.id);
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
    noterLot(request, 'proposees', n);
    return done(reply, back(tr.id), n > 1 ? request.t('{n} photos proposées à la publication.', { n }) : n ? request.t('{n} photo proposée à la publication.', { n }) : request.t('Aucune photo proposée.'));
  });
  app.post('/admin/voyages/:id/publier', W('photos.publier'), async (request, reply) => {
    const tr = load(request);
    if (!tr) return reply.callNotFound();
    const drafts = trips.photos(tr.id).filter(p => p.status === 'draft' && !HELD.includes(p.review) && request.owns('photos.publier', p.author_id)).map(p => p.id);
    const g = app.readiness.gate(drafts);
    const before = repo.setStatuses(Object.fromEntries(g.ok.map(id => [id, 'published'])));
    app.instagram.onPublished(Object.keys(before).map(Number));
    for (const id of Object.keys(before).map(Number)) app.review.clear(id);
    // Compte réel : setStatuses écarte encore une photo refusée par la personne photographiée.
    const n = Object.keys(before).length, rest = drafts.length - n, t = request.t;
    noterLot(request, 'publiees', n);
    const published = n > 1 ? t('{n} photos publiées.', { n }) : n === 1 ? t('1 photo publiée.') : t('0 photo publiée.');
    const left = rest > 1 ? t('{n} restent en brouillon (à vérifier ou bloquées) : ouvrez leur fiche.', { n: rest }) : t('1 reste en brouillon (à vérifier ou bloquée) : ouvrez leur fiche.');
    return done(reply, back(tr.id), `${published}${rest ? ` ${left}` : ''}`);
  });
}
