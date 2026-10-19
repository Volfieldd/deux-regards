import path from 'node:path';
import sharp from 'sharp';
import { readExif } from './exif.js';

// Prise de vue d'une photo (visionneuse du site public, maquette MQ-04, lexique : « Fujifilm X-T5 · 23 mm · 1/1000 s ·
// f/11 · ISO 160 ») : six données lues dans l'EXIF de l'original, et rien d'autre. Boîtier (marque et modèle), objectif,
// focale, ouverture, vitesse, sensibilité. Jamais le GPS, le numéro de série du boîtier ou de l'objectif, le nom du
// propriétaire, le logiciel, le commentaire ni la note du fabricant (MakerNote) : ces balises ne sont même pas lues.
// Le texte vient d'un fichier, pas de l'auteur : il est nettoyé (caractères de contrôle, de mise en forme, espaces
// répétées), borné en longueur, et toujours échappé à l'affichage (<%= %> des gabarits).

export const SHOT_COLUMNS = ['shot_make', 'shot_model', 'shot_lens', 'shot_focal', 'shot_fnumber', 'shot_exposure', 'shot_iso'];
export const SHOT_LIMITS = { make: 40, model: 60, lens: 80 };
const EMPTY = Object.freeze(Object.fromEntries(SHOT_COLUMNS.map(k => [k, null])));

// Une ligne de texte sûre : sans caractère de contrôle (C0, C1, DEL), de mise en forme (sens d'écriture, largeur nulle),
// de substitution isolé ni de saut de ligne ; espaces réunies ; au plus `max` caractères. null si rien de lisible n'en reste
// (une lettre ou un chiffre au moins) ou si l'appareil a écrit une valeur de remplissage (« Unknown », « ---- »).
export function cleanText(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\u2028\u2029]/gu, ' ').replace(/\s+/g, ' ').trim();
  const cut = [...s].slice(0, max).join('').trim();
  if (!/[\p{L}\p{N}]/u.test(cut) || /^(unknown|n\/?a|none|null|0+|-+)$/i.test(cut)) return null;
  return cut;
}

// Marque : le nom courant (« FUJIFILM » → « Fujifilm », « NIKON CORPORATION » → « Nikon », « RICOH IMAGING COMPANY, LTD. » →
// « Ricoh ») ; une marque inconnue perd sa raison sociale (« Corporation », « Co., Ltd. »…) et, écrite en capitales, prend
// une capitale initiale (un sigle de trois lettres au plus reste en capitales : « DJI »).
const MAKES = [[/^fuji/i, 'Fujifilm'], [/^nikon/i, 'Nikon'], [/^canon/i, 'Canon'], [/^sony/i, 'Sony'], [/^ricoh/i, 'Ricoh'], [/^pentax/i, 'Pentax'],
  [/^om digital/i, 'OM System'], [/^olympus/i, 'Olympus'], [/^leica/i, 'Leica'], [/^panasonic/i, 'Panasonic'], [/^hasselblad/i, 'Hasselblad'],
  [/^sigma/i, 'Sigma'], [/^samsung/i, 'Samsung'], [/^apple/i, 'Apple'], [/^google/i, 'Google'], [/^(eastman )?kodak/i, 'Kodak'],
  [/^konica minolta/i, 'Konica Minolta'], [/^minolta/i, 'Minolta'], [/^phase one/i, 'Phase One'], [/^xiaomi/i, 'Xiaomi'], [/^huawei/i, 'Huawei'], [/^dji/i, 'DJI']];
const COMPANY = /[\s,]+(corporation|corp\.?|company|co\.?|ltd\.?|limited|inc\.?|gmbh|ag|s\.?a\.?|imaging|camera|optical|electric)\b\.?/gi;
export function normMake(raw) {
  const s = cleanText(raw, 120);
  if (!s) return null;
  const known = MAKES.find(([re]) => re.test(s));
  if (known) return known[1];
  let name = s.replace(COMPANY, '').replace(/[\s,.]+$/, '').trim() || s;
  if (name === name.toUpperCase()) name = name.split(' ').map(w => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase())).join(' ');
  return cleanText(name, SHOT_LIMITS.make);
}

// Modèle, sans la marque qu'il répète souvent (« NIKON Z 6_2 » → « Z 6_2 », « Canon EOS R5 » → « EOS R5 »).
export function normModel(raw, make, rawMake) {
  let s = cleanText(raw, 120);
  if (!s) return null;
  for (const m of [make, cleanText(rawMake, 120)?.split(' ')[0]].filter(Boolean)) {
    const word = m.split(' ')[0].toLowerCase();
    if (s.toLowerCase().startsWith(`${word} `)) { s = s.slice(word.length + 1).trim(); break; }
  }
  return cleanText(s, SHOT_LIMITS.model);
}

// Objectif ; rien s'il ne fait que répéter le modèle, ou s'il n'est que des zéros (« 0.0 mm f/0.0 »).
function normLens(raw, model) {
  const s = cleanText(raw, SHOT_LIMITS.lens);
  if (!s || (model && s.toLowerCase() === model.toLowerCase()) || /^[0.\s]*mm\s*f?\/?\s*[0.]*$/i.test(s)) return null;
  return s;
}

