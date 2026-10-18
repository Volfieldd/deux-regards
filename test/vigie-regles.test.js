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
import { loadRules, RuleError, RegexTimeout, createCorrelator } from '../vigie/sigma.js';
import { createChains, km } from '../vigie/detecteurs.js';
import { createThreats, parseList } from '../vigie/menaces.js';
import { checkRoles, snapshotName } from '../vigie/controle-roles.js';
import { execFileSync } from 'node:child_process';
import { openDb, migrate } from '../server/db/index.js';

// Vigie, phase C2 : règles Sigma (D20), détecteurs comportementaux, listes de menaces (D22), contrôle des rôles sur les
// sauvegardes du site.
const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-c2-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

function vigieOf(t, { start = Date.parse('2026-10-20T10:00:00Z'), threats = null, rulesDir } = {}) {
  const dir = tmp(t);
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  t.after(() => db.close());
  const clock = { t: start };
  const now = () => clock.t;
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const th = threats ? threats(store, now) : null;
  const engine = createEngine({ store, decisions, switches, threats: th, now, ...(rulesDir ? { rulesDir } : {}) });
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
    ['detection:\n  s:\n    type|fuzzy: x\n  condition: s', /modificateur non pris en charge/],
    ['detection:\n  s:\n    type|contains|startswith: x\n  condition: s', /modificateur non pris en charge/],
    ['detection:\n  s:\n    type: x\n  condition: s\nvigie: { entite: { kind: site, valeur: x } }', /doit être source_unique/],
  ]) {
    const d2 = tmp(t);
    fs.writeFileSync(path.join(d2, 'b.yml'), `title: b\nname: b\nlevel: low\n${bad}\n`);
    assert.throws(() => loadRules(d2), err, 'refusée au chargement, jamais à chaque événement');
  }
  for (const [bad, err] of [['vigie: { expire: demain }', /expire attend une date/], ['vigie: { delai_re_ms: 0 }', /delai_re_ms/]]) {
    const d5 = tmp(t);
    fs.writeFileSync(path.join(d5, 'f.yml'), `title: f\nname: f\nlevel: low\ndetection:\n  s:\n    type: x\n  condition: s\n${bad}\n`);
    assert.throws(() => loadRules(d5), err);
  }
  const d4 = tmp(t);
  fs.writeFileSync(path.join(d4, 'd.yml'), 'title: d\nname: d\nlevel: low\ndetection:\n  s:\n    type: x\n  condition: s\n---\ntitle: e\nname: e\nlevel: low\ncorrelation:\n  type: event_count\n  rules: [d]\n  timespan: 1m\n  condition: { lte: 2 }\n');
  assert.throws(() => loadRules(d4), /lte et eq ne sont pas pris en charge/);
  const d3 = tmp(t);
  fs.writeFileSync(path.join(d3, 'c.yml'), 'title: c\nname: c\nlevel: low\ncorrelation:\n  type: event_count\n  rules: [absente]\n  timespan: 1m\n  condition: { gte: 2 }\n');
  assert.throws(() => loadRules(d3), RuleError);
});

