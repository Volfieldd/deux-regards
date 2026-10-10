import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import { Eta } from 'eta';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import mediaRoutes from './routes/media.js';
import { setupAuth } from './auth.js';
import { createVariantService } from './variants.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Tout est servi depuis notre domaine : pas de script, police ni image tierce.
// Seule exception : form-action autorise l'IdP, cible de la redirection après déconnexion.
const csp = formOrigins => [
  "default-src 'self'",
  "img-src 'self'",
  "style-src 'self'",
  "script-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'self'",
  `form-action ${["'self'", ...formOrigins].join(' ')}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

// Le code d'autorisation et le state OIDC n'ont rien à faire dans les journaux.
export function redactUrl(url) {
  return url.replace(/([?&](?:code|state)=)[^&#]*/g, '$1[masqué]');
}

const loggerOptions = logger => logger && {
  ...(typeof logger === 'object' ? logger : {}),
  serializers: {
    req: req => ({ method: req.method, url: redactUrl(req.url), host: req.host, remoteAddress: req.ip }),
  },
};

// URL d'un fichier de public/ avec l'empreinte de son contenu : cache long sans fichier périmé après une mise à jour.
function assetUrls(root, cache) {
  const known = new Map();
  return file => {
    if (cache && known.has(file)) return known.get(file);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex').slice(0, 10);
    const url = `/static/${file}?v=${hash}`;
    known.set(file, url);
    return url;
  };
}

export async function buildApp({ config, db, logger = true, oidc }) {
  const app = Fastify({ logger: loggerOptions(logger), trustProxy: config.trustProxy });

  app.decorate('config', config);
  app.decorate('db', db);
  // Nom affiché : réglage de l'admin s'il existe, sinon SITE_NAME.
  const siteNameSetting = db.prepare("SELECT value FROM settings WHERE key = 'site_name'").pluck();
  app.decorate('siteName', () => {
    const v = siteNameSetting.get();
    return (v && JSON.parse(v)) || config.siteName;
  });

  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(formbody);

  const eta = new Eta({ views: path.join(ROOT, 'views'), cache: config.production });
  const asset = assetUrls(path.join(ROOT, 'public'), config.production);
  app.decorateReply('render', function (template, data) {
    const common = { asset, publicUrl: config.publicUrl };
    return this.type('text/html; charset=utf-8').send(eta.render(`./${template}`, { ...common, ...data }));
  });

  await app.register(fastifyStatic, {
    root: path.join(ROOT, 'public'), prefix: '/static/',
    ...(config.production ? { maxAge: '365d', immutable: true } : { maxAge: 0 }),
  });
  await app.register(fastifyStatic, {
    root: path.join(ROOT, 'node_modules/@fontsource'), prefix: '/fonts/', decorateReply: false,
    maxAge: '365d', immutable: true, allowedPath: p => p.endsWith('.woff2'),
  });

  // Variantes : vérifiées au démarrage (réglages changés, rendu interrompu), puis à chaque modification.
  app.decorate('variants', createVariantService({ db, storageDir: config.storageDir, siteName: app.siteName, log: app.log }));
  app.addHook('onReady', async () => { app.variants.schedule(); });
  app.addHook('onClose', async () => { await app.variants.idle(); });

  await setupAuth(app, oidc && { oidc });
  const headers = { ...SECURITY_HEADERS, 'content-security-policy': csp([app.oidc.origin].filter(Boolean)) };

  app.addHook('onSend', async (request, reply) => {
    reply.headers(headers);
    // Sans includeSubDomains : le domaine définitif n'est pas encore choisi, ses sous-domaines pas connus.
    if (config.secureCookies) reply.header('strict-transport-security', 'max-age=31536000');
  });

  app.get('/healthz', async (request, reply) => {
    try {
      db.prepare('SELECT 1').get();
      return { status: 'ok' };
    } catch (err) {
      request.log.error(err, 'base de données indisponible');
      return reply.code(503).send({ status: 'error' });
    }
  });

  await app.register(mediaRoutes);
  await app.register(adminRoutes);
  await app.register(publicRoutes);

  return app;
}
