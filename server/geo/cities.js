import fs from 'node:fs';

// Villes de plus de 5 000 habitants (GeoNames, CC BY 4.0 : server/geo/villes.tsv, généré par scripts/villes.mjs).
// Sert à localiser les photos à la ville près, sans service extérieur :
//   - search(q) : propositions au fil de la frappe (sans accents, début de mot, noms alternatifs des grandes villes) ;
//   - nearest(lat, lon) : ville la plus proche d'une position GPS (on ne garde que la ville, jamais la position).
// Chargée à la première utilisation (~70 000 villes, quelques Mo en mémoire).
const FILE = new URL('./villes.tsv', import.meta.url);
export const ATTRIBUTION = 'Villes : GeoNames (geonames.org), licence CC BY 4.0';
const REGIONS = new Intl.DisplayNames(['fr'], { type: 'region' });
export const countryName = cc => { try { return REGIONS.of(cc) || cc; } catch { return cc; } };
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`.\-_/]/g, ' ').replace(/\s+/g, ' ').trim();

let data = null;
function load() {
  if (data) return data;
  const list = [];
  const byId = new Map();
  const grid = new Map();                          // cellules de 1° × 1° → villes, pour nearest()
  for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [id, name, ascii, cc, lat, lon, pop, alt] = line.split('\t');
    const c = { id: Number(id), name, cc, lat: Number(lat), lon: Number(lon), pop: Number(pop) || 0 };
    c.keys = [norm(name), norm(ascii || name), ...new Set((alt ? alt.split(',') : []).map(norm))];
    list.push(c);
    byId.set(c.id, c);
    const k = `${Math.floor(c.lat)}:${Math.floor(c.lon)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(c);
  }
  list.sort((a, b) => b.pop - a.pop);              // à égalité de pertinence, la plus peuplée d'abord
  data = { list, byId, grid };
  return data;
}

export const label = c => `${c.name}, ${countryName(c.cc)}`;
const view = c => ({ id: c.id, name: c.name, cc: c.cc, country: countryName(c.cc), lat: c.lat, lon: c.lon, pop: c.pop, label: label(c) });

export const byId = id => { const c = load().byId.get(Number(id)); return c ? view(c) : null; };

// Pertinence : nom exact, début du nom, nom alternatif exact puis début, début d'un mot du nom ;
// à pertinence égale, la ville la plus peuplée.
export function search(q, limit = 8) {
  const n = norm(q);
  if (n.length < 2) return [];
  const tiers = [[], [], [], [], []];
  for (const c of load().list) {
    const [main, ...others] = c.keys;
    const ascii = others[0];
    if (main === n || ascii === n) tiers[0].push(c);
    else if (main.startsWith(n) || ascii?.startsWith(n)) tiers[1].push(c);
    else if (others.includes(n)) tiers[2].push(c);
    else if (others.some(k => k.startsWith(n))) tiers[3].push(c);
    else if (n.length >= 3 && main.includes(` ${n}`)) tiers[4].push(c);
    if (tiers[0].length >= limit) break;
  }
  return tiers.flat().slice(0, limit).map(view);
}

// Ville d'une position GPS : parmi les villes à moins de 5 km, la plus peuplée (le centre de Paris donne « Paris »,
// pas un arrondissement ; Boulogne garde son nom) ; sinon la plus proche, à 30 km au plus (sinon null : en mer…).
export function nearest(lat, lon, maxKm = 30, cityKm = 5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const { grid } = load();
  const rad = x => (x * Math.PI) / 180;
  const km = c => 2 * 6371 * Math.asin(Math.sqrt(Math.sin(rad(c.lat - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(c.lat)) * Math.sin(rad(c.lon - lon) / 2) ** 2));
  let near = null, closest = null, closestKm = maxKm;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    for (const c of grid.get(`${Math.floor(lat) + dy}:${(((Math.floor(lon) + dx) + 180) % 360 + 360) % 360 - 180}`) || []) {
      const d = km(c);
      if (d <= cityKm && (!near || c.pop > near.pop)) near = c;
      if (d < closestKm) { closest = c; closestKm = d; }
    }
  }
  const best = near || closest;
  return best ? view(best) : null;
}
