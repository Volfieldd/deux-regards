import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { setup } from './helpers.js';

// Cartes de rencontre à imprimer (paires numérotées avec QR et code de contrôle, ou génériques) et photo offerte
// (lien privé de 30 jours vers une version JPEG, dans la langue de la personne).
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function ctxOf(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = opts => ctx.app.inject({ ...opts, cookies: { ...cookies, ...opts.cookies } });
  const post = (url, payload = {}) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  const author = slug => ctx.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(slug);
  return { ...ctx, as, post, author };
}

test('planches de cartes : paires numérotées (QR, code de contrôle), numéros retenus, génériques ; réservé aux admins', async t => {
  const c = await ctxOf(t);
  const form = (await c.as({ url: '/admin/rencontres/cartes' })).body;
  assert.match(form, /Julien \(lettre J, prochaine carte J-0001\)/);
  let r = await c.post('/admin/rencontres/cartes', { author_id: c.author('julien'), mode: 'numerotees', from: 1, count: 7 });
  assert.deepEqual([r.statusCode, r.headers.location], [303, `/admin/rencontres/cartes/planche?auteur=${c.author('julien')}&nombre=7&de=1`]);
  const sheet = await c.as({ url: r.headers.location });
  assert.equal(sheet.statusCode, 200);
  assert.equal((sheet.body.match(/<section class="sheet">/g) || []).length, 2);              // 7 paires : 2 feuilles
  assert.equal((sheet.body.match(/<div class="pair">/g) || []).length, 7);
  assert.equal((sheet.body.match(/<svg /g) || []).length, 7);                               // un QR par carte « pour eux »
  assert.match(sheet.body, /que Julien a prises de moi aujourd’hui/);
  const labels = [...sheet.body.matchAll(/Réf\. <b>(J-\d{4}-[A-Z0-9]{3})<\/b>/g)].map(m => m[1]);
  assert.equal(labels.length, 7);
  assert.equal(labels[6].slice(0, 6), 'J-0007');
  for (const l of labels) assert.equal(c.app.encounters.card(l).verified, true);            // le code imprimé est accepté
  assert.doesNotMatch(sheet.body, /style="/);                                               // CSP
  // La série continue : prochaine planche à J-0008.
  assert.match((await c.as({ url: '/admin/rencontres/cartes' })).body, /prochaine carte J-0008/);
  // Génériques : sans numéro, QR vers /bonjour.
  r = await c.post('/admin/rencontres/cartes', { author_id: c.author('sebastien'), mode: 'generiques', count: 5 });
  const generic = (await c.as({ url: r.headers.location })).body;
  assert.equal((generic.match(/class="blank"/g) || []).length, 10);
  assert.match(generic, /que Sébastien a prises/);
  assert.match((await c.as({ url: '/admin/rencontres/cartes' })).body, /prochaine carte S-0001/);   // génériques : rien de réservé
  assert.equal((await c.post('/admin/rencontres/cartes', { author_id: c.author('julien'), mode: 'numerotees', from: 1, count: 0 })).statusCode, 422);
  assert.notEqual((await c.app.inject(`/admin/rencontres/cartes/planche?auteur=${c.author('julien')}&nombre=5&de=1`)).statusCode, 200);
});

test('photo offerte : lien privé dans la langue de la personne, JPEG jamais l’original, compteurs, expiration, retrait', async t => {
  const c = await ctxOf(t);
  await c.app.inject({ method: 'POST', url: '/de/bonjour', payload: { ref: 'J-0142', wants_photo: 'on', adult: 'oui', email: 'anna@beispiel.de', name: 'Anna' } });
  const id = c.db.prepare("SELECT id FROM encounters WHERE ref = 'J-0142'").pluck().get();
  const photo = c.db.prepare("SELECT * FROM photos WHERE slug = 'brume-sur-la-loire'").get();
  // Photo non liée : refusée.
  let r = await c.post(`/admin/rencontres/${id}/liens`, { photo_id: photo.id });
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounter_shares').pluck().get(), 0);
  await c.post(`/admin/rencontres/${id}/photos`, { photo: String(photo.id) });
  r = await c.post(`/admin/rencontres/${id}/liens`, { photo_id: photo.id });
  assert.equal(r.statusCode, 303);
  const token = c.db.prepare('SELECT token FROM encounter_shares').pluck().get();
  assert.match(token, /^[\w-]{32}$/);
  const detail = (await c.as({ url: `/admin/rencontres/${id}` })).body;
  assert.match(detail, new RegExp(`value="http://localhost:3000/pour-vous/${token}"`));
  assert.match(detail, /mailto:anna@beispiel\.de\?subject=Ihr%20Foto/);                     // message en allemand
  assert.match(detail, /Hier%20ist%20Ihr%20Foto/);
  // La page, en allemand, sans indexation.
  const page = await c.app.inject(`/pour-vous/${token}`);
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers['x-robots-tag'], 'noindex');
  assert.match(page.body, /<html lang="de"/);
  assert.match(page.body, /<h1>Ihr Foto<\/h1>/);
  assert.match(page.body, /Foto herunterladen/);
  const preview = await c.app.inject(`/pour-vous/${token}/apercu.jpg`);
  const pm = await sharp(preview.rawPayload).metadata();
  assert.equal(pm.format, 'jpeg');
  assert.ok(Math.max(pm.width, pm.height) <= 1200);
  const dl = await c.app.inject(`/pour-vous/${token}/photo.jpg`);
  assert.match(dl.headers['content-disposition'], /attachment; filename="test-J-0142\.jpg"/);
  const dm = await sharp(dl.rawPayload).metadata();
  assert.ok(Math.max(dm.width, dm.height) <= 2048);
  assert.match(dm.exif.toString('latin1'), /usage personnel/);
  const s = c.db.prepare('SELECT views, downloads FROM encounter_shares').get();
  assert.deepEqual([s.views, s.downloads], [1, 1]);
  assert.match((await c.app.inject('/robots.txt')).body, /Disallow: \/pour-vous\//);
  assert.equal((await c.app.inject('/pour-vous/court')).statusCode, 404);
  // Expiré : page « lien expiré » (410), plus d'image.
  c.db.prepare('UPDATE encounter_shares SET expires_at = ?').run(Date.now() - 1000);
  const expired = await c.app.inject(`/pour-vous/${token}`);
  assert.equal(expired.statusCode, 410);
  assert.match(expired.body, /Dieser Link ist abgelaufen/);
  assert.equal((await c.app.inject(`/pour-vous/${token}/photo.jpg`)).statusCode, 404);
  // Retiré : introuvable.
  c.db.prepare('UPDATE encounter_shares SET expires_at = ?').run(Date.now() + 864e5);
  assert.equal((await c.post(`/admin/rencontres/${id}/liens/${token}/retirer`)).statusCode, 303);
  assert.equal((await c.app.inject(`/pour-vous/${token}`)).statusCode, 404);
});

test('QR générique d’un photographe : /bonjour/J, demande attribuée sans carte ; fichiers SVG et PNG pour les vêtements', async t => {
  const c = await ctxOf(t);
  const page = (await c.app.inject('/bonjour/J')).body;
  assert.match(page, /Vous avez croisé Julien et il vous a peut-être pris en photo/);
  assert.match(page, /<input type="hidden" name="photographer" value="J">/);
  assert.match((await c.app.inject('/en/bonjour/s')).body, /You met Sébastien/);
  const r = await c.app.inject({ method: 'POST', url: '/bonjour', payload: { photographer: 'J', met_on: '2026-10-14', place: 'Angers', wants_photo: 'on', adult: 'oui', email: 'eve@exemple.fr' } });
  assert.equal(r.headers.location, '/bonjour/merci');
  const e = c.db.prepare('SELECT ref, author_id FROM encounters').get();
  assert.deepEqual([e.ref, e.author_id], [null, c.author('julien')]);
  // Sans date ni lieu, la lettre ne suffit pas : il faut retrouver la photo.
  assert.equal((await c.app.inject({ method: 'POST', url: '/bonjour', payload: { photographer: 'J', wants_photo: 'on', adult: 'oui', email: 'eve@exemple.fr' } })).statusCode, 422);
  // Fichiers à imprimer, depuis la fiche de l'auteur.
  const authors = (await c.as({ url: '/admin/terrain' })).body;
  assert.match(authors, new RegExp(`/admin/auteurs/${c.author('julien')}/qr/vertical-blanc\\.svg`));
  const svg = await c.as({ url: `/admin/auteurs/${c.author('julien')}/qr/vertical-noir.svg` });
  assert.equal(svg.headers['content-type'], 'image/svg+xml');
  assert.match(svg.headers['content-disposition'], /attachment; filename="test-julien-vertical-noir\.svg"/);
  assert.match(svg.body, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="120mm" height="198mm"/);
  assert.match((await c.as({ url: `/admin/auteurs/${c.author('julien')}/qr/logo-blanc.svg` })).body, /width="100mm" height="50mm"/);   // sans logo envoyé : le nom du site
  assert.doesNotMatch(svg.body, /<text|font-family/);                                       // texte converti en tracés
  assert.match(svg.body, /<title>Test · Julien · localhost:3000\/bonjour\/J<\/title>/);
  // Avec le logo d'Apparence : intégré à la couleur de l'encre.
  const fs = await import('node:fs');
  const path = await import('node:path');
  fs.mkdirSync(path.join(c.config.storageDir, 'brand'), { recursive: true });
  await sharp({ create: { width: 400, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toFile(path.join(c.config.storageDir, 'brand', 'logotype-test.png'));
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('brand', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ logotype: 'logotype-test.png' }));
  const withLogo = (await c.as({ url: `/admin/auteurs/${c.author('julien')}/qr/vertical-blanc.svg` })).body;
  assert.match(withLogo, /<image x="13" y="6" width="94" height="47" href="data:image\/png;base64,/);
  const png = await c.as({ url: `/admin/auteurs/${c.author('julien')}/qr/qr-blanc.png` });
  const meta = await sharp(png.rawPayload).metadata();
  assert.deepEqual([meta.format, meta.hasAlpha, meta.width > 1800], ['png', true, true]);   // 80 mm à 600 dpi
  assert.equal((await c.as({ url: `/admin/auteurs/${c.author('julien')}/qr/autre-noir.svg` })).statusCode, 404);
  assert.notEqual((await c.app.inject(`/admin/auteurs/${c.author('julien')}/qr/qr-noir.svg`)).statusCode, 200);
});
