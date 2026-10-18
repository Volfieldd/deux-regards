// Vue d'ensemble de la console (MV-01, phase D3a) : ce que le gabarit vue-ensemble.eta affiche, lu dans la base de la Vigie
// en LECTURE SEULE (aucune écriture, aucun événement noté). Requêtes bornées et indexées : jamais un parcours de la table
// events (des millions de lignes) ; le battement du site se lit par l'index (type, recu_a), le retard d'analyse par la clé.
// Tout ce qui part vers le gabarit est déjà mis en forme (dates à l'heure de Paris, mots du lexique) et ne contient aucune
// donnée personnelle superflue : les adresses passent par adresseDetail (tronquées pour un Lecteur), ni agent utilisateur,
// ni détail d'événement.
import { alertOrder } from '../moteur.js';
import { responseOf } from '../notifications.js';
import { FINE, adresseDetail, reseauVue, dateHeure, gravite, guillemets, heure, ilYa, jusqua, nombre, quand, duree, jour, paris } from './format.js';
import { provenanceAlertes, ecartsSante } from './ecrans/sante-flux.js';
import { can } from './droits.js';

const LISTE_MAX = 50;                     // alertes affichées dans le tableau (le reste : « Toutes les alertes »)
const DECISIONS_MAX = 20;
const SITE_SILENCE = 3 * 60e3;            // comme le détecteur « silence » du moteur (DS24)
const ZITADEL_TROU = 20 * 3600e3;         // comme vigie/zitadel.js (GAP)
const CHAINE_RETARD = 48 * 3600e3;        // vérifiée chaque jour : au-delà de deux jours, la vérification ne tourne plus
const ANALYSE_RETARD = 1000;              // événements reçus et pas encore analysés
const RANG_SQL = "CASE gravite WHEN 'critique' THEN 4 WHEN 'haut' THEN 3 WHEN 'moyen' THEN 2 WHEN 'bas' THEN 1 ELSE 0 END";

const SOURCES = { site: 'site', zitadel: 'Zitadel', bordure: 'bordure Cloudflare', vigie: 'contrôles de la Vigie' };
const MODES = { arret: 'Arrêt', observer: 'Observer', alerter: 'Alerter', bloquer: 'Bloquer' };
const ENTITES = { ip: 'adresse', reseau: 'réseau', compte: 'compte', session: 'session', appareil: 'appareil', site: 'site', vigie: 'la Vigie' };
const DECISIONS = { bloquer: 'Bloquer une adresse', revoquer_session: 'Fermer une session', revoquer_compte: 'Fermer les sessions d’un compte', geler: 'Geler un compte', verrouiller: 'Verrouiller l’admin' };
const PORTEES = { tout: 'Tout le site', admin: 'L’admin et la connexion', auth: 'La connexion seulement' };
const CLASSEMENTS = { incident: 'Incident confirmé', faux_positif: 'Faux positif', test: 'Test' };
// Titres lisibles des détecteurs (lexique § 3.11, proposés) : le moteur écrit le nom brut (« premiere apparition »).
const DETECTEURS = {
  premiere_apparition: 'Connexion d’un compte depuis un pays ou un appareil jamais vus',
  heure_inhabituelle: 'Activité d’un compte à une heure jamais utilisée',
  vitesse: 'Lectures d’un compte bien au-delà de son habitude',
  voyage_impossible: 'Voyage impossible entre deux connexions d’un compte',
  pivot_identifiants: 'Connexion réussie après des échecs répétés',
  role_incoherent: 'Export réservé à l’administrateur fait par un autre compte',
  exploration_lente: 'Exploration lente depuis un réseau (pièges et erreurs sur 12 heures)',
  chaine_attaque: 'Chaîne d’attaque : repérage, tentative puis accès sur une même entité',
  silence: 'Site silencieux : aucun battement depuis 3 minutes',
  menaces: 'Adresse sur une liste de menaces (Spamhaus DROP, Feodo, Tor)',
};
// Les trois interrupteurs (MV-01, MV-06) : textes de la carte ; objet, la fin du nom lu au lecteur d'écran d'un bouton
// (« Arrêter… la détection ») ; effetArret, ce que fait l'arrêt, écrit sur la carte des réglages avant le bouton.
export const INTERRUPTEURS = {
  detection: { titre: 'Détection', court: 'Détection', marche: 'Les règles tournent.', arret: 'Les règles ne tournent pas.',
    fait: 'Détection arrêtée', effet: 'les règles ne tournent pas, les événements reçus ne seront pas analysés.', objet: 'la détection',
    effetArret: 'aucune règle ne tourne ; les événements reçus pendant l’arrêt ne seront jamais analysés.' },
  alertes: { titre: 'Alertes', court: 'Alertes', marche: 'Notifications Signal et e-mail.', arret: 'Aucune notification Signal ni e-mail.',
    fait: 'Alertes arrêtées', effet: 'aucune notification Signal ni e-mail.', objet: 'les alertes',
    effetArret: 'les alertes s’ouvrent dans la console, aucun message ne part.' },
  blocages: { titre: 'Blocages automatiques', court: 'Blocages', marche: 'Les règles en mode Bloquer agissent d’elles-mêmes.', arret: 'Aucune règle n’agit d’elle-même.',
    fait: 'Blocages automatiques arrêtés', effet: 'aucune règle ne bloque, ne ferme ni ne gèle d’elle-même.', objet: 'les blocages automatiques',
    effetArret: 'aucune règle n’agit d’elle-même ; les actions forcées restent possibles.' },
};
export const ORDRE_INTER = ['detection', 'alertes', 'blocages'];

