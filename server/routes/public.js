import { createRepo } from '../repo.js';
import { galleryUrl, photoUrl, ORDRES } from '../urls.js';
import { widthsFor, variantName } from '../images.js';
import { pad, shortDate } from '../format.js';
import * as v2 from '../v2-vues.js';
import { picture, coverSet } from '../picture.js';
import { RIGHTS, rightsText } from '../rights.js';
import { PRIVACY, UPDATED as PRIVACY_UPDATED, UPDATED_SECURITY_LOG } from '../privacy.js';
import { LEGAL, legalEmail, hostingOf } from '../legal.js';
import { project, MAP } from '../geo/projection.js';
import { countryName, nameOf } from '../geo/cities.js';
import { createSearch, MAX_QUERY } from '../search.js';
import { tripStory } from '../trip-story.js';
import { photoMap } from '../photo-map.js';
import { LANGS, PREFIX, UI, pick, localize, splitLang, detectLang } from '../i18n.js';
import { BOTS, countryOf, parisDay } from '../stats.js';
import { scanValue } from '../securite/detection.js';
import path from 'node:path';
import sharp from 'sharp';
import { createRateLimiter, clientKey } from '../ratelimit.js';
import { TRAP_PATH } from '../securite/piege.js';
import { FeedbackError } from '../feedback.js';
import { shareLinks, shareQr } from '../share.js';
import crypto from 'node:crypto';
import { EncounterError, ADULT } from '../encounters.js';
import { MAX_DATE } from '../date-libre.js';
import { safeNext } from '../auth.js';
import { registerCarnetPages, registerCarnetFeeds, carnetContext, carnetSitemap } from './carnet-public.js';
import { registerContactPages } from './contact-public.js';

const HERO_COUNT = 5;
const RECAP_COOKIE = 'bonjour_recap';
const YEAR = 365 * 24 * 3600;

