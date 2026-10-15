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
  t.lang = l;
  t.locale = LOCALES[l];
  return t;
}
