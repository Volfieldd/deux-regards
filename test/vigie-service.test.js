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
  const body2 = lot([e1], { retard: true });
  const again = await v.ingest.inject({ method: 'POST', url: '/v1/events', payload: body2, headers: signed(body2) });
  assert.equal(again.json().gardes, 0);
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_ingestion_refusee'").pluck().get(), 1);
});

test('réception : deux horodatages, celui du site et celui de la Vigie ; heure du site hors bornes gardée dans le détail', async t => {
  const v = vigieOf(t);
  const old = Date.now() - 10 * 60e3, absurd = Date.now() - 400 * 864e5;
  const e1 = ev({ survenu_a: old }), e2 = ev({ survenu_a: absurd, detail: { champ: 'q' } });
  const body = lot([e1, e2], { retard: true });
  await v.ingest.inject({ method: 'POST', url: '/v1/events', payload: body, headers: signed(body) });
  const r1 = v.db.prepare('SELECT * FROM events WHERE id = ?').get(e1.id), r2 = v.db.prepare('SELECT * FROM events WHERE id = ?').get(e2.id);
  assert.equal(r1.survenu_a, old);
  assert.ok(r1.recu_a - r1.survenu_a >= 10 * 60e3 - 1000, 'écart gardé');
  assert.equal(r2.survenu_a, r2.recu_a, 'heure hors bornes : les détecteurs prennent celle de réception');
  assert.deepEqual(JSON.parse(r2.detail), { champ: 'q', horodatage_site_brut: absurd });
});

test('chaîne : vérification par paquets, en rendant la main ; des lignes écrites pendant ne font pas de fausse rupture', async t => {
  const v = vigieOf(t);
  const rows = n => Array.from({ length: n }, (_, i) => ({ id: crypto.randomUUID(), recu_a: Date.now(), survenu_a: Date.now(), type: 'sys_heartbeat', severity: 'info', canal: 'interne', confiance: 'constaté', composant: 'site · système', detail: String(i) }));
  for (let i = 0; i < 12; i++) v.store.add(rows(1000));
  let ticks = 0;
  const timer = setInterval(() => { ticks += 1; v.store.add(rows(10)); }, 0);
  const r = await v.store.verifyAsync();
  clearInterval(timer);
  assert.equal(r.ok, true);
  assert.ok(r.lignes >= 12000);
  assert.ok(ticks >= 1, 'la boucle d’événements a tourné pendant la vérification');
  assert.deepEqual(v.store.verify(), { ok: true, lignes: v.db.prepare('SELECT COUNT(*) FROM events').pluck().get() });
  v.db.prepare("UPDATE events SET detail = 'x' WHERE seq = 7000").run();
  assert.equal((await v.store.verifyAsync()).rupture.seq, 7000);
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
  assert.equal(v.store.purge(), 3);
  assert.deepEqual(v.store.verify(), { ok: true, lignes: 3 }, 'deux lignes gardées et la purge, chaînée');
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
  // La décision n'arrive qu'une fois l'attente installée (jamais un délai fixe : la machine peut être chargée).
  while (!v.decisions.events.listenerCount('change')) await new Promise(r => setTimeout(r, 5));
  v.decisions.create({ kind: 'geler', cible: 'zitadel-x', duree: '1h', par: 'test' });
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
    ['zitadel_droits', 'haut', 'API Zitadel', 'constaté', 'user-1', '198.51.100.4'], // compte visé, pas l'auteur
    ['zitadel_echec', 'moyen', 'API Zitadel', 'constaté', 'user-2', '203.0.113.50'],
  ]);
  const detail = JSON.parse(rows[0].detail);
  assert.equal(detail.auteur, 'admin-9', 'auteur gardé dans le détail');
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
  const config = loadVigieConfig({ VIGIE_DATA_DIR: dir, VIGIE_SITE_BACKUP_DIR: dir, VIGIE_INGEST_KEY: k.vigie.VIGIE_INGEST_KEY, VIGIE_LOG_KEY: k.vigie.VIGIE_LOG_KEY, VIGIE_DECISIONS_PRIVATE_KEY: k.vigie.VIGIE_DECISIONS_PRIVATE_KEY });
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
  const config = loadVigieConfig({ VIGIE_DATA_DIR: dir, VIGIE_SITE_BACKUP_DIR: dir, VIGIE_HOST: '127.0.0.1', VIGIE_INGEST_PORT: '0', VIGIE_INGEST_KEY: KEY, VIGIE_LOG_KEY: LOG_KEY, VIGIE_DECISIONS_PRIVATE_KEY: VIGIE_KEYS.priv64 });
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

