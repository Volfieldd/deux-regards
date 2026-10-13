import path from 'node:path';
import sharp from 'sharp';
import { gpsFromExif } from '../media.js';
import { MAX_PIXELS } from '../images.js';
import { nearest } from './cities.js';

// Photos déjà en place (importées avant la carte) : on lit une fois le GPS de chaque original pour proposer
// la ville la plus proche. Jamais d'écrasement d'une ville choisie à la main ; jamais d'ajout à la carte.
// Passage en arrière-plan au démarrage ; une photo n'est lue qu'une fois (gps_checked).
export function createLocator({ db, storageDir, log }) {
  const q = {
    pending: db.prepare('SELECT id, file FROM photos WHERE gps_checked = 0 ORDER BY id LIMIT 50'),
    city: db.prepare(`UPDATE photos SET city_id = ?, city_name = ?, city_cc = ?, city_lat = ?, city_lon = ?, city_source = 'gps'
      WHERE id = ? AND city_id IS NULL`),
    done: db.prepare('UPDATE photos SET gps_checked = 1 WHERE id = ?'),
  };
  let running = null;
  let stopping = false;
  async function pass() {
    let found = 0;
    for (let batch = q.pending.all(); batch.length && !stopping; batch = q.pending.all()) {
      for (const p of batch) {
        if (stopping) break;
        try {
          const meta = await sharp(path.join(storageDir, 'originals', p.file), { limitInputPixels: MAX_PIXELS }).metadata();
          const gps = gpsFromExif(meta.exif);
          const c = gps && nearest(gps.lat, gps.lon);
          if (c && q.city.run(c.id, c.name, c.cc, c.lat, c.lon, p.id).changes) found++;
        } catch (err) {
          log?.warn({ err: err.message, photo: p.id }, 'GPS illisible');      // original absent ou illisible : on passe
        }
        q.done.run(p.id);
      }
    }
    if (found) log?.info({ found }, 'villes proposées d’après le GPS');
    return found;
  }
  return {
    schedule() { if (!running) running = pass().catch(err => { log?.error({ err }, 'localisation des photos'); return 0; }).finally(() => { running = null; }); return running; },
    idle: () => running || Promise.resolve(0),
    stop() { stopping = true; return running || Promise.resolve(0); },
  };
}
