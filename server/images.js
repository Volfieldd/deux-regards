import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const WIDTHS = [640, 1280, 2000];
export const FORMATS = ['avif', 'webp'];

// Largeurs réellement produites pour une image : jamais d'agrandissement.
export function widthsFor(originalWidth) {
  const ws = WIDTHS.filter(w => w < originalWidth);
  if (ws.length < WIDTHS.length) ws.push(Math.min(originalWidth, WIDTHS.at(-1)));
  return ws;
}

const stem = file => path.parse(file).name;
export const variantName = (file, width, format) => `${stem(file)}-${width}.${format}`;

// Génère les variantes servies. sharp ne recopie aucune métadonnée (EXIF, GPS, XMP)
// sauf demande explicite ; rotate() applique l'orientation EXIF avant qu'elle disparaisse.
export async function generateVariants(storageDir, file, { force = false } = {}) {
  const src = path.join(storageDir, 'originals', file);
  const outDir = path.join(storageDir, 'variants');
  fs.mkdirSync(outDir, { recursive: true });
  const { width } = await sharp(src).rotate().metadata();
  const made = [];
  for (const w of widthsFor(width)) {
    for (const format of FORMATS) {
      const out = path.join(outDir, variantName(file, w, format));
      if (!force && fs.existsSync(out)) continue;
      const pipeline = sharp(src).rotate().resize({ width: w, withoutEnlargement: true });
      await (format === 'avif' ? pipeline.avif({ quality: 55, effort: 4 }) : pipeline.webp({ quality: 78 })).toFile(out);
      made.push(out);
    }
  }
  return made;
}

export function removeVariants(storageDir, file) {
  const dir = path.join(storageDir, 'variants');
  if (!fs.existsSync(dir)) return;
  const prefix = `${stem(file)}-`;
  for (const f of fs.readdirSync(dir)) if (f.startsWith(prefix)) fs.rmSync(path.join(dir, f));
}
