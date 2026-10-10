import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { processEmblem } from '../server/brand.js';
import { THEMES } from '../server/themes.js';

const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function admin(t) {
  const c = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await c.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  const cookies = cookiesOf(res);
  const csrf = c.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = o => c.app.inject({ ...o, cookies: { ...cookies, ...o.cookies } });
  const post = (url, payload = {}) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  const upload = (buf, slot = 'embleme') => {
    const b = '----t';
    const payload = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${csrf}\r\n--${b}\r\nContent-Disposition: form-data; name="fichier"; filename="e.png"\r\n\r\n`), buf, Buffer.from(`\r\n--${b}--\r\n`)]);
    return as({ method: 'POST', url: `/admin/apparence/marque/${slot}`, payload, headers: { 'content-type': `multipart/form-data; boundary=${b}`, accept: 'text/html' } });
  };
  return { ...c, cookies, csrf, as, post, upload };
}

// Dessin d'essai : une ellipse au trait, sombre sur clair (ou l'inverse).
const drawing = (ink, bg) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${bg}"/>
  <ellipse cx="400" cy="300" rx="260" ry="150" fill="none" stroke="${ink}" stroke-width="18"/></svg>`)).png().toBuffer();

test('emblème : masque identique quel que soit le sens du contraste, recadré au dessin', async () => {
  const dark = await processEmblem(await drawing('#000', '#fff'));
  const light = await processEmblem(await drawing('#fff', '#000'));
  for (const r of [dark, light]) {
    assert.ok(Math.abs(r.width - 538) <= 4 && Math.abs(r.height - 318) <= 4, `${r.width}×${r.height}`);   // trait compris
    const { channels } = await sharp(r.mask).stats();
    assert.equal(channels[3].min, 0);                       // fond transparent
    assert.ok(channels[3].max > 240);                       // trait opaque
    assert.equal((await sharp(r.favicon64).metadata()).width, 64);
  }
  await assert.rejects(processEmblem(Buffer.from('pas une image')), /pas une image lisible/);
  await assert.rejects(processEmblem(await sharp({ create: { width: 50, height: 50, channels: 3, background: '#fff' } }).png().toBuffer()), /aucun dessin/);
});

test('thème par défaut « Atelier » : aucune feuille ni classe supplémentaire', async t => {
  const { app } = await setup(t, { seeded: true });
  const home = (await app.inject('/')).body;
  assert.match(home, /<html lang="fr">/);
  assert.doesNotMatch(home, /themes\/nicephos\.css/);
  assert.match(home, /<meta name="color-scheme" content="light">/);
});

