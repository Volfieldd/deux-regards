import { createVault } from './vault.js';

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
const EMAIL = /^[^\s@<>]{1,100}@[^\s@<>]{1,100}\.[^\s@<>]{2,30}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
// Longueur comme la compte le navigateur pour maxlength : un retour à la ligne envoyé en CRLF compte pour un signe.
const sizeOf = s => s.replace(/\r\n/g, '\n').length;
const SEALED = ['name', 'email', 'company', 'diffusion', 'message'];

export class MessageError extends Error {
  // errors : champ → code (affiché sous le champ) ; forged : ce qu'un navigateur qui suit la page n'envoie jamais
  // (valeur hors liste, texte plus long que la page ne le permet), signalé à la Vigie par la route (BV-28).
  constructor(errors, forged = []) { super(Object.keys(errors).join(', ')); this.errors = errors; this.forged = forged; }
}

export function createMessages({ db, vault = createVault(null), now = () => Date.now() }) {
  const q = {
    insert: db.prepare(`INSERT INTO messages (kind, author_id, photo_id, usage, name, email, company, diffusion, message, lang, created_at)
      VALUES (@kind, @author_id, @photo_id, @usage, @name, @email, @company, @diffusion, @message, @lang, @created_at)`),
    // Liste de la boîte : rien de chiffré n'y est lu (ni nom, ni adresse, ni message) ; la photo et le photographe.
    list: db.prepare(`SELECT m.id, m.kind, m.author_id, m.photo_id, m.usage, m.lang, m.status, m.created_at, m.done_at,
      a.name AS author_name, p.title AS photo_title, p.slug AS photo_slug, p.file, p.width, p.height, p.variant_key, p.status AS photo_status
      FROM messages m LEFT JOIN authors a ON a.id = m.author_id LEFT JOIN photos p ON p.id = m.photo_id
      WHERE (@author IS NULL OR m.author_id = @author OR m.author_id IS NULL) ORDER BY m.status = 'nouveau' DESC, m.created_at DESC LIMIT 300`),
    get: db.prepare(`SELECT m.*, a.name AS author_name, p.title AS photo_title, p.slug AS photo_slug, p.file, p.width, p.height, p.variant_key, p.status AS photo_status
      FROM messages m LEFT JOIN authors a ON a.id = m.author_id LEFT JOIN photos p ON p.id = m.photo_id WHERE m.id = ?`),
    pending: db.prepare("SELECT COUNT(*) FROM messages WHERE status = 'nouveau' AND (@author IS NULL OR author_id = @author OR author_id IS NULL)").pluck(),
    done: db.prepare("UPDATE messages SET status = 'traite', done_at = ? WHERE id = ? AND status = 'nouveau'"),
    remove: db.prepare('DELETE FROM messages WHERE id = ?'),
    purge: db.prepare('DELETE FROM messages WHERE created_at < ?'),
    toNotify: db.prepare('SELECT id, author_id FROM messages WHERE notified_at IS NULL ORDER BY id'),
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
    if (line) v = v.replace(/\s+/g, ' ');
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
    let authorId = null, usage = '';
    if (kind === 'contact') {
      const pour = choose(body, 'pour', [...authors.map(a => a.slug), ALL], forged);
      if (!pour) errors.pour = 'pour';
      authorId = pour && pour !== ALL ? authors.find(a => a.slug === pour).id : null;
    } else {
      usage = choose(body, 'usage', USAGES, forged);
      if (!usage) errors.usage = 'usage';
      authorId = photo?.author_id ?? null;
    }
    for (const f of forged) if (f.raison === 'saisie hors formulaire') errors[f.champ] ||= 'long';
    if (!v.message) errors.message ||= 'message';
    if (!v.name) errors.name ||= 'name';
    if (!v.email) errors.email ||= 'email_required';
    else if (!EMAIL.test(v.email)) errors.email ||= 'email';
    if (Object.keys(errors).length) throw new MessageError(errors, forged);
    const row = { kind, author_id: authorId, photo_id: photo?.id ?? null, usage, lang: ['fr', 'en', 'de'].includes(lang) ? lang : 'fr', created_at: now() };
    for (const k of SEALED) row[k] = vault.seal(v[k]);
    return Number(q.insert.run(row).lastInsertRowid);
  }

  // Portée d'un compte (request.scope('messages.traiter')) → filtre : null (tout), le photographe lié (ses messages et
  // ceux adressés aux deux), ou rien.
  const authorOf = scope => (!scope ? undefined : scope.all ? null : scope.authorId);
  const list = scope => { const a = authorOf(scope); return a === undefined ? [] : q.list.all({ author: a }); };
  const pending = scope => { const a = authorOf(scope); return a === undefined ? 0 : q.pending.get({ author: a }); };
  // Le message déchiffré (fiche de l'admin) ; null s'il n'existe pas.
  function get(id) {
    const r = q.get.get(id);
    if (!r) return null;
    for (const k of SEALED) r[k] = vault.open(r[k]);
    return r;
  }
  const raw = id => q.get.get(id) || null;
  // Le compte voit-il ce message ? (portée « tout », ou adressé à son photographe, ou aux deux).
  const sees = (scope, r) => Boolean(scope && r && (scope.all || r.author_id == null || r.author_id === scope.authorId));
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
  return { submit, list, pending, get, raw, sees, done, remove, purge, sealExisting,
    // Pour les notifications (server/reminders.js) : les messages pas encore annoncés, puis notés comme annoncés.
    toNotify: () => q.toNotify.all(), notified: id => q.notified.run(now(), id) };
}
