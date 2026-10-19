import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VIGIE_KEYS } from './helpers.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions, DecisionError } from '../vigie/decisions.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createEngine } from '../vigie/moteur.js';
import { loadRules } from '../vigie/sigma.js';
import { ROLES_SURVEILLES, PERMISSIONS_SURVEILLEES, REGLABLES_SURVEILLES, droitsSurveilles } from '../vigie/detecteurs.js';
import { checkRoles, snapshotName } from '../vigie/controle-roles.js';
import { createEdge } from '../vigie/bordure.js';
import { isType as isVigieType } from '../vigie/vocabulaire.js';
import { EVENTS } from '../server/securite/vocabulaire.js';
import { createDecisionsClient } from '../server/securite/decisions.js';
import { PERMISSIONS, ROLES, ADJUSTABLE } from '../server/permissions.js';
import { openDb, migrate } from '../server/db/index.js';
import worker, { resetCache, privateCacheClass } from '../bordure/worker.js';

// La Vigie face aux galeries privées (PR #149) et aux Carnets (PR #151) : registre des briques,
// docs/etudes/vigie-besoins-des-briques.md (BV-12, BV-14, BV-16 à BV-19, BV-21 des billets, BV-22, BV-23, BV-25, BV-26,
// « Tranché »). Événements synthétiques de la forme qu'émettent les deux PR (server/routes/prive.js, server/spaces.js,
// server/routes/galeries.js, server/routes/carnet.js, server/carnet-markdown.js) : pour chaque règle, l'attaque vue et le
// parcours ordinaire laissé tranquille.
const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-gc-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

function vigieOf(t, { start = Date.parse('2026-10-20T10:00:00Z') } = {}) {
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
  const add = (type, severity, extra = {}) => store.add([{ id: crypto.randomUUID(), recu_a: now(), survenu_a: now(), type, severity, canal: 'ingestion signée', confiance: 'rapporté', composant: 'site · public', ...extra,
    detail: extra.detail && typeof extra.detail === 'object' ? JSON.stringify(extra.detail) : extra.detail }]);
  const alerts = regle => db.prepare('SELECT * FROM alerts ORDER BY id').all().filter(a => !regle || a.regle === regle);
  const signals = regle => db.prepare("SELECT detail FROM events WHERE type = 'vigie_signal'").pluck().all().map(d => JSON.parse(d)).filter(d => !regle || d.regle === regle);
  return { dir, db, store, engine, decisions, switches, clock, now, add, alerts, signals };
}

// Événements des PR, tels qu'ils arrivent à la Vigie.
const PORTAIL = 'galerie_privee';
const refus = (v, { ip = '198.51.100.20', acces = 12, n = 1 } = {}) => v.add('authn_login_fail', 'bas', { ip, ip_net: ip.replace(/\.\d+$/, '.0'), emetteur: 'server/routes/prive.js · mot de passe',
  detail: { portail: PORTAIL, acces, espace: 3, echecs_consecutifs: n, echecs_total: n, pendant_pause: false } });
const entree = (v, { reseau = '198.51.100.0', pays = 'FR', acces = 12, groupe = false, appareil = 1, nouveau = true } = {}) => v.add('session_created', 'info', { ip_net: reseau, reference: `visiteur:${crypto.randomBytes(6).toString('hex')}`,
  emetteur: 'server/routes/prive.js · session', detail: { portail: PORTAIL, acces, espace: 3, appareil_n: appareil, nouvel_appareil: nouveau, se_souvenir: false, groupe, pays } });
const admin = (v, type, severity, detail, extra = {}) => v.add(type, severity, { composant: 'site · admin', sub: 'zitadel-julien', ip: '203.0.113.5', detail, ...extra });
const exposition = (v, action, extra = {}, sub = 'zitadel-julien') => v.add('privacy_exposure_changed', 'info', { composant: 'site · admin', sub, ip: '203.0.113.5', emetteur: 'server/spaces.js · accès privé',
  detail: { objet: 'acces_prive', action, espace: 3, acces: 12, auteur_espace: 1, groupe: false, telechargement: 'web', sans_filigrane: false, echeance_jours: 30, appareils_max: null, photos_a_verifier_confirmees: 0, ...extra } });