export default async function publicRoutes(app) {
  const repo = createRepo(app.db);
  // Page « Carte » facultative (Réglages) : tant qu'elle n'est pas publiée, introuvable pour les visiteurs.
  const mapEnabled = () => repo.settings().map_page === true;

  // Page /bonjour : 8 demandes par heure et par adresse au plus (partagé entre les trois langues).
  const helloLimit = createRateLimiter({ limit: 8, windowMs: 3600 * 1000 });
  // J'aime : 120 par heure et par adresse au plus ; signalements : 5 par heure.
  const likeLimit = createRateLimiter({ limit: 120, windowMs: 3600 * 1000 });
  const reportLimit = createRateLimiter({ limit: 5, windowMs: 3600 * 1000 });
  const shareLimit = createRateLimiter({ limit: 60, windowMs: 3600 * 1000 });
  // Page Contact et demande de licence : 8 envois par heure et par adresse au plus, communs aux deux formulaires et aux
  // trois langues (comme /bonjour ; comptés après le champ piège et la provenance).
  const messageLimit = createRateLimiter({ limit: 8, windowMs: 3600 * 1000 });
  // Recherche : 60 recherches en 10 minutes par adresse au plus (partagé entre les trois langues ; registre de la Vigie, BV-9).
  const searchLimit = createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 });
  // Codes de contrôle des cartes (3 caractères) : au plus 5 codes faux par référence en 24 h, d'où que viennent les
  // essais (en base, partagé entre les langues). Au-delà, tout code de cette référence est ignoré : la demande est
  // traitée comme une référence tapée sans code (non vérifiée ; sur une rencontre établie, seul un refus s'applique).
  const CODE_TRIES = 5, CODE_WINDOW = 24 * 3600 * 1000;
  const cq = {
    count: app.db.prepare('SELECT COUNT(*) FROM card_code_failures WHERE ref = ? AND at > ?').pluck(),
    forget: app.db.prepare('DELETE FROM card_code_failures WHERE at <= ?'),
    add: app.db.prepare('INSERT INTO card_code_failures (ref, at) VALUES (?, ?)'),
  };
  const codeGuard = {
    locked: ref => cq.count.get(ref, Date.now() - CODE_WINDOW) >= CODE_TRIES,
    // Renvoie vrai quand cet essai bloque la référence.
    fail: ref => { cq.forget.run(Date.now() - CODE_WINDOW); cq.add.run(ref, Date.now()); return cq.count.get(ref, Date.now() - CODE_WINDOW) === CODE_TRIES; },
  };
  // Récapitulatif d'un envoi de /bonjour, pour la page « merci » (maquette MQ-05, cadre 13) : gardé en mémoire 15 minutes,
  // jamais sur le disque ; le navigateur n'en reçoit qu'un numéro tiré au hasard (cookie bonjour_recap, httpOnly), rien
  // dans l'adresse. Ni nom, ni adresse, ni nom du parent (server/encounters.js, submit). 500 au plus : le plus ancien
  // part le premier (des envois répartis sur de nombreuses adresses ne font pas grossir la mémoire).
  const RECAP_TTL = 15 * 60 * 1000, RECAP_MAX = 500;
  const recaps = new Map();
  const recapStore = {
    keep(data) {
      const t = Date.now();
      for (const [k, v] of recaps) { if (t - v.at <= RECAP_TTL && recaps.size < RECAP_MAX) break; recaps.delete(k); }
      const token = crypto.randomBytes(16).toString('base64url');
      recaps.set(token, { at: t, data });
      return token;
    },
    read(token) {
      if (typeof token !== 'string' || !/^[\w-]{22}$/.test(token)) return null;
      const r = recaps.get(token);
      return r && Date.now() - r.at <= RECAP_TTL ? r.data : null;
    },
    ttl: RECAP_TTL / 1000,
  };
  // Mêmes pages en français (racine), en anglais (/en) et en allemand (/de).
  for (const lang of LANGS) await app.register(pages, { prefix: PREFIX[lang], lang, repo, mapEnabled, helloLimit, likeLimit, reportLimit, shareLimit, searchLimit, messageLimit, codeGuard, recapStore });

  // Flux des Carnets (/carnet/flux.xml, /en/…, /de/…), hors des pages : jamais redirigés d'une langue à l'autre (B58).
  registerCarnetFeeds(app);

  // Sélecteur de langue : retient le choix (cookie de langue, posé à ce moment-là ; l'autre cookie du site public est celui des galeries privées) puis ouvre la page demandée.
  // Adresses habituelles des mentions légales en Allemagne et en anglais.
  app.get('/impressum', async (request, reply) => reply.redirect('/de/mentions-legales', 301));
  app.get('/legal-notice', async (request, reply) => reply.redirect('/en/mentions-legales', 301));

  app.get('/langue/:lang', async (request, reply) => {
    const lang = LANGS.includes(request.params.lang) ? request.params.lang : null;
    if (!lang) return reply.callNotFound();
    // Chemin local seulement, vérifié avant ET après le retrait du préfixe de langue (« /en//hôte » deviendrait
    // « //hôte ») et normalisé par l'analyseur d'URL (tabulation, saut de ligne, barre inverse, caractères non ASCII).
    const target = safeNext(splitLang(safeNext(String(request.query.vers || ''), '/')).path, '/');
    reply.setCookie('langue', lang, { path: '/', maxAge: YEAR, sameSite: 'lax', httpOnly: true, secure: app.config.publicUrl.startsWith('https://') });
    return reply.header('x-robots-tag', 'noindex').redirect(localize(target, lang), 303);
  });
  // Photo offerte à une personne photographiée : lien privé de la fiche Rencontre (30 jours), dans sa langue.
  // Une version JPEG (2048 px, ou 1200 px pour l'aperçu), jamais l'original ; aucune indexation, aucun cache.
  const ascii = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '').slice(0, 100);
  const giftJpeg = (s, width) => sharp(path.join(app.config.storageDir, 'originals', s.file)).rotate()
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true })
    .withExif({ IFD0: { Artist: ascii(s.author), Copyright: `(C) ${ascii(s.author)} - ${ascii(app.siteName())} - usage personnel / personal use` } }).toBuffer();
  // Rendus récents gardés en mémoire (originaux aux noms uniques, jamais remplacés) : un lien ouvert par des proches ne
  // décode pas l'original à chaque fois, et des demandes simultanées attendent le même rendu.
  const gifts = new Map();
  const giftOf = (s, width) => {
    const key = [s.file, width, s.author, app.siteName()].join('|');
    let job = gifts.get(key);
    if (job) gifts.delete(key);
    else job = giftJpeg(s, width).catch(err => { gifts.delete(key); throw err; });
    gifts.set(key, job);
    while (gifts.size > 6) gifts.delete(gifts.keys().next().value);
    return job;
  };
  const giftHeaders = reply => reply.header('x-robots-tag', 'noindex').header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');
  app.get('/pour-vous/:token', async (request, reply) => {
    const s = app.encounters.share(request.params.token);
    if (!s) { app.securite.emit('token_guess', { request, emetteur: 'server/routes/public.js · photo offerte', detail: { nature: 'lien de photo offerte' } }); return reply.callNotFound(); }
    const lang = LANGS.includes(s.lang) ? s.lang : 'fr';
    if (!s.expired) app.encounters.countShare(s.token, 'view');
    const siteName = app.siteName();
    const date = new Intl.DateTimeFormat({ fr: 'fr-FR', en: 'en-GB', de: 'de-DE' }[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(s.expires_at);
    giftHeaders(reply);
    if (s.expired) reply.code(410);
    return reply.render('gift', { ...helpers(lang), siteName, s, g: UI[lang].gift, date, base: `/pour-vous/${s.token}`,
      pageTitle: `${UI[lang].gift.title} · ${siteName}`, description: '' });
  });
  for (const [name, width, kind] of [['apercu.jpg', 1200, 'view'], ['photo.jpg', 2048, 'download']]) {
    app.get(`/pour-vous/:token/${name}`, async (request, reply) => {
      const s = app.encounters.share(request.params.token);
      if (!s) app.securite.emit('token_guess', { request, emetteur: 'server/routes/public.js · photo offerte', detail: { nature: 'lien de photo offerte' } });
      if (!s || s.expired) return reply.callNotFound();
      const buf = await giftOf(s, width);
      if (kind === 'download') {
        // Un HEAD (vérification d'un lien, gestionnaire de téléchargements) n'est pas un téléchargement.
        if (request.method === 'GET') app.encounters.countShare(s.token, 'download');
        reply.header('content-disposition', `attachment; filename="${ascii(app.siteName()).replace(/\W+/g, '-').toLowerCase() || 'photo'}${s.ref ? `-${s.ref}` : ''}.jpg"`);
      }
      return giftHeaders(reply).type('image/jpeg').send(buf);
    });
  }

  // Web app « Rencontre » (admin, sur le téléphone) : manifeste pour l'ajouter à l'écran d'accueil.
  app.get('/rencontre.webmanifest', async (request, reply) => {
    const b = app.appearance.brand();
    return reply.type('application/manifest+json').header('cache-control', 'no-cache').send(JSON.stringify({
      name: `Rencontre · ${app.siteName()}`, short_name: 'Rencontre', lang: 'fr', start_url: '/admin/rencontre/accueil', scope: '/admin/', display: 'standalone',
      background_color: '#f6f4ef', theme_color: '#1d1c1a',
      icons: b.favicon180 ? [{ src: `/brand/${b.favicon180}`, sizes: '180x180', type: 'image/png' }] : [],
    }));
  });

  // Anciennes adresses des traductions de la page Droits.
  for (const lang of ['en', 'de']) app.get(`/droits/${lang}`, async (request, reply) => reply.redirect(`/${lang}/droits`, 301));

  // Image d'une publication Instagram, le temps de l'envoi : Instagram la télécharge depuis cette adresse
  // (jeton aléatoire, valable seulement pendant l'envoi ; 404 le reste du temps).
  app.get('/partage/instagram/:file', async (request, reply) => {
    const m = /^([\w-]{20,64})\.jpg$/.exec(request.params.file);
    const post = m && app.instagram.byMediaToken(m[1]);
    if (!post) app.securite.emit('token_guess', { request, emetteur: 'server/routes/public.js · image Instagram', detail: { nature: 'image Instagram' } });
    if (!post || !app.instagram.isPublic(post.photo_id)) return reply.callNotFound();
    const buf = await app.instagram.image(post.photo_id, app.instagram.optionsOf(post));
    return reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex').type('image/jpeg').send(buf);
  });

  // Moteurs de recherche : tout le site public, jamais l'admin ni la connexion. Galeries privées : /prive/ interdit (tout y
  // répond 404 sans session) ; /g/ ne l'est pas : une page interdite ne voit jamais son « noindex » (G36, M7).
  app.get('/robots.txt', async (request, reply) => reply.type('text/plain; charset=utf-8')
    .send(`User-agent: *\nDisallow: /admin\nDisallow: /auth/\nDisallow: /partage/\nDisallow: /langue/\nDisallow: /pour-vous/\nDisallow: /prive/\n${app.securite.enabled ? `Disallow: ${TRAP_PATH}\n` : ''}Allow: /\n\nSitemap: ${app.config.publicUrl}/sitemap.xml\n`));

  // Chaque page dans ses trois langues, avec les liens hreflang entre elles.
  app.get('/sitemap.xml', async (request, reply) => {
    const base = app.config.publicUrl;
    const photos = repo.publishedPhotos();
    const latest = photos.map(p => p.updated_at).sort().at(-1);
    const day = d => (d ? d.slice(0, 10) : undefined);
    const pagesList = [
      { loc: '/', lastmod: day(latest) },
      ...(app.publicVersion.designSettings() ? [{ loc: '/galerie', lastmod: day(latest) }] : []),
      ...repo.categories().filter(c => photos.some(p => p.category_slug === c.slug)).map(c => ({ loc: galleryUrl({ serie: c.slug }) })),
      ...repo.authors().filter(a => photos.some(p => p.author_slug === a.slug)).map(a => ({ loc: galleryUrl({ regard: a.slug }) })),
      ...photos.map(p => ({ loc: photoUrl(p.slug), lastmod: day(p.updated_at) })),
      ...(mapEnabled() ? [{ loc: '/carte' }] : []),
      // Voyages publiés (avec au moins une photo publiée).
      ...(() => { const ids = new Set(photos.map(p => p.id)); const open = app.trips.listPublic().filter(tr => app.trips.photos(tr.id).some(p => ids.has(p.id))); return open.length ? [{ loc: '/voyages' }, ...open.map(tr => ({ loc: `/voyage/${tr.slug}` }))] : []; })(),
      { loc: '/a-propos' }, { loc: '/droits' }, { loc: '/confidentialite' }, { loc: '/mentions-legales' },
      // Carnets (v2 appliquée seulement) : la liste et les billets publiés, dans leurs langues publiées (B69).
      ...carnetSitemap(app),
    ];
    const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const links = (loc, langs = LANGS) => langs.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${xml(base + localize(loc, l))}"/>`).join('');
    const body = pagesList.flatMap(u => (u.langs || LANGS).map(l =>
      `  <url><loc>${xml(base + localize(u.loc, l))}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${links(u.loc, u.langs)}</url>`)).join('\n');
    return reply.type('application/xml; charset=utf-8')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`);
  });

  app.setNotFoundHandler(async (request, reply) => {
    const { lang } = splitLang(request.url);
    const siteName = app.siteName();
    reply.code(404);
    return reply.render('notfound', { ...helpers(lang), siteName, pageTitle: `${UI[lang].notFoundTitle} · ${siteName}`, description: '' });
  });
}

// Contact réglé dans l'admin (droits, confidentialité) : lien e-mail ou page web en https ; sinon du texte.
const contactLink = c => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) ? `mailto:${c}` : /^https:\/\/\S+$/.test(c) ? c : null);

// Texte coupé à max caractères au plus, à la fin d'un mot, avec « … ».
const clip = (text, max) => { const s = String(text || '').trim(); return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s; };

// Aides des gabarits pour une langue : textes, adresses préfixées, photos et vignettes.
function helpers(lang) {
  const u = path => localize(path, lang);
  return { picture, pad, lang, t: UI[lang], u, galleryUrl: f => u(galleryUrl(f)), photoUrl: (slug, f) => u(photoUrl(slug, f)),
    // Gabarits v2 (views/v2/) : icônes, formats, tailles d'images, date abrégée.
    v2: { ...v2, date: takenOn => shortDate(takenOn, lang), typo: s => v2.typo(s, lang) } };
}

async function pages(app, { lang, repo, mapEnabled, helloLimit, likeLimit, reportLimit, shareLimit, searchLimit, messageLimit, codeGuard, recapStore }) {
  const finder = createSearch({ db: app.db });
  const t = UI[lang];
  const base = helpers(lang);
  const originalGalleryUrl = base.galleryUrl;
  base.galleryUrl = filter => { const url = originalGalleryUrl(filter); return app.publicVersion.designSettings() && url === base.u('/') ? base.u('/galerie') : url; };
  const trusted = Boolean(app.config.trustProxy);

  // Arrivée sur une page française : la langue choisie avec le sélecteur, sinon celle du pays et du navigateur
  // (jamais pour les robots : chaque langue garde son adresse pour les moteurs de recherche).
  if (lang === 'fr') {
    app.addHook('onRequest', async (request, reply) => {
      if (request.method !== 'GET') return;
      reply.header('vary', 'Cookie, Accept-Language, CF-IPCountry');
      // Robots, outils et aperçus de liens (sans langue de navigateur) : jamais redirigés.
      const ua = request.headers['user-agent'] || '';
      if (!ua || BOTS.test(ua) || (!request.headers['accept-language'] && !request.cookies?.langue)) return;
      const chosen = request.cookies?.langue;
      const target = LANGS.includes(chosen) ? chosen
        : detectLang({ country: countryOf(request.headers, trusted), acceptLanguage: request.headers['accept-language'] });
      if (target !== 'fr') return reply.redirect(localize(request.url, target), 302);
    });
  }

  // Filtres valides uniquement ; une valeur inconnue est ignorée, et signalée à la Vigie : les filtres sont des liens, un
  // navigateur qui les suit n'en produit jamais (adresse forgée, sondage : cas DS12). Pas pour une valeur que le crochet
  // commun signale déjà comme saisie malveillante (DS11), ni pour une série ou un photographe disparu (supprimé, adresse
  // changée) depuis moins de 30 jours : vieux liens, moteurs de recherche. Seule trace de ces anciennes adresses, sans
  // migration : la mesure d'audience, qui ne compte la page d'une série ou d'un photographe que si elle existe (une page
  // vue dans les 30 derniers jours existait donc alors).
  const RECENT = 30 * 864e5;
  const seenLately = app.db.prepare('SELECT 1 FROM stats_pages WHERE page = ? AND day >= ? LIMIT 1').pluck();
  // emetteur, page : les Carnets (BV-13) reprennent la même fonction avec leur émetteur (« · carnet ») et, pour ?par=, la page
  // d'un photographe (« auteur: ») comme preuve d'une adresse ancienne.
  const ignored = (request, champ, emetteur = 'server/routes/public.js · filtres', page = { regard: 'auteur', serie: 'serie' }[champ]) => {
    const value = request.query[champ];
    if (!app.securite.enabled || value == null || value === '') return undefined;
    const valeur = String(value);
    if (scanValue('query', `query.${champ}`, valeur)) return undefined;
    if (page && seenLately.get(`${page}:${valeur}`, parisDay(new Date(Date.now() - RECENT)))) return undefined;
    app.securite.emit('input_validation_fail', { request, emetteur, detail: { raison: 'valeur de filtre hors liste', champ, valeur: valeur.slice(0, 60) } });
    return undefined;
  };
  const readOrdre = request => (ORDRES.includes(request.query.ordre) ? request.query.ordre : ignored(request, 'ordre'));
  function readFilter(request, authors, categories) {
    const { regard, serie } = request.query;
    return {
      regard: authors.some(a => a.slug === regard) ? regard : ignored(request, 'regard'),
      serie: categories.some(c => c.slug === serie) ? serie : ignored(request, 'serie'),
      ordre: readOrdre(request),
    };
  }

  // page : la page v2 qui montre cette vue (views/v2/home.eta) ; la v1 (views/home.eta) l'ignore. « accueil » : / sans
  // filtre ni ordre ; « serie » : /serie/:slug ; « galerie » : toute autre vue filtrée ou ordonnée.
  function renderGallery(reply, filter, page = filter.regard || filter.serie || filter.ordre ? 'galerie' : 'accueil') {
    // Le nom du site est réglable dans l'admin : relu à chaque page.
    const siteName = app.siteName();
    const authors = repo.authors(lang);
    const categories = repo.categories(lang);
    const settings = repo.settings();
    const all = repo.publishedPhotos({ lang });
    const photos = repo.publishedPhotos({ author: filter.regard, category: filter.serie, ordre: filter.ordre, lang });
    const byRegard = repo.publishedPhotos({ author: filter.regard, lang });

    const heroSlugs = Array.isArray(settings.hero) ? settings.hero : [];
    let hero = heroSlugs.map(s => all.find(p => p.slug === s)).filter(Boolean);
    if (!hero.length) hero = all.slice(0, HERO_COUNT);
    // Ouverture du téléphone (v3, réglage hero_tel) : vide, le téléphone montre la même que le bureau.
    const heroTel = (Array.isArray(settings.hero_tel) ? settings.hero_tel : []).map(s => all.find(p => p.slug === s)).filter(Boolean);

    const series = categories.map(c => {
      const inCat = byRegard.filter(p => p.category_slug === c.slug);
      return { ...c, count: inCat.length, cover: inCat[0] };
    });
    const regards = [
      { slug: undefined, name: t.both, count: all.length },
      ...authors.map(a => ({ ...a, count: all.filter(p => p.author_slug === a.slug).length })),
    ];
    // v2 : chaque série avec toutes ses photos publiées (page d'une série, galerie sans photo commune à deux filtres).
    const seriesAll = categories.map(c => {
      const inCat = all.filter(p => p.category_slug === c.slug);
      return { ...c, count: inCat.length, cover: inCat[0] };
    });
    const activeAuthor = authors.find(a => a.slug === filter.regard);
    const activeSerie = categories.find(c => c.slug === filter.serie);

    const title = [activeSerie?.name, activeAuthor && t.by(activeAuthor.name)].filter(Boolean).join(', ');
    const tagline = pick(settings, 'tagline', lang);
    return reply.render('home', {
      ...base, filter, settings, tagline, intro: pick(settings, 'intro', lang), hero, heroTel, series, regards, photos, total: all.length,
      categoriesCount: categories.length, activeAuthor, activeSerie, page, seriesAll,
      pageTitle: title ? `${title} · ${siteName}` : siteName, siteName,
      canonical: page === 'galerie' && !filter.regard && !filter.serie && app.publicVersion.designSettings() ? '/galerie' : galleryUrl({ regard: filter.regard, serie: filter.serie }),   // même contenu, quel que soit l'ordre
      description: tagline,
      ogImage: hero[0] && `/media/${variantName(hero[0].file, widthsFor(hero[0].width).at(-1), 'webp', hero[0].variant_key)}`,
    });
  }

  app.get('/', async (request, reply) => {
    const filter = readFilter(request, repo.authors(), repo.categories());
    app.stats.hit(request, { page: filter.serie ? `serie:${filter.serie}` : filter.regard ? `auteur:${filter.regard}` : 'accueil' });
    return renderGallery(reply, filter);
  });

  app.get('/galerie', async (request, reply) => {
    if (!app.publicVersion.designSettings() && !app.publicVersion.forRequest(request).darkroom) return reply.callNotFound();
    const filter = readFilter(request, repo.authors(), repo.categories());
    app.stats.hit(request, { page: 'galerie' });
    return renderGallery(reply, filter, 'galerie');
  });

  app.get('/serie/:slug', async (request, reply) => {
    if (!repo.categories().some(c => c.slug === request.params.slug)) return reply.callNotFound();
    app.stats.hit(request, { page: `serie:${request.params.slug}` });
    return renderGallery(reply, { serie: request.params.slug, ordre: readOrdre(request) }, 'serie');
  });

  app.get('/auteur/:slug', async (request, reply) => {
    if (!repo.authors().some(a => a.slug === request.params.slug)) return reply.callNotFound();
    app.stats.hit(request, { page: `auteur:${request.params.slug}` });
    return renderGallery(reply, { regard: request.params.slug, ordre: readOrdre(request) });
  });

  app.get('/photo/:slug', async (request, reply) => {
    const siteName = app.siteName();
    // Ouverte depuis un billet des Carnets (?carnet=<billet>, v2) : retour au billet, voisines du billet (MQ-12, repère 16).
    const fromPost = carnetContext(app, request, { lang, repo, ignored, slug: request.params.slug });
    let filter = fromPost ? { carnet: fromPost.post.slug } : readFilter(request, repo.authors(), repo.categories());
    let list = fromPost ? fromPost.list : repo.publishedPhotos({ author: filter.regard, category: filter.serie, ordre: filter.ordre, lang });
    let i = fromPost ? fromPost.i : list.findIndex(p => p.slug === request.params.slug);
    if (!fromPost && i === -1 && (filter.regard || filter.serie)) {
      filter = { ordre: filter.ordre };
      list = repo.publishedPhotos({ ordre: filter.ordre, lang });
      i = list.findIndex(p => p.slug === request.params.slug);
    }
    if (i === -1) return reply.callNotFound();
    const photo = list[i];
    // Arrivée par le QR de la fenêtre « Partager » : comptée comme un partage, puis l'adresse est nettoyée (recharger
    // la page ou envoyer l'adresse affichée ne compte pas un nouveau scan ; la vue est comptée sur l'adresse propre).
    if (request.query.partage === 'qr') {
      // Limite atteinte (partagée avec les autres partages) : signalée à la Vigie comme par gate(), sans contrôle de
      // provenance (un scan est une simple ouverture de page, sans Origin).
      if (!BOTS.test(request.headers['user-agent'] || '')) {
        if (shareLimit(request.ip)) app.shares.record(photo.id, 'qr');
        else app.securite.emit('excess_rate_limit_exceeded', { request, emetteur: 'server/routes/public.js · partage QR', detail: { limite: 'partage', canal: 'qr' } });
      }
      return reply.redirect(base.photoUrl(photo.slug, filter), 303);
    }
    app.stats.hit(request, { photoId: photo.id });
    const published = repo.publishedPhotos({ lang });
    const prev = list[(i - 1 + list.length) % list.length];
    const next = list[(i + 1) % list.length];
    return reply.render('photo', {
      ...base, siteName, filter, photo, prev, next, position: i + 1, count: list.length,
      backUrl: fromPost ? `${base.u(`/carnet/${fromPost.post.slug}`)}#photo-${i + 1}` : `${base.galleryUrl(filter)}#galerie`,
      carnet: fromPost ? { title: fromPost.title, lang: fromPost.lang, href: base.u(`/carnet/${fromPost.post.slug}`) } : null,
      pageTitle: `${photo.title} · ${siteName}`,
      canonical: photoUrl(photo.slug),
      // Légende coupée à 160 caractères (au mot près) : l'auteur, le lieu et la date restent dans les aperçus de liens.
      description: [clip(photo.legend, 160), [photo.author, [photo.place, photo.when].filter(Boolean).join(', ')].filter(Boolean).join(', ')].filter(Boolean).join(' '),
      ogImage: `/media/${variantName(photo.file, widthsFor(photo.width).at(-1), 'webp', photo.variant_key)}`,
      bodyClass: 'dark', share: await shareOf(photo, siteName),
      // Mots-clés sous la légende, si le réglage le demande (Site public) ; chacun mène à la recherche.
      showKeywords: repo.settings().keywords_shown === true,
      // Où la photo a été prise, et les photos prises à proximité (seulement celles qui sont sur la carte).
      place: photoMap(photo, published, lang),
      thumb: variantName(photo.file, widthsFor(photo.width)[0], 'webp', photo.variant_key),
      // v2 : nombre de photos publiées du photographe (données de la visionneuse).
      authorCount: published.filter(p => p.author_slug === photo.author_slug).length,
    });
  });

  // ---------- voyages (server/trips.js, server/trip-story.js) ----------
  // Visible si le voyage est publié (case de l'admin) et a au moins une photo publiée ; sinon aperçu pour qui voit les
  // sorties, introuvable pour les autres.
  const LOC = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' }[lang];
  // published : photos publiées de la page, lues une fois pour tous les voyages de la liste. Ordre du voyage (jour,
  // heure de prise de vue) : le récit suit la journée, la couverture est celle de l'admin.
  const tripView = (trip, published = repo.publishedPhotos({ lang })) => {
    const pub = new Map(published.map(p => [p.id, p]));
    const photos = app.trips.photos(trip.id).map(p => pub.get(p.id)).filter(Boolean);
    const names = new Map(repo.authors().map(a => [a.id, a.name]));
    const who = trip.authors.map(id => names.get(id)).filter(Boolean);
    return { ...trip, name: pick(trip, 'name', lang), intro: pick(trip, 'intro', lang), photos, who, cover: photos[0] || null };
  };
  const visibleTrips = () => { const published = repo.publishedPhotos({ lang }); return app.trips.listPublic().map(tr => tripView(tr, published)).filter(tr => tr.photos.length); };
  const span = tr => {
    const f = (d, o) => new Intl.DateTimeFormat(LOC, { ...o, timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
    const days = [...new Set(tr.photos.map(p => p.taken_on))].sort();
    if (!days.length) return '';
    return days[0] === days.at(-1) ? f(days[0], { day: 'numeric', month: 'long', year: 'numeric' }) : t.trips.span(f(days[0], { day: 'numeric', month: 'long' }), f(days.at(-1), { day: 'numeric', month: 'long', year: 'numeric' }));
  };
  app.get('/voyages', async (request, reply) => {
    const list = visibleTrips();
    if (!list.length) return reply.callNotFound();
    const siteName = app.siteName();
    app.stats.hit(request, { page: 'voyages' });
    return reply.render('trips', {
      ...base, siteName, list: list.map(tr => ({ ...tr, span: span(tr), days: new Set(tr.photos.map(p => p.taken_on)).size })),
      pageTitle: `${t.trips.title} · ${siteName}`, canonical: '/voyages', description: t.trips.description(list.map(tr => tr.name).slice(0, 5).join(', ')),
    });
  });
  app.get('/voyage/:slug', async (request, reply) => {
    const raw = app.trips.bySlug(request.params.slug);
    if (!raw) return reply.callNotFound();
    const tr = tripView(raw);
    const open = raw.public && tr.photos.length > 0;
    // Aperçu pour l'équipe : les mêmes voyages que dans l'admin (portée « les miennes » : ses voyages seulement).
    const s = request.scope('sorties.voir');
    if (!open && !(s && (s.all || (raw.author_id != null && raw.author_id === s.authorId)))) return reply.callNotFound();
    if (!open) reply.header('x-robots-tag', 'noindex').header('cache-control', 'private, no-store');
    else app.stats.hit(request, { page: `voyage:${raw.slug}` });
    const siteName = app.siteName();
    const story = tripStory({ trip: tr, photos: tr.photos, lang, locale: LOC });
    return reply.render('trip', {
      ...base, siteName, tr: { ...tr, span: span(tr) }, story, preview: !open, map: MAP,
      pageTitle: `${tr.name} · ${siteName}`, canonical: `/voyage/${raw.slug}`,
      description: tr.intro ? tr.intro.slice(0, 200) : t.trips.descriptionOne(tr.name, span(tr)),
      ogImage: tr.cover && `/media/${variantName(tr.cover.file, widthsFor(tr.cover.width).at(-1), 'webp', tr.cover.variant_key)}`,
    });
  });

  // Recherche par mots-clés (server/search.js) : pages de résultats jamais indexées (contenu en double).
  app.get('/recherche', async (request, reply) => {
    if (repo.settings().search_page === false && !request.can('site.textes')) return reply.callNotFound();
    const siteName = app.siteName();
    // Le champ n'existe qu'une fois et prend 100 caractères au plus (maxlength) : un « q » répété ou plus long ne vient pas
    // du formulaire. Coupé comme avant, et signalé à la Vigie (BV-8, cas DS12), sans la saisie elle-même ; une saisie
    // malveillante est déjà signalée par le crochet commun (DS11).
    const raw = request.query.q;
    const nombreQ = Array.isArray(raw) ? raw.length : raw === undefined ? 0 : 1;
    const longueur = Array.isArray(raw) ? Math.max(...raw.map(v => String(v).length)) : String(raw ?? '').length;
    if ((nombreQ > 1 || longueur > MAX_QUERY) && ![].concat(raw).some(v => scanValue('query', 'query.q', String(v)))) {
      app.securite.emit('input_validation_fail', { request, emetteur: 'server/routes/public.js · recherche', detail: { raison: 'saisie de recherche hors formulaire', longueur, nombre_q: nombreQ } });
    }
    const q = String(raw || '').trim().slice(0, MAX_QUERY);
    // Recherches en rafale (BV-9) : au-delà de la limite, 429, la saisie gardée dans le champ, et un signalement.
    const limited = Boolean(q) && !searchLimit(request.ip);
    if (limited) app.securite.emit('excess_rate_limit_exceeded', { request, emetteur: 'server/routes/public.js · recherche', detail: { limite: 'recherche' } });
    const terms = limited ? [] : finder.terms(q);
    let photos = [];
    if (terms.length) {
      const byId = new Map(repo.publishedPhotos({ lang }).map(p => [p.id, p]));
      photos = finder.find(q).map(id => byId.get(id)).filter(Boolean);
      app.stats.hit(request, { page: 'recherche' });
    }
    if (q) reply.header('x-robots-tag', 'noindex');
    if (limited) reply.code(429);
    // v2 : sans résultat (ou avant la première recherche), les séries à parcourir, avec leur couverture et leur compte ; la
    // v1 l'ignore. La recherche elle-même ne change pas.
    const shown = photos.length ? [] : repo.publishedPhotos({ lang });
    const series = photos.length ? [] : repo.categories(lang).map(c => {
      const inCat = shown.filter(p => p.category_slug === c.slug);
      return { ...c, count: inCat.length, cover: inCat[0] };
    }).filter(c => c.count);
    return reply.render('search', {
      ...base, siteName, q, searched: terms.length > 0, tooShort: !limited && Boolean(q) && !terms.length, limited, photos, series,
      pageTitle: q ? `${t.search.title}${t.colon} ${q} · ${siteName}` : `${t.search.title} · ${siteName}`, canonical: '/recherche',
      description: t.search.description,
    });
  });

  app.get('/a-propos', async (request, reply) => {
    const siteName = app.siteName();
    const settings = repo.settings();
    const text = pick(settings, 'about', lang) || pick(settings, 'intro', lang);
    const paragraphs = String(text || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    const tagline = pick(settings, 'tagline', lang);
    app.stats.hit(request, { page: 'a-propos' });
    return reply.render('about', {
      ...base, siteName, settings, tagline, paragraphs, authors: repo.authors(lang),
      pageTitle: `${t.nav.about} · ${siteName}`, canonical: '/a-propos', description: tagline,
    });
  });

  // Page « Carte » : les photos publiées que leur auteur a mises sur la carte, groupées par ville (jamais de
  // position exacte). Tant qu'elle n'est pas publiée (Réglages) : introuvable pour les visiteurs, aperçu pour les
  // auteurs connectés.
  const thumb = p => `/media/${variantName(p.file, widthsFor(p.width)[0], 'webp', p.variant_key)}`;
  function mapPlaces() {
    const byCity = new Map();
    for (const p of repo.publishedPhotos({ lang }).filter(p => p.on_map && p.city_id)) {
      if (!byCity.has(p.city_id)) {
        const [x, y] = project(p.city_lat, p.city_lon);
        byCity.set(p.city_id, { id: p.city_id, name: nameOf(p, lang), country: countryName(p.city_cc, lang), x, y, photos: [] });
      }
      byCity.get(p.city_id).photos.push(p);
    }
    // Les villes les plus fournies d'abord ; à égalité, par nom.
    return [...byCity.values()].map(c => ({ ...c, cover: c.photos[0], thumb: thumb(c.photos[0]) }))
      .sort((a, b) => b.photos.length - a.photos.length || a.name.localeCompare(b.name, lang));
  }
  app.get('/carte', async (request, reply) => {
    const enabled = mapEnabled();
    if (!enabled && !request.can('site.textes')) return reply.callNotFound();          // aperçu pour qui règle le site
    const siteName = app.siteName();
    const settings = repo.settings();
    const places = mapPlaces();
    if (enabled) app.stats.hit(request, { page: 'carte' });
    if (!enabled) reply.header('x-robots-tag', 'noindex');
    const names = places.slice(0, 6).map(c => c.name).join(', ') + (places.length > 6 ? '…' : '');
    return reply.render('carte', {
      ...base, siteName, settings, places, map: MAP, preview: !enabled,
      count: places.reduce((n, c) => n + c.photos.length, 0),
      pageTitle: `${t.map.title} · ${siteName}`, canonical: '/carte',
      description: places.length ? t.map.description(names) : pick(settings, 'tagline', lang),
    });
  });

  // Envoyé depuis le site lui-même (un autre site ne peut pas faire aimer, signaler ou compter un partage à la place du visiteur).
  const sameSite = request => { const o = request.headers.origin; return !o || o === new URL(app.config.publicUrl).origin || o === `${request.protocol}://${request.headers.host}`; };
  // Envoi accepté ? Formulaire venu d'un autre site, ou limite de débit atteinte : refusé, et signalé à la Vigie.
  const gate = (request, limiter, name) => {
    if (!sameSite(request)) {
      app.securite.emit('input_validation_fail', { request, emetteur: 'server/routes/public.js · provenance', detail: { raison: 'formulaire envoyé depuis un autre site', formulaire: name, origine: String(request.headers.origin).slice(0, 100) } });
      return false;
    }
    if (!limiter(request.ip)) {
      app.securite.emit('excess_rate_limit_exceeded', { request, emetteur: 'server/routes/public.js · limite', detail: { limite: name } });
      return false;
    }
    return true;
  };
  const trapped = (request, name) => {
    if (!String(request.body?.website || '').trim()) return false;
    app.securite.emit('malicious_honeypot', { request, emetteur: 'server/routes/public.js · champ piège', detail: { piege: 'champ caché', formulaire: name } });
    return true;
  };

  // ---------- partager ----------
  // Ce que montre la fenêtre « Partager » : aperçu, liens des réseaux, lien à copier, QR, post Instagram s'il existe.
  async function shareOf(photo, siteName) {
    const url = app.config.publicUrl + localize(photoUrl(photo.slug), lang);
    const ws = widthsFor(photo.width);
    const image = app.config.publicUrl + `/media/${variantName(photo.file, ws.at(-1), 'webp', photo.variant_key)}`;
    const title = `${photo.title} · ${siteName}`;
    return { url, title, host: new URL(app.config.publicUrl).host, links: shareLinks({ url, title, image }), qr: await shareQr(url),
      instagram: repo.instagramPermalink(photo.id), thumb: `/media/${variantName(photo.file, ws[0], 'webp', photo.variant_key)}`,
      thumbSet: coverSet(photo, { w: 92, h: 61 }), s: t.share };
  }
  // Sans JavaScript : la même fenêtre, en page.
  app.get('/photo/:slug/partager', async (request, reply) => {
    const photo = repo.publishedPhotos({ lang }).find(p => p.slug === request.params.slug);
    if (!photo) return reply.callNotFound();
    const siteName = app.siteName();
    reply.header('x-robots-tag', 'noindex');
    return reply.render('share', { ...base, siteName, photo, share: await shareOf(photo, siteName),
      pageTitle: `${t.share.title} · ${photo.title} · ${siteName}`, canonical: `/photo/${photo.slug}/partager`, description: '', bodyClass: 'dark' });
  });
  // Un partage (lien d'un réseau, lien copié, menu du téléphone) : compté, rien d'autre n'est gardé.
  app.post('/photo/:slug/partage', async (request, reply) => {
    const photo = repo.publishedPhotos({ lang }).find(p => p.slug === request.params.slug);
    if (!photo) return reply.callNotFound();
    const via = String(request.body?.via || '');
    if (!gate(request, shareLimit, 'partage')) return reply.code(429).send({ error: 'limit' });
    if (app.shares.record(photo.id, via)) return reply.code(204).send();
    // Canal hors liste : les boutons du site n'envoient que ceux de VIAS (server/share.js) ; signalé comme un filtre forgé,
    // sauf saisie déjà signalée comme malveillante par le crochet commun (DS11).
    if (!scanValue('body', 'body.via', via)) app.securite.emit('input_validation_fail', { request, emetteur: 'server/routes/public.js · partage', detail: { raison: 'valeur hors liste', champ: 'via', valeur: via.slice(0, 60) } });
    return reply.code(422).send({ error: 'via' });
  });

  // ---------- j'aime et signalements ----------
  const publishedBySlug = slug => repo.publishedPhotos({ lang }).find(p => p.slug === slug) || null;
  app.post('/photo/:slug/aime', async (request, reply) => {
    const photo = publishedBySlug(request.params.slug);
    if (!photo) return reply.callNotFound();
    const json = String(request.headers.accept || '').includes('application/json');
    if (!gate(request, likeLimit, 'j’aime')) return json ? reply.code(429).send({ error: 'limit' }) : reply.redirect(base.photoUrl(photo.slug), 303);
    const r = app.feedback.like(photo.id, clientKey(request.ip), { undo: request.body?.retirer === '1' || request.body?.retirer === true });
    return json ? reply.header('cache-control', 'no-store').send({ ...r, label: t.fb.likes(r.likes) }) : reply.redirect(base.photoUrl(photo.slug), 303);
  });
  function reportPage(request, reply, photo, { values = {}, errors = {}, sent = false, status = 200 } = {}) {
    const siteName = app.siteName();
    reply.code(status).header('x-robots-tag', 'noindex').header('cache-control', 'no-store');
    return reply.render('report', { ...base, siteName, photo, values, errors, sent, f: t.fb,
      pageTitle: `${t.fb.reportTitle} · ${siteName}`, canonical: `/photo/${photo.slug}/signaler`, description: '' });
  }
  app.get('/photo/:slug/signaler', async (request, reply) => {
    const photo = publishedBySlug(request.params.slug);
    if (!photo) return reply.callNotFound();
    return reportPage(request, reply, photo, { sent: request.query.envoye === '1' });
  });
  app.post('/photo/:slug/signaler', async (request, reply) => {
    const photo = publishedBySlug(request.params.slug);
    if (!photo) return reply.callNotFound();
    const body = request.body || {};
    const done = `${base.u(`/photo/${photo.slug}/signaler`)}?envoye=1`;
    if (trapped(request, 'signalement')) return reply.redirect(done, 303);                               // piège à robots
    if (!sameSite(request)) { gate(request, reportLimit, 'signalement'); return reply.redirect(done, 303); }
    if (!gate(request, reportLimit, 'signalement')) return reportPage(request, reply, photo, { values: body, errors: { limit: 'limit' }, status: 429 });
    try {
      app.feedback.report(photo.id, body, { lang });
    } catch (err) {
      if (!(err instanceof FeedbackError)) throw err;
      return reportPage(request, reply, photo, { values: body, errors: err.errors, status: 422 });
    }
    return reply.redirect(done, 303);
  });

  // ---------- Carnets (v2 seulement, server/routes/carnet-public.js) ----------
  registerCarnetPages(app, { lang, repo, base, ignored, gate, shareLimit });

  // ---------- Contact et demande de licence (server/routes/contact-public.js) ----------
  registerContactPages(app, { lang, repo, base, gate, trapped, sameSite, limit: messageLimit });

  // « Je vous ai photographié » : page du QR des cartes « pour eux » (référence dans l'adresse) ou tapée à la main.
  // Jamais indexée ; aucune photo ni donnée d'une autre personne n'y est montrée.
  function hello(request, reply, { values = {}, errors = {}, card = null, who = null, status = 200 } = {}) {
    const siteName = app.siteName();
    reply.code(status).header('x-robots-tag', 'noindex').header('cache-control', 'no-store');
    return reply.render('bonjour', {
      ...base, siteName, values, errors, card, who: who || app.encounters.photographer(values.photographer), h: t.hello,
      pageTitle: `${t.hello.pageTitle} · ${siteName}`, canonical: '/bonjour', description: t.hello.intro.replace('{site}', siteName),
    });
  }
  app.get('/bonjour', async (request, reply) => { app.stats.hit(request, { page: 'bonjour' }); return hello(request, reply); });
  app.get('/bonjour/merci', async (request, reply) => {
    const siteName = app.siteName();
    const c = app.encounters.card(request.query.ref);
    // Récapitulatif de l'envoi de ce navigateur, s'il porte sur la même référence (ou sur aucune, des deux côtés).
    const recap = recapStore.read(request.cookies?.[RECAP_COOKIE]);
    reply.header('x-robots-tag', 'noindex').header('cache-control', 'no-store');
    return reply.render('bonjour', { ...base, siteName, h: t.hello, sent: true, sentRef: c?.ref || null, values: {}, errors: {},
      recap: recap && (recap.ref ?? null) === (c?.ref ?? null) ? recap : null,
      pageTitle: `${t.hello.thanks} · ${siteName}`, canonical: '/bonjour', description: '' });
  });
  // Formulaire forgé (registre de la Vigie, BV-31, comme BV-28 pour Contact) : ce qu'un navigateur qui suit la page
  // n'envoie jamais (âge hors des deux réponses, date ou nom du parent plus longs que le maxlength), signalé à la Vigie
  // (DS12), sans la valeur pour l'âge (une tranche tapée à la main est une donnée personnelle), et seulement si le
  // crochet commun ne l'a pas déjà signalée comme saisie malveillante (DS11). Lu après le piège, la provenance et la
  // limite : rien n'en change l'ordre. L'envoi suit son cours (âge non renseigné, date illisible, nom coupé).
  const forgedHello = (request, body) => {
    const emit = (raison, champ, raw) => {
      if (typeof raw === 'string' && scanValue('body', `body.${champ}`, raw)) return;
      app.securite.emit('input_validation_fail', { request, emetteur: 'server/routes/public.js · bonjour', detail: { raison, formulaire: 'bonjour', champ, longueur: String(raw).length } });
    };
    if (body.adult != null && body.adult !== '' && !(typeof body.adult === 'string' && Object.hasOwn(ADULT, body.adult))) emit('valeur hors liste', 'adult', body.adult);
    for (const [champ, max] of [['met_on', MAX_DATE], ['guardian', 80]]) if (body[champ] != null && String(body[champ]).length > max) emit('saisie hors formulaire', champ, body[champ]);
  };
  // Carte affichée en tête du formulaire : d'après la référence seule (lettre du photographe, publique), jamais d'après
  // le résultat du code de contrôle (la page deviendrait un oracle pour le deviner).
  const shownCard = input => {
    // parseRef coupe les espaces puis refuse au-delà de 32 caractères (même lecture qu'à l'envoi, voir A019).
    const r = app.encounters.parseRef(input);
    return r && { ref: r.ref, code: r.code, author: app.encounters.photographer(r.prefix) };
  };
  app.get('/bonjour/:ref', async (request, reply) => {
    // QR générique d'un photographe (tee-shirt, sac…) : /bonjour/J, sans numéro de carte.
    const who = app.encounters.photographer(request.params.ref);
    if (who) { app.stats.hit(request, { page: 'bonjour' }); return hello(request, reply, { values: { photographer: request.params.ref.toUpperCase() }, who }); }
    // QR d'une carte : référence et code préremplis tels quels ; le code n'est vérifié qu'à l'envoi (essais comptés).
    const card = shownCard(request.params.ref);
    app.stats.hit(request, { page: 'bonjour' });
    return hello(request, reply, { card, values: { ref: card ? `${card.ref}${card.code ? `-${card.code}` : ''}` : '' } });
  });
  app.post('/bonjour', async (request, reply) => {
    const body = request.body || {};
    // Piège à robots (un champ invisible rempli), ou formulaire envoyé depuis un autre site : réponse « merci » sans rien
    // enregistrer.
    if (trapped(request, 'bonjour')) return reply.redirect(localize('/bonjour/merci', lang), 303);
    if (!sameSite(request)) { gate(request, helloLimit, 'bonjour'); return reply.redirect(localize('/bonjour/merci', lang), 303); }
    const card = body.ref ? shownCard(body.ref) : null;
    if (!gate(request, helloLimit, 'bonjour')) return hello(request, reply, { values: body, errors: { limit: 'limit' }, card, status: 429 });
    // Code de contrôle : compté et ignoré dans submit, sur la référence qu'il décode lui-même (une garde posée ici sur
    // une autre lecture de la saisie se contournait avec des espaces en tête).
    const onLock = ref => request.log.warn({ ref }, 'codes de carte faux : référence bloquée 24 h');
    forgedHello(request, body);
    try {
      // Code de carte faux : signalé (essais de codes), puis compté comme avant.
      const guard = { locked: codeGuard.locked, fail: ref => { app.securite.emit('token_guess', { request, emetteur: 'server/routes/public.js · code de carte', detail: { nature: 'code de carte', reference: String(ref).slice(0, 20) } }); return codeGuard.fail(ref); } };
      const r = app.encounters.submit(body, { lang, codeGuard: guard, onLock });
      // Demande RGPD : le photographe est prévenu tout de suite (relances ensuite, voir server/reminders.js).
      if (body.rights) app.reminders?.rights().catch(err => request.log.warn({ err: err.message }, 'relance RGPD'));
      reply.setCookie(RECAP_COOKIE, recapStore.keep(r.recap), { path: localize('/bonjour', lang), maxAge: recapStore.ttl, sameSite: 'lax', httpOnly: true, secure: app.config.publicUrl.startsWith('https://') });
      return reply.redirect(`${localize('/bonjour/merci', lang)}${r.ref ? `?ref=${encodeURIComponent(r.ref)}` : ''}`, 303);
    } catch (err) {
      if (!(err instanceof EncounterError)) throw err;
      return hello(request, reply, { values: body, errors: err.errors, card: err.errors.ref ? null : card, status: 422 });
    }
  });

  // Confidentialité (RGPD) : ce que le site collecte, pourquoi, combien de temps, et les droits des personnes.
  app.get('/confidentialite', async (request, reply) => {
    const siteName = app.siteName();
    const settings = repo.settings();
    const P = PRIVACY[lang];
    const contact = String(settings.privacy_contact || settings.rights_contact || '').trim();
    const host = app.config.publicUrl.replace(/^https?:\/\/(www\.)?/, '');
    const sections = P.sections({ site: siteName, authors: repo.authors().map(a => a.name), contact: contact || `${host}${localize('/bonjour', lang)}`, host,
      mfa: settings.privacy_mfa === true, encrypted: settings.privacy_encrypted === true, fields: app.encounters.encrypted, securityLog: app.securite.enabled, edge: Boolean(app.config?.vigie?.bordureKey) });
    const date = new Intl.DateTimeFormat({ fr: 'fr-FR', en: 'en-GB', de: 'de-DE' }[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(app.securite.enabled && UPDATED_SECURITY_LOG > PRIVACY_UPDATED ? UPDATED_SECURITY_LOG : PRIVACY_UPDATED));
    app.stats.hit(request, { page: 'confidentialite' });
    return reply.render('privacy', {
      ...base, siteName, P, sections, updated: P.updated(date), contact, contactHref: contactLink(contact),
      pageTitle: `${P.title} · ${siteName}`, canonical: '/confidentialite', description: P.description(siteName),
    });
  });

  // Mentions légales / Impressum (obligatoires en France et en Allemagne), en pied de chaque page.
  app.get('/mentions-legales', async (request, reply) => {
    const siteName = app.siteName();
    const s = repo.settings();
    const L = LEGAL[lang];
    const host = app.config.publicUrl.replace(/^https?:\/\/(www\.)?/, '');
    // E-mail : celui des mentions légales, sinon le contact de la page Confidentialité s'il s'agit d'une adresse e-mail.
    // Hébergement : par les éditeurs (par défaut), ou chez l'hébergeur nommé dans l'admin.
    const sections = L.sections({ site: siteName, names: String(s.legal_names || '').trim(), address: s.legal_address,
      email: legalEmail(s), phone: String(s.legal_phone || '').trim(), director: String(s.legal_director || '').trim(), host, hosting: hostingOf(s) });
    app.stats.hit(request, { page: 'mentions-legales' });
    return reply.render('legal', { ...base, siteName, L, sections, pageTitle: `${L.title} · ${siteName}`, canonical: '/mentions-legales', description: L.description(siteName) });
  });

  // Conditions d'utilisation des photos : cible des mentions IPTC (WebStatement, LicensorURL), à /droits en français.
  app.get('/droits', async (request, reply) => {
    const siteName = app.siteName();
    const settings = repo.settings();
    const r = RIGHTS[lang];
    const text = rightsText(settings, lang, repo.authors().map(a => a.name), siteName);
    const contact = String(settings.rights_contact || '').trim();
    app.stats.hit(request, { page: 'droits' });
    return reply.render('rights', {
      ...base, siteName, r, paragraphs: text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean),
      contact, contactHref: contactLink(contact),
      pageTitle: `${r.title} · ${siteName}`, canonical: '/droits', description: r.description(siteName),
    });
  });
}
