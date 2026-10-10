import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { overlayFor } from './watermark.js';

export const WIDTHS = [640, 1280, 2000];
export const FORMATS = ['avif', 'webp'];
// Refus de décoder au-delà (bombe de décompression) ; l'import vérifie aussi avant d'arriver ici.
export const MAX_PIXELS = 120_000_000;
// Effort d'encodage AVIF (0 rapide … 9 compact) ; les tests le mettent à 0.
const AVIF_EFFORT = Math.min(Math.max(Number(process.env.AVIF_EFFORT ?? 4) || 0, 0), 9);

// Largeurs réellement produites pour une image : jamais d'agrandissement.
export function widthsFor(originalWidth) {
  const ws = WIDTHS.filter(w => w < originalWidth);
  if (ws.length < WIDTHS.length) ws.push(Math.min(originalWidth, WIDTHS.at(-1)));
  return ws;
}

const stem = file => path.parse(file).name;
// Le nom porte l'empreinte des réglages (filigrane, EXIF) : une variante en cache long n'est
// jamais remplacée sous le même nom. Clé vide = variante brute (sans filigrane ni métadonnée).
export const variantName = (file, width, format, key = '') => `${stem(file)}-${key ? `${key}-` : ''}${width}.${format}`;
export const VARIANT_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-([0-9a-f]{8}))?-(\d+)\.(avif|webp)$/;

// ---------- métadonnées ----------

// EXIF ASCII : pas de caractère de contrôle, longueur bornée (« © » devient « (C) » à l'écriture).
const ascii = v => String(v ?? '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 120);
const exifDate = d => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, ':') : null);
const exposure = s => (typeof s === 'number' && s > 0 ? (s < 1 ? `1/${Math.round(1 / s)}` : String(s)) : null);

// Balises de prise de vue recopiées de l'original. Jamais de GPS, ni de numéro de série.
function shootingTags(original) {
  let e;
  try { e = exifReader(original); } catch { return { IFD0: {}, IFD2: {} }; }
  const img = e.Image || {};
  const ph = e.Photo || {};
  const pick = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  return {
    IFD0: pick({ Make: img.Make && ascii(img.Make), Model: img.Model && ascii(img.Model) }),
    IFD2: pick({
      LensModel: ph.LensModel && ascii(ph.LensModel),
      ExposureTime: exposure(ph.ExposureTime),
      FNumber: typeof ph.FNumber === 'number' ? String(ph.FNumber) : null,
      ISOSpeedRatings: typeof ph.ISOSpeedRatings === 'number' ? String(ph.ISOSpeedRatings) : null,
      FocalLength: typeof ph.FocalLength === 'number' ? String(ph.FocalLength) : null,
      DateTimeOriginal: exifDate(ph.DateTimeOriginal),
    }),
  };
}

// Mentions de droits IPTC, en XMP (lues par Google Images, Lightroom, Bridge…) :
// créateur, copyright, crédit, page des conditions d'utilisation et contact de licence.
const xml = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function rightsXmp({ artist, copyright, credit, webStatement }) {
  return '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"'
    + ' xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:plus="http://ns.useplus.org/ldf/xmp/1.0/">'
    + `<dc:creator><rdf:Seq><rdf:li>${xml(artist)}</rdf:li></rdf:Seq></dc:creator>`
    + `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xml(copyright)}</rdf:li></rdf:Alt></dc:rights>`
    + `<photoshop:Credit>${xml(credit)}</photoshop:Credit>`
    + '<xmpRights:Marked>True</xmpRights:Marked>'
    + (webStatement ? `<xmpRights:WebStatement>${xml(webStatement)}</xmpRights:WebStatement>`
      + `<plus:Licensor><rdf:Seq><rdf:li rdf:parseType="Resource"><plus:LicensorURL>${xml(webStatement)}</plus:LicensorURL></rdf:li></rdf:Seq></plus:Licensor>` : '')
    + '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
}

