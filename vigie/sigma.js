import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { parseAllDocuments } from 'yaml';
import { estPhaseOuMarqueur, NATURES } from './phases.js';

// Règles au format Sigma (décision D20, recadrage du 17 octobre 2026) : sous-ensemble évalué sur les événements de la
// Vigie (champs : type, severity, composant, emetteur, confiance, sub, session, ip, ip_net, country, route, method,
// status, ua_family, detail.<chemin>).
//   - détection : sélections (carte = ET, liste de valeurs = OU), modificateurs contains, startswith, endswith, re, gte,
//     gt, lte, lt, exists, all ; condition : and, or, not, parenthèses, « 1 of x* », « all of x* », « 1 of them » ;
//   - corrélations (méta-règles Sigma) : event_count, value_count (un champ, ou une liste de champs comptés ensemble),
//     temporal, sur une fenêtre glissante, par groupe ;
//   - bloc « vigie » propre au site : cas (DS…), entité visée, source unique (alerte immédiate) ou points (déposés sur
//     l'entité, quorum), réponse automatique, mode par défaut.
// Une règle mal écrite est refusée au chargement (le service ne démarre pas sur une règle fausse).

export const LEVELS = { informational: 'info', low: 'bas', medium: 'moyen', high: 'haut', critical: 'critique' };
export const POINTS = { info: 0, bas: 0.5, moyen: 1.5, haut: 3, critique: 5 };
const KINDS = ['ip', 'reseau', 'compte', 'session', 'appareil', 'site', 'vigie'];
const RESPONSES = ['revoquer_compte', 'geler_et_revoquer', 'bloquer_ip', 'suspendre_acces', 'verifier_identite'];
const MODES = ['arret', 'observer', 'alerter', 'bloquer'];

export class RuleError extends Error {}
// Expression régulière arrêtée au bout de son délai (bloc vigie « delai_re_ms ») : l'événement ne correspond pas.
export class RegexTimeout extends Error {}

// Valeur d'un champ, « detail.a.b » compris (detail est du JSON dans la ligne).
export function fieldOf(row, name, cache = {}) {
  if (!name.startsWith('detail.')) return row[name] ?? null;
  cache.detail ??= (() => { try { return row.detail ? JSON.parse(row.detail) : {}; } catch { return {}; } })();
  let v = cache.detail;
  for (const k of name.slice(7).split('.')) { if (v == null || typeof v !== 'object' || !Object.hasOwn(v, k)) return null; v = v[k]; }
  return v ?? null;
}

const durations = { s: 1e3, m: 60e3, h: 3600e3, d: 864e5 };
export function timespan(s) {
  const m = /^(\d+)([smhd])$/.exec(String(s || ''));
  if (!m) throw new RuleError(`timespan invalide : ${s}`);
  return Number(m[1]) * durations[m[2]];
}

