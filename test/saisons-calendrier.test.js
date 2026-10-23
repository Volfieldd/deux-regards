import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSaisonDate, parseSaisonDate } from '../server/saisons-calendrier.js';

test('saisons : instants explicites indépendants du fuseau de la machine', () => {
  for (const [value, zone, iso] of [
    ['2026-01-10T12:30', 'Europe/Paris', '2026-01-10T11:30:00.000Z'],
    ['2026-07-10T12:30', 'Europe/Paris', '2026-07-10T10:30:00.000Z'],
    ['2026-10-23T12:30', 'Indian/Reunion', '2026-10-23T08:30:00.000Z'],
    ['2026-10-23T12:30', 'UTC', '2026-10-23T12:30:00.000Z'],
  ]) {
    const instant = parseSaisonDate(value, zone);
    assert.equal(new Date(instant).toISOString(), iso);
    assert.equal(formatSaisonDate(instant, zone), value);
  }
  assert.equal(formatSaisonDate(null, 'UTC'), '');
});

test('saisons : heures absentes ou doubles, calendrier et types invalides refusés', () => {
  assert.equal(parseSaisonDate('2026-03-29T02:30', 'Europe/Paris'), null);
  assert.equal(parseSaisonDate('2026-10-25T02:30', 'Europe/Paris'), null);
  for (const value of ['', null, [], {}, '2026-02-29T12:00', '2026-04-31T12:00', '2026-13-01T12:00', '2026-01-01T24:00', '2026-01-01T12:60', '2026-01-01T12:00Z', 'x'.repeat(10000)])
    assert.equal(parseSaisonDate(value, 'UTC'), null);
  assert.equal(new Date(parseSaisonDate('2028-02-29T12:00', 'UTC')).toISOString(), '2028-02-29T12:00:00.000Z');
});
