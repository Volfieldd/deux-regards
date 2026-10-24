import { usesV2 } from '../version-publique.js';
import { localize } from '../i18n.js';
import { variantName, widthsFor } from '../images.js';
import { createSaisonsPubliques } from '../saisons-publiques.js';

// Saisons S2 : visite libre, annonce par couverture et archive de douze mois. Les nouveaux parcours restent dans
// les présentations v2/v3 ; les liens d’une photographie conservent toujours leur exposition d’origine.
export const EXPOSITION_UI = {
  fr: {
    title: 'Expositions', signature: 'Les saisons', lead: 'Des photographies réunies autour d’un regard commun, le temps d’une exposition.',
    empty: 'Aucune exposition à découvrir pour le moment.', states: { annonce: 'À venir', ouverte: 'En cours', archive: 'Archive', bilan: 'Bilan' },
    dates: 'Dates de l’exposition', opens: 'Ouverture', closes: 'Clôture', archiveUntil: 'Archive complète jusqu’au',
    announcement: 'La couverture annonce la prochaine exposition. La visite ouvrira à la date indiquée.',
    enter: 'Visiter l’exposition', preview: 'Découvrir l’annonce', visitArchive: 'Consulter l’exposition archivée', start: 'Commencer la visite', back: 'Toutes les expositions', home: 'Accueil',
    photographs: n => `${n} photographie${n > 1 ? 's' : ''}`, images: 'L’accrochage', read: 'Découvrir l’exposition',
    noPhotos: 'Certaines photographies ne sont plus disponibles. Retrouvez ici les œuvres encore visibles.',
    conclusion: 'Pour prolonger ce regard', toConclusion: 'Lire la conclusion', returnToPhotos: 'Revoir l’accrochage',
    completed: 'L’exposition est close. Son accrochage reste accessible pendant la période d’archive.',
    archiveEnded: 'La période de consultation de l’accrochage est terminée. Cette page conserve le bilan de l’exposition.',
    report: 'Bilan de l’exposition', pending: 'Le bilan est en préparation.',
    previous: 'Photo précédente', next: 'Photo suivante', position: (n, total) => `Photographie ${n} sur ${total}`,
    returnToExposition: 'Revenir à l’exposition', finish: 'Terminer la visite', photographer: 'Photographe',
    pages: (n, total) => `Page ${n} sur ${total}`, pagePrevious: 'Page précédente', pageNext: 'Page suivante', pageLabel: 'Pages des expositions',
  },
  en: {
    title: 'Exhibitions', signature: 'The seasons', lead: 'Photographs brought together by a shared perspective for the duration of an exhibition.',
    empty: 'There are no exhibitions to discover at the moment.', states: { annonce: 'Coming soon', ouverte: 'Now open', archive: 'Archive', bilan: 'Retrospective' },
    dates: 'Exhibition dates', opens: 'Opening', closes: 'Closing', archiveUntil: 'Full archive available until',
    announcement: 'The cover announces the next exhibition. The visit will open on the date shown.',
    enter: 'Visit the exhibition', preview: 'View the announcement', visitArchive: 'View the archived exhibition', start: 'Start the visit', back: 'All exhibitions', home: 'Home',
    photographs: n => `${n} photograph${n > 1 ? 's' : ''}`, images: 'The photographs', read: 'Discover the exhibition',
    noPhotos: 'Some photographs are no longer available. The works still on display can be found here.',
    conclusion: 'Continuing this perspective', toConclusion: 'Read the conclusion', returnToPhotos: 'View the photographs again',
    completed: 'The exhibition has closed. Its photographs remain available during the archive period.',
    archiveEnded: 'The period for viewing the photographs has ended. This page retains the exhibition retrospective.',
    report: 'Exhibition retrospective', pending: 'The retrospective is being prepared.',
    previous: 'Previous photograph', next: 'Next photograph', position: (n, total) => `Photograph ${n} of ${total}`,
    returnToExposition: 'Return to the exhibition', finish: 'Finish the visit', photographer: 'Photographer',
    pages: (n, total) => `Page ${n} of ${total}`, pagePrevious: 'Previous page', pageNext: 'Next page', pageLabel: 'Exhibition pages',
  },
  de: {
    title: 'Ausstellungen', signature: 'Die Saisons', lead: 'Fotografien, die für die Dauer einer Ausstellung eine gemeinsame Sichtweise verbindet.',
    empty: 'Zurzeit gibt es keine Ausstellung zu entdecken.', states: { annonce: 'Demnächst', ouverte: 'Geöffnet', archive: 'Archiv', bilan: 'Rückblick' },
    dates: 'Ausstellungszeiten', opens: 'Eröffnung', closes: 'Ende', archiveUntil: 'Vollständiges Archiv bis',
    announcement: 'Das Titelbild kündigt die nächste Ausstellung an. Der Besuch beginnt zum angegebenen Zeitpunkt.',
    enter: 'Ausstellung besuchen', preview: 'Ankündigung ansehen', visitArchive: 'Archivierte Ausstellung ansehen', start: 'Besuch beginnen', back: 'Alle Ausstellungen', home: 'Startseite',
    photographs: n => `${n} Fotografie${n > 1 ? 'n' : ''}`, images: 'Die Fotografien', read: 'Ausstellung entdecken',
    noPhotos: 'Einige Fotografien sind nicht mehr verfügbar. Die weiterhin sichtbaren Werke finden Sie hier.',
    conclusion: 'Diese Sichtweise weiterdenken', toConclusion: 'Schlusswort lesen', returnToPhotos: 'Fotografien erneut ansehen',
    completed: 'Die Ausstellung ist beendet. Ihre Fotografien bleiben während der Archivzeit verfügbar.',
    archiveEnded: 'Die Betrachtungszeit für die Fotografien ist abgelaufen. Diese Seite bewahrt den Rückblick auf die Ausstellung.',
    report: 'Rückblick auf die Ausstellung', pending: 'Der Rückblick wird vorbereitet.',
    previous: 'Vorherige Fotografie', next: 'Nächste Fotografie', position: (n, total) => `Fotografie ${n} von ${total}`,
    returnToExposition: 'Zurück zur Ausstellung', finish: 'Besuch beenden', photographer: 'Fotograf',
    pages: (n, total) => `Seite ${n} von ${total}`, pagePrevious: 'Vorherige Seite', pageNext: 'Nächste Seite', pageLabel: 'Ausstellungsseiten',
  },
};
const LOCALES = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' };
const PAGE_SIZE = 12;
export const expositionOpen = (app, request) => usesV2(app.publicVersion.forRequest(request, 'expositions').version);

