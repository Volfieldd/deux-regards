import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VIGIE_KEYS } from './helpers.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions } from '../vigie/decisions.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createEngine } from '../vigie/moteur.js';
import { createIngest } from '../vigie/ingest.js';
import { loadVigieConfig } from '../vigie/config.js';
import { run as cli, keys } from '../vigie/cli.js';

// Vigie, phase C1 (recadrage du 17 octobre 2026) : entités et score composite, quorum entre sources (D18), exceptions à
// source unique, alertes, modes par règle, réponses automatiques prudentes.
const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const KEY = 'cle-de-signature-vigie-0123456789abcdef';

function engineOf(t, { start = Date.parse('2026-10-20T10:00:00Z') } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-moteur-'));
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const clock = { t: start };
  const now = () => clock.t;
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now });
  store.onAdded(rows => engine.process(rows));
  const ev = (type, severity, extra = {}) => ({ id: crypto.randomUUID(), recu_a: now(), survenu_a: now(), type, severity, canal: 'ingestion signée', confiance: 'rapporté', composant: 'site · public', ...extra });
  const site = (type, severity, extra) => store.add([ev(type, severity, extra)]);
  const zitadel = (type, severity, extra) => store.add([ev(type, severity, { composant: 'zitadel', canal: 'API Zitadel', confiance: 'constaté', ...extra })]);
  const alerts = () => db.prepare('SELECT * FROM alerts ORDER BY id').all();
  return { dir, db, store, decisions, switches, engine, clock, site, zitadel, alerts };
}

test('quorum : le site seul n’ouvre pas d’alerte de score ; Zitadel en plus sur le même compte, si', async t => {
  const v = engineOf(t);
  for (let i = 0; i < 6; i++) v.site('authz_csrf_fail', 'moyen', { sub: 'zitadel-123', ip: '203.0.113.9', ip_net: '203.0.113.0' });
  assert.ok(v.engine.current('compte', 'zitadel-123').score >= 7, 'seuil franchi par le site seul');
  assert.equal(v.alerts().length, 0, 'une seule source : pas d’alerte');
  v.zitadel('zitadel_echec', 'moyen', { sub: 'zitadel-123' });
  const [a] = v.alerts();
  assert.equal(a.regle, 'entite.score');
  assert.equal(a.entite_kind, 'compte');
  assert.deepEqual(JSON.parse(a.sources), ['site', 'zitadel']);
  assert.equal(a.mode, 'observer', 'mois d’observation (D3)');
  // Les signaux suivants s'ajoutent à la même alerte.
  v.zitadel('zitadel_echec', 'moyen', { sub: 'zitadel-123' });
  assert.equal(v.alerts().length, 1);
  assert.equal(v.alerts()[0].compteur, 2);
  assert.ok(v.db.prepare('SELECT COUNT(*) FROM alert_events WHERE alert_id = ?').pluck().get(a.id) >= 2);
  assert.equal(v.store.verify().ok, true, 'alertes chaînées dans le journal');
});

test('décroissance : des signaux espacés de plusieurs heures ne s’additionnent pas', async t => {
  const v = engineOf(t);
  for (let i = 0; i < 4; i++) {
    v.site('malicious_honeypot', 'moyen', { ip: '198.51.100.7', ip_net: '198.51.100.0' });
    v.zitadel('zitadel_echec', 'moyen', { ip: '198.51.100.7' });
    v.clock.t += 4 * 3600e3;
  }
  assert.equal(v.alerts().length, 0);
  assert.ok(v.engine.current('ip', '198.51.100.7').score < 7);
  // Rapprochés : seuil franchi, deux sources : alerte.
  for (let i = 0; i < 2; i++) { v.site('malicious_honeypot', 'moyen', { ip: '198.51.100.7' }); v.zitadel('zitadel_echec', 'moyen', { ip: '198.51.100.7' }); }
  assert.equal(v.alerts().length, 1);
});

test('exceptions à source unique : rôle donné hors de l’application → critique, gel et révocation (mode bloquer, D3)', async t => {
  const v = engineOf(t);
  v.site('privilege_permissions_changed', 'critique', { composant: 'site · admin', detail: JSON.stringify({ compte: 'zitadel-intrus', hors_application: true }) });
  const [a] = v.alerts();
  assert.equal(a.regle, 'sigma.role_hors_application');
  assert.equal(a.gravite, 'critique');
  assert.equal(a.entite_key, 'zitadel-intrus');
  assert.deepEqual(v.decisions.active().map(d => [d.kind, d.cible, d.auto]), [['geler', 'zitadel-intrus', 1], ['revoquer_compte', 'zitadel-intrus', 1]]);
  assert.match(a.reponse || v.alerts()[0].reponse, /geler zitadel-intrus ; revoquer_compte zitadel-intrus/);
  // Même alerte de nouveau : pas de décision en double.
  v.site('privilege_permissions_changed', 'critique', { composant: 'site · admin', detail: JSON.stringify({ compte: 'zitadel-intrus', hors_application: true }) });
  assert.equal(v.decisions.active().length, 2);
});

