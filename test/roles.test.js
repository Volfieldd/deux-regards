import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { PERMISSIONS, ROLES, grantsOf, SCOPES } from '../server/permissions.js';

// Rôles et permissions, étape 1 (socle) : chaque route d'admin déclare une permission connue, le contrôle est fermé
// par défaut, et chaque rôle n'atteint que ce qu'il a le droit de faire (y compris dans les routes à plusieurs actions).

test('catalogue : chaque route d’admin déclare une permission connue ; rôles cohérents', async t => {
  const ctx = await setup(t, { seeded: true });
  const routes = ctx.app.routeList.filter(r => r.url.startsWith('/admin'));
  assert.ok(routes.length > 100);
  const bad = routes.filter(r => !Object.hasOwn(PERMISSIONS, r.perm || '')).map(r => `${r.method} ${r.url} → ${r.perm}`);
  assert.deepEqual(bad, []);
  // L'administrateur a tout ; les autres rôles ne citent que des permissions du catalogue, et « les miennes »
  // seulement pour celles qui ont une portée.
  assert.deepEqual(Object.keys(ROLES.admin.perms).sort(), Object.keys(PERMISSIONS).sort());
  for (const [name, role] of Object.entries(ROLES)) {
    for (const [perm, scope] of Object.entries(role.perms)) {
      assert.ok(Object.hasOwn(PERMISSIONS, perm), `${name} : ${perm}`);
      if (scope === SCOPES.OWN) assert.ok(PERMISSIONS[perm].scoped, `${name} : ${perm} sans portée`);
    }
  }
  // Deux rôles : la portée la plus large l'emporte.
  assert.equal(grantsOf(['photographe']).get('photos.voir'), SCOPES.OWN);
  assert.equal(grantsOf(['photographe', 'moderateur']).get('photos.voir'), SCOPES.ALL);
  assert.equal(grantsOf(['inconnu']).size, 0);
});

test('matrice : modérateur, relecteur, photographe et compte sans rôle n’atteignent que leurs droits', async t => {
  const ctx = await setup(t, { seeded: true });
  const store = createSessionStore(ctx.db);
  const as = role => {
    const token = store.create({ sub: `test:${role}`, name: role, roles: [role] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const req = (method, url, payload) => ctx.app.inject({ method, url, cookies: { session: token }, headers: { accept: 'text/html', 'x-csrf-token': csrf }, payload });
    return { get: url => req('GET', url), post: (url, payload = {}) => req('POST', url, { ...payload, _csrf: csrf }),
      json: (url, payload) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload }) };
  };
  const p = ctx.db.prepare("SELECT * FROM photos WHERE status = 'draft' LIMIT 1").get() || ctx.db.prepare('SELECT * FROM photos LIMIT 1').get();
  const other = ctx.db.prepare('SELECT id FROM categories WHERE id != ? LIMIT 1').pluck().get(p.category_id);
  const code = async r => (await r).statusCode;

  // Modérateur : publie, traite les signalements, corrige les textes ; jamais les données personnelles.
  const m = as('moderateur');
  assert.equal(await code(m.get('/admin')), 200);
  assert.equal(await code(m.get('/admin/signalements')), 200);
  assert.equal(await code(m.get('/admin/instagram')), 200);
  for (const url of ['/admin/personnes', '/admin/rencontres', '/admin/rencontres/1/export.zip', '/admin/auteurs', '/admin/terrain', '/admin/apparence', '/admin/droits']) {
    assert.equal(await code(m.get(url)), 403, url);
  }
  const denied = await m.json('/admin/photos/actions', { action: 'delete', ids: [p.id] });
  assert.deepEqual([denied.statusCode, denied.json().error], [403, 'Accès refusé : ce compte n’a pas ce droit.']);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) FROM photos WHERE id = ?').pluck().get(p.id), 1);
  assert.notEqual(await code(m.json('/admin/photos/actions', { action: 'draft', ids: [p.id] })), 403);          // publier / dépublier : permis
  assert.equal(await code(m.json(`/admin/photos/${p.id}/champs`, { title: 'Titre corrigé' })), 200);           // un texte : permis
  assert.equal(await code(m.json(`/admin/photos/${p.id}/champs`, { category_id: String(other) })), 403);        // la série : non
  assert.equal(await code(m.json('/admin/photos/actions', { action: 'category', category_id: String(other), ids: [p.id] })), 403);
  assert.equal(await code(m.post('/admin/reglages', { part: 'droits' })), 403);
  assert.equal(await code(m.post('/admin/reglages', { part: 'site', site_name: 'Nicephos' })), 303);
  assert.equal(await code(m.post(`/admin/photos/${p.id}/visages`, { faces: '1' })), 403);                      // touche aux accords

  // Relecteur : lit et corrige les textes, rien d'autre.
  const r = as('relecteur');
  assert.equal(await code(r.get('/admin/photos')), 200);
  assert.equal(await code(r.get('/admin/statistiques')), 403);
  assert.equal(await code(r.json('/admin/photos/actions', { action: 'publish', ids: [p.id] })), 403);
  assert.equal(await code(r.get('/admin/series')), 403);

  // Photographe : ses photos, ses sorties, ses personnes, le terrain ; ne publie pas, pas d'Instagram ni de réglages.
  // (lié au photographe de la photo p : portée « les miennes »)
  ctx.app.accounts.ensure({ sub: 'test:photographe', roles: ['photographe'] });
  ctx.app.accounts.update(ctx.app.accounts.bySub('test:photographe').id, { authorId: p.author_id }, 'test');
  const ph = as('photographe');
  assert.equal(await code(ph.get('/admin/personnes')), 200);
  assert.equal(await code(ph.get('/admin/terrain')), 200);
  assert.equal(await code(ph.get(`/admin/photos/${p.id}/original`)), 200);
  for (const url of ['/admin/instagram', '/admin/series', '/admin/signalements', '/admin/auteurs', '/admin/rencontres/1/export.zip']) {
    assert.equal(await code(ph.get(url)), 403, url);
  }
  assert.equal(await code(ph.json('/admin/photos/actions', { action: 'publish', ids: [p.id] })), 403);
  assert.equal(await code(ph.post(`/admin/photos/${p.id}/status`, { status: 'published' })), 403);
  // Sa fiche s'enregistre, mais changer le statut demande le droit de publier (le modérateur l'a dépubliée plus haut).
  const now = ctx.db.prepare('SELECT status FROM photos WHERE id = ?').get(p.id);
  const form = { title: p.title, slug: p.slug, category_id: String(p.category_id), author_id: String(p.author_id), taken_on: p.taken_on || '' };
  assert.equal(await code(ph.post(`/admin/photos/${p.id}`, { ...form, status: now.status })), 303);
  assert.equal(await code(ph.post(`/admin/photos/${p.id}`, { ...form, status: now.status === 'published' ? 'draft' : 'published' })), 403);

  // Compte sans rôle de l'admin : refusé partout.
  const none = as('visiteur');
  assert.equal(await code(none.get('/admin')), 403);
  assert.equal(await code(none.get('/admin/photos')), 403);
});
