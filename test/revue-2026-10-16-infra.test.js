import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { setup } from './helpers.js';
import { openDb, migrate, vacuumOnce } from '../server/db/index.js';
import { createEncounters } from '../server/encounters.js';
import { createVault } from '../server/vault.js';
import { createSessionStore } from '../server/sessions.js';

// Non-régression de la revue du 16 octobre 2026, sous-système « infra » : base et sauvegardes (données effacées
// absentes de la base et des instantanés, fichiers supprimés rangés hors de files/, manifeste caché ignoré, base vide
// qui n'efface pas les vrais instantanés, dossiers distincts, copies inachevées d'un autre passage, intervalle borné,
// lancement par un lien ou un chemin accentué, santé), restauration (refus site en marche, sessions fermées, aucun
// original effacé ramené, actions à refaire), index des clés étrangères, clé des cartes scellée, pays compté derrière
// le proxy seulement, fichiers de déploiement (jeton du tunnel, réseau, modèles Unraid, dépendances des images,
// archive d'export).

const ROOT = path.resolve(import.meta.dirname, '..');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const DAY = 864e5;
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(BACKUP_|STORAGE_DIR|DATABASE_PATH|REQUIRE_PERSISTENT)/.test(k)));

const tmp = (t, prefix) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
};
// Script de server/db dans un processus à part : code de sortie, sorties, et dernière ligne JSON (compte rendu).
function run(file, args, env) {
  const r = spawnSync('node', [file, ...args], { cwd: ROOT, env: { ...BASE_ENV, ...env }, encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(r.stdout.trim().split('\n').at(-1)); } catch { /* sortie texte */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, report };
}
const backup = (env, args = []) => run('server/db/backup.js', args, env);
const restore = (env, name) => run('server/db/restore.js', [name], env);
const contains = (file, text) => fs.readFileSync(file).includes(text);
const stampOf = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace(/^(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');

test('A201 : une donnée effacée ne reste ni dans la base ni dans les instantanés ; restes anciens retirés une fois', async t => {
  const { db, dir, config } = await setup(t, { seeded: true });
  assert.equal(db.pragma('secure_delete', { simple: true }), 1);
  // Valeur assez longue pour occuper des pages de débordement (comme une signature ou une photo de repère).
  const witness = mark => JSON.stringify(`${mark} ${'x'.repeat(20000)}`);
  db.prepare("INSERT INTO settings (key, value) VALUES ('zz_temoin', ?)").run(witness('zz-marqueur-efface@exemple.org'));
  db.pragma('wal_checkpoint(TRUNCATE)');
  assert.ok(contains(config.databasePath, 'zz-marqueur-efface'));
  db.prepare("DELETE FROM settings WHERE key = 'zz_temoin'").run();
  db.pragma('wal_checkpoint(TRUNCATE)');
  assert.ok(!contains(config.databasePath, 'zz-marqueur-efface'));

  // Restes laissés avant le réglage (connexion sans secure_delete).
  const raw = new Database(config.databasePath);
  raw.prepare("INSERT INTO settings (key, value) VALUES ('zz_ancien', ?)").run(witness('zz-ancien-reste'));
  raw.pragma('wal_checkpoint(TRUNCATE)');
  raw.prepare("DELETE FROM settings WHERE key = 'zz_ancien'").run();
  raw.pragma('wal_checkpoint(TRUNCATE)');
  raw.close();
  assert.ok(contains(config.databasePath, 'zz-ancien-reste'));
  // L'instantané est une copie compacte, sans pages libres ni restes, en un seul fichier.
  const backups = tmp(t, 'sauv-');
  const r = backup({ STORAGE_DIR: dir, DATABASE_PATH: config.databasePath, BACKUP_DIR: backups });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const snapshot = path.join(backups, 'db', r.report.snapshot);
  assert.ok(!contains(snapshot, 'zz-ancien-reste'));
  const snap = new Database(snapshot, { readonly: true });
  assert.equal(snap.pragma('journal_mode', { simple: true }), 'delete');
  assert.equal(snap.pragma('freelist_count', { simple: true }), 0);
  assert.equal(snap.prepare('SELECT COUNT(*) FROM photos').pluck().get(), 12);
  snap.close();
  assert.deepEqual(fs.readdirSync(path.join(backups, 'db')), [r.report.snapshot]);
  // Base vivante : un VACUUM, une seule fois (repère dans settings).
  assert.equal(vacuumOnce(db), true);
  assert.ok(!contains(config.databasePath, 'zz-ancien-reste'));
  assert.equal(vacuumOnce(db), false);
  assert.equal(db.prepare('SELECT COUNT(*) FROM photos').pluck().get(), 12);
});

test('A044 : un fichier supprimé quitte files/ pour supprimes/, la date de disparition ne glisse pas, ancienne disposition reprise', async t => {
  const { dir, config } = await setup(t, { seeded: true });
  const backups = tmp(t, 'sauv-');
  const at = ms => backup({ STORAGE_DIR: dir, DATABASE_PATH: config.databasePath, BACKUP_DIR: backups, BACKUP_NOW_MS: String(ms) });
  const originals = path.join(dir, 'originals');
  const files = path.join(backups, 'files', 'originals');
  const trash = path.join(backups, 'supprimes', 'originals');
  const t0 = Date.now();
  assert.equal(at(t0).status, 0);
  // Ancienne disposition : original supprimé resté dans files/, avec sa date dans files/originals/.absents.json.
  fs.writeFileSync(path.join(files, 'ancien.jpg'), 'x');
  fs.writeFileSync(path.join(files, '.absents.json'), JSON.stringify({ 'ancien.jpg': t0 - 80 * DAY }));
  // Données déjà restaurées à l'ancienne : un manifeste périmé est revenu dans data/originals.
  fs.writeFileSync(path.join(originals, '.absents.json'), '{}');
  const [gone] = fs.readdirSync(originals).filter(f => !f.startsWith('.'));
  fs.rmSync(path.join(originals, gone));

  let r = at(t0 + DAY);
  const inFiles = fs.readdirSync(files);
  assert.ok(!inFiles.includes(gone) && !inFiles.includes('ancien.jpg') && !inFiles.includes('.absents.json'));
  assert.equal(inFiles.length, 11);                                            // files/ = les originaux des données
  assert.ok(fs.existsSync(path.join(trash, gone)) && fs.existsSync(path.join(trash, 'ancien.jpg')));
  // L'ancien garde sa date de disparition : effacé 90 jours après elle, pas après sa reprise.
  r = at(t0 + 11 * DAY);
  assert.equal(r.report.pruned.originals, 1);
  assert.ok(!fs.existsSync(path.join(trash, 'ancien.jpg')));
  // Le manifeste caché des données n'est ni copié ni relu : la date ne glisse pas d'un passage à l'autre.
  assert.equal(at(t0 + 60 * DAY).report.pruned.originals, 0);
  assert.equal(at(t0 + 92 * DAY).report.pruned.originals, 1);
  assert.deepEqual(fs.readdirSync(trash), ['.absents.json']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(trash, '.absents.json'))), {});
  // Garde-fou : dossier des originaux vide (montage raté) : rien ne quitte files/.
  for (const f of fs.readdirSync(originals)) fs.rmSync(path.join(originals, f));
  at(t0 + 93 * DAY);
  assert.equal(fs.readdirSync(files).length, 11);
});

test('A044, A203 : restauration — site en marche refusé, sessions fermées, aucun original effacé ramené, actions à refaire listées', async t => {
  const { app, db, dir, config } = await setup(t, { seeded: true });
  const backups = tmp(t, 'sauv-');
  const env = { STORAGE_DIR: dir, DATABASE_PATH: config.databasePath, BACKUP_DIR: backups };
  const photos = db.prepare('SELECT id, file FROM photos ORDER BY id').all();
  const erase = p => { db.prepare('DELETE FROM photos WHERE id = ?').run(p.id); fs.rmSync(path.join(dir, 'originals', p.file)); };
  assert.equal(backup(env).status, 0);
  // Avant l'instantané : une photo effacée, une session ouverte, une action au journal.
  erase(photos[0]);
  createSessionStore(db).create({ sub: 'ancien-admin', name: 'Ancien', roles: ['admin'] });
  app.audit.log({ sub: 'admin', name: 'Admin', action: 'POST /admin/photos/:id', target: 'avant' });
  // Comme avec la Vigie : un déclencheur note les sessions fermées (N6, revue de la phase A).
  db.exec("CREATE TRIGGER essai_sessions_fermees AFTER DELETE ON sessions BEGIN INSERT OR REPLACE INTO sessions_revoked (id, sub, created_at, expires_at, revoked_at) VALUES (OLD.id, OLD.sub, OLD.created_at, OLD.expires_at, 1); END");
  const first = backup(env);
  assert.equal(first.report.photos, 11);
  // Après l'instantané : une personne et ses photos effacées (droit à l'effacement), puis la sauvegarde suivante
  // (une seconde plus tard : les instantanés sont nommés à la seconde).
  await new Promise(r => setTimeout(r, 1100));
  app.audit.log({ sub: 'admin', name: 'Admin', action: 'POST /admin/personnes/:id/effacer', target: '7' });
  erase(photos[1]);
  assert.equal(backup(env).report.photos, 10);
  fs.writeFileSync(path.join(dir, 'originals', 'importe-ensuite.jpg'), 'x');   // original importé après l'instantané

  // Site en marche (base ouverte ici) : refus, rien n'est touché.
  const refused = restore(env, first.report.snapshot);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /base est ouverte/);
  assert.equal(db.prepare('SELECT COUNT(*) FROM photos').pluck().get(), 10);

  // Site arrêté : copie des données, base fermée proprement.
  db.pragma('wal_checkpoint(TRUNCATE)');
  const data = path.join(tmp(t, 'arrete-'), 'data');
  fs.cpSync(dir, data, { recursive: true, filter: src => !/-(wal|shm)$/.test(src) });
  const dbFile = path.join(data, path.basename(config.databasePath));
  const r = restore({ ...env, STORAGE_DIR: data, DATABASE_PATH: dbFile }, first.report.snapshot);
  assert.equal(r.status, 0, r.stderr);
  const restored = new Database(dbFile, { readonly: true });
  assert.equal(restored.prepare('SELECT COUNT(*) FROM photos').pluck().get(), 11);
  assert.equal(restored.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 0);        // sessions fermées
  // Fermées par la restauration, pas volées : rien à signaler à la reconnexion. Restauration notée pour la Vigie.
  assert.equal(restored.prepare('SELECT COUNT(*) FROM sessions_revoked').pluck().get(), 0);
  assert.match(restored.prepare("SELECT value FROM settings WHERE key = 'restauree_le'").pluck().get(), /instantane/);
  restored.close();
  assert.ok(!fs.existsSync(`${dbFile}-wal`) && !fs.existsSync(`${dbFile}-shm`));
  // L'original effacé avant l'instantané ne revient pas ; celui que cite l'instantané revient (depuis supprimes/).
  assert.ok(!fs.existsSync(path.join(data, 'originals', photos[0].file)));
  assert.ok(fs.existsSync(path.join(data, 'originals', photos[1].file)));
  assert.ok(!fs.readdirSync(path.join(data, 'originals')).some(f => f.startsWith('.')));
  // Original inconnu de la base restaurée : listé, laissé en place.
  assert.ok(fs.existsSync(path.join(data, 'originals', 'importe-ensuite.jpg')));
  assert.match(r.stdout, /inconnus de la base restaurée[^\n]*importe-ensuite\.jpg/);
  // Base précédente gardée ; l'effacement fait après l'instantané est à refaire, l'action d'avant n'est pas listée.
  const kept = fs.readdirSync(data).filter(f => /^site-avant-restauration-.+\.db$/.test(f));
  assert.equal(kept.length, 1);
  assert.match(r.stdout, /\n! [^\n]*POST \/admin\/personnes\/:id\/effacer {2}7/);
  assert.doesNotMatch(r.stdout, /avant\n/);
  assert.match(r.stdout, /Sessions fermées : 1\./);
});

