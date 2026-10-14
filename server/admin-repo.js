import path from 'node:path';
import * as cities from './geo/cities.js';
import { slugify } from './slug.js';
import { monthYear } from './format.js';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ValidationError extends Error {
  constructor(errors) {
    super('Formulaire invalide');
    this.errors = errors;
  }
}

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// « IMG_2041 quai-nord.jpg » → « IMG 2041 quai nord »
export const titleFromFilename = name => path.parse(String(name || '')).name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Sans titre';

// Titre provisoire : encore celui tiré du nom du fichier envoyé.
export const isProvisional = p => Boolean(p.source_name) && p.title === titleFromFilename(p.source_name);

const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const two = n => String(n).padStart(2, '0');

// Date de prise de vue en langage courant → AAAA-MM ou AAAA-MM-JJ ; null si vide ; undefined si incomprise.
// « 2026-10 », « 10/2026 », « 5/10/2026 », « oct. 2026 », « octobre 2026 », « 1er oct 2026 ».
export function parseTakenOn(input) {
  const raw = text(input, 40);
  if (!raw) return null;
  const s = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  const ok = (y, m, d) => {
    if (y < 1800 || y > 2200 || m < 1 || m > 12) return undefined;
    if (d === undefined) return `${y}-${two(m)}`;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCMonth() === m - 1 && d >= 1 ? `${y}-${two(m)}-${two(d)}` : undefined;
  };
  let m;
  if ((m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(s))) return ok(+m[1], +m[2], m[3] && +m[3]);
  if ((m = /^(\d{1,2})[/ -](\d{4})$/.exec(s))) return ok(+m[2], +m[1]);
  if ((m = /^(\d{1,2})[/ -](\d{1,2})[/ -](\d{4})$/.exec(s))) return ok(+m[3], +m[2], +m[1]);
  if ((m = /^(?:(\d{1,2})(?:er)? )?([a-z]+) (\d{4})$/.exec(s))) {
    const found = MONTHS.map((name, i) => [name, i]).filter(([name]) => m[2].length >= 3 && name.startsWith(m[2]));
    if (found.length !== 1) return undefined;
    return ok(+m[3], found[0][1] + 1, m[1] && +m[1]);
  }
  return undefined;
}
export const DATE_HINT = 'Date non comprise : essayez « oct. 2026 », « 10/2026 » ou « 2026-10 ».';

