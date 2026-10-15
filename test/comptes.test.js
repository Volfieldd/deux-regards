import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Comptes et rôles (étape 2) : page « Comptes et rôles », effet immédiat, garde-fous, photographe lié, journal, menu.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function admin(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare("SELECT csrf FROM sessions WHERE sub = 'local:julien'").pluck().get();
  const post = (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } });
  const flash = async res => decodeURIComponent((await ctx.app.inject({ url: res.headers.location, cookies: { ...cookies, ...cookiesOf(res) } })).body);
  return { ...ctx, cookies, post, flash, get: url => ctx.app.inject({ url, cookies }) };
}
// Session pour une autre identité (comme après une connexion OIDC).
function sessionFor(ctx, sub) {
  const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
  return url => ctx.app.inject({ url, cookies: { session: token }, headers: { accept: 'text/html' } });
}

test('comptes : en attente, rôle donné puis retiré avec effet immédiat ; les quatre rôles proposés', async t => {
  const c = await admin(t);
  c.app.accounts.login({ sub: 'zitadel-camille', name: 'Camille', email: 'camille@example.org' });
  assert.match((await c.get('/admin')).body, /1 compte en attente d’un rôle/);
  const page = (await c.get('/admin/comptes')).body;
  assert.match(page, /Camille/);
  assert.match(page, /en attente/);
  assert.match(page, /value="photographe">/);                               // proposé depuis l'étape 3
  const camille = c.app.accounts.bySub('zitadel-camille');
  const as = sessionFor(c, 'zitadel-camille');
  assert.equal((await as('/admin')).statusCode, 403);
  assert.match((await as('/admin')).body, /Compte en attente/);
  // Rôle Modérateur ; un rôle inconnu est ignoré.
  const r = await c.post(`/admin/comptes/${camille.id}`, { roles: ['moderateur', 'pirate'], author_id: '' });
  assert.equal(r.statusCode, 303);
  assert.deepEqual(c.app.accounts.bySub('zitadel-camille').roles, ['moderateur']);
  assert.equal(c.app.accounts.bySub('zitadel-camille').status, 'actif');
  assert.equal((await as('/admin/signalements')).statusCode, 200);
  assert.equal((await as('/admin/personnes')).statusCode, 403);
  // Menu : seulement ce qu'elle peut ouvrir.
  const side = html => html.slice(html.indexOf('<aside class="side"'), html.indexOf('</aside>'));
  const menu = side((await as('/admin')).body);
  assert.match(menu, /href="\/admin\/photos"/);
  assert.doesNotMatch(menu, /href="\/admin\/personnes"|href="\/admin\/comptes"|href="\/admin\/journal"|href="\/admin\/auteurs"/);
  assert.match(side((await c.get('/admin')).body), /href="\/admin\/comptes"[\s\S]*href="\/admin\/journal"/);
  // Retirer le rôle : plus d'accès, tout de suite.
  await c.post(`/admin/comptes/${camille.id}`, { author_id: '' });
  assert.equal((await as('/admin/signalements')).statusCode, 403);
  // Journal : le détail de la modification.
  const log = c.db.prepare("SELECT action, target, detail FROM audit_log WHERE action = 'compte modifié' ORDER BY id").all();
  assert.equal(log.length, 2);
  assert.match(log[0].detail, /rôles : — → Modérateur ; état : en attente → actif/);
});

test('comptes : garde-fous (dernier administrateur, soi-même), photographe lié unique, suppression', async t => {
  const c = await admin(t);
  const me = c.app.accounts.bySub('local:julien');
  assert.deepEqual(me.roles, ['admin']);
  // Le seul administrateur ne peut pas perdre son rôle, ni se désactiver ou se supprimer.
  assert.match(await c.flash(await c.post(`/admin/comptes/${me.id}`, { roles: ['relecteur'], author_id: String(me.author_id) })), /Il faut au moins un administrateur actif/);
  assert.match(await c.flash(await c.post(`/admin/comptes/${me.id}`, { roles: ['admin'], status: 'desactive', author_id: String(me.author_id) })), /votre propre compte/);
  assert.match(await c.flash(await c.post(`/admin/comptes/${me.id}/supprimer`)), /votre propre compte/);
  assert.deepEqual(c.app.accounts.bySub('local:julien').roles, ['admin']);
  // Photographe lié : un seul compte par photographe ; il sert ensuite aux valeurs par défaut.
  c.app.accounts.login({ sub: 'zitadel-seb', name: 'Sébastien' });
  const seb = c.app.accounts.bySub('zitadel-seb');
  assert.match(await c.flash(await c.post(`/admin/comptes/${seb.id}`, { roles: ['admin'], author_id: String(me.author_id) })), /déjà lié à un autre compte/);
  const sebastien = c.db.prepare("SELECT id FROM authors WHERE slug != 'julien' LIMIT 1").pluck().get();
  await c.post(`/admin/comptes/${seb.id}`, { roles: ['admin'], author_id: String(sebastien) });
  assert.equal(c.app.accounts.bySub('zitadel-seb').author_id, sebastien);
  // Deux administrateurs : on peut maintenant retirer l'un d'eux ; supprimer déconnecte.
  createSessionStore(c.db).create({ sub: 'zitadel-seb', roles: [] });
  await c.post(`/admin/comptes/${seb.id}/supprimer`);
  assert.equal(c.app.accounts.bySub('zitadel-seb'), undefined);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM sessions WHERE sub = 'zitadel-seb'").pluck().get(), 0);
  // Le formulaire Photographe ne change plus le compte lié.
  assert.doesNotMatch((await c.get('/admin/auteurs')).body, /name="oidc_sub"/);
});

test('journal : actions notées en base avec un libellé lisible, filtres ; préférences non notées', async t => {
  const c = await admin(t);
  const p = c.db.prepare('SELECT id FROM photos LIMIT 1').pluck().get();
  await c.app.inject({ method: 'POST', url: `/admin/photos/${p}/champs`, cookies: c.cookies, headers: { 'x-csrf-token': c.db.prepare("SELECT csrf FROM sessions WHERE sub = 'local:julien'").pluck().get() }, payload: { title: 'Nouveau titre' } });
  await c.post('/admin/langue', { lang: 'fr', back: '/admin' });
  const rows = c.db.prepare('SELECT sub, action, target, status FROM audit_log ORDER BY id').all();
  assert.ok(rows.some(r => r.action === 'POST /admin/photos/:id/champs' && r.target === String(p) && r.status === 200 && r.sub === 'local:julien'));
  assert.ok(!rows.some(r => r.action === 'POST /admin/langue'));
  const page = (await c.get('/admin/journal')).body;
  assert.match(page, /Photo modifiée/);
  assert.match(page, /Connexion \(test\)/);
  assert.doesNotMatch((await c.get('/admin/journal?q=inexistant')).body, /Photo modifiée/);
  // Gardé 13 mois.
  c.db.prepare('UPDATE audit_log SET at = ?').run(Date.now() - 400 * 864e5);
  assert.ok(c.app.audit.purge() >= 2);
});

test('site public : seul un compte qui règle le site voit l’aperçu de la carte ; un compte sans rôle n’est pas « admin »', async t => {
  const c = await admin(t);
  const none = sessionFor(c, 'zitadel-inconnu');
  c.app.accounts.login({ sub: 'zitadel-inconnu', name: 'X' });
  assert.equal((await none('/carte')).statusCode, 404);
  assert.equal((await c.get('/carte')).statusCode, 200);
});
