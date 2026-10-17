// Blocages de la Vigie appliqués en bordure (phase C3, recadrage du 17 octobre 2026, décision D19). Sans dépendance :
// tourne dans un Cloudflare Worker et dans Node (tests).
//
// La Vigie dépose dans Workers KV une liste signée (Ed25519, même clé que les décisions du site) qui ne contient QUE
// les blocages d'adresses (« usage: bordure ») : ni compte, ni session, ni verrouillage ne quittent le serveur. Mêmes
// garde-fous que le site (server/securite/decisions.js) : réseaux /8 à /32 en IPv4 et /32 à /128 en IPv6, jamais une
// plage IPv6 qui recouvre l'IPv4 ni la boucle locale, l'équivalent d'un /8 au plus au total.
// Revue du 17 octobre 2026 :
//   - coût borné (10 ms de calcul par requête sur l'offre gratuite) : IPv4 en nombres ordinaires, adresses seules dans
//     un ensemble, 1 000 entrées au plus (la Vigie envoie les décisions manuelles puis les plus récentes ; le site, lui,
//     applique toute la liste) : environ 4 ms de calcul pour 1 000 entrées ; une liste inchangée n'est pas relue ;
//   - une entrée illisible est écartée seule (comptée) au lieu de faire refuser toute la liste ; la liste entière est
//     refusée pour une signature fausse, un autre usage, une date future, une liste de plus de 24 h (la Vigie la
//     republie toutes les 6 h ; une vieille liste rejouée dans KV ne ramène pas un blocage levé), ou trop d'adresses.

const SCOPES = new Set(['tout', 'admin', 'auth']);
export const MAX_EDGE_ENTRIES = 1_000;
const MAX_IPV4 = 2 ** 24;
const MAX_BLOCK_MS = 30 * 864e5;
const MAX_AGE = 24 * 3600e3;

