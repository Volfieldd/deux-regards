import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { photoMap, NEAR_KM } from '../server/photo-map.js';
import { search } from '../server/geo/cities.js';

// Page d'une photo : la carte de l'endroit où elle a été prise, et les photos prises à proximité — seulement celles
// qui sont sur la carte du monde (case de la fiche), à moins de 250 km.
const fr = name => search(name, 10).find(c => c.cc === 'FR');
async function world(t) {
  const ctx = await setup(t, { seeded: true });
  const ids = ctx.db.prepare('SELECT id FROM photos ORDER BY id').pluck().all();
  ['Angers', 'Angers', 'Nantes', 'Saumur', 'Tours', 'Strasbourg', 'Angers'].forEach((city, i) => {
    const c = fr(city);
    ctx.db.prepare("UPDATE photos SET status = 'published', on_map = 1, city_id = ?, city_name = ?, city_cc = ?, city_lat = ?, city_lon = ? WHERE id = ?").run(c.id, c.name, c.cc, c.lat, c.lon, ids[i]);
  });
  ctx.db.prepare('UPDATE photos SET on_map = 0 WHERE id = ?').run(ids[6]);                   // décochée : jamais montrée
  const slug = id => ctx.db.prepare('SELECT slug FROM photos WHERE id = ?').pluck().get(id);
  return { ...ctx, ids, slug };
}

test('calcul : seulement les photos sur la carte, dans le rayon, triées par distance, une pastille par ville', async t => {
  const c = await world(t);
  const all = c.app.db.prepare('SELECT * FROM photos WHERE status = \'published\'').all();
  const me = all.find(p => p.id === c.ids[0]);
  const m = photoMap(me, all, 'fr');
  assert.equal(m.me.city, 'Angers');
  assert.equal(m.me.same, 1);                                                               // l'autre photo d'Angers
  assert.deepEqual(m.others.map(o => o.city), ['Saumur', 'Nantes', 'Tours']);              // Strasbourg : trop loin
  assert.ok(m.others.every(o => o.km <= NEAR_KM));
  assert.deepEqual(m.list.map(x => [x.city, x.same]), [['Angers', true], ['Saumur', false], ['Nantes', false], ['Tours', false]]);
  assert.ok(!m.list.some(x => x.photo.id === c.ids[6]));                                    // décochée
  const v = m.view;
  for (const p of [m.me, ...m.others]) assert.ok(p.x > v.x && p.x < v.x + v.w && p.y > v.y && p.y < v.y + v.h);
  // Photo sans ville, ou pas sur la carte : pas de carte.
  assert.equal(photoMap({ ...me, on_map: 0 }, all, 'fr'), null);
  assert.equal(photoMap({ ...me, city_id: null }, all, 'fr'), null);
});

test('page publique : carte et « À proximité » quand la photo est sur la carte, rien sinon ; trois langues', async t => {
  const c = await world(t);
  const page = (await c.app.inject(`/photo/${c.slug(c.ids[0])}`)).body;
  assert.match(page, /<figure class="vmap" data-zoom-map>/);
  assert.match(page, /<title id="vmap-t">Carte : la photo a été prise à Angers<\/title>/);
  assert.match(page, /Prise à Angers · 4 photos à proximité/);
  assert.match(page, new RegExp(`class="vmap-o" href="/photo/${c.slug(c.ids[3])}" aria-label="Saumur : 1 photo · \\d+ km"`));
  assert.match(page, /<h2 id="near-t" class="eyebrow">À proximité<\/h2>[\s\S]*Angers · même ville[\s\S]*Saumur · \d+ km/);
  assert.doesNotMatch(page, new RegExp(`href="/photo/${c.slug(c.ids[6])}"`));             // décochée
  assert.doesNotMatch(page, new RegExp(`href="/photo/${c.slug(c.ids[5])}"`));             // Strasbourg : trop loin
  const de = (await c.app.inject(`/de/photo/${c.slug(c.ids[0])}`)).body;
  assert.match(de, /Aufgenommen in Angers · 4 Fotos in der Nähe/);
  assert.match(de, new RegExp(`href="/de/photo/${c.slug(c.ids[3])}"`));
  // Photo décochée : pas de carte ni de voisines.
  const off = (await c.app.inject(`/photo/${c.slug(c.ids[6])}`)).body;
  assert.doesNotMatch(off, /class="vmap"|id="near-t"/);
});
