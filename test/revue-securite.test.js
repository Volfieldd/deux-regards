import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Non-régression de la revue de sécurité et de code du 15 octobre 2026 : portée « les miennes » sur les annulations,
// les rencontres et les comptes à plusieurs rôles ; comptes et sessions ; circuit (heure de Paris, programmation,
// sortie, « À valider ») ; petites fuites.
function multipart(parts) {
  const boundary = '----test' + Math.random().toString(16).slice(2);
  const chunks = [];
  for (const p of parts) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'text/html' } };
}

async function world(t) {
  const ctx = await setup(t, { seeded: true });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const as = (sub, roles, authorId = null) => {
    ctx.app.accounts.ensure({ sub, name: sub, roles });
    if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token };
    return {
      csrf,
      get: url => ctx.app.inject({ url, cookies, headers: { accept: 'text/html' } }),
      post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
      json: (url, payload) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload }),
      form: (url, parts) => { const f = multipart([{ name: '_csrf', value: csrf }, ...parts]); return ctx.app.inject({ method: 'POST', url, cookies, headers: f.headers, payload: f.payload }); },
    };
  };
  const photoOf = a => ctx.db.prepare('SELECT * FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').get(a);
  const row = id => ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  return { ...ctx, seb, jul, as, photoOf, row };
}

test('annulations des actions groupées : seulement ses photos, et pas les photos publiées non modifiables', async t => {
  const c = await world(t);
  const ph = c.as('seb', ['photographe'], c.seb);
  const theirs = c.photoOf(c.jul);
  const other = c.db.prepare('SELECT id FROM categories WHERE id != ? LIMIT 1').pluck().get(theirs.category_id);
  await ph.json('/admin/photos/actions', { action: 'categories', ids: [], map: { [theirs.id]: other } });
  await ph.json('/admin/photos/actions', { action: 'restore-fields', ids: [], map: { [theirs.id]: { place: 'PIRATE', taken_on: '2001-01' } } });
  await ph.json('/admin/photos/actions', { action: 'map_restore', ids: [], map: { [theirs.id]: theirs.on_map ? 0 : 1 } });
  const after = c.row(theirs.id);
  assert.deepEqual([after.category_id, after.place, after.on_map], [theirs.category_id, theirs.place, theirs.on_map]);
  // « Publier sans validation » (sur ses photos) : les photos de l'autre ne se dépublient pas par une annulation.
  c.app.accounts.setAdjust(c.app.accounts.bySub('seb').id, 'photos.publier', true);
  await ph.json('/admin/photos/actions', { action: 'statuses', ids: [], map: { [theirs.id]: 'draft' } });
  assert.equal(c.row(theirs.id).status, 'published');
  // Créer une série à la volée demande le droit de gérer les séries.
  const mine = c.photoOf(c.seb);
  assert.equal((await ph.json('/admin/photos/actions', { action: 'category', ids: [mine.id], category_id: 'new', new_category: 'Sauvage' })).statusCode, 403);
  // Le compte et le texte suivent les photos réellement touchées.
  c.app.accounts.setAdjust(c.app.accounts.bySub('seb').id, 'photos.publiees.modifier', false);
  const r = await ph.json('/admin/photos/actions', { action: 'category', ids: [mine.id], category_id: String(other) });
  assert.equal(r.statusCode, 422);                                                // « Aucune photo sélectionnée » : rien n'a bougé
  assert.equal(c.row(mine.id).category_id, mine.category_id);
});

