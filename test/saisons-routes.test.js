import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as } from './carnet-helpers.js';
import { createSaisonsAtelier } from '../server/saisons-atelier.js';

const author = (c, slug) => c.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(slug);
const photos = (c, owner = null, n = 2) => c.db.prepare("SELECT id FROM photos WHERE status = 'published' AND (? IS NULL OR author_id = ?) ORDER BY id LIMIT ?").pluck().all(owner, owner, n);
function season(c, { owner = null, ids = photos(c), title = 'Une saison de test', starts = Date.now() + 2 * 86400000 } = {}) {
  const id = c.app.saisons.create({ title, title_en: 'A test exhibition', title_de: 'Eine Testausstellung', intro: 'Une intention.', intro_en: 'An intention.', intro_de: 'Eine Absicht.', author_id: owner, opens_at: starts, closes_at: starts + 7 * 86400000 });
  c.app.saisons.setPhotos(id, ids);
  c.app.saisons.update(id, { cover_id: ids[0] ?? null });
  return id;
}
function form(c, id, more = {}) {
  const s = c.app.saisons.get(id), a = createSaisonsAtelier({ db: c.db, saisons: c.app.saisons, zone: 'UTC' });
  return { ...a.fields(s), version: String(s.version), 'photo_ids[]': s.photo_ids.map(String), ...Object.fromEntries(s.photo_ids.map((p, i) => [`position_${p}`, String(i + 1)])), ...more };
}

