import { loadConfig } from './config.js';
import { openDb, migrate } from './db/index.js';
import { buildApp } from './app.js';
import { assertPersistentStorage, assertDatabaseInStorage } from './storage-guard.js';

let config;
try {
  config = loadConfig();
  assertPersistentStorage(config.storageDir);
  assertDatabaseInStorage(config.databasePath, config.storageDir);
} catch (err) {
  // Erreur de configuration : message lisible, pas de pile d'appels.
  console.error(`Démarrage refusé : ${err.message}`);
  process.exit(1);
}
const db = openDb(config.databasePath);
migrate(db);

const app = await buildApp({ config, db });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'arrêt');
    await app.close();
    db.close();
    process.exit(0);
  });
}

await app.listen({ host: config.host, port: config.port });
