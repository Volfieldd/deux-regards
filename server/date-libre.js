// Date d'une rencontre tapée à la main sur la page /bonjour (maquette MQ-05 : le calendrier natif de type="date" suit la
// langue du navigateur, pas celle de la page). Lue en français, en anglais et en allemand, quelle que soit la langue de
// la page : « 14/10/2026 », « 14.10.2026 », « 2026-10-14 », « 12 mars », « mercredi 14 octobre 2026 », « 12. März »,
// « March 12, 2026 », « 3rd December », « hier soir », « yesterday », « vorgestern ».
//   - Jour et mois en chiffres : le jour d'abord (France, Allemagne) ; « 10/14/2026 », qui ne se lit qu'au mois d'abord,
//     est lu ainsi. En anglais, « 03/12/2025 » se lit des deux façons (Royaume-Uni, États-Unis) : refusé, avec la
//     demande d'écrire le mois en lettres, plutôt que deviné.
//   - Sans année : la dernière fois que ce jour est passé (le 20 octobre, « 12 mars » est le 12 mars de cette année,
//     « 3 décembre » celui de l'année dernière).
//   - Refusées : un jour qui n'existe pas (31/02), un jour à venir, avant l'an 2000.
// Saisie hostile : longueur vérifiée avant toute lecture (40 signes, le maxlength de la page) ; puis un seul découpage
// par une classe de caractères et des recherches dans des tables : aucune expression à retour arrière, temps borné.
// Rien n'est gardé de la saisie elle-même : seulement le jour lu, AAAA-MM-JJ.

export const MAX_DATE = 40;

const MONTHS = new Map(Object.entries({
  janvier: 1, janv: 1, jan: 1, january: 1, januar: 1, janner: 1,
  fevrier: 2, fevr: 2, fev: 2, february: 2, feb: 2, februar: 2,
  mars: 3, mar: 3, march: 3, marz: 3, maerz: 3,
  avril: 4, avr: 4, april: 4, apr: 4,
  mai: 5, may: 5,
  juin: 6, june: 6, jun: 6, juni: 6,
  juillet: 7, juil: 7, july: 7, jul: 7, juli: 7,
  aout: 8, august: 8, aug: 8,
  septembre: 9, sept: 9, sep: 9, september: 9,
  octobre: 10, oct: 10, october: 10, oktober: 10, okt: 10,
  novembre: 11, nov: 11, november: 11,
  decembre: 12, dec: 12, december: 12, dezember: 12, dez: 12,
}));
// Mots sans effet sur le jour : jours de la semaine, articles et prépositions, moments de la journée.
const SKIP = new Set([
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
  'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonnabend', 'sonntag',
  'le', 'la', 'l', 'du', 'de', 'en', 'au', 'vers', 'ce', 'cette', 'the', 'of', 'on', 'in', 'this', 'around', 'am', 'den', 'der', 'im', 'um', 'gegen', 'diesen',
  'matin', 'midi', 'apres', 'soir', 'soiree', 'nuit', 'morning', 'afternoon', 'evening', 'night', 'noon', 'tonight',
  'vormittag', 'mittag', 'nachmittag', 'abend', 'abends', 'nacht', 'fruh', 'frueh',
]);
// Jours relatifs (décalage depuis aujourd'hui). « morgen » : demain seul, le matin après « heute » ou « gestern ».
const RELATIVE = new Map(Object.entries({ aujourdhui: 0, aujourd: 0, hui: 0, today: 0, tonight: 0, heute: 0, hier: -1, yesterday: -1, gestern: -1, vorgestern: -2, demain: 1, tomorrow: 1, morgen: 1 }));

