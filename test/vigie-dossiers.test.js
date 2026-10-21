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
import { ALL } from '../vigie/vocabulaire.js';
import { coherence, entiteDossier, createDossiers } from '../vigie/dossiers.js';

// Dossiers de la Vigie (étude docs/etudes/vigie-dossiers.md) : les cinq scénarios de la section 7, de bout en bout (les
// événements passent par le moteur, ses règles et ses détecteurs), puis le rattachement, la fusion, les exclusions
// d'adresses, le cycle de vie, les gestes de l'analyste et la purge.

const LOG_KEY = 'cle-de-chaine-vigie-dossiers-0123456789';
const H = 3600e3, J = 864e5, MIN = 60e3;
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-dossiers-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

function vigieOf(t, { start = Date.parse('2026-10-20T08:00:00Z'), retentionDays = 183 } = {}) {
  const db = openVigieDb(path.join(tmp(t), 'vigie.db'));
  t.after(() => db.close());
  const clock = { t: start };
  const now = () => clock.t;
  const store = createStore({ db, logKey: LOG_KEY, now, retentionDays });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now, log: { warn() {}, info() {}, error: (o, m) => { throw new Error(`${m} : ${o.err} (${o.quoi})`); } } });
  store.onAdded(rows => engine.process(rows));
  const add = (type, extra = {}) => store.add([{ id: crypto.randomUUID(), recu_a: now(), survenu_a: now(), type, severity: extra.severity || ALL[type].severity,
    canal: 'ingestion signée', confiance: 'rapporté', composant: ALL[type].composant, ...extra, detail: extra.detail ? JSON.stringify(extra.detail) : undefined }]);
  const D = engine.dossiers;
  const dossiers = () => db.prepare('SELECT * FROM dossiers WHERE fusionne_dans IS NULL ORDER BY id').all();
  const fiche = id => D.fiche(id);
  const alerts = () => db.prepare('SELECT * FROM alerts ORDER BY id').all();
  return { db, store, engine, clock, add, D, dossiers, fiche, alerts };
}
const at = (v, iso) => { v.clock.t = Date.parse(iso); };
// Connexion réussie au site (empreinte d'appareil, pays).
const connexion = (v, sub, { ip, country = 'FR', appareil = 'fp-habituel', session } = {}) =>
  v.add('authn_login_success', { sub, ip, ip_net: ip?.replace(/\.\d+$/, '.0'), country, session, detail: { methode: 'oidc', appareil } });
const lecture = (v, sub, id, { ip, session, objet = 'personne' } = {}) =>
  v.add('sensitive_read', { sub, ip, session, detail: { cible: `/admin/${objet === 'personne' ? 'personnes' : `${objet}s`}/:id`, objet, id } });

test('BV-33 : enjeu par catégorie fermée, métadonnées bornées ; objets anciens toujours compris', t => {
  for (const [categorie, attendu] of [['identite', 'personnel'], ['coordonnees', 'personnel'], ['image', 'personnel'], ['message_libre', 'personnel'],
    ['mineur', 'sensible'], ['accord_signe', 'sensible'], ['localisation', 'sensible'], ['<script>secret</script>', 'ordinaire'], ['__proto__', 'ordinaire']]) {
    const v = vigieOf(t);
    v.add('session_use_after_expire', { sub: 'compte-e', detail: { meme_reseau_et_navigateur: false } });
    v.add('sensitive_read', { sub: 'compte-e', detail: { categorie: [categorie, categorie], objets: -8, dechiffrements: Infinity, octets_servis: '999', nom: 'secret à exclure' } });
    const [d] = v.dossiers();
    assert.equal(d.enjeu, attendu, categorie);
    const donnees = v.fiche(d.id).signaux.find(s => s.regle === 'fait.sensitive_read').donnees;
    assert.doesNotMatch(donnees, /secret|script|proto/);
    const x = JSON.parse(donnees);
    assert.equal(x.objets, 0); assert.equal(x.dechiffrements, null); assert.equal(x.octets_servis, null);
    assert.ok(x.categorie.length <= 1);
  }
});

test('BV-33 : export catégorisé sous accès hostile, enjeu critique sans objet ni contenu de fiche', t => {
  const v = vigieOf(t);
  v.add('session_use_after_expire', { sub: 'compte-e', detail: { meme_reseau_et_navigateur: false } });
  v.add('sensitive_export', { sub: 'compte-e', detail: { categorie: ['coordonnees'], objets: 1, octets_servis: 4096, dechiffrements: 2 } });
  const [d] = v.dossiers();
  assert.equal(d.enjeu, 'critique'); assert.equal(d.phase_max, 7);
  assert.match(d.explication, /coordonnées|données personnelles sorties/);
});

test('BV-33 : dix objets dans une liste rendent l’enjeu sensible, sans additionner des relectures', t => {
  const v = vigieOf(t);
  v.add('session_use_after_expire', { sub: 'compte-e', detail: { meme_reseau_et_navigateur: false } });
  for (let i = 0; i < 12; i++) v.add('sensitive_read', { sub: 'compte-e', detail: { objet: 'compte', id: null, categorie: ['identite'], liste: true, objets: 3 } });
  assert.equal(v.dossiers()[0].enjeu, 'personnel');
  v.add('sensitive_read', { sub: 'compte-e', detail: { objet: 'compte', id: null, categorie: ['identite'], liste: true, objets: 10 } });
  assert.equal(v.dossiers()[0].enjeu, 'sensible');
});

test('BV-33 : liste sous confiance moyenne, huit objets en une lecture ; relectures, cartes et liste vide ne suffisent pas', t => {
  const v = vigieOf(t);
  // Trois points, sans preuve : même construction que le scénario 7.3 (deux changements de contexte différents
  // ne s'additionnent pas ; on combine ici le contexte à un opérateur inédit).
  v.add('session_context_change', { sub: 'compte-e', session: 's-e', severity: 'moyen', detail: { reseau: true } });
  v.D.surSignal({ regle: 'sigma.bordure_nouvel_operateur', entite: { kind: 'compte', key: 'compte-e' }, gravite: 'bas', sources: ['bordure'],
    projection: { nature: 'indice', n: 3, marqueurs: [] } }, { seq: null, sub: 'compte-e', survenu_a: v.clock.t });
  assert.equal(v.D.confianceCompte('compte-e', v.clock.t - H).niveau, 'moyenne');
  for (let i = 0; i < 9; i++) v.add('sensitive_read', { sub: 'compte-e', session: 's-e', detail: { categorie: ['identite'], liste: true, objets: 7 } });
  v.add('sensitive_read', { sub: 'compte-e', session: 's-e', detail: { categorie: [], liste: true, objets: 10000 } });
  assert.equal(v.dossiers().length, 0);
  v.add('sensitive_read', { sub: 'compte-e', session: 's-e', detail: { categorie: ['identite'], liste: true, objets: 8 } });
  assert.equal(v.dossiers().length, 1); assert.equal(v.dossiers()[0].phase_max, 6);
  assert.ok(v.fiche(v.dossiers()[0].id).signaux.filter(s => JSON.parse(s.donnees || 'null')?.categorie.length === 0).every(s => !s.promu));
});

test('BV-33 : trois réseaux pour un compte, indice de 1,5 ; pas de dossier seul, ni cumul par répétition', t => {
  const v = vigieOf(t);
  const lire = (sub, ip_net) => v.add('sensitive_read', { sub, ip_net, detail: { objet: 'personne', id: 1 } });
  for (let i = 0; i < 8; i++) lire('compte-e', '192.0.2.0/24');
  lire('compte-e', '2001:db8:1::/48'); lire('autre-compte', '203.0.113.0/24');
  const indices = () => v.db.prepare("SELECT * FROM signaux_projetes WHERE regle = 'sigma.compte_reseaux_multiples'").all();
  assert.equal(indices().length, 0);
  lire('compte-e', '203.0.113.0/24');
  assert.equal(indices().length, 1); assert.equal(indices()[0].nature, 'indice'); assert.equal(indices()[0].points, 1.5);
  assert.equal(v.dossiers().length, 0); assert.equal(v.alerts().length, 0);
  for (let i = 0; i < 5; i++) lire('compte-e', '203.0.113.0/24');
  assert.equal(v.D.confianceCompte('compte-e', v.clock.t - H).points, 1.5);
  v.clock.t += 25 * H;
  const avant = indices().length;
  lire('compte-e', '198.51.100.0/24'); lire('compte-e', '192.0.2.0/24');
  assert.equal(indices().length, avant, 'fenêtre de 24 h');
  for (const ip_net of ['203.0.113.0/24', '192.0.2.0/24', '198.51.100.0/24']) v.add('authn_login_fail', { sub: 'victime', ip_net });
  assert.ok(indices().every(x => x.sub !== 'victime'), 'un nom de compte saisi dans un échec ne prouve pas son accès');
});

