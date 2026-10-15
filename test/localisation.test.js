import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { search, nearest, byId, nameOf } from '../server/geo/cities.js';
import { gpsFromExif } from '../server/media.js';

// Localisation des photos pour la carte du site : ville (jamais la position exacte), proposée d'après le GPS,
// « Afficher sur la carte » décidé par l'auteur.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function admin(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = opts => ctx.app.inject({ ...opts, cookies: { ...cookies, ...opts.cookies } });
  const post = (url, payload = {}) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  const json = (url, payload = {}) => as({ method: 'POST', url, payload, headers: { 'x-csrf-token': csrf, accept: 'application/json' } });
  const id = (table, slug) => ctx.db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).pluck().get(slug);
  const row = pid => ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(pid);
  return { ...ctx, csrf, as, post, json, id, row };
}

function multipart(parts) {
  const boundary = '----test' + Math.random().toString(16).slice(2);
  const chunks = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${p.filename ? `; filename="${p.filename}"` : ''}\r\n\r\n`));
    chunks.push(Buffer.isBuffer(p.value) ? p.value : Buffer.from(String(p.value)));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
// Photo prise à 47° 28' 48" N, 0° 33' 36" O (Angers, à ~1 km du centre).
const withGps = () => sharp({ create: { width: 800, height: 500, channels: 3, background: '#468' } })
  .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '47/1 28/1 48/1', GPSLongitudeRef: 'W', GPSLongitude: '0/1 33/1 36/1' } }).jpeg().toBuffer();
const send = (ctx, filename, value) => {
  const body = multipart([{ name: '_csrf', value: ctx.csrf }, { name: 'author_id', value: ctx.id('authors', 'julien') },
    { name: 'category_id', value: ctx.id('categories', 'rue') }, { name: 'photos', filename, value }]);
  return ctx.as({ method: 'POST', url: '/admin/photos/envoi', ...body, headers: { ...body.headers, accept: 'application/json' } });
};

// ---------- villes ----------

test('villes : recherche au fil de la frappe, noms alternatifs, ville d’une position GPS', () => {
  assert.ok(search('ange').slice(0, 2).some(c => c.label === 'Angers, Pays de la Loire, France'));
  assert.equal(search('Angers')[0].label, 'Angers, Pays de la Loire, France');
  assert.equal(search('Londres')[0].label, 'Londres, Angleterre, Royaume-Uni');                // nom français
  assert.equal(search('munich')[0].label, 'Munich, Bavière, Allemagne');
  assert.equal(search('München', 8, 'de')[0].label, 'München, Bayern, Deutschland');                // langue de l'admin
  assert.equal(search('münchen')[0].label, 'Munich, Bavière, Allemagne');
  // Homonymes : la région les distingue.
  assert.equal(search('Monterey')[0].label, 'Monterey, Californie, États-Unis');               // nom exact avant Monterrey (nom alternatif)
  assert.deepEqual(search('Monterey').filter(c => c.localName === 'Monterey').slice(0, 3).map(c => c.region), ['Californie', 'Tennessee', 'Massachusetts']);
  assert.equal(search('Monterey', 8, 'de').find(c => c.region === 'Kalifornien')?.label, 'Monterey, Kalifornien, Vereinigte Staaten');
  assert.equal(search('saint denis').length > 0, true);
  assert.deepEqual(search('a'), []);
  assert.equal(nearest(48.8566, 2.3522).label, 'Paris, Île-de-France, France');                      // pas un arrondissement
  assert.equal(nearest(48.8352, 2.2410).label, 'Boulogne-Billancourt, Île-de-France, France');        // une voisine garde son nom
  assert.equal(nearest(47.0, -30.0), null);                                            // en plein Atlantique
  assert.equal(byId(search('Angers')[0].id).name, 'Angers');
  // Petites communes (toutes les communes de France, localités de plus de 500 habitants ailleurs) et noms français.
  assert.equal(search('ars en re')[0].label, 'Ars-en-Ré, Nouvelle-Aquitaine, France');
  assert.equal(search('Saint-Clément-des-Baleines')[0].label, 'Saint-Clément-des-Baleines, Nouvelle-Aquitaine, France');
  assert.equal(nearest(46.2066, -1.5167).label, 'Ars-en-Ré, Nouvelle-Aquitaine, France');
  assert.equal(search('venise')[0].label, 'Venise, Vénétie, Italie');                           // pas le hameau homonyme
  assert.equal(search('anvers')[0].label, 'Anvers, Flandre, Belgique');
});

test('GPS de l’original : lu en degrés décimaux, hémisphères, valeurs absurdes écartées', async () => {
  const meta = await sharp(await withGps()).metadata();
  const g = gpsFromExif(meta.exif);
  assert.ok(Math.abs(g.lat - 47.48) < 0.001 && Math.abs(g.lon + 0.56) < 0.001, JSON.stringify(g));
  const none = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).jpeg().toBuffer();
  assert.equal(gpsFromExif((await sharp(none).metadata()).exif), null);
});

// ---------- import et photos existantes ----------

test('import : ville proposée d’après le GPS, jamais la position exacte, pas sur la carte', async t => {
  const ctx = await admin(t);
  const { id } = (await send(ctx, 'IMG_2041.jpg', await withGps())).json();
  const p = ctx.row(id);
  assert.equal(p.city_name, 'Angers');
  assert.equal(p.city_cc, 'FR');
  assert.equal(p.city_source, 'gps');
  assert.equal(p.on_map, 0);
  assert.deepEqual([p.city_lat, p.city_lon], [47.47, -0.55]);                          // centre de la ville, pas 47.48 / -0.56
  const fiche = (await ctx.as({ url: `/admin/photos/${id}` })).body;
  assert.match(fiche, /value="Angers, Pays de la Loire, France"/);
  assert.match(fiche, /Proposée d’après le GPS de la photo/);
});

test('photos déjà en place : ville proposée d’après leur GPS, une seule lecture, jamais d’écrasement', async t => {
  const ctx = await admin(t);
  const file = path.join(ctx.config.storageDir, 'originals', ctx.db.prepare("SELECT file FROM photos WHERE slug = 'quai-7h12'").pluck().get());
  fs.writeFileSync(file, await withGps());
  const quai = ctx.id('photos', 'quai-7h12');
  const brume = ctx.id('photos', 'brume-sur-la-loire');
  const brumeFile = path.join(ctx.config.storageDir, 'originals', ctx.row(brume).file);
  fs.writeFileSync(brumeFile, await withGps());
  ctx.db.prepare("UPDATE photos SET city_id = 2988507, city_name = 'Paris', city_cc = 'FR', city_lat = 48.85, city_lon = 2.35, city_source = 'manuel' WHERE id = ?").run(brume);
  ctx.db.prepare('UPDATE photos SET gps_checked = 0').run();
  await ctx.app.locator.schedule();
  assert.equal(ctx.row(quai).city_name, 'Angers');
  assert.equal(ctx.row(quai).on_map, 0);
  assert.equal(ctx.row(brume).city_name, 'Paris');                                     // choisie à la main : gardée
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM photos WHERE gps_checked = 0').pluck().get(), 0);
});

// ---------- fiche, panneau, actions groupées ----------

test('fiche : ville choisie, tapée sans la choisir, inconnue ; carte exige une ville ; effacer retire de la carte', async t => {
  const ctx = await admin(t);
  const pid = ctx.id('photos', 'quai-7h12');
  const base = { title: 'Quai, 7h12', slug: 'quai-7h12', category_id: ctx.row(pid).category_id, author_id: ctx.row(pid).author_id, status: 'published' };
  const lisbon = search('Lisbon')[0];
  assert.equal((await ctx.post(`/admin/photos/${pid}`, { ...base, city_id: lisbon.id, city_label: lisbon.label, on_map: 'on' })).statusCode, 303);
  assert.deepEqual([ctx.row(pid).city_name, ctx.row(pid).city_source, ctx.row(pid).on_map], ['Lisbon', 'manuel', 1]);
  // Sans JavaScript : nom exact tapé, reconnu.
  await ctx.post(`/admin/photos/${pid}`, { ...base, city_label: 'Angers', on_map: 'on' });
  assert.equal(ctx.row(pid).city_name, 'Angers');
  // Inconnue : erreur expliquée, rien n'est enregistré.
  const bad = await ctx.post(`/admin/photos/${pid}`, { ...base, city_label: 'Baie de Monterey', on_map: 'on' });
  assert.equal(bad.statusCode, 422);
  assert.match(bad.body, /Ville introuvable : choisissez-la dans la liste proposée/);
  assert.equal(ctx.row(pid).city_name, 'Angers');
  // Case décochée : retirée de la carte ; ville effacée : plus de carte possible.
  await ctx.post(`/admin/photos/${pid}`, { ...base, city_label: 'Angers' });
  assert.equal(ctx.row(pid).on_map, 0);
  const noCity = await ctx.post(`/admin/photos/${pid}`, { ...base, city_label: '', on_map: 'on' });
  assert.equal(noCity.statusCode, 422);
  assert.match(noCity.body, /Choisissez d’abord une ville/);
  await ctx.post(`/admin/photos/${pid}`, { ...base, city_label: '' });
  assert.deepEqual([ctx.row(pid).city_id, ctx.row(pid).on_map], [null, 0]);
});

test('panneau : ville et carte champ par champ ; un autre champ ne les change pas', async t => {
  const ctx = await admin(t);
  const pid = ctx.id('photos', 'quai-7h12');
  const angers = search('Angers')[0];
  let r = (await ctx.json(`/admin/photos/${pid}/champs`, { city_id: angers.id, city_label: angers.label })).json();
  assert.deepEqual([r.photo.city, r.photo.on_map], ['Angers, Pays de la Loire, France', false]);
  r = (await ctx.json(`/admin/photos/${pid}/champs`, { on_map: '1' })).json();
  assert.equal(r.photo.on_map, true);
  await ctx.json(`/admin/photos/${pid}/champs`, { title: 'Quai, 7h13' });
  assert.deepEqual([ctx.row(pid).city_name, ctx.row(pid).on_map], ['Angers', 1]);
  const refused = await ctx.json(`/admin/photos/${ctx.id('photos', 'deux-minuit')}/champs`, { on_map: '1' });
  assert.equal(refused.statusCode, 422);
  // Données de la photothèque : ville et case.
  const data = (await ctx.as({ url: `/admin/photos/${pid}/donnees` })).json();
  assert.deepEqual([data.city, data.on_map, data.city_source], ['Angers, Pays de la Loire, France', true, 'manuel']);
});

test('plusieurs photos : sur la carte (celles qui ont une ville), retirer, annuler ; villes réservées aux admins', async t => {
  const ctx = await admin(t);
  const a = ctx.id('photos', 'quai-7h12'), b = ctx.id('photos', 'deux-minuit');
  await ctx.json(`/admin/photos/${a}/champs`, { city_label: 'Angers' });
  const on = (await ctx.json('/admin/photos/actions', { ids: [a, b], action: 'map_on' })).json();
  assert.equal(on.text, '1 photo sur la carte. 1 photo sans ville : choisissez sa ville dans la fiche.');
  assert.deepEqual([ctx.row(a).on_map, ctx.row(b).on_map], [1, 0]);
  await ctx.json('/admin/photos/actions', on.undo);
  assert.equal(ctx.row(a).on_map, 0);
  await ctx.json('/admin/photos/actions', { ids: [a], action: 'map_on' });
  const off = (await ctx.json('/admin/photos/actions', { ids: [a, b], action: 'map_off' })).json();
  assert.equal(off.text, '1 photo retirée de la carte.');
  // Propositions de villes : admin seulement.
  assert.deepEqual((await ctx.as({ url: '/admin/villes?q=lisbo' })).json().villes[0], { id: search('Lisbon')[0].id, label: 'Lisbonne, District de Lisbonne, Portugal' });
  assert.notEqual((await ctx.app.inject('/admin/villes?q=lisbo')).statusCode, 200);
  const page = (await ctx.as({ url: '/admin/photos' })).body;
  assert.match(page, /data-many-map="map_on"/);
  assert.match(page, /data-one-onmap/);
});

// ---------- page publique « Carte » ----------

test('page Carte : introuvable tant qu’elle n’est pas publiée, aperçu pour les photographes, réglage dans Site public', async t => {
  const ctx = await admin(t);
  assert.equal((await ctx.app.inject('/carte')).statusCode, 404);
  assert.doesNotMatch((await ctx.app.inject('/')).body, /href="\/carte"/);
  assert.doesNotMatch((await ctx.app.inject('/sitemap.xml')).body, /\/carte</);
  const preview = await ctx.as({ url: '/carte' });
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.headers['x-robots-tag'], 'noindex');
  assert.match(preview.body, /Aperçu réservé aux photographes/);
  assert.match(preview.body, /Aucune photo sur la carte : choisissez la ville/);
  const settings = (await ctx.as({ url: '/admin/site' })).body;
  assert.match(settings, /id="carte"/);
  assert.match(settings, /name="map_page">/);                                          // décochée par défaut
  assert.match(settings, /\(0 aujourd’hui\)/);
  assert.equal((await ctx.post('/admin/reglages', { map_page: 'on' })).statusCode, 303);
  assert.match((await ctx.as({ url: '/admin/site' })).body, /name="map_page" checked/);
  assert.equal((await ctx.app.inject('/carte')).statusCode, 200);
  for (const url of ['/', '/a-propos', '/droits', '/en/droits', '/de/']) assert.match((await ctx.app.inject(url)).body, /href="(\/en|\/de)?\/carte">(Carte|Map|Karte)</, url);
  assert.match((await ctx.app.inject('/sitemap.xml')).body, /localhost:3000\/carte</);
  await ctx.post('/admin/reglages', {});                                               // décochée : retirée
  assert.equal((await ctx.app.inject('/carte')).statusCode, 404);
});

test('page Carte : photos publiées cochées, groupées par ville, à leur place sur la carte ; jamais les brouillons', async t => {
  const ctx = await admin(t);
  ctx.db.prepare("INSERT INTO settings (key, value) VALUES ('map_page', 'true')").run();
  const set = (slug, label, onMap = 1) => {
    const c = search(label)[0];
    ctx.db.prepare('UPDATE photos SET city_id = ?, city_name = ?, city_cc = ?, city_lat = ?, city_lon = ?, city_source = ?, on_map = ? WHERE slug = ?')
      .run(c.id, c.name, c.cc, c.lat, c.lon, 'manuel', onMap, slug);
  };
  set('quai-7h12', 'Angers');
  set('brume-sur-la-loire', 'Angers');
  set('deux-minuit', 'Lisbon');                                                        // cochée, mais brouillon
  ctx.db.prepare("UPDATE photos SET status = 'draft' WHERE slug = 'deux-minuit'").run();
  const slugs = ctx.db.prepare("SELECT slug FROM photos WHERE status = 'published' AND slug NOT IN ('quai-7h12', 'brume-sur-la-loire')").pluck().all();
  set(slugs[0], 'Tokyo');
  set(slugs[1], 'Munich', 0);                                                          // ville choisie, pas sur la carte
  const res = await ctx.app.inject({ url: '/carte', headers: { 'user-agent': 'Mozilla/5.0 (test)' } });
  assert.equal(res.statusCode, 200);
  const body = res.body;
  assert.doesNotMatch(body, /Aperçu réservé/);
  const pins = [...body.matchAll(/data-pin="(\d+)"[^>]*data-x="([\d.]+)" data-y="([\d.]+)" data-n="(\d+)" data-name="([^"]+)"/g)]
    .map(m => ({ name: m[5], n: Number(m[4]), x: Number(m[2]), y: Number(m[3]) }));
  assert.deepEqual(pins.map(p => [p.name, p.n]), [['Angers', 2], ['Tokyo', 1]]);       // la plus fournie d'abord
  const angers = pins[0], tokyo = pins[1];
  assert.ok(angers.x > 490 && angers.x < 510 && angers.y < 130, JSON.stringify(angers)); // Europe de l'Ouest
  assert.ok(tokyo.x > 840 && tokyo.x < 870 && tokyo.y > 120 && tokyo.y < 170, JSON.stringify(tokyo));
  assert.match(body, /3 photos · 2 lieux/);
  assert.match(body, /<section class="lieu" id="lieu-\d+">\s*<h2>Angers <span class="mono">France · 2 photos/);
  assert.doesNotMatch(body, /Lisbon|Munich/);
  assert.match(body, /GeoNames/);
  assert.match(body, /href="\/static\/carte-terre\.svg\?v=[0-9a-f]{10}#terre"/);
  assert.match(body, /<image href="\/media\/[^"]+-640\.webp"/);
  // Fonds plus détaillés au zoom : 1:50m, puis tuiles 1:10m de la zone visible (servies compressées).
  assert.match(body, /data-fine="\/static\/carte-terre-fine\.svg\?v=[0-9a-f]{10}#terre"/);
  const tiles = body.match(/data-tiles="([^"]+)"/)[1];
  const index = (await ctx.app.inject(tiles)).json();
  assert.ok(index.tiles.length > 100 && index.tiles.includes('9-2'));                  // côte atlantique française
  const tile = await ctx.app.inject({ url: '/static/carte-tuiles/9-2.svg', headers: { 'accept-encoding': 'br' } });
  assert.equal(tile.headers['content-encoding'], 'br');
  assert.doesNotMatch(body, /style="/);                                                // CSP : aucun style en ligne
  const visits = ctx.db.prepare("SELECT SUM(views) FROM stats_pages WHERE page = 'carte'").pluck();
  assert.equal(visits.get(), 1);
});

test('villes dans la langue de l’admin, avec la région : liste, fiche, saisie en allemand, carte du site', async t => {
  const ctx = await admin(t);
  const de = { admin_langue: 'de' };
  // Liste proposée : noms et région en allemand ; « München » est Munich.
  const list = (await ctx.as({ url: `/admin/villes?q=${encodeURIComponent('München')}`, cookies: de })).json().villes;
  assert.equal(list[0].label, 'München, Bayern, Deutschland');
  const monterey = (await ctx.as({ url: '/admin/villes?q=Monterey' })).json().villes.map(v => v.label);
  assert.ok(monterey.includes('Monterey, Californie, États-Unis') && monterey.includes('Monterey, Tennessee, États-Unis'));
  // Le libellé allemand, choisi ou tapé, est reconnu ; la fiche le montre dans la langue de chacun.
  const a = ctx.id('photos', 'quai-7h12');
  await ctx.as({ method: 'POST', url: `/admin/photos/${a}/champs`, cookies: de, headers: { accept: 'application/json', 'x-csrf-token': ctx.csrf }, payload: { city_label: 'München, Bayern, Deutschland', on_map: true } });
  assert.deepEqual([ctx.row(a).city_name, ctx.row(a).on_map], ['Munich', 1]);
  assert.match((await ctx.as({ url: `/admin/photos/${a}`, cookies: de })).body, /value="München, Bayern, Deutschland"/);
  assert.match((await ctx.as({ url: `/admin/photos/${a}` })).body, /value="Munich, Bavière, Allemagne"/);
  // Une ville homonyme choisie par sa région.
  const tn = search('Monterey').find(c => c.region === 'Tennessee');
  await ctx.json(`/admin/photos/${a}/champs`, { city_label: tn.label, city_id: tn.id });
  assert.equal(ctx.row(a).city_id, tn.id);
  await ctx.json(`/admin/photos/${a}/champs`, { city_label: 'Munich, Allemagne' });                // ancien libellé : toujours compris
  assert.equal(ctx.row(a).city_name, 'Munich');
  // Carte du site : le nom de la ville dans la langue de la page.
  assert.equal(nameOf(ctx.row(a), 'de'), 'München');
  assert.equal(nameOf(ctx.row(a), 'fr'), 'Munich');
});
