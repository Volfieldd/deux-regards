import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import { clean } from './util.js';

// Lecture des événements de Zitadel Cloud (annexe architecture, section 7.1) : compte de service en lecture seule
// (IAM_OWNER_VIEWER), clé JWT, API des événements toutes les minutes. L'offre gratuite ne garde qu'un jour d'historique :
// la Vigie en fait la copie durable, et signale un trou.
//   - types suivis : vigie/zitadel/types-suivis.json (210 types, tirés de la liste de l'instance) ;
//   - charge réduite : seuls quelques champs sans donnée personnelle sont gardés (rôles, projet, réglages de connexion,
//     adresse IP de l'agent quand Zitadel la donne) ; jamais e-mail, téléphone, nom, mot de passe ou secret ;
//   - reprise : date du dernier événement lu ; doublons écartés par un identifiant tiré de l'agrégat, de la séquence et
//     du type.

const TYPES = JSON.parse(fs.readFileSync(new URL('./zitadel/types-suivis.json', import.meta.url), 'utf8')).types;
const KIND = { echec: 'zitadel_echec', connexion: 'zitadel_connexion', facteur: 'zitadel_facteur', droits: 'zitadel_droits', politique: 'zitadel_politique' };
const KEEP = new Set(['roleKeys', 'projectId', 'grantId', 'grantedOrgId', 'roles', 'forceMFA', 'forceMFALocalOnly', 'allowRegister', 'allowExternalIdp',
  'allowUsernamePassword', 'passwordlessType', 'secondFactor', 'multiFactor', 'idpConfigId', 'idpId', 'appId', 'redirectUris', 'postLogoutRedirectUris',
  'keyId', 'expirationDate', 'expiration', 'maxPasswordAttempts', 'maxOTPAttempts', 'showLockOutFailures', 'minLength', 'hasUppercase', 'hasLowercase',
  'hasNumber', 'hasSymbol', 'enabled', 'state', 'domain', 'targetType', 'endpoint', 'timeout', 'interruptOnError', 'executionId', 'targets']);
const GAP = 20 * 3600e3;

// Corps d'une réponse lu par morceaux, abandonné au-delà de max octets.
export async function readLimited(res, max) {
  if (!res.body?.getReader) { const t = await res.text(); if (t.length > max) throw new Error('réponse trop grande'); return t; }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); throw new Error('réponse trop grande'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
const OVERLAP = 5 * 60e3;          // relire 5 minutes en arrière : des événements datés un peu avant arrivent parfois après

function minimize(payload) {
  if (!payload || typeof payload !== 'object') return undefined;
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!KEEP.has(k)) continue;
    out[k] = typeof v === 'string' ? clean(v, 200) : Array.isArray(v) ? v.slice(0, 20).map(x => (typeof x === 'string' ? clean(x, 200) : x)) : v;
  }
  return Object.keys(out).length ? out : undefined;
}
// Adresse de l'agent (navigateur) quand Zitadel la joint (userAgent.ip / user_agent.ip / ip) : sert au voyage impossible.
const agentIp = p => { const ip = p?.userAgent?.ip ?? p?.user_agent?.ip ?? p?.ip; return net.isIP(String(ip || '')) ? String(ip) : null; };

