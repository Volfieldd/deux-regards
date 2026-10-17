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
  return {
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
