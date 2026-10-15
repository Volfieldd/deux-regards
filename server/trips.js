import { slugify } from './slug.js';

// Voyages : des sorties regroupées (journées entières d'un photographe). Une journée appartient à un voyage au plus :
// la rattacher à un autre l'y déplace. Les photos d'un voyage sont celles de ses journées (date de l'appareil) ; ses
// personnes, celles rencontrées ces jours-là.
export class TripError extends Error {}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

export function createTrips({ db, now = () => Date.now() }) {
  const q = {
    all: db.prepare('SELECT * FROM trips ORDER BY id DESC'),
    get: db.prepare('SELECT * FROM trips WHERE id = ?'),
    bySlug: db.prepare('SELECT * FROM trips WHERE slug = ?'),
    days: db.prepare('SELECT author_id, day FROM trip_days WHERE trip_id = ? ORDER BY day, author_id'),
    tripOf: db.prepare('SELECT t.* FROM trip_days d JOIN trips t ON t.id = d.trip_id WHERE d.author_id = ? AND d.day = ?'),
    allDays: db.prepare('SELECT d.author_id, d.day, t.id, t.name, t.slug FROM trip_days d JOIN trips t ON t.id = d.trip_id'),
    photos: db.prepare(`SELECT p.*, c.name AS category FROM photos p JOIN trip_days d ON d.author_id = p.author_id AND d.day = p.taken_on
      LEFT JOIN categories c ON c.id = p.category_id WHERE d.trip_id = ? ORDER BY p.taken_on, COALESCE(p.taken_time, ''), p.id`),
    people: db.prepare(`SELECT COUNT(*) FROM encounters e JOIN trip_days d ON d.author_id = e.author_id AND d.day = COALESCE(NULLIF(e.session_day, ''), NULLIF(e.met_on, ''))
      WHERE d.trip_id = ? AND e.anonymized = 0`).pluck(),
    // Journées de prise de vue (photos datées, ou rencontres) d'un photographe entre deux dates.
    span: db.prepare(`SELECT DISTINCT author_id, day FROM (
        SELECT author_id, taken_on AS day FROM photos WHERE taken_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        UNION SELECT author_id, COALESCE(NULLIF(session_day, ''), NULLIF(met_on, '')) FROM encounters WHERE author_id IS NOT NULL AND anonymized = 0)
      WHERE day BETWEEN @from AND @to AND (@author IS NULL OR author_id = @author) ORDER BY day`),
    addDay: db.prepare('INSERT INTO trip_days (trip_id, author_id, day) VALUES (?, ?, ?) ON CONFLICT(author_id, day) DO UPDATE SET trip_id = excluded.trip_id'),
    removeDay: db.prepare('DELETE FROM trip_days WHERE trip_id = ? AND author_id = ? AND day = ?'),
  };
  const uniqueSlug = (name, id = null) => {
    const base = slugify(name) || 'voyage';
    for (let i = 1; ; i++) {
      const s = i === 1 ? base : `${base}-${i}`;
      const other = q.bySlug.get(s);
      if (!other || other.id === id) return s;
    }
  };
  // Résumé d'un voyage : premières et dernières dates, journées, photos (publiées), personnes, photographes.
  function summary(t) {
    const days = q.days.all(t.id);
    const photos = q.photos.all(t.id);
    return { ...t, public: Boolean(t.public), days, from: days[0]?.day || null, to: days.at(-1)?.day || null, nDays: new Set(days.map(d => d.day)).size,
      authors: [...new Set(days.map(d => d.author_id))], nPhotos: photos.length, nPublished: photos.filter(p => p.status === 'published').length, nPeople: q.people.get(t.id), cover: photos.find(p => p.status === 'published') || photos[0] || null };
  }
  return {
    list: () => q.all.all().map(summary),
    get: id => { const t = q.get.get(id); return t ? summary(t) : null; },
    bySlug: slug => { const t = q.bySlug.get(slug); return t ? summary(t) : null; },
    photos: id => q.photos.all(id),
    // Voyage d'une journée (badge sur la liste des sorties), et toutes les journées rattachées.
    tripOf: (authorId, day) => q.tripOf.get(authorId, day) || null,
    dayIndex: () => new Map(q.allDays.all().map(r => [`${r.author_id}:${r.day}`, { id: r.id, name: r.name, slug: r.slug }])),
    create({ name, authorId = null }) {
      const n = text(name, 120);
      if (!n) throw new TripError('Donnez un nom au voyage.');
      return Number(db.prepare('INSERT INTO trips (slug, name, author_id, created_at) VALUES (?, ?, ?, ?)').run(uniqueSlug(n), n, authorId, now()).lastInsertRowid);
    },
    update(id, body) {
      const t = q.get.get(id);
      if (!t) return null;
      const name = 'name' in body ? text(body.name, 120) : t.name;
      if (!name) throw new TripError('Donnez un nom au voyage.');
      const v = { name, slug: name === t.name ? t.slug : uniqueSlug(name, id) };
      for (const k of ['name_en', 'name_de']) v[k] = k in body ? text(body[k], 120) : t[k];
      for (const k of ['intro', 'intro_en', 'intro_de']) v[k] = k in body ? text(body[k], 4000) : t[k];
      v.public = 'public' in body ? (body.public ? 1 : 0) : t.public;
      v.author_id = 'author_id' in body ? body.author_id : t.author_id;
      db.prepare(`UPDATE trips SET name = @name, slug = @slug, name_en = @name_en, name_de = @name_de, intro = @intro, intro_en = @intro_en, intro_de = @intro_de,
        public = @public, author_id = @author_id WHERE id = @id`).run({ ...v, id });
      return this.get(id);
    },
    remove: id => db.prepare('DELETE FROM trips WHERE id = ?').run(id).changes > 0,
    // Rattacher des journées (déplacées si elles étaient dans un autre voyage) ; renvoie le nombre ajouté.
    addDays(id, days) {
      let n = 0;
      db.transaction(() => { for (const d of days) if (DAY.test(d.day) && Number(d.author_id)) n += q.addDay.run(id, Number(d.author_id), d.day).changes; })();
      return n;
    },
    // Journées de prise de vue entre deux dates (d'un photographe, ou des deux).
    daysBetween(from, to, authorId = null) {
      if (!DAY.test(from) || !DAY.test(to)) throw new TripError('Indiquez deux dates (AAAA-MM-JJ).');
      if (from > to) [from, to] = [to, from];
      return q.span.all({ from, to, author: authorId });
    },
    removeDay: (id, authorId, day) => q.removeDay.run(id, authorId, day).changes > 0,
  };
}
