import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { setup } from './helpers.js';
import { specFor, normalizeWatermark, normalizeExif, fillText, WATERMARK_DEFAULTS, EXIF_DEFAULTS } from '../server/variants.js';
import { renderVariants, variantName, VARIANT_RE, widthsFor } from '../server/images.js';

const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
const PHOTO = { id: 1, author: 'Julien', title: 'Quai', taken_on: '2024-03', created_at: '2026-01-01 10:00:00', watermark: null };
const ctx = (wm = {}, exif = {}) => ({ watermark: { ...WATERMARK_DEFAULTS, ...wm }, exif: { ...EXIF_DEFAULTS, ...exif }, siteName: 'Nicephos', watermarkDir: '/tmp' });

// ---------- règles ----------

test('sans filigrane ni métadonnée : empreinte vide, noms de variantes inchangés', () => {
  assert.deepEqual(specFor(PHOTO, ctx()), { key: '', mark: null, meta: null });
  assert.equal(variantName('a.jpg', 640, 'webp', ''), 'a-640.webp');
  assert.equal(variantName('a.jpg', 640, 'webp', '0123abcd'), 'a-0123abcd-640.webp');
});

test('filigrane texte : variables remplacées, empreinte stable et sensible aux réglages', () => {
  const a = specFor(PHOTO, ctx({ enabled: true, text: '© {auteur} {annee} · {site}' }));
  assert.equal(a.mark.text, '© Julien 2024 · Nicephos');
  assert.match(a.key, /^[0-9a-f]{8}$/);
  assert.equal(specFor(PHOTO, ctx({ enabled: true, text: '© {auteur} {annee} · {site}' })).key, a.key);
  assert.notEqual(specFor(PHOTO, ctx({ enabled: true, text: '© {auteur} {annee} · {site}', opacity: 61 })).key, a.key);
  assert.notEqual(specFor({ ...PHOTO, author: 'Sébastien' }, ctx({ enabled: true, text: '© {auteur}' })).key,
    specFor(PHOTO, ctx({ enabled: true, text: '© {auteur}' })).key);
  assert.equal(fillText('{annee}', { ...PHOTO, taken_on: null }, ''), '2026');   // repli : année d'import
});

test('filigrane désactivé pour une photo, logo absent, texte vide : pas de filigrane', () => {
  assert.equal(specFor({ ...PHOTO, watermark: 0 }, ctx({ enabled: true })).mark, null);
  assert.equal(specFor(PHOTO, ctx({ enabled: true, kind: 'image', image: null })).mark, null);
  assert.equal(specFor(PHOTO, ctx({ enabled: true, text: '   ' })).mark, null);
  assert.equal(specFor(PHOTO, ctx({ enabled: false })).mark, null);
});

test('métadonnées : droits écrits par le site, empreinte dédiée', () => {
  const s = specFor(PHOTO, ctx({}, { mode: 'rights' }));
  assert.deepEqual(s.meta, { mode: 'rights', artist: 'Julien', copyright: '© 2024 Julien', credit: 'Nicephos', webStatement: null });
  assert.equal(specFor(PHOTO, { ...ctx({}, { mode: 'rights' }), rightsUrl: 'https://x.example/droits' }).meta.webStatement, 'https://x.example/droits');
  assert.notEqual(s.key, '');
  assert.notEqual(specFor(PHOTO, ctx({}, { mode: 'shooting' })).key, s.key);
});

test('les valeurs du formulaire sont bornées ou remplacées par défaut', () => {
  const w = normalizeWatermark({ wm_enabled: 'on', wm_kind: 'svg', wm_text: 'a\u0000b'.padEnd(200, 'x'), wm_font: '../../etc', wm_position: 'partout',
    wm_opacity: '500', wm_size: '-3', wm_margin: 'abc', wm_min_width: '777', wm_tone: 'rouge' }, { image: 'logo.png' });
  assert.deepEqual(w, { enabled: true, kind: 'text', text: 'ab'.padEnd(80, 'x'), font: 'serif', tone: 'light', position: 'bas-droite',
    opacity: 100, size: 3, margin: 3, minWidth: 0, image: 'logo.png' });
  assert.equal(normalizeWatermark({}).enabled, false);
  assert.deepEqual(normalizeExif({ exif_mode: 'tout' }), { mode: 'none' });
  assert.deepEqual(normalizeExif({ exif_mode: 'shooting' }), { mode: 'shooting' });
});

