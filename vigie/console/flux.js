// Diagrammes des flux de la Vigie (MV-11, lexique § 3.17 à 3.19) : mise en page d'un diagramme de Sankey et son SVG, rendus
// par le serveur, sans dépendance et sans accès à la base. Port de la référence dr-tmp/vigie-mq/flux.py (mêmes fonctions, mêmes
// étapes, mêmes arrondis) et des deux dessins de flux_donnees.py, rendus génériques (les données viennent de la base :
// vigie/console/ecrans/sante-flux.js, lireFlux).
//
// Tout est déterministe : mêmes données, même SVG, octet pour octet. Aucun script, aucun style en ligne : couleurs et
// opacités sont des classes de vigie.css (§ 24) ; les hachures, des <pattern> référencés par l'attribut de présentation
// « fill ». Tout texte venu des données est échappé.
//
// Étapes :
//   1. graphe(chemins, colonnes, groupe) : des chemins (une valeur par colonne et un poids n) aux nœuds par colonne et aux
//      liens entre colonnes voisines, regroupés par groupe (teinte, issue, mise en avant) ;
//   2. colonnes(...) : la position de chaque colonne et la gouttière des libellés ; un libellé n'est jamais posé sur une bande ;
//   3. miseEnPage(...) : l'échelle (la même partout), l'ordre des nœuds, leurs positions, la place de chaque lien dans ses
//      nœuds (triés par la position de l'autre bout : aucun croisement au pied d'un nœud) ;
//   4. svg(...) : rubans en courbes de Bézier cubiques, nœuds, libellés et nombres dans les gouttières.

const FINE = '\u202f';      // espace fine insécable (avant « : »)
const NBSP = '\u00a0';      // espace insécable (milliers, « 14 h 02 »)

// Échappement de tout texte écrit dans le SVG (comme html.escape de Python : & < > " ').
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c]));

// 1 913 → « 1 913 » (espace insécable entre les milliers).
export const nombre = n => String(Math.trunc(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

// Somme de flottants comme sum() de Python (3.12 et après : sommation compensée de Neumaier) : la référence flux.py en
// dépend pour ses arrondis au dixième ; une addition simple s'en écarte d'un ulp, assez pour changer un « .x5 ».
export function somme(xs) {
  let s = 0, c = 0;
  for (const x of xs) {
    const t = s + x;
    c += Math.abs(s) >= Math.abs(x) ? (s - t) + x : (x - t) + s;
    s = t;
  }
  return c && Number.isFinite(c) ? s + c : s;
}

// ---------- 1. Graphe ----------
// chemins : objets avec une clé par colonne (l'identifiant du nœud) et n (le poids). Rend { noeuds, liens } : noeuds[c] =
// identifiants de la colonne c, dans l'ordre d'apparition ; liens = { de, a, col, n, groupe, chemins }.
export function graphe(chemins, cols, groupe = () => '') {
  const noeuds = cols.map(() => []);
  const agreg = new Map();
  for (const ch of chemins) {
    cols.forEach((k, c) => { if (!noeuds[c].includes(ch[k])) noeuds[c].push(ch[k]); });
    for (let c = 0; c < cols.length - 1; c++) {
      const g = groupe(ch, c);
      const cle = JSON.stringify([c, ch[cols[c]], ch[cols[c + 1]], g]);
      let l = agreg.get(cle);
      if (!l) { l = { col: c, de: ch[cols[c]], a: ch[cols[c + 1]], groupe: g, n: 0, chemins: [] }; agreg.set(cle, l); }
      l.n += ch.n;
      l.chemins.push(ch);
    }
  }
  return { noeuds, liens: [...agreg.values()] };
}

// ---------- 2. Colonnes et gouttières ----------
// Largeur estimée d'un libellé en Jost : 0,53 em par lettre, 0,56 em par chiffre (tabulaires), 0,28 em par espace. Sert à
// placer ; l'essai flux-lisible mesure le rendu réel.
export function largeurTexte(t, taille) {
  return somme([...String(t)].map(ch => taille * (/\d/.test(ch) ? 0.56 : ch === ' ' || ch === NBSP || ch === FINE ? 0.28 : 0.53)));
}

// largLibs[c] : la largeur du plus long libellé de la colonne c. Colonnes du milieu : libellés au-dessus du nœud (dessus,
// § 3.19, point 1), sans gouttière. Rend { x, gouttieres }.
export function colonnes(largLibs, largeur, epaisseur, { bandeMin = 56, marge = 4, dessus = true } = {}) {
  const n = largLibs.length;
  const goutt = [0, ...largLibs.slice(1, -1).map(w => (dessus ? 0 : w + 18)), 0];
  const fixe = marge + largLibs[0] + 10 + n * epaisseur + somme(goutt) + 10 + largLibs[n - 1] + marge;
  const bande = Math.max(bandeMin, (largeur - fixe) / (n - 1));
  const x = [];
  let pos = marge + largLibs[0] + 10;
  for (let c = 0; c < n; c++) { x.push(pos); pos += epaisseur + goutt[c] + bande; }
  return { x, gouttieres: goutt };
}

// ---------- 3. Mise en page ----------
// Croisements pondérés entre colonnes voisines.
export function croisements(ordre, liens) {
  const pos = new Map();
  ordre.forEach((col, c) => col.forEach((k, i) => pos.set(`${c}|${k}`, i)));
  const parCol = new Map();
  for (const l of liens) { if (!parCol.has(l.col)) parCol.set(l.col, []); parCol.get(l.col).push(l); }
  let total = 0;
  for (const [c, ls] of parCol) {
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i], b = ls[j];
      if ((pos.get(`${c}|${a.de}`) - pos.get(`${c}|${b.de}`)) * (pos.get(`${c + 1}|${a.a}`) - pos.get(`${c + 1}|${b.a}`)) < 0) total += a.n * b.n;
    }
  }
  return total;
}

