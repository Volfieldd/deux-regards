import { monthYear } from './format.js';

const PHOTO_COLUMNS = `p.id, p.slug, p.title, p.place, p.taken_on, p.legend, p.status, p.position, p.file, p.width, p.height, p.variant_key, p.updated_at, p.published_at, p.on_map, p.city_id, p.city_name, p.city_cc, p.city_lat, p.city_lon,
  c.slug AS category_slug, c.name AS category, a.slug AS author_slug, a.name AS author`;

// n : rang de la photo parmi toutes les photos publiées, quel que soit le filtre (N°01, N°02… sans trou).
const decorate = (p, i) => ({ ...p, n: i + 1, when: monthYear(p.taken_on), index: i });

export function createRepo(db) {
  const q = {
    published: db.prepare(`SELECT ${PHOTO_COLUMNS} FROM photos p
      JOIN categories c ON c.id = p.category_id JOIN authors a ON a.id = p.author_id
      WHERE p.status = 'published' ORDER BY p.position, p.id`),
    categories: db.prepare('SELECT id, slug, name FROM categories ORDER BY position, id'),
    authors: db.prepare('SELECT id, slug, name, bio FROM authors ORDER BY id'),
    settings: db.prepare('SELECT key, value FROM settings'),
  };

  return {
    // ordre : « recentes » = date de première publication, la plus récente d'abord ; sinon l'ordre de la galerie.
    publishedPhotos({ author, category, ordre } = {}) {
      const list = q.published.all().map(decorate)
        .filter(p => (!author || p.author_slug === author) && (!category || p.category_slug === category));
      if (ordre === 'recentes') list.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '') || b.id - a.id);
      return list.map((p, i) => ({ ...p, index: i }));
    },
    categories: () => q.categories.all(),
    authors: () => q.authors.all(),
    settings() {
      return Object.fromEntries(q.settings.all().map(r => [r.key, JSON.parse(r.value)]));
    },
  };
}
