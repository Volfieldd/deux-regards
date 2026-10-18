import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { pointsOf, THRESHOLDS, HALF_LIFE_MIN, SOURCE_MIN, QUORUM, sourceOf, MODES } from './poids.js';
import { rank } from './vocabulaire.js';
import { loadRules, createCorrelator, fieldOf, RegexTimeout } from './sigma.js';
import { createDetectors, createChains, lru } from './detecteurs.js';
import { parseDuration } from './decisions.js';

// Moteur de détection de la Vigie (phases C1 et C2, recadrage du 17 octobre 2026, concepts de marlinOS) :
//   - entités (adresse, réseau, compte, session) et score composite qui perd la moitié de sa valeur chaque heure,
//     contribution par source (site, Zitadel, bordure, contrôles de la Vigie), liens entre entités ;
//   - points de base par événement (poids.js), puis signaux : règles Sigma et corrélations (regles/*.yml, D20),
//     détecteurs comportementaux (detecteurs.js), listes de menaces (menaces.js, sans compter comme une source) ;
//   - alerte de score seulement si le seuil est franchi ET que deux sources y contribuent (quorum, D18) ; une règle
//     « source_unique » (preuve sûre) ouvre son alerte tout de suite ;
//   - une alerte par règle et par entité tant qu'elle est ouverte et active (24 heures de calme : une nouvelle) ; mode par
//     règle : arrêt, observer, alerter, bloquer ;
//   - réponses automatiques prudentes : jamais une adresse privée, de confiance ou vue avec un administrateur.
// Le traitement se fait hors de la réception (curseur dans la base, par lots) : un afflux d'événements ne bloque pas la
// réception, la mémoire ne dépend pas du retard, un redémarrage reprend l'analyse où elle s'était arrêtée.

const DECAY = ms => 0.5 ** (ms / (HALF_LIFE_MIN * 60e3));
const IGNORED = new Set(['vigie_alerte', 'vigie_decision', 'vigie_interrupteur', 'vigie_signal']);
const parse = s => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const RULES_DIR = fileURLToPath(new URL('./regles/', import.meta.url));
const QUIET = 24 * 3600e3;                       // alerte sans nouvel événement depuis 24 h : la suivante en ouvre une autre
const QUIET_CLOSE = 7 * 864e5;                   // alerte ouverte sans nouvel événement depuis 7 jours : close sans suite
const RESPOND_EVERY = 15 * 60e3;                 // réponse rejouée au plus toutes les 15 minutes sur une alerte qui dure
const SIGNAL_DEDUP = 10 * 60e3;                  // signal identique (règle, entité) noté une fois par 10 minutes
const LAG_MAX = 100_000;                         // retard d'analyse au-delà duquel le moteur saute en avant
// Clé d'entité propre : sans caractères de contrôle (la ligne de commande les affiche), 200 caractères au plus.
export const clean = v => String(v).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, '?').slice(0, 200);
const PRIVATE = new net.BlockList();
for (const [a, p] of [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['127.0.0.0', 8], ['169.254.0.0', 16], ['100.64.0.0', 10], ['0.0.0.0', 8]]) PRIVATE.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['fc00::', 7], ['fe80::', 10], ['::1', 128]]) PRIVATE.addSubnet(a, p, 'ipv6');
// Réseau /64 d'une adresse IPv6 (« 2001:db8:1:2::/64 »).
export function net64(ip) {
  const [h, t = ''] = String(ip).split('::');
  const head = h ? h.split(':') : [], tail = t ? t.split(':') : [];
  const groups = [...head, ...Array(Math.max(8 - head.length - tail.length, 0)).fill('0'), ...tail].slice(0, 4).map(g => parseInt(g, 16).toString(16));
  return `${groups.join(':')}::/64`;
}
export const isPrivate = ip => { try { return PRIVATE.check(ip, net.isIPv6(ip) ? 'ipv6' : 'ipv4'); } catch { return false; } };

// Ordre des alertes partout (console, ligne de commande, résumé de l'admin) : gravité, puis ouverte avant prise en charge,
// puis la plus récente d'abord.
export const alertOrder = (a, b) => rank(b.gravite) - rank(a.gravite) || (a.statut === 'ouverte' ? 0 : 1) - (b.statut === 'ouverte' ? 0 : 1) || b.derniere - a.derniere;

