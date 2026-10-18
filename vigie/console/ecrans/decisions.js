// Décisions de la console (phase D3c, MV-05) : la page /decisions (décisions en cours, historique récent, nouvelle décision,
// verrouiller l'admin), la page de confirmation d'une levée (/decisions/<n°>/lever), et les formulaires de décision que
// reprennent la fiche d'une alerte (MV-02) et celle d'une entité (MV-04).
// Ce module n'écrit rien : les gestes sont les routes POST de vigie/console/actions.js (POST /decisions,
// POST /decisions/<n°>/lever), qui vérifient le droit, relisent le plafond, demandent la ré-authentification, puis
// laissent un message (fait, ou refusé : raison, champ, valeurs saisies) pour la page où l'on revient. Ici, ce message
// sert à marquer le champ en erreur et à reprendre la saisie : les valeurs revenues ne sont jamais crues (texte seul,
// toujours échappé par le gabarit, comparé aux listes connues pour les choix).
// Un Lecteur voit la liste (adresses tronquées : adresseDetail), jamais un formulaire.
import net from 'node:net';
import { can, LABELS, ACTIONS } from '../droits.js';
import { FRESH } from '../sessions.js';
import { MAX_IPV4, SCOPES, parseTarget } from '../../decisions.js';
import { net64 } from '../../moteur.js';
import { FINE, NBSP, adresseDetail, cibleBlocage, dateHeure, guillemets, heure, ilYa, masquer, nombre, quand } from '../format.js';
import { DECISIONS, PORTEES as PORTEES_MOT, lire, titreDe, typo } from '../lexique.js';

const HISTOIRE = 20;                      // levées et échues montrées d'office
const HISTOIRE_MAX = 200;                 // avec ?toutes
const EN_COURS_MAX = 200;                 // décisions en cours montrées (10 000 actives au plus, MAX_ACTIVE)

// Mots du lexique (§ 1, § 3.11).
export const TYPES = DECISIONS;
export const NOUVELLES = ['bloquer', 'revoquer_compte', 'geler', 'revoquer_session'];
const VERBE = { bloquer: 'Bloquer', geler: 'Geler', revoquer_compte: 'Fermer les sessions', revoquer_session: 'Fermer la session', verrouiller: 'Verrouiller' };
const LEVER = { bloquer: 'Lever le blocage', revoquer_compte: 'Lever la fermeture des sessions', geler: 'Lever le gel', revoquer_session: 'Lever la fermeture de la session', verrouiller: 'Lever le verrouillage' };
const LEVER_TITRE = { bloquer: 'Lever ce blocage ?', revoquer_compte: 'Lever la fermeture des sessions de ce compte ?', geler: 'Lever le gel de ce compte ?', revoquer_session: 'Lever la fermeture de cette session ?', verrouiller: 'Lever le verrouillage de l’admin ?' };
const EFFET_LEVER = {
  bloquer: 'L’adresse retrouve l’accès au site dans les secondes qui suivent ; la bordure Cloudflare la libère en 4 à 5 min.',
  geler: 'Le compte retrouve l’accès au site dans les secondes qui suivent : il peut se connecter et ouvrir une session neuve.',
  revoquer_compte: 'Les sessions du compte ouvertes avant la décision redeviennent valables, si elles n’ont pas expiré.',
  revoquer_session: 'La session redevient valable, si elle n’a pas expiré.',
  verrouiller: 'L’admin et la connexion se rouvrent à tous les comptes que le site admet.',
};
const EFFET = {
  geler: 'traité comme désactivé : aucune session, connexion refusée',
  revoquer_session: 'cette session est refusée',
};
const PORTEES = {
  tout: { t: PORTEES_MOT.tout, sec: 'réponse 403 sur toutes les pages' },
  admin: { t: PORTEES_MOT.admin, sec: 'le site public reste ouvert à cette adresse' },
  auth: { t: PORTEES_MOT.auth, sec: 'la connexion par Zitadel lui est refusée' },
};
export const DUREES = { bloquer: ['1h', '24h', '7j', '30j'], geler: ['1h', '24h', '7j', '30j'], revoquer_compte: ['24h', '48h'], revoquer_session: ['24h', '48h'], verrouiller: ['1h', '12h', '24h'] };
const MAX_TEXTE = { bloquer: '30\u00a0jours', geler: '30\u00a0jours', revoquer_compte: '48\u00a0h', revoquer_session: '48\u00a0h', verrouiller: '24\u00a0h' };
const LIBRE = { bloquer: true, geler: true };      // « Autre durée » : pour les décisions longues seulement
const CIBLE = {
  bloquer: { label: 'Adresse ou réseau', aide: 'Une adresse (198.51.100.23) ou un réseau (198.51.100.0/24) ; en IPv4 de /8 à /32, en IPv6 de /32 à /128.' },
  revoquer_compte: { label: 'Compte', aide: 'Son identifiant Zitadel (sub), tel que le journal l’écrit.' },
  geler: { label: 'Compte', aide: 'Son identifiant Zitadel (sub), tel que le journal l’écrit.' },
  revoquer_session: { label: 'Empreinte de la session', aide: '12 caractères hexadécimaux au moins (0 à 9, a à f), tels que le journal les écrit.' },
};
const HINT = {
  bloquer: 'Le blocage se lève seul à la fin ; 30 jours au plus. Le site l’applique en quelques secondes, la bordure Cloudflare en 4 à 5 min.',
  geler: 'Le gel se lève seul à la fin ; 30 jours au plus. Le site l’applique en quelques secondes.',
  revoquer_compte: 'Toute session du compte ouverte avant maintenant est refusée ; il peut se reconnecter. 48 h au plus.',
  revoquer_session: 'Cette session est refusée ; 48 h au plus.',
};

