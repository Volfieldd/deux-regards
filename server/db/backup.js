// Sauvegarde : copie cohérente et compacte de la base (VACUUM INTO, même serveur en marche) et copie incrémentale des
// fichiers irremplaçables (originaux, logos). Les variantes se recalculent. Restauration : server/db/restore.js.
//
//   node server/db/backup.js            une sauvegarde
//   node server/db/backup.js --loop     une sauvegarde, puis toutes les BACKUP_INTERVAL_HOURS (24 h, 168 au plus)
//   node server/db/backup.js --etat     santé (healthcheck) : code 0 si la dernière sauvegarde est récente et sans alerte
//
// BACKUP_DIR/
//   db/site-AAAA-MM-JJTHHMMSS.db        instantanés (les BACKUP_KEEP plus récents, 14 par défaut)
//   db/site-…-suspect.db                instantané d'une base sans photo alors que la précédente en avait (alerte)
//   files/originals/…                    reflet exact des données au dernier passage : une restauration n'y retrouve
//   files/watermarks/…, files/brand/…    aucun fichier supprimé
//   supprimes/<dossier>/…                fichiers disparus des données : récupérables BACKUP_DELETED_DAYS jours (90),
//   supprimes/<dossier>/.absents.json    puis effacés (droit à l'effacement) ; date de disparition de chaque fichier
//   last.json                            compte rendu de la dernière sauvegarde
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { assertPersistentStorage, assertDatabaseInStorage } from '../storage-guard.js';

const storageDir = path.resolve(process.env.STORAGE_DIR || './storage');
const dbPath = path.resolve(process.env.DATABASE_PATH || path.join(storageDir, 'site.db'));
const backupDir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : null;
const keep = Math.max(Number.parseInt(process.env.BACKUP_KEEP, 10) || 14, 1);
// Une semaine au plus : au-delà de 596 h, setInterval déborde et relancerait une sauvegarde à chaque milliseconde.
const intervalH = Math.min(Math.max(Number(process.env.BACKUP_INTERVAL_HOURS) || 24, 1), 168);
const FILE_DIRS = ['originals', 'watermarks', 'brand'];
const deletedDays = Math.max(Number(process.env.BACKUP_DELETED_DAYS) || 90, 1);

const log = (msg, extra = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...extra }));
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
// Fichiers suivis : ni manifeste (« .absents.json ») ni copie inachevée (« .part »).
const listFiles = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => !f.startsWith('.') && !f.endsWith('.part')) : []);

// Copie les fichiers absents de la sauvegarde (les originaux ne changent jamais : un nom suffit).
function copyNew(src, dst) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const f of listFiles(src)) {
    const from = path.join(src, f);
    const to = path.join(dst, f);
    if (!fs.statSync(from).isFile() || (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size)) continue;
    fs.copyFileSync(from, `${to}.part`);
    fs.renameSync(`${to}.part`, to);
    n++;
  }
  return n;
}

function move(from, to) {
  try { fs.renameSync(from, to); } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.copyFileSync(from, to);
    fs.rmSync(from);
  }
}

// Fichiers disparus des données : sortis de files/<dossier> (qui reste le reflet exact des données) vers
// supprimes/<dossier>, gardés deletedDays jours après leur disparition, puis effacés.
// Garde-fou : un dossier source absent ou vide (montage raté) ne retire rien de files/.
function retireDeleted(src, dst, trash, nowMs) {
  const present = new Set(listFiles(src));
  const manifest = path.join(trash, '.absents.json');
  // Avant le 16 octobre 2026, fichiers supprimés et manifeste restaient dans files/<dossier> : repris ici une fois.
  const legacy = path.join(dst, '.absents.json');
  const absent = { ...readJson(legacy), ...readJson(manifest) };
  const gone = listFiles(dst).filter(f => !present.has(f));
  const guarded = gone.length > 0 && !present.size;
  if (guarded) log('fichiers supprimés non retirés : dossier source vide ou absent', { src });
  else if (gone.length) {
    fs.mkdirSync(trash, { recursive: true });
    for (const f of gone) { move(path.join(dst, f), path.join(trash, f)); absent[f] ??= nowMs; }
  }
  let pruned = 0;
  const next = {};
  for (const f of listFiles(trash)) {
    if (present.has(f)) { fs.rmSync(path.join(trash, f), { force: true }); continue; }   // revenu dans les données
    const since = Number(absent[f]) || nowMs;
    if (nowMs - since >= deletedDays * 864e5) { fs.rmSync(path.join(trash, f), { force: true }); pruned++; } else next[f] = since;
  }
  if (fs.existsSync(trash)) fs.writeFileSync(manifest, JSON.stringify(next));
  if (!guarded) fs.rmSync(legacy, { force: true });
  return pruned;
}

