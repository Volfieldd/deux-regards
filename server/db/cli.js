import { loadConfig } from '../config.js';
import { openDb, migrate } from './index.js';
import { seed } from './seed.js';
import { generateVariants } from '../images.js';

const config = loadConfig();
const db = openDb(config.databasePath);
const command = process.argv[2];

const applied = migrate(db);
console.log(applied.length ? `Migrations appliquées : ${applied.join(', ')}` : 'Base à jour.');

if (command === 'seed') {
  const result = await seed(db, config);
  console.log(result.skipped ? 'Des photos existent déjà, jeu de démonstration ignoré.' : `${result.photos} photos de démonstration importées.`);
}
if (command === 'variants') {
  const files = db.prepare('SELECT file FROM photos').pluck().all();
  for (const file of files) await generateVariants(config.storageDir, file, { force: process.argv.includes('--force') });
  console.log(`Variantes à jour pour ${files.length} photos.`);
}
db.close();
