// Aides de présentation de la console de la Vigie (phase D3a) : pures, sans accès à la base (seule dépendance : le calcul des
// adresses, commun au site et à la Vigie, server/securite/adresses-ip.js).
import { cleReseau as cleReseauCanon, lireIp, reseauDe } from '../../server/securite/adresses-ip.js';

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

// Seuls ces rôles voient les adresses complètes (annexe § 5.4, droit « adresses_completes » de droits.js) ; tout autre rôle,
// connu ou non, voit le réseau.
const VOIENT_ADRESSES = ['handler', 'analyst', 'admin'];
export const voitAdressesCompletes = r => VOIENT_ADRESSES.includes(r);

// Calcul commun au site et à la Vigie (forme canonique, /24, /48 : audit D3-C4, D3-D5).
export { cleReseau, formesReseau } from '../../server/securite/adresses-ip.js';

// Adresse vue par un rôle : un Lecteur voit le réseau (/24 en IPv4, /48 en IPv6), écrit avec son suffixe
// (« 198.51.100.0/24 », « 2001:db8:4::/48 ») ; les autres rôles, l'adresse complète. Une cible écrite en réseau garde son
// suffixe s'il est plus court (« 203.0.113.0/24 », « 198.0.0.0/8 ») ; dans tous les cas, un Lecteur ne voit que les bits du
// plus court des deux préfixes, les autres à zéro (« 198.51.100.7/24 » → « 198.51.100.0/24 », audit D3-C1).
export function adresseVue(ip, roleCourant) {
  return adresseDetail(ip, roleCourant).texte;
}

// Même chose, en disant si l'adresse affichée est tronquée (pour écrire « (tronquée) » à côté).
export function adresseDetail(ip, roleCourant) {
  const brut = String(ip ?? '').trim();
  if (!brut) return { texte: '', tronquee: false, v6: false };
  const [brutAdr, suffixe, ...reste] = brut.split('/');
  const a = lireIp(brutAdr);
  // Une IPv4 écrite en IPv6 (« ::ffff:192.0.2.1 ») se lit comme l'IPv4 qu'elle est.
  const v6 = a ? a.v === 6 : brutAdr.includes(':');
  if (voitAdressesCompletes(roleCourant)) return { texte: brut, tronquee: false, v6 };
  // Illisible : rien de l'adresse n'est montré à un Lecteur.
  if (!a || reste.length || (suffixe != null && !/^\d{1,3}$/.test(suffixe))) return { texte: 'masquée', tronquee: false, v6 };
  const max = a.v === 4 ? 32 : 128, limite = a.v === 4 ? 24 : 48;
  let prefixe = suffixe == null ? max : Number(suffixe);
  // Préfixe d'une IPv4 écrite en IPv6 : compté sur 128 bits.
  if (suffixe != null && a.v === 4 && brutAdr.includes(':')) prefixe = Math.max(0, prefixe - 96);
  if (prefixe > max) return { texte: 'masquée', tronquee: false, v6 };
  const montre = Math.min(prefixe, limite);
  const canon = a.v === 4 ? a.octets.join('.') : reseauDe(brutAdr);
  const reseau = reseauDe(canon, montre);
  return { texte: `${reseau}/${montre}`, tronquee: prefixe > limite || reseau !== canon, v6 };
}

// Cible d'un blocage (« 203.0.113.7/32 », « 2001:db8::7/128 », « 2001:db8::/32 ») : le suffixe d'une adresse seule retiré
// (/32 en IPv4, /128 en IPv6 ; un /32 IPv6 est un réseau et le garde).
export const cibleBlocage = c => String(c ?? '').replace(/^([\d.]+)\/32$/, '$1').replace(/^([^/]*:[^/]*)\/128$/, '$1');

// Réseau d'une clé de réseau (ip_net, clé d'une entité « reseau » : « 198.51.100.0 », « 2001:db8:4:: », sans suffixe) : la
// console ajoute /24 ou /48 à l'affichage (lexique § 3.10, point 4). Une clé non canonique (anciennes clés du site et de la
// Vigie, « 2a01::bad:: ») est toujours retronquée : jamais l'hôte. Illisible : « masquée » (sauf pour un rôle qui voit les
// adresses, à qui le texte est rendu tel quel).
export function reseauVue(cle, roleCourant = 'viewer') {
  const s = String(cle ?? '').trim();
  if (!s) return s;
  if (/\/\d{1,3}$/.test(s)) { const a = adresseDetail(s, 'viewer'); if (a.texte !== 'masquée') return a.texte; }
  const c = cleReseauCanon(s);
  if (c) return `${c}/${c.includes(':') ? 48 : 24}`;
  return voitAdressesCompletes(roleCourant) ? s : 'masquée';
}

