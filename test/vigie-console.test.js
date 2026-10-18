import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadVigieConfig } from '../vigie/config.js';
import { createAccessVerifier } from '../vigie/console/access.js';
import { createRights, createCeilingReader, ceilingOf, can, RightsError } from '../vigie/console/droits.js';
import { safeRetour } from '../vigie/console/server.js';
import { setup, accessJwt, b64, TEAM, AUD, ISS, CERTS, START, other } from './console-env.js';
import { VIGIE_KEYS } from './helpers.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Console de la Vigie, phase D3a : trois verrous (Cloudflare Access, connexion Zitadel propre, droits à deux clés relus
// chez Zitadel), sessions (1 h, 15 min sans activité), ré-authentification, DS29 et DS30.

test('jeton Cloudflare Access : signature, émetteur, audience, dates, algorithme ; clés relues sur clé inconnue, une fois par minute au plus', async () => {
  const clock = { t: START };
  let fetches = 0;
  const v = createAccessVerifier({ team: TEAM, aud: AUD, now: () => clock.t, fetchImpl: async url => { fetches += 1; assert.equal(url, `${ISS}/cdn-cgi/access/certs`); return new Response(JSON.stringify(CERTS)); } });
  assert.deepEqual(await v.verify(accessJwt(clock)), { email: 'seb@exemple.org', sub: 'cf-seb@exemple.org' });
  const bad = {
    'audience': { aud: 'b2'.repeat(32) },
    'émetteur': { iss: 'https://autre.cloudflareaccess.com' },
    'expiré': { exp: Math.floor(clock.t / 1000) - 3600 },
    'pas encore valable': { nbf: Math.floor(clock.t / 1000) + 3600 },
    'signature': { key: other.privateKey },
    'algorithme': { alg: 'HS256' },
  };
  for (const [nom, o] of Object.entries(bad)) await assert.rejects(v.verify(accessJwt(clock, o)), Error, nom);
  await assert.rejects(v.verify(undefined), /absent ou mal formé/);
  await assert.rejects(v.verify('a.b'), /absent ou mal formé/);
  const none = `${b64({ alg: 'none', kid: 'k1' })}.${b64({ iss: ISS, aud: AUD, exp: 9e9 })}.`;
  await assert.rejects(v.verify(none), /mal formé/);
  assert.equal(fetches, 1);
  // Clé inconnue : relecture (au plus une par minute), puis plus avant la minute suivante.
  await assert.rejects(v.verify(accessJwt(clock, { kid: 'k9' })), /clé inconnue/);
  assert.equal(fetches, 1, 'clés lues à l’instant : pas de nouvelle lecture');
  clock.t += 61e3;
  await assert.rejects(v.verify(accessJwt(clock, { kid: 'k9' })), /clé inconnue/);
  await assert.rejects(v.verify(accessJwt(clock, { kid: 'k9' })), /clé inconnue/);
  assert.equal(fetches, 2);
  clock.t += 61e3;
  await assert.rejects(v.verify(accessJwt(clock, { kid: 'k9' })), /clé inconnue/);
  assert.equal(fetches, 3);
  assert.throws(() => createAccessVerifier({ team: 'Equipe!', aud: AUD }), /VIGIE_ACCESS_TEAM/);
  assert.throws(() => createAccessVerifier({ team: TEAM, aud: 'court' }), /VIGIE_ACCESS_AUD/);
});

test('sans jeton Access : 403 sobre partout (fichiers statiques et connexion compris), DS30 noté une fois par adresse et par 10 minutes', async t => {
  const v = setup(t);
  for (const url of ['/', '/static/vigie.css', '/auth/login', '/auth/callback?state=x', '/robots.txt', '/inexistant']) {
    const r = await v.app.inject({ url });
    assert.equal(r.statusCode, 403, url);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.doesNotMatch(r.body, /Sébastien|sub-seb|\/alertes/);
  }
  const forged = await v.app.inject({ url: '/', headers: { 'cf-access-jwt-assertion': accessJwt(v.clock, { aud: 'b2'.repeat(32) }), 'cf-connecting-ip': '203.0.113.5' } });
  assert.equal(forged.statusCode, 403);
  const refus = v.events('vigie_console_refus');
  assert.equal(refus.length, 1, 'une ligne par adresse et par 10 minutes');
  assert.equal(refus[0].detail.raison, 'access');
  assert.notEqual(refus[0].ip, '203.0.113.5', 'adresse annoncée ignorée sans jeton valable');
  assert.equal(refus[0].composant, 'vigie · console');
  // Alerte DS30 (moyenne).
  assert.equal(v.alerts().find(a => a.regle === 'sigma.console_refus')?.gravite, 'moyen');
});

