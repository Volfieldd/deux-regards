// Génère les pages d'aide du wiki depuis docs/aide/ (source unique, aussi affichée dans l'admin).
//   node docs/wiki/aide.mjs <dossier du wiki>
// Français : « Aide-<Titre>.md » et le sommaire « Aide.md ». Traductions (docs/aide/en/, docs/aide/de/), si complètes :
// « Help-<Title>.md » / « Help.md » et « Hilfe-<Titel>.md » / « Hilfe.md ». Les liens [texte](section#ancre) sont
// réécrits vers ces pages ; dans les traductions, l'ancre française devient celle du titre traduit de même rang.
import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';
import { anchor } from '../../server/help.js';

const out = process.argv[2];
if (!out) throw new Error('usage : node docs/wiki/aide.mjs <dossier du wiki>');
const dir = new URL('../aide/', import.meta.url);
const files = fs.readdirSync(dir).filter(f => /^\d+-[a-z0-9-]+\.md$/.test(f)).sort();
const LANGS = {
  fr: { prefix: 'Aide', index: 'Aide', heading: 'Aide de l’administration', also: 'Voir aussi la [visite de l’admin en captures](Visite-de-l-admin).',
    note: '> Cette page est générée depuis `docs/aide/` : c\'est aussi l\'**aide en ligne** de l\'admin (menu « Aide »). La modifier dans le dépôt, pas ici.' },
  en: { prefix: 'Help', index: 'Help', heading: 'Admin help (English)', also: 'French original: [Aide](Aide).',
    note: '> This page is generated from `docs/aide/en/`: it is also the admin’s **online help** (“Help” menu). Edit it in the repository, not here.' },
  de: { prefix: 'Hilfe', index: 'Hilfe', heading: 'Hilfe zur Verwaltung (Deutsch)', also: 'Französisches Original: [Aide](Aide).',
    note: '> Diese Seite wird aus `docs/aide/de/` erzeugt: Sie ist auch die **Online-Hilfe** der Verwaltung (Menü „Hilfe“). Bitte im Repository ändern, nicht hier.' },
};
// Ancres « à la GitHub » des titres (niveau 2 et plus) d'une page, dans l'ordre.
const anchors = md => new Marked().lexer(md).filter(t => t.type === 'heading' && t.depth > 1).map(t => anchor(t.text.replace(/[*_`]/g, '')));
const read = (lang, f) => fs.readFileSync(new URL(lang === 'fr' ? f : `${lang}/${f}`, dir), 'utf8');

const frPages = files.map(f => ({ id: f.replace(/^\d+-/, '').replace(/\.md$/, ''), f, anchors: anchors(read('fr', f)) }));
let total = 0;
for (const [lang, L] of Object.entries(LANGS)) {
  if (lang !== 'fr' && !files.every(f => fs.existsSync(new URL(`${lang}/${f}`, dir)))) continue;
  const pages = frPages.map(p => {
    const md = read(lang, p.f);
    const title = /^# (.+)$/m.exec(md)[1];
    return { ...p, md, title, page: `${L.prefix}-${title.replace(/[’'„“”"]/g, '').replace(/[\s/]+/g, '-')}`, own: anchors(md) };
  });
  const byId = Object.fromEntries(pages.map(p => [p.id, p]));
  // Ancre française → ancre du titre traduit de même rang, sur la page visée.
  const hashFor = (p, hash) => {
    if (!hash || lang === 'fr') return hash;
    const i = p.anchors.indexOf(hash.slice(1));
    return i >= 0 && p.own[i] ? `#${p.own[i]}` : '';
  };
  for (const p of pages) {
    const body = p.md
      .replace(/^# .+\n+/, '')
      .replace(/\]\(([a-z0-9-]+)(#[^)]+)?\)/g, (m, id, hash = '') => (byId[id] ? `](${byId[id].page}${hashFor(byId[id], hash)})` : m));
    fs.writeFileSync(path.join(out, `${p.page}.md`), `${L.note}\n\n${body}`);
  }
  const index = [`# ${L.heading}`, '', L.note, '', ...pages.map((p, i) => `${i + 1}. [${p.title}](${p.page})`), '', L.also, ''].join('\n');
  fs.writeFileSync(path.join(out, `${L.index}.md`), index);
  total += pages.length;
}
console.log(`${total} pages d'aide générées`);
