import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setup } from './helpers.js';

// Parcours de l'admin : menu rangé par intention, vocabulaire fixe, page « Sur le terrain », Site public et
// Droits & confidentialité enregistrés séparément, états lisibles sans la couleur.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function admin(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const get = url => ctx.app.inject({ url, cookies });
  const post = (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  return { ...ctx, get, post };
}

test('menu en groupes, dans l’ordre ; vocabulaire de l’admin', async t => {
  const c = await admin(t);
  const body = (await c.get('/admin')).body;
  const order = ['Aujourd’hui', 'Travailler', 'Photothèque', 'Personnes', 'Publier', 'Site public', 'Séries', 'Instagram', 'Statistiques',
    'Sur le terrain', 'App, cartes, QR', 'Réglages', 'Photographes', 'Apparence', 'Filigrane &amp; EXIF', 'Droits &amp; confidentialité', 'Aide', 'Voir le site'];
  const side = body.slice(body.indexOf('<aside'), body.indexOf('</aside>'));
  let at = 0;
  for (const label of order) {
    const i = side.indexOf(label, at);
    assert.ok(i > -1, `${label} absent ou hors de l’ordre`);
    at = i;
  }
  assert.doesNotMatch(side, />Auteurs</);
  assert.doesNotMatch(side, />Rencontres</);
  assert.match((await c.get('/admin/auteurs')).body, /<h1>Photographes<\/h1>/);
  assert.match((await c.get('/admin/rencontres')).body, /<h1>Personnes photographiées<\/h1>[\s\S]*href="\/admin\/terrain">Sur le terrain/);
  assert.match((await c.get('/admin/rencontres/cartes')).body, /<h1>Cartes d’accord<\/h1>/);
});

test('Sur le terrain : app, cartes en réserve, une seule composition de QR avec le logo, liste de contrôle', async t => {
  const c = await admin(t);
  const julien = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  c.app.encounters.reserve('J', 30);                       // planche J-0001 à J-0030 imprimée
  c.db.prepare("INSERT INTO encounters (ref, author_id, created_at, updated_at) VALUES ('J-0012', ?, 1, 1)").run(julien);
  const page = (await c.get(`/admin/terrain?photographe=${julien}`)).body;
  assert.match(page, /Prochaine carte de Julien : <strong>J-0031<\/strong>/);
  assert.match(page, /18 cartes numérotées imprimées pas encore utilisées/);
  assert.equal((page.match(/\/qr\/[a-z]+-[a-z]+\.svg\?apercu=1/g) || []).length, 1);
  assert.match(page, new RegExp(`/admin/auteurs/${julien}/qr/vertical-noir\\.svg\\?apercu=1`));
  assert.match(page, /Votre connexion reste valable jusqu’à/);
  assert.match(page, /class="off">Récapitulatif par e-mail : préparé dans l’app Mail/);
  // Les QR ne sont plus sur la page Photographes : un lien y mène.
  const authors = (await c.get('/admin/auteurs')).body;
  assert.doesNotMatch(authors, /qr-model/);
  assert.match(authors, new RegExp(`href="/admin/terrain\\?photographe=${julien}"`));
});

test('Site public et Droits & confidentialité : chaque page n’enregistre que ses champs ; ancienne adresse redirigée', async t => {
  const c = await admin(t);
  assert.equal((await c.get('/admin/reglages')).headers.location, '/admin/site');
  await c.post('/admin/reglages', { part: 'site', site_name: 'Heures Creuses', tagline: 'Accroche gardée', map_page: 'on' });
  await c.post('/admin/reglages', { part: 'droits', privacy_contact: 'info@nicephos.art', privacy_mfa: 'on' });
  const site = (await c.get('/admin/site')).body;
  assert.match(site, /name="tagline" value="Accroche gardée"/);
  assert.match(site, /name="map_page" checked/);
  assert.doesNotMatch(site, /name="privacy_contact"/);
  const droits = (await c.get('/admin/droits')).body;
  assert.match(droits, /name="privacy_contact" value="info@nicephos\.art"/);
  assert.match(droits, /name="privacy_mfa" checked/);
  assert.doesNotMatch(droits, /name="tagline"/);
  // Réenregistrer le site ne touche pas la confidentialité, et inversement.
  await c.post('/admin/reglages', { part: 'site', site_name: 'Heures Creuses', tagline: 'Autre' });
  assert.match((await c.get('/admin/droits')).body, /name="privacy_mfa" checked/);
  await c.post('/admin/reglages', { part: 'droits' });
  assert.match((await c.get('/admin/site')).body, /name="tagline" value="Autre"/);
});

test('états lisibles sans la couleur : palette bleu / jaune / vermillon, forme en plus de la couleur', () => {
  const css = fs.readFileSync(new URL('../public/admin/admin.css', import.meta.url), 'utf8');
  assert.match(css, /--ok: #56b4e9; --warn: #f0e442; --danger: #e8743b;/);
  assert.doesNotMatch(css, /--ok: #7fc79a|--ok: #2e7d4f/);                     // plus de vert contre rouge
  for (const k of ['ok', 'warn', 'no']) assert.match(css, new RegExp(`\\.enc-tag\\.${k}::before \\{ content: "[✓▲✕] "`));
});
