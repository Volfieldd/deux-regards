import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { isAdmin, listedAdmin } from '../server/oidc.js';
import { withCheckSlot } from '../server/media.js';
import { IMPORT_CONCURRENCY } from '../server/imports.js';

// Non-régression des relectures adverses de la revue du 16 octobre 2026 (diff complet, après fusion des neuf groupes) :
// compteur des codes faux contourné par des espaces (A019), planche de cartes qui réimprimait une référence prise
// (A036), rencontre rattachée à un autre photographe avant sa suppression (A068 et A133), repli OIDC_ALLOWED_SUBS
// gardé en ligne sans OIDC_ORG_ID (A054), décodages de contrôle de l'import bornés (A110).

function multipart(fields) {
  const boundary = '----relecture' + Math.random().toString(16).slice(2);
  const chunks = Object.entries(fields).map(([name, value]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'text/html' } };
}
function as(ctx, sub, roles, authorId = null) {
  ctx.app.accounts.ensure({ sub, name: sub, email: '', roles });
  if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
  const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
  const cookies = { session: token };
  return {
    get: url => ctx.app.inject({ url, cookies, headers: { accept: 'text/html' } }),
    post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
    form: (url, fields) => { const f = multipart({ _csrf: csrf, ...fields }); return ctx.app.inject({ method: 'POST', url, cookies, headers: f.headers, payload: f.payload }); },
  };
}
const authorId = (db, slug) => db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(slug);

test('A019 : des espaces autour de la référence ne contournent pas le compteur des codes faux', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const jul = authorId(db, 'julien');
  const id = app.encounters.saveCard(null, { ref: 'J-0007', signed: 'on', scope_site: 'on', author_id: jul, name: 'Personne', email: 'personne@example.org', met_on: '2026-10-10' });
  const good = app.encounters.codeOf('J-0007');
  const wrong = [...'ABCDEFGHJK'].map(c => `${c}${c}${c}`).filter(c => c !== good);
  const pad = ' '.repeat(35);
  let ip = 10;
  const post = ref => app.inject({ method: 'POST', url: '/bonjour', remoteAddress: `203.0.113.${ip++}`,
    payload: { ref, decision: 'accord', adult: 'oui', scope_site: 'on', scope_instagram: 'on', email: 'attaquant@evil.example', name: 'Attaquant' } });
  const failures = () => db.prepare("SELECT COUNT(*) FROM card_code_failures WHERE ref = 'J-0007'").pluck().get();
  assert.equal((await post(`${pad}J-0007-${wrong[0]}`)).statusCode, 422);
  assert.equal(failures(), 1);                                                         // compté, espaces ou pas
  assert.equal((await post(`J-0007-${wrong[1]}${pad}`)).statusCode, 422);
  for (let i = 2; i < 5; i++) await post(`${pad}J-0007-${wrong[i]}`);
  assert.equal(failures(), 5);
  // Référence bloquée : le bon code, même entouré d'espaces, ne vérifie plus rien ; la rencontre établie ne bouge pas.
  for (const ref of [`${pad}J-0007-${good}`, `J-0007-${good}`, `${pad}J-0007-${wrong[5]}${pad}`]) {
    const r = await post(ref);
    assert.deepEqual([r.statusCode, r.headers.location], [303, '/bonjour/merci?ref=J-0007'], JSON.stringify(ref));
  }
  const e = app.encounters.get(id);
  assert.deepEqual([e.email, e.name, e.consent_source, e.consent.instagram], ['personne@example.org', 'Personne', 'carte', false]);
  assert.equal(app.encounters.events(id).at(-1).detail.non_verifiee, true);
  assert.equal(failures(), 5);                                                         // référence bloquée : plus rien à compter
  // Sur une référence non bloquée, le bon code entouré d'espaces vérifie toujours.
  assert.equal((await post(`${pad}J-0042-${app.encounters.codeOf('J-0042')}${pad}`)).statusCode, 303);
  assert.equal(db.prepare("SELECT verified FROM encounters WHERE ref = 'J-0042'").pluck().get(), 1);
});

