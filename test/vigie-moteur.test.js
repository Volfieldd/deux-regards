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
import { createDecisionsClient } from '../server/securite/decisions.js';
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
  // Contrôle des rôles déjà réussi (sans administrateur) : sinon aucun blocage automatique d'adresse.
  store.setting.set('controle_roles_admins', { administrateurs: [], instantane_a: start });
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
  v.switches.set('blocages', 'arret', { duree: '1h', par: 'test', motif: 'essai' });
  v.site('session_use_after_expire', 'haut', { composant: 'site · connexion', sub: 'zitadel-a', detail: JSON.stringify({ meme_reseau_et_navigateur: false }) });
  assert.equal(v.decisions.active().length, 0);
  assert.match(v.alerts().find(a => a.regle === 'sigma.cookie_rejoue').reponse, /interrupteur des blocages arrêté/);
  assert.ok(v.alerts().find(a => a.regle === 'sigma.surveillance_reduite' && a.entite_key === 'interrupteur:blocages'), 'arrêt signalé (surveillance réduite)');
  v.clock.t += 2 * 3600e3;                                                 // interrupteur rallumé seul
  v.site('session_use_after_expire', 'haut', { composant: 'site · connexion', sub: 'zitadel-b', detail: JSON.stringify({ meme_reseau_et_navigateur: false }) });
  assert.deepEqual(v.decisions.active().map(d => [d.kind, d.cible]), [['revoquer_compte', 'zitadel-b']]);
  // Même réseau et même navigateur (vieil onglet) : pas une exception.
  v.site('session_use_after_expire', 'moyen', { composant: 'site · connexion', sub: 'zitadel-c', detail: JSON.stringify({ meme_reseau_et_navigateur: true }) });
  assert.equal(v.alerts().filter(a => a.entite_key === 'zitadel-c').length, 0);
});

