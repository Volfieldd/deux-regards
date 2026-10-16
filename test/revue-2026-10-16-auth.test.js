import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { startProvider } from './oidc-provider.js';
import { createSessionStore } from '../server/sessions.js';
import { grantsOf, SCOPES } from '../server/permissions.js';
import { loadConfig } from '../server/config.js';
import { redactUrl } from '../server/app.js';
import { assertDatabaseInStorage } from '../server/storage-guard.js';
import { createReadiness } from '../server/readiness.js';

// Non-régression de la revue de code et de sécurité du 16 octobre 2026, sous-système « auth » : comptes (suppression,
// ADMIN_SUBS, dernière connexion, e-mail non vérifié, connexion de test), connexion OIDC (cookies de transaction,
// OIDC_ORG_ID), pages d'erreur dans la langue de l'admin et sortie d'une session sans rôle, droits (signalements,
// séries, réglages du circuit), journal des lectures sensibles, journaux masqués, photo absente, cache de l'admin,
// configuration (PUBLIC_URL, TRUST_PROXY, DATABASE_PATH) et publication groupée.

const ADMIN = { 'urn:zitadel:iam:org:project:roles': { admin: { 123: 'site.zitadel.cloud' } } };
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function withProvider(t, env = {}, opts = {}) {
  const provider = await startProvider(t);
  const ctx = await setup(t, { ...opts, env: { OIDC_ISSUER: provider.issuer, OIDC_CLIENT_ID: 'site', OIDC_CLIENT_SECRET: 'secret', OIDC_PROJECT_ID: '42', ...env } });
  return { ...ctx, provider };
}
// Parcourt le flux complet : /auth/login → IdP → /auth/callback.
async function login(app, provider) {
  const start = await app.inject('/auth/login');
  const { code, state } = provider.authorize(start.headers.location);
  const res = await app.inject({ url: `/auth/callback?code=${code}&state=${state}`, cookies: cookiesOf(start) });
  return { res, cookies: cookiesOf(res) };
}
// Session d'un compte de n'importe quel rôle, avec son jeton CSRF (comme test/revue-securite.test.js).
function as(ctx, sub, roles, { authorId = null, cookieName = 'session', lang } = {}) {
  ctx.app.accounts.ensure({ sub, name: sub, roles });
  if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
  const token = createSessionStore(ctx.db).create({ sub, name: sub });
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
  const cookies = { [cookieName]: token, ...(lang ? { admin_langue: lang } : {}) };
  return {
    token, csrf, cookies,
    get: (url, headers = {}) => ctx.app.inject({ url, cookies, headers: { accept: 'text/html', ...headers } }),
    post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
    json: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload }),
  };
}
const actions = db => db.prepare('SELECT action FROM audit_log ORDER BY id').pluck().all();

test('A001 : un compte supprimé qui se reconnecte avec le rôle « admin » de l’IdP revient en attente, sans rôle', async t => {
  const { app, provider, db } = await withProvider(t);
  provider.user = { sub: 'boss', name: 'Boss', ...ADMIN };
  const boss = await login(app, provider);
  provider.user = { sub: 'evil', name: 'Evil', ...ADMIN };
  assert.equal((await login(app, provider)).res.statusCode, 302);
  assert.deepEqual(app.accounts.bySub('evil').roles, ['admin']);
  const csrf = db.prepare("SELECT csrf FROM sessions WHERE sub = 'boss'").pluck().get();
  const del = await app.inject({ method: 'POST', url: `/admin/comptes/${app.accounts.bySub('evil').id}/supprimer`, cookies: boss.cookies, payload: { _csrf: csrf } });
  assert.equal(del.statusCode, 303);
  assert.equal(app.accounts.bySub('evil'), undefined);
  // Il revient, avec toujours le rôle de projet « admin » : en attente, aucune session, décision gardée.
  const back = await login(app, provider);
  assert.equal(back.res.statusCode, 403);
  assert.match(back.res.body, /Compte en attente/);
  assert.equal(back.cookies.session, undefined);
  const evil = app.accounts.bySub('evil');
  assert.deepEqual([evil.status, evil.roles], ['en_attente', []]);
  assert.ok(evil.decided_at);
  assert.equal((await login(app, provider)).res.statusCode, 403);                          // l'IdP ne le promeut pas ensuite
  assert.equal(db.prepare("SELECT COUNT(*) FROM accounts_removed WHERE sub = 'evil'").pluck().get(), 0);
  // Un administrateur peut lui redonner un rôle, à la main.
  app.accounts.update(evil.id, { roles: ['relecteur'] }, 'boss');
  assert.equal((await login(app, provider)).res.statusCode, 302);
});