test('A048 : une base sans photo n’efface pas les vrais instantanés ; alerte, santé, retour à la normale', async t => {
  const { dir, config } = await setup(t, { seeded: true });
  const backups = tmp(t, 'sauv-');
  const env = { STORAGE_DIR: dir, DATABASE_PATH: config.databasePath, BACKUP_DIR: backups, BACKUP_KEEP: '2' };
  const first = backup(env);
  assert.equal(first.status, 0);
  assert.equal(backup(env, ['--etat']).status, 0);
  await new Promise(r => setTimeout(r, 1100));
  const dbDir = path.join(backups, 'db');
  // Vrais instantanés plus anciens : il y a une et deux heures, et il y a trois jours.
  for (const ms of [3600e3, 7200e3, 3 * DAY]) fs.copyFileSync(path.join(dbDir, first.report.snapshot), path.join(dbDir, `site-${stampOf(Date.now() - ms)}.db`));
  // DATA_DIR vers un dossier sans base : le site en a recréé une vide.
  const empty = tmp(t, 'vide-');
  const e = openDb(path.join(empty, 'site.db'));
  migrate(e);
  e.close();
  const envEmpty = { ...env, STORAGE_DIR: empty, DATABASE_PATH: path.join(empty, 'site.db') };
  for (let i = 0; i < 3; i++) {
    const r = backup(envEmpty);
    assert.equal(r.status, 1);
    assert.match(r.report.warning, /sans aucune photo alors que la dernière sauvegarde saine en avait 12/);
    assert.match(r.report.snapshot, /-suspect\.db$/);
  }
  const real = () => fs.readdirSync(dbDir).filter(f => /^site-.+\.db$/.test(f) && !f.endsWith('-suspect.db'));
  assert.equal(real().length, 3);                               // malgré BACKUP_KEEP=2 ; seul celui de trois jours est parti
  assert.equal(JSON.parse(fs.readFileSync(path.join(backups, 'last.json'))).reference, 12);
  const etat = backup(envEmpty, ['--etat']);
  assert.equal(etat.status, 1);
  assert.match(etat.stdout, /sans aucune photo/);
  // Données retrouvées : rotation habituelle, plus d'alerte.
  const back = backup(env);
  assert.equal(back.status, 0);
  assert.equal(back.report.warning, undefined);
  assert.equal(back.report.kept, 2);
  assert.equal(backup(env, ['--etat']).status, 0);
});

