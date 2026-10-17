import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup, VIGIE_KEYS } from './helpers.js';
import { parseBlock, acceptEdgeList, blockedScope } from '../bordure/decisions.js';
import worker, { resetCache, scheduled } from '../bordure/worker.js';
import { createEdgeVerifier } from '../server/securite/bordure.js';
import { createDecisionsClient } from '../server/securite/decisions.js';
import { loadConfig } from '../server/config.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions } from '../vigie/decisions.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createEngine } from '../vigie/moteur.js';
import { createEdge } from '../vigie/bordure.js';
import { loadVigieConfig } from '../vigie/config.js';

// Vigie, phase C3 (décision D19) : capteur en bordure Cloudflare (Worker), en-têtes signés vérifiés par le site,
// blocages appliqués avant le site, constats lus dans Analytics Engine par la Vigie.
const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const EDGE_KEY = 'cle-de-la-bordure-0123456789abcdefghij';
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const TOKEN = 'jeton-de-test-0123456789';
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-bordure-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

function vigieOf(t, { start = Date.now() } = {}) {
  const dir = tmp(t);
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  t.after(() => db.close());
  const clock = { t: start };
  const now = () => clock.t;
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now });
  store.onAdded(rows => engine.process(rows));
  return { dir, db, store, decisions, engine, clock, now };
}

// Worker exécuté dans Node : requête Cloudflare simulée (request.cf, CF-Connecting-IP), origine simulée.
async function runWorker({ url, ip = '203.0.113.7', headers = {}, cf = {}, env = {}, method = 'GET' }) {
  const forwarded = [];
  const points = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async req => { forwarded.push(req); return new Response('ok', { status: env.status ?? 200 }); };
  try {
    const request = new Request(url, { method, headers: { 'cf-connecting-ip': ip, ...headers } });
    Object.defineProperty(request, 'cf', { value: { asn: 3215, asOrganization: 'Orange', country: 'FR', tlsVersion: 'TLSv1.3', tlsCipher: 'AEAD-AES128-GCM-SHA256', httpProtocol: 'HTTP/2', clientTcpRtt: 12, tlsClientCiphersSha1: 'abc=', tlsClientHelloLength: '517', ...cf } });
    const res = await worker.fetch(request, { BORDURE_KEY: EDGE_KEY, DECISIONS_PUBKEY: VIGIE_KEYS.pub64, ANALYTICS: { writeDataPoint: p => points.push(p) }, ...env });
    return { res, forwarded, points };
  } finally { globalThis.fetch = realFetch; }
}

