// Écrans « Santé et intégrité » (MV-07, /sante) et « Flux et provenance des alertes » (MV-11, /flux) de la console, phase D3b,
// et la barre de provenance de la vue d'ensemble (MV-01). LECTURE SEULE : aucune écriture, aucun événement noté ; les
// commandes de la santé (vérifier la chaîne, recopier la liste de la bordure, accepter une référence) sont des formulaires
// vers les routes d'action (vigie/console/actions.js, phase D3c), montrés seulement à qui a le droit.
//
// Requêtes bornées et indexées : la table events peut compter des millions de lignes.
//   - Flux : les volumes viennent de la table daily (compteurs par jour UTC, type, gravité, composant : quelques centaines
//     de lignes par jour) ; les alertes de la période par l'index alerts_derniere ; ce dont elles sont faites, de la table
//     alert_flux (migration 009 : quelques lignes par alerte, par jour et par type, lues par la clé). Seules les « provenances les plus actives » relisent des événements : les
//     PROV_MAX plus récents de la période, par l'index events_recu (et c'est dit sur la page quand la période en a plus).
//   - Santé : des réglages (settings), le dernier événement d'un type par l'index (type, recu_a), des comptes sur 24 h ou
//     30 jours par le même index, MIN/MAX(seq) par la clé.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alertOrder } from '../../moteur.js';
import { pointsOf, sourceOf } from '../../poids.js';
import { loadRules } from '../../sigma.js';
import { LISTS } from '../../menaces.js';
import { FINE, NBSP, adresseDetail, dateHeure, masquer, quand, ilYa, nombre, jour, guillemets, heure } from '../format.js';
import { aQuand, lire, pluriel, typo } from '../lexique.js';
import { sansContacts } from '../../util.js';
import { can } from '../droits.js';
import { FRESH } from '../sessions.js';
import * as F from '../flux.js';

const D = `${FINE}: `;
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version; } catch { return null; } })();
const et = l => (l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l.at(-1)}` : l[0] || '');

// ===================================================================================================================
// Flux (MV-11)
// ===================================================================================================================

export const PERIODES = { '7j': 7, '30j': 30 };
export const PERIODE_DEFAUT = '7j';
// La routine masquée du journal (MV-03, lexique § 3.10) : ni dans le journal par défaut, ni dans les flux.
export const ROUTINE = ['sys_heartbeat', 'sys_state', 'vigie_signal'];
const ROUTINE_SQL = ROUTINE.map(t => `'${t}'`).join(', ');
export const ALERTES_MAX = 500;  // alertes de la période lues au plus (les plus récentes)
export const PROV_MAX = 50_000;  // événements relus au plus pour les provenances (les plus récents de la période)
const GRAV = { critique: 'critique', haut: 'haute', moyen: 'moyenne', bas: 'basse', info: 'basse' };

// Source d'un événement dans les flux : celle du quorum (poids.js) ; les actions des intervenants (console, ligne de
// commande), qui ne sont pas des signaux, sont comptées avec les contrôles de la Vigie, comme dans le journal (MV-03).
// Le réseau (phase E4), constaté hors du site comme les contrôles de la Vigie, est rangé avec eux dans le dessin des flux
// (quatre teintes) ; le journal et les alertes le nomment à part.
export const sourceFlux = composant => { const s = sourceOf({ composant }) || 'vigie'; return s === 'reseau' ? 'vigie' : s; };

// Origine d'un événement (qui), lue sur son type et son composant seuls (ce que garde la table daily) :
//   - Zitadel : ses événements ; visiteurs du site public : le site public, la bordure, les connexions qui n'aboutissent pas ;
//   - comptes de l'admin : l'admin, les connexions et les sessions ;
//   - hors application : le système du site (base, serveur, sauvegarde) et ce que les contrôles de la Vigie trouvent hors du
//     site (contrôle des rôles, chaîne du journal, lot refusé) ;
//   - la Vigie elle-même : le reste de ses contrôles, ses interrupteurs, sa console.
// « Réseaux listés » (MV-11) demanderait de relire l'adresse de chaque événement : ces événements restent avec les visiteurs.
const HORS = new Set(['vigie_controle_roles', 'log_integrity_fail', 'vigie_ingestion_refusee']);
const CONNEXION_VISITEUR = new Set(['authn_login_fail', 'authn_local_attempt', 'authn_login_pending', 'authn_login_disabled']);
export function origineDe(type, composant) {
  const c = String(composant || '');
  if (c === 'zitadel') return 'zit';
  if (c === 'bordure' || c === 'cloudflare' || c === 'site · public') return 'vis';
  if (c === 'site · connexion') return CONNEXION_VISITEUR.has(type) ? 'vis' : 'adm';
  if (c === 'site · admin') return 'adm';
  if (c.startsWith('site')) return 'hors';
  return HORS.has(type) ? 'hors' : 'vig';
}

// Chemin d'une alerte (§ 3.18, point 2) : score d'une entité, corrélation (règle Sigma de corrélation), preuve directe.
export const cheminDe = (regle, correls = new Set()) => (regle === 'entite.score' ? 'score'
  : String(regle).startsWith('sigma.') && correls.has(String(regle).slice(6)) ? 'correl' : 'direct');

// Noms des corrélations Sigma (relus une fois) : vigie/regles, comme le moteur.
let correlationsLues = null;
export function correlations() {
  if (!correlationsLues) {
    try { correlationsLues = new Set(loadRules(fileURLToPath(new URL('../../regles/', import.meta.url))).correlations.map(c => c.name)); } catch { correlationsLues = new Set(); }
  }
  return correlationsLues;
}

const requetesFlux = new WeakMap();
function qFlux(db) {
  let q = requetesFlux.get(db);
  if (q) return q;
  q = {
    jours: db.prepare(`SELECT type, severity, composant, SUM(n) n FROM daily WHERE day >= ? AND type NOT IN (${ROUTINE_SQL}) GROUP BY type, severity, composant`),
    alertes: db.prepare(`SELECT id, regle, entite_kind, entite_key, gravite, mode, statut, premiere, derniere, compteur, sources FROM alerts
      WHERE derniere >= ? ORDER BY derniere DESC LIMIT ${ALERTES_MAX + 1}`),
    // Événements des alertes de la période, par alerte et par (type, gravité, composant), dans la table alert_flux
    // (migration 009, tenue par déclencheurs) : n, tous ses événements (diagramme des alertes) ; prop, ceux qu'elle porte
    // dans le diagramme des événements (rattachés par elle la première : un événement de deux alertes y compte une fois).
    // premier a deux définitions dans la migration 009 (audit D3-D13) : le déclencheur alert_flux_lien compte l'alerte qui
    // a rattaché l'événement la première (ordre d'arrivée des liens : l'alerte #10 peut précéder la #8) ; la reprise de
    // l'existant (INSERT … SELECT en fin de fichier), faute de connaître l'ordre des liens d'avant la migration, prend la plus
    // ancienne alerte (plus petit numéro). Écrit ici et non dans 009 : les migrations sont reconnues par leur seul nom
    // (vigie/store.js, table migrations) ; un commentaire ajouté changerait le fichier sans rien changer aux bases qui l'ont
    // déjà appliqué.
    evAlertes: db.prepare(`SELECT alert_id a, type, severity, composant, SUM(n) n, SUM(premier) prop FROM alert_flux
      WHERE alert_id IN (SELECT value FROM json_each(?)) AND jour >= ? AND type NOT IN (${ROUTINE_SQL})
      GROUP BY alert_id, type, severity, composant`),
    // Réponses automatiques des alertes de la période (numéros en JSON) : par la colonne indexée alerte_id (migration 012).
    reponses: db.prepare('SELECT id, kind, alerte_id, cree_a FROM decisions WHERE alerte_id IN (SELECT value FROM json_each(?)) AND auto = 1 AND cree_a >= ? ORDER BY id LIMIT 2000'),
    admins: db.prepare(`SELECT DISTINCT ip FROM events WHERE type = 'authn_login_success' AND recu_a >= ? AND ip IS NOT NULL
      AND sub IN (SELECT value FROM json_each(?)) LIMIT 500`).pluck(),
    // Provenances comptées par SQLite (audit du plantage de /flux, 19 oct. 2026) : les PROV_MAX événements les plus récents,
    // regroupés par (adresse, pays, composant, opérateur) : une ligne par groupe, pas par événement dans le tas JS.
    // op : celui de l'événement le plus récent du groupe (colonne nue avec MAX, propre à SQLite). La clé de largeur
    // fixe ordonne les entiers positifs (date de la période active, numéro) sans perte : les lots partagent souvent
    // la même date, départagée par seq comme le parcours inverse d'events_recu. Elle reste une chaîne en JS.
    prov: db.prepare(`SELECT ip, country, composant, asn, op, COUNT(*) n, MAX(printf('%020d:%020d', recu_a, seq)) dernier FROM (
        SELECT seq, recu_a, ip, country, composant, CASE WHEN composant = 'bordure' THEN json_extract(detail, '$.asn') END asn,
          CASE WHEN composant = 'bordure' THEN json_extract(detail, '$.operateur') END op
        FROM events WHERE recu_a >= ? AND type NOT IN (${ROUTINE_SQL}) ORDER BY recu_a DESC, seq DESC LIMIT ${PROV_MAX})
      GROUP BY ip, country, composant, asn`),
    // La période a-t-elle plus de PROV_MAX événements ?
    provPlus: db.prepare(`SELECT 1 FROM events WHERE recu_a >= ? AND type NOT IN (${ROUTINE_SQL}) ORDER BY recu_a DESC LIMIT 1 OFFSET ${PROV_MAX}`).pluck(),
    reglage: db.prepare('SELECT value FROM settings WHERE key = ?').pluck(),
  };
  requetesFlux.set(db, q);
  return q;
}

// Début d'une période de n jours : minuit UTC du jour d'il y a n − 1 jours (les jours de la table daily, comme « Sur 7 jours »
// de la vue d'ensemble) ; rend { jour: 'AAAA-MM-JJ', debut: ms }.
export function debutPeriode(t, jours) {
  const j = new Date(t - (jours - 1) * 864e5).toISOString().slice(0, 10);
  return { jour: j, debut: Date.parse(`${j}T00:00:00Z`) };
}

// Les flux d'une période, lus dans la base : { jours, debut, total, chemins (diagramme des événements), alertes (dans l'ordre
// de la console, avec leurs provenances), ouvertes, tronque (plus de ALERTES_MAX alertes), ecarts }.
export function lireFlux({ db, now = Date.now, jours = PERIODES[PERIODE_DEFAUT], correls = correlations() }) {
  const q = qFlux(db);
  const t = now();
  const { jour: j, debut } = debutPeriode(t, jours);
  // Alertes de la période : actives depuis son début (dernier événement dans la période), ouvertes ou closes.
  const lues = q.alertes.all(debut);
  const tronque = lues.length > ALERTES_MAX;
  const rows = lues.slice(0, ALERTES_MAX).sort(alertOrder);
  const alertes = rows.map(a => {
    const grav = GRAV[a.gravite] || 'basse';
    return { id: a.id, regle: a.regle, grav, mot: F.MOT[grav], chemin: cheminDe(a.regle, correls), statut: a.statut, mode: a.mode,
      premiere: a.premiere, derniere: a.derniere, entiteKind: a.entite_kind, sources: (lire(a.sources) || []).filter(s => F.TEINTES.includes(s)), parts: [], evenements: 0 };
  });
  const parId = new Map(alertes.map(a => [a.id, a]));

  // Volumes par (type, gravité, composant) sur la période.
  const seaux = new Map();
  const cle = (type, sev, comp) => `${type}\u0000${sev}\u0000${comp}`;
  let total = 0;
  for (const r of q.jours.all(j)) { seaux.set(cle(r.type, r.severity, r.composant), { type: r.type, severity: r.severity, composant: r.composant, n: r.n }); total += r.n; }

  // Événements des alertes : leurs provenances (diagramme des alertes) et, pour l'alerte qui les porte, retirés de « score »
  // ou « sans point » (le chemin d'un événement n'est connu qu'à l'ouverture de son alerte, § 3.18, point 14).
  const chemins = [];
  let ecarts = 0;
  if (alertes.length) {
    for (const r of q.evAlertes.all(JSON.stringify(alertes.map(a => a.id)), j)) {
      const a = parId.get(r.a);
      const origine = origineDe(r.type, r.composant), source = sourceFlux(r.composant);
      const p = a.parts.find(x => x.origine === origine && x.source === source);
      if (p) p.n += r.n; else a.parts.push({ origine, source, n: r.n });
      a.evenements += r.n;
      if (!r.prop) continue;
      const s = seaux.get(cle(r.type, r.severity, r.composant));
      const pris = Math.min(r.prop, s ? s.n : 0);
      if (pris < r.prop) ecarts += r.prop - pris;    // compteurs du jour et liens en désaccord : jamais un flux négatif
      if (s) s.n -= pris;
      if (pris) chemins.push({ origine, source, chemin: a.chemin, issue: a.grav, n: pris, alerte: a.id });
    }
    // Une alerte sans événement dans la période (détecteur sans événement, comme le silence du site) : sa provenance dite
    // par son entité et ses sources.
    for (const a of alertes) if (!a.parts.length) {
      const origine = a.entiteKind === 'compte' || a.entiteKind === 'session' ? 'adm' : a.entiteKind === 'ip' || a.entiteKind === 'reseau' ? 'vis' : 'vig';
      a.parts.push({ origine, source: a.sources[0] || 'vigie', n: 0 });
    }
    for (const a of alertes) {
      a.parts.sort((x, y) => y.n - x.n || F.METIER[0].indexOf(x.origine) - F.METIER[0].indexOf(y.origine) || F.METIER[1].indexOf(x.source) - F.METIER[1].indexOf(y.source));
      a.origine = a.parts[0].origine;   // origine principale (barre de provenance)
    }
  }
  for (const s of seaux.values()) {
    if (s.n > 0) chemins.push({ origine: origineDe(s.type, s.composant), source: sourceFlux(s.composant),
      chemin: pointsOf({ type: s.type, severity: s.severity }) > 0 ? 'score' : 'sanspoint', issue: 'sans', n: s.n, alerte: null });
  }
  // Mêmes provenances, même issue, même alerte : un seul chemin.
  const fusion = new Map();
  for (const c of chemins) {
    const k = `${c.origine}|${c.source}|${c.chemin}|${c.issue}|${c.alerte ?? ''}`;
    if (fusion.has(k)) fusion.get(k).n += c.n; else fusion.set(k, { ...c });
  }
  return { jours, debut, jour: j, total, chemins: [...fusion.values()], alertes, ouvertes: alertes.filter(a => a.statut !== 'close').length, tronque, ecarts };
}

// La barre « N alertes par origine » (MV-11 au téléphone, MV-01 sous le tableau des alertes) : un groupe par origine (ordre
// du métier), une case par alerte dans l'ordre de la console ; au plus 4 cases par groupe, puis « + n ».
const CASES_MAX = 4;
export function barreAlertes(alertes) {
  return F.METIER[0].map(o => {
    const als = alertes.filter(a => a.origine === o);
    if (!als.length) return null;
    const vues = als.slice(0, als.length > CASES_MAX ? CASES_MAX - 1 : CASES_MAX);
    return { origine: o, nom: F.NOMS[o], n: als.length, classe: `g-${Math.min(als.length, CASES_MAX)}`,
      cases: vues.map(a => ({ id: a.id, grav: a.grav, mot: a.mot })), plus: als.length - vues.length };
  }).filter(Boolean);
}

export const libellePeriode = p => `${PERIODES[p]}${NBSP}jours`;

// Ce que la vue d'ensemble affiche (barre de provenance) : la période par défaut de /flux, les mêmes nombres.
export function provenanceAlertes({ db, now = Date.now }) {
  const fl = lireFlux({ db, now, jours: PERIODES[PERIODE_DEFAUT] });
  return { n: fl.alertes.length, periode: `${PERIODES[PERIODE_DEFAUT]}${NBSP}derniers jours`, groupes: barreAlertes(fl.alertes), tronque: fl.tronque, evenements: nombre(fl.total) };
}

const listeIds = (ids, max = 6) => (ids.length > max ? `${ids.slice(0, max).map(i => `#${i}`).join(', ')}, …` : ids.map(i => `#${i}`).join(', '));

