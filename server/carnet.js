import crypto from 'node:crypto';
import { slugify } from './slug.js';
import { translator } from './admin-i18n.js';
import { toStored, photoIdsOf, refsOf, renderBody, scanPlain, emptyCounts, totalCount, structureError } from './carnet-markdown.js';

// Carnets : les billets du site (étude docs/etudes/blog-galeries-boutique.md, partie 1 ; maquettes MQ-11, MQ-12, MQ-20 ;
// décisions du propriétaire dans docs/etudes/vigie-besoins-des-briques.md, « Tranché »). Migration 055.
//
// Circuit de publication (§ 1.6), sur le modèle de server/review.js (pas son code, lié aux photos) :
//   brouillon, a_reprendre --Proposer--> propose --Retirer sa proposition--> brouillon
//   brouillon, propose, a_reprendre --Publier--> publie            (carnet.publier)
//   brouillon, propose, a_reprendre --Programmer--> programme      (carnet.publier ; publish_at futur)
//   programme --échéance (runDue)--> publie, ou a_reprendre si une photo n'est plus publiée
//   programme --Déprogrammer--> propose ou brouillon
//   propose, programme --Renvoyer (remarque)--> a_reprendre
//   publie --Retirer (raison)--> retire (410)     retire --Republier--> publie
// Une seule fonction met un billet programmé en ligne : runDue(), appelée chaque minute par la minuterie de server/app.js
// (point d'accroche de la Vigie pour BV-20 et BV-21 : sub = null, émetteur « publication programmée »).

export const STATES = ['brouillon', 'propose', 'a_reprendre', 'programme', 'publie', 'retire'];
// Rubriques (décision 8 : rubrique et regard plutôt qu'étiquettes) : liste fermée, celle du filtre ?rubrique= (BV-13).
export const RUBRIQUES = ['voyages', 'atelier'];
export const RUBRIQUE_NAMES = {
  fr: { voyages: 'Voyages', atelier: 'Notes d’atelier' },
  en: { voyages: 'Travels', atelier: 'Workshop notes' },
  de: { voyages: 'Reisen', atelier: 'Werkstattnotizen' },
};
export const LANGS = ['fr', 'en', 'de'];
export const LIMITS = { title: 120, dek: 300, body: 60000, mention: 300, reply: 4000, legend: 300, alt: 300, message: 1000 };
// Repères éditoriaux signalés (sans bloquer) : au-delà, les moteurs de recherche coupent (MQ-20, repère 5).
export const ADVISE = { title: 70, dek: 160 };
const TEXTS = ['title', 'dek', 'body', 'mention', 'reply'];
export const TEXT_FIELDS = TEXTS.flatMap(f => [f, `${f}_en`, `${f}_de`]);
const col = (f, lang) => (lang === 'fr' ? f : `${f}_${lang}`);
const MAX_REVISIONS = 30;
const SYSTEM = { sub: null, name: 'publication programmée' };

// Jour et heure d'une publication programmée, écrits librement (MQ-20 : « sam. 17 oct., 8 h », « 17/10 8:00 », « samedi
// 8 h », ou le champ datetime-local « 2026-10-17T08:00 »), à l'heure de Paris → instant (ms), ou null s'ils ne se lisent
// pas. Sans année : l'année en cours (une date passée reste passée, et se refuse) ; sans date : aujourd'hui, ou demain si
// l'heure est passée. Un jour de la semaine seul : le prochain.
const MONTHS = { janv: 1, jan: 1, janvier: 1, january: 1, januar: 1, fevr: 2, fev: 2, fevrier: 2, feb: 2, february: 2, februar: 2, mars: 3, march: 3, marz: 3, maerz: 3,
  avr: 4, avril: 4, apr: 4, april: 4, mai: 5, may: 5, juin: 6, jun: 6, june: 6, juni: 6, juil: 7, juillet: 7, jul: 7, july: 7, juli: 7, aout: 8, aug: 8, august: 8,
  sept: 9, sep: 9, septembre: 9, september: 9, oct: 10, octobre: 10, october: 10, oktober: 10, okt: 10, nov: 11, novembre: 11, november: 11, dec: 12, decembre: 12, december: 12, dez: 12, dezember: 12 };
const WEEKDAYS = { dim: 0, dimanche: 0, sun: 0, sunday: 0, sonntag: 0, lun: 1, lundi: 1, mon: 1, monday: 1, montag: 1, mardi: 2, tue: 2, tuesday: 2, dienstag: 2,
  mer: 3, mercredi: 3, wed: 3, wednesday: 3, mittwoch: 3, jeu: 4, jeudi: 4, thu: 4, thursday: 4, donnerstag: 4, ven: 5, vendredi: 5, fri: 5, friday: 5, freitag: 5,
  sam: 6, samedi: 6, sat: 6, saturday: 6, samstag: 6 };