// ---------- revue de la phase B (17 octobre 2026) ----------

test('revue B : ancre recopiée, fin du journal effacée, demi-caractère UTF-16 — la vérification voit tout et continue', async t => {
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const v = vigieOf(t, { now: () => clock });
  for (let i = 0; i < 6; i++) { v.store.own('vigie_demarrage', { detail: { i } }); clock += 864e5; }
  // Demi-caractère (lot du site ou réponse de Zitadel) : la ligne relue donne le même maillon.
  v.store.add([{ id: crypto.randomUUID(), type: 'malicious_input', severity: 'moyen', composant: 'site · public', canal: 'ingestion signée', confiance: 'rapporté', ua: 'Mozilla \ud800 x', sub: 'a\udc00b', reference: 123 }]);
  assert.deepEqual(v.store.verify(), { ok: true, lignes: 7 });
  // Effacer le début et recopier l'ancre depuis la base : falsifiée.
  const row = v.db.prepare('SELECT seq, chain, recu_a FROM events WHERE seq = 3').get();
  v.db.prepare('DELETE FROM events WHERE seq <= 3').run();
  v.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('chaine_ancre', ?)").run(JSON.stringify(row));
  assert.equal(v.store.verify().rupture.raison, 'ancre de purge falsifiée');
  // Fin effacée et compteur remis en arrière : la tête publiée le dit.
  const v2 = vigieOf(t);
  for (let i = 0; i < 4; i++) v2.store.own('vigie_demarrage', {});
  v2.store.head();
  v2.db.prepare('DELETE FROM events WHERE seq >= 3').run();
  v2.db.prepare("UPDATE sqlite_sequence SET seq = 2 WHERE name = 'events'").run();
  assert.equal(v2.store.verify().rupture.raison, 'journal plus court que sa dernière tête publiée');
  // Plusieurs ruptures : toutes listées (la première n'aveugle pas la suite).
  const v3 = vigieOf(t);
  for (let i = 0; i < 5; i++) v3.store.own('vigie_demarrage', {});
  v3.db.prepare("UPDATE events SET emetteur = 'x' WHERE seq IN (2, 4)").run();
  assert.deepEqual(v3.store.verify().ruptures.map(r => r.seq), [2, 4], 'chaque ligne abîmée, et seulement elles');
});

test('revue B : purge signée et chaînée ; décision écrite à la main jamais signée pour le site', async t => {
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const v = vigieOf(t, { now: () => clock });
  for (let i = 0; i < 3; i++) { v.store.own('vigie_demarrage', {}); clock += 864e5; }
  clock += 200 * 864e5;
  assert.equal(v.store.purge(), 3);
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_purge'").pluck().get(), 1);
  assert.equal(v.store.verify().ok, true);
  v.db.prepare("INSERT INTO decisions (kind, cible, portee, motif, par, cree_a, fin) VALUES ('bloquer', '192.0.2.0/24', 'tout', '', 'intrus', ?, ?)").run(clock, clock + 3600e3);
  const list = JSON.parse(v.decisions.signed().payload);
  assert.deepEqual(list.blocages, []);
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'log_integrity_fail'").pluck().get(), 1);
  // Une décision levée à la main dans la base : signature fausse, écartée aussi (et signalée).
  const id = v.decisions.create({ kind: 'geler', cible: 'x', duree: '1h', par: 'test' });
  v.db.prepare('UPDATE decisions SET fin = fin + 864e5 WHERE id = ?').run(id);
  assert.deepEqual(JSON.parse(v.decisions.signed().payload).gels, []);
});

