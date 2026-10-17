import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Sauvegarde de la base de la Vigie (conteneur à part, sans secret) : instantané compact (VACUUM INTO), contrôle
// d'intégrité, VIGIE_BACKUP_KEEP gardés. Jamais dans le dossier des données.
export function backupVigie({ databasePath, backupDir, keep = 14, now = Date.now }) {
  if (!backupDir) throw new Error('VIGIE_BACKUP_DIR non défini');
  const data = path.resolve(path.dirname(databasePath)), dest = path.resolve(backupDir);
  if (dest === data || dest.startsWith(`${data}${path.sep}`) || data.startsWith(`${dest}${path.sep}`)) throw new Error('VIGIE_BACKUP_DIR ne doit pas être dans le dossier des données (ni l’inverse)');
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  const stamp = new Date(now()).toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const file = path.join(dest, `vigie-${stamp}.db`);
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { db.prepare('VACUUM INTO ?').run(file); } finally { db.close(); }
  const snap = new Database(file, { readonly: true });
  try { const ok = snap.pragma('integrity_check', { simple: true }); if (ok !== 'ok') throw new Error(`instantané corrompu : ${ok}`); } finally { snap.close(); }
  fs.chmodSync(file, 0o600);
  const all = fs.readdirSync(dest).filter(f => /^vigie-\d{8}T\d{6}\.db$/.test(f)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - keep))) fs.rmSync(path.join(dest, f));
  return { file: path.basename(file), gardes: Math.min(all.length, keep) };
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname); } catch { return false; } })();
if (isMain) {
  const dataDir = path.resolve(process.env.VIGIE_DATA_DIR || '/data');
  const opts = { databasePath: path.resolve(process.env.VIGIE_DATABASE || path.join(dataDir, 'vigie.db')), backupDir: process.env.VIGIE_BACKUP_DIR,
    keep: Number.parseInt(process.env.VIGIE_BACKUP_KEEP, 10) || 14 };
  const once = () => { try { console.log(JSON.stringify(backupVigie(opts))); } catch (err) { console.error(`Sauvegarde refusée : ${err.message}`); process.exitCode = 1; } };
  once();
  if (process.argv.includes('--loop')) setInterval(once, (Number(process.env.VIGIE_BACKUP_INTERVAL_HOURS) || 24) * 3600e3);
}
