import { monthYear, clockTime } from './format.js';
import { pick } from './i18n.js';

const PHOTO_COLUMNS = `p.id, p.likes, p.slug, p.title, p.place, p.taken_on, p.legend, p.status, p.position, p.file, p.width, p.height, p.variant_key, p.updated_at, p.published_at, p.on_map, p.city_id, p.city_name, p.city_cc, p.city_lat, p.city_lon,
  p.title_en, p.title_de, p.legend_en, p.legend_de, p.place_en, p.place_de, p.keywords,
  CASE WHEN p.show_time = 1 AND p.taken_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' THEN p.taken_time END AS shown_time,
  c.slug AS category_slug, c.name AS category, c.name_en AS category_en, c.name_de AS category_de, a.slug AS author_slug, a.name AS author`;

// Heure de prise de vue (taken_time) : jamais lue telle quelle par le site public. shown_time ne la porte que si le
// photographe a choisi de la montrer (show_time, migration 052) et que la date est au jour ; time : la même, écrite
// dans la langue de la page (« 14 h 32 »), '' sinon. Seule la page d'une photo l'affiche.
// n : rang de la photo parmi toutes les photos publiées, quel que soit le filtre (N°01, N°02… sans trou).
// Titre, légende, lieu et série dans la langue de la page (repli sur une autre langue si la traduction manque).
const decorate = lang => (p, i) => ({
  ...p, n: i + 1, when: monthYear(p.taken_on, lang), time: clockTime(p.shown_time, lang), index: i,
  title: pick(p, 'title', lang), legend: pick(p, 'legend', lang), place: pick(p, 'place', lang), category: pick(p, 'category', lang),
});

export function createRepo(db) {
  const q = {
    published: db.prepare(`SELECT ${PHOTO_COLUMNS} FROM photos p
      JOIN categories c ON c.id = p.category_id JOIN authors a ON a.id = p.author_id
      WHERE p.status = 'published' ORDER BY p.position, p.id`),
    categories: db.prepare('SELECT id, slug, name, name_en, name_de FROM categories ORDER BY position, id'),
    authors: db.prepare('SELECT id, slug, name, bio, bio_en, bio_de FROM authors ORDER BY id'),
    settings: db.prepare('SELECT key, value FROM settings'),
  };

  return {
    // Post Instagram publié depuis le site pour cette photo (le plus récent) : lien « Voir sur Instagram ».
    instagramPermalink: id => db.prepare("SELECT permalink FROM instagram_posts WHERE photo_id = ? AND status = 'published' AND permalink IS NOT NULL ORDER BY published_at DESC LIMIT 1").pluck().get(id) || null,
    // ordre : « recentes » = date de première publication, la plus récente d'abord ; sinon l'ordre de la galerie.
    publishedPhotos({ author, category, ordre, lang = 'fr' } = {}) {
      const list = q.published.all().map(decorate(lang))
        .filter(p => (!author || p.author_slug === author) && (!category || p.category_slug === category));
      if (ordre === 'recentes') list.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '') || b.id - a.id);
      return list.map((p, i) => ({ ...p, index: i }));
    },
    categories: (lang = 'fr') => q.categories.all().map(c => ({ ...c, name: pick(c, 'name', lang) })),
    authors: (lang = 'fr') => q.authors.all().map(a => ({ ...a, bio: pick(a, 'bio', lang) })),
    settings() {
      return Object.fromEntries(q.settings.all().map(r => [r.key, JSON.parse(r.value)]));
    },
  };
}