// ---------- rendu ----------

// Original 1600×1000 gris uni, avec EXIF de prise de vue et GPS.
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'originals'));
  const file = '11111111-1111-1111-1111-111111111111.jpg';
  await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#808080' } }).jpeg()
    .withExif({ IFD0: { Make: 'FUJIFILM', Model: 'X-T5', Artist: 'Original' }, IFD2: { ExposureTime: '1/250', FNumber: '28/10', ISOSpeedRatings: '400', LensModel: 'XF23mm' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '47/1 28/1 0/1' } })
    .toFile(path.join(dir, 'originals', file));
  return { dir, file, out: (w, f, key) => path.join(dir, 'variants', variantName(file, w, f, key)) };
}
const exifOf = async f => { const m = await sharp(f).metadata(); return m.exif ? exifReader(m.exif) : null; };
// stats() ignore extract() : la zone est d'abord extraite dans un tampon.
const mean = async (f, region) => (await sharp(await sharp(f).extract(region).toBuffer()).stats()).channels[0].mean;

test('rendu : filigrane texte en bas à droite, rien ailleurs', async t => {
  const { dir, file, out } = await fixture(t);
  await renderVariants(dir, file, { key: 'aaaaaaaa', mark: { kind: 'text', text: 'COPYRIGHT', font: 'sans', tone: 'light', position: 'bas-droite', opacity: 100, size: 30, margin: 2, minWidth: 0 } });
  const f = out(1280, 'webp', 'aaaaaaaa');
  const zone = async region => (await sharp(await sharp(f).extract(region).toBuffer()).stats()).channels[0];
  assert.ok((await zone({ left: 1280 - 420, top: 800 - 120, width: 400, height: 100 })).max > 240);   // texte clair posé
  assert.ok((await zone({ left: 0, top: 0, width: 400, height: 300 })).max < 140);                    // coin opposé intact
});

test('rendu : mosaïque sur toute l’image, seuil de taille respecté', async t => {
  const { dir, file, out } = await fixture(t);
  await renderVariants(dir, file, { key: 'bbbbbbbb', mark: { kind: 'text', text: 'X', font: 'mono', tone: 'dark', position: 'mosaique', opacity: 100, size: 8, margin: 0, minWidth: 1280 } });
  const quarter = async (w, h) => Promise.all([0, 1].map(i => mean(out(w, 'webp', 'bbbbbbbb'), { left: i * (w / 2), top: 0, width: w / 2, height: h })));
  for (const m of await quarter(1280, 800)) assert.ok(m < 126, `motif présent partout (${m})`);
  for (const m of await quarter(640, 400)) assert.ok(Math.abs(m - 128) < 3, 'vignette 640 épargnée');
});

test('rendu : logo PNG transparent à l’opacité voulue', async t => {
  const { dir, file, out } = await fixture(t);
  const logo = path.join(dir, 'logo.png');
  await sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toFile(logo);
  await renderVariants(dir, file, { key: 'cccccccc', mark: { kind: 'image', imagePath: logo, position: 'centre', opacity: 50, size: 20, margin: 0, minWidth: 0 } });
  const m = await mean(out(1280, 'webp', 'cccccccc'), { left: 600, top: 380, width: 80, height: 40 });
  assert.ok(m > 180 && m < 205, `blanc à 50 % sur gris ≈ 192 (${m})`);
});

