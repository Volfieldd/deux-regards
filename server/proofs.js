import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { requestTimestamp, parseReply, verifyToken, TimestampError } from './timestamp.js';

// Reprise après erreur : 2, 4, 8… minutes, au plus une fois par jour.
const RETRY_BASE = 2 * 60 * 1000;
const RETRY_MAX = 24 * 60 * 60 * 1000;
const PERIOD = 60 * 60 * 1000;                     // passage de reprise toutes les heures

export async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

// Preuves d'antériorité : empreinte SHA-256 de chaque original, horodatée par une autorité RFC 3161.
// Une seule tâche à la fois ; les échecs (réseau, TSA) sont repris plus tard, sans bloquer l'admin.
// fetchImpl, nonce et now sont remplaçables pour les tests (faux service, jeton enregistré).
export function createProofService({ db, storageDir, tsa, log, fetchImpl = fetch, nonce, now = Date.now }) {
  const caPem = tsa.caFile ? fs.readFileSync(tsa.caFile, 'utf8') : null;
  const q = {
    missingHash: db.prepare('SELECT id, file FROM photos WHERE sha256 IS NULL'),
    todo: db.prepare(`SELECT p.id, p.sha256, t.status, t.sha256 AS ts_sha, t.attempts, t.updated_at
      FROM photos p LEFT JOIN timestamps t ON t.photo_id = p.id
      WHERE p.sha256 IS NOT NULL AND (t.photo_id IS NULL OR t.status <> 'ok' OR t.sha256 <> p.sha256)`),
    get: db.prepare('SELECT * FROM timestamps WHERE photo_id = ?'),
    photo: db.prepare('SELECT id, file, sha256 FROM photos WHERE id = ?'),
    ok: db.prepare(`INSERT INTO timestamps (photo_id, sha256, tsa, status, token, gen_time, serial, signer, error, attempts, updated_at)
      VALUES (@photo_id, @sha256, @tsa, 'ok', @token, @gen_time, @serial, @signer, NULL, @attempts, @updated_at)
      ON CONFLICT(photo_id) DO UPDATE SET sha256 = excluded.sha256, tsa = excluded.tsa, status = 'ok', token = excluded.token,
        gen_time = excluded.gen_time, serial = excluded.serial, signer = excluded.signer, error = NULL,
        attempts = excluded.attempts, updated_at = excluded.updated_at`),
    error: db.prepare(`INSERT INTO timestamps (photo_id, sha256, tsa, status, error, attempts, updated_at)
      VALUES (@photo_id, @sha256, @tsa, 'error', @error, @attempts, @updated_at)
      ON CONFLICT(photo_id) DO UPDATE SET sha256 = excluded.sha256, tsa = excluded.tsa, status = 'error', error = excluded.error,
        attempts = excluded.attempts, updated_at = excluded.updated_at`),
    counts: db.prepare(`SELECT
      (SELECT COUNT(*) FROM photos) AS photos,
      (SELECT COUNT(*) FROM timestamps t JOIN photos p ON p.id = t.photo_id WHERE t.status = 'ok' AND t.sha256 = p.sha256) AS ok,
      (SELECT COUNT(*) FROM timestamps WHERE status = 'error') AS errors`),
  };
  const setHash = db.prepare('UPDATE photos SET sha256 = ? WHERE id = ?');

  let queue = Promise.resolve();
  let passQueued = false;
  let timer = null;
  const enqueue = job => (queue = queue.then(job, job));

  // Empreintes manquantes (photos antérieures à cette fonction, seed).
  async function fillHashes() {
    for (const p of q.missingHash.all()) {
      try {
        setHash.run(await sha256File(path.join(storageDir, 'originals', p.file)), p.id);
      } catch (err) {
        log?.error({ err, photo: p.id }, 'empreinte de l’original impossible');
      }
    }
  }

  async function stamp(p, attempts) {
    const base = { photo_id: p.id, sha256: p.sha256, tsa: tsa.url, attempts, updated_at: now() };
    try {
      const r = await requestTimestamp(tsa.url, p.sha256, { fetchImpl, nonce: nonce?.() });
      const { signer } = verifyToken(r, { caPem });
      q.ok.run({ ...base, token: r.reply, gen_time: r.genTime.toISOString(), serial: r.serial, signer });
      return true;
    } catch (err) {
      q.error.run({ ...base, error: err instanceof TimestampError ? err.message : `service injoignable (${err.cause?.code || err.name})` });
      log?.warn({ err: err.message, photo: p.id }, 'horodatage impossible, nouvel essai plus tard');
      return false;
    }
  }

  const due = row => row.status !== 'error' || row.ts_sha !== row.sha256
    || now() - row.updated_at >= Math.min(RETRY_BASE * 2 ** Math.max(row.attempts - 1, 0), RETRY_MAX);

  return {
    enabled: Boolean(tsa.url),

    // Passage complet : empreintes manquantes, puis horodatage de ce qui doit l'être.
    schedule({ retryNow = false } = {}) {
      if (passQueued) return queue;
      passQueued = true;
      return enqueue(async () => {
        passQueued = false;
        await fillHashes();
        if (!tsa.url) return;
        let done = 0;
        for (const row of q.todo.all()) {
          if (!retryNow && !due(row)) continue;
          const attempts = row.ts_sha === row.sha256 && row.status === 'error' ? row.attempts + 1 : 1;
          if (await stamp(row, attempts)) done++;
        }
        if (done) log?.info({ done }, 'originaux horodatés');
      });
    },

    // Reprise périodique des échecs (réseau coupé, TSA indisponible).
    start() {
      this.schedule();
      if (tsa.url && !timer) timer = setInterval(() => this.schedule(), PERIOD).unref();
    },
    stop() { clearInterval(timer); timer = null; return queue; },
    idle: () => queue,

    status: () => q.counts.get(),
    get: id => q.get.get(id),

    // Contrôle complet d'une preuve : l'original sur le disque a toujours la même empreinte,
    // le jeton porte sur elle, sa signature est valide et émise par l'autorité attendue.
    async verify(id) {
      const p = q.photo.get(id);
      const t = q.get.get(id);
      if (!p || !t || t.status !== 'ok') return { ok: false, reason: 'pas encore horodatée' };
      try {
        const current = await sha256File(path.join(storageDir, 'originals', p.file));
        if (current !== p.sha256) return { ok: false, reason: 'l’original a été modifié depuis son import' };
        const parsed = parseReply(t.token);
        if (parsed.hashedMessage !== p.sha256) return { ok: false, reason: 'le jeton ne porte pas sur cet original' };
        const v = verifyToken(parsed, { caPem });
        return { ok: true, genTime: parsed.genTime, signer: v.signer, chained: v.chained };
      } catch (err) {
        return { ok: false, reason: err.message };
      }
    },
  };
}