test('A205, A207 : sauvegardes jamais dans les données ; copie inachevée d’un autre passage gardée', async t => {
  const outer = tmp(t, 'ext-');
  const data = path.join(outer, 'donnees');
  fs.mkdirSync(data);
  fs.symlinkSync(data, path.join(outer, 'lien'));
  for (const b of [data, path.join(outer, 'lien'), outer, path.join(data, 'sauv')]) {
    const r = backup({ STORAGE_DIR: data, DATABASE_PATH: path.join(data, 'site.db'), BACKUP_DIR: b });
    assert.equal(r.status, 1, b);
    assert.match(r.stdout, /BACKUP_DIR ne doit pas être dans le dossier des données/);
  }
  assert.deepEqual(fs.readdirSync(data), []);

  const { dir, config } = await setup(t, { seeded: true });
  const backups = tmp(t, 'sauv-');
  const dbDir = path.join(backups, 'db');
  fs.mkdirSync(dbDir, { recursive: true });
  fs.writeFileSync(path.join(dbDir, 'site-en-cours.db.123.part'), 'x');
  fs.writeFileSync(path.join(dbDir, 'site-interrompu.db.456.part'), 'x');
  const old = (Date.now() - 2 * 3600e3) / 1000;
  fs.utimesSync(path.join(dbDir, 'site-interrompu.db.456.part'), old, old);
  assert.equal(backup({ STORAGE_DIR: dir, DATABASE_PATH: config.databasePath, BACKUP_DIR: backups }).status, 0);
  assert.ok(fs.existsSync(path.join(dbDir, 'site-en-cours.db.123.part')));
  assert.ok(!fs.existsSync(path.join(dbDir, 'site-interrompu.db.456.part')));
});

