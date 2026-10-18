import { truncateIp } from '../ip.js';

const STR_MAX = 200;

// Caractères de contrôle remplacés (une saisie ne peut pas fabriquer de fausses lignes dans un journal), longueur bornée.
export const neutralize = (v, max = STR_MAX) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '␤').slice(0, max).replace(/[\ud800-\udbff]$/, '');

// Contexte réseau d'une requête : adresse, réseau, et position donnée par Cloudflare, crue seulement si la requête est
// passée par le proxy de confiance (TRUST_PROXY ; sans lui, un visiteur pourrait se dire ailleurs).
export function networkOf(request) {
  if (!request) return {};
  const ip = String(request.ip || '');
  const viaProxy = Array.isArray(request.ips) && request.ips.length > 1;
  const h = request.headers || {};
  const num = v => { const n = Number.parseFloat(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined; };   // ~10 km
  const country = viaProxy && /^[A-Z]{2}$/.test(String(h['cf-ipcountry'] || '').toUpperCase()) ? String(h['cf-ipcountry']).toUpperCase() : undefined;
  return {
    ip: ip || undefined,
    ip_net: ip ? truncateIp(ip) || undefined : undefined,
    country: country && country !== 'XX' && country !== 'T1' ? country : undefined,
    city: viaProxy && h['cf-ipcity'] ? neutralize(h['cf-ipcity'], 80) : undefined,
    lat: viaProxy ? num(h['cf-iplatitude']) : undefined,
    lon: viaProxy ? num(h['cf-iplongitude']) : undefined,
  };
}

