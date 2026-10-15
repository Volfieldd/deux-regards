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
    footer: { photos: 'Photographs', noRepro: 'all rights reserved', rights: 'Terms of use', privacy: 'Privacy', legal: 'Legal notice' },
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
    app: {
      consentTitle: 'Your consent', consent: name => `I agree to the artistic use and publication of the photos ${name} took of me today. A photo of me may be attached to this consent. I can change my mind at any time.`,
      accept: 'I agree, for:', refuse: 'I do not want these photos to be published', later: 'I won’t decide now',
      adult: 'I am 18 or older', minor: 'I am under 18: a parent signs with me', guardian: 'Parent’s name',
      sign: 'Sign here with your finger', clear: 'Clear', name: 'First and last name', email: 'Email (optional)',
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
    footer: { photos: 'Fotografien', noRepro: 'alle Rechte vorbehalten', rights: 'Nutzungsrechte', privacy: 'Datenschutz', legal: 'Impressum' },
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
    app: {
      consentTitle: 'Ihre Einwilligung', consent: name => `Ich willige in die künstlerische Nutzung und Veröffentlichung der Fotos ein, die ${name} heute von mir gemacht hat. Ein Foto von mir kann dieser Einwilligung beigefügt werden. Ich kann meine Meinung jederzeit ändern.`,
      accept: 'Ich bin einverstanden, für:', refuse: 'Ich möchte nicht, dass diese Fotos veröffentlicht werden', later: 'Ich entscheide mich später',
      adult: 'Ich bin 18 Jahre oder älter', minor: 'Ich bin unter 18: Ein Elternteil unterschreibt mit mir', guardian: 'Name des Elternteils',
      sign: 'Hier mit dem Finger unterschreiben', clear: 'Löschen', name: 'Vor- und Nachname', email: 'E-Mail (freiwillig)',
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
