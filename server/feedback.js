import { createVault } from './vault.js';

// Retours des visiteurs sur une photo : « j'aime » anonymes et signalements.
//   - J'aime : un compteur par photo. Pour éviter les doubles, la mémoire du serveur garde quelques heures
//     « telle adresse a aimé telle photo » (jamais en base) ; le navigateur retient de son côté ce qu'il a aimé.
//   - Signalements : photo qui ne devrait pas être en ligne, suggestion pour le texte, autre. Message et adresse
//     facultative chiffrés ; effacés 12 mois après leur envoi.
export const REPORT_KINDS = ['inapproprie', 'texte', 'autre'];
const HOURS = 12 * 3600 * 1000;
const MAX_SEEN = 100_000;                   // mémoire des « j'aime » récents (une centaine d'octets chacun)
const RETENTION = 365 * 864e5;
const EMAIL = /^[^\s@<>]{1,100}@[^\s@<>]{1,100}\.[^\s@<>]{2,30}$/;
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

export class FeedbackError extends Error {
  constructor(errors) { super(Object.values(errors).join(' ')); this.errors = errors; }
}

export function createFeedback({ db, vault = createVault(null), now = () => Date.now(), maxSeen = MAX_SEEN }) {
  // « clé client:photo » → date du « j'aime », dans l'ordre chronologique (une clé aimée de nouveau est replacée en
  // queue) : les entrées expirées sont en tête, oubliées au fil de l'eau ; au-delà de maxSeen, les plus anciennes.
  const seen = new Map();
  const forget = () => {
    const t = now();
    for (const [k, at] of seen) { if (t - at <= HOURS) break; seen.delete(k); }
    while (seen.size >= maxSeen) seen.delete(seen.keys().next().value);
  };
  const q = {
    likes: db.prepare('SELECT likes FROM photos WHERE id = ?').pluck(),
    add: db.prepare('UPDATE photos SET likes = likes + 1 WHERE id = ?'),
    remove: db.prepare('UPDATE photos SET likes = MAX(likes - 1, 0) WHERE id = ?'),
  };

  // J'aime (ou ne plus aimer) : une fois par client et par photo ; renvoie le nouveau total, et si la demande a compté
  // (counted faux : cette adresse avait déjà aimé, ou n'avait rien à retirer ; le navigateur ne retient alors rien).
  function like(photoId, client, { undo = false } = {}) {
    forget();
    const key = `${client}:${photoId}`;
    const had = seen.has(key) && now() - seen.get(key) <= HOURS;
    if (!undo && !had) { q.add.run(photoId); seen.delete(key); seen.set(key, now()); }
    if (undo && had) { q.remove.run(photoId); seen.delete(key); }
    return { likes: q.likes.get(photoId) ?? 0, liked: !undo, counted: undo ? had : !had };
  }

  function report(photoId, body, { lang = 'fr' } = {}) {
    const errors = {};
    const kind = REPORT_KINDS.includes(body.kind) ? body.kind : '';
    if (!kind) errors.kind = 'kind';
    const message = clean(body.message, 2000);
    const email = clean(body.email, 200);
    if ((kind === 'texte' || kind === 'autre') && !message) errors.message = 'message';
    if (email && !EMAIL.test(email)) errors.email = 'email';
    if (Object.keys(errors).length) throw new FeedbackError(errors);
    return Number(db.prepare('INSERT INTO photo_reports (photo_id, kind, message, email, lang, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(photoId, kind, vault.seal(message), vault.seal(email), lang, now()).lastInsertRowid);
  }
  const open = r => ({ ...r, message: vault.open(r.message), email: vault.open(r.email) });
  const reports = ({ status = null } = {}) => db.prepare(`SELECT r.*, p.title, p.slug, p.file, p.width, p.height, p.variant_key, p.status AS photo_status, p.id AS pid
    FROM photo_reports r JOIN photos p ON p.id = r.photo_id ${status ? 'WHERE r.status = ?' : ''} ORDER BY r.status = 'nouveau' DESC, r.created_at DESC LIMIT 300`)
    .all(...(status ? [status] : [])).map(open);
  const pending = () => db.prepare("SELECT COUNT(*) FROM photo_reports WHERE status = 'nouveau'").pluck().get();
  const done = id => db.prepare("UPDATE photo_reports SET status = 'traite', done_at = ? WHERE id = ?").run(now(), id).changes > 0;
  const remove = id => db.prepare('DELETE FROM photo_reports WHERE id = ?').run(id).changes > 0;
  const purge = () => db.prepare('DELETE FROM photo_reports WHERE created_at < ?').run(now() - RETENTION).changes;
  // Données chiffrées après coup (clé ajoutée) : comme les rencontres.
  function sealExisting() {
    if (!vault.enabled) return 0;
    let n = 0;
    for (const r of db.prepare('SELECT id, message, email FROM photo_reports').all()) {
      const set = {};
      if (r.message && !vault.sealed(r.message)) set.message = vault.seal(r.message);
      if (r.email && !vault.sealed(r.email)) set.email = vault.seal(r.email);
      if (Object.keys(set).length) { db.prepare(`UPDATE photo_reports SET ${Object.keys(set).map(k => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...set, id: r.id }); n++; }
    }
    return n;
  }
  return { like, report, reports, pending, done, remove, purge, sealExisting };
}