test('modes : arrêt (rien), alerter ; détection arrêtée : rien ; blocage automatique jamais pour une adresse d’administrateur ou privée', async t => {
  const v = engineOf(t);
  assert.throws(() => v.engine.setMode('sigma.configuration', 'arret', 'test'), /pour une durée/);
  assert.throws(() => v.engine.setMode('sigma.surveillance_reduite', 'arret', 'test', { duree: '1h' }), /reste en mode alerter/);
  v.engine.setMode('sigma.configuration', 'arret', 'test', { duree: '1h', motif: 'essai' });
  v.site('sys_config_changed', 'haut', { composant: 'site · système' });
  const real = () => v.alerts().filter(a => a.regle !== 'sigma.surveillance_reduite');
  assert.equal(real().length, 0, 'règle arrêtée : rien');
  assert.ok(v.alerts().some(a => a.entite_key === 'regle:sigma.configuration'), 'arrêt de la règle signalé');
  assert.throws(() => v.switches.set('detection', 'arret', { duree: '1h', par: 'test' }), /motif obligatoire/);
  v.switches.set('detection', 'arret', { duree: '1h', par: 'test', motif: 'essai' });
  v.site('sys_restore', 'haut', { composant: 'site · système' });
  assert.equal(real().length, 0, 'détection arrêtée : rien');
  assert.ok(v.alerts().some(a => a.entite_key === 'interrupteur:detection'), 'arrêt de la détection signalé malgré elle');
  // Passée la durée, la règle reprend son mode de départ.
  v.clock.t += 2 * 3600e3;
  assert.equal(v.engine.modeOf('sigma.configuration'), 'observer');
  v.clock.t -= 2 * 3600e3;
  v.clock.t += 2 * 3600e3;
  // Score d'une adresse, mode « bloquer » : bloquée 24 h…
  v.engine.setMode('entite.score', 'bloquer', 'test');
  for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip: '192.0.2.66' }); v.zitadel('zitadel_echec', 'moyen', { ip: '192.0.2.66' }); }
  assert.deepEqual(v.decisions.active().filter(d => d.kind === 'bloquer').map(d => d.cible), ['192.0.2.66/32']);
  // … sauf une adresse vue avec un administrateur (on ne s'enferme pas dehors), une adresse privée ou de confiance.
  v.store.setting.set('controle_roles_admins', { administrateurs: ['zitadel-moi'], instantane_a: v.clock.t });   // contrôle des rôles réussi
  v.site('authn_login_success', 'info', { ip: '192.0.2.77', sub: 'zitadel-moi' });
  for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip: '192.0.2.77' }); v.zitadel('zitadel_echec', 'moyen', { ip: '192.0.2.77' }); }
  const a = v.alerts().find(x => x.entite_key === '192.0.2.77' && x.entite_kind === 'ip');
  assert.match(a.reponse, /connexion d’administrateur/);
  assert.ok(!v.decisions.active().some(d => d.cible === '192.0.2.77/32'));
  // Un cookie d'administrateur rejoué depuis une autre adresse ne la protège pas (seule une connexion réussie compte).
  v.site('session_use_after_expire', 'haut', { ip: '192.0.2.214', sub: 'zitadel-moi', composant: 'site · connexion', detail: JSON.stringify({ meme_reseau_et_navigateur: true }) });
  for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip: '192.0.2.214' }); v.zitadel('zitadel_echec', 'moyen', { ip: '192.0.2.214' }); }
  assert.ok(v.decisions.active().some(d => d.cible === '192.0.2.214/32'), 'adresse du rejeu bloquée');
  // Un compte ordinaire ne protège pas son adresse (un attaquant qui ouvre un compte ne s'achète pas l'exemption).
  v.site('authn_login_success', 'info', { ip: '192.0.2.88', sub: 'zitadel-quelconque' });
  for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip: '192.0.2.88' }); v.zitadel('zitadel_echec', 'moyen', { ip: '192.0.2.88' }); }
  assert.ok(v.decisions.active().some(d => d.cible === '192.0.2.88/32'));
  for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip: '172.29.42.10' }); v.zitadel('zitadel_echec', 'moyen', { ip: '172.29.42.10' }); }
  assert.match(v.alerts().find(x => x.entite_key === '172.29.42.10').reponse, /adresse privée/);
  // IPv6 : le /64 entier (une machine change d'adresse à volonté dans son /64).
  for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip: '2001:db8:1:2::abcd' }); v.zitadel('zitadel_echec', 'moyen', { ip: '2001:db8:1:2::abcd' }); }
  assert.ok(v.decisions.active().some(d => d.cible === '2001:db8:1:2::/64'));
  // Sans contrôle des rôles réussi : les adresses des administrateurs sont inconnues, aucun blocage automatique.
  v.store.setting.set('controle_roles_admins', null);
  for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip: '192.0.2.200' }); v.zitadel('zitadel_echec', 'moyen', { ip: '192.0.2.200' }); }
  assert.match(v.alerts().find(x => x.entite_key === '192.0.2.200').reponse, /aucun contrôle des rôles réussi/);
});

test('blocage automatique : tout le /64 est exempté s’il contient une adresse protégée, même écrite autrement', async t => {
  for (const protection of ['confiance', 'administrateur']) await t.test(protection, t => {
    const v = engineOf(t);
    v.engine.setMode('entite.score', 'bloquer', 'test');
    const ip = '2001:0DB8:0001:0002:0000:0000:0000:0001';
    if (protection === 'confiance') v.store.setting.set('adresses_confiance', [{ ip, jusqua: v.clock.t + 3600e3 }]);
    else {
      v.store.setting.set('controle_roles_admins', { administrateurs: ['admin'], instantane_a: v.clock.t });
      // Plus de 200 adresses : la connexion protégée ne doit pas disparaître dans une troncature de la requête.
      for (let i = 0; i < 205; i++) v.site('session_created', 'info', { sub: 'admin', ip: `2001:db8:3:${i.toString(16)}::1` });
      v.site('authn_login_success', 'info', { sub: 'admin', ip });
    }
    const burst = ip => { for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip }); v.zitadel('zitadel_echec', 'moyen', { ip }); } };
    burst('2001:db8:1:2::2');
    burst('2001:db8:1:2::1');
    burst('2001:db8:1:3::2');
    const client = createDecisionsClient({ pubkey: VIGIE_KEYS.publicKey, storageDir: v.dir, now: () => v.clock.t });
    client.accept(v.decisions.signed());
    assert.equal(client.blocked(ip, '/'), null, 'la décision signée ne bloque pas l’adresse protégée');
    assert.equal(client.blocked('2001:db8:1:2::2', '/'), null, 'le voisin appartient au même réseau protégé');
    assert.ok(client.blocked('2001:db8:1:3::2', '/'), 'le /64 voisin reste bloquable');
  });
});

