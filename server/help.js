import fs from 'node:fs';
import { Marked } from 'marked';

const DIR = new URL('../docs/aide/', import.meta.url);

// Ancre « à la GitHub » : minuscules, ponctuation retirée, espaces → tirets, accents gardés.
// Les mêmes liens fonctionnent ainsi dans l'aide de l'admin et dans le wiki.
export const anchor = text => text.toLowerCase().trim()
  .replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = s => s.replace(/&(amp|lt|gt|quot|#39);/g, e => ENTITIES[e]);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Ancres des titres d'une page française, dans l'ordre (les traductions gardent les mêmes ancres).
const frenchIds = (id, md) => new Marked().lexer(md).filter(tk => tk.type === 'heading' && tk.depth > 1)
  .map(tk => `${id}-${anchor(decode(tk.text.replace(/<[^>]+>/g, '').replace(/[*_`]/g, '')))}`);

// Les identifiants des chapitres (docs/aide/NN-section.md → « section »), dans l'ordre : sans rendre le Markdown. L'admin v2 les
// donne au script du panneau d'aide contextuelle, qui en reconnaît le chapitre d'une ancre sans rien demander au serveur.
export const chapterIds = () => fs.readdirSync(DIR).filter(f => /^\d+-[a-z0-9-]+\.md$/.test(f)).sort().map(f => f.replace(/^\d+-/, '').replace(/\.md$/, ''));

// Aide en ligne : docs/aide/NN-section.md (français, source), traduite dans docs/aide/en/ et docs/aide/de/ avec les
// mêmes titres dans le même ordre ; source de l'aide de l'admin et des pages « Aide » du wiki.
// Rendu une fois par langue (contenu du dépôt, de confiance) : sections, sommaire, ancres et liens internes réécrits.
// Les ancres restent celles du français, quelle que soit la langue : les liens de l'admin vers l'aide ne changent pas.
// lang : renvoie aussi la langue réellement servie (français si la traduction manque).
export function loadHelp(lang = 'fr') {
  const files = fs.readdirSync(DIR).filter(f => /^\d+-[a-z0-9-]+\.md$/.test(f)).sort();
  const ids = files.map(f => f.replace(/^\d+-/, '').replace(/\.md$/, ''));
  const translated = lang !== 'fr' && files.every(f => fs.existsSync(new URL(`${lang}/${f}`, DIR)));
  const served = translated ? lang : 'fr';
  const sections = files.map((f, i) => {
    const id = ids[i];
    const fr = fs.readFileSync(new URL(f, DIR), 'utf8');
    const md = translated ? fs.readFileSync(new URL(`${lang}/${f}`, DIR), 'utf8') : fr;
    const frIds = frenchIds(id, fr);
    let n = 0;
    const title = /^# (.+)$/m.exec(md)?.[1] ?? id;
    const headings = [];
    const marked = new Marked({
      gfm: true,
      renderer: {
        heading({ tokens, depth }) {
          const text = this.parser.parseInline(tokens);
          if (depth === 1) return '';                                      // titre de section rendu par le gabarit
          const plain = decode(text.replace(/<[^>]+>/g, ''));
          const hid = frIds[n++] ?? `${id}-${anchor(plain)}`;
          if (depth === 2) headings.push({ id: hid, text: plain });
          return `<h${depth + 1} id="${hid}">${text}</h${depth + 1}>\n`;
        },
        // [texte](section) ou [texte](section#titre) → ancre de cette page ; liens externes inchangés.
        link({ href, title: t, tokens }) {
          const text = this.parser.parseInline(tokens);
          const m = /^([a-z0-9-]+)(?:#(.+))?$/.exec(href);
          if (m && ids.includes(m[1])) return `<a href="#${m[2] ? `${m[1]}-${m[2]}` : m[1]}">${text}</a>`;
          const external = /^https?:\/\//.test(href);
          return `<a href="${esc(href)}"${t ? ` title="${esc(t)}"` : ''}${external ? ' rel="noopener" target="_blank"' : ''}>${text}</a>`;
        },
      },
    });
    // Tableaux et blocs de code défilent seuls sur téléphone : atteignables au clavier (WCAG 2.1.1).
    const html = marked.parse(md).replace(/<pre>/g, '<pre tabindex="0">').replace(/<table>/g, '<table tabindex="0">');
    return { id, title, html, headings };
  });
  return { sections, ids, lang: served };
}