test('A001 : même chose pour une identité de OIDC_ALLOWED_SUBS (repli sans Zitadel)', async t => {
  const { app, provider } = await withProvider(t, { OIDC_PROJECT_ID: '', OIDC_ALLOWED_SUBS: 'g-1,g-2' });
  provider.user = { sub: 'g-1', email: 'g1@example.org', email_verified: true };
  assert.equal((await login(app, provider)).res.statusCode, 302);
  provider.user = { sub: 'g-2', email: 'g2@example.org', email_verified: true };
  assert.equal((await login(app, provider)).res.statusCode, 302);
  app.accounts.remove(app.accounts.bySub('g-2').id, 'g-1');
  assert.equal((await login(app, provider)).res.statusCode, 403);
  assert.deepEqual(app.accounts.bySub('g-2').roles, []);
});

test('A055 : une identité ajoutée à ADMIN_SUBS après une désactivation reprend la main, et la base suit', async t => {
  const { app, provider, db } = await withProvider(t, { ADMIN_SUBS: 'b2,c3' });
  // État d'avant l'ajout à ADMIN_SUBS : désactivé (b2), ou rôles retirés par décision (c3).
  const now = Date.now();
  db.prepare("INSERT INTO accounts (sub, name, roles, status, created_at, decided_at) VALUES ('b2', 'B', '[\"admin\"]', 'desactive', ?, ?)").run(now, now);
  db.prepare("INSERT INTO accounts (sub, name, roles, status, created_at, decided_at) VALUES ('c3', 'C', '[\"relecteur\"]', 'en_attente', ?, ?)").run(now, now);
  provider.user = { sub: 'b2', name: 'B' };
  const b = await login(app, provider);
  assert.equal(b.res.statusCode, 302);
  assert.deepEqual([app.accounts.bySub('b2').status, app.accounts.bySub('b2').roles], ['actif', ['admin']]);
  assert.equal((await app.inject({ url: '/admin/comptes', cookies: b.cookies })).statusCode, 200);
  provider.user = { sub: 'c3', name: 'C' };
  assert.equal((await login(app, provider)).res.statusCode, 302);
  assert.deepEqual([app.accounts.bySub('c3').status, app.accounts.bySub('c3').roles], ['actif', ['relecteur', 'admin']]);
  assert.deepEqual(actions(db).filter(a => a.includes('ADMIN_SUBS')), ['compte rétabli par ADMIN_SUBS', 'compte rétabli par ADMIN_SUBS']);
  // Hors ADMIN_SUBS, le rôle « admin » de l'IdP ne contredit toujours pas une désactivation.
  db.prepare("INSERT INTO accounts (sub, name, roles, status, created_at) VALUES ('d4', 'D', '[\"admin\"]', 'desactive', ?)").run(now);
  provider.user = { sub: 'd4', name: 'D', ...ADMIN };
  assert.equal((await login(app, provider)).res.statusCode, 403);
  assert.equal(app.accounts.bySub('d4').status, 'desactive');
});

test('A058 : une connexion refusée (compte désactivé) ne change pas « dernière connexion »', async t => {
  const { app, provider } = await withProvider(t);
  app.accounts.ensure({ sub: 'x', name: 'X', roles: ['moderateur'] });
  provider.user = { sub: 'x', name: 'X' };
  assert.equal((await login(app, provider)).res.statusCode, 302);
  const seen = app.accounts.bySub('x').last_login_at;
  assert.ok(seen);
  app.accounts.ensure({ sub: 'y', name: 'Y', roles: ['admin'] });
  app.accounts.update(app.accounts.bySub('x').id, { status: 'desactive' }, 'y');
  const refused = await login(app, provider);
  assert.equal(refused.res.statusCode, 403);
  assert.equal(app.accounts.bySub('x').last_login_at, seen);
});