test('vocabulaire et règles : authn_login_lock (site · public), bordure_cache_prive ; le fichier des galeries et des Carnets se charge, entité « acces:<n°> »', () => {
  assert.deepEqual(EVENTS.authn_login_lock, { severity: 'moyen', composant: 'site · public' });
  assert.ok(isVigieType('bordure_cache_prive'));
  const { rules, correlations } = loadRules(new URL('../vigie/regles/', import.meta.url).pathname);
  const names = new Set([...rules, ...correlations].map(r => r.name));
  for (const n of ['galerie_echecs_adresse', 'galerie_essais_repartis', 'galerie_suspendue', 'galerie_scrypt_sature', 'acces_reseaux_multiples', 'acces_groupe_reseaux_multiples',
    'acces_pays_multiples', 'telechargements_en_masse', 'acces_nouvel_appareil_puis_siphonage', 'acces_apres_revocation', 'csrf_repetes_invite', 'acces_crees_en_masse',
    'acces_debloque_apres_suspension', 'acces_apres_session_reprise', 'acces_longue_echeance', 'ecriture_hors_portee', 'billet_construction_active', 'billet_apres_session_reprise',
    'billets_modifies_en_masse', 'bordure_cache_prive']) assert.ok(names.has(n), n);
  // Premier mois (Tranché 5) : tout en « alerter » ; la réponse automatique n'est portée que par les règles de pays.
  const fichier = [...rules, ...correlations].filter(r => r.file === '85-galeries-carnets.yml' && r.signal && (r.generate ?? true));
  for (const r of fichier) assert.ok(['alerter', 'observer'].includes(r.mode) && r.mode !== 'bloquer', r.name);
  assert.deepEqual(fichier.filter(r => r.reponse).map(r => r.name).sort(), ['acces_groupe_pays_multiples', 'acces_pays_multiples']);
  // Garde-fous du chargement : préfixe d'entité, réponse suspendre_acces sur autre chose qu'un accès.
  const d = tmp({ after: () => {} });
  for (const [bad, err] of [
    ["vigie: { entite: { kind: site, champ: detail.acces, prefixe: 'Acces 12' }, source_unique: true }", /préfixe d'entité invalide/],
    ['vigie: { entite: { kind: compte, champ: sub }, reponse: suspendre_acces }', /suspendre_acces vise un accès/],
  ]) {
    fs.writeFileSync(path.join(d, 'x.yml'), `title: x\nname: x\nlevel: low\ndetection:\n  s:\n    type: x\n  condition: s\n${bad}\n`);
    assert.throws(() => loadRules(d), err);
  }
  fs.rmSync(d, { recursive: true, force: true });
});

test('règles de l’admin : aucune ne compte les invités des galeries (échecs de connexion, CSRF, cookie rejoué, exports)', async t => {
  const v = vigieOf(t);
  for (let i = 0; i < 6; i++) refus(v, { ip: `198.51.100.${30 + (i % 3)}`, n: i + 1 });
  v.add('authz_csrf_fail', 'moyen', { ip: '198.51.100.30', reference: 'visiteur:0123456789ab', detail: { jeton: 'faux', formulaire: 'favori' } });
  v.add('session_use_after_expire', 'haut', { ip: '198.51.100.30', detail: { portail: PORTAIL, jeton: 'cookie_visiteur', raison: 'acces_revoque', acces: 12, espace: 3, meme_reseau_et_navigateur: false } });
  for (let i = 0; i < 5; i++) v.add('sensitive_export', 'bas', { ip: '198.51.100.30', detail: { portail: PORTAIL, acces: 12, espace: 3, nature: 'archive', photos: 40, octets: 1e8, taille: 'web' } });
  const admins = ['sigma.oidc_echecs_repetes', 'sigma.cible_commune', 'sigma.csrf_repetes', 'sigma.cookie_rejoue', 'sigma.exports_nombreux', 'detecteur.pivot_identifiants'];
  for (const r of admins) assert.equal(v.signals(r).length, 0, r);
});

test('BV-16 : 10 refus d’une adresse en 15 min → points DS16 ; 3 adresses sur un accès en 1 h → alerte ; une invitée qui se trompe deux fois : rien', async t => {
  const v = vigieOf(t);
  // Parcours ordinaire : Lucie se trompe deux fois, puis entre.
  refus(v, { ip: '198.51.100.9', n: 1 }); refus(v, { ip: '198.51.100.9', n: 2 });
  entree(v);
  assert.equal(v.alerts().length, 0);
  assert.equal(v.signals('sigma.galerie_echecs_adresse').length, 0);
  // Acharnement depuis une adresse.
  for (let i = 0; i < 10; i++) refus(v, { ip: '198.51.100.20', acces: 13, n: i + 1 });
  assert.equal(v.signals('sigma.galerie_echecs_adresse').length, 1);
  assert.equal(v.signals('sigma.galerie_echecs_adresse')[0].entite.key, '198.51.100.20');
  // Le lien a fui : trois adresses contre le même accès.
  refus(v, { ip: '203.0.113.1', acces: 14 }); refus(v, { ip: '203.0.113.2', acces: 14 });
  assert.equal(v.alerts('sigma.galerie_essais_repartis').length, 0, 'deux adresses : pas encore');
  refus(v, { ip: '192.0.2.77', acces: 14 });
  const a = v.alerts('sigma.galerie_essais_repartis')[0];
  assert.equal(a.gravite, 'haut');
  assert.deepEqual([a.entite_kind, a.entite_key, a.mode, a.cas], ['site', 'acces:14', 'alerter', 'DS31']);
});

test('BV-16 : suspension sous ses deux formes (authn_login_lock, ou authn_login_disabled avec type_attendu) → alerte ; une pause : rien ; scrypt saturé 5 minutes sur 10 → alerte', async t => {
  const v = vigieOf(t);
  const palier = (type, palierNom, acces) => v.add(type, palierNom === 'suspension' ? 'haut' : 'moyen', { ip: '198.51.100.20', emetteur: 'server/routes/prive.js · verrou',
    detail: { ...(type === 'authn_login_disabled' ? { type_attendu: 'authn_login_lock' } : {}), portail: PORTAIL, acces, espace: 3, palier: palierNom, refus_24h: 30, reseaux_24h: 1, pays_24h: 1 } });
  palier('authn_login_disabled', 'pause_1min', 20);
  palier('authn_login_lock', 'pause_15min', 20);
  assert.equal(v.alerts().length, 0, 'une pause reste un contexte (Tranché 3)');
  palier('authn_login_disabled', 'suspension', 21);
  palier('authn_login_lock', 'suspension', 22);
  assert.deepEqual(v.alerts('sigma.galerie_suspendue').map(a => a.entite_key), ['acces:21', 'acces:22']);
  // Un compte de l'admin désactivé (authn_login_disabled de la connexion) n'est pas une galerie.
  v.add('authn_login_disabled', 'moyen', { composant: 'site · connexion', sub: 'zitadel-x', detail: { raison: 'désactivé' } });
  assert.equal(v.alerts('sigma.galerie_suspendue').length, 2);
  // Sémaphore saturé (le site le dit une fois par minute au plus).
  const sature = () => v.add('excess_rate_limit_exceeded', 'bas', { ip: '198.51.100.20', emetteur: 'server/routes/prive.js · calculs', detail: { limite: 'mot_de_passe_global' } });
  for (let i = 0; i < 4; i++) { sature(); v.clock.t += 60e3; }
  assert.equal(v.alerts('sigma.galerie_scrypt_sature').length, 0);
  sature();
  assert.equal(v.alerts('sigma.galerie_scrypt_sature')[0].entite_key, 'mot_de_passe_global');
});

test('BV-18 : 4 réseaux en 7 jours (10 pour un lien de groupe), 3 pays en 24 h (5 pour un groupe) ; une famille sur deux réseaux : rien', async t => {
  const v = vigieOf(t);
  // Parcours ordinaire : la maison, le téléphone, sur deux jours.
  entree(v, { reseau: '198.51.100.0' }); v.clock.t += 864e5; entree(v, { reseau: '203.0.113.0', appareil: 2 });
  assert.equal(v.alerts().length, 0);
  entree(v, { reseau: '192.0.2.0', appareil: 3 }); v.clock.t += 3 * 864e5;
  assert.equal(v.alerts('sigma.acces_reseaux_multiples').length, 0, 'trois réseaux : le site le signale (G62), la Vigie attend le quatrième');
  entree(v, { reseau: '100.64.1.0', appareil: 4 });
  assert.deepEqual(v.alerts('sigma.acces_reseaux_multiples').map(a => [a.entite_key, a.gravite, a.mode]), [['acces:12', 'moyen', 'alerter']]);
  // Lien de groupe : 9 réseaux, rien ; le 10e, une alerte.
  for (let i = 0; i < 9; i++) entree(v, { acces: 30, groupe: true, reseau: `10.${i}.0.0`, pays: 'FR' });
  assert.equal(v.alerts('sigma.acces_groupe_reseaux_multiples').length, 0);
  assert.equal(v.alerts('sigma.acces_reseaux_multiples').filter(a => a.entite_key === 'acces:30').length, 0, 'le seuil personnel ne vaut pas pour un groupe');
  entree(v, { acces: 30, groupe: true, reseau: '10.9.0.0' });
  assert.equal(v.alerts('sigma.acces_groupe_reseaux_multiples')[0].entite_key, 'acces:30');
  // Trois pays en 24 h sur un accès personnel ; un groupe en a cinq avant l'alerte.
  entree(v, { acces: 40, pays: 'FR' }); entree(v, { acces: 40, pays: 'BE', reseau: '10.50.0.0' });
  assert.equal(v.alerts('sigma.acces_pays_multiples').length, 0);
  entree(v, { acces: 40, pays: 'BR', reseau: '10.51.0.0' });
  assert.deepEqual(v.alerts('sigma.acces_pays_multiples').map(a => [a.entite_key, a.gravite, a.cas]), [['acces:40', 'haut', 'DS3']]);
  for (const p of ['FR', 'BE', 'DE']) entree(v, { acces: 41, groupe: true, pays: p });
  assert.equal(v.alerts('sigma.acces_groupe_pays_multiples').length + v.alerts('sigma.acces_pays_multiples').filter(a => a.entite_key === 'acces:41').length, 0, 'mariage avec des invités étrangers : rien');
  // Premier mois : mode « alerter », aucune décision prise.
  assert.equal(v.decisions.active().length, 0);
});

test('BV-18 : en mode « bloquer », 3 pays en 24 h → décision suspendre_acces prise par la Vigie, une seule ; interrupteur des blocages arrêté : aucune', async t => {
  const v = vigieOf(t);
  v.engine.setMode('sigma.acces_pays_multiples', 'bloquer', 'test');
  for (const p of ['FR', 'IT', 'US']) entree(v, { acces: 50, pays: p, reseau: `10.${p.charCodeAt(0)}.0.0` });
  const d = v.decisions.active();
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].kind, d[0].cible, d[0].auto], ['suspendre_acces', '50', 1]);
  assert.match(d[0].par, /acces_pays_multiples/);
  entree(v, { acces: 50, pays: 'JP', reseau: '10.99.0.0' });
  assert.equal(v.decisions.active().length, 1, 'jamais en double');
  // Interrupteur des blocages arrêté : la réponse est notée, rien n'est décidé.
  v.clock.t += 2 * 864e5;
  v.switches.set('blocages', 'arret', { duree: '2h', par: 'test', motif: 'essai' });
  for (const p of ['FR', 'IT', 'US']) entree(v, { acces: 51, pays: p, reseau: `10.${p.charCodeAt(1)}.1.0` });
  assert.equal(v.decisions.active().filter(x => x.cible === '51').length, 0);
});

