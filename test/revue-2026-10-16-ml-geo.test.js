import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { setup, fakeImageModel } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import * as cities from '../server/geo/cities.js';
import { createFaceDetector, createFaceService, ModelError as FaceModelError } from '../server/faces.js';
import { createFlorence, createDescriber, ModelError, DescribeError, MODELS, MAX_ASKED } from '../server/describe.js';
import { fetchModel } from '../server/describe-worker.js';
import { createSeriesSuggest, normalize } from '../server/series-suggest.js';
import { VOCABULARY, VOCABULARY_SHA256, formsOf } from '../server/keywords-suggest.js';
import { translator } from '../server/admin-i18n.js';

// Non-régression de la revue du 16 octobre 2026, sous-système « ml-geo » : liste des villes chargée par tranches et
// recherche des noms à élision ; visages des petits personnages sur les grands originaux (tuiles) et nouvel examen des
// photos « sans visage » ; descriptions Florence-2 (processus à part, arrêt, panne du modèle, file bornée, fichiers du
// modèle vérifiés, traductions reprises, heures de nuit) ; séries proposées (calcul gardé, photo supprimée pendant son
// analyse) ; vocabulaire des mots-clés ; messages du traducteur.
const SEED = new URL('../seed/images/', import.meta.url).pathname;
const FACE = new URL('./fixtures/visage.jpg', import.meta.url).pathname;           // visage : 61 % de la hauteur de l'image
const FAKE_WORKER = new URL('./fixtures/faux-florence.mjs', import.meta.url).pathname;
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'revue-ml-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

// Une session de n'importe quel rôle, avec son jeton CSRF (comme test/revue-securite.test.js).
function as(ctx, sub, roles, authorId = null) {
  ctx.app.accounts.ensure({ sub, name: sub, roles });
  if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
  const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
  const cookies = { session: token };
  return {
    get: url => ctx.app.inject({ url, cookies, headers: { accept: 'text/html' } }),
    post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
    json: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload }),
  };
}
const flashOf = res => decodeURIComponent(res.cookies.find(c => c.name === 'flash')?.value || '');

// ---------- villes ----------

test('villes : chargées par tranches (le serveur répond entre deux) ; un appel direct en plein chargement finit le travail', async () => {
  let ticks = 0, done = false;
  const iv = setInterval(() => { ticks++; }, 1);
  const p = cities.preload().then(() => { done = true; });
  while (ticks < 3) await new Promise(r => setTimeout(r, 1));
  clearInterval(iv);
  assert.equal(done, false);                                                               // pas d'un seul bloc
  // Un appel synchrone pendant le chargement : l'index complet, pas un index partiel.
  assert.equal(cities.search('Paris', 1)[0].name, 'Paris');
  assert.equal(cities.byId(2988507)?.name, 'Paris');
  await p;
  assert.equal(cities.nearest(48.85, 2.35)?.name, 'Paris');
});

test('villes : un nom dont le premier mot n’a qu’une lettre est trouvé (L’Aquila, A Coruña, ’s-Hertogenbosch)', () => {
  assert.equal(cities.search("L'Aquila", 1)[0]?.name, "L'Aquila");
  assert.equal(cities.search('l aquila', 1)[0]?.name, "L'Aquila");
  assert.equal(cities.search("L'Haÿ-les-Roses", 1)[0]?.name, "L'Haÿ-les-Roses");
  assert.equal(cities.search('A Coruña', 1)[0]?.cc, 'ES');
  assert.equal(cities.search("'s-Hertogenbosch", 1)[0]?.cc, 'NL');
  assert.equal(cities.search("L'Hospitalet de Llobregat", 1)[0]?.name, "L'Hospitalet de Llobregat");
  assert.deepEqual(cities.search('a b'), []);                                              // aucun mot de deux lettres
});

// ---------- visages ----------

// Un original de W × H (le lac agrandi) avec un visage de f × H de haut, coin haut gauche en (x, y) (fractions).
async function withFace(W, H, f, x, y) {
  const bg = await sharp(path.join(SEED, 'lac.jpg')).resize(W, H, { fit: 'fill' }).jpeg().toBuffer();
  if (!f) return bg;
  const h = Math.round(f * H / 0.6127), w = Math.round(h * 160 / 190);
  const face = await sharp(FACE).resize(w, h).toBuffer();
  return sharp(bg).composite([{ input: face, left: Math.round(W * x), top: Math.round(H * y) }]).jpeg({ quality: 90 }).toBuffer();
}

