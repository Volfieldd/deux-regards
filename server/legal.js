// Mentions légales (France, LCEN art. 6) / Impressum (Allemagne, § 5 DDG et § 18 MStV) / Legal notice : qui édite le
// site, comment le joindre, qui en est responsable, où il est hébergé. Rédigées ici, remplies avec les réglages de
// l'admin (Droits & confidentialité → Mentions légales) : rien n'est inventé, un champ vide n'apparaît pas.
// d : { site, names, address (lignes), email, phone, director, host }.
const lines = s => String(s || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

export const LEGAL = {
  fr: {
    title: 'Mentions légales',
    description: site => `Mentions légales du site ${site} : éditeurs, contact, responsable de la publication, hébergement.`,
    sections: d => [
      ['Éditeurs du site', [d.names, ...lines(d.address)].filter(Boolean)],
      ['Contact', [d.email && `E-mail : ${d.email}`, d.phone && `Téléphone : ${d.phone}`].filter(Boolean)],
      ['Responsable de la publication', [d.director].filter(Boolean)],
      ['Hébergement', [
        'Le site est hébergé par ses éditeurs, sur leur propre serveur, en France, à l’adresse ci-dessus.',
        'Le trafic transite par Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, États-Unis), qui assure l’acheminement sécurisé des pages.',
      ]],
      ['Propriété intellectuelle', [`Les photographies et les textes de ${d.site} sont protégés par le droit d’auteur. Toute reproduction sans autorisation est interdite ; voir la page « Droits d’utilisation » (${d.host}/droits).`]],
      ['Données personnelles', [`Voir la page « Confidentialité » (${d.host}/confidentialite).`]],
    ].filter(([, ps]) => ps.length),
  },
  en: {
    title: 'Legal notice',
    description: site => `Legal notice of ${site}: publishers, contact, person responsible, hosting.`,
    sections: d => [
      ['Publishers', [d.names, ...lines(d.address)].filter(Boolean)],
      ['Contact', [d.email && `Email: ${d.email}`, d.phone && `Phone: ${d.phone}`].filter(Boolean)],
      ['Responsible for the content', [d.director].filter(Boolean)],
      ['Hosting', [
        'The website is hosted by its publishers, on their own server in France, at the address above.',
        'Traffic passes through Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA), which delivers the pages securely.',
      ]],
      ['Copyright', [`The photographs and texts of ${d.site} are protected by copyright. Any reproduction without permission is prohibited; see the “Terms of use” page (${d.host}/en/droits).`]],
      ['Personal data', [`See the “Privacy” page (${d.host}/en/confidentialite).`]],
    ].filter(([, ps]) => ps.length),
  },
  de: {
    title: 'Impressum',
    description: site => `Impressum von ${site}: Anbieter, Kontakt, Verantwortliche, Hosting.`,
    sections: d => [
      ['Angaben gemäß § 5 DDG', [d.names, ...lines(d.address)].filter(Boolean)],
      ['Kontakt', [d.email && `E-Mail: ${d.email}`, d.phone && `Telefon: ${d.phone}`].filter(Boolean)],
      ['Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV', [d.director, d.director && lines(d.address).join(', ')].filter(Boolean)],
      ['Hosting', [
        'Die Website wird von ihren Anbietern auf einem eigenen Server in Frankreich unter der oben genannten Anschrift betrieben.',
        'Der Datenverkehr läuft über Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA), die die Seiten sicher ausliefert.',
      ]],
      ['Urheberrecht', [`Die Fotografien und Texte von ${d.site} sind urheberrechtlich geschützt. Jede Vervielfältigung ohne Genehmigung ist untersagt; siehe die Seite „Nutzungsrechte“ (${d.host}/de/droits).`]],
      ['Datenschutz', [`Siehe die Seite „Datenschutz“ (${d.host}/de/confidentialite).`]],
    ].filter(([, ps]) => ps.length),
  },
};

// Ce que la loi demande et qui manque encore (pour l'admin) : noms, adresse postale, e-mail, responsable.
export function legalMissing(s) {
  const missing = [];
  if (!String(s.legal_names || '').trim()) missing.push('names');
  if (!lines(s.legal_address).length) missing.push('address');
  if (!String(s.legal_email || s.privacy_contact || '').trim()) missing.push('email');
  if (!String(s.legal_director || '').trim()) missing.push('director');
  return missing;
}
