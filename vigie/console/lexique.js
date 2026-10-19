// Lexique de la console de la Vigie (audit D3-D10) : les mots et les petites aides d'écriture partagés par la vue
// d'ensemble et les écrans (vigie/console/ecrans/*.js), écrits une seule fois ici. Avant, chaque module en gardait sa copie
// et les copies avaient divergé (classement « sans suite », arrondi des nombres à virgule, apostrophes).
// Mots : docs/maquettes-vigie/LEXIQUE-ET-DONNEES.md. Dates, nombres et espaces : format.js (dont ce module dépend).
// Les rôles ont leur seule source dans droits.js (LABELS) ; le barème des détecteurs, dans vigie/detecteurs.js.
import { responseOf } from '../notifications.js';
import { FINE, NBSP, dateHeure, heure, jour, nombre, paris, quand } from './format.js';

// Sources d'une alerte ou d'un événement (celles du quorum, vigie/poids.js).
export const SOURCES = { site: 'site', zitadel: 'Zitadel', bordure: 'bordure Cloudflare', vigie: 'contrôles de la Vigie' };
// Modes d'une règle (vigie/poids.js, MODES).
export const MODES = { arret: 'Arrêt', observer: 'Observer', alerter: 'Alerter', bloquer: 'Bloquer' };
// Classes d'entités : dans une phrase (« compte »), et en tête de ligne ou de fiche (« Compte »).
export const ENTITES = { ip: 'adresse', reseau: 'réseau', compte: 'compte', session: 'session', appareil: 'appareil', site: 'site', vigie: 'la Vigie' };
export const ENTITES_NOM = { ip: 'Adresse', reseau: 'Réseau', compte: 'Compte', session: 'Session', appareil: 'Appareil', site: 'Site', vigie: 'Vigie' };
// Types de décisions (lexique § 1), dans l'ordre du formulaire « Nouvelle décision ».
export const DECISIONS = { bloquer: 'Bloquer une adresse', revoquer_compte: 'Fermer les sessions d’un compte', geler: 'Geler un compte', revoquer_session: 'Fermer une session', verrouiller: 'Verrouiller l’admin', suspendre_acces: 'Suspendre un accès de galerie privée' };
// Portées d'un blocage (vigie/decisions.js, SCOPES).
export const PORTEES = { tout: 'Tout le site', admin: 'L’admin et la connexion', auth: 'La connexion seulement' };
// Classements d'une alerte close : ceux qu'admet la table alerts (contrainte CHECK, migration 003). Une alerte close par
// la Vigie après 7 jours sans événement n'a pas de classement : sa note commence par « sans suite » (vigie/moteur.js).
export const CLASSEMENTS = { incident: 'Incident confirmé', faux_positif: 'Faux positif', test: 'Test' };
export const closeSansSuite = a => !a.classement && /^sans suite/.test(a.note || '');
// Titres lisibles des détecteurs (lexique § 3.11, proposés) : le moteur écrit le nom brut (« premiere apparition »).
export const DETECTEURS = {
  premiere_apparition: 'Connexion d’un compte depuis un pays ou un appareil jamais vus',
  heure_inhabituelle: 'Activité d’un compte à une heure jamais utilisée',
  vitesse: 'Lectures d’un compte bien au-delà de son habitude',
  voyage_impossible: 'Voyage impossible entre deux connexions d’un compte',
  pivot_identifiants: 'Connexion réussie après des échecs répétés',
  role_incoherent: 'Geste réservé à un autre rôle fait par un compte (export, galerie privée, billet)',
  exploration_lente: 'Exploration lente depuis un réseau (pièges et erreurs sur 12 heures)',
  chaine_attaque: 'Chaîne d’attaque : repérage, tentative puis accès sur une même entité',
  silence: 'Site silencieux : aucun battement depuis 3 minutes',
  menaces: 'Adresse sur une liste de menaces (Spamhaus DROP, Feodo, Tor)',
};

// Rang SQL d'une gravité (tri des alertes, la plus grave d'abord).
export const RANG_SQL = "CASE gravite WHEN 'critique' THEN 4 WHEN 'haut' THEN 3 WHEN 'moyen' THEN 2 WHEN 'bas' THEN 1 ELSE 0 END";

// Typographie d'un texte du code (titres des règles en YAML, messages, raisons) : apostrophe typographique, espace fine
// insécable avant « : ; ! ? », espace insécable entre un nombre et son unité (« 24 h », « 30 min », « 7 jours »).
export const typo = s => String(s ?? '').replace(/'/g, '’').replace(/ ([:;!?])/g, `${FINE}$1`)
  .replace(/(\d) (h|min|jours?|adresses)\b/g, `$1${NBSP}$2`);
export const pluriel = (n, un, plusieurs = `${un}s`) => (n > 1 ? plusieurs : un);
// JSON d'une colonne (réglage, détail, sources) : null s'il manque ou se lit mal.
export const lire = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
// Nombre à une décimale au plus, virgule française : « 2,3 », « 7 ».
export const virgule = x => nombre(Math.round(Number(x) * 10) / 10).replace('.', ',');
// « à 14 h 05 » aujourd'hui ; « le ven. 16 oct., 18 h 25 » un autre jour.
export const aQuand = (x, t) => { const s = quand(x, t); return s.includes(',') ? `le ${s}` : `à ${s}`; };

const memeJour = (a, b) => { const pa = paris(a), pb = paris(b); return Boolean(pa && pb && pa.annee === pb.annee && pa.mois === pb.mois && pa.jour === pb.jour); };
// Période d'occurrences : « de 10 h 00 à 11 h 00 », « le lun. 19 oct., de 10 h 00 à 11 h 00 », « du … au … ».
export function periode(a, b, t) {
  if (memeJour(a, b)) return quand(a, t).includes(',') ? `le ${jour(a)}, de ${heure(a)} à ${heure(b)}` : `de ${heure(a)} à ${heure(b)}`;
  return `du ${dateHeure(a)} au ${dateHeure(b)}`;
}

// Titre lisible d'une règle : titres, une Map identifiant → titre (texte) ou règle du moteur ({ titre }). Un détecteur
// dont le moteur ne donne que le nom brut prend son titre du lexique.
export function titreDe(regle, titres = new Map()) {
  const v = titres.get(regle);
  const brut = v && typeof v === 'object' ? v.titre : v;
  const nom = regle.startsWith('detecteur.') ? regle.slice(10) : null;
  if (nom && (!brut || brut === nom.replaceAll('_', ' '))) return typo(DETECTEURS[nom] || nom.replaceAll('_', ' '));
  return typo(brut || regle);
}

// « réponse faite : compte gelé 24 h, sessions du compte fermées » (mots de vigie/notifications.js, responseOf).
export const reponseFaite = decisions => responseOf(decisions).replace(/^Réponse : /, `réponse faite${FINE}: `).replace(/(\d) (h|j)\b/g, `$1${NBSP}$2`);
