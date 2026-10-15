import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup, fakeImageModel } from './helpers.js';
import { createImageModel, ModelError } from '../server/series-suggest.js';

// Série proposée : désactivée par défaut ; une fois allumée, un brouillon dont la série n'a pas été choisie reçoit la
// série dont les photos rangées lui ressemblent le plus (deux au plus), jamais appliquée sans un clic.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
// Empreinte proche d'une direction (a, b : poids des axes 0 et 1), un peu différente pour chaque photo.
const vec = (a, b, i) => { const v = new Array(512).fill(0); v[0] = a; v[1] = b; v[20 + i] = 0.08; return v; };

test('série proposée : éteinte par défaut, propose sans appliquer, « Classer », « Garder », éteindre efface tout', async t => {
  const vectors = new Map();
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN }, seriesOptions: { manual: true, model: fakeImageModel(vectors) } });
  const { db, app } = ctx;
  const res = await app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = db.prepare('SELECT csrf FROM sessions').pluck().get();
  const html = { cookies, headers: { accept: 'text/html' } };

  // Deux séries de 4 photos publiées (« Rue » : axe 0, « Mer » : axe 1), une petite série « Divers », trois brouillons.
  const cat = name => db.prepare("INSERT INTO categories (slug, name, position) VALUES (?, ?, 99)").run(`t-${name.toLowerCase()}`, name).lastInsertRowid;
  const rue = cat('Rue'), mer = cat('Mer'), divers = cat('Divers');
  const photos = db.prepare('SELECT id, file FROM photos ORDER BY id').all();
  const put = (p, category, status, v) => { db.prepare('UPDATE photos SET category_id = ?, status = ?, series_checked = 0 WHERE id = ?').run(category, status, p.id); vectors.set(p.file, v); };
  photos.slice(0, 4).forEach((p, i) => put(p, rue, 'published', vec(1, 0, i)));
  photos.slice(4, 8).forEach((p, i) => put(p, mer, 'published', vec(0, 1, i)));
  const [wrong, right, both] = photos.slice(8, 11);
  put(wrong, rue, 'draft', vec(0.05, 1, 9));        // classé dans Rue à l'import, ressemble à Mer
  put(right, mer, 'draft', vec(0, 1, 10));          // déjà dans la bonne série : rien à proposer
  put(both, divers, 'draft', vec(1, 1, 11));        // entre les deux : deux propositions
  db.prepare("UPDATE photos SET taken_on = '2026-10-13' WHERE id = ?").run(wrong.id);
  const day = `/admin/sorties/${db.prepare('SELECT a.slug FROM photos p JOIN authors a ON a.id = p.author_id WHERE p.id = ?').pluck().get(wrong.id)}/2026-10-13`;
  for (const p of photos.slice(11)) db.prepare("UPDATE photos SET status = 'published' WHERE id = ?").run(p.id);

  // Éteinte : rien d'analysé, rien de proposé.
  assert.equal(app.seriesSuggest.state().status, 'off');
  assert.deepEqual(app.seriesSuggest.forPhoto(db.prepare('SELECT * FROM photos WHERE id = ?').get(wrong.id)), []);
  assert.match((await app.inject({ url: '/admin/series', cookies })).body, /Allumer les propositions/);

  // Allumer : le modèle analyse toutes les photos.
  const on = await app.inject({ method: 'POST', url: '/admin/series/propositions', ...html, payload: { _csrf: csrf, action: 'on' } });
  assert.equal(on.statusCode, 303);
  await app.seriesSuggest.idle();
  const st = app.seriesSuggest.state();
  assert.deepEqual([st.status, st.done], ['ready', photos.length]);
  assert.match((await app.inject({ url: '/admin/series', cookies })).body, /Éteindre et effacer/);

  // Propositions : Mer pour la photo mal rangée, rien pour celle qui est déjà bien rangée, deux pour l'hésitante.
  const sug = id => app.seriesSuggest.forPhoto(db.prepare('SELECT * FROM photos WHERE id = ?').get(id));
  assert.deepEqual(sug(wrong.id).map(s => [s.category_id, s.size]), [[mer, 4]]);
  assert.ok(sug(wrong.id)[0].votes >= 2);
  assert.deepEqual(sug(right.id), []);
  assert.deepEqual(sug(both.id).map(s => s.category_id).sort(), [rue, mer].sort());
  // Une photo publiée n'a jamais de proposition (sa série compte comme choisie).
  assert.deepEqual(sug(photos[0].id), []);

  // Photothèque : filtre « Série proposée », badge sur la vignette, données de la vue rapide.
  const lib = (await app.inject({ url: '/admin/photos?manque=proposee', cookies })).body;
  assert.match(lib, /✦ Série proposée <span class="n">2<\/span>/);
  assert.match(lib, new RegExp(`id="photo-${wrong.id}"[\\s\\S]*?class="badge sug"[^>]*><span aria-hidden="true">✦</span> Mer`));
  assert.doesNotMatch(lib, new RegExp(`id="photo-${right.id}"`));
  const one = (await app.inject({ url: `/admin/photos/${wrong.id}/donnees`, cookies })).json();
  assert.deepEqual(one.suggest.map(s => s.name), ['Mer']);
  // Aujourd'hui : la ligne qui y mène.
  assert.match((await app.inject({ url: '/admin', cookies })).body, /2 photos avec une série proposée/);
  // Fiche : la proposition, ses voisines, « Garder ».
  const fiche = (await app.inject({ url: `/admin/photos/${wrong.id}`, cookies })).body;
  assert.match(fiche, /Série proposée :<\/span>|✦ Série proposée : <b>Mer<\/b>/);
  assert.match(fiche, /ressemble à \d+ de ses 4 photos/);
  assert.match(fiche, /Garder « Rue »/);
  // Sortie : une photo à la fois.
  const outing = (await app.inject({ url: day, cookies })).body;
  assert.match(outing, new RegExp(`formaction="/admin/photos/${wrong.id}/serie"[^>]*name="category_id" value="${mer}"[^>]*>Classer dans « Mer »`));

  // Rien n'a bougé tant qu'on n'a pas cliqué.
  assert.equal(db.prepare('SELECT category_id FROM photos WHERE id = ?').pluck().get(wrong.id), rue);

  // « Classer dans Mer » (depuis la sortie) : retour à la sortie, série choisie, proposition disparue.
  const moved = await app.inject({ method: 'POST', url: `/admin/photos/${wrong.id}/serie`, ...html, payload: { _csrf: csrf, category_id: String(mer), back: day } });
  assert.deepEqual([moved.statusCode, moved.headers.location], [303, day]);
  assert.deepEqual(db.prepare('SELECT category_id, series_checked FROM photos WHERE id = ?').get(wrong.id), { category_id: mer, series_checked: 1 });
  assert.deepEqual(sug(wrong.id), []);
  // « Garder » (vue rapide, JSON) : la série actuelle est confirmée.
  const kept = await app.inject({ method: 'POST', url: `/admin/photos/${both.id}/serie`, cookies, headers: { 'x-csrf-token': csrf }, payload: { garder: '1' } });
  assert.equal(kept.json().text, '« ' + db.prepare('SELECT title FROM photos WHERE id = ?').pluck().get(both.id) + ' » reste dans « Divers ».');
  assert.deepEqual(sug(both.id), []);
  assert.equal(db.prepare('SELECT category_id FROM photos WHERE id = ?').pluck().get(both.id), divers);
  // Série inconnue : refusée.
  assert.equal((await app.inject({ method: 'POST', url: `/admin/photos/${right.id}/serie`, cookies, headers: { 'x-csrf-token': csrf }, payload: { category_id: '9999' } })).statusCode, 422);

  // Une photo rangée à la main sert ensuite d'exemple ; la fiche enregistrée avec « Choisir » vaut choix.
  db.prepare('UPDATE photos SET series_checked = 0, category_id = ? WHERE id = ?').run(rue, right.id);
  assert.deepEqual(sug(right.id).map(s => s.category_id), [mer]);
  const p = db.prepare('SELECT * FROM photos WHERE id = ?').get(right.id);
  await app.inject({ method: 'POST', url: `/admin/photos/${right.id}`, ...html,
    payload: { _csrf: csrf, title: p.title, slug: p.slug, category_id: String(rue), author_id: String(p.author_id), status: 'draft', serie_choisie: '1' } });
  assert.equal(db.prepare('SELECT series_checked FROM photos WHERE id = ?').pluck().get(right.id), 1);

  // Éteindre : empreintes effacées, plus aucune proposition.
  await app.inject({ method: 'POST', url: '/admin/series/propositions', ...html, payload: { _csrf: csrf, action: 'off' } });
  assert.equal(db.prepare('SELECT COUNT(*) FROM photo_embeddings').pluck().get(), 0);
  assert.equal(app.seriesSuggest.state().status, 'off');
  assert.doesNotMatch((await app.inject({ url: '/admin/photos', cookies })).body, /✦ Série proposée/);
  // CSRF exigé.
  assert.equal((await app.inject({ method: 'POST', url: '/admin/series/propositions', cookies, payload: { action: 'on' } })).statusCode, 403);
});

test('modèle d’images : un fichier altéré est refusé et rien ne reste sur le disque', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modele-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fetchImpl = async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-length': '4' } });
  const model = createImageModel({ dir, fetchImpl });
  await assert.rejects(model.ensure(), err => err instanceof ModelError && /SHA-256/.test(err.message));
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.equal(model.present(), false);
  // Téléchargement refusé (404) : erreur claire, nouvel essai possible.
  const model2 = createImageModel({ dir, fetchImpl: async () => new Response('non', { status: 404 }) });
  await assert.rejects(model2.ensure(), /404/);
});
