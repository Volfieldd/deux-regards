import { loadConfig } from '../config.js';
import { openDb, migrate } from './index.js';
import { seed } from './seed.js';
import { createVariantService } from '../variants.js';

const config = loadConfig();
const db = openDb(config.databasePath);
const command = process.argv[2];
const COMMANDS = ['migrate', 'seed', 'variants'];
if (!COMMANDS.includes(command)) {
  console.error(`Commande inconnue : ${command ?? '(aucune)'}. Attendu : ${COMMANDS.join(', ')}.`);
  process.exit(2);
}

const applied = migrate(db);
console.log(applied.length ? `Migrations appliquées : ${applied.join(', ')}` : 'Base à jour.');

if (command === 'seed') {
  const result = await seed(db, config);
  console.log(result.skipped ? 'La base contient déjà des données, jeu de démonstration ignoré.' : `${result.photos} photos de démonstration importées.`);
}
if (command === 'variants') {
  // Même service que le serveur : filigrane et métadonnées des réglages, empreinte dans les noms.
  const siteName = () => JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'site_name'").pluck().get() || 'null') || config.siteName;
  const service = createVariantService({ db, storageDir: config.storageDir, siteName, publicUrl: config.publicUrl, log: { info: o => console.log(o), error: o => console.error(o) } });
  await service.schedule({ force: process.argv.includes('--force') });
  const { total, errors } = service.status();
  console.log(`Variantes à jour pour ${total} photos${errors.length ? `, ${errors.length} en erreur` : ''}.`);
}
db.close();
