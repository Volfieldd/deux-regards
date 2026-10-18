// Écran « Droits » de la console (MV-08, /droits), phase D3c. Lecture seule ici : le changement d'une attribution est la
// route POST /droits/:sub de vigie/console/actions.js (droit Administrateur, plafond relu, ré-authentification, garde-fous de
// createRights().assign), que les formulaires de cette page appellent.
//
// Deux pages sous la même adresse :
//   - Administrateur : chaque personne connue de la console (plafond Zitadel, attribution Vigie, droit effectif, amorce),
//     le formulaire d'attribution (jamais pour soi ni pour un compte de l'amorce, ni en mode VIGIE_ROLES=zitadel : la
//     raison à la place), ce que permet chaque rôle, le journal des droits, les connexions refusées sur 7 jours, les
//     sessions ouvertes, les garde-fous ;
//   - les autres rôles : « Vos droits » (MV-08, état 11) : leurs deux clés et ce qu'il faudrait pour un autre rôle, jamais
//     la liste des autres personnes, ni le journal, ni les sessions.
//
// Requêtes bornées : la table events peut compter des millions de lignes ; chaque type est lu par l'index
// events_type (type, recu_a), du plus récent au plus ancien, avec une limite. Les sessions : la table console_sessions
// (purgée après 7 jours), jamais le jeton ni son empreinte à l'écran.
import { ACTIONS, LABELS, ROLES, rank } from '../droits.js';
import { IDLE, ABSOLUTE, FRESH } from '../sessions.js';
import { dateHeure, heure, ilYa, nombre } from '../format.js';

const F = ' ', N = ' ';
const D = `${F}: `;
const pluriel = (n, un, plusieurs = `${un}s`) => (n > 1 ? plusieurs : un);
const lire = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const propre = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, max);

export const JOURNAL_MAX = 40;       // lignes du journal des droits
export const REFUS_MAX = 20;         // connexions refusées montrées (le compte des 7 jours est exact)
export const SESSIONS_MAX = 50;      // sessions ouvertes montrées
const TYPES_JOURNAL = ['vigie_console_droits', 'vigie_console_arrivee', 'vigie_console_connexion'];
const GRAVITE = { critique: 'Critique', haut: 'Haute', moyen: 'Moyenne' };

// Raisons d'un refus (server.js, refuse()), en clair.
export const RAISONS = {
  access: 'sans jeton Cloudflare Access valable',
  access_autre: 'session présentée sous une autre identité Cloudflare Access',
  role: 'aucun rôle vigie.* dans Zitadel',
  mfa: 'sans second facteur',
  csrf: 'formulaire sans jeton valable, ou venu d’ailleurs',
  etat: 'retour de Zitadel inattendu (connexion expirée ou rejouée)',
  zitadel: 'refusée par Zitadel',
  jeton: 'jeton de Zitadel refusé',
  reauth_autre: 'identité confirmée avec un autre compte',
  reauth_ancienne: 'identité confirmée par une connexion ancienne, pas à l’instant',
};

// Ce que permet chaque action (droits.js, ACTIONS), dans l'ordre des rôles : la liste « ce que permet chaque rôle » est
// tirée du code, jamais écrite à part.
const PERMET = {
  voir: 'voit les alertes, les événements, les décisions, la santé et d’où vient le signal ; adresses tronquées (/24, /48)',
  adresses_completes: 'les adresses complètes',
  alertes_traiter: 'prend en charge, classe et note une alerte',
  actions_forcees: 'actions forcées : bloquer, fermer les sessions, geler, verrouiller l’admin, lever',
  exporter: 'l’export des événements',
  reglages: 'interrupteurs, modes et seuils des règles, adresses de confiance',
  verifications: 'vérifier la chaîne, essayer un canal, recopier la liste à la bordure',
  droits: 'les droits de la Vigie, la référence du contrôle des rôles',
};
export function rolesPermis() {
  return ROLES.map((role, i) => {
    const actions = Object.keys(ACTIONS).filter(a => ACTIONS[a] === role).map(a => PERMET[a] || a);
    return { role, label: LABELS[role], code: `vigie.${role}`, permet: ((i ? 'et ' : '') + actions.join(' ; ')).replace(/ ([:;])/g, `${F}$1`) };
  });
}

// Identifiant d'ancre d'une personne (sub : caractères quelconques) : lettres, chiffres, « - » et « _ », sans doublon.
function ancres(subs) {
  const vus = new Set();
  return subs.map(s => {
    const base = `p-${String(s).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}`;
    let id = base;
    for (let k = 2; vus.has(id); k += 1) id = `${base}-${k}`;
    vus.add(id);
    return id;
  });
}