test('visages, vrai modèle : un petit visage sur un original de 24 Mpx est vu (2 à 3 % de la hauteur), une seule fois ; un grand aussi', async () => {
  const d = createFaceDetector();
  for (const [W, H, f, y] of [[6000, 4000, 0.02, 0.4], [4000, 6000, 0.03, 0.4], [6000, 4000, 0.3, 0.2]]) {
    const boxes = await d.detect(await withFace(W, H, f, 0.45, y));
    assert.equal(boxes.length, 1, `${W} × ${H}, visage de ${f * 100} % : ${JSON.stringify(boxes)}`);
    assert.ok(Math.abs(boxes[0].h - f) < f * 0.35, `hauteur ${boxes[0].h} pour ${f}`);
  }
  assert.deepEqual(await d.detect(await withFace(6000, 4000, 0)), []);                     // le paysage seul : rien
});

test('visages : les photos déjà vues « sans visage » sont revues une fois par le nouveau détecteur, sans repasser par « à examiner »', async t => {
  const ctx = await setup(t, { seeded: true });                                            // photos du jeu : faces = 0
  const ids = ctx.db.prepare('SELECT id FROM photos ORDER BY id DESC').pluck().all();
  const target = ids[4];
  const target_file = ctx.db.prepare('SELECT file FROM photos WHERE id = ?').pluck().get(target);
  const seen = [];
  let broken = 2;                                                                          // panne après deux photos
  const detector = { detect: async file => {
    if (seen.length === broken) { broken = -1; throw new FaceModelError('modèle illisible'); }
    seen.push(path.basename(file));
    // Pendant le nouvel examen, la photo garde son ancien résultat (jamais « pas encore examinée »).
    assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM photos WHERE faces IS NULL').pluck().get(), 0);
    return path.basename(file) === target_file ? [{ x: 0.4, y: 0.4, w: 0.02, h: 0.03, score: 0.9 }] : [];
  } };
  const svc = createFaceService({ db: ctx.db, storageDir: ctx.app.config.storageDir, detector });
  assert.equal(svc.recheckOnce(), ids[0]);
  await svc.run();                                                                          // s'arrête sur la panne
  assert.equal(seen.length, 2);
  await svc.run();                                                                          // reprend où il en était
  assert.equal(seen.length, ids.length);
  assert.equal(new Set(seen).size, ids.length);                                             // chacune une fois
  assert.equal(ctx.db.prepare('SELECT faces FROM photos WHERE id = ?').pluck().get(target), 1);
  assert.equal(ctx.db.prepare("SELECT value FROM settings WHERE key = 'faces_recheck'").pluck().get(), undefined);
  // Une seule fois : un redémarrage ne relance rien.
  assert.equal(svc.recheckOnce(), 0);
  await svc.run();
  assert.equal(seen.length, ids.length);
});

// ---------- descriptions : le processus de calcul ----------