// Valeur numérique d'une balise (la première d'une liste), dans ses bornes ; null sinon.
const num = (v, min, max) => {
  const n = Array.isArray(v) ? v[0] : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// EXIF lu (objet d'exif-reader) → les sept colonnes de la prise de vue (toutes null si l'EXIF manque). Bornes : focale
// de 0,1 à 5 000 mm, ouverture de f/0,5 à f/256, vitesse de 1/100 000 s à une heure, ISO de 1 à 10 000 000.
export function shootingOf(e) {
  if (!e) return { ...EMPTY };
  const img = e.Image || {}, ph = e.Photo || {};
  const make = normMake(img.Make);
  const model = normModel(img.Model, make, img.Make);
  const iso = num(ph.ISOSpeedRatings, 1, 10_000_000) ?? num(ph.ISOSpeed, 1, 10_000_000);
  return {
    shot_make: make, shot_model: model, shot_lens: normLens(ph.LensModel, model),
    shot_focal: num(ph.FocalLength, 0.1, 5000), shot_fnumber: num(ph.FNumber, 0.5, 256),
    shot_exposure: num(ph.ExposureTime, 1e-5, 3600), shot_iso: iso === null ? null : Math.round(iso),
  };
}
export const shootingFromExif = buffer => shootingOf(readExif(buffer));
export const hasShooting = p => SHOT_COLUMNS.some(k => p?.[k] !== null && p?.[k] !== undefined && p?.[k] !== '');

// ---------- affichage ----------

const LOCALE = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' };
const NBSP = '\u00a0';
const formatters = new Map();
const dec = (n, lang) => {
  const l = LOCALE[lang] ? lang : 'fr';
  if (!formatters.has(l)) formatters.set(l, new Intl.NumberFormat(LOCALE[l], { maximumFractionDigits: 1, useGrouping: false }));
  return formatters.get(l).format(n);
};
// Vitesse : « 1/250 s » sous la seconde quand c'en est une fraction (à 3 % près), sinon en secondes (« 0,3 s », « 2 s »).
function speed(s, lang) {
  if (s < 1) {
    const d = 1 / s, n = Math.round(d);
    if (n >= 2 && Math.abs(d - n) / d < 0.03) return `1/${n}${NBSP}s`;
  }
  return `${dec(s, lang)}${NBSP}s`;
}

// La ligne de la visionneuse : « Fujifilm X-T5 · XF23mmF1.4 R LM WR · 23 mm · 1/1000 s · f/11 · ISO 160 », dans l'ordre
// du lexique (boîtier, objectif, focale, vitesse, ouverture, sensibilité) ; '' sans aucune donnée. Les nombres suivent la
// langue de la page (« 18,3 mm », « 18.3 mm ») ; une espace insécable lie chaque valeur à son unité.
export function shotLine(p, lang = 'fr') {
  if (!p) return '';
  const body = [p.shot_make, p.shot_model].filter(Boolean).join(' ');
  return [
    body, p.shot_lens,
    p.shot_focal ? `${dec(p.shot_focal, lang)}${NBSP}mm` : '',
    p.shot_exposure ? speed(p.shot_exposure, lang) : '',
    p.shot_fnumber ? `f/${dec(p.shot_fnumber, lang)}` : '',
    p.shot_iso ? `ISO${NBSP}${p.shot_iso}` : '',
  ].filter(Boolean).join(' · ');
}

// ---------- rattrapage ----------

// Prise de vue des photos importées avant la migration 060 : lue une fois dans l'original, en arrière-plan, puis plus
// jamais (shot_read = 1, même si l'original n'a rien, ou plus rien : fichier absent ou illisible). Seul l'en-tête est lu
// (sharp().metadata()), l'image n'est pas décodée.
export function createShotBackfill({ db, storageDir, log }) {
  const set = db.prepare(`UPDATE photos SET ${SHOT_COLUMNS.map(k => `${k} = @${k}`).join(', ')}, shot_read = 1 WHERE id = @id AND shot_read = 0`);
  let stopped = false, running = null;
  async function batch(size = 20) {
    const rows = db.prepare('SELECT id, file FROM photos WHERE shot_read = 0 ORDER BY id LIMIT ?').all(size);
    for (const r of rows) {
      if (stopped) return 0;
      let shot;
      try { shot = shootingFromExif((await sharp(path.join(storageDir, 'originals', r.file)).metadata()).exif); } catch { shot = { ...EMPTY }; }
      if (stopped) return 0;                     // arrêt pendant la lecture : la base est peut-être déjà fermée
      set.run({ ...shot, id: r.id });
    }
    return rows.length;
  }
  function all() {
    running ??= (async () => {
      let n = 0;
      try { for (let k; !stopped && (k = await batch()); ) n += k; } catch (err) { log?.error({ err }, 'prise de vue des photos'); }
      if (n) log?.info({ photos: n }, 'prise de vue lue dans les originaux');
      running = null;
      return n;
    })();
    return running;
  }
  return { all, batch, stop: () => { stopped = true; return running || Promise.resolve(0); } };
}