test('plusieurs rôles (photographe + relecteur) : voir toutes les photos ne permet pas d’agir sur celles des autres', async t => {
  const c = await world(t);
  const both = c.as('seb', ['photographe', 'relecteur'], c.seb);
  c.app.accounts.setAdjust(c.app.accounts.bySub('seb').id, 'photos.publier', true);
  const theirs = c.photoOf(c.jul);
  assert.equal((await both.get(`/admin/photos/${theirs.id}`)).statusCode, 200);                     // voir : oui (relecteur)
  assert.equal((await both.get(`/admin/photos/${theirs.id}/original`)).statusCode, 403);
  assert.equal((await both.post(`/admin/photos/${theirs.id}/delete`)).statusCode, 403);
  assert.equal((await both.post(`/admin/photos/${theirs.id}/depublier`, { raison: 'non' })).statusCode, 403);
  assert.equal((await both.post(`/admin/photos/${theirs.id}/status`, { status: 'draft' })).statusCode, 403);
  const form = { title: theirs.title, slug: theirs.slug, category_id: String(theirs.category_id), author_id: String(c.seb), status: theirs.status };
  assert.equal((await both.post(`/admin/photos/${theirs.id}`, form)).statusCode, 403);
  assert.equal((await both.json('/admin/photos/actions', { action: 'delete', ids: [theirs.id], confirm: true })).statusCode, 422);
  assert.ok(c.row(theirs.id));
  assert.equal(c.row(theirs.id).author_id, c.jul);
  // Un texte, oui (relecteur), mais pas la ville (« plus que du texte »).
  assert.equal((await both.json(`/admin/photos/${theirs.id}/champs`, { title: 'Relu' })).statusCode, 200);
  assert.equal((await both.json(`/admin/photos/${theirs.id}/champs`, { city_label: '' })).statusCode, 403);
  // La même lecture globale ne permet ni de lier la photo à sa rencontre, ni de la dépublier par un refus historique.
  const encounter = c.app.encounters.saveCard(null, { ref: 'S-0999', signed: 'on', scope_site: 'on', met_on: '2026-10-13', author_id: c.seb, name: 'Personne test' });
  c.db.prepare('UPDATE encounters SET refused = 1 WHERE id = ?').run(encounter);
  await both.post(`/admin/rencontres/${encounter}/photos`, { photo: String(theirs.id) });
  assert.equal(c.app.encounters.photos(encounter).some(p => p.id === theirs.id), false);
  const mine = c.photoOf(c.seb);
  await both.post(`/admin/rencontres/${encounter}/photos`, { photo: String(mine.id) });
  assert.equal(c.app.encounters.photos(encounter).some(p => p.id === mine.id), true);
  c.app.encounters.link(encounter, [theirs.id]);                                      // ancienne liaison, antérieure au correctif
  await both.post(`/admin/rencontres/${encounter}/refus`);
  assert.equal(c.row(mine.id).status, 'draft');
  assert.equal(c.row(theirs.id).status, 'published');
  assert.equal((await both.post(`/admin/rencontres/${encounter}/liens`, { photo_id: String(theirs.id) })).statusCode, 404);
  const closes = new Date(Date.now() + 60 * 86400e3).toISOString().slice(0, 10);
  const gallery = c.app.spaces.createSpace({ title: 'Sélection', closes }, { authorId: c.seb, by: 'test' });
  await both.post(`/admin/galeries/${gallery}/photos`, { photos: String(theirs.id) });
  assert.equal(c.app.spaces.items(gallery).length, 0);
});

test('lot rejeté : aucun champ ne change et la programmation validée reste celle d’avant', async t => {
  const c = await world(t);
  const ph = c.as('seb', ['photographe'], c.seb);
  const photo = c.photoOf(c.seb);
  const publishAt = Date.now() + 86400e3;
  c.db.prepare("UPDATE photos SET status = 'draft', review = 'programmee', publish_at = ? WHERE id = ?").run(publishAt, photo.id);
  const before = c.row(photo.id);
  const r = await ph.json('/admin/photos/actions', { action: 'appliquer', ids: [photo.id], city_label: 'Paris', taken_on: 'date impossible' });
  assert.equal(r.statusCode, 422);
  const after = c.row(photo.id);
  for (const key of ['city_id', 'city_name', 'city_cc', 'city_lat', 'city_lon', 'city_source', 'taken_on', 'review', 'publish_at']) assert.equal(after[key], before[key], key);
  const valid = await ph.json('/admin/photos/actions', { action: 'appliquer', ids: [photo.id], place: 'Quai transactionnel' });
  assert.equal(valid.statusCode, 200);
  assert.deepEqual([c.row(photo.id).place, c.row(photo.id).review, c.row(photo.id).publish_at], ['Quai transactionnel', 'proposee', null]);
});

test('rencontres : la référence d’un autre photographe, sa liste et son récapitulatif restent hors d’atteinte', async t => {
  const c = await world(t);
  const jul = c.app.encounters.saveCard(null, { ref: 'J-0042', signed: 'on', scope_site: 'on', met_on: '2026-10-12', author_id: c.jul, name: 'Alice', email: 'alice@example.org' });
  c.db.prepare('UPDATE encounters SET refused = 1 WHERE id = ?').run(jul);
  const ph = c.as('seb', ['photographe'], c.seb);
  // Réécrire sa rencontre par la référence, ou se l'attribuer : refusé, rien ne change.
  const r1 = await ph.form('/admin/rencontres', [{ name: 'ref', value: 'J-0042' }, { name: 'name', value: 'Pirate' }, { name: 'signed', value: 'on' }, { name: 'scope_site', value: 'on' }]);
  assert.equal(r1.statusCode, 422);
  const e = c.db.prepare('SELECT author_id, refused FROM encounters WHERE id = ?').get(jul);
  assert.deepEqual(e, { author_id: c.jul, refused: 1 });
  assert.equal(c.app.encounters.get(jul).name, 'Alice');
  // La page d'erreur ne liste pas ses rencontres.
  assert.doesNotMatch(r1.body, /Alice|alice@example/);
  const r2 = await ph.form('/admin/rencontres', [{ name: 'ref', value: 'S-0001' }, { name: 'author_id', value: String(c.jul) }]);
  assert.equal(r2.statusCode, 422);
  // Renvoyer son récapitulatif par e-mail : introuvable.
  assert.equal((await ph.post(`/admin/rencontre/${jul}/envoyer`)).statusCode, 404);
});

