// Génère la page « Unraid » du wiki depuis deploy/unraid/README.md (source unique, livrée avec les fichiers de la pile).
//   node docs/wiki/unraid.mjs <dossier du wiki>
// Les liens relatifs du dépôt sont réécrits : pages du wiki pour docs/wiki/, GitHub pour les autres fichiers.
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('usage : node docs/wiki/unraid.mjs <dossier du wiki>');
const REPO = 'https://github.com/Volfieldd/deux-regards/blob/main';
const md = fs.readFileSync(new URL('../../deploy/unraid/README.md', import.meta.url), 'utf8');
const body = md
  .replace(/\]\(\.\.\/\.\.\/docs\/wiki\/([^)#]+)\.md(#[^)]*)?\)/g, (m, page, hash = '') => `](${page}${hash})`)
  // Fichiers du dépôt (chemin avec un point ou une barre) ; les noms de pages du wiki restent tels quels.
  .replace(/\]\((?!https?:|#)([^)]*[./][^)]*)\)/g, (m, file) => `](${REPO}/deploy/unraid/${file})`);
const note = '> Cette page est générée depuis [`deploy/unraid/README.md`](https://github.com/Volfieldd/deux-regards/blob/main/deploy/unraid/README.md), livré avec les fichiers de la pile. La modifier dans le dépôt, pas ici. Les marches à suivre ponctuelles sont regroupées dans [Procédures](Procédures).\n\n';
fs.writeFileSync(path.join(out, 'Unraid.md'), body.replace(/^(# .+\n)/, `$1\n${note}`));
console.log('page Unraid générée');