test('BV-33 : seuil de huit fiches par session, sans addition entre sessions du même compte', t => {
  const v = vigieOf(t);
  v.add('session_context_change', { sub: 'compte-e', session: 's-1', severity: 'moyen', detail: { reseau: true } });
  v.D.surSignal({ regle: 'sigma.bordure_nouvel_operateur', entite: { kind: 'compte', key: 'compte-e' }, gravite: 'bas', sources: ['bordure'],
    projection: { nature: 'indice', n: 3, marqueurs: [] } }, { seq: null, sub: 'compte-e', survenu_a: v.clock.t });
  for (let i = 1; i <= 7; i++) lecture(v, 'compte-e', i, { session: 's-1' });
  lecture(v, 'compte-e', 8, { session: 's-2' });
  assert.equal(v.dossiers().length, 0);
  lecture(v, 'compte-e', 8, { session: 's-1' });
  const [d] = v.dossiers(); assert.ok(d); assert.equal(d.phase_max, 6);
  const lus = v.fiche(d.id).signaux.filter(s => s.regle === 'fait.sensitive_read');
  assert.ok(lus.filter(s => s.session === 's-1').every(s => s.promu));
  assert.ok(lus.filter(s => s.session === 's-2').every(s => !s.promu));
});

test('BV-33 : catégories et volumes survivent à la fusion, à la scission et à la purge des événements', t => {
  const v = vigieOf(t);
  for (const sub of ['compte-e', 'compte-f']) v.add('session_use_after_expire', { sub, detail: { meme_reseau_et_navigateur: false } });
  v.add('sensitive_read', { sub: 'compte-f', detail: { categorie: ['mineur'], objets: 1, dechiffrements: 7, octets_servis: 4500 } });
  const [e, f] = v.dossiers(); v.D.fusionner(e.id, f.id, { par: 'test' });
  const signaux = v.fiche(e.id).signaux.filter(s => s.sub === 'compte-f').map(s => s.id);
  const nouveau = v.D.scinder(e.id, { entites: ['compte:compte-f'], signaux, par: 'test', motif: 'Deux attaques distinctes' });
  const avant = v.fiche(nouveau).signaux.find(s => s.regle === 'fait.sensitive_read').donnees;
  v.clock.t += 184 * J; v.engine.purge();
  v.D.recalculer(nouveau);
  const apres = v.fiche(nouveau);
  assert.equal(apres.signaux.find(s => s.regle === 'fait.sensitive_read').donnees, avant);
  assert.deepEqual(JSON.parse(avant), { categorie: ['mineur'], objets: 1, liste: false, dechiffrements: 7, octets_servis: 4500 });
  assert.equal(v.db.prepare('SELECT enjeu FROM dossiers WHERE id = ?').pluck().get(nouveau), 'sensible');
});
// Historique ordinaire d'un compte : une connexion par jour à 9 h (UTC), depuis la France, avec son appareil.
function historique(v, sub, jours, fin, { ip = '198.51.100.10', appareil = 'fp-habituel' } = {}) {
  for (let i = jours; i >= 1; i--) { v.clock.t = fin - i * J; connexion(v, sub, { ip, appareil }); }
}

test('cohérence : plus longue suite de phases dans l’ordre du temps ; entités des règles', () => {
  assert.deepEqual(coherence(new Map([[1, 10], [2, 20], [3, 30], [6, 40], [7, 50]])), [1, 2, 3, 6, 7]);
  assert.deepEqual(coherence(new Map([[6, 5], [3, 10], [7, 20]])), [3, 7], 'une collecte avant l’accès ne compte pas dans la suite');
  assert.deepEqual(coherence(new Map()), []);
  assert.deepEqual(entiteDossier({ kind: 'site', key: 'acces:41' }), { kind: 'acces', key: 'acces:41' });
  assert.deepEqual(entiteDossier({ kind: 'vigie', key: 'chaine' }), { kind: 'cible', key: 'vigie:chaine' });
  assert.deepEqual(entiteDossier({ kind: 'compte', key: 'a' }), { kind: 'compte', key: 'a' });
});

test('scénario 7.1 : vol de session d’un photographe, lectures puis export → un dossier critique, 5 phases dans l’ordre', t => {
  const v = vigieOf(t);
  const X = '203.0.113.7';
  historique(v, 'compte-a', 10, Date.parse('2026-10-20T09:00:00Z'));
  // La veille : un scanner depuis l'adresse de l'attaquant (repérage, sans dossier).
  at(v, '2026-10-19T22:10:00Z');
  for (let i = 0; i < 5; i++) { v.add('malicious_input', { ip: X, detail: { champ: 'q' } }); v.clock.t += MIN; }
  assert.equal(v.dossiers().length, 0, 'un repérage seul n’ouvre pas de dossier');
  // 08:52 : trois échecs ; 08:55 : connexion depuis un appareil et un pays inédits.
  at(v, '2026-10-20T08:52:00Z');
  for (let i = 0; i < 3; i++) { v.add('authn_login_fail', { sub: 'compte-a', ip: X }); v.clock.t += 20e3; }
  at(v, '2026-10-20T08:55:00Z');
  connexion(v, 'compte-a', { ip: X, country: 'NL', appareil: 'fp-attaquant', session: 's-attaq' });
  let ds = v.dossiers();
  assert.equal(ds.length, 1, 'échecs puis connexion sous une confiance forte : ouverture');
  assert.equal(ds[0].piste, 'identite');
  assert.equal(ds[0].confiance, 'forte');
  // 09:03 → 09:40 : 34 fiches ; 09:47 : un export.
  at(v, '2026-10-20T09:03:00Z');
  for (let i = 1; i <= 34; i++) { lecture(v, 'compte-a', i, { ip: X, session: 's-attaq' }); v.clock.t += MIN; }
  at(v, '2026-10-20T09:47:00Z');
  v.add('sensitive_export', { sub: 'compte-a', ip: X, session: 's-attaq', detail: { cible: '/admin/personnes/:id/export.zip', objet: 'personne', id: 5 } });
  ds = v.dossiers();
  assert.equal(ds.length, 1);
  const d = v.fiche(ds[0].id);
  assert.equal(d.phase_max, 7);
  assert.equal(d.coherence, 5);
  assert.deepEqual(d.explication.chaine, [1, 2, 3, 6, 7]);
  assert.equal(d.confiance, 'forte');
  assert.equal(d.enjeu, 'critique');
  assert.equal(d.gravite, 'critique');
  assert.match(d.explication.lignes[0], /^Critique · Exfiltration atteinte, 5 phases dans l’ordre \(repérage → tentative → accès → collecte → exfiltration\)/);
  assert.match(d.explication.lignes[1], /^Confiance forte : /);
  for (const x of ['échecs puis connexion', 'pays inédit (NL)', 'appareil inédit']) assert.ok(d.explication.lignes[1].includes(x), x);
  assert.match(d.explication.lignes[2], /^Enjeu critique : 34 objets personnels lus ou exportés.*export de données personnelles.*données personnelles sorties sous un accès douteux/);
  assert.ok(d.entites.some(e => e.kind === 'ip' && e.key === X));
  assert.ok(d.entites.some(e => e.kind === 'session' && e.key === 's-attaq'));
  assert.equal(d.signaux.filter(s => s.regle === 'fait.sensitive_read' && s.promu).length, 34, 'lectures sous un accès hostile : toutes des jalons');
  assert.equal(d.signaux.filter(s => s.regle === 'fait.authn_login_fail' && s.promu).length, 3, 'échecs avant l’accès : tentative');
  assert.ok(d.signaux.some(s => s.regle === 'sigma.scanner' && s.phase === 1), 'repérage de la veille rattaché par l’adresse');
  // Chaîne d'attaque (DS23) calculée sur le dossier, d'une entité à l'autre.
  const chaine = v.alerts().filter(a => a.regle === 'detecteur.chaine_attaque');
  assert.equal(chaine.length, 1);
  assert.equal(chaine[0].dossier_id, d.id);
  assert.ok(d.alertes.some(a => a.regle === 'detecteur.chaine_attaque'));
});

