import crypto from 'node:crypto';

export const IDLE_TTL = 8 * 60 * 60 * 1000;          // 8 h sans activité
// 24 h au plus, même actif : un rôle retiré dans Zitadel cesse de valoir au plus tard le lendemain.
export const ABSOLUTE_TTL = 24 * 60 * 60 * 1000;
const TOUCH_AFTER = 60 * 1000;                       // évite une écriture par requête

const hash = token => crypto.createHash('sha256').update(token).digest('hex');

// Sessions côté serveur. Le cookie porte un jeton aléatoire ; la base n'en garde que l'empreinte.
export function createSessionStore(db, { now = Date.now } = {}) {
  const q = {
    insert: db.prepare(`INSERT INTO sessions (id, sub, name, email, roles, id_token, csrf, created_at, expires_at)
      VALUES (@id, @sub, @name, @email, @roles, @id_token, @csrf, @created_at, @expires_at)`),
    get: db.prepare('SELECT * FROM sessions WHERE id = ?'),
    touch: db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?'),
    delete: db.prepare('DELETE FROM sessions WHERE id = ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  };

  return {
    create({ sub, name = '', email = '', roles = [], idToken = null }) {
      const token = crypto.randomBytes(32).toString('base64url');
      const t = now();
      q.purge.run(t);
      q.insert.run({
        id: hash(token), sub, name, email, roles: JSON.stringify(roles), id_token: idToken,
        csrf: crypto.randomBytes(32).toString('base64url'),
        created_at: t, expires_at: Math.min(t + IDLE_TTL, t + ABSOLUTE_TTL),
      });
      return token;
    },

    // Renvoie la session valide et prolonge son expiration, ou null (et la supprime si expirée).
    load(token) {
      if (!token) return null;
      const id = hash(token);
      const row = q.get.get(id);
      if (!row) return null;
      const t = now();
      if (row.expires_at <= t || row.created_at + ABSOLUTE_TTL <= t) {
        q.delete.run(id);
        return null;
      }
      const expires = Math.min(t + IDLE_TTL, row.created_at + ABSOLUTE_TTL);
      if (expires - row.expires_at > TOUCH_AFTER) q.touch.run(expires, id);
      return { ...row, roles: JSON.parse(row.roles), expires_at: expires };
    },

    destroy(token) {
      if (token) q.delete.run(hash(token));
    },
  };
}
