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
  },
  'nicephos-nuit': {
    label: 'Nicephos — nuit',
    description: 'Galerie noire, trait blanc du logo, capitales espacées en Jost léger, accent sable.',
    stylesheet: 'themes/nicephos.css',
    classes: 'theme-nicephos mode-nuit',
    scheme: 'dark',
  },
  'nicephos-jour': {
    label: 'Nicephos — jour',
    description: 'La même identité sur fond blanc, encre noire.',
    stylesheet: 'themes/nicephos.css',
    classes: 'theme-nicephos mode-jour',
    scheme: 'light',
  },
};
export const DEFAULT_THEME = 'atelier';
export const BRAND_MODES = { texte: 'Nom du site seulement', embleme: 'Emblème + nom (+ sous-titre)' };
export const BRAND_DEFAULTS = { mode: 'texte', subtitle: '', emblem: null, favicon64: null, favicon180: null };
