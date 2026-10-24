import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as } from './carnet-helpers.js';

const author = (c, slug) => c.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(slug);
const photos = (c, owner = null) => c.db.prepare("SELECT id FROM photos WHERE status = 'published' AND (? IS NULL OR author_id = ?) ORDER BY id LIMIT 2").pluck().all(owner, owner);
const reportTexts = { title: 'Bilan <em>neutre</em>', title_en: 'A neutral retrospective', title_de: 'Ein neutraler Rückblick', body: 'Un récit <b>neutre</b>.', body_en: 'A neutral account.', body_de: 'Ein neutraler Bericht.' };
const collectionTexts = { title: 'Un prolongement', title_en: 'A permanent exhibition', title_de: 'Eine Dauerausstellung', subtitle: '', subtitle_en: '', subtitle_de: '', intro: 'Une intention.', intro_en: 'An intention.', intro_de: 'Eine Absicht.', prologue: '', prologue_en: '', prologue_de: '', conclusion: '', conclusion_en: '', conclusion_de: '' };
function season(c, { owner = null, ids = photos(c), close = true } = {}) {
  const now = Date.now();
  const id = c.app.saisons.create({ author_id: owner, title: 'Exposition neutre', title_en: 'Neutral exhibition', title_de: 'Neutrale Ausstellung', intro: 'Une intention.', intro_en: 'An intention.', intro_de: 'Eine Absicht.', opens_at: now - 86400000, closes_at: now + 86400000 });
  c.app.saisons.setPhotos(id, ids); c.app.saisons.update(id, { cover_id: ids[0] });
  if (close) {
    c.app.saisons.open(id);
    // Le calendrier du jeu jetable simule une exposition qui vient de fermer.
    c.db.prepare('UPDATE saisons SET closes_at = ? WHERE id = ?').run(now - 60000, id);
  }
  return id;
}
const selected = ids => ({ 'photo_ids[]': ids.map(String), ...Object.fromEntries(ids.map((id, i) => [`position_${id}`, String(i + 1)])) });
const reportForm = (c, id, more = {}) => { const r = c.app.saisonsBilans.getReport(id); return { ...reportTexts, version: String(r.version), ...selected(r.photo_ids), ...more }; };
const collectionForm = (c, id, ids, more = {}) => {
  const row = c.app.saisonsBilans.getCollection(id);
  return { ...collectionTexts, version: String(row.version), cover_id: String(ids[0] ?? ''), ...selected(ids),
    ...Object.fromEntries(ids.flatMap(pid => ['', '_en', '_de'].map(suffix => [`cartel_${pid}${suffix}`, '']))), ...more };
};
function publishedReport(c, sid, ids = c.app.saisons.get(sid).photo_ids) {
  const id = c.app.saisonsBilans.createReport(sid, { ...reportTexts, photo_ids: ids });
  c.app.saisonsBilans.publishReport(id, { version: 1 }); return id;
}

