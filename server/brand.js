import sharp from 'sharp';

export const EMBLEM_MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 6000;
const MASK_SIDE = 1600;               // côté du masque au plus
const ANALYSIS_SIDE = 2000;           // côté de l'image analysée d'abord (le masque n'en demande pas plus, en général)

export class BrandError extends Error {}

// En-tête seul (aucun pixel décodé, donc sans limite de pixels) : la taille est contrôlée ensuite, avec son message.
async function header(input) {
  try {
    return await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    throw new BrandError('ce fichier n’est pas une image lisible');
  }
}

// Emblème (logo dessiné) → masque : une seule couche alpha, la couleur vient du thème (CSS mask).
// Fonctionne avec un dessin sombre sur fond clair comme clair sur fond sombre, ou déjà transparent.
export async function processEmblem(input) {
  const meta = await header(input);
  if (!['png', 'webp', 'jpeg'].includes(meta.format)) throw new BrandError('emblème en PNG, WebP ou JPEG');
  if (meta.width > MAX_SIDE || meta.height > MAX_SIDE) throw new BrandError(`image trop grande (${MAX_SIDE} px de côté au plus)`);

  // Les boucles d'analyse sont synchrones (36 Mpx figeaient le serveur plus d'une seconde) : elles portent sur une
  // image réduite à 2000 px, et ne reprennent plus grand que si le dessin, recadré, y fait moins de 1600 px.
  let drawn = await drawing(input, ANALYSIS_SIDE);
  const got = Math.max(drawn.width, drawn.height);
  const longest = Math.max(meta.width, meta.height);
  if (got < MASK_SIDE && longest > ANALYSIS_SIDE) drawn = await drawing(input, Math.min(longest, Math.ceil((ANALYSIS_SIDE * MASK_SIDE) / got)));

  // Masque noir + alpha, recadré au plus près du dessin, 1600 px de côté au plus (net en haute densité).
  const mask = await sharp(drawn.png).resize({ width: MASK_SIDE, height: MASK_SIDE, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
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

// Dessin seul (noir + alpha), recadré au plus près, analysé sur l'image orientée (photo d'un dessin prise au
// téléphone) et réduite à `side` px de côté au plus.
async function drawing(input, side) {
  const { data, info } = await sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE }).rotate()
    .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Dessin déjà détouré : la transparence suffit.
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

  const rgba = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) rgba[i * 4 + 3] = alpha[i];
  const raw = { raw: { width: info.width, height: info.height, channels: 4 } };
  try {
    const { data: png, info: out } = await sharp(rgba, raw).trim({ threshold: 10 }).png().toBuffer({ resolveWithObject: true });
    return { png, width: out.width, height: out.height };
  } catch {
    throw new BrandError('aucun dessin trouvé dans l’image (fond uni ?)');
  }
}

// Icône simplifiée : masque (en-tête mobile) + icônes d'onglet. Une icône carrée et opaque fournie
// aux bonnes couleurs est reprise telle quelle (redimensionnée), sinon elle est composée sur fond sombre.
export async function processIcon(input) {
  const made = await processEmblem(input);
  const meta = await sharp(input).metadata();
  const stats = await sharp(input).stats();
  if (stats.isOpaque && Math.abs(meta.width - meta.height) <= 2) {
    const sized = size => sharp(input).rotate().resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
    return { ...made, favicon64: await sized(64), favicon180: await sized(180) };
  }
  return made;
}

// Image de partage : réencodée en JPEG (sans métadonnées), 1200 px de côté au plus. Une transparence est remplacée
// par un fond qui contraste avec le dessin : blanc derrière un dessin sombre (logo noir détouré), noir sinon.
export async function processShare(input) {
  const meta = await header(input);
  if (!['png', 'webp', 'jpeg'].includes(meta.format)) throw new BrandError('image en PNG, WebP ou JPEG');
  if (meta.width > MAX_SIDE || meta.height > MAX_SIDE) throw new BrandError(`image trop grande (${MAX_SIDE} px de côté au plus)`);
  const open = () => sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE }).rotate();
  let background = '#000000';
  if (meta.hasAlpha) {
    // Luminance moyenne des pixels visibles (pondérée par leur opacité), sur une vignette.
    const { data } = await open().resize(64, 64, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      sum += a * (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      weight += a;
    }
    if (weight > 0 && sum / weight < 128) background = '#ffffff';
  }
  const image = await open().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .flatten({ background }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return { image };
}