test('connexion : PKCE chez Zitadel, session ouverte (cookie __Host-, HttpOnly, Secure, Lax), retour local, en-têtes stricts', async t => {
  const v = setup(t);
  const { r1, r2, cookie } = await v.login({ retour: '/alertes' });
  assert.equal(r1.statusCode, 302);
  assert.match(r1.headers.location, /^https:\/\/idp\.example\/authorize/);
  const tx = r1.cookies.find(x => x.name === '__Host-vigie-tx');
  assert.ok(tx.httpOnly && tx.secure && tx.sameSite === 'Lax' && tx.path === '/');
  assert.equal(r2.statusCode, 302);
  assert.equal(r2.headers.location, '/alertes');
  const sc = r2.cookies.find(x => x.name === '__Host-vigie');
  assert.ok(sc.httpOnly && sc.secure && sc.sameSite === 'Lax' && sc.path === '/');
  assert.equal(sc.maxAge, undefined, 'cookie de session du navigateur');
  const s = v.sessionOf(cookie);
  assert.equal(s.sub, 'sub-seb');
  assert.equal(s.plafond, 'admin');
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM console_sessions WHERE id = ?').pluck().get(cookie), 0, 'jeton jamais en clair dans la base');
  const ev = v.events('vigie_console_connexion');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].ip, '198.51.100.7');
  assert.deepEqual(ev[0].detail, { role: 'admin', plafond: 'admin', amr: ['user', 'mfa'] });
  // Le state ne sert qu'une fois.
  const again = await v.app.inject({ url: `/auth/callback?code=code&state=${tx.value}`, headers: v.h(), cookies: { '__Host-vigie-tx': tx.value } });
  assert.equal(again.statusCode, 400);
  // En-têtes.
  const page = await v.app.inject({ url: '/alertes', headers: v.h(), cookies: { '__Host-vigie': cookie } });
  assert.equal(page.statusCode, 200);
  const csp = page.headers['content-security-policy'];
  for (const d of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'", "form-action 'self' https://idp.example", "base-uri 'none'"]) assert.ok(csp.includes(d), d);
  assert.doesNotMatch(csp, /unsafe/);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.equal(page.headers['referrer-policy'], 'no-referrer');
  assert.equal(page.headers['x-frame-options'], 'DENY');
  assert.match(page.headers['x-robots-tag'], /noindex/);
  // Sans session : vers la connexion, avec le retour.
  const anon = await v.app.inject({ url: '/sante?x=1', headers: v.h() });
  assert.equal(anon.statusCode, 302);
  assert.equal(anon.headers.location, '/auth/login?retour=%2Fsante%3Fx%3D1');
});

test('connexion refusée (DS30) : sans second facteur, sans rôle vigie.*, rôle d’une autre organisation, erreur de Zitadel, state faux', async t => {
  const v = setup(t);
  const mfa = await v.login({ amr: ['pwd'] });
  assert.equal(mfa.r2.statusCode, 403);
  assert.equal(mfa.cookie, undefined);
  const role = await v.login({ roles: ['admin', 'vigie.root'] });
  assert.equal(role.r2.statusCode, 403);
  assert.equal(role.cookie, undefined);
  // Erreur renvoyée par Zitadel (compte sans autorisation sur le projet).
  const r1 = await v.app.inject({ url: '/auth/login', headers: v.h() });
  const st = r1.cookies.find(x => x.name === '__Host-vigie-tx').value;
  const err = await v.app.inject({ url: `/auth/callback?error=access_denied&state=${st}`, headers: v.h(), cookies: { '__Host-vigie-tx': st } });
  assert.equal(err.statusCode, 403);
  // State sans son cookie (lien de retour forgé) : refusé.
  const r3 = await v.app.inject({ url: '/auth/login', headers: v.h() });
  const st3 = r3.cookies.find(x => x.name === '__Host-vigie-tx').value;
  assert.equal((await v.app.inject({ url: `/auth/callback?code=c&state=${st3}`, headers: v.h() })).statusCode, 400);
  // Jeton refusé par openid-client (signature, nonce…) : page « connexion impossible », noté.
  v.oidc.claims = new Error('unexpected JWT "nonce" claim value');
  const r4 = await v.app.inject({ url: '/auth/login', headers: v.h() });
  const st4 = r4.cookies.find(x => x.name === '__Host-vigie-tx').value;
  assert.equal((await v.app.inject({ url: `/auth/callback?code=c&state=${st4}`, headers: v.h(), cookies: { '__Host-vigie-tx': st4 } })).statusCode, 502);
  const raisons = v.events('vigie_console_refus').map(e => e.detail.raison);
  assert.deepEqual(raisons, ['mfa', 'role', 'zitadel', 'etat', 'jeton']);
  assert.equal(v.events('vigie_console_connexion').length, 0);
  // Plus de 3 en une heure : alerte haute (DS30).
  const high = v.alerts().find(a => a.regle === 'sigma.console_refus_repetes');
  assert.equal(high?.gravite, 'haut');
});

