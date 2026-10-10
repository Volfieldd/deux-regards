// Génère les pages « Aide » du wiki depuis docs/aide/ (source unique, aussi affichée dans l'admin).
//   node docs/wiki/aide.mjs <dossier du wiki>
// Chaque section devient « Aide-<Titre>.md » ; les liens [texte](section#ancre) sont réécrits vers ces pages ;
// la page « Aide.md » en est le sommaire.
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('usage : node docs/wiki/aide.mjs <dossier du wiki>');
const dir = new URL('../aide/', import.meta.url);
const files = fs.readdirSync(dir).filter(f => /^\d+-[a-z0-9-]+\.md$/.test(f)).sort();
const pages = files.map(f => {
  const md = fs.readFileSync(new URL(f, dir), 'utf8');
  const title = /^# (.+)$/m.exec(md)[1];
  return { id: f.replace(/^\d+-/, '').replace(/\.md$/, ''), title, page: `Aide-${title.replace(/[’']/g, '').replace(/\s+/g, '-')}`, md };
});
const byId = Object.fromEntries(pages.map(p => [p.id, p]));
const NOTE = '> Cette page est générée depuis `docs/aide/` : c\'est aussi l\'**aide en ligne** de l\'admin (menu « Aide »). La modifier dans le dépôt, pas ici.\n\n';

for (const p of pages) {
  const body = p.md
    .replace(/^# .+\n+/, '')
    .replace(/\]\(([a-z0-9-]+)(#[^)]+)?\)/g, (m, id, hash = '') => (byId[id] ? `](${byId[id].page}${hash})` : m));
  fs.writeFileSync(path.join(out, `${p.page}.md`), `${NOTE}${body}`);
}
const index = ['# Aide de l’administration', '', NOTE.trim(), '',
  ...pages.map((p, i) => `${i + 1}. [${p.title}](${p.page})`), '',
  'Voir aussi la [visite de l’admin en captures](Visite-de-l-admin).', ''].join('\n');
fs.writeFileSync(path.join(out, 'Aide.md'), index);
console.log(`${pages.length} pages d'aide générées`);
