import fs from 'node:fs';
import path from 'node:path';

// En conteneur (REQUIRE_PERSISTENT_STORAGE=1), le dossier des données doit être un montage :
// sinon tout serait écrit dans la couche jetable du conteneur et perdu à sa recréation.
// Un montage se reconnaît à un périphérique différent de celui de son dossier parent.
export function assertPersistentStorage(dir, env = process.env) {
  if (env.REQUIRE_PERSISTENT_STORAGE !== '1') return;
  let here;
  let parent;
  try {
    here = fs.statSync(dir);
    parent = fs.statSync(path.dirname(path.resolve(dir)));
  } catch {
    throw new Error(`Dossier des données introuvable : ${dir}. Montez un dossier de l'hôte (voir compose.yaml).`);
  }
  if (here.dev === parent.dev && here.ino !== parent.ino) {
    throw new Error(`${dir} n'est pas un montage : les données seraient perdues à la recréation du conteneur. `
      + 'Montez un dossier de l’hôte (DATA_DIR dans compose.yaml) ; refus de démarrer.');
  }
  fs.accessSync(dir, fs.constants.W_OK);
}
