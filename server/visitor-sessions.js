import crypto from 'node:crypto';

// Sessions des visiteurs du site public (galeries privées ; annexe de sécurité, § 3.4 ; G24, G25, G29). Distinctes des
// sessions de l'admin (server/sessions.js) : un invité n'a ni compte ni rôle (G4).
//   - le cookie porte un jeton aléatoire de 32 octets ; la base n'en garde que l'empreinte SHA-256 (token_hash) ;
//   - l'identifiant de la session est interne et aléatoire, distinct de l'empreinte : il ne bouge pas quand le jeton
//     change (mot de passe accepté, « Quitter »), et rien de ce qui s'y rattache ne bouge ;
//   - jeton CSRF propre à la session ; il change avec le jeton ;
//   - un jeton remplacé ou fermé est gardé 48 h (visitor_tokens_revoked) : un cookie qui revient après a été copié (BV-22).
// La durée de la session ne prolonge jamais une autorisation (visitor_grants, server/spaces.js).

export const SESSION_TTL = 30 * 864e5;            // la plus longue autorisation possible (« se souvenir », 30 jours)
export const REVOKED_KEEP = 48 * 3600e3;
const TOUCH_AFTER = 60e3;

export const hashToken = token => crypto.createHash('sha256').update(String(token)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
// Identité technique d'un invité envoyée à la Vigie (jamais l'empreinte du cookie, J3) : 12 signes d'une empreinte de
// l'identifiant interne.
export const visitorRef = id => crypto.createHash('sha256').update(`visiteur:${id}`).digest('hex').slice(0, 12);
// Empreinte courte du réseau et de la famille du navigateur : « même réseau et même navigateur » sans garder ni l'un ni
// l'autre (BV-22, meme_reseau_et_navigateur).
export const ctxPrint = (net, ua) => crypto.createHash('sha256').update(`${net || ''}|${ua || ''}`).digest('hex').slice(0, 16);

export function createVisitorSessions({ db, now = Date.now }) {
  const q = {
    insert: db.prepare('INSERT INTO visitor_sessions (id, token_hash, csrf, lang, ctx, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    byHash: db.prepare('SELECT * FROM visitor_sessions WHERE token_hash = ?'),
    touch: db.prepare('UPDATE visitor_sessions SET last_seen_at = ? WHERE id = ?'),
    rotate: db.prepare('UPDATE visitor_sessions SET token_hash = ?, csrf = ?, ctx = ?, last_seen_at = ?, expires_at = ? WHERE id = ?'),
    remember: db.prepare('INSERT OR REPLACE INTO visitor_tokens_revoked (token_hash, session_id, raison, ctx, revoked_at) VALUES (?, ?, ?, ?, ?)'),
    revoked: db.prepare('SELECT * FROM visitor_tokens_revoked WHERE token_hash = ?'),
    lang: db.prepare('UPDATE visitor_sessions SET lang = ? WHERE id = ?'),
    del: db.prepare('DELETE FROM visitor_sessions WHERE id = ?'),
    purge: db.prepare('DELETE FROM visitor_sessions WHERE expires_at <= ?'),
    purgeRevoked: db.prepare('DELETE FROM visitor_tokens_revoked WHERE revoked_at < ?'),
  };
  const expired = row => row.expires_at <= now();

  return {
    // Session du cookie, ou null (inconnue, expirée : une session expirée est effacée, son jeton gardé 48 h).
    load(token) {
      if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) return null;
      const row = q.byHash.get(hashToken(token));
      if (!row) return null;
      if (expired(row)) {
        db.transaction(() => { q.remember.run(row.token_hash, row.id, 'expiree', row.ctx, now()); q.del.run(row.id); })();
        return null;
      }
      if (now() - row.last_seen_at > TOUCH_AFTER) q.touch.run(now(), row.id);
      return row;
    },
    // Jeton fermé ou remplacé depuis moins de 48 h : { session_id, raison, ctx, revoked_at }, sinon null.
    revoked(token) {
      if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) return null;
      const r = q.revoked.get(hashToken(token));
      return r && now() - r.revoked_at < REVOKED_KEEP ? r : null;
    },
    create({ ctx = '', lang = '' } = {}) {
      const token = newToken(), t = now();
      const id = crypto.randomBytes(16).toString('base64url');
      q.insert.run(id, hashToken(token), crypto.randomBytes(32).toString('base64url'), lang, ctx, t, t, t + SESSION_TTL);
      return { token, session: q.byHash.get(hashToken(token)) };
    },
    // Nouveau jeton (et nouveau jeton CSRF) pour la même session : l'ancien est gardé 48 h comme « remplacé » ou « quitté ».
    rotate(session, { raison = 'rotation', ctx = session.ctx } = {}) {
      const token = newToken(), t = now();
      db.transaction(() => {
        q.remember.run(session.token_hash, session.id, raison, session.ctx, t);
        q.rotate.run(hashToken(token), crypto.randomBytes(32).toString('base64url'), ctx, t, t + SESSION_TTL, session.id);
      })();
      return { token, session: q.byHash.get(hashToken(token)) };
    },
    setLang: (session, lang) => q.lang.run(lang, session.id),
    purge() { const t = now(); return q.purge.run(t).changes + q.purgeRevoked.run(t - REVOKED_KEEP).changes; },
  };
}
