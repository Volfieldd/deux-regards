import { loadConfig } from './config.js';
import { openDb, migrate, vacuumOnce } from './db/index.js';
import { buildApp } from './app.js';
import { assertPersistentStorage } from './storage-guard.js';

let config;
try {
  config = loadConfig();
  assertPersistentStorage(config.storageDir);
} catch (err) {
  // Erreur de configuration : message lisible, pas de pile d'appels.
  console.error(`Démarrage refusé : ${err.message}`);
  process.exit(1);
}
const db = openDb(config.databasePath);
migrate(db);
const cleaned = vacuumOnce(db);

const app = await buildApp({ config, db });
if (cleaned) app.log.info('base reconstruite une fois : restes des données effacées retirés');
// En ligne sans DATA_KEY : noms, e-mails et signatures sont en clair dans la base et dans chaque sauvegarde.
if (config.production && !config.dataKey) app.log.warn('DATA_KEY non défini : données personnelles des rencontres en clair dans la base et les sauvegardes');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'arrêt');
    await app.close();
    db.close();
    process.exit(0);
  });
}

await app.listen({ host: config.host, port: config.port });