test('descriptions : le calcul tourne dans un processus à part (le site n’attend pas) ; panne, arrêt net, délai, « Éteindre »', async t => {
  const dir = tmp(t);
  const img = path.join(SEED, 'lac.jpg');
  const make = (mode, extra = {}) => createFlorence({ dir, worker: FAKE_WORKER, args: [mode], ...extra });
  // 1,5 s de calcul sans rendre la main, dans l'autre processus : la boucle d'événements du site continue.
  const slow = make('lent');
  // Durée relative, pas un seuil en ms : si le calcul tournait dans le site, la boucle resterait figée pendant presque
  // tout le calcul (le plus long intervalle sans battement ≈ la durée totale) ; sous charge, les battements prennent
  // du retard mais jamais la moitié de la durée.
  let worst = 0, last = performance.now();
  const iv = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last); last = n; }, 10);
  const debut = performance.now();
  const text = await slow.describe(img, 'base');
  const total = performance.now() - debut;
  await new Promise(r => setTimeout(r, 30));                                                // un tour de minuteries : le battement en retard est compté
  clearInterval(iv);
  assert.match(text, /^A fake caption \(base, \d+ octets\)\.$/);
  assert.ok(total >= 1400, `le faux calcul dure 1,5 s (${Math.round(total)} ms)`);
  assert.ok(worst < total / 2, `boucle bloquée ${Math.round(worst)} ms sur ${Math.round(total)} ms de calcul`);
  assert.equal(await slow.describe(img, 'base'), text);                                     // le processus resservi
  await slow.unload();
  // Le modèle ne se charge pas : erreur du modèle.
  await assert.rejects(make('charge').describe(img, 'base'), err => err instanceof ModelError && /Could not locate/.test(err.message));
  // Processus tué (mémoire du conteneur) : erreur du modèle, pas du site.
  await assert.rejects(make('plante').describe(img, 'base'), err => err instanceof ModelError && /mémoire insuffisante/.test(err.message));
  // Calcul trop long : le processus est arrêté.
  await assert.rejects(make('bloque', { timeoutMs: 200 }).describe(img, 'base'), err => err instanceof ModelError && /trop longtemps/.test(err.message));
  // Image illisible : erreur de la photo (pas du modèle).
  await assert.rejects(make('ok').describe(Buffer.from('pas une image'), 'base'), err => !(err instanceof ModelError));
  // « Éteindre et effacer » en plein calcul : la tâche échoue tout de suite, le dossier du modèle disparaît.
  fs.mkdirSync(path.join(dir, 'onnx-community'), { recursive: true });
  // Pas de seuil en ms : le délai du calcul est long (30 s) ; si « Éteindre » attendait ce délai au lieu d'arrêter le
  // processus, la tâche échouerait avec « trop longtemps » (ou le test dépasserait son délai), pas avec « arrêt demandé ».
  const busy = make('bloque', { timeoutMs: 30_000 });
  const p = busy.describe(img, 'base');
  await new Promise(r => setTimeout(r, 300));
  await busy.remove();
  await assert.rejects(p, err => err instanceof ModelError && /arrêt demandé/.test(err.message));
  assert.equal(fs.existsSync(dir), false);
  // Éteint pendant la réduction de l'image : rien ne démarre ensuite.
  const early = make('ok');
  const q = early.describe(img, 'base');
  await early.unload();
  await assert.rejects(q, /arrêt demandé/);
});

test('modèle des descriptions : fichiers vérifiés (taille, SHA-256), écrits sous un nom provisoire ; tronqué ou altéré : retéléchargé ou refusé', async t => {
  const dir = tmp(t);
  const content = { 'config.json': Buffer.from('{"model_type":"florence2"}'), 'onnx/vision_encoder_quantized.onnx': crypto.randomBytes(5000) };
  const model = { id: 'test/florence', revision: 'abc123', files: Object.fromEntries(Object.entries(content).map(([k, b]) => [k, [b.length, sha256(b)]])) };
  const served = { ...content }, asked = [];
  const fetchImpl = async url => {
    const name = url.split('/resolve/abc123/')[1];
    asked.push(name);
    return served[name] ? new Response(served[name]) : new Response('', { status: 404 });
  };
  const base = path.join(dir, 'test/florence/abc123'), onnx = path.join(base, 'onnx/vision_encoder_quantized.onnx');
  await fetchModel({ dir, model, fetchImpl });
  assert.deepEqual(asked, Object.keys(content));
  assert.ok(fs.readFileSync(onnx).equals(content['onnx/vision_encoder_quantized.onnx']));
  assert.ok(fs.existsSync(path.join(base, '.verifie')));
  // Déjà là : aucune requête.
  asked.length = 0;
  await fetchModel({ dir, model, fetchImpl });
  assert.deepEqual(asked, []);
  // Tronqué (site arrêté pendant l'écriture) : retéléchargé, seul.
  fs.truncateSync(onnx, 100);
  await fetchModel({ dir, model, fetchImpl });
  assert.deepEqual(asked, ['onnx/vision_encoder_quantized.onnx']);
  assert.ok(fs.readFileSync(onnx).equals(content['onnx/vision_encoder_quantized.onnx']));
  // Ancienne installation (cache de transformers.js, sans marque) : un fichier de la bonne taille mais altéré est
  // repéré par son empreinte et retéléchargé.
  fs.rmSync(path.join(base, '.verifie'));
  fs.writeFileSync(onnx, crypto.randomBytes(5000));
  asked.length = 0;
  await fetchModel({ dir, model, fetchImpl });
  assert.deepEqual(asked, ['onnx/vision_encoder_quantized.onnx']);
  assert.ok(fs.readFileSync(onnx).equals(content['onnx/vision_encoder_quantized.onnx']));
  // Altéré ou trop gros côté serveur : refusé, rien ne reste (ni le fichier, ni le provisoire).
  fs.rmSync(onnx);
  served['onnx/vision_encoder_quantized.onnx'] = crypto.randomBytes(5000);
  await assert.rejects(fetchModel({ dir, model, fetchImpl }), err => err instanceof ModelError && /SHA-256/.test(err.message));
  served['onnx/vision_encoder_quantized.onnx'] = crypto.randomBytes(6000);
  await assert.rejects(fetchModel({ dir, model, fetchImpl }), err => err instanceof ModelError && /trop gros/.test(err.message));
  assert.deepEqual([fs.existsSync(onnx), fs.existsSync(`${onnx}.part`)], [false, false]);
  // Plus rien ne vient : abandon.
  const stalled = async (url, { signal }) => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); signal.addEventListener('abort', () => c.error(new DOMException('abandon', 'AbortError'))); } }));
  await assert.rejects(fetchModel({ dir, model, fetchImpl: stalled, stallMs: 100 }), err => err instanceof ModelError && /bloqué/.test(err.message));
  // Les deux modèles réels : neuf fichiers figés chacun, avec taille et empreinte.
  for (const m of Object.values(MODELS)) {
    assert.equal(Object.keys(m.files).length, 9);
    for (const [bytes, h] of Object.values(m.files)) assert.ok(bytes > 0 && /^[0-9a-f]{64}$/.test(h));
  }
});