test('métadonnées : aucune, droits, prise de vue sans GPS, tout', async t => {
  const { dir, file, out } = await fixture(t);
  await renderVariants(dir, file, {});
  assert.equal(await exifOf(out(640, 'webp', '')), null);

  await renderVariants(dir, file, { key: 'dddddddd', meta: { mode: 'rights', artist: 'Sébastien <&>', copyright: '© 2024 Sébastien', credit: 'Nicephos', webStatement: 'https://x.example/droits' } });
  // Mentions IPTC en XMP : accents conservés, valeurs échappées.
  for (const f of ['avif', 'webp']) {
    const xmp = (await sharp(out(640, f, 'dddddddd')).metadata()).xmp.toString();
    assert.match(xmp, /<dc:creator><rdf:Seq><rdf:li>Sébastien &lt;&amp;&gt;<\/rdf:li>/);
    assert.match(xmp, /<rdf:li xml:lang="x-default">© 2024 Sébastien<\/rdf:li>/);
    assert.match(xmp, /<photoshop:Credit>Nicephos<\/photoshop:Credit>/);
    assert.match(xmp, /<xmpRights:WebStatement>https:\/\/x\.example\/droits<\/xmpRights:WebStatement>/);
    assert.match(xmp, /<plus:LicensorURL>https:\/\/x\.example\/droits<\/plus:LicensorURL>/);
  }
  assert.equal((await sharp(out(640, 'webp', '')).metadata()).xmp, undefined);   // mode « aucune » : pas de XMP
  const rights = await exifOf(out(640, 'avif', 'dddddddd'));
  assert.equal(rights.Image.Artist, 'Sebastien <&>');
  assert.equal(rights.Image.Copyright, '(C) 2024 Sebastien');
  assert.equal(rights.Image.Make, undefined);
  assert.equal(rights.GPSInfo, undefined);

  await renderVariants(dir, file, { key: 'eeeeeeee', meta: { mode: 'shooting', artist: 'Julien', copyright: '© 2024 Julien' } });
  const shot = await exifOf(out(640, 'webp', 'eeeeeeee'));
  assert.equal(shot.Image.Make, 'FUJIFILM');
  assert.equal(shot.Image.Artist, 'Julien');                       // l'auteur du site remplace celui de l'appareil
  assert.equal(shot.Photo.ExposureTime, 0.004);
  assert.equal(shot.Photo.LensModel, 'XF23mm');
  assert.equal(shot.GPSInfo, undefined);

  await renderVariants(dir, file, { key: 'ffffffff', meta: { mode: 'all' } });
  const all = await exifOf(out(640, 'webp', 'ffffffff'));
  assert.equal(all.Image.Artist, 'Original');
  assert.deepEqual(all.GPSInfo.GPSLatitude, [47, 28, 0]);
  assert.equal(all.Image.Orientation, 1);
});

test('VARIANT_RE reconnaît les deux formes de nom', () => {
  const id = '11111111-1111-1111-1111-111111111111';
  assert.deepEqual(VARIANT_RE.exec(`${id}-640.webp`).slice(1, 4), [id, undefined, '640']);
  assert.deepEqual(VARIANT_RE.exec(`${id}-0123abcd-1280.avif`).slice(1, 4), [id, '0123abcd', '1280']);
  assert.equal(VARIANT_RE.exec(`${id}-xyz-640.webp`), null);
});

// ---------- dans l'application ----------

async function admin(t) {
  const c = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await c.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  const cookies = cookiesOf(res);
  const csrf = c.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = opts => c.app.inject({ ...opts, cookies: { ...cookies, ...opts.cookies } });
  const post = (url, payload = {}) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  return { ...c, as, post, csrf };
}
const ENABLE = { wm_enabled: 'on', wm_kind: 'text', wm_text: '© {auteur}', wm_font: 'serif', wm_position: 'bas-droite', wm_opacity: '60', wm_size: '22', wm_margin: '3', wm_min_width: '0', exif_mode: 'rights' };