test('BV-19 : limite de téléchargements ou d’archives → alerte ; nouvel appareil puis limite atteinte dans l’heure → haute ; une archive après le premier appareil : rien', async t => {
  const v = vigieOf(t);
  const limite = (limiteNom, acces = 12) => v.add('excess_rate_limit_exceeded', 'bas', { ip: '198.51.100.20', reference: 'visiteur:0123456789ab', emetteur: 'server/routes/prive.js · téléchargements',
    detail: { limite: limiteNom, par_heure: 50, portail: PORTAIL, acces, espace: 3, taille: 'web' } });
  // Parcours ordinaire : entrée, puis une archive (sensitive_export), puis un second appareil, une archive encore.
  entree(v, { acces: 60 });
  v.add('sensitive_export', 'bas', { ip: '198.51.100.20', detail: { portail: PORTAIL, acces: 60, espace: 3, nature: 'archive', photos: 48, octets: 2e8, taille: 'web' } });
  entree(v, { acces: 60, appareil: 2, reseau: '203.0.113.0' });
  v.add('sensitive_export', 'bas', { ip: '203.0.113.9', detail: { portail: PORTAIL, acces: 60, espace: 3, nature: 'archive', photos: 48, octets: 2e8, taille: 'web' } });
  assert.equal(v.alerts().length, 0);
  // Une autre limite du site (recherche) n'est pas une galerie.
  v.add('excess_rate_limit_exceeded', 'bas', { ip: '198.51.100.20', detail: { limite: 'recherche' } });
  assert.equal(v.alerts('sigma.telechargements_en_masse').length, 0);
  limite('telechargements', 61);
  assert.equal(v.alerts('sigma.telechargements_en_masse')[0].entite_key, 'acces:61');
  limite('archives', 62);
  assert.equal(v.alerts('sigma.telechargements_en_masse').length, 2);
  // Nouvel appareil (le 3e), puis la limite dans l'heure : corrélation haute.
  entree(v, { acces: 63, appareil: 3, nouveau: true });
  v.clock.t += 20 * 60e3;
  limite('telechargements', 63);
  assert.deepEqual(v.alerts('sigma.acces_nouvel_appareil_puis_siphonage').map(a => [a.entite_key, a.gravite]), [['acces:63', 'haut']]);
});

