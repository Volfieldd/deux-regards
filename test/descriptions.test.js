import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { createDescriber, MODELS } from '../server/describe.js';

// Descriptions suggérées (Florence-2, ici un faux modèle) : éteintes par défaut ; une photo demandée passe tout de
// suite ; les autres seulement la nuit ; traduites si un traducteur est là ; erreurs gardées ; fiche et réglages.
const fakeModel = (calls = []) => ({ async describe(file, key) { calls.push([file, key]); if (file.includes('casse')) throw new Error('image illisible'); return 'A red lighthouse on a small island.'; }, unload: async () => {}, remove: async () => { calls.push(['remove']); } });
const fakeTranslator = { enabled: true, async translate(text, from, to) { return `[${to}] ${text}`; } };

test('file : demandées tout de suite, les autres la nuit, une à la fois, traduites ; erreur gardée ; éteint : rien', async t => {
  const ctx = await setup(t, { seeded: true });
  const calls = [];
  let clock = Date.parse('2026-10-15T12:00:00Z');                                          // 14 h à Paris : jour
  const d = createDescriber({ db: ctx.db, storageDir: ctx.app.config.storageDir, model: fakeModel(calls), translator: fakeTranslator, now: () => clock });
  const [a, b] = ctx.db.prepare('SELECT id FROM photos ORDER BY id').pluck().all();
  assert.equal(d.settings().on, false);
  await d.request(a);
  assert.equal(calls.length, 0);                                                            // éteint : rien
  d.save({ on: true, model: 'base', from: 1, to: 6 });
  await d.run();
  assert.equal(calls.length, 1);                                                            // le jour : seulement la demande
  assert.equal(calls[0][1], 'base');
  assert.deepEqual(d.forPhoto(a, 'fr'), { text: '[fr] A red lighthouse on a small island.', en: 'A red lighthouse on a small island.', translated: true, pending: false, error: null, at: clock });
  assert.equal(d.forPhoto(a, 'en').text, 'A red lighthouse on a small island.');
  assert.equal(d.forPhoto(b), null);
  clock = Date.parse('2026-10-15T01:30:00Z');                                               // 3 h 30 à Paris : nuit
  assert.equal(d.night(), true);
  const n = await d.run();
  const total = ctx.db.prepare('SELECT COUNT(*) FROM photos').pluck().get();
  assert.equal(n, total - 1);                                                               // toutes les autres
  assert.equal(d.state().done, total);
  // Une erreur est gardée, la file continue ; redemander efface l'erreur.
  ctx.db.prepare("UPDATE photos SET file = 'casse.jpg' WHERE id = ?").run(b);
  await d.request(b);
  assert.equal(d.forPhoto(b).error, 'image illisible');
  // Nuit à cheval sur minuit (22 h – 5 h).
  d.save({ on: true, from: 22, to: 5 });
  clock = Date.parse('2026-10-15T21:30:00Z');                                               // 23 h 30
  assert.equal(d.night(), true);
  clock = Date.parse('2026-10-15T05:30:00Z');                                               // 7 h 30
  assert.equal(d.night(), false);
  assert.equal(d.settings().model, 'base');                                                 // gardé
  await d.remove();
  assert.equal(d.settings().on, false);
  assert.deepEqual(calls.at(-1), ['remove']);
});

test('sans traducteur : la description reste en anglais ; fiche : bloc, bouton, demande ; réglages sur Séries', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: 'jeton-de-test-0123456789' } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: 'jeton-de-test-0123456789', author: 'julien' } });
  const cookies = Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const post = (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { _csrf: csrf, ...payload } });
  const id = ctx.db.prepare('SELECT id FROM photos ORDER BY id LIMIT 1').pluck().get();
  // Éteint : pas de bloc, demande refusée.
  assert.doesNotMatch((await ctx.app.inject({ url: `/admin/photos/${id}`, cookies })).body, /data-desc/);
  await post(`/admin/photos/${id}/description`);
  assert.equal(ctx.app.describer.forPhoto(id), null);
  // Réglages (page Séries) : allumer avec le modèle et les heures.
  const series = (await ctx.app.inject({ url: '/admin/series', cookies })).body;
  assert.match(series, /id="descriptions"[\s\S]*name="model" value="large" checked[\s\S]*Allumer les descriptions/);
  await post('/admin/series/descriptions', { action: 'on', model: 'base', from: '2', to: '5' });
  assert.deepEqual(ctx.app.describer.settings(), { on: true, model: 'base', from: 2, to: 5 });
  // Fiche : bouton, demande, puis le texte en anglais (pas de traducteur ici) et « Reprendre comme légende ».
  assert.match((await ctx.app.inject({ url: `/admin/photos/${id}`, cookies })).body, /Description suggérée[\s\S]*pas encore calculée[\s\S]*Décrire cette photo/);
  const r = await post(`/admin/photos/${id}/description`);
  assert.equal(r.statusCode, 303);
  await ctx.app.describer.idle();
  const fiche = (await ctx.app.inject({ url: `/admin/photos/${id}`, cookies })).body;
  assert.match(fiche, /« A test photo\. »[\s\S]*en anglais : aucun traducteur configuré/);
  assert.match(fiche, /data-desc-use="A test photo\."/);
  assert.deepEqual(await (await ctx.app.inject({ url: `/admin/photos/${id}/description`, cookies, headers: { accept: 'application/json' } })).json(), { ...ctx.app.describer.forPhoto(id, 'fr') });
  // Éteindre et effacer.
  await post('/admin/series/descriptions', { action: 'off' });
  assert.equal(ctx.app.describer.settings().on, false);
  assert.ok(Object.keys(MODELS).includes('large'));
});
