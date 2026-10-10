import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

const tiles = html => (html.match(/class="tile"/g) || []).length;

test("l'accueil affiche l'ouverture, les regards, les séries et les 12 photos", async t => {
  const { app } = await setup(t, { seeded: true });
  const res = await app.inject('/');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.equal(tiles(res.body), 12);
  assert.match(res.body, /class="hero-item on"/);
  assert.match(res.body, /Le ciel s’est ouvert/);          // première photo de l'ouverture (réglages)
  assert.match(res.body, /<i>Test<\/i>/);                    // nom du site depuis la config
  assert.match(res.body, /href="\/auteur\/julien"/);
  assert.match(res.body, /type="image\/avif"/);
});

test('le filtre par regard ne garde que les photos de cet auteur', async t => {
  const { app } = await setup(t, { seeded: true });
  const res = await app.inject('/auteur/julien');
  assert.equal(tiles(res.body), 6);
  assert.match(res.body, /Toutes les séries, par Julien/);
  assert.match(res.body, /href="\/\?regard=julien&amp;serie=rue"/); // les séries gardent le regard actif
});

test('les filtres se combinent', async t => {
  const { app } = await setup(t, { seeded: true });
  const res = await app.inject('/?regard=julien&serie=rue');
  assert.equal(tiles(res.body), 3);
  assert.match(res.body, /<title>Rue, par Julien · Test<\/title>/);
});

test('une série inconnue répond 404, un filtre inconnu en query est ignoré', async t => {
  const { app } = await setup(t, { seeded: true });
  assert.equal((await app.inject('/serie/inconnue')).statusCode, 404);
  assert.equal((await app.inject('/auteur/inconnu')).statusCode, 404);
  assert.equal(tiles((await app.inject('/?serie=inconnue')).body), 12);
});

test('la page photo navigue dans la liste filtrée, en boucle', async t => {
  const { app } = await setup(t, { seeded: true });
  const res = await app.inject('/photo/deux-minuit?regard=julien');
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /class="dark"/);
  assert.match(res.body, /01 \/ 06/);
  assert.match(res.body, /rel="prev" aria-label="Photo précédente : Deux ombres"/);
  assert.match(res.body, /href="\/photo\/elise-contre-jour\?regard=julien" rel="next"/);
  assert.match(res.body, /data-back="\/auteur\/julien#galerie"/);
});

test('une photo hors du filtre demandé retombe sur la liste complète', async t => {
  const { app } = await setup(t, { seeded: true });
  const res = await app.inject('/photo/brume-sur-la-loire?regard=julien');
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /01 \/ 12/);
});

test('une photo en brouillon est introuvable publiquement', async t => {
  const { app, db } = await setup(t, { seeded: true });
  db.prepare("UPDATE photos SET status = 'draft' WHERE slug = 'deux-minuit'").run();
  assert.equal((await app.inject('/photo/deux-minuit')).statusCode, 404);
  assert.equal(tiles((await app.inject('/')).body), 11);
});

test('les variantes sont servies, les originaux jamais', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const file = db.prepare("SELECT file FROM photos WHERE slug = 'brume-sur-la-loire'").pluck().get();
  const stem = file.replace(/\.jpg$/, '');
  const ok = await app.inject(`/media/${stem}-640.avif`);
  assert.equal(ok.statusCode, 200);
  assert.match(ok.headers['cache-control'], /immutable/);
  for (const url of [`/media/${file}`, `/media/../originals/${file}`, `/media/%2e%2e/originals/${file}`, `/originals/${file}`, '/media/../site.db', '/media/../test.db']) {
    assert.equal((await app.inject(url)).statusCode, 404, url);
  }
});

test("les variantes ne contiennent pas d'EXIF", async t => {
  const { app, db } = await setup(t, { seeded: true });
  const sharp = (await import('sharp')).default;
  const file = db.prepare("SELECT file FROM photos WHERE slug = 'brume-sur-la-loire'").pluck().get();
  const res = await app.inject(`/media/${file.replace(/\.jpg$/, '')}-640.webp`);
  assert.equal(res.statusCode, 200);
  const meta = await sharp(res.rawPayload).metadata();
  assert.equal(meta.exif, undefined);
});

test('les polices auto-hébergées sont servies, rien d’autre de node_modules', async t => {
  const { app } = await setup(t);
  assert.equal((await app.inject('/fonts/jost/files/jost-latin-400-normal.woff2')).statusCode, 200);
  assert.equal((await app.inject('/fonts/jost/package.json')).statusCode, 404);
});

test('à propos liste les deux auteurs', async t => {
  const { app } = await setup(t, { seeded: true });
  const res = await app.inject('/a-propos');
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Sébastien/);
  assert.match(res.body, /Julien/);
});

test('chaque variante référencée par les pages existe', async t => {
  const { app } = await setup(t, { seeded: true });
  const html = (await app.inject('/')).body;
  const urls = new Set([...html.matchAll(/\/media\/[\w-]+\.(?:avif|webp)/g)].map(m => m[0]));
  assert.ok(urls.size > 0);
  for (const url of urls) assert.equal((await app.inject(url)).statusCode, 200, url);
});