// Adresses dans un texte d'opérateur ou venu du site (notes, motifs, détail d'un événement…) : pour un rôle qui ne voit pas
// les adresses complètes, chacune est ramenée à son réseau (adresseDetail), y compris écrite avec un suffixe, en IPv6
// abrégée, en IPv4 dans IPv6, collée à un mot (« confiance:198.51.100.44 ») ou sous une ancienne clé de réseau fausse
// (« 2a01::bad:: ») ; une suite de nombres pointés qui en contient une sans en être une (« 999.198.51.100.8 ») est masquée
// en entier. Les autres rôles lisent le texte tel quel. Une seule fonction pour toute la console (audit D3-C2).
const RE_ADRESSES = /(?<![0-9A-Za-z])(?:[0-9A-Fa-f]*:){2,}[0-9A-Fa-f]*(?:\.\d+)*(?:\/\d{1,3})?|(?<![\d.])\d+(?:\.\d+){3,}(?:\/\d{1,3})?/g;
export function masquer(texte, roleCourant) {
  const s = String(texte ?? '');
  if (voitAdressesCompletes(roleCourant)) return s;
  return s.replace(RE_ADRESSES, m => (m.includes(':') ? masque6(m) : masque4(m)));
}
const RE_V4 = /(?<![\d.])\d+(?:\.\d+){3,}(?:\/\d{1,3})?/g;
function masque4(run) {
  const [corps, suffixe] = run.split('/');
  const parts = corps.split('.');
  const ok = x => /^\d{1,3}$/.test(x) && Number(x) <= 255;
  if (parts.length === 4 && parts.every(ok)) return adresseDetail(`${parts.map(Number).join('.')}${suffixe != null ? `/${suffixe}` : ''}`, 'viewer').texte;
  for (let i = 0; i + 4 <= parts.length; i++) if (parts.slice(i, i + 4).every(ok)) return 'masquée';
  return run;
}
function masque6(run) {
  const i = run.lastIndexOf('/');
  const corps = i >= 0 && /^\d{1,3}$/.test(run.slice(i + 1)) ? run.slice(0, i) : run;
  const suffixe = corps === run ? null : run.slice(i + 1);
  if (!/[0-9A-Fa-f]/.test(corps)) return run;
  if (lireIp(corps)) return adresseDetail(run, 'viewer').texte;
  // Ancienne clé de réseau (« 2a01::bad:: », « 2606:4700::: ») : son réseau.
  if (/::$/.test(corps) && /:::|::.*::/.test(corps)) { const c = cleReseauCanon(corps); return c ? `${c}/48` : 'masquée'; }
  // Une adresse lisible dans la suite (mot collé avant, ponctuation après) : la plus à gauche, la plus longue.
  const bornes = [0, ...[...corps].flatMap((c, k) => (c === ':' ? [k + 1] : []))];
  for (const debut of bornes) {
    for (const fin of [corps.length, ...[...corps].flatMap((c, k) => (c === ':' ? [k] : [])).reverse()]) {
      if (fin - debut < 2) continue;
      const sous = corps.slice(debut, fin);
      if ((sous.match(/:/g) || []).length < 2 || !lireIp(sous)) continue;
      const finale = fin === corps.length && suffixe != null ? `/${suffixe}` : '';
      return `${corps.slice(0, debut)}${adresseDetail(sous + finale, 'viewer').texte}${masquer(corps.slice(fin), 'viewer')}${fin < corps.length && suffixe != null ? `/${suffixe}` : ''}`;
    }
  }
  // Rien de lisible en IPv6 : les IPv4 qu'elle contient (« x::ffff:192.0.2.1 »).
  return run.replace(RE_V4, masque4);
}

// Entre guillemets français, espaces fines insécables : « essai de la bordure ».
export const guillemets = s => `«${FINE}${s}${FINE}»`;