export function createZitadelReader({ issuer, keyFile, store, log, fetchImpl = fetch, now = Date.now, readKey = () => JSON.parse(fs.readFileSync(keyFile, 'utf8')) }) {
  let token = null, tokenUntil = 0;
  const { setting } = store;
  // Réponse lue par morceaux, abandonnée au-delà de 5 Mo (jamais tout en mémoire d'abord).
  const bounded = async (url, init) => {
    const res = await fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const text = await readLimited(res, 5 * 1024 * 1024);
    if (res.status === 401) token = null;                                    // jeton refusé : redemandé au passage suivant
    if (res.status < 200 || res.status >= 300) throw new Error(`Zitadel : réponse ${res.status}`);
    return JSON.parse(text);
  };

  async function accessToken() {
    if (token && now() < tokenUntil) return token;
    const k = readKey();
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const iat = Math.floor(now() / 1000);
    const unsigned = `${b64({ alg: 'RS256', kid: k.keyId })}.${b64({ iss: k.userId, sub: k.userId, aud: issuer, iat, exp: iat + 3600 })}`;
    const assertion = `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), k.key).toString('base64url')}`;
    const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', scope: 'openid urn:zitadel:iam:org:project:id:zitadel:aud', assertion });
    const r = await bounded(`${issuer}/oauth/v2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    token = r.access_token;
    tokenUntil = now() + Math.max(60, (Number(r.expires_in) || 3600) - 120) * 1000;
    return token;
  }

  // Un passage : lit tout ce qui est arrivé depuis la dernière date (par pages de 500), l'ajoute à la base.
  async function run() {
    const lastOk = setting.get('zitadel_derniere_lecture');
    // Trou de plus de 20 h : signalé une fois (pas à chaque essai tant que Zitadel reste injoignable).
    if (lastOk && now() - lastOk > GAP && setting.get('zitadel_trou_signale') !== lastOk) {
      setting.set('zitadel_trou_signale', lastOk);
      store.own('vigie_zitadel_trou', { emetteur: 'vigie/zitadel.js', detail: { derniere_lecture: lastOk, heures: Math.round((now() - lastOk) / 3600e3) } });
    }
    // Curseur illisible ou dans le futur : on repart des 23 dernières heures (jamais bloqué).
    const c = Date.parse(setting.get('zitadel_curseur') || '');
    const start = Number.isFinite(c) && c <= now() + 5 * 60e3 ? Math.max(c - OVERLAP, now() - 23 * 3600e3) : now() - 23 * 3600e3;
    let from = new Date(start);
    let added = 0;
    for (let page = 0; page < 20; page++) {
      const r = await bounded(`${issuer}/admin/v1/events/_search`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ asc: true, limit: 500, creation_date: from.toISOString(), event_types: Object.keys(TYPES) }),
      });
      const list = Array.isArray(r.events) ? r.events : [];
      const rows = [];
      for (const e of list) {
        const type = e?.type?.type;
        if (typeof type !== 'string' || !Object.hasOwn(TYPES, type)) continue;
        const def = TYPES[type];
        const key = `${e.aggregate?.id}:${e.sequence}:${type}`;
        const id = `z${crypto.createHash('sha256').update(key).digest('hex').slice(0, 35)}`;
        const at = Date.parse(e.creationDate || e.creation_date) || now();
        const ip = agentIp(e.payload);
        // Compte visé : l'agrégat quand c'est un utilisateur, sinon l'utilisateur de la charge (sessions), sinon l'auteur.
        // L'auteur (un administrateur qui modifie le compte d'un autre, le service de connexion) reste dans le détail.
        const editor = clean(e.editor?.userId || e.editor?.user_id, 200);
        const target = e.aggregate?.type === 'user' ? e.aggregate.id : (e.payload?.userID || e.payload?.userId || e.payload?.user_id);
        rows.push({
          id: `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`,
          recu_a: now(), survenu_a: at, type: KIND[def.categorie], severity: def.gravite, composant: 'zitadel', emetteur: 'zitadel · API des événements',
          canal: 'API Zitadel', confiance: 'constaté', reference: clean(`${e.aggregate?.type}:${e.aggregate?.id}#${e.sequence}`, 120),
          sub: clean(typeof target === 'string' && target ? target : editor, 200), ip, ip_net: ip,
          detail: { type_zitadel: type, regle: def.regle, auteur: editor, agregat: { type: clean(e.aggregate?.type, 40), id: clean(e.aggregate?.id, 60) },
            proprietaire: clean(e.aggregate?.resourceOwner || e.aggregate?.resource_owner, 60), service: clean(e.editor?.service, 60), charge: minimize(e.payload) },
        });
      }
      added += store.add(rows);
      const lastDate = list.at(-1)?.creationDate || list.at(-1)?.creation_date;
      const lastMs = Date.parse(lastDate || '');
      if (Number.isFinite(lastMs) && lastMs <= now() + 5 * 60e3) setting.set('zitadel_curseur', new Date(lastMs).toISOString());
      if (list.length < 500 || !Number.isFinite(lastMs)) break;
      // Page pleine : on avance (d'une milliseconde si toute la page est à la même date, pour ne jamais tourner en rond).
      from = new Date(lastMs > from.getTime() ? lastMs : from.getTime() + 1);
    }
    setting.set('zitadel_derniere_lecture', now());
    return added;
  }

  // Appel en lecture à l'API de Zitadel avec le même compte de service (console : relecture du plafond des droits).
  // Chemin relatif à l'émetteur, jamais une adresse complète ; org : en-tête x-zitadel-orgid de l'API de gestion.
  async function api(apiPath, { method = 'POST', body, org } = {}) {
    if (!/^\/(?:management|admin|v2)\/[A-Za-z0-9/_.-]+$/.test(apiPath)) throw new Error('Zitadel : chemin d’API refusé');
    const headers = { authorization: `Bearer ${await accessToken()}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (org) headers['x-zitadel-orgid'] = org;
    return bounded(`${issuer}${apiPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  let timer = null, failures = 0, stopped = false;
  return {
    run,
    api,
    start(intervalMs) {
      const tick = async () => {
        if (stopped) return;
        try { await run(); failures = 0; } catch (err) {
          failures += 1;
          try { if (failures === 1 || failures % 30 === 0) store.own('vigie_zitadel_erreur', { emetteur: 'vigie/zitadel.js', detail: { erreur: clean(err.message, 200), echecs: failures } }); } catch { /* base indisponible */ }
          log?.warn({ err: err.message }, 'Zitadel : lecture impossible');
        }
        if (!stopped) { timer = setTimeout(tick, intervalMs); timer.unref(); }
      };
      timer = setTimeout(tick, 1000); timer.unref();
    },
    stop() { stopped = true; clearTimeout(timer); },
  };
}
