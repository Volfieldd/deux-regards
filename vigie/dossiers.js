import { PHASES, MARQUEURS } from './phases.js';
import { lru } from './detecteurs.js';
import { CATEGORIES_DONNEES } from '../server/securite/vocabulaire.js';

// Dossiers de la Vigie (étude docs/etudes/vigie-dossiers.md ; décisions D31 à D39 du 20 octobre 2026) : tout ce qui
// touche une même attaque probable, d'une entité à l'autre, au-dessus des alertes (qui ne changent pas).
//   - Entrées : les signaux projetés (vigie/phases.js : phase, nature), les alertes, les faits ordinaires (connexions,
//     échecs, lectures, exports, suppressions, changements de session).
//   - Ouverture (5.3) : une alerte ; un jalon de phase 3 ou plus sur un compte dont la confiance est moyenne ou forte ;
//     des lectures, un export ou des suppressions sous un accès douteux (4.6). Jamais un indice seul (D33).
//   - Rattachement (5.4) : par les acteurs (compte, session, adresse, accès de galerie, réseau) de lien fort ou moyen ;
//     une cible (fiche, réglage, la Vigie) ne se traverse jamais ; plusieurs dossiers trouvés : fusion dans le plus
//     ancien. La piste serveur se relie par le temps (une heure) ; la dissimulation s'ajoute à tous les dossiers ouverts.
//   - Rattachement rétroactif (5.5) : indices et faits du compte sur 24 h, repérage des adresses liées sur 7 jours,
//     tentatives sur 24 h ; adresses de connexion du compte sur 72 h en lien faible (D34 : jamais une adresse privée, de
//     confiance, vue avec un administrateur ou partagée par plus de 5 comptes).
//   - Gravité (6) : progression (phase la plus avancée, cohérence) × confiance (indices, preuves, contre-indices), puis
//     enjeu et dissimulation, plancher à l'alerte la plus grave ; expliquée en trois lignes.
// Gestes de chaque dossier notés dans la chaîne (vigie_dossier) : ouverture, fusion, aggravation, sommeil, clôture,
// récidive, gestes de l'analyste ; un rattachement de signal ne l'est pas (le dossier le garde, la chaîne a déjà
// l'événement d'origine).

const H = 3600e3, J = 864e5;
export const GRAVITES = ['info', 'bas', 'moyen', 'haut', 'critique'];
export const CONFIANCES = ['aucune', 'faible', 'moyenne', 'forte'];
export const ENJEUX = ['ordinaire', 'personnel', 'sensible', 'critique'];
export const PISTES = { identite: 'identité', invite: 'invité', serveur: 'serveur', externe: 'externe', surveillance: 'surveillance' };
export const CLASSEMENTS = ['incident', 'faux_positif', 'test', 'legitime'];
const MAX_ENTITES = 40, MAX_SIGNAUX = 200;
const SOMMEIL = 72 * H, CLOTURE = 14 * J, RECIDIVE = 30 * J, APPRIS = 90 * J;
const ACTEURS = new Set(['ip', 'reseau', 'compte', 'session', 'acces']);
const SERVEUR = /^site:(?:sortie|sortie_directe|chaine_sortie|flux|conteneur:.*|donnees|restauration)$/;
// Objets personnels (enjeu) : ce que le site émet dans detail.objet des lectures, exports et suppressions.
const PERSONNELS = new Set(['personne', 'rencontre', 'message', 'acces', 'galerie']);
// Faits suivis (4.6) et leur phase quand ils deviennent des jalons.
const FAITS = { authn_login_success: 3, zitadel_connexion: 3, authn_login_fail: 2, zitadel_echec: 2, sensitive_read: 6, sensitive_export: 7, sensitive_delete: 8,
  session_context_change: 3, authn_reauth_success: null, session_created: 3 };
// Points de confiance des indices (4.3) ; premiere_apparition : 1,5 par attribut inédit (pays, appareil).
const POINTS = { 'detecteur.premiere_apparition': 1.5, 'detecteur.heure_inhabituelle': 1, 'sigma.bordure_nouvel_operateur': 1, 'detecteur.voyage_impossible': 3,
  'detecteur.pivot_identifiants': 3, 'fait.session_context_change': 2, 'sigma.compte_reseaux_multiples': 1.5 };
const LIBELLES = { 'detecteur.heure_inhabituelle': 'heure inhabituelle', 'sigma.bordure_nouvel_operateur': 'opérateur réseau inédit', 'detecteur.voyage_impossible': 'voyage impossible',
  'detecteur.pivot_identifiants': 'échecs puis connexion', 'fait.session_context_change': 'session changée de réseau ou de navigateur',
  'sigma.compte_reseaux_multiples': 'trois réseaux ou plus en 24 h' };
// Enjeu (6.1) : règles qui touchent des droits d'administrateur (sensible) ; face publique ou rôle donné hors de
// l'application (critique).
const DROITS = new Set(['sigma.administrateur_donne', 'sigma.zitadel_droits', 'sigma.zitadel_critique', 'sigma.console_droits', 'sigma.controle_roles', 'detecteur.role_incoherent']);
const CRITIQUES = new Set(['sigma.role_hors_application', 'sigma.contact_public_change', 'sigma.texte_public_contact', 'sigma.textes_publics_geste_massif',
  'sigma.textes_publics_en_serie', 'sigma.billets_modifies_en_masse', 'sigma.billet_construction_active']);
// Seuils des faits sous un accès douteux (4.6), valeurs de départ (à recaler après le mois d'observation).
export const SEUILS = { lectures_moyenne: 8, suppressions_moyenne: 3, avant_acces_ms: 5 * 60e3, echecs_avant_ms: 6 * H };
// Grille (6.2) : bande de progression × confiance (faible, moyenne, forte).
const GRILLE = { approche: ['info', 'bas', 'moyen'], entree: ['bas', 'moyen', 'haut'], installation: ['bas', 'haut', 'critique'], sortie: ['moyen', 'haut', 'critique'] };
const bande = n => (n <= 2 ? 'approche' : n <= 4 ? 'entree' : n <= 6 ? 'installation' : 'sortie');
const cran = (g, d) => GRAVITES[Math.max(0, Math.min(GRAVITES.length - 1, GRAVITES.indexOf(g) + d))];
const parse = s => { try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : {}; } catch { return {}; } };
// Clé propre (comme clean du moteur) : sans caractères de contrôle ni de mise en forme (la ligne de commande les affiche),
// 200 caractères au plus. Compte, session, adresse et objet viennent des événements.
const propre = v => String(v).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, '?').slice(0, 200);
const NOM_PHASE = Object.fromEntries(PHASES.map(p => [p.n, p.nom]));

// BV-33 : le dossier ne garde que le contrat fermé des faits personnels, jamais leur detail libre. Les effectifs
// d'une liste ne s'additionnent pas entre requêtes : on connaît un minimum d'objets distincts, pas leur identité.
function donneesDe(detail) {
  const d = parse(detail);
  if (!d || typeof d !== 'object' || !Array.isArray(d.categorie)) return null;
  const categorie = [...new Set(d.categorie.slice(0, 16).filter(c => typeof c === 'string' && Object.hasOwn(CATEGORIES_DONNEES, c)))];
  const entier = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
  return { categorie, objets: Math.min(entier(d.objets) ?? 0, 10000), liste: d.liste === true,
    dechiffrements: entier(d.dechiffrements), octets_servis: entier(d.octets_servis) };
}
const tailleListe = d => d?.liste && d.categorie?.length ? d.objets : 0;

// Entité d'une règle → entité de dossier : un accès de galerie (« site:acces:12 ») est un acteur ; une entité « site »
// ou « vigie » est une cible (« site:configuration »).
export function entiteDossier(e) {
  if (!e?.key) return null;
  const key = propre(e.key);
  if (e.kind === 'site' && key.startsWith('acces:')) return { kind: 'acces', key };
  if (e.kind === 'site' || e.kind === 'vigie') return { kind: 'cible', key: propre(`${e.kind}:${key}`) };
  return { kind: e.kind, key };
}

// Plus longue suite de phases dans l'ordre du temps (4.8) : premières occurrences triées par heure, suite strictement
// croissante des numéros de phase. Rend les phases de la suite.
export function coherence(premieres) {
  const pts = [...premieres.entries()].map(([n, t]) => ({ n, t })).sort((a, b) => a.t - b.t || a.n - b.n);
  const best = pts.map(() => 1), prev = pts.map(() => -1);
  // À longueur égale, la suite qui part le plus tôt dans l'attaque (« accès → exfiltration » plutôt que « collecte →
  // exfiltration » quand la collecte a précédé l'accès douteux).
  for (let i = 0; i < pts.length; i++) {
    for (let j = 0; j < i; j++) {
      if (pts[j].n >= pts[i].n) continue;
      if (best[j] + 1 > best[i] || (best[j] + 1 === best[i] && prev[i] >= 0 && pts[j].n < pts[prev[i]].n)) { best[i] = best[j] + 1; prev[i] = j; }
    }
  }
  let k = best.reduce((m, v, i) => (v > best[m] ? i : m), 0);
  const out = [];
  while (pts.length && k >= 0) { out.unshift(pts[k].n); k = prev[k]; }
  return out;
}

