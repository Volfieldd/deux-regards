import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ALL, isType, SEVERITIES } from './vocabulaire.js';

// Base de la Vigie : événements chaînés, compteurs par jour, décisions, réglages.
//   - chaîne : chain = HMAC(VIGIE_LOG_KEY, maillon précédent ‖ ligne canonique) ; la clé n'est jamais dans la base ;
//     une ligne modifiée, insérée à la main ou effacée (seq sans trou) se voit à la vérification, qui continue après
//     une rupture (une ligne abîmée n'aveugle pas la suite) ;
//   - valeurs normalisées au type de leur colonne avant le calcul (texte bien formé, nombres) : la ligne relue donne le
//     même maillon ;
//   - purge : événements de plus de VIGIE_RETENTION_DAYS (6 mois) effacés par paquets ; l'ancre (maillon et date de la
//     dernière ligne effacée) est signée avec la clé du journal, et une purge est elle-même un événement chaîné ; une
//     ancre recopiée à la main, ou plus récente que la durée de conservation, est une rupture ;
//   - tête de la chaîne publiée chaque nuit hors de la base (journal du conteneur) : une fin de journal effacée se voit
//     en la comparant.

const TEXT = ['id', 'type', 'severity', 'composant', 'emetteur', 'canal', 'confiance', 'reference', 'sub', 'session', 'ip', 'ip_net', 'country', 'city', 'ua',
  'ua_family', 'method', 'route', 'detail'];
const INT = ['recu_a', 'survenu_a', 'status', 'retard'];
const REAL = ['lat', 'lon'];
const FIELDS = ['id', 'recu_a', 'survenu_a', 'type', 'severity', 'composant', 'emetteur', 'canal', 'confiance', 'reference', 'sub', 'session', 'ip', 'ip_net',
  'country', 'city', 'lat', 'lon', 'ua', 'ua_family', 'method', 'route', 'status', 'detail', 'retard'];
const KIND = Object.fromEntries([...TEXT.map(f => [f, 'text']), ...INT.map(f => [f, 'int']), ...REAL.map(f => [f, 'real'])]);

// Valeur au type de sa colonne, comme SQLite la rendra.
function norm(f, v) {
  if (v == null) return null;
  if (KIND[f] === 'text') return (typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)).toWellFormed();
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return KIND[f] === 'int' ? Math.trunc(n) : n;
}
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