test('A208 : BACKUP_INTERVAL_HOURS trop grand est borné : --loop ne relance pas de sauvegarde en boucle', async t => {
  const { dir, config } = await setup(t, { seeded: true });
  const backups = tmp(t, 'sauv-');
  const child = spawn('node', ['server/db/backup.js', '--loop'], { cwd: ROOT,
    env: { ...BASE_ENV, STORAGE_DIR: dir, DATABASE_PATH: config.databasePath, BACKUP_DIR: backups, BACKUP_INTERVAL_HOURS: '720' } });
  let out = '';
  let err = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { err += d; });
  t.after(() => child.kill('SIGKILL'));
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`pas de sauvegarde : ${out}${err}`)), 30000);
    const tick = setInterval(() => { if (out.includes('sauvegarde terminée')) { clearInterval(tick); clearTimeout(deadline); setTimeout(resolve, 1500); } }, 50);
  });
  child.kill('SIGTERM');
  assert.equal(out.split('\n').filter(l => l.includes('sauvegarde terminée')).length, 1);
  assert.doesNotMatch(err, /TimeoutOverflowWarning/);
});

test('A209 : lancé par un lien, depuis un chemin avec espaces et accents, backup.js sauvegarde vraiment', async t => {
  const { dir, config } = await setup(t, { seeded: true });
  const backups = tmp(t, 'sauv-');
  const link = path.join(tmp(t, 'lien-'), 'Mes sauvegardes é');
  fs.symlinkSync(ROOT, link);
  const r = spawnSync('node', [path.join(link, 'server/db/backup.js')], { cwd: ROOT, encoding: 'utf8',
    env: { ...BASE_ENV, STORAGE_DIR: dir, DATABASE_PATH: config.databasePath, BACKUP_DIR: backups } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(backups, 'last.json'))).photos, 12);
});

