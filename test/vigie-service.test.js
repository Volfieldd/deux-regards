import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup, VIGIE_KEYS } from './helpers.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions, parseTarget, DecisionError } from '../vigie/decisions.js';
import { createIngest } from '../vigie/ingest.js';
import { createZitadelReader } from '../vigie/zitadel.js';
import { startVigie } from '../vigie/index.js';
import { loadVigieConfig } from '../vigie/config.js';
import { backupVigie } from '../vigie/backup.js';
import { run as cli, keys } from '../vigie/cli.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createDecisionsClient } from '../server/securite/decisions.js';

// Vigie, phase B : service à part (réception signée, base chaînée, décisions signées, Zitadel, sauvegarde, ligne de
// commande) et application des décisions par le site.
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const TOKEN = 'jeton-de-test-0123456789';
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-svc-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

function vigieOf(t, { now = Date.now } = {}) {
  const dir = tmp(t);
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  t.after(() => { try { db.close(); } catch { /* déjà fermée */ } });
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const ingest = createIngest({ store, decisions, ingestKey: KEY, now });
  t.after(() => ingest.close());
  return { dir, db, store, decisions, ingest };
}
const signed = (body, { key = KEY, ts = Date.now(), nonce = crypto.randomBytes(16).toString('hex') } = {}) => ({
  'content-type': 'application/json', 'x-vigie-ts': String(ts), 'x-vigie-nonce': nonce,
  'x-vigie-sig': crypto.createHmac('sha256', key).update(`${ts}.${nonce}.${body}`).digest('hex'),
});
const ev = (extra = {}) => ({ v: 1, id: crypto.randomUUID(), type: 'malicious_input', severity: 'moyen', survenu_a: Date.now(),
  origine: { composant: 'site · public', emetteur: 'test', reference: 'req-1' }, ip: '203.0.113.7', ip_net: '203.0.113.0', ...extra });
const lot = (events, extra = {}) => JSON.stringify({ emetteur: 'site', envoye_a: Date.now(), lot: events, ...extra });

