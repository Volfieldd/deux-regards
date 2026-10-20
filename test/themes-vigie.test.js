import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as, visitor } from './carnet-helpers.js';
import { DESIGNS, SECTIONS } from '../server/designs.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions } from '../vigie/decisions.js';
import { createIngest } from '../vigie/ingest.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createEngine } from '../vigie/moteur.js';

const KEY = 'themes-test-ingest-0123456789abcdef';
const ROUTE = '/admin/apparence/compositions';

// Les vrais récepteur, stockage chaîné et moteur de la Vigie, dans deux bases jetables.
// Aucun serveur externe ; inject conserve la vérification HMAC sur les octets envoyés.
async function world(t) {
  let ingest;
  const c = await setup(t, {
    env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { timers: false, pollDecisions: false, send: async (payload, headers) => {
      const r = await ingest.inject({ method: 'POST', url: '/v1/events', payload, headers });
      assert.equal(r.statusCode, 200);
      assert.equal(r.json().ecartes, 0, 'chaque événement émis accepté');
    } },
  });
  const db = openVigieDb(path.join(c.dir, 'vigie-test.db'));
  const store = createStore({ db, logKey: 'themes-test-log-0123456789abcdefgh' });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey });
  const switches = createSwitches({ store });
  const engine = createEngine({ store, decisions, switches });
  store.onAdded(rows => engine.process(rows));
  ingest = createIngest({ store, decisions, ingestKey: KEY });
  t.after(async () => { await ingest.close(); db.close(); });
  const session = () => {
    const actor = as(c, { sub: 'themes-admin', roles: ['admin'] });
    // Contexte du navigateur de l'aide as() : la fixture n'est pas une session forgée.
    c.db.prepare("UPDATE sessions SET ctx_net = '192.0.2.0', ctx_ua = 'Safari · macOS' WHERE sub = ?").run(actor.sub);
    return actor;
  };
  const admin = session();
  await c.app.ready();
  const flush = () => c.app.securite.flush();
  const events = type => db.prepare('SELECT * FROM events WHERE type = ? ORDER BY seq').all(type)
    .map(e => ({ ...e, detail: JSON.parse(e.detail || 'null') }));
  const publicChanges = () => events('config_public_changed').filter(e => e.detail.cles?.includes('public_design'));
  const alerts = () => db.prepare('SELECT * FROM alerts').all();
  await flush();
  const initialAlerts = alerts();
  return { ...c, admin, session, initialAlerts, flush, events, publicChanges, alerts, store, visit: visitor(c) };
}

test('thèmes : réception signée, avant/après complet, chaîne intacte, aucun faux signal lors des choix normaux', async t => {
  const c = await world(t);
  const sections = Object.fromEntries(Object.keys(SECTIONS).map(s => [`section_${s}`, 'hors-cadre']));
  const expected = { default: 'obscura', ...Object.fromEntries(Object.keys(SECTIONS).map(s => [s, 'hors-cadre'])) };
  assert.equal((await c.admin.post(ROUTE, { default: 'obscura', ...sections })).statusCode, 303);
  await c.flush();
  let changes = c.publicChanges();
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].detail.valeurs.public_design, { avant: null, apres: expected });
  assert.equal(changes[0].sub, c.admin.sub);
  assert.equal(changes[0].route, ROUTE);
  assert.equal(changes[0].severity, 'bas');
  assert.equal(changes[0].canal, 'ingestion signée');
  assert.equal(changes[0].detail.contact_change, false);
  assert.equal(changes[0].detail.tronque, undefined);
  assert.match((await c.visit('/')).body, /data-composition="hors-cadre"/);
  // Réenregistrer le même choix et prévisualiser ne sont pas des changements publics.
  await c.admin.post(ROUTE, { default: 'obscura', ...sections });
  await c.admin.post('/admin/apparence/apercu-v2', { vue: 'panoramique', vers: '/' });
  await c.flush();
  assert.equal(c.publicChanges().length, 1);
  assert.match((await c.admin.get('/')).body, /data-composition="panoramique"/);
  assert.match((await c.visit('/')).body, /data-composition="hors-cadre"/);
  for (const id of Object.keys(DESIGNS)) {
    assert.equal((await c.admin.json(ROUTE, { default: id })).statusCode, 200);
  }
  assert.equal((await c.admin.post(ROUTE, { reset: '1' })).statusCode, 303);
  await c.flush();
  changes = c.publicChanges();
  assert.equal(changes.length, 11);
  assert.deepEqual(changes.at(-1).detail.valeurs.public_design, { avant: { default: 'hors-cadre' }, apres: null });
  assert.equal(c.app.publicVersion.designSettings(), null);
  assert.deepEqual(c.events('input_validation_fail'), []);
  assert.deepEqual(c.events('malicious_input'), []);
  assert.deepEqual(c.alerts(), c.initialAlerts, 'aucune alerte supplémentaire après la création du compte de test');
  assert.equal(c.store.verify().ok, true);
});

