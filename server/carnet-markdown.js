import { Marked } from 'marked';
import { fmt, typo, ancre, esc, rowSizes, billetLarge } from './v2-vues.js';

// Corps d'un billet des Carnets : Markdown restreint (étude docs/etudes/blog-galeries-boutique.md, § 1.4 ; maquette MQ-20,
// lexique § 4.10), rendu par le serveur à chaque affichage (B20), jamais du HTML gardé en base.
//
// Une instance Marked dédiée ne sert qu'à découper le texte (lexer) ; le HTML est écrit ici, type de jeton par type de
// jeton, chaque texte et chaque attribut échappé (B17) : un jeton inconnu devient du texte. L'aide (server/help.js), qui
// laisse passer HTML et liens, n'est pas concernée.
//   - HTML brut (« <script> », « <b onclick=…> ») : affiché comme du texte, et compté.
//   - Liens : schéma lu après décodage des entités et retrait des caractères de contrôle (« jav&#x09;ascript: »), puis liste
//     d'autorisation : https, http, mailto, chemin du site (« /… », jamais « //… »), ancre « #… », et les références internes
//     photo:<id>, serie:<id>, voyage:<id>, carnet:<id> (B9, B18). Le reste devient du texte (B18), et un schéma actif
//     (javascript:, vbscript:, data:) est compté.
//   - Images : seulement celles de la photothèque, une photo par ligne (« photo:<id> » seul sur sa ligne, MQ-20) ; une
//     image Markdown (« ![x](https://…) ») est retirée et comptée (image externe).
//   - Le contenu d'un bloc de code n'est jamais compté : un billet « Atelier » peut citer du HTML (BV-12).
// Ce qui a été neutralisé (neutralized) sert au signalement à la Vigie (BV-12, server/carnet.js) et aux vérifications de
// l'éditeur (B37) ; jamais le texte lui-même.

export const KINDS = ['photo', 'serie', 'voyage', 'carnet'];
export const MAX_GALLERY = 12;
const PHOTO_LINE = /^[ \t]*photo:(\S+)[ \t]*$/;

// Groupe de photos : des lignes « photo:… » qui se suivent, sans ligne vide entre elles (une photo seule, une paire, une
// galerie). Elles coupent un paragraphe qu'elles suivent sans ligne vide.
const photosExtension = {
  name: 'photos', level: 'block',
  start(src) { const m = /(^|\n)[ \t]*photo:\S+[ \t]*(?=\n|$)/.exec(src); return m ? m.index + (m[1] ? 1 : 0) : undefined; },
  tokenizer(src) {
    const m = /^(?:[ \t]*photo:\S+[ \t]*(?:\n|$))+/.exec(src);
    if (!m) return undefined;
    return { type: 'photos', raw: m[0], refs: m[0].split('\n').map(l => PHOTO_LINE.exec(l)?.[1]).filter(Boolean) };
  },
};
const lexer = new Marked({ gfm: true, breaks: false, extensions: [photosExtension] });

