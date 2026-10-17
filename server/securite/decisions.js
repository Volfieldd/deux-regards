import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

// Décisions de la Vigie appliquées par le site (annexe architecture, section 4.2). Le site les lit (attente longue),
// vérifie la signature Ed25519 avec la clé publique (VIGIE_DECISIONS_PUBKEY) et les applique :
//   - adresse ou réseau bloqué : 403 (tout le site, l'admin, ou la connexion seulement) ;
//   - session révoquée, sessions d'un compte ouvertes avant une date, compte gelé (traité comme désactivé) ;
//   - verrouillage de l'admin : seuls les comptes et adresses listés entrent.
// Garde-fous : signature fausse, liste plus ancienne que la précédente, réseau trop large (/0 à /7 en IPv4, moins de
// /32 en IPv6) ou plus de 10 000 entrées : la liste entière est refusée ; toute décision expire (30 jours au plus,
// verrouillage 24 h). Vigie injoignable : la dernière liste valide (gardée sur disque) s'applique jusqu'à ses fins.
// VIGIE_APPLIQUER=0 : rien n'est appliqué (dernier recours).

const DAY = 864e5;
const MAX = { bloquer: 30 * DAY, session: 2 * DAY, compte: 2 * DAY, gel: 30 * DAY, verrou: DAY + 3600e3 };
const SCOPES = new Set(['tout', 'admin', 'auth']);

export function pubkeyOf(b64) {
  let key;
  try { key = crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' }); } catch { throw new Error('VIGIE_DECISIONS_PUBKEY illisible (base64 d’une clé publique Ed25519)'); }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('VIGIE_DECISIONS_PUBKEY doit être une clé Ed25519');
  return key;
}

const cidr = s => {
  const m = /^([^/]+)\/(\d{1,3})$/.exec(String(s || ''));
  const v = m && net.isIP(m[1]);
  if (!v) return null;
  const p = Number(m[2]);
  if (v === 4 ? p < 8 || p > 32 : p < 32 || p > 128) return null;
  return { address: m[1], prefix: p, type: v === 4 ? 'ipv4' : 'ipv6' };
};
const ipType = ip => (net.isIPv4(ip) ? 'ipv4' : net.isIPv6(ip) ? 'ipv6' : null);
const plainIp = ip => (String(ip).startsWith('::ffff:') && net.isIPv4(String(ip).slice(7)) ? String(ip).slice(7) : String(ip));

export function createDecisionsClient({ url, key, pubkey, storageDir, log, apply = true, fetchImpl = fetch, now = Date.now, onApplied = () => {} }) {
  const cacheFile = path.join(storageDir, 'securite-decisions.json');
  let state = null;                    // { version, emis_a, lists… }
  let running = false, timer = null, controller = null;

  // Liste reçue : vérifiée, contrôlée, puis appliquée en entier (ou pas du tout).
  function accept(signed, { fromCache = false } = {}) {
    if (!signed || typeof signed.payload !== 'string' || typeof signed.signature !== 'string') throw new Error('réponse sans signature');
    if (!crypto.verify(null, Buffer.from(signed.payload), pubkey, Buffer.from(signed.signature, 'base64'))) throw new Error('signature des décisions fausse');
    const p = JSON.parse(signed.payload);
    if (state && p.emis_a < state.emis_a) throw new Error('liste plus ancienne que celle en place');
    const t = now();
    const cap = (fin, max) => Math.min(Number(fin) || 0, t + max);
    const all = [...(p.blocages || []), ...(p.sessions || []), ...(p.comptes || []), ...(p.gels || [])];
    if (all.length > 10_000) throw new Error('trop de décisions (10 000 au plus)');
    const raw = [];
    for (const b of p.blocages || []) {
      const c = cidr(b.cible);
      if (!c) throw new Error(`réseau refusé : ${b.cible}`);
      if (!SCOPES.has(b.portee)) throw new Error(`portée inconnue : ${b.portee}`);
      raw.push({ ...c, portee: b.portee, fin: cap(b.fin, MAX.bloquer) });
    }
    const lock = p.verrouillage && cap(p.verrouillage.fin, MAX.verrou) > t ? {
      fin: cap(p.verrouillage.fin, MAX.verrou),
      comptes: new Set((p.verrouillage.comptes || []).map(String)),
      adresses: (() => { const l = new net.BlockList(); for (const a of p.verrouillage.adresses || []) { const c = cidr(a); if (c) l.addSubnet(c.address, c.prefix, c.type); } return l; })(),
    } : null;
    if (lock && !lock.comptes.size && !(p.verrouillage.adresses || []).length) throw new Error('verrouillage sans aucun compte ni adresse autorisés');
    const live = (list, max) => new Map((list || []).map(x => [x.key, cap(x.fin, max)]).filter(([, f]) => f > t));
    state = {
      version: p.version, emis_a: p.emis_a, raw, blocks: null, nextExpiry: 0,
      sessions: live((p.sessions || []).map(s => ({ key: String(s.prefixe), fin: s.fin })), MAX.session),
      comptes: new Map((p.comptes || []).filter(c => cap(c.fin, MAX.compte) > t).map(c => [String(c.sub), { avant: Number(c.avant) || 0, fin: cap(c.fin, MAX.compte) }])),
      gels: live((p.gels || []).map(g => ({ key: String(g.sub), fin: g.fin })), MAX.gel),
      lock,
      counts: { blocages: (p.blocages || []).length, sessions: (p.sessions || []).length, comptes: (p.comptes || []).length, gels: (p.gels || []).length, verrouillage: Boolean(lock) },
    };
    if (!fromCache) {
      try {
        const tmp = `${cacheFile}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(signed), { mode: 0o600 });
        fs.renameSync(tmp, cacheFile);
      } catch (err) { log?.warn({ err: err.message }, 'Vigie : décisions non gardées sur le disque'); }
    }
    build(t);
    onApplied(state);
    return state;
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
      const text = await res.text();
      if (res.status !== 200) throw new Error(`Vigie : réponse ${res.status}`);
      if (text.length > 4 * 1024 * 1024) throw new Error('liste de décisions trop grande');
      return accept(JSON.parse(text));
    } finally { clearTimeout(t); }
  }

  const t = () => now();
  const live = (map, k) => { const f = map?.get(k); return f && (typeof f === 'number' ? f : f.fin) > t() ? map.get(k) : null; };
  const on = () => apply && state;
  return {
    poll,
    accept,
    get state() { return state; },
    // Adresse bloquée pour ce chemin ? Renvoie la portée, ou null.
    blocked(ip, pathname) {
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
    // Session à fermer ? (empreinte révoquée, compte révoqué avant sa création, compte gelé)
    sessionDenied(session) {
      if (!on() || !session) return null;
      const id = String(session.id || '');
      for (const [prefix, fin] of state.sessions) if (fin > t() && id.startsWith(prefix)) return 'session révoquée';
      const c = live(state.comptes, session.sub);
      if (c && session.created_at < c.avant) return 'sessions du compte révoquées';
      if (live(state.gels, session.sub)) return 'compte gelé';
      return null;
    },
    frozen: sub => Boolean(on() && live(state.gels, sub)),
    // Verrouillage de l'admin : null (pas de verrouillage) ; sinon vrai si ce compte ou cette adresse peut entrer.
    lockAllows(sub, ip) {
      if (!on() || !state.lock || state.lock.fin <= t()) return null;
      if (sub && state.lock.comptes.has(sub)) return true;
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
    },
    stop() { running = false; clearTimeout(timer); controller?.abort(); },
  };
}
