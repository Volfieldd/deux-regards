import path from 'node:path';
import * as cities from './geo/cities.js';
import { slugify } from './slug.js';
import { monthYear } from './format.js';
import { parseFocal } from './point-focal.js';
import { SHOT_COLUMNS } from './prise-de-vue.js';

// Les deux listes d'ouverture de l'accueil (réglages) : elles suivent le renommage et la suppression d'une photo.
const HERO_KEYS = ['hero', 'hero_tel'];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ValidationError extends Error {
  constructor(errors) {
    super('Formulaire invalide');
    this.errors = errors;
  }
}

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Texte d'une seule ligne (texte de remplacement, description courte, texte d'intention) : retours à la ligne,
// tabulations et autres caractères de contrôle remplacés par une espace, espaces répétées réduites. Il est écrit tel
// quel dans un attribut alt ou une phrase : rien n'y est lu comme du HTML (échappé à l'affichage).
const line = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim() : '');
// Bornes des textes du site public v2 (migration 053).
//   - Texte de remplacement : 250 signes. Une ou deux phrases sur ce qu'on voit (« Une minoterie à six cheminées sur la
//     Maine, à demi noyée dans la brume bleue du matin. » : 86 signes) ; les guides d'accessibilité conseillent de
//     rester vers 125 signes en français, et l'allemand est un tiers plus long : 250 laisse cette marge sans permettre
//     un texte qu'un lecteur d'écran lirait d'un bloc pendant une minute. Plus long, c'est la légende.
//   - Description courte d'un photographe : une phrase sous son nom (« le matin, les quais, les fleuves »), 160 signes.
//   - Texte d'intention d'une série : environ 330 signes dans la maquette (MQ-03), 800 au plus, en un paragraphe.
export const LIMITS = { alt_text: 250, short_bio: 160, intent: 800 };
// Mois d'un instant à l'heure de Paris (« 2026-11 »).
const PARIS_MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' });
const parisMonth = d => PARIS_MONTH.format(d).slice(0, 7);
// Texte de recherche : minuscules, sans accents.
const fold = v => String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
// Mots-clés : séparés par des virgules (ou des points-virgules, des retours à la ligne), sans doublon, 30 au plus.
export function normKeywords(raw) {
  const seen = new Set(), out = [];
  for (const w of String(raw ?? '').split(/[,;\n]+/)) {
    const k = w.replace(/\s+/g, ' ').trim().replace(/^#/, '').slice(0, 40);
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase()); out.push(k);
    if (out.length >= 30) break;
  }
  return out.join(', ');
}
function resolveLocation(body, before, errors) {
  const keep = { city_id: before?.city_id ?? null, city_name: before?.city_name ?? null, city_cc: before?.city_cc ?? null, city_lat: before?.city_lat ?? null, city_lon: before?.city_lon ?? null, city_source: before?.city_source ?? null };
  let loc = keep;
  if ('city_label' in body) {
    const typed = String(body.city_label ?? '').trim().slice(0, 120);
    if (!typed) loc = { city_id: null, city_name: null, city_cc: null, city_lat: null, city_lon: null, city_source: null };
    else {
      // Libellé de la liste dans la langue de l'admin, avec ou sans région, ou simple nom de ville.
      const chosen = Number(body.city_id) ? cities.byId(body.city_id) : null;
      const city = chosen && cities.matches(chosen, typed) ? chosen
        : cities.search(typed.split(',')[0], 30).find(c => cities.matches(c, typed));
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
    covers: db.prepare(`SELECT * FROM (SELECT p.*, ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY (p.status = 'published') DESC, p.position, p.id) AS rn
      FROM photos p) WHERE rn = 1`),
    existing: db.prepare('SELECT id FROM photos WHERE id IN (SELECT value FROM json_each(?))').pluck(),
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
    // Recherche : sans tenir compte des accents ni des majuscules (« eglise » trouve « Église »), dans le titre, le
    // lieu, la légende, l'adresse, les mots-clés et les traductions, comme la palette ⌘K.
    photos({ q: search, author, category, status } = {}) {
      const needle = fold(text(search, 100));
      return q.photos.all()
        .filter(p => (!author || p.author_slug === author) && (!category || p.category_slug === category) && (!status || p.status === status))
        .filter(p => !needle || [p.title, p.place, p.legend, p.slug, p.keywords, p.title_en, p.title_de, p.legend_en, p.legend_de, p.place_en, p.place_de, p.alt_text, p.alt_text_en, p.alt_text_de, p.inventory].some(v => fold(v).includes(needle)))
        .map(p => ({ ...p, n: p.position + 1, when: monthYear(p.taken_on), provisional: isProvisional(p) }));
    },
    photo: id => q.photo.get(id),
    // Une photo avec les champs calculés de la liste (n, when, provisional), sans charger toutes les photos.
    photoView(id) {
      const p = q.photo.get(id);
      return p && { ...p, n: p.position + 1, when: monthYear(p.taken_on), provisional: isProvisional(p) };
    },

    // gps : position lue dans l'original ; seule la ville la plus proche est gardée (proposée, pas sur la carte).
    addPhoto({ title, categoryId, authorId, file, width, height, sha256 = null, sourceName = null, takenOn = null, takenTime = null, gps = null, shot = null }) {
      const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM photos').pluck().get();
      const city = gps ? cities.nearest(gps.lat, gps.lon) : null;
      const { lastInsertRowid } = db.prepare(`INSERT INTO photos (slug, title, category_id, author_id, status, position, file, width, height, sha256, source_name, taken_on,
          city_id, city_name, city_cc, city_lat, city_lon, city_source, gps_checked)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(uniqueSlug('photos', title), title, categoryId, authorId, position, file, width, height, sha256, sourceName, takenOn,
        city?.id ?? null, city?.name ?? null, city?.cc ?? null, city?.lat ?? null, city?.lon ?? null, city ? 'gps' : null);
      if (takenTime !== null) db.prepare('UPDATE photos SET taken_time = ? WHERE id = ?').run(takenTime, lastInsertRowid);
      // Prise de vue (six données de l'EXIF, déjà normalisées) : l'original est lu, le rattrapage n'y reviendra pas.
      if (shot) db.prepare(`UPDATE photos SET ${SHOT_COLUMNS.map(k => `${k} = @${k}`).join(', ')}, shot_read = 1 WHERE id = @id`).run({ ...Object.fromEntries(SHOT_COLUMNS.map(k => [k, shot[k] ?? null])), id: lastInsertRowid });
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
      // Heure sur le site : une case (seules ses valeurs « cochée » valent 1, toute autre valeur 0), et seulement pour
      // une photo dont l'heure de prise de vue est connue. Le site exige en plus une date au jour (server/repo.js).
      const showTime = truthy(body.show_time) && /^\d{2}:\d{2}$/.test(before?.taken_time || '') ? 1 : 0;
      // Prise de vue sur le site : une case cochée par défaut (migration 060). Envoyée, elle vaut ce qu'elle dit ; absente
      // d'un formulaire qui la portait (show_shot_case : case décochée, que le navigateur n'envoie pas), 0 ; absente
      // d'un formulaire sans elle (photo sans prise de vue connue, autre écran), la valeur d'avant.
      const showShot = 'show_shot' in body ? (truthy(body.show_shot) ? 1 : 0) : body.show_shot_case === '1' ? 0 : (before?.show_shot ?? 1);
      // Traductions facultatives (site en anglais et en allemand) : gardées telles quelles si le formulaire ne les envoie pas.
      const tr = (field, max) => Object.fromEntries(['en', 'de'].map(l => [`${field}_${l}`, `${field}_${l}` in body ? text(body[`${field}_${l}`], max) : (before?.[`${field}_${l}`] ?? '')]));
      // Texte de remplacement, en trois langues, sur une ligne : gardé tel quel si le formulaire ne l'envoie pas.
      const alt = Object.fromEntries(['alt_text', 'alt_text_en', 'alt_text_de'].map(k => [k, k in body ? line(body[k], LIMITS.alt_text) : (before?.[k] ?? '')]));
      // Point fort du cadrage (ouverture plein cadre de la v3) : gardé tel quel si le formulaire ne l'envoie pas.
      const focal = 'focal' in body ? parseFocal(body.focal) : [before?.focal_x ?? 50, before?.focal_y ?? 50];
      if (!focal) errors.focal = 'Point fort inconnu.';
      const values = { title, slug, category_id: categoryId, author_id: authorId, place: text(body.place, 120), taken_on: takenOn === undefined ? text(body.taken_on, 40) : takenOn, legend: text(body.legend, 2000), status, watermark,
        ...tr('title', 160), ...tr('legend', 2000), ...tr('place', 120), ...alt,
        keywords: 'keywords' in body ? normKeywords(body.keywords) : (before?.keywords ?? ''),
        city_label: 'city_label' in body ? text(body.city_label, 120) : cities.labelOf(before), on_map: loc.on_map, show_time: showTime, show_shot: showShot,
        focal_x: focal ? focal[0] : 50, focal_y: focal ? focal[1] : 50, focal: focal ? focal.join(' ') : text(body.focal, 20) };
      if (Object.keys(errors).length) throw Object.assign(new ValidationError(errors), { values });
      db.transaction(() => {
        // Série changée sur la fiche : choisie à la main (plus de proposition).
        db.prepare(`UPDATE photos SET series_checked = CASE WHEN category_id = @category_id THEN series_checked ELSE 1 END, title = @title, slug = @slug, category_id = @category_id, author_id = @author_id, place = @place,
          taken_on = @taken_on, legend = @legend, status = @status, watermark = @watermark,
          title_en = @title_en, title_de = @title_de, legend_en = @legend_en, legend_de = @legend_de, place_en = @place_en, place_de = @place_de,
          alt_text = @alt_text, alt_text_en = @alt_text_en, alt_text_de = @alt_text_de,
          keywords = @keywords, show_time = @show_time, show_shot = @show_shot, focal_x = @focal_x, focal_y = @focal_y, updated_at = datetime('now') WHERE id = @id`).run({ ...values, id });
        db.prepare(`UPDATE photos SET city_id = @city_id, city_name = @city_name, city_cc = @city_cc, city_lat = @city_lat, city_lon = @city_lon,
          city_source = @city_source, on_map = @on_map WHERE id = @id`).run({ ...loc, id });
        // L'ouverture désigne les photos par leur adresse : elle suit le renommage.
        for (const key of HERO_KEYS) {
          const list = settings()[key];
          if (before && before.slug !== slug && Array.isArray(list) && list.includes(before.slug)) {
            q.setSetting.run(key, JSON.stringify(list.map(s => (s === before.slug ? slug : s))));
          }
        }
      })();
    },

    // Modification champ par champ (page « Compléter le lot », textes seuls du relecteur) : seuls les champs fournis
    // sont relus, traductions comprises ; un champ absent garde sa valeur.
    patchPhoto(id, body) {
      const p = q.photo.get(id);
      if (!p) return null;
      const merged = { ...p, taken_on: p.taken_on || '', watermark: p.watermark === 0 ? 'none' : 'default' };
      // Filigrane (« default » ou « none ») et adresse : la fiche de l'admin v2 les enregistre aussi champ par champ.
      for (const k of ['title', 'category_id', 'author_id', 'place', 'taken_on', 'legend', 'keywords', 'city_id', 'city_label', 'on_map', 'show_time', 'show_shot',
        'title_en', 'title_de', 'legend_en', 'legend_de', 'place_en', 'place_de', 'alt_text', 'alt_text_en', 'alt_text_de', 'watermark', 'focal']) if (k in body) merged[k] = body[k];
      // Brouillon dont l'adresse dérive encore du titre : elle suit le nouveau titre ; une adresse envoyée l'emporte.
      merged.slug = 'slug' in body ? body.slug : 'title' in body && p.status === 'draft' && p.slug === uniqueSlug('photos', p.title, id) ? '' : p.slug;
      this.updatePhoto(id, merged);
      // Vue rapide : un clic sur une série, même celle qu'elle a déjà, vaut choix.
      if ('category_id' in body) db.prepare('UPDATE photos SET series_checked = 1 WHERE id = ?').run(id);
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
    // Identifiants reçus qui désignent une photo (dans l'ordre reçu, sans doublon) : une seule requête.
    existingIds(ids) {
      const wanted = [...new Set([].concat(ids || []).map(Number))].filter(Number.isInteger);
      if (!wanted.length) return [];
      const found = new Set(q.existing.all(JSON.stringify(wanted)));
      return wanted.filter(id => found.has(id));
    },
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
      const set = db.prepare("UPDATE photos SET category_id = ?, series_checked = 1, updated_at = datetime('now') WHERE id = ?");
      const before = {};
      for (const c of Object.values(map)) if (!exists('categories', Number(c))) throw new ValidationError({ category_id: 'Série inconnue.' });
      db.transaction(() => { for (const [id, c] of Object.entries(map)) { const p = q.photo.get(Number(id)); if (!p) continue; before[id] = p.category_id; set.run(Number(c), Number(id)); } })();
      return before;
    },
    // « Garder » : la série actuelle est confirmée, la proposition disparaît.
    keepSeries: id => db.prepare('UPDATE photos SET series_checked = 1 WHERE id = ?').run(id).changes > 0,
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
        // Journal Instagram (sans clé étrangère) : l'identifiant pourra être repris par une autre photo.
        db.prepare('UPDATE instagram_events SET photo_id = NULL WHERE photo_id = ?').run(id);
        for (const key of HERO_KEYS) {
          const list = settings()[key];
          if (Array.isArray(list) && list.includes(photo.slug)) q.setSetting.run(key, JSON.stringify(list.filter(s => s !== photo.slug)));
        }
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
      const old = id ? db.prepare('SELECT name_en, name_de, intent, intent_en, intent_de FROM categories WHERE id = ?').get(id) : null;
      const name_en = 'name_en' in body ? text(body.name_en, 80) : old?.name_en ?? '';
      const name_de = 'name_de' in body ? text(body.name_de, 80) : old?.name_de ?? '';
      // Texte d'intention (page de la série, MQ-03), en trois langues : gardé tel quel si le formulaire ne l'envoie pas.
      const intent = Object.fromEntries(['intent', 'intent_en', 'intent_de'].map(k => [k, k in body ? line(body[k], LIMITS.intent) : old?.[k] ?? '']));
      if (Object.keys(errors).length) throw Object.assign(new ValidationError(errors), { values: { name, slug, name_en, name_de, ...intent } });
      if (id) return db.prepare('UPDATE categories SET name = @name, slug = @slug, name_en = @name_en, name_de = @name_de, intent = @intent, intent_en = @intent_en, intent_de = @intent_de WHERE id = @id').run({ name, slug, name_en, name_de, ...intent, id });
      // Nouvelle série en tête : c'est celle sur laquelle on travaille.
      return db.transaction(() => {
        db.prepare('UPDATE categories SET position = position + 1').run();
        return Number(db.prepare('INSERT INTO categories (name, slug, position) VALUES (?, ?, 0)').run(name, slug).lastInsertRowid);
      })();
    },
    orderCategories: ids => writeOrder('categories', ids),
    // Première photo de chaque série (couverture des cartes). Appelée à chaque page de l'admin (menu des séries) : un
    // seul parcours trié de la table (fonction de fenêtre), pas une sous-requête par photo.
    covers() {
      const rows = q.covers.all();
      return Object.fromEntries(rows.map(({ rn, ...r }) => [r.category_id, r]));
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
    // Photos importées par mois, sur les `months` derniers mois (le plus ancien d'abord), à l'heure de Paris :
    // created_at est en UTC ; regroupées par heure (les décalages de Paris sont des heures entières), puis par mois.
    importsByMonth(months = 12, authorId = null, now = new Date()) {
      const count = {};
      for (const r of db.prepare("SELECT substr(created_at, 1, 13) AS h, COUNT(*) AS n FROM photos WHERE (? IS NULL OR author_id = ?) AND created_at IS NOT NULL GROUP BY h").all(authorId, authorId)) {
        const at = new Date(`${r.h.replace(' ', 'T')}:00:00Z`);
        if (Number.isNaN(at.getTime())) continue;
        const m = parisMonth(at);
        count[m] = (count[m] || 0) + r.n;
      }
      const [y, mo] = parisMonth(now).split('-').map(Number);
      return Array.from({ length: months }, (_, i) => {
        const m = new Date(Date.UTC(y, mo - 1 - (months - 1 - i), 1)).toISOString().slice(0, 7);
        return { month: m, n: count[m] || 0 };
      });
    },
    recent: (n = 5, authorId = null) => db.prepare(`SELECT p.id, p.title, p.status, p.updated_at, p.file, p.width, p.height, p.variant_key, p.author_id, a.name AS author
      FROM photos p JOIN authors a ON a.id = p.author_id WHERE (? IS NULL OR p.author_id = ?) ORDER BY p.updated_at DESC, p.id DESC LIMIT ?`).all(authorId, authorId, n),
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
    // Photographe lié au compte (page « Comptes et rôles ») ; en connexion locale de test (« local:<slug> »), celui choisi.
    authorBySub(sub) {
      const id = db.prepare('SELECT author_id FROM accounts WHERE sub = ?').pluck().get(sub);
      return q.authors.all().find(a => (id != null && a.id === id) || `local:${a.slug}` === sub);
    },
    saveAuthor(id, body) {
      const errors = {};
      const name = text(body.name, 80);
      if (!name) errors.name = 'Le nom est obligatoire.';
      const slug = checkedSlug('authors', id ? body.slug : '', name, id, errors);
      // Lettre des cartes de rencontre (J-0142) : une lettre, propre à chaque auteur (les cartes, le QR /bonjour/J et
      // les rencontres saisies avec elles vont à son photographe). Vide : la lettre actuelle, à défaut la première de
      // l'adresse ; elle est enregistrée, si bien qu'un changement d'adresse ne la change plus. Unique, saisie ou non.
      const typed = text(body.card_prefix, 1).toUpperCase();
      const current = id ? q.authors.all().find(a => a.id === Number(id)) : null;
      const prefix = typed || (current ? current.card_prefix || current.slug.charAt(0).toUpperCase() : slug.charAt(0).toUpperCase());
      // Celui à qui la lettre revient déjà (même ordre que encounters.authorByPrefix : lettre enregistrée d'abord) ;
      // deux anciens auteurs sans lettre enregistrée et de même initiale : le plus ancien la garde.
      const owner = q.authors.all().filter(a => (a.card_prefix || a.slug.charAt(0).toUpperCase()) === prefix)
        .sort((a, b) => (b.card_prefix === prefix) - (a.card_prefix === prefix) || a.id - b.id)[0];
      const holder = /^[A-Z]$/.test(prefix) && owner && owner.id !== Number(id) ? owner : null;
      if (typed && !/^[A-Z]$/.test(typed)) errors.card_prefix = 'Lettre des cartes : une seule lettre, de A à Z.';
      else if (holder) errors.card_prefix = `La lettre ${prefix} est déjà celle de ${holder.name} : choisissez-en une autre.`;
      // Description courte (son « regard », sous son nom sur l'accueil v2), en trois langues : gardée si absente du formulaire.
      const short = Object.fromEntries(['short_bio', 'short_bio_en', 'short_bio_de'].map(k => [k, k in body ? line(body[k], LIMITS.short_bio) : current?.[k] ?? '']));
      const values = { name, slug, bio: text(body.bio, 2000), bio_en: text(body.bio_en, 2000), bio_de: text(body.bio_de, 2000), ...short, card_prefix: /^[A-Z]$/.test(prefix) ? prefix : '', ig_signature: text(body.ig_signature, 200) };
      if (Object.keys(errors).length) throw Object.assign(new ValidationError(errors), { values });
      if (id) return db.prepare('UPDATE authors SET name = @name, slug = @slug, bio = @bio, bio_en = @bio_en, bio_de = @bio_de, short_bio = @short_bio, short_bio_en = @short_bio_en, short_bio_de = @short_bio_de, card_prefix = @card_prefix, ig_signature = @ig_signature WHERE id = @id').run({ ...values, id });
      db.prepare('INSERT INTO authors (name, slug, bio, bio_en, bio_de, short_bio, short_bio_en, short_bio_de, card_prefix, ig_signature) VALUES (@name, @slug, @bio, @bio_en, @bio_de, @short_bio, @short_bio_en, @short_bio_de, @card_prefix, @ig_signature)').run(values);
    },
    // Ce qui retient un photographe (phrases en français, une par cause) : ses photos, ses rencontres (données
    // personnelles, qui ne seraient plus visibles que des administrateurs), ses voyages (devenus « communs ») et le
    // compte qui lui est lié. Ses sorties et ses journées de voyage n'existent que par ses photos et ses rencontres.
    authorHolds(id) {
      const a = q.authors.all().find(r => r.id === Number(id));
      if (!a) return [];
      const encounters = db.prepare('SELECT COUNT(*) FROM encounters WHERE author_id = ?').pluck().get(a.id);
      const trips = db.prepare('SELECT COUNT(*) FROM trips WHERE author_id = ?').pluck().get(a.id);
      const accounts = db.prepare("SELECT COALESCE(NULLIF(name, ''), sub) FROM accounts WHERE author_id = ?").pluck().all(a.id);
      return [
        a.count && `${a.name} a encore ${a.count} photo(s).`,
        encounters && `${a.name} a encore ${encounters} rencontre(s) : rattachez-les à un autre photographe (fiche de chaque rencontre).`,
        trips && `${a.name} a encore ${trips} voyage(s) : rattachez-les à un autre photographe ou supprimez-les (page Voyages).`,
        ...accounts.map(account => `Le compte « ${account} » est lié à ${a.name} : changez son photographe dans Comptes et rôles.`),
      ].filter(Boolean);
    },
    deleteAuthor(id) {
      const a = q.authors.all().find(r => r.id === Number(id));
      if (!a) return false;
      const holds = this.authorHolds(a.id);
      if (holds.length) throw Object.assign(new ValidationError({ delete: holds.join(' ') }), { messages: holds });
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
      // Deux listes d'ouverture : hero (toutes les versions) et hero_tel (le téléphone, en v3 ; des verticales de préférence).
      // Boutons ← → ✕ (sans JavaScript) : « left:slug », « right:slug », « remove:slug » dans hero_op ou hero_tel_op.
      const heroList = key => {
        const list = [...new Set([].concat(body[key] || []))].filter(s => published.has(s));
        const [op, target] = String(body[`${key}_op`] || '').split(/:(.*)/s);
        const i = list.indexOf(target);
        if (i !== -1 && op === 'remove') list.splice(i, 1);
        if (i !== -1 && (op === 'left' || op === 'right')) {
          const j = i + (op === 'left' ? -1 : 1);
          if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
        }
        return list.slice(0, 8);
      };
      const hero = heroList('hero');
      const heroTel = heroList('hero_tel');
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
        legal_names: text(body.legal_names, 200), legal_address: text(body.legal_address, 400), legal_email: text(body.legal_email, 200), legal_phone: text(body.legal_phone, 40), legal_director: text(body.legal_director, 120),
        // Hébergement : « editeurs » (par défaut) ou « hebergeur », dont le nom, l'adresse et le téléphone sont alors dus.
        legal_host: body.legal_host === 'hebergeur' ? 'hebergeur' : 'editeurs', legal_host_name: text(body.legal_host_name, 200), legal_host_address: text(body.legal_host_address, 400), legal_host_phone: text(body.legal_host_phone, 40),
        map_page: body.map_page === 'on',
        search_page: body.search_page === 'on', keywords_shown: body.keywords_shown === 'on',
        hero, hero_tel: heroTel,
      };
      const DROITS = /^(rights_|privacy_|legal_)/;
      const keep = k => !part || (part === 'droits' ? DROITS.test(k) : !DROITS.test(k));
      db.transaction(() => { for (const [k, v] of Object.entries(values)) if (keep(k)) q.setSetting.run(k, JSON.stringify(v)); })();
    },
  };
}