test('BV-22 : accès retiré ou lien remplacé encore présenté → alerte sur l’accès (haute si autre réseau) ; échéance passée : rien n’est émis, rien n’alerte', async t => {
  const v = vigieOf(t);
  const rejeu = (severity, detail) => v.add('session_use_after_expire', severity, { ip: '198.51.100.20', emetteur: 'server/routes/prive.js · session', detail: { portail: PORTAIL, ...detail } });
  rejeu('moyen', { jeton: 'lien', raison: 'lien_remplace', acces: 70, espace: 3, meme_reseau_et_navigateur: null });
  rejeu('haut', { jeton: 'cookie_visiteur', raison: 'acces_revoque', acces: 71, espace: 3, meme_reseau_et_navigateur: false });
  rejeu('moyen', { jeton: 'cookie_visiteur', raison: 'jeton_remplace', acces: null, espace: 3, meme_reseau_et_navigateur: true });
  const a = v.alerts('sigma.acces_apres_revocation');
  assert.deepEqual(a.map(x => [x.entite_key, x.gravite]), [['acces:70', 'moyen'], ['acces:71', 'haut'], ['galerie_privee', 'moyen']]);
  // Une session de l'admin rejouée garde sa règle (cookie_rejoue, avec un sub) ; celle-ci ne la double pas.
  v.add('session_use_after_expire', 'haut', { composant: 'site · connexion', sub: 'zitadel-julien', ip: '203.0.113.7', detail: { meme_reseau_et_navigateur: false } });
  assert.equal(v.alerts('sigma.acces_apres_revocation').length, 3);
  assert.equal(v.alerts('sigma.cookie_rejoue').length, 1);
});

test('BV-25 : 3 échecs CSRF d’une même session d’invité en 1 h → points sur la session (corrélation sœur de csrf_repetes) ; deux : rien', async t => {
  const v = vigieOf(t);
  const csrf = ref => v.add('authz_csrf_fail', 'moyen', { ip: '198.51.100.20', reference: ref, emetteur: 'server/routes/prive.js · CSRF', detail: { jeton: 'faux', formulaire: 'favori' } });
  csrf('visiteur:aaaaaaaaaaaa'); csrf('visiteur:aaaaaaaaaaaa'); csrf('visiteur:bbbbbbbbbbbb');
  assert.equal(v.signals('sigma.csrf_repetes_invite').length, 0);
  csrf('visiteur:aaaaaaaaaaaa');
  const s = v.signals('sigma.csrf_repetes_invite');
  assert.deepEqual([s.length, s[0].entite.kind, s[0].entite.key], [1, 'session', 'visiteur:aaaaaaaaaaaa']);
  assert.ok(v.engine.current('session', 'visiteur:aaaaaaaaaaaa').score >= 3);
});

test('BV-23 : 5 accès créés en 1 h, déblocage dans les 24 h d’une suspension, accès élargi après une session reprise, échéance au-delà de 90 jours', async t => {
  const v = vigieOf(t);
  // Parcours ordinaire : une séance, trois accès, un prolongé de 30 jours, un nouveau mot de passe après une suspension.
  exposition(v, 'cree', { acces: 80 }); exposition(v, 'cree', { acces: 81 }); exposition(v, 'nouveau_lien', { acces: 82 });
  exposition(v, 'prolonge', { acces: 80, echeance_jours: 60 });
  exposition(v, 'espace_ouvert', { acces: null, echeance_jours: 365 });
  v.add('authn_login_lock', 'haut', { ip: '198.51.100.20', detail: { portail: PORTAIL, acces: 81, espace: 3, palier: 'suspension' } });
  exposition(v, 'nouveau_mot_de_passe', { acces: 81 });
  assert.deepEqual(v.alerts().map(a => a.regle), ['sigma.galerie_suspendue'], 'le remède conseillé n’alerte pas ; une galerie ouverte pour un an non plus');
  // Débloquer sans changer le mot de passe dans les 24 h : medium, sur le compte qui débloque.
  v.clock.t += 3 * 3600e3;
  exposition(v, 'debloque', { acces: 81, debloque_apres_suspension: true });
  assert.deepEqual(v.alerts('sigma.acces_debloque_apres_suspension').map(a => [a.entite_key, a.gravite]), [['zitadel-julien', 'moyen']]);
  // Un déblocage d'une simple pause, sans suspension : rien.
  exposition(v, 'debloque', { acces: 83 });
  assert.equal(v.alerts('sigma.acces_debloque_apres_suspension').length, 1);
  // Cinq créations ou nouveaux liens en 1 h (les trois du matin sont sortis de la fenêtre).
  for (const n of [84, 85, 86, 87]) exposition(v, 'cree', { acces: n });
  assert.equal(v.alerts('sigma.acces_crees_en_masse').length, 0);
  exposition(v, 'nouveau_lien', { acces: 88 });
  assert.equal(v.alerts('sigma.acces_crees_en_masse')[0].entite_key, 'zitadel-julien');
  // Échéance de plus de 90 jours (Tranché 2 : 6 mois au plus) : « bas ».
  exposition(v, 'cree', { acces: 89, echeance_jours: 120 }, 'zitadel-seb');
  assert.deepEqual(v.alerts('sigma.acces_longue_echeance').map(a => [a.entite_key, a.gravite]), [['zitadel-seb', 'bas']]);
  // Session reprise depuis un autre appareil, puis un accès élargi dans l'heure : haute.
  v.add('session_context_change', 'haut', { composant: 'site · admin', sub: 'zitadel-lea', ip: '203.0.113.50', detail: { navigateur: { avant: 'Safari · macOS', apres: 'Chrome · Windows' } } });
  v.clock.t += 15 * 60e3;
  exposition(v, 'droits_elargis', { acces: 87, telechargement: 'grande' }, 'zitadel-lea');
  assert.deepEqual(v.alerts('sigma.acces_apres_session_reprise').map(a => [a.entite_key, a.gravite]), [['zitadel-lea', 'haut']]);
});