test('scénario 7.2 : photographe en voyage — ordinateur habituel : aucun dossier ; téléphone neuf : haut, puis bas après l’identité confirmée, puis appris', t => {
  // Ordinateur habituel : pays inédit 1,5 + heure inhabituelle 1 − appareil habituel 1 = 1,5 → faible.
  {
    const v = vigieOf(t);
    historique(v, 'compte-b', 21, Date.parse('2026-10-20T09:00:00Z'));
    at(v, '2026-10-21T02:14:00Z');
    connexion(v, 'compte-b', { ip: '192.0.2.50', country: 'JP', appareil: 'fp-habituel', session: 's-b1' });
    for (let i = 1; i <= 12; i++) { lecture(v, 'compte-b', i, { ip: '192.0.2.50', session: 's-b1' }); v.clock.t += MIN; }
    assert.equal(v.dossiers().length, 0);
    assert.equal(v.D.confianceCompte('compte-b', v.clock.t - 24 * H).niveau, 'faible');
  }
  // Téléphone neuf : pays 1,5 + appareil 1,5 + heure 1 = 4 → moyenne.
  const v = vigieOf(t);
  historique(v, 'compte-b', 21, Date.parse('2026-10-20T09:00:00Z'));
  at(v, '2026-10-21T02:14:00Z');
  connexion(v, 'compte-b', { ip: '192.0.2.50', country: 'JP', appareil: 'fp-telephone', session: 's-b2' });
  assert.equal(v.dossiers().length, 0, 'des indices seuls n’ouvrent pas de dossier');
  for (let i = 1; i <= 7; i++) { lecture(v, 'compte-b', i, { ip: '192.0.2.50', session: 's-b2' }); v.clock.t += MIN; }
  assert.equal(v.dossiers().length, 0, '7 fiches sous un accès douteux : pas encore');
  lecture(v, 'compte-b', 8, { ip: '192.0.2.50', session: 's-b2' });
  let [d] = v.dossiers();
  assert.ok(d, '8e fiche sous un accès douteux : ouverture');
  assert.equal(d.confiance, 'moyenne');
  assert.equal(d.phase_max, 6);
  assert.equal(d.gravite, 'haut');
  for (let i = 9; i <= 12; i++) { v.clock.t += MIN; lecture(v, 'compte-b', i, { ip: '192.0.2.50', session: 's-b2' }); }
  [d] = v.dossiers();
  assert.equal(d.enjeu, 'sensible');
  assert.equal(d.gravite, 'haut', 'l’enjeu sensible ne change pas le niveau');
  // Identité confirmée par le second facteur : contre-indice, confiance plafonnée à faible.
  v.clock.t += 9 * MIN;
  v.add('authn_reauth_success', { sub: 'compte-b', ip: '192.0.2.50', session: 's-b2', detail: { methode: 'oidc' } });
  [d] = v.dossiers();
  assert.equal(d.confiance, 'faible');
  assert.equal(d.gravite, 'bas');
  assert.match(JSON.parse(d.explication).lignes[1], /identité confirmée par le second facteur/);
  // Classé « légitime » : motif obligatoire ; le Japon et ce téléphone ne comptent plus pendant 90 jours.
  assert.throws(() => v.D.classer(d.id, { classement: 'legitime', par: 'essai' }), /motif obligatoire/);
  v.D.classer(d.id, { classement: 'legitime', note: 'voyage au Japon, téléphone acheté sur place', par: 'essai' });
  assert.equal(v.fiche(d.id).statut, 'clos');
  at(v, '2026-10-22T02:30:00Z');
  connexion(v, 'compte-b', { ip: '192.0.2.51', country: 'JP', appareil: 'fp-telephone', session: 's-b3' });
  for (let i = 20; i <= 40; i++) { lecture(v, 'compte-b', i, { ip: '192.0.2.51', session: 's-b3' }); v.clock.t += MIN; }
  assert.equal(v.dossiers().filter(x => x.statut !== 'clos').length, 0, 'indices appris : plus de dossier');
});

test('scénario 7.3 : bourrage d’identifiants chez Zitadel, puis ancrage et dissimulation → critique, chaîne d’attaque', t => {
  const v = vigieOf(t);
  at(v, '2026-10-20T14:00:00Z');
  for (let i = 0; i < 6; i++) { v.add('zitadel_echec', { sub: 'compte-c', ip: `198.51.100.${100 + i}` }); v.clock.t += MIN; }
  assert.equal(v.dossiers().length, 0, 'tentatives seules : pas de dossier');
  at(v, '2026-10-20T14:35:00Z');
  v.add('zitadel_connexion', { sub: 'compte-c', ip: '198.51.100.200', detail: { type_zitadel: 'session.added' } });
  let [d] = v.dossiers();
  assert.ok(d, 'échecs puis connexion : jalon d’accès, confiance moyenne');
  assert.equal(d.piste, 'identite');
  at(v, '2026-10-20T14:37:00Z');
  v.add('zitadel_facteur', { sub: 'compte-c', severity: 'haut', detail: { type_zitadel: 'user.human.mfa.otp.added' } });
  [d] = v.dossiers();
  assert.equal(d.phase_max, 5);
  assert.equal(d.confiance, 'forte', 'tentative → accès → ancrage : la suite monte la confiance');
  assert.equal(d.gravite, 'critique');
  at(v, '2026-10-20T14:39:00Z');
  v.add('privilege_permissions_changed', { sub: 'compte-c', ip: '198.51.100.200', severity: 'haut', detail: { administrateur_donne: true, compte: 'compte-d' } });
  at(v, '2026-10-20T14:41:00Z');
  v.store.own('vigie_surveillance_reduite', { emetteur: 'console · X (x)', detail: { objet: 'seuil:compte', valeur: 50, avant: 7, motif: 'essai' } });
  const ds = v.dossiers();
  d = ds.find(x => x.piste === 'identite');
  const f = v.fiche(d.id);
  assert.equal(f.dissimulation, 1, 'la Vigie aveuglée pendant le dossier');
  assert.equal(f.enjeu, 'sensible');
  assert.ok(f.entites.some(e => e.kind === 'compte' && e.key === 'compte-d'), 'le compte qui reçoit les droits entre dans le dossier');
  assert.ok(f.signaux.some(s => s.regle === 'sigma.cible_commune' || s.regle === 'sigma.zitadel_echecs_repetes'), 'tentatives rattachées en arrière');
  assert.ok(ds.some(x => x.piste === 'surveillance'), 'l’alerte de surveillance réduite a son propre dossier');
  assert.equal(v.alerts().filter(a => a.regle === 'detecteur.chaine_attaque' && a.dossier_id === d.id).length, 1);
});

test('scénario 7.4 : lien de galerie privée qui fuit → dossier invité, preuve, exfiltration, critique', t => {
  const v = vigieOf(t);
  const entree = (pays, ip, extra = {}) => v.add('session_created', { ip, detail: { portail: 'galerie_privee', acces: 41, groupe: false, pays, ...extra } });
  at(v, '2026-10-22T10:00:00Z');
  entree('FR', '192.0.2.10');
  at(v, '2026-10-22T18:00:00Z');
  entree('BR', '203.0.113.20', { nouvel_appareil: true, appareil_n: 2 });
  v.clock.t += 2 * MIN;
  entree('VN', '203.0.113.30');
  let [d] = v.dossiers();
  assert.ok(d, 'pays multiples sur un accès : alerte, dossier');
  assert.equal(d.piste, 'invite');
  assert.equal(d.confiance, 'forte');
  v.clock.t += 16 * MIN;
  v.add('excess_rate_limit_exceeded', { ip: '203.0.113.20', detail: { portail: 'galerie_privee', limite: 'telechargements', acces: 41 } });
  [d] = v.dossiers();
  assert.equal(v.dossiers().length, 1);
  assert.equal(d.phase_max, 7);
  assert.equal(d.gravite, 'critique');
  const f = v.fiche(d.id);
  assert.ok(f.alertes.some(a => a.regle === 'sigma.acces_nouvel_appareil_puis_siphonage'));
  assert.ok(f.entites.some(e => e.kind === 'acces' && e.key === 'acces:41' && e.force === 'graine'));
});

