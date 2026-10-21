// MV-13 : port de la géométrie de commun_d.py (frise et graphe), sans dépendance, script ou style en ligne.
// Deux dessins, 760 et 1 120 unités ; le CSS choisit celui qui tient. La matrice reprend les cartes de la référence
// en SVG. Les tableaux Eta restent les équivalents complets. Les identifiants et classes sont internes ; tout texte
// est borné puis échappé, même quand l'appelant l'a déjà masqué pour une Lectrice.
import { esc, f } from './flux.js';
import { PHASES } from '../phases.js';

export const COULOIRS = [...PHASES.map(p => p.nom), 'Indices', 'Dissimulation', 'Faits'];
const mot = s => esc(String(s ?? '').slice(0, 500));
const court = (s, n) => String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s);
// Un groupe nommé conserve les liens dans l'arbre d'accessibilité ; role=img les masquerait aux lecteurs d'écran.
const debut = (id, largeur, hauteur, titre, desc) => `<svg class="ds-svg${largeur === 1120 ? ' ds-l' : ''}" viewBox="0 0 ${largeur} ${hauteur}" role="group" aria-labelledby="${id}-t" aria-describedby="${id}-d"><title id="${id}-t">${mot(titre)}</title><desc id="${id}-d">${mot(desc)}</desc>`;
export const deuxDessins = (rendu, donnees) => ({ std: rendu(donnees, 760), large: rendu(donnees, 1120) });

// Un groupe reste homogène : même couloir, nature et gravité. Les voisins à moins de 14 unités deviennent une barre.
export function groupesFrise(points, x) {
  const groupes = [];
  for (const p of [...points].sort((a, b) => a.c - b.c || a.t - b.t || a.id - b.id)) {
    const g = groupes.at(-1), px = x(p.t);
    if (g && g.c === p.c && g.forme === p.forme && g.grav === p.grav && px - g.x2 < 14) {
      g.x2 = px; g.n++; if (g.lib.length < 4) g.lib.push(p.lib);
    } else groupes.push({ ...p, x1: px, x2: px, n: 1, lib: [p.lib] });
  }
  return groupes;
}
export function frise(v, largeur = 760) {
  const id = `fr-${largeur}`, x0 = (largeur === 1120 ? 150 : 128) + 18, x1 = largeur - 46;
  const X = t => x0 + Math.max(0, Math.min(1, (t - v.t0) / Math.max(1, v.t1 - v.t0))) * (x1 - x0);
  const Y = c => 10 + 34 * (c - 1) + 17;
  const o = [debut(id, largeur, 424, 'Frise du dossier', 'Huit phases, indices, dissimulation et faits. Les formes disent la nature ; les libellés et le tableau donnent les détails.')];
  COULOIRS.forEach((nom, i) => {
    o.push(`<rect class="ds-c-fond${i % 2 ? ' alt' : ''}" x="0" y="${10 + 34 * i}" width="${largeur}" height="34"/><text class="ds-c-t" x="10" y="${Y(i + 1) + 5}">${i < 8 ? i + 1 + ' ' : ''}${nom}</text>`);
    if (v.non.includes(i + 1) && !v.points.some(p => p.c === i + 1)) o.push(`<text class="ds-non-t" x="${x0 + 6}" y="${Y(i + 1) + 5}">non observé</text>`);
  });
  for (const [i, t] of v.ticks.entries()) o.push(`<line class="ds-axe" x1="${f(X(t.t))}" x2="${f(X(t.t))}" y1="10" y2="390"/><text class="ds-graduation" x="${f(X(t.t))}" y="410" text-anchor="${i === 0 ? 'start' : i === v.ticks.length - 1 ? 'end' : 'middle'}">${mot(t.mot)}</text>`);
  const premiers = v.suite.map(c => v.points.find(p => p.c === c && ['jalon', 'preuve', 'promu'].includes(p.forme))).filter(Boolean);
  if (premiers.length > 1) o.push(`<polyline class="ds-chaine" points="${premiers.map(p => `${f(X(p.t))},${Y(p.c)}`).join(' ')}"/>`);
  for (const g of groupesFrise(v.points, X)) {
    const x = g.x1, y = Y(g.c), forme = ['preuve', 'indice', 'fait', 'promu', 'marqueur'].includes(g.forme) ? g.forme : 'jalon';
    const grav = ['critique', 'haut', 'moyen', 'bas'].includes(g.grav) ? g.grav : 'info';
    o.push(`<a href="${mot(g.href)}" class="ds-point ds-g-${grav}"><title>${mot(g.lib.join(' ; '))}${g.n > 1 ? ` · ${g.n} signaux` : ''}</title>`);
    if (g.n > 1) o.push(`<rect class="ds-m-${forme}" x="${f(x - 4)}" y="${y - 5}" width="${f(Math.max(g.x2 - x, 8) + 8)}" height="10" rx="5"/><text class="ds-m-nb" x="${f(g.x2 + 10)}" y="${y + 5}">${g.n}</text>`);
    else if (forme === 'preuve') o.push(`<path class="ds-m-preuve" d="M${f(x)} ${y - 8}l8 8-8 8-8-8z"/>`);
    else if (forme === 'indice' || forme === 'fait') o.push(`<circle class="ds-m-${forme}" cx="${f(x)}" cy="${y}" r="${forme === 'fait' ? 4 : 6}"/>`);
    else if (forme === 'marqueur') o.push(`<path class="ds-m-marqueur" d="M${f(x)} ${y - 8}l8 14h-16z"/>`);
    else o.push(`<rect class="ds-m-${forme}" x="${f(x - 6)}" y="${y - 6}" width="12" height="12" rx="1"/>`);
    o.push('</a>');
  }
  return o.join('') + '</svg>';
}

