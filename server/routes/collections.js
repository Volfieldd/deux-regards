import { usesV2 } from '../version-publique.js';
import { localize } from '../i18n.js';
import { variantName, widthsFor } from '../images.js';
import { createCollectionsPubliques } from '../collections-publiques.js';

export const COLLECTION_UI = {
  fr: {
    title: 'Collections permanentes', lead: 'Des expositions qui prolongent les saisons, avec leur propre regard et leur propre accrochage.', permanent: 'Exposition permanente',
    empty: 'Aucune collection permanente à découvrir pour le moment.', back: 'Toutes les collections permanentes', exhibitions: 'Toutes les expositions', visit: 'Visiter la collection', start: 'Commencer la visite',
    photographs: n => `${n} photographie${n > 1 ? 's' : ''}`, images: 'L’accrochage', noPhotos: 'Les photographies de cette collection ne sont plus disponibles pour le moment.',
    conclusion: 'Pour prolonger ce regard', returnToPhotos: 'Revoir l’accrochage', origin: 'À l’origine de cette collection', fromExhibition: 'Découvrir l’exposition d’origine', fromReport: 'Lire le bilan d’origine',
    previous: 'Photo précédente', next: 'Photo suivante', position: (n, total) => `Photographie ${n} sur ${total}`, returnToCollection: 'Revenir à la collection', finish: 'Terminer la visite',
    pages: (n, total) => `Page ${n} sur ${total}`, pagePrevious: 'Page précédente', pageNext: 'Page suivante', pageLabel: 'Pages des collections permanentes',
  },
  en: {
    title: 'Permanent collections', lead: 'Exhibitions that carry the seasons forward, with their own perspective and display.', permanent: 'Permanent exhibition',
    empty: 'There are no permanent collections to discover at the moment.', back: 'All permanent collections', exhibitions: 'All exhibitions', visit: 'Visit the collection', start: 'Start the visit',
    photographs: n => `${n} photograph${n > 1 ? 's' : ''}`, images: 'The photographs', noPhotos: 'The photographs in this collection are currently unavailable.',
    conclusion: 'Continuing this perspective', returnToPhotos: 'View the photographs again', origin: 'The origins of this collection', fromExhibition: 'Discover the original exhibition', fromReport: 'Read the original retrospective',
    previous: 'Previous photograph', next: 'Next photograph', position: (n, total) => `Photograph ${n} of ${total}`, returnToCollection: 'Return to the collection', finish: 'Finish the visit',
    pages: (n, total) => `Page ${n} of ${total}`, pagePrevious: 'Previous page', pageNext: 'Next page', pageLabel: 'Permanent collection pages',
  },
  de: {
    title: 'Dauerhafte Sammlungen', lead: 'Ausstellungen, die die Saisons mit einer eigenen Sichtweise und Hängung weiterführen.', permanent: 'Dauerausstellung',
    empty: 'Zurzeit gibt es keine dauerhafte Sammlung zu entdecken.', back: 'Alle dauerhaften Sammlungen', exhibitions: 'Alle Ausstellungen', visit: 'Sammlung besuchen', start: 'Besuch beginnen',
    photographs: n => `${n} Fotografie${n > 1 ? 'n' : ''}`, images: 'Die Fotografien', noPhotos: 'Die Fotografien dieser Sammlung sind derzeit nicht verfügbar.',
    conclusion: 'Diese Sichtweise weiterdenken', returnToPhotos: 'Fotografien erneut ansehen', origin: 'Der Ursprung dieser Sammlung', fromExhibition: 'Ursprüngliche Ausstellung entdecken', fromReport: 'Ursprünglichen Rückblick lesen',
    previous: 'Vorherige Fotografie', next: 'Nächste Fotografie', position: (n, total) => `Fotografie ${n} von ${total}`, returnToCollection: 'Zurück zur Sammlung', finish: 'Besuch beenden',
    pages: (n, total) => `Seite ${n} von ${total}`, pagePrevious: 'Vorherige Seite', pageNext: 'Nächste Seite', pageLabel: 'Seiten der dauerhaften Sammlungen',
  },
};
const PAGE_SIZE = 12;

export function registerCollectionPages(app, { lang, repo, base, service = null }) {
  const c = service || createCollectionsPubliques({ bilans: app.saisonsBilans, repo, storageDir: app.config.storageDir, expositions: app.expositions });
  const x = COLLECTION_UI[lang], u = p => localize(p, lang);
  const open = request => usesV2(app.publicVersion.forRequest(request, 'expositions').version);
  const og = p => p ? `/media/${variantName(p.file, widthsFor(p.width).at(-1), 'webp', p.variant_key)}` : undefined;
  const render = (request, reply, template, collection, data = {}) => {
    reply.header('cache-control', 'no-store');
    return reply.render(template, { ...base, x, collection, expositionsCss: true, siteName: app.siteName(),
      pageTitle: `${collection ? collection.title : x.title} · ${app.siteName()}`, description: collection?.intro || x.lead,
      canonical: collection ? `/collection/${collection.slug}` : '/collections', ogImage: og(collection?.cover), ...data });
  };
  app.get('/collections', async (request, reply) => {
    if (!open(request)) return reply.callNotFound();
    const raw = request.query.page;
    if (raw != null && (typeof raw !== 'string' || !/^[1-9]\d{0,5}$/.test(raw))) return reply.callNotFound();
    const page = raw == null ? 1 : Number(raw), pages = Math.max(1, Math.ceil(c.count() / PAGE_SIZE));
    if (page > pages) return reply.callNotFound();
    app.stats.hit(request, { page: 'collections' });
    return render(request, reply, 'collections', null, { list: c.list({ lang, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), page, pages,
      canonical: page === 1 ? '/collections' : `/collections?page=${page}`,
      prevHref: page > 1 ? u(page === 2 ? '/collections' : `/collections?page=${page - 1}`) : null,
      nextHref: page < pages ? u(`/collections?page=${page + 1}`) : null });
  });
  app.get('/collection/:slug', async (request, reply) => {
    if (!open(request)) return reply.callNotFound();
    const collection = c.bySlug(request.params.slug, { lang });
    if (!collection) return reply.callNotFound();
    app.stats.hit(request, { page: `collection:${collection.slug}` });
    return render(request, reply, 'collection', collection);
  });
  app.get('/collection/:slug/photo/:photoSlug', async (request, reply) => {
    if (!open(request)) return reply.callNotFound();
    const found = c.photo(request.params.slug, request.params.photoSlug, { lang });
    if (!found) return reply.callNotFound();
    app.stats.hit(request, { page: `collection:${found.collection.slug}`, photo: found.photo.id });
    return render(request, reply, 'collection-photo', found.collection, { ...found,
      pageTitle: `${found.photo.title} · ${found.collection.title} · ${app.siteName()}`,
      canonical: `/collection/${found.collection.slug}/photo/${found.photo.slug}`, description: found.photo.cartel || found.photo.legend || found.collection.intro,
      ogImage: og(found.photo), photoHref: p => u(`/collection/${found.collection.slug}/photo/${p.slug}`) });
  });
}
