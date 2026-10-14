import { createRequire } from 'node:module';
import sharp from 'sharp';
import QRCode from 'qrcode';
import opentype from 'opentype.js';

// QR générique d'un photographe (/bonjour/J) pour les vêtements et accessoires : tee-shirt, sac, casquette, écusson.
// SVG vectoriel en millimètres, texte converti en tracés (l'imprimeur n'a pas besoin des polices du site), une seule
// couleur d'encre :
//   - « noir » : encre noire, pour un textile clair ;
//   - « blanc » : encre blanche, pour un textile foncé ; le QR est alors un carré blanc dont les modules sont évidés
//     (le textile foncé fait les modules) : la polarité habituelle, lue par tous les téléphones.
// QR en correction d'erreur maximale (H) avec sa marge de 4 modules : il résiste aux plis et à l'usure.

const require = createRequire(import.meta.url);
const font = file => opentype.loadSync(require.resolve(`@fontsource/${file}`));
let fonts = null;
const F = () => (fonts ??= {
  serif: font('cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff'),
  sans: font('jost/files/jost-latin-400-normal.woff'),
  light: font('jost/files/jost-latin-300-normal.woff'),
  mono: font('ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff'),
});

export const MODELS = {
  vertical: { label: 'Dos de tee-shirt, sac', w: 120, h: 198 },
  carre: { label: 'Écusson', w: 80, h: 96 },
  logo: { label: 'Logo seul (poitrine, casquette)', w: 100, h: 50 },
  qr: { label: 'QR seul', w: 80, h: 80 },
};
export const INKS = { noir: { label: 'Encre noire (textile clair)', fg: '#000000' }, blanc: { label: 'Encre blanche (textile foncé)', fg: '#ffffff' } };

const r1 = n => Math.round(n * 1000) / 1000;
// Texte centré sur cx, ligne de base y, taille réduite au besoin pour tenir dans maxW (mm).
function text(f, str, cx, y, size, maxW) {
  let s = size;
  while (f.getAdvanceWidth(str, s) > maxW && s > 1) s *= 0.97;
  const w = f.getAdvanceWidth(str, s);
  return f.getPath(str, cx - w / 2, y, s).toPathData(3);
}

// Modules du QR en un seul tracé (une ligne de modules contigus = un rectangle), coin haut-gauche (x, y), côté size.
function qrPath(url, x, y, size, { box = false } = {}) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const total = n + 8;                                        // marge de 4 modules de chaque côté
  const m = size / total;
  const parts = [];
  if (box) parts.push(`M${r1(x)} ${r1(y)}h${r1(size)}v${r1(size)}h${r1(-size)}z`);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n;) {
      if (!qr.modules.get(r, c)) { c++; continue; }
      let e = c;
      while (e < n && qr.modules.get(r, e)) e++;
      parts.push(`M${r1(x + (c + 4) * m)} ${r1(y + (r + 4) * m)}h${r1((e - c) * m)}v${r1(m)}h${r1(-(e - c) * m)}z`);
      c = e;
    }
  }
  return parts.join('');
}

// Logo de la marque (masque PNG d'Apparence) à la couleur de l'encre, en image intégrée au SVG ; place (x, y, w, h)
// en millimètres, centré dans la boîte. Sans logo : le nom du site en tracés.
async function logo(mask, box, fg, fallback) {
  if (!mask) {
    const f = F();
    const size = Math.min(box.h * 0.8, 30);
    return { text: text(f.serif, fallback, box.x + box.w / 2, box.y + box.h * 0.72, size, box.w) };
  }
  const meta = await sharp(mask).metadata();
  const alpha = await sharp(mask).ensureAlpha().extractChannel(3).toBuffer();
  const rgb = fg === '#ffffff' ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  const png = await sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: rgb } }).joinChannel(alpha).png().toBuffer();
  const ratio = meta.width / meta.height;
  const w = Math.min(box.w, box.h * ratio);
  const h = w / ratio;
  return { image: `<image x="${r1(box.x + (box.w - w) / 2)}" y="${r1(box.y + (box.h - h) / 2)}" width="${r1(w)}" height="${r1(h)}" href="data:image/png;base64,${png.toString('base64')}"/>` };
}

// logos : { logotype, emblem } (masques PNG d'Apparence, ou null).
export async function composition({ model = 'vertical', ink = 'noir', url, display, name, siteName, logos = {} }) {
  const M = MODELS[model] || MODELS.vertical;
  const fg = (INKS[ink] || INKS.noir).fg;
  const box = ink === 'blanc';                                 // textile foncé : carré blanc évidé
  const f = F();
  const paths = [];
  const images = [];
  let qr = '';
  const { w, h } = M;
  const addLogo = async (mask, b) => { const l = await logo(mask, b, fg, siteName); if (l.image) images.push(l.image); else paths.push(l.text); };
  if (model === 'qr') {
    qr = qrPath(url, 0, 0, w, { box });
  } else if (model === 'logo') {
    await addLogo(logos.logotype || logos.emblem, { x: 0, y: 0, w, h });
  } else if (model === 'carre') {
    await addLogo(logos.emblem || logos.logotype, { x: 10, y: 3, w: w - 20, h: 24 });
    const q = 56;
    qr = qrPath(url, (w - q) / 2, 29, q, { box });
    paths.push(text(f.mono, display, w / 2, 91, 3.6, w - 8));
  } else {
    await addLogo(logos.logotype || logos.emblem, { x: 12, y: 6, w: w - 24, h: 47 });
    paths.push(text(f.serif, 'Bonjour !', w / 2, 70, 16, w - 10));
    paths.push(text(f.sans, 'Je vous ai peut-être photographié.', w / 2, 79, 5.4, w - 12));
    paths.push(text(f.light, 'I may have taken your photo · Vielleicht habe ich Sie fotografiert', w / 2, 85.5, 3.4, w - 12));
    const q = 84;
    qr = qrPath(url, (w - q) / 2, 89, q, { box });
    paths.push(text(f.mono, display, w / 2, 183, 5.2, w - 12));
    paths.push(text(f.light, name, w / 2, 191.5, 3.8, w - 20));
  }
  // QR : règle « evenodd » (modules évidés dans le carré blanc) ; texte : « nonzero » (contours des lettres).
  const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`
    + `<title>${esc(`${siteName} · ${name} · ${display}`)}</title>`
    + images.join('')
    + (qr ? `<path fill="${fg}" fill-rule="evenodd" d="${qr}"/>` : '')
    + (paths.length ? `<path fill="${fg}" d="${paths.join('')}"/>` : '') + '</svg>\n';
}