export function createDossiers({ store, now = Date.now, adresses, menaces = () => [], hooks = {} }) {
  const { db, setting } = store;
  const q = {
    projeter: db.prepare(`INSERT INTO signaux_projetes (seq, regle, survenu_a, nature, phase, marqueurs, points, source, gravite, entite_kind, entite_key, sub, session, ip, cle)
      VALUES (@seq, @regle, @survenu_a, @nature, @phase, @marqueurs, @points, @source, @gravite, @entite_kind, @entite_key, @sub, @session, @ip, @cle)`),
    trouver: db.prepare(`SELECT DISTINCT d.id, d.statut, d.derniere FROM dossier_entites e JOIN dossiers d ON d.id = e.dossier_id
      WHERE e.kind = ? AND e.key = ? AND e.detache_a IS NULL AND e.role = 'acteur' AND e.force IN ('graine', 'fort', 'moyen', 'manuel') AND d.fusionne_dans IS NULL
      AND (d.statut != 'clos' OR d.derniere > ?) LIMIT 20`),
    serveur: db.prepare(`SELECT id FROM dossiers WHERE piste = 'serveur' AND statut != 'clos' AND fusionne_dans IS NULL AND derniere > ? ORDER BY id LIMIT 1`).pluck(),
    ouverts: db.prepare(`SELECT id FROM dossiers WHERE statut IN ('ouvert', 'en_cours') AND piste != 'surveillance' AND fusionne_dans IS NULL ORDER BY derniere DESC LIMIT 50`).pluck(),
    dossier: db.prepare('SELECT * FROM dossiers WHERE id = ?'),
    inserer: db.prepare(`INSERT INTO dossiers (piste, graine_kind, graine_key, gravite, ouvert_a, derniere) VALUES (?, ?, ?, 'info', ?, ?)`),
    entites: db.prepare('SELECT * FROM dossier_entites WHERE dossier_id = ? AND detache_a IS NULL'),
    nbEntites: db.prepare('SELECT COUNT(*) FROM dossier_entites WHERE dossier_id = ?').pluck(),
    entite: db.prepare('SELECT * FROM dossier_entites WHERE dossier_id = ? AND kind = ? AND key = ?'),
    ajouterEntite: db.prepare(`INSERT INTO dossier_entites (dossier_id, kind, key, role, force, via, ajoute_a) VALUES (@dossier_id, @kind, @key, @role, @force, @via, @ajoute_a)
      ON CONFLICT (dossier_id, kind, key) DO UPDATE SET force = CASE WHEN dossier_entites.force = 'faible' AND excluded.force != 'faible' THEN excluded.force ELSE dossier_entites.force END,
      role = CASE WHEN dossier_entites.role = 'contexte' THEN excluded.role ELSE dossier_entites.role END`),
    signaux: db.prepare('SELECT * FROM dossier_signaux WHERE dossier_id = ? ORDER BY survenu_a, id'),
    nbSignaux: db.prepare('SELECT COUNT(*) FROM dossier_signaux WHERE dossier_id = ?').pluck(),
    ajouterSignal: db.prepare(`INSERT INTO dossier_signaux (dossier_id, seq, regle, survenu_a, nature, phase, marqueurs, points, source, gravite, entite_kind, entite_key, sub, session, ip, objet, alerte_id, cle, donnees)
      SELECT @dossier_id, @seq, @regle, @survenu_a, @nature, @phase, @marqueurs, @points, @source, @gravite, @entite_kind, @entite_key, @sub, @session, @ip, @objet, @alerte_id, @cle, @donnees
      WHERE NOT EXISTS (SELECT 1 FROM dossier_signaux_ecartes WHERE dossier_id = @dossier_id AND seq = COALESCE(@seq, 0) AND regle = @regle
        AND survenu_a = CASE WHEN @seq IS NULL THEN @survenu_a ELSE 0 END
        AND entite_kind = CASE WHEN @seq IS NULL THEN COALESCE(@entite_kind, '') ELSE '' END
        AND entite_key = CASE WHEN @seq IS NULL THEN COALESCE(@entite_key, '') ELSE '' END)
      ON CONFLICT (dossier_id, seq, regle) DO UPDATE SET alerte_id = COALESCE(excluded.alerte_id, dossier_signaux.alerte_id)`),
    promouvoir: db.prepare("UPDATE dossier_signaux SET promu = 1, nature = 'jalon' WHERE id = ? AND nature = 'fait'"),
    alertesDe: db.prepare('SELECT id, regle, gravite FROM alerts WHERE dossier_id = ?'),
    lierAlerte: db.prepare('UPDATE alerts SET dossier_id = ? WHERE id = ? AND (dossier_id IS NULL OR dossier_id != ?)'),
    maj: db.prepare(`UPDATE dossiers SET piste = @piste, phase_max = @phase_max, coherence = @coherence, confiance = @confiance, enjeu = @enjeu, gravite = @gravite,
      dissimulation = @dissimulation, explication = @explication WHERE id = @id`),
    toucher: db.prepare('UPDATE dossiers SET derniere = MAX(derniere, ?) WHERE id = ?'),
    jalon: db.prepare(`UPDATE dossiers SET dernier_jalon = MAX(COALESCE(dernier_jalon, 0), @t), statut = CASE WHEN statut IN ('sommeil', 'clos') THEN 'ouvert' ELSE statut END,
      recidive = CASE WHEN statut = 'clos' THEN 1 ELSE recidive END, classement = CASE WHEN statut = 'clos' THEN NULL ELSE classement END WHERE id = @id`),
    tronquer: db.prepare('UPDATE dossiers SET tronque = 1 WHERE id = ?'),
    // Confiance d'un compte.
    indicesSub: db.prepare(`SELECT * FROM signaux_projetes WHERE sub = ? AND survenu_a >= ? AND survenu_a <= ? AND nature IN ('indice', 'preuve') ORDER BY survenu_a LIMIT 500`),
    indicesEntite: db.prepare(`SELECT * FROM signaux_projetes WHERE entite_kind = ? AND entite_key = ? AND survenu_a >= ? AND survenu_a <= ? AND nature IN ('indice', 'preuve') LIMIT 200`),
    adressesSub: db.prepare(`SELECT DISTINCT ip FROM events WHERE sub = ? AND type IN ('authn_login_success', 'session_created', 'zitadel_connexion') AND recu_a >= ? AND recu_a <= ? AND ip IS NOT NULL LIMIT 50`).pluck(),
    reauth: db.prepare("SELECT MAX(recu_a) FROM events WHERE sub = ? AND type = 'authn_reauth_success' AND recu_a > ?").pluck(),
    connexions: db.prepare("SELECT detail FROM events WHERE sub = ? AND type = 'authn_login_success' AND recu_a >= ? AND recu_a <= ? LIMIT 500").pluck(),
    // Faits d'un compte, pour l'ouverture sur lectures et le rattachement rétroactif.
    faitsSub: db.prepare(`SELECT * FROM events WHERE sub = ? AND recu_a >= ? AND type IN (${Object.keys(FAITS).map(t => `'${t}'`).join(', ')}) ORDER BY seq LIMIT 400`),
    lecturesSub: db.prepare("SELECT type, session, detail FROM events WHERE sub = ? AND recu_a >= ? AND type IN ('sensitive_read', 'sensitive_export', 'sensitive_delete') LIMIT 1000"),
    // Rattachement rétroactif par entité.
    projetesSub: db.prepare('SELECT * FROM signaux_projetes WHERE (sub = ? OR (entite_kind = \'compte\' AND entite_key = ?)) AND survenu_a >= ? ORDER BY survenu_a LIMIT 400'),
    projetesIp: db.prepare('SELECT * FROM signaux_projetes WHERE (ip = ? OR (entite_kind = \'ip\' AND entite_key = ?)) AND survenu_a >= ? ORDER BY survenu_a LIMIT 400'),
    projetesEntite: db.prepare('SELECT * FROM signaux_projetes WHERE entite_kind = ? AND entite_key = ? AND survenu_a >= ? ORDER BY survenu_a LIMIT 400'),
    evenements: db.prepare('SELECT * FROM events WHERE seq = ?'),
    separations: db.prepare(`SELECT gauche, droite FROM dossier_separations
      WHERE gauche IN (SELECT value FROM json_each(?)) AND droite IN (SELECT value FROM json_each(?))`),
  };

  // ---------- adresses : exclusions (D34) ----------
  const exclusion = lru(5_000);                   // adresse → { t, lookup (rattachement par l'adresse), faible (extension faible) }
  function exclue(ip) {
    const t = now();
    const c = exclusion.get(ip);
    if (c && t - c.t < 10 * 60e3) return c;
    let r;
    if (adresses.isPrivate(ip) || adresses.trusted().has(ip)) r = { tout: true, lookup: true, faible: true };
    else {
      const subs = adresses.linkedSubs(ip, t - 30 * J);
      const adm = adresses.admins();
      const partage = subs.length > 5, admin = subs.some(s => adm.has(s));
      r = { tout: false, lookup: partage || admin, faible: partage || admin };
    }
    exclusion.set(ip, { ...r, t });
    return r;
  }

  // Acteurs d'un événement : compte et session (lien fort), adresse (moyen), accès de galerie (fort). Les objets lus ne
// sont pas des entités (34 fiches rempliraient le dossier) : ils restent dans ses signaux (colonne objet).
  function acteursDe(row) {
    const out = [];
    if (!row) return out;
    const d = parse(row.detail);
    if (row.sub) out.push({ kind: 'compte', key: propre(row.sub), role: 'acteur', force: 'fort' });
    if (row.type === 'vigie_controle_roles' && Array.isArray(d.comptes)) {
      for (const sub of d.comptes.slice(0, MAX_ENTITES)) if (typeof sub === 'string' && sub && !out.some(e => e.kind === 'compte' && e.key === propre(sub)))
        out.push({ kind: 'compte', key: propre(sub), role: 'acteur', force: 'fort' });
    }
    if (row.session) out.push({ kind: 'session', key: propre(row.session), role: 'acteur', force: 'fort' });
    if (d.acces != null && /^[1-9]\d{0,14}$/.test(String(d.acces))) out.push({ kind: 'acces', key: `acces:${d.acces}`, role: 'acteur', force: 'fort' });
    if (row.ip && !exclue(row.ip).tout) out.push({ kind: 'ip', key: propre(row.ip), role: 'acteur', force: 'moyen' });
    return out;
  }
  const objetDe = row => { const d = parse(row?.detail); return d.objet && d.id != null ? propre(`${d.objet}:${d.id}`).slice(0, 120) : null; };

  // ---------- confiance d'un compte (4.3, 4.4) ----------
  const appris = () => (setting.get('dossiers_appris', []) || []).filter(a => a.jusqua > now());
  const cache = lru(2_000);                        // compte → { t, conf }
  // Gardée une minute par compte et par début de fenêtre (arrondi à la minute) ; oubliée dès qu'un indice du compte arrive.
  function confianceCompte(sub, depuis, jusqua = now()) {
    depuis = Math.floor(depuis / 60e3) * 60e3;
    const c = cache.get(sub);
    if (c && c.depuis === depuis && now() - c.t < 60e3) return c.conf;
    const ips = q.adressesSub.all(sub, depuis - 24 * H, jusqua);
    const lignes = [...q.indicesSub.all(sub, depuis, jusqua), ...ips.flatMap(ip => q.indicesEntite.all('ip', ip, depuis, jusqua))];
    const conf = evaluer(sub, lignes, ips, depuis, jusqua);
    cache.set(sub, { t: now(), depuis, conf });
    return conf;
  }
  function evaluer(sub, lignes, ips, depuis, jusqua) {
    const learned = new Set(appris().filter(a => a.sub === sub).map(a => a.cle));
    const vus = new Map();                         // règle|clé → { points, libelle, t, source }
    let preuve = null, debut = null;
    const elements = [];
    for (const l of lignes) {
      if (l.nature === 'preuve') { if (!preuve || l.survenu_a < preuve.t) preuve = { t: l.survenu_a, regle: l.regle }; debut = Math.min(debut ?? Infinity, l.survenu_a); continue; }
      const cles = parse(l.cle);
      const liste = Array.isArray(cles) ? cles : [];
      const restantes = liste.filter(k => !learned.has(k));
      if (liste.length && !restantes.length) continue;               // indice appris (classé « légitime », D39)
      const base = POINTS[l.regle] ?? l.points ?? 1;
      const pts = l.regle === 'detecteur.premiere_apparition' ? base * Math.max(1, restantes.length) : base;
      // Une règle compte une fois, à son plus fort (une heure inhabituelle chaque heure ne s'additionne pas).
      const v = vus.get(l.regle);
      if (!v || pts > v.points) vus.set(l.regle, { points: pts, regle: l.regle, cles: restantes, t: Math.min(v?.t ?? Infinity, l.survenu_a), source: l.source });
      debut = Math.min(debut ?? Infinity, l.survenu_a);
    }
    // Adresses sur une liste de menaces (1 point par liste, 2 au plus).
    let menace = 0;
    for (const ip of ips) menace += menaces(ip).length;
    menace = Math.min(menace, 2);
    let points = [...vus.values()].reduce((s, v) => s + v.points, 0) + menace;
    for (const v of vus.values()) elements.push(libelleIndice(v));
    if (menace) elements.push(`adresse sur une liste de menaces (${menace})`);
    const sources = new Set([...vus.values()].map(v => v.source).filter(Boolean));
    const dernier = Math.max(depuis, ...[...vus.values()].map(v => v.t));
    // Contre-indices : appareil habituel (−1, jamais opposé à une preuve) ; identité confirmée après le dernier indice (−3,
    // confiance plafonnée à « faible »).
    let plafond = null;
    if (points > 0) {
      const anciens = new Set(q.connexions.all(sub, jusqua - 90 * J, jusqua - 14 * J).map(d => parse(d).appareil).filter(Boolean));
      const recents = q.connexions.all(sub, depuis, jusqua).map(d => parse(d).appareil).filter(Boolean);
      if (recents.some(a => anciens.has(a))) { points -= 1; elements.push('appareil habituel (contre-indice)'); }
      const r = q.reauth.get(sub, dernier);
      if (r) { points -= 3; plafond = 'faible'; elements.push('identité confirmée par le second facteur (contre-indice)'); }
    }
    let niveau = 'aucune';
    if (preuve && !q.reauth.get(sub, preuve.t)) { niveau = 'forte'; elements.unshift(`preuve : ${libelleRegle(preuve.regle)}`); }
    else if (vus.size || menace) {
      niveau = points >= 4.5 ? 'forte' : points >= 2 || (sources.size >= 2 && points > 0) ? 'moyenne' : 'faible';
      if (plafond && CONFIANCES.indexOf(niveau) > CONFIANCES.indexOf(plafond)) niveau = plafond;
    }
    return { niveau, points: Math.round(points * 10) / 10, elements, sources: [...sources].sort(), debut: Number.isFinite(debut) ? debut : null, preuve: Boolean(preuve) };
  }
  const libelleRegle = r => String(r).replace(/^(sigma|detecteur|fait)\./, '').replaceAll('_', ' ');
  function libelleIndice(v) {
    if (v.regle === 'detecteur.premiere_apparition') return v.cles.map(k => (k.startsWith('pays:') ? `pays inédit (${k.slice(5)})` : 'appareil inédit')).join(', ') || 'première apparition';
    return LIBELLES[v.regle] || libelleRegle(v.regle);
  }

  // ---------- écriture ----------
  function noter(type, detail) { store.own('vigie_dossier', { emetteur: 'vigie/dossiers.js', detail }); }

  // Ajoute des entités ; rend celles qui sont nouvelles (pour leur rattachement rétroactif).
  function ajouterEntites(id, items, via = null) {
    const t = now();
    let n = q.nbEntites.get(id);
    const nouvelles = [];
    for (const e of items) {
      if (!e?.key) continue;
      const deja = q.entite.get(id, e.kind, propre(e.key));
      if (!deja && n >= MAX_ENTITES) { q.tronquer.run(id); continue; }
      q.ajouterEntite.run({ dossier_id: id, kind: e.kind, key: propre(e.key), role: e.role || (ACTEURS.has(e.kind) ? 'acteur' : 'cible'), force: e.force || 'moyen', via: e.via ?? via, ajoute_a: t });
      if (!deja) { n += 1; nouvelles.push(q.entite.get(id, e.kind, propre(e.key))); }
    }
    return nouvelles;
  }
  // Entités entrées dans un dossier déjà ouvert : rattachement rétroactif (5.5, « chaque fois qu'une entité entre »).
  const entrer = (id, items, via) => { const nouvelles = ajouterEntites(id, items, via).filter(e => e && e.role === 'acteur' && e.force !== 'faible'); if (nouvelles.length) retro(id, nouvelles); };
  function ajouterSignal(id, s) {
    if (q.nbSignaux.get(id) >= MAX_SIGNAUX) { q.tronquer.run(id); return false; }
    const ajoute = q.ajouterSignal.run({ dossier_id: id, seq: s.seq ?? null, regle: s.regle, survenu_a: s.survenu_a, nature: s.nature, phase: s.phase ?? null, marqueurs: s.marqueurs || null,
      points: s.points ?? null, source: s.source ?? null, gravite: s.gravite ?? null, entite_kind: s.entite_kind ?? null, entite_key: s.entite_key ?? null, sub: s.sub ?? null,
      session: s.session ?? null, ip: s.ip ?? null, objet: s.objet ?? null, alerte_id: s.alerte_id ?? null, cle: s.cle ?? null, donnees: s.donnees ?? null });
    if (!ajoute.changes) return false;           // signal attribué à l'autre dossier lors d'une scission
    q.toucher.run(s.survenu_a, id);
    if ((s.nature === 'jalon' || s.nature === 'preuve') && (s.phase || s.marqueurs)) q.jalon.run({ id, t: s.survenu_a });
    return true;
  }
  // Fait (événement ordinaire) → entrée de dossier.
  const fait = row => ({ seq: row.seq, regle: `fait.${row.type}`, survenu_a: row.survenu_a ?? row.recu_a, nature: 'fait', phase: FAITS[row.type] ?? null, sub: row.sub, session: row.session,
    ip: row.ip, objet: objetDe(row), donnees: row.type.startsWith('sensitive_') ? JSON.stringify(donneesDe(row.detail)) : null,
    gravite: row.severity, source: String(row.composant || '').startsWith('site') ? 'site' : row.composant === 'zitadel' ? 'zitadel' : null,
    points: row.type === 'session_context_change' && row.severity === 'moyen' ? POINTS['fait.session_context_change'] : null });

  // ---------- recherche, ouverture, fusion ----------
  function trouver(acteurs, { jalon = false, serveur = null } = {}) {
    const ids = new Set(), poids = new Map();
    const t = now();
    for (const a of acteurs) {
      if (a.role !== 'acteur' || !ACTEURS.has(a.kind)) continue;
      if (a.kind === 'ip' && exclue(a.key).lookup) continue;
      for (const d of q.trouver.all(a.kind, a.key, jalon ? t - RECIDIVE : Number.MAX_SAFE_INTEGER)) if (d.statut !== 'clos' || jalon) {
        ids.add(d.id);
        poids.set(d.id, Math.max(poids.get(d.id) || 0, ['compte', 'session', 'acces'].includes(a.kind) ? 2 : 1));
      }
    }
    if (serveur) { ids.add(serveur); if (!poids.has(serveur)) poids.set(serveur, 0); }
    // Seulement quand plusieurs dossiers se rencontrent : une scission prévaut sur l'ancienne liaison.
    // Compte/session/accès avant adresse/réseau ; à égalité, le plus ancien. Aucun coût par événement de rafale.
    if (ids.size > 1) {
      const json = JSON.stringify([...ids]);
      for (const { gauche, droite } of q.separations.all(json, json)) {
        if (ids.has(gauche) && ids.has(droite)) ids.delete(poids.get(droite) > poids.get(gauche) ? gauche : droite);
      }
    }
    return [...ids].sort((a, b) => a - b);
  }
  function pisteDe(seed, acteurs) {
    if (acteurs.some(a => a.kind === 'compte' || a.kind === 'session')) return 'identite';
    if (seed.kind === 'acces' || acteurs.some(a => a.kind === 'acces')) return 'invite';
    if (seed.kind === 'cible') return seed.key.startsWith('vigie:') || seed.key === 'site:battement' ? 'surveillance' : 'serveur';
    return 'externe';
  }
  function ouvrir(seed, acteurs, item, raison) {
    const t = now();
    const piste = pisteDe(seed, acteurs);
    const id = Number(q.inserer.run(piste, seed.kind, seed.key, t, t).lastInsertRowid);
    ajouterEntites(id, [{ ...seed, role: ACTEURS.has(seed.kind) ? 'acteur' : 'cible', force: 'graine' }, ...acteurs.filter(a => !(a.kind === seed.kind && a.key === seed.key))]);
    if (item) ajouterSignal(id, item);
    noter('ouvert', { action: 'ouvert', id, piste, graine: seed, raison });
    retro(id);
    return id;
  }
  function fusionner(ids, par = 'Vigie') {
    const [garde, ...autres] = [...new Set(ids)].sort((a, b) => a - b);
    for (const autre of autres) {
      db.prepare(`INSERT OR IGNORE INTO dossier_entites (dossier_id, kind, key, role, force, via, ajoute_a, detache_a)
        SELECT ?, kind, key, role, force, via, ajoute_a, detache_a FROM dossier_entites WHERE dossier_id = ?`).run(garde, autre);
      db.prepare(`INSERT OR IGNORE INTO dossier_signaux (dossier_id, seq, regle, survenu_a, nature, phase, marqueurs, points, source, gravite, entite_kind, entite_key, sub, session, ip, objet, promu, alerte_id, cle, donnees)
        SELECT ?, seq, regle, survenu_a, nature, phase, marqueurs, points, source, gravite, entite_kind, entite_key, sub, session, ip, objet, promu, alerte_id, cle, donnees FROM dossier_signaux WHERE dossier_id = ?`).run(garde, autre);
      db.prepare('UPDATE alerts SET dossier_id = ? WHERE dossier_id = ?').run(garde, autre);
      const a = q.dossier.get(autre);
      db.prepare(`UPDATE dossiers SET ouvert_a = MIN(ouvert_a, ?), derniere = MAX(derniere, ?), dernier_jalon = MAX(COALESCE(dernier_jalon, 0), COALESCE(?, 0)),
        chaine_signalee = MAX(chaine_signalee, ?), tronque = MAX(tronque, ?) WHERE id = ?`).run(a.ouvert_a, a.derniere, a.dernier_jalon, a.chaine_signalee, a.tronque, garde);
      db.prepare("UPDATE dossiers SET fusionne_dans = ?, statut = 'clos', derniere = ? WHERE id = ?").run(garde, now(), autre);
      // Une fusion avec un troisième dossier transporte les séparations décidées auparavant : le numéro absorbé
      // cesse d'être une cible de recherche, la séparation doit donc suivre le numéro conservé.
      for (const s of db.prepare('SELECT gauche, droite FROM dossier_separations WHERE gauche = ? OR droite = ?').all(autre, autre)) {
        const voisin = s.gauche === autre ? s.droite : s.gauche;
        if (voisin !== garde) db.prepare('INSERT OR IGNORE INTO dossier_separations (gauche, droite) VALUES (?, ?)').run(Math.min(garde, voisin), Math.max(garde, voisin));
      }
      db.prepare('DELETE FROM dossier_separations WHERE gauche = ? OR droite = ?').run(autre, autre);
      db.prepare(`INSERT OR IGNORE INTO dossier_signaux_ecartes (dossier_id, seq, regle, survenu_a, entite_kind, entite_key)
        SELECT ?, seq, regle, survenu_a, entite_kind, entite_key FROM dossier_signaux_ecartes WHERE dossier_id = ?`).run(garde, autre);
      // Les signaux réunis appartiennent de nouveau au dossier : leur éventuel complément d'alerte ne doit plus
      // être bloqué par l'exclusion créée lors de la scission.
      db.prepare(`DELETE FROM dossier_signaux_ecartes WHERE dossier_id = ? AND EXISTS
        (SELECT 1 FROM dossier_signaux s WHERE s.dossier_id = dossier_signaux_ecartes.dossier_id
          AND COALESCE(s.seq, 0) = dossier_signaux_ecartes.seq AND s.regle = dossier_signaux_ecartes.regle
          AND (s.seq IS NOT NULL OR (s.survenu_a = dossier_signaux_ecartes.survenu_a
            AND COALESCE(s.entite_kind, '') = dossier_signaux_ecartes.entite_kind
            AND COALESCE(s.entite_key, '') = dossier_signaux_ecartes.entite_key)))`).run(garde);
      noter('fusionne', { action: 'fusionne', id: garde, absorbe: autre, par });
    }
    return garde;
  }

  // Rattachement rétroactif (5.5) d'un dossier, par ses comptes, ses adresses et ses accès (toutes ses entités, ou
  // seulement celles qui viennent d'entrer).
  function retro(id, seules = null) {
    const d = q.dossier.get(id);
    const t0 = d.ouvert_a;
    const ents = seules || q.entites.all(id);
    for (const e of ents.filter(x => x.kind === 'compte')) {
      for (const s of q.projetesSub.all(e.key, e.key, t0 - 24 * H)) rattacherProjete(id, s);
      for (const row of q.faitsSub.all(e.key, t0 - 24 * H)) { ajouterSignal(id, fait(row)); ajouterEntites(id, acteursDe(row).filter(a => a.kind !== 'ip' || !exclue(a.key).tout), `compte:${e.key}`); }
      // Adresses de connexion du compte sur 72 h : lien faible (jamais pour retrouver un dossier).
      for (const ip of q.adressesSub.all(e.key, t0 - 72 * H, t0 + 1)) if (!exclue(ip).faible) ajouterEntites(id, [{ kind: 'ip', key: ip, role: 'acteur', force: 'faible' }], `compte:${e.key}`);
    }
    for (const e of (seules || q.entites.all(id)).filter(x => x.kind === 'ip')) {
      for (const s of q.projetesIp.all(e.key, e.key, t0 - 7 * J)) {
        if (s.phase === 1 || s.survenu_a >= t0 - 24 * H) rattacherProjete(id, s);
      }
    }
    for (const e of (seules || q.entites.all(id)).filter(x => x.kind === 'acces' || x.kind === 'reseau')) {
      for (const s of q.projetesEntite.all(e.kind === 'acces' ? 'acces' : 'reseau', e.key, t0 - 7 * J)) rattacherProjete(id, s);
    }
  }
  const projeteVersSignal = s => ({ seq: s.seq, regle: s.regle, survenu_a: s.survenu_a, nature: s.nature, phase: s.phase, marqueurs: s.marqueurs, points: s.points, source: s.source,
    gravite: s.gravite, entite_kind: s.entite_kind, entite_key: s.entite_key, sub: s.sub, session: s.session, ip: s.ip, cle: s.cle });
  function rattacherProjete(id, s) {
    ajouterSignal(id, projeteVersSignal(s));
    if (s.entite_kind && ACTEURS.has(s.entite_kind) && s.entite_kind !== 'ip') ajouterEntites(id, [{ kind: s.entite_kind, key: s.entite_key, role: 'acteur', force: 'moyen' }]);
  }

  // ---------- recalcul (4.4, 4.8, 6) ----------
  function recalculer(id) {
    const d = q.dossier.get(id);
    if (!d || d.fusionne_dans) return null;
    const ents = q.entites.all(id);
    const comptes = ents.filter(e => e.kind === 'compte').map(e => e.key);
    let sig = q.signaux.all(id);
    const debut = Math.min(d.ouvert_a, ...sig.map(s => s.survenu_a));
    // Confiance : la plus forte des comptes ; preuves du dossier (accès de galerie, compte) ; sinon menaces de la graine.
    let conf = { niveau: 'aucune', points: 0, elements: [], sources: [], debut: null, preuve: false };
    for (const c of comptes) {
      const x = confianceCompte(c, debut - 24 * H);
      if (CONFIANCES.indexOf(x.niveau) > CONFIANCES.indexOf(conf.niveau) || (x.niveau === conf.niveau && x.points > conf.points)) conf = x;
    }
    const preuves = sig.filter(s => s.nature === 'preuve');
    if (preuves.length && conf.niveau !== 'forte' && !comptes.length) {
      conf = { ...conf, niveau: 'forte', preuve: true, debut: Math.min(...preuves.map(p => p.survenu_a)), elements: [`preuve : ${libelleRegle(preuves[0].regle)}`, ...conf.elements] };
    }
    if (conf.niveau === 'aucune' && d.graine_kind === 'ip' && menaces(d.graine_key).length) conf = { ...conf, niveau: 'faible', elements: ['adresse sur une liste de menaces'] };
    // Faits devenus jalons sous un accès douteux (4.6) : une fois promus, ils le restent (ce qui a eu lieu sous un
    // accès douteux reste noté comme tel, même après une identité confirmée).
    if (CONFIANCES.indexOf(conf.niveau) >= 2 && conf.debut != null) {
      const tA = conf.debut - SEUILS.avant_acces_ms;
      const faits = sig.filter(s => s.nature === 'fait');
      const apres = type => faits.filter(s => s.regle === `fait.${type}` && s.survenu_a >= tA);
      const forte = conf.niveau === 'forte';
      const lectures = apres('sensitive_read').filter(s => { const d = parse(s.donnees); return !d?.liste || tailleListe(d) > 0; });
      const promus = [];
      // Étude 4.6 : huit fiches dans une même session ; les événements anciens sans session restent groupés
      // entre eux. Un compte qui ouvre deux sessions n'additionne pas leurs lectures pour franchir ce seuil.
      const sessions = new Map();
      for (const s of lectures) { const groupe = sessions.get(s.session) || []; groupe.push(s); sessions.set(s.session, groupe); }
      for (const groupe of sessions.values()) {
        const fiches = new Set(groupe.filter(s => !parse(s.donnees)?.liste).map(s => s.objet || s.seq)).size;
        const liste = Math.max(0, ...groupe.map(s => tailleListe(parse(s.donnees))));
        if (forte || Math.max(fiches, liste) >= SEUILS.lectures_moyenne) promus.push(...groupe);
      }
      promus.push(...apres('sensitive_export'));
      const suppr = apres('sensitive_delete');
      if (forte || suppr.length >= SEUILS.suppressions_moyenne) promus.push(...suppr);
      promus.push(...faits.filter(s => ['fait.authn_login_fail', 'fait.zitadel_echec'].includes(s.regle) && s.survenu_a >= conf.debut - SEUILS.echecs_avant_ms && s.survenu_a <= conf.debut + SEUILS.avant_acces_ms));
      for (const s of promus) { q.promouvoir.run(s.id); q.jalon.run({ id, t: s.survenu_a }); }
      if (promus.length) sig = q.signaux.all(id);
    }
    // Progression et cohérence : jalons, preuves et faits promus ; l'accès compte dès que la confiance est moyenne.
    const premieres = new Map();
    const voir = (n, t) => { if (n && (!premieres.has(n) || t < premieres.get(n))) premieres.set(n, t); };
    for (const s of sig) if ((s.nature === 'jalon' || s.nature === 'preuve') && s.phase) voir(s.phase, s.survenu_a);
    for (const s of sig) if (s.regle === 'detecteur.pivot_identifiants' && CONFIANCES.indexOf(conf.niveau) >= 2) voir(3, s.survenu_a);
    if (CONFIANCES.indexOf(conf.niveau) >= 2 && conf.debut != null) voir(3, conf.debut);
    const chaine = coherence(premieres);
    const phaseMax = premieres.size ? Math.max(...premieres.keys()) : null;
    // Une suite de trois phases ou plus, dont l'accès, monte la confiance d'un cran (4.8).
    let niveau = conf.niveau;
    const suite = chaine.length >= 3 && chaine.includes(3);
    if (suite && niveau !== 'forte') { niveau = CONFIANCES[Math.max(2, CONFIANCES.indexOf(niveau) + 1)]; conf = { ...conf, elements: [...conf.elements, `${chaine.length} phases dans l’ordre`] }; }
    const marqueurs = new Set(sig.flatMap(s => parse(s.marqueurs)).filter(m => typeof m === 'string'));
    const dissimulation = marqueurs.has('dissimulation');
    // Enjeu (6.1).
    const objets = new Set(sig.filter(s => s.objet && PERSONNELS.has(String(s.objet).split(':')[0])).map(s => s.objet));
    const categories = new Set(sig.flatMap(s => parse(s.donnees)?.categorie || []));
    const effectif = Math.max(objets.size, ...sig.map(s => tailleListe(parse(s.donnees))));
    const exportsPerso = sig.filter(s => s.regle === 'fait.sensitive_export' && ((s.objet && PERSONNELS.has(String(s.objet).split(':')[0])) || parse(s.donnees)?.categorie?.length));
    const exfil = sig.some(s => (s.nature === 'jalon' || s.nature === 'preuve') && s.phase === 7);
    const douteux = CONFIANCES.indexOf(niveau) >= 2;
    const enjeuEl = [];
    let enjeu = 'ordinaire';
    const monter = (e, txt) => { if (ENJEUX.indexOf(e) > ENJEUX.indexOf(enjeu)) enjeu = e; if (txt) enjeuEl.push(txt); };
    if (objets.size) monter('personnel', `${objets.size} objet${objets.size > 1 ? 's' : ''} personnel${objets.size > 1 ? 's' : ''} lu${objets.size > 1 ? 's' : ''} ou exporté${objets.size > 1 ? 's' : ''}`);
    if (ents.some(e => e.kind === 'acces')) monter('personnel', 'accès de galerie privée');
    if (categories.size) monter('personnel', [...categories].map(c => CATEGORIES_DONNEES[c]).join(', '));
    if (effectif >= 10) monter('sensible', 'au moins 10 objets personnels');
    if (['mineur', 'accord_signe', 'localisation'].some(c => categories.has(c))) monter('sensible');
    if (exportsPerso.length) monter('sensible', 'export de données personnelles');
    if (sig.some(s => DROITS.has(s.regle))) monter('sensible', 'droits d’administrateur en jeu');
    if (douteux && (exportsPerso.some(s => s.promu) || (exfil && (objets.size || categories.size || d.piste === 'invite')))) monter('critique', 'données personnelles sorties sous un accès douteux');
    const crit = sig.find(s => CRITIQUES.has(s.regle));
    if (crit) monter('critique', crit.regle === 'sigma.role_hors_application' ? 'rôle donné hors de l’application' : 'face publique du site changée');
    // Gravité (6.2).
    const modifs = [];
    let gravite = phaseMax ? GRILLE[bande(phaseMax)][Math.max(0, CONFIANCES.indexOf(niveau) - 1)] : 'info';
    if (enjeu === 'ordinaire' && gravite !== 'info') { gravite = cran(gravite, -1); modifs.push('enjeu ordinaire (−1)'); }
    if (enjeu === 'critique') { gravite = cran(gravite, 1); modifs.push('enjeu critique (+1)'); }
    if (dissimulation) { gravite = cran(gravite, 1); modifs.push('dissimulation pendant le dossier (+1)'); }
    const alertes = q.alertesDe.all(id);
    const pire = alertes.reduce((m, a) => (GRAVITES.indexOf(a.gravite) > GRAVITES.indexOf(m?.gravite) ? a : m), null);
    if (pire && GRAVITES.indexOf(pire.gravite) > GRAVITES.indexOf(gravite)) { gravite = pire.gravite; modifs.push(`plancher : alerte #${pire.id} ${pire.gravite}`); }
    // Piste : un compte entré dans un dossier externe en fait un dossier d'identité.
    const piste = comptes.length ? 'identite' : ents.some(e => e.kind === 'acces') ? 'invite' : d.piste;
    const non = phaseMax ? PHASES.filter(p => p.n < phaseMax && !premieres.has(p.n)).map(p => p.nom.toLowerCase()) : [];
    const explication = expliquer({ d, ents, comptes, gravite, phaseMax, chaine, non, niveau, conf, enjeu, enjeuEl, modifs, objets, marqueurs });
    q.maj.run({ id, piste, phase_max: phaseMax, coherence: chaine.length, confiance: niveau, enjeu, gravite, dissimulation: dissimulation ? 1 : 0, explication: JSON.stringify(explication) });
    if (GRAVITES.indexOf(gravite) > GRAVITES.indexOf(d.gravite)) noter('aggrave', { action: 'aggrave', id, gravite, avant: d.gravite });
    // Chaîne d'attaque (DS23), calculée sur le dossier : une fois par dossier.
    if (suite && !d.chaine_signalee) {
      db.prepare('UPDATE dossiers SET chaine_signalee = 1 WHERE id = ?').run(id);
      const acteur = ents.find(e => e.kind === 'compte') || ents.find(e => e.force === 'graine') || ents[0];
      hooks.chaine?.(acteur ? { kind: acteur.kind === 'cible' ? acteur.key.split(':')[0] : acteur.kind, key: acteur.kind === 'cible' ? acteur.key.split(':').slice(1).join(':') : acteur.key } : null, id, chaine);
    }
    return { gravite, niveau, enjeu, phaseMax, chaine };
  }

  function expliquer({ d, ents, comptes, gravite, phaseMax, chaine, non, niveau, conf, enjeu, enjeuEl, modifs, objets, marqueurs }) {
    const G = gravite[0].toUpperCase() + gravite.slice(1);
    const suite = chaine.map(n => NOM_PHASE[n].toLowerCase());
    const prog = phaseMax ? `${NOM_PHASE[phaseMax]} atteinte${chaine.length >= 2 ? `, ${chaine.length} phases dans l’ordre (${suite.join(' → ')})` : ''}${non.length ? ` ; non observé : ${non.join(', ')}` : ''}` : 'aucune phase atteinte';
    const conf3 = `Confiance ${niveau}${conf.elements.length ? ` : ${conf.elements.join(', ')}` : ''}${conf.sources.length >= 2 ? ` (${conf.sources.length} sources)` : ''}`;
    const enj = `Enjeu ${enjeu}${enjeuEl.length ? ` : ${enjeuEl.join(', ')}` : ''}`;
    const acteur = comptes[0] ? `Compte ${comptes[0]}` : (() => { const g = ents.find(e => e.force === 'graine') || ents[0]; return g ? `${{ ip: 'Adresse', reseau: 'Réseau', acces: 'Accès de galerie', session: 'Session', cible: 'Cible' }[g.kind] || g.kind} ${g.kind === 'acces' ? g.key.slice(6) : g.key}` : `Dossier ${d.id}`; })();
    const titre = `${acteur} : ${suite.length ? suite.join(' → ') : 'sans phase'}${objets.size ? ` (${objets.size} objet${objets.size > 1 ? 's' : ''} personnel${objets.size > 1 ? 's' : ''})` : ''}`;
    return { titre, lignes: [`${G} · ${prog}`, conf3, enj], modificateurs: modifs, marqueurs: [...marqueurs].map(m => MARQUEURS[m] || m), chaine, non_observees: non, points_confiance: conf.points };
  }

  // ---------- entrées depuis le moteur ----------
  // Signal projeté (noté : déjà dédoublonné par le moteur, une fois par règle, entité et 10 minutes).
  function surSignal({ regle, entite, gravite, sources = [], detail = {}, projection }, row) {
    if (!projection) return;
    const t = row ? (row.survenu_a ?? row.recu_a ?? now()) : now();
    const e = entiteDossier(entite);
    const d = parse(row?.detail);
    let cle = null;
    if (regle === 'detecteur.premiere_apparition') cle = JSON.stringify((detail.nouveau || []).map(x => (String(x).startsWith('pays ') ? `pays:${String(x).slice(5)}` : `appareil:${d.appareil ?? '?'}`)));
    else if (regle === 'detecteur.heure_inhabituelle') cle = JSON.stringify([`heure:${detail.heure_utc}`]);
    const sub = row?.sub ?? (e?.kind === 'compte' ? e.key : null);
    const nature = projection.nature;
    const s = { seq: row?.seq ?? null, regle, survenu_a: t, nature, phase: projection.n, marqueurs: projection.marqueurs.length ? JSON.stringify(projection.marqueurs) : null,
      points: POINTS[regle] ?? null, source: sources[0] ?? null, gravite, entite_kind: e?.kind ?? null, entite_key: e?.key ?? null, sub, session: row?.session ?? null, ip: row?.ip ?? null, cle };
    q.projeter.run(s);
    if (sub) cache.delete(sub);
    // Acteurs : l'entité du signal (acteur, ou cible si c'est un compte visé par un autre), ceux de l'événement, et ceux
    // des événements d'une corrélation (adresse d'une attaque reliée à une sortie réseau).
    const acteurs = acteursDe(row);
    for (const seq of (Array.isArray(detail.evenements) ? detail.evenements.slice(-20) : [])) { const r = q.evenements.get(seq); if (r && r.seq !== row?.seq) acteurs.push(...acteursDe(r)); }
    if (e && ACTEURS.has(e.kind) && !acteurs.some(a => a.kind === e.kind && a.key === e.key)) acteurs.push({ kind: e.kind, key: e.key, role: 'acteur', force: e.kind === 'ip' && exclue(e.key).tout ? null : 'moyen' });
    const cibles = e && !ACTEURS.has(e.kind) ? [{ kind: e.kind, key: e.key, role: 'cible', force: 'moyen' }] : [];
    const propres = acteurs.filter(a => a.force);
    const estJalon = s.nature === 'jalon' || s.nature === 'preuve' || projection.jalon_acces;
    let ids = trouver(propres, { jalon: estJalon, serveur: e?.kind === 'cible' && SERVEUR.test(e.key) ? q.serveur.get(t - H) : null });
    // Dissimulation sans acteur : à tous les dossiers ouverts (6.2) ; elle n'en ouvre pas (son alerte, si elle en a une,
    // ouvre un dossier « surveillance »).
    if (!propres.some(a => a.role === 'acteur') && projection.marqueurs.includes('dissimulation') && !projection.phase) {
      for (const id of q.ouverts.all()) { ajouterSignal(id, s); recalculer(id); }
      return;
    }
    if (ids.length) {
      const id = ids.length > 1 ? fusionner(ids) : ids[0];
      ajouterSignal(id, s);
      entrer(id, [...propres.filter(a => !(a.kind === 'ip' && exclue(a.key).tout)), ...cibles]);
      recalculer(id);
      return;
    }
    // Ouverture sans alerte (5.3, 2) : un jalon d'accès ou plus avancé sur un compte dont la confiance est moyenne.
    if (sub && estJalon && (projection.n ?? 0) >= 3) {
      const c = confianceCompte(sub, t - 24 * H, t);
      if (CONFIANCES.indexOf(c.niveau) >= 2) {
        const seed = propres.find(a => a.kind === 'compte') || { kind: 'compte', key: sub };
        const id = ouvrir({ kind: 'compte', key: seed.key }, [...propres, ...cibles], s, `${regle} sous une confiance ${c.niveau}`);
        recalculer(id);
      }
    }
  }

  // Alerte ouverte ou aggravée par le moteur : rattachée, ou ouvre un dossier.
  function surAlerte({ id: alerteId, regle, entite, gravite }, row) {
    const e = entiteDossier(entite);
    if (!e) return;
    const t = row ? (row.survenu_a ?? row.recu_a ?? now()) : now();
    const acteurs = acteursDe(row);
    if (ACTEURS.has(e.kind) && !acteurs.some(a => a.kind === e.kind && a.key === e.key)) acteurs.push({ kind: e.kind, key: e.key, role: 'acteur', force: 'moyen' });
    const propres = acteurs.filter(a => !(a.kind === 'ip' && exclue(a.key).tout));
    const item = { seq: row?.seq ?? -alerteId, regle, survenu_a: t, nature: 'fait', phase: null, gravite, entite_kind: e.kind, entite_key: e.key, sub: row?.sub, session: row?.session,
      ip: row?.ip, alerte_id: alerteId };
    // Le signal de la même règle sur le même événement, s'il a été projeté, porte la phase.
    const p = row?.seq != null ? db.prepare('SELECT * FROM signaux_projetes WHERE seq = ? AND regle = ? ORDER BY id DESC LIMIT 1').get(row.seq, regle) : null;
    const entree = p ? { ...projeteVersSignal(p), alerte_id: alerteId } : item;
    let ids = trouver(propres, { jalon: true, serveur: e.kind === 'cible' && SERVEUR.test(e.key) ? q.serveur.get(t - H) : null });
    let id;
    if (ids.length) {
      id = ids.length > 1 ? fusionner(ids) : ids[0];
      ajouterSignal(id, entree);
      entrer(id, [...propres, ...(ACTEURS.has(e.kind) ? [] : [{ kind: e.kind, key: e.key, role: 'cible', force: 'moyen' }])]);
    } else {
      const seed = propres.find(a => a.kind === 'compte') || (ACTEURS.has(e.kind) ? { kind: e.kind, key: e.key } : e);
      id = ouvrir({ kind: seed.kind, key: seed.key }, [...propres, ...(ACTEURS.has(e.kind) ? [] : [{ kind: e.kind, key: e.key, role: 'cible', force: 'moyen' }])], entree, `alerte #${alerteId} (${regle})`);
    }
    q.lierAlerte.run(id, alerteId, id);
    recalculer(id);
  }

  // Alerte déjà rattachée qui dure sans s'aggraver : le dossier avance sa date (une fois par minute au plus), sans recalcul.
  const dure = lru(5_000);                         // alerte → instant de la dernière date avancée
  function alerteDure(alerteId, row) {
    const t = row ? (row.survenu_a ?? row.recu_a ?? now()) : now();
    if (t - (dure.get(alerteId) ?? -Infinity) < 60e3) return;
    dure.set(alerteId, t);
    const a = db.prepare('SELECT dossier_id FROM alerts WHERE id = ?').get(alerteId);
    if (a?.dossier_id) q.toucher.run(t, a.dossier_id);
  }

  // Fait ordinaire : rattaché aux dossiers de ses acteurs ; changement de session « moyen » : un indice ; lectures,
  // export ou suppressions sous un accès douteux : ouverture (4.6).
  const LECTURES = new Set(['sensitive_read', 'sensitive_export', 'sensitive_delete']);
  function surFait(row) {
    if (!Object.hasOwn(FAITS, row.type)) return;
    const t = row.survenu_a ?? row.recu_a ?? now();
    if (row.type === 'session_context_change' && row.severity === 'moyen' && row.sub) {
      q.projeter.run({ seq: row.seq, regle: 'fait.session_context_change', survenu_a: t, nature: 'indice', phase: 3, marqueurs: null, points: POINTS['fait.session_context_change'],
        source: 'site', gravite: row.severity, entite_kind: 'session', entite_key: row.session ?? null, sub: row.sub, session: row.session ?? null, ip: row.ip ?? null, cle: null });
      cache.delete(row.sub);
    }
    const acteurs = acteursDe(row);
    const ids = trouver(acteurs);
    if (ids.length) {
      const id = ids.length > 1 ? fusionner(ids) : ids[0];
      ajouterSignal(id, fait(row));
      entrer(id, acteurs);
      recalculer(id);
      return;
    }
    if (!row.sub || !LECTURES.has(row.type)) return;
    const donnees = row.type === 'sensitive_read' ? donneesDe(row.detail) : null;
    if (donnees?.liste && !tailleListe(donnees)) return;
    const c = confianceCompte(row.sub, t - 24 * H, t);
    if (CONFIANCES.indexOf(c.niveau) < 2 || c.debut == null) return;
    const lus = q.lecturesSub.all(row.sub, c.debut - SEUILS.avant_acces_ms).map(x => ({ type: x.type, session: x.session, o: objetDe(x), donnees: donneesDe(x.detail) }));
    const lectures = lus.filter(x => x.type === 'sensitive_read' && x.session === (row.session ?? null));
    const n = Math.max(new Set(lectures.filter(x => !x.donnees?.liste).map(x => x.o)).size, 0, ...lectures.map(x => tailleListe(x.donnees)));
    const ok = c.niveau === 'forte' || lus.some(x => x.type === 'sensitive_export') || n >= SEUILS.lectures_moyenne
      || lus.filter(x => x.type === 'sensitive_delete').length >= SEUILS.suppressions_moyenne;
    if (!ok) return;
    const id = ouvrir({ kind: 'compte', key: String(row.sub) }, acteurs, fait(row), `${row.type} sous une confiance ${c.niveau}`);
    recalculer(id);
  }

  // ---------- cycle de vie, purge ----------
  function tick() {
    const t = now();
    const dormir = db.prepare("SELECT id FROM dossiers WHERE statut = 'ouvert' AND fusionne_dans IS NULL AND COALESCE(dernier_jalon, ouvert_a) < ? LIMIT 500").pluck().all(t - SOMMEIL);
    for (const id of dormir) { db.prepare("UPDATE dossiers SET statut = 'sommeil' WHERE id = ?").run(id); noter('sommeil', { action: 'sommeil', id }); }
    const clore = db.prepare("SELECT id FROM dossiers WHERE statut = 'sommeil' AND fusionne_dans IS NULL AND COALESCE(dernier_jalon, ouvert_a) < ? LIMIT 500").pluck().all(t - SOMMEIL - CLOTURE);
    for (const id of clore) {
      db.prepare("UPDATE dossiers SET statut = 'clos', traite_par = 'Vigie (clôture automatique)', traite_a = ?, note = 'sans suite : 14 jours en sommeil' WHERE id = ?").run(t, id);
      noter('clos', { action: 'clos', id, classement: 'sans_suite' });
    }
    return { sommeil: dormir.length, clos: clore.length };
  }
  const masquer = ip => (String(ip).includes(':') ? `${String(ip).split(':').slice(0, 3).join(':')}::/48` : String(ip).replace(/\.\d+$/, '.0/24'));
  function purge() {
    const t = now();
    db.prepare('DELETE FROM signaux_projetes WHERE survenu_a < ?').run(t - 30 * J);
    db.transaction(() => {
      const vieux = db.prepare("SELECT id FROM dossiers WHERE statut = 'clos' AND derniere < ? AND COALESCE(classement, '') != 'incident'").pluck().all(t - 395 * J);
      for (const id of vieux) {
        db.prepare('DELETE FROM dossier_signaux WHERE dossier_id = ?').run(id);
        db.prepare('DELETE FROM dossier_entites WHERE dossier_id = ?').run(id);
        db.prepare('UPDATE alerts SET dossier_id = NULL WHERE dossier_id = ?').run(id);
        db.prepare('UPDATE dossiers SET fusionne_dans = NULL WHERE fusionne_dans = ?').run(id);
        db.prepare('DELETE FROM dossiers WHERE id = ?').run(id);
      }
      // Adresses gardées comme les événements (183 jours, D38) : au-delà, masquées dans tout dossier (un incident est gardé
      // pour le registre des violations, les autres sont effacés 13 mois après leur clôture, comme les alertes).
      const anciens = db.prepare("SELECT id FROM dossiers WHERE derniere < ? AND id IN (SELECT dossier_id FROM dossier_entites WHERE kind = 'ip' AND key NOT LIKE '%/%' UNION SELECT dossier_id FROM dossier_signaux WHERE ip IS NOT NULL) LIMIT 1000").pluck().all(t - store.retentionDays * J);
      for (const id of anciens) {
        for (const e of db.prepare("SELECT key FROM dossier_entites WHERE dossier_id = ? AND kind = 'ip' AND key NOT LIKE '%/%'").pluck().all(id)) {
          db.prepare("UPDATE OR IGNORE dossier_entites SET key = ? WHERE dossier_id = ? AND kind = 'ip' AND key = ?").run(masquer(e), id, e);
          db.prepare("DELETE FROM dossier_entites WHERE dossier_id = ? AND kind = 'ip' AND key = ?").run(id, e);
        }
        db.prepare("UPDATE dossier_signaux SET ip = NULL WHERE dossier_id = ? AND ip IS NOT NULL").run(id);
        db.prepare("UPDATE dossier_signaux SET entite_key = ? WHERE dossier_id = ? AND entite_kind = 'ip'").run('(masquée)', id);
      }
    })();
  }

  // ---------- gestes de l'analyste (console, ligne de commande) ----------
  const exiger = id => { const d = q.dossier.get(id); if (!d) throw new Error(`dossier inconnu : ${id}`); if (d.fusionne_dans) throw new Error(`dossier ${id} fusionné dans le dossier ${d.fusionne_dans}`); return d; };
  const motifDe = m => { const s = String(m || '').trim().slice(0, 300); if (!s) throw new Error('motif obligatoire'); return s; };
  function prendre(id, par) {
    exiger(id);
    db.prepare("UPDATE dossiers SET statut = 'en_cours', traite_par = ?, traite_a = ? WHERE id = ?").run(par, now(), id);
    noter('prise en charge', { action: 'prise en charge', id, par });
  }
  function classer(id, { classement, note = '', par }) {
    if (!CLASSEMENTS.includes(classement)) throw new Error(`classement : ${CLASSEMENTS.join(', ')}`);
    exiger(id);
    const n = String(note || '').trim().slice(0, 500);
    if (classement === 'legitime' && !n) throw new Error('classement « légitime » : motif obligatoire (les indices identiques ne compteront plus pendant 90 jours)');
    db.prepare("UPDATE dossiers SET statut = 'clos', classement = ?, note = ?, traite_par = ?, traite_a = ? WHERE id = ?").run(classement, n, par, now(), id);
    let appr = [];
    if (classement === 'legitime') {
      // Apprentissage (D39) : les indices de ce dossier (pays, appareil, heure) ne comptent plus pour ces comptes pendant
      // 90 jours ; jamais une preuve.
      const jusqua = now() + APPRIS;
      appr = q.signaux.all(id).filter(s => s.nature === 'indice' && s.sub && s.cle).flatMap(s => (parse(s.cle) || []).map(cle => ({ sub: s.sub, cle, jusqua, dossier: id, par })));
      const garde = appris().filter(a => !appr.some(b => b.sub === a.sub && b.cle === a.cle));
      setting.set('dossiers_appris', [...garde, ...appr].slice(-2000));
      for (const a of appr) cache.delete(a.sub);
    }
    noter('classe', { action: 'classe', id, classement, note: n.slice(0, 200), par, appris: appr.length || undefined });
  }
  function detacher(id, kind, key, { motif, par }) {
    exiger(id);
    const m = motifDe(motif);
    const n = db.prepare('UPDATE dossier_entites SET detache_a = ? WHERE dossier_id = ? AND kind = ? AND key = ? AND detache_a IS NULL').run(now(), id, kind, key).changes;
    if (!n) throw new Error(`entité absente du dossier ${id} : ${kind}:${key}`);
    noter('detache', { action: 'detache', id, entite: { kind, key }, motif: m, par });
    return recalculer(id);
  }
  function rattacher(id, kind, key, { par }) {
    exiger(id);
    if (!['ip', 'reseau', 'compte', 'session', 'acces', 'objet', 'cible'].includes(kind)) throw new Error(`entité : ip, reseau, compte, session, acces, objet ou cible`);
    db.prepare('UPDATE dossier_entites SET detache_a = NULL, force = \'manuel\' WHERE dossier_id = ? AND kind = ? AND key = ?').run(id, kind, key);
    ajouterEntites(id, [{ kind, key, role: ACTEURS.has(kind) ? 'acteur' : 'cible', force: 'manuel' }], par);
    noter('rattache', { action: 'rattache', id, entite: { kind, key }, par });
    retro(id);
    return recalculer(id);
  }
  function fusionnerManuel(id, autre, { par }) {
    exiger(id); exiger(autre);
    return db.transaction(() => {
      // Réunir explicitement une scission rétablit ses entités actives, même si le premier dossier gardait leur
      // détachement. Cette exception concerne uniquement la paire séparée par une personne.
      const paire = q.separations.all(JSON.stringify([id, autre]), JSON.stringify([id, autre]));
      if (paire.length) {
        db.prepare(`DELETE FROM dossier_entites WHERE dossier_id IN (?, ?) AND detache_a IS NOT NULL
          AND EXISTS (SELECT 1 FROM dossier_entites e WHERE e.dossier_id IN (?, ?) AND e.kind = dossier_entites.kind
          AND e.key = dossier_entites.key AND e.detache_a IS NULL)`).run(id, autre, id, autre);
        db.prepare('DELETE FROM dossier_separations WHERE gauche = ? AND droite = ?').run(Math.min(id, autre), Math.max(id, autre));
      }
      const garde = fusionner([id, autre], par);
      recalculer(garde);
      return garde;
    })();
  }

  // Scission explicite : les entités et les signaux sont choisis séparément (un signal peut citer plusieurs acteurs).
  // Une alerte et tous ses signaux restent ensemble ; aucun des deux dossiers ne doit être vidé. L'aperçu et le geste
  // emploient le même validateur. Les numéros de signaux sont ceux de dossier_signaux, jamais ceux du journal.
  function preparerScission(id, { entites = [], signaux = [] } = {}) {
    const d = exiger(id);
    if (d.statut === 'clos') throw new Error('un dossier clos ne se scinde pas');
    if (!Array.isArray(entites) || !Array.isArray(signaux) || entites.length > MAX_ENTITES || signaux.length > 2000) throw new Error('sélection de scission invalide');
    const es = q.entites.all(id), ss = q.signaux.all(id);
    const keys = new Set(entites), nums = new Set(signaux.map(Number));
    const choisies = es.filter(e => keys.has(`${e.kind}:${e.key}`)), pris = ss.filter(s => nums.has(s.id));
    if (!choisies.length || choisies.length !== keys.size || choisies.length === es.length) throw new Error('choisissez une partie des entités actives, en laissant une entité dans chaque dossier');
    if (!pris.length || pris.length !== nums.size || pris.length === ss.length) throw new Error('choisissez une partie des signaux, en laissant un signal dans chaque dossier');
    const alertes = [...new Set(pris.map(s => s.alerte_id).filter(Boolean))];
    if (ss.some(s => s.alerte_id && alertes.includes(s.alerte_id) && !nums.has(s.id))) throw new Error('tous les signaux d’une même alerte doivent rester ensemble');
    if (alertes.some(a => !q.alertesDe.all(id).some(x => x.id === a))) throw new Error('une alerte a changé de dossier : rechargez la sélection');
    return { dossier: d, entites: choisies, signaux: pris, alertes, restantes: es.filter(e => !keys.has(`${e.kind}:${e.key}`)),
      restants: ss.filter(s => !nums.has(s.id)) };
  }
  function scinder(id, { entites, signaux, motif, par }) {
    const m = motifDe(motif);
    return db.transaction(() => {
      const p = preparerScission(id, { entites, signaux });
      const graine = p.entites.find(e => e.role === 'acteur') || p.entites[0];
      const nouveau = Number(q.inserer.run(pisteDe(graine, p.entites.filter(e => e.role === 'acteur')), graine.kind, graine.key, now(), now()).lastInsertRowid);
      const copier = db.prepare(`INSERT INTO dossier_entites (dossier_id, kind, key, role, force, via, ajoute_a, detache_a)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const e of [...p.entites, ...p.restantes]) {
        const deplace = p.entites.includes(e);
        copier.run(nouveau, e.kind, e.key, e.role, e === graine ? 'graine' : e.force, e.via, e.ajoute_a, deplace ? null : now());
        if (deplace) db.prepare('UPDATE dossier_entites SET detache_a = ? WHERE dossier_id = ? AND kind = ? AND key = ?').run(now(), id, e.kind, e.key);
      }
      // Les décisions plus anciennes suivent les deux branches d'une nouvelle scission. Les entités déjà
      // détachées et les signaux déjà écartés ne doivent pas rentrer à nouveau par la recherche rétroactive.
      db.prepare(`INSERT INTO dossier_entites (dossier_id, kind, key, role, force, via, ajoute_a, detache_a)
        SELECT ?, kind, key, role, force, via, ajoute_a, detache_a FROM dossier_entites
        WHERE dossier_id = ? AND detache_a IS NOT NULL ON CONFLICT DO NOTHING`).run(nouveau, id);
      db.prepare(`INSERT INTO dossier_signaux_ecartes (dossier_id, seq, regle, survenu_a, entite_kind, entite_key)
        SELECT ?, seq, regle, survenu_a, entite_kind, entite_key FROM dossier_signaux_ecartes WHERE dossier_id = ?`).run(nouveau, id);
      for (const s of db.prepare('SELECT gauche, droite FROM dossier_separations WHERE gauche = ? OR droite = ?').all(id, id)) {
        const voisin = s.gauche === id ? s.droite : s.gauche;
        db.prepare('INSERT INTO dossier_separations (gauche, droite) VALUES (?, ?)').run(Math.min(nouveau, voisin), Math.max(nouveau, voisin));
      }
      const exclusion = db.prepare(`INSERT OR IGNORE INTO dossier_signaux_ecartes
        (dossier_id, seq, regle, survenu_a, entite_kind, entite_key) VALUES (?, ?, ?, ?, ?, ?)`);
      // Les détecteurs périodiques n'ont pas d'événement source. Leur règle ne suffit pas à les identifier :
      // l'heure et l'entité distinguent l'occurrence déplacée des futurs signaux et des autres réseaux.
      const ecarter = (dossier, s) => exclusion.run(dossier, s.seq ?? 0, s.regle,
        s.seq == null ? s.survenu_a : 0, s.seq == null ? s.entite_kind ?? '' : '', s.seq == null ? s.entite_key ?? '' : '');
      for (const s of p.signaux) {
        ecarter(id, s);
        db.prepare('UPDATE dossier_signaux SET dossier_id = ? WHERE id = ?').run(nouveau, s.id);
      }
      for (const s of p.restants) ecarter(nouveau, s);
      for (const a of p.alertes) db.prepare('UPDATE alerts SET dossier_id = ? WHERE id = ?').run(nouveau, a);
      const reste = p.restantes.find(e => e.force === 'graine') || p.restantes.find(e => e.role === 'acteur') || p.restantes[0];
      db.prepare('UPDATE dossiers SET graine_kind = ?, graine_key = ? WHERE id = ?').run(reste.kind, reste.key, id);
      db.prepare('INSERT INTO dossier_separations (gauche, droite) VALUES (?, ?)').run(id, nouveau);
      for (const n of [id, nouveau]) {
        db.prepare(`UPDATE dossiers SET derniere = (SELECT MAX(survenu_a) FROM dossier_signaux WHERE dossier_id = ?),
          dernier_jalon = (SELECT MAX(survenu_a) FROM dossier_signaux WHERE dossier_id = ? AND nature IN ('jalon','preuve') AND (phase IS NOT NULL OR marqueurs IS NOT NULL)),
          chaine_signalee = ? WHERE id = ?`).run(n, n, p.dossier.chaine_signalee, n);
        recalculer(n);
        noter('scinde', { action: 'scinde', id: n, origine: id, nouveau, par, motif: m,
          entites: p.entites.map(e => ({ kind: e.kind, key: e.key })), signaux: p.signaux.map(s => s.id), alertes: p.alertes });
      }
      return nouveau;
    })();
  }

  // ---------- lecture ----------
  function liste({ tous = false, limite = 50 } = {}) {
    const rows = db.prepare(`SELECT * FROM dossiers WHERE fusionne_dans IS NULL ${tous ? '' : "AND statut != 'clos'"} ORDER BY derniere DESC LIMIT ?`).all(Math.min(limite, 500));
    return rows.map(r => ({ ...r, explication: parse(r.explication) }))
      .sort((a, b) => GRAVITES.indexOf(b.gravite) - GRAVITES.indexOf(a.gravite) || (b.phase_max ?? 0) - (a.phase_max ?? 0)
        || CONFIANCES.indexOf(b.confiance) - CONFIANCES.indexOf(a.confiance) || (b.dernier_jalon ?? b.derniere) - (a.dernier_jalon ?? a.derniere));
  }
  function fiche(id) {
    const d = q.dossier.get(id);
    if (!d) return null;
    return { ...d, explication: parse(d.explication), entites: db.prepare('SELECT * FROM dossier_entites WHERE dossier_id = ? ORDER BY ajoute_a, kind, key').all(id),
      signaux: q.signaux.all(id), alertes: db.prepare('SELECT id, regle, gravite, statut, mode FROM alerts WHERE dossier_id = ? ORDER BY id').all(id) };
  }

  return { surSignal, surAlerte, alerteDure, surFait, tick, purge, recalculer, prendre, classer, detacher, rattacher, fusionner: fusionnerManuel, preparerScission, scinder, liste, fiche, confianceCompte };
}
