// Espaces insécables d'une page HTML déjà composée (lexique des maquettes, § 2 ; règles de insecables.py, l'outil des
// maquettes) : appliqué aux pages des galeries privées (site public et administration), dont les textes viennent de
// traductions, de dates et de nombres assemblés au rendu. Seul le texte entre les balises est touché, jamais une balise,
// un attribut, ni le contenu de <script>, <style>, <pre>, <code>, <textarea>.
//   - toutes les langues : insécable avant « · » ; dans les nombres à milliers suivis d'une unité (« 2 048 px ») ;
//   - français seulement (lang) : fine insécable avant « : ; ! ? » et dans les guillemets « » ; insécable dans les heures
//     (« 22 h 48 »), dans une date abrégée (« 30 nov. 2026 »), avant une unité (« 12 h », « 4 000 px », « 6 mois » non).
const NB = ' ', FN = ' ';
const MOIS = '(?:janv\\.|févr\\.|mars|avr\\.|mai|juin|juil\\.|août|sept\\.|oct\\.|nov\\.|déc\\.|janvier|février|avril|juillet|septembre|octobre|novembre|décembre)';
const SKIP = /^<(script|style|pre|code|textarea)\b/i;

function fixText(s, fr) {
  let t = s.replace(/ ·/g, `${NB}·`).replace(/(\d) (\d{3}) (px|Mo|ko|€)/g, `$1${NB}$2${NB}$3`).replace(/(\d) (px|Mo|ko|€|%)(?![\p{L}])/gu, `$1${NB}$2`);
  if (fr) {
    t = t.replace(/ ([:;!?»])/g, `${FN}$1`).replace(/« /g, `«${FN}`)
      .replace(/(\d) h (\d)/g, `$1${NB}h${NB}$2`).replace(/(\d) h(?![\p{L}\d])/gu, `$1${NB}h`)
      .replace(new RegExp(`(\\d) (${MOIS})`, 'g'), `$1${NB}$2`).replace(new RegExp(`(${MOIS}) (\\d{4})`, 'g'), `$1${NB}$2`);
  }
  return t;
}

// html : la page ; lang : celle de la page (le français reçoit en plus ses espaces fines).
export function insecables(html, lang = 'fr') {
  const parts = String(html).split(/(<[^>]*>)/);
  let skip = null;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith('<')) {
      if (skip && new RegExp(`^</${skip}\\b`, 'i').test(p)) skip = null;
      else if (!skip) { const m = SKIP.exec(p); if (m && !p.endsWith('/>')) skip = m[1]; }
      continue;
    }
    if (!skip && p) parts[i] = fixText(p, lang === 'fr');
  }
  return parts.join('');
}
