import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const FONTS_DIR = fileURLToPath(new URL('../assets/fonts/', import.meta.url));

// Polices du site en TTF (assets/fonts) : le rendu ne dépend pas des polices installées sur le serveur.
export const FONTS = {
  sans: { label: 'Jost (sans empattement)', family: 'Filigrane Sans', file: 'Filigrane-Sans.ttf' },
  serif: { label: 'Cormorant Garamond italique', family: 'Filigrane Serif', file: 'Filigrane-Serif.ttf' },
  mono: { label: 'IBM Plex Mono', family: 'Filigrane Mono', file: 'Filigrane-Mono.ttf' },
};
export const POSITIONS = {
  'haut-gauche': 'En haut à gauche', haut: 'En haut', 'haut-droite': 'En haut à droite',
  gauche: 'À gauche', centre: 'Au centre', droite: 'À droite',
  'bas-gauche': 'En bas à gauche', bas: 'En bas', 'bas-droite': 'En bas à droite',
  mosaique: 'Mosaïque (répété en diagonale)',
};
const TONES = { light: '#ffffff', dark: '#111111' };

const markup = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Multiplie la couche alpha (opacité globale du filigrane, 0–100).
async function withOpacity(png, opacity) {
  const a = Math.round(255 * Math.min(Math.max(opacity, 0), 100) / 100);
  return sharp(png).ensureAlpha()
    .composite([{ input: Buffer.from([255, 255, 255, a]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }])
    .png().toBuffer();
}

// Filigrane seul, en PNG transparent, à la largeur voulue (texte rendu par Pango avec une police du site).
// Le filigrane tient toujours dans la boîte targetWidth × maxHeight : jamais d'agrandissement démesuré
// (logo très étiré, texte haut), donc pas d'image intermédiaire géante.
async function stamp(mark, targetWidth, maxHeight) {
  const box = { width: targetWidth, height: Math.max(1, maxHeight), fit: 'inside' };
  let src;
  if (mark.kind === 'image') {
    src = await sharp(mark.imagePath, { limitInputPixels: 16_000_000 }).resize(box).png().toBuffer();
  } else {
    const font = FONTS[mark.font] || FONTS.sans;
    src = await sharp({
      text: {
        text: `<span foreground="${TONES[mark.tone] || TONES.light}">${markup(mark.text)}</span>`,
        font: `${font.family}, 160`, fontfile: path.join(FONTS_DIR, font.file), rgba: true, dpi: 72,
      },
    }).png().toBuffer();
    src = await sharp(src).resize(box).png().toBuffer();
  }
  return withOpacity(src, mark.opacity);
}

// Calques à passer à sharp().composite() pour une variante de w × h pixels.
export async function overlayFor(mark, w, h) {
  const width = Math.max(8, Math.round((w * mark.size) / 100));
  let img = await stamp(mark, width, h);
  let { width: sw, height: sh } = await sharp(img).metadata();
  // Jamais plus grand que la variante (texte très long, image en hauteur…).
  if (sw > w || sh > h) {
    img = await sharp(img).resize({ width: w, height: h, fit: 'inside' }).png().toBuffer();
    ({ width: sw, height: sh } = await sharp(img).metadata());
  }

  if (mark.position === 'mosaique') {
    // Motif tourné de 30°, espacé d'environ une demi-largeur, répété sur toute l'image.
    const rotated = await sharp(img).rotate(-30, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const m = await sharp(rotated).metadata();
    const gap = Math.round(m.width * 0.5);
    let tile = await sharp(rotated).extend({ top: gap, bottom: gap, left: gap, right: gap, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const t = await sharp(tile).metadata();
    if (t.width > w || t.height > h) tile = await sharp(tile).resize({ width: w, height: h, fit: 'inside' }).png().toBuffer();
    return [{ input: tile, tile: true }];
  }

  const margin = Math.round((w * mark.margin) / 100);
  const [v, hz] = mark.position === 'centre' ? ['centre', 'centre']
    : mark.position.includes('-') ? mark.position.split('-')
      : ['haut', 'bas'].includes(mark.position) ? [mark.position, 'centre'] : ['centre', mark.position];
  const clamp = (x, max) => Math.min(Math.max(x, 0), Math.max(max, 0));
  const top = clamp(v === 'haut' ? margin : v === 'bas' ? h - sh - margin : Math.round((h - sh) / 2), h - sh);
  const left = clamp(hz === 'gauche' ? margin : hz === 'droite' ? w - sw - margin : Math.round((w - sw) / 2), w - sw);
  return [{ input: img, top, left }];
}
