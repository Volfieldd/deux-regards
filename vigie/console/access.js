import crypto from 'node:crypto';
import { readLimited } from '../zitadel.js';

// Premier verrou de la console (annexe architecture, section 5.2) : Cloudflare Access. Chaque requête porte l'en-tête
// Cf-Access-Jwt-Assertion, un jeton signé (RS256) par les clés publiques de l'équipe Access ; la Vigie vérifie la
// signature, l'émetteur (https://<équipe>.cloudflareaccess.com), l'audience (étiquette de l'application) et les dates.
// Sans lui : 403 sobre. Ferme le passage direct par le réseau du tunnel (un conteneur qui joindrait la console sans
// passer par Cloudflare).
// Clés (audit D3-A2/D3-D1) : relues en tâche de fond quand elles ont plus d'une heure, une seule lecture à la fois ;
// si la relecture échoue (incident réseau), les clés connues restent valables 24 h : la console reste ouverte à ceux
// qui ont un jeton signé par elles. Un jeton portant une clé inconnue (rotation) fait relire tout de suite, au plus une
// fois par minute. Seules attentes : la toute première lecture, et des clés de plus de 24 h.
const SKEW = 60;

const b64json = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

export function createAccessVerifier({ team, aud, fetchImpl = fetch, now = Date.now }) {
  if (!/^[a-z0-9-]{1,63}$/.test(team || '')) throw new Error('VIGIE_ACCESS_TEAM : nom d’équipe Cloudflare Access attendu');
  if (!/^[0-9a-f]{64}$/.test(aud || '')) throw new Error('VIGIE_ACCESS_AUD : étiquette d’audience (64 caractères hexadécimaux) attendue');
  const issuer = `https://${team}.cloudflareaccess.com`;
  let keys = new Map(), fetchedAt = 0, lastTry = 0, inflight = null;

  // Une seule lecture à la fois ; les requêtes qui en ont besoin attendent la même.
  function refresh() {
    if (!inflight) {
      lastTry = now();
      inflight = load().finally(() => { inflight = null; });
    }
    return inflight;
  }
  async function load() {
    const r = await fetchImpl(`${issuer}/cdn-cgi/access/certs`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (r.status !== 200) throw new Error(`clés Access : réponse ${r.status}`);
    const body = JSON.parse(await readLimited(r, 256 * 1024));
    const next = new Map();
    for (const k of Array.isArray(body.keys) ? body.keys : []) {
      if (k.kty !== 'RSA' || typeof k.kid !== 'string') continue;
      try { next.set(k.kid, crypto.createPublicKey({ key: { kty: 'RSA', n: k.n, e: k.e }, format: 'jwk' })); } catch { /* clé illisible */ }
    }
    if (!next.size) throw new Error('clés Access : aucune clé lisible');
    keys = next;
    fetchedAt = now();
  }

  // Renvoie { email, sub } ou lève une erreur (le message n'est jamais montré au visiteur).
  async function verify(jwt) {
    const parts = String(jwt || '').split('.');
    if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error('jeton Access absent ou mal formé');
    let header, payload;
    try { header = b64json(parts[0]); payload = b64json(parts[1]); } catch { throw new Error('jeton Access illisible'); }
    if (header.alg !== 'RS256') throw new Error('jeton Access : algorithme refusé');
    const age = now() - fetchedAt;
    if (!keys.size || age > 24 * 3600e3) await refresh();                                     // jamais lues, ou trop vieilles
    else if (!keys.has(header.kid) && now() - lastTry > 60e3) await refresh().catch(() => {}); // rotation
    else if (age > 3600e3 && now() - lastTry > 60e3) refresh().catch(() => {});               // en tâche de fond
    const key = keys.get(header.kid);
    if (!key) throw new Error('jeton Access : clé inconnue');
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
    if (!ok) throw new Error('jeton Access : signature fausse');
    const t = Math.floor(now() / 1000);
    if (payload.iss !== issuer) throw new Error('jeton Access : émetteur inattendu');
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) throw new Error('jeton Access : audience inattendue');
    if (!Number.isFinite(payload.exp) || payload.exp < t - SKEW) throw new Error('jeton Access : expiré');
    if (Number.isFinite(payload.nbf) && payload.nbf > t + SKEW) throw new Error('jeton Access : pas encore valable');
    if (Number.isFinite(payload.iat) && payload.iat > t + SKEW) throw new Error('jeton Access : émis dans le futur');
    return { email: typeof payload.email === 'string' ? payload.email.slice(0, 200) : null, sub: typeof payload.sub === 'string' ? payload.sub.slice(0, 200) : null };
  }
  return { verify, issuer };
}
