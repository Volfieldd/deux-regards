import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { renderVariants, renderPreview, removeVariants, hasVariants } from './images.js';
import { FONTS, POSITIONS } from './watermark.js';

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
    kind: body.wm_kind === 'image' ? 'image' : 'text',
    text: typeof body.wm_text === 'string' ? body.wm_text.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 80) : d.text,
    font: oneOf(body.wm_font, FONTS, d.font),
    tone: body.wm_tone === 'dark' ? 'dark' : 'light',
    position: oneOf(body.wm_position, POSITIONS, d.position),
    opacity: int(body.wm_opacity, 5, 100, d.opacity),
    size: int(body.wm_size, 3, 60, d.size),
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
  return template.replace(/\{(auteur|annee|site|titre)\}/g, (_, k) => values[k] ?? '');
}

// Réglages effectifs d'une photo (filigrane et métadonnées) et empreinte qui nomme ses variantes.
// Empreinte vide quand rien n'est ajouté : les variantes brutes gardent leur nom d'origine.
export function specFor(p, { watermark, exif, siteName, watermarkDir, rightsUrl }) {
  let mark = null;
  if (watermark.enabled && p.watermark !== 0) {
    if (watermark.kind === 'image' && watermark.image) {
      mark = { kind: 'image', image: watermark.image, imagePath: path.join(watermarkDir, watermark.image) };
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
  fs.mkdirSync(watermarkDir, { recursive: true });
  const q = {
    photos: db.prepare(`SELECT p.id, p.file, p.width, p.height, p.title, p.taken_on, p.created_at, p.watermark, p.variant_key, a.name AS author
      FROM photos p JOIN authors a ON a.id = p.author_id ORDER BY p.position, p.id`),
    photo: db.prepare(`SELECT p.id, p.file, p.width, p.height, p.title, p.taken_on, p.created_at, p.watermark, p.variant_key, a.name AS author
      FROM photos p JOIN authors a ON a.id = p.author_id WHERE p.id = ?`),
    setKey: db.prepare('UPDATE photos SET variant_key = ? WHERE id = ?'),
    setting: db.prepare('SELECT value FROM settings WHERE key = ?').pluck(),
  };
  const read = (key, defaults) => {
    const raw = q.setting.get(key);
    return { ...defaults, ...(raw ? JSON.parse(raw) : {}) };
  };
  const rightsUrl = publicUrl ? `${publicUrl}/droits` : null;
  const context = () => ({ watermark: read('watermark', WATERMARK_DEFAULTS), exif: read('exif', EXIF_DEFAULTS), siteName: siteName(), watermarkDir, rightsUrl });

  let queue = Promise.resolve();
  let passQueued = false;
  const state = { running: false, total: 0, done: 0, errors: [] };
  const enqueue = job => (queue = queue.then(job, job));

  // Rend une photo si son empreinte a changé ou si des fichiers manquent ; bascule puis nettoie.
  async function render(p, ctx, { force = false } = {}) {
    const { key, mark, meta } = specFor(p, ctx);
    if (!force && key === p.variant_key && hasVariants(storageDir, p, key)) return false;
    await renderVariants(storageDir, p.file, { key, mark, meta, force });
    q.setKey.run(key, p.id);                      // les pages pointent désormais vers les nouvelles variantes
    removeVariants(storageDir, p.file, { keep: key });
    return true;
  }

  return {
    context,
    watermarkDir,
    status: () => ({ ...state, errors: [...state.errors] }),

    // Rendu immédiat d'une photo (import) ; l'erreur remonte à l'appelant.
    renderPhoto(id) {
      return enqueue(async () => {
        const p = q.photo.get(id);
        if (p) await render(p, context());
      });
    },

    // Passage complet en arrière-plan ; plusieurs demandes rapprochées n'en font qu'un.
    schedule({ force = false } = {}) {
      if (passQueued && !force) return queue;
      passQueued = true;
      return enqueue(async () => {
        passQueued = false;
        const ctx = context();
        const photos = q.photos.all();
        Object.assign(state, { running: true, total: photos.length, done: 0, errors: [] });
        let changed = 0;
        for (const p of photos) {
          try {
            if (await render(p, ctx, { force })) changed++;
          } catch (err) {
            state.errors.push({ id: p.id, title: p.title, error: err.message });
            log?.error({ err, photo: p.id }, 'rendu des variantes impossible');
          }
          state.done++;
        }
        state.running = false;
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

    idle: () => queue,
  };
}
