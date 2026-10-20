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
import { loadRules, createCorrelator } from '../vigie/sigma.js';
import { pointsOf, saisieLibre, BY_TYPE } from '../vigie/poids.js';
import { droitsSurveilles } from '../vigie/detecteurs.js';
import { createIngest } from '../vigie/ingest.js';
import { EVENTS } from '../server/securite/vocabulaire.js';
import { isType as isVigieType, isSiteType } from '../vigie/vocabulaire.js';
import { LIBELLES } from '../vigie/console/ecrans/evenements.js';

// La Vigie face à la page Contact et à la demande de licence (PR #183) : registre des briques,
// docs/etudes/vigie-besoins-des-briques.md, « Contact et demande de licence » (BV-27 à BV-30). Événements synthétiques de
// la forme qu'émet la PR (crochet commun des saisies, server/routes/contact-public.js, server/routes/messages.js,
// server/messages.js · notifications) : ce travail ne dépend pas de son code.
const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-contact-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

function vigieOf(t, { start = Date.parse('2026-10-20T10:00:00Z') } = {}) {
  const db = openVigieDb(path.join(tmp(t), 'vigie.db'));
  t.after(() => db.close());
  const clock = { t: start };
  const now = () => clock.t;
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now });
  store.onAdded(rows => engine.process(rows));
  const add = (type, severity, extra = {}) => store.add([{ id: crypto.randomUUID(), recu_a: now(), survenu_a: now(), type, severity, canal: 'ingestion signée', confiance: 'rapporté', composant: 'site · public', ...extra,
    detail: extra.detail && typeof extra.detail === 'object' ? JSON.stringify(extra.detail) : extra.detail }]);
  const alerts = regle => db.prepare('SELECT * FROM alerts ORDER BY id').all().filter(a => !regle || a.regle === regle);
  const signals = regle => db.prepare("SELECT detail FROM events WHERE type = 'vigie_signal'").pluck().all().map(d => JSON.parse(d)).filter(d => !regle || d.regle === regle);
  return { db, store, engine, clock, now, add, alerts, signals };
}

// Saisie malveillante telle que le crochet commun l'émet pour un envoi de formulaire (longueur seule, jamais l'extrait).
const constat = (champ, famille = 'xss', longueur = 33) => ({ famille, champ, longueur });
const saisie = ({ route = '/contact', method = 'POST', severity = 'moyen', constats = [constat('body.message')], familles = null, ip = '198.51.100.20', sub } = {}) => ({
  type: 'malicious_input', severity, composant: 'site · public', emetteur: 'server/securite · saisies', route, method, ip, ip_net: ip.replace(/\.\d+$/, '.0'), ...(sub ? { sub } : {}),
  detail: { familles: familles || [...new Set(constats.map(c => c.famille))], constats },
});
const row = e => ({ ...e, detail: JSON.stringify(e.detail) });

test('BV-27 : saisie dans le message ou la diffusion de /contact et /droits/demande → poids faible (« moyen » 0,5, « bas » 0) ; gravité haute, autre champ, outil, page en GET, autre formulaire : poids ordinaire', () => {
  const full = BY_TYPE.malicious_input;
  // L'exemple du registre : un message avec <script>, un seul malicious_input, constat xss sur body.message, 33 signes.
  assert.equal(pointsOf(row(saisie())), 0.5);
  assert.equal(pointsOf(row(saisie({ severity: 'bas' }))), 0, 'envoyé depuis une session de l’admin : gardé pour l’enquête');
  for (const route of ['/en/contact', '/de/contact', '/droits/demande', '/en/droits/demande', '/de/droits/demande']) assert.equal(pointsOf(row(saisie({ route }))), 0.5, route);
  assert.equal(pointsOf(row(saisie({ route: '/droits/demande', constats: [constat('body.diffusion', 'sql'), constat('body.message')] }))), 0.5, 'diffusion et message');
  // Jamais aveugle à une vraie attaque.
  assert.equal(pointsOf(row(saisie({ severity: 'haut' }))), full, 'gravité haute');
  assert.equal(pointsOf(row(saisie({ severity: 'critique' }))), full);
  assert.equal(pointsOf(row(saisie({ constats: [constat('body.name')] }))), full, 'aucun nom ne contient <script');
  assert.equal(pointsOf(row(saisie({ constats: [constat('body.message'), constat('body.email')] }))), full, 'un constat hors des champs libres');
  assert.equal(pointsOf(row(saisie({ constats: [constat('body.message'), { famille: 'outil', champ: 'header.user-agent', extrait: 'sqlmap/1.7' }] }))), full, 'outil d’attaque au navigateur');
  assert.equal(pointsOf(row(saisie({ familles: ['xss', 'outil'] }))), full, 'outil seul, sans constat');
  assert.equal(pointsOf(row(saisie({ constats: [] }))), full, 'aucun constat');
  assert.equal(pointsOf(row(saisie({ method: 'GET', constats: [{ famille: 'xss', champ: 'query.pour', extrait: '<script>' }] }))), full, 'paramètre de la page en GET');
  assert.equal(pointsOf(row(saisie({ method: 'GET' }))), full, 'pas un envoi');
  for (const route of ['/bonjour', '/photo/:slug/signaler', '/contact/merci', '/xx/contact', '/contacts', '/admin/messages/:id']) assert.equal(pointsOf(row(saisie({ route }))), full, route);
  assert.equal(pointsOf(row({ ...saisie(), composant: 'site · admin' })), full);
  assert.equal(pointsOf(row({ ...saisie(), detail: '{illisible' })), full);
  assert.equal(saisieLibre(row({ ...saisie(), type: 'input_validation_fail' })), false);
  // Le billet des Carnets reste tel quel.
  assert.equal(pointsOf(row({ type: 'malicious_input', severity: 'bas', composant: 'site · admin', detail: { objet: 'billet' } })), 0);
  assert.equal(pointsOf(row({ type: 'malicious_input', severity: 'moyen', composant: 'site · admin', detail: { objet: 'billet' } })), full);
});

