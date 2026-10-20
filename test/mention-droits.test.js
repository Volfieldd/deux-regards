import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Droits sur le code (PR #164, LICENSE) : tout fichier JavaScript ou CSS que le site ou la console de la Vigie sert aux
// navigateurs commence par la même mention, et les paquets se déclarent propriétaires. Le 20 octobre 2026, 21 fichiers
// de l'admin v2, des thèmes et de la console de la Vigie, créés après la PR #164, ne l'avaient pas : ce test les attrape
// à la création.
const RACINE = fileURLToPath(new URL('..', import.meta.url));
const MENTION = '/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */';
const DOSSIERS_SERVIS = ['public', 'vigie/console/public'];

function fichiers(dossier) {
  const out = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (/\.(?:js|mjs|css)$/.test(e.name)) out.push(p);             // ni les polices, ni les cartes, ni les .br et .gz
  }
  return out;
}

test('fichiers JS et CSS servis (public/, console de la Vigie) : la mention de droits en première ligne', () => {
  const servis = DOSSIERS_SERVIS.flatMap(d => fichiers(path.join(RACINE, d)));
  assert.ok(servis.length >= 40, `fichiers servis trouvés : ${servis.length}`);
  const sans = servis.filter(f => fs.readFileSync(f, 'utf8').split('\n', 1)[0] !== MENTION).map(f => path.relative(RACINE, f));
  assert.deepEqual(sans, [], 'ajoute la ligne de la mention en tête (copie-la de public/js/site.js)');
});

test('paquets du site, de la Vigie et des tests navigateur : « UNLICENSED »', () => {
  for (const f of ['package.json', 'vigie/package.json', 'e2e/package.json']) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(RACINE, f), 'utf8')).license, 'UNLICENSED', f);
  }
});
