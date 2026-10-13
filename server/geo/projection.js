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
