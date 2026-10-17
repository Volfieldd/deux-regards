import fs from 'node:fs';
import path from 'node:path';
import { parseAllDocuments } from 'yaml';

// Règles au format Sigma (décision D20, recadrage du 17 octobre 2026) : sous-ensemble évalué sur les événements de la
// Vigie (champs : type, severity, composant, emetteur, confiance, sub, session, ip, ip_net, country, route, method,
// status, ua_family, detail.<chemin>).
//   - détection : sélections (carte = ET, liste de valeurs = OU), modificateurs contains, startswith, endswith, re, gte,
//     gt, lte, lt, exists, all ; condition : and, or, not, parenthèses, « 1 of x* », « all of x* », « 1 of them » ;
//   - corrélations (méta-règles Sigma) : event_count, value_count, temporal, sur une fenêtre glissante, par groupe ;
//   - bloc « vigie » propre au site : cas (DS…), entité visée, source unique (alerte immédiate) ou points (déposés sur
//     l'entité, quorum), réponse automatique, mode par défaut.
// Une règle mal écrite est refusée au chargement (le service ne démarre pas sur une règle fausse).

export const LEVELS = { informational: 'info', low: 'bas', medium: 'moyen', high: 'haut', critical: 'critique' };
export const POINTS = { info: 0, bas: 0.5, moyen: 1.5, haut: 3, critique: 5 };
const KINDS = ['ip', 'reseau', 'compte', 'session', 'appareil', 'site', 'vigie'];
const RESPONSES = ['revoquer_compte', 'geler_et_revoquer', 'bloquer_ip'];
const MODES = ['arret', 'observer', 'alerter', 'bloquer'];

export class RuleError extends Error {}

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

// Comparaison d'une valeur avec un motif, selon les modificateurs.
function compile(key, values) {
  const [field, ...mods] = key.split('|');
  const all = mods.includes('all');
  const list = (Array.isArray(values) ? values : [values]);
  if (mods.includes('re')) for (const v of list) { try { new RegExp(v); } catch { throw new RuleError(`expression régulière invalide : ${v}`); } }
  const one = v => {
    const op = mods.find(m => m !== 'all');
    return x => {
      if (op === 'exists') return (x != null) === Boolean(v);
      if (x == null) return v === null;
      if (Array.isArray(x)) return x.some(y => one(v)(y));
      if (op === 'contains') return String(x).toLowerCase().includes(String(v).toLowerCase());
      if (op === 'startswith') return String(x).toLowerCase().startsWith(String(v).toLowerCase());
      if (op === 'endswith') return String(x).toLowerCase().endsWith(String(v).toLowerCase());
      if (op === 're') return new RegExp(v).test(String(x));
      if (op === 'gte') return Number(x) >= Number(v);
      if (op === 'gt') return Number(x) > Number(v);
      if (op === 'lte') return Number(x) <= Number(v);
      if (op === 'lt') return Number(x) < Number(v);
      if (op) throw new RuleError(`modificateur non pris en charge : ${op}`);
      if (typeof v === 'boolean' || typeof v === 'number') return x === v;
      return String(x).toLowerCase() === String(v).toLowerCase();
    };
  };
  const tests = list.map(one);
  return (row, cache) => { const x = fieldOf(row, field, cache); return all ? tests.every(t => t(x)) : tests.some(t => t(x)); };
}
function selection(def) {
  if (Array.isArray(def)) { const parts = def.map(selection); return (r, c) => parts.some(p => p(r, c)); }
  if (!def || typeof def !== 'object') throw new RuleError('sélection : carte ou liste de cartes attendue');
  const parts = Object.entries(def).map(([k, v]) => compile(k, v));
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
  if (v.reponse && !RESPONSES.includes(v.reponse)) throw new RuleError(`${file} : réponse inconnue ${v.reponse}`);
  if (v.mode && !MODES.includes(v.mode)) throw new RuleError(`${file} : mode inconnu ${v.mode}`);
  return { cas: v.cas || null, entite, sourceUnique: v.source_unique === true, points: v.points ?? POINTS[gravite], reponse: v.reponse || null,
    mode: v.mode || 'observer', gravite, graviteEvenement: v.gravite === 'evenement', signal: v.signal !== false };
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
        if (c.type !== 'temporal' && !['gte', 'gt', 'eq', 'lte'].some(k => k in cond)) throw new RuleError(`${file} : condition de corrélation attendue (gte…)`);
        if (c.type === 'value_count' && !cond.field) throw new RuleError(`${file} : value_count demande condition.field`);
        correlations.push({ ...base, type: c.type, rules: [].concat(c.rules || []), groupBy: [].concat(c['group-by'] || []), span: timespan(c.timespan), cond, ...vigieBlock(doc, file) });
        continue;
      }
      const det = doc.detection || {};
      const selNames = Object.keys(det).filter(k => k !== 'condition');
      if (!selNames.length || !det.condition) throw new RuleError(`${file} : detection et condition attendues`);
      const sels = Object.fromEntries(selNames.map(n => [n, selection(det[n])]));
      const cond = condition(det.condition, selNames);
      const match = row => { const cache = {}, memo = {}; return cond(n => (memo[n] ??= sels[n](row, cache))); };
      rules.push({ ...base, match, generate: doc.generate !== false, ...vigieBlock(doc, file) });
    }
  }
  const known = new Set(rules.map(r => r.name));
  for (const c of correlations) for (const r of c.rules) if (!known.has(r)) throw new RuleError(`${c.file} : corrélation sur une règle inconnue « ${r} »`);
  return { rules, correlations };
}