// « Firefox », « Chrome »… : la famille du navigateur, sans la chaîne entière.
function navigateur(ua) {
  const s = String(ua || '');
  if (/Edg\//.test(s)) return 'Edge';
  if (/Firefox\//.test(s)) return 'Firefox';
  if (/Chrome\/|Chromium\//.test(s)) return 'Chrome';
  if (/Safari\//.test(s)) return 'Safari';
  return s ? 'autre navigateur' : 'navigateur inconnu';
}

// Requêtes préparées une fois par base.
const requetes = new WeakMap();
function q(db) {
  let r = requetes.get(db);
  if (!r) {
    r = {
      type: db.prepare('SELECT seq, recu_a, type, severity, emetteur, sub, ip, detail FROM events WHERE type = ? ORDER BY recu_a DESC, seq DESC LIMIT ?'),
      depuis: db.prepare('SELECT seq, recu_a, type, severity, emetteur, sub, ip, detail FROM events WHERE type = ? AND recu_a >= ? ORDER BY recu_a DESC, seq DESC LIMIT ?'),
      compte: db.prepare('SELECT COUNT(*) FROM events WHERE type = ? AND recu_a >= ?').pluck(),
      sessions: db.prepare(`SELECT id, sub, nom, plafond, cree_a, vu_a, ip, ua FROM console_sessions
        WHERE ferme_a IS NULL AND vu_a >= ? AND cree_a >= ? ORDER BY vu_a DESC LIMIT ?`),
      nSessions: db.prepare('SELECT COUNT(*) FROM console_sessions WHERE ferme_a IS NULL AND vu_a >= ? AND cree_a >= ?').pluck(),
    };
    requetes.set(db, r);
  }
  return r;
}

// Une personne dans une phrase : son nom (et son identifiant en chasse fixe), ou son identifiant seul.
const qui = (sub, nom) => (nom ? [{ t: nom }, { t: ' (' }, { sub }, { t: ')' }] : sub ? [{ sub }] : [{ t: 'compte inconnu' }]);
const roleOu = (r, vide) => LABELS[r] || vide;

function ligneJournal(r, nomDe) {
  const d = lire(r.detail) || {};
  const sub = propre(r.sub);
  const p = qui(sub, nomDe(sub) || propre(d.nom, 120) || null);
  const sec = [];
  let morceaux;
  if (r.type === 'vigie_console_droits' && d.objet === 'attribution') {
    // Auteur : identifiant dans le détail (par_sub) ou en fin d'émetteur « console · Nom (sub) » ; ancien format : le sub seul.
    const parSub = propre(d.par_sub || (/\(([^()]+)\)$/.exec(String(r.emetteur || '')) || [])[1] || String(r.emetteur || '').replace(/^console · /, ''));
    morceaux = [...qui(parSub, nomDe(parSub)), { t: ' change l’attribution de ' }, ...p, { t: `${D}${roleOu(d.avant, 'aucune')} → ${roleOu(d.apres, 'aucune')}.` }];
    sec.push({ t: `droit effectif${D}${roleOu(d.effectif, 'aucun accès')}` });
  } else if (r.type === 'vigie_console_droits') {
    morceaux = [{ t: 'Plafond de ' }, ...p, { t: ` lu dans Zitadel${D}${d.avant ? roleOu(d.avant, '?') : 'aucun'} → ` },
      ...(d.apres ? [{ t: `${roleOu(d.apres, '?')} (` }, { d: `vigie.${d.apres}` }, { t: ').' }] : [{ t: 'aucun rôle ' }, { d: 'vigie.*' }, { t: '.' }])];
    sec.push({ t: d.apres ? `droit effectif${D}${roleOu(d.effectif, 'aucun accès')}` : 'accès coupé, sessions fermées' });
  } else if (r.type === 'vigie_console_arrivee') {
    morceaux = [...p, { t: ` entre pour la première fois${D}plafond ${roleOu(d.plafond, 'inconnu')} lu dans Zitadel, aucune attribution, donc Lecteur.` }];
  } else {
    morceaux = [...p, { t: ` se connecte en ${roleOu(d.role, 'Lecteur')}${d.plafond && d.plafond !== d.role ? ` (plafond ${roleOu(d.plafond, '?')})` : ''}.` }];
    if (r.ip) sec.push({ ip: propre(r.ip, 64) });
  }
  if (GRAVITE[r.severity] && r.type !== 'vigie_console_connexion') sec.push({ t: `signalé aux Administrateurs (${GRAVITE[r.severity]})` });
  return { quand: dateHeure(r.recu_a), iso: new Date(r.recu_a).toISOString(), morceaux, sec };
}

function ligneRefus(r, nomDe) {
  const d = lire(r.detail) || {};
  const sub = propre(r.sub);
  const raison = RAISONS[d.raison] || `raison « ${propre(d.raison, 40) || 'inconnue'} »`;
  const morceaux = [{ t: `Refusée${D}${raison}` }];
  if (sub) morceaux.push({ t: ' · ' }, ...qui(sub, nomDe(sub)));
  else if (d.access) morceaux.push({ t: ` · ${propre(d.access, 120)}` });
  morceaux.push({ t: '.' });
  const sec = [];
  if (r.ip) sec.push({ ip: propre(r.ip, 64) });
  if (d.route) sec.push({ d: propre(d.route, 120) });
  return { quand: dateHeure(r.recu_a), iso: new Date(r.recu_a).toISOString(), morceaux, sec };
}

// Vue de l'Administrateur.
export function vueAdmin({ db, rights, now, moi }) {
  const t = now();
  const mode = rights.mode === 'zitadel' ? 'zitadel' : 'deux-cles';
  const liste = rights.list();
  const noms = new Map(liste.filter(p => p.nom).map(p => [p.sub, p.nom]));
  const nomDe = sub => noms.get(sub) || null;
  const ids = ancres(liste.map(p => p.sub));
  const personnes = liste.map((p, i) => {
    const soi = p.sub === moi.sub;
    const attrib = p.amorce ? 'admin' : mode === 'zitadel' ? p.plafond : p.attribution || null;
    const actuel = attrib || 'viewer';
    // Ce qui peut être fait sur la ligne, ou la raison de ne rien proposer.
    let raison = null;
    if (mode === 'zitadel') raison = [{ t: 'Réglé dans Zitadel (' }, { d: 'VIGIE_ROLES=zitadel' }, { t: ').' }];
    else if (p.amorce) raison = [{ t: `Amorce${D}Administrateur tant que ${soi ? 'vous êtes' : 'ce compte est'} dans ` }, { d: 'VIGIE_ADMIN_SUBS' }, { t: ' (' }, { d: 'vigie.env' }, { t: ').' }];
    else if (soi) raison = [{ t: `Vous${D}personne ne change son propre rôle ; un autre Administrateur le peut.`.replace(' ;', `${F};`) }];
    const option = role => ({ v: role, t: LABELS[role], auDessus: rank(role) > rank(p.plafond) });
    return {
      sub: p.sub, id: ids[i], nom: p.nom || null, soi, amorce: p.amorce,
      depuis: dateHeure(p.premiere), derniere: ilYa(p.derniere, t),
      plafond: p.plafond ? { t: LABELS[p.plafond], code: `vigie.${p.plafond}` } : null,
      attribution: mode === 'zitadel' && !p.amorce ? { t: 'suit le plafond' } : attrib ? { t: LABELS[attrib], le: !p.amorce && p.attribue_a ? dateHeure(p.attribue_a) : null } : null,
      effectif: p.effectif ? LABELS[p.effectif] : null,
      sansAttribution: mode === 'deux-cles' && !p.amorce && !p.attribution,
      raison,
      // Attribuer : le rôle actuel et ceux au-dessus ; retirer (danger, confirmé) : ceux au-dessous.
      monter: raison ? [] : ROLES.filter(r => rank(r) >= rank(actuel)).map(option),
      descendre: raison ? [] : ROLES.filter(r => rank(r) < rank(actuel)).map(option),
      actuel, actuelT: LABELS[actuel],
      plafondT: p.plafond ? LABELS[p.plafond] : null,
    };
  });
  const nAdmins = liste.filter(p => p.effectif === 'admin').length;
  const arrivees = mode === 'deux-cles' ? personnes.filter(p => p.sansAttribution && p.plafond && !p.soi).slice(0, 5) : [];

  const r = q(db);
  // Journal : les JOURNAL_MAX plus récents de chaque type (index events_type), fondus, les JOURNAL_MAX plus récents gardés.
  const journal = TYPES_JOURNAL.flatMap(type => r.type.all(type, JOURNAL_MAX)).sort((a, b) => b.recu_a - a.recu_a || b.seq - a.seq).slice(0, JOURNAL_MAX)
    .map(x => ligneJournal(x, nomDe));
  const depuis7 = t - 7 * 864e5;
  const nRefus = r.compte.get('vigie_console_refus', depuis7);
  const refus = r.depuis.all('vigie_console_refus', depuis7, REFUS_MAX).map(x => ligneRefus(x, nomDe));
  const nSessions = r.nSessions.get(t - IDLE, t - ABSOLUTE);
  const sessions = r.sessions.all(t - IDLE, t - ABSOLUTE, SESSIONS_MAX).map(s => ({
    vous: s.id === moi.sid, morceaux: qui(propre(s.sub), nomDe(s.sub) || propre(s.nom, 120) || null), role: roleOu(rights.effective(s.sub, s.plafond), 'aucun accès'),
    depuis: heure(s.cree_a), depuisIso: new Date(s.cree_a).toISOString(), vu: ilYa(s.vu_a, t), ip: s.ip ? propre(s.ip, 64) : null, nav: navigateur(s.ua),
  }));

  return {
    admin: true, mode, maintenant: dateHeure(t),
    resume: `${nombre(liste.length)} ${pluriel(liste.length, 'personne')}, ${nombre(nAdmins)} ${pluriel(nAdmins, 'Administrateur')}`,
    nPersonnes: liste.length, personnes, arrivees, roles: rolesPermis(),
    journal, journalPlein: journal.length >= JOURNAL_MAX,
    refus, nRefus,
    refusTexte: nRefus ? `${nombre(nRefus)} ${pluriel(nRefus, 'connexion refusée', 'connexions refusées')} sur 7${N}jours${nRefus > refus.length ? `, les ${refus.length} plus récentes ici` : ''}.` : `Aucune connexion refusée sur 7${N}jours.`,
    sessions, nSessions,
    sessionsTexte: nSessions ? `${nombre(nSessions)} ${pluriel(nSessions, 'session ouverte', 'sessions ouvertes')}${nSessions > sessions.length ? `, les ${sessions.length} plus récentes ici` : ''}.` : 'Aucune session ouverte.',
  };
}

// Vue des autres rôles : leurs deux clés, et à qui s'adresser.
export function vueSoi({ rights, now, moi }) {
  const mode = rights.mode === 'zitadel' ? 'zitadel' : 'deux-cles';
  const liste = rights.list();
  const moiL = liste.find(p => p.sub === moi.sub) || {};
  const plafond = moi.plafond || moiL.plafond || null;
  const attribution = moiL.amorce ? 'admin' : mode === 'zitadel' ? plafond : moiL.attribution || null;
  const admins = liste.filter(p => p.effectif === 'admin' && p.sub !== moi.sub).map(p => p.nom || p.sub).slice(0, 5);
  return {
    admin: false, mode, maintenant: dateHeure(now()), sub: moi.sub, nom: moi.nom || null,
    plafond: plafond ? LABELS[plafond] : 'aucun', plafondCode: plafond ? `vigie.${plafond}` : null,
    attribution: mode === 'zitadel' ? 'suit le plafond' : attribution ? LABELS[attribution] : 'aucune',
    attributionSec: mode === 'zitadel' ? 'une seule clé : vos rôles se règlent dans Zitadel'.replace(' :', `${F}:`)
      : attribution ? `donnée par un Administrateur de la Vigie${moiL.attribue_a ? `, le ${dateHeure(moiL.attribue_a)}` : ''}` : 'pas encore donnée par un Administrateur de la Vigie',
    effectif: LABELS[moi.role] || 'Lecteur',
    roles: rolesPermis(),
    admins: admins.length > 1 ? `${admins.slice(0, -1).join(', ')} ou ${admins.at(-1)}` : admins[0] || null,
  };
}

export function register(app, ctx) {
  const { db, rights, now, view } = ctx;
  app.get('/droits', async (req, reply) => {
    const moi = { sub: req.moi.sub, nom: req.moi.nom, role: req.moi.role, plafond: req.moi.plafond, sid: req.moi.sid };
    const t = now();
    // Identité confirmée il y a moins de 5 minutes : dite dans l'en-tête (changer un droit la demande).
    const identite = req.moi.authA && t - req.moi.authA <= FRESH ? { a: heure(req.moi.authA), jusqua: heure(req.moi.authA + FRESH) } : null;
    const d = req.moi.role === 'admin' ? vueAdmin({ db, rights, now, moi }) : vueSoi({ rights, now, moi });
    return view(reply, req, 'droits', { page: 'droits', titre: d.admin ? 'Droits · Vigie' : 'Vos droits · Vigie', d, identite });
  });
  return ['/droits'];
}
