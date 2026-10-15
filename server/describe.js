import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { MAX_PIXELS } from './images.js';

// Descriptions suggérées (R&D du 15 octobre 2026 : le plus fiable sur ce qu'il voit, et il ne nomme jamais personne).
// Florence-2 (Microsoft, licence MIT, version ONNX d'onnx-community), sur ce serveur : aucune image n'en sort.
// Désactivé par défaut. Une phrase courte et factuelle, en anglais (sortie du modèle), traduite par LibreTranslate
// si le site en a un. Les photos sans description sont décrites la nuit (heures réglables), sur un seul cœur pour ne
// pas gêner le reste du serveur ; une photo demandée depuis sa fiche passe tout de suite. Le modèle n'est chargé que
// pendant le calcul. Jamais recopiée seule dans la légende : la fiche la propose, l'auteur choisit.
export const MODELS = {
  base: { id: 'onnx-community/Florence-2-base-ft', revision: 'e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f', mb: 270, ram: 2 },
  large: { id: 'onnx-community/Florence-2-large-ft', revision: '04ace74913c28d7ec94af32cee5c111a10126b6f', mb: 850, ram: 4 },
};
export const DEFAULTS = { on: false, model: 'large', from: 1, to: 6 };
const TASK = '<CAPTION>';
const IDLE_MS = 2 * 60 * 1000;