// ---------- descriptions : la file ----------

const NIGHT = Date.parse('2026-10-15T01:30:00Z');                                          // 3 h 30 à Paris
const photoIds = ctx => ctx.db.prepare('SELECT id FROM photos ORDER BY id').pluck().all();
const descRows = ctx => ctx.db.prepare('SELECT * FROM photo_descriptions ORDER BY photo_id').all();

test('descriptions : modèle en panne, la passe s’arrête et la file de nuit n’est pas marquée ; demandée : erreur gardée ; reprise au démarrage', async t => {
  const ctx = await setup(t, { seeded: true });
  let broken = true, calls = 0;
  const model = { describe: async () => { calls++; if (broken) throw new ModelError('Could not locate file: onnx/vision_encoder_quantized.onnx'); return 'A lighthouse.'; }, unload: async () => {}, remove: async () => {} };
  const d = createDescriber({ db: ctx.db, storageDir: ctx.app.config.storageDir, model, now: () => NIGHT });
  d.save({ on: true, model: 'base', from: 1, to: 6 });
  assert.equal(await d.run(), 0);
  assert.equal(calls, 1);                                                                   // une tentative, pas une par photo
  assert.deepEqual(descRows(ctx), []);                                                      // aucune photo exclue
  assert.match(d.state().error, /Could not locate/);
  // Une photo demandée depuis sa fiche : l'erreur est gardée (la fiche ne reste pas « en cours de calcul »).
  const [a, b] = photoIds(ctx);
  await d.request(a);
  assert.deepEqual([d.forPhoto(a).pending, d.forPhoto(a).error], [false, 'Could not locate file: onnx/vision_encoder_quantized.onnx']);
  // Modèle réparé : la nuit suivante décrit tout, la photo en échec comprise après une reprise au démarrage.
  broken = false;
  assert.equal(d.retryFailed(), 1);
  assert.equal(await d.run(), photoIds(ctx).length);
  assert.equal(d.state().done, photoIds(ctx).length);
  assert.equal(d.state().error, null);
  // Une photo déjà décrite dont le nouvel essai échoue garde sa description, même après une reprise.
  broken = true;
  await d.request(b);
  assert.equal(d.retryFailed(), 0);
  assert.equal(d.forPhoto(b).en, 'A lighthouse.');
  // Mémoire insuffisante au moment du calcul : comme un modèle absent, rien n'est marqué.
  ctx.db.prepare('DELETE FROM photo_descriptions').run();
  broken = false; calls = 0;
  const small = createDescriber({ db: ctx.db, storageDir: ctx.app.config.storageDir, model, now: () => NIGHT, memLimit: () => 2 ** 30 });
  assert.equal(await small.run(), 0);
  assert.deepEqual([calls, descRows(ctx).length], [0, 0]);
  assert.match(small.state().error, /Mémoire insuffisante/);
});

