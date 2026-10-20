import fs from 'node:fs';

// Référentiel MITRE ATT&CK Enterprise de la Vigie (étude docs/etudes/vigie-dossiers.md, section 3.1, décision D31) : la
// détection garde ATT&CK complet (toutes les tactiques, techniques et sous-techniques en vigueur) ; les huit phases des
// dossiers n'en sont qu'une projection (vigie/phases.js). Données : vigie/attack-enterprise.json, produit par
// scripts/attack-referentiel.mjs depuis le jeu STIX de MITRE (© The MITRE Corporation, conditions d'utilisation dans le
// fichier). Noms français : ceux de la Vigie (MITRE ne publie qu'en anglais), pour les tactiques et les techniques que
// ses règles emploient ; les autres gardent leur nom anglais.

const data = JSON.parse(fs.readFileSync(new URL('./attack-enterprise.json', import.meta.url), 'utf8'));
export const VERSION = data.version;
export const PUBLIEE = data.publiee;
export const LICENCE = data.licence;

const TACTIQUES_FR = {
  reconnaissance: 'Reconnaissance', resource_development: 'Développement de ressources', initial_access: 'Accès initial', execution: 'Exécution',
  persistence: 'Persistance', privilege_escalation: 'Élévation de privilèges', stealth: 'Furtivité', defense_impairment: 'Neutralisation des défenses',
  credential_access: 'Accès aux identifiants', discovery: 'Découverte', lateral_movement: 'Mouvement latéral', collection: 'Collecte',
  command_and_control: 'Commande et contrôle', exfiltration: 'Exfiltration', impact: 'Impact',
};
// Tactiques dans l'ordre de la matrice : { id, cle, nom (anglais), nom_fr }.
export const TACTIQUES = data.tactiques.map(t => ({ ...t, nom_fr: TACTIQUES_FR[t.cle] ?? t.nom }));
const parCle = new Map(TACTIQUES.map(t => [t.cle, t]));
// Tactiques retirées d'ATT&CK, encore présentes dans les événements déjà chaînés (la console les nomme toujours) ; une
// règle ne doit plus les porter (test/vigie-attack.test.js). Defense Evasion (TA0005) a été scindée en v20 en Stealth
// (TA0005) et Defense Impairment (TA0112).
export const TACTIQUES_RETIREES = { defense_evasion: { id: 'TA0005', nom: 'Defense Evasion', nom_fr: 'Contournement des défenses (avant ATT&CK v20)' } };

const TECHNIQUES_FR = {
  T1005: 'Données du système local', T1036: 'Déguisement', T1041: 'Exfiltration par le canal de commande', T1046: 'Découverte des services réseau',
  T1048: 'Exfiltration par un autre protocole', T1059: 'Interpréteur de commandes et de scripts', 'T1059.007': 'JavaScript',
  T1068: 'Exploitation pour l’élévation de privilèges', T1070: 'Effacement des traces', T1071: 'Protocole applicatif', 'T1071.001': 'Protocoles web',
  T1078: 'Comptes valides', T1087: 'Découverte des comptes', T1095: 'Protocole hors couche application', T1098: 'Manipulation de compte',
  T1105: 'Transfert d’outils', T1110: 'Force brute', 'T1110.001': 'Devinette de mot de passe', 'T1110.004': 'Bourrage d’identifiants',
  T1119: 'Collecte automatisée', T1185: 'Détournement de la session du navigateur', T1189: 'Compromission par navigation',
  T1190: 'Exploitation d’une application exposée', T1204: 'Exécution par l’utilisateur', T1213: 'Données des dépôts d’information',
  T1485: 'Destruction de données', T1491: 'Défiguration', 'T1491.001': 'Défiguration interne', T1498: 'Déni de service réseau',
  T1499: 'Déni de service du service', T1530: 'Données du stockage en nuage', T1539: 'Vol du cookie de session web',
  T1550: 'Autre moyen d’authentification', 'T1550.004': 'Cookie de session web', T1556: 'Modification du processus d’authentification',
  T1566: 'Hameçonnage', T1568: 'Résolution dynamique', T1595: 'Balayage actif', 'T1595.002': 'Recherche de vulnérabilités',
  'T1595.003': 'Balayage par liste de mots', T1685: 'Désactivation ou modification des outils', T1686: 'Désactivation ou modification du pare-feu',
};
// Techniques et sous-techniques en vigueur : identifiant → { id, nom, nom_fr, tactiques }.
const techniques = new Map(data.techniques.map(([id, nom, tac]) => [id, { id, nom, nom_fr: TECHNIQUES_FR[id] ?? null, tactiques: tac ? tac.split(' ') : [] }]));
export const technique = id => techniques.get(String(id).toUpperCase()) ?? null;
export const toutesLesTechniques = () => techniques.values();
// Technique révoquée : l'identifiant qui la remplace, sinon null.
export const remplacante = id => data.revoquees[String(id).toUpperCase()] ?? null;
export const tactique = cle => parCle.get(cle) ?? null;

