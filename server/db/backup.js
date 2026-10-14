// Sauvegarde : instantané cohérent de la base (API de sauvegarde SQLite, même serveur en marche)
// et copie incrémentale des fichiers irremplaçables (originaux, logos). Les variantes se recalculent.
//
//   node server/db/backup.js            une sauvegarde
//   node server/db/backup.js --loop     une sauvegarde, puis toutes les BACKUP_INTERVAL_HOURS (24 h)
//
// BACKUP_DIR/
//   db/site-AAAA-MM-JJTHHMMSS.db   instantanés (les BACKUP_KEEP plus récents, 14 par défaut)
//   files/originals/…               originaux : ajoutés ; un original supprimé dans l'admin reste récupérable
//   files/watermarks/…              depuis la sauvegarde pendant BACKUP_DELETED_DAYS (90 jours), puis il est
//   files/brand/…                   effacé (droit à l'effacement : rien n'est gardé indéfiniment)
//   files/<dossier>/.absents.json   date à laquelle chaque fichier a disparu des données
//   last.json                       compte rendu de la dernière sauvegarde
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { assertPersistentStorage } from '../storage-guard.js';

const storageDir = path.resolve(process.env.STORAGE_DIR || './storage');
const dbPath = path.resolve(process.env.DATABASE_PATH || path.join(storageDir, 'site.db'));
const backupDir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : null;
const keep = Math.max(Number.parseInt(process.env.BACKUP_KEEP, 10) || 14, 1);
const intervalH = Math.max(Number(process.env.BACKUP_INTERVAL_HOURS) || 24, 1);
const FILE_DIRS = ['originals', 'watermarks', 'brand'];
const deletedDays = Math.max(Number(process.env.BACKUP_DELETED_DAYS) || 90, 1);

const log = (msg, extra = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...extra }));

// Copie les fichiers absents de la sauvegarde (les originaux ne changent jamais : un nom suffit).
function copyNew(src, dst) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(src)) {
    const from = path.join(src, f);
    const to = path.join(dst, f);
    if (!fs.statSync(from).isFile() || (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size)) continue;
    fs.copyFileSync(from, `${to}.part`);
    fs.renameSync(`${to}.part`, to);
    n++;
  }
  return n;
}

// Fichiers supprimés des données : gardés dans la sauvegarde deletedDays jours après leur disparition, puis effacés.
// Garde-fou : un dossier source absent ou vide (montage raté) n'efface rien.
function pruneDeleted(src, dst, nowMs) {
  if (!fs.existsSync(dst)) return 0;
  const present = fs.existsSync(src) ? new Set(fs.readdirSync(src)) : new Set();
  const stored = fs.readdirSync(dst).filter(f => !f.startsWith('.') && !f.endsWith('.part'));
  if (!present.size && stored.length) { log('purge des fichiers supprimés ignorée : dossier source vide ou absent', { src }); return 0; }
  const manifest = path.join(dst, '.absents.json');
  let absent = {};
  try { absent = JSON.parse(fs.readFileSync(manifest, 'utf8')); } catch { absent = {}; }
  let pruned = 0;
  const next = {};
  for (const f of stored) {
    if (present.has(f)) continue;
    const since = Number(absent[f]) || nowMs;
    if (nowMs - since >= deletedDays * 864e5) { fs.rmSync(path.join(dst, f), { force: true }); pruned++; } else next[f] = since;
  }
  fs.writeFileSync(manifest, JSON.stringify(next));
  return pruned;
}

export async function backupOnce({ nowMs = Date.now() } = {}) {
  if (!backupDir) throw new Error('BACKUP_DIR non défini');
  if (path.resolve(backupDir).startsWith(storageDir + path.sep)) throw new Error('BACKUP_DIR ne doit pas être dans le dossier des données');
  const started = Date.now();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace(/^(\d{8})/, s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`);
  const dbDir = path.join(backupDir, 'db');
  fs.mkdirSync(dbDir, { recursive: true });

  // 1. Base : instantané cohérent puis contrôle d'intégrité de la copie.
  const target = path.join(dbDir, `site-${stamp}.db`);
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    await db.backup(`${target}.part`);
  } finally {
    db.close();
  }
  // La copie hérite du mode WAL : on la repasse en journal classique, en un seul fichier autonome.
  const check = new Database(`${target}.part`);
  check.pragma('journal_mode = DELETE');
  const integrity = check.pragma('integrity_check', { simple: true });
  const photos = check.prepare('SELECT COUNT(*) FROM photos').pluck().get();
  check.close();
  for (const extra of ['-wal', '-shm']) fs.rmSync(`${target}.part${extra}`, { force: true });
  if (integrity !== 'ok') throw new Error(`copie de la base corrompue : ${integrity}`);
  fs.renameSync(`${target}.part`, target);

  // 2. Fichiers irremplaçables.
  const copied = Object.fromEntries(FILE_DIRS.map(d => [d, copyNew(path.join(storageDir, d), path.join(backupDir, 'files', d))]));
  const pruned = Object.fromEntries(FILE_DIRS.map(d => [d, pruneDeleted(path.join(storageDir, d), path.join(backupDir, 'files', d), nowMs)]));

  // 3. Rotation des instantanés de base (BACKUP_KEEP derniers).
  for (const f of fs.readdirSync(dbDir)) if (/\.part(-wal|-shm)?$/.test(f)) fs.rmSync(path.join(dbDir, f), { force: true });
  const snaps = fs.readdirSync(dbDir).filter(f => /^site-.+\.db$/.test(f)).sort();
  for (const old of snaps.slice(0, Math.max(snaps.length - keep, 0))) fs.rmSync(path.join(dbDir, old));

  const report = { at: new Date().toISOString(), snapshot: path.basename(target), photos, copied, pruned, kept: Math.min(snaps.length, keep), ms: Date.now() - started };
  fs.writeFileSync(path.join(backupDir, 'last.json'), JSON.stringify(report, null, 2));
  log('sauvegarde terminée', report);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assertPersistentStorage(storageDir);
  if (process.env.REQUIRE_PERSISTENT_STORAGE === '1' && backupDir) assertPersistentStorage(backupDir);
  const run = () => backupOnce({ nowMs: Number(process.env.BACKUP_NOW_MS) || Date.now() }).catch(err => { log('sauvegarde en échec', { error: err.message }); process.exitCode = 1; });
  await run();
  if (process.argv.includes('--loop')) {
    setInterval(run, intervalH * 3600 * 1000);
    for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => process.exit(0));
  }
}
