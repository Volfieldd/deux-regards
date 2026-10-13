// Site public en trois langues : français (à la racine), anglais (/en/…) et allemand (/de/…).
//   - Textes de l'interface : ci-dessous (aucune traduction automatique).
//   - Textes des auteurs (réglages, séries, biographies, photos) : champs facultatifs « _en » / « _de » ; vide, on se
//     replie sur une autre langue (FALLBACK) pour ne jamais afficher de trou.
//   - Langue d'un visiteur arrivant sur une page française : celle qu'il a choisie avec le sélecteur (cookie « langue »,
//     posé seulement à ce moment-là), sinon d'après son pays (Cloudflare) et la langue de son navigateur (detectLang).

export const LANGS = ['fr', 'en', 'de'];
export const PREFIX = { fr: '', en: '/en', de: '/de' };
export const NAMES = { fr: 'Français', en: 'English', de: 'Deutsch' };
export const LOCALES = { fr: 'fr_FR', en: 'en_GB', de: 'de_DE' };
// Page en allemand : allemand, sinon français, sinon anglais ; en anglais : anglais, puis français ; en français :
// français, puis anglais (une photo décrite seulement en anglais s'affiche en anglais partout).
export const FALLBACK = { fr: ['fr', 'en', 'de'], en: ['en', 'fr', 'de'], de: ['de', 'fr', 'en'] };