test('BV-14 : écriture hors portée (billet, galerie, accès, voyage) → alerte sur le compte ; consultation hors portée : exploration seulement', async t => {
  const v = vigieOf(t);
  const horsPortee = (emetteur, detail, method) => v.add('authz_fail', 'bas', { composant: 'site · admin', sub: 'zitadel-seb', ip: '203.0.113.6', method, emetteur, detail: { raison: 'hors portée', ...detail } });
  horsPortee('server/routes/carnet.js · portée', { permission: 'carnet.voir', objet: 'billet', id: 4, ecriture: false }, 'GET');
  horsPortee('server/routes/voyages.js · portée', { permission: 'sorties.voir', objet: 'voyage', id: 2, ecriture: false }, 'GET');
  horsPortee('server/permissions.js · droit refusé', { permission: 'galeries.partager' }, 'POST');
  assert.equal(v.alerts('sigma.ecriture_hors_portee').length, 0);
  horsPortee('server/routes/galeries.js · portée', { permission: 'galeries.partager', objet: 'galerie', id: 9, ecriture: true }, 'POST');
  const a = v.alerts('sigma.ecriture_hors_portee');
  assert.deepEqual(a.map(x => [x.entite_key, x.gravite, x.cas, x.mode]), [['zitadel-seb', 'moyen', 'DS10', 'alerter']]);
  horsPortee('server/routes/carnet.js · portée', { permission: 'carnet.ecrire', objet: 'billet', id: 5, ecriture: true }, 'POST');
  horsPortee('server/routes/voyages.js · portée', { permission: 'sorties.gerer', objet: 'voyage', id: 2, ecriture: true }, 'POST');
  assert.equal(v.alerts('sigma.ecriture_hors_portee')[0].compteur, 3, 'même alerte tant qu’elle est ouverte');
});

test('BV-12 : construction active neutralisée dans un billet → alerte ; HTML inoffensif ou image externe (« bas ») : rien ; après une session reprise → haute', async t => {
  const v = vigieOf(t);
  const billet = (severity, constructions, sub = 'zitadel-julien') => v.add('malicious_input', severity, { composant: 'site · admin', sub, ip: '203.0.113.5', emetteur: 'server/carnet-markdown.js · billet',
    detail: { objet: 'billet', billet: 7, champ: 'corps', langue: 'fr', familles: ['xss'], constructions: { script: 0, attribut_evenement: 0, schema_refuse: 0, data_url: 0, html_brut: 0, image_externe: 0, ...constructions }, longueur: 4200 } });
  billet('bas', { html_brut: 2 }); billet('bas', { image_externe: 1 });
  assert.equal(v.alerts().length, 0, 'un billet « Atelier » qui cite du HTML : gardé pour l’enquête, sans alerte');
  billet('moyen', { schema_refuse: 1 });
  assert.deepEqual(v.alerts('sigma.billet_construction_active').map(a => [a.entite_key, a.gravite, a.cas]), [['zitadel-julien', 'moyen', 'DS11']]);
  assert.equal(v.alerts('sigma.saisie_compte_admin').length, 0, 'pas deux alertes pour le même billet');
  v.add('session_context_change', 'haut', { composant: 'site · admin', sub: 'zitadel-lea', ip: '203.0.113.50', detail: {} });
  v.clock.t += 10 * 60e3;
  billet('moyen', { script: 1 }, 'zitadel-lea');
  assert.deepEqual(v.alerts('sigma.billet_apres_session_reprise').map(a => [a.entite_key, a.gravite]), [['zitadel-lea', 'haut']]);
});

test('BV-21 (billets, Tranché 10) : 3 billets en ligne changés en 1 h par un compte → alerte ; une traduction en trois langues compte une fois ; publication programmée : aucun compte', async t => {
  const v = vigieOf(t);
  const geste = (champs, sub = 'zitadel-julien') => v.add('config_public_changed', 'bas', { composant: 'site · admin', sub, ip: '203.0.113.5', emetteur: 'server/routes/carnet.js · textes publiés',
    detail: { objet: 'textes_publics', nombre: champs.length, champs } });
  // Un billet corrigé en trois langues, puis un second billet : deux gestes.
  geste(['posts.body', 'posts.body_en', 'posts.body_de']);
  geste(['posts.title']);
  // Textes de photos et de séries (règles de BV-21 pour eux, dans 80-admin.yml) : pas des billets.
  geste(['photos.legend', 'categories.intent']);
  // Publications programmées (sub nul).
  for (let i = 0; i < 3; i++) v.add('config_public_changed', 'bas', { composant: 'site · système', emetteur: 'server/carnet.js · textes publiés', detail: { objet: 'textes_publics', nombre: 1, champs: ['posts.body'] } });
  assert.equal(v.alerts('sigma.billets_modifies_en_masse').length, 0);
  geste(['posts.dek']);
  assert.deepEqual(v.alerts('sigma.billets_modifies_en_masse').map(a => [a.entite_key, a.gravite, a.cas]), [['zitadel-julien', 'moyen', 'DS9']]);
});