test('réception : lot signé gardé, canal et confiance fixés par la Vigie, doublon écarté, événement invalide écarté', async t => {
  const v = vigieOf(t);
  const e1 = ev({ origine: { composant: 'site · public', emetteur: 'test' }, canal: 'API Zitadel', confiance: 'constaté' });
  const body = lot([e1, ev({ type: 'type_inconnu' }), ev({ origine: { composant: 'zitadel' } })]);
  const res = await v.ingest.inject({ method: 'POST', url: '/v1/events', payload: body, headers: signed(body) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { recus: 3, gardes: 1, ecartes: 2 });
  const row = v.db.prepare('SELECT * FROM events WHERE id = ?').get(e1.id);
  assert.equal(row.canal, 'ingestion signée');
  assert.equal(row.confiance, 'rapporté');
  assert.equal(row.composant, 'site · public');
  // Le même lot renvoyé (nouvelle signature) : rien en double.
  const again = await v.ingest.inject({ method: 'POST', url: '/v1/events', payload: lot([e1], { retard: true }), headers: signed(lot([e1], { retard: true })) });
  assert.equal(again.json().gardes, 0);
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_ingestion_refusee'").pluck().get(), 1);
});

test('réception : signature fausse, horloge décalée, lot rejoué → 401 (le site garde ses lots), signalé une fois par minute', async t => {
  const v = vigieOf(t);
  const body = lot([ev()]);
  assert.equal((await v.ingest.inject({ method: 'POST', url: '/v1/events', payload: body, headers: signed(body, { key: 'autre-cle-0123456789-0123456789-xx' }) })).statusCode, 401);
  assert.equal((await v.ingest.inject({ method: 'POST', url: '/v1/events', payload: body, headers: signed(body, { ts: Date.now() - 120e3 }) })).statusCode, 401);
  const h = signed(body);
  assert.equal((await v.ingest.inject({ method: 'POST', url: '/v1/events', payload: body, headers: h })).statusCode, 200);
  assert.equal((await v.ingest.inject({ method: 'POST', url: '/v1/events', payload: body, headers: h })).statusCode, 401, 'nonce déjà vu');
  assert.equal((await v.ingest.inject({ method: 'POST', url: '/v1/events', payload: body })).statusCode, 401);
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_ingestion_refusee'").pluck().get(), 1);
  const big = 'x'.repeat(1100 * 1024);
  assert.equal((await v.ingest.inject({ method: 'POST', url: '/v1/events', payload: big, headers: signed(big) })).statusCode, 413);
});

test('chaîne : intacte, puis ligne modifiée, ligne effacée, dernières lignes effacées — détectées ; la purge garde une ancre', async t => {
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const v = vigieOf(t, { now: () => clock });
  for (let i = 0; i < 5; i++) { v.store.own('vigie_demarrage', { detail: { i } }); clock += 864e5; }
  assert.deepEqual(v.store.verify(), { ok: true, lignes: 5 });
  // Purge (6 mois plus tard) : les plus anciennes partent, la chaîne reste vérifiable depuis l'ancre.
  clock += 183 * 864e5 - 2.5 * 864e5;
  assert.equal(v.store.purge(183), 3);
  assert.deepEqual(v.store.verify(), { ok: true, lignes: 2 });
  v.store.own('vigie_demarrage', {});
  v.db.prepare("UPDATE events SET severity = 'info', detail = '{}' WHERE seq = (SELECT MAX(seq) - 1 FROM events)").run();
  assert.equal(v.store.verify().rupture.raison, 'ligne modifiée ou insérée');
  v.db.prepare('DELETE FROM events WHERE seq = (SELECT MAX(seq) - 1 FROM events)').run();
  assert.equal(v.store.verify().rupture.raison, 'ligne manquante');
  v.db.prepare('DELETE FROM events WHERE seq >= (SELECT MAX(seq) - 1 FROM events)').run();
  assert.equal(v.store.verify().rupture.raison, 'dernières lignes effacées');
});

test('décisions : bornées, jamais tout le monde, signées ; attente longue rendue au changement', async t => {
  const v = vigieOf(t);
  assert.throws(() => parseTarget('0.0.0.0/0'), DecisionError);
  assert.throws(() => parseTarget('::/0'), DecisionError);
  assert.throws(() => parseTarget('10.0.0.0/7'), /trop large/);
  assert.equal(parseTarget('203.0.113.7').cible, '203.0.113.7/32');
  assert.throws(() => v.decisions.create({ kind: 'verrouiller', cible: 'admin', duree: '1h', par: 'test', details: {} }), /au moins un compte/);
  const id = v.decisions.create({ kind: 'bloquer', cible: '203.0.113.0/24', portee: 'admin', duree: '90j', par: 'test', motif: 'essai' });
  const d = v.db.prepare('SELECT * FROM decisions WHERE id = ?').get(id);
  assert.ok(d.fin - d.cree_a <= 30 * 864e5, 'plafonné à 30 jours');
  const s = v.decisions.signed();
  assert.ok(crypto.verify(null, Buffer.from(s.payload), VIGIE_KEYS.publicKey, Buffer.from(s.signature, 'base64')));
  assert.deepEqual(JSON.parse(s.payload).blocages.map(b => [b.cible, b.portee]), [['203.0.113.0/24', 'admin']]);
  // Attente longue : la réponse arrive dès qu'une décision change.
  const version = v.decisions.version();
  const url = `/v1/decisions?depuis=${version}`;
  const waiting = v.ingest.inject({ method: 'GET', url, headers: signed(`GET ${url}`) });
  setTimeout(() => v.decisions.create({ kind: 'geler', cible: 'zitadel-x', duree: '1h', par: 'test' }), 50);
  const res = await waiting;
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.json().payload).gels[0].sub, 'zitadel-x');
  assert.equal((await v.ingest.inject({ method: 'GET', url: '/v1/decisions?depuis=0' })).statusCode, 401, 'lecture signée elle aussi');
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_decision'").pluck().get(), 2);
});