test('A005 : l’adresse non vérifiée par l’IdP n’est pas retenue ; un compte en attente montre sa date et son sub', async t => {
  const { app, provider, db } = await withProvider(t);
  provider.user = { sub: 'intrus-1', name: 'Julien Dupont', email: 'julien@vrai.example', email_verified: false };
  const first = await login(app, provider);
  assert.equal(first.res.statusCode, 403);
  assert.match(first.res.body, /<code>intrus-1<\/code>/);                                 // à donner à l'administrateur
  assert.equal(app.accounts.bySub('intrus-1').email, '');
  // Les reconnexions d'un compte en attente ne remplissent pas le journal (au plus une ligne par jour).
  for (let i = 0; i < 3; i++) await login(app, provider);
  assert.equal(actions(db).filter(a => a === 'connexion en attente d’un rôle').length, 1);
  // Vérifiée (booléen ou chaîne « true ») : gardée.
  provider.user = { ...provider.user, email_verified: 'true' };
  await login(app, provider);
  assert.equal(app.accounts.bySub('intrus-1').email, 'julien@vrai.example');
  // Page « Comptes et rôles » : date de création et consigne de vérification.
  const admin = as({ app, db }, 'admin-1', ['admin']);
  const page = (await admin.get('/admin/comptes')).body;
  assert.match(page, /Compte créé le/);
  assert.match(page, /vérifiez cet identifiant avec la personne/);
});

test('A056 : la connexion de test ne réécrit plus les rôles, et n’ouvre pas de session pour un compte désactivé', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const local = payload => ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, next: '/admin', ...payload } });
  assert.equal((await local({ author: 'julien' })).statusCode, 303);
  assert.deepEqual(ctx.app.accounts.bySub('local:julien').roles, ['admin']);
  assert.equal((await local({ author: 'julien', role: 'relecteur' })).statusCode, 303);
  assert.deepEqual(ctx.app.accounts.bySub('local:julien').roles, ['admin']);                 // le dernier administrateur reste
  // Compte réel lié au photographe, désactivé : pas de session, et il reste désactivé.
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  ctx.app.accounts.ensure({ sub: 'zitadel-seb', name: 'Seb', roles: ['photographe'] });
  ctx.app.accounts.update(ctx.app.accounts.bySub('zitadel-seb').id, { authorId: seb, status: 'desactive' }, 'local:julien');
  const r = await local({ author: 'sebastien', role: 'admin' });
  assert.equal(r.statusCode, 403);
  assert.equal(cookiesOf(r).session, undefined);
  assert.deepEqual([ctx.app.accounts.bySub('zitadel-seb').status, ctx.app.accounts.bySub('zitadel-seb').roles], ['desactive', ['photographe']]);
});

test('A008 : pages 403 et CSRF dans la langue de l’admin, liens compris ; une session sans rôle a une sortie', async t => {
  const ctx = await setup(t, { seeded: true });
  const r = as(ctx, 'relecteur-en', ['relecteur'], { lang: 'en' });
  const denied = await r.get('/admin/comptes');
  assert.equal(denied.statusCode, 403);
  assert.match(denied.body, /<html lang="en"/);
  assert.match(denied.body, /<h1>Access denied<\/h1>/);
  assert.match(denied.body, /href="\/admin">Back to the admin</);
  assert.match(denied.body, />Back to the site</);
  // Jeton CSRF faux : page et JSON traduits.
  const page = await ctx.app.inject({ method: 'POST', url: '/admin/langue', cookies: r.cookies, headers: { accept: 'text/html' }, payload: { _csrf: 'faux', lang: 'en' } });
  assert.equal(page.statusCode, 403);
  assert.match(page.body, /<html lang="en"[\s\S]*Form expired/);
  const json = await ctx.app.inject({ method: 'POST', url: '/admin/langue', cookies: r.cookies, headers: { accept: 'application/json', 'x-csrf-token': 'faux' }, payload: { lang: 'en' } });
  assert.deepEqual(json.json(), { error: 'Invalid CSRF token.' });
  // Session d'un compte en attente : son identifiant, « Utiliser un autre compte » et « Se déconnecter ».
  ctx.app.accounts.login({ sub: 'attente-1', name: 'A' });
  const p = as(ctx, 'attente-1', []);
  const pending = await p.get('/admin');
  assert.equal(pending.statusCode, 403);
  assert.match(pending.body, /<code>attente-1<\/code>/);
  assert.match(pending.body, /href="\/auth\/login\?prompt=select_account"/);
  assert.match(pending.body, new RegExp(`action="/auth/logout"><input type="hidden" name="_csrf" value="${p.csrf}">`));
  // /auth/login n'y renvoie plus en boucle : la session sans rôle est oubliée.
  const again = await ctx.app.inject({ url: '/auth/login?prompt=select_account', cookies: p.cookies });
  assert.notEqual(again.headers.location, '/admin');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) FROM sessions WHERE sub = 'attente-1'").pluck().get(), 0);
  // Une session qui a un rôle n'est jamais fermée par un simple GET.
  assert.equal((await ctx.app.inject({ url: '/auth/login', cookies: r.cookies })).headers.location, '/admin');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) FROM sessions WHERE sub = 'relecteur-en'").pluck().get(), 1);
});

