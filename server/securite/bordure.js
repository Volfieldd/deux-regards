import crypto from 'node:crypto';

// En-têtes de la bordure (phase C3) : le Worker Cloudflare de la Vigie (bordure/worker.js) ajoute à chaque requête
// l'opérateur réseau, l'empreinte TLS et la distance réseau, signés HMAC (VIGIE_BORDURE_KEY, connue du Worker et du
// site seulement). Le site ne les croit que signés, frais (60 s) et pour cette adresse, cette méthode, cet hôte et ce
// chemin : un visiteur ne peut ni les fabriquer, ni rejouer ceux d'un autre.
// Résultat : request.bordure = { asn, org, pays, tls, tlsBrut, rtt } ; null sans en-têtes ; { invalide: raison } si des
// en-têtes sont là mais faux (signalé : quelqu'un les fabrique, ou la clé du Worker n'est pas la bonne).

const SKEW = 60e3;
const HEX16 = /^[0-9a-f]{16}$/;
const plainIp = ip => (String(ip).startsWith('::ffff:') && /^\d+\.\d+\.\d+\.\d+$/.test(String(ip).slice(7)) ? String(ip).slice(7) : String(ip || ''));

// Chemin comme le voit le routeur : décodé, barres doublées réduites (même fonction que routePath de
// bordure/decisions.js ; le Worker n'est pas dans l'image du site, d'où la copie, vérifiée par les tests).
export function routePath(raw) {
  let p = String(raw || '/').split('?')[0];
  try { p = decodeURIComponent(p); } catch { /* laissé tel quel */ }
  return p.replace(/\/{2,}/g, '/');
}

// Même texte que bordure/worker.js (canonical).
const canonical = h => ['v1', h.ts, h.ip, h.method, h.host, h.path, h.asn, h.org, h.pays, h.tls, h.tlsBrut, h.rtt].join('\n');

export function createEdgeVerifier({ key, now = Date.now }) {
  const k = Buffer.from(key);
  return function verify(request) {
    const h = request.headers || {};
    const sig = h['x-bordure-sig'];
    if (sig === undefined && !Object.keys(h).some(x => x.startsWith('x-bordure-'))) return null;
    const get = n => (typeof h[n] === 'string' ? h[n] : '');
    const raw = String(request.raw?.url || request.url || '');
    const fields = {
      ts: get('x-bordure-ts'), ip: plainIp(get('x-bordure-ip')), method: String(request.method || ''), host: String(h.host || ''),
      path: routePath(raw), asn: get('x-bordure-asn'), org: get('x-bordure-org'), pays: get('x-bordure-pays'),
      tls: get('x-bordure-tls'), tlsBrut: get('x-bordure-tls-brut'), rtt: get('x-bordure-rtt'),
    };
    if (typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return { invalide: 'signature absente' };
    const expected = crypto.createHmac('sha256', k).update(canonical(fields)).digest();
    if (!crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex'))) return { invalide: 'signature fausse' };
    // Signature bonne mais adresse différente de celle que voit le site : rejeu par un autre visiteur, ou chaîne
    // Cloudflare → cloudflared → site qui ne transmet pas la même adresse (réglage à corriger, TRUST_PROXY).
    if (fields.ip !== plainIp(request.ip)) return { invalide: 'adresse différente' };
    const ts = Number(fields.ts);
    if (!Number.isFinite(ts) || Math.abs(now() - ts) > SKEW) return { invalide: 'en-têtes périmés' };
    if (!/^\d{0,10}$/.test(fields.asn) || !HEX16.test(fields.tls) || !HEX16.test(fields.tlsBrut)) return { invalide: 'valeurs illisibles' };
    let org = '';
    try { org = decodeURIComponent(fields.org).replace(/[^\x20-\x7e]/g, '?').slice(0, 80); } catch { /* illisible : vide */ }
    return { asn: fields.asn || null, org: org || null, pays: /^[A-Z]{2}$/.test(fields.pays) ? fields.pays : null, tls: fields.tls, tlsBrut: fields.tlsBrut, rtt: Math.min(Number(fields.rtt) || 0, 60000) };
  };
}
