import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

// Personnes : une personne, plusieurs rencontres (une par sortie). Un accord vaut pour sa sortie, un refus pour tout ;
// rapprochement proposé par adresse e-mail, confirmé à la main ; création d'abord par l'app.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function ctxOf(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const get = url => ctx.app.inject({ url, cookies });
  const post = (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  const julien = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const enc = ctx.app.encounters, people = ctx.app.people;
  const personOf = id => ctx.db.prepare('SELECT person_id FROM encounters WHERE id = ?').pluck().get(id);
  return { ...ctx, get, post, julien, enc, people, personOf };
}

test('une personne par rencontre ; même adresse : rapprochement proposé, confirmé à la main ou écarté', async t => {
  const c = await ctxOf(t);
  const a = c.enc.saveCard(null, { ref: 'J-0600', signed: 'on', scope_site: 'on', met_on: '2026-09-20', author_id: c.julien, name: 'Marie', email: 'Marie@Exemple.fr' });
  const b = c.enc.saveCard(null, { ref: 'J-0610', signed: 'on', scope_site: 'on', scope_instagram: 'on', met_on: '2026-10-13', author_id: c.julien, name: 'Marie D.', email: 'marie@exemple.fr ' });
  const z = c.enc.saveCard(null, { ref: 'J-0620', met_on: '2026-10-13', author_id: c.julien, name: 'Paul', email: 'paul@exemple.fr' });
  const [pa, pb, pz] = [a, b, z].map(c.personOf);
  assert.ok(pa && pb && pz && pa !== pb);
  // Adresse identique (casse et espaces ignorés) : proposé, jamais fait tout seul.
  assert.deepEqual(c.people.suggestions(pa), [pb]);
  assert.deepEqual(c.people.suggestions(pz), []);
  const list = (await c.get('/admin/personnes')).body;
  assert.match(list, /<h1>Personnes photographiées<\/h1>/);
  assert.match(list, /rapprochement proposé/);
  assert.match((await c.get(`/admin/personnes/${pa}`)).body, /C’est la même personne/);
  await c.post(`/admin/personnes/${pa}/fusionner`, { autre: String(pb) });
  assert.equal(c.personOf(b), pa);
  const p = c.people.get(pa);
  assert.equal(p.meetings.length, 2);
  assert.match((await c.get(`/admin/personnes/${pa}`)).body, /2 rencontres/);
  // Séparer : « ce n'est pas elle », et ce rapprochement n'est plus proposé.
  const r = await c.post(`/admin/personnes/${pa}/detacher`, { rencontre: String(b) });
  const nb = c.personOf(b);
  assert.notEqual(nb, pa);
  assert.equal(r.headers.location, `/admin/personnes/${nb}`);
  assert.deepEqual(c.people.suggestions(pa), []);
  // Rattacher une rencontre existante.
  await c.post(`/admin/personnes/${pa}/rattacher`, { rencontre: String(b) });
  assert.equal(c.personOf(b), pa);
});

test('un refus vaut pour toutes les rencontres de la personne ; un accord plus récent ne le défait pas tout seul', async t => {
  const c = await ctxOf(t);
  const a = c.enc.saveCard(null, { ref: 'J-0700', signed: 'on', scope_site: 'on', met_on: '2026-09-20', author_id: c.julien, email: 'l@exemple.fr' });
  const b = c.enc.saveCard(null, { ref: 'J-0710', signed: 'on', scope_site: 'on', met_on: '2026-10-13', author_id: c.julien, email: 'l@exemple.fr' });
  c.people.merge(c.personOf(a), c.personOf(b));
  // Refus sur /bonjour avec le code de la carte J-0700.
  await c.app.inject({ method: 'POST', url: '/bonjour', payload: { ref: `J-0700-${c.enc.codeOf('J-0700')}`, decision: 'refus' }, remoteAddress: '203.0.113.60' });
  assert.equal(c.enc.get(b).refused, 1);                                                   // étendu à l'autre sortie
  assert.ok(c.enc.events(b).some(ev => ev.kind === 'refus_personne'));
  // Plus tard, accord vérifié pour J-0710 : il vaut pour sa sortie, le refus de J-0700 reste.
  await c.app.inject({ method: 'POST', url: '/bonjour', payload: { ref: `J-0710-${c.enc.codeOf('J-0710')}`, decision: 'accord', scope_site: 'on', name: 'L', email: 'l@exemple.fr' }, remoteAddress: '203.0.113.61' });
  assert.deepEqual([c.enc.get(a).refused, c.enc.get(b).refused], [1, 0]);
  assert.equal(c.people.get(c.personOf(a)).refused, true);
});

test('rattacher à une sortie et à des photos ; l’app rattache une nouvelle rencontre ; export et effacement', async t => {
  const c = await ctxOf(t);
  const a = c.enc.saveCard(null, { ref: 'J-0800', signed: 'on', scope_site: 'on', met_on: '2026-09-20', author_id: c.julien, name: 'Inès', email: 'ines@exemple.fr' });
  const pid = c.personOf(a);
  // Une photo de Julien du 13 octobre : liée à la personne → une rencontre de cette sortie est créée, sans décision.
  const photo = c.db.prepare("SELECT id FROM photos ORDER BY id LIMIT 1").pluck().get();
  c.db.prepare("UPDATE photos SET author_id = ?, taken_on = '2026-10-13', taken_time = '15:00', faces = 1 WHERE id = ?").run(c.julien, photo);
  await c.post(`/admin/personnes/${pid}/photos`, { photo: String(photo) });
  const p = c.people.get(pid);
  assert.equal(p.meetings.length, 2);
  const created = p.meetings.find(e => e.met_on === '2026-10-13');
  assert.equal(created.consent, null);
  assert.deepEqual(c.enc.forPhoto(photo).filter(e => e.via === 'lien').map(e => e.id), [created.id]);
  assert.equal(c.app.readiness.state(photo).site.level, 'warn');                         // accord à demander pour cette sortie
  // Ajouter à une sortie (choisie dans la liste).
  await c.post(`/admin/personnes/${pid}/sortie`, { sortie: `${c.julien}|2026-10-01|00:00` });
  assert.equal(c.people.get(pid).meetings.length, 3);
  // L'app : « Déjà rencontrée ? » propose la personne et y rattache la nouvelle rencontre.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(Date.now());
  c.db.prepare("UPDATE encounters SET met_on = ? WHERE id = ?").run(today, a);
  assert.match((await c.get('/admin/rencontre')).body, new RegExp(`<option value="${pid}">Inès · J-0800`));
  const saved = await c.app.encounters.saveApp({ decision: '', email: 'ines@exemple.fr', person_id: String(pid), lang: 'fr' }, { author: { id: c.julien, slug: 'julien', card_prefix: '' } });
  assert.equal(c.personOf(saved.id), pid);
  // Export : toutes les rencontres dans une archive ; effacement : la personne disparaît.
  const zip = await c.get(`/admin/personnes/${pid}/export.zip`);
  assert.equal(zip.headers['content-type'], 'application/zip');
  assert.match(zip.rawPayload.toString('latin1'), /donnees\.json/);
  assert.match(zip.rawPayload.toString('utf8'), /ines@exemple\.fr/);
  const gone = await c.post(`/admin/personnes/${pid}/effacer`);
  assert.equal(gone.headers.location, '/admin/personnes');
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM people WHERE id = ?').pluck().get(pid), 0);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM encounters WHERE ref = 'J-0800'").pluck().get(), 0);
});