// Le modèle réel (transformers.js, onnxruntime-node du site). Les tests le remplacent par un faux.
export function createFlorence({ dir, threads = 1, log }) {
  let loaded = null, timer = null;
  const unload = async () => { clearTimeout(timer); const l = loaded; loaded = null; if (l) await (await l).model.dispose?.(); };
  async function load(key) {
    if (loaded && (await loaded).key === key) return loaded;
    await unload();
    loaded = (async () => {
      const { Florence2ForConditionalGeneration, AutoProcessor, AutoTokenizer, env } = await import('@huggingface/transformers');
      env.cacheDir = dir;
      const m = MODELS[key];
      const opts = { revision: m.revision };
      const model = await Florence2ForConditionalGeneration.from_pretrained(m.id, { ...opts, dtype: 'q8', session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 } });
      const processor = await AutoProcessor.from_pretrained(m.id, opts);
      const tokenizer = await AutoTokenizer.from_pretrained(m.id, opts);
      log?.info({ model: m.id }, 'descriptions : modèle chargé');
      return { key, model, processor, tokenizer };
    })();
    loaded.catch(() => { loaded = null; });
    return loaded;
  }
  return {
    // Une phrase en anglais pour l'image (fichier ou tampon JPEG).
    async describe(input, key) {
      clearTimeout(timer);
      const { model, processor, tokenizer } = await load(key);
      const { RawImage } = await import('@huggingface/transformers');
      // Image réduite d'abord (le modèle travaille en 768 px) : un original de 24 Mpx ne charge pas la mémoire.
      const jpeg = await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
      const image = await RawImage.fromBlob(new Blob([jpeg], { type: 'image/jpeg' }));
      const ids = await model.generate({ ...tokenizer(processor.construct_prompts(TASK)), ...(await processor(image)), max_new_tokens: 60, num_beams: 1 });
      const out = processor.post_process_generation(tokenizer.batch_decode(ids, { skip_special_tokens: false })[0], TASK, image.size);
      timer = setTimeout(unload, IDLE_MS);
      timer.unref?.();
      return String(out[TASK] || '').trim();
    },
    unload,
    // Éteindre et effacer : le modèle est retiré du disque.
    async remove() { await unload(); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

export function createDescriber({ db, storageDir, model, translator, log, now = () => Date.now() }) {
  const q = {
    setting: db.prepare("SELECT value FROM settings WHERE key = 'describe'").pluck(),
    save: db.prepare("INSERT INTO settings (key, value) VALUES ('describe', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
    get: db.prepare('SELECT * FROM photo_descriptions WHERE photo_id = ?'),
    request: db.prepare(`INSERT INTO photo_descriptions (photo_id, requested_at) VALUES (?, ?)
      ON CONFLICT(photo_id) DO UPDATE SET requested_at = excluded.requested_at, error = NULL`),
    store: db.prepare(`INSERT INTO photo_descriptions (photo_id, model, text_en, text_fr, text_de, requested_at, created_at, error) VALUES (@id, @model, @en, @fr, @de, NULL, @at, NULL)
      ON CONFLICT(photo_id) DO UPDATE SET model = @model, text_en = @en, text_fr = @fr, text_de = @de, requested_at = NULL, created_at = @at, error = NULL`),
    fail: db.prepare('INSERT INTO photo_descriptions (photo_id, requested_at, error) VALUES (?, NULL, ?) ON CONFLICT(photo_id) DO UPDATE SET requested_at = NULL, error = excluded.error'),
    // Demandées d'abord (la plus ancienne demande), puis, la nuit, celles qui n'ont jamais été décrites.
    requested: db.prepare('SELECT d.photo_id AS id, p.file FROM photo_descriptions d JOIN photos p ON p.id = d.photo_id WHERE d.requested_at IS NOT NULL ORDER BY d.requested_at LIMIT 1'),
    fresh: db.prepare('SELECT p.id, p.file FROM photos p LEFT JOIN photo_descriptions d ON d.photo_id = p.id WHERE d.photo_id IS NULL ORDER BY p.id LIMIT 1'),
    counts: db.prepare('SELECT (SELECT COUNT(*) FROM photos) AS total, (SELECT COUNT(*) FROM photo_descriptions WHERE text_en IS NOT NULL) AS done, (SELECT COUNT(*) FROM photo_descriptions WHERE requested_at IS NOT NULL) AS asked'),
  };
  const settings = () => { try { return { ...DEFAULTS, ...JSON.parse(q.setting.get() || '{}') }; } catch { return { ...DEFAULTS }; } };
  const hour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now()).find(p => p.type === 'hour').value);
  // Heures de nuit [from, to[ (heure de Paris), à cheval sur minuit si from > to.
  const night = (s = settings()) => { const h = hour(); return s.from <= s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to; };
  let running = null, lastError = null;

  async function one(row, s) {
    try {
      const en = await model.describe(path.join(storageDir, 'originals', row.file), s.model);
      const tr = async l => { if (!translator?.enabled || !en) return ''; try { return await translator.translate(en, 'en', l); } catch (err) { log?.warn({ err: err.message }, 'descriptions : traduction impossible'); return ''; } };
      q.store.run({ id: row.id, model: MODELS[s.model].id, en, fr: await tr('fr'), de: await tr('de'), at: now() });
      lastError = null;
    } catch (err) {
      lastError = err.message;
      q.fail.run(row.id, String(err.message).slice(0, 300));
      log?.warn({ err: err.message, photo: row.id }, 'descriptions : photo non décrite');
    }
  }
  // Une passe : les demandes, puis (la nuit seulement) les photos jamais décrites, une à la fois.
  function run() {
    const s = settings();
    if (running || !s.on) return running || Promise.resolve(0);
    running = (async () => {
      let n = 0;
      for (let row; settings().on && (row = q.requested.get() || (night() ? q.fresh.get() : null)); n++) await one(row, settings());
      return n;
    })().catch(err => { log?.error({ err }, 'descriptions'); return 0; }).finally(() => { running = null; });
    return running;
  }
  return {
    MODELS, settings, night,
    save(body) {
      const s = settings();
      const h = v => Math.min(23, Math.max(0, Number.parseInt(v, 10) || 0));
      const next = { on: Boolean(body.on), model: Object.hasOwn(MODELS, body.model) ? body.model : s.model, from: 'from' in body ? h(body.from) : s.from, to: 'to' in body ? h(body.to) : s.to };
      q.save.run(JSON.stringify(next));
      if (!next.on) model.unload?.();
      return next;
    },
    // Demander la description d'une photo (fiche) : elle passe avant la file de nuit, tout de suite.
    request(photoId) { q.request.run(photoId, now()); return run(); },
    forPhoto(photoId, lang = 'fr') {
      const r = q.get.get(photoId);
      if (!r) return null;
      const text = (lang === 'fr' && r.text_fr) || (lang === 'de' && r.text_de) || r.text_en || '';
      return { text, en: r.text_en, translated: text !== r.text_en, pending: r.requested_at != null, error: r.error, at: r.created_at };
    },
    state() { const c = q.counts.get(); return { ...settings(), ...c, busy: Boolean(running), error: lastError, night: night() }; },
    run,
    idle: () => running || Promise.resolve(0),
    async remove() { q.save.run(JSON.stringify({ ...settings(), on: false })); await model.remove?.(); },
  };
}
