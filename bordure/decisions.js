// Blocages de la Vigie appliqués en bordure (phase C3, recadrage du 17 octobre 2026, décision D19). Sans dépendance :
// tourne dans un Cloudflare Worker et dans Node (tests).
//
// La Vigie dépose dans Workers KV une liste signée (Ed25519, même clé que les décisions du site) qui ne contient QUE
// les blocages d'adresses (« usage: bordure ») : ni compte, ni session, ni verrouillage ne quittent le serveur. Mêmes
// garde-fous que le site (server/securite/decisions.js) : signature, liste datée, réseaux /8 à /32 en IPv4 et /32 à /128
// en IPv6, jamais une plage IPv6 qui recouvre l'IPv4 ni la boucle locale, l'équivalent d'un /8 au plus au total,
// 10 000 entrées au plus ; sinon la liste entière est refusée et la bordure laisse passer (le site applique les siennes).

const SCOPES = new Set(['tout', 'admin', 'auth']);
const MAX_ENTRIES = 10_000;
const MAX_IPV4 = 2 ** 24;
const MAX_BLOCK_MS = 30 * 864e5;

// Adresse → { v: 4 | 6, n: BigInt } ; IPv4 dans IPv6 (::ffff:a.b.c.d) ramenée à l'IPv4. null si illisible.
export function parseIp(s) {
  s = String(s || '').trim();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const p = v4.slice(1).map(Number);
    if (p.some(x => x > 255) || v4.slice(1).some(x => x.length > 1 && x.startsWith('0'))) return null;
    return { v: 4, n: BigInt(((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) };
  }
  if (!s.includes(':') || /[^0-9a-fA-F:.]/.test(s)) return null;
  // IPv4 en fin d'adresse (« ::ffff:192.0.2.1 ») : réécrite en deux groupes hexadécimaux.
  const dot = s.lastIndexOf(':');
  if (s.slice(dot + 1).includes('.')) {
    const four = parseIp(s.slice(dot + 1));
    if (!four || four.v !== 4) return null;
    s = `${s.slice(0, dot + 1)}${(four.n >> 16n).toString(16)}:${(four.n & 0xffffn).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const part = h => (h === '' ? [] : h.split(':'));
  const head = part(halves[0]), back = halves.length === 2 ? part(halves[1]) : [];
  const groups = halves.length === 2 ? [...head, ...Array(8 - head.length - back.length).fill('0'), ...back] : head;
  if (groups.length !== 8 || groups.some(g => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  let n = 0n;
  for (const g of groups) n = (n << 16n) | BigInt(parseInt(g, 16));
  if (n >> 32n === 0xffffn) return { v: 4, n: n & 0xffffffffn };            // ::ffff:a.b.c.d
  return { v: 6, n };
}

const bits = v => (v === 4 ? 32n : 128n);
const inside = (block, ip) => block.v === ip.v && (ip.n >> (bits(ip.v) - BigInt(block.prefix))) === (block.n >> (bits(block.v) - BigInt(block.prefix)));
const v6 = (s, p) => ({ ...parseIp(s), v: 6, prefix: p });
// Plages IPv6 qui contiennent tout l'IPv4 (::ffff:0:0/96 est ramené à l'IPv4 par parseIp ; les autres restent IPv6).
const V6_BASES = [v6('::', 96), v6('64:ff9b::', 96), v6('2002::', 16)];
const LOCAL = [{ ...parseIp('127.0.0.0'), prefix: 8 }, { ...parseIp('0.0.0.0'), prefix: 8 }, { ...parseIp('::1'), prefix: 128 }];

// « adresse/préfixe » → bloc, ou null s'il est refusé.
export function parseBlock(s) {
  const m = /^([^/]+)\/(\d{1,3})$/.exec(String(s || ''));
  if (!m) return null;
  if (/^::ffff:/i.test(m[1])) return null;                                    // IPv4 écrite en IPv6 : refusée
  const ip = parseIp(m[1]);
  if (!ip) return null;
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

// Liste signée → { version, emis_a, blocks: [{ v, n, prefix, portee, fin }] } ; lève une erreur si elle est refusée.
export async function acceptEdgeList(signed, pubkeyB64, now = Date.now()) {
  if (!signed || typeof signed.payload !== 'string' || typeof signed.signature !== 'string') throw new Error('liste sans signature');
  const ok = await crypto.subtle.verify({ name: 'Ed25519' }, await publicKey(pubkeyB64), b64(signed.signature), new TextEncoder().encode(signed.payload));
  if (!ok) throw new Error('signature fausse');
  const p = JSON.parse(signed.payload);
  // Séparation des usages : une liste du site (avec comptes et sessions) n'est jamais lue ici, et inversement.
  if (p.usage !== 'bordure') throw new Error('liste qui n’est pas destinée à la bordure');
  if (!Number.isSafeInteger(p.version) || p.version < 0) throw new Error('numéro de liste invalide');
  if (!Number.isFinite(p.emis_a) || p.emis_a > now + 5 * 60e3) throw new Error('liste datée dans le futur');
  const list = Array.isArray(p.blocages) ? p.blocages : [];
  if (list.length > MAX_ENTRIES) throw new Error('trop de blocages');
  const blocks = [];
  let ipv4 = 0;
  for (const b of list) {
    const block = parseBlock(b.cible);
    if (!block) throw new Error(`réseau refusé : ${b.cible}`);
    if (!SCOPES.has(b.portee)) throw new Error(`portée inconnue : ${b.portee}`);
    if (block.v === 4) ipv4 += 2 ** (32 - block.prefix);
    blocks.push({ ...block, portee: b.portee, fin: Math.min(Number(b.fin) || 0, now + MAX_BLOCK_MS) });
  }
  if (ipv4 > MAX_IPV4) throw new Error('trop d’adresses IPv4 bloquées au total');
  return { version: p.version, emis_a: p.emis_a, blocks };
}

// Portée qui bloque cette adresse pour ce chemin (« tout », « admin », « auth »), ou null.
export function blockedScope(list, ip, pathname, now = Date.now()) {
  if (!list || pathname === '/healthz') return null;
  const a = parseIp(ip);
  if (!a) return null;
  const admin = /^\/admin(?:[/?#]|$)|^\/auth\//.test(pathname), auth = /^\/auth\//.test(pathname);
  let found = null;
  for (const b of list.blocks) {
    if (b.fin <= now || !inside(b, a)) continue;
    if (b.portee === 'tout') return 'tout';
    if (b.portee === 'admin' && admin) found = 'admin';
    else if (b.portee === 'auth' && auth && !found) found = 'auth';
  }
  return found;
}