test('activer le filigrane régénère toutes les variantes et bascule le site d’un coup', async t => {
  const c = await admin(t);
  const before = c.db.prepare("SELECT * FROM photos WHERE slug = 'deux-minuit'").get();
  const w = widthsFor(before.width)[0];
  const oldUrl = `/media/${variantName(before.file, w, 'webp', '')}`;
  assert.equal((await c.app.inject(oldUrl)).statusCode, 200);

  assert.equal((await c.post('/admin/images', ENABLE)).statusCode, 303);
  await c.app.variants.idle();
  const keys = c.db.prepare('SELECT DISTINCT variant_key FROM photos').pluck().all();
  assert.ok(keys.length > 1);                                       // une empreinte par auteur et par année (© année auteur)
  assert.ok(keys.every(k => /^[0-9a-f]{8}$/.test(k)));

  const after = c.db.prepare("SELECT * FROM photos WHERE slug = 'deux-minuit'").get();
  const newUrl = `/media/${variantName(after.file, w, 'webp', after.variant_key)}`;
  assert.equal((await c.app.inject(newUrl)).statusCode, 200);
  assert.equal((await c.app.inject(oldUrl)).statusCode, 404);       // ancienne variante supprimée
  assert.match((await c.app.inject('/photo/deux-minuit')).body, new RegExp(after.variant_key));
  const files = fs.readdirSync(path.join(c.config.storageDir, 'variants')).filter(f => f.startsWith(path.parse(after.file).name));
  assert.ok(files.every(f => f.includes(after.variant_key)));
  const meta = await exifOf(path.join(c.config.storageDir, 'variants', variantName(after.file, w, 'webp', after.variant_key)));
  assert.equal(meta.Image.Artist, 'Julien');

  // Retour aux réglages par défaut : variantes brutes, noms d'origine.
  await c.post('/admin/images', { exif_mode: 'none' });
  await c.app.variants.idle();
  assert.deepEqual(c.db.prepare('SELECT DISTINCT variant_key FROM photos').pluck().all(), ['']);
  assert.equal((await c.app.inject(oldUrl)).statusCode, 200);
});

test('une photo peut être exclue du filigrane ; renommer l’auteur met ses images à jour', async t => {
  const c = await admin(t);
  await c.post('/admin/images', ENABLE);
  await c.app.variants.idle();
  const p = c.db.prepare("SELECT * FROM photos WHERE slug = 'deux-minuit'").get();
  const keyBefore = p.variant_key;

  await c.post(`/admin/photos/${p.id}`, { title: p.title, slug: p.slug, category_id: p.category_id, author_id: p.author_id, status: 'published', watermark: 'none' });
  await c.app.variants.idle();
  const excluded = c.db.prepare('SELECT watermark, variant_key FROM photos WHERE id = ?').get(p.id);
  assert.equal(excluded.watermark, 0);
  assert.notEqual(excluded.variant_key, keyBefore);                 // EXIF « droits » seulement
  assert.match((await c.as({ url: `/admin/photos/${p.id}` })).body, /value="none" checked/);

  const other = c.db.prepare("SELECT variant_key FROM photos WHERE slug = 'deux-ombres'").pluck().get();
  const julien = c.db.prepare("SELECT * FROM authors WHERE slug = 'julien'").get();
  await c.post(`/admin/auteurs/${julien.id}`, { name: 'Julien M.', slug: 'julien', bio: '', oidc_sub: '' });
  await c.app.variants.idle();
  assert.notEqual(c.db.prepare("SELECT variant_key FROM photos WHERE slug = 'deux-ombres'").pluck().get(), other);
});