test('descriptions : une photo illisible est marquée et la passe continue ; photo supprimée pendant son calcul ; « Éteindre » pendant le calcul', async t => {
  const ctx = await setup(t, { seeded: true });
  const ids = photoIds(ctx);
  const gone = ids[2], bad = ids[3];
  const badFile = ctx.db.prepare('SELECT file FROM photos WHERE id = ?').pluck().get(bad);
  const goneFile = ctx.db.prepare('SELECT file FROM photos WHERE id = ?').pluck().get(gone);
  const model = { describe: async file => {
    if (file.endsWith(badFile)) throw new Error('Input file contains unsupported image format');
    if (file.endsWith(goneFile)) ctx.db.prepare('DELETE FROM photos WHERE id = ?').run(gone);
    return 'A quiet street.';
  }, unload: async () => {}, remove: async () => {} };
  const d = createDescriber({ db: ctx.db, storageDir: ctx.app.config.storageDir, model, now: () => NIGHT });
  d.save({ on: true, model: 'base', from: 1, to: 6 });
  assert.equal(await d.run(), ids.length);                                                 // aucune passe interrompue
  assert.equal(d.forPhoto(bad).error, 'Input file contains unsupported image format');
  assert.equal(d.forPhoto(gone), null);
  assert.equal(d.state().done, ids.length - 2);
  // « Éteindre » pendant un calcul : le calcul échoue (processus arrêté), rien n'est écrit sur la photo.
  ctx.db.prepare('DELETE FROM photo_descriptions').run();
  let release;
  const stopping = { describe: () => new Promise((resolve, reject) => { release = () => reject(new ModelError('arrêt demandé')); }), unload: async () => release?.(), remove: async () => release?.() };
  const e = createDescriber({ db: ctx.db, storageDir: ctx.app.config.storageDir, model: stopping, now: () => NIGHT });
  e.save({ on: true, model: 'base', from: 1, to: 6 });
  const running = e.run();
  await new Promise(r => setImmediate(r));
  await e.remove();
  await running;
  assert.deepEqual(descRows(ctx), []);
  assert.equal(e.state().error, null);
});

test('descriptions : traduction manquée (traducteur arrêté) reprise ensuite ; la fiche dit « pas encore traduite », pas « aucun traducteur »', async t => {
  const ctx = await setup(t, { seeded: true, env: { TRANSLATE_URL: 'http://127.0.0.1:9' } });
  const tr = { enabled: true, up: false, async translate(text, from, to) { if (!this.up) throw new Error('fetch failed'); return `[${to}] ${text}`; } };
  const [a] = photoIds(ctx);
  const d = createDescriber({ db: ctx.db, storageDir: ctx.app.config.storageDir, model: { describe: async () => 'A lighthouse.' }, translator: tr, now: () => Date.parse('2026-10-15T12:00:00Z') });
  d.save({ on: true, model: 'base', from: 1, to: 6 });
  await d.request(a);
  assert.deepEqual([d.forPhoto(a, 'fr').text, d.forPhoto(a, 'fr').translated], ['A lighthouse.', false]);
  // Traducteur revenu : la passe suivante traduit ce qui manque.
  tr.up = true;
  await d.run();
  assert.deepEqual([d.forPhoto(a, 'fr').text, d.forPhoto(a, 'de').text, d.forPhoto(a, 'fr').translated], ['[fr] A lighthouse.', '[de] A lighthouse.', true]);
  // Une ligne sans texte (demande en attente, échec) n'est pas « traduite ».
  ctx.db.prepare('INSERT INTO photo_descriptions (photo_id, error) VALUES (?, ?)').run(photoIds(ctx)[1], 'image illisible');
  assert.equal(d.forPhoto(photoIds(ctx)[1]).translated, false);
  // Sur la fiche (vraie application, traducteur configuré mais injoignable) : la bonne explication ; l'erreur d'une
  // photo non décrite est montrée.
  ctx.app.describer.save({ on: true, model: 'base', from: 1, to: 6 });
  const admin = as(ctx, 'admin-desc', ['admin']);
  await admin.post(`/admin/photos/${a}/description`);
  await ctx.app.describer.idle();
  const page = (await admin.get(`/admin/photos/${a}`)).body;
  assert.match(page, /en anglais : traduction pas encore faite/);
  assert.doesNotMatch(page, /aucun traducteur configuré/);
  const b = photoIds(ctx)[1];
  assert.match((await admin.get(`/admin/photos/${b}`)).body, /Dernier essai sans succès : image illisible/);
});

