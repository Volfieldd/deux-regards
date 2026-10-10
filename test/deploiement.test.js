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
  assert.equal(fs.readdirSync(path.join(backups, 'files', 'originals')).length, 12);
  assert.ok(JSON.parse(fs.readFileSync(path.join(backups, 'last.json'))).snapshot);

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
  assert.equal(locs.length, 11 + 4 + 2 + 3);
});
