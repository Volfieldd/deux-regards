// Aides des gabarits du site public v2 (views/v2/) : icônes de la planche, format des photos et tailles d'images.
import { slugify } from './slug.js';

// Icônes au trait de la planche (MQ-00) : 24 unités, trait de 1,6, décoratives (le mot est toujours visible ou lu).
const PATHS = {
  retour: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  bas: '<path d="M6 9l6 6 6-6"/>',
  coche: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  // Formulaires (MQ-05) : erreur (triangle), attente (horloge, limite anti-abus).
  alerte: '<path d="M12 3.8L2.8 20h18.4z"/><path d="M12 10v4.6M12 17.4v.2"/>',
  horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
  loupe: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  prec: '<path d="M15 6l-6 6 6 6"/>',
  suiv: '<path d="M9 6l6 6-6 6"/>',
  coeur: '<path d="M12 20.5s-7.5-4.6-9.3-9.3C1.4 7.7 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.2 4.3 6.7-1.8 4.7-9.3 9.3-9.3 9.3z"/>',
  partager: '<path d="M12 15V3M7.5 7.5 12 3l4.5 4.5M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/>',
  plein: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  lire: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.2"/>',
  // Flux RSS des Carnets (MQ-11, repère 7).
  flux: '<path d="M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8"/><circle cx="6" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
};
export function ic(name, { size = 20, cls = '', fill = false } = {}) {
  return `<svg class="ic${cls ? ` ${cls}` : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}

// Format d'une photo : rapport largeur / hauteur arrondi au centième pair inférieur, de 0,30 à 4,00 (classes .fmt-* de
// css/v2/public.css) : la place réservée n'est jamais plus large que la photo à la hauteur visée. Un format à moins
// d'un demi-centième du cran supérieur (4 000 × 2 667, pour 3:2) y monte : 2 px de trop en hauteur au plus.
// Les formats courants que les centièmes pairs ne disent pas (2:3, 3:4, 4:3, 5:4, 16:9, 9:16, 5:7) ont leur classe
// exacte (.fmt-2x3…) : dans une rangée, une verticale 2:3 et une horizontale 3:2 ont alors la même hauteur au pixel près
// (au centième pair, la verticale était 1 % plus basse et son cartel décalé de 3 px).
const EXACTS = [[2, 3], [3, 4], [4, 3], [5, 4], [16, 9], [9, 16], [5, 7]];
export function fmt(p) {
  const raw = p?.width > 0 && p?.height > 0 ? p.width / p.height : 1.5;
  const exact = EXACTS.find(([a, b]) => Math.abs(raw / (a / b) - 1) < 0.004);
  if (exact) return { r: Number((exact[0] / exact[1]).toFixed(4)), cls: `fmt-${exact[0]}x${exact[1]}`, vertical: raw < 1 };
  const r = Math.min(4, Math.max(0.3, Math.floor((raw + 0.005) * 50) / 50));
  const n = Math.round(r * 100);
  return { r, cls: `fmt-${n}`, vertical: raw < 1 };
}

// Ce qui reste de la hauteur de l'écran sous la photo (en-tête, marges, cartel, flèches), palier par palier : les
// valeurs de css/v2/public.css (§ 20, --vis-reste ; § 30 pour une verticale, le cartel à côté).
const RESTE = { tel: 191, tablette: 267, bureau: 191 };
const RESTE_COTE = { tablette: 170, bureau: 120 };
const n2 = x => Number(x.toFixed(2));

// sizes de la photo de la visionneuse : la place qu'elle aura, d'après la largeur ET la hauteur de l'écran (et non
// « 100vw », qui chargeait le plus grand fichier partout). Marges : 2 × --gut (40 puis 56 px), et au-delà de 1 200 px
// la place des flèches (160 px en tout) ; hauteur visée de 900 px au plus.
export function visSizes({ r, vertical }) {
  const t = vertical ? RESTE_COTE.tablette : RESTE.tablette;
  const b = vertical ? RESTE_COTE.bureau : RESTE.bureau;
  const h = reste => `calc((100vh - ${reste}px) * ${n2(r)})`;
  return [
    `(max-width: 767px) min(100vw, ${h(RESTE.tel)})`,
    `(max-width: 1023px) min(calc(100vw - 80px), ${h(t)}, ${Math.round(900 * r)}px)`,
    `(max-width: 1199px) min(calc(100vw - 112px), ${h(t)}, ${Math.round(900 * r)}px)`,
    `min(calc(100vw - 160px), ${h(b)}, ${Math.round(900 * r)}px)`,
  ].join(', ');
}

// sizes d'une vignette de « À proximité » (rangée étirée, § 18) : au-delà du téléphone, toutes sur une ligne, chacune au
// prorata de son format dans la largeur du bloc (celle de la photo, ou 1 064 px au plus à côté d'une verticale) ; au
// téléphone, sa place dans les rangées (phoneShares).
// Au téléphone (< 768 px), la place d'une photo dans les rangées de css/v2/public.css (§ 6 et § 18) : hauteur visée 40 %
// de la largeur W de la rangée, deux photos au plus par ligne (.v + .v + li et .c à 47 % au moins, .v à la moitié au
// plus), lignes étirées au prorata des formats, dernière ligne à sa taille. Calculé une fois, en fraction de W (pour
// W = 364 px, un Pixel 7 : l'écart de 8 px y pèse 2,2 %), comme outils/sizes-tel.py des maquettes.
// Petit téléphone (moins de 360 px, --gut de 16 px) : la même composition pour W = 288 px (un écran de 320 px), où l'écart
// de 8 px pèse plus et coupe les lignes ailleurs ; sans elle, une vignette de 140 px y était chargée en 160 px pour un écran
// de densité 2 (floue), dès que les vignettes de 160 px ont existé.
const shares = new WeakMap();        // liste → parts (calculées une fois par liste, et non une fois par photo)
export function phoneShares(list, W = 364) {
  if (!shares.has(list)) shares.set(list, new Map());
  const memo = shares.get(list);
  if (!memo.has(W)) memo.set(W, composeShares(list, W));
  return memo.get(W);
}
// Les deux conditions du téléphone d'un sizes : moins de 360 px (marges de 16 px), puis jusqu'à 767 px (marges de 24 px).
const phoneConds = (list, i) => `(max-width: 359px) calc((100vw - 32px) * ${n2(phoneShares(list, 288)[i] ?? 1)}), `
  + `(max-width: 767px) calc((100vw - 48px) * ${n2(phoneShares(list)[i] ?? 1)})`;
function composeShares(list, W) {
  const gap = 8 / W;
  const items = list.map((x, i) => {
    const { r } = fmt(x);
    const v = r < 1, c = r === 1, afterTwoV = i >= 2 && fmt(list[i - 1]).r < 1 && fmt(list[i - 2]).r < 1;
    const min = c || afterTwoV ? 0.47 : 0, max = v ? 0.5 - 4 / W : Infinity;
    return { r, min, max, base: Math.min(max, Math.max(min, 0.4 * r)) };
  });
  const lines = [];
  let line = [], used = 0;
  for (const it of items) {
    const need = (line.length ? gap : 0) + it.base;
    if (line.length && used + need > 1 + 1e-9) { lines.push(line); line = []; used = 0; }
    used += (line.length ? gap : 0) + it.base;
    line.push(it);
  }
  if (line.length) lines.push(line);
  return lines.flatMap((l, k) => {
    if (k === lines.length - 1) return l.map(it => it.base);               // dernière ligne : ::after prend le reste
    let sizes = l.map(it => it.base), frozen = l.map(() => false);
    for (let pass = 0; pass < l.length; pass++) {                           // répartition avec plafonds (max-width)
      const free = 1 - gap * (l.length - 1) - sizes.reduce((a, b) => a + b, 0);
      const grow = l.reduce((a, it, j) => a + (frozen[j] ? 0 : it.r), 0);
      if (free <= 1e-9 || !grow) break;
      sizes = sizes.map((w, j) => (frozen[j] ? w : w + free * l[j].r / grow));
      let capped = false;
      sizes = sizes.map((w, j) => { if (!frozen[j] && w > l[j].max) { frozen[j] = true; capped = true; return l[j].max; } return w; });
      if (!capped) break;
    }
    return sizes;
  });
}

export function nearSizes(item, list, main) {
  const sum = list.reduce((s, x) => s + fmt(x).r, 0) || 1;
  const k = n2(fmt(item).r / sum);
  const gaps = (list.length - 1) * 16;
  const width = main.vertical
    ? ['min(calc(100vw - 80px), 1064px)', 'min(calc(100vw - 112px), 1064px)', 'min(calc(100vw - 144px), 1064px)']
    : [`min(calc(100vw - 80px), calc((100vh - 267px) * ${n2(main.r)}))`, `min(calc(100vw - 112px), calc((100vh - 267px) * ${n2(main.r)}))`, `min(calc(100vw - 160px), calc((100vh - 191px) * ${n2(main.r)}), ${Math.round(900 * main.r)}px)`];
  const share = w => `calc((${w} - ${gaps}px) * ${k})`;
  return [
    phoneConds(list, list.indexOf(item)),
    `(max-width: 1023px) ${share(width[0])}`,
    `(max-width: 1199px) ${share(width[1])}`,
    share(width[2]),
  ].join(', ');
}

// sizes d'une vignette des rangées de la galerie et d'une série (css/v2/public.css § 6) : la place que la photo aura
// vraiment. Au téléphone, sa part de la rangée (phoneShares). Au-delà, les rangées se composent comme le navigateur les
// compose (flex-wrap : une photo passe à la ligne quand sa largeur de base, format × hauteur visée, ne tient plus ;
// chaque rangée s'étire au prorata des formats, sauf la dernière) ; on refait cette composition pour chaque largeur
// d'écran d'une plage, de 8 en 8 px, et l'on garde la plus grande largeur atteinte par la photo (arrondie aux 5 px
// supérieurs) : jamais trop petite, et une photo de la dernière rangée, qui ne s'étire pas, n'est pas chargée trop grande.
// Plages : celles des marges (--gut) et de la hauteur visée (200 px sur tablette, 240 au bureau), la tablette en deux
// (une même photo y passe de la moitié au tiers de la rangée).
// within : la largeur du bloc, si ce n'est pas la page (une galerie dans la colonne large d'un billet des Carnets).
// etiree : rangée étirée sur une ligne (séries, « Autres séries », § 18) : chaque photo y prend exactement la largeur
// du bloc (écran moins les marges et les écarts de 16 px) au prorata de son format.
const up5 = x => Math.ceil(x / 5) * 5;
const PLAGES = [{ to: 895, from: 768, gut: 40, h: 200 }, { to: 1023, from: 896, gut: 40, h: 200 }, { to: 1279, from: 1024, gut: 56, h: 200 }, { to: 1599, from: 1280, gut: 72, h: 240 }, { to: 2560, from: 1600, gut: 72, h: 240 }];
function rows(rs, W, h, gap = 16) {
  const w = new Array(rs.length), lines = [];
  let line = [], used = 0;
  rs.forEach((r, i) => {
    const need = (line.length ? gap : 0) + r * h;
    if (line.length && used + need > W + 1e-6) { lines.push(line); line = []; used = 0; }
    used += (line.length ? gap : 0) + r * h;
    line.push(i);
  });
  if (line.length) lines.push(line);
  lines.forEach((l, k) => {
    const sum = l.reduce((a, i) => a + rs[i], 0), free = W - gap * (l.length - 1) - sum * h;
    l.forEach(i => { w[i] = k === lines.length - 1 ? rs[i] * h : rs[i] * h + free * rs[i] / sum; });
  });
  return w;
}
// Tranches de 128 px au plus dans chaque plage : la plus grande largeur d'une photo sur toute une plage (1 280 à 1 599 px)
// est souvent celle d'une autre composition des rangées que celle de l'écran ; avec les vignettes de 160 et 480 px, ce
// surplus faisait charger la taille au-dessus (640 au lieu de 480). Même calcul, sur des tranches plus étroites ; deux
// tranches voisines de même largeur n'en font qu'une dans le sizes.
const TRANCHE = 128;
const TRANCHES = PLAGES.flatMap(p => {
  const out = [];
  for (let from = p.from; from <= p.to; from += TRANCHE) out.push({ ...p, from, to: Math.min(p.to, from + TRANCHE - 1) });
  return out;
});
const widest = new WeakMap();        // liste → largeur la plus grande de chaque photo, par tranche (calculée une fois)
// within(vw, gut) : la largeur du bloc des rangées pour un écran de vw px (par défaut, la page moins ses marges).
const pageWidth = (vw, gut) => vw - 2 * gut;
function widths(list, within = pageWidth) {
  if (!widest.has(list)) widest.set(list, new Map());
  const memo = widest.get(list);
  if (!memo.has(within)) {
    const rs = list.map(x => fmt(x).r);
    memo.set(within, TRANCHES.map(({ from, to, gut, h }) => {
      const max = rs.map(() => 0);
      for (let vw = from; vw <= to; vw += 8) rows(rs, within(vw, gut), h).forEach((x, i) => { max[i] = Math.max(max[i], x); });
      // la dernière largeur de la tranche, si le pas de 8 px l'a sautée
      if ((to - from) % 8) rows(rs, within(to, gut), h).forEach((x, i) => { max[i] = Math.max(max[i], x); });
      return max.map(up5);
    }));
  }
  return memo.get(within);
}
// Colonne large d'un billet (css/v2/carnet.css, .billet > .f-large) : de 1 024 px, 10 colonnes sur 12 (écarts de 24 px) ;
// en dessous, toute la largeur de la page.
export const billetLarge = (vw, gut) => (vw >= 1024 ? ((vw - 2 * gut - 11 * 24) / 12) * 10 + 9 * 24 : vw - 2 * gut);
export function rowSizes(item, list, { etiree = false, within } = {}) {
  const { r } = fmt(item), i = list.indexOf(item);
  const phone = phoneConds(list, i);
  if (etiree) {
    const k = n2(r / (list.reduce((s, x) => s + fmt(x).r, 0) || 1)), gaps = (list.length - 1) * 16;
    const share = gut => `calc((100vw - ${2 * gut + gaps}px) * ${k})`;
    return [phone, `(max-width: 1023px) ${share(40)}`, `(max-width: 1279px) ${share(56)}`, share(72)].join(', ');
  }
  const w = widths(list, within).map(p => p[i]);
  // Une condition par tranche, sauf quand la suivante a la même largeur (elle la prolonge) ; la dernière, sans condition.
  const conds = TRANCHES.slice(0, -1).map((p, k) => (w[k] === w[k + 1] ? null : `(max-width: ${p.to}px) ${w[k]}px`)).filter(Boolean);
  return [phone, ...conds, `${w.at(-1)}px`].join(', ');
}

// sizes de la photo de l'ouverture (css/v2/public.css § 19) : le cadre a la hauteur de l'écran moins l'en-tête et la
// promesse (300 px au téléphone, 272 sur tablette, 228 au bureau ; 300 px au moins, 860 au plus) au format le plus large
// de la liste (frame), dans la largeur de la page ; une photo plus étroite y tient à sa hauteur (part = son format / frame).
export function ouvSizes(frame, part = 1) {
  const k = n2(Math.min(1, part));
  const h = reste => `calc(max(300px, 100vh - ${reste}px) * ${n2(frame)})`;
  const w = (marge, reste) => `min(calc(100vw - ${marge}px), ${h(reste)}, ${Math.round(860 * frame)}px)`;
  const at = x => (k === 1 ? x : `calc(${x} * ${k})`);
  return [`(max-width: 359px) ${at(w(32, 300))}`, `(max-width: 767px) ${at(w(48, 300))}`, `(max-width: 1023px) ${at(w(80, 272))}`,
    `(max-width: 1279px) ${at(w(112, 272))}`, at(w(144, 228))].join(', ');
}

// Texte échappé pour un fragment HTML écrit en JavaScript dans un gabarit (cartel de l'ouverture, dans un <template>).
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Un titre de vignette ne se coupe jamais dans un mot composé (« d’après-midi », « contre-jour », lexique § 0.4) : le
// texte échappé, chaque mot à trait d'union dans un <span class="nobr">. À écrire avec <%~ … %>.
export const nobr = s => esc(s).replace(/[\p{L}\p{N}’']+(?:-[\p{L}\p{N}’']+)+/gu, m => `<span class="nobr">${m}</span>`);

// Espaces insécables (lexique des maquettes, § 2) dans un texte venu d'ailleurs (chaînes de la v1, noms) : fine
// insécable avant « : ; ! ? » et dans les guillemets en français ; insécable avant « · » et devant une unité.
export function typo(text, lang = 'fr') {
  let s = String(text ?? '').replace(/ ·/g, '\u00a0·').replace(/(\d) (km|m|cm|mm|min|g)\b/g, '$1\u00a0$2');
  if (lang === 'fr') s = s.replace(/ ([:;!?»])/g, '\u202f$1').replace(/« /g, '«\u202f');
  return s;
}

// Texte d'intention d'une série (MQ-03) : ses deux premières phrases (head), puis le reste (rest, « Lire la suite » au
// téléphone). La coupe tombe à la fin d'une phrase : un point, un point d'exclamation ou d'interrogation, des points de
// suspension (un guillemet ou une parenthèse fermants peuvent suivre), puis une espace ; « 1.5 » ne coupe pas.
export function intentParts(text, n = 2) {
  const parts = String(text ?? '').trim().split(/(?<=[.!?…][»”"’)\]]?)\s+/u).filter(Boolean);
  return { head: parts.slice(0, n).join(' '), rest: parts.slice(n).join(' ') };
}

// Ancre d'un intertitre (sommaire des pages de texte) : son texte en adresse (« Qui est responsable » → qui-est-responsable),
// numérotée si deux intertitres se ressemblent. ids : l'ensemble des ancres déjà prises dans la page.
// Le prochain numéro de chaque ancre est gardé par ensemble (Map) : linéaire même pour des milliers d'intertitres identiques
// (revue de sécurité des Carnets : la recherche pas à pas était quadratique).
const nextOf = new WeakMap();
export function ancre(text, ids = new Set()) {
  const base = slugify(String(text ?? '')) || 'partie';
  let counters = nextOf.get(ids);
  if (!counters) { counters = new Map(); nextOf.set(ids, counters); }
  let i = counters.get(base) ?? 1;
  let id = i === 1 ? base : `${base}-${i}`;
  while (ids.has(id)) { i += 1; id = `${base}-${i}`; }
  counters.set(base, i + 1);
  ids.add(id);
  return id;
}

// Position d'un repère dans un cadre de carte, en pourcentage (repères en pixels posés par-dessus le fond, comme la
// mini-carte de la visionneuse) : les noms et les vignettes gardent leur taille quand la carte rétrécit.
export const pct = (v, from, size) => Number((((v - from) / size) * 100).toFixed(3));

// Cadrage de la carte du monde (UX-F-25) : l'ensemble des lieux et une marge d'un sixième du cadre de chaque côté (la
// vignette d'une ville, 16 px de rayon et son nombre, tient entière dans le cadre de 150 px de haut d'un écran de 320 px),
// au format du fond (1000 × 520), dans ses limites ; une seule ville reste située (60 unités, environ 22° de longitude).
// Calculé par le serveur : la carte s'ouvre cadrée avec ou sans script ; « Monde » (avec script) montre le monde entier.
export function cadrage(places, { W = 1000, H = 520, min = 60 } = {}) {
  if (!places.length) return { x: 0, y: 0, w: W, h: H };
  const xs = places.map(p => p.x), ys = places.map(p => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let w = Math.max(min, (Math.max(...xs) - Math.min(...xs)) * 1.5, ((Math.max(...ys) - Math.min(...ys)) * 1.5 * W) / H);
  w = Math.min(W, w);
  const h = (w * H) / W;
  const r = n => Number(n.toFixed(2));
  return { x: r(Math.min(W - w, Math.max(0, cx - w / 2))), y: r(Math.min(H - h, Math.max(0, cy - h / 2))), w: r(w), h: r(h) };
}