export function graphe(v, largeur = 760) {
  const nw = largeur === 1120 ? 300 : 220, cols = [20, (largeur - nw) / 2, largeur - 20 - nw];
  const listes = [0, 1, 2].map(c => v.noeuds.filter(n => n.col === c)), rows = Math.max(1, ...listes.map(l => l.length));
  const pos = new Map();
  listes.forEach((lst, c) => lst.forEach((n, i) => pos.set(n.id, { x: cols[c], y: 44 + (rows - lst.length) * 32 + i * 64 })));
  const o = [debut(`gr-${largeur}`, largeur, 54 + rows * 64, 'Graphe des entités', 'Acteurs à gauche, comptes et sessions au centre, cibles à droite. Les traits suivent seulement les entrées par une entité documentées ; leur absence ne prouve pas une absence de lien.')];
  ['ACTEURS', 'COMPTE ET SESSION', 'CIBLES'].forEach((t, c) => o.push(`<text class="ds-col" x="${cols[c]}" y="20">${t}</text>`));
  for (const l of v.liens) {
    const a = pos.get(l.de), b = pos.get(l.a); if (!a || !b) continue;
    const force = ['fort', 'moyen', 'faible', 'manuel'].includes(l.force) ? l.force : 'moyen';
    let chemin;
    if (a.x === b.x) { const [haut, bas] = [a, b].sort((p, q) => p.y - q.y); chemin = `M${f(a.x + nw / 2)} ${haut.y + 50}V${bas.y}`; }
    else { const [g, d] = [a, b].sort((p, q) => p.x - q.x), mx = (g.x + nw + d.x) / 2; chemin = `M${f(g.x + nw)} ${g.y + 25}C${f(mx)} ${g.y + 25} ${f(mx)} ${d.y + 25} ${f(d.x)} ${d.y + 25}`; }
    o.push(`<path class="ds-e ${force}" d="${chemin}"/>`);
  }
  for (const n of v.noeuds) {
    const { x, y } = pos.get(n.id), cap = largeur === 1120 ? 31 : 22;
    o.push(`<a href="${mot(n.href)}"><title>${mot(n.type)} · ${mot(n.texte)} · ${mot(n.force)}</title><rect class="ds-n${n.graine ? ' graine' : ''}${n.voisin ? ' voisin' : n.col === 2 ? ' cible' : ''}" x="${f(x)}" y="${y}" width="${nw}" height="50" rx="8"/><text class="ds-n-k" x="${f(x + 12)}" y="${y + 19}">${mot(court(n.type + (n.graine ? ' · graine' : ''), cap))}</text><text class="ds-n-mono" x="${f(x + 12)}" y="${y + 39}">${mot(court(n.texte, cap))}</text></a>`);
  }
  return o.join('') + '</svg>';
}

