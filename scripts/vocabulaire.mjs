// Empreintes CLIP du vocabulaire des mots-clés (server/vocabulaire.json) : server/vocabulaire-vecteurs.bin,
// un Float32 normalisé de 512 valeurs par terme, dans l'ordre du fichier. Même modèle que l'image (CLIP ViT-B/32,
// Xenova, quantifié), partie texte, avec la phrase « a photo of … ». À relancer après chaque changement du vocabulaire :
//   npm i --no-save @huggingface/transformers@3.7.1 && node scripts/vocabulaire.mjs
import fs from 'node:fs';
import { AutoTokenizer, CLIPTextModelWithProjection } from '@huggingface/transformers';
const MODEL = 'Xenova/clip-vit-base-patch32';
const REVISION = 'd15189d7028b43f1d3e65039190477f6af591c2a';            // la même que le modèle d'image du site
const vocab = JSON.parse(fs.readFileSync(new URL('../server/vocabulaire.json', import.meta.url), 'utf8'));
const tokenizer = await AutoTokenizer.from_pretrained(MODEL, { revision: REVISION });
const model = await CLIPTextModelWithProjection.from_pretrained(MODEL, { revision: REVISION, dtype: 'q8' });
const out = new Float32Array(vocab.length * 512);
for (const [i, v] of vocab.entries()) {
  const { text_embeds } = await model(tokenizer([`a photo of ${v.en}`], { padding: true, truncation: true }));
  const e = text_embeds.data;
  let n = 0;
  for (const x of e) n += x * x;
  n = Math.sqrt(n);
  for (let k = 0; k < 512; k++) out[i * 512 + k] = e[k] / n;
}
fs.writeFileSync(new URL('../server/vocabulaire-vecteurs.bin', import.meta.url), Buffer.from(out.buffer));
console.log(`${vocab.length} termes`);