test('blocage automatique : aucune conclusion de sûreté après troncature ; confiance et connexion échues ne protègent plus', t => {
  const v = engineOf(t);
  v.engine.setMode('entite.score', 'bloquer', 'test');
  v.store.setting.set('controle_roles_admins', { administrateurs: ['admin'], instantane_a: v.clock.t });
  v.store.setting.set('adresses_confiance', [{ ip: '2001:db8:1:2::1', jusqua: v.clock.t - 1 }]);
  v.site('authn_login_success', 'info', { sub: 'admin', ip: '2001:db8:1:2::1', recu_a: v.clock.t - 31 * 864e5 });
  const burst = ip => { for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip }); v.zitadel('zitadel_echec', 'moyen', { ip }); } };
  burst('2001:db8:1:2::2');
  assert.ok(v.decisions.active().some(d => d.cible === '2001:db8:1:2::/64'));
  for (let i = 0; i < 1001; i++) v.site('session_created', 'info', { sub: 'admin', ip: `2001:db8:3:${i.toString(16)}::1` });
  burst('2001:db8:2:2::2');
  assert.ok(!v.decisions.active().some(d => d.cible === '2001:db8:2:2::/64'));
  assert.match(v.alerts().find(a => a.entite_key === '2001:db8:2:2::2').reponse, /contrôle.*incomplet/);
});

test('alerte : rouverte après 24 h de calme, aggravation notée, réponse rejouée si la décision a été levée', async t => {
  const v = engineOf(t);
  v.engine.setMode('entite.score', 'bloquer', 'test');
  const burst = () => { for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip: '198.51.100.5' }); v.zitadel('zitadel_echec', 'moyen', { ip: '198.51.100.5' }); } };
  burst();
  const [first] = v.alerts();
  assert.equal(first.gravite, 'moyen');
  // Levée à la main, l'attaque continue : au-delà de 15 minutes, la réponse est reprise sur la même alerte.
  v.decisions.lift({ all: true, par: 'test' });
  v.clock.t += 20 * 60e3;
  for (let i = 0; i < 6; i++) { v.site('malicious_input', 'moyen', { ip: '198.51.100.5' }); v.zitadel('zitadel_echec', 'moyen', { ip: '198.51.100.5' }); }
  const scores = () => v.alerts().filter(a => a.regle !== 'sigma.surveillance_reduite');
  assert.equal(scores().length, 1);
  assert.ok(v.decisions.active().some(d => d.cible === '198.51.100.5/32'), 'réponse rejouée');
  assert.equal(scores()[0].gravite, 'haut', 'score au double du seuil');
  const aggr = v.db.prepare("SELECT detail FROM events WHERE type = 'vigie_alerte'").pluck().all().map(JSON.parse).filter(d => d.action === 'aggravee' && d.id === first.id);
  assert.equal(aggr.length, 1);
  // Lever la réponse automatique a prévenu les Administrateurs (audit D3-B4).
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_surveillance_reduite'").pluck().get(), 1);
  // 24 h sans nouvel événement : la reprise ouvre une nouvelle alerte (et la notification qui va avec).
  v.clock.t += 25 * 3600e3;
  burst();
  assert.equal(scores().length, 2);
});

