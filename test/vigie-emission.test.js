import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup } from './helpers.js';
import { loadConfig } from '../server/config.js';
import { openDb, migrate } from '../server/db/index.js';
import { buildApp } from '../server/app.js';
import { createVault } from '../server/vault.js';
import { createSecurite } from '../server/securite/index.js';
import { scanValue, uaFamily } from '../server/securite/detection.js';
import { EVENTS } from '../server/securite/vocabulaire.js';

// Vigie, phase A (docs/etudes/annexe-vigie-architecture.md) : le site émet ses événements de sécurité, signés, vers la
// Vigie ; sans VIGIE_URL, rien ne change.
const TOKEN = 'jeton-de-test-0123456789';
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const VIGIE = { VIGIE_URL: 'http://vigie.test:4100', VIGIE_INGEST_KEY: KEY, LOCAL_AUTH_TOKEN: TOKEN };
const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

// Vigie simulée : vérifie la signature de chaque lot comme le fera la vraie, et garde les événements reçus.
function fakeVigie({ down = false } = {}) {
  const v = { lots: [], events: [], down, headers: [] };
  v.send = async (body, headers) => {
    if (v.down) throw new Error('injoignable');
    const expected = crypto.createHmac('sha256', KEY).update(`${headers['x-vigie-ts']}.${headers['x-vigie-nonce']}.${body}`).digest('hex');
    assert.equal(headers['x-vigie-sig'], expected, 'signature du lot');
    const parsed = JSON.parse(body);
    assert.equal(parsed.emetteur, 'site');
    v.lots.push(body); v.headers.push(headers); v.events.push(...parsed.lot);
  };
  v.of = type => v.events.filter(e => e.type === type);
  return v;
}

async function withVigie(t, { env = {}, vigie = fakeVigie() } = {}) {
  const ctx = await setup(t, { seeded: true, env: { ...VIGIE, ...env }, vigieOptions: { send: vigie.send, timers: false } });
  const flush = async () => { ctx.app.securite.runTasks(); ctx.app.securite.retryNow(); await ctx.app.securite.flush(); return vigie; };
  const login = async (ua = UA_MAC, ip = '203.0.113.7') => {
    const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', remoteAddress: ip, headers: { 'user-agent': ua }, payload: { token: TOKEN, author: 'julien', next: '/admin' } });
    assert.equal(res.statusCode, 303);
    return cookiesOf(res);
  };
  return { ...ctx, vigie, flush, login };
}

test('sans Vigie : rien n’est émis ni gardé, le site reste le même', async t => {
  const { app, db, dir } = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, VIGIE_URL: '' } });
  assert.equal(app.securite.enabled, false);
  const res = await app.inject({ method: 'POST', url: '/auth/local', headers: { 'user-agent': UA_MAC }, payload: { token: TOKEN, author: 'julien' } });
  assert.equal(res.statusCode, 303);
  assert.deepEqual(db.prepare('SELECT ctx_ip, ctx_net, ctx_country, ctx_ua FROM sessions').get(), { ctx_ip: null, ctx_net: null, ctx_country: null, ctx_ua: null });
  assert.equal((await app.inject('/.env')).statusCode, 404);
  assert.doesNotMatch((await app.inject('/robots.txt')).body, /tout-telecharger/);
  assert.doesNotMatch((await app.inject('/')).body, /tout-telecharger/);
  assert.doesNotMatch((await app.inject('/confidentialite')).body, /Journal de sécurité/);
  assert.equal(db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE name = 'vigie_sessions_revoked'").pluck().get(), 0);
  assert.equal(fs.existsSync(path.join(dir, 'securite-attente')), false);
});

