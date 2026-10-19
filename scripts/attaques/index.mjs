#!/usr/bin/env node
// Jeu d'attaques rejouable de la Vigie (phase E2) : node scripts/attaques/index.mjs [--scenario <nom>]… [--garder] [--liste]
//   --scenario <nom>   ne jouer que ce scénario (plusieurs fois permis ; un nom de famille joue toute la famille) ;
//   --garder           garder les dossiers du banc à la fin (chemin affiché) ;
//   --liste            lister les scénarios sans les jouer.
// Code de sortie : 0 si tous les scénarios joués sont verts, 1 sinon, 2 pour une option inconnue.
// Rien ne part vers l'extérieur : site et Vigie écoutent sur 127.0.0.1, dans des dossiers temporaires.
process.env.AVIF_EFFORT ??= '0';                  // graine plus rapide (lu au chargement de server/images.js)

const args = process.argv.slice(2);
const choisis = [];
let garder = false, liste = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--garder') garder = true;
  else if (a === '--liste') liste = true;
  else if (a === '--scenario' && args[i + 1]) choisis.push(args[++i]);
  else if (a.startsWith('--scenario=')) choisis.push(a.slice(11));
  else { console.error(`Option inconnue : ${a}\nUsage : node scripts/attaques/index.mjs [--scenario <nom>] [--garder] [--liste]`); process.exit(2); }
}

const { SCENARIOS } = await import('./scenarios/index.mjs');
const { jouerScenarios, rapport } = await import('./jeu.mjs');

if (liste) {
  for (const s of SCENARIOS) console.log(`${s.famille.padEnd(12)} ${s.nom.padEnd(34)} ${[].concat(s.cas).join(', ').padEnd(14)} ${s.titre}`);
  process.exit(0);
}
const scenarios = choisis.length ? SCENARIOS.filter(s => choisis.includes(s.nom) || choisis.includes(s.famille)) : SCENARIOS;
if (!scenarios.length) { console.error(`Aucun scénario ne s'appelle ainsi : ${choisis.join(', ')} (--liste pour les voir)`); process.exit(2); }

const r = await jouerScenarios(scenarios, { garder, log: m => console.error(m) });
console.log(rapport(r));
process.exit(r.resultats.every(x => x.ok) ? 0 : 1);
