import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createImportTracker } from '../server/imports.js';
import { renderVariants, variantName, IMAGE_THREADS } from '../server/images.js';

const tick = ms => new Promise(r => setTimeout(r, ms));

test('suivi d’import : plusieurs photos à la fois, sans dépasser la limite, dans l’ordre d’arrivée', async () => {
  let now = 0, max = 0;
  const started = [];
  const tracker = createImportTracker({
    concurrency: 2,
    render: async id => { started.push(id); now++; max = Math.max(max, now); await tick(30); now--; if (id === 3) throw new Error('disque plein'); },
  });
  const all = [1, 2, 3, 4, 5].map(id => tracker.add(id, `p${id}.jpg`));
  await tick(5);
  assert.equal(tracker.get(1).state, 'processing');
  assert.equal(tracker.get(2).state, 'processing');
  assert.equal(tracker.get(3).state, 'waiting');                     // limite : deux à la fois
  assert.equal(tracker.active(), 5);
  await Promise.all(all);
  await tracker.idle();
  assert.equal(max, 2);
  assert.deepEqual(started, [1, 2, 3, 4, 5]);
  assert.equal(tracker.get(3).state, 'error');                       // une erreur ne bloque pas les suivantes
  assert.equal(tracker.get(5).state, 'ready');
  assert.equal(tracker.active(), 0);
});

test('libvips utilise plusieurs threads (sinon un seul sous Linux glibc)', () => {
  assert.ok(IMAGE_THREADS >= 1);
  assert.equal(sharp.concurrency(), IMAGE_THREADS);
});

test('rendu à décodage unique : mêmes dimensions et même image qu’un rendu direct depuis l’original', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-photo-perf-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'originals'));
  // Original 3000×2000 en orientation EXIF 6 (pivoté) : la base doit être orientée avant redimensionnement.
  const svg = Buffer.from('<svg width="3000" height="2000"><rect width="3000" height="2000" fill="#3a5f80"/><circle cx="2200" cy="600" r="420" fill="#f0d9a8"/><rect y="1400" width="3000" height="600" fill="#1d2b22"/></svg>');
  await sharp(svg).jpeg({ quality: 92 }).withMetadata({ orientation: 6 }).toFile(path.join(dir, 'originals', 'p.jpg'));
  await renderVariants(dir, 'p.jpg', { key: 'k' });
  for (const w of [640, 1280, 2000]) {
    const out = path.join(dir, 'variants', variantName('p.jpg', w, 'webp', 'k'));
    const m = await sharp(out).metadata();
    const ref = await sharp(path.join(dir, 'originals', 'p.jpg')).rotate().resize({ width: w }).raw().toBuffer({ resolveWithObject: true });
    assert.equal(m.width, ref.info.width, `largeur ${w}`);
    assert.ok(Math.abs(m.height - ref.info.height) <= 1, `hauteur ${w} : ${m.height} / ${ref.info.height}`);
    assert.ok(m.height > m.width, 'orientation appliquée (portrait)');
    // Écart moyen de luminance faible avec un rendu direct (compression WebP comprise).
    const a = await sharp(out).resize(64, 96, { fit: 'fill' }).greyscale().raw().toBuffer();
    const b = await sharp(ref.data, { raw: ref.info }).resize(64, 96, { fit: 'fill' }).greyscale().raw().toBuffer();
    const diff = a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
    assert.ok(diff < 4, `écart moyen ${diff.toFixed(2)} pour ${w} px`);
  }
});