test('session : liée à l’identité Access de son ouverture, 15 min sans activité, 1 h au plus ; le rafraîchissement ne la prolonge pas', async t => {
  const v = setup(t);
  const { cookie } = await v.login();
  const get = (url = '/alertes', extra = {}) => v.app.inject({ url, headers: { ...v.h(), ...extra }, cookies: { '__Host-vigie': cookie } });
  // Cookie rejoué derrière une autre identité Access : refusé, session fermée.
  const { cookie: c2 } = await v.login();
  const stolen = await v.app.inject({ url: '/alertes', headers: v.h({ email: 'intrus@exemple.org' }), cookies: { '__Host-vigie': c2 } });
  assert.equal(stolen.statusCode, 403);
  assert.equal(v.sessionOf(c2).ferme_raison, 'access_autre');
  assert.equal(v.events('vigie_console_refus').at(-1).detail.raison, 'access_autre');
  // Activité régulière : tient jusqu'à 1 h.
  for (let i = 0; i < 5; i++) { v.clock.t += 10 * 60e3; assert.equal((await get()).statusCode, 200, `à ${(i + 1) * 10} min`); }
  v.clock.t += 10 * 60e3 + 1;
  const late = await get();
  assert.equal(late.statusCode, 401);
  assert.equal(v.sessionOf(cookie).ferme_raison, 'duree');
  // 15 min sans activité ; le rafraîchissement de la vue d'ensemble ne compte pas comme une activité.
  const { cookie: c3 } = await v.login();
  v.clock.t += 10 * 60e3;
  await v.app.inject({ url: '/alertes', headers: { ...v.h(), 'x-vigie-rafraichir': '1' }, cookies: { '__Host-vigie': c3 } });
  v.clock.t += 6 * 60e3;
  assert.equal((await v.app.inject({ url: '/alertes', headers: v.h(), cookies: { '__Host-vigie': c3 } })).statusCode, 401);
  assert.equal(v.sessionOf(c3).ferme_raison, 'inactivite');
});

test('plafond relu chez Zitadel toutes les 5 minutes : rôle retiré → session fermée et DS29 ; Zitadel injoignable : 15 min de grâce', async t => {
  const v = setup(t);
  const { cookie } = await v.login();
  const get = () => v.app.inject({ url: '/alertes', headers: v.h(), cookies: { '__Host-vigie': cookie } });
  v.clock.t += 4 * 60e3;
  await get();
  assert.equal(v.zitadel.calls, 0, 'pas avant 5 minutes');
  v.clock.t += 2 * 60e3;
  assert.equal((await get()).statusCode, 200);
  assert.equal(v.zitadel.calls, 1);
  // Injoignable : la lecture continue sur le dernier plafond lu, 15 minutes au plus.
  v.zitadel.fail = true;
  v.clock.t += 6 * 60e3;
  assert.equal((await get()).statusCode, 200);
  v.clock.t += 10 * 60e3 + 1;
  assert.equal((await get()).statusCode, 503);
  assert.equal(v.sessionOf(cookie).ferme_raison, 'plafond_illisible');
  // Rôle vigie.* retiré dans Zitadel : accès perdu à la relecture suivante, changement de droits signalé (DS29, haut).
  v.zitadel.fail = false;
  const { cookie: c2 } = await v.login();
  delete v.ceilings['sub-seb'];
  v.clock.t += 5 * 60e3 + 1;
  const r = await v.app.inject({ url: '/alertes', headers: v.h(), cookies: { '__Host-vigie': c2 } });
  assert.equal(r.statusCode, 403);
  assert.equal(v.sessionOf(c2).ferme_raison, 'plafond_retire');
  const d = v.events('vigie_console_droits').at(-1);
  assert.deepEqual(d.detail, { objet: 'plafond', avant: 'admin', apres: null, effectif: null });
  assert.equal(d.sub, 'sub-seb');
  assert.equal(v.alerts().find(a => a.regle === 'sigma.console_droits')?.gravite, 'haut');
});

