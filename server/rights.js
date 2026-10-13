// Page « Droits d'utilisation » en trois langues. Le français reste à /droits (adresse inscrite dans
// les métadonnées IPTC des images) ; l'anglais et l'allemand sont des traductions, à /droits/en et /droits/de.
// Chaque texte est réglable dans l'admin (rights_text, rights_text_en, rights_text_de) ; vide : texte par défaut.

export const RIGHTS = {
  fr: {
    name: 'Français', path: '/droits', setting: 'rights_text', and: ' et ',
    title: 'Droits d’utilisation',
    description: site => `Conditions d’utilisation des photographies de ${site}.`,
    text: `Toutes les photographies publiées sur ce site sont protégées par le droit d’auteur. Elles appartiennent à leurs auteurs, {auteurs}.

Toute reproduction, représentation, modification ou utilisation, totale ou partielle, sans autorisation écrite préalable est interdite (articles L.122-4 et L.335-2 du Code de la propriété intellectuelle).

Pour toute demande d’utilisation ou de licence, écrivez-nous en précisant la photo, l’usage envisagé et sa durée.`,
    contact: 'Contact :',
    audienceTitle: 'Mesure d’audience',
    audience: 'Ce site compte ses visites de façon anonyme, sans cookie et sans service extérieur : nombre de pages et de photos vues, nombre de visiteurs par jour, pays (indiqué par notre hébergeur Cloudflare), site d’origine. Aucune adresse IP ni aucun identifiant n’est conservé, et les compteurs sont effacés au bout de 25 mois. Si votre navigateur demande à ne pas être suivi (« Do Not Track » ou « Global Privacy Control »), vos visites ne sont pas comptées.',
    nav: { series: 'Séries', gallery: 'Galerie', map: 'Carte', about: 'À propos', label: 'Navigation', langs: 'Langue' },
    footer: { photos: 'Photographies', noRepro: 'reproduction interdite' },
  },
  en: {
    name: 'English', path: '/droits/en', setting: 'rights_text_en', and: ' and ',
    title: 'Terms of use',
    description: site => `Terms of use of the photographs of ${site}.`,
    text: `All photographs published on this website are protected by copyright. They belong to their authors, {auteurs}.

Any reproduction, public display, modification or use, in whole or in part, without prior written permission is prohibited (Articles L.122-4 and L.335-2 of the French Intellectual Property Code).

For any use or licensing request, please write to us stating the photograph, the intended use and its duration.`,
    contact: 'Contact:',
    audienceTitle: 'Audience measurement',
    audience: 'This website counts its visits anonymously, without cookies and without any third-party service: number of pages and photographs viewed, number of visitors per day, country (as provided by our host, Cloudflare), referring website. No IP address or identifier is stored, and the counters are deleted after 25 months. If your browser asks not to be tracked (“Do Not Track” or “Global Privacy Control”), your visits are not counted.',
    nav: { series: 'Series', gallery: 'Gallery', map: 'Map', about: 'About', label: 'Navigation', langs: 'Language' },
    footer: { photos: 'Photographs', noRepro: 'all rights reserved' },
  },
  de: {
    name: 'Deutsch', path: '/droits/de', setting: 'rights_text_de', and: ' und ',
    title: 'Nutzungsrechte',
    description: site => `Nutzungsbedingungen für die Fotografien von ${site}.`,
    text: `Alle auf dieser Website veröffentlichten Fotografien sind urheberrechtlich geschützt. Sie gehören ihren Urhebern, {auteurs}.

Jede vollständige oder teilweise Vervielfältigung, öffentliche Wiedergabe, Bearbeitung oder Nutzung ohne vorherige schriftliche Genehmigung ist untersagt (Artikel L.122-4 und L.335-2 des französischen Gesetzbuchs über geistiges Eigentum, Code de la propriété intellectuelle).

Für Nutzungs- oder Lizenzanfragen schreiben Sie uns bitte und nennen Sie dabei das Foto, den geplanten Verwendungszweck und die Nutzungsdauer.`,
    contact: 'Kontakt:',
    audienceTitle: 'Reichweitenmessung',
    audience: 'Diese Website zählt ihre Besuche anonym, ohne Cookies und ohne externe Dienste: Anzahl der aufgerufenen Seiten und Fotos, Anzahl der Besucher pro Tag, Land (von unserem Hoster Cloudflare übermittelt), verweisende Website. Es werden weder IP-Adressen noch Kennungen gespeichert, und die Zähler werden nach 25 Monaten gelöscht. Wenn Ihr Browser signalisiert, dass Sie nicht verfolgt werden möchten („Do Not Track“ oder „Global Privacy Control“), werden Ihre Besuche nicht gezählt.',
    nav: { series: 'Serien', gallery: 'Galerie', map: 'Karte', about: 'Über uns', label: 'Navigation', langs: 'Sprache' },
    footer: { photos: 'Fotografien', noRepro: 'alle Rechte vorbehalten' },
  },
};
export const LANGS = Object.keys(RIGHTS);

// « Sébastien et Julien », « Sébastien and Julien »…
export function joinNames(names, lang, fallback) {
  if (!names.length) return fallback;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')}${RIGHTS[lang].and}${names.at(-1)}` : names[0];
}

export function rightsText(settings, lang, names, siteName) {
  const own = String(settings[RIGHTS[lang].setting] || '').trim();
  return own || RIGHTS[lang].text.replace('{auteurs}', joinNames(names, lang, siteName));
}

// Textes par défaut des trois langues, avec les noms des auteurs du moment (affichés dans l'admin).
export function rightsDefaults(names, siteName) {
  return Object.fromEntries(LANGS.map(l => [l, rightsText({}, l, names, siteName)]));
}

// Un texte envoyé par l'admin identique au texte par défaut est enregistré vide : il reste « par défaut »
// et suit les changements de noms d'auteurs. Comparaison sans tenir compte des espaces et retours à la ligne.
const norm = v => String(v ?? '').replace(/\r\n?/g, '\n').split('\n').map(l => l.trim().replace(/\s+/g, ' ')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
export function withoutDefaults(body, defaults) {
  const out = { ...body };
  for (const l of LANGS) {
    const key = RIGHTS[l].setting;
    if (key in out && norm(out[key]) === norm(defaults[l])) out[key] = '';
  }
  return out;
}
