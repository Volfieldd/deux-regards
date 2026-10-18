// Aides des gabarits du site public v2 (views/v2/) : icônes de la planche, format des photos et tailles d'images.

// Icônes au trait de la planche (MQ-00) : 24 unités, trait de 1,6, décoratives (le mot est toujours visible ou lu).
const PATHS = {
  retour: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  bas: '<path d="M6 9l6 6 6-6"/>',
  coche: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
  loupe: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  prec: '<path d="M15 6l-6 6 6 6"/>',
  suiv: '<path d="M9 6l6 6-6 6"/>',
  coeur: '<path d="M12 20.5s-7.5-4.6-9.3-9.3C1.4 7.7 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.2 4.3 6.7-1.8 4.7-9.3 9.3-9.3 9.3z"/>',
  partager: '<path d="M12 15V3M7.5 7.5 12 3l4.5 4.5M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/>',
  plein: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
};
export function ic(name, { size = 20, cls = '', fill = false } = {}) {
  return `<svg class="ic${cls ? ` ${cls}` : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}

// Format d'une photo : rapport largeur / hauteur arrondi au centième pair inférieur, de 0,30 à 4,00 (classes .fmt-* de
// css/v2/public.css) : la place réservée n'est jamais plus large que la photo à la hauteur visée. Un format à moins
// d'un demi-centième du cran supérieur (4 000 × 2 667, pour 3:2) y monte : 2 px de trop en hauteur au plus.
export function fmt(p) {
  const raw = p?.width > 0 && p?.height > 0 ? p.width / p.height : 1.5;
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
export function phoneShares(list) {
  const W = 364, gap = 8 / W;
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
    `(max-width: 767px) calc((100vw - 48px) * ${n2(phoneShares(list)[list.indexOf(item)] ?? 1)})`,
    `(max-width: 1023px) ${share(width[0])}`,
    `(max-width: 1199px) ${share(width[1])}`,
    share(width[2]),
  ].join(', ');
}

// Espaces insécables (lexique des maquettes, § 2) dans un texte venu d'ailleurs (chaînes de la v1, noms) : fine
// insécable avant « : ; ! ? » et dans les guillemets en français ; insécable avant « · » et devant une unité.
export function typo(text, lang = 'fr') {
  let s = String(text ?? '').replace(/ ·/g, '\u00a0·').replace(/(\d) (km|m)\b/g, '$1\u00a0$2');
  if (lang === 'fr') s = s.replace(/ ([:;!?»])/g, '\u202f$1').replace(/« /g, '«\u202f');
  return s;
}