test('appliquer un thème : classe, feuille versionnée et schéma de couleurs sur tout le site public', async t => {
  const c = await admin(t);
  assert.equal((await c.post('/admin/apparence', { theme: 'nicephos-nuit', brand_mode: 'texte', subtitle: 'Photography\u0000 gallery' })).statusCode, 303);
  for (const url of ['/', '/a-propos', '/droits', '/photo/brume-sur-la-loire', '/nexiste-pas']) {
    const body = (await c.app.inject(url)).body;
    assert.match(body, /<html lang="fr" class="theme-nicephos mode-nuit">/, url);
    assert.match(body, /<link rel="stylesheet" href="\/static\/themes\/nicephos\.css\?v=[0-9a-f]{10}">/, url);
    assert.match(body, /content="dark"/, url);
  }
  assert.equal(JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'brand'").pluck().get()).subtitle, 'Photography gallery');
  assert.equal((await c.app.inject('/static/themes/nicephos.css')).statusCode, 200);
  // Valeur inconnue : ignorée.
  await c.post('/admin/apparence', { theme: '../../etc/passwd' });
  assert.match((await c.app.inject('/')).body, /mode-nuit/);
  // L'admin garde son apparence.
  assert.doesNotMatch((await c.as({ url: '/admin' })).body, /theme-nicephos/);
});

test('aperçu d’un thème : réservé aux admins, mémorisé, quittable', async t => {
  const c = await admin(t);
  assert.doesNotMatch((await c.app.inject('/?theme=nicephos-jour')).body, /theme-nicephos/);   // visiteur : ignoré
  const first = await c.as({ url: '/?theme=nicephos-jour' });
  assert.match(first.body, /class="theme-nicephos mode-jour"/);
  assert.match(first.body, /Aperçu du thème « Nicephos — jour »/);
  const preview = cookiesOf(first).apercu_theme;
  assert.equal(preview, 'nicephos-jour');
  const next = await c.as({ url: '/a-propos', cookies: { apercu_theme: preview } });
  assert.match(next.body, /mode-jour/);                                                      // suit la navigation
  const off = await c.as({ url: '/?theme=off', cookies: { apercu_theme: preview } });
  assert.doesNotMatch(off.body, /theme-nicephos/);
  assert.equal(off.cookies.find(x => x.name === 'apercu_theme').value, '');
});

test('emblème : envoi, en-tête avec nom et sous-titre, feuille de masque, favicon, retrait', async t => {
  const c = await admin(t);
  const res = await c.upload(await drawing('#111', '#f4f4f4'));
  assert.equal(res.statusCode, 303);
  const brand = JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'brand'").pluck().get());
  assert.equal(brand.mode, 'embleme');
  assert.match(brand.emblem, /^embleme-[0-9a-f]{8}\.png$/);
  const dir = path.join(c.config.storageDir, 'brand');
  assert.deepEqual(fs.readdirSync(dir).sort(), [brand.emblem, `${brand.emblem}.source`, brand.favicon180, brand.favicon64].sort());

  await c.post('/admin/apparence', { theme: 'nicephos-nuit', brand_mode: 'embleme', subtitle: 'Photography gallery' });
  const home = (await c.app.inject('/')).body;
  assert.match(home, /<a class="brand brand-emblem" href="\/"><span class="emblem" aria-hidden="true"><\/span><span class="wordmark"><span class="name">Test<\/span><span class="subtitle">Photography gallery<\/span>/);
  assert.match(home, new RegExp(`<link rel="stylesheet" href="/brand\\.css\\?v=${brand.emblem}">`));
  assert.match(home, new RegExp(`<link rel="icon" type="image/png" href="/brand/${brand.favicon64}">`));
  const css = await c.app.inject('/brand.css');
  assert.match(css.body, new RegExp(`mask-image:url\\(/brand/${brand.emblem}\\)`));
  assert.equal((await c.app.inject(`/brand/${brand.emblem}`)).headers['content-type'], 'image/png');
  assert.equal((await c.app.inject('/brand/autre.png')).statusCode, 404);
  assert.equal((await c.app.inject('/brand/..%2Fsite.db')).statusCode, 404);
  assert.equal((await c.app.inject('/favicon.ico')).headers.location, `/brand/${brand.favicon64}`);

  // Remplacement : l'ancien emblème est effacé.
  await c.upload(await drawing('#eee', '#101010'));
  const replaced = JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'brand'").pluck().get());
  assert.notEqual(replaced.emblem, brand.emblem);
  assert.equal(fs.existsSync(path.join(dir, brand.emblem)), false);

  await c.post('/admin/apparence/marque/embleme/delete');
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.match((await c.app.inject('/')).body, /<a class="brand" href="\/">/);
  assert.equal((await c.app.inject('/favicon.ico')).statusCode, 204);
});

test('emblème invalide refusé avec un message ; jeton CSRF exigé', async t => {
  const c = await admin(t);
  const res = await c.upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'));
  const page = await c.as({ url: res.headers.location, cookies: { flash: cookiesOf(res).flash } });
  assert.match(page.body, /Emblème \(dessin\) refusé/);
  assert.equal((await c.post('/admin/apparence', { _csrf: 'faux', theme: 'nicephos-nuit' })).statusCode, 403);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM settings WHERE key = 'theme'").pluck().get(), 0);
});

test('chaque thème déclaré a sa feuille et un libellé', () => {
  for (const [id, t] of Object.entries(THEMES)) {
    assert.ok(t.label && t.description, id);
    if (t.stylesheet) assert.ok(fs.existsSync(path.join('public', t.stylesheet)), `${id} : ${t.stylesheet}`);
  }
});

test('icône, logo complet, image de partage : chacun à sa place', async t => {
  const c = await admin(t);
  const brand = () => JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'brand'").pluck().get());
  await c.upload(await drawing('#111', '#f4f4f4'), 'embleme');
  // Icône carrée et opaque (blanc sur noir) : reprise telle quelle pour l'onglet.
  const icon = await sharp(await drawing('#fff', '#000')).resize(512, 512, { fit: 'contain', background: '#000' }).flatten({ background: '#000' }).png().toBuffer();
  assert.equal((await c.upload(icon, 'icone')).statusCode, 303);
  const withIcon = brand();
  const fav = await sharp(path.join(c.config.storageDir, 'brand', withIcon.favicon64)).stats();
  assert.ok(fav.isOpaque);
  assert.equal(fav.channels[0].min, 0);                                          // fond noir d'origine conservé

  await c.upload(await drawing('#111', '#fff'), 'logotype');
  await c.upload(await drawing('#222', '#ddd'), 'partage');
  const b = brand();
  assert.match(b.share, /^partage-[0-9a-f]{8}\.jpg$/);

  const home = (await c.app.inject('/')).body;
  assert.match(home, /<span class="emblem has-compact" aria-hidden="true"><\/span><span class="emblem-compact" aria-hidden="true"><\/span>/);
  const css = (await c.app.inject('/brand.css')).body;
  assert.match(css, new RegExp(`\\.emblem-compact\\{[^}]*${b.icon}`));
  assert.match(css, new RegExp(`\\.logotype\\{[^}]*${b.logotype}`));
  const about = (await c.app.inject('/a-propos')).body;
  assert.match(about, /<div class="logotype" role="img" aria-label="Test"><\/div>/);
  assert.match(about, new RegExp(`<meta property="og:image" content="http://localhost:3000/brand/${b.share}">`));   // page sans photo
  assert.doesNotMatch((await c.app.inject('/photo/brume-sur-la-loire')).body, /og:image" content="[^"]*brand/);   // la photo d'abord
  assert.equal((await c.app.inject(`/brand/${b.emblem}.source`)).statusCode, 404);                                // originaux jamais servis

  // Sans icône : les icônes d'onglet reviennent de l'emblème.
  await c.post('/admin/apparence/marque/icone/delete');
  const after = brand();
  assert.equal(after.icon, null);
  assert.ok(after.favicon64 && after.favicon64 !== withIcon.favicon64);
  assert.equal(after.mode, 'embleme');
  assert.doesNotMatch((await c.app.inject('/')).body, /emblem-compact/);
  assert.equal(fs.existsSync(path.join(c.config.storageDir, 'brand', withIcon.icon)), false);
  assert.equal((await c.post('/admin/apparence/marque/inconnu/delete')).statusCode, 404);
});
