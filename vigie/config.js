import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Configuration de la Vigie (son propre .env, jamais celui du site). Refus de démarrer plutôt qu'un réglage douteux.
const need = (env, k) => { if (!env[k]) throw new Error(`Variable manquante : ${k}`); return env[k]; };
const key32 = (env, k) => { const v = need(env, k); if (v.length < 32) throw new Error(`${k} doit faire au moins 32 caractères`); return v; };
const int = (v, d, min, max) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : d; };

// Clé privée Ed25519 des décisions : base64 du DER PKCS#8 (« node vigie/cli.js cles » la produit).
export function decisionsKey(b64) {
  let key;
  try { key = crypto.createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' }); } catch { throw new Error('VIGIE_DECISIONS_PRIVATE_KEY illisible (base64 d’une clé Ed25519 PKCS#8)'); }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('VIGIE_DECISIONS_PRIVATE_KEY doit être une clé Ed25519');
  return key;
}

export function loadVigieConfig(env = process.env) {
  const dataDir = path.resolve(env.VIGIE_DATA_DIR || '/data');
  const issuer = env.VIGIE_ZITADEL_ISSUER ? env.VIGIE_ZITADEL_ISSUER.replace(/\/+$/, '') : null;
  if (issuer && !issuer.startsWith('https://')) throw new Error('VIGIE_ZITADEL_ISSUER doit être en https://');
  if (issuer && !env.VIGIE_ZITADEL_KEY_FILE) throw new Error('VIGIE_ZITADEL_KEY_FILE est obligatoire avec VIGIE_ZITADEL_ISSUER');
  const ingestKey = key32(env, 'VIGIE_INGEST_KEY'), logKey = key32(env, 'VIGIE_LOG_KEY');
  // Clé du journal distincte de celle des envois : le site (qui a la seconde) ne doit pas pouvoir refaire la chaîne.
  if (ingestKey === logKey) throw new Error('VIGIE_LOG_KEY doit être différente de VIGIE_INGEST_KEY');
  // Sauvegardes du site (lecture seule) : obligatoires (arbitrage NC2 du 17 octobre 2026). Sans elles, la Vigie ne
  // saurait les administrateurs que par ce que déclare le site, qu'un site compromis peut falsifier.
  const siteBackupDir = path.resolve(need(env, 'VIGIE_SITE_BACKUP_DIR'));
  let st = null;
  try { st = fs.statSync(siteBackupDir); } catch { /* absent */ }
  if (!st?.isDirectory()) throw new Error(`VIGIE_SITE_BACKUP_DIR : dossier introuvable (${siteBackupDir}) ; montez le BACKUP_DIR du site en lecture seule`);
  // Bordure Cloudflare (phase C3, facultative) : compte, espace KV des blocages, jeu de données Analytics Engine, jeton
  // en fichier (Account Analytics Read + Workers KV Storage Edit).
  let bordure = null;
  if (env.VIGIE_CF_ACCOUNT_ID) {
    const tokenFile = path.resolve(env.VIGIE_CF_TOKEN_FILE || '/secrets/cloudflare-token');
    if (!/^[0-9a-f]{32}$/.test(env.VIGIE_CF_ACCOUNT_ID)) throw new Error('VIGIE_CF_ACCOUNT_ID : identifiant de compte Cloudflare (32 caractères hexadécimaux)');
    if (!/^[0-9a-f]{32}$/.test(env.VIGIE_CF_KV_NAMESPACE || '')) throw new Error('VIGIE_CF_KV_NAMESPACE est obligatoire avec VIGIE_CF_ACCOUNT_ID (identifiant de l’espace KV « vigie-blocages »)');
    if (!fs.existsSync(tokenFile)) throw new Error(`VIGIE_CF_TOKEN_FILE : jeton Cloudflare introuvable (${tokenFile})`);
    const dataset = env.VIGIE_CF_DATASET || 'vigie_bordure';
    if (!/^[a-z_][a-z0-9_]{0,63}$/.test(dataset)) throw new Error('VIGIE_CF_DATASET : nom de jeu de données invalide');
    // Liste d'adresses bloquées chez Cloudflare (phase E3) : facultative, ouverte par VIGIE_CF_LISTE (nom de la liste,
    // « vigie_bloquees » conseillé) ; le jeton doit avoir en plus « Account Filter Lists : Edit ».
    const liste = env.VIGIE_CF_LISTE && env.VIGIE_CF_LISTE !== '0' ? env.VIGIE_CF_LISTE : null;
    if (liste && !/^[a-z0-9_]{1,50}$/.test(liste)) throw new Error('VIGIE_CF_LISTE : nom de liste en minuscules, chiffres et _ (vigie_bloquees)');
    bordure = { accountId: env.VIGIE_CF_ACCOUNT_ID, kvNamespace: env.VIGIE_CF_KV_NAMESPACE, dataset, tokenFile, liste };
  }
  // Notifications (phase D) : Signal (passerelle du réseau interne nicephos-vigie-signal), e-mail en secours.
  let signal = null, mail = null;
  if (env.VIGIE_SIGNAL_NUMERO) {
    if (!/^\+\d{8,15}$/.test(env.VIGIE_SIGNAL_NUMERO)) throw new Error('VIGIE_SIGNAL_NUMERO : numéro international attendu (+33…)');
    if (!/^group\.[A-Za-z0-9+/=_-]{8,200}$/.test(env.VIGIE_SIGNAL_GROUPE || '')) throw new Error('VIGIE_SIGNAL_GROUPE : identifiant du groupe attendu (group.…)');
    const url = (env.VIGIE_SIGNAL_URL || 'http://nicephos-signal:8080').replace(/\/+$/, '');
    if (!/^http:\/\/[a-z0-9-]+(?::\d+)?$/.test(url)) throw new Error('VIGIE_SIGNAL_URL : nom de service du réseau interne attendu (http://nicephos-signal:8080)');
    signal = { url, number: env.VIGIE_SIGNAL_NUMERO, group: env.VIGIE_SIGNAL_GROUPE };
  }
  if (env.VIGIE_SMTP_URL) {
    if (!/^smtps?:\/\//i.test(env.VIGIE_SMTP_URL)) throw new Error('VIGIE_SMTP_URL : smtps://… ou smtp://… attendu');
    const to = String(env.VIGIE_MAIL_TO || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!to.length || !env.VIGIE_MAIL_FROM) throw new Error('VIGIE_MAIL_FROM et VIGIE_MAIL_TO sont obligatoires avec VIGIE_SMTP_URL');
    mail = { url: env.VIGIE_SMTP_URL, from: env.VIGIE_MAIL_FROM, to };
  }
  const consoleUrl = (env.VIGIE_CONSOLE_URL || 'https://vigie.nicephos.art').replace(/\/+$/, '');
  if (!/^https:\/\//.test(consoleUrl)) throw new Error('VIGIE_CONSOLE_URL doit être en https://');
  // Console (phase D3, annexe architecture § 5) : facultative, ouverte par VIGIE_CONSOLE_CLIENT_ID. Trois verrous : jeton
  // Cloudflare Access, connexion Zitadel propre à la console (projet « Vigie »), droits à deux clés relus chez Zitadel
  // (compte de service de la lecture des événements : la console l'exige).
  let consoleCfg = null;
  if (env.VIGIE_CONSOLE_CLIENT_ID) {
    if (!issuer) throw new Error('La console exige VIGIE_ZITADEL_ISSUER et le compte de service (relecture des droits chez Zitadel)');
    if (!/^[0-9]{6,30}$/.test(env.VIGIE_CONSOLE_PROJECT_ID || '')) throw new Error('VIGIE_CONSOLE_PROJECT_ID : identifiant du projet Zitadel « Vigie » attendu');
    if (!/^[0-9]{6,30}$/.test(env.VIGIE_CONSOLE_ORG_ID || '')) throw new Error('VIGIE_CONSOLE_ORG_ID : identifiant de l’organisation propriétaire du projet « Vigie » attendu');
    if (!/^[A-Za-z0-9@._-]{6,200}$/.test(env.VIGIE_CONSOLE_CLIENT_ID)) throw new Error('VIGIE_CONSOLE_CLIENT_ID illisible');
    const secretFile = path.resolve(env.VIGIE_CONSOLE_SECRET_FILE || '/secrets/console-secret');
    let clientSecret = '';
    try { clientSecret = fs.readFileSync(secretFile, 'utf8').trim(); } catch { /* absent */ }
    if (clientSecret.length < 16) throw new Error(`VIGIE_CONSOLE_SECRET_FILE : secret client de l’application « Console Vigie » introuvable ou trop court (${secretFile})`);
    const adminSubs = String(env.VIGIE_ADMIN_SUBS || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!adminSubs.length || adminSubs.some(x => !/^[A-Za-z0-9@._-]{1,200}$/.test(x))) throw new Error('VIGIE_ADMIN_SUBS : au moins un identifiant (sub) Zitadel, séparés par des virgules (amorce des Administrateurs de la console)');
    const roles = env.VIGIE_ROLES || 'deux-cles';
    if (!['deux-cles', 'zitadel'].includes(roles)) throw new Error('VIGIE_ROLES : deux-cles (par défaut) ou zitadel');
    consoleCfg = {
      url: consoleUrl, issuer, clientId: env.VIGIE_CONSOLE_CLIENT_ID, clientSecret,
      projectId: env.VIGIE_CONSOLE_PROJECT_ID, orgId: env.VIGIE_CONSOLE_ORG_ID,
      access: { team: env.VIGIE_ACCESS_TEAM, aud: env.VIGIE_ACCESS_AUD },
      adminSubs, roles,
      host: env.VIGIE_CONSOLE_HOST || '127.0.0.1',                       // la pile la fixe à l'adresse du réseau du tunnel
      port: int(env.VIGIE_CONSOLE_PORT, 4200, 0, 65535),
    };
    if (!/^[a-z0-9-]{1,63}$/.test(consoleCfg.access.team || '')) throw new Error('VIGIE_ACCESS_TEAM : nom d’équipe Cloudflare Access attendu (la console n’est jamais servie sans Access)');
    if (!/^[0-9a-f]{64}$/.test(consoleCfg.access.aud || '')) throw new Error('VIGIE_ACCESS_AUD : étiquette d’audience de l’application Access (64 caractères hexadécimaux)');
  }
  return {
    notifications: { signal, mail, consoleUrl },
    console: consoleCfg,
    bordure,
    dataDir,
    databasePath: path.resolve(env.VIGIE_DATABASE || path.join(dataDir, 'vigie.db')),
    host: env.VIGIE_HOST || '0.0.0.0',
    ingestPort: int(env.VIGIE_INGEST_PORT, 4100, 0, 65535),              // 0 : port libre (tests)
    ingestKey,
    logKey,
    decisionsKey: decisionsKey(need(env, 'VIGIE_DECISIONS_PRIVATE_KEY')),
    retentionDays: int(env.VIGIE_RETENTION_DAYS, 183, 30, 400),
    zitadel: issuer ? { issuer, keyFile: env.VIGIE_ZITADEL_KEY_FILE, intervalMs: int(env.VIGIE_ZITADEL_INTERVAL_S, 60, 30, 3600) * 1000 } : null,
    backupDir: env.VIGIE_BACKUP_DIR ? path.resolve(env.VIGIE_BACKUP_DIR) : null,
    // Sauvegardes du site, montées en lecture seule : contrôle des rôles (annexe architecture 4.4), obligatoire.
    siteBackupDir,
    // Listes de menaces gratuites (D22) : « 0 » pour ne pas les télécharger.
    threatLists: env.VIGIE_MENACES !== '0',
    backupKeep: int(env.VIGIE_BACKUP_KEEP, 14, 1, 365),
  };
}
