import { LANGS, UI, pick } from './i18n.js';

// Un choix lisible dans l’admin pilote les directives et les métadonnées calculées sur les pages publiques.
export const SEO_LIMITS = Object.freeze({ title: 100, description: 320 });
export const SEO_KEYS = Object.freeze(['seo_visibility', 'seo_images', ...['title', 'description'].flatMap(field => LANGS.map(lang => `seo_${field}${lang === 'fr' ? '' : `_${lang}`}`))]);
const fieldKey = (field, lang) => `seo_${field}${lang === 'fr' ? '' : `_${lang}`}`;
const text = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

export class SeoError extends Error {
  constructor(errors) {
    super('Les réglages de référencement comportent une erreur.');
    this.errors = errors;
  }
}

export function seoSettings(raw = {}) {
  raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    visibility: raw.seo_visibility === 'off' ? 'off' : 'public',
    images: raw.seo_images !== false,
    ...Object.fromEntries(['title', 'description'].map(field => [field, Object.fromEntries(LANGS.map(lang => [lang, text(raw[fieldKey(field, lang)]).slice(0, SEO_LIMITS[field])]))])),
  };
}

export function validateSeo(body) {
  const errors = {}, values = {};
  for (const key of SEO_KEYS) {
    const value = body && Object.hasOwn(body, key) ? body[key] : undefined;
    if (typeof value !== 'string') { errors[key] = 'Choisissez une valeur ou renseignez ce champ.'; continue; }
    if (key === 'seo_visibility') {
      if (!['public', 'off'].includes(value)) errors[key] = 'Choisissez la visibilité du site.';
      else values[key] = value;
    } else if (key === 'seo_images') {
      if (!['oui', 'non'].includes(value)) errors[key] = 'Choisissez si les photographies peuvent être référencées.';
      else values[key] = value === 'oui';
    } else {
      const field = key.startsWith('seo_title') ? 'title' : 'description';
      if (value.length > SEO_LIMITS[field]) errors[key] = `Ce texte est limité à ${SEO_LIMITS[field]} caractères.`;
      else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)) errors[key] = 'Retirez les caractères invisibles de ce texte.';
      else values[key] = text(value);
    }
  }
  if (Object.keys(errors).length) throw new SeoError(errors);
  return values;
}

export function homepageSeo(raw, siteName, lang = 'fr', authors = []) {
  const settings = seoSettings(raw);
  const columns = field => Object.fromEntries(LANGS.map(l => [fieldKey(field, l), settings[field][l]]));
  const names = authors.map(a => typeof a === 'string' ? a : a.name).filter(Boolean);
  const t = UI[lang] || UI.fr;
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')}${t.v2.and}${names.at(-1)}` : names[0];
  return { title: pick(columns('title'), 'seo_title', lang) || (joined ? t.v2.titleHome(siteName, joined) : siteName),
    description: pick(columns('description'), 'seo_description', lang) || pick(raw, 'tagline', lang) };
}

// Un « noindex » posé par une route sensible reste prioritaire ; le réglage ne peut qu’ajouter des restrictions.
export function seoRobots(existing, settings) {
  const directives = String(existing || '').split(',').map(s => s.trim()).filter(Boolean);
  if (settings.visibility === 'off') directives.push('noindex');
  if (!settings.images) directives.push('noimageindex');
  return [...new Set(directives)].join(', ');
}

// Bloc JSON-LD de données : aucun texte ne peut fermer le script ni devenir du HTML (même règle que les Carnets).
export const seoJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
