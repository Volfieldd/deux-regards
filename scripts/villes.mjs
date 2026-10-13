// Génère server/geo/villes.tsv depuis GeoNames (licence CC BY 4.0) :
//   - partout dans le monde, les localités de plus de 500 habitants (cities500) ;
//   - en France, en plus, toutes les communes (ADM4 du fichier FR), même les plus petites.
// À relancer seulement pour rafraîchir la liste ; le fichier produit est versionné.
//   curl -O https://download.geonames.org/export/dump/cities500.zip && unzip cities500.zip
//   curl -O https://download.geonames.org/export/dump/FR.zip && unzip FR.zip
//   node scripts/villes.mjs cities500.txt FR.txt
import fs from 'node:fs';
const [src = 'cities500.txt', fr = 'FR.txt'] = process.argv.slice(2);
const rows = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'));
const out = ['# Localités de plus de 500 habitants et toutes les communes de France. Source : GeoNames (https://www.geonames.org), licence CC BY 4.0. Généré par scripts/villes.mjs.',
  '# id\tnom\tnom_ascii\tpays\tlat\tlon\tpopulation\tautres_noms'];
// Quartiers et arrondissements (PPLX), lieux historiques, abandonnés ou détruits : écartés.
const SKIP = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW']);
const key = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const seen = new Map();                                     // nom sans accents → positions déjà retenues
const near = (name, lat, lon) => (seen.get(key(name)) || []).some(([a, b]) => Math.abs(a - lat) < 0.1 && Math.abs(b - lon) < 0.15);
function add(c, pop) {
  const ascii = c[2] === c[1] ? '' : c[2];
  // Autres noms des villes de plus de 30 000 habitants (« Londres », « Venise », « Munich »…) : écriture latine, commençant
  // par une majuscule (les translittérations en minuscules sont écartées) ; plus nombreux pour les plus grandes.
  const cap = pop > 1_000_000 ? 120 : pop > 200_000 ? 60 : pop > 30_000 ? 40 : 0;
  const alt = cap ? [...new Set(c[3].split(',').filter(a => /^\p{Lu}[\p{Script=Latin}\s\-'.]*$/u.test(a) && a !== c[1] && a !== c[2] && a.length < 40))].slice(0, cap).join(',') : '';
  // Coordonnées à 0,01° près (~1 km) : la carte situe une ville, pas une adresse.
  const lat = (+c[4]).toFixed(2), lon = (+c[5]).toFixed(2);
  out.push([c[0], c[1], ascii, c[8], lat, lon, pop, alt].join('\t'));
  if (!seen.has(key(c[1]))) seen.set(key(c[1]), []);
  seen.get(key(c[1])).push([+lat, +lon]);
}
for (const c of rows(src)) {
  if (SKIP.has(c[7])) continue;
  // Arrondissements codés comme des villes (« Paris 15 Vaugirard », « Lyon 03 », « Marseille 08 ») : écartés.
  if (/^\D+ \d{2}( |$)/.test(c[1])) continue;
  add(c, Number(c[14]) || 0);
}
// Communes françaises absentes de la liste (moins de 500 habitants, ou noms de commune différents du village).
let communes = 0;
for (const c of rows(fr)) {
  if (c[7] !== 'ADM4' || near(c[1], +c[4], +c[5])) continue;
  add(c, Number(c[14]) || 0);
  communes++;
}
// Les plus peuplées d'abord : le site n'a pas à trier au chargement.
const head = out.splice(0, 2);
out.sort((a, b) => Number(b.split('\t')[6]) - Number(a.split('\t')[6]));
out.unshift(...head);
fs.writeFileSync(new URL('../server/geo/villes.tsv', import.meta.url), `${out.join('\n')}\n`);
console.log(`${out.length - 2} localités, dont ${communes} communes françaises ajoutées`);
