import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { removeVariants, MAX_PIXELS } from './images.js';
import { sha256File } from './proofs.js';

// Garde-fous de l'import : poids du fichier, nombre de pixels, formats réellement décodés.
// 90 Mio par fichier : chaque photo part dans sa propre requête, et Cloudflare refuse les requêtes de plus de
// 100 Mo (offre gratuite) ; la marge couvre l'enveloppe multipart.
export const MAX_FILE_BYTES = 90 * 1024 * 1024;
const FORMATS = { jpeg: 'jpg', png: 'png', webp: 'webp', tiff: 'tif', heif: 'heic' };

export class ImportError extends Error {}

// Dimensions telles qu'affichées, après application de l'orientation EXIF.
export async function orientedSize(file) {
  const m = await sharp(file, { limitInputPixels: MAX_PIXELS }).metadata();
  return { format: m.format, width: m.autoOrient?.width ?? m.width, height: m.autoOrient?.height ?? m.height, takenOn: takenOnFromExif(m.exif), takenTime: takenTimeFromExif(m.exif), gps: gpsFromExif(m.exif) };
}

// Position GPS de la prise de vue (EXIF GPSInfo) → { lat, lon }, ou null. Sert seulement à proposer la ville
// la plus proche : la position elle-même n'est jamais enregistrée.
export function gpsFromExif(buffer) {
  if (!buffer) return null;
  let g;
  try { g = exifReader(buffer).GPSInfo; } catch { return null; }
  if (!g) return null;
  const dms = v => (Array.isArray(v) && v.length >= 1 ? Number(v[0]) + Number(v[1] || 0) / 60 + Number(v[2] || 0) / 3600 : Number(v));
  let lat = dms(g.GPSLatitude);
  let lon = dms(g.GPSLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  if (String(g.GPSLatitudeRef).toUpperCase() === 'S') lat = -lat;
  if (String(g.GPSLongitudeRef).toUpperCase() === 'W') lon = -lon;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

// Date de prise de vue de l'appareil (EXIF DateTimeOriginal) → AAAA-MM-JJ, ou null.
// Le champ n'a pas de fuseau : exif-reader le lit comme une heure UTC, on en garde le jour tel quel.
export function takenOnFromExif(buffer) {
  if (!buffer) return null;
  let d;
  try { d = exifReader(buffer).Photo?.DateTimeOriginal; } catch { return null; }
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 1900 || y > 2100) return null;
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Heure de prise de vue (EXIF DateTimeOriginal) → HH:MM, telle que l'appareil l'a inscrite ; '' si absente.
// Sert à découper une journée en sorties (matin, soir).
export function takenTimeFromExif(buffer) {
  if (!buffer) return '';
  let d;
  try { d = exifReader(buffer).Photo?.DateTimeOriginal; } catch { return ''; }
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// Valide un fichier téléversé (déjà écrit dans tmp) et le range dans originals/.
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
    // Empreinte de l'original tel que reçu : base de la preuve d'antériorité.
    const sha256 = await sha256File(tmpFile);
    file = `${crypto.randomUUID()}.${ext}`;
    fs.renameSync(tmpFile, path.join(originals, file));
    // Les variantes sont rendues ensuite par le service (filigrane et métadonnées du moment).
    return { file, width: meta.width, height: meta.height, sha256, takenOn: meta.takenOn, takenTime: meta.takenTime, gps: meta.gps };
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