test('rôle incohérent (DS10) : galeries et Carnets jugés sur les rôles de l’instantané contrôlé ; galerie commune ou d’un autre photographe ; compte inconnu ou changé depuis : pas jugé', async t => {
  const v = vigieOf(t);
  v.store.setting.set('controle_roles_comptes', { instantane_a: v.now() - 3600e3, comptes: {
    'zitadel-julien': { roles: ['photographe'], adjust: {}, auteur: 1 },
    'zitadel-admin': { roles: ['admin'], adjust: {}, auteur: null },
    'zitadel-modo': { roles: ['moderateur'], adjust: {}, auteur: null },
    'zitadel-relecteur': { roles: ['relecteur'], adjust: {}, auteur: null },
    'zitadel-futur': { roles: ['photographe', 'archiviste'], adjust: {}, auteur: 4 },
    'zitadel-change': { roles: ['relecteur'], adjust: {}, auteur: null },
  } });
  const incoherents = () => v.alerts('detecteur.role_incoherent').map(a => a.entite_key);
  // Ordinaire : un photographe sur sa galerie, l'administrateur sur la galerie commune, le modérateur publie un billet, le
  // relecteur corrige un billet en ligne.
  exposition(v, 'cree', { auteur_espace: 1 });
  exposition(v, 'cree', { auteur_espace: null }, 'zitadel-admin');
  admin(v, 'malicious_input', 'moyen', { objet: 'billet', billet: 7, champ: 'corps', langue: 'fr', constructions: { script: 1 } }, { sub: 'zitadel-modo' });
  admin(v, 'config_public_changed', 'bas', { objet: 'textes_publics', nombre: 1, champs: ['posts.body'] }, { sub: 'zitadel-relecteur' });
  admin(v, 'sensitive_read', 'info', { cible: '/admin/galeries/:id/acces/:inv', objet: 'acces', id: 12 }, { emetteur: 'server/routes/galeries.js · lecture sensible' });
  assert.deepEqual(incoherents(), []);
  // Galerie commune ou celle d'un autre photographe, par un photographe (portée « les miennes ») : critique.
  exposition(v, 'cree', { auteur_espace: null, acces: 90 });
  assert.deepEqual(incoherents(), ['zitadel-julien']);
  assert.equal(v.alerts('detecteur.role_incoherent')[0].gravite, 'critique');
  exposition(v, 'droits_elargis', { auteur_espace: 2, acces: 91 });
  const sig = v.signals('detecteur.role_incoherent');
  assert.equal(sig.at(-1).hors_portee, true);
  // Le modérateur n'a pas les galeries ; le relecteur ne publie pas un billet neuf… il modifie les billets en ligne
  // (carnet.publies.modifier), ce qui suffit ; il n'a pas les galeries non plus.
  admin(v, 'sensitive_read', 'info', { cible: '/admin/galeries/:id', objet: 'galerie', id: 3 }, { sub: 'zitadel-modo', emetteur: 'server/routes/galeries.js · lecture sensible' });
  admin(v, 'sensitive_export', 'bas', { cible: '/admin/galeries/:id/acces/:inv/selection.csv' }, { sub: 'zitadel-relecteur' });
  assert.deepEqual(incoherents().sort(), ['zitadel-julien', 'zitadel-modo', 'zitadel-relecteur']);
  assert.deepEqual(v.signals('detecteur.role_incoherent').find(s => s.entite.key === 'zitadel-modo').permissions_manquantes, ['galeries.voir']);
  // Rôle inconnu de la Vigie, compte absent de l'instantané, rôles changés depuis : pas jugés.
  exposition(v, 'cree', { auteur_espace: null }, 'zitadel-futur');
  exposition(v, 'cree', { auteur_espace: null }, 'zitadel-nouveau');
  v.add('privilege_permissions_changed', 'bas', { composant: 'site · admin', sub: 'zitadel-admin', detail: { compte: 'zitadel-change', apres: { roles: ['relecteur', 'photographe'] } } });
  exposition(v, 'cree', { auteur_espace: 5 }, 'zitadel-change');
  assert.deepEqual(incoherents().sort(), ['zitadel-julien', 'zitadel-modo', 'zitadel-relecteur']);
  // Réglages du circuit : un photographe à qui l'on a donné « publier ses billets » publie ; sans, son billet en ligne
  // changé est incohérent si « modifier ses billets publiés » lui a été retiré.
  assert.equal(droitsSurveilles(['photographe'], { add: ['carnet.publier'] }).get('carnet.publier'), 'les miennes');
  assert.equal(droitsSurveilles(['photographe'], { remove: ['carnet.publies.modifier'] }).has('carnet.publies.modifier'), false);
  assert.equal(droitsSurveilles(['photographe', 'relecteur'], { remove: ['carnet.publies.modifier'] }).get('carnet.publies.modifier'), 'tout', 'un retrait n’ôte pas ce qu’un autre rôle donne');
});

test('rôles surveillés par la Vigie : d’accord avec le catalogue du site dès qu’il contient les permissions (après #149 et #151)', () => {
  for (const perm of PERMISSIONS_SURVEILLEES.filter(p => Object.hasOwn(PERMISSIONS, p))) {
    for (const [role, def] of Object.entries(ROLES)) assert.equal(ROLES_SURVEILLES[role]?.[perm] ?? null, def.perms[perm] ?? null, `${role} · ${perm}`);
  }
  for (const perm of REGLABLES_SURVEILLES.filter(p => Object.hasOwn(PERMISSIONS, p))) assert.ok(Object.hasOwn(ADJUSTABLE, perm), perm);
  assert.deepEqual(Object.keys(ROLES_SURVEILLES).sort(), Object.keys(ROLES).sort(), 'mêmes rôles de départ');
});

test('contrôle des rôles : rôles des comptes gardés pour le détecteur ; accès ouvert apparu sans événement du site → critique (BV-23, second temps)', async t => {
  const v = vigieOf(t, { start: Date.now() });
  const backups = tmp(t);
  fs.mkdirSync(path.join(backups, 'db'));
  const snap = (age, fill) => {
    const file = path.join(backups, 'db', snapshotName(Date.now() - age));
    const site = openDb(file);
    migrate(site);
    // Table des accès de la PR #149 (migration 056), réduite à ce que lit la Vigie.
    site.exec('CREATE TABLE IF NOT EXISTS space_invites (id INTEGER PRIMARY KEY, revoked_at INTEGER, expires_at INTEGER NOT NULL)');
    fill(site);
    site.close();
  };
  snap(3600e3, site => {
    site.prepare("INSERT INTO accounts (sub, name, roles, status, created_at, adjust) VALUES ('zitadel-admin', 'A', '[\"admin\"]', 'actif', 1, '{}'), ('zitadel-julien', 'J', '[\"photographe\"]', 'actif', 1, '{\"add\":[\"photos.publier\"]}')").run();
    site.prepare('INSERT INTO space_invites (id, revoked_at, expires_at) VALUES (1, NULL, ?), (2, 5, ?)').run(Date.now() + 864e5, Date.now() + 864e5);
  });
  v.add('sys_state', 'info', { composant: 'site · système', detail: { administrateurs: ['zitadel-admin'] } });
  const r1 = checkRoles({ store: v.store, siteBackupDir: backups });
  assert.equal(r1.ok, true, 'premier instantané avec des accès : référence seulement');
  const comptes = v.store.setting.get('controle_roles_comptes');
  assert.deepEqual(comptes.comptes['zitadel-julien'], { roles: ['photographe'], adjust: { add: ['photos.publier'], remove: [] }, auteur: null });
  assert.deepEqual(v.store.setting.get('controle_roles_acces').ids, [1]);
  // Deux accès de plus : l'un annoncé par le site (privacy_exposure_changed « cree »), l'autre écrit hors de l'application.
  exposition(v, 'cree', { acces: 3 });
  snap(60e3, site => {
    site.prepare("INSERT INTO accounts (sub, name, roles, status, created_at) VALUES ('zitadel-admin', 'A', '[\"admin\"]', 'actif', 1)").run();
    site.prepare('INSERT INTO space_invites (id, revoked_at, expires_at) VALUES (1, NULL, ?), (3, NULL, ?), (4, NULL, ?)').run(Date.now() + 864e5, Date.now() + 864e5, Date.now() + 864e5);
  });
  const r2 = checkRoles({ store: v.store, siteBackupDir: backups });
  assert.deepEqual(r2.accesSans, [4]);
  assert.equal(r2.ok, false);
  assert.equal(v.alerts('sigma.controle_roles')[0].gravite, 'critique');
});

