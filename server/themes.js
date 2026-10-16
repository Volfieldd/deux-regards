// Thèmes du site public. Un thème = une entrée ici + (éventuellement) une feuille dans public/themes/.
// La feuille ne fait que redéfinir des variables CSS (couleurs, polices) et quelques règles de
// typographie, sous la classe posée sur <html>. Voir docs/wiki/Apparence-et-thèmes.md.
export const THEMES = {
  atelier: {
    label: 'Atelier',
    description: 'Papier chaud, Cormorant Garamond en italique, accent « lampe inactinique ». Le thème d’origine.',
    stylesheet: null,
    classes: '',
    scheme: 'light',
    // Police chargée en priorité (celle des titres de l'ouverture) ; aucune si le thème n'en déclare pas.
    preload: '/fonts/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff2',
  },
  'nicephos-nuit': {
    label: 'Nicephos — nuit',
    description: 'Galerie noire, trait blanc du logo, capitales espacées en Jost léger, accent sable.',
    stylesheet: 'themes/nicephos.css',
    classes: 'theme-nicephos mode-nuit',
    scheme: 'dark',
    preload: '/fonts/jost/files/jost-latin-300-normal.woff2',   // Jost léger : texte et titres (aucune italique)
  },
  'nicephos-jour': {
    label: 'Nicephos — jour',
    description: 'La même identité sur fond blanc, encre noire.',
    stylesheet: 'themes/nicephos.css',
    classes: 'theme-nicephos mode-jour',
    scheme: 'light',
    preload: '/fonts/jost/files/jost-latin-300-normal.woff2',
  },
};
export const DEFAULT_THEME = 'atelier';
export const BRAND_MODES = { texte: 'Nom du site seulement', embleme: 'Emblème + nom (+ sous-titre)' };
export const BRAND_DEFAULTS = {
  mode: 'texte', subtitle: '',
  emblem: null, ratio: null,            // dessin de l'en-tête (masque)
  icon: null, iconRatio: null,          // version simplifiée : en-tête sur mobile, icône d'onglet (masque)
  logotype: null, logotypeRatio: null,  // logo complet : en tête de « À propos » (masque)
  share: null,                          // image d'aperçu sur les réseaux (pages sans photo)
  favicon64: null, favicon180: null,
};

// Emplacements de marque envoyés depuis l'admin. Les masques prennent la couleur du thème.
export const BRAND_SLOTS = {
  embleme: { field: 'emblem', ratio: 'ratio', kind: 'mask', label: 'Emblème (dessin)',
    help: 'Le dessin seul, sans texte : il s’affiche à côté du nom, dans l’en-tête. Trait sombre sur fond clair, clair sur fond sombre, ou détouré.' },
  icone: { field: 'icon', ratio: 'iconRatio', kind: 'icon', label: 'Icône (version simplifiée)',
    help: 'Version à trait épais, lisible en petit : icône d’onglet, et emblème de l’en-tête sur téléphone. Carré de 512 px idéalement.' },
  logotype: { field: 'logotype', ratio: 'logotypeRatio', kind: 'mask', label: 'Logo complet',
    help: 'Le logo avec le nom (version horizontale) : affiché en grand en tête de la page « À propos ».' },
  partage: { field: 'share', kind: 'share', label: 'Image de partage',
    help: 'Aperçu quand une page sans photo (À propos, Droits…) est partagée sur un réseau social. Carré 1080 px ou 1200 × 630, utilisé tel quel.' },
};
