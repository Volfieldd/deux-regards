import { designRowSizes } from './designs.js';
import crypto from 'node:crypto';
import { createReview } from './review.js';
import { createNotes } from './notes.js';
import { createAccounts, createAudit } from './accounts.js';
import { hasRole } from './permissions.js';
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
import { vueSite } from './vue-site.js';
import { Eta } from 'eta';
import publicRoutes from './routes/public.js';
import privateRoutes, { createRenderGate } from './routes/prive.js';
import { createSpaces } from './spaces.js';
import adminRoutes from './routes/admin.js';
import mediaRoutes from './routes/media.js';
import brandRoutes, { createAppearance } from './routes/brand.js';
import { setupAuth } from './auth.js';
import { createVariantService } from './variants.js';
import { createProofService } from './proofs.js';
import { createStats } from './stats.js';
import { createTranslator } from './translate.js';
import { createEncounters, parseRef } from './encounters.js';
import { createMailer } from './mailer.js';
import { createReminders } from './reminders.js';
import { createTrips } from './trips.js';
import { createKeywordSuggester } from './keywords-suggest.js';
import { createDescriber, createFlorence } from './describe.js';
import { createVault } from './vault.js';
import { createInstagram } from './instagram.js';
import { createTodo } from './todo.js';
import { createOutings } from './outings.js';
import { createShotBackfill } from './prise-de-vue.js';
import { createPeople } from './people.js';
import { createFeedback } from './feedback.js';
import { createMessages } from './messages.js';
import { createReadiness } from './readiness.js';
import { createFaceDetector, createFaceService } from './faces.js';
import { createImageModel, createSeriesSuggest } from './series-suggest.js';
import { createShares } from './share.js';
import { truncateIp } from './ip.js';
import { TRAP_PATH } from './securite/piege.js';
import { createPublicVersion, usesV2 } from './version-publique.js';
import { createCarnet } from './carnet.js';
import { createSaisons } from './saisons.js';
import { createSaisonsPropositions } from './saisons-propositions.js';
import { createSaisonsBilans } from './saisons-bilans.js';
import { archiveEndsAt, createSaisonsPubliques } from './saisons-publiques.js';
import { EXPOSITION_UI } from './routes/expositions.js';
import { installExpositionVotes } from './routes/expositions-votes.js';
import { createRepo } from './repo.js';

export { truncateIp };

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