test('bilans raccordés : préparer, publier et rectifier crée deux objets immuables ; v1 et v2 échappent les textes', async t => {
  const c = await setup(t, { seeded: true }), admin = as(c, { sub: 'bilans-admin-cycle', roles: ['admin'] }), sid = season(c);
  const base = `/admin/saisons/${sid}/bilans`, created = await admin.post(base, { title: reportTexts.title });
  assert.equal(created.statusCode, 303, created.body);
  const id = Number(created.headers.location.split('/').at(-1)), url = `${base}/${id}`;
  assert.equal((await admin.post(url, reportForm(c, id, selected(c.app.saisons.get(sid).photo_ids)))).statusCode, 303);
  for (const version of ['v1', 'v2']) {
    await admin.post('/admin/version', { version, back: url });
    const page = await admin.get(url);
    assert.equal(page.statusCode, 200, page.body); assert.match(page.headers['cache-control'], /no-store/);
    assert.equal(page.headers['referrer-policy'], 'no-referrer'); assert.equal(page.headers['x-robots-tag'], 'noindex');
    assert.match(page.body, /Bilan &lt;em&gt;neutre&lt;\/em&gt;/); assert.match(page.body, /Un récit &lt;b&gt;neutre&lt;\/b&gt;/); assert.doesNotMatch(page.body, /style="/);
  }
  const confirm = await admin.get(`${url}/publier`); assert.equal(confirm.statusCode, 200); assert.match(confirm.body, new RegExp(`action="${url}/publier"`));
  assert.equal((await admin.post(`${url}/publier`, { version: String(c.app.saisonsBilans.getReport(id).version) })).statusCode, 303);
  const frozen = c.app.saisonsBilans.getReport(id);
  assert.equal((await admin.post(url, reportForm(c, id, { body: 'Réécriture interdite' }))).statusCode, 409);
  assert.deepEqual(c.app.saisonsBilans.getReport(id), frozen);
  const corrected = await admin.post(base, { title: 'Rectificatif', rectifies_id: String(id) });
  assert.equal(corrected.statusCode, 303); const correctionId = Number(corrected.headers.location.split('/').at(-1));
  assert.equal((await admin.post(corrected.headers.location, reportForm(c, correctionId, { title: 'Rectificatif' }))).statusCode, 303);
  assert.equal((await admin.post(`${corrected.headers.location}/publier`, { version: String(c.app.saisonsBilans.getReport(correctionId).version) })).statusCode, 303);
  assert.deepEqual(c.app.saisonsBilans.publicForSaison(sid).map(r => r.rectifies_id), [null, id]);
  assert.deepEqual(c.app.saisonsBilans.getReport(id), frozen);
});

test('bilans raccordés : les deux administrations permettent un rectificatif après le retrait du bilan initial', async t => {
  const c = await setup(t, { seeded: true }), admin = as(c, { sub: 'bilans-admin-retrait', roles: ['admin'] }), sid = season(c);
  const id = publishedReport(c, sid), base = `/admin/saisons/${sid}/bilans`, url = `${base}/${id}`;
  const before = c.app.saisonsBilans.getReport(id);
  assert.equal((await admin.post(`${url}/retirer`, { version: String(before.version) })).statusCode, 303);
  const retired = c.app.saisonsBilans.getReport(id);
  for (const version of ['v1', 'v2']) {
    await admin.post('/admin/version', { version, back: base });
    const page = await admin.get(base);
    assert.equal(page.statusCode, 200); assert.match(page.body, new RegExp(`<option value="${id}">`));
    assert.match(page.body, /Bilan &lt;em&gt;neutre&lt;\/em&gt;\s· Retiré/);
  }
  const created = await admin.post(base, { title: 'Relève rectificative', rectifies_id: String(id) });
  assert.equal(created.statusCode, 303, created.body); const correction = Number(created.headers.location.split('/').at(-1));
  assert.equal((await admin.post(created.headers.location, reportForm(c, correction, { title: 'Relève rectificative' }))).statusCode, 303);
  assert.equal((await admin.post(`${created.headers.location}/publier`, { version: String(c.app.saisonsBilans.getReport(correction).version) })).statusCode, 303);
  assert.deepEqual(c.app.saisonsBilans.getReport(id), retired);
  assert.deepEqual(c.app.saisonsBilans.publicForSaison(sid).map(r => ({ id: r.id, rectificatif: r.rectificatif, rectifies_id: r.rectifies_id })), [{ id: correction, rectificatif: true, rectifies_id: null }]);
});

test('collections raccordées : accrochage, couverture et cartels propres persistent puis se figent à la publication', async t => {
  const c = await setup(t, { seeded: true }), admin = as(c, { sub: 'bilans-admin-collection', roles: ['admin'] }), sid = season(c), ids = c.app.saisons.get(sid).photo_ids;
  const rid = publishedReport(c, sid), created = await admin.post(`/admin/saisons/${sid}/bilans/${rid}/collections`, { title: 'Un prolongement' });
  assert.equal(created.statusCode, 303, created.body); const id = Number(created.headers.location.split('/').at(-1)), url = created.headers.location;
  const ordered = ids.slice().reverse(), input = collectionForm(c, id, ordered, { [`cartel_${ordered[0]}`]: 'Un contexte <b>distinct</b>.', [`cartel_${ordered[0]}_en`]: 'A distinct context.', [`cartel_${ordered[0]}_de`]: 'Ein eigener Kontext.' });
  assert.equal((await admin.post(url, input)).statusCode, 303);
  const saved = c.app.saisonsBilans.getCollection(id); assert.deepEqual(saved.photo_ids, ordered); assert.equal(saved.cover_id, ordered[0]);
  for (const version of ['v1', 'v2']) {
    await admin.post('/admin/version', { version, back: url }); const page = await admin.get(url);
    assert.equal(page.statusCode, 200, page.body); assert.match(page.body, /Un contexte &lt;b&gt;distinct&lt;\/b&gt;/);
    assert.match(page.body, /name="cover_id"/); assert.match(page.body, new RegExp(`name="cartel_${ordered[0]}_de"`));
  }
  assert.equal((await admin.post(`${url}/publier`, { version: String(saved.version) })).statusCode, 303);
  const permanent = c.app.saisonsBilans.publicCollectionBySlug(saved.slug, { lang: 'en' });
  assert.equal(permanent.title, 'A permanent exhibition'); assert.deepEqual(permanent.photo_ids, ordered); assert.equal(permanent.origin.bilan_id, rid);
  const frozen = c.app.saisonsBilans.getCollection(id);
  assert.equal((await admin.post(url, collectionForm(c, id, ids))).statusCode, 409); assert.deepEqual(c.app.saisonsBilans.getCollection(id), frozen);
  assert.equal((await admin.post(`${url}/retirer`, { version: String(frozen.version) })).statusCode, 303);
  assert.equal(c.app.saisonsBilans.publicCollectionBySlug(saved.slug), null);
});

test('bilans : portées OWN, lecture du relecteur et publication réservée à l’administrateur', async t => {
  const c = await setup(t, { seeded: true }), sebId = author(c, 'sebastien'), julienId = author(c, 'julien');
  const seb = as(c, { sub: 'bilans-seb', roles: ['photographe'], author: 'sebastien' }), rel = as(c, { sub: 'bilans-relecteur', roles: ['relecteur'] });
  const mine = season(c, { owner: sebId, ids: photos(c, sebId) }), other = season(c, { owner: julienId, ids: photos(c, julienId) });
  const rid = c.app.saisonsBilans.createReport(mine, reportTexts), foreign = publishedReport(c, other);
  for (const url of [`/admin/saisons/${other}/bilans`, `/admin/saisons/${other}/bilans/${foreign}`, `/admin/saisons/${mine}/bilans/${foreign}`]) assert.equal((await seb.get(url)).statusCode, 404);
  assert.equal((await seb.post(`/admin/saisons/${other}/bilans`, { title: 'Interdit' })).statusCode, 404);
  assert.equal((await seb.post(`/admin/saisons/${mine}/bilans/${rid}`, reportForm(c, rid, selected(photos(c, julienId))))).statusCode, 403);
  assert.deepEqual(c.app.saisonsBilans.getReport(rid).photo_ids, []);
  assert.equal((await seb.post(`/admin/saisons/${mine}/bilans/${rid}`, reportForm(c, rid, selected(photos(c, sebId))))).statusCode, 303);
  assert.equal((await seb.post(`/admin/saisons/${mine}/bilans/${rid}/publier`, { version: String(c.app.saisonsBilans.getReport(rid).version) })).statusCode, 403);
  assert.equal((await rel.get(`/admin/saisons/${mine}/bilans/${rid}`)).statusCode, 200);
  assert.equal((await rel.post(`/admin/saisons/${mine}/bilans`, { title: 'Interdit' })).statusCode, 403);
  const draft = season(c, { owner: sebId, ids: photos(c, sebId), close: false });
  assert.equal((await seb.post(`/admin/saisons/${draft}/bilans`, { title: 'Bilan à préparer' })).statusCode, 303);
});

test('bilans : CSRF et types forgés bloquent les écritures ; Vigie et journal ne reçoivent pas les récits', async t => {
  const events = [], c = await setup(t, { seeded: true,
    env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-factice-bilans-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { send: async body => events.push(...JSON.parse(body).lot), timers: false, pollDecisions: false },
  });
  const admin = as(c, { sub: 'bilans-admin-securite', roles: ['admin'] }), sid = season(c), rid = publishedReport(c, sid), cid = c.app.saisonsBilans.createCollection(rid, collectionTexts);
  const draft = c.app.saisonsBilans.createReport(sid, reportTexts), base = `/admin/saisons/${sid}`, before = c.app.saisonsBilans.getReport(draft);
  const paths = [`${base}/bilans`, `${base}/bilans/${draft}`, `${base}/bilans/${rid}/collections`, `${base}/collections/${cid}`, ...['publier', 'retirer'].flatMap(action => [`${base}/bilans/${rid}/${action}`, `${base}/collections/${cid}/${action}`])];
  for (const url of paths) assert.equal((await c.app.inject({ method: 'POST', url, cookies: admin.cookies, payload: { version: '1' } })).statusCode, 403, url);
  for (const extra of [{ title: ['répété'] }, { version: {} }, { state: 'publie' }, { 'photo_ids[]': ['-1'] }]) assert.equal((await admin.post(`${base}/bilans/${draft}`, reportForm(c, draft, extra))).statusCode, 422);
  assert.deepEqual(c.app.saisonsBilans.getReport(draft), before);
  assert.equal((await admin.post(`${base}/bilans/${draft}`, reportForm(c, draft, { body: 'Récit confidentiel jamais journalisé.' }))).statusCode, 303);
  const detail = c.db.prepare("SELECT detail FROM audit_log WHERE action = 'POST /admin/saisons/:id/bilans/:bilan'").pluck().all().join(' ');
  assert.match(detail, /body/); assert.doesNotMatch(detail, /confidentiel|neutre/);
  c.app.securite.retryNow?.(); await c.app.securite.flush?.();
  assert.ok(events.some(e => e.type === 'input_validation_fail' && e.detail.objet === 'bilan'));
  assert.ok(!JSON.stringify(events).includes('confidentiel'));
});

test('bilans : erreurs et conflit conservent la saisie et sa version ; l’administration traduit ses messages', async t => {
  const c = await setup(t, { seeded: true }), admin = as(c, { sub: 'bilans-admin-erreurs', roles: ['admin'] }), sid = season(c), rid = c.app.saisonsBilans.createReport(sid, reportTexts), url = `/admin/saisons/${sid}/bilans/${rid}`;
  const original = reportForm(c, rid); assert.equal((await admin.post(url, { ...original, title: 'Version récente' })).statusCode, 303);
  const before = c.app.saisonsBilans.getReport(rid), conflict = await admin.post(url, { ...original, title: 'Ma saisie conservée' });
  assert.equal(conflict.statusCode, 409); assert.match(conflict.body, /value="Ma saisie conservée"/); assert.match(conflict.body, new RegExp(`name="version" value="${original.version}"`));
  assert.match(conflict.body, /Recharger la dernière version/); assert.deepEqual(c.app.saisonsBilans.getReport(rid), before);
  c.app.saisonsBilans.saveReport(rid, { version: before.version, input: { body_de: '' } });
  admin.cookies.admin_langue = 'en';
  const failed = await admin.post(`${url}/publier`, { version: String(c.app.saisonsBilans.getReport(rid).version) });
  assert.equal(failed.statusCode, 422); assert.match(failed.body, /Complete this content in French, English and German/); assert.match(failed.body, /id="body_de"[^>]+aria-invalid="true"/);
  const pub = publishedReport(c, sid), cid = c.app.saisonsBilans.createCollection(pub, collectionTexts), ids = c.app.saisons.get(sid).photo_ids, curl = `/admin/saisons/${sid}/collections/${cid}`;
  const invalid = await admin.post(curl, collectionForm(c, cid, ids, { cover_id: '999999', [`cartel_${ids[0]}`]: 'Contexte à conserver' }));
  assert.equal(invalid.statusCode, 422); assert.match(invalid.body, /Contexte à conserver/); assert.deepEqual(c.app.saisonsBilans.getCollection(cid).photo_ids, []);
});
