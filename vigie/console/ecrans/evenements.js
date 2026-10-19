// Écrans « Événements » (MV-03) et « Entités » (MV-04) de la console de la Vigie, phase D3b : LECTURE SEULE (aucune action,
// aucune écriture, sauf la ligne du journal qui note un export CSV).
//   GET /evenements             le journal filtré (période, gravité, source, type, adresse ou réseau, compte, alerte), 50 lignes
//                               par page, pagination par jeu de clés (?avant=<seq>), jamais OFFSET ;
//   GET /evenements.csv         les mêmes filtres en CSV (droit « exporter », Analyste), 10 000 lignes au plus, cellules
//                               neutralisées pour le tableur, l'export noté au journal (vigie_console_export) ;
//   GET /evenements/:seq        un événement : ses deux heures, son origine, son maillon, ses alertes, son détail échappé ;
//   GET /entites                les entités les plus chaudes (engine.top) et un formulaire pour en ouvrir une ;
//   GET /entites/:kind/:cle     la fiche d'une entité : score par source, seuil, liens, alertes, décisions, derniers événements ;
//                               en D3c, selon le droit, les actions forcées sur l'entité (formulaires POST /decisions, et
//                               « Lever… » des décisions en cours ; vigie/console/ecrans/decisions.js, actionsForcees).
//
// Lectures bornées : la table events peut faire des millions de lignes. Chaque lecture part d'UN index (events_recu,
// events_type, events_sub, events_ip, events_net ; alert_events pour une alerte), dans l'ordre de cet index (heure de
// réception, puis numéro), avec un LIMIT ; les autres filtres s'appliquent aux lignes lues, au plus LECTURE_MAX par page :
// une page qui n'a pas trouvé ses 50 lignes dans cette fenêtre le dit, et « Plus anciens » reprend où la lecture s'est
// arrêtée. Le décompte lit au plus COMPTE_MAX lignes et dit quand il s'arrête.
//
// Données personnelles : un Lecteur ne voit jamais une adresse complète (adresseDetail : /24, /48), ni dans la page, ni dans
// l'adresse d'une page, ni dans un filtre (redirection vers le réseau), ni dans le détail d'un événement (toute adresse d'un
// texte y est tronquée) ; l'extrait d'une saisie suspecte est réservé aux Analystes et aux Administrateurs ; l'agent
// utilisateur complet, aux rôles qui voient les adresses. Tout texte venu du site part échappé (gabarits <%= %>).
import net from 'node:net';
import { ALL, rank } from '../../vocabulaire.js';
import { alertOrder, isPrivate } from '../../moteur.js';
import { HALF_LIFE_MIN, THRESHOLDS } from '../../poids.js';
import { can } from '../droits.js';
import { actionsForcees, lienLever } from './decisions.js';
import { FINE, NBSP, adresseDetail, cibleBlocage, cleReseau, formesReseau, masquer, reseauVue, dateHeure, duree, gravite, guillemets, heure, jour, jusqua, minuitParis, nombre, paris, quand } from '../format.js';
import { CLASSEMENTS, DECISIONS, ENTITES, ENTITES_NOM, MODES, PORTEES, SOURCES, aQuand, lire, periode, pluriel, titreDe, typo, virgule } from '../lexique.js';
import { sansContacts } from '../../util.js';

export const PAGE = 50;                   // lignes par page du journal
export const LECTURE_MAX = 10_000;        // lignes lues au plus pour une page (fenêtre de lecture)
export const COMPTE_MAX = 10_000;         // lignes lues au plus pour le décompte
export const EXPORT_MAX = 10_000;         // lignes d'un export CSV
export const EXPORT_LECTURE = 50_000;     // lignes lues au plus pour un export
const DERNIERS = 10;                      // derniers événements d'une fiche d'entité
const LIENS_MAX = 200;                    // liens lus par sens pour une fiche
const ALERTES_MAX = 20;

// ---------------------------------------------------------------------------------------------------------------------
// Mots

// Libellés lisibles des types (lexique § 3.10 ; le code n'a que les noms d'OWASP, écrits dessous en chasse fixe).
export const LIBELLES = {
  authn_login_success: 'Connexion réussie',
  authn_login_fail: 'Échec de connexion',
  authn_login_pending: 'Connexion en attente de validation',
  authn_login_disabled: 'Connexion d’un compte désactivé',
  authn_local_attempt: 'Connexion de test essayée',
  authn_login_lock: 'Accès privé en pause ou suspendu après des refus',
  session_created: 'Session ouverte',
  session_destroyed: 'Session fermée',
  session_expired: 'Session expirée',
  session_use_after_expire: 'Cookie d’une session fermée réutilisé',
  session_context_change: 'Session présentée dans un autre contexte',
  authz_fail: 'Droit refusé',
  authz_csrf_fail: 'Formulaire refusé (jeton CSRF)',
  authz_blocked: 'Requête refusée par une décision de la Vigie',
  privilege_permissions_changed: 'Droits d’un compte changés',
  config_public_changed: 'Réglage public changé',
  privacy_exposure_changed: 'Données exposées changées',
  user_created: 'Compte créé',
  user_deleted: 'Compte supprimé',
  user_rescued: 'Administrateur rétabli (ADMIN_SUBS)',
  sensitive_read: 'Lecture de données sensibles',
  sensitive_export: 'Export de données sensibles',
  input_validation_fail: 'Saisie refusée',
  malicious_input: 'Saisie malveillante',
  upload_rejected: 'Fichier refusé',
  excess_rate_limit_exceeded: 'Limite de débit dépassée',
  malicious_excess_404: 'Pages introuvables en rafale',
  malicious_honeypot: 'Piège déclenché',
  malicious_excess_events: 'Signaux en rafale depuis un réseau',
  token_guess: 'Jeton ou code faux',
  crypto_decrypt_fail: 'Déchiffrement impossible',
  sys_startup: 'Démarrage du site',
  sys_config_changed: 'Configuration du site changée',
  sys_restore: 'Restauration du site',
  sys_error: 'Erreur du site',
  sys_heartbeat: 'Battement du site',
  sys_state: 'État du site',
  sys_events_dropped: 'Événements perdus par le site',
  edge_signature_invalid: 'En-têtes de la bordure faux',
  zitadel_echec: 'Échec d’authentification chez Zitadel',
  zitadel_connexion: 'Connexion chez Zitadel',
  zitadel_facteur: 'Facteur d’authentification changé chez Zitadel',
  zitadel_droits: 'Droits changés chez Zitadel',
  zitadel_politique: 'Politique changée chez Zitadel',
  vigie_zitadel_trou: 'Journal de Zitadel non lu',
  vigie_zitadel_erreur: 'Lecture de Zitadel en échec',
  vigie_demarrage: 'Démarrage de la Vigie',
  vigie_ingestion_refusee: 'Envoi du site refusé',
  log_integrity_fail: 'Intégrité du journal en défaut',
  vigie_purge: 'Purge du journal',
  vigie_alerte: 'Alerte ouverte ou changée',
  vigie_signal: 'Signal noté par la Vigie',
  vigie_controle_roles: 'Contrôle des rôles',
  vigie_moteur_sature: 'Analyse saturée',
  vigie_regle_lente: 'Règle trop lente',
  bordure_blocage: 'Requêtes bloquées en bordure',
  bordure_erreurs: 'Erreurs en rafale vues en bordure',
  bordure_rafale: 'Rafale de pages vue en bordure',
  bordure_nouvel_operateur: 'Page de l’admin servie depuis un opérateur jamais vu',
  bordure_erreur_worker: 'Erreur du Worker de la bordure',
  bordure_cache_prive: 'Page privée servie par le cache de Cloudflare',
  vigie_bordure_erreur: 'Lecture de la bordure en échec',
  vigie_bordure_silence: 'Bordure silencieuse',
  reseau_sortie_refusee: 'Sortie du site refusée par le mandataire',
  reseau_sortie_directe: 'Sortie directe rejetée par l’hôte',
  reseau_flux_hors_liste: 'Flux entre conteneurs hors liste',
  vigie_reseau_silence: 'Journal réseau muet ou illisible',
  vigie_canal_echec: 'Message non envoyé',
  vigie_surveillance_reduite: 'Surveillance réduite',
  vigie_decision: 'Décision prise ou levée',
  vigie_interrupteur: 'Interrupteur ou réglage changé',
  vigie_console_connexion: 'Connexion à la console',
  vigie_console_sortie: 'Sortie de la console',
  vigie_console_refus: 'Accès à la console refusé',
  vigie_console_arrivee: 'Arrivée dans la console sans attribution',
  vigie_console_droits: 'Droits de la console changés',
  vigie_console_export: 'Export du journal',
};

// Le filtre « Type », par familles (MV-03).
const GROUPES = [
  ['Connexion et sessions', t => /^(authn_|session_)/.test(t)],
  ['Exploration et attaques', t => /^(malicious_|token_guess|input_validation_fail|excess_rate_limit_exceeded|upload_rejected|authz_blocked)/.test(t)],
  ['Comptes et droits', t => /^(privilege_|user_|authz_|config_public|privacy_|sensitive_)/.test(t)],
  ['Système du site', t => /^(sys_|crypto_|edge_)/.test(t)],
  ['Zitadel', t => t.startsWith('zitadel_')],
  ['Bordure Cloudflare', t => t.startsWith('bordure_')],
  ['Réseau', t => t.startsWith('reseau_')],
  ['La Vigie', t => /^(vigie_|log_integrity)/.test(t)],
];
const TYPES_GROUPES = (() => {
  const vus = new Set();
  const item = t => ({ v: t, t: `${LIBELLES[t] || t} (${t})` });
  const out = GROUPES.map(([groupe, test]) => ({ groupe, items: Object.keys(ALL).filter(t => !vus.has(t) && test(t) && vus.add(t)).map(item) }));
  const reste = Object.keys(ALL).filter(t => !vus.has(t));
  if (reste.length) out.push({ groupe: 'Autres', items: reste.map(item) });
  return out.filter(g => g.items.length);
})();

// La routine, masquée par défaut et comptée (lexique § 3.10).
const ROUTINE = { sys_heartbeat: ['battement du site', 'battements du site'], sys_state: ['état du site', 'états du site'],
  vigie_signal: ['signal noté par la Vigie', 'signaux notés par la Vigie'] };