// Apostrophe typographique et espace fine avant « : ; ! ? » dans un texte du code (titres des règles, en YAML).
const typo = s => String(s ?? '').replace(/'/g, '’').replace(/ ([:;!?])/g, `${FINE}$1`);
const pluriel = (n, un, plusieurs = `${un}s`) => (n > 1 ? plusieurs : un);
const virgule = x => nombre(Math.round(Number(x) * 10) / 10).replace('.', ',');
const lire = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

// Requêtes préparées une fois par base (lecture seule).
const cache = new WeakMap();
function requetes(db) {
  let q = cache.get(db);
  if (q) return q;
  q = {
    reglage: db.prepare('SELECT value FROM settings WHERE key = ?').pluck(),
    nbAlertes: db.prepare("SELECT COUNT(*) FROM alerts WHERE statut != 'close'").pluck(),
    critiques: db.prepare("SELECT id, regle, premiere FROM alerts WHERE statut = 'ouverte' AND gravite = 'critique' AND mode != 'observer' ORDER BY premiere DESC, id DESC LIMIT 4"),
    parGravite: db.prepare("SELECT gravite, statut, COUNT(*) n FROM alerts WHERE statut != 'close' GROUP BY gravite, statut"),
    alertes: db.prepare(`SELECT id, regle, cas, entite_kind, entite_key, gravite, mode, statut, premiere, derniere, compteur, score, sources, reponse, traite_par, traite_a
      FROM alerts WHERE statut != 'close' ORDER BY ${RANG_SQL} DESC, (statut = 'ouverte') DESC, derniere DESC LIMIT ${LISTE_MAX}`),
    ouverteDe: db.prepare("SELECT id FROM alerts WHERE regle = ? AND statut != 'close' ORDER BY id DESC LIMIT 1").pluck(),
    derniereClose: db.prepare("SELECT id, classement, note, traite_par, traite_a, derniere FROM alerts WHERE statut = 'close' ORDER BY derniere DESC LIMIT 1"),
    nbDecisions: db.prepare('SELECT COUNT(*) FROM decisions WHERE leve_a IS NULL AND fin > ?').pluck(),
    decisions: db.prepare(`SELECT id, kind, cible, portee, motif, par, cree_a, fin, auto FROM decisions WHERE leve_a IS NULL AND fin > ? ORDER BY id DESC LIMIT ${DECISIONS_MAX}`),
    battement: db.prepare("SELECT recu_a, detail FROM events WHERE type = 'sys_heartbeat' ORDER BY recu_a DESC LIMIT 1"),
    dernierSeq: db.prepare('SELECT MAX(seq) FROM events').pluck(),
    jours: db.prepare('SELECT type, SUM(n) n FROM daily WHERE day >= ? AND type IN (\'authn_login_success\', \'authz_blocked\', \'bordure_blocage\') GROUP BY type'),
    bloquees: db.prepare("SELECT COUNT(*) FROM decisions WHERE kind = 'bloquer' AND cree_a >= ?").pluck(),
  };
  // Réponses automatiques d'alertes (décisions « alerte #n »), pour un nombre d'alertes donné.
  const reponses = new Map();
  q.reponses = n => {
    if (!reponses.has(n)) reponses.set(n, db.prepare(`SELECT motif, kind, cree_a, fin FROM decisions WHERE auto = 1 AND motif IN (${Array(n).fill('?').join(', ')}) ORDER BY id LIMIT 500`));
    return reponses.get(n);
  };
  cache.set(db, q);
  return q;
}

const reglage = (q, cle, defaut = null) => { const v = lire(q.reglage.get(cle)); return v ?? defaut; };

// « à 14 h 05 » aujourd'hui ; « le ven. 16 oct., 18 h 25 » un autre jour.
const aQuand = (x, t) => { const s = quand(x, t); return s.includes(',') ? `le ${s}` : `à ${s}`; };

// Santé en une ligne par composant (MV-01) : { k: 'ok' | 'att-s' | 'arret' | 'neutre', morceaux }. Les lignes en écart
// (▲, ✕) font le compteur de la barre latérale.
function sante(q, t) {
  const lignes = [];
  const ligne = (k, ...morceaux) => lignes.push({ k, morceaux });
  const D = `${FINE}: `;                                    // « : » précédé d'une espace fine insécable
  // Site : dernier battement (index events_type), événements en attente sur le site.
  const b = q.battement.get();
  if (!b) ligne('att-s', { t: `Site${D}aucun battement reçu` });
  else {
    const attente = Number(lire(b.detail)?.attente);
    const suite = Number.isFinite(attente) ? `, ${nombre(attente)} en attente` : '';
    if (t - b.recu_a > SITE_SILENCE) ligne('att-s', { t: `Site${D}dernier battement ` }, { t: quand(b.recu_a, t), b: true }, { t: ` (${ilYa(b.recu_a, t)})` });
    else ligne('ok', { t: `Site${D}battement à ` }, { t: heure(b.recu_a), b: true }, { t: suite });
  }
  // Zitadel : dernière lecture réussie de son journal.
  const z = reglage(q, 'zitadel_derniere_lecture');
  if (!z) ligne('neutre', { t: `Zitadel${D}jamais lu (ou non configuré)` });
  else if (t - z > ZITADEL_TROU) ligne('att-s', { t: `Zitadel${D}dernière lecture ` }, { t: quand(z, t), b: true }, { t: ` (${ilYa(z, t)})` });
  else ligne('ok', { t: `Zitadel lu ${aQuand(z, t).replace(/ .*$/, '')} ` }, { t: quand(z, t), b: true });
  // Bordure Cloudflare (facultative) : battement du Worker, liste copiée.
  const bord = reglage(q, 'bordure_dernier_battement');
  const kv = reglage(q, 'bordure_kv');
  if (bord || kv) {
    const silence = reglage(q, 'bordure_silence_signale', false) === true;
    const m = [{ t: `Bordure${D}` }];
    if (bord?.at) m.push({ t: 'battement ' + aQuand(bord.at, t).replace(/ .*$/, '') + ' ' }, { t: quand(bord.at, t), b: true }); else m.push({ t: 'aucun battement' });
    if (kv?.at) m.push({ t: `, liste${kv.version != null ? ` ${kv.version}` : ''} copiée ${aQuand(kv.at, t)}` });
    if (silence) m.push({ t: D }, { t: 'silencieuse', b: true });
    ligne(silence ? 'att-s' : 'ok', ...m);
  }
  // Chaîne du journal : dernière vérification.
  const c = reglage(q, 'chaine_verifiee');
  if (!c?.at) ligne('att-s', { t: `Chaîne${D}jamais vérifiée` });
  else if (c.ok === false) {
    const r = c.rupture ? ` (ligne ${nombre(c.rupture.seq)}${D}${typo(c.rupture.raison)})` : '';
    ligne('arret', { t: 'Chaîne ' }, { t: 'rompue', b: true }, { t: `${r}, vérifiée ${aQuand(c.at, t)}` });
  } else if (t - c.at > CHAINE_RETARD) ligne('att-s', { t: 'Chaîne intacte, mais vérifiée ' }, { t: ilYa(c.at, t), b: true });
  else ligne('ok', { t: 'Chaîne ' }, { t: 'intacte', b: true }, { t: `, vérifiée ${aQuand(c.at, t)}` });
  // Contrôle des rôles (sauvegarde du site) : un écart ouvert est une alerte de la règle controle_roles.
  const ecart = q.ouverteDe.get('sigma.controle_roles') ?? q.ouverteDe.get('sigma.controle_roles_degrade');
  const vu = reglage(q, 'controle_roles_vu');
  const ok = reglage(q, 'controle_roles_admins');
  const controlee = vu?.at ? ` contrôlée ${aQuand(vu.at, t)}` : '';
  if (ecart) ligne('att-s', { t: `Contrôle des rôles${D}sauvegarde${controlee}${D}` }, { t: 'écart', b: true }, { t: ' (' }, { t: `#${ecart}`, href: `/alertes/${ecart}` }, { t: ')' });
  else if (!ok) ligne('att-s', { t: `Contrôle des rôles${D}aucun contrôle réussi` });
  else ligne('ok', { t: `Contrôle des rôles${D}sauvegarde${ok.instantane_a ? ` de ${quand(ok.instantane_a, t)}` : ''}${controlee}, ` }, { t: 'sans écart', b: true });
  // Analyse : événements reçus et pas encore analysés (curseur du moteur contre le dernier numéro).
  const curseur = Number(reglage(q, 'moteur_curseur', 0)) || 0;
  const retard = Math.max(0, (q.dernierSeq.get() ?? 0) - curseur);
  if (retard >= ANALYSE_RETARD) ligne('att-s', { t: `Analyse${D}` }, { t: `${nombre(retard)} événements en attente`, b: true });
  else ligne('ok', { t: retard ? `Analyse${D}${nombre(retard)} ${pluriel(retard, 'événement')} en attente` : `Analyse${D}aucun retard` });
  return { lignes, ecarts: lignes.filter(l => l.k === 'att-s' || l.k === 'arret').length };
}

// Compteurs de la barre latérale, sur chaque page en session : trois requêtes indexées et la santé (réglages, battement
// par l'index (type, recu_a), dernier numéro par la clé). La vue d'ensemble s'appuie sur la même fonction.
function compter(q, t) {
  const s = sante(q, t);
  return { alertes: q.nbAlertes.get(), sante: s.ecarts, decisions: q.nbDecisions.get(t), detailSante: s };
}
// Badge Santé : la règle de /sante (ecartsSante) quand le moteur est donné ; sinon celle, plus courte, de la carte de MV-01.
export function compteurs({ db, engine, switches, now = Date.now }) {
  const q = requetes(db);
  const { alertes, sante: ecarts, decisions } = compter(q, now());
  return { alertes, sante: engine ? Math.max(ecarts, ecartsSante({ db, engine, switches, now }).n) : ecarts, decisions, bandeau: bandeauDe(q, engine) };
}

// Bandeau des critiques (maquettes MV-02 à MV-11, en tête de chaque page en session sauf la vue d'ensemble, qui le dit
// dans sa phrase) : alertes critiques ouvertes et sans intervenant, la plus récente d'abord ; titre de la règle de la
// première (la console n'est vue que par ses comptes ; l'admin du site, elle, ne reçoit jamais de titre).
function bandeauDe(q, engine) {
  const rows = q.critiques.all();
  if (!rows.length) return null;
  const shown = rows.slice(0, 3);
  const titre = engine?.rules?.().find(r => r.id === rows[0].regle)?.titre || null;
  const n = rows.length > 3 ? 'Au moins 4' : String(rows.length);
  return {
    texte: `${n} ${rows.length > 1 ? 'alertes critiques' : 'alerte critique'} sans intervenant${FINE}: ${shown.map(r => `#${r.id} depuis ${heure(r.premiere)}`).join(', ')}.`,
    sec: titre ? typo(titre) : null,
    id: rows[0].id,
  };
}

function entiteVue(kind, key, role) {
  const k = ENTITES[kind] || kind;
  if (kind === 'ip') { const a = adresseDetail(key, role); return { k, texte: a.texte, mono: 'ip', v6: a.v6, tronquee: a.tronquee }; }
  if (kind === 'reseau') return { k, texte: reseauVue(key), mono: 'ip', v6: String(key).includes(':'), tronquee: false };
  if (kind === 'vigie') return { k, texte: typo(key), mono: null, tronquee: false };
  return { k, texte: String(key), mono: 'sub', tronquee: false };
}

function periode(a, b, t) {
  const pa = paris(a), pb = paris(b);
  const memeJour = pa && pb && pa.annee === pb.annee && pa.mois === pb.mois && pa.jour === pb.jour;
  if (memeJour) return quand(a, t).includes(',') ? `le ${jour(a)}, de ${heure(a)} à ${heure(b)}` : `de ${heure(a)} à ${heure(b)}`;
  return `du ${dateHeure(a)} au ${dateHeure(b)}`;
}

function titreDe(regle, titres) {
  const brut = titres.get(regle);
  const nom = regle.startsWith('detecteur.') ? regle.slice(10) : null;
  if (nom && (!brut || brut === nom.replaceAll('_', ' '))) return typo(DETECTEURS[nom] || nom.replaceAll('_', ' '));
  return typo(brut || regle);
}

// « réponse faite : compte gelé 24 h, sessions du compte fermées » (mots de vigie/notifications.js, responseOf).
const reponseFaite = decisions => responseOf(decisions).replace(/^Réponse : /, `réponse faite${FINE}: `).replace(/(\d) (h|j)\b/g, '$1\u00a0$2');

function ligneAlerte(a, { t, role, titres, reponses }) {
  const g = gravite(a.gravite);
  const sources = (lire(a.sources) || []).filter(s => Object.hasOwn(SOURCES, s)).map(s => ({ cle: s, mot: SOURCES[s] }));
  const eligible = ['haut', 'critique'].includes(a.gravite) || a.regle === 'sigma.surveillance_reduite';
  const modeSec = { observer: 'sans notification', alerter: eligible ? 'message à l’ouverture' : `sans message (${g.mot.toLowerCase()})`,
    bloquer: 'réponse automatique', arret: 'règle arrêtée' }[a.mode] || '';
  const decs = reponses.get(a.id) || [];
  const reponse = decs.length ? reponseFaite(decs) : a.mode === 'bloquer' ? (/interrupteur des blocages/.test(a.reponse || '') ? 'aucune réponse : blocages automatiques arrêtés' : 'aucune réponse automatique') : '';
  const score = a.regle === 'entite.score' && a.score != null ? `score ${virgule(a.score)}` : '';
  const sec = a.statut === 'en_cours'
    ? [a.traite_par ? `par ${a.traite_par}` : '', reponse].filter(Boolean).join(' · ')
    : [reponse, score].filter(Boolean).join(' · ');
  return {
    id: a.id,
    href: `/alertes/${a.id}`,
    titre: titreDe(a.regle, titres),
    cas: a.cas === 'quorum' ? 'score' : a.cas ? `cas ${a.cas}` : '',
    grav: { mot: g.mot, classe: g.classe },
    crit: a.gravite === 'critique',
    entite: entiteVue(a.entite_kind, a.entite_key, role),
    sources,
    occ: { n: nombre(a.compteur), sec: a.compteur > 1 ? periode(a.premiere, a.derniere, t) : aQuand(a.derniere, t) },
    mode: { mot: MODES[a.mode] || a.mode, sec: modeSec },
    statut: a.statut === 'en_cours' ? { k: 'encours', mot: 'Prise en charge', sec } : { k: 'afaire', mot: 'Ouverte', sec },
  };
}

function ligneDecision(d, t, role) {
  let cible = null;
  if (d.kind === 'bloquer') {
    const a = adresseDetail(String(d.cible).replace(/\/(32|128)$/, ''), role);
    cible = { texte: a.texte, mono: 'ip', v6: a.v6, tronquee: a.tronquee };
  } else if (d.kind !== 'verrouiller') cible = { texte: String(d.cible), mono: 'sub', tronquee: false };
  const auto = /^alerte #(\d+)$/.exec(d.motif || '');
  const par = d.auto && auto ? [{ t: 'par la Vigie, alerte ' }, { t: `#${auto[1]}`, href: `/alertes/${auto[1]}` }]
    : [{ t: `par ${d.auto ? 'la Vigie' : d.par}${d.motif ? `${FINE}: ${guillemets(d.motif)}` : ''}` }];
  return {
    id: d.id,
    type: DECISIONS[d.kind] || d.kind,
    cible,
    sec: [{ t: `${d.portee ? `${PORTEES[d.portee] || d.portee} · ` : ''}${jusqua(d.fin, t)} · ` }, ...par],
  };
}

// Ce que commande l'action, en une phrase puis au plus trois faits (MV-01, lexique § 3.14).
function phraseDe(compte) {
  const ordre = ['critique', 'haut', 'moyen', 'bas'].filter(g => compte[g] > 0);
  const total = ordre.reduce((n, g) => n + compte[g], 0);
  if (!total) return `Rien à traiter${FINE}: aucune alerte ouverte.`;
  const graves = ordre.filter(g => g === 'critique' || g === 'haut');
  const dites = graves.length ? graves : ordre.slice(0, 2);
  const parts = dites.map((g, i) => {
    const n = compte[g], p = gravite(g).pluriel, s = n > 1 ? p : p.replace(/s$/, '');
    return i === 0 ? `${n} ${pluriel(n, 'alerte')} ${s}` : `${n} ${s}`;
  });
  return `${parts.join(' et ')} à traiter.`;
}

const liste = ids => ids.flatMap((id, i) => [...(i ? [{ t: i === ids.length - 1 ? ' et ' : ', ' }] : []), { t: `#${id}`, href: `/alertes/${id}` }]);

// Cartes des interrupteurs (vue d'ensemble, réglages) : l'état et, à l'arrêt, qui, quand, pour combien de temps, pourquoi,
// et l'alerte « Surveillance réduite » ouverte (reduite : son numéro, ou null).
export function cartesInterrupteurs({ etat = {}, reduite = null, t = Date.now() }) {
  return ORDRE_INTER.map(n => {
    const x = INTERRUPTEURS[n], e = etat[n] || { marche: true };
    const base = { nom: n, titre: x.titre, objet: x.objet, effetMarche: x.marche, effetArret: x.effetArret };
    if (e.marche) return { ...base, marche: true, etat: { k: 'abouti', mot: 'Marche' }, morceaux: [{ t: x.marche }] };
    const morceaux = [{ t: `${x.arret} ` }];
    const qui = e.par ? `Arrêté par ${String(e.par).replace(/^console · /, '')}` : 'Arrêté';   // « console · Julien » : Julien
    morceaux.push({ t: `${qui}${e.a ? ` ${aQuand(e.a, t)}` : ''}${e.a && e.jusqua ? ` pour ${duree(e.jusqua - e.a)}` : ''}${e.motif ? `${FINE}: ${guillemets(e.motif)}` : ''}` });
    if (reduite) morceaux.push({ t: `${FINE}; alerte ` }, { t: `#${reduite}`, href: `/alertes/${reduite}` }, { t: ' envoyée.' });
    else morceaux.push({ t: '.' });
    const jusqu = e.jusqua ? `Arrêt ${jusqua(e.jusqua, t)}` : 'Arrêt';
    // « Il se rallume seul à 15 h 10. » (réglages, MV-06).
    const rallume = e.jusqua ? `Il se rallume seul ${jusqua(e.jusqua, t).replace(/^jusqu’/, '')}.` : null;
    return { ...base, marche: false, etat: { k: 'attention', mot: jusqu }, morceaux, rallume };
  });
}

// Alerte « Surveillance réduite » ouverte (son numéro), pour les cartes des interrupteurs.
export const surveillanceReduite = db => requetes(db).ouverteDe.get('sigma.surveillance_reduite') || null;

export function overview({ db, engine, switches, now = Date.now, role }) {
  const q = requetes(db);
  const t = now();
  const lecteur = role === 'viewer' || !role;
  const roleVu = lecteur ? 'viewer' : role;
  const titres = new Map((engine?.rules?.() || []).map(r => [r.id, r.titre]));

  // Alertes (non closes, observation comprise, comme la maquette) : la liste bornée, triée en SQL puis par alertOrder.
  const lignes = q.alertes.all().sort(alertOrder);
  const compte = { critique: 0, haut: 0, moyen: 0, bas: 0, info: 0 };
  const ouvertes = { critique: [], haut: [] };
  let total = 0;
  for (const r of q.parGravite.all()) { compte[r.gravite] = (compte[r.gravite] || 0) + r.n; total += r.n; }
  const ids = lignes.map(a => a.id);
  const reponses = new Map();
  if (ids.length) for (const d of q.reponses(ids.length).all(ids.map(id => `alerte #${id}`))) {
    const id = Number(d.motif.slice(8));
    if (!reponses.has(id)) reponses.set(id, []);
    reponses.get(id).push(d);
  }
  const alertes = lignes.map(a => ligneAlerte(a, { t, role: roleVu, titres, reponses }));
  for (const a of lignes) if (a.statut === 'ouverte' && ouvertes[a.gravite]) ouvertes[a.gravite].push(a);

  const nb = compter(q, t);
  const s = nb.detailSante;
  // Écarts comptés comme /sante (menaces, disque, canaux… que la carte ne détaille pas) : une ligne y renvoie.
  if (engine) {
    const e = ecartsSante({ db, engine, switches, now: () => t });
    if (e.n > s.ecarts) {
      s.lignes.push({ k: 'att-s', morceaux: [{ t: `${e.n - s.ecarts} autre${e.n - s.ecarts > 1 ? 's' : ''} écart${e.n - s.ecarts > 1 ? 's' : ''}${FINE}: ` }, { t: 'voir la santé', href: '/sante' }] });
      s.ecarts = e.n;
    }
    nb.sante = s.ecarts;
  }
  const nbDecisions = nb.decisions;
  const etat = switches?.state?.() || {};
  const reduite = q.ouverteDe.get('sigma.surveillance_reduite');

  // Faits : la chaîne rompue d'abord, puis les alertes graves sans intervenant, puis les interrupteurs arrêtés.
  const faits = [];
  const chaine = reglage(q, 'chaine_verifiee');
  if (chaine?.at && chaine.ok === false) {
    faits.push({ etat: { k: 'arret', mot: 'Chaîne' }, morceaux: [{ t: 'Chaîne du journal de la Vigie rompue' + (chaine.rupture ? ` à la ligne ${nombre(chaine.rupture.seq)}` : '') + `${FINE}: ` },
      { t: 'voir la santé', href: '/sante' }, { t: '.' }] });
  }
  const graves = ouvertes.critique.length ? ouvertes.critique : ouvertes.haut;
  if (graves.length) {
    const g = gravite(graves[0].gravite);
    const vus = graves.slice(0, 4);
    const reste = graves.length - vus.length;
    const morceaux = reste > 0 ? [...liste(vus.map(a => a.id)).map(m => (m.t === ' et ' ? { t: ', ' } : m)), { t: ` et ${reste} ${pluriel(reste, 'autre')}` }]
      : liste(vus.map(a => a.id));
    // Heures d'ouverture quand elles sont toutes d'aujourd'hui (sinon la liste les donne).
    const heures = vus.map(a => quand(a.premiere, t));
    if (vus.length === 1) morceaux.push({ t: `, ouverte ${aQuand(vus[0].premiere, t)}, sans intervenant${FINE}: ${titreDe(vus[0].regle, titres)}.` });
    else if (!reste && !heures.some(h => h.includes(','))) morceaux.push({ t: `, ouvertes à ${heures.slice(0, -1).join(', ')} et ${heures.at(-1)}, sans intervenant.` });
    else morceaux.push({ t: ', sans intervenant.' });
    faits.push({ grav: { mot: g.mot, classe: g.classe }, morceaux });
  }
  const arretes = ORDRE_INTER.filter(n => etat[n] && !etat[n].marche);
  if (arretes.length) {
    const morceaux = [];
    arretes.forEach((n, i) => {
      const x = INTERRUPTEURS[n], e = etat[n];
      morceaux.push({ t: `${i ? ' ' : ''}${x.fait}${e.jusqua ? ` ${jusqua(e.jusqua, t)}` : ''}` });
      if (reduite) morceaux.push({ t: ' (' }, { t: `#${reduite}`, href: `/alertes/${reduite}` }, { t: ')' });
      morceaux.push({ t: `${FINE}: ${x.effet}` });
    });
    faits.push({ etat: { k: 'attention', mot: arretes.length === 1 ? INTERRUPTEURS[arretes[0]].court : 'Arrêts' }, morceaux });
  }
  if (!total) {
    if (!arretes.length) faits.push({ etat: { k: 'abouti', mot: 'Marche' }, morceaux: [{ t: 'Détection, alertes et blocages automatiques en marche.' }] });
    const c = q.derniereClose.get();
    if (c) {
      const qui = c.traite_par ? ` par ${c.traite_par}` : '';
      const quandC = c.traite_a ? ` ${aQuand(c.traite_a, t)}` : '';
      const texte = c.classement ? `, classée ${CLASSEMENTS[c.classement] || c.classement}${qui}${quandC}` : `, close${/^sans suite/.test(c.note || '') ? ' sans suite' : ''}${quandC}`;
      const note = c.classement && c.note ? ` (${guillemets(c.note.slice(0, 120))})` : '';
      faits.push({ etat: { k: 'abouti', mot: 'Close' }, morceaux: [{ t: `Dernière alerte${FINE}: ` }, { t: `#${c.id}`, href: `/alertes/${c.id}` }, { t: `${texte}${note}.` }] });
    }
  }

  // « Aussi » : le reste, sur une ligne.
  const aussi = [];
  const enCours = lignes.filter(a => a.statut === 'en_cours' && (a.gravite === 'critique' || a.gravite === 'haut'));
  for (const a of enCours.slice(0, 3)) aussi.push([{ t: `#${a.id}, ${gravite(a.gravite).mot.toLowerCase()}, prise en charge` }]);
  if (enCours.length > 3) aussi.push([{ t: `${enCours.length - 3} autres prises en charge` }]);
  // Les moyennes et les basses (la phrase dit les critiques et les hautes).
  for (const g of ['moyen', 'bas']) {
    const de = lignes.filter(a => a.gravite === g);
    const n = compte[g] || 0;
    if (!n) continue;
    const nomme = de.slice(0, 3).map(a => `#${a.id}`).join(', ');
    aussi.push([{ t: `${n} ${n > 1 ? gravite(g).pluriel : gravite(g).pluriel.replace(/s$/, '')}${nomme ? ` (${nomme}${n > 3 ? ', …' : ''})` : ''}` }]);
  }
  aussi.push(nbDecisions ? [{ t: `${nombre(nbDecisions)} ${pluriel(nbDecisions, 'décision')} en cours`, href: '/decisions' }] : [{ t: 'aucune décision en cours' }]);
  aussi.push(s.ecarts ? [{ t: `santé${FINE}: ${s.ecarts} ${pluriel(s.ecarts, 'écart')}`, href: '/sante' }] : [{ t: `santé${FINE}: tout répond` }]);

  // Le bouton plein : ouvrir l'alerte la plus grave que personne n'a prise en charge.
  const premiere = graves[0];
  const principale = premiere ? { href: `/alertes/${premiere.id}`, texte: `Ouvrir l’alerte ${gravite(premiere.gravite).mot.toLowerCase()} #${premiere.id}` } : null;

  // Interrupteurs : l'état et, à l'arrêt, qui, quand, pour combien de temps, pourquoi.
  const interrupteurs = cartesInterrupteurs({ etat, reduite, t });

  // Décisions en cours (les plus récentes d'abord).
  const decisions = { total: nbDecisions, lignes: q.decisions.all(t).map(d => ligneDecision(d, t, roleVu)) };

  // Sept jours (aujourd'hui compris) : les compteurs par jour (table daily, jour UTC) et les blocages décidés.
  const depuis = new Date(t - 6 * 864e5).toISOString().slice(0, 10);
  const parType = Object.fromEntries(q.jours.all(depuis).map(r => [r.type, r.n]));
  const septJours = [
    { libelle: 'Connexions à l’admin', valeur: nombre(parType.authn_login_success || 0) },
    { libelle: 'Adresses bloquées', valeur: nombre(q.bloquees.get(Date.parse(`${depuis}T00:00:00Z`))) },
    { libelle: 'Tentatives repoussées', valeur: nombre((parType.authz_blocked || 0) + (parType.bordure_blocage || 0)) },
  ];

  // Barre de provenance des alertes (MV-01, lexique § 3.19, point 2) : celle de /flux, même période (7 jours), mêmes nombres.
  const provenance = provenanceAlertes({ db, now: () => t });

  return {
    maintenant: { texte: dateHeure(t), iso: new Date(t).toISOString() },
    lecteur,
    // Interrupteurs : « Arrêter… » (vers les réglages) et « Remettre en marche maintenant » pour qui a le droit des réglages.
    peutRegler: Boolean(role) && can(role, 'reglages'),
    compteurs: { alertes: nb.alertes, sante: nb.sante, decisions: nb.decisions },
    phrase: phraseDe(compte),
    faits: faits.slice(0, 3),
    aussi: { prefixe: total > 0, items: aussi },
    principale,
    interrupteurs,
    alertes: { total, lignes: alertes, plus: Math.max(0, total - alertes.length) },
    decisions,
    sante: s,
    septJours,
    provenance,
  };
}
