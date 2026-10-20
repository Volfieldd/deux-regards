import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { EncounterError } from '../server/encounters.js';

// Instagram suit les accords : Instagram suppose le site, et une photo dont une personne (liée, ou rencontrée ce
// jour-là par son photographe) n'a pas accepté Instagram n'entre jamais dans la file, ou en sort.
const TOKEN = 'jeton-de-test-0123456789';
const DAY = '2026-10-13';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function ctxOf(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const post = (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  const get = url => ctx.app.inject({ url, cookies });
  // Une photo publiée de Julien, prise le jour de la session.
  const julien = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const photo = ctx.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 1").pluck().get();
  ctx.db.prepare('UPDATE photos SET author_id = ?, taken_on = ?, faces = 1 WHERE id = ?').run(julien, DAY, photo);   // un visage
  return { ...ctx, post, get, julien, photo, enc: ctx.app.encounters, ig: ctx.app.instagram };
}

test('Instagram suppose le site : refusé sans le site partout, ancien accord lu sans Instagram', async t => {
  const { app, db, enc, julien } = await ctxOf(t);
  const hello = await app.inject({ method: 'POST', url: '/bonjour', payload: { ref: 'J-0201', decision: 'accord', adult: 'oui', scope_instagram: 'on', email: 'a@exemple.fr', name: 'Ana' } });
  assert.match(hello.body, /Instagram suppose le site/);
  assert.equal(db.prepare("SELECT COUNT(*) FROM encounters WHERE ref = 'J-0201'").pluck().get(), 0);
  assert.throws(() => enc.saveCard(null, { ref: 'J-0202', signed: 'on', scope_instagram: 'on', author_id: julien }), e => e instanceof EncounterError && /Instagram suppose le site/.test(e.errors.scopes));
  // Avec le site : accepté.
  const id = enc.saveCard(null, { ref: 'J-0203', signed: 'on', scope_site: 'on', scope_instagram: 'on', author_id: julien });
  assert.equal(enc.get(id).consent.instagram, true);
  // Accord enregistré avant la règle (Instagram sans le site) : lu sans Instagram.
  db.prepare(`UPDATE encounters SET consent = '{"site":false,"instagram":true,"print":true,"name":false}' WHERE id = ?`).run(id);
  assert.equal(enc.get(id).consent.instagram, false);
  // Formulaires : l'usage est annoncé.
  assert.match((await app.inject('/bonjour')).body, /sur Instagram \(avec le site\)/);
});

test('personne de la session sans Instagram : file refusée, levée par « Pas sur cette photo »', async t => {
  const { enc, ig, post, get, julien, photo } = await ctxOf(t);
  const id = enc.saveCard(null, { ref: 'J-0210', signed: 'on', scope_site: 'on', met_on: DAY, author_id: julien });
  assert.throws(() => ig.enqueue(photo), /bloquée : J-0210 n’a pas accepté Instagram/);
  const page = await get(`/admin/photos/${photo}`);
  assert.match(page.body, /Instagram bloqué<\/strong> : J-0210 n’a pas accepté Instagram/);
  assert.match(page.body, /Pas sur cette photo/);
  assert.doesNotMatch(page.body, /Ajouter à la file Instagram/);
  // Route de la fiche : aussi refusée, avec la raison.
  const r = await post('/admin/instagram/file', { photo_id: String(photo) });
  assert.equal(r.statusCode, 303);
  // La personne n'est pas sur la photo : exclue de la session, retour à la fiche, Instagram possible.
  const out = await post(`/admin/rencontres/${id}/session/${photo}`, { exclure: '1', depuis: 'photo' });
  assert.equal(out.headers.location, `/admin/photos/${photo}#rencontres`);
  assert.deepEqual(ig.blocked(photo), []);
  // Plus bloquée, mais un visage sans accord : à vérifier, mise en file sur confirmation.
  assert.throws(() => ig.enqueue(photo), /à vérifier/);
  const ok = await post('/admin/instagram/file', { photo_id: String(photo), confirmer: '1' });
  assert.equal(ok.statusCode, 303);
  assert.ok(ig.forPhoto(photo));
});

test('refus ou accord sans Instagram arrivé après la mise en file : la photo sort de la file, en échec expliqué', async t => {
  const { app, db, enc, ig, julien, photo } = await ctxOf(t);
  // Un visage, personne rencontrée encore : à vérifier, mise en file sur confirmation explicite (gardée).
  assert.throws(() => ig.enqueue(photo), /à vérifier : 1 visage, personne rencontrée/);
  const postId = ig.enqueue(photo, { confirmed: true, byName: 'Julien' });
  assert.equal(app.readiness.confirmations(photo)[0].usage, 'instagram');
  // La personne refuse sur /bonjour (carte J-0220, rencontrée ce jour-là).
  const r = await app.inject({ method: 'POST', url: '/bonjour', payload: { ref: 'J-0220', decision: 'refus', met_on: DAY } });
  assert.ok(r.statusCode < 400);
  const p = ig.post(postId);
  assert.equal(p.status, 'failed');
  assert.match(p.error, /bloquée : J-0220/);
  assert.throws(() => ig.retry(postId), /bloquée/);
  // Accord limité au site d'une personne liée à la photo, saisi sur une carte : même effet.
  db.prepare('DELETE FROM encounters').run();
  const again = ig.enqueue(photo, { confirmed: true });
  const id = enc.saveCard(null, { ref: 'J-0230', signed: 'on', scope_site: 'on', author_id: julien });
  assert.equal(ig.post(again).status, 'queued');                  // ni liée ni de la session (pas de date) : rien ne bloque
  enc.link(id, [photo]);
  assert.equal(ig.post(again).status, 'failed');
  // Accord avec Instagram : plus rien ne bloque.
  enc.saveCard(id, { ref: 'J-0230', signed: 'on', scope_site: 'on', scope_instagram: 'on', author_id: julien });
  assert.deepEqual(ig.blocked(photo), []);
  ig.retry(again);
  assert.equal(ig.post(again).status, 'queued');
});
