import { widthsFor, variantName } from './images.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Construit le <picture> d'une photo : AVIF puis WebP, srcset complet, dimensions explicites.
// `base` : /media/ (public, photos publiées) ou /admin/media/ (aperçu des brouillons).
export function picture(p, { sizes, eager = false, alt = p.title, className = '', base = '/media/' }) {
  const ws = widthsFor(p.width);
  const set = format => ws.map(w => `${base}${variantName(p.file, w, format)} ${w}w`).join(', ');
  const fallback = `${base}${variantName(p.file, ws[Math.min(1, ws.length - 1)], 'webp')}`;
  return `<picture${className ? ` class="${className}"` : ''}>`
    + `<source type="image/avif" srcset="${set('avif')}" sizes="${sizes}">`
    + `<img src="${fallback}" srcset="${set('webp')}" sizes="${sizes}" width="${p.width}" height="${p.height}" alt="${esc(alt)}"`
    + `${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></picture>`;
}
