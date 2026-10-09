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

test('la CSP interdit toute ressource tierce', async t => {
  const { app } = await setup(t);
  const csp = (await app.inject('/')).headers['content-security-policy'];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|https:/);
});