// La phrase de la page (§ 3.18, point 2).
export function phraseFlux(fl, periode) {
  const enP = `En ${libellePeriode(periode)}`;
  const n = fl.total, na = fl.alertes.length;
  if (!n && !na) return `${enP}, aucun événement ni aucune alerte.`;
  const ev = `${nombre(n)} ${pluriel(n, 'événement')}`;
  const sans = F.total(fl.chemins, 'issue', 'sans');
  if (!na) return `${enP}, ${ev}, aucune alerte${FINE}: le diagramme des alertes n’est pas dessiné, celui des événements finit tout entier sans alerte.`;
  const par = ch => fl.alertes.filter(a => a.chemin === ch).map(a => a.id);
  const d = par('direct'), s = par('score'), c = par('correl');
  const bout = (ids, mots) => (ids.length ? `${ids.length} ${mots} (${listeIds(ids)})` : null);
  const parts = [bout(d, 'par preuve directe'), bout(s, 'par le score d’une entité'), c.length ? bout(c, 'par corrélation') : 'aucune par corrélation'].filter(Boolean);
  const dont = fl.ouvertes === na ? (na > 1 ? ', toutes encore ouvertes' : ', encore ouverte') : fl.ouvertes ? `, dont ${fl.ouvertes} encore ${pluriel(fl.ouvertes, 'ouverte')}` : `, ${pluriel(na, 'close', 'toutes closes')}`;
  return `${enP}, ${ev} ${pluriel(n, 'a', 'ont')} donné ${na} ${pluriel(na, 'alerte')}${dont}${FINE}: ${parts.join(', ')}${FINE}; ${nombre(sans)} ${pluriel(sans, 'est resté', 'sont restés')} sans alerte.`;
}

