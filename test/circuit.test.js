import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Circuit de publication : le photographe propose (une photo ou toute une sortie), le modérateur valide (tout de
// suite ou à une date), renvoie avec une remarque, ou dépublie en disant pourquoi ; chacun peut être prévenu par
// e-mail ; « publier sans validation » et « modifier ses photos publiées » se règlent photographe par photographe.
async function circuit(t) {
  const sent = [];
  const ctx = await setup(t, { seeded: true, mailTransport: { sendMail: async m => { sent.push(m); } } });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  // Photos de Sébastien : brouillons, sans visage (prêtes), le même jour (une sortie).
  ctx.db.prepare("UPDATE photos SET status = 'draft', faces = 0, taken_on = '2026-10-13' WHERE author_id = ?").run(seb);
  const photos = ctx.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id').pluck().all(seb);
  const as = (sub, roles, { authorId = null, email = null } = {}) => {
    ctx.app.accounts.ensure({ sub, name: sub, email: email || '', roles });
    if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
    if (email) ctx.app.accounts.setNotify(sub, { on: true });
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    return {
      get: url => ctx.app.inject({ url, cookies: { session: token }, headers: { accept: 'text/html' } }).then(r => r.body),
      post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
      json: (url, payload) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload }),
    };
  };
  const review = id => ctx.db.prepare('SELECT status, review, publish_at FROM photos WHERE id = ?').get(id);
  return { ...ctx, sent, seb, photos, review, ph: as('seb', ['photographe'], { authorId: seb, email: 'seb@example.org' }), mod: as('marc', ['moderateur'], { email: 'marc@example.org' }) };
}

test('proposer puis valider : le photographe ne publie pas lui-même ; le modérateur est prévenu, puis le photographe', async t => {
  const c = await circuit(t);
  const [a] = c.photos;
  const fiche = await c.ph.get(`/admin/photos/${a}`);
  assert.match(fiche, /Proposer à la publication/);
  assert.equal((await c.ph.post(`/admin/photos/${a}/status`, { status: 'published' })).statusCode, 403);
  assert.equal((await c.ph.json('/admin/photos/actions', { action: 'publish', ids: [a] })).statusCode, 403);
  await c.ph.post(`/admin/photos/${a}/proposer`, { message: 'Ma préférée de la sortie.' });
  assert.equal(c.review(a).review, 'proposee');
  assert.equal(c.sent.length, 1);
  assert.equal(c.sent[0].to, 'marc@example.org');
  assert.match(c.sent[0].text, /seb propose « .+ » à la publication[\s\S]*Ma préférée/);
  // Le modérateur : « Aujourd'hui », la page « À valider » avec le mot du photographe.
  assert.match(await c.mod.get('/admin'), /1 photo proposée à valider/);
  const page = await c.mod.get('/admin/a-valider');
  assert.match(page, /Ma préférée de la sortie/);
  assert.match(await c.ph.get('/admin'), /1 photo proposée, en attente du modérateur/);
  // Validation par lot : publiée, hors circuit ; le photographe est prévenu.
  await c.mod.post('/admin/a-valider', { ids: [String(a)], quand: 'maintenant' });
  assert.deepEqual(c.review(a), { status: 'published', review: null, publish_at: null });
  assert.equal(c.sent.at(-1).to, 'seb@example.org');
  assert.match(c.sent.at(-1).text, /est publiée \(validé par marc\)/);
  const history = c.db.prepare('SELECT action, by_name FROM photo_reviews WHERE photo_id = ? ORDER BY id').all(a);
  assert.deepEqual(history.map(h => [h.action, h.by_name]), [['proposee', 'seb'], ['publiee', 'marc']]);
});