test('décision suspendre_acces : numéro d’accès exigé, signée pour le site (« acces »), jamais pour la bordure ; le site l’applique une fois par app.spaces.suspend, l’ignore sans galeries', async t => {
  const v = vigieOf(t, { start: Date.now() });
  assert.throws(() => v.decisions.create({ kind: 'suspendre_acces', cible: 'zitadel-julien', duree: '7j', par: 'test' }), DecisionError);
  assert.throws(() => v.decisions.create({ kind: 'suspendre_acces', cible: '0', duree: '7j', par: 'test' }), /numéro d’accès/);
  const id = v.decisions.create({ kind: 'suspendre_acces', cible: '12', duree: '90j', motif: 'lien qui a fui', par: 'test' });
  const d = v.decisions.active().find(x => x.id === id);
  assert.equal(d.fin - d.cree_a, 30 * 864e5, '30 jours au plus');
  const signed = v.decisions.signed();
  assert.deepEqual(JSON.parse(signed.payload).acces, [{ id: 12, depuis: d.cree_a, fin: d.fin }]);
  assert.equal(JSON.parse(v.decisions.signedEdge().payload).acces, undefined, 'rien d’une galerie ne part chez Cloudflare');
  const pubkey = crypto.createPublicKey({ key: Buffer.from(VIGIE_KEYS.pub64, 'base64'), format: 'der', type: 'spki' });
  // Avec les galeries : appliquée une fois, même si la liste revient (attente longue, nouvelle version).
  const calls = [];
  const dir = tmp(t);
  const client = createDecisionsClient({ url: 'http://x', key: KEY, pubkey, storageDir: dir, spaces: () => ({ suspend: (n, raison) => { calls.push([n, raison]); return true; } }) });
  client.accept(signed);
  assert.deepEqual(calls, [[12, 'vigie']]);
  assert.equal(client.state.counts.acces, 1);
  v.decisions.create({ kind: 'bloquer', cible: '192.0.2.7', portee: 'tout', duree: '1h', par: 'test' });
  client.accept(v.decisions.signed());
  assert.deepEqual(calls, [[12, 'vigie']], 'l’équipe a pu débloquer entre-temps : jamais reposée par la même décision');
  // Redémarrage du site : la liste gardée sur le disque ne la repose pas.
  const again = [];
  const restarted = createDecisionsClient({ url: 'http://x', key: KEY, pubkey, storageDir: dir, spaces: () => ({ suspend: n => again.push(n) }) });
  restarted.accept(v.decisions.signed());
  assert.deepEqual(again, []);
  // Une nouvelle décision sur le même accès (après sa levée) : appliquée.
  v.decisions.lift({ id, par: 'test', motif: 'essai' });
  v.clock.t += 1000;
  v.decisions.create({ kind: 'suspendre_acces', cible: '12', duree: '7j', motif: 'encore', par: 'test' });
  restarted.accept(v.decisions.signed());
  assert.deepEqual(again, [12]);
  // Sans galeries privées (main avant #149 : app.spaces absent, ou sans suspend) : liste acceptée, entrée ignorée, sans erreur.
  for (const spaces of [() => undefined, () => ({}), () => { throw new Error('pas encore'); }]) {
    const c = createDecisionsClient({ url: 'http://x', key: KEY, pubkey, storageDir: tmp(t), spaces });
    assert.doesNotThrow(() => c.accept(v.decisions.signed()));
    assert.ok(c.blocked('192.0.2.7', '/'), 'le reste de la liste s’applique');
  }
  const bare = createDecisionsClient({ url: 'http://x', key: KEY, pubkey, storageDir: tmp(t) });
  assert.doesNotThrow(() => bare.accept(v.decisions.signed()));
  // VIGIE_APPLIQUER=0 : rien d'appliqué ; un échec du site est noté et retenté à la liste suivante.
  const off = [];
  createDecisionsClient({ url: 'http://x', key: KEY, pubkey, storageDir: tmp(t), apply: false, spaces: () => ({ suspend: n => off.push(n) }) }).accept(v.decisions.signed());
  assert.deepEqual(off, []);
  let fails = 1;
  const flaky = [];
  const fc = createDecisionsClient({ url: 'http://x', key: KEY, pubkey, storageDir: tmp(t), spaces: () => ({ suspend: n => { if (fails-- > 0) throw new Error('base occupée'); flaky.push(n); } }) });
  fc.accept(v.decisions.signed());
  v.decisions.create({ kind: 'bloquer', cible: '192.0.2.8', portee: 'tout', duree: '1h', par: 'test' });
  fc.accept(v.decisions.signed());
  assert.deepEqual(flaky, [12]);
  // Liste signée avec un accès illisible : refusée en entier (comme un réseau trop large).
  const forged = { ...JSON.parse(v.decisions.signed().payload), acces: [{ id: 'tout', depuis: 1, fin: Date.now() + 1e6 }] };
  const payload = JSON.stringify({ ...forged, version: forged.version + 10 });
  assert.throws(() => bare.accept({ payload, signature: crypto.sign(null, Buffer.from(payload), VIGIE_KEYS.privateKey).toString('base64') }), /accès de galerie privée invalide/);
});