test('A052 : les connexions en cours sont bornées, la page demandée trop longue n’est pas gardée', async t => {
  const { app } = await withProvider(t);
  let jar = {};
  for (let i = 0; i < 12; i++) {
    const res = await app.inject({ url: `/auth/login?next=/${'a'.repeat(3700)}`, cookies: jar });
    assert.equal(res.statusCode, 302);
    for (const c of res.cookies) { if (c.value) jar[c.name] = c.value; else delete jar[c.name]; }
  }
  const tx = Object.keys(jar).filter(n => n.startsWith('oidc-'));
  assert.ok(tx.length <= 4, `${tx.length} cookies de transaction`);
  const header = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  assert.ok(header.length < 6000, `en-tête Cookie de ${header.length} octets`);
});

// Faux client OIDC (le site « en ligne » refuse un IdP en HTTP) : l'IdP transporte le rôle « admin ».
const fakeOidc = { configured: true, origin: 'https://idp.example',
  start: async () => ({ url: 'https://idp.example/authorize', tx: { state: 's'.repeat(43), nonce: 'n', verifier: 'v' } }),
  finish: async () => ({ claims: { sub: 'autre-org', name: 'Autre' }, roles: ['admin'], admin: true, idToken: 'x' }) };
const ONLINE = { PUBLIC_URL: 'https://photos.example', COOKIE_SECRET: 'x'.repeat(32), OIDC_PROJECT_ID: '42' };

test('A054 : en ligne sans OIDC_ORG_ID, le rôle « admin » de l’IdP ne crée pas d’administrateur', async t => {
  const { app } = await setup(t, { env: ONLINE, oidc: fakeOidc });
  const start = await app.inject('/auth/login');
  const res = await app.inject({ url: `/auth/callback?code=c&state=${'s'.repeat(43)}`, cookies: cookiesOf(start) });
  assert.equal(res.statusCode, 403);
  assert.deepEqual([app.accounts.bySub('autre-org').status, app.accounts.bySub('autre-org').roles], ['en_attente', []]);
  // Avec OIDC_ORG_ID (rôle déjà filtré par organisation) : amorce administrateur.
  const ok = await setup(t, { env: { ...ONLINE, OIDC_ORG_ID: '123' }, oidc: fakeOidc });
  const s2 = await ok.app.inject('/auth/login');
  assert.equal((await ok.app.inject({ url: `/auth/callback?code=c&state=${'s'.repeat(43)}`, cookies: cookiesOf(s2) })).statusCode, 302);
  assert.deepEqual(ok.app.accounts.bySub('autre-org').roles, ['admin']);
});

test('A002 : le modérateur lit un signalement sans voir l’adresse laissée ; l’administrateur la voit', async t => {
  const ctx = await setup(t, { seeded: true });
  const p = ctx.db.prepare("SELECT slug FROM photos WHERE status = 'published' LIMIT 1").get();
  const sent = await ctx.app.inject({ method: 'POST', url: `/photo/${p.slug}/signaler`, remoteAddress: '203.0.113.9', payload: { kind: 'autre', message: 'C’est moi, retirez cette photo', email: 'alice.martin@example.org' } });
  assert.equal(sent.statusCode, 303);
  const m = (await as(ctx, 'moderateur-1', ['moderateur']).get('/admin/signalements')).body;
  assert.match(m, /C’est moi, retirez cette photo/);
  assert.doesNotMatch(m, /alice\.martin/);
  assert.match(m, /seul un administrateur la voit/);
  assert.match((await as(ctx, 'admin-1', ['admin']).get('/admin/signalements')).body, /mailto:alice\.martin@example\.org/);
});

