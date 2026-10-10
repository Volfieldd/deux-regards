import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

export async function buildApp({ config, db, logger = true }) {
  const app = Fastify({ logger, trustProxy: config.production });

  app.decorate('config', config);
  app.decorate('db', db);

  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(formbody);

  app.addHook('onSend', async (request, reply) => {
    reply.headers(SECURITY_HEADERS);
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

  // Page provisoire : remplacée par le front public en phase 1.
  app.get('/', async (request, reply) => {
    const count = db.prepare("SELECT count(*) FROM photos WHERE status = 'published'").pluck().get();
    reply.type('text/html; charset=utf-8');
    return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(config.siteName)}</title><p>${escapeHtml(config.siteName)} : ${count} photos publiées.</p>`;
  });

  return app;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
