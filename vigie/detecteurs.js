// Détecteurs comportementaux (phase C2, inspirés des détecteurs de marlinOS) : ils raisonnent sur l'historique d'une
// entité, ce qu'une règle Sigma ne sait pas faire. Chacun renvoie des signaux de la même forme : { nom, cas, entite,
// gravite, points, sourceUnique, tags, detail }.

const LOGIN = ['authn_login_success', 'zitadel_connexion'];
const READS = ['sensitive_read', 'sensitive_export'];
const FAILS = ['authn_login_fail', 'zitadel_echec'];
const SLOW = ['malicious_honeypot', 'malicious_excess_404', 'token_guess', 'input_validation_fail'];
const parse = s => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const R = 6371;
export function km(a, b) {
  const rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const hourParis = t => Number(new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }).format(t));

export function createDetectors({ store, now = Date.now }) {
  const { db } = store;
  const q = {
    loginsBefore: db.prepare(`SELECT country, detail, composant FROM events WHERE sub = ? AND type IN ('authn_login_success', 'zitadel_connexion') AND seq < ? AND recu_a > ?`),
    countBySub: db.prepare(`SELECT COUNT(*) FROM events WHERE sub = ? AND type IN (${READS.map(() => '?').join(',')}) AND recu_a > ? AND recu_a <= ?`),
    firstBySub: db.prepare('SELECT MIN(recu_a) FROM events WHERE sub = ?').pluck(),
    hoursBySub: db.prepare(`SELECT recu_a FROM events WHERE sub = ? AND type IN ('authn_login_success', 'sensitive_read', 'sensitive_export') AND recu_a > ? AND seq < ?`).pluck(),
    lastPos: db.prepare(`SELECT lat, lon, recu_a, composant FROM events WHERE sub = ? AND lat IS NOT NULL AND seq < ? AND recu_a > ? ORDER BY seq DESC LIMIT 1`),
    posOfIp: db.prepare(`SELECT lat, lon FROM events WHERE ip = ? AND lat IS NOT NULL AND recu_a > ? ORDER BY seq DESC LIMIT 1`),
    fails: db.prepare(`SELECT COUNT(*) FROM events WHERE sub = ? AND type IN ('authn_login_fail', 'zitadel_echec') AND recu_a > ? AND seq < ?`).pluck(),
    roles: db.prepare("SELECT detail FROM events WHERE type = 'sys_state' ORDER BY seq DESC LIMIT 1").pluck(),
  };
  const once = new Map();               // détecteur|clé → jour déjà signalé
  const first = (k, day) => { if (once.get(k) === day) return false; if (once.size > 50_000) once.clear(); once.set(k, day); return true; };
  const day = t => new Date(t).toISOString().slice(0, 10);

  // Détecteurs appliqués à chaque événement.
  function onEvent(row) {
    const out = [];
    const t = row.recu_a || now();
    const d = parse(row.detail);
    const compte = row.sub ? { kind: 'compte', key: row.sub } : null;
    // Première apparition (DS4) : pays ou appareil jamais vus pour ce compte en 90 jours (s'il a un historique).
    if (compte && LOGIN.includes(row.type)) {
      const prev = q.loginsBefore.all(row.sub, row.seq, t - 90 * 864e5);
      if (prev.length) {
        const countries = new Set(prev.map(p => p.country).filter(Boolean));
        const devices = new Set(prev.map(p => parse(p.detail).appareil).filter(Boolean));
        const nouveau = [];
        if (row.country && !countries.has(row.country)) nouveau.push(`pays ${row.country}`);
        if (d.appareil && devices.size && !devices.has(d.appareil)) nouveau.push('appareil');
        if (nouveau.length) out.push({ nom: 'premiere_apparition', cas: 'DS4', entite: compte, gravite: 'bas', points: 1.5, tags: ['attack.initial_access', 'attack.t1078'], detail: { nouveau } });
      }
    }
    // Heure inhabituelle (DS18) : activité à une heure jamais utilisée par ce compte en 28 jours (historique de 14 jours).
    if (compte && ['authn_login_success', ...READS].includes(row.type)) {
      const firstSeen = q.firstBySub.get(row.sub);
      if (firstSeen && t - firstSeen > 14 * 864e5) {
        const hours = q.hoursBySub.all(row.sub, t - 28 * 864e5, row.seq).map(hourParis);
        const h = hourParis(t);
        if (hours.length >= 20 && !hours.includes(h) && first(`heure|${row.sub}|${h}`, day(t))) {
          out.push({ nom: 'heure_inhabituelle', cas: 'DS18', entite: compte, gravite: 'bas', points: 1, tags: ['attack.t1078'], detail: { heure: h, historique: hours.length } });
        }
      }
    }
    // Vitesse (DS17) : lectures du jour au-delà de la moyenne + 3 écarts-types des 30 jours précédents (10 au moins).
    if (compte && READS.includes(row.type)) {
      const dayStart = Date.parse(`${day(t)}T00:00:00Z`);
      const today = q.countBySub.pluck().get(row.sub, ...READS, dayStart, t);
      if (today >= 10) {
        const counts = [];
        for (let i = 1; i <= 30; i++) counts.push(q.countBySub.pluck().get(row.sub, ...READS, dayStart - i * 864e5, dayStart - (i - 1) * 864e5));
        const active = counts.filter(c => c > 0);
        if (active.length >= 7) {
          const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
          const sd = Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length);
          if (today > mean + 3 * sd && first(`vitesse|${row.sub}`, day(t))) out.push({ nom: 'vitesse', cas: 'DS17', entite: compte, gravite: 'moyen', points: 3, tags: ['attack.collection', 'attack.t1213'], detail: { aujourdhui: today, moyenne: Math.round(mean * 10) / 10, ecart_type: Math.round(sd * 10) / 10 } });
        }
      }
    }
    // Voyage impossible (DS3) : deux positions d'un même compte, plus de 500 km, plus de 900 km/h. Un événement Zitadel
    // sans position prend celle de son adresse si le site l'a vue.
    if (compte) {
      let pos = row.lat != null && row.lon != null ? { lat: row.lat, lon: row.lon } : null;
      if (!pos && row.ip && row.composant === 'zitadel') pos = q.posOfIp.get(row.ip, t - 864e5) || null;
      if (pos) {
        const prev = q.lastPos.get(row.sub, row.seq, t - 864e5);
        if (prev) {
          const dist = km(prev, pos), hours = Math.max((t - prev.recu_a) / 3600e3, 1 / 60);
          if (dist > 500 && dist / hours > 900) out.push({ nom: 'voyage_impossible', cas: 'DS3', entite: compte, gravite: 'haut', points: 4, tags: ['attack.initial_access', 'attack.t1078'], detail: { km: Math.round(dist), kmh: Math.round(dist / hours), avant: prev.composant, apres: row.composant } });
        }
      }
    }
    // Pivot d'identifiants (DS25) : au moins 3 échecs dans les 6 h, puis un succès.
    if (compte && LOGIN.includes(row.type)) {
      const n = q.fails.get(row.sub, t - 6 * 3600e3, row.seq);
      if (n >= 3) out.push({ nom: 'pivot_identifiants', cas: 'DS25', entite: compte, gravite: 'haut', points: 4, tags: ['attack.credential_access', 'attack.t1110', 'attack.t1078'], detail: { echecs_avant: n } });
    }
    // Rôle incohérent (DS10) : export de données personnelles (permission réservée à l'administrateur) par un compte qui
    // n'est pas administrateur d'après le dernier état du site : la permission a été contournée.
    if (compte && row.type === 'sensitive_export' && /export\.zip$/.test(String(d.cible || ''))) {
      const st = parse(q.roles.get());
      if (Array.isArray(st.administrateurs) && !st.administrateurs.includes(row.sub)) {
        out.push({ nom: 'role_incoherent', cas: 'DS10', entite: compte, gravite: 'critique', points: 5, sourceUnique: true, tags: ['attack.privilege_escalation', 'attack.t1068'], detail: { cible: d.cible } });
      }
    }
    return out;
  }

  // Détecteurs périodiques (une fois par heure).
  function periodic() {
    const out = [];
    const t = now();
    // Exploration lente (DS15, DS16) : un réseau présent dans les pièges, 404 ou jetons faux sur 12 heures distinctes en
    // 72 h, sans rafale (au plus 5 par heure en moyenne).
    const rows = db.prepare(`SELECT ip_net, COUNT(*) n, COUNT(DISTINCT CAST(recu_a / 3600000 AS INTEGER)) h FROM events
      WHERE type IN (${SLOW.map(() => '?').join(',')}) AND recu_a > ? AND ip_net IS NOT NULL GROUP BY ip_net HAVING h >= 12`).all(...SLOW, t - 72 * 3600e3);
    for (const r of rows) {
      if (r.n / r.h <= 5 && first(`lent|${r.ip_net}`, day(t))) out.push({ nom: 'exploration_lente', cas: 'DS15', entite: { kind: 'reseau', key: r.ip_net }, gravite: 'moyen', points: 4, tags: ['attack.reconnaissance', 'attack.t1595'], detail: { heures: r.h, evenements: r.n } });
    }
    return out;
  }
  return { onEvent, periodic };
}

// Chaîne d'attaque (DS23) : repérage, tentative puis accès sur une même entité en 24 h, d'après les tactiques MITRE des
// signaux.
const PHASES = {
  reperage: ['attack.reconnaissance', 'attack.discovery'],
  tentative: ['attack.initial_access', 'attack.credential_access', 'attack.execution'],
  acces: ['attack.privilege_escalation', 'attack.persistence', 'attack.collection', 'attack.exfiltration', 'attack.lateral_movement', 'attack.defense_evasion'],
};
export function createChains({ now = Date.now } = {}) {
  const seen = new Map();                // entité → { phase: t }
  return function feed(entite, tags) {
    const t = now();
    const k = `${entite.kind}|${entite.key}`;
    const e = seen.get(k) || {};
    for (const [phase, list] of Object.entries(PHASES)) if (tags.some(x => list.includes(x))) e[phase] = t;
    for (const p of Object.keys(e)) if (t - e[p] > 864e5) delete e[p];
    if (seen.size > 50_000) seen.clear();
    seen.set(k, e);
    if (Object.keys(PHASES).every(p => e[p])) { seen.delete(k); return true; }
    return false;
  };
}