export const dureeTexte = d => String(d).replace(/^(\d+)(h|min)$/, `$1${NBSP}$2`).replace(/^(\d+)j$/, (m, n) => `${n}${NBSP}jour${Number(n) > 1 ? 's' : ''}`);
// Texte venu de la base ou d'une saisie : sans caractère de contrôle ni d'inversion du sens d'écriture, borné.
const propre = (v, max = 300) => {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '\ufffd');
  const signes = [...s];
  return signes.length > max ? `${signes.slice(0, max).join('')}…` : s;
};
// Adresses citées dans un texte libre (un motif, un auteur) : tronquées pour un Lecteur (masquer, de format.js : une seule
// fonction pour toute la console, audit D3-C2).
const voitAdresses = role => can(role || 'viewer', 'adresses_completes');

// ---------------------------------------------------------------------------------------------------------------------
// Message d'une action (it.message, posé par actions.js) : jamais cru. Une erreur ne vaut que pour le formulaire qui l'a
// envoyée (champ caché « formulaire », ou repli(valeurs)) ; ses valeurs ne sont gardées que si ce sont des textes courts.

export function erreurDe(message, formulaire, repli = null) {
  if (!message || typeof message !== 'object' || message.k !== 'erreur') return null;
  const brutes = message.valeurs && typeof message.valeurs === 'object' && !Array.isArray(message.valeurs) ? message.valeurs : {};
  const valeurs = {};
  for (const [k, v] of Object.entries(brutes).slice(0, 30)) if (typeof v === 'string' && /^[a-z_]{1,20}$/.test(k)) valeurs[k] = v.slice(0, 300);
  const qui = valeurs.formulaire || (repli ? repli(valeurs) : null);
  if (qui !== formulaire) return null;
  return { champ: typeof message.champ === 'string' ? message.champ : null, texte: propre(message.texte, 400), valeurs };
}

// Identité confirmée (ré-authentification de moins de 5 minutes, sessions.js, FRESH).
export function identite(req, t) {
  const a = Number(req.moi?.authA);
  if (!Number.isFinite(a) || !can(req.moi.role, 'actions_forcees')) return null;
  if (t - a < FRESH) return { fraiche: true, texte: `Identité confirmée à ${heure(a)}, valable jusqu’à ${heure(a + FRESH)}` };
  return { fraiche: false, texte: `Toute décision redemande votre identité à Zitadel (dernière confirmation à ${heure(a)}).` };
}

// La cible (adresse ou réseau) contient-elle l'adresse donnée ?
export function contient(cible, ip) {
  if (!ip || !net.isIP(ip)) return false;
  try {
    const t = parseTarget(cible);
    const bl = new net.BlockList();
    bl.addSubnet(t.address, t.prefix, t.family);
    return bl.check(ip, net.isIPv6(ip) ? 'ipv6' : 'ipv4');
  } catch { return false; }
}