const parisOffset = ms => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' }).formatToParts(ms).find(x => x.type === 'timeZoneName').value;
  const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(p);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
};
const parisToday = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms).split('-').map(Number);
function parisInstant(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(guess);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59) return null;
  let t = guess - parisOffset(guess) * 60000;
  t = guess - parisOffset(t) * 60000;
  return t;
}
export function parseWhen(raw, now = Date.now()) {
  const src = String(raw ?? '').trim();
  if (!src || src.length > 80) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(src);
  if (iso) return parisInstant(...iso.slice(1).map(Number));
  let s = ` ${src.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[,.;]/g, ' ').replace(/\s+/g, ' ')} `;
  let h = null, mi = 0;
  const tm = /\s(\d{1,2})\s?(?:h|:|uhr)\s?(\d{2})?(?:\s?uhr)?(?=\s)/.exec(s) || /\s(\d{1,2})\s?(am|pm)(?=\s)/.exec(s);
  if (tm) {
    h = Number(tm[1]);
    if (tm[2] === 'am' || tm[2] === 'pm') { if (h > 12) return null; h = (h % 12) + (tm[2] === 'pm' ? 12 : 0); } else mi = Number(tm[2] || 0);
    s = s.replace(tm[0], ' ');
  }
  if (h == null) return null;
  const [ty, tmo, td] = parisToday(now);
  let y = null, mo = null, d = null;
  const num = /\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/.exec(s) || /\s(\d{4})-(\d{2})-(\d{2})\s/.exec(s);
  if (num && num[1].length === 4) { y = Number(num[1]); mo = Number(num[2]); d = Number(num[3]); }
  else if (num) { d = Number(num[1]); mo = Number(num[2]); y = num[3] ? Number(num[3].length === 2 ? `20${num[3]}` : num[3]) : null; }
  else {
    const named = /\s(\d{1,2})(?:er)?\s([a-z]+)(?:\s(\d{4}))?\s/.exec(s);
    if (named && MONTHS[named[2]]) { d = Number(named[1]); mo = MONTHS[named[2]]; y = named[3] ? Number(named[3]) : null; }
  }
  if (d == null) {
    const words = s.trim().split(' ');
    const rel = words.find(w => ['demain', 'tomorrow', 'morgen'].includes(w)) ? 1 : words.find(w => ['aujourd\'hui', 'aujourdhui', 'today', 'heute'].includes(w)) ? 0 : null;
    const wd = words.map(w => WEEKDAYS[w]).find(x => x != null);
    const base = Date.UTC(ty, tmo - 1, td);
    let add = 0;
    if (rel != null) add = rel;
    else if (wd != null) { add = (wd - new Date(base).getUTCDay() + 7) % 7; }
    else if (words.some(w => /[a-z]/.test(w))) return null;
    const day = new Date(base + add * 864e5);
    let t = parisInstant(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, mi);
    if (t != null && t <= now && rel == null) t = parisInstant(...(() => { const n = new Date(base + (add + (wd != null ? 7 : 1)) * 864e5); return [n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate()]; })(), h, mi);
    return t;
  }
  return parisInstant(y ?? ty, mo, d, h, mi);
}

export class CarnetError extends Error {
  constructor(message, { field = null, status = 422, details = null } = {}) { super(message); this.field = field; this.status = status; this.details = details; }
}

