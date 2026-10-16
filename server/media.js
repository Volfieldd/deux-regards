import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { removeVariants, MAX_PIXELS, WIDTHS } from './images.js';
import { readExif } from './exif.js';
import { sha256File } from './proofs.js';
import { IMPORT_CONCURRENCY } from './imports.js';

// Garde-fous de l'import : poids du fichier, nombre de pixels, formats réellement décodés.
// 90 Mio par fichier : chaque photo part dans sa propre requête, et Cloudflare refuse les requêtes de plus de
// 100 Mo (offre gratuite) ; la marge couvre l'enveloppe multipart.
export const MAX_FILE_BYTES = 90 * 1024 * 1024;
// HEIF : seul l'AVIF (compression AV1) se décode ici ; il est rangé avec l'extension .avif.
const FORMATS = { jpeg: 'jpg', png: 'png', webp: 'webp', tiff: 'tif', heif: 'avif' };
// Mémoire du décodage : jamais plus qu'une image RVB 8 bits de 120 mégapixels (une image 16 bits ou avec
// transparence a donc moins de pixels admis). Un TIFF 16 bits très compressible d'1 Mo en coûtait 600 Mo et 17 s.
const BYTES = { uchar: 1, char: 1, ushort: 2, short: 2, uint: 4, int: 4, float: 4, complex: 8, double: 8, dpcomplex: 16 };
const MAX_DECODED = MAX_PIXELS * 3;
// Hauteur au plus d'une variante : WebP plafonne à 16 383 px (AVIF : 16 384).
const MAX_VARIANT_HEIGHT = 16_383;
// Décodages de contrôle de l'import (PNG, TIFF : image entière décodée, jusqu'à ~360 Mo) : IMPORT_CONCURRENCY à la
// fois, toutes requêtes confondues, comme les rendus (des envois parallèles ne s'additionnent pas sans limite).
let checking = 0;
const checkWaiters = [];
export async function withCheckSlot(fn) {
  while (checking >= IMPORT_CONCURRENCY) await new Promise(resolve => checkWaiters.push(resolve));
  checking++;
  try { return await fn(); } finally { checking--; checkWaiters.shift()?.(); }
}

export class ImportError extends Error {}

// Dimensions telles qu'affichées, après application de l'orientation EXIF. L'EXIF n'est lu qu'une fois (lecture bornée).
export async function orientedSize(file) {
  const m = await sharp(file, { limitInputPixels: MAX_PIXELS }).metadata();
  const e = readExif(m.exif);
  return {
    format: m.format, compression: m.compression, depth: m.depth, channels: m.channels,
    width: m.autoOrient?.width ?? m.width, height: m.autoOrient?.height ?? m.height,
    takenOn: takenOnOf(e), takenTime: takenTimeOf(e), gps: gpsOf(e),
  };
}

// Position GPS de la prise de vue (EXIF GPSInfo) → { lat, lon }, ou null. Sert seulement à proposer la ville
// la plus proche : la position elle-même n'est jamais enregistrée.
export function gpsFromExif(buffer) { return gpsOf(readExif(buffer)); }
function gpsOf(e) {
  const g = e?.GPSInfo;
  if (!g) return null;
  const dms = v => (Array.isArray(v) && v.length >= 1 ? Number(v[0]) + Number(v[1] || 0) / 60 + Number(v[2] || 0) / 3600 : Number(v));
  let lat = dms(g.GPSLatitude);
  let lon = dms(g.GPSLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  if (String(g.GPSLatitudeRef).toUpperCase() === 'S') lat = -lat;
  if (String(g.GPSLongitudeRef).toUpperCase() === 'W') lon = -lon;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

// Date et heure de prise de vue de l'appareil (EXIF DateTimeOriginal), ou null : absente, invalide, ou hors de
// 1900–2100 (horloge jamais réglée : « 0000:00:00 00:00:00 »). Le jour et l'heure se valident ensemble : une heure
// n'est jamais gardée sans son jour.
// Le champ n'a pas de fuseau : exif-reader le lit comme une heure UTC, on en garde le jour et l'heure tels quels.
function shotAt(e) {
  const d = e?.Photo?.DateTimeOriginal;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  return y < 1900 || y > 2100 ? null : d;
}
const pad = n => String(n).padStart(2, '0');

// Date de prise de vue → AAAA-MM-JJ, ou null.
export function takenOnFromExif(buffer) { return takenOnOf(readExif(buffer)); }
function takenOnOf(e) {
  const d = shotAt(e);
  return d ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : null;
}

// Heure de prise de vue → HH:MM, telle que l'appareil l'a inscrite ; '' si absente ou sans jour valide.
// Sert à découper une journée en sorties (matin, soir).
export function takenTimeFromExif(buffer) { return takenTimeOf(readExif(buffer)); }
function takenTimeOf(e) {
  const d = shotAt(e);
  return d ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : '';
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
    if (!ext) throw new ImportError(`format ${meta.format} non pris en charge (JPEG, PNG, WebP, TIFF, AVIF)`);
    // Le HEIC des iPhone (HEVC) passe la lecture de l'en-tête, mais le serveur ne sait pas le décoder.
    if (meta.format === 'heif' && meta.compression !== 'av1') throw new ImportError('HEIC (iPhone) non pris en charge : exportez la photo en JPEG');
    if (meta.width * meta.height > MAX_PIXELS) throw new ImportError('image trop grande (120 mégapixels au plus)');
    if (meta.width * meta.height * (meta.channels || 4) * (BYTES[meta.depth] ?? 4) > MAX_DECODED) {
      throw new ImportError('image trop lourde à décoder (en 16 bits ou avec transparence, moins de 120 mégapixels sont admis)');
    }
    // Panorama vertical : la plus grande variante dépasserait la hauteur que savent écrire WebP et AVIF.
    if ((meta.height * Math.min(meta.width, WIDTHS.at(-1))) / meta.width > MAX_VARIANT_HEIGHT) {
      throw new ImportError('image trop haute pour le site (panorama vertical) : la version affichée dépasserait 16 383 px de haut');
    }
    // Décodage réel, à petite taille (en JPEG, l'image est réduite dès la lecture) : l'en-tête seul ne dit rien
    // d'un fichier tronqué ou d'une compression que le serveur ne sait pas lire, qui échoueraient ensuite au rendu.
    try {
      await withCheckSlot(() => sharp(tmpFile, { limitInputPixels: MAX_PIXELS }).resize(64, 64, { fit: 'inside' }).raw().toBuffer());
    } catch {
      throw new ImportError('image incomplète ou abîmée : elle ne se décode pas');
    }
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
