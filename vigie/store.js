import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ALL, isType, SEVERITIES } from './vocabulaire.js';

// Base de la Vigie : événements chaînés, compteurs par jour, décisions, réglages.
//   - chaîne : chain = HMAC(VIGIE_LOG_KEY, maillon précédent ‖ ligne canonique) ; la clé n'est jamais dans la base ;
//     une ligne modifiée, insérée à la main ou effacée (seq sans trou) se voit à la vérification ;
//   - purge : événements de plus de VIGIE_RETENTION_DAYS (6 mois) effacés par paquets ; le maillon de la dernière ligne
//     effacée devient l'ancre de la vérification.

const FIELDS = ['id', 'recu_a', 'survenu_a', 'type', 'severity', 'composant', 'emetteur', 'canal', 'confiance', 'reference', 'sub', 'session', 'ip', 'ip_net',
  'country', 'city', 'lat', 'lon', 'ua', 'ua_family', 'method', 'route', 'status', 'detail', 'retard'];
const canonical = row => JSON.stringify(FIELDS.map(f => row[f] ?? null));

export function openVigieDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('secure_delete = ON');
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  const dir = new URL('./migrations/', import.meta.url);
  const done = new Set(db.prepare('SELECT name FROM migrations').pluck().all());
  for (const name of fs.readdirSync(dir).filter(f => /^\d+_.+\.sql$/.test(f)).sort()) {
    if (done.has(name)) continue;
    db.transaction(() => { db.exec(fs.readFileSync(new URL(name, dir), 'utf8')); db.prepare('INSERT INTO migrations (name) VALUES (?)').run(name); })();
  }
  return db;
}

export function createStore({ db, logKey, now = Date.now }) {
  const mac = (prev, row) => crypto.createHmac('sha256', logKey).update(`${prev}\n${canonical(row)}`).digest('hex');
  const q = {
    get: db.prepare('SELECT value FROM settings WHERE key = ?').pluck(),
    set: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
    last: db.prepare('SELECT chain FROM events ORDER BY seq DESC LIMIT 1').pluck(),
    exists: db.prepare('SELECT 1 FROM events WHERE id = ?'),
    insert: db.prepare(`INSERT INTO events (${FIELDS.join(', ')}, chain) VALUES (${FIELDS.map(f => `@${f}`).join(', ')}, @chain)`),
    daily: db.prepare(`INSERT INTO daily (day, type, severity, composant, n) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT (day, type, severity, composant) DO UPDATE SET n = n + 1`),
  };
  const setting = {
    get: (k, d = null) => { const v = q.get.get(k); if (v == null) return d; try { return JSON.parse(v); } catch { return d; } },
    set: (k, v) => q.set.run(k, JSON.stringify(v)),
  };
  const anchor = () => setting.get('chaine_ancre', { seq: 0, chain: 'origine' });

  // Ajoute des événements déjà validés (champs bornés), dans une seule transaction ; ignore un identifiant déjà connu
  // (lot renvoyé). Renvoie le nombre de lignes ajoutées.
  const add = db.transaction(events => {
    let prev = q.last.get() ?? anchor().chain;
    let n = 0;
    for (const e of events) {
      if (q.exists.get(e.id)) continue;
      if (!isType(e.type) || !SEVERITIES.includes(e.severity)) throw new Error(`événement invalide : ${e.type}`);
      const row = Object.fromEntries(FIELDS.map(f => [f, e[f] ?? null]));
      row.recu_a ??= now();
      row.retard = row.retard ? 1 : 0;
      row.detail = e.detail == null ? null : typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail);
      row.chain = mac(prev, row);
      q.insert.run(row);
      q.daily.run(new Date(row.recu_a).toISOString().slice(0, 10), row.type, row.severity, row.composant);
      prev = row.chain;
      n += 1;
    }
    return n;
  });

  // Événement constaté par la Vigie elle-même.
  const own = (type, { severity, detail, emetteur = '', sub, reference, composant, ip, ip_net } = {}) => add([{
    id: crypto.randomUUID(), recu_a: now(), survenu_a: now(), type, severity: severity || ALL[type].severity,
    composant: composant || ALL[type].composant, emetteur, canal: 'interne', confiance: 'constaté', reference, sub, ip, ip_net, detail,
  }]);

  // Vérifie la chaîne depuis l'ancre : renvoie { ok, lignes, rupture? }.
  function verify() {
    const a = anchor();
    let prev = a.chain, expected = a.seq + 1, lignes = 0;
    for (const row of db.prepare('SELECT * FROM events WHERE seq > ? ORDER BY seq').iterate(a.seq)) {
      if (row.seq !== expected) return { ok: false, lignes, rupture: { seq: expected, raison: 'ligne manquante' } };
      if (mac(prev, row) !== row.chain) return { ok: false, lignes, rupture: { seq: row.seq, raison: 'ligne modifiée ou insérée' } };
      prev = row.chain; expected += 1; lignes += 1;
    }
    const max = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'events'").pluck().get() ?? a.seq;
    if (max > expected - 1) return { ok: false, lignes, rupture: { seq: expected, raison: 'dernières lignes effacées' } };
    return { ok: true, lignes };
  }

  // Purge des événements trop anciens (par paquets), et des compteurs (25 mois) et nonces (10 min).
  function purge(retentionDays) {
    const before = now() - retentionDays * 864e5;
    let removed = 0;
    for (;;) {
      const rows = db.prepare('SELECT seq, chain FROM events WHERE recu_a < ? ORDER BY seq LIMIT 5000').all(before);
      if (!rows.length) break;
      const last = rows.at(-1);
      // On n'efface que le début de la chaîne (une ligne ancienne isolée après une plus récente reste).
      const first = db.prepare('SELECT MIN(seq) FROM events').pluck().get();
      const contiguous = rows.filter((r, i) => r.seq === first + i);
      if (!contiguous.length) break;
      const end = contiguous.at(-1);
      db.transaction(() => {
        db.prepare('DELETE FROM events WHERE seq <= ?').run(end.seq);
        setting.set('chaine_ancre', { seq: end.seq, chain: end.chain });
      })();
      removed += contiguous.length;
      if (end !== last) break;
    }
    db.prepare('DELETE FROM daily WHERE day < ?').run(new Date(now() - 762 * 864e5).toISOString().slice(0, 10));
    db.prepare('DELETE FROM nonces WHERE at < ?').run(now() - 10 * 60e3);
    return removed;
  }

  return { db, add, own, verify, purge, setting };
}
