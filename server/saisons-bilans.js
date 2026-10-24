import { slugify } from './slug.js';
import { collectionPhotoVisible } from './collections-publiques.js';

// S3 : bilans publiés immuables et prolongements permanents, séparés de la durée de visite de l’exposition.
export const BILAN_LANGS = ['fr', 'en', 'de'];
export const BILAN_LIMITS = { title: 120, body: 12000, subtitle: 180, intro: 4000, prologue: 2000, conclusion: 2000, cartel: 500, photos: 500, slug: 160 };
const REPORT_FIELDS = ['title', 'body'];
const COLLECTION_FIELDS = ['title', 'subtitle', 'intro', 'prologue', 'conclusion'];
const col = (field, lang) => lang === 'fr' ? field : `${field}_${lang}`;
const fieldsOf = fields => fields.flatMap(field => BILAN_LANGS.map(lang => col(field, lang)));
const positive = value => Number.isSafeInteger(value) && value > 0;
const instant = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const languageOf = lang => BILAN_LANGS.includes(lang) ? lang : 'fr';

export class SaisonBilanError extends Error {
  constructor(message, { field = null, status = 422 } = {}) { super(message); this.field = field; this.status = status; }
}

export function createSaisonsBilans({ db, readiness = null, now = Date.now, archiveVisible = null, storageDir = null }) {
  const q = {
    saison: db.prepare('SELECT * FROM saisons WHERE id = ?'),
    saisonPhotos: db.prepare('SELECT photo_id FROM saison_photos WHERE saison_id = ? ORDER BY position').pluck(),
    report: db.prepare('SELECT * FROM saison_bilans WHERE id = ?'),
    reports: db.prepare('SELECT * FROM saison_bilans WHERE saison_id = ? ORDER BY created_at, id'),
    reportPhotos: db.prepare('SELECT photo_id FROM saison_bilan_photos WHERE bilan_id = ? ORDER BY position').pluck(),
    root: db.prepare('SELECT id FROM saison_bilans WHERE saison_id = ? AND rectifies_id IS NULL AND published_at IS NOT NULL').pluck(),
    collection: db.prepare('SELECT * FROM saison_collections WHERE id = ?'),
    collectionSlug: db.prepare('SELECT * FROM saison_collections WHERE slug = ?'),
    collections: db.prepare('SELECT c.*, b.saison_id FROM saison_collections c JOIN saison_bilans b ON b.id = c.bilan_id ORDER BY c.created_at DESC, c.id DESC'),
    collectionPhotos: db.prepare('SELECT * FROM saison_collection_photos WHERE collection_id = ? ORDER BY position'),
    photo: db.prepare('SELECT status FROM photos WHERE id = ?').pluck(),
    publicPhoto: db.prepare('SELECT * FROM photos WHERE id = ?'),
    clearReport: db.prepare('DELETE FROM saison_bilan_photos WHERE bilan_id = ?'),
    addReport: db.prepare('INSERT INTO saison_bilan_photos (bilan_id, photo_id, position) VALUES (?, ?, ?)'),
    offsetCollection: db.prepare('UPDATE saison_collection_photos SET position = position + 1000 WHERE collection_id = ?'),
    removeCollectionPhoto: db.prepare('DELETE FROM saison_collection_photos WHERE collection_id = ? AND photo_id = ?'),
    orderCollectionPhoto: db.prepare('UPDATE saison_collection_photos SET position = ? WHERE collection_id = ? AND photo_id = ?'),
    addCollection: db.prepare('INSERT INTO saison_collection_photos (collection_id, photo_id, position, cartel, cartel_en, cartel_de) VALUES (?, ?, ?, ?, ?, ?)'),
    cartel: db.prepare('UPDATE saison_collection_photos SET cartel = ?, cartel_en = ?, cartel_de = ? WHERE collection_id = ? AND photo_id = ?'),
  };
  const time = () => { const t = now(); if (!instant(t)) throw new SaisonBilanError('Horloge invalide.'); return t; };
  const object = input => { if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SaisonBilanError('Champs éditoriaux attendus.'); return input; };
  const normalize = (value, field) => {
    const base = field.replace(/_(en|de)$/, '');
    if (typeof value !== 'string') throw new SaisonBilanError('Texte attendu.', { field });
    let result = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (base === 'title' || base === 'subtitle') result = result.replace(/\s+/g, ' ');
    if (result.length > BILAN_LIMITS[base]) throw new SaisonBilanError(`${BILAN_LIMITS[base]} signes au plus.`, { field });
    return result;
  };
  const texts = (input, bases) => {
    object(input);
    const values = {};
    for (const field of fieldsOf(bases)) if (Object.hasOwn(input, field)) values[field] = normalize(input[field], field);
    if (Object.hasOwn(values, 'title') && !values.title) throw new SaisonBilanError('Donnez un titre en français.', { field: 'title' });
    return values;
  };
  const complete = (row, required, optional = []) => {
    for (const base of [...required, ...optional]) {
      const names = BILAN_LANGS.map(lang => col(base, lang));
      if (optional.includes(base) && !names.some(field => row[field])) continue;
      for (const field of names) if (!row[field]) throw new SaisonBilanError('Complétez ce contenu en français, anglais et allemand.', { field });
    }
  };
  const listOf = values => {
    if (!Array.isArray(values) || values.length > BILAN_LIMITS.photos || values.some(id => !positive(id)) || new Set(values).size !== values.length)
      throw new SaisonBilanError('Sélection de photographies distinctes attendue.', { field: 'photo_ids' });
    return values;
  };
  const allowed = ids => {
    const published = ids.filter(id => q.photo.get(id) === 'published');
    if (!readiness) return published;
    const valid = new Set(readiness.gate(published).ok);
    return published.filter(id => valid.has(id));
  };
  const permitted = (ids, source) => {
    const values = listOf(ids), included = new Set(source);
    if (values.some(id => !included.has(id)) || allowed(values).length !== values.length)
      throw new SaisonBilanError('Choisissez des photos encore publiées et autorisées dans la sélection d’origine.', { field: 'photo_ids' });
    return values;
  };
  const publicAllowed = ids => allowed(ids).filter(id => !storageDir || collectionPhotoVisible(q.publicPhoto.get(id), storageDir));
  const saison = id => {
    const row = positive(id) ? q.saison.get(id) : null;
    if (!row) throw new SaisonBilanError('Saison introuvable.', { status: 404 });
    return row;
  };
  const publicSaison = (s, t) => s && ['programme', 'publie'].includes(s.state) && instant(s.opens_at) && instant(s.closes_at) && s.closes_at > s.opens_at && t >= s.opens_at;
  const archived = (s, t) => {
    if (archiveVisible) return Boolean(archiveVisible(s, t));
    const date = new Date(s.closes_at), year = date.getUTCFullYear() + 1, month = date.getUTCMonth(), day = date.getUTCDate();
    date.setUTCDate(1); date.setUTCFullYear(year); date.setUTCMonth(month);
    date.setUTCDate(Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()));
    return t < date.getTime();
  };
  const reportData = r => r ? { ...r, photo_ids: q.reportPhotos.all(r.id) } : null;
  const collectionData = c => c ? { ...c, photo_ids: q.collectionPhotos.all(c.id).map(p => p.photo_id), cartels: q.collectionPhotos.all(c.id).map(({ photo_id, cartel, cartel_en, cartel_de }) => ({ photo_id, cartel, cartel_en, cartel_de })) } : null;
  const getReport = id => positive(id) ? reportData(q.report.get(id)) : null;
  const getCollection = id => positive(id) ? collectionData(q.collection.get(id)) : null;
  const requiredReport = id => { const r = getReport(id); if (!r) throw new SaisonBilanError('Bilan introuvable.', { status: 404 }); return r; };
  const requiredCollection = id => { const c = getCollection(id); if (!c) throw new SaisonBilanError('Collection introuvable.', { status: 404 }); return c; };
  const draft = row => { if (row.state !== 'brouillon' || row.published_at != null) throw new SaisonBilanError('Un contenu publié ne se modifie pas : préparez un nouvel objet rectificatif.', { status: 409 }); };
  const version = (row, requested) => {
    if (!positive(requested)) throw new SaisonBilanError('Version entière positive attendue.', { field: 'version' });
    if (row.version !== requested) throw new SaisonBilanError('Modifié entre-temps : rechargez la dernière version.', { field: 'version', status: 409 });
  };
  const write = (table, id, values) => {
    const names = Object.keys(values);
    db.prepare(`UPDATE ${table} SET ${names.map(field => `${field} = ?`).join(', ')}, updated_at = ?, version = version + 1 WHERE id = ?`).run(...Object.values(values), time(), id);
  };
  const corrected = (rectifies_id, saison_id) => {
    if (rectifies_id == null) return null;
    const parent = positive(rectifies_id) ? q.report.get(rectifies_id) : null;
    if (!parent || parent.saison_id !== saison_id || parent.state !== 'publie' || parent.published_at == null || parent.published_at > time())
      throw new SaisonBilanError('Le rectificatif doit viser un bilan publié de cette saison.', { field: 'rectifies_id' });
    return parent;
  };
  const selection = (report, ids) => permitted(ids, q.saisonPhotos.all(report.saison_id));
  const replaceReport = (id, ids) => { q.clearReport.run(id); ids.forEach((photo_id, position) => q.addReport.run(id, photo_id, position)); };

  function createReport(saisonId, input) {
    return db.transaction(() => {
      const s = saison(saisonId), values = texts(input, REPORT_FIELDS), t = time();
      if (s.state === 'retire') throw new SaisonBilanError('Une saison retirée ne reçoit pas de nouveau bilan.', { status: 409 });
      if (!values.title) throw new SaisonBilanError('Donnez un titre en français.', { field: 'title' });
      const rectifies_id = input.rectifies_id ?? null; corrected(rectifies_id, s.id);
      const names = Object.keys(values);
      const id = Number(db.prepare(`INSERT INTO saison_bilans (saison_id, rectifies_id, ${names.join(', ')}, created_at, updated_at) VALUES (?, ?, ${names.map(() => '?').join(', ')}, ?, ?)`).run(s.id, rectifies_id, ...Object.values(values), t, t).lastInsertRowid);
      if (input.photo_ids !== undefined) replaceReport(id, selection({ saison_id: s.id }, input.photo_ids));
      return id;
    })();
  }
  function saveReport(id, revision) {
    return db.transaction(() => {
      object(revision); const r = requiredReport(id); version(r, revision.version); draft(r);
      const values = texts(revision.input ?? {}, REPORT_FIELDS);
      if (revision.input && Object.hasOwn(revision.input, 'rectifies_id') && revision.input.rectifies_id !== r.rectifies_id)
        throw new SaisonBilanError('L’origine du rectificatif ne se change pas.', { field: 'rectifies_id' });
      if (revision.photo_ids !== undefined) replaceReport(id, selection(r, revision.photo_ids));
      write('saison_bilans', id, { ...values, state: r.state });
      return getReport(id);
    })();
  }
  function publishReport(id, revision) {
    return db.transaction(() => {
      object(revision); const r = requiredReport(id); version(r, revision.version); draft(r);
      const s = saison(r.saison_id), t = time();
      if (!publicSaison(s, t) || t < s.closes_at) throw new SaisonBilanError('Le bilan se publie après la clôture d’une saison visible.', { status: 409 });
      complete(r, REPORT_FIELDS); selection(r, r.photo_ids);
      if (r.rectifies_id != null) corrected(r.rectifies_id, r.saison_id);
      else if (q.root.get(r.saison_id)) throw new SaisonBilanError('Le bilan initial existe déjà : préparez un rectificatif.', { status: 409 });
      write('saison_bilans', id, { state: 'publie', published_at: t });
      db.prepare('UPDATE saisons SET report_published_at = COALESCE(report_published_at, ?), updated_at = ?, version = version + 1 WHERE id = ?').run(t, t, s.id);
      return getReport(id);
    })();
  }
  function withdrawReport(id, revision) {
    return db.transaction(() => {
      object(revision); const r = requiredReport(id); version(r, revision.version);
      if (r.state !== 'publie') throw new SaisonBilanError('Seul un bilan publié peut être retiré.', { status: 409 });
      write('saison_bilans', id, { state: 'retire' }); return getReport(id);
    })();
  }

  const collectionInput = input => {
    const values = texts(input, COLLECTION_FIELDS);
    if (Object.hasOwn(input, 'cover_id')) {
      if (input.cover_id !== null && (!positive(input.cover_id) || q.photo.get(input.cover_id) == null)) throw new SaisonBilanError('Photo de couverture inconnue.', { field: 'cover_id' });
      values.cover_id = input.cover_id;
    }
    return values;
  };
  const collectionSelection = (c, ids) => permitted(ids, q.reportPhotos.all(c.bilan_id));
  function createCollection(bilanId, input) {
    return db.transaction(() => {
      const r = requiredReport(bilanId), s = saison(r.saison_id), values = collectionInput(input), t = time();
      if (!publicReport(r, s, t)) throw new SaisonBilanError('Publiez le bilan d’origine avant sa collection.', { status: 409 });
      if (!values.title) throw new SaisonBilanError('Donnez un titre en français.', { field: 'title' });
      const base = slugify(values.title).slice(0, BILAN_LIMITS.slug) || 'collection'; let slug = base;
      for (let n = 2; q.collectionSlug.get(slug); n++) slug = `${base.slice(0, BILAN_LIMITS.slug - String(n).length - 1)}-${n}`;
      const names = Object.keys(values);
      const id = Number(db.prepare(`INSERT INTO saison_collections (bilan_id, author_id, slug, ${names.join(', ')}, created_at, updated_at) VALUES (?, ?, ?, ${names.map(() => '?').join(', ')}, ?, ?)`).run(r.id, s.author_id ?? null, slug, ...Object.values(values), t, t).lastInsertRowid);
      if (input.photo_ids !== undefined) replaceCollection(getCollection(id), collectionSelection({ bilan_id: r.id }, input.photo_ids));
      return id;
    })();
  }
  function replaceCollection(c, ids) {
    const previous = new Map(c.cartels.map(row => [row.photo_id, row]));
    // Les cartels gardent leur identifiant pour le suivi des textes, y compris après un réordonnancement.
    q.offsetCollection.run(c.id);
    for (const photo_id of c.photo_ids) if (!ids.includes(photo_id)) q.removeCollectionPhoto.run(c.id, photo_id);
    ids.forEach((photo_id, position) => {
      if (previous.has(photo_id)) q.orderCollectionPhoto.run(position, c.id, photo_id);
      else q.addCollection.run(c.id, photo_id, position, '', '', '');
    });
  }
  const cartelError = (error, photo_id) => {
    if (error instanceof SaisonBilanError && /^cartel(?:_en|_de)?$/.test(error.field)) error.field = error.field.replace('cartel', `cartel_${photo_id}`);
    throw error;
  };
  function saveCollection(id, revision) {
    return db.transaction(() => {
      object(revision); const c = requiredCollection(id); version(c, revision.version); draft(c);
      const values = collectionInput(revision.input ?? {});
      if (revision.input && Object.hasOwn(revision.input, 'bilan_id') && revision.input.bilan_id !== c.bilan_id)
        throw new SaisonBilanError('L’origine de la collection ne se change pas.', { field: 'bilan_id' });
      if (revision.photo_ids !== undefined) replaceCollection(c, collectionSelection(c, revision.photo_ids));
      const current = getCollection(id);
      if (revision.cartels !== undefined) {
        if (!Array.isArray(revision.cartels) || revision.cartels.length > BILAN_LIMITS.photos) throw new SaisonBilanError('Liste de cartels attendue.', { field: 'cartels' });
        const included = new Set(current.photo_ids), seen = new Set();
        for (const row of revision.cartels) {
          if (!row || typeof row !== 'object' || Array.isArray(row) || !positive(row.photo_id) || !included.has(row.photo_id) || seen.has(row.photo_id)) throw new SaisonBilanError('Chaque cartel doit concerner une photo distincte de l’accrochage.', { field: 'cartels' });
          seen.add(row.photo_id); const previous = current.cartels.find(c => c.photo_id === row.photo_id);
          try { q.cartel.run(...fieldsOf(['cartel']).map(field => Object.hasOwn(row, field) ? normalize(row[field], field) : previous[field]), id, row.photo_id); }
          catch (error) { cartelError(error, row.photo_id); }
        }
      }
      const cover_id = values.cover_id === undefined ? c.cover_id : values.cover_id;
      if (cover_id != null && !current.photo_ids.includes(cover_id)) {
        if (values.cover_id !== undefined) throw new SaisonBilanError('Choisissez une couverture dans l’accrochage.', { field: 'cover_id' });
        values.cover_id = null;
      }
      write('saison_collections', id, { ...values, state: c.state }); return getCollection(id);
    })();
  }
  function publishCollection(id, revision) {
    return db.transaction(() => {
      object(revision); const c = requiredCollection(id); version(c, revision.version); draft(c);
      const r = requiredReport(c.bilan_id), s = saison(r.saison_id), t = time();
      if (!publicReport(r, s, t)) throw new SaisonBilanError('Publiez le bilan d’origine avant sa collection.', { status: 409 });
      complete(c, ['title', 'intro'], ['subtitle', 'prologue', 'conclusion']);
      collectionSelection(c, c.photo_ids);
      if (!c.photo_ids.length || !c.cover_id || !c.photo_ids.includes(c.cover_id)) throw new SaisonBilanError('Choisissez une couverture publiée dans l’accrochage.', { field: 'cover_id' });
      for (const row of c.cartels) {
        try { complete(row, [], ['cartel']); } catch (error) { cartelError(error, row.photo_id); }
      }
      write('saison_collections', id, { state: 'publie', published_at: t }); return getCollection(id);
    })();
  }
  function withdrawCollection(id, revision) {
    return db.transaction(() => {
      object(revision); const c = requiredCollection(id); version(c, revision.version);
      if (c.state !== 'publie') throw new SaisonBilanError('Seule une collection publiée peut être retirée.', { status: 409 });
      write('saison_collections', id, { state: 'retire' }); return getCollection(id);
    })();
  }

  const publicReport = (r, s, t) => r.state === 'publie' && instant(r.published_at) && r.published_at <= t && publicSaison(s, t) && t >= s.closes_at;
  function publicCollection(c, lang, t) {
    if (!c || c.state !== 'publie' || !instant(c.published_at) || c.published_at > t) return null;
    const language = languageOf(lang), photo_ids = publicAllowed(q.collectionPhotos.all(c.id).map(p => p.photo_id)), visible = new Set(photo_ids);
    const r = q.report.get(c.bilan_id), s = r ? q.saison.get(r.saison_id) : null;
    const origin = r && publicReport(r, s, t) ? { saison_id: s.id, saison_slug: s.slug, saison_title: s[col('title', language)], bilan_id: r.id, bilan_title: r[col('title', language)] } : null;
    return { id: c.id, slug: c.slug, ...Object.fromEntries(COLLECTION_FIELDS.map(field => [field, c[col(field, language)]])), cover_id: visible.has(c.cover_id) ? c.cover_id : null,
      photo_ids, cartels: q.collectionPhotos.all(c.id).filter(p => visible.has(p.photo_id)).map(p => ({ photo_id: p.photo_id, cartel: p[col('cartel', language)] })), origin };
  }
  function publicForSaison(saisonId, { lang = 'fr' } = {}) {
    if (!positive(saisonId)) return [];
    const s = q.saison.get(saisonId), t = time(), language = languageOf(lang);
    if (!publicSaison(s, t)) return [];
    return q.reports.all(s.id).filter(r => publicReport(r, s, t)).map(r => ({ id: r.id, title: r[col('title', language)], body: r[col('body', language)], rectificatif: r.rectifies_id != null, rectifies_id: r.rectifies_id != null && q.reports.all(s.id).some(parent => parent.id === r.rectifies_id && publicReport(parent, s, t)) ? r.rectifies_id : null,
      published_at: r.published_at, photo_ids: archived(s, t) ? publicAllowed(q.reportPhotos.all(r.id)) : [],
      collections: q.collections.all().filter(c => c.bilan_id === r.id).map(c => publicCollection(c, language, t)).filter(Boolean).map(c => ({ id: c.id, slug: c.slug, title: c.title })) }));
  }
  const publicCollections = ({ lang = 'fr' } = {}) => { const t = time(); return q.collections.all().map(c => publicCollection(c, lang, t)).filter(Boolean); };
  const publicCollectionBySlug = (slug, { lang = 'fr' } = {}) => typeof slug === 'string' && slug.length <= BILAN_LIMITS.slug ? publicCollection(q.collectionSlug.get(slug), lang, time()) : null;
  function textRows() {
    const t = time(), rows = [];
    for (const r of db.prepare("SELECT * FROM saison_bilans WHERE state = 'publie'").all()) {
      const s = q.saison.get(r.saison_id);
      if (publicReport(r, s, t)) rows.push({ key: `saison_bilans#${r.id}`, source: 'saison_bilans', id: r.id, champs: Object.fromEntries(fieldsOf(REPORT_FIELDS).map(field => [field, r[field]])) });
    }
    for (const c of q.collections.all()) {
      const visible = publicCollection(c, 'fr', t);
      if (!visible) continue;
      rows.push({ key: `saison_collections#${c.id}`, source: 'saison_collections', id: c.id, champs: Object.fromEntries(fieldsOf(COLLECTION_FIELDS).map(field => [field, c[field]])) });
      const photos = new Set(visible.photo_ids);
      for (const p of q.collectionPhotos.all(c.id)) if (photos.has(p.photo_id)) rows.push({ key: `saison_collection_photos#${p.id}`, source: 'saison_collection_photos', id: p.id, champs: Object.fromEntries(fieldsOf(['cartel']).map(field => [field, p[field]])) });
    }
    return rows;
  }
  return { createReport, saveReport, publishReport, withdrawReport, getReport, listReports: saisonId => positive(saisonId) ? q.reports.all(saisonId).map(reportData) : [],
    createCollection, saveCollection, publishCollection, withdrawCollection, getCollection, listCollections: saisonId => q.collections.all().filter(c => saisonId == null || c.saison_id === saisonId).map(collectionData),
    publicForSaison, publicCollections, publicCollectionBySlug, textRows };
}
