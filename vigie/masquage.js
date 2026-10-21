// Masquage réseau partagé par la console et la conservation des dossiers (D38, LEG-V3).
// Fonctions pures : ni accès à la base ni dépendance à la console ; le stockage utilise toujours la vue tronquée.
import { cleReseau as cleReseauCanon, lireIp, reseauDe } from '../server/securite/adresses-ip.js';

// Seuls ces rôles voient les adresses complètes (annexe § 5.4, droit « adresses_completes » de droits.js) ; tout autre rôle,
// connu ou non, voit le réseau.
const VOIENT_ADRESSES = ['handler', 'analyst', 'admin'];
export const voitAdressesCompletes = r => VOIENT_ADRESSES.includes(r);

// Calcul commun au site et à la Vigie (forme canonique, /24, /48 : audit D3-C4, D3-D5).
export { cleReseau, formesReseau } from '../server/securite/adresses-ip.js';

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
// Une IPv6 peut suivre « IP » ou un mot hexadécimal (« abc2001:… ») : quatre chiffres au plus par groupe,
// sans séparateur exigé avant l’adresse. Le préfixe métier « confiance: » est pris en entier pour que « ce »
// ne soit pas lu comme un groupe IPv6. Une heure reste intacte faute d’IPv6 valide.
const RE_ADRESSES = /(?:confiance:)?(?:[0-9A-Fa-f]{0,4}:){2,}[0-9A-Fa-f]*(?:\.\d+)*(?:\/\d{1,3})?|(?<![\d.])\d+(?:\.\d+){3,}(?:\/\d{1,3})?/g;
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
