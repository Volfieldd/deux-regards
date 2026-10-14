import { TIME } from '../outings.js';

// Admin « Sorties » : une ligne par journée de prise de vue (photographe + jour, découpable), et la fiche d'une
// sortie : ses photos et ses personnes côte à côte, pour trier après la rue.
// Enregistré dans le plugin d'administration (session d'admin exigée, comme le reste de /admin).
export const STATES = { refus: 'refus à appliquer', 'a-trier': 'à trier', terminee: 'terminée' };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const hhmm = s => (s === '00:00' ? '' : s.replace(':', ''));
export const outingUrl = o => `/admin/sorties/${o.author.slug}/${o.day}${o.starts && o.starts !== '00:00' ? `?depuis=${hhmm(o.starts)}` : ''}`;

export function registerOutings(app, { repo, render, done, failed, write, withReady }) {
  const out = app.outings;
  const startsOf = v => { const m = /^(\d{2})(\d{2})$/.exec(String(v || '')); return m && TIME.test(`${m[1]}:${m[2]}`) ? `${m[1]}:${m[2]}` : '00:00'; };
  const fmtDay = day => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  const h = t => t.replace(':', ' h ').replace(/ h 00$/, ' h');
  const range = o => (!o.split ? '' : o.starts === '00:00' ? `jusqu’à ${h(o.ends)}` : o.ends ? `de ${h(o.starts)} à ${h(o.ends)}` : `à partir de ${h(o.starts)}`);

  app.get('/admin/sorties', async (request, reply) => {
    const authors = repo.authors();
    const author = authors.find(a => a.slug === request.query.photographe) || null;
    const state = Object.hasOwn(STATES, request.query.etat) ? request.query.etat : '';
    const all = out.list({ author: author?.id ?? null });
    const list = all.filter(o => !state || o.state === state).slice(0, 200)
      .map(o => ({ ...o, url: outingUrl(o), when: fmtDay(o.day), range: range(o), strip: o.photos.slice(0, 4).map(withReady).filter(p => p.ready) }));
    return render(request, reply, 'outings', { title: 'Sorties', list, authors, author, state, STATES,
      counts: Object.fromEntries(Object.keys(STATES).map(k => [k, all.filter(o => o.state === k).length])), total: all.length });
  });

  const load = request => out.get(request.params.author, request.params.day, startsOf(request.query.depuis || request.body?.depuis));
  app.get('/admin/sorties/:author/:day', async (request, reply) => {
    const o = load(request);
    if (!o) return reply.callNotFound();
    return render(request, reply, 'outing', {
      title: `Sortie du ${fmtDay(o.day)}`, o: { ...o, photos: o.photos.map(p => ({ ...withReady(p), state: app.readiness.state(p) })), url: outingUrl(o), when: fmtDay(o.day), range: range(o) },
      partUrl: p => outingUrl({ ...o, starts: p.starts }), STATES, hhmm,
    });
  });

  const back = o => outingUrl(o);
  app.post('/admin/sorties/:author/:day/couper', write, async (request, reply) => {
    const o = load(request);
    if (!o) return reply.callNotFound();
    const time = String(request.body?.heure || '').trim();
    if (!TIME.test(time) || time === '00:00') return failed(reply, back(o), 'Heure de coupure invalide : une heure comme 13:00.');
    if (!out.cut(o.author.id, o.day, time)) return failed(reply, back(o), `La journée est déjà coupée à ${time.replace(':', ' h ')}.`);
    return done(reply, outingUrl({ ...o, starts: time }), `Sortie coupée à ${time.replace(':', ' h ')} : les photos et les rencontres d’après forment une nouvelle sortie.`);
  });
  app.post('/admin/sorties/:author/:day/reunir', write, async (request, reply) => {
    const o = load(request);
    if (!o) return reply.callNotFound();
    out.join(o.author.id, o.day, o.starts);
    return done(reply, outingUrl({ ...o, starts: '00:00' }), 'Sorties réunies.');
  });
  app.post('/admin/sorties/:author/:day/lieu', write, async (request, reply) => {
    const o = load(request);
    if (!o) return reply.callNotFound();
    out.setPlace(o.author.id, o.day, o.starts, request.body?.lieu);
    return done(reply, back(o), 'Lieu de la sortie enregistré.');
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
    return done(reply, back(o), `${g.ok.length} photo${g.ok.length > 1 ? 's publiées' : ' publiée'}.${rest ? ` ${rest} reste${rest > 1 ? 'nt' : ''} en brouillon (à vérifier ou bloquée${rest > 1 ? 's' : ''}) : ouvrez leur fiche.` : ''}`);
  });

  // Photos choisies : liées à une personne de la sortie, ou exclues de la sortie (personne de la liste n'y figure).
  app.post('/admin/sorties/:author/:day/photos', write, async (request, reply) => {
    const o = load(request);
    if (!o) return reply.callNotFound();
    const mine = new Set(o.photos.map(p => p.id));
    const ids = [].concat(request.body?.photo || []).map(Number).filter(id => mine.has(id));
    if (!ids.length) return failed(reply, back(o), 'Cochez au moins une photo.');
    const action = request.body?.action;
    if (action === 'lier') {
      const person = o.people.find(e => e.id === Number(request.body?.personne));
      if (!person) return failed(reply, back(o), 'Choisissez la personne qui figure sur ces photos.');
      app.encounters.link(person.id, ids);
      return done(reply, back(o), `${ids.length} photo${ids.length > 1 ? 's liées' : ' liée'} à ${person.ref || 'la rencontre'}${person.name ? ` · ${person.name}` : ''}.`);
    }
    if (action === 'exclure') {
      for (const e of o.people) for (const id of ids) if (!o.linked.has(`${e.id}:${id}`)) app.encounters.exclude(e.id, id, true);
      return done(reply, back(o), `${ids.length} photo${ids.length > 1 ? 's' : ''} : personne de la sortie n’y figure (photos liées à la main gardées).`);
    }
    if (action === 'retablir') {
      for (const e of o.people) for (const id of ids) app.encounters.exclude(e.id, id, false);
      return done(reply, back(o), `${ids.length} photo${ids.length > 1 ? 's' : ''} de nouveau couverte${ids.length > 1 ? 's' : ''} par les accords de la sortie.`);
    }
    return failed(reply, back(o), 'Action inconnue.');
  });
}