test('A206 : chaque clé étrangère a un index dont sa colonne est la première', () => {
  const db = openDb(':memory:');
  migrate(db);
  const missing = [];
  for (const table of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").pluck().all()) {
    const firsts = new Set(db.pragma(`index_list("${table}")`).map(ix => db.pragma(`index_info("${ix.name}")`).find(c => c.seqno === 0)?.name));
    const pk = db.pragma(`table_info("${table}")`).filter(c => c.pk === 1);
    if (pk.length === 1 && pk[0].type.toUpperCase() === 'INTEGER') firsts.add(pk[0].name);         // rowid
    for (const fk of db.pragma(`foreign_key_list("${table}")`)) if (!firsts.has(fk.from)) missing.push(`${table}.${fk.from}`);
  }
  assert.deepEqual(missing, []);
  assert.match(db.prepare('EXPLAIN QUERY PLAN DELETE FROM stats_photos WHERE photo_id = 1').all().map(r => r.detail).join(), /USING (COVERING )?INDEX stats_photos_photo/);
  db.close();
});

test('A204 : clé des codes de contrôle scellée par DATA_KEY, sans changer les codes des cartes imprimées', async t => {
  const { db } = await setup(t, { seeded: true });
  const stored = () => JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'encounter_key'").pluck().get());
  const plain = createEncounters({ db });
  const code = plain.codeOf('J-0142');
  const hex = stored();
  assert.match(hex, /^[0-9a-f]{64}$/);                                               // sans DATA_KEY : en clair
  const sealed = createEncounters({ db, vault: createVault('k'.repeat(44)) });
  sealed.sealExisting();                                                             // au démarrage, sans attendre une carte
  assert.match(stored(), /^enc1:/);                                                  // scellée en base et dans les sauvegardes
  assert.equal(sealed.codeOf('J-0142'), code);                                       // même code qu'avant
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM settings').all()).includes(hex));
  assert.equal(sealed.card(`J-0142-${code}`).verified, true);
  // Sans la bonne clé (sauvegarde volée, DATA_KEY retirée ou changée) : aucune carte reconnue, aucune erreur.
  for (const vault of [createVault(null), createVault('autre'.repeat(10))]) {
    const other = createEncounters({ db, vault });
    assert.equal(other.card(`J-0142-${code}`).verified, false);
    assert.equal(other.card(`J-0142-${code}`).badCode, true);
    assert.doesNotThrow(() => other.sealExisting());                                 // le démarrage n'est jamais bloqué
  }
  // Base neuve avec DATA_KEY : clé scellée dès sa création.
  db.prepare("DELETE FROM settings WHERE key = 'encounter_key'").run();
  createEncounters({ db, vault: createVault('k'.repeat(44)) }).codeOf('J-0001');
  assert.match(stored(), /^enc1:/);
});

