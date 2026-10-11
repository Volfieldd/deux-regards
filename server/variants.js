import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { renderVariants, renderPreview, removeVariants, hasVariants, VARIANT_RE } from './images.js';
import { FONTS, POSITIONS, KINDS, TONE_LABELS } from './watermark.js';

// Version du rendu : à incrémenter si le code de rendu change, pour régénérer toutes les variantes.
const PIPELINE = 2;                // 2 : mentions IPTC (XMP) dans les modes signés

export const EXIF_MODES = {
  none: { label: 'Aucune métadonnée', help: 'Tout est retiré (recommandé). Comportement par défaut.' },
  rights: { label: 'Droits d’auteur', help: 'Auteur, copyright (« © année auteur ») et mentions IPTC : crédit, lien vers la page « Droits d’utilisation ».' },
  shooting: { label: 'Prise de vue', help: 'Droits d’auteur + appareil, objectif, ouverture, vitesse, ISO, focale et date. Jamais la localisation.' },
  all: { label: 'Tout l’EXIF de l’original', help: 'Mentions IPTC + tout l’EXIF, y compris la localisation GPS et le numéro de série éventuel. À éviter.' },
};
export const MIN_WIDTHS = { 0: 'Toutes les tailles', 1280: '1280 px et plus (vignettes épargnées)', 2000: '2000 px seulement' };

export const WATERMARK_DEFAULTS = {
  enabled: false, kind: 'text', text: '© {auteur}', font: 'serif', tone: 'light', position: 'bas-droite',
  opacity: 60, size: 22, margin: 3, minWidth: 0, image: null,
};
export const EXIF_DEFAULTS = { mode: 'none' };

const int = (v, min, max, dflt) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : dflt;
};
const oneOf = (v, allowed, dflt) => (Object.hasOwn(allowed, v) ? v : dflt);

// Réglages du formulaire → réglages bornés et valides (aucune valeur libre ne passe telle quelle).
export function normalizeWatermark(body, current = WATERMARK_DEFAULTS) {
  const d = WATERMARK_DEFAULTS;
  return {
    enabled: body.wm_enabled === 'on' || body.wm_enabled === true,
    kind: oneOf(body.wm_kind, KINDS, d.kind),
    text: typeof body.wm_text === 'string' ? body.wm_text.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 80) : d.text,
    font: oneOf(body.wm_font, FONTS, d.font),
    tone: oneOf(body.wm_tone, TONE_LABELS, d.tone),
    position: oneOf(body.wm_position, POSITIONS, d.position),
    opacity: int(body.wm_opacity, 5, 100, d.opacity),
    size: int(body.wm_size, 3, 100, d.size),
    margin: int(body.wm_margin, 0, 20, d.margin),
    minWidth: Number(oneOf(String(body.wm_min_width), MIN_WIDTHS, String(d.minWidth))),
    image: current.image ?? null,
  };
}
export const normalizeExif = body => ({ mode: oneOf(body.exif_mode, EXIF_MODES, 'none') });

const yearOf = p => (/^\d{4}/.exec(p.taken_on || '') || /^\d{4}/.exec(p.created_at || '') || [String(new Date().getFullYear())])[0];

// « © {auteur} {annee} » → « © Julien 2024 »
export function fillText(template, p, siteName) {
  const values = { auteur: p.author, annee: yearOf(p), site: siteName, titre: p.title };
  // Une seule ligne : sauts de ligne et caractères de contrôle des valeurs remplacés par une espace.
  return template.replace(/\{(auteur|annee|site|titre)\}/g, (_, k) => String(values[k] ?? '').replace(/[\x00-\x1f\x7f]+/g, ' '));
}

