import { createVault } from './vault.js';

const parisDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

// Messages des visiteurs (PLAN point 8, maquette MQ-06 sans la vente de tirages ; registre de la Vigie, BV-27 à BV-30) :
//   - Contact (/contact) : « Écrire à Sébastien, à Julien, ou aux deux » : destinataire, message, nom, e-mail ;
//   - demande de licence (/droits/demande?photo=<slug>) : la photo, l'usage prévu, la diffusion, le message, le nom, la
//     société, l'e-mail.
// Nom, e-mail, société, diffusion et message sont chiffrés (DATA_KEY), comme les signalements ; tout est effacé 12 mois
// après l'envoi. Rien n'est jamais envoyé au visiteur (pas d'accusé de réception : le site écrirait à n'importe quelle
// adresse saisie) ; les photographes sont prévenus sans donnée personnelle (server/reminders.js, messages()).
export const KINDS = ['contact', 'licence'];
export const USAGES = ['presse', 'web', 'publicite', 'autre'];
export const ALL = 'tous';                          // « aux deux » (à tous les photographes) : author_id NULL
// Longueurs, les mêmes que les maxlength des pages (views/contact.eta, views/licence.eta et leurs versions v2).
export const LIMITS = { message: 2000, name: 100, email: 200, company: 120, diffusion: 300 };
const RETENTION = 365 * 864e5;
// Plafond global : 50 messages acceptés par jour (heure de Paris), tous formulaires et toutes adresses confondus ; au-delà,
// la route répond 503 (saisie gardée) et prévient la Vigie (BV-29). Une page par 50 messages dans la boîte de l'admin.
export const PER_DAY = 50;
export const PAGE_SIZE = 50;
const EMAIL = /^[^\s@<>]{1,100}@[^\s@<>]{1,100}\.[^\s@<>]{2,30}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
// Champs d'une ligne (nom, adresse, société, diffusion) : sans caractère invisible ni de direction (un nom qui se lit à
// l'envers, une adresse qui en cache une autre), comme les billets (server/carnet-markdown.js).
const INVISIBLE = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
// Longueur comme la compte le navigateur pour maxlength : un retour à la ligne envoyé en CRLF compte pour un signe.
const sizeOf = s => s.replace(/\r\n/g, '\n').length;
const SEALED = ['name', 'email', 'company', 'diffusion', 'message'];

export class MessageError extends Error {
  // errors : champ → code (affiché sous le champ) ; forged : ce qu'un navigateur qui suit la page n'envoie jamais
  // (valeur hors liste, texte plus long que la page ne le permet), signalé à la Vigie par la route (BV-28).
  constructor(errors, forged = []) { super(Object.keys(errors).join(', ')); this.errors = errors; this.forged = forged; }
}

