import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { parseTakenOn } from '../server/admin-repo.js';

// Parcours d'administration revus après l'audit d'ergonomie : import suivi photo par photo,
// lot complété sur une page, actions groupées annulables, séries en cartes, ouverture ordonnée.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function admin(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = opts => ctx.app.inject({ ...opts, cookies: { ...cookies, ...opts.cookies } });
  const post = (url, payload = {}) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  const json = (url, payload = {}, token = csrf) => as({ method: 'POST', url, payload, headers: { 'x-csrf-token': token, accept: 'application/json' } });
  const id = (table, slug) => ctx.db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).pluck().get(slug);
  return { ...ctx, cookies, csrf, as, post, json, id };
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

const jpeg = () => sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#468' } }).jpeg().toBuffer();
const dated = () => sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#864' } })
  .withExif({ IFD2: { DateTimeOriginal: '2026:10:04 18:32:10' } }).jpeg().toBuffer();

function send(ctx, filename, value, { csrf = ctx.csrf } = {}) {
  const body = multipart([{ name: '_csrf', value: csrf }, { name: 'author_id', value: ctx.id('authors', 'julien') },
    { name: 'category_id', value: ctx.id('categories', 'rue') }, { name: 'photos', filename, value }]);
  return ctx.as({ method: 'POST', url: '/admin/photos/envoi', ...body, headers: { ...body.headers, accept: 'application/json' } });
}

async function untilReady(ctx, ids) {
  for (let i = 0; i < 200; i++) {
    const r = (await ctx.as({ url: `/admin/photos/traitement?ids=${ids.join(',')}` })).json();
    if (r.photos.every(p => p.state !== 'waiting' && p.state !== 'processing')) return r;
    await new Promise(res => setTimeout(res, 50));
  }
  throw new Error('traitement trop long');
}

test('dates en langage courant', () => {
  const cases = { '2026-10': '2026-10', '10/2026': '2026-10', '5/10/2026': '2026-10-05', 'oct. 2026': '2026-10', 'Octobre 2026': '2026-10',
    '1er oct 2026': '2026-10-01', 'févr. 2025': '2025-02', 'août 2024': '2024-08', 'juil 2025': '2025-07', '': null };
  for (const [input, expected] of Object.entries(cases)) assert.equal(parseTakenOn(input), expected, input);
  for (const bad of ['ju 2025', '13/2026', '31/02/2026', '2026', 'hier']) assert.equal(parseTakenOn(bad), undefined, bad);
});

test('envoi d’une photo : réponse immédiate, traitement suivi étape par étape, titre provisoire', async t => {
  const ctx = await admin(t);
  const res = await send(ctx, 'DSCF0241.jpg', await jpeg());
  assert.equal(res.statusCode, 200);
  const { id, title } = res.json();
  assert.equal(title, 'DSCF0241');
  const r = await untilReady(ctx, [id]);
  assert.equal(r.photos[0].state, 'ready');
  assert.match(r.photos[0].thumb, /^\/admin\/media\/[0-9a-f-]+-640\.webp$/);
  assert.equal(r.active, 0);
  const row = ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  assert.equal(row.status, 'draft');
  assert.equal(row.source_name, 'DSCF0241.jpg');
  // Variantes écrites, rien ne reste dans tmp/.
  const stem = path.parse(row.file).name;
  assert.equal(fs.readdirSync(path.join(ctx.config.storageDir, 'variants')).filter(f => f.startsWith(stem)).length, 6);
  assert.deepEqual(fs.readdirSync(path.join(ctx.config.storageDir, 'tmp')), []);
  // Liste : titre provisoire signalé.
  assert.match((await ctx.as({ url: '/admin/photos?statut=draft' })).body, /Titre provisoire \(nom du fichier\)/);
});

test('envoi : date de prise de vue reprise de l’appareil (EXIF), sinon vide', async t => {
  const ctx = await admin(t);
  const a = (await send(ctx, 'DSCF0300.jpg', await dated())).json().id;
  const b = (await send(ctx, 'sans-date.jpg', await jpeg())).json().id;
  await untilReady(ctx, [a, b]);
  assert.equal(ctx.db.prepare('SELECT taken_on FROM photos WHERE id = ?').pluck().get(a), '2026-10-04');
  assert.equal(ctx.db.prepare('SELECT taken_on FROM photos WHERE id = ?').pluck().get(b), null);
});

