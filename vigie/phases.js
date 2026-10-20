import { lire } from './attack.js';

// Phases d'attaque des dossiers (étude docs/etudes/vigie-dossiers.md, section 4 ; décisions D31 et D32 du 20 octobre
// 2026). Une projection des étiquettes MITRE ATT&CK, propre aux dossiers : la détection, les signaux et les alertes
// gardent ATT&CK complet (vigie/attack.js) ; rien ici ne modifie une étiquette, et une règle n'est jamais réétiquetée pour
// obtenir une phase (le champ phase_dossier de son bloc vigie corrige la projection quand la technique trompe).

// Huit phases ordonnées : la progression d'un dossier est la plus avancée de ses jalons.
export const PHASES = [
  { n: 1, cle: 'reperage', nom: 'Repérage' },
  { n: 2, cle: 'tentative', nom: 'Tentative' },
  { n: 3, cle: 'acces', nom: 'Accès' },
  { n: 4, cle: 'exploration', nom: 'Exploration' },
  { n: 5, cle: 'ancrage', nom: 'Ancrage' },
  { n: 6, cle: 'collecte', nom: 'Collecte' },
  { n: 7, cle: 'exfiltration', nom: 'Exfiltration' },
  { n: 8, cle: 'impact', nom: 'Impact' },
];
// Deux marqueurs hors chaîne : ils aggravent un dossier (dissimulation) ou comptent dans son enjeu (disponibilité), sans
// jamais faire avancer la progression.
export const MARQUEURS = { dissimulation: 'Dissimulation', disponibilite: 'Disponibilité' };
// Nature d'un signal dans un dossier : jalon (prouve une phase), indice (rend un accès douteux), preuve (rend un accès
// hostile à elle seule).
export const NATURES = ['jalon', 'indice', 'preuve'];
const NUMERO = Object.fromEntries(PHASES.map(p => [p.cle, p.n]));

// Technique (sans sa sous-technique) → phase ou marqueur. Plus précise que la tactique : T1078 (comptes valides) est un
// accès réussi, T1110 (force brute) une tentative ; c'est elle qui sépare l'échec de la réussite (étude, 4.5).
const PAR_TECHNIQUE = {
  reperage: ['T1595'],
  tentative: ['T1110', 'T1190', 'T1185', 'T1204', 'T1036'],
  acces: ['T1078', 'T1539', 'T1550'],
  exploration: ['T1087', 'T1046'],
  ancrage: ['T1098', 'T1556', 'T1068', 'T1105', 'T1071', 'T1568', 'T1095', 'T1189', 'T1059'],
  collecte: ['T1213', 'T1119', 'T1005'],
  exfiltration: ['T1530', 'T1041', 'T1048'],
  impact: ['T1485', 'T1491', 'T1566'],
  dissimulation: ['T1685', 'T1686', 'T1070'],
  disponibilite: ['T1498', 'T1499'],
};
export const TECHNIQUE_VERS = new Map(Object.entries(PAR_TECHNIQUE).flatMap(([cle, ids]) => ids.map(id => [id, cle])));
// Tactique → phase ou marqueur, en dernier recours (aucune technique classée).
export const TACTIQUE_VERS = {
  reconnaissance: 'reperage', resource_development: 'reperage', initial_access: 'acces', execution: 'tentative', credential_access: 'tentative',
  discovery: 'exploration', lateral_movement: 'exploration', persistence: 'ancrage', privilege_escalation: 'ancrage', command_and_control: 'ancrage',
  collection: 'collecte', exfiltration: 'exfiltration', impact: 'impact', stealth: 'dissimulation', defense_impairment: 'dissimulation',
};
export const estPhaseOuMarqueur = cle => Object.hasOwn(NUMERO, cle) || Object.hasOwn(MARQUEURS, cle);

// Projection d'une règle ou d'un détecteur : { phase (clé ou null), n (1 à 8 ou null), marqueurs, nature, origine }.
// Ordre (D32) : champ explicite, puis techniques, puis tactiques ; plusieurs phases : la plus avancée ; les marqueurs
// s'ajoutent. null : rien ne se projette (le test l'interdit pour une règle qui émet un signal).
export function projeter({ tags = [], phase_dossier: explicite = null, nature_dossier: nature = null } = {}) {
  let cles = [], origine = null;
  if (explicite) { cles = [explicite]; origine = 'explicite'; }
  else {
    const { tactiques, techniques } = lire(tags);
    cles = techniques.map(id => TECHNIQUE_VERS.get(id.split('.')[0])).filter(Boolean);
    if (cles.length) origine = 'technique';
    else { cles = tactiques.map(t => TACTIQUE_VERS[t]).filter(Boolean); if (cles.length) origine = 'tactique'; }
  }
  const phases = cles.filter(c => Object.hasOwn(NUMERO, c));
  const marqueurs = [...new Set(cles.filter(c => Object.hasOwn(MARQUEURS, c)))];
  if (!phases.length && !marqueurs.length) return null;
  const n = phases.length ? Math.max(...phases.map(c => NUMERO[c])) : null;
  return { phase: n ? PHASES[n - 1].cle : null, n, marqueurs, nature: nature || 'jalon', origine };
}

// Détecteurs : leurs étiquettes viennent de leur barème (DETECTEURS, vigie/detecteurs.js) ; ici, ce que la projection ne
// peut pas tirer d'elles. Les indices qualifient un accès (leur phase reste « accès ») ; la chaîne d'attaque sera calculée
// sur le dossier lui-même (cohérence des phases, étude 4.8) et ne se projette pas.
export const DETECTEURS_DOSSIER = {
  premiere_apparition: { nature_dossier: 'indice' },
  heure_inhabituelle: { nature_dossier: 'indice' },
  voyage_impossible: { nature_dossier: 'indice' },
  pivot_identifiants: { nature_dossier: 'indice' },
  role_incoherent: { nature_dossier: 'preuve' },
  menaces: { phase_dossier: 'acces', nature_dossier: 'indice' },
  silence: { phase_dossier: 'dissimulation' },
  chaine_attaque: { hors_projection: true },
};
export function projeterDetecteur(nom, bareme = {}) {
  const extra = DETECTEURS_DOSSIER[nom] ?? {};
  if (extra.hors_projection) return null;
  return projeter({ tags: bareme.tags ?? [], ...extra });
}
