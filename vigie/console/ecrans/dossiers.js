// Dossiers (MV-12 et MV-13) : lectures bornées, filtres GET, explication du moteur et tableaux sans script.
// Les gestes sont dans actions.js. Les textes d'événements ne quittent ce module que bornés et masqués selon le droit ;
// Eta les échappe ensuite. Le titre HTML ne porte que le numéro du dossier, jamais sa graine ou son titre généré.
import { createHash } from 'node:crypto';
import { PHASES } from '../../phases.js';
import { PISTES } from '../../dossiers.js';
import { can } from '../droits.js';
import { adresseDetail, masquer, dateHeure, gravite, nombre } from '../format.js';
import { lire, titreDe, DECISIONS, MODES } from '../lexique.js';
import { mitre } from './alertes.js';
import { reglesAttack } from '../attack.js';
import { dessins, filtresDessin, conditionTechnique, lienDessin } from './dossier-dessins.js';

export const PAGE = 50, SIGNAUX = 40;
const MAX = 10_000;
export const STATUTS = { ouverts: 'Ouverts et en sommeil', en_cours: 'Pris en charge', clos: 'Clos', tous: 'Tous' };
export const CLASSEMENTS = { incident: 'Incident confirmé', faux_positif: 'Faux positif', test: 'Test', legitime: 'Légitime' };
export const GESTES = { prendre: 'Prendre en charge', classer: 'Classer', detacher: 'Détacher une entité', rattacher: 'Rattacher une entité', fusionner: 'Fusionner avec un autre dossier', scinder: 'Scinder le dossier' };
export const TYPES = { ip: 'adresse', reseau: 'réseau', compte: 'compte', session: 'session', acces: 'accès de galerie', objet: 'objet', cible: 'cible' };
const FORCES = { graine: 'graine', fort: 'fort', moyen: 'moyen', faible: 'faible', manuel: 'rattaché à la main' };
const NATURES = { jalon: 'Jalon', preuve: 'Preuve', indice: 'Indice', fait: 'Fait' };
const GF = { moyenne: ['moyen', 'haut', 'critique'], haute: ['haut', 'critique'], critique: ['critique'] };
const GM = { moyenne: 'Moyenne et plus', haute: 'Haute et plus', critique: 'Critique' };
const PF = { 3: 'Accès et plus', 5: 'Ancrage et plus', 6: 'Collecte et plus', 7: 'Exfiltration et plus' };
const RANG = "CASE d.gravite WHEN 'critique' THEN 4 WHEN 'haut' THEN 3 WHEN 'moyen' THEN 2 WHEN 'bas' THEN 1 ELSE 0 END";
const CONF = "CASE d.confiance WHEN 'forte' THEN 3 WHEN 'moyenne' THEN 2 WHEN 'faible' THEN 1 ELSE 0 END";
const HISTORIQUE = `SELECT seq, recu_a, detail FROM events WHERE type = 'vigie_dossier'
  AND (CASE WHEN json_valid(detail) THEN json_extract(detail, '$.id') END) = ? ORDER BY seq DESC LIMIT 51`;
