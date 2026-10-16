import sharp from 'sharp';
import path from 'node:path';
import { takenTimeFromExif } from './media.js';
import { facesOf } from './readiness.js';

// Sorties : une journée de prise de vue d'un photographe, avec ses photos de ce jour-là (date EXIF) et les
// personnes rencontrées. Une sortie existe d'elle-même ; on peut la couper à une heure (matin, soir) : chaque
// partie va de son heure de début à la suivante. Une photo ou une rencontre sans heure connue compte dans toutes
// les parties du jour (prudence : ses accords et refus valent partout).
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// « 15:10 », « 9h05 », « 15 h » → HH:MM ; sinon null.
export function normTime(v) {
  const m = /^\s*(\d{1,2})\s*(?:[h:]\s*([0-5]\d)?)\s*$/i.exec(String(v || ''));
  if (!m || Number(m[1]) > 23) return null;
  return `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
}
// Jour valide (AAAA-MM-JJ qui existe au calendrier).
const DAY = { test: d => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false; const t = new Date(`${d}T12:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(d); } };

// Condition SQL « même partie de journée » : aucune coupure entre les deux heures (heure inconnue : même partie).
export const samePartSql = (author, day, t1, t2) => `NOT EXISTS (SELECT 1 FROM outings o WHERE o.author_id = ${author} AND o.day = ${day}
  AND o.starts > '00:00' AND ${t1} GLOB '[0-2][0-9]:[0-5][0-9]' AND ${t2} GLOB '[0-2][0-9]:[0-5][0-9]'
  AND o.starts > MIN(${t1}, ${t2}) AND o.starts <= MAX(${t1}, ${t2}))`;

