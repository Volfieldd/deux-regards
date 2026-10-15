// Génère server/geo/villes.tsv depuis GeoNames (licence CC BY 4.0) :
//   - partout dans le monde, les localités de plus de 500 habitants (cities500) ;
//   - en France, en plus, toutes les communes (ADM4 du fichier FR), même les plus petites.
// À relancer seulement pour rafraîchir la liste ; le fichier produit est versionné.
//   curl -O https://download.geonames.org/export/dump/cities500.zip && unzip cities500.zip
//   curl -O https://download.geonames.org/export/dump/FR.zip && unzip FR.zip
//   curl -O https://download.geonames.org/export/dump/admin1CodesASCII.txt
//   curl -O https://download.geonames.org/export/dump/alternateNamesV2.zip && unzip alternateNamesV2.zip alternateNamesV2.txt
//   node scripts/villes.mjs cities500.txt FR.txt admin1CodesASCII.txt alternateNamesV2.txt
// Produit aussi server/geo/regions.tsv : les régions, États ou provinces (premier niveau administratif), pour lever
// les homonymes (« Monterey, Californie »). Noms en français, anglais et allemand quand GeoNames les donne.
import fs from 'node:fs';
import readline from 'node:readline';
const [src = 'cities500.txt', fr = 'FR.txt', admin1 = 'admin1CodesASCII.txt', altFile = 'alternateNamesV2.txt'] = process.argv.slice(2);
const LANGS = ['fr', 'en', 'de'];
const rows = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'));
const out = ['# Localités de plus de 500 habitants et toutes les communes de France. Source : GeoNames (https://www.geonames.org), licence CC BY 4.0. Généré par scripts/villes.mjs.',
  '# id\tnom\tnom_ascii\tpays\tlat\tlon\tpopulation\tautres_noms\tregion\tnom_fr\tnom_en\tnom_de'];
const kept = [];                                            // [ligne, geonameid, nom] : noms par langue ajoutés à la fin
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
  kept.push([[c[0], c[1], ascii, c[8], lat, lon, pop, alt, c[10] && c[10] !== '00' ? c[10] : ''], c[0], c[1]]);
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
// Régions (premier niveau administratif) : code « US.CA » → nom.
const regions = new Map();
for (const r of rows(admin1)) regions.set(r[0], { name: r[1], id: r[3] });
const usedRegions = new Set(kept.map(([f]) => f[8] && `${f[3]}.${f[8]}`).filter(Boolean));
// Noms par langue (fr, en, de) : nom préféré de GeoNames, sinon le premier ; jamais familier ni historique. Pour une
// région, le nom court d'abord (« Bayern » plutôt que « Freistaat Bayern »). Gardé seulement s'il diffère du nom.
const want = new Map(kept.map(([, id, name]) => [id, { name, kind: 'city' }]));
for (const code of usedRegions) { const r = regions.get(code); if (r) want.set(r.id, { name: r.name, kind: 'region' }); }
const names = new Map();                                    // geonameid → { fr: [score, nom], … }
const rl = readline.createInterface({ input: fs.createReadStream(altFile), crlfDelay: Infinity });
for await (const line of rl) {
  const a = line.split('\t');
  const w = want.get(a[1]);
  if (!w || !LANGS.includes(a[2]) || a[6] === '1' || a[7] === '1' || !a[3] || a[3].length > 60) continue;
  const score = (a[4] === '1' ? 4 : 0) + (a[5] === '1' ? (w.kind === 'region' ? 2 : -1) : 0);
  const n = names.get(a[1]) || {};
  if (!n[a[2]] || score > n[a[2]][0]) n[a[2]] = [score, a[3]];
  names.set(a[1], n);
}
// Une région en anglais : le nom de admin1CodesASCII l'est déjà (GeoNames ajoute sinon « Region » : « Île-de-France Region »).
const local = (id, base, region = false) => LANGS.map(l => { const v = region && l === 'en' ? '' : names.get(id)?.[l]?.[1]; return v && v !== base ? v : ''; });
for (const [f, id, name] of kept) out.push([...f, ...local(id, name)].join('\t'));
// Les plus peuplées d'abord : le site n'a pas à trier au chargement.
const head = out.splice(0, 2);
out.sort((a, b) => Number(b.split('\t')[6]) - Number(a.split('\t')[6]));
out.unshift(...head);
fs.writeFileSync(new URL('../server/geo/villes.tsv', import.meta.url), `${out.join('\n')}\n`);
const reg = ['# Régions, États, provinces (premier niveau administratif). Source : GeoNames (https://www.geonames.org), licence CC BY 4.0. Généré par scripts/villes.mjs.',
  '# code\tnom\tnom_fr\tnom_en\tnom_de'];
for (const code of [...usedRegions].sort()) { const r = regions.get(code); if (r) reg.push([code, r.name, ...local(r.id, r.name, true)].join('\t')); }
fs.writeFileSync(new URL('../server/geo/regions.tsv', import.meta.url), `${reg.join('\n')}\n`);
console.log(`${out.length - 2} localités, dont ${communes} communes françaises ajoutées ; ${reg.length - 2} régions`);
