// Adresses IP : forme canonique et réseau d'une adresse, communs au site et à la Vigie (seul calcul du /24 et du /48 :
// server/ip.js truncateIp, vigie/util.js netOf, vigie/console/format.js, vigie/decisions.js parseTarget ; audit D3-C4, D3-D5).
// Sans dépendance hors de Node (l'image de la Vigie ne reprend que ce fichier du site, avec le vocabulaire).
//
// Réseau d'une adresse : les bits au-delà du préfixe mis à zéro, écrit sous sa forme canonique (RFC 5952 en IPv6 : minuscules,
// sans zéro de tête, la plus longue suite de groupes nuls repliée en « :: », la première à longueur égale, jamais un groupe
// seul) : « 198.51.100.7 » /24 → « 198.51.100.0 », « 2606:4700::1a » /48 → « 2606:4700:: », « 2a01::bad:5 » /48 → « 2a01:: ».
// Avant ce module, le /48 prenait les trois premiers morceaux du texte : faux dès que « :: » tombait dans ces trois groupes
// (« 2a01::bad:5 » donnait « 2a01::bad:: », l'hôte compris ; « 2606:4700::1a » donnait « 2606:4700::: », clé invalide).
// Ces anciennes clés restent dans le journal chaîné de la Vigie (events.ip_net, jamais réécrit) : cleReseau les relit,
// formesReseau donne ce qu'il faut chercher pour les retrouver.
import net from 'node:net';

// « 198.51.100.7 » → [198, 51, 100, 7] (écriture décimale stricte), sinon null.
export function octets4(s) {
  const t = String(s ?? '');
  return net.isIPv4(t) ? t.split('.').map(Number) : null;
}

// Une IPv6 (abrégée ou non, IPv4 en fin comprise ; identifiant de zone « %eth0 » ignoré) → ses 8 groupes, sinon null.
export function groupes6(s) {
  const t = String(s ?? '').split('%')[0].toLowerCase();
  if (!net.isIPv6(t)) return null;
  let tete = t, v4 = null;
  const m = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(t);
  if (m) { v4 = octets4(m[2]); if (!v4) return null; tete = `${m[1]}0:0`; }
  const [gauche, droite] = tete.includes('::') ? tete.split('::') : [tete, null];
  const g = gauche ? gauche.split(':') : [];
  const d = droite ? droite.split(':') : [];
  const tout = droite == null ? g : [...g, ...Array(8 - g.length - d.length).fill('0'), ...d];
  if (tout.length !== 8) return null;
  const n = tout.map(x => parseInt(x, 16));
  if (v4) { n[6] = (v4[0] << 8) | v4[1]; n[7] = (v4[2] << 8) | v4[3]; }
  return n.some(x => !Number.isInteger(x) || x < 0 || x > 0xffff) ? null : n;
}

// 8 groupes → forme canonique (RFC 5952, § 4).
export function ecrire6(g) {
  let debut = -1, long = 0;
  for (let i = 0; i < 8;) {
    if (g[i] !== 0) { i += 1; continue; }
    let j = i;
    while (j < 8 && g[j] === 0) j += 1;
    if (j - i > long && j - i >= 2) { debut = i; long = j - i; }
    i = j;
  }
  const hex = a => a.map(x => x.toString(16)).join(':');
  return debut < 0 ? hex(g) : `${hex(g.slice(0, debut))}::${hex(g.slice(debut + long))}`;
}

// Adresse lue : { v: 4, octets } ou { v: 6, groupes } ; une IPv4 écrite en IPv6 (« ::ffff:192.0.2.1 ») se lit comme l'IPv4
// qu'elle est. null si illisible.
export function lireIp(s) {
  const t = String(s ?? '').trim();
  const o = octets4(t);
  if (o) return { v: 4, octets: o };
  const g = groupes6(t);
  if (!g) return null;
  if (g.slice(0, 5).every(x => x === 0) && g[5] === 0xffff) return { v: 4, octets: [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255] };
  return { v: 6, groupes: g };
}