test('A036 : une référence tapée sans code près de la série décale la numérotation ; une planche ne réimprime jamais un numéro pris', async t => {
  const ctx = await setup(t, { seeded: true });
  const { app, db } = ctx;
  const enc = app.encounters;
  const hello = (ref, ip) => app.inject({ method: 'POST', url: '/bonjour', remoteAddress: ip, payload: { ref, email: 'tiers@example.org', message: 'Bonjour', wants_photo: 'on', adult: 'oui' } });
  enc.reserve('J', 10);
  assert.equal((await hello('J-0013', '198.51.100.1')).statusCode, 303);
  assert.equal(enc.nextNumber('J'), 14);                                                // pas 11 : J-0013 serait réimprimée
  assert.equal((await hello('J-9999', '198.51.100.2')).statusCode, 303);
  assert.equal(enc.nextNumber('J'), 14);                                                // loin devant : négligée
  const admin = as(ctx, 'admin-1', ['admin']);
  const jul = authorId(db, 'julien');
  const r = await admin.post('/admin/rencontres/cartes', { author_id: jul, mode: 'numerotees', from: 11, count: 10 });
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /Numéros déjà pris dans cette plage \(J-0013\) : commencez à 14\./);
  assert.equal(JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'cards_printed'").pluck().get()).J, 10);   // rien de réservé
  assert.equal((await admin.post('/admin/rencontres/cartes', { author_id: jul, mode: 'numerotees', from: 14, count: 10 })).statusCode, 303);
  // Plus loin, la référence lancée devant (J-9999) est refusée elle aussi dans une plage qui la contient.
  assert.match((await admin.post('/admin/rencontres/cartes', { author_id: jul, mode: 'numerotees', from: 9990, count: 10 })).body, /J-9999/);
});

test('A068, A133 : avant de supprimer un photographe, l’administrateur rattache ses rencontres à un autre en gardant leur référence', async t => {
  const ctx = await setup(t, { seeded: true });
  const { app, db } = ctx;
  const jul = authorId(db, 'julien'), seb = authorId(db, 'sebastien');
  const id = app.encounters.saveCard(null, { ref: 'J-0042', author_id: jul, name: 'Personne', met_on: '2026-10-10' });
  const admin = as(ctx, 'admin-1', ['admin']);
  const r = await admin.form(`/admin/rencontres/${id}`, { ref: 'J-0042', author_id: String(seb), name: 'Personne', met_on: '2026-10-10' });
  assert.equal(r.statusCode, 303);
  assert.deepEqual(db.prepare('SELECT ref, author_id FROM encounters WHERE id = ?').get(id), { ref: 'J-0042', author_id: seb });
  // Une nouvelle référence à la lettre d'un autre reste refusée, même à l'administrateur.
  const other = await admin.form('/admin/rencontres', { ref: 'J-0500', author_id: String(seb) });
  assert.equal(other.statusCode, 422);
  assert.match(other.body, /La lettre de la référence désigne un autre photographe/);
  // Le photographe (portée « les miennes ») ne déplace pas une de ses rencontres vers l'autre.
  const id2 = app.encounters.saveCard(null, { ref: 'J-0043', author_id: jul });
  const mine = as(ctx, 'jul', ['photographe'], jul);
  assert.equal((await mine.form(`/admin/rencontres/${id2}`, { ref: 'J-0043', author_id: String(seb) })).statusCode, 422);
  assert.equal(db.prepare('SELECT author_id FROM encounters WHERE id = ?').pluck().get(id2), jul);
});

test('A054 : en ligne sans OIDC_ORG_ID, la liste OIDC_ALLOWED_SUBS amorce toujours un administrateur', async t => {
  const oidcConf = { adminRole: 'admin', allowedSubs: ['liste-1'] };
  const claims = { sub: 'liste-1', name: 'Liste', email: 'liste@example.org', email_verified: true };
  assert.equal(listedAdmin(claims, oidcConf), true);
  assert.equal(listedAdmin({ ...claims, email_verified: false }, oidcConf), false);
  assert.equal(isAdmin({ sub: 'x' }, ['admin'], oidcConf), true);
  const fake = finish => ({ configured: true, origin: 'https://idp.example',
    start: async () => ({ url: 'https://idp.example/authorize', tx: { state: 's'.repeat(43), nonce: 'n', verifier: 'v' } }), finish });
  const ONLINE = { PUBLIC_URL: 'https://photos.example', COOKIE_SECRET: 'x'.repeat(32), OIDC_PROJECT_ID: '42' };
  const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
  const { app } = await setup(t, { env: ONLINE, oidc: fake(async () => ({ claims, roles: [], admin: isAdmin(claims, [], oidcConf), listed: listedAdmin(claims, oidcConf), idToken: 'x' })) });
  const start = await app.inject('/auth/login');
  assert.equal((await app.inject({ url: `/auth/callback?code=c&state=${'s'.repeat(43)}`, cookies: cookiesOf(start) })).statusCode, 302);
  assert.deepEqual(app.accounts.bySub('liste-1').roles, ['admin']);
});

test('A110 : les décodages de contrôle de l’import passent IMPORT_CONCURRENCY à la fois', async () => {
  let now = 0, max = 0;
  const job = () => withCheckSlot(async () => { now++; max = Math.max(max, now); await new Promise(r => setTimeout(r, 5)); now--; });
  await Promise.all(Array.from({ length: 12 }, job));
  assert.equal(max, IMPORT_CONCURRENCY);
  // Une erreur libère la place.
  await assert.rejects(withCheckSlot(async () => { throw new Error('abîmée'); }));
  await Promise.all(Array.from({ length: 4 }, job));
  assert.equal(now, 0);
});
