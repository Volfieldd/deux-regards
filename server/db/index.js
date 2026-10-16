import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  // Une donnée effacée (droit à l'effacement, purges) est mise à zéro dans le fichier, au lieu de rester lisible dans
  // l'espace libre des pages jusqu'à ce qu'il soit réutilisé.
  db.pragma('secure_delete = ON');
  return db;
}

// Restes des données effacées avant secure_delete (16 octobre 2026) : la base est reconstruite une fois par un VACUUM
// (hors transaction, donc pas dans une migration), puis le journal WAL est vidé.
export function vacuumOnce(db) {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'base_nettoyee'").get()) return false;
  db.exec('VACUUM');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.prepare("INSERT INTO settings (key, value) VALUES ('base_nettoyee', ?)").run(JSON.stringify(new Date().toISOString()));
  return true;
}

// Applique dans l'ordre les fichiers NNN_nom.sql pas encore passés.
export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  const done = new Set(db.prepare('SELECT name FROM migrations').pluck().all());
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => /^\d+_.+\.sql$/.test(f)).sort();
  const applied = [];
  for (const name of files) {
    if (done.has(name)) continue;
    const sql = fs.readFileSync(new URL(name, MIGRATIONS_DIR), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(name);
    })();
    applied.push(name);
  }
  return applied;
}
