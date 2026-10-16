import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MAX_PIXELS } from './images.js';

// Détection des visages (pas de reconnaissance) : dit seulement « il y a un visage, ici, de cette taille ».
// Sert à savoir s'il y a un accord à aller chercher : une photo sans visage n'a besoin de l'accord de personne.
// Modèle YuNet (OpenCV Zoo, licence MIT, assets/models/), exécuté sur le serveur par ONNX Runtime : aucune image ne
// sort. Ne garde que le nombre de visages et leurs cadres (fractions de l'image) ; aucune empreinte de visage, rien
// qui permette de reconnaître quelqu'un.
const SIZE = 640;
const STRIDES = [8, 16, 32];
const SCORE = 0.75;           // seuil de confiance
const NMS = 0.3;              // recouvrement au-delà duquel deux cadres sont le même visage
const INSIDE = 0.6;           // part du plus petit cadre couverte par l'autre : le même visage, coupé au bord d'une tuile
// Un visage plus petit que 1,5 % de la hauteur de l'image est ignoré (silhouette lointaine, foule) : personne n'y
// est reconnaissable.
export const MIN_FACE = 0.015;
// Le modèle ne voit pas un visage de moins de 12 à 16 px dans son entrée de 640 × 640 (40 px de trois quarts) : sur
// l'image entière réduite à 640 px, un visage de 3 ou 4 % de la hauteur d'un original de 24 Mpx lui échappe. D'où une
// seconde passe : l'image réduite à DETAIL px de petit côté (jamais agrandie), découpée en tuiles de 640 × 640 qui se
// recouvrent ; un visage de face y est vu dès 1 % du petit côté, de trois quarts dès 2,5 % environ. Au plus
// DETAIL_PX pixels (un panorama est moins détaillé) : 15 à 20 tuiles au plus, de 0,5 à 1 s de calcul par photo.
const DETAIL = 1600;
const DETAIL_PX = 4e6;
// Le cadre que le modèle trace autour d'un petit visage est un peu plus petit que lui (de 10 à 15 %) : tolérance.
const SMALL_BOX = 0.8;

const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const iou = (a, b) => { const i = inter(a, b); return i / (a.w * a.h + b.w * b.h - i || 1); };
// Le même visage : cadres qui se recouvrent, ou l'un presque entièrement dans l'autre (visage coupé par une tuile).
const same = (a, b) => iou(a, b) >= NMS || inter(a, b) / (Math.min(a.w * a.h, b.w * b.h) || 1) >= INSIDE;

// Sorties brutes du modèle → cadres { x, y, w, h, score } en pixels de l'entrée 640 × 640 (décodage de YuNet :
// score = √(classe × présence), centre = (colonne + dx) × pas, taille = e^dw × pas).
export function decode(outputs, { score = SCORE } = {}) {
  const boxes = [];
  for (const s of STRIDES) {
    const cols = SIZE / s, cells = cols * cols;
    const cls = outputs[`cls_${s}`].data, obj = outputs[`obj_${s}`].data, bbox = outputs[`bbox_${s}`].data;
    for (let i = 0; i < cells; i++) {
      const c = Math.min(Math.max(cls[i], 0), 1), o = Math.min(Math.max(obj[i], 0), 1);
      const sc = Math.sqrt(c * o);
      if (sc < score) continue;
      const col = i % cols, row = Math.floor(i / cols);
      const cx = (col + bbox[i * 4]) * s, cy = (row + bbox[i * 4 + 1]) * s;
      const w = Math.exp(bbox[i * 4 + 2]) * s, h = Math.exp(bbox[i * 4 + 3]) * s;
      boxes.push({ x: cx - w / 2, y: cy - h / 2, w, h, score: sc });
    }
  }
  boxes.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const b of boxes) if (kept.every(k => iou(k, b) < NMS)) kept.push(b);
  return kept;
}

// Le modèle ne se charge pas (binaire absent, fichier illisible) : rien n'est écrit, la photo reste « à examiner ».
export class ModelError extends Error {}