test('atelier raccordé : créer, traduire et ordonner persiste ; les textes et cartels sont échappés dans les deux administrations', async t => {
  const c = await setup(t, { seeded: true });
  const admin = as(c, { sub: 'saisons-admin', roles: ['admin'] });
  const created = await admin.post('/admin/saisons', { title: 'Une saison <em>neutre</em>', author_id: String(author(c, 'sebastien')) });
  assert.equal(created.statusCode, 303, created.body);
  const id = Number(created.headers.location.split('/').at(-1));
  assert.equal(c.app.saisons.get(id).author_id, author(c, 'sebastien'));
  const ids = photos(c, null, 2);
  const added = await admin.post(`/admin/saisons/${id}`, form(c, id, { 'ajouter[]': ids.map(String), subtitle: 'Un sous-titre', subtitle_en: 'A subtitle', subtitle_de: 'Ein Untertitel' }));
  assert.equal(added.statusCode, 303, added.body);
  const saved = await admin.post(`/admin/saisons/${id}`, form(c, id, {
    title_en: 'A neutral season', title_de: 'Eine neutrale Saison', intro: 'Une intention.', intro_en: 'An intention.', intro_de: 'Eine Absicht.',
    prologue: 'Un prologue.', prologue_en: 'A prologue.', prologue_de: 'Ein Prolog.', conclusion: 'Une conclusion.', conclusion_en: 'A conclusion.', conclusion_de: 'Ein Schluss.',
    cover_id: String(ids[1]), [`position_${ids[0]}`]: '2', [`position_${ids[1]}`]: '1', [`cartel_${ids[0]}`]: 'Un cartel <b>neutre</b>.', [`cartel_${ids[0]}_en`]: 'A neutral caption.', [`cartel_${ids[0]}_de`]: 'Eine neutrale Beschriftung.',
  }));
  assert.equal(saved.statusCode, 303, saved.body);
  const actual = c.app.saisons.get(id);
  assert.deepEqual(actual.photo_ids, ids.slice().reverse());
  assert.equal(actual.cover_id, ids[1]); assert.equal(actual.prologue_en, 'A prologue.');
  assert.equal(actual.cartels.find(p => p.photo_id === ids[0]).cartel, 'Un cartel <b>neutre</b>.');
  for (const version of ['v1', 'v2']) {
    // La préférence est écrite par sa route, pour conserver le même contrat que le menu du compte.
    await admin.post('/admin/version', { version, back: `/admin/saisons/${id}` });
    const page = await admin.get(`/admin/saisons/${id}`);
    assert.equal(page.statusCode, 200, page.body);
    assert.match(page.body, /Une saison &lt;em&gt;neutre&lt;\/em&gt;/);
    assert.match(page.body, /Un cartel &lt;b&gt;neutre&lt;\/b&gt;/);
    assert.match(page.body, /name="cover_id"/);
    assert.match(page.body, /name="cartel_\d+_de"/);
    assert.doesNotMatch(page.body, /style="/);
  }
  const preview = await admin.get(`/admin/saisons/${id}/apercu?langue=en`);
  assert.equal(preview.statusCode, 200);
  assert.match(preview.headers['cache-control'], /no-store/);
  assert.doesNotMatch(preview.headers['cache-control'], /public/);
  assert.equal(preview.headers['x-robots-tag'], 'noindex');
  assert.match(preview.body, /A prologue\./); assert.match(preview.body, /A neutral caption\./);
  const audit = c.db.prepare("SELECT detail FROM audit_log WHERE action = 'POST /admin/saisons/:id'").pluck().all().join(' ');
  assert.match(audit, /cartels/); assert.doesNotMatch(audit, /Un cartel|A prologue|Un sous-titre/);
});

test('portées : le photographe ne consulte ni ne modifie les saisons ou photos d’un autre ; relecteur lit, modérateur refusé', async t => {
  const c = await setup(t, { seeded: true });
  const sebId = author(c, 'sebastien'), julienId = author(c, 'julien');
  const seb = as(c, { sub: 'saisons-seb', roles: ['photographe'], author: 'sebastien' });
  const rel = as(c, { sub: 'saisons-rel', roles: ['relecteur'] });
  const mod = as(c, { sub: 'saisons-mod', roles: ['moderateur'] });
  const mine = season(c, { owner: sebId, ids: photos(c, sebId, 1), title: 'Exposition de Sébastien' });
  const other = season(c, { owner: julienId, ids: photos(c, julienId, 1), title: 'Exposition de Julien' });
  const list = await seb.get('/admin/saisons');
  assert.equal(list.statusCode, 200); assert.match(list.body, /Exposition de Sébastien/); assert.doesNotMatch(list.body, /Exposition de Julien/);
  for (const url of [`/admin/saisons/${other}`, `/admin/saisons/${other}/apercu`, `/admin/saisons/999999`]) assert.equal((await seb.get(url)).statusCode, 404, url);
  assert.equal((await seb.post(`/admin/saisons/${other}`, form(c, other, { title: 'Interdit' }))).statusCode, 404);
  const before = c.app.saisons.get(mine);
  const foreign = photos(c, julienId, 1)[0];
  assert.equal((await seb.post(`/admin/saisons/${mine}`, form(c, mine, { title: 'Ne pas écrire', 'ajouter[]': String(foreign) }))).statusCode, 403);
  assert.deepEqual(c.app.saisons.get(mine), before);
  assert.equal((await seb.post(`/admin/saisons/${mine}`, form(c, mine, { author_id: String(julienId) }))).statusCode, 403);
  const editor = await seb.get(`/admin/saisons/${mine}`);
  assert.doesNotMatch(editor.body, new RegExp(`name="ajouter\\[\\]" value="${foreign}"`));
  assert.equal((await rel.get(`/admin/saisons/${mine}`)).statusCode, 200);
  assert.equal((await rel.post(`/admin/saisons/${mine}`, form(c, mine))).statusCode, 403);
  assert.equal((await mod.get('/admin/saisons')).statusCode, 403);
  const noAuthor = as(c, { sub: 'saisons-sans-photographe', roles: ['photographe'] });
  assert.equal((await noAuthor.post('/admin/saisons', { title: 'Sans photographe' })).statusCode, 422);
  assert.equal(c.app.saisons.list().length, 2);
});

test('écritures : session, permission et CSRF requis ; types forgés refusés sans effet', async t => {
  const events = [];
  const c = await setup(t, { seeded: true,
    env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-factice-saisons-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { send: async body => { events.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false },
  });
  const admin = as(c, { sub: 'saisons-admin-securite', roles: ['admin'] });
  const id = season(c);
  const routes = c.app.routeList.filter(r => r.url.startsWith('/admin/saisons'));
  assert.ok(routes.length >= 10); assert.ok(routes.every(r => r.perm?.startsWith('saisons.')));
  for (const url of ['/admin/saisons', `/admin/saisons/${id}`, `/admin/saisons/${id}/programmer`, `/admin/saisons/${id}/ouvrir`, `/admin/saisons/${id}/annuler`, `/admin/saisons/${id}/retirer`, '/admin/saisons/accueil'])
    assert.equal((await c.app.inject({ method: 'POST', url, cookies: admin.cookies, payload: { title: 'Sans CSRF' } })).statusCode, 403, url);
  assert.ok([302, 303, 401].includes((await c.app.inject('/admin/saisons')).statusCode));
  const before = c.app.saisons.get(id);
  for (const payload of [{ title: ['répété'] }, { version: {} }, { faire: 'publier' }, { 'photo_ids[]': ['-1'] }])
    assert.equal((await admin.post(`/admin/saisons/${id}`, { ...form(c, id), ...payload })).statusCode, 422);
  assert.deepEqual(c.app.saisons.get(id), before);
  c.app.securite.retryNow?.(); await c.app.securite.flush?.();
  assert.ok(events.some(e => e.type === 'input_validation_fail' && e.detail.objet === 'saison'));
  assert.ok(!JSON.stringify(events).includes('Une saison de test'));
});

test('erreurs : saisie conservée et conflit 409 ; programmer requiert trois langues puis annuler ou retirer suit le cycle', async t => {
  const c = await setup(t, { seeded: true });
  const admin = as(c, { sub: 'saisons-admin-cycle', roles: ['admin'] });
  const id = season(c), original = form(c, id);
  const selected = photos(c, null, 3)[2];
  const invalid = await admin.post(`/admin/saisons/${id}`, { ...original, title: 'Titre conservé', closes_at: '2026-02-31T12:00', 'ajouter[]': String(selected) });
  assert.equal(invalid.statusCode, 422); assert.match(invalid.body, /value="Titre conservé"/); assert.match(invalid.body, /aria-invalid="true"/);
  assert.match(invalid.body, new RegExp(`name="ajouter\\[\\]\" value="${selected}\" form="saison-form" checked`));
  assert.equal(c.app.saisons.get(id).title, 'Une saison de test');
  assert.equal((await admin.post(`/admin/saisons/${id}`, { ...original, title: 'Dernier titre' })).statusCode, 303);
  const saved = c.app.saisons.get(id);
  const conflict = await admin.post(`/admin/saisons/${id}`, { ...original, title: 'Version ancienne' });
  assert.equal(conflict.statusCode, 409); assert.match(conflict.body, /value="Version ancienne"/);
  assert.match(conflict.body, new RegExp(`name="version" value="${original.version}"`));
  assert.deepEqual(c.app.saisons.get(id), saved);
  c.app.saisons.update(id, { title_de: '' });
  const missing = await admin.post(`/admin/saisons/${id}/programmer`, { version: String(c.app.saisons.get(id).version) });
  assert.equal(missing.statusCode, 422); assert.equal(c.app.saisons.get(id).state, 'brouillon');
  c.app.saisons.update(id, { title_de: 'Wieder vollständig' });
  let version = c.app.saisons.get(id).version;
  assert.equal((await admin.get(`/admin/saisons/${id}/confirmer?action=programmer`)).statusCode, 200);
  assert.equal((await admin.post(`/admin/saisons/${id}/programmer`, { version: String(version) })).statusCode, 303);
  assert.equal(c.app.saisons.get(id).state, 'programme');
  const frozen = c.app.saisons.get(id);
  assert.equal((await admin.post(`/admin/saisons/${id}`, form(c, id, { title: 'Interdit après validation' }))).statusCode, 409);
  assert.deepEqual(c.app.saisons.get(id), frozen);
  version = c.app.saisons.get(id).version;
  assert.equal((await admin.post(`/admin/saisons/${id}/annuler`, { version: String(version) })).statusCode, 303);
  assert.equal(c.app.saisons.get(id).state, 'brouillon');
  assert.equal((await admin.post(`/admin/saisons/${id}/programmer`, { version: String(c.app.saisons.get(id).version) })).statusCode, 303);
  version = c.app.saisons.get(id).version;
  assert.equal((await admin.post(`/admin/saisons/${id}/retirer`, { version: String(version), reason: 'texte libre' })).statusCode, 422);
  assert.equal((await admin.post(`/admin/saisons/${id}/retirer`, { version: String(version), reason: 'choix_editorial' })).statusCode, 303);
  assert.equal(c.app.saisons.get(id).state, 'retire');
  const audit = c.db.prepare("SELECT status, detail FROM audit_log WHERE action = 'POST /admin/saisons/:id/retirer' ORDER BY id DESC LIMIT 1").get();
  assert.equal(audit.status, 303); assert.match(audit.detail, /motif : choix_editorial/);
});

test('choix d’accueil : administrateur seul, saison validée et identifiant contrôlé', async t => {
  const c = await setup(t, { seeded: true });
  const admin = as(c, { sub: 'saisons-admin-accueil', roles: ['admin'] });
  const seb = as(c, { sub: 'saisons-photographe-accueil', roles: ['photographe'], author: 'sebastien' });
  const rel = as(c, { sub: 'saisons-rel-accueil', roles: ['relecteur'] });
  const id = season(c);
  const setting = () => c.db.prepare("SELECT value FROM settings WHERE key = 'saison_accueil'").pluck().get();
  assert.equal((await admin.post('/admin/saisons/accueil', { saison_id: String(id) })).statusCode, 422); assert.equal(setting(), undefined);
  c.app.saisons.schedule(id);
  for (const who of [seb, rel]) {
    assert.equal((await who.post('/admin/saisons/accueil', { saison_id: String(id) })).statusCode, 403);
    assert.doesNotMatch((await who.get('/admin/saisons')).body, /action="\/admin\/saisons\/accueil"/);
  }
  assert.equal((await admin.post('/admin/saisons/accueil', { saison_id: String(id) })).statusCode, 303); assert.equal(JSON.parse(setting()), id);
  assert.match((await admin.get('/admin/saisons')).body, /action="\/admin\/saisons\/accueil"/);
  assert.equal((await admin.post('/admin/saisons/accueil', { saison_id: ['1'] })).statusCode, 422); assert.equal(JSON.parse(setting()), id);
  assert.equal((await admin.post('/admin/saisons/accueil', { saison_id: '' })).statusCode, 303); assert.equal(JSON.parse(setting()), null);
});

test('cartels : un formulaire légitime de plus de 1 Mio reste borné, atomique et persistant', async t => {
  const c = await setup(t);
  c.db.prepare("INSERT INTO authors (id, slug, name) VALUES (1, 'auteur-neutre', 'Auteur neutre')").run();
  c.db.prepare("INSERT INTO categories (id, slug, name) VALUES (1, 'serie-neutre', 'Série neutre')").run();
  const insert = c.db.prepare("INSERT INTO photos (id, slug, title, category_id, author_id, file, width, height, status, faces) VALUES (?, ?, ?, 1, 1, ?, 1200, 800, 'published', 0)");
  const ids = Array.from({ length: 90 }, (_, i) => i + 1);
  for (const id of ids) insert.run(id, `neutre-${id}`, `Photo neutre ${id}`, `neutre-${id}.jpg`);
  const admin = as(c, { sub: 'saisons-admin-volume', roles: ['admin'] });
  const id = season(c, { owner: 1, ids });
  const body = form(c, id), text = '色'.repeat(500);
  for (const pid of ids) for (const suffix of ['', '_en', '_de']) body[`cartel_${pid}${suffix}`] = text;
  const payload = new URLSearchParams([['_csrf', admin.csrf], ...Object.entries(body).flatMap(([key, value]) => [].concat(value).map(v => [key, v]))]).toString();
  assert.ok(Buffer.byteLength(payload) > 1024 * 1024);
  assert.ok(Buffer.byteLength(payload) < 8 * 1024 * 1024);
  const sent = await c.app.inject({ method: 'POST', url: `/admin/saisons/${id}`, cookies: admin.cookies, headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' }, payload });
  assert.equal(sent.statusCode, 303, sent.body);
  const actual = c.app.saisons.get(id);
  assert.equal(actual.cartels.length, 90); assert.ok(actual.cartels.every(p => p.cartel === text && p.cartel_en === text && p.cartel_de === text));
  const before = c.app.saisons.get(id);
  assert.equal((await admin.json(`/admin/saisons/${id}`, { padding: 'x'.repeat(8 * 1024 * 1024) })).statusCode, 413);
  assert.deepEqual(c.app.saisons.get(id), before);
});