test('règles : date d’expiration facultative, délai facultatif des expressions régulières (retour arrière catastrophique arrêté)', async t => {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, 'a.yml'), `title: temporaire
name: temporaire
level: high
tags: [attack.t1190]
detection:
  s:
    type: malicious_input
  condition: s
vigie: { cas: DS5, entite: { kind: ip, champ: ip }, source_unique: true, expire: 2026-10-20 }
---
title: lente
name: lente
level: high
tags: [attack.t1190]
detection:
  s:
    detail.valeur|re: '^(a+)+$'
  condition: s
vigie: { cas: DS5, entite: { kind: ip, champ: ip }, source_unique: true, delai_re_ms: 200 }
`);
  const { rules } = loadRules(dir);
  assert.equal(rules[0].expireAt, Date.parse('2026-10-20T23:59:59.999Z'));
  assert.throws(() => rules[1].match({ detail: JSON.stringify({ valeur: `${'a'.repeat(40)}b` }) }), RegexTimeout);
  assert.equal(rules[1].match({ detail: JSON.stringify({ valeur: 'aaa' }) }), true);
  // Dans le moteur : la règle temporaire compte jusqu'à sa date, plus après ; la règle lente est notée, sans arrêter
  // l'analyse.
  const v = vigieOf(t, { rulesDir: dir });
  v.add('malicious_input', 'moyen', { ip: '203.0.113.1' });
  assert.equal(v.alerts().filter(a => a.regle === 'sigma.temporaire').length, 1);
  v.clock.t = Date.parse('2026-10-21T08:00:00Z');
  v.add('malicious_input', 'moyen', { ip: '203.0.113.2' });
  assert.equal(v.alerts().filter(a => a.regle === 'sigma.temporaire').length, 1, 'expirée');
  assert.match(v.engine.rules().find(r => r.id === 'sigma.temporaire').expire.toString(), /^\d+$/);
  v.add('malicious_input', 'moyen', { ip: '203.0.113.3', detail: { valeur: `${'a'.repeat(40)}b` } });
  v.add('malicious_input', 'moyen', { ip: '203.0.113.4', detail: { valeur: `${'a'.repeat(40)}b` } });
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_regle_lente'").pluck().get(), 1, 'une fois par heure');
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
  assert.deepEqual(s.sources, ['zitadel']);
  // Une corrélation tombée hors de sa fenêtre ne compte plus.
  const c = createCorrelator([{ name: 'x', type: 'event_count', rules: ['r'], groupBy: ['ip'], span: 600e3, cond: { gte: 2 } }], { now: () => v.clock.t });
  assert.equal(c({ ip: '1.2.3.4', seq: 1 }, new Set(['r'])).length, 0);
  v.clock.t += 700e3;
  assert.equal(c({ ip: '1.2.3.4', seq: 2 }, new Set(['r'])).length, 0);
  // Un résumé de l'émetteur (D23) compte pour ce qu'il résume.
  assert.equal(c({ ip: '1.2.3.5', seq: 3, detail: '{"nombre":4}' }, new Set(['r'])).length, 1);
  // Sources des événements qui ont contribué : le quorum voit le site et Zitadel.
  const c2 = createCorrelator([{ name: 'y', type: 'event_count', rules: ['r'], groupBy: ['sub'], span: 600e3, cond: { gte: 2 } }], { now: () => v.clock.t });
  c2({ sub: 'a', seq: 1 }, new Set(['r']), { source: 'site' });
  assert.deepEqual(c2({ sub: 'a', seq: 2 }, new Set(['r']), { source: 'zitadel' })[0].sources, ['site', 'zitadel']);
});

test('corrélations : mémoire bornée (budget global, groupes oubliés, valeurs en empreinte courte)', () => {
  let t0 = 0;
  const c = createCorrelator([{ name: 'v', type: 'value_count', rules: ['r'], groupBy: ['ip'], span: 3600e3, cond: { gte: 1e9, field: 'detail.x' } }], { now: () => t0, maxGroups: 1000, maxHits: 5000 });
  const big = 'x'.repeat(10_000);
  for (let i = 0; i < 20_000; i++) c({ ip: `10.0.${i >> 8}.${i & 255}`, seq: i, detail: JSON.stringify({ x: `${big}${i}` }) }, new Set(['r']));
  assert.ok(c.size() <= 5000, `au plus 5000 points (${c.size()})`);
  t0 += 2 * 3600e3;
  c.prune();
  assert.equal(c.size(), 0, 'fenêtres échues retirées');
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
  // Un événement Zitadel qui n'est pas une connexion (jeton, mot de passe vérifié) ne compte pas ; puis une seule fois.
  v.add('zitadel_connexion', 'info', { composant: 'zitadel', canal: 'API Zitadel', confiance: 'constaté', sub: 'zitadel-b', detail: { type_zitadel: 'user.token.added' } });
  assert.equal(v.signals('detecteur.pivot_identifiants').length, 0);
  for (let i = 0; i < 3; i++) v.add('zitadel_connexion', 'info', { composant: 'zitadel', canal: 'API Zitadel', confiance: 'constaté', sub: 'zitadel-b', detail: { type_zitadel: 'session.added' } });
  assert.equal(v.signals('detecteur.pivot_identifiants').length, 1);
  assert.equal(v.signals('detecteur.pivot_identifiants')[0].echecs_avant, 3);
  // Export réservé à l'administrateur par un compte qui ne l'est pas : critique, alerte directe.
  v.add('sys_state', 'info', { composant: 'site · système', detail: { administrateurs: ['zitadel-admin'] } });
  v.add('sensitive_export', 'bas', { composant: 'site · admin', sub: 'zitadel-relecteur', detail: { cible: '/admin/personnes/:id/export.zip', id: '7' } });
  const a = v.alerts().find(x => x.regle === 'detecteur.role_incoherent');
  assert.equal(a.gravite, 'critique');
  assert.equal(a.entite_key, 'zitadel-relecteur');
});

