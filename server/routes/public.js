import { createRepo } from '../repo.js';
import { galleryUrl, photoUrl } from '../urls.js';
import { widthsFor, variantName } from '../images.js';
import { pad } from '../format.js';
import { picture } from '../picture.js';

const HERO_COUNT = 5;
const DEFAULT_RIGHTS = `Toutes les photographies publiées sur ce site sont protégées par le droit d’auteur. Elles appartiennent à leurs auteurs, {auteurs}.

Toute reproduction, représentation, modification ou utilisation, totale ou partielle, sans autorisation écrite préalable est interdite (articles L.122-4 et L.335-2 du Code de la propriété intellectuelle).

Pour toute demande d’utilisation ou de licence, écrivez-nous en précisant la photo, l’usage envisagé et sa durée.`;

export default async function publicRoutes(app) {
  const repo = createRepo(app.db);

  // Le nom du site est réglable dans l'admin : relu à chaque page.
  const base = { picture, galleryUrl, photoUrl, pad };

  // Filtres valides uniquement ; une valeur inconnue est ignorée.
  function readFilter(query, authors, categories) {
    const regard = authors.some(a => a.slug === query.regard) ? query.regard : undefined;
    const serie = categories.some(c => c.slug === query.serie) ? query.serie : undefined;
    return { regard, serie };
  }

  function renderGallery(reply, filter) {
    const siteName = app.siteName();
    const helpers = { ...base, siteName };
    const authors = repo.authors();
    const categories = repo.categories();
    const settings = repo.settings();
    const all = repo.publishedPhotos();
    const photos = repo.publishedPhotos({ author: filter.regard, category: filter.serie });
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
      canonical: galleryUrl(filter),
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
    return renderGallery(reply, { serie: request.params.slug });
  });

  app.get('/auteur/:slug', async (request, reply) => {
    if (!repo.authors().some(a => a.slug === request.params.slug)) return reply.callNotFound();
    app.stats.hit(request, { page: `auteur:${request.params.slug}` });
    return renderGallery(reply, { regard: request.params.slug });
  });

  app.get('/photo/:slug', async (request, reply) => {
    const siteName = app.siteName();
    const helpers = { ...base, siteName };
    let filter = readFilter(request.query, repo.authors(), repo.categories());
    let list = repo.publishedPhotos({ author: filter.regard, category: filter.serie });
    let i = list.findIndex(p => p.slug === request.params.slug);
    if (i === -1 && (filter.regard || filter.serie)) {
      filter = {};
      list = repo.publishedPhotos();
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
  app.get('/droits', async (request, reply) => {
    const siteName = app.siteName();
    const settings = repo.settings();
    const authors = repo.authors().map(a => a.name);
    const names = authors.length > 1 ? `${authors.slice(0, -1).join(', ')} et ${authors.at(-1)}` : authors[0] || siteName;
    const text = settings.rights_text || DEFAULT_RIGHTS.replace('{auteurs}', names);
    const contact = String(settings.rights_contact || '').trim();
    app.stats.hit(request, { page: 'droits' });
    return reply.render('rights', {
      ...base, siteName, paragraphs: text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean),
      contact, contactHref: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? `mailto:${contact}` : /^https:\/\/\S+$/.test(contact) ? contact : null,
      pageTitle: `Droits d’utilisation · ${siteName}`, canonical: '/droits', description: `Conditions d’utilisation des photographies de ${siteName}.`,
    });
  });

  // Moteurs de recherche : tout le site public, jamais l'admin ni la connexion.
  app.get('/robots.txt', async (request, reply) => reply.type('text/plain; charset=utf-8')
    .send(`User-agent: *\nDisallow: /admin\nDisallow: /auth/\nAllow: /\n\nSitemap: ${app.config.publicUrl}/sitemap.xml\n`));

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
      { loc: '/a-propos' }, { loc: '/droits' },
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
