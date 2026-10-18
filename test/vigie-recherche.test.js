import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, VIGIE_KEYS } from './helpers.js';
import { EVENTS } from '../server/securite/vocabulaire.js';

// Recherche (registre docs/etudes/vigie-besoins-des-briques.md, BV-8 et BV-9) : une saisie que le formulaire ne peut pas
// produire (plus de 100 caractères, « q » répété) est coupée comme avant et signalée à la Vigie (input_validation_fail,
// DS12), sans la saisie elle-même ; au-delà de 60 recherches en 10 minutes par adresse, 429 et excess_rate_limit_exceeded.
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

// Vigie simulée : vérifie la signature de chaque lot et garde les événements reçus (comme test/vigie-emission.test.js).
function fakeVigie() {
  const v = { events: [] };
  v.send = async (body, headers) => {
    const expected = crypto.createHmac('sha256', KEY).update(`${headers['x-vigie-ts']}.${headers['x-vigie-nonce']}.${body}`).digest('hex');
    assert.equal(headers['x-vigie-sig'], expected, 'signature du lot');
    v.events.push(...JSON.parse(body).lot);
  };
  v.of = type => v.events.filter(e => e.type === type);
  return v;
}
// vigie : true (Vigie simulée) ou false (sans Vigie, même sous npm run test:vigie).
async function site(t, { vigie = true } = {}) {
  const fake = fakeVigie();
  const c = vigie ? await setup(t, { seeded: true, env: VIGIE, vigieOptions: { send: fake.send, timers: false, pollDecisions: false } })
    : await setup(t, { seeded: true, env: { VIGIE_URL: '' } });
  const flush = async () => { c.app.securite.runTasks(); c.app.securite.retryNow(); await c.app.securite.flush(); return fake; };
  // Une adresse par requête : les signalements d'une même adresse sont regroupés par la Vigie (5 minutes).
  let n = 0;
  const get = (url, headers = {}) => c.app.inject({ url, remoteAddress: `198.51.100.${++n}`, headers: { 'user-agent': UA, ...headers } });
  const from = (url, ip) => c.app.inject({ url, remoteAddress: ip, headers: { 'user-agent': UA } });
  return { ...c, flush, get, from };
}

const searchFails = v => v.of('input_validation_fail').filter(e => e.origine.emetteur === 'server/routes/public.js · recherche');

test('BV-8 : saisie de recherche hors formulaire coupée comme avant, signalée sans la saisie (DS12)', async t => {
  const c = await site(t);
  const long = 'brume'.repeat(25);                                   // 125 caractères
  const r = await c.get(`/recherche?q=${long}`);
  assert.equal(r.statusCode, 200);
  assert.ok(r.body.includes(`value="${long.slice(0, 100)}"`), 'saisie coupée à 100 caractères, comme avant');
  assert.equal((await c.get('/recherche?q=brume&q=loire')).statusCode, 200);
  // Saisies que le formulaire produit : rien.
  for (const q of ['brume', 'x'.repeat(100), '']) assert.equal((await c.get(`/recherche?q=${q}`)).statusCode, 200, q);
  assert.equal((await c.get('/recherche')).statusCode, 200);
  // Saisie malveillante et longue : déjà signalée par le crochet commun (DS11), pas une deuxième fois ici.
  assert.equal((await c.get(`/recherche?q=${encodeURIComponent('<script>alert(1)</script>' + 'a'.repeat(120))}`)).statusCode, 200);
  const v = await c.flush();
  const got = searchFails(v);
  assert.deepEqual(got.map(e => [e.detail.longueur, e.detail.nombre_q]), [[125, 1], [5, 2]]);
  for (const e of got) {
    assert.equal(e.detail.raison, 'saisie de recherche hors formulaire');
    assert.equal(e.origine.composant, 'site · public');
    assert.equal(e.severity, EVENTS.input_validation_fail.severity);
    assert.ok(!JSON.stringify(e.detail).includes('brume'), 'jamais la saisie elle-même');
  }
  assert.ok(v.of('malicious_input').length >= 1, 'la saisie malveillante reste signalée par le crochet commun');
});

test('BV-9 : au-delà de 60 recherches en 10 minutes par adresse, 429 et signalement ; message en v1 et en v2, 3 langues', async t => {
  const c = await site(t);
  const ip = '203.0.113.7';
  for (let i = 0; i < 60; i++) assert.equal((await c.from(`/recherche?q=brume${i % 3}`, ip)).statusCode, 200, `recherche ${i + 1}`);
  // La page sans saisie ne compte pas.
  assert.equal((await c.from('/recherche', ip)).statusCode, 200);
  const over = await c.from('/recherche?q=brume', ip);
  assert.equal(over.statusCode, 429);
  assert.ok(over.body.includes('Beaucoup de recherches en peu de temps'), 'message en v1');
  assert.ok(over.body.includes('value="brume"'), 'la saisie reste dans le champ');
  assert.ok(!/class="tile"|class="rangee/.test(over.body), 'pas de résultats');
  c.app.publicVersion.save('v2');
  const v2 = await c.from('/en/recherche?q=fog', ip);
  assert.equal(v2.statusCode, 429);
  assert.ok(v2.body.includes('Many searches in a short time'), 'message en v2, en anglais');
  assert.ok((await c.from('/de/recherche?q=nebel', ip)).body.includes('Viele Suchen in kurzer Zeit'));
  // Une autre adresse n'est pas touchée.
  assert.equal((await c.from('/recherche?q=brume', '203.0.113.8')).statusCode, 200);
  const v = await c.flush();
  const lim = v.of('excess_rate_limit_exceeded').filter(e => e.origine.emetteur === 'server/routes/public.js · recherche');
  assert.ok(lim.length >= 1, 'limite signalée');
  assert.deepEqual(lim[0].detail, { limite: 'recherche' });
});

test('sans Vigie : mêmes pages, même limite, rien d’émis', async t => {
  const c = await site(t, { vigie: false });
  assert.equal((await c.get(`/recherche?q=${'x'.repeat(150)}`)).statusCode, 200);
  const ip = '203.0.113.9';
  for (let i = 0; i < 60; i++) await c.from('/recherche?q=brume', ip);
  assert.equal((await c.from('/recherche?q=brume', ip)).statusCode, 429);
});