test('Zitadel : jeton par clé JWT, événements suivis seulement, charge réduite sans donnée personnelle, doublons écartés, trou signalé', async t => {
  let clock = Date.parse('2026-10-17T12:00:00Z');
  const v = vigieOf(t, { now: () => clock });
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyJson = { type: 'serviceaccount', keyId: 'k1', key: privateKey.export({ type: 'pkcs8', format: 'pem' }), userId: 'u1' };
  const calls = [];
  const events = [
    { aggregate: { id: 'user-1', type: 'user', resourceOwner: 'org-1' }, sequence: 7, creationDate: '2026-10-17T11:59:00Z', editor: { userId: 'admin-9', service: 'zitadel.v1.ManagementService' },
      type: { type: 'user.grant.added' }, payload: { roleKeys: ['admin'], projectId: 'p1', email: 'secret@example.org', userAgent: { ip: '198.51.100.4' } } },
    { aggregate: { id: 'user-2', type: 'user' }, sequence: 3, creationDate: '2026-10-17T11:59:30Z', editor: { userId: 'user-2' },
      type: { type: 'user.human.password.check.failed' }, payload: { userAgent: { ip: '203.0.113.50' } } },
    { aggregate: { id: 'x', type: 'org' }, sequence: 1, creationDate: '2026-10-17T11:59:40Z', type: { type: 'org.policy.label.changed' }, payload: {} },
  ];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/oauth/v2/token')) {
      const assertion = new URLSearchParams(init.body).get('assertion');
      const [h, p, s] = assertion.split('.');
      assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), crypto.createPublicKey(privateKey), Buffer.from(s, 'base64url')));
      assert.equal(JSON.parse(Buffer.from(p, 'base64url')).aud, 'https://exemple.zitadel.cloud');
      return new Response(JSON.stringify({ access_token: 'jeton', expires_in: 3600 }), { status: 200 });
    }
    assert.equal(init.headers.authorization, 'Bearer jeton');
    const body = JSON.parse(init.body);
    assert.ok(body.event_types.includes('user.grant.added') && !body.event_types.includes('org.policy.label.changed'));
    return new Response(JSON.stringify({ events }), { status: 200 });
  };
  const z = createZitadelReader({ issuer: 'https://exemple.zitadel.cloud', keyFile: null, readKey: () => keyJson, store: v.store, fetchImpl, now: () => clock });
  assert.equal(await z.run(), 2);
  const rows = v.db.prepare("SELECT * FROM events WHERE composant = 'zitadel' ORDER BY seq").all();
  assert.deepEqual(rows.map(r => [r.type, r.severity, r.canal, r.confiance, r.sub, r.ip]), [
    ['zitadel_droits', 'haut', 'API Zitadel', 'constaté', 'admin-9', '198.51.100.4'],
    ['zitadel_echec', 'moyen', 'API Zitadel', 'constaté', 'user-2', '203.0.113.50'],
  ]);
  const detail = JSON.parse(rows[0].detail);
  assert.deepEqual(detail.charge, { roleKeys: ['admin'], projectId: 'p1' });
  assert.equal(detail.type_zitadel, 'user.grant.added');
  assert.ok(!rows.some(r => String(r.detail).includes('secret@example.org')), 'aucune adresse e-mail gardée');
  // Relecture (chevauchement de 5 minutes) : rien en double ; jeton gardé.
  assert.equal(await z.run(), 0);
  assert.equal(calls.filter(c => c.url.endsWith('/token')).length, 1);
  // Vigie arrêtée plus de 20 h : trou signalé.
  clock += 21 * 3600e3;
  await z.run();
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_zitadel_trou'").pluck().get(), 1);
});

