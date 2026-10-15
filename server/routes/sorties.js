import { TIME } from '../outings.js';

// Admin « Sorties » : une ligne par journée de prise de vue (photographe + jour, découpable), et la fiche d'une
// sortie : ses photos et ses personnes côte à côte, pour trier après la rue.
// Enregistré dans le plugin d'administration (session d'admin exigée, comme le reste de /admin).
export const STATES = { refus: 'refus à appliquer', 'a-trier': 'à trier', terminee: 'terminée' };
// Les mêmes libellés dans la langue de l'admin (t : request.t).
export const statesOf = t => ({ refus: t('refus à appliquer'), 'a-trier': t('à trier'), terminee: t('terminée') });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const hhmm = s => (s === '00:00' ? '' : s.replace(':', ''));
export const outingUrl = o => `/admin/sorties/${o.author.slug}/${o.day}${o.starts && o.starts !== '00:00' ? `?depuis=${hhmm(o.starts)}` : ''}`;

export function registerOutings(app, { repo, render, done, failed, write, withReady }) {
  const out = app.outings;
  const startsOf = v => { const m = /^(\d{2})(\d{2})$/.exec(String(v || '')); return m && TIME.test(`${m[1]}:${m[2]}`) ? `${m[1]}:${m[2]}` : '00:00'; };
  const fmtDay = (day, t) => new Intl.DateTimeFormat(t.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  // Heures : « 13 h », « 13 h 30 » en français ; « 13:30 » en anglais et en allemand.
  const h = (time, t) => (t.lang === 'fr' ? time.replace(':', ' h ').replace(/ h 00$/, ' h') : time);
  const hm = (time, t) => (t.lang === 'fr' ? time.replace(':', ' h ') : time);
  const range = (o, t) => (!o.split ? '' : o.starts === '00:00' ? t('jusqu’à {h}', { h: h(o.ends, t) }) : o.ends ? t('de {from} à {to}', { from: h(o.starts, t), to: h(o.ends, t) }) : t('à partir de {h}', { h: h(o.starts, t) }));

  app.get('/admin/sorties', async (request, reply) => {
    const authors = repo.authors();
    const author = authors.find(a => a.slug === request.query.photographe) || null;
    const state = Object.hasOwn(STATES, request.query.etat) ? request.query.etat : '';
    const all = out.list({ author: author?.id ?? null });
    const list = all.filter(o => !state || o.state === state).slice(0, 200)
      .map(o => ({ ...o, url: outingUrl(o), when: fmtDay(o.day, request.t), range: range(o, request.t), strip: o.photos.slice(0, 4).map(withReady).filter(p => p.ready) }));
    return render(request, reply, 'outings', { title: request.t('Sorties'), list, authors, author, state, STATES: statesOf(request.t),
      counts: Object.fromEntries(Object.keys(STATES).map(k => [k, all.filter(o => o.state === k).length])), total: all.length });
  });

  const load = request => out.get(request.params.author, request.params.day, startsOf(request.query.depuis || request.body?.depuis));
  app.get('/admin/sorties/:author/:day', async (request, reply) => {
    const o = load(request);
    if (!o) return reply.callNotFound();
    return render(request, reply, 'outing', {
      title: request.t('Sortie du {date}', { date: fmtDay(o.day, request.t) }), o: { ...o, photos: o.photos.map(p => ({ ...withReady(p), state: app.readiness.state(p, null, request.t) })), url: outingUrl(o), when: fmtDay(o.day, request.t), range: range(o, request.t) },
      partUrl: p => outingUrl({ ...o, starts: p.starts }), STATES: statesOf(request.t), hhmm,
    });
  });

  const back = o => outingUrl(o);
  app.post('/admin/sorties/:author/:day/couper', write, async (request, reply) => {
    const o = load(request);
    if (!o) return reply.callNotFound();
    const time = String(request.body?.heure || '').trim();
    if (!TIME.test(time) || time === '00:00') return failed(reply, back(o), request.t('Heure de coupure invalide : une heure comme 13:00.'));
    if (!out.cut(o.author.id, o.day, time)) return failed(reply, back(o), request.t('La journée est déjà coupée à {time}.', { time: hm(time, request.t) }));
    return done(reply, outingUrl({ ...o, starts: time }), request.t('Sortie coupée à {time} : les photos et les rencontres d’après forment une nouvelle sortie.', { time: hm(time, request.t) }));
  });
  app.post('/admin/sorties/:author/:day/reunir', write, async (request, reply) => {
    const o = load(request);
    if (!o) return reply.callNotFound();
    out.join(o.author.id, o.day, o.starts);
    return done(reply, outingUrl({ ...o, starts: '00:00' }), request.t('Sorties réunies.'));
  });
  app.post('/admin/sorties/:author/:day/lieu', write, async (request, reply) => {
    const o = load(request);
    if (!o) return reply.callNotFound();
    out.setPlace(o.author.id, o.day, o.starts, request.body?.lieu);
    return done(reply, back(o), request.t('Lieu de la sortie enregistré.'));
  });
  // « Publier les photos prêtes » : les brouillons prêts de la sortie ; à vérifier et bloquées restent en brouillon.
  app.post('/admin/sorties/:author/:day/publier', write, async (request, reply) => {
    const o = load(request);
    if (!o) return reply.callNotFound();
    const drafts = o.photos.filter(p => p.status === 'draft').map(p => p.id);
    const g = app.readiness.gate(drafts);
    const before = repo.setStatuses(Object.fromEntries(g.ok.map(id => [id, 'published'])));
    app.instagram.onPublished(Object.keys(before).map(Number));
    const rest = g.verify.length + g.blocked.length;
    const t = request.t, n = g.ok.length;
    const published = n > 1 ? t('{n} photos publiées.', { n }) : n === 1 ? t('1 photo publiée.') : t('0 photo publiée.');
    const left = rest > 1 ? t('{n} restent en brouillon (à vérifier ou bloquées) : ouvrez leur fiche.', { n: rest }) : t('1 reste en brouillon (à vérifier ou bloquée) : ouvrez leur fiche.');
    return done(reply, back(o), `${published}${rest ? ` ${left}` : ''}`);
  });

  // Photos choisies : liées à une personne de la sortie, ou exclues de la sortie (personne de la liste n'y figure).
  app.post('/admin/sorties/:author/:day/photos', write, async (request, reply) => {
    const o = load(request);
    if (!o) return reply.callNotFound();
    const mine = new Set(o.photos.map(p => p.id));
    const ids = [].concat(request.body?.photo || []).map(Number).filter(id => mine.has(id));
    if (!ids.length) return failed(reply, back(o), request.t('Cochez au moins une photo.'));
    const action = request.body?.action;
    if (action === 'lier') {
      const person = o.people.find(e => e.id === Number(request.body?.personne));
      if (!person) return failed(reply, back(o), request.t('Choisissez la personne qui figure sur ces photos.'));
      app.encounters.link(person.id, ids);
      const w = `${person.ref || request.t('la rencontre')}${person.name ? ` · ${person.name}` : ''}`;
      return done(reply, back(o), ids.length > 1 ? request.t('{n} photos liées à {who}.', { n: ids.length, who: w }) : request.t('1 photo liée à {who}.', { who: w }));
    }
    if (action === 'exclure') {
      for (const e of o.people) for (const id of ids) if (!o.linked.has(`${e.id}:${id}`)) app.encounters.exclude(e.id, id, true);
      return done(reply, back(o), ids.length > 1 ? request.t('{n} photos : personne de la sortie n’y figure (photos liées à la main gardées).', { n: ids.length }) : request.t('1 photo : personne de la sortie n’y figure (photos liées à la main gardées).'));
    }
    if (action === 'retablir') {
      for (const e of o.people) for (const id of ids) app.encounters.exclude(e.id, id, false);
      return done(reply, back(o), ids.length > 1 ? request.t('{n} photos de nouveau couvertes par les accords de la sortie.', { n: ids.length }) : request.t('1 photo de nouveau couverte par les accords de la sortie.'));
    }
    return failed(reply, back(o), request.t('Action inconnue.'));
  });
}
