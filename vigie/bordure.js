import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import { readLimited } from './zitadel.js';
import { clean } from './util.js';

// Réseau d'une adresse (/24 en IPv4, /48 en IPv6), comme le site.
const netOf = ip => (net.isIPv4(ip) ? ip.replace(/\.\d+$/, '.0') : `${ip.split(':').slice(0, 3).join(':')}::`);

// Bordure Cloudflare (phase C3, décision D19), côté Vigie :
//   - copie les blocages d'adresses dans Workers KV (clé « blocages »), en liste signée réservée à la bordure (ni
//     compte ni session) : le Worker les applique avant le site. Au plus une écriture toutes les 2 minutes (offre
//     gratuite : 1 000 écritures par jour) ;
//   - lit chaque minute ce que le Worker a écrit dans Workers Analytics Engine (une requête par minute ; offre gratuite :
//     10 000 par jour), par minute close (2 minutes de retard, le temps que Cloudflare range les points), et en tire
//     des événements « bordure » (source à part entière du quorum) : blocages appliqués, rafales d'erreurs, rafales de
//     pages, admin depuis un opérateur jamais vu, erreurs du Worker ; bordure silencieuse (6 h sans point) signalée.
// Jeton Cloudflare (fichier, jamais dans le .env) : Account Analytics Read et Workers KV Storage Edit, sur ce compte.

const API = 'https://api.cloudflare.com/client/v4';
const KV_EVERY = 120e3;
const ERRORS_MIN = 20, PAGES_MIN = 120;           // par adresse et par minute
const SILENCE = 6 * 3600e3;