const str = v => typeof v === 'string' ? v : '';
export const numero = v => /^[1-9]\d{0,11}$/.test(String(v)) ? Number(v) : null;
const texte = (v, role, max = 500) => masquer(String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, max), role || 'viewer');
const quand = t => Number.isFinite(Number(t)) && t != null ? dateHeure(Number(t)) : '—';
const compte = n => n > MAX ? 'plus de 10 000' : nombre(n);
const phase = n => PHASES.find(p => p.n === n)?.nom || 'Sans phase';
const cache = new WeakMap();
export function requetesDossiers(db) {
  if (!cache.has(db)) {
    const formes = new Map();
    cache.set(db, {
      sql: sql => { if (!formes.has(sql)) formes.set(sql, db.prepare(sql)); return formes.get(sql); },
      dossier: db.prepare('SELECT * FROM dossiers WHERE id = ?'),
      entites: db.prepare('SELECT * FROM dossier_entites WHERE dossier_id = ? ORDER BY detache_a IS NOT NULL, ajoute_a, kind, key LIMIT 201'),
      phases: db.prepare('SELECT DISTINCT phase FROM dossier_signaux WHERE dossier_id = ? AND phase IS NOT NULL AND nature IN (\'jalon\', \'preuve\') LIMIT 8'),
      alertes: db.prepare('SELECT id, regle, gravite, statut, mode FROM alerts WHERE dossier_id = ? ORDER BY id LIMIT 201'),
      histoire: db.prepare(HISTORIQUE),
    });
  }
  return cache.get(db);
}
export function filtresDe(query = {}) {
  const f = { statut: 'ouverts', piste: '', gravite: '', phase: '', page: 1 }, ignores = [];
  for (const [k, choix] of Object.entries({ statut: STATUTS, piste: PISTES, gravite: GF, phase: PF })) {
    const v = str(query[k]);
    if (v && Object.hasOwn(choix, v)) f[k] = v;
    else if (query[k] != null && query[k] !== '') ignores.push(k === 'gravite' ? 'gravité' : k);
  }
  if (query.page != null) {
    if (/^[1-9]\d{0,2}$/.test(str(query.page)) && Number(query.page) <= 200) f.page = Number(query.page);
    else ignores.push('page');
  }
  return { f, ignores };
}
function adresse(f, page = 1) {
  const p = new URLSearchParams();
  for (const k of ['statut', 'piste', 'gravite', 'phase']) if (f[k] && !(k === 'statut' && f[k] === 'ouverts')) p.set(k, f[k]);
  if (page > 1) p.set('page', String(page));
  return `/dossiers${p.size ? `?${p}` : ''}`;
}
function progression(d, q) {
  const x = lire(d.explication) || {};
  const chaine = Array.isArray(x.chaine) ? x.chaine.filter(n => Number.isInteger(n) && n >= 1 && n <= 8) : [];
  const vus = q.phases.all(d.id).map(s => s.phase);
  return { mot: phase(d.phase_max), suite: chaine.length >= 2 ? `${chaine.length} dans l’ordre` : d.phase_max ? 'une phase' : 'marqueur seul',
    phrase: d.phase_max ? `${phase(d.phase_max)} atteinte ; phases dans l’ordre : ${chaine.map(phase).join(' → ') || 'aucune'}` : 'Aucune phase atteinte',
    cases: PHASES.map(p => chaine.includes(p.n) ? 'suite' : vus.includes(p.n) ? 'vu' : p.n < d.phase_max ? 'non' : '') };
}
function ligne(d, q, role) {
  const x = lire(d.explication) || {};
  const n = q.sql('SELECT COUNT(*) FROM dossier_entites WHERE dossier_id = ? AND detache_a IS NULL').pluck().get(d.id);
  return { id: d.id, titre: texte(x.titre || `Dossier #${d.id}`, role), piste: PISTES[d.piste] || 'inconnue', grav: gravite(d.gravite),
    prog: progression(d, q), confiance: texte(d.confiance, role, 20), enjeu: texte(d.enjeu, role, 20), entites: n,
    derniere: quand(d.derniere), ouvert: quand(d.ouvert_a), statut: d.fusionne_dans ? 'Fusionné' : { ouvert: 'Ouvert', en_cours: 'Pris en charge', sommeil: 'Ouvert · en sommeil', clos: 'Clos' }[d.statut],
    etat: d.fusionne_dans || d.statut === 'clos' ? 'abouti' : d.statut === 'en_cours' ? 'encours' : 'afaire',
    fusion: d.fusionne_dans, recidive: Boolean(d.recidive), par: texte(d.traite_par, role, 200), classement: CLASSEMENTS[d.classement] || '', note: texte(d.note, role),
    alertes: q.alertes.all(d.id).slice(0, 10).map(a => a.id) };
}
export function liste({ db, role = 'viewer', query = {}, now = Date.now }) {
  const q = requetesDossiers(db), { f, ignores } = filtresDe(query), w = [], args = [];
  if (f.statut !== 'tous') {
    w.push('d.fusionne_dans IS NULL');
    if (f.statut === 'ouverts') w.push("d.statut != 'clos'");
    else { w.push('d.statut = ?'); args.push(f.statut); }
  }
  if (f.piste) { w.push('d.piste = ?'); args.push(f.piste); }
  if (f.gravite) { w.push(`d.gravite IN (${GF[f.gravite].map(() => '?').join(',')})`); args.push(...GF[f.gravite]); }
  if (f.phase) { w.push('d.phase_max >= ?'); args.push(Number(f.phase)); }
  const W = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const total = q.sql(`SELECT COUNT(*) FROM (SELECT 1 FROM dossiers d ${W} LIMIT ${MAX + 1})`).pluck().get(...args);
  const pages = Math.min(200, Math.max(1, Math.ceil(total / PAGE))), p = Math.min(f.page, pages);
  const ordre = `ORDER BY (d.statut = 'clos' OR d.fusionne_dans IS NOT NULL),
    CASE WHEN d.statut != 'clos' AND d.fusionne_dans IS NULL THEN ${RANG} END DESC,
    CASE WHEN d.statut != 'clos' AND d.fusionne_dans IS NULL THEN d.phase_max END DESC,
    CASE WHEN d.statut != 'clos' AND d.fusionne_dans IS NULL THEN ${CONF} END DESC,
    CASE WHEN d.statut != 'clos' AND d.fusionne_dans IS NULL THEN COALESCE(d.dernier_jalon, d.derniere) ELSE d.derniere END DESC, d.id DESC`;
  const rows = q.sql(`SELECT d.* FROM dossiers d ${W} ${ordre} LIMIT ${PAGE} OFFSET ?`).all(...args, (p - 1) * PAGE);
  const lignes = rows.map(d => ligne(d, q, role));
  return { maintenant: quand(now()), lecteur: !can(role, 'dossiers_traiter'), f, ignores, statuts: STATUTS, pistes: PISTES, gravites: GM, phases: PF,
    resume: [STATUTS[f.statut], f.piste ? PISTES[f.piste] : 'toutes pistes', GM[f.gravite], PF[f.phase]].filter(Boolean).join(' · '),
    total: compte(total), lignes, prioritaire: lignes.find(d => d.grav.classe === 'critique' && d.etat === 'afaire'),
    position: `Page ${p} sur ${pages}`, precedente: p > 1 ? adresse(f, p - 1) : null, suivante: p < pages ? adresse(f, p + 1) : null };
}
function entite(e, role) {
  const t = texte(e.key, role, 200);
  let href = null;
  if (['compte', 'session', 'appareil', 'reseau'].includes(e.kind)) href = `/entites/${e.kind}/${encodeURIComponent(t.replace(/\/(24|48)$/, ''))}`;
  if (e.kind === 'ip') {
    const a = adresseDetail(e.key, role);
    if (a.texte !== 'masquée') href = `/entites/${a.tronquee ? 'reseau' : 'ip'}/${encodeURIComponent(a.texte.replace(/\/(24|48)$/, ''))}`;
  }
  return { type: TYPES[e.kind] || texte(e.kind, role, 30), texte: t, href, role: texte(e.role, role, 30), force: FORCES[e.force] || 'inconnu',
    via: texte(e.via, role, 200), depuis: quand(e.ajoute_a), detache: e.detache_a != null, cle: can(role, 'dossiers_traiter') ? `${e.kind}:${e.key}` : null };
}
function signal(s, role, regles) {
  const attaque = mitre(regles.get(s.regle)?.tags);
  return { id: s.id, heure: quand(s.survenu_a), phase: phase(s.phase), nature: s.promu ? 'Fait devenu jalon' : NATURES[s.nature] || 'Fait',
    grav: gravite(s.gravite),
    marqueurs: (Array.isArray(lire(s.marqueurs)) ? lire(s.marqueurs) : []).slice(0, 2).map(m => texte(m, role, 40)).join(', '),
    titre: texte(titreDe(s.regle, regles), role), regle: texte(s.regle, role, 120), cas: texte(regles.get(s.regle)?.cas, role, 40), techniques: attaque?.techniques || [],
    entite: texte([s.entite_key, s.sub, s.session, s.ip, s.objet].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · '), role, 1000),
    alerte: s.alerte_id, evenement: s.present ? `/evenements/${s.seq}` : null };
}
export function fiche({ db, engine, role = 'viewer', id, query = {} }) {
  const q = requetesDossiers(db), d = q.dossier.get(id);
  if (!d) return null;
  const x = lire(d.explication) || {}, regles = reglesAttack(engine), filtres = filtresDessin(query);
  const technique = conditionTechnique(regles, filtres.technique);
  const avant = /^(\d{1,15})-(\d{1,12})$/.exec(str(query.avant));
  const rows = q.sql(`SELECT s.*, e.seq AS present FROM dossier_signaux s LEFT JOIN events e ON e.seq = s.seq WHERE s.dossier_id = ?
    ${technique.sql} ${avant ? 'AND (s.survenu_a < ? OR (s.survenu_a = ? AND s.id < ?))' : ''} ORDER BY s.survenu_a DESC, s.id DESC LIMIT ${SIGNAUX + 1}`)
    .all(id, ...technique.args, ...(avant ? [Number(avant[1]), Number(avant[1]), Number(avant[2])] : []));
  const derniers = rows.slice(0, SIGNAUX), dernier = derniers.at(-1);
  const ents = q.entites.all(id), histoires = q.histoire.all(id), alertes = q.alertes.all(id);
  const journal = histoires.slice(0, 50).map(h => {
    const a = lire(h.detail) || {};
    const mots = { ouvert: 'Ouvert', fusionne: 'Fusion', aggrave: 'Aggravation', ponderation: 'Pondération par la veille', sommeil: 'Mise en sommeil', clos: 'Clôture', classe: 'Classement', detache: 'Entité détachée', rattache: 'Entité rattachée', scinde: 'Scission', 'prise en charge': 'Prise en charge' };
    return { heure: quand(h.recu_a), action: mots[a.action] || texte(a.action, role, 60), par: texte(a.par || 'Vigie', role, 200),
      detail: texte([CLASSEMENTS[a.classement], a.motif, a.note, a.entite ? `${a.entite.kind} ${a.entite.key}` : '', a.absorbe ? `dossier absorbé #${a.absorbe}` : '', a.nouveau ? `dossiers #${a.origine} et #${a.nouveau}` : ''].filter(Boolean).join(' · '), role, 1000), href: `/evenements/${h.seq}` };
  });
  const reponses = q.sql(`SELECT de.* FROM decisions de JOIN alerts a ON a.id = de.alerte_id WHERE a.dossier_id = ? ORDER BY de.id DESC LIMIT 51`).all(id);
  return { ...ligne(d, q, role), lecteur: !can(role, 'dossiers_traiter'), agir: can(role, 'dossiers_traiter') && !d.fusionne_dans,
    dessins: dessins({ q, d, regles, query, texte: v => texte(v, role), entite: e => entite(e, role), signal: s => signal(s, role, regles) }),
    exporter: can(role, 'exporter') && d.statut === 'clos' && d.classement === 'incident' && !d.fusionne_dans,
    clos: d.statut === 'clos', tronque: Boolean(d.tronque), lignes: (Array.isArray(x.lignes) ? x.lignes : []).slice(0, 3).map(s => texte(s, role, 2000)),
    modifs: (Array.isArray(x.modificateurs) ? x.modificateurs : []).slice(0, 10).map(s => texte(s, role)),
    veille: x.veille && Array.isArray(x.veille.alertes) ? { base: gravite(x.veille.base).mot,
      majoration: x.veille.majoration === 1 ? 1 : 0, tronque: Boolean(x.veille.tronque),
      alertes: x.veille.alertes.slice(0, 20).filter(a => numero(a.id)).map(a => ({ id: a.id, avis: texte(a.avis, role, 120),
        nom: texte(a.nom, role, 214), version: texte(a.version, role, 100), gravite: gravite(a.gravite).mot,
        cibles: (Array.isArray(a.cibles) ? a.cibles : []).filter(c => ['site', 'vigie'].includes(c)).map(c => c === 'site' ? 'Site' : 'Vigie').join(', '),
        verification: quand(a.verifie_a) })) } : null,
    non: (Array.isArray(x.non_observees) ? x.non_observees : []).slice(0, 8).map(s => texte(s, role, 40)),
    entitesVue: ents.slice(0, 200).map(e => entite(e, role)), entitesCoupees: ents.length > 200,
    signaux: derniers.map(s => signal(s, role, regles)), avantInvalide: query.avant != null && !avant,
    suivante: rows.length > SIGNAUX ? lienDessin(id, filtres, { avant: `${dernier.survenu_a}-${dernier.id}` }, 'signaux') : null,
    debut: avant ? lienDessin(id, filtres, {}, 'signaux') : null,
    alertesVue: alertes.slice(0, 200).map(a => ({ id: a.id, titre: texte(titreDe(a.regle, regles), role), grav: gravite(a.gravite), mode: MODES[a.mode] || '', statut: a.statut === 'close' ? 'Close' : a.statut === 'en_cours' ? 'Prise en charge' : 'Ouverte' })), alertesCoupees: alertes.length > 200,
    reponses: reponses.slice(0, 50).map(r => ({ id: r.id, type: DECISIONS[r.kind] || r.kind, cible: texte(r.cible, role, 200), motif: texte(r.motif, role),
      alerte: r.alerte_id, date: quand(r.cree_a), fin: r.leve_a ? `levée le ${quand(r.leve_a)}` : `jusqu’au ${quand(r.fin)}` })), reponsesCoupees: reponses.length > 50,
    journal, journalCoupe: histoires.length > 50 };
}

// Empreinte du contenu confirmé : une mutation concurrente oblige à relire les conséquences du geste, notamment
// l'apprentissage « légitime » et la scission. Aucun jeton n'est dérivé d'une donnée personnelle exposée au navigateur.
export function revision(db, id) {
  const q = requetesDossiers(db);
  const hash = createHash('sha256').update(JSON.stringify(q.dossier.get(id)));
  // Parcours sans tableau en mémoire, même après plusieurs fusions ; aucune ligne cachée par une limite de vue.
  for (const table of ['dossier_entites', 'dossier_signaux', 'alerts']) {
    hash.update(table);
    for (const row of q.sql(`SELECT * FROM ${table} WHERE dossier_id = ? ORDER BY ${table === 'dossier_entites' ? 'kind, key' : 'id'}`).iterate(id)) hash.update(JSON.stringify(row));
  }
  return hash.digest('hex');
}
// D39 : ne jamais confirmer un apprentissage dont la liste a été coupée à l'écran.
export function indicesAppris(db, id, role) {
  const valeurs = new Set();
  const rows = requetesDossiers(db).sql("SELECT sub, cle FROM dossier_signaux WHERE dossier_id = ? AND nature = 'indice' AND sub IS NOT NULL AND cle IS NOT NULL ORDER BY id");
  for (const s of rows.iterate(id)) {
    const cles = lire(s.cle);
    if (!Array.isArray(cles)) continue;
    for (const c of cles) {
      valeurs.add(`${s.sub} : ${c}`);
      if (valeurs.size > 200) return { appris: [], apprentissageTronque: true };
    }
  }
  return { appris: [...valeurs].map(c => texte(c, role, 400)), apprentissageTronque: false };
}
export function confirmation({ db, engine, role, id, geste, valeurs = {}, erreur = null, apercu = null, autre = null }) {
  const q = requetesDossiers(db), d = q.dossier.get(id);
  if (!d || d.fusionne_dans) return null;
  const regles = new Map(engine.rules().map(r => [r.id, r]));
  const sig = q.sql('SELECT * FROM dossier_signaux WHERE dossier_id = ? ORDER BY survenu_a, id LIMIT 2001').all(id);
  const entites = q.entites.all(id).filter(e => e.detache_a == null).map(e => entite(e, role));
  const apprentissage = indicesAppris(db, id, role);
  const cible = autre && q.dossier.get(autre);
  // Après le choix du second dossier seulement : ses conséquences et son empreinte sont montrées ensemble.
  const fusion = cible && !cible.fusionne_dans ? { id: cible.id, titre: ligne(cible, q, role).titre, revision: revision(db, autre),
    conserve: Math.min(id, autre), entites: q.sql('SELECT COUNT(*) FROM dossier_entites WHERE dossier_id = ? AND detache_a IS NULL').pluck().get(autre),
    signaux: q.sql('SELECT COUNT(*) FROM dossier_signaux WHERE dossier_id = ?').pluck().get(autre),
    alertes: q.sql('SELECT COUNT(*) FROM alerts WHERE dossier_id = ?').pluck().get(autre) } : null;
  return { id, geste, titre: `${GESTES[geste]} · dossier #${id}`, retour: `/dossiers/${id}`, revision: revision(db, id),
    valeurs, erreur, apercu, fusion, entites, signaux: sig.slice(0, 2000).map(s => signal(s, role, regles)), trop: sig.length > 2000,
    classements: CLASSEMENTS, types: TYPES, ...apprentissage,
    autres: geste === 'fusionner' ? q.sql('SELECT * FROM dossiers WHERE id != ? AND fusionne_dans IS NULL ORDER BY derniere DESC LIMIT 100').all(id).map(a => ({ id: a.id, titre: texte((lire(a.explication) || {}).titre, role) })) : [] };
}
// Fiche d'entité : recherche par la clé indexée, sans parcourir les événements.
export function dossiersEntite({ db, kind, key, role }) {
  return requetesDossiers(db).sql(`SELECT d.id, d.explication, d.statut FROM dossier_entites e JOIN dossiers d ON d.id = e.dossier_id
    WHERE e.kind = ? AND e.key = ? AND e.detache_a IS NULL AND d.fusionne_dans IS NULL ORDER BY d.derniere DESC LIMIT 21`).all(kind, key)
    .map(d => ({ id: d.id, titre: texte((lire(d.explication) || {}).titre || `Dossier #${d.id}`, role), statut: d.statut }));
}
export function register(app, ctx) {
  const { db, engine, now } = ctx;
  app.get('/dossiers', async (req, reply) => ctx.view(reply, req, 'dossiers', { page: 'dossiers', titre: 'Dossiers · Vigie', vue: liste({ db, role: req.moi.role, query: req.query, now }) }));
  app.get('/dossiers/:id', async (req, reply) => {
    const id = numero(req.params.id), vue = id && fiche({ db, engine, role: req.moi.role, id, query: req.query });
    return ctx.view(reply, req, vue ? 'dossiers-fiche' : 'dossiers-introuvable', { page: 'dossiers', titre: vue ? `Dossier #${id} · Vigie` : 'Dossier introuvable · Vigie', vue }, vue ? 200 : 404);
  });
  for (const geste of Object.keys(GESTES)) app.get(`/dossiers/:id/${geste}`, async (req, reply) => {
    if (!can(req.moi.role, 'dossiers_traiter')) return ctx.page(reply, 'interdit', { raison: 'droit', requis: 'Intervenant' }, 403);
    const id = numero(req.params.id);
    const message = ctx.sessions.takeMessage(req.moi.sid);
    const valeurs = message?.valeurs || { entite: str(req.query.entite) };
    const vue = id && confirmation({ db, engine, role: req.moi.role, id, geste, valeurs, erreur: message?.k === 'erreur' ? message : null });
    return ctx.view(reply, req, vue ? 'dossiers-confirmer' : 'dossiers-introuvable', { page: 'dossiers', titre: vue?.titre || 'Dossier introuvable · Vigie', vue, message: null }, vue ? 200 : 404);
  });
}
