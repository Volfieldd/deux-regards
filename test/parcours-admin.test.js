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
  const order = ['Aujourd’hui', 'Travailler', 'Sorties', 'Photothèque', 'Personnes', 'Publier', 'Site public', 'Séries', 'Instagram', 'Statistiques',
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

test('Aujourd’hui : choses à faire triées par urgence, lien vers l’écran qui les règle ; badge des urgences', async t => {
  const c = await admin(t);
  const julien = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const [p1, p2] = c.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 2").pluck().all();
  c.db.prepare("UPDATE photos SET author_id = ?, taken_on = '2026-10-11' WHERE id IN (?, ?)").run(julien, p1, p2);
  const enc = c.app.encounters;
  // Demande d'effacement (urgent), refus d'une photo liée encore publiée (urgent), refus dans une sortie (bientôt).
  await c.app.inject({ method: 'POST', url: '/bonjour', payload: { ref: 'J-0131', rights: 'effacement', email: 'clara@exemple.fr' } });
  const refus = enc.saveCard(null, { ref: 'J-0139', author_id: julien, met_on: '2026-10-11' });
  c.db.prepare('UPDATE encounters SET refused = 1 WHERE id = ?').run(refus);
  enc.link(refus, [p1]);
  const body = (await c.get('/admin')).body;
  const tasks = body.slice(body.indexOf('class="task-list"'), body.indexOf('</ul>', body.indexOf('class="task-list"')));
  const levels = [...tasks.matchAll(/class="task ([a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(levels, [...levels].sort((a, b) => ['urgent', 'bientot', 'plus-tard'].indexOf(a) - ['urgent', 'bientot', 'plus-tard'].indexOf(b)));
  assert.match(tasks, /Demande d’effacement de J-0131[\s\S]*à traiter avant le/);
  assert.match(tasks, new RegExp(`Refus de J-0139 : 1 photo encore publiée[\\s\\S]*href="/admin/rencontres/${refus}#refus"`));
  assert.match(tasks, /J-0139 a refusé : 1 photo publiée de sa sortie à vérifier/);   // p2 : ni liée ni exclue
  assert.match(tasks, /nouvelles personnes photographiées|nouvelle personne photographiée/);
  assert.match(tasks, /photos? publiées? sans ville[\s\S]*href="\/admin\/photos\?manque=ville"/);
  assert.match(body, /class="nav-badge urgent" aria-label="2 urgences">✕ 2</);
  // Le lien « sans ville » filtre la photothèque.
  const lib = (await c.get('/admin/photos?manque=ville')).body;
  assert.match(lib, /Publiées sans ville <span class="n">/);
  // Exclure p2 de la sortie et dépublier p1 : plus que la demande d'effacement en urgence.
  enc.exclude(refus, p2, true);
  enc.applyRefusal(refus);
  const after = (await c.get('/admin')).body;
  assert.doesNotMatch(after, /J-0139 a refusé|Refus de J-0139/);
  assert.match(after, /aria-label="1 urgence">✕ 1</);
});
