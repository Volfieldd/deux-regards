const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// '2024-03' ou '2024-03-14' → 'mars 2024'
export function monthYear(takenOn) {
  const m = /^(\d{4})-(\d{2})/.exec(takenOn || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

export const pad = n => String(n).padStart(2, '0');
