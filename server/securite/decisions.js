import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

// Décisions de la Vigie appliquées par le site (annexe architecture, section 4.2). Le site les lit (attente longue),
// vérifie la signature Ed25519 avec la clé publique (VIGIE_DECISIONS_PUBKEY) et les applique :
//   - adresse ou réseau bloqué : 403 (tout le site, l'admin, ou la connexion seulement) ;
//   - session révoquée, sessions d'un compte ouvertes avant une date, compte gelé (traité comme désactivé) ;
//   - verrouillage de l'admin : seuls les comptes et adresses listés entrent ;
//   - vérification d'identité d'un compte (décision verifier_identite, 7 jours au plus) : une session authentifiée chez
//     Zitadel avant le début de la décision n'écrit plus rien dans l'admin sans une nouvelle authentification du même
//     compte (server/auth.js, requireFreshIdentity) ; les comptes de l'amorce (ADMIN_SUBS) n'en sont pas exemptés (rien ne
//     les tient dehors : ils confirment leur identité comme les autres) ;
//   - accès d'une galerie privée suspendu (registre des briques, BV-18) : par app.spaces.suspend(acces), une fois par
//     décision ; sans galeries privées (spaces absent, ou sans suspend), la liste est acceptée et ces entrées ignorées.
// Garde-fous : signature fausse, liste plus ancienne que la précédente, réseau trop large (/0 à /7 en IPv4, moins de
// /32 en IPv6) ou plus de 10 000 entrées : la liste entière est refusée ; toute décision expire (30 jours au plus,
// verrouillage 24 h). Vigie injoignable : la dernière liste valide (gardée sur disque) s'applique jusqu'à ses fins.
// VIGIE_APPLIQUER=0 : rien n'est appliqué (dernier recours).

const DAY = 864e5;
const MAX = { bloquer: 30 * DAY, session: 2 * DAY, compte: 2 * DAY, gel: 30 * DAY, verrou: DAY + 3600e3, acces: 30 * DAY, verif: 7 * DAY };
const SCOPES = new Set(['tout', 'admin', 'auth']);

