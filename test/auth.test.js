import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { startProvider } from './oidc-provider.js';
import { safeNext } from '../server/auth.js';
import { rolesFrom } from '../server/oidc.js';
import { redactUrl } from '../server/app.js';

const ADMIN = { 'urn:zitadel:iam:org:project:roles': { admin: { 123: 'site.zitadel.cloud' } } };

// Cookies posés par une réponse, au format attendu par inject().
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function withProvider(t, env = {}) {
  const provider = await startProvider(t);
  const ctx = await setup(t, {
    env: { OIDC_ISSUER: provider.issuer, OIDC_CLIENT_ID: 'site', OIDC_CLIENT_SECRET: 'secret', OIDC_PROJECT_ID: '42', ...env },
  });
  return { ...ctx, provider };
}

// Parcourt le flux complet : /auth/login → IdP → /auth/callback.
async function login(app, provider, { next } = {}) {
  const start = await app.inject(`/auth/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  assert.equal(start.statusCode, 302);
  const { code, state, params } = provider.authorize(start.headers.location);
  const res = await app.inject({ url: `/auth/callback?code=${code}&state=${state}`, cookies: cookiesOf(start) });
  return { start, code, params, res, cookies: cookiesOf(res) };
}

test('la connexion envoie vers l’IdP avec PKCE, state, nonce et les scopes Zitadel', async t => {
  const { app, provider } = await withProvider(t);
  const res = await app.inject('/auth/login');
  const url = new URL(res.headers.location);
  assert.equal(url.origin + url.pathname, `${provider.issuer}/oauth/v2/authorize`);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('state') && url.searchParams.get('nonce'));
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/auth/callback');
  assert.match(url.searchParams.get('scope'), /urn:zitadel:iam:org:project:id:42:aud/);
  const tx = res.cookies.find(c => c.name === `oidc-${url.searchParams.get('state')}`);
  assert.ok(tx.httpOnly);
  assert.equal(tx.sameSite, 'Lax');
});

test('un admin se connecte, accède à /admin et revient à la page demandée', async t => {
  const { app, provider, db } = await withProvider(t);
  provider.user = { sub: 'u1', name: 'Julien', email: 'j@example.org', ...ADMIN };
  const { res, cookies } = await login(app, provider, { next: '/admin?x=1' });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, '/admin?x=1');
  assert.ok(cookies.session);
  // Seule l'empreinte du jeton est en base.
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions WHERE id = ?').pluck().get(cookies.session), 0);
  const admin = await app.inject({ url: '/admin', cookies });
  assert.equal(admin.statusCode, 200);
  assert.match(admin.body, /Connecté en tant que <strong>Julien<\/strong>/);
  assert.equal(admin.headers['cache-control'], 'no-store');
});

test('les rôles absents de l’ID token sont lus dans userinfo', async t => {
  const { app, provider } = await withProvider(t);
  provider.user = { sub: 'u1' };
  provider.userinfo = { name: 'Sébastien', ...ADMIN };
  const { res } = await login(app, provider);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, '/admin');
});

test('sans le rôle admin : 403 et aucune session', async t => {
  const { app, provider, db } = await withProvider(t);
  provider.user = { sub: 'intrus', email: 'x@example.org', 'urn:zitadel:iam:org:project:roles': { lecteur: {} } };
  const { res, cookies } = await login(app, provider);
  assert.equal(res.statusCode, 403);
  assert.match(res.body, /Utiliser un autre compte/);
  assert.equal(cookies.session, undefined);
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 0);
});

test('repli sans Zitadel : sub en liste blanche avec e-mail vérifié', async t => {
  const { app, provider } = await withProvider(t, { OIDC_PROJECT_ID: '', OIDC_ALLOWED_SUBS: 'g-1, g-2' });
  provider.user = { sub: 'g-2', email: 'g@example.org', email_verified: false };
  assert.equal((await login(app, provider)).res.statusCode, 403);
  provider.user.email_verified = true;
  assert.equal((await login(app, provider)).res.statusCode, 302);
  provider.user.sub = 'g-3';
  assert.equal((await login(app, provider)).res.statusCode, 403);
});

test('un state invalide ou un cookie de transaction absent est refusé sans appel à l’IdP', async t => {
  const { app, provider } = await withProvider(t);
  provider.user = { sub: 'u1', ...ADMIN };
  const start = await app.inject('/auth/login');
  const { code } = provider.authorize(start.headers.location);
  const before = provider.requests.filter(p => p.endsWith('/token')).length;

  const forged = await app.inject({ url: `/auth/callback?code=${code}&state=autre`, cookies: cookiesOf(start) });
  assert.equal(forged.statusCode, 400);
  assert.match(forged.body, /Connexion expirée/);

  const noCookie = await app.inject(`/auth/callback?code=${code}&state=x`);
  assert.equal(noCookie.statusCode, 400);

  const [[name, value]] = Object.entries(cookiesOf(start));
  const state = name.slice('oidc-'.length);
  const tampered = { [name]: value.replace(/\.[^.]+$/, '.faux') };
  assert.equal((await app.inject({ url: `/auth/callback?code=${code}&state=${state}`, cookies: tampered })).statusCode, 400);

  // Cookie d'une autre transaction (autre state) présenté avec ce state : refusé.
  const other = await app.inject('/auth/login');
  const otherState = new URL(other.headers.location).searchParams.get('state');
  const swapped = { [name]: cookiesOf(other)[`oidc-${otherState}`] };
  assert.equal((await app.inject({ url: `/auth/callback?code=${code}&state=${state}`, cookies: swapped })).statusCode, 400);

  assert.equal(provider.requests.filter(p => p.endsWith('/token')).length, before);
});

test('un code déjà utilisé est refusé', async t => {
  const { app, provider } = await withProvider(t);
  provider.user = { sub: 'u1', ...ADMIN };
  const first = await login(app, provider);
  assert.equal(first.res.statusCode, 302);
  const replay = await app.inject({ url: `/auth/callback?code=${first.code}&state=${first.params.get('state')}`, cookies: cookiesOf(first.start) });
  assert.equal(replay.statusCode, 400);
  assert.equal(cookiesOf(replay).session, undefined);
});

test('l’IdP renvoie une erreur (connexion annulée)', async t => {
  const { app } = await withProvider(t);
  const res = await app.inject('/auth/callback?error=access_denied&state=x');
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /Connexion annulée/);
});

test('sans session : redirection vers la connexion, en gardant la page demandée', async t => {
  const { app } = await withProvider(t);
  const res = await app.inject('/admin');
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, '/auth/login?next=%2Fadmin');
});

test('session expirée : supprimée, cookie effacé, redirection', async t => {
  const { app, provider, db } = await withProvider(t);
  provider.user = { sub: 'u1', ...ADMIN };
  const { cookies } = await login(app, provider);
  db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1);
  const res = await app.inject({ url: '/admin', cookies });
  assert.equal(res.statusCode, 302);
  assert.match(res.headers.location, /^\/auth\/login/);
  assert.equal(res.cookies.find(c => c.name === 'session')?.value, '');
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 0);
});

test('session trop ancienne : expiration absolue même si active', async t => {
  const { app, provider, db } = await withProvider(t);
  provider.user = { sub: 'u1', ...ADMIN };
  const { cookies } = await login(app, provider);
  db.prepare('UPDATE sessions SET created_at = ?').run(Date.now() - 25 * 3600 * 1000);
  assert.equal((await app.inject({ url: '/admin', cookies })).statusCode, 302);
});

test('déjà connecté, /auth/login renvoie directement à la page demandée', async t => {
  const { app, provider } = await withProvider(t);
  provider.user = { sub: 'u1', ...ADMIN };
  const { cookies } = await login(app, provider);
  const res = await app.inject({ url: '/auth/login?next=/admin/photos', cookies });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, '/admin/photos');
});

test('une nouvelle connexion régénère la session et détruit l’ancienne', async t => {
  const { app, provider, db } = await withProvider(t);
  provider.user = { sub: 'u1', ...ADMIN };
  const first = await login(app, provider);
  // Second passage par l'IdP alors que l'ancien cookie de session est encore présent.
  const start = await app.inject('/auth/login');
  const { code, state } = provider.authorize(start.headers.location);
  const res = await app.inject({ url: `/auth/callback?code=${code}&state=${state}`, cookies: { ...cookiesOf(start), ...first.cookies } });
  const fresh = cookiesOf(res).session;
  assert.ok(fresh && fresh !== first.cookies.session);
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 1);
  assert.equal((await app.inject({ url: '/admin', cookies: first.cookies })).statusCode, 302);
  assert.equal((await app.inject({ url: '/admin', cookies: { session: fresh } })).statusCode, 200);
});

test('déconnexion : POST avec CSRF, session détruite, retour par l’IdP', async t => {
  const { app, provider, db } = await withProvider(t);
  provider.user = { sub: 'u1', ...ADMIN };
  const { cookies } = await login(app, provider);
  const csrf = db.prepare('SELECT csrf FROM sessions').pluck().get();

  const forged = await app.inject({ method: 'POST', url: '/auth/logout', cookies, payload: { _csrf: 'faux' } });
  assert.equal(forged.statusCode, 403);
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 1);

  const res = await app.inject({ method: 'POST', url: '/auth/logout', cookies, payload: { _csrf: csrf } });
  assert.equal(res.statusCode, 303);
  const url = new URL(res.headers.location);
  assert.equal(url.pathname, '/oidc/v1/end_session');
  assert.equal(url.searchParams.get('post_logout_redirect_uri'), 'http://localhost:3000/');
  assert.ok(url.searchParams.get('id_token_hint'));
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 0);
  assert.equal((await app.inject({ url: '/admin', cookies })).statusCode, 302);
});

test('la CSP autorise l’IdP comme cible de formulaire, et rien d’autre', async t => {
  const { app, provider } = await withProvider(t);
  const csp = (await app.inject('/')).headers['content-security-policy'];
  assert.match(csp, new RegExp(`form-action 'self' ${provider.issuer.replace(/\./g, '\\.')};`));
});

test('sans configuration OIDC : 503 sur la connexion, le site reste servi', async t => {
  const { app } = await setup(t);
  assert.equal((await app.inject('/auth/login')).statusCode, 503);
  assert.equal((await app.inject('/')).statusCode, 200);
});

// Faux client OIDC : sans réseau, pour les cas où un IdP en HTTP serait refusé par la config.
const fakeOidc = { configured: true, origin: 'https://idp.example', start: async () => ({ url: 'https://idp.example/authorize', tx: { state: 's'.repeat(43), nonce: 'n', verifier: 'v' } }) };
const HTTPS = { PUBLIC_URL: 'https://photos.example', COOKIE_SECRET: 'x'.repeat(32) };

test('en HTTPS les cookies sont Secure et préfixés __Host-, HSTS est posé', async t => {
  const { app } = await setup(t, { env: HTTPS, oidc: fakeOidc });
  const res = await app.inject('/auth/login');
  const tx = res.cookies[0];
  assert.equal(tx.name, `__Host-oidc-${'s'.repeat(43)}`);
  assert.ok(tx.secure);
  assert.equal(tx.path, '/');
  assert.equal(res.headers['strict-transport-security'], 'max-age=31536000');
});

test('safeNext refuse les redirections hors du site, y compris par caractères de contrôle', () => {
  assert.equal(safeNext('/admin/photos?q=1#x'), '/admin/photos?q=1#x');
  for (const bad of ['//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', '/\r\n/evil.example',
    '/\\/evil.example', 'https://evil.example', 'admin', undefined, ['/a']]) {
    assert.equal(safeNext(bad), '/admin', JSON.stringify(bad));
  }
  assert.equal(safeNext('/a\nb'), '/ab');                 // jamais de saut de ligne dans Location
});

test('redirection ouverte : un admin connecté n’est jamais renvoyé hors du site', async t => {
  const { app, provider } = await withProvider(t);
  provider.user = { sub: 'u1', ...ADMIN };
  const { cookies } = await login(app, provider, { next: '/\t/evil.example' });
  for (const next of ['%2F%09%2Fevil.example', '%2F%0A%2Fevil.example', '%2F%5C%2Fevil.example']) {
    const res = await app.inject({ url: `/auth/login?next=${next}`, cookies });
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, '/admin', next);
  }
});

test('rolesFrom préfère le claim du projet et filtre par organisation', () => {
  assert.deepEqual(rolesFrom(ADMIN), ['admin']);
  assert.deepEqual(rolesFrom({ 'urn:zitadel:iam:org:project:42:roles': { editeur: {} } }, { projectId: '42' }), ['editeur']);
  assert.deepEqual(rolesFrom({ ...ADMIN, 'urn:zitadel:iam:org:project:42:roles': { lecteur: {} } }, { projectId: '42' }), ['lecteur']);
  assert.deepEqual(rolesFrom(ADMIN, { orgId: '123' }), ['admin']);
  assert.deepEqual(rolesFrom(ADMIN, { orgId: '999' }), []);
  assert.deepEqual(rolesFrom({}), []);
});

test('un rôle admin donné dans une autre organisation est refusé', async t => {
  const { app, provider } = await withProvider(t, { OIDC_ORG_ID: '123' });
  provider.user = { sub: 'u1', 'urn:zitadel:iam:org:project:roles': { admin: { 777: 'autre.zitadel.cloud' } } };
  assert.equal((await login(app, provider)).res.statusCode, 403);
  provider.user = { sub: 'u1', ...ADMIN };
  assert.equal((await login(app, provider)).res.statusCode, 302);
});

test('deux connexions lancées dans deux onglets aboutissent toutes les deux', async t => {
  const { app, provider } = await withProvider(t);
  provider.user = { sub: 'u1', ...ADMIN };
  const a = await app.inject('/auth/login?next=/admin/a');
  const b = await app.inject('/auth/login?next=/admin/b');
  const jar = { ...cookiesOf(a), ...cookiesOf(b) };
  for (const [start, next] of [[a, '/admin/a'], [b, '/admin/b']]) {
    const { code, state } = provider.authorize(start.headers.location);
    const res = await app.inject({ url: `/auth/callback?code=${code}&state=${state}`, cookies: jar });
    assert.equal(res.headers.location, next);
  }
});

test('déconnexion avec un jeton périmé : page d’erreur lisible, session conservée', async t => {
  const { app, provider } = await withProvider(t);
  provider.user = { sub: 'u1', ...ADMIN };
  const { cookies } = await login(app, provider);
  const res = await app.inject({ method: 'POST', url: '/auth/logout', cookies, payload: { _csrf: 'périmé' } });
  assert.equal(res.statusCode, 403);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.body, /Formulaire expiré/);
  assert.equal((await app.inject({ url: '/admin', cookies })).statusCode, 200);
});

test('limite de débit sur les tentatives de connexion : 429 au-delà de 30', async t => {
  const { app } = await setup(t);
  for (let i = 0; i < 30; i++) assert.equal((await app.inject('/auth/callback?state=x')).statusCode, 400);
  const res = await app.inject('/auth/callback?state=x');
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['retry-after'], '600');
  assert.equal((await app.inject('/auth/login')).statusCode, 503);   // la redirection vers l'IdP n'est pas comptée ni bloquée
  assert.equal((await app.inject('/')).statusCode, 200);             // le site public n'est pas concerné
  assert.equal((await app.inject({ method: 'POST', url: '/auth/logout' })).statusCode, 303);   // ni la déconnexion
});

test('limiteur : IPv6 regroupé par /64, mémoire bornée', async () => {
  const { createRateLimiter, clientKey } = await import('../server/ratelimit.js');
  assert.equal(clientKey('2001:db8:1:2:aaaa::1'), '2001:0db8:0001:0002::/64');
  assert.equal(clientKey('2001:db8:1:2::ffff'), clientKey('2001:db8:1:2:aaaa::1'));
  assert.equal(clientKey('::ffff:10.0.0.1'), '10.0.0.1');
  const allow = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3 });
  assert.equal(allow('2001:db8::1'), true);
  assert.equal(allow('2001:db8::2'), false);                // même /64
  for (let i = 0; i < 10; i++) allow(`10.0.0.${i}`);       // ne dépasse pas maxKeys
});

test('le code et le state OIDC sont masqués dans les journaux', async t => {
  const lines = [];
  const stream = { write: l => lines.push(l) };
  const { app } = await setup(t, { logger: { level: 'info', stream } });
  await app.inject('/auth/callback?code=SECRET-CODE&state=SECRET-STATE&error=x');
  const log = lines.join('');
  assert.match(log, /\/auth\/callback\?code=\[masqué\]&state=\[masqué\]&error=x/);
  assert.doesNotMatch(log, /SECRET-/);
});

test('redactUrl ne touche qu’aux paramètres code et state', () => {
  assert.equal(redactUrl('/a?code=1&x=2&state=3#h'), '/a?code=[masqué]&x=2&state=[masqué]#h');
  assert.equal(redactUrl('/photo/code-barre?zipcode=1'), '/photo/code-barre?zipcode=1');
});

test('comptes : inconnu en attente sans session, rôle donné dans l’admin, désactivé refusé, garde-fou ADMIN_SUBS', async t => {
  const { app, provider, db } = await withProvider(t, { ADMIN_SUBS: 'secours-1' });
  // Sans rôle dans l'IdP : compte créé « en attente », aucune session.
  provider.user = { sub: 'invite-1', name: 'Invité', email: 'invite@example.org' };
  const first = await login(app, provider);
  assert.equal(first.res.statusCode, 403);
  assert.match(first.res.body, /Compte en attente/);
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 0);
  assert.deepEqual(db.prepare("SELECT name, email, status, roles FROM accounts WHERE sub = 'invite-1'").get(), { name: 'Invité', email: 'invite@example.org', status: 'en_attente', roles: '[]' });
  // Un administrateur lui donne un rôle : la connexion suivante passe, avec ce rôle-là seulement.
  app.accounts.update(app.accounts.bySub('invite-1').id, { roles: ['moderateur'] }, 'quelqu-un');
  const second = await login(app, provider);
  assert.equal(second.res.statusCode, 302);
  assert.equal((await app.inject({ url: '/admin/signalements', cookies: second.cookies })).statusCode, 200);
  assert.equal((await app.inject({ url: '/admin/personnes', cookies: second.cookies, headers: { accept: 'text/html' } })).statusCode, 403);
  // Désactivé : la session en cours est fermée tout de suite, et la connexion est refusée.
  app.accounts.update(app.accounts.bySub('invite-1').id, { status: 'desactive' }, 'quelqu-un');
  assert.equal((await app.inject({ url: '/admin', cookies: second.cookies })).statusCode, 302);
  assert.equal(db.prepare("SELECT COUNT(*) FROM sessions WHERE sub = 'invite-1'").pluck().get(), 0);
  const third = await login(app, provider);
  assert.equal(third.res.statusCode, 403);
  assert.match(third.res.body, /désactivé/);
  // Garde-fou : une identité de ADMIN_SUBS est administratrice, même sans rôle dans l'IdP.
  provider.user = { sub: 'secours-1', name: 'Secours' };
  const rescue = await login(app, provider);
  assert.equal(rescue.res.statusCode, 302);
  assert.equal((await app.inject({ url: '/admin/comptes', cookies: rescue.cookies })).statusCode, 200);
  // Le journal garde les connexions, réussies ou non.
  const actions = db.prepare('SELECT action FROM audit_log ORDER BY id').pluck().all();
  assert.deepEqual(actions.filter(a => a.startsWith('connexion')), ['connexion en attente d’un rôle', 'connexion', 'connexion refusée (compte désactivé)', 'connexion']);
});