const column = (field, lang) => (lang === 'fr' ? field : `${field}_${lang}`);
// Valeur d'un champ traduisible (ligne de la base ou réglages) dans la langue voulue, avec repli.
export function pick(row, field, lang) {
  for (const l of FALLBACK[lang] || FALLBACK.fr) {
    const v = row?.[column(field, l)];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

// Adresse d'une page dans une langue (chemin français, préfixe ajouté) ; et l'inverse.
export const localize = (path, lang) => `${PREFIX[lang] || ''}${path}` || '/';
export function splitLang(url) {
  const m = /^\/(en|de)(?=\/|\?|$)(.*)$/.exec(url);
  if (!m) return { lang: 'fr', path: url || '/' };
  const rest = m[2] || '/';
  return { lang: m[1], path: rest.startsWith('/') ? rest : `/${rest}` };
}

// ---------- langue d'un visiteur ----------
// Pays de langue française, puis allemande ; dans les pays à plusieurs langues, la langue du navigateur départage
// (Suisse alémanique : allemand ; Belgique néerlandophone : anglais).
const FRANCOPHONE = new Set(['FR', 'MC', 'GP', 'MQ', 'GF', 'RE', 'YT', 'PM', 'BL', 'MF', 'WF', 'PF', 'NC', 'HT',
  'SN', 'CI', 'ML', 'BF', 'NE', 'TG', 'BJ', 'GA', 'CG', 'CD', 'CM', 'MG', 'DJ', 'KM', 'GN', 'TD', 'CF', 'BI', 'RW']);
const GERMANOPHONE = new Set(['DE', 'AT', 'LI']);
const SEVERAL = { BE: ['fr', 'de'], CH: ['de', 'fr'], LU: ['fr', 'de'], CA: ['fr'], MA: ['fr'], DZ: ['fr'], TN: ['fr'] };

// « de-CH,de;q=0.9,en;q=0.8 » → ['de', 'de', 'en'] (dans l'ordre de préférence).
export function browserLangs(header) {
  return String(header || '').split(',').map(part => {
    const [tag, ...params] = part.trim().split(';');
    const q = Number((params.find(p => p.trim().startsWith('q=')) || 'q=1').trim().slice(2));
    return { lang: tag.trim().slice(0, 2).toLowerCase(), q: Number.isFinite(q) ? q : 0 };
  }).filter(x => x.lang && x.q > 0).sort((a, b) => b.q - a.q).map(x => x.lang);
}

export function detectLang({ country = 'XX', acceptLanguage = '' } = {}) {
  const c = String(country || 'XX').toUpperCase();
  if (FRANCOPHONE.has(c)) return 'fr';
  if (GERMANOPHONE.has(c)) return 'de';
  const prefs = browserLangs(acceptLanguage);
  if (SEVERAL[c]) return prefs.find(l => SEVERAL[c].includes(l)) || 'en';
  if (c === 'XX') return prefs.find(l => LANGS.includes(l)) || 'en';
  return 'en';
}

// ---------- textes de l'interface ----------
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
export const UI = {
  fr: {
    nav: { series: 'Séries', gallery: 'Galerie', map: 'Carte', about: 'À propos', label: 'Navigation', lang: 'Langue', langCurrent: 'Langue : français' },
    footer: { photos: 'Photographies', noRepro: 'reproduction interdite', rights: 'Droits d’utilisation' },
    both: 'Les deux', colon: ' :',
    photos: n => plural(n, 'photo', 'photos'),
    places: n => plural(n, 'lieu', 'lieux'),
    by: name => `par ${name}`,
    photographer: 'Photographe',
    removeFilter: '(retirer le filtre)',
    allSeries: 'Toutes les séries',
    views: 'vues',
    showAll: 'tout afficher',
    order: 'Ordre des photos', orderLabel: 'Ordre :', selection: 'Sélection', recent: 'Plus récentes',
    emptyGallery: 'Aucune photo pour ce regard dans cette série.',
    seePhoto: 'Voir la photo', pause: 'Pause', play: 'Lecture',
    close: 'Fermer', photosNav: 'Photos', prev: t => `Photo précédente : ${t}`, next: t => `Photo suivante : ${t}`,
    more: 'Lire la suite', less: 'Réduire',
    seePhotosOf: 'Voir ses photos',
    notFound: 'Cette page n’existe pas, ou la photo a été retirée.', notFoundTitle: 'Page introuvable', backHome: 'Revenir à la galerie',
    map: {
      title: 'Carte', none: 'Aucune photo sur la carte pour l’instant', soon: 'Les lieux arrivent bientôt.',
      svgTitle: 'Carte du monde des lieux de prise de vue', zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', world: 'Monde',
      help: 'Pincez ou Ctrl + molette pour zoomer, glissez pour vous déplacer.', base: 'Fond de carte : Natural Earth',
      cluster: (name, others, n) => `${name} et ${others} autre${others > 1 ? 's' : ''} lieu${others > 1 ? 'x' : ''} : ${n} photos. Agrandir`,
      description: names => `Les lieux des photos : ${names}`,
      credit: 'Villes : GeoNames (geonames.org), licence CC BY 4.0',
    },
  },
  en: {
    nav: { series: 'Series', gallery: 'Gallery', map: 'Map', about: 'About', label: 'Navigation', lang: 'Language', langCurrent: 'Language: English' },
    footer: { photos: 'Photographs', noRepro: 'all rights reserved', rights: 'Terms of use' },
    both: 'Both', colon: ':',
    photos: n => plural(n, 'photo', 'photos'),
    places: n => plural(n, 'place', 'places'),
    by: name => `by ${name}`,
    photographer: 'Photographer',
    removeFilter: '(remove filter)',
    allSeries: 'All series',
    views: 'shown',
    showAll: 'show all',
    order: 'Photo order', orderLabel: 'Order:', selection: 'Selection', recent: 'Most recent',
    emptyGallery: 'No photo by this photographer in this series.',
    seePhoto: 'View photo', pause: 'Pause', play: 'Play',
    close: 'Close', photosNav: 'Photos', prev: t => `Previous photo: ${t}`, next: t => `Next photo: ${t}`,
    more: 'Read more', less: 'Show less',
    seePhotosOf: 'See the photos',
    notFound: 'This page does not exist, or the photo has been removed.', notFoundTitle: 'Page not found', backHome: 'Back to the gallery',
    map: {
      title: 'Map', none: 'No photo on the map yet', soon: 'Places are coming soon.',
      svgTitle: 'World map of the places where the photos were taken', zoomIn: 'Zoom in', zoomOut: 'Zoom out', world: 'World',
      help: 'Pinch or Ctrl + scroll to zoom, drag to move.', base: 'Base map: Natural Earth',
      cluster: (name, others, n) => `${name} and ${others} other place${others > 1 ? 's' : ''}: ${n} photos. Zoom in`,
      description: names => `Where the photos were taken: ${names}`,
      credit: 'Cities: GeoNames (geonames.org), CC BY 4.0 licence',
    },
  },
  de: {
    nav: { series: 'Serien', gallery: 'Galerie', map: 'Karte', about: 'Über uns', label: 'Navigation', lang: 'Sprache', langCurrent: 'Sprache: Deutsch' },
    footer: { photos: 'Fotografien', noRepro: 'alle Rechte vorbehalten', rights: 'Nutzungsrechte' },
    both: 'Beide', colon: ':',
    photos: n => plural(n, 'Foto', 'Fotos'),
    places: n => plural(n, 'Ort', 'Orte'),
    by: name => `von ${name}`,
    photographer: 'Fotograf',
    removeFilter: '(Filter entfernen)',
    allSeries: 'Alle Serien',
    views: 'angezeigt',
    showAll: 'alle anzeigen',
    order: 'Reihenfolge der Fotos', orderLabel: 'Reihenfolge:', selection: 'Auswahl', recent: 'Neueste',
    emptyGallery: 'Kein Foto dieses Fotografen in dieser Serie.',
    seePhoto: 'Foto ansehen', pause: 'Pause', play: 'Abspielen',
    close: 'Schließen', photosNav: 'Fotos', prev: t => `Vorheriges Foto: ${t}`, next: t => `Nächstes Foto: ${t}`,
    more: 'Weiterlesen', less: 'Weniger',
    seePhotosOf: 'Fotos ansehen',
    notFound: 'Diese Seite existiert nicht, oder das Foto wurde entfernt.', notFoundTitle: 'Seite nicht gefunden', backHome: 'Zurück zur Galerie',
    map: {
      title: 'Karte', none: 'Noch kein Foto auf der Karte', soon: 'Die Orte folgen in Kürze.',
      svgTitle: 'Weltkarte der Aufnahmeorte', zoomIn: 'Vergrößern', zoomOut: 'Verkleinern', world: 'Welt',
      help: 'Zum Zoomen mit zwei Fingern ziehen oder Strg + Mausrad, zum Verschieben ziehen.', base: 'Kartengrundlage: Natural Earth',
      cluster: (name, others, n) => `${name} und ${others} weitere${others > 1 ? '' : 'r'} Ort${others > 1 ? 'e' : ''}: ${n} Fotos. Vergrößern`,
      description: names => `Die Aufnahmeorte: ${names}`,
      credit: 'Orte: GeoNames (geonames.org), Lizenz CC BY 4.0',
    },
  },
};