export function createCarnet({ db, repo, readiness, accounts, mailer, audit, siteName = () => '', publicUrl = '', log, now = Date.now, onWrite = () => {} }) {
  const q = {
    get: db.prepare('SELECT * FROM posts WHERE id = ?'),
    bySlug: db.prepare('SELECT * FROM posts WHERE slug = ?'),
    oldSlug: db.prepare('SELECT post_id FROM post_slugs WHERE slug = ?').pluck(),
    all: db.prepare('SELECT * FROM posts ORDER BY COALESCE(published_at, updated_at) DESC, id DESC'),
    published: db.prepare("SELECT * FROM posts WHERE state = 'publie' AND visibility = 'public' ORDER BY published_at DESC, id DESC"),
    authors: db.prepare('SELECT author_id FROM post_authors WHERE post_id = ? ORDER BY position, author_id').pluck(),
    setAuthors: db.prepare('INSERT INTO post_authors (post_id, author_id, position) VALUES (?, ?, ?)'),
    clearAuthors: db.prepare('DELETE FROM post_authors WHERE post_id = ?'),
    authorExists: db.prepare('SELECT 1 FROM authors WHERE id = ?').pluck(),
    photoExists: db.prepare('SELECT 1 FROM photos WHERE id = ?').pluck(),
    tripExists: db.prepare('SELECT 1 FROM trips WHERE id = ?').pluck(),
    settings: db.prepare('SELECT * FROM post_photos WHERE post_id = ?'),
    setting: db.prepare('SELECT * FROM post_photos WHERE post_id = ? AND photo_id = ?'),
    addSetting: db.prepare('INSERT INTO post_photos (post_id, photo_id) VALUES (?, ?) ON CONFLICT DO NOTHING'),
    dropSetting: db.prepare('DELETE FROM post_photos WHERE post_id = ? AND photo_id = ?'),
    clearRefs: db.prepare('DELETE FROM post_refs WHERE post_id = ?'),
    addRef: db.prepare('INSERT OR IGNORE INTO post_refs (post_id, kind, ref_id) VALUES (?, ?, ?)'),
    citing: db.prepare("SELECT DISTINCT p.* FROM post_refs r JOIN posts p ON p.id = r.post_id WHERE r.kind = ? AND r.ref_id = ? AND p.state = 'publie' ORDER BY p.published_at DESC"),
    review: db.prepare('INSERT INTO post_reviews (post_id, action, by_sub, by_name, at, message, publish_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    history: db.prepare('SELECT * FROM post_reviews WHERE post_id = ? ORDER BY at DESC, id DESC'),
    revisions: db.prepare('SELECT id, at, by_name FROM post_revisions WHERE post_id = ? ORDER BY at DESC, id DESC'),
    revision: db.prepare('SELECT * FROM post_revisions WHERE post_id = ? AND id = ?'),
    addRevision: db.prepare('INSERT INTO post_revisions (post_id, at, by_sub, by_name, data) VALUES (?, ?, ?, ?, ?)'),
    trimRevisions: db.prepare(`DELETE FROM post_revisions WHERE post_id = ? AND id NOT IN (SELECT id FROM post_revisions WHERE post_id = ? ORDER BY at DESC, id DESC LIMIT ${MAX_REVISIONS})`),
    draft: db.prepare('SELECT * FROM post_drafts WHERE post_id = ?'),
    saveDraft: db.prepare(`INSERT INTO post_drafts (post_id, data, by_sub, by_name, at, version) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(post_id) DO UPDATE SET data = excluded.data, by_sub = excluded.by_sub, by_name = excluded.by_name, at = excluded.at, version = excluded.version`),
    dropDraft: db.prepare('DELETE FROM post_drafts WHERE post_id = ?'),
    due: db.prepare("SELECT id FROM posts WHERE state = 'programme' AND publish_at <= ? ORDER BY publish_at, id").pluck(),
    count: db.prepare("SELECT COUNT(*) FROM posts WHERE state = 'publie' AND visibility = 'public'").pluck(),
  };

  const hydrate = row => (!row ? null : {
    ...row, authors: q.authors.all(row.id), contact: Boolean(row.contact),
    langs: ['fr', ...LANGS.filter(l => l !== 'fr' && String(row.langs || '').split(',').includes(l))],
  });
  const get = id => hydrate(q.get.get(Number(id)));

  const review = (id, action, by = {}, message = '', at = null) => q.review.run(id, action, by.sub || null, by.name || '', now(), String(message || '').slice(0, LIMITS.message), at);
  const uniqueSlug = (base, id = null) => {
    const root = slugify(base) || 'billet';
    for (let i = 1; ; i++) {
      const s = i === 1 ? root : `${root}-${i}`;
      const other = q.bySlug.get(s);
      const old = q.oldSlug.get(s);
      if ((!other || other.id === id) && (old == null || old === id)) return s;
    }
  };
  const clean = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max + 1);

  // Photos du billet : celles de ses corps (les trois langues partagent leurs réglages), sa couverture et son image de partage.
  const photoIds = post => [...new Set([...LANGS.flatMap(l => photoIdsOf(post[col('body', l)])), post.cover_id, post.share_id].filter(Boolean))];
  const bodyPhotoIds = post => [...new Set(LANGS.flatMap(l => photoIdsOf(post[col('body', l)])))];
  // Couverture (B8) : celle choisie, sinon la première photo du billet ; image de partage : celle choisie, sinon la couverture.
  const coverId = post => post.cover_id || photoIdsOf(post.body)[0] || null;
  const shareId = post => post.share_id || coverId(post);

  function sync(id, post) {
    const ids = photoIds(post);
    for (const pid of ids) q.addSetting.run(id, pid);
    for (const s of q.settings.all(id)) if (!ids.includes(s.photo_id)) q.dropSetting.run(id, s.photo_id);
    q.clearRefs.run(id);
    for (const l of LANGS) for (const r of refsOf(post[col('body', l)])) q.addRef.run(id, r.kind, r.id);
    if (post.cover_id) q.addRef.run(id, 'photo', post.cover_id);
    if (post.trip_id) q.addRef.run(id, 'voyage', post.trip_id);
  }
  const snapshot = post => JSON.stringify(Object.fromEntries([...TEXT_FIELDS, 'rubrique', 'cover_id', 'share_id', 'trip_id', 'contact', 'langs'].map(k => [k, post[k]]).concat([['authors', post.authors]])));

  // ---------- écriture ----------
  // input : champs du formulaire, déjà ramenés à la forme de la base (photos par identifiant : toStored). Renvoie les noms
  // des champs changés (journal d'audit : jamais leur valeur, BV-20 et BV-21).
  function validate(post, input) {
    const v = {};
    for (const f of TEXT_FIELDS) {
      if (!(f in input)) continue;
      const base = f.replace(/_(en|de)$/, '');
      const s = clean(input[f], LIMITS[base]);
      if (s.length > LIMITS[base]) throw new CarnetError(`${{ title: 'Titre', dek: 'Chapô', body: 'Texte', mention: 'Mention commerciale', reply: 'Réponse' }[base]} : ${LIMITS[base]} signes au plus.`, { field: f });
      if (base === 'title' || base === 'dek' || base === 'mention') v[f] = s.replace(/\s*\n\s*/g, ' ');
      else {
        // Plafonds de structure (revue de sécurité : déni de service par le contenu d'un billet).
        const err = structureError(s);
        if (err) throw new CarnetError(`Texte refusé : ${err}.`, { field: f });
        v[f] = s;
      }
    }
    if ('title' in v && !v.title) throw new CarnetError('Donnez un titre au billet (en français).', { field: 'title' });
    if ('rubrique' in input) {
      if (!RUBRIQUES.includes(input.rubrique)) throw new CarnetError('Rubrique inconnue.', { field: 'rubrique' });
      v.rubrique = input.rubrique;
    }
    if ('authors' in input) {
      const list = [...new Set([].concat(input.authors || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
      if (!list.length) throw new CarnetError('Un billet a une ou deux signatures.', { field: 'authors' });
      if (list.length > 2) throw new CarnetError('Deux signatures au plus.', { field: 'authors' });
      if (list.some(a => !q.authorExists.get(a))) throw new CarnetError('Photographe inconnu.', { field: 'authors' });
      v.authors = list;
    }
    for (const f of ['cover_id', 'share_id']) {
      if (!(f in input)) continue;
      const n = Number(input[f]) || null;
      if (n && !q.photoExists.get(n)) throw new CarnetError('Photo inconnue.', { field: f });
      v[f] = n;
    }
    if ('trip_id' in input) {
      const n = Number(input.trip_id) || null;
      if (n && !q.tripExists.get(n)) throw new CarnetError('Voyage inconnu.', { field: 'trip_id' });
      v.trip_id = n;
    }
    if ('contact' in input) v.contact = input.contact ? 1 : 0;
    if ('langs' in input) v.langs = ['fr', ...LANGS.filter(l => l !== 'fr' && [].concat(input.langs || []).includes(l))].join(',');
    if ('slug' in input && input.slug != null && String(input.slug).trim() !== '' && String(input.slug).trim() !== post?.slug) {
      const s = slugify(String(input.slug));
      if (!s) throw new CarnetError('Adresse vide : des lettres ou des chiffres.', { field: 'slug' });
      const other = q.bySlug.get(s), old = q.oldSlug.get(s);
      if ((other && other.id !== post?.id) || (old != null && old !== post?.id)) throw new CarnetError('Cette adresse est déjà prise par un autre billet (ou l’a été).', { field: 'slug' });
      v.slug = s;
    }
    return v;
  }

  function create({ title, authors, rubrique = 'atelier', by = {} }) {
    const v = validate(null, { title, authors, rubrique });
    if (!v.title) throw new CarnetError('Donnez un titre au billet (en français).', { field: 'title' });
    const t = now();
    const id = db.transaction(() => {
      const pid = Number(db.prepare('INSERT INTO posts (slug, title, rubrique, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(uniqueSlug(v.title), v.title, v.rubrique, t, t).lastInsertRowid);
      v.authors.forEach((a, i) => q.setAuthors.run(pid, a, i));
      review(pid, 'cree', by);
      return pid;
    })();
    return id;
  }

  // Enregistrer : version attendue (verrou optimiste, B33), champs, case « mise à jour signalée » (B48).
  function update(id, input, by = {}, { version = null, revised = false, publisher = false } = {}) {
    const post = get(id);
    if (!post) throw new CarnetError('Billet introuvable.', { status: 404 });
    if (version != null && Number(version) !== post.version) {
      const d = q.history.all(id)[0];
      throw new CarnetError('Modifié entre-temps : rechargez la page pour voir la dernière version.', { status: 409, details: { by: d?.by_name || '', at: post.updated_at } });
    }
    const v = validate(post, input);
    // Adresse : elle suit le titre tant que le billet n'a jamais été publié ; ensuite, elle ne change que si on la change
    // explicitement, et l'ancienne mène à la nouvelle (301, B3).
    if (!v.slug && post.published_at == null && v.title && v.title !== post.title) v.slug = uniqueSlug(v.title, post.id);
    const changed = Object.keys(v).filter(k => (k === 'authors' ? v.authors.join(',') !== post.authors.join(',') : String(v[k] ?? '') !== String(post[k] ?? '')));
    if (!changed.length && !(revised && post.state === 'publie')) return { changed: [], post };
    const t = now();
    db.transaction(() => {
      const cols = changed.filter(k => k !== 'authors');
      if (cols.length) db.prepare(`UPDATE posts SET ${cols.map(k => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...Object.fromEntries(cols.map(k => [k, v[k]])), id });
      if (changed.includes('authors')) { q.clearAuthors.run(id); v.authors.forEach((a, i) => q.setAuthors.run(id, a, i)); }
      if (changed.includes('slug') && post.published_at != null) db.prepare('INSERT OR REPLACE INTO post_slugs (slug, post_id) VALUES (?, ?)').run(post.slug, id);
      if (changed.some(k => k.startsWith('reply'))) db.prepare('UPDATE posts SET reply_at = ? WHERE id = ?').run(t, id);
      if (revised && post.state === 'publie') { db.prepare('UPDATE posts SET revised_at = ? WHERE id = ?').run(t, id); changed.push('revised_at'); }
      db.prepare('UPDATE posts SET updated_at = ?, version = version + 1 WHERE id = ?').run(t, id);
      const after = get(id);
      sync(id, after);
      q.addRevision.run(id, t, by.sub || null, by.name || '', snapshot(after));
      q.trimRevisions.run(id, id);
      q.dropDraft.run(id);
    })();
    edited(id, changed, publisher);
    return { changed, post: get(id) };
  }
  // Un billet programmé modifié par qui ne publie pas lui-même (texte, réglage d'une photo, photo retirée, version
  // rétablie) repasse en proposition : le modérateur revoit ce qui partira en ligne (revue de sécurité des Carnets ; même
  // règle que les photos). Tout chemin d'écriture passe ici.
  function edited(id, changed, publisher) {
    if (publisher || !changed.length) return;
    const p = q.get.get(id);
    if (p?.state !== 'programme') return;
    const r = db.prepare("UPDATE posts SET state = 'propose', publish_at = NULL, updated_at = ?, version = version + 1 WHERE id = ? AND state = 'programme'").run(now(), id);
    if (r.changes) review(id, 'modifie', { sub: null, name: 'modifié après validation' }, 'Modifié après validation : à revoir.');
  }

  // Réglages d'une photo dans le billet, par langue (MQ-20, « Décrire la photo… »).
  function setPhoto(id, photoId, input, { publisher = false } = {}) {
    const s = q.setting.get(id, photoId);
    if (!s) throw new CarnetError('Cette photo n’est pas dans le billet.', { status: 404 });
    const v = {};
    for (const l of LANGS) {
      for (const f of ['alt', 'legend']) {
        const k = col(f, l);
        if (k in input) {
          const val = clean(input[k], LIMITS[f]).replace(/\s*\n\s*/g, ' ');
          if (val.length > LIMITS[f]) throw new CarnetError(`${f === 'alt' ? 'Texte de remplacement' : 'Légende'} : ${LIMITS[f]} signes au plus.`, { field: k });
          v[k] = val;
        }
      }
    }
    if ('size' in input) v.size = input.size === 'large' ? 'large' : 'texte';
    if ('decorative' in input) v.decorative = input.decorative ? 1 : 0;
    const changed = Object.keys(v).filter(k => String(v[k]) !== String(s[k]));
    if (changed.length) {
      db.prepare(`UPDATE post_photos SET ${changed.map(k => `${k} = @${k}`).join(', ')} WHERE post_id = @post AND photo_id = @photo`).run({ ...Object.fromEntries(changed.map(k => [k, v[k]])), post: id, photo: photoId });
      db.prepare('UPDATE posts SET updated_at = ?, version = version + 1 WHERE id = ?').run(now(), id);
    }
    edited(id, changed, publisher);
    return changed;
  }
  // Retirer une photo du billet : sa ligne dans les trois langues, ses réglages ; couverture et partage laissés au défaut.
  function removePhoto(id, photoId, by = {}, { publisher = false } = {}) {
    const post = get(id);
    if (!post) throw new CarnetError('Billet introuvable.', { status: 404 });
    const input = {};
    for (const l of LANGS) {
      const k = col('body', l);
      const next = String(post[k] || '').split('\n').filter(line => line.trim() !== `photo:${photoId}`).join('\n').replace(/\n{3,}/g, '\n\n');
      if (next !== post[k]) input[k] = next;
    }
    if (post.cover_id === photoId) input.cover_id = null;
    if (post.share_id === photoId) input.share_id = null;
    return update(id, input, by, { publisher });
  }
  // Ajouter des photos en fin de texte, une ligne chacune (sans JavaScript, cases à cocher : B27).
  const appendPhotos = (body, ids) => {
    const have = new Set(photoIdsOf(body));
    const add = ids.filter(x => !have.has(x));
    return add.length ? `${String(body || '').replace(/\s+$/, '')}${body ? '\n\n' : ''}${add.map(x => `photo:${x}`).join('\n\n')}` : body;
  };

  // Enregistrement automatique (B31) : dans post_drafts, jamais dans le billet ; hors du journal d'audit (B34).
  function saveDraft(id, data, by = {}) {
    const post = get(id);
    if (!post) return null;
    const keep = Object.fromEntries(Object.entries(data || {}).filter(([k]) => TEXT_FIELDS.includes(k)).map(([k, x]) => [k, String(x ?? '').slice(0, LIMITS[k.replace(/_(en|de)$/, '')] + 1)]));
    const t = now();
    q.saveDraft.run(id, JSON.stringify(keep), by.sub || null, by.name || '', t, post.version);
    return t;
  }
  const draftOf = id => { const d = q.draft.get(id); if (!d) return null; try { return { ...d, data: JSON.parse(d.data) }; } catch { return null; } };

  // ---------- vérifications (B37, B44) ----------
  // Ce qui bloque la proposition ou la publication, et ce qui est seulement signalé. photos : Map id → photo (toutes,
  // quel que soit leur statut ; repo.photosByIds). Le texte de remplacement est celui du billet, sinon celui de la photo.
  function checks(post, { forPublish = false } = {}) {
    const blocking = [], warnings = [];
    const photos = repo.photosByIds(photoIds(post));
    const settings = new Map(q.settings.all(post.id).map(s => [s.photo_id, s]));
    if (!String(post.dek || '').trim()) blocking.push({ code: 'chapo', field: 'dek' });
    if ((post.title || '').length > ADVISE.title) warnings.push({ code: 'titre_long', n: post.title.length });
    if ((post.dek || '').length > ADVISE.dek) warnings.push({ code: 'chapo_long', n: post.dek.length });
    if (!bodyPhotoIds(post).length && !post.cover_id) warnings.push({ code: 'sans_photo' });
    const ids = bodyPhotoIds(post);
    ids.forEach((pid, i) => {
      const p = photos.get(pid), s = settings.get(pid);
      if (!p) return;
      if (!s?.decorative && !String(s?.alt || p.alt_text || '').trim()) blocking.push({ code: 'alt', photo: pid, n: i + 1, title: p.title });
    });
    const g = readiness.gate(photoIds(post).filter(pid => photos.has(pid)));
    for (const b of g.blocked) blocking.push({ code: 'accord_refuse', photo: b.id, title: photos.get(b.id)?.title, reasons: b.reasons, n: ids.indexOf(b.id) + 1 });
    for (const b of g.verify) blocking.push({ code: 'accord_a_verifier', photo: b.id, title: photos.get(b.id)?.title, reasons: b.reasons, n: ids.indexOf(b.id) + 1 });
    const drafts = [...photos.values()].filter(p => p.status !== 'published');
    if (drafts.length) (forPublish ? blocking : warnings).push({ code: 'photos_non_publiees', photos: drafts.map(p => p.id), titles: drafts.map(p => p.title) });
    for (const l of post.langs) {
      if (l === 'fr') continue;
      if (!String(post[col('title', l)] || '').trim() || !String(post[col('body', l)] || '').trim()) warnings.push({ code: 'traduction_vide', lang: l });
    }
    // Ce que le rendu signale : lien interne cassé, image externe, niveau de titre sauté, « cliquez ici »…
    for (const l of post.langs) {
      const r = renderBody(post[col('body', l)], renderCtx(post, l, { photos, settings, preview: false }));
      for (const w of r.warnings) if (!['photo_non_publiee'].includes(w.code) && !warnings.some(x => x.code === w.code && x.ref === w.ref)) warnings.push({ ...w, lang: l });
    }
    return { blocking, warnings };
  }
  // Contexte minimal du rendu pour les vérifications (les adresses n'y comptent pas).
  function renderCtx(post, lang, { photos, settings, preview }) {
    return {
      lang, preview,
      photo: id => { const p = photos.get(id); if (!p) return null; const s = settings.get(id) || {}; return { photo: p, setting: s, visible: p.status === 'published', alt: s[col('alt', lang)] || s.alt || p.alt || '', legend: s[col('legend', lang)] || '' }; },
      href: (kind, id) => refExists(kind, id) ? '#' : null,
      photoHref: () => '#', meta: () => '', picture: () => '',
      t: { seeBig: () => '', diptyque: () => ({ label: '', line: '' }), nonPubliee: '', galerie: () => '' },
    };
  }
  const refExists = (kind, id) => {
    if (kind === 'photo') return Boolean(db.prepare("SELECT 1 FROM photos WHERE id = ? AND status = 'published'").get(id));
    if (kind === 'serie') return Boolean(db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id));
    if (kind === 'voyage') return Boolean(db.prepare('SELECT 1 FROM trips WHERE id = ? AND public = 1').get(id));
    if (kind === 'carnet') return Boolean(db.prepare("SELECT 1 FROM posts WHERE id = ? AND state = 'publie' AND visibility = 'public'").get(id));
    return false;
  };

  // Constructions actives neutralisées (BV-12) : par champ et par langue, avec l'empreinte du contenu (le même texte
  // réenregistré n'est signalé qu'une fois). Jamais le texte ni un extrait : un billet peut nommer des personnes.
  const told = new Map();
  function neutralized(post) {
    const out = [];
    for (const l of LANGS) {
      for (const f of TEXTS) {
        const k = col(f, l);
        const text = String(post[k] || '');
        if (!text) continue;
        let counts;
        if (f === 'body' || f === 'reply') counts = renderBody(text, renderCtx(post, l, { photos: new Map(), settings: new Map(), preview: false })).neutralized;
        else counts = scanPlain(text);
        if (!totalCount(counts)) continue;
        const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
        const key = `${post.id}:${k}`;
        if (told.get(key) === hash) continue;
        told.set(key, hash);
        if (told.size > 5000) told.delete(told.keys().next().value);
        out.push({ champ: { title: 'titre', dek: 'chapo', body: 'corps', mention: 'mention', reply: 'reponse' }[f], langue: l, constructions: counts, longueur: text.length });
      }
    }
    return out;
  }

  // ---------- circuit ----------
  const langOf = authorId => (authorId ? db.prepare('SELECT admin_lang FROM authors WHERE id = ?').pluck().get(authorId) : null) || 'fr';
  async function mail(to, compose) {
    if (!mailer?.enabled || !to.length) return;
    const seen = new Set();
    for (const { addr, lang } of to) {
      if (seen.has(addr)) continue;
      seen.add(addr);
      const t = translator(lang);
      const { subject, lines } = compose(t);
      await mailer.send({ to: addr, subject: `${siteName()} · ${subject}`, text: [...lines, '', publicUrl ? `${publicUrl}/admin/carnet` : ''].join('\n') })
        .catch(err => log?.warn({ err: err.message }, 'carnets : e-mail non envoyé'));
    }
  }
  const active = () => accounts.list().filter(a => a.status === 'actif' && a.notify_email && (a.notify_to || a.email));
  const authorMail = post => active().filter(a => post.authors.includes(a.author_id)).map(a => ({ addr: a.notify_to || a.email, lang: langOf(a.author_id) }));
  const moderatorMail = () => active().filter(a => a.roles.includes('moderateur') || a.roles.includes('admin')).map(a => ({ addr: a.notify_to || a.email, lang: langOf(a.author_id) }));
  const setState = (id, state, extra = {}) => {
    const cols = Object.keys(extra);
    db.prepare(`UPDATE posts SET state = @state, updated_at = @t, version = version + 1${cols.map(k => `, ${k} = @${k}`).join('')} WHERE id = @id`).run({ state, t: now(), id, ...extra });
  };
  const need = (post, states, message) => { if (!post) throw new CarnetError('Billet introuvable.', { status: 404 }); if (!states.includes(post.state)) throw new CarnetError(message); };

  // Mettre la version du billet en ligne (publication, republication, échéance d'une programmation). published_at : la
  // première publication seulement.
  function putOnline(post, by, action = 'publie') {
    setState(post.id, 'publie', { publish_at: null, retired_at: null, retired_reason: '', published_at: post.published_at ?? now() });
    review(post.id, action, by);
    q.dropDraft.run(post.id);
  }

  return {
    STATES, RUBRIQUES, LIMITS, ADVISE, TEXT_FIELDS,
    get, list: () => q.all.all().map(hydrate),
    // Billet par adresse : { post } (adresse du jour), { moved: slug } (ancienne adresse, 301) ou null.
    bySlug(slug) {
      const row = q.bySlug.get(String(slug));
      if (row) return { post: hydrate(row) };
      const old = q.oldSlug.get(String(slug));
      const post = old != null ? get(old) : null;
      return post ? { moved: post.slug, post } : null;
    },
    published: () => q.published.all().map(hydrate),
    publishedCount: () => q.count.get(),
    citing: (kind, id) => q.citing.all(kind, Number(id)).map(hydrate),
    photoIds, bodyPhotoIds, coverId, shareId,
    settings: id => new Map(q.settings.all(id).map(s => [s.photo_id, s])),
    create, update, setPhoto, removePhoto, appendPhotos, saveDraft, draftOf, dropDraft: id => q.dropDraft.run(id),
    checks, neutralized, refExists,
    history: id => q.history.all(id),
    revisions: id => q.revisions.all(id),
    restore(id, revId, by, { publisher = false } = {}) {
      const r = q.revision.get(id, Number(revId));
      if (!r) throw new CarnetError('Version introuvable.', { status: 404 });
      const data = JSON.parse(r.data);
      const input = Object.fromEntries(TEXT_FIELDS.map(k => [k, data[k] ?? '']));
      for (const k of ['rubrique', 'cover_id', 'share_id', 'trip_id', 'contact']) input[k] = data[k];
      input.authors = data.authors;
      input.langs = String(data.langs || 'fr').split(',');
      const res = update(id, input, by, { publisher });
      review(id, 'version_retablie', by, new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(r.at));
      return res;
    },
    toStored,

    async propose(id, by, message = '') {
      const post = get(id);
      need(post, ['brouillon', 'a_reprendre'], 'Seul un brouillon ou un billet à reprendre se propose.');
      const c = checks(post);
      if (c.blocking.length) throw new CarnetError('Pas encore proposé : des points sont à corriger.', { details: c });
      setState(id, 'propose');
      review(id, 'propose', by, message);
      onWrite();
      await mail(moderatorMail(), t => ({ subject: t('Un billet proposé à la publication'), lines: [t('{name} propose le billet « {title} ».', { name: by.name || t('Un photographe'), title: post.title }), message ? t('Son mot : {message}', { message }) : ''] }));
      return get(id);
    },
    withdraw(id, by) {
      const post = get(id);
      need(post, ['propose'], 'Ce billet n’est pas proposé.');
      setState(id, 'brouillon');
      review(id, 'proposition_retiree', by);
      return get(id);
    },
    // Publier tout de suite (at = null) ou programmer (at : ms, dans le futur). Les photos doivent être publiées (B44) :
    // la route publie (ou programme) d'abord celles que le compte peut publier.
    async publish(id, by, { at = null } = {}) {
      const post = get(id);
      need(post, ['brouillon', 'propose', 'a_reprendre', 'programme'], 'Ce billet est déjà en ligne, ou retiré.');
      if (at != null && !(at > now())) throw new CarnetError('Choisissez une date à venir.', { field: 'publish_at' });
      const c = checks(post, { forPublish: at == null });
      if (c.blocking.length) throw new CarnetError('Pas encore publié : des points sont à corriger.', { details: c });
      if (at != null) { setState(id, 'programme', { publish_at: at }); review(id, 'programme', by, '', at); }
      else putOnline(post, by);
      // BV-20/21 : le compte reste attaché à la publication avant l’attente de sa notification.
      onWrite();
      await mail(authorMail(post), t => ({ subject: at != null ? t('Billet programmé') : t('Billet publié'),
        lines: [at != null ? t('« {title} » sera publié le {date} (validé par {name}).', { title: post.title, name: by.name || t('le modérateur'), date: new Intl.DateTimeFormat(t.locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(at) })
          : t('« {title} » est publié (validé par {name}).', { title: post.title, name: by.name || t('le modérateur') })] }));
      return get(id);
    },
    unschedule(id, by) {
      const post = get(id);
      need(post, ['programme'], 'Ce billet n’est pas programmé.');
      const proposed = q.history.all(id).some(r => r.action === 'propose');
      setState(id, proposed ? 'propose' : 'brouillon', { publish_at: null });
      review(id, 'deprogramme', by);
      return get(id);
    },
    async sendBack(id, by, message) {
      const post = get(id);
      need(post, ['propose', 'programme'], 'Seul un billet proposé ou programmé se renvoie.');
      if (!String(message || '').trim()) throw new CarnetError('Écrivez la remarque.', { field: 'message' });
      setState(id, 'a_reprendre', { publish_at: null });
      review(id, 'renvoye', by, message);
      onWrite();
      await mail(authorMail(post), t => ({ subject: t('Billet à reprendre'), lines: [t('« {title} » vous est renvoyé par {name} :', { title: post.title, name: by.name || t('le modérateur') }), String(message).trim()] }));
      return get(id);
    },
    retire(id, by, reason) {
      const post = get(id);
      need(post, ['publie'], 'Seul un billet publié se retire.');
      if (!String(reason || '').trim()) throw new CarnetError('Dites pourquoi le billet est retiré.', { field: 'reason' });
      setState(id, 'retire', { retired_at: now(), retired_reason: String(reason).trim().slice(0, LIMITS.message) });
      review(id, 'retire', by, reason);
      onWrite();
      return get(id);
    },
    republish(id, by) {
      const post = get(id);
      need(post, ['retire'], 'Seul un billet retiré se republie.');
      const c = checks(post, { forPublish: true });
      if (c.blocking.length) throw new CarnetError('Pas encore republié : des points sont à corriger.', { details: c });
      putOnline(post, by, 'republie');
      onWrite();
      return get(id);
    },
    // Supprimer : seulement un billet jamais publié (B49) ; un billet publié se retire.
    remove(id) {
      const post = get(id);
      if (!post) return false;
      if (post.published_at != null) throw new CarnetError('Un billet déjà publié ne se supprime pas : retirez-le du site.');
      db.prepare('DELETE FROM posts WHERE id = ?').run(id);
      return true;
    },

    // Publications programmées arrivées à échéance (B45) : la seule fonction qui met un billet programmé en ligne. Sans
    // requête ni session : publiées par « publication programmée » (sub = null) et notées au journal d'audit avec les noms
    // des champs ; une photo qui n'est plus publiée renvoie le billet « à reprendre » avec la raison.
    // Chaque billet change d'état par un UPDATE conditionnel (encore programmé, encore échu) : un billet déprogrammé ou
    // renvoyé entre-temps, ou déjà publié par une exécution qui chevauche, est laissé tel quel ; les e-mails partent après la
    // boucle, jamais entre la lecture et l'écriture (revue de sécurité des Carnets).
    async runDue() {
      const t = now();
      const due = q.due.all(t);
      const mails = [];
      let n = 0;
      for (const id of due) {
        const post = get(id);
        if (!post) continue;
        const photos = repo.photosByIds(photoIds(post));
        const missing = photoIds(post).filter(pid => photos.get(pid)?.status !== 'published');
        if (missing.length) {
          const reason = `Publication programmée annulée : ${missing.length > 1 ? `${missing.length} photos ne sont pas publiées` : '1 photo n’est pas publiée'} (${missing.map(pid => photos.get(pid)?.title || `n° ${pid}`).join(', ')}).`;
          const r = db.prepare("UPDATE posts SET state = 'a_reprendre', publish_at = NULL, updated_at = ?, version = version + 1 WHERE id = ? AND state = 'programme' AND publish_at <= ?").run(now(), id, t);
          if (!r.changes) continue;
          review(id, 'renvoye', SYSTEM, reason);
          audit?.log({ sub: null, name: SYSTEM.name, action: 'carnet · publication programmée', target: String(id), status: 422, detail: 'champs : state, publish_at' });
          mails.push([authorMail(post), tr => ({ subject: tr('Billet à reprendre'), lines: [tr('« {title} » n’a pas pu être publié à la date prévue.', { title: post.title }), tr.msg(reason)] })]);
          continue;
        }
        const r = db.prepare("UPDATE posts SET state = 'publie', publish_at = NULL, retired_at = NULL, retired_reason = '', published_at = COALESCE(published_at, ?), updated_at = ?, version = version + 1 WHERE id = ? AND state = 'programme' AND publish_at <= ?").run(now(), now(), id, t);
        if (!r.changes) continue;
        review(id, 'publie', SYSTEM);
        q.dropDraft.run(id);
        audit?.log({ sub: null, name: SYSTEM.name, action: 'carnet · publication programmée', target: String(id), status: 200, detail: 'champs : state, published_at, publish_at' });
        n += 1;
        mails.push([authorMail(post), tr => ({ subject: tr('Billet publié'), lines: [tr('« {title} », programmé, est publié.', { title: post.title })] })]);
      }
      onWrite({ scheduled: true });
      for (const [to, compose] of mails) await mail(to, compose);
      return n;
    },
    // Ce qui attend : billets proposés (le modérateur), à reprendre et programmés (« Aujourd'hui », B50).
    pending: () => db.prepare("SELECT id FROM posts WHERE state IN ('propose', 'a_reprendre', 'programme') ORDER BY updated_at").pluck().all().map(get),
    countIn: state => db.prepare('SELECT COUNT(*) FROM posts WHERE state = ?').pluck().get(state),
    neutralizedEmpty: emptyCounts,
  };
}
