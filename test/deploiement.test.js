import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { setup } from './helpers.js';
import { assertPersistentStorage } from '../server/storage-guard.js';

test('garde-fou : en conteneur, refus de démarrer si les données ne sont pas un montage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'garde-'));
  assert.doesNotThrow(() => assertPersistentStorage(dir, {}));                     // hors conteneur : rien
  assert.throws(() => assertPersistentStorage(dir, { REQUIRE_PERSISTENT_STORAGE: '1' }), /n'est pas un montage/);
  assert.throws(() => assertPersistentStorage('/nexiste/pas', { REQUIRE_PERSISTENT_STORAGE: '1' }), /introuvable/);
  fs.rmSync(dir, { recursive: true });
});

test('sauvegarde : instantané intègre, fichiers copiés une fois, rotation, jamais dans les données', async t => {
  const { dir, config } = await setup(t, { seeded: true });
  const backups = fs.mkdtempSync(path.join(os.tmpdir(), 'sauv-'));
  t.after(() => fs.rmSync(backups, { recursive: true, force: true }));
  const env = { ...process.env, STORAGE_DIR: dir, DATABASE_PATH: config.databasePath, BACKUP_DIR: backups, BACKUP_KEEP: '2' };
  const run = (e = env) => JSON.parse(execFileSync('node', ['server/db/backup.js'], { env: e }).toString().trim().split('\n').at(-1));

  const first = run();
  assert.equal(first.photos, 12);
  assert.equal(first.copied.originals, 12);
  const snap = new Database(path.join(backups, 'db', first.snapshot), { readonly: true });
  assert.equal(snap.prepare('SELECT COUNT(*) FROM photos').pluck().get(), 12);
  snap.close();

  await new Promise(r => setTimeout(r, 1100));
  assert.equal(run().copied.originals, 0);                                         // rien de nouveau
  await new Promise(r => setTimeout(r, 1100));
  run();
  assert.deepEqual(fs.readdirSync(path.join(backups, 'db')).filter(f => !f.endsWith('.db')), []);    // ni .part ni -wal/-shm
  assert.equal(fs.readdirSync(path.join(backups, 'db')).filter(f => f.endsWith('.db')).length, 2);   // BACKUP_KEEP
  const stored = () => fs.readdirSync(path.join(backups, 'files', 'originals')).filter(f => !f.startsWith('.'));
  assert.equal(stored().length, 12);
  assert.ok(JSON.parse(fs.readFileSync(path.join(backups, 'last.json'))).snapshot);

  // Original supprimé dans l'admin : gardé 90 jours dans la sauvegarde, puis effacé (droit à l'effacement).
  const gone = fs.readdirSync(path.join(dir, 'originals'))[0];
  fs.rmSync(path.join(dir, 'originals', gone));
  const day = 864e5;
  const t0 = Date.now();
  assert.equal(run({ ...env, BACKUP_NOW_MS: String(t0) }).pruned.originals, 0);
  assert.ok(stored().includes(gone));
  assert.equal(run({ ...env, BACKUP_NOW_MS: String(t0 + 89 * day) }).pruned.originals, 0);
  assert.equal(run({ ...env, BACKUP_NOW_MS: String(t0 + 91 * day) }).pruned.originals, 1);
  assert.equal(stored().length, 11);
  // Garde-fou : dossier des originaux vide (montage raté) : rien n'est effacé.
  for (const f of fs.readdirSync(path.join(dir, 'originals'))) fs.renameSync(path.join(dir, 'originals', f), path.join(dir, f));
  assert.equal(run({ ...env, BACKUP_NOW_MS: String(t0 + 400 * day) }).pruned.originals, 0);
  assert.equal(stored().length, 11);

  assert.throws(() => execFileSync('node', ['server/db/backup.js'], { env: { ...env, BACKUP_DIR: path.join(dir, 'sauv') }, stdio: 'pipe' }));
});

test('robots.txt et sitemap.xml : site public seulement, URL absolues', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const robots = (await app.inject('/robots.txt')).body;
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Sitemap: http:\/\/localhost:3000\/sitemap\.xml/);
  db.prepare("UPDATE photos SET status = 'draft' WHERE slug = 'deux-minuit'").run();
  const res = await app.inject('/sitemap.xml');
  assert.match(res.headers['content-type'], /application\/xml/);
  const locs = [...res.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.ok(locs.includes('http://localhost:3000/'));
  assert.ok(locs.includes('http://localhost:3000/photo/brume-sur-la-loire'));
  assert.ok(locs.includes('http://localhost:3000/serie/rue'));
  assert.ok(!locs.some(l => l.includes('deux-minuit')));                            // brouillon absent
  assert.ok(!locs.some(l => l.includes('/admin')));
  assert.ok(locs.includes('http://localhost:3000/en/droits') && locs.includes('http://localhost:3000/de/droits'));
  assert.ok(locs.includes('http://localhost:3000/en/photo/brume-sur-la-loire') && locs.includes('http://localhost:3000/de/serie/rue'));
  assert.equal(locs.length, (1 + 4 + 2 + 11 + 4) * 3);                              // accueil, séries, auteurs, photos, à propos, droits, confidentialité, mentions légales ; × 3 langues
  assert.match(res.body, /<xhtml:link rel="alternate" hreflang="de" href="http:\/\/localhost:3000\/de\/photo\/brume-sur-la-loire"\/>/);
  assert.match(robots, /Disallow: \/langue\//);
});