export function createStore({ db, logKey, retentionDays = 183, now = Date.now }) {
  const hmac = text => crypto.createHmac('sha256', logKey).update(text).digest('hex');
  const mac = (prev, row) => hmac(`${prev}\n${canonical(row)}`);
  const anchorMac = a => hmac(`ancre|${a.seq}|${a.chain}|${a.recu_a}`);
  const q = {
    get: db.prepare('SELECT value FROM settings WHERE key = ?').pluck(),
    set: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
    last: db.prepare('SELECT chain FROM events ORDER BY seq DESC LIMIT 1').pluck(),
    head: db.prepare('SELECT seq, chain FROM events ORDER BY seq DESC LIMIT 1'),
    exists: db.prepare('SELECT 1 FROM events WHERE id = ?'),
    insert: db.prepare(`INSERT INTO events (${FIELDS.join(', ')}, chain) VALUES (${FIELDS.map(f => `@${f}`).join(', ')}, @chain)`),
    daily: db.prepare(`INSERT INTO daily (day, type, severity, composant, n) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT (day, type, severity, composant) DO UPDATE SET n = n + 1`),
  };
  const setting = {
    get: (k, d = null) => { const v = q.get.get(k); if (v == null) return d; try { return JSON.parse(v); } catch { return d; } },
    set: (k, v) => q.set.run(k, JSON.stringify(v)),
  };
  const ORIGIN = { seq: 0, chain: 'origine', recu_a: 0 };
  const anchor = () => setting.get('chaine_ancre', ORIGIN);

  // Ajoute des événements déjà validés, dans une seule transaction (immédiate : la ligne de commande écrit à côté) ;
  // ignore un identifiant déjà connu (lot renvoyé). Renvoie le nombre de lignes ajoutées.
  let added = [];
  const add = db.transaction(events => {
    let prev = q.last.get() ?? anchor().chain;
    let n = 0;
    for (const e of events) {
      if (!isType(e.type) || !SEVERITIES.includes(e.severity)) throw new Error(`événement invalide : ${e.type}`);
      const row = Object.fromEntries(FIELDS.map(f => [f, norm(f, e[f])]));
      if (!row.id || q.exists.get(row.id)) continue;
      row.recu_a ??= now();
      row.retard = row.retard ? 1 : 0;
      row.chain = mac(prev, row);
      row.seq = Number(q.insert.run(row).lastInsertRowid);
      added.push(row);
      q.daily.run(new Date(row.recu_a).toISOString().slice(0, 10), row.type, row.severity, row.composant);
      prev = row.chain;
      n += 1;
    }
    return n;
  });
  // Après l'écriture, les lignes ajoutées sont remises aux abonnés (moteur de détection) ; une erreur d'un abonné ne
  // remet jamais en cause ce qui est écrit.
  const listeners = [];
  const addNow = events => {
    added = [];
    const n = add.immediate(events);
    const rows = added;
    added = [];
    if (rows.length) for (const l of listeners) { try { l(rows); } catch (err) { console.error(`Vigie : abonné : ${err.message}`); } }
    return n;
  };

  // Événement constaté par la Vigie elle-même.
  const own = (type, { severity, detail, emetteur = '', sub, reference, composant, ip, ip_net } = {}) => addNow([{
    id: crypto.randomUUID(), recu_a: now(), survenu_a: now(), type, severity: severity || ALL[type].severity,
    composant: composant || ALL[type].composant, emetteur, canal: 'interne', confiance: 'constaté', reference, sub, ip, ip_net, detail,
  }]);

  // Vérifie la chaîne depuis l'ancre : { ok, lignes, ruptures, rupture (la première) }. Continue après une rupture.
  function verify() {
    const ruptures = [];
    const rupture = (seq, raison) => { if (ruptures.length < 20) ruptures.push({ seq, raison }); };
    const a = anchor();
    if (a.seq !== 0 && a.mac !== anchorMac(a)) rupture(a.seq, 'ancre de purge falsifiée');
    else if (a.seq !== 0 && a.recu_a > now() - (retentionDays - 1) * 864e5) rupture(a.seq, 'purge avant la fin de la durée de conservation');
    let prev = a.chain, expected = a.seq + 1, lignes = 0;
    for (const row of db.prepare('SELECT * FROM events WHERE seq > ? ORDER BY seq').iterate(a.seq)) {
      if (row.seq !== expected) rupture(expected, 'ligne manquante');
      if (mac(prev, row) !== row.chain) rupture(row.seq, 'ligne modifiée ou insérée');
      prev = row.chain; expected = row.seq + 1; lignes += 1;
    }
    const max = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'events'").pluck().get() ?? a.seq;
    if (max > expected - 1) rupture(expected, 'dernières lignes effacées');
    const published = setting.get('tete_publiee');
    if (published && published.mac === hmac(`tete|${published.seq}|${published.chain}`) && published.seq > expected - 1) rupture(expected, 'journal plus court que sa dernière tête publiée');
    return ruptures.length ? { ok: false, lignes, rupture: ruptures[0], ruptures } : { ok: true, lignes };
  }

  // Tête de la chaîne (dernier numéro et maillon) : gardée signée et publiée hors de la base chaque nuit.
  function head() {
    const h = q.head.get() || { seq: anchor().seq, chain: anchor().chain };
    const signed = { seq: h.seq, chain: h.chain, at: now(), mac: hmac(`tete|${h.seq}|${h.chain}`) };
    setting.set('tete_publiee', signed);
    return signed;
  }

  // Purge des événements trop anciens (par paquets, seulement le début de la chaîne), et des compteurs (25 mois) et
  // nonces (10 min). L'ancre est signée ; la purge est notée dans la chaîne.
  function purge() {
    const before = now() - retentionDays * 864e5;
    let removed = 0, last = null;
    for (;;) {
      const first = db.prepare('SELECT MIN(seq) FROM events').pluck().get();
      if (first == null) break;
      const rows = db.prepare('SELECT seq, chain, recu_a FROM events WHERE seq >= ? ORDER BY seq LIMIT 5000').all(first);
      const old = [];
      for (const r of rows) { if (r.recu_a >= before || r.seq !== first + old.length) break; old.push(r); }
      if (!old.length) break;
      const end = old.at(-1);
      const a = { seq: end.seq, chain: end.chain, recu_a: end.recu_a };
      db.transaction(() => {
        db.prepare('DELETE FROM events WHERE seq <= ?').run(end.seq);
        setting.set('chaine_ancre', { ...a, mac: anchorMac(a) });
      }).immediate();
      removed += old.length; last = end;
      if (old.length < rows.length) break;
    }
    if (removed) own('vigie_purge', { emetteur: 'vigie/store.js', detail: { lignes: removed, jusqua_seq: last.seq, conservation_jours: retentionDays } });
    db.prepare('DELETE FROM daily WHERE day < ?').run(new Date(now() - 762 * 864e5).toISOString().slice(0, 10));
    db.prepare('DELETE FROM nonces WHERE at < ?').run(now() - 10 * 60e3);
    return removed;
  }

  return { db, add: addNow, own, verify, purge, head, setting, hmac, retentionDays, onAdded: fn => listeners.push(fn) };
}
