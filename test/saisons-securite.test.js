import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as } from './carnet-helpers.js';

test('Expositions : choix d’accueil réservé à l’admin, persistant et observé par la Vigie', async t => {
  const c = await setup(t, { seeded: true, env: {
    VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'saisons-ingest-test-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64,
  }, vigieOptions: { send: async () => {}, timers: false, pollDecisions: false } });
  await c.app.ready();
  const events = [], original = c.app.securite.emit;
  c.app.securite.emit = (type, options) => { events.push({ type, ...options }); return original(type, options); };
  const admin = as(c, { sub: 'expositions-admin', roles: ['admin'] });
  const photographer = as(c, { sub: 'expositions-photographe', roles: ['photographe'], author: 'sebastien' });
  const reviewer = as(c, { sub: 'expositions-relecteur', roles: ['relecteur'] });
  const id = c.app.saisons.create({ title: 'Exposition synthétique' });
  const photo = c.db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  c.app.saisons.setPhotos(id, [photo]);
  // La décision de publication est ici une donnée de fixture ; son circuit est exercé par saisons-routes.test.js.
  c.db.prepare("UPDATE saisons SET state = 'programme', opens_at = ?, closes_at = ?, cover_id = ? WHERE id = ?")
    .run(Date.now() + 60000, Date.now() + 86400000, photo, id);
  assert.equal((await admin.post('/admin/saisons/accueil', { saison_id: String(id) })).statusCode, 303);
  const read = () => JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'saison_accueil'").pluck().get());
  assert.equal(read(), id);
  const changed = events.filter(e => e.type === 'config_public_changed' && e.detail?.cles?.includes('saison_accueil'));
  assert.equal(changed.length, 1);
  assert.deepEqual(changed[0].detail.valeurs.saison_accueil, { avant: null, apres: id });
  assert.equal(changed[0].detail.contact_change, false);
  assert.ok(!JSON.stringify(changed[0].detail).includes('synthétique'), 'seul l’identifiant éditorial entre dans le signal');
  for (const actor of [photographer, reviewer]) {
    assert.equal((await actor.post('/admin/saisons/accueil', { saison_id: '' })).statusCode, 403);
    assert.equal(read(), id);
  }
  assert.ok(events.some(e => e.type === 'authz_fail' && e.detail?.permission === 'saisons.accueil'));
  assert.equal((await admin.post('/admin/saisons/accueil', { saison_id: String(id) })).statusCode, 303);
  assert.equal(events.filter(e => e.type === 'config_public_changed' && e.detail?.cles?.includes('saison_accueil')).length, 1, 'un choix identique ne signale pas de changement');
  assert.equal((await admin.post('/admin/saisons/accueil', { saison_id: '' })).statusCode, 303);
  assert.equal(read(), null);
});
