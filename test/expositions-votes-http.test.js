import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { setup } from './helpers.js';
import { as } from './carnet-helpers.js';
import { createSaisons } from '../server/saisons.js';
import { createSaisonsPubliques } from '../server/saisons-publiques.js';
import { variantName, widthsFor } from '../server/images.js';
import { voteCookieName, expositionVoteLinks, installExpositionVotes } from '../server/routes/expositions-votes.js';
import { NOTICE_VERSION, createVoteToken } from '../server/saisons-votes.js';

// La projection S2 de l’application garde son horloge réelle ; la marge maintient cette visite ouverte pendant
// que les bornes du vote sont exercées avec une horloge contrôlée, sans attendre la clôture.
const START = Math.floor((Date.now() - 60000) / 60000) * 60000, END = START + 7 * 86400000;
const proof = html => /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
const formProof = (html, action) => proof(html.slice(html.indexOf(`action="${action}"`)));
const voteSection = html => /<section[^>]*id="vote-consultatif"[^>]*>[\s\S]*?<\/section>/.exec(html)?.[0] || null;
const count = c => c.db.prepare('SELECT photo_id, total FROM saison_vote_totaux ORDER BY photo_id').all();
async function context(t, { encrypted = true, secure = false, realProposals = false, logger = false } = {}) {
  let clock = START - 1000, approved = [1, 2];
  const now = () => clock;
  const c = await setup(t, { env: { DATA_KEY: encrypted ? 'cle-test-votes-http-pour-base-jetable' : '', ...(secure ? { PUBLIC_URL: 'https://example.test', COOKIE_SECRET: 'secret-cookie-de-test-suffisamment-long' } : {}) },
    logger, votesOptions: { now, ...(realProposals ? {} : { approvedIds: () => approved }), timers: false } });
  const { app, db } = c;
  db.prepare("INSERT INTO authors (id, slug, name) VALUES (1, 'atelier-fictif', 'Atelier fictif')").run();
  db.prepare("INSERT INTO categories (id, slug, name) VALUES (1, 'serie-test', 'Série de test')").run();
  const add = db.prepare("INSERT INTO photos (id, slug, title, title_en, title_de, category_id, author_id, file, width, height, status, position, faces, alt_text) VALUES (?, ?, ?, ?, ?, 1, 1, ?, 1200, 800, 'published', ?, 0, 'Photographie neutre')");
  for (let id = 1; id <= 3; id++) add.run(id, `photo-${id}`, `Photo ${id} FR`, `Photo ${id} EN`, `Foto ${id} DE`, `neutre-${id}.jpg`, id);
  fs.mkdirSync(path.join(c.dir, 'variants'), { recursive: true });
  for (let id = 1; id <= 3; id++) fs.writeFileSync(path.join(c.dir, 'variants', variantName(`neutre-${id}.jpg`, widthsFor(1200).at(-1), 'webp', '')), 'variante neutre pour le contrôle de présence');
  app.saisons = createSaisons({ db, now, readiness: app.readiness });
  app.expositions = createSaisonsPubliques({ saisons: app.saisons, repo: app.publicRepo, readiness: app.readiness, storageDir: c.dir, now });
  const sid = app.saisons.create({ author_id: 1, title: 'Une exposition', title_en: 'An exhibition', title_de: 'Eine Ausstellung', intro: 'Une intention.', intro_en: 'An intention.', intro_de: 'Eine Absicht.', cover_id: 1, opens_at: START, closes_at: END });
  app.saisons.setPhotos(sid, [1, 2, 3]); app.saisons.schedule(sid);
  app.publicVersion.save('v2');
  clock = START;
  const root = `/exposition/${app.saisons.get(sid).slug}`;
  const origin = new URL(c.config.publicUrl).origin;
  const get = (url, cookies = {}) => app.inject({ url, cookies, headers: { accept: 'text/html' } });
  const post = (url, payload, cookies = {}, extraHeaders = {}) => app.inject({ method: 'POST', url, payload, cookies, headers: { origin, ...extraHeaders } });
  const name = voteCookieName(app, sid);
  return { ...c, sid, root, name, get, post, at: value => { clock = value; }, approve: ids => { approved = ids; } };
}
async function voted(c, id = 1, cookies = {}) {
  const url = `${c.root}/photo/photo-${id}/voter`, page = await c.get(url, cookies);
  assert.equal(page.statusCode, 200, page.body.slice(-600));
  const response = await c.post(url, { _csrf: proof(page.body), notice_version: NOTICE_VERSION, consent: 'oui' }, cookies);
  assert.equal(response.statusCode, 303, response.body.slice(-600));
  return { [c.name]: response.cookies.find(cookie => cookie.name === c.name).value };
}

