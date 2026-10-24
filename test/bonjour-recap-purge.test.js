import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

const TTL = 15 * 60 * 1000;
const cookieOf = res => res.cookies.find(c => c.name === 'bonjour_recap')?.value;

test('récapitulatifs : effacement réel à leur échéance, sans nouvelle lecture ni nouvel envoi', async t => {
  const { app, db } = await setup(t);
  db.prepare("INSERT INTO authors (slug, name) VALUES ('julien', 'Julien Exemple')").run();
  await app.ready();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const deleted = t.mock.method(Map.prototype, 'delete');
  const send = url => app.inject({ method: 'POST', url, payload: { photographer: 'J', met_on: 'hier', place: 'Angers', decision: 'refus' } });
  const first = await send('/bonjour');
  assert.equal(first.statusCode, 303);
  const a = cookieOf(first);
  assert.ok(a);
  t.mock.timers.tick(1000);
  const second = await send('/en/bonjour');
  assert.equal(second.statusCode, 303);
  const b = cookieOf(second);
  assert.ok(b && a !== b);
  deleted.mock.resetCalls();
  const wasDeleted = token => deleted.mock.calls.some(call => call.arguments[0] === token);

  t.mock.timers.tick(TTL - 1001);
  assert.equal(wasDeleted(a), false, 'le premier récapitulatif reste jusqu’à son échéance');
  assert.equal(wasDeleted(b), false);
  // Observer le retrait du jeton en mémoire sans appeler la page merci : un refus d’affichage ne suffirait pas.
  t.mock.timers.tick(1);
  assert.equal(wasDeleted(a), true, 'le premier récapitulatif est effacé à quinze minutes');
  assert.equal(wasDeleted(b), false, 'le second conserve ses quinze minutes propres');
  t.mock.timers.tick(1000);
  assert.equal(wasDeleted(b), true, 'le second est effacé sans aucune nouvelle requête');

  const expired = await app.inject({ url: '/en/bonjour/merci', cookies: { bonjour_recap: b } });
  assert.equal(expired.statusCode, 200);
  assert.doesNotMatch(expired.body, /pf-recap/);
});