// ---------- entités et schémas ----------
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', tab: '\t', newline: '\n', nbsp: '\u00a0', sol: '/', lpar: '(', rpar: ')' };
export function decodeEntities(s) {
  let out = String(s ?? '');
  // Deux passes : « &amp;#x09; » ne doit pas cacher une tabulation à la seconde lecture d'un navigateur.
  for (let i = 0; i < 2; i++) {
    out = out.replace(/&#x([0-9a-f]+);?/gi, (m, h) => safeChar(parseInt(h, 16)))
      .replace(/&#(\d+);?/g, (m, d) => safeChar(Number(d)))
      .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
  }
  return out;
}
const safeChar = code => (Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '');
// Forme comparée : décodée, sans caractères de contrôle ni espaces (le navigateur les ignore dans un schéma), en minuscules.
const squash = s => decodeEntities(s).replace(/[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufffd]/g, '').toLowerCase();
const ACTIVE = /^(?:javascript|vbscript|livescript|mocha):/;

// Cible d'un lien : { kind: 'web' | 'mailto' | 'local' | 'anchor' | 'ref' | 'refused', href, ref?, active? }.
export function linkTarget(raw) {
  const compact = squash(raw);
  if (!compact) return { kind: 'refused' };
  if (ACTIVE.test(compact)) return { kind: 'refused', active: 'schema_refuse' };
  if (compact.startsWith('data:')) return { kind: 'refused', active: 'data_url' };
  const ref = /^(photo|serie|voyage|carnet):(\d+)$/.exec(compact);
  if (ref) return { kind: 'ref', ref: { kind: ref[1], id: Number(ref[2]) } };
  const clean = decodeEntities(raw).trim();
  if (/^#[\w\-À-ɏ]+$/.test(clean)) return { kind: 'anchor', href: clean };
  if (/^\/(?!\/)/.test(clean) && !/[\\\u0000-\u001f]/.test(clean)) {
    try { const u = new URL(clean, 'https://site.invalid'); if (u.origin === 'https://site.invalid') return { kind: 'local', href: u.pathname + u.search + u.hash }; } catch { /* refusé plus bas */ }
    return { kind: 'refused' };
  }
  let u;
  try { u = new URL(clean); } catch { return { kind: 'refused' }; }
  if (u.protocol === 'https:' || u.protocol === 'http:') return u.hostname ? { kind: 'web', href: u.href } : { kind: 'refused' };
  if (u.protocol === 'mailto:') return /^[^\s@]+@[^\s@]+$/.test(decodeURIComponent(u.pathname)) ? { kind: 'mailto', href: u.href } : { kind: 'refused' };
  return { kind: 'refused' };
}

// ---------- constructions actives dans un texte (titre, chapô, mention : du texte seul) ----------
export const emptyCounts = () => ({ script: 0, attribut_evenement: 0, schema_refuse: 0, data_url: 0, html_brut: 0, image_externe: 0 });
function countHtml(raw, counts) {
  const s = decodeEntities(raw);
  counts.html_brut += 1;
  if (/<\s*\/?\s*script\b/i.test(s)) counts.script += 1;
  if (/\son[a-z]+\s*=/i.test(s)) counts.attribut_evenement += 1;
  if (/(?:java|vb)script\s*:/i.test(squash(s))) counts.schema_refuse += 1;
  if (/(?:src|href|data)\s*=\s*["']?\s*data:/i.test(s)) counts.data_url += 1;
}
// Texte simple (titre, chapô, mention) : affiché tel quel, échappé ; on y compte ce qui ressemble à du HTML ou à un schéma
// actif, comme le rendu du corps.
export function scanPlain(text) {
  const counts = emptyCounts();
  const s = String(text ?? '');
  for (const m of s.matchAll(/<\s*\/?\s*[a-z!][^>]*>?/gi)) countHtml(m[0], counts);
  const c = squash(s);
  if (!/<[^>]*script/i.test(s) && /(?:java|vb)script:/.test(c)) counts.schema_refuse += 1;
  if (/data:[a-z]+\/[a-z0-9.+-]+[;,]/i.test(s) && !counts.data_url) counts.data_url += 1;
  return counts;
}
export const activeCount = c => c.script + c.attribut_evenement + c.schema_refuse + c.data_url;
export const totalCount = c => Object.values(c).reduce((a, b) => a + b, 0);

// ---------- éditeur ↔ base (B9) ----------
// Dans l'éditeur, une photo ou une référence s'écrit avec le slug du moment (« photo:quai-ligny-soir », « [texte](serie:rue) ») ;
// la base garde l'identifiant (« photo:24 ») : un slug qui change ne casse rien. resolve(kind, slug) → identifiant ou null ;
// name(kind, id) → slug ou null. Une valeur inconnue reste telle quelle (signalée par les vérifications).
const refsIn = (text, fn) => String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map(line => {
  const pm = PHOTO_LINE.exec(line);
  if (pm) return `photo:${fn('photo', pm[1]) ?? pm[1]}`;
  return line.replace(/\]\((photo|serie|voyage|carnet):([^)\s"]+)/g, (m, kind, v) => `](${kind}:${fn(kind, v) ?? v}`);
}).join('\n');
export const toStored = (text, resolve) => refsIn(text, (kind, v) => resolve(kind, v));
export const toEditor = (text, name) => refsIn(text, (kind, v) => (/^\d+$/.test(v) ? name(kind, Number(v)) : null));

// Identifiants des photos d'un corps en base, dans l'ordre, sans doublon.
export function photoIdsOf(body) {
  const ids = [];
  for (const line of String(body ?? '').split('\n')) {
    const m = PHOTO_LINE.exec(line);
    if (m && /^\d+$/.test(m[1]) && !ids.includes(Number(m[1]))) ids.push(Number(m[1]));
  }
  return ids;
}
// Références internes d'un corps en base (index post_refs).
export function refsOf(body) {
  const out = [];
  const add = (kind, id) => { if (!out.some(r => r.kind === kind && r.id === id)) out.push({ kind, id }); };
  for (const id of photoIdsOf(body)) add('photo', id);
  for (const m of String(body ?? '').matchAll(/\]\((photo|serie|voyage|carnet):(\d+)/g)) add(m[1], Number(m[2]));
  return out;
}

// ---------- rendu ----------
// ctx :
//   lang                      langue du texte rendu
//   photo(id)                 { photo, setting, visible } ou null : photo décorée (repo), réglages du billet, publiée (ou aperçu)
//   href(kind, id)            adresse d'une référence interne publique, ou null (texte simple, B22)
//   photoHref(photo, n)       adresse de la visionneuse (contexte du billet)
//   meta(photo)               méta du cartel du récit
//   picture(photo, opts)      <picture> (server/picture.js, base /media/ ou /admin/media/)
//   t                         { seeBig(n, total), diptyque(a, b), deuxRegards, nonPubliee, altManquant, galerie(n) }
//   preview                   aperçu de l'équipe : photo non publiée montrée et marquée (B21)
//   skip                      identifiant de la couverture, déjà montrée à l'ouverture : non répétée seule dans le texte
// Renvoie { html, headings, photoIds, warnings, neutralized, words }.
export function renderBody(source, ctx) {
  const counts = emptyCounts();
  const warnings = [];
  const warn = (code, extra = {}) => { if (!warnings.some(w => w.code === code && w.ref === extra.ref)) warnings.push({ code, ...extra }); };
  const tokens = lexer.lexer(String(source ?? '').replace(/\r\n?/g, '\n'));
  const ids = new Set();
  const headings = [];
  let words = 0, lastDepth = 1;
  // Ordre des photos du billet (numéro « photo n sur N ») : celles qui seront montrées.
  const shown = [];
  for (const tk of walk(tokens)) {
    if (tk.type !== 'photos') continue;
    for (const ref of tk.refs) {
      const id = /^\d+$/.test(ref) ? Number(ref) : null;
      const it = id != null ? ctx.photo(id) : null;
      if (it && (it.visible || ctx.preview) && !shown.includes(id)) shown.push(id);
    }
  }
  const total = shown.length;

  const text = s => { words += String(s).split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length; return esc(typo(s, ctx.lang)); };
  const inline = list => (list || []).map(tk => {
    switch (tk.type) {
      case 'text': return tk.tokens ? inline(tk.tokens) : text(tk.text);
      case 'escape': return esc(tk.text);
      case 'strong': return `<strong>${inline(tk.tokens)}</strong>`;
      case 'em': return `<em>${inline(tk.tokens)}</em>`;
      case 'del': return `<del>${inline(tk.tokens)}</del>`;
      case 'codespan': return `<code>${esc(tk.text)}</code>`;
      case 'br': return '<br>';
      case 'html': countHtml(tk.text, counts); warn('html_brut'); return esc(tk.text);
      case 'image': return image(tk);
      case 'link': return link(tk);
      default: return esc(tk.raw ?? tk.text ?? '');
    }
  }).join('');
  function image(tk) {
    const target = squash(tk.href);
    if (/^photo:/.test(target)) { warn('photo_dans_le_texte'); return ''; }
    counts.image_externe += 1;
    if (target.startsWith('data:')) counts.data_url += 1;
    if (ACTIVE.test(target)) counts.schema_refuse += 1;
    warn('image_externe');
    return '';
  }
  function link(tk) {
    const label = inline(tk.tokens);
    const plain = String(tk.text ?? '').trim().toLowerCase();
    if (/^(?:cliquez|clique|click|klicken)(?:\s+(?:ici|here|hier))?$|^ici$|^here$|^hier$/.test(plain)) warn('cliquez_ici');
    const target = linkTarget(tk.href);
    if (target.kind === 'refused') {
      if (target.active) { counts[target.active] += 1; warn('schema_refuse'); } else warn('lien_refuse');
      return label;
    }
    if (target.kind === 'ref') {
      const href = ctx.href(target.ref.kind, target.ref.id);
      if (!href) { warn('lien_casse', { ref: `${target.ref.kind}:${target.ref.id}` }); return label; }
      return `<a href="${esc(href)}">${label}</a>`;
    }
    if (target.kind === 'web') {
      // Lien payé ou d'affiliation (B72) : titre « sponsorisé » ; sinon un lien éditorial, sans nofollow.
      const sponsored = /^(?:sponsoris[ée]|sponsored|gesponsert|affiliation|affiliate)$/i.test(String(tk.title ?? '').trim());
      return `<a href="${esc(target.href)}" rel="${sponsored ? 'sponsored ' : ''}external noopener">${label}</a>`;
    }
    return `<a href="${esc(target.href)}">${label}</a>`;
  }

  // Intertitres : « # » et « ## » donnent h2, « ### » h3, au-delà h4 (B23) ; ancres stables d'après le texte.
  const anchorIds = new Set(['contenu', 'titre']);
  const h2 = tokens.filter(tk => tk.type === 'heading' && tk.depth <= 2).length;
  const numbered = h2 >= 2;
  let h2n = 0, current = null;
  const blocks = list => list.map(tk => {
    switch (tk.type) {
      case 'space': return '';
      case 'paragraph': return `<p>${inline(tk.tokens)}</p>\n`;
      case 'heading': {
        const level = tk.depth <= 2 ? 2 : tk.depth === 3 ? 3 : 4;
        if (level > lastDepth + 1) warn('niveau_saute');
        lastDepth = level;
        const label = inline(tk.tokens);
        const plain = decodeEntities(label.replace(/<[^>]+>/g, ''));
        const id = ancre(plain, anchorIds);
        if (level === 2) {
          h2n += 1;
          current = { id, text: plain, n: h2n, photos: 0 };
          headings.push(current);
          return `<h2 class="jour" id="${id}">${numbered ? `<span class="s-n" aria-hidden="true">${h2n}</span>` : ''}${label}</h2>\n`;
        }
        return `<h${level} id="${id}">${label}</h${level}>\n`;
      }
      case 'blockquote': return quote(tk);
      case 'list': {
        const tag = tk.ordered ? 'ol' : 'ul';
        const start = tk.ordered && Number(tk.start) > 1 ? ` start="${Number(tk.start)}"` : '';
        return `<${tag}${start}>${tk.items.map(item => `<li>${item.tokens.map(x => (x.type === 'text' ? (x.tokens ? inline(x.tokens) : text(x.text)) : blocks([x]))).join('')}</li>`).join('')}</${tag}>\n`;
      }
      // Bloc de code : du texte, jamais compté (B26 : atteignable au clavier).
      case 'code': return `<pre tabindex="0"><code>${esc(tk.text)}</code></pre>\n`;
      case 'hr': return '<hr>\n';
      case 'table': {
        const cell = (c, tag) => `<${tag}>${inline(c.tokens)}</${tag}>`;
        return `<div class="tableau"><table tabindex="0"><thead><tr>${tk.header.map(c => cell(c, 'th')).join('')}</tr></thead><tbody>${tk.rows.map(r => `<tr>${r.map(c => cell(c, 'td')).join('')}</tr>`).join('')}</tbody></table></div>\n`;
      }
      case 'html': countHtml(tk.text, counts); warn('html_brut'); return `<p>${esc(tk.text)}</p>\n`;
      case 'photos': return photos(tk.refs);
      default: return tk.raw ? `<p>${esc(tk.raw)}</p>\n` : '';
    }
  }).join('');

  // Citation (MQ-12) : « > (pt-PT) … » donne la langue de la citation (RGAA 8.7) ; un paragraphe qui commence par
  // « Traduction : » est sa traduction ; un dernier paragraphe qui commence par « — » est sa source.
  function quote(tk) {
    const inner = tk.tokens.filter(x => x.type !== 'space');
    let lang = '';
    const first = inner[0];
    if (first?.type === 'paragraph' && first.tokens?.[0]?.type === 'text') {
      const m = /^\(([a-z]{2,3}(?:-[A-Za-z]{2})?)\)\s*/.exec(first.tokens[0].text);
      if (m) { lang = m[1]; first.tokens[0] = { ...first.tokens[0], text: first.tokens[0].text.slice(m[0].length), tokens: undefined }; }
    }
    const last = inner.at(-1);
    let source = '';
    if (inner.length > 1 && last?.type === 'paragraph' && /^[—–-]{1,2}\s/.test(last.text)) {
      source = inline([{ ...last.tokens[0], text: last.tokens[0].text.replace(/^[—–-]{1,2}\s+/, ''), tokens: undefined }, ...last.tokens.slice(1)]);
      inner.pop();
    }
    const said = [], trad = [];
    for (const x of inner) {
      if (x.type === 'paragraph' && /^(?:traduction|translation|übersetzung)\s*:\s*/i.test(x.text)) {
        trad.push(`<p class="trad">${inline([{ ...x.tokens[0], text: x.tokens[0].text.replace(/^[^:]+:\s*/, ''), tokens: undefined }, ...x.tokens.slice(1)])}</p>`);
      } else said.push(blocks([x]));
    }
    return `<figure class="citation"><blockquote${lang ? ` lang="${esc(lang)}"` : ''}>${said.join('')}</blockquote>${trad.join('')}${source ? `<figcaption>${source}</figcaption>` : ''}</figure>\n`;
  }

  // Photos : une ligne seule, une paire, ou une galerie (de 3 à 12, B63). Une photo absente du site (non publiée, retirée,
  // supprimée) sort du rendu public (B21) ; dans l'aperçu de l'équipe, elle reste, marquée « non publiée ».
  function photos(refs) {
    const items = [];
    for (const ref of refs) {
      const id = /^\d+$/.test(ref) ? Number(ref) : null;
      const it = id != null ? ctx.photo(id) : null;
      if (!it) { warn('photo_inconnue', { ref }); continue; }
      if (!it.visible) { warn('photo_non_publiee', { ref: String(id) }); if (!ctx.preview) continue; }
      if (ids.has(id)) continue;
      ids.add(id);
      // La couverture, montrée à l'ouverture du billet (MQ-12, repère 4), n'est pas répétée seule dans le texte.
      if (ctx.skip === id && refs.length === 1) continue;
      items.push({ ...it, n: shown.indexOf(id) + 1 });
      if (current) current.photos += 1;
    }
    if (!items.length) return '';
    if (items.length > MAX_GALLERY) { warn('galerie_trop_longue'); items.length = MAX_GALLERY; }
    if (items.length === 1) return figure(items[0]);
    if (items.length === 2) return pair(items);
    return gallery(items);
  }
  const altOf = it => (it.setting?.decorative ? '' : it.alt || '');
  const np = it => (ctx.preview && !it.visible ? ` <b>${esc(ctx.t.nonPubliee)}</b>` : '');
  const cartel = (it, cls = 'cartel cartel--grand') => {
    const p = it.photo;
    const host = ctx.host ? ` data-adresse="${esc(`${ctx.host}/photo/${p.slug}`)}"` : '';
    const legend = it.legend ? `<span class="cartel-l">${esc(typo(it.legend, ctx.lang))}</span>` : '';
    return `<figcaption class="${cls}"${host}><span class="cartel-t">${esc(p.title)}</span><span class="cartel-m">${esc(typo(ctx.meta(p), ctx.lang))}${np(it)}</span>${legend}</figcaption>`;
  };
  const anchor = it => `<a href="${esc(ctx.photoHref(it.photo, it.n))}">`;
  const seeBig = it => `<span class="sr-only">${esc(ctx.t.seeBig(it.n, total))}</span>`;
  const SIZES = {
    texte: '(min-width: 1280px) calc(50vw - 84px), (min-width: 1024px) calc(50vw - 68px), (min-width: 768px) 640px, calc(100vw - 32px)',
    large: '(min-width: 1280px) calc(83.1vw - 121px), (min-width: 1024px) calc(83.1vw - 95px), (min-width: 768px) calc(100vw - 80px), calc(100vw - 32px)',
    cote: '(min-width: 900px) 400px, calc(100vw - 48px)',
  };
  function figure(it) {
    const f = fmt(it.photo);
    const size = it.setting?.size === 'large' ? 'large' : f.vertical ? 'cote' : 'texte';
    const cls = ['photo', f.cls, size === 'large' ? 'f-large' : size === 'cote' ? 'photo--cote f-cote' : '', ctx.preview && !it.visible ? 'np' : ''].filter(Boolean).join(' ');
    return `<figure class="${cls}" id="photo-${it.n}">${anchor(it)}${ctx.picture(it.photo, { sizes: SIZES[size], alt: altOf(it) })}${seeBig(it)}</a>${cartel(it)}</figure>\n`;
  }
  // Deux photos : deux regards (deux photographes) en diptyque, dans l'ordre des heures, sur toute la largeur ; sinon une
  // paire sans titre commun, à hauteur commune (MQ-12, repères 8 et 11).
  function pair(list) {
    const [a, b] = list;
    const regards = a.photo.author_slug && b.photo.author_slug && a.photo.author_slug !== b.photo.author_slug;
    const sum = fmt(a.photo).r + fmt(b.photo).r;
    const share = (it, width) => `calc((${width}) * ${(fmt(it.photo).r / sum).toFixed(3)})`;
    const one = (it, cls, width) => {
      const f = fmt(it.photo);
      return `<figure class="photo ${f.cls}${ctx.preview && !it.visible ? ' np' : ''}" id="photo-${it.n}">${anchor(it)}${ctx.picture(it.photo, { sizes: `(min-width: 1280px) ${share(it, '83.1vw - 137px')}, (min-width: 1024px) ${share(it, '83.1vw - 111px')}, (min-width: 768px) ${share(it, '100vw - 96px')}, calc(100vw - 48px)`, alt: altOf(it) })}${seeBig(it)}</a>${cartel(it, cls)}</figure>`;
    };
    if (regards) {
      const ordered = a.photo.shown_time && b.photo.shown_time && a.photo.taken_on === b.photo.taken_on && b.photo.shown_time < a.photo.shown_time ? [b, a] : [a, b];
      const head = ctx.t.diptyque(ordered[0].photo, ordered[1].photo);
      return `<figure class="diptyque f-ecran"><figcaption class="diptyque-t"><p class="etiquette">${esc(head.label)}</p><p class="cartel-m">${esc(typo(head.line, ctx.lang))}</p></figcaption><div class="diptyque-paire">${ordered.map(it => one(it, 'cartel')).join('')}</div></figure>\n`;
    }
    return `<div class="paire f-large">${list.map(it => one(it, 'cartel cartel--grand')).join('')}</div>\n`;
  }
  // Galerie : les rangées de la planche, dans la colonne large ; chaque vignette mène à sa photo dans la visionneuse.
  function gallery(list) {
    // sizes : la composition des rangées refaite pour la colonne large du billet (server/v2-vues.js, rowSizes).
    const photos = list.map(it => it.photo);
    const lis = list.map(it => {
      const f = fmt(it.photo);
      const sizes = rowSizes(it.photo, photos, { within: billetLarge });
      return `<li class="${f.cls}${f.r < 1 ? ' v' : f.r === 1 ? ' c' : ''}${ctx.preview && !it.visible ? ' np' : ''}" id="photo-${it.n}"><a class="vignette" href="${esc(ctx.photoHref(it.photo, it.n))}">${ctx.picture(it.photo, { sizes, alt: altOf(it) })}<span class="cartel cartel--ligne"><span class="cartel-t">${esc(it.photo.title)}</span><span class="cartel-m">${esc(typo(ctx.meta(it.photo), ctx.lang))}${np(it)}</span></span>${seeBig(it)}</a></li>`;
    }).join('');
    return `<ul class="rangees galerie f-large" aria-label="${esc(ctx.t.galerie(list.length))}">${lis}</ul>\n`;
  }

  const html = blocks(tokens);
  return { html, headings, photoIds: shown, warnings, neutralized: counts, words };
}

// Tous les jetons, listes et citations comprises (premier passage : l'ordre des photos).
function* walk(list) {
  for (const tk of list || []) {
    yield tk;
    if (tk.type === 'blockquote' || tk.type === 'list_item') yield* walk(tk.tokens);
    if (tk.type === 'list') yield* walk(tk.items);
  }
}

// Réponse (droit de réponse, B82) : du texte en paragraphes, liens compris, par le même rendu (sans photos).
export function renderReply(source, ctx) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n').filter(l => !PHOTO_LINE.test(l)).join('\n');
  return renderBody(lines, { ...ctx, photo: () => null });
}

// Texte du corps sans syntaxe (flux, compte des mots, recherche) : utilisé pour le temps de lecture (200 mots par minute).
export const readingMinutes = words => Math.max(1, Math.round(words / 200));
