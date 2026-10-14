import { createRequire } from 'node:module';
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
  qr: { label: 'QR seul', w: 80, h: 80 },
  vertical: { label: 'Dos de tee-shirt, sac (vertical)', w: 120, h: 175 },
  carre: { label: 'Écusson, casquette (carré)', w: 80, h: 80 },
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

export function composition({ model = 'vertical', ink = 'noir', url, display, name, siteName }) {
  const M = MODELS[model] || MODELS.vertical;
  const fg = (INKS[ink] || INKS.noir).fg;
  const box = ink === 'blanc';                                 // textile foncé : carré blanc évidé
  const f = F();
  const paths = [];
  let qr;
  const { w, h } = M;
  if (model === 'qr') {
    qr = qrPath(url, 0, 0, w, { box });
  } else if (model === 'carre') {
    const q = 58;
    qr = qrPath(url, (w - q) / 2, 2, q, { box });
    paths.push(text(f.serif, 'Bonjour !', w / 2, 69, 9.5, w - 8));
    paths.push(text(f.mono, display, w / 2, 75, 3.6, w - 8));
  } else {
    paths.push(text(f.serif, 'Bonjour !', w / 2, 27, 24, w - 10));
    paths.push(text(f.sans, 'Je vous ai peut-être photographié.', w / 2, 38, 6, w - 12));
    paths.push(text(f.light, 'I may have taken your photo · Vielleicht habe ich Sie fotografiert', w / 2, 45, 3.6, w - 12));
    const q = 96;
    qr = qrPath(url, (w - q) / 2, 50, q, { box });
    paths.push(text(f.mono, display, w / 2, 158, 5.6, w - 12));
    paths.push(text(f.light, `${name} · ${siteName}`, w / 2, 167, 4, w - 20));
  }
  // QR : règle « evenodd » (modules évidés dans le carré blanc) ; texte : « nonzero » (contours des lettres).
  const texts = paths;
  const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`
    + `<title>${esc(`${siteName} · ${name} · ${display}`)}</title>`
    + `<path fill="${fg}" fill-rule="evenodd" d="${qr}"/>`
    + (texts.length ? `<path fill="${fg}" d="${texts.join('')}"/>` : '') + '</svg>\n';
}
