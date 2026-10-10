import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { loadConfig } from '../server/config.js';

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

test('en ligne (HTTPS ou production), la config refuse les réglages de développement', () => {
  assert.throws(() => loadConfig({ PUBLIC_URL: 'https://photos.example' }), /COOKIE_SECRET/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /COOKIE_SECRET/);
  const secret = { COOKIE_SECRET: 'x'.repeat(32) };
  assert.throws(() => loadConfig({ ...secret, PUBLIC_URL: 'https://photos.example', OIDC_ISSUER: 'http://idp.example' }), /HTTPS/);
  const cfg = loadConfig({ ...secret, PUBLIC_URL: 'https://photos.example/' });
  assert.equal(cfg.publicUrl, 'https://photos.example');
  assert.equal(cfg.trustProxy, 'loopback,uniquelocal');
  assert.equal(loadConfig({}).trustProxy, false);
  assert.equal(loadConfig({ TRUST_PROXY: '10.0.0.2' }).trustProxy, '10.0.0.2');
});

test('pas de HSTS hors HTTPS', async t => {
  const { app } = await setup(t);
  assert.equal((await app.inject('/')).headers['strict-transport-security'], undefined);
});

test('CSS et JS sont versionnés par empreinte', async t => {
  const { app } = await setup(t);
  const html = (await app.inject('/')).body;
  const css = html.match(/href="(\/static\/css\/site\.css\?v=[0-9a-f]{10})"/)[1];
  assert.match(html, /src="\/static\/js\/site\.js\?v=[0-9a-f]{10}"/);
  assert.equal((await app.inject(css)).statusCode, 200);
});
