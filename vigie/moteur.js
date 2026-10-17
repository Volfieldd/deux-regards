import { fileURLToPath } from 'node:url';
import { pointsOf, THRESHOLDS, HALF_LIFE_MIN, SOURCE_MIN, QUORUM, sourceOf, MODES } from './poids.js';
import { rank } from './vocabulaire.js';
import { loadRules, createCorrelator, fieldOf } from './sigma.js';
import { createDetectors, createChains } from './detecteurs.js';

// Moteur de détection de la Vigie (phases C1 et C2, recadrage du 17 octobre 2026, concepts de marlinOS) :
//   - entités (adresse, réseau, compte, session) et score composite qui perd la moitié de sa valeur chaque heure,
//     contribution par source (site, Zitadel, bordure, contrôles de la Vigie), liens entre entités ;
//   - points de base par événement (poids.js), puis signaux : règles Sigma et corrélations (regles/*.yml, D20),
//     détecteurs comportementaux (detecteurs.js), listes de menaces (menaces.js, sans compter comme une source) ;
//   - alerte de score seulement si le seuil est franchi ET que deux sources y contribuent (quorum, D18) ; une règle
//     « source_unique » (preuve sûre) ouvre son alerte tout de suite ;
//   - une alerte par règle et par entité tant qu'elle est ouverte ; mode par règle : arrêt, observer, alerter, bloquer ;
//   - réponses automatiques prudentes : jamais une adresse liée à un compte, jamais une adresse de confiance.

const DECAY = ms => 0.5 ** (ms / (HALF_LIFE_MIN * 60e3));
const IGNORED = new Set(['vigie_alerte', 'vigie_decision', 'vigie_interrupteur', 'vigie_signal']);
const parse = s => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const RULES_DIR = fileURLToPath(new URL('./regles/', import.meta.url));

