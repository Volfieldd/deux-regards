// Mentions légales (France, LCEN art. 1-1, ex-art. 6 depuis la loi SREN) / Impressum (Allemagne, § 5 DDG et § 18 MStV)
// / Legal notice : qui édite le site, comment le joindre, qui en est le directeur de la publication, où il est hébergé.
// Rédigées ici, remplies avec les réglages de l'admin (Droits & confidentialité → Mentions légales) : rien n'est
// inventé, un champ vide n'apparaît pas.
// d : { site, names, address (lignes), email, phone, director, host, hosting }. Un paragraphe est un texte, ou
// { text, link, href } : un texte suivi d'un lien (l'e-mail, en « mailto: »).
// hosting : null (valeur par défaut : le site est hébergé par ses éditeurs) ou { name, address, phone } d'un hébergeur.
const lines = s => String(s || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const str = v => String(v || '').trim();
// Hébergeur nommé : « {nom}, {adresse sur une ligne}, {téléphone} » (LCEN art. 1-1 : nom, adresse, téléphone).
const hostOf = h => [h.name, lines(h.address).join(', '), h.phone].map(str).filter(Boolean).join(', ');
// Adresse e-mail (même forme que les liens « mailto: » des pages publiques) : le contact de la confidentialité peut
// être un lien https://, qui ne vaut pas e-mail dans les mentions.
export const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(v));
const mail = (label, e) => (isEmail(e) ? { text: label, link: str(e), href: `mailto:${str(e)}` } : `${label}${str(e)}`);

export const LEGAL = {
  fr: {
    title: 'Mentions légales',
    description: site => `Mentions légales du site ${site} : éditeurs, contact, directeur de la publication, hébergement.`,
    sections: d => [
      ['Éditeurs du site', [d.names, ...lines(d.address)].filter(Boolean)],
      ['Contact', [d.email && mail('E-mail : ', d.email), d.phone && `Téléphone : ${d.phone}`].filter(Boolean)],
      ['Directeur de la publication', [d.director].filter(Boolean)],
      ['Hébergement', [
        d.hosting ? hostOf(d.hosting) && `Le site est hébergé par ${hostOf(d.hosting)}.` : 'Le site est hébergé par ses éditeurs, sur leur propre serveur, en France, à l’adresse ci-dessus.',
        'Le trafic transite par Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, États-Unis), qui assure l’acheminement sécurisé des pages.',
      ].filter(Boolean)],
      ['Propriété intellectuelle', [`Les photographies et les textes de ${d.site} sont protégés par le droit d’auteur. Toute reproduction sans autorisation est interdite ; voir la page « Droits d’utilisation » (${d.host}/droits).`]],
      ['Données personnelles', [`Voir la page « Confidentialité » (${d.host}/confidentialite).`]],
    ].filter(([, ps]) => ps.length),
  },
  en: {
    title: 'Legal notice',
    description: site => `Legal notice of ${site}: publishers, contact, person responsible, hosting.`,
    sections: d => [
      ['Publishers', [d.names, ...lines(d.address)].filter(Boolean)],
      ['Contact', [d.email && mail('Email: ', d.email), d.phone && `Phone: ${d.phone}`].filter(Boolean)],
      ['Responsible for the content', [d.director].filter(Boolean)],
      ['Hosting', [
        d.hosting ? hostOf(d.hosting) && `The website is hosted by ${hostOf(d.hosting)}.` : 'The website is hosted by its publishers, on their own server in France, at the address above.',
        'Traffic passes through Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA), which delivers the pages securely.',
      ].filter(Boolean)],
      ['Copyright', [`The photographs and texts of ${d.site} are protected by copyright. Any reproduction without permission is prohibited; see the “Terms of use” page (${d.host}/en/droits).`]],
      ['Personal data', [`See the “Privacy” page (${d.host}/en/confidentialite).`]],
    ].filter(([, ps]) => ps.length),
  },
  de: {
    title: 'Impressum',
    description: site => `Impressum von ${site}: Anbieter, Kontakt, Verantwortliche, Hosting.`,
    sections: d => [
      ['Angaben gemäß § 5 DDG', [d.names, ...lines(d.address)].filter(Boolean)],
      ['Kontakt', [d.email && mail('E-Mail: ', d.email), d.phone && `Telefon: ${d.phone}`].filter(Boolean)],
      ['Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV', [d.director, d.director && lines(d.address).join(', ')].filter(Boolean)],
      ['Hosting', [
        d.hosting ? hostOf(d.hosting) && `Die Website wird gehostet von ${hostOf(d.hosting)}.` : 'Die Website wird von ihren Anbietern auf einem eigenen Server in Frankreich unter der oben genannten Anschrift betrieben.',
        'Der Datenverkehr läuft über Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA), die die Seiten sicher ausliefert.',
      ].filter(Boolean)],
      ['Urheberrecht', [`Die Fotografien und Texte von ${d.site} sind urheberrechtlich geschützt. Jede Vervielfältigung ohne Genehmigung ist untersagt; siehe die Seite „Nutzungsrechte“ (${d.host}/de/droits).`]],
      ['Datenschutz', [`Siehe die Seite „Datenschutz“ (${d.host}/de/confidentialite).`]],
    ].filter(([, ps]) => ps.length),
  },
};

// Hébergement réglé dans l'admin : « editeurs » (par défaut, la page ne change pas) ou « hebergeur » (nommé).
export const hostingOf = s => (s.legal_host === 'hebergeur'
  ? { name: str(s.legal_host_name), address: str(s.legal_host_address), phone: str(s.legal_host_phone) }
  : null);

// E-mail des mentions : le sien, sinon le contact de la confidentialité s'il s'agit d'une adresse e-mail.
export const legalEmail = s => str(s.legal_email) || (isEmail(s.privacy_contact) ? str(s.privacy_contact) : '');

// Ce que la loi demande et qui manque encore (pour l'admin) : noms, adresse postale, e-mail, téléphone, directeur de la
// publication ; et, chez un hébergeur, son nom, son adresse et son téléphone (LCEN art. 1-1 ; § 5 DDG).
export function legalMissing(s) {
  const missing = [];
  if (!str(s.legal_names)) missing.push('names');
  if (!lines(s.legal_address).length) missing.push('address');
  if (!legalEmail(s)) missing.push('email');
  if (!str(s.legal_phone)) missing.push('phone');
  if (!str(s.legal_director)) missing.push('director');
  const h = hostingOf(s);
  if (h && !h.name) missing.push('host_name');
  if (h && !lines(h.address).length) missing.push('host_address');
  if (h && !h.phone) missing.push('host_phone');
  return missing;
}
