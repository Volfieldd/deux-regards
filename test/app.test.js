import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

test('GET /healthz répond ok', async t => {
  const { app } = await setup(t);
  const res = await app.inject('/healthz');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
});

test('les en-têtes de sécurité sont posés', async t => {
  const { app } = await setup(t);
  const res = await app.inject('/');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
});

test("l'accueil provisoire compte les photos publiées", async t => {
  const { app } = await setup(t, { seeded: true });
  const res = await app.inject('/');
  assert.match(res.body, /Test : 12 photos publiées/);
});
