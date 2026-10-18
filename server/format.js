const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const MONTH_YEAR = {
  en: new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
  de: new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
};

// '2024-03' ou '2024-03-14' → 'mars 2024' (« Mar 2024 », « März 2024 » sur les pages en anglais et en allemand)
export function monthYear(takenOn, lang = 'fr') {
  const m = /^(\d{4})-(\d{2})/.exec(takenOn || '');
  if (!m) return '';
  if (MONTH_YEAR[lang]) return MONTH_YEAR[lang].format(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export const pad = n => String(n).padStart(2, '0');

// Date abrégée d'une photo (site public v2, lexique de l'audit) : '2026-10-10' → « 10 oct. 2026 » (« 10 Oct 2026 »,
// « 10. Okt. 2026 ») ; une photo datée au mois garde « mars 2024 ». Espaces insécables : une date ne se coupe pas.
const DAY_MONTH_YEAR = Object.fromEntries(['fr', 'en', 'de'].map(l => [l, new Intl.DateTimeFormat({ fr: 'fr-FR', en: 'en-GB', de: 'de-DE' }[l], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })]));
export function shortDate(takenOn, lang = 'fr') {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(takenOn || '');
  const text = m ? (DAY_MONTH_YEAR[lang] || DAY_MONTH_YEAR.fr).format(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : monthYear(takenOn, lang);
  return text.replace(/ /g, '\u00a0');
}

// Heure de prise de vue du site public (lexique de l'audit) : '14:32' → « 14 h 32 », « 2:32 pm », « 14:32 Uhr » ; espaces
// insécables, l'heure ne se coupe pas. '' pour une heure mal formée.
export function clockTime(hhmm, lang = 'fr') {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm || '');
  if (!m) return '';
  const h = Number(m[1]), mm = m[2];
  if (lang === 'en') return `${h % 12 || 12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
  if (lang === 'de') return `${h}:${mm} Uhr`;
  return `${h} h ${mm}`;
}

// Heure qu'une photo montre sur le site : seulement si le photographe l'a choisi (show_time), que la date est au jour
// et que l'heure est connue ; sinon ''. Même règle que la colonne shown_time des requêtes publiques (server/repo.js).
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const shownTime = (p, lang = 'fr') => (Number(p?.show_time) === 1 && DAY_RE.test(p?.taken_on || '') ? clockTime(p.taken_time, lang) : '');
