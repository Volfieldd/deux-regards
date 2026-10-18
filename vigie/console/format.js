// Aides de présentation de la console de la Vigie (phase D3a) : pures, sans dépendance, sans accès à la base.
// Écriture du lexique des maquettes (docs/maquettes-vigie/LEXIQUE-ET-DONNEES.md, § 2) : dates abrégées à l'heure de Paris
// (« sam. 17 oct., 14 h 02 »), heures « 14 h 02 », nombres « 1 248 », espaces insécables. Le fuseau est celui de Paris, heure
// d'été comprise, quel que soit celui du serveur (Intl, base de fuseaux de Node).

const NBSP = ' ';            // espace insécable : « 14 h 02 », « 17 oct. », « 1 248 »
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

// Rôles de la console (annexe architecture, § 5.4).
export const ROLES = { viewer: 'Lecteur', handler: 'Intervenant', analyst: 'Analyste', admin: 'Administrateur' };
export const role = r => ROLES[r] || 'Lecteur';

// Adresse vue par un rôle : un Lecteur voit le réseau (/24 en IPv4, /48 en IPv6), écrit avec son suffixe
// (« 198.51.100.0/24 », « 2001:db8:4::/48 ») ; les autres rôles, l'adresse complète. Une cible déjà écrite en réseau
// (« 203.0.113.0/24 », décision de blocage) garde son suffixe ; plus étroite que /24 (/48), un Lecteur la voit tronquée.
export function adresseVue(ip, roleCourant) {
  return adresseDetail(ip, roleCourant).texte;
}

// Même chose, en disant si l'adresse affichée est tronquée (pour écrire « (tronquée) » à côté).
export function adresseDetail(ip, roleCourant) {
  const brut = String(ip ?? '').trim();
  if (!brut) return { texte: '', tronquee: false, v6: false };
  const [brutAdr, suffixe] = brut.split('/');
  // Une IPv4 écrite en IPv6 (« ::ffff:192.0.2.1 ») se lit comme l'IPv4 qu'elle est.
  const adr = /^::ffff:\d{1,3}(\.\d{1,3}){3}$/i.test(brutAdr) && suffixe == null ? brutAdr.slice(7) : brutAdr;
  const v6 = adr.includes(':');
  // Seuls les rôles qui voient les adresses complètes (annexe § 5.4) ; tout autre rôle, connu ou non, voit le réseau.
  if (['handler', 'analyst', 'admin'].includes(roleCourant)) return { texte: brut, tronquee: false, v6 };
  const limite = v6 ? 48 : 24;
  const prefixe = suffixe != null && /^\d{1,3}$/.test(suffixe) ? Number(suffixe) : (v6 ? 128 : 32);
  if (prefixe <= limite) return { texte: brut, tronquee: false, v6 };
  const reseau = v6 ? reseau48(adr) : reseau24(adr);
  // Illisible : rien de l'adresse n'est montré à un Lecteur.
  if (!reseau) return { texte: 'masquée', tronquee: false, v6 };
  return { texte: `${reseau}/${limite}`, tronquee: true, v6 };
}

// Réseau d'un réseau déjà tronqué par le site (server/ip.js, truncateIp : « 198.51.100.0 », « 2001:db8:4:: », sans suffixe) :
// la console ajoute /24 ou /48 à l'affichage (lexique § 3.10, point 4).
export function reseauVue(cle) {
  const s = String(cle ?? '').trim();
  if (!s || s.includes('/')) return s;
  return `${s}/${s.includes(':') ? 48 : 24}`;
}

function reseau24(adr) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(adr.startsWith('::ffff:') ? adr.slice(7) : adr);
  if (!m || m.slice(1).some(x => Number(x) > 255)) return null;
  return `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}.0`;
}

// Les trois premiers groupes d'une IPv6 (abrégée ou non), écrits sans zéros de tête, puis « :: ».
function reseau48(adr) {
  const a = adr.split('%')[0].toLowerCase();
  if (!/^[0-9a-f:.]+$/.test(a) || (a.match(/::/g) || []).length > 1) return null;
  let [gauche, droite] = a.includes('::') ? a.split('::') : [a, null];
  const g = gauche ? gauche.split(':') : [];
  const d = droite ? droite.split(':') : [];
  // Fin en IPv4 (« ::ffff:1.2.3.4 ») : deux groupes.
  const fin = (droite != null ? d : g).at(-1);
  if (fin && fin.includes('.')) {
    const v4 = reseau24(fin) && fin.split('.').map(Number);
    if (!v4) return null;
    const groupes = [((v4[0] << 8) | v4[1]).toString(16), ((v4[2] << 8) | v4[3]).toString(16)];
    if (droite != null) d.splice(-1, 1, ...groupes); else g.splice(-1, 1, ...groupes);
  }
  const manque = 8 - g.length - d.length;
  if (droite == null ? manque !== 0 : manque < 1) return null;
  const tout = [...g, ...Array(droite == null ? 0 : manque).fill('0'), ...d];
  if (tout.length !== 8 || tout.some(x => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  const trois = tout.slice(0, 3).map(x => parseInt(x, 16).toString(16));
  // « 2001:db8:0:: » s'écrit « 2001:db8:: » : les zéros de fin se replient dans « :: ».
  while (trois.length && trois.at(-1) === '0') trois.pop();
  return `${trois.join(':')}::`;
}

// Entre guillemets français, espaces fines insécables : « essai de la bordure ».
export const guillemets = s => `«${FINE}${s}${FINE}»`;
