import { slugify } from './slug.js';

// Expositions : la programmation autorise l’ouverture à son échéance sans publier de photo.
// Les phases sont dérivées de l’horloge à chaque lecture ; seul publishReport publie le bilan et la sélection.
// Plusieurs saisons peuvent se chevaucher, avec leurs textes et cartels propres.
export const STATES = ['brouillon', 'programme', 'publie', 'retire'];
export const LIMITS = { title: 120, subtitle: 180, intro: 4000, prologue: 2000, conclusion: 2000, cartel: 500, report: 12000, slug: 160, photos: 500 };
export const LANGS = ['fr', 'en', 'de'];
export const EDITORIAL_FIELDS = ['title', 'subtitle', 'intro', 'prologue', 'conclusion'];
const TEXT_FIELDS = [...EDITORIAL_FIELDS, 'report'].flatMap(f => [f, `${f}_en`, `${f}_de`]);
const CARTEL_FIELDS = ['cartel', 'cartel_en', 'cartel_de'];
const col = (field, lang) => lang === 'fr' ? field : `${field}_${lang}`;
const DATES = ['opens_at', 'closes_at'];
const instant = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const identifier = value => Number.isSafeInteger(value) && value > 0;
// Même contrôle des textes que la projection publique, avant LIMIT : compter une rubrique ou remplir son menu
// ne doit pas charger les accrochages. Les blancs correspondent à String.trim(), y compris les espaces insécables.
const BLANKS_SQL = "'\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'";
const completeSql = (alias, field, required = false) => {
  const names = LANGS.map(lang => `${alias}.${col(field, lang)}`);
  const present = names.map(name => `(typeof(${name}) = 'text' AND length(trim(${name}, ${BLANKS_SQL})) > 0)`).join(' AND ');
  return required ? `(${present})` : `((${names.map(name => `COALESCE(${name}, '') = ''`).join(' AND ')}) OR (${present}))`;
};
const PUBLIC_SQL = `s.state IN ('programme', 'publie')
  AND typeof(s.opens_at) = 'integer' AND s.opens_at BETWEEN 0 AND 8640000000000000
  AND typeof(s.closes_at) = 'integer' AND s.closes_at BETWEEN 0 AND 8640000000000000 AND s.closes_at > s.opens_at
  AND ${['title', 'intro'].map(field => completeSql('s', field, true)).join(' AND ')}
  AND ${['subtitle', 'prologue', 'conclusion'].map(field => completeSql('s', field)).join(' AND ')}
  AND NOT EXISTS (SELECT 1 FROM saison_photos p WHERE p.saison_id = s.id AND NOT ${completeSql('p', 'cartel')})`;

export class SaisonError extends Error {
  constructor(message, { field = null, status = 422 } = {}) { super(message); this.field = field; this.status = status; }
}