test('A204 : fiche d’une rencontre toujours affichable si la clé scellée est illisible (DATA_KEY retirée)', async t => {
  const TOKEN = 'jeton-de-test-0123456789';
  const { app, db } = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  createEncounters({ db, vault: createVault('k'.repeat(44)) }).codeOf('J-0001');     // clé scellée par une DATA_KEY retirée depuis
  const id = db.prepare("INSERT INTO encounters (ref, email, name, author_id, created_at, updated_at) SELECT 'J-0142', '', 'Alice', id, ?, ? FROM authors WHERE slug = 'julien'").run(Date.now(), Date.now()).lastInsertRowid;
  const login = await app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = Object.fromEntries(login.cookies.filter(c => c.value).map(c => [c.name, c.value]));
  const page = await app.inject({ url: `/admin/rencontres/${id}`, cookies });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Alice/);
  assert.doesNotMatch(page.body, /Code de la carte/);
  assert.equal(app.encounters.card('J-0142-ABC').verified, false);
  assert.throws(() => app.encounters.codeOf('J-0142'), /clé des codes de contrôle illisible/);   // jamais de carte imprimée avec un faux code
});

test('A007 : pays de Cloudflare compté seulement pour une requête passée par le proxy de confiance', async t => {
  const { app, db } = await setup(t, { seeded: true, env: { TRUST_PROXY: '10.0.0.10' } });
  const visit = (ip, headers) => app.inject({ url: '/', remoteAddress: ip, headers: { 'user-agent': UA, ...headers } });
  await visit('192.168.1.50', { 'cf-ipcountry': 'JP' });                              // poste du réseau local, en direct
  await visit('10.0.0.10', { 'cf-ipcountry': 'JP' });                                 // aucun visiteur derrière le proxy
  await visit('10.0.0.10', { 'cf-ipcountry': 'FR', 'x-forwarded-for': '203.0.113.7' }); // visiteur passé par le tunnel
  assert.deepEqual(db.prepare('SELECT country, visitors FROM stats_countries ORDER BY country').all(),
    [{ country: 'FR', visitors: 1 }, { country: 'XX', visitors: 2 }]);
});