test('V1 HTTP : information FR/EN/DE, case initiale non cochée et aucun cookie à la consultation', async t => {
  const c = await context(t);
  for (const [prefix, text] of [['', 'J’accepte le cookie'], ['/en', 'I agree to the cookie'], ['/de', 'Ich stimme dem Cookie']]) {
    const response = await c.get(`${prefix}${c.root}/photo/photo-1/voter`);
    assert.equal(response.statusCode, 200, response.body.slice(-600));
    assert.ok(response.body.includes(text));
    assert.match(response.body, /name="consent" value="oui" required/);
    assert.doesNotMatch(response.body, /name="consent"[^>]*checked/);
    assert.ok(proof(response.body));
    assert.ok(response.body.includes(NOTICE_VERSION));
    assert.match(response.headers['cache-control'], /private, no-store/);
    assert.equal(response.headers['x-robots-tag'], 'noindex');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
    assert.equal(response.cookies.length, 0);
  }
  assert.deepEqual(count(c), []);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM saison_vote_votants').pluck().get(), 0);
});

test('V1 HTTP : refus sans consentement puis premier vote, cookie borné et résultat réellement persisté', async t => {
  const c = await context(t), url = `${c.root}/photo/photo-1/voter`, page = await c.get(url);
  const refused = await c.post(url, { _csrf: proof(page.body), notice_version: NOTICE_VERSION });
  assert.equal(refused.statusCode, 422);
  assert.ok(refused.body.includes('Cochez la case'));
  assert.equal(refused.cookies.length, 0);
  assert.deepEqual(count(c), []);
  const cookies = await voted(c), raw = cookies[c.name];
  assert.match(raw, /^[A-Za-z0-9_-]{43}$/);
  const state = await c.get(url, cookies);
  assert.ok(state.body.includes('Votre vote pour cette photographie est enregistré.'));
  assert.doesNotMatch(state.body, /name="consent"/);
  assert.deepEqual(count(c), [{ photo_id: 1, total: 1 }]);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM accounts').pluck().get(), 0);
  assert.ok(!JSON.stringify(c.db.prepare('SELECT * FROM saison_vote_votants').all()).includes(raw));
});

test('V1 HTTP : cookie HTTPS HttpOnly SameSite, réutilisé entre langues et plusieurs photos', async t => {
  const c = await context(t, { secure: true }), url = `${c.root}/photo/photo-1/voter`, page = await c.get(url);
  const accepted = await c.post(url, { _csrf: proof(page.body), notice_version: NOTICE_VERSION, consent: 'oui' });
  assert.equal(accepted.statusCode, 303);
  const cookie = accepted.cookies.find(cookie => cookie.name === c.name);
  assert.ok(c.name.startsWith('__Host-'));
  assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, 'Lax'); assert.equal(cookie.path, '/');
  assert.equal(new Date(cookie.expires).getTime(), END);
  const cookies = { [c.name]: cookie.value }, secondUrl = `/de${c.root}/photo/photo-2/voter`;
  const second = await c.get(secondUrl, cookies);
  assert.doesNotMatch(second.body, /name="consent"/);
  const acceptedSecond = await c.post(secondUrl, { _csrf: proof(second.body), notice_version: NOTICE_VERSION }, cookies);
  assert.equal(acceptedSecond.statusCode, 303);
  assert.equal(acceptedSecond.headers.location, secondUrl);
  assert.equal(acceptedSecond.cookies[0].value, cookie.value);
  assert.equal(new Date(acceptedSecond.cookies[0].expires).getTime(), END);
  assert.deepEqual(count(c), [{ photo_id: 1, total: 1 }, { photo_id: 2, total: 1 }]);
});