test('cookie rejoué depuis un autre appareil → révocation des sessions du compte ; interrupteur des blocages arrêté : aucune réponse', async t => {
  const v = engineOf(t);
  v.switches.set('blocages', 'arret', { duree: '1h', par: 'test' });
  v.site('session_use_after_expire', 'haut', { composant: 'site · connexion', sub: 'zitadel-a', detail: JSON.stringify({ meme_reseau_et_navigateur: false }) });
  assert.equal(v.decisions.active().length, 0);
  assert.match(v.alerts()[0].reponse, /interrupteur des blocages arrêté/);
  v.clock.t += 2 * 3600e3;                                                 // interrupteur rallumé seul
  v.site('session_use_after_expire', 'haut', { composant: 'site · connexion', sub: 'zitadel-b', detail: JSON.stringify({ meme_reseau_et_navigateur: false }) });
  assert.deepEqual(v.decisions.active().map(d => [d.kind, d.cible]), [['revoquer_compte', 'zitadel-b']]);
  // Même réseau et même navigateur (vieil onglet) : pas une exception.
  v.site('session_use_after_expire', 'moyen', { composant: 'site · connexion', sub: 'zitadel-c', detail: JSON.stringify({ meme_reseau_et_navigateur: true }) });
  assert.equal(v.alerts().filter(a => a.entite_key === 'zitadel-c').length, 0);
});

test('modes : arrêt (rien), alerter ; détection arrêtée : rien ; blocage automatique d’une adresse jamais si liée à un compte', async t => {
  const v = engineOf(t);
  v.engine.setMode('sigma.configuration', 'arret', 'test');
  v.site('sys_config_changed', 'haut', { composant: 'site · système' });
  assert.equal(v.alerts().length, 0);
  v.switches.set('detection', 'arret', { duree: '1h', par: 'test' });
  v.site('sys_restore', 'haut', { composant: 'site · système' });
  assert.equal(v.alerts().length, 0);
  v.clock.t += 2 * 3600e3;
  // Score d'une adresse, mode « bloquer » : bloquée 24 h…
  v.engine.setMode('entite.score', 'bloquer', 'test');
  for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip: '192.0.2.66' }); v.zitadel('zitadel_echec', 'moyen', { ip: '192.0.2.66' }); }
  assert.deepEqual(v.decisions.active().filter(d => d.kind === 'bloquer').map(d => d.cible), ['192.0.2.66/32']);
  // … sauf une adresse vue avec un compte (on ne s'enferme pas dehors), ni une adresse de confiance.
  v.site('authn_login_success', 'info', { ip: '192.0.2.77', sub: 'zitadel-moi' });
  for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip: '192.0.2.77' }); v.zitadel('zitadel_echec', 'moyen', { ip: '192.0.2.77' }); }
  const a = v.alerts().find(x => x.entite_key === '192.0.2.77' && x.entite_kind === 'ip');
  assert.match(a.reponse, /liée à un compte/);
  assert.ok(!v.decisions.active().some(d => d.cible === '192.0.2.77/32'));
});

test('exceptions : intégrité des comptes, chaîne rompue, Zitadel critique, saisie depuis un compte de l’admin', async t => {
  const v = engineOf(t);
  v.site('sys_state', 'critique', { composant: 'site · système', detail: JSON.stringify({ declencheurs_absents: ['account_changes_update'] }) });
  v.store.own('log_integrity_fail', { detail: { raison: 'test' } });
  v.zitadel('zitadel_droits', 'critique', { sub: 'admin-9', detail: JSON.stringify({ type_zitadel: 'user.impersonated' }) });
  v.site('malicious_input', 'haut', { composant: 'site · admin', sub: 'zitadel-x' });
  assert.deepEqual(v.alerts().map(a => [a.regle, a.gravite]), [
    ['sigma.integrite_comptes', 'critique'], ['sigma.chaine_rompue', 'critique'], ['sigma.zitadel_critique', 'critique'], ['sigma.saisie_compte_admin', 'haut'],
  ]);
});