export function createFaceDetector({ modelPath = fileURLToPath(new URL('../assets/models/face_detection_yunet_2023mar.onnx', import.meta.url)), log } = {}) {
  let session = null;
  const load = () => {
    session ??= (async () => {
      const ort = (await import('onnxruntime-node')).default;
      return { s: await ort.InferenceSession.create(modelPath, { intraOpNumThreads: 1, interOpNumThreads: 1 }), ort };
    })().catch(err => {
      session = null;                            // nouvel essai au prochain appel
      log?.error({ err }, 'visages : modèle illisible');
      throw new ModelError(err.message);
    });
    return session;
  };

  // Une entrée du modèle : la fenêtre de 640 × 640 en (x0, y0) d'une image RGB brute (rw × rh), fond noir au-delà ;
  // planes B, G, R (ordre d'OpenCV), valeurs 0-255. Cadres en fractions de cette image. Une tuile écarte les cadres
  // coupés par l'un de ses bords intérieurs : le visage entier est dans la tuile voisine, ou assez grand pour la passe 1.
  async function scan({ s, ort }, data, rw, rh, x0 = 0, y0 = 0) {
    const plane = SIZE * SIZE, t = new Float32Array(3 * plane);
    const cw = Math.min(SIZE, rw - x0), ch = Math.min(SIZE, rh - y0);
    for (let y = 0; y < ch; y++) {
      for (let x = 0, i = y * SIZE, j = ((y0 + y) * rw + x0) * 3; x < cw; x++, i++, j += 3) { t[i] = data[j + 2]; t[plane + i] = data[j + 1]; t[2 * plane + i] = data[j]; }
    }
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, SIZE, SIZE]) });
    const cut = b => (x0 > 0 && b.x < 1) || (y0 > 0 && b.y < 1) || (x0 + cw < rw && b.x + b.w > cw - 1) || (y0 + ch < rh && b.y + b.h > ch - 1);
    return decode(out).filter(b => !cut(b)).map(b => ({ x: (b.x + x0) / rw, y: (b.y + y0) / rh, w: b.w / rw, h: b.h / rh, score: b.score }));
  }
  // Débuts des tuiles sur une longueur : tous les 640 px moins le recouvrement, la dernière contre le bord.
  const starts = (len, overlap) => {
    if (len <= SIZE) return [0];
    const out = [];
    for (let p = 0; p < len - SIZE; p += SIZE - overlap) out.push(p);
    return [...out, len - SIZE];
  };

  // Visages d'une image (fichier ou tampon) : [{ x, y, w, h, score }] en fractions de l'image, du plus sûr au moins
  // sûr ; les visages trop petits pour être reconnaissables sont écartés.
  async function detect(input) {
    const model = await load();
    const meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().metadata();
    const W = meta.autoOrient?.width ?? meta.width, H = meta.autoOrient?.height ?? meta.height;
    // L'original n'est décodé qu'une fois : réduit à DETAIL px de petit côté, puis, de là, l'image entière en 640 px.
    const k = Math.min(1, DETAIL / Math.min(W, H), Math.sqrt(DETAIL_PX / (W * H)));
    const rw = Math.max(1, Math.round(W * k)), rh = Math.max(1, Math.round(H * k));
    const data = await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().resize(rw, rh, { fit: 'fill' })
      .removeAlpha().toColourspace('srgb').raw().toBuffer();
    const f = SIZE / Math.max(rw, rh), pw = Math.max(1, Math.round(rw * f)), ph = Math.max(1, Math.round(rh * f));
    const small = await sharp(data, { raw: { width: rw, height: rh, channels: 3 } }).resize(pw, ph, { fit: 'fill' }).raw().toBuffer();
    // Passe 1 : l'image entière (grands visages) ; passe 2 : les tuiles (petits visages), si l'image dépasse une tuile.
    // Le recouvrement des tuiles dépasse la taille à partir de laquelle la passe 1 voit un visage.
    const whole = await scan(model, small, pw, ph);
    const tiles = [];
    if (rw > SIZE || rh > SIZE) {
      const overlap = Math.min(SIZE / 2, Math.max(160, Math.ceil(40 * Math.max(rw, rh) / SIZE)));
      for (const y0 of starts(rh, overlap)) for (const x0 of starts(rw, overlap)) tiles.push(...await scan(model, data, rw, rh, x0, y0));
    }
    // Un visage vu par plusieurs passes ou plusieurs tuiles n'est compté qu'une fois. La passe 1 d'abord : une tuile
    // peut prendre une partie d'un grand visage (le bas, flou) pour un visage à part.
    const kept = [];
    for (const list of [whole, tiles]) for (const b of list.sort((a, c) => c.score - a.score)) if (kept.every(o => !same(o, b))) kept.push(b);
    kept.sort((a, b) => b.score - a.score);
    return kept
      .map(b => ({ x: Math.max(0, b.x), y: Math.max(0, b.y), w: b.w, h: b.h, score: Math.round(b.score * 100) / 100 }))
      .filter(b => b.x < 1 && b.y < 1 && b.h >= MIN_FACE * SMALL_BOX)
      .map(b => ({ ...b, x: +b.x.toFixed(4), y: +b.y.toFixed(4), w: +b.w.toFixed(4), h: +b.h.toFixed(4) }));
  }

  return { detect };
}

