import crypto from 'node:crypto';
import sharp from 'sharp';
import { nearest } from './geo/cities.js';

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

  // QR générique d'un photographe (/bonjour/J, tee-shirt) : la lettre seule désigne l'auteur.
  const photographer = letter => (/^[A-Za-z]$/.test(String(letter || '')) ? q.authorByPrefix.get({ p: String(letter).toUpperCase() }) || null : null);

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
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(c?.ref ?? null, c?.author?.id ?? photographer(body.photographer)?.id ?? null, lang, metOn, text(body.met_time, 20), place, text(body.details, 500), t, t).lastInsertRowid);
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
    return { ...e, consent, last, hasCard: e.card_jpeg != null, hasPortrait: e.portrait_jpeg != null, hasSignature: e.signature_png != null, card_jpeg: undefined, portrait_jpeg: undefined, signature_png: undefined };
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

  // ---------- numérotation ----------
  // Prochain numéro d'une lettre : après les cartes déjà imprimées (« cards_printed ») et les rencontres existantes.
  const printed = () => { try { return JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'cards_printed'").pluck().get() || '{}'); } catch { return {}; } };
  function nextNumber(prefix) {
    const used = db.prepare("SELECT ref FROM encounters WHERE ref LIKE ? || '-%'").pluck().all(prefix).map(r => Number(r.split('-')[1]) || 0);
    return Math.max(Number(printed()[prefix]) || 0, ...used, 0) + 1;
  }
  function reserve(prefix, last) {
    const p = printed();
    p[prefix] = Math.max(Number(p[prefix]) || 0, last);
    db.prepare("INSERT INTO settings (key, value) VALUES ('cards_printed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(p));
  }

  // ---------- rencontre saisie sur le téléphone ----------
  // Avec la personne : photo de repère, nom, accord signé au doigt (ou refus), majorité, position arrondie (~100 m).
  // La rencontre reçoit le numéro suivant du photographe (comme une carte) ; son code de contrôle sert au QR affiché.
  async function saveApp(body, { author, portrait = null }) {
    const errors = {};
    if (!author) errors.author = 'Aucun photographe lié à votre compte : choisissez-le.';
    const decision = ['accord', 'refus'].includes(body.decision) ? body.decision : '';
    const scopes = scopesOf(body);
    const name = text(body.name, 80);
    const email = text(body.email, 200);
    if (email && !EMAIL.test(email)) errors.email = 'Adresse e-mail invalide.';
    const adult = body.adult === 'oui' ? 1 : body.adult === 'non' ? 0 : null;
    const guardian = text(body.guardian, 80);
    let signature = null;
    if (decision === 'accord') {
      if (!SCOPES.slice(0, 3).some(s => scopes[s])) errors.scopes = 'Cochez au moins un usage accepté.';
      if (!name) errors.name = 'Le nom de la personne est nécessaire avec son accord.';
      if (adult === null) errors.adult = 'Indiquez si la personne est majeure.';
      if (adult === 0 && !guardian) errors.guardian = 'Personne mineure : le nom du parent qui signe est nécessaire.';
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.signature || ''));
      const raw = m ? Buffer.from(m[1], 'base64') : null;
      if (!raw || raw.length > 600_000) errors.signature = 'La signature manque.';
      else {
        try {
          // Réencodée (jamais le fichier reçu tel quel), sur fond blanc, 1200 px de large au plus.
          signature = await sharp(raw, { limitInputPixels: 4e6 }).flatten({ background: '#ffffff' }).resize({ width: 1200, withoutEnlargement: true }).png().toBuffer();
        } catch { errors.signature = 'Signature illisible : recommencez.'; }
      }
    }
    if (!decision && !email && !body.wants_photo) errors.what = 'Rien à enregistrer : un accord, un refus, ou au moins une adresse pour envoyer la photo.';
    const lat = Number(body.lat), lon = Number(body.lon);
    const hasPos = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && body.lat !== '' && body.lon !== '';
    if (Object.keys(errors).length) throw new EncounterError(errors);
    let portraitJpeg = null;
    if (portrait) portraitJpeg = await sharp(portrait, { limitInputPixels: 60e6 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const t = now();
    const prefix = author.card_prefix || author.slug.charAt(0).toUpperCase();
    // Position arrondie à 0,001° (~100 m) ; la ville la plus proche sert de lieu.
    const pos = hasPos ? { lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 } : null;
    const city = pos ? nearest(lat, lon) : null;
    const lang = ['fr', 'en', 'de'].includes(body.lang) ? body.lang : 'fr';
    const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(t);
    return db.transaction(() => {
      const number = nextNumber(prefix);
      const ref = `${prefix}-${String(number).padStart(4, '0')}`;
      reserve(prefix, number);
      const row = { ref, author_id: author.id, status: 'en_cours', verified: decision === 'accord' ? 1 : 0, email, name, lang, wants_photo: body.wants_photo === 'on' || Boolean(email) ? 1 : 0,
        consent: decision === 'accord' ? JSON.stringify(scopes) : null, consent_source: decision === 'accord' ? 'signature' : null, consent_at: decision === 'accord' ? t : null,
        refused: decision === 'refus' ? 1 : 0, refused_at: decision === 'refus' ? t : null, met_on: parisDay, met_time: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(t),
        place: text(body.place, 120) || (city ? city.label : ''), details: text(body.details, 500), portrait_jpeg: portraitJpeg, signature_png: signature,
        lat: pos?.lat ?? null, lon: pos?.lon ?? null, adult, guardian: adult === 0 ? guardian : '', created_at: t, updated_at: t };
      const cols = Object.keys(row);
      const id = Number(db.prepare(`INSERT INTO encounters (${cols.join(', ')}) VALUES (${cols.map(c => `@${c}`).join(', ')})`).run(row).lastInsertRowid);
      log(id, 'app', { decision, scopes: decision === 'accord' ? scopes : undefined, adult, guardian: guardian || undefined, portrait: Boolean(portraitJpeg), position: Boolean(pos) }, decision === 'accord');
      return { id, ref, code: codeOf(ref) };
    })();
  }
  const markMailed = id => { db.prepare('UPDATE encounters SET mailed_at = ? WHERE id = ?').run(now(), id); log(id, 'email', {}); };

  // ---------- photo offerte ----------
  // Lien privé vers une photo liée à la rencontre : jeton de 192 bits, valable 30 jours, révocable.
  const SHARE_DAYS = 30;
  function createShare(id, photoId) {
    const linked = q.photos.all(id).some(p => p.id === Number(photoId));
    if (!linked) throw new EncounterError({ photo: 'Liez d’abord la photo à la rencontre.' });
    const token = crypto.randomBytes(24).toString('base64url');
    const t = now();
    db.prepare('INSERT INTO encounter_shares (token, encounter_id, photo_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(token, id, Number(photoId), t, t + SHARE_DAYS * 864e5);
    log(id, 'lien', { photo: Number(photoId) });
    touch(id);
    return token;
  }
  const shares = id => db.prepare('SELECT * FROM encounter_shares WHERE encounter_id = ? ORDER BY created_at DESC').all(id);
  // Lien valide (non expiré) : la rencontre, la photo et l'auteur ; sinon null.
  function share(token) {
    if (!/^[\w-]{32}$/.test(String(token || ''))) return null;
    const s = db.prepare(`SELECT s.*, e.lang, e.name, e.ref, p.file, p.title, p.width, p.height, a.name AS author FROM encounter_shares s
      JOIN encounters e ON e.id = s.encounter_id JOIN photos p ON p.id = s.photo_id JOIN authors a ON a.id = p.author_id WHERE s.token = ?`).get(token);
    if (!s) return null;
    return { ...s, expired: s.expires_at <= now() };
  }
  const countShare = (token, kind) => db.prepare(`UPDATE encounter_shares SET ${kind === 'download' ? 'downloads' : 'views'} = ${kind === 'download' ? 'downloads' : 'views'} + 1, last_at = ? WHERE token = ?`).run(now(), token);
  const revokeShare = (id, token) => db.prepare('DELETE FROM encounter_shares WHERE encounter_id = ? AND token = ?').run(id, token).changes > 0;
  // Demandes sans accord ni refus, sans nouvelle depuis 12 mois : effacées (adresse, message, photo de carte).
  const purge = () => {
    db.prepare('DELETE FROM encounter_shares WHERE expires_at < ?').run(now() - 30 * 864e5);       // liens expirés depuis un mois
    return db.prepare('DELETE FROM encounters WHERE updated_at < ? AND consent IS NULL AND refused = 0').run(now() - RETENTION).changes;
  };

  return {
    createShare, shares, share, countShare, revokeShare, photographer, nextNumber, reserve, saveApp, markMailed,
    portraitJpeg: id => db.prepare('SELECT portrait_jpeg FROM encounters WHERE id = ?').pluck().get(id) || null,
    signaturePng: id => db.prepare('SELECT signature_png FROM encounters WHERE id = ?').pluck().get(id) || null,
    parseRef, card, codeOf, submit, list, get, events, photos: id => q.photos.all(id), saveCard, setStatus, link, unlink, applyRefusal, remove, purge,
    cardJpeg: id => db.prepare('SELECT card_jpeg FROM encounters WHERE id = ?').pluck().get(id) || null,
    countNew: () => q.countNew.get(),
    // Accords et refus attachés à une photo (fiche photo) ; refus = publication impossible.
    forPhoto: photoId => q.forPhoto.all(photoId).map(decorate),
    refusalFor: photoId => q.forPhoto.all(photoId).find(e => e.refused) || null,
  };
}