test('descriptions, route : photo inconnue 404 ; demandes en attente bornées (429) ; redemander ne change pas la place', async t => {
  const ctx = await setup(t, { seeded: true, describeOptions: { manual: true, model: { describe: () => new Promise(() => {}), unload: async () => {}, remove: async () => {} } } });
  // Assez de photos pour remplir la file.
  const first = photoIds(ctx)[0];
  for (let k = 0; ctx.db.prepare('SELECT COUNT(*) FROM photos').pluck().get() <= MAX_ASKED + 1; k++) {
    ctx.db.prepare(`INSERT INTO photos (slug, title, category_id, author_id, file, width, height) SELECT slug || '-copie-' || ?, title, category_id, author_id, 'copie-' || ? || '.jpg', width, height FROM photos WHERE id = ?`).run(k, k, first);
  }
  const ids = photoIds(ctx);
  ctx.app.describer.save({ on: true, model: 'base', from: 1, to: 6 });
  const rel = as(ctx, 'relecteur-desc', ['relecteur']);
  assert.equal((await rel.post('/admin/photos/999999/description')).statusCode, 404);
  assert.equal((await rel.post('/admin/photos/abc/description')).statusCode, 404);
  for (const id of ids.slice(0, MAX_ASKED)) assert.equal((await rel.post(`/admin/photos/${id}/description`)).statusCode, 303);
  const asked = ctx.db.prepare('SELECT requested_at FROM photo_descriptions WHERE photo_id = ?').pluck().get(ids[1]);
  // Redemander une photo déjà en attente : accepté, sans la remettre en fin de file.
  await new Promise(r => setTimeout(r, 5));
  assert.match(flashOf(await rel.post(`/admin/photos/${ids[1]}/description`)), /Description demandée/);
  assert.equal(ctx.db.prepare('SELECT requested_at FROM photo_descriptions WHERE photo_id = ?').pluck().get(ids[1]), asked);
  // Une de plus : refusée, la file ne grossit pas.
  const extra = ids[MAX_ASKED];
  assert.match(flashOf(await rel.post(`/admin/photos/${extra}/description`)), /Trop de descriptions demandées/);
  const r = await rel.json(`/admin/photos/${extra}/description`);
  assert.equal(r.statusCode, 429);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM photo_descriptions WHERE requested_at IS NOT NULL').pluck().get(), MAX_ASKED);
});

test('descriptions : heures de nuit identiques refusées (plus rien ne serait décrit)', async t => {
  const ctx = await setup(t, { seeded: true });
  const d = ctx.app.describer;
  assert.throws(() => d.save({ on: true, model: 'base', from: '3', to: '3' }), err => err instanceof DescribeError && /différente du début/.test(err.message));
  assert.equal(d.settings().on, false);
  const admin = as(ctx, 'admin-nuit', ['admin']);
  const res = await admin.post('/admin/series/descriptions', { action: 'on', model: 'base', from: '3', to: '3' });
  assert.match(flashOf(res), /Heures de nuit : la fin doit être différente du début/);
  assert.equal(d.settings().on, false);
  assert.equal(translator('de').msg('Heures de nuit : la fin doit être différente du début (par exemple de 1 h à 6 h).'), 'Nachtstunden: Das Ende muss sich vom Anfang unterscheiden (zum Beispiel von 1 bis 6 Uhr).');
});

// ---------- séries proposées ----------

