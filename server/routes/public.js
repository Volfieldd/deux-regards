import { createRepo } from '../repo.js';
import { galleryUrl, photoUrl, ORDRES } from '../urls.js';
import { widthsFor, variantName } from '../images.js';
import { pad } from '../format.js';
import { picture } from '../picture.js';
import { RIGHTS, rightsText } from '../rights.js';
import { project, MAP } from '../geo/projection.js';
import { countryName } from '../geo/cities.js';
import { LANGS, PREFIX, UI, pick, localize, splitLang, detectLang } from '../i18n.js';
import { BOTS, countryOf } from '../stats.js';
import { createRateLimiter } from '../ratelimit.js';
import { EncounterError } from '../encounters.js';

const HERO_COUNT = 5;
const YEAR = 365 * 24 * 3600;

export default async function publicRoutes(app) {
  const repo = createRepo(app.db);
  // Page « Carte » facultative (Réglages) : tant qu'elle n'est pas publiée, introuvable pour les visiteurs.
  const mapEnabled = () => repo.settings().map_page === true;

  // Page /bonjour : 8 demandes par heure et par adresse au plus (partagé entre les trois langues).
  const helloLimit = createRateLimiter({ limit: 8, windowMs: 3600 * 1000 });
  // Mêmes pages en français (racine), en anglais (/en) et en allemand (/de).
  for (const lang of LANGS) await app.register(pages, { prefix: PREFIX[lang], lang, repo, mapEnabled, helloLimit });

  // Sélecteur de langue : retient le choix (seul cookie du site, posé à ce moment-là) puis ouvre la page demandée.
  app.get('/langue/:lang', async (request, reply) => {
    const lang = LANGS.includes(request.params.lang) ? request.params.lang : null;
    const to = String(request.query.vers || '');
    const target = /^\/(?![/\\])/.test(to) ? to : '/';
    if (!lang) return reply.callNotFound();
    reply.setCookie('langue', lang, { path: '/', maxAge: YEAR, sameSite: 'lax', httpOnly: true, secure: app.config.publicUrl.startsWith('https://') });
    return reply.header('x-robots-tag', 'noindex').redirect(localize(splitLang(target).path, lang), 303);
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
    .send(`User-agent: *\nDisallow: /admin\nDisallow: /auth/\nDisallow: /partage/\nDisallow: /langue/\nAllow: /\n\nSitemap: ${app.config.publicUrl}/sitemap.xml\n`));

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
      { loc: '/a-propos' }, { loc: '/droits' },
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

async function pages(app, { lang, repo, mapEnabled, helloLimit }) {
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
    const prev = list[(i - 1 + list.length) % list.length];
    const next = list[(i + 1) % list.length];
    return reply.render('photo', {
      ...base, siteName, filter, photo, prev, next, position: i + 1, count: list.length,
      backUrl: `${base.galleryUrl(filter)}#galerie`,
      pageTitle: `${photo.title} · ${siteName}`,
      canonical: photoUrl(photo.slug),
      description: [photo.legend, [photo.author, [photo.place, photo.when].filter(Boolean).join(', ')].filter(Boolean).join(', ')].filter(Boolean).join(' '),
      ogImage: `/media/${variantName(photo.file, widthsFor(photo.width).at(-1), 'webp', photo.variant_key)}`,
      bodyClass: 'dark',
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
    if (!enabled && !request.session) return reply.callNotFound();
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

  // « Je vous ai photographié » : page du QR des cartes « pour eux » (référence dans l'adresse) ou tapée à la main.
  // Jamais indexée ; aucune photo ni donnée d'une autre personne n'y est montrée.
  function hello(request, reply, { values = {}, errors = {}, card = null, status = 200 } = {}) {
    const siteName = app.siteName();
    reply.code(status).header('x-robots-tag', 'noindex').header('cache-control', 'no-store');
    return reply.render('bonjour', {
      ...base, siteName, values, errors, card, h: t.hello,
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
      return reply.redirect(`${localize('/bonjour/merci', lang)}${r.ref ? `?ref=${encodeURIComponent(r.ref)}` : ''}`, 303);
    } catch (err) {
      if (!(err instanceof EncounterError)) throw err;
      return hello(request, reply, { values: body, errors: err.errors, card: card?.badCode ? null : card, status: 422 });
    }
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
