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

  const cookieSecret = env.COOKIE_SECRET || (production ? required(env, 'COOKIE_SECRET') : 'dev-only-secret-change-me-dev-only-secret');
  if (cookieSecret.length < 32) throw new Error('COOKIE_SECRET doit faire au moins 32 caractères');

  const publicUrl = (env.PUBLIC_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/+$/, '');

  return {
    production,
    siteName: env.SITE_NAME || 'Deux Regards',
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 3000),
    publicUrl,
    // Cookies Secure dès que le site est servi en HTTPS (toujours le cas derrière Caddy).
    secureCookies: publicUrl.startsWith('https://'),
    databasePath: path.resolve(env.DATABASE_PATH || path.join(storageDir, 'site.db')),
    storageDir,
    cookieSecret,
    oidc: {
      issuer: env.OIDC_ISSUER || null,
      clientId: env.OIDC_CLIENT_ID || null,
      clientSecret: env.OIDC_CLIENT_SECRET || null,
      redirectUri: env.OIDC_REDIRECT_URI || `${publicUrl}/auth/callback`,
      projectId: env.OIDC_PROJECT_ID || null,
      adminRole: env.OIDC_ADMIN_ROLE || 'admin',
      allowedSubs: list(env.OIDC_ALLOWED_SUBS),
    },
  };
}