const SPLIT = /[\s,;/.\-–—'’()]+/;
const DIGITS = /^\d{1,4}$/;
// Ordinal : « 1er », « 1re », « 1st », « 2nd », « 3rd », « 12th », « 2e » (au plus 2 chiffres et 2 lettres).
const ORDINAL = /^(\d{1,2})(?:er|re|e|st|nd|rd|th)$/;

const pad = n => String(n).padStart(2, '0');
const exists = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d;
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const shift = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// Jour de Paris (AAAA-MM-JJ) à l'instant donné.
export const parisToday = (at = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(at);

// readDay(saisie, { lang, today }) → { day: 'AAAA-MM-JJ' } ; { error: 'date' | 'date_impossible' | 'date_ambigue' |
// 'date_future' } ; { error: 'date', tooLong: true } au-delà de 40 signes ; null si rien n'est saisi.
export function readDay(input, { lang = 'fr', today = parisToday() } = {}) {
  if (input == null) return null;
  const raw = String(input);
  if (raw.length > MAX_DATE) return { error: 'date', tooLong: true };
  const s = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (!s) return null;
  const nums = [], months = [];
  let rel = null, relWords = 0, avant = false, before = false, last = false;
  const tokens = s.split(SPLIT).filter(Boolean);
  for (const [i, tok] of tokens.entries()) {
    if (DIGITS.test(tok)) { nums.push(tok); continue; }
    const o = ORDINAL.exec(tok);
    if (o) { nums.push(o[1]); continue; }
    if (MONTHS.has(tok)) { months.push(MONTHS.get(tok)); continue; }
    // « heute Morgen », « gestern Morgen » : le matin, pas demain.
    if (tok === 'morgen' && rel !== null) continue;
    if (RELATIVE.has(tok)) {
      // « aujourd'hui » : deux morceaux, un seul mot.
      if (!(tok === 'hui' && tokens[i - 1] === 'aujourd')) relWords++;
      rel = RELATIVE.get(tok);
      continue;
    }
    if (tok === 'avant') { avant = true; continue; }                 // « avant-hier »
    if (tok === 'day' || tok === 'before') { before = true; continue; } // « the day before yesterday »
    if (tok === 'last') { last = true; continue; }                   // « last night »
    if (SKIP.has(tok)) continue;
    return { error: 'date' };
  }
  if (rel !== null || last) {
    if (nums.length || months.length || relWords > 1) return { error: 'date' };
    let n = rel ?? -1;                                                 // « last night » : hier soir
    if (avant || before) { if (n !== -1) return { error: 'date' }; n = -2; }
    if (n > 0) return { error: 'date_future' };
    return { day: shift(today, n) };
  }
  if (avant || before) return { error: 'date' };
  const [ty, tm, td] = today.split('-').map(Number);
  const year = y => (y.length === 4 ? Number(y) : y.length === 2 ? 2000 + Number(y) : NaN);
  // Sans année : cette année, ou l'année dernière si ce jour n'est pas encore passé.
  const settle = (m, d, y) => {
    if (y === undefined) {
      if (!exists(ty, m, d) && !(m === 2 && d === 29)) return { error: 'date_impossible' };
      let yy = ty;
      if (m > tm || (m === tm && d > td)) yy -= 1;
      // 29 février d'une année qui n'en a pas : la dernière année bissextile.
      while (!exists(yy, m, d) && yy > ty - 8) yy -= 1;
      return check(yy, m, d);
    }
    return check(y, m, d);
  };
  const check = (y, m, d) => {
    if (!Number.isInteger(y) || y < 2000) return { error: 'date_impossible' };
    if (!exists(y, m, d)) return { error: 'date_impossible' };
    const day = iso(y, m, d);
    return day > today ? { error: 'date_future' } : { day };
  };
  if (months.length > 1) return { error: 'date' };
  if (months.length === 1) {
    // Le mois en lettres : le jour (1 ou 2 chiffres), et peut-être l'année (4 chiffres, ou 2 après le jour).
    const m = months[0];
    if (!nums.length || nums.length > 2) return { error: 'date' };
    const short = nums.filter(n => n.length <= 2);
    const long = nums.filter(n => n.length === 4);
    if (nums.some(n => n.length === 3)) return { error: 'date' };
    if (nums.length === 1) return short.length ? settle(m, Number(short[0])) : { error: 'date' };
    if (long.length === 1 && short.length === 1) return settle(m, Number(short[0]), year(long[0]));
    if (short.length === 2) return settle(m, Number(short[0]), year(short[1]));
    return { error: 'date' };
  }
  // Tout en chiffres : AAAA-MM-JJ, ou jour et mois (dans un ordre ou l'autre), avec ou sans année.
  if (nums.length === 3 && nums[0].length === 4) {
    if (nums[1].length > 2 || nums[2].length > 2) return { error: 'date' };
    return check(Number(nums[0]), Number(nums[1]), Number(nums[2]));
  }
  if (nums.length < 2 || nums.length > 3 || nums[0].length > 2 || nums[1].length > 2) return { error: 'date' };
  if (nums[2] !== undefined && nums[2].length !== 2 && nums[2].length !== 4) return { error: 'date' };
  const a = Number(nums[0]), b = Number(nums[1]);
  const y = nums[2] === undefined ? undefined : year(nums[2]);
  const okYear = y === undefined ? ty : y;
  const dm = exists(okYear, b, a) || (y === undefined && b === 2 && a === 29);
  const md = exists(okYear, a, b) || (y === undefined && a === 2 && b === 29);
  if (dm && md && a !== b && lang === 'en') return { error: 'date_ambigue' };
  if (dm) return settle(b, a, y);
  if (md) return settle(a, b, y);
  return { error: a > 31 || b > 31 || (a > 12 && b > 12) ? 'date' : 'date_impossible' };
}
