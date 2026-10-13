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
  // Dans la liste des auteurs elle-même (le pied de page cite aussi les noms).
  const people = res.body.slice(res.body.indexOf('class="people"'), res.body.indexOf('</main>'));
  assert.match(people, /<h2><a href="\/auteur\/sebastien">Sébastien<\/a><\/h2>/);
  assert.match(people, /<h2><a href="\/auteur\/julien">Julien<\/a><\/h2>/);
});

test('chaque variante référencée par les pages existe', async t => {
  const { app } = await setup(t, { seeded: true });
  const html = (await app.inject('/')).body;
  const urls = new Set([...html.matchAll(/\/media\/[\w-]+\.(?:avif|webp)/g)].map(m => m[0]));
  assert.ok(urls.size > 0);
  for (const url of urls) assert.equal((await app.inject(url)).statusCode, 200, url);
});

test('Open Graph et URL canonique sont absolus, sans les filtres sur une page photo', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const home = (await app.inject('/')).body;
  assert.match(home, /<meta property="og:image" content="http:\/\/localhost:3000\/media\/[\w-]+\.webp">/);
  assert.match(home, /<link rel="canonical" href="http:\/\/localhost:3000\/">/);
  const slug = db.prepare('SELECT slug FROM photos ORDER BY id LIMIT 1').pluck().get();
  const photo = (await app.inject(`/photo/${slug}?regard=julien&utm=x`)).body;
  assert.match(photo, new RegExp(`<meta property="og:url" content="http://localhost:3000/photo/${slug}">`));
  assert.match((await app.inject('/auteur/julien')).body, /rel="canonical" href="http:\/\/localhost:3000\/auteur\/julien"/);
});

test('l’ouverture propose un bouton pause, masqué tant que le JS ne l’active pas', async t => {
  const { app } = await setup(t, { seeded: true });
  assert.match((await app.inject('/')).body, /<button type="button" class="pause eyebrow" data-pause data-play="Lecture" hidden>Pause<\/button>/);
});

test('galerie par ordre de publication : tri, filtres cumulés, navigation, adresse canonique', async t => {
  const { app, db } = await setup(t, { seeded: true });
  // Dates de publication connues : la photo en dernière position de la galerie est la plus récente.
  const ids = db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY position").pluck().all();
  const set = db.prepare('UPDATE photos SET published_at = ? WHERE id = ?');
  ids.forEach((id, i) => set.run(`2026-01-${String(i + 1).padStart(2, '0')} 10:00:00`, id));
  const slugs = html => [...html.matchAll(/<a class="tile" href="\/photo\/([^"?]+)/g)].map(m => m[1]);
  const bySel = slugs((await app.inject('/')).body);
  const byNew = slugs((await app.inject('/?ordre=recentes')).body);
  assert.equal(byNew.length, bySel.length);
  assert.deepEqual(byNew, [...bySel].reverse());

  const page = (await app.inject('/serie/rue?ordre=recentes')).body;
  assert.match(page, /<a href="\/serie\/rue#galerie" data-filter >Sélection<\/a>/);
  assert.match(page, /href="\/serie\/rue\?ordre=recentes#galerie" data-filter aria-current="true">Plus récentes/);
  assert.match(page, /href="\/\?regard=julien&amp;serie=rue&amp;ordre=recentes"/);           // le filtre photographe garde l'ordre
  assert.match(page, /<link rel="canonical" href="[^"]*\/serie\/rue">/);                      // même contenu : une seule adresse canonique
  assert.match(page, /href="\/photo\/[^"]+\?serie=rue&amp;ordre=recentes"/);
  // Page photo : précédente / suivante dans le même ordre, retour vers la galerie triée.
  const [first, second] = slugs((await app.inject('/?ordre=recentes')).body);
  const photo = (await app.inject(`/photo/${first}?ordre=recentes`)).body;
  assert.match(photo, new RegExp(`href="/photo/${second}\\?ordre=recentes" rel="next"`));
  assert.match(photo, /data-back="\/\?ordre=recentes#galerie"/);
  assert.deepEqual(slugs((await app.inject('/?ordre=nimportequoi')).body), bySel);              // valeur inconnue : ordre par défaut
});

test('date de publication : posée à la première publication, gardée si l’on republie', async t => {
  const { db } = await setup(t, { seeded: true });
  assert.equal(db.prepare("SELECT COUNT(*) FROM photos WHERE status = 'published' AND published_at IS NULL").pluck().get(), 0);
  const id = db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  db.prepare("UPDATE photos SET status = 'draft', published_at = NULL WHERE id = ?").run(id);
  db.prepare("UPDATE photos SET status = 'published' WHERE id = ?").run(id);
  const first = db.prepare('SELECT published_at FROM photos WHERE id = ?').pluck().get(id);
  assert.match(first, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  db.prepare("UPDATE photos SET published_at = '2020-05-05 08:00:00' WHERE id = ?").run(id);
  db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(id);
  db.prepare("UPDATE photos SET status = 'published' WHERE id = ?").run(id);
  assert.equal(db.prepare('SELECT published_at FROM photos WHERE id = ?').pluck().get(id), '2020-05-05 08:00:00');
});
