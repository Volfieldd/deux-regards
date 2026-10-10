import { slugify } from './slug.js';
import { monthYear } from './format.js';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

export class ValidationError extends Error {
  constructor(errors) {
    super('Formulaire invalide');
    this.errors = errors;
  }
}

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Requêtes de l'administration. Toute écriture passe par ici ; les routes ne font pas de SQL.
export function createAdminRepo(db) {
  const PHOTO = `SELECT p.*, c.name AS category, c.slug AS category_slug, a.name AS author, a.slug AS author_slug
    FROM photos p JOIN categories c ON c.id = p.category_id JOIN authors a ON a.id = p.author_id`;
  const q = {
    photos: db.prepare(`${PHOTO} ORDER BY p.position, p.id`),
    photo: db.prepare(`${PHOTO} WHERE p.id = ?`),
    slugTaken: {
      photos: db.prepare('SELECT 1 FROM photos WHERE slug = ? AND id IS NOT ?').pluck(),
      categories: db.prepare('SELECT 1 FROM categories WHERE slug = ? AND id IS NOT ?').pluck(),
      authors: db.prepare('SELECT 1 FROM authors WHERE slug = ? AND id IS NOT ?').pluck(),
    },
    categories: db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM photos p WHERE p.category_id = c.id) AS count
      FROM categories c ORDER BY c.position, c.id`),
    authors: db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM photos p WHERE p.author_id = a.id) AS count
      FROM authors a ORDER BY a.id`),
    settings: db.prepare('SELECT key, value FROM settings'),
    setSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  };

  const exists = (table, id) => Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).pluck().get(id));

  // Slug libre : « titre », puis « titre-2 », « titre-3 »…
  function uniqueSlug(table, wanted, id = null) {
    const base = slugify(wanted) || 'sans-titre';
    let slug = base;
    for (let n = 2; q.slugTaken[table].get(slug, id); n++) slug = `${base}-${n}`;
    return slug;
  }

  // Slug saisi : doit être valide et libre. Vide : dérivé du nom.
  function checkedSlug(table, input, fallback, id, errors) {
    const slug = text(input, 80);
    if (!slug) return uniqueSlug(table, fallback, id);
    if (!SLUG_RE.test(slug)) errors.slug = 'Minuscules, chiffres et tirets uniquement.';
    else if (q.slugTaken[table].get(slug, id)) errors.slug = 'Déjà utilisé.';
    return slug;
  }

  // Réécrit les positions dans l'ordre donné (liste complète des id de la table).
  function writeOrder(table, ids) {
    const all = db.prepare(`SELECT id FROM ${table}`).pluck().all();
    const wanted = ids.map(Number);
    if (wanted.length !== all.length || new Set(wanted).size !== all.length || !wanted.every(id => all.includes(id))) {
      throw new ValidationError({ order: 'Ordre incomplet ou invalide.' });
    }
    const set = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`);
    db.transaction(() => wanted.forEach((id, i) => set.run(i, id)))();
  }

  function move(table, list, id, dir) {
    const ids = list.map(r => r.id);
    const i = ids.indexOf(Number(id));
    const j = i + (dir === 'up' ? -1 : 1);
    if (i === -1 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    writeOrder(table, ids);
  }

  const settings = () => Object.fromEntries(q.settings.all().map(r => [r.key, JSON.parse(r.value)]));

  return {
    // ---------- photos ----------
    photos({ q: search, author, category, status } = {}) {
      const needle = text(search, 100).toLowerCase();
      return q.photos.all()
        .filter(p => (!author || p.author_slug === author) && (!category || p.category_slug === category) && (!status || p.status === status))
        .filter(p => !needle || [p.title, p.place, p.legend, p.slug].some(v => v.toLowerCase().includes(needle)))
        .map(p => ({ ...p, n: p.position + 1, when: monthYear(p.taken_on) }));
    },
    photo: id => q.photo.get(id),

    addPhoto({ title, categoryId, authorId, file, width, height }) {
      const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM photos').pluck().get();
      const { lastInsertRowid } = db.prepare(`INSERT INTO photos (slug, title, category_id, author_id, status, position, file, width, height)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)`).run(uniqueSlug('photos', title), title, categoryId, authorId, position, file, width, height);
      return Number(lastInsertRowid);
    },

    updatePhoto(id, body) {
      const errors = {};
      const title = text(body.title, 160);
      if (!title) errors.title = 'Le titre est obligatoire.';
      const slug = checkedSlug('photos', body.slug, title, id, errors);
      const categoryId = Number(body.category_id);
      if (!exists('categories', categoryId)) errors.category_id = 'Série inconnue.';
      const authorId = Number(body.author_id);
      if (!exists('authors', authorId)) errors.author_id = 'Auteur inconnu.';
      const takenOn = text(body.taken_on, 10);
      if (takenOn && !DATE_RE.test(takenOn)) errors.taken_on = 'Format AAAA-MM ou AAAA-MM-JJ.';
      const status = body.status === 'published' ? 'published' : 'draft';
      const values = { title, slug, category_id: categoryId, author_id: authorId, place: text(body.place, 120), taken_on: takenOn || null, legend: text(body.legend, 2000), status };
      if (Object.keys(errors).length) throw Object.assign(new ValidationError(errors), { values });
      db.prepare(`UPDATE photos SET title = @title, slug = @slug, category_id = @category_id, author_id = @author_id, place = @place,
        taken_on = @taken_on, legend = @legend, status = @status, updated_at = datetime('now') WHERE id = @id`).run({ ...values, id });
    },

    setStatus(id, status) {
      db.prepare("UPDATE photos SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status === 'published' ? 'published' : 'draft', id);
    },

    // Supprime la ligne (et la retire de l'ouverture) ; renvoie le fichier à effacer.
    deletePhoto(id) {
      const photo = q.photo.get(id);
      if (!photo) return null;
      db.transaction(() => {
        db.prepare('DELETE FROM photos WHERE id = ?').run(id);
        const hero = settings().hero;
        if (Array.isArray(hero) && hero.includes(photo.slug)) q.setSetting.run('hero', JSON.stringify(hero.filter(s => s !== photo.slug)));
      })();
      return photo.file;
    },

    orderPhotos: ids => writeOrder('photos', ids),
    movePhoto(id, dir) { move('photos', q.photos.all(), id, dir); },

    // ---------- séries ----------
    categories: () => q.categories.all(),
    saveCategory(id, body) {
      const errors = {};
      const name = text(body.name, 80);
      if (!name) errors.name = 'Le nom est obligatoire.';
      const slug = checkedSlug('categories', id ? body.slug : '', name, id, errors);
      if (Object.keys(errors).length) throw Object.assign(new ValidationError(errors), { values: { name, slug } });
      if (id) return db.prepare('UPDATE categories SET name = ?, slug = ? WHERE id = ?').run(name, slug, id);
      const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM categories').pluck().get();
      db.prepare('INSERT INTO categories (name, slug, position) VALUES (?, ?, ?)').run(name, slug, position);
    },
    moveCategory(id, dir) { move('categories', q.categories.all(), id, dir); },
    // Refusé tant que la série contient des photos.
    deleteCategory(id) {
      const c = q.categories.all().find(r => r.id === Number(id));
      if (!c) return false;
      if (c.count) throw new ValidationError({ delete: `La série « ${c.name} » contient encore ${c.count} photo(s).` });
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
      return true;
    },

    // ---------- auteurs ----------
    authors: () => q.authors.all(),
    // Auteur lié au compte ; en connexion locale de test (« local:<slug> »), l'auteur choisi.
    authorBySub: sub => q.authors.all().find(a => a.oidc_sub === sub || `local:${a.slug}` === sub),
    saveAuthor(id, body) {
      const errors = {};
      const name = text(body.name, 80);
      if (!name) errors.name = 'Le nom est obligatoire.';
      const slug = checkedSlug('authors', id ? body.slug : '', name, id, errors);
      const sub = text(body.oidc_sub, 255) || null;
      if (sub && q.authors.all().some(a => a.oidc_sub === sub && a.id !== Number(id))) errors.oidc_sub = 'Ce compte est déjà lié à un autre auteur.';
      const values = { name, slug, bio: text(body.bio, 2000), oidc_sub: sub };
      if (Object.keys(errors).length) throw Object.assign(new ValidationError(errors), { values });
      if (id) return db.prepare('UPDATE authors SET name = @name, slug = @slug, bio = @bio, oidc_sub = @oidc_sub WHERE id = @id').run({ ...values, id });
      db.prepare('INSERT INTO authors (name, slug, bio, oidc_sub) VALUES (@name, @slug, @bio, @oidc_sub)').run(values);
    },
    deleteAuthor(id) {
      const a = q.authors.all().find(r => r.id === Number(id));
      if (!a) return false;
      if (a.count) throw new ValidationError({ delete: `${a.name} a encore ${a.count} photo(s).` });
      db.prepare('DELETE FROM authors WHERE id = ?').run(id);
      return true;
    },

    // ---------- réglages ----------
    settings,
    saveSettings(body) {
      const published = new Set(db.prepare("SELECT slug FROM photos WHERE status = 'published'").pluck().all());
      const hero = [].concat(body.hero || []).filter(s => published.has(s)).slice(0, 8);
      const values = {
        site_name: text(body.site_name, 60),
        tagline: text(body.tagline, 200),
        intro: text(body.intro, 1000),
        about: text(body.about, 10000),
        hero,
      };
      db.transaction(() => { for (const [k, v] of Object.entries(values)) q.setSetting.run(k, JSON.stringify(v)); })();
    },
  };
}