test('Vigie retirée : déclencheur, sessions fermées, contexte et événements en attente effacés au démarrage', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { STORAGE_DIR: dir, DATABASE_PATH: path.join(dir, 't.db'), TSA_URL: 'off' };
  const open = async extra => { const config = loadConfig({ ...env, ...extra }); const db = openDb(config.databasePath); migrate(db);
    const app = await buildApp({ config, db, logger: false, vigieOptions: { send: async () => { throw new Error('hors ligne'); }, timers: false }, instagramOptions: { manual: true }, faceOptions: { manual: true, detector: { detect: async () => [] } }, seriesOptions: { manual: true }, describeOptions: { manual: true } });
    await app.ready(); return { app, db }; };
  let { app, db } = await open({ VIGIE_URL: 'http://vigie.test', VIGIE_INGEST_KEY: KEY });
  db.prepare("INSERT INTO sessions (id, sub, csrf, created_at, expires_at, ctx_ip, ctx_ua) VALUES ('h', 's', 'c', 1, 9e15, '1.2.3.4', 'Safari · macOS')").run();
  db.prepare("DELETE FROM sessions WHERE id = 'h'").run();
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions_revoked').pluck().get(), 1);
  db.prepare("INSERT INTO sessions (id, sub, csrf, created_at, expires_at, ctx_ip, ctx_ua) VALUES ('k', 's', 'c', 1, 9e15, '1.2.3.4', 'Safari · macOS')").run();
  app.securite.emit('sys_error', {});
  await app.securite.flush();
  assert.ok(fs.readdirSync(path.join(dir, 'securite-attente')).length >= 1, 'lot gardé en attente');
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('vigie_comptes_vus', '7')").run();
  await app.close(); db.close();

  ({ app, db } = await open({}));
  t.after(async () => { await app.close(); db.close(); });
  assert.equal(app.securite.enabled, false);
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions_revoked').pluck().get(), 0);
  assert.equal(db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE name = 'vigie_sessions_revoked'").pluck().get(), 0);
  assert.deepEqual(db.prepare("SELECT ctx_ip, ctx_ua FROM sessions WHERE id = 'k'").get(), { ctx_ip: null, ctx_ua: null });
  assert.equal(fs.existsSync(path.join(dir, 'securite-attente')), false);
  // Repères sans donnée personnelle gardés : une Vigie remise en route reprend où elle en était.
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'vigie_comptes_vus'").pluck().get(), '7');
});

test('configuration : VIGIE_URL exige une clé de signature d’au moins 32 caractères et une adresse simple', () => {
  assert.throws(() => loadConfig({ VIGIE_URL: 'http://vigie:4100' }), /VIGIE_INGEST_KEY est obligatoire/);
  assert.throws(() => loadConfig({ VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'court' }), /au moins 32/);
  assert.throws(() => loadConfig({ VIGIE_URL: 'ftp://vigie', VIGIE_INGEST_KEY: KEY }), /http/);
  assert.throws(() => loadConfig({ VIGIE_URL: 'http://u:p@vigie:4100', VIGIE_INGEST_KEY: KEY }), /adresse simple/);
  assert.deepEqual(loadConfig({ VIGIE_URL: 'http://vigie:4100/', VIGIE_INGEST_KEY: KEY }).vigie, { url: 'http://vigie:4100', ingestKey: KEY });
  assert.equal(loadConfig({}).vigie, null);
});

test('connexion : succès, session créée avec son contexte, lots signés, jamais de jeton dans les événements', async t => {
  const c = await withVigie(t);
  const cookies = await c.login();
  const ctx = c.db.prepare('SELECT ctx_ip, ctx_net, ctx_ua FROM sessions').get();
  assert.deepEqual(ctx, { ctx_ip: null, ctx_net: '203.0.113.0', ctx_ua: 'Safari · macOS' }, 'réseau et navigateur, pas l’adresse complète');
  const v = await c.flush();
  const ok = v.of('authn_login_success')[0];
  assert.equal(ok.sub, 'local:julien');
  assert.equal(ok.ip, '203.0.113.7');
  assert.equal(ok.origine.composant, 'site · connexion');
  assert.equal(ok.detail.methode, 'test');
  assert.equal(v.of('session_created').length, 1);
  assert.ok(v.of('sys_startup').length === 1 && v.of('sys_state').length >= 1);
  const all = v.lots.join('\n');
  for (const secret of [...Object.values(cookies), TOKEN, c.db.prepare('SELECT csrf FROM sessions').pluck().get()]) assert.ok(!all.includes(secret), 'aucun jeton dans les lots');
  // Mauvais jeton de test : échec signalé.
  await c.app.inject({ method: 'POST', url: '/auth/local', payload: { token: 'mauvais-jeton-0123456789', author: 'julien' } });
  assert.equal((await c.flush()).of('authn_login_fail').length, 1);
});

