import { pointsOf, THRESHOLDS, HALF_LIFE_MIN, SOURCE_MIN, QUORUM, sourceOf, EXCEPTIONS, RULES, MODES } from './poids.js';
import { rank } from './vocabulaire.js';

// Moteur d'entités (phase C1, recadrage du 17 octobre 2026, concepts de marlinOS) :
//   - chaque événement dépose des points sur ses entités (adresse, réseau, compte, session) ; le score décroît (demi-vie
//     d'une heure) ; chaque source (site, Zitadel, bordure, contrôles de la Vigie) a sa contribution ;
//   - alerte « score » seulement si le seuil est franchi ET que deux sources au moins y contribuent (quorum, D18) ;
//   - exceptions à source unique : une observation sûre ouvre une alerte tout de suite ;
//   - une alerte par règle et par entité tant qu'elle est ouverte ; les événements suivants s'y ajoutent ;
//   - mode par règle : arrêt, observer (alerte marquée « observée », sans notification ni réponse), alerter, bloquer
//     (réponse automatique, si l'interrupteur des blocages est en marche) ;
//   - réponses automatiques prudentes : jamais une adresse liée à un compte, jamais une adresse de confiance.

const DECAY = ms => 0.5 ** (ms / (HALF_LIFE_MIN * 60e3));
const IGNORED = new Set(['vigie_alerte', 'vigie_decision', 'vigie_interrupteur']);
const parse = s => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };

