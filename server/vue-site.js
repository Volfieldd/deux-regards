import { PREFIX } from './i18n.js';

// Bouton « Voir en v1 / Voir en v2 » des pages publiques (server/version-publique.js, vue de la session) : montré à
// l'administrateur connecté qui a le droit d'apparence, jamais à un visiteur ni sur les pages des invités des galeries
// privées. Un formulaire POST (jeton CSRF de la session) vers /admin/apparence/apercu-v2, qui revient à la même page.
// Le libellé dit ce que fait le clic ; la phrase à côté dit ce que voient les visiteurs. Langue : celle de la page.
const TEXTES = {
  fr: {
    label: 'Version du site, visible par vous seul',
    voir: v => `Voir en ${v}`, accueil: v => `Voir l’accueil en ${v}`,
    seul: (v, pub) => `Vous seul voyez la ${v} ; les visiteurs voient la ${pub}.`,
    comme: v => `Vous voyez la ${v}, comme les visiteurs.`,
    seulementV2: 'Cette page n’existe qu’en v2.', pasDeV2: 'Cette page n’a pas encore de v2.',
  },
  en: {
    label: 'Site version, visible to you only',
    voir: v => `View in ${v}`, accueil: v => `View the home page in ${v}`,
    seul: (v, pub) => `Only you see ${v}; visitors see ${pub}.`,
    comme: v => `You see ${v}, like visitors.`,
    seulementV2: 'This page only exists in v2.', pasDeV2: 'This page has no v2 yet.',
  },
  de: {
    label: 'Website-Version, nur für Sie sichtbar',
    voir: v => `In ${v} ansehen`, accueil: v => `Startseite in ${v} ansehen`,
    seul: (v, pub) => `Nur Sie sehen ${v}; die Besucher sehen ${pub}.`,
    comme: v => `Sie sehen ${v}, wie die Besucher.`,
    seulementV2: 'Diese Seite gibt es nur in v2.', pasDeV2: 'Diese Seite hat noch keine v2.',
  },
};
export const VUE_TEXTES = TEXTES;

// pv : app.publicVersion.forRequest(request) ; rendu : version du gabarit rendu (« v2 », ou « v1 » faute de gabarit v2) ;
// sansV1 : la page n'a pas de gabarit v1 (les Carnets).
export function vueSite({ pv, lang, url, csrf, rendu, sansV1 }) {
  const t = TEXTES[lang] || TEXTES.fr;
  const cible = pv.version === 'v2' ? 'v1' : 'v2';
  // Une page née avec la v2 (Carnets) est introuvable en v1, comme pour un visiteur : le bouton n'y mène pas, il ouvre
  // l'accueil en v1 et le dit.
  const accueil = cible === 'v1' && sansV1;
  return {
    csrf, label: t.label, forced: pv.forced,
    // Revenir à la version des visiteurs, c'est oublier la vue (« suivre » le réglage), pas la forcer.
    vue: cible === pv.applied ? 'suivre' : cible,
    vers: accueil ? PREFIX[lang] || '/' : url,
    bouton: accueil ? t.accueil(cible) : t.voir(cible),
    etat: pv.forced ? t.seul(pv.version, pv.applied) : t.comme(pv.version),
    note: accueil ? t.seulementV2 : pv.version === 'v2' && rendu === 'v1' ? t.pasDeV2 : '',
  };
}