test('V1 HTTP : doublon rejoué idempotent, sans nouveau suivi ni compteur supplémentaire', async t => {
  const c = await context(t), cookies = await voted(c), url = `${c.root}/photo/photo-1/voter`;
  const csrf = c.app.expositionVoteForms.csrf(`vote:${c.sid}:1`, cookies[c.name]);
  const stored = c.db.prepare('SELECT consentement FROM saison_vote_votants').pluck().get();
  c.at(START + 1000);
  for (let i = 0; i < 2; i++) assert.equal((await c.post(url, { _csrf: csrf, notice_version: NOTICE_VERSION }, cookies)).statusCode, 303);
  assert.deepEqual(count(c), [{ photo_id: 1, total: 1 }]);
  assert.equal(c.db.prepare('SELECT consentement FROM saison_vote_votants').pluck().get(), stored);
});

test('V1 HTTP : premier vote concurrent depuis le même formulaire sans cookie reste unique', async t => {
  const c = await context(t), url = `${c.root}/photo/photo-1/voter`, page = await c.get(url);
  const body = { _csrf: proof(page.body), notice_version: NOTICE_VERSION, consent: 'oui' };
  const responses = await Promise.all([c.post(url, body), c.post(url, body)]);
  assert.deepEqual(responses.map(response => response.statusCode), [303, 303]);
  const tokens = responses.map(response => response.cookies.find(cookie => cookie.name === c.name).value);
  assert.deepEqual({ jetons_distincts: new Set(tokens).size, totaux: count(c) }, { jetons_distincts: 1, totaux: [{ photo_id: 1, total: 1 }] });
  assert.equal(body._csrf.includes(tokens[0]), false, 'le jeton de vote ne figure jamais dans le défi public');
  assert.equal(body._csrf.split('.').at(-1) === tokens[0], false, 'le MAC du défi n’est jamais le jeton de vote');
  const cookies = { [c.name]: tokens[0] };
  const replay = await c.post(url, body, cookies);
  assert.equal(replay.statusCode, 303);
  assert.equal(replay.cookies.find(cookie => cookie.name === c.name).value === tokens[0], true);
  assert.deepEqual(count(c), [{ photo_id: 1, total: 1 }]);
  const other = { [c.name]: createVoteToken() };
  assert.equal((await c.post(url, body, other)).statusCode, 403);
});