test('bordure : garde-fous des blocages (jamais tout le monde), séparation des listes du site et de la bordure', async t => {
  for (const bad of ['0.0.0.0/0', '10.0.0.0/7', '127.0.0.1/32', '::/96', '2002::/16', '64:ff9b::1/128', '::ffff:1.2.3.4/128', '2000::/3', '::1/128', 'x/8']) assert.equal(parseBlock(bad), null, bad);
  for (const ok of ['10.0.0.0/8', '203.0.113.7/32', '2001:db8::/32']) assert.ok(parseBlock(ok), ok);
  const v = vigieOf(t);
  v.decisions.create({ kind: 'bloquer', cible: '203.0.113.7', portee: 'tout', duree: '1h', par: 'test' });
  v.decisions.create({ kind: 'bloquer', cible: '198.51.100.0/24', portee: 'admin', duree: '1h', par: 'test' });
  v.decisions.create({ kind: 'geler', cible: 'zitadel-secret', duree: '1h', par: 'test' });
  const edge = v.decisions.signedEdge();
  assert.doesNotMatch(edge.payload, /zitadel-secret/, 'ni compte ni session ne part chez Cloudflare');
  const list = await acceptEdgeList(edge, VIGIE_KEYS.pub64, v.now());
  assert.equal(blockedScope(list, '203.0.113.7', '/', v.now()), 'tout');
  assert.equal(blockedScope(list, '::ffff:203.0.113.7', '/photo/x', v.now()), 'tout');
  assert.equal(blockedScope(list, '198.51.100.9', '/', v.now()), null);
  assert.equal(blockedScope(list, '198.51.100.9', '/admin/photos', v.now()), 'admin');
  assert.equal(blockedScope(list, '198.51.100.9', '/auth/login', v.now()), 'admin');
  assert.equal(blockedScope(list, '203.0.113.7', '/healthz', v.now()), null);
  assert.equal(blockedScope(list, '203.0.113.7', '/', v.now() + 2 * 3600e3), null, 'échu');
  // Même clé, deux usages : la liste de la bordure est refusée par le site (elle effacerait gels et révocations) et
  // celle du site par la bordure.
  await assert.rejects(acceptEdgeList(v.decisions.signed(), VIGIE_KEYS.pub64, v.now()), /pas destinée à la bordure/);
  const client = createDecisionsClient({ url: 'http://x', key: KEY, pubkey: crypto.createPublicKey({ key: Buffer.from(VIGIE_KEYS.pub64, 'base64'), format: 'der', type: 'spki' }), storageDir: tmp(t) });
  assert.throws(() => client.accept(edge), /pas destinée au site/);
  assert.equal(client.accept(v.decisions.signed()).counts.gels, 1);
  // 1 000 blocages au plus en bordure (10 ms de calcul du Worker) : décisions manuelles d'abord, puis les plus récentes.
  for (let i = 0; i < 1001; i++) v.decisions.create({ kind: 'bloquer', cible: `10.${i >> 8}.${i & 255}.1`, portee: 'tout', duree: '1h', par: 'Vigie', auto: true });
  const big = JSON.parse(v.decisions.signedEdge().payload).blocages;
  assert.equal(big.length, 1000);
  assert.ok(big.some(b => b.cible === '203.0.113.7/32'), 'la décision manuelle reste');
  const accepted = await acceptEdgeList(v.decisions.signedEdge(), VIGIE_KEYS.pub64, v.now());
  assert.equal(accepted.exact.size + accepted.blocks.length, 1000, 'acceptée en entier par le Worker');
  // Signature fausse : refusée.
  await assert.rejects(acceptEdgeList({ ...edge, payload: edge.payload.replace('203.0.113.7', '203.0.113.8') }, VIGIE_KEYS.pub64), /signature fausse/);
});