// Forme canonique d'une adresse (« 2001:DB8:0::7 » → « 2001:db8::7 », « ::ffff:192.0.2.1 » → « 192.0.2.1 »), sinon null.
export function adresseCanonique(s) {
  const a = lireIp(s);
  if (!a) return null;
  return a.v === 4 ? a.octets.join('.') : ecrire6(a.groupes);
}

const masque = (valeurs, bits, prefixe) => valeurs.map((x, i) => {
  const reste = Math.max(0, Math.min(bits, prefixe - i * bits));
  return reste >= bits ? x : reste <= 0 ? 0 : x & ((0xffff << (bits - reste)) & (2 ** bits - 1));
});

// Réseau d'une adresse sous un préfixe (bits d'hôte à zéro), forme canonique, sans suffixe ; null si l'adresse est illisible
// ou le préfixe hors de 0-32 (IPv4) ou 0-128 (IPv6). Préfixe absent : l'adresse entière.
export function reseauDe(s, prefixe = null) {
  const a = lireIp(s);
  if (!a) return null;
  const max = a.v === 4 ? 32 : 128;
  const p = prefixe == null ? max : Number(prefixe);
  if (!Number.isInteger(p) || p < 0 || p > max) return null;
  return a.v === 4 ? masque(a.octets, 8, p).join('.') : ecrire6(masque(a.groupes, 16, p));
}

// Le /24 (IPv4) ou le /48 (IPv6) d'une adresse, sans suffixe : la clé de réseau du site et de la Vigie (ip_net).
export function reseau(s) {
  const a = lireIp(s);
  if (!a) return null;
  return a.v === 4 ? masque(a.octets, 8, 24).join('.') : ecrire6(masque(a.groupes, 16, 48));
}

// Clé de réseau relue (ip_net d'un événement, clé d'une entité « reseau ») → sa forme canonique, sans suffixe. Accepte une
// clé déjà juste, une adresse entière (le /24 ou le /48 en est tiré) et les anciennes clés fausses (« 2a01::bad:: »,
// « 2606:4700::: ») : les groupes écrits avant le premier « :: » sont gardés, la suite est nulle (« :: » tombé dans les
// trois premiers groupes : ceux qui le suivent sont à zéro). null si rien n'est lisible.
export function cleReseau(cle) {
  const s = String(cle ?? '').trim().replace(/\/\d{1,3}$/, '');
  if (!s) return null;
  const direct = reseau(s);
  if (direct) return direct;
  if (!s.includes('::')) return null;
  const avant = s.slice(0, s.indexOf('::'));
  const g = avant ? avant.split(':') : [];
  if (g.length > 3 || g.some(x => !/^[0-9a-fA-F]{1,4}$/.test(x))) return null;
  return ecrire6([...g.map(x => parseInt(x, 16)), 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 8));
}

// Ce qu'il faut chercher dans events.ip_net pour un réseau /48 (clé canonique) : la clé elle-même et les anciennes écritures
// (avant cette correction : les trois premiers morceaux du texte de l'adresse, puis « :: »). { exactes, debut } : la colonne
// vaut l'une des exactes, ou commence par debut (null : aucun début à chercher). En IPv4, la clé seule (jamais fausse).
// Hors d'atteinte : une adresse écrite avec des zéros de tête ou en majuscules (le site reçoit les adresses de Node, déjà
// canoniques) et un « :: » qui ne remplace qu'un seul groupe (jamais écrit ainsi, RFC 5952).
export function formesReseau(cle) {
  const c = cleReseau(cle);
  if (!c) return { exactes: [], debut: null };
  if (!c.includes(':')) return { exactes: [c], debut: null };
  const [g0, g1, g2] = groupes6(c).slice(0, 3).map(x => x.toString(16));
  const exactes = new Set([c, `${g0}:${g1}:${g2}::`]);
  let debut = null;
  if (g2 === '0') exactes.add(`${g0}:${g1}:::`);                       // « g0:g1::… »
  if (g1 === '0' && g2 === '0') debut = `${g0}::`;                      // « g0::x… » : « g0::x:: », « g0:::: »
  if (g0 === '0' && g1 === '0' && g2 === '0') debut = '::';             // « ::x… »
  return { exactes: [...exactes], debut };
}
