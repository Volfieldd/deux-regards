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
import brandRoutes, { createAppearance } from './routes/brand.js';
import { setupAuth } from './auth.js';
import { createVariantService } from './variants.js';
import { createProofService } from './proofs.js';
import { createStats } from './stats.js';
import { createInstagram } from './instagram.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Tout est servi depuis notre domaine : pas de script, police ni image tierce.
// Seule exception : form-action autorise l'IdP, cible de la redirection après déconnexion.
const csp = formOrigins => [
  "default-src 'self'",
  "img-src 'self' blob:",                 // blob: aperçus locaux des photos choisies (import de l'admin)
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

export async function buildApp({ config, db, logger = true, oidc, proofOptions = {}, instagramOptions = {} }) {
  const app = Fastify({ logger: loggerOptions(logger), trustProxy: config.trustProxy });

  app.decorate('config', config);
  // Liste des routes (méthode, chemin) : les tests vérifient que chaque route d'admin est protégée.
  const routeList = [];
  app.decorate('routeList', routeList);
  app.addHook('onRoute', r => { for (const m of [].concat(r.method)) routeList.push({ method: m, url: r.url }); });
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
  const authorNames = db.prepare('SELECT name FROM authors ORDER BY id').pluck();
  const asset = assetUrls(path.join(ROOT, 'public'), config.production);
  app.decorate('appearance', createAppearance(app));
  app.decorateReply('render', function (template, data) {
    const names = authorNames.all();
    const brand = app.appearance.brand();
    const theme = app.appearance.forRequest(this.request, this);
    const common = { asset, theme, brand, isAdmin: Boolean(this.request.session), publicUrl: config.publicUrl, authorNames: names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0] || '' };
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
  app.decorate('variants', createVariantService({ db, storageDir: config.storageDir, siteName: app.siteName, log: app.log, publicUrl: config.publicUrl }));
  app.addHook('onReady', async () => { app.variants.schedule(); });
  app.addHook('onClose', async () => { await app.variants.stop(); });
  // Preuves d'antériorité : empreintes et horodatage RFC 3161, repris en arrière-plan.
  // Mesure d'audience anonyme (voir server/stats.js).
  app.decorate('stats', createStats({ db, publicUrl: config.publicUrl, log: app.log }));
  // Partage Instagram : file de publication et envoi aux créneaux (voir server/instagram.js).
  app.decorate('instagram', createInstagram({ db, storageDir: config.storageDir, config, variants: app.variants, siteName: app.siteName, log: app.log, ...instagramOptions }));
  app.addHook('onReady', async () => { if (!instagramOptions.manual) app.instagram.start(); });
  app.addHook('onClose', async () => { app.instagram.stop(); });
  app.decorate('proofs', createProofService({ db, storageDir: config.storageDir, tsa: config.tsa, log: app.log, ...proofOptions }));
  app.addHook('onReady', async () => { app.proofs.start(); });
  app.addHook('onClose', async () => { await app.proofs.stop(); });

  await setupAuth(app, oidc && { oidc });
  const headers = { ...SECURITY_HEADERS, 'content-security-policy': csp([app.oidc.origin].filter(Boolean)) };

  app.addHook('onSend', async (request, reply) => {
    reply.headers(headers);
    // Sans includeSubDomains : le domaine définitif n'est pas encore choisi, ses sous-domaines pas connus.
    if (config.secureCookies) reply.header('strict-transport-security', 'max-age=31536000');
  });

  // Erreurs inattendues : détail dans les journaux, jamais dans la réponse (chemins, noms de fichiers…).
  app.setErrorHandler((err, request, reply) => {
    const status = err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) request.log.error({ err }, 'erreur inattendue');
    const message = status < 500 ? err.message : 'Une erreur inattendue est survenue. Réessayez dans un instant.';
    reply.code(status).header('cache-control', 'no-store');
    if (!request.headers.accept?.includes('text/html')) return reply.send({ error: message });
    const siteName = app.siteName();
    return reply.render('auth-error', { siteName, pageTitle: `Erreur · ${siteName}`, description: '', title: status < 500 ? 'Requête refusée' : 'Erreur', message });
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
  await app.register(brandRoutes);
  await app.register(adminRoutes);
  await app.register(publicRoutes);

  return app;
}
