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
  const bounded = async (url, init) => {
    const res = await fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    if (text.length > 5 * 1024 * 1024) throw new Error('réponse de Zitadel trop grande');
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
    const cursor = setting.get('zitadel_curseur');
    const lastOk = setting.get('zitadel_derniere_lecture');
    if (lastOk && now() - lastOk > GAP) {
      store.own('vigie_zitadel_trou', { emetteur: 'vigie/zitadel.js', detail: { derniere_lecture: lastOk, heures: Math.round((now() - lastOk) / 3600e3) } });
    }
    let from = cursor ? new Date(Math.max(Date.parse(cursor) - OVERLAP, 0)) : new Date(now() - 23 * 3600e3);
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
        const def = TYPES[type];
        if (!def) continue;
        const key = `${e.aggregate?.id}:${e.sequence}:${type}`;
        const id = `z${crypto.createHash('sha256').update(key).digest('hex').slice(0, 35)}`;
        const at = Date.parse(e.creationDate || e.creation_date) || now();
        const ip = agentIp(e.payload);
        rows.push({
          id: `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`,
          recu_a: now(), survenu_a: at, type: KIND[def.categorie], severity: def.gravite, composant: 'zitadel', emetteur: 'zitadel · API des événements',
          canal: 'API Zitadel', confiance: 'constaté', reference: clean(`${e.aggregate?.type}:${e.aggregate?.id}#${e.sequence}`, 120),
          sub: clean(e.editor?.userId || e.editor?.user_id, 200), ip, ip_net: ip,
          detail: { type_zitadel: type, regle: def.regle, agregat: { type: clean(e.aggregate?.type, 40), id: clean(e.aggregate?.id, 60) },
            proprietaire: clean(e.aggregate?.resourceOwner || e.aggregate?.resource_owner, 60), service: clean(e.editor?.service, 60), charge: minimize(e.payload) },
        });
      }
      added += store.add(rows);
      const lastDate = list.at(-1)?.creationDate || list.at(-1)?.creation_date;
      if (lastDate) setting.set('zitadel_curseur', lastDate);
      if (list.length < 500 || !lastDate) break;
      from = new Date(lastDate);
    }
    setting.set('zitadel_derniere_lecture', now());
    return added;
  }

  let timer = null, failures = 0;
  return {
    run,
    start(intervalMs) {
      const tick = async () => {
        try { await run(); failures = 0; } catch (err) {
          failures += 1;
          if (failures === 1 || failures % 30 === 0) store.own('vigie_zitadel_erreur', { emetteur: 'vigie/zitadel.js', detail: { erreur: clean(err.message, 200), echecs: failures } });
          log?.warn({ err: err.message }, 'Zitadel : lecture impossible');
        }
        timer = setTimeout(tick, intervalMs); timer.unref();
      };
      timer = setTimeout(tick, 1000); timer.unref();
    },
    stop() { clearTimeout(timer); },
  };
}
