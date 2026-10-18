import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, VIGIE_KEYS } from './helpers.js';
import { parisDay } from '../server/stats.js';
import { EVENTS } from '../server/securite/vocabulaire.js';

// Valeurs impossibles (registre docs/etudes/vigie-besoins-des-briques.md, BV-3) : un filtre de galerie (regard, série,
// ordre) ou un canal de partage qu'aucun lien ni bouton du site ne produit reste ignoré, comme avant, et il est signalé à
// la Vigie (input_validation_fail, cas DS12) ; sauf une série ou un photographe disparu depuis moins de 30 jours. Et le
// partage par QR signale sa limite atteinte, comme les autres partages (BV-6).
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const SLUG = 'brume-sur-la-loire';

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
  const share = (via, origin) => c.app.inject({ method: 'POST', url: `/photo/${SLUG}/partage`, remoteAddress: `198.51.100.${++n}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, ...(origin ? { origin } : {}) }, payload: `via=${encodeURIComponent(via)}` });
  return { ...c, flush, get, share };
}
const fails = v => v.of('input_validation_fail').map(e => [e.detail.champ, e.detail.valeur]);
// Page sans l'adresse courante, que recopie le sélecteur de langue (« vers= »).
const page = body => body.replace(/vers=[^"]*/g, 'vers=');
const daysAgo = n => parisDay(new Date(Date.now() - n * 864e5));

test('valeur de filtre inconnue : ignorée comme avant, signalée à la Vigie (vocabulaire, DS12) ; canal de partage inconnu aussi', async t => {
  const c = await site(t);
  const home = page((await c.get('/')).body);
  for (const [url, same] of [['/?regard=marcel', true], ['/?serie=inexistante', true], ['/?ordre=aleatoire', true], ['/en/?serie=inexistante', false],
    [`/photo/${SLUG}?serie=inexistante`, false], ['/serie/rue?ordre=pire', false], ['/auteur/julien?ordre=pire', false]]) {
    const r = await c.get(url);
    assert.equal(r.statusCode, 200, url);
    if (same) assert.equal(page(r.body), home, `${url} : même page que sans le filtre`);
  }
  // Canal de partage hors liste : 422 comme avant.
  assert.equal((await c.share('pigeon-voyageur')).statusCode, 422);
  const v = await c.flush();
  assert.deepEqual(fails(v), [['regard', 'marcel'], ['serie', 'inexistante'], ['ordre', 'aleatoire'], ['serie', 'inexistante'],
    ['serie', 'inexistante'], ['ordre', 'pire'], ['ordre', 'pire'], ['via', 'pigeon-voyageur']]);
  const e = v.of('input_validation_fail')[0];
  assert.equal(e.severity, EVENTS.input_validation_fail.severity);
  assert.equal(e.origine.composant, 'site · public');
  assert.equal(e.origine.emetteur, 'server/routes/public.js · filtres');
  assert.equal(e.detail.raison, 'valeur de filtre hors liste');
  assert.equal(v.of('input_validation_fail').at(-1).origine.emetteur, 'server/routes/public.js · partage');
  assert.equal(v.of('input_validation_fail').at(-1).detail.raison, 'valeur hors liste');
});

test('valeur longue coupée à 60 caractères ; valeurs connues, vides ou déjà signalées : rien de plus', async t => {
  const c = await site(t);
  assert.equal((await c.get(`/?serie=${'x'.repeat(200)}`)).statusCode, 200);
  // Connues : les liens du site (regard et série ensemble, ordre, photo dans une vue filtrée), canaux de la liste.
  for (const url of ['/?regard=julien&serie=rue', '/?regard=sebastien&ordre=recentes', '/serie/paysage?ordre=recentes', `/photo/${SLUG}?regard=sebastien&serie=paysage&ordre=recentes`,
    '/?regard=&serie=', `/photo/${SLUG}?partage=qr`]) assert.ok([200, 303].includes((await c.get(url)).statusCode), url);
  for (const via of ['copie', 'telephone', 'qr']) assert.equal((await c.share(via)).statusCode, 204, via);
  // /serie/<slug> et /auteur/<slug> ne lisent que l'ordre : un regard en trop n'y est pas un filtre.
  assert.equal((await c.get('/serie/rue?regard=marcel')).statusCode, 200);
  // Saisie malveillante : signalée par le crochet commun (DS11), pas une deuxième fois ici.
  assert.equal((await c.get('/?serie=%3Cscript%3Ealert(1)%3C/script%3E')).statusCode, 200);
  assert.equal((await c.share('javascript:alert(1)')).statusCode, 422);
  // Partage refusé par gate() (autre site) : signalé une fois, par gate().
  assert.equal((await c.share('copie', 'https://ailleurs.example')).statusCode, 429);
  const v = await c.flush();
  assert.deepEqual(fails(v), [['serie', 'x'.repeat(60)], [undefined, undefined]]);
  assert.equal(v.of('input_validation_fail')[1].detail.formulaire, 'partage');
  assert.equal(v.of('malicious_input').length, 2);
});

test('série ou photographe disparu depuis moins de 30 jours (vu par la mesure d’audience) : pas signalé ; au-delà, signalé', async t => {
  const c = await site(t);
  // La page de la série et celle du photographe ont été vues (mesure d'audience), puis leur adresse a changé.
  assert.equal((await c.get('/serie/rue')).statusCode, 200);
  assert.equal((await c.get('/auteur/julien')).statusCode, 200);
  assert.ok(c.db.prepare("SELECT COUNT(*) FROM stats_pages WHERE page IN ('serie:rue', 'auteur:julien')").pluck().get() === 2, 'pages comptées');
  c.db.prepare("UPDATE categories SET slug = 'la-rue' WHERE slug = 'rue'").run();
  c.db.prepare("UPDATE authors SET slug = 'julien-m' WHERE slug = 'julien'").run();
  // Une série supprimée il y a plus de 30 jours (dernière visite à 40 jours) ; une autre il y a 29 jours.
  c.db.prepare('INSERT INTO stats_pages (day, page, views) VALUES (?, ?, 3), (?, ?, 1)').run(daysAgo(40), 'serie:ancienne', daysAgo(29), 'serie:recente');
  for (const url of ['/?serie=rue', '/?regard=julien', `/photo/${SLUG}?regard=julien&serie=rue`, '/?serie=recente', '/?serie=ancienne', '/?regard=ancienne'])
    assert.equal((await c.get(url)).statusCode, 200, url);
  const v = await c.flush();
  assert.deepEqual(fails(v), [['serie', 'ancienne'], ['regard', 'ancienne']]);
});

test('sans Vigie : mêmes pages, mêmes réponses, rien n’est émis', async t => {
  const c = await site(t, { vigie: false });
  assert.equal(c.app.securite.enabled, false);
  const home = page((await c.get('/')).body);
  for (const url of ['/?regard=marcel', '/?serie=inexistante', '/?ordre=aleatoire']) {
    const r = await c.get(url);
    assert.equal(r.statusCode, 200, url);
    assert.equal(page(r.body), home, url);
  }
  assert.equal((await c.share('pigeon-voyageur')).statusCode, 422);
  assert.equal((await c.share('copie')).statusCode, 204);
});

test('partage par QR : limite atteinte signalée (excess_rate_limit_exceeded, canal qr), redirection inchangée ; robots non comptés', async t => {
  const c = await site(t);
  const scan = (ua = UA) => c.app.inject({ url: `/photo/${SLUG}?partage=qr`, remoteAddress: '203.0.113.50', headers: { 'user-agent': ua } });
  for (let i = 0; i < 60; i++) assert.equal((await scan()).statusCode, 303);
  let v = await c.flush();
  assert.equal(v.of('excess_rate_limit_exceeded').length, 0, 'sous la limite : rien');
  const r = await scan();
  assert.deepEqual([r.statusCode, r.headers.location], [303, `/photo/${SLUG}`]);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM photo_shares WHERE via = 'qr'").pluck().get() >= 1, true);
  // Un robot (aperçu de lien) n'est ni compté ni signalé.
  assert.equal((await scan('Slackbot-LinkExpanding 1.0')).statusCode, 303);
  v = await c.flush();
  const e = v.of('excess_rate_limit_exceeded');
  assert.equal(e.length, 1);
  assert.deepEqual(e[0].detail, { limite: 'partage', canal: 'qr' });
  assert.equal(e[0].origine.emetteur, 'server/routes/public.js · partage QR');
  assert.equal(e[0].severity, EVENTS.excess_rate_limit_exceeded.severity);
});