test('A050 : le modérateur ne vide pas une série qui a des photos (il supprime une série vide)', async t => {
  const ctx = await setup(t, { seeded: true });
  const m = as(ctx, 'moderateur-1', ['moderateur']);
  const [full, other] = ctx.db.prepare('SELECT c.id FROM categories c WHERE EXISTS (SELECT 1 FROM photos p WHERE p.category_id = c.id) ORDER BY c.id LIMIT 2').pluck().all();
  const before = ctx.db.prepare('SELECT id FROM photos WHERE category_id = ? ORDER BY id').pluck().all(full);
  assert.doesNotMatch((await m.get('/admin/series')).body, /Déplacer les \d+ photos et supprimer/);
  assert.equal((await m.post(`/admin/series/${full}/delete`, { move_to: String(other) })).statusCode, 403);
  assert.deepEqual(ctx.db.prepare('SELECT id FROM photos WHERE category_id = ? ORDER BY id').pluck().all(full), before);
  const empty = ctx.db.prepare("INSERT INTO categories (name, slug, position) VALUES ('Vide', 'vide', 99)").run().lastInsertRowid;
  assert.equal((await m.post(`/admin/series/${empty}/delete`)).statusCode, 303);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM categories WHERE id = ?').pluck().get(empty), 0);
});

test('A051 et A057 : les réglages du circuit ne valent que pour le rôle Photographe, sans ôter ce qu’un autre rôle donne', async t => {
  // Sans le rôle Photographe : aucun réglage ne compte.
  assert.equal(grantsOf(['relecteur'], { add: ['photos.publier', 'instagram.file'] }).has('photos.publier'), false);
  assert.equal(grantsOf(['relecteur'], { remove: ['photos.publiees.modifier'] }).get('photos.publiees.modifier'), SCOPES.ALL);
  // Photographe + Relecteur : « modifier ses photos publiées » retiré ne retire pas le droit du Relecteur.
  assert.equal(grantsOf(['photographe', 'relecteur'], { remove: ['photos.publiees.modifier'] }).get('photos.publiees.modifier'), SCOPES.ALL);
  assert.equal(grantsOf(['photographe'], { remove: ['photos.publiees.modifier'] }).has('photos.publiees.modifier'), false);
  assert.equal(grantsOf(['photographe'], { add: ['photos.publier'] }).get('photos.publier'), SCOPES.OWN);
  // Plus Photographe : réglages remis à zéro (un rôle Photographe rendu plus tard ne les réactive pas).
  const ctx = await setup(t, { seeded: true });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  as(ctx, 'seb', ['photographe'], { authorId: seb });
  const id = ctx.app.accounts.bySub('seb').id;
  ctx.app.accounts.setAdjust(id, 'photos.publier', true);
  ctx.app.accounts.update(id, { roles: ['relecteur'] }, 'test');
  assert.deepEqual(ctx.app.accounts.bySub('seb').adjust, { add: [], remove: [] });
  const photo = ctx.db.prepare("SELECT id FROM photos WHERE author_id = ? AND status = 'published' LIMIT 1").pluck().get(seb);
  const s = as(ctx, 'seb', ['relecteur']);
  assert.equal((await s.post(`/admin/photos/${photo}/status`, { status: 'draft' })).statusCode, 403);
  // La page du circuit dit ce qu'un autre rôle donne déjà.
  ctx.app.accounts.update(id, { roles: ['photographe', 'relecteur'] }, 'test');
  const page = (await as(ctx, 'moderateur-1', ['moderateur']).get('/admin/circuit')).body;
  assert.match(page, /sinon, une photo publiée ne change plus sans vous · déjà donné par un autre rôle du compte/);
});

