import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pubkeyOf } from './securite/decisions.js';

const required = (env, key) => {
  const value = env[key];
  if (!value) throw new Error(`Variable d'environnement manquante : ${key}`);
  return value;
};

const DEFAULT_TSA = 'https://freetsa.org/tsr';
// NODE_USE_ENV_PROXY (mandataire pour fetch) : Node 22.21 et suivants de la ligne 22, 24.5 et suivants, puis toutes.
export const proxyEnvPrisEnCharge = (v = process.versions.node) => {
  const [maj, min] = v.split('.').map(Number);
  return (maj === 22 && min >= 21) || (maj === 24 && min >= 5) || maj >= 25;
};
const DEFAULT_TSA_CA = fileURLToPath(new URL('../assets/tsa/freetsa-cacert.pem', import.meta.url));

// TRUST_PROXY : « false », nombre de proxys (« 1 »), ou liste d'adresses/CIDR/mots-clés.
// « true » (faire confiance à tout X-Forwarded-For) est refusé : il rendrait la limite de débit contournable.
function parseTrustProxy(value, deployed) {
  if (value === undefined || value === '') return deployed ? 'loopback,uniquelocal' : false;
  if (value === 'false') return false;
  if (value === 'true') throw new Error('TRUST_PROXY=true est refusé : indiquer l’adresse du proxy (ex. 127.0.0.1) ou le nombre de proxys');
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

const list = value => (value ? value.split(',').map(s => s.trim()).filter(Boolean) : []);

// URL publique : analysée (« HTTPS://Exemple.fr/ » devient « https://exemple.fr »), http ou https seulement.
function parsePublicUrl(value) {
  let u;
  try { u = new URL(value); } catch { throw new Error(`PUBLIC_URL n’est pas une adresse valide : ${value}`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('PUBLIC_URL doit commencer par https:// (ou http:// en développement)');
  return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const storageDir = path.resolve(env.STORAGE_DIR || './storage');
  const publicUrl = env.PUBLIC_URL ? parsePublicUrl(env.PUBLIC_URL) : `http://localhost:${env.PORT || 3000}`;
  const https = publicUrl.startsWith('https://');
  // Site en ligne : NODE_ENV=production ou URL publique en HTTPS. Les protections ne dépendent
  // pas d'une seule variable qu'on pourrait oublier au déploiement.
  const deployed = production || https;

  // Le secret de développement n'est accepté que sur la boucle locale : exposé sur un réseau, le serveur exige le sien.
  const host = env.HOST || '127.0.0.1';
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(host);
  const cookieSecret = env.COOKIE_SECRET || (deployed || !loopback ? required(env, 'COOKIE_SECRET') : 'dev-only-secret-change-me-dev-only-secret');
  if (cookieSecret.length < 32) throw new Error('COOKIE_SECRET doit faire au moins 32 caractères');

  const issuer = env.OIDC_ISSUER || null;
  if (issuer && deployed && !issuer.startsWith('https://')) throw new Error('OIDC_ISSUER doit être en HTTPS hors développement');

  // Connexion locale de test : interdite dès que le site est en ligne.
  const localAuthToken = env.LOCAL_AUTH_TOKEN || null;
  if (localAuthToken && deployed) throw new Error('LOCAL_AUTH_TOKEN est réservé aux tests : interdit en HTTPS ou en production');
  if (localAuthToken && localAuthToken.length < 16) throw new Error('LOCAL_AUTH_TOKEN doit faire au moins 16 caractères');
  // Adresse vue par les visiteurs, distincte du service HTTP derrière cloudflared : aucun certificat local n'est imposé.
  // Sans cette adresse HTTPS en production : cookies sans Secure, URL canoniques, liens des e-mails et retour OIDC faux.
  if (production && !env.PUBLIC_URL) throw new Error('PUBLIC_URL est obligatoire en production (ex. https://www.nicephos.art)');
  if (production && !https) throw new Error('PUBLIC_URL doit être en HTTPS en production (adresse publique ; HTTP interne autorisé derrière un tunnel ou proxy HTTPS)');

  // Horodatage RFC 3161 des originaux : FreeTSA par défaut, « off » pour désactiver.
  const tsaUrl = env.TSA_URL === 'off' ? null : (env.TSA_URL || DEFAULT_TSA);
  const tsaCaFile = env.TSA_CA_FILE || (tsaUrl === DEFAULT_TSA ? DEFAULT_TSA_CA : null);
  if (tsaUrl && deployed && !tsaUrl.startsWith('https://')) throw new Error('TSA_URL doit être en HTTPS hors développement');

  // Publication Instagram (API officielle de Meta, « Instagram API with Instagram Login »).
  // La connexion exige une adresse de retour en HTTPS : sans elle, la file d'attente fonctionne mais rien ne part.
  const igKey = env.INSTAGRAM_TOKEN_KEY || '';
  if (igKey && igKey.length < 32) throw new Error('INSTAGRAM_TOKEN_KEY doit faire au moins 32 caractères');
  const instagram = {
    appId: env.INSTAGRAM_APP_ID || null,
    appSecret: env.INSTAGRAM_APP_SECRET || null,
    apiVersion: /^v\d+\.\d+$/.test(env.INSTAGRAM_API_VERSION || '') ? env.INSTAGRAM_API_VERSION : 'v23.0',
    redirectUri: `${publicUrl}/admin/instagram/callback`,
    // Clé de chiffrement du jeton d'accès : la sienne, sinon dérivée de COOKIE_SECRET.
    tokenKey: igKey || `instagram:${cookieSecret}`,
    https,
  };
  instagram.configured = Boolean(instagram.appId && instagram.appSecret);

  // Chiffrement des données personnelles dans la base (rencontres) : clé à garder aussi hors du serveur (gestionnaire de
  // mots de passe) — perdue, les données chiffrées sont illisibles.
  const dataKey = env.DATA_KEY || null;
  if (dataKey && dataKey.length < 32) throw new Error('DATA_KEY doit faire au moins 32 caractères (openssl rand -base64 32)');

  // E-mails (facultatif) : boîte d'une adresse que vous possédez (SMTP), par exemple Gmail avec un mot de passe d'application.
  const smtpUrl = env.SMTP_URL || null;
  if (smtpUrl && !/^smtps?:\/\//.test(smtpUrl)) throw new Error('SMTP_URL doit commencer par smtp:// ou smtps://');
  const mailFrom = env.MAIL_FROM || null;
  if (smtpUrl && !mailFrom) throw new Error('MAIL_FROM est obligatoire avec SMTP_URL (par exemple « Nicephos <adresse@exemple.fr> »)');

  // Mandataire de sortie (registre de la Vigie, BV-10 ; profil « sortie » de la pile Unraid, facultatif) : la pile pose
  // HTTPS_PROXY et NODE_USE_ENV_PROXY=1, que fetch de Node suit seul (connexion OIDC, Instagram, horodatage, modèles) ;
  // nodemailer le reçoit en option. Sans ces variables, rien ne change. Node trop ancien pour NODE_USE_ENV_PROXY : refus
  // de démarrer (le site sortirait en direct, rejeté par l'hôte : des fonctions coupées sans raison visible).
  let sortieProxy = null;
  if (env.NODE_USE_ENV_PROXY === '1') {
    sortieProxy = env.HTTPS_PROXY || env.https_proxy || null;
    if (!sortieProxy || !/^http:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/?$/.test(sortieProxy)) throw new Error('NODE_USE_ENV_PROXY=1 demande HTTPS_PROXY=http://nom:port (mandataire de sortie, sans identifiant)');
    if (!proxyEnvPrisEnCharge()) throw new Error(`NODE_USE_ENV_PROXY=1 : Node ${process.versions.node} ne le prend pas en charge (22.21 ou plus récent attendu) ; mettez l'image à jour`);
  }

  // Propositions de traduction (admin) : serveur LibreTranslate du réseau local (http://libretranslate:5000).
  const translateUrl = env.TRANSLATE_URL || null;
  if (translateUrl && !/^https?:\/\/[^\s/]+/.test(translateUrl)) throw new Error('TRANSLATE_URL doit être une adresse http:// ou https://');

  // Vigie (composant de sécurité facultatif, docs/etudes/annexe-vigie-architecture.md) : sans VIGIE_URL, rien n'est
  // envoyé ni gardé. Avec elle, la clé de signature des envois est obligatoire.
  let vigie = null;
  if (env.VIGIE_URL) {
    let u;
    try { u = new URL(env.VIGIE_URL); } catch { throw new Error(`VIGIE_URL n’est pas une adresse valide : ${env.VIGIE_URL}`); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('VIGIE_URL doit commencer par http:// ou https://');
    if (u.username || u.password || u.search || u.hash) throw new Error('VIGIE_URL : adresse simple attendue (sans identifiants ni paramètres)');
    // En clair (http) seulement sur un réseau interne : nom de service Docker (sans point), adresse privée ou locale, ou
    // nom en .internal / .local. Ailleurs, HTTPS : les événements portent des adresses IP complètes.
    const host = u.hostname.replace(/^\[|\]$/g, '');
    // Adresse privée écrite telle quelle (vérifiée par net.isIP), ou nom de service Docker sans point.
    const v = net.isIP(host);
    const internal = (!v && /^[a-z0-9-]+$/i.test(host))
      || (v === 4 && /^(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host))
      || (v === 6 && /^(?:::1$|f[cd][0-9a-f]{2}:|fe80:)/i.test(host));
    if (u.protocol === 'http:' && !internal) throw new Error('VIGIE_URL en http:// seulement sur un réseau interne (nom de service Docker, adresse privée) ; sinon https://');
    const ingestKey = env.VIGIE_INGEST_KEY || '';
    if (!ingestKey) throw new Error('VIGIE_INGEST_KEY est obligatoire avec VIGIE_URL (openssl rand -base64 32)');
    if (ingestKey.length < 32) throw new Error('VIGIE_INGEST_KEY doit faire au moins 32 caractères');
    // Décisions de la Vigie (blocages, révocations) : signées, vérifiées avec cette clé publique. VIGIE_APPLIQUER=0 :
    // lues mais jamais appliquées (dernier recours, voir docs/wiki/Vigie.md).
    if (!env.VIGIE_DECISIONS_PUBKEY) throw new Error('VIGIE_DECISIONS_PUBKEY est obligatoire avec VIGIE_URL (node vigie/cli.js cles)');
    const decisionsPubkey = pubkeyOf(env.VIGIE_DECISIONS_PUBKEY);
    // Bordure (phase C3, facultative) : clé partagée avec le Worker Cloudflare, distincte de celle des envois.
    const bordureKey = env.VIGIE_BORDURE_KEY || null;
    if (bordureKey && bordureKey.length < 32) throw new Error('VIGIE_BORDURE_KEY doit faire au moins 32 caractères');
    if (bordureKey && bordureKey === ingestKey) throw new Error('VIGIE_BORDURE_KEY doit être différente de VIGIE_INGEST_KEY (le Worker ne doit pas pouvoir écrire dans la Vigie)');
    // Adresse publique de la console (lien « Sécurité » de l'admin, comptes securite.voir) : réglée côté site, jamais
    // reprise du résumé reçu ; https:// dès que le site est en ligne.
    let c;
    try { c = new URL(env.VIGIE_CONSOLE_URL || 'https://vigie.nicephos.art'); } catch { throw new Error(`VIGIE_CONSOLE_URL n’est pas une adresse valide : ${env.VIGIE_CONSOLE_URL}`); }
    if (c.protocol !== 'https:' && (deployed || c.protocol !== 'http:')) throw new Error('VIGIE_CONSOLE_URL doit commencer par https://');
    if (c.username || c.password || c.search || c.hash) throw new Error('VIGIE_CONSOLE_URL : adresse simple attendue (sans identifiants ni paramètres)');
    const consoleUrl = `${c.origin}${c.pathname}`.replace(/\/+$/, '');
    vigie = { url: `${u.origin}${u.pathname}`.replace(/\/+$/, ''), ingestKey, decisionsPubkey, bordureKey, apply: env.VIGIE_APPLIQUER !== '0', consoleUrl };
  }

  return {
    vigie,
    production,
    instagram,
    deployed,
    siteName: env.SITE_NAME || 'Nicephos',
    host,
    port: Number(env.PORT || 3000),
    publicUrl,
    // Cookies Secure dès que le site est servi en HTTPS (toujours le cas derrière Cloudflare Tunnel).
    secureCookies: https,
    // Proxys dont on accepte X-Forwarded-* : par défaut cloudflared en local ou sur le réseau Docker.
    trustProxy: parseTrustProxy(env.TRUST_PROXY, deployed),
    // Valeur par défaut (toutes les adresses privées) : le serveur avertit au démarrage s'il écoute sur le réseau.
    trustProxyDefault: deployed && (env.TRUST_PROXY === undefined || env.TRUST_PROXY === ''),
    databasePath: path.resolve(env.DATABASE_PATH || path.join(storageDir, 'site.db')),
    storageDir,
    cookieSecret,
    localAuthToken,
    tsa: { url: tsaUrl, caFile: tsaCaFile },
    translate: { url: translateUrl, apiKey: env.TRANSLATE_API_KEY || null },
    mail: { url: smtpUrl, from: mailFrom, proxy: sortieProxy },
    dataKey,
    authRateLimit: Math.max(Number.parseInt(env.AUTH_RATE_LIMIT, 10) || 30, 1),
    oidc: {
      issuer,
      clientId: env.OIDC_CLIENT_ID || null,
      clientSecret: env.OIDC_CLIENT_SECRET || null,
      redirectUri: env.OIDC_REDIRECT_URI || `${publicUrl}/auth/callback`,
      projectId: env.OIDC_PROJECT_ID || null,
      // Organisation Zitadel propriétaire du projet : un rôle donné ailleurs (projet partagé) est ignoré.
      orgId: env.OIDC_ORG_ID || null,
      adminRole: env.OIDC_ADMIN_ROLE || 'admin',
      allowedSubs: list(env.OIDC_ALLOWED_SUBS),
    },
    // Garde-fou : identités (sub) toujours administratrices, quoi qu'il arrive aux comptes dans l'admin.
    adminSubs: list(env.ADMIN_SUBS),
  };
}