// Proposition de série d'avant la revue (c88632d), recopiée : la référence des résultats.
function reference(db, vecs, p) {
  const TOP = 3, MIN = 3, BETTER = 0.015, CLOSE = 0.01, K = 10;
  if (!p || p.series_checked || p.status === 'published') return [];
  const rows = db.prepare('SELECT id, category_id, status, series_checked FROM photos').all().filter(r => vecs.has(r.id));
  const all = rows.filter(r => r.series_checked || r.status === 'published').map(r => ({ id: r.id, cat: r.category_id, v: vecs.get(r.id) }));
  const sizes = new Map();
  for (const k of all) sizes.set(k.cat, (sizes.get(k.cat) || 0) + 1);
  const known = all.filter(k => sizes.get(k.cat) >= MIN);
  const dot = (a, b) => { let s = 0; for (let i = 0; i < 512; i++) s += a[i] * b[i]; return s; };
  const v = vecs.get(p.id);
  if (!v) return [];
  const near = known.filter(k => k.id !== p.id).map(k => ({ ...k, sim: dot(v, k.v) })).sort((x, y) => y.sim - x.sim);
  if (!near.length) return [];
  const by = new Map();
  for (const k of near) { const e = by.get(k.cat) || { category_id: k.cat, sims: [], like: [], size: sizes.get(k.cat) }; if (e.sims.length < TOP) { e.sims.push(k.sim); e.like.push(k.id); } by.set(k.cat, e); }
  const top = near.slice(0, K);
  const ranked = [...by.values()].map(e => ({ ...e, score: e.sims.reduce((x, y) => x + y, 0) / e.sims.length, votes: Math.max(1, top.filter(k => k.cat === e.category_id).length) })).sort((x, y) => y.score - x.score);
  const current = ranked.find(e => e.category_id === p.category_id);
  const [first, second] = ranked;
  if (first === current || (current && first.score - current.score < BETTER)) return [];
  const out = [first];
  if (second && second !== current && first.score - second.score < CLOSE && (!current || second.score - current.score >= BETTER)) out.push(second);
  return out.map(({ sims, score, ...e }) => e);
}

test('séries proposées : calcul gardé d’une page à l’autre et complété quand une photo est rangée ; mêmes propositions qu’avant', async t => {
  const ctx = await setup(t, { seeded: true });
  const db = ctx.db;
  db.prepare("INSERT INTO settings (key, value) VALUES ('series_suggest', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'").run();
  const author = db.prepare('SELECT id FROM authors LIMIT 1').pluck().get();
  const cats = [];
  for (let c = 0; c < 6; c++) cats.push(db.prepare('INSERT INTO categories (slug, name) VALUES (?, ?)').run(`revue-${c}`, `Revue ${c}`).lastInsertRowid);
  const insert = db.prepare("INSERT INTO photos (slug, title, category_id, author_id, file, width, height, status, series_checked) VALUES (?, 't', ?, ?, ?, 10, 10, ?, ?)");
  const emb = db.prepare("INSERT INTO photo_embeddings (photo_id, model, vec, created_at) VALUES (?, 'clip-vit-b32-q', ?, 0)");
  // Empreintes groupées par série (un centre et du bruit), tirage fixe : des propositions sortent.
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const centers = cats.map(() => Float32Array.from({ length: 512 }, rnd));
  const vecs = new Map();
  for (let i = 0; i < 240; i++) {
    const c = i % 6, draft = i % 3 === 0;
    const id = insert.run(`revue-${i}`, cats[draft && i % 2 ? (c + 1) % 6 : c], author, `revue-${i}.jpg`, draft || i % 5 === 0 ? 'draft' : 'published', draft ? 0 : 1).lastInsertRowid;
    const v = normalize(centers[c].map(x => x + rnd() * 1.6));
    emb.run(id, Buffer.from(v.buffer)); vecs.set(id, v);
  }
  const s = createSeriesSuggest({ db, storageDir: ctx.app.config.storageDir, model: fakeImageModel() });
  const all = () => db.prepare('SELECT id, category_id, status, series_checked FROM photos').all();
  const same = () => { const m = s.forPhotos(all()); let n = 0; for (const p of all()) { const want = reference(db, vecs, p); assert.deepEqual(m.get(p.id) || [], want, `photo ${p.id}`); n += want.length > 0; } return n; };
  assert.ok(same() > 10);
  // Gardé : la même réponse, sans recalcul.
  const draft = all().find(p => !p.series_checked && p.status === 'draft' && s.forPhoto(p).length);
  assert.equal(s.forPhoto(draft), s.forPhoto(draft));
  // Photos rangées, publiées, dépubliées, changées de série : toujours les mêmes propositions qu'un calcul complet.
  const ids = all().map(p => p.id).filter(id => vecs.has(id));
  for (let step = 0; step < 12; step++) {
    const id = ids[(step * 37) % ids.length], cat = cats[step % 6];
    if (step % 4 === 0) db.prepare('UPDATE photos SET series_checked = 1, category_id = ? WHERE id = ?').run(cat, id);
    else if (step % 4 === 1) db.prepare("UPDATE photos SET status = 'draft', series_checked = 0 WHERE id = ?").run(id);
    else if (step % 4 === 2) db.prepare("UPDATE photos SET status = 'published' WHERE id = ?").run(id);
    else db.prepare('UPDATE photos SET category_id = ? WHERE id = ?').run(cat, id);
    same();
  }
  // « Aujourd'hui » et la photothèque, en arrière-plan au démarrage : tout est prêt d'avance.
  assert.ok(await s.warm() > 0);
});

