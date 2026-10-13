import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { search, nearest, byId } from '../server/geo/cities.js';
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
  assert.ok(search('ange').slice(0, 2).some(c => c.label === 'Angers, France'));
  assert.equal(search('Angers')[0].label, 'Angers, France');
  assert.equal(search('Londres')[0].label, 'London, Royaume-Uni');
  assert.equal(search('munich')[0].label, 'Munich, Allemagne');
  assert.equal(search('saint denis').length > 0, true);
  assert.deepEqual(search('a'), []);
  assert.equal(nearest(48.8566, 2.3522).label, 'Paris, France');                      // pas un arrondissement
  assert.equal(nearest(48.8352, 2.2410).label, 'Boulogne-Billancourt, France');        // une voisine garde son nom
  assert.equal(nearest(47.0, -30.0), null);                                            // en plein Atlantique
  assert.equal(byId(search('Angers')[0].id).name, 'Angers');
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
  assert.match(fiche, /value="Angers, France"/);
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
  assert.deepEqual([r.photo.city, r.photo.on_map], ['Angers, France', false]);
  r = (await ctx.json(`/admin/photos/${pid}/champs`, { on_map: '1' })).json();
  assert.equal(r.photo.on_map, true);
  await ctx.json(`/admin/photos/${pid}/champs`, { title: 'Quai, 7h13' });
  assert.deepEqual([ctx.row(pid).city_name, ctx.row(pid).on_map], ['Angers', 1]);
  const refused = await ctx.json(`/admin/photos/${ctx.id('photos', 'deux-minuit')}/champs`, { on_map: '1' });
  assert.equal(refused.statusCode, 422);
  // Données de la photothèque : ville et case.
  const data = (await ctx.as({ url: `/admin/photos/${pid}/donnees` })).json();
  assert.deepEqual([data.city, data.on_map, data.city_source], ['Angers, France', true, 'manuel']);
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
  assert.deepEqual((await ctx.as({ url: '/admin/villes?q=lisbo' })).json().villes[0], { id: search('Lisbon')[0].id, label: 'Lisbon, Portugal' });
  assert.notEqual((await ctx.app.inject('/admin/villes?q=lisbo')).statusCode, 200);
  const page = (await ctx.as({ url: '/admin/photos' })).body;
  assert.match(page, /data-many-map="map_on"/);
  assert.match(page, /data-one-onmap/);
});
