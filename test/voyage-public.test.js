import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { tripStory } from '../server/trip-story.js';
import { search } from '../server/geo/cities.js';

// Page publique d'un voyage : publiée voyage par voyage, ses jours (photos publiées seulement), sa carte cadrée sur
// ses étapes avec leurs encarts de date, la liste des voyages, le lien du menu, le plan du site.
const pt = name => search(name, 10).find(c => c.cc === 'PT');
async function world(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: 'jeton-de-test-0123456789' } });
  const ids = ctx.db.prepare('SELECT id, author_id FROM photos ORDER BY id').all();
  const plan = [['2026-09-01', 'Lisbonne'], ['2026-09-02', 'Lisbonne'], ['2026-09-03', 'Sintra'], ['2026-09-04', 'Coimbra'], ['2026-09-05', 'Porto'], ['2026-09-05', 'Porto']];
  plan.forEach(([day, city], i) => {
    const c = pt(city);
    ctx.db.prepare("UPDATE photos SET taken_on = ?, status = 'published', city_id = ?, city_name = ?, city_cc = ?, city_lat = ?, city_lon = ? WHERE id = ?").run(day, c.id, c.name, c.cc, c.lat, c.lon, ids[i].id);
  });
  // Un brouillon du même voyage : jamais montré.
  ctx.db.prepare("UPDATE photos SET taken_on = '2026-09-06', status = 'draft' WHERE id = ?").run(ids[6].id);
  const trip = ctx.app.trips.create({ name: 'Portugal, septembre 2026' });
  ctx.app.trips.update(trip, { name_de: 'Portugal, September 2026', intro: 'Six jours le long de la côte.' });
  ctx.app.trips.addDays(trip, [...plan, ['2026-09-06']].map(([day], i) => ({ author_id: ids[i].author_id, day })));
  return { ...ctx, trip, ids };
}

test('récit et carte : jours publiés, étapes réunies, cadrage, encarts sans chevauchement', async t => {
  const c = await world(t);
  const tr = c.app.trips.get(c.trip);
  const photos = c.app.trips.photos(c.trip).filter(p => p.status === 'published');
  const s = tripStory({ trip: tr, photos, lang: 'fr', locale: 'fr-FR' });
  assert.deepEqual(s.days.map(d => [d.n, d.day, d.city]), [[1, '2026-09-01', 'Lisbonne'], [2, '2026-09-02', 'Lisbonne'], [3, '2026-09-03', 'Sintra'], [4, '2026-09-04', 'Coimbra'], [5, '2026-09-05', 'Porto']]);
  assert.deepEqual(s.stops.map(x => [x.n, x.city]), [['1–2', 'Lisbonne'], ['3', 'Sintra'], ['4', 'Coimbra'], ['5', 'Porto']]);
  assert.equal(s.stops[0].when, '1 sept. – 2 sept.');
  // Toutes les étapes dans le cadre ; encarts dans le cadre et sans se chevaucher.
  const v = s.view;
  for (const x of s.stops) assert.ok(x.x > v.x && x.x < v.x + v.w && x.y > v.y && x.y < v.y + v.h);
  const boxes = s.stops.map(x => x.box);
  for (const b of boxes) assert.ok(b.x >= v.x && b.y >= v.y && b.x + b.w <= v.x + v.w + 1e-6 && b.y + b.h <= v.y + v.h + 1e-6);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `encarts ${i} et ${j}`);
  }
  assert.match(s.path, /^M[\d.]+,[\d.]+( Q[\d.]+,[\d.]+ [\d.]+,[\d.]+){3}$/);
  assert.ok(v.w < 125, 'cadrage serré : tuiles détaillées');
  // En allemand : noms de ville dans la langue.
  assert.equal(tripStory({ trip: tr, photos, lang: 'de', locale: 'de-DE' }).days[0].city, 'Lissabon');
});

test('page publique : publiée voyage par voyage, aperçu pour l’équipe, trois langues, liste, menu, plan du site', async t => {
  const c = await world(t);
  // Pas publié : introuvable pour les visiteurs, pas de lien dans le menu.
  assert.equal((await c.app.inject('/voyage/portugal-septembre-2026')).statusCode, 404);
  assert.equal((await c.app.inject('/voyages')).statusCode, 404);
  assert.doesNotMatch((await c.app.inject('/')).body, /href="\/voyages"/);
  // L'équipe le voit en aperçu (bandeau, jamais indexé).
  const login = await c.app.inject({ method: 'POST', url: '/auth/local', payload: { token: 'jeton-de-test-0123456789', author: 'julien' } });
  const cookies = Object.fromEntries(login.cookies.filter(x => x.value).map(x => [x.name, x.value]));
  const preview = await c.app.inject({ url: '/voyage/portugal-septembre-2026', cookies });
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.headers['x-robots-tag'], 'noindex');
  assert.match(preview.body, /Aperçu réservé à l’équipe/);
  c.app.trips.update(c.trip, { public: true });
  const r = await c.app.inject('/voyage/portugal-septembre-2026');
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['x-robots-tag'], undefined);
  const page = r.body;
  assert.match(page, /<h1>Portugal, septembre 2026<\/h1>/);
  assert.match(page, /du 1 septembre au 5 septembre 2026 · 5 jours · 6 photos/);
  assert.match(page, /Six jours le long de la côte\./);
  assert.match(page, /<svg class="trip-svg" viewBox="[\d. ]+"/);
  assert.match(page, /aria-label="Étape 1–2, 1 sept\. – 2 sept\. : Lisbonne"/);
  assert.match(page, /<tspan class="trip-tag-n">J5<\/tspan> · 5 sept\./);
  assert.match(page, /class="trip-route"/);
  assert.match(page, /id="jour-5"[\s\S]*Porto/);
  assert.doesNotMatch(page, new RegExp(`href="/photo/${c.db.prepare('SELECT slug FROM photos WHERE id = ?').pluck().get(c.ids[6].id)}"`));   // brouillon
  // Allemand, liste, menu, plan du site.
  const de = (await c.app.inject('/de/voyage/portugal-septembre-2026')).body;
  assert.match(de, /<h1>Portugal, September 2026<\/h1>/);
  assert.match(de, /Etappe 1–2, 1\. Sept\. – 2\. Sept\.: Lissabon/);
  assert.match((await c.app.inject('/voyages')).body, /href="\/voyage\/portugal-septembre-2026"[\s\S]*5 jours · 6 photos/);
  assert.match((await c.app.inject('/en/')).body, /href="\/en\/voyages">Trips</);
  const sitemap = (await c.app.inject('/sitemap.xml')).body;
  assert.match(sitemap, /<loc>[^<]*\/voyage\/portugal-septembre-2026<\/loc>/);
  assert.match(sitemap, /<loc>[^<]*\/de\/voyages<\/loc>/);
});