test('reprise : le score et les sources survivent à un redémarrage du moteur ; classement d’une alerte', async t => {
  const v = engineOf(t);
  for (let i = 0; i < 3; i++) v.site('malicious_honeypot', 'moyen', { ip: '203.0.113.50' });
  const again = createEngine({ store: v.store, decisions: v.decisions, switches: v.switches, now: () => v.clock.t });
  const e = again.current('ip', '203.0.113.50');
  assert.equal(Math.round(e.score), 6);
  assert.deepEqual(Object.keys(e.contributions), ['site']);
  v.site('sys_restore', 'haut', { composant: 'site · système' });
  const id = v.alerts()[0].id;
  assert.equal(v.engine.classify(id, { classement: 'test', note: 'restauration volontaire', par: 'test' }), 1);
  assert.equal(v.alerts()[0].statut, 'close');
  // Une nouvelle restauration ouvre une nouvelle alerte (l'ancienne est close).
  v.site('sys_restore', 'haut', { composant: 'site · système' });
  assert.equal(v.alerts().length, 2);
});

test('ligne de commande : alertes, détail avec l’origine du signal, entités, règles, modes, seuils, confiance', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const config = loadVigieConfig({ VIGIE_DATA_DIR: dir, ...keys().vigie });
  const db = openVigieDb(config.databasePath);
  const store = createStore({ db, logKey: config.logKey });
  const decisions = createDecisions({ store, privateKey: config.decisionsKey });
  const switches = createSwitches({ store });
  const engine = createEngine({ store, decisions, switches });
  store.onAdded(rows => engine.process(rows));
  store.add([{ id: crypto.randomUUID(), type: 'sys_config_changed', severity: 'haut', composant: 'site · système', emetteur: 'server/securite · configuration', canal: 'ingestion signée', confiance: 'rapporté' }]);
  db.close();
  assert.match(cli(['alertes'], { config }), /#1 {2}haut +ouverte +sigma\.configuration {2}site configuration/);
  assert.match(cli(['alerte', '1'], { config }), /D’où vient le signal :\n.*sys_config_changed \(haut\) {2}site · système · server\/securite · configuration · rapporté/);
  assert.match(cli(['regles'], { config }), /sigma\.cookie_rejoue +bloquer +DS1/);
  assert.match(cli(['regle', 'entite.score', 'alerter'], { config }), /alerter/);
  assert.throws(() => cli(['regle', 'inconnue', 'alerter'], { config }), /règle inconnue/);
  assert.match(cli(['seuil', 'ip', '9'], { config }), /9 points/);
  assert.match(cli(['confiance', 'ajouter', '203.0.113.1'], { config }), /203\.0\.113\.1/);
  assert.match(cli(['prendre', '1'], { config }), /prise en charge/);
  assert.match(cli(['classer', '1', 'faux_positif', '--note', 'changement prévu'], { config }), /close \(faux_positif\)/);
  assert.equal(cli(['alertes'], { config }), 'Aucune alerte.');
});

test('bout en bout : un lot signé du site et un événement Zitadel sur le même compte ouvrent une alerte de score', async t => {
  const v = engineOf(t, { start: Date.now() });
  const ingest = createIngest({ store: v.store, decisions: v.decisions, ingestKey: KEY, now: () => v.clock.t });
  t.after(() => ingest.close());
  const lot = JSON.stringify({ emetteur: 'site', envoye_a: Date.now(), lot: Array.from({ length: 6 }, () => ({ v: 1, id: crypto.randomUUID(), type: 'authz_csrf_fail', severity: 'moyen',
    origine: { composant: 'site · admin', emetteur: 'test' }, sub: 'zitadel-777', ip: '203.0.113.20', ip_net: '203.0.113.0' })) });
  const ts = String(v.clock.t), nonce = crypto.randomBytes(16).toString('hex');
  const res = await ingest.inject({ method: 'POST', url: '/v1/events', payload: lot, headers: { 'x-vigie-ts': ts, 'x-vigie-nonce': nonce, 'x-vigie-sig': crypto.createHmac('sha256', KEY).update(`${ts}.${nonce}.${lot}`).digest('hex') } });
  assert.equal(res.statusCode, 200);
  assert.equal(v.alerts().length, 0);
  v.zitadel('zitadel_echec', 'moyen', { sub: 'zitadel-777' });
  assert.deepEqual(v.alerts().map(a => [a.entite_kind, a.entite_key, JSON.parse(a.sources).join('+')]), [['compte', 'zitadel-777', 'site+zitadel']]);
});