test('ligne de commande : clés, blocage, gel, verrouillage, interrupteur, levée, état, vérification', async t => {
  const dir = tmp(t);
  const k = keys();
  const config = loadVigieConfig({ VIGIE_DATA_DIR: dir, VIGIE_INGEST_KEY: k.vigie.VIGIE_INGEST_KEY, VIGIE_LOG_KEY: k.vigie.VIGIE_LOG_KEY, VIGIE_DECISIONS_PRIVATE_KEY: k.vigie.VIGIE_DECISIONS_PRIVATE_KEY });
  assert.match(cli(['cles']), /VIGIE_DECISIONS_PUBKEY=/);
  assert.match(cli(['bloquer', '203.0.113.7', '--duree', '2h', '--motif', 'scan'], { config, user: 'root' }), /Décision #1/);
  assert.throws(() => cli(['bloquer', '0.0.0.0/0'], { config }), /trop large/);
  assert.match(cli(['geler', 'zitadel-x', '--duree', '1h'], { config }), /gelé/);
  assert.match(cli(['verrouiller', '--comptes', 'zitadel-moi'], { config }), /verrouillée/);
  assert.match(cli(['interrupteur', 'blocages', 'arret', '--duree', '2h'], { config }), /arret pour 2h/);
  assert.match(cli(['decisions'], { config }), /#1 {2}bloquer {2}203\.0\.113\.7\/32 \(tout\)[^\n]*ligne de commande \(root\)[^\n]*scan/);
  assert.match(cli(['lever', '1'], { config }), /1 décision/);
  assert.match(cli(['lever', '--tout'], { config }), /2 décision/);
  assert.match(cli(['etat'], { config }), /blocages ARRÊT jusqu'au/);
  assert.match(cli(['verifier'], { config }), /Chaîne intacte \(\d+ lignes\)/);
  const db = openVigieDb(config.databasePath);
  t.after(() => db.close());
  const sw = createSwitches({ store: createStore({ db, logKey: config.logKey }), now: () => Date.now() + 3 * 3600e3 });
  assert.equal(sw.isOn('blocages'), true, 'rallumé seul à la fin de la durée');
});

test('sauvegarde : instantané contrôlé, N gardés, jamais dans le dossier des données', async t => {
  const v = vigieOf(t);
  v.store.own('vigie_demarrage', {});
  const backups = tmp(t);
  let clock = Date.now();
  for (let i = 0; i < 4; i++) { backupVigie({ databasePath: path.join(v.dir, 'vigie.db'), backupDir: backups, keep: 2, now: () => clock }); clock += 3600e3; }
  assert.equal(fs.readdirSync(backups).length, 2);
  assert.throws(() => backupVigie({ databasePath: path.join(v.dir, 'vigie.db'), backupDir: path.join(v.dir, 'sauv') }), /dossier des données/);
});

test('bout en bout : le site envoie ses lots à une vraie Vigie et applique ses décisions (blocage, gel, verrouillage)', async t => {
  const dir = tmp(t);
  const k = keys();
  const config = loadVigieConfig({ VIGIE_DATA_DIR: dir, VIGIE_HOST: '127.0.0.1', VIGIE_INGEST_PORT: '0', VIGIE_INGEST_KEY: KEY, VIGIE_LOG_KEY: LOG_KEY, VIGIE_DECISIONS_PRIVATE_KEY: VIGIE_KEYS.priv64 });
  void k;
  const vigie = await startVigie({ config, logger: false });
  t.after(() => vigie.close());
  const port = vigie.ingest.server.address().port;
  const c = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, VIGIE_URL: `http://127.0.0.1:${port}`, VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 }, vigieOptions: { timers: false, pollDecisions: false } });
  const login = async (ip = '192.0.2.5') => {
    const res = await c.app.inject({ method: 'POST', url: '/auth/local', remoteAddress: ip, payload: { token: TOKEN, author: 'julien' } });
    return Object.fromEntries(res.cookies.filter(x => x.value).map(x => [x.name, x.value]));
  };
  const cookies = await login();
  await c.app.inject({ url: '/.env', remoteAddress: '198.51.100.66' });
  await c.app.securite.flush();
  const types = vigie.store.db.prepare('SELECT type FROM events').pluck().all();
  assert.ok(types.includes('authn_login_success') && types.includes('malicious_honeypot') && types.includes('sys_startup'), types.join(','));
  assert.equal(vigie.store.verify().ok, true);

  // Blocage d'un réseau sur tout le site.
  vigie.decisions.create({ kind: 'bloquer', cible: '198.51.100.0/24', portee: 'tout', duree: '1h', par: 'test' });
  await c.app.decisions.poll();
  const blocked = await c.app.inject({ url: '/', remoteAddress: '198.51.100.66' });
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.body, 'Accès refusé.');
  assert.equal((await c.app.inject({ url: '/', remoteAddress: '192.0.2.5' })).statusCode, 200, 'les autres passent');
  // Gel du compte : session fermée, connexion refusée.
  vigie.decisions.create({ kind: 'geler', cible: 'local:julien', duree: '1h', par: 'test' });
  await c.app.decisions.poll();
  assert.equal((await c.app.inject({ url: '/admin', cookies, remoteAddress: '192.0.2.5' })).statusCode, 302, 'renvoyé à la connexion');
  assert.equal((await c.app.inject({ method: 'POST', url: '/auth/local', remoteAddress: '192.0.2.5', payload: { token: TOKEN, author: 'julien' } })).statusCode, 403);
  // Levée, puis verrouillage : seul un autre compte peut entrer.
  vigie.decisions.lift({ all: true, par: 'test' });
  vigie.decisions.create({ kind: 'verrouiller', cible: 'admin', duree: '1h', par: 'test', details: { comptes: ['zitadel-moi'] } });
  await c.app.decisions.poll();
  const again = await login();
  assert.equal(Object.keys(again).length, 0, 'connexion refusée pendant le verrouillage');
  assert.equal((await c.app.inject({ url: '/', remoteAddress: '198.51.100.66' })).statusCode, 200, 'blocage levé');
  // Liste gardée sur le disque, relue au démarrage ; signature fausse refusée.
  const cache = JSON.parse(fs.readFileSync(path.join(c.dir, 'securite-decisions.json'), 'utf8'));
  const client = createDecisionsClient({ url: 'http://x', key: KEY, pubkey: crypto.createPublicKey({ key: Buffer.from(VIGIE_KEYS.pub64, 'base64'), format: 'der', type: 'spki' }), storageDir: c.dir });
  assert.equal(client.lockAllows('local:julien', '192.0.2.5'), false);
  assert.throws(() => client.accept({ payload: cache.payload.replace('zitadel-moi', 'local:julien'), signature: cache.signature }), /signature des décisions fausse/);
  await c.app.securite.flush();
  assert.ok(vigie.store.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'authz_blocked'").pluck().get() >= 2);
});

