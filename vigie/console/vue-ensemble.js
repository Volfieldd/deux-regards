// Vue d'ensemble de la console (MV-01, phase D3a) : ce que le gabarit vue-ensemble.eta affiche, lu dans la base de la Vigie
// en LECTURE SEULE (aucune écriture, aucun événement noté). Requêtes bornées et indexées : jamais un parcours de la table
// events (des millions de lignes) ; le battement du site se lit par l'index (type, recu_a), le retard d'analyse par la clé.
// Tout ce qui part vers le gabarit est déjà mis en forme (dates à l'heure de Paris, mots du lexique) et ne contient aucune
// donnée personnelle superflue : les adresses passent par adresseDetail (tronquées pour un Lecteur), ni agent utilisateur,
// ni détail d'événement.
import { alertOrder } from '../moteur.js';
import { FINE, adresseDetail, cibleBlocage, masquer, reseauVue, dateHeure, gravite, guillemets, heure, jusqua, nombre, quand, duree } from './format.js';
import { CLASSEMENTS, DECISIONS, ENTITES, MODES, PORTEES, RANG_SQL, SOURCES, aQuand, closeSansSuite, lire, periode, pluriel, reponseFaite, titreDe, typo, virgule } from './lexique.js';
import { provenanceAlertes, ecartsSante, resumeSante } from './ecrans/sante-flux.js';
import { can } from './droits.js';

const LISTE_MAX = 50;                     // alertes affichées dans le tableau (le reste : « Toutes les alertes »)
const DECISIONS_MAX = 20;
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

// Requêtes préparées une fois par base (lecture seule).
const cache = new WeakMap();
function requetes(db) {
  let q = cache.get(db);
  if (q) return q;
  q = {
    reglage: db.prepare('SELECT value FROM settings WHERE key = ?').pluck(),
    nbAlertes: db.prepare("SELECT COUNT(*) FROM alerts WHERE statut != 'close'").pluck(),
    nbDossiers: db.prepare("SELECT COUNT(*) FROM dossiers WHERE fusionne_dans IS NULL AND statut != 'clos'").pluck(),
    dossiersGravite: db.prepare("SELECT gravite, COUNT(*) n FROM dossiers WHERE fusionne_dans IS NULL AND statut != 'clos' GROUP BY gravite"),
    critiques: db.prepare("SELECT id, regle, premiere FROM alerts WHERE statut = 'ouverte' AND gravite = 'critique' AND mode != 'observer' ORDER BY premiere DESC, id DESC LIMIT 4"),
    parGravite: db.prepare("SELECT gravite, statut, COUNT(*) n FROM alerts WHERE statut != 'close' GROUP BY gravite, statut"),
    alertes: db.prepare(`SELECT id, regle, cas, entite_kind, entite_key, gravite, mode, statut, premiere, derniere, compteur, score, sources, reponse, traite_par, traite_a
      FROM alerts WHERE statut != 'close' ORDER BY ${RANG_SQL} DESC, (statut = 'ouverte') DESC, derniere DESC LIMIT ${LISTE_MAX}`),
    ouverteDe: db.prepare("SELECT id FROM alerts WHERE regle = ? AND statut != 'close' ORDER BY id DESC LIMIT 1").pluck(),
    derniereClose: db.prepare("SELECT id, classement, note, traite_par, traite_a, derniere FROM alerts WHERE statut = 'close' ORDER BY derniere DESC LIMIT 1"),
    nbDecisions: db.prepare('SELECT COUNT(*) FROM decisions WHERE leve_a IS NULL AND fin > ?').pluck(),
    decisions: db.prepare(`SELECT id, kind, cible, portee, motif, par, cree_a, fin, auto FROM decisions WHERE leve_a IS NULL AND fin > ? ORDER BY id DESC LIMIT ${DECISIONS_MAX}`),
    jours: db.prepare('SELECT type, SUM(n) n FROM daily WHERE day >= ? AND type IN (\'authn_login_success\', \'authz_blocked\', \'bordure_blocage\') GROUP BY type'),
    bloquees: db.prepare("SELECT COUNT(*) FROM decisions WHERE kind = 'bloquer' AND cree_a >= ?").pluck(),
  };
  // Réponses automatiques d'alertes : décisions rattachées à ces alertes (colonne indexée alerte_id, migration 012 ; audit
  // D3-D3), numéros en JSON.
  q.reponses = db.prepare('SELECT alerte_id, motif, kind, cree_a, fin FROM decisions WHERE alerte_id IN (SELECT value FROM json_each(?)) AND auto = 1 ORDER BY id LIMIT 500');
  cache.set(db, q);
  return q;
}

const reglage = (q, cle, defaut = null) => { const v = lire(q.reglage.get(cle)); return v ?? defaut; };

// Compteurs de la barre latérale, sur chaque page en session : deux requêtes indexées et les écarts de santé, comptés
// par la règle de /sante (ecartsSante : la même fonction, gardée une minute pour le badge).
export function compteurs({ db, engine, switches, now = Date.now }) {
  const q = requetes(db);
  const t = now();
  return { alertes: q.nbAlertes.get(), dossiers: q.nbDossiers.get(), sante: ecartsSante({ db, engine, switches, now }).n, decisions: q.nbDecisions.get(t), bandeau: bandeauDe(q, engine) };
}