// Requêtes de l'administration. Toute écriture passe par ici ; les routes ne font pas de SQL.
// Ville d'une photo (carte du site). city_label : ce qui est affiché dans le champ (« Angers, France ») ; city_id :
// la ville choisie dans la liste proposée. Sans city_label (modification d'un autre champ), la ville ne change pas.
// Une ville tapée sans la choisir (sans JavaScript) est reconnue si elle correspond exactement à une ville connue.
// « Afficher sur la carte » exige une ville ; sans ville, la photo quitte la carte.
const truthy = v => v === true || v === 1 || v === '1' || v === 'on' || v === 'true';
function resolveLocation(body, before, errors) {
  const keep = { city_id: before?.city_id ?? null, city_name: before?.city_name ?? null, city_cc: before?.city_cc ?? null, city_lat: before?.city_lat ?? null, city_lon: before?.city_lon ?? null, city_source: before?.city_source ?? null };
  let loc = keep;
  if ('city_label' in body) {
    const typed = String(body.city_label ?? '').trim().slice(0, 120);
    if (!typed) loc = { city_id: null, city_name: null, city_cc: null, city_lat: null, city_lon: null, city_source: null };
    else {
      const n = cities.norm(typed);
      const chosen = Number(body.city_id) ? cities.byId(body.city_id) : null;
      const city = chosen && (cities.norm(chosen.label) === n || cities.norm(chosen.name) === n) ? chosen
        : cities.search(typed, 10).find(c => cities.norm(c.label) === n || cities.norm(c.name) === n);
      if (!city) errors.city = 'Ville introuvable : choisissez-la dans la liste proposée (toutes les communes de France, localités de plus de 500 habitants ailleurs). Pour un lieu précis, utilisez le champ Lieu.';
      else if (city.id === before?.city_id) loc = keep;
      else loc = { city_id: city.id, city_name: city.name, city_cc: city.cc, city_lat: city.lat, city_lon: city.lon, city_source: 'manuel' };
    }
  }
  const wantMap = truthy(body.on_map);
  if (wantMap && !loc.city_id && !errors.city) errors.on_map = 'Choisissez d’abord une ville pour afficher la photo sur la carte.';
  return { ...loc, on_map: wantMap && loc.city_id ? 1 : 0 };
}

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
        .map(p => ({ ...p, n: p.position + 1, when: monthYear(p.taken_on), provisional: isProvisional(p) }));
    },
    photo: id => q.photo.get(id),
    // Une photo avec les champs calculés de la liste (n, when, provisional), sans charger toutes les photos.
    photoView(id) {
      const p = q.photo.get(id);
      return p && { ...p, n: p.position + 1, when: monthYear(p.taken_on), provisional: isProvisional(p) };
    },

    // gps : position lue dans l'original ; seule la ville la plus proche est gardée (proposée, pas sur la carte).
    addPhoto({ title, categoryId, authorId, file, width, height, sha256 = null, sourceName = null, takenOn = null, gps = null }) {
      const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM photos').pluck().get();
      const city = gps ? cities.nearest(gps.lat, gps.lon) : null;
      const { lastInsertRowid } = db.prepare(`INSERT INTO photos (slug, title, category_id, author_id, status, position, file, width, height, sha256, source_name, taken_on,
          city_id, city_name, city_cc, city_lat, city_lon, city_source, gps_checked)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(uniqueSlug('photos', title), title, categoryId, authorId, position, file, width, height, sha256, sourceName, takenOn,
        city?.id ?? null, city?.name ?? null, city?.cc ?? null, city?.lat ?? null, city?.lon ?? null, city ? 'gps' : null);
      return Number(lastInsertRowid);
    },

    // Rencontre où la personne photographiée refuse la publication : la photo ne peut plus être publiée.
    refusalOf: photoId => db.prepare(`SELECT COALESCE(e.ref, 'sans référence') FROM encounter_photos ep JOIN encounters e ON e.id = ep.encounter_id
      WHERE ep.photo_id = ? AND e.refused = 1 ORDER BY e.id LIMIT 1`).pluck().get(photoId) || null,

    updatePhoto(id, body) {
      const errors = {};
      const title = text(body.title, 160);
      if (!title) errors.title = 'Le titre est obligatoire.';
      const slug = checkedSlug('photos', body.slug, title, id, errors);
      const categoryId = Number(body.category_id);
      if (!exists('categories', categoryId)) errors.category_id = 'Série inconnue.';
      const authorId = Number(body.author_id);
      if (!exists('authors', authorId)) errors.author_id = 'Auteur inconnu.';
      const takenOn = parseTakenOn(body.taken_on);
      if (takenOn === undefined) errors.taken_on = DATE_HINT;
      const status = body.status === 'published' ? 'published' : 'draft';
      const refusal = status === 'published' ? this.refusalOf(id) : null;
      if (refusal) errors.status = `La personne photographiée refuse la publication (rencontre ${refusal}) : la photo reste en brouillon.`;
      const watermark = body.watermark === 'none' ? 0 : null;
      const before = q.photo.get(id);
      const loc = resolveLocation(body, before, errors);
      // Traductions facultatives (site en anglais et en allemand) : gardées telles quelles si le formulaire ne les envoie pas.
      const tr = (field, max) => Object.fromEntries(['en', 'de'].map(l => [`${field}_${l}`, `${field}_${l}` in body ? text(body[`${field}_${l}`], max) : (before?.[`${field}_${l}`] ?? '')]));
      const values = { title, slug, category_id: categoryId, author_id: authorId, place: text(body.place, 120), taken_on: takenOn === undefined ? text(body.taken_on, 40) : takenOn, legend: text(body.legend, 2000), status, watermark,
        ...tr('title', 160), ...tr('legend', 2000), ...tr('place', 120),
        city_label: 'city_label' in body ? text(body.city_label, 120) : (before?.city_name ? cities.label({ name: before.city_name, cc: before.city_cc }) : ''), on_map: loc.on_map };
      if (Object.keys(errors).length) throw Object.assign(new ValidationError(errors), { values });
      db.transaction(() => {
        db.prepare(`UPDATE photos SET title = @title, slug = @slug, category_id = @category_id, author_id = @author_id, place = @place,
          taken_on = @taken_on, legend = @legend, status = @status, watermark = @watermark,
          title_en = @title_en, title_de = @title_de, legend_en = @legend_en, legend_de = @legend_de, place_en = @place_en, place_de = @place_de,
          updated_at = datetime('now') WHERE id = @id`).run({ ...values, id });
        db.prepare(`UPDATE photos SET city_id = @city_id, city_name = @city_name, city_cc = @city_cc, city_lat = @city_lat, city_lon = @city_lon,
          city_source = @city_source, on_map = @on_map WHERE id = @id`).run({ ...loc, id });
        // L'ouverture désigne les photos par leur adresse : elle suit le renommage.
        const hero = settings().hero;
        if (before && before.slug !== slug && Array.isArray(hero) && hero.includes(before.slug)) {
          q.setSetting.run('hero', JSON.stringify(hero.map(s => (s === before.slug ? slug : s))));
        }
      })();
    },

    // Modification champ par champ (page « Compléter le lot ») : seuls les champs fournis sont relus.
    patchPhoto(id, body) {
      const p = q.photo.get(id);
      if (!p) return null;
      const merged = { ...p, taken_on: p.taken_on || '', watermark: p.watermark === 0 ? 'none' : 'default' };
      for (const k of ['title', 'category_id', 'author_id', 'place', 'taken_on', 'legend', 'city_id', 'city_label', 'on_map']) if (k in body) merged[k] = body[k];
      // Brouillon dont l'adresse dérive encore du titre : elle suit le nouveau titre.
      merged.slug = 'title' in body && p.status === 'draft' && p.slug === uniqueSlug('photos', p.title, id) ? '' : p.slug;
      this.updatePhoto(id, merged);
      return q.photo.get(id);
    },

    // Carte : afficher ou retirer plusieurs photos (seulement celles qui ont une ville) ; état précédent pour annuler.
    withCity: ids => ids.filter(id => q.photo.get(id)?.city_id),
    setOnMap(ids, on) {
      const before = {};
      const set = db.prepare('UPDATE photos SET on_map = ? WHERE id = ?');
      db.transaction(() => { for (const id of ids) { const p = q.photo.get(id); if (!p || (on && !p.city_id) || Boolean(p.on_map) === on) continue; before[id] = p.on_map ? 1 : 0; set.run(on ? 1 : 0, id); } })();
      return before;
    },
    restoreOnMap(map) {
      const set = db.prepare('UPDATE photos SET on_map = ? WHERE id = ? AND (? = 0 OR city_id IS NOT NULL)');
      db.transaction(() => { for (const [id, v] of Object.entries(map || {})) { const on = Number(v) ? 1 : 0; set.run(on, Number(id), on); } })();
    },

    // Actions groupées. Renvoient l'état précédent pour pouvoir annuler.
    existingIds: ids => [...new Set([].concat(ids || []).map(Number))].filter(id => q.photo.get(id)),
    setStatuses(map) {
      const set = db.prepare("UPDATE photos SET status = ?, updated_at = datetime('now') WHERE id = ?");
      const before = {};
      db.transaction(() => {
        for (const [id, status] of Object.entries(map)) {
          const p = q.photo.get(Number(id));
          if (!p || (status === 'published' && this.refusalOf(Number(id)))) continue;      // refus de la personne photographiée
          before[id] = p.status; set.run(status === 'published' ? 'published' : 'draft', Number(id));
        }
      })();
      return before;
    },
    setCategories(map) {
      const set = db.prepare("UPDATE photos SET category_id = ?, updated_at = datetime('now') WHERE id = ?");
      const before = {};
      for (const c of Object.values(map)) if (!exists('categories', Number(c))) throw new ValidationError({ category_id: 'Série inconnue.' });
      db.transaction(() => { for (const [id, c] of Object.entries(map)) { const p = q.photo.get(Number(id)); if (!p) continue; before[id] = p.category_id; set.run(Number(c), Number(id)); } })();
      return before;
    },
    // Même lieu ou même date pour plusieurs photos (champ vide : inchangé).
    setFields(ids, body) {
      const errors = {};
      const place = text(body.place, 120);
      const takenOn = parseTakenOn(body.taken_on);
      if (takenOn === undefined) errors.taken_on = DATE_HINT;
      if (Object.keys(errors).length) throw new ValidationError(errors);
      const before = {};
      db.transaction(() => {
        for (const id of ids) {
          const p = q.photo.get(id);
          if (p) before[id] = { place: p.place, taken_on: p.taken_on };
          if (place) db.prepare("UPDATE photos SET place = ?, updated_at = datetime('now') WHERE id = ?").run(place, id);
          if (takenOn) db.prepare("UPDATE photos SET taken_on = ?, updated_at = datetime('now') WHERE id = ?").run(takenOn, id);
        }
      })();
      return { place, taken_on: takenOn, before };
    },
    // Annulation : lieu et date remis tels qu'avant.
    restoreFields(map) {
      const set = db.prepare("UPDATE photos SET place = ?, taken_on = ?, updated_at = datetime('now') WHERE id = ?");
      db.transaction(() => { for (const [id, v] of Object.entries(map)) if (q.photo.get(Number(id))) set.run(text(v?.place, 120), parseTakenOn(v?.taken_on) || null, Number(id)); })();
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
      const old = id ? db.prepare('SELECT name_en, name_de FROM categories WHERE id = ?').get(id) : null;
      const name_en = 'name_en' in body ? text(body.name_en, 80) : old?.name_en ?? '';
      const name_de = 'name_de' in body ? text(body.name_de, 80) : old?.name_de ?? '';
      if (Object.keys(errors).length) throw Object.assign(new ValidationError(errors), { values: { name, slug, name_en, name_de } });
      if (id) return db.prepare('UPDATE categories SET name = ?, slug = ?, name_en = ?, name_de = ? WHERE id = ?').run(name, slug, name_en, name_de, id);
      // Nouvelle série en tête : c'est celle sur laquelle on travaille.
      return db.transaction(() => {
        db.prepare('UPDATE categories SET position = position + 1').run();
        return Number(db.prepare('INSERT INTO categories (name, slug, position) VALUES (?, ?, 0)').run(name, slug).lastInsertRowid);
      })();
    },
    orderCategories: ids => writeOrder('categories', ids),
    // Première photo de chaque série (couverture des cartes).
    covers() {
      const rows = db.prepare(`SELECT * FROM photos p WHERE p.id = (SELECT id FROM photos WHERE category_id = p.category_id
        ORDER BY (status = 'published') DESC, position, id LIMIT 1)`).all();
      return Object.fromEntries(rows.map(r => [r.category_id, r]));
    },
    // Les n premières photos de chaque série (planches : publiées d'abord, dans l'ordre du site).
    boards(n = 3) {
      const map = {};
      for (const r of db.prepare("SELECT * FROM photos ORDER BY (status = 'published') DESC, position, id").all()) {
        const list = (map[r.category_id] ||= []);
        if (list.length < n) list.push(r);
      }
      return map;
    },
    // Photos importées par mois, sur les `months` derniers mois (le plus ancien d'abord).
    importsByMonth(months = 12) {
      const rows = db.prepare("SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS n FROM photos GROUP BY m").all();
      const count = Object.fromEntries(rows.map(r => [r.m, r.n]));
      const now = new Date();
      return Array.from({ length: months }, (_, i) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
        const m = d.toISOString().slice(0, 7);
        return { month: m, n: count[m] || 0 };
      });
    },
    recent: (n = 5) => db.prepare(`SELECT p.id, p.title, p.status, p.updated_at, p.file, p.width, p.height, p.variant_key, a.name AS author
      FROM photos p JOIN authors a ON a.id = p.author_id ORDER BY p.updated_at DESC, p.id DESC LIMIT ?`).all(n),
    moveCategory(id, dir) { move('categories', q.categories.all(), id, dir); },
    // Une série qui contient des photos n'est supprimée qu'en les déplaçant vers une autre série.
    deleteCategory(id, { moveTo = null } = {}) {
      const c = q.categories.all().find(r => r.id === Number(id));
      if (!c) return false;
      const target = Number(moveTo);
      if (c.count && (!target || target === c.id || !exists('categories', target))) {
        throw new ValidationError({ delete: `La série « ${c.name} » contient ${c.count} photo(s) : choisissez la série où les déplacer.` });
      }
      db.transaction(() => {
        if (c.count) db.prepare("UPDATE photos SET category_id = ?, updated_at = datetime('now') WHERE category_id = ?").run(target, c.id);
        db.prepare('DELETE FROM categories WHERE id = ?').run(c.id);
      })();
      return { moved: c.count, name: c.name };
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
      // Lettre des cartes de rencontre (J-0142) : une lettre, propre à chaque auteur.
      const prefix = text(body.card_prefix, 1).toUpperCase();
      if (prefix && !/^[A-Z]$/.test(prefix)) errors.card_prefix = 'Lettre des cartes : une seule lettre, de A à Z.';
      else if (prefix && q.authors.all().some(a => a.id !== Number(id) && (a.card_prefix || a.slug.charAt(0).toUpperCase()) === prefix)) errors.card_prefix = `La lettre ${prefix} est déjà celle d’un autre auteur.`;
      const values = { name, slug, bio: text(body.bio, 2000), bio_en: text(body.bio_en, 2000), bio_de: text(body.bio_de, 2000), oidc_sub: sub, card_prefix: prefix };
      if (Object.keys(errors).length) throw Object.assign(new ValidationError(errors), { values });
      if (id) return db.prepare('UPDATE authors SET name = @name, slug = @slug, bio = @bio, bio_en = @bio_en, bio_de = @bio_de, oidc_sub = @oidc_sub, card_prefix = @card_prefix WHERE id = @id').run({ ...values, id });
      db.prepare('INSERT INTO authors (name, slug, bio, bio_en, bio_de, oidc_sub, card_prefix) VALUES (@name, @slug, @bio, @bio_en, @bio_de, @oidc_sub, @card_prefix)').run(values);
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
    saveSetting: (key, value) => q.setSetting.run(key, JSON.stringify(value)),
    // Filigrane et métadonnées, déjà normalisés par variants.js.
    saveImageSettings(watermark, exif) {
      db.transaction(() => {
        q.setSetting.run('watermark', JSON.stringify(watermark));
        q.setSetting.run('exif', JSON.stringify(exif));
      })();
    },
    // part : « site » ou « droits » n'enregistre que les champs de cette page ; absent, tous.
    saveSettings(body, part = null) {
      const published = new Set(db.prepare("SELECT slug FROM photos WHERE status = 'published'").pluck().all());
      let hero = [...new Set([].concat(body.hero || []))].filter(s => published.has(s));
      // Boutons ← → ✕ de l'ouverture (sans JavaScript) : « left:slug », « right:slug », « remove:slug ».
      const [op, target] = String(body.hero_op || '').split(/:(.*)/s);
      const i = hero.indexOf(target);
      if (i !== -1 && op === 'remove') hero.splice(i, 1);
      if (i !== -1 && (op === 'left' || op === 'right')) {
        const j = i + (op === 'left' ? -1 : 1);
        if (j >= 0 && j < hero.length) [hero[i], hero[j]] = [hero[j], hero[i]];
      }
      hero = hero.slice(0, 8);
      const values = {
        site_name: text(body.site_name, 60),
        tagline: text(body.tagline, 200), tagline_en: text(body.tagline_en, 200), tagline_de: text(body.tagline_de, 200),
        intro: text(body.intro, 1000), intro_en: text(body.intro_en, 1000), intro_de: text(body.intro_de, 1000),
        about: text(body.about, 10000), about_en: text(body.about_en, 10000), about_de: text(body.about_de, 10000),
        rights_text: text(body.rights_text, 10000),
        rights_text_en: text(body.rights_text_en, 10000),
        rights_text_de: text(body.rights_text_de, 10000),
        rights_contact: text(body.rights_contact, 200),
        privacy_contact: text(body.privacy_contact, 200), privacy_mfa: body.privacy_mfa === 'on', privacy_encrypted: body.privacy_encrypted === 'on',
        map_page: body.map_page === 'on',
        hero,
      };
      const DROITS = /^(rights_|privacy_)/;
      const keep = k => !part || (part === 'droits' ? DROITS.test(k) : !DROITS.test(k));
      db.transaction(() => { for (const [k, v] of Object.entries(values)) if (keep(k)) q.setSetting.run(k, JSON.stringify(v)); })();
    },
  };
}
