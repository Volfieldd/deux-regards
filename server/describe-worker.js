import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Descriptions suggérées : le modèle Florence-2 et son calcul, dans un processus à part (lancé par server/describe.js,
// argument « calcul »). Le calcul d'ONNX Runtime est synchrone : dans le processus du site, il figeait toutes les
// pages 10 à 30 s par photo. Ici, le site n'attend pas ; et si la mémoire manque, c'est ce processus que le noyau
// arrête, pas le site.
// Fichiers figés (révision Hugging Face, taille et empreinte SHA-256 de chacun) : téléchargés et vérifiés ici, jamais
// par transformers.js, qui les lit ensuite sur le disque sans rien demander au réseau.
// need : mémoire totale du conteneur conseillée pour ce modèle (le modèle et le reste du site), en octets.
const BASE_TOKENIZER = {
  'tokenizer.json': [2297961, 'd69dcdb2323e124ac4f800cb9863ddccea0d7bb11e16125e8df3bd60f2f8aeac'],
  'tokenizer_config.json': [197658, 'd8e64607233cb53b619fb46664f6cad08176c26e0e8735b2d30d888364f19600'],
};
export const MODELS = {
  base: { id: 'onnx-community/Florence-2-base-ft', revision: 'e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f', mb: 270, ram: 2, need: 3 * 2 ** 30,
    files: {
      'config.json': [5432, 'd90c22ed72eb55291f183fcd9b98ebd3bd3d92bfcffb6c7f6e1606085e793525'],
      'generation_config.json': [292, '7b8eb17bbd6cf8a07f619ad83ae03881eff05b6b9237bab89005b40e77783c29'],
      'preprocessor_config.json': [2673, 'c892857e34a7082284983a7717717d39c9bf7e574f1f41d80d4c918c97502efa'],
      ...BASE_TOKENIZER,
      'onnx/embed_tokens_quantized.onnx': [39390433, '6b2258db1c8ee9b160576ccde3cd3814d83a2edaed0dd1c6ca9ff3c38fa62214'],
      'onnx/vision_encoder_quantized.onnx': [93746540, '3b79d54f23f666f731549db23cb070c35a979ce19cbd9720e90e67a78dc9768c'],
      'onnx/encoder_model_quantized.onnx': [43651493, 'f4ad7a68f1fb875d3bcf735ea14a7021b7ba7e83baf7cf10289881b4ed6d9b85'],
      'onnx/decoder_model_merged_quantized.onnx': [98177697, 'f22f52f980c33df0efa15932c2f3db6d9d3595ce6387eca938b8cfe23dc4c641'],
    } },
  large: { id: 'onnx-community/Florence-2-large-ft', revision: '04ace74913c28d7ec94af32cee5c111a10126b6f', mb: 850, ram: 4, need: 6 * 2 ** 30,
    files: {
      'config.json': [5460, '226291bd5b65c932b01704838489cdc810f0f4949f182abc3de67d7a6ab3632a'],
      'generation_config.json': [62, '6257874d1d2fd60a5c0786253005d9dfa46f5287903fdb079ca9829ec13cf8b4'],
      'preprocessor_config.json': [2672, '3adbbeec44c2b8f41a1e97b3ab2197227fb24be1fc1779c9d0d925f4e77d6559'],
      ...BASE_TOKENIZER,
      'onnx/embed_tokens_quantized.onnx': [52520480, 'dab1d09ab449f1302df6e439b35ec9e93fb037134bf6bed9ffeaa93a5b35d43c'],
      'onnx/vision_encoder_quantized.onnx': [366371802, '0dbf2172ef1dc6fbb4da0f02498ef9e3a009bf84e8f2e0d971f39cc5b7e053ce'],
      'onnx/encoder_model_quantized.onnx': [152985855, '9fe30b02cc8c2247631f8f0b9bc4d6613df1c33da0afe4087abff2f940bc2fe0'],
      'onnx/decoder_model_merged_quantized.onnx': [257619824, '167e7807fb1e5b8d693138f84bc81e1368ea11833264131c1ea96eafc9d13222'],
    } },
};

// Le modèle ne se charge pas, ou son processus s'arrête : la passe s'arrête, la photo de la file de nuit n'est pas
// marquée en échec (elle sera reprise).
export class ModelError extends Error {}

const sha256Of = async file => {
  const h = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) h.update(chunk);
  return h.digest('hex');
};