test('site : VIGIE_APPLIQUER=0 lit les décisions sans les appliquer ; une liste qui bloquerait tout est refusée', async t => {
  const c = await setup(t, { seeded: true, env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64, VIGIE_APPLIQUER: '0' }, vigieOptions: { send: async () => {}, timers: false, pollDecisions: false } });
  const sign = payload => ({ payload, signature: crypto.sign(null, Buffer.from(payload), VIGIE_KEYS.privateKey).toString('base64') });
  const p = { version: 1, emis_a: Date.now(), blocages: [{ cible: '192.0.2.0/24', portee: 'tout', fin: Date.now() + 3600e3 }], sessions: [], comptes: [], gels: [], verrouillage: null };
  c.app.decisions.accept(sign(JSON.stringify(p)));
  assert.equal((await c.app.inject({ url: '/', remoteAddress: '192.0.2.9' })).statusCode, 200);
  assert.throws(() => c.app.decisions.accept(sign(JSON.stringify({ ...p, emis_a: Date.now() + 1, blocages: [{ cible: '0.0.0.0/0', portee: 'tout', fin: Date.now() + 1 }] }))), /réseau refusé/);
  assert.throws(() => c.app.decisions.accept(sign(JSON.stringify({ ...p, emis_a: 1 }))), /plus ancienne/);
});
