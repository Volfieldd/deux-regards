// Espaces insécables de la typographie française dans une page HTML de l'admin v2 (lexique des maquettes, § 2) : un « : »
// ou un « ? » jamais seul en début de ligne, « 22 h 40 », « 1 600 px » et « 19 oct. 2026 » jamais coupés. Les textes de
// l'admin (et ceux de la v1, repris tels quels) sont écrits avec des espaces ordinaires : la page est corrigée à l'envoi,
// comme le fait l'outil des maquettes (insecables.py), dont ce sont les règles.
// Jamais touchés : <style>, <script> (le bloc des textes du script compris), <code>, <pre>, <kbd>, <textarea>, <output> (le
// lien et le mot de passe d'un accès privé, montrés une fois, tels qu'ils ont été tirés), les valeurs
// des champs et les adresses ; le texte d'une autre langue (élément ou ancêtre lang="en", lang="de").
const NNBSP = ' ', NBSP = ' ';
const MOIS = '(?:janv\\.|févr\\.|mars|avr\\.|mai|juin|juil\\.|août|sept\\.|oct\\.|nov\\.|déc\\.)';
const JOURS = '(?:lun|mar|mer|jeu|ven|sam|dim)\\.';
const UNITES = '(?:€|px|ko|Mo|Go|km|m|cm|mm|min|s|%|h)';
const RULES = [
  [/(?<=\S)[  ]([;:!?])(?=[\s<»"’)]|$)/g, `${NNBSP}$1`],
  [/«[  ]/g, `«${NNBSP}`],
  [/[  ]»/g, `${NNBSP}»`],
  [/(?<=\S) ·(?= )/g, `${NBSP}·`],
  [/\b(\d{1,2}) h (\d\d)\b/g, `$1${NBSP}h${NBSP}$2`],
  [/\b(\d{1,2}) h\b/g, `$1${NBSP}h`],
  [new RegExp(`(\\d) (${UNITES})(?=[\\s<.,;:)·]|$)`, 'g'), `$1${NBSP}$2`],
  [new RegExp(`\\b(${JOURS}) (?=\\d{1,2}\\b)`, 'g'), `$1${NBSP}`],
  [new RegExp(`\\b(\\d{1,2}) (${MOIS})( (\\d{4}))?`, 'g'), (m, d, mo, _y, y) => `${d}${NBSP}${mo}${y ? NBSP + y : ''}`],
  // Milliers (« 1 280 », « 15 000 ») ; pas une année ni un numéro collé (2026, R0004012, +33 1 99 00 12 34).
  [/(?<![\d,.])(?<!\d )(?<!\d )(?<!\d )(\d{1,3})((?:[  ]\d{3})+)(?!\d)/g, (m, a, b) => a + b.replace(/ /g, NBSP)],
];
const SKIP = new Set(['style', 'script', 'code', 'pre', 'kbd', 'textarea', 'output']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TAG = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
const ATTRS = /(\s(?:alt|title|aria-label|placeholder|content)=")([^"]*)(")/g;
const LANG = /\slang="([^"]+)"/;

function fix(text, before = '') {
  let t = before + text;
  for (const [rx, rp] of RULES) t = t.replace(rx, rp);
  return t.slice(before.length);
}

export function typoHtml(html) {
  const out = [];
  const stack = [];                  // { name, skip, lang }
  let last = '', pos = 0;
  const docLang = /<html[^>]*\slang="([^"]+)"/.exec(html)?.[1] || 'fr';
  for (const m of html.matchAll(TAG)) {
    let text = html.slice(pos, m.index);
    const skip = stack.some(s => s.skip);
    const lang = [...stack].reverse().find(s => s.lang)?.lang || docLang;
    if (text && !skip && lang.startsWith('fr')) text = fix(text, /^[   €%]/.test(text) ? last : '');
    if (text && !skip) last = text.at(-1); else if (skip) last = '';
    out.push(text);
    const [tag, close, rawName, rest] = m;
    const name = rawName.toLowerCase();
    let piece = tag;
    if (!close) {
      const own = LANG.exec(rest)?.[1] || null;
      if ((own || lang).startsWith('fr') && !skip) piece = tag.replace(ATTRS, (a, p1, v, p3) => p1 + fix(v) + p3);
      if (!VOID.has(name) && !rest.trimEnd().endsWith('/')) stack.push({ name, skip: SKIP.has(name), lang: own });
    } else {
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === name) { stack.length = i; break; }
    }
    out.push(piece);
    pos = m.index + tag.length;
  }
  out.push(html.slice(pos));
  return out.join('');
}