// Applique le niveau de métadonnées voulu à un pipeline sharp.
//   null       : aucune (comportement par défaut de sharp)
//   rights     : auteur et copyright (EXIF), mentions IPTC (XMP)
//   shooting   : droits + appareil, objectif, exposition, date (sans GPS)
//   all        : tout l'EXIF de l'original, GPS compris
function applyMeta(pipeline, meta, originalExif) {
  if (!meta) return pipeline;
  // Dès qu'on signe les fichiers, les mentions IPTC accompagnent l'EXIF (accents conservés en XMP).
  pipeline = pipeline.withXmp(rightsXmp(meta));
  if (meta.mode === 'all') return pipeline.keepExif();
  const rights = { Artist: ascii(meta.artist), Copyright: ascii(meta.copyright) };
  if (meta.mode === 'rights') return pipeline.withExif({ IFD0: rights });
  const shot = originalExif ? shootingTags(originalExif) : { IFD0: {}, IFD2: {} };
  return pipeline.withExif({ IFD0: { ...shot.IFD0, ...rights }, IFD2: shot.IFD2 });
}

// ---------- rendu ----------

// Génère les variantes servies d'un original, avec le filigrane `mark` et les métadonnées `meta`
// déjà résolus pour cette photo (voir variants.js). rotate() applique l'orientation EXIF.
export async function renderVariants(storageDir, file, { key = '', mark = null, meta = null, force = false } = {}) {
  const src = path.join(storageDir, 'originals', file);
  const outDir = path.join(storageDir, 'variants');
  fs.mkdirSync(outDir, { recursive: true });
  // metadata() ignore rotate() : les dimensions affichées viennent de autoOrient.
  const info = await sharp(src, { limitInputPixels: MAX_PIXELS }).metadata();
  const width = info.autoOrient?.width ?? info.width;
  const height = info.autoOrient?.height ?? info.height;
  const made = [];
  for (const w of widthsFor(width)) {
    const h = Math.floor((height * w) / width) - 1; // marge d’un pixel sur l’arrondi de sharp
    const todo = FORMATS.map(format => [format, path.join(outDir, variantName(file, w, format, key))])
      .filter(([, out]) => force || !fs.existsSync(out));
    if (!todo.length) continue;
    const overlay = mark && w >= (mark.minWidth || 0) ? await overlayFor(mark, w, h) : null;
    for (const [format, out] of todo) {
      // sharp applique composite() après le redimensionnement : filigrane posé à la taille finale,
      // sans réencodage intermédiaire, et l'EXIF de l'original reste disponible.
      let pipeline = sharp(src, { limitInputPixels: MAX_PIXELS }).rotate().resize({ width: w, withoutEnlargement: true });
      if (overlay) pipeline = pipeline.composite(overlay);
      pipeline = applyMeta(pipeline, meta, info.exif);
      await (format === 'avif' ? pipeline.avif({ quality: 55, effort: AVIF_EFFORT }) : pipeline.webp({ quality: 78 })).toFile(out);
      made.push(out);
    }
  }
  return made;
}

// Variantes brutes (seed, import sans réglage particulier).
export const generateVariants = (storageDir, file, opts = {}) => renderVariants(storageDir, file, opts);

// Supprime les variantes d'un original ; `keep` : clé dont les fichiers sont conservés.
export function removeVariants(storageDir, file, { keep = null } = {}) {
  const dir = path.join(storageDir, 'variants');
  if (!fs.existsSync(dir)) return;
  const id = stem(file);
  for (const f of fs.readdirSync(dir)) {
    const m = VARIANT_RE.exec(f);
    if (m && m[1] === id && (keep === null || (m[2] || '') !== keep)) fs.rmSync(path.join(dir, f));
  }
}

// Toutes les variantes attendues pour cette clé existent-elles ?
export function hasVariants(storageDir, photo, key) {
  return widthsFor(photo.width).every(w => FORMATS.every(f => fs.existsSync(path.join(storageDir, 'variants', variantName(photo.file, w, f, key)))));
}

// Aperçu en mémoire d'une variante (réglages pas encore enregistrés) : rien n'est écrit sur le disque.
export async function renderPreview(storageDir, file, width, { mark = null } = {}) {
  const src = path.join(storageDir, 'originals', file);
  const info = await sharp(src, { limitInputPixels: MAX_PIXELS }).metadata();
  const ow = info.autoOrient?.width ?? info.width;
  const oh = info.autoOrient?.height ?? info.height;
  const w = Math.min(width, ow);
  const h = Math.floor((oh * w) / ow) - 1;
  let pipeline = sharp(src, { limitInputPixels: MAX_PIXELS }).rotate().resize({ width: w, withoutEnlargement: true });
  if (mark && w >= (mark.minWidth || 0)) pipeline = pipeline.composite(await overlayFor(mark, w, h));
  return pipeline.webp({ quality: 78 }).toBuffer();
}
