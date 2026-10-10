import net from 'node:net';

// Clé d'une adresse : IPv4 telle quelle, IPv6 par préfixe /64 (un même client en dispose de milliards).
export function clientKey(ip) {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (v4) return v4[1];
  if (net.isIPv6(ip)) {
    const [head, tail = ''] = ip.split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const groups = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
    return `${groups.slice(0, 4).map(g => g.padStart(4, '0')).join(':')}::/64`;
  }
  return String(ip);
}

// Limiteur en mémoire à fenêtre fixe, par client. Suffisant pour une instance unique.
// Taille bornée : au-delà de `maxKeys` clients suivis, les plus anciens sont oubliés.
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000, now = Date.now }) {
  const hits = new Map();
  let sweep = now() + windowMs;
  return function allow(ip) {
    const key = clientKey(ip);
    const t = now();
    if (t >= sweep || hits.size >= maxKeys) {
      for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
      for (const k of hits.keys()) { if (hits.size < maxKeys) break; hits.delete(k); }
      sweep = t + windowMs;
    }
    let entry = hits.get(key);
    if (!entry || entry.reset <= t) {
      hits.delete(key);
      entry = { count: 0, reset: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