test('A004 : exports RGPD et originaux téléchargés vont au Journal, avec le compte', async t => {
  const ctx = await setup(t, { seeded: true });
  await ctx.app.inject({ method: 'POST', url: '/bonjour', remoteAddress: '203.0.113.7', payload: { ref: 'J-0142', wants_photo: 'on', email: 'alice@exemple.fr', name: 'Alice' } });
  const e = ctx.db.prepare("SELECT id, person_id FROM encounters WHERE ref = 'J-0142'").get();
  const photo = ctx.db.prepare('SELECT id FROM photos LIMIT 1').pluck().get();
  const a = as(ctx, 'coadmin', ['admin']);
  for (const url of [`/admin/rencontres/${e.id}/export.zip`, `/admin/personnes/${e.person_id}/export.zip`, `/admin/photos/${photo}/original`]) assert.equal((await a.get(url)).statusCode, 200, url);
  const rows = ctx.db.prepare("SELECT sub, action, target, status FROM audit_log WHERE action LIKE 'GET %' ORDER BY id").all();
  assert.deepEqual(rows, [
    { sub: 'coadmin', action: 'GET /admin/rencontres/:id/export.zip', target: String(e.id), status: 200 },
    { sub: 'coadmin', action: 'GET /admin/personnes/:id/export.zip', target: String(e.person_id), status: 200 },
    { sub: 'coadmin', action: 'GET /admin/photos/:id/original', target: String(photo), status: 200 },
  ]);
  // Une simple page de l'admin, elle, n'y va pas.
  await a.get('/admin/photos');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) FROM audit_log WHERE action LIKE 'GET %'").pluck().get(), 3);
  assert.match((await a.get('/admin/journal')).body, /Rencontre exportée[\s\S]*Original téléchargé|Original téléchargé[\s\S]*Rencontre exportée/);
});

test('A003 : le jeton d’une photo offerte et le code de contrôle d’une carte sont masqués dans les journaux', async t => {
  assert.equal(redactUrl('/pour-vous/aH33t_7pTfh9695MpQfYfCmhwRktqeWm/photo.jpg'), '/pour-vous/[masqué]/photo.jpg');
  assert.equal(redactUrl('/en/bonjour/J-0042-VTR'), '/en/bonjour/J-0042-[masqué]');
  assert.equal(redactUrl('/bonjour/j0042vtr'), '/bonjour/J-0042-[masqué]');
  assert.equal(redactUrl('/bonjour/J%200042%20VTR'), '/bonjour/J-0042-[masqué]');
  for (const keep of ['/bonjour/J', '/bonjour/J-0042', '/bonjour/merci?ref=J-0042', '/photo/code-barre?zipcode=1']) assert.equal(redactUrl(keep), keep);
  const lines = [];
  const { app } = await setup(t, { logger: { level: 'info', stream: { write: l => lines.push(l) } } });
  await app.inject('/pour-vous/SECRETJETONSECRETJETONSECRETJE');
  await app.inject('/bonjour/J-0042-QQQ');
  const log = lines.join('');
  assert.doesNotMatch(log, /SECRETJETON|J-0042-QQQ/);
  assert.match(log, /\/bonjour\/J-0042-\[masqué\]/);
});

test('A009 : une photo absente donne 404, jamais 500, sur toutes les routes /admin/photos/:id', async t => {
  const ctx = await setup(t, { seeded: true });
  ctx.app.describer.save({ on: true });
  const a = as(ctx, 'admin-1', ['admin']);
  const routes = ctx.app.routeList.filter(r => r.url.startsWith('/admin/photos/:id') && ['GET', 'POST'].includes(r.method));
  assert.ok(routes.length > 20);
  const errors = [];
  for (const r of routes) {
    const url = r.url.replace(/:\w+/g, '99999');
    for (const accept of ['text/html', 'application/json']) {
      const res = await ctx.app.inject({ method: r.method, url, cookies: a.cookies, headers: { accept, 'x-csrf-token': a.csrf }, payload: r.method === 'POST' ? { _csrf: a.csrf, confirmer: '1', message: 'x', signature_set: '1' } : undefined });
      if (res.statusCode >= 500) errors.push(`${r.method} ${r.url} [${accept}] → ${res.statusCode}`);
    }
  }
  assert.deepEqual(errors, []);
});