export function registerExpositionPages(app, { lang, repo, base, service = app.expositions }) {
  const e = service || createSaisonsPubliques({ saisons: app.saisons, repo, readiness: app.readiness, storageDir: app.config.storageDir });
  const x = EXPOSITION_UI[lang], u = path => localize(path, lang);
  const date = at => `${new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(at)} UTC`;
  const og = p => p ? `/media/${variantName(p.file, widthsFor(p.width).at(-1), 'webp', p.variant_key)}` : undefined;
  const render = (request, reply, template, exposition, data = {}) => {
    // Les bornes temporelles et retraits sont revérifiés à chaque requête : aucun HTML d’annonce ou d’archive
    // n’est conservé par un cache partagé au-delà de l’instant où il change de visibilité.
    reply.header('cache-control', 'no-store');
    return reply.render(template, { ...base, x, date, exposition, expositionsCss: true, siteName: app.siteName(),
      pageTitle: `${exposition ? exposition.title : x.title} · ${app.siteName()}`, description: exposition?.intro || x.lead,
      canonical: exposition ? `/exposition/${exposition.slug}` : '/expositions', ogImage: og(exposition?.cover), ...data });
  };

  app.get('/expositions', async (request, reply) => {
    if (!expositionOpen(app, request)) return reply.callNotFound();
    const raw = request.query.page;
    if (raw != null && (typeof raw !== 'string' || !/^[1-9]\d{0,5}$/.test(raw))) return reply.callNotFound();
    const page = raw == null ? 1 : Number(raw), all = e.list({ lang });
    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    if (page > pages) return reply.callNotFound();
    app.stats.hit(request, { page: 'expositions' });
    return render(request, reply, 'expositions', null, { list: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages,
      canonical: page === 1 ? '/expositions' : `/expositions?page=${page}`,
      prevHref: page > 1 ? u(page === 2 ? '/expositions' : `/expositions?page=${page - 1}`) : null,
      nextHref: page < pages ? u(`/expositions?page=${page + 1}`) : null });
  });

  app.get('/exposition/:slug', async (request, reply) => {
    if (!expositionOpen(app, request)) return reply.callNotFound();
    const exposition = e.bySlug(request.params.slug, { lang });
    if (!exposition) return reply.callNotFound();
    app.stats.hit(request, { page: `exposition:${exposition.slug}` });
    return render(request, reply, 'exposition', exposition);
  });

  app.get('/exposition/:slug/photo/:photoSlug', async (request, reply) => {
    if (!expositionOpen(app, request)) return reply.callNotFound();
    const found = e.photo(request.params.slug, request.params.photoSlug, { lang });
    if (!found) return reply.callNotFound();
    app.stats.hit(request, { page: `exposition:${found.exposition.slug}`, photo: found.photo.id });
    return render(request, reply, 'exposition-photo', found.exposition, { ...found,
      pageTitle: `${found.photo.title} · ${found.exposition.title} · ${app.siteName()}`,
      canonical: `/exposition/${found.exposition.slug}/photo/${found.photo.slug}`, description: found.photo.cartel || found.photo.legend || found.exposition.intro,
      ogImage: og(found.photo), photoHref: p => u(`/exposition/${found.exposition.slug}/photo/${p.slug}`) });
  });
}
