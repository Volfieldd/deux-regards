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
import { loadRules, RuleError, createCorrelator } from '../vigie/sigma.js';
import { createChains, km } from '../vigie/detecteurs.js';
import { createThreats, parseList } from '../vigie/menaces.js';
import { checkRoles } from '../vigie/controle-roles.js';
import { openDb, migrate } from '../server/db/index.js';

// Vigie, phase C2 : règles Sigma (D20), détecteurs comportementaux, listes de menaces (D22), contrôle des rôles sur les
// sauvegardes du site.
const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-c2-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

function vigieOf(t, { start = Date.parse('2026-10-20T10:00:00Z'), threats = null } = {}) {
  const dir = tmp(t);
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  t.after(() => db.close());
  const clock = { t: start };
  const now = () => clock.t;
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const th = threats ? threats(store, now) : null;
  const engine = createEngine({ store, decisions, switches, threats: th, now });
  store.onAdded(rows => engine.process(rows));
  const ev = (type, severity, extra = {}) => ({ id: crypto.randomUUID(), recu_a: now(), survenu_a: now(), type, severity, canal: 'ingestion signée', confiance: 'rapporté', composant: 'site · public', ...extra,
    detail: extra.detail && typeof extra.detail === 'object' ? JSON.stringify(extra.detail) : extra.detail });
  const add = (type, severity, extra) => store.add([ev(type, severity, extra)]);
  const signals = regle => db.prepare("SELECT detail FROM events WHERE type = 'vigie_signal'").pluck().all().map(d => JSON.parse(d)).filter(d => !regle || d.regle === regle);
  const alerts = () => db.prepare('SELECT * FROM alerts ORDER BY id').all();
  return { dir, db, store, engine, decisions, clock, add, signals, alerts, threats: th };
}

test('Sigma : modificateurs, conditions (and, or, not, 1 of, all of), règle mal écrite refusée au chargement', async t => {
  const dir = tmp(t);
  const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);
  write('a.yml', `title: essai
name: essai
level: medium
detection:
  sel_type:
    type|startswith: authz
  sel_route:
    route|contains: ADMIN
  sel_num:
    status|gte: 400
  filtre:
    detail.raison: [hors portée, inconnue]
  condition: all of sel_* and not filtre
`);
  const { rules } = loadRules(dir);
  const m = row => rules[0].match(row);
  assert.equal(m({ type: 'authz_fail', route: '/admin/x', status: 403, detail: '{"raison":"permission"}' }), true);
  assert.equal(m({ type: 'authz_fail', route: '/admin/x', status: 403, detail: '{"raison":"Hors portée"}' }), false, 'valeurs sans casse');
  assert.equal(m({ type: 'authz_fail', route: '/public', status: 403 }), false);
  assert.equal(m({ type: 'authz_fail', route: '/admin', status: 302 }), false);
  for (const [bad, err] of [
    ['detection:\n  s:\n    type: x\n  condition: s and inconnue', /sélection inconnue/],
    ['detection:\n  s:\n    type|re: "("\n  condition: s', /expression régulière invalide/],
    ['detection:\n  s:\n    type|fuzzy: x\n  condition: s', null],
  ]) {
    const d2 = tmp(t);
    fs.writeFileSync(path.join(d2, 'b.yml'), `title: b\nname: b\nlevel: low\n${bad}\n`);
    if (err) assert.throws(() => loadRules(d2), err);
    else assert.throws(() => loadRules(d2).rules[0].match({ type: 'x' }), /non pris en charge/);
  }
  const d3 = tmp(t);
  fs.writeFileSync(path.join(d3, 'c.yml'), 'title: c\nname: c\nlevel: low\ncorrelation:\n  type: event_count\n  rules: [absente]\n  timespan: 1m\n  condition: { gte: 2 }\n');
  assert.throws(() => loadRules(d3), RuleError);
});