const PAYS = (() => { try { return new Intl.DisplayNames(['fr'], { type: 'region' }); } catch { return null; } })();
const nomPays = c => { try { return (PAYS && /^[A-Z]{2}$/.test(c) && PAYS.of(c)) || String(c); } catch { return String(c); } };
const majuscule = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// Provenances les plus actives (§ 3.18, point 9), sans le trafic des administrateurs (les adresses de leurs connexions
// réussies, et les opérateurs vus avec elles) ; adresses tronquées pour un Lecteur.
export function lireProvenances({ db, debut, role }) {
  const q = qFlux(db);
  const ctrl = lire(q.reglage.get('controle_roles_admins'));
  const admins = Array.isArray(ctrl?.administrateurs) ? ctrl.administrateurs.map(String) : [];
  const ipsAdmins = new Set(admins.length ? q.admins.all(debut, JSON.stringify(admins)) : []);
  const rows = q.prov.all(debut);
  const coupe = q.provPlus.get(debut) != null;
  const asnAdmins = new Set(rows.filter(r => r.asn && ipsAdmins.has(r.ip)).map(r => String(r.asn)));
  const adr = new Map(), ops = new Map(), pays = new Map();
  let lus = 0, exclus = 0, bordure = 0, bordureAsn = 0;
  const plus = (m, k, n, extra) => { const x = m.get(k) || { n: 0, ...extra }; x.n += n; m.set(k, x); return x; };
  for (const r of rows) {
    lus += r.n;
    if (r.ip && (ipsAdmins.has(r.ip) || (r.asn && asnAdmins.has(String(r.asn))))) { exclus += r.n; continue; }
    if (r.ip) { const a = adresseDetail(r.ip, role); plus(adr, a.texte, r.n, { v6: a.v6, tronquee: a.tronquee }); }
    if (r.composant === 'bordure') {
      bordure += r.n;
      if (r.asn) {
        bordureAsn += r.n;
        // Le nom de l'opérateur : celui de son événement le plus récent.
        const x = plus(ops, String(r.asn), r.n, { op: r.op, dernier: r.dernier });
        if (r.dernier > x.dernier) { x.op = r.op; x.dernier = r.dernier; }
      }
    }
    if (r.country) plus(pays, String(r.country), r.n, {});
  }
  // Les k premiers en une passe, sans trier toute la liste : des dizaines de milliers d'adresses vues une fois chacune
  // (un balayage) donnaient autant de comparaisons localeCompare, une demi-seconde de boucle bloquée.
  const avant = (a, b) => b[1].n - a[1].n || String(a[0]).localeCompare(String(b[0]));
  const top = (m, k = 5) => {
    const t = [];
    for (const e of m) {
      if (t.length === k && avant(e, t[k - 1]) >= 0) continue;
      let i = t.length === k ? k - 1 : t.length;
      while (i > 0 && avant(e, t[i - 1]) < 0) { t[i] = t[i - 1]; i -= 1; }
      t[i] = e;
    }
    return t;
  };
  const tAdr = top(adr), tOps = top(ops), tPays = top(pays);
  const reste = (m, tp) => [...m.values()].reduce((s, x) => s + x.n, 0) - tp.reduce((s, [, x]) => s + x.n, 0);
  const max = l => Math.max(1, ...l.map(([, x]) => x.n));
  const barre = (n, m) => Math.max(1, Math.round((100 * n) / m));
  return {
    exclus: nombre(exclus), nExclus: exclus, coupe, lus: nombre(lus),
    adresses: tAdr.map(([texte, x]) => ({ texte, v6: x.v6, tronquee: x.tronquee, n: nombre(x.n), barre: barre(x.n, max(tAdr)) })), resteAdresses: nombre(reste(adr, tAdr)), nResteAdresses: reste(adr, tAdr),
    operateurs: tOps.map(([asn, x]) => ({ texte: `AS${asn}${x.op ? ` · ${String(x.op).slice(0, 60)}` : ''}`, n: nombre(x.n), barre: barre(x.n, max(tOps)) })), bordure: nombre(bordure), bordureAsn: nombre(bordureAsn),
    pays: tPays.map(([c, x]) => ({ texte: majuscule(nomPays(c)), n: nombre(x.n), barre: barre(x.n, max(tPays)) })),
  };
}

// Provenances gardées une minute par période et par rôle (audit D3-D4 : PROV_MAX événements relus à chaque affichage de
// /flux, 0,5 s de boucle bloquée), comme les écarts de santé (ecartsSante). Le rôle fait partie de la clé : un Lecteur
// ne reçoit jamais ce qui a été calculé pour un Analyste (adresses entières).
const provenancesCache = new WeakMap();
export const PROV_CACHE_MS = 60e3;
export function provenancesEnCache({ db, debut, role, t }) {
  let m = provenancesCache.get(db);
  if (!m) { m = new Map(); provenancesCache.set(db, m); }
  const cle = `${debut}|${role || ''}`;
  const c = m.get(cle);
  if (c && t - c.at < PROV_CACHE_MS && t >= c.at) return c.v;
  for (const [k, x] of m) if (!(t - x.at < PROV_CACHE_MS && t >= x.at)) m.delete(k);   // jamais plus que les clés de la minute
  const v = lireProvenances({ db, debut, role });
  m.set(cle, { at: t, v });
  return v;
}

const DESC_AL ='De gauche à droite : l’origine de chaque alerte (qui), sa ou ses sources (par où la Vigie l’a vue), son chemin (preuve '
  + 'directe, score d’une entité ou corrélation) et l’alerte, avec sa gravité. Une alerte, une bande de même épaisseur. Le tableau qui '
  + 'suit donne les mêmes informations.';
const DESC_EV = 'De gauche à droite : les origines, les sources, les chemins (preuve directe, score d’une entité, corrélation, sans point) '
  + 'et les issues (alertes par gravité, sans alerte), à l’échelle des événements. Le tableau qui suit donne les mêmes nombres.';
const MOTS_D = { bloquer: 'adresse bloquée', revoquer_session: 'session fermée', revoquer_compte: 'sessions du compte fermées', geler: 'compte gelé', verrouiller: 'admin verrouillée', suspendre_acces: 'accès suspendu', verifier_identite: 'identité redemandée' };

// Tout ce que le gabarit flux.eta affiche, déjà mis en forme (les SVG sont rendus et échappés par flux.js).
export function vueFlux({ db, now = Date.now, role, periode = PERIODE_DEFAUT, alerte = null, erreurs = [] }) {
  const t = now();
  const fl = lireFlux({ db, now, jours: PERIODES[periode] });
  const erreursVues = [...erreurs];
  let surligne = null;
  if (alerte != null) {
    if (fl.alertes.some(a => a.id === alerte)) surligne = alerte;
    else erreursVues.push('alerte');
  }
  const sur = `des ${PERIODES[periode]} derniers jours`;
  const al = fl.alertes;
  const deux = (dessin, args) => ({ std: dessin(args).html, large: dessin({ ...args, prefixe: `${args.prefixe}L`, largeur: F.LARGE, taille: F.TAILLE_LARGE }).html });
  const avec = surligne != null ? `, l’alerte #${surligne} mise en avant` : '';
  const dessinAl = al.length ? deux(a => F.diagrammeAlertes(al, a), { prefixe: 'fxa', titre: `Les ${al.length} ${pluriel(al.length, 'alerte')} ${sur}, de leur origine à leur gravité${avec}`,
    desc: surligne != null ? `${DESC_AL} Seule la bande de l’alerte #${surligne} est allumée, les autres sont estompées.` : DESC_AL, surligne }) : null;
  let dessinEv = null, echelle = '';
  if (fl.total) {
    const args = { prefixe: 'fxe', titre: `Les ${nombre(fl.total)} ${pluriel(fl.total, 'événement')} ${sur}, de leur origine à leur issue${avec}`, desc: DESC_EV, surligne };
    const std = F.diagrammeEvenements(fl.chemins, args);
    dessinEv = { std: std.html, large: F.diagrammeEvenements(fl.chemins, { ...args, prefixe: 'fxeL', largeur: F.LARGE, taille: F.TAILLE_LARGE }).html };
    echelle = std.lay.k >= 0.995 ? '1 px par événement' : `1 px pour ${nombre(Math.round(1 / std.lay.k))} événements`;
  }
  const lignesAl = al.map(a => ({
    id: a.id, grav: a.grav, mot: a.mot, statut: a.statut === 'close' ? 'close' : a.statut === 'en_cours' ? 'prise en charge' : 'ouverte',
    provenance: `${et([...new Set(a.parts.map(p => F.NOMS[p.origine]))])} → ${et([...new Set(a.parts.map(p => F.NOMS[p.source]))])} → ${F.NOMS[a.chemin]}`,
    evenements: nombre(a.evenements),
  }));
  const ordreI = { critique: 0, haute: 1, moyenne: 2, basse: 3, sans: 4 };
  const lignesEv = [...fl.chemins].sort((a, b) => ordreI[a.issue] - ordreI[b.issue] || b.n - a.n || (a.alerte ?? 0) - (b.alerte ?? 0)).map(c => ({
    origine: F.NOMS[c.origine], source: F.NOMS[c.source], chemin: F.NOMS[c.chemin], issue: F.NOMS[c.issue], n: nombre(c.n), alerte: c.alerte,
  }));
  // Réponses automatiques des alertes de la période (décisions rattachées à l'une d'elles).
  const reponses = al.length ? qFlux(db).reponses.all(JSON.stringify(al.map(a => a.id)), fl.debut) : [];
  const parAl = new Map();
  for (const d of reponses) { const id = d.alerte_id; if (!parAl.has(id)) parAl.set(id, []); parAl.get(id).push(d); }
  const suites = [...parAl.entries()].slice(0, 12).map(([id, ds]) => ({ id, quand: quand(ds[0].cree_a, t), quoi: ds.map(d => `${MOTS_D[d.kind] || d.kind} (#${d.id})`).join(', ') }));
  const s = surligne != null ? al.find(a => a.id === surligne) : null;
  return {
    maintenant: dateHeure(t), periode, libelle: libellePeriode(periode), depuis: jour(fl.debut), lecteur: role === 'viewer' || !role,
    erreurs: erreursVues,
    periodes: Object.keys(PERIODES).map(p => ({ href: p === PERIODE_DEFAUT ? '/flux' : `/flux?periode=${p}`, mot: libellePeriode(p), courante: p === periode })),
    phrase: phraseFlux(fl, periode),
    total: fl.total, totalTexte: nombre(fl.total), nAlertes: al.length, tronque: fl.tronque, alertesMax: ALERTES_MAX,
    surlignee: s && { id: s.id, mot: s.mot, depuis: quand(s.premiere, t), provenance: lignesAl.find(l => l.id === s.id).provenance },
    dessinAl, dessinEv, echelle, correlation: al.some(a => a.chemin === 'correl'),
    barre: barreAlertes(al),
    lignesAl, lignesEv,
    reponses: { n: reponses.length, suites, plus: Math.max(0, parAl.size - suites.length) },
    provenances: provenancesEnCache({ db, debut: fl.debut, role, t }),
    provMax: nombre(PROV_MAX),
  };
}