test('alertes ouvertes 7 jours sans événement : closes sans suite (une alerte prise en charge reste) ; administrateurs protégés : sauvegarde seulement', async t => {
  const v = engineOf(t);
  v.site('sys_config_changed', 'haut', { composant: 'site · système' });
  v.site('sys_restore', 'haut', { composant: 'site · système' });
  const [a1, a2] = v.alerts();
  v.engine.classify(a2.id, { classement: null, par: 'test', statut: 'en_cours' });
  v.clock.t += 6 * 864e5;
  v.engine.tick();
  assert.equal(v.alerts().filter(a => a.statut === 'close').length, 0);
  v.clock.t += 2 * 864e5;
  v.engine.tick();
  const after = v.alerts();
  assert.equal(after.find(a => a.id === a1.id).statut, 'close');
  assert.match(after.find(a => a.id === a1.id).note, /sans suite/);
  assert.equal(after.find(a => a.id === a2.id).statut, 'en_cours');
  // La déclaration du site seule ne protège plus une adresse (un site compromis pourrait mentir).
  v.engine.setMode('entite.score', 'bloquer', 'test');
  v.site('sys_state', 'info', { composant: 'site · système', detail: JSON.stringify({ administrateurs: ['zitadel-moi'] }) });
  v.site('authn_login_success', 'info', { ip: '192.0.2.99', sub: 'zitadel-moi' });
  for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip: '192.0.2.99' }); v.zitadel('zitadel_echec', 'moyen', { ip: '192.0.2.99' }); }
  assert.ok(v.decisions.active().some(d => d.cible === '192.0.2.99/32'));
});

test('file du moteur : curseur dans la base, reprise et sources indépendantes préservées lors d’un délestage', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-file-'));
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const now = () => Date.parse('2026-10-20T10:00:00Z');
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const ev = (type, severity, extra = {}) => ({ id: crypto.randomUUID(), recu_a: now(), survenu_a: now(), type, severity, canal: 'ingestion signée', confiance: 'rapporté', composant: 'site · système', ...extra });
  store.add([ev('sys_heartbeat', 'info')]);
  // Premier démarrage : l'historique n'est pas analysé ; ensuite, la file suit la base.
  const e1 = createEngine({ store, decisions, switches, now });
  const off = [];
  store.onAdded(() => { if (!off.length) e1.enqueue(); });
  store.add([ev('sys_config_changed', 'haut')]);
  assert.equal(db.prepare('SELECT COUNT(*) FROM alerts').pluck().get(), 0, 'pas encore : la réception n’attend pas le moteur');
  await e1.drain();
  assert.equal(db.prepare("SELECT COUNT(*) FROM alerts WHERE regle = 'sigma.configuration'").pluck().get(), 1);
  // Arrêt du moteur, événements reçus entre-temps : repris au redémarrage, une seule fois.
  off.push(1);
  store.add([ev('sys_restore', 'haut')]);
  const e2 = createEngine({ store, decisions, switches, now });
  assert.equal(e2.lag() >= 1, true);
  e2.enqueue(); await e2.drain();
  assert.equal(db.prepare("SELECT COUNT(*) FROM alerts WHERE regle = 'sigma.restauration'").pluck().get(), 1);
  e2.enqueue(); await e2.drain();
  assert.equal(db.prepare("SELECT compteur FROM alerts WHERE regle = 'sigma.restauration'").pluck().get(), 1, 'jamais deux fois');
  // Retard de plus de 100 000 provoqué par le site : son bruit ancien est délesté. Plus de 200 faits indépendants
  // imposent deux pages de lecture ; les gestes locaux qui ouvrent une alerte restent protégés sans devenir des sources
  // du quorum.
  store.add([
    ...Array.from({ length: 201 }, () => ev('zitadel_connexion', 'info', { composant: 'zitadel', canal: 'API Zitadel', confiance: 'constaté' })),
    ev('vigie_console_refus', 'moyen', { composant: 'vigie · console', canal: 'console de la Vigie' }),
    ev('vigie_console_arrivee', 'moyen', { composant: 'vigie · console', canal: 'console de la Vigie', sub: 'compte-arrivee' }),
    ev('vigie_console_droits', 'haut', { composant: 'vigie · console', canal: 'console de la Vigie', sub: 'compte-droits' }),
    ev('vigie_urgence', 'haut', { composant: 'vigie · ligne de commande', canal: 'ligne de commande', detail: { action: 'activé' } }),
    ev('zitadel_droits', 'critique', { composant: 'zitadel', canal: 'API Zitadel', confiance: 'constaté' }),
  ]);
  db.prepare("UPDATE sqlite_sequence SET seq = seq + 200000 WHERE name = 'events'").run();
  store.add([ev('sys_heartbeat', 'info')]);
  const e3 = createEngine({ store, decisions, switches, now });
  e3.enqueue(); await e3.drain();
  const saturation = db.prepare("SELECT detail FROM events WHERE type = 'vigie_moteur_sature' ORDER BY seq DESC LIMIT 1").pluck().get();
  assert.equal(JSON.parse(saturation).proteges, 206);
  const preservees = ['sigma.console_refus', 'sigma.console_arrivee', 'sigma.console_droits', 'sigma.mode_urgence', 'sigma.zitadel_critique'];
  for (const regle of preservees) assert.equal(db.prepare('SELECT COUNT(*) FROM alerts WHERE regle = ?').pluck().get(regle), 1, regle);
  assert.equal(e3.lag(), 0);
  e3.enqueue(); await e3.drain();
  for (const regle of preservees) assert.equal(db.prepare('SELECT compteur FROM alerts WHERE regle = ?').pluck().get(regle), 1, `${regle} jamais deux fois`);
  // Détection arrêtée : le signal qui annonce cette réduction reste l'exception analysée par le chemin ordinaire ; un
  // délestage ne doit pas le perdre non plus.
  switches.set('detection', 'arret', { duree: '1h', par: 'test', motif: 'maintenance' });
  assert.equal(db.prepare("SELECT COUNT(*) FROM alerts WHERE regle = 'sigma.surveillance_reduite' AND entite_key = 'interrupteur:detection'").pluck().get(), 0);
  db.prepare("UPDATE sqlite_sequence SET seq = seq + 200000 WHERE name = 'events'").run();
  store.add([ev('sys_heartbeat', 'info')]);
  const e4 = createEngine({ store, decisions, switches, now });
  e4.enqueue(); await e4.drain();
  assert.equal(db.prepare("SELECT COUNT(*) FROM alerts WHERE regle = 'sigma.surveillance_reduite' AND entite_key = 'interrupteur:detection'").pluck().get(), 1);
  assert.equal(e4.lag(), 0);
});

