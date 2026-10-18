import { cleReseau } from '../server/securite/adresses-ip.js';

// Détecteurs comportementaux (phase C2, inspirés des détecteurs de marlinOS) : ils raisonnent sur l'historique d'une
// entité, ce qu'une règle Sigma ne sait pas faire. Chacun renvoie des signaux de la même forme : { nom, cas, entite,
// gravite, points, sourceUnique, tags, detail }.
// Revue du 17 octobre 2026 (C1 et C2) : coût borné (requêtes groupées, au plus une fois par compte et par fenêtre),
// heure réelle de l'événement (survenu_a), connexions seulement pour le voyage et le pivot, mémoires bornées.

// Barème des détecteurs (cas, gravité, points, entité visée), lu à la fois par le moteur (signaux, registre des règles) et
// par l'écran des réglages de la console (vigie/console/ecrans/reglages.js) : une seule source. sourceUnique : une
// observation ouvre l'alerte d'elle-même (sans passer par le score). menaces : points par liste (vigie/menaces.js, LISTS).
export const DETECTEURS = {
  premiere_apparition: { cas: 'DS4', gravite: 'bas', points: 1.5, entite: 'compte' },
  heure_inhabituelle: { cas: 'DS18', gravite: 'bas', points: 1, entite: 'compte' },
  vitesse: { cas: 'DS17', gravite: 'moyen', points: 3, entite: 'compte' },
  voyage_impossible: { cas: 'DS3', gravite: 'haut', points: 4, entite: 'compte' },
  pivot_identifiants: { cas: 'DS25', gravite: 'haut', points: 4, entite: 'compte' },
  role_incoherent: { cas: 'DS10', gravite: 'critique', points: 5, sourceUnique: true, entite: 'compte' },
  exploration_lente: { cas: 'DS15', gravite: 'moyen', points: 4, entite: 'reseau' },
  chaine_attaque: { cas: 'DS23', gravite: 'critique', sourceUnique: true, entite: 'entite' },
  silence: { cas: 'DS24', gravite: 'haut', sourceUnique: true, entite: 'site' },
  menaces: { cas: 'DS22', gravite: null, points: null, entite: 'ip', listes: true },
};
// Ce qu'un signal d'un détecteur porte de son barème : { nom, cas, gravite, points, sourceUnique }.
const signal = nom => {
  const d = DETECTEURS[nom];
  return { nom, cas: d.cas, gravite: d.gravite, points: d.points, ...(d.sourceUnique ? { sourceUnique: true } : {}) };
};