test('session : cookie rejoué après la déconnexion, session reprise depuis un autre navigateur', async t => {
  const c = await withVigie(t);
  const cookies = await c.login(UA_MAC);
  // Même session, autre navigateur et autre réseau : signalé une fois.
  await c.app.inject({ url: '/admin', cookies, remoteAddress: '198.51.100.9', headers: { 'user-agent': UA_WIN } });
  await c.app.inject({ url: '/admin', cookies, remoteAddress: '198.51.100.9', headers: { 'user-agent': UA_WIN } });
  let v = await c.flush();
  const moved = v.of('session_context_change');
  assert.equal(moved.length, 1);
  assert.equal(moved[0].severity, 'haut');
  assert.deepEqual(moved[0].detail.navigateur, { avant: 'Safari · macOS', apres: 'Chrome · Windows' });

  const csrf = c.db.prepare('SELECT csrf FROM sessions').pluck().get();
  await c.app.inject({ method: 'POST', url: '/auth/logout', cookies, headers: { 'user-agent': UA_MAC }, remoteAddress: '203.0.113.7', payload: { _csrf: csrf } });
  // Requête partie juste avant la fermeture : ignorée.
  await c.app.inject({ url: '/admin', cookies, remoteAddress: '203.0.113.7', headers: { 'user-agent': UA_MAC } });
  v = await c.flush();
  assert.equal(v.of('session_destroyed').length, 1);
  assert.equal(v.of('session_use_after_expire').length, 0);
  // Une minute plus tard, depuis ailleurs : cookie copié.
  c.db.prepare('UPDATE sessions_revoked SET revoked_at = revoked_at - 60000').run();
  await c.app.inject({ url: '/admin', cookies, remoteAddress: '198.51.100.9', headers: { 'user-agent': UA_WIN } });
  v = await c.flush();
  const replay = v.of('session_use_after_expire');
  assert.equal(replay.length, 1);
  assert.equal(replay[0].severity, 'haut');
  assert.equal(replay[0].sub, 'local:julien');
  assert.equal(replay[0].detail.meme_reseau_et_navigateur, false);
});

test('saisies malveillantes, méthodes inattendues, pièges, rafales de 404, CSRF et refus de droit', async t => {
  const c = await withVigie(t);
  await c.app.inject({ url: `/recherche?q=${encodeURIComponent("' union select password from users --")}`, remoteAddress: '192.0.2.10' });
  await c.app.inject({ url: '/recherche?q=l%27aube%2C%20aujourd%27hui%20%3C3', remoteAddress: '192.0.2.10' });
  await c.app.inject({ url: '/', remoteAddress: '192.0.2.11', headers: { 'user-agent': 'sqlmap/1.8' } });
  await c.app.inject({ method: 'PUT', url: '/', remoteAddress: '192.0.2.12' });
  assert.equal((await c.app.inject({ url: '/.env', remoteAddress: '192.0.2.13' })).statusCode, 404);
  // Même réponse qu'une vraie page introuvable, quel que soit le corps envoyé.
  const xml = await c.app.inject({ method: 'POST', url: '/xmlrpc.php', remoteAddress: '192.0.2.13', headers: { 'content-type': 'text/xml' }, payload: '<methodCall/>' });
  assert.equal(xml.statusCode, 404);
  assert.equal((await c.app.inject({ url: '/galerie/tout-telecharger', remoteAddress: '192.0.2.13' })).statusCode, 404);
  for (let i = 0; i < 21; i++) await c.app.inject({ url: `/introuvable-${i}`, remoteAddress: '192.0.2.14' });
  let v = await c.flush();
  const inputs = v.of('malicious_input');
  assert.equal(inputs.length, 2, 'la saisie ordinaire (apostrophes, « <3 ») ne compte pas');
  assert.deepEqual(inputs[0].detail.familles, ['sql']);
  assert.equal(inputs[0].detail.constats[0].champ, 'query.q');
  assert.deepEqual(inputs[1].detail.familles, ['outil']);
  assert.equal(v.of('input_validation_fail')[0].detail.methode, 'PUT');
  assert.deepEqual(v.of('malicious_honeypot').map(e => e.detail.piege), ['chemin de scanner', 'chemin de scanner', 'lien caché']);
  assert.equal(v.of('malicious_excess_404').length, 1);
  assert.match((await c.app.inject('/robots.txt')).body, /Disallow: \/galerie\/tout-telecharger/);
  assert.match((await c.app.inject('/')).body, /<a href="\/galerie\/tout-telecharger" rel="nofollow" hidden tabindex="-1" aria-hidden="true">/);

  // Depuis une session de l'admin : « haut ». CSRF faux, droit refusé.
  const cookies = await c.login();
  await c.app.inject({ url: '/admin/photos?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E', cookies });
  await c.app.inject({ method: 'POST', url: '/admin/reglages', cookies, payload: { _csrf: 'faux' } });
  c.db.prepare("UPDATE accounts SET roles = '[\"relecteur\"]' WHERE sub = 'local:julien'").run();
  await c.app.inject({ url: '/admin/comptes', cookies });
  v = await c.flush();
  const adminInput = v.of('malicious_input').at(-1);
  assert.equal(adminInput.severity, 'haut');
  assert.equal(adminInput.sub, 'local:julien');
  assert.equal(v.of('authz_csrf_fail').length, 1);
  assert.equal(v.of('authz_fail').at(-1).detail.permission, 'comptes.gerer');
});

