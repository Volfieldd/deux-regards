// Limiteur en mémoire à fenêtre fixe, par clé (adresse IP). Suffisant pour une instance unique.
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();
  let sweep = now() + windowMs;
  return function allow(key) {
    const t = now();
    if (t >= sweep) {
      for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
      sweep = t + windowMs;
    }
    let entry = hits.get(key);
    if (!entry || entry.reset <= t) {
      entry = { count: 0, reset: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
