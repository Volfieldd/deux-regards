// Génère le fond de carte de la page Statistiques (public/admin/carte-monde.svg) et le centre de chaque pays
// (server/pays-centres.json, coordonnées dans le même repère 1000 × 520). À relancer seulement pour changer de
// projection ou de données ; les fichiers produits sont versionnés.
//
// Données : Natural Earth (domaine public), redistribuées par world-atlas (ISC). Outils non installés avec le
// site ; dans un dossier temporaire :
//   npm i world-atlas@2.0.2 topojson-client@3.1.0 d3-geo@3.1.1 i18n-iso-countries@7.11.0
//   node /chemin/du/depot/scripts/carte-monde.mjs   (écrit carte-monde.svg, pays-centres.json, carte-terre.svg et projection.json
//   dans le dossier courant : les copier dans public/admin/, server/, public/ et server/geo/)
import fs from 'node:fs';
import { feature } from 'topojson-client';
import { geoNaturalEarth1, geoPath, geoCentroid, geoArea } from 'd3-geo';
import countries from 'i18n-iso-countries';
const W = 1000, H = 520;
const land110 = JSON.parse(fs.readFileSync('node_modules/world-atlas/land-110m.json'));
const c50 = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-50m.json'));
const land = feature(land110, land110.objects.land);
const projection = geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'Sphere' });
const path = geoPath(projection).digits(1);
const sphere = path({ type: 'Sphere' });
const landD = path(land);
fs.writeFileSync('carte-monde.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">\n<!-- Fond de carte : Natural Earth 1:110m (domaine public), via world-atlas (ISC) ; projection Natural Earth. Généré par scripts/carte-monde.mjs. -->\n<path d="${sphere}" fill="#000" fill-opacity=".04"/>\n<path d="${landD}" fill="#8a8578" fill-opacity=".35"/>\n</svg>\n`);
// Centre de chaque pays : celui de son plus grand territoire (France métropolitaine, pas la Guyane).
const out = {};
for (const f of feature(c50, c50.objects.countries).features) {
  const a2 = countries.numericToAlpha2(f.id);
  if (!a2) continue;
  let g = f.geometry;
  if (g.type === 'MultiPolygon') {
    const parts = g.coordinates.map(c => ({ type: 'Polygon', coordinates: c }));
    g = parts.sort((x, y) => geoArea(y) - geoArea(x))[0];
  }
  const p = projection(geoCentroid(g));
  if (p && Number.isFinite(p[0])) out[a2] = [Math.round(p[0]), Math.round(p[1])];
}
fs.writeFileSync('pays-centres.json', JSON.stringify(out));
// Page publique « Carte » : même fond, en symbole sans couleur (le thème du site la donne), et réglages de la
// projection pour placer les villes côté serveur (server/geo/projection.js).
fs.writeFileSync('carte-terre.svg', `<svg xmlns="http://www.w3.org/2000/svg">\n<!-- Fond de carte : Natural Earth 1:110m (domaine public), via world-atlas (ISC). Généré par scripts/carte-monde.mjs. -->\n<symbol id="terre" viewBox="0 0 ${W} ${H}"><path d="${landD}"/></symbol>\n<symbol id="globe" viewBox="0 0 ${W} ${H}"><path d="${sphere}"/></symbol>\n</svg>\n`);
fs.writeFileSync('projection.json', JSON.stringify({ width: W, height: H, scale: projection.scale(), translate: projection.translate() }));
console.log('pays :', Object.keys(out).length, '| carte :', (fs.statSync('carte-monde.svg').size / 1024).toFixed(0), 'Ko', '| FR', out.FR, 'US', out.US, 'DE', out.DE, 'JP', out.JP, 'SG', out.SG, 'MT', out.MT);