test('comptes : changement par l’application (ticket) et changement hors application (critique)', async t => {
  const c = await withVigie(t);
  const cookies = await c.login();
  const csrf = c.db.prepare('SELECT csrf FROM sessions').pluck().get();
  c.app.accounts.login({ sub: 'zitadel-camille', name: 'Camille' });
  const camille = c.app.accounts.bySub('zitadel-camille');
  await c.app.inject({ method: 'POST', url: `/admin/comptes/${camille.id}`, cookies, headers: { accept: 'text/html' }, payload: { _csrf: csrf, roles: ['admin'], author_id: '' } });
  let v = await c.flush();
  const created = v.of('user_created').find(e => e.detail.compte === 'zitadel-camille');
  assert.equal(created.detail.hors_application, false);
  const granted = v.of('privilege_permissions_changed').find(e => e.detail.compte === 'zitadel-camille');
  assert.equal(granted.severity, 'haut');
  assert.equal(granted.sub, 'local:julien');
  assert.equal(granted.detail.administrateur_donne, true);
  assert.equal(granted.detail.action, 'compte modifié');
  assert.equal(granted.origine.emetteur, 'server/accounts.js · compte modifié');

  // Quelqu'un passe par la base : la ligne est notée par le déclencheur, sans ticket.
  c.app.accounts.login({ sub: 'zitadel-intrus', name: 'Intrus' });
  c.db.prepare("UPDATE accounts SET roles = '[\"admin\"]', status = 'actif' WHERE sub = 'zitadel-intrus'").run();
  v = await c.flush();
  const outside = v.of('privilege_permissions_changed').find(e => e.detail.compte === 'zitadel-intrus');
  assert.equal(outside.severity, 'critique');
  assert.equal(outside.detail.hors_application, true);
  assert.equal(outside.origine.emetteur, 'base de données · déclencheur (hors application)');
  assert.ok(v.of('sys_state').at(-1).detail.administrateurs.includes('zitadel-intrus'));

  // Déclencheur supprimé : l'état le dit, critique.
  c.db.exec('DROP TRIGGER account_changes_update');
  v = await c.flush();
  const st = v.of('sys_state').at(-1);
  assert.equal(st.severity, 'critique');
  assert.deepEqual(st.detail.declencheurs_absents, ['account_changes_update']);
});

test('démarrage : configuration changée et restauration signalées', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { STORAGE_DIR: dir, DATABASE_PATH: path.join(dir, 't.db'), TSA_URL: 'off', ...VIGIE };
  const start = async (extra, vigie) => { const config = loadConfig({ ...env, ...extra }); const db = openDb(config.databasePath); migrate(db);
    const app = await buildApp({ config, db, logger: false, vigieOptions: { send: vigie.send, timers: false }, instagramOptions: { manual: true }, faceOptions: { manual: true, detector: { detect: async () => [] } }, seriesOptions: { manual: true }, describeOptions: { manual: true } });
    await app.ready(); await app.securite.flush(); await app.close(); db.close(); return vigie; };
  let v = await start({ ADMIN_SUBS: 'sub-a' }, fakeVigie());
  assert.equal(v.of('sys_startup')[0].detail.premiere_fois, true);
  assert.equal(v.of('sys_config_changed').length, 0);
  const db = openDb(path.join(dir, 't.db'));
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('restauree_le', ?)").run(JSON.stringify({ at: 1, instantane: 'site-x.db' }));
  db.close();
  v = await start({ ADMIN_SUBS: 'sub-a,sub-b', DATA_KEY: 'k'.repeat(32) }, fakeVigie());
  const changes = v.of('sys_config_changed')[0].detail.changements;
  assert.deepEqual(changes.find(x => x.cle === 'ADMIN_SUBS'), { cle: 'ADMIN_SUBS', ajoutes: ['sub-b'], retires: [] });
  assert.deepEqual(changes.find(x => x.cle === 'DATA_KEY'), { cle: 'DATA_KEY', changement: 'ajoutée' });
  assert.ok(!JSON.stringify(changes).includes('k'.repeat(32)), 'aucune clé en clair');
  assert.equal(v.of('sys_restore')[0].detail.instantane, 'site-x.db');
  v = await start({ ADMIN_SUBS: 'sub-a,sub-b', DATA_KEY: 'k'.repeat(32) }, fakeVigie());
  assert.equal(v.of('sys_config_changed').length + v.of('sys_restore').length, 0, 'signalés une seule fois');
});

