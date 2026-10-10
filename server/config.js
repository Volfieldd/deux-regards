import path from 'node:path';

const required = (env, key) => {
  const value = env[key];
  if (!value) throw new Error(`Variable d'environnement manquante : ${key}`);
  return value;
};

const list = value => (value ? value.split(',').map(s => s.trim()).filter(Boolean) : []);

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const storageDir = path.resolve(env.STORAGE_DIR || './storage');
  const publicUrl = (env.PUBLIC_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/+$/, '');
  const https = publicUrl.startsWith('https://');
  // Site en ligne : NODE_ENV=production ou URL publique en HTTPS. Les protections ne dépendent
  // pas d'une seule variable qu'on pourrait oublier au déploiement.
  const deployed = production || https;

  const cookieSecret = env.COOKIE_SECRET || (deployed ? required(env, 'COOKIE_SECRET') : 'dev-only-secret-change-me-dev-only-secret');
  if (cookieSecret.length < 32) throw new Error('COOKIE_SECRET doit faire au moins 32 caractères');

  const issuer = env.OIDC_ISSUER || null;
  if (issuer && deployed && !issuer.startsWith('https://')) throw new Error('OIDC_ISSUER doit être en HTTPS hors développement');

  // Connexion locale de test : interdite dès que le site est en ligne.
  const localAuthToken = env.LOCAL_AUTH_TOKEN || null;
  if (localAuthToken && deployed) throw new Error('LOCAL_AUTH_TOKEN est réservé aux tests : interdit en HTTPS ou en production');
  if (localAuthToken && localAuthToken.length < 16) throw new Error('LOCAL_AUTH_TOKEN doit faire au moins 16 caractères');

  return {
    production,
    deployed,
    siteName: env.SITE_NAME || 'Deux Regards',
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 3000),
    publicUrl,
    // Cookies Secure dès que le site est servi en HTTPS (toujours le cas derrière Caddy).
    secureCookies: https,
    // Proxys dont on accepte X-Forwarded-* : par défaut Caddy en local ou sur le réseau Docker.
    trustProxy: env.TRUST_PROXY || (deployed ? 'loopback,uniquelocal' : false),
    databasePath: path.resolve(env.DATABASE_PATH || path.join(storageDir, 'site.db')),
    storageDir,
    cookieSecret,
    localAuthToken,
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
  };
}