test('séries proposées : une photo supprimée pendant son analyse n’arrête pas l’analyse des autres', async t => {
  const ctx = await setup(t, { seeded: true });
  const ids = photoIds(ctx);
  const victim = ids[5], victimFile = ctx.db.prepare('SELECT file FROM photos WHERE id = ?').pluck().get(victim);
  const base = fakeImageModel();
  const model = { ...base, embed: async file => { if (file.endsWith(victimFile)) ctx.db.prepare('DELETE FROM photos WHERE id = ?').run(victim); return base.embed(file); } };
  const s = createSeriesSuggest({ db: ctx.db, storageDir: ctx.app.config.storageDir, model });
  s.enable();
  await s.idle();
  const st = s.state();
  assert.deepEqual([st.status, st.error, st.done, st.total], ['ready', null, ids.length - 1, ids.length - 1]);
});

// ---------- mots-clés et traducteur ----------

test('vocabulaire : aucune forme partagée par deux mots (« Straße » = rue, plus route) ; empreintes liées à la liste', () => {
  const key = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
  const owner = new Map();
  for (const [i, v] of VOCABULARY.entries()) {
    for (const l of ['fr', 'en', 'de']) {
      const k = key(v[l]);
      assert.ok(!owner.has(k) || owner.get(k) === i, `« ${v[l]} » sert pour « ${VOCABULARY[owner.get(k)]?.fr} » et pour « ${v.fr} »`);
      owner.set(k, i);
    }
  }
  assert.deepEqual(formsOf('Straße'), ['rue', 'street', 'Straße']);
  assert.deepEqual(formsOf('road'), ['route', 'road', 'Landstraße']);
  // Les empreintes (scripts/vocabulaire.mjs) ont été calculées pour cette liste, dans cet ordre.
  const meta = JSON.parse(fs.readFileSync(new URL('../server/vocabulaire-vecteurs.json', import.meta.url), 'utf8'));
  assert.deepEqual(meta, { n: VOCABULARY.length, sha256: VOCABULARY_SHA256 });
});

test('traducteur : ses messages d’erreur sont traduits en entier (anglais, allemand)', () => {
  const en = translator('en'), de = translator('de');
  const slow = 'Le traducteur met trop de temps à répondre (premier lancement : il charge ses modèles). Réessayez dans un instant.';
  const down = 'Traducteur injoignable : vérifiez que le conteneur LibreTranslate tourne.';
  assert.equal(en.msg(slow), 'The translator is taking too long to answer (first start: it is loading its models). Try again in a moment.');
  assert.equal(de.msg(down), 'Übersetzer nicht erreichbar: Prüfen Sie, ob der LibreTranslate-Container läuft.');
  // Tous les messages de server/translate.js ont leur traduction exacte (pas seulement un morceau reconnu).
  const src = fs.readFileSync(new URL('../server/translate.js', import.meta.url), 'utf8');
  const msgs = [...src.matchAll(/'([^'\n]+)'/g)].map(m => m[1]).filter(m => /^\p{Lu}/u.test(m) && m.endsWith('.'));
  assert.ok(msgs.includes(slow) && msgs.includes(down));
  for (const m of msgs) for (const t of [en, de]) assert.notEqual(t.msg(m), m, m);
});
