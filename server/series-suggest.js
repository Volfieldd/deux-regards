import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { MAX_PIXELS } from './images.js';

// Série proposée : chaque photo reçoit une empreinte visuelle (512 nombres) calculée sur le serveur par un modèle
// d'images (CLIP ViT-B/32 d'OpenAI, licence MIT, version ONNX allégée de Xenova). Une photo dont la série n'a pas
// encore été choisie est comparée aux photos déjà rangées : la série dont les photos lui ressemblent le plus est
// proposée, jamais appliquée seule. Rien ne sort du serveur ; l'empreinte ne sert qu'à comparer des images entre
// elles (elle ne reconnaît personne) et disparaît avec la photo.
// Désactivé par défaut : le modèle (≈ 90 Mo) n'est téléchargé qu'à l'allumage, dans le dossier de données.
export const MODEL = {
  id: 'clip-vit-b32-q',
  file: 'clip-vit-b32-vision-quantized.onnx',
  url: 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/d15189d7028b43f1d3e65039190477f6af591c2a/onnx/vision_model_quantized.onnx',
  sha256: '583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299',
  bytes: 89117001,
};
const SIZE = 224;
const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];
const DIM = 512;

// Règles de la proposition : chaque série reçoit la moyenne des ressemblances de ses 3 photos les plus proches (une
// grosse série ne l'emporte pas par le nombre) ; seules comptent les séries d'au moins 3 photos rangées.
const TOP = 3;           // photos les plus proches regardées par série
const MIN_SERIES = 3;    // une série n'est proposée qu'à partir de 3 photos rangées et analysées
const BETTER = 0.015;    // la série proposée doit ressembler nettement plus que la série actuelle
const CLOSE = 0.01;      // une deuxième série si elle est presque aussi proche que la première
const K = 10;            // voisins regardés pour l'explication « ressemble à N de ses M photos »

export class ModelError extends Error {}

// Le modèle : téléchargé une fois (empreinte SHA-256 vérifiée), puis chargé par ONNX Runtime.
export function createImageModel({ dir, log, fetchImpl = globalThis.fetch } = {}) {
  const file = path.join(dir, MODEL.file);
  let session = null;
  let progress = null;                           // { got, total } pendant le téléchargement
  const present = () => fs.existsSync(file);
  async function download() {
    fs.mkdirSync(dir, { recursive: true });
    const part = `${file}.part`;
    const res = await fetchImpl(MODEL.url, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new ModelError(`téléchargement refusé (${res.status})`);
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(part);
    progress = { got: 0, total: Number(res.headers.get('content-length')) || MODEL.bytes };
    try {
      for await (const chunk of res.body) {
        hash.update(chunk);
        progress.got += chunk.length;
        if (progress.got > MODEL.bytes * 1.1) throw new ModelError('fichier du modèle trop gros : téléchargement interrompu');
        if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
      }
      await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
      if (hash.digest('hex') !== MODEL.sha256) throw new ModelError('fichier du modèle altéré (empreinte SHA-256 différente)');
      fs.renameSync(part, file);
    } catch (err) {
      out.destroy();
      fs.rmSync(part, { force: true });
      throw err instanceof ModelError ? err : new ModelError(err.message);
    } finally { progress = null; }
    log?.info('séries : modèle téléchargé');
  }
  let loading = null;
  async function ensure() {
    loading ??= (async () => {
      if (!present()) await download();
      const ort = (await import('onnxruntime-node')).default;
      session = { s: await ort.InferenceSession.create(file, { intraOpNumThreads: 1, interOpNumThreads: 1 }), ort };
    })().catch(err => { loading = null; throw err instanceof ModelError ? err : new ModelError(err.message); });
    return loading;
  }
  // Empreinte d'une image : petit côté à 224 px, centre recadré, valeurs normalisées comme à l'entraînement de CLIP.
  async function embed(input) {
    await ensure();
    const { s, ort } = session;
    const { data } = await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate()
      .resize(SIZE, SIZE, { fit: 'cover', kernel: 'cubic' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const plane = SIZE * SIZE, t = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) t[c * plane + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, SIZE, SIZE]) });
    return normalize(out[s.outputNames[0]].data);
  }
  // Éteindre : le modèle est effacé du disque.
  function remove() { session = null; loading = null; fs.rmSync(file, { force: true }); fs.rmSync(`${file}.part`, { force: true }); }
  return { ensure, embed, remove, present, progress: () => progress };
}