export function createEngine({ store, decisions, switches, now = Date.now, log }) {
  const { db, setting } = store;
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
  };

  const modes = () => setting.get('regles_modes', {});
  const modeOf = id => { const m = modes()[id]; return MODES.includes(m) ? m : RULES[id]?.mode || 'observer'; };
  const thresholds = () => ({ ...THRESHOLDS, ...setting.get('seuils', {}) });
  const trusted = () => new Set(setting.get('adresses_confiance', []));

  // Score décru jusqu'à t, contributions par source comprises.
  function current(kind, key, t = now()) {
    const row = q.entity.get(kind, key);
    if (!row) return null;
    const f = DECAY(t - row.at);
    const contributions = Object.fromEntries(Object.entries(parse(row.contributions)).map(([s, v]) => [s, v * f]).filter(([, v]) => v >= 0.01));
    return { ...row, score: row.score * f, contributions, at: t };
  }
  const sourcesOf = e => Object.entries(e.contributions).filter(([, v]) => v >= SOURCE_MIN).map(([s]) => s).sort();

  function deposit(kind, key, points, source, t) {
    const e = current(kind, key, t) || { kind, key, score: 0, contributions: {}, signaux: 0, premiere: t, derniere: t };
    e.score += points;
    if (source) e.contributions[source] = (e.contributions[source] || 0) + points;
    e.signaux += 1; e.derniere = t; e.at = t;
    q.save.run({ ...e, contributions: JSON.stringify(e.contributions) });
    return e;
  }

  function entitiesOf(row) {
    const out = [];
    if (row.ip) out.push({ kind: 'ip', key: row.ip });
    if (row.ip_net && row.ip_net !== row.ip) out.push({ kind: 'reseau', key: row.ip_net });
    if (row.sub) out.push({ kind: 'compte', key: row.sub });
    if (row.session) out.push({ kind: 'session', key: row.session });
    return out;
  }

  // Ouvre (ou complète) une alerte ; réponse automatique selon le mode.
  function raise(regle, entite, gravite, row, { score = null, sources = [] } = {}) {
    const mode = modeOf(regle);
    if (mode === 'arret') return null;
    const t = now();
    let a = q.open.get(regle, entite.kind, entite.key);
    if (a) {
      const g = rank(gravite) > rank(a.gravite) ? gravite : a.gravite;
      const merged = [...new Set([...parse(a.sources), ...sources])].sort();
      q.update.run(t, g, score, JSON.stringify(merged), a.id);
      q.addEvent.run(a.id, row.seq);
      return a.id;
    }
    const id = Number(q.insert.run({ regle, cas: RULES[regle]?.cas || null, entite_kind: entite.kind, entite_key: entite.key, gravite, mode, t, score, sources: JSON.stringify(sources) }).lastInsertRowid);
    q.addEvent.run(id, row.seq);
    store.own('vigie_alerte', { emetteur: `vigie/moteur.js · ${regle}`, sub: entite.kind === 'compte' ? entite.key : undefined,
      detail: { action: 'ouverte', id, regle, cas: RULES[regle]?.cas || null, entite, gravite, mode, sources, score } });
    if (mode === 'bloquer') respond(id, regle, entite, row);
    return id;
  }

  // Réponses automatiques (mode « bloquer », interrupteur des blocages en marche). Jamais en double.
  function respond(id, regle, entite, row) {
    if (!switches.isOn('blocages')) { q.respond.run('interrupteur des blocages arrêté : aucune réponse', id); return; }
    const par = `Vigie · règle ${regle}`;
    const active = decisions.active();
    const has = (kind, cible) => active.some(d => d.kind === kind && d.cible === cible);
    const done = [];
    const make = (kind, cible, duree, extra = {}) => {
      if (has(kind, cible)) return;
      try { decisions.create({ kind, cible, duree, par, auto: true, motif: `alerte #${id}`, ...extra }); done.push(`${kind} ${cible}`); } catch (err) { done.push(`${kind} refusé : ${err.message}`); }
    };
    if (regle === 'exception.cookie_rejoue' && entite.kind === 'compte') make('revoquer_compte', entite.key, '48h');
    else if (regle === 'exception.role_hors_application' && entite.kind === 'compte') { make('geler', entite.key, '24h'); make('revoquer_compte', entite.key, '48h'); }
    else if (regle === 'exception.session_autre_appareil' && entite.kind === 'compte') make('revoquer_compte', entite.key, '48h');
    else if (regle === 'entite.score' && entite.kind === 'ip') {
      // Jamais une adresse de confiance, ni une adresse vue avec un compte (30 jours) : on ne s'enferme pas dehors.
      if (trusted().has(entite.key)) done.push('adresse de confiance : aucune réponse');
      else if (q.linkedSub.get(entite.key, entite.key, now() - 30 * 864e5)) done.push('adresse liée à un compte : aucun blocage automatique');
      else make('bloquer', entite.key, '24h', { portee: 'tout' });
    }
    q.respond.run(done.join(' ; ') || 'aucune réponse prévue pour cette règle', id);
  }

  function processRow(row) {
    if (IGNORED.has(row.type)) return;
    const d = parse(row.detail);
    const t = now();
    // Liens entre entités vues ensemble.
    const ents = entitiesOf(row);
    for (let i = 0; i < ents.length; i++) for (let j = i + 1; j < ents.length; j++) q.link.run(ents[i].kind, ents[i].key, ents[j].kind, ents[j].key, t);
    // Exceptions à source unique.
    for (const exc of EXCEPTIONS) {
      if (!exc.match(row, d)) continue;
      const e = exc.entite(row, d);
      if (!e?.key || e.key === 'undefined') continue;
      raise(`exception.${exc.id}`, e, exc.gravite || row.severity, row, { sources: [sourceOf(row)].filter(Boolean) });
    }
    // Dépôts et quorum.
    const points = pointsOf(row);
    const source = sourceOf(row);
    if (!points || !source) return;
    const th = thresholds();
    for (const { kind, key } of ents) {
      const e = deposit(kind, key, points, source, t);
      const limit = th[kind];
      if (!limit || e.score < limit) continue;
      const sources = sourcesOf(e);
      if (sources.length < QUORUM) continue;
      raise('entite.score', { kind, key }, e.score >= 2 * limit ? 'haut' : 'moyen', row, { score: Math.round(e.score * 10) / 10, sources });
    }
  }

  function process(rows) {
    if (!switches.isOn('detection')) return;
    for (const row of rows) {
      try { db.transaction(() => processRow(row)).immediate(); } catch (err) { log?.error({ err: err.message, type: row.type }, 'Vigie : moteur'); }
    }
  }

  // Entités les plus chaudes (score décru).
  function top(limit = 20) {
    const t = now();
    return db.prepare('SELECT kind, key FROM entities WHERE derniere > ?').all(t - 7 * 864e5).map(r => current(r.kind, r.key, t))
      .map(e => ({ ...e, sources: sourcesOf(e) })).filter(e => e.score >= 0.1).sort((a, b) => b.score - a.score).slice(0, limit);
  }
  // Ménage : entités froides depuis 30 jours, liens de plus de 90 jours.
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
    if (!Object.hasOwn(RULES, regle)) throw new Error(`règle inconnue : ${regle}`);
    if (!MODES.includes(mode)) throw new Error(`mode : ${MODES.join(', ')}`);
    setting.set('regles_modes', { ...modes(), [regle]: mode });
    store.own('vigie_interrupteur', { emetteur: par, detail: { regle, mode } });
  };
  const setThreshold = (kind, value, par) => {
    if (!Object.hasOwn(THRESHOLDS, kind) || !(value > 0 && value <= 1000)) throw new Error(`seuil : ${Object.keys(THRESHOLDS).join(', ')}, valeur de 0 à 1000`);
    setting.set('seuils', { ...setting.get('seuils', {}), [kind]: value });
    store.own('vigie_interrupteur', { emetteur: par, detail: { seuil: kind, valeur: value } });
  };

  return { process, current, top, purge, classify, setMode, setThreshold, modeOf, rules: () => Object.entries(RULES).map(([id, r]) => ({ id, ...r, mode: modeOf(id) })), thresholds };
}