const READS = ['sensitive_read', 'sensitive_export'];
const SLOW = ['malicious_honeypot', 'malicious_excess_404', 'token_guess', 'input_validation_fail'];
// Une connexion, une seule fois : le succès du site, ou l'ouverture d'une session chez Zitadel (pas chaque contrôle de
// mot de passe ou de facteur, qui accompagnent la même connexion).
const isLogin = (row, d) => row.type === 'authn_login_success' || (row.type === 'zitadel_connexion' && ['session.added', 'oidc_session.added'].includes(d.type_zitadel));
const parse = s => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const R = 6371;
export function km(a, b) {
  const rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Heure du jour (UTC) : l'habitude d'un compte est comparée à elle-même, le fuseau n'y change rien.
const hourOf = t => new Date(t).getUTCHours();
// Heure réelle d'un événement : survenu_a, borné à 7 jours avant sa réception (un lot renvoyé après une panne garde son
// heure ; une date fantaisiste ne remonte pas le temps).
export const eventTime = row => { const r = row.recu_a ?? Date.now(); const s = Number(row.survenu_a); return Number.isFinite(s) && row.survenu_a != null ? Math.min(Math.max(s, r - 7 * 864e5), r) : r; };

// Mémoire bornée, l'entrée la plus ancienne oubliée d'abord (jamais tout d'un coup).
export function lru(max) {
  const m = new Map();
  return {
    get: k => m.get(k),
    set(k, v) { m.delete(k); m.set(k, v); if (m.size > max) m.delete(m.keys().next().value); },
    delete: k => m.delete(k),
    entries: () => m.entries(),
    get size() { return m.size; },
  };
}

export function createDetectors({ store, now = Date.now }) {
  const { db } = store;
  const q = {
    loginsBefore: db.prepare(`SELECT country, detail FROM events WHERE sub = ? AND type = 'authn_login_success' AND seq < ? AND recu_a > ? LIMIT 500`),
    firstBySub: db.prepare('SELECT MIN(recu_a) FROM events WHERE sub = ?').pluck(),
    hours: db.prepare(`SELECT COUNT(*) n, group_concat(DISTINCT (survenu_a / 3600000) % 24) h FROM events
      WHERE sub = ? AND type IN ('authn_login_success', 'sensitive_read', 'sensitive_export') AND recu_a > ? AND seq < ?`),
    perDay: db.prepare(`SELECT (recu_a / 86400000) d, COUNT(*) n FROM events WHERE sub = ? AND type IN ('sensitive_read', 'sensitive_export') AND recu_a > ? GROUP BY d`),
    lastPos: db.prepare(`SELECT lat, lon, survenu_a, composant FROM events WHERE sub = ? AND lat IS NOT NULL AND seq < ? AND recu_a > ?
      AND type IN ('authn_login_success', 'session_created') ORDER BY seq DESC LIMIT 1`),
    posOfIp: db.prepare(`SELECT lat, lon FROM events WHERE ip = ? AND lat IS NOT NULL AND recu_a > ? ORDER BY seq DESC LIMIT 1`),
    fails: db.prepare(`SELECT COUNT(*) FROM events WHERE sub = ? AND type IN ('authn_login_fail', 'zitadel_echec') AND recu_a > ? AND seq < ?`).pluck(),
    roles: db.prepare("SELECT detail FROM events WHERE type = 'sys_state' ORDER BY seq DESC LIMIT 1").pluck(),
  };
  const done = lru(50_000);               // détecteur|clé → fenêtre déjà signalée
  const first = (k, window) => { if (done.get(k) === window) return false; done.set(k, window); return true; };
  const day = t => Math.floor(t / 864e5);
  const speed = lru(5_000);               // compte → référence de vitesse de l'heure en cours

  // Détecteurs appliqués à chaque événement.
  function onEvent(row) {
    const out = [];
    const t = eventTime(row);
    const late = row.retard === 1 || (row.recu_a ?? now()) - t > 15 * 60e3;   // arrivé en retard : pas de calcul sur l'heure
    const d = parse(row.detail);
    const compte = row.sub ? { kind: 'compte', key: row.sub } : null;
    const login = compte && isLogin(row, d);
    // Première apparition (DS4) : pays ou appareil jamais vus pour ce compte en 90 jours (connexions du site).
    if (login && row.type === 'authn_login_success') {
      const prev = q.loginsBefore.all(row.sub, row.seq, t - 90 * 864e5);
      if (prev.length) {
        const countries = new Set(prev.map(p => p.country).filter(Boolean));
        const devices = new Set(prev.map(p => parse(p.detail).appareil).filter(Boolean));
        const nouveau = [];
        if (row.country && countries.size && !countries.has(row.country)) nouveau.push(`pays ${row.country}`);
        if (d.appareil && devices.size && !devices.has(d.appareil)) nouveau.push('appareil');
        if (nouveau.length && first(`apparition|${row.sub}|${nouveau.join()}`, day(t))) out.push({ ...signal('premiere_apparition'), entite: compte, tags: ['attack.initial_access', 'attack.t1078'], detail: { nouveau } });
      }
    }
    // Heure inhabituelle (DS18) : activité à une heure jamais utilisée par ce compte en 28 jours (historique de 14 jours) ;
    // au plus une requête par compte et par heure.
    if (compte && !late && ['authn_login_success', ...READS].includes(row.type) && first(`heure-calcul|${row.sub}`, Math.floor(t / 3600e3))) {
      const firstSeen = q.firstBySub.get(row.sub);
      if (firstSeen && t - firstSeen > 14 * 864e5) {
        const r = q.hours.get(row.sub, t - 28 * 864e5, row.seq);
        const hours = new Set(String(r.h ?? '').split(',').filter(x => x !== '').map(Number));
        const h = hourOf(t);
        if (r.n >= 20 && !hours.has(h)) out.push({ ...signal('heure_inhabituelle'), entite: compte, tags: ['attack.t1078'], detail: { heure_utc: h, historique: r.n } });
      }
    }
    // Vitesse (DS17) : lectures du jour au-delà de la moyenne + 3 écarts-types des 30 jours précédents (10 au moins).
    // Référence et compte du jour relus en base au plus une fois par compte et par heure ; entre deux, le compte du jour
    // avance en mémoire (une rafale dans l'heure se voit tout de suite).
    if (compte && READS.includes(row.type)) {
      const today = day(t), hour = Math.floor(t / 3600e3);
      let c = speed.get(row.sub);
      if (!c || c.hour !== hour) {
        const byDay = new Map(q.perDay.all(row.sub, (today - 30) * 864e5).map(x => [x.d, x.n]));
        const counts = Array.from({ length: 30 }, (_, i) => byDay.get(today - 1 - i) || 0);
        const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
        const sd = Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length);
        c = { hour, day: today, n: byDay.get(today) || 0, mean, sd, history: counts.filter(x => x > 0).length >= 7 };
        speed.set(row.sub, c);
      } else c.n += 1;
      if (c.history && c.n >= 10 && c.n > c.mean + 3 * c.sd && first(`vitesse|${row.sub}`, today)) {
        out.push({ ...signal('vitesse'), entite: compte, tags: ['attack.collection', 'attack.t1213'], detail: { aujourdhui: c.n, moyenne: Math.round(c.mean * 10) / 10, ecart_type: Math.round(c.sd * 10) / 10 } });
      }
    }
    // Voyage impossible (DS3) : deux connexions d'un même compte, plus de 500 km, plus de 900 km/h, à l'heure réelle ; une
    // connexion Zitadel sans position prend celle de son adresse si le site l'a vue. Une fois par compte et par jour.
    if (login && !late) {
      let pos = row.lat != null && row.lon != null ? { lat: row.lat, lon: row.lon } : null;
      if (!pos && row.ip && row.composant === 'zitadel') pos = q.posOfIp.get(row.ip, t - 864e5) || null;
      if (pos) {
        const prev = q.lastPos.get(row.sub, row.seq, t - 864e5);
        if (prev) {
          const dist = km(prev, pos), hours = Math.max((t - prev.survenu_a) / 3600e3, 5 / 60);
          if (dist > 500 && dist / hours > 900 && first(`voyage|${row.sub}`, day(t))) out.push({ ...signal('voyage_impossible'), entite: compte, tags: ['attack.initial_access', 'attack.t1078'], detail: { km: Math.round(dist), kmh: Math.round(dist / hours), avant: prev.composant, apres: row.composant } });
        }
      }
    }
    // Pivot d'identifiants (DS25) : au moins 3 échecs dans les 6 h, puis une connexion ; une fois par compte et par 6 h.
    if (login) {
      const n = q.fails.get(row.sub, t - 6 * 3600e3, row.seq);
      if (n >= 3 && first(`pivot|${row.sub}`, Math.floor(t / (6 * 3600e3)))) out.push({ ...signal('pivot_identifiants'), entite: compte, tags: ['attack.credential_access', 'attack.t1110', 'attack.t1078'], detail: { echecs_avant: n } });
    }
    // Rôle incohérent (DS10) : export de données personnelles (permission réservée à l'administrateur) par un compte qui
    // n'est pas administrateur d'après le dernier état du site : la permission a été contournée.
    if (compte && row.type === 'sensitive_export' && /export\.zip$/.test(String(d.cible || ''))) {
      const st = parse(q.roles.get());
      if (Array.isArray(st.administrateurs) && !st.administrateurs.includes(row.sub)) {
        out.push({ ...signal('role_incoherent'), entite: compte, tags: ['attack.privilege_escalation', 'attack.t1068'], detail: { cible: d.cible } });
      }
    }
    return out;
  }

  // Détecteurs sur l'historique, une fois par heure (au plus 200 signaux par passage).
  let lastPeriodic = 0;
  function periodic() {
    const t = now();
    if (t - lastPeriodic < 3600e3) return [];
    lastPeriodic = t;
    const out = [];
    // Exploration lente (DS15, DS16) : un réseau présent dans les pièges, 404 ou jetons faux sur 12 heures distinctes en
    // 72 h, sans rafale (au plus 5 par heure en moyenne).
    const rows = db.prepare(`SELECT ip_net, COUNT(*) n, COUNT(DISTINCT CAST(recu_a / 3600000 AS INTEGER)) h FROM events
      WHERE type IN (${SLOW.map(() => '?').join(',')}) AND recu_a > ? AND ip_net IS NOT NULL GROUP BY ip_net HAVING h >= 12 LIMIT 1000`).all(...SLOW, t - 72 * 3600e3);
    for (const r of rows) {
      if (out.length >= 200) break;
      if (r.n / r.h <= 5 && first(`lent|${r.ip_net}`, day(t))) out.push({ ...signal('exploration_lente'), entite: { kind: 'reseau', key: cleReseau(r.ip_net) || r.ip_net }, tags: ['attack.reconnaissance', 'attack.t1595'], detail: { heures: r.h, evenements: r.n } });
    }
    return out;
  }
  return { onEvent, periodic, forcePeriodic: () => { lastPeriodic = 0; } };
}

// Chaîne d'attaque (DS23) : repérage, tentative puis accès sur une même entité en 24 h, d'après les tactiques MITRE des
// signaux. Mémoire bornée, les entités les plus anciennes oubliées d'abord.
const PHASES = {
  reperage: ['attack.reconnaissance', 'attack.discovery'],
  tentative: ['attack.initial_access', 'attack.credential_access', 'attack.execution'],
  acces: ['attack.privilege_escalation', 'attack.persistence', 'attack.collection', 'attack.exfiltration', 'attack.lateral_movement', 'attack.defense_evasion'],
};
export function createChains({ now = Date.now } = {}) {
  const seen = lru(50_000);
  return function feed(entite, tags) {
    const t = now();
    const k = `${entite.kind}|${entite.key}`;
    const e = { ...(seen.get(k) || {}) };
    for (const [phase, list] of Object.entries(PHASES)) if (tags.some(x => list.includes(x))) e[phase] = t;
    for (const p of Object.keys(e)) if (t - e[p] > 864e5) delete e[p];
    if (Object.keys(PHASES).every(p => e[p])) { seen.delete(k); return true; }
    seen.set(k, e);
    return false;
  };
}