// Service : détecte les visages des photos qui ne l'ont pas encore été (à l'import et, une fois, pour les
// anciennes), une à la fois, en arrière-plan. faces NULL : pas encore vu ; -1 : échec (illisible).
export function createFaceService({ db, storageDir, detector, log }) {
  let running = null, stopped = false;
  const save = db.prepare('UPDATE photos SET faces = ?, face_boxes = ? WHERE id = ?');
  const busy = new Set();                      // photos en cours d'examen (import et rattrapage ne se doublent pas)
  // Détecteur en tuiles (revue du 16 octobre 2026) : les photos déjà vues « sans visage » par l'ancien détecteur, qui
  // manquait les petits visages, sont revues une fois, des plus récentes aux plus anciennes, sans repasser par « pas
  // encore examinée ». Curseur dans les réglages : la plus grande photo qui reste à revoir.
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').pluck();
  const setSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const DETECTOR = '2';
  // Une photo : nombre et cadres ; image illisible : -1 (« examen impossible ») ; modèle indisponible : rien.
  async function one(p) {
    busy.add(p.id);
    try {
      const boxes = await detector.detect(path.join(storageDir, 'originals', p.file));
      if (!stopped) save.run(boxes.length, JSON.stringify(boxes), p.id);
    } catch (err) {
      if (err instanceof ModelError) throw err;
      if (!stopped) save.run(-1, null, p.id);
      log?.warn({ err: err.message, photo: p.id }, 'visages : détection impossible');
    } finally { busy.delete(p.id); }
  }
  // À l'import, tout de suite : jamais d'erreur (modèle indisponible : la photo reste à examiner).
  async function examine(id) {
    const p = db.prepare('SELECT id, file FROM photos WHERE id = ?').get(id);
    if (p) await one(p).catch(() => {});
  }
  async function run() {
    if (running) return running;
    running = (async () => {
      let n = 0;
      for (;;) {
        if (stopped) break;
        const skip = [...busy, 0].join(',');
        let p = db.prepare(`SELECT id, file FROM photos WHERE faces IS NULL AND id NOT IN (${skip}) ORDER BY id DESC LIMIT 1`).get();
        const upTo = p ? undefined : setting.get('faces_recheck');
        if (upTo !== undefined) {
          p = db.prepare(`SELECT id, file FROM photos WHERE faces = 0 AND id <= ? AND id NOT IN (${skip}) ORDER BY id DESC LIMIT 1`).get(Number(upTo));
          if (!p) { db.prepare("DELETE FROM settings WHERE key = 'faces_recheck'").run(); break; }
        }
        if (!p) break;
        try { await one(p); } catch { break; }      // modèle indisponible : on s'arrête, rien n'est écrit
        if (upTo !== undefined) setSetting.run('faces_recheck', String(p.id - 1));
        n++;
      }
      if (n) log?.info({ photos: n }, 'visages : photos examinées');
      running = null;
      return n;
    })();
    return running;
  }
  // Au démarrage : les examens impossibles sont retentés une fois (modèle réparé, image remplacée…).
  const retryFailed = () => db.prepare('UPDATE photos SET faces = NULL WHERE faces = -1').run().changes;
  // Au démarrage : une seule fois par version du détecteur, les photos « sans visage » sont mises à revoir.
  function recheckOnce() {
    if (setting.get('faces_detector') === DETECTOR) return 0;
    const max = db.prepare('SELECT MAX(id) FROM photos WHERE faces = 0').pluck().get() || 0;
    db.transaction(() => { if (max) setSetting.run('faces_recheck', String(max)); setSetting.run('faces_detector', DETECTOR); })();
    return max;
  }
  return { run, examine, retryFailed, recheckOnce, stop: () => { stopped = true; }, idle: () => running || Promise.resolve(0) };
}
