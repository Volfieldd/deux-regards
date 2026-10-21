// ATT&CK complet (MV-14, D31) : couverture courante et signaux réellement notés, indépendamment des huit phases.
// Lectures plafonnées et annoncées, formulaires GET seulement. Les calques téléchargés ne contiennent ni compte,
// ni adresse, ni titre d'événement ; le serveur ne contacte pas MITRE. Les étiquettes historiques restent intactes.
import { fileURLToPath } from 'node:url';
import { VERSION, PUBLIEE, TACTIQUES, toutesLesTechniques, technique, nomTechnique, lire as lireTags } from '../../attack.js';
import { loadRules } from '../../sigma.js';
import { PHASES, MARQUEURS, projeter, projeterDetecteur } from '../../phases.js';
import { reglesAttack, filtreTechnique, techniquesDe } from '../attack.js';
import { dateHeure, masquer } from '../format.js';
import { lire, MODES, titreDe } from '../lexique.js';
import { numero } from './dossiers.js';

export const MAX_SIGNAUX = 10_000, MAX_DOSSIER = 2_000;
const PERIODES = { '24h': { ms: 864e5, mot: '24 heures' }, '7j': { ms: 7 * 864e5, mot: '7 jours' }, '30j': { ms: 30 * 864e5, mot: '30 jours' } };
const str = v => typeof v === 'string' ? v : '';
const propre = (v, role, max = 300) => masquer(String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, max), role || 'viewer');
const tagsDe = s => { const d = lire(s.detail); return Array.isArray(d?.tags) ? d.tags : []; };
const cache = new WeakMap();
function sql(db, texte) {
  if (!cache.has(db)) cache.set(db, new Map());
  const c = cache.get(db);
  if (!c.has(texte)) c.set(texte, db.prepare(texte));
  return c.get(texte);
}
// Même lecture des exceptions Sigma que le moteur ; aucune modification de son registre ni de ses modes.
let projections;
function projection(r) {
  if (r.id.startsWith('detecteur.')) return projeterDetecteur(r.id.slice(10), r);
  if (!projections) {
    const { rules, correlations } = loadRules(fileURLToPath(new URL('../../regles/', import.meta.url)));
    projections = new Map([...rules, ...correlations].map(x => [`sigma.${x.name}`, projeter(x)]));
  }
  return projections.get(r.id) ?? projeter(r);
}
function phaseDe(r) {
  const p = projection(r);
  if (!p) return 'Hors projection : la chaîne d’attaque est calculée sur le dossier.';
  return [PHASES.find(x => x.n === p.n)?.nom, ...p.marqueurs.map(x => MARQUEURS[x]),
    p.nature === 'indice' ? 'indice d’accès' : p.nature === 'preuve' ? 'preuve d’accès' : '',
    p.origine === 'explicite' ? 'exception explicite de la règle' : `projection par ${p.origine}`].filter(Boolean).join(' · ');
}
export function optionsAttack(query = {}) {
  const periode = Object.hasOwn(PERIODES, str(query.periode)) ? query.periode : '7j';
  const dossier = query.dossier == null ? null : numero(str(query.dossier));
  return { periode, dossier, invalide: (query.periode != null && !Object.hasOwn(PERIODES, str(query.periode))) || (query.dossier != null && !dossier) };
}
export function urlAttack(f, base = '/attack', extra = {}) {
  const p = new URLSearchParams({ periode: f.periode });
  if (f.dossier) p.set('dossier', String(f.dossier));
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return `${base}?${p}`;
}
// Le compte des signaux porte sur les événements notés (déduplication du moteur de dix minutes), non sur les points.
// Un dossier lit ses copies conservées, comme sa matrice D2 : les faits ordinaires n'ont pas d'étiquettes de règle.
export function vueAttack({ db, engine, query = {}, now = Date.now, role = 'viewer', id = null }) {
  const f = optionsAttack(query), t = now(), debut = t - PERIODES[f.periode].ms;
  if (query.dossier != null && !f.dossier) return null;
  const dossier = f.dossier && sql(db, 'SELECT id, fusionne_dans FROM dossiers WHERE id = ?').get(f.dossier);
  if (f.dossier && !dossier) return null;
  const regles = reglesAttack(engine), parTechnique = new Map([...toutesLesTechniques()].map(x => [x.id, { ...x, nomVue: nomTechnique(x.id), regles: [], n: 0, alertes: [], parTactiqueAlertes: new Map(), parTactique: new Map() }]));
  for (const r of regles.values()) for (const k of techniquesDe(r)) parTechnique.get(k).regles.push(r);
  const limite = dossier ? MAX_DOSSIER : MAX_SIGNAUX;
  const sources = dossier
    ? sql(db, `SELECT regle, survenu_a, alerte_id, nature FROM dossier_signaux WHERE dossier_id = ? ORDER BY survenu_a DESC, id DESC LIMIT ${MAX_DOSSIER + 1}`).all(dossier.id)
    : id
      ? sql(db, `SELECT e.seq,e.recu_a,e.detail FROM events_techniques x JOIN events e ON e.seq = x.seq WHERE x.technique = ? AND x.recu_a >= ? AND x.recu_a <= ? ORDER BY x.recu_a DESC,x.seq DESC LIMIT ${MAX_SIGNAUX + 1}`).all(id, debut, t)
      : sql(db, `SELECT seq,recu_a,detail FROM events WHERE type = 'vigie_signal' AND recu_a >= ? AND recu_a <= ? ORDER BY recu_a DESC,seq DESC LIMIT ${MAX_SIGNAUX + 1}`).all(debut, t);
  const coupes = sources.length > limite, retenus = sources.slice(0, limite);
  let sansTechnique = 0, signaux = 0;
  for (const s of retenus) {
    if (dossier && s.nature === 'fait') continue;
    const tags = dossier ? regles.get(s.regle)?.tags || [] : tagsDe(s), lus = lireTags(tags);
    const ids = lus.techniques.filter(k => parTechnique.has(k));
    if (!ids.length) { sansTechnique++; continue; }
    signaux++;
    for (const k of ids) {
      const x = parTechnique.get(k); x.n++;
      for (const tac of x.tactiques.filter(z => lus.tactiques.includes(z))) x.parTactique.set(tac, (x.parTactique.get(tac) || 0) + 1);
    }
  }
  // Une alerte de ces règles n'est pas forcément née de chacun des signaux : le libellé distingue les deux comptes.
  const alertes = dossier
    ? sql(db, `SELECT id,regle FROM alerts WHERE dossier_id = ? ORDER BY id DESC LIMIT ${MAX_SIGNAUX + 1}`).all(dossier.id)
    : sql(db, `SELECT id,regle FROM alerts WHERE derniere >= ? AND derniere <= ? ORDER BY derniere DESC,id DESC LIMIT ${MAX_SIGNAUX + 1}`).all(debut, t);
  for (const a of alertes.slice(0, MAX_SIGNAUX)) {
    const tags = lireTags(regles.get(a.regle)?.tags || []);
    for (const k of techniquesDe(regles.get(a.regle))) {
      const x = parTechnique.get(k); x.alertes.push(a.id);
      for (const tac of x.tactiques.filter(z => tags.tactiques.includes(z))) x.parTactiqueAlertes.set(tac, (x.parTactiqueAlertes.get(tac) || 0) + 1);
    }
  }
  const cartes = TACTIQUES.map(tac => {
    const ts = [...parTechnique.values()].filter(x => x.tactiques.includes(tac.cle));
    const items = ts.map(x => ({ id: x.id, nom: x.nomVue, anglais: x.nom, n: x.parTactique.get(tac.cle) || 0,
      regles: x.regles.filter(r => lireTags(r.tags).tactiques.includes(tac.cle)).length,
      alertes: x.parTactiqueAlertes.get(tac.cle) || 0,
      href: urlAttack(f, `/attack/${x.id}`) }));
    return { ...tac, items: items.filter(x => x.regles || x.n), sans: items.filter(x => !x.regles && !x.n),
      couverts: items.filter(x => x.regles).length, n: items.reduce((a, x) => a + x.n, 0) };
  });
  const base = { f, version: VERSION, publiee: PUBLIEE, maintenant: dateHeure(t), dossier, cartes, signaux, sansTechnique,
    coupe: coupes, maximum: limite, alertesCoupees: alertes.length > MAX_SIGNAUX,
    couverts: [...parTechnique.values()].filter(x => x.regles.length).length, tactiquesCouvertes: cartes.filter(x => x.couverts).length,
    periode: PERIODES[f.periode].mot, periodes: Object.keys(PERIODES).map(k => ({ k, mot: PERIODES[k].mot, href: urlAttack({ ...f, periode: k }, id ? `/attack/${id}` : '/attack') })),
    couverture: urlAttack(f, '/attack/navigator.json', { calque: 'couverture' }), observe: urlAttack(f, '/attack/navigator.json', { calque: 'observe' }),
    retour: urlAttack(f), parTechnique };
  if (!id) return base;
  const tech = parTechnique.get(id);
  if (!tech) return null;
  const rs = tech.regles.map(r => ({ titre: propre(titreDe(r.id, regles), role), cas: propre(r.cas, role, 30),
    mode: MODES[r.mode] || 'Inconnu', phase: phaseDe(r), expiree: Boolean(r.expire && r.expire < t),
    href: `/reglages?q=${encodeURIComponent(r.id)}` }));
  // Les copies du dossier sont indexées par règle ; au plus 1 000 lignes par règle, sans lecture de tout le journal.
  const ds = new Map(); let dossiersCoupes = false;
  for (const r of tech.regles) {
    const ss = sql(db, "SELECT dossier_id,survenu_a FROM dossier_signaux WHERE regle = ? AND nature != 'fait' AND survenu_a >= ? ORDER BY survenu_a DESC LIMIT 1001").all(r.id, debut);
    if (ss.length > 1000) dossiersCoupes = true;
    for (const s of ss.slice(0, 1000)) ds.set(s.dossier_id, Math.max(ds.get(s.dossier_id) || 0, s.survenu_a));
  }
  const dossiers = [];
  for (const [d] of [...ds].sort((a,b) => b[1] - a[1]).slice(0, 21)) {
    const row = sql(db, 'SELECT id,explication,statut,fusionne_dans FROM dossiers WHERE id = ?').get(d);
    if (row && !row.fusionne_dans) dossiers.push({ id: d, titre: propre(lire(row.explication)?.titre || `Dossier #${d}`, role), statut: row.statut });
  }
  return { ...base, tech, regles: rs, dossiers: dossiers.slice(0,20), dossiersCoupes: dossiersCoupes || ds.size > 20,
    journal: `/evenements?periode=${f.periode}&type=vigie_signal&technique=${id}`, alertes: tech.alertes.slice(0,20) };
}
// Format officiel 4.5 : https://github.com/mitre-attack/attack-navigator/blob/master/layers/spec/v4.5/layerformat.md
// Scores par tactique, sans hériter vers toutes les tactiques d'une technique et sans additionner ses sous-techniques.
export function calque(v, genre) {
  const couverture = genre === 'couverture';
  const techniques = v.cartes.flatMap(c => [...c.items, ...c.sans].map(x => ({ techniqueID: x.id, tactic: c.cle.replaceAll('_', '-'),
    score: couverture ? x.regles : x.n, enabled: true })));
  return { name: `Vigie · ${couverture ? 'couverture' : 'signaux'}${v.dossier ? ` · dossier #${v.dossier.id}` : ''}`,
    versions: { attack: VERSION, navigator: '5.3.2', layer: '4.5' }, domain: 'enterprise-attack',
    description: couverture ? 'Nombre de règles et détecteurs configurés par technique et tactique, indépendamment de la période ; les modes sont détaillés dans la console.' : `Signaux notés ${v.dossier ? 'dans les copies du dossier' : `sur ${v.periode}`} ; ${v.coupe ? `lecture limitée aux ${v.maximum} plus récents` : 'lecture complète'}.`,
    techniques, sorting: 3, hideDisabled: false, selectTechniquesAcrossTactics: false, selectSubtechniquesWithParent: false,
    layout: { layout: 'side', showID: true, showName: true, showAggregateScores: false, expandedSubtechniques: 'annotated' },
    gradient: { colors: ['#eeeeee', '#b45309'], minValue: 0, maxValue: Math.max(1, ...techniques.map(x => x.score)) } };
}
export function register(app, ctx) {
  const args = req => ({ db: ctx.db, engine: ctx.engine, now: ctx.now, role: req.moi.role, query: req.query });
  app.get('/attack/navigator.json', async (req, reply) => {
    const genre = req.query.calque == null ? 'observe' : str(req.query.calque);
    if (!['couverture', 'observe'].includes(genre) || optionsAttack(req.query).invalide) return reply.code(400).send({ erreur: 'Calque ou période invalide.' });
    const v = vueAttack(args(req));
    if (!v) return reply.code(404).send({ erreur: 'Dossier introuvable.' });
    return reply.header('Content-Disposition', `attachment; filename="vigie-attack-${genre}.json"`).type('application/json; charset=utf-8').send(calque(v, genre));
  });
  for (const chemin of ['/attack', '/attack/:technique']) app.get(chemin, async (req, reply) => {
    const id = req.params.technique == null ? null : filtreTechnique(req.params.technique);
    const v = req.params.technique != null && !id ? null : vueAttack({ ...args(req), id });
    return ctx.view(reply, req, v ? id ? 'attack-technique' : 'attack' : 'attack-introuvable',
      { page: 'attack', titre: id ? `${id} · ATT&CK · Vigie` : 'ATT&CK · Vigie', vue: v }, v ? 200 : 404);
  });
}
