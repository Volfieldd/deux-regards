import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config.js';
import { openDb, migrate } from '../server/db/index.js';
import { seed } from '../server/db/seed.js';
import { buildApp } from '../server/app.js';

// Clés de test de la Vigie (décisions signées) : la publique pour le site, la privée pour une Vigie simulée.
export const VIGIE_KEYS = (() => { const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519'); return { publicKey, privateKey, pub64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'), priv64: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') }; })();
const configFor = (dir, env = {}) => loadConfig({ STORAGE_DIR: dir, DATABASE_PATH: path.join(dir, 'test.db'), SITE_NAME: 'Test', TSA_URL: 'off', ...env });

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
// Modèle d'images factice (série proposée) : empreinte choisie par le test (vectors : nom de fichier → nombres), sinon
// une empreinte tirée du nom ; rien n'est téléchargé.
export function fakeImageModel(vectors = new Map()) {
  let n = 0;
  return { ensure: async () => {}, present: () => true, remove: () => {}, progress: () => null,
    embed: async file => { const name = file.split('/').pop(); const v = new Float32Array(512); const src = vectors.get(name);
      if (src) src.forEach((x, i) => { v[i] = x; }); else v[(n++) % 512] = 1; let m = 0; for (const x of v) m += x * x; return v.map(x => x / Math.sqrt(m)); } };
}

export async function setup(t, { seeded = false, env, oidc, logger = false, proofOptions, instagramOptions = { manual: true }, faceOptions = { manual: true, detector: { detect: async () => [] } }, seriesOptions = { manual: true, model: fakeImageModel() }, describeOptions = { manual: true, model: { describe: async () => 'A test photo.', unload: async () => {}, remove: async () => {} } }, mailTransport = null, vigieOptions } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-photo-'));
  if (seeded) fs.cpSync(await seededTemplate(), dir, { recursive: true });
  // TEST_AVEC_VIGIE=1 (npm run test:vigie) : toute la suite tourne avec une Vigie simulée, pour vérifier qu'elle ne
  // change rien à ce que fait le site.
  if (process.env.TEST_AVEC_VIGIE === '1' && !(env && 'VIGIE_URL' in env)) {
    env = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64, ...env };
    vigieOptions ??= { send: async () => {}, timers: false, pollDecisions: false };
  }
  const config = configFor(dir, env);
  const db = openDb(config.databasePath);
  migrate(db);
  // Photos de démonstration : des paysages, examinés sans visage (ce que dirait la détection).
  if (seeded) db.prepare('UPDATE photos SET faces = 0, face_boxes = \'[]\' WHERE faces IS NULL').run();
  const app = await buildApp({ config, db, logger, oidc, proofOptions, instagramOptions, faceOptions, seriesOptions, describeOptions, mailTransport, vigieOptions });
  t.after(async () => {
    await app.close();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { app, db, config, dir };
}
