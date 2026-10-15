import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Voyages : des sorties regroupées. Créer, rattacher des journées (entre deux dates, cochées, ou depuis une sortie),
// déplacer une journée d'un voyage à l'autre, retirer, photos du voyage, proposer d'un coup ; portée « les miennes ».
async function world(t) {
  const ctx = await setup(t, { seeded: true });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  // Sébastien : trois journées au Maroc (photos en brouillon, sans visage), une à Nantes ; Julien : une au Maroc.
  const ids = ctx.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id').pluck().all(seb);
  const days = ['2025-03-10', '2025-03-11', '2025-03-12', '2025-05-01'];
  ids.slice(0, 4).forEach((id, i) => ctx.db.prepare("UPDATE photos SET taken_on = ?, status = 'draft', faces = 0 WHERE id = ?").run(days[i], id));
  const julPhoto = ctx.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').pluck().get(jul);
  ctx.db.prepare("UPDATE photos SET taken_on = '2025-03-11' WHERE id = ?").run(julPhoto);
  const as = (sub, roles, authorId = null) => {
    ctx.app.accounts.ensure({ sub, name: sub, roles });
    if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    return {
      get: url => ctx.app.inject({ url, cookies: { session: token }, headers: { accept: 'text/html' } }),
      post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
    };
  };
  const tripDays = id => ctx.db.prepare('SELECT author_id, day FROM trip_days WHERE trip_id = ? ORDER BY day, author_id').all(id);
  const lastTrip = () => ctx.db.prepare('SELECT * FROM trips ORDER BY id DESC LIMIT 1').get();
  return { ...ctx, seb, jul, ids, julPhoto, as, tripDays, lastTrip };
}

test('voyage commun : créer, rattacher entre deux dates (les deux photographes), page, photos, déplacer, retirer, supprimer', async t => {
  const c = await world(t);
  const admin = c.as('root', ['admin']);
  assert.match((await admin.get('/admin/sorties')).body, /href="\/admin\/voyages"/);
  await admin.post('/admin/voyages', { name: 'Maroc 2025', author_id: '' });
  const tr = c.lastTrip();
  assert.deepEqual([tr.name, tr.slug, tr.author_id], ['Maroc 2025', 'maroc-2025', null]);
  await admin.post(`/admin/voyages/${tr.id}/journees`, { du: '2025-03-12', au: '2025-03-10' });      // dans le désordre : compris
  assert.deepEqual(c.tripDays(tr.id).map(d => d.day), ['2025-03-10', '2025-03-11', '2025-03-11', '2025-03-12']);
  const page = (await admin.get(`/admin/voyages/${tr.id}`)).body;
  assert.match(page, /du 10 mars 2025 au 12 mars 2025 · les deux photographes · 3 journées · 4 photos/);
  assert.match(page, /J1[\s\S]*J2[\s\S]*J3[\s\S]*J4/);
  assert.match(page, new RegExp(`href="/admin/photos/${c.julPhoto}"`));
  // La liste des sorties montre le voyage ; une sortie hors voyage peut y être rattachée depuis sa page.
  assert.match((await admin.get('/admin/sorties')).body, /voyage « Maroc 2025 »/);
  const nantes = (await admin.get('/admin/sorties/sebastien/2025-05-01')).body;
  assert.match(nantes, /name="voyage"[\s\S]*Maroc 2025/);
  // Un autre voyage reprend une journée : elle y est déplacée.
  await admin.post('/admin/voyages', { name: 'Désert', author_id: String(c.seb) });
  const desert = c.lastTrip();
  await admin.post(`/admin/sorties/sebastien/2025-03-12/voyage`, { voyage: String(desert.id) });
  assert.deepEqual(c.tripDays(desert.id).map(d => d.day), ['2025-03-12']);
  assert.equal(c.tripDays(tr.id).length, 3);
  // Un voyage de Sébastien ne prend pas une journée de Julien.
  await admin.post(`/admin/voyages/${desert.id}/journees`, { jours: [`${c.jul}:2025-03-11`] });
  assert.equal(c.tripDays(desert.id).length, 1);
  // Retirer, détacher, supprimer : les sorties et les photos restent.
  await admin.post(`/admin/voyages/${tr.id}/journees/retirer`, { jour: `${c.jul}:2025-03-11` });
  assert.equal(c.tripDays(tr.id).length, 2);
  await admin.post(`/admin/sorties/sebastien/2025-03-12/voyage`, { voyage: '' });
  assert.equal(c.tripDays(desert.id).length, 0);
  await admin.post(`/admin/voyages/${tr.id}`, { name: 'Maroc, printemps 2025', name_de: 'Marokko, Frühling 2025', intro: 'Dix jours au sud.' });
  assert.deepEqual([c.lastTrip().name === 'Désert', c.db.prepare('SELECT slug, name_de, intro FROM trips WHERE id = ?').get(tr.id)],
    [true, { slug: 'maroc-printemps-2025', name_de: 'Marokko, Frühling 2025', intro: 'Dix jours au sud.' }]);
  await admin.post(`/admin/voyages/${tr.id}/supprimer`);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM trip_days WHERE trip_id = ?').pluck().get(tr.id), 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM photos WHERE id = ?').pluck().get(c.ids[0]), 1);
});

test('photographe : ses voyages et ses journées seulement ; proposer d’un coup les photos prêtes du voyage', async t => {
  const c = await world(t);
  const ph = c.as('seb', ['photographe'], c.seb), admin = c.as('root', ['admin']);
  await admin.post('/admin/voyages', { name: 'Commun', author_id: '' });
  const common = c.lastTrip();
  await ph.post('/admin/voyages', { name: 'Mon Maroc', author_id: String(c.jul) });               // le photographe ne choisit pas
  const mine = c.lastTrip();
  assert.equal(mine.author_id, c.seb);
  await ph.post(`/admin/voyages/${mine.id}/journees`, { du: '2025-03-10', au: '2025-03-12' });
  assert.deepEqual(c.tripDays(mine.id).map(d => d.author_id), [c.seb, c.seb, c.seb]);          // pas la journée de Julien
  const list = (await ph.get('/admin/voyages')).body;
  assert.match(list, /Mon Maroc/);
  assert.doesNotMatch(list, /Commun/);
  assert.equal((await ph.get(`/admin/voyages/${common.id}`)).statusCode, 404);
  assert.ok([403, 404].includes((await ph.post(`/admin/voyages/${common.id}/journees`, { du: '2025-03-10', au: '2025-03-12' })).statusCode));
  // Proposer d'un coup : les brouillons prêts du voyage passent dans le circuit.
  assert.match((await ph.get(`/admin/voyages/${mine.id}`)).body, /Proposer les photos prêtes · 3/);
  await ph.post(`/admin/voyages/${mine.id}/proposer`);
  assert.equal(c.db.prepare(`SELECT COUNT(*) FROM photos WHERE id IN (${c.ids.slice(0, 3).join(',')}) AND review = 'proposee'`).pluck().get(), 3);
  // Nom vide : refusé.
  await ph.post(`/admin/voyages/${mine.id}`, { name: '  ' });
  assert.equal(c.db.prepare('SELECT name FROM trips WHERE id = ?').pluck().get(mine.id), 'Mon Maroc');
});