test('V1 HTTP : provenance et CSRF refusés sans vote, cookie ni secret dans les événements', async t => {
  const c = await context(t), events = [];
  c.app.securite = { ...c.app.securite, emit: (type, event) => events.push({ type, detail: event.detail }) };
  const url = `${c.root}/photo/photo-1/voter`, page = await c.get(url), body = { _csrf: proof(page.body), notice_version: NOTICE_VERSION, consent: 'oui' };
  for (const headers of [{ origin: 'https://autre.test' }, { origin: 'https://autre.test', 'sec-fetch-site': 'same-origin' },
    { origin: 'null' }, { origin: 'null', 'sec-fetch-site': 'cross-site' }, { origin: 'null', 'sec-fetch-site': 'same-site' }, { origin: 'null', 'sec-fetch-site': 'none' },
    { origin: '' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]) {
    const response = await c.post(url, body, {}, headers);
    assert.equal(response.statusCode, 403);
    assert.equal(response.cookies.length, 0);
  }
  for (const csrf of ['', 'faux', ['répété']]) assert.equal((await c.post(url, { ...body, _csrf: csrf })).statusCode, 403);
  assert.deepEqual(count(c), []);
  assert.ok(events.length >= 8);
  assert.ok(events.every(event => event.type === 'input_validation_fail'));
  assert.ok(!JSON.stringify(events).includes(body._csrf));
  // Un POST natif sous no-referrer peut masquer Origin ; Fetch Metadata doit alors attester même origine.
  const native = await c.post(url, body, {}, { origin: 'null', 'sec-fetch-site': 'same-origin' });
  assert.equal(native.statusCode, 303);
  assert.deepEqual(count(c), [{ photo_id: 1, total: 1 }]);
});

test('V1 HTTP : défi lié à la photo, à l’action et au cookie, avec expiration sans cookie préalable', async t => {
  const c = await context(t), url = `${c.root}/photo/photo-1/voter`, page = await c.get(url), csrf = proof(page.body);
  assert.equal((await c.post(`${c.root}/photo/photo-2/voter`, { _csrf: csrf, notice_version: NOTICE_VERSION, consent: 'oui' })).statusCode, 403);
  assert.equal((await c.post(`${c.root}/participation/export`, { _csrf: csrf })).statusCode, 403);
  const cookies = await voted(c);
  assert.equal((await c.post(url, { _csrf: csrf, notice_version: NOTICE_VERSION }, cookies)).statusCode, 403);
  const other = { [c.name]: createVoteToken() }, second = await c.get(`${c.root}/photo/photo-2/voter`, cookies);
  assert.equal((await c.post(`${c.root}/photo/photo-2/voter`, { _csrf: proof(second.body), notice_version: NOTICE_VERSION, consent: 'oui' }, other)).statusCode, 403);
  c.at(START + 30 * 60 * 1000);
  assert.equal((await c.post(url, { _csrf: csrf, notice_version: NOTICE_VERSION, consent: 'oui' })).statusCode, 403);
  assert.deepEqual(count(c), [{ photo_id: 1, total: 1 }]);
});

test('V1 HTTP : retrait confirmé et export limités aux votes du navigateur courant', async t => {
  const c = await context(t), a = await voted(c), b = await voted(c), a2 = await voted(c, 2, a);
  assert.equal(a2[c.name], a[c.name]);
  const manage = `${c.root}/participation`, page = await c.get(manage, a), exportUrl = `${manage}/export`, withdrawUrl = `${manage}/retirer`;
  assert.ok(page.body.includes('Photo 1 FR')); assert.ok(page.body.includes('Photo 2 FR'));
  const exported = await c.post(exportUrl, { _csrf: formProof(page.body, exportUrl) }, a);
  assert.equal(exported.statusCode, 200);
  assert.deepEqual(exported.json(), { exposition_id: c.sid, photo_ids: [1, 2], consented: true, closes_at: END, closed: false, consent: { at: START, version: NOTICE_VERSION } });
  assert.equal(exported.headers['content-disposition'], 'attachment; filename="mes-votes.json"');
  assert.match(exported.headers['cache-control'], /no-store/);
  assert.ok(!exported.body.includes(a[c.name])); assert.ok(!exported.body.includes(b[c.name]));
  const withoutConfirmation = await c.post(withdrawUrl, { _csrf: formProof(page.body, withdrawUrl) }, a);
  assert.equal(withoutConfirmation.statusCode, 422);
  assert.deepEqual(count(c), [{ photo_id: 1, total: 2 }, { photo_id: 2, total: 1 }]);
  const withdrawn = await c.post(withdrawUrl, { _csrf: formProof(page.body, withdrawUrl), confirm: 'retirer' }, a);
  assert.equal(withdrawn.statusCode, 303);
  assert.equal(withdrawn.cookies.find(cookie => cookie.name === c.name).value, '');
  assert.deepEqual(count(c), [{ photo_id: 1, total: 1 }, { photo_id: 2, total: 0 }]);
  assert.deepEqual(c.app.saisonsVotes.forBrowser(c.sid, b[c.name]).photo_ids, [1]);
  const done = await c.get(withdrawn.headers.location);
  assert.ok(done.body.includes('Vos votes et votre preuve d’accord ont été effacés.'));
});

test('V1 HTTP : aucune collecte sans DATA_KEY, exposition ou photo indisponible et clôture purgée', async t => {
  const c = await context(t), url = `${c.root}/photo/photo-1/voter`, page = await c.get(url), csrf = proof(page.body), cookies = await voted(c);
  c.approve([2]);
  assert.equal((await c.get(url, cookies)).statusCode, 404);
  assert.equal((await c.post(url, { _csrf: csrf, notice_version: NOTICE_VERSION, consent: 'oui' })).statusCode, 409);
  c.approve([1, 2]); c.at(END);
  const expired = await c.get(`${c.root}/participation`, cookies);
  assert.equal(expired.statusCode, 200); assert.ok(expired.body.includes('Le vote est clos.'));
  assert.equal(expired.cookies.find(cookie => cookie.name === c.name).value, '');
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM saison_vote_votants').pluck().get(), 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM saison_votes').pluck().get(), 0);
  assert.deepEqual(count(c), [{ photo_id: 1, total: 1 }]);
  assert.equal((await c.get(url)).statusCode, 410);
  const locked = await context(t, { encrypted: false }), lockedUrl = `${locked.root}/photo/photo-1/voter`, lockedPage = await locked.get(lockedUrl);
  assert.equal(lockedPage.statusCode, 200); assert.ok(lockedPage.body.includes('temporairement indisponible'));
  assert.doesNotMatch(lockedPage.body, /name="consent"/);
  const forged = locked.app.expositionVoteForms.csrf(`vote:${locked.sid}:1`, null);
  const refused = await locked.post(lockedUrl, { _csrf: forged, notice_version: NOTICE_VERSION, consent: 'oui' });
  assert.equal(refused.statusCode, 503); assert.equal(refused.cookies.length, 0); assert.deepEqual(count(locked), []);
});