// Comparaison d'une valeur avec un motif, selon les modificateurs (vérifiés au chargement, expressions compilées une
// fois : une règle fausse empêche le démarrage, jamais une erreur à chaque événement).
// Délai facultatif des expressions régulières (arbitrage NC5) : avec « delai_re_ms », chaque essai tourne dans un
// contexte isolé arrêté au bout du délai (retour arrière catastrophique) ; coût d'environ 0,25 ms par essai, d'où un
// réglage par règle, pour les expressions venues d'ailleurs ou difficiles à relire.
const OPS = new Set(['contains', 'startswith', 'endswith', 're', 'gte', 'gt', 'lte', 'lt', 'exists']);
const RE_SCRIPT = new vm.Script('re.test(s)');
function timed(re, ms) {
  const ctx = vm.createContext({ re, s: '' });
  return s => {
    ctx.s = s;
    try { return RE_SCRIPT.runInContext(ctx, { timeout: ms }); } catch (err) {
      if (err?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') throw new RegexTimeout(`expression ${re.source.slice(0, 80)} arrêtée après ${ms} ms`);
      throw err;
    }
  };
}
function compile(key, values, { reDelay = null } = {}) {
  const [field, ...mods] = key.split('|');
  const all = mods.includes('all');
  const ops = mods.filter(m => m !== 'all');
  if (ops.length > 1 || (ops[0] && !OPS.has(ops[0]))) throw new RuleError(`modificateur non pris en charge : ${mods.join('|')}`);
  const op = ops[0];
  const list = (Array.isArray(values) ? values : [values]);
  const regexes = new Map();
  if (op === 're') {
    for (const v of list) {
      let re;
      try { re = new RegExp(v); } catch { throw new RuleError(`expression régulière invalide : ${v}`); }
      regexes.set(v, reDelay ? timed(re, reDelay) : s => re.test(s));
    }
  }
  const one = v => {
    return x => {
      if (op === 'exists') return (x != null) === Boolean(v);
      if (x == null) return v === null;
      if (Array.isArray(x)) return x.some(y => one(v)(y));
      if (op === 'contains') return String(x).toLowerCase().includes(String(v).toLowerCase());
      if (op === 'startswith') return String(x).toLowerCase().startsWith(String(v).toLowerCase());
      if (op === 'endswith') return String(x).toLowerCase().endsWith(String(v).toLowerCase());
      if (op === 're') return regexes.get(v)(String(x).slice(0, 4000));
      if (op === 'gte') return Number(x) >= Number(v);
      if (op === 'gt') return Number(x) > Number(v);
      if (op === 'lte') return Number(x) <= Number(v);
      if (op === 'lt') return Number(x) < Number(v);
      if (typeof v === 'boolean' || typeof v === 'number') return x === v;
      return String(x).toLowerCase() === String(v).toLowerCase();
    };
  };
  const tests = list.map(one);
  return (row, cache) => { const x = fieldOf(row, field, cache); return all ? tests.every(t => t(x)) : tests.some(t => t(x)); };
}
function selection(def, opts) {
  if (Array.isArray(def)) { const parts = def.map(d => selection(d, opts)); return (r, c) => parts.some(p => p(r, c)); }
  if (!def || typeof def !== 'object') throw new RuleError('sélection : carte ou liste de cartes attendue');
  const parts = Object.entries(def).map(([k, v]) => compile(k, v, opts));
  return (r, c) => parts.every(p => p(r, c));
}

// Condition : and, or, not, parenthèses, « 1 of x* », « all of x* », « 1 of them », « all of them ».
function condition(text, names) {
  const tokens = String(text).match(/\(|\)|[^\s()]+/g) || [];
  let i = 0;
  const peek = () => tokens[i];
  const group = pattern => {
    const re = pattern === 'them' ? /.*/ : new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    const list = names.filter(n => re.test(n));
    if (!list.length) throw new RuleError(`condition : aucune sélection pour « ${pattern} »`);
    return list;
  };
  function primary() {
    const t = tokens[i++];
    if (t === '(') { const e = or(); if (tokens[i++] !== ')') throw new RuleError('condition : parenthèse manquante'); return e; }
    if (t === 'not') { const e = primary(); return s => !e(s); }
    if (t === '1' || t === 'all') {
      if (tokens[i++] !== 'of') throw new RuleError('condition : « of » attendu');
      const list = group(tokens[i++]);
      return t === 'all' ? s => list.every(n => s(n)) : s => list.some(n => s(n));
    }
    if (!names.includes(t)) throw new RuleError(`condition : sélection inconnue « ${t} »`);
    return s => s(t);
  }
  function and() { let e = primary(); while (peek() === 'and') { i++; const r = primary(), l = e; e = s => l(s) && r(s); } return e; }
  function or() { let e = and(); while (peek() === 'or') { i++; const r = and(), l = e; e = s => l(s) || r(s); } return e; }
  const e = or();
  if (i !== tokens.length) throw new RuleError(`condition : texte en trop après « ${tokens[i - 1]} »`);
  return e;
}

function vigieBlock(doc, file) {
  const v = doc.vigie || {};
  const gravite = LEVELS[doc.level];
  if (!gravite) throw new RuleError(`${file} : level attendu (${Object.keys(LEVELS).join(', ')})`);
  const entite = v.entite || { kind: 'compte', champ: 'sub' };
  if (!KINDS.includes(entite.kind)) throw new RuleError(`${file} : entité inconnue ${entite.kind}`);
  // Préfixe facultatif de la clé (« acces: » : l'accès 12 d'une galerie privée s'écrit « acces:12 », jamais « 12 » seul,
  // qui ne dirait pas ce qu'il désigne dans la console).
  if (entite.prefixe != null && !/^[a-z_]{1,20}:$/.test(String(entite.prefixe))) throw new RuleError(`${file} : préfixe d'entité invalide ${entite.prefixe}`);
  if (v.reponse === 'suspendre_acces' && !(entite.kind === 'site' && entite.prefixe === 'acces:')) throw new RuleError(`${file} : suspendre_acces vise un accès (entité site, préfixe « acces: »)`);
  if (v.reponse && !RESPONSES.includes(v.reponse)) throw new RuleError(`${file} : réponse inconnue ${v.reponse}`);
  if (v.mode && !MODES.includes(v.mode)) throw new RuleError(`${file} : mode inconnu ${v.mode}`);
  // Les points ne se déposent que sur une adresse, un réseau, un compte, une session ou un appareil : une règle sur le site
  // ou la Vigie qui n'ouvrirait pas d'alerte elle-même ne servirait à rien (revue du 17 octobre 2026).
  if (['site', 'vigie'].includes(entite.kind) && v.source_unique !== true && v.signal !== false) throw new RuleError(`${file} : une règle sur l'entité ${entite.kind} doit être source_unique`);
  // Date d'expiration facultative (arbitrage NC5) : une règle temporaire (pendant un incident, une campagne) cesse
  // d'elle-même ; elle reste listée, marquée expirée. Date seule : expire à la fin de ce jour (UTC).
  let expireAt = null;
  if (v.expire != null) {
    const s = String(v.expire);
    expireAt = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T23:59:59.999Z`) : Date.parse(s);
    if (!Number.isFinite(expireAt)) throw new RuleError(`${file} : expire attend une date (AAAA-MM-JJ) : ${s}`);
  }
  // Projection propre aux dossiers (étude docs/etudes/vigie-dossiers.md, 4.5 ; D32) : phase ou marqueur quand la technique
  // trompe, nature (indice, preuve) ; sans effet sur la détection ni sur les étiquettes ATT&CK.
  if (v.phase_dossier != null && !estPhaseOuMarqueur(v.phase_dossier)) throw new RuleError(`${file} : phase_dossier inconnue ${v.phase_dossier}`);
  if (v.nature_dossier != null && !NATURES.includes(v.nature_dossier)) throw new RuleError(`${file} : nature_dossier attendue (${NATURES.join(', ')})`);
  const reDelay = v.delai_re_ms == null ? null : Number(v.delai_re_ms);
  if (reDelay != null && !(Number.isInteger(reDelay) && reDelay >= 1 && reDelay <= 1000)) throw new RuleError(`${file} : delai_re_ms de 1 à 1000`);
  // contexte: true (arbitrage NC3-1) : les points de la règle comptent dans le score, jamais comme une source du quorum
  // (le même fait déjà vu par une autre source, comme les erreurs 404 vues à la fois par le site et la bordure).
  return { contexte: v.contexte === true, cas: v.cas || null, entite, sourceUnique: v.source_unique === true, points: v.points ?? POINTS[gravite], reponse: v.reponse || null,
    mode: v.mode || 'observer', gravite, graviteEvenement: v.gravite === 'evenement', signal: v.signal !== false, expireAt, reDelay,
    phase_dossier: v.phase_dossier ?? null, nature_dossier: v.nature_dossier ?? null };
}

// Charge toutes les règles d'un dossier (un fichier peut contenir plusieurs documents YAML).
export function loadRules(dir) {
  const rules = [], correlations = [];
  const names = new Set();
  for (const file of fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort()) {
    for (const d of parseAllDocuments(fs.readFileSync(path.join(dir, file), 'utf8'))) {
      if (d.errors.length) throw new RuleError(`${file} : ${d.errors[0].message}`);
      const doc = d.toJSON();
      if (!doc) continue;
      const name = doc.name || doc.id;
      if (!name || names.has(name)) throw new RuleError(`${file} : nom de règle absent ou en double (${name})`);
      names.add(name);
      const base = { name, id: doc.id || null, title: doc.title || name, tags: doc.tags || [], file };
      if (doc.correlation) {
        const c = doc.correlation;
        if (!['event_count', 'value_count', 'temporal'].includes(c.type)) throw new RuleError(`${file} : corrélation ${c.type} non prise en charge`);
        const cond = c.condition || {};
        if (c.type !== 'temporal' && !['gte', 'gt'].some(k => k in cond)) throw new RuleError(`${file} : condition de corrélation attendue (gte ou gt ; lte et eq ne sont pas pris en charge)`);
        if (c.type === 'value_count' && !cond.field) throw new RuleError(`${file} : value_count demande condition.field`);
        // Extension au format Sigma : condition.field peut être une liste de champs, comptés ensemble (valeur distincte = le
        // couple, par exemple detail.objet et detail.id : le message 12 et la fiche 12 sont deux lectures).
        if (Array.isArray(cond.field) && (!cond.field.length || !cond.field.every(f => typeof f === 'string' && f))) throw new RuleError(`${file} : condition.field attend un champ ou une liste de champs`);
        correlations.push({ ...base, type: c.type, rules: [].concat(c.rules || []), groupBy: [].concat(c['group-by'] || []), span: timespan(c.timespan), cond, ...vigieBlock(doc, file) });
        continue;
      }
      const det = doc.detection || {};
      const selNames = Object.keys(det).filter(k => k !== 'condition');
      if (!selNames.length || !det.condition) throw new RuleError(`${file} : detection et condition attendues`);
      const vb = vigieBlock(doc, file);
      const sels = Object.fromEntries(selNames.map(n => [n, selection(det[n], { reDelay: vb.reDelay })]));
      const cond = condition(det.condition, selNames);
      const match = row => { const cache = {}, memo = {}; return cond(n => (memo[n] ??= sels[n](row, cache))); };
      rules.push({ ...base, match, generate: doc.generate !== false, ...vb });
    }
  }
  const known = new Set(rules.map(r => r.name));
  for (const c of correlations) for (const r of c.rules) if (!known.has(r)) throw new RuleError(`${c.file} : corrélation sur une règle inconnue « ${r} »`);
  return { rules, correlations };
}

// État des corrélations (fenêtres glissantes en mémoire) : renvoie les corrélations satisfaites par cet événement, avec
// le groupe, la preuve (numéros des événements) et les sources qui y ont contribué. Mémoire bornée (revue du 17 octobre
// 2026) : valeurs gardées en empreinte courte, budget global de points, groupes oubliés du moins récemment touché au
// plus ancien, fenêtres échues retirées par prune(). Un résumé de l'émetteur (detail.nombre) compte pour son nombre.
export function createCorrelator(correlations, { now = Date.now, maxGroups = 10_000, maxHits = 200_000 } = {}) {
  const state = new Map();           // nom → Map(groupe → { hits: [{t, seq, v, rule, source, w}], fired })
  let total = 0;
  const groupKey = (c, row) => c.groupBy.map(f => String(fieldOf(row, f) ?? '')).join('|');
  const short = v => (v == null ? null : crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16));
  // Valeur comptée par value_count : un champ, ou plusieurs ensemble (null si tous manquent : comme un champ absent).
  // Un champ seul garde exactement son empreinte d'avant (les fenêtres en cours ne changent pas de valeurs).
  const valueOf = (field, row) => {
    if (!Array.isArray(field)) return short(fieldOf(row, field));
    const vals = field.map(f => fieldOf(row, f));
    return vals.every(v => v == null) ? null : short(vals);
  };
  const weight = row => { const n = Number(fieldOf(row, 'detail.nombre')); return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n) + 1, 1000) : 1; };
  const trim = (g, t, span) => { const before = g.hits.length; g.hits = g.hits.filter(h => t - h.t <= span); total -= before - g.hits.length; };
  function feed(row, matched, { t = now(), source = null } = {}) {
    const out = [];
    for (const c of correlations) {
      if (c.expireAt && t > c.expireAt) continue;
      const which = c.rules.filter(r => matched.has(r));
      if (!which.length) continue;
      const key = groupKey(c, row);
      if (c.groupBy.length && !key.replace(/\|/g, '')) continue;
      let m = state.get(c.name);
      if (!m) { m = new Map(); state.set(c.name, m); }
      let g = m.get(key);
      if (g) m.delete(key);                                     // remis en fin : le moins récemment touché part d'abord
      else {
        if (m.size >= maxGroups) { const [k0, old] = m.entries().next().value; total -= old.hits.length; m.delete(k0); }
        g = { hits: [], fired: 0 };
      }
      m.set(key, g);
      trim(g, t, c.span);
      // temporal : un point par règle satisfaite ; sinon un point par événement, même s'il satisfait plusieurs règles.
      for (const r of c.type === 'temporal' ? which : [which[0]]) {
        g.hits.push({ t, seq: row.seq, rule: r, source, v: c.cond.field ? valueOf(c.cond.field, row) : null, w: weight(row) });
        total += 1;
      }
      if (g.hits.length > 1000) { total -= g.hits.length - 1000; g.hits = g.hits.slice(-1000); }
      if (total > maxHits) prune(t, true);
      const n = c.type === 'event_count' ? g.hits.reduce((a, h) => a + h.w, 0)
        : c.type === 'value_count' ? new Set(g.hits.map(h => h.v).filter(v => v != null)).size
          : new Set(g.hits.map(h => h.rule)).size === c.rules.length ? 1 : 0;
      const ok = c.type === 'temporal' ? n === 1 : ('gte' in c.cond ? n >= c.cond.gte : n > c.cond.gt);
      // Satisfaite : un signal, puis le compte repart de zéro (jamais un signal par événement suivant ; mais une attaque qui
      // continue la satisfait de nouveau et la réponse reprend, même si la règle est passée en Bloquer entre-temps ou si
      // la décision a été levée : avant, plus rien pendant toute la fenêtre, constat du jeu d'attaques E2).
      if (ok) {
        g.fired = t;
        out.push({ correlation: c, key, valeur: n, evenements: g.hits.map(h => h.seq).filter(Boolean).slice(-50),
          sources: [...new Set(g.hits.map(h => h.source).filter(Boolean))].sort() });
        total -= g.hits.length;
        g.hits = [];
      }
    }
    return out;
  }
  // Retire les fenêtres échues ; sous pression (budget dépassé), retire aussi les groupes les moins récemment touchés
  // jusqu'à revenir sous 90 % du budget.
  function prune(t = now(), pressure = false) {
    for (const c of correlations) {
      const m = state.get(c.name);
      if (!m) continue;
      for (const [k, g] of m) {
        trim(g, t, c.span);
        if (!g.hits.length && t - g.fired > c.span) m.delete(k);
      }
    }
    if (!pressure) return;
    for (const c of correlations) {
      const m = state.get(c.name);
      if (!m) continue;
      for (const [k, g] of m) { if (total <= maxHits * 0.9) return; total -= g.hits.length; m.delete(k); }
    }
  }
  feed.prune = prune;
  feed.size = () => total;
  return feed;
}
