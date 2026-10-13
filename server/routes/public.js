import { createRepo } from '../repo.js';
import { galleryUrl, photoUrl, ORDRES } from '../urls.js';
import { widthsFor, variantName } from '../images.js';
import { pad } from '../format.js';
import { picture } from '../picture.js';
import { RIGHTS, LANGS, rightsText } from '../rights.js';

const HERO_COUNT = 5;
export default async function publicRoutes(app) {
  const repo = createRepo(app.db);

  // Le nom du site est réglable dans l'admin : relu à chaque page.
  const base = { picture, galleryUrl, photoUrl, pad };

  // Filtres valides uniquement ; une valeur inconnue est ignorée.
  function readFilter(query, authors, categories) {
    const regard = authors.some(a => a.slug === query.regard) ? query.regard : undefined;
    const serie = categories.some(c => c.slug === query.serie) ? query.serie : undefined;
    const ordre = ORDRES.includes(query.ordre) ? query.ordre : undefined;
    return { regard, serie, ordre };
  }

  function renderGallery(reply, filter) {
    const siteName = app.siteName();
    const helpers = { ...base, siteName };
    const authors = repo.authors();
    const categories = repo.categories();
    const settings = repo.settings();
    const all = repo.publishedPhotos();
    const photos = repo.publishedPhotos({ author: filter.regard, category: filter.serie, ordre: filter.ordre });
    const byRegard = repo.publishedPhotos({ author: filter.regard });

    const heroSlugs = Array.isArray(settings.hero) ? settings.hero : [];
    let hero = heroSlugs.map(s => all.find(p => p.slug === s)).filter(Boolean);
    if (!hero.length) hero = all.slice(0, HERO_COUNT);

    const series = categories.map(c => {
      const inCat = byRegard.filter(p => p.category_slug === c.slug);
      return { ...c, count: inCat.length, cover: inCat[0] };
    });
    const regards = [
      { slug: undefined, name: 'Les deux', count: all.length },
      ...authors.map(a => ({ ...a, count: all.filter(p => p.author_slug === a.slug).length })),
    ];
    const activeAuthor = authors.find(a => a.slug === filter.regard);
    const activeSerie = categories.find(c => c.slug === filter.serie);

    const title = [activeSerie?.name, activeAuthor && `par ${activeAuthor.name}`].filter(Boolean).join(', ');
    return reply.render('home', {
      ...helpers, filter, settings, hero, series, regards, photos, total: all.length,
      categoriesCount: categories.length, activeAuthor, activeSerie,
      pageTitle: title ? `${title} · ${siteName}` : siteName,
      canonical: galleryUrl({ regard: filter.regard, serie: filter.serie }),   // même contenu, quel que soit l'ordre
      description: settings.tagline || '',
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
    const helpers = { ...base, siteName };
    let filter = readFilter(request.query, repo.authors(), repo.categories());
    let list = repo.publishedPhotos({ author: filter.regard, category: filter.serie, ordre: filter.ordre });
    let i = list.findIndex(p => p.slug === request.params.slug);
    if (i === -1 && (filter.regard || filter.serie)) {
      filter = { ordre: filter.ordre };
      list = repo.publishedPhotos({ ordre: filter.ordre });
      i = list.findIndex(p => p.slug === request.params.slug);
    }
    if (i === -1) return reply.callNotFound();
    const photo = list[i];
    app.stats.hit(request, { photoId: photo.id });
    const prev = list[(i - 1 + list.length) % list.length];
    const next = list[(i + 1) % list.length];
    return reply.render('photo', {
      ...helpers, filter, photo, prev, next, position: i + 1, count: list.length,
      backUrl: `${galleryUrl(filter)}#galerie`,
      pageTitle: `${photo.title} · ${siteName}`,
      canonical: photoUrl(photo.slug),
      description: [photo.legend, [photo.author, [photo.place, photo.when].filter(Boolean).join(', ')].filter(Boolean).join(', ')].filter(Boolean).join(' '),
      ogImage: `/media/${variantName(photo.file, widthsFor(photo.width).at(-1), 'webp', photo.variant_key)}`,
      bodyClass: 'dark',
    });
  });

  app.get('/a-propos', async (request, reply) => {
    const siteName = app.siteName();
    const helpers = { ...base, siteName };
    const settings = repo.settings();
    const paragraphs = String(settings.about || settings.intro || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    app.stats.hit(request, { page: 'a-propos' });
    return reply.render('about', {
      ...helpers, settings, paragraphs, authors: repo.authors(),
      pageTitle: `À propos · ${siteName}`, canonical: '/a-propos', description: settings.tagline || '',
    });
  });

  // Conditions d'utilisation des photos : cible des mentions IPTC (WebStatement, LicensorURL).
  // Français à /droits, traductions à /droits/en et /droits/de (voir server/rights.js).
  async function rightsPage(request, reply, lang) {
    const siteName = app.siteName();
    const settings = repo.settings();
    const t = RIGHTS[lang];
    const text = rightsText(settings, lang, repo.authors().map(a => a.name), siteName);
    const contact = String(settings.rights_contact || '').trim();
    app.stats.hit(request, { page: 'droits' });
    return reply.render('rights', {
      ...base, siteName, lang, t, paragraphs: text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean),
      langs: LANGS.map(l => ({ code: l, name: RIGHTS[l].name, path: RIGHTS[l].path, current: l === lang })),
      alternates: LANGS.map(l => ({ lang: l, href: RIGHTS[l].path })),
      footerText: { ...t.footer, rights: t.title, rightsHref: t.path },
      contact, contactHref: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? `mailto:${contact}` : /^https:\/\/\S+$/.test(contact) ? contact : null,
      pageTitle: `${t.title} · ${siteName}`, canonical: t.path, description: t.description(siteName),
    });
  }
  app.get('/droits', (request, reply) => rightsPage(request, reply, 'fr'));
  for (const lang of LANGS.filter(l => l !== 'fr')) app.get(RIGHTS[lang].path, (request, reply) => rightsPage(request, reply, lang));

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
    .send(`User-agent: *\nDisallow: /admin\nDisallow: /auth/\nDisallow: /partage/\nAllow: /\n\nSitemap: ${app.config.publicUrl}/sitemap.xml\n`));

  app.get('/sitemap.xml', async (request, reply) => {
    const base = app.config.publicUrl;
    const photos = repo.publishedPhotos();
    const latest = photos.map(p => p.updated_at).sort().at(-1);
    const day = d => (d ? d.slice(0, 10) : undefined);
    const urls = [
      { loc: '/', lastmod: day(latest) },
      ...repo.categories().filter(c => photos.some(p => p.category_slug === c.slug)).map(c => ({ loc: galleryUrl({ serie: c.slug }) })),
      ...repo.authors().filter(a => photos.some(p => p.author_slug === a.slug)).map(a => ({ loc: galleryUrl({ regard: a.slug }) })),
      ...photos.map(p => ({ loc: photoUrl(p.slug), lastmod: day(p.updated_at) })),
      { loc: '/a-propos' }, ...LANGS.map(l => ({ loc: RIGHTS[l].path })),
    ];
    const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const body = urls.map(u => `  <url><loc>${xml(base + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n');
    return reply.type('application/xml; charset=utf-8')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
  });

  app.setNotFoundHandler(async (request, reply) => {
    const siteName = app.siteName();
    const helpers = { ...base, siteName };
    reply.code(404);
    return reply.render('notfound', { ...helpers, pageTitle: `Page introuvable · ${siteName}`, description: '' });
  });
}