// Cartes de tactiques rangées comme MV-13, trois ou cinq par ligne. Le texte revient à la ligne : aucune technique
// n'est découpée dans le dessin. Le tableau donne aussi le nom anglais, les comptes et les phases.
function lignes(texte, cap) {
  const mots = String(texte).split(/\s+/), out = [''];
  for (const m of mots) { if ((out.at(-1) + ' ' + m).trim().length > cap && out.at(-1)) out.push(''); out[out.length - 1] = (out.at(-1) + ' ' + m).trim(); }
  return out;
}
export function matrice(v, largeur = 760) {
  const cols = largeur === 1120 ? 5 : 3, gap = 12, w = (largeur - (cols - 1) * gap) / cols, cap = Math.floor((w - 24) / 8);
  const cartes = v.map(t => {
    const ls = [...lignes(t.nom_fr, cap).map(mot => ({ mot, cls: 'ds-n-t' })), { mot: t.id, cls: 'ds-n-k' }];
    if (t.hors) ls.push(...lignes('Non observable ici', cap).map(mot => ({ mot, cls: 'ds-n-k' })));
    else if (!t.items.length && !t.sans) ls.push({ mot: 'Aucun signal', cls: 'ds-n-k' });
    for (const z of t.items) {
      ls.push({ mot: `${z.ordre}. ${z.id} · ${z.n} signal${z.n > 1 ? 's' : ''}`, cls: 'ds-n-t', href: z.href });
      ls.push(...lignes(z.nom, cap).map(mot => ({ mot, cls: 'ds-n-t', href: z.href })));
      ls.push(...lignes(z.phase, cap).map(mot => ({ mot, cls: 'ds-n-k' })));
    }
    if (t.sans) ls.push(...lignes(`${t.sans} signal${t.sans > 1 ? 's' : ''} sans technique`, cap).map(mot => ({ mot, cls: 'ds-n-k' })));
    return { ...t, ls, h: 24 + ls.length * 20 };
  });
  let hauteur = 0;
  const o = [];
  for (let i = 0; i < cartes.length; i += cols) {
    const rang = cartes.slice(i, i + cols), h = Math.max(...rang.map(t => t.h));
    rang.forEach((t, c) => {
      const x = c * (w + gap);
      o.push(`<rect class="ds-n${t.hors ? ' cible' : ''}" x="${f(x + 1)}" y="${hauteur + 1}" width="${f(w - 2)}" height="${h - 2}" rx="8"/>`);
      t.ls.forEach((l, j) => { const text = `<text class="${l.cls}" x="${f(x + 12)}" y="${hauteur + 24 + j * 20}">${mot(l.mot)}</text>`; o.push(l.href ? `<a href="${mot(l.href)}">${text}</a>` : text); });
    });
    hauteur += h + gap;
  }
  return debut(`ak-${largeur}`, largeur, hauteur, 'Matrice ATT&CK du dossier', 'Quinze tactiques dans l’ordre de MITRE ; ordre de première apparition, nombre de signaux et projection des techniques vers les phases. Le tableau donne le même contenu.') + o.join('') + '</svg>';
}
