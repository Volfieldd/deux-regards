import fs from 'node:fs';

// Localités de plus de 500 habitants et toutes les communes de France (GeoNames, CC BY 4.0 : server/geo/villes.tsv,
// généré par scripts/villes.mjs, avec la région, l'État ou la province de chacune — server/geo/regions.tsv — et
// leurs noms en français, anglais et allemand). Sert à localiser les photos à la ville près, sans service extérieur :
//   - search(q) : propositions au fil de la frappe (sans accents, début de mot, noms alternatifs des grandes villes) ;
//   - nearest(lat, lon) : ville la plus proche d'une position GPS (on ne garde que la ville, jamais la position).
// Chargée juste après le démarrage en production, sinon à la première utilisation (~250 000 lieux, 2 à 5 s de calcul,
// environ 75 Mo de mémoire) : colonnes compactes et index des débuts de mots, pour répondre en quelques millisecondes.
const FILE = new URL('./villes.tsv', import.meta.url);
const REGION_FILE = new URL('./regions.tsv', import.meta.url);
const LANGS = ['fr', 'en', 'de'];
export const ATTRIBUTION = 'Villes : GeoNames (geonames.org), licence CC BY 4.0';
const REGIONS = Object.fromEntries(['fr', 'en', 'de'].map(l => [l, new Intl.DisplayNames([l], { type: 'region' })]));
export const countryName = (cc, lang = 'fr') => { try { return (REGIONS[lang] || REGIONS.fr).of(cc) || cc; } catch { return cc; } };
const fold = s => s.toLowerCase().replace(/[’'`.\-_/]/g, ' ').replace(/\s+/g, ' ').trim();
export const norm = s => fold(String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
const NON_ASCII = /[^\x00-\x7f]/;

let data = null, building = null;
const SLICE_MS = 20;                                 // durée d'une tranche de preload() avant de rendre la main
// Construction de l'index, par tranches (un générateur) : load() la mène d'un trait (appel synchrone), preload() rend
// la main au serveur entre deux tranches ; l'un peut finir ce que l'autre a commencé. L'index n'est publié qu'une fois
// complet. Les lignes sont lues une à une (pas de tableau de toutes les lignes découpées : 50 Mo de moins au pic).
function* build() {
  const text = fs.readFileSync(FILE, 'utf8');
  const lines = function* () {
    for (let p = 0; p < text.length;) {
      let e = text.indexOf('\n', p);
      if (e < 0) e = text.length;
      if (e > p && text.charCodeAt(p) !== 35) yield text.slice(p, e);
      p = e + 1;
    }
  };
  let n = 0;
  for (let p = 0; p < text.length;) {
    let e = text.indexOf('\n', p);
    if (e < 0) e = text.length;
    if (e > p && text.charCodeAt(p) !== 35) n++;    // 35 : « # »
    p = e + 1;
  }
  yield;
  const id = new Uint32Array(n), pop = new Uint32Array(n), lat = new Float32Array(n), lon = new Float32Array(n);
  const name = new Array(n), cc = new Array(n), key = new Array(n), alt = new Map(), region = new Array(n), local = new Map();
  const regions = new Map();                         // « US.CA » → { name, fr, en, de }
  for (const line of fs.readFileSync(REGION_FILE, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const r = line.split('\t');
    regions.set(r[0], { name: r[1], fr: r[2] || '', en: r[3] || '', de: r[4] || '' });
  }
  const byId = new Map();
  const grid = new Map();                            // cellules de 1° × 1° → lieux, pour nearest()
  const words = new Map();                           // 2 premières lettres d'un mot d'un nom → lieux
  const index = (k, i) => {
    for (const w of k.split(' ')) {
      if (w.length < 1) continue;
      const p = w.slice(0, 2);
      let l = words.get(p);
      if (!l) words.set(p, (l = []));
      if (l.at(-1) !== i) l.push(i);
    }
  };
  let i = 0, since = performance.now();
  for (const line of lines()) {
    const r = line.split('\t');
    id[i] = Number(r[0]); name[i] = r[1]; cc[i] = r[3]; lat[i] = Number(r[4]); lon[i] = Number(r[5]); pop[i] = Number(r[6]) || 0;
    // Clé de recherche : le nom sans accents (le nom ASCII de GeoNames quand il diffère, par exemple pour « Ærøskøbing »).
    const main = NON_ASCII.test(r[1]) ? norm(r[1]) : fold(r[1]);
    const ascii = r[2] ? fold(r[2]) : main;
    key[i] = ascii === main ? main : [main, ascii];
    index(main, i); if (ascii !== main) index(ascii, i);
    region[i] = r[8] ? `${r[3]}.${r[8]}` : '';
    // Noms dans les langues de l'admin (« München ») : affichés selon la langue, et trouvés par la recherche.
    if (r[9] || r[10] || r[11]) local.set(i, { fr: r[9] || '', en: r[10] || '', de: r[11] || '', keys: [r[9], r[10], r[11]].filter(Boolean).map(norm) });
    const others = [...new Set([...(r[7] ? r[7].split(',') : []), r[9], r[10], r[11]].filter(Boolean).map(norm))].filter(o => o !== main && o !== ascii);
    if (others.length) {
      alt.set(i, others);
      for (const o of others) index(o, i);
    }
    byId.set(id[i], i);
    const g = `${Math.floor(lat[i])}:${Math.floor(lon[i])}`;
    let cell = grid.get(g);
    if (!cell) grid.set(g, (cell = []));
    cell.push(i);
    if (++i % 100 === 0 && performance.now() - since > SLICE_MS) { yield; since = performance.now(); }
  }
  yield;
  for (const [p, l] of words) words.set(p, Int32Array.from(l));
  yield;
  for (const [g, l] of grid) grid.set(g, Int32Array.from(l));
  data = { n, id, pop, lat, lon, name, cc, key, alt, byId, grid, words, region, regions, local };
}
function load() {
  if (data) return data;
  building ??= build();
  try { for (const _ of building); } catch (err) { building = null; throw err; }
  return data;
}
// Chargement en arrière-plan (production, juste après le démarrage) : environ 250 000 lieux, 2 à 5 s de calcul au
// total, par tranches d'environ SLICE_MS entre lesquelles le serveur répond. Un appel synchrone entre-temps finit le
// travail d'un coup.
export async function preload() {
  building ??= data ? null : build();
  while (!data && building) {
    try { if (building.next().done) break; } catch (err) { building = null; throw err; }
    await new Promise(r => setImmediate(r));
  }
}

// Libellé sans la région (anciens libellés, et villes sans région connue).
export const label = (c, lang = 'fr') => `${c.name}, ${countryName(c.cc, lang)}`;
// « Monterey, Californie, États-Unis » : la région lève les homonymes ; omise si elle porte le nom de la ville.
function parts(d, i, lang) {
  const nm = d.local.get(i)?.[lang] || d.name[i];
  const r = d.regions.get(d.region[i]);
  const rn = r ? r[lang] || r.name : '';
  return { name: nm, region: rn && norm(rn) !== norm(nm) ? rn : '', country: countryName(d.cc[i], lang) };
}
function view(i, lang = 'fr') {
  const d = load();
  const c = { id: d.id[i], cc: d.cc[i], lat: Math.round(d.lat[i] * 100) / 100, lon: Math.round(d.lon[i] * 100) / 100, pop: d.pop[i] };
  const p = parts(d, i, LANGS.includes(lang) ? lang : 'fr');
  // labels : tous les libellés acceptés quand on tape la ville sans la choisir (trois langues, avec ou sans région).
  const labels = LANGS.flatMap(l => { const q = parts(d, i, l); return [[q.name, q.region, q.country].filter(Boolean).join(', '), `${q.name}, ${q.country}`, q.name]; });
  return { ...c, name: d.name[i], localName: p.name, region: p.region, country: p.country, label: [p.name, p.region, p.country].filter(Boolean).join(', '), labels: [...new Set(labels.concat(`${d.name[i]}, ${countryName(d.cc[i])}`))] };
}

export const byId = (id, lang = 'fr') => { const i = load().byId.get(Number(id)); return i === undefined ? null : view(i, lang); };
// Libellé d'une ville enregistrée sur une photo (city_id, city_name, city_cc), dans la langue voulue.
export const labelOf = (p, lang = 'fr') => (p?.city_id ? byId(p.city_id, lang)?.label : null) || (p?.city_name ? label({ name: p.city_name, cc: p.city_cc }, lang) : '');
// Nom d'une ville dans la langue voulue (carte du site).
export const nameOf = (p, lang = 'fr') => (p?.city_id ? byId(p.city_id, lang)?.localName : null) || p?.city_name || '';
// Une saisie correspond-elle à cette ville (un de ses libellés, dans l'une des langues) ?
export const matches = (c, typed) => { const n = norm(typed); return c.labels.some(l => norm(l) === n); };

// Pertinence : nom exact (le nom, ou son nom en français, anglais ou allemand : « Londres » donne London), nom
// alternatif exact, début du nom, début d'un nom alternatif, début d'un mot du nom ; pondérée par la population, pour
// qu'un hameau homonyme ne passe pas devant une grande ville (« ange » : Angers avant Angé), mais qu'un nom exact passe
// devant un simple nom alternatif (« Monterey » avant Monterrey).
const BONUS = [3.5, 1.5, 2, 0, 0.5];
export function search(q, limit = 8, lang = 'fr') {
  const n = norm(q);
  if (n.length < 2) return [];
  // Candidats : les lieux dont un mot commence comme le premier mot d'au moins deux lettres de la saisie (« L'Aquila »,
  // « A Coruña », « 's-Hertogenbosch » : l'élision ou l'article d'une lettre n'est pas une clé de l'index).
  const w = n.split(' ').find(x => x.length >= 2);
  if (!w) return [];
  const d = load();
  const found = [];
  for (const i of d.words.get(w.slice(0, 2)) || []) {
    const k = d.key[i];
    const names = typeof k === 'string' ? [k] : k;
    const others = d.alt.get(i) || [];
    const own = d.local.get(i)?.keys || [];
    const tier = names.includes(n) || own.includes(n) ? 0 : others.includes(n) ? 1 : names.some(m => m.startsWith(n)) || own.some(m => m.startsWith(n)) ? 2
      : others.some(m => m.startsWith(n)) ? 3 : n.length >= 3 && names.some(m => m.includes(` ${n}`)) ? 4 : -1;
    if (tier >= 0) found.push({ i, score: BONUS[tier] + Math.log10(d.pop[i] + 10) });
  }
  return found.sort((a, b) => b.score - a.score).slice(0, limit).map(f => view(f.i, lang));
}

// Ville d'une position GPS : parmi les villes à moins de 5 km, la plus peuplée (le centre de Paris donne « Paris »,
// pas un arrondissement ; Boulogne garde son nom) ; sinon la plus proche, à 30 km au plus (sinon null : en mer…).
export function nearest(lat, lon, maxKm = 30, cityKm = 5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const d = load();
  const rad = x => (x * Math.PI) / 180;
  const km = i => 2 * 6371 * Math.asin(Math.sqrt(Math.sin(rad(d.lat[i] - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(d.lat[i])) * Math.sin(rad(d.lon[i] - lon) / 2) ** 2));
  let near = -1, closest = -1, closestKm = maxKm;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    for (const i of d.grid.get(`${Math.floor(lat) + dy}:${(((Math.floor(lon) + dx) + 180) % 360 + 360) % 360 - 180}`) || []) {
      const dist = km(i);
      if (dist <= cityKm && (near < 0 || d.pop[i] > d.pop[near])) near = i;
      if (dist < closestKm) { closest = i; closestKm = dist; }
    }
  }
  const best = near >= 0 ? near : closest;
  return best >= 0 ? view(best) : null;
}
