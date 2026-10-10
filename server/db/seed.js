import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { slugify } from '../slug.js';
import { generateVariants } from '../images.js';

const SEED_DIR = new URL('../../seed/', import.meta.url);

// Charge le jeu de démonstration (12 photos du prototype). Ne fait rien si la base contient déjà des photos.
export async function seed(db, { storageDir }) {
  if (db.prepare('SELECT count(*) FROM photos').pluck().get() > 0) return { skipped: true };

  const data = JSON.parse(fs.readFileSync(new URL('data.json', SEED_DIR), 'utf8'));
  const originals = path.join(storageDir, 'originals');
  fs.mkdirSync(originals, { recursive: true });

  // Lecture des images hors transaction (sharp est asynchrone).
  const files = [];
  for (const p of data.photos) {
    const buf = fs.readFileSync(new URL(`images/${p.image}.jpg`, SEED_DIR));
    const { width, height } = await sharp(buf).metadata();
    const file = `${crypto.randomUUID()}.jpg`;
    fs.writeFileSync(path.join(originals, file), buf);
    await generateVariants(storageDir, file);
    files.push({ file, width, height });
  }

  db.transaction(() => {
    const author = db.prepare('INSERT INTO authors (slug, name) VALUES (?, ?)');
    const authorIds = Object.fromEntries(data.authors.map(a => [a.slug, author.run(a.slug, a.name).lastInsertRowid]));

    const category = db.prepare('INSERT INTO categories (slug, name, position) VALUES (?, ?, ?)');
    const categoryIds = Object.fromEntries(data.categories.map((c, i) => [c.slug, category.run(c.slug, c.name, i).lastInsertRowid]));

    const photo = db.prepare(`INSERT INTO photos (slug, title, category_id, author_id, place, taken_on, legend, status, position, file, width, height)
      VALUES (@slug, @title, @category_id, @author_id, @place, @taken_on, @legend, 'published', @position, @file, @width, @height)`);
    data.photos.forEach((p, i) => photo.run({
      slug: slugify(p.title), title: p.title,
      category_id: categoryIds[p.category], author_id: authorIds[p.author],
      place: p.place, taken_on: p.taken_on, legend: p.legend, position: i, ...files[i],
    }));

    const setting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING');
    for (const [key, value] of Object.entries(data.settings)) setting.run(key, JSON.stringify(value));
  })();

  return { skipped: false, photos: data.photos.length };
}