// Tri des nœuds des colonnes libres par barycentre des voisins ; ceux de bas restent sous les autres ; fixes gardent l'ordre.
export function barycentres(ordre0, liens, bas, { passes = 4, fixes = new Set() } = {}) {
  const ordre = ordre0.map(c => [...c]);
  for (let p = 0; p < passes; p++) {
    const sens = [];
    if (p % 2 === 0) for (let c = 1; c < ordre.length; c++) sens.push(c);
    else for (let c = ordre.length - 2; c >= 0; c--) sens.push(c);
    for (const c of sens) {
      if (fixes.has(c)) continue;
      const voisin = p % 2 === 0 ? c - 1 : c + 1;
      const pos = new Map(ordre[voisin].map((k, i) => [k, i]));
      const avant = ordre[c];
      const bary = k => {
        let s = 0, w = 0;
        for (const l of liens) {
          if (p % 2 === 0 && l.col === voisin && l.a === k) { s += pos.get(l.de) * l.n; w += l.n; }
          if (p % 2 === 1 && l.col === c && l.de === k) { s += pos.get(l.a) * l.n; w += l.n; }
        }
        return w ? s / w : avant.indexOf(k);
      };
      const cle = k => [bary(k), avant.indexOf(k)];
      const tri = arr => arr.map(k => ({ k, c: cle(k) })).sort((a, b) => a.c[0] - b.c[0] || a.c[1] - b.c[1]).map(x => x.k);
      ordre[c] = [...tri(avant.filter(k => !bas.has(k))), ...avant.filter(k => bas.has(k))];
    }
  }
  return ordre;
}

const cmpTuple = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };

