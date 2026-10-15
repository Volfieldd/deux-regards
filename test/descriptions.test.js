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
  assert.match(series, /id="descriptions"[\s\S]*name="model" value="base" checked[\s\S]*Allumer les descriptions/);   // « Léger » par défaut
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

test('mémoire : « Léger » par défaut ; « Précis » refusé si le conteneur n’a pas 6 Go ; repli sur « Léger » si la limite baisse', async t => {
  const ctx = await setup(t, { seeded: true });
  const calls = [];
  let limit = 3 * 2 ** 30;                                                                  // compose par défaut : 3g
  const d = createDescriber({ db: ctx.db, storageDir: ctx.app.config.storageDir, model: fakeModel(calls), translator: null, memLimit: () => limit });
  assert.equal(d.settings().model, 'base');
  assert.deepEqual(d.state().fits, { base: true, large: false });
  assert.throws(() => d.save({ on: true, model: 'large' }), /Mémoire insuffisante pour « Précis » : le site dispose de 3\.0 Go, il en faut 6\. Ajoutez SITE_MEM_LIMIT=6g/);
  assert.equal(d.settings().on, false);                                                     // rien n'est enregistré
  limit = 6 * 2 ** 30;                                                                      // SITE_MEM_LIMIT=6g
  d.save({ on: true, model: 'large' });
  const id = ctx.db.prepare('SELECT id FROM photos ORDER BY id LIMIT 1').pluck().get();
  await d.request(id);
  assert.equal(calls.at(-1)[1], 'large');
  limit = 3 * 2 ** 30;                                                                      // limite redescendue
  assert.equal(d.state().effective, 'base');
  await d.request(id);
  assert.equal(calls.at(-1)[1], 'base');
  assert.equal(ctx.db.prepare('SELECT model FROM photo_descriptions WHERE photo_id = ?').pluck().get(id), MODELS.base.id);
});

test('ancien réglage « Précis » avec 3 Go : la page coche « Léger », le formulaire s’enregistre sans choisir ; sous 3 Go : refus, même « Léger »', async t => {
  const ctx = await setup(t, { seeded: true });
  let limit = 3 * 2 ** 30;
  const d = createDescriber({ db: ctx.db, storageDir: ctx.app.config.storageDir, model: fakeModel(), translator: null, memLimit: () => limit });
  ctx.db.prepare("INSERT INTO settings (key, value) VALUES ('describe', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ on: false, model: 'large', from: 1, to: 6 }));
  assert.equal(d.state().effective, 'base');
  const s = d.save({ on: true, from: '2' });                                                // aucun modèle envoyé (radio grisé)
  assert.deepEqual([s.on, s.model, s.from], [true, 'base', 2]);
  limit = 2 * 2 ** 30;                                                                      // conteneur trop petit
  assert.equal(d.state().effective, null);
  assert.throws(() => d.save({ on: true, model: 'base' }), /Mémoire insuffisante pour « Léger » : le site dispose de 2\.0 Go, il en faut 3\. Ajoutez SITE_MEM_LIMIT=3g/);
  assert.doesNotThrow(() => d.save({ on: false }));                                         // éteindre reste possible
  // La page Séries (vraie application, mémoire de la machine) : le modèle utilisé est coché.
  const t2 = (await import('../server/admin-i18n.js')).translator('en');
  assert.equal(t2.msg('Mémoire insuffisante pour « Précis » : le site dispose de 3.0 Go, il en faut 6. Ajoutez SITE_MEM_LIMIT=6g au .env de la pile, puis Compose Up.'),
    'Not enough memory for “Precise”: the site has 3.0 GB, it needs 6. Add SITE_MEM_LIMIT=6g to the stack’s .env, then Compose Up.');
});