export function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, x => x / n);
}
const toBlob = v => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const fromBlob = b => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

// Service : réglage (éteint par défaut), analyse en arrière-plan, propositions.
export function createSeriesSuggest({ db, storageDir, model, log }) {
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'series_suggest'").pluck();
  const setSetting = db.prepare("INSERT INTO settings (key, value) VALUES ('series_suggest', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  // Une photo supprimée pendant son analyse : rien n'est écrit (une erreur de clé étrangère arrêterait l'analyse).
  const saveQ = db.prepare(`INSERT INTO photo_embeddings (photo_id, model, vec, created_at) SELECT @id, @model, @vec, @at WHERE EXISTS (SELECT 1 FROM photos WHERE id = @id)
    ON CONFLICT(photo_id) DO UPDATE SET model = excluded.model, vec = excluded.vec, created_at = excluded.created_at`);
  const save = (id, model, vec, at) => saveQ.run({ id, model, vec, at });
  const enabled = () => setting.get() === 'true';
  let running = null, stopped = false, error = null;
  let cache = null;                              // empreintes en mémoire (Map id → vecteur), complétées à chaque analyse
  const busy = new Set();
  const invalidate = () => { cache = null; };

  async function one(p) {
    busy.add(p.id);
    try {
      const v = await model.embed(path.join(storageDir, 'originals', p.file));
      if (!stopped && enabled()) { save(p.id, MODEL.id, toBlob(v), Date.now()); cache?.set(p.id, v); }
    } catch (err) {
      if (err instanceof ModelError) throw err;
      if (!stopped && enabled()) save(p.id, MODEL.id, null, Date.now());          // image illisible : pas d'empreinte
      log?.warn({ err: err.message, photo: p.id }, 'séries : analyse impossible');
    } finally { busy.delete(p.id); }
  }
  // Photos pas encore analysées (les plus récentes d'abord), une à la fois.
  const pendingQ = () => db.prepare(`SELECT id, file FROM photos WHERE id NOT IN (SELECT photo_id FROM photo_embeddings WHERE model = ?)
    AND id NOT IN (${[...busy, 0].join(',')}) ORDER BY id DESC LIMIT 1`).get(MODEL.id);
  function run() {
    if (running || !enabled()) return running || Promise.resolve(0);
    error = null;
    running = (async () => {
      let n = 0;
      try {
        await model.ensure();
        for (;;) {
          if (stopped || !enabled()) break;
          const p = pendingQ();
          if (!p) break;
          await one(p);
          n++;
        }
      } catch (err) {
        error = err.message;
        log?.error({ err: err.message }, 'séries : modèle indisponible');
      }
      if (n) log?.info({ photos: n }, 'séries : photos analysées');
      running = null;
      return n;
    })();
    return running;
  }
  // À l'import : analysée tout de suite (sans erreur ; modèle indisponible, la photo attend le prochain passage).
  async function examine(id) {
    if (!enabled()) return;
    const p = db.prepare('SELECT id, file FROM photos WHERE id = ?').get(id);
    if (p) await model.ensure().then(() => one(p)).catch(() => {});
  }
  function enable() { setSetting.run('true'); stopped = false; run(); }
  // Éteindre et effacer : réglage, empreintes et modèle.
  async function disable() {
    setSetting.run('false');
    await (running || Promise.resolve());
    db.prepare('DELETE FROM photo_embeddings').run();
    model.remove();
    invalidate();
    error = null;
  }
  // Au démarrage : les analyses impossibles sont retentées une fois.
  const retryFailed = () => db.prepare('DELETE FROM photo_embeddings WHERE vec IS NULL').run().changes;

  function state() {
    const total = db.prepare('SELECT COUNT(*) FROM photos').pluck().get();
    const done = db.prepare('SELECT COUNT(*) FROM photo_embeddings e JOIN photos p ON p.id = e.photo_id WHERE e.model = ?').pluck().get(MODEL.id);
    const dl = model.progress();
    const status = !enabled() ? 'off' : error ? 'error' : dl ? 'downloading' : done < total ? 'analysing' : 'ready';
    return { status, enabled: enabled(), done, total, error, download: dl && { got: dl.got, total: dl.total }, modelBytes: MODEL.bytes };
  }

  // Empreintes gardées en mémoire ; séries et statuts relus à chaque page. Les photos connues sont rangées en une seule
  // matrice (photos × 512), et les comparaisons de chaque photo gardées : quand une photo est rangée ou publiée, seules
  // ses ressemblances avec les brouillons sont calculées ; ouvrir la photothèque ou « Aujourd'hui » ne refait pas des
  // millions de comparaisons (plusieurs secondes de calcul pendant lesquelles tout le site attendait).
  let memo = null;
  function load() {
    cache ??= new Map(db.prepare('SELECT photo_id, vec FROM photo_embeddings WHERE model = ? AND vec IS NOT NULL').all(MODEL.id).map(r => [r.photo_id, fromBlob(r.vec)]));
    const rows = db.prepare('SELECT id, category_id, status, series_checked FROM photos').all().filter(r => cache.has(r.id));
    // Exemples fiables : séries choisies par vous, ou photos publiées.
    const known = rows.filter(r => r.series_checked || r.status === 'published');
    const sizes = new Map();
    for (const k of known) sizes.set(k.category_id, (sizes.get(k.category_id) || 0) + 1);
    const list = known.filter(k => sizes.get(k.category_id) >= MIN_SERIES);
    const sig = list.map(k => `${k.id}:${k.category_id}`).join(',');
    if (memo?.vecs === cache && memo.sig === sig) { memo.ctx.sizes = sizes; return memo.ctx; }
    const n = list.length, M = new Float32Array(n * DIM), ids = new Int32Array(n), cats = list.map(k => k.category_id);
    list.forEach((k, i) => { M.set(cache.get(k.id), i * DIM); ids[i] = k.id; });
    const ctx = { vecs: cache, M, ids, cats, n, sizes, out: new Map() };
    // Photos connues ajoutées ou retirées depuis : les comparaisons gardées sont complétées ; une photo dont une voisine
    // retenue a disparu est recomparée à toutes (à la demande).
    if (memo?.vecs === cache) {
      const before = new Map(memo.list.map(k => [k.id, k.category_id])), after = new Map(list.map(k => [k.id, k.category_id]));
      const added = list.filter(k => before.get(k.id) !== k.category_id);
      const removed = new Set(memo.list.filter(k => after.get(k.id) !== k.category_id).map(k => k.id));
      // Seuls les brouillons encore dans le même état sont repris (une photo rangée, publiée ou changée de série
      // n'a plus besoin des siens).
      const live = new Set(rows.filter(r => !r.series_checked && r.status !== 'published').map(r => `${r.id}:${r.category_id}:1`));
      for (const [key, e] of memo.ctx.out) {
        if (!e.st || !live.has(key)) continue;
        if (e.st.topIds.some(id => removed.has(id)) || [...e.st.by.values()].some(c => c.like.some(id => removed.has(id)))) continue;
        const v = cache.get(e.id);
        for (const k of added) if (k.id !== e.id) consider(e.st, dot(v, cache.get(k.id)), k.id, k.category_id);
        ctx.out.set(key, { id: e.id, st: e.st, res: null });
      }
    }
    memo = { sig, vecs: cache, list, ctx };
    return ctx;
  }
  const dot = (a, b) => { let s = 0; for (let i = 0; i < DIM; i++) s += a[i] * b[i]; return s; };
  // Ajoute (s, id) à une liste triée du plus grand au plus petit, longue de max au plus ; à égalité, le premier venu
  // reste devant (comme un tri stable).
  const insert = (sims, ids, s, id, max, extra = null, x = null) => {
    if (sims.length >= max && !(s > sims[max - 1])) return;
    let j = Math.min(sims.length, max - 1);
    while (j > 0 && sims[j - 1] < s) { sims[j] = sims[j - 1]; ids[j] = ids[j - 1]; if (extra) extra[j] = extra[j - 1]; j--; }
    sims[j] = s; ids[j] = id; if (extra) extra[j] = x;
  };
  // Une ressemblance de plus : pour chaque série, ses TOP photos les plus proches ; et les K plus proches toutes séries
  // confondues.
  const consider = (st, s, id, cat) => {
    let e = st.by.get(cat);
    if (!e) st.by.set(cat, (e = { sims: [], like: [] }));
    insert(e.sims, e.like, s, id, TOP);
    insert(st.topSims, st.topIds, s, id, K, st.topCats, cat);
  };
  // Une photo comparée à toutes les photos connues (une boucle sur la matrice, sans objet ni tri).
  function compare(p, { vecs, M, ids, cats, n }) {
    const v = vecs.get(p.id);
    if (!v) return null;
    const st = { by: new Map(), topSims: [], topIds: [], topCats: [] };
    for (let i = 0; i < n; i++) {
      if (ids[i] === p.id) continue;
      let s = 0;
      for (let k = 0, o = i * DIM; k < DIM; k++) s += v[k] * M[o + k];
      consider(st, s, ids[i], cats[i]);
    }
    return st;
  }
  function propose(p, st, sizes) {
    if (!st?.by.size) return [];
    const ranked = [...st.by].map(([cat, e]) => ({ category_id: cat, like: e.like, size: sizes.get(cat), best: e.sims[0],
      score: e.sims.reduce((a, b) => a + b, 0) / e.sims.length, votes: Math.max(1, st.topCats.filter(c => c === cat).length) }))
      .sort((a, b) => b.score - a.score || b.best - a.best);
    const current = ranked.find(e => e.category_id === p.category_id);
    const [first, second] = ranked;
    if (first === current || (current && first.score - current.score < BETTER)) return [];
    const out = [first];
    if (second && second !== current && first.score - second.score < CLOSE && (!current || second.score - current.score >= BETTER)) out.push(second);
    return out.map(({ score, best, like, ...e }) => ({ ...e, like: [...like] }));
  }

  // Séries proposées pour une photo : [{ category_id, votes, size, like: [ids des photos voisines] }], la plus
  // proche d'abord, deux au plus ; [] quand rien ne ressort nettement. Seulement pour un brouillon dont la série n'a
  // pas été choisie à la main ; jamais la série qu'il a déjà, ni une série qui ne lui ressemble pas plus que la sienne.
  function forPhoto(p, ctx = null) {
    if (!enabled() || !p || p.series_checked || p.status === 'published') return [];
    const c = ctx || load();
    const key = `${p.id}:${p.category_id}:${c.vecs.has(p.id) ? 1 : 0}`;
    let e = c.out.get(key);
    if (!e) c.out.set(key, (e = { id: p.id, st: compare(p, c), res: null }));
    e.res ??= propose(p, e.st, c.sizes);
    return e.res;
  }
  // Pour plusieurs photos d'un coup (photothèque, sortie) : Map id → propositions non vides.
  function forPhotos(photos) {
    const m = new Map();
    if (!enabled()) return m;
    const ctx = load();
    for (const p of photos) { const s = forPhoto(p, ctx); if (s.length) m.set(p.id, s); }
    return m;
  }

  // Au démarrage, en arrière-plan : les brouillons sont comparés par petits paquets (le site reste disponible entre deux),
  // pour que la première ouverture de la photothèque ou d'« Aujourd'hui » ne fasse pas tout le calcul d'un coup.
  async function warm() {
    if (!enabled()) return 0;
    let ctx = load();
    const drafts = db.prepare("SELECT id, category_id, status, series_checked FROM photos WHERE status = 'draft' AND series_checked = 0").all();
    for (let i = 0; i < drafts.length; i++) {
      if (stopped || !enabled()) return i;
      if (memo?.ctx !== ctx) ctx = load();
      forPhoto(drafts[i], ctx);
      if (i % 20 === 19) await new Promise(r => setImmediate(r));
    }
    return drafts.length;
  }

  return { enabled, enable, disable, run, examine, retryFailed, state, forPhoto, forPhotos, invalidate, warm,
    stop: () => { stopped = true; }, idle: () => running || Promise.resolve(0) };
}
