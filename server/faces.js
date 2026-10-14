import path from 'node:path';
import sharp from 'sharp';

// Détection des visages (pas de reconnaissance) : dit seulement « il y a un visage, ici, de cette taille ».
// Sert à savoir s'il y a un accord à aller chercher : une photo sans visage n'a besoin de l'accord de personne.
// Modèle YuNet (OpenCV Zoo, licence MIT, assets/models/), exécuté sur le serveur par ONNX Runtime : aucune image ne
// sort. Ne garde que le nombre de visages et leurs cadres (fractions de l'image) ; aucune empreinte de visage, rien
// qui permette de reconnaître quelqu'un.
const SIZE = 640;
const STRIDES = [8, 16, 32];
const SCORE = 0.75;           // seuil de confiance
const NMS = 0.3;              // recouvrement au-delà duquel deux cadres sont le même visage
// Un visage plus petit que 1,5 % de la hauteur de l'image est ignoré (silhouette lointaine, foule) : personne n'y
// est reconnaissable.
export const MIN_FACE = 0.015;

const iou = (a, b) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
};

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

export function createFaceDetector({ modelPath = new URL('../assets/models/face_detection_yunet_2023mar.onnx', import.meta.url).pathname, log } = {}) {
  let session = null;
  const load = async () => {
    if (!session) {
      const ort = (await import('onnxruntime-node')).default;
      session = ort.InferenceSession.create(modelPath, { intraOpNumThreads: 1, interOpNumThreads: 1 }).then(s => ({ s, ort }));
    }
    return session;
  };

  // Visages d'une image (fichier ou tampon) : [{ x, y, w, h, score }] en fractions de l'image, du plus sûr au moins
  // sûr ; les visages trop petits pour être reconnaissables sont écartés.
  async function detect(input) {
    const { s, ort } = await load();
    const img = sharp(input, { limitInputPixels: 200e6 }).rotate();
    const meta = await sharp(input, { limitInputPixels: 200e6 }).rotate().metadata();
    const W = meta.autoOrient?.width ?? meta.width, H = meta.autoOrient?.height ?? meta.height;
    const scale = SIZE / Math.max(W, H);
    // Image entière dans 640 × 640, en haut à gauche, fond noir ; planes B, G, R (ordre d'OpenCV), valeurs 0-255.
    const { data } = await img.resize(SIZE, SIZE, { fit: 'contain', position: 'left top', background: { r: 0, g: 0, b: 0 } })
      .removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const plane = SIZE * SIZE, t = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) { t[i] = data[i * 3 + 2]; t[plane + i] = data[i * 3 + 1]; t[2 * plane + i] = data[i * 3]; }
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, SIZE, SIZE]) });
    const w = W * scale, h = H * scale;
    return decode(out)
      .map(b => ({ x: Math.max(0, b.x / w), y: Math.max(0, b.y / h), w: b.w / w, h: b.h / h, score: Math.round(b.score * 100) / 100 }))
      .filter(b => b.x < 1 && b.y < 1 && b.h >= MIN_FACE)
      .map(b => ({ ...b, x: +b.x.toFixed(4), y: +b.y.toFixed(4), w: +b.w.toFixed(4), h: +b.h.toFixed(4) }));
  }

  return { detect, warm: () => load().catch(err => { log?.error({ err }, 'visages : modèle illisible'); }) };
}

// Service : détecte les visages des photos qui ne l'ont pas encore été (à l'import et, une fois, pour les
// anciennes), une à la fois, en arrière-plan. faces NULL : pas encore vu ; -1 : échec (illisible).
export function createFaceService({ db, storageDir, detector, log, auto = true }) {
  let running = null, stopped = false;
  const save = db.prepare('UPDATE photos SET faces = ?, face_boxes = ? WHERE id = ?');
  // Une photo, tout de suite (à l'import) : jamais d'erreur, au pire « examen impossible ».
  async function examine(id) {
    const p = db.prepare('SELECT id, file FROM photos WHERE id = ?').get(id);
    if (!p) return;
    try { const boxes = await detector.detect(path.join(storageDir, 'originals', p.file)); save.run(boxes.length, JSON.stringify(boxes), p.id); }
    catch (err) { save.run(-1, null, p.id); log?.warn({ err: err.message, photo: p.id }, 'visages : détection impossible'); }
  }
  async function run() {
    if (running) return running;
    running = (async () => {
      let n = 0;
      for (;;) {
        if (stopped) break;
        const p = db.prepare('SELECT id, file FROM photos WHERE faces IS NULL ORDER BY id DESC LIMIT 1').get();
        if (!p) break;
        try {
          const boxes = await detector.detect(path.join(storageDir, 'originals', p.file));
          if (!stopped) save.run(boxes.length, JSON.stringify(boxes), p.id);
        } catch (err) {
          if (!stopped) save.run(-1, null, p.id);
          log?.warn({ err: err.message, photo: p.id }, 'visages : détection impossible');
        }
        n++;
      }
      if (n) log?.info({ photos: n }, 'visages : photos examinées');
      running = null;
      return n;
    })();
    return running;
  }
  // Après un import : examen en arrière-plan (sauf en mode manuel, pour les tests).
  const kick = () => { if (auto && !stopped) run().catch(err => log?.error({ err }, 'visages')); };
  return { run, kick, examine, stop: () => { stopped = true; }, idle: () => running || Promise.resolve(0) };
}