test('A053 : en production, aucune réponse de l’admin n’est cacheable (logo du filigrane compris)', async t => {
  const ctx = await setup(t, { seeded: true, env: { NODE_ENV: 'production', PUBLIC_URL: 'https://photos.example', COOKIE_SECRET: 'x'.repeat(32) } });
  const file = 'logo-test.png';
  await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toFile(path.join(ctx.app.variants.watermarkDir, file));
  const wm = JSON.parse(ctx.db.prepare("SELECT value FROM settings WHERE key = 'watermark'").pluck().get() || '{}');
  ctx.db.prepare("INSERT INTO settings (key, value) VALUES ('watermark', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ ...wm, image: file }));
  const a = as(ctx, 'admin-1', ['admin'], { cookieName: '__Host-session' });
  const res = await a.get('/admin/images/logo');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  // Le site public garde son cache long.
  const css = (await ctx.app.inject('/')).body.match(/href="(\/static\/css\/site\.css\?v=[0-9a-f]{10})"/)[1];
  assert.match((await ctx.app.inject(css)).headers['cache-control'], /max-age=31536000/);
});

test('A060 : PUBLIC_URL analysée, et obligatoire en production', () => {
  const secret = { COOKIE_SECRET: 'x'.repeat(32) };
  const cfg = loadConfig({ ...secret, PUBLIC_URL: 'HTTPS://Photos.Example/' });
  assert.deepEqual([cfg.publicUrl, cfg.secureCookies, cfg.deployed], ['https://photos.example', true, true]);
  assert.equal(loadConfig({ ...secret, PUBLIC_URL: 'https://photos.example/galerie/' }).publicUrl, 'https://photos.example/galerie');
  assert.throws(() => loadConfig({ ...secret, NODE_ENV: 'production' }), /PUBLIC_URL est obligatoire en production/);
  assert.throws(() => loadConfig({ ...secret, PUBLIC_URL: 'photos.example' }), /PUBLIC_URL n’est pas une adresse valide/);
  assert.throws(() => loadConfig({ ...secret, PUBLIC_URL: 'ftp://photos.example' }), /PUBLIC_URL doit commencer par https/);
  assert.equal(loadConfig({}).publicUrl, 'http://localhost:3000');                         // développement : inchangé
});

test('A006 : TRUST_PROXY laissé par défaut sur un serveur joignable du réseau : avertissement au démarrage', async t => {
  const lines = [];
  const logger = { level: 'warn', stream: { write: l => lines.push(l) } };
  await setup(t, { logger, env: { PUBLIC_URL: 'https://photos.example', COOKIE_SECRET: 'x'.repeat(32), HOST: '0.0.0.0' } });
  assert.match(lines.join(''), /TRUST_PROXY non défini/);
  lines.length = 0;
  await setup(t, { logger, env: { PUBLIC_URL: 'https://photos.example', COOKIE_SECRET: 'x'.repeat(32), HOST: '0.0.0.0', TRUST_PROXY: '172.29.42.10' } });
  assert.doesNotMatch(lines.join(''), /TRUST_PROXY non défini/);
});

test('A059 : en conteneur, la base doit être dans le dossier des données', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'garde-base-'));
  const on = { REQUIRE_PERSISTENT_STORAGE: '1' };
  assert.doesNotThrow(() => assertDatabaseInStorage(path.join(dir, 'site.db'), dir, on));
  assert.doesNotThrow(() => assertDatabaseInStorage(path.join(dir, 'db', 'site.db'), dir, on));
  assert.throws(() => assertDatabaseInStorage('/tmp/site.db', dir, on), /DATABASE_PATH .* doit être dans le dossier des données/);
  assert.throws(() => assertDatabaseInStorage(path.join(dir, '..', 'site.db'), dir, on), /refus de démarrer/);
  assert.doesNotThrow(() => assertDatabaseInStorage('/tmp/site.db', dir, {}));          // hors conteneur : rien
  fs.rmSync(dir, { recursive: true });
});

test('A061 : publication groupée, l’état d’une photo à vérifier n’est calculé qu’une fois', async t => {
  const { db } = await setup(t, { seeded: true });
  const id = db.prepare('SELECT id FROM photos LIMIT 1').pluck().get();
  db.prepare('UPDATE photos SET faces = 1, faces_override = NULL WHERE id = ?').run(id);
  let calls = 0;
  const readiness = createReadiness({ db, encounters: { forPhoto: () => { calls++; return []; } } });
  assert.deepEqual(readiness.gate([id]).verify.map(v => v.id), [id]);
  assert.equal(calls, 1);
});

test('A062 : une session ne porte pas de rôles (ceux du compte font foi)', async t => {
  const { app, provider, db } = await withProvider(t);
  provider.user = { sub: 'u1', ...ADMIN };
  assert.equal((await login(app, provider)).res.statusCode, 302);
  assert.equal(db.prepare("SELECT roles FROM sessions WHERE sub = 'u1'").pluck().get(), '[]');
});
