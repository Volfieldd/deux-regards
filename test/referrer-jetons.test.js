import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

// Pages dont l'adresse porte un jeton ou un code (registre docs/etudes/vigie-besoins-des-briques.md, BV-7) :
// « Referrer-Policy: no-referrer », que le crochet commun des en-têtes ne réécrit plus ; aucune autre protection
// n'est affaiblie (CSP, nosniff, X-Frame-Options, Permissions-Policy). Les autres pages gardent
// « strict-origin-when-cross-origin ».
const SLUG = 'brume-sur-la-loire';
const TOKEN = 'offerteOffertE0123456789abcdefgh';
const MEDIA = 'm'.repeat(32);

async function world(t) {
  const c = await setup(t, { seeded: true });
  await c.app.ready();                                  // purges du démarrage passées (rencontre sans nouvelle)
  const photo = c.db.prepare('SELECT id FROM photos WHERE slug = ?').pluck().get(SLUG);
  const enc = c.db.prepare("INSERT INTO encounters (ref, author_id, lang, created_at, updated_at) VALUES ('J-0901', 1, 'fr', 1, 1)").run().lastInsertRowid;
  c.db.prepare('INSERT INTO encounter_shares (token, encounter_id, photo_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(TOKEN, enc, photo, Date.now(), Date.now() + 864e5);
  // Image d'une publication Instagram pendant son envoi.
  const post = c.app.instagram.enqueue(photo);
  c.db.prepare("UPDATE instagram_posts SET status = 'publishing', media_token = ?, media_token_at = ? WHERE id = ?").run(MEDIA, Date.now(), post);
  return c;
}
const imposed = (r, url) => {
  assert.match(r.headers['content-security-policy'] || '', /default-src 'self'/, url);
  assert.equal(r.headers['x-content-type-options'], 'nosniff', url);
  assert.equal(r.headers['x-frame-options'], 'DENY', url);
  assert.equal(r.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()', url);
};

for (const [name, url, status] of [
  ['photo offerte', `/pour-vous/${TOKEN}`, 200],
  ['photo offerte, aperçu', `/pour-vous/${TOKEN}/apercu.jpg`, 200],
  ['photo offerte, téléchargement', `/pour-vous/${TOKEN}/photo.jpg`, 200],
  ['photo offerte, jeton inconnu', '/pour-vous/abcdefghijklmnopqrstuvwxyz012345', 404],
  ['image Instagram', `/partage/instagram/${MEDIA}.jpg`, 200],
  ['carte avec son code', '/bonjour/J-0042-K7Q', 200],
  ['carte avec son code, allemand', '/de/bonjour/J-0042-K7Q', 200],
  ['retour de connexion (code OAuth)', '/auth/callback?code=abc&state=def', 400],
]) {
  test(`${name} : Referrer-Policy no-referrer, autres en-têtes imposés`, async t => {
    const c = await world(t);
    const r = await c.app.inject({ url, headers: { accept: 'text/html' } });
    assert.equal(r.statusCode, status, url);
    assert.equal(r.headers['referrer-policy'], 'no-referrer', url);
    imposed(r, url);
  });
}

test('photo offerte expirée (410) : toujours no-referrer', async t => {
  const c = await world(t);
  c.db.prepare('UPDATE encounter_shares SET expires_at = 1').run();
  const r = await c.app.inject(`/pour-vous/${TOKEN}`);
  assert.deepEqual([r.statusCode, r.headers['referrer-policy']], [410, 'no-referrer']);
});

test('pages ordinaires : strict-origin-when-cross-origin, y compris /bonjour sans code', async t => {
  const c = await world(t);
  const css = (await c.app.inject('/')).body.match(/href="(\/static\/[^"]+\.css[^"]*)"/)[1];
  for (const url of ['/', '/en', `/photo/${SLUG}`, `/photo/${SLUG}/partager`, '/bonjour', '/bonjour/J', '/bonjour/J-0042', '/bonjour/merci?ref=J-0042',
    '/droits', '/page-inexistante', css]) {
    const r = await c.app.inject(url);
    assert.ok(r.statusCode < 500, url);
    assert.equal(r.headers['referrer-policy'], 'strict-origin-when-cross-origin', url);
    imposed(r, url);
  }
});
