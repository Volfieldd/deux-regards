import { acceptEdgeList, blockedScope } from './decisions.js';

// Capteur en bordure de la Vigie (phase C3, recadrage du 17 octobre 2026, décision D19) : un Cloudflare Worker posé
// devant l'admin, la connexion et les pages (jamais devant les images), sur l'offre gratuite. Il
//   1. applique les blocages d'adresses de la Vigie avant le site (liste signée, copiée par la Vigie dans Workers KV) ;
//   2. transmet au site, en en-têtes signés (HMAC, clé connue du Worker et du site seulement), ce que le site ne voit
//      pas : opérateur réseau (ASN), empreinte TLS, distance réseau ; le site rejette des en-têtes non signés ;
//   3. écrit un point par requête dans Workers Analytics Engine (adresse, classe de route, statut, opérateur, empreinte
//      TLS), lu chaque minute par la Vigie : aucune route d'entrée publique à ouvrir.
// En cas d'erreur, il laisse passer la requête sans ses en-têtes (le site garde ses propres protections).
//
// Liaisons (wrangler.toml) : DECISIONS (KV), ANALYTICS (Analytics Engine), DECISIONS_PUBKEY (variable, clé publique
// des décisions), BORDURE_KEY (secret : wrangler secret put BORDURE_KEY).

// Chemins jamais traités (images, fichiers statiques, santé) : à exclure aussi par les routes, pour le quota.
export const PASS = /^\/(?:media\/|static\/|fonts\/|partage\/|admin\/media\/|healthz$|favicon\.ico$|robots\.txt$)/;
const LIST_TTL = 60e3;
let cache = { at: 0, list: null, error: null };

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder();
async function sha16(text) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(text))).slice(0, 16); }
let hmacKey = { raw: null, key: null };
async function hmac(key, text) {
  if (hmacKey.raw !== key) hmacKey = { raw: key, key: await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']) };
  return hex(await crypto.subtle.sign('HMAC', hmacKey.key, enc.encode(text)));
}
const classOf = path => (/^\/admin(?:[/?#]|$)/.test(path) ? 'admin' : /^\/auth\//.test(path) ? 'connexion' : 'page');
// Premier segment du chemin seulement : certains chemins portent un jeton (« /pour-vous/<jeton> ») qui ne doit pas
// quitter le site.
const firstSegment = path => `/${(/^\/([a-z0-9-]{1,30})/i.exec(path) || ['', ''])[1]}`;
const clean = (v, max) => String(v ?? '').replace(/[^\x20-\x7e]/g, '?').slice(0, max);

// Texte signé : le site recompose le même à partir de ce qu'il reçoit (server/securite/bordure.js).
export const canonical = h => ['v1', h.ts, h.ip, h.method, h.host, h.path, h.asn, h.org, h.pays, h.tls, h.tlsBrut, h.rtt].join('\n');

// Liste des blocages, relue dans KV au plus une fois par minute et par instance du Worker.
async function edgeList(env, now) {
  if (now - cache.at < LIST_TTL) return cache.list;
  cache = { at: now, list: cache.list, error: null };
  try {
    const signed = await env.DECISIONS?.get('blocages', { type: 'json', cacheTtl: 60 });
    cache.list = signed ? await acceptEdgeList(signed, env.DECISIONS_PUBKEY, now) : null;
  } catch (err) { cache.error = err.message; }       // liste refusée : la précédente reste, sinon aucune
  return cache.list;
}

function point(env, data) {
  try { env.ANALYTICS?.writeDataPoint(data); } catch { /* quota ou liaison absente : rien */ }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    for (const k of [...headers.keys()]) if (k.startsWith('x-bordure-')) headers.delete(k);   // jamais d'en-tête venu du visiteur
    const plain = () => fetch(new Request(request, { headers }));
    if (PASS.test(url.pathname)) return plain();
    const now = Date.now();
    const ip = request.headers.get('cf-connecting-ip') || '';
    const cf = request.cf || {};
    const classe = classOf(url.pathname);
    let ctx;
    try {
      const scope = blockedScope(await edgeList(env, now), ip, url.pathname, now);
      ctx = {
        ts: String(now), ip, method: request.method, host: url.host, path: url.pathname,
        asn: String(Number(cf.asn) || ''), org: encodeURIComponent(clean(cf.asOrganization, 80)), pays: /^[A-Z]{2}$/.test(cf.country || '') ? cf.country : '',
        // Empreinte TLS « grossière » (version et chiffrement négociés ; pas le protocole HTTP, qui passe de HTTP/2 à
        // HTTP/3 pour un même navigateur) ; « brute » (suites proposées et longueur du ClientHello) : plus fine, mais
        // certains navigateurs la font varier (valeurs GREASE, extensions mélangées). Les deux sont d'abord observées
        // (événements « info ») : leur stabilité est à mesurer sur l'instance de test avant d'en faire des alertes.
        tls: await sha16(`${cf.tlsVersion || ''}|${cf.tlsCipher || ''}`),
        tlsBrut: await sha16(`${cf.tlsClientCiphersSha1 || ''}|${cf.tlsClientHelloLength || ''}|${cf.tlsVersion || ''}`),
        rtt: String(Number(cf.clientTcpRtt) || 0),
      };
      if (scope) {
        point(env, { indexes: [ip.slice(0, 96)], blobs: ['bloque', '403', ctx.pays, ctx.asn, decodeURIComponent(ctx.org), ctx.tls, request.method, classe, scope], doubles: [1, Number(ctx.rtt)] });
        return new Response('<!doctype html><meta charset="utf-8"><title>Accès refusé</title><p>Accès refusé.</p>', {
          status: 403, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
        });
      }
      if (env.BORDURE_KEY) {
        headers.set('x-bordure-ts', ctx.ts); headers.set('x-bordure-asn', ctx.asn); headers.set('x-bordure-org', ctx.org);
        headers.set('x-bordure-pays', ctx.pays); headers.set('x-bordure-tls', ctx.tls); headers.set('x-bordure-tls-brut', ctx.tlsBrut);
        headers.set('x-bordure-rtt', ctx.rtt); headers.set('x-bordure-sig', await hmac(env.BORDURE_KEY, canonical(ctx)));
      }
    } catch {
      point(env, { indexes: [ip.slice(0, 96)], blobs: ['erreur', '', '', '', '', '', request.method, classe, ''], doubles: [1, 0] });
      for (const k of [...headers.keys()]) if (k.startsWith('x-bordure-')) headers.delete(k);
      return plain();
    }
    const res = await plain();
    point(env, { indexes: [ip.slice(0, 96)], blobs: [classe, String(res.status), ctx.pays, ctx.asn, decodeURIComponent(ctx.org), ctx.tls, request.method, firstSegment(url.pathname), ''], doubles: [1, Number(ctx.rtt)] });
    return res;
  },
};

// Pour les tests : liste en cache remise à zéro.
export const resetCache = () => { cache = { at: 0, list: null, error: null }; };