test('BV-27 : un visiteur qui cite du code n’alerte pas ; la série depuis une adresse (scanner, DS11) compte toujours, et une adresse qui attaque ailleurs garde ses points', async t => {
  const v = vigieOf(t);
  const ip = '198.51.100.20';
  v.add('malicious_input', 'moyen', saisie({ ip }));
  v.add('malicious_input', 'moyen', saisie({ ip, route: '/droits/demande', constats: [constat('body.diffusion', 'sql', 80)] }));
  assert.ok(Math.abs(v.engine.current('ip', ip).score - 1) < 0.01, 'deux messages : 2 × 0,5');
  assert.equal(v.signals('sigma.scanner').length, 0);
  assert.equal(v.alerts().length, 0);
  // Cinq en une heure depuis la même adresse (le site laisse passer 8 envois, et le crochet signale même ceux refusés
  // par la limite) : la règle scanner les compte comme n'importe quelles saisies.
  for (let i = 0; i < 3; i++) v.add('malicious_input', 'moyen', saisie({ ip }));
  assert.deepEqual(v.signals('sigma.scanner').map(s => [s.entite.kind, s.entite.key, s.gravite]), [['ip', ip, 'haut']]);
  // Ailleurs que dans le message (le nom), la même adresse : le poids ordinaire.
  const other = '198.51.100.30';
  v.add('malicious_input', 'moyen', saisie({ ip: other, constats: [constat('body.name')] }));
  assert.ok(Math.abs(v.engine.current('ip', other).score - BY_TYPE.malicious_input) < 0.01);
});

test('champ piège de /contact et /droits/demande : traité comme /bonjour (règle piege, DS15, points sur l’adresse ; aspiration distribuée sur le réseau)', async t => {
  const v = vigieOf(t);
  const piege = (formulaire, ip) => v.add('malicious_honeypot', 'moyen', { ip, ip_net: '198.51.100.0', route: formulaire === 'bonjour' ? '/bonjour' : formulaire === 'contact' ? '/contact' : '/droits/demande', method: 'POST',
    emetteur: 'server/routes/public.js · champ piège', detail: { piege: 'champ caché', formulaire } });
  piege('bonjour', '198.51.100.1');
  piege('contact', '198.51.100.2');
  const vu = ip => [v.signals('sigma.piege').filter(s => s.entite.key === ip).map(s => [s.entite.kind, s.cas]), Math.round(v.engine.current('ip', ip).score * 100) / 100];
  assert.deepEqual(vu('198.51.100.2'), vu('198.51.100.1'));
  assert.deepEqual(vu('198.51.100.2'), [[['ip', 'DS15']], 2]);
  assert.equal(pointsOf(row({ type: 'malicious_honeypot', severity: 'moyen', composant: 'site · public', detail: { formulaire: 'licence' } })), 0, 'pas de points de base en plus de la règle');
  piege('licence', '198.51.100.3');
  assert.deepEqual(v.signals('sigma.aspiration_distribuee').map(s => [s.entite.kind, s.entite.key]), [['reseau', '198.51.100.0']]);
});

