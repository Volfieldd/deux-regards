// Aides de présentation de la console de la Vigie (phase D3a) : pures, sans accès à la base (seule dépendance : le calcul des
// adresses, commun au site et à la Vigie, server/securite/adresses-ip.js).

// Écriture du lexique des maquettes (docs/maquettes-vigie/LEXIQUE-ET-DONNEES.md, § 2) : dates abrégées à l'heure de Paris
// (« sam. 17 oct., 14 h 02 »), heures « 14 h 02 », nombres « 1 248 », espaces insécables. Le fuseau est celui de Paris, heure
// d'été comprise, quel que soit celui du serveur (Intl, base de fuseaux de Node).

export const NBSP = ' ';            // espace insécable : « 14 h 02 », « 17 oct. », « 1 248 »
export const FINE = ' ';     // espace fine insécable : avant « : ; ! ? », dans les guillemets

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
// Abréviations de l'Imprimerie nationale (celles d'Intl en français) : « mai », « juin », « août » n'en ont pas.
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const PARIS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
});

// Composantes d'un instant à l'heure de Paris : { annee, mois (1-12), jour, jourSemaine (0 = dimanche), heure, minute }.
export function paris(t) {
  const d = t instanceof Date ? t : new Date(Number(t));
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(PARIS.formatToParts(d).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  const jourSemaine = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { annee: p.year, mois: p.month, jour: p.day, jourSemaine, heure: p.hour % 24, minute: p.minute };
}

// Minuit à Paris (début du jour, à Paris, de l'instant t), en millisecondes. Le décalage horaire de minuit n'est pas
// toujours celui de t (jours de changement d'heure : à midi le 29 mars, Paris est à UTC+2, mais minuit était à UTC+1) :
// deux passes, la seconde avec le décalage de l'instant trouvé par la première (audit D3-D8).
export function minuitParis(t) {
  const p = paris(t);
  if (!p) return NaN;
  const decalage = x => { const q = paris(x); return Date.UTC(q.annee, q.mois - 1, q.jour, q.heure, q.minute) - Math.floor(x / 60e3) * 60e3; };
  const minuit = Date.UTC(p.annee, p.mois - 1, p.jour);
  const m = minuit - decalage(Number(t instanceof Date ? t.getTime() : t));
  return minuit - decalage(m);
}

const deux = n => String(n).padStart(2, '0');
const memeJour = (a, b) => a && b && a.annee === b.annee && a.mois === b.mois && a.jour === b.jour;

// « 14 h 02 » (heures sur deux chiffres, comme les messages de la Vigie : vigie/notifications.js, hourOf).
export function heure(t) {
  const p = paris(t);
  return p ? `${deux(p.heure)}${NBSP}h${NBSP}${deux(p.minute)}` : '—';
}

// « sam. 17 oct. »
export function jour(t) {
  const p = paris(t);
  return p ? `${JOURS[p.jourSemaine]}${NBSP}${p.jour}${NBSP}${MOIS[p.mois - 1]}` : '—';
}

// « ven. 16 oct., 18 h 25 »
export function dateHeure(t) {
  const p = paris(t);
  return p ? `${jour(t)}, ${heure(t)}` : '—';
}

// L'heure seule si l'instant est du même jour (à Paris) que maintenant, sinon la date et l'heure.
export function quand(t, maintenant = Date.now()) {
  const p = paris(t);
  if (!p) return '—';
  return memeJour(p, paris(maintenant)) ? heure(t) : dateHeure(t);
}

// « à 15 h 10 » le même jour, « au sam. 24 oct., 10 h 00 » sinon (à compléter par « jusqu’ »).
export function jusqua(t, maintenant = Date.now()) {
  const p = paris(t);
  if (!p) return '';
  return memeJour(p, paris(maintenant)) ? `jusqu’à ${heure(t)}` : `jusqu’au ${dateHeure(t)}`;
}

// « il y a 3 min », « il y a 2 h », « il y a 3 jours » ; « à l’instant » sous une minute ; un instant à venir : « dans … ».
export function ilYa(t, maintenant = Date.now()) {
  const ms = Number(maintenant) - Number(t instanceof Date ? t.getTime() : t);
  if (!Number.isFinite(ms)) return '—';
  const futur = ms < 0;
  const a = Math.abs(ms);
  if (a < 60e3) return 'à l’instant';
  let txt;
  if (a < 3600e3) txt = `${Math.floor(a / 60e3)}${NBSP}min`;
  else if (a < 864e5) txt = `${Math.floor(a / 3600e3)}${NBSP}h`;
  else { const j = Math.floor(a / 864e5); txt = `${j}${NBSP}jour${j > 1 ? 's' : ''}`; }
  return futur ? `dans ${txt}` : `il y a ${txt}`;
}

// Une durée : « 30 min », « 1 h », « 4 h 30 », « 7 jours ».
export function duree(ms) {
  const n = Math.round(Number(ms) / 60e3);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 60) return `${n}${NBSP}min`;
  if (n < 48 * 60) { const h = Math.floor(n / 60), m = n % 60; return m ? `${h}${NBSP}h${NBSP}${deux(m)}` : `${h}${NBSP}h`; }
  const j = Math.round(n / 1440);
  return `${j}${NBSP}jour${j > 1 ? 's' : ''}`;
}

// « 1 248 » (espace insécable comme séparateur des milliers).
export function nombre(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const [ent, dec] = Math.abs(v).toString().split('.');
  const groupes = ent.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${v < 0 ? '−' : ''}${groupes}${dec ? `,${dec}` : ''}`;
}

// Gravités : celles du code (vigie/vocabulaire.js) → le mot du lexique et la classe de la pastille (.grav--…).
const GRAVITES = {
  critique: { mot: 'Critique', classe: 'critique', pluriel: 'critiques' },
  haut: { mot: 'Haute', classe: 'haute', pluriel: 'hautes' },
  moyen: { mot: 'Moyenne', classe: 'moyenne', pluriel: 'moyennes' },
  bas: { mot: 'Basse', classe: 'basse', pluriel: 'basses' },
  info: { mot: 'Info', classe: 'info', pluriel: 'info' },
};
export const gravite = g => GRAVITES[g] || GRAVITES.info;

// Même masquage pour les lectures et les adresses retirées des dossiers à l’échéance de conservation.
export { voitAdressesCompletes, cleReseau, formesReseau, adresseVue, adresseDetail, cibleBlocage, reseauVue, masquer } from '../masquage.js';

// Entre guillemets français, espaces fines insécables : « essai de la bordure ».
export const guillemets = s => `«${FINE}${s}${FINE}»`;