// Étiquettes Sigma d'une règle ou d'un signal → { tactiques: ['initial_access'], techniques: ['T1078'] }, sans doublon,
// dans l'ordre ; tout ce qui n'est pas « attack.… » est ignoré (cve.…, car.…).
export function lire(tags = []) {
  const tactiques = [], techniquesVues = [];
  for (const t of tags) {
    const m = /^attack\.(.+)$/.exec(String(t).toLowerCase());
    if (!m) continue;
    if (/^t\d{4}(?:\.\d{3})?$/.test(m[1])) { const id = m[1].toUpperCase(); if (!techniquesVues.includes(id)) techniquesVues.push(id); }
    else if (!tactiques.includes(m[1])) tactiques.push(m[1]);
  }
  return { tactiques, techniques: techniquesVues };
}

// Ce qui ne va pas dans les étiquettes d'une règle au regard du référentiel : aucune tactique, tactique inconnue ou
// retirée, technique inconnue ou révoquée (avec sa remplaçante), technique dont aucune tactique officielle n'est portée
// par la règle (une sous-technique hérite des tactiques de sa technique). Liste vide : étiquettes justes.
export function incoherences(tags = []) {
  const { tactiques, techniques: ids } = lire(tags);
  const out = [];
  if (!tactiques.length) out.push('aucune tactique');
  for (const t of tactiques) {
    if (TACTIQUES_RETIREES[t]) out.push(`tactique retirée en ATT&CK ${VERSION} : ${t}`);
    else if (!parCle.has(t)) out.push(`tactique inconnue : ${t}`);
  }
  for (const id of ids) {
    const tech = technique(id);
    if (!tech) { const r = remplacante(id); out.push(r ? `technique révoquée : ${id}, remplacée par ${r}` : `technique inconnue : ${id}`); continue; }
    if (!tech.tactiques.some(t => tactiques.includes(t))) out.push(`${id} relève de ${tech.tactiques.join(', ')}, que la règle ne porte pas`);
  }
  return out;
}

// Libellés pour la console : « Accès initial » ; « Comptes valides » (nomTechnique), « T1078 Comptes valides »
// (libelleTechnique) ; une sous-technique est précédée du nom de sa technique. Technique inconnue : null, l'identifiant.
export const libelleTactique = cle => parCle.get(cle)?.nom_fr ?? TACTIQUES_RETIREES[cle]?.nom_fr ?? null;
export function nomTechnique(id) {
  const t = technique(id);
  if (!t) return null;
  const parent = t.id.includes('.') ? technique(t.id.split('.')[0]) : null;
  const nom = t.nom_fr ?? t.nom;
  return parent ? `${parent.nom_fr ?? parent.nom} : ${nom}` : nom;
}
export const libelleTechnique = id => { const n = nomTechnique(id); return n ? `${String(id).toUpperCase()} ${n}` : String(id); };
