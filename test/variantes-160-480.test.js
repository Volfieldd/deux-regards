// Variantes de 160 et 480 px (constat UX-T-07, RGESN) : les vignettes ne chargent plus la variante de 640 px.
// Largeurs produites, filigrane et EXIF selon les réglages, rattrapage des seules tailles manquantes des photos d'avant,
// repli tant qu'une taille manque, et /media/ qui ne sert toujours que les photos publiées.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { setup } from './helpers.js';
import { renderVariants, variantName, widthsFor, WIDTHS } from '../server/images.js';
import { createVariantService } from '../server/variants.js';
import { servedVariant } from '../server/repli-variantes.js';
import { picture, coverSet, tileSizes } from '../server/picture.js';

const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
async function admin(t, opts = {}) {
  const c = await setup(t, { seeded: true, ...opts, env: { LOCAL_AUTH_TOKEN: TOKEN, ...opts.env } });
  const res = await c.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  const cookies = cookiesOf(res);
  const as = o => c.app.inject({ ...o, cookies: { ...cookies, ...o.cookies } });
  return { ...c, cookies, as };
}
const scratch = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'variantes-160-480-'));
  fs.mkdirSync(path.join(dir, 'originals'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const gray = (dir, file, width, height) => sharp({ create: { width, height, channels: 3, background: '#808080' } }).jpeg().toFile(path.join(dir, 'originals', file));
const sizesOf = (dir, file, key = '') => fs.readdirSync(path.join(dir, 'variants')).filter(f => f.startsWith(path.parse(file).name) && !f.endsWith('.tmp'))
  .map(f => f.replace(`${path.parse(file).name}-${key ? `${key}-` : ''}`, '')).sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));

test('largeurs : 160, 480, 640, 1280 et 2000 px ; moins pour une petite photo, jamais d’agrandissement', async t => {
  assert.deepEqual(WIDTHS, [160, 480, 640, 1280, 2000]);
  assert.deepEqual(widthsFor(4000), [160, 480, 640, 1280, 2000]);
  assert.deepEqual(widthsFor(2000), [160, 480, 640, 1280, 2000]);
  assert.deepEqual(widthsFor(1600), [160, 480, 640, 1280, 1600]);
  assert.deepEqual(widthsFor(640), [160, 480, 640]);
  assert.deepEqual(widthsFor(600), [160, 480, 600]);
  assert.deepEqual(widthsFor(480), [160, 480]);
  assert.deepEqual(widthsFor(300), [160, 300]);
  assert.deepEqual(widthsFor(100), [100]);

  const dir = scratch(t);
  const big = '10000000-0000-4000-8000-000000000001.jpg';
  const small = '10000000-0000-4000-8000-000000000002.jpg';
  await gray(dir, big, 2400, 1600);
  await gray(dir, small, 600, 400);
  await renderVariants(dir, big);
  await renderVariants(dir, small);
  // Les cinq largeurs, en AVIF et en WebP, à la bonne taille.
  assert.deepEqual(sizesOf(dir, big), ['160.avif', '160.webp', '480.avif', '480.webp', '640.avif', '640.webp', '1280.avif', '1280.webp', '2000.avif', '2000.webp']);
  for (const w of [160, 480]) assert.equal((await sharp(path.join(dir, 'variants', variantName(big, w, 'webp'))).metadata()).width, w);
  assert.deepEqual(sizesOf(dir, small), ['160.avif', '160.webp', '480.avif', '480.webp', '600.avif', '600.webp']);
});

test('filigrane : « Toutes les tailles » marque 160 et 480 px ; « 1280 px et plus » les épargne ; la plus grande toujours marquée', async t => {
  const dir = scratch(t);
  const file = '20000000-0000-4000-8000-000000000001.jpg';
  await gray(dir, file, 2400, 1600);
  const mark = { kind: 'text', text: 'COPYRIGHT', font: 'sans', tone: 'light', position: 'bas-droite', opacity: 100, size: 40, margin: 2 };
  const brightest = async (key, w) => (await sharp(path.join(dir, 'variants', variantName(file, w, 'webp', key))).stats()).channels[0].max;
  await renderVariants(dir, file, { key: 'aaaaaaaa', mark: { ...mark, minWidth: 0 } });
  for (const w of [160, 480, 640, 1280, 2000]) assert.ok(await brightest('aaaaaaaa', w) > 200, `${w} px marquée (toutes les tailles)`);
  await renderVariants(dir, file, { key: 'bbbbbbbb', mark: { ...mark, minWidth: 1280 } });
  for (const w of [160, 480, 640]) assert.ok(await brightest('bbbbbbbb', w) < 150, `${w} px épargnée (1280 px et plus)`);
  for (const w of [1280, 2000]) assert.ok(await brightest('bbbbbbbb', w) > 200, `${w} px marquée (1280 px et plus)`);
  // Petite photo (600 px) et seuil de 2000 px : 160 et 480 épargnées, la plus grande (600) marquée.
  const small = '20000000-0000-4000-8000-000000000002.jpg';
  await gray(dir, small, 600, 400);
  await renderVariants(dir, small, { key: 'cccccccc', mark: { ...mark, minWidth: 2000 } });
  const max = async w => (await sharp(path.join(dir, 'variants', variantName(small, w, 'webp', 'cccccccc'))).stats()).channels[0].max;
  assert.ok(await max(160) < 150 && await max(480) < 150);
  assert.ok(await max(600) > 200);
});

