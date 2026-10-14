import crypto from 'node:crypto';

// Rencontres : les personnes photographiées dans la rue.
//   - Carte « pour eux » : référence de l'auteur (J-0142), et sur les cartes générées par le site un code de contrôle
//     (J-0142-K7Q) qui prouve que la personne a bien la carte en main. Sans code (cartes au tampon) : « non vérifiée ».
//   - Page /bonjour : recevoir sa photo, accepter ou refuser la publication, écrire un message.
//   - Carte « pour nous » : l'accord signé, saisi dans l'admin avec la photo de la carte (preuve).
// Un refus l'emporte toujours : les photos liées ne peuvent plus être publiées. Rien n'est envoyé par e-mail :
// l'auteur répond depuis sa messagerie. Demandes sans accord ni refus effacées après 12 mois.

export const SCOPES = ['site', 'instagram', 'print', 'name'];
export const SCOPE_LABELS = { site: 'site', instagram: 'Instagram', print: 'expositions et tirages', name: 'avec son prénom' };
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';       // sans 0/O, 1/I/L : lisible à la main
const RETENTION = 365 * 24 * 3600 * 1000;
const EMAIL = /^[^\s@<>]{1,100}@[^\s@<>]{1,100}\.[^\s@<>]{2,30}$/;

export class EncounterError extends Error {
  constructor(errors) { super(Object.values(errors).join(' ')); this.errors = errors; }
}

const text = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

// « j142 », « J-0142 », « J 0142 k7q » → { prefix: 'J', ref: 'J-0142', code: 'K7Q' } ; sinon null.
export function parseRef(input) {
  const m = /^\s*([A-Za-z])\s*[-–. ]?\s*(\d{1,5})(?:\s*[-–. ]?\s*([A-Za-z0-9]{3}))?\s*$/.exec(String(input || ''));
  if (!m || Number(m[2]) < 1) return null;
  const prefix = m[1].toUpperCase();
  return { prefix, number: Number(m[2]), ref: `${prefix}-${String(Number(m[2])).padStart(4, '0')}`, code: m[3] ? m[3].toUpperCase() : null };
}

