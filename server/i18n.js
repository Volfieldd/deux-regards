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
// Pluriel : en français, 0 et 1 au singulier ; en anglais et en allemand, 1 seulement (« 0 photos », « 0 Fotos »).
// n peut être complété par des zéros (« 05 ») : lu comme un nombre.
const plural = (n, one, many) => `${n} ${Number(n) >= 2 ? many : one}`;
const pluralOne = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;
export const UI = {
  fr: {
    nav: { series: 'Séries', gallery: 'Galerie', map: 'Carte', trips: 'Voyages', about: 'À propos', search: 'Rechercher', label: 'Navigation', lang: 'Langue', langCurrent: 'Langue : français' },
    fb: {
      like: 'J’aime', unlike: 'Je n’aime plus', likes: n => `${n} j’aime`, report: 'Signaler',
      reportTitle: 'Signaler cette photo', reportIntro: title => `À propos de « ${title} ». Votre message nous arrive directement ; nous le lisons tous.`,
      me: 'Vous êtes sur cette photo ? Pour la recevoir, donner ou refuser votre accord :', meLink: 'Je vous ai photographié',
      kind: 'Que voulez-vous nous dire ?', kinds: { inapproprie: 'Cette photo ne devrait pas être en ligne', texte: 'Une suggestion pour le texte (titre, légende, lieu)', autre: 'Autre chose' },
      message: 'Votre message', messageHint: 'nécessaire pour une suggestion', email: 'Votre e-mail', emailHint: 'facultatif, seulement si vous voulez une réponse',
      send: 'Envoyer', back: 'Retour à la photo', thanks: 'Merci, votre message est bien arrivé.',
      privacy: 'Votre message et votre adresse ne servent qu’à traiter ce signalement ; ils sont effacés au bout de 12 mois.',
      errors: { kind: 'Choisissez ce que vous voulez nous dire.', message: 'Écrivez quelques mots.', email: 'Cette adresse e-mail n’est pas valide.', limit: 'Trop de messages : réessayez dans une heure.' },
    },
    share: { button: 'Partager', title: 'Partager', close: 'Fermer', copy: 'Copier', copyLink: 'Copier le lien', copied: '✓ Lien copié', instagram: 'Voir sur Instagram', more: 'Plus…', newWindow: ' (nouvelle fenêtre)', email: 'E-mail', link: 'Lien de la photo', back: 'Retour à la photo',
      qr: 'Scannez pour l’ouvrir sur votre téléphone, ou montrez-le à quelqu’un à côté de vous.' },
    footer: { photos: 'Photographies', noRepro: 'reproduction interdite', rights: 'Droits d’utilisation', privacy: 'Confidentialité', legal: 'Mentions légales' },
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
    app: {
      consentTitle: 'Votre accord', consent: name => `J’autorise l’usage artistique et la publication des photos que ${name} a prises de moi aujourd’hui. Une photo de moi peut être jointe à cet accord. Je peux changer d’avis à tout moment.`,
      accept: 'J’accepte, pour :', refuse: 'Je refuse que ces photos soient publiées', later: 'Je ne décide pas maintenant',
      adult: 'J’ai 18 ans ou plus', minor: 'J’ai moins de 18 ans : un parent signe avec moi', guardian: 'Nom du parent',
      sign: 'Signez ici avec le doigt', clear: 'Effacer', name: 'Prénom et nom', email: 'E-mail (facultatif)',
      // Sous la question restée sans réponse, après un envoi refusé (app de terrain, views/admin/app.eta).
      errAdult: 'Répondez à cette question : avez-vous 18 ans ou plus ?', errDecision: 'Choisissez une réponse : j’accepte, je refuse, ou laissez votre e-mail pour recevoir la photo.',
      privacy: host => `Vos données (nom, e-mail, signature, photo de vous, lieu) servent seulement à gérer votre accord et à vous envoyer votre photo. Durées et droits : ${host}/confidentialite.`,
      thanks: 'Merci !', scan: 'Scannez ce code avec votre téléphone : vous y retrouverez votre page pour recevoir votre photo, changer d’avis ou nous écrire.',
      mailSubject: site => `Votre accord · ${site}`,
      mail: ({ name, date, place, accepted, refused, link, author }) => `Bonjour${name ? ` ${name}` : ''},\n\nMerci pour notre rencontre${date ? ` du ${date}` : ''}${place ? ` à ${place}` : ''}.\n\n${refused ? 'Vous avez refusé que vos photos soient publiées : c’est noté, elles ne le seront pas.' : accepted ? `Vous avez accepté leur publication : ${accepted}.` : 'Vous n’avez pas encore décidé si vos photos peuvent être publiées.'}\n\nVous pouvez recevoir votre photo, changer d’avis à tout moment ou nous écrire ici :\n${link}\n\n${author}`,
    },
    gift: {
      title: 'Votre photo', text: 'Merci pour ce moment. Voici votre photo, rien que pour vous.',
      download: 'Télécharger la photo', format: 'JPEG, 2048 px',
      personal: 'Pour votre usage personnel : la garder, la partager avec vos proches, l’imprimer chez vous. Pour toute autre utilisation, écrivez-nous.',
      until: date => `Lien valable jusqu’au ${date}.`, by: name => `Photo de ${name}`,
      expired: 'Ce lien a expiré', expiredText: 'Les liens restent valables 30 jours. Écrivez-nous et nous vous en enverrons un nouveau.', contact: 'Nous écrire',
      mailSubject: site => `Votre photo · ${site}`,
      mail: ({ name, link, date, author }) => `Bonjour${name ? ` ${name}` : ''},\n\nMerci encore pour ce moment. Voici votre photo, rien que pour vous :\n${link}\n\nLe lien est valable jusqu’au ${date}.\n\n${author}`,
    },
    hello: {
      title: 'Bonjour !', pageTitle: 'Je vous ai photographié',
      intro: 'Vous avez croisé un photographe de {site} et il vous a peut-être pris en photo. Cette photo vous concerne : vous décidez de ce qu’elle devient.',
      introWho: name => `Vous avez croisé ${name} et il vous a peut-être pris en photo. Cette photo vous concerne : vous décidez de ce qu’elle devient.`,
      card: 'Votre carte', refLabel: 'Référence de la carte', refHint: 'Par exemple J-0142 (en bas de la carte).',
      cardOk: name => `Carte de ${name} : merci de l’avoir gardée.`, cardUnverified: 'Référence notée.',
      noCard: 'Pas de carte ? Dites-nous quand et où',
      metOn: 'Date', metTime: 'Vers quelle heure', place: 'Lieu', placeHint: 'Ville, rue, quartier…', details: 'Un détail pour vous reconnaître', detailsHint: 'Une veste rouge, un vélo, un chien…',
      wish: 'Ce que vous souhaitez', wantsPhoto: 'Recevoir la photo par e-mail',
      decision: 'Publication de la photo', undecided: 'Je ne sais pas encore', agree: 'J’accepte qu’elle soit publiée :', refuse: 'Je refuse qu’elle soit publiée',
      scopes: { site: 'sur le site', instagram: 'sur Instagram (avec le site)', print: 'en exposition et en tirage', name: 'avec mon prénom' },
      rightsLegend: 'Vos données', rightsNone: 'Rien de plus', rightsAccess: 'Recevoir une copie de toutes mes données', rightsErase: 'Effacer toutes mes données (et, si je le demande dans le message, les photos où j’apparais)',
      message: 'Un message (facultatif)', contact: 'Vous joindre', email: 'Votre e-mail', name: 'Votre prénom ou nom',
      privacy: 'Votre adresse sert seulement à vous répondre et à vous envoyer votre photo. Sans accord ni refus, votre demande est effacée au bout de 12 mois. Vous pouvez changer d’avis à tout moment en revenant sur cette page.',
      send: 'Envoyer', errorsTitle: 'Le formulaire est incomplet :',
      errors: {
        ref: 'Référence illisible : une lettre et un numéro, comme sur la carte (J-0142).', code: 'Le code de la carte ne correspond pas : vérifiez la référence (ou laissez seulement la lettre et le numéro).',
        where: 'Sans carte, indiquez au moins la date et le lieu, pour que nous retrouvions la photo.', scopes: 'Cochez au moins un usage que vous acceptez.', instagram: 'Instagram suppose le site : cochez aussi le site, ou décochez Instagram.',
        email: 'Adresse e-mail invalide.', email_required: 'Indiquez votre e-mail, pour que nous puissions vous répondre.', name: 'Indiquez votre prénom ou nom avec votre accord.',
        what: 'Dites-nous ce que vous souhaitez : recevoir la photo, accepter ou refuser sa publication, une demande sur vos données, ou un message.', limit: 'Trop de demandes depuis votre connexion : réessayez dans une heure.',
      },
      thanks: 'Merci, c’est noté.', thanksText: 'Le photographe vous répond par e-mail, en général sous quelques jours. Vous pouvez revenir sur cette page à tout moment pour changer d’avis.',
      thanksRef: ref => `Votre référence : ${ref}.`, back: 'Voir les photos du site',
    },
    // Site public v2 : pages à formulaire (/bonjour, Signaler, Partager, photo offerte ; maquettes MQ-05 et MQ-00). Les
    // champs, leurs libellés et les messages d'erreur de la v1 (hello, fb) sont repris ; ici, ce que la v2 sépare ou ajoute :
    // l'aide sous le libellé, la règle d'obligation, le résumé des erreurs, le titre de l'onglet en erreur.
    v2form: {
      required: 'Tous les champs sont obligatoires, sauf mention «\u202ffacultatif\u202f».', optional: '(facultatif)', error: 'Erreur\u202f:',
      points: n => `${n} points à corriger`, titleError: what => `Erreur\u202f: ${what}`, sent: 'Envoyé.',
      limitTitle: 'Envoi suspendu un moment', limitKept: 'Ce que vous avez saisi est gardé.',
      // Nom court du champ en erreur, pour le titre de l'onglet (« Erreur : votre e-mail · … »).
      fields: { ref: 'référence de la carte', where: 'date et lieu', what: 'ce que vous souhaitez', scopes: 'publication de la photo', email: 'votre e-mail', name: 'votre prénom ou nom',
        kind: 'ce que vous voulez nous dire', message: 'votre message' },
      errors: { email: 'Adresse e-mail invalide\u202f: écrivez-la sous la forme nom@domaine.fr.' },
      hello: {
        label: 'Votre photo', cardHelp: 'La référence est en bas de la carte que le photographe vous a donnée. Pas de carte\u202f? Dites-nous plutôt quand et où.',
        refHint: 'Une lettre et un numéro, par exemple J-0142.', metTimeHint: 'Par exemple 18\u00a0h.', placeHint: 'Ville, rue, quartier.',
        wishHelp: 'Au moins un choix\u202f: recevoir la photo, décider de sa publication, une demande sur vos données, ou un message.',
        decisionHelp: 'Vous pourrez changer d’avis à tout moment.', rightsLink: 'Vos droits sur vos données', message: 'Un message',
        emailHint: 'Pour vous envoyer la photo et vous répondre\u202f; jamais pour autre chose. Seul un refus peut rester sans adresse.',
        nameHint: 'Nécessaire si vous acceptez une publication.', sendNote: 'Le photographe vous répond par e-mail, en général sous quelques jours.',
        nextTitle: 'Ce qui se passe ensuite',
        next: ['Le photographe retrouve la photo grâce à la référence de la carte, ou à la date et au lieu.', 'Il vous répond par e-mail, en général sous quelques jours, avec la photo si vous l’avez demandée.',
          'Vous pouvez changer d’avis à tout moment\u202f: revenez sur cette page.'],
        sentRef: 'Référence de la carte',
      },
      report: { label: 'Signaler', messageHint: 'Nécessaire pour une suggestion ou pour «\u202fautre chose\u202f».', emailHint: 'Seulement si vous voulez une réponse.' },
    },
    trips: {
      title: 'Voyages', description: names => `Les voyages : ${names}`, descriptionOne: (name, span) => `${name}, ${span}`,
      span: (a, b) => `du ${a} au ${b}`, days: n => `${n} jour${n > 1 ? 's' : ''}`, day: n => `Jour ${n}`, short: n => `J${n}`,
      map: name => `Itinéraire du voyage « ${name} »`, stop: (n, when, city) => `Étape ${n}, ${when} : ${city}`, open: 'Voir le voyage',
      by: names => `par ${names}`, story: 'Jour après jour', back: 'Tous les voyages',
      preview: 'Aperçu réservé à l’équipe : ce voyage n’est pas publié (ou n’a pas encore de photo publiée). Les visiteurs ne le voient pas.', settings: 'Régler le voyage',
    },
    near: {
      title: 'À proximité', map: city => `Carte : la photo a été prise à ${city}`, here: city => `Prise à ${city}`, same: 'même ville',
      km: n => `${n} km`, more: n => `${n} photo${n > 1 ? 's' : ''} à proximité`, others: (city, n) => `${city} : ${n} photo${n > 1 ? 's' : ''}`, world: 'Voir la carte du monde',
    },
    // Site public v2 (views/v2/) : mots du lexique de l'audit d'ergonomie (docs/audit-ergonomie-2026-10-16/maquettes/LEXIQUE-ET-DONNEES.md).
    v2: {
      skip: 'Aller au contenu', menu: 'Menu', home: 'Accueil', homeOf: site => `${site}, accueil`, back: 'Retour\u202f: ',
      prev: 'Précédente', next: 'Suivante', photosOf: ctx => `Photos\u202f: ${ctx}`,
      placeDate: 'Lieu et date', placeDateTime: 'Lieu, date et heure', serie: 'Série', photographer: 'Photographe',
      keys: 'Clavier', keysPrevNext: 'précédente, suivante', keyEsc: 'Échap', keysBack: 'retour',
      fullscreen: 'Plein écran', quit: 'Quitter', fullscreenLabel: 'Photo en plein écran',
      rights: 'Droits et licences', rightsText: 'Pour la presse, une entreprise ou tout usage hors du cadre privé\u202f: nos conditions et comment nous écrire.',
      me: 'Vous êtes sur cette photo\u202f?', meLink: 'Recevez-la, ou donnez ou refusez votre accord',
      reportText: 'Une erreur dans le texte, une photo qui ne devrait pas être en ligne\u202f?', colon: '\u202f:',
      footerBrand: authors => `photographies de ${authors}`, footerNote: 'Toutes les images sont les nôtres et restent protégées par le droit d’auteur.',
      footerNav: 'Pied de page', footerSite: 'Le site',
      // Accueil, galerie et page d'une série (MQ-01 à MQ-03).
      navPhone: 'Navigation (téléphone)', and: ' et ', titleHome: (site, names) => `${site} — photographies de ${names}`,
      promiseSub: names => `Les photographies de ${names}.`, slideshow: 'diaporama',
      slidePoints: n => `Choisir une photo du diaporama, ${n} photos`, slidePoint: (i, n, title) => `Photo ${i} sur ${n}\u202f: ${title}`,
      play: 'Lire', playMore: ' le diaporama', pause: 'Pause',
      regards: n => (n === 2 ? 'Deux regards' : 'Les regards'), seeGallery: 'Voir la galerie', bothDesc: n => `${n} photos, dans l’ordre que nous avons choisi`,
      galleryLead: (n, names) => `Les ${n} photos publiées de ${names}. Choisissez un regard ou une série\u202f; chaque choix a sa propre adresse, à partager.`,
      regard: 'Regard', orderT: 'Ordre\u202f:', orderOurs: 'choisi par nous', orderOursCap: 'Choisi par nous', orderRecent: 'plus récentes d’abord', orderRecentCap: 'Plus récentes d’abord',
      orderLineOurs: 'ordre choisi par nous', orderLineRecent: 'plus récentes d’abord',
      gridAll: n => (n === 2 ? 'Les deux regards' : 'Toutes les photos'), gridAuthor: name => `Les photos de ${name}`, gridSerie: name => `La série ${name}`,
      count: (n, total) => (n === total || n === 0 ? (n >= 2 ? `${n} photos` : `${n} photo`) : `${n} sur ${total}`),
      shown: n => (n === 1 ? 'La photo est affichée.' : `Les ${n} photos sont affichées.`), seeSeries: n => `Voir les ${n} séries`, seeMap: 'Voir la carte',
      activeFilters: 'Filtres choisis', removeFilter: '\u202f: retirer ce filtre', noneOf: name => ` photo\u202f: aucune de ${name}`,
      emptyMsg: (name, serie) => `Aucune photo de ${name} dans la série ${serie}.`,
      emptySerie: (serie, n) => `Voir toute la série ${serie} (${n >= 2 ? `${n} photos` : `${n} photo`})`, emptyAuthor: (name, n) => `Voir les ${n} photos de ${name}`,
      breadcrumb: 'Fil d’Ariane', serieBrief: 'La série en bref', serieTitle: (name, names) => `${name} — série de ${names}`,
      seriePhotos: n => (n === 1 ? 'La photo' : `Les ${n} photos`), oneRegard: 'La même série, un seul regard', otherSeries: 'Autres séries',
    },
    search: {
      title: 'Rechercher', label: 'Mots-clés', placeholder: 'brume, Loire, portrait…', submit: 'Chercher',
      hint: 'Dans les titres, légendes, lieux, villes et régions, séries, photographes et mots-clés. Chaque mot doit être trouvé.', short: 'Tapez au moins deux lettres.',
      results: (n, q) => `${n} photo${n > 1 ? 's' : ''} pour « ${q} »`, none: q => `Aucune photo pour « ${q} ». Essayez un autre mot, ou moins de mots.`,
      description: 'Rechercher parmi les photos par mots-clés.', keywords: 'Mots-clés',
    },
    map: {
      title: 'Carte', none: 'Aucune photo sur la carte pour l’instant', soon: 'Les lieux arrivent bientôt.',
      svgTitle: 'Carte du monde des lieux de prise de vue', zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', world: 'Monde',
      help: 'Pincez ou Ctrl + molette pour zoomer, glissez pour vous déplacer.', base: 'Fond de carte : Natural Earth',
      cluster: (name, others, n) => `${name} et ${others} autre${others > 1 ? 's' : ''} lieu${others > 1 ? 'x' : ''} : ${n} photos. Agrandir`,
      description: names => `Les lieux des photos : ${names}`,
      credit: 'Villes : GeoNames (geonames.org), licence CC BY 4.0',
    },
    // Site public v2 : pages de texte, recherche, carte, voyages et page introuvable (views/v2/, mots du lexique de l'audit).
    pages: {
      toc: 'Sur cette page', toTop: 'Sommaire', contact: 'Nous écrire',
      people: 'Les photographes', seePhotos: name => `Voir les photos de ${name}`,
      searchHelp: 'Tapez un mot ou deux, puis Chercher.', browse: 'Ou parcourez les séries', allPhotos: 'Toutes les photos',
      searchResults: 'Résultats',
      places: 'Les lieux', placeOf: (n, name) => `${n === 1 ? 'La photo' : `Les ${n} photos`} prises à ${name}`, backToMap: 'Carte',
      mapHelp: 'Ctrl + molette ou les boutons pour zoomer, glisser pour vous déplacer. Au clavier, les flèches déplacent la carte.',
      mapHelpTouch: 'Pincez pour zoomer, glissez pour vous déplacer.',
      mapTools: 'Commandes de la carte', panW: 'Vers l’ouest', panE: 'Vers l’est', panN: 'Vers le nord', panS: 'Vers le sud',
      tripsLead: n => (n === 1 ? 'Un voyage, raconté jour après jour.' : `${n} voyages, racontés jour après jour.`),
      stops: 'Les étapes', stopsList: 'Les étapes du voyage', dayPhotos: n => (n === 1 ? '1 photo' : `${n} photos`),
      notFoundLead: 'L’adresse a peut-être changé. Voici où aller.', notFoundSearch: 'Chercher une photo',
    },
  },
  en: {
    nav: { series: 'Series', gallery: 'Gallery', map: 'Map', trips: 'Trips', about: 'About', search: 'Search', label: 'Navigation', lang: 'Language', langCurrent: 'Language: English' },
    fb: {
      like: 'Like', unlike: 'Unlike', likes: n => `${n} ${n === 1 ? 'like' : 'likes'}`, report: 'Report',
      reportTitle: 'Report this photo', reportIntro: title => `About “${title}”. Your message comes straight to us; we read every one.`,
      me: 'Are you in this photo? To receive it, or to give or refuse your consent:', meLink: 'I took your photo',
      kind: 'What would you like to tell us?', kinds: { inapproprie: 'This photo should not be online', texte: 'A suggestion for the text (title, caption, place)', autre: 'Something else' },
      message: 'Your message', messageHint: 'needed for a suggestion', email: 'Your email', emailHint: 'optional, only if you would like a reply',
      send: 'Send', back: 'Back to the photo', thanks: 'Thank you, your message has arrived.',
      privacy: 'Your message and your address are only used to deal with this report; they are deleted after 12 months.',
      errors: { kind: 'Choose what you would like to tell us.', message: 'Write a few words.', email: 'This email address is not valid.', limit: 'Too many messages: try again in an hour.' },
    },
    share: { button: 'Share', title: 'Share', close: 'Close', copy: 'Copy', copyLink: 'Copy link', copied: '✓ Link copied', instagram: 'View on Instagram', more: 'More…', newWindow: ' (new window)', email: 'Email', link: 'Photo link', back: 'Back to the photo',
      qr: 'Scan to open it on your phone, or show it to someone next to you.' },
    footer: { photos: 'Photographs', noRepro: 'all rights reserved', rights: 'Terms of use', privacy: 'Privacy', legal: 'Legal notice' },
    both: 'Both', colon: ':',
    photos: n => pluralOne(n, 'photo', 'photos'),
    places: n => pluralOne(n, 'place', 'places'),
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
    app: {
      consentTitle: 'Your consent', consent: name => `I agree to the artistic use and publication of the photos ${name} took of me today. A photo of me may be attached to this consent. I can change my mind at any time.`,
      accept: 'I agree, for:', refuse: 'I do not want these photos to be published', later: 'I won’t decide now',
      adult: 'I am 18 or older', minor: 'I am under 18: a parent signs with me', guardian: 'Parent’s name',
      sign: 'Sign here with your finger', clear: 'Clear', name: 'First and last name', email: 'Email (optional)',
      errAdult: 'Please answer this question: are you 18 or older?', errDecision: 'Please choose an answer: I agree, I refuse, or leave your email to receive the photo.',
      privacy: host => `Your data (name, email, signature, photo of you, place) is only used to manage your consent and send you your photo. Retention and rights: ${host}/en/confidentialite.`,
      thanks: 'Thank you!', scan: 'Scan this code with your phone: you will find your page to receive your photo, change your mind or write to us.',
      mailSubject: site => `Your consent · ${site}`,
      mail: ({ name, date, place, accepted, refused, link, author }) => `Hello${name ? ` ${name}` : ''},\n\nThank you for our meeting${date ? ` on ${date}` : ''}${place ? ` in ${place}` : ''}.\n\n${refused ? 'You do not want your photos to be published: noted, they will not be.' : accepted ? `You agreed to their publication: ${accepted}.` : 'You have not decided yet whether your photos may be published.'}\n\nYou can receive your photo, change your mind at any time or write to us here:\n${link}\n\n${author}`,
    },
    gift: {
      title: 'Your photo', text: 'Thank you for this moment. Here is your photo, just for you.',
      download: 'Download the photo', format: 'JPEG, 2048 px',
      personal: 'For your personal use: keep it, share it with your friends and family, print it at home. For any other use, please write to us.',
      until: date => `Link valid until ${date}.`, by: name => `Photo by ${name}`,
      expired: 'This link has expired', expiredText: 'Links are valid for 30 days. Write to us and we will send you a new one.', contact: 'Write to us',
      mailSubject: site => `Your photo · ${site}`,
      mail: ({ name, link, date, author }) => `Hello${name ? ` ${name}` : ''},\n\nThank you again for this moment. Here is your photo, just for you:\n${link}\n\nThe link is valid until ${date}.\n\n${author}`,
    },
    hello: {
      title: 'Hello!', pageTitle: 'I took your photo',
      intro: 'You met a photographer from {site} who may have taken your photo. This photo is about you: you decide what happens to it.',
      introWho: name => `You met ${name}, who may have taken your photo. This photo is about you: you decide what happens to it.`,
      card: 'Your card', refLabel: 'Card reference', refHint: 'For example J-0142 (at the bottom of the card).',
      cardOk: name => `Card from ${name}: thank you for keeping it.`, cardUnverified: 'Reference noted.',
      noCard: 'No card? Tell us when and where',
      metOn: 'Date', metTime: 'Around what time', place: 'Place', placeHint: 'City, street, area…', details: 'A detail to recognise you', detailsHint: 'A red jacket, a bike, a dog…',
      wish: 'What you would like', wantsPhoto: 'Receive the photo by email',
      decision: 'Publication of the photo', undecided: 'I don’t know yet', agree: 'I agree to its publication:', refuse: 'I do not want it to be published',
      scopes: { site: 'on the website', instagram: 'on Instagram (with the website)', print: 'in exhibitions and prints', name: 'with my first name' },
      rightsLegend: 'Your data', rightsNone: 'Nothing more', rightsAccess: 'Receive a copy of all my data', rightsErase: 'Delete all my data (and, if I ask in the message, the photos I appear in)',
      message: 'A message (optional)', contact: 'How to reach you', email: 'Your email', name: 'Your first name or name',
      privacy: 'Your address is only used to reply to you and send you your photo. Without consent or refusal, your request is deleted after 12 months. You can change your mind at any time by coming back to this page.',
      send: 'Send', errorsTitle: 'The form is incomplete:',
      errors: {
        ref: 'Unreadable reference: a letter and a number, as on the card (J-0142).', code: 'The card code does not match: check the reference (or keep only the letter and number).',
        where: 'Without a card, please give at least the date and place, so we can find the photo.', scopes: 'Tick at least one use you agree to.', instagram: 'Instagram requires the website: tick the website too, or untick Instagram.',
        email: 'Invalid email address.', email_required: 'Please give your email so we can reply.', name: 'Please give your name with your consent.',
        what: 'Tell us what you would like: receive the photo, agree to or refuse its publication, a request about your data, or a message.', limit: 'Too many requests from your connection: please try again in an hour.',
      },
      thanks: 'Thank you, it’s noted.', thanksText: 'The photographer will reply by email, usually within a few days. You can come back to this page at any time to change your mind.',
      thanksRef: ref => `Your reference: ${ref}.`, back: 'See the photos',
    },
    v2form: {
      required: 'All fields are required unless marked “optional”.', optional: '(optional)', error: 'Error:',
      points: n => `${n} things to correct`, titleError: what => `Error: ${what}`, sent: 'Sent.',
      limitTitle: 'Sending paused for a while', limitKept: 'What you entered has been kept.',
      fields: { ref: 'card reference', where: 'date and place', what: 'what you would like', scopes: 'publication of the photo', email: 'your email', name: 'your first name or name',
        kind: 'what you would like to tell us', message: 'your message' },
      errors: { email: 'Invalid email address: write it as name@domain.com.' },
      hello: {
        label: 'Your photo', cardHelp: 'The reference is at the bottom of the card the photographer gave you. No card? Tell us when and where instead.',
        refHint: 'A letter and a number, for example J-0142.', metTimeHint: 'For example 6 pm.', placeHint: 'City, street, area.',
        wishHelp: 'At least one choice: receive the photo, decide on its publication, a request about your data, or a message.',
        decisionHelp: 'You can change your mind at any time.', rightsLink: 'Your rights over your data', message: 'A message',
        emailHint: 'To send you the photo and reply to you; never for anything else. Only a refusal can stay without an address.',
        nameHint: 'Needed if you agree to a publication.', sendNote: 'The photographer will reply by email, usually within a few days.',
        nextTitle: 'What happens next',
        next: ['The photographer finds the photo from the card reference, or from the date and place.', 'They reply by email, usually within a few days, with the photo if you asked for it.',
          'You can change your mind at any time: come back to this page.'],
        sentRef: 'Card reference',
      },
      report: { label: 'Report', messageHint: 'Needed for a suggestion or for “something else”.', emailHint: 'Only if you would like a reply.' },
    },
    trips: {
      title: 'Trips', description: names => `Trips: ${names}`, descriptionOne: (name, span) => `${name}, ${span}`,
      span: (a, b) => `${a} – ${b}`, days: n => `${n} day${n === 1 ? '' : 's'}`, day: n => `Day ${n}`, short: n => `D${n}`,
      map: name => `Route of the trip “${name}”`, stop: (n, when, city) => `Stop ${n}, ${when}: ${city}`, open: 'See the trip',
      by: names => `by ${names}`, story: 'Day by day', back: 'All trips',
      preview: 'Team-only preview: this trip is not published (or has no published photo yet). Visitors cannot see it.', settings: 'Trip settings',
    },
    near: {
      title: 'Nearby', map: city => `Map: the photo was taken in ${city}`, here: city => `Taken in ${city}`, same: 'same town',
      km: n => `${n} km`, more: n => `${n} photo${n === 1 ? '' : 's'} nearby`, others: (city, n) => `${city}: ${n} photo${n === 1 ? '' : 's'}`, world: 'See the world map',
    },
    v2: {
      skip: 'Skip to content', menu: 'Menu', home: 'Home', homeOf: site => `${site}, home`, back: 'Back: ',
      prev: 'Previous', next: 'Next', photosOf: ctx => `Photos: ${ctx}`,
      placeDate: 'Place and date', placeDateTime: 'Place, date and time', serie: 'Series', photographer: 'Photographer',
      keys: 'Keyboard', keysPrevNext: 'previous, next', keyEsc: 'Esc', keysBack: 'back',
      fullscreen: 'Full screen', quit: 'Exit', fullscreenLabel: 'Photo in full screen',
      rights: 'Rights and licences', rightsText: 'For the press, a company or any use beyond private use: our terms and how to write to us.',
      me: 'Are you in this photo?', meLink: 'Receive it, or give or refuse your consent',
      reportText: 'A mistake in the text, a photo that should not be online?', colon: ':',
      footerBrand: authors => `photographs by ${authors}`, footerNote: 'All the images are ours and remain protected by copyright.',
      footerNav: 'Footer', footerSite: 'The site',
      navPhone: 'Navigation (phone)', and: ' and ', titleHome: (site, names) => `${site} — photographs by ${names}`,
      promiseSub: names => `The photographs of ${names}.`, slideshow: 'slideshow',
      slidePoints: n => `Choose a photo of the slideshow, ${n} photos`, slidePoint: (i, n, title) => `Photo ${i} of ${n}: ${title}`,
      play: 'Play', playMore: ' the slideshow', pause: 'Pause',
      regards: n => (n === 2 ? 'Two points of view' : 'Points of view'), seeGallery: 'See the gallery', bothDesc: n => `${n} photos, in the order we chose`,
      galleryLead: (n, names) => `The ${n} published photos by ${names}. Choose a photographer or a series; each choice has its own address, to share.`,
      regard: 'Photographer', orderT: 'Order:', orderOurs: 'chosen by us', orderOursCap: 'Chosen by us', orderRecent: 'most recent first', orderRecentCap: 'Most recent first',
      orderLineOurs: 'in the order we chose', orderLineRecent: 'most recent first',
      gridAll: n => (n === 2 ? 'Both points of view' : 'All the photos'), gridAuthor: name => `Photos by ${name}`, gridSerie: name => `The ${name} series`,
      count: (n, total) => (n === total || n === 0 ? `${n} ${n === 1 ? 'photo' : 'photos'}` : `${n} of ${total}`),
      shown: n => (n === 1 ? 'The photo is shown.' : `All ${n} photos are shown.`), seeSeries: n => `See the ${n} series`, seeMap: 'See the map',
      activeFilters: 'Chosen filters', removeFilter: ': remove this filter', noneOf: name => ` photos: none by ${name}`,
      emptyMsg: (name, serie) => `No photo by ${name} in the ${serie} series.`,
      emptySerie: (serie, n) => `See the whole ${serie} series (${n} ${n === 1 ? 'photo' : 'photos'})`, emptyAuthor: (name, n) => `See the ${n} photos by ${name}`,
      breadcrumb: 'Breadcrumb', serieBrief: 'The series at a glance', serieTitle: (name, names) => `${name} — series by ${names}`,
      seriePhotos: n => (n === 1 ? 'The photo' : `The ${n} photos`), oneRegard: 'The same series, one photographer', otherSeries: 'Other series',
    },
    search: {
      title: 'Search', label: 'Keywords', placeholder: 'mist, Loire, portrait…', submit: 'Search',
      hint: 'In titles, captions, places, towns and regions, series, photographers and keywords. Every word must be found.', short: 'Type at least two letters.',
      results: (n, q) => `${n} photo${n === 1 ? '' : 's'} for “${q}”`, none: q => `No photo for “${q}”. Try another word, or fewer words.`,
      description: 'Search the photos by keyword.', keywords: 'Keywords',
    },
    map: {
      title: 'Map', none: 'No photo on the map yet', soon: 'Places are coming soon.',
      svgTitle: 'World map of the places where the photos were taken', zoomIn: 'Zoom in', zoomOut: 'Zoom out', world: 'World',
      help: 'Pinch or Ctrl + scroll to zoom, drag to move.', base: 'Base map: Natural Earth',
      cluster: (name, others, n) => `${name} and ${others} other place${others > 1 ? 's' : ''}: ${n} photos. Zoom in`,
      description: names => `Where the photos were taken: ${names}`,
      credit: 'Cities: GeoNames (geonames.org), CC BY 4.0 licence',
    },
    pages: {
      toc: 'On this page', toTop: 'Contents', contact: 'Write to us',
      people: 'The photographers', seePhotos: name => `See the photos by ${name}`,
      searchHelp: 'Type a word or two, then Search.', browse: 'Or browse the series', allPhotos: 'All the photos',
      searchResults: 'Results',
      places: 'The places', placeOf: (n, name) => `${n === 1 ? 'The photo' : `The ${n} photos`} taken in ${name}`, backToMap: 'Map',
      mapHelp: 'Ctrl + scroll or the buttons to zoom, drag to move. With the keyboard, the arrow keys move the map.',
      mapHelpTouch: 'Pinch to zoom, drag to move.',
      mapTools: 'Map controls', panW: 'West', panE: 'East', panN: 'North', panS: 'South',
      tripsLead: n => (n === 1 ? 'One trip, told day by day.' : `${n} trips, told day by day.`),
      stops: 'The stops', stopsList: 'The stops of the trip', dayPhotos: n => (n === 1 ? '1 photo' : `${n} photos`),
      notFoundLead: 'The address may have changed. Here is where to go.', notFoundSearch: 'Search for a photo',
    },
  },
  de: {
    nav: { series: 'Serien', gallery: 'Galerie', map: 'Karte', trips: 'Reisen', about: 'Über uns', search: 'Suchen', label: 'Navigation', lang: 'Sprache', langCurrent: 'Sprache: Deutsch' },
    fb: {
      like: 'Gefällt mir', unlike: 'Gefällt mir nicht mehr', likes: n => `Gefällt ${n} Mal`, report: 'Melden',
      reportTitle: 'Dieses Foto melden', reportIntro: title => `Zu „${title}“. Ihre Nachricht kommt direkt bei uns an; wir lesen jede.`,
      me: 'Sind Sie auf diesem Foto? Um es zu erhalten oder Ihre Einwilligung zu geben oder abzulehnen:', meLink: 'Ich habe Sie fotografiert',
      kind: 'Was möchten Sie uns mitteilen?', kinds: { inapproprie: 'Dieses Foto sollte nicht online sein', texte: 'Ein Vorschlag zum Text (Titel, Bildunterschrift, Ort)', autre: 'Etwas anderes' },
      message: 'Ihre Nachricht', messageHint: 'für einen Vorschlag nötig', email: 'Ihre E-Mail', emailHint: 'optional, nur wenn Sie eine Antwort möchten',
      send: 'Senden', back: 'Zurück zum Foto', thanks: 'Danke, Ihre Nachricht ist angekommen.',
      privacy: 'Ihre Nachricht und Ihre Adresse dienen nur der Bearbeitung dieser Meldung; sie werden nach 12 Monaten gelöscht.',
      errors: { kind: 'Wählen Sie, was Sie uns mitteilen möchten.', message: 'Schreiben Sie ein paar Worte.', email: 'Diese E-Mail-Adresse ist ungültig.', limit: 'Zu viele Nachrichten: Versuchen Sie es in einer Stunde erneut.' },
    },
    share: { button: 'Teilen', title: 'Teilen', close: 'Schließen', copy: 'Kopieren', copyLink: 'Link kopieren', copied: '✓ Link kopiert', instagram: 'Auf Instagram ansehen', more: 'Mehr…', newWindow: ' (neues Fenster)', email: 'E-Mail', link: 'Link zum Foto', back: 'Zurück zum Foto',
      qr: 'Scannen, um es auf Ihrem Telefon zu öffnen, oder zeigen Sie es jemandem neben Ihnen.' },
    footer: { photos: 'Fotografien', noRepro: 'alle Rechte vorbehalten', rights: 'Nutzungsrechte', privacy: 'Datenschutz', legal: 'Impressum' },
    both: 'Beide', colon: ':',
    photos: n => pluralOne(n, 'Foto', 'Fotos'),
    places: n => pluralOne(n, 'Ort', 'Orte'),
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
    app: {
      consentTitle: 'Ihre Einwilligung', consent: name => `Ich willige in die künstlerische Nutzung und Veröffentlichung der Fotos ein, die ${name} heute von mir gemacht hat. Ein Foto von mir kann dieser Einwilligung beigefügt werden. Ich kann meine Meinung jederzeit ändern.`,
      accept: 'Ich bin einverstanden, für:', refuse: 'Ich möchte nicht, dass diese Fotos veröffentlicht werden', later: 'Ich entscheide mich später',
      adult: 'Ich bin 18 Jahre oder älter', minor: 'Ich bin unter 18: Ein Elternteil unterschreibt mit mir', guardian: 'Name des Elternteils',
      sign: 'Hier mit dem Finger unterschreiben', clear: 'Löschen', name: 'Vor- und Nachname', email: 'E-Mail (freiwillig)',
      errAdult: 'Bitte beantworten Sie diese Frage: Sind Sie 18 Jahre oder älter?', errDecision: 'Bitte wählen Sie eine Antwort: einverstanden, nicht einverstanden, oder geben Sie Ihre E-Mail an, um das Foto zu erhalten.',
      privacy: host => `Ihre Daten (Name, E-Mail, Unterschrift, Foto von Ihnen, Ort) dienen nur dazu, Ihre Einwilligung zu verwalten und Ihnen Ihr Foto zu schicken. Fristen und Rechte: ${host}/de/confidentialite.`,
      thanks: 'Danke!', scan: 'Scannen Sie diesen Code mit Ihrem Handy: Dort finden Sie Ihre Seite, um Ihr Foto zu erhalten, Ihre Meinung zu ändern oder uns zu schreiben.',
      mailSubject: site => `Ihre Einwilligung · ${site}`,
      mail: ({ name, date, place, accepted, refused, link, author }) => `Hallo${name ? ` ${name}` : ''},\n\ndanke für unsere Begegnung${date ? ` am ${date}` : ''}${place ? ` in ${place}` : ''}.\n\n${refused ? 'Sie möchten nicht, dass Ihre Fotos veröffentlicht werden: notiert, sie werden es nicht.' : accepted ? `Sie haben der Veröffentlichung zugestimmt: ${accepted}.` : 'Sie haben noch nicht entschieden, ob Ihre Fotos veröffentlicht werden dürfen.'}\n\nHier können Sie Ihr Foto erhalten, Ihre Meinung jederzeit ändern oder uns schreiben:\n${link}\n\n${author}`,
    },
    gift: {
      title: 'Ihr Foto', text: 'Danke für diesen Moment. Hier ist Ihr Foto, nur für Sie.',
      download: 'Foto herunterladen', format: 'JPEG, 2048 px',
      personal: 'Für Ihren persönlichen Gebrauch: behalten, mit Familie und Freunden teilen, zu Hause ausdrucken. Für jede andere Nutzung schreiben Sie uns bitte.',
      until: date => `Link gültig bis ${date}.`, by: name => `Foto von ${name}`,
      expired: 'Dieser Link ist abgelaufen', expiredText: 'Links sind 30 Tage gültig. Schreiben Sie uns, und wir schicken Ihnen einen neuen.', contact: 'Uns schreiben',
      mailSubject: site => `Ihr Foto · ${site}`,
      mail: ({ name, link, date, author }) => `Hallo${name ? ` ${name}` : ''},\n\nnochmals danke für diesen Moment. Hier ist Ihr Foto, nur für Sie:\n${link}\n\nDer Link ist gültig bis ${date}.\n\n${author}`,
    },
    hello: {
      title: 'Hallo!', pageTitle: 'Ich habe Sie fotografiert',
      intro: 'Sie sind einem Fotografen von {site} begegnet, der Sie vielleicht fotografiert hat. Dieses Foto betrifft Sie: Sie entscheiden, was damit geschieht.',
      introWho: name => `Sie sind ${name} begegnet, der Sie vielleicht fotografiert hat. Dieses Foto betrifft Sie: Sie entscheiden, was damit geschieht.`,
      card: 'Ihre Karte', refLabel: 'Referenz der Karte', refHint: 'Zum Beispiel J-0142 (unten auf der Karte).',
      cardOk: name => `Karte von ${name}: danke, dass Sie sie aufbewahrt haben.`, cardUnverified: 'Referenz notiert.',
      noCard: 'Keine Karte? Sagen Sie uns wann und wo',
      metOn: 'Datum', metTime: 'Ungefähre Uhrzeit', place: 'Ort', placeHint: 'Stadt, Straße, Viertel…', details: 'Ein Detail, an dem wir Sie erkennen', detailsHint: 'Eine rote Jacke, ein Fahrrad, ein Hund…',
      wish: 'Was Sie möchten', wantsPhoto: 'Das Foto per E-Mail erhalten',
      decision: 'Veröffentlichung des Fotos', undecided: 'Ich weiß es noch nicht', agree: 'Ich bin mit der Veröffentlichung einverstanden:', refuse: 'Ich möchte nicht, dass es veröffentlicht wird',
      scopes: { site: 'auf der Website', instagram: 'auf Instagram (mit der Website)', print: 'in Ausstellungen und als Abzug', name: 'mit meinem Vornamen' },
      rightsLegend: 'Ihre Daten', rightsNone: 'Nichts weiter', rightsAccess: 'Eine Kopie aller meiner Daten erhalten', rightsErase: 'Alle meine Daten löschen (und, wenn ich es in der Nachricht verlange, die Fotos, auf denen ich zu sehen bin)',
      message: 'Eine Nachricht (freiwillig)', contact: 'So erreichen wir Sie', email: 'Ihre E-Mail', name: 'Ihr Vor- oder Nachname',
      privacy: 'Ihre Adresse dient nur dazu, Ihnen zu antworten und Ihr Foto zu schicken. Ohne Einwilligung oder Ablehnung wird Ihre Anfrage nach 12 Monaten gelöscht. Sie können Ihre Meinung jederzeit ändern, indem Sie diese Seite erneut aufrufen.',
      send: 'Senden', errorsTitle: 'Das Formular ist unvollständig:',
      errors: {
        ref: 'Unleserliche Referenz: ein Buchstabe und eine Zahl, wie auf der Karte (J-0142).', code: 'Der Code der Karte stimmt nicht: Prüfen Sie die Referenz (oder nur Buchstabe und Zahl angeben).',
        where: 'Ohne Karte geben Sie bitte mindestens Datum und Ort an, damit wir das Foto finden.', scopes: 'Kreuzen Sie mindestens eine Nutzung an, der Sie zustimmen.', instagram: 'Instagram setzt die Website voraus: Kreuzen Sie auch die Website an oder entfernen Sie Instagram.',
        email: 'Ungültige E-Mail-Adresse.', email_required: 'Bitte geben Sie Ihre E-Mail an, damit wir antworten können.', name: 'Bitte geben Sie mit Ihrer Einwilligung Ihren Namen an.',
        what: 'Sagen Sie uns, was Sie möchten: das Foto erhalten, der Veröffentlichung zustimmen oder sie ablehnen, eine Anfrage zu Ihren Daten, oder eine Nachricht.', limit: 'Zu viele Anfragen von Ihrer Verbindung: Bitte versuchen Sie es in einer Stunde erneut.',
      },
      thanks: 'Danke, notiert.', thanksText: 'Der Fotograf antwortet Ihnen per E-Mail, meist innerhalb weniger Tage. Sie können jederzeit auf diese Seite zurückkehren, um Ihre Meinung zu ändern.',
      thanksRef: ref => `Ihre Referenz: ${ref}.`, back: 'Die Fotos ansehen',
    },
    v2form: {
      required: 'Alle Felder sind Pflichtfelder, außer „optional“.', optional: '(optional)', error: 'Fehler:',
      points: n => `${n} Punkte zu korrigieren`, titleError: what => `Fehler: ${what}`, sent: 'Gesendet.',
      limitTitle: 'Senden kurz ausgesetzt', limitKept: 'Ihre Eingaben bleiben erhalten.',
      fields: { ref: 'Referenz der Karte', where: 'Datum und Ort', what: 'Was Sie möchten', scopes: 'Veröffentlichung des Fotos', email: 'Ihre E-Mail', name: 'Ihr Vor- oder Nachname',
        kind: 'Was Sie uns mitteilen möchten', message: 'Ihre Nachricht' },
      errors: { email: 'Ungültige E-Mail-Adresse: Schreiben Sie sie in der Form name@domain.de.' },
      hello: {
        label: 'Ihr Foto', cardHelp: 'Die Referenz steht unten auf der Karte, die Ihnen der Fotograf gegeben hat. Keine Karte? Sagen Sie uns stattdessen wann und wo.',
        refHint: 'Ein Buchstabe und eine Zahl, zum Beispiel J-0142.', metTimeHint: 'Zum Beispiel 18 Uhr.', placeHint: 'Stadt, Straße, Viertel.',
        wishHelp: 'Mindestens eine Auswahl: das Foto erhalten, über die Veröffentlichung entscheiden, eine Anfrage zu Ihren Daten oder eine Nachricht.',
        decisionHelp: 'Sie können Ihre Meinung jederzeit ändern.', rightsLink: 'Ihre Rechte an Ihren Daten', message: 'Eine Nachricht',
        emailHint: 'Um Ihnen das Foto zu schicken und zu antworten; für nichts anderes. Nur eine Ablehnung kann ohne Adresse bleiben.',
        nameHint: 'Nötig, wenn Sie einer Veröffentlichung zustimmen.', sendNote: 'Der Fotograf antwortet Ihnen per E-Mail, meist innerhalb weniger Tage.',
        nextTitle: 'Wie es weitergeht',
        next: ['Der Fotograf findet das Foto über die Referenz der Karte oder über Datum und Ort.', 'Er antwortet Ihnen per E-Mail, meist innerhalb weniger Tage, mit dem Foto, wenn Sie es möchten.',
          'Sie können Ihre Meinung jederzeit ändern: Kommen Sie auf diese Seite zurück.'],
        sentRef: 'Referenz der Karte',
      },
      report: { label: 'Melden', messageHint: 'Nötig für einen Vorschlag oder für „Etwas anderes“.', emailHint: 'Nur wenn Sie eine Antwort möchten.' },
    },
    trips: {
      title: 'Reisen', description: names => `Die Reisen: ${names}`, descriptionOne: (name, span) => `${name}, ${span}`,
      span: (a, b) => `${a} – ${b}`, days: n => `${n} ${n === 1 ? 'Tag' : 'Tage'}`, day: n => `Tag ${n}`, short: n => `T${n}`,
      map: name => `Route der Reise „${name}“`, stop: (n, when, city) => `Etappe ${n}, ${when}: ${city}`, open: 'Reise ansehen',
      by: names => `von ${names}`, story: 'Tag für Tag', back: 'Alle Reisen',
      preview: 'Vorschau nur für das Team: Diese Reise ist nicht veröffentlicht (oder hat noch kein veröffentlichtes Foto). Besucher sehen sie nicht.', settings: 'Reise einstellen',
    },
    near: {
      title: 'In der Nähe', map: city => `Karte: Das Foto wurde in ${city} aufgenommen`, here: city => `Aufgenommen in ${city}`, same: 'selber Ort',
      km: n => `${n} km`, more: n => `${n} ${n === 1 ? 'Foto' : 'Fotos'} in der Nähe`, others: (city, n) => `${city}: ${n} ${n === 1 ? 'Foto' : 'Fotos'}`, world: 'Weltkarte ansehen',
    },
    v2: {
      skip: 'Zum Inhalt springen', menu: 'Menü', home: 'Startseite', homeOf: site => `${site}, Startseite`, back: 'Zurück: ',
      prev: 'Vorheriges', next: 'Nächstes', photosOf: ctx => `Fotos: ${ctx}`,
      placeDate: 'Ort und Datum', placeDateTime: 'Ort, Datum und Uhrzeit', serie: 'Serie', photographer: 'Fotograf',
      keys: 'Tastatur', keysPrevNext: 'vorheriges, nächstes', keyEsc: 'Esc', keysBack: 'zurück',
      fullscreen: 'Vollbild', quit: 'Beenden', fullscreenLabel: 'Foto im Vollbild',
      rights: 'Rechte und Lizenzen', rightsText: 'Für die Presse, ein Unternehmen oder jede Nutzung über den privaten Rahmen hinaus: unsere Bedingungen und wie Sie uns schreiben.',
      me: 'Sind Sie auf diesem Foto?', meLink: 'Erhalten Sie es, oder geben oder verweigern Sie Ihre Einwilligung',
      reportText: 'Ein Fehler im Text, ein Foto, das nicht online sein sollte?', colon: ':',
      footerBrand: authors => `Fotografien von ${authors}`, footerNote: 'Alle Bilder sind unsere eigenen und bleiben urheberrechtlich geschützt.',
      footerNav: 'Fußzeile', footerSite: 'Die Website',
      navPhone: 'Navigation (Telefon)', and: ' und ', titleHome: (site, names) => `${site} — Fotografien von ${names}`,
      promiseSub: names => `Die Fotografien von ${names}.`, slideshow: 'Diashow',
      slidePoints: n => `Foto der Diashow wählen, ${n} Fotos`, slidePoint: (i, n, title) => `Foto ${i} von ${n}: ${title}`,
      play: 'Abspielen', playMore: ' (Diashow)', pause: 'Pause',
      regards: n => (n === 2 ? 'Zwei Blicke' : 'Die Blicke'), seeGallery: 'Galerie ansehen', bothDesc: n => `${n} Fotos, von uns gewählt`,
      galleryLead: (n, names) => `Die ${n} veröffentlichten Fotos von ${names}. Wählen Sie einen Blick oder eine Serie; jede Auswahl hat ihre eigene Adresse zum Teilen.`,
      regard: 'Blick', orderT: 'Reihenfolge:', orderOurs: 'von uns gewählt', orderOursCap: 'Von uns gewählt', orderRecent: 'neueste zuerst', orderRecentCap: 'Neueste zuerst',
      orderLineOurs: 'von uns gewählt', orderLineRecent: 'neueste zuerst',
      gridAll: n => (n === 2 ? 'Beide Blicke' : 'Alle Fotos'), gridAuthor: name => `Die Fotos von ${name}`, gridSerie: name => `Die Serie ${name}`,
      count: (n, total) => (n === total || n === 0 ? `${n} ${n === 1 ? 'Foto' : 'Fotos'}` : `${n} von ${total}`),
      shown: n => (n === 1 ? 'Das Foto wird angezeigt.' : `Alle ${n} Fotos werden angezeigt.`), seeSeries: n => `Die ${n} Serien ansehen`, seeMap: 'Karte ansehen',
      activeFilters: 'Gewählte Filter', removeFilter: ': Filter entfernen', noneOf: name => ` Fotos: keines von ${name}`,
      emptyMsg: (name, serie) => `Kein Foto von ${name} in der Serie ${serie}.`,
      emptySerie: (serie, n) => `Die ganze Serie ${serie} ansehen (${n} ${n === 1 ? 'Foto' : 'Fotos'})`, emptyAuthor: (name, n) => `Die ${n} Fotos von ${name} ansehen`,
      breadcrumb: 'Brotkrümelnavigation', serieBrief: 'Die Serie im Überblick', serieTitle: (name, names) => `${name} — Serie von ${names}`,
      seriePhotos: n => (n === 1 ? 'Das Foto' : `Die ${n} Fotos`), oneRegard: 'Dieselbe Serie, ein Blick', otherSeries: 'Weitere Serien',
    },
    search: {
      title: 'Suchen', label: 'Stichwörter', placeholder: 'Nebel, Loire, Porträt…', submit: 'Suchen',
      hint: 'In Titeln, Bildunterschriften, Orten, Städten und Regionen, Serien, Fotografen und Stichwörtern. Jedes Wort muss gefunden werden.', short: 'Geben Sie mindestens zwei Buchstaben ein.',
      results: (n, q) => `${n} ${n === 1 ? 'Foto' : 'Fotos'} für „${q}“`, none: q => `Kein Foto für „${q}“. Versuchen Sie ein anderes Wort oder weniger Wörter.`,
      description: 'Die Fotos nach Stichwörtern durchsuchen.', keywords: 'Stichwörter',
    },
    map: {
      title: 'Karte', none: 'Noch kein Foto auf der Karte', soon: 'Die Orte folgen in Kürze.',
      svgTitle: 'Weltkarte der Aufnahmeorte', zoomIn: 'Vergrößern', zoomOut: 'Verkleinern', world: 'Welt',
      help: 'Zum Zoomen mit zwei Fingern ziehen oder Strg + Mausrad, zum Verschieben ziehen.', base: 'Kartengrundlage: Natural Earth',
      cluster: (name, others, n) => `${name} und ${others} weitere${others > 1 ? '' : 'r'} Ort${others > 1 ? 'e' : ''}: ${n} Fotos. Vergrößern`,
      description: names => `Die Aufnahmeorte: ${names}`,
      credit: 'Orte: GeoNames (geonames.org), Lizenz CC BY 4.0',
    },
    pages: {
      toc: 'Auf dieser Seite', toTop: 'Inhalt', contact: 'Schreiben Sie uns',
      people: 'Die Fotografen', seePhotos: name => `Die Fotos von ${name} ansehen`,
      searchHelp: 'Geben Sie ein oder zwei Wörter ein, dann Suchen.', browse: 'Oder stöbern Sie in den Serien', allPhotos: 'Alle Fotos',
      searchResults: 'Ergebnisse',
      places: 'Die Orte', placeOf: (n, name) => `${n === 1 ? 'Das Foto' : `Die ${n} Fotos`} aus ${name}`, backToMap: 'Karte',
      mapHelp: 'Strg + Mausrad oder die Schaltflächen zum Zoomen, ziehen zum Verschieben. Mit der Tastatur verschieben die Pfeiltasten die Karte.',
      mapHelpTouch: 'Mit zwei Fingern zoomen, ziehen zum Verschieben.',
      mapTools: 'Kartensteuerung', panW: 'Nach Westen', panE: 'Nach Osten', panN: 'Nach Norden', panS: 'Nach Süden',
      tripsLead: n => (n === 1 ? 'Eine Reise, Tag für Tag erzählt.' : `${n} Reisen, Tag für Tag erzählt.`),
      stops: 'Die Etappen', stopsList: 'Die Etappen der Reise', dayPhotos: n => (n === 1 ? '1 Foto' : `${n} Fotos`),
      notFoundLead: 'Die Adresse hat sich vielleicht geändert. Hier geht es weiter.', notFoundSearch: 'Ein Foto suchen',
    },
  },
};
