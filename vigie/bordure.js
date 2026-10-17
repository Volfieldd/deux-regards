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
const SILENCE = 6 * 3600e3;                    // aucune requête vue en bordure depuis 6 h
const HEARTBEAT_SILENCE = 20 * 60e3;           // battement attendu toutes les 5 minutes

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

  // 1. Blocages vers KV : quand la liste change (empreinte de son contenu, pas sa version : revue C3), et toutes les
  // 6 h pour que sa date reste récente (le Worker refuse une liste de plus de 24 h) ; jamais plus d'une fois toutes les
  // 2 minutes.
  let pushing = false, later = null;
  async function push({ force = false } = {}) {
    const t = now();
    const last = setting.get('bordure_kv', null);
    const signed = decisions.signedEdge();
    const p = JSON.parse(signed.payload);
    const digest = crypto.createHash('sha256').update(JSON.stringify(p.blocages)).digest('hex').slice(0, 32);
    if (pushing || (!force && last && last.empreinte === digest && t - last.at < 6 * 3600e3)) return false;
    if (last && t - last.at < KV_EVERY) {
      // Trop tôt : reportée à la fin des 2 minutes (une décision prise juste après une autre part quand même).
      if (!later) { later = setTimeout(() => { later = null; push().catch(() => {}); }, KV_EVERY - (t - last.at)); later.unref?.(); }
      return false;
    }
    pushing = true;
    try {
      await call(`/accounts/${accountId}/storage/kv/namespaces/${kvNamespace}/values/blocages`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signed) });
      setting.set('bordure_kv', { version: p.version, empreinte: digest, at: t });
      return true;
    } catch (err) { fail('copie des blocages', err); return false; } finally { pushing = false; }
  }

  // 2. Lecture d'Analytics Engine. Curseur fondé sur l'heure (revue C3) : la minute M est lue quand elle est close depuis
  // 2 minutes (M + 3 min), la requête ne porte que sur la période [curseur, borne[ (une heure au plus), et le curseur
  // avance jusqu'à la borne qu'il y ait des points ou non. Période plus longue (Vigie arrêtée), réponse tronquée :
  // signalé (la période manquante n'est pas lue).
  const LAG = 3 * 60e3, WINDOW = 3600e3, LIMIT = 20000;
  const iso = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const sql = (from, to) => `SELECT toUnixTimestamp(toStartOfInterval(timestamp, INTERVAL '1' MINUTE)) AS minute, index1 AS ip, blob1 AS classe,
    blob2 AS statut, blob3 AS pays, blob4 AS asn, blob5 AS org, blob6 AS tls, blob9 AS note, SUM(_sample_interval) AS n
    FROM ${dataset} WHERE timestamp >= toDateTime('${iso(from)}') AND timestamp < toDateTime('${iso(to)}')
    GROUP BY minute, ip, classe, statut, pays, asn, org, tls, note ORDER BY minute LIMIT ${LIMIT} FORMAT JSON`;
  // Opérateurs connus pour l'admin : appris seulement sur des réponses 200 de l'admin (une session ouverte), gardés
  // par date de dernière vue (les 500 plus récents) ; un scanner qui frappe /admin (redirigé) n'apprend rien.
  const operators = () => new Map(Object.entries(setting.get('bordure_operateurs_admin_vus', {})));
  async function read() {
    const t = now();
    const bound = Math.floor((t - LAG) / 60e3) * 60e3;
    let cursor = setting.get('bordure_curseur', null) ?? bound - 60e3;
    if (bound <= cursor) return 0;
    if (bound - cursor > WINDOW) {
      fail('période non lue', new Error(`de ${iso(cursor)} à ${iso(bound - WINDOW)} UTC (Vigie arrêtée ou lecture en échec)`));
      cursor = bound - WINDOW;
    }
    let rows;
    try { rows = JSON.parse(await call(`/accounts/${accountId}/analytics_engine/sql`, { method: 'POST', body: sql(cursor, bound) })).data || []; } catch (err) { fail('lecture', err); return 0; }
    if (rows.length >= LIMIT) fail('réponse tronquée', new Error(`${LIMIT} groupes ou plus de ${iso(cursor)} à ${iso(bound)} UTC : une partie n'est pas lue`));
    const all = rows.map(r => ({ ...r, minute: Number(r.minute) * 1000, n: Number(r.n) || 0 })).filter(r => r.minute >= cursor && r.minute < bound);
    // Points du Worker sur sa propre liste (index « bordure ») : liste refusée ou en partie illisible.
    for (const r of all.filter(x => x.ip === 'bordure' && ['liste_refusee', 'liste_partielle'].includes(x.classe))) {
      fail(r.classe === 'liste_refusee' ? 'liste refusée par le Worker' : 'liste en partie écartée par le Worker', new Error(clean(r.note, 120) || r.classe));
    }
    const closed = all.filter(r => net.isIP(String(r.ip)))
      // Données de Cloudflare, revérifiées comme toute entrée : valeurs bornées, sans caractère de contrôle.
      .map(r => ({ ...r, classe: clean(r.classe, 20), statut: /^\d{3}$/.test(r.statut) ? r.statut : '', pays: /^[A-Z]{2}$/.test(r.pays || '') ? r.pays : null,
        asn: /^\d{1,10}$/.test(r.asn || '') ? r.asn : null, org: clean(r.org, 80), tls: /^[0-9a-f]{16}$/.test(r.tls || '') ? r.tls : null }));
    if (all.some(x => x.ip !== 'bordure')) setting.set('bordure_derniere_donnee', t);   // requêtes vues (pas le battement)
    const beats = all.filter(x => x.ip === 'bordure' && x.classe === 'battement');
    if (beats.length) setting.set('bordure_dernier_battement', { at: Math.max(...beats.map(b => b.minute)), etat: clean(beats.at(-1).note, 120) });
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
        if (r.classe === 'admin' && r.statut === '200' && r.asn) a.admin.set(r.asn, r);   // page de l'admin servie : session ouverte
      }
      per.set(k, a);
    }
    const ops = operators();
    const learning = ops.size === 0;                 // tout premier relevé : apprend sans signaler
    let changed = false;
    for (const a of per.values()) {
      if (a.bloque) out.push(ev('bordure_blocage', a.r, { requetes: a.bloque }, 'info'));
      if (a.erreurs >= ERRORS_MIN) out.push(ev('bordure_erreurs', a.r, { erreurs: a.erreurs, requetes: a.total }, 'moyen'));
      if (a.pages >= PAGES_MIN) out.push(ev('bordure_rafale', a.r, { pages: a.pages }, 'moyen'));
      if (a.erreurWorker) out.push(ev('bordure_erreur_worker', a.r, { requetes: a.erreurWorker }, 'bas'));
      for (const r of a.admin.values()) {
        // Page de l'admin servie (session ouverte) depuis un opérateur jamais vu : contexte « bas ».
        if (!ops.has(r.asn) && !learning) out.push(ev('bordure_nouvel_operateur', r, { classe: r.classe }, 'bas'));
        ops.set(r.asn, r.minute); changed = true;
      }
    }
    if (ops.size > 500) for (const [k] of [...ops].sort((x, y) => x[1] - y[1]).slice(0, ops.size - 500)) ops.delete(k);
    // Événements et curseur dans la même transaction : un arrêt brutal ne crée pas de doublon.
    store.db.transaction(() => {
      if (out.length) store.add(out.map(e => ({ id: crypto.randomUUID(), recu_a: t, ...e, detail: JSON.stringify(e.detail) })));
      if (changed) setting.set('bordure_operateurs_admin_vus', Object.fromEntries(ops));
      setting.set('bordure_curseur', bound);
    })();
    // Silence (arbitrage NC3-2) : plus de battement depuis 20 minutes (Worker retiré, tâche planifiée supprimée, quota
    // épuisé si Cloudflare arrête aussi les tâches planifiées, ce qu'il ne documente pas), ou aucune requête vue en
    // bordure depuis 6 h (routes changées, quota épuisé en « laisser passer »).
    const beat = setting.get('bordure_dernier_battement', null);
    const lastData = setting.get('bordure_derniere_donnee', null) ?? setting.get('bordure_debut', null) ?? (setting.set('bordure_debut', t), t);
    const why = beat && bound - beat.at > HEARTBEAT_SILENCE ? 'plus de battement' : t - lastData > SILENCE ? 'aucune requête vue' : null;
    if (why && !setting.get('bordure_silence_signale', false)) {
      setting.set('bordure_silence_signale', true);
      store.own('vigie_bordure_silence', { emetteur: 'vigie/bordure.js', detail: { raison: why, depuis: new Date(why === 'plus de battement' ? beat.at : lastData).toISOString().slice(0, 16), dernier_etat: beat?.etat || null } });
    } else if (!why) setting.set('bordure_silence_signale', false);
    return out.length;
  }

  const onChange = () => { push().catch(() => {}); };
  decisions.events.on('change', onChange);
  return { push, read, stop: () => { decisions.events.off('change', onChange); clearTimeout(later); } };
}
