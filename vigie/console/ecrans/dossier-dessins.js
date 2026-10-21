// Lectures des trois dessins de MV-13. Aucun parcours des événements : les copies du dossier portent l'heure source,
// la nature et les entités. Les plafonds sont annoncés ; ils ne dépendent pas de la page de 40 signaux consultée.
import { PHASES, MARQUEURS } from '../../phases.js';
import { TACTIQUES, VERSION, lire as tagsDe, technique, nomTechnique } from '../../attack.js';
import { techniquesDe, filtreTechnique } from '../attack.js';
import { dateHeure, heure } from '../format.js';
import { lire } from '../lexique.js';
import { COULOIRS, deuxDessins, frise, graphe, matrice } from '../dossiers-dessins.js';

export const DESSIN_MAX = 2000;
const ZOOMS = { '1h': 3600e3, '24h': 864e5, '7j': 7 * 864e5 };
export function filtresDessin(query = {}) {
  const zoom = typeof query.frise === 'string' && Object.hasOwn(ZOOMS, query.frise) ? query.frise : '24h';
  return { zoom, technique: filtreTechnique(query.technique), faits: query.faits === 'oui',
    ignores: [query.frise != null && query.frise !== zoom ? 'zoom' : '', query.technique != null && !filtreTechnique(query.technique) ? 'technique' : '', query.faits != null && !['oui', 'non'].includes(query.faits) ? 'faits' : ''].filter(Boolean) };
}
export function lienDessin(id, f, extra = {}, ancre = 'frise') {
  const valeurs = { frise: f.zoom, technique: f.technique, faits: f.faits ? 'oui' : '', ...extra }, p = new URLSearchParams();
  for (const [k, v] of Object.entries(valeurs)) if (v !== '' && v != null) p.set(k, String(v));
  return `/dossiers/${id}?${p}${ancre ? '#' + ancre : ''}`;
}
export function conditionTechnique(regles, id) {
  if (!id) return { sql: '', args: [] };
  const args = [...regles.values()].filter(r => techniquesDe(r).includes(id)).map(r => r.id);
  return { sql: args.length ? ` AND s.regle IN (${args.map(() => '?').join(',')})` : ' AND 0', args };
}