test('V1 HTTP : piège et limite réutilisent la Vigie, le doublon ordinaire ne signale pas une attaque', async t => {
  const c = await context(t), events = [];
  c.app.securite = { ...c.app.securite, emit: (type, event) => events.push({ type, detail: event.detail }) };
  const url = `${c.root}/photo/photo-1/voter`, page = await c.get(url), body = { _csrf: proof(page.body), notice_version: NOTICE_VERSION, consent: 'oui' };
  assert.equal((await c.post(url, { ...body, website: 'robot' })).statusCode, 403);
  assert.ok(events.some(event => event.type === 'malicious_honeypot'));
  c.app.expositionVoteForms.limit = () => false;
  assert.equal((await c.post(url, body)).statusCode, 429);
  assert.ok(events.some(event => event.type === 'excess_rate_limit_exceeded'));
  assert.deepEqual(count(c), []);
});

test('V1 HTTP : liens S2 limités aux propositions approuvées et pages refusées en v1', async t => {
  const c = await context(t), request = { cookies: {}, url: c.root }, reply = { clearCookie: () => {} }, exposition = { ...c.app.saisons.get(c.sid), phase: 'ouverte' };
  assert.ok(expositionVoteLinks(c.app, { request, reply, lang: 'fr', exposition, photo: { id: 1, slug: 'photo-1' } }).voteHref);
  assert.equal(expositionVoteLinks(c.app, { request, reply, lang: 'fr', exposition, photo: { id: 3, slug: 'photo-3' } }).voteHref, null);
  c.app.publicVersion.save('v1');
  assert.equal((await c.get(`${c.root}/photo/photo-1/voter`)).statusCode, 404);
  assert.equal((await c.get(`${c.root}/participation`)).statusCode, 404);
});

test('V1 HTTP : circuit V0 réel, invalidation des validations et compteurs privés dans l’atelier', async t => {
  const c = await context(t, { realProposals: true }), proposals = c.app.saisonsPropositions, url = `${c.root}/photo/photo-1/voter`;
  assert.equal((await c.get(url)).statusCode, 404);
  assert.equal(voteSection((await c.get(c.root)).body), null);
  let p = proposals.propose(c.sid, { version: proposals.get(c.sid).version, photo_ids: [1, 2] });
  p = proposals.review(c.sid, { version: p.version });
  assert.equal((await c.get(url)).statusCode, 404);
  assert.equal(voteSection((await c.get(c.root)).body), null);
  proposals.validate(c.sid, { version: p.version });
  const approved = await c.get(c.root), initialOrder = voteSection(approved.body);
  assert.ok(initialOrder.indexOf('Photo 1 FR') < initialOrder.indexOf('Photo 2 FR'));
  assert.ok(approved.body.includes('href="#vote-consultatif"'));
  assert.equal(approved.cookies.length, 0);
  const cookies = await voted(c), secondUrl = `${c.root}/photo/photo-2/voter`, secondPage = await c.get(secondUrl, cookies);
  const director = as(c, { sub: 'direction-ordre-public-vote', roles: ['directeur_publication'] });
  const reordered = await director.post(`/admin/saisons/${c.sid}/vote/ordonner`, { version: String(proposals.get(c.sid).version), 'photo_ids[]': ['1', '2'], position_1: '2', position_2: '1' });
  assert.equal(reordered.statusCode, 303);
  p = proposals.get(c.sid);
  assert.equal((await c.get(secondUrl, cookies)).statusCode, 404);
  assert.equal(voteSection((await c.get(c.root)).body), null);
  assert.equal((await c.post(secondUrl, { _csrf: proof(secondPage.body), notice_version: NOTICE_VERSION }, cookies)).statusCode, 409);
  proposals.review(c.sid, { version: p.version }); proposals.validate(c.sid, { version: p.version });
  const ordered = await c.get(c.root), publicOrder = voteSection(ordered.body);
  assert.ok(publicOrder.indexOf('Photo 2 FR') < publicOrder.indexOf('Photo 1 FR'));
  assert.ok(publicOrder.includes(`${c.root}/photo/photo-2/voter`));
  const accrochage = /<section[^>]*id="accrochage"[^>]*>[\s\S]*?<\/section>/.exec(ordered.body)[0];
  assert.ok(accrochage.indexOf('Photo 1 FR') < accrochage.indexOf('Photo 2 FR'));
  assert.equal(ordered.cookies.length, 0);
  assert.equal((await c.post(secondUrl, { _csrf: proof(secondPage.body), notice_version: NOTICE_VERSION }, cookies)).statusCode, 303);
  const admin = as(c, { sub: 'admin-compteurs-vote', roles: ['admin'] }), privatePage = await admin.get(`/admin/saisons/${c.sid}/vote`);
  assert.equal(privatePage.statusCode, 200);
  assert.ok(privatePage.body.includes('Votes consultatifs'));
  assert.match(privatePage.body, /Photo 1 FR<\/th><td>1<\/td>/);
  assert.ok(!privatePage.body.includes(cookies[c.name]));
  const publicPage = await c.get(c.root, cookies);
  assert.equal(publicPage.statusCode, 200);
  assert.ok(!publicPage.body.includes('Votes consultatifs'));
  assert.ok(publicPage.body.includes('Mes votes dans cette exposition'));
});