export function createEncounters({ db, now = () => Date.now() }) {
  const q = {
    setting: db.prepare("SELECT value FROM settings WHERE key = 'encounter_key'").pluck(),
    saveKey: db.prepare("INSERT INTO settings (key, value) VALUES ('encounter_key', ?) ON CONFLICT(key) DO NOTHING"),
    byRef: db.prepare('SELECT * FROM encounters WHERE ref = ?'),
    byId: db.prepare('SELECT e.*, a.name AS author FROM encounters e LEFT JOIN authors a ON a.id = e.author_id WHERE e.id = ?'),
    // Lettre des cartes réglée dans Auteurs ; sinon, la première lettre de l'adresse de l'auteur.
    authorByPrefix: db.prepare(`SELECT id, name, slug FROM authors WHERE card_prefix = @p OR (card_prefix = '' AND upper(substr(slug, 1, 1)) = @p)
      ORDER BY card_prefix = @p DESC, id LIMIT 1`),
    event: db.prepare('INSERT INTO encounter_events (encounter_id, at, kind, verified, detail) VALUES (?, ?, ?, ?, ?)'),
    events: db.prepare('SELECT * FROM encounter_events WHERE encounter_id = ? ORDER BY at, id'),
    photos: db.prepare(`SELECT p.id, p.title, p.slug, p.status, p.file, p.width, p.height, p.variant_key, p.taken_on FROM encounter_photos ep
      JOIN photos p ON p.id = ep.photo_id WHERE ep.encounter_id = ? ORDER BY p.position, p.id`),
    forPhoto: db.prepare(`SELECT e.id, e.ref, e.name, e.consent, e.consent_source, e.refused, e.verified FROM encounter_photos ep
      JOIN encounters e ON e.id = ep.encounter_id WHERE ep.photo_id = ? ORDER BY e.id`),
    countNew: db.prepare("SELECT COUNT(*) FROM encounters WHERE status = 'nouvelle'").pluck(),
  };

  // Clé des codes de contrôle : tirée au hasard une fois, gardée en base (indépendante des autres secrets du serveur,
  // pour que les cartes déjà imprimées restent valables).
  function key() {
    let k = q.setting.get();
    if (!k) { q.saveKey.run(JSON.stringify(crypto.randomBytes(32).toString('hex'))); k = q.setting.get(); }
    return Buffer.from(JSON.parse(k), 'hex');
  }
  function codeOf(ref) {
    const h = crypto.createHmac('sha256', key()).update(ref).digest();
    return [0, 1, 2].map(i => CODE_CHARS[h[i] % CODE_CHARS.length]).join('');
  }
  const verify = (ref, code) => Boolean(code) && crypto.timingSafeEqual(Buffer.from(codeOf(ref)), Buffer.from(String(code).toUpperCase().padEnd(3).slice(0, 3)));

  // Carte (ou référence tapée) : la référence, l'auteur d'après le préfixe, et si le code de contrôle est bon.
  function card(input) {
    const r = parseRef(input);
    if (!r) return null;
    const author = q.authorByPrefix.get({ p: r.prefix }) || null;
    return { ...r, author, verified: r.code ? verify(r.ref, r.code) : false, badCode: Boolean(r.code) && !verify(r.ref, r.code) };
  }

  const scopesOf = body => Object.fromEntries(SCOPES.map(s => [s, body[`scope_${s}`] === 'on' || body[`scope_${s}`] === true]));
  const log = (id, kind, detail = {}, verified = false) => q.event.run(id, now(), kind, verified ? 1 : 0, JSON.stringify(detail));
  const touch = id => db.prepare('UPDATE encounters SET updated_at = ? WHERE id = ?').run(now(), id);

  // ---------- page /bonjour ----------
  // Une demande : retrouver la personne (carte, ou date et lieu), ce qu'elle veut, et de quoi lui répondre.
  function submit(body, { lang = 'fr' } = {}) {
    const errors = {};
    const c = text(body.ref, 20) ? card(body.ref) : null;
    if (text(body.ref, 20) && !c) errors.ref = 'ref';
    if (c?.badCode) errors.ref = 'code';
    const metOn = /^\d{4}-\d{2}-\d{2}$/.test(String(body.met_on || '')) ? body.met_on : '';
    const place = text(body.place, 120);
    if (!c && !(metOn && place)) errors.where = 'where';
    const wantsPhoto = body.wants_photo === 'on';
    const decision = ['accord', 'refus'].includes(body.decision) ? body.decision : '';
    const scopes = scopesOf(body);
    if (decision === 'accord' && !SCOPES.slice(0, 3).some(s => scopes[s])) errors.scopes = 'scopes';
    const email = text(body.email, 200);
    const name = text(body.name, 80);
    const message = text(body.message, 2000);
    if (email && !EMAIL.test(email)) errors.email = 'email';
    // Un refus peut rester anonyme ; recevoir la photo, accepter ou attendre une réponse demande une adresse.
    else if (!email && (wantsPhoto || decision === 'accord' || (message && decision !== 'refus'))) errors.email = 'email_required';
    if (decision === 'accord' && !name) errors.name = 'name';
    if (!wantsPhoto && !decision && !message) errors.what = 'what';
    if (Object.keys(errors).length) throw new EncounterError(errors);

    const t = now();
    const detail = { wants_photo: wantsPhoto, decision, scopes: decision === 'accord' ? scopes : undefined, message: message || undefined,
      email: email || undefined, name: name || undefined, met_on: metOn || undefined, met_time: text(body.met_time, 20) || undefined,
      place: place || undefined, details: text(body.details, 500) || undefined, code: c ? (c.verified ? 'ok' : 'absent') : undefined };
    return db.transaction(() => {
      let e = c ? q.byRef.get(c.ref) : null;
      if (!e) {
        const id = Number(db.prepare(`INSERT INTO encounters (ref, author_id, lang, met_on, met_time, place, details, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(c?.ref ?? null, c?.author?.id ?? null, lang, metOn, text(body.met_time, 20), place, text(body.details, 500), t, t).lastInsertRowid);
        e = { id, verified: 0 };
      }
      const set = { status: 'nouvelle', lang, updated_at: t, verified: e.verified || (c?.verified ? 1 : 0) };
      if (email) set.email = email;
      if (name) set.name = name;
      if (wantsPhoto) set.wants_photo = 1;
      // Le dernier choix exprimé l'emporte ; l'historique garde les précédents.
      if (decision === 'refus') Object.assign(set, { refused: 1, refused_at: t });
      if (decision === 'accord') Object.assign(set, { refused: 0, consent: JSON.stringify(scopes), consent_source: 'en_ligne', consent_at: t });
      const cols = Object.keys(set);
      db.prepare(`UPDATE encounters SET ${cols.map(k => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...set, id: e.id });
      log(e.id, 'visiteur', detail, c?.verified);
      return { id: e.id, ref: c?.ref ?? null, author: c?.author?.name ?? null, verified: Boolean(c?.verified) };
    })();
  }

  // ---------- admin ----------
  function list({ status } = {}) {
    const rows = db.prepare(`SELECT e.id, e.ref, e.status, e.verified, e.email, e.name, e.wants_photo, e.consent, e.consent_source, e.refused,
        e.met_on, e.place, e.created_at, e.updated_at, a.name AS author,
        (SELECT COUNT(*) FROM encounter_photos ep WHERE ep.encounter_id = e.id) AS photos,
        (SELECT detail FROM encounter_events ev WHERE ev.encounter_id = e.id AND ev.kind = 'visiteur' ORDER BY ev.at DESC, ev.id DESC LIMIT 1) AS last
      FROM encounters e LEFT JOIN authors a ON a.id = e.author_id
      ${status ? 'WHERE e.status = ?' : ''} ORDER BY (e.status = 'nouvelle') DESC, e.updated_at DESC LIMIT 500`).all(...(status ? [status] : []));
    return rows.map(decorate);
  }
  function decorate(e) {
    if (!e) return null;
    let consent = null; let last = null;
    try { consent = e.consent ? JSON.parse(e.consent) : null; } catch { consent = null; }
    try { last = e.last ? JSON.parse(e.last) : null; } catch { last = null; }
    return { ...e, consent, last, hasCard: e.card_jpeg != null, card_jpeg: undefined };
  }
  const get = id => decorate(q.byId.get(id));
  const events = id => q.events.all(id).map(ev => ({ ...ev, detail: JSON.parse(ev.detail || '{}') }));

  // Accord papier (carte « pour nous ») ou rencontre créée à la main ; la photo de la carte est la preuve.
  function saveCard(id, body, cardJpeg = null) {
    const errors = {};
    const c = text(body.ref, 20) ? card(body.ref) : null;
    if (text(body.ref, 20) && !c) errors.ref = 'Référence illisible : une lettre et un numéro, par exemple J-0142.';
    const scopes = scopesOf(body);
    const signed = body.signed === 'on';
    if (signed && !SCOPES.slice(0, 3).some(s => scopes[s])) errors.scopes = 'Cochez au moins un usage accepté sur la carte.';
    const email = text(body.email, 200);
    if (email && !EMAIL.test(email)) errors.email = 'Adresse e-mail invalide.';
    const metOn = /^\d{4}-\d{2}-\d{2}$/.test(String(body.met_on || '')) ? body.met_on : '';
    const authorId = Number(body.author_id) || c?.author?.id || null;
    if (Object.keys(errors).length) throw new EncounterError(errors);
    const t = now();
    return db.transaction(() => {
      let target = id ? q.byId.get(id) : (c ? q.byRef.get(c.ref) : null);
      if (c && target && target.ref !== c.ref && q.byRef.get(c.ref)) throw new EncounterError({ ref: `La référence ${c.ref} est déjà une autre rencontre.` });
      if (!target) {
        target = { id: Number(db.prepare('INSERT INTO encounters (ref, author_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(c?.ref ?? null, authorId, 'en_cours', t, t).lastInsertRowid) };
      }
      const set = { ref: c?.ref ?? target.ref ?? null, author_id: authorId ?? target.author_id ?? null, name: text(body.name, 80), email, met_on: metOn,
        place: text(body.place, 120), details: text(body.details, 500), updated_at: t };
      if (signed) Object.assign(set, { consent: JSON.stringify(scopes), consent_source: 'carte', consent_at: t, refused: 0, verified: 1 });
      if (cardJpeg) set.card_jpeg = cardJpeg;
      db.prepare(`UPDATE encounters SET ${Object.keys(set).map(k => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...set, id: target.id });
      log(target.id, 'carte', { signed, scopes: signed ? scopes : undefined, card: Boolean(cardJpeg) }, signed);
      return target.id;
    })();
  }

  function setStatus(id, status) {
    if (!['nouvelle', 'en_cours', 'traitee'].includes(status)) return;
    db.prepare('UPDATE encounters SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  }
  function link(id, photoIds) {
    const add = db.prepare('INSERT OR IGNORE INTO encounter_photos (encounter_id, photo_id) SELECT ?, id FROM photos WHERE id = ?');
    db.transaction(() => { for (const p of photoIds) add.run(id, Number(p)); log(id, 'liaison', { photos: photoIds.map(Number) }); touch(id); })();
  }
  function unlink(id, photoId) {
    db.prepare('DELETE FROM encounter_photos WHERE encounter_id = ? AND photo_id = ?').run(id, photoId);
    log(id, 'liaison', { retiree: Number(photoId) });
  }
  // Refus : les photos liées repassent en brouillon (l'appelant retire aussi la file Instagram).
  function applyRefusal(id) {
    const ids = q.photos.all(id).filter(p => p.status === 'published').map(p => p.id);
    const set = db.prepare("UPDATE photos SET status = 'draft', updated_at = datetime('now') WHERE id = ?");
    db.transaction(() => { for (const p of ids) set.run(p); log(id, 'refus_applique', { photos: ids }); touch(id); })();
    return ids;
  }
  const remove = id => db.prepare('DELETE FROM encounters WHERE id = ?').run(id).changes > 0;
  // Demandes sans accord ni refus, sans nouvelle depuis 12 mois : effacées (adresse, message, photo de carte).
  const purge = () => db.prepare('DELETE FROM encounters WHERE updated_at < ? AND consent IS NULL AND refused = 0').run(now() - RETENTION).changes;

  return {
    parseRef, card, codeOf, submit, list, get, events, photos: id => q.photos.all(id), saveCard, setStatus, link, unlink, applyRefusal, remove, purge,
    cardJpeg: id => db.prepare('SELECT card_jpeg FROM encounters WHERE id = ?').pluck().get(id) || null,
    countNew: () => q.countNew.get(),
    // Accords et refus attachés à une photo (fiche photo) ; refus = publication impossible.
    forPhoto: photoId => q.forPhoto.all(photoId).map(decorate),
    refusalFor: photoId => q.forPhoto.all(photoId).find(e => e.refused) || null,
  };
}
