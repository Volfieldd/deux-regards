import fs from 'node:fs';
import crypto from 'node:crypto';
import { MODEL } from './series-suggest.js';

// Mots-clés suggérés : l'empreinte CLIP de la photo (déjà calculée pour les propositions de séries,
// photo_embeddings) comparée à celles d'un vocabulaire choisi (server/vocabulaire.json, en français, anglais et
// allemand ; empreintes dans server/vocabulaire-vecteurs.bin, scripts/vocabulaire.mjs). Quelques millisecondes,
// aucun modèle de plus. Le modèle ne fait que choisir dans la liste : il n'invente rien. Jamais ajoutés tout seuls :
// la fiche les propose, l'auteur choisit.
const read = name => fs.readFileSync(new URL(`./${name}`, import.meta.url));
export const VOCABULARY = JSON.parse(read('vocabulaire.json').toString('utf8'));
const DIM = 512;
// Les empreintes ne valent que pour la liste qui les a produites : scripts/vocabulaire.mjs écrit, à côté, l'empreinte
// SHA-256 des textes anglais dans l'ordre (vocabulaire-vecteurs.json). Liste changée sans relancer le script (terme
// ajouté, retiré, déplacé, texte anglais corrigé) : aucune suggestion plutôt que des suggestions fausses.
export const VOCABULARY_SHA256 = crypto.createHash('sha256').update(VOCABULARY.map(v => v.en).join('\n')).digest('hex');
let vectors;
const vecs = () => {
  if (vectors === undefined) {
    const b = read('vocabulaire-vecteurs.bin');
    let meta = {};
    try { meta = JSON.parse(read('vocabulaire-vecteurs.json').toString('utf8')); } catch { /* absent : refusé */ }
    vectors = meta.sha256 === VOCABULARY_SHA256 && b.byteLength === VOCABULARY.length * DIM * 4 ? new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4) : null;
  }
  return vectors;
};
const fromBlob = b => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const key = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
// Un mot-clé du vocabulaire, quelle que soit sa langue → ses trois formes (pour la recherche du site).
const FORMS = new Map();
for (const v of VOCABULARY) for (const l of ['fr', 'en', 'de']) FORMS.set(key(v[l]), [v.fr, v.en, v.de]);
export const formsOf = word => FORMS.get(key(word)) || null;

// Probabilités sur le vocabulaire (échelle de CLIP : 100), du plus probable au moins probable.
export function rank(embedding) {
  const V = vecs(), n = VOCABULARY.length;
  if (!V) return [];
  const s = new Float64Array(n);
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let k = 0; k < DIM; k++) d += embedding[k] * V[i * DIM + k];
    s[i] = d * 100;
    if (s[i] > max) max = s[i];
  }
  let z = 0;
  for (let i = 0; i < n; i++) { s[i] = Math.exp(s[i] - max); z += s[i]; }
  return VOCABULARY.map((v, i) => ({ ...v, p: s[i] / z })).sort((a, b) => b.p - a.p);
}

export function createKeywordSuggester({ db, log }) {
  const q = db.prepare('SELECT vec FROM photo_embeddings WHERE photo_id = ? AND model = ? AND vec IS NOT NULL');
  if (!vecs()) log?.warn('mots-clés : empreintes du vocabulaire périmées (relancer scripts/vocabulaire.mjs) : aucune suggestion');
  return {
    // Suggestions d'une photo dans la langue voulue ; null : pas encore d'empreinte (propositions de séries éteintes,
    // ou photo pas encore analysée). Les mots déjà présents dans ses mots-clés sont écartés.
    forPhoto(photo, { lang = 'fr', max = 6, min = 0.03, have = '' } = {}) {
      const row = photo && q.get(photo.id, MODEL.id);
      if (!row) return null;
      const present = new Set(String(have).split(',').map(key).filter(Boolean));
      const l = ['fr', 'en', 'de'].includes(lang) ? lang : 'fr';
      const out = [];
      for (const v of rank(fromBlob(row.vec))) {
        if (out.length >= max || (out.length && v.p < min)) break;
        if ([v.fr, v.en, v.de].some(w => present.has(key(w)))) continue;
        out.push({ word: v[l], p: v.p });
      }
      return out;
    },
  };
}
