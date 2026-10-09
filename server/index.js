import { loadConfig } from './config.js';
import { openDb, migrate } from './db/index.js';
import { buildApp } from './app.js';

const config = loadConfig();
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
