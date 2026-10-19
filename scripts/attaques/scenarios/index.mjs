// Catalogue des scénarios du jeu d'attaques : un fichier par famille. Pour en ajouter un, voir docs/wiki/Vigie.md,
// section « Jeu d'attaques ».
import exploration from './exploration.mjs';
import connexion from './connexion.mjs';
import sessions from './sessions.mjs';
import galeries from './galeries.mjs';
import carnets from './carnets.mjs';
import textes from './textes.mjs';
import reglages from './reglages.mjs';
import normal from './normal.mjs';

export const SCENARIOS = [...normal, ...exploration, ...connexion, ...sessions, ...galeries, ...carnets, ...textes, ...reglages];

const noms = new Set();
for (const s of SCENARIOS) {
  if (noms.has(s.nom)) throw new Error(`scénario en double : ${s.nom}`);
  noms.add(s.nom);
  for (const k of ['nom', 'famille', 'titre', 'cas', 'jouer']) if (!s[k]) throw new Error(`scénario ${s.nom || '?'} : « ${k} » manque`);
}