test('Worker : bloque avant le site, signe ses en-têtes (vérifiés par le site), retire ceux du visiteur, ne transmet pas les jetons', async t => {
  const v = vigieOf(t);
  v.decisions.create({ kind: 'bloquer', cible: '192.0.2.66', portee: 'tout', duree: '1h', par: 'test' });
  const kv = { get: async () => v.decisions.signedEdge() };
  resetCache();
  const blocked = await runWorker({ url: 'https://nicephos.art/', ip: '192.0.2.66', env: { DECISIONS: kv } });
  assert.equal(blocked.res.status, 403);
  assert.equal(blocked.forwarded.length, 0, 'le site ne voit pas la requête');
  assert.equal(blocked.points[0].blobs[0], 'bloque');
  // Requête ordinaire : en-têtes signés ; ceux fabriqués par le visiteur sont retirés.
  const ok = await runWorker({ url: 'https://nicephos.art/pour-vous/JETON-SECRET-123?x=1', headers: { 'x-bordure-asn': '666', 'x-bordure-sig': 'f'.repeat(64) }, env: { DECISIONS: kv } });
  assert.equal(ok.res.status, 200);
  const h = Object.fromEntries(ok.forwarded[0].headers);
  assert.equal(h['x-bordure-asn'], '3215');
  assert.match(h['x-bordure-sig'], /^[0-9a-f]{64}$/);
  assert.equal(ok.points[0].blobs[7], '/pour-vous', 'premier segment seulement : le jeton ne part pas chez Cloudflare');
  assert.ok(!JSON.stringify(ok.points).includes('JETON-SECRET'));
  // Le site vérifie avec la même clé, pour la même adresse, méthode, hôte et chemin.
  const verify = createEdgeVerifier({ key: EDGE_KEY });
  const req = { ip: '203.0.113.7', method: 'GET', headers: { ...h, host: 'nicephos.art' }, raw: { url: '/pour-vous/JETON-SECRET-123?x=1' } };
  const b = verify(req);
  assert.deepEqual({ asn: b.asn, org: b.org, pays: b.pays, rtt: b.rtt }, { asn: '3215', org: 'Orange', pays: 'FR', rtt: 12 });
  assert.match(b.tls, /^[0-9a-f]{16}$/);
  assert.deepEqual(verify({ ...req, ip: '203.0.113.8' }), { invalide: 'adresse différente' }, 'en-têtes d’un autre visiteur (ou adresse mal transmise)');
  assert.deepEqual(verify({ ...req, headers: { ...req.headers, 'x-bordure-ip': '203.0.113.8' } }), { invalide: 'signature fausse' }, 'adresse signée changée');
  // Chemin encodé : le Worker le décode comme le routeur du site, le bloque, et le site vérifie la même signature.
  v.decisions.create({ kind: 'bloquer', cible: '198.51.100.44', portee: 'admin', duree: '1h', par: 'test' });
  resetCache();
  await new Promise(r => setImmediate(r));
  const kv2 = { get: async () => v.decisions.signedEdge() };
  for (const p of ['/%61dmin/photos', '//admin', '/a%75th/login']) assert.equal((await runWorker({ url: `https://nicephos.art${p}`, ip: '198.51.100.44', env: { DECISIONS: kv2 } })).res.status, 403, p);
  resetCache();
  const enc = await runWorker({ url: 'https://nicephos.art/photo/caf%C3%A9%7Cx', env: { DECISIONS: kv2 } });
  const he = Object.fromEntries(enc.forwarded[0].headers);
  // cloudflared réencode certains caractères (« | ») : le site décode avant de comparer.
  assert.equal(verify({ ip: '203.0.113.7', method: 'GET', headers: { ...he, host: 'nicephos.art' }, raw: { url: '/photo/caf%C3%A9|x' } }).asn, '3215');
  // IPv6 du visiteur.
  resetCache();
  const six = await runWorker({ url: 'https://nicephos.art/', ip: '2001:db8::7', env: { DECISIONS: kv2 } });
  assert.equal(verify({ ip: '2001:db8::7', method: 'GET', headers: { ...Object.fromEntries(six.forwarded[0].headers), host: 'nicephos.art' }, raw: { url: '/' } }).asn, '3215');
  assert.deepEqual(verify({ ...req, raw: { url: '/admin' } }), { invalide: 'signature fausse' }, 'en-têtes d’une autre requête');
  assert.deepEqual(createEdgeVerifier({ key: EDGE_KEY, now: () => Date.now() + 120e3 })(req), { invalide: 'en-têtes périmés' });
  assert.equal(verify({ ip: '1.2.3.4', method: 'GET', headers: {}, url: '/' }), null, 'sans bordure');
  // Images et fichiers statiques : jamais traités (quota), en-têtes du visiteur retirés quand même.
  const media = await runWorker({ url: 'https://nicephos.art/media/abc.avif', headers: { 'x-bordure-asn': '666' }, env: { DECISIONS: kv } });
  assert.equal(media.points.length, 0);
  assert.equal(media.forwarded[0].headers.get('x-bordure-asn'), null);
  // Liste inchangée : pas revérifiée ; KV en panne ensuite : la liste précédente reste appliquée.
  resetCache();
  let calls = 0;
  const flaky = { get: async () => { calls += 1; if (calls > 1) throw new Error('KV'); return v.decisions.signedEdge(); } };
  assert.equal((await runWorker({ url: 'https://nicephos.art/', ip: '192.0.2.66', env: { DECISIONS: flaky } })).res.status, 403);
  const realNow = Date.now;
  Date.now = () => realNow() + 61e3;
  try {
    const again = await runWorker({ url: 'https://nicephos.art/', ip: '192.0.2.66', env: { DECISIONS: flaky } });
    assert.equal(again.res.status, 403, 'liste précédente gardée');
    assert.equal(again.points[0].blobs[0], 'liste_refusee', 'refus signalé à la Vigie');
  } finally { Date.now = realNow; }
  // Dernier recours : DESACTIVE=1 laisse tout passer.
  assert.equal((await runWorker({ url: 'https://nicephos.art/', ip: '192.0.2.66', env: { DECISIONS: kv, DESACTIVE: '1' } })).res.status, 200);
  // KV en panne dès le départ : la requête passe (le site garde ses protections).
  resetCache();
  const down = await runWorker({ url: 'https://nicephos.art/', ip: '192.0.2.66', env: { DECISIONS: { get: async () => { throw new Error('KV'); } } } });
  assert.equal(down.res.status, 200);
});

