import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { readExif, exifWork } from '../server/exif.js';
import { importOriginal, ImportError, takenOnFromExif, takenTimeFromExif } from '../server/media.js';
import { parseReply, verifyToken } from '../server/timestamp.js';
import { createProofService } from '../server/proofs.js';
import { processEmblem, processShare } from '../server/brand.js';
import { overlayFor } from '../server/watermark.js';
import { fillText } from '../server/variants.js';
import { widthsFor, variantName } from '../server/images.js';
import { zip } from '../server/zip.js';
import { meilleur, meilleurAsync } from './duree.js';

// Non-régression de la revue de sécurité et de code du 16 octobre 2026, sous-système « media » : EXIF piégé (lecture
// bornée), import (décodage réel, HEIC, profondeur, panorama vertical), chaîne de la TSA, identifiant de photo repris
// (preuves, variantes), cache partagé des variantes, ménage des fichiers temporaires, marque (orientation, taille,
// image de partage, favicon), filigrane net, date EXIF nulle, messages sans chemin, fuseau de Paris.

const FIXTURES = new URL('./fixtures/', import.meta.url);
const FREETSA_CA = new URL('../assets/tsa/freetsa-cacert.pem', import.meta.url).pathname;
const FREETSA_REPLY = fs.readFileSync(new URL('freetsa-deux-regards.tsr', FIXTURES));
const DATA = 'deux regards';
const SHA = crypto.createHash('sha256').update(DATA).digest('hex');

// ---------- fabriques ----------

// Bloc EXIF piégé : IFD0 de n balises BYTE de 4 milliards de valeurs ; Exif, GPS et IFD suivant pointent sur l'IFD0.
function exifBomb(n, size) {
  const tiff = Buffer.alloc(size);
  tiff.write('II', 0, 'latin1'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4); tiff.writeUInt16LE(n, 8);
  let o = 10;
  for (let i = 0; i < n; i++, o += 12) {
    tiff.writeUInt16LE(i === 0 ? 0x8769 : i === 1 ? 0x8825 : 0x1000 + i, o);
    if (i < 2) { tiff.writeUInt16LE(4, o + 2); tiff.writeUInt32LE(1, o + 4); tiff.writeUInt32LE(8, o + 8); }
    else { tiff.writeUInt16LE(1, o + 2); tiff.writeUInt32LE(0xffffffff, o + 4); tiff.writeUInt32LE(0, o + 8); }
  }
  tiff.writeUInt32LE(8, o);
  return Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
}
// JPEG avec ce bloc en segment APP1, juste après SOI.
function withApp1(jpeg, payload) {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), len, payload, jpeg.subarray(2)]);
}
// PNG réduit à son en-tête (aucun pixel) : metadata() le lit, un décodage échoue.
function pngHeader(width, height, depth = 8, colorType = 2) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = depth; ihdr[9] = colorType;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc(0))), chunk('IEND', Buffer.alloc(0))]);
}
// HEIC minimal (conteneur HEIF, image hvc1) : l'en-tête se lit, le serveur ne sait pas décoder le HEVC.
function heic(width = 64, height = 48) {
  const u8 = n => Buffer.from([n]);
  const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]); };
  const full = (type, v, ...parts) => box(type, u8(v), Buffer.alloc(3), ...parts);
  const hvcC = box('hvcC', u8(1), u8(1), u32(0x60000000), Buffer.alloc(6), u8(90), u16(0xf000), u8(0xfc), u8(0xfd), u8(0xf8), u8(0xf8), u16(0), u8(0x0f), u8(0));
  const data = Buffer.alloc(64, 0x42);
  const build = offset => Buffer.concat([
    box('ftyp', Buffer.from('heic'), u32(0), Buffer.from('mif1heic')),
    full('meta', 0,
      full('hdlr', 0, u32(0), Buffer.from('pict'), Buffer.alloc(12), u8(0)),
      full('pitm', 0, u16(1)),
      full('iinf', 0, u16(1), full('infe', 2, u16(1), u16(0), Buffer.from('hvc1'), u8(0))),
      full('iloc', 0, u8(0x44), u8(0), u16(1), u16(1), u16(0), u16(1), u32(offset), u32(data.length)),
      box('iprp', box('ipco', hvcC, full('ispe', 0, u32(width), u32(height))), full('ipma', 0, u32(1), u16(1), u8(2), u8(0x81), u8(0x02)))),
    box('mdat', data),
  ]);
  return build(build(0).length - data.length);
}
const tmpDir = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'site-photo-media-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
async function importBuffer(t, buf) {
  const dir = tmpDir(t);
  const tmp = path.join(dir, 'envoi');
  fs.writeFileSync(tmp, buf);
  return importOriginal(dir, tmp);
}