test('deux clés : arrivée sans attribution → Lectrice (DS29) ; attribution par un Administrateur, garde-fous ; amorce ; une seule clé', async t => {
  const v = setup(t);
  const camille = await v.login({ sub: 'sub-camille', nom: 'Camille', roles: ['vigie.analyst'], email: 'camille@exemple.org' });
  assert.ok(camille.cookie);
  const arr = v.events('vigie_console_arrivee');
  assert.equal(arr.length, 1);
  assert.equal(arr[0].sub, 'sub-camille');
  assert.deepEqual(arr[0].detail, { plafond: 'analyst', effectif: 'viewer', nom: 'Camille' });
  assert.equal(v.alerts().find(a => a.regle === 'sigma.console_arrivee')?.gravite, 'moyen');
  const r = v.c.rights;
  assert.equal(r.effective('sub-camille', 'analyst'), 'viewer');
  assert.throws(() => r.assign({ par: 'sub-camille', parRole: 'viewer', sub: 'sub-camille', role: 'admin' }), RightsError);
  assert.throws(() => r.assign({ par: 'sub-seb', parRole: 'admin', sub: 'sub-seb', role: 'viewer' }), /propre rôle/);
  assert.throws(() => r.assign({ par: 'sub-x', parRole: 'admin', sub: 'sub-seb', role: 'analyst' }), /amorce/);
  assert.throws(() => r.assign({ par: 'sub-seb', parRole: 'admin', sub: 'sub-inconnu', role: 'analyst' }), /jamais connecté/);
  assert.equal(r.assign({ par: 'sub-seb', parRole: 'admin', sub: 'sub-camille', role: 'admin' }), true);
  // Le plus faible des deux : plafond Analyste, attribution Administrateur → Analyste.
  assert.equal(r.effective('sub-camille', 'analyst'), 'analyst');
  const d = v.events('vigie_console_droits').at(-1);
  assert.equal(d.emetteur, 'console · sub-seb');
  assert.deepEqual(d.detail, { objet: 'attribution', avant: null, apres: 'admin', effectif: 'analyst' });
  // Amorce : toujours Administrateur côté Vigie, jamais au-dessus du plafond.
  assert.equal(r.effective('sub-seb', 'viewer'), 'viewer');
  assert.equal(r.effective('sub-seb', null), null);
  // Second passage : pas de nouvelle arrivée.
  await v.login({ sub: 'sub-camille', roles: ['vigie.analyst'], email: 'camille@exemple.org' });
  assert.equal(v.events('vigie_console_arrivee').length, 1);
  assert.equal(r.list().find(x => x.sub === 'sub-camille').effectif, 'analyst');
});

test('une seule clé (VIGIE_ROLES=zitadel) : l’attribution suit le plafond, pas d’arrivée signalée, attribution refusée', async t => {
  const v = setup(t, { roles: 'zitadel' });
  await v.login({ sub: 'sub-camille', roles: ['vigie.handler'], email: 'camille@exemple.org' });
  assert.equal(v.events('vigie_console_arrivee').length, 0);
  assert.equal(v.c.rights.effective('sub-camille', 'handler'), 'handler');
  assert.throws(() => v.c.rights.assign({ par: 'sub-seb', parRole: 'admin', sub: 'sub-camille', role: 'admin' }), /zitadel/);
});

