import crypto from 'node:crypto';

export const IDLE_TTL = 8 * 60 * 60 * 1000;          // 8 h sans activité
// 24 h au plus, même active : une session ne vaut jamais plus d'un jour (les rôles, eux, sont relus à chaque requête).
export const ABSOLUTE_TTL = 24 * 60 * 60 * 1000;
const TOUCH_AFTER = 60 * 1000;                       // évite une écriture par requête

export const hash = token => crypto.createHash('sha256').update(token).digest('hex');

// Sessions côté serveur. Le cookie porte un jeton aléatoire ; la base n'en garde que l'empreinte.
export function createSessionStore(db, { now = Date.now } = {}) {
  const q = {
    insert: db.prepare(`INSERT INTO sessions (id, sub, name, email, roles, id_token, csrf, created_at, expires_at, ctx_ip, ctx_net, ctx_country, ctx_ua, ctx_fp, ctx_asn, ctx_tls, ctx_tls_brut, auth_time)
      VALUES (@id, @sub, @name, @email, @roles, @id_token, @csrf, @created_at, @expires_at, @ctx_ip, @ctx_net, @ctx_country, @ctx_ua, @ctx_fp, @ctx_asn, @ctx_tls, @ctx_tls_brut, @auth_time)`),
    revoked: db.prepare('SELECT * FROM sessions_revoked WHERE id = ?'),
    get: db.prepare('SELECT * FROM sessions WHERE id = ?'),
    touch: db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?'),
    delete: db.prepare('DELETE FROM sessions WHERE id = ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR created_at <= ?'),
  };

  return {
    // ctx : contexte de la connexion (adresse, réseau, pays, navigateur), seulement quand la Vigie est configurée.
    // authTime : heure de l'authentification chez l'IdP (auth_time, en ms), null si l'IdP ne l'a pas donnée.
    create({ sub, name = '', email = '', roles = [], idToken = null, ctx = null, authTime = null }) {
      const token = crypto.randomBytes(32).toString('base64url');
      const t = now();
      q.purge.run(t, t - ABSOLUTE_TTL);
      q.insert.run({
        id: hash(token), sub, name, email, roles: JSON.stringify(roles), id_token: idToken,
        csrf: crypto.randomBytes(32).toString('base64url'),
        created_at: t, expires_at: Math.min(t + IDLE_TTL, t + ABSOLUTE_TTL),
        ctx_ip: ctx?.ip ?? null, ctx_net: ctx?.net ?? null, ctx_country: ctx?.country ?? null, ctx_ua: ctx?.ua ?? null, ctx_fp: ctx?.fp ?? null,
        ctx_asn: ctx?.asn ?? null, ctx_tls: ctx?.tls ?? null, ctx_tls_brut: ctx?.tlsBrut ?? null,
        auth_time: Number.isFinite(authTime) ? Math.round(authTime) : null,
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

    // Session fermée ou expirée (table remplie seulement quand la Vigie est configurée) : null si inconnue.
    revoked: token => (token ? q.revoked.get(hash(token)) || null : null),

    destroy(token) {
      if (token) q.delete.run(hash(token));
    },

    // Effacement indépendant du retour d'un cookie : l'expiration d'accès ne suffit pas à retirer les données.
    purge() { const t = now(); return q.purge.run(t, t - ABSOLUTE_TTL).changes; },
  };
}