test('envoi : fichier refusé avec sa raison, jeton CSRF exigé, photo inconnue signalée', async t => {
  const ctx = await admin(t);
  const bad = await send(ctx, 'notes.jpg', 'pas une image');
  assert.equal(bad.statusCode, 422);
  assert.match(bad.json().error, /pas une image lisible/);
  assert.equal((await send(ctx, 'a.jpg', await jpeg(), { csrf: 'faux' })).statusCode, 403);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) FROM photos WHERE status = 'draft'").pluck().get(), 0);
  assert.deepEqual((await ctx.as({ url: '/admin/photos/traitement?ids=999' })).json().photos, [{ id: 999, state: 'missing' }]);
});

test('compléter le lot : champ par champ, date comprise, adresse qui suit le titre du brouillon', async t => {
  const ctx = await admin(t);
  const { id } = (await send(ctx, 'DSCF0242.jpg', await jpeg())).json();
  await untilReady(ctx, [id]);
  const page = await ctx.as({ url: `/admin/photos/lot?ids=${id}` });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Compléter et publier/);
  assert.match(page.body, /data-provisional/);
  // Téléphone (audit iPhone) : cellules étiquetées pour l'affichage en cartes, champs du lot repliables.
  for (const label of ['Titre', 'Série', 'Lieu', 'Date']) assert.match(page.body, new RegExp(`data-label="${label}"`));
  assert.match(page.body, /data-bulk-toggle aria-expanded="false" aria-controls="bulk-groups" hidden/);
  assert.match(page.body, /<div class="bulk-groups" id="bulk-groups">/);
  // Photothèque : bouton « Ouvrir la fiche » dans le panneau d'une photo.
  assert.match((await ctx.as({ url: '/admin/photos' })).body, /data-one-open hidden>Ouvrir la fiche</);

  const r = (await ctx.json(`/admin/photos/${id}/champs`, { title: 'Seconde veille' })).json();
  assert.equal(r.photo.provisional, false);
  assert.equal(r.photo.slug, 'seconde-veille');
  const d = (await ctx.json(`/admin/photos/${id}/champs`, { taken_on: 'oct. 2026' })).json();
  assert.equal(d.photo.taken_on, '2026-10');
  assert.ok(d.photo.when);
  const bad = await ctx.json(`/admin/photos/${id}/champs`, { taken_on: 'hier' });
  assert.equal(bad.statusCode, 422);
  assert.match(bad.json().errors.taken_on, /Date non comprise/);
  assert.equal((await ctx.json(`/admin/photos/${id}/champs`, { title: 'x' }, 'faux')).statusCode, 403);
  // Photo publiée : son adresse ne change pas avec le titre.
  const pub = ctx.db.prepare("SELECT * FROM photos WHERE status = 'published' LIMIT 1").get();
  assert.equal((await ctx.json(`/admin/photos/${pub.id}/champs`, { title: 'Autre titre' })).json().photo.slug, pub.slug);
});

test('compléter le lot sans JavaScript : tout le tableau, erreurs par ligne, puis publication', async t => {
  const ctx = await admin(t);
  const a = (await send(ctx, 'A1.jpg', await jpeg())).json().id;
  const b = (await send(ctx, 'B2.jpg', await jpeg())).json().id;
  await untilReady(ctx, [a, b]);
  const err = await ctx.post('/admin/photos/lot', { ids: `${a},${b}`, [`title_${a}`]: 'Lisière', [`taken_on_${a}`]: '10/2026', [`title_${b}`]: '', [`taken_on_${b}`]: '' });
  assert.equal(err.statusCode, 422);
  assert.match(err.body, /Le titre est obligatoire/);
  assert.equal(ctx.db.prepare('SELECT taken_on FROM photos WHERE id = ?').pluck().get(a), '2026-10');   // la ligne valide est enregistrée
  const ok = await ctx.post('/admin/photos/lot', { ids: `${a},${b}`, [`title_${b}`]: 'Pluie fine', publish: '1' });
  assert.equal(ok.statusCode, 303);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) FROM photos WHERE id IN (?, ?) AND status = 'published'").pluck().get(a, b), 2);
});

