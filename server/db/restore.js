// Restauration d'une sauvegarde (server/db/backup.js), site ARRÊTÉ :
//   node server/db/restore.js site-AAAA-MM-JJTHHMMSS.db     (un instantané de BACKUP_DIR/db, ou son chemin)
// Mêmes variables que la sauvegarde : STORAGE_DIR, DATABASE_PATH, BACKUP_DIR.
//   1. contrôle l'instantané, puis refuse si la base est ouverte (site en marche) ;
//   2. garde la base actuelle à côté, dans le dossier des données : site-avant-restauration-<date>.db ;
//   3. met l'instantané en place, sans -wal ni -shm, et ferme toutes les sessions ;
//   4. recopie seulement les originaux que cite l'instantané (files/originals, sinon supprimes/originals) et les logos
//      et la marque manquants : un original effacé que la base restaurée ne connaît plus ne revient jamais ;
//   5. liste ce qui reste à reprendre à la main : actions du journal faites après l'instantané (effacements, comptes,
//      rôles…), originaux présents dans les données mais inconnus de la base restaurée (laissés en place).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { assertPersistentStorage } from '../storage-guard.js';

const storageDir = path.resolve(process.env.STORAGE_DIR || './storage');
const dbPath = path.resolve(process.env.DATABASE_PATH || path.join(storageDir, 'site.db'));
const backupDir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : null;

const listFiles = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => !f.startsWith('.') && !f.endsWith('.part')) : []);
const copy = (from, to) => { fs.copyFileSync(from, `${to}.part`); fs.renameSync(`${to}.part`, to); };

// Base ouverte par un autre processus (site en marche) : le verrou exclusif est refusé aussitôt. Une base illisible
// (souvent la raison de la restauration) n'est pas « ouverte ».
function inUse(file) {
  if (!fs.existsSync(file)) return false;
  let db;
  try {
    db = new Database(file, { fileMustExist: true, timeout: 0 });
    db.pragma('locking_mode = EXCLUSIVE');
    db.exec('BEGIN EXCLUSIVE; COMMIT');
    return false;
  } catch (err) {
    return err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED';
  } finally {
    db?.close();
  }
}

export function restore(name) {
  if (!backupDir) throw new Error('BACKUP_DIR non défini');
  if (!name) throw new Error('usage : node server/db/restore.js site-AAAA-MM-JJTHHMMSS.db');
  const snapshot = name.includes('/') ? path.resolve(name) : path.join(backupDir, 'db', name);
  if (!fs.existsSync(snapshot)) throw new Error(`instantané introuvable : ${snapshot}`);

  // 1. Instantané contrôlé avant de toucher aux données.
  const snap = new Database(snapshot, { readonly: true, fileMustExist: true });
  let files;
  let lastAt = 0;
  try {
    const integrity = snap.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`instantané corrompu : ${integrity}`);
    files = snap.prepare('SELECT file FROM photos').pluck().all().filter(f => path.basename(f) === f);
    try { lastAt = snap.prepare('SELECT MAX(at) FROM audit_log').pluck().get() || 0; } catch { /* instantané d'avant le journal */ }
  } finally {
    snap.close();
  }
  if (inUse(dbPath)) throw new Error('la base est ouverte par le site : arrêtez d’abord la pile');

  // 2. Base actuelle gardée à côté, avec son journal WAL s'il en reste un (arrêt brutal).
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const before = path.join(path.dirname(dbPath), `site-avant-restauration-${stamp}.db`);
  const hadDb = fs.existsSync(dbPath);
  for (const x of ['', '-wal', '-shm']) if (fs.existsSync(dbPath + x)) fs.renameSync(dbPath + x, before + x);

  // 3. Instantané en place. Sessions fermées : rôles et comptes de l'instantané ne valent qu'à la prochaine connexion.
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  copy(snapshot, dbPath);
  const db = new Database(dbPath);
  let sessions;
  try { sessions = db.prepare('DELETE FROM sessions').run().changes; } finally { db.close(); }

  // 4. Fichiers.
  const report = { snapshot: path.basename(snapshot), before: hadDb ? path.basename(before) : null, sessions, originals: 0, logos: 0, missing: [], orphans: [], later: [] };
  const dataDir = d => path.join(storageDir, d);
  fs.mkdirSync(dataDir('originals'), { recursive: true });
  for (const f of files) {
    const to = path.join(dataDir('originals'), f);
    if (fs.existsSync(to)) continue;
    const from = ['files', 'supprimes'].map(d => path.join(backupDir, d, 'originals', f)).find(p => fs.existsSync(p));
    if (from) { copy(from, to); report.originals++; } else report.missing.push(f);
  }
  for (const d of ['watermarks', 'brand']) {
    for (const f of listFiles(path.join(backupDir, 'files', d))) {
      if (fs.existsSync(path.join(dataDir(d), f))) continue;
      fs.mkdirSync(dataDir(d), { recursive: true });
      copy(path.join(backupDir, 'files', d, f), path.join(dataDir(d), f));
      report.logos++;
    }
  }
  const known = new Set(files);
  report.orphans = listFiles(dataDir('originals')).filter(f => !known.has(f));

  // 5. Actions faites après l'instantané, lues dans la base gardée.
  if (hadDb) {
    try {
      const old = new Database(before, { fileMustExist: true });
      try { report.later = old.prepare('SELECT at, sub, name, action, target FROM audit_log WHERE at > ? ORDER BY at, id').all(lastAt); } finally { old.close(); }
    } catch (err) { report.journal = `journal de la base gardée illisible (${err.message})`; }
  }
  return report;
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();

if (isMain) {
  try {
    assertPersistentStorage(storageDir);
    const r = restore(process.argv[2]);
    const urgent = a => /effac|supprim|delete|compte/i.test(a.action);
    const lines = [
      `Instantané ${r.snapshot} remis en place${r.before ? ` ; base précédente gardée dans le dossier des données : ${r.before}` : ''}.`,
      `Sessions fermées : ${r.sessions}. Originaux recopiés : ${r.originals}. Logos et marque recopiés : ${r.logos}.`,
    ];
    if (r.missing.length) lines.push(`Originaux absents de la sauvegarde (${r.missing.length}) : ${r.missing.join(', ')}`);
    if (r.orphans.length) lines.push(`Originaux inconnus de la base restaurée, laissés en place (${r.orphans.length}) : ${r.orphans.join(', ')}`);
    if (r.journal) lines.push(`Attention : ${r.journal}.`);
    if (r.later.length) {
      lines.push(`Actions faites après l'instantané, à refaire si besoin (${r.later.length} ; « ! » : effacements, suppressions, comptes et rôles) :`);
      for (const a of r.later) lines.push(`${urgent(a) ? '!' : ' '} ${new Date(a.at).toISOString().slice(0, 16).replace('T', ' ')}  ${a.name || a.sub || '?'}  ${a.action}${a.target ? `  ${a.target}` : ''}`);
    }
    console.log(lines.join('\n'));
  } catch (err) {
    console.error(`Restauration refusée : ${err.message}`);
    process.exitCode = 1;
  }
}
