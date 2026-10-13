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