const PERIODES = [
  { v: '1h', t: 'Dernière heure', ms: 3600e3, dans: 'dans la dernière heure' },
  { v: 'aujourdhui', t: 'Aujourd’hui', dans: 'aujourd’hui' },
  { v: '24h', t: '24 dernières heures', ms: 864e5, dans: 'sur 24 heures' },
  { v: '7j', t: '7 derniers jours', ms: 7 * 864e5, dans: 'sur 7 jours' },
  { v: '30j', t: '30 derniers jours', ms: 30 * 864e5, dans: 'sur 30 jours' },
  { v: 'tout', t: 'Tout le journal (6 mois)', ms: null, dans: 'dans le journal' },
];
const GRAVITES_F = [
  { v: 'basse', t: 'Basse et plus', g: 'bas' }, { v: 'moyenne', t: 'Moyenne et plus', g: 'moyen' },
  { v: 'haute', t: 'Haute et plus', g: 'haut' }, { v: 'critique', t: 'Critique', g: 'critique' },
];
const CONTRIBUTIONS = { ...SOURCES, menaces: 'listes de menaces', contexte: 'contexte' };
// Source d'un événement, d'après son composant (vigie/poids.js, sourceOf ; les actions de la ligne de commande et de la
// console sont rangées sous « contrôles de la Vigie », comme MV-03 les montre).
export function sourceDe(composant) {
  const c = String(composant || '');
  if (c.startsWith('site')) return 'site';
  if (c === 'zitadel') return 'zitadel';
  if (c === 'bordure' || c === 'cloudflare') return 'bordure';
  if (c === 'réseau') return 'reseau';
  return 'vigie';
}
// Réseau : journaux lus chaque minute, regroupés par passage (l'heure de la première ligne).
const TARD = { site: 60e3, zitadel: 120e3, bordure: 180e3, reseau: 180e3, vigie: 60e3 };      // écart de réception dit tardif (lexique § 3.13, point 8)

export const KINDS = Object.keys(ENTITES_NOM);
const INTERRUPTEURS = { detection: 'Détection', alertes: 'Alertes', blocages: 'Blocages automatiques' };
// ---------------------------------------------------------------------------------------------------------------------
// Écriture

const deux = n => String(n).padStart(2, '0');
// Détail d'un événement : son JSON, ou le texte tel quel s'il ne se lit pas en JSON (ancien détail écrit en clair).
const lireDetail = s => { try { return s ? JSON.parse(s) : null; } catch { return s ? String(s) : null; } };
const chaine = v => (typeof v === 'string' ? v : '');
// Texte venu de la base, affiché : sans caractère de contrôle ni d'inversion du sens d'écriture (une saisie piégée ne
// retourne pas la ligne à l'écran), borné.
const propre = (v, max = 300) => {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '\ufffd');
  const signes = [...s];
  return signes.length > max ? `${signes.slice(0, max).join('')}…` : s;
};
const secondes = x => ((Math.floor(Number(x) / 1000) % 60) + 60) % 60;
// « 14 h 18 min 05 » : l'heure de Paris à la seconde.
function heureSec(x) {
  const p = paris(x);
  return p ? `${deux(p.heure)}${NBSP}h${NBSP}${deux(p.minute)}${NBSP}min${NBSP}${deux(secondes(x))}` : '—';
}
const memeJour = (a, b) => { const pa = paris(a), pb = paris(b); return Boolean(pa && pb && pa.annee === pb.annee && pa.mois === pb.mois && pa.jour === pb.jour); };
const quandSec = (x, t) => (memeJour(x, t) ? heureSec(x) : `${jour(x)}, ${heureSec(x)}`);
// « 2026-10-17 14:18:05 » à l'heure de Paris (CSV : se trie et se lit dans un tableur).
function isoParis(x) {
  const p = paris(x);
  return p ? `${p.annee}-${deux(p.mois)}-${deux(p.jour)} ${deux(p.heure)}:${deux(p.minute)}:${deux(secondes(x))}` : '';
}
// Écart de réception : « reçu + 1 s », « reçu + 1 min 38 ».
function ecartTexte(ms) {
  const a = Math.abs(Math.round(ms / 1000));
  let txt;
  if (a < 60) txt = `${a}${NBSP}s`;
  else if (a < 3600) { const m = Math.floor(a / 60), s = a % 60; txt = s ? `${m}${NBSP}min${NBSP}${deux(s)}` : `${m}${NBSP}min`; } else txt = duree(a * 1000);
  return `reçu ${ms < 0 ? '−' : '+'}${NBSP}${txt}`;
}
const avantLe = (x, t) => (memeJour(x, t) ? `avant ${heure(x)}` : `avant le ${dateHeure(x)}`);

// ---------------------------------------------------------------------------------------------------------------------
// Adresses : ce qu'un rôle en voit

const voitAdresses = role => can(role || 'viewer', 'adresses_completes');
const voitExtraits = role => can(role || 'viewer', 'exporter');      // « Extrait réservé aux Analystes et aux Administrateurs. »
// Toute adresse IP d'un texte (détail, émetteur, référence), tronquée pour un Lecteur : masquer, de format.js (une seule
// fonction pour toute la console, audit D3-C2), reprise ici pour les essais.
export { masquer };
// Réseau (clé sans suffixe, comme server/ip.js truncateIp : « 198.51.100.0 », « 2001:db8:4:: ») d'une adresse.
function reseauDe(ip) {
  const a = adresseDetail(String(ip).split('/')[0], 'viewer');
  return a.tronquee ? a.texte.split('/')[0] : null;
}
const suffixe = cle => (String(cle).includes(':') ? 48 : 24);
// Une adresse affichée et sa fiche : un Lecteur voit le réseau et va à la fiche du réseau.
function adresseVue(ip, role) {
  const s = String(ip);
  if (voitAdresses(role)) return { texte: propre(s, 60), v6: s.includes(':'), tronquee: false, href: `/entites/ip/${encodeURIComponent(s)}` };
  const a = adresseDetail(s, 'viewer');
  const cle = reseauDe(s);
  return { texte: a.texte, v6: a.v6, tronquee: a.tronquee, href: cle ? `/entites/reseau/${encodeURIComponent(cle)}` : null };
}
function reseauVueDe(cle, role) {
  const s = String(cle);
  // Une clé de réseau qui est en fait une adresse (Zitadel, refus d'ingestion : ip_net = l'adresse) se lit comme une adresse.
  if (net.isIP(s) && reseauDe(s) !== s) return adresseVue(s, role);
  // Une ancienne clé fausse (« 2a01::bad:: », audit D3-C4) se lit et s'ouvre sous sa forme canonique : jamais l'hôte.
  const c = cleReseau(s);
  return { texte: propre(reseauVue(s, role), 60), v6: s.includes(':'), tronquee: false, href: c || voitAdresses(role) ? `/entites/reseau/${encodeURIComponent(c || s)}` : null };
}
// Texte affiché d'une clé d'entité « vigie » ou « site » (« confiance:198.51.100.44 ») : adresses tronquées selon le rôle (D3-C3).
const cleTexte = (cle, role, max = 120) => typo(propre(masquer(cle, role), max));

