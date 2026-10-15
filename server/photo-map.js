import { project, MAP } from './geo/projection.js';
import { nameOf } from './geo/cities.js';

// Carte de la page d'une photo : où elle a été prise (sa ville), et les autres photos publiées prises à proximité.
// Seulement les photos dont la fiche coche « Afficher sur la carte du monde » (on_map) : jamais de lieu montré sans
// l'accord du photographe. Seule la ville est connue, jamais la position exacte. Calculé ici, en unités du fond de
// carte (1000 × 520) : la carte reste lisible sans JavaScript.
export const NEAR_KM = 250;                         // au-delà, une photo n'est plus « à proximité »
const ASPECT = 0.62;                                // hauteur / largeur de la carte
const MIN_W = 14;                                   // cadrage minimal (~5° de longitude) : la ville reste située (côtes, voisines)
const MAX_W = 60;
const rad = x => (x * Math.PI) / 180;
export const km = (a, b) => 2 * 6371 * Math.asin(Math.sqrt(Math.sin(rad(b.city_lat - a.city_lat) / 2) ** 2
  + Math.cos(rad(a.city_lat)) * Math.cos(rad(b.city_lat)) * Math.sin(rad(b.city_lon - a.city_lon) / 2) ** 2));
const located = p => p && p.on_map && p.city_id && Number.isFinite(p.city_lat) && Number.isFinite(p.city_lon);

export function photoMap(photo, published, lang, { pins = 12, list = 6 } = {}) {
  if (!located(photo)) return null;
  const [x, y] = project(photo.city_lat, photo.city_lon);
  // Autres photos situées, de la plus proche à la plus lointaine (même ville d'abord), dans le rayon.
  const near = published.filter(p => p.id !== photo.id && located(p)).map(p => ({ p, km: km(photo, p) }))
    .filter(n => n.km <= NEAR_KM).sort((a, b) => a.km - b.km || a.p.id - b.p.id);
  // Une pastille par ville ; celle de la photo regroupe les autres photos de la même ville.
  const byCity = new Map();
  for (const n of near.slice(0, 60)) {
    if (!byCity.has(n.p.city_id)) {
      const [px, py] = project(n.p.city_lat, n.p.city_lon);
      byCity.set(n.p.city_id, { cityId: n.p.city_id, city: nameOf(n.p, lang), x: px, y: py, km: n.km, photos: [] });
    }
    byCity.get(n.p.city_id).photos.push(n.p);
  }
  const sameCity = byCity.get(photo.city_id)?.photos.length || 0;
  byCity.delete(photo.city_id);
  const others = [...byCity.values()].slice(0, pins);
  // Cadrage : centré sur la photo, assez large pour ses voisines, dans les limites du fond.
  const reach = Math.max(0, ...others.map(o => Math.max(Math.abs(o.x - x), Math.abs(o.y - y) / ASPECT)));
  const w = Math.min(MAX_W, Math.max(MIN_W, reach * 3));
  const h = w * ASPECT;
  const view = { w, h, x: Math.min(MAP.width - w, Math.max(0, x - w / 2)), y: Math.min(MAP.height - h, Math.max(0, y - h / 2)) };
  const u = w / 100;
  return {
    view, u, r: 4.2 * u, rs: 1.7 * u, fs: 3.6 * u,
    me: { x, y, city: nameOf(photo, lang), same: sameCity },
    others: others.map(o => ({ ...o, km: Math.round(o.km), href: o.photos[0].slug })),
    // Vignettes « À proximité » : les plus proches (même ville comprise), avec leur distance.
    list: near.slice(0, list).map(n => ({ photo: n.p, km: Math.round(n.km), city: nameOf(n.p, lang), same: n.p.city_id === photo.city_id })),
    count: near.length,
  };
}
