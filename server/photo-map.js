import { project, kmPerUnit } from './geo/projection.js';
import { nameOf } from './geo/cities.js';
import { cadrage } from './v2-vues.js';

// Carte de la page d'une photo : où elle a été prise (sa ville), et les autres photos publiées prises à proximité.
// Seulement les photos dont la fiche coche « Afficher sur la carte du monde » (on_map) : jamais de lieu montré sans
// l'accord du photographe. Seule la ville est connue, jamais la position exacte. Calculé ici, en unités du fond de
// carte (1000 × 520) : la carte reste lisible sans JavaScript, cadrée sur la ville et à l'échelle (PLAN point 8, MQ-04).
export const NEAR_KM = 250;                         // au-delà, une photo n'est plus « à proximité »
export const ASPECT = 0.62;                         // hauteur / largeur du cadre de la carte (CSS : aspect-ratio 100 / 62)
// Cadrage minimal, en kilomètres de large (PLAN point 8, MQ-04) : la ville et ses abords, ses côtes. Jamais moins : seul le
// centre de la ville est connu, à 0,01° près (un peu plus d'un kilomètre) ; une carte plus serrée ferait croire à un lieu
// plus précis (docs/wiki/Sécurité.md, « Position des photos »).
export const MIN_KM = 60;
// Cadrage maximal : au-delà, la ville se perdrait parmi ses voisines (leurs noms n'auraient plus la place) ; une photo
// « À proximité » plus lointaine reste dans la liste, avec sa distance, sans pastille.
export const MAX_KM = 300;
const LOC = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' };
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
  // Une pastille par ville ; celle de la photo regroupe les autres photos de la même ville. Toutes les photos proches
  // sont parcourues (une ville très fournie ne cache pas ses voisines) ; au-delà de pins + 1 villes, plus de nouvelle.
  const byCity = new Map();
  for (const n of near) {
    if (!byCity.has(n.p.city_id)) {
      if (byCity.size > pins) continue;
      const [px, py] = project(n.p.city_lat, n.p.city_lon);
      byCity.set(n.p.city_id, { cityId: n.p.city_id, city: nameOf(n.p, lang), x: px, y: py, km: n.km, photos: [] });
    }
    byCity.get(n.p.city_id).photos.push(n.p);
  }
  const sameCity = byCity.get(photo.city_id)?.photos.length || 0;
  byCity.delete(photo.city_id);
  const others = [...byCity.values()].slice(0, pins);
  // Cadrage (celui de la carte du site, v2.cadrage) : centré sur la ville, assez large pour les villes des photos
  // « À proximité » (une marge d'un sixième autour de la plus écartée), de MIN_KM à MAX_KM de large : les villes de la
  // liste entrent de la plus proche à la plus lointaine, tant que le cadre ne dépasse pas MAX_KM.
  const nearList = near.slice(0, list);
  const kmU = kmPerUnit(photo.city_lat);
  const listed = new Set(nearList.map(n => n.p.city_id));
  const frame = places => cadrage(places, { min: MIN_KM / kmU, centre: { x, y }, ratio: ASPECT });
  const framed = [];
  for (const o of others.filter(c => listed.has(c.cityId))) {
    if (frame([...framed, o]).w * kmU > MAX_KM + 0.5) break;
    framed.push(o);
  }
  const view = frame(framed);
  // Les autres villes proches seulement si elles tombent dans le cadre (un lien hors du cadre serait atteint au clavier
  // sans être vu) ; un léger retrait des bords pour que la pastille reste entière.
  const inset = view.w * 0.02;
  const inside = o => o.x > view.x + inset && o.x < view.x + view.w - inset && o.y > view.y + inset && o.y < view.y + view.h - inset;
  const u = view.w / 100;
  // Ni une pastille cachée sous la vignette de la ville (17 px de rayon, cadre de 288 px) : une voisine à deux pas reste
  // dans la liste « À proximité ».
  const sous = o => Math.hypot(((o.x - x) / view.w) * LARGEURS[0], ((o.y - y) / view.h) * LARGEURS[0] * ASPECT) < 20;
  const shown = others.filter(o => inside(o) && !sous(o));
  const scale = echelle(view.w * kmU, lang);
  const meCity = nameOf(photo, lang);
  const pose = placer(view, { x, y, city: meCity }, shown, scale);
  return {
    view, u, r: 4.2 * u, rs: 1.7 * u, fs: 3.6 * u,
    me: { x, y, city: meCity, same: sameCity, label: pose.me },
    others: shown.map((o, i) => ({ ...o, km: Math.round(o.km), href: o.photos[0].slug, label: pose.others[i] })),
    scale: { ...scale, end: pose.end },
    // Vignettes « À proximité » : les plus proches (même ville comprise), avec leur distance.
    list: nearList.map(n => ({ photo: n.p, km: Math.round(n.km), city: nameOf(n.p, lang), same: n.p.city_id === photo.city_id })),
    count: near.length,
  };
}

// Barre d'échelle : la plus longue longueur « ronde » (1, 2 ou 5 × 10ⁿ) qui tient dans le quart du cadre, mesurée le long
// du parallèle de la ville (server/geo/projection.js, kmPerUnit) ; en mètres sous le kilomètre. part : sa longueur en
// fraction de la largeur du cadre, au plus max (la barre se dessine en pourcentage : juste à toutes les largeurs, sans
// script).
export function echelle(widthKm, lang = 'fr', max = 0.25) {
  const target = widthKm * max;
  const p = 10 ** Math.floor(Math.log10(target));
  const len = [5, 2, 1].map(m => m * p).find(v => v <= target);
  const nf = new Intl.NumberFormat(LOC[lang] || LOC.fr, { maximumFractionDigits: 0 });
  const label = len < 1 ? `${nf.format(Math.round(len * 1000))}\u00a0m` : `${nf.format(len)}\u00a0km`;
  return { km: len, part: len / widthKm, label };
}

