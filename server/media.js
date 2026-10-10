import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { generateVariants, removeVariants, MAX_PIXELS } from './images.js';

// Garde-fous de l'import : poids du fichier, nombre de pixels, formats réellement décodés.
export const MAX_FILE_BYTES = 60 * 1024 * 1024;
const FORMATS = { jpeg: 'jpg', png: 'png', webp: 'webp', tiff: 'tif', heif: 'heic' };

export class ImportError extends Error {}

// Dimensions telles qu'affichées, après application de l'orientation EXIF.
export async function orientedSize(file) {
  const m = await sharp(file, { limitInputPixels: MAX_PIXELS }).metadata();
  return { format: m.format, width: m.autoOrient?.width ?? m.width, height: m.autoOrient?.height ?? m.height };
}

// Valide un fichier téléversé (déjà écrit dans tmp), le range dans originals/ et génère ses variantes.
// Le fichier temporaire est toujours supprimé.
export async function importOriginal(storageDir, tmpFile) {
  const originals = path.join(storageDir, 'originals');
  fs.mkdirSync(originals, { recursive: true });
  let file = null;
  try {
    let meta;
    try {
      meta = await orientedSize(tmpFile);
    } catch {
      throw new ImportError('ce fichier n’est pas une image lisible');
    }
    const ext = FORMATS[meta.format];
    if (!ext) throw new ImportError(`format ${meta.format} non pris en charge (JPEG, PNG, WebP, TIFF, HEIF)`);
    if (meta.width * meta.height > MAX_PIXELS) throw new ImportError('image trop grande (120 mégapixels au plus)');
    file = `${crypto.randomUUID()}.${ext}`;
    fs.renameSync(tmpFile, path.join(originals, file));
    try {
      await generateVariants(storageDir, file);
    } catch {
      throw new ImportError('image illisible ou format non pris en charge par le serveur');
    }
    return { file, width: meta.width, height: meta.height };
  } catch (err) {
    if (file) removePhotoFiles(storageDir, file);
    throw err;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

export function removePhotoFiles(storageDir, file) {
  fs.rmSync(path.join(storageDir, 'originals', file), { force: true });
  removeVariants(storageDir, file);
}