// Détail d'un événement (JSON venu du site ou de la Vigie), pour un rôle : adresses tronquées pour un Lecteur, extraits de
// saisie retirés sous Analyste ; pour un canal de notification en échec, ni adresse e-mail, ni numéro, ni groupe Signal, quel
// que soit le rôle (anciens événements, écrits avant le masque de vigie/notifications.js : audit D3-C5).
const EXTRAIT_RESERVE = 'réservé aux Analystes et aux Administrateurs';
function detailPour(d, role, type = null) {
  const extraits = voitExtraits(role);
  const contacts = type === 'vigie_canal_echec';
  const walk = (v, profondeur) => {
    if (profondeur > 8) return '…';
    if (Array.isArray(v)) return v.slice(0, 50).map(x => walk(x, profondeur + 1));
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v).slice(0, 60)) o[k] = k === 'extrait' && !extraits ? `(${EXTRAIT_RESERVE})` : walk(x, profondeur + 1);
      return o;
    }
    return typeof v === 'string' ? masquer(contacts ? sansContacts(v) : v, role) : v;
  };
  return walk(d, 0);
}
// Paires « chemin : valeur » d'un détail (fiche d'un événement), 60 au plus.
function aplatir(d, prefixe = '', out = []) {
  if (out.length >= 60) return out;
  if (Array.isArray(d)) { if (!d.length) out.push({ k: prefixe || '(liste)', v: '(vide)' }); d.forEach((x, i) => aplatir(x, `${prefixe}[${i}]`, out)); return out; }
  if (d && typeof d === 'object') { for (const [k, x] of Object.entries(d)) aplatir(x, prefixe ? `${prefixe}.${k}` : k, out); return out; }
  out.push({ k: propre(prefixe || '(valeur)', 32), v: propre(d === null ? 'null' : String(d), 500) });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Un événement, mis en forme pour une liste (journal, fiche d'entité) ou pour sa fiche

function libelleDe(r, d) {
  const o = d && typeof d === 'object' ? d : {};
  if (r.type === 'vigie_alerte') return { ouverte: 'Alerte ouverte', aggravee: 'Alerte aggravée', close: o.ids ? 'Alertes closes sans suite' : 'Alerte close', 'prise en charge': 'Alerte prise en charge' }[o.action] || LIBELLES.vigie_alerte;
  if (r.type === 'vigie_decision') return o.action === 'levée' ? 'Décision levée' : o.action === 'créée' ? 'Décision prise' : LIBELLES.vigie_decision;
  if (r.type === 'vigie_interrupteur') return o.interrupteur ? 'Interrupteur changé' : o.regle ? 'Mode d’une règle changé' : o.seuil ? 'Seuil changé' : o.adresse_confiance ? 'Adresse de confiance changée' : 'Réglage changé';
  return LIBELLES[r.type] || propre(r.type, 80);
}

const motif = (v, role) => `${FINE}: ${guillemets(propre(masquer(v, role), 120))}`;
// Ce qui s'est passé, en morceaux : { t } du texte, { t, href } un lien local, { code } en chasse fixe. Le détail reçu ici est
// déjà passé par detailPour (adresses tronquées pour un Lecteur, extraits retirés).
function detailEnMorceaux(r, d, role, t) {
  if (d == null) return [];
  if (typeof d !== 'object' || Array.isArray(d)) return [{ t: propre(masquer(typeof d === 'string' ? d : JSON.stringify(d), role), 160) }];
  const m = [];
  const txt = s => m.push({ t: s });
  const sep = () => { if (m.length) txt(' · '); };
  switch (r.type) {
    case 'vigie_alerte':
      if (Number.isInteger(d.id)) {
        m.push({ t: `#${d.id}`, href: `/alertes/${d.id}` });
        if (d.gravite) txt(`, ${gravite(d.gravite).mot}`);
        if (d.action === 'aggravee' && d.avant) txt(` (avant${FINE}: ${gravite(d.avant).mot})`);
        if (d.classement) txt(`, ${CLASSEMENTS[d.classement] || propre(d.classement, 40)}`);
        if (d.note) txt(motif(d.note, role));
      } else if (Number.isFinite(d.nombre)) txt(`${nombre(d.nombre)} ${pluriel(d.nombre, 'alerte')} sans activité depuis 7 jours`);
      return m;
    case 'vigie_decision':
      if (Number.isInteger(d.id)) m.push({ t: `#${d.id}`, href: '/decisions' });
      if (d.kind) txt(`${m.length ? `${FINE}: ` : ''}${DECISIONS[d.kind] || propre(d.kind, 40)}`);
      if (d.cible && d.cible !== 'admin') { txt(' '); m.push({ code: propre(masquer(d.cible, role), 80) }); }
      if (d.portee) txt(`, ${PORTEES[d.portee] || propre(d.portee, 20)}`);
      if (Number.isFinite(d.fin)) txt(`, ${jusqua(d.fin, t)}`);
      if (d.action === 'levée' && Number.isFinite(d.nombre)) txt(`${m.length ? ', ' : ''}${nombre(d.nombre)} ${pluriel(d.nombre, 'décision levée', 'décisions levées')}`);
      if (d.motif) txt(motif(d.motif, role));
      return m;
    case 'vigie_interrupteur':
      if (d.interrupteur) txt(`${INTERRUPTEURS[d.interrupteur] || propre(d.interrupteur, 40)}${FINE}: ${d.etat === 'arret' ? `arrêt${Number.isFinite(d.jusqua) ? ` ${jusqua(d.jusqua, t)}` : ''}` : 'marche'}`);
      else if (d.regle) { txt('règle '); m.push({ code: propre(d.regle, 80) }); txt(` en mode ${MODES[d.mode] || propre(d.mode, 20)}${Number.isFinite(d.jusqua) ? ` ${jusqua(d.jusqua, t)}` : ''}`); } else if (d.seuil) txt(`seuil d’une entité « ${ENTITES[d.seuil] || propre(d.seuil, 20)} »${FINE}: ${propre(d.valeur, 20)} points`);
      else if (d.adresse_confiance) { txt('adresse de confiance '); m.push({ code: propre(masquer(d.ip || d.adresse_confiance, role), 80) }); }
      if (d.motif) txt(motif(d.motif, role));
      return m;
    case 'vigie_surveillance_reduite':
      if (d.objet) m.push({ code: propre(masquer(d.objet, role), 80) });
      if (Number.isFinite(d.jusqua)) txt(` ${jusqua(d.jusqua, t)}`);
      if (d.motif) txt(motif(d.motif, role));
      return m;
    case 'vigie_signal':
      if (d.titre) txt(typo(propre(masquer(d.titre, role), 160)));
      else if (d.regle) m.push({ code: propre(d.regle, 80) });
      return m;
    case 'sys_heartbeat':
      if (Number.isFinite(d.attente)) txt(`${nombre(d.attente)} en attente sur le site`);
      return m;
    case 'malicious_input':
      return m;                                    // la saisie a son propre bloc (saisieDe)
    default:
  }
  if (d.asn || d.operateur) txt(`opérateur ${d.asn ? `AS${propre(String(d.asn).replace(/^AS/i, ''), 12)}` : ''}${d.operateur ? `${d.asn ? ' ' : ''}(${propre(d.operateur, 60)})` : ''}`);
  for (const k of ['raison', 'nature', 'piege']) if (typeof d[k] === 'string' && d[k]) { sep(); txt(propre(masquer(d[k], role), 120)); }
  if (Number.isFinite(d.nombre) && d.nombre > 0 && !r.type.startsWith('vigie_')) { sep(); txt(`résumé${FINE}: ${nombre(d.nombre + 1)} fois`); }
  if (!m.length) {
    // Repli : jusqu'à trois valeurs simples, « clé : valeur ».
    const parts = [];
    for (const [k, v] of Object.entries(d)) {
      if (parts.length >= 3) break;
      if (v == null || typeof v === 'object' || k === 'minute' || k === 'tls') continue;
      parts.push(`${propre(k, 40)}${FINE}: ${propre(masquer(String(v), role), 60)}`);
    }
    if (parts.length) txt(parts.join(' · '));
  }
  return m;
}

// Saisie suspecte (malicious_input) : famille, champ, longueur ; l'extrait coupé à 24 signes, la suite dite (pas une ellipse
// muette) ; pour un rôle sous Analyste, l'extrait n'est pas envoyé.
function saisieDe(r, d, role) {
  if (r.type !== 'malicious_input' || !d || typeof d !== 'object') return null;
  const c = Array.isArray(d.constats) ? d.constats.filter(x => x && typeof x === 'object') : [];
  if (!c.length) return null;
  const k = c[0];
  const familles = (Array.isArray(d.familles) && d.familles.length ? d.familles : [k.famille]).filter(Boolean).map(x => propre(x, 30));
  const signes = typeof k.extrait === 'string' ? [...k.extrait] : null;
  const longueur = Number.isFinite(k.longueur) ? k.longueur : signes ? signes.length : null;
  const voit = voitExtraits(role);
  const reste = voit && signes ? Math.max(0, signes.length - 24) : 0;
  const autres = c.length - 1;
  return {
    famille: pluriel(familles.length, 'Famille', 'Familles'), familles: familles.join(', '), champ: k.champ ? propre(k.champ, 60) : '',
    longueur: longueur != null ? `${nombre(longueur)} ${pluriel(longueur, 'signe')}` : '',
    extrait: voit && signes ? propre(signes.slice(0, 24).join(''), 24) : null,
    reste: reste ? `… ${nombre(reste)} ${pluriel(reste, 'signe')} de plus, ${pluriel(reste, 'non affiché', 'non affichés')}` : '',
    reserve: !voit && signes != null,
    autres: autres ? `et ${nombre(autres)} ${pluriel(autres, 'autre constat', 'autres constats')} dans le détail` : '',
  };
}

function ligneEvenement(r, { role, t, noms }) {
  const d = lireDetail(r.detail);
  const dv = d && typeof d === 'object' ? detailPour(d, role, r.type) : d;
  const g = gravite(r.severity);
  const src = sourceDe(r.composant);
  const constatee = r.confiance === 'constaté';
  const minute = src === 'bordure';
  const survenu = Number.isFinite(r.survenu_a) ? r.survenu_a : r.recu_a;
  const ecart = r.canal === 'interne' ? null : r.recu_a - survenu;
  return {
    seq: r.seq,
    href: `/evenements/${r.seq}`,
    heure: { texte: minute ? (memeJour(survenu, t) ? heure(survenu) : dateHeure(survenu)) : quandSec(survenu, t), minute, iso: new Date(survenu).toISOString() },
    ecart: ecart == null ? null : { texte: ecartTexte(ecart), tard: ecart > (TARD[src] || 60e3) || r.retard === 1 },
    grav: { classe: g.classe, mot: g.mot },
    crit: r.severity === 'critique',
    type: { t: libelleDe(r, d), code: propre(r.type, 80) },
    route: r.route ? propre(masquer(r.route, role), 160) : null,
    detail: detailEnMorceaux(r, dv, role, t),
    saisie: saisieDe(r, d, role),
    source: { cle: src, mot: SOURCES[src] },
    conf: { constate: constatee, mot: constatee ? 'constaté' : 'rapporté' },
    emetteur: r.emetteur ? propre(masquer(r.emetteur, role), 120) : null,
    adresse: r.ip ? adresseVue(r.ip, role) : null,
    compte: r.sub ? { texte: propre(r.sub, 200), href: `/entites/compte/${encodeURIComponent(r.sub)}`, nom: noms.get(r.sub) || null } : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Requêtes (préparées une fois par base ; toutes bornées, toutes par un index)

const caches = new WeakMap();
function requetes(db) {
  let q = caches.get(db);
  if (q) return q;
  const stmts = new Map();
  q = {
    prep: (cle, sql) => { if (!stmts.has(cle)) stmts.set(cle, db.prepare(sql)); return stmts.get(cle); },
    seq: db.prepare('SELECT * FROM events WHERE seq = ?'),
    recuDe: db.prepare('SELECT recu_a FROM events WHERE seq = ?').pluck(),
    avant: db.prepare('SELECT seq FROM events WHERE seq < ? ORDER BY seq DESC LIMIT 1').pluck(),
    apres: db.prepare('SELECT seq FROM events WHERE seq > ? ORDER BY seq LIMIT 1').pluck(),
    alertesDe: db.prepare(`SELECT a.id, a.regle, a.cas, a.entite_kind, a.entite_key, a.gravite, a.mode, a.statut, a.classement, a.premiere, a.derniere, a.compteur, a.traite_par, a.traite_a
      FROM alert_events ae JOIN alerts a ON a.id = ae.alert_id WHERE ae.seq = ? LIMIT ${ALERTES_MAX}`),
    alerte: db.prepare('SELECT id FROM alerts WHERE id = ?').pluck(),
    nom: db.prepare('SELECT nom FROM console_droits WHERE sub = ?').pluck(),
    reglage: db.prepare('SELECT value FROM settings WHERE key = ?').pluck(),
    entite: db.prepare('SELECT 1 FROM entities WHERE kind = ? AND key = ?').pluck(),
    liensA: db.prepare(`SELECT b_kind k, b_key cle, derniere FROM entity_links WHERE a_kind = ? AND a_key = ? LIMIT ${LIENS_MAX}`),
    liensB: db.prepare(`SELECT a_kind k, a_key cle, derniere FROM entity_links WHERE b_kind = ? AND b_key = ? LIMIT ${LIENS_MAX}`),
    alertesEntite: db.prepare(`SELECT id, regle, cas, entite_kind, entite_key, gravite, mode, statut, classement, note, premiere, derniere, compteur, traite_par, traite_a
      FROM alerts WHERE entite_kind = ? AND entite_key = ? ORDER BY derniere DESC LIMIT ${ALERTES_MAX}`),
    decisionsCible: db.prepare('SELECT id, kind, cible, portee, motif, par, cree_a, fin, auto FROM decisions WHERE leve_a IS NULL AND fin > ? AND cible = ? LIMIT 20'),
    // Décisions actives (index partiel decisions_actives ; 10 000 au plus, MAX_ACTIVE de vigie/decisions.js), triées ici.
    blocages: db.prepare("SELECT id, kind, cible, portee, motif, par, cree_a, fin, auto FROM decisions WHERE leve_a IS NULL AND fin > ? AND kind = 'bloquer' LIMIT 10000"),
    connexionsAdmin: db.prepare("SELECT sub, recu_a FROM events WHERE ip = ? AND recu_a > ? AND type IN ('authn_login_success', 'session_created') AND sub IS NOT NULL ORDER BY recu_a DESC LIMIT 200"),
    // Derniers événements d'une entité, par l'index qui convient.
    derniersIp: db.prepare(`SELECT * FROM events WHERE ip = ? ORDER BY recu_a DESC, seq DESC LIMIT ${DERNIERS}`),
    derniersNet: db.prepare(`SELECT * FROM events WHERE ip_net = ? ORDER BY recu_a DESC, seq DESC LIMIT ${DERNIERS}`),
    derniersSub: db.prepare(`SELECT * FROM events WHERE sub = ? ORDER BY recu_a DESC, seq DESC LIMIT ${DERNIERS}`),
    // Session : la colonne n'a pas d'index ; on lit les derniers événements de son compte (index du compte) et on garde les siens.
    derniersSubFenetre: db.prepare('SELECT * FROM events WHERE sub = ? ORDER BY recu_a DESC, seq DESC LIMIT 2000'),
  };
  caches.set(db, q);
  return q;
}
const reglage = (q, cle, defaut = null) => { const v = lire(q.reglage.get(cle)); return v ?? defaut; };

// Noms connus des comptes (ceux de la console : console_droits), pour une liste de comptes.
function nomsDe(q, subs) {
  const m = new Map();
  for (const s of new Set(subs)) { if (s) { const n = q.nom.get(s); if (n) m.set(s, propre(n, 60)); } }
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------
// Filtres du journal

// Adresse ou réseau d'un filtre : une adresse (index events_ip) ou un réseau /24, /48 (index events_net). Rien d'autre :
// un autre préfixe ne passe par aucun index.
export function lireAdresse(brut) {
  const s = String(brut).trim();
  const erreur = `adresse ou réseau invalide${FINE}: ${guillemets(propre(s, 60))}. Écrivez une adresse (198.51.100.23) ou un réseau (198.51.100.0/24, 2001:db8:4::/48).`;
  const m = /^([^/\s%]{2,45})(?:\/(\d{1,3}))?$/.exec(s);
  if (!m) return { erreur };
  let a = m[1];
  if (/^::ffff:\d{1,3}(\.\d{1,3}){3}$/i.test(a)) a = a.slice(7);
  const v = net.isIP(a);
  if (!v) return { erreur };
  const plein = v === 4 ? 32 : 128, res = v === 4 ? 24 : 48;
  const prefixe = m[2] == null ? plein : Number(m[2]);
  if (prefixe === plein) return { kind: 'ip', ip: a, texte: a };
  if (prefixe === res) { const cle = reseauDe(a); return cle ? { kind: 'reseau', cle, texte: `${cle}/${res}` } : { erreur }; }
  return { erreur: `réseau ${guillemets(propre(s, 60))} non pris en charge${FINE}: une adresse, un réseau /24 (IPv4) ou /48 (IPv6).` };
}

// Adresse d'une page du journal (filtres gardés).
export function urlJournal(f, extra = {}, base = '/evenements') {
  const p = new URLSearchParams();
  p.set('periode', f.periode || 'aujourdhui');
  for (const k of ['gravite', 'source', 'type', 'adresse', 'compte']) if (f[k]) p.set(k, f[k]);
  if (f.alerte) p.set('alerte', String(f.alerte));
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== '') p.set(k, String(v));
  return `${base}?${p.toString()}`;
}

// Les filtres de la requête, normalisés ; erreurs près du champ (saisie gardée) ; pour un Lecteur, une adresse complète est
// ramenée à son réseau (redirection) : elle n'est jamais acceptée dans l'adresse d'une page.
export function lireFiltres(query, role, t) {
  const qy = query || {};
  const f = { periode: 'aujourdhui', gravite: '', source: '', type: '', adresse: '', compte: '', alerte: null };
  const saisie = { adresse: chaine(qy.adresse).slice(0, 100), compte: chaine(qy.compte).slice(0, 200) };
  const erreurs = {};
  const al = chaine(qy.alerte);
  if (/^\d{1,9}$/.test(al) && Number(al) > 0) f.alerte = Number(al);
  const per = chaine(qy.periode);
  // Le filtre par alerte (lien des fiches) vaut sans période : toute l'alerte.
  if (PERIODES.some(p => p.v === per)) f.periode = per; else if (f.alerte) f.periode = 'tout';
  if (GRAVITES_F.some(g => g.v === chaine(qy.gravite))) f.gravite = qy.gravite;
  if (Object.hasOwn(SOURCES, chaine(qy.source))) f.source = qy.source;
  const ty = chaine(qy.type);
  if (ty === 'tout' || Object.hasOwn(ALL, ty)) f.type = ty;
  let adr = null;
  if (saisie.adresse.trim()) {
    adr = lireAdresse(saisie.adresse);
    if (adr.erreur) { erreurs.adresse = adr.erreur; adr = null; } else f.adresse = adr.texte;
  }
  const cpt = saisie.compte.trim();
  if (cpt) {
    if (/^[^\s\u0000-\u001f\u007f-\u009f]{1,200}$/.test(cpt)) f.compte = cpt;
    else erreurs.compte = `compte invalide${FINE}: un identifiant Zitadel, sans espace (zitadel-…).`;
  }
  let redirection = null;
  if (adr?.kind === 'ip' && !voitAdresses(role)) {
    const cle = reseauDe(adr.ip);
    if (cle) redirection = urlJournal({ ...f, adresse: `${cle}/${suffixe(adr.ip)}` }, Object.fromEntries(['avant', 'p'].map(k => [k, chaine(qy[k])])));
  }
  // Fenêtre de temps (aujourd'hui : depuis minuit à Paris).
  const p = PERIODES.find(x => x.v === f.periode);
  let debut = 0;
  if (p.v === 'aujourdhui') debut = minuitParis(t); else if (p.ms) debut = t - p.ms;
  // Lecture : un seul index, celui du filtre le plus sélectif.
  let driver;
  if (f.alerte) driver = { k: 'alerte', v: f.alerte };
  else if (adr?.kind === 'ip') driver = { k: 'ip', v: adr.ip };
  else if (adr?.kind === 'reseau') driver = { k: 'ip_net', v: adr.cle, formes: formesRecherche(adr.cle) };
  else if (f.compte) driver = { k: 'sub', v: f.compte };
  else if (f.type && f.type !== 'tout') driver = { k: 'type', v: f.type };
  else driver = { k: 'recu' };
  const minRang = f.gravite ? rank(GRAVITES_F.find(g => g.v === f.gravite).g) : null;
  const accepte = (r, { routine = true } = {}) => r.recu_a >= debut && r.recu_a <= t + 60e3
    && (minRang == null || rank(r.severity) >= minRang)
    && (!f.source || sourceDe(r.composant) === f.source)
    && (!f.type || f.type === 'tout' || r.type === f.type)
    && (!routine || f.type !== '' || !Object.hasOwn(ROUTINE, r.type))
    && (adr?.kind !== 'ip' || r.ip === adr.ip)
    && (adr?.kind !== 'reseau' || r.ip_net === adr.cle || cleReseau(r.ip_net) === adr.cle)
    && (!f.compte || r.sub === f.compte);
  return { f, saisie, erreurs, redirection, debut, fin: t, driver, accepte, adr, periode: p };
}

// Requête de lecture d'un index : les lignes les plus récentes d'abord (heure de réception, puis numéro : l'ordre même de
// l'index, sans tri), à partir d'une clé (recu_a, seq), avec un LIMIT. cols : '*' pour une page, quelques colonnes pour un
// décompte.
export function lecture(db, driver, cols = '*') {
  const q = requetes(db);
  if (driver.k === 'alerte') {
    const c = cols === '*' ? 'e.*' : cols.split(',').map(x => `e.${x.trim()}`).join(', ');
    return q.prep(`alerte|${cols}`, `SELECT ${c} FROM alert_events ae JOIN events e ON e.seq = ae.seq WHERE ae.alert_id = ? AND ae.seq < ? ORDER BY ae.seq DESC LIMIT ?`);
  }
  // Réseau IPv6 encore écrit sous une ancienne forme dans le journal (audit D3-C4 ; events n'est jamais réécrit, il est
  // chaîné) : une lecture par écriture, chacune par l'index events_net et bornée par son LIMIT, fusionnées par l'heure.
  const fm = driver.k === 'ip_net' ? driver.formes : null;
  if (fm && (fm.exactes.length > 1 || fm.debut)) {
    const cond = 'recu_a >= ? AND recu_a <= ? AND (recu_a < ? OR (recu_a = ? AND seq < ?)) ORDER BY recu_a DESC, seq DESC LIMIT ?';
    const branches = [...fm.exactes.map(() => 'ip_net = ?'), ...(fm.debut ? ['ip_net >= ? AND ip_net < ?'] : [])]
      .map(w => `SELECT * FROM (SELECT ${cols} FROM events WHERE ${w} AND ${cond})`);
    return q.prep(`ip_net|${fm.exactes.length}|${fm.debut ? 1 : 0}|${cols}`, `${branches.join(' UNION ALL ')} ORDER BY recu_a DESC, seq DESC LIMIT ?`);
  }
  const col = { ip: 'ip', ip_net: 'ip_net', sub: 'sub', type: 'type', recu: null }[driver.k];
  const egal = col ? `${col} = ? AND ` : '';
  return q.prep(`${driver.k}|${cols}`, `SELECT ${cols} FROM events WHERE ${egal}recu_a >= ? AND recu_a <= ? AND (recu_a < ? OR (recu_a = ? AND seq < ?))
    ORDER BY recu_a DESC, seq DESC LIMIT ?`);
}
// Paramètres de la lecture : après la clé (recu_a, seq) de la dernière ligne lue ; sans clé, depuis la fin de la fenêtre.
export function parametres(lf, cle, limite) {
  const { driver, debut, fin } = lf;
  if (driver.k === 'alerte') return [driver.v, cle ? cle.seq : Number.MAX_SAFE_INTEGER, limite];
  const r = cle ? cle.recu_a : Number.MAX_SAFE_INTEGER, s = cle ? cle.seq : Number.MAX_SAFE_INTEGER;
  const reste = [debut, Math.min(fin + 60e3, r), r, r, s, limite];
  const fm = driver.k === 'ip_net' ? driver.formes : null;
  if (fm && (fm.exactes.length > 1 || fm.debut)) {
    return [...fm.exactes.flatMap(x => [x, ...reste]), ...(fm.debut ? [fm.debut, fm.debutFin, ...reste] : []), limite];
  }
  return [...(driver.k === 'recu' ? [] : [driver.v]), ...reste];
}

// Écritures d'un réseau à chercher dans events.ip_net (formesReseau) : les exactes, et les clés qui commencent par « debut »
// (de debut inclus à debutFin exclu : « 2a01:: » à « 2a01:; », par l'index) ; une exacte déjà couverte par ce début est
// retirée (jamais deux fois la même ligne).
function formesRecherche(cle) {
  const { exactes, debut } = formesReseau(cle);
  const ex = exactes.length ? exactes : [cle];
  return { exactes: debut ? ex.filter(x => !x.startsWith(debut)) : ex, debut, debutFin: debut ? `${debut.slice(0, -1)};` : null };
}
// Derniers événements d'un réseau, sous toutes ses écritures (fiche d'une entité).
function derniersReseau(q, cle) {
  const fm = formesRecherche(cle);
  let rows = fm.exactes.flatMap(x => q.derniersNet.all(x));
  if (fm.debut) rows = rows.concat(q.prep('derniersNetDebut', `SELECT * FROM events WHERE ip_net >= ? AND ip_net < ? ORDER BY recu_a DESC, seq DESC LIMIT ${DERNIERS}`).all(fm.debut, fm.debutFin));
  return rows.sort((a, b) => b.recu_a - a.recu_a || b.seq - a.seq).slice(0, DERNIERS);
}

// Décompte borné : au plus COMPTE_MAX lignes lues par l'index ; par gravité, et la routine masquée par type.
function compter(db, lf) {
  const st = lecture(db, lf.driver, 'seq, recu_a, type, severity, composant, ip, ip_net, sub');
  const parGrav = { critique: 0, haut: 0, moyen: 0, bas: 0, info: 0 };
  const routine = {};
  let n = 0, lus = 0;
  for (const r of st.iterate(...parametres(lf, null, COMPTE_MAX))) {
    lus += 1;
    if (lf.accepte(r)) { n += 1; parGrav[r.severity] = (parGrav[r.severity] || 0) + 1; } else if (lf.f.type === '' && Object.hasOwn(ROUTINE, r.type) && lf.accepte(r, { routine: false })) routine[r.type] = (routine[r.type] || 0) + 1;
  }
  return { n, parGrav, routine, complet: lus < COMPTE_MAX };
}

// Une page : jusqu'à PAGE lignes retenues dans une fenêtre de LECTURE_MAX lignes lues, après la clé « avant ».
function page(db, lf, avant) {
  const q = requetes(db);
  let cle = null;
  if (avant) {
    if (lf.driver.k === 'alerte') cle = { seq: avant };
    else { const r = q.recuDe.get(avant); if (r != null) cle = { recu_a: r, seq: avant }; }
  }
  const lignes = [];
  let lus = 0, dernier = null, plein = false;
  for (const r of lecture(db, lf.driver).iterate(...parametres(lf, cle, LECTURE_MAX))) {
    lus += 1; dernier = r;
    if (!lf.accepte(r)) continue;
    if (lignes.length === PAGE) { plein = true; break; }
    lignes.push(r);
  }
  // Suite : après la 50e ligne affichée s'il en reste ; après la dernière ligne lue si la fenêtre est épuisée.
  let suite = null, fenetreEpuisee = false;
  if (plein) suite = lignes.at(-1).seq;
  else if (lus >= LECTURE_MAX && dernier) { suite = dernier.seq; fenetreEpuisee = true; }
  return { lignes, suite, fenetreEpuisee, premiere: !cle };
}

// ---------------------------------------------------------------------------------------------------------------------
// Le journal (MV-03)

function resumeFiltres(lf) {
  const { f, periode } = lf;
  const parts = [periode.t, f.type === '' ? 'sans la routine' : f.type === 'tout' ? 'avec la routine' : LIBELLES[f.type] || f.type];
  if (f.gravite) parts.push(GRAVITES_F.find(g => g.v === f.gravite).t.toLowerCase());
  parts.push(f.source ? SOURCES[f.source] : 'toutes sources');
  if (f.adresse) parts.push(f.adresse);
  if (f.compte) parts.push(f.compte);
  if (f.alerte) parts.push(`alerte #${f.alerte}`);
  return parts.join(' · ');
}

function phraseGravites(pg) {
  const parts = ['critique', 'haut', 'moyen', 'bas', 'info'].filter(g => pg[g]).map(g => {
    const n = pg[g], p = gravite(g).pluriel;
    return `${nombre(n)} ${n > 1 ? p : p.replace(/s$/, '')}`;
  });
  return parts.length ? `Du plus récent au plus ancien${FINE}: ${parts.join(', ')}.` : '';
}

export function journal({ db, query, role, t }) {
  const q = requetes(db);
  const lf = lireFiltres(query, role, t);
  if (lf.redirection) return { redirection: lf.redirection };
  const avant = /^\d{1,15}$/.test(chaine(query?.avant)) ? Number(query.avant) : null;
  const numero = avant && /^\d{1,5}$/.test(chaine(query?.p)) ? Math.max(2, Number(query.p)) : avant ? 2 : 1;
  const { f } = lf;
  // Un filtre refusé : la liste reste celle des autres filtres (la saisie refusée reste dans son champ, avec l'erreur).
  const c = compter(db, lf);
  const p = page(db, lf, avant);
  const noms = nomsDe(q, p.lignes.map(r => r.sub));
  const lignes = p.lignes.map(r => ligneEvenement(r, { role, t, noms }));
  const n = c.n;
  const dans = f.alerte ? `de l’alerte #${f.alerte}` : lf.periode.dans;
  const titre = !n && c.complet ? `Aucun événement ${dans}` : `${c.complet ? '' : 'Au moins '}${nombre(n)} ${pluriel(n, 'événement')} ${dans}`;
  const routineN = Object.values(c.routine).reduce((a, b) => a + b, 0);
  const routine = f.type === '' && routineN ? {
    texte: `${nombre(routineN)} ${pluriel(routineN, 'ligne')} de routine ${pluriel(routineN, 'masquée', 'masquées')}${FINE}: ${Object.entries(c.routine).sort((a, b) => b[1] - a[1]).map(([ty, k]) => `${nombre(k)} ${ROUTINE[ty][k > 1 ? 1 : 0]}`).join(', ')}.`,
    href: urlJournal({ ...f, type: 'tout' }),
  } : null;
  const premier = (numero - 1) * PAGE + 1;
  const pages = lignes.length || p.suite ? {
    texte: lignes.length ? `Page ${nombre(numero)}${c.complet && n && p.premiere ? ` sur ${nombre(Math.max(1, Math.ceil(n / PAGE)))}` : ''} · ${pluriel(lignes.length, 'événement')} ${nombre(premier)} à ${nombre(premier + lignes.length - 1)}${c.complet ? ` sur ${nombre(n)}` : ''}` : `Page ${nombre(numero)}`,
    plusAnciens: p.suite ? urlJournal(f, { avant: p.suite, p: numero + 1 }) : null,
    plusRecents: p.premiere ? null : urlJournal(f),
    fenetre: p.fenetreEpuisee ? `Lecture arrêtée après ${nombre(LECTURE_MAX)} lignes du journal${FINE}: « Plus anciens » reprend la recherche là où elle s’est arrêtée.` : null,
  } : null;
  // Liste vide : la phrase reprend les filtres, puis au plus deux issues.
  let vide = null;
  if (!lignes.length) {
    const qui = [];
    if (f.source) qui.push(f.source === 'zitadel' ? 'de Zitadel' : `de la source « ${SOURCES[f.source]} »`);
    if (f.type && f.type !== 'tout') qui.push(`du type « ${LIBELLES[f.type] || f.type} »`);
    if (f.gravite) qui.push(`de gravité ${GRAVITES_F.find(g => g.v === f.gravite).t.toLowerCase()}`);
    const pour = [];
    if (lf.adr) pour.push({ t: lf.adr.kind === 'ip' ? ' pour l’adresse ' : ' pour le réseau ' }, { ip: { texte: f.adresse, v6: f.adresse.includes(':') } });
    if (f.compte) pour.push({ t: pour.length ? ' et le compte ' : ' pour le compte ' }, { code: f.compte });
    const issues = [];
    if (p.fenetreEpuisee && pages?.plusAnciens) issues.push({ t: 'Continuer la recherche plus loin', href: pages.plusAnciens });
    if (f.source || f.gravite || (f.type && f.type !== 'tout')) issues.push({ t: 'Les mêmes, toutes sources, tous types et toutes gravités', href: urlJournal({ ...f, source: '', gravite: '', type: '' }) });
    if (lf.adr) {
      const v = lf.adr.kind === 'ip' ? adresseVue(lf.adr.ip, role) : reseauVueDe(lf.adr.cle, role);
      if (v.href) issues.push({ t: `Fiche ${lf.adr.kind === 'ip' ? 'de l’adresse' : 'du réseau'} ${v.texte}`, href: v.href });
    } else if (f.compte) issues.push({ t: `Fiche du compte ${f.compte}`, href: `/entites/compte/${encodeURIComponent(f.compte)}` });
    if (!['30j', 'tout'].includes(f.periode) && issues.length < 2) issues.push({ t: 'Les mêmes sur 30 jours', href: urlJournal({ ...f, periode: '30j' }) });
    vide = { phrase: [{ t: `Aucun événement${qui.length ? ` ${qui.join(', ')}` : ''}` }, ...pour, { t: ` ${dans}.` }], issues: issues.slice(0, 2),
      sec: p.fenetreEpuisee ? `Les ${nombre(LECTURE_MAX)} lignes les plus récentes ont été lues sans en trouver une.` : '' };
  }
  const exportable = Math.min(n, EXPORT_MAX);
  return {
    lecteur: !voitAdresses(role),
    maintenant: dateHeure(t),
    filtres: { ...f, adresse: lf.erreurs.adresse ? lf.saisie.adresse : f.adresse, compte: lf.erreurs.compte ? lf.saisie.compte : f.compte },
    erreurs: lf.erreurs,
    nbErreurs: Object.keys(lf.erreurs).length,
    options: { periodes: PERIODES.map(({ v, t: x }) => ({ v, t: x })), gravites: GRAVITES_F.map(({ v, t: x }) => ({ v, t: x })), sources: Object.entries(SOURCES).map(([v, x]) => ({ v, t: x })), types: TYPES_GROUPES },
    resumeFiltres: resumeFiltres(lf),
    alerte: f.alerte ? { id: f.alerte, existe: Boolean(q.alerte.get(f.alerte)), sans: urlJournal({ ...f, alerte: null, periode: f.periode === 'tout' ? 'aujourdhui' : f.periode }) } : null,
    liste: {
      titre, phrase: n ? phraseGravites(c.parGrav) : '', routine, lignes,
      incomplet: c.complet ? '' : `Décompte arrêté aux ${nombre(COMPTE_MAX)} lignes les plus récentes${FINE}; resserrez les filtres pour un compte exact.`,
      caption: `${nombre(lignes.length)} ${pluriel(lignes.length, 'événement')} ${dans}, du plus récent au plus ancien (ordre de réception), à l’heure de leur source`,
    },
    export: can(role, 'exporter') && n ? { href: urlJournal(f, {}, '/evenements.csv'), texte: c.complet && n <= EXPORT_MAX ? `Exporter ${n > 1 ? `les ${nombre(n)}` : 'l’événement'} en CSV` : `Exporter les ${nombre(exportable)} plus récents en CSV` } : null,
    pages,
    vide,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Export CSV (MV-03, lexique § 3.14, point 13)

// Une cellule : toujours entre guillemets, guillemets doublés ; une cellule qui commence par = + - @, une tabulation ou un
// retour chariot est préfixée d'une apostrophe (un tableur ne l'exécute pas comme une formule).
export function celluleCsv(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
const ENTETES_CSV = ['numéro', 'heure à la source (Paris)', 'heure de réception (Paris)', 'type', 'libellé', 'gravité', 'source', 'composant', 'confiance', 'canal',
  'émetteur', 'référence', 'compte', 'session', 'adresse', 'réseau', 'pays', 'ville', 'méthode', 'route', 'statut HTTP', 'navigateur', 'reçu en retard', 'détail'];

// Lu par tranches de EXPORT_TRANCHE lignes (même ordre, reprise après la clé de la dernière ligne lue), mis en forme par
// pas de EXPORT_PAS lignes, en rendant la main entre deux (audit D3-D4 : 50 000 lignes lues et mises en forme d'une traite
// bloquaient la réception et le moteur 0,5 à 0,8 s ; une tranche de 5 000 lignes mise en forme d'une traite, 0,25 s).
export const EXPORT_TRANCHE = 5_000;
const EXPORT_PAS = 500;
export async function exportCsv({ db, query, role, t, tranche = EXPORT_TRANCHE }) {
  const lf = lireFiltres(query, role, t);
  if (Object.keys(lf.erreurs).length || lf.redirection) return { erreur: Object.values(lf.erreurs)[0] || 'filtre invalide' };
  const lignes = [ENTETES_CSV.map(celluleCsv).join(';')];
  let n = 0, lus = 0, tronque = false, cle = null;
  const st = lecture(db, lf.driver);
  const main = () => new Promise(r => setImmediate(r));
  // Heure de Paris : ses composantes sont les mêmes pour toutes les secondes d'une minute (Paris change d'heure à l'heure
  // pile) ; calculées une fois par minute (Intl, le plus coûteux de la mise en forme).
  let minute = null, prefixe = '';
  const iso = x => {
    const m = Math.floor(x / 60e3);
    if (m !== minute) { minute = m; const s = isoParis(m * 60e3); prefixe = s ? s.slice(0, -2) : null; }
    return prefixe == null ? '' : `${prefixe}${deux(secondes(x))}`;      // instant hors des dates possibles : vide, comme isoParis
  };
  tranches: for (;;) {
    const limite = Math.min(tranche, EXPORT_LECTURE - lus);
    const rows = st.all(...parametres(lf, cle, limite));
    for (let i = 0; i < rows.length; i++) {
      if (i && i % EXPORT_PAS === 0) await main();
      const r = rows[i];
      lus += 1;
      if (!lf.accepte(r)) continue;
      if (n === EXPORT_MAX) { tronque = true; break tranches; }
      n += 1;
      lignes.push([r.seq, iso(Number.isFinite(r.survenu_a) ? r.survenu_a : r.recu_a), iso(r.recu_a), r.type, libelleDe(r, lireDetail(r.detail)), gravite(r.severity).mot,
        SOURCES[sourceDe(r.composant)], r.composant, r.confiance, r.canal, r.emetteur, r.reference, r.sub, r.session, r.ip, r.ip_net, r.country, r.city, r.method, r.route,
        r.status, r.ua_family, r.retard ? 'oui' : 'non', r.detail].map(celluleCsv).join(';'));
    }
    if (rows.length < limite || lus >= EXPORT_LECTURE) break;
    const d = rows.at(-1);
    cle = lf.driver.k === 'alerte' ? { seq: d.seq } : { recu_a: d.recu_a, seq: d.seq };
    await main();
  }
  if (lus >= EXPORT_LECTURE) tronque = true;
  // Ce qui est noté au journal : les filtres, sans adresse complète (le réseau suffit à dire ce qui est sorti).
  const filtres = { periode: lf.f.periode };
  for (const k of ['gravite', 'source', 'type', 'compte']) if (lf.f[k]) filtres[k] = lf.f[k];
  if (lf.f.alerte) filtres.alerte = lf.f.alerte;
  if (lf.adr) filtres.adresse = lf.adr.kind === 'ip' ? `${reseauDe(lf.adr.ip)}/${suffixe(lf.adr.ip)}` : lf.adr.texte;
  const p = paris(t);
  // UTF-8 avec BOM, séparateur « ; », fin de ligne CRLF : ce qu'un tableur réglé en français ouvre sans question.
  return { csv: `\ufeff${lignes.join('\r\n')}\r\n`, n, tronque, filtres,
    nomFichier: `vigie-evenements-${p.annee}${deux(p.mois)}${deux(p.jour)}-${deux(p.heure)}${deux(p.minute)}.csv` };
}

// ---------------------------------------------------------------------------------------------------------------------
// Alertes d'une entité ou d'un événement (lignes « .vg-lignes »)

function entiteCourte(kind, key, role) {
  if (kind === 'ip') { const a = adresseVue(key, role); return { k: ENTITES.ip, texte: a.texte, mono: 'ip', v6: a.v6, tronquee: a.tronquee }; }
  if (kind === 'reseau') { const a = reseauVueDe(key, role); return { k: ENTITES.reseau, texte: a.texte, mono: 'ip', v6: a.v6, tronquee: a.tronquee }; }
  if (kind === 'site' || kind === 'vigie') return { k: ENTITES[kind], texte: cleTexte(key, role, 80), mono: null, tronquee: false };
  return { k: ENTITES[kind] || propre(kind, 20), texte: propre(key, 200), mono: 'sub', tronquee: false };
}
function ligneAlerte(a, { t, role, titres, avecEntite = false }) {
  const g = gravite(a.gravite);
  const statut = a.statut === 'close' ? { k: 'abouti', mot: 'Close' } : a.statut === 'en_cours' ? { k: 'encours', mot: 'Prise en charge' } : { k: 'afaire', mot: 'Ouverte' };
  const sec = [];
  if (a.statut === 'close' && a.classement) sec.push(`${CLASSEMENTS[a.classement] || propre(a.classement, 30)}${a.traite_par ? `, par ${propre(masquer(a.traite_par, role), 60)}` : ''}${a.traite_a ? ` ${aQuand(a.traite_a, t)}` : ''}`);
  else if (a.statut === 'en_cours' && a.traite_par) sec.push(`par ${propre(masquer(a.traite_par, role), 60)}${a.traite_a ? ` ${aQuand(a.traite_a, t)}` : ''}`);
  sec.push(`mode ${MODES[a.mode] || propre(a.mode, 20)}`);
  sec.push(`${nombre(a.compteur)} ${pluriel(a.compteur, 'occurrence')}, ${a.compteur > 1 ? periode(a.premiere, a.derniere, t) : aQuand(a.derniere, t)}`);
  return {
    id: a.id, href: `/alertes/${a.id}`, titre: titreDe(a.regle, titres), cas: a.cas === 'quorum' ? 'score' : a.cas ? `cas ${propre(a.cas, 20)}` : '',
    grav: { classe: g.classe, mot: g.mot }, statut, sec: sec.join(' · '),
    entite: avecEntite ? entiteCourte(a.entite_kind, a.entite_key, role) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Un événement

export function evenement({ db, seq, role, t, engine }) {
  const q = requetes(db);
  const r = q.seq.get(seq);
  if (!r) return null;
  const d = lireDetail(r.detail);
  const l = ligneEvenement(r, { role, t, noms: nomsDe(q, [r.sub]) });
  const survenu = Number.isFinite(r.survenu_a) ? r.survenu_a : r.recu_a;
  const titres = new Map((engine?.rules?.() || []).map(x => [x.id, x.titre]));
  const alertes = q.alertesDe.all(seq).sort(alertOrder).map(a => ligneAlerte(a, { t, role, titres, avecEntite: true }));
  const ref = /^events#(\d{1,15})$/.exec(r.reference || '');
  const dv = d == null ? null : typeof d === 'object' ? detailPour(d, role, r.type) : masquer(String(d), role);
  return {
    ...l,
    lecteur: !voitAdresses(role),
    deuxHeures: {
      source: l.heure.minute ? `${dateHeure(survenu)}, à la minute` : `${jour(survenu)}, ${heureSec(survenu)}`,
      recu: `${jour(r.recu_a)}, ${heureSec(r.recu_a)}`,
      retard: r.retard === 1,
    },
    origine: {
      composant: propre(r.composant, 60), canal: propre(r.canal, 60),
      reference: r.reference ? propre(masquer(r.reference, role), 120) : null, referenceHref: ref ? `/evenements/${ref[1]}` : null,
    },
    qui: {
      reseau: r.ip_net ? reseauVueDe(r.ip_net, role) : null,
      session: r.session ? { texte: propre(r.session, 80), href: `/entites/session/${encodeURIComponent(r.session)}` } : null,
      lieu: [r.city, r.country].filter(Boolean).map(x => propre(x, 60)).join(', '),
      navigateur: r.ua_family ? propre(r.ua_family, 80) : null,
      agent: voitAdresses(role) && r.ua ? propre(r.ua, 300) : null,
      requete: [r.method, r.status].filter(x => x != null && x !== '').map(x => propre(x, 10)).join(' · '),
    },
    chaine: { maillon: propre(r.chain, 80), avant: q.avant.get(seq) ?? null, apres: q.apres.get(seq) ?? null },
    alertes,
    detailKv: dv && typeof dv === 'object' ? aplatir(dv) : dv != null ? [{ k: '(texte)', v: propre(dv, 500) }] : [],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Entités (MV-04)

export function top({ engine, role, t }) {
  const seuils = engine?.thresholds?.() || THRESHOLDS;
  const lignes = (engine?.top?.(50) || []).map(e => {
    const seuil = seuils[e.kind] ?? null;
    const ent = entiteCourte(e.kind, e.key, role);
    const href = e.kind === 'ip' ? adresseVue(e.key, role).href : e.kind === 'reseau' ? reseauVueDe(e.key, role).href : `/entites/${e.kind}/${encodeURIComponent(e.key)}`;
    return {
      ent, href, score: virgule(e.score), seuil: seuil != null ? nombre(seuil) : null, auDessus: seuil != null && e.score >= seuil,
      sources: (e.sources || []).filter(s => Object.hasOwn(SOURCES, s)).map(s => ({ cle: s, mot: SOURCES[s] })),
      derniere: quand(e.derniere, t),
    };
  });
  return { lecteur: !voitAdresses(role), maintenant: dateHeure(t), lignes, kinds: [['ip', 'Adresse'], ['reseau', 'Réseau'], ['compte', 'Compte'], ['session', 'Session']].map(([v, x]) => ({ v, t: x })) };
}

// Ouvrir une entité depuis le formulaire de /entites : l'adresse de sa fiche, ou une erreur (saisie gardée).
export function chercherEntite(query, role) {
  const kind = chaine(query?.type), cle = chaine(query?.cle).trim().slice(0, 200);
  if (!kind && !cle) return null;
  if (!['ip', 'reseau', 'compte', 'session'].includes(kind)) return { erreur: 'Choisissez le type de l’entité.', kind: '', cle };
  if (!cle || /[\s\u0000-\u001f\u007f-\u009f]/.test(cle)) return { erreur: 'Écrivez la clé de l’entité, sans espace.', kind, cle };
  if (kind === 'ip' || kind === 'reseau') {
    const a = lireAdresse(kind === 'reseau' && !cle.includes('/') ? `${cle}/${suffixe(cle)}` : cle);
    if (a.erreur) return { erreur: a.erreur, kind, cle };
    if (a.kind === 'reseau') return { href: `/entites/reseau/${encodeURIComponent(a.cle)}` };
    return { href: voitAdresses(role) ? `/entites/ip/${encodeURIComponent(a.ip)}` : `/entites/reseau/${encodeURIComponent(reseauDe(a.ip))}` };
  }
  return { href: `/entites/${kind}/${encodeURIComponent(cle)}` };
}

// Réponse automatique d'une adresse (le moteur ne bloque que des adresses, vigie/moteur.js, respond) : ce qui la protège,
// ce qui l'emporte (mode de la règle du score, interrupteur des blocages). Lecture seule.
function reponseAuto(q, { cle, engine, switches, t, admins, noms }) {
  const p = [];
  const conf = (reglage(q, 'adresses_confiance', []) || []).find(x => x && typeof x === 'object' && x.ip === cle && x.jusqua > t);
  if (isPrivate(cle)) return { protegee: 'Protégée : adresse privée', p: [{ b: 'Adresse privée : jamais bloquée automatiquement.' }] };
  if (!reglage(q, 'controle_roles_admins')) return { protegee: null, p: [{ b: 'Aucun contrôle des rôles réussi : aucune adresse n’est bloquée automatiquement.', t: 'Les adresses des administrateurs ne sont pas encore connues de la Vigie.' }] };
  if (conf) return { protegee: 'Protégée : adresse de confiance', p: [{ b: `Adresse de confiance ${jusqua(conf.jusqua, t)} : aucune réponse automatique.` }] };
  const vu = q.connexionsAdmin.all(cle, t - 30 * 864e5).find(x => admins.has(x.sub));
  if (vu) {
    const qui = noms.get(vu.sub) || nomsDe(q, [vu.sub]).get(vu.sub) || propre(vu.sub, 200);
    return { protegee: 'Protégée : vue avec un administrateur', p: [{ b: 'Jamais bloquée automatiquement.',
      t: `Vue avec un administrateur${FINE}: ${qui} s’y est connecté ${aQuand(vu.recu_a, t)} (connexion réussie)${FINE}; aucune règle ne la bloquera d’elle-même ${avantLe(vu.recu_a + 30 * 864e5, t)}, même en mode Bloquer.` }] };
  }
  p.push({ b: 'Réponse automatique : rien ne protège cette adresse.', t: `Ni privée, ni de confiance, ni vue avec un administrateur${FINE}: en mode Bloquer, la Vigie la bloquerait 24${NBSP}h d’elle-même.` });
  const mode = engine?.modeOf?.('entite.score') || 'observer';
  const etat = switches?.state?.()?.blocages;
  const raisons = [];
  if (mode !== 'bloquer') raisons.push(`la règle du score est en mode ${MODES[mode] || mode}`);
  if (etat && !etat.marche) raisons.push(`les blocages automatiques sont arrêtés${etat.jusqua ? ` ${jusqua(etat.jusqua, t)}` : ''}`);
  p.push({ t: raisons.length ? `Elle ne le fera pas${FINE}: ${raisons.join(', et ')}.` : `La règle du score est en mode Bloquer et les blocages automatiques sont en marche${FINE}: au-dessus du seuil avec deux sources, elle la bloquera.` });
  return { protegee: null, p };
}

// Décisions en cours qui visent l'entité : un blocage qui couvre l'adresse (ou une adresse du réseau) ; le gel ou la
// fermeture des sessions d'un compte ; la fermeture d'une session.
function decisionsDe(q, kind, cle, t) {
  const recentes = l => l.sort((x, y) => y.id - x.id);
  if (kind === 'compte' || kind === 'session') return recentes(q.decisionsCible.all(t, cle));
  if (kind !== 'ip' && kind !== 'reseau') return [];
  if (!net.isIP(cle)) return [];
  const fam = cle.includes(':') ? 'ipv6' : 'ipv4';
  return recentes(q.blocages.all(t)).filter(d => {
    const [a, p] = String(d.cible).split('/');
    if (!net.isIP(a) || a.includes(':') !== (fam === 'ipv6')) return false;
    try {
      const bl = new net.BlockList(); bl.addSubnet(a, Number(p ?? (fam === 'ipv6' ? 128 : 32)), fam);
      if (bl.check(cle, fam)) return true;
      if (kind === 'reseau') { const r = new net.BlockList(); r.addSubnet(cle, suffixe(cle), fam); return r.check(a, fam); }
    } catch { /* cible illisible : écartée */ }
    return false;
  }).slice(0, 20);
}

// Fiche d'une entité : { redirection } (un Lecteur et une adresse complète), null (inconnue), ou la fiche.
export function fiche({ db, engine, switches, kind, cle, role, t }) {
  if (!Object.hasOwn(ENTITES_NOM, kind) || typeof cle !== 'string' || !cle || cle.length > 200 || /[\u0000-\u001f\u007f]/.test(cle)) return null;
  const lecteur = !voitAdresses(role);
  if (kind === 'ip') {
    if (!net.isIP(cle)) return null;
    if (lecteur) { const n = reseauDe(cle); return n ? { redirection: `/entites/reseau/${encodeURIComponent(n)}` } : null; }
  }
  // Une clé de réseau qui est une adresse complète (Zitadel écrit l'adresse comme réseau) : un Lecteur va au réseau tronqué.
  if (kind === 'reseau' && lecteur && net.isIP(cle) && reseauDe(cle) !== cle) { const n = reseauDe(cle); return n ? { redirection: `/entites/reseau/${encodeURIComponent(n)}` } : null; }
  // Une ancienne clé de réseau fausse (« 2a01::bad:: », « 2606:4700::: », audit D3-C4) : la fiche du réseau sous sa forme
  // canonique, pour tous les rôles (les entités ont été réécrites, vigie/reseaux.js ; le journal garde les deux écritures).
  if (kind === 'reseau' && (!net.isIP(cle) || cle.endsWith('::'))) { const c = cleReseau(cle); if (c && c !== cle) return { redirection: `/entites/reseau/${encodeURIComponent(c)}` }; }
  const q = requetes(db);
  const titres = new Map((engine?.rules?.() || []).map(x => [x.id, x.titre]));
  const seuil = (engine?.thresholds?.() || THRESHOLDS)[kind] ?? null;
  const e = engine?.current?.(kind, cle, t) || null;

  // Liens, dans les deux sens (entity_links, 90 jours), LIENS_MAX par sens au plus.
  const liens = [...q.liensA.all(kind, cle), ...q.liensB.all(kind, cle)].sort((a, b) => b.derniere - a.derniere);
  // Alertes de l'entité ; pour un réseau, aussi celles des adresses qu'on y a vues (50 au plus).
  let brutes = q.alertesEntite.all(kind, cle);
  if (kind === 'reseau') for (const l of liens.filter(x => x.k === 'ip').slice(0, 50)) brutes = brutes.concat(q.alertesEntite.all('ip', l.cle));
  const vues = new Set();
  brutes = brutes.filter(a => !vues.has(a.id) && vues.add(a.id));
  const ouvertes = brutes.filter(a => a.statut !== 'close').sort(alertOrder);
  const closes = brutes.filter(a => a.statut === 'close').sort((a, b) => b.derniere - a.derniere);
  const alertes = [...ouvertes, ...closes].slice(0, ALERTES_MAX).map(a => ligneAlerte(a, { t, role, titres, avecEntite: kind === 'reseau' && a.entite_kind !== 'reseau' }));

  // Derniers événements, par l'index qui convient.
  let derniers = [];
  if (kind === 'ip') derniers = q.derniersIp.all(cle);
  else if (kind === 'reseau') derniers = derniersReseau(q, cle);
  else if (kind === 'compte') derniers = q.derniersSub.all(cle);
  else if (kind === 'session') {
    for (const l of liens.filter(x => x.k === 'compte').slice(0, 3)) derniers = derniers.concat(q.derniersSubFenetre.all(l.cle).filter(r => r.session === cle));
    derniers = derniers.sort((a, b) => b.recu_a - a.recu_a || b.seq - a.seq).slice(0, DERNIERS);
  }
  if (!e && !liens.length && !brutes.length && !derniers.length && !q.entite.get(kind, cle)) return null;

  const noms = nomsDe(q, [...derniers.map(r => r.sub), ...(kind === 'compte' ? [cle] : []), ...liens.filter(l => l.k === 'compte').map(l => l.cle)]);
  const evenements = derniers.map(r => ligneEvenement(r, { role, t, noms }));

  // Score par source, maintenant ; seuil ; retour sous le seuil sans nouveau signal (demi-vie).
  const total = e ? e.score : 0;
  const parts = e ? Object.entries(e.contributions || {}).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]) : [];
  const retombe = seuil && total >= seuil ? t + HALF_LIFE_MIN * 60e3 * Math.log2(total / seuil) : null;
  const article = kind === 'ip' || kind === 'session' ? 'une' : 'un';
  const score = {
    a: heure(t),
    max: Math.max(20, Math.ceil(total)),
    total: { v: Math.round(total * 10) / 10, texte: virgule(total) },
    parts: parts.map(([s, v], i) => ({ id: `s-${i}`, mot: CONTRIBUTIONS[s] || propre(s, 30), v: Math.round(v * 10) / 10, texte: virgule(v) })),
    auDessus: seuil != null && total >= seuil,
    phrase: seuil != null
      ? `Seuil d’${article === 'une' ? 'une' : 'un'} ${ENTITES[kind]}${FINE}: ${nombre(seuil)} points${FINE}; Haute au double, ${nombre(seuil * 2)}. Le score perd la moitié de sa valeur chaque heure${retombe ? `${FINE}: sans nouveau signal, il repasse sous le seuil vers ${quand(retombe, t)}` : ''}.`
      : `Pas de seuil pour cette classe d’entité${FINE}: elle porte les alertes de règles, sans score.`,
  };

  // Vue avec : par classe d'entité ; pour un Lecteur, les adresses ramenées à leur réseau (sans doublon).
  const NOMS_GROUPES = { ip: 'Adresses', reseau: 'Réseaux', compte: 'Comptes', session: 'Sessions', appareil: 'Appareils', site: 'Site', vigie: 'Vigie' };
  const groupes = [];
  for (const k of Object.keys(NOMS_GROUPES)) {
    const items = [];
    const deja = new Set();
    for (const l of liens.filter(x => x.k === k)) {
      let item;
      if (k === 'ip') { const a = adresseVue(l.cle, role); item = { texte: a.texte, mono: 'ip', v6: a.v6, tronquee: a.tronquee, href: a.href, lien: a.tronquee ? `Fiche du réseau ${a.texte}` : `Fiche de l’adresse ${a.texte}` }; } else if (k === 'reseau') { const a = reseauVueDe(l.cle, role); item = { texte: a.texte, mono: 'ip', v6: a.v6, tronquee: a.tronquee, href: a.href, lien: a.tronquee ? `Fiche du réseau ${a.texte}` : `Fiche du réseau ${a.texte}` }; } else {
        // Clé « vigie » ou « site » qui porte une adresse (« confiance:198.51.100.44 ») : tronquée pour un Lecteur, et sans
        // lien (l'adresse de la fiche la porterait entière) ; audit D3-C3.
        const libre = k === 'site' || k === 'vigie';
        if (libre && lecteur && masquer(l.cle, role) !== l.cle) continue;
        const tx = libre ? cleTexte(l.cle, role, 200) : propre(l.cle, 200);
        item = { texte: tx, mono: libre ? null : 'sub', href: `/entites/${k}/${encodeURIComponent(l.cle)}`, nom: k === 'compte' ? noms.get(l.cle) || null : null,
          lien: `Fiche ${k === 'compte' ? 'du compte' : k === 'session' ? 'de la session' : 'de l’entité'} ${tx}` };
      }
      if (!item.href || deja.has(item.href)) continue;
      deja.add(item.href);
      item.quand = quand(l.derniere, t);
      items.push(item);
    }
    if (items.length) groupes.push({ k, titre: NOMS_GROUPES[k], n: items.length, items: items.slice(0, 10), reste: Math.max(0, items.length - 10) });
  }

  const reseau = kind === 'ip' && reseauDe(cle) ? reseauVueDe(reseauDe(cle), role) : null;
  const ici = `/entites/${kind}/${encodeURIComponent(cle)}`;
  const decisions = decisionsDe(q, kind, cle, t).map(d => {
    const auto = /^alerte #(\d+)$/.exec(d.motif || '');
    return {
      id: d.id, type: DECISIONS[d.kind] || propre(d.kind, 30),
      lever: can(role, 'actions_forcees') ? lienLever(d, ici) : null,
      cible: d.kind === 'bloquer' ? { texte: adresseDetail(cibleBlocage(d.cible), role).texte, mono: 'ip' } : { texte: propre(d.cible, 200), mono: 'sub' },
      sec: [{ t: `${d.portee ? `${PORTEES[d.portee] || propre(d.portee, 20)} · ` : ''}${jusqua(d.fin, t)} · ` }, ...(d.auto && auto ? [{ t: 'par la Vigie, alerte ' }, { t: `#${auto[1]}`, href: `/alertes/${auto[1]}` }]
        : [{ t: `par ${d.auto ? 'la Vigie' : propre(masquer(d.par, role), 60)}${d.motif ? motif(d.motif, role) : ''}` }])],
    };
  });

  const ca = reglage(q, 'controle_roles_admins');
  const admins = new Set(Array.isArray(ca?.administrateurs) ? ca.administrateurs : []);
  const auto = kind === 'ip' ? reponseAuto(q, { cle, engine, switches, t, admins, noms }) : null;

  // Ce qu'on en sait, en une phrase.
  const lede = e ? `Vue depuis le ${dateHeure(e.premiere)}, dernier point ${aQuand(e.derniere, t)}${FINE}; ${nombre(e.signaux)} ${pluriel(e.signaux, 'signal noté', 'signaux notés')}.`
    : 'Aucun point en cours sur cette entité (un score s’efface 30 jours après son dernier signal).';
  const ledeSec = ouvertes.length ? `${nombre(ouvertes.length)} ${pluriel(ouvertes.length, 'alerte ouverte', 'alertes ouvertes')}${kind === 'reseau' ? ' sur ce réseau ou ses adresses' : ''}.${can(role, 'actions_forcees') ? '' : ` Rien ne se fait depuis cet écran${FINE}: il se lit.`}`
    : `Aucune alerte ouverte${kind === 'reseau' ? ' sur ce réseau ni ses adresses' : ''}.`;

  // En-tête.
  let titre;
  if (kind === 'ip') titre = { k: 'Adresse', texte: propre(cle, 60), mono: 'ip', v6: cle.includes(':') };
  else if (kind === 'reseau') { const a = reseauVueDe(cle, role); titre = { k: 'Réseau', texte: a.texte, mono: 'ip', v6: a.v6 }; } else if (kind === 'compte' || kind === 'session') titre = { k: ENTITES_NOM[kind], texte: propre(cle, 200), mono: 'sub', nom: kind === 'compte' ? noms.get(cle) || null : null };
  else titre = { k: ENTITES_NOM[kind], texte: cleTexte(cle, role), mono: null };
  const pastilles = [];
  if (score.auDessus) pastilles.push({ k: 'attention', mot: 'Au-dessus du seuil' });
  if (auto?.protegee) pastilles.push({ k: 'neutre', mot: auto.protegee });
  if (kind === 'compte' && admins.has(cle)) pastilles.push({ k: 'neutre', mot: 'Administrateur' });
  if (lecteur && kind === 'reseau') pastilles.push({ k: 'neutre', mot: 'Tronqué : lecture seule' });
  const meta = [];
  if (reseau) meta.push({ reseau });
  if (e) meta.push({ t: `vue depuis ${quand(e.premiere, t)}` });
  meta.push({ t: `score ${virgule(total)}` });

  // Issues vers le journal.
  const versJournal = [];
  if (kind === 'ip') versJournal.push({ t: 'Les événements de l’adresse, 7 jours', href: urlJournal({ periode: '7j', adresse: cle }) });
  else if (kind === 'reseau' && reseauDe(cle) === cle) versJournal.push({ t: 'Les événements du réseau, 7 jours', href: urlJournal({ periode: '7j', adresse: `${cle}/${suffixe(cle)}` }) });
  else if (kind === 'compte') versJournal.push({ t: 'Les événements du compte, 7 jours', href: urlJournal({ periode: '7j', compte: cle }) });
  for (const a of ouvertes.slice(0, 2)) versJournal.push({ t: a.compteur > 1 ? `Les ${nombre(a.compteur)} événements de l’alerte #${a.id}` : `L’événement de l’alerte #${a.id}`, href: `/evenements?alerte=${a.id}` });

  return {
    kind, lecteur, titre, pastilles, meta,
    principale: ouvertes[0] ? { href: `/alertes/${ouvertes[0].id}`, texte: `Ouvrir l’alerte #${ouvertes[0].id}` } : null,
    lede: { t: lede, sec: ledeSec },
    score, groupes, liensTronques: liens.length >= LIENS_MAX,
    alertes, nbAlertes: brutes.length,
    evenements, versJournal, decisions, auto: auto?.p || null,
    maintenant: dateHeure(t), nomKind: ENTITES[kind],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Routes

export function register(app, ctx) {
  const { db, engine, switches, store, now } = ctx;
  // Une page en session avec un autre code que 200 (introuvable) : comme ctx.view, avec le code.
  const pageCode = (reply, req, name, it, code) => ctx.view(reply, req, name, it, code);
  const introuvable = (reply, req, quoi) => pageCode(reply, req, 'evenements-introuvable', {
    page: quoi === 'evenement' ? 'evenements' : 'entites', titre: quoi === 'evenement' ? 'Événement introuvable · Vigie' : 'Entité introuvable · Vigie', quoi,
  }, 404);

  app.get('/evenements', async (req, reply) => {
    const j = journal({ db, query: req.query, role: req.moi.role, t: now() });
    if (j.redirection) return reply.redirect(j.redirection, 302);
    return ctx.view(reply, req, 'evenements', { page: 'evenements', titre: 'Événements · Vigie', j });
  });

  app.get('/evenements.csv', async (req, reply) => {
    if (!(await ctx.guard(req, reply, 'exporter'))) return reply;
    const r = await exportCsv({ db, query: req.query, role: req.moi.role, t: now() });
    if (r.erreur) return reply.code(400).type('text/plain; charset=utf-8').send(`Filtre refusé : ${r.erreur}`);
    try {
      store.own('vigie_console_export', { emetteur: 'vigie/console', sub: req.moi.sub, ip: req.ip2 || undefined, detail: { filtres: r.filtres, lignes: r.n, tronque: r.tronque || undefined } });
    } catch (err) {
      // Un export que le journal ne peut pas noter ne sort pas.
      ctx.log.error({ err: err.message }, 'Vigie : console : export non noté');
      return reply.code(503).type('text/plain; charset=utf-8').send('Export impossible : le journal n’a pas pu le noter.');
    }
    return reply.code(200).type('text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${r.nomFichier}"`).send(r.csv);
  });

  app.get('/evenements/:seq', async (req, reply) => {
    const s = String(req.params.seq || '');
    const ev = /^\d{1,15}$/.test(s) ? evenement({ db, seq: Number(s), role: req.moi.role, t: now(), engine }) : null;
    if (!ev) return introuvable(reply, req, 'evenement');
    return ctx.view(reply, req, 'evenements-detail', { page: 'evenements', titre: `Événement n° ${s} · Vigie`, ev });
  });

  app.get('/entites', async (req, reply) => {
    const c = chercherEntite(req.query, req.moi.role);
    if (c?.href) return reply.redirect(c.href, 302);
    return ctx.view(reply, req, 'entites', { page: 'entites', titre: 'Entités · Vigie', vue: top({ engine, role: req.moi.role, t: now() }), recherche: c });
  });

  app.get('/entites/:kind/:cle', async (req, reply) => {
    const f = fiche({ db, engine, switches, kind: String(req.params.kind), cle: String(req.params.cle ?? ''), role: req.moi.role, t: now() });
    if (!f) return introuvable(reply, req, 'entite');
    if (f.redirection) return reply.redirect(f.redirection, 302);
    // Le titre de l'onglet ne porte ni adresse ni compte (historique, onglets).
    const de = { ip: 'd’une adresse', reseau: 'd’un réseau', compte: 'd’un compte', session: 'd’une session' }[f.kind] || 'd’une entité';
    // Actions forcées (D3c), selon le droit : le message d'une action est lu ici (une fois) pour placer une erreur près de
    // son champ, puis passé à la page.
    const message = ctx.isRefresh(req) ? null : ctx.sessions.takeMessage(req.moi.sid);
    const kind = String(req.params.kind), cle = String(req.params.cle ?? '');
    const actions = actionsForcees({ db, kind, key: cle, req, t: now(), retour: `/entites/${kind}/${encodeURIComponent(cle)}`, message, prefixe: 'e' });
    return ctx.view(reply, req, 'entite', { page: 'entites', titre: `Fiche ${de} · Vigie`, f, actions, message });
  });

}

// Pour les essais (test/vigie-console-evenements.test.js) : les requêtes préparées, dont on vérifie le plan (index, bornes).
export { requetes as requetesPourEssais };