// x, gouttieres : sortie de colonnes(). travers : la hauteur offerte ; l'échelle k (unités par unité de poids) est la plus
// grande qui fait tenir chaque colonne, plafonnée à kMax. Un lien garde minLien unités au moins ; un nœud hMin. hLib(id) : la
// hauteur de son libellé. Colonnes de dessus : libellé au-dessus du nœud, hDessus unités gardées au-dessus.
export function miseEnPage(noeuds, liens, x, gouttieres, travers, {
  ecart = 22, ecartBas = 36, epaisseur = 8, minLien = 3, kMax = 1, bas = [], hautMarge = 0, fixes = [], ordreMetier = null, hMin = 0,
  hLib = null, dessus = [], hDessus = 24, decal = null, wLib = null,
} = {}) {
  const basS = new Set(bas), dessusS = new Set(dessus);
  const val = new Map();
  noeuds.forEach((col, c) => {
    for (const k of col) {
      const e = somme(liens.filter(l => l.col === c - 1 && l.a === k).map(l => l.n));
      const s = somme(liens.filter(l => l.col === c && l.de === k).map(l => l.n));
      val.set(`${c}|${k}`, Math.max(e, s));
    }
  });
  let k = kMax;
  noeuds.forEach((col, c) => {
    const nBas = col.filter(z => basS.has(z)).length;
    const sep = nBas && nBas < col.length;
    const gaps = (col.length - 1 - (sep ? 1 : 0)) * ecart + (sep ? ecartBas : 0);
    const tot = somme(col.map(z => val.get(`${c}|${z}`)));
    if (tot) k = Math.min(k, (travers - gaps) / tot);
  });
  for (const l of liens) l.w = Math.max(l.n * k, minLien);
  const ep = new Map();
  noeuds.forEach((col, c) => {
    for (const z of col) {
      const e = somme(liens.filter(l => l.col === c - 1 && l.a === z).map(l => l.w));
      const s = somme(liens.filter(l => l.col === c && l.de === z).map(l => l.w));
      ep.set(`${c}|${z}`, Math.max(e, s, minLien, hMin));
    }
  });
  let nds = noeuds;
  if (ordreMetier) nds = noeuds.map((col, c) => [...ordreMetier[c].filter(z => col.includes(z)), ...col.filter(z => !ordreMetier[c].includes(z))]);
  const ordre0 = nds.map(col => [...col.filter(z => !basS.has(z)), ...col.filter(z => basS.has(z))]);
  const ordre1 = barycentres(ordre0, liens, basS, { fixes: new Set(fixes) });
  const c0 = croisements(ordre0, liens), c1 = croisements(ordre1, liens);
  const ordre = c1 < c0 ? ordre1 : ordre0;
  const N = new Map();
  ordre.forEach((col, c) => {
    let t = hautMarge;
    // Libellés « dessus » de la colonne précédente qui débordent sur celle-ci (wLib) : leurs lignes sont à éviter.
    const longs = c && dessusS.has(c) && dessusS.has(c - 1) && wLib
      ? ordre[c - 1].filter(z => wLib(z) > x[c] - x[c - 1] - 8).map(z => [N.get(z).t0 - hDessus - 2, N.get(z).t0 + 2]).sort(cmpTuple) : [];
    col.forEach((z, i) => {
      const e = ep.get(`${c}|${z}`);
      if (i && basS.has(z) && !basS.has(col[i - 1])) t += ecartBas - ecart;
      if (dessusS.has(c)) {
        t = Math.max(t, i ? N.get(col[i - 1]).t1 + hDessus + 6 : hautMarge + hDessus + (decal ? decal[c] : 0));
        for (const [a, b] of longs) if (t - hDessus - 2 < b && t + 2 > a) t = b + hDessus + 4;
      } else if (i === 0 && hLib) {
        t = Math.max(t, hautMarge + hLib(z) / 2 - e / 2 + 2);
      } else if (i && hLib) {
        const p = N.get(col[i - 1]);
        t = Math.max(t, (p.t0 + p.t1) / 2 + (hLib(col[i - 1]) + hLib(z)) / 2 + 4 - e / 2);
      }
      N.set(z, { col: c, v: val.get(`${c}|${z}`), t0: t, t1: t + e, l0: x[c], l1: x[c] + epaisseur, sortie: x[c] + epaisseur + gouttieres[c] });
      t += e + ecart;
    });
  });
  for (const [z, nd] of N) {
    const sortants = liens.filter(l => l.de === z && l.col === nd.col).sort((a, b) => cmpTuple([N.get(a.a).t0, a.groupe], [N.get(b.a).t0, b.groupe]));
    let t = nd.t0 + (nd.t1 - nd.t0 - somme(sortants.map(l => l.w))) / 2;
    for (const l of sortants) { l.tDe = t; t += l.w; }
    const entrants = liens.filter(l => l.a === z && l.col === nd.col - 1).sort((a, b) => cmpTuple([N.get(a.de).t0, a.groupe], [N.get(b.de).t0, b.groupe]));
    t = nd.t0 + (nd.t1 - nd.t0 - somme(entrants.map(l => l.w))) / 2;
    for (const l of entrants) { l.tA = t; t += l.w; }
  }
  for (const l of liens) { l.lDe = N.get(l.de).sortie; l.lA = N.get(l.a).l0; }
  return { k, noeuds: N, liens, ordre, croisements: Math.min(c0, c1), fin: Math.max(...[...N.values()].map(nd => nd.t1)) };
}