test('formulaires : jeton CSRF de la session et même origine ; sortie : session fermée, Zitadel déconnecté', async t => {
  const v = setup(t);
  const { cookie } = await v.login();
  const s = v.sessionOf(cookie);
  const post = (body, extra = {}) => v.app.inject({ method: 'POST', url: '/auth/logout', headers: { ...v.h(), 'content-type': 'application/x-www-form-urlencoded', ...extra },
    cookies: { '__Host-vigie': cookie }, payload: new URLSearchParams(body).toString() });
  assert.equal((await post({})).statusCode, 403);
  assert.equal((await post({ _csrf: 'x'.repeat(s.csrf.length) })).statusCode, 403);
  assert.equal((await post({ _csrf: s.csrf }, { 'sec-fetch-site': 'cross-site' })).statusCode, 403);
  assert.equal((await post({ _csrf: s.csrf }, { origin: 'https://evil.example' })).statusCode, 403);
  assert.equal((await post({ _csrf: s.csrf }, { origin: 'https://vigie.example', 'sec-fetch-site': 'same-site' })).statusCode, 403);
  // Jeton absent ou faux, Origin étrangère : refus CSRF ; Sec-Fetch-Site d'un autre site : arrêté avant, par la provenance.
  assert.equal(v.events('vigie_console_refus').filter(e => e.detail.raison === 'csrf').length, 3);
  assert.equal(v.events('vigie_console_refus').filter(e => e.detail.raison === 'provenance').length, 1);
  assert.equal(v.sessionOf(cookie).ferme_a, null);
  // Chromium, avec « no-referrer » : Origin « null », Sec-Fetch-Site « same-origin ».
  const out = await post({ _csrf: s.csrf }, { origin: 'null', 'sec-fetch-site': 'same-origin' });
  assert.equal(out.statusCode, 302);
  assert.equal(out.headers.location, 'https://idp.example/logout');
  assert.equal(v.sessionOf(cookie).ferme_raison, 'sortie');
  assert.equal(v.events('vigie_console_sortie').length, 1);
  assert.equal((await v.app.inject({ url: '/alertes', headers: v.h(), cookies: { '__Host-vigie': cookie } })).statusCode, 302);
});

test('actions : droit de l’action, plafond relu à l’instant, ré-authentification de moins de 5 minutes, par le même compte', async t => {
  const v = setup(t);
  v.app.post('/essai', async (req, reply) => {
    if (!(await v.c.guard(req, reply, 'actions_forcees', { reauth: true, libelle: 'Bloquer une adresse' }))) return reply;
    return 'fait';
  });
  const { cookie } = await v.login();
  const s = v.sessionOf(cookie);
  const post = (url = '/essai', body = {}) => v.app.inject({ method: 'POST', url, headers: { ...v.h(), 'content-type': 'application/x-www-form-urlencoded' },
    cookies: { '__Host-vigie': cookie }, payload: new URLSearchParams({ _csrf: s.csrf, ...body }).toString() });
  const calls = v.zitadel.calls;
  assert.equal((await post()).body, 'fait', 'connexion de moins de 5 minutes');
  assert.equal(v.zitadel.calls, calls + 1, 'plafond relu avant l’action');
  v.clock.t += 6 * 60e3;
  const need = await post('/essai', { retour: '/alertes/7' });
  assert.equal(need.statusCode, 401, 'ré-authentification demandée');
  // Ré-authentification avec un autre compte : refusée, la session reste ouverte.
  const go = await post('/reauth', { retour: '/alertes/7' });
  assert.equal(go.statusCode, 302);
  assert.equal(v.oidc.starts.at(-1).reauth, true);
  const st = go.cookies.find(x => x.name === '__Host-vigie-tx').value;
  v.oidc.claims = { sub: 'sub-julien', nom: 'Julien', amr: ['user', 'mfa'], authTime: v.clock.t, roles: ['vigie.admin'] };
  const autre = await v.app.inject({ url: `/auth/callback?code=c&state=${st}`, headers: v.h(), cookies: { '__Host-vigie-tx': st } });
  assert.equal(autre.statusCode, 403);
  assert.equal(v.events('vigie_console_refus').at(-1).detail.raison, 'reauth_autre');
  assert.equal(v.sessionOf(cookie).ferme_a, null);
  // Même compte, authentification faite à l'instant : retour à la page, l'action passe.
  const go2 = await post('/reauth', { retour: '/alertes/7' });
  const st2 = go2.cookies.find(x => x.name === '__Host-vigie-tx').value;
  v.oidc.claims = { sub: 'sub-seb', nom: 'Sébastien', amr: ['user', 'mfa'], authTime: v.clock.t, roles: ['vigie.admin'] };
  const ok = await v.app.inject({ url: `/auth/callback?code=c&state=${st2}`, headers: v.h(), cookies: { '__Host-vigie-tx': st2 } });
  assert.equal(ok.statusCode, 302);
  assert.equal(ok.headers.location, '/alertes/7');
  assert.equal((await post()).body, 'fait');
  // Plafond abaissé dans Zitadel à Lecteur : l'action est refusée dès la requête suivante.
  v.ceilings['sub-seb'] = 'viewer';
  assert.equal((await post()).statusCode, 403);
  // Zitadel injoignable : rien n'est fait.
  v.ceilings['sub-seb'] = 'admin';
  v.zitadel.fail = true;
  assert.equal((await post()).statusCode, 503);
});