export function createOutings({ db, encounters, storageDir, log, now = () => Date.now() }) {
  const q = {
    cuts: db.prepare("SELECT starts FROM outings WHERE author_id = ? AND day = ? AND starts > '00:00' ORDER BY starts").pluck(),
    row: db.prepare('SELECT * FROM outings WHERE author_id = ? AND day = ? AND starts = ?'),
    photosOf: db.prepare(`SELECT p.*, c.name AS category FROM photos p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.author_id = ? AND p.taken_on = ? ORDER BY COALESCE(p.taken_time, ''), p.position, p.id`),
    encountersOf: db.prepare(`SELECT id, met_time FROM encounters WHERE author_id = ? AND COALESCE(NULLIF(session_day, ''), NULLIF(met_on, '')) = ? AND anonymized = 0 ORDER BY id`),
    days: db.prepare(`SELECT author_id, day FROM (
        SELECT author_id, taken_on AS day FROM photos WHERE taken_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        UNION SELECT author_id, COALESCE(NULLIF(session_day, ''), NULLIF(met_on, '')) FROM encounters WHERE author_id IS NOT NULL AND anonymized = 0)
      WHERE day IS NOT NULL AND (@author IS NULL OR author_id = @author) GROUP BY author_id, day ORDER BY day DESC, author_id LIMIT 400`),
    authors: db.prepare('SELECT id, name, slug FROM authors'),
    excluded: db.prepare('SELECT encounter_id, photo_id FROM encounter_exclusions'),
    linked: db.prepare('SELECT encounter_id, photo_id FROM encounter_photos'),
  };

  // Parties d'une journée : [{ starts, ends }], la dernière finit à minuit (ends = null).
  const partsOf = (author, day) => {
    const starts = ['00:00', ...q.cuts.all(author, day)];
    return starts.map((s, i) => ({ starts: s, ends: starts[i + 1] || null }));
  };
  const inPart = (time, part) => !time || (time >= part.starts && (!part.ends || time < part.ends));

  // Une partie : ses photos, ses personnes (rencontres déchiffrées), son lieu et son état.
  function build(author, day, part, cache = {}) {
    const photos = q.photosOf.all(author.id, day).filter(p => inPart(p.taken_time && p.taken_time !== '' ? p.taken_time : null, part));
    const people = q.encountersOf.all(author.id, day).filter(e => inPart(TIME.test(e.met_time || '') ? e.met_time : null, part)).map(e => encounters.get(e.id)).filter(Boolean);
    const excluded = cache.excluded || new Set(q.excluded.all().map(x => `${x.encounter_id}:${x.photo_id}`));
    const linked = cache.linked || new Set(q.linked.all().map(x => `${x.encounter_id}:${x.photo_id}`));
    const decided = e => e.refused || e.consent;
    // Refus à appliquer : une photo publiée de la partie, non exclue pour cette personne (liée ou non).
    // Refus à appliquer : une photo publiée où la personne peut figurer (visage, ou liée), non exclue pour elle.
    const refusalOpen = people.some(e => e.refused && photos.some(p => p.status === 'published' && !excluded.has(`${e.id}:${p.id}`)
      && (facesOf(p).has || linked.has(`${e.id}:${p.id}`))));
    const state = refusalOpen ? 'refus' : photos.some(p => p.status === 'draft') || people.some(e => !decided(e)) ? 'a-trier' : 'terminee';
    const row = q.row.get(author.id, day, part.starts);
    // Lieu proposé : la ville la plus fréquente des photos, sinon leur lieu affiché. Jamais le lieu d'une rencontre
    // (donnée personnelle chiffrée : il serait recopié en clair dans la sortie).
    const counts = new Map();
    for (const p of photos) if (p.city_name) counts.set(p.city_name, (counts.get(p.city_name) || 0) + 1);
    const common = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const place = row?.place || common || photos.find(p => p.place)?.place || '';
    return {
      author, day, ...part, place, placeSet: Boolean(row?.place), photos, people, state, excluded, linked,
      split: part.starts !== '00:00' || Boolean(part.ends),
      counts: { photos: photos.length, published: photos.filter(p => p.status === 'published').length,
        accords: people.filter(e => !e.refused && e.consent).length, refusals: people.filter(e => e.refused).length, undecided: people.filter(e => !decided(e)).length },
    };
  }

  // skip(authorId, day) : journées à ne pas construire ; max : nombre de journées au plus (page d'un voyage : ses
  // propositions, sans construire tout l'historique).
  function list({ author = null, skip = null, max = Infinity } = {}) {
    const authors = new Map(q.authors.all().map(a => [a.id, a]));
    const cache = { excluded: new Set(q.excluded.all().map(x => `${x.encounter_id}:${x.photo_id}`)), linked: new Set(q.linked.all().map(x => `${x.encounter_id}:${x.photo_id}`)) };
    const out = [];
    let n = 0;
    for (const d of q.days.all({ author })) {
      const a = authors.get(d.author_id);
      if (!a || skip?.(d.author_id, d.day)) continue;
      if (n++ >= max) break;
      for (const part of partsOf(a.id, d.day).reverse()) out.push(build(a, d.day, part, cache));
    }
    return out;
  }
  // Sorties de journées choisies ([{ author_id, day }], celles d'un voyage), dans cet ordre.
  function ofDays(days) {
    const authors = new Map(q.authors.all().map(a => [a.id, a]));
    const cache = { excluded: new Set(q.excluded.all().map(x => `${x.encounter_id}:${x.photo_id}`)), linked: new Set(q.linked.all().map(x => `${x.encounter_id}:${x.photo_id}`)) };
    const out = [];
    for (const d of days) {
      const a = authors.get(d.author_id);
      if (a && DAY.test(d.day)) for (const part of partsOf(a.id, d.day).reverse()) out.push(build(a, d.day, part, cache));
    }
    return out;
  }

  // Une sortie d'après son adresse : photographe (adresse), jour, heure de début (HHMM ; absente : la première).
  function get(authorSlug, day, starts = '00:00') {
    const a = q.authors.all().find(x => x.slug === authorSlug);
    if (!a || !DAY.test(day)) return null;
    const parts = partsOf(a.id, day);
    const part = parts.find(p => p.starts === starts) || null;
    if (!part) return null;
    return { ...build(a, day, part), parts };
  }

  function ensureBase(author, day) {
    db.prepare("INSERT OR IGNORE INTO outings (author_id, day, starts, created_at) VALUES (?, ?, '00:00', ?)").run(author, day, now());
  }
  // Couper à une heure : la journée gagne une partie qui commence à cette heure.
  function cut(author, day, time) {
    if (!TIME.test(time) || time === '00:00' || !DAY.test(day)) return false;
    ensureBase(author, day);
    return db.prepare('INSERT OR IGNORE INTO outings (author_id, day, starts, created_at) VALUES (?, ?, ?, ?)').run(author, day, time, now()).changes > 0;
  }
  // Réunir une partie avec la précédente (son lieu, s'il était réglé, est perdu).
  const join = (author, day, starts) => starts !== '00:00' && db.prepare('DELETE FROM outings WHERE author_id = ? AND day = ? AND starts = ?').run(author, day, starts).changes > 0;
  function setPlace(author, day, starts, place) {
    if (!DAY.test(day) || !(starts === '00:00' || TIME.test(starts))) return;
    ensureBase(author, day);
    db.prepare('INSERT INTO outings (author_id, day, starts, place, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(author_id, day, starts) DO UPDATE SET place = excluded.place')
      .run(author, day, starts, String(place || '').trim().slice(0, 120), now());
  }

  // Heure des photos importées avant la colonne taken_time : lue une fois dans l'original, en arrière-plan.
  let stopped = false, running = null;
  async function backfillTimes(batch = 20) {
    const rows = db.prepare('SELECT id, file FROM photos WHERE taken_time IS NULL LIMIT ?').all(batch);
    for (const r of rows) {
      if (stopped) return 0;
      let time = '';
      try { time = takenTimeFromExif((await sharp(path.join(storageDir, 'originals', r.file)).metadata()).exif); } catch { time = ''; }
      if (stopped) return 0;                     // arrêt pendant la lecture : la base est peut-être déjà fermée
      db.prepare('UPDATE photos SET taken_time = ? WHERE id = ?').run(time, r.id);
    }
    return rows.length;
  }
  function backfillAll() {
    running ??= (async () => {
      let n = 0;
      try { for (let k; !stopped && (k = await backfillTimes()); ) n += k; } catch (err) { log?.error({ err }, 'sorties : heures des photos'); }
      if (n) log?.info({ photos: n }, 'sorties : heures de prise de vue lues');
      running = null;
      return n;
    })();
    return running;
  }

  // Adresse de la sortie qui contient ce moment (photographe, jour, heure ; heure inconnue : la première partie).
  function urlOf(authorId, day, time) {
    const a = q.authors.all().find(x => x.id === authorId);
    if (!a || !DAY.test(day || '')) return null;
    const t = TIME.test(time || '') ? time : null;
    const parts = partsOf(a.id, day);
    const part = t ? parts.find(p => inPart(t, p)) : parts[0];
    return `/admin/sorties/${a.slug}/${day}${part && part.starts !== '00:00' ? `?depuis=${part.starts.replace(':', '')}` : ''}`;
  }

  // Partie de la journée qui contient cette heure (heure inconnue : la première).
  function partAt(authorSlug, day, time) {
    const a = q.authors.all().find(x => x.slug === authorSlug);
    if (!a || !DAY.test(day)) return null;
    const parts = partsOf(a.id, day);
    const p = TIME.test(time || '') ? parts.find(x => inPart(time, x)) : parts[0];
    return get(authorSlug, day, p.starts);
  }

  return { list, ofDays, get, partAt, cut, join, setPlace, partsOf, urlOf, backfillAll, stop: () => { stopped = true; return running || Promise.resolve(0); } };
}