test('actions groupées : publier, changer de série (y compris nouvelle), annuler', async t => {
  const ctx = await admin(t);
  const ids = ctx.db.prepare('SELECT id FROM photos ORDER BY position LIMIT 3').pluck().all();
  const status = () => ctx.db.prepare(`SELECT status FROM photos WHERE id IN (${ids.join(',')})`).pluck().all();

  const draft = (await ctx.json('/admin/photos/actions', { ids, action: 'draft' })).json();
  assert.equal(draft.count, 3);
  assert.deepEqual(status(), ['draft', 'draft', 'draft']);
  await ctx.json('/admin/photos/actions', draft.undo);
  assert.deepEqual(status(), ['published', 'published', 'published']);

  const before = ctx.db.prepare(`SELECT id, category_id FROM photos WHERE id IN (${ids.join(',')})`).all();
  const moved = (await ctx.json('/admin/photos/actions', { ids, action: 'category', category_id: 'new', new_category: 'Nuits d’automne' })).json();
  assert.match(moved.text, /3 photos déplacées vers « Nuits d’automne »/);
  const nuits = ctx.id('categories', 'nuits-d-automne');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM photos WHERE category_id = ?').pluck().get(nuits), 3);
  await ctx.json('/admin/photos/actions', moved.undo);
  assert.deepEqual(ctx.db.prepare(`SELECT id, category_id FROM photos WHERE id IN (${ids.join(',')})`).all(), before);

  const fields = await ctx.json('/admin/photos/actions', { ids, action: 'fields', place: 'Nantes', taken_on: 'nov. 2025' });
  assert.equal(fields.statusCode, 200);
  assert.deepEqual(ctx.db.prepare(`SELECT DISTINCT place || ' ' || taken_on FROM photos WHERE id IN (${ids.join(',')})`).pluck().all(), ['Nantes 2025-11']);
  // Annuler : lieu et date d'avant.
  const placesBefore = ctx.db.prepare(`SELECT id, place, taken_on FROM photos WHERE id IN (${ids.join(',')})`).all();
  const again = (await ctx.json('/admin/photos/actions', { ids, action: 'fields', place: 'Lisbonne' })).json();
  assert.match(again.text, /Lieu « Lisbonne » appliqué à 3 photos/);
  await ctx.json('/admin/photos/actions', again.undo);
  assert.deepEqual(ctx.db.prepare(`SELECT id, place, taken_on FROM photos WHERE id IN (${ids.join(',')})`).all(), placesBefore);
  assert.equal((await ctx.json('/admin/photos/actions', { ids, action: 'fields', taken_on: 'hier' })).statusCode, 422);
  assert.equal((await ctx.json('/admin/photos/actions', { ids: [], action: 'publish' })).statusCode, 422);
  assert.equal((await ctx.json('/admin/photos/actions', { ids, action: 'category', category_id: 9999 })).statusCode, 422);
  assert.equal((await ctx.json('/admin/photos/actions', { ids, action: 'publish' }, 'faux')).statusCode, 403);
});