test('BV-29 : plafond des notifications de messages atteint → alerte « messages_satures » sur l’entité site « messages » (DS21, alerter) ; une limite par adresse : rien', async t => {
  const v = vigieOf(t);
  const { rules } = loadRules(new URL('../vigie/regles/', import.meta.url).pathname);
  const r = rules.find(x => x.name === 'messages_satures');
  assert.deepEqual([r.file, r.gravite, r.mode, r.cas, r.sourceUnique, r.entite], ['30-exploration.yml', 'moyen', 'alerter', 'DS21', true, { kind: 'site', valeur: 'messages' }]);
  // Limites ordinaires : par adresse (contact, licence), autre limite globale (galeries).
  for (const limite of ['contact', 'licence']) v.add('excess_rate_limit_exceeded', 'bas', { ip: '198.51.100.20', route: '/contact', method: 'POST', emetteur: 'server/routes/public.js · limite', detail: { limite } });
  v.add('excess_rate_limit_exceeded', 'moyen', { emetteur: 'server/spaces.js · scrypt', detail: { limite: 'mot_de_passe_global' } });
  assert.equal(v.alerts('sigma.messages_satures').length, 0);
  // Tel que l'émet server/app.js (onMessagesCap) : sans requête, donc sans adresse ni compte, une fois par jour.
  v.add('excess_rate_limit_exceeded', 'moyen', { emetteur: 'server/messages.js · notifications', detail: { limite: 'messages_global', envoyes: 30, en_attente: 4 } });
  assert.deepEqual(v.alerts('sigma.messages_satures').map(a => [a.entite_kind, a.entite_key, a.gravite, a.cas, a.mode]), [['site', 'messages', 'moyen', 'DS21', 'alerter']]);
});

test('BV-30 : lectures_massives compte le couple objet et numéro (le message 12 et la fiche 12 sont deux lectures) ; lectures sans objet comptées par leur numéro, comme avant', async t => {
  const lire = (v, detail, sub = 'zitadel-julien') => v.add('sensitive_read', 'info', { composant: 'site · admin', sub, ip: '203.0.113.5', detail });
  const massives = v => v.signals('sigma.lectures_massives');
  // 15 fiches et les 15 messages de mêmes numéros : 30 lectures distinctes.
  {
    const v = vigieOf(t);
    for (let id = 1; id <= 15; id++) lire(v, { cible: '/admin/personnes/:id', id: String(id) });
    for (let id = 1; id <= 14; id++) lire(v, { cible: '/admin/messages/:id', objet: 'message', id });
    assert.equal(massives(v).length, 0);
    lire(v, { cible: '/admin/messages/:id', objet: 'message', id: 15 });
    assert.deepEqual(massives(v).map(s => [s.entite.key, s.cas, s.valeur]), [['zitadel-julien', 'DS18', 30]]);
  }
  // Non-régression : événements existants (sans objet), 30 numéros distincts → signal ; la même fiche relue : une lecture.
  {
    const v = vigieOf(t);
    for (let i = 0; i < 10; i++) lire(v, { cible: '/admin/personnes/:id', id: '1' });
    for (let id = 2; id <= 29; id++) lire(v, { cible: '/admin/personnes/:id', id: String(id) });
    assert.equal(massives(v).length, 0, '29 fiches distinctes');
    lire(v, { cible: '/admin/rencontres/:id', id: '30' });
    assert.equal(massives(v).length, 1);
    // Sans numéro ni objet : rien à compter (comme avant).
    const w = vigieOf(t);
    for (let i = 0; i < 40; i++) lire(w, { cible: '/admin/personnes/:id' });
    assert.equal(massives(w).length, 0);
  }
  // Message relu 30 fois : une seule lecture distincte.
  {
    const v = vigieOf(t);
    for (let i = 0; i < 30; i++) lire(v, { cible: '/admin/messages/:id', objet: 'message', id: 7 });
    assert.equal(massives(v).length, 0);
  }
});

