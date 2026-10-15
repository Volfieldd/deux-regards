import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setup } from './helpers.js';
import { VOCABULARY, rank, formsOf, createKeywordSuggester } from '../server/keywords-suggest.js';
import { createSearch } from '../server/search.js';
import { MODEL } from '../server/series-suggest.js';

// Mots-clés suggérés par CLIP : vocabulaire en trois langues et ses empreintes, choix dans la liste à partir de
// l'empreinte de la photo, mots déjà présents écartés, fiche, recherche du site dans les trois langues.
const vecs = () => { const b = fs.readFileSync(new URL('../server/vocabulaire-vecteurs.bin', import.meta.url)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const termVec = fr => { const i = VOCABULARY.findIndex(v => v.fr === fr); return vecs().slice(i * 512, (i + 1) * 512); };
const blob = v => Buffer.from(new Float32Array(v).buffer);

test('vocabulaire : trois langues, sans doublon, une empreinte normalisée par terme', () => {
  assert.ok(VOCABULARY.length >= 100);
  for (const v of VOCABULARY) for (const l of ['fr', 'en', 'de']) assert.ok(v[l], `${v.fr} ${l}`);
  assert.equal(new Set(VOCABULARY.map(v => v.fr)).size, VOCABULARY.length);
  const V = vecs();
  assert.equal(V.length, VOCABULARY.length * 512);
  for (let i = 0; i < VOCABULARY.length; i++) { let n = 0; for (let k = 0; k < 512; k++) n += V[i * 512 + k] ** 2; assert.ok(Math.abs(n - 1) < 1e-3); }
  // Une empreinte proche de « phare » donne « phare » en tête.
  assert.equal(rank(termVec('phare'))[0].fr, 'phare');
  assert.deepEqual(formsOf('Leuchtturm'), ['phare', 'lighthouse', 'Leuchtturm']);
  assert.equal(formsOf('mot inconnu'), null);
});

test('suggestions d’une photo : d’après son empreinte, dans la langue, sans les mots déjà là ; fiche ; recherche', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: 'jeton-de-test-0123456789' } });
  const photo = ctx.db.prepare("SELECT * FROM photos WHERE slug = 'brume-sur-la-loire'").get();
  const s = createKeywordSuggester({ db: ctx.db });
  assert.equal(s.forPhoto(photo), null);                                                    // pas encore d'empreinte
  ctx.db.prepare('INSERT INTO photo_embeddings (photo_id, model, vec, created_at) VALUES (?, ?, ?, ?)').run(photo.id, MODEL.id, blob(termVec('phare')), Date.now());
  assert.equal(s.forPhoto(photo)[0].word, 'phare');
  assert.equal(s.forPhoto(photo, { lang: 'de' })[0].word, 'Leuchtturm');
  assert.ok(!s.forPhoto(photo, { have: 'lighthouse, mer' }).some(x => x.word === 'phare'));   // déjà là, dans une autre langue
  assert.ok(s.forPhoto(photo).length <= 6);
  // Fiche : boutons de suggestion.
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: 'jeton-de-test-0123456789', author: 'julien' } });
  const cookies = Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
  const fiche = (await ctx.app.inject({ url: `/admin/photos/${photo.id}`, cookies })).body;
  assert.match(fiche, /class="kw-sugg" data-kw-sugg>[\s\S]*data-kw-add="phare"/);
  // Recherche du site : un mot-clé du vocabulaire se trouve dans les trois langues.
  ctx.db.prepare("UPDATE photos SET keywords = 'phare' WHERE id = ?").run(photo.id);
  const search = createSearch({ db: ctx.db });
  for (const q of ['phare', 'lighthouse', 'Leuchtturm']) assert.deepEqual(search.find(q), [photo.id], q);
});
