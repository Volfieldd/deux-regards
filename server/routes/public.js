import { createRepo } from '../repo.js';
import { galleryUrl, photoUrl } from '../urls.js';
import { widthsFor, variantName } from '../images.js';
import { pad } from '../format.js';
import { picture } from '../picture.js';

const HERO_COUNT = 5;

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
      ogImage: hero[0] && `/media/${variantName(hero[0].file, widthsFor(hero[0].width).at(-1), 'webp')}`,
    });
  }

  app.get('/', async (request, reply) => {
    const filter = readFilter(request.query, repo.authors(), repo.categories());
    return renderGallery(reply, filter);
  });

  app.get('/serie/:slug', async (request, reply) => {
    if (!repo.categories().some(c => c.slug === request.params.slug)) return reply.callNotFound();
    return renderGallery(reply, { serie: request.params.slug });
  });

  app.get('/auteur/:slug', async (request, reply) => {
    if (!repo.authors().some(a => a.slug === request.params.slug)) return reply.callNotFound();
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
    const prev = list[(i - 1 + list.length) % list.length];
    const next = list[(i + 1) % list.length];
    return reply.render('photo', {
      ...helpers, filter, photo, prev, next, position: i + 1, count: list.length,
      backUrl: `${galleryUrl(filter)}#galerie`,
      pageTitle: `${photo.title} · ${siteName}`,
      canonical: photoUrl(photo.slug),
      description: [photo.legend, `${photo.author}, ${photo.place} ${photo.when}`.trim()].filter(Boolean).join(' '),
      ogImage: `/media/${variantName(photo.file, widthsFor(photo.width).at(-1), 'webp')}`,
      bodyClass: 'dark',
    });
  });

  app.get('/a-propos', async (request, reply) => {
    const siteName = app.siteName();
    const helpers = { ...base, siteName };
    const settings = repo.settings();
    const paragraphs = String(settings.about || settings.intro || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    return reply.render('about', {
      ...helpers, settings, paragraphs, authors: repo.authors(),
      pageTitle: `À propos · ${siteName}`, canonical: '/a-propos', description: settings.tagline || '',
    });
  });

  app.setNotFoundHandler(async (request, reply) => {
    const siteName = app.siteName();
    const helpers = { ...base, siteName };
    reply.code(404);
    return reply.render('notfound', { ...helpers, pageTitle: `Page introuvable · ${siteName}`, description: '' });
  });
}