// ===================================================================================================================
// Santé (MV-07)
// ===================================================================================================================

const SITE_SILENCE = 3 * 60e3;            // détecteur « silence » (DS24)
const ZITADEL_TROU = 20 * 3600e3;         // vigie/zitadel.js (GAP)
const CHAINE_RETARD = 48 * 3600e3;        // vérifiée chaque jour : au-delà de deux jours, la vérification ne tourne plus
const ANALYSE_RETARD = 1000;              // événements reçus et pas encore analysés
const LISTES_RETARD = 48 * 3600e3;        // listes de menaces : une fois par jour
const LISTES ={ spamhaus_drop: 'Spamhaus DROP', feodo: 'abuse.ch Feodo Tracker', tor: 'Sorties Tor' };

const requetesSante = new WeakMap();
function qSante(db) {
  let q = requetesSante.get(db);
  if (q) return q;
  q = {
    reglage: db.prepare('SELECT value FROM settings WHERE key = ?').pluck(),
    dernier: db.prepare('SELECT recu_a, severity, detail FROM events WHERE type = ? ORDER BY recu_a DESC LIMIT 1'),
    compte: db.prepare('SELECT COUNT(*) FROM events WHERE type = ? AND recu_a >= ?').pluck(),
    parType: db.prepare("SELECT type, COUNT(*) n FROM events WHERE type IN ('bordure_blocage', 'bordure_rafale', 'bordure_erreurs', 'bordure_nouvel_operateur') AND recu_a >= ? GROUP BY type"),
    // Constats réseau sur 24 h (un événement résume les lignes d'un passage : detail.nombre en plus de la première).
    reseau: db.prepare(`SELECT type, SUM(1 + COALESCE(json_extract(detail, '$.nombre'), 0)) n FROM events
      WHERE type IN ('reseau_sortie_refusee', 'reseau_sortie_directe', 'reseau_flux_hors_liste') AND recu_a >= ? GROUP BY type`),
    // Deux sous-requêtes : chacune lit une extrémité de la clé (MIN et MAX ensemble parcouraient toute la table : 107 ms
    // par million de lignes, audit D3-C6).
    seqs: db.prepare('SELECT (SELECT MIN(seq) FROM events) mini, (SELECT MAX(seq) FROM events) maxi'),
    ouverte: db.prepare("SELECT id, gravite FROM alerts WHERE regle = ? AND statut != 'close' ORDER BY id DESC LIMIT 1"),
    jours: db.prepare('SELECT SUM(n) FROM daily WHERE day >= ?').pluck(),
    pages: db.prepare('PRAGMA page_count').pluck(),
    taillePage: db.prepare('PRAGMA page_size').pluck(),
  };
  requetesSante.set(db, q);
  return q;
}

const octets = n => {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1024 ** 3) return `${String(Math.round((n / 1024 ** 3) * 10) / 10).replace('.', ',')}${NBSP}Go`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)}${NBSP}Mo`;
  return `${Math.max(1, Math.round(n / 1024))}${NBSP}ko`;
};
const maillon = s => (typeof s === 'string' && s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-4)}` : String(s ?? ''));
const cmd = c => ({ cmd: c.split(' ') });
const deuxPoints = s => `${s}${FINE}:`;