test('site : en-têtes de la bordure dans les événements et le contexte de session ; en-têtes faux signalés ; empreinte TLS observée', async t => {
  const sent = [];
  const c = await setup(t, { seeded: true, env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64, VIGIE_BORDURE_KEY: EDGE_KEY, LOCAL_AUTH_TOKEN: TOKEN },
    vigieOptions: { send: async body => { sent.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false } });
  const flush = async () => { c.app.securite.runTasks(); c.app.securite.retryNow(); await c.app.securite.flush(); };
  // En-têtes produits par le vrai Worker pour cette requête.
  const edgeHeaders = async (url, { method = 'GET', ip = '203.0.113.7', cf = {} } = {}) => {
    resetCache();
    const r = await runWorker({ url: `http://localhost${url}`, ip, method, cf, env: { DECISIONS: { get: async () => null } } });
    return Object.fromEntries([...r.forwarded[0].headers].filter(([k]) => k.startsWith('x-bordure-')));
  };
  const login = await c.app.inject({ method: 'POST', url: '/auth/local', remoteAddress: '203.0.113.7', headers: { host: 'localhost', ...(await edgeHeaders('/auth/local', { method: 'POST' })) }, payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  assert.equal(login.statusCode, 303);
  const s = c.db.prepare('SELECT ctx_asn, ctx_tls, ctx_tls_brut FROM sessions').get();
  assert.equal(s.ctx_asn, '3215');
  assert.match(s.ctx_tls, /^[0-9a-f]{16}$/);
  const cookies = Object.fromEntries(login.cookies.filter(x => x.value).map(x => [x.name, x.value]));
  // Même session, autre logiciel TLS (empreinte grossière changée) : noté « info », sans relever la gravité.
  await c.app.inject({ url: '/admin', cookies, remoteAddress: '203.0.113.7', headers: { host: 'localhost', ...(await edgeHeaders('/admin', { cf: { tlsCipher: 'AEAD-CHACHA20-POLY1305-SHA256' } })) } });
  // En-têtes fabriqués par un visiteur : écartés et signalés.
  await c.app.inject({ url: '/', remoteAddress: '198.51.100.20', headers: { host: 'localhost', 'x-bordure-asn': '1', 'x-bordure-sig': 'a'.repeat(64) } });
  await c.app.inject({ url: '/.env', remoteAddress: '203.0.113.7', headers: { host: 'localhost', ...(await edgeHeaders('/.env')) } });
  await flush();
  const change = sent.find(e => e.type === 'session_context_change');
  assert.equal(change.severity, 'info');
  assert.equal(change.detail.tls_change, true);
  const forged = sent.find(e => e.type === 'edge_signature_invalid');
  assert.equal(forged.detail.raison, 'signature fausse');
  assert.equal(forged.ip, '198.51.100.20');
  const trap = sent.find(e => e.type === 'malicious_honeypot');
  assert.equal(trap.detail.bordure.asn, '3215', 'contexte de la bordure dans les événements');
  // Confidentialité : la bordure est décrite quand elle est en place.
  assert.match((await c.app.inject('/confidentialite')).body, /filtre que nous faisons tourner chez Cloudflare/);
  // Configuration : clé trop courte ou égale à celle des envois refusée.
  const base = { DATA_DIR: tmp(t), VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
  assert.throws(() => loadConfig({ ...base, VIGIE_BORDURE_KEY: 'court' }), /32 caractères/);
  assert.throws(() => loadConfig({ ...base, VIGIE_BORDURE_KEY: KEY }), /différente/);
});

test('Vigie : blocages copiés dans KV (liste de la bordure, 2 minutes au moins entre deux écritures) ; constats lus dans Analytics Engine → quorum avec le site', async t => {
  const v = vigieOf(t, { start: Date.parse('2026-10-20T10:00:30Z') });
  const dir = tmp(t);
  const tokenFile = path.join(dir, 'cloudflare-token');
  fs.writeFileSync(tokenFile, 'jeton-cloudflare\n');
  const calls = [];
  let sql = { data: [] };
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.authorization, body: init.body });
    if (url.endsWith('/analytics_engine/sql')) return new Response(JSON.stringify(sql), { status: 200 });
    return new Response('{"success":true}', { status: 200 });
  };
  const account = 'a'.repeat(32), ns = 'b'.repeat(32);
  const edge = createEdge({ store: v.store, decisions: v.decisions, accountId: account, kvNamespace: ns, dataset: 'vigie_bordure', tokenFile, fetchImpl, now: v.now });
  t.after(() => edge.stop());
  assert.equal(await edge.push({ force: true }), true);
  assert.match(calls[0].url, new RegExp(`/accounts/${account}/storage/kv/namespaces/${ns}/values/blocages$`));
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].auth, 'Bearer jeton-cloudflare');
  assert.equal(JSON.parse(JSON.parse(calls[0].body).payload).usage, 'bordure');
  v.decisions.create({ kind: 'bloquer', cible: '203.0.113.9', portee: 'tout', duree: '1h', par: 'test' });
  assert.equal(await edge.push(), false, 'moins de 2 minutes après la précédente : reportée');
  v.clock.t += 121e3;
  assert.equal(await edge.push(), true);
  assert.match(JSON.parse(JSON.parse(calls.at(-1).body).payload).blocages[0].cible, /^203\.0\.113\.9/);
  // Analytics Engine : minute close depuis 2 minutes, une adresse avec 25 réponses 404 et une rafale de 150 pages.
  const bound = Math.floor((v.clock.t - 180e3) / 60e3) * 60e3;
  v.store.setting.set('bordure_curseur', bound - 5 * 60e3);
  const minute = bound / 1000 - 60;
  sql = { data: [
    { minute: String(minute), ip: '198.51.100.7', classe: 'page', statut: '404', pays: 'NL', asn: '14061', org: 'DigitalOcean', tls: 'a'.repeat(16), n: '25' },
    { minute: String(minute), ip: '198.51.100.8', classe: 'page', statut: '200', pays: 'US', asn: '16509', org: 'Amazon', tls: 'b'.repeat(16), n: '150' },
    { minute: String(minute), ip: '203.0.113.9', classe: 'bloque', statut: '403', pays: 'FR', asn: '3215', org: 'Orange', tls: 'c'.repeat(16), n: '4' },
    { minute: String(minute), ip: 'pas-une-adresse', classe: 'page', statut: '404', pays: '', asn: '', org: '', tls: '', n: '99' },
    { minute: String(bound / 1000), ip: '198.51.100.7', classe: 'page', statut: '404', pays: 'NL', asn: '14061', org: '', tls: '', n: '50' },
    { minute: String(minute), ip: 'bordure', classe: 'liste_refusee', statut: '', pays: '', asn: '', org: '', tls: '', note: 'signature fausse', n: '1' },
  ] };
  assert.equal(await edge.read(), 3);
  assert.match(calls.at(-1).body, /timestamp >= toDateTime\('[0-9-]+ [0-9:]+'\) AND timestamp < toDateTime/, 'période bornée par le curseur');
  assert.equal(v.store.setting.get('bordure_curseur'), bound, 'curseur à la borne, même sans point');
  assert.ok(v.db.prepare("SELECT 1 FROM events WHERE type = 'vigie_bordure_erreur' AND detail LIKE '%liste refusée par le Worker%'").get(), 'liste refusée par le Worker : signalée');
  const evs = v.db.prepare("SELECT type, ip, composant, confiance, survenu_a FROM events WHERE composant = 'bordure' ORDER BY seq").all();
  assert.deepEqual(evs.map(e => [e.type, e.ip]), [['bordure_erreurs', '198.51.100.7'], ['bordure_rafale', '198.51.100.8'], ['bordure_blocage', '203.0.113.9']]);
  assert.equal(evs[0].confiance, 'constaté');
  assert.equal(evs[0].survenu_a, minute * 1000, 'heure de la minute vue en bordure');
  assert.equal(await edge.read(), 0, 'minute déjà lue : rien en double ; minute en cours : pas encore');
  // Quorum (arbitrage NC3-1) : les 404 vues en bordure sont les mêmes que celles du site → contexte, pas une seconde
  // source ; une rafale de pages (que le site ne voit pas) en est une.
  const site404 = ip => { for (let i = 0; i < 4; i++) v.store.add([{ id: crypto.randomUUID(), recu_a: v.now(), survenu_a: v.now(), type: 'malicious_excess_404', severity: 'bas', canal: 'ingestion signée', confiance: 'rapporté', composant: 'site · public', ip, ip_net: '198.51.100.0' }]); };
  site404('198.51.100.7');
  assert.ok(v.engine.current('ip', '198.51.100.7').score >= 7, 'points de contexte comptés');
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM alerts WHERE regle = 'entite.score' AND entite_key = '198.51.100.7'").pluck().get(), 0, 'une seule source réelle : pas d’alerte');
  site404('198.51.100.8');
  const a = v.db.prepare("SELECT * FROM alerts WHERE regle = 'entite.score' AND entite_key = '198.51.100.8'").get();
  assert.deepEqual(JSON.parse(a.sources), ['bordure', 'site']);
  // Vigie arrêtée plus d'une heure : la période manquante est signalée.
  v.clock.t += 3 * 3600e3;
  sql = { data: [] };
  await edge.read();
  assert.ok(v.db.prepare("SELECT 1 FROM events WHERE type = 'vigie_bordure_erreur' AND detail LIKE '%période non lue%'").get());
  // Lecture en échec (jeton refusé) : signalée une fois par heure, alerte « bordure muette ».
  const failing = createEdge({ store: v.store, decisions: v.decisions, accountId: account, kvNamespace: ns, dataset: 'vigie_bordure', tokenFile, fetchImpl: async () => new Response('{}', { status: 403 }), now: v.now });
  t.after(() => failing.stop());
  v.clock.t += 5 * 60e3;
  await failing.read(); await failing.read();
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_bordure_erreur' AND detail LIKE ?").pluck().get('%"operation":"lecture"%'), 1);
  assert.ok(v.db.prepare("SELECT 1 FROM alerts WHERE regle = 'sigma.bordure_muette'").get());
  // Configuration de la Vigie : identifiants contrôlés, jeton en fichier obligatoire.
  const env = { VIGIE_DATA_DIR: dir, VIGIE_SITE_BACKUP_DIR: dir, VIGIE_INGEST_KEY: KEY, VIGIE_LOG_KEY: LOG_KEY, VIGIE_DECISIONS_PRIVATE_KEY: VIGIE_KEYS.priv64 };
  assert.equal(loadVigieConfig(env).bordure, null, 'facultative');
  assert.throws(() => loadVigieConfig({ ...env, VIGIE_CF_ACCOUNT_ID: account }), /VIGIE_CF_KV_NAMESPACE/);
  assert.throws(() => loadVigieConfig({ ...env, VIGIE_CF_ACCOUNT_ID: account, VIGIE_CF_KV_NAMESPACE: ns, VIGIE_CF_TOKEN_FILE: path.join(dir, 'absent') }), /introuvable/);
  assert.equal(loadVigieConfig({ ...env, VIGIE_CF_ACCOUNT_ID: account, VIGIE_CF_KV_NAMESPACE: ns, VIGIE_CF_TOKEN_FILE: tokenFile }).bordure.dataset, 'vigie_bordure');
});