// Adresse → { v: 4, n: Number } ou { v: 6, n: BigInt } ; IPv4 dans IPv6 (::ffff:a.b.c.d) ramenée à l'IPv4 (mapped:
// true). null si illisible.
export function parseIp(s) {
  s = String(s || '').trim();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const p = v4.slice(1).map(Number);
    if (p.some(x => x > 255) || v4.slice(1).some(x => x.length > 1 && x.startsWith('0'))) return null;
    return { v: 4, n: p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3] };
  }
  if (!s.includes(':') || s.length > 45 || /[^0-9a-fA-F:.]/.test(s)) return null;
  // IPv4 en fin d'adresse (« ::ffff:192.0.2.1 ») : réécrite en deux groupes hexadécimaux.
  const dot = s.lastIndexOf(':');
  if (s.slice(dot + 1).includes('.')) {
    const four = parseIp(s.slice(dot + 1));
    if (!four || four.v !== 4) return null;
    s = `${s.slice(0, dot + 1)}${Math.floor(four.n / 65536).toString(16)}:${(four.n % 65536).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const part = h => (h === '' ? [] : h.split(':'));
  const head = part(halves[0]), back = halves.length === 2 ? part(halves[1]) : [];
  if (halves.length === 2 && head.length + back.length > 7) return null;
  const groups = halves.length === 2 ? [...head, ...Array(8 - head.length - back.length).fill('0'), ...back] : head;
  if (groups.length !== 8 || groups.some(g => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  let n = 0n;
  for (const g of groups) n = (n << 16n) | BigInt(parseInt(g, 16));
  if (n >> 32n === 0xffffn) return { v: 4, n: Number(n & 0xffffffffn), mapped: true };   // ::ffff:a.b.c.d
  return { v: 6, n };
}

const inside = (block, ip) => {
  if (block.v !== ip.v) return false;
  if (ip.v === 4) { const d = 2 ** (32 - block.prefix); return Math.floor(ip.n / d) === Math.floor(block.n / d); }
  const s = BigInt(128 - block.prefix);
  return (ip.n >> s) === (block.n >> s);
};
const v6 = (s, p) => ({ ...parseIp(s), v: 6, prefix: p });
// Plages IPv6 qui contiennent tout l'IPv4 (::ffff:0:0/96 est ramené à l'IPv4 par parseIp ; les autres restent IPv6).
const V6_BASES = [v6('::', 96), v6('64:ff9b::', 96), v6('2002::', 16)];
const LOCAL = [{ ...parseIp('127.0.0.0'), prefix: 8 }, { ...parseIp('0.0.0.0'), prefix: 8 }, { ...parseIp('::1'), prefix: 128 }];

// « adresse/préfixe » → bloc, ou null s'il est refusé. IPv4 : chemin rapide (une expression, aucun objet
// intermédiaire), l'essentiel d'une liste.
const V4_BLOCK = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\/(\d{1,2})$/;
export function parseBlock(s) {
  const f = V4_BLOCK.exec(s);
  if (f) {
    const a = +f[1], b = +f[2], c = +f[3], d = +f[4], prefix = +f[5];
    if (a > 255 || b > 255 || c > 255 || d > 255 || prefix < 8 || prefix > 32 || a === 127 || a === 0) return null;
    return { v: 4, n: a * 16777216 + b * 65536 + c * 256 + d, prefix };
  }
  const m = /^([^/]+)\/(\d{1,3})$/.exec(String(s || ''));
  if (!m) return null;
  const ip = parseIp(m[1]);
  if (!ip || ip.mapped) return null;                                          // IPv4 écrite en IPv6 : refusée
  const prefix = Number(m[2]);
  if (ip.v === 4 ? prefix < 8 || prefix > 32 : prefix < 32 || prefix > 128) return null;
  const block = { ...ip, prefix };
  if (LOCAL.some(l => inside(l, ip))) return null;
  if (ip.v === 6 && V6_BASES.some(b => inside(b, ip) || inside(block, b))) return null;
  return block;
}

const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let keyCache = { b64: null, key: null };
async function publicKey(spkiB64) {
  if (keyCache.b64 !== spkiB64) keyCache = { b64: spkiB64, key: await crypto.subtle.importKey('spki', b64(spkiB64), { name: 'Ed25519' }, false, ['verify']) };
  return keyCache.key;
}

// Liste signée → { version, emis_a, payload, exact: Map(nombre → [{portee, fin}]), blocks: [...], ignorees } ; lève une
// erreur si la liste entière est refusée. previous : liste en place (même texte : reprise telle quelle ; version plus
// ancienne : refusée).
export async function acceptEdgeList(signed, pubkeyB64, now = Date.now(), previous = null) {
  if (!signed || typeof signed.payload !== 'string' || typeof signed.signature !== 'string') throw new Error('liste sans signature');
  if (previous && previous.payload === signed.payload && previous.signature === signed.signature) {
    if (now - previous.emis_a > MAX_AGE) throw new Error('liste de plus de 24 h');
    return previous;
  }
  const ok = await crypto.subtle.verify({ name: 'Ed25519' }, await publicKey(pubkeyB64), b64(signed.signature), new TextEncoder().encode(signed.payload));
  if (!ok) throw new Error('signature fausse');
  const p = JSON.parse(signed.payload);
  // Séparation des usages : une liste du site (avec comptes et sessions) n'est jamais lue ici, et inversement.
  if (p.usage !== 'bordure') throw new Error('liste qui n’est pas destinée à la bordure');
  if (!Number.isSafeInteger(p.version) || p.version < 0) throw new Error('numéro de liste invalide');
  if (!Number.isFinite(p.emis_a) || p.emis_a > now + 5 * 60e3) throw new Error('liste datée dans le futur');
  if (now - p.emis_a > MAX_AGE) throw new Error('liste de plus de 24 h');
  if (previous && p.version < previous.version) throw new Error('liste plus ancienne que celle en place');
  const list = Array.isArray(p.blocages) ? p.blocages : [];
  if (list.length > MAX_EDGE_ENTRIES) throw new Error('trop de blocages');
  const exact = new Map(), blocks = [];
  let ipv4 = 0, ignorees = 0;
  for (const b of list) {
    const block = parseBlock(b?.cible);
    if (!block || !SCOPES.has(b.portee)) { ignorees += 1; continue; }
    const entry = { portee: b.portee, fin: Math.min(Number(b.fin) || 0, now + MAX_BLOCK_MS) };
    if (block.v === 4) ipv4 += 2 ** (32 - block.prefix);
    if (block.v === 4 && block.prefix === 32) { const l = exact.get(block.n) || []; l.push(entry); exact.set(block.n, l); } else blocks.push({ ...block, ...entry });
  }
  if (ipv4 > MAX_IPV4) throw new Error('trop d’adresses IPv4 bloquées au total');
  return { version: p.version, emis_a: p.emis_a, payload: signed.payload, signature: signed.signature, exact, blocks, ignorees };
}

// Portée qui bloque cette adresse pour ce chemin (« tout », « admin », « auth »), ou null. pathname : chemin décodé.
export function blockedScope(list, ip, pathname, now = Date.now()) {
  if (!list || pathname === '/healthz') return null;
  const a = parseIp(ip);
  if (!a) return null;
  const admin = /^\/admin(?:[/?#]|$)|^\/auth\//.test(pathname), auth = /^\/auth\//.test(pathname);
  let found = null;
  const consider = e => {
    if (e.fin <= now) return false;
    if (e.portee === 'tout') return true;
    if (e.portee === 'admin' && admin) found = 'admin';
    else if (e.portee === 'auth' && auth && !found) found = 'auth';
    return false;
  };
  if (a.v === 4) for (const e of list.exact.get(a.n) || []) if (consider(e)) return 'tout';
  for (const b of list.blocks) if (inside(b, a) && consider(b)) return 'tout';
  return found;
}

// Chemin comme le voit le routeur du site : décodé (« /%61dmin » est « /admin »), barres doublées réduites. Utilisé
// des deux côtés (Worker et site) pour décider et pour signer.
export function routePath(raw) {
  let p = String(raw || '/').split('?')[0];
  try { p = decodeURIComponent(p); } catch { /* laissé tel quel */ }
  return p.replace(/\/{2,}/g, '/');
}
