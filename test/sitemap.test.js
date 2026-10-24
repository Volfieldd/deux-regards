import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { partitionSitemaps, createSitemapIndex, SITEMAP_LIMITS, SITEMAP_HEAD, SITEMAP_TAIL } from '../server/sitemap.js';

const row = '  <url><loc>https://exemple.test/été</loc></url>';
const count = document => (document.match(/<url>/g) || []).length;
const put = (db, key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));

test('plan du site : un petit corpus conserve exactement le document et sa sérialisation', () => {
  assert.deepEqual(partitionSitemaps([]), [SITEMAP_HEAD + SITEMAP_TAIL]);
  assert.deepEqual(partitionSitemaps([row, row]), [SITEMAP_HEAD + row + '\n' + row + SITEMAP_TAIL]);
  assert.deepEqual(SITEMAP_LIMITS, { urls: 50_000, bytes: 52_428_800 });
});

test('plan du site : limite de 50 000 URL incluse, partie suivante au-delà sans omission', () => {
  // Des métadonnées XML seulement : aucune photo, image ou grande base de test n’est créée.
  const entries = Array(50_000).fill(row);
  const one = partitionSitemaps(entries);
  assert.equal(one.length, 1);
  assert.equal(count(one[0]), 50_000);
  const two = partitionSitemaps([...entries, row]);
  assert.deepEqual(two.map(count), [50_000, 1]);
  assert.ok(two.every(document => Buffer.byteLength(document, 'utf8') <= SITEMAP_LIMITS.bytes));
});

test('plan du site : borne UTF-8 exacte avec enveloppe et séparateurs, sans confondre signes et octets', () => {
  // Même algorithme et comparaison que les 50 Mo, avec une petite borne mesurable incluant les accents.
  const exact = Buffer.byteLength(SITEMAP_HEAD + row + '\n' + row + SITEMAP_TAIL, 'utf8');
  assert.ok(Buffer.byteLength(row, 'utf8') > row.length);
  assert.equal(partitionSitemaps([row, row], { maxBytes: exact }).length, 1);
  const parts = partitionSitemaps([row, row], { maxBytes: exact - 1 });
  assert.deepEqual(parts.map(count), [1, 1]);
  assert.ok(parts.every(document => Buffer.byteLength(document, 'utf8') <= exact - 1));
  assert.deepEqual(partitionSitemaps([row, row], { maxUrls: 1 }).map(count), [1, 1]);
});

test('plan du site : une entrée trop grande ou des limites invalides ne sont jamais tronquées', () => {
  const tooSmall = Buffer.byteLength(SITEMAP_HEAD + row + SITEMAP_TAIL, 'utf8') - 1;
  assert.throws(() => partitionSitemaps([row], { maxBytes: tooSmall }), RangeError);
  for (const options of [{ maxUrls: 0 }, { maxUrls: 1.5 }, { maxBytes: 0 }, { maxBytes: Infinity }]) {
    assert.throws(() => partitionSitemaps([row], options), RangeError);
  }
  assert.throws(() => partitionSitemaps([{}]), TypeError);
});

test('index des plans du site : adresses absolues échappées et nombre borné', () => {
  const index = createSitemapIndex('https://exemple.test/archives&photos', 2);
  assert.match(index, /<sitemapindex xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.match(index, /<loc>https:\/\/exemple.test\/archives&amp;photos\/sitemaps\/1.xml<\/loc>/);
  assert.match(index, /<loc>https:\/\/exemple.test\/archives&amp;photos\/sitemaps\/2.xml<\/loc>/);
  assert.equal((index.match(/<sitemap>/g) || []).length, 2);
  for (const invalid of [0, -1, 1.5, 50_001, Infinity, '2']) assert.throws(() => createSitemapIndex('https://exemple.test', invalid), RangeError);
});

test('plan du site HTTP : petit corpus unique, parties absentes, paramètres fermés et retrait immédiat', async t => {
  const c = await setup(t, { seeded: true });
  const before = await c.app.inject('/sitemap.xml');
  assert.equal(before.statusCode, 200);
  assert.match(before.headers['content-type'], /application\/xml/);
  assert.equal(before.headers['cache-control'], 'no-store');
  assert.ok(before.body.startsWith(SITEMAP_HEAD));
  assert.ok(before.body.endsWith(SITEMAP_TAIL));
  assert.doesNotMatch(before.body, /<sitemapindex/);
  const entries = [...before.body.matchAll(/^  <url>[^]*?<\/url>$/gm)].map(m => m[0]);
  assert.equal(before.body, partitionSitemaps(entries)[0]);
  assert.match(before.body, /\/photo\/brume-sur-la-loire<\/loc>/);
  for (const value of ['1', '2', '0', '01', '-1', '1e2', '50001', '999999999999', 'constructor']) {
    assert.equal((await c.app.inject(`/sitemaps/${value}.xml`)).statusCode, 404, value);
  }
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE slug = 'brume-sur-la-loire'").run();
  const after = await c.app.inject('/sitemap.xml');
  assert.equal(after.statusCode, 200);
  assert.doesNotMatch(after.body, /\/photo\/brume-sur-la-loire<\/loc>/);
  put(c.db, 'seo_visibility', 'off');
  const off = await c.app.inject('/sitemap.xml');
  assert.equal(off.statusCode, 200);
  assert.equal(count(off.body), 0);
  assert.equal(off.headers['cache-control'], 'no-store');
  for (const method of ['GET', 'HEAD']) assert.equal((await c.app.inject({ method, url: '/sitemaps/1.xml' })).statusCode, 404);
});
