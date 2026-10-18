import { acceptEdgeList, blockedScope, routePath } from './decisions.js';

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

// Liste des blocages, relue dans KV au plus une fois par minute et par instance du Worker ; une liste inchangée n'est
// pas revérifiée. Liste refusée ou en partie illisible : un point « liste_refusee » / « liste_partielle » (lu par la
// Vigie, qui le signale), la précédente reste en place tant qu'elle a moins de 24 h.
async function edgeList(env, now) {
  if (now - cache.at < LIST_TTL) return cache.list;
  cache = { ...cache, at: now };
  try {
    const signed = await env.DECISIONS?.get('blocages', { type: 'json', cacheTtl: 60 });
    const before = cache.list;
    cache.list = signed ? await acceptEdgeList(signed, env.DECISIONS_PUBKEY, now, cache.list) : null;
    cache.error = null;
    if (cache.list && cache.list !== before && cache.list.ignorees) point(env, { indexes: ['bordure'], blobs: ['liste_partielle', '', '', '', '', '', '', '', `${cache.list.ignorees} entrée(s) écartée(s)`], doubles: [1, cache.list.version] });
  } catch (err) {
    if (cache.error !== err.message) point(env, { indexes: ['bordure'], blobs: ['liste_refusee', '', '', '', '', '', '', '', String(err.message).slice(0, 120)], doubles: [1, 0] });
    cache.error = err.message;
    if (cache.list && now - cache.list.emis_a > 24 * 3600e3) cache.list = null;
  }
  return cache.list;
}

function point(env, data) {
  try { env.ANALYTICS?.writeDataPoint(data); } catch { /* quota ou liaison absente : rien */ }
}

export default {
  scheduled: (event, env) => scheduled(event, env),
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    for (const k of [...headers.keys()]) if (k.startsWith('x-bordure-')) headers.delete(k);   // jamais d'en-tête venu du visiteur
    const plain = () => fetch(new Request(request, { headers }));
    // Dernier recours : DESACTIVE=1 (variable du Worker, effet immédiat) laisse tout passer sans rien bloquer.
    if (env.DESACTIVE === '1') return plain();
    // Chemin décodé comme le routeur du site (« /%61dmin » est « /admin ») : pour décider, classer et signer.
    const path = routePath(url.pathname);
    if (PASS.test(path)) return plain();
    const now = Date.now();
    const ip = request.headers.get('cf-connecting-ip') || '';
    const cf = request.cf || {};
    const classe = classOf(path);
    let ctx;
    try {
      const scope = blockedScope(await edgeList(env, now), ip, path, now);
      ctx = {
        ts: String(now), ip, method: request.method, host: url.host, path,
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
        // x-bordure-ip : l'adresse signée, pour que le site dise laquelle des deux diffère si la signature échoue.
        headers.set('x-bordure-ts', ctx.ts); headers.set('x-bordure-ip', ip.slice(0, 64)); headers.set('x-bordure-asn', ctx.asn); headers.set('x-bordure-org', ctx.org);
        headers.set('x-bordure-pays', ctx.pays); headers.set('x-bordure-tls', ctx.tls); headers.set('x-bordure-tls-brut', ctx.tlsBrut);
        headers.set('x-bordure-rtt', ctx.rtt); headers.set('x-bordure-sig', await hmac(env.BORDURE_KEY, canonical(ctx)));
      }
    } catch {
      point(env, { indexes: [ip.slice(0, 96)], blobs: ['erreur', '', '', '', '', '', request.method, classe, ''], doubles: [1, 0] });
      for (const k of [...headers.keys()]) if (k.startsWith('x-bordure-')) headers.delete(k);
      return plain();
    }
    const res = await plain();
    point(env, { indexes: [ip.slice(0, 96)], blobs: [classe, String(res.status), ctx.pays, ctx.asn, decodeURIComponent(ctx.org), ctx.tls, request.method, firstSegment(path), ''], doubles: [1, Number(ctx.rtt)] });
    return res;
  },
};

// Battement (arbitrage NC3-2) : tâche planifiée de Cloudflare toutes les 5 minutes (gratuite) ; un point « battement »
// avec l'état de la liste. Son absence (Worker retiré, quota du jour épuisé : les tâches planifiées s'arrêtent aussi)
// est signalée par la Vigie en 20 minutes, que le site ait du trafic ou non.
export async function scheduled(event, env) {
  const now = Date.now();
  let etat = 'sans liste';
  try {
    const list = await edgeList(env, now);
    etat = list ? `liste ${list.version}, ${list.exact.size + list.blocks.length} blocage(s)` : cache.error ? `liste refusée : ${cache.error}` : 'sans liste';
  } catch (err) { etat = `erreur : ${err.message}`; }
  point(env, { indexes: ['bordure'], blobs: ['battement', '', '', '', '', '', '', '', etat.slice(0, 120)], doubles: [1, 0] });
}

// Pour les tests : liste en cache remise à zéro.
export const resetCache = () => { cache = { at: 0, list: null, error: null }; };