// Un fichier : écrit sous un nom provisoire (.part), renommé une fois sa taille et son empreinte vérifiées. Un
// téléchargement qui ne reçoit plus rien pendant stallMs est abandonné.
async function download(url, file, [bytes, sha256], fetchImpl, stallMs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const part = `${file}.part`;
  const ac = new AbortController();
  let stall = setTimeout(() => ac.abort(), stallMs);
  const out = fs.createWriteStream(part);
  try {
    const res = await fetchImpl(url, { redirect: 'follow', signal: ac.signal });
    if (!res.ok || !res.body) throw new ModelError(`téléchargement refusé (${res.status})`);
    const hash = crypto.createHash('sha256');
    let got = 0;
    for await (const chunk of res.body) {
      clearTimeout(stall);
      stall = setTimeout(() => ac.abort(), stallMs);
      got += chunk.length;
      if (got > bytes) throw new ModelError('fichier du modèle trop gros : téléchargement interrompu');
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
    }
    await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
    if (got !== bytes || hash.digest('hex') !== sha256) throw new ModelError('fichier du modèle altéré (empreinte SHA-256 différente)');
    fs.renameSync(part, file);
  } catch (err) {
    out.destroy();
    fs.rmSync(part, { force: true });
    if (err instanceof ModelError) throw err;
    throw new ModelError(ac.signal.aborted ? 'téléchargement du modèle bloqué : le réseau ne répond plus' : `téléchargement du modèle impossible : ${err.message}`);
  } finally { clearTimeout(stall); }
}

// Fichiers du modèle, là où transformers.js les cherche (dir/<id>/<révision>/) : absents, incomplets ou altérés
// (téléchargement interrompu par un arrêt du site), ils sont (re)téléchargés. Les fichiers déjà là sont vérifiés une
// fois (marque « .verifie »), ensuite seulement leur taille.
export async function fetchModel({ dir, model, fetchImpl = globalThis.fetch, stallMs = 60 * 1000 }) {
  const base = path.join(dir, model.id, model.revision);
  const mark = path.join(base, '.verifie');
  const checked = fs.existsSync(mark);
  for (const [name, spec] of Object.entries(model.files)) {
    const file = path.join(base, name);
    if (fs.statSync(file, { throwIfNoEntry: false })?.size === spec[0] && (checked || await sha256Of(file) === spec[1])) continue;
    await download(`https://huggingface.co/${model.id}/resolve/${model.revision}/${name}`, file, spec, fetchImpl, stallMs);
  }
  if (!checked) fs.writeFileSync(mark, '');
}

// ---------- le processus de calcul ----------
// Messages reçus : { id, jpeg, key, dir, threads } ; renvoyés : { id, phase: 'calcul' } quand le modèle est prêt,
// puis { id, text } ou { id, error, model } (model : le modèle ne s'est pas chargé).
const TASK = '<CAPTION>';
async function serve() {
  // Premier arrêté par le noyau si la mémoire du conteneur manque (le site reste debout).
  try { fs.writeFileSync('/proc/self/oom_score_adj', '1000'); } catch { /* hors Linux */ }
  let loaded = null;
  async function load(key, dir, threads) {
    if (loaded?.key === key) return loaded;
    await loaded?.model.dispose?.();
    loaded = null;
    const m = MODELS[key];
    await fetchModel({ dir, model: m });
    const { Florence2ForConditionalGeneration, AutoProcessor, AutoTokenizer, env } = await import('@huggingface/transformers');
    env.cacheDir = dir;
    env.allowRemoteModels = false;                   // les fichiers vérifiés, rien d'autre
    const opts = { revision: m.revision };
    const model = await Florence2ForConditionalGeneration.from_pretrained(m.id, { ...opts, dtype: 'q8', session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 } });
    const processor = await AutoProcessor.from_pretrained(m.id, opts);
    const tokenizer = await AutoTokenizer.from_pretrained(m.id, opts);
    process.send({ log: 'descriptions : modèle chargé', model: m.id });
    loaded = { key, model, processor, tokenizer };
    return loaded;
  }
  let queue = Promise.resolve();
  process.on('message', msg => {
    queue = queue.then(async () => {
      const { id, jpeg, key, dir, threads = 1 } = msg;
      let phase = 'load';
      try {
        const { model, processor, tokenizer } = await load(key, dir, threads);
        phase = 'calcul';
        process.send({ id, phase });
        const { RawImage } = await import('@huggingface/transformers');
        const image = await RawImage.fromBlob(new Blob([jpeg], { type: 'image/jpeg' }));
        const ids = await model.generate({ ...tokenizer(processor.construct_prompts(TASK)), ...(await processor(image)), max_new_tokens: 60, num_beams: 1 });
        const out = processor.post_process_generation(tokenizer.batch_decode(ids, { skip_special_tokens: false })[0], TASK, image.size);
        process.send({ id, text: String(out[TASK] || '').trim() });
      } catch (err) {
        process.send({ id, error: String(err?.message || err).slice(0, 300), model: phase === 'load' });
      }
    });
  });
  process.on('disconnect', () => process.exit(0));   // le site s'est arrêté
}
if (process.argv[2] === 'calcul' && process.send) serve();
