import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config.js';
import { openDb, migrate } from '../server/db/index.js';
import { buildApp } from '../server/app.js';

// Base et stockage jetables, dans un dossier temporaire propre à chaque test.
export async function setup(t, { seeded = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-photo-'));
  const config = loadConfig({ STORAGE_DIR: dir, DATABASE_PATH: path.join(dir, 'test.db'), SITE_NAME: 'Test' });
  const db = openDb(config.databasePath);
  migrate(db);
  if (seeded) await (await import('../server/db/seed.js')).seed(db, config);
  const app = await buildApp({ config, db, logger: false });
  t.after(async () => {
    await app.close();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { app, db, config, dir };
}