test('signal noté une fois par 10 minutes pour la même règle et la même entité ; clé d’entité sans caractères de contrôle', async t => {
  const v = engineOf(t);
  for (let i = 0; i < 5; i++) v.site('malicious_honeypot', 'moyen', { ip: '203.0.113.50' });
  const signals = () => v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_signal'").pluck().get();
  assert.equal(signals(), 1);
  v.clock.t += 11 * 60e3;
  v.site('malicious_honeypot', 'moyen', { ip: '203.0.113.50' });
  assert.equal(signals(), 2);
  v.site('authz_fail', 'bas', { sub: 'zitadel-\u001b[31mrouge' });
  assert.ok(v.engine.current('compte', 'zitadel-?[31mrouge'), 'séquence de terminal neutralisée');
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
  const config = loadVigieConfig({ VIGIE_DATA_DIR: dir, VIGIE_SITE_BACKUP_DIR: dir, ...keys().vigie });
  const db = openVigieDb(config.databasePath);
  const store = createStore({ db, logKey: config.logKey });
  const decisions = createDecisions({ store, privateKey: config.decisionsKey });
  const switches = createSwitches({ store });
  const engine = createEngine({ store, decisions, switches });
  store.onAdded(rows => engine.process(rows));
  store.add([{ id: crypto.randomUUID(), type: 'sys_config_changed', severity: 'haut', composant: 'site · système', emetteur: 'server/securite · configuration', canal: 'ingestion signée', confiance: 'rapporté' }]);
  db.close();
  assert.match(cli(['alertes'], { config }), /#1 {2}haut +ouverte +sigma\.configuration {2}site configuration/);
  assert.match(cli(['alerte', '1'], { config }), /D’où vient le signal \(heure de la source[^)]*\) :\n.*sys_config_changed \(haut\) {2}site · système · server\/securite · configuration · rapporté/);
  assert.match(cli(['regles'], { config }), /sigma\.cookie_rejoue +bloquer +DS1/);
  assert.match(cli(['regle', 'entite.score', 'alerter'], { config }), /alerter/);
  assert.throws(() => cli(['regle', 'inconnue', 'alerter'], { config }), /règle inconnue/);
  assert.throws(() => cli(['seuil', 'ip', '9'], { config }), /motif/, 'seuil relevé : motif obligatoire');
  assert.match(cli(['seuil', 'ip', '9', '--motif', 'trop de bruit'], { config }), /9 points/);
  assert.match(cli(['seuil', 'ip', '8'], { config }), /8 points/, 'seuil abaissé : sans motif');
  assert.throws(() => cli(['confiance', 'ajouter', '203.0.113.1'], { config }), /pour une durée/);
  assert.match(cli(['confiance', 'ajouter', '203.0.113.1', '--duree', '7j', '--motif', 'box'], { config }), /203\.0\.113\.1 \(jusqu'au/);
  assert.match(cli(['prendre', '1'], { config }), /prise en charge/);
  assert.match(cli(['classer', '1', 'faux_positif', '--note', 'changement prévu'], { config }), /close \(faux_positif\)/);
  assert.equal(cli(['alertes'], { config }), 'Aucune alerte.');
  // « controle --accepter » refusé tant qu'une alerte du contrôle des rôles est ouverte.
  const db2 = openVigieDb(config.databasePath);
  db2.prepare("INSERT INTO alerts (regle, entite_kind, entite_key, gravite, mode, premiere, derniere) VALUES ('sigma.controle_roles', 'site', 'comptes', 'critique', 'alerter', 1, 1)").run();
  db2.close();
  assert.throws(() => cli(['controle', '--accepter'], { config }), /encore ouverte : classez-la d'abord/);
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

test('modes pendant un arrêt (audit D3-B1) : descendre ou prolonger demande un motif et prévient ; le mode à reprendre est gardé', async t => {
  const v = engineOf(t);
  const reduites = () => v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_surveillance_reduite'").pluck().get();
  v.engine.setMode('entite.score', 'bloquer', 'test');
  v.engine.setMode('entite.score', 'arret', 'test', { duree: '30min', motif: 'maintenance courte' });
  const n = reduites();
  // Pendant l'arrêt, Observer est une descente par rapport à Bloquer : motif exigé, avis émis.
  assert.throws(() => v.engine.setMode('entite.score', 'observer', 'test'), /motif obligatoire/);
  v.engine.setMode('entite.score', 'observer', 'test', { motif: 'calibrage' });
  assert.equal(reduites(), n + 1);
  // Arrêter de nouveau, puis prolonger l'arrêt : motif exigé, et la règle reprend ensuite son mode d'avant.
  v.engine.setMode('entite.score', 'bloquer', 'test');
  v.engine.setMode('entite.score', 'arret', 'test', { duree: '1h', motif: 'essai' });
  assert.throws(() => v.engine.setMode('entite.score', 'arret', 'test', { duree: '1h' }), /motif obligatoire/);
  v.engine.setMode('entite.score', 'arret', 'test', { duree: '2h', motif: 'encore' });
  v.clock.t += 3 * 3600e3;
  assert.equal(v.engine.modeOf('entite.score'), 'bloquer', 'mode d’avant le premier arrêt repris');
  // Remonter pendant un arrêt (ou le finir) n'est pas une réduction.
  v.engine.setMode('entite.score', 'arret', 'test', { duree: '1h', motif: 'essai' });
  const m = reduites();
  v.engine.setMode('entite.score', 'bloquer', 'test');
  assert.equal(reduites(), m);
});

// ---------------------------------------------------------------------------------------------------------------------
// Coût (audit D3-D2, D3-D3)

test('top() (audit D3-D2) : une requête, présélection en SQL du score décru ; mêmes entités, même ordre que la lecture une à une', async t => {
  const v = engineOf(t);
  const t0 = v.clock.t;
  // La base a bien pow (fonctions mathématiques de SQLite, compilées dans better-sqlite3).
  assert.equal(v.db.prepare('SELECT pow(0.5, 2)').pluck().get(), 0.25);
  // L'algorithme d'avant, tel quel : chaque entité des 7 jours relue par sa clé, triée en mémoire.
  const SOURCE_MIN = 0.5;
  const avant = (limit = 20) => v.db.prepare('SELECT kind, key FROM entities WHERE derniere > ?').all(v.clock.t - 7 * 864e5).map(r => v.engine.current(r.kind, r.key, v.clock.t))
    .map(e => ({ ...e, sources: Object.entries(e.contributions).filter(([s, x]) => s !== 'menaces' && s !== 'contexte' && x >= SOURCE_MIN).map(([s]) => s).sort() }))
    .filter(e => e.score >= 0.1).sort((a, b) => b.score - a.score).slice(0, limit);
  // 3 000 entités : scores et âges variés, des ex aequo (même score, même instant : adresse et réseau d'un même
  // événement), des entités éteintes (score décru sous 0,1), d'autres vues il y a plus de 7 jours.
  let x = 7;
  const rnd = () => { x = (x * 48271) % 2147483647; return x / 2147483647; };
  const ins = v.db.prepare('INSERT INTO entities (kind, key, score, at, contributions, signaux, premiere, derniere) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  v.db.transaction(() => {
    for (let i = 0; i < 3000; i++) {
      const at = t0 - Math.floor(rnd() * 9 * 864e5);
      const score = i % 10 === 0 ? 4 : Math.round(rnd() * 400) / 10;
      const contributions = JSON.stringify({ site: score * 0.6, zitadel: score * 0.3, menaces: score * 0.1 });
      ins.run(i % 3 ? 'ip' : 'reseau', `198.51.${i >> 8}.${i & 255}`, score, at, contributions, 1 + (i % 5), at - 3600e3, at);
      if (i % 50 === 0) ins.run('compte', `zitadel-${i}`, score, at, contributions, 2, at, at);   // ex aequo exact
    }
  })();
  for (const decal of [0, 30 * 60e3, 5 * 3600e3, 3 * 864e5]) {
    v.clock.t = t0 + decal;
    for (const n of [1, 20, 50, 5000]) assert.deepEqual(v.engine.top(n), avant(n), `top(${n}) à +${decal / 60e3} min`);
  }
  // Rien d'actif : liste vide.
  v.clock.t = t0 + 20 * 864e5;
  assert.deepEqual(v.engine.top(50), []);
});

test('décisions (audit D3-D3) : colonne alerte_id hors de l’empreinte et de la liste signée ; purge à 13 mois qui garde les actives', async t => {
  const v = engineOf(t);
  const t0 = v.clock.t;
  v.engine.setMode('entite.score', 'bloquer', 'test');
  for (let i = 0; i < 3; i++) { v.site('malicious_input', 'moyen', { ip: '192.0.2.77' }); v.zitadel('zitadel_echec', 'moyen', { ip: '192.0.2.77' }); }
  const [a] = v.alerts();
  const auto = v.db.prepare('SELECT * FROM decisions WHERE auto = 1').get();
  assert.equal(auto.alerte_id, a.id, 'réponse automatique rattachée à son alerte');
  assert.equal(auto.motif, `alerte #${a.id}`);
  // Paramètre alerte, motif « alerte #n · … », motif sans numéro.
  const m1 = v.decisions.create({ kind: 'geler', cible: 'zitadel-1', duree: '24h', par: 'test', motif: 'enquête', alerte: 41 });
  const m2 = v.decisions.create({ kind: 'geler', cible: 'zitadel-2', duree: '24h', par: 'test', motif: 'alerte #42 · enquête' });
  const m3 = v.decisions.create({ kind: 'geler', cible: 'zitadel-3', duree: '24h', par: 'test', motif: 'vu dans l’alerte #43' });
  const col = id => v.db.prepare('SELECT alerte_id FROM decisions WHERE id = ?').pluck().get(id);
  assert.deepEqual([col(m1), col(m2), col(m3)], [41, 42, null]);
  assert.throws(() => v.decisions.create({ kind: 'geler', cible: 'zitadel-4', duree: '24h', par: 'test', alerte: 'x' }), /numéro d’alerte invalide/);
  // L'empreinte ne dépend pas de la colonne : la changer à la main ne rend pas la décision suspecte ; la liste signée ne
  // la contient pas.
  v.db.prepare('UPDATE decisions SET alerte_id = 999 WHERE id = ?').run(m1);
  assert.ok(v.decisions.active().some(d => d.id === m1), 'empreinte toujours valide');
  assert.doesNotMatch(v.decisions.signed().payload, /alerte|999|"41"/);
  // Purge : levée il y a plus de 13 mois, échue il y a plus de 13 mois : effacées ; levée ou échue depuis moins, active : gardées.
  const old = v.decisions.create({ kind: 'geler', cible: 'zitadel-5', duree: '24h', par: 'test' });
  const echue = v.decisions.create({ kind: 'geler', cible: 'zitadel-6', duree: '1h', par: 'test' });
  v.decisions.lift({ id: old, par: 'test', motif: 'essai' });
  v.clock.t = t0 + 300 * 864e5;
  const recente = v.decisions.create({ kind: 'geler', cible: 'zitadel-7', duree: '1h', par: 'test' });
  v.decisions.lift({ id: recente, par: 'test', motif: 'essai' });
  // Une décision active depuis longtemps (insérée à la main : la durée est bornée à 30 jours) n'est jamais effacée.
  const vieilleActive = Number(v.db.prepare("INSERT INTO decisions (kind, cible, motif, par, cree_a, fin) VALUES ('geler', 'zitadel-8', '', 'test', ?, ?)").run(t0 - 500 * 864e5, t0 + 900 * 864e5).lastInsertRowid);
  v.clock.t = t0 + 400 * 864e5;
  const avant = v.db.prepare('SELECT id FROM decisions ORDER BY id').pluck().all();
  v.engine.purge();
  const apres = v.db.prepare('SELECT id FROM decisions ORDER BY id').pluck().all();
  for (const id of [old, echue, auto.id, m1, m2, m3]) assert.ok(!apres.includes(id), `décision ${id} effacée`);
  assert.ok(apres.includes(recente), 'levée depuis moins de 13 mois : gardée');
  assert.ok(apres.includes(vieilleActive), 'active : jamais effacée');
  assert.equal(avant.length - apres.length, 6);
  // Plans : les deux recherches de la console passent par l'index de la colonne.
  const plan = (sql, ...a) => v.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...a).map(r => r.detail).join(' | ');
  assert.match(plan('SELECT id FROM decisions WHERE alerte_id = ? ORDER BY id LIMIT 50', 1), /decisions_alerte/);
  assert.match(plan('SELECT id FROM decisions WHERE alerte_id IN (SELECT value FROM json_each(?)) AND auto = 1 ORDER BY id LIMIT 500', '[1,2]'), /decisions_alerte/);
});

test('migration 012 : alerte_id repris du motif (« alerte #n », « alerte #n · … »), rien d’autre', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-m012-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'vigie.db');
  // Une base d'avant la migration : colonne et index retirés, migration oubliée.
  let db = openVigieDb(file);
  db.exec("DROP INDEX decisions_alerte; DROP INDEX decisions_cree; ALTER TABLE decisions DROP COLUMN alerte_id; DELETE FROM migrations WHERE name = '012_decisions_alerte.sql'");
  const motifs = ['alerte #412', 'alerte #413 · enquête', 'alerte #414 ·enquête', 'alerte #0415', 'Alerte #416', 'alerte #417x', 'vu dans l’alerte #418', 'alerte #', 'alerte #0', '', 'alerte #419 · ', 'alerte #99999999999 · grand'];
  const ins = db.prepare("INSERT INTO decisions (kind, cible, motif, par, cree_a, fin, auto) VALUES ('geler', 'x', ?, 'test', 1, 2, 1)");
  for (const m of motifs) ins.run(m);
  db.close();
  db = openVigieDb(file);
  t.after(() => db.close());
  const lu = db.prepare('SELECT motif, alerte_id FROM decisions ORDER BY id').all().map(r => [r.motif, r.alerte_id]);
  assert.deepEqual(lu, [['alerte #412', 412], ['alerte #413 · enquête', 413], ['alerte #414 ·enquête', null], ['alerte #0415', null], ['Alerte #416', null], ['alerte #417x', null],
    ['vu dans l’alerte #418', null], ['alerte #', null], ['alerte #0', null], ['', null], ['alerte #419 · ', 419], ['alerte #99999999999 · grand', 99999999999]]);
  // La même règle que decisions.create (motif sans paramètre alerte).
  for (const [m, attendu] of lu) {
    const c = /^alerte #([1-9]\d{0,14})(?: · |$)/.exec(m);
    assert.equal(c ? Number(c[1]) : null, attendu, m);
  }
});