// Bandeau des critiques (maquettes MV-02 à MV-11, en tête de chaque page en session sauf la vue d'ensemble, qui le dit
// dans sa phrase) : alertes critiques ouvertes et sans intervenant, la plus récente d'abord ; titre de la règle de la
// première (la console n'est vue que par ses comptes ; l'admin du site, elle, ne reçoit jamais de titre).
function bandeauDe(q, engine) {
  const rows = q.critiques.all();
  if (!rows.length) return null;
  const shown = rows.slice(0, 3);
  const n = rows.length > 3 ? 'Au moins 4' : String(rows.length);
  return {
    texte: `${n} ${rows.length > 1 ? 'alertes critiques' : 'alerte critique'} sans intervenant${FINE}: ${shown.map(r => `#${r.id} depuis ${heure(r.premiere)}`).join(', ')}.`,
    sec: engine?.rules ? titreDe(rows[0].regle, new Map(engine.rules().map(r => [r.id, r.titre]))) : null,
    id: rows[0].id,
  };
}

function entiteVue(kind, key, role) {
  const k = ENTITES[kind] || kind;
  if (kind === 'ip') { const a = adresseDetail(key, role); return { k, texte: a.texte, mono: 'ip', v6: a.v6, tronquee: a.tronquee }; }
  if (kind === 'reseau') return { k, texte: reseauVue(key), mono: 'ip', v6: String(key).includes(':'), tronquee: false };
  // Clé d'une entité « vigie » ou « site » : elle peut porter une adresse (« confiance:198.51.100.44 », audit D3-C3).
  if (kind === 'vigie') return { k, texte: typo(masquer(key, role)), mono: null, tronquee: false };
  if (kind === 'site') return { k, texte: masquer(key, role), mono: 'sub', tronquee: false };
  return { k, texte: String(key), mono: 'sub', tronquee: false };
}

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
    ? [a.traite_par ? `par ${masquer(a.traite_par, role)}` : '', reponse].filter(Boolean).join(' · ')
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
    const a = adresseDetail(cibleBlocage(d.cible), role);
    cible = { texte: a.texte, mono: 'ip', v6: a.v6, tronquee: a.tronquee };
  } else if (d.kind !== 'verrouiller') cible = { texte: String(d.cible), mono: 'sub', tronquee: false };
  const auto = /^alerte #(\d+)$/.exec(d.motif || '');
  const par = d.auto && auto ? [{ t: 'par la Vigie, alerte ' }, { t: `#${auto[1]}`, href: `/alertes/${auto[1]}` }]
    : [{ t: `par ${d.auto ? 'la Vigie' : masquer(d.par, role)}${d.motif ? `${FINE}: ${guillemets(masquer(d.motif, role))}` : ''}` }];
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
// Le motif et l'auteur passent par masquer (un Lecteur n'y lit jamais une adresse complète) ; rôle absent : Lecteur.
export function cartesInterrupteurs({ etat = {}, reduite = null, t = Date.now(), role = 'viewer' }) {
  return ORDRE_INTER.map(n => {
    const x = INTERRUPTEURS[n], e = etat[n] || { marche: true };
    const base = { nom: n, titre: x.titre, objet: x.objet, effetMarche: x.marche, effetArret: x.effetArret };
    if (e.marche) return { ...base, marche: true, etat: { k: 'abouti', mot: 'Marche' }, morceaux: [{ t: x.marche }] };
    const morceaux = [{ t: `${x.arret} ` }];
    const qui = e.par ? `Arrêté par ${masquer(String(e.par).replace(/^console · /, ''), role)}` : 'Arrêté';   // « console · Julien » : Julien
    morceaux.push({ t: `${qui}${e.a ? ` ${aQuand(e.a, t)}` : ''}${e.a && e.jusqua ? ` pour ${duree(e.jusqua - e.a)}` : ''}${e.motif ? `${FINE}: ${guillemets(masquer(e.motif, role))}` : ''}` });
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
  if (ids.length) for (const d of q.reponses.all(JSON.stringify(ids))) {
    const id = d.alerte_id;
    if (!reponses.has(id)) reponses.set(id, []);
    reponses.get(id).push(d);
  }
  const alertes = lignes.map(a => ligneAlerte(a, { t, role: roleVu, titres, reponses }));
  for (const a of lignes) if (a.statut === 'ouverte' && ouvertes[a.gravite]) ouvertes[a.gravite].push(a);

  // Santé : le résumé de /sante (mêmes seuils, mêmes écarts), qui remet aussi à jour le compte du badge.
  const s = resumeSante({ db, engine, switches, now: () => t, role: roleVu });
  const nbDecisions = q.nbDecisions.get(t);
  const nb = { alertes: q.nbAlertes.get(), sante: s.ecarts, decisions: nbDecisions };
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
      const qui = c.traite_par ? ` par ${masquer(c.traite_par, roleVu)}` : '';
      const quandC = c.traite_a ? ` ${aQuand(c.traite_a, t)}` : '';
      const texte = c.classement ? `, classée ${CLASSEMENTS[c.classement] || c.classement}${qui}${quandC}` : `, close${closeSansSuite(c) ? ' sans suite' : ''}${quandC}`;
      const note = c.classement && c.note ? ` (${guillemets(masquer(c.note.slice(0, 120), roleVu))})` : '';
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
  const interrupteurs = cartesInterrupteurs({ etat, reduite, t, role: roleVu });

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
    compteurs: { alertes: nb.alertes, dossiers: q.nbDossiers.get(), sante: nb.sante, decisions: nb.decisions },
    dossiers: { total: q.nbDossiers.get(), gravites: q.dossiersGravite.all().map(d => ({ n: d.n, mot: gravite(d.gravite).mot })) },
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