test('A007, A045, A046, A047, A049, A210 : fichiers de déploiement', () => {
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const service = (yaml, name) => new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:\\n|\\nvolumes:)`).exec(yaml)[1];
  for (const f of ['compose.yaml', 'deploy/unraid/compose.yaml']) {
    const y = read(f);
    assert.doesNotMatch(service(y, 'site'), /TUNNEL_TOKEN: \$/, f);
    assert.match(service(y, 'site'), /\n {6}TUNNEL_TOKEN: ""\n/, f);                    // le site ne reçoit pas le jeton
    assert.match(service(y, 'backup'), /test: \["CMD", "node", "server\/db\/backup\.js", "--etat"\]/, f);
    assert.match(service(y, 'backup'), /tmpfs|<<: \*hardening/, f);                     // fichiers temporaires de SQLite
  }
  // Réseau Unraid : adresses dynamiques dans la moitié haute, adresse fixe du tunnel hors de cette plage.
  const unraid = read('deploy/unraid/compose.yaml');
  assert.match(unraid, /- subnet: \$\{NET_SUBNET:-172\.29\.42\.0\/24\}\n {10}ip_range: \$\{NET_IP_RANGE:-172\.29\.42\.128\/25\}/);
  assert.match(unraid, /ipv4_address: \$\{TUNNEL_IP:-172\.29\.42\.10\}/);
  // Modèles Unraid : adresse publique, proxy de confiance, mémoire, tunnel durci à l'adresse fixe.
  const site = read('deploy/unraid/modeles/nicephos.xml');
  const field = name => new RegExp(`Target="${name}" Default="([^"]*)"[^>]*>([^<]*)</Config>`).exec(site);
  assert.deepEqual(field('PUBLIC_URL').slice(1), ['https://www.nicephos.art', 'https://www.nicephos.art']);
  assert.equal(field('TRUST_PROXY')[2], '172.29.42.10');
  assert.match(site, /<ExtraParams>[^<]*--memory 3g --pids-limit 256<\/ExtraParams>/);
  assert.match(read('deploy/unraid/modeles/nicephos-tunnel.xml'), /<ExtraParams>--ip 172\.29\.42\.10 --read-only --cap-drop ALL /);
  assert.match(read('deploy/unraid/README.md'), /docker network create --subnet 172\.29\.42\.0\/24 --ip-range 172\.29\.42\.128\/25 nicephos/);
  // Publication de l'image : actions épinglées sur un commit, « latest » depuis main seulement, constructions une à une.
  const wf = read('.github/workflows/image.yml');
  const uses = [...wf.matchAll(/uses: (\S+)/g)].map(m => m[1]);
  assert.equal(uses.length, 10);                                          // deux images : le site et la Vigie (phase B)
  assert.match(wf, /file: Dockerfile\.vigie/);
  const dockerVigie = read('Dockerfile.vigie');
  const installationVigie = dockerVigie.indexOf('npm ci --omit=dev');
  const auditVigie = dockerVigie.indexOf('npm audit --omit=dev');
  const imageFinaleVigie = dockerVigie.indexOf('# 2. Image finale');
  assert.ok(installationVigie >= 0 && installationVigie < auditVigie && auditVigie < imageFinaleVigie);
  const manifeste = JSON.parse(read('package.json'));
  const manifesteVigie = JSON.parse(read('vigie/package.json'));
  const verrouVigie = JSON.parse(read('vigie/package-lock.json'));
  assert.equal(manifesteVigie.dependencies.fastify, manifeste.dependencies.fastify);
  assert.equal(verrouVigie.packages[''].dependencies.fastify, manifeste.dependencies.fastify);
  assert.equal(verrouVigie.packages['node_modules/fastify'].version, manifeste.dependencies.fastify);
  // Vigie (facultative) : seulement avec le profil « vigie », durcie comme le reste, sauvegarde sans réseau.
  for (const name of ['vigie', 'vigie-backup']) {
    const svc = service(unraid, name);
    assert.match(svc, /profiles: \[vigie\]/, name);
    assert.match(svc, /<<: \*hardening/, name);
  }
  assert.match(service(unraid, 'vigie-backup'), /network_mode: none/);
  // Passerelle Signal (profil « signal ») : API sans authentification, donc aucun port, réseau interne créé par la pile
  // (jamais « external » : un Compose Up avec la Vigie échouait faute de réseau), que le site ne rejoint pas.
  const signal = service(unraid, 'signal');
  assert.match(signal, /profiles: \[signal\]/);
  assert.doesNotMatch(signal, /ports:/);
  assert.match(signal, /networks: \[vigie-signal, signal-sortie\]/);
  assert.match(signal, /read_only: true[\s\S]*cap_drop: \[ALL\]/);
  assert.match(unraid, /\n {2}vigie-signal:\n {4}name: nicephos-vigie-signal\n {4}internal: true\n/);
  assert.doesNotMatch(unraid, /external: true/);
  assert.doesNotMatch(service(unraid, 'site'), /vigie-signal/);
  // Dossiers : tous déduits de NICEPHOS_DIR et BACKUP_DIR (aucun chemin d'Unraid écrit en dur), chacun monté seul.
  assert.doesNotMatch(unraid, /source: \$\{[A-Z_]+:-\/mnt\//);
  for (const d of ['data', 'vigie', 'vigie-secrets', 'signal']) assert.match(unraid, new RegExp(`\\$\\{NICEPHOS_DIR:\\?[^}]*\\}/${d}\\}`), d);
  assert.match(unraid, /\$\{VIGIE_BACKUP_DIR:-\$\{BACKUP_DIR:\?[^}]*\}-vigie\}/);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, u);
  assert.match(wf, /type=raw,value=latest,enable=\{\{is_default_branch\}\}/);
  assert.match(wf, /\nconcurrency:\n {2}group: image-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: false\n/);
  // Archive d'export lisible par son seul propriétaire ; import sans journal WAL resté d'un premier lancement.
  assert.match(read('deploy/unraid/exporter-donnees.sh'), /\numask 077\n/);
  assert.match(read('deploy/unraid/README.md'), /tar -xzf nicephos-donnees-\*\.tar\.gz -C data\nrm -f data\/site\.db-wal data\/site\.db-shm\n/);
  // Image : script d'installation d'ONNX Runtime et dépendances signalées retirés, chargement contrôlé.
  const docker = read('Dockerfile');
  assert.match(docker, /rm -rf node_modules\/onnxruntime-node\/script node_modules\/adm-zip node_modules\/global-agent/);
  assert.match(docker, /await import\('onnxruntime-node'\); await import\('@huggingface\/transformers'\)/);
});