// Réglages effectifs d'une photo (filigrane et métadonnées) et empreinte qui nomme ses variantes.
// Empreinte vide quand rien n'est ajouté : les variantes brutes gardent leur nom d'origine.
export function specFor(p, { watermark, exif, siteName, watermarkDir, rightsUrl, brand = {}, brandDir = null }) {
  let mark = null;
  if (watermark.enabled && p.watermark !== 0) {
    if (watermark.kind === 'image' && watermark.image) {
      mark = { kind: 'image', image: watermark.image, imagePath: path.join(watermarkDir, watermark.image) };
    } else if ((watermark.kind === 'emblem' || watermark.kind === 'logotype') && brand[watermark.kind] && brandDir) {
      // Le nom du fichier entre dans l'empreinte : un nouveau dessin dans Apparence recalcule les images.
      mark = { kind: watermark.kind, image: brand[watermark.kind], tone: watermark.tone, imagePath: path.join(brandDir, brand[watermark.kind]) };
    } else if (watermark.kind === 'text') {
      const text = fillText(watermark.text, p, siteName).trim();
      if (text) mark = { kind: 'text', text, font: watermark.font, tone: watermark.tone };
    }
    if (mark) Object.assign(mark, { position: watermark.position, opacity: watermark.opacity, size: watermark.size, margin: watermark.margin, minWidth: watermark.minWidth });
  }
  const meta = exif.mode === 'none' ? null
    : { mode: exif.mode, artist: p.author, copyright: `© ${yearOf(p)} ${p.author}`, credit: siteName, webStatement: rightsUrl || null };
  if (!mark && !meta) return { key: '', mark: null, meta: null };
  const { imagePath, ...hashed } = mark || {};
  const key = crypto.createHash('sha256').update(JSON.stringify({ v: PIPELINE, mark: mark && hashed, meta })).digest('hex').slice(0, 8);
  return { key, mark, meta };
}