// Les composants, toujours dans cet ordre (MV-07). Une carte : { id, icone, titre, etat { k, mot }, cls ('' | 'ecart' |
// 'panne'), kv, faits, seuil (morceaux), liens, serveur, commande }. commande : le geste de la carte (D3c), { k: 'verifier' |
// 'bordure' | 'accepter', hint, bloquee (accepter : numéro de l'alerte ouverte qui l'interdit) } ; le gabarit ne le montre qu'à qui
// a le droit (it.peut, calculé par la route). Une ligne de kv : { dt, t, sec, mono, secMono, subs,
// ruptures }. resume : la ligne de la carte « Santé » de la vue d'ensemble (morceaux ; null : pas de ligne), qui n'est
// qu'un résumé de cette page (mêmes seuils, mêmes écarts ; audit D3-D10). retentionDays : durée de conservation réglée
// (store.retentionDays ; audit D3-D15) ; sans elle, celle de la dernière purge.
export function vueSante({ db, engine, switches, now = Date.now, role, retentionDays = null }) {
  const q = qSante(db);
  const t = now();
  const reg = (k, d = null) => lire(q.reglage.get(k)) ?? d;
  const dernier = type => { const r = q.dernier.get(type); return r ? { ...r, detail: lire(r.detail) || {} } : null; };
  const cartes = [];
  const carte = c => cartes.push({ cls: '', kv: [], liens: [], serveur: [], faits: null, commande: null, resume: null, ...c });
  const ok = mot => ({ k: 'abouti', mot });
  const att = mot => ({ k: 'attention', mot });
  const arret = mot => ({ k: 'arret', mot });
  const neutre = mot => ({ k: 'neutre', mot });
  const { mini, maxi } = q.seqs.get() || {};
  const lignesBase = maxi ? maxi - mini + 1 : 0;
  const chaineV = reg('chaine_verifiee');
  const purgeNotee = dernier('vigie_purge');
  const conservation = (Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : null) ?? (Number(purgeNotee?.detail?.conservation_jours) || null);

  // 1. Chaîne du journal : c'est d'elle que dépend la foi dans tout le reste.
  {
    const c = chaineV;
    const tete = reg('tete_publiee');
    const purge = purgeNotee;
    const derniere = reg('derniere_purge');
    // La purge notée dit sa propre durée (elle a pu tourner avec un autre réglage).
    const effacees = Number(purge?.detail?.conservation_jours) || conservation;
    let etat, cls = '', faits = null;
    const kv = [];
    if (!c?.at) { etat = att('Jamais vérifiée'); cls = 'ecart'; kv.push({ dt: 'Vérifiée', t: 'jamais', sec: 'au démarrage de la Vigie puis chaque jour' }); faits = 'Chaîne du journal jamais vérifiée.'; }
    else if (c.ok === false) {
      etat = arret('Rompue'); cls = 'panne';
      const rs = Array.isArray(c.ruptures) && c.ruptures.length ? c.ruptures : c.rupture ? [c.rupture] : [];
      kv.push({ dt: 'Vérifiée', t: dateHeure(c.at), sec: `${nombre(c.lignes)} lignes, ${rs.length} ${pluriel(rs.length, 'rupture')}${FINE}; les autres lignes, avant et après, sont intactes` });
      kv.push({ dt: rs.length > 1 ? 'Ruptures' : 'Rupture', ruptures: rs.slice(0, 20).map(r => ({ seq: nombre(r.seq), raison: typo(r.raison) })), plus: Math.max(0, rs.length - 20) });
      faits = `La chaîne du journal est rompue${rs[0] ? ` à la ligne ${nombre(rs[0].seq)}` : ''}.`;
    } else {
      const vieille = t - c.at > CHAINE_RETARD;
      etat = vieille ? att('Écart') : ok('Intacte'); cls = vieille ? 'ecart' : '';
      kv.push({ dt: 'Vérifiée', t: dateHeure(c.at), sec: `${nombre(c.lignes)} lignes, aucune rupture${vieille ? ` · ${ilYa(c.at, t)}` : ''}` });
      if (vieille) faits = `Chaîne du journal vérifiée ${ilYa(c.at, t)}${FINE}: la vérification quotidienne ne tourne plus.`;
    }
    if (tete?.seq) kv.push({ dt: 'Tête publiée', mono: `ligne ${nombre(tete.seq)} · maillon ${maillon(tete.chain)}`, sec: `${tete.at ? `${dateHeure(tete.at)}, ` : ''}écrite dans le journal du conteneur, hors de la base` });
    const purgeTexte = !derniere ? 'pas encore faite'
      : `${dateHeure(derniere)}${D}${purge && Math.abs(purge.recu_a - derniere) < 3600e3 && purge.detail.lignes ? `${nombre(purge.detail.lignes)} lignes de plus de ${effacees}${NBSP}jours effacées${FINE}; ancre signée` : 'rien à effacer'}`;
    kv.push({ dt: 'Purge', t: purgeTexte, sec: conservation ? `conservation${D}${conservation}${NBSP}jours` : undefined });
    const rs0 = c?.ruptures?.[0] || c?.rupture;
    const resume = !c?.at ? [{ t: `Chaîne${D}jamais vérifiée` }]
      : c.ok === false ? [{ t: 'Chaîne ' }, { t: 'rompue', b: true }, { t: `${rs0 ? ` (ligne ${nombre(rs0.seq)}${D}${typo(rs0.raison)})` : ''}, vérifiée ${aQuand(c.at, t)}` }]
        : t - c.at > CHAINE_RETARD ? [{ t: 'Chaîne intacte, mais vérifiée ' }, { t: ilYa(c.at, t), b: true }]
          : [{ t: 'Chaîne ' }, { t: 'intacte', b: true }, { t: `, vérifiée ${aQuand(c.at, t)}` }];
    carte({ id: 'chaine', icone: 'chaine', titre: 'Chaîne du journal', etat, cls, kv, faits, resume,
      seuil: [{ t: `Alerte si une ligne est modifiée, insérée ou manquante, une fin effacée, une ancre de purge falsifiée${D}${guillemets('Chaîne du journal de la Vigie rompue')} ` }, { t: '(Critique, DS20, ', r: true }, { t: 'chaine_rompue', donnee: true }, { t: ')', r: true }, { t: '. Vérifiée chaque jour et à chaque démarrage.' }],
      // Environ 13,5 s par million de lignes (vigie-capacite.md § 3.1).
      commande: { k: 'verifier', hint: `environ ${Math.max(1, Math.round(lignesBase * 13.5e-6))}${NBSP}s${FINE}; la réception continue` },
      serveur: [{ p: deuxPoints('Comparer la tête avec le journal du conteneur') }, cmd('docker logs nicephos-vigie | grep tete_chaine'), { p: deuxPoints('Vérifier en ligne de commande') }, cmd('node vigie/cli.js verifier')] });
  }

  // 2. Site : battement, file d'attente du site, lots refusés.
  {
    const b = dernier('sys_heartbeat');
    const refuses = q.compte.get('vigie_ingestion_refusee', t - 864e5);
    const perdus = q.compte.get('sys_events_dropped', t - 864e5);
    const kv = [];
    let etat = ok('Répond'), cls = '', faits = null;
    if (!b) { etat = att('Écart'); cls = 'ecart'; kv.push({ dt: 'Dernier battement', t: 'aucun reçu' }); faits = 'Aucun battement du site reçu.'; }
    else {
      const silence = t - b.recu_a > SITE_SILENCE;
      if (silence) { etat = att('Écart'); cls = 'ecart'; faits = `Site silencieux, dernier battement ${aQuand(b.recu_a, t)} (${ilYa(b.recu_a, t)}).`; }
      kv.push({ dt: 'Dernier battement', t: quand(b.recu_a, t), sec: silence ? `${ilYa(b.recu_a, t)}${FINE}; un par minute attendu` : 'un par minute, avec la file d’attente du site' });
      const attente = Number(b.detail.attente);
      if (Number.isFinite(attente)) kv.push({ dt: 'En attente sur le site', t: `${nombre(attente)} ${pluriel(attente, 'événement')}`, sec: 'file sur disque si la Vigie ne répond pas' });
    }
    kv.push({ dt: 'Lots refusés (24 h)', t: nombre(refuses) });
    if (perdus) kv.push({ dt: 'Événements perdus par le site (24 h)', t: nombre(perdus) });
    if (refuses && !cls) { etat = att('Écart'); cls = 'ecart'; faits = `${nombre(refuses)} ${pluriel(refuses, 'lot refusé', 'lots refusés')} en 24${NBSP}h.`; }
    let resume;
    if (!b) resume = [{ t: `Site${D}aucun battement reçu` }];
    else if (t - b.recu_a > SITE_SILENCE) resume = [{ t: `Site${D}dernier battement ` }, { t: quand(b.recu_a, t), b: true }, { t: ` (${ilYa(b.recu_a, t)})` }];
    else {
      const attente = Number(b.detail.attente);
      resume = [{ t: `Site${D}battement à ` }, { t: heure(b.recu_a), b: true }, { t: Number.isFinite(attente) ? `, ${nombre(attente)} en attente` : '' }];
    }
    if (refuses) resume.push({ t: D }, { t: `${nombre(refuses)} ${pluriel(refuses, 'lot refusé', 'lots refusés')} en 24${NBSP}h`, b: true });
    carte({ id: 'site', icone: 'site', titre: 'Site', etat, cls, kv, faits, resume,
      seuil: [{ t: `Alerte si plus rien du site depuis 3 minutes${D}détecteur ` }, { t: 'silence', donnee: true }, { t: ' (Haute, DS24)', r: true }, { t: ` ; un lot à la signature fausse ou rejoué${D}${guillemets('Lot refusé par la Vigie')} ` }, { t: '(Haute)', r: true }, { t: '.' }] });
  }

  // 3. Zitadel : dernière lecture réussie, échecs depuis, trous signalés.
  {
    const z = reg('zitadel_derniere_lecture');
    const err = dernier('vigie_zitadel_erreur');
    const curseur = Date.parse(reg('zitadel_curseur') || '');
    const trous = q.compte.get('vigie_zitadel_trou', t - 30 * 864e5);
    const kv = [];
    let etat, cls = '', faits = null;
    if (!z) {
      etat = neutre('Non réglé');
      kv.push({ dt: 'Dernière lecture', t: 'jamais', sec: 'Zitadel non configuré, ou jamais joint' });
    } else {
      const echec = err && err.recu_a > z;
      if (t - z > ZITADEL_TROU || (echec && t - z > 5 * 60e3)) { etat = arret('Injoignable'); cls = 'panne'; faits = `Zitadel ne répond plus depuis ${quand(z, t)}${t - z > ZITADEL_TROU ? '' : `${FINE}; rien n’est encore perdu`}.`; }
      else etat = ok('Répond');
      kv.push({ dt: echec ? 'Dernière lecture réussie' : 'Dernière lecture', t: quand(z, t),
        sec: echec ? `échecs depuis${err.detail.echecs ? ` (${nombre(err.detail.echecs)})` : ''}${FINE}; le dernier${D}${guillemets(typo(masquer(String(err.detail.erreur || '').slice(0, 160), role)))}` : 'chaque minute, par son API des événements' });
      if (Number.isFinite(curseur)) kv.push({ dt: 'Lu jusqu’à', t: quand(curseur, t), sec: 'reprise depuis ce point au passage suivant' });
    }
    kv.push({ dt: 'Trous de plus de 20 h (30 jours)', t: nombre(trous) });
    const resume = !z ? [{ t: `Zitadel${D}jamais lu (ou non configuré)` }]
      : cls ? [{ t: `Zitadel${D}dernière lecture${err && err.recu_a > z ? ' réussie' : ''} ` }, { t: quand(z, t), b: true }, { t: ` (${ilYa(z, t)})` }]
        : [{ t: `Zitadel lu ${aQuand(z, t).replace(/ .*$/, '')} ` }, { t: quand(z, t), b: true }];
    // Quota mensuel de l'API de Zitadel Cloud (requêtes de ce mois, par usage).
    const zq = reg('zitadel_quota');
    if (zq && zq.mois === new Date(t).toISOString().slice(0, 7)) {
      const par = Object.entries(zq.par || {}).map(([k, n]) => `${({ evenements: 'événements', plafond: 'droits de la console', console: 'console' })[k] || k} ${nombre(n)}`).join(' · ');
      kv.push({ dt: 'Requêtes ce mois', t: `${nombre(zq.n)} sur le quota`, sec: par || null });
    }
    carte({ id: 'zitadel', icone: 'zitadel', titre: 'Zitadel', etat, cls, kv, faits, resume,
      seuil: [{ t: `Alerte si plus de 20${NBSP}h sans lecture réussie${D}${guillemets(`Événements de Zitadel perdus (plus de 20${NBSP}h sans lecture)`)} ` }, { t: '(Moyenne, DS24)', r: true }, { t: '. Avant, chaque échec est noté, sans alerte.' }] });
  }

  // 4. Bordure Cloudflare (facultative).
  {
    const beat = reg('bordure_dernier_battement');
    const kvL = reg('bordure_kv');
    const curseur = reg('bordure_curseur');
    const donnee = reg('bordure_derniere_donnee');
    const silence = reg('bordure_silence_signale', false) === true;
    const err = dernier('vigie_bordure_erreur');
    const reglee = Boolean(beat || kvL || curseur);
    const kv = [];
    let etat, cls = '', faits = null;
    if (!reglee) {
      etat = neutre('Non réglée');
      kv.push({ dt: 'Bordure', t: 'non réglée', sec: 'VIGIE_CF_* absentes : la bordure n’est pas une source du quorum' });
    } else {
      etat = silence ? arret('Muette') : ok('Répond'); cls = silence ? 'panne' : '';
      if (silence) faits = `Bordure muette${beat?.at ? `${FINE}: dernier battement ${aQuand(beat.at, t)}` : ''}.`;
      kv.push({ dt: 'Battement du Worker', t: beat?.at ? quand(beat.at, t) : 'aucun', sec: beat?.etat ? `toutes les 5${NBSP}min · état${D}${guillemets(typo(masquer(beat.etat, role)))}` : `toutes les 5${NBSP}min` });
      if (kvL) kv.push({ dt: 'Liste des blocages', t: `${kvL.version != null ? `version ${kvL.version}, ` : ''}copiée ${kvL.at ? aQuand(kvL.at, t) : '—'}` });
      // Liste d'adresses bloquées chez Cloudflare (phase E3, facultative).
      const cfl = reg('cf_liste');
      if (cfl) kv.push({ dt: 'Liste chez Cloudflare', t: cfl.ok === false ? `en échec ${cfl.at_echec ? aQuand(cfl.at_echec, t) : ''}` : `${nombre(cfl.total || 0)} ${pluriel(cfl.total || 0, 'adresse')}, rapprochée ${cfl.at ? aQuand(cfl.at, t) : '—'}`,
        sec: cfl.ok === false ? typo(masquer(String(cfl.erreur || ''), role)) : `blocages de tout le site de 24${NBSP}h et plus ; liste ${guillemets(cfl.liste || 'vigie_bloquees')}` });
      if (curseur) kv.push({ dt: 'Lue jusqu’à', t: quand(curseur, t), sec: donnee ? `dernière requête vue ${aQuand(donnee, t)}` : 'aucune requête vue' });
      const par = Object.fromEntries(q.parType.all(t - 864e5).map(r => [r.type, r.n]));
      const n = k => par[k] || 0;
      kv.push({ dt: 'Constats (24 h)', t: `${nombre(n('bordure_rafale'))} ${pluriel(n('bordure_rafale'), 'rafale')} de pages · ${nombre(n('bordure_erreurs'))} ${pluriel(n('bordure_erreurs'), 'rafale')} d’erreurs · ${nombre(n('bordure_blocage'))} ${pluriel(n('bordure_blocage'), 'blocage appliqué', 'blocages appliqués')}` });
      if (err && t - err.recu_a < 864e5) kv.push({ dt: 'Dernière erreur', t: quand(err.recu_a, t), sec: `${typo(err.detail.operation || '')}${D}${typo(masquer(String(err.detail.erreur || '').slice(0, 160), role))}` });
    }
    let resume = null;
    if (reglee) {
      resume = [{ t: `Bordure${D}` }];
      if (beat?.at) resume.push({ t: `battement ${aQuand(beat.at, t).replace(/ .*$/, '')} ` }, { t: quand(beat.at, t), b: true }); else resume.push({ t: 'aucun battement' });
      if (kvL?.at) resume.push({ t: `, liste${kvL.version != null ? ` ${kvL.version}` : ''} copiée ${aQuand(kvL.at, t)}` });
      if (silence) resume.push({ t: D }, { t: 'muette', b: true });
    }
    carte({ id: 'bordure', icone: silence ? 'nuage-barre' : 'bordure', titre: 'Bordure Cloudflare', etat, cls, kv, faits, resume,
      seuil: [{ t: `Alerte si plus de battement depuis 20${NBSP}min, aucune requête vue depuis 6${NBSP}h, ou une copie ou une lecture en échec${D}${guillemets('Bordure injoignable ou silencieuse (jeton, quota, Worker retiré)')} ` }, { t: '(Moyenne, DS24)', r: true }, { t: '.' }],
      commande: reglee ? { k: 'bordure', hint: `une copie toutes les 2${NBSP}min au plus` } : null,
      serveur: [{ p: deuxPoints('Diagnostic complet (copie, battement, en-têtes refusés par le site, empreintes TLS)') }, cmd('node vigie/cli.js bordure')] });
  }

  // 4 bis. Réseau (phase E4, facultatif) : journaux du mandataire de sortie et des rejets de l'hôte (vigie/reseau.js).
  {
    const e = reg('reseau_etat', {}) || {};
    const silence = reg('reseau_silence_signale', {}) || {};
    const muets = Object.keys(silence);
    const reglee = Boolean(e.mandataire || e.hote);
    const kv = [];
    let etat, cls = '', faits = null;
    const NOMS_J = { mandataire: 'Mandataire de sortie', hote: 'Rejets de l’hôte' };
    if (!reglee) {
      etat = neutre('Non réglé');
      kv.push({ dt: 'Réseau', t: 'non réglé', sec: 'VIGIE_RESEAU_* absentes : le réseau n’est pas une source du quorum' });
    } else {
      etat = muets.length ? arret('Muet') : ok('Lu'); cls = muets.length ? 'panne' : '';
      if (muets.length) faits = `${muets.map(k => `${NOMS_J[k] || k}${D}${typo(String(silence[k]))}`).join(' ; ')}.`;
      for (const k of ['mandataire', 'hote']) {
        const j = e[k];
        if (!j) { kv.push({ dt: NOMS_J[k], t: 'non lu', sec: 'chemin non réglé' }); continue; }
        const derniere = j.derniere_ligne ? quand(j.derniere_ligne, t) : 'aucune ligne';
        const sec = j.erreur ? `illisible${D}${typo(String(j.erreur))}` : j.absent ? 'fichier encore absent' : k === 'hote'
          ? (j.battement ? `règles ${j.battement.etat === 'ok' ? 'en place' : j.battement.etat}, battement ${aQuand(j.battement.at, t)}` : 'aucun battement des règles')
          : (j.dernier_battement ? `battement ${aQuand(j.dernier_battement, t)}${j.liste ? ` · ${nombre(j.liste.length)} ${pluriel(j.liste.length, 'nom autorisé', 'noms autorisés')}` : ''}` : 'aucun battement');
        kv.push({ dt: NOMS_J[k], t: `dernière ligne ${derniere}`, sec });
      }
      const par = Object.fromEntries(q.reseau.all(t - 864e5).map(r => [r.type, r.n]));
      const n = k => par[k] || 0;
      kv.push({ dt: 'Constats (24 h)', t: `${nombre(n('reseau_sortie_refusee'))} ${pluriel(n('reseau_sortie_refusee'), 'sortie refusée', 'sorties refusées')} · ${nombre(n('reseau_sortie_directe'))} ${pluriel(n('reseau_sortie_directe'), 'sortie directe', 'sorties directes')} · ${nombre(n('reseau_flux_hors_liste'))} ${pluriel(n('reseau_flux_hors_liste'), 'flux hors liste', 'flux hors liste')}` });
    }
    let resume = null;
    if (reglee) {
      const derniere = Math.max(e.mandataire?.derniere_ligne || 0, e.hote?.derniere_ligne || 0);
      resume = [{ t: `Réseau${D}` }];
      if (derniere) resume.push({ t: `lu ${aQuand(derniere, t).replace(/ .*$/, '')} ` }, { t: quand(derniere, t), b: true }); else resume.push({ t: 'aucune ligne' });
      if (muets.length) resume.push({ t: D }, { t: 'muet', b: true });
    }
    carte({ id: 'reseau', icone: muets.length ? 'reseau-barre' : 'reseau', titre: 'Réseau', etat, cls, kv, faits, resume,
      seuil: [{ t: `Alerte si un journal est illisible, muet plus de 24${NBSP}h alors que le site tourne, ou si les règles de l’hôte manquent${D}${guillemets('Journal réseau illisible ou muet, ou règles de l’hôte absentes')} ` }, { t: '(Moyenne, DS24)', r: true }, { t: '. Une sortie directe ou un flux du site hors liste ouvre une alerte Haute.' }],
      serveur: [{ p: deuxPoints('Journaux, positions, battements, noms refusés et acceptés') }, cmd('node vigie/cli.js reseau'), { p: deuxPoints('Règles de l’hôte (sur Unraid, sans rien changer)') }, cmd('deploy/unraid/reseau/regles.sh --afficher')] });
  }

  // 5. Contrôle des rôles (sauvegarde du site).
  {
    const vu = reg('controle_roles_vu');
    const ref = reg('controle_roles_admins');
    const dec = reg('controle_roles_declencheurs');
    const rapport = dernier('vigie_controle_roles');
    const ecart = q.ouverte.get('sigma.controle_roles') || q.ouverte.get('sigma.controle_roles_degrade');
    const kv = [];
    let etat, cls = '', faits = null;
    const d = rapport?.detail || {};
    if (ecart) { etat = att('Écart'); cls = 'ecart'; faits = [{ t: `Contrôle des rôles${D}écart, ` }, { t: `alerte #${ecart.id}`, href: `/alertes/${ecart.id}` }, { t: ' ouverte.' }]; }
    else if (!ref) { etat = att('Écart'); cls = 'ecart'; faits = `Contrôle des rôles${D}aucun contrôle réussi.`; }
    else etat = ok('Sans écart');
    if (vu?.fichier) kv.push({ dt: 'Sauvegarde contrôlée', t: vu.at ? `contrôlée ${aQuand(vu.at, t)}` : '—', secMono: String(vu.fichier).slice(0, 80), sec: 'heure UTC dans le nom' });
    else kv.push({ dt: 'Sauvegarde contrôlée', t: 'aucune', sec: 'le contrôle tourne à chaque sauvegarde du site' });
    if (rapport) {
      if (d.erreur) kv.push({ dt: 'Dernier contrôle', t: quand(rapport.recu_a, t), sec: typo(String(d.erreur).slice(0, 160)) });
      else {
        const sans = Array.isArray(d.administrateurs_sans_changement) ? d.administrateurs_sans_changement : [];
        const inconnus = Array.isArray(d.administrateurs_non_declares) ? d.administrateurs_non_declares : [];
        kv.push({ dt: 'Administrateurs', t: `${nombre(d.administrateurs ?? 0)}${sans.length ? `, dont ${sans.length} sans changement journalisé` : ''}${inconnus.length ? `, dont ${inconnus.length} non ${pluriel(inconnus.length, 'déclaré')}` : ''}`,
          subs: [...new Set([...sans, ...inconnus])].slice(0, 6).map(x => String(x).slice(0, 80)) });
        const abs = Array.isArray(d.declencheurs_absents) ? d.declencheurs_absents.length : 0, mod = Array.isArray(d.declencheurs_modifies) ? d.declencheurs_modifies.length : 0;
        kv.push({ dt: 'Déclencheurs', t: abs || mod ? `${abs} ${pluriel(abs, 'absent')}, ${mod} ${pluriel(mod, 'modifié')}` : dec ? 'inchangés' : 'pas encore de référence' });
      }
    }
    if (ref?.instantane_a) kv.push({ dt: 'Référence', t: `sauvegarde ${aQuand(ref.instantane_a, t)}`, sec: `${nombre((ref.administrateurs || []).length)} ${pluriel((ref.administrateurs || []).length, 'administrateur connu', 'administrateurs connus')}` });
    const controlee = vu?.at ? ` contrôlée ${aQuand(vu.at, t)}` : '';
    const resume = ecart ? [{ t: `Contrôle des rôles${D}sauvegarde${controlee}${D}` }, { t: 'écart', b: true }, { t: ' (' }, { t: `#${ecart.id}`, href: `/alertes/${ecart.id}` }, { t: ')' }]
      : !ref ? [{ t: `Contrôle des rôles${D}aucun contrôle réussi` }]
        : [{ t: `Contrôle des rôles${D}sauvegarde${ref.instantane_a ? ` de ${quand(ref.instantane_a, t)}` : ''}${controlee}, ` }, { t: 'sans écart', b: true }];
    carte({ id: 'roles', icone: 'droits', titre: 'Contrôle des rôles', etat, cls, kv, faits, resume,
      liens: ecart ? [{ href: `/alertes/${ecart.id}`, t: `Ouvrir l’alerte #${ecart.id}`, btn: true }] : [],
      seuil: [{ t: `Alerte si un administrateur n’est pas déclaré ou rien n’explique son arrivée, un déclencheur manque ou a changé${D}${guillemets('Sauvegarde du site différente de ce qu’il déclare…')} ` }, { t: '(Critique, DS8)', r: true },
        { t: ` ; sauvegarde absente, illisible ou de plus de 48${NBSP}h${D}${guillemets('Contrôle des rôles impossible ou incomplet')} ` }, { t: '(Haute)', r: true }, { t: '.' }],
      commande: { k: 'accepter', bloquee: ecart ? ecart.id : null },
      serveur: [{ p: deuxPoints('Accepter n’efface rien : l’instantané remplace la référence, sans durée. Refusé tant qu’une alerte du contrôle des rôles est ouverte. En ligne de commande') }, cmd('node vigie/cli.js controle --accepter --motif "…"')] });
  }

  // 6. Listes de menaces.
  {
    const m = reg('menaces_maj');
    const kv = [];
    let etat, cls = '', faits = null;
    if (!m?.at) { etat = neutre('Jamais lues'); kv.push({ dt: 'Mises à jour', t: 'jamais', sec: 'une fois par jour, si les listes sont activées' }); }
    else {
      const erreurs = Object.keys(LISTS).filter(k => typeof m[k] === 'string');
      const vieille = t - m.at > LISTES_RETARD;
      etat = erreurs.length || vieille ? att('Écart') : ok('À jour'); cls = erreurs.length || vieille ? 'ecart' : '';
      if (cls) faits = erreurs.length ? `Liste de menaces en erreur${D}${erreurs.map(k => LISTES[k]).join(', ')}.` : `Listes de menaces lues ${ilYa(m.at, t)}.`;
      kv.push({ dt: 'Mises à jour', t: dateHeure(m.at), sec: 'une fois par jour, sans envoyer aucune adresse' });
      for (const [k, def] of Object.entries(LISTS)) {
        const v = m[k];
        kv.push({ dt: LISTES[k] || k, t: typeof v === 'number' ? `${nombre(v)} ${pluriel(v, 'entrée')} · ${def.points}${NBSP}${pluriel(def.points, 'point')}` : typeof v === 'string' ? typo(v.slice(0, 160)) : '—' });
      }
    }
    const enErreur = m?.at ? Object.keys(LISTS).filter(k => typeof m[k] === 'string') : [];
    const resume = !m?.at ? [{ t: `Listes de menaces${D}jamais lues` }]
      : enErreur.length ? [{ t: `Listes de menaces${D}` }, { t: 'en erreur', b: true }, { t: ` (${enErreur.map(k => LISTES[k]).join(', ')})` }]
        : cls ? [{ t: 'Listes de menaces lues ' }, { t: ilYa(m.at, t), b: true }]
          : [{ t: `Listes de menaces à jour, lues ${aQuand(m.at, t)}` }];
    carte({ id: 'menaces', icone: 'liste', titre: 'Listes de menaces', etat, cls, kv, faits, resume,
      seuil: [{ t: `Ajoutent des points à une adresse, jamais une source du quorum. Une liste vide, triplée ou de plus de 20${NBSP}000 entrées est refusée${D}la précédente reste, l’erreur s’écrit ici, sans alerte.` }],
      serveur: [{ p: deuxPoints('État des listes en ligne de commande') }, cmd('node vigie/cli.js menaces')] });
  }

  // 7. Analyse : événements reçus et pas encore analysés.
  {
    const curseur = Number(reg('moteur_curseur', 0)) || 0;
    const retard = Math.max(0, (maxi ?? 0) - curseur);
    const detection = switches?.isOn ? switches.isOn('detection') : true;
    const sature = dernier('vigie_moteur_sature');
    const lente = dernier('vigie_regle_lente');
    const kv = [{ dt: 'En attente', t: `${nombre(retard)} ${pluriel(retard, 'événement')}`, sec: `dernier analysé${D}ligne ${nombre(curseur)}` }];
    let etat = ok('À jour'), cls = '', faits = null;
    if (!detection) { etat = att('Arrêtée'); cls = 'ecart'; faits = `Détection arrêtée${D}les événements reçus ne sont pas analysés.`; }
    else if (retard >= ANALYSE_RETARD) { etat = att('Écart'); cls = 'ecart'; faits = `${nombre(retard)} événements en attente d’analyse.`; }
    kv.push({ dt: 'Détection', t: detection ? 'en marche' : 'arrêtée' });
    if (sature && t - sature.recu_a < 30 * 864e5) kv.push({ dt: 'Saturation (30 jours)', t: dateHeure(sature.recu_a), sec: `${nombre(sature.detail.ignores || 0)} événements non analysés` });
    if (lente && t - lente.recu_a < 864e5) kv.push({ dt: 'Règle arrêtée par son délai (24 h)', t: quand(lente.recu_a, t), secMono: String(lente.detail.regle || '').slice(0, 80) });
    const resume = !detection ? [{ t: `Analyse${D}` }, { t: 'détection arrêtée', b: true }]
      : retard >= ANALYSE_RETARD ? [{ t: `Analyse${D}` }, { t: `${nombre(retard)} événements en attente`, b: true }]
        : [{ t: retard ? `Analyse${D}${nombre(retard)} ${pluriel(retard, 'événement')} en attente` : `Analyse${D}aucun retard` }];
    carte({ id: 'analyse', icone: 'sante', titre: 'Analyse', etat, cls, kv, faits, resume,
      seuil: [{ t: `Alerte si plus de 100${NBSP}000 événements attendent${D}le moteur saute en avant et ouvre ${guillemets('Moteur de la Vigie saturé (événements non analysés)')} ` }, { t: '(Haute)', r: true },
        { t: ` ; une règle arrêtée par son délai${D}${guillemets('Expression régulière d’une règle arrêtée par son délai')} ` }, { t: '(Moyenne)', r: true }, { t: '.' }] });
  }

  // 8. Base et disque.
  {
    const kv = [];
    let etat = ok('Place suffisante'), cls = '', faits = null;
    const fichier = db.name && db.name !== ':memory:' ? db.name : null;
    let taille = null;
    if (fichier) { try { taille = fs.statSync(fichier).size + (fs.existsSync(`${fichier}-wal`) ? fs.statSync(`${fichier}-wal`).size : 0); } catch { /* illisible */ } }
    if (taille == null) taille = q.pages.get() * q.taillePage.get();
    kv.push({ dt: 'Base', t: `${octets(taille)} · ${nombre(lignesBase)} ${pluriel(lignesBase, 'ligne')}`, sec: conservation ? `${conservation}${NBSP}jours gardés` : undefined });
    let libre = null, totalDisque = null;
    if (fichier && typeof fs.statfsSync === 'function') {
      try { const s = fs.statfsSync(path.dirname(fichier)); libre = s.bavail * s.bsize; totalDisque = s.blocks * s.bsize; } catch { /* indisponible */ }
    }
    if (libre != null) {
      const part = totalDisque ? libre / totalDisque : 1;
      kv.push({ dt: 'Disque libre', t: octets(libre), sec: totalDisque ? `sur ${octets(totalDisque)} (${Math.round(part * 100)}${NBSP}%)` : null });
      if (libre < 2 * 1024 ** 3 || part < 0.05) { etat = att('Écart'); cls = 'ecart'; faits = `Disque presque plein${D}${octets(libre)} libres.`; }
    } else kv.push({ dt: 'Disque libre', t: 'inconnu', sec: 'mesure du système de fichiers indisponible' });
    const sept = q.jours.get(new Date(t - 6 * 864e5).toISOString().slice(0, 10)) || 0;
    const parJour = Math.round(sept / 7);
    kv.push({ dt: 'Au rythme actuel', t: `environ ${nombre(parJour)} ${pluriel(parJour, 'événement')} par jour`, sec: 'moyenne des 7 derniers jours' });
    const resume = [{ t: `Disque${D}` }, { t: `${octets(libre)} libres`, b: true }];
    carte({ id: 'disque', icone: 'base', titre: 'Base et disque', etat, cls, kv, faits, resume,
      seuil: [{ t: `Aucune alerte dans le code aujourd’hui${D}un seuil de disque libre est à créer. La console signale un écart sous 2${NBSP}Go ou 5${NBSP}% libres.` }] });
  }

  // 9. Canaux de notification : seuls les échecs sont notés (vigie_canal_echec) ; un envoi réussi ne laisse pas de trace.
  {
    const echec = dernier('vigie_canal_echec');
    const n24 = q.compte.get('vigie_canal_echec', t - 864e5);
    const alertesOn = switches?.isOn ? switches.isOn('alertes') : true;
    const kv = [];
    let etat = ok('Prêts'), cls = '', faits = null;
    if (!alertesOn) { etat = att('Arrêt'); cls = 'ecart'; faits = `Interrupteur Alertes arrêté${D}aucune notification Signal ni e-mail.`; }
    else if (n24) { etat = att('Écart'); cls = 'ecart'; faits = `${nombre(n24)} ${pluriel(n24, 'échec')} d’envoi en 24${NBSP}h.`; }
    // Ni adresse e-mail, ni numéro, ni groupe Signal (anciens événements, écrits avant le masque de notifications.js : D3-C5).
    kv.push({ dt: 'Échecs (24 h)', t: nombre(n24), sec: echec ? `le dernier ${aQuand(echec.recu_a, t)}, ${typo(echec.detail.canal || '')}${D}${guillemets(typo(masquer(sansContacts(String(echec.detail.erreur || '').slice(0, 300)), role).slice(0, 160)))}` : 'aucun échec noté' });
    kv.push({ dt: 'Envois réussis', t: 'non notés', sec: 'la Vigie ne garde que les échecs ; un message part à l’ouverture d’une alerte haute ou critique en mode Alerter ou Bloquer' });
    kv.push({ dt: 'Interrupteur Alertes', t: alertesOn ? 'Marche' : 'Arrêt' });
    const resume = !alertesOn ? [{ t: `Canaux${D}` }, { t: 'interrupteur Alertes arrêté', b: true }]
      : [{ t: `Canaux${D}` }, { t: `${nombre(n24)} ${pluriel(n24, 'échec')} d’envoi en 24${NBSP}h`, b: true }];
    carte({ id: 'canaux', icone: 'alertes', titre: 'Canaux', etat, cls, kv, faits, resume,
      liens: [{ href: '/reglages#canaux', t: 'Envoyer un essai : Règles et réglages' }],
      seuil: [{ t: `Alerte si un envoi échoue${D}${guillemets('Canal de notification en échec (Signal ou e-mail)')} ` }, { t: '(Moyenne, DS24)', r: true }, { t: ', une fois par heure et par canal ; l’e-mail part à la place de Signal.' }] });
  }

  // 10. Version.
  {
    const dem = dernier('vigie_demarrage');
    const kv = [{ dt: 'Vigie', t: VERSION ? `version ${VERSION}` : 'version inconnue', sec: `Node.js ${process.versions.node}` }];
    if (dem) kv.push({ dt: 'Démarrée', t: dateHeure(dem.recu_a), sec: `chaîne ${dem.detail.chaine === 'rompue' ? 'rompue' : 'intacte'} au démarrage${dem.detail.version && dem.detail.version !== VERSION ? ` · version ${dem.detail.version} au démarrage` : ''}` });
    const regles = engine?.counts?.();
    if (regles) kv.push({ dt: 'Règles chargées', t: `${nombre(regles.regles)} ${pluriel(regles.regles, 'règle')}, ${nombre(regles.correlations)} ${pluriel(regles.correlations, 'corrélation')}` });
    carte({ id: 'version', icone: 'vigie', titre: 'Version', etat: neutre('Lue'), kv,
      seuil: [{ t: 'Sans alerte. La version vient du paquet de la Vigie ; le démarrage, de la ligne qu’elle note dans son journal.' }],
      serveur: [{ p: deuxPoints('La même lecture en ligne de commande') }, cmd('node vigie/cli.js etat')] });
  }

  const ecarts = cartes.filter(c => c.cls);
  const NOMS_C = { chaine: 'la chaîne du journal', site: 'le site', zitadel: 'Zitadel', bordure: 'la bordure', roles: 'le contrôle des rôles', menaces: 'les listes de menaces',
    analyse: 'l’analyse', disque: 'le disque', canaux: 'les canaux' };
  const noms = ecarts.map(c => NOMS_C[c.id] || c.titre);
  const rompue = cartes.find(c => c.id === 'chaine' && c.cls === 'panne');
  const phrase = rompue ? rompue.faits
    : !ecarts.length ? 'Tout répond.'
      : ecarts.length === 1 ? `Tout répond ; un écart${D}${noms[0]}.` : `${ecarts.length} écarts${D}${et(noms)}.`;
  const faits = ecarts.filter(c => c.faits && c !== rompue).slice(0, 3).map(c => ({ etat: c.etat, morceaux: Array.isArray(c.faits) ? c.faits : [{ t: c.faits }] }));
  if (rompue) faits.unshift({ etat: rompue.etat, morceaux: [{ t: 'Une ligne ne correspond plus à sa chaîne : modifiée ou insérée à la main. La Vigie continue de recevoir et d’analyser.' }] });
  else if (cartes[0].cls === '' && chaineV?.at) faits.push({ etat: cartes[0].etat, morceaux: [{ t: `Chaîne du journal vérifiée ${aQuand(chaineV.at, t)}${D}${nombre(chaineV.lignes)} lignes, aucune rupture.` }] });
  return { maintenant: dateHeure(t), lecteur: role === 'viewer' || !role, phrase, faits, cartes, nCartes: cartes.length, ecarts: ecarts.length };
}

