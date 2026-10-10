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

// Aide en ligne : docs/aide/NN-section.md, source unique de l'aide de l'admin et des pages « Aide » du wiki.
// Rendu une fois (contenu du dépôt, de confiance) : sections, sommaire, ancres et liens internes réécrits.
export function loadHelp() {
  const files = fs.readdirSync(DIR).filter(f => /^\d+-[a-z0-9-]+\.md$/.test(f)).sort();
  const ids = files.map(f => f.replace(/^\d+-/, '').replace(/\.md$/, ''));
  const sections = files.map((f, i) => {
    const id = ids[i];
    const md = fs.readFileSync(new URL(f, DIR), 'utf8');
    const title = /^# (.+)$/m.exec(md)?.[1] ?? id;
    const headings = [];
    const marked = new Marked({
      gfm: true,
      renderer: {
        heading({ tokens, depth }) {
          const text = this.parser.parseInline(tokens);
          if (depth === 1) return '';                                      // titre de section rendu par le gabarit
          const plain = decode(text.replace(/<[^>]+>/g, ''));
          const hid = `${id}-${anchor(plain)}`;
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
    return { id, title, html: marked.parse(md), headings };
  });
  return { sections, ids };
}