test('règles livrées : toutes chargées, chacune avec son cas, sa gravité et ses tactiques ; DS1 à DS31 couverts', async () => {
  const { rules, correlations } = loadRules(new URL('../vigie/regles/', import.meta.url).pathname);
  const all = [...rules, ...correlations];
  assert.ok(all.length >= 40);
  for (const r of all.filter(x => x.signal && (x.generate ?? true))) {
    assert.ok(r.cas, `${r.name} : cas`);
    assert.ok(r.tags.some(x => x.startsWith('attack.')), `${r.name} : tactique MITRE`);
  }
  const cas = new Set(all.map(r => r.cas));
  for (const c of ['DS1', 'DS2', 'DS5', 'DS6', 'DS7', 'DS8', 'DS9', 'DS10', 'DS11', 'DS12', 'DS13', 'DS14', 'DS15', 'DS16', 'DS18', 'DS19', 'DS20', 'DS21', 'DS24', 'DS25', 'DS26', 'DS27', 'DS28', 'DS31']) assert.ok(cas.has(c), c);
  // DS3, DS4, DS17, DS23 et DS10 (rôle incohérent) : détecteurs comportementaux.
});

test('corrélations : 3 échecs OIDC d’une adresse en 10 min → un signal (pas un par échec suivant) ; plusieurs adresses contre un compte', async t => {
  const v = vigieOf(t);
  for (let i = 0; i < 5; i++) { v.add('authn_login_fail', 'moyen', { composant: 'site · connexion', ip: '203.0.113.5' }); v.clock.t += 60e3; }
  assert.equal(v.signals('sigma.oidc_echecs_repetes').length, 1);
  for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) v.add('zitadel_echec', 'moyen', { composant: 'zitadel', canal: 'API Zitadel', confiance: 'constaté', sub: 'zitadel-cible', ip });
  const [s] = v.signals('sigma.cible_commune');
  assert.deepEqual(s.entite, { kind: 'compte', key: 'zitadel-cible' });
  assert.equal(s.valeur, 3);
  // Une corrélation tombée hors de sa fenêtre ne compte plus.
  const c = createCorrelator([{ name: 'x', type: 'event_count', rules: ['r'], groupBy: ['ip'], span: 600e3, cond: { gte: 2 } }], { now: () => v.clock.t });
  assert.equal(c({ ip: '1.2.3.4', seq: 1 }, new Set(['r'])).length, 0);
  v.clock.t += 700e3;
  assert.equal(c({ ip: '1.2.3.4', seq: 2 }, new Set(['r'])).length, 0);
});

test('détecteurs : première apparition, voyage impossible, pivot d’identifiants, rôle incohérent', async t => {
  const v = vigieOf(t);
  const login = (extra) => v.add('authn_login_success', 'info', { composant: 'site · connexion', sub: 'zitadel-a', ...extra });
  login({ country: 'FR', lat: 48.9, lon: 2.4, ip: '203.0.113.1', detail: { appareil: 'aaaa' } });
  v.clock.t += 10 * 60e3;
  login({ country: 'JP', lat: 35.7, lon: 139.7, ip: '198.51.100.9', detail: { appareil: 'bbbb' } });
  assert.deepEqual(v.signals('detecteur.premiere_apparition')[0].nouveau, ['pays JP', 'appareil']);
  const voyage = v.signals('detecteur.voyage_impossible')[0];
  assert.ok(voyage.km > 9000 && voyage.kmh > 900);
  assert.equal(Math.round(km({ lat: 48.86, lon: 2.35 }, { lat: 51.51, lon: -0.13 })), 343, 'Paris – Londres');
  // Trois échecs chez Zitadel puis un succès : pivot.
  for (let i = 0; i < 3; i++) v.add('zitadel_echec', 'moyen', { composant: 'zitadel', canal: 'API Zitadel', confiance: 'constaté', sub: 'zitadel-b' });
  v.add('zitadel_connexion', 'info', { composant: 'zitadel', canal: 'API Zitadel', confiance: 'constaté', sub: 'zitadel-b' });
  assert.equal(v.signals('detecteur.pivot_identifiants')[0].echecs_avant, 3);
  // Export réservé à l'administrateur par un compte qui ne l'est pas : critique, alerte directe.
  v.add('sys_state', 'info', { composant: 'site · système', detail: { administrateurs: ['zitadel-admin'] } });
  v.add('sensitive_export', 'bas', { composant: 'site · admin', sub: 'zitadel-relecteur', detail: { cible: '/admin/personnes/:id/export.zip', id: '7' } });
  const a = v.alerts().find(x => x.regle === 'detecteur.role_incoherent');
  assert.equal(a.gravite, 'critique');
  assert.equal(a.entite_key, 'zitadel-relecteur');
});

