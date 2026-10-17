import fs from 'node:fs';
import path from 'node:path';

// Vigie retirée (VIGIE_URL vide) : seul ce fichier est chargé, pour effacer ce qu'elle avait laissé.
export const SESSION_TRIGGER = 'vigie_sessions_revoked';

export const settingsOf = db => ({
  get: key => { const v = db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(key); try { return v == null ? null : JSON.parse(v); } catch { return null; } },
  set: (key, value) => db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value)),
  del: key => db.prepare('DELETE FROM settings WHERE key = ?').run(key),
});
const VIGIE_KEYS = ['vigie_config', 'vigie_comptes_vus', 'vigie_restauration_vue'];

// Sans Vigie : rien de ce qu'elle avait laissé ne reste (déclencheur des sessions, sessions fermées, contexte des
// sessions, événements en attente, repères).
export function retireVigie({ db, storageDir }) {
  db.exec(`DROP TRIGGER IF EXISTS ${SESSION_TRIGGER}`);
  db.prepare('DELETE FROM sessions_revoked').run();
  db.prepare('UPDATE sessions SET ctx_ip = NULL, ctx_net = NULL, ctx_country = NULL, ctx_ua = NULL WHERE ctx_ip IS NOT NULL OR ctx_ua IS NOT NULL').run();
  const s = settingsOf(db);
  for (const k of VIGIE_KEYS) s.del(k);
  fs.rmSync(path.join(storageDir, 'securite-attente'), { recursive: true, force: true });
}