// Session d'un rôle donné (voir revue-securite.test.js), avec envoi de fichiers.
async function world(t, options = {}) {
  const ctx = await setup(t, { seeded: true, ...options });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const as = (sub, roles, authorId = null) => {
    ctx.app.accounts.ensure({ sub, name: sub, roles });
    if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token };
    return {
      csrf,
      get: url => ctx.app.inject({ url, cookies, headers: { accept: 'text/html' } }),
      post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
      upload(url, fields, file) {
        const boundary = `----t${crypto.randomBytes(6).toString('hex')}`;
        const part = (name, value, filename) => Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${filename ? `; filename="${filename}"\r\nContent-Type: application/octet-stream` : ''}\r\n\r\n`), Buffer.from(value), Buffer.from('\r\n')]);
        const payload = Buffer.concat([part('_csrf', csrf), ...Object.entries(fields).map(([k, v]) => part(k, String(v))), part('photos', file.data, file.name), Buffer.from(`--${boundary}--\r\n`)]);
        return ctx.app.inject({ method: 'POST', url, cookies, payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'application/json' } });
      },
    };
  };
  return { ...ctx, seb, as };
}
const smallJpeg = () => sharp({ create: { width: 64, height: 64, channels: 3, background: '#468' } }).jpeg().toBuffer();

// ---------- A106 : EXIF piégé ----------

test('EXIF piégé : lecture bornée, ignorée en quelques millisecondes ; un EXIF réel est lu comme avant', async () => {
  const bomb = exifBomb(5400, 65_000);
  assert.ok(exifWork(bomb) > 1e9);                                      // ce qu'exif-reader aurait parcouru
  assert.equal(readExif(bomb), null);
  // Meilleur de 5 essais : la charge n'allonge qu'une mesure. Lue en entier, cette bombe coûterait plus d'un milliard de pas.
  assert.ok(meilleur(() => readExif(bomb)) < 500, 'lecture bornée');
  const real = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#888' } })
    .withExif({ IFD0: { Make: 'Canon' }, IFD2: { DateTimeOriginal: '2024:02:29 23:59:59' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 24/1', GPSLongitudeRef: 'E', GPSLongitude: '2/1 21/1 3/1' } })
    .jpeg().toBuffer();
  const exif = (await sharp(real).metadata()).exif;
  assert.equal(readExif(exif).Image.Make, 'Canon');
  assert.equal(takenOnFromExif(exif), '2024-02-29');
  // À l'import : orientedSize ne relit plus le bloc trois fois, et ne fige plus le serveur.
  // Durée relative à un import ordinaire de la même image, mesurés l'un après l'autre sous la même charge.
  const small = await smallJpeg();
  const ordinaire = await meilleurAsync(() => importBuffer({ after() {} }, small), 2);
  let r;
  const piege = await meilleurAsync(async () => { r = await importBuffer({ after() {} }, withApp1(small, exifBomb(5400, 65_000))); }, 2);
  assert.ok(piege < ordinaire * 4 + 500, `import en ${Math.round(piege)} ms, contre ${Math.round(ordinaire)} ms pour la même image sans bombe`);
  assert.equal(r.takenOn, null);
});

test('EXIF piégé envoyé par un photographe : réponse immédiate, photo gardée sans date', async t => {
  const c = await world(t);
  const ph = c.as('seb', ['photographe'], c.seb);
  const file = { name: 'piege.jpg', data: withApp1(await smallJpeg(), exifBomb(1200, 15_000)) };
  // Durée relative à l'envoi de la même image sans bombe (8,3 s contre moins d'une demi-seconde avant le correctif).
  const ordinaire = performance.now();
  const sain = await ph.upload('/admin/photos/envoi', { category_id: 1, author_id: c.seb }, { name: 'sain.jpg', data: await smallJpeg() });
  const ref = performance.now() - ordinaire;
  assert.equal(sain.statusCode, 200, sain.body);
  const t0 = performance.now();
  const res = await ph.upload('/admin/photos/envoi', { category_id: 1, author_id: c.seb }, file);
  const ms = performance.now() - t0;
  assert.equal(res.statusCode, 200, res.body);
  assert.ok(ms < ref * 4 + 1000, `réponse en ${Math.round(ms)} ms, contre ${Math.round(ref)} ms pour la même image sans bombe`);
  assert.equal(c.db.prepare('SELECT taken_on FROM photos WHERE id = ?').pluck().get(res.json().id), null);
});

// ---------- A115 : date EXIF nulle ----------

test('date EXIF nulle (« 0000:00:00 00:00:00 ») : ni jour ni heure ; une vraie date donne les deux', async () => {
  const exifOf = async date => (await sharp(await smallJpeg()).withExif({ IFD2: { DateTimeOriginal: date } }).jpeg().toBuffer().then(b => sharp(b).metadata())).exif;
  const zero = await exifOf('0000:00:00 00:00:00');
  assert.equal(takenOnFromExif(zero), null);
  assert.equal(takenTimeFromExif(zero), '');
  const real = await exifOf('2024:02:29 23:59:59');
  assert.equal(takenOnFromExif(real), '2024-02-29');
  assert.equal(takenTimeFromExif(real), '23:59');
});

// ---------- A110, A107, A114 : import ----------

test('import : HEIC d’iPhone et fichier tronqué refusés avec leur raison, AVIF rangé en .avif', async t => {
  await assert.rejects(importBuffer(t, heic()), err => err instanceof ImportError && /HEIC \(iPhone\) non pris en charge/.test(err.message));
  const big = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#468' } })
    .composite([{ input: Buffer.alloc(1200 * 800 * 3).map((_, i) => (i * 7919) % 251), raw: { width: 1200, height: 800, channels: 3 } }]).jpeg().toBuffer();
  const cut = big.subarray(0, big.length >> 1);
  assert.equal((await sharp(cut).metadata()).width, 1200);                // l'en-tête seul ne dit rien
  await assert.rejects(importBuffer(t, cut), /image incomplète ou abîmée/);
  const avif = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#468' } }).avif({ effort: 0 }).toBuffer();
  assert.match((await importBuffer(t, avif)).file, /\.avif$/);
});

test('import : mémoire de décodage et hauteur des variantes bornées, sans rien décoder', async t => {
  // 7000 × 7000 en RVBA 16 bits : 392 Mo décodés (une image RVB 8 bits de 120 Mpx en fait 360).
  await assert.rejects(importBuffer(t, pngHeader(7000, 7000, 16, 6)), /image trop lourde à décoder/);
  // 2400 × 21 000 (50 Mpx) : variante de 2000 px de large et 17 500 px de haut, que WebP ne sait pas écrire.
  await assert.rejects(importBuffer(t, pngHeader(2400, 21_000)), /image trop haute pour le site/);
  // Les mêmes contrôles laissent passer une image ordinaire, refusée ici seulement parce qu'elle n'a aucun pixel.
  await assert.rejects(importBuffer(t, pngHeader(7000, 7000)), /image incomplète ou abîmée/);
});

test('import par la page (photo par photo) : un HEIC est refusé tout de suite, rien ne reste en brouillon', async t => {
  const c = await world(t);
  const ph = c.as('seb', ['photographe'], c.seb);
  const before = c.db.prepare('SELECT COUNT(*) FROM photos').pluck().get();
  const res = await ph.upload('/admin/photos/envoi', { category_id: 1, author_id: c.seb }, { name: 'IMG_0001.HEIC', data: heic() });
  assert.equal(res.statusCode, 422);
  assert.match(res.json().error, /HEIC \(iPhone\) non pris en charge : exportez la photo en JPEG/);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM photos').pluck().get(), before);
  assert.deepEqual(fs.readdirSync(path.join(c.config.storageDir, 'tmp')), []);
});

// ---------- A109 : chaîne de la TSA ----------

test('TSA à AC intermédiaire : jeton vérifié jusqu’à la racine seule (intermédiaire joint au jeton)', () => {
  const p = parseReply(fs.readFileSync(new URL('tsa-chaine.tsr', FIXTURES)));
  const root = fs.readFileSync(new URL('tsa-chaine-racine.pem', FIXTURES), 'utf8');
  assert.equal(p.certs.length, 2);                                        // TSA + intermédiaire
  assert.equal(p.hashedMessage, SHA);
  const v = verifyToken(p, { caPem: root });
  assert.equal(v.chained, true);
  assert.match(v.signer, /TSA de test Nicephos/);
  assert.throws(() => verifyToken(p, { caPem: fs.readFileSync(FREETSA_CA, 'utf8') }), /autorité attendue/);
});

// ---------- A029 : identifiant de photo repris ----------

async function quiet(c) {
  await c.app.ready();
  await Promise.all([c.app.proofs.idle(), c.app.variants.idle(), c.app.locator.idle()]);
}
const addPhoto = (c, { id = null, file, sha256 = null }) => Number(c.db.prepare(`INSERT INTO photos (id, slug, title, category_id, author_id, status, position, file, width, height, sha256, gps_checked, taken_time)
  VALUES (?, ?, 'Test', 1, 1, 'draft', 99, ?, 10, 10, ?, 1, '')`).run(id, `test-${crypto.randomUUID().slice(0, 8)}`, file, sha256).lastInsertRowid);

test('horodatage : photo supprimée puis identifiant repris pendant la requête, aucun jeton rattaché à la nouvelle', async t => {
  const c = await world(t);
  await quiet(c);
  const originals = path.join(c.config.storageDir, 'originals');
  const oldFile = `${crypto.randomUUID()}.jpg`;
  fs.writeFileSync(path.join(originals, oldFile), DATA);
  const id = addPhoto(c, { file: oldFile, sha256: SHA });
  c.db.prepare('INSERT INTO timestamps (photo_id, sha256, tsa, status, error, attempts, updated_at) SELECT id, sha256, \'x\', \'ok\', NULL, 1, 0 FROM photos WHERE id != ?').run(id);
  let release;
  const gate = new Promise(r => { release = r; });
  let asked;
  const inFlight = new Promise(r => { asked = r; });
  const nonce = Buffer.from(parseReply(FREETSA_REPLY).nonce.toString(16).padStart(16, '0'), 'hex');
  const fetchImpl = async () => { asked(); await gate; return new Response(FREETSA_REPLY, { status: 200 }); };
  const svc = createProofService({ db: c.db, storageDir: c.config.storageDir, tsa: { url: 'https://tsa.example/tsr', caFile: FREETSA_CA }, fetchImpl, nonce: () => nonce });
  t.after(() => svc.stop());
  const pass = svc.schedule();
  await inFlight;
  // Pendant la requête : la photo (d'identifiant maximal) est supprimée, une autre prend son identifiant.
  c.db.prepare('DELETE FROM photos WHERE id = ?').run(id);
  const newFile = `${crypto.randomUUID()}.jpg`;
  assert.equal(addPhoto(c, { file: newFile, sha256: 'f'.repeat(64) }), id);
  release();
  await pass;
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM timestamps WHERE photo_id = ?').pluck().get(id), 0);
});

test('empreinte : identifiant repris pendant le calcul, l’empreinte de l’ancien fichier n’est pas écrite', { timeout: 20_000 }, async t => {
  const c = await world(t);
  await quiet(c);
  const originals = path.join(c.config.storageDir, 'originals');
  const fifo = path.join(originals, `${crypto.randomUUID()}.jpg`);
  try { execFileSync('mkfifo', [fifo]); } catch { t.skip('mkfifo indisponible'); return; }
  let fed = false;
  const feed = () => { if (!fed) { fed = true; fs.writeFileSync(fifo, DATA); } };
  t.after(feed);
  const id = addPhoto(c, { file: path.basename(fifo) });                  // empreinte à calculer
  const svc = createProofService({ db: c.db, storageDir: c.config.storageDir, tsa: { url: null } });
  t.after(() => svc.stop());
  const pass = svc.schedule();
  await new Promise(r => setTimeout(r, 100));                             // lecture bloquée sur le FIFO
  c.db.prepare('DELETE FROM photos WHERE id = ?').run(id);
  assert.equal(addPhoto(c, { file: `${crypto.randomUUID()}.jpg`, sha256: 'e'.repeat(64) }), id);
  feed();
  await pass;
  assert.equal(c.db.prepare('SELECT sha256 FROM photos WHERE id = ?').pluck().get(id), 'e'.repeat(64));
});

test('fiche de preuve : un jeton d’un autre original n’est ni servi ni proposé au téléchargement', async t => {
  const c = await world(t);
  await quiet(c);
  const admin = c.as('root', ['admin']);
  const p = c.db.prepare("SELECT id, sha256 FROM photos WHERE sha256 IS NOT NULL LIMIT 1").get();
  c.db.prepare(`INSERT INTO timestamps (photo_id, sha256, tsa, status, token, gen_time, serial, signer, attempts, updated_at)
    VALUES (?, ?, 'https://tsa.example/tsr', 'ok', ?, '2026-10-10T10:55:24.000Z', '1', 'CN=x', 1, 0)
    ON CONFLICT(photo_id) DO UPDATE SET sha256 = excluded.sha256, status = 'ok', token = excluded.token, gen_time = excluded.gen_time`).run(p.id, SHA, FREETSA_REPLY);
  assert.notEqual(p.sha256, SHA);
  assert.equal((await admin.get(`/admin/photos/${p.id}/preuve.tsr`)).statusCode, 404);
  assert.equal((await admin.get(`/admin/photos/${p.id}/preuve.txt`)).statusCode, 404);
  assert.doesNotMatch((await admin.get(`/admin/photos/${p.id}`)).body, /preuve\.tsr/);
});

test('suppression d’une photo : son journal Instagram ne se rattache pas à la photo qui reprend l’identifiant', async t => {
  const c = await world(t);
  await quiet(c);
  const admin = c.as('root', ['admin']);
  const id = addPhoto(c, { file: `${crypto.randomUUID()}.jpg` });
  c.db.prepare("INSERT INTO instagram_events (at, photo_id, level, message) VALUES (?, ?, 'info', 'mise en file')").run(Date.now(), id);
  assert.equal((await admin.post(`/admin/photos/${id}/delete`)).statusCode, 303);
  assert.equal(c.db.prepare('SELECT photo_id FROM instagram_events').pluck().get(), null);
});

// ---------- A120 : messages sans chemin ----------

test('messages à l’admin : ni message système ni chemin absolu (preuve, état des images)', async t => {
  const c = await world(t);
  await quiet(c);
  const id = addPhoto(c, { file: `${crypto.randomUUID()}.jpg`, sha256: SHA });
  c.db.prepare(`INSERT INTO timestamps (photo_id, sha256, tsa, status, token, gen_time, serial, signer, attempts, updated_at)
    VALUES (?, ?, 'x', 'ok', ?, '2026-10-10T10:55:24.000Z', '1', 'CN=x', 1, 0)`).run(id, SHA, FREETSA_REPLY);
  const v = await c.app.proofs.verify(id);                                // original absent
  assert.deepEqual(v, { ok: false, reason: 'original introuvable ou illisible' });
  await c.app.variants.schedule();
  const errors = c.app.variants.status().errors;
  assert.deepEqual(errors.map(e => [e.id, e.error]), [[id, 'original introuvable']]);
  assert.doesNotMatch(JSON.stringify(errors), /\//);
});

// ---------- A108 : cache partagé ----------

test('variantes publiques : un an chez le visiteur, un jour au plus dans le cache de Cloudflare', async t => {
  const c = await world(t);
  const p = c.db.prepare("SELECT file, width, variant_key FROM photos WHERE status = 'published' LIMIT 1").get();
  const res = await c.app.inject(`/media/${variantName(p.file, widthsFor(p.width)[0], 'webp', p.variant_key)}`);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['cache-control'], /max-age=31536000.*immutable/);
  assert.equal(res.headers['cdn-cache-control'], 'public, max-age=86400');
});

// ---------- A111 : ménage des fichiers temporaires ----------

test('ménage : un fichier temporaire récent (rendu en cours, autre processus) est gardé, un ancien effacé', async t => {
  const c = await world(t);
  await quiet(c);
  const dir = path.join(c.config.storageDir, 'variants');
  const fresh = path.join(dir, `${crypto.randomUUID()}-640.avif.0a1b2c3d.tmp`);
  const stale = path.join(dir, `${crypto.randomUUID()}-640.avif.4e5f6a7b.tmp`);
  fs.writeFileSync(fresh, 'x');
  fs.writeFileSync(stale, 'x');
  const old = (Date.now() - 2 * 3600 * 1000) / 1000;
  fs.utimesSync(stale, old, old);
  await c.app.variants.schedule();
  assert.ok(fs.existsSync(fresh));
  assert.ok(!fs.existsSync(stale));
});

// ---------- A112, A117, A119 : marque ----------

test('emblème photographié au téléphone : orientation EXIF appliquée', async () => {
  // Stocké 100 × 400 (barre verticale), affiché 400 × 100 (orientation 6) : le masque doit être horizontal.
  const svg = Buffer.from('<svg width="100" height="400"><rect width="100" height="400" fill="#fff"/><rect x="40" y="20" width="20" height="360" fill="#000"/></svg>');
  const photo = await sharp(svg).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const { width, height } = await processEmblem(photo);
  assert.ok(width > height, `masque ${width} × ${height}`);
});

test('image de marque trop grande : « image trop grande », pas « illisible »', async () => {
  await assert.rejects(processEmblem(pngHeader(6100, 6100)), /image trop grande \(6000 px de côté au plus\)/);
  await assert.rejects(processShare(pngHeader(6100, 6100)), /image trop grande \(6000 px de côté au plus\)/);
  await assert.rejects(processEmblem(Buffer.from('pas une image')), /pas une image lisible/);
});

test('image de partage détourée : un logo sombre est posé sur du blanc, un logo clair sur du noir', async () => {
  const logo = color => sharp(Buffer.from(`<svg width="1200" height="630"><circle cx="600" cy="315" r="200" fill="${color}"/></svg>`)).png().toBuffer();
  const corner = async buf => (await sharp((await processShare(buf)).image).extract({ left: 0, top: 0, width: 4, height: 4 }).greyscale().raw().toBuffer())[0];
  assert.ok(await corner(await logo('#000')) > 240, 'fond blanc derrière un logo noir');
  assert.ok(await corner(await logo('#fff')) < 15, 'fond noir derrière un logo blanc');
});

// ---------- A118 : favicon ----------

test('/favicon.ico : redirection temporaire, gardée un jour seulement', async t => {
  const c = await world(t);
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('brand', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ favicon64: 'favicon-aaaa1111-64.png' }));
  const res = await c.app.inject('/favicon.ico');
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, '/brand/favicon-aaaa1111-64.png');
  assert.equal(res.headers['cache-control'], 'public, max-age=86400');
});

// ---------- A113 : filigrane texte net ----------

test('filigrane texte en plein cadre : dessiné à sa taille, pas agrandi en image (bords nets)', async () => {
  const mark = { kind: 'text', text: '© Julien', font: 'serif', tone: 'light', position: 'plein', opacity: 100, size: 22, margin: 3, minWidth: 0 };
  const [layer] = await overlayFor(mark, 2000, 1333);
  const { data } = await sharp(layer.input).raw().toBuffer({ resolveWithObject: true });
  let edge = 0, full = 0;
  for (let i = 3; i < data.length; i += 4) { if (data[i] > 250) full++; else if (data[i] > 5) edge++; }
  // Agrandi ×4 depuis 160 pt, le bord flou faisait la moitié de la surface pleine (0,54) ; dessiné à la taille, 0,12.
  assert.ok(edge / full < 0.3, `bord / plein : ${(edge / full).toFixed(2)}`);
});

// ---------- A121 : heure de Paris ----------

test('année et dates d’export en heure de Paris (le serveur tourne en UTC)', () => {
  // Importée le 1er janvier 2027 à 0 h 30 à Paris, sans date de prise de vue.
  assert.equal(fillText('© {auteur} {annee}', { author: 'Julien', taken_on: null, created_at: '2026-12-31 23:30:00' }, ''), '© Julien 2027');
  assert.equal(fillText('{annee}', { author: 'Julien', taken_on: '2024-03', created_at: '2026-12-31 23:30:00' }, ''), '2024');
  const z = zip([{ name: 'a.txt', data: 'x' }], new Date('2026-12-31T23:30:10Z'));
  const time = z.readUInt16LE(10);
  const date = z.readUInt16LE(12);
  assert.deepEqual([(date >> 9) + 1980, (date >> 5) & 15, date & 31, time >> 11, (time >> 5) & 63], [2027, 1, 1, 0, 30]);
});
