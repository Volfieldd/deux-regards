import { widthsFor, variantName } from './images.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Construit le <picture> d'une photo : AVIF puis WebP, srcset complet, dimensions explicites.
// `base` : /media/ (public, photos publiées) ou /admin/media/ (aperçu des brouillons).
export function picture(p, { sizes, eager = false, alt = p.title, className = '', base = '/media/' }) {
  const ws = widthsFor(p.width);
  const set = format => ws.map(w => `${base}${variantName(p.file, w, format, p.variant_key)} ${w}w`).join(', ');
  const fallback = `${base}${variantName(p.file, ws[Math.min(1, ws.length - 1)], 'webp', p.variant_key)}`;
  return `<picture${className ? ` class="${className}"` : ''}>`
    + `<source type="image/avif" srcset="${set('avif')}" sizes="${sizes}">`
    + `<img src="${fallback}" srcset="${set('webp')}" sizes="${sizes}" width="${p.width}" height="${p.height}" alt="${esc(alt)}"`
    + `${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></picture>`;
}

// <img> simple d'une vignette en object-fit: cover dans une boîte de w × h px (carte de la fenêtre « Partager ») :
// srcset WebP des tailles de 640 px au plus, et sizes = la largeur que la photo y dessine (plus large que la boîte pour une
// photo plus allongée qu'elle). Sans lui, une seule taille : trop lourde sur un écran ordinaire, ou floue sur un téléphone.
export function coverSet(p, { w, h, base = '/media/' }) {
  const ws = widthsFor(p.width).filter((x, i) => x <= 640 || i === 0);
  return {
    srcset: ws.map(x => `${base}${variantName(p.file, x, 'webp', p.variant_key)} ${x}w`).join(', '),
    sizes: `${Math.ceil(Math.max(w, (h * p.width) / p.height))}px`,
  };
}

// sizes d'une tuile de la planche contact de l'admin (public/admin/admin.css, .contact et .ar-*) : la tuile a la hauteur
// --rowh (190 px au bureau, réglable de 110 à 320 ; 120 px au téléphone) et la largeur de son format, étirée pour remplir
// la rangée (1,6 fois au plus : max-width des .ar-*) ; l'image la couvre (object-fit: cover). Mesuré sur la planche, de
// 320 à 1 440 px de large : une tuile pleine s'étire de 5 à 30 % (une rangée de quatre à huit tuiles), la dernière rangée
// pas du tout. D'où 1,3 × hauteur × format au bureau (1,6 faisait charger la taille au-dessus pour presque toutes les
// tuiles) ; au téléphone, deux ou trois tuiles par rangée s'étirent jusqu'au plafond : 1,6.
// Le curseur « Taille » réécrit ces sizes à la hauteur choisie (admin.js, photos-v2.js : même formule).
export const tileRatio = p => (p.width > 0 && p.height > 0 ? Math.min(300, Math.max(40, Math.round((p.width / p.height) * 20) * 5)) / 100 : 1.5);
export const tileSizes = (p, rowh = 190) => {
  const r = tileRatio(p);
  return `(max-width: 720px) min(calc(100vw - 20px), ${Math.ceil(1.6 * 120 * r)}px), ${Math.ceil(1.3 * rowh * r)}px`;
};