// Placement des noms sur la mini-carte de la v2 (repères en pixels par-dessus le fond, views/v2/photo.eta) : le cadre
// mesure de 288 px (écran de 320 px) à 400 px de large ; un placement n'est retenu que s'il tient à ces largeurs, sans
// chevaucher la vignette de la ville, son nom, la barre d'échelle, une pastille ni un autre nom. Le nom de la ville
// passe en premier (dessous, sinon dessus) ; la barre prend le coin du bas où elle ne gêne pas (à gauche d'abord) ; une
// voisine sans place pour son nom garde sa pastille et son nom lu (aria-label du lien). Largeur d'un nom estimée par
// excès (Jost 13 px : 7,2 px par signe et le liseré).
export const LARGEURS = [288, 344, 400];
const signe = 7.2, halo = 3;                                                     // halo : le liseré sombre du nom
const large = t => [...String(t)].length * signe + halo * 2;
const chevauche = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
// Boîtes relatives au point (x, y en pixels), [gauche, haut, droite, bas].
const NOM = {
  start: w => [10 - halo, -10, 10 + w, 7], end: w => [-10 - w, -10, -10 + halo, 7],
  top: w => [-w / 2, -24, w / 2, -7], bottom: w => [-w / 2, 7, w / 2, 24],
};
const ICI = { bottom: [21, 39], top: [-40, -22] };                               // nom de la ville : haut et bas
export function placer(view, me, others, scale) {
  const geo = W => {
    const H = W * ASPECT, px = p => [((p.x - view.x) / view.w) * W, ((p.y - view.y) / view.h) * H];
    return { W, H, px, dans: b => b[0] >= 2 && b[1] >= 2 && b[2] <= W - 2 && b[3] <= H - 2 };
  };
  const G = LARGEURS.map(geo);
  const at = (g, p, f, w) => { const [X, Y] = g.px(p); const b = f(w); return [X + b[0], Y + b[1], X + b[2], Y + b[3]]; };
  const placed = G.map(() => []);
  const libreTout = boxes => boxes.every((b, k) => G[k].dans(b) && placed[k].every(o => !chevauche(o.b, b)));
  const poser = (boxes, quoi) => boxes.forEach((b, k) => placed[k].push({ quoi, b }));
  // Vignette de la ville (17 px de rayon) et pastilles des voisines (5 px) : des obstacles fixes.
  poser(G.map(g => at(g, me, () => [-18, -18, 18, 18])), 'ici');
  for (const o of others) poser(G.map(g => at(g, o, () => [-6, -6, 6, 6])), 'pastille');
  // Nom de la ville : dessous, sinon dessus ; centré sur la vignette, sinon aligné sur son centre, d'un côté ou de l'autre.
  const wMe = large(me.city);
  const span = { middle: [-wMe / 2, wMe / 2], start: [-halo, wMe], end: [-wMe, halo] };
  const meBox = (g, pos, anchor) => at(g, me, () => [span[anchor][0], ICI[pos][0], span[anchor][1], ICI[pos][1]]);
  const side = me.x < view.x + view.w / 2 ? ['start', 'end'] : ['end', 'start'];
  const choix = ['bottom', 'top'].flatMap(pos => ['middle', ...side].map(anchor => ({ pos, anchor })));
  // Faute de place, il passe quand même, sur une pastille (dessiné après elles, avec son liseré), jamais hors du cadre.
  const mePose = choix.find(c => libreTout(G.map(g => meBox(g, c.pos, c.anchor))))
    || choix.find(c => G.every(g => g.dans(meBox(g, c.pos, c.anchor)))) || choix[0];
  poser(G.map(g => meBox(g, mePose.pos, mePose.anchor)), 'ville');
  // Barre d'échelle, à 12 px du bord gauche ou droit et 14 px du bas : le trait, puis sa longueur écrite.
  const wBar = large(scale.label);
  const barBox = (g, end) => {
    const len = scale.part * g.W;
    return end ? [g.W - 12 - len - 8 - wBar, g.H - 24, g.W - 12 + 2, g.H - 7] : [12 - 2, g.H - 24, 12 + len + 8 + wBar, g.H - 7];
  };
  const end = !libreTout(G.map(g => barBox(g, false))) && libreTout(G.map(g => barBox(g, true)));
  poser(G.map(g => barBox(g, end)), 'barre');
  // Noms des voisines, de la plus proche à la plus lointaine : d'abord du côté opposé à la ville.
  const labels = others.map(o => {
    const w = large(o.city);
    const first = o.x < me.x ? ['end', 'start'] : ['start', 'end'];
    const pos = [...first, o.y < me.y ? 'top' : 'bottom', o.y < me.y ? 'bottom' : 'top']
      .find(c => libreTout(G.map(g => at(g, o, NOM[c], w))));
    if (pos) poser(G.map(g => at(g, o, NOM[pos], w)), 'nom');
    return pos || null;
  });
  // boites : ce qui a été posé ({ quoi, b }), par largeur (contrôlé par test/minicarte.test.js).
  return { me: mePose, end, others: labels, boites: G.map((g, k) => ({ W: g.W, H: g.H, boxes: placed[k] })) };
}