test('revue B : jamais tout le monde — IPv4 dans IPv6, boucle locale, plus d’un /8, préfixe de session vide', async t => {
  const v = vigieOf(t);
  for (const bad of ['::ffff:0:0/96', '::/32', '64:ff9b::/96', '2002:c000:0200::/48', '127.0.0.1', '::1']) assert.throws(() => parseTarget(bad), DecisionError, bad);
  v.decisions.create({ kind: 'bloquer', cible: '10.0.0.0/8', duree: '1h', par: 'test' });
  assert.throws(() => v.decisions.create({ kind: 'bloquer', cible: '11.0.0.0/8', duree: '1h', par: 'test' }), /trop d’adresses/);
  const c = await setup(t, { seeded: true, env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 }, vigieOptions: { send: async () => {}, timers: false, pollDecisions: false } });
  const sign = p => ({ payload: JSON.stringify({ version: 1, emis_a: Date.now(), blocages: [], sessions: [], comptes: [], gels: [], verrouillage: null, ...p }), signature: '' });
  const signed = p => { const s = sign(p); s.signature = crypto.sign(null, Buffer.from(s.payload), VIGIE_KEYS.privateKey).toString('base64'); return s; };
  const fin = Date.now() + 3600e3;
  assert.throws(() => c.app.decisions.accept(signed({ blocages: [{ cible: '::ffff:0:0/96', portee: 'tout', fin }] })), /réseau refusé/);
  assert.throws(() => c.app.decisions.accept(signed({ blocages: [{ cible: '127.0.0.0/8', portee: 'tout', fin }] })), /réseau refusé/);
  assert.throws(() => c.app.decisions.accept(signed({ blocages: [{ cible: '1.0.0.0/8', portee: 'tout', fin }, { cible: '2.0.0.0/8', portee: 'tout', fin }] })), /trop d’adresses/);
  assert.throws(() => c.app.decisions.accept(signed({ sessions: [{ prefixe: '', fin }] })), /empreinte de session/);
  assert.throws(() => c.app.decisions.accept(signed({ emis_a: Date.now() + 3600e3 })), /futur/);
  // Horloge de la Vigie revenue en arrière : une liste fraîche à notre horloge est acceptée.
  c.app.decisions.accept(signed({ version: 5, emis_a: Date.now() }));
  assert.equal(c.app.decisions.accept(signed({ version: 6, emis_a: Date.now() - 60e3 })).version, 6);
  assert.equal((await c.app.inject({ url: '/healthz', remoteAddress: '127.0.0.1' })).statusCode, 200);
});

test('revue B : adresse encodée (/%61dmin, /%61uth) ne contourne ni le verrouillage ni un blocage ; sessions non autorisées fermées', async t => {
  const c = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 }, vigieOptions: { send: async () => {}, timers: false, pollDecisions: false } });
  const res = await c.app.inject({ method: 'POST', url: '/auth/local', remoteAddress: '192.0.2.5', payload: { token: TOKEN, author: 'julien' } });
  const cookies = Object.fromEntries(res.cookies.filter(x => x.value).map(x => [x.name, x.value]));
  const signed = p => { const payload = JSON.stringify({ version: 1, emis_a: Date.now(), blocages: [], sessions: [], comptes: [], gels: [], verrouillage: null, ...p }); return { payload, signature: crypto.sign(null, Buffer.from(payload), VIGIE_KEYS.privateKey).toString('base64') }; };
  const fin = Date.now() + 3600e3;
  c.app.decisions.accept(signed({ version: 1, blocages: [{ cible: '198.51.100.0/24', portee: 'auth', fin }, { cible: '203.0.113.0/24', portee: 'admin', fin }] }));
  for (const url of ['/auth/login', '/%61uth/login', '//auth/login']) assert.equal((await c.app.inject({ url, remoteAddress: '198.51.100.7' })).statusCode, 403, url);
  for (const url of ['/admin', '/%61dmin', '/adm%69n/photos']) assert.equal((await c.app.inject({ url, remoteAddress: '203.0.113.7' })).statusCode, 403, url);
  assert.equal((await c.app.inject({ method: 'POST', url: '/%61uth/local', remoteAddress: '198.51.100.7', payload: { token: TOKEN, author: 'julien' } })).statusCode, 403);
  // Verrouillage : la session ouverte d'un compte non autorisé est fermée, quelle que soit l'adresse demandée.
  c.app.decisions.accept(signed({ version: 2, emis_a: Date.now() + 1, verrouillage: { fin, comptes: ['zitadel-moi'], adresses: [] } }));
  for (const url of ['/%61dmin', '/admin/comptes']) {
    const r = await c.app.inject({ url, cookies, remoteAddress: '192.0.2.5' });
    assert.notEqual(r.statusCode, 200, url);
  }
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM sessions WHERE sub = 'local:julien'").pluck().get(), 0, 'session fermée');
});