// Écarts de santé pour le badge de la barre latérale : la même règle que /sante, gardée une minute (la page Santé relit
// tout ; le badge est sur chaque page). Renvoie { n, noms }. La vue d'ensemble, qui relit la santé, remet le compte à jour.
const ecartsCache = new WeakMap();
const ecartsDe = s => ({ n: s.ecarts, noms: s.cartes.filter(x => x.cls).map(x => x.id) });
export function ecartsSante({ db, engine, switches, now = Date.now }) {
  const t = now();
  const c = ecartsCache.get(db);
  if (c && t - c.at < 60e3 && t >= c.at) return c.v;
  const v = ecartsDe(vueSante({ db, engine, switches, now, role: 'admin' }));
  ecartsCache.set(db, { at: t, v });
  return v;
}

// Carte « Santé » de la vue d'ensemble (MV-01) : le résumé de /sante, une ligne par composant ({ k: 'ok' | 'att-s' |
// 'arret' | 'neutre', morceaux }) : toujours le site, Zitadel, la bordure (réglée), la chaîne, le contrôle des rôles et
// l'analyse, dans l'ordre de la maquette ; puis, seulement en écart, les autres (listes de menaces, disque, canaux), dans
// l'ordre de /sante. Le nombre d'écarts est celui de /sante.
export const RESUME_SANTE = ['site', 'zitadel', 'bordure', 'chaine', 'roles', 'analyse'];
export function resumeSante({ db, engine, switches, now = Date.now, role }) {
  const t = now();
  const s = vueSante({ db, engine, switches, now: () => t, role });
  ecartsCache.set(db, { at: t, v: ecartsDe(s) });
  const rang = c => (RESUME_SANTE.includes(c.id) ? RESUME_SANTE.indexOf(c.id) : RESUME_SANTE.length);
  const lignes = s.cartes.filter(c => c.resume && (c.cls || RESUME_SANTE.includes(c.id))).sort((a, b) => rang(a) - rang(b))
    .map(c => ({ k: c.cls === 'panne' ? 'arret' : c.cls ? 'att-s' : c.etat.k === 'neutre' ? 'neutre' : 'ok', morceaux: c.resume }));
  return { lignes, ecarts: s.ecarts };
}

