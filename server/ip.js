// Adresse IP tronquée dans les journaux (/24 en IPv4, /48 en IPv6) : assez pour diagnostiquer, pas pour identifier.
export function truncateIp(ip) {
  const s = String(ip || '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.replace(/\.\d+$/, '.0');
  if (s.startsWith('::ffff:')) return truncateIp(s.slice(7));
  if (s.includes(':')) return `${s.split(':').slice(0, 3).join(':')}::`;
  return s;
}