test('détecteurs périodiques : exploration lente sur 12 heures, site silencieux (une seule alerte), chaîne d’attaque', async t => {
  const v = vigieOf(t);
  for (let h = 0; h < 13; h++) { v.add('malicious_honeypot', 'moyen', { ip: `192.0.2.${10 + h}`, ip_net: '192.0.2.0' }); v.clock.t += 3600e3; }
  v.clock.t -= 60e3;
  v.engine.tick();
  assert.equal(v.signals('detecteur.exploration_lente')[0].heures, 13);
  v.clock.t += 4 * 60e3;
  v.engine.tick(); v.engine.tick();
  assert.equal(v.alerts().filter(a => a.regle === 'detecteur.silence').length, 1);
  const chain = createChains({ now: () => v.clock.t });
  const e = { kind: 'ip', key: '1.2.3.4' };
  assert.equal(chain(e, ['attack.reconnaissance']), false);
  assert.equal(chain(e, ['attack.credential_access']), false);
  assert.equal(chain(e, ['attack.privilege_escalation']), true);
});

test('listes de menaces : formats Spamhaus et lignes, étiquettes, points sans compter comme une source du quorum', async t => {
  assert.deepEqual(parseList('ndjson-cidr', '{"cidr":"1.10.16.0/20","sblid":"SBL1"}\n{"type":"metadata"}\n{"cidr":"0.0.0.0/0"}\n'), ['1.10.16.0/20']);
  assert.deepEqual(parseList('lignes', '# entête\n171.25.193.25\n\npas une adresse\n2001:db8::1\n'), ['171.25.193.25/32', '2001:db8::1/128']);
  const bodies = {
    'https://www.spamhaus.org/drop/drop_v4.json': '{"cidr":"203.0.113.0/24"}\n', 'https://www.spamhaus.org/drop/drop_v6.json': '{"cidr":"2001:db8::/32"}\n',
    'https://feodotracker.abuse.ch/downloads/ipblocklist.txt': '# x\n198.51.100.77\n', 'https://check.torproject.org/torbulkexitlist': '192.0.2.200\n',
  };
  const fetchImpl = async url => new Response(bodies[url], { status: 200 });
  const v = vigieOf(t, { threats: (store, now) => createThreats({ store, fetchImpl, now }) });
  const res = await v.threats.update();
  assert.deepEqual(res, { spamhaus_drop: 2, feodo: 1, tor: 1 });
  assert.deepEqual(v.threats.labels('203.0.113.9'), ['spamhaus_drop']);
  assert.deepEqual(v.threats.labels('::ffff:198.51.100.77'), ['feodo']);
  v.add('malicious_input', 'moyen', { ip: '203.0.113.9' });
  const e = v.engine.current('ip', '203.0.113.9');
  assert.ok(e.contributions.menaces >= 3);
  assert.deepEqual(v.engine.top().find(x => x.key === '203.0.113.9').sources, ['site'], 'les listes ne comptent pas dans le quorum');
});

test('contrôle des rôles sur la sauvegarde du site : administrateur non déclaré ou déclencheur absent → alerte critique', async t => {
  const v = vigieOf(t, { start: Date.now() });
  const backups = tmp(t);
  fs.mkdirSync(path.join(backups, 'db'));
  const file = path.join(backups, 'db', 'site-20261020T100000.db');
  const site = openDb(file);
  migrate(site);
  site.prepare("INSERT INTO accounts (sub, name, roles, status, created_at) VALUES ('zitadel-admin', 'A', '[\"admin\"]', 'actif', 1)").run();
  site.close();
  v.add('sys_state', 'info', { composant: 'site · système', detail: { administrateurs: ['zitadel-admin'] } });
  assert.equal(checkRoles({ store: v.store, siteBackupDir: backups }).ok, true);
  assert.equal(checkRoles({ store: v.store, siteBackupDir: backups }).ok, null, 'même instantané : déjà contrôlé');
  // Nouvel instantané : un administrateur que le site n'a jamais déclaré, un déclencheur supprimé.
  const s2 = openDb(file);
  s2.exec('DROP TRIGGER account_changes_conserve');
  s2.prepare("INSERT INTO accounts (sub, name, roles, status, created_at) VALUES ('zitadel-cache', 'B', '[\"admin\"]', 'actif', 2)").run();
  s2.close();
  const r = checkRoles({ store: v.store, siteBackupDir: backups });
  assert.deepEqual(r.unknownAdmins, ['zitadel-cache']);
  assert.deepEqual(r.missing, ['account_changes_conserve']);
  const a = v.alerts().find(x => x.regle === 'sigma.controle_roles');
  assert.equal(a.gravite, 'critique');
});