test('V1 HTTP : propositions publiques filtrées, traduites et retirées sans consentement ni cookie', async t => {
  const c = await context(t);
  for (const [prefix, heading] of [['', 'Photos proposées au vote'], ['/en', 'Photographs offered for voting'], ['/de', 'Fotografien zur Abstimmung']]) {
    const response = await c.get(`${prefix}${c.root}`);
    assert.equal(response.statusCode, 200);
    assert.ok(voteSection(response.body).includes(heading));
    assert.equal(response.cookies.length, 0);
    assert.doesNotMatch(response.body, /name="consent"/);
  }
  fs.unlinkSync(path.join(c.dir, 'variants', variantName('neutre-2.jpg', widthsFor(1200).at(-1), 'webp', '')));
  const filtered = voteSection((await c.get(c.root)).body);
  assert.ok(filtered.includes('Photo 1 FR')); assert.ok(!filtered.includes('Photo 2 FR'));
  c.approve([]);
  assert.equal(voteSection((await c.get(c.root)).body), null);
  c.approve([1]); c.app.expositionVoteForms.enabled = false;
  assert.equal(voteSection((await c.get(c.root)).body), null);
  c.app.expositionVoteForms.enabled = true; c.at(END);
  assert.equal(voteSection((await c.get(c.root)).body), null);
});

test('V1 HTTP : après clôture, aucun export ne restitue les anciens votes ou leur preuve', async t => {
  const c = await context(t), cookies = await voted(c), raw = cookies[c.name];
  c.at(END);
  const csrf = c.app.expositionVoteForms.csrf(`export:${c.sid}`, raw);
  const response = await c.post(`${c.root}/participation/export`, { _csrf: csrf }, cookies);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { exposition_id: c.sid, photo_ids: [], consented: false, closes_at: END, closed: true, consent: null });
  assert.equal(response.cookies.find(cookie => cookie.name === c.name).value, '');
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM saison_vote_votants').pluck().get(), 0);
  assert.deepEqual(count(c), [{ photo_id: 1, total: 1 }]);
});

test('V1 HTTP : une preuve illisible n’empêche pas de retirer son accord et ses votes', async t => {
  const c = await context(t), cookies = await voted(c), manage = `${c.root}/participation`, withdraw = `${manage}/retirer`;
  c.db.prepare("UPDATE saison_vote_votants SET consentement = 'enc1:altéré'").run();
  const page = await c.get(manage, cookies);
  assert.equal(page.statusCode, 200);
  assert.ok(page.body.includes('temporairement indisponible'));
  assert.ok(page.body.includes('Retirer mon accord et annuler mes votes'));
  const response = await c.post(withdraw, { _csrf: formProof(page.body, withdraw), confirm: 'retirer' }, cookies);
  assert.equal(response.statusCode, 303);
  assert.deepEqual(count(c), [{ photo_id: 1, total: 0 }]);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM saison_vote_votants').pluck().get(), 0);
});

