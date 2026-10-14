import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { takenTimeFromExif } from '../server/media.js';
import { normTime } from '../server/outings.js';

// Sorties : journée de prise de vue d'un photographe, découpable à une heure ; les accords et refus d'une rencontre
// couvrent les photos de sa partie de journée (photo ou rencontre sans heure : toutes les parties).
const TOKEN = 'jeton-de-test-0123456789';
const DAY = '2026-10-13';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function ctxOf(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const get = url => ctx.app.inject({ url, cookies });
  const post = (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  const julien = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  // Trois photos publiées de Julien ce jour-là : le matin, l'après-midi, et sans heure connue.
  const [morning, evening, unknown] = ctx.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 3").pluck().all();
  const set = ctx.db.prepare('UPDATE photos SET author_id = ?, taken_on = ?, taken_time = ?, faces = 1 WHERE id = ?');   // un visage chacune
  set.run(julien, DAY, '10:05', morning); set.run(julien, DAY, '15:40', evening); set.run(julien, DAY, '', unknown);
  // Une rencontre à 15 h 10, accord pour le site seulement.
  const enc = ctx.app.encounters;
  const id = enc.saveCard(null, { ref: 'J-0300', signed: 'on', scope_site: 'on', met_on: DAY, author_id: julien, name: 'Léo' });
  ctx.db.prepare("UPDATE encounters SET met_time = '15:10' WHERE id = ?").run(id);
  return { ...ctx, get, post, julien, morning, evening, unknown, id, enc };
}

test('heure de prise de vue lue dans l’EXIF ; heures saisies à la main comprises', async () => {
  const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } }).jpeg()
    .withExif({ IFD2: { DateTimeOriginal: '2026:10:13 15:04:09' } }).toBuffer();
  assert.equal(takenTimeFromExif((await sharp(jpeg).metadata()).exif), '15:04');
  assert.equal(takenTimeFromExif(null), '');
  assert.equal(normTime('9h05'), '09:05');
  assert.equal(normTime('15 h'), '15:00');
  assert.equal(normTime('15:10'), '15:10');
  assert.equal(normTime('midi'), null);
});

test('une sortie par photographe et par jour : liste, fiche, état ; Sorties dans le menu', async t => {
  const c = await ctxOf(t);
  const list = (await c.get('/admin/sorties')).body;
  assert.match(list, /<h1>Sorties<\/h1>/);
  assert.match(list, /href="\/admin\/sorties\/julien\/2026-10-13"/);
  assert.match(list, />Sorties<\/a>/);                                                  // menu, groupe Travailler
  const page = (await c.get('/admin/sorties/julien/2026-10-13')).body;
  assert.match(page, /3 photos · 1 personne/);
  assert.match(page, /J-0300 · Léo/);
  assert.match(page, /heure inconnue/);
  assert.equal((await c.get('/admin/sorties/julien/2026-13-99')).statusCode, 404);
  // Fiche d'une rencontre et fiche photo mènent à la sortie.
  assert.match((await c.get(`/admin/rencontres/${c.id}`)).body, /href="\/admin\/sorties\/julien\/2026-10-13">Ouvrir la sortie/);
  assert.match((await c.get(`/admin/photos/${c.evening}`)).body, /href="\/admin\/sorties\/julien\/2026-10-13">Ouvrir la sortie/);
});

test('couper à 13 h : la rencontre de 15 h 10 ne couvre plus la photo du matin ; réunir revient en arrière', async t => {
  const c = await ctxOf(t);
  const who = p => c.enc.forPhoto(p).map(e => e.ref);
  assert.deepEqual(who(c.morning), ['J-0300']);                                          // une seule sortie : tout le jour
  const cut = await c.post('/admin/sorties/julien/2026-10-13/couper', { heure: '13:00' });
  assert.equal(cut.headers.location, '/admin/sorties/julien/2026-10-13?depuis=1300');
  assert.deepEqual(who(c.morning), []);
  assert.deepEqual(who(c.evening), ['J-0300']);
  assert.deepEqual(who(c.unknown), ['J-0300']);                                          // heure inconnue : partout
  // Instagram : accord sans Instagram, bloquant pour l'après-midi seulement.
  assert.deepEqual(c.app.instagram.blocked(c.morning), []);
  assert.equal(c.app.instagram.blocked(c.evening).length, 1);
  // Deux sorties dans la liste ; la fiche de l'après-midi n'a que ses photos (et celle sans heure).
  const list = (await c.get('/admin/sorties')).body;
  assert.match(list, /de 13 h|à partir de 13 h/);
  const evening = (await c.get('/admin/sorties/julien/2026-10-13?depuis=1300')).body;
  assert.match(evening, /2 photos · 1 personne/);
  const morning = (await c.get('/admin/sorties/julien/2026-10-13')).body;
  assert.match(morning, /2 photos · 0 personne/);
  assert.match((await c.get(`/admin/rencontres/${c.id}`)).body, /href="\/admin\/sorties\/julien\/2026-10-13\?depuis=1300">Ouvrir la sortie/);
  // Réunir.
  await c.post('/admin/sorties/julien/2026-10-13/reunir', { depuis: '1300' });
  assert.deepEqual(who(c.morning), ['J-0300']);
  assert.equal((await c.post('/admin/sorties/julien/2026-10-13/couper', { heure: '25:00' })).statusCode, 303);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM outings WHERE starts <> '00:00'").pluck().get(), 0);
});

test('actions groupées : personne de la sortie n’y figure, lier à une personne ; lieu de la sortie', async t => {
  const c = await ctxOf(t);
  await c.post('/admin/sorties/julien/2026-10-13/photos', { action: 'exclure', photo: [String(c.morning), String(c.unknown)] });
  assert.deepEqual(c.enc.forPhoto(c.morning), []);
  assert.deepEqual(c.app.instagram.blocked(c.unknown), []);
  await c.post('/admin/sorties/julien/2026-10-13/photos', { action: 'retablir', photo: String(c.morning) });
  assert.equal(c.enc.forPhoto(c.morning).length, 1);
  await c.post('/admin/sorties/julien/2026-10-13/photos', { action: 'lier', personne: String(c.id), photo: String(c.evening) });
  assert.deepEqual(c.enc.forPhoto(c.evening).map(e => e.via), ['lien']);
  // Une photo d'une autre sortie est ignorée.
  const other = c.db.prepare("SELECT id FROM photos WHERE taken_on IS NOT ? ORDER BY id DESC LIMIT 1").pluck().get(DAY);
  const r = await c.post('/admin/sorties/julien/2026-10-13/photos', { action: 'lier', personne: String(c.id), photo: String(other) });
  assert.match(decodeURIComponent(r.headers['set-cookie'] || ''), /Cochez au moins une photo|flash/);
  await c.post('/admin/sorties/julien/2026-10-13/lieu', { lieu: 'Ars-en-Ré, le port' });
  assert.match((await c.get('/admin/sorties')).body, /Ars-en-Ré, le port/);
});
