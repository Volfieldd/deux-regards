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
import { setupAuth } from './auth.js';

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

export async function buildApp({ config, db, logger = true, oidc }) {
  const app = Fastify({ logger, trustProxy: config.production });

  app.decorate('config', config);
  app.decorate('db', db);

  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(formbody);

  const eta = new Eta({ views: path.join(ROOT, 'views'), cache: config.production });
  app.decorateReply('render', function (template, data) {
    return this.type('text/html; charset=utf-8').send(eta.render(`./${template}`, data));
  });

  await app.register(fastifyStatic, { root: path.join(ROOT, 'public'), prefix: '/static/', maxAge: config.production ? '1d' : 0 });
  await app.register(fastifyStatic, {
    root: path.join(ROOT, 'node_modules/@fontsource'), prefix: '/fonts/', decorateReply: false,
    maxAge: '365d', immutable: true, allowedPath: p => p.endsWith('.woff2'),
  });
  // Seules les variantes sont exposées ; storage/originals n'a aucune route.
  const variants = path.join(config.storageDir, 'variants');
  fs.mkdirSync(variants, { recursive: true });
  await app.register(fastifyStatic, { root: variants, prefix: '/media/', decorateReply: false, maxAge: '365d', immutable: true });

  await setupAuth(app, oidc && { oidc });
  const headers = { ...SECURITY_HEADERS, 'content-security-policy': csp([app.oidc.origin].filter(Boolean)) };

  app.addHook('onSend', async (request, reply) => {
    reply.headers(headers);
    if (config.production) reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
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

  await app.register(adminRoutes);
  await app.register(publicRoutes);

  return app;
}
