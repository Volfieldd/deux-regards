import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config.js';
import { openDb, migrate } from '../server/db/index.js';
import { seed } from '../server/db/seed.js';
import { buildApp } from '../server/app.js';

const configFor = dir => loadConfig({ STORAGE_DIR: dir, DATABASE_PATH: path.join(dir, 'test.db'), SITE_NAME: 'Test' });

// Le seed (génération AVIF/WebP) est coûteux : on le fait une fois par fichier de test
// dans un dossier modèle, recopié ensuite pour chaque test.
let template = null;
function seededTemplate() {
  template ??= (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-photo-tpl-'));
    const db = openDb(configFor(dir).databasePath);
    migrate(db);
    await seed(db, configFor(dir));
    db.close();
    process.once('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
  })();
  return template;
}

// Base et stockage jetables, dans un dossier temporaire propre à chaque test.
export async function setup(t, { seeded = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-photo-'));
  if (seeded) fs.cpSync(await seededTemplate(), dir, { recursive: true });
  const config = configFor(dir);
  const db = openDb(config.databasePath);
  migrate(db);
  const app = await buildApp({ config, db, logger: false });
  t.after(async () => {
    await app.close();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { app, db, config, dir };
}