test('suppression groupée : jamais sans confirmation', async t => {
  const ctx = await admin(t);
  const ids = ctx.db.prepare('SELECT id FROM photos ORDER BY position LIMIT 2').pluck().all();
  const count = () => ctx.db.prepare('SELECT COUNT(*) FROM photos').pluck().get();
  const n = count();
  assert.equal((await ctx.json('/admin/photos/actions', { ids, action: 'delete' })).statusCode, 422);
  const page = await ctx.post('/admin/photos/actions', { ids: ids.map(String), action: 'delete' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Supprimer 2 photos \?/);
  assert.equal(count(), n);
  const ok = await ctx.post('/admin/photos/actions', { ids: ids.map(String), action: 'delete', confirm: '1' });
  assert.equal(ok.statusCode, 303);
  assert.equal(count(), n - 2);
});

test('page Photos : barre d’outils, sélection, statuts en texte, lien d’évitement', async t => {
  const ctx = await admin(t);
  const body = (await ctx.as({ url: '/admin/photos' })).body;
  assert.match(body, /<a class="skip" href="#contenu">Aller au contenu<\/a>/);
  assert.match(body, /Importer des photos/);
  assert.match(body, /<section class="importer" id="import"[^>]* hidden>/);
  assert.match((await ctx.as({ url: '/admin/photos?importer' })).body, /<section class="importer" id="import"[^>]*data-max-bytes="\d+">/);
  assert.equal((body.match(/name="ids" value="\d+" form="bulk"/g) || []).length, 12);
  // Planche contact par défaut : une vignette par photo, au format de la photo, et l'inspecteur.
  assert.match(body, /<ol class="contact" data-sortable data-contact/);
  assert.match(body, /<li id="photo-\d+" class="tile ar-150"/);
  assert.match(body, /<aside class="insp" aria-label="Inspecteur" data-inspector>/);
  const json = JSON.parse(/<script type="application\/json" id="photos-data">([^<]*)<\/script>/.exec(body)[1]);
  assert.equal(json.length, 12);
  assert.ok(json[0].thumb && json[0].large && json[0].title);
  // Vue liste : statuts en texte et symbole.
  const list = (await ctx.as({ url: '/admin/photos?vue=liste' })).body;
  assert.match(list, /class="plist" data-sortable/);
  assert.match(list, /<span aria-hidden="true">●<\/span> Publiée/);
});

test('séries : cartes avec couverture, ordre par glisser (JSON), création en tête', async t => {
  const ctx = await admin(t);
  const body = (await ctx.as({ url: '/admin/series' })).body;
  assert.equal((body.match(/<article class="scard"/g) || []).length, 4);
  assert.match(body, /href="\/admin\/photos\?serie=rue">Photos ›/);
  assert.match(body, /<picture>/);
  const ids = ctx.db.prepare('SELECT id FROM categories ORDER BY position').pluck().all();
  const reversed = [...ids].reverse();
  assert.deepEqual((await ctx.json('/admin/series/order', { ids: reversed })).json(), { ok: true });
  assert.deepEqual(ctx.db.prepare('SELECT id FROM categories ORDER BY position').pluck().all(), reversed);
  assert.equal((await ctx.json('/admin/series/order', { ids: ids.slice(1) })).statusCode, 422);
  const created = await ctx.post('/admin/series', { name: 'Nuits' });
  assert.match(created.headers.location, /^\/admin\/series#serie-\d+$/);
  assert.equal(ctx.db.prepare('SELECT slug FROM categories ORDER BY position LIMIT 1').pluck().get(), 'nuits');
});

test('ouverture : ordre choisi, déplacer et retirer sans JavaScript, 8 au plus', async t => {
  const ctx = await admin(t);
  const slugs = ctx.db.prepare("SELECT slug FROM photos WHERE status = 'published' ORDER BY position").pluck().all();
  const hero = () => JSON.parse(ctx.db.prepare("SELECT value FROM settings WHERE key = 'hero'").pluck().get());
  await ctx.post('/admin/reglages', { hero: [slugs[3], slugs[0], slugs[5]] });
  assert.deepEqual(hero(), [slugs[3], slugs[0], slugs[5]]);                      // l'ordre donné, pas celui de la galerie
  const left = await ctx.post('/admin/reglages', { hero: hero(), hero_op: `left:${slugs[0]}` });
  assert.equal(left.headers.location, '/admin/reglages#ouverture');
  assert.deepEqual(hero(), [slugs[0], slugs[3], slugs[5]]);
  await ctx.post('/admin/reglages', { hero: hero(), hero_op: `remove:${slugs[3]}` });
  assert.deepEqual(hero(), [slugs[0], slugs[5]]);
  await ctx.post('/admin/reglages', { hero: slugs });
  assert.equal(hero().length, 8);
  const page = (await ctx.as({ url: '/admin/reglages' })).body;
  assert.match(page, /8 \/ 8 choisies/);
  assert.match(page, /Le diaporama est complet/);
  // Le site public suit cet ordre.
  const home = (await ctx.app.inject('/')).body;
  const first = ctx.db.prepare('SELECT title FROM photos WHERE slug = ?').pluck().get(slugs[0]);
  assert.ok(home.includes(first));
});

// ---------- refonte « Chambre noire » ----------

test('mode clair / sombre : cookie de l’admin, sans effet sur le site public', async t => {
  const ctx = await admin(t);
  assert.doesNotMatch((await ctx.as({ url: '/admin' })).body, /<html lang="fr" data-theme/);       // par défaut : celui du système
  const res = await ctx.post('/admin/theme', { theme: 'light', back: '/admin/photos' });
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/admin/photos');
  const cookie = res.cookies.find(c => c.name === 'admin_theme');
  assert.equal(cookie.value, 'light');
  assert.equal(cookie.path, '/admin');
  assert.match((await ctx.as({ url: '/admin', cookies: { admin_theme: 'light' } })).body, /<html lang="fr" data-theme="light">/);
  assert.doesNotMatch((await ctx.as({ url: '/admin', cookies: { admin_theme: '"><script>' } })).body, /data-theme=/);   // valeur inconnue ignorée
  assert.equal((await ctx.json('/admin/theme', { theme: 'dark' })).json().theme, 'dark');
  assert.equal((await ctx.json('/admin/theme', { theme: 'dark' }, 'faux')).statusCode, 403);
  assert.equal((await ctx.post('/admin/theme', { theme: 'light', back: '//evil.example' })).headers.location, '/admin');
});

test('palette ⌘K : index des photos et des séries, réservé aux admins', async t => {
  const ctx = await admin(t);
  const r = (await ctx.as({ url: '/admin/recherche.json' })).json();
  assert.equal(r.photos.length, 12);
  assert.ok(r.photos.every(p => p.id && p.title && p.thumb.startsWith('/admin/media/')));
  assert.deepEqual(r.series.map(s => s.slug), ['rue', 'portrait', 'paysage', 'voyage']);
  assert.notEqual((await ctx.app.inject('/admin/recherche.json')).statusCode, 200);
});

test('inspecteur : données d’une photo, filtre « À finir »', async t => {
  const ctx = await admin(t);
  const d = (await ctx.as({ url: '/admin/photos/1/donnees' })).json();
  assert.equal(d.id, 1);
  assert.ok(d.large.startsWith('/admin/media/') && d.thumb.startsWith('/admin/media/'));
  assert.equal((await ctx.as({ url: '/admin/photos/999/donnees' })).statusCode, 404);
  assert.notEqual((await ctx.app.inject('/admin/photos/1/donnees')).statusCode, 200);
  const { id } = (await send(ctx, 'DSCF0400.jpg', await jpeg())).json();
  await untilReady(ctx, [id]);
  const body = (await ctx.as({ url: '/admin/photos?statut=afinir' })).body;
  assert.equal((body.match(/<li id="photo-/g) || []).length, 1);
  assert.match(body, /aria-current="true">À finir <span class="n">1<\/span>/);
});

test('aujourd’hui : à finir, ouverture, rythme ; séries en planches de 3 photos', async t => {
  const ctx = await admin(t);
  const { id } = (await send(ctx, 'DSCF0500.jpg', await jpeg())).json();
  await untilReady(ctx, [id]);
  const home = (await ctx.as({ url: '/admin' })).body;
  assert.match(home, /<h1>(Bonjour|Bonsoir), Julien\.<\/h1>/);
  assert.match(home, /À finir <span class="mono">1 photo<\/span>/);
  assert.match(home, /DSCF0500[\s\S]*titre provisoire/);
  assert.equal((home.match(/<i class="h\d+( now)?"><\/i>/g) || []).length, 12);
  assert.match(home, /Preuves d’antériorité/);
  const series = (await ctx.as({ url: '/admin/series' })).body;
  const rue = /<article class="scard" id="serie-\d+"[^>]*>[\s\S]*?<\/article>/.exec(series)[0];
  assert.equal((rue.match(/<picture>/g) || []).length, 3);
});

test('publier en un clic : titre provisoire rappelé dans le message, Annuler possible, plus de fenêtre de confirmation', async t => {
  const ctx = await admin(t);
  const { id } = (await send(ctx, 'DSCF0777.jpg', await jpeg())).json();
  await untilReady(ctx, [id]);
  const named = ctx.db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  ctx.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(named);
  const one = (await ctx.json('/admin/photos/actions', { ids: [id], action: 'publish' })).json();
  assert.equal(one.text, '1 photo publiée. Elle garde le nom du fichier comme titre : corrigez-le dans la photothèque.');
  assert.equal(ctx.db.prepare('SELECT status FROM photos WHERE id = ?').pluck().get(id), 'published');
  assert.deepEqual(one.undo, { action: 'statuses', map: { [id]: 'draft' } });
  await ctx.json('/admin/photos/actions', one.undo);
  const two = (await ctx.json('/admin/photos/actions', { ids: [id, named], action: 'publish' })).json();
  assert.equal(two.text, '2 photos publiées. 1 garde le nom du fichier comme titre : corrigez-le dans la photothèque.');
  const plain = (await ctx.json('/admin/photos/actions', { ids: [named], action: 'publish' })).json();
  assert.equal(plain.text, '1 photo publiée.');
  for (const url of ['/admin/photos', `/admin/photos/lot?ids=${id}`]) assert.doesNotMatch((await ctx.as({ url })).body, /data-confirm-publish/);
});