test('droits : actions par rôle (annexe § 5.4), plafond tiré des rôles, relecture par l’API de gestion de Zitadel', async () => {
  assert.equal(can('viewer', 'voir'), true);
  assert.equal(can('viewer', 'adresses_completes'), false);
  assert.equal(can('handler', 'actions_forcees'), true);
  assert.equal(can('handler', 'exporter'), false);
  assert.equal(can('analyst', 'reglages'), true);
  assert.equal(can('analyst', 'droits'), false);
  assert.equal(can('admin', 'droits'), true);
  assert.throws(() => can('admin', 'tout'), /inconnue/);
  assert.equal(ceilingOf(['vigie.viewer', 'vigie.analyst', 'admin']), 'analyst');
  assert.equal(ceilingOf(['vigie.root', 'Vigie.admin']), null);
  const calls = [];
  const api = async (p, o) => {
    calls.push([p, o]);
    if (p.startsWith('/management/v1/users/') && o.method === 'GET') return { user: { state: p.includes('inactif') ? 'USER_STATE_INACTIVE' : 'USER_STATE_ACTIVE' } };
    return { result: [
      { userId: 'u1', projectId: '100', roleKeys: ['vigie.handler'], state: 'USER_GRANT_STATE_ACTIVE' },
      { userId: 'u1', projectId: '999', roleKeys: ['vigie.admin'] },
      { userId: 'u1', projectId: '100', roleKeys: ['vigie.admin'], state: 'USER_GRANT_STATE_INACTIVE' },
    ] };
  };
  const read = createCeilingReader({ api, projectId: '100', orgId: '200' });
  assert.equal(await read('u1'), 'handler');
  assert.equal(calls[1][1].org, '200');
  assert.deepEqual(calls[1][1].body.queries, [{ userIdQuery: { userId: 'u1' } }, { projectIdQuery: { projectId: '100' } }]);
  assert.equal(await read('inactif'), null);
});

test('retour après connexion : chemin local seulement', () => {
  assert.equal(safeRetour('/alertes/7?x=1'), '/alertes/7?x=1');
  for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', '/\t/evil.example', '/auth/logout', undefined, ['/a'], '/a b']) assert.equal(safeRetour(bad), '/', JSON.stringify(bad));
});