test('value_count sur une liste de champs : couple compté ensemble ; champ seul inchangé ; liste vide refusée au chargement', t => {
  const c = { name: 'x', type: 'value_count', rules: ['r'], groupBy: ['sub'], span: 3600e3, cond: { gte: 3, field: ['detail.objet', 'detail.id'] } };
  const feed = createCorrelator([c], { now: () => 0 });
  const ev = (objet, id) => ({ sub: 'a', detail: JSON.stringify({ objet, id }) });
  assert.equal(feed(ev('message', 1), new Set(['r'])).length, 0);
  assert.equal(feed(ev(undefined, 1), new Set(['r'])).length, 0);
  assert.equal(feed(ev('message', 1), new Set(['r'])).length, 0, 'même couple');
  assert.equal(feed(ev('galerie', 1), new Set(['r']))[0].valeur, 3);
  const d = tmp(t);
  fs.writeFileSync(path.join(d, 'a.yml'), 'title: a\nname: a\nlevel: low\ndetection:\n  s:\n    type: x\n  condition: s\n---\ntitle: b\nname: b\nlevel: low\ncorrelation:\n  type: value_count\n  rules: [a]\n  group-by: [sub]\n  timespan: 1h\n  condition: { gte: 2, field: [] }\n');
  assert.throws(() => loadRules(d), /condition.field/);
});

test('rôle incohérent (DS10) : message ouvert par un compte sans messages.traiter (modérateur, relecteur) → critique ; administrateur et photographe : rien', async t => {
  assert.equal(droitsSurveilles(['admin']).get('messages.traiter'), 'tout');
  assert.equal(droitsSurveilles(['photographe']).get('messages.traiter'), 'les miennes');
  assert.equal(droitsSurveilles(['moderateur']).has('messages.traiter'), false);
  assert.equal(droitsSurveilles(['relecteur']).has('messages.traiter'), false);
  const v = vigieOf(t);
  v.store.setting.set('controle_roles_comptes', { instantane_a: v.now() - 3600e3, comptes: {
    'zitadel-julien': { roles: ['photographe'], adjust: {}, auteur: 1 },
    'zitadel-admin': { roles: ['admin'], adjust: {}, auteur: null },
    'zitadel-modo': { roles: ['moderateur'], adjust: {}, auteur: null },
    'zitadel-relecteur': { roles: ['relecteur'], adjust: {}, auteur: null },
  } });
  const lire = (sub, detail = { cible: '/admin/messages/:id', objet: 'message', id: 12 }) => v.add('sensitive_read', 'info', { composant: 'site · admin', sub, ip: '203.0.113.5',
    emetteur: 'server/routes/messages.js · lecture sensible', detail });
  const incoherents = () => v.alerts('detecteur.role_incoherent').map(a => a.entite_key).sort();
  lire('zitadel-julien'); lire('zitadel-admin');
  // Fiche d'une personne lue par le modérateur : hors du périmètre de ce contrôle (rien n'y est jugé).
  lire('zitadel-modo', { cible: '/admin/personnes/:id', id: '12' });
  assert.deepEqual(incoherents(), []);
  lire('zitadel-modo'); lire('zitadel-relecteur');
  assert.deepEqual(incoherents(), ['zitadel-modo', 'zitadel-relecteur']);
  const sig = v.signals('detecteur.role_incoherent').find(s => s.entite.key === 'zitadel-modo');
  assert.deepEqual([sig.objet, sig.permissions_manquantes, sig.gravite], ['message', ['messages.traiter'], 'critique']);
});

// BV-30, suppressions : sensitive_delete tel que POST /admin/messages/:id/supprimer l'émettra (PR #183), détail { objet, id }.
const INGEST_KEY = 'cle-de-signature-vigie-0123456789abcdef';
const efface = (v, id, { sub = 'zitadel-julien', objet = 'message' } = {}) => v.add('sensitive_delete', 'bas', { composant: 'site · admin', sub, ip: '203.0.113.5',
  emetteur: 'server/routes/messages.js · suppression', route: '/admin/messages/:id/supprimer', method: 'POST', detail: { objet, id } });

