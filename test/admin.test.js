import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { loadConfig } from '../server/config.js';
import { titleFromFilename } from '../server/routes/admin.js';

const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

// App seedée, connectée en local en tant que Julien.
async function admin(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  assert.equal(res.statusCode, 303);
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = (opts) => ctx.app.inject({ ...opts, cookies: { ...cookies, ...opts.cookies } });
  const post = (url, payload = {}, extra = {}) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' }, ...extra });
  return { ...ctx, cookies, csrf, as, post };
}

// Corps multipart/form-data, champs dans l'ordre donné (comme le navigateur).
function multipart(parts) {
  const boundary = '----test' + Math.random().toString(16).slice(2);
  const chunks = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${p.filename ? `; filename="${p.filename}"` : ''}\r\n`
      + (p.filename ? `Content-Type: ${p.type || 'application/octet-stream'}\r\n` : '') + '\r\n'));
    chunks.push(Buffer.isBuffer(p.value) ? p.value : Buffer.from(String(p.value)));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

// JPEG 1600×900 tourné à 90° par EXIF (orientation 6) : affiché en 900×1600.
const rotatedJpeg = () => sharp({ create: { width: 1600, height: 900, channels: 3, background: '#7a6' } })
  .jpeg().withMetadata({ orientation: 6 }).withExif({ IFD0: { Artist: 'SECRET' } }).toBuffer();

async function importFiles(ctx, files, { csrf = ctx.csrf, csrfFirst = true, accept = 'application/json' } = {}) {
  const author = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const category = ctx.db.prepare("SELECT id FROM categories WHERE slug = 'rue'").pluck().get();
  const fields = [{ name: 'author_id', value: author }, { name: 'category_id', value: category }];
  const token = { name: '_csrf', value: csrf };
  const body = multipart([...(csrfFirst ? [token] : []), ...fields, ...files.map(f => ({ name: 'photos', ...f })), ...(csrfFirst ? [] : [token])]);
  return ctx.as({ method: 'POST', url: '/admin/photos/import', ...body, headers: { ...body.headers, accept } });
}

// ---------- connexion locale de test ----------

test('connexion locale : absente par défaut', async t => {
  const { app } = await setup(t);
  assert.equal((await app.inject('/auth/local')).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } })).statusCode, 404);
});

test('connexion locale : interdite en ligne, jeton trop court refusé', () => {
  assert.throws(() => loadConfig({ LOCAL_AUTH_TOKEN: TOKEN, NODE_ENV: 'production', COOKIE_SECRET: 'x'.repeat(32) }), /réservé aux tests/);
  assert.throws(() => loadConfig({ LOCAL_AUTH_TOKEN: TOKEN, PUBLIC_URL: 'https://a.example', COOKIE_SECRET: 'x'.repeat(32) }), /réservé aux tests/);
  assert.throws(() => loadConfig({ LOCAL_AUTH_TOKEN: 'court' }), /16 caractères/);
});

test('connexion locale : jeton exigé, /auth/login y renvoie sans OIDC, déconnexion locale', async t => {
  const { app, db } = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const login = await app.inject('/auth/login?next=/admin/photos');
  assert.equal(login.headers.location, '/auth/local?next=%2Fadmin%2Fphotos');
  const page = await app.inject(login.headers.location);
  assert.match(page.body, /Connexion de test/);
  assert.match(page.body, /<option value="sebastien">Sébastien<\/option>/);

  const bad = await app.inject({ method: 'POST', url: '/auth/local', payload: { token: 'mauvais-jeton-0000000', author: 'julien' } });
  assert.equal(bad.statusCode, 401);
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 0);

  const ok = await app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/\t/evil.example' } });
  assert.equal(ok.statusCode, 303);
  assert.equal(ok.headers.location, '/admin');
  const cookies = cookiesOf(ok);
  const home = await app.inject({ url: '/admin', cookies });
  assert.match(home.body, /Connexion locale de test/);
  assert.match(home.body, /lié au photographe <strong>Julien<\/strong>/);   // l'auteur choisi à la connexion
  const photos = await app.inject({ url: '/admin/photos', cookies });
  const julien = db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  assert.match(photos.body, new RegExp(`<option value="${julien}" selected>Julien</option>`)); // auteur par défaut de l'import

  const csrf = db.prepare('SELECT csrf FROM sessions').pluck().get();
  const out = await app.inject({ method: 'POST', url: '/auth/logout', cookies, payload: { _csrf: csrf } });
  assert.equal(out.headers.location, '/');
});

test('connexion locale : le sub lié à l’auteur est repris', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  ctx.db.prepare("UPDATE authors SET oidc_sub = 'zitadel-123' WHERE slug = 'julien'").run();
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  const home = await ctx.app.inject({ url: '/admin', cookies: cookiesOf(res) });
  assert.match(home.body, /lié au photographe <strong>Julien<\/strong>/);
});

// ---------- accès ----------

test('toutes les pages de l’admin exigent une session et répondent une fois connecté', async t => {
  const ctx = await admin(t);
  for (const url of ['/admin', '/admin/photos', '/admin/photos/1', '/admin/series', '/admin/auteurs', '/admin/site', '/admin/droits', '/admin/terrain']) {
    assert.equal((await ctx.app.inject(url)).statusCode, 302, url);
    const res = await ctx.as({ url });
    assert.equal(res.statusCode, 200, url);
    assert.equal(res.headers['cache-control'], 'no-store', url);
    assert.match(res.body, /name="robots" content="noindex"/);
  }
  assert.equal((await ctx.as({ url: '/admin/photos/999' })).statusCode, 404);
  assert.equal((await ctx.as({ url: '/admin/photos/abc' })).statusCode, 404);
});

test('toute écriture exige le jeton CSRF', async t => {
  const ctx = await admin(t);
  const writes = ['/admin/photos/1', '/admin/photos/1/status', '/admin/photos/1/move', '/admin/photos/1/delete', '/admin/series',
    '/admin/series/1', '/admin/series/1/delete', '/admin/auteurs', '/admin/auteurs/1', '/admin/reglages'];
  for (const url of writes) {
    const res = await ctx.post(url, { _csrf: 'faux', name: 'x', title: 'x' });
    assert.equal(res.statusCode, 403, url);
  }
  const order = await ctx.as({ method: 'POST', url: '/admin/photos/order', payload: { ids: [1] } });
  assert.equal(order.statusCode, 403);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM photos').pluck().get(), 12);
});

// ---------- import ----------

test('import : brouillon, orientation EXIF appliquée, métadonnées retirées, aperçu admin seulement', async t => {
  const ctx = await admin(t);
  const res = await importFiles(ctx, [{ filename: 'IMG_2041 quai-nord.jpg', type: 'image/jpeg', value: await rotatedJpeg() }]);
  assert.equal(res.statusCode, 200);
  const { imported, refused } = res.json();
  assert.equal(refused.length, 0);
  const photo = ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(imported[0].id);
  assert.equal(photo.status, 'draft');
  assert.equal(photo.title, 'IMG 2041 quai nord');
  assert.deepEqual([photo.width, photo.height], [900, 1600]);
  assert.equal(photo.position, 12);

  const stem = path.parse(photo.file).name;
  const variants = fs.readdirSync(path.join(ctx.config.storageDir, 'variants')).filter(f => f.startsWith(stem));
  assert.deepEqual(variants.sort(), [`${stem}-640.avif`, `${stem}-640.webp`, `${stem}-900.avif`, `${stem}-900.webp`].sort());
  const meta = await sharp(path.join(ctx.config.storageDir, 'variants', `${stem}-900.webp`)).metadata();
  assert.equal(meta.exif, undefined);
  assert.equal(meta.width, 900);                                // pixels réellement tournés

  // Brouillon : invisible du public, visible en aperçu admin.
  assert.equal((await ctx.app.inject(`/media/${stem}-640.webp`)).statusCode, 404);
  assert.equal((await ctx.as({ url: `/admin/media/${stem}-640.webp` })).statusCode, 200);
  assert.equal((await ctx.app.inject(`/admin/media/${stem}-640.webp`)).statusCode, 302);
  assert.equal((await ctx.app.inject(`/photo/${photo.slug}`)).statusCode, 404);

  const pub = await ctx.post(`/admin/photos/${photo.id}/status`, { status: 'published' });
  assert.equal(pub.statusCode, 303);
  const media = await ctx.app.inject(`/media/${stem}-640.webp`);
  assert.equal(media.statusCode, 200);
  assert.match(media.headers['cache-control'], /immutable/);
  assert.equal((await ctx.app.inject(`/photo/${photo.slug}`)).statusCode, 200);
});

test('import : fichiers invalides refusés un par un, sans rien laisser sur le disque', async t => {
  const ctx = await admin(t);
  const before = fs.readdirSync(path.join(ctx.config.storageDir, 'originals')).length;
  const res = await importFiles(ctx, [
    { filename: 'notes.jpg', type: 'image/jpeg', value: 'pas une image' },
    { filename: 'vecteur.svg', type: 'image/svg+xml', value: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' },
    { filename: 'ok.png', type: 'image/png', value: await sharp({ create: { width: 300, height: 200, channels: 3, background: '#000' } }).png().toBuffer() },
  ]);
  const { imported, refused } = res.json();
  assert.equal(imported.length, 1);
  assert.deepEqual(refused.map(r => r.name), ['notes.jpg', 'vecteur.svg']);
  assert.match(refused[1].reason, /format svg non pris en charge/);
  assert.equal(fs.readdirSync(path.join(ctx.config.storageDir, 'originals')).length, before + 1);
  assert.deepEqual(fs.readdirSync(path.join(ctx.config.storageDir, 'tmp')), []);
});

test('import : aucun fichier lu sans jeton CSRF placé avant', async t => {
  const ctx = await admin(t);
  const file = { filename: 'a.png', type: 'image/png', value: await sharp({ create: { width: 50, height: 50, channels: 3, background: '#000' } }).png().toBuffer() };
  assert.equal((await importFiles(ctx, [file], { csrfFirst: false })).statusCode, 403);
  assert.equal((await importFiles(ctx, [file], { csrf: 'faux' })).statusCode, 403);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM photos').pluck().get(), 12);
});

test('import depuis le formulaire : redirection et message affiché une seule fois', async t => {
  const ctx = await admin(t);
  const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#000' } }).png().toBuffer();
  const res = await importFiles(ctx, [{ filename: 'a.png', value: png }, { filename: 'b.txt', value: 'x' }], { accept: 'text/html' });
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/admin/photos?statut=draft');
  const flash = { flash: cookiesOf(res).flash };
  const page = await ctx.as({ url: res.headers.location, cookies: flash });
  assert.match(page.body, /1 photo\(s\) importée\(s\) en brouillon, 1 refusée\(s\)/);
  assert.match(page.body, /b\.txt : ce fichier n’est pas une image lisible/);
  assert.equal(page.cookies.find(c => c.name === 'flash').value, '');
});

test('titre tiré du nom de fichier', () => {
  assert.equal(titleFromFilename('IMG_2041 quai--nord.JPG'), 'IMG 2041 quai nord');
  assert.equal(titleFromFilename('.jpg'), '.jpg');
  assert.equal(titleFromFilename(''), 'Sans titre');
});

// ---------- édition ----------

test('édition d’une photo : validation puis enregistrement', async t => {
  const ctx = await admin(t);
  const p = ctx.db.prepare('SELECT * FROM photos WHERE position = 0').get();
  const base = { title: p.title, slug: p.slug, category_id: p.category_id, author_id: p.author_id, status: 'published' };

  const bad = await ctx.post(`/admin/photos/${p.id}`, { ...base, title: ' ', taken_on: '2024-13', slug: 'deux-minuit' });
  assert.equal(bad.statusCode, 422);
  assert.match(bad.body, /Le titre est obligatoire/);
  assert.match(bad.body, /Date non comprise/);
  assert.match(bad.body, /Déjà utilisé/);
  assert.match(bad.body, /aria-invalid="true"/);

  const xss = await ctx.post(`/admin/photos/${p.id}`, { ...base, slug: 'Pas Valide!' });
  assert.equal(xss.statusCode, 422);

  const ok = await ctx.post(`/admin/photos/${p.id}`, { ...base, title: 'Brume <b>matinale</b>', slug: '', place: 'Loire', taken_on: '2024-03-02', legend: 'Six heures.' });
  assert.equal(ok.statusCode, 303);
  const after = ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(p.id);
  assert.equal(after.slug, 'brume-b-matinale-b');
  assert.equal(after.taken_on, '2024-03-02');
  const pub = await ctx.app.inject(`/photo/${after.slug}`);
  assert.match(pub.body, /Brume &lt;b&gt;matinale&lt;\/b&gt;/);  // échappé côté public
});

test('dépublier retire la photo du site', async t => {
  const ctx = await admin(t);
  const p = ctx.db.prepare('SELECT * FROM photos WHERE position = 0').get();
  const res = await ctx.post(`/admin/photos/${p.id}/status`, { status: 'draft', back: '/admin/photos?statut=published' });
  assert.equal(res.headers.location, '/admin/photos?statut=published');
  assert.equal((await ctx.app.inject(`/photo/${p.slug}`)).statusCode, 404);
  assert.equal((await ctx.post(`/admin/photos/${p.id}/status`, { status: 'published', back: '//evil.example' })).headers.location, '/admin/photos');
});

test('réordonnancement : glisser-déposer (JSON) et boutons', async t => {
  const ctx = await admin(t);
  const ids = ctx.db.prepare('SELECT id FROM photos ORDER BY position').pluck().all();
  const reversed = [...ids].reverse();
  const res = await ctx.as({ method: 'POST', url: '/admin/photos/order', payload: { ids: reversed }, headers: { 'x-csrf-token': ctx.csrf } });
  assert.deepEqual(res.json(), { ok: true });
  assert.deepEqual(ctx.db.prepare('SELECT id FROM photos ORDER BY position').pluck().all(), reversed);

  const partial = await ctx.as({ method: 'POST', url: '/admin/photos/order', payload: { ids: ids.slice(1) }, headers: { 'x-csrf-token': ctx.csrf } });
  assert.equal(partial.statusCode, 422);
  const dup = await ctx.as({ method: 'POST', url: '/admin/photos/order', payload: { ids: [...ids.slice(1), ids[1]] }, headers: { 'x-csrf-token': ctx.csrf } });
  assert.equal(dup.statusCode, 422);

  await ctx.post(`/admin/photos/${reversed[1]}/move`, { dir: 'up' });
  assert.equal(ctx.db.prepare('SELECT id FROM photos ORDER BY position LIMIT 1').pluck().get(), reversed[1]);
  await ctx.post(`/admin/photos/${reversed[1]}/move`, { dir: 'up' });     // déjà en tête : sans effet
  assert.equal(ctx.db.prepare('SELECT id FROM photos ORDER BY position LIMIT 1').pluck().get(), reversed[1]);
});

test('recherche et filtres de la liste', async t => {
  const ctx = await admin(t);
  const count = body => (body.match(/<li id="photo-/g) || []).length;
  assert.equal(count((await ctx.as({ url: '/admin/photos' })).body), 12);
  assert.equal(count((await ctx.as({ url: '/admin/photos?q=lisbonne' })).body), 1);
  assert.equal(count((await ctx.as({ url: '/admin/photos?auteur=julien&serie=rue' })).body), 3);
  assert.equal(count((await ctx.as({ url: '/admin/photos?statut=draft' })).body), 0);
  assert.doesNotMatch((await ctx.as({ url: '/admin/photos?q=x' })).body, /data-sortable/);
});

test('suppression : ligne, fichiers et entrée de l’ouverture', async t => {
  const ctx = await admin(t);
  const p = ctx.db.prepare("SELECT * FROM photos WHERE slug = 'le-ciel-s-est-ouvert'").get();
  const res = await ctx.post(`/admin/photos/${p.id}/delete`);
  assert.equal(res.statusCode, 303);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM photos WHERE id = ?').pluck().get(p.id), 0);
  assert.equal(fs.existsSync(path.join(ctx.config.storageDir, 'originals', p.file)), false);
  const stem = path.parse(p.file).name;
  assert.equal(fs.readdirSync(path.join(ctx.config.storageDir, 'variants')).some(f => f.startsWith(stem)), false);
  const hero = JSON.parse(ctx.db.prepare("SELECT value FROM settings WHERE key = 'hero'").pluck().get());
  assert.equal(hero.includes(p.slug), false);
  assert.equal((await ctx.post(`/admin/photos/${p.id}/delete`)).statusCode, 404);
});

// ---------- séries, auteurs, réglages ----------

test('séries : création, renommage, ordre, suppression bloquée si non vide', async t => {
  const ctx = await admin(t);
  assert.equal((await ctx.post('/admin/series', { name: 'Nuit' })).statusCode, 303);
  const nuit = ctx.db.prepare("SELECT * FROM categories WHERE slug = 'nuit'").get();
  assert.equal(nuit.position, 0);                                  // nouvelle série en tête
  assert.equal((await ctx.post('/admin/series', { name: '  ' })).statusCode, 422);

  const dup = await ctx.post(`/admin/series/${nuit.id}`, { name: 'Nuit', slug: 'rue' });
  assert.equal(dup.statusCode, 422);
  assert.match(dup.body, /Déjà utilisé/);
  await ctx.post(`/admin/series/${nuit.id}`, { name: 'Nocturnes', slug: 'nocturnes' });
  assert.equal(ctx.db.prepare('SELECT slug FROM categories WHERE id = ?').pluck().get(nuit.id), 'nocturnes');
  assert.equal((await ctx.app.inject('/serie/nocturnes')).statusCode, 200);

  await ctx.post(`/admin/series/${nuit.id}/move`, { dir: 'down' });
  assert.equal(ctx.db.prepare('SELECT position FROM categories WHERE id = ?').pluck().get(nuit.id), 1);

  const rue = ctx.db.prepare("SELECT id FROM categories WHERE slug = 'rue'").pluck().get();
  const blocked = await ctx.post(`/admin/series/${rue}/delete`);
  assert.equal(blocked.statusCode, 303);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM categories WHERE id = ?').pluck().get(rue), 1);
  const page = await ctx.as({ url: '/admin/series', cookies: { flash: cookiesOf(blocked).flash } });
  assert.match(page.body, /contient 4 photo\(s\) : choisissez la série où les déplacer/);
  // Suppression en déplaçant les photos : aucune n'est perdue.
  const moved = await ctx.post(`/admin/series/${rue}/delete`, { move_to: nuit.id });
  assert.equal(moved.statusCode, 303);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM categories WHERE id = ?').pluck().get(rue), 0);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM photos WHERE category_id = ?').pluck().get(nuit.id), 4);
  assert.equal((await ctx.post(`/admin/series/${nuit.id}/delete`, { move_to: nuit.id })).statusCode, 303);   // vers elle-même : refusé
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM categories WHERE id = ?').pluck().get(nuit.id), 1);
  ctx.db.prepare('UPDATE photos SET category_id = (SELECT id FROM categories WHERE id != ? LIMIT 1) WHERE category_id = ?').run(nuit.id, nuit.id);

  await ctx.post(`/admin/series/${nuit.id}/delete`);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM categories WHERE id = ?').pluck().get(nuit.id), 0);
});

test('auteurs : ajout, lien avec un compte unique, suppression bloquée', async t => {
  const ctx = await admin(t);
  await ctx.post('/admin/auteurs', { name: 'Camille', bio: 'Invitée.', oidc_sub: 'sub-camille' });
  const camille = ctx.db.prepare("SELECT * FROM authors WHERE slug = 'camille'").get();
  assert.equal(camille.oidc_sub, 'sub-camille');
  const julien = ctx.db.prepare("SELECT * FROM authors WHERE slug = 'julien'").get();
  const dup = await ctx.post(`/admin/auteurs/${julien.id}`, { name: 'Julien', slug: 'julien', oidc_sub: 'sub-camille' });
  assert.equal(dup.statusCode, 422);
  assert.match(dup.body, /déjà lié à un autre auteur/);
  await ctx.post(`/admin/auteurs/${julien.id}`, { name: 'Julien', slug: 'julien', bio: 'Rue et portraits.', oidc_sub: '' });
  assert.equal(ctx.db.prepare('SELECT bio FROM authors WHERE id = ?').pluck().get(julien.id), 'Rue et portraits.');
  await ctx.post(`/admin/auteurs/${julien.id}/delete`);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM authors WHERE id = ?').pluck().get(julien.id), 1);
  await ctx.post(`/admin/auteurs/${camille.id}/delete`);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM authors WHERE id = ?').pluck().get(camille.id), 0);
});

test('réglages : nom du site, textes et ouverture (photos publiées seulement)', async t => {
  const ctx = await admin(t);
  const draft = ctx.db.prepare("SELECT slug FROM photos WHERE slug = 'quai-7h12'").pluck().get();
  ctx.db.prepare("UPDATE photos SET status = 'draft' WHERE slug = ?").run(draft);
  const res = await ctx.post('/admin/reglages', {
    site_name: 'Heures Creuses', tagline: 'Nouvelle accroche', intro: 'Intro', about: 'Un.\n\nDeux.',
    hero: ['deux-minuit', draft, 'inexistante', 'sous-bois'],
  });
  assert.equal(res.statusCode, 303);
  const hero = JSON.parse(ctx.db.prepare("SELECT value FROM settings WHERE key = 'hero'").pluck().get());
  assert.deepEqual(hero, ['deux-minuit', 'sous-bois']);
  const home = (await ctx.app.inject('/')).body;
  assert.match(home, /<title>Heures Creuses<\/title>/);
  assert.match(home, /Heures <i>Creuses<\/i>/);
  assert.match(home, /Nouvelle accroche/);
  assert.match((await ctx.app.inject('/a-propos')).body, /<p>Un\.<\/p>\s*<p>Deux\.<\/p>/);
  // Droits d'utilisation : textes anglais et allemand enregistrés depuis les réglages.
  await ctx.post('/admin/reglages', { site_name: 'Heures Creuses', rights_text_en: 'Ask first.', rights_text_de: 'Erst fragen.' });
  assert.match((await ctx.app.inject('/en/droits')).body, /<p>Ask first\.<\/p>/);
  assert.match((await ctx.app.inject('/de/droits')).body, /<p>Erst fragen\.<\/p>/);
  assert.match((await ctx.as({ url: '/admin/droits' })).body, /name="rights_text_en"[^>]*>Ask first\.<\/textarea>/);
});

test('réglages : textes des droits par défaut affichés, gardés « par défaut » s’ils ne changent pas', async t => {
  const ctx = await admin(t);
  const setting = k => JSON.parse(ctx.db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(k) ?? 'null');
  const page = (await ctx.as({ url: '/admin/droits' })).body;
  // Le texte publié est présenté dans le champ, avec son état et le bouton pour y revenir.
  const fr = /<textarea id="rights_text"[^>]*>([^<]*)<\/textarea>/.exec(page)[1];
  assert.match(fr, /appartiennent à leurs auteurs, Sébastien et Julien\./);
  assert.match(page, /<textarea id="rights_text_en"[^>]*>All photographs published/);
  assert.match(page, /<textarea id="rights_text_de"[^>]*>Alle auf dieser Website/);
  assert.equal((page.match(/>Texte par défaut</g) || []).length, 3);
  assert.equal((page.match(/data-reset-default="rights_text(_en|_de)?"/g) || []).length, 3);

  // Renvoyé tel quel (espaces et retours à la ligne près) : reste vide en base, donc « par défaut ».
  const decode = v => v.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  await ctx.post('/admin/reglages', { rights_text: decode(fr).replace(/\n/g, '\r\n  ') + '\n' });
  assert.equal(setting('rights_text'), '');
  // Modifié : enregistré ; les traductions restées par défaut sont signalées.
  await ctx.post('/admin/reglages', { rights_text: 'Licence sur demande.' });
  assert.equal(setting('rights_text'), 'Licence sur demande.');
  const after = (await ctx.as({ url: '/admin/droits' })).body;
  assert.match(after, />Texte personnalisé</);
  assert.equal((after.match(/Le texte français a été modifié/g) || []).length, 2);
  assert.match((await ctx.app.inject('/droits')).body, /<p>Licence sur demande\.<\/p>/);

  await ctx.post('/admin/reglages', { site_name: '', tagline: 'x' });
  assert.match((await ctx.app.inject('/')).body, /<title>Test<\/title>/);   // vide : retour à SITE_NAME
});