test('détecteurs : heure inhabituelle (heures UTC, en base) et vitesse de lecture (rafale vue dans l’heure)', async t => {
  const start = Date.parse('2026-09-20T09:00:00Z');
  const v = vigieOf(t, { start });
  const read = () => v.add('sensitive_read', 'info', { composant: 'site · admin', sub: 'zitadel-l', detail: { cible: '/admin/personnes/:id' } });
  // 20 jours d'habitudes : deux lectures vers 9 h et 10 h UTC.
  for (let d = 0; d < 20; d++) { v.clock.t = start + d * 864e5; read(); v.clock.t += 3600e3; read(); }
  assert.equal(v.signals('detecteur.heure_inhabituelle').length, 0);
  // 3 h UTC : jamais vue ; une seule fois.
  v.clock.t = start + 20 * 864e5 - 6 * 3600e3;
  read(); read();
  const h = v.signals('detecteur.heure_inhabituelle');
  assert.equal(h.length, 1);
  assert.equal(h[0].heure_utc, 3);
  // Vitesse : trente lectures dans la même heure, contre deux par jour d'habitude.
  for (let i = 0; i < 30; i++) read();
  const s = v.signals('detecteur.vitesse');
  assert.equal(s.length, 1);
  assert.ok(s[0].aujourdhui >= 10 && s[0].moyenne <= 2);
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

test('listes de menaces : préfixes bornés par liste, liste triplée refusée, pas de redirection, désactivées : rien', async t => {
  assert.deepEqual(parseList('lignes', '10.0.0.0/8\n198.51.100.7\n2001:db8::/32\n', { min4: 32, min6: 128 }), ['198.51.100.7/32']);
  assert.deepEqual(parseList('ndjson-cidr', '{"cidr":"0.0.0.0/1"}\n{"cidr":"203.0.113.0/24"}\n{"cidr":"2001:db8::/16"}\n', { min4: 10, min6: 19 }), ['203.0.113.0/24']);
  let feodo = Array.from({ length: 60 }, (_, i) => `198.51.100.${i + 1}`).join('\n');
  const seen = [];
  const fetchImpl = async (url, opts) => { seen.push(opts.redirect); return new Response(url.includes('feodo') ? feodo : '{"cidr":"203.0.113.0/24"}\n192.0.2.1\n', { status: 200 }); };
  const v = vigieOf(t, { threats: (store, now) => createThreats({ store, fetchImpl, now }) });
  assert.equal((await v.threats.update()).feodo, 60);
  assert.ok(seen.every(r => r === 'error'));
  feodo = Array.from({ length: 200 }, (_, i) => `192.0.2.${i + 1}`).join('\n');
  assert.match(String((await v.threats.update()).feodo), /liste triplée/);
  assert.deepEqual(v.threats.labels('198.51.100.7'), ['feodo'], 'ancienne liste gardée');
  const off = createThreats({ store: v.store, fetchImpl, enabled: false });
  assert.deepEqual(off.labels('198.51.100.7'), []);
  assert.deepEqual(await off.update(), {});
});

test('contrôle des rôles sur la sauvegarde du site : administrateur non déclaré ou sans changement journalisé, déclencheur absent → critique', async t => {
  const v = vigieOf(t, { start: Date.now() });
  const backups = tmp(t);
  fs.mkdirSync(path.join(backups, 'db'));
  const file = path.join(backups, 'db', snapshotName(Date.now() - 3600e3));
  const site = openDb(file);
  migrate(site);
  site.prepare("INSERT INTO accounts (sub, name, roles, status, created_at) VALUES ('zitadel-admin', 'A', '[\"admin\"]', 'actif', 1)").run();
  site.close();
  v.add('sys_state', 'info', { composant: 'site · système', detail: { administrateurs: ['zitadel-admin'] } });
  assert.equal(checkRoles({ store: v.store, siteBackupDir: backups }).ok, true);
  assert.equal(checkRoles({ store: v.store, siteBackupDir: backups }).ok, null, 'même instantané : déjà contrôlé');
  // Fichiers plantés : un tube et un lien au nom plus récent, un nom fabriqué pour passer en tête du tri, une date
  // future. Aucun n'est lu (ni blocage sur le tube).
  const db = path.join(backups, 'db');
  execFileSync('mkfifo', [path.join(db, snapshotName(Date.now() - 60e3))]);
  fs.symlinkSync(file, path.join(db, snapshotName(Date.now() - 120e3)));
  fs.writeFileSync(path.join(db, 'site-zzzz.db'), 'x');
  fs.writeFileSync(path.join(db, snapshotName(Date.now() + 864e5)), 'x');
  assert.equal(checkRoles({ store: v.store, siteBackupDir: backups }).ok, null, 'le vrai instantané, déjà contrôlé');
  // Nouvel instantané : un administrateur déclaré par le site mais sans changement journalisé, un déclencheur supprimé.
  const s2file = path.join(db, snapshotName(Date.now() - 30e3));
  fs.copyFileSync(file, s2file);
  const s2 = openDb(s2file);
  s2.exec('DROP TRIGGER account_changes_conserve');
  s2.prepare("INSERT INTO accounts (sub, name, roles, status, created_at) VALUES ('zitadel-cache', 'B', '[\"admin\"]', 'actif', 2)").run();
  s2.close();
  v.add('sys_state', 'info', { composant: 'site · système', detail: { administrateurs: ['zitadel-admin', 'zitadel-cache'] } });
  const r = checkRoles({ store: v.store, siteBackupDir: backups });
  assert.deepEqual(r.unknownAdmins, []);
  assert.deepEqual(r.unexplained, ['zitadel-cache'], 'le site peut mentir dans ses déclarations, pas dans le journal des comptes');
  assert.deepEqual(r.missing, ['account_changes_conserve']);
  const a = v.alerts().find(x => x.regle === 'sigma.controle_roles');
  assert.equal(a.gravite, 'critique');
});

test('contrôle des rôles : déclencheur vidé sous le même nom → critique ; sauvegarde trop ancienne ou absente → haut', async t => {
  const v = vigieOf(t, { start: Date.now() });
  const backups = tmp(t);
  const db = path.join(backups, 'db');
  fs.mkdirSync(db);
  assert.equal(checkRoles({ store: v.store, siteBackupDir: backups }).ok, null);
  assert.ok(v.alerts().find(x => x.regle === 'sigma.controle_roles_degrade'), 'aucun instantané : signalé');
  const file = path.join(db, snapshotName(Date.now() - 3 * 864e5));
  const site = openDb(file);
  migrate(site);
  site.close();
  v.add('sys_state', 'info', { composant: 'site · système', detail: { administrateurs: [] } });
  const r1 = checkRoles({ store: v.store, siteBackupDir: backups });
  assert.equal(r1.ok, true);
  assert.equal(r1.severity, 'haut', 'instantané de trois jours : contrôle aveugle');
  const f2 = path.join(db, snapshotName(Date.now() - 60e3));
  fs.copyFileSync(file, f2);
  const s2 = openDb(f2);
  const sql = s2.prepare("SELECT sql FROM sqlite_master WHERE name = 'account_changes_immuable'").pluck().get();
  s2.exec('DROP TRIGGER account_changes_immuable');
  s2.exec(sql.replace(/BEGIN[\s\S]*END/, 'BEGIN SELECT 1; END'));
  s2.close();
  const r2 = checkRoles({ store: v.store, siteBackupDir: backups });
  assert.deepEqual(r2.altered, ['account_changes_immuable']);
  assert.equal(r2.ok, false);
});

test('admin : contact remplacé, EXIF complet, heures visibles en masse, réglage changé après une session reprise (BV-1, BV-2)', async t => {
  const v = vigieOf(t);
  const admin = (type, severity, detail, extra = {}) => v.add(type, severity, { composant: 'site · admin', sub: 'zitadel-julien', ip: '198.51.100.5', detail, ...extra });
  admin('config_public_changed', 'bas', { cles: ['tagline'], contact_change: false });
  assert.equal(v.alerts().length, 0, 'un réglage ordinaire : des points, pas d’alerte');
  admin('config_public_changed', 'moyen', { cles: ['privacy_contact'], contact_change: true });
  assert.equal(v.alerts().find(a => a.regle === 'sigma.contact_public_change').mode, 'alerter');
  admin('privacy_exposure_changed', 'moyen', { heure_visible_ajoutees: 0, exif_complet: true });
  assert.ok(v.alerts().find(a => a.regle === 'sigma.exif_complet'));
  for (let i = 0; i < 19; i++) admin('privacy_exposure_changed', 'info', { heure_visible_ajoutees: 1 });
  assert.ok(!v.alerts().find(a => a.regle === 'sigma.heures_visibles_en_masse'), '19 : pas encore');
  admin('privacy_exposure_changed', 'info', { heure_visible_ajoutees: 1 });
  assert.equal(v.alerts().find(a => a.regle === 'sigma.heures_visibles_en_masse').entite_key, 'zitadel-julien');
  // Session reprise depuis un autre appareil, puis un réglage public dans l'heure : haute.
  v.add('session_context_change', 'haut', { composant: 'site · admin', sub: 'zitadel-seb', ip: '203.0.113.50', detail: { navigateur: { avant: 'Safari · macOS', apres: 'Chrome · Windows' } } });
  v.clock.t += 20 * 60e3;
  v.add('config_public_changed', 'bas', { composant: 'site · admin', sub: 'zitadel-seb', ip: '203.0.113.50', detail: { cles: ['public_version'], contact_change: false } });
  const a = v.alerts().find(x => x.regle === 'sigma.reglage_apres_session_reprise');
  assert.equal(a.gravite, 'haut');
  assert.equal(a.entite_key, 'zitadel-seb');
});
