// Lettres sans forme décomposée (NFD ne les touche pas) : repliées à la main, pour les adresses comme pour la recherche
// (« Straße » → « strasse », « cœur » → « coeur »). En minuscules : appliqué après toLowerCase.
const LIGATURES = { 'ß': 'ss', 'œ': 'oe', 'æ': 'ae', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'þ': 'th', 'ð': 'd', 'ı': 'i' };
export const foldLetters = s => s.replace(/[ßœæøłđþðı]/g, c => LIGATURES[c]);

export function slugify(text) {
  return foldLetters(text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase())
    .replace(/[’'`]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
