import { slugify } from './slug.js';

// Saisons, socle S0 : aucun branchement aux routes, aucune publication de photo ni contribution de visiteur.
// La programmation autorise l'ouverture à son échéance. Les phases sont dérivées de l'horloge à chaque lecture ;
// seul publishReport publie le bilan et la sélection. Plusieurs saisons peuvent se chevaucher.
export const STATES = ['brouillon', 'programme', 'publie', 'retire'];
export const LIMITS = { title: 120, intro: 4000, report: 12000, slug: 160, photos: 500 };
const LANGS = ['fr', 'en', 'de'];
const TEXT_FIELDS = ['title', 'intro', 'report'].flatMap(f => [f, `${f}_en`, `${f}_de`]);
const DATES = ['opens_at', 'closes_at'];
const instant = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const identifier = value => Number.isSafeInteger(value) && value > 0;

export class SaisonError extends Error {
  constructor(message, { field = null, status = 422 } = {}) { super(message); this.field = field; this.status = status; }
}

export function createSaisons({ db, now = Date.now }) {
  const q = {
    get: db.prepare('SELECT * FROM saisons WHERE id = ?'),
    bySlug: db.prepare('SELECT * FROM saisons WHERE slug = ?'),
    all: db.prepare('SELECT * FROM saisons ORDER BY created_at DESC, id DESC'),
    public: db.prepare("SELECT * FROM saisons WHERE state IN ('programme', 'publie') AND opens_at <= ? ORDER BY opens_at DESC, id DESC"),
    photos: db.prepare('SELECT photo_id FROM saison_photos WHERE saison_id = ? ORDER BY position').pluck(),
    selection: db.prepare('SELECT photo_id FROM saison_selection WHERE saison_id = ? ORDER BY position').pluck(),
    publicPhotos: db.prepare("SELECT s.photo_id FROM saison_photos s JOIN photos p ON p.id = s.photo_id WHERE s.saison_id = ? AND p.status = 'published' ORDER BY s.position").pluck(),
    publicSelection: db.prepare("SELECT s.photo_id FROM saison_selection s JOIN photos p ON p.id = s.photo_id WHERE s.saison_id = ? AND p.status = 'published' ORDER BY s.position").pluck(),
    photo: db.prepare('SELECT status FROM photos WHERE id = ?').pluck(),
    clearPhotos: db.prepare('DELETE FROM saison_photos WHERE saison_id = ?'),
    addPhoto: db.prepare('INSERT INTO saison_photos (saison_id, photo_id, position) VALUES (?, ?, ?)'),
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
  const internal = (s, t) => s ? { ...s, phase: phase(s, t), photo_ids: q.photos.all(s.id), selection_ids: q.selection.all(s.id) } : null;
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
    const merged = { ...previous, ...values };
    if (merged.opens_at != null && merged.closes_at != null) dated(merged);
    return values;
  }
  const ids = (values, field) => {
    if (!Array.isArray(values) || values.length > LIMITS.photos || values.some(id => !identifier(id)) || new Set(values).size !== values.length)
      throw new SaisonError(`Liste ordonnée de ${LIMITS.photos} identifiants distincts au plus.`, { field });
    return values;
  };
  const ready = s => {
    dated(s);
    if (!s.title || !s.intro) throw new SaisonError('Le titre et l’intention en français sont nécessaires.', { field: 'intro' });
    if (!s.photo_ids.length || s.photo_ids.some(id => q.photo.get(id) !== 'published'))
      throw new SaisonError('L’accrochage doit contenir uniquement des photos déjà publiées.', { field: 'photo_ids' });
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
      q.clearPhotos.run(id);
      list.forEach((pid, position) => q.addPhoto.run(id, pid, position));
      write(id, { state: s.state }, time());
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
      if (revision.action != null) actions[revision.action]();
      return get(id);
    })();
  }

  function publicData(s, lang, t) {
    if (!s || !published(s) || !instant(s.opens_at) || !instant(s.closes_at) || s.closes_at <= s.opens_at || t < s.opens_at) return null;
    const language = LANGS.includes(lang) ? lang : 'fr';
    const local = field => language === 'fr' ? s[field] : s[`${field}_${language}`] || s[field];
    const current = phase(s, t), hasReport = current === 'bilan';
    // Projection explicite : aucun texte de bilan préparé, identifiant de photo dépubliée ou objet photo brut ne sort.
    return { id: s.id, slug: s.slug, title: local('title'), intro: local('intro'), opens_at: s.opens_at, closes_at: s.closes_at,
      phase: current, photo_ids: q.publicPhotos.all(s.id), report: hasReport ? local('report') : '',
      report_published_at: hasReport ? s.report_published_at : null, selection_ids: hasReport ? q.publicSelection.all(s.id) : [] };
  }
  const publicBySlug = (slug, { lang = 'fr' } = {}) => typeof slug === 'string' && slug.length <= LIMITS.slug ? publicData(q.bySlug.get(slug), lang, time()) : null;
  const publicList = ({ lang = 'fr' } = {}) => { const t = time(); return q.public.all(t).map(s => publicData(s, lang, t)).filter(Boolean); };
  const list = () => { const t = time(); return q.all.all().map(s => internal(s, t)); };
  return { create, update, setPhotos, schedule: id => decide(id, 'programme'), open: id => decide(id, 'publie'), cancelSchedule,
    withdraw, publishReport, revise, get, list, publicBySlug, publicList };
}
