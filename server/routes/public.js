import { createRepo } from '../repo.js';
import { galleryUrl, photoUrl, ORDRES } from '../urls.js';
import { widthsFor, variantName } from '../images.js';
import { pad } from '../format.js';
import { picture } from '../picture.js';
import { RIGHTS, rightsText } from '../rights.js';
import { PRIVACY, UPDATED as PRIVACY_UPDATED } from '../privacy.js';
import { LEGAL } from '../legal.js';
import { project, MAP } from '../geo/projection.js';
import { countryName } from '../geo/cities.js';
import { LANGS, PREFIX, UI, pick, localize, splitLang, detectLang } from '../i18n.js';
import { BOTS, countryOf } from '../stats.js';
import path from 'node:path';
import sharp from 'sharp';
import { createRateLimiter, clientKey } from '../ratelimit.js';
import { FeedbackError } from '../feedback.js';
import { shareLinks, shareQr } from '../share.js';
import { EncounterError } from '../encounters.js';

const HERO_COUNT = 5;
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
  // Mêmes pages en français (racine), en anglais (/en) et en allemand (/de).
  for (const lang of LANGS) await app.register(pages, { prefix: PREFIX[lang], lang, repo, mapEnabled, helloLimit, likeLimit, reportLimit, shareLimit });

  // Sélecteur de langue : retient le choix (seul cookie du site, posé à ce moment-là) puis ouvre la page demandée.
  // Adresses habituelles des mentions légales en Allemagne et en anglais.
  app.get('/impressum', async (request, reply) => reply.redirect('/de/mentions-legales', 301));
  app.get('/legal-notice', async (request, reply) => reply.redirect('/en/mentions-legales', 301));

  app.get('/langue/:lang', async (request, reply) => {
    const lang = LANGS.includes(request.params.lang) ? request.params.lang : null;
    const to = String(request.query.vers || '');
    const target = /^\/(?![/\\])/.test(to) ? to : '/';
    if (!lang) return reply.callNotFound();
    reply.setCookie('langue', lang, { path: '/', maxAge: YEAR, sameSite: 'lax', httpOnly: true, secure: app.config.publicUrl.startsWith('https://') });
    return reply.header('x-robots-tag', 'noindex').redirect(localize(splitLang(target).path, lang), 303);
  });
  // Photo offerte à une personne photographiée : lien privé de la fiche Rencontre (30 jours), dans sa langue.
  // Une version JPEG (2048 px, ou 1200 px pour l'aperçu), jamais l'original ; aucune indexation, aucun cache.
  const ascii = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '').slice(0, 100);
  const giftJpeg = (s, width) => sharp(path.join(app.config.storageDir, 'originals', s.file)).rotate()
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true })
    .withExif({ IFD0: { Artist: ascii(s.author), Copyright: `(C) ${ascii(s.author)} - ${ascii(app.siteName())} - usage personnel / personal use` } }).toBuffer();
  const giftHeaders = reply => reply.header('x-robots-tag', 'noindex').header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');
  app.get('/pour-vous/:token', async (request, reply) => {
    const s = app.encounters.share(request.params.token);
    if (!s) return reply.callNotFound();
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
      if (!s || s.expired) return reply.callNotFound();
      const buf = await giftJpeg(s, width);
      if (kind === 'download') {
        app.encounters.countShare(s.token, 'download');
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
    if (!post || !app.instagram.isPublic(post.photo_id)) return reply.callNotFound();
    const buf = await app.instagram.image(post.photo_id, app.instagram.optionsOf(post));
    return reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex').type('image/jpeg').send(buf);
  });

  // Moteurs de recherche : tout le site public, jamais l'admin ni la connexion.
  app.get('/robots.txt', async (request, reply) => reply.type('text/plain; charset=utf-8')
    .send(`User-agent: *\nDisallow: /admin\nDisallow: /auth/\nDisallow: /partage/\nDisallow: /langue/\nDisallow: /pour-vous/\nAllow: /\n\nSitemap: ${app.config.publicUrl}/sitemap.xml\n`));

  // Chaque page dans ses trois langues, avec les liens hreflang entre elles.
  app.get('/sitemap.xml', async (request, reply) => {
    const base = app.config.publicUrl;
    const photos = repo.publishedPhotos();
    const latest = photos.map(p => p.updated_at).sort().at(-1);
    const day = d => (d ? d.slice(0, 10) : undefined);
    const pagesList = [
      { loc: '/', lastmod: day(latest) },
      ...repo.categories().filter(c => photos.some(p => p.category_slug === c.slug)).map(c => ({ loc: galleryUrl({ serie: c.slug }) })),
      ...repo.authors().filter(a => photos.some(p => p.author_slug === a.slug)).map(a => ({ loc: galleryUrl({ regard: a.slug }) })),
      ...photos.map(p => ({ loc: photoUrl(p.slug), lastmod: day(p.updated_at) })),
      ...(mapEnabled() ? [{ loc: '/carte' }] : []),
      { loc: '/a-propos' }, { loc: '/droits' }, { loc: '/confidentialite' }, { loc: '/mentions-legales' },
    ];
    const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const links = loc => LANGS.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${xml(base + localize(loc, l))}"/>`).join('');
    const body = pagesList.flatMap(u => LANGS.map(l =>
      `  <url><loc>${xml(base + localize(u.loc, l))}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${links(u.loc)}</url>`)).join('\n');
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

// Aides des gabarits pour une langue : textes, adresses préfixées, photos et vignettes.
function helpers(lang) {
  const u = path => localize(path, lang);
  return { picture, pad, lang, t: UI[lang], u, galleryUrl: f => u(galleryUrl(f)), photoUrl: (slug, f) => u(photoUrl(slug, f)) };
}

async function pages(app, { lang, repo, mapEnabled, helloLimit, likeLimit, reportLimit, shareLimit }) {
  const t = UI[lang];
  const base = helpers(lang);
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

  // Filtres valides uniquement ; une valeur inconnue est ignorée.
  function readFilter(query, authors, categories) {
    const regard = authors.some(a => a.slug === query.regard) ? query.regard : undefined;
    const serie = categories.some(c => c.slug === query.serie) ? query.serie : undefined;
    const ordre = ORDRES.includes(query.ordre) ? query.ordre : undefined;
    return { regard, serie, ordre };
  }

  function renderGallery(reply, filter) {
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

    const series = categories.map(c => {
      const inCat = byRegard.filter(p => p.category_slug === c.slug);
      return { ...c, count: inCat.length, cover: inCat[0] };
    });
    const regards = [
      { slug: undefined, name: t.both, count: all.length },
      ...authors.map(a => ({ ...a, count: all.filter(p => p.author_slug === a.slug).length })),
    ];
    const activeAuthor = authors.find(a => a.slug === filter.regard);
    const activeSerie = categories.find(c => c.slug === filter.serie);

    const title = [activeSerie?.name, activeAuthor && t.by(activeAuthor.name)].filter(Boolean).join(', ');
    const tagline = pick(settings, 'tagline', lang);
    return reply.render('home', {
      ...base, filter, settings, tagline, intro: pick(settings, 'intro', lang), hero, series, regards, photos, total: all.length,
      categoriesCount: categories.length, activeAuthor, activeSerie,
      pageTitle: title ? `${title} · ${siteName}` : siteName, siteName,
      canonical: galleryUrl({ regard: filter.regard, serie: filter.serie }),   // même contenu, quel que soit l'ordre
      description: tagline,
      ogImage: hero[0] && `/media/${variantName(hero[0].file, widthsFor(hero[0].width).at(-1), 'webp', hero[0].variant_key)}`,
    });
  }

  app.get('/', async (request, reply) => {
    const filter = readFilter(request.query, repo.authors(), repo.categories());
    app.stats.hit(request, { page: filter.serie ? `serie:${filter.serie}` : filter.regard ? `auteur:${filter.regard}` : 'accueil' });
    return renderGallery(reply, filter);
  });

  app.get('/serie/:slug', async (request, reply) => {
    if (!repo.categories().some(c => c.slug === request.params.slug)) return reply.callNotFound();
    app.stats.hit(request, { page: `serie:${request.params.slug}` });
    return renderGallery(reply, { serie: request.params.slug, ordre: readFilter(request.query, [], []).ordre });
  });

  app.get('/auteur/:slug', async (request, reply) => {
    if (!repo.authors().some(a => a.slug === request.params.slug)) return reply.callNotFound();
    app.stats.hit(request, { page: `auteur:${request.params.slug}` });
    return renderGallery(reply, { regard: request.params.slug, ordre: readFilter(request.query, [], []).ordre });
  });

  app.get('/photo/:slug', async (request, reply) => {
    const siteName = app.siteName();
    let filter = readFilter(request.query, repo.authors(), repo.categories());
    let list = repo.publishedPhotos({ author: filter.regard, category: filter.serie, ordre: filter.ordre, lang });
    let i = list.findIndex(p => p.slug === request.params.slug);
    if (i === -1 && (filter.regard || filter.serie)) {
      filter = { ordre: filter.ordre };
      list = repo.publishedPhotos({ ordre: filter.ordre, lang });
      i = list.findIndex(p => p.slug === request.params.slug);
    }
    if (i === -1) return reply.callNotFound();
    const photo = list[i];
    app.stats.hit(request, { photoId: photo.id });
    // Arrivée par le QR de la fenêtre « Partager » : comptée comme un partage.
    if (request.query.partage === 'qr' && !BOTS.test(request.headers['user-agent'] || '') && shareLimit(request.ip)) app.shares.record(photo.id, 'qr');
    const prev = list[(i - 1 + list.length) % list.length];
    const next = list[(i + 1) % list.length];
    return reply.render('photo', {
      ...base, siteName, filter, photo, prev, next, position: i + 1, count: list.length,
      backUrl: `${base.galleryUrl(filter)}#galerie`,
      pageTitle: `${photo.title} · ${siteName}`,
      canonical: photoUrl(photo.slug),
      description: [photo.legend, [photo.author, [photo.place, photo.when].filter(Boolean).join(', ')].filter(Boolean).join(', ')].filter(Boolean).join(' '),
      ogImage: `/media/${variantName(photo.file, widthsFor(photo.width).at(-1), 'webp', photo.variant_key)}`,
      bodyClass: 'dark', share: await shareOf(photo, siteName),
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
        byCity.set(p.city_id, { id: p.city_id, name: p.city_name, country: countryName(p.city_cc, lang), x, y, photos: [] });
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

  // ---------- partager ----------
  // Ce que montre la fenêtre « Partager » : aperçu, liens des réseaux, lien à copier, QR, post Instagram s'il existe.
  async function shareOf(photo, siteName) {
    const url = app.config.publicUrl + localize(photoUrl(photo.slug), lang);
    const ws = widthsFor(photo.width);
    const image = app.config.publicUrl + `/media/${variantName(photo.file, ws.at(-1), 'webp', photo.variant_key)}`;
    const title = `${photo.title} · ${siteName}`;
    return { url, title, host: new URL(app.config.publicUrl).host, links: shareLinks({ url, title, image }), qr: await shareQr(url),
      instagram: repo.instagramPermalink(photo.id), thumb: `/media/${variantName(photo.file, ws[0], 'webp', photo.variant_key)}`, s: t.share };
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
    if (!sameSite(request) || !shareLimit(request.ip)) return reply.code(429).send({ error: 'limit' });
    return app.shares.record(photo.id, via) ? reply.code(204).send() : reply.code(422).send({ error: 'via' });
  });

  // ---------- j'aime et signalements ----------
  const publishedBySlug = slug => repo.publishedPhotos({ lang }).find(p => p.slug === slug) || null;
  app.post('/photo/:slug/aime', async (request, reply) => {
    const photo = publishedBySlug(request.params.slug);
    if (!photo) return reply.callNotFound();
    const json = String(request.headers.accept || '').includes('application/json');
    if (!sameSite(request) || !likeLimit(request.ip)) return json ? reply.code(429).send({ error: 'limit' }) : reply.redirect(base.photoUrl(photo.slug), 303);
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
    if (String(body.website || '').trim() || !sameSite(request)) return reply.redirect(done, 303);     // piège à robots
    if (!reportLimit(request.ip)) return reportPage(request, reply, photo, { values: body, errors: { limit: 'limit' }, status: 429 });
    try {
      app.feedback.report(photo.id, body, { lang });
    } catch (err) {
      if (!(err instanceof FeedbackError)) throw err;
      return reportPage(request, reply, photo, { values: body, errors: err.errors, status: 422 });
    }
    return reply.redirect(done, 303);
  });

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
    reply.header('x-robots-tag', 'noindex').header('cache-control', 'no-store');
    return reply.render('bonjour', { ...base, siteName, h: t.hello, sent: true, sentRef: c?.ref || null, values: {}, errors: {},
      pageTitle: `${t.hello.thanks} · ${siteName}`, canonical: '/bonjour', description: '' });
  });
  app.get('/bonjour/:ref', async (request, reply) => {
    // QR générique d'un photographe (tee-shirt, sac…) : /bonjour/J, sans numéro de carte.
    const who = app.encounters.photographer(request.params.ref);
    if (who) { app.stats.hit(request, { page: 'bonjour' }); return hello(request, reply, { values: { photographer: request.params.ref.toUpperCase() }, who }); }
    const card = app.encounters.card(request.params.ref);
    app.stats.hit(request, { page: 'bonjour' });
    return hello(request, reply, { card: card && !card.badCode ? card : null, values: { ref: card && !card.badCode ? request.params.ref.toUpperCase() : '' } });
  });
  app.post('/bonjour', async (request, reply) => {
    const body = request.body || {};
    // Piège à robots : un champ invisible rempli. Réponse « merci » sans rien enregistrer.
    if (String(body.website || '').trim()) return reply.redirect(localize('/bonjour/merci', lang), 303);
    const card = body.ref ? app.encounters.card(body.ref) : null;
    if (!helloLimit(request.ip)) return hello(request, reply, { values: body, errors: { limit: 'limit' }, card: card?.badCode ? null : card, status: 429 });
    try {
      const r = app.encounters.submit(body, { lang });
      // Demande RGPD : le photographe est prévenu tout de suite (relances ensuite, voir server/reminders.js).
      if (body.rights) app.reminders?.rights().catch(err => request.log.warn({ err: err.message }, 'relance RGPD'));
      return reply.redirect(`${localize('/bonjour/merci', lang)}${r.ref ? `?ref=${encodeURIComponent(r.ref)}` : ''}`, 303);
    } catch (err) {
      if (!(err instanceof EncounterError)) throw err;
      return hello(request, reply, { values: body, errors: err.errors, card: card?.badCode ? null : card, status: 422 });
    }
  });

  // Confidentialité (RGPD) : ce que le site collecte, pourquoi, combien de temps, et les droits des personnes.
  app.get('/confidentialite', async (request, reply) => {
    const siteName = app.siteName();
    const settings = repo.settings();
    const P = PRIVACY[lang];
    const contact = String(settings.privacy_contact || settings.rights_contact || '').trim();
    const host = app.config.publicUrl.replace(/^https?:\/\/(www\.)?/, '');
    const sections = P.sections({ site: siteName, authors: repo.authors().map(a => a.name), contact: contact || `${host}/bonjour`, host,
      mfa: settings.privacy_mfa === true, encrypted: settings.privacy_encrypted === true, fields: app.encounters.encrypted });
    const date = new Intl.DateTimeFormat({ fr: 'fr-FR', en: 'en-GB', de: 'de-DE' }[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(PRIVACY_UPDATED));
    app.stats.hit(request, { page: 'confidentialite' });
    return reply.render('privacy', {
      ...base, siteName, P, sections, updated: P.updated(date), contact,
      contactHref: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? `mailto:${contact}` : null,
      pageTitle: `${P.title} · ${siteName}`, canonical: '/confidentialite', description: P.description(siteName),
    });
  });

  // Mentions légales / Impressum (obligatoires en France et en Allemagne), en pied de chaque page.
  app.get('/mentions-legales', async (request, reply) => {
    const siteName = app.siteName();
    const s = repo.settings();
    const L = LEGAL[lang];
    const host = app.config.publicUrl.replace(/^https?:\/\/(www\.)?/, '');
    const sections = L.sections({ site: siteName, names: String(s.legal_names || '').trim(), address: s.legal_address, email: String(s.legal_email || s.privacy_contact || '').trim(),
      phone: String(s.legal_phone || '').trim(), director: String(s.legal_director || '').trim(), host });
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
      contact, contactHref: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? `mailto:${contact}` : /^https:\/\/\S+$/.test(contact) ? contact : null,
      pageTitle: `${r.title} · ${siteName}`, canonical: '/droits', description: r.description(siteName),
    });
  });
}