// Dossier des sauvegardes et dossier des données distincts : ni égaux, ni l'un dans l'autre, ni le même dossier de
// l'hôte monté deux fois (même périphérique, même inode).
function assertSeparate() {
  const real = d => { try { return fs.realpathSync(d); } catch { return path.resolve(d); } };
  const b = real(backupDir);
  const s = real(storageDir);
  const within = (a, c) => a === c || a.startsWith(c + path.sep);
  let same = within(b, s) || within(s, b);
  try { const x = fs.statSync(b); const y = fs.statSync(s); same ||= x.dev === y.dev && x.ino === y.ino; } catch { /* dossier pas encore créé */ }
  if (same) throw new Error('BACKUP_DIR ne doit pas être dans le dossier des données (ni le même dossier, ni le contenir)');
}

// Date d'un instantané d'après son nom (site-AAAA-MM-JJTHHMMSS…, heure UTC) ; NaN pour un autre nom.
const snapshotMs = f => Date.parse(f.replace(/^site-(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2}).*$/, '$1T$2:$3:$4Z'));

export async function backupOnce({ nowMs = Date.now() } = {}) {
  if (!backupDir) throw new Error('BACKUP_DIR non défini');
  assertSeparate();
  const started = Date.now();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace(/^(\d{8})/, s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`);
  const dbDir = path.join(backupDir, 'db');
  fs.mkdirSync(dbDir, { recursive: true });
  const previous = readJson(path.join(backupDir, 'last.json'));

  // 1. Base : copie en une seule lecture (VACUUM INTO). Cohérente même si le site écrit pendant ce temps, jamais
  //    relancée (l'API de sauvegarde page à page recommence à chaque écriture), compacte, et sans les restes des
  //    données effacées que garderaient les pages libres. Puis contrôle d'intégrité de la copie.
  const target = path.join(dbDir, `site-${stamp}.db`);
  const part = `${target}.${process.pid}.part`;
  fs.rmSync(part, { force: true });
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000');
    db.prepare('VACUUM INTO ?').run(part);
  } finally {
    db.close();
  }
  const check = new Database(part);
  check.pragma('journal_mode = DELETE');
  const integrity = check.pragma('integrity_check', { simple: true });
  const photos = check.prepare('SELECT COUNT(*) FROM photos').pluck().get();
  check.close();
  for (const extra of ['-wal', '-shm', '-journal']) fs.rmSync(`${part}${extra}`, { force: true });
  if (integrity !== 'ok') { fs.rmSync(part, { force: true }); throw new Error(`copie de la base corrompue : ${integrity}`); }

  // 2. Garde-fou : base sans aucune photo alors que la dernière sauvegarde saine en avait (DATA_DIR vers un dossier
  //    vide, site.db pas recopié…). L'instantané est marqué « suspect », et les vrais ne sont plus effacés au nombre
  //    (chaque redémarrage en ajoute un) mais seulement à l'âge qu'ils auraient atteint en temps normal.
  const reference = Number(previous?.reference ?? previous?.photos) || 0;
  const suspect = photos === 0 && reference > 0;
  const final = suspect ? target.replace(/\.db$/, '-suspect.db') : target;
  fs.renameSync(part, final);

  // 3. Fichiers irremplaçables.
  const copied = Object.fromEntries(FILE_DIRS.map(d => [d, copyNew(path.join(storageDir, d), path.join(backupDir, 'files', d))]));
  const pruned = Object.fromEntries(FILE_DIRS.map(d => [d, retireDeleted(path.join(storageDir, d), path.join(backupDir, 'files', d), path.join(backupDir, 'supprimes', d), nowMs)]));

  // 4. Rotation des instantanés de base (BACKUP_KEEP derniers). Copies inachevées : seulement celles d'un passage
  //    interrompu (plus d'une heure), jamais celle d'une sauvegarde lancée en même temps.
  for (const f of fs.readdirSync(dbDir)) {
    const file = path.join(dbDir, f);
    if (/\.part(-wal|-shm|-journal)?$/.test(f) && Date.now() - fs.statSync(file).mtimeMs > 3600e3) fs.rmSync(file, { force: true });
  }
  const snaps = fs.readdirSync(dbDir).filter(f => /^site-.+\.db$/.test(f)).sort();
  const suspects = snaps.filter(f => f.endsWith('-suspect.db'));
  const doomed = !suspect ? snaps.slice(0, Math.max(snaps.length - keep, 0)) : [
    ...suspects.slice(0, Math.max(suspects.length - keep, 0)),
    ...snaps.filter(f => !suspects.includes(f) && nowMs - snapshotMs(f) > keep * intervalH * 3600e3),
  ];
  for (const old of doomed) fs.rmSync(path.join(dbDir, old));

  const report = { at: new Date().toISOString(), snapshot: path.basename(final), photos, reference: suspect ? reference : photos, copied, pruned,
    kept: snaps.length - doomed.length, ms: Date.now() - started };
  if (suspect) report.warning = `base sans aucune photo alors que la dernière sauvegarde saine en avait ${reference} : instantané marqué « suspect », les précédents sont gardés`;
  fs.writeFileSync(path.join(backupDir, 'last.json.part'), JSON.stringify(report, null, 2));
  fs.renameSync(path.join(backupDir, 'last.json.part'), path.join(backupDir, 'last.json'));
  log(suspect ? 'sauvegarde suspecte' : 'sauvegarde terminée', report);
  return report;
}

// Santé de la sauvegarde (healthcheck du conteneur) : dernière sauvegarde de moins de deux intervalles, sans alerte.
export function backupState(nowMs = Date.now()) {
  const last = backupDir ? readJson(path.join(backupDir, 'last.json')) : null;
  if (!last?.at) return { ok: false, message: 'aucune sauvegarde terminée' };
  if (last.warning) return { ok: false, message: last.warning };
  const hours = (nowMs - Date.parse(last.at)) / 3600e3;
  if (!(hours <= 2 * intervalH + 1)) return { ok: false, message: `dernière sauvegarde il y a ${Math.round(hours)} h` };
  return { ok: true, message: `dernière sauvegarde il y a ${Math.round(hours)} h (${last.snapshot})` };
}

// Lancé directement (y compris par un lien symbolique, ou depuis un chemin avec espaces ou accents), pas importé.
const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();

if (isMain && process.argv.includes('--etat')) {
  const state = backupState();
  console.log(state.message);
  process.exitCode = state.ok ? 0 : 1;
} else if (isMain) {
  assertPersistentStorage(storageDir);
  assertDatabaseInStorage(dbPath, storageDir);                                    // la base sauvegardée est bien celle du site
  if (process.env.REQUIRE_PERSISTENT_STORAGE === '1' && backupDir) assertPersistentStorage(backupDir);
  let running = false;
  const run = async () => {
    if (running) { log('sauvegarde précédente encore en cours : passage ignoré'); return; }
    running = true;
    try {
      const report = await backupOnce({ nowMs: Number(process.env.BACKUP_NOW_MS) || Date.now() });
      if (report.warning) process.exitCode = 1;
    } catch (err) {
      log('sauvegarde en échec', { error: err.message });
      process.exitCode = 1;
    } finally {
      running = false;
    }
  };
  await run();
  if (process.argv.includes('--loop')) {
    setInterval(run, intervalH * 3600 * 1000);
    for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => process.exit(0));
  }
}
