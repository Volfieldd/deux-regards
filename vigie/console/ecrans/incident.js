// Périmètre d'un incident (étude 10.3) : instantané des références conservées, jamais du contenu personnel.
// L'export demande le droit existant « exporter », une confirmation et une trace avant de sortir. Les plafonds
// refusent un fichier incomplet ; le drapeau du moteur reste visible quand le dossier lui-même est tronqué.
import { createHash } from 'node:crypto';
import { can } from '../droits.js';
import { numero } from './dossiers.js';
import { PHASES } from '../../phases.js';
import { CATEGORIES_DONNEES } from '../../../server/securite/vocabulaire.js';

const MAX_SIGNAUX = 10_000, MAX_ENTITES = 2000;
const texte = v => v == null ? null : String(v).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, 200);
const date = v => Number.isSafeInteger(v) && Math.abs(v) <= 8.64e15 ? new Date(v).toISOString() : null;
const entier = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
const champs = ['regle', 'nature', 'sub', 'session', 'objet'];
function donnees(v) {
  let d;
  try { d = JSON.parse(v); } catch { /* Ancien signal sans métadonnées ou valeur illisible. */ }
  return { categories: Object.keys(CATEGORIES_DONNEES).filter(c => Array.isArray(d?.categorie) && d.categorie.includes(c)),
    objets: entier(d?.objets), liste: d?.liste === true, dechiffrements: entier(d?.dechiffrements), octets_servis: entier(d?.octets_servis) };
}
export function instantane(db, id) {
  // Une transaction de lecture garde les trois sélections cohérentes, y compris face à un autre processus SQLite.
  return db.transaction(() => {
    const d = db.prepare('SELECT id, statut, classement, fusionne_dans, ouvert_a, derniere, tronque FROM dossiers WHERE id = ?').get(id);
    if (!d || d.classement !== 'incident' || d.statut !== 'clos' || d.fusionne_dans) return null;
    const signaux = db.prepare(`SELECT id, seq, survenu_a, phase, promu,
      ${champs.map(c => `substr(${c}, 1, 201) AS ${c}`).join(', ')}, substr(donnees, 1, 2049) AS donnees
      FROM dossier_signaux WHERE dossier_id = ? ORDER BY survenu_a, id LIMIT ${MAX_SIGNAUX + 1}`).all(id);
    const entites = db.prepare(`SELECT kind, substr(key, 1, 201) AS key, detache_a FROM dossier_entites
      WHERE dossier_id = ? AND kind IN ('compte', 'session') ORDER BY kind, key LIMIT ${MAX_ENTITES + 1}`).all(id);
    if (signaux.length > MAX_SIGNAUX || entites.length > MAX_ENTITES) return { id, erreur: 'Ce dossier dépasse les limites de l’export (10 000 signaux ou 2 000 comptes et sessions). Aucun fichier partiel ne sera produit.' };
    return { d, signaux, entites, revision: createHash('sha256').update(JSON.stringify([d, signaux, entites])).digest('hex') };
  })();
}
export function documentIncident(s, t) {
  const signaux = s.signaux.map(x => ({ id: x.id, evenement: x.seq, date: date(x.survenu_a), regle: texte(x.regle),
    nature: texte(x.nature), phase: PHASES.some(p => p.n === x.phase) ? x.phase : null, fait_promu: Boolean(x.promu),
    compte: texte(x.sub), session: texte(x.session), objet: texte(x.objet), ...donnees(x.donnees) }));
  const phases = PHASES.filter(p => signaux.some(x => x.phase === p.n && ['preuve', 'jalon'].includes(x.nature))).map(p => ({ numero: p.n, nom: p.nom }));
  const identifiants = (kind, champ) => [...new Set([...s.entites.filter(e => e.kind === kind && e.detache_a == null).map(e => texte(e.key)), ...signaux.map(x => x[champ])].filter(Boolean))];
  const categories = [...Object.keys(CATEGORIES_DONNEES), 'non_precisee'].map(c => {
    const lignes = signaux.filter(x => c === 'non_precisee' ? !x.categories.length && x.objet : x.categories.includes(c));
    return { categorie: c, libelle: CATEGORIES_DONNEES[c] || 'Catégorie non précisée', objets: [...new Set(lignes.map(x => x.objet).filter(Boolean))],
      operations_sans_identifiant: lignes.filter(x => !x.objet).map(x => ({ signal: x.id, objets_annonces: x.objets })) };
  }).filter(c => c.objets.length || c.operations_sans_identifiant.length);
  return { format: 'vigie-incident', version: 1, exporte_a: date(t), dossier: s.d.id, classement: 'incident',
    periode: { ouverture: date(s.d.ouvert_a), dernier_signe: date(s.d.derniere), premier_signal: signaux[0]?.date || null, dernier_signal: signaux.at(-1)?.date || null },
    limites: { dossier_tronque: Boolean(s.d.tronque), champs_bornes: s.signaux.some(x => champs.some(c => x[c]?.length > 200) || x.donnees?.length > 2048) || s.entites.some(e => e.key?.length > 200),
      portee: 'Références conservées dans le dossier, y compris après purge des événements sources. Une liste sans identifiants ne permet pas de dénombrer les personnes touchées. Les phases sont celles des preuves et jalons ; un fait ordinaire ne prouve pas une attaque. La publication n’est pas déduite d’une phase. Ce fichier aide à préparer le registre des violations et ne remplace pas son analyse.' },
    comptes: identifiants('compte', 'compte'), sessions: identifiants('session', 'session'), phases_atteintes: phases,
    objets_par_categorie: categories, signaux };
}
export function register(app, ctx) {
  const { db, store, now } = ctx;
  const refus = (reply, code, message) => reply.code(code).type('text/plain; charset=utf-8').send(message);
  const lire = req => { const id = numero(req.params.id); return id && instantane(db, id); };
  app.get('/dossiers/:id/export', async (req, reply) => {
    if (!can(req.moi.role, 'exporter')) return ctx.page(reply, 'interdit', { raison: 'droit', requis: 'Analyste' }, 403);
    const s = lire(req);
    if (!s) return refus(reply, 404, 'Incident clos introuvable.');
    const vue = s.erreur ? s : { id: s.d.id, revision: s.revision, signaux: s.signaux.length, tronque: Boolean(s.d.tronque) };
    return ctx.view(reply, req, 'incident-export', { page: 'dossiers', titre: `Exporter l’incident #${vue.id} · Vigie`, vue });
  });
  app.post('/dossiers/:id/export', async (req, reply) => {
    if (!(await ctx.guard(req, reply, 'exporter'))) return reply;
    const s = lire(req);
    if (!s) return refus(reply, 404, 'Incident clos introuvable.');
    if (s.erreur) return refus(reply, 409, s.erreur);
    if (typeof req.body?.revision !== 'string' || req.body.revision !== s.revision) return refus(reply, 409, 'Le dossier a changé. Revenez à la confirmation avant de l’exporter.');
    // Aucune attente entre l'instantané, la sérialisation et l'audit : pas de données ajoutées après confirmation.
    const document = documentIncident(s, now()), json = JSON.stringify(document, null, 2) + '\n';
    if (Buffer.byteLength(json) > 10 * 1024 * 1024) return refus(reply, 409, 'L’export dépasse 10 Mio. Aucun fichier partiel ne sera produit.');
    try {
      store.own('vigie_console_export', { emetteur: 'vigie/console', sub: req.moi.sub, ip: req.ip2 || undefined,
        detail: { dossier: s.d.id, format: 'incident_json', lignes: s.signaux.length, tronque: Boolean(s.d.tronque) } });
    } catch (err) {
      ctx.log.error({ err: err.message }, 'Vigie : console : export d’incident non noté');
      return refus(reply, 503, 'Export impossible : le journal n’a pas pu le noter.');
    }
    return reply.type('application/json; charset=utf-8').header('content-disposition', `attachment; filename="vigie-incident-${s.d.id}.json"`).send(json);
  });
}