// État des corrélations (fenêtres glissantes en mémoire, bornées) : renvoie les corrélations satisfaites par cet
// événement, avec le groupe et la preuve (numéros des événements).
export function createCorrelator(correlations, { now = Date.now, maxGroups = 10_000 } = {}) {
  const state = new Map();           // nom → Map(groupe → { hits: [{t, seq, v, rule}], fired })
  const groupKey = (c, row) => c.groupBy.map(f => String(fieldOf(row, f) ?? '')).join('|');
  return function feed(row, matched) {
    const t = now();
    const out = [];
    for (const c of correlations) {
      const which = c.rules.filter(r => matched.has(r));
      if (!which.length) continue;
      const key = groupKey(c, row);
      if (c.groupBy.length && !key.replace(/\|/g, '')) continue;
      let m = state.get(c.name);
      if (!m) { m = new Map(); state.set(c.name, m); }
      let g = m.get(key);
      if (!g) { if (m.size >= maxGroups) m.delete(m.keys().next().value); g = { hits: [], fired: 0 }; m.set(key, g); }
      g.hits = g.hits.filter(h => t - h.t <= c.span);
      for (const r of which) g.hits.push({ t, seq: row.seq, rule: r, v: c.cond.field ? fieldOf(row, c.cond.field) : null });
      if (g.hits.length > 1000) g.hits = g.hits.slice(-1000);
      const n = c.type === 'event_count' ? g.hits.length
        : c.type === 'value_count' ? new Set(g.hits.map(h => JSON.stringify(h.v)).filter(v => v !== 'null')).size
          : new Set(g.hits.map(h => h.rule)).size === c.rules.length ? 1 : 0;
      const ok = c.type === 'temporal' ? n === 1 : ('gte' in c.cond ? n >= c.cond.gte : 'gt' in c.cond ? n > c.cond.gt : 'eq' in c.cond ? n === c.cond.eq : n <= c.cond.lte);
      // Une fois par fenêtre et par groupe (pas un signal par événement suivant).
      if (ok && t - g.fired > c.span) { g.fired = t; out.push({ correlation: c, key, valeur: n, evenements: g.hits.map(h => h.seq).slice(-50) }); }
    }
    return out;
  };
}