test('Vigie injoignable : lots gardés en attente, renvoyés au retour, marqués en retard', async t => {
  const vigie = fakeVigie({ down: true });
  const c = await withVigie(t, { vigie });
  c.app.securite.emit('sys_error', { emetteur: 'test' });
  await c.flush();
  const waiting = c.app.securite.spooled();
  assert.ok(waiting >= 1);
  // Pendant l'attente, rien ne part sur le réseau : la file va sur le disque, dans le même fichier.
  c.app.securite.emit('sys_error', { emetteur: 'test 2' });
  await c.app.securite.flush();
  assert.equal(c.app.securite.spooled(), waiting + 1);
  assert.equal(fs.readdirSync(path.join(c.dir, 'securite-attente')).length, 1);
  vigie.down = false;
  c.app.securite.retryNow();
  await c.app.securite.flush();
  assert.equal(c.app.securite.spooled(), 0);
  assert.equal(JSON.parse(vigie.lots.at(-1)).retard, true, 'renvoi marqué en retard dans le corps signé');
  assert.ok(vigie.of('sys_error').length >= 2);
  assert.equal(new Set(vigie.events.map(e => e.id)).size, vigie.events.length, 'identifiants uniques');
});

test('budget : par réseau et par type, jamais pour un compte connecté ni une connexion ; synthèse tout de suite', async t => {
  const c = await withVigie(t);
  const req = (url, extra = {}) => ({ ip: '192.0.2.50', headers: {}, method: 'GET', routeOptions: { url }, ...extra });
  for (let i = 0; i < 70; i++) c.app.securite.emit('token_guess', { request: req('/pour-vous/:token'), emetteur: 'test' });
  // Le budget d'un type épuisé ne fait pas taire les autres, ni ce qui touche un compte.
  c.app.securite.emit('malicious_honeypot', { request: req('/.env'), emetteur: 'test' });
  c.app.securite.emit('authn_login_success', { request: req('/auth/local'), sub: 'local:julien', emetteur: 'test' });
  for (let i = 0; i < 70; i++) c.app.securite.emit('sensitive_read', { request: req('/admin/personnes/:id', { session: { sub: 'local:julien', id: 'abc' } }), emetteur: 'test' });
  await c.app.securite.flush();
  assert.equal(c.vigie.of('token_guess').length, 60);
  assert.equal(c.vigie.of('malicious_honeypot').length, 1);
  assert.equal(c.vigie.of('authn_login_success').length, 1);
  assert.equal(c.vigie.of('sensitive_read').length, 70);
  assert.equal(c.vigie.of('malicious_excess_events')[0].detail.depasse, true, 'signalé dès le premier événement retenu');
  await c.app.securite.stop();
  assert.equal(c.vigie.of('malicious_excess_events').at(-1).detail.resumes, 10);
  // Un type inconnu est refusé sans erreur pour l'appelant.
  assert.equal(c.app.securite.emit('type_inconnu', {}), null);
});

test('déchiffrement impossible d’une donnée personnelle : signalé, regroupé par minute', async t => {
  const c = await withVigie(t);
  const sealed = createVault('a'.repeat(32)).seal('Camille');
  const other = createVault('b'.repeat(32));
  for (let i = 0; i < 5; i++) other.open(sealed);
  const v = await c.flush();
  assert.equal(v.of('crypto_decrypt_fail').length, 1);
  assert.equal(v.of('crypto_decrypt_fail')[0].detail.nature, 'texte');
});