// Worker exécuté dans Node : requête Cloudflare simulée, réponse de l'origine (passée par le cache) simulée.
async function runWorker({ url, headers = {}, ip = '198.51.100.20' }) {
  const points = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('page', { status: 200, headers });
  try {
    resetCache();
    const request = new Request(url, { headers: { 'cf-connecting-ip': ip } });
    Object.defineProperty(request, 'cf', { value: { asn: 3215, asOrganization: 'Orange', country: 'FR', tlsVersion: 'TLSv1.3', tlsCipher: 'X', clientTcpRtt: 10 } });
    const res = await worker.fetch(request, { BORDURE_KEY: 'cle-de-la-bordure-0123456789abcdefghij', DECISIONS_PUBKEY: VIGIE_KEYS.pub64, ANALYTICS: { writeDataPoint: p => points.push(p) } });
    return { res, points };
  } finally { globalThis.fetch = realFetch; }
}

test('BV-26 : réponse privée servie par le cache de Cloudflare → constat du Worker sans le chemin, lu par la Vigie, alerte haute ; DYNAMIC, BYPASS ou page publique en cache : rien', async t => {
  const jeton = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ab';
  // Ordinaire : galeries jamais en cache (DYNAMIC, BYPASS), page publique servie par le cache (HIT, public).
  for (const [url, headers] of [
    [`https://nicephos.art/g/${jeton}`, { 'cf-cache-status': 'DYNAMIC', 'cache-control': 'no-store' }],
    ['https://nicephos.art/prive/abcdefabcdef', { 'cf-cache-status': 'BYPASS', 'cache-control': 'no-store' }],
    ['https://nicephos.art/a-propos', { 'cf-cache-status': 'HIT', 'cache-control': 'public, max-age=300' }],
    ['https://nicephos.art/prive/abcdefabcdef', {}],
  ]) {
    const { points } = await runWorker({ url, headers });
    assert.equal(points.filter(p => p.blobs[0] === 'cache_prive').length, 0, url);
  }
  // Page du lien, image privée, téléchargement, page d'admin gardés par le cache.
  const vus = [];
  for (const [url, headers, classe] of [
    [`https://nicephos.art/g/${jeton}`, { 'cf-cache-status': 'HIT', 'cache-control': 'no-store' }, 'lien'],
    ['https://nicephos.art/prive/abcdefabcdef/m/x-1200.webp', { 'cf-cache-status': 'HIT', 'cache-control': 'private, no-cache' }, 'image'],
    ['https://nicephos.art/prive/abcdefabcdef/telecharger/3/web', { 'cf-cache-status': 'MISS' }, 'fichier'],
    ['https://nicephos.art/admin/personnes/4', { 'cf-cache-status': 'EXPIRED', 'cache-control': 'private, no-store' }, 'page'],
  ]) {
    const { res, points } = await runWorker({ url, headers });
    assert.equal(res.status, 200, 'la réponse part telle quelle');
    const p = points.find(x => x.blobs[0] === 'cache_prive');
    assert.ok(p, url);
    assert.equal(p.blobs[8], `${classe}|${headers['cf-cache-status']}`);
    assert.ok(!JSON.stringify(points).includes(jeton), 'jamais le jeton du lien');
    vus.push(p);
  }
  assert.deepEqual(privateCacheClass('/prive/abc/archive/2', new Response('', { headers: { 'cf-cache-status': 'STALE' } })), { classe: 'fichier', statut_cache: 'STALE' });
  // La Vigie lit le point dans Analytics Engine : événement bordure_cache_prive, alerte haute (source unique).
  const v = vigieOf(t, { start: Date.parse('2026-10-20T10:00:30Z') });
  const dir = tmp(t);
  const tokenFile = path.join(dir, 'cloudflare-token');
  fs.writeFileSync(tokenFile, 'jeton-cloudflare\n');
  const bound = Math.floor((v.clock.t - 180e3) / 60e3) * 60e3;
  v.store.setting.set('bordure_curseur', bound - 2 * 60e3);
  const minute = String(bound / 1000 - 60);
  const sql = { data: [
    { minute, ip: '198.51.100.20', classe: 'page', statut: '200', pays: 'FR', asn: '3215', org: 'Orange', tls: 'a'.repeat(16), note: '', n: '2' },
    { minute, ip: '198.51.100.20', classe: 'cache_prive', statut: '200', pays: 'FR', asn: '3215', org: 'Orange', tls: 'a'.repeat(16), note: vus[0].blobs[8], n: '2' },
  ] };
  const fetchImpl = async url => new Response(url.endsWith('/analytics_engine/sql') ? JSON.stringify(sql) : '{}', { status: 200 });
  const edge = createEdge({ store: v.store, decisions: v.decisions, accountId: 'a'.repeat(32), kvNamespace: 'b'.repeat(32), dataset: 'vigie_bordure', tokenFile, fetchImpl, now: v.now });
  t.after(() => edge.stop());
  assert.equal(await edge.read(), 1);
  const ev = v.db.prepare("SELECT * FROM events WHERE type = 'bordure_cache_prive'").get();
  assert.equal(ev.composant, 'bordure');
  assert.deepEqual(JSON.parse(ev.detail).classe, 'lien');
  assert.equal(JSON.parse(ev.detail).statut_cache, 'HIT');
  const a = v.alerts('sigma.bordure_cache_prive');
  assert.deepEqual(a.map(x => [x.entite_kind, x.entite_key, x.gravite, x.cas, x.mode]), [['site', 'cache_prive', 'haut', 'DS18', 'alerter']]);
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'bordure_rafale' OR type = 'bordure_erreurs'").pluck().get(), 0, 'pas compté comme une page');
});
