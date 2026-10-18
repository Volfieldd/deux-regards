// Textes des pages privées du site public (galeries privées : /g/<jeton>, /prive/<id> ; maquettes MQ-16 et MQ-17), en
// français, anglais et allemand. À part de server/i18n.js : ces pages n'ont qu'une version (v2) et ne partagent ni menu ni
// pied de page complet avec le reste du site. Les textes français passent par typo() (server/v2-vues.js) : espaces fines
// avant « : ; ! ? », insécables avant « · ».
const NB = ' ';
const plural = (n, one, many) => `${n}${NB}${Number(n) >= 2 ? many : one}`;
const pluralDe = (n, one, many) => `${n}${NB}${Number(n) === 1 ? one : many}`;

export const PRIVE = {
  fr: {
    label: 'Galerie privée', invitation: 'Sur invitation',
    prepared: name => `${name} a préparé ces photos pour vous.`,
    until: 'Accès valable jusqu’au',
    password: 'Mot de passe',
    passwordHelp: name => `${name} vous l’a donné à part, dans un autre message : 12 lettres et chiffres, en trois groupes. Majuscules, espaces et tirets ne comptent pas ; vous pouvez le coller.`,
    show: ['', 'Afficher', ' le mot de passe'],
    remember: 'Se souvenir de cet appareil pendant 30 jours',
    rememberHelp: 'Sinon, la galerie se referme après 12 h sans visite. À laisser décoché sur un ordinateur partagé.',
    open: 'Ouvrir la galerie',
    lost: name => ['Mot de passe perdu ? ', `Écrivez à ${name}`, ' : il vous en donnera un nouveau, et votre lien restera le même.'],
    data: name => `Cette galerie n’est visible que des personnes invitées. Nous notons vos visites et vos favoris, pour que ${name} sache que les photos vous sont parvenues ; tout est effacé six mois après la fin de l’accès. Un cookie, nécessaire, garde la galerie ouverte sur ce navigateur.`,
    privacy: 'Confidentialité', legal: 'Mentions légales',
    error: 'Erreur :', errorTitle: 'Erreur : mot de passe refusé',
    wrong: (name, n, pause) => `ce mot de passe ne correspond pas. Vérifiez-le dans le message de ${name}, puis saisissez-le de nouveau. Encore ${plural(n, 'essai', 'essais')} avant une pause ${pause === 1 ? 'd’une minute' : 'de 15 minutes'}.`,
    wrongLast: (name, n) => `ce mot de passe ne correspond pas. Vérifiez-le dans le message de ${name}. Encore ${plural(n, 'essai', 'essais')} avant que l’accès soit suspendu.`,
    pause: (n, time) => `Pause de sécurité après ${n} essais refusés : réessayez à ${time}.`,
    pauseMore1: 'Les essais pendant la pause ne comptent pas ; après 10 refus, elle dure 15 minutes. Votre lien reste valable.',
    pauseMore15: 'Les essais pendant la pause ne comptent pas. Votre lien reste valable.',
    busyTitle: 'Un instant', busy: ['Beaucoup de demandes en ce moment.', ' Réessayez dans quelques secondes : votre lien et votre mot de passe n’ont pas changé.'],
    limitTitle: 'Trop d’essais depuis votre réseau', limit: 'Réessayez dans un quart d’heure : votre lien reste valable.',
    suspendedTitle: 'Accès suspendu', suspended: name => ['trop de mots de passe refusés ; par sécurité, cet accès est suspendu. ', `${name} est prévenu : `, 'écrivez-lui', ' pour le rouvrir.'],
    endedTitle: date => `Cet accès a pris fin le ${date}.`, ended: name => `Les photos ne sont plus visibles avec ce lien. ${name} peut vous ouvrir un nouvel accès.`,
    write: name => `Écrire à ${name}`,
    refusedTitle: 'Envoi refusé', refused: 'Ce formulaire n’est plus valable, ou il vient d’un autre site. Rouvrez la page et recommencez.',
    revokedTitle: 'Ce lien n’est plus valable.', revoked: name => `L’accès a été retiré ou son lien remplacé. ${name} peut vous en ouvrir un nouveau.`,
    // Galerie
    galleryOf: first => `Galerie de ${first}`, preparedBy: name => `Préparée par ${name}`, photos: n => plural(n, 'photo', 'photos'), favs: n => plural(n, 'favori', 'favoris'), accessUntil: 'accès jusqu’au',
    rights: {
      favoris: name => `Vos droits : regarder et choisir. Les photos ne se téléchargent pas ; ${name} vous enverra celles de votre sélection.`,
      voir: name => `Vos droits : regarder. Les photos ne se téléchargent pas ; demandez-les à ${name}.`,
      telecharger: 'Vos droits : regarder et télécharger les photos, pour votre usage personnel.',
      tout: 'Vos droits : regarder, choisir et télécharger les photos, pour votre usage personnel.',
    },
    views: 'Vues de la galerie', all: 'Toutes', yourFavs: 'Vos favoris', favNote: 'Favori : l’étoile met la photo dans votre sélection',
    favOf: title => `Favori : ${title}`, fav: 'Favori',
    photosTitle: n => `Les ${plural(n, 'photo', 'photos')}`,
    inSelection: n => [plural(n, 'favori', 'favoris'), ' dans votre sélection'],
    send: name => `Envoyer ma sélection à ${name}`,
    sentTitle: name => `Sélection envoyée à ${name}.`, sentList: (n, list) => ` Il a reçu vos ${plural(n, 'favori', 'favoris')} : ${list}.`,
    sentLine: (n, name, when) => `${plural(n, 'favori', 'favoris')} envoyés à ${name} le ${when}`,
    sentNote: name => `Vous pouvez la reprendre tant que ${name} ne l’a pas ouverte ; ensuite, écrivez-lui.`,
    seenNote: name => `${name} a ouvert votre sélection ; pour la changer, écrivez-lui.`,
    takeBack: 'Reprendre ma sélection', takenBack: 'Votre sélection est de nouveau modifiable.',
    emptyFavTitle: 'Aucune photo dans vos favoris',
    emptyFav: ['Touchez l’étoile ', ' sous une photo pour la mettre dans votre sélection ; touchez-la de nouveau pour l’en retirer.'],
    seeAll: n => `Voir les ${plural(n, 'photo', 'photos')}`,
    info: (name, date) => `Nous notons vos visites et vos favoris, pour que ${name} sache que les photos vous sont parvenues et prépare la suite ; tout est effacé six mois après la fin de l’accès, le ${date}.`,
    leave: 'Quitter', leaveLong: 'Quitter la galerie',
    leftTitle: 'Vous avez quitté la galerie.', left: date => `Sur ce navigateur, il faudra de nouveau votre lien et votre mot de passe. Vos favoris restent gardés jusqu’au ${date}.`,
    leftNone: 'Sur ce navigateur, il faudra de nouveau votre lien et votre mot de passe.',
    notFoundTitle: 'Cette page n’est pas disponible.', notFound: 'Si l’on vous a invité à une galerie privée, ouvrez de nouveau le lien personnel reçu par message : il vous redemandera le mot de passe.',
    removedTitle: 'Cet accès n’est plus valable.', removed: name => `${name} a retiré cet accès. Pour revoir les photos, demandez-lui un nouveau lien.`,
    backShort: 'Galerie', backSr: 'Retour à la galerie : ', backSrShort: 'Retour à la ', prev: 'Photo précédente : ', next: 'Photo suivante : ', photosNav: 'Photos de la galerie',
    noDownload: name => `Téléchargement non inclus : demandez le fichier à ${name} avec votre sélection.`,
    download: 'Télécharger', downloadAll: 'Tout télécharger',
    archiveHelp: (n, px) => `Une archive ZIP : ${n >= 2 ? `les ${n} photos` : 'la photo'} en JPEG de ${px}${NB}px, pour votre usage personnel.`,
    dlSr: (title, px) => ` « ${title} », JPEG ${px}${NB}px`, dlData: px => `JPEG ${px}${NB}px`,
    archiveLimit: 'Trois archives par jour au plus : réessayez demain, ou téléchargez les photos une à une.',
    downloadLimit: 'Beaucoup de téléchargements en peu de temps : réessayez dans une heure.',
    team: 'Vue équipe : vous voyez la galerie comme un invité, sans que rien ne soit noté. Les actions des invités sont désactivées.', backAdmin: 'Retour à l’administration',
    langLabel: 'Langue', langCurrent: 'Langue : français',
  },
  en: {
    label: 'Private gallery', invitation: 'By invitation',
    prepared: name => `${name} has prepared these photographs for you.`,
    until: 'Access valid until',
    password: 'Password',
    passwordHelp: name => `${name} gave it to you separately, in another message: 12 letters and digits, in three groups. Capitals, spaces and hyphens do not matter; you can paste it.`,
    show: ['', 'Show', ' the password'],
    remember: 'Remember this device for 30 days',
    rememberHelp: 'Otherwise, the gallery closes after 12 hours without a visit. Leave unticked on a shared computer.',
    open: 'Open the gallery',
    lost: name => ['Lost your password? ', `Write to ${name}`, ': you will get a new one, and your link will stay the same.'],
    data: name => `Only invited people can see this gallery. We record your visits and favourites so that ${name} knows the photographs reached you; everything is deleted six months after your access ends. A necessary cookie keeps the gallery open in this browser.`,
    privacy: 'Privacy', legal: 'Legal notice',
    error: 'Error:', errorTitle: 'Error: password refused',
    wrong: (name, n, pause) => `this password does not match. Check it in ${name}’s message, then type it again. ${n} more ${n === 1 ? 'try' : 'tries'} before a ${pause === 1 ? 'one-minute' : '15-minute'} pause.`,
    wrongLast: (name, n) => `this password does not match. Check it in ${name}’s message. ${n} more ${n === 1 ? 'try' : 'tries'} before this access is suspended.`,
    pause: (n, time) => `Security pause after ${n} refused tries: try again at ${time}.`,
    pauseMore1: 'Tries during the pause do not count; after 10 refusals, it lasts 15 minutes. Your link remains valid.',
    pauseMore15: 'Tries during the pause do not count. Your link remains valid.',
    busyTitle: 'One moment', busy: ['Many requests right now.', ' Try again in a few seconds: your link and your password have not changed.'],
    limitTitle: 'Too many tries from your network', limit: 'Try again in a quarter of an hour: your link remains valid.',
    suspendedTitle: 'Access suspended', suspended: name => ['too many refused passwords; for security, this access is suspended. ', `${name} has been told: `, 'write to them', ' to reopen it.'],
    endedTitle: date => `This access ended on ${date}.`, ended: name => `The photographs can no longer be seen with this link. ${name} can open a new access for you.`,
    write: name => `Write to ${name}`,
    refusedTitle: 'Request refused', refused: 'This form is no longer valid, or it comes from another website. Reopen the page and try again.',
    revokedTitle: 'This link is no longer valid.', revoked: name => `The access was withdrawn or its link replaced. ${name} can open a new one for you.`,
    galleryOf: first => `${first}’s gallery`, preparedBy: name => `Prepared by ${name}`, photos: n => plural(n, 'photo', 'photos'), favs: n => plural(n, 'favourite', 'favourites'), accessUntil: 'access until',
    rights: {
      favoris: name => `Your rights: view and choose. The photographs cannot be downloaded; ${name} will send you those you select.`,
      voir: name => `Your rights: view. The photographs cannot be downloaded; ask ${name} for them.`,
      telecharger: 'Your rights: view and download the photographs, for your personal use.',
      tout: 'Your rights: view, choose and download the photographs, for your personal use.',
    },
    views: 'Gallery views', all: 'All', yourFavs: 'Your favourites', favNote: 'Favourite: the star puts the photograph in your selection',
    favOf: title => `Favourite: ${title}`, fav: 'Favourite',
    photosTitle: n => `The ${plural(n, 'photo', 'photos')}`,
    inSelection: n => [plural(n, 'favourite', 'favourites'), ' in your selection'],
    send: name => `Send my selection to ${name}`,
    sentTitle: name => `Selection sent to ${name}.`, sentList: (n, list) => ` ${n === 1 ? 'Your favourite' : `Your ${n} favourites`}: ${list}.`,
    sentLine: (n, name, when) => `${plural(n, 'favourite', 'favourites')} sent to ${name} on ${when}`,
    sentNote: name => `You can take it back as long as ${name} has not opened it; after that, write to them.`,
    seenNote: name => `${name} has opened your selection; to change it, write to them.`,
    takeBack: 'Take back my selection', takenBack: 'Your selection can be changed again.',
    emptyFavTitle: 'No photograph in your favourites',
    emptyFav: ['Tap the star ', ' under a photograph to put it in your selection; tap it again to remove it.'],
    seeAll: n => `See the ${plural(n, 'photo', 'photos')}`,
    info: (name, date) => `We record your visits and favourites so that ${name} knows the photographs reached you and can prepare what comes next; everything is deleted six months after your access ends, on ${date}.`,
    leave: 'Leave', leaveLong: 'Leave the gallery',
    leftTitle: 'You have left the gallery.', left: date => `In this browser, you will need your link and your password again. Your favourites are kept until ${date}.`,
    leftNone: 'In this browser, you will need your link and your password again.',
    notFoundTitle: 'This page is not available.', notFound: 'If you were invited to a private gallery, open the personal link you received again: it will ask for the password.',
    removedTitle: 'This access is no longer valid.', removed: name => `${name} has withdrawn this access. To see the photographs again, ask for a new link.`,
    backShort: 'Gallery', backSr: 'Back to the gallery: ', backSrShort: 'Back to the ', prev: 'Previous photograph: ', next: 'Next photograph: ', photosNav: 'Photographs of the gallery',
    noDownload: name => `Download not included: ask ${name} for the file along with your selection.`,
    download: 'Download', downloadAll: 'Download all',
    archiveHelp: (n, px) => `A ZIP archive: ${n >= 2 ? `the ${n} photographs` : 'the photograph'} as ${px}${NB}px JPEG, for your personal use.`,
    dlSr: (title, px) => ` “${title}”, JPEG ${px}${NB}px`, dlData: px => `JPEG ${px}${NB}px`,
    archiveLimit: 'Three archives a day at most: try again tomorrow, or download the photographs one by one.',
    downloadLimit: 'Many downloads in a short time: try again in an hour.',
    team: 'Team view: you see the gallery as a guest, and nothing is recorded. Guest actions are disabled.', backAdmin: 'Back to the administration',
    langLabel: 'Language', langCurrent: 'Language: English',
  },
  de: {
    label: 'Private Galerie', invitation: 'Auf Einladung',
    prepared: name => `${name} hat diese Fotos für Sie vorbereitet.`,
    until: 'Zugang gültig bis',
    password: 'Passwort',
    passwordHelp: name => `${name} hat es Ihnen getrennt geschickt, in einer anderen Nachricht: 12 Buchstaben und Ziffern in drei Gruppen. Groß- und Kleinschreibung, Leerzeichen und Bindestriche zählen nicht; Sie können es einfügen.`,
    show: ['Passwort ', 'Anzeigen', ''],
    remember: 'Auf diesem Gerät 30 Tage angemeldet bleiben',
    rememberHelp: 'Sonst schließt sich die Galerie nach 12 Stunden ohne Besuch. Auf einem gemeinsam genutzten Computer nicht ankreuzen.',
    open: 'Galerie öffnen',
    lost: name => ['Passwort verloren? ', `Schreiben Sie ${name}`, ': Sie erhalten ein neues, Ihr Link bleibt derselbe.'],
    data: name => `Diese Galerie sehen nur eingeladene Personen. Wir speichern Ihre Besuche und Favoriten, damit ${name} weiß, dass die Fotos angekommen sind; alles wird sechs Monate nach Ende des Zugangs gelöscht. Ein notwendiges Cookie hält die Galerie in diesem Browser geöffnet.`,
    privacy: 'Datenschutz', legal: 'Impressum',
    error: 'Fehler:', errorTitle: 'Fehler: Passwort abgelehnt',
    wrong: (name, n, pause) => `Dieses Passwort stimmt nicht. Prüfen Sie es in der Nachricht von ${name} und geben Sie es erneut ein. Noch ${pluralDe(n, 'Versuch', 'Versuche')} bis zu einer Pause von ${pause === 1 ? 'einer Minute' : '15 Minuten'}.`,
    wrongLast: (name, n) => `Dieses Passwort stimmt nicht. Prüfen Sie es in der Nachricht von ${name}. Noch ${pluralDe(n, 'Versuch', 'Versuche')}, bevor der Zugang gesperrt wird.`,
    pause: (n, time) => `Sicherheitspause nach ${n} abgelehnten Versuchen: Versuchen Sie es um ${time} erneut.`,
    pauseMore1: 'Versuche während der Pause zählen nicht; nach 10 Ablehnungen dauert sie 15 Minuten. Ihr Link bleibt gültig.',
    pauseMore15: 'Versuche während der Pause zählen nicht. Ihr Link bleibt gültig.',
    busyTitle: 'Einen Moment', busy: ['Gerade viele Anfragen.', ' Versuchen Sie es in einigen Sekunden erneut: Ihr Link und Ihr Passwort haben sich nicht geändert.'],
    limitTitle: 'Zu viele Versuche aus Ihrem Netz', limit: 'Versuchen Sie es in einer Viertelstunde erneut: Ihr Link bleibt gültig.',
    suspendedTitle: 'Zugang gesperrt', suspended: name => ['Zu viele abgelehnte Passwörter; aus Sicherheitsgründen ist dieser Zugang gesperrt. ', `${name} ist informiert: `, 'Schreiben Sie ihm', ', um ihn wieder zu öffnen.'],
    endedTitle: date => `Dieser Zugang endete am ${date}.`, ended: name => `Die Fotos sind mit diesem Link nicht mehr sichtbar. ${name} kann Ihnen einen neuen Zugang öffnen.`,
    write: name => `An ${name} schreiben`,
    refusedTitle: 'Senden abgelehnt', refused: 'Dieses Formular ist nicht mehr gültig oder stammt von einer anderen Website. Öffnen Sie die Seite erneut und versuchen Sie es noch einmal.',
    revokedTitle: 'Dieser Link ist nicht mehr gültig.', revoked: name => `Der Zugang wurde zurückgezogen oder sein Link ersetzt. ${name} kann Ihnen einen neuen öffnen.`,
    galleryOf: first => `Galerie von ${first}`, preparedBy: name => `Vorbereitet von ${name}`, photos: n => pluralDe(n, 'Foto', 'Fotos'), favs: n => pluralDe(n, 'Favorit', 'Favoriten'), accessUntil: 'Zugang bis',
    rights: {
      favoris: name => `Ihre Rechte: ansehen und auswählen. Die Fotos lassen sich nicht herunterladen; ${name} schickt Ihnen die Ihrer Auswahl.`,
      voir: name => `Ihre Rechte: ansehen. Die Fotos lassen sich nicht herunterladen; fragen Sie ${name} danach.`,
      telecharger: 'Ihre Rechte: die Fotos ansehen und herunterladen, für Ihren persönlichen Gebrauch.',
      tout: 'Ihre Rechte: die Fotos ansehen, auswählen und herunterladen, für Ihren persönlichen Gebrauch.',
    },
    views: 'Ansichten der Galerie', all: 'Alle', yourFavs: 'Ihre Favoriten', favNote: 'Favorit: Der Stern legt das Foto in Ihre Auswahl',
    favOf: title => `Favorit: ${title}`, fav: 'Favorit',
    photosTitle: n => `Die ${pluralDe(n, 'Foto', 'Fotos')}`,
    inSelection: n => [pluralDe(n, 'Favorit', 'Favoriten'), ' in Ihrer Auswahl'],
    send: name => `Auswahl an ${name} senden`,
    sentTitle: name => `Auswahl an ${name} gesendet.`, sentList: (n, list) => ` ${n === 1 ? 'Ihr Favorit' : `Ihre ${n} Favoriten`}: ${list}.`,
    sentLine: (n, name, when) => `${pluralDe(n, 'Favorit', 'Favoriten')} am ${when} an ${name} gesendet`,
    sentNote: name => `Sie können sie zurücknehmen, solange ${name} sie nicht geöffnet hat; danach schreiben Sie ihm.`,
    seenNote: name => `${name} hat Ihre Auswahl geöffnet; um sie zu ändern, schreiben Sie ihm.`,
    takeBack: 'Auswahl zurücknehmen', takenBack: 'Ihre Auswahl lässt sich wieder ändern.',
    emptyFavTitle: 'Kein Foto in Ihren Favoriten',
    emptyFav: ['Tippen Sie auf den Stern ', ' unter einem Foto, um es in Ihre Auswahl zu legen; tippen Sie erneut, um es zu entfernen.'],
    seeAll: n => `Die ${pluralDe(n, 'Foto', 'Fotos')} ansehen`,
    info: (name, date) => `Wir speichern Ihre Besuche und Favoriten, damit ${name} weiß, dass die Fotos angekommen sind, und das Weitere vorbereitet; alles wird sechs Monate nach Ende des Zugangs gelöscht, am ${date}.`,
    leave: 'Verlassen', leaveLong: 'Galerie verlassen',
    leftTitle: 'Sie haben die Galerie verlassen.', left: date => `In diesem Browser brauchen Sie wieder Ihren Link und Ihr Passwort. Ihre Favoriten bleiben bis ${date} gespeichert.`,
    leftNone: 'In diesem Browser brauchen Sie wieder Ihren Link und Ihr Passwort.',
    notFoundTitle: 'Diese Seite ist nicht verfügbar.', notFound: 'Wenn Sie zu einer privaten Galerie eingeladen wurden, öffnen Sie erneut den persönlichen Link aus Ihrer Nachricht: Er fragt Sie wieder nach dem Passwort.',
    removedTitle: 'Dieser Zugang ist nicht mehr gültig.', removed: name => `${name} hat diesen Zugang zurückgezogen. Um die Fotos wieder zu sehen, fragen Sie nach einem neuen Link.`,
    backShort: 'Galerie', backSr: 'Zurück zur Galerie: ', backSrShort: 'Zurück zur ', prev: 'Vorheriges Foto: ', next: 'Nächstes Foto: ', photosNav: 'Fotos der Galerie',
    noDownload: name => `Download nicht enthalten: Fragen Sie ${name} mit Ihrer Auswahl nach der Datei.`,
    download: 'Herunterladen', downloadAll: 'Alle herunterladen',
    archiveHelp: (n, px) => `Ein ZIP-Archiv: ${n >= 2 ? `die ${n} Fotos` : 'das Foto'} als JPEG mit ${px}${NB}px, für Ihren persönlichen Gebrauch.`,
    dlSr: (title, px) => ` „${title}“, JPEG ${px}${NB}px`, dlData: px => `JPEG ${px}${NB}px`,
    archiveLimit: 'Höchstens drei Archive pro Tag: Versuchen Sie es morgen erneut, oder laden Sie die Fotos einzeln herunter.',
    downloadLimit: 'Viele Downloads in kurzer Zeit: Versuchen Sie es in einer Stunde erneut.',
    team: 'Team-Ansicht: Sie sehen die Galerie wie ein Gast, ohne dass etwas gespeichert wird. Die Aktionen der Gäste sind deaktiviert.', backAdmin: 'Zurück zur Verwaltung',
    langLabel: 'Sprache', langCurrent: 'Sprache: Deutsch',
  },
};