test('métadonnées : les vignettes de 160 et 480 px suivent le mode EXIF (aucune, ou droits d’auteur et mentions IPTC)', async t => {
  const dir = scratch(t);
  const file = '30000000-0000-4000-8000-000000000001.jpg';
  await gray(dir, file, 2400, 1600);
  await renderVariants(dir, file);
  for (const w of [160, 480]) {
    for (const f of ['webp', 'avif']) {
      const m = await sharp(path.join(dir, 'variants', variantName(file, w, f))).metadata();
      assert.equal(m.exif, undefined, `${w}.${f} sans EXIF`);
      assert.equal(m.xmp, undefined, `${w}.${f} sans XMP`);
    }
  }
  const meta = { mode: 'rights', artist: 'Julien', copyright: '© 2026 Julien', credit: 'Test', webStatement: 'https://exemple.test/droits' };
  await renderVariants(dir, file, { key: 'dddddddd', meta });
  for (const w of [160, 480]) {
    const m = await sharp(path.join(dir, 'variants', variantName(file, w, 'webp', 'dddddddd'))).metadata();
    assert.equal(exifReader(m.exif).Image.Artist, 'Julien');
    assert.match(m.xmp.toString(), /exemple\.test\/droits/);
  }
});

test('photos d’avant : le passage du démarrage crée seulement 160 et 480 px, sans toucher aux autres fichiers ni à l’empreinte', async t => {
  const c = await setup(t, { seeded: true });
  await c.app.variants.idle();
  const dir = path.join(c.config.storageDir, 'variants');
  const photos = c.db.prepare('SELECT id, file, width, variant_key FROM photos ORDER BY id').all();
  // Une photothèque d'avant : les fichiers de 160 et 480 px n'existent pas encore.
  const old = new Map();
  for (const p of photos) {
    for (const w of [160, 480]) for (const f of ['avif', 'webp']) fs.rmSync(path.join(dir, variantName(p.file, w, f, p.variant_key)));
    for (const w of widthsFor(p.width).filter(x => x > 480)) for (const f of ['avif', 'webp']) {
      const name = variantName(p.file, w, f, p.variant_key);
      old.set(name, fs.statSync(path.join(dir, name)));
    }
  }
  const lines = [];
  const service = createVariantService({ db: c.db, storageDir: c.config.storageDir, siteName: () => 'Test', log: { info: (o, msg) => lines.push([o, msg]), error: () => {} } });
  await service.schedule();
  for (const p of photos) {
    for (const w of [160, 480]) for (const f of ['avif', 'webp']) assert.ok(fs.existsSync(path.join(dir, variantName(p.file, w, f, p.variant_key))), `${p.id} : ${w}.${f} créée`);
  }
  // Les grandes variantes n'ont pas été réécrites (même fichier, même date), l'empreinte n'a pas changé.
  for (const [name, st] of old) {
    const now = fs.statSync(path.join(dir, name));
    assert.equal(now.ino, st.ino, name);
    assert.equal(now.mtimeMs, st.mtimeMs, name);
  }
  assert.deepEqual(c.db.prepare('SELECT id, file, width, variant_key FROM photos ORDER BY id').all(), photos);
  assert.deepEqual(lines.find(([, msg]) => /tailles manquantes/.test(msg))?.[0], { completed: photos.length });
  assert.ok(!lines.some(([, msg]) => /régénérées/.test(msg)), 'aucune photo régénérée');
  // Un second passage n'a plus rien à faire.
  lines.length = 0;
  await service.schedule();
  assert.equal(lines.length, 0);
});

test('repli : tant qu’une taille manque, /media/ sert la plus petite plus grande (cache court) ; jamais une largeur inventée', async t => {
  const c = await admin(t);
  await c.app.variants.idle();
  const dir = path.join(c.config.storageDir, 'variants');
  const p = c.db.prepare("SELECT file, width, variant_key FROM photos WHERE status = 'published' AND width > 640 LIMIT 1").get();
  const name = w => variantName(p.file, w, 'webp', p.variant_key);
  // Le srcset cite les tailles de 160 et 480 px…
  const page = (await c.app.inject('/')).body;
  assert.match(page, new RegExp(`/media/${name(160)} 160w, /media/${name(480)} 480w, /media/${name(640)} 640w`));
  // … et une page ne casse jamais, même avant leur création.
  fs.rmSync(path.join(dir, name(160)));
  fs.rmSync(path.join(dir, name(480)));
  const res = await c.app.inject(`/media/${name(160)}`);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.rawPayload, fs.readFileSync(path.join(dir, name(640))));
  assert.equal(res.headers['cache-control'], 'public, max-age=300');
  assert.equal(res.headers['cdn-cache-control'], 'public, max-age=300');
  assert.equal((await c.app.inject(`/media/${name(480)}`)).statusCode, 200);
  // Admin : même repli, toujours sans cache.
  const adm = await c.as({ url: `/admin/media/${name(160)}` });
  assert.equal(adm.statusCode, 200);
  assert.equal(adm.headers['cache-control'], 'no-store');
  // Une largeur que la photo n'a pas, ou une autre empreinte : 404, comme avant.
  assert.equal((await c.app.inject(`/media/${name(999)}`)).statusCode, 404);
  assert.equal((await c.app.inject(`/media/${variantName(p.file, 160, 'webp', 'deadbeef')}`)).statusCode, 404);
  assert.equal(servedVariant(dir, p, name(2000 + 1)), null);
  // Présente : le fichier lui-même, en cache long.
  const big = await c.app.inject(`/media/${name(640)}`);
  assert.match(big.headers['cache-control'], /immutable/);
  // Plus aucune variante plus grande : rien à servir.
  for (const w of widthsFor(p.width)) fs.rmSync(path.join(dir, name(w)), { force: true });
  assert.equal((await c.app.inject(`/media/${name(160)}`)).statusCode, 404);
});

