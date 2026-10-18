import crypto from 'node:crypto';
import { clean } from '../util.js';

// Sessions de la console (annexe architecture § 5.2) : 1 h au plus, 15 min sans activité ; le plafond des droits est
// relu toutes les 5 minutes ; ré-authentification de moins de 5 minutes avant une action forcée ou un interrupteur.
// Jeton du cookie : 32 octets aléatoires ; la base n'en garde que l'empreinte.
export const IDLE = 15 * 60e3;
export const ABSOLUTE = 3600e3;
export const CEILING_EVERY = 5 * 60e3;
export const CEILING_GRACE = 15 * 60e3;          // Zitadel injoignable : la lecture continue 15 min sur le dernier plafond lu
export const FRESH = 5 * 60e3;
export const TX_TTL = 10 * 60e3;

const digest = token => crypto.createHash('sha256').update(String(token)).digest('hex');

export function createSessions({ db, now = Date.now }) {
  const q = {
    insert: db.prepare(`INSERT INTO console_sessions (id, sub, nom, plafond, plafond_lu, access, csrf, cree_a, vu_a, auth_a, ip, ua)
      VALUES (@id, @sub, @nom, @plafond, @t, @access, @csrf, @t, @t, @auth, @ip, @ua)`),
    get: db.prepare('SELECT * FROM console_sessions WHERE id = ? AND ferme_a IS NULL'),
    touch: db.prepare('UPDATE console_sessions SET vu_a = ? WHERE id = ?'),
    close: db.prepare('UPDATE console_sessions SET ferme_a = ?, ferme_raison = ? WHERE id = ? AND ferme_a IS NULL'),
    closeSub: db.prepare('UPDATE console_sessions SET ferme_a = ?, ferme_raison = ? WHERE sub = ? AND ferme_a IS NULL'),
    ceiling: db.prepare('UPDATE console_sessions SET plafond = ?, plafond_lu = ? WHERE id = ?'),
    auth: db.prepare('UPDATE console_sessions SET auth_a = ? WHERE id = ?'),
    purge: db.prepare('DELETE FROM console_sessions WHERE cree_a < ?'),
    setMessage: db.prepare('UPDATE console_sessions SET message = ? WHERE id = ?'),
    getMessage: db.prepare('SELECT message FROM console_sessions WHERE id = ?').pluck(),
    clearMessage: db.prepare('UPDATE console_sessions SET message = NULL WHERE id = ? AND message IS NOT NULL'),
    txPut: db.prepare('INSERT INTO console_tx (state, verifier, nonce, retour, reauth, cree_a) VALUES (?, ?, ?, ?, ?, ?)'),
    txTake: db.prepare('DELETE FROM console_tx WHERE state = ? RETURNING *'),
    txPurge: db.prepare('DELETE FROM console_tx WHERE cree_a < ?'),
    txCount: db.prepare('SELECT COUNT(*) FROM console_tx').pluck(),
    txTrim: db.prepare('DELETE FROM console_tx WHERE state IN (SELECT state FROM console_tx ORDER BY cree_a LIMIT ?)'),
  };
  return {
    open({ sub, nom, plafond, access, authA, ip, ua }) {
      const token = crypto.randomBytes(32).toString('base64url');
      const id = digest(token);
      const t = now();
      q.insert.run({ id, sub, nom: clean(nom, 120), plafond, t, access: clean(access, 200), csrf: crypto.randomBytes(24).toString('base64url'),
        auth: Math.min(authA ?? t, t), ip: clean(ip, 64), ua: clean(ua, 300) });
      return { token, id };
    },
    find: token => (typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? q.get.get(digest(token)) || null : null),
    byId: id => q.get.get(String(id)) || null,
    touch: id => q.touch.run(now(), id),
    close: (id, raison) => q.close.run(now(), raison, id).changes,
    closeSub: (sub, raison) => q.closeSub.run(now(), raison, sub).changes,
    setCeiling: (id, plafond) => q.ceiling.run(plafond, now(), id),
    setAuth: (id, at) => q.auth.run(Math.min(at, now()), id),
    // Message d'une action pour la page suivante (une fois).
    setMessage: (id, m) => q.setMessage.run(JSON.stringify(m).slice(0, 4000), id),
    takeMessage: db.transaction(id => {
      const v = q.getMessage.get(id);
      if (!v) return null;
      q.clearMessage.run(id);
      try { return JSON.parse(v); } catch { return null; }
    }),
    // Connexions en cours : à usage unique, 10 minutes ; 500 au plus (les plus anciennes cèdent la place).
    putTx(tx) {
      q.txPurge.run(now() - TX_TTL);
      const n = q.txCount.get();
      if (n >= 500) q.txTrim.run(n - 499);
      q.txPut.run(tx.state, tx.verifier, tx.nonce, tx.retour, tx.reauth || null, now());
    },
    takeTx(state) {
      if (typeof state !== 'string' || state.length > 200) return null;
      const tx = q.txTake.get(state);
      return tx && tx.cree_a >= now() - TX_TTL ? tx : null;
    },
    // Sessions de plus de 7 jours effacées (fermées ou échues depuis longtemps ; le journal reste dans les événements).
    purge: () => q.purge.run(now() - 7 * 864e5).changes,
  };
}