test('comptes : une session sans compte n’apporte aucun rôle', async t => {
  const c = await world(t);
  const token = createSessionStore(c.db).create({ sub: 'fantome', name: 'X', roles: ['admin'] });
  const r = await c.app.inject({ url: '/admin', cookies: { session: token }, headers: { accept: 'text/html' } });
  assert.equal(r.statusCode, 403);
  assert.deepEqual(c.app.accounts.bySub('fantome').roles, []);
});

test('circuit : heure de Paris aux changements d’heure ; programmée puis modifiée ; reproposer ; sortie ; « À valider »', async t => {
  const c = await world(t);
  c.db.prepare("UPDATE photos SET status = 'draft', faces = 0, taken_on = '2026-10-13' WHERE author_id = ?").run(c.seb);
  const [a, b] = c.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id').pluck().all(c.seb);
  const ph = c.as('seb', ['photographe'], c.seb), mod = c.as('marc', ['moderateur']);
  await ph.post(`/admin/photos/${a}/proposer`);
  const at = async date => { await mod.post(`/admin/photos/${a}/valider`, { quand: 'date', date }); const v = c.row(a).publish_at; await mod.post(`/admin/photos/${a}/deprogrammer`); return new Date(v).toISOString(); };
  assert.equal(await at('2026-10-25T01:30'), '2026-10-24T23:30:00.000Z');       // encore à l'heure d'été (+2)
  assert.equal(await at('2027-03-28T01:30'), '2027-03-28T00:30:00.000Z');       // encore à l'heure d'hiver (+1)
  assert.equal(await at('2027-03-28T02:30'), '2027-03-28T01:30:00.000Z');       // n'existe pas : 3 h 30 d'été
  // Programmée, puis modifiée par le photographe : à revoir par le modérateur.
  await mod.post(`/admin/photos/${a}/valider`, { quand: 'date', date: '2099-01-01T10:00' });
  assert.equal(c.row(a).review, 'programmee');
  // Reproposer (par lot) ne perd pas la programmation.
  await ph.json('/admin/photos/actions', { action: 'propose', ids: [a, b] });
  assert.deepEqual([c.row(a).review, c.row(b).review], ['programmee', 'proposee']);
  await ph.json(`/admin/photos/${a}/champs`, { title: 'Nouveau titre' });
  assert.deepEqual([c.row(a).review, c.row(a).publish_at], ['proposee', null]);
  // Publiée par la sortie : sort du circuit (plus dans « À valider »).
  const admin = c.as('root', ['admin']);
  await admin.post('/admin/sorties/sebastien/2026-10-13/publier');
  assert.deepEqual([c.row(b).status, c.row(b).review], ['published', null]);
  assert.equal(c.app.review.countFor('proposee'), 0);
  // Renvoyer une photo qui n'est pas proposée : refusé.
  await mod.post(`/admin/photos/${b}/renvoyer`, { message: 'x' });
  assert.equal(c.row(b).review, null);
});

test('« À valider » : une photo à vérifier confirmée par le photographe est cochable', async t => {
  const c = await world(t);
  c.db.prepare("UPDATE photos SET status = 'draft', faces = 1, faces_override = 1 WHERE author_id = ?").run(c.seb);
  const a = c.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').pluck().get(c.seb);
  const ph = c.as('seb', ['photographe'], c.seb), mod = c.as('marc', ['moderateur']);
  await ph.post(`/admin/photos/${a}/proposer`, { confirmer: '1' });
  assert.equal(c.row(a).review, 'proposee');
  const page = (await mod.get('/admin/a-valider')).body;
  assert.match(page, new RegExp(`name="ids" value="${a}" aria-label`));
  assert.match(page, /confirmée par le photographe/);
});
