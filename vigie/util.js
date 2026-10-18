// Petits outils sans dépendance (la Vigie ne fait confiance à aucun champ reçu, même du site).
export const clean = (v, max = 200) => (v == null ? null : String(v).toWellFormed().replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029‎‏‪-‮⁦-⁩]/g, '␤').slice(0, max).replace(/[\ud800-\udbff]$/, '') || null);
export const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

// Réseau d'une adresse, comme le site (server/ip.js) : /24 en IPv4, /48 en IPv6 (ip_net de tous les événements).
export function netOf(ip) {
  const s = String(ip || '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.replace(/\.\d+$/, '.0');
  if (s.toLowerCase().startsWith('::ffff:')) return netOf(s.slice(7));
  if (s.includes(':')) return `${s.split(':').slice(0, 3).join(':')}::`;
  return s || null;
}