test('bordure : battement du Worker toutes les 5 minutes ; son absence signalée en 20 minutes (quota épuisé, Worker retiré)', async t => {
  const points = [];
  resetCache();
  await scheduled({}, { DECISIONS: { get: async () => null }, DECISIONS_PUBKEY: VIGIE_KEYS.pub64, ANALYTICS: { writeDataPoint: p => points.push(p) } });
  assert.equal(points[0].indexes[0], 'bordure');
  assert.equal(points[0].blobs[0], 'battement');
  const v = vigieOf(t, { start: Date.parse('2026-10-20T10:00:30Z') });
  const dir = tmp(t);
  const tokenFile = path.join(dir, 'cloudflare-token');
  fs.writeFileSync(tokenFile, 'jeton');
  let rows = [];
  const edge = createEdge({ store: v.store, decisions: v.decisions, accountId: 'a'.repeat(32), kvNamespace: 'b'.repeat(32), dataset: 'vigie_bordure', tokenFile, now: v.now,
    fetchImpl: async () => new Response(JSON.stringify({ data: rows }), { status: 200 }) });
  t.after(() => edge.stop());
  const beat = ms => ({ minute: String(Math.floor(ms / 60e3) * 60), ip: 'bordure', classe: 'battement', statut: '', pays: '', asn: '', org: '', tls: '', note: 'liste 3, 0 blocage(s)', n: '1' });
  rows = [beat(v.clock.t - 4 * 60e3)];
  await edge.read();
  assert.equal(v.store.setting.get('bordure_dernier_battement').etat, 'liste 3, 0 blocage(s)');
  rows = [];
  for (let i = 0; i < 4; i++) { v.clock.t += 5 * 60e3; await edge.read(); }
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_bordure_silence'").pluck().get(), 1);
  assert.ok(v.db.prepare("SELECT 1 FROM alerts WHERE regle = 'sigma.bordure_muette'").get());
  // Le battement revient : la prochaine absence sera de nouveau signalée.
  v.clock.t += 5 * 60e3;
  rows = [beat(v.clock.t - 4 * 60e3)];
  await edge.read();
  assert.equal(v.store.setting.get('bordure_silence_signale'), false);
});
