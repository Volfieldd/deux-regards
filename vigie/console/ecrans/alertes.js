// Alertes de la console (phase D3b) : la liste (/alertes) et la fiche d'une alerte (/alertes/<n°>, MV-02). LECTURE SEULE :
// aucune écriture, aucun événement noté ; les gestes (prendre en charge, classer, actions forcées, lever) viennent en D3c.
// Requêtes bornées (LIMIT) et indexées : la table des alertes par ses index (alerts_ouvertes, alerts_derniere) ; les
// événements d'une alerte par alert_events (clé alert_id, seq) puis la clé des événements, par pages de 20 à jeu de clés
// (seq), jamais OFFSET sur events ; l'historique par l'index partiel events_alerte (migration 007). Tout ce qui part vers
// les gabarits est déjà mis en forme (dates à l'heure de Paris, mots du lexique) ; un Lecteur ne voit que des adresses
// tronquées (adresseDetail), ni le texte brut de la réponse automatique (qui peut citer une adresse).
import { alertOrder } from '../../moteur.js';
import { responseOf } from '../../notifications.js';
import { SOURCE_MIN, QUORUM, sourceOf } from '../../poids.js';
import { FINE, adresseDetail, reseauVue, dateHeure, gravite, guillemets, heure, jour, nombre, quand, jusqua, paris } from '../format.js';

const NBSP = '\u00a0';
const PAGE = 50;                          // alertes par page
const PAGE_MAX = 200;                     // pages numérotées (alertes non closes) : au-delà, la liste se filtre
const COMPTE_MAX = 10_000;                // comptes bornés : « plus de 10 000 »
const EVENEMENTS = 20;                    // événements d'une alerte par page
const HISTOIRE = 50;                      // lignes d'historique montrées
const AUTRES = 5;                         // autres alertes de la même entité
const DECISIONS_MAX = 50;
const RANG_SQL = "CASE gravite WHEN 'critique' THEN 4 WHEN 'haut' THEN 3 WHEN 'moyen' THEN 2 WHEN 'bas' THEN 1 ELSE 0 END";
// Même expression et même condition que l'index events_alerte (vigie/migrations/007_index_historique_alertes.sql).
const HISTORIQUE = `SELECT seq, recu_a, emetteur, detail FROM events
  WHERE type = 'vigie_alerte' AND (CASE WHEN json_valid(detail) THEN json_extract(detail, '$.id') END) = ? ORDER BY seq DESC LIMIT ${HISTOIRE + 1}`;

// Mots du lexique (repris de vue-ensemble.js, qui ne les exporte pas).
const SOURCES = { site: 'site', zitadel: 'Zitadel', bordure: 'bordure Cloudflare', vigie: 'contrôles de la Vigie' };
const MODES = { arret: 'Arrêt', observer: 'Observer', alerter: 'Alerter', bloquer: 'Bloquer' };
const ENTITES = { ip: 'adresse', reseau: 'réseau', compte: 'compte', session: 'session', appareil: 'appareil', site: 'site', vigie: 'la Vigie' };
const ENTITE_TITRE = { ip: 'L’adresse', reseau: 'Le réseau', compte: 'Le compte', session: 'La session', appareil: 'L’appareil', site: 'Le site', vigie: 'La Vigie' };
const FICHE_DE = { ip: 'Fiche de l’adresse', reseau: 'Fiche du réseau', compte: 'Fiche du compte', session: 'Fiche de la session', appareil: 'Fiche de l’appareil' };
const SEUIL_DE = { ip: 'd’une adresse', reseau: 'd’un réseau', compte: 'd’un compte', session: 'd’une session', appareil: 'd’un appareil' };
const CLASSEMENTS = { incident: 'Incident confirmé', faux_positif: 'Faux positif', test: 'Test', sans_suite: 'Sans suite' };
const DECISION_FAITE = { geler: 'Compte gelé', revoquer_compte: 'Sessions du compte fermées', revoquer_session: 'Session fermée', bloquer: 'Adresse bloquée', verrouiller: 'Admin verrouillée' };
const PORTEES = { tout: 'Tout le site', admin: 'L’admin et la connexion', auth: 'La connexion seulement' };
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
// Tactiques MITRE ATT&CK (étiquettes « attack.<tactique> » des règles Sigma), en français.
const TACTIQUES = {
  reconnaissance: 'Reconnaissance', resource_development: 'Développement de ressources', initial_access: 'Accès initial', execution: 'Exécution',
  persistence: 'Persistance', privilege_escalation: 'Élévation de privilèges', defense_evasion: 'Contournement des défenses',
  credential_access: 'Accès aux identifiants', discovery: 'Découverte', lateral_movement: 'Mouvement latéral', collection: 'Collecte',
  command_and_control: 'Commande et contrôle', exfiltration: 'Exfiltration', impact: 'Impact',
};
// Types d'événements les plus vus sur une fiche (mots de MV-03) ; les autres : le nom du code seul.
const TYPES = {
  authn_login_success: 'Connexion réussie', authn_login_fail: 'Échec de connexion', session_created: 'Session ouverte', session_destroyed: 'Session fermée',
  session_use_after_expire: 'Cookie d’une session fermée réutilisé', malicious_input: 'Saisie malveillante', malicious_honeypot: 'Piège déclenché',
  malicious_excess_404: 'Pages introuvables en rafale', token_guess: 'Jeton ou code faux', privilege_permissions_changed: 'Droits d’un compte changés',
  authz_fail: 'Droit refusé', zitadel_connexion: 'Connexion chez Zitadel', zitadel_echec: 'Échec d’authentification chez Zitadel',
  bordure_rafale: 'Rafale de pages vue en bordure', bordure_blocage: 'Requêtes bloquées en bordure', bordure_nouvel_operateur: 'Opérateur jamais vu',
  vigie_alerte: 'Alerte ouverte ou changée', vigie_decision: 'Décision prise', vigie_interrupteur: 'Interrupteur changé', vigie_controle_roles: 'Contrôle des rôles',
};
// Filtres de la liste.
export const STATUTS = { ouvertes: 'Non closes', ouverte: 'Ouvertes, sans intervenant', en_cours: 'Prises en charge', close: 'Closes', toutes: 'Toutes' };
const GRAVITES_F = { critique: ['critique'], haute: ['critique', 'haut'], moyenne: ['critique', 'haut', 'moyen'], basse: ['critique', 'haut', 'moyen', 'bas'] };
const GRAVITES_MOT = { critique: 'Critique', haute: 'Haute et plus', moyenne: 'Moyenne et plus', basse: 'Basse et plus' };
// Raisons d'une absence de réponse automatique (textes de vigie/moteur.js, respond) : les seules montrées à un Lecteur.
const RAISONS = [/^adresse privée : aucun blocage automatique$/, /^aucun contrôle des rôles réussi : aucun blocage automatique d’adresse$/,
  /^adresse de confiance : aucune réponse$/, /^adresse d’une connexion d’administrateur : aucun blocage automatique$/,
  /^interrupteur des blocages arrêté : aucune réponse$/, /^aucune réponse prévue pour cette règle$/];