test('thèmes : refus atomiques, CSRF et permission observables, sans enregistrer les saisies ni les jetons', async t => {
  const c = await world(t);
  await c.admin.post(ROUTE, { default: 'obscura' });
  const initial = c.app.publicVersion.designSettings();
  const bad = [
    { default: 'SECRET-theme' }, { default: ['obscura'] }, { default: 'constructor' },
    { default: 'contact', section_carnets: { id: 'obscura' } },
    { default: 'contact', section_SECRET: 'v1' },
    { reset: '1', default: 'contact' }, { reset: '0', default: 'contact' },
  ];
  for (const b of bad) {
    assert.equal((await c.admin.post(ROUTE, b)).statusCode, 400);
    assert.deepEqual(c.app.publicVersion.designSettings(), initial);
  }
  assert.equal((await c.admin.post(ROUTE, { default: 'contact', _csrf: 'SECRET-csrf' })).statusCode, 403);
  const limited = as(c, { sub: 'themes-limited', roles: ['photographe'] });
  assert.equal((await limited.post(ROUTE, { default: 'contact' })).statusCode, 403);
  await c.flush();
  assert.equal(c.events('input_validation_fail').filter(e => e.route === ROUTE).length, bad.length);
  assert.ok(c.events('authz_csrf_fail').some(e => e.route === ROUTE));
  assert.ok(c.events('authz_fail').some(e => e.route === ROUTE && e.detail.permission === 'site.apparence'));
  assert.equal(c.publicChanges().length, 1);
  assert.deepEqual(c.app.publicVersion.designSettings(), initial);
  for (const type of ['input_validation_fail', 'authz_csrf_fail', 'authz_fail'])
    assert.doesNotMatch(JSON.stringify(c.events(type)), /SECRET/);
});

test('thèmes : identité à confirmer, verrouillage et blocage Vigie empêchent l’écriture et le retour arrière', async t => {
  const c = await world(t);
  await c.admin.post(ROUTE, { default: 'obscura' });
  let version = 0;
  const decide = extra => {
    const payload = JSON.stringify({ usage: 'site', version: ++version, emis_a: Date.now(),
      blocages: [], sessions: [], comptes: [], gels: [], verrouillage: null, verifications: [], ...extra });
    c.app.decisions.accept({ payload, signature: crypto.sign(null, Buffer.from(payload), VIGIE_KEYS.privateKey).toString('base64') });
  };
  const fin = Date.now() + 3600e3;
  for (const [decision, status] of [
    [{ verifications: [{ sub: c.admin.sub, depuis: Date.now() - 1000, fin }] }, 403],
    [{ verrouillage: { fin, comptes: ['autre-compte'], adresses: [] } }, 401],
    [{ gels: [{ sub: c.admin.sub, fin }] }, 401],
    [{ blocages: [{ cible: '192.0.2.0/24', portee: 'admin', fin }] }, 403],
  ]) {
    decide({});
    const actor = c.session();
    c.db.prepare('UPDATE sessions SET auth_time = auth_time - 60000').run();
    decide(decision);
    for (const body of [{ default: 'contact' }, { reset: '1' }]) {
      assert.equal((await actor.json(ROUTE, body)).statusCode, status, JSON.stringify(decision));
      assert.deepEqual(c.app.publicVersion.designSettings(), { default: 'obscura', sections: {} });
    }
  }
  decide({});
  assert.equal((await c.session().json(ROUTE, { default: 'contact' })).statusCode, 200);
  await c.flush();
  assert.ok(c.events('authz_reauth_required').some(e => e.route === ROUTE));
  assert.ok(c.events('authz_blocked').some(e => e.route === ROUTE));
  assert.ok(c.events('session_destroyed').some(e => e.route === ROUTE));
  assert.equal(c.publicChanges().length, 2);
});

test('thèmes : configuration altérée en base ignorée et jamais recopiée en clair dans la Vigie', async t => {
  const c = await world(t);
  await c.admin.post(ROUTE, { default: 'obscura' });
  c.db.prepare("UPDATE settings SET value = ? WHERE key = 'public_design'")
    .run(JSON.stringify({ default: 'SECRET-<script>', sections: {} }));
  assert.equal(c.app.publicVersion.designSettings(), null);
  assert.doesNotMatch((await c.visit('/')).body, /SECRET|data-composition=/);
  // Le surveillant commun observe les écritures hors application au prochain POST authentifié.
  await c.admin.post('/admin/theme', { theme: 'dark' });
  await c.flush();
  assert.deepEqual(c.publicChanges().at(-1).detail.valeurs.public_design, { avant: { default: 'obscura' }, apres: 'invalide' });
  assert.doesNotMatch(JSON.stringify(c.publicChanges()), /SECRET|<script>/);
});

test('thèmes : changement après reprise de session corrélé par la Vigie en DS23', async t => {
  const c = await world(t);
  const otherBrowser = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/130.0' };
  assert.equal((await c.admin.get('/', otherBrowser)).statusCode, 200);
  await c.flush();
  assert.equal((await c.admin.post(ROUTE, { default: 'obscura' }, otherBrowser)).statusCode, 303);
  await c.flush();
  const alert = c.alerts().find(a => a.regle === 'sigma.reglage_apres_session_reprise');
  assert.ok(alert, 'le nouvel événement traverse la corrélation existante');
  assert.equal(alert.cas, 'DS23');
  assert.equal(alert.gravite, 'haut');
  assert.equal(alert.entite_key, c.admin.sub);
  assert.equal(c.publicChanges().length, 1);
});
