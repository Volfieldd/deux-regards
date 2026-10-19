import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE_CHARS, generatePassword, normalizePassword, showPassword, hashPassword, verifyPassword, parseHash, needsRehash, createPasswordGate } from '../server/passwords.js';
import { newLinkToken, parseDay, endOfDay, TOKEN_RE } from '../server/spaces.js';

// Mots de passe et jetons des galeries privées (annexe de sécurité, § 3.1 et § 3.2 ; T30, T31 ; G6, G14 à G18).

test('jeton du lien : 24 octets aléatoires en base64url, 32 caractères, 192 bits (G6)', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const tk = newLinkToken(); assert.match(tk, TOKEN_RE); assert.equal(Buffer.from(tk, 'base64url').length, 24); seen.add(tk); }
  assert.equal(seen.size, 200);
});

test('mot de passe : 12 caractères de CODE_CHARS, groupés par 4 ; saisie tolérante ; aucun signe ambigu (T30, G14, G15)', () => {
  assert.equal(CODE_CHARS.length, 31);
  assert.doesNotMatch(CODE_CHARS, /[01OIL]/);
  for (let i = 0; i < 200; i++) assert.match(generatePassword(), new RegExp(`^[${CODE_CHARS}]{4}-[${CODE_CHARS}]{4}-[${CODE_CHARS}]{4}$`));
  assert.ok(12 * Math.log2(31) > 59, '≥ 59 bits (CNIL : 50 bits avec un blocage après échecs)');
  assert.equal(normalizePassword(' k7qm p3xw-9tra '), 'K7QMP3XW9TRA');
  assert.equal(normalizePassword('x'.repeat(1000)).length, 200);
  assert.equal(showPassword('K7QM-P3XW-9TRA'), 'k7qm p3xw 9tra');
});

test('stockage : scrypt N = 2¹⁵, r = 8, p = 3, sel de 16 octets, format auto-décrit, comparaison en temps constant, re-hachage (T30, G17)', async () => {
  const h = await hashPassword('K7QM-P3XW-9TRA');
  assert.match(h, /^scrypt\$15\$8\$3\$[\w-]{22}\$[\w-]{43}$/);
  const p = parseHash(h);
  assert.equal(p.salt.length, 16);
  assert.equal(p.key.length, 32);
  assert.notEqual(await hashPassword('K7QM-P3XW-9TRA'), h, 'sel aléatoire');
  assert.equal(await verifyPassword('k7qm p3xw 9tra', h), true);
  assert.equal(await verifyPassword('K7QM-P3XW-9TRB', h), false);
  assert.equal(await verifyPassword('', h), false);
  assert.equal(await verifyPassword('K7QM-P3XW-9TRA', 'scrypt$40$8$3$x$y'), false);           // empreinte illisible
  assert.equal(needsRehash(h), false);
  const old = await hashPassword('K7QM-P3XW-9TRA', { logN: 12, r: 8, p: 1 });
  assert.equal(await verifyPassword('K7QM-P3XW-9TRA', old), true);                              // paramètres relus de l'empreinte
  assert.equal(needsRehash(old), true);
});

test('sémaphore : 2 calculs à la fois, 10 en attente, puis « plein » ; un seul calcul à la fois par accès (T31, G18)', async () => {
  const gate = createPasswordGate({ max: 2, queue: 10 });
  let running = 0, peak = 0;
  const slow = () => new Promise(resolve => { running++; peak = Math.max(peak, running); setTimeout(() => { running--; resolve(true); }, 20); });
  const jobs = [];
  for (let i = 0; i < 12; i++) { assert.equal(gate.reserve(i), null); jobs.push(gate.run(i, slow)); }
  assert.equal(gate.reserve(99), 'plein');
  await Promise.all(jobs);
  assert.equal(peak, 2);
  assert.equal(gate.reserve(1), null);
  assert.equal(gate.reserve(1), 'meme_acces');
  gate.cancel(1);
  assert.equal(gate.reserve(1), null);
  await gate.run(1, async () => { throw new Error('échec'); }).catch(() => {});
  assert.equal(gate.reserve(1), null, 'la clé est rendue même après une erreur');
});

test('dates libres de l’admin : « 30/11/2026 », « 30 nov. 2026 », « 2026-11-30 » ; fin de journée à Paris', () => {
  const ref = Date.parse('2026-10-16T10:00:00Z');
  for (const s of ['30/11/2026', '30 nov. 2026', '2026-11-30', '30.11.26', 'lundi 30 novembre 2026', '30 Nov 2026', '30. November 2026']) assert.equal(parseDay(s, ref), '2026-11-30', s);
  assert.equal(parseDay('15 janv.', ref), '2027-01-15');                                         // sans année : la prochaine
  for (const s of ['31/02/2026', 'demain', '', '1'.repeat(50)]) assert.equal(parseDay(s, ref), null, s);
  assert.equal(new Date(endOfDay('2026-11-30')).toISOString(), '2026-11-30T22:59:59.000Z');      // 23 h 59 à Paris (hiver)
  assert.equal(new Date(endOfDay('2026-07-14')).toISOString(), '2026-07-14T21:59:59.000Z');      // heure d'été
});