test('BV-30 : sensitive_delete au vocabulaire (bas, site · admin), au lexique de la console et au barème ; reçu par l’ingestion signée, un composant hors du site refusé', async t => {
  assert.deepEqual(EVENTS.sensitive_delete, { severity: 'bas', composant: 'site · admin' });
  assert.ok(isSiteType('sensitive_delete') && isVigieType('sensitive_delete'));
  assert.equal(LIBELLES.sensitive_delete, 'Suppression de données sensibles');
  assert.equal(pointsOf(row({ type: 'sensitive_delete', severity: 'bas', composant: 'site · admin', detail: { objet: 'message', id: 12 } })), 0.2);
  const v = vigieOf(t, { start: Date.now() });
  const decisions = createDecisions({ store: v.store, privateKey: VIGIE_KEYS.privateKey, now: v.now });
  const ingest = createIngest({ store: v.store, decisions, ingestKey: INGEST_KEY, now: v.now });
  t.after(() => ingest.close());
  const envoyer = async lot => {
    const body = JSON.stringify({ emetteur: 'site', envoye_a: v.now(), lot });
    const ts = String(v.now()), nonce = crypto.randomBytes(16).toString('hex');
    return ingest.inject({ method: 'POST', url: '/v1/events', payload: body, headers: { 'x-vigie-ts': ts, 'x-vigie-nonce': nonce, 'x-vigie-sig': crypto.createHmac('sha256', INGEST_KEY).update(`${ts}.${nonce}.${body}`).digest('hex') } });
  };
  const ev = (composant = 'site · admin') => ({ v: 1, id: crypto.randomUUID(), type: 'sensitive_delete', severity: 'bas', survenu_a: v.now(), origine: { composant, emetteur: 'server/routes/messages.js · suppression' },
    sub: 'zitadel-julien', ip: '203.0.113.5', ip_net: '203.0.113.0', method: 'POST', route: '/admin/messages/:id/supprimer', status: 303, detail: { objet: 'message', id: 12 } });
  assert.equal((await envoyer([ev(), ev('vigie · console')])).statusCode, 200);
  const recus = v.db.prepare("SELECT composant, sub, detail FROM events WHERE type = 'sensitive_delete'").all();
  assert.deepEqual(recus, [{ composant: 'site · admin', sub: 'zitadel-julien', detail: '{"objet":"message","id":12}' }], 'le second (composant de la Vigie) écarté');
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_ingestion_refusee'").pluck().get(), 1);
});

test('BV-30 : messages_effaces_en_masse, 10 messages distincts supprimés en 1 h par un compte → alerte (DS18, alerter) ; 9, un message compté une fois, autre objet, autre compte, hors fenêtre : rien', async t => {
  const { rules, correlations } = loadRules(new URL('../vigie/regles/', import.meta.url).pathname);
  const c = correlations.find(x => x.name === 'messages_effaces_en_masse');
  assert.deepEqual([c.file, c.gravite, c.mode, c.cas, c.sourceUnique, c.entite, c.type, c.span, c.cond], ['40-donnees.yml', 'moyen', 'alerter', 'DS18', true, { kind: 'compte', champ: 'sub' }, 'value_count', 3600e3, { gte: 10, field: ['detail.objet', 'detail.id'] }]);
  assert.equal(rules.find(x => x.name === 'message_supprime').signal, false);
  const massives = v => v.alerts('sigma.messages_effaces_en_masse').map(a => [a.entite_kind, a.entite_key, a.gravite, a.cas, a.mode]);
  {
    const v = vigieOf(t);
    for (let id = 1; id <= 9; id++) efface(v, id);
    efface(v, 9); efface(v, 3);                                             // le même message, envoyé deux fois
    for (let id = 1; id <= 5; id++) efface(v, id, { objet: 'galerie' });     // un autre objet : pas un message
    for (let id = 10; id <= 20; id++) efface(v, id, { sub: 'zitadel-seb' });  // un autre compte
    assert.deepEqual(massives(v), [['compte', 'zitadel-seb', 'moyen', 'DS18', 'alerter']]);
    efface(v, 10);
    assert.deepEqual(massives(v).map(a => a[1]).sort(), ['zitadel-julien', 'zitadel-seb']);
  }
  // Étalé sur plus d'une heure : 5 puis 5, rien.
  {
    const v = vigieOf(t);
    for (let id = 1; id <= 5; id++) efface(v, id);
    v.clock.t += 3601e3;
    for (let id = 6; id <= 10; id++) efface(v, id);
    assert.deepEqual(massives(v), []);
  }
});

test('BV-30 : rôle incohérent (DS10) sur une suppression de message par un compte sans messages.traiter ; le photographe : rien', async t => {
  const v = vigieOf(t);
  v.store.setting.set('controle_roles_comptes', { instantane_a: v.now() - 3600e3, comptes: {
    'zitadel-julien': { roles: ['photographe'], adjust: {}, auteur: 1 },
    'zitadel-modo': { roles: ['moderateur'], adjust: {}, auteur: null },
  } });
  efface(v, 12); efface(v, 13, { sub: 'zitadel-modo' });
  assert.deepEqual(v.alerts('detecteur.role_incoherent').map(a => [a.entite_key, a.gravite]), [['zitadel-modo', 'critique']]);
});
