import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { decode, createFaceDetector, createFaceService } from '../server/faces.js';

// Visages détectés (jamais reconnus) et état de chaque photo pour chaque usage : prête, à vérifier (confirmation
// explicite gardée), bloquée (aucune confirmation ne la lève).
const TOKEN = 'jeton-de-test-0123456789';
const DAY = '2026-10-13';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function ctxOf(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const get = url => ctx.app.inject({ url, cookies });
  const post = (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  const julien = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  // Deux brouillons de Julien ce jour-là : un portrait (un visage), un paysage (aucun).
  const [portrait, landscape] = ctx.db.prepare("SELECT id FROM photos ORDER BY id LIMIT 2").pluck().all();
  ctx.db.prepare("UPDATE photos SET author_id = ?, taken_on = ?, status = 'draft', faces = ? WHERE id = ?").run(julien, DAY, 1, portrait);
  ctx.db.prepare("UPDATE photos SET author_id = ?, taken_on = ?, status = 'draft', faces = ? WHERE id = ?").run(julien, DAY, 0, landscape);
  const state = id => ctx.app.readiness.state(id);
  return { ...ctx, get, post, julien, portrait, landscape, state };
}

test('décodage du modèle : score, cadre, doublons retirés', () => {
  const grid = s => (640 / s) ** 2;
  const out = {};
  for (const s of [8, 16, 32]) {
    out[`cls_${s}`] = { data: new Float32Array(grid(s)) };
    out[`obj_${s}`] = { data: new Float32Array(grid(s)) };
    out[`bbox_${s}`] = { data: new Float32Array(grid(s) * 4) };
  }
  // Un visage au pas 32, cellule (ligne 5, colonne 10), et le même visage vu au pas 16 (recouvrement : retiré).
  const i32 = 5 * 20 + 10;
  out.cls_32.data[i32] = 0.95; out.obj_32.data[i32] = 0.95; out.bbox_32.data.set([0.5, 0.5, Math.log(3), Math.log(4)], i32 * 4);
  const i16 = 11 * 40 + 21;
  out.cls_16.data[i16] = 0.9; out.obj_16.data[i16] = 0.9; out.bbox_16.data.set([0, 0, Math.log(6), Math.log(8)], i16 * 4);
  // Un score trop faible : ignoré.
  out.cls_8.data[0] = 0.3; out.obj_8.data[0] = 0.3;
  const boxes = decode(out);
  assert.equal(boxes.length, 1);
  [[boxes[0].x, 10.5 * 32 - 48], [boxes[0].y, 5.5 * 32 - 64], [boxes[0].w, 96], [boxes[0].h, 128]].forEach(([a, b]) => assert.ok(Math.abs(a - b) < 1e-3, `${a} ≠ ${b}`));
  assert.ok(Math.abs(boxes[0].score - 0.95) < 1e-6);
});

test('vrai modèle : aucun visage sur un paysage ni sur une image unie', async () => {
  const d = createFaceDetector();
  assert.deepEqual(await d.detect(new URL('../seed/images/lac.jpg', import.meta.url).pathname), []);
  assert.deepEqual(await d.detect(await sharp({ create: { width: 900, height: 600, channels: 3, background: '#7a7a7a' } }).jpeg().toBuffer()), []);
});

test('service : nombre et cadres gardés, échec noté, rien d’autre', async t => {
  const c = await ctxOf(t);
  c.db.prepare('UPDATE photos SET faces = NULL WHERE id IN (?, ?)').run(c.portrait, c.landscape);
  let n = 0;
  const svc = createFaceService({ db: c.db, storageDir: c.config.storageDir, auto: false,
    detector: { detect: async () => { if (n++ === 0) return [{ x: 0.4, y: 0.2, w: 0.1, h: 0.15, score: 0.92 }]; throw new Error('illisible'); } } });
  await svc.run();
  const rows = c.db.prepare('SELECT id, faces, face_boxes FROM photos WHERE id IN (?, ?) ORDER BY id DESC').all(c.portrait, c.landscape);
  assert.deepEqual(rows.map(r => r.faces).sort(), [-1, 1]);
  assert.deepEqual(JSON.parse(rows.find(r => r.faces === 1).face_boxes), [{ x: 0.4, y: 0.2, w: 0.1, h: 0.15, score: 0.92 }]);
});

test('états : sans visage prête ; visage sans accord à vérifier ; correction à la main', async t => {
  const c = await ctxOf(t);
  assert.equal(c.state(c.landscape).site.level, 'ok');
  assert.equal(c.state(c.portrait).site.level, 'warn');
  assert.match(c.state(c.portrait).site.reasons[0], /1 visage, personne rencontrée/);
  // Correction : personne de reconnaissable → prête ; il y a quelqu'un → à vérifier ; retour à la détection.
  await c.post(`/admin/photos/${c.portrait}/visages`, { valeur: 'non' });
  assert.equal(c.state(c.portrait).site.level, 'ok');
  await c.post(`/admin/photos/${c.landscape}/visages`, { valeur: 'oui' });
  assert.match(c.state(c.landscape).site.reasons[0], /quelqu’un est sur la photo, sans accord/);
  await c.post(`/admin/photos/${c.landscape}/visages`, { valeur: 'auto' });
  assert.equal(c.state(c.landscape).site.level, 'ok');
  // Un accord de la sortie (site et Instagram) rend le portrait prêt ; un accord sans Instagram le bloque pour Instagram.
  await c.post(`/admin/photos/${c.portrait}/visages`, { valeur: 'auto' });
  const id = c.app.encounters.saveCard(null, { ref: 'J-0400', signed: 'on', scope_site: 'on', met_on: DAY, author_id: c.julien });
  assert.equal(c.state(c.portrait).site.level, 'ok');
  assert.equal(c.state(c.portrait).instagram.level, 'no');
  // Le paysage (aucun visage) n'est concerné par personne de la sortie : Instagram libre.
  assert.equal(c.state(c.landscape).instagram.level, 'ok');
  // Sans décision : à vérifier.
  c.app.encounters.saveCard(null, { ref: 'J-0401', met_on: DAY, author_id: c.julien });
  assert.match(c.state(c.portrait).site.reasons.join(), /J-0401 n’a pas encore décidé/);
  assert.ok(id);
});

test('publier une photo à vérifier : confirmation explicite exigée, gardée ; un clic et les actions groupées l’écartent', async t => {
  const c = await ctxOf(t);
  const page = (await c.get(`/admin/photos/${c.portrait}`)).body;
  assert.match(page, /Site : à vérifier/);
  assert.match(page, /name="confirmer"/);
  const form = { title: 'Portrait', category_id: '1', author_id: String(c.julien), status: 'published', watermark: 'default' };
  const refused = await c.post(`/admin/photos/${c.portrait}`, form);
  assert.equal(refused.statusCode, 422);
  assert.match(refused.body, /cochez la confirmation pour la publier/);
  assert.equal(c.db.prepare('SELECT status FROM photos WHERE id = ?').pluck().get(c.portrait), 'draft');
  // Un clic (Aujourd'hui) : renvoyé vers la fiche.
  const click = await c.post(`/admin/photos/${c.portrait}/status`, { status: 'published' });
  assert.equal(click.headers.location, `/admin/photos/${c.portrait}`);
  // Action groupée : le paysage part, le portrait reste.
  await c.post('/admin/photos/actions', { action: 'publish', ids: [String(c.portrait), String(c.landscape)] });
  assert.deepEqual(c.db.prepare('SELECT status FROM photos WHERE id IN (?, ?) ORDER BY id').pluck().all(c.portrait, c.landscape).sort(), ['draft', 'published']);
  // Confirmation : publiée, et la confirmation est gardée avec ce qui manquait.
  const ok = await c.post(`/admin/photos/${c.portrait}`, { ...form, confirmer: '1' });
  assert.equal(ok.statusCode, 303);
  assert.equal(c.db.prepare('SELECT status FROM photos WHERE id = ?').pluck().get(c.portrait), 'published');
  const conf = c.app.readiness.confirmations(c.portrait);
  assert.equal(conf[0].usage, 'site');
  assert.match(conf[0].reasons[0], /1 visage/);
  assert.match((await c.get(`/admin/photos/${c.portrait}`)).body, /Confirmations : site par/);
  // Photothèque et Aujourd'hui la signalent.
  assert.match((await c.get('/admin/photos?manque=verifier')).body, /▲ À vérifier <span class="n">1/);
  assert.match((await c.get('/admin')).body, /1 photo publiée à vérifier/);
});

test('sortie : « Publier les photos prêtes » ne publie que les prêtes', async t => {
  const c = await ctxOf(t);
  const page = (await c.get('/admin/sorties/julien/2026-10-13')).body;
  assert.match(page, /Publier les photos prêtes · 1/);
  await c.post('/admin/sorties/julien/2026-10-13/publier');
  assert.equal(c.db.prepare('SELECT status FROM photos WHERE id = ?').pluck().get(c.landscape), 'published');
  assert.equal(c.db.prepare('SELECT status FROM photos WHERE id = ?').pluck().get(c.portrait), 'draft');
});