test('renvoyer avec une remarque, reproposer ; programmer puis publication automatique ; dépublier avec la raison', async t => {
  const c = await circuit(t);
  const [, b, d] = c.photos;
  await c.ph.post(`/admin/photos/${b}/proposer`);
  // Le modérateur ne retouche pas : il renvoie (une remarque est exigée).
  assert.equal((await c.mod.post(`/admin/photos/${b}/textes`, { title: 'Non' })).statusCode, 403);
  await c.mod.post(`/admin/photos/${b}/renvoyer`, { message: '' });
  assert.equal(c.review(b).review, 'proposee');
  await c.mod.post(`/admin/photos/${b}/renvoyer`, { message: 'Le titre a une faute.' });
  assert.equal(c.review(b).review, 'a_reprendre');
  assert.match(await c.ph.get('/admin'), /Le titre a une faute/);
  assert.match(c.sent.at(-1).text, /vous est renvoyée par marc :\nLe titre a une faute/);
  await c.ph.post(`/admin/photos/${b}/proposer`);
  assert.equal(c.review(b).review, 'proposee');
  // Programmer : date passée refusée ; date à venir : « programmée » ; à l'échéance, publiée.
  await c.mod.post(`/admin/photos/${b}/valider`, { quand: 'date', date: '2020-01-01T10:00' });
  assert.equal(c.review(b).review, 'proposee');
  await c.mod.post(`/admin/photos/${b}/valider`, { quand: 'date', date: '2099-05-01T09:30' });
  assert.equal(c.review(b).review, 'programmee');
  assert.equal(new Date(c.review(b).publish_at).toISOString(), '2099-05-01T07:30:00.000Z');       // heure de Paris
  assert.match(await c.ph.get('/admin'), /1 photo programmée/);
  c.db.prepare('UPDATE photos SET publish_at = ? WHERE id = ?').run(Date.now() - 1000, b);
  assert.equal(await c.app.review.runDue(), 1);
  assert.deepEqual(c.review(b), { status: 'published', review: null, publish_at: null });
  // Programmée mais plus prête à l'échéance (un visage sans accord) : renvoyée, pas publiée.
  await c.ph.post(`/admin/photos/${d}/proposer`);
  await c.mod.post(`/admin/photos/${d}/valider`, { quand: 'date', date: '2099-05-01T09:30' });
  c.db.prepare('UPDATE photos SET publish_at = ?, faces_override = 1 WHERE id = ?').run(Date.now() - 1000, d);
  await c.app.review.runDue();
  assert.deepEqual(c.review(d), { status: 'draft', review: 'a_reprendre', publish_at: null });
  // Dépublier : la raison est exigée, et transmise.
  await c.mod.post(`/admin/photos/${b}/depublier`, { raison: '' });
  assert.equal(c.review(b).status, 'published');
  await c.mod.post(`/admin/photos/${b}/depublier`, { raison: 'Signalement d’un visiteur à examiner.' });
  assert.equal(c.review(b).status, 'draft');
  assert.match(await c.ph.get('/admin'), /Dépubliée : Signalement d’un visiteur/);
});

test('toute une sortie proposée d’un coup ; réglages par photographe ; préférence e-mail', async t => {
  const c = await circuit(t);
  // Sortie : « Proposer les photos prêtes ».
  const outing = await c.ph.get('/admin/sorties/sebastien/2026-10-13');
  assert.match(outing, /Proposer les photos prêtes · \d+/);
  await c.ph.post('/admin/sorties/sebastien/2026-10-13/proposer');
  assert.ok(c.photos.every(id => c.review(id).review === 'proposee'));
  // Le modérateur donne « publier sans validation » à Sébastien : il publie lui-même, ses photos seulement.
  const seb = c.app.accounts.bySub('seb');
  assert.match(await c.mod.get('/admin/circuit'), /Publier ses photos sans validation/);
  await c.mod.post(`/admin/circuit/${seb.id}`, { publier: '1', modifier: '1' });
  assert.equal((await c.ph.post(`/admin/photos/${c.photos[0]}/status`, { status: 'published' })).statusCode, 303);
  assert.deepEqual(c.review(c.photos[0]), { status: 'published', review: null, publish_at: null });   // publiée : hors circuit
  const julien = c.db.prepare("SELECT id FROM photos WHERE author_id != ? LIMIT 1").pluck().get(c.seb);
  assert.equal((await c.ph.post(`/admin/photos/${julien}/status`, { status: 'draft' })).statusCode, 404);
  // Puis lui retire « modifier ses photos publiées » : une photo publiée ne change plus.
  await c.mod.post(`/admin/circuit/${seb.id}`, { publier: '1' });
  assert.equal((await c.ph.json(`/admin/photos/${c.photos[0]}/champs`, { title: 'Changé' })).statusCode, 403);
  assert.match(await c.ph.get(`/admin/photos/${c.photos[0]}`), /La modifier demande un droit que le modérateur peut vous donner/);
  assert.equal((await c.ph.json(`/admin/photos/${c.photos[1]}/champs`, { title: 'Brouillon modifiable' })).statusCode, 200);
  // Un photographe ne règle pas le circuit.
  assert.equal((await c.ph.post(`/admin/circuit/${seb.id}`, { publier: '1', modifier: '1' })).statusCode, 403);
  // Préférence e-mail : adresse invalide refusée ; désactivée, plus d'e-mail.
  await c.ph.post('/admin/compte/notifications', { email: '1', adresse: 'pas-une-adresse' });
  assert.equal(c.app.accounts.bySub('seb').notify_to, '');
  await c.ph.post('/admin/compte/notifications', { adresse: '' });
  assert.equal(c.app.accounts.bySub('seb').notify_email, false);
});