test('/media/ ne sert que les photos publiées : les tailles de 160 et 480 px d’un brouillon restent introuvables', async t => {
  const c = await admin(t);
  await c.app.variants.idle();
  const p = c.db.prepare("SELECT id, file, width, variant_key FROM photos WHERE status = 'published' LIMIT 1").get();
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(p.id);
  for (const w of [160, 480]) for (const f of ['webp', 'avif']) {
    const name = variantName(p.file, w, f, p.variant_key);
    assert.ok(fs.existsSync(path.join(c.config.storageDir, 'variants', name)));
    assert.equal((await c.app.inject(`/media/${name}`)).statusCode, 404, `${name} brouillon`);
    assert.equal((await c.as({ url: `/admin/media/${name}` })).statusCode, 200, `${name} aperçu admin`);
  }
  // Même un repli (taille manquante) d'un brouillon : 404.
  fs.rmSync(path.join(c.config.storageDir, 'variants', variantName(p.file, 160, 'webp', p.variant_key)));
  assert.equal((await c.app.inject(`/media/${variantName(p.file, 160, 'webp', p.variant_key)}`)).statusCode, 404);
});

test('visiteur en v1 et compte d’admin en v1 : ils voient la v1, avec les nouvelles tailles dans le srcset', async t => {
  const c = await admin(t);
  await c.app.variants.idle();
  // Site public en v1 (réglage par défaut) : la feuille de style de la v1, pas celle de la v2.
  const v1 = (await c.app.inject({ url: '/', headers: { 'accept-language': 'fr' } })).body;
  assert.match(v1, /css\/site\.css/);
  assert.doesNotMatch(v1, /css\/v2\/public\.css/);
  assert.match(v1, / 160w, [^"]+ 480w, /);
  // En v2 (et v3, mêmes gabarits), les mêmes tailles.
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('public_version', '\"v2\"') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  const v2 = (await c.app.inject({ url: '/', headers: { 'accept-language': 'fr' } })).body;
  assert.match(v2, /css\/v2\/public\.css/);
  assert.match(v2, / 160w, [^"]+ 480w, /);
  // Compte d'admin en v1 (aucune préférence) : l'admin v1, planche aux sizes de ses tuiles.
  const lib = (await c.as({ url: '/admin/photos' })).body;
  assert.match(lib, /admin\/admin\.css/);
  assert.doesNotMatch(lib, /admin\/v2\/v2\.css/);
  assert.match(lib, /sizes="\(max-width: 720px\) min\(calc\(100vw - 20px\), \d+px\), \d+px"/);
  assert.match(lib, / 160w, /);
});

test('aides : carte de partage (srcset jusqu’à 640 px, sizes de la largeur dessinée) et tuiles de la planche', () => {
  const p = { file: '40000000-0000-4000-8000-000000000001.jpg', width: 4000, height: 2250, variant_key: '' };
  const s = coverSet(p, { w: 92, h: 61 });
  assert.equal(s.srcset.split(', ').map(x => x.split(' ')[1]).join(' '), '160w 480w 640w');
  assert.equal(s.sizes, '109px');                                     // 16:9 dans 92 × 61 : 61 × 16/9 = 108,4
  assert.equal(coverSet({ ...p, width: 2000, height: 3000 }, { w: 92, h: 61 }).sizes, '92px');
  assert.equal(coverSet({ ...p, width: 100, height: 80 }, { w: 92, h: 61 }).srcset.split(', ').length, 1);
  assert.equal(tileSizes({ width: 3000, height: 2000 }), '(max-width: 720px) min(calc(100vw - 20px), 288px), 371px');
  assert.equal(tileSizes({ width: 3000, height: 2000 }, 320), '(max-width: 720px) min(calc(100vw - 20px), 288px), 624px');
  // <picture> : 160 et 480 px en tête des deux srcset.
  assert.match(picture(p, { sizes: '96px' }), /srcset="\/media\/[^"]+-160\.avif 160w, \/media\/[^"]+-480\.avif 480w, /);
});
