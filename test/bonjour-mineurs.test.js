import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { readDay, MAX_DATE } from '../server/date-libre.js';

// Page /bonjour : âge et nom du parent (les règles de l'app de terrain), date saisie en texte libre, récapitulatif après
// l'envoi (PLAN.md, point 8 ; maquette MQ-05, cadres 5, 11 et 13 ; registre de la Vigie, « Bonjour : mineurs et date
// libre », BV-31). Une personne de moins de 18 ans n'accepte jamais seule une publication ; un refus, si.
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const DATA_KEY = 'cle-des-donnees-personnelles-0123456789abcdef';
const TODAY = '2026-10-20';
const nb = s => s.replace(/[  ]/g, ' ');

async function site(t, { version = 'v2', vigie = false, dataKey = true } = {}) {
  const events = [];
  const c = await setup(t, { seeded: true, env: { ...(vigie ? VIGIE : {}), ...(dataKey ? { DATA_KEY } : {}) },
    ...(vigie ? { vigieOptions: { send: async body => { events.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false } } : {}) });
  c.app.publicVersion.save(version);
  const flush = async () => { c.app.securite.runTasks(); c.app.securite.retryNow(); await c.app.securite.flush(); return events; };
  let n = 0;
  const hello = (payload, { url = '/bonjour', ip = `198.51.100.${++n}`, cookies } = {}) => c.app.inject({ method: 'POST', url, payload, remoteAddress: ip, cookies });
  const row = ref => c.app.encounters.get(c.db.prepare('SELECT id FROM encounters WHERE ref = ?').pluck().get(ref));
  const raw = ref => c.db.prepare('SELECT adult, guardian, met_on FROM encounters WHERE ref = ?').get(ref);
  return { ...c, flush, events, hello, row, raw };
}
const cookieOf = res => {
  const set = [].concat(res.headers['set-cookie'] || []).find(h => h.startsWith('bonjour_recap='));
  return set ? { header: set, value: set.split(';')[0].split('=')[1] } : null;
};

// ---------- la date en texte libre ----------

test('date libre : formats français, anglais et allemand, lus en AAAA-MM-JJ', () => {
  const cases = [
    ['14/10/2026', 'fr', '2026-10-14'], ['14.10.2026', 'de', '2026-10-14'], ['14-10-2026', 'fr', '2026-10-14'], ['2026-10-14', 'en', '2026-10-14'],
    ['14/10/26', 'fr', '2026-10-14'], ['14 10', 'fr', '2026-10-14'],
    ['12 mars', 'fr', '2026-03-12'], ['le 1er mai', 'fr', '2026-05-01'], ['mercredi 14 octobre 2026', 'fr', '2026-10-14'], ['14 Octobre 2026', 'fr', '2026-10-14'],
    ['3 déc. 2025', 'fr', '2025-12-03'], ['15 août', 'fr', '2026-08-15'], ['12 février 2024', 'fr', '2024-02-12'],
    ['March 12, 2026', 'en', '2026-03-12'], ['12 March 2026', 'en', '2026-03-12'], ['3rd December', 'en', '2025-12-03'], ['Dec 3 2025', 'en', '2025-12-03'],
    ['Wednesday 14 October', 'en', '2026-10-14'], ['the 2nd of May', 'en', '2026-05-02'],
    ['12. März', 'de', '2026-03-12'], ['Mittwoch, 14. Oktober 2026', 'de', '2026-10-14'], ['3. Dezember 2025', 'de', '2025-12-03'], ['am 1. Mai', 'de', '2026-05-01'],
    // Jours relatifs, avec ou sans moment de la journée.
    ['hier', 'fr', '2026-10-19'], ['hier soir', 'fr', '2026-10-19'], ["aujourd'hui", 'fr', TODAY], ['aujourd’hui', 'fr', TODAY], ['avant-hier', 'fr', '2026-10-18'],
    ['yesterday', 'en', '2026-10-19'], ['yesterday evening', 'en', '2026-10-19'], ['last night', 'en', '2026-10-19'], ['today', 'en', TODAY],
    ['the day before yesterday', 'en', '2026-10-18'],
    ['gestern', 'de', '2026-10-19'], ['gestern Abend', 'de', '2026-10-19'], ['gestern Morgen', 'de', '2026-10-19'], ['heute', 'de', TODAY], ['vorgestern', 'de', '2026-10-18'],
    // Le mois en chiffres qui ne se lit qu'au mois d'abord ; 29 février sans année : la dernière année bissextile.
    ['10/14/2026', 'fr', '2026-10-14'], ['10/14/2026', 'en', '2026-10-14'], ['29/02', 'fr', '2024-02-29'], ['29/02/2024', 'fr', '2024-02-29'],
    // Sans année : la dernière fois que ce jour est passé.
    ['25/12', 'fr', '2025-12-25'], ['20/10', 'fr', TODAY], ['21 octobre', 'fr', '2025-10-21'],
  ];
  for (const [input, lang, day] of cases) assert.deepEqual(readDay(input, { lang, today: TODAY }), { day }, `${lang} « ${input} »`);
  // Rien de saisi : rien à lire.
  for (const v of [undefined, null, '', '   ']) assert.equal(readDay(v, { today: TODAY }), null);
});

test('date libre : ambiguïtés, dates impossibles, à venir, illisibles, trop longues', () => {
  const err = (input, lang = 'fr') => readDay(input, { lang, today: TODAY })?.error;
  // « 03/12/2025 » : le 3 décembre en France et en Allemagne, ambigu en anglais (Royaume-Uni ou États-Unis).
  assert.deepEqual(readDay('03/12/2025', { lang: 'fr', today: TODAY }), { day: '2025-12-03' });
  assert.deepEqual(readDay('03.12.2025', { lang: 'de', today: TODAY }), { day: '2025-12-03' });
  assert.equal(err('03/12/2025', 'en'), 'date_ambigue');
  assert.equal(err('5/6', 'en'), 'date_ambigue');
  assert.deepEqual(readDay('12/12/2025', { lang: 'en', today: TODAY }), { day: '2025-12-12' }, 'même jour et même mois : rien d’ambigu');
  assert.deepEqual(readDay('3 December 2025', { lang: 'en', today: TODAY }), { day: '2025-12-03' }, 'le mois en lettres lève l’ambiguïté');
  for (const s of ['31/02/2026', '30 février', '31/04', '29/02/2025', '00/10/2026', '31 juin 2026', '1999-05-01', '14/10/1999']) assert.equal(err(s), 'date_impossible', s);
  for (const s of ['21/10/2026', 'demain', 'tomorrow', 'morgen', '2027-01-01', '14 octobre 2027']) assert.equal(err(s, s === 'tomorrow' ? 'en' : s === 'morgen' ? 'de' : 'fr'), 'date_future', s);
  for (const s of ['banane', '14h', '45/13', '13/13/2026', '2026-1-1-1', 'mars avril', 'hier 14/10', '12 mars 2026 2027', '1/2/3/4', '12345', 'octobre', '<script>', "'; DROP TABLE"]) assert.equal(err(s), 'date', s);
  // Au-delà de 40 signes (le maxlength de la page) : refusé avant toute lecture.
  assert.deepEqual(readDay('1'.repeat(MAX_DATE + 1), { today: TODAY }), { error: 'date', tooLong: true });
  assert.deepEqual(readDay(`14/10/2026${' '.repeat(MAX_DATE - 10)}`, { today: TODAY }), { day: '2026-10-14' });
});

test('date libre : temps borné face aux saisies hostiles (retour arrière, longueur)', () => {
  const hostile = [
    '1/'.repeat(20), '1 '.repeat(20), 'a'.repeat(40), '1er'.repeat(13), `${'9'.repeat(39)}x`, '- - - - - - - - - - - - - - - - - - - - ',
    'é'.repeat(40), '́'.repeat(40), '12 mars '.repeat(5), `${'1'.repeat(1e6)}`, `${'1/'.repeat(5e5)}`, 'hier '.repeat(8),
  ];
  const t0 = process.hrtime.bigint();
  let n = 0;
  for (let i = 0; i < 10000; i++) for (const s of hostile) { readDay(s, { lang: 'en', today: TODAY }); n++; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 3000, `${n} saisies hostiles en ${ms.toFixed(0)} ms`);
  // Une saisie d'un million de signes coûte autant qu'une courte : la longueur est lue d'abord.
  const one = s => { const a = process.hrtime.bigint(); for (let i = 0; i < 2000; i++) readDay(s, { today: TODAY }); return Number(process.hrtime.bigint() - a) / 1e6; };
  assert.ok(one('1'.repeat(1e6)) < one('14/10/2026') * 20 + 50, 'saisie énorme refusée aussitôt');
});

// ---------- âge, parent, accord ----------

test('accord : âge exigé ; avant 18 ans, le nom du parent ; un mineur n’accepte pas seul, un refus si', async t => {
  const c = await site(t);
  const count = () => c.db.prepare('SELECT COUNT(*) FROM encounters').pluck().get();
  const base = { decision: 'accord', scope_site: 'on', name: 'Léa', email: 'lea@exemple.fr' };
  // Accord sans âge : refusé, rien n'est enregistré.
  let r = await c.hello({ ...base, ref: 'J-0300' });
  assert.equal(r.statusCode, 422);
  assert.match(nb(r.body), /<b>Erreur :<\/b> dites-nous si vous avez 18 ans ou plus/);
  assert.equal(count(), 0);
  // Moins de 18 ans, sans le nom du parent : refusé (la personne n'accepte pas seule).
  r = await c.hello({ ...base, ref: 'J-0300', adult: 'non' });
  assert.equal(r.statusCode, 422);
  assert.match(nb(r.body), /<b>Erreur :<\/b> avant 18 ans, la publication se décide avec un parent : indiquez son nom/);
  assert.match(r.body, /<input id="bj-age-non" type="radio" name="adult" value="non" data-revele checked/);
  assert.equal(count(), 0);
  // Nom du parent fait d'espaces : comme absent.
  assert.equal((await c.hello({ ...base, ref: 'J-0300', adult: 'non', guardian: '   ' })).statusCode, 422);
  // Avec le parent : enregistré, comme dans l'app (adult 0, guardian).
  r = await c.hello({ ...base, ref: 'J-0300', adult: 'non', guardian: 'Anne Martin (mère)' });
  assert.equal(r.statusCode, 303);
  let e = c.row('J-0300');
  assert.deepEqual([e.adult, e.guardian, e.consent_source, e.consent.site], [0, 'Anne Martin (mère)', 'en_ligne', true]);
  // 18 ans ou plus : enregistré ; le nom d'un parent tapé quand même n'est pas gardé.
  r = await c.hello({ ...base, ref: 'J-0301', adult: 'oui', guardian: 'Quelqu’un' });
  assert.equal(r.statusCode, 303);
  e = c.row('J-0301');
  assert.deepEqual([e.adult, e.guardian], [1, '']);
  // Un refus, lui, peut venir d'une personne mineure seule, sans âge ni parent ; sans accord, l'âge n'est pas gardé.
  r = await c.hello({ ref: 'J-0302', decision: 'refus', adult: 'non' });
  assert.equal(r.statusCode, 303);
  e = c.row('J-0302');
  assert.deepEqual([e.refused, e.adult, e.guardian], [1, null, '']);
  r = await c.hello({ ref: 'J-0303', wants_photo: 'on', email: 'x@exemple.fr', adult: 'oui' });
  assert.equal(c.row('J-0303').adult, null, 'recevoir la photo : âge non gardé');
  // L'historique et l'export disent la tranche d'âge, comme pour l'app.
  const ev = c.app.encounters.events(c.row('J-0300').id).at(-1);
  assert.deepEqual([ev.kind, ev.detail.adult, ev.detail.guardian], ['visiteur', 0, 'Anne Martin (mère)']);
  const x = c.app.encounters.exportData(c.row('J-0300').id).data;
  assert.deepEqual([x.majeur, x.parent], [false, 'Anne Martin (mère)']);
});

test('âge et parent chiffrés au repos (DATA_KEY), comme l’app ; rattrapés au démarrage ; effacés avec la rencontre', async t => {
  const c = await site(t);
  await c.hello({ ref: 'J-0310', decision: 'accord', scope_site: 'on', name: 'Léa', email: 'lea@exemple.fr', adult: 'non', guardian: 'Anne Martin' });
  const raw = c.raw('J-0310');
  assert.match(String(raw.adult), /^enc1:/, 'âge chiffré');
  assert.match(raw.guardian, /^enc1:/, 'parent chiffré');
  assert.doesNotMatch(JSON.stringify(c.db.prepare('SELECT * FROM encounters').all()), /Anne Martin/);
  assert.doesNotMatch(JSON.stringify(c.db.prepare('SELECT detail FROM encounter_events').all()), /Anne Martin/, 'historique chiffré');
  // Une ligne restée en clair (clé ajoutée après coup) : chiffrée au démarrage, âge compris.
  const id = c.row('J-0310').id;
  c.db.prepare('UPDATE encounters SET adult = 1 WHERE id = ?').run(id);
  assert.equal(c.db.prepare('SELECT typeof(adult) FROM encounters WHERE id = ?').pluck().get(id), 'integer');
  assert.ok(c.app.encounters.sealExisting() >= 1);
  assert.match(String(c.db.prepare('SELECT adult FROM encounters WHERE id = ?').pluck().get(id)), /^enc1:/);
  assert.equal(c.app.encounters.get(id).adult, 1);
  // Effacement à la demande : âge et parent partent avec la rencontre.
  c.app.encounters.erase(id);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounters WHERE id = ?').pluck().get(id), 0);
});

test('sans le code de la carte : l’âge et le parent d’une rencontre établie ne changent pas', async t => {
  const c = await site(t);
  const code = c.app.encounters.codeOf('J-0320');
  await c.hello({ ref: `J-0320-${code}`, decision: 'accord', scope_site: 'on', name: 'Léa', email: 'lea@exemple.fr', adult: 'non', guardian: 'Anne Martin' });
  // Un tiers qui tape la référence seule (numéros qui se suivent) : rien ne change, la demande est gardée à vérifier.
  const r = await c.hello({ ref: 'J-0320', decision: 'accord', scope_site: 'on', name: 'Autre', email: 'autre@exemple.fr', adult: 'oui' });
  assert.equal(r.statusCode, 303);
  const e = c.row('J-0320');
  assert.deepEqual([e.adult, e.guardian, e.name], [0, 'Anne Martin', 'Léa']);
  assert.equal(c.app.encounters.events(e.id).at(-1).detail.non_verifiee, true);
  // Sur une demande précédente sans code (non établie) : pas remplacés non plus.
  await c.hello({ ref: 'J-0321', decision: 'accord', scope_site: 'on', name: 'Paul', email: 'paul@exemple.fr', adult: 'non', guardian: 'Marc' });
  await c.hello({ ref: 'J-0321', decision: 'accord', scope_site: 'on', name: 'Paul', email: 'paul@exemple.fr', adult: 'non', guardian: 'Un autre' });
  assert.equal(c.row('J-0321').guardian, 'Marc');
  assert.equal(c.app.encounters.events(c.row('J-0321').id).at(-1).detail.non_verifiee, true);
});

// ---------- la date sur la page ----------

test('date libre sur la page : lue, enregistrée en AAAA-MM-JJ, erreurs sous le champ', async t => {
  const c = await site(t);
  const thisYear = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(Date.now()).slice(0, 4);
  let r = await c.hello({ photographer: 'J', met_on: '2/1', place: 'Angers', wants_photo: 'on', email: 'a@exemple.fr' });
  assert.equal(r.statusCode, 303);
  const met = c.db.prepare("SELECT met_on FROM encounters ORDER BY id DESC LIMIT 1").pluck().get();
  assert.match(met, new RegExp(`^(${thisYear}|${Number(thisYear) - 1})-01-02$`), '« 2/1 » : le 2 janvier');
  // Date illisible : l'erreur la nomme, sous le champ, et le dépliant est ouvert ; la saisie est gardée.
  r = await c.hello({ met_on: 'mardi prochain', place: 'Angers', wants_photo: 'on', email: 'a@exemple.fr' });
  assert.equal(r.statusCode, 422);
  let b = nb(r.body);
  assert.match(b, /<title>Erreur : date de la rencontre · Je vous ai photographié · Test<\/title>/);
  assert.match(b, /<details class="depliant" open>/);
  assert.match(b, /<input id="bj-date" name="met_on" value="mardi prochain" maxlength="40" autocomplete="off" aria-describedby="err-met_on bj-date-aide" aria-invalid="true" autofocus>/);
  assert.match(b, /<p class="champ-err" id="err-met_on">.*<b>Erreur :<\/b> date illisible : écrivez-la par exemple 14\/10\/2026/);
  assert.doesNotMatch(b, /id="err-where"/, 'le lieu est donné : seule la date est en cause');
  // En anglais, une date ambiguë demande le mois en lettres.
  r = await c.hello({ met_on: '03/12/2025', place: 'Angers', wants_photo: 'on', email: 'a@exemple.fr' }, { url: '/en/bonjour' });
  assert.match(nb(r.body), /Ambiguous date: write the month in words/);
  // En allemand, une date à venir.
  r = await c.hello({ met_on: '24.12.2099', place: 'Köln', wants_photo: 'on', email: 'a@exemple.fr' }, { url: '/de/bonjour' });
  assert.match(nb(r.body), /Dieses Datum liegt in der Zukunft/);
  // Sans lieu ni carte, avec une date illisible : les deux points.
  r = await c.hello({ met_on: 'xyz', wants_photo: 'on', email: 'a@exemple.fr' });
  b = nb(r.body);
  assert.deepEqual([...b.match(/<section class="resume"[\s\S]*?<\/section>/)[0].matchAll(/href="#([\w-]+)"/g)].map(m => m[1]), ['bj-date', 'bj-date']);
});

// ---------- récapitulatif ----------

test('récapitulatif après l’envoi : rien dans l’adresse, un cookie de 15 minutes, ni nom, ni adresse, ni parent', async t => {
  const c = await site(t);
  const r = await c.hello({ ref: 'J-0330', decision: 'accord', scope_site: 'on', scope_name: 'on', name: 'Claire Exemple', email: 'claire.exemple@example.org',
    adult: 'non', guardian: 'Anne Exemple', met_on: '14/10/2026', met_time: '18h15', place: 'quai Ligny, Angers', wants_photo: 'on', message: 'Merci !' });
  assert.equal(r.statusCode, 303);
  assert.equal(r.headers.location, '/bonjour/merci?ref=J-0330', 'la référence seule dans l’adresse');
  for (const v of ['Claire', 'claire.exemple', 'Anne', 'Ligny', '2026-10-14', 'adult', 'accord']) assert.ok(!r.headers.location.includes(v), v);
  const k = cookieOf(r);
  assert.ok(k, 'cookie du récapitulatif');
  assert.match(k.value, /^[\w-]{22}$/, 'un numéro tiré au hasard, rien d’autre');
  assert.match(k.header, /Max-Age=900/);
  assert.match(k.header, /Path=\/bonjour/);
  assert.match(k.header, /HttpOnly/);
  assert.match(k.header, /SameSite=Lax/);
  const page = nb((await c.app.inject({ url: r.headers.location, cookies: { bonjour_recap: k.value } })).body);
  const recap = page.match(/<section class="pf-recap"[\s\S]*?<\/section>/)?.[0];
  assert.ok(recap, 'récapitulatif montré');
  assert.match(recap, /<h2 id="recap-t">Ce que vous nous avez envoyé<\/h2>/);
  assert.match(recap, /<dd class="donnee">J-0330<\/dd>/);
  assert.match(recap, /<dt>Rencontre<\/dt><dd>mercredi 14 octobre 2026, vers 18 h 15, quai Ligny, Angers<\/dd>/);
  assert.match(recap, /recevoir la photo par e-mail ; sa publication sur le site, avec votre prénom ; votre message nous est transmis/);
  assert.match(recap, /<dt>Âge<\/dt><dd>moins de 18 ans, avec l’accord de votre parent<\/dd>/);
  for (const v of ['Claire', 'claire.exemple', 'Anne', 'Merci !']) assert.ok(!page.includes(v), `« ${v} » absent de la page`);
  assert.match(page, /Nous n’envoyons pas d’accusé de réception par e-mail : le photographe vous écrit lui-même\./);
  // Sans le cookie, ou pour une autre référence : la page ordinaire, sans récapitulatif.
  const plain = nb((await c.app.inject(r.headers.location)).body);
  assert.doesNotMatch(plain, /pf-recap/);
  assert.match(plain, /<dd class="donnee">J-0330<\/dd>/);
  assert.match(plain, /Nous n’envoyons pas d’accusé de réception/);
  assert.doesNotMatch((await c.app.inject({ url: '/bonjour/merci?ref=J-0331', cookies: { bonjour_recap: k.value } })).body, /pf-recap/);
  assert.doesNotMatch((await c.app.inject({ url: '/bonjour/merci', cookies: { bonjour_recap: 'A'.repeat(22) } })).body, /pf-recap/, 'numéro inconnu');
  // Une demande gardée pour vérification (rencontre établie, sans code) : le même récapitulatif (aucun oracle).
  await c.hello({ ref: `J-0340-${c.app.encounters.codeOf('J-0340')}`, decision: 'refus' });
  const held = await c.hello({ ref: 'J-0340', decision: 'refus' });
  const fresh = await c.hello({ ref: 'J-0341', decision: 'refus' });
  const shown = async res => nb((await c.app.inject({ url: res.headers.location, cookies: { bonjour_recap: cookieOf(res).value } })).body).match(/<section class="pf-recap"[\s\S]*?<\/section>/)[0].replace(/J-034\d/g, 'J-034x');
  assert.equal(await shown(held), await shown(fresh));
  // En anglais et en allemand, la date en toutes lettres.
  for (const [url, re] of [['/en/bonjour', /Wednesday, 14 October 2026, around 18:15/], ['/de/bonjour', /Mittwoch, 14\. Oktober 2026, gegen 18:15 Uhr/]]) {
    const res = await c.hello({ photographer: 'J', met_on: '14/10/2026', met_time: '18:15', place: 'Angers', wants_photo: 'on', email: 'a@exemple.fr' }, { url });
    assert.equal(res.headers.location, `${url}/merci`);
    assert.match(cookieOf(res).header, new RegExp(`Path=${url.replace(/\//g, '\\/')}`));
    assert.match(nb((await c.app.inject({ url: res.headers.location, cookies: { bonjour_recap: cookieOf(res).value } })).body), re);
  }
});

test('récapitulatif : jamais au piège ni à l’autre site ; mémoire bornée', async t => {
  const c = await site(t, { vigie: true });
  const ok = { ref: 'J-0350', wants_photo: 'on', email: 'a@exemple.fr' };
  assert.equal(cookieOf(await c.hello({ ...ok, website: 'http://spam.example' })), null);
  const other = await c.app.inject({ method: 'POST', url: '/bonjour', payload: ok, remoteAddress: '198.51.100.200', headers: { origin: 'https://ailleurs.example' } });
  assert.equal(other.headers.location, '/bonjour/merci');
  assert.equal(cookieOf(other), null);
  // 600 envois (au-delà des 500 gardés) depuis autant d'adresses : les plus anciens partent, les récents restent.
  const tokens = [];
  for (let i = 0; i < 600; i++) tokens.push(cookieOf(await c.app.inject({ method: 'POST', url: '/bonjour', payload: { photographer: 'J', met_on: 'hier', place: 'Angers', decision: 'refus' }, remoteAddress: `10.1.${i >> 8}.${i & 255}` })).value);
  const page = async tk => (await c.app.inject({ url: '/bonjour/merci', cookies: { bonjour_recap: tk } })).body;
  assert.doesNotMatch(await page(tokens[0]), /pf-recap/, 'le plus ancien est parti');
  assert.match(await page(tokens.at(-1)), /pf-recap/, 'le plus récent est là');
});

// ---------- la Vigie ----------

test('Vigie : âge hors liste et saisies plus longues que la page (BV-31, DS12), sans la valeur ; noms et dates ordinaires n’émettent rien', async t => {
  const c = await site(t, { vigie: true });
  // Un nom propre ordinaire et des dates libres courantes : aucun malicious_input, aucun input_validation_fail.
  for (const [guardian, met_on] of [['Marie-Hélène d’Aubigné', '12 mars'], ["Marie-Hélène d'Aubigné", 'hier soir'], ['Jean-Noël Le Dœuff', '03/12/2025'], ['O’Neil-Brontë, Zoë', '14.10.2026'], ['Ana (mère)', '3rd December']]) {
    const r = await c.hello({ photographer: 'J', met_on, place: 'Quai de la Loire', decision: 'accord', scope_site: 'on', name: 'Léa', email: 'lea@exemple.fr', adult: 'non', guardian });
    assert.equal(r.statusCode, 303, `${guardian} · ${met_on}`);
  }
  let ev = await c.flush();
  assert.deepEqual(ev.filter(e => ['malicious_input', 'input_validation_fail'].includes(e.type)), [], 'rien de signalé pour des saisies ordinaires');
  // Âge hors liste (formulaire forgé), répété, ou en tableau : signalé, sans la valeur ; l'accord est refusé faute d'âge.
  const before = ev.length;
  let r = await c.hello({ ref: 'J-0360', decision: 'accord', scope_site: 'on', name: 'X', email: 'x@exemple.fr', adult: '16 ans' });
  assert.equal(r.statusCode, 422);
  r = await c.app.inject({ method: 'POST', url: '/bonjour', payload: 'ref=J-0361&wants_photo=on&email=x%40exemple.fr&adult=oui&adult=non', remoteAddress: '198.51.100.90', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.statusCode, 303, 'sans accord, l’envoi suit son cours');
  // Date et nom du parent plus longs que la page ne le permet.
  r = await c.hello({ photographer: 'J', met_on: `14/10/2026${' '.repeat(60)}`, place: 'Angers', wants_photo: 'on', email: 'x@exemple.fr' });
  assert.equal(r.statusCode, 422);
  await c.hello({ ref: 'J-0362', decision: 'accord', scope_site: 'on', name: 'X', email: 'x@exemple.fr', adult: 'non', guardian: 'P'.repeat(200) });
  ev = (await c.flush()).slice(before);
  const fails = ev.filter(e => e.type === 'input_validation_fail').map(e => ({ emetteur: e.origine.emetteur, ...e.detail }));
  assert.deepEqual(fails, [
    { emetteur: 'server/routes/public.js · bonjour', raison: 'valeur hors liste', formulaire: 'bonjour', champ: 'adult', longueur: 6 },
    { emetteur: 'server/routes/public.js · bonjour', raison: 'valeur hors liste', formulaire: 'bonjour', champ: 'adult', longueur: 7 },
    { emetteur: 'server/routes/public.js · bonjour', raison: 'saisie hors formulaire', formulaire: 'bonjour', champ: 'met_on', longueur: 70 },
    { emetteur: 'server/routes/public.js · bonjour', raison: 'saisie hors formulaire', formulaire: 'bonjour', champ: 'guardian', longueur: 200 },
  ]);
  assert.equal(c.row('J-0362').guardian, 'P'.repeat(80), 'nom du parent coupé, comme le nom');
  // Jamais une donnée personnelle dans un événement : âge, parent, date, lieu, nom, adresse.
  const all = JSON.stringify(await c.flush());
  for (const v of ['Marie-Hélène', 'Aubigné', 'Dœuff', 'Zoë', 'Quai de la Loire', '2026-03-12', '16 ans', 'lea@exemple.fr', '"adult":0', '"adult":"non"', 'PPPPPPPP']) assert.ok(!all.includes(v), `« ${v} » dans un événement`);
  // Une saisie piégée dans le nom du parent : signalée une fois par le crochet commun (DS11), pas en plus par BV-31.
  const b2 = (await c.flush()).length;
  await c.hello({ ref: 'J-0363', decision: 'accord', scope_site: 'on', name: 'X', email: 'x@exemple.fr', adult: 'non', guardian: `<script>alert(1)</script>${'x'.repeat(80)}` });
  ev = (await c.flush()).slice(b2);
  assert.deepEqual(ev.filter(e => e.type === 'malicious_input').map(e => e.detail.constats.map(k => [k.champ, k.longueur])), [[['body.guardian', 105]]]);
  assert.equal(ev.filter(e => e.type === 'input_validation_fail').length, 0);
});

test('Vigie : les accroches de /bonjour restent les mêmes, dans le même ordre, avec les nouveaux champs', async t => {
  const c = await site(t, { vigie: true });
  const forged = { ref: 'J-0370', decision: 'accord', scope_site: 'on', name: 'X', email: 'x@exemple.fr', adult: 'peut-être', met_on: 'x'.repeat(100) };
  // Champ piège : « merci », rien d'enregistré, seul le piège est signalé (les champs forgés ne sont pas lus).
  let r = await c.hello({ ...forged, website: 'http://spam.example' }, { ip: '198.51.100.70' });
  assert.deepEqual([r.statusCode, r.headers.location], [303, '/bonjour/merci']);
  // Autre site : idem, seule la provenance est signalée.
  r = await c.app.inject({ method: 'POST', url: '/bonjour', payload: forged, remoteAddress: '198.51.100.71', headers: { origin: 'https://ailleurs.example' } });
  assert.deepEqual([r.statusCode, r.headers.location], [303, '/bonjour/merci']);
  // Limite : 8 par heure ; la 9e, refusée, ne lit pas les champs.
  for (let i = 0; i < 8; i++) await c.hello({ email: 'x' }, { ip: '198.51.100.72' });
  r = await c.hello(forged, { ip: '198.51.100.72' });
  assert.equal(r.statusCode, 429);
  // Code de carte faux, avec un âge correct : jeton deviné, comme avant.
  const good = c.app.encounters.codeOf('J-0371');
  r = await c.hello({ ref: `J-0371-${good[0] === 'A' ? 'B' : 'A'}${good.slice(1)}`, decision: 'accord', scope_site: 'on', name: 'X', email: 'x@exemple.fr', adult: 'oui' }, { ip: '198.51.100.73' });
  assert.equal(r.statusCode, 422);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounters').pluck().get(), 0);
  const ev = await c.flush();
  assert.deepEqual(ev.filter(e => e.type === 'malicious_honeypot').map(e => e.detail.formulaire), ['bonjour']);
  assert.deepEqual(ev.filter(e => e.type === 'input_validation_fail').map(e => [e.origine.emetteur, e.detail.formulaire]), [['server/routes/public.js · provenance', 'bonjour']]);
  assert.deepEqual(ev.filter(e => e.type === 'excess_rate_limit_exceeded').map(e => e.detail.limite), ['bonjour']);
  assert.deepEqual(ev.filter(e => e.type === 'token_guess').map(e => e.detail.nature), ['code de carte']);
});

// ---------- les pages : v1, v2, v3, trois langues ----------

test('la page en v1, v2 et v3, en trois langues : âge, parent, date libre, mêmes champs', async t => {
  const c = await site(t, { dataKey: false });
  const L = { '': ['Votre âge', 'J’ai 18 ans ou plus', 'Nom du parent'], '/en': ['Your age', 'I am 18 or older', 'Parent’s name'], '/de': ['Ihr Alter', 'Ich bin 18 Jahre oder älter', 'Name des Elternteils'] };
  for (const version of ['v1', 'v2', 'v3']) {
    c.app.publicVersion.save(version);
    for (const [p, [age, adult, parent]] of Object.entries(L)) {
      const b = nb((await c.app.inject(`${p}/bonjour`)).body);
      assert.ok(b.includes(age) && b.includes(adult) && b.includes(parent), `${version} ${p || '/'} : libellés`);
      assert.equal(b.match(/<input[^>]*type="radio" name="adult" value="(?:oui|non)"/g)?.length, 2, `${version} ${p} : deux réponses`);
      assert.match(b, /<input[^>]*name="guardian"[^>]*maxlength="80" autocomplete="off"/, `${version} ${p} : parent`);
      assert.match(b, /<input(?![^>]*type="date")[^>]*name="met_on"[^>]*maxlength="40"/, `${version} ${p} : date en texte libre`);
      assert.doesNotMatch(b, /type="date"/);
      if (version !== 'v1') {
        assert.match(b, /<fieldset class="bloc groupe revele-si"/, `${version} ${p} : le parent sous « moins de 18 ans », sans script`);
        assert.match(b, /<input id="bj-age-non" type="radio" name="adult" value="non" data-revele>/);
        assert.match(b, /<div class="champ revele"><label for="bj-parent">/);
        // L'âge avant les usages (MQ-05, cadre 5).
        assert.ok(b.indexOf('name="adult"') < b.indexOf('name="decision"'));
      }
      assert.doesNotMatch(b, /\sstyle="/);
    }
  }
  // La règle de la feuille : le nom du parent caché tant que « moins de 18 ans » n'est pas coché, par :has.
  const css = (await import('node:fs')).readFileSync(new URL('../public/css/v2/formulaires.css', import.meta.url), 'utf8');
  assert.match(css, /@supports selector\(:has\(\*\)\) \{ \.revele-si:not\(:has\(input\[data-revele\]:checked\)\) \.revele \{ display: none; \} \}/);
});

// ---------- l'admin : la fiche d'une rencontre ----------

async function admin(c, sub, version) {
  const store = createSessionStore(c.db);
  c.app.accounts.ensure({ sub, name: sub, roles: ['admin'] });
  const token = store.create({ sub, name: sub, roles: [] });
  const csrf = c.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
  const cookies = { session: token };
  await c.app.inject({ method: 'POST', url: '/admin/version', cookies, headers: { accept: 'text/html' }, payload: { version, back: '/admin', _csrf: csrf } });
  await c.app.inject({ url: '/admin/aide', cookies });
  return { get: async url => { const r = await c.app.inject({ url, cookies, headers: { accept: 'text/html' } }); r.body = nb(r.body); return r; } };
}

test('fiche d’une rencontre (v1 et v2) : l’âge et le parent venus de la page, comme ceux de l’app ; mêmes lectures sensibles', async t => {
  const c = await site(t, { vigie: true });
  await c.hello({ ref: 'J-0380', decision: 'accord', scope_site: 'on', name: 'Léa Exemple', email: 'lea@exemple.fr', adult: 'non', guardian: 'Anne Exemple' });
  await c.hello({ ref: 'J-0381', decision: 'accord', scope_site: 'on', name: 'Paul Exemple', email: 'paul@exemple.fr', adult: 'oui' });
  const v1 = await admin(c, 'compte-v1', 'v1');
  const v2 = await admin(c, 'compte-v2', 'v2');
  for (const [ref, age, line] of [['J-0380', 'mineure · parent : Anne Exemple', 'moins de 18 ans, accord avec son parent'], ['J-0381', 'majeure', '18 ans ou plus']]) {
    const url = `/admin/rencontres/${c.row(ref).id}`;
    const before = (await c.flush()).length;
    const a = await v1.get(url);
    const mid = (await c.flush()).length;
    const b = await v2.get(url);
    const after = await c.flush();
    // Le compte en v1 voit la v1 (son gabarit), le compte en v2 la v2.
    assert.ok(a.body.includes('<div class="enc-grid">') && !a.body.includes('/static/admin/v2/v2.css'), `${ref} : v1`);
    assert.ok(b.body.includes('<div class="renc-grille">') && b.body.includes('/static/admin/v2/v2.css'), `${ref} : v2`);
    for (const r of [a, b]) {
      assert.equal(r.statusCode, 200);
      assert.match(r.body, new RegExp(`<dt>Âge</dt><dd>${age}</dd>`), `${ref} : âge dans la fiche`);
      assert.ok(r.body.includes(line), `${ref} : historique`);
    }
    const reads = list => list.filter(e => e.type === 'sensitive_read').map(e => e.detail);
    assert.deepEqual(reads(after.slice(before, mid)), reads(after.slice(mid)), `${ref} : mêmes lectures sensibles en v1 et en v2`);
    assert.deepEqual(reads(after.slice(mid)).map(d => [d.cible, d.objet]), [['/admin/rencontres/:id', 'rencontre']]);
  }
});