test('V1 HTTP : une photo devenue invisible dans S2 ne révèle ni titre ni formulaire de vote', async t => {
  const c = await context(t), url = `${c.root}/photo/photo-1/voter`;
  fs.unlinkSync(path.join(c.dir, 'variants', variantName('neutre-1.jpg', widthsFor(1200).at(-1), 'webp', '')));
  const response = await c.get(url);
  assert.equal(response.statusCode, 404);
  assert.ok(!response.body.includes('Photo 1 FR'));
  assert.equal(response.cookies.length, 0);
  assert.deepEqual(count(c), []);
});

test('V1 HTTP : journaux techniques et événements ne copient ni cookie, ni CSRF, ni bulletin', async t => {
  const lines = [], c = await context(t, { logger: { level: 'info', stream: { write: line => lines.push(line) } } }), events = [];
  c.app.securite = { ...c.app.securite, emit: (type, event) => events.push({ type, detail: event.detail }) };
  const cookies = await voted(c), url = `${c.root}/photo/photo-2/voter`, page = await c.get(url, cookies), csrf = proof(page.body);
  const response = await c.post(url, { _csrf: csrf, notice_version: NOTICE_VERSION }, cookies);
  assert.equal(response.statusCode, 303);
  const duplicate = await c.post(url, { _csrf: csrf, notice_version: NOTICE_VERSION }, cookies);
  assert.equal(duplicate.statusCode, 303);
  assert.deepEqual(events, []);
  assert.ok(!lines.join('').includes(cookies[c.name]));
  assert.ok(!lines.join('').includes(csrf));
  assert.ok(!lines.join('').includes('consentement'));
});

test('V1 : purge au démarrage et à la minute, sans visite ni perte des totaux anonymes', async t => {
  const c = await context(t), raw = createVoteToken();
  c.app.saisonsVotes.cast(c.sid, 1, raw, { consent: true, noticeVersion: NOTICE_VERSION });
  c.at(END);
  // Un second serveur Fastify sans écoute partage cette seule base jetable, comme après un redémarrage.
  const startup = Fastify({ logger: false });
  startup.decorate('config', c.config); startup.decorate('db', c.db); startup.decorate('saisons', c.app.saisons); startup.decorate('readiness', c.app.readiness);
  installExpositionVotes(startup, { now: c.app.expositionVoteForms.now, approvedIds: () => [1, 2], timers: false });
  await startup.ready();
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM saison_votes').pluck().get(), 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM saison_vote_votants').pluck().get(), 0);
  assert.deepEqual(count(c), [{ photo_id: 1, total: 1 }]);
  await startup.close();
  c.at(START);
  c.app.saisonsVotes.cast(c.sid, 2, raw, { consent: true, noticeVersion: NOTICE_VERSION });
  const periodic = Fastify({ logger: false });
  periodic.decorate('config', c.config); periodic.decorate('db', c.db); periodic.decorate('saisons', c.app.saisons); periodic.decorate('readiness', c.app.readiness);
  t.after(() => periodic.close());
  t.mock.timers.enable({ apis: ['setInterval'] });
  installExpositionVotes(periodic, { now: c.app.expositionVoteForms.now, approvedIds: () => [1, 2] });
  await periodic.ready();
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM saison_votes').pluck().get(), 1);
  c.at(END);
  t.mock.timers.tick(60 * 1000);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM saison_votes').pluck().get(), 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM saison_vote_votants').pluck().get(), 0);
  assert.deepEqual(count(c), [{ photo_id: 1, total: 1 }, { photo_id: 2, total: 1 }]);
  await periodic.close();
  t.mock.timers.reset();
});

test('V1 HTTP : la politique de confidentialité décrit le vote et sa conservation dans les trois langues', async t => {
  const c = await context(t);
  for (const [prefix, text] of [['', 'Vote consultatif des expositions'], ['/en', 'Advisory voting in exhibitions'], ['/de', 'Beratende Abstimmung in Ausstellungen']]) {
    const response = await c.get(`${prefix}/confidentialite`);
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes(text));
    assert.match(response.body, /14/);
    assert.equal(response.cookies.length, 0);
  }
});