// Le code d'autorisation, le state OAuth, le jeton d'image Instagram, celui d'une photo offerte (/pour-vous/…) et le
// code de contrôle d'une carte (/bonjour/J-0042-K7Q : la référence reste, le code non) n'ont rien à faire dans les
// journaux, même encodés dans un paramètre (« next=…%3Fcode%3D… »).
export function redactUrl(url) {
  let u = String(url);
  try { u = decodeURIComponent(u); } catch { /* URL mal encodée : telle quelle */ }
  return u.replace(/([?&](?:code|state)=)[^&#]*/g, '$1[masqué]').replace(/(\/partage\/instagram\/)[^/?#]+/, '$1[masqué]')
    .replace(/(\/pour-vous\/)[^/?#]+/, '$1[masqué]')
    // Lien d'une galerie privée (/g/<jeton>) : toute suite de 20 caractères [\w-] ou plus après « /g/ », quelle que soit la
    // casse et ce qui précède (« //g/… », « /fr/g/… », « /./g/… », « /G/… », « vers=/g/… », « next=https://site/g/… ») :
    // annexe de sécurité, G13, M14 ; revue de sécurité de la PR #149.
    .replace(/(\/g\/)[\w-]{20,}/gi, '$1[masqué]')
    .replace(/(\/bonjour\/)([^/?#]+)/, (m, p, seg) => { const r = parseRef(seg); return r?.code ? `${p}${r.ref}-[masqué]` : m; });
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

// Sans Vigie : aucun événement n'est construit ni gardé.
const SECURITE_OFF = Object.freeze({ enabled: false, emit: () => null, emitThrottled: () => null });

export async function buildApp({ config, db, logger = true, oidc, proofOptions = {}, instagramOptions = {}, faceOptions = {}, seriesOptions = {}, describeOptions = {}, mailTransport = null, vigieOptions = {}, votesOptions = {} }) {
  const app = Fastify({ logger: loggerOptions(logger), trustProxy: config.trustProxy });

  app.decorate('config', config);
  // TRUST_PROXY laissé par défaut (toutes les adresses privées) sur un serveur joignable du réseau : un poste du réseau
  // local pourrait se faire passer pour le proxy (X-Forwarded-For) et contourner les limites de débit.
  if (config.trustProxyDefault && !['127.0.0.1', '::1', 'localhost'].includes(config.host)) {
    app.log.warn('TRUST_PROXY non défini : X-Forwarded-For est accepté de toute adresse privée ; fixez TRUST_PROXY à l’adresse du tunnel (cloudflared)');
  }
  // Liste des routes (méthode, chemin) : les tests vérifient que chaque route d'admin est protégée.
  const routeList = [];
  app.decorate('routeList', routeList);
  app.addHook('onRoute', r => { for (const m of [].concat(r.method)) routeList.push({ method: m, url: r.url, perm: r.config?.perm || null }); });
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
  // Recherche (activée par défaut : lien « Rechercher » dans le menu) ; mots-clés affichés sur la page photo (non par défaut).
  const searchSetting = db.prepare("SELECT value FROM settings WHERE key = 'search_page'").pluck();
  // L’accueil suit le choix explicite de l’administrateur ; aucune exposition ne prend sa place automatiquement.
  const expositionSetting = db.prepare("SELECT value FROM settings WHERE key = 'saison_accueil'").pluck();
  // Lien « Voyages » du menu : au moins un voyage publié qui a une photo publiée.
  const tripsOpen = db.prepare(`SELECT EXISTS (SELECT 1 FROM trips t JOIN trip_days d ON d.trip_id = t.id JOIN photos p ON p.author_id = d.author_id AND p.taken_on = d.day
    WHERE t.public = 1 AND p.status = 'published')`).pluck();
  const asset = assetUrls(path.join(ROOT, 'public'), config.production);
  app.decorate('appearance', createAppearance(app));
  // Site public v1 ou v2 (réglage, aperçu d'un administrateur, repli sur v1 : server/version-publique.js).
  app.decorate('publicVersion', createPublicVersion({ db, viewsDir: path.join(ROOT, 'views'), cache: config.production }));
  app.decorateReply('render', function (template, data) {
    const names = authorNames.all();
    const brand = app.appearance.brand();
    let theme = app.appearance.forRequest(this.request, this);
    // Pages publiques seulement : l'admin et ses pages d'erreur restent ce qu'elles sont.
    // Pages des galeries privées : toujours en v2 (elles n'ont pas de v1), sans le bouton de la vue (pages neutres).
    const only = app.publicVersion.onlyV2(template);
    const pv = only || /^admin\//.test(template) || /^\/(?:admin|auth)(?:[/?#]|$)/.test(this.request.url) ? null : app.publicVersion.forRequest(this.request, template === 'home' ? (data?.page === 'accueil' ? 'accueil' : 'galerie') : undefined);
    const darkroom = pv?.darkroom && app.publicVersion.hasV2(template) ? pv.design : null;
    if (darkroom) theme = { ...theme, preview: false, scheme: 'dark', classes: `theme-chambre mode-nuit chambre-${darkroom}`, stylesheet: null };
    const v2 = only || (usesV2(pv?.version) && app.publicVersion.hasV2(template));
    // v3 : les gabarits v2, redessinés (css/v3/v3.css, accueil en plein cadre : views/v3/). Pas les pages des galeries
    // privées, qui gardent leur dessin quel que soit le réglage.
    const v3 = !only && v2 && pv?.version === 'v3';
    // Page sans gabarit v1 (née avec la v2, comme les Carnets) servie en v1 : introuvable, jamais une erreur.
    if (pv && !v2 && !app.publicVersion.hasV1(template)) return this.callNotFound();
    // Pages /galerie et /series (v2 et v3) : existent-elles pour cette requête ? Le menu, l'accueil et les gabarits y mènent
    // alors (it.galerieHref, it.seriesHref), sinon aux ancres de l'accueil (/#galerie, /#series) ; les vues de la galerie
    // passent sur /galerie (data.galerieUrl, server/routes/public.js). Jamais pour l'admin ni les galeries privées.
    const galeriePage = Boolean(pv) && usesV2(app.publicVersion.forRequest(this.request, 'galerie').version);
    const lang = data?.lang || splitLang(this.request.url).lang;
    const galerieLinks = { galeriePage, galerieHref: galeriePage ? localize('/galerie', lang) : `${localize('/', lang)}#galerie`,
      seriesHref: galeriePage ? localize('/series', lang) : `${localize('/', lang)}#series`,
      ...(galeriePage && typeof data?.galerieUrl === 'function' ? { galleryUrl: data.galerieUrl } : {}) };
    // S2 : un aperçu privé ne rend pas publique la rubrique. Le menu exige sa publication et sa disponibilité dans
    // la vue courante ; les galeries privées ne reprennent jamais les contenus éditoriaux de l’accueil.
    const expositionsOpen = Boolean(pv) && usesV2(app.publicVersion.versionForSection('expositions'))
      && usesV2(app.publicVersion.forRequest(this.request, 'expositions').version);
    const collectionsPage = expositionsOpen && app.saisonsBilans.publicCollections({ lang }).length > 0;
    const expositionsPage = expositionsOpen && (app.expositions.list({ lang }).length > 0 || collectionsPage);
    let homeExposition = null;
    if (v2 && expositionsPage && template === 'home' && data?.page === 'accueil') {
      let featured = null;
      try { featured = JSON.parse(expositionSetting.get() || 'null'); } catch { /* ancien réglage invalide : ouverture habituelle */ }
      if (Number.isSafeInteger(featured) && featured > 0) {
        const e = app.expositions.byId(featured, { lang });
        if (e && ['annonce', 'ouverte', 'archive'].includes(e.phase)) homeExposition = e;
      }
      if (homeExposition) this.header('cache-control', 'no-store');
    }
    const common = { trapLink: config.vigie ? TRAP_PATH : null, asset, theme, brand, isAdmin: hasRole(this.request.session?.roles), publicUrl: config.publicUrl, mapPage: mapSetting.get() === 'true', searchPage: searchSetting.get() !== 'false', tripsPage: Boolean(tripsOpen.get()),
      expositionsPage, collectionsPage, expositionUi: EXPOSITION_UI[lang], homeExposition, expositionsCss: Boolean(homeExposition),
      expositionDate: at => `${new Intl.DateTimeFormat(LOCALES[lang].replace('_', '-'), { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(at)} UTC`,
      // Disponibilité des Carnets selon leur rubrique, y compris depuis un accueil V1 dans le système de thèmes.
      carnetPage: usesV2(app.publicVersion.forRequest(this.request, 'carnets').version) && app.carnet.publishedCount() > 0, v3, darkroom, designRowSizes, sectionThemes: Boolean(pv?.configured || pv?.darkroom), designSection: pv?.section,
      // Langues du site : page courante sans préfixe (sélecteur de langue), noms et adresses localisées.
      here: splitLang(this.request.url).path, langs: LANGS, langNames: NAMES, locales: LOCALES, localize,
      authorNames: names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0] || '',
      // Bouton « Voir en v1 / Voir en v2 » (server/vue-site.js ; formulaire POST, jeton CSRF de la session), pour
      // l'administrateur qui a le droit d'apparence seulement, en v2 comme sur une page restée en v1 faute de gabarit v2.
      vueSite: pv?.switcher ? vueSite({ pv, lang: data?.lang || splitLang(this.request.url).lang, url: this.request.url, csrf: this.request.session.csrf,
        rendu: v3 ? 'v3' : v2 ? 'v2' : 'v1', sansV1: !app.publicVersion.hasV1(template) }) : null };
    return this.type('text/html; charset=utf-8').send(eta.render(v2 ? `./v2/${template}` : `./${template}`, { ...common, ...data, ...galerieLinks }));
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
  // Liste des villes (~250 000 lieux, 2 à 5 s de calcul) : chargée juste après le démarrage en production, par tranches
  // entre lesquelles le site répond, pas à la première frappe dans le champ Ville.
  if (config.production) app.addHook('onReady', async () => { setTimeout(() => cities.preload().catch(err => app.log.error({ err }, 'villes')), 1000).unref(); });
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
  // Messages des visiteurs : page Contact et demande de licence (voir server/messages.js), chiffrés comme les signalements.
  app.decorate('messages', createMessages({ db, vault: createVault(config.dataKey) }));
  // Comptes de l'admin et journal (server/accounts.js), utilisés aussi par la connexion (server/auth.js).
  app.decorate('accounts', createAccounts({ db, adminSubs: config.adminSubs || [], ticketKey: Buffer.from(crypto.hkdfSync('sha256', config.cookieSecret, 'deux-regards', 'tickets-comptes-v1', 32)) }));
  app.decorate('audit', createAudit({ db }));
  // Remarques adressées au photographe d'une photo (server/notes.js).
  app.decorate('notes', createNotes({ db }));
  // Partages des photos, comptés anonymement (voir server/share.js).
  app.decorate('shares', createShares({ db }));
  app.encounters.onChange(() => app.people.sync());
  let purgeTimer = null;
  app.addHook('onReady', async () => {
    const sealed = app.encounters.sealExisting();
    if (sealed) app.log.info({ sealed }, 'rencontres : données en clair chiffrées');
    app.encounters.reindexEmails();
    app.feedback.sealExisting();
    app.messages.sealExisting();
    app.encounters.purge();
    app.feedback.purge();
    app.messages.purge();
    app.people.sync();
    app.audit.purge(); app.accounts.purgePending(); app.accounts.purgeChanges();
    purgeTimer = setInterval(() => { try { app.encounters.purge(); app.feedback.purge(); app.messages.purge(); app.audit.purge(); app.accounts.purgePending(); app.accounts.purgeChanges(); app.people.sync(); } catch (err) { app.log.error({ err }, 'rencontres : purge'); } }, 24 * 3600 * 1000);
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
  if (!faceOptions.manual) app.addHook('onReady', async () => { app.faces.retryFailed(); app.faces.recheckOnce(); setTimeout(() => app.faces.run(), 3000).unref(); });
  app.addHook('onClose', async () => { app.faces.stop(); await app.faces.idle(); });
  // Série proposée (désactivée par défaut) : empreintes d'images calculées sur le serveur, modèle téléchargé à
  // l'allumage dans le dossier de données. seriesOptions.model (tests) remplace le modèle ; manual : rien ne démarre seul.
  app.decorate('seriesSuggest', createSeriesSuggest({ db, storageDir: config.storageDir, log: app.log,
    model: seriesOptions.model || createImageModel({ dir: path.join(config.storageDir, 'models'), log: app.log }) }));
  if (!seriesOptions.manual) app.addHook('onReady', async () => { app.seriesSuggest.retryFailed(); setTimeout(() => app.seriesSuggest.run(), 5000).unref(); setTimeout(() => app.seriesSuggest.warm().catch(err => app.log.warn({ err }, 'séries : propositions')), 15000).unref(); });
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
  // Prise de vue des photos importées avant la migration 060 (boîtier, objectif, exposition) : lue une fois dans
  // l'original, en arrière-plan, comme l'heure des sorties (server/prise-de-vue.js).
  app.decorate('shotBackfill', createShotBackfill({ db, storageDir: config.storageDir, log: app.log }));
  app.addHook('onReady', async () => { setTimeout(() => app.shotBackfill.all(), 2500).unref(); });
  app.addHook('onClose', async () => { await app.shotBackfill.stop(); });
  // « Aujourd'hui » : ce qui demande votre attention (voir server/todo.js).
  // Circuit de publication (server/review.js) : publier une liste (et en dépublier une autre), comme un clic sur
  // « Publier » : statut, file Instagram automatique, images.
  const publishNow = (up = [], down = []) => {
    const set = db.prepare("UPDATE photos SET status = ?, updated_at = datetime('now') WHERE id = ?");
    db.transaction(() => { for (const id of up) set.run('published', id); for (const id of down) set.run('draft', id); })();
    if (up.length) app.instagram.onPublished(up);
    if (down.length) app.instagram.onUnpublished(down);
    app.variants.schedule();
  };
  app.decorate('review', createReview({ db, readiness: app.readiness, notes: app.notes, accounts: app.accounts, mailer: app.mailer, siteName: app.siteName, publicUrl: config.publicUrl, publish: publishNow, log: app.log }));
  // Carnets (server/carnet.js) : billets, circuit de publication, publication programmée.
  app.decorate('publicRepo', createRepo(db));
  app.decorate('carnet', createCarnet({ db, repo: app.publicRepo, readiness: app.readiness, accounts: app.accounts, mailer: app.mailer, audit: app.audit, siteName: app.siteName, publicUrl: config.publicUrl, log: app.log }));
  app.decorate('saisons', createSaisons({ db, readiness: app.readiness }));
  app.decorate('saisonsPropositions', createSaisonsPropositions({ db, saisons: app.saisons, readiness: app.readiness }));
  installExpositionVotes(app, votesOptions);
  app.decorate('saisonsBilans', createSaisonsBilans({ db, readiness: app.readiness, storageDir: config.storageDir,
    archiveVisible: (s, at) => at >= s.opens_at && at < archiveEndsAt(s.closes_at) }));
  app.decorate('expositions', createSaisonsPubliques({ saisons: app.saisons, repo: app.publicRepo, readiness: app.readiness, storageDir: config.storageDir }));
  // Publications programmées : vérifiées chaque minute, photos d'abord (un billet programmé attend ses photos programmées
  // à la même heure), puis billets (app.carnet.runDue, seule à publier un billet programmé).
  let reviewTimer = null;
  // Une seule exécution à la fois : un e-mail lent ne fait jamais chevaucher deux passages (revue de sécurité des Carnets).
  let dueRunning = false;
  const runDue = async () => {
    if (dueRunning) return;
    dueRunning = true;
    try {
      await app.review.runDue().catch(err => app.log.error({ err }, 'circuit : publication programmée'));
      await app.carnet.runDue().catch(err => app.log.error({ err }, 'carnets : publication programmée'));
      // Les expositions changent aussi de visibilité par le calendrier, sans écriture SQL : comparaison à chaque
      // passage, même si aucune photo ni aucun billet n’a été publié (BV-20, BV-21 ; sub nul).
      app.securite?.watchPublication?.();
    } finally { dueRunning = false; }
  };
  app.addHook('onReady', async () => { reviewTimer = setInterval(runDue, 60 * 1000); reviewTimer.unref(); });
  app.addHook('onClose', async () => clearInterval(reviewTimer));
  app.decorate('trips', createTrips({ db }));
  // Galeries privées (server/spaces.js) : galeries, photos, accès, autorisations des invités ; purges chaque heure.
  app.decorate('spaces', createSpaces({ db, vault: createVault(config.dataKey), readiness: app.readiness, encounters: app.encounters, storageDir: config.storageDir,
    securite: () => app.securite, variants: () => app.variants, trustCountry: Boolean(config.trustProxy) }));
  app.decorate('privateRenderGate', createRenderGate());
  let spacesTimer = null;
  const purgeSpaces = () => { try { app.spaces.purge(); app.purgeVisitors?.(); } catch (err) { app.log.error({ err }, 'galeries privées : purge'); } };
  app.addHook('onReady', async () => { purgeSpaces(); spacesTimer = setInterval(purgeSpaces, 3600 * 1000); spacesTimer.unref(); });
  app.addHook('onClose', async () => clearInterval(spacesTimer));
  app.decorate('keywordSuggest', createKeywordSuggester({ db, log: app.log }));
  // Descriptions suggérées (Florence-2, désactivées par défaut) : demandes depuis la fiche tout de suite, file de nuit
  // vérifiée toutes les 10 minutes. describeOptions.model (tests) remplace le modèle ; manual : rien ne démarre seul.
  app.decorate('describer', createDescriber({ db, storageDir: config.storageDir, translator: app.translator, log: app.log,
    model: describeOptions.model || createFlorence({ dir: path.join(config.storageDir, 'models', 'florence'), log: app.log }) }));
  let describeTimer = null;
  // Au démarrage, les photos en échec sont reprises une fois (réseau rétabli, modèle réparé…).
  if (!describeOptions.manual) app.addHook('onReady', async () => { app.describer.retryFailed(); describeTimer = setInterval(() => app.describer.run(), 10 * 60 * 1000); describeTimer.unref(); });
  app.addHook('onClose', async () => { clearInterval(describeTimer); await app.describer.close(); });
  app.decorate('todo', createTodo({ db, spaces: app.spaces, encounters: app.encounters, instagram: app.instagram, proofs: app.proofs, readiness: app.readiness, feedback: app.feedback, messages: app.messages, seriesSuggest: app.seriesSuggest, accounts: app.accounts, notes: app.notes, review: app.review }));
  app.addHook('onClose', async () => { await app.proofs.stop(); });
  // Relances par e-mail (demandes RGPD par quarts du délai, récapitulatifs) : toutes les heures.
  app.decorate('reminders', createReminders({ db, accounts: app.accounts, todo: app.todo, mailer: app.mailer, messages: app.messages, siteName: app.siteName, publicUrl: config.publicUrl, log: app.log,
    // Plafond des annonces de messages (30 e-mails) atteint pour la journée (boîtes bombardées : registre de la Vigie, BV-29).
    onMessagesCap: detail => app.securite?.emit('excess_rate_limit_exceeded', { request: null, severity: 'moyen', emetteur: 'server/messages.js · notifications', detail: { limite: 'messages_global', plafond: 'annonces', ...detail } }) }));
  let remindTimer = null;
  app.addHook('onReady', async () => { remindTimer = setInterval(() => app.reminders.run(), 3600 * 1000); remindTimer.unref(); setTimeout(() => app.reminders.run(), 60 * 1000).unref(); });
  app.addHook('onClose', async () => clearInterval(remindTimer));

  // Vigie (journalisation de sécurité, facultative) : chargée seulement si VIGIE_URL est réglé. Sans elle, ce qu'elle
  // avait laissé est effacé et app.securite ne fait rien.
  if (config.vigie) {
    const { installVigie } = await import('./securite/site.js');
    installVigie(app, { config, db,
      externalSources: ({ now }) => usesV2(app.publicVersion.versionForSection('expositions'))
        // S2 rejoue le calendrier ; les publications S3 sont des gestes explicites, lus à l’heure courante pour
        // qu’un published_at postérieur au précédent instantané reste attribué au compte qui vient de publier.
        ? [...app.expositions.textRows({ now }), ...app.saisonsBilans.textRows()] : [],
      ...vigieOptions });
  } else {
    const { retireVigie } = await import('./securite/retrait.js');
    retireVigie({ db, storageDir: config.storageDir });
    app.decorate('securite', SECURITE_OFF);
  }

  await setupAuth(app, oidc && { oidc });
  const headers = { ...SECURITY_HEADERS, 'content-security-policy': csp([app.oidc.origin].filter(Boolean)) };

  app.addHook('onSend', async (request, reply) => {
    // Adresse qui porte un jeton ou un code (ceux que redactUrl masque dans les journaux), ou route qui le demande : aucun
    // Referer, même vers le site. Les autres en-têtes restent imposés.
    const noReferrer = reply.getHeader('referrer-policy') === 'no-referrer' || redactUrl(request.url).includes('[masqué]');
    reply.headers(headers);
    if (noReferrer) reply.header('referrer-policy', 'no-referrer');
    // Rien de l'admin ne se garde en cache, quel que soit le gestionnaire (fichier envoyé par sendFile compris).
    if (/^\/admin(?:[/?#]|$)/.test(request.url)) reply.header('cache-control', 'no-store');
    // Session ouverte (administrateur, photographe…) : rien de ce qu'elle voit ne peut entrer dans un cache partagé
    // (Cloudflare) et être servi ensuite à un visiteur : bouton « Voir en v1 / v2 » et son jeton CSRF, vue forcée, liens
    // de l'équipe. Réponses 304 et adresses à ETag comprises (flux des Carnets) ; les consignes propres aux CDN sont
    // retirées (elles l'emporteraient sur Cache-Control). Les fichiers statiques, les images et la marque, identiques
    // pour tous, gardent leur cache. Un visiteur (sans session valide, cookie forgé compris) n'est pas concerné.
    else if (request.session && !/^\/(?:static|fonts|media|brand)\//.test(request.url)) {
      reply.header('cache-control', 'private, no-store').removeHeader('cdn-cache-control').removeHeader('cloudflare-cdn-cache-control');
    }
    // Seul l'écran « Rencontre » de l'admin (sur le téléphone) peut demander la position, au site lui-même.
    if (request.routeOptions?.config?.geolocation) reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(self)');
    // Sans includeSubDomains : à ajouter quand tous les sous-domaines de nicephos.art seront servis en HTTPS (PLAN.md, feuille de route).
    // COOP n'a d'effet qu'en HTTPS : en http, le navigateur l'ignore avec un avertissement.
    if (config.secureCookies) reply.header('strict-transport-security', 'max-age=31536000').header('cross-origin-opener-policy', 'same-origin');
  });

  // Erreurs inattendues : détail dans les journaux, jamais dans la réponse (chemins, noms de fichiers…).
  app.setErrorHandler((err, request, reply) => {
    const status = err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) {
      request.log.error({ err }, 'erreur inattendue');
      app.securite.emit('sys_error', { request, status, emetteur: 'server/app.js · erreur inattendue', detail: { erreur: String(err?.code || err?.name || 'Error') } });
    }
    const t = request.t || (x => x);                                            // langue de l'admin si elle est connue
    const message = status < 500 ? err.message : t('Une erreur inattendue est survenue. Réessayez dans un instant.');
    reply.code(status).header('cache-control', 'no-store');
    if (!request.headers.accept?.includes('text/html')) return reply.send({ error: message });
    const siteName = app.siteName();
    return reply.render('auth-error', { siteName, pageTitle: `${t('Erreur')} · ${siteName}`, description: '', t: request.t, lang: request.t?.lang || 'fr', title: status < 500 ? t('Requête refusée') : t('Erreur'), message });
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
  await app.register(privateRoutes);
  await app.register(publicRoutes);

  return app;
}
