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
  // sont à leur tour traduits (voir part), sur trois niveaux au plus. Inconnu : laissé en français. Les clés au texte fixe trop court (« J{n} »,
  // « à {h} », « {date} à {time} ») reconnaîtraient n'importe quoi : elles ne servent qu'aux morceaux de date et d'heure.
  const msg = (text, depth = 0, short = false) => {
    if (l === 'fr' || typeof text !== 'string' || !text) return text;
    if (d[text]?.[l]) return d[text][l];
    for (const p of patterns()) {
      if (p.letters < SHORT_LETTERS && !short) continue;
      const m = p.re.exec(text);
      if (!m) continue;
      return t(p.key, Object.fromEntries(p.names.map((n, i) => [n, part(n, m[i + 1], depth)])));
    }
    return text;
  };
  // Morceau variable d'un message reconnu : un nom, un titre, une référence ou un texte saisi reste tel quel (« Jolie
  // mais floue », « J-0042 », « Julien »), sauf s'il est lui-même un texte de l'admin (« Précis ») ; une liste de
  // raisons (« ; ») est traduite raison par raison.
  const part = (name, value, depth) => {
    if (depth >= 3) return value;
    if (VERBATIM.has(name)) return d[value]?.[l] ?? value;
    if (name === 'reasons') return value.split(' ; ').map(x => msg(x, depth + 1)).join(' ; ');
    return msg(value, depth + 1, MOMENTS.has(name));
  };
  t.msg = msg;
  t.lang = l;
  t.locale = LOCALES[l];
  return t;
}

// Variables que msg ne reconnaît jamais d'après une clé à variables : noms, titres, références, adresses, textes saisis.
const VERBATIM = new Set(['name', 'names', 'title', 'titles', 'author', 'account', 'ref', 'remark', 'message', 'place', 'email', 'url', 'username', 'label', 'target', 'letter', 'prefix', 'card', 'code', 'id', 'signature', 'guardian']);
// Morceaux de date et d'heure (« à 14 h 30 », « le 12 oct. à 9 h ») : seuls à pouvoir passer par les clés courtes.
const MOMENTS = new Set(['when', 'until', 'h', 'd', 'date', 'time', 'due', 'day']);
// En deçà de 4 lettres fixes, une clé est trop vague pour reconnaître un message entier.
const SHORT_LETTERS = 4;

// Clés à variables (avec au moins une lettre hors variables), de la plus précise (le plus de texte fixe) à la plus large.
let compiled = null;
function patterns() {
  if (!compiled) {
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    compiled = Object.keys(dictionary()).filter(k => /\{\w+\}/.test(k) && /\p{L}/u.test(k.replace(/\{\w+\}/g, ''))).map(key => {
      const names = [...key.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      const fixed = key.replace(/\{\w+\}/g, '');
      return { key, names, fixed: fixed.length, letters: fixed.replace(/[^\p{L}]/gu, '').length, re: new RegExp(`^${key.split(/\{\w+\}/).map(esc).join('(.+?)')}$`, 's') };
    }).sort((a, b) => b.fixed - a.fixed);
  }
  return compiled;
}