// ===================================================================================================================
// Routes
// ===================================================================================================================

// Ce que la personne peut faire sur la santé (phase D3c) : vérifier la chaîne et recopier la liste de la bordure (Analyste),
// accepter la référence du contrôle des rôles (Administrateur), chacun seulement si la Vigie sait le faire (pas de bouton mort).
export function peutSante(ctx, role) {
  const verif = Boolean(role) && can(role, 'verifications');
  return { verifier: verif && Boolean(ctx.verifyChain), bordure: verif && Boolean(ctx.edge), accepter: Boolean(role) && can(role, 'droits') && Boolean(ctx.siteBackupDir), verif };
}

// L'identité confirmée (en-tête) : « Identité confirmée à 14 h 17, valable jusqu’à 14 h 22 ».
function identite(authA, t) {
  if (!Number.isFinite(authA)) return null;
  return authA + FRESH > t ? { texte: `Identité confirmée à ${heure(authA)}, valable jusqu’à ${heure(authA + FRESH)}`, fraiche: true }
    : { texte: `Identité confirmée à ${heure(authA)}${FINE}; redemandée au prochain geste sensible`, fraiche: false };
}

export function register(app, ctx) {
  const { db, engine, switches, now, view, log } = ctx;

  app.get('/sante', async (req, reply) => {
    // Le message de l'action précédente, lu ici pour remettre un refus près de son bouton (et montré en tête par le layout).
    const message = ctx.isRefresh(req) ? null : ctx.sessions.takeMessage(req.moi.sid);
    const sante = vueSante({ db, engine, switches, now, role: req.moi.role, retentionDays: ctx.store?.retentionDays });
    const t = now();
    return view(reply, req, 'sante', { page: 'sante', titre: 'Santé et intégrité · Vigie', sante, message, peut: peutSante(ctx, req.moi.role),
      identite: identite(req.moi.authA, t), reauthFraiche: Number.isFinite(req.moi.authA) && req.moi.authA + FRESH > t });
  });

  // Paramètres : période (7j par défaut, 30j), alerte (un entier). Une valeur inconnue est ignorée et dite en tête de page,
  // sans jamais renvoyer la saisie (lexique § 3.18, point 8).
  app.get('/flux', async (req, reply) => {
    const qs = req.query || {};
    const erreurs = [];
    let periode = PERIODE_DEFAUT;
    if (qs.periode !== undefined) {
      if (typeof qs.periode === 'string' && Object.hasOwn(PERIODES, qs.periode)) periode = qs.periode;
      else erreurs.push('periode');
    }
    let alerte = null;
    if (qs.alerte !== undefined) {
      if (typeof qs.alerte === 'string' && /^[1-9]\d{0,9}$/.test(qs.alerte)) alerte = Number(qs.alerte);
      else erreurs.push('alerte');
    }
    const t0 = process.hrtime.bigint();
    const flux = vueFlux({ db, now, role: req.moi.role, periode, alerte, erreurs });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms > 1000) log.warn({ ms: Math.round(ms), periode }, 'Vigie : console : flux lents');
    return view(reply, req, 'flux', { page: 'flux', titre: 'Flux et provenance des alertes · Vigie', flux });
  });

}
