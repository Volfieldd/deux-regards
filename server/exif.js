import exifReader from 'exif-reader';

// Lecture de l'EXIF d'une image envoyée, à coût borné.
// exif-reader lit chaque valeur de chaque balise (une balise BYTE de 4 milliards de valeurs est parcourue jusqu'à la
// fin du bloc) et suit jusqu'à cinq IFD, qui peuvent tous désigner le même : un bloc piégé de 65 ko demandait des
// milliards d'opérations synchrones (serveur figé, puis mémoire épuisée). Le parcours d'exif-reader est donc d'abord
// rejoué ici sans rien construire, en comptant les valeurs qu'il lirait ; au-delà de MAX_WORK, l'EXIF est ignoré
// (photo importée sans date ni GPS lus). Un EXIF réel en lit quelques centaines (celui d'un JPEG, 64 Ko au plus,
// jamais plus de 65 000) ; au plafond, la lecture prend une vingtaine de millisecondes.
const MAX_WORK = 1 << 18;
const SIZES = [1, 1, 2, 4, 8, 1, 1, 2, 4, 8];   // taille d'une valeur par type TIFF (1 à 10)
const POINTERS = { exif: 0x8769, gps: 0x8825, interop: 0xa005 };

// Nombre de valeurs qu'exif-reader lirait sur ce bloc (0 s'il le refuse d'emblée). Même parcours, même ordre.
export function exifWork(buf) {
  let start = 0;
  if (buf.toString('ascii', 0, 3) !== 'MM\0' && buf.toString('ascii', 0, 3) !== 'II\x2a') {
    start = 6;
    if (buf.toString('ascii', 0, 5) !== 'Exif\0') return 0;
  }
  let be;
  if (buf[start] === 0x49 && buf[start + 1] === 0x49) be = false;
  else if (buf[start] === 0x4d && buf[start + 1] === 0x4d) be = true;
  else return 0;
  const u16 = o => (be ? buf.readUInt16BE(o) : buf.readUInt16LE(o));
  const u32 = o => (be ? buf.readUInt32BE(o) : buf.readUInt32LE(o));
  if (buf.length < start + 4 || u16(start + 2) !== 0x2a || buf.length <= start + 8) return 0;
  const ifd0 = u32(start + 4) + start;
  if (ifd0 < 8) return 0;

  let work = 0;
  // Valeur d'une balise d'une seule valeur numérique (pointeur d'IFD), comme readValue d'exif-reader.
  function single(type, at) {
    switch (type) {
      case 1: return at + 1 <= buf.length ? buf[at] : null;
      case 3: return at + 2 <= buf.length ? u16(at) : null;
      case 4: return at + 4 <= buf.length ? u32(at) : null;
      case 5: return at + 8 <= buf.length ? u32(at) / u32(at + 4) : null;
      case 6: return at + 1 <= buf.length ? buf.readInt8(at) : null;
      case 8: return at + 2 <= buf.length ? (be ? buf.readInt16BE(at) : buf.readInt16LE(at)) : null;
      case 9: return at + 4 <= buf.length ? (be ? buf.readInt32BE(at) : buf.readInt32LE(at)) : null;
      case 10: return at + 8 <= buf.length ? (be ? buf.readInt32BE(at) / buf.readInt32BE(at + 4) : buf.readInt32LE(at) / buf.readInt32LE(at + 4)) : null;
      default: return null;
    }
  }
  // readTags : renvoie les pointeurs lus (dernière occurrence), ou null si exif-reader renverrait null.
  function ifd(offset) {
    if (buf.length < offset + 2) return null;
    const n = u16(offset);
    const ptr = {};
    let o = offset + 2;
    for (let i = 0; i < n; i++, o += 10) {
      if (buf.length < o + 2) return null;
      const tag = u16(o);
      o += 2;
      work++;
      if (buf.length < o + 7) { if (Object.values(POINTERS).includes(tag)) ptr[tag] = null; continue; }
      const type = u16(o);
      const count = u32(o + 2);
      let value = null;
      if (type && type <= SIZES.length) {
        const size = SIZES[type - 1];
        let at = null;
        if (size * count <= 4) at = o + 6;
        else if (buf.length >= o + 10) at = u32(o + 6) + start;
        if (at !== null) {
          if (type === 2) work += Math.max(0, Math.min(buf.length, at + count) - at);
          else if (type !== 7 && count === 1) value = single(type, at);
          else if (type !== 7 && count > 1 && at < buf.length) work += Math.min(count, Math.ceil((buf.length - at) / size));
        }
      }
      if (Object.values(POINTERS).includes(tag)) ptr[tag] = value;
    }
    return ptr;
  }
  const positive = v => typeof v === 'number' && Math.floor(v) === v && v > 0;

  const image = ifd(ifd0);
  if (buf.length >= ifd0 + 2) {
    const n = u16(ifd0);
    if (buf.length >= ifd0 + 2 + n * 12 + 4) {
      const next = u32(ifd0 + 2 + n * 12);
      if (next !== 0) ifd(next + start);                       // vignette (IFD1)
    }
  }
  if (image) {
    const photo = positive(image[POINTERS.exif]) ? ifd(image[POINTERS.exif] + start) : null;
    if (positive(image[POINTERS.gps])) ifd(image[POINTERS.gps] + start);
    if (photo && positive(photo[POINTERS.interop])) ifd(photo[POINTERS.interop] + start);
  }
  return work;
}

// EXIF lu (objet d'exif-reader), ou null : absent, illisible ou trop coûteux à lire.
export function readExif(buffer) {
  if (!buffer?.length) return null;
  try {
    return exifWork(buffer) <= MAX_WORK ? exifReader(buffer) : null;
  } catch {
    return null;
  }
}
