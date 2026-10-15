import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Publication Instagram en échec : depuis la fiche, qui gère la file la republie directement ; le photographe demande
// la republication (une fois), l'équipe est prévenue (Aujourd'hui, page Instagram, e-mail) ; rien à demander quand la
// photo est déjà repartie dans la file.
async function world(t) {
  const sent = [];
  const ctx = await setup(t, { seeded: true, mailTransport: { sendMail: async m => { sent.push(m); } } });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const photo = ctx.db.prepare("SELECT * FROM photos WHERE author_id = ? AND status = 'published' ORDER BY id LIMIT 1").get(seb);
  ctx.db.prepare('UPDATE photos SET faces = 0 WHERE id = ?').run(photo.id);
  const postId = ctx.db.prepare("INSERT INTO instagram_posts (photo_id, status, frame, error, attempts, created_at) VALUES (?, 'failed', 'white', 'image refusée par Instagram (ERROR)', 3, 1)").run(photo.id).lastInsertRowid;
  const as = (sub, roles, { authorId = null, email = null } = {}) => {
    ctx.app.accounts.ensure({ sub, name: sub, email: email || '', roles });
    if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
    if (email) ctx.app.accounts.setNotify(sub, { on: true });
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    return {
      get: url => ctx.app.inject({ url, cookies: { session: token }, headers: { accept: 'text/html' } }).then(r => r.body),
      post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
    };
  };
  const post = () => ctx.db.prepare('SELECT * FROM instagram_posts WHERE id = ?').get(postId);
  return { ...ctx, sent, seb, photo, postId, post, as };
}

test('photographe : demander la republication d’un post en échec, une fois ; l’équipe est prévenue', async t => {
  const c = await world(t);
  const ph = c.as('seb', ['photographe'], { authorId: c.seb }), mod = c.as('marc', ['moderateur'], { email: 'marc@example.org' });
  const url = `/admin/photos/${c.photo.id}`;
  assert.match(await ph.get('/admin'), /Instagram : « [^»]+ » en échec/);
  const fiche = await ph.get(url);
  assert.match(fiche, /Échec de la publication : image refusée par Instagram/);
  assert.match(fiche, new RegExp(`action="${url}/instagram/demande"`));
  assert.doesNotMatch(fiche, /\/reessayer"/);                                        // pas la main sur la file
  assert.equal((await ph.post(`/admin/instagram/${c.postId}/reessayer`)).statusCode, 403);
  assert.equal((await ph.post(`${url}/instagram/demande`)).statusCode, 303);
  assert.equal(c.post().retry_requested_by, 'seb');
  assert.equal(c.sent.length, 1);
  assert.equal(c.sent[0].to, 'marc@example.org');
  assert.match(c.sent[0].text, /seb demande que « .+ » soit republiée sur Instagram[\s\S]*image refusée/);
  // Une seule fois : pas de second e-mail ; la fiche dit « demandée ».
  await ph.post(`${url}/instagram/demande`);
  assert.equal(c.sent.length, 1);
  assert.match(await ph.get(url), /✓ Republication demandée/);
  assert.doesNotMatch(await ph.get('/admin'), /en échec/);
  // L'équipe : Aujourd'hui, page Instagram, fiche ; republier depuis la fiche remet en tête de file et efface la demande.
  assert.match(await mod.get('/admin'), /1 republication Instagram demandée/);
  assert.match(await mod.get('/admin/instagram'), /⚑ Republication demandée · seb/);
  const modFiche = await mod.get(url);
  assert.match(modFiche, /⚑ Republication demandée/);
  assert.match(modFiche, new RegExp(`action="/admin/instagram/${c.postId}/reessayer"`));
  const r = await mod.post(`/admin/instagram/${c.postId}/reessayer`, { back: `${url}#instagram` });
  assert.deepEqual([r.statusCode, r.headers.location], [303, `${url}#instagram`]);
  assert.deepEqual([c.post().status, c.post().retry_requested_at], ['queued', null]);
  assert.doesNotMatch(await mod.get('/admin'), /republication Instagram demandée/);
  // Déjà dans la file : rien à demander.
  assert.equal((await ph.post(`${url}/instagram/demande`)).statusCode, 303);
  assert.equal(c.sent.length, 1);
  assert.doesNotMatch(await ph.get(url), /instagram\/demande"/);
});

test('demande de republication : seulement sur ses photos', async t => {
  const c = await world(t);
  const jul = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const other = c.as('jules', ['photographe'], { authorId: jul });
  const r = await other.post(`/admin/photos/${c.photo.id}/instagram/demande`);
  assert.ok([403, 404].includes(r.statusCode));
  assert.equal(c.post().retry_requested_at, null);
});