test('revue B : ADMIN_SUBS jamais gelé ni tenu dehors ; ligne de commande sous un utilisateur sans nom ; interrupteur jamais éteint sans durée', async t => {
  const c = await setup(t, { seeded: true, env: { ADMIN_SUBS: 'proprietaire', VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 }, vigieOptions: { send: async () => {}, timers: false, pollDecisions: false } });
  const payload = JSON.stringify({ version: 1, emis_a: Date.now(), blocages: [], sessions: [], comptes: [], gels: [{ sub: 'proprietaire', fin: Date.now() + 3600e3 }], verrouillage: { fin: Date.now() + 3600e3, comptes: ['autre'], adresses: [] } });
  c.app.decisions.accept({ payload, signature: crypto.sign(null, Buffer.from(payload), VIGIE_KEYS.privateKey).toString('base64') });
  assert.equal(c.app.decisions.frozen('proprietaire'), false);
  assert.equal(c.app.decisions.lockAllows('proprietaire', '192.0.2.1'), true);
  // Conteneur sous l'identifiant 99, sans nom dans /etc/passwd : os.userInfo() échoue, la commande marche quand même.
  const dir = tmp(t);
  const k = keys();
  const config = loadVigieConfig({ VIGIE_DATA_DIR: dir, VIGIE_SITE_BACKUP_DIR: dir, ...k.vigie });
  t.mock.method(os, 'userInfo', () => { throw new Error('uv_os_get_passwd returned ENOENT'); });
  assert.match(cli(['bloquer', '203.0.113.9', '--duree', '1h'], { config }), /Décision #1/);
  assert.match(cli(['decisions'], { config }), /ligne de commande \(/);
  assert.throws(() => cli(['interrupteur', 'blocages', 'arret'], { config }), /toujours pour une durée/);
  assert.throws(() => loadVigieConfig({ VIGIE_DATA_DIR: dir, VIGIE_SITE_BACKUP_DIR: dir, ...k.vigie, VIGIE_LOG_KEY: k.vigie.VIGIE_INGEST_KEY }), /différente/);
  // Sauvegardes du site obligatoires (arbitrage NC2) : absentes ou introuvables, la Vigie refuse de démarrer.
  assert.throws(() => loadVigieConfig({ VIGIE_DATA_DIR: dir, ...k.vigie }), /VIGIE_SITE_BACKUP_DIR/);
  assert.throws(() => loadVigieConfig({ VIGIE_DATA_DIR: dir, VIGIE_SITE_BACKUP_DIR: path.join(dir, 'absent'), ...k.vigie }), /dossier introuvable/);
});

test('revue B : Zitadel — trou signalé une fois, curseur illisible ou futur sans blocage, type « constructor » ignoré', async t => {
  let clock = Date.parse('2026-10-17T12:00:00Z');
  const v = vigieOf(t, { now: () => clock });
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = { keyId: 'k', key: privateKey.export({ type: 'pkcs8', format: 'pem' }), userId: 'u' };
  let down = false;
  const fetchImpl = async url => {
    if (down) throw new Error('injoignable');
    if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 'j', expires_in: 3600 }));
    return new Response(JSON.stringify({ events: [{ aggregate: { id: 'a' }, sequence: 1, creationDate: new Date(clock).toISOString(), type: { type: 'constructor' } }] }));
  };
  const z = createZitadelReader({ issuer: 'https://z.example', keyFile: null, readKey: () => key, store: v.store, fetchImpl, now: () => clock });
  assert.equal(await z.run(), 0);
  down = true;
  clock += 21 * 3600e3;
  for (let i = 0; i < 3; i++) await z.run().catch(() => {});
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_zitadel_trou'").pluck().get(), 1);
  down = false;
  v.store.setting.set('zitadel_curseur', 'pas une date');
  await z.run();
  v.store.setting.set('zitadel_curseur', '2099-01-01T00:00:00Z');
  await z.run();
  assert.ok(Date.parse(v.store.setting.get('zitadel_curseur')) <= clock, 'curseur ramené au présent');
});

test('revue B : valeur mal typée dans un lot signé — écartée, le reste gardé (jamais d’erreur 500)', async t => {
  const v = vigieOf(t);
  const body = lot([ev({ ip: ['1.2.3.4'], country: { a: 1 }, session: ['abc'] }), ev({ id: ['x'] })]);
  const res = await v.ingest.inject({ method: 'POST', url: '/v1/events', payload: body, headers: signed(body) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { recus: 2, gardes: 1, ecartes: 1 });
  assert.equal(v.db.prepare('SELECT ip FROM events WHERE type = ?').pluck().get('malicious_input'), null);
});
