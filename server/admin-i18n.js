import fs from 'node:fs';

// Traductions de l'administration (français, anglais, allemand). Le texte français est la clé : t('Photothèque')
// renvoie « Photo library » ou « Fotothek ». Les dictionnaires sont dans server/admin-i18n/*.json, un fichier par
// groupe d'écrans : { "texte français": { "en": "…", "de": "…" } }. Une clé absente s'affiche en français.
// Variables : t('« {title} » publiée.', { title }) ; seules les variables passées sont remplacées.
export const ADMIN_LANGS = ['fr', 'en', 'de'];
export const ADMIN_LANG_NAMES = { fr: 'Français', en: 'English', de: 'Deutsch' };
export const LOCALES = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' };
const DIR = new URL('./admin-i18n/', import.meta.url);

let dict = null;
export function dictionary() {
  if (!dict) {
    dict = {};
    for (const f of fs.readdirSync(DIR).filter(n => n.endsWith('.json')).sort()) Object.assign(dict, JSON.parse(fs.readFileSync(new URL(f, DIR), 'utf8')));
  }
  return dict;
}

export function translator(lang = 'fr') {
  const l = ADMIN_LANGS.includes(lang) ? lang : 'fr';
  const d = dictionary();
  const t = (key, params) => {
    let s = l === 'fr' ? key : (d[key]?.[l] ?? key);
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(params, k) ? String(params[k]) : m));
    return s;
  };
  // Message déjà composé en français (erreur levée par un module, ou enregistrée dans la base) : traduit tel quel s'il
  // est une clé, sinon reconnu d'après une clé à variables (« la TSA a répondu {status} »), dont les morceaux variables
  // sont à leur tour traduits. Inconnu : laissé en français.
  const msg = (text, depth = 0) => {
    if (l === 'fr' || typeof text !== 'string' || !text) return text;
    if (d[text]?.[l]) return d[text][l];
    for (const p of patterns()) {
      const m = p.re.exec(text);
      if (!m) continue;
      return t(p.key, Object.fromEntries(p.names.map((n, i) => [n, depth < 2 ? msg(m[i + 1], depth + 1) : m[i + 1]])));
    }
    return text;
  };
  t.msg = msg;
  t.lang = l;
  t.locale = LOCALES[l];
  return t;
}

// Clés à variables (avec au moins une lettre hors variables), de la plus précise (le plus de texte fixe) à la plus large.
let compiled = null;
function patterns() {
  if (!compiled) {
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    compiled = Object.keys(dictionary()).filter(k => /\{\w+\}/.test(k) && /\p{L}/u.test(k.replace(/\{\w+\}/g, ''))).map(key => {
      const names = [...key.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      return { key, names, fixed: key.replace(/\{\w+\}/g, '').length, re: new RegExp(`^${key.split(/\{\w+\}/).map(esc).join('(.+?)')}$`, 's') };
    }).sort((a, b) => b.fixed - a.fixed);
  }
  return compiled;
}