const NOMBRES = ['aucune', 'une', 'deux', 'trois', 'quatre'];

// Apostrophe typographique et espace fine avant « : ; ! ? » dans un texte du code (titres des règles, en YAML).
const typo = s => String(s ?? '').replace(/'/g, '’').replace(/ ([:;!?])/g, `${FINE}$1`);
const virgule = x => nombre(Math.round(Number(x) * 10) / 10).replace('.', ',');
const lire = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const deux = n => String(n).padStart(2, '0');
const capitale = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const enLettres = n => NOMBRES[n] || nombre(n);
const aQuand = (x, t) => { const s = quand(x, t); return s.includes(',') ? `le ${s}` : `à ${s}`; };
const memeJour = (a, b) => { const pa = paris(a), pb = paris(b); return Boolean(pa && pb && pa.annee === pb.annee && pa.mois === pb.mois && pa.jour === pb.jour); };
// Qui a traité : « console · Julien » (vigie/moteur.js, classify) s'écrit « Julien ».
const nomDe = par => String(par || '').replace(/^console · /, '');
const compte = n => (n > COMPTE_MAX ? `plus de ${nombre(COMPTE_MAX)}` : nombre(n));

// « 14 h 02 min 11 » (MV-02 : à la seconde) ; la date devant si ce n'est pas aujourd'hui.
function heureSec(t, maintenant) {
  const s = new Date(Number(t)).getUTCSeconds();
  const h = `${heure(t)}${NBSP}min${NBSP}${deux(s)}`;
  return memeJour(t, maintenant) ? h : `${jour(t)}, ${h}`;
}
// Écart entre l'heure à la source et la réception : « reçu + 1 s », « reçu + 2 min 40 », « reçu + 3 h 05 ».
function ecart(ms) {
  const a = Math.round(Math.abs(ms) / 1000);
  let txt;
  if (a < 60) txt = `${a}${NBSP}s`;
  else if (a < 3600) txt = `${Math.floor(a / 60)}${NBSP}min${NBSP}${deux(a % 60)}`;
  else if (a < 172800) txt = `${Math.floor(a / 3600)}${NBSP}h${NBSP}${deux(Math.floor((a % 3600) / 60))}`;
  else txt = `${Math.round(a / 86400)}${NBSP}jours`;
  return `reçu ${ms < 0 ? '−' : '+'} ${txt}`;
}
function periode(a, b, t) {
  if (memeJour(a, b)) return quand(a, t).includes(',') ? `le ${jour(a)}, de ${heure(a)} à ${heure(b)}` : `de ${heure(a)} à ${heure(b)}`;
  return `du ${dateHeure(a)} au ${dateHeure(b)}`;
}

// « attack.persistence », « attack.t1098 » → { tactiques: ['Persistance'], techniques: ['T1098'] }.
export function mitre(tags) {
  const tactiques = [], techniques = [];
  for (const tag of tags || []) {
    const m = /^attack\.(.+)$/i.exec(String(tag));
    if (!m) continue;
    const v = m[1].toLowerCase();
    if (/^t\d{4}(\.\d{3})?$/.test(v)) { if (!techniques.includes(v.toUpperCase())) techniques.push(v.toUpperCase()); }
    else if (Object.hasOwn(TACTIQUES, v) && !tactiques.includes(TACTIQUES[v])) tactiques.push(TACTIQUES[v]);
  }
  return tactiques.length || techniques.length ? { tactiques, techniques } : null;
}

// Registre des règles (titres, cas, mode actuel), du moteur.
function registre(engine) {
  const m = new Map();
  for (const r of engine?.rules?.() || []) m.set(r.id, r);
  return m;
}
function titreDe(regle, regles) {
  const brut = regles.get(regle)?.titre;
  const nom = regle.startsWith('detecteur.') ? regle.slice(10) : null;
  if (nom && (!brut || brut === nom.replaceAll('_', ' '))) return typo(DETECTEURS[nom] || nom.replaceAll('_', ' '));
  return typo(brut || regle);
}
const casDe = cas => (cas === 'quorum' ? 'score' : cas ? `cas ${cas}` : '');

// Entité nommée pour le gabarit _ent : un Lecteur voit une adresse tronquée.
function entiteVue(kind, key, role) {
  const k = ENTITES[kind] || kind;
  if (kind === 'ip') { const a = adresseDetail(key, role); return { k, texte: a.texte, mono: 'ip', v6: a.v6, tronquee: a.tronquee }; }
  if (kind === 'reseau') return { k, texte: reseauVue(key), mono: 'ip', v6: String(key).includes(':'), tronquee: false };
  if (kind === 'vigie' || kind === 'site') return { k, texte: typo(key), mono: null, tronquee: false };
  return { k, texte: String(key), mono: 'sub', tronquee: false };
}
// Fiche de l'entité (écran Entités) : /entites/<kind>/<clé encodée>. Un Lecteur ne voit jamais l'adresse entière, ni dans
// une adresse de lien : il est mené au réseau de l'adresse (/24, /48), écrit comme le site l'écrit (server/ip.js).
function ficheEntite(kind, key, role) {
  if (!Object.hasOwn(FICHE_DE, kind)) return null;
  if (kind === 'ip') {
    const a = adresseDetail(key, role);
    if (a.tronquee) return { href: `/entites/reseau/${encodeURIComponent(a.texte.replace(/\/\d+$/, ''))}`, texte: FICHE_DE.reseau };
    if (a.texte === 'masquée') return null;
  }
  return { href: `/entites/${kind}/${encodeURIComponent(key)}`, texte: FICHE_DE[kind] };
}

const sourcesDe = s => (lire(s) || []).filter(x => Object.hasOwn(SOURCES, x)).map(x => ({ cle: x, mot: SOURCES[x] }));
const eligible = a => ['haut', 'critique'].includes(a.gravite) || a.regle === 'sigma.surveillance_reduite';
// « réponse faite : compte gelé 24 h, sessions du compte fermées » (mots de vigie/notifications.js, responseOf).
const reponseFaite = decisions => responseOf(decisions).replace(/^Réponse : /, `réponse faite${FINE}: `).replace(/(\d) (h|j)\b/g, `$1${NBSP}$2`);

// Requêtes préparées une fois par base (lecture seule) ; les listes filtrées, une fois par forme de filtre.
const cache = new WeakMap();
function requetes(db) {
  let q = cache.get(db);
  if (q) return q;
  const formes = new Map();
  q = {
    sql: sql => { if (!formes.has(sql)) formes.set(sql, db.prepare(sql)); return formes.get(sql); },
    alerte: db.prepare('SELECT * FROM alerts WHERE id = ?'),
    decisions: db.prepare(`SELECT id, kind, cible, portee, motif, par, cree_a, fin, leve_a, leve_par, auto FROM decisions WHERE motif = ? ORDER BY id LIMIT ${DECISIONS_MAX}`),
    nbEvenements: db.prepare(`SELECT COUNT(*) FROM (SELECT 1 FROM alert_events WHERE alert_id = ? LIMIT ${COMPTE_MAX + 1})`).pluck(),
    evenements: db.prepare(`SELECT e.seq, e.recu_a, e.survenu_a, e.type, e.severity, e.composant, e.emetteur, e.confiance, e.sub, e.ip, e.method, e.route, e.status, e.retard
      FROM alert_events a JOIN events e ON e.seq = a.seq WHERE a.alert_id = ? AND a.seq < ? ORDER BY a.seq DESC LIMIT ${EVENEMENTS + 1}`),
    historique: db.prepare(HISTORIQUE),
    autres: db.prepare(`SELECT id, regle, gravite, statut, derniere FROM alerts WHERE entite_kind = ? AND entite_key = ? AND id != ? ORDER BY id DESC LIMIT ${AUTRES + 1}`),
  };
  const reponses = new Map();
  q.reponses = n => {
    if (!reponses.has(n)) reponses.set(n, db.prepare(`SELECT motif, kind, cree_a, fin FROM decisions WHERE auto = 1 AND motif IN (${Array(n).fill('?').join(', ')}) ORDER BY id LIMIT 500`));
    return reponses.get(n);
  };
  cache.set(db, q);
  return q;
}
// Pour les tests : les requêtes de ce module (contrôle des plans d'exécution).
export const requetesAlertes = db => requetes(db);

// ---------- Liste ----------

// Filtres tirés de l'adresse : une valeur inconnue est ignorée (et dite), jamais interprétée.
export function filtresDe(query, regles) {
  const str = v => (typeof v === 'string' ? v : '');
  const ignores = [];
  const f = { statut: 'ouvertes', gravite: '', regle: '', page: 1, apres: null };
  const s = str(query.statut);
  if (s && Object.hasOwn(STATUTS, s)) f.statut = s; else if (s || Array.isArray(query.statut)) ignores.push('statut');
  const g = str(query.gravite);
  if (g && Object.hasOwn(GRAVITES_F, g)) f.gravite = g; else if (g || Array.isArray(query.gravite)) ignores.push('gravité');
  const r = str(query.regle);
  if (r && r.length <= 120 && (regles.has(r) || /^(sigma|detecteur|entite)\.[a-z0-9_]{1,100}$/.test(r))) f.regle = r; else if (r || Array.isArray(query.regle)) ignores.push('règle');
  const p = str(query.page);
  if (p) { if (/^[1-9]\d{0,3}$/.test(p) && Number(p) <= PAGE_MAX) f.page = Number(p); else ignores.push('page'); }
  const a = /^(\d{1,15})-(\d{1,12})$/.exec(str(query.apres));
  if (a) f.apres = { derniere: Number(a[1]), id: Number(a[2]) }; else if (query.apres != null) ignores.push('position');
  return { f, ignores };
}
const pagine = f => f.statut === 'close' || f.statut === 'toutes';     // closes, toutes : par jeu de clés (dernière occurrence)
// Adresse de la liste pour ces filtres (page et position à part).
export function adresseListe(f, extra = {}) {
  const p = new URLSearchParams();
  if (f.statut !== 'ouvertes') p.set('statut', f.statut);
  if (f.gravite) p.set('gravite', f.gravite);
  if (f.regle) p.set('regle', f.regle);
  for (const [k, v] of Object.entries(extra)) if (v != null) p.set(k, String(v));
  const s = p.toString();
  return s ? `/alertes?${s}` : '/alertes';
}

function filtreSql(f) {
  const where = [], params = [];
  if (f.statut === 'ouvertes') where.push("statut != 'close'");
  // « statut != 'close' » répété : l'index partiel alerts_ouvertes sert aussi aux filtres par règle.
  else if (f.statut === 'ouverte' || f.statut === 'en_cours') { where.push("statut != 'close'", 'statut = ?'); params.push(f.statut); }
  else if (f.statut === 'close') where.push("statut = 'close'");
  if (f.gravite) { const g = GRAVITES_F[f.gravite]; where.push(`gravite IN (${g.map(() => '?').join(', ')})`); params.push(...g); }
  if (f.regle) { where.push('regle = ?'); params.push(f.regle); }
  return { where, params };
}

const COLONNES = 'id, regle, cas, entite_kind, entite_key, gravite, mode, statut, classement, note, premiere, derniere, compteur, score, sources, reponse, traite_par, traite_a';

function ligneAlerte(a, { t, role, regles, reponses }) {
  const g = gravite(a.gravite);
  const modeSec = { observer: 'sans notification', alerter: eligible(a) ? 'message à l’ouverture' : `sans message (${g.mot.toLowerCase()})`,
    bloquer: 'réponse automatique', arret: 'règle arrêtée' }[a.mode] || '';
  const decs = reponses.get(a.id) || [];
  const reponse = decs.length ? reponseFaite(decs) : a.mode === 'bloquer' ? (/interrupteur des blocages/.test(a.reponse || '') ? 'aucune réponse : blocages automatiques arrêtés' : 'aucune réponse automatique') : '';
  const score = a.regle === 'entite.score' && a.score != null ? `score ${virgule(a.score)}` : '';
  let statut;
  if (a.statut === 'close') {
    const qui = a.traite_par ? ` par ${nomDe(a.traite_par)}` : '';
    const quandC = a.traite_a ? `, ${quand(a.traite_a, t)}` : '';
    const sec = a.classement ? `classée ${CLASSEMENTS[a.classement] || a.classement}${qui}${quandC}` : `${/^sans suite/.test(a.note || '') ? 'sans suite' : 'close'}${quandC}`;
    statut = { k: 'abouti', mot: 'Close', sec };
  } else if (a.statut === 'en_cours') statut = { k: 'encours', mot: 'Prise en charge', sec: [a.traite_par ? `par ${nomDe(a.traite_par)}` : '', reponse].filter(Boolean).join(' · ') };
  else statut = { k: 'afaire', mot: 'Ouverte', sec: [reponse, score].filter(Boolean).join(' · ') };
  return {
    id: a.id,
    titre: titreDe(a.regle, regles),
    cas: casDe(a.cas),
    grav: { mot: g.mot, classe: g.classe },
    crit: a.gravite === 'critique' && a.statut !== 'close',
    entite: entiteVue(a.entite_kind, a.entite_key, role),
    sources: sourcesDe(a.sources),
    occ: { n: nombre(a.compteur), sec: a.compteur > 1 ? periode(a.premiere, a.derniere, t) : aQuand(a.derniere, t) },
    mode: { mot: MODES[a.mode] || a.mode, sec: modeSec },
    statut,
  };
}

function reponsesDe(q, ids) {
  const out = new Map();
  if (!ids.length) return out;
  for (const d of q.reponses(ids.length).all(ids.map(id => `alerte #${id}`))) {
    const id = Number(d.motif.slice(8));
    if (!out.has(id)) out.set(id, []);
    out.get(id).push(d);
  }
  return out;
}

// La liste : { filtres, lignes, total, résumé, pages… }, déjà mise en forme.
export function liste({ db, engine, now = Date.now, role, query = {} }) {
  const q = requetes(db);
  const t = now();
  const roleVu = role && role !== 'viewer' ? role : 'viewer';
  const regles = registre(engine);
  const { f, ignores } = filtresDe(query, regles);
  const { where, params } = filtreSql(f);
  const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = q.sql(`SELECT COUNT(*) FROM (SELECT 1 FROM alerts ${W} LIMIT ${COMPTE_MAX + 1})`).pluck().get(...params);
  let rows, suivante = null, precedente = null, position = null;
  if (pagine(f)) {
    // Closes, ou toutes : de la plus récente à la plus ancienne (dernière occurrence), par jeu de clés (index alerts_derniere).
    const w = [...where], p = [...params];
    if (f.apres) { w.push('(derniere < ? OR (derniere = ? AND id < ?))'); p.push(f.apres.derniere, f.apres.derniere, f.apres.id); }
    rows = q.sql(`SELECT ${COLONNES} FROM alerts ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY derniere DESC, id DESC LIMIT ${PAGE + 1}`).all(...p);
    if (rows.length > PAGE) { rows = rows.slice(0, PAGE); const d = rows.at(-1); suivante = { href: adresseListe(f, { apres: `${d.derniere}-${d.id}` }), texte: 'Plus anciennes' }; }
    if (f.apres) precedente = { href: adresseListe(f), texte: 'Les plus récentes' };
    position = f.apres ? `Suite de la liste, à partir du ${dateHeure(f.apres.derniere)}` : total ? `Alertes 1 à ${nombre(rows.length)} sur ${compte(total)}` : null;
  } else {
    // Non closes : la plus grave d'abord ; à gravité égale, celles que personne n'a prises en charge, puis la plus récente
    // (alertOrder de vigie/moteur.js) ; peu nombreuses (closes seules après 7 jours sans événement) : pages numérotées.
    const pages = Math.min(PAGE_MAX, Math.max(1, Math.ceil(Math.min(total, COMPTE_MAX) / PAGE)));
    const page = Math.min(f.page, pages);
    rows = q.sql(`SELECT ${COLONNES} FROM alerts ${W} ORDER BY ${RANG_SQL} DESC, (statut = 'ouverte') DESC, derniere DESC, id DESC LIMIT ${PAGE} OFFSET ?`).all(...params, (page - 1) * PAGE)
      .sort((a, b) => alertOrder(a, b) || b.id - a.id);
    if (page < pages) suivante = { href: adresseListe(f, { page: page + 1 }), texte: 'Page suivante' };
    if (page > 1) precedente = { href: adresseListe(f, page - 1 > 1 ? { page: page - 1 } : {}), texte: 'Page précédente' };
    if (total) position = `Page ${page} sur ${pages} · alertes ${nombre((page - 1) * PAGE + 1)} à ${nombre((page - 1) * PAGE + rows.length)} sur ${compte(total)}`;
  }
  const reponses = reponsesDe(q, rows.map(a => a.id));
  const lignes = rows.map(a => ligneAlerte(a, { t, role: roleVu, regles, reponses }));

  // Résumé : combien par gravité (non closes seulement : peu nombreuses).
  let parGravite = null;
  if (!pagine(f) && total) {
    const n = Object.fromEntries(q.sql(`SELECT gravite, COUNT(*) n FROM (SELECT gravite FROM alerts ${W} LIMIT ${COMPTE_MAX + 1}) GROUP BY gravite`).all(...params).map(r => [r.gravite, r.n]));
    parGravite = ['critique', 'haut', 'moyen', 'bas', 'info'].filter(g => n[g]).map(g => `${nombre(n[g])} ${n[g] > 1 ? gravite(g).pluriel : gravite(g).pluriel.replace(/s$/, '')}`).join(', ');
  }
  const ordre = pagine(f) ? 'de la plus récente à la plus ancienne (dernière occurrence)' : `la plus grave d’abord${FINE}; à gravité égale, celles que personne n’a prises en charge, puis la plus récente`;
  const NOM = { ouvertes: ['alerte non close', 'alertes non closes'], ouverte: ['alerte ouverte sans intervenant', 'alertes ouvertes sans intervenant'],
    en_cours: ['alerte prise en charge', 'alertes prises en charge'], close: ['alerte close', 'alertes closes'], toutes: ['alerte', 'alertes'] }[f.statut];

  // Options du filtre « règle » : les règles du moteur, par titre ; une règle qui n'y est plus (alertes anciennes) ajoutée.
  const options = [...regles.values()].map(r => ({ valeur: r.id, mot: titreDe(r.id, regles) })).sort((a, b) => a.mot.localeCompare(b.mot, 'fr'));
  if (f.regle && !regles.has(f.regle)) options.unshift({ valeur: f.regle, mot: f.regle });
  const actifs = [f.statut !== 'ouvertes', Boolean(f.gravite), Boolean(f.regle)].filter(Boolean).length;
  const resume = [STATUTS[f.statut], f.gravite ? GRAVITES_MOT[f.gravite].toLowerCase() : 'toutes gravités', f.regle ? titreDe(f.regle, regles) : 'toutes les règles'].join(' · ');

  return {
    maintenant: dateHeure(t),
    lecteur: roleVu === 'viewer',
    filtres: { statut: f.statut, gravite: f.gravite, regle: f.regle, actifs, resume, options, statuts: STATUTS, gravites: GRAVITES_MOT, ignores },
    titre: `${compte(total)} ${total > 1 ? NOM[1] : NOM[0]}`,
    ordre,
    parGravite,
    total,
    lignes,
    closes: f.statut === 'ouvertes' ? adresseListe({ ...f, statut: 'close' }) : null,
    pages: { position, suivante, precedente },
    pagine: pagine(f),
  };
}

// ---------- Fiche ----------

function ligneDecision(d, t, role) {
  let cible = null;
  if (d.kind === 'bloquer') {
    const a = adresseDetail(String(d.cible).replace(/\/(32|128)$/, ''), role);
    cible = { texte: a.texte, mono: 'ip', v6: a.v6, tronquee: a.tronquee };
  } else if (d.kind !== 'verrouiller') cible = { texte: String(d.cible), mono: 'sub', tronquee: false };
  const etat = d.leve_a ? `levée ${aQuand(d.leve_a, t)}${d.leve_par ? ` par ${d.leve_par}` : ''}`
    : d.fin <= t ? `expirée ${aQuand(d.fin, t)}` : jusqua(d.fin, t);
  const par = d.auto ? 'par la Vigie' : `par ${d.par}`;
  return {
    id: d.id,
    type: DECISION_FAITE[d.kind] || d.kind,
    cible,
    enCours: !d.leve_a && d.fin > t,
    sec: [d.portee ? PORTEES[d.portee] || d.portee : '', etat, `${par} ${aQuand(d.cree_a, t)}`].filter(Boolean).join(' · '),
  };
}

// Texte de la réponse automatique (colonne reponse, écrite par vigie/moteur.js) : ce qui n'est pas une décision faite (les
// décisions ont leurs lignes). Un Lecteur n'en voit que les raisons connues (le reste peut citer une adresse).
function raisonsReponse(texte, role) {
  const morceaux = String(texte || '').split(' ; ').map(s => s.trim()).filter(Boolean)
    .filter(s => !/^(bloquer|geler|revoquer_compte|revoquer_session|verrouiller) (?!refusé)/.test(s));
  return morceaux.map(s => {
    if (RAISONS.some(r => r.test(s))) return typo(s);
    if (role === 'viewer') return /refusé/.test(s) ? 'une réponse a été refusée par les garde-fous' : null;
    return typo(s.replace(/^(bloquer|geler|revoquer_compte|revoquer_session|verrouiller) refusé/, (m, k) => `${DECISION_FAITE[k] || k}${FINE}: refusé`));
  }).filter(Boolean);
}

const parQui = e => {
  const s = String(e || '');
  if (/^vigie\/moteur\.js/.test(s) || /^Vigie\b/.test(s)) return 'la Vigie';
  return s.replace(/^console · /, '') || 'inconnu';
};

// Historique : les événements vigie_alerte de l'alerte (index events_alerte), du plus ancien au plus récent ; la clôture
// automatique (un seul événement pour toutes les alertes closes ce jour-là) se lit dans l'alerte elle-même.
function historique(q, a, t) {
  const rows = q.historique.all(a.id);
  const coupe = rows.length > HISTOIRE;
  const lignes = rows.slice(0, HISTOIRE).reverse().map(r => {
    const d = lire(r.detail) || {};
    const g = d.gravite ? gravite(d.gravite).mot : null;
    let texte;
    if (d.action === 'ouverte') texte = `Ouverte${g ? `, gravité ${g}` : ''}${d.mode ? `, mode ${MODES[d.mode] || d.mode}` : ''}`;
    else if (d.action === 'aggravee') texte = `Aggravée${d.avant && g ? `${FINE}: ${gravite(d.avant).mot}, puis ${g}` : g ? `${FINE}: ${g}` : ''}`;
    else if (d.action === 'prise en charge') texte = `Prise en charge par ${parQui(r.emetteur)}`;
    else if (d.action === 'close') texte = d.classement ? `Classée ${CLASSEMENTS[d.classement] || d.classement} par ${parQui(r.emetteur)}, alerte close` : `Close par ${parQui(r.emetteur)}`;
    else if (d.action === 'note') texte = `Note de ${parQui(r.emetteur)}`;
    else texte = `${capitale(String(d.action || 'changement').slice(0, 40))} par ${parQui(r.emetteur)}`;
    const note = typeof d.note === 'string' && d.note.trim() ? guillemets(d.note.trim().slice(0, 200)) : null;
    return { quand: quand(r.recu_a, t), iso: new Date(r.recu_a).toISOString(), texte, note, lien: `/evenements/${r.seq}` };
  });
  if (a.statut === 'close' && /^Vigie \(clôture automatique\)/.test(a.traite_par || '') && a.traite_a) {
    lignes.push({ quand: quand(a.traite_a, t), iso: new Date(a.traite_a).toISOString(), texte: `Close sans suite par la Vigie${FINE}: 7 jours sans nouvel événement`, note: null, lien: null });
  }
  return { lignes, coupe };
}

function evenementVue(e, t, role) {
  const src = sourceOf(e);
  const a = e.ip ? adresseDetail(e.ip, role) : null;
  const constate = e.confiance === 'constaté';
  const g = gravite(e.severity);
  const quandSource = e.survenu_a ?? e.recu_a;
  return {
    seq: e.seq,
    href: `/evenements/${e.seq}`,
    heure: heureSec(quandSource, t),
    iso: new Date(Number(quandSource)).toISOString(),
    // « — » : constaté par la Vigie elle-même, sans écart de réception.
    ecart: e.survenu_a == null || src === 'vigie' || !src ? null : ecart(e.recu_a - e.survenu_a),
    tard: Boolean(e.retard),
    type: TYPES[e.type] || null,
    code: e.type,
    route: e.route ? `${e.method ? `${e.method} ` : ''}${e.route}${e.status ? ` → ${e.status}` : ''}` : null,
    grav: { mot: g.mot, classe: g.classe },
    source: src ? { cle: src, mot: SOURCES[src] } : null,
    composant: e.composant,
    emetteur: e.emetteur || null,
    constate,
    adresse: a && a.texte ? { texte: a.texte, v6: a.v6, tronquee: a.tronquee } : null,
    compte: e.sub || null,
  };
}

// Score de l'entité, par source (MV-02, état #409) : la valeur du moment (demi-vie d'une heure), le seuil, le quorum.
function scoreDe(engine, a) {
  if (!['ip', 'reseau', 'compte', 'session', 'appareil'].includes(a.entite_kind)) return null;
  let e = null;
  try { e = engine?.current?.(a.entite_kind, a.entite_key); } catch { e = null; }
  if (!e) return null;
  const parts = Object.entries(e.contributions || {}).filter(([, v]) => v >= 0.05).sort((x, y) => y[1] - x[1]);
  if (!parts.length && e.score < 0.05) return null;
  const limite = engine?.thresholds?.()?.[a.entite_kind];
  const max = Math.max(20, Math.ceil(e.score));
  const comptent = parts.filter(([s, v]) => s !== 'menaces' && s !== 'contexte' && v >= SOURCE_MIN).length;
  const NOMS = { ...SOURCES, menaces: 'listes de menaces', contexte: 'contexte (hors quorum)' };
  const quorum = comptent >= QUORUM ? `${capitale(enLettres(comptent))} sources${FINE}: le quorum est atteint.`
    : `${comptent ? 'Une seule source' : 'Aucune source'} au-dessus de ${virgule(SOURCE_MIN)}${NBSP}point${FINE}: le quorum (${QUORUM}) n’est pas atteint.`;
  return {
    max,
    lignes: parts.map(([s, v], i) => ({ id: `s-${i}`, mot: NOMS[s] || s, valeur: Math.round(v * 10) / 10, texte: virgule(v) })),
    total: { valeur: Math.round(e.score * 10) / 10, texte: virgule(e.score) },
    seuils: limite ? `Seuil ${SEUIL_DE[a.entite_kind]}${FINE}: ${nombre(limite)}${NBSP}points${FINE}; Haute au double, ${nombre(2 * limite)}. ${quorum}` : quorum,
  };
}

export function fiche({ db, engine, now = Date.now, role, id, avant = null }) {
  const q = requetes(db);
  const a = q.alerte.get(id);
  if (!a) return null;
  const t = now();
  const roleVu = role && role !== 'viewer' ? role : 'viewer';
  const regles = registre(engine);
  const r = regles.get(a.regle);
  const g = gravite(a.gravite);
  const titre = titreDe(a.regle, regles);
  const sources = sourcesDe(a.sources);

  // Mode : celui de l'alerte (à son ouverture) ; celui de la règle aujourd'hui s'il a changé.
  const modeSec = {
    observer: `Mode Observer${FINE}: ni message, ni réponse automatique.`,
    alerter: eligible(a) ? `Mode Alerter${FINE}: message Signal (ou e-mail) à l’ouverture, aucune réponse automatique.` : `Mode Alerter${FINE}: pas de message pour une gravité ${g.mot.toLowerCase()}, aucune réponse automatique.`,
    bloquer: eligible(a) ? `Mode Bloquer${FINE}: réponse automatique et message Signal (ou e-mail) à l’ouverture.` : `Mode Bloquer${FINE}: réponse automatique, sans message.`,
    arret: `Règle arrêtée${FINE}: rien ne s’ajoute à l’alerte.`,
  }[a.mode] || '';
  const modeActuel = r && r.mode !== a.mode ? `La règle est aujourd’hui en mode ${MODES[r.mode] || r.mode}.` : null;

  // Réponse : décisions dont le motif cite l'alerte (automatiques, ou prises à la main depuis la fiche), et les raisons
  // d'une absence de réponse.
  const decs = q.decisions.all(`alerte #${a.id}`);
  const auto = decs.filter(d => d.auto);
  const reponse = {
    lignes: decs.map(d => ligneDecision(d, t, roleVu)),
    resume: auto.length ? capitale(reponseFaite(auto)) : null,
    raisons: raisonsReponse(a.reponse, roleVu),
    attendue: a.mode === 'bloquer',
  };

  // Événements de l'alerte, les plus récents d'abord, par pages de 20 (jeu de clés : seq).
  const nb = q.nbEvenements.get(a.id);
  const debut = !(Number.isSafeInteger(avant) && avant > 0);
  let evs = q.evenements.all(a.id, debut ? Number.MAX_SAFE_INTEGER : avant);
  const plus = evs.length > EVENEMENTS;
  evs = evs.slice(0, EVENEMENTS);
  const evenements = {
    total: nb,
    totalTexte: compte(nb),
    lignes: evs.map(e => evenementVue(e, t, roleVu)),
    suite: plus ? `/alertes/${a.id}?avant=${evs.at(-1).seq}#t-signal` : null,
    debut: debut ? null : `/alertes/${a.id}#t-signal`,
    // Liens vers des événements qui ne sont plus au journal (purgés après 6 mois).
    effaces: debut && evs.length === 0 && nb > 0,
  };

  // Règle : titre, cas, nature, tactiques MITRE.
  const nature = a.regle === 'entite.score' ? `Alerte de score${FINE}: le score de l’entité a franchi son seuil, et deux sources au moins y contribuent (quorum).`
    : a.regle.startsWith('detecteur.') ? `Détecteur de comportement${FINE}: la Vigie compare l’entité à son habitude.`
      : r?.sourceUnique ? `Une seule observation suffit${FINE}: preuve à source unique, sans attendre le score.` : null;
  const regle = { id: a.regle, titre, cas: a.cas && a.cas !== 'quorum' ? a.cas : null, nature, mitre: mitre(r?.tags) };

  // Verdict des sources.
  const mots = sources.map(s => s.mot);
  const enum_ = mots.length > 1 ? `${mots.slice(0, -1).join(', ')} et ${mots.at(-1)}` : mots[0];
  const verdict = sources.length >= 2 ? { seul: false, texte: `${capitale(enLettres(sources.length))} sources indépendantes${FINE}: ${enum_}.` }
    : sources.length === 1 ? { seul: true, texte: `Une seule source${FINE}: ${enum_}.` } : { seul: true, texte: 'Aucune source notée pour cette alerte.' };

  // Entité : sa fiche, les autres alertes de la même entité.
  const autresRows = q.autres.all(a.entite_kind, a.entite_key, a.id);
  const autres = autresRows.slice(0, AUTRES).map(x => ({ id: x.id, href: `/alertes/${x.id}`, titre: titreDe(x.regle, regles), grav: gravite(x.gravite).mot.toLowerCase(),
    statut: x.statut === 'close' ? 'close' : x.statut === 'en_cours' ? 'prise en charge' : 'ouverte' }));

  const statut = a.statut === 'close' ? { k: 'abouti', mot: 'Close' } : a.statut === 'en_cours' ? { k: 'encours', mot: 'Prise en charge' } : { k: 'afaire', mot: 'Ouverte' };
  const classement = a.statut === 'close' ? {
    mot: a.classement ? CLASSEMENTS[a.classement] || a.classement : /^sans suite/.test(a.note || '') ? 'Sans suite' : 'Close sans classement',
    par: a.traite_par ? nomDe(a.traite_par) : null,
    quand: a.traite_a ? dateHeure(a.traite_a) : null,
    note: a.note ? guillemets(String(a.note).slice(0, 500)) : null,
  } : null;

  return {
    id: a.id,
    lecteur: roleVu === 'viewer',
    titre,
    grav: { mot: g.mot, classe: g.classe },
    statut,
    retour: a.statut === 'close' ? '/alertes?statut=close' : '/alertes',
    quand: a.compteur > 1 ? capitale(periode(a.premiere, a.derniere, t)) : dateHeure(a.premiere),
    priseEnCharge: a.statut === 'en_cours' ? `prise en charge${a.traite_par ? ` par ${nomDe(a.traite_par)}` : ''}${a.traite_a ? ` ${aQuand(a.traite_a, t)}` : ''}` : null,
    entite: { ...entiteVue(a.entite_kind, a.entite_key, roleVu), titre: ENTITE_TITRE[a.entite_kind] || 'L’entité', fiche: ficheEntite(a.entite_kind, a.entite_key, roleVu) },
    sources,
    occ: a.compteur > 1 ? `${nombre(a.compteur)} occurrences ${periode(a.premiere, a.derniere, t)}` : `Une occurrence, ${aQuand(a.premiere, t)}`,
    compteur: nombre(a.compteur),
    premiere: dateHeure(a.premiere),
    derniere: dateHeure(a.derniere),
    mode: { mot: MODES[a.mode] || a.mode, sec: modeSec, actuel: modeActuel },
    scoreOuverture: a.score != null ? virgule(a.score) : null,
    score: scoreDe(engine, a),
    reponse,
    regle,
    verdict,
    evenements,
    autres: { lignes: autres, plus: autresRows.length > AUTRES },
    historique: historique(q, a, t),
    classement,
  };
}

// ---------- Routes ----------

export function register(app, ctx) {
  const { db, engine, now } = ctx;
  app.get('/alertes', async (req, reply) => {
    const vue = liste({ db, engine, now, role: req.moi.role, query: req.query || {} });
    return ctx.view(reply, req, 'alertes', { page: 'alertes', titre: 'Alertes · Vigie', vue });
  });

  app.get('/alertes/:id', async (req, reply) => {
    const brut = String(req.params.id || '');
    const id = /^[1-9]\d{0,11}$/.test(brut) ? Number(brut) : null;
    const av = typeof req.query?.avant === 'string' && /^[1-9]\d{0,15}$/.test(req.query.avant) ? Number(req.query.avant) : null;
    const vue = id ? fiche({ db, engine, now, role: req.moi.role, id, avant: av }) : null;
    if (!vue) return ctx.view(reply, req, 'alertes-introuvable', { page: 'alertes', titre: 'Alerte introuvable · Vigie', numero: id }, 404);
    return ctx.view(reply, req, 'alertes-fiche', { page: 'alertes', titre: `Alerte #${vue.id} · Vigie`, vue });
  });

  return ['/alertes'];
}