export function createEngine({ store, decisions, switches, threats = null, now = Date.now, log, rulesDir = RULES_DIR }) {
  const { db, setting } = store;
  const { rules, correlations } = loadRules(rulesDir);
  const correlate = createCorrelator(correlations, { now });
  const detectors = createDetectors({ store, now });
  const chain = createChains({ now });
  // Registre des règles (pour les modes) : quorum, règles Sigma qui produisent un signal, détecteurs.
  const REGISTRY = {
    'entite.score': { cas: 'quorum', mode: 'observer', titre: 'Score d’une entité au-dessus du seuil, confirmé par deux sources' },
    ...Object.fromEntries([...rules.filter(r => r.generate && r.signal), ...correlations].map(r => [`sigma.${r.name}`, { cas: r.cas, mode: r.mode, titre: r.title, sourceUnique: r.sourceUnique }])),
    ...Object.fromEntries(['premiere_apparition', 'heure_inhabituelle', 'vitesse', 'voyage_impossible', 'pivot_identifiants', 'role_incoherent', 'exploration_lente', 'chaine_attaque', 'silence', 'menaces']
      .map(n => [`detecteur.${n}`, { cas: { premiere_apparition: 'DS4', heure_inhabituelle: 'DS18', vitesse: 'DS17', voyage_impossible: 'DS3', pivot_identifiants: 'DS25', role_incoherent: 'DS10', exploration_lente: 'DS15', chaine_attaque: 'DS23', silence: 'DS24', menaces: 'D22' }[n], mode: 'observer', titre: n.replaceAll('_', ' ') }])),
  };
  const q = {
    entity: db.prepare('SELECT * FROM entities WHERE kind = ? AND key = ?'),
    save: db.prepare(`INSERT INTO entities (kind, key, score, at, contributions, signaux, premiere, derniere) VALUES (@kind, @key, @score, @at, @contributions, @signaux, @premiere, @derniere)
      ON CONFLICT (kind, key) DO UPDATE SET score = @score, at = @at, contributions = @contributions, signaux = @signaux, derniere = @derniere`),
    link: db.prepare(`INSERT INTO entity_links (a_kind, a_key, b_kind, b_key, derniere) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (a_kind, a_key, b_kind, b_key) DO UPDATE SET derniere = excluded.derniere`),
    linkedSub: db.prepare("SELECT 1 FROM entity_links WHERE ((a_kind = 'ip' AND a_key = ? AND b_kind = 'compte') OR (b_kind = 'ip' AND b_key = ? AND a_kind = 'compte')) AND derniere > ? LIMIT 1"),
    open: db.prepare("SELECT * FROM alerts WHERE regle = ? AND entite_kind = ? AND entite_key = ? AND statut != 'close' ORDER BY id DESC LIMIT 1"),
    insert: db.prepare(`INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, premiere, derniere, compteur, score, sources)
      VALUES (@regle, @cas, @entite_kind, @entite_key, @gravite, @mode, @t, @t, 1, @score, @sources)`),
    update: db.prepare('UPDATE alerts SET derniere = ?, compteur = compteur + 1, gravite = ?, score = COALESCE(?, score), sources = ? WHERE id = ?'),
    respond: db.prepare('UPDATE alerts SET reponse = ? WHERE id = ?'),
    addEvent: db.prepare('INSERT OR IGNORE INTO alert_events (alert_id, seq) VALUES (?, ?)'),
    lastSite: db.prepare("SELECT MAX(recu_a) FROM events WHERE composant LIKE 'site%'").pluck(),
  };

  const modes = () => setting.get('regles_modes', {});
  const modeOf = id => { const m = modes()[id]; return MODES.includes(m) ? m : REGISTRY[id]?.mode || 'observer'; };
  const thresholds = () => ({ ...THRESHOLDS, ...setting.get('seuils', {}) });
  const trusted = () => new Set(setting.get('adresses_confiance', []));

  function current(kind, key, t = now()) {
    const row = q.entity.get(kind, key);
    if (!row) return null;
    const f = DECAY(t - row.at);
    const contributions = Object.fromEntries(Object.entries(parse(row.contributions)).map(([s, v]) => [s, v * f]).filter(([, v]) => v >= 0.01));
    return { ...row, score: row.score * f, contributions, at: t };
  }
  const sourcesOf = e => Object.entries(e.contributions).filter(([s, v]) => s !== 'menaces' && v >= SOURCE_MIN).map(([s]) => s).sort();

  function deposit(kind, key, points, source, t) {
    const e = current(kind, key, t) || { kind, key, score: 0, contributions: {}, signaux: 0, premiere: t, derniere: t };
    e.score += points;
    if (source) e.contributions[source] = (e.contributions[source] || 0) + points;
    e.signaux += 1; e.derniere = t; e.at = t;
    q.save.run({ ...e, contributions: JSON.stringify(e.contributions) });
    return e;
  }
  // Points sur une entité, puis contrôle du seuil et du quorum.
  function score(entite, points, source, row) {
    if (!points || !entite?.key || !['ip', 'reseau', 'compte', 'session', 'appareil'].includes(entite.kind)) return;
    const t = now();
    const e = deposit(entite.kind, entite.key, points, source, t);
    const limit = thresholds()[entite.kind];
    if (!limit || e.score < limit) return;
    const sources = sourcesOf(e);
    if (sources.length < QUORUM) return;
    raise('entite.score', entite, e.score >= 2 * limit ? 'haut' : 'moyen', row, { score: Math.round(e.score * 10) / 10, sources });
  }

  function entitiesOf(row) {
    const out = [];
    if (row.ip) out.push({ kind: 'ip', key: row.ip });
    if (row.ip_net && row.ip_net !== row.ip) out.push({ kind: 'reseau', key: row.ip_net });
    if (row.sub) out.push({ kind: 'compte', key: row.sub });
    if (row.session) out.push({ kind: 'session', key: row.session });
    return out;
  }
  // Entité visée par une règle : { kind, champ } (valeur du champ), { kind, valeur } (fixe), « sinon » si le champ manque.
  function entityOf(def, row) {
    const e = def.entite;
    if (e.valeur) return { kind: e.kind, key: String(e.valeur) };
    const v = fieldOf(row, e.champ || 'sub');
    if (v != null && v !== '') return { kind: e.kind, key: String(v) };
    return e.sinon ? { kind: 'site', key: String(e.sinon) } : null;
  }

  function raise(regle, entite, gravite, row, { score = null, sources = [], reponse = null } = {}) {
    const mode = modeOf(regle);
    if (mode === 'arret') return null;
    const t = now();
    const a = q.open.get(regle, entite.kind, entite.key);
    if (a) {
      const g = rank(gravite) > rank(a.gravite) ? gravite : a.gravite;
      const merged = [...new Set([...parse(a.sources), ...sources])].sort();
      q.update.run(t, g, score, JSON.stringify(merged), a.id);
      if (row?.seq) q.addEvent.run(a.id, row.seq);
      return a.id;
    }
    const id = Number(q.insert.run({ regle, cas: REGISTRY[regle]?.cas || null, entite_kind: entite.kind, entite_key: entite.key, gravite, mode, t, score, sources: JSON.stringify(sources) }).lastInsertRowid);
    if (row?.seq) q.addEvent.run(id, row.seq);
    store.own('vigie_alerte', { emetteur: `vigie/moteur.js · ${regle}`, sub: entite.kind === 'compte' ? entite.key : undefined,
      detail: { action: 'ouverte', id, regle, cas: REGISTRY[regle]?.cas || null, entite, gravite, mode, sources, score } });
    if (mode === 'bloquer') respond(id, regle, entite, reponse);
    return id;
  }

  // Réponses automatiques (mode « bloquer », interrupteur des blocages en marche), jamais en double.
  function respond(id, regle, entite, reponse) {
    if (!switches.isOn('blocages')) { q.respond.run('interrupteur des blocages arrêté : aucune réponse', id); return; }
    const par = `Vigie · règle ${regle}`;
    const active = decisions.active();
    const done = [];
    const make = (kind, cible, duree, extra = {}) => {
      if (active.some(d => d.kind === kind && (d.cible === cible || d.cible === `${cible}/32` || d.cible === `${cible}/128`))) return;
      try { decisions.create({ kind, cible, duree, par, auto: true, motif: `alerte #${id}`, ...extra }); done.push(`${kind} ${cible}`); } catch (err) { done.push(`${kind} refusé : ${err.message}`); }
    };
    const what = reponse || (regle === 'entite.score' && entite.kind === 'ip' ? 'bloquer_ip' : null);
    if (what === 'revoquer_compte' && entite.kind === 'compte') make('revoquer_compte', entite.key, '48h');
    else if (what === 'geler_et_revoquer' && entite.kind === 'compte') { make('geler', entite.key, '24h'); make('revoquer_compte', entite.key, '48h'); }
    else if (what === 'bloquer_ip' && entite.kind === 'ip') {
      // Jamais une adresse de confiance, ni une adresse vue avec un compte (30 jours) : on ne s'enferme pas dehors.
      if (trusted().has(entite.key)) done.push('adresse de confiance : aucune réponse');
      else if (q.linkedSub.get(entite.key, entite.key, now() - 30 * 864e5)) done.push('adresse liée à un compte : aucun blocage automatique');
      else make('bloquer', entite.key, '24h', { portee: 'tout' });
    }
    q.respond.run(done.join(' ; ') || 'aucune réponse prévue pour cette règle', id);
  }

  // Un signal (règle Sigma, corrélation, détecteur) : noté dans la chaîne, puis alerte directe (preuve sûre) ou points.
  function signal({ regle, titre, cas, entite, gravite, points, sourceUnique, reponse, tags = [], detail = {} }, row, sources) {
    if (!entite?.key || modeOf(regle) === 'arret') return;
    store.own('vigie_signal', { emetteur: `vigie/moteur.js · ${regle}`, sub: entite.kind === 'compte' ? entite.key : undefined, reference: row?.seq ? `events#${row.seq}` : undefined,
      detail: { regle, titre, cas, entite, gravite, tags, sources, ...detail } });
    if (sourceUnique) raise(regle, entite, gravite, row, { sources, reponse });
    else for (const s of sources.length ? sources : [null]) { score(entite, points / Math.max(sources.length, 1), s, row); }
    if (tags.length && chain(entite, tags)) raise('detecteur.chaine_attaque', entite, 'critique', row, { sources });
  }

  function processRow(row) {
    if (IGNORED.has(row.type)) return;
    const t = now();
    const source = sourceOf(row);
    const sources = source ? [source] : [];
    // Liens entre entités vues ensemble.
    const ents = entitiesOf(row);
    for (let i = 0; i < ents.length; i++) for (let j = i + 1; j < ents.length; j++) q.link.run(ents[i].kind, ents[i].key, ents[j].kind, ents[j].key, t);
    // Points de base.
    const base = pointsOf(row);
    if (base && source) for (const e of ents) score(e, base, source, row);
    // Listes de menaces : points sur l'adresse, sans compter comme une source.
    if (row.ip && threats) {
      const labels = threats.labels(row.ip);
      if (labels.length && modeOf('detecteur.menaces') !== 'arret') {
        for (const l of labels) deposit('ip', row.ip, { spamhaus_drop: 3, feodo: 3, tor: 1 }[l] || 1, 'menaces', t);
      }
    }
    // Règles Sigma et corrélations.
    const matched = new Set();
    for (const r of rules) {
      if (!r.match(row)) continue;
      matched.add(r.name);
      if (!r.generate || !r.signal) continue;
      signal({ regle: `sigma.${r.name}`, titre: r.title, cas: r.cas, entite: entityOf(r, row), gravite: r.graviteEvenement ? row.severity : r.gravite, points: r.points,
        sourceUnique: r.sourceUnique, reponse: r.reponse, tags: r.tags }, row, sources);
    }
    for (const f of correlate(row, matched)) {
      const c = f.correlation;
      signal({ regle: `sigma.${c.name}`, titre: c.title, cas: c.cas, entite: entityOf(c, row), gravite: c.gravite, points: c.points, sourceUnique: c.sourceUnique,
        reponse: c.reponse, tags: c.tags, detail: { groupe: f.key, valeur: f.valeur, evenements: f.evenements } }, row, sources);
    }
    // Détecteurs comportementaux.
    for (const s of detectors.onEvent(row)) signal({ regle: `detecteur.${s.nom}`, titre: s.nom.replaceAll('_', ' '), ...s, detail: s.detail }, row, sources);
  }

  function process(rows) {
    if (!switches.isOn('detection')) return;
    for (const row of rows) {
      try { db.transaction(() => processRow(row)).immediate(); } catch (err) { log?.error({ err: err.message, type: row.type }, 'Vigie : moteur'); }
    }
  }

  // Tâches périodiques : détecteurs sur l'historique (exploration lente), site silencieux (DS24).
  let silent = false;
  function tick() {
    if (!switches.isOn('detection')) return;
    for (const s of detectors.periodic()) signal({ regle: `detecteur.${s.nom}`, titre: s.nom.replaceAll('_', ' '), ...s }, null, ['site']);
    const last = q.lastSite.get();
    if (last && now() - last > 3 * 60e3) {
      if (!silent) { silent = true; raise('detecteur.silence', { kind: 'site', key: 'battement' }, 'haut', null, { sources: ['vigie'] }); }
    } else silent = false;
  }

  function top(limit = 20) {
    const t = now();
    return db.prepare('SELECT kind, key FROM entities WHERE derniere > ?').all(t - 7 * 864e5).map(r => current(r.kind, r.key, t))
      .map(e => ({ ...e, sources: sourcesOf(e) })).filter(e => e.score >= 0.1).sort((a, b) => b.score - a.score).slice(0, limit);
  }
  function purge() {
    db.prepare('DELETE FROM entities WHERE derniere < ?').run(now() - 30 * 864e5);
    db.prepare('DELETE FROM entity_links WHERE derniere < ?').run(now() - 90 * 864e5);
  }
  function classify(id, { classement, note = '', par, statut = 'close' }) {
    if (!['incident', 'faux_positif', 'test', null].includes(classement)) throw new Error('classement : incident, faux_positif ou test');
    const n = db.prepare('UPDATE alerts SET statut = ?, classement = ?, note = ?, traite_par = ?, traite_a = ? WHERE id = ?').run(statut, classement, String(note).slice(0, 500), par, now(), id).changes;
    if (n) store.own('vigie_alerte', { emetteur: par, detail: { action: statut === 'close' ? 'close' : 'prise en charge', id, classement, note: String(note).slice(0, 200) } });
    return n;
  }
  const setMode = (regle, mode, par) => {
    if (!Object.hasOwn(REGISTRY, regle)) throw new Error(`règle inconnue : ${regle}`);
    if (!MODES.includes(mode)) throw new Error(`mode : ${MODES.join(', ')}`);
    setting.set('regles_modes', { ...modes(), [regle]: mode });
    store.own('vigie_interrupteur', { emetteur: par, detail: { regle, mode } });
  };
  const setThreshold = (kind, value, par) => {
    if (!Object.hasOwn(THRESHOLDS, kind) || !(value > 0 && value <= 1000)) throw new Error(`seuil : ${Object.keys(THRESHOLDS).join(', ')}, valeur de 0 à 1000`);
    setting.set('seuils', { ...setting.get('seuils', {}), [kind]: value });
    store.own('vigie_interrupteur', { emetteur: par, detail: { seuil: kind, valeur: value } });
  };

  return { process, tick, current, top, purge, classify, setMode, setThreshold, modeOf, thresholds,
    rules: () => Object.entries(REGISTRY).map(([id, r]) => ({ id, ...r, mode: modeOf(id) })), counts: () => ({ regles: rules.length, correlations: correlations.length }) };
}