export function pubkeyOf(b64) {
  let key;
  try { key = crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' }); } catch { throw new Error('VIGIE_DECISIONS_PUBKEY illisible (base64 d’une clé publique Ed25519)'); }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('VIGIE_DECISIONS_PUBKEY doit être une clé Ed25519');
  return key;
}

// Plages IPv6 qui contiennent tout l'IPv4 (IPv4 dans IPv6, NAT64, 6to4) et plages locales : jamais bloquées (une seule
// entrée ne doit pas pouvoir couper tous les visiteurs IPv4, ni la vérification de santé).
const V6_IPV4 = new net.BlockList();
const V6_BASES = [['::ffff:0:0', 96], ['::', 96], ['64:ff9b::', 96], ['2002::', 16]];
for (const [a, p] of V6_BASES) V6_IPV4.addSubnet(a, p, 'ipv6');
const LOCAL = new net.BlockList();
LOCAL.addSubnet('127.0.0.0', 8, 'ipv4'); LOCAL.addSubnet('0.0.0.0', 8, 'ipv4'); LOCAL.addAddress('::1', 'ipv6');
const MAX_IPV4 = 2 ** 24;                                         // l'équivalent d'un /8 au plus, au total
const cidr = s => {
  const m = /^([^/]+)\/(\d{1,3})$/.exec(String(s || ''));
  const v = m && net.isIP(m[1]);
  if (!v) return null;
  const p = Number(m[2]);
  if (v === 4 ? p < 8 || p > 32 : p < 32 || p > 128) return null;
  const type = v === 4 ? 'ipv4' : 'ipv6';
  if (LOCAL.check(m[1], type)) return null;
  if (v === 6) {
    const t = new net.BlockList(); t.addSubnet(m[1], p, 'ipv6');
    if (V6_IPV4.check(m[1], 'ipv6') || V6_BASES.some(([a]) => t.check(a, 'ipv6'))) return null;
  }
  return { address: m[1], prefix: p, type, size: v === 4 ? 2 ** (32 - p) : 0 };
};
const SESSION_PREFIX = /^[0-9a-f]{12,64}$/;

// Corps lu par morceaux, abandonné au-delà de max octets (une Vigie malveillante ne remplit pas la mémoire du site).
async function readLimited(res, max) {
  if (!res.body?.getReader) { const t = await res.text(); if (t.length > max) throw new Error('réponse trop grande'); return t; }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); throw new Error('liste de décisions trop grande'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
const ipType = ip => (net.isIPv4(ip) ? 'ipv4' : net.isIPv6(ip) ? 'ipv6' : null);
const plainIp = ip => (String(ip).startsWith('::ffff:') && net.isIPv4(String(ip).slice(7)) ? String(ip).slice(7) : String(ip));

// spaces : () => app.spaces (galeries privées), lu au moment d'appliquer ; facultatif.
export function createDecisionsClient({ url, key, pubkey, storageDir, log, apply = true, adminSubs = [], fetchImpl = fetch, now = Date.now, onApplied = () => {}, spaces = () => null }) {
  const owners = new Set(adminSubs);                // ADMIN_SUBS : jamais gelés ni tenus dehors par un verrouillage
  const cacheFile = path.join(storageDir, 'securite-decisions.json');
  let state = null;                    // { version, emis_a, lists… }
  let running = false, timer = null, controller = null;
  // Optimisation locale seulement : les reçus de spaces.suspend, atomiques avec l'effet, font foi après redémarrage.
  const suspended = new Map();
  // Les anciens caches ne distinguent pas un échec d'une suspension levée par l'équipe : vérification manuelle choisie
  // par le propriétaire. Ce marqueur local n'est jamais lu dans une réponse HTTP (il ne fait pas partie de la signature).
  let historiques = new Map();

  // Liste reçue : vérifiée, contrôlée, puis appliquée en entier (ou pas du tout).
  function accept(signed, { fromCache = false } = {}) {
    if (!signed || typeof signed.payload !== 'string' || typeof signed.signature !== 'string') throw new Error('réponse sans signature');
    if (!crypto.verify(null, Buffer.from(signed.payload), pubkey, Buffer.from(signed.signature, 'base64'))) throw new Error('signature des décisions fausse');
    const p = JSON.parse(signed.payload);
    // Liste destinée à la bordure (blocages seuls, même clé) : jamais lue ici, elle effacerait révocations et gels.
    // Liste sans « usage » : seulement celle gardée sur le disque avant ce changement (une liste reçue doit le dire).
    if (fromCache ? p.usage !== undefined && p.usage !== 'site' : p.usage !== 'site') throw new Error('liste qui n’est pas destinée au site');
    const t = now();
    if (!Number.isSafeInteger(p.version) || p.version < 0) throw new Error('numéro de liste invalide');
    if (!Number.isFinite(p.emis_a) || p.emis_a > t + 5 * 60e3) throw new Error('liste datée dans le futur');
    // Plus ancienne que celle en place : refusée, sauf si elle est fraîche à notre horloge (horloge de la Vigie revenue
    // en arrière, base de la Vigie restaurée) — jamais bloqué sur une vieille liste.
    if (state && p.emis_a < state.emis_a && t - p.emis_a > 5 * 60e3) throw new Error('liste plus ancienne que celle en place');
    if (state && signed.payload === state.payload) {
      if (apply) suspendAccesses(state.acces); // attente longue écoulée : les échecs restent à retenter
      return state;
    }
    const cap = (fin, max) => Math.min(Number(fin) || 0, t + max);
    // Vérifications d'identité (liste absente d'une Vigie d'avant ce genre : aucune).
    if (p.verifications != null && !Array.isArray(p.verifications)) throw new Error('vérifications d’identité invalides');
    const all = [...(p.blocages || []), ...(p.sessions || []), ...(p.comptes || []), ...(p.gels || []), ...(p.acces || []), ...(p.verifications || [])];
    if (all.length > 10_000) throw new Error('trop de décisions (10 000 au plus)');
    const raw = [];
    let ipv4 = 0;
    for (const b of p.blocages || []) {
      const c = cidr(b.cible);
      if (!c) throw new Error(`réseau refusé : ${b.cible}`);
      if (!SCOPES.has(b.portee)) throw new Error(`portée inconnue : ${b.portee}`);
      ipv4 += c.size;
      raw.push({ ...c, portee: b.portee, fin: cap(b.fin, MAX.bloquer) });
    }
    if (ipv4 > MAX_IPV4) throw new Error('trop d’adresses IPv4 bloquées au total');
    for (const s of p.sessions || []) if (!SESSION_PREFIX.test(String(s.prefixe))) throw new Error('empreinte de session invalide');
    for (const a of p.acces || []) if (!Number.isSafeInteger(a?.id) || a.id < 1 || !Number.isFinite(a.depuis)) throw new Error('accès de galerie privée invalide');
    for (const v of p.verifications || []) if (typeof v?.sub !== 'string' || !v.sub || v.sub.length > 200 || !Number.isFinite(v.depuis)) throw new Error('vérification d’identité invalide');
    const acces = (p.acces || []).filter(a => cap(a.fin, MAX.acces) > t).map(a => ({ id: a.id, depuis: a.depuis, fin: cap(a.fin, MAX.acces) }));
    const lock = p.verrouillage && cap(p.verrouillage.fin, MAX.verrou) > t ? {
      fin: cap(p.verrouillage.fin, MAX.verrou),
      comptes: new Set((p.verrouillage.comptes || []).map(String)),
      adresses: (() => { const l = new net.BlockList(); for (const a of p.verrouillage.adresses || []) { const c = cidr(a); if (c) l.addSubnet(c.address, c.prefix, c.type); } return l; })(),
    } : null;
    if (lock && !lock.comptes.size && !(p.verrouillage.adresses || []).length) throw new Error('verrouillage sans aucun compte ni adresse autorisés');
    // Plusieurs décisions sur la même cible : la plus longue l'emporte.
    const live = (list, max) => { const m = new Map(); for (const x of list || []) { const f = cap(x.fin, max); if (f > t && f > (m.get(x.key) || 0)) m.set(x.key, f); } return m; };
    state = {
      version: p.version, emis_a: p.emis_a, payload: signed.payload, raw, blocks: null, nextExpiry: 0,
      sessions: live((p.sessions || []).map(s => ({ key: String(s.prefixe), fin: s.fin })), MAX.session),
      comptes: (() => { const m = new Map(); for (const c of p.comptes || []) { const fin = cap(c.fin, MAX.compte), k = String(c.sub), prev = m.get(k); if (fin > t) m.set(k, { avant: Math.max(Number(c.avant) || 0, prev?.avant || 0), fin: Math.max(fin, prev?.fin || 0) }); } return m; })(),
      gels: live((p.gels || []).map(g => ({ key: String(g.sub), fin: g.fin })), MAX.gel),
      // Plusieurs vérifications sur le même compte : la plus récente (« depuis ») et la plus longue l’emportent. Un début
      // daté après la réception (horloge de la Vigie en avance) est ramené à maintenant : jamais une vérification impossible.
      verifs: (() => { const m = new Map(); for (const v of p.verifications || []) { const fin = cap(v.fin, MAX.verif), prev = m.get(v.sub); if (fin > t) m.set(v.sub, { depuis: Math.max(Math.min(Number(v.depuis), t), prev?.depuis || 0), fin: Math.max(fin, prev?.fin || 0) }); } return m; })(),
      lock,
      acces,
      counts: { blocages: (p.blocages || []).length, sessions: (p.sessions || []).length, comptes: (p.comptes || []).length, gels: (p.gels || []).length, verrouillage: Boolean(lock), acces: acces.length, verifications: (p.verifications || []).length },
    };
    const cles = new Set(acces.map(a => `${a.id}|${a.depuis}`));
    if (fromCache) {
      const suivi = signed.suspensions;
      const valide = suivi?.version === 1 && Array.isArray(suivi.historiques) && suivi.historiques.length <= 10_000 &&
        suivi.historiques.every(x => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && x[0].length <= 100 && Number.isFinite(x[1]));
      historiques = new Map(valide ? suivi.historiques : acces.map(a => [`${a.id}|${a.depuis}`, a.fin]));
      for (const a of acces) if (historiques.has(`${a.id}|${a.depuis}`)) log?.warn({ acces: a.id, depuis: a.depuis }, 'Vigie : ancienne suspension, vérification manuelle requise');
    }
    for (const a of acces) {
      const k = `${a.id}|${a.depuis}`;
      if (historiques.has(k)) historiques.set(k, Math.max(historiques.get(k), a.fin));
    }
    // Une liste transitoirement vide n'efface pas les cas ambigus : une ancienne liste fraîche peut encore revenir.
    for (const [k, fin] of historiques) if (fin <= t) historiques.delete(k);
    for (const k of suspended.keys()) if (!cles.has(k)) suspended.delete(k);
    if (apply) suspendAccesses(acces);
    if (!fromCache) {
      try {
        const tmp = `${cacheFile}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ payload: signed.payload, signature: signed.signature,
          suspensions: { version: 1, historiques: [...historiques] } }), { mode: 0o600 });
        fs.renameSync(tmp, cacheFile);
      } catch (err) { log?.warn({ err: err.message }, 'Vigie : décisions non gardées sur le disque'); }
    }
    build(t);
    onApplied(state);
    return state;
  }
  // Accès à suspendre : chacun une fois. Galeries privées absentes (avant leur mise en service, ou sans app.spaces) :
  // rien, sans erreur ; un échec du site est noté au journal et retenté à la réception suivante, même de la même liste.
  function suspendAccesses(list) {
    let s = null;
    try { s = spaces(); } catch { s = null; }
    if (!list.length || typeof s?.suspend !== 'function') return;
    for (const a of list) {
      const k = `${a.id}|${a.depuis}`;
      if (a.fin <= now() || historiques.has(k) || (suspended.get(k) || 0) >= a.fin) continue;
      try {
        if (s.suspend(a.id, 'vigie', { depuis: a.depuis, fin: a.fin }) !== true) {
          log?.warn({ acces: a.id }, 'Vigie : suspension d’un accès non appliquée, nouvelle tentative à la prochaine liste');
          continue;
        }
        suspended.set(k, a.fin);
        log?.info({ acces: a.id }, 'Vigie : accès de galerie privée suspendu');
      } catch (err) { log?.warn({ err: err.message, acces: a.id }, 'Vigie : suspension d’un accès impossible'); }
    }
  }
  // Listes de blocage reconstruites sans les entrées échues (une BlockList ne se vide pas entrée par entrée).
  function build(t) {
    const blocks = { tout: new net.BlockList(), admin: new net.BlockList(), auth: new net.BlockList() };
    let next = Infinity, n = 0;
    for (const b of state.raw) if (b.fin > t) { blocks[b.portee].addSubnet(b.address, b.prefix, b.type); next = Math.min(next, b.fin); n += 1; }
    state.blocks = n ? blocks : null;
    state.nextExpiry = next;
  }

  // Au démarrage : la dernière liste valide.
  try { if (fs.existsSync(cacheFile)) accept(JSON.parse(fs.readFileSync(cacheFile, 'utf8')), { fromCache: true }); } catch (err) { log?.warn({ err: err.message }, 'Vigie : décisions gardées illisibles, ignorées'); }

  const signedGet = p => {
    const ts = String(now());
    const nonce = crypto.randomBytes(16).toString('hex');
    return { 'x-vigie-ts': ts, 'x-vigie-nonce': nonce, 'x-vigie-sig': crypto.createHmac('sha256', key).update(`${ts}.${nonce}.GET ${p}`).digest('hex') };
  };
  async function poll() {
    const p = `/v1/decisions?depuis=${state?.version ?? -1}`;
    controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 35000);
    try {
      const res = await fetchImpl(`${url}${p}`, { headers: signedGet(p), redirect: 'manual', signal: controller.signal });
      if (res.status !== 200) { await res.body?.cancel?.().catch(() => {}); throw new Error(`Vigie : réponse ${res.status}`); }
      const text = await readLimited(res, 4 * 1024 * 1024);
      return accept(JSON.parse(text));
    } finally { clearTimeout(t); }
  }

  // Résumé des alertes pour l'admin (phase D) : signé par la Vigie (usage « resume »), frais de 5 minutes ; ni adresse
  // ni compte. null tant qu'il n'est pas lu, ou s'il est refusé.
  let summary = null;
  // Première lecture manquée depuis le dernier résumé reçu (Vigie injoignable, réponse refusée) : l'admin dit
  // « indisponible depuis » cette heure-là.
  let summaryFailedAt = null;
  const COUNT = /^\d{1,6}$/;
  function acceptSummary(signed) {
    if (!signed || typeof signed.payload !== 'string' || typeof signed.signature !== 'string') throw new Error('résumé sans signature');
    if (!crypto.verify(null, Buffer.from(signed.payload), pubkey, Buffer.from(signed.signature, 'base64'))) throw new Error('signature du résumé fausse');
    const p = JSON.parse(signed.payload);
    if (p.usage !== 'resume') throw new Error('pas un résumé');
    if (!Number.isFinite(p.emis_a) || Math.abs(now() - p.emis_a) > 5 * 60e3) throw new Error('résumé périmé');
    const o = p.ouvertes || {};
    const n = k => (COUNT.test(String(o[k])) ? Number(o[k]) : 0);
    // Ni titre ni règle (un attaquant devenu administrateur du site n'apprend pas ce qui l'a vu) : la gravité, la date
    // et le numéro de l'alerte, pour le lien vers la console.
    const worst = p.plus_grave && Number.isSafeInteger(p.plus_grave.id) ? { id: p.plus_grave.id, gravite: ['critique', 'haut', 'moyen', 'bas'].includes(p.plus_grave.gravite) ? p.plus_grave.gravite : 'moyen', depuis: Number(p.plus_grave.depuis) || null } : null;
    summary = { recu_a: now(), ouvertes: { critique: n('critique'), haut: n('haut'), moyen: n('moyen'), bas: n('bas') }, plus_grave: worst,
      critique_a_prendre: p.critique_a_prendre === true, console: /^https:\/\/[^\s"<>]+$/.test(p.console || '') ? p.console : null };
    summaryFailedAt = null;
    return summary;
  }
  async function pollSummary() {
    const p = '/v1/resume';
    try {
      const res = await fetchImpl(`${url}${p}`, { headers: signedGet(p), redirect: 'manual', signal: AbortSignal.timeout(10000) });
      if (res.status !== 200) { await res.body?.cancel?.().catch(() => {}); throw new Error(`Vigie : réponse ${res.status}`); }
      return acceptSummary(JSON.parse(await readLimited(res, 64 * 1024)));
    } catch (err) { summaryFailedAt ??= now(); throw err; }
  }
  let summaryTimer = null;

  const t = () => now();
  const live = (map, k) => { const f = map?.get(k); return f && (typeof f === 'number' ? f : f.fin) > t() ? map.get(k) : null; };
  const on = () => apply && state;
  return {
    poll,
    accept,
    acceptSummary,
    pollSummary,
    // Résumé lu il y a moins de 5 minutes, sinon null (Vigie injoignable : l'admin le dit au lieu d'afficher un vieux
    // « aucune alerte »).
    get summary() { return summary && now() - summary.recu_a < 5 * 60e3 ? summary : null; },
    // Dernier résumé reçu, même périmé (recu_a : son heure), et l'heure de la première lecture manquée depuis : l'admin
    // montre le dernier état connu, daté, au lieu de rien (jamais un faux « aucune alerte »). null : jamais reçu.
    get lastSummary() { return summary; },
    get summaryFailedAt() { return summaryFailedAt; },
    get state() { return state; },
    // Adresse bloquée pour ce chemin ? Renvoie la portée, ou null. pathname : gabarit de la route ou chemin décodé
    // (jamais l'adresse brute, que le routeur décode : « /%61dmin » est « /admin »).
    blocked(ip, pathname) {
      if (pathname === '/healthz') return null;
      if (!on()) return null;
      if (t() >= state.nextExpiry) build(t());
      if (!state.blocks) return null;
      const a = plainIp(ip), type = ipType(a);
      if (!type) return null;
      if (state.blocks.tout.check(a, type)) return 'tout';
      if (/^\/admin(?:[/?#]|$)|^\/auth\//.test(pathname) && state.blocks.admin.check(a, type)) return 'admin';
      if (/^\/auth\//.test(pathname) && state.blocks.auth.check(a, type)) return 'auth';
      return null;
    },
    // Session à fermer ? (empreinte révoquée, compte révoqué avant sa création, compte gelé, admin verrouillée pour ce
    // compte et cette adresse)
    sessionDenied(session, ip) {
      if (!on() || !session) return null;
      const id = String(session.id || '');
      for (const [prefix, fin] of state.sessions) if (fin > t() && id.startsWith(prefix)) return 'session révoquée';
      const c = live(state.comptes, session.sub);
      if (c && session.created_at < c.avant) return 'sessions du compte révoquées';
      if (this.frozen(session.sub)) return 'compte gelé';
      if (this.lockAllows(session.sub, ip) === false) return 'administration verrouillée';
      return null;
    },
    frozen: sub => Boolean(on() && !owners.has(sub) && live(state.gels, sub)),
    // Vérification d'identité en cours pour ce compte : { depuis, fin }, ou null.
    verification: sub => (on() && sub ? live(state.verifs, String(sub)) : null),
    // Session qui doit confirmer son identité avant d'écrire : authentifiée (auth_time) avant le début de la vérification.
    // Sans heure d'authentification (session d'avant la migration 058, IdP muet), la session est tenue pour ancienne.
    identityRequired(session) {
      if (!session) return null;
      const v = this.verification(session.sub);
      if (!v) return null;
      return (Number(session.auth_time) || 0) >= v.depuis ? null : v;
    },
    // Verrouillage de l'admin : null (pas de verrouillage) ; sinon vrai si ce compte ou cette adresse peut entrer.
    lockAllows(sub, ip) {
      if (!on() || !state.lock || state.lock.fin <= t()) return null;
      if (sub && (state.lock.comptes.has(sub) || owners.has(sub))) return true;
      const a = plainIp(ip), type = ipType(a);
      return Boolean(type && state.lock.adresses.check(a, type));
    },
    start() {
      running = true;
      let wait = 1000;
      const loop = async () => {
        if (!running) return;
        try { await poll(); wait = 1000; } catch (err) {
          if (running) log?.warn({ err: err.message }, 'Vigie : décisions non lues');
          wait = Math.min(wait * 2, 60e3);
        }
        if (running) { timer = setTimeout(loop, wait === 1000 ? 0 : wait); timer.unref?.(); }
      };
      timer = setTimeout(loop, 0); timer.unref?.();
      // Résumé : chaque minute.
      const sum = async () => { try { await pollSummary(); } catch (err) { if (running) log?.warn({ err: err.message }, 'Vigie : résumé non lu'); } };
      sum();
      summaryTimer = setInterval(sum, 60e3); summaryTimer.unref?.();
    },
    stop() { running = false; clearTimeout(timer); clearInterval(summaryTimer); controller?.abort(); },
  };
}