// Date et heure des pages privées : « 30 nov. 2026 », « 13 h 58 » (insécables, lexique des maquettes § 2).
const LOC = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' };
export function dateOf(ms, lang, long = false) {
  const f = new Intl.DateTimeFormat(LOC[lang] || 'fr-FR', { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric', timeZone: 'Europe/Paris' });
  return f.format(ms).replace(/ /g, NB);
}
export const isoDay = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
export function timeOf(ms, lang) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms).map(x => [x.type, x.value]));
  const h = Number(p.hour), m = p.minute;
  if (lang === 'en') return `${h % 12 || 12}:${m}${NB}${h < 12 ? 'am' : 'pm'}`;
  if (lang === 'de') return `${h}:${m}${NB}Uhr`;
  return `${h}${NB}h${NB}${m}`;
}

// Message à transmettre à l'invité, dans la langue de son accès (étude § 2.7 ; MQ-18 repère 9) : le lien, jamais le mot de
// passe (G22), l'échéance en toutes lettres, « merci de ne pas le transférer », ce qui est noté et combien de temps
// (information des personnes, RGPD art. 13 et 14, G72). Le site n'envoie pas d'e-mail : l'équipe copie ce texte.
// link : le lien complet, ou null (aperçu avant la création : masqué).
export function inviteMessage(lang, { title, link, who, until, host }) {
  const d = until ? dateOf(until, lang, true) : '';
  const L = link || `${host}/g/••••••••••••`;
  if (lang === 'en') return [`Hello,`, `Here are the photographs of “${title}”, in a private gallery, just for you:`, L,
    `I am sending you the password separately. The link works until ${d} inclusive.`, `This link is personal: please do not forward it.\n${who}`,
    `Nicephos records the dates of your visits and your favourites, to know whether the photographs reached you; everything is deleted six months after your access ends. Privacy: ${host}/en/confidentialite`];
  if (lang === 'de') return [`Guten Tag,`, `hier sind die Fotos von „${title}“, in einer privaten Galerie, nur für Sie:`, L,
    `Das Passwort schicke ich Ihnen getrennt. Der Link gilt bis einschließlich ${d}.`, `Dieser Link ist persönlich: Bitte leiten Sie ihn nicht weiter.\n${who}`,
    `Nicephos speichert die Daten Ihrer Besuche und Ihre Favoriten, um zu wissen, ob die Fotos angekommen sind; alles wird sechs Monate nach Ende des Zugangs gelöscht. Datenschutz: ${host}/de/confidentialite`];
  return [`Bonjour,`, `Voici les photos de « ${title} », dans une galerie privée, rien que pour vous :`, L,
    `Le mot de passe, je vous le donne à part. Le lien marche jusqu’au ${d} inclus.`, `Ce lien est personnel : merci de ne pas le transférer.\n${who}`,
    `Nicephos note la date de vos visites et vos favoris, pour savoir si les photos vous sont parvenues ; tout est effacé six mois après la fin de l’accès. Confidentialité : ${host}/confidentialite`];
}
export function passwordMessage(lang, { password, who }) {
  if (lang === 'en') return `Hello, here is the password for the Nicephos gallery: ${password} (with or without spaces). The link is in my other message. ${who}`;
  if (lang === 'de') return `Guten Tag, hier ist das Passwort der Nicephos-Galerie: ${password} (mit oder ohne Leerzeichen). Der Link ist in meiner anderen Nachricht. ${who}`;
  return `Bonjour, voici le mot de passe de la galerie Nicephos : ${password} (avec ou sans espaces). Le lien est dans mon autre message. ${who}`;
}