test('configuration : console facultative, exigences complètes quand elle est ouverte', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-console-cfg-'));
  const secret = path.join(dir, 'console-secret');
  fs.writeFileSync(secret, 's'.repeat(40));
  const base = { VIGIE_INGEST_KEY: 'k'.repeat(32), VIGIE_LOG_KEY: 'l'.repeat(32), VIGIE_DECISIONS_PRIVATE_KEY: VIGIE_KEYS.priv64, VIGIE_SITE_BACKUP_DIR: dir, VIGIE_DATA_DIR: dir };
  assert.equal(loadVigieConfig(base).console, null);
  const full = { ...base, VIGIE_ZITADEL_ISSUER: 'https://nicephos.zitadel.cloud', VIGIE_ZITADEL_KEY_FILE: '/secrets/zitadel.json', VIGIE_CONSOLE_CLIENT_ID: '345678901234567890@vigie',
    VIGIE_CONSOLE_PROJECT_ID: '345678901234567000', VIGIE_CONSOLE_ORG_ID: '345678901234560000', VIGIE_CONSOLE_SECRET_FILE: secret, VIGIE_ACCESS_TEAM: TEAM, VIGIE_ACCESS_AUD: AUD, VIGIE_ADMIN_SUBS: 'sub-seb, sub-julien' };
  const c = loadVigieConfig(full).console;
  assert.deepEqual(c.adminSubs, ['sub-seb', 'sub-julien']);
  assert.equal(c.port, 4200);
  assert.equal(c.roles, 'deux-cles');
  for (const [k, v, re] of [['VIGIE_ZITADEL_ISSUER', '', /VIGIE_ZITADEL_ISSUER/], ['VIGIE_ACCESS_AUD', '', /VIGIE_ACCESS_AUD/], ['VIGIE_ACCESS_TEAM', '', /VIGIE_ACCESS_TEAM/],
    ['VIGIE_ADMIN_SUBS', ' , ', /VIGIE_ADMIN_SUBS/], ['VIGIE_CONSOLE_SECRET_FILE', path.join(dir, 'absent'), /SECRET_FILE/], ['VIGIE_ROLES', 'tous', /VIGIE_ROLES/],
    ['VIGIE_CONSOLE_PROJECT_ID', 'abc', /PROJECT_ID/], ['VIGIE_CONSOLE_ORG_ID', '', /ORG_ID/]]) {
    assert.throws(() => loadVigieConfig({ ...full, [k]: v }), re, k);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('bandeau des critiques : en tête des pages en session (pas sur la vue d’ensemble), sans intervenant seulement', async t => {
  const v = setup(t);
  const { cookie } = await v.login();
  const get = url => v.app.inject({ url, headers: v.h(), cookies: { '__Host-vigie': cookie } });
  assert.doesNotMatch((await get('/sante')).body, /vg-bandeau/);
  const ins = v.db.prepare("INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, statut, premiere, derniere) VALUES ('sigma.chaine_rompue', 'DS8', 'vigie', 'chaine', 'critique', ?, ?, ?, ?)");
  ins.run('alerter', 'ouverte', v.clock.t, v.clock.t);
  ins.run('observer', 'ouverte', v.clock.t, v.clock.t);
  ins.run('alerter', 'en_cours', v.clock.t, v.clock.t);
  const page = (await get('/sante')).body;
  assert.match(page, /class="vg-bandeau" role="alert"/);
  assert.match(page, /1 alerte critique sans intervenant/);
  assert.match(page, /href="\/alertes\/1"/);
  assert.doesNotMatch((await get('/')).body, /class="vg-bandeau"/);
});

test('provenance (audit D3-A1) : une image ou une feuille chargée depuis le site frère est refusée, sans prolonger la session ; l’export seulement depuis la console', async t => {
  const v = setup(t);
  const { cookie } = await v.login();
  const get = (url, extra) => v.app.inject({ url, headers: { ...v.h(), ...extra }, cookies: { '__Host-vigie': cookie } });
  const avant = v.sessionOf(cookie).vu_a;
  v.clock.t += 60e3;
  for (const dest of ['image', 'style', 'script', 'empty']) {
    const r = await get('/', { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': dest });
    assert.equal(r.statusCode, 403, dest);
  }
  assert.equal(v.sessionOf(cookie).vu_a, avant, 'session non prolongée');
  assert.equal(v.events('vigie_console_refus').filter(e => e.detail.raison === 'provenance').length, 1, 'noté une fois par 10 minutes');
  // Navigation de page depuis l'admin du site (« Ouvrir la Vigie ») : acceptée ; adresse tapée : acceptée.
  assert.equal((await get('/', { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })).statusCode, 200);
  assert.equal((await get('/', { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })).statusCode, 200);
  // Export : même une navigation depuis le site frère est refusée.
  assert.equal((await get('/evenements.csv', { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })).statusCode, 403);
  assert.equal((await get('/evenements.csv', { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })).statusCode, 403);
  assert.equal((await get('/evenements.csv', { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })).statusCode, 200);
});

test('clés Access (audit D3-A2/D3-D1) : une lecture à la fois, en tâche de fond après une heure ; relecture en échec : clés connues gardées 24 h', async () => {
  const clock = { t: START };
  let fetches = 0, panne = false;
  const v = createAccessVerifier({ team: TEAM, aud: AUD, now: () => clock.t, fetchImpl: async () => {
    fetches += 1; await new Promise(r => setTimeout(r, 5));
    if (panne) throw new Error('getaddrinfo EAI_AGAIN');
    return new Response(JSON.stringify(CERTS));
  } });
  // Première lecture partagée par des requêtes simultanées.
  const r = await Promise.allSettled(Array.from({ length: 10 }, () => v.verify(accessJwt(clock))));
  assert.ok(r.every(x => x.status === 'fulfilled'));
  assert.equal(fetches, 1);
  // Deux heures plus tard, Cloudflare injoignable : les jetons signés par les clés connues passent, une seule relecture
  // par minute est tentée, sans faire attendre la requête.
  panne = true;
  clock.t += 2 * 3600e3;
  const r2 = await Promise.allSettled(Array.from({ length: 10 }, () => v.verify(accessJwt(clock))));
  assert.ok(r2.every(x => x.status === 'fulfilled'), 'clés connues gardées');
  await new Promise(res => setTimeout(res, 20));
  assert.equal(fetches, 2);
  await v.verify(accessJwt(clock));
  assert.equal(fetches, 2, 'au plus une relecture par minute');
  // Au-delà de 24 h sans relecture réussie : refus.
  clock.t += 23 * 3600e3;
  await assert.rejects(v.verify(accessJwt(clock)), /EAI_AGAIN/);
});

test('Zitadel en échec (audit D3-D6) : pas de nouvel essai avant une minute, la lecture continue sur le dernier plafond, aucune action', async t => {
  const v = setup(t);
  const { cookie } = await v.login();
  const get = () => v.app.inject({ url: '/alertes', headers: v.h(), cookies: { '__Host-vigie': cookie } });
  v.zitadel.fail = true;
  v.clock.t += 6 * 60e3;
  const c0 = v.zitadel.calls;
  for (let i = 0; i < 5; i++) { assert.equal((await get()).statusCode, 200); v.clock.t += 5e3; }
  assert.equal(v.zitadel.calls, c0 + 1, 'un seul essai dans la minute');
  v.clock.t += 60e3;
  await get();
  assert.equal(v.zitadel.calls, c0 + 2, 'nouvel essai passée la minute');
});

test('session (audit D3-A3 à A6) : jeton CSRF multi-octets refusé et noté, cookies effacés avec Secure, ré-authentification sans auth_time refusée, compte supprimé chez Zitadel', async t => {
  const v = setup(t);
  const { cookie } = await v.login();
  const r = await v.app.inject({ method: 'POST', url: '/auth/logout', headers: { ...v.h(), 'content-type': 'application/x-www-form-urlencoded' }, cookies: { '__Host-vigie': cookie }, payload: `_csrf=${encodeURIComponent('é'.repeat(32))}` });
  assert.equal(r.statusCode, 403);
  assert.equal(v.events('vigie_console_refus').at(-1).detail.raison, 'csrf');
  const s = v.sessionOf(cookie);
  const out = await v.app.inject({ method: 'POST', url: '/auth/logout', headers: { ...v.h(), 'content-type': 'application/x-www-form-urlencoded' }, cookies: { '__Host-vigie': cookie }, payload: `_csrf=${s.csrf}` });
  const efface = out.cookies.find(c => c.name === '__Host-vigie');
  assert.ok(efface.secure && efface.maxAge === 0, 'effacement avec Secure');
  // Ré-authentification dont le jeton n'a pas auth_time : refusée.
  const { cookie: c2 } = await v.login();
  const s2 = v.sessionOf(c2);
  const go = await v.app.inject({ method: 'POST', url: '/reauth', headers: { ...v.h(), 'content-type': 'application/x-www-form-urlencoded' }, cookies: { '__Host-vigie': c2 }, payload: `_csrf=${s2.csrf}&retour=/decisions` });
  const st = go.cookies.find(x => x.name === '__Host-vigie-tx').value;
  v.oidc.claims = { sub: 'sub-seb', nom: 'Sébastien', amr: ['user', 'mfa'], authTime: null, roles: ['vigie.admin'] };
  const back = await v.app.inject({ url: `/auth/callback?code=c&state=${st}`, headers: v.h(), cookies: { '__Host-vigie-tx': st } });
  assert.equal(back.statusCode, 403);
  assert.equal(v.events('vigie_console_refus').at(-1).detail.raison, 'reauth_ancienne');
});