test('lectures sensibles, page de confidentialité, jeton de photo offerte inconnu', async t => {
  const c = await withVigie(t);
  const cookies = await c.login();
  const jul = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const enc = c.db.prepare("INSERT INTO encounters (ref, author_id, created_at, updated_at) VALUES ('J-0042', ?, ?, ?)").run(jul, Date.now(), Date.now()).lastInsertRowid;
  assert.equal((await c.app.inject({ url: `/admin/rencontres/${enc}`, cookies })).statusCode, 200);
  const v = await c.flush();
  assert.equal(v.of('sensitive_read')[0].detail.cible, '/admin/rencontres/:id');
  assert.equal(v.of('sensitive_read')[0].detail.id, String(enc));
  assert.equal((await c.app.inject({ url: '/pour-vous/abcdefghijklmnopqrstuvwxyz0123456789', remoteAddress: '192.0.2.60' })).statusCode, 404);
  assert.equal((await c.flush()).of('token_guess')[0].detail.nature, 'lien de photo offerte');
  assert.match((await c.app.inject('/confidentialite')).body, /Journal de sécurité/);
  assert.match((await c.app.inject('/en/confidentialite')).body, /Security log/);
  assert.match((await c.app.inject('/de/confidentialite')).body, /Sicherheitsprotokoll/);
});

test('détection : motifs sans faux positifs sur des textes ordinaires ; familles de navigateurs', () => {
  for (const ok of ["l'aube sur la Seine", 'Aujourd’hui, 3 < 4', 'Prix : 12 $ (soit ~11 €)', 'Rue du Temple / Paris', 'f/2.8 · 1/250 s', '{titre}\n{légende}', 'C:/Photos']) {
    assert.equal(scanValue('body', 'legend', ok), null, ok);
  }
  assert.equal(scanValue('body', 'legend', '<% it.x %>').famille, 'gabarit');
  assert.equal(scanValue('query', 'next', '/a\r\nSet-Cookie: x').famille, 'journal');
  assert.equal(scanValue('body', 'legend', 'ligne 1\nligne 2'), null);
  assert.equal(scanValue('params', 'file', '../../etc/passwd').famille, 'chemin');
  assert.equal(scanValue('body', 'k', '__proto__').famille, 'prototype');
  assert.equal(uaFamily(UA_MAC), 'Safari · macOS');
  assert.equal(uaFamily(UA_WIN), 'Chrome · Windows');
  assert.equal(uaFamily('curl/8.4'), 'outil · autre');
  assert.equal(uaFamily(''), 'vide');
  // Vocabulaire : chaque type a une gravité connue.
  for (const [k, e] of Object.entries(EVENTS)) assert.ok(['info', 'bas', 'moyen', 'haut', 'critique'].includes(e.severity), k);
});

test('client : rien n’est envoyé sans clé valide côté Vigie (signature calculée sur horodatage, nonce et corps)', async () => {
  const seen = [];
  const sec = createSecurite({ url: 'http://v', key: KEY, storageDir: os.tmpdir(), timers: false, send: async (body, h) => seen.push({ body, h }) });
  sec.emit('sys_error', { emetteur: 'x' });
  await sec.flush();
  const { body, h } = seen[0];
  const forged = crypto.createHmac('sha256', 'autre-cle-0123456789-0123456789-xx').update(`${h['x-vigie-ts']}.${h['x-vigie-nonce']}.${body}`).digest('hex');
  assert.notEqual(h['x-vigie-sig'], forged);
  assert.match(h['x-vigie-nonce'], /^[0-9a-f]{32}$/);
});

// ---------- revue de la phase A (17 octobre 2026) ----------

