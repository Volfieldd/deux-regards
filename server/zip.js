import zlib from 'node:zlib';

// Les dates DOS n'ont pas de fuseau : elles sont lues comme une heure locale. On écrit donc l'heure de Paris, celle
// de qui ouvre l'archive (le serveur, lui, tourne en UTC).
const PARIS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });

// Archive ZIP minimale, sans compression (« stored »), noms en UTF-8 : pour l'export des données d'une personne.
// entries : [{ name, data (Buffer ou texte) }] → Buffer.
export function zip(entries, date = new Date()) {
  const t = Object.fromEntries(PARIS.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  const dosTime = (t.hour << 11) | (t.minute << 5) | Math.floor(t.second / 2);
  const dosDate = ((t.year - 1980) << 9) | (t.month << 5) | t.day;
  const locals = []; const centrals = []; let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8');
    const crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

// Archive ZIP écrite en flux dans un fichier (« Tout télécharger » des galeries privées) : chaque fichier est lu deux fois
// par morceaux (somme CRC-32, puis copie), jamais en entier en mémoire ; seul le répertoire central y reste. Sans
// compression ni ZIP64 : l'appelant borne l'archive bien en dessous de 4 Gio. entries : [{ name, path }] ; shouldStop(octets)
// : vrai pour s'arrêter avant d'ajouter le fichier suivant (taille maximale). Renvoie { bytes, count }.
export async function writeZip(file, entries, { date = new Date(), shouldStop = () => false } = {}) {
  const fs = await import('node:fs');
  const { once } = await import('node:events');
  const t = Object.fromEntries(PARIS.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  const dosTime = (t.hour << 11) | (t.minute << 5) | Math.floor(t.second / 2);
  const dosDate = ((t.year - 1980) << 9) | (t.month << 5) | t.day;
  const out = fs.createWriteStream(file, { mode: 0o600 });
  const write = async buf => { if (!out.write(buf)) await once(out, 'drain'); };
  const centrals = [];
  let offset = 0, count = 0;
  try {
    for (const e of entries) {
      const size = fs.statSync(e.path).size;
      if (shouldStop(offset + size)) break;
      let crc = 0;
      for await (const chunk of fs.createReadStream(e.path)) crc = zlib.crc32(chunk, crc);
      crc >>>= 0;
      const name = Buffer.from(e.name, 'utf8');
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
      local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(size, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
      await write(local); await write(name);
      for await (const chunk of fs.createReadStream(e.path)) await write(chunk);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
      central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(size, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(name.length, 28);
      central.writeUInt32LE(offset, 42);
      centrals.push(central, name);
      offset += 30 + name.length + size;
      count += 1;
    }
    const dir = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
    end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
    await write(dir); await write(end);
  } finally {
    out.end();
    await once(out, 'close');
  }
  return { bytes: fs.statSync(file).size, count };
}
