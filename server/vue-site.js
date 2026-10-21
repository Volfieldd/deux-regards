import { DESIGNS } from './designs.js';
import { PREFIX } from './i18n.js';
import { VERSIONS } from './version-publique.js';

// Boutons « Voir en v1 / v2 / v3 » des pages publiques (server/version-publique.js, vue de la session) : montrés à
// l'administrateur connecté qui a le droit d'apparence, jamais à un visiteur ni sur les pages des invités des galeries
// privées. Un formulaire POST par version (jeton CSRF de la session) vers /admin/apparence/apercu-v2, qui revient à la
// même page. Le libellé dit ce que fait le clic ; la phrase à côté dit ce que voient les visiteurs. Langue : celle de la page.
const TEXTES = {
  fr: {
    label: 'Version du site, visible par vous seul',
    voir: v => `Voir en ${v}`, accueil: v => `Voir l’accueil en ${v}`,
    seul: (v, pub) => `Vous seul voyez la ${v} ; les visiteurs voient la ${pub}.`,
    comme: v => `Vous voyez la ${v}, comme les visiteurs.`,
    seulementV2: 'Cette page n’existe pas en v1.', pasDeV2: v => `Cette page n’a pas encore de ${v}.`,
  },
  en: {
    label: 'Site version, visible to you only',
    voir: v => `View in ${v}`, accueil: v => `View the home page in ${v}`,
    seul: (v, pub) => `Only you see ${v}; visitors see ${pub}.`,
    comme: v => `You see ${v}, like visitors.`,
    seulementV2: 'This page does not exist in v1.', pasDeV2: v => `This page has no ${v} yet.`,
  },
  de: {
    label: 'Website-Version, nur für Sie sichtbar',
    voir: v => `In ${v} ansehen`, accueil: v => `Startseite in ${v} ansehen`,
    seul: (v, pub) => `Nur Sie sehen ${v}; die Besucher sehen ${pub}.`,
    comme: v => `Sie sehen ${v}, wie die Besucher.`,
    seulementV2: 'Diese Seite gibt es in v1 nicht.', pasDeV2: v => `Diese Seite hat noch keine ${v}.`,
  },
};
export const VUE_TEXTES = TEXTES;

// Ordre des boutons : d'abord celui que l'on attend (la v1 depuis la v2, la v2 depuis la v1 ou la v3), puis l'autre.
const ORDRE = { v1: ['v2', 'v3'], v2: ['v1', 'v3'], v3: ['v2', 'v1'] };

// pv : app.publicVersion.forRequest(request) ; rendu : version du gabarit rendu (« v3 », « v2 », ou « v1 » faute de gabarit
// v2) ; sansV1 : la page n'a pas de gabarit v1 (les Carnets).
export function vueSite({ pv, lang, url, csrf, rendu, sansV1 }) {
  const t = TEXTES[lang] || TEXTES.fr;
  const actuelle = pv.design || pv.version;
  const historiques = VERSIONS.includes(actuelle) ? ORDRE[actuelle] : VERSIONS;
  const cibles = [...historiques, ...Object.keys(DESIGNS).filter(v => !VERSIONS.includes(v))].filter(v => v !== actuelle);
  const boutons = cibles.map(cible => {
    // Une page née avec la v2 (Carnets) est introuvable en v1, comme pour un visiteur : le bouton n'y mène pas, il ouvre
    // l'accueil en v1 et le dit.
    const accueil = cible === 'v1' && sansV1;
    // Revenir à la version des visiteurs, c'est oublier la vue (« suivre » le réglage), pas la forcer.
    return { vue: cible === (pv.appliedDesign || pv.applied) ? 'suivre' : cible, vers: accueil ? PREFIX[lang] || '/' : url, bouton: accueil ? t.accueil(cible) : t.voir(VERSIONS.includes(cible) ? cible : DESIGNS[cible].label) };
  });
  if (pv.darkroom || pv.configured || (pv.view && !VERSIONS.includes(pv.view))) {
    const labels = { fr: ['Présentation', 'Visiteurs', 'Revenir au thème des visiteurs'], en: ['Design', 'Visitors', 'Return to the visitors’ design'], de: ['Gestaltung', 'Besucher', 'Zur Besucheransicht zurückkehren'] }[lang] || ['Présentation', 'Visiteurs', 'Revenir au thème des visiteurs'];
    const current = DESIGNS[pv.design]?.label || pv.version;
    const applied = DESIGNS[pv.appliedDesign]?.label || pv.applied;
    return { csrf, label: labels[0], forced: pv.forced, boutons: [...boutons, { vue: 'suivre', vers: url, bouton: labels[2] }],
      ...boutons[0], etat: `${labels[0]} : ${current} · ${labels[1]} : ${applied}`, note: '' };
  }
  return {
    csrf, label: t.label, forced: pv.forced, boutons,
    // Champs du premier bouton, gardés à plat pour les gabarits et les tests qui n'en lisent qu'un.
    ...boutons[0],
    etat: pv.forced ? t.seul(pv.version, pv.applied) : t.comme(pv.version),
    note: pv.version !== 'v1' && sansV1 ? t.seulementV2 : pv.version !== 'v1' && rendu === 'v1' ? t.pasDeV2(pv.version) : '',
  };
}