test('revue : faux ticket, échange de sub, traces effacées — détectés ou refusés par la base', async t => {
  const c = await withVigie(t);
  await c.login();
  await c.flush();
  c.app.accounts.login({ sub: 'zitadel-intrus', name: 'Intrus' });
  // Ticket ouvert à la main avant de se donner le rôle : sans signature valide, il ne couvre rien.
  c.db.prepare("INSERT INTO account_change_tickets (at, action, by_sub) VALUES (1, 'compte modifié', 'local:julien')").run();
  c.db.prepare("UPDATE accounts SET roles = '[\"admin\"]', status = 'actif' WHERE sub = 'zitadel-intrus'").run();
  let v = await c.flush();
  const forged = v.of('privilege_permissions_changed').find(e => e.detail.compte === 'zitadel-intrus');
  assert.equal(forged.severity, 'critique');
  assert.equal(forged.detail.hors_application, true);
  assert.equal(forged.detail.ticket_falsifie, true);
  assert.equal(v.of('sys_state').at(-1).detail.tickets_ouverts, 1, 'le ticket resté ouvert est signalé');
  assert.equal(v.of('sys_state').at(-1).severity, 'critique');
  c.db.prepare('UPDATE account_change_tickets SET open = 0 WHERE open = 1').run();
  // Prendre l'identité d'un administrateur en changeant de sub.
  c.app.accounts.login({ sub: 'zitadel-camille', name: 'Camille' });
  c.db.prepare("UPDATE accounts SET sub = 'pris' WHERE sub = 'local:julien'").run();
  v = await c.flush();
  const swap = v.of('privilege_permissions_changed').find(e => e.detail.ancien_sub === 'local:julien');
  assert.equal(swap.detail.compte, 'pris');
  assert.match(swap.detail.champs, /sub/);
  assert.equal(swap.severity, 'critique');
  // Le journal ne se modifie ni ne s'efface (avant 13 mois), les tickets non plus.
  assert.throws(() => c.db.prepare("DELETE FROM account_changes").run(), /effacement interdit/);
  assert.throws(() => c.db.prepare("UPDATE account_changes SET ticket_id = 1").run(), /modification interdite/);
  assert.throws(() => c.db.prepare("UPDATE account_change_tickets SET by_sub = 'x'").run(), /modification interdite/);
  // Un déclencheur vidé sous le même nom : signalé comme modifié.
  c.db.exec(`DROP TRIGGER account_changes_conserve; CREATE TRIGGER account_changes_conserve BEFORE DELETE ON account_changes WHEN 0 BEGIN SELECT 1; END`);
  v = await c.flush();
  assert.deepEqual(v.of('sys_state').at(-1).detail.declencheurs_modifies, ['account_changes_conserve']);
});

test('revue : un changement par l’application reste couvert ; e-mail changé à la connexion noté avec ticket', async t => {
  const c = await withVigie(t);
  c.app.accounts.login({ sub: 'zitadel-camille', name: 'Camille', email: 'a@example.org' });
  c.app.accounts.login({ sub: 'zitadel-camille', name: 'Camille', email: 'b@example.org' });
  c.app.accounts.setNotify('zitadel-camille', { on: true, to: 'c@example.org' });
  const v = await c.flush();
  const rows = v.of('privilege_permissions_changed').filter(e => e.detail.compte === 'zitadel-camille');
  assert.deepEqual(rows.map(e => [e.detail.champs, e.detail.hors_application]), [['email', false], ['notification', false]]);
  assert.ok(!JSON.stringify(v.events).includes('b@example.org'), 'aucune adresse dans les événements');
});

test('revue : numéros du journal jamais réutilisés après la purge, curseur remis à zéro s’ils reculent', async t => {
  const c = await withVigie(t);
  c.app.accounts.login({ sub: 'a1', name: 'A' });
  c.app.accounts.login({ sub: 'a2', name: 'B' });
  await c.flush();
  const max = c.app.accounts.lastChangeId();
  c.db.exec('DROP TRIGGER account_changes_conserve');
  c.db.prepare('UPDATE account_changes SET at = 0 WHERE 0').run();
  c.db.exec('DROP TRIGGER account_changes_immuable');
  c.db.prepare('UPDATE account_changes SET at = 0').run();
  c.app.accounts.purgeChanges();
  assert.equal(c.app.accounts.lastChangeId(), max, 'la dernière ligne reste');
  // Journal vidé à la main : les numéros reculent, le curseur repart du début.
  c.db.prepare('DELETE FROM account_changes').run();
  c.db.prepare("UPDATE accounts SET roles = '[\"admin\"]', status = 'actif' WHERE sub = 'a2'").run();
  const v = await c.flush();
  assert.ok(v.of('privilege_permissions_changed').some(e => e.detail.compte === 'a2' && e.severity === 'critique'));
});

