import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { migrate } from '../server/db/index.js';
import { seed } from '../server/db/seed.js';
import { slugify } from '../server/slug.js';
import { setup } from './helpers.js';

test('les migrations ne se rejouent pas', async t => {
  const { db } = await setup(t);
  assert.deepEqual(migrate(db), []);
});

test('le seed importe les 12 photos publiées et leurs originaux', async t => {
  const { db, dir } = await setup(t, { seeded: true });
  const photos = db.prepare("SELECT * FROM photos WHERE status = 'published' ORDER BY position").all();
  assert.equal(photos.length, 12);
  assert.equal(photos[0].slug, 'brume-sur-la-loire');
  for (const p of photos) {
    assert.ok(fs.existsSync(path.join(dir, 'originals', p.file)));
    assert.ok(p.width > 0 && p.height > 0);
  }
  assert.equal(db.prepare('SELECT count(*) FROM authors').pluck().get(), 2);
  assert.equal(db.prepare('SELECT count(*) FROM categories').pluck().get(), 4);
});

test('le seed est ignoré si des photos existent', async t => {
  const { db, config } = await setup(t, { seeded: true });
  assert.deepEqual(await seed(db, config), { skipped: true });
  assert.equal(db.prepare('SELECT count(*) FROM photos').pluck().get(), 12);
});

test('une catégorie utilisée ne peut pas être supprimée', async t => {
  const { db } = await setup(t, { seeded: true });
  assert.throws(() => db.prepare("DELETE FROM categories WHERE slug = 'rue'").run(), /FOREIGN KEY/);
});

test('slugify', () => {
  assert.equal(slugify('Le ciel s’est ouvert'), 'le-ciel-s-est-ouvert');
  assert.equal(slugify('Élise, contre-jour'), 'elise-contre-jour');
  assert.equal(slugify('Quai, 7h12'), 'quai-7h12');
});

test('un seed qui échoue ne laisse aucun fichier orphelin', async t => {
  const { db, config } = await setup(t);
  db.prepare("INSERT INTO authors (slug, name) VALUES ('julien', 'Déjà là')").run();  // fera échouer la transaction
  await assert.rejects(seed(db, config), /UNIQUE/);
  const ls = d => (fs.existsSync(d) ? fs.readdirSync(d) : []);
  assert.deepEqual(ls(path.join(config.storageDir, 'originals')), []);
  assert.deepEqual(ls(path.join(config.storageDir, 'variants')), []);
  assert.equal(db.prepare('SELECT COUNT(*) FROM photos').pluck().get(), 0);
});