export function createEngine({ store, decisions, switches, threats = null, now = Date.now, log, rulesDir = RULES_DIR }) {
  const { db, setting } = store;
  const { rules, correlations } = loadRules(rulesDir);
  const correlate = createCorrelator(correlations, { now });
  const detectors = createDetectors({ store, now });
  const chain = createChains({ now });
  const threatSeen = lru(50_000);                 // « adresse|liste » → jour : points de liste une fois par jour
  const signalSeen = lru(20_000);                 // « règle|entité » → instant du dernier signal noté
  const responded = lru(10_000);                  // alerte → instant de la dernière réponse
  const slowSeen = lru(1_000);                    // règle → heure de la dernière expression arrêtée signalée
  for (const r of [...rules, ...correlations]) if (r.expireAt && r.expireAt < now()) log?.info({ regle: r.name, expire: new Date(r.expireAt).toISOString() }, 'Vigie : règle expirée (inactive)');
  // Registre des règles (pour les modes) : quorum, règles Sigma qui produisent un signal, détecteurs.
  const REGISTRY = {
    'entite.score': { cas: 'quorum', mode: 'observer', titre: 'Score d’une entité au-dessus du seuil, confirmé par deux sources' },
    ...Object.fromEntries([...rules.filter(r => r.generate && r.signal), ...correlations].map(r => [`sigma.${r.name}`, { cas: r.cas, mode: r.mode, titre: r.title, sourceUnique: r.sourceUnique, expire: r.expireAt }])),
    ...Object.fromEntries(['premiere_apparition', 'heure_inhabituelle', 'vitesse', 'voyage_impossible', 'pivot_identifiants', 'role_incoherent', 'exploration_lente', 'chaine_attaque', 'silence', 'menaces']
      .map(n => [`detecteur.${n}`, { cas: { premiere_apparition: 'DS4', heure_inhabituelle: 'DS18', vitesse: 'DS17', voyage_impossible: 'DS3', pivot_identifiants: 'DS25', role_incoherent: 'DS10', exploration_lente: 'DS15', chaine_attaque: 'DS23', silence: 'DS24', menaces: 'DS22' }[n], mode: 'observer', titre: n.replaceAll('_', ' ') }])),
  };
  const q = {
    entity: db.prepare('SELECT * FROM entities WHERE kind = ? AND key = ?'),
    save: db.prepare(`INSERT INTO entities (kind, key, score, at, contributions, signaux, premiere, derniere) VALUES (@kind, @key, @score, @at, @contributions, @signaux, @premiere, @derniere)
      ON CONFLICT (kind, key) DO UPDATE SET score = @score, at = @at, contributions = @contributions, signaux = @signaux, derniere = @derniere`),
    link: db.prepare(`INSERT INTO entity_links (a_kind, a_key, b_kind, b_key, derniere) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (a_kind, a_key, b_kind, b_key) DO UPDATE SET derniere = excluded.derniere`),
    // Comptes connectés depuis une adresse (connexion réussie ou session ouverte seulement) : un événement qui cite un
    // compte depuis une adresse (cookie rejoué, refus de droit) ne fait pas de cette adresse « celle d'un
    // administrateur » ; sinon rejouer un cookie volé achèterait l'exemption de blocage automatique.
    linkedSubs: db.prepare("SELECT DISTINCT sub FROM events WHERE ip = ? AND type IN ('authn_login_success', 'session_created') AND sub IS NOT NULL AND recu_a > ? LIMIT 200").pluck(),
    open: db.prepare("SELECT * FROM alerts WHERE regle = ? AND entite_kind = ? AND entite_key = ? AND statut != 'close' AND derniere > ? ORDER BY id DESC LIMIT 1"),
    insert: db.prepare(`INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, premiere, derniere, compteur, score, sources)
      VALUES (@regle, @cas, @entite_kind, @entite_key, @gravite, @mode, @t, @t, 1, @score, @sources)`),
    update: db.prepare('UPDATE alerts SET derniere = ?, compteur = compteur + 1, gravite = ?, score = COALESCE(?, score), sources = ? WHERE id = ?'),
    respond: db.prepare('UPDATE alerts SET reponse = ? WHERE id = ?'),
    addEvent: db.prepare('INSERT OR IGNORE INTO alert_events (alert_id, seq) VALUES (?, ?)'),
    lastSite: db.prepare("SELECT MAX(recu_a) FROM events WHERE composant LIKE 'site%'").pluck(),
  };

  const modes = () => setting.get('regles_modes', {});
  // Mode d'une règle : réglé (texte), ou Arrêt pour une durée ({ mode: 'arret', jusqua }) : passée la durée, la règle
  // reprend son mode de départ.
  const modeOf = id => {
    const m = modes()[id];
    // Arrêt échu : la règle reprend le mode qu'elle avait avant l'arrêt (et non son mode de départ).
    if (m && typeof m === 'object') return m.mode === 'arret' && m.jusqua > now() ? 'arret' : MODES.includes(m.avant) ? m.avant : REGISTRY[id]?.mode || 'observer';
    return MODES.includes(m) ? m : REGISTRY[id]?.mode || 'observer';
  };
  const thresholds = () => ({ ...THRESHOLDS, ...setting.get('seuils', {}) });
  // Adresses de confiance : { ip, jusqua } ; une adresse écrite seule (avant la durée obligatoire) ne vaut plus rien :
  // elle se réécrit avec une durée.
  const trusted = () => new Set(setting.get('adresses_confiance', []).filter(x => x && typeof x === 'object' && x.jusqua > now()).map(x => x.ip));
  // Administrateurs connus : ceux du dernier contrôle des rôles réussi (sauvegarde du site), jamais la seule
  // déclaration du site, qu'un site compromis peut falsifier (arbitrage NC2). Avant le premier contrôle : aucun.
  const admins = () => {
    const fromSnapshot = setting.get('controle_roles_admins', null);
    return new Set(Array.isArray(fromSnapshot?.administrateurs) ? fromSnapshot.administrateurs : []);
  };

  function current(kind, key, t = now()) {
    const row = q.entity.get(kind, key);
    if (!row) return null;
    const f = DECAY(t - row.at);
    const contributions = Object.fromEntries(Object.entries(parse(row.contributions)).map(([s, v]) => [s, v * f]).filter(([, v]) => v >= 0.01));
    return { ...row, score: row.score * f, contributions, at: t };
  }
  // Ni les listes de menaces ni les règles « contexte » ne comptent comme une source du quorum.
  const sourcesOf = e => Object.entries(e.contributions).filter(([s, v]) => s !== 'menaces' && s !== 'contexte' && v >= SOURCE_MIN).map(([s]) => s).sort();

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
    if (row.ip) out.push({ kind: 'ip', key: clean(row.ip) });
    if (row.ip_net && row.ip_net !== row.ip) out.push({ kind: 'reseau', key: clean(row.ip_net) });
    if (row.sub) out.push({ kind: 'compte', key: clean(row.sub) });
    if (row.session) out.push({ kind: 'session', key: clean(row.session) });
    return out;
  }
  // Un résumé de l'émetteur (D23 : detail.nombre occurrences regroupées en plus de la première) pèse ce qu'il résume.
  const weightOf = row => { const n = Number(fieldOf(row, 'detail.nombre')); return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n) + 1, 50) : 1; };
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
    const a = q.open.get(regle, entite.kind, entite.key, t - QUIET);
    if (a) {
      const g = rank(gravite) > rank(a.gravite) ? gravite : a.gravite;
      const merged = [...new Set([...parse(a.sources), ...sources])].sort();
      q.update.run(t, g, score, JSON.stringify(merged), a.id);
      if (row?.seq) q.addEvent.run(a.id, row.seq);
      // Aggravation : notée (la console et les notifications la voient) ; réponse rejouée si le mode est « bloquer »
      // (une décision expirée ou levée entre-temps est reprise, jamais en double).
      if (g !== a.gravite) store.own('vigie_alerte', { emetteur: `vigie/moteur.js · ${regle}`, sub: entite.kind === 'compte' ? entite.key : undefined,
        detail: { action: 'aggravee', id: a.id, regle, entite, gravite: g, avant: a.gravite, sources: merged, score } });
      if (mode === 'bloquer' && t - (responded.get(a.id) ?? 0) >= RESPOND_EVERY) respond(a.id, regle, entite, reponse);
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
    responded.set(id, now());
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
      // Jamais une adresse privée (réseau Docker, proxy), de confiance, ni une adresse vue avec un administrateur (30
      // jours) : on ne s'enferme pas dehors. Un compte ordinaire ne protège pas son adresse (sinon un attaquant qui ouvre
      // un compte s'achète l'exemption).
      const adm = admins();
      if (isPrivate(entite.key)) done.push('adresse privée : aucun blocage automatique');
      // Sans contrôle des rôles réussi, les adresses des administrateurs ne sont pas connues : aucun blocage automatique
      // d'adresse (il serait aussi appliqué en bordure).
      else if (!setting.get('controle_roles_admins', null)) done.push('aucun contrôle des rôles réussi : aucun blocage automatique d’adresse');
      else if (trusted().has(entite.key)) done.push('adresse de confiance : aucune réponse');
      else if (q.linkedSubs.all(entite.key, now() - 30 * 864e5).some(s => adm.has(s))) done.push('adresse d’une connexion d’administrateur : aucun blocage automatique');
      // IPv6 : le /64 (une machine en change d'adresse à volonté dans son /64 ; bloquer le /128 ne servirait à rien et
      // gonflerait la liste).
      else make('bloquer', net.isIPv6(entite.key) ? net64(entite.key) : entite.key, '24h', { portee: 'tout' });
    }
    q.respond.run(done.join(' ; ') || 'aucune réponse prévue pour cette règle', id);
  }

  // Un signal (règle Sigma, corrélation, détecteur) : noté dans la chaîne, puis alerte directe (preuve sûre) ou points.
  function signal({ regle, titre, cas, entite, gravite, points, sourceUnique, reponse, tags = [], detail = {} }, row, sources) {
    if (!entite?.key || modeOf(regle) === 'arret') return;
    entite = { kind: entite.kind, key: clean(entite.key) };
    // Noté dans la chaîne une fois par 10 minutes pour la même règle et la même entité (les points, eux, comptent tous).
    const k = `${regle}|${entite.kind}|${entite.key}`;
    const t = now();
    if (t - (signalSeen.get(k) ?? -Infinity) >= SIGNAL_DEDUP) {
      signalSeen.set(k, t);
      store.own('vigie_signal', { emetteur: `vigie/moteur.js · ${regle}`, sub: entite.kind === 'compte' ? entite.key : undefined, reference: row?.seq ? `events#${row.seq}` : undefined,
        detail: { regle, titre, cas, entite, gravite, tags, sources, ...detail } });
    }
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
    const base = pointsOf(row) * weightOf(row);
    if (base && source) for (const e of ents) score(e, base, source, row);
    // Listes de menaces : points sur l'adresse une fois par jour et par liste, sans compter comme une source.
    if (row.ip && threats && modeOf('detecteur.menaces') !== 'arret') {
      const day = Math.floor(t / 864e5);
      for (const l of threats.labels(row.ip)) {
        const k = `${row.ip}|${l}`;
        if (threatSeen.get(k) === day) continue;
        threatSeen.set(k, day);
        deposit('ip', clean(row.ip), { spamhaus_drop: 3, feodo: 3, tor: 1 }[l] || 1, 'menaces', t);
      }
    }
    // Règles Sigma et corrélations. Une règle qui échoue sur un événement est notée, les autres continuent.
    const matched = new Set();
    for (const r of rules) {
      if (r.expireAt && t > r.expireAt) continue;
      let hit = false;
      try { hit = r.match(row); } catch (err) {
        log?.warn({ err: err.message, regle: r.name }, 'Vigie : règle en échec');
        // Expression arrêtée par son délai : notée une fois par heure et par règle (alerte « règle lente »).
        if (err instanceof RegexTimeout && slowSeen.get(r.name) !== Math.floor(t / 3600e3)) {
          slowSeen.set(r.name, Math.floor(t / 3600e3));
          store.own('vigie_regle_lente', { emetteur: 'vigie/moteur.js', reference: row.seq ? `events#${row.seq}` : undefined, detail: { regle: r.name, erreur: err.message } });
        }
      }
      if (!hit) continue;
      matched.add(r.name);
      if (!r.generate || !r.signal) continue;
      signal({ regle: `sigma.${r.name}`, titre: r.title, cas: r.cas, entite: entityOf(r, row), gravite: r.graviteEvenement ? row.severity : r.gravite, points: r.points,
        sourceUnique: r.sourceUnique, reponse: r.reponse, tags: r.tags }, row, r.contexte ? ['contexte'] : sources);
    }
    // Corrélation : les points se partagent entre les sources qui y ont contribué (et non la seule source du dernier
    // événement), ce qui permet le quorum entre le site et Zitadel.
    for (const f of correlate(row, matched, { source })) {
      const c = f.correlation;
      signal({ regle: `sigma.${c.name}`, titre: c.title, cas: c.cas, entite: entityOf(c, row), gravite: c.gravite, points: c.points, sourceUnique: c.sourceUnique,
        reponse: c.reponse, tags: c.tags, detail: { groupe: f.key, valeur: f.valeur, evenements: f.evenements } }, row, f.sources.length ? f.sources : sources);
    }
    // Détecteurs comportementaux.
    for (const s of detectors.onEvent(row)) signal({ regle: `detecteur.${s.nom}`, titre: s.nom.replaceAll('_', ' '), ...s, detail: s.detail }, row, sources);
  }

  // Un lot dans une seule transaction (une seule écriture forcée sur disque : abaques, docs/etudes/vigie-capacite.md),
  // chaque événement dans un point de sauvegarde : une erreur n'annule que le sien.
  const processOne = db.transaction(row => processRow(row));
  // Le curseur de la file est enregistré dans la même transaction : un arrêt brutal ne fait jamais analyser un lot deux
  // fois (revue C3). Détection arrêtée : le curseur avance quand même (ces événements ne seront pas analysés plus tard).
  const processAll = db.transaction((rows, cursorTo) => {
    // Détection arrêtée : seule la réduction de la surveillance est encore analysée (c'est elle qui le signale).
    const on = switches.isOn('detection');
    {
      for (const row of on ? rows : rows.filter(r => r.type === 'vigie_surveillance_reduite')) {
        try { processOne(row); } catch (err) { log?.error({ err: err.message, type: row.type }, 'Vigie : moteur'); }
      }
    }
    if (cursorTo != null) setting.set('moteur_curseur', cursorTo);
  });
  function process(rows, cursorTo = null) {
    if (!rows.length || (cursorTo == null && !switches.isOn('detection') && !rows.some(r => r.type === 'vigie_surveillance_reduite'))) return;
    processAll.immediate(rows, cursorTo);
  }
  // File : la réception répond sans attendre le moteur. Le moteur garde seulement un curseur (dernier numéro analysé,
  // enregistré) et relit les événements dans la base par lots de 200, en rendant la main entre deux lots : mémoire
  // constante quel que soit le retard (100 000 événements en mémoire prendraient 120 Mo, la moitié de la limite du
  // conteneur), et un redémarrage reprend où l'analyse s'était arrêtée. Retard de plus de 100 000 événements (afflux
  // massif) : le moteur saute en avant (les événements restent dans la base et la chaîne) et le note.
  const q2 = {
    max: db.prepare('SELECT MAX(seq) FROM events').pluck(),
    after: db.prepare('SELECT * FROM events WHERE seq > ? ORDER BY seq LIMIT 200'),
  };
  let cursor = setting.get('moteur_curseur', null);
  if (cursor == null) { cursor = q2.max.get() ?? 0; setting.set('moteur_curseur', cursor); }   // premier démarrage : pas l'historique
  let scheduled = false;
  const waiters = [];
  const schedule = () => { if (!scheduled) { scheduled = true; setImmediate(run); } };
  function enqueue() { schedule(); }
  function run() {
    try {
      const last = q2.max.get() ?? 0;
      if (last - cursor > LAG_MAX) {
        const skipped = last - LAG_MAX - cursor;
        cursor = last - LAG_MAX;
        setting.set('moteur_curseur', cursor);
        store.own('vigie_moteur_sature', { severity: 'haut', emetteur: 'vigie/moteur.js', detail: { ignores: skipped } });
      }
      const rows = q2.after.all(cursor);
      if (rows.length) {
        process(rows, rows.at(-1).seq);
        cursor = rows.at(-1).seq;
        setImmediate(run);
        return;
      }
    } catch (err) { log?.error({ err: err.message }, 'Vigie : file du moteur'); }
    scheduled = false;
    while (waiters.length) waiters.shift()();
  }
  const drain = () => (scheduled ? new Promise(r => waiters.push(r)) : Promise.resolve());
  const lag = () => (q2.max.get() ?? 0) - cursor;

  // Alertes ouvertes restées 7 jours sans nouvel événement : closes « sans suite » (arbitrage NC3). Une alerte prise en
  // charge par un intervenant reste à lui.
  function closeQuiet() {
    const t = now();
    const ids = db.prepare("SELECT id FROM alerts WHERE statut = 'ouverte' AND derniere < ? LIMIT 1000").pluck().all(t - QUIET_CLOSE);
    if (!ids.length) return 0;
    db.transaction(() => {
      const up = db.prepare("UPDATE alerts SET statut = 'close', note = 'sans suite : 7 jours sans nouvel événement', traite_par = 'Vigie (clôture automatique)', traite_a = ? WHERE id = ?");
      for (const id of ids) up.run(t, id);
      store.own('vigie_alerte', { emetteur: 'vigie/moteur.js · clôture automatique', detail: { action: 'close', classement: 'sans_suite', ids: ids.slice(0, 200), nombre: ids.length } });
    })();
    return ids.length;
  }

  // Tâches périodiques : détecteurs sur l'historique (exploration lente), site silencieux (DS24), clôture des alertes
  // sans suite (une fois par heure).
  let silent = false, lastClose = 0;
  function tick() {
    correlate.prune();
    if (now() - lastClose >= 3600e3) { lastClose = now(); closeQuiet(); }
    if (!switches.isOn('detection')) return;
    for (const s of detectors.periodic()) signal({ regle: `detecteur.${s.nom}`, titre: s.nom.replaceAll('_', ' '), ...s }, null, ['site']);
    const last = q.lastSite.get();
    if (last && now() - last > 3 * 60e3) {
      if (!silent) { silent = true; raise('detecteur.silence', { kind: 'site', key: 'battement' }, 'haut', null, { sources: ['vigie'] }); }
    } else silent = false;
  }

  // Résumé pour l'admin du site (annexe architecture 4.3) : nombres d'alertes ouvertes par gravité, titre générique de
  // la plus grave, sa date ; ni adresse, ni compte, ni détail. Les alertes en observation n'y figurent pas (comme pour
  // les notifications). « critique_a_prendre » : une critique encore « ouverte » (le bandeau de l'admin reste jusqu'à
  // sa prise en charge dans la console).
  // Ordre des alertes : alertOrder, plus haut (exporté pour la console).
  function summary() {
    const rows = db.prepare("SELECT id, regle, gravite, statut, premiere, derniere FROM alerts WHERE statut != 'close' AND mode != 'observer'").all();
    const ouvertes = { critique: 0, haut: 0, moyen: 0, bas: 0 };
    for (const r of rows) if (Object.hasOwn(ouvertes, r.gravite)) ouvertes[r.gravite] += 1;
    // Même ordre que la console : gravité, ouverte avant prise en charge, la plus récente d'abord. Ni titre ni règle :
    // l'admin du site peut être lue par un attaquant devenu administrateur, il n'apprend pas ce qui l'a vu.
    const worst = rows.filter(r => Object.hasOwn(ouvertes, r.gravite)).sort(alertOrder)[0];
    return {
      ouvertes,
      plus_grave: worst ? { id: worst.id, gravite: worst.gravite, depuis: worst.premiere } : null,
      critique_a_prendre: rows.some(r => r.gravite === 'critique' && r.statut === 'ouverte'),
    };
  }

  function top(limit = 20) {
    const t = now();
    return db.prepare('SELECT kind, key FROM entities WHERE derniere > ?').all(t - 7 * 864e5).map(r => current(r.kind, r.key, t))
      .map(e => ({ ...e, sources: sourcesOf(e) })).filter(e => e.score >= 0.1).sort((a, b) => b.score - a.score).slice(0, limit);
  }
  function purge() {
    db.prepare('DELETE FROM entities WHERE derniere < ?').run(now() - 30 * 864e5);
    db.prepare('DELETE FROM entity_links WHERE derniere < ?').run(now() - 90 * 864e5);
    // Alertes closes depuis plus de 13 mois (et leurs liens vers les événements, eux-mêmes purgés à 13 mois).
    db.transaction(() => {
      const before = now() - 395 * 864e5;
      db.prepare("DELETE FROM alert_events WHERE alert_id IN (SELECT id FROM alerts WHERE statut = 'close' AND derniere < ?)").run(before);
      db.prepare("DELETE FROM alerts WHERE statut = 'close' AND derniere < ?").run(before);
    })();
  }
  function classify(id, { classement, note = '', par, statut = 'close' }) {
    if (!['incident', 'faux_positif', 'test', null].includes(classement)) throw new Error('classement : incident, faux_positif ou test');
    const n = db.prepare('UPDATE alerts SET statut = ?, classement = ?, note = ?, traite_par = ?, traite_a = ? WHERE id = ?').run(statut, classement, String(note).slice(0, 500), par, now(), id).changes;
    if (n) store.own('vigie_alerte', { emetteur: par, detail: { action: statut === 'close' ? 'close' : 'prise en charge', id, classement, note: String(note).slice(0, 200) } });
    return n;
  }
  // Arrêt d'une règle : toujours pour une durée (7 jours au plus), comme un interrupteur, et signalé (surveillance
  // réduite) ; les autres modes restent tels quels.
  const setMode = (regle, mode, par, { duree = null, motif = '' } = {}) => {
    if (!Object.hasOwn(REGISTRY, regle)) throw new Error(`règle inconnue : ${regle}`);
    if (!MODES.includes(mode)) throw new Error(`mode : ${MODES.join(', ')}`);
    if (regle === 'sigma.surveillance_reduite' && mode !== 'alerter') throw new Error('la règle « Surveillance réduite » reste en mode alerter : c’est elle qui prévient quand on réduit la surveillance');
    const m = String(motif || '').trim().slice(0, 200) || undefined;
    const before = modeOf(regle);
    if (mode === 'arret' && !duree) throw new Error('arrêt d’une règle toujours pour une durée (--duree 4h, 7j au plus)');
    // Toute réduction (arrêt, descente de mode) demande un motif, quel que soit l'appelant (console, ligne de commande).
    if (!m && MODES.indexOf(mode) < MODES.indexOf(before)) throw new Error('surveillance réduite : motif obligatoire');
    if (mode === 'arret') {
      if (!duree) throw new Error('arrêt d’une règle toujours pour une durée (--duree 4h, 7j au plus)');
      const jusqua = now() + Math.min(parseDuration(duree), 7 * 864e5);
      setting.set('regles_modes', { ...modes(), [regle]: { mode: 'arret', jusqua, par, motif: m, avant: before === 'arret' ? undefined : before } });
      store.own('vigie_interrupteur', { emetteur: par, detail: { regle, mode, jusqua, motif: m } });
      store.own('vigie_surveillance_reduite', { emetteur: par, detail: { objet: `regle:${regle}`, jusqua, motif: m } });
      return;
    }
    setting.set('regles_modes', { ...modes(), [regle]: mode });
    store.own('vigie_interrupteur', { emetteur: par, detail: { regle, mode, motif: m } });
    // Descente de mode (Bloquer → Alerter → Observer) : la surveillance est réduite aussi (jury v2 des maquettes).
    if (MODES.indexOf(mode) < MODES.indexOf(before)) store.own('vigie_surveillance_reduite', { emetteur: par, detail: { objet: `regle:${regle}`, mode, avant: before, motif: m } });
  };
  const setThreshold = (kind, value, par, { motif = '' } = {}) => {
    if (!Object.hasOwn(THRESHOLDS, kind) || !(value > 0 && value <= 1000)) throw new Error(`seuil : ${Object.keys(THRESHOLDS).join(', ')}, valeur de 0 à 1000`);
    const before = thresholds()[kind];
    const m = String(motif || '').trim().slice(0, 200) || undefined;
    if (!m && value > before) throw new Error('seuil relevé (surveillance réduite) : motif obligatoire');
    setting.set('seuils', { ...setting.get('seuils', {}), [kind]: value });
    store.own('vigie_interrupteur', { emetteur: par, detail: { seuil: kind, valeur: value, motif: m } });
    // Seuil relevé : il faut plus de points pour une alerte, la surveillance est réduite.
    if (value > before) store.own('vigie_surveillance_reduite', { emetteur: par, detail: { objet: `seuil:${kind}`, valeur: value, avant: before, motif: m } });
  };

  return { process, enqueue, drain, lag, detectors, tick, closeQuiet, summary, current, top, purge, classify, setMode, setThreshold, modeOf, thresholds,
    rules: () => Object.entries(REGISTRY).map(([id, r]) => ({ id, ...r, mode: modeOf(id) })), counts: () => ({ regles: rules.length, correlations: correlations.length }) };
}