test('revue : une saisie de formulaire n’est jamais recopiée (données personnelles), seulement son champ et sa longueur', async t => {
  const c = await withVigie(t);
  await c.app.inject({ method: 'POST', url: '/bonjour', remoteAddress: '192.0.2.70', payload: { ref: 'J-0042', name: 'Marie Martin', message: 'Bonjour `Marie` 12 rue des Lilas Paris' } });
  const v = await c.flush();
  const hit = v.of('malicious_input')[0];
  assert.equal(hit.detail.constats[0].champ, 'body.message');
  assert.equal(hit.detail.constats[0].longueur, 38);
  assert.ok(!JSON.stringify(v.events).includes('Lilas') && !JSON.stringify(v.events).includes('Martin'));
});

test('revue : lot refusé (4xx) écarté sans bloquer la suite ; arrêt pendant une panne sans perte', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-'));
  const http = await import('node:http');
  const received = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => {
    received.push(JSON.parse(b).lot);
    res.writeHead(received.length === 1 ? 400 : 204, { connection: 'close' }).end();
  }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try {
    // Envoi réel (fetch) : la Vigie refuse le premier lot, accepte la suite.
    const sec = createSecurite({ url: `http://127.0.0.1:${srv.address().port}`, key: KEY, storageDir: dir, timers: false });
    sec.emit('sys_error', { emetteur: 'refusé' });
    await sec.flush();
    sec.emit('sys_error', { emetteur: 'suivant' });
    await sec.flush();
    assert.equal(received.length, 2);
    assert.deepEqual(received[1].map(e => e.type), ['sys_events_dropped', 'sys_error'], 'le refus est compté, la suite passe');
    assert.equal(received[1][0].detail.perdus, 1);
    assert.equal(sec.spooled(), 0, 'rien de bloqué en attente');
    assert.equal(sec.stats.refused, 1);

    // Arrêt pendant une panne : la file part sur le disque, et repart au démarrage suivant.
    let up = false;
    const got = [];
    const send = async body => { if (!up) throw new Error('injoignable'); got.push(...JSON.parse(body).lot); };
    const down = createSecurite({ url: 'http://v', key: KEY, storageDir: dir, timers: false, send });
    for (let i = 0; i < 450; i++) down.emit('sys_error', { emetteur: `e${i}` });
    await down.stop();
    assert.equal(down.spooled(), 450);
    up = true;
    const again = createSecurite({ url: 'http://v', key: KEY, storageDir: dir, timers: false, send });
    assert.equal(again.spooled(), 450, 'tampon relu au démarrage');
    await again.flush();
    assert.equal(again.spooled(), 0);
    assert.equal(got.length, 450);
  } finally {
    srv.closeAllConnections?.();
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('revue : tampon en panne prolongée — quelques fichiers, pas un par seconde, et aucun relu à chaque passage', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-'));
  try {
    let t0 = 1e12;
    const sec = createSecurite({ url: 'http://v', key: KEY, storageDir: dir, timers: false, now: () => t0, send: async () => { throw new Error('injoignable'); } });
    for (let s = 0; s < 3000; s++) { sec.emit('sys_error', { emetteur: 'x' }); t0 += 1000; await sec.flush(); }
    assert.equal(sec.spooled(), 3000);
    assert.ok(fs.readdirSync(path.join(dir, 'securite-attente')).length <= 3, 'segments de 1 Mo');
    assert.ok(sec.stats.failed < 40, `essais espacés (${sec.stats.failed})`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('revue : un compte mal formé n’empêche pas le démarrage ; session sans contexte signalée', async t => {
  const c = await withVigie(t);
  c.db.prepare("INSERT INTO accounts (sub, roles, status, created_at) VALUES ('bizarre', '{}', 'actif', 1)").run();
  c.db.prepare("UPDATE accounts SET roles = '\"admin\"' WHERE sub = 'bizarre'").run();
  let v = await c.flush();
  assert.ok(v.of('user_created').some(e => e.detail.compte === 'bizarre'));
  // Session écrite directement dans la base, sans passer par la connexion.
  const token = crypto.randomBytes(32).toString('base64url');
  const id = crypto.createHash('sha256').update(token).digest('hex');
  c.app.accounts.login({ sub: 'local:julien', name: 'J' });
  c.db.prepare("INSERT INTO sessions (id, sub, csrf, created_at, expires_at) VALUES (?, 'local:julien', 'c', ?, ?)").run(id, Date.now() + 1, Date.now() + 3600e3);
  await c.app.inject({ url: '/admin', cookies: { session: token } });
  v = await c.flush();
  assert.equal(v.of('session_context_change').at(-1).detail.raison, 'session sans contexte, créée hors de la connexion');
});
