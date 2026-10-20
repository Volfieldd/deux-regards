import fs from 'node:fs';

// Projection Natural Earth I (celle du fond de carte), sans bibliothèque : place une ville (latitude, longitude)
// dans le repère 1000 × 520 du fond (public/carte-terre.svg). Échelle et décalage : server/geo/projection.json,
// produits par scripts/carte-monde.mjs avec d3-geo (même formule que d3.geoNaturalEarth1).
const P = JSON.parse(fs.readFileSync(new URL('./projection.json', import.meta.url), 'utf8'));
export const MAP = { width: P.width, height: P.height };

export function project(lat, lon) {
  const lambda = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const phi2 = phi * phi;
  const phi4 = phi2 * phi2;
  const x = lambda * (0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4)));
  const y = phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
  return [Math.round((P.translate[0] + P.scale * x) * 10) / 10, Math.round((P.translate[1] - P.scale * y) * 10) / 10];
}

// Échelle du fond le long d'un parallèle : kilomètres par unité de carte, à la latitude donnée. Natural Earth I n'est ni
// conforme ni équivalente, mais x y est proportionnel à la longitude (x = λ · f(φ)) : le long du parallèle de la ville,
// une unité vaut exactement R cos φ / (échelle · f(φ)). C'est la mesure de la barre d'échelle des mini-cartes
// (server/photo-map.js), horizontale comme elle ; à l'équateur 41,3 km, à Lisbonne 34,7 km, à Oslo 25,3 km.
const R_KM = 6371;
export function kmPerUnit(lat) {
  const phi = (Math.max(-89, Math.min(89, lat)) * Math.PI) / 180;
  const phi2 = phi * phi;
  const phi4 = phi2 * phi2;
  const f = 0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4));
  return (R_KM * Math.cos(phi)) / (P.scale * f);
}