export function createSaisons({ db, now = Date.now, readiness = null }) {
  const q = {
    get: db.prepare('SELECT * FROM saisons WHERE id = ?'),
    bySlug: db.prepare('SELECT * FROM saisons WHERE slug = ?'),
    all: db.prepare('SELECT * FROM saisons ORDER BY created_at DESC, id DESC'),
    catalogue: db.prepare(`SELECT s.* FROM saisons s WHERE ${PUBLIC_SQL} ORDER BY s.opens_at DESC, s.id DESC LIMIT ? OFFSET ?`),
    catalogueCount: db.prepare(`SELECT COUNT(*) FROM saisons s WHERE ${PUBLIC_SQL}`).pluck(),
    catalogueExists: db.prepare(`SELECT EXISTS (SELECT 1 FROM saisons s WHERE ${PUBLIC_SQL})`).pluck(),
    catalogueHas: db.prepare(`SELECT EXISTS (SELECT 1 FROM saisons s WHERE s.id = ? AND ${PUBLIC_SQL})`).pluck(),
    public: db.prepare("SELECT * FROM saisons WHERE state IN ('programme', 'publie') AND opens_at <= ? ORDER BY opens_at DESC, id DESC"),
    photos: db.prepare('SELECT photo_id FROM saison_photos WHERE saison_id = ? ORDER BY position').pluck(),
    cartels: db.prepare('SELECT photo_id, cartel, cartel_en, cartel_de FROM saison_photos WHERE saison_id = ? ORDER BY position'),
    selection: db.prepare('SELECT photo_id FROM saison_selection WHERE saison_id = ? ORDER BY position').pluck(),
    publicPhotos: db.prepare("SELECT s.photo_id FROM saison_photos s JOIN photos p ON p.id = s.photo_id WHERE s.saison_id = ? AND p.status = 'published' ORDER BY s.position").pluck(),
    publicSelection: db.prepare("SELECT s.photo_id FROM saison_selection s JOIN photos p ON p.id = s.photo_id WHERE s.saison_id = ? AND p.status = 'published' ORDER BY s.position").pluck(),
    photo: db.prepare('SELECT status FROM photos WHERE id = ?').pluck(),
    author: db.prepare('SELECT id FROM authors WHERE id = ?').pluck(),
    clearPhotos: db.prepare('DELETE FROM saison_photos WHERE saison_id = ?'),
    addPhoto: db.prepare('INSERT INTO saison_photos (saison_id, photo_id, position, cartel, cartel_en, cartel_de) VALUES (?, ?, ?, ?, ?, ?)'),
    writeCartel: db.prepare('UPDATE saison_photos SET cartel = ?, cartel_en = ?, cartel_de = ? WHERE saison_id = ? AND photo_id = ?'),
    addSelection: db.prepare('INSERT INTO saison_selection (saison_id, photo_id, position) VALUES (?, ?, ?)'),
  };

  const time = () => {
    const t = now();
    if (!instant(t)) throw new SaisonError('Horloge invalide.');
    return t;
  };
  const phase = (s, t) => {
    if (s.state === 'brouillon' || s.state === 'retire') return s.state;
    if (t < s.opens_at) return 'programmee';
    if (t < s.closes_at) return 'ouverte';
    return s.report_published_at != null && s.report_published_at <= t ? 'bilan' : 'close';
  };
  const internal = (s, t) => s ? { ...s, phase: phase(s, t), photo_ids: q.photos.all(s.id), cartels: q.cartels.all(s.id), selection_ids: q.selection.all(s.id) } : null;
  const get = id => identifier(id) ? internal(q.get.get(id), time()) : null;
  const requireSaison = id => {
    const s = get(id);
    if (!s) throw new SaisonError('Saison introuvable.', { status: 404 });
    return s;
  };
  const draft = s => {
    if (s.state !== 'brouillon') throw new SaisonError('Seul un brouillon peut être modifié.', { status: 409 });
  };
  const published = s => ['programme', 'publie'].includes(s.state);
  const dated = s => {
    if (!instant(s.opens_at) || !instant(s.closes_at) || s.closes_at <= s.opens_at)
      throw new SaisonError('Donnez une ouverture et une fermeture postérieure.', { field: 'closes_at' });
  };
  const text = (value, field) => {
    const base = field.replace(/_(en|de)$/, '');
    if (typeof value !== 'string') throw new SaisonError('Texte attendu.', { field });
    let v = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (base === 'title') v = v.replace(/\s+/g, ' ');
    if (v.length > LIMITS[base]) throw new SaisonError(`${LIMITS[base]} signes au plus.`, { field });
    return v;
  };
  function validate(input, previous = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SaisonError('Champs de la saison attendus.');
    const values = {};
    for (const field of TEXT_FIELDS) if (Object.hasOwn(input, field)) values[field] = text(input[field], field);
    if (Object.hasOwn(values, 'title') && !values.title) throw new SaisonError('Donnez un titre en français.', { field: 'title' });
    for (const field of DATES) {
      if (!Object.hasOwn(input, field)) continue;
      if (input[field] !== null && !instant(input[field])) throw new SaisonError('Instant entier en millisecondes attendu.', { field });
      values[field] = input[field];
    }
    for (const field of ['author_id', 'cover_id']) {
      if (!Object.hasOwn(input, field)) continue;
      const value = input[field];
      if (value !== null && !identifier(value)) throw new SaisonError('Identifiant entier positif attendu.', { field });
      if (value !== null && (field === 'author_id' ? q.author.get(value) : q.photo.get(value)) == null)
        throw new SaisonError(field === 'author_id' ? 'Photographe inconnu.' : 'Photo inconnue.', { field });
      values[field] = value;
    }
    const merged = { ...previous, ...values };
    if (merged.opens_at != null && merged.closes_at != null) dated(merged);
    return values;
  }
  const ids = (values, field) => {
    if (!Array.isArray(values) || values.length > LIMITS.photos || values.some(id => !identifier(id)) || new Set(values).size !== values.length)
      throw new SaisonError(`Liste ordonnée de ${LIMITS.photos} identifiants distincts au plus.`, { field });
    return values;
  };
  const translated = (value, fields, required = false, fieldName = field => field) => {
    for (const base of fields) {
      const names = LANGS.map(lang => col(base, lang));
      if (!required && !names.some(field => value[field])) continue;
      for (const field of names) if (!value[field])
        throw new SaisonError('Complétez ce contenu en français, anglais et allemand.', { field: fieldName(field) });
    }
  };
  const authorized = photoIds => {
    if (!readiness) return photoIds;
    const allowed = new Set(readiness.gate(photoIds).ok);
    return photoIds.filter(id => allowed.has(id));
  };
  const ready = s => {
    dated(s);
    translated(s, ['title', 'intro'], true);
    translated(s, ['subtitle', 'prologue', 'conclusion']);
    for (const cartel of s.cartels) translated(cartel, ['cartel'], false, field => field.replace('cartel', `cartel_${cartel.photo_id}`));
    if (!s.photo_ids.length || s.photo_ids.some(id => q.photo.get(id) !== 'published'))
      throw new SaisonError('L’accrochage doit contenir uniquement des photos déjà publiées.', { field: 'photo_ids' });
    if (authorized(s.photo_ids).length !== s.photo_ids.length)
      throw new SaisonError('Une photographie de l’accrochage n’est plus autorisée pour le site.', { field: 'photo_ids' });
    if (!s.cover_id || !s.photo_ids.includes(s.cover_id))
      throw new SaisonError('Choisissez une couverture publiée dans l’accrochage.', { field: 'cover_id' });
  };
  const write = (id, values, t) => {
    const names = Object.keys(values);
    db.prepare(`UPDATE saisons SET ${names.map(f => `${f} = ?`).join(', ')}, updated_at = ?, version = version + 1 WHERE id = ?`).run(...Object.values(values), t, id);
  };

  function create(input) {
    const values = validate(input);
    if (!values.title) throw new SaisonError('Donnez un titre en français.', { field: 'title' });
    const t = time(), base = slugify(values.title).slice(0, LIMITS.slug) || 'saison';
    return db.transaction(() => {
      let slug = base;
      for (let n = 2; q.bySlug.get(slug); n++) slug = `${base.slice(0, LIMITS.slug - String(n).length - 1)}-${n}`;
      const names = Object.keys(values);
      return Number(db.prepare(`INSERT INTO saisons (slug, ${names.join(', ')}, created_at, updated_at) VALUES (?, ${names.map(() => '?').join(', ')}, ?, ?)`)
        .run(slug, ...Object.values(values), t, t).lastInsertRowid);
    })();
  }
  function update(id, input) {
    return db.transaction(() => {
      const s = requireSaison(id); draft(s);
      const values = validate(input, s);
      if (Object.keys(values).length) write(id, values, time());
      return get(id);
    })();
  }
  function setPhotos(id, photoIds) {
    return db.transaction(() => {
      const s = requireSaison(id); draft(s);
      const list = ids(photoIds, 'photo_ids');
      if (list.some(pid => q.photo.get(pid) == null)) throw new SaisonError('Photo inconnue.', { field: 'photo_ids' });
      const previous = new Map(s.cartels.map(c => [c.photo_id, c]));
      q.clearPhotos.run(id);
      list.forEach((pid, position) => {
        const cartel = previous.get(pid);
        q.addPhoto.run(id, pid, position, ...CARTEL_FIELDS.map(field => cartel?.[field] || ''));
      });
      write(id, { cover_id: list.includes(s.cover_id) ? s.cover_id : null }, time());
      return get(id);
    })();
  }
  function setCartels(id, cartels) {
    return db.transaction(() => {
      const s = requireSaison(id); draft(s);
      if (!Array.isArray(cartels) || cartels.length > LIMITS.photos)
        throw new SaisonError('Liste de cartels attendue.', { field: 'cartels' });
      const existing = new Map(s.cartels.map(c => [c.photo_id, c])), seen = new Set();
      const rows = cartels.map(cartel => {
        if (!cartel || typeof cartel !== 'object' || Array.isArray(cartel) || !identifier(cartel.photo_id) || !existing.has(cartel.photo_id) || seen.has(cartel.photo_id))
          throw new SaisonError('Chaque cartel doit concerner une photo distincte de l’accrochage.', { field: 'cartels' });
        seen.add(cartel.photo_id);
        try {
          return { photo_id: cartel.photo_id, ...Object.fromEntries(CARTEL_FIELDS.map(field => [field, Object.hasOwn(cartel, field) ? text(cartel[field], field) : existing.get(cartel.photo_id)[field]])) };
        } catch (error) {
          if (error instanceof SaisonError && error.field) error.field = error.field.replace('cartel', `cartel_${cartel.photo_id}`);
          throw error;
        }
      });
      for (const cartel of rows) q.writeCartel.run(...CARTEL_FIELDS.map(field => cartel[field]), id, cartel.photo_id);
      if (rows.length) write(id, { state: s.state }, time());
      return get(id);
    })();
  }
  function decide(id, state) {
    return db.transaction(() => {
      const s = requireSaison(id); draft(s); ready(s);
      const t = time();
      if (state === 'programme' ? s.opens_at <= t : t < s.opens_at || t >= s.closes_at)
        throw new SaisonError(state === 'programme' ? 'L’ouverture programmée doit être future.' : 'La saison doit être dans sa période d’ouverture.', { field: 'opens_at' });
      write(id, { state, decided_at: t }, t);
      return get(id);
    })();
  }
  function cancelSchedule(id) {
    return db.transaction(() => {
      const s = requireSaison(id), t = time();
      if (s.state !== 'programme' || t >= s.opens_at) throw new SaisonError('Seule une programmation avant son ouverture peut être annulée.', { status: 409 });
      write(id, { state: 'brouillon', decided_at: null }, t);
      return get(id);
    })();
  }
  function withdraw(id) {
    return db.transaction(() => {
      const s = requireSaison(id), t = time();
      if (!published(s)) throw new SaisonError('Seule une saison publiée ou programmée peut être retirée.', { status: 409 });
      write(id, { state: 'retire', retired_at: t }, t);
      return get(id);
    })();
  }
  function publishReport(id, input) {
    return db.transaction(() => {
      const s = requireSaison(id), t = time();
      if (!published(s) || t < s.closes_at || s.report_published_at != null)
        throw new SaisonError('Le bilan se publie une fois, après la fermeture de la saison.', { status: 409 });
      const values = validate(input, s);
      if (Object.keys(values).some(field => !field.startsWith('report'))) throw new SaisonError('Seuls le bilan et sa sélection sont attendus.');
      const report = values.report ?? s.report;
      if (!report) throw new SaisonError('Écrivez le bilan en français.', { field: 'report' });
      const list = ids(input.selection_ids ?? [], 'selection_ids');
      const included = new Set(s.photo_ids);
      if (list.some(pid => !included.has(pid) || q.photo.get(pid) !== 'published'))
        throw new SaisonError('La sélection doit appartenir à l’accrochage et être encore publiée.', { field: 'selection_ids' });
      if (authorized(list).length !== list.length)
        throw new SaisonError('Une photographie de la sélection n’est plus autorisée pour le site.', { field: 'selection_ids' });
      list.forEach((pid, position) => q.addSelection.run(id, pid, position));
      write(id, { ...values, report_published_at: t }, t);
      return get(id);
    })();
  }

  // Une validation de l’atelier porte sur la version lue, puis enregistre textes, ordre et décision ensemble.
  // Chaque écriture interne avance le compteur : sa monotonie, indépendante de l’horloge, évite les écrasements.
  function revise(id, revision) {
    if (!revision || typeof revision !== 'object' || Array.isArray(revision) || !identifier(revision.version))
      throw new SaisonError('Version entière positive attendue.', { field: 'version' });
    const actions = { schedule: () => decide(id, 'programme'), open: () => decide(id, 'publie'), cancelSchedule: () => cancelSchedule(id), withdraw: () => withdraw(id) };
    if (revision.action != null && (typeof revision.action !== 'string' || !Object.hasOwn(actions, revision.action)))
      throw new SaisonError('Action de saison inconnue.', { field: 'action' });
    return db.transaction(() => {
      const s = requireSaison(id);
      if (revision.version !== s.version)
        throw new SaisonError('Modifié entre-temps : rechargez la page pour voir la dernière version.', { field: 'version', status: 409 });
      if (revision.input !== undefined) update(id, revision.input);
      if (revision.photo_ids !== undefined) setPhotos(id, revision.photo_ids);
      if (revision.cartels !== undefined) setCartels(id, revision.cartels);
      if (revision.action != null) actions[revision.action]();
      return get(id);
    })();
  }

  function publicData(s, lang, t) {
    if (!s || !published(s) || !instant(s.opens_at) || !instant(s.closes_at) || s.closes_at <= s.opens_at || t < s.opens_at) return null;
    const language = LANGS.includes(lang) ? lang : 'fr';
    const local = field => s[col(field, language)];
    const current = phase(s, t), hasReport = current === 'bilan';
    const photo_ids = authorized(q.publicPhotos.all(s.id)), allowed = new Set(photo_ids);
    // Projection explicite : aucun texte de bilan préparé, identifiant de photo dépubliée ou objet photo brut ne sort.
    return { id: s.id, slug: s.slug, author_id: s.author_id, ...Object.fromEntries(EDITORIAL_FIELDS.map(field => [field, local(field)])), opens_at: s.opens_at, closes_at: s.closes_at,
      phase: current, cover_id: allowed.has(s.cover_id) ? s.cover_id : null, photo_ids,
      cartels: q.cartels.all(s.id).filter(c => allowed.has(c.photo_id)).map(c => ({ photo_id: c.photo_id, cartel: c[col('cartel', language)] })),
      report: hasReport ? local('report') : '', report_published_at: hasReport ? s.report_published_at : null,
      selection_ids: hasReport ? q.publicSelection.all(s.id).filter(id => allowed.has(id)) : [] };
  }
  const publicBySlug = (slug, { lang = 'fr' } = {}) => typeof slug === 'string' && slug.length <= LIMITS.slug ? publicData(q.bySlug.get(slug), lang, time()) : null;
  const publicList = ({ lang = 'fr' } = {}) => { const t = time(); return q.public.all(t).map(s => publicData(s, lang, t)).filter(Boolean); };
  const list = () => { const t = time(); return q.all.all().map(s => internal(s, t)); };
  const catalogue = ({ limit = -1, offset = 0 } = {}) => { const t = time(); return q.catalogue.all(limit, offset).map(s => internal(s, t)); };
  const bySlug = slug => typeof slug === 'string' && slug.length <= LIMITS.slug ? internal(q.bySlug.get(slug), time()) : null;
  return { create, update, setPhotos, setCartels, schedule: id => decide(id, 'programme'), open: id => decide(id, 'publie'), cancelSchedule,
    withdraw, publishReport, revise, get, bySlug, list, catalogue, catalogueCount: () => q.catalogueCount.get(), catalogueExists: () => Boolean(q.catalogueExists.get()),
    catalogueHas: id => identifier(id) && Boolean(q.catalogueHas.get(id)), publicBySlug, publicList };
}