export function dessins({ q, d, regles, query, texte, entite, signal }) {
  const filtres = filtresDessin(query), id = d.id;
  const tous = q.sql(`SELECT s.*, e.seq AS present FROM dossier_signaux s LEFT JOIN events e ON e.seq = s.seq
    WHERE dossier_id = ? ORDER BY s.survenu_a DESC, s.id DESC LIMIT ${DESSIN_MAX + 1}`).all(id);
  const sources = tous.slice(0, DESSIN_MAX).reverse(), x = lire(d.explication) || {};
  const suite = Array.isArray(x.chaine) ? x.chaine.filter(n => Number.isInteger(n) && n >= 1 && n <= 8) : [];
  const non = PHASES.filter(p => Array.isArray(x.non_observees) && x.non_observees.includes(p.nom.toLowerCase())).map(p => p.n);
  const fin = sources.at(-1)?.survenu_a ?? d.derniere, t1 = fin + Math.min(60e3, ZOOMS[filtres.zoom] / 100), t0 = t1 - ZOOMS[filtres.zoom];
  const filtrer = s => !filtres.technique || techniquesDe(regles.get(s.regle)).includes(filtres.technique);
  const retenus = sources.filter(s => s.survenu_a >= t0 && filtrer(s));
  const disponibilite = retenus.some(s => Array.isArray(lire(s.marqueurs)) && lire(s.marqueurs).includes('disponibilite'));
  const couloirs = disponibilite ? [...COULOIRS.slice(0, -1), 'Disponibilité', 'Faits'] : COULOIRS;
  const points = retenus.filter(s => filtres.faits || s.nature !== 'fait').flatMap(s => {
    const m = lire(s.marqueurs), marqueurs = Array.isArray(m) ? m : [], vue = signal(s);
    const point = { id: s.id, t: s.survenu_a,
      grav: s.gravite, lib: `${vue.heure} · ${vue.nature} · ${vue.titre}${vue.marqueurs ? ' · ' + vue.marqueurs : ''}`,
      href: lienDessin(id, filtres, { avant: `${s.survenu_a}-${s.id + 1}` }, `signal-${s.id}`), vue };
    const ps = [];
    if (s.nature === 'fait') ps.push({ ...point, c: couloirs.length, forme: 'fait' });
    else {
      if (s.nature === 'indice') ps.push({ ...point, c: 9, forme: 'indice' });
      else if (s.phase >= 1 && s.phase <= 8) ps.push({ ...point, c: s.phase, forme: s.promu ? 'promu' : s.nature });
      // Phase et marqueur ne s'excluent pas. La disponibilité a son couloir seulement si elle est présente,
      // sans devenir une neuvième phase ni être confondue avec les faits ordinaires.
      for (const [cle, c] of [['dissimulation', 10], ['disponibilite', 11]]) if (marqueurs.includes(cle)) ps.push({ ...point, c, forme: 'marqueur' });
    }
    return ps;
  });
  const ticks = [0, 0.5, 1].map(n => { const t = t0 + (t1 - t0) * n; return { t, mot: filtres.zoom === '1h' ? heure(t) : dateHeure(t) }; });
  const fr = { t0, t1, points, suite, non, ticks, couloirs };
  const blocs = couloirs.map((nom, i) => ({ nom, items: points.filter(p => p.c === i + 1), non: non.includes(i + 1) }));

  // Le même signal peut porter plusieurs techniques et tactiques : une occurrence par technique, un ordre global
  // de première apparition, puis seules les tactiques effectivement portées par la règle sont remplies.
  const ordre = new Map(), cartes = TACTIQUES.map(t => ({ ...t, hors: t.cle === 'resource_development', items: [], sans: 0 }));
  for (const s of sources) {
    const r = regles.get(s.regle), tags = tagsDe(r?.tags || []), ids = techniquesDe(r);
    for (const tid of ids) if (!ordre.has(tid)) ordre.set(tid, ordre.size + 1);
    for (const c of cartes) {
      if (!tags.tactiques.includes(c.cle)) continue;
      const couverts = ids.filter(tid => technique(tid).tactiques.includes(c.cle));
      if (!couverts.length) c.sans++;
      for (const tid of couverts) {
        let item = c.items.find(z => z.id === tid);
        if (!item) { item = { id: tid, nom: nomTechnique(tid), anglais: technique(tid).nom, ordre: ordre.get(tid), n: 0, phases: new Set(), href: lienDessin(id, filtres, { technique: tid }) }; c.items.push(item); }
        item.n++;
        const marqueurs = lire(s.marqueurs);
        item.phases.add(PHASES.find(p => p.n === s.phase)?.nom || (Array.isArray(marqueurs) ? marqueurs.map(m => MARQUEURS[m]).filter(Boolean).join(', ') : '') || 'Sans phase');
      }
    }
  }
  for (const c of cartes) for (const z of c.items) { z.phase = [...z.phases].join(', '); delete z.phases; }

  const entites = q.entites.all(id).slice(0, 200), actifs = entites.map((e, i) => ({ e, i })).filter(z => z.e.detache_a == null);
  const groupes = new Map(), parCle = new Map();
  for (const { e, i } of actifs) {
    const cle = e.role === 'cible' && e.kind === 'objet' ? `objets:${e.key.split(':')[0]}` : `entite:${i}`;
    let n = groupes.get(cle);
    if (!n) {
      const v = entite(e);
      n = { ...v, id: `n${i}`, col: e.role === 'cible' ? 2 : ['compte', 'session', 'acces'].includes(e.kind) ? 1 : 0,
        graine: e.kind === d.graine_kind && e.key === d.graine_key, href: v.href || `#entite-${i}`, n: 0, categorie: texte(e.key.split(':')[0]) };
      groupes.set(cle, n);
    }
    n.n++; parCle.set(`${e.kind}:${e.key}`, n.id);
  }
  const noeuds = [...groupes.values()].slice(0, 40);
  for (const n of noeuds) if (n.n > 1) { n.type = 'Objets regroupés'; n.texte = `${n.n} objets · ${n.categorie}`; n.force = 'Liens détaillés dans le tableau'; }
  const visibles = new Set(noeuds.map(n => n.id)), liens = [], vus = new Set();
  for (const { e } of actifs) {
    const de = parCle.get(e.via), a = parCle.get(`${e.kind}:${e.key}`), cle = JSON.stringify([de, a, e.force]);
    if (de && de !== a && visibles.has(de) && visibles.has(a) && !vus.has(cle)) { liens.push({ de, a, force: e.force }); vus.add(cle); }
  }
  const voisins = q.sql(`SELECT DISTINCT d.id FROM dossier_entites a JOIN dossier_entites b ON b.kind = a.kind AND b.key = a.key
    JOIN dossiers d ON d.id = b.dossier_id WHERE a.dossier_id = ? AND b.dossier_id != ? AND a.detache_a IS NULL AND b.detache_a IS NULL
    AND a.role = 'acteur' AND b.role = 'acteur' AND d.fusionne_dans IS NULL ORDER BY d.id LIMIT 11`).all(id, id);
  for (const v of voisins.slice(0, 10)) noeuds.push({ id: `d${v.id}`, col: 2, type: 'Dossier voisin', texte: `#${v.id} · acteur commun`, force: 'Acteur commun, sans fusion', href: `/dossiers/${v.id}`, voisin: true });
  return { filtres, version: VERSION, coupe: tous.length > DESSIN_MAX, maximum: DESSIN_MAX, total: sources.length,
    debut: dateHeure(t0), fin: dateHeure(t1), horsFenetre: sources.filter(s => s.survenu_a < t0 && filtrer(s)).length,
    faits: retenus.filter(s => s.nature === 'fait').length, blocs, points: points.length,
    frise: points.length ? deuxDessins(frise, fr) : null, matrice: deuxDessins(matrice, cartes), cartes,
    graphe: noeuds.length ? deuxDessins(graphe, { noeuds, liens }) : null, grapheCoupe: groupes.size > 40,
    sansActeur: !actifs.some(({ e }) => ['ip', 'reseau', 'appareil'].includes(e.kind)),
    voisins: voisins.slice(0, 10), voisinsCoupes: voisins.length > 10,
    zooms: Object.keys(ZOOMS).map(z => ({ mot: { '1h': '1 heure', '24h': '24 heures', '7j': '7 jours' }[z], courant: z === filtres.zoom, href: lienDessin(id, filtres, { frise: z }) })),
    lienFaits: lienDessin(id, { ...filtres, faits: !filtres.faits }), toutesTechniques: lienDessin(id, filtres, { technique: '' }),
    techniqueNom: filtres.technique ? nomTechnique(filtres.technique) : '',
    // La carte mobile et le tableau reçoivent uniquement du texte ; les SVG échappent eux-mêmes leurs libellés.
    note: texte('Les traits du graphe reprennent « Entrée par » lorsqu’une entité du dossier y est nommée. Aucun acteur réseau n’est déduit d’un compte.') };
}
