import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { renderVariants, renderPreview, removeVariants, hasVariants, VARIANT_RE } from './images.js';
import { FONTS, POSITIONS, KINDS, TONE_LABELS } from './watermark.js';
import { IMPORT_CONCURRENCY } from './imports.js';
import { shownTime } from './format.js';

// Version du rendu : à incrémenter si le code de rendu change, pour régénérer toutes les variantes.
const PIPELINE = 2;                // 2 : mentions IPTC (XMP) dans les modes signés

export const EXIF_MODES = {
  none: { label: 'Aucune métadonnée', help: 'Tout est retiré (recommandé). Comportement par défaut.' },
  rights: { label: 'Droits d’auteur', help: 'Auteur, copyright (« © année auteur ») et mentions IPTC : crédit, lien vers la page « Droits d’utilisation ».' },
  shooting: { label: 'Prise de vue', help: 'Droits d’auteur + appareil, objectif, ouverture, vitesse, ISO, focale pour une photo qui montre sa prise de vue sur le site ; la date et l’heure seulement pour une photo qui montre son heure. Jamais la localisation.' },
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

// Année de la photo : celle de la prise de vue, sinon celle de l'import, en heure de Paris (created_at est en UTC :
// une photo importée le 1er janvier à 0 h 30 est bien de la nouvelle année).
const parisYear = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric' }).format(d);
function yearOf(p) {
  const taken = /^\d{4}/.exec(p.taken_on || '');
  if (taken) return taken[0];
  const created = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(p.created_at || '');
  if (created) return parisYear(new Date(`${created[1]}T${created[2]}Z`));
  return /^\d{4}/.exec(p.created_at || '')?.[0] || parisYear(new Date());
}

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
  // Mode « prise de vue » : la date et l'heure de l'appareil (DateTimeOriginal) ne partent qu'avec une photo qui montre
  // son heure sur le site (case de la fiche, date au jour) ; time entre dans l'empreinte, les images suivent la case.
  // De même le boîtier, l'objectif et l'exposition : seulement pour une photo qui montre sa prise de vue (show_shot,
  // cochée par défaut). shot: 0 n'entre dans l'empreinte que décochée : les images des autres photos gardent leur nom.
  const meta = exif.mode === 'none' ? null
    : { mode: exif.mode, artist: p.author, copyright: `© ${yearOf(p)} ${p.author}`, credit: siteName, webStatement: rightsUrl || null,
      ...(exif.mode === 'shooting' ? { time: shownTime(p) ? 1 : 0, ...(Number(p.show_shot ?? 1) === 0 ? { shot: 0 } : {}) } : {}) };
  if (!mark && !meta) return { key: '', mark: null, meta: null };
  const { imagePath, ...hashed } = mark || {};
  const key = crypto.createHash('sha256').update(JSON.stringify({ v: PIPELINE, mark: mark && hashed, meta })).digest('hex').slice(0, 8);
  return { key, mark, meta };
}

// Service de rendu : passages complets en arrière-plan, un seul à la fois (file d'attente), après chaque changement
// de réglage ; rendu immédiat d'une photo à l'import, hors file, IMPORT_CONCURRENCY à la fois. Un verrou par photo
// empêche deux rendus simultanés de la même image.
export function createVariantService({ db, storageDir, siteName, log, publicUrl = null }) {
  const watermarkDir = path.join(storageDir, 'watermarks');
  const variantsDir = path.join(storageDir, 'variants');
  fs.mkdirSync(watermarkDir, { recursive: true });
  const SELECT = `SELECT p.id, p.file, p.width, p.height, p.title, p.taken_on, p.taken_time, p.show_time, p.show_shot, p.created_at, p.watermark, p.variant_key, a.name AS author
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

  // Rendus d'import (hors file), toutes routes confondues : IMPORT_CONCURRENCY à la fois au plus. Des imports
  // classiques lancés en parallèle ne multiplient pas la mémoire et les threads occupés.
  let slots = 0;
  const slotWaiters = [];
  async function withSlot(fn) {
    while (slots >= IMPORT_CONCURRENCY) await new Promise(resolve => slotWaiters.push(resolve));
    slots++;
    try {
      return await fn();
    } finally {
      slots--;
      slotWaiters.shift()?.();
    }
  }

  // Rend une photo si son empreinte a changé ou si des fichiers manquent ; bascule puis nettoie.
  // La ligne est relue sous verrou : réglages, auteur ou suppression faits entre-temps sont pris en compte.
  async function render(id, ctx, { force = false, onStep = null } = {}) {
    const p = q.photo.get(id);
    if (!p) return false;
    const { key, mark, meta } = specFor(p, ctx);
    if (!force && key === p.variant_key && hasVariants(storageDir, p, key)) return false;
    // Photo supprimée pendant le rendu (son identifiant a même pu être repris par une nouvelle photo, d'où la
    // comparaison du fichier) : on efface ce qui a déjà été écrit.
    const gone = () => q.photo.get(id)?.file !== p.file;
    try {
      await renderVariants(storageDir, p.file, { key, mark, meta, force, onStep });
    } catch (err) {
      if (gone()) { removeVariants(storageDir, p.file); return false; }
      throw err;
    }
    if (gone()) { removeVariants(storageDir, p.file); return false; }
    q.setKey.run(key, p.id);                      // les pages pointent désormais vers les nouvelles variantes
    removeVariants(storageDir, p.file, { keep: key });
    return true;
  }

  // Ménage : fichiers temporaires d'un rendu interrompu, variantes sans photo, logos remplacés.
  // Un fichier temporaire (« .tmp ») ou un logo en cours d'envoi (« .part ») n'est effacé que s'il traîne depuis plus
  // d'une heure : un rendu peut être en train de l'écrire, dans ce processus ou dans un autre (npm run variants).
  function sweep({ logos = false } = {}) {
    const stems = new Set(q.files.all().map(f => path.parse(f).name));
    const stale = Date.now() - 60 * 60 * 1000;
    const old = file => { try { return fs.statSync(file).mtimeMs <= stale; } catch { return false; } };
    if (fs.existsSync(variantsDir)) {
      for (const f of fs.readdirSync(variantsDir)) {
        const m = VARIANT_RE.exec(f);
        const file = path.join(variantsDir, f);
        if ((f.endsWith('.tmp') && old(file)) || (m && !stems.has(m[1]))) fs.rmSync(file, { force: true });
      }
    }
    if (logos) {
      const current = read('watermark', WATERMARK_DEFAULTS).image;
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
    // Réglages effectifs d'une photo (filigrane, métadonnées) et leur empreinte : les téléchargements des galeries privées
    // portent le même filigrane que les variantes, et leur rendu gardé est nommé d'après cette empreinte.
    specOf(id) { const p = q.photo.get(id); return p ? specFor(p, context()) : null; },
    status: () => ({ ...state, errors: [...state.errors] }),

    // Rendu immédiat d'une photo (import), hors de la file : il n'attend pas un passage en cours.
    // L'erreur remonte à l'appelant.
    renderPhoto(id, { onStep = null } = {}) {
      // Le verrou est pris d'abord : stop() et idle() attendent aussi un rendu qui attend sa place.
      return withLock(id, () => withSlot(() => render(id, context(), { onStep })));
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
        sweep();
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
              // Message fixe et traduisible : celui de libvips (anglais, chemin absolu de l'original) va au journal.
              const p = q.photo.get(id);
              const missing = p && !fs.existsSync(path.join(storageDir, 'originals', p.file));
              state.errors.push({ id, title: p?.title ?? `#${id}`, error: missing ? 'original introuvable' : 'image illisible ou format non pris en charge par le serveur' });
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
