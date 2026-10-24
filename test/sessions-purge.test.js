import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore, hash, IDLE_TTL, ABSOLUTE_TTL } from '../server/sessions.js';

const HOUR = 3600e3;

test('purge des sessions : échéances glissante et absolue, session active intacte, passage idempotent', async t => {
  const { db } = await setup(t, { env: { VIGIE_URL: '' } });
  const clock = Date.now();
  const sessions = createSessionStore(db, { now: () => clock });
  const active = sessions.create({ sub: 'active', name: 'Compte de test', email: 'test@example.org', idToken: 'jeton-factice' });
  const idle = sessions.create({ sub: 'inactive' });
  const absolute = sessions.create({ sub: 'ancienne' });
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(clock, hash(idle));
  db.prepare('UPDATE sessions SET created_at = ?, expires_at = ? WHERE id = ?').run(clock - ABSOLUTE_TTL, clock + IDLE_TTL, hash(absolute));
  const before = db.prepare('SELECT * FROM sessions WHERE id = ?').get(hash(active));

  assert.equal(sessions.purge(), 2);
  assert.deepEqual(db.prepare('SELECT * FROM sessions WHERE id = ?').get(hash(active)), before);
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 1);
  assert.equal(db.prepare('SELECT COUNT(*) FROM sessions_revoked').pluck().get(), 0, 'sans Vigie, aucune conservation de révocation');
  assert.equal(sessions.purge(), 0);
});

test('au démarrage : sessions échues effacées sans connexion, empreintes conservées par le déclencheur Vigie', async t => {
  const { app, db } = await setup(t, {
    env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-vigie-test-0123456789abcdefgh', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { send: async () => {}, timers: false, pollDecisions: false },
  });
  const sessions = createSessionStore(db);
  const active = sessions.create({ sub: 'active' });
  const expired = sessions.create({ sub: 'inactive', name: 'Nom fictif', email: 'test@example.org', idToken: 'jeton-factice', ctx: { net: '192.0.2.0', ua: 'navigateur de test' } });
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(Date.now() - 1, hash(expired));

  await app.ready();

  assert.deepEqual(db.prepare('SELECT id FROM sessions').pluck().all(), [hash(active)]);
  const revoked = db.prepare('SELECT * FROM sessions_revoked WHERE id = ?').get(hash(expired));
  assert.ok(revoked, 'le DELETE passe par le déclencheur existant');
  assert.equal(revoked.sub, 'inactive');
  assert.equal(revoked.ctx_net, '192.0.2.0');
  assert.equal(revoked.ctx_ua, 'navigateur de test');
  assert.ok(revoked.revoked_at > Date.now() - 60e3);
  assert.equal(sessions.revoked(expired).id, hash(expired));
  assert.equal(Object.hasOwn(revoked, 'name'), false);
  assert.equal(Object.hasOwn(revoked, 'email'), false);
  assert.equal(Object.hasOwn(revoked, 'id_token'), false);
});

test('sans nouvelle requête : passage horaire, session active préservée, minuteries libérées et annulées à l’arrêt', async t => {
  const clock = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: clock });
  const intervals = [], cancelled = new Set();
  const originalSet = globalThis.setInterval, originalClear = globalThis.clearInterval;
  t.mock.method(globalThis, 'setInterval', (fn, ms, ...args) => {
    const handle = originalSet(fn, ms, ...args);
    intervals.push({ fn, ms, args, handle });
    return handle;
  });
  t.mock.method(globalThis, 'clearInterval', handle => { cancelled.add(handle); return originalClear(handle); });
  const { app, db } = await setup(t, { env: { VIGIE_URL: '' } });
  await app.ready();
  const sessions = createSessionStore(db);
  const active = sessions.create({ sub: 'active' });
  const idle = sessions.create({ sub: 'inactive' });
  const absolute = sessions.create({ sub: 'ancienne' });
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(clock + HOUR, hash(idle));
  db.prepare('UPDATE sessions SET created_at = ?, expires_at = ? WHERE id = ?').run(clock - ABSOLUTE_TTL + HOUR, clock + IDLE_TTL, hash(absolute));

  t.mock.timers.setTime(clock + HOUR);
  const hourly = intervals.filter(i => i.ms === HOUR);
  for (const i of hourly) await i.fn(...i.args);

  assert.deepEqual(db.prepare('SELECT id FROM sessions').pluck().all(), [hash(active)]);
  assert.ok(hourly.every(i => !i.handle.hasRef()), 'aucune minuterie horaire ne retient le processus');
  await app.close();
  assert.ok(hourly.every(i => cancelled.has(i.handle)), 'aucune minuterie horaire ne survit à close()');
});