test('page Images, aperçus et état de la mise à jour', async t => {
  const c = await admin(t);
  const page = await c.as({ url: '/admin/images' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Filigrane et métadonnées/);
  assert.match(page.body, /value="none" checked/);
  const saved = await c.as({ url: '/admin/images/apercu.webp' });
  assert.equal(saved.headers['content-type'], 'image/webp');
  assert.equal((await sharp(saved.rawPayload).metadata()).width, 900);      // jamais agrandie (originaux de démo : 900 px)
  const id = c.db.prepare('SELECT id FROM photos LIMIT 1').pluck().get();
  const draft = await c.post('/admin/images/apercu', { ...ENABLE, wm_enabled: '', preview_photo: String(id) });
  assert.equal(draft.headers['content-type'], 'image/webp');
  const unchanged = await c.as({ url: `/admin/images/apercu.webp?photo=${id}` });
  assert.deepEqual(draft.rawPayload, unchanged.rawPayload, 'filigrane décoché : aperçu sans filigrane');
  const marked = await c.post('/admin/images/apercu', { ...ENABLE, preview_photo: String(id) });
  assert.equal(marked.statusCode, 200);
  assert.notDeepEqual(marked.rawPayload, draft.rawPayload, 'le nouveau filigrane change réellement le rendu');
  assert.deepEqual((await c.as({ url: `/admin/images/apercu.webp?photo=${id}` })).rawPayload, unchanged.rawPayload, 'l’aperçu ne modifie pas le rendu enregistré');
  assert.deepEqual(c.db.prepare("SELECT COUNT(*) FROM settings WHERE key = 'watermark'").pluck().get(), 0);   // rien enregistré
  assert.equal((await c.post('/admin/images/apercu', { _csrf: 'faux' })).statusCode, 403);
  assert.equal((await c.app.inject('/admin/images/apercu.webp')).statusCode, 302);
  assert.deepEqual(Object.keys((await c.as({ url: '/admin/images/etat' })).json()).sort(), ['done', 'errors', 'running', 'total']);
});

function multipart(parts) {
  const boundary = '----t' + Math.random().toString(16).slice(2);
  const chunks = parts.flatMap(p => [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${p.filename ? `; filename="${p.filename}"\r\nContent-Type: application/octet-stream` : ''}\r\n\r\n`),
    Buffer.isBuffer(p.value) ? p.value : Buffer.from(String(p.value)), Buffer.from('\r\n')]);
  return { payload: Buffer.concat([...chunks, Buffer.from(`--${boundary}--\r\n`)]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'text/html' } };
}

test('logo : PNG accepté et réencodé, SVG refusé, CSRF exigé, retrait', async t => {
  const c = await admin(t);
  const send = (value, csrf = c.csrf) => c.as({ method: 'POST', url: '/admin/images/logo', ...multipart([{ name: '_csrf', value: csrf }, { name: 'logo', filename: 'logo', value }]) });
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
  const png = await sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.8 } } }).png().toBuffer();

  assert.equal((await send(png, 'faux')).statusCode, 403);
  const refused = await send(svg);
  assert.equal(refused.statusCode, 303);
  assert.equal(JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'watermark'").pluck().get() || '{}').image, undefined);

  assert.equal((await send(png)).statusCode, 303);
  const wm = JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'watermark'").pluck().get());
  assert.match(wm.image, /^[0-9a-f-]{36}\.png$/);
  assert.ok(fs.existsSync(path.join(c.config.storageDir, 'watermarks', wm.image)));
  assert.equal((await c.as({ url: '/admin/images/logo' })).statusCode, 200);

  await c.post('/admin/images', { ...ENABLE, wm_kind: 'image', exif_mode: 'none' });
  await c.app.variants.idle();
  assert.ok(c.db.prepare('SELECT variant_key FROM photos').pluck().all().every(k => k));

  await c.post('/admin/images/logo/delete');
  await c.app.variants.idle();
  assert.equal(fs.existsSync(path.join(c.config.storageDir, 'watermarks', wm.image)), false);
  assert.deepEqual(c.db.prepare('SELECT DISTINCT variant_key FROM photos').pluck().all(), ['']);   // logo absent : rien
});

test('l’import applique tout de suite le filigrane du moment', async t => {
  const c = await admin(t);
  await c.post('/admin/images', ENABLE);
  await c.app.variants.idle();
  const author = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const category = c.db.prepare('SELECT id FROM categories LIMIT 1').pluck().get();
  const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#333' } }).png().toBuffer();
  const body = multipart([{ name: '_csrf', value: c.csrf }, { name: 'author_id', value: author }, { name: 'category_id', value: category }, { name: 'photos', filename: 'n.png', value: png }]);
  const res = await c.as({ method: 'POST', url: '/admin/photos/import', ...body, headers: { ...body.headers, accept: 'application/json' } });
  const id = res.json().imported[0].id;
  const p = c.db.prepare('SELECT file, variant_key FROM photos WHERE id = ?').get(id);
  assert.match(p.variant_key, /^[0-9a-f]{8}$/);
  assert.ok(fs.existsSync(path.join(c.config.storageDir, 'variants', variantName(p.file, 900, 'webp', p.variant_key))));
});

test('au démarrage, des réglages changés hors de l’admin sont appliqués', async t => {
  const c = await setup(t, { seeded: true });
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('exif', ?)").run(JSON.stringify({ mode: 'rights' }));
  await c.app.ready();
  await c.app.variants.idle();
  assert.ok(c.db.prepare('SELECT variant_key FROM photos').pluck().all().every(k => /^[0-9a-f]{8}$/.test(k)));
});

// ---------- dessins de la marque, plein cadre, teinte automatique ----------

import { overlayFor, resolveTone } from '../server/watermark.js';

// Masque de marque comme ceux d'Apparence : forme noire dans la couche alpha, fond transparent.
async function brandMask(dir) {
  const file = path.join(dir, 'embleme-test.png');
  await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><ellipse cx="200" cy="100" rx="180" ry="80" fill="#000"/></svg>')).png().toFile(file);
  return file;
}
const solid = (dir, name, color) => sharp({ create: { width: 1200, height: 800, channels: 3, background: color } }).jpeg().toFile(path.join(dir, name)).then(() => path.join(dir, name));

test('emblème du site en filigrane : fichier dans l’empreinte, absent tant qu’il n’est pas envoyé', () => {
  const base = { ...ctx({ enabled: true, kind: 'emblem', tone: 'auto', position: 'plein', opacity: 20 }), brandDir: '/data/brand' };
  assert.equal(specFor(PHOTO, { ...base, brand: {} }).mark, null);
  const a = specFor(PHOTO, { ...base, brand: { emblem: 'embleme-aaaa.png' } });
  assert.equal(a.mark.imagePath, '/data/brand/embleme-aaaa.png');
  assert.equal(a.mark.tone, 'auto');
  assert.notEqual(specFor(PHOTO, { ...base, brand: { emblem: 'embleme-bbbb.png' } }).key, a.key);   // nouveau dessin : nouvelles images
  assert.equal(specFor(PHOTO, { ...base, watermark: { ...base.watermark, kind: 'logotype' }, brand: { emblem: 'embleme-aaaa.png' } }).mark, null);
  const n = normalizeWatermark({ wm_kind: 'emblem', wm_tone: 'auto', wm_position: 'plein', wm_size: '100' });
  assert.deepEqual([n.kind, n.tone, n.position, n.size], ['emblem', 'auto', 'plein', 100]);
});

test('plein cadre : centré, aussi grand que l’image moins les marges, proportions gardées', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-'));
  const imagePath = await brandMask(dir);
  const [layer] = await overlayFor({ kind: 'emblem', imagePath, tone: 'light', position: 'plein', opacity: 20, size: 22, margin: 5 }, 1000, 800);
  const m = await sharp(layer.input).metadata();
  assert.equal(m.width, 900);                                   // 1000 − 2 × 5 %
  assert.equal(m.height, 450);                                  // rapport 2:1 gardé
  assert.deepEqual([layer.left, layer.top], [50, 175]);
  const { channels } = await sharp(layer.input).stats();
  assert.ok(channels[0].max > 250);                             // teinte claire : blanc
  assert.ok(channels[3].max <= 52 && channels[3].max >= 50);    // 20 % d'opacité
  fs.rmSync(dir, { recursive: true });
});

test('teinte automatique : claire sur photo sombre, sombre sur photo claire', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-'));
  const mark = { kind: 'emblem', tone: 'auto', position: 'plein' };
  assert.equal((await resolveTone(await solid(dir, 'nuit.jpg', '#151520'), mark)).tone, 'light');
  assert.equal((await resolveTone(await solid(dir, 'neige.jpg', '#eeeeea'), mark)).tone, 'dark');
  assert.equal((await resolveTone(await solid(dir, 'n.jpg', '#151520'), { ...mark, kind: 'image' })).tone, 'auto');   // logo envoyé : couleurs d'origine
  // Rendu complet : l'emblème sombre apparaît bien sur la photo claire.
  const neige = await solid(dir, 'neige2.jpg', '#f2f2f2');
  fs.mkdirSync(path.join(dir, 'originals'));
  fs.copyFileSync(neige, path.join(dir, 'originals', 'neige2.jpg'));
  await renderVariants(dir, 'neige2.jpg', { key: 'abcd1234', mark: { ...mark, imagePath: await brandMask(dir), opacity: 60, size: 22, margin: 0, minWidth: 0 } });
  const { channels } = await sharp(path.join(dir, 'variants', variantName('neige2.jpg', 640, 'webp', 'abcd1234'))).stats();
  assert.ok(channels[0].min < 120, `min ${channels[0].min}`);  // des pixels assombris par l'emblème
  fs.rmSync(dir, { recursive: true });
});
