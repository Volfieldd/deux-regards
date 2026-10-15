import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocator } from './geo/locate.js';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import * as cities from './geo/cities.js';
import { LANGS, NAMES, LOCALES, localize, splitLang } from './i18n.js';
import { Eta } from 'eta';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import mediaRoutes from './routes/media.js';
import brandRoutes, { createAppearance } from './routes/brand.js';
import { setupAuth } from './auth.js';
import { createVariantService } from './variants.js';
import { createProofService } from './proofs.js';
import { createStats } from './stats.js';
import { createTranslator } from './translate.js';
import { createEncounters } from './encounters.js';
import { createMailer } from './mailer.js';
import { createVault } from './vault.js';
import { createInstagram } from './instagram.js';
import { createTodo } from './todo.js';
import { createOutings } from './outings.js';
import { createPeople } from './people.js';
import { createFeedback } from './feedback.js';
import { createReadiness } from './readiness.js';
import { createFaceDetector, createFaceService } from './faces.js';
import { createImageModel, createSeriesSuggest } from './series-suggest.js';

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

// Le code d'autorisation, le state OAuth et le jeton d'image Instagram n'ont rien à faire dans les journaux,
// même encodés dans un paramètre (« next=…%3Fcode%3D… »).
export function redactUrl(url) {
  let u = String(url);
  try { u = decodeURIComponent(u); } catch { /* URL mal encodée : telle quelle */ }
  return u.replace(/([?&](?:code|state)=)[^&#]*/g, '$1[masqué]').replace(/(\/partage\/instagram\/)[^/?#]+/, '$1[masqué]');
}
// Adresse IP tronquée dans les journaux (/24 en IPv4, /48 en IPv6) : assez pour diagnostiquer, pas pour identifier.
export function truncateIp(ip) {
  const s = String(ip || '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.replace(/\.\d+$/, '.0');
  if (s.startsWith('::ffff:')) return truncateIp(s.slice(7));
  if (s.includes(':')) return `${s.split(':').slice(0, 3).join(':')}::`;
  return s;
}

const loggerOptions = logger => logger && {
  ...(typeof logger === 'object' ? logger : {}),
  serializers: {
    req: req => ({ method: req.method, url: redactUrl(req.url), host: req.host, remoteAddress: truncateIp(req.ip) }),
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

export async function buildApp({ config, db, logger = true, oidc, proofOptions = {}, instagramOptions = {}, faceOptions = {}, seriesOptions = {}, mailTransport = null }) {
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
  // Page « Carte » (facultative, désactivée par défaut) : lien dans le menu du site seulement si elle est publiée.
  const mapSetting = db.prepare("SELECT value FROM settings WHERE key = 'map_page'").pluck();
  const asset = assetUrls(path.join(ROOT, 'public'), config.production);
  app.decorate('appearance', createAppearance(app));
  app.decorateReply('render', function (template, data) {
    const names = authorNames.all();
    const brand = app.appearance.brand();
    const theme = app.appearance.forRequest(this.request, this);
    const common = { asset, theme, brand, isAdmin: Boolean(this.request.session), publicUrl: config.publicUrl, mapPage: mapSetting.get() === 'true',
      // Langues du site : page courante sans préfixe (sélecteur de langue), noms et adresses localisées.
      here: splitLang(this.request.url).path, langs: LANGS, langNames: NAMES, locales: LOCALES, localize,
      authorNames: names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0] || '' };
    return this.type('text/html; charset=utf-8').send(eta.render(`./${template}`, { ...common, ...data }));
  });

  await app.register(fastifyStatic, {
    root: path.join(ROOT, 'public'), prefix: '/static/',
    preCompressed: true,                 // fonds de carte : .br / .gz à côté du fichier
    ...(config.production ? { maxAge: '365d', immutable: true } : { maxAge: 0 }),
  });
  await app.register(fastifyStatic, {
    root: path.join(ROOT, 'node_modules/@fontsource'), prefix: '/fonts/', decorateReply: false,
    maxAge: '365d', immutable: true, allowedPath: p => p.endsWith('.woff2'),
  });

  // Variantes : vérifiées au démarrage (réglages changés, rendu interrompu), puis à chaque modification.
  app.decorate('variants', createVariantService({ db, storageDir: config.storageDir, siteName: app.siteName, log: app.log, publicUrl: config.publicUrl }));
  app.addHook('onReady', async () => { app.variants.schedule(); });
  // Villes proposées d'après le GPS des originaux importés avant la carte (une seule lecture par photo).
  app.decorate('locator', createLocator({ db, storageDir: config.storageDir, log: app.log }));
  app.addHook('onReady', async () => { app.locator.schedule(); });
  // Liste des villes (~250 000 lieux, 1 à 2 s de lecture) : chargée juste après le démarrage en production, pas à la
  // première frappe dans le champ Ville.
  if (config.production) app.addHook('onReady', async () => { setTimeout(() => cities.byId(0), 1000).unref(); });
  app.addHook('onClose', async () => { await app.locator.stop(); });
  app.addHook('onClose', async () => { await app.variants.stop(); });
  // Preuves d'antériorité : empreintes et horodatage RFC 3161, repris en arrière-plan.
  // Mesure d'audience anonyme (voir server/stats.js).
  // Pays : l'en-tête de Cloudflare n'est cru que derrière un proxy de confiance (tunnel), sinon « inconnu ».
  // Rencontres (page /bonjour, cartes) ; demandes sans accord ni refus effacées après 12 mois (contrôle quotidien).
  app.decorate('encounters', createEncounters({ db, vault: createVault(config.dataKey) }));
  app.decorate('mailer', createMailer({ ...config.mail, log: app.log, transport: mailTransport }));
  // Personnes : chaque rencontre a la sienne, un refus récent vaut pour toutes ses rencontres (voir server/people.js).
  // Premier abonné aux changements d'accord : la file Instagram, ensuite, voit déjà les refus étendus.
  app.decorate('people', createPeople({ db, encounters: app.encounters }));
  // J'aime et signalements des visiteurs (voir server/feedback.js).
  app.decorate('feedback', createFeedback({ db, vault: createVault(config.dataKey) }));
  app.encounters.onChange(() => app.people.sync());
  let purgeTimer = null;
  app.addHook('onReady', async () => {
    const sealed = app.encounters.sealExisting();
    if (sealed) app.log.info({ sealed }, 'rencontres : données en clair chiffrées');
    app.encounters.reindexEmails();
    app.feedback.sealExisting();
    app.encounters.purge();
    app.feedback.purge();
    app.people.sync();
    purgeTimer = setInterval(() => { try { app.encounters.purge(); app.feedback.purge(); app.people.sync(); } catch (err) { app.log.error({ err }, 'rencontres : purge'); } }, 24 * 3600 * 1000);
    purgeTimer.unref();
  });
  app.addHook('onClose', async () => clearInterval(purgeTimer));
  app.decorate('translator', createTranslator({ ...config.translate, log: app.log }));
  app.decorate('stats', createStats({ db, publicUrl: config.publicUrl, log: app.log, trustCountry: Boolean(config.trustProxy) }));
  // Partage Instagram : file de publication et envoi aux créneaux (voir server/instagram.js).
  // État de chaque photo pour chaque usage (prête, à vérifier, bloquée), d'après ses visages et les accords.
  app.decorate('readiness', createReadiness({ db, encounters: app.encounters }));
  // Visages : détectés (jamais reconnus) sur le serveur, à l'import et une fois pour les anciennes photos.
  // faceOptions.manual (tests) : rien ne démarre seul ; faceOptions.detector remplace le modèle.
  app.decorate('faces', createFaceService({ db, storageDir: config.storageDir, detector: faceOptions.detector || createFaceDetector({ log: app.log }), log: app.log }));
  if (!faceOptions.manual) app.addHook('onReady', async () => { app.faces.retryFailed(); setTimeout(() => app.faces.run(), 3000).unref(); });
  app.addHook('onClose', async () => { app.faces.stop(); await app.faces.idle(); });
  // Série proposée (désactivée par défaut) : empreintes d'images calculées sur le serveur, modèle téléchargé à
  // l'allumage dans le dossier de données. seriesOptions.model (tests) remplace le modèle ; manual : rien ne démarre seul.
  app.decorate('seriesSuggest', createSeriesSuggest({ db, storageDir: config.storageDir, log: app.log,
    model: seriesOptions.model || createImageModel({ dir: path.join(config.storageDir, 'models'), log: app.log }) }));
  if (!seriesOptions.manual) app.addHook('onReady', async () => { app.seriesSuggest.retryFailed(); setTimeout(() => app.seriesSuggest.run(), 5000).unref(); });
  app.addHook('onClose', async () => { app.seriesSuggest.stop(); await app.seriesSuggest.idle(); });
  // Instagram suit les accords : une photo bloquée ne part pas, une photo à vérifier seulement sur confirmation ; la
  // file est revue dès qu'un accord change.
  app.decorate('instagram', createInstagram({ db, storageDir: config.storageDir, config, variants: app.variants, siteName: app.siteName, log: app.log,
    readinessOf: id => app.readiness.state(id)?.instagram,
    confirmedFor: id => app.readiness.confirmed(id, 'instagram'),
    onConfirm: (id, reasons, by) => app.readiness.confirm(id, 'instagram', by, reasons), ...instagramOptions }));
  app.encounters.onChange(() => app.instagram.dropBlocked());
  app.addHook('onReady', async () => { if (!instagramOptions.manual) app.instagram.start(); });
  app.addHook('onClose', async () => { app.instagram.stop(); });
  app.decorate('proofs', createProofService({ db, storageDir: config.storageDir, tsa: config.tsa, log: app.log, ...proofOptions }));
  app.addHook('onReady', async () => { app.proofs.start(); });
  // Sorties : journées de prise de vue, découpables (voir server/outings.js) ; heures des anciennes photos lues une fois.
  app.decorate('outings', createOutings({ db, encounters: app.encounters, storageDir: config.storageDir, log: app.log }));
  app.addHook('onReady', async () => { setTimeout(() => app.outings.backfillAll(), 2000).unref(); });
  app.addHook('onClose', async () => { await app.outings.stop(); });
  // « Aujourd'hui » : ce qui demande votre attention (voir server/todo.js).
  app.decorate('todo', createTodo({ db, encounters: app.encounters, instagram: app.instagram, proofs: app.proofs, readiness: app.readiness, feedback: app.feedback, seriesSuggest: app.seriesSuggest }));
  app.addHook('onClose', async () => { await app.proofs.stop(); });

  await setupAuth(app, oidc && { oidc });
  const headers = { ...SECURITY_HEADERS, 'content-security-policy': csp([app.oidc.origin].filter(Boolean)) };

  app.addHook('onSend', async (request, reply) => {
    reply.headers(headers);
    // Seul l'écran « Rencontre » de l'admin (sur le téléphone) peut demander la position, au site lui-même.
    if (request.routeOptions?.config?.geolocation) reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(self)');
    // Sans includeSubDomains : à ajouter quand tous les sous-domaines de nicephos.art seront servis en HTTPS (PLAN.md, feuille de route).
    // COOP n'a d'effet qu'en HTTPS : en http, le navigateur l'ignore avec un avertissement.
    if (config.secureCookies) reply.header('strict-transport-security', 'max-age=31536000').header('cross-origin-opener-policy', 'same-origin');
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
