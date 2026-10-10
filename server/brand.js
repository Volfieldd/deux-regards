import sharp from 'sharp';

export const EMBLEM_MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 6000;

export class BrandError extends Error {}

// Emblème (logo dessiné) → masque : une seule couche alpha, la couleur vient du thème (CSS mask).
// Fonctionne avec un dessin sombre sur fond clair comme clair sur fond sombre, ou déjà transparent.
export async function processEmblem(input) {
  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE }).metadata();
  } catch {
    throw new BrandError('ce fichier n’est pas une image lisible');
  }
  if (!['png', 'webp', 'jpeg'].includes(meta.format)) throw new BrandError('emblème en PNG, WebP ou JPEG');
  if (meta.width > MAX_SIDE || meta.height > MAX_SIDE) throw new BrandError(`image trop grande (${MAX_SIDE} px de côté au plus)`);

  // Dessin déjà détouré : la transparence suffit.
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;
  const alpha = Buffer.alloc(px);
  if (transparent / px > 0.2) {
    for (let i = 0; i < px; i++) alpha[i] = data[i * 4 + 3];
  } else {
    // Fond opaque : le sens (encre sombre ou claire) se lit sur le pourtour de l'image.
    const lum = i => 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    let edge = 0;
    let n = 0;
    for (let x = 0; x < info.width; x++) { edge += lum(x) + lum((info.height - 1) * info.width + x); n += 2; }
    for (let y = 0; y < info.height; y++) { edge += lum(y * info.width) + lum(y * info.width + info.width - 1); n += 2; }
    const lightBackground = edge / n > 127;
    for (let i = 0; i < px; i++) {
      const v = lightBackground ? 255 - lum(i) : lum(i);
      alpha[i] = Math.max(0, Math.min(255, Math.round((v - 24) * 1.12)));   // fond légèrement bruité → transparent
    }
  }

  let visible = 0;
  for (let i = 0; i < px; i++) if (alpha[i] > 64) visible++;
  if (visible < 50) throw new BrandError('aucun dessin trouvé dans l’image (fond uni ?)');

  // Masque noir + alpha, recadré au plus près du dessin, 1600 px de côté au plus (net en haute densité).
  const rgba = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) rgba[i * 4 + 3] = alpha[i];
  const raw = { raw: { width: info.width, height: info.height, channels: 4 } };
  let mask;
  try {
    mask = await sharp(rgba, raw).trim({ threshold: 10 }).png().toBuffer();
  } catch {
    throw new BrandError('aucun dessin trouvé dans l’image (fond uni ?)');
  }
  mask = await sharp(mask).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  const { width, height } = await sharp(mask).metadata();

  // Favicon : emblème clair sur carré sombre, lisible sur onglets clairs comme sombres.
  const favicon = async size => {
    const inner = Math.round(size * 0.8);
    const white = await sharp(mask).resize({ width: inner, height: inner, fit: 'inside' })
      .composite([{ input: Buffer.from([255, 255, 255, 255]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'in' }])
      .png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: '#111111' } })
      .composite([{ input: white, gravity: 'center' }]).png().toBuffer();
  };
  return { mask, width, height, favicon64: await favicon(64), favicon180: await favicon(180) };
}

// Icône simplifiée : masque (en-tête mobile) + icônes d'onglet. Une icône carrée et opaque fournie
// aux bonnes couleurs est reprise telle quelle (redimensionnée), sinon elle est composée sur fond sombre.
export async function processIcon(input) {
  const made = await processEmblem(input);
  const meta = await sharp(input).metadata();
  const stats = await sharp(input).stats();
  if (stats.isOpaque && Math.abs(meta.width - meta.height) <= 2) {
    const sized = size => sharp(input).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
    return { ...made, favicon64: await sized(64), favicon180: await sized(180) };
  }
  return made;
}

// Image de partage : réencodée (sans métadonnées), 1200 px de côté au plus.
export async function processShare(input) {
  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE }).metadata();
  } catch {
    throw new BrandError('ce fichier n’est pas une image lisible');
  }
  if (!['png', 'webp', 'jpeg'].includes(meta.format)) throw new BrandError('image en PNG, WebP ou JPEG');
  const image = await sharp(input).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#000000' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return { image };
}