export function createEdge({ store, decisions, accountId, tokenFile, kvNamespace, dataset, fetchImpl = fetch, now = Date.now, log }) {
  const { setting } = store;
  if (!/^[0-9a-f]{32}$/.test(accountId) || !/^[0-9a-f]{32}$/.test(kvNamespace)) throw new Error('bordure : identifiants de compte et d’espace KV Cloudflare attendus (32 caractères hexadécimaux)');
  if (!/^[a-z_][a-z0-9_]{0,63}$/.test(dataset)) throw new Error('bordure : nom du jeu de données Analytics Engine invalide');
  const token = () => fs.readFileSync(tokenFile, 'utf8').trim();
  const call = async (path, init = {}) => {
    const r = await fetchImpl(`${API}${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { authorization: `Bearer ${token()}`, ...(init.headers || {}) } });
    const text = await readLimited(r, 16 * 1024 * 1024);
    if (r.status !== 200) throw new Error(`Cloudflare ${path.split('/').slice(-2).join('/')} : réponse ${r.status}`);
    return text;
  };
  const told = new Map();                      // erreur → heure signalée
  const fail = (what, err) => {
    const hour = Math.floor(now() / 3600e3);
    log?.warn({ err: err.message }, `Vigie : bordure (${what})`);
    if (told.get(what) === hour) return;
    told.set(what, hour);
    store.own('vigie_bordure_erreur', { emetteur: 'vigie/bordure.js', detail: { operation: what, erreur: String(err.message).slice(0, 200) } });
  };

  // 1. Blocages vers KV : à chaque nouvelle version de la liste (et toutes les 6 h, pour que la date de la liste reste
  // récente), jamais plus d'une fois toutes les 2 minutes.
  let pushing = false, later = null;
  async function push({ force = false } = {}) {
    const t = now();
    const last = setting.get('bordure_kv', null);
    const version = decisions.version();
    if (pushing || (!force && last && last.version === version && t - last.at < 6 * 3600e3)) return false;
    if (last && t - last.at < KV_EVERY) {
      // Trop tôt : reportée à la fin des 2 minutes (une décision prise juste après une autre part quand même).
      if (!later) later = setTimeout(() => { later = null; push().catch(() => {}); }, KV_EVERY - (t - last.at));
      later.unref?.();
      return false;
    }
    pushing = true;
    try {
      await call(`/accounts/${accountId}/storage/kv/namespaces/${kvNamespace}/values/blocages`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(decisions.signedEdge()) });
      setting.set('bordure_kv', { version, at: t });
      return true;
    } catch (err) { fail('copie des blocages', err); return false; } finally { pushing = false; }
  }

  // 2. Lecture d'Analytics Engine, par minute close.
  const SQL = `SELECT toUnixTimestamp(toStartOfInterval(timestamp, INTERVAL '1' MINUTE)) AS minute, index1 AS ip, blob1 AS classe,
    blob2 AS statut, blob3 AS pays, blob4 AS asn, blob5 AS org, blob6 AS tls, SUM(_sample_interval) AS n
    FROM ${dataset} WHERE timestamp > NOW() - INTERVAL '10' MINUTE
    GROUP BY minute, ip, classe, statut, pays, asn, org, tls ORDER BY minute LIMIT 20000 FORMAT JSON`;
  const knownOperators = () => new Set(setting.get('bordure_operateurs_admin', []));
  async function read() {
    const t = now();
    let rows;
    try { rows = JSON.parse(await call(`/accounts/${accountId}/analytics_engine/sql`, { method: 'POST', body: SQL })).data || []; } catch (err) { fail('lecture', err); return 0; }
    const cursor = setting.get('bordure_curseur', 0);
    const closed = rows.map(r => ({ ...r, minute: Number(r.minute) * 1000, n: Number(r.n) || 0 }))
      .filter(r => r.minute > cursor && r.minute <= t - 120e3 && net.isIP(String(r.ip)))
      // Données de Cloudflare, revérifiées comme toute entrée : valeurs bornées, sans caractère de contrôle.
      .map(r => ({ ...r, classe: clean(r.classe, 20), statut: /^\d{3}$/.test(r.statut) ? r.statut : '', pays: /^[A-Z]{2}$/.test(r.pays || '') ? r.pays : null,
        asn: /^\d{1,10}$/.test(r.asn || '') ? r.asn : null, org: clean(r.org, 80), tls: /^[0-9a-f]{16}$/.test(r.tls || '') ? r.tls : null }));
    if (closed.length) setting.set('bordure_derniere_donnee', t);
    const out = [];
    const ev = (type, r, detail, severity) => ({ type, severity, composant: 'bordure', emetteur: 'Worker Cloudflare · Analytics Engine', canal: 'API Cloudflare',
      confiance: 'constaté', survenu_a: r.minute, ip: r.ip, ip_net: netOf(r.ip), country: r.pays,
      reference: `bordure:${r.minute / 1000}`, detail: { minute: new Date(r.minute).toISOString().slice(0, 16), asn: r.asn, operateur: r.org, tls: r.tls, ...detail } });
    // Par adresse et par minute.
    const per = new Map();
    for (const r of closed) {
      const k = `${r.minute}|${r.ip}`;
      const a = per.get(k) || { r, bloque: 0, erreurs: 0, pages: 0, total: 0, erreurWorker: 0, admin: new Map() };
      a.total += r.n;
      if (r.classe === 'bloque') a.bloque += r.n;
      else if (r.classe === 'erreur') a.erreurWorker += r.n;
      else {
        if (/^4\d\d$/.test(r.statut)) a.erreurs += r.n;
        if (r.classe === 'page') a.pages += r.n;
        if (r.classe === 'admin' || r.classe === 'connexion') a.admin.set(`${r.asn}|${r.tls}`, r);
      }
      per.set(k, a);
    }
    const operators = knownOperators();
    let newOps = false;
    for (const a of per.values()) {
      if (a.bloque) out.push(ev('bordure_blocage', a.r, { requetes: a.bloque }, 'info'));
      if (a.erreurs >= ERRORS_MIN) out.push(ev('bordure_erreurs', a.r, { erreurs: a.erreurs, requetes: a.total }, 'moyen'));
      if (a.pages >= PAGES_MIN) out.push(ev('bordure_rafale', a.r, { pages: a.pages }, 'moyen'));
      if (a.erreurWorker) out.push(ev('bordure_erreur_worker', a.r, { requetes: a.erreurWorker }, 'bas'));
      for (const r of a.admin.values()) {
        if (!r.asn || operators.has(r.asn)) continue;
        // Admin ou connexion depuis un opérateur jamais vu en bordure : contexte (bas). Le premier relevé de la bordure
        // apprend sans signaler.
        if (operators.size) out.push(ev('bordure_nouvel_operateur', r, { classe: r.classe }, 'bas'));
        operators.add(r.asn); newOps = true;
      }
    }
    if (newOps) setting.set('bordure_operateurs_admin', [...operators].slice(-500));
    const maxMinute = closed.reduce((m, r) => Math.max(m, r.minute), cursor);
    if (out.length) store.add(out.map(e => ({ id: crypto.randomUUID(), recu_a: t, ...e, detail: JSON.stringify(e.detail) })));
    setting.set('bordure_curseur', maxMinute);
    // Silence : aucun point depuis 6 h (Worker retiré, routes changées, quota dépassé en « laisser passer »).
    const lastData = setting.get('bordure_derniere_donnee', null) ?? setting.get('bordure_debut', null) ?? (setting.set('bordure_debut', t), t);
    const silent = t - lastData > SILENCE;
    if (silent && !setting.get('bordure_silence_signale', false)) {
      setting.set('bordure_silence_signale', true);
      store.own('vigie_bordure_silence', { emetteur: 'vigie/bordure.js', detail: { depuis: new Date(lastData).toISOString().slice(0, 16) } });
    } else if (!silent) setting.set('bordure_silence_signale', false);
    return out.length;
  }

  const onChange = () => { push().catch(() => {}); };
  decisions.events.on('change', onChange);
  return { push, read, stop: () => { decisions.events.off('change', onChange); clearTimeout(later); } };
}