test('scénario 7.5 : compromission du serveur, reliée par le temps et par la corrélation → critique, avec dissimulation', t => {
  const v = vigieOf(t);
  const Z = '198.51.100.4';
  at(v, '2026-10-20T03:10:00Z');
  v.add('input_validation_fail', { ip: Z }); v.clock.t += MIN; v.add('input_validation_fail', { ip: Z });
  at(v, '2026-10-20T03:12:00Z');
  v.add('malicious_input', { ip: Z, severity: 'moyen', detail: { champ: 'fichier' } });
  at(v, '2026-10-20T03:20:00Z');
  v.add('reseau_sortie_refusee', { detail: { source_nom: 'site', destination: 'evil.example', port: 443 } });
  at(v, '2026-10-20T03:25:00Z');
  v.add('reseau_sortie_directe', { detail: { source_nom: 'site', destination: '192.0.2.99', port: 4444 } });
  at(v, '2026-10-20T03:30:00Z');
  v.add('log_integrity_fail', { detail: { seq: 12 } });
  const serveur = v.dossiers().filter(x => x.piste === 'serveur');
  assert.equal(serveur.length, 1, 'sorties et chaîne reliées dans un seul dossier serveur');
  const f = v.fiche(serveur[0].id);
  assert.ok(f.entites.some(e => e.kind === 'ip' && e.key === Z), 'adresse de l’attaque, venue de la corrélation');
  assert.ok(f.signaux.some(s => s.regle === 'sigma.valeurs_impossibles_repetees'), 'tentatives de l’adresse rattachées en arrière');
  assert.equal(f.phase_max, 7);
  assert.equal(f.dissimulation, 1);
  assert.equal(f.gravite, 'critique');
  assert.ok(f.explication.modificateurs.some(m => /plancher : alerte #\d+ critique/.test(m)));
  assert.ok(v.dossiers().some(x => x.piste === 'surveillance'));
});

test('usage ordinaire : un administrateur sur son appareil habituel lit 50 fiches → aucun dossier', t => {
  const v = vigieOf(t);
  historique(v, 'admin-1', 20, Date.parse('2026-10-20T09:00:00Z'));
  at(v, '2026-10-20T09:00:00Z');
  connexion(v, 'admin-1', { ip: '198.51.100.10', session: 's-adm' });
  for (let i = 1; i <= 50; i++) { lecture(v, 'admin-1', i, { ip: '198.51.100.10', session: 's-adm' }); v.clock.t += 30e3; }
  v.add('sensitive_export', { sub: 'admin-1', ip: '198.51.100.10', session: 's-adm', detail: { cible: '/admin/personnes/:id/export.zip', objet: 'personne', id: 3 } });
  assert.equal(v.dossiers().length, 0);
});

test('rattachement et fusion : deux dossiers reliés par une session commune fusionnent dans le plus ancien ; une cible ne relie rien', t => {
  const v = vigieOf(t);
  at(v, '2026-10-20T10:00:00Z');
  v.add('session_use_after_expire', { sub: 'compte-e', ip: '203.0.113.50', session: 's-e', detail: { meme_reseau_et_navigateur: false } });
  v.clock.t += MIN;
  v.add('session_use_after_expire', { sub: 'compte-f', ip: '203.0.113.60', session: 's-f', detail: { meme_reseau_et_navigateur: false } });
  assert.equal(v.dossiers().length, 2);
  // Deux comptes lisent la même fiche : la fiche est une cible, aucun rapprochement.
  lecture(v, 'compte-e', 7, { ip: '203.0.113.50', session: 's-e' });
  lecture(v, 'compte-f', 7, { ip: '203.0.113.60', session: 's-f' });
  assert.equal(v.dossiers().length, 2);
  // Le compte F réutilise la session volée du compte E : lien fort, fusion.
  v.clock.t += MIN;
  lecture(v, 'compte-f', 8, { ip: '203.0.113.60', session: 's-e' });
  const ds = v.dossiers();
  assert.equal(ds.length, 1);
  const f = v.fiche(ds[0].id);
  assert.ok(f.entites.some(e => e.key === 'compte-e') && f.entites.some(e => e.key === 'compte-f'));
  const absorbe = v.db.prepare('SELECT * FROM dossiers WHERE fusionne_dans IS NOT NULL').get();
  assert.equal(absorbe.fusionne_dans, ds[0].id);
  assert.ok(ds[0].id < absorbe.id, 'le plus ancien garde son numéro');
  assert.ok(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_dossier' AND json_extract(detail, '$.action') = 'fusionne'").pluck().get() >= 1);
});

test('adresses : une adresse privée n’entre jamais ; une adresse vue avec un administrateur ne relie pas deux dossiers', t => {
  const v = vigieOf(t);
  v.store.setting.set('controle_roles_admins', { administrateurs: ['admin-1'] });
  at(v, '2026-10-20T10:00:00Z');
  connexion(v, 'admin-1', { ip: '198.51.100.77', session: 's-adm' });
  v.add('session_use_after_expire', { sub: 'compte-g', ip: '198.51.100.77', session: 's-g', detail: { meme_reseau_et_navigateur: false } });
  v.clock.t += MIN;
  v.add('session_use_after_expire', { sub: 'compte-h', ip: '198.51.100.77', session: 's-h', detail: { meme_reseau_et_navigateur: false } });
  assert.equal(v.dossiers().length, 2, 'adresse d’un administrateur : pas de rapprochement par elle');
  v.add('session_use_after_expire', { sub: 'compte-i', ip: '10.0.0.5', session: 's-i', detail: { meme_reseau_et_navigateur: false } });
  const d = v.dossiers().at(-1);
  assert.ok(!v.fiche(d.id).entites.some(e => e.key === '10.0.0.5'), 'adresse privée jamais dans un dossier');
});

test('cycle de vie : sommeil après 72 h sans jalon, clôture après 14 jours, récidive dans les 30 jours (même numéro)', t => {
  const v = vigieOf(t);
  at(v, '2026-10-20T10:00:00Z');
  v.add('session_use_after_expire', { sub: 'compte-j', ip: '203.0.113.70', session: 's-j', detail: { meme_reseau_et_navigateur: false } });
  const [d] = v.dossiers();
  v.clock.t += 73 * H;
  v.engine.tick();
  assert.equal(v.fiche(d.id).statut, 'sommeil');
  v.clock.t += 14 * J;
  v.engine.tick();
  assert.equal(v.fiche(d.id).statut, 'clos');
  v.clock.t += 2 * J;
  v.add('session_use_after_expire', { sub: 'compte-j', ip: '203.0.113.70', session: 's-j2', detail: { meme_reseau_et_navigateur: false } });
  const f = v.fiche(d.id);
  assert.equal(f.statut, 'ouvert');
  assert.equal(f.recidive, 1);
  assert.equal(v.dossiers().filter(x => x.piste === 'identite').length, 1, 'le même dossier, pas un nouveau');
});

test('gestes de l’analyste : prise en charge, détacher (motif), rattacher, fusionner, classer ; tout est chaîné', t => {
  const v = vigieOf(t);
  at(v, '2026-10-20T10:00:00Z');
  v.add('session_use_after_expire', { sub: 'compte-k', ip: '203.0.113.80', session: 's-k', detail: { meme_reseau_et_navigateur: false } });
  v.add('session_use_after_expire', { sub: 'compte-l', ip: '203.0.113.81', session: 's-l', detail: { meme_reseau_et_navigateur: false } });
  const [a, b] = v.dossiers();
  v.D.prendre(a.id, 'console · Analyste (x)');
  assert.equal(v.fiche(a.id).statut, 'en_cours');
  assert.throws(() => v.D.detacher(a.id, 'ip', '203.0.113.80', { par: 'x' }), /motif obligatoire/);
  v.D.detacher(a.id, 'ip', '203.0.113.80', { motif: 'adresse d’un relais', par: 'x' });
  assert.ok(v.fiche(a.id).entites.find(e => e.key === '203.0.113.80').detache_a);
  v.D.rattacher(a.id, 'ip', '192.0.2.9', { par: 'x' });
  assert.equal(v.fiche(a.id).entites.find(e => e.key === '192.0.2.9').force, 'manuel');
  assert.equal(v.D.fusionner(a.id, b.id, { par: 'x' }), a.id);
  assert.equal(v.dossiers().length, 1);
  assert.throws(() => v.D.classer(a.id, { classement: 'peut-etre', par: 'x' }), /classement/);
  v.D.classer(a.id, { classement: 'incident', note: 'cookie volé', par: 'x' });
  const actions = v.db.prepare("SELECT json_extract(detail, '$.action') FROM events WHERE type = 'vigie_dossier'").pluck().all();
  for (const x of ['ouvert', 'prise en charge', 'detache', 'rattache', 'fusionne', 'classe']) assert.ok(actions.includes(x), x);
  assert.equal(v.store.verify().ok, true, 'chaîne intacte');
});

test('purge : signaux projetés gardés 30 jours ; dossier « incident » gardé, ses adresses masquées après la conservation', t => {
  const v = vigieOf(t);
  at(v, '2026-01-10T10:00:00Z');
  v.add('session_use_after_expire', { sub: 'compte-m', ip: '203.0.113.90', session: 's-m', detail: { meme_reseau_et_navigateur: false } });
  v.add('session_use_after_expire', { sub: 'compte-o', ip: '192.0.2.91', session: 's-o', detail: { meme_reseau_et_navigateur: false } });
  v.add('session_use_after_expire', { sub: 'compte-ouvert', ip: '192.0.2.92', session: 's-ouvert', detail: { meme_reseau_et_navigateur: false } });
  const [d, autre, ouvert] = v.dossiers();
  v.D.classer(d.id, { classement: 'incident', note: 'vol de cookie', par: 'x' });
  v.D.classer(autre.id, { classement: 'faux_positif', note: 'essai', par: 'x' });
  v.clock.t += 200 * J;
  v.engine.purge();
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM signaux_projetes').pluck().get(), 0);
  const f = v.fiche(d.id);
  assert.ok(f, 'incident gardé');
  assert.ok(f.entites.some(e => e.kind === 'ip' && e.key === '203.0.113.0/24'));
  assert.ok(!f.entites.some(e => e.key === '203.0.113.90'));
  assert.ok(!f.signaux.some(s => s.ip), 'adresses des signaux effacées');
  assert.equal(v.fiche(autre.id), null, 'le dossier clos ordinaire suit les 183 jours du journal');
  const g = v.fiche(ouvert.id);
  assert.ok(g && g.entites.some(e => e.key === '192.0.2.0/24'), 'tout dossier : adresses masquées après 183 jours');
  v.clock.t += 200 * J;
  v.engine.purge();
  assert.ok(v.fiche(d.id), 'incident gardé au-delà de 13 mois');
  assert.ok(v.fiche(ouvert.id), 'la purge ne ferme ni n’efface un dossier encore ouvert');
});

test('D38 : limite de conservation du journal, dernière activité et dossiers encore suivis', t => {
  for (const retentionDays of [183, 365]) {
    const v = vigieOf(t, { retentionDays }), debut = v.clock.t;
    const ids = {};
    for (const nom of ['automatique', 'test', 'faux_positif', 'legitime', 'incident', 'ouvert', 'sommeil', 'en_cours']) {
      v.add('session_use_after_expire', { sub: nom, detail: { meme_reseau_et_navigateur: false } });
      ids[nom] = v.dossiers().at(-1).id;
    }
    v.clock.t += 100 * J;
    for (const classement of ['test', 'faux_positif', 'legitime', 'incident']) {
      v.D.classer(ids[classement], { classement, note: 'Essai de conservation', par: 'test' });
    }
    v.db.prepare("UPDATE dossiers SET statut = 'clos' WHERE id = ?").run(ids.automatique);
    // La purge doit respecter les statuts ; le passage en sommeil relève de tick(), testé séparément.
    v.db.prepare("UPDATE dossiers SET statut = 'sommeil' WHERE id = ?").run(ids.sommeil);
    v.D.prendre(ids.en_cours, 'test');
    v.clock.t = debut + retentionDays * J;
    v.engine.purge();
    for (const id of Object.values(ids)) assert.ok(v.fiche(id), 'limite exacte incluse');
    v.clock.t++;
    v.engine.purge();
    for (const nom of ['automatique', 'test', 'faux_positif', 'legitime']) {
      assert.equal(v.fiche(ids[nom]), null, `${retentionDays} jours après le signal, pas après le classement`);
    }
    for (const nom of ['incident', 'ouvert', 'sommeil', 'en_cours']) assert.ok(v.fiche(ids[nom]), nom);
    assert.equal(v.store.verify().ok, true, 'le journal chaîné n’est pas altéré');
  }
});

test('D38 : purger un dossier scindé nettoie ses liens et préserve l’autre branche et les alertes', t => {
  const v = vigieOf(t), debut = v.clock.t;
  for (const sub of ['a', 'b']) v.add('session_use_after_expire', { sub, detail: { meme_reseau_et_navigateur: false } });
  const [a, b] = v.dossiers();
  v.clock.t += 100 * J;
  v.D.fusionner(a.id, b.id, { par: 'test' });
  const f = v.fiche(a.id);
  const nouveau = v.D.scinder(a.id, { entites: ['compte:b'], signaux: f.signaux.filter(s => s.sub === 'b').map(s => s.id),
    motif: 'Deux acteurs distincts', par: 'test' });
  v.D.classer(a.id, { classement: 'faux_positif', note: 'Essai', par: 'test' });
  const alertes = v.fiche(a.id).alertes.map(x => x.id), autre = v.fiche(nouveau);
  assert.ok(alertes.length);
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM dossier_separations').pluck().get(), 1);
  v.clock.t = debut + 183 * J + 1;
  v.engine.purge();
  assert.equal(v.fiche(a.id), null);
  assert.equal(v.fiche(b.id).fusionne_dans, null, 'l’ancienne fusion plus récente ne pointe plus vers un dossier effacé');
  assert.deepEqual(v.fiche(nouveau), autre, 'la branche encore ouverte garde ses signaux et entités sans IP');
  for (const table of ['dossier_signaux', 'dossier_entites', 'dossier_signaux_ecartes']) {
    assert.equal(v.db.prepare(`SELECT COUNT(*) FROM ${table} WHERE dossier_id = ?`).pluck().get(a.id), 0);
  }
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM dossier_separations').pluck().get(), 0);
  for (const id of alertes) assert.equal(v.db.prepare('SELECT dossier_id FROM alerts WHERE id = ?').get(id).dossier_id, null);
  assert.deepEqual(v.db.pragma('foreign_key_check'), []);
  assert.equal(v.store.verify().ok, true);
});

test('clés propres : caractères de contrôle d’un compte ou d’un objet retirés avant la ligne de commande', t => {
  const v = vigieOf(t);
  at(v, '2026-10-20T10:00:00Z');
  v.add('session_use_after_expire', { sub: 'compte\u001b[31m-p', ip: '203.0.113.96', session: 's-p', detail: { meme_reseau_et_navigateur: false } });
  const [d] = v.dossiers();
  const f = v.fiche(d.id);
  assert.ok(f.entites.every(e => !/[\u0000-\u001f]/.test(e.key)));
  assert.ok(f.entites.some(e => e.key === 'compte?[31m-p'));
  assert.ok(!/\u001b/.test(d.explication));
});

test('ligne de commande : dossiers, fiche, gestes (motif exigé), erreurs dites', async t => {
  const { run: cli, keys } = await import('../vigie/cli.js');
  const { loadVigieConfig } = await import('../vigie/config.js');
  const dir = tmp(t);
  const k = keys();
  const config = loadVigieConfig({ VIGIE_DATA_DIR: dir, VIGIE_SITE_BACKUP_DIR: dir, ...k.vigie });
  {
    const db = openVigieDb(config.databasePath);
    const store = createStore({ db, logKey: config.logKey });
    const engine = createEngine({ store, decisions: createDecisions({ store, privateKey: config.decisionsKey }), switches: createSwitches({ store }) });
    store.onAdded(rows => engine.process(rows));
    store.add([{ id: crypto.randomUUID(), recu_a: Date.now(), survenu_a: Date.now(), type: 'session_use_after_expire', severity: 'haut', canal: 'x', confiance: 'rapporté',
      composant: 'site · connexion', sub: 'compte-n', ip: '203.0.113.95', session: 's-n', detail: JSON.stringify({ meme_reseau_et_navigateur: false }) }]);
    db.close();
  }
  assert.match(cli(['dossiers'], { config, user: 'root' }), /^#1 {2}haut {5}ouvert {3}identite {5}phase 3 \(1 dans l’ordre\) {2}confiance forte {2}enjeu ordinaire {2}Compte compte-n : accès/);
  const fiche = cli(['dossier', '1'], { config, user: 'root' });
  assert.match(fiche, /^Dossier #1 : Compte compte-n/);
  assert.match(fiche, /Confiance forte : preuve : cookie rejoue/);
  assert.match(fiche, /acteur {3}ip {7}203\.0\.113\.95 {2}\(moyen\)/);
  assert.match(fiche, /alerte #1/);
  assert.throws(() => cli(['dossier', '1', 'detacher', 'ip:203.0.113.95'], { config, user: 'root' }), /motif obligatoire/);
  assert.match(cli(['dossier', '1', 'detacher', 'ip:203.0.113.95', '--motif', 'relais'], { config, user: 'root' }), /détaché/);
  assert.throws(() => cli(['dossier', '1', 'classer', 'peut-etre'], { config, user: 'root' }), /classement/);
  assert.match(cli(['dossier', '1', 'classer', 'test', '--note', 'essai'], { config, user: 'root' }), /clos \(test\)/);
  assert.equal(cli(['dossiers'], { config, user: 'root' }), 'Aucun dossier.');
  assert.match(cli(['dossiers', '--tous'], { config, user: 'root' }), /#1 .*clos/);
  assert.equal(cli(['dossier', '99'], { config, user: 'root' }), 'Dossier inconnu.');
});

test('scission : partition explicite, alertes indivisibles, séparation persistante et rattachement rétroactif sans reprise', t => {
  const v = vigieOf(t);
  v.add('session_use_after_expire', { sub: 'compte-e', ip: '203.0.113.50', session: 's-e', detail: { meme_reseau_et_navigateur: false } });
  v.clock.t += MIN;
  v.add('session_use_after_expire', { sub: 'compte-f', ip: '203.0.113.60', session: 's-f', detail: { meme_reseau_et_navigateur: false } });
  const [e, f] = v.dossiers(); v.D.fusionner(e.id, f.id, { par: 'test' });
  const d = v.fiche(e.id), signaux = d.signaux.filter(s => s.sub === 'compte-f').map(s => s.id);
  const entites = ['compte:compte-f', 'session:s-f', 'ip:203.0.113.60'];
  assert.throws(() => v.D.scinder(e.id, { entites, signaux, par: 'test' }), /motif obligatoire/);
  const nouveau = v.D.scinder(e.id, { entites, signaux, par: 'test', motif: 'Deux attaques distinctes' });
  assert.equal(v.dossiers().length, 2);
  assert.ok(v.fiche(nouveau).alertes.length);
  assert.ok(v.fiche(nouveau).alertes.every(a => !v.fiche(e.id).alertes.some(b => b.id === a.id)));
  assert.ok(v.fiche(e.id).entites.find(x => x.kind === 'compte' && x.key === 'compte-f').detache_a);
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM dossier_separations').pluck().get(), 1);
  v.D.rattacher(e.id, 'compte', 'compte-e', { par: 'test' });
  assert.ok(v.fiche(e.id).signaux.every(s => !signaux.includes(s.id)), 'le rattachement rétroactif ne reprend pas les signaux déplacés');
  // Nouvelle instance du moteur, sur le même stockage : la séparation ne dépend pas d'un cache en mémoire.
  const now = () => v.clock.t, store = createStore({ db: v.db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const moteur = createEngine({ store, decisions, switches: createSwitches({ store, now }), now });
  store.onAdded(rows => moteur.process(rows));
  v.clock.t += MIN;
  store.add([{ id: crypto.randomUUID(), type: 'sensitive_read', severity: 'info', composant: 'site · admin', canal: 'ingestion signée', confiance: 'rapporté',
    recu_a: now(), survenu_a: now(), sub: 'compte-f', session: 's-f', ip: '203.0.113.50', detail: JSON.stringify({ objet: 'personne', id: 44 }) }]);
  assert.equal(v.dossiers().length, 2, 'le compte F et l’ancienne adresse de E ne refusionnent pas les dossiers');
  assert.ok(v.fiche(nouveau).signaux.some(s => s.objet === 'personne:44'));
  assert.ok(!v.fiche(e.id).signaux.some(s => s.objet === 'personne:44'));
  // La fenêtre temporelle serveur ne doit pas réunir une paire séparée quand le compte désigne l'autre branche.
  v.db.prepare("UPDATE dossiers SET piste = 'serveur' WHERE id = ?").run(e.id);
  moteur.dossiers.surSignal({ regle: 'essai.sortie', entite: { kind: 'site', key: 'sortie' }, gravite: 'haut',
    projection: { nature: 'jalon', n: 7, marqueurs: [] } }, { seq: 999999, survenu_a: now(), sub: 'compte-f' });
  assert.equal(v.dossiers().length, 2);
  assert.ok(v.fiche(nouveau).signaux.some(s => s.regle === 'essai.sortie'));
  assert.equal(store.verify().ok, true);
  const garde = moteur.dossiers.fusionner(nouveau, e.id, { par: 'test' });
  assert.equal(garde, e.id); assert.equal(v.dossiers().length, 1);
  assert.ok(v.fiche(garde).entites.some(x => x.key === 'compte-f' && !x.detache_a));
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM dossier_signaux_ecartes WHERE dossier_id = ?').pluck().get(garde), 0, 'les signaux réunis ne restent plus exclus de leur propre dossier');
});

test('scission : une sélection fausse et une panne pendant le transfert ne laissent aucune écriture partielle', t => {
  const v = vigieOf(t);
  v.add('session_use_after_expire', { sub: 'a', ip: '203.0.113.1', detail: { meme_reseau_et_navigateur: false } });
  v.add('session_use_after_expire', { sub: 'b', ip: '203.0.113.2', detail: { meme_reseau_et_navigateur: false } });
  const [a,b] = v.dossiers(); v.D.fusionner(a.id, b.id, { par: 'test' });
  const avant = v.fiche(a.id), chaine = v.store.head();
  assert.throws(() => v.D.scinder(a.id, { entites: ['compte:absent'], signaux: [avant.signaux[0].id], motif: 'essai', par: 'test' }), /entités actives/);
  v.db.exec("CREATE TRIGGER panne_scission BEFORE INSERT ON dossier_separations BEGIN SELECT RAISE(ABORT, 'panne simulée'); END");
  assert.throws(() => v.D.scinder(a.id, { entites: ['compte:b','ip:203.0.113.2'], signaux: avant.signaux.filter(s => s.sub === 'b').map(s => s.id), motif: 'essai', par: 'test' }), /panne simulée/);
  assert.deepEqual(v.fiche(a.id), avant); assert.deepEqual(v.store.head(), chaine); assert.equal(v.dossiers().length, 1);
  assert.equal(v.store.verify().ok, true);
});

test('scissions successives : les séparations suivent une nouvelle branche puis une fusion avec un tiers', t => {
  const v = vigieOf(t);
  for (const [sub, ip] of [['a','203.0.113.1'],['b','203.0.113.2'],['c','203.0.113.3']]) {
    v.add('session_use_after_expire', { sub, ip, detail: { meme_reseau_et_navigateur: false } });
    v.clock.t += MIN;
  }
  const [a,b,c] = v.dossiers();
  v.D.fusionner(a.id, b.id, { par: 'test' }); v.D.fusionner(a.id, c.id, { par: 'test' });
  const separer = (sub, ip) => v.D.scinder(a.id, { entites: [`compte:${sub}`, `ip:${ip}`],
    signaux: v.fiche(a.id).signaux.filter(s => s.sub === sub).map(s => s.id), motif: 'Acteurs distincts', par: 'test' });
  const nc = separer('c', '203.0.113.3'), nb = separer('b', '203.0.113.2');
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM dossier_separations').pluck().get(), 3);
  assert.ok(v.fiche(nb).entites.some(e => e.key === 'c' && e.detache_a), 'détachement antérieur transmis');
  v.D.rattacher(nb, 'compte', 'b', { par: 'test' });
  assert.ok(v.fiche(nb).signaux.every(s => s.sub !== 'c'), 'pas de reprise des signaux de la première scission');
  v.add('sensitive_read', { sub: 'b', ip: '203.0.113.3', detail: { objet: 'personne', id: 51 } });
  assert.equal(v.dossiers().length, 3);
  assert.ok(v.fiche(nb).signaux.some(s => s.objet === 'personne:51'));
  v.add('session_use_after_expire', { sub: 'd', ip: '203.0.113.4', detail: { meme_reseau_et_navigateur: false } });
  const nd = v.dossiers().find(d => d.graine_key === 'd').id;
  v.D.fusionner(nd, nb, { par: 'test' });
  assert.ok(v.db.prepare('SELECT 1 FROM dossier_separations WHERE gauche = ? AND droite = ?').get(nc, nb));
  v.add('sensitive_read', { sub: 'd', ip: '203.0.113.3', detail: { objet: 'personne', id: 52 } });
  assert.equal(v.dossiers().length, 3);
  assert.ok(v.fiche(nb).signaux.some(s => s.objet === 'personne:52'));
  assert.equal(v.store.verify().ok, true);
});

// Régression de la revue D1 : seq=null ne désigne pas toutes les occurrences d’une même règle.
test('scission : les anciens signaux périodiques restent écartés, les occurrences futures entrent dans chaque branche', t => {
  const v = vigieOf(t), D = v.D, debut = v.clock.t;
  const reseaux = ['198.51.100.0', '203.0.113.0'];
  const ids = reseaux.map(key => {
    const id = Number(v.db.prepare("INSERT INTO dossiers (piste,graine_kind,graine_key,ouvert_a,derniere) VALUES ('externe','reseau',?,?,?)").run(key, debut, debut).lastInsertRowid);
    v.db.prepare("INSERT INTO dossier_entites (dossier_id,kind,key,role,force,ajoute_a) VALUES (?,'reseau',?,'acteur','graine',?)").run(id, key, debut);
    return id;
  });
  for (let i = 12; i >= 1; i--) {
    v.clock.t = debut - i * 3600e3;
    v.store.add(reseaux.map((ip_net) => ({ id: crypto.randomUUID(), type: 'input_validation_fail', severity: 'bas',
      recu_a: v.clock.t, survenu_a: v.clock.t, composant: 'site', canal: 'ingestion signée', confiance: 'rapporté', ip_net })));
  }
  v.clock.t = debut;
  v.engine.tick();
  const regle = 'detecteur.exploration_lente';
  const projetes = () => v.db.prepare('SELECT * FROM signaux_projetes WHERE regle = ? ORDER BY id').all(regle);
  assert.equal(projetes().length, 2);
  assert.ok(projetes().every(s => s.seq == null));
  const garde = D.fusionner(...ids, { par: 'essai' });
  const selection = D.fiche(garde).signaux.filter(s => s.entite_key === reseaux[1]).map(s => s.id);
  const nouveau = D.scinder(garde, { entites: ['reseau:' + reseaux[1]], signaux: selection, motif: 'Réseaux indépendants', par: 'essai' });
  const n = id => v.db.prepare('SELECT COUNT(*) FROM dossier_signaux WHERE dossier_id = ? AND regle = ?').pluck().get(id, regle);
  const avant = [n(garde), n(nouveau)];
  v.clock.t += 864e5;
  v.engine.tick();
  assert.equal(projetes().length, 4, 'deux nouvelles explorations sont bien détectées et projetées');
  assert.deepEqual([n(garde), n(nouveau)], avant.map(n => n + 1), 'chaque nouvelle occurrence rejoint son dossier');
  // Le rattachement manuel peut revoir l’ancien réseau, mais pas reprendre son occurrence déplacée.
  D.rattacher(garde, 'reseau', reseaux[1], { par: 'essai' });
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM dossier_signaux WHERE dossier_id = ? AND regle = ? AND entite_key = ? AND survenu_a = ?').pluck().get(garde, regle, reseaux[1], debut), 0);
  const reunis = D.fusionner(garde, nouveau, { par: 'essai' });
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM dossier_signaux_ecartes WHERE dossier_id = ?').pluck().get(reunis), 0, 'les exclusions précises disparaissent quand leur signal est réuni');
  assert.equal(v.store.verify().ok, true);
});

test('scission : panne au second événement de journal, rollback complet puis reprise avec chaîne intacte', t => {
  const v = vigieOf(t);
  for (const sub of ['a', 'b']) {
    v.add('session_use_after_expire', { sub, session: `session-${sub}`, detail: { meme_reseau_et_navigateur: false } });
    v.clock.t += MIN;
  }
  const [a, b] = v.dossiers();
  v.D.fusionner(a.id, b.id, { par: 'essai' });
  const signaux = v.fiche(a.id).signaux.filter(s => s.sub === 'b').map(s => s.id);
  const choix = { entites: ['compte:b', 'session:session-b'], signaux, motif: 'Deux acteurs', par: 'essai' };
  const tables = ['dossiers', 'dossier_entites', 'dossier_signaux', 'alerts', 'dossier_separations', 'dossier_signaux_ecartes', 'events', 'daily'];
  const etat = () => tables.map(table => v.db.prepare(`SELECT * FROM ${table}`).all());
  const avant = etat(), prochain = v.db.prepare('SELECT MAX(id) + 1 FROM dossiers').pluck().get();
  // Le premier événement « scinde » est déjà écrit quand le second échoue.
  v.db.exec(`CREATE TRIGGER panne_second_journal BEFORE INSERT ON events
    WHEN NEW.type = 'vigie_dossier' AND json_extract(NEW.detail, '$.action') = 'scinde'
      AND json_extract(NEW.detail, '$.id') = ${prochain}
    BEGIN SELECT RAISE(ABORT, 'panne du second journal'); END`);
  assert.throws(() => v.D.scinder(a.id, choix), /panne du second journal/);
  assert.deepEqual(etat(), avant);
  assert.equal(v.store.verify().ok, true);
  v.db.exec('DROP TRIGGER panne_second_journal');
  assert.equal(v.D.scinder(a.id, choix), prochain);
  assert.equal(v.store.verify().ok, true);
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_dossier' AND json_extract(detail, '$.action') = 'scinde'").pluck().get(), 2);
});


test('LEG-V3 : les adresses périmées disparaissent de la graine, du titre et des textes, sans recalcul', t => {
  for (const [ip, reseau] of [['203.0.113.90', '203.0.113.0/24'], ['2001:db8::bad:5', '2001:db8::/48'],
    ['2001:0DB8:0001:0002:0000:0000:0000:0009', '2001:db8:1::/48'], ['2001:db8:1:2:3:4:5:6', '2001:db8:1::/48'], ['::ffff:203.0.113.90', '203.0.113.0/24'],
    ['::ffff:cb00:715a', '203.0.113.0/24'], ['::192.0.2.67', '::/48'], ['200:db8:4:1c::5e', '200:db8:4::/48'],
    ['a:2:3:4::5', 'a:2:3::/48']]) {
    const v = vigieOf(t);
    v.D.surAlerte({ id: 1, regle: 'sigma.piege', gravite: 'haut', entite: { kind: 'ip', key: ip } }, { survenu_a: v.clock.t, ip });
    const [d] = v.dossiers();
    assert.ok(d, ip);
    v.D.classer(d.id, { classement: 'incident', note: `Constat depuis ${ip}, IP${ip}, abc${ip}`, par: `Opérateur depuis ${ip}` });
    const avant = v.fiche(d.id), journal = v.db.prepare('SELECT * FROM events').all();
    v.clock.t += 184 * J;
    v.D.purge();
    const apres = v.fiche(d.id);
    assert.equal(apres.graine_key, reseau, ip);
    assert.ok(apres.entites.some(e => e.kind === 'ip' && e.key === reseau && e.force === 'graine'));
    assert.ok(!JSON.stringify(apres).includes(ip), ip);
    assert.ok(apres.note.includes(`IP${reseau}`), 'le préfixe accolé ne décale pas les bits réseau');
    assert.ok(apres.explication.titre.includes(reseau));
    for (const k of ['gravite', 'confiance', 'phase_max', 'coherence', 'enjeu', 'statut', 'classement', 'derniere', 'dernier_jalon', 'traite_a']) assert.equal(apres[k], avant[k], k);
    assert.deepEqual(v.db.prepare('SELECT * FROM events').all(), journal, 'aucune réécriture ni aggravation dans la chaîne');
    assert.ok(v.store.verify().ok);
    v.D.purge();
    assert.deepEqual(v.fiche(d.id), apres, 'masquage idempotent');
  }
});

test('LEG-V3 : rattraper les anciennes purges et les cibles de confiance, préserver les références et les entités actives', t => {
  const v = vigieOf(t), ip = '203.0.113.90', cible = `vigie:confiance:${ip}`, sub = `compte-${ip}`;
  v.D.surAlerte({ id: 1, regle: 'sigma.surveillance_reduite', gravite: 'haut', entite: { kind: 'vigie', key: `confiance:${ip}` } }, { survenu_a: v.clock.t });
  const [d] = v.dossiers();
  v.D.rattacher(d.id, 'compte', sub, { par: 'équipe' });
  v.db.prepare(`INSERT INTO dossier_entites (dossier_id, kind, key, role, force, via, ajoute_a, detache_a) VALUES (?, 'ip', ?, 'acteur', ?, ?, ?, ?)`).run(d.id, '2001:db8::bad::/48', 'graine', `compte:${sub}`, v.clock.t, null);
  v.db.prepare(`INSERT INTO dossier_entites (dossier_id, kind, key, role, force, ajoute_a, detache_a) VALUES (?, 'ip', ?, 'contexte', 'faible', ?, ?)`).run(d.id, '2001:db8::/48', v.clock.t, v.clock.t);
  v.db.prepare(`INSERT INTO dossier_entites (dossier_id, kind, key, role, force, via, ajoute_a) VALUES (?, 'ip', '198.0.0.0/8', 'acteur', 'fort', ?, ?)`).run(d.id, `cible:${cible}`, v.clock.t);
  v.db.prepare('UPDATE dossier_signaux SET ip = NULL, entite_key = ? WHERE dossier_id = ?').run(cible, d.id);
  v.db.prepare(`INSERT INTO dossier_signaux_ecartes VALUES (?, 0, 'detecteur.reseau', ?, 'reseau', '2001:db8::bad::')`).run(d.id, v.clock.t);
  v.D.classer(d.id, { classement: 'incident', par: 'équipe', note: `Depuis ${ip}` });
  v.clock.t += 184 * J;
  v.D.purge();
  const apres = v.fiche(d.id), cibleMasquee = 'vigie:confiance:203.0.113.0/24';
  assert.equal(apres.graine_key, cibleMasquee);
  assert.ok(apres.entites.some(e => e.kind === 'cible' && e.key === cibleMasquee));
  assert.ok(apres.signaux.every(s => s.entite_key === cibleMasquee));
  const groupe = apres.entites.filter(e => e.key === '2001:db8::/48');
  assert.equal(groupe.length, 1); assert.equal(groupe[0].detache_a, null); assert.equal(groupe[0].force, 'graine');
  assert.equal(groupe[0].role, 'acteur'); assert.equal(groupe[0].via, `compte:${sub}`);
  assert.ok(apres.entites.some(e => e.key === sub), 'un identifiant n’est pas réinterprété en adresse réseau');
  assert.ok(apres.entites.some(e => e.key === '198.0.0.0/8' && e.via === `cible:${cibleMasquee}`));
  assert.equal(v.db.prepare('SELECT entite_key FROM dossier_signaux_ecartes').pluck().get(), '2001:db8::');
  assert.ok(!apres.note.includes(ip));
});

test('LEG-V3 : reprendre les graines et titres seuls, puis avancer au-delà de 1 000 dossiers après redémarrage', t => {
  const v = vigieOf(t), ancien = v.clock.t - 184 * J;
  const inserer = v.db.prepare(`INSERT INTO dossiers (piste, graine_kind, graine_key, statut, classement, ouvert_a, derniere, explication)
    VALUES ('externe', 'ip', '203.0.113.90', 'clos', 'incident', ?, ?, ?)`);
  v.db.transaction(() => { for (let i = 0; i < 1001; i++) inserer.run(ancien, ancien, JSON.stringify({ titre: 'Adresse 203.0.113.90' })); })();
  const recent = Number(inserer.run(v.clock.t, v.clock.t, JSON.stringify({ titre: 'Adresse 203.0.113.90' })).lastInsertRowid);
  v.D.purge();
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM dossiers WHERE graine_key = '203.0.113.0/24'").pluck().get(), 1000);
  const repris = createDossiers({ store: v.store, now: () => v.clock.t });
  repris.purge();
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM dossiers WHERE graine_key = '203.0.113.0/24'").pluck().get(), 1001);
  assert.equal(v.fiche(recent).graine_key, '203.0.113.90', 'le dossier récent reste exploitable');
  v.db.prepare("UPDATE dossiers SET note = 'Ajout depuis 203.0.113.99' WHERE id = 1").run();
  repris.purge();
  assert.equal(v.fiche(1).note, 'Ajout depuis 203.0.113.0/24', 'le parcours revient aux petits identifiants');
});

test('LEG-V3 : les incidents déjà masqués ne retardent pas les nouvelles adresses échues', t => {
  const v = vigieOf(t), ancien = v.clock.t - 395 * J, echu = v.clock.t - 184 * J;
  const inserer = v.db.prepare(`INSERT INTO dossiers (piste, graine_kind, graine_key, statut, classement, ouvert_a, derniere)
    VALUES ('externe', 'ip', ?, 'clos', 'incident', ?, ?)`);
  v.db.transaction(() => { for (let i = 0; i < 3000; i++) inserer.run('203.0.113.0/24', ancien, ancien); })();
  const id = Number(inserer.run('198.51.100.90', echu, echu).lastInsertRowid);
  v.D.purge();
  assert.equal(v.fiche(id).graine_key, '198.51.100.0/24', 'masquée dès la première purge, malgré les anciens incidents');
});

test('LEG-V3 : une purge interrompue ne valide ni un masquage partiel ni son curseur', t => {
  const v = vigieOf(t);
  for (const ip of ['203.0.113.90', '198.51.100.80']) v.D.surAlerte({ id: v.dossiers().length + 1, regle: 'sigma.piege', gravite: 'haut', entite: { kind: 'ip', key: ip } }, { survenu_a: v.clock.t, ip });
  for (const d of v.dossiers()) v.D.classer(d.id, { classement: 'incident', par: 'équipe' });
  const avant = v.dossiers().map(d => v.fiche(d.id));
  v.clock.t += 184 * J;
  v.db.exec(`CREATE TRIGGER refuser_masquage BEFORE UPDATE ON dossiers WHEN OLD.id = 2 BEGIN SELECT RAISE(ABORT, 'interruption synthétique'); END`);
  assert.throws(() => v.D.purge(), /interruption synthétique/);
  assert.deepEqual(v.dossiers().map(d => v.fiche(d.id)), avant);
  assert.equal(v.store.setting.get('dossiers_masquage_curseur', 0), 0);
  v.db.exec('DROP TRIGGER refuser_masquage');
  v.D.purge();
  assert.ok(v.dossiers().every(d => d.graine_key.endsWith('/24')));
});


test('LEG-V3 : fusion et scission après purge ne réintroduisent pas les IP et gardent les références personnelles', t => {
  const v = vigieOf(t);
  for (const [i, ip] of ['203.0.113.90', '198.51.100.80'].entries()) {
    v.D.surAlerte({ id: i + 1, regle: 'sigma.piege', gravite: 'haut', entite: { kind: 'ip', key: ip } }, { survenu_a: v.clock.t, ip });
  }
  v.db.prepare(`UPDATE dossier_signaux SET alerte_id = NULL, sub = 'compte-conserve', session = 'session-conserve',
    objet = 'personne:17', donnees = '{"categorie":["identite"],"objets":1}'`).run();
  v.clock.t += 184 * J;
  v.D.purge();
  const garde = v.D.fusionner(1, 2, { par: 'équipe' });
  const f = v.fiche(garde), pris = f.signaux.filter(s => s.dossier_id === garde).slice(0, 1);
  const autre = v.D.scinder(garde, { entites: ['ip:198.51.100.0/24'], signaux: pris.map(s => s.id), motif: 'deux incidents', par: 'équipe' });
  for (const id of [garde, 2, autre]) {
    const d = v.fiche(id);
    assert.doesNotMatch(JSON.stringify(d), /203\.0\.113\.90|198\.51\.100\.80/);
    for (const signal of d.signaux) {
      assert.equal(signal.sub, 'compte-conserve'); assert.equal(signal.session, 'session-conserve');
      assert.equal(signal.objet, 'personne:17'); assert.deepEqual(JSON.parse(signal.donnees), { categorie: ['identite'], objets: 1 });
    }
    assert.ok(d.entites.some(e => e.kind === d.graine_kind && e.key === d.graine_key));
  }
  assert.ok(v.db.prepare('SELECT 1 FROM dossier_separations WHERE gauche = ? AND droite = ?').get(garde, autre));
  assert.ok(v.store.verify().ok);
});