export function createMessages({ db, vault = createVault(null), now = () => Date.now() }) {
  // Portée : @author NULL (tout) ; sinon les messages de son photographe, et ceux adressés aux deux pour un compte lié à
  // un photographe (@author > 0). Un message dont le photographe a été supprimé (author_id NULL, to_all 0) n'est plus
  // lisible que de qui voit tout.
  const SCOPE = '(@author IS NULL OR m.author_id = @author OR (m.to_all = 1 AND @author > 0))';
  const FILTER = "(@status IS NULL OR m.status = @status) AND (@kind IS NULL OR m.kind = @kind)";
  const q = {
    insert: db.prepare(`INSERT INTO messages (kind, author_id, to_all, photo_id, usage, name, email, company, diffusion, message, lang, created_at)
      VALUES (@kind, @author_id, @to_all, @photo_id, @usage, @name, @email, @company, @diffusion, @message, @lang, @created_at)`),
    // Liste de la boîte : rien de chiffré n'y est lu (ni nom, ni adresse, ni message) ; la photo et le photographe.
    list: db.prepare(`SELECT m.id, m.kind, m.author_id, m.to_all, m.photo_id, m.usage, m.lang, m.status, m.created_at, m.done_at,
      a.name AS author_name, p.title AS photo_title, p.slug AS photo_slug, p.file, p.width, p.height, p.variant_key, p.status AS photo_status
      FROM messages m LEFT JOIN authors a ON a.id = m.author_id LEFT JOIN photos p ON p.id = m.photo_id
      WHERE ${SCOPE} AND ${FILTER} ORDER BY m.status = 'nouveau' DESC, m.created_at DESC, m.id DESC LIMIT @limit OFFSET @offset`),
    counts: db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(m.status = 'nouveau'), 0) AS nouveaux, COALESCE(SUM(m.kind = 'contact'), 0) AS contact,
      COALESCE(SUM(m.kind = 'licence'), 0) AS licence FROM messages m WHERE ${SCOPE}`),
    filtered: db.prepare(`SELECT COUNT(*) FROM messages m WHERE ${SCOPE} AND ${FILTER}`).pluck(),
    get: db.prepare(`SELECT m.*, a.name AS author_name, p.title AS photo_title, p.slug AS photo_slug, p.file, p.width, p.height, p.variant_key, p.status AS photo_status
      FROM messages m LEFT JOIN authors a ON a.id = m.author_id LEFT JOIN photos p ON p.id = m.photo_id WHERE m.id = ?`),
    pending: db.prepare(`SELECT COUNT(*) FROM messages m WHERE m.status = 'nouveau' AND ${SCOPE}`).pluck(),
    done: db.prepare("UPDATE messages SET status = 'traite', done_at = ? WHERE id = ? AND status = 'nouveau'"),
    remove: db.prepare('DELETE FROM messages WHERE id = ?'),
    purge: db.prepare('DELETE FROM messages WHERE created_at < ?'),
    since: db.prepare('SELECT created_at FROM messages WHERE created_at >= ?').pluck(),
    toNotify: db.prepare('SELECT id, author_id, to_all FROM messages WHERE notified_at IS NULL ORDER BY id'),
    notified: db.prepare('UPDATE messages SET notified_at = ? WHERE id = ?'),
  };

  // Lecture d'un champ du formulaire : texte nettoyé (caractères de contrôle retirés, espaces aux bords), et sa longueur
  // telle que la page la bornait. Une valeur qui n'est pas un texte (champ répété) ne vient pas de la page.
  function read(body, field, { max, line = false, forged }) {
    const raw = body?.[field];
    if (raw == null) return '';
    if (typeof raw !== 'string') { forged.push({ raison: 'saisie hors formulaire', champ: field, longueur: String(raw).length }); return ''; }
    if (max && sizeOf(raw) > max) forged.push({ raison: 'saisie hors formulaire', champ: field, longueur: sizeOf(raw) });
    let v = raw.replace(/\r\n?/g, '\n').replace(CONTROL, '');
    if (line) v = v.replace(INVISIBLE, '').replace(/\s+/g, ' ');
    return v.trim().slice(0, max || undefined);
  }
  // Choix d'une liste fermée (boutons radio) : vide, ou l'une des valeurs ; sinon refusé et signalé.
  function choose(body, field, allowed, forged) {
    const raw = body?.[field];
    if (raw == null || raw === '') return '';
    if (typeof raw === 'string' && allowed.includes(raw)) return raw;
    forged.push({ raison: 'valeur hors liste', champ: field, valeur: String(raw).slice(0, 60) });
    return '';
  }

  // Un message à enregistrer. kind : 'contact' ou 'licence'. authors : les photographes ({ id, slug }) ; photo : la
  // photo de la demande ({ id, author_id }) déjà retrouvée par la route, ou null. Lève MessageError (erreurs, saisies
  // forgées) ; renvoie le numéro du message.
  function submit(kind, body, { lang = 'fr', authors = [], photo = null } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`nature de message inconnue : ${kind}`);
    const errors = {}, forged = [];
    const v = {
      message: read(body, 'message', { max: LIMITS.message, forged }),
      name: read(body, 'name', { max: LIMITS.name, line: true, forged }),
      email: read(body, 'email', { max: LIMITS.email, line: true, forged }),
      company: kind === 'licence' ? read(body, 'company', { max: LIMITS.company, line: true, forged }) : '',
      diffusion: kind === 'licence' ? read(body, 'diffusion', { max: LIMITS.diffusion, line: true, forged }) : '',
    };
    let authorId = null, toAll = 0, usage = '';
    if (kind === 'contact') {
      const pour = choose(body, 'pour', [...authors.map(a => a.slug), ALL], forged);
      if (!pour) errors.pour = 'pour';
      authorId = pour && pour !== ALL ? authors.find(a => a.slug === pour).id : null;
      toAll = pour === ALL ? 1 : 0;
    } else {
      usage = choose(body, 'usage', USAGES, forged);
      if (!usage) errors.usage = 'usage';
      authorId = photo?.author_id ?? null;
      toAll = authorId == null ? 1 : 0;                              // sans photo : une demande aux deux
    }
    for (const f of forged) if (f.raison === 'saisie hors formulaire') errors[f.champ] ||= 'long';
    if (!v.message) errors.message ||= 'message';
    if (!v.name) errors.name ||= 'name';
    if (!v.email) errors.email ||= 'email_required';
    else if (!EMAIL.test(v.email)) errors.email ||= 'email';
    if (Object.keys(errors).length) throw new MessageError(errors, forged);
    const row = { kind, author_id: authorId, to_all: toAll, photo_id: photo?.id ?? null, usage, lang: ['fr', 'en', 'de'].includes(lang) ? lang : 'fr', created_at: now() };
    for (const k of SEALED) row[k] = vault.seal(v[k]);
    return Number(q.insert.run(row).lastInsertRowid);
  }

  // Portée d'un compte (request.scope('messages.traiter')) → filtre : null (tout), le photographe lié (ses messages et,
  // s'il est lié à un photographe, ceux adressés aux deux), ou rien. Compte sans photographe lié : -1, rien n'est à lui.
  const authorOf = scope => (!scope ? undefined : scope.all ? null : (scope.authorId ?? -1));
  // Une page de la boîte : status ('nouveau', 'traite' ou rien), kind ('contact', 'licence' ou rien), page (1…). Jamais
  // tronquée en silence : le nombre de pages est rendu avec la liste.
  function list(scope, { status = null, kind = null, page = 1 } = {}) {
    const a = authorOf(scope);
    const empty = { items: [], page: 1, pages: 1, filtered: 0, counts: { total: 0, nouveaux: 0, contact: 0, licence: 0 } };
    if (a === undefined) return empty;
    const f = { author: a, status: status || null, kind: kind || null };
    const filtered = q.filtered.get(f);
    const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
    const p = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pages);
    return { items: q.list.all({ ...f, limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE }), page: p, pages, filtered, counts: q.counts.get({ author: a }) };
  }
  const pending = scope => { const a = authorOf(scope); return a === undefined ? 0 : q.pending.get({ author: a }); };
  // Messages acceptés depuis le début du jour (heure de Paris) : plafond global (PER_DAY).
  const acceptedToday = () => { const day = parisDay(new Date(now())); return q.since.all(now() - 26 * 3600e3).filter(t => parisDay(new Date(t)) === day).length; };
  // Le message déchiffré (fiche de l'admin) ; null s'il n'existe pas.
  function get(id) {
    const r = q.get.get(id);
    if (!r) return null;
    for (const k of SEALED) r[k] = vault.open(r[k]);
    return r;
  }
  const raw = id => q.get.get(id) || null;
  // Le compte voit-il ce message ? (portée « tout », ou adressé à son photographe, ou aux deux).
  const sees = (scope, r) => Boolean(scope && r && (scope.all || (scope.authorId > 0 && (r.author_id === scope.authorId || r.to_all === 1))));
  const done = id => q.done.run(now(), id).changes > 0;
  const remove = id => q.remove.run(id).changes > 0;
  const purge = () => q.purge.run(now() - RETENTION).changes;
  // Données chiffrées après coup (clé ajoutée) : comme les signalements et les rencontres.
  function sealExisting() {
    if (!vault.enabled) return 0;
    let n = 0;
    for (const r of db.prepare(`SELECT id, ${SEALED.join(', ')} FROM messages`).all()) {
      const set = Object.fromEntries(SEALED.filter(k => r[k] && !vault.sealed(r[k])).map(k => [k, vault.seal(r[k])]));
      if (Object.keys(set).length) { db.prepare(`UPDATE messages SET ${Object.keys(set).map(k => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...set, id: r.id }); n++; }
    }
    return n;
  }
  return { submit, list, pending, acceptedToday, get, raw, sees, done, remove, purge, sealExisting,
    // Pour les notifications (server/reminders.js) : les messages pas encore annoncés, puis notés comme annoncés.
    toNotify: () => q.toNotify.all(), notified: id => q.notified.run(now(), id) };
}
