import fs from 'node:fs';

// Localités de plus de 500 habitants et toutes les communes de France (GeoNames, CC BY 4.0 : server/geo/villes.tsv,
// généré par scripts/villes.mjs). Sert à localiser les photos à la ville près, sans service extérieur :
//   - search(q) : propositions au fil de la frappe (sans accents, début de mot, noms alternatifs des grandes villes) ;
//   - nearest(lat, lon) : ville la plus proche d'une position GPS (on ne garde que la ville, jamais la position).
// Chargée à la première utilisation (~250 000 lieux) : colonnes compactes et index des débuts de mots, pour tenir en
// peu de mémoire et répondre en quelques millisecondes.
const FILE = new URL('./villes.tsv', import.meta.url);
export const ATTRIBUTION = 'Villes : GeoNames (geonames.org), licence CC BY 4.0';
const REGIONS = Object.fromEntries(['fr', 'en', 'de'].map(l => [l, new Intl.DisplayNames([l], { type: 'region' })]));
export const countryName = (cc, lang = 'fr') => { try { return (REGIONS[lang] || REGIONS.fr).of(cc) || cc; } catch { return cc; } };
const fold = s => s.toLowerCase().replace(/[’'`.\-_/]/g, ' ').replace(/\s+/g, ' ').trim();
export const norm = s => fold(String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
const NON_ASCII = /[^\x00-\x7f]/;

let data = null;
function load() {
  if (data) return data;
  const rows = [];
  for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    rows.push(line.split('\t'));
  }
  const n = rows.length;
  const id = new Uint32Array(n), pop = new Uint32Array(n), lat = new Float32Array(n), lon = new Float32Array(n);
  const name = new Array(n), cc = new Array(n), key = new Array(n), alt = new Map();
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
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    id[i] = Number(r[0]); name[i] = r[1]; cc[i] = r[3]; lat[i] = Number(r[4]); lon[i] = Number(r[5]); pop[i] = Number(r[6]) || 0;
    // Clé de recherche : le nom sans accents (le nom ASCII de GeoNames quand il diffère, par exemple pour « Ærøskøbing »).
    const main = NON_ASCII.test(r[1]) ? norm(r[1]) : fold(r[1]);
    const ascii = r[2] ? fold(r[2]) : main;
    key[i] = ascii === main ? main : [main, ascii];
    index(main, i); if (ascii !== main) index(ascii, i);
    if (r[7]) {
      const others = [...new Set(r[7].split(',').map(norm))];
      alt.set(i, others);
      for (const o of others) index(o, i);
    }
    byId.set(id[i], i);
    const g = `${Math.floor(lat[i])}:${Math.floor(lon[i])}`;
    let cell = grid.get(g);
    if (!cell) grid.set(g, (cell = []));
    cell.push(i);
  }
  for (const [p, l] of words) words.set(p, Int32Array.from(l));
  for (const [g, l] of grid) grid.set(g, Int32Array.from(l));
  data = { n, id, pop, lat, lon, name, cc, key, alt, byId, grid, words };
  return data;
}

export const label = c => `${c.name}, ${countryName(c.cc)}`;
function view(i) {
  const d = load();
  const c = { id: d.id[i], name: d.name[i], cc: d.cc[i], lat: Math.round(d.lat[i] * 100) / 100, lon: Math.round(d.lon[i] * 100) / 100, pop: d.pop[i] };
  return { ...c, country: countryName(c.cc), label: label(c) };
}

export const byId = id => { const i = load().byId.get(Number(id)); return i === undefined ? null : view(i); };

// Pertinence : nom exact (ou nom alternatif exact : « Londres » donne London), début du nom, début d'un nom
// alternatif, début d'un mot du nom ; pondérée par la population, pour qu'un hameau homonyme ne passe pas devant une
// grande ville (« ange » : Angers avant Angé).
const BONUS = [2.5, 2, 0, 0.5];
export function search(q, limit = 8) {
  const n = norm(q);
  if (n.length < 2) return [];
  const d = load();
  const found = [];
  for (const i of d.words.get(n.slice(0, 2)) || []) {
    const k = d.key[i];
    const names = typeof k === 'string' ? [k] : k;
    const others = d.alt.get(i) || [];
    const tier = names.includes(n) || others.includes(n) ? 0 : names.some(m => m.startsWith(n)) ? 1
      : others.some(m => m.startsWith(n)) ? 2 : n.length >= 3 && names.some(m => m.includes(` ${n}`)) ? 3 : -1;
    if (tier >= 0) found.push({ i, score: BONUS[tier] + Math.log10(d.pop[i] + 10) });
  }
  return found.sort((a, b) => b.score - a.score).slice(0, limit).map(f => view(f.i));
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
