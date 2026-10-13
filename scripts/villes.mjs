// Génère server/geo/villes.tsv depuis GeoNames (villes de plus de 5 000 habitants, licence CC BY 4.0).
// À relancer seulement pour rafraîchir la liste ; le fichier produit est versionné.
//   curl -O https://download.geonames.org/export/dump/cities5000.zip && unzip cities5000.zip
//   node scripts/villes.mjs cities5000.txt
import fs from 'node:fs';
const src = process.argv[2] || 'cities5000.txt';
const lines = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean);
const out = ['# Villes de plus de 5 000 habitants. Source : GeoNames (https://www.geonames.org), licence CC BY 4.0. Généré par scripts/villes.mjs.',
  '# id\tnom\tnom_ascii\tpays\tlat\tlon\tpopulation\tautres_noms'];
// Quartiers et arrondissements (PPLX), lieux historiques, abandonnés ou détruits : écartés.
const SKIP = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW']);
for (const l of lines) {
  const c = l.split('\t');
  if (SKIP.has(c[7])) continue;
  // Arrondissements codés comme des villes (« Paris 15 Vaugirard », « Lyon 03 », « Marseille 08 ») : écartés.
  if (/^\D+ \d{2}( |$)/.test(c[1])) continue;
  const pop = Number(c[14]) || 0;
  const ascii = c[2] === c[1] ? '' : c[2];
  // Autres noms des grandes villes, écritures latines seulement, pour « Londres », « Munich »… (plus pour les plus grandes).
  const cap = pop > 1_000_000 ? 120 : pop > 200_000 ? 30 : 0;
  const alt = cap ? [...new Set(c[3].split(',').filter(a => /^[\p{Script=Latin}\s\-'.]+$/u.test(a) && a !== c[1] && a !== c[2] && a.length < 40))].slice(0, cap).join(',') : '';
  // Coordonnées à 0,01° près (~1 km) : la carte situe une ville, pas une adresse.
  out.push([c[0], c[1], ascii, c[8], (+c[4]).toFixed(2), (+c[5]).toFixed(2), pop, alt].join('\t'));
}
fs.writeFileSync(new URL('../server/geo/villes.tsv', import.meta.url), `${out.join('\n')}\n`);
console.log(`${out.length - 2} villes`);