// ---------- 4. SVG ----------
// Un nombre du SVG : au dixième, sans zéro inutile.
// Comme f'{v:.1f}' de Python : arrondi exact de la valeur binaire ; un vrai milieu (x,25 ou x,75, seuls exacts en binaire) va
// au chiffre pair, là où toFixed irait au-dessus.
export function f(v) {
  let s;
  const q = v * 4;
  if (Number.isInteger(q) && q % 2 !== 0) {
    const t = v * 10;
    let n = Math.floor(t);
    if (n % 2 !== 0) n += 1;
    s = (n / 10).toFixed(1);
  } else s = v.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

// Un lien : un ruban plein entre deux courbes de Bézier cubiques, tangentes au flux aux deux bouts.
export function ruban(l) {
  const a = l.lDe, b = l.lA, m = (a + b) / 2;
  const t0 = l.tDe, t1 = l.tA, w = l.w;
  const p = [[a, t0], [m, t0], [m, t1], [b, t1], [b, t1 + w], [m, t1 + w], [m, t0 + w], [a, t0 + w]].map(([x, y]) => [f(x), f(y)]);
  return `M${p[0][0]} ${p[0][1]}C${p[1][0]} ${p[1][1]} ${p[2][0]} ${p[2][1]} ${p[3][0]} ${p[3][1]}`
    + `L${p[4][0]} ${p[4][1]}C${p[5][0]} ${p[5][1]} ${p[6][0]} ${p[6][1]} ${p[7][0]} ${p[7][1]}Z`;
}

// Hachures obliques d'une corrélation, une par teinte.
export function motifs(prefixe, teintes) {
  const out = ['<defs>'];
  for (const t of teintes) {
    out.push(`<pattern id="${prefixe}-h-${t}" class="fx-hach fx-${t}" patternUnits="userSpaceOnUse" width="7" height="7" `
      + 'patternTransform="rotate(45)"><rect class="fx-hach-fond" width="7" height="7"></rect>'
      + '<rect class="fx-hach-trait" width="2.4" height="7"></rect></pattern>');
  }
  out.push('</defs>');
  return out.join('');
}

export const INTERLIGNE = 21;   // la boîte d'une ligne de Jost à 14 unités : deux lignes ne se touchent jamais

// Coupe « nom nombre » en lignes de maxL unités au plus, aux espaces (le nombre reste avec le dernier mot).
export function lignes(nom, nb, maxL, taille = 14) {
  const mots = String(nom).split(' ');
  const out = [];
  let cur = '';
  mots.forEach((m, i) => {
    const essai = `${cur} ${m}`.trim();
    const fin = essai + (i === mots.length - 1 ? ` ${nb}` : '');
    if (cur && largeurTexte(i === mots.length - 1 ? fin : essai, taille) > maxL) { out.push(cur); cur = m; } else cur = essai;
  });
  out.push(cur);
  return out;
}

export function largeurLibelle(nom, nb, maxL, taille = 14) {
  const ls = lignes(nom, nb, maxL, taille);
  return Math.max(...ls.map((l, i) => largeurTexte(l + (i === ls.length - 1 ? ` ${nb}` : ''), taille)));
}

// Un libellé dans la gouttière : à gauche du nœud (première colonne), sinon à droite ; centré sur le nœud ; le nombre en gras.
export function libelle(nd, gauche, nom, nb, { maxL = 128, classe = 'fx-lib', taille = 14 } = {}) {
  const y = (nd.t0 + nd.t1) / 2;
  const ls = lignes(nom, nb, maxL, taille);
  const x = gauche ? nd.l0 - 10 : nd.l1 + 8;
  const ancre = gauche ? ' text-anchor="end"' : '';
  const il = INTERLIGNE * taille / 14;
  const y0 = y - (ls.length - 1) * il / 2;
  const ts = ls.map((l, i) => `<tspan x="${f(x)}" y="${f(y0 + i * il)}">${esc(l)}`
    + (i === ls.length - 1 ? ` <tspan class="fx-nb">${esc(nb)}</tspan>` : '') + '</tspan>').join('');
  return `<text class="${classe}"${ancre} dominant-baseline="central">${ts}</text>`;
}

// Un libellé au-dessus de la barre de son nœud, sur une ligne, posé sur une plaque de la couleur du fond.
export function libelleDessus(nd, nom, nb, { classe = 'fx-lib', taille = 14 } = {}) {
  const w = largeurTexte(`${nom} ${nb}`, taille) + 10;
  const y = nd.t0 - 7;
  return `<rect class="fx-plaque" x="${f(nd.l0 - 4)}" y="${f(y - taille - 2)}" width="${f(w)}" height="${f(taille + 8)}" rx="4"></rect>`
    + `<text class="${classe}" x="${f(nd.l0)}" y="${f(y)}">${esc(nom)} <tspan class="fx-nb">${esc(nb)}</tspan></text>`;
}

const BARRES = { critique: 4, haute: 3, moyenne: 2, basse: 1 };

// La pastille de gravité de la console dessinée dans le SVG, puis un texte qui la suit, et une seconde ligne sous ce texte.
// Rend [svg, largeur].
export function pastille(x, y, grav, mot, suite = '', suite2 = '', taille = 14) {
  const larg = 8 + 4 * 4 + 6 + largeurTexte(mot, taille) + 12;
  let y2 = null;
  if (suite2) { const il = INTERLIGNE * taille / 14; y2 = y + il / 2; y -= il / 2; }
  const on = BARRES[grav] ?? 1;
  const barres = [0, 1, 2, 3].map(i => `<rect class="fx-p-barre${i < on ? ' on' : ''}" x="${f(x + 8 + i * 4)}" `
    + `y="${f(y + 3 - (i + 1) * 2)}" width="2.5" height="${f((i + 1) * 2 + 1)}" rx="0.5"></rect>`).join('');
  let s = `<g class="fx-p fx-p-${grav}"><rect class="fx-p-fond" x="${f(x)}" y="${f(y - 11)}" width="${f(larg)}" height="22" rx="11"></rect>${barres}`
    + `<text class="fx-p-mot" x="${f(x + 30)}" y="${f(y)}" dominant-baseline="central">${esc(mot)}</text></g>`;
  if (suite) s += `<text class="fx-lib" x="${f(x + larg + 8)}" y="${f(y)}" dominant-baseline="central">${esc(suite)}</text>`;
  if (suite2) s += `<text class="fx-lib" x="${f(x + larg + 8)}" y="${f(y2)}" dominant-baseline="central">${esc(suite2)}</text>`;
  return [s, larg + (suite ? 8 + Math.max(largeurTexte(suite, taille), largeurTexte(suite2, taille)) : 0)];
}

// Le SVG d'une mise en page. etiquette(id, nd) → le SVG du libellé ; classeLien(l) → [classe, motif ou ''] ;
// classeNoeud(id) → classe ; titres au survol (<title>), titre et description liés.
export function svg(lay, prefixe, titre, desc, largeur, hauteur, { etiquette, classeLien, classeNoeud, titreNoeud = null, titreLien = null,
  entetes = [], extra = '', teintes = [], classe = '' }) {
  const out = [`<svg class="fx-svg${classe ? ` ${classe}` : ''}" viewBox="0 0 ${f(largeur)} ${f(hauteur)}" role="img" `
    + `aria-labelledby="${prefixe}-t" aria-describedby="${prefixe}-d">`,
  `<title id="${prefixe}-t">${esc(titre)}</title><desc id="${prefixe}-d">${esc(desc)}</desc>`, motifs(prefixe, teintes)];
  for (const [x, y, t, ancre] of entetes) out.push(`<text class="fx-col" x="${f(x)}" y="${f(y)}"${ancre !== 'start' ? ` text-anchor="${ancre}"` : ''}>${esc(t)}</text>`);
  out.push('<g class="fx-liens">');
  for (const l of [...lay.liens].sort((a, b) => a.col - b.col || a.tDe - b.tDe)) {
    const [cl, motif] = classeLien(l);
    const fill = motif ? ` fill="url(#${prefixe}-h-${motif})"` : '';
    const tl = titreLien ? `<title>${esc(titreLien(l))}</title>` : '';
    out.push(`<path class="fx-l ${cl}"${fill} d="${ruban(l)}">${tl}</path>`);
  }
  out.push('</g><g class="fx-noeuds">');
  for (const [z, nd] of lay.noeuds) {
    const tn = titreNoeud ? `<title>${esc(titreNoeud(z))}</title>` : '';
    out.push(`<rect class="fx-n ${classeNoeud(z)}" x="${f(nd.l0)}" y="${f(nd.t0)}" width="${f(nd.l1 - nd.l0)}" height="${f(nd.t1 - nd.t0)}" rx="2">${tn}</rect>`);
  }
  out.push('</g><g class="fx-libs">');
  for (const [z, nd] of lay.noeuds) out.push(etiquette(z, nd));
  out.push('</g>');
  out.push(extra);
  out.push('</svg>');
  return out.join('\n');
}

// ===================================================================================================================
// Les deux dessins de MV-11 (flux_donnees.py), sur des chemins venus de la base.
// Un chemin : { origine, source, chemin, issue, n, alerte } ; issue : 'critique' | 'haute' | 'moyenne' | 'basse' | 'sans' ;
// alerte : numéro de l'alerte (ou null). Les alertes : [{ id, grav ('critique'…), mot ('Critique'…), chemin, ... }], dans
// l'ordre de la console.
// ===================================================================================================================

export const COLS = ['origine', 'source', 'chemin', 'issue'];
export const NOMS = {
  hors: 'hors application', vig: 'la Vigie elle-même', adm: 'comptes de l’admin', vis: 'visiteurs du site public', zit: 'Zitadel',
  vigie: 'contrôles de la Vigie', site: 'site', bordure: 'bordure Cloudflare', zitadel: 'Zitadel',
  direct: 'preuve directe', score: 'score d’une entité', correl: 'corrélation', sanspoint: 'sans point',
  critique: 'Critique', haute: 'Haute', moyenne: 'Moyenne', basse: 'Basse', sans: 'sans alerte',
};
export const PRECIS = {
  hors: 'base, serveur, sauvegarde', vig: 'contrôles, interrupteurs, console', adm: 'sessions ouvertes', vis: 'adresses inconnues',
  zit: 'connexions, droits',
  direct: 'une règle ou un détecteur sur une seule source', score: 'points sur une adresse, un réseau, un compte',
  correl: 'règle Sigma sur plusieurs événements', sanspoint: 'aucun point', sans: 'sous le seuil ou sans point',
};
export const MOT = { critique: 'Critique', haute: 'Haute', moyenne: 'Moyenne', basse: 'Basse' };
// Ordre du métier (§ 3.18, point 4) : hors application et la Vigie elle-même en haut.
export const METIER = [['hors', 'vig', 'adm', 'vis', 'zit'], ['vigie', 'site', 'bordure', 'zitadel'], ['direct', 'score', 'correl', 'sanspoint'],
  ['critique', 'haute', 'moyenne', 'basse', 'sans']];
const METIER_COL = Object.fromEntries(METIER.flatMap((col, c) => col.map(z => [z, c])));
export const TEINTES = ['vigie', 'site', 'bordure', 'zitadel'];
export const TAILLE = 14;                         // le texte du SVG, en unités du viewBox
export const LARGEUR = 760;                       // tient dans la page dès 1 024 px (texte à 13,5 px)
export const LARGE = 1120, TAILLE_LARGE = 15;     // au-delà de 1 280 px (§ 3.19, point 1)
export const ALERTES_UNE_A_UNE = 12;              // au-delà, les alertes du dessin sont rangées par gravité (une bande chacune)

const pluriel = (n, un, plusieurs = `${un}s`) => (n > 1 ? plusieurs : un);
export const total = (chemins, k = null, v = null) => somme(chemins.filter(c => k == null || c[k] === v).map(c => c.n));
export const alertesDe = (chemins, chemin = null) => [...new Set(chemins.filter(c => c.alerte != null && (chemin == null || c.chemin === chemin)).map(c => c.alerte))];
const nAlertes = (chemins, issue) => new Set(chemins.filter(c => c.issue === issue && c.alerte != null).map(c => c.alerte)).size;
const estAlerte = z => typeof z === 'string' && /^a\d+$/.test(z);
const nomDe = z => (estAlerte(z) ? `#${z.slice(1)}` : NOMS[z] ?? String(z));

// La teinte dit la source, la saturation dit l'issue (§ 3.18, point 6) ; hachures pour une corrélation.
function groupeEv(surligne) {
  return (c, i) => {
    const mene = c.alerte != null;
    let cle = i === 2 && !mene ? 'perdu' : `${c.source}/${mene ? 'a' : 'o'}${mene && c.chemin === 'correl' && i >= 1 ? '/h' : ''}`;
    if (surligne != null) cle += c.alerte === surligne ? '/x' : '/e';
    return cle;
  };
}
// Une bande par alerte quand elles sont nommées une à une ; rangées par gravité, une bande par flux (le nombre de rubans reste
// borné, quel que soit le nombre d'alertes).
function groupeAl(surligne, uneAUne = true) {
  return (c, i) => {
    let cle = `${c.source}/a${uneAUne ? `/${c.alerte}` : ''}${c.chemin === 'correl' && i >= 1 ? '/h' : ''}`;
    if (surligne != null) cle += c.alerte === surligne ? '/x' : '/e';
    return cle;
  };
}
export function classeLien(l) {
  const g = l.groupe.split('/');
  const fin = g.at(-1);
  const etat = fin === 'x' ? ' fx-surligne' : fin === 'e' ? ' fx-estompe' : '';
  if (g[0] === 'perdu') return [`fx-perdu${etat}`, ''];
  if (g.includes('h')) return [`fx-l-h${etat}`, g[0]];
  return [`fx-f-${g[0]} ${g[1] === 'a' ? 'fx-alerte' : 'fx-sans'}${etat}`, ''];
}
function classeNoeud(porteurs, gravDe) {
  return z => {
    let base;
    if (TEINTES.includes(z)) base = `fx-f-${z} fx-alerte`;
    else if (['critique', 'haute', 'moyenne', 'basse'].includes(z)) base = `fx-g-${z}`;
    else if (estAlerte(z) && ['critique', 'haute', 'moyenne', 'basse'].includes(gravDe(z))) base = `fx-g-${gravDe(z)}`;
    else if (z === 'sans') base = 'fx-n-sans';
    else base = 'fx-n-neutre';
    if (porteurs) base += porteurs.has(z) ? ' fx-surligne' : ' fx-estompe';
    return base;
  };
}

// ---------- « Les N événements » ----------
export function diagrammeEvenements(chemins, { prefixe, titre, desc, surligne = null, largeur = LARGEUR, taille = TAILLE }) {
  const { noeuds, liens } = graphe(chemins, COLS, groupeEv(surligne));
  const k14 = taille / TAILLE;
  const suites = z => { const na = nAlertes(chemins, z), ne = total(chemins, 'issue', z); return [`${na} ${pluriel(na, 'alerte')}`, `${nombre(ne)} ${pluriel(ne, 'événement')}`]; };
  const nbDe = (c, z) => nombre(total(chemins, COLS[c], z));
  const larg = [Math.max(...noeuds[0].map(z => largeurLibelle(NOMS[z], nbDe(0, z), 112 * k14, taille))), 0, 0,
    Math.max(...noeuds[3].map(z => (z !== 'sans' ? pastille(0, 0, z, MOT[z], ...suites(z), taille)[1] : largeurTexte(`sans alerte ${nbDe(3, z)}`, taille))))];
  const { x, gouttieres } = colonnes(larg, largeur, 8, { bandeMin: 40 });
  const hLib = z => {
    const c = METIER_COL[z];
    if (c === 3 && z !== 'sans') return 2 * INTERLIGNE * k14;
    return lignes(NOMS[z], nbDe(c, z), 112 * k14, taille).length * INTERLIGNE * k14;
  };
  const wLib = z => largeurTexte(`${NOMS[z]} ${nbDe(METIER_COL[z], z)}`, taille) + 10;
  const lay = miseEnPage(noeuds, liens, x, gouttieres, 460, { ecart: 24, ecartBas: 40, epaisseur: 8, minLien: 3, kMax: 1, bas: ['sans', 'sanspoint'],
    hautMarge: 34, fixes: [0, 1, 2, 3], ordreMetier: METIER, hLib, dessus: [1, 2], hDessus: taille + 10, decal: [0, 0, taille + 12, 0], wLib });
  const etiquette = (z, nd) => {
    const c = nd.col;
    if (c === 3 && z !== 'sans') return pastille(nd.l1 + 8, (nd.t0 + nd.t1) / 2, z, MOT[z], ...suites(z), taille)[0];
    if (c === 1 || c === 2) return libelleDessus(nd, NOMS[z], nbDe(c, z), { taille });
    return libelle(nd, c === 0, NOMS[z], nbDe(c, z), { maxL: 112 * k14, taille });
  };
  const entetes = [[x[0] - 10, 18, 'Origines', 'end'], [x[1], 18, 'Sources', 'start'], [x[2], 18, 'Chemins', 'start'], [x[3], 18, 'Issues', 'start']];
  const note = alertesDe(chemins, 'correl').length ? ''
    : `<text class="fx-note" x="${f(x[2])}" y="${f(lay.fin + 28)}">corrélation (règle Sigma)${FINE}: aucune sur la période</text>`;
  const porteurs = surligne != null ? new Set(chemins.filter(c => c.alerte === surligne).flatMap(c => COLS.map(k => c[k]))) : null;
  const titreNoeud = z => {
    const col = COLS[METIER_COL[z]];
    const n = total(chemins, col, z);
    const al = alertesDe(chemins.filter(c => c[col] === z)).sort((a, b) => a - b);
    return `${NOMS[z]}${FINE}: ${nombre(n)} ${pluriel(n, 'événement')}${PRECIS[z] ? ` (${PRECIS[z]})` : ''}${al.length ? ` · ${pluriel(al.length, 'alerte')} ${al.slice(0, 12).map(a => `#${a}`).join(', ')}${al.length > 12 ? ', …' : ''}` : ''}`;
  };
  const titreLien = l => {
    const al = [...new Set(l.chemins.filter(c => c.alerte != null).map(c => c.alerte))].sort((a, b) => a - b);
    return `${NOMS[l.de]} → ${NOMS[l.a]}${FINE}: ${nombre(l.n)} ${pluriel(l.n, 'événement')}${al.length ? ` · ${al.slice(0, 12).map(a => `#${a}`).join(', ')}${al.length > 12 ? ', …' : ''}` : ''}`;
  };
  const html = svg(lay, prefixe, titre, desc, largeur, lay.fin + (note ? 44 : 12), {
    etiquette, classeLien, classeNoeud: classeNoeud(porteurs, () => null), titreNoeud, titreLien, entetes, extra: note, teintes: TEINTES,
    classe: `fx-ev${largeur > LARGEUR ? ' fx-large' : ''}` });
  return { html, lay };
}

// Le diagramme des alertes : chaque alerte pèse 1 (une bande d'épaisseur égale), partagée entre ses provenances au prorata de
// ses événements ; son issue est l'alerte elle-même (a<numéro>), ou sa gravité quand elles sont trop nombreuses.
export function parAlerte(alertes, { uneAUne = true } = {}) {
  const out = [];
  for (const a of alertes) {
    const n = somme(a.parts.map(p => p.n));
    for (const p of a.parts) out.push({ origine: p.origine, source: p.source, chemin: a.chemin, issue: uneAUne ? `a${a.id}` : a.grav, n: n ? p.n / n : 1 / a.parts.length, alerte: a.id, ev: p.n });
  }
  return out;
}

// ---------- « Les N alertes » ----------
export function diagrammeAlertes(alertes, { prefixe, titre, desc, surligne = null, largeur = LARGEUR, taille = TAILLE }) {
  const uneAUne = alertes.length <= ALERTES_UNE_A_UNE;
  const pa = parAlerte(alertes, { uneAUne });
  const parId = new Map(alertes.map(a => [a.id, a]));
  const gravDe = z => (estAlerte(z) ? parId.get(Number(z.slice(1)))?.grav : null);
  const { noeuds, liens } = graphe(pa, COLS, groupeAl(surligne, uneAUne));
  const k14 = taille / TAILLE;
  const compte = (c, z) => new Set(pa.filter(p => p[COLS[c]] === z).map(p => p.alerte)).size;
  const larg3 = uneAUne
    ? Math.max(...alertes.map(a => largeurTexte(`#${a.id}`, taille) + 8 + pastille(0, 0, a.grav, a.mot, '', '', taille)[1]))
    : Math.max(...noeuds[3].map(z => pastille(0, 0, z, MOT[z], `${compte(3, z)} ${pluriel(compte(3, z), 'alerte')}`, '', taille)[1]));
  const larg = [Math.max(...noeuds[0].map(z => largeurLibelle(NOMS[z], String(compte(0, z)), 112 * k14, taille))), 0, 0, larg3];
  const { x, gouttieres } = colonnes(larg, largeur, 8, { bandeMin: 40 });
  const metier = [METIER[0], METIER[1], METIER[2], uneAUne ? alertes.map(a => `a${a.id}`) : METIER[3]];
  const hLib = z => {
    if (estAlerte(z) || METIER_COL[z] === 3) return 24;
    return lignes(NOMS[z], String(compte(METIER_COL[z], z)), 112 * k14, taille).length * INTERLIGNE * k14;
  };
  const wLib = z => largeurTexte(`${NOMS[z] ?? ''} ${METIER_COL[z] != null ? compte(METIER_COL[z], z) : 0}`, taille) + 10;
  const lay = miseEnPage(noeuds, liens, x, gouttieres, 400, { ecart: 14, epaisseur: 8, minLien: 3, kMax: 18, hautMarge: 34, fixes: [0, 1, 2, 3],
    ordreMetier: metier, hLib, dessus: [1, 2], hDessus: taille + 10, decal: [0, 0, taille + 12, 0], wLib });
  const etiquette = (z, nd) => {
    const c = nd.col;
    const y = (nd.t0 + nd.t1) / 2;
    if (c === 3 && estAlerte(z)) {
      const a = parId.get(Number(z.slice(1)));
      const num = `<text class="fx-lib fx-num" x="${f(nd.l1 + 8)}" y="${f(y)}" dominant-baseline="central">#${a.id}</text>`;
      return num + pastille(nd.l1 + 8 + largeurTexte(`#${a.id}`, taille) + 8, y, a.grav, a.mot, '', '', taille)[0];
    }
    if (c === 3) { const n = compte(3, z); return pastille(nd.l1 + 8, y, z, MOT[z], `${n} ${pluriel(n, 'alerte')}`, '', taille)[0]; }
    if (c === 1 || c === 2) return libelleDessus(nd, NOMS[z], String(compte(c, z)), { taille });
    return libelle(nd, true, NOMS[z], String(compte(c, z)), { maxL: 112 * k14, taille });
  };
  const entetes = [[x[0] - 10, 18, 'Origines', 'end'], [x[1], 18, 'Sources', 'start'], [x[2], 18, 'Chemins', 'start'], [x[3], 18, 'Alertes', 'start']];
  const note = alertes.some(a => a.chemin === 'correl') ? ''
    : `<text class="fx-note" x="${f(x[2])}" y="${f(lay.fin + 28)}">corrélation (règle Sigma)${FINE}: aucune sur la période</text>`;
  const titreNoeud = z => {
    if (estAlerte(z)) { const a = parId.get(Number(z.slice(1))); return `#${a.id} · ${a.mot} · ${nombre(a.evenements)} ${pluriel(a.evenements, 'événement')}`; }
    const n = compte(METIER_COL[z], z);
    return `${NOMS[z]}${FINE}: ${n} ${pluriel(n, 'alerte')}${PRECIS[z] ? ` (${PRECIS[z]})` : ''}`;
  };
  const titreLien = l => {
    const als = [...new Set(l.chemins.map(p => p.alerte))].sort((a, b) => a - b);
    const ev = somme(l.chemins.map(p => p.ev));
    return `${nomDe(l.de)} → ${nomDe(l.a)}${FINE}: ${als.slice(0, 12).map(a => `#${a}`).join(', ')}${als.length > 12 ? ', …' : ''} (${nombre(ev)} ${pluriel(ev, 'événement')})`;
  };
  const porteurs = surligne != null ? new Set(pa.filter(p => p.alerte === surligne).flatMap(p => COLS.map(k => p[k]))) : null;
  const html = svg(lay, prefixe, titre, desc, largeur, lay.fin + (note ? 44 : 12), {
    etiquette, classeLien, classeNoeud: classeNoeud(porteurs, gravDe), titreNoeud, titreLien, entetes, extra: note, teintes: TEINTES,
    classe: `fx-al${largeur > LARGEUR ? ' fx-large' : ''}` });
  return { html, lay, uneAUne };
}

// Conservation des flux (comme les assertions de flux_donnees.py) : dans chaque nœud d'une colonne du milieu, ce qui entre
// en sort ; la somme de chaque colonne est le total. Rend la liste des écarts (vide : tout se conserve).
export function ecartsDeConservation({ noeuds, liens }, attendu = null) {
  const ecarts = [];
  const somme = ls => ls.reduce((s, l) => s + l.n, 0);
  noeuds.forEach((col, c) => {
    if (c > 0 && c < noeuds.length - 1) for (const z of col) {
      const e = somme(liens.filter(l => l.col === c - 1 && l.a === z)), s = somme(liens.filter(l => l.col === c && l.de === z));
      if (Math.abs(e - s) > 1e-9) ecarts.push(`${z} : entre ${e}, sort ${s}`);
    }
  });
  for (let c = 0; c < noeuds.length - 1; c++) {
    const s = somme(liens.filter(l => l.col === c));
    if (attendu != null && Math.abs(s - attendu) > 1e-9) ecarts.push(`colonne ${c} → ${c + 1} : ${s} au lieu de ${attendu}`);
  }
  return ecarts;
}