// Lien « Lever… » d'une décision en cours (vers la page de confirmation, qui ramène à retour).
export function lienLever(d, retour = null) {
  const r = retour && retour !== '/decisions' ? `?retour=${encodeURIComponent(retour)}` : '';
  return { href: `/decisions/${d.id}/lever${r}`, texte: `${LEVER[d.kind] || 'Lever'}…`, sr: ` la décision #${d.id}` };
}

// Un formulaire de décision (POST /decisions), prêt pour le gabarit _dec-form.eta. cible : valeur fixe (cachée, montrée par
// cibleVue) ou null (champ à remplir, pré-rempli par cibleSaisie). L'erreur revenue du serveur est placée près de son champ ;
// la saisie refusée est reprise.
export function formulaireDecision({ type, id, formulaire = id, retour, alerte = null, cible = null, cibleVue = null, cibleSaisie = '', titre = null,
  texte = null, durees = DUREES[type], libre = Boolean(LIBRE[type]), csrf, ip = null, message = null, gardeFous = null }) {
  const err = erreurDe(message, formulaire);
  const v = err ? err.valeurs : {};
  const fixe = cible != null;
  const valeurCible = (fixe ? String(cible) : err ? v.cible || '' : String(cibleSaisie || '')).slice(0, 200);
  const champs = { cible: !fixe, portee: type === 'bloquer', motif: true, libre, confirme: false };
  // Sa propre adresse : la case « bloquer quand même » est montrée d'avance si la cible la contient, et après un refus.
  let confirme = null;
  if (type === 'bloquer' && ip && (contient(valeurCible, ip) || err?.champ === 'confirme')) {
    confirme = { ip, cible: valeurCible };
    champs.confirme = true;
  }
  // Où montrer l'erreur : près de son champ s'il est dans ce formulaire, sinon en tête du formulaire.
  let place = null;
  if (err) {
    const c = err.champ === 'duree' || err.champ === 'duree_libre' ? (libre ? 'libre' : null) : err.champ;
    place = c && champs[c] ? c : 'general';
  }
  return {
    id, type, formulaire, retour, alerte: Number.isSafeInteger(alerte) && alerte > 0 ? alerte : null, csrf, titre, texte,
    cible: fixe ? { fixe: true, valeur: valeurCible, vue: cibleVue } : { fixe: false, valeur: valeurCible, ...CIBLE[type] },
    portee: type === 'bloquer' ? SCOPES.map(s => ({ v: s, t: PORTEES[s].t, sec: PORTEES[s].sec, coche: v.portee === s })) : null,
    motif: { valeur: v.motif || '' },
    durees: (durees || []).map(d => ({ v: d, t: `${VERBE[type]} ${dureeTexte(d)}` })),
    libre: libre ? { valeur: v.duree_libre || '', max: MAX_TEXTE[type], bouton: `${VERBE[type]} pour l’autre durée` } : null,
    confirme,
    gardeFous,
    hint: typo(HINT[type] || ''),
    err: err ? { place, texte: err.texte } : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Lignes de décisions (en cours, historique)

const cache = new WeakMap();
function requetes(db) {
  let q = cache.get(db);
  if (q) return q;
  q = {
    une: db.prepare('SELECT id, kind, cible, portee, motif, par, cree_a, fin, leve_a, leve_par, auto, details FROM decisions WHERE id = ?'),
    // Levées et échues : clé primaire parcourue à rebours, bornée.
    histoire: db.prepare('SELECT id, kind, cible, portee, motif, par, cree_a, fin, leve_a, leve_par, auto, details FROM decisions WHERE leve_a IS NOT NULL OR fin <= ? ORDER BY id DESC LIMIT ?'),
    nom: db.prepare('SELECT nom FROM console_droits WHERE sub = ?').pluck(),
    // Décisions en cours sur une cible exacte (une adresse s'écrit avec son suffixe /32 ou /128).
    surCible: db.prepare('SELECT id, kind, cible, portee, motif, par, cree_a, fin, leve_a, auto FROM decisions WHERE leve_a IS NULL AND fin > ? AND cible IN (?, ?, ?) ORDER BY id DESC LIMIT 20'),
  };
  cache.set(db, q);
  return q;
}
// Titres bruts des règles (registre du moteur) ; titreDe (lexique.js) les met au propre.
export const titresDe = engine => new Map((engine?.rules?.() || []).map(r => [r.id, r.titre]));

// Cible d'une décision, vue par un rôle.
function cibleDe(q, d, role, t) {
  if (d.kind === 'bloquer') {
    // Une adresse seule : /32 en IPv4, /128 en IPv6 (un /32 IPv6 est un réseau).
    const seule = cibleBlocage(d.cible);
    const hote = !seule.includes('/');
    const vu = adresseDetail(seule, role);
    let taille = '';
    try { const x = parseTarget(d.cible); if (x.family === 'ipv4' && x.size > 1) taille = `${nombre(x.size)}${NBSP}adresses`; } catch { /* cible illisible */ }
    return { k: hote ? 'adresse' : 'réseau', texte: vu.texte, mono: 'ip', v6: vu.v6, tronquee: vu.tronquee,
      sec: [PORTEES[d.portee]?.t || '', taille].filter(Boolean).join(' · ') };
  }
  if (d.kind === 'verrouiller') {
    const det = lire(d.details) || {};
    const comptes = (Array.isArray(det.comptes) ? det.comptes : []).slice(0, 10).map(s => propre(s, 120));
    const adresses = (Array.isArray(det.adresses) ? det.adresses : []).slice(0, 10).map(x => adresseDetail(String(x), role).texte);
    const admis = [...comptes, ...adresses];
    return { k: 'admin', texte: 'l’admin et la connexion', mono: null, sec: admis.length ? `seuls admis${FINE}: ${admis.join(', ')}` : '' };
  }
  const nom = d.kind !== 'revoquer_session' ? q.nom.get(String(d.cible)) : null;
  return { k: d.kind === 'revoquer_session' ? 'session' : 'compte', texte: propre(d.cible, 200), mono: 'sub', nom: nom ? propre(nom, 60) : null,
    sec: typo(d.kind === 'revoquer_compte' ? `toute session ouverte avant ${quand(d.cree_a, t)} est refusée` : EFFET[d.kind] || '') };
}

// Qui l'a décidée : la Vigie d'elle-même (règle, alerte), ou une personne (console, ligne de commande), avec le motif.
function parDe(d, { role, moi, titres }) {
  const alerteN = /^alerte #(\d{1,12})(?: · |$)/.exec(d.motif || '');
  const sec = [];
  if (d.auto) {
    const regle = /^Vigie · règle (\S{1,120})$/.exec(d.par || '')?.[1];
    if (regle) sec.push({ t: 'règle ' }, { t: titreDe(regle, titres), href: `/reglages#r-${regle.replace(/[^A-Za-z0-9_-]/g, '-')}` });
    if (alerteN) { if (sec.length) sec.push({ t: ' · ' }); sec.push({ t: `alerte #${alerteN[1]}`, href: `/alertes/${alerteN[1]}` }); }
    return { t: 'la Vigie, d’elle-même', sec };
  }
  const par = String(d.par || '');
  const vous = moi && par === `console · ${moi.nom || moi.sub}`;
  const nom = par.startsWith('console · ') ? par.slice(10) : par;
  if (alerteN) sec.push({ t: `alerte #${alerteN[1]}`, href: `/alertes/${alerteN[1]}` });
  const reste = alerteN ? String(d.motif).slice(alerteN[0].length) : d.motif;
  if (reste) { if (sec.length) sec.push({ t: ' · ' }); sec.push({ t: guillemets(propre(masquer(reste, role), 120)) }); }
  return { t: `${propre(masquer(nom, role), 60) || 'inconnu'}${vous ? ' (vous)' : ''}`, sec };
}

export function ligneDecision(db, d, { t, role, moi = null, titres = new Map(), retour = null }) {
  const q = requetes(db);
  const enCours = !d.leve_a && d.fin > t;
  return {
    id: d.id,
    kind: d.kind,
    type: TYPES[d.kind] || propre(d.kind, 30),
    depuis: quand(d.cree_a, t),
    cible: cibleDe(q, d, role, t),
    fin: enCours ? { t: dateHeure(d.fin), sec: ilYa(d.fin, t) }
      : d.leve_a ? { t: `levée ${quand(d.leve_a, t)}`, sec: d.leve_par ? `par ${propre(masquer(String(d.leve_par).replace(/^console · /, ''), role), 60)}` : '' }
        : { t: `échue ${quand(d.fin, t)}`, sec: '' },
    par: parDe(d, { role, moi, titres }),
    lever: enCours && can(role, 'actions_forcees') ? lienLever(d, retour) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Actions forcées sur une entité (fiche d'une alerte, MV-02 ; fiche d'une entité, MV-04) : un formulaire par geste possible,
// « Fait (#n°) » quand la même décision est déjà en cours, la raison quand un geste est impossible. retour : la fiche ;
// alerte : le numéro de l'alerte (le serveur l'écrit en tête du motif). null pour qui n'a pas le droit.

const SUR = { ip: 'l’adresse', reseau: 'le réseau', compte: 'le compte', session: 'la session' };
export function actionsForcees({ db, kind, key, req, t, retour, alerte = null, message = null, prefixe = 'f' }) {
  if (!can(req.moi.role, 'actions_forcees')) return null;
  const q = requetes(db);
  const ip = req.ip2 && net.isIP(req.ip2) ? req.ip2 : null;
  const csrf = req.moi.csrf;
  const cle = String(key ?? '');
  const items = [];
  const enCours = q.surCible.all(t, cle, `${cle}/32`, `${cle}/128`);
  const fait = k => enCours.find(d => d.kind === k);
  const faitTexte = d => ({ texte: `Déjà en cours${FINE}: décision #${d.id}, ${d.auto ? 'prise par la Vigie' : 'prise à la main'} ${quand(d.cree_a, t)}, jusqu’au ${dateHeure(d.fin)}.`, lever: lienLever(d, retour) });
  const form = (type, o) => formulaireDecision({ type, id: `${prefixe}-${type}`, retour, alerte, csrf, ip, message, ...o });
  const vers = (type, c) => ({ href: `/decisions?type=${type}${c ? `&cible=${encodeURIComponent(c)}` : ''}#nouvelle`, texte: 'Page Décisions' });

  // Un identifiant de compte ou de session hors du jeu de caractères attendu ne part dans aucun formulaire.
  const lisible = /^[A-Za-z0-9._@:-]{1,200}$/.test(cle);
  if (kind === 'compte' && !lisible) items.push({ h: 'Geler, fermer les sessions', sans: 'Identifiant de compte illisible : rien à faire d’ici.' });
  else if (kind === 'compte') {
    const gel = fait('geler');
    items.push({ h: gel ? 'Geler plus longtemps' : 'Geler le compte', p: 'Traité comme désactivé : aucune session, connexion refusée ; il retrouve l’accès seul à la fin.',
      fait: gel ? faitTexte(gel) : null, form: form('geler', { cible: cle, durees: ['24h', '7j', '30j'], libre: false }) });
    const rev = fait('revoquer_compte');
    items.push({ h: 'Fermer les sessions du compte', p: 'Toute session ouverte avant maintenant est refusée ; il peut se reconnecter.',
      fait: rev ? faitTexte(rev) : null, form: rev ? null : form('revoquer_compte', { cible: cle, durees: ['48h'], libre: false }) });
  } else if (kind === 'ip' || kind === 'reseau') {
    // Un réseau du site s'écrit sans suffixe (« 198.51.100.0 », server/ip.js) : /24 ou /48. Une clé de réseau qui est une
    // adresse complète (Zitadel) se bloque comme une adresse.
    let cible = cle;
    let reseau = false;
    if (kind === 'reseau') {
      const n = adresseDetail(cle, 'viewer');
      if (n.tronquee && n.texte.split('/')[0] === cle) { cible = n.texte; reseau = true; }
    }
    let valide = true;
    try { parseTarget(cible); } catch { valide = false; }
    const bl = fait('bloquer');
    if (!valide) items.push({ h: 'Bloquer', sans: 'Cette entité ne se lit pas comme une adresse ou un réseau : rien à bloquer d’ici.' });
    else items.push({ h: reseau ? 'Bloquer le réseau' : 'Bloquer l’adresse', mono: cible, v6: cible.includes(':'),
      p: 'Réponse 403 sur la portée choisie : tout de suite sur le site, en 4 à 5 min en bordure Cloudflare.',
      fait: bl ? faitTexte(bl) : null,
      form: form('bloquer', { cible, cibleVue: { texte: cible }, durees: ['1h', '24h', '7j'], libre: false }),
      pied: { t: reseau ? 'Une autre durée' : 'Le réseau entier, une autre durée', lien: vers('bloquer', cible) } });
  } else if (kind === 'session') {
    if (/^[0-9a-f]{12,64}$/.test(cle)) {
      const rs = fait('revoquer_session');
      items.push({ h: 'Fermer la session', p: 'Cette session est refusée par le site ; son compte peut se reconnecter.',
        fait: rs ? faitTexte(rs) : null, form: rs ? null : form('revoquer_session', { cible: cle, durees: ['24h', '48h'], libre: false }) });
    } else items.push({ h: 'Fermer la session', sans: 'Empreinte de session illisible (12 caractères hexadécimaux au moins attendus).' });
  } else items.push({ h: 'Aucune action forcée', sans: 'Cette entité ne se bloque ni ne se gèle : agissez sur son adresse ou son compte.' });
  items.push({ h: 'Verrouiller l’admin', p: 'Seuls les comptes et adresses choisis entrent dans l’admin, 24 h au plus ; le site public reste ouvert.',
    lien: { href: '/decisions#verrouiller', texte: 'Verrouiller l’admin…' } });
  for (const i of items) { if (i.p) i.p = typo(i.p); if (i.sans) i.sans = typo(i.sans); }
  return { titre: `Actions forcées sur ${SUR[kind] || 'l’entité'}`, items, identite: identite(req, t) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Page /decisions

export function pageDecisions({ db, engine, decisions, req, t, query = {}, message = null }) {
  const q = requetes(db);
  const role = req.moi.role;
  const moi = { nom: req.moi.nom, sub: req.moi.sub };
  const titres = titresDe(engine);
  // Ce que le site applique : les décisions actives et intègres (vigie/decisions.js, active()), les plus récentes d'abord.
  const actives = decisions.active().sort((a, b) => b.id - a.id);
  const toutes = query.toutes !== undefined;
  const borne = toutes ? HISTOIRE_MAX : HISTOIRE;
  const histoire = q.histoire.all(t, borne + 1);
  const agir = can(role, 'actions_forcees');

  const vue = {
    maintenant: dateHeure(t),
    lecteur: !voitAdresses(role),
    agir,
    requis: LABELS[ACTIONS.actions_forcees],
    identite: identite(req, t),
    enCours: actives.slice(0, EN_COURS_MAX).map(d => ligneDecision(db, d, { t, role, moi, titres })),
    nbEnCours: actives.length,
    histoire: histoire.slice(0, borne).map(d => ligneDecision(db, d, { t, role, moi, titres })),
    histoirePlus: histoire.length > borne,
    toutes,
  };
  if (!agir) return vue;

  // Nouvelle décision : le type vient de l'adresse (?type=), ou de la saisie refusée.
  const ip = req.ip2 && net.isIP(req.ip2) ? req.ip2 : null;
  const repli = v => (v.type === 'verrouiller' ? 'verrouiller' : NOUVELLES.includes(v.type) ? 'nouvelle' : null);
  const errN = erreurDe(message, 'nouvelle', repli);
  const type = errN && NOUVELLES.includes(errN.valeurs.type) ? errN.valeurs.type : NOUVELLES.includes(query.type) ? query.type : 'bloquer';
  const cibleQ = typeof query.cible === 'string' && query.cible.length <= 200 && !/[\u0000-\u001f\u007f]/.test(query.cible) ? query.cible.trim() : '';
  // La saisie refusée, reprise par le formulaire (le champ caché « formulaire » peut manquer : le type suffit).
  const msgN = errN ? { ...message, valeurs: { ...errN.valeurs, formulaire: 'nouvelle' } } : null;
  let total = 0;
  for (const d of actives) if (d.kind === 'bloquer') { try { total += parseTarget(d.cible).size; } catch { /* illisible */ } }
  vue.types = NOUVELLES.map(k => ({ k, t: TYPES[k], href: `/decisions?type=${k}#nouvelle`, courant: k === type }));
  vue.nouvelle = formulaireDecision({
    type, id: 'n', formulaire: 'nouvelle', retour: '/decisions', cibleSaisie: cibleQ, csrf: req.moi.csrf, ip, message: msgN,
    gardeFous: type === 'bloquer' ? { total: nombre(total), n: total, max: nombre(MAX_IPV4), ip } : null,
  });

  // Verrouiller l'admin : le compte et l'adresse de qui verrouille sont ajoutés d'office par le serveur (actions.js).
  const errV = erreurDe(message, 'verrouiller', repli);
  const vv = errV ? errV.valeurs : {};
  vue.verrouiller = {
    csrf: req.moi.csrf,
    moi: { nom: propre(req.moi.nom || '', 60), sub: propre(req.moi.sub, 200) },
    ip: ip ? { texte: ip, reseau: net.isIPv6(ip) ? net64(ip) : null } : null,
    comptes: vv.comptes || '', adresses: vv.adresses || '', motif: vv.motif || '',
    durees: DUREES.verrouiller.map(d => ({ v: d, t: `${VERBE.verrouiller} ${dureeTexte(d)}` })),
    err: errV ? { place: ['comptes', 'adresses', 'motif'].includes(errV.champ) ? errV.champ : 'general', texte: errV.texte } : null,
  };
  return vue;
}

// ---------------------------------------------------------------------------------------------------------------------
// Page de confirmation d'une levée

export function pageLever({ db, engine, req, t, id, retour }) {
  const q = requetes(db);
  const d = q.une.get(id);
  if (!d) return null;
  const titres = titresDe(engine);
  const l = ligneDecision(db, d, { t, role: req.moi.role, moi: { nom: req.moi.nom, sub: req.moi.sub }, titres });
  const enCours = !d.leve_a && d.fin > t;
  return {
    id: d.id, kind: d.kind, enCours, retour,
    titre: enCours ? LEVER_TITRE[d.kind] || 'Lever cette décision ?' : `La décision #${d.id} n’est plus en cours`,
    type: l.type, cible: l.cible, fin: l.fin, par: l.par, depuis: dateHeure(d.cree_a),
    finTexte: dateHeure(d.fin),
    effet: typo(EFFET_LEVER[d.kind] || ''),
    bouton: LEVER[d.kind] || 'Lever',
    identite: identite(req, t),
    csrf: req.moi.csrf,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Routes

export function register(app, ctx) {
  const { db, engine, decisions, now } = ctx;
  // Le message d'une action est lu ici (une fois) pour placer l'erreur près de son champ, puis passé à la page.
  const message = req => (ctx.isRefresh(req) ? null : ctx.sessions.takeMessage(req.moi.sid));

  app.get('/decisions', async (req, reply) => {
    const m = message(req);
    const vue = pageDecisions({ db, engine, decisions, req, t: now(), query: req.query || {}, message: m });
    return ctx.view(reply, req, 'decisions', { page: 'decisions', titre: 'Décisions · Vigie', vue, message: m });
  });

  app.get('/decisions/:id/lever', async (req, reply) => {
    if (!can(req.moi.role, 'actions_forcees')) return ctx.page(reply, 'interdit', { raison: 'droit', requis: LABELS[ACTIONS.actions_forcees] }, 403);
    const brut = String(req.params.id || '');
    const id = /^[1-9]\d{0,11}$/.test(brut) ? Number(brut) : null;
    const r = typeof req.query?.retour === 'string' ? ctx.safeRetour(req.query.retour) : '/decisions';
    const vue = id ? pageLever({ db, engine, req, t: now(), id, retour: r === '/' ? '/decisions' : r }) : null;
    if (!vue) return ctx.view(reply, req, 'decisions-introuvable', { page: 'decisions', titre: 'Décision introuvable · Vigie', numero: id }, 404);
    return ctx.view(reply, req, 'decisions-lever', { page: 'decisions', titre: `Lever la décision #${vue.id} · Vigie`, vue });
  });

}