// Service de rendu : une seule tâche à la fois (file d'attente), passage complet en arrière-plan
// après chaque changement de réglage, rendu immédiat d'une photo à l'import.
export function createVariantService({ db, storageDir, siteName, log, publicUrl = null }) {
  const watermarkDir = path.join(storageDir, 'watermarks');
  const variantsDir = path.join(storageDir, 'variants');
  fs.mkdirSync(watermarkDir, { recursive: true });
  const SELECT = `SELECT p.id, p.file, p.width, p.height, p.title, p.taken_on, p.created_at, p.watermark, p.variant_key, a.name AS author
    FROM photos p JOIN authors a ON a.id = p.author_id`;
  const q = {
    ids: db.prepare('SELECT id FROM photos ORDER BY position, id').pluck(),
    photo: db.prepare(`${SELECT} WHERE p.id = ?`),
    files: db.prepare('SELECT file FROM photos').pluck(),
    setKey: db.prepare('UPDATE photos SET variant_key = ? WHERE id = ?'),
    setting: db.prepare('SELECT value FROM settings WHERE key = ?').pluck(),
  };
  const read = (key, defaults) => {
    const raw = q.setting.get(key);
    return { ...defaults, ...(raw ? JSON.parse(raw) : {}) };
  };
  const rightsUrl = publicUrl ? `${publicUrl}/droits` : null;
  const brandDir = path.join(storageDir, 'brand');
  const context = () => ({ watermark: read('watermark', WATERMARK_DEFAULTS), exif: read('exif', EXIF_DEFAULTS), siteName: siteName(), watermarkDir, rightsUrl, brand: read('brand', {}), brandDir });

  // File des passages complets : elle ne rejette jamais (une erreur est journalisée, pas propagée).
  let queue = Promise.resolve();
  let passQueued = false;
  let forceQueued = false;
  let stopping = false;
  let swept = false;
  const state = { running: false, total: 0, done: 0, errors: [] };
  const enqueue = job => (queue = queue.then(job).catch(err => log?.error({ err }, 'passage des variantes interrompu')));

  // Verrou par photo : un import et un passage ne rendent jamais la même photo en même temps.
  const locks = new Map();
  function withLock(id, fn) {
    const run = (locks.get(id) || Promise.resolve()).then(fn);
    const tail = run.catch(() => {});
    locks.set(id, tail);
    tail.then(() => { if (locks.get(id) === tail) locks.delete(id); });
    return run;
  }

  // Rend une photo si son empreinte a changé ou si des fichiers manquent ; bascule puis nettoie.
  // La ligne est relue sous verrou : réglages, auteur ou suppression faits entre-temps sont pris en compte.
  async function render(id, ctx, { force = false, onStep = null } = {}) {
    const p = q.photo.get(id);
    if (!p) return false;
    const { key, mark, meta } = specFor(p, ctx);
    if (!force && key === p.variant_key && hasVariants(storageDir, p, key)) return false;
    try {
      await renderVariants(storageDir, p.file, { key, mark, meta, force, onStep });
    } catch (err) {
      // Photo supprimée pendant le rendu : on efface ce qui a déjà été écrit.
      if (!q.photo.get(id)) { removeVariants(storageDir, p.file); return false; }
      throw err;
    }
    if (!q.photo.get(id)) { removeVariants(storageDir, p.file); return false; }
    q.setKey.run(key, p.id);                      // les pages pointent désormais vers les nouvelles variantes
    removeVariants(storageDir, p.file, { keep: key });
    return true;
  }

  // Ménage : fichiers temporaires d'un rendu interrompu, variantes sans photo, logos remplacés.
  // Les .tmp ne sont effacés qu'au premier passage (démarrage) : ensuite, un import peut être en train d'écrire.
  function sweep({ tmp = false, logos = false } = {}) {
    const stems = new Set(q.files.all().map(f => path.parse(f).name));
    if (fs.existsSync(variantsDir)) {
      for (const f of fs.readdirSync(variantsDir)) {
        const m = VARIANT_RE.exec(f);
        if ((tmp && f.endsWith('.tmp')) || (m && !stems.has(m[1]))) fs.rmSync(path.join(variantsDir, f), { force: true });
      }
    }
    if (logos) {
      const current = read('watermark', WATERMARK_DEFAULTS).image;
      // Un logo en cours d'envoi (« .part ») n'est pas effacé, sauf s'il traîne depuis plus d'une heure.
      const stale = Date.now() - 60 * 60 * 1000;
      for (const f of fs.readdirSync(watermarkDir)) {
        const file = path.join(watermarkDir, f);
        if (f === current || (f.endsWith('.part') && fs.statSync(file).mtimeMs > stale)) continue;
        fs.rmSync(file, { force: true });
      }
    }
  }

  return {
    context,
    watermarkDir,
    status: () => ({ ...state, errors: [...state.errors] }),

    // Rendu immédiat d'une photo (import), hors de la file : il n'attend pas un passage en cours.
    // L'erreur remonte à l'appelant.
    renderPhoto(id, { onStep = null } = {}) {
      return withLock(id, () => render(id, context(), { onStep }));
    },

    // Passage complet en arrière-plan ; plusieurs demandes rapprochées n'en font qu'un.
    schedule({ force = false } = {}) {
      forceQueued ||= force;
      if (passQueued || stopping) return queue;
      passQueued = true;
      return enqueue(async () => {
        passQueued = false;
        const forced = forceQueued;
        forceQueued = false;
        if (!swept) { sweep({ tmp: true }); swept = true; }
        const ids = q.ids.all();
        Object.assign(state, { running: true, total: ids.length, done: 0, errors: [] });
        let changed = 0;
        try {
          for (const id of ids) {
            if (stopping) break;
            try {
              // Contexte relu à chaque photo : un réglage changé en cours de passage s'applique aux suivantes
              // (et un nouveau passage, déjà demandé, reprend les précédentes).
              if (await withLock(id, () => render(id, context(), { force: forced }))) changed++;
            } catch (err) {
              state.errors.push({ id, title: q.photo.get(id)?.title ?? `#${id}`, error: err.message });
              log?.error({ err, photo: id }, 'rendu des variantes impossible');
            }
            state.done++;
          }
          if (!stopping) sweep({ logos: true });
        } finally {
          state.running = false;
        }
        if (changed) log?.info({ changed }, 'variantes régénérées');
      });
    },

    // Aperçu 1280 px d'une photo avec des réglages donnés (enregistrés ou non).
    async preview(id, override = {}) {
      const p = q.photo.get(id);
      if (!p) return null;
      const { mark } = specFor(p, { ...context(), ...override });
      return renderPreview(storageDir, p.file, 1280, { mark });
    },

    // Arrêt : le passage s'interrompt entre deux photos (un fichier n'est jamais laissé à moitié écrit).
    stop() { stopping = true; return Promise.all([queue, ...locks.values()]); },
    idle: () => Promise.all([queue, ...locks.values()]),
  };
}
