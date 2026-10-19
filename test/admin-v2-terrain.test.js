import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Admin v2, vague 3b (terrain et contenus) : Personnes, Demandes et rencontres, la fiche d'une personne, une rencontre,
// Séries, Sorties, une sortie, Voyages, un voyage. Mêmes champs, mêmes droits, mêmes routes d'écriture que la v1 ; un
// compte en v1 voit la v1 ; les lectures sensibles, les déchiffrements et les émissions de la Vigie sont exactement ceux
// de la v1 ; rien de personnel en plus ; CSRF, portée « les miennes » (authz_fail hors portée, BV-14), journal avec les
// noms des champs, textes publics vus depuis la v2 (BV-20, BV-21) ; entrée « Sécurité », badge et bandeaux.
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const DATA_KEY = 'cle-des-donnees-personnelles-0123456789abcdef';
const isV2 = html => html.includes('/static/admin/v2/v2.css');
const plain = r => Object.defineProperty(r, 'body', { value: r.body.replace(/[\u00a0\u202f]/g, ' ') });

// Déchiffrements : comptés à la source (vault.js déchiffre par crypto.createDecipheriv d'AES-256-GCM).
let decrypts = 0;
const realDecipher = crypto.createDecipheriv;
crypto.createDecipheriv = function (...args) { if (args[0] === 'aes-256-gcm') decrypts++; return realDecipher.apply(this, args); };

async function site(t, opts = {}) {
  const received = [];
  const ctx = await setup(t, { seeded: true, env: { ...VIGIE, DATA_KEY }, vigieOptions: { send: async body => { received.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false }, ...opts });
  const security = async () => { ctx.app.securite.runTasks(); ctx.app.securite.retryNow(); await ctx.app.securite.flush(); return received; };
  const store = createSessionStore(ctx.db);
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const account = async (sub, { roles = ['admin'], author = null, version = 'v2' } = {}) => {
    ctx.app.accounts.ensure({ sub, name: sub, roles });
    if (author) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId: author }, 'test');
    const token = store.create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token };
    const get = async url => plain(await ctx.app.inject({ url, cookies, headers: { accept: 'text/html' } }));
    const post = async (url, payload = {}, { token: tok = csrf } = {}) => plain(await ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, ...(tok ? { _csrf: tok } : {}) } }));
    const json = (url, payload, { token: tok = csrf } = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'application/json', ...(tok ? { 'x-csrf-token': tok } : {}) }, payload });
    const a = { sub, csrf, get, post, json, version: async v => { await post('/admin/version', { version: v, back: '/admin' }); } };
    await a.version(version);
    await get('/admin/aide');                                                   // fenêtre « Nouveautés » vue une fois
    return a;
  };
  // Des personnes et leurs rencontres (données chiffrées), une sortie datée, un voyage.
  const enc = ctx.app.encounters;
  const photos = ctx.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id LIMIT 3').pluck().all(seb);
  photos.forEach((id, i) => ctx.db.prepare("UPDATE photos SET taken_on = '2025-10-12', taken_time = ? WHERE id = ?").run(`1${i}:20`, id));
  const e1 = enc.saveCard(null, { ref: 'S-0142', signed: 'on', scope_site: 'on', scope_instagram: 'on', met_on: '2025-10-12', author_id: seb, name: 'Inès Martin', email: 'ines@exemple.fr', place: 'Quai de la Loire', details: 'manteau rouge' });
  const e2 = enc.saveCard(null, { ref: 'S-0143', met_on: '2025-10-12', author_id: seb, name: 'Paul Durand', email: 'paul@exemple.fr', place: 'Pont Neuf' });
  const e3 = enc.saveCard(null, { ref: 'J-0150', signed: 'on', scope_site: 'on', met_on: '2025-10-13', author_id: jul, name: 'Lou Bernard', email: 'lou@exemple.fr' });
  enc.link(e1, photos.slice(0, 1));
  ctx.db.prepare("UPDATE encounters SET rights_request = 'acces', rights_requested_at = ? WHERE id = ?").run(Date.now() - 5 * 864e5, e2);
  const personOf = id => ctx.db.prepare('SELECT person_id FROM encounters WHERE id = ?').pluck().get(id);
  const trip = ctx.app.trips.create({ name: 'Bords de Loire', authorId: seb });
  ctx.app.trips.addDays(trip, [{ author_id: seb, day: '2025-10-12' }]);
  const tripJ = ctx.app.trips.create({ name: 'Lisbonne', authorId: jul });
  const cat = ctx.db.prepare('SELECT * FROM categories ORDER BY position LIMIT 1').get();
  const audits = action => ctx.db.prepare('SELECT action, target, detail, status FROM audit_log WHERE action = ? ORDER BY id').all(action);
  const PERSONAL = ['Inès Martin', 'ines@exemple.fr', 'Quai de la Loire', 'manteau rouge', 'Paul Durand', 'paul@exemple.fr', 'Pont Neuf', 'Lou Bernard', 'lou@exemple.fr'];
  return { ...ctx, security, account, seb, jul, e1, e2, e3, photos, personOf, trip, tripJ, cat, audits, PERSONAL };
}

// Les écrans de la vague et leur repère dans le gabarit v1 (views/admin/<écran>.eta), absent de tout gabarit v2.
const V1_MARKS = { people: '<ul class="people-list">', person: '<div class="ready-band"', encounters: '<ul class="enc-list">', encounter: '<div class="enc-grid">',
  series: '<div class="scards" data-series-list>', outings: '<p class="prose">', outing: '<div class="outing-grid">', trips: '<ul class="trips">', trip: '<ol class="trip-days">' };
const urlsOf = c => ({ people: '/admin/personnes', person: `/admin/personnes/${c.personOf(c.e1)}`, encounters: '/admin/rencontres', encounter: `/admin/rencontres/${c.e1}`,
  series: '/admin/series', outings: '/admin/sorties', outing: '/admin/sorties/sebastien/2025-10-12', trips: '/admin/voyages', trip: `/admin/voyages/${c.trip}` });

test('v2 et repli : un compte en v1 voit la v1 de ces écrans (son gabarit, sa mise en page, son script), un compte en v2 la v2', async t => {
  const read = f => fs.readFileSync(new URL(`../views/admin/${f}`, import.meta.url), 'utf8');
  const v2Views = fs.readdirSync(new URL('../views/admin/v2/', import.meta.url)).filter(f => f.endsWith('.eta')).map(f => read(`v2/${f}`));
  const c = await site(t);
  const URLS = urlsOf(c);
  for (const [screen, mark] of Object.entries(V1_MARKS)) {
    assert.ok(read(`${screen}.eta`).includes(mark), `${screen} : repère du gabarit v1 introuvable`);
    assert.ok(!v2Views.some(v => v.includes(mark)), `${screen} : repère partagé avec un gabarit v2`);
    assert.ok(fs.existsSync(new URL(`../views/admin/v2/${screen}.eta`, import.meta.url)), `${screen} : gabarit v2`);
  }
  const v1 = await c.account('compte-v1', { version: 'v1' });
  const v2 = await c.account('compte-v2');
  for (const [screen, url] of Object.entries(URLS)) {
    const a = await v1.get(url), b = await v2.get(url);
    assert.equal(a.statusCode, 200, url);
    assert.equal(b.statusCode, 200, url);
    assert.ok(!isV2(a.body), `${url} : la v1 pour le compte en v1`);
    assert.ok(a.body.includes(V1_MARKS[screen]), `${url} : le gabarit v1`);
    assert.match(a.body, /<script src="\/static\/admin\/admin\.js[?"]/, `${url} : le script de la v1`);
    assert.doesNotMatch(a.body, /\/static\/admin\/v2\//, `${url} : rien de la v2 en v1`);
    assert.ok(isV2(b.body), `${url} : la v2`);
    assert.ok(!b.body.includes(V1_MARKS[screen]), `${url} : pas le gabarit v1 en v2`);
    assert.match(b.body, /\/static\/admin\/v2\/contenus-v2\.css/, url);
    assert.match(b.body, /<p class="help-link"><a href="\/admin\/aide#[^"]+">Aide sur cette page<\/a><\/p>/, url);
    assert.equal(b.headers['cache-control'], 'no-store', url);
    assert.doesNotMatch(b.body, /\sstyle="/, `${url} : aucun style en ligne`);
    assert.doesNotMatch(b.body, /<script(?![^>]*(?:\bsrc=|type="application\/json"))[^>]*>/, `${url} : aucun script en ligne`);
    assert.doesNotMatch(b.body, /\son[a-z]+="/, `${url} : aucun gestionnaire en ligne`);
  }
  // Deux titres distincts (UX-A-16) : « Personnes » et « Demandes et rencontres ».
  assert.match((await v2.get('/admin/personnes')).body, /<title>Personnes · Administration · Test<\/title>[^]*<h1>Personnes<\/h1>/);
  assert.match((await v2.get('/admin/rencontres')).body, /<title>Demandes et rencontres · Administration · Test<\/title>[^]*<h1>Demandes et rencontres<\/h1>/);
});

test('rencontre et personne v2 : mêmes lectures sensibles, mêmes déchiffrements, mêmes images, rien de personnel en plus', async t => {
  const c = await site(t);
  const URLS = urlsOf(c);
  const v1 = await c.account('compte-v1', { version: 'v1' });
  const v2 = await c.account('compte-v2');
  const extra = [`/admin/rencontres/${c.e2}`, `/admin/rencontres/${c.e3}`, `/admin/personnes/${c.personOf(c.e3)}`, `/admin/rencontres/${c.e1}?q=a`, `/admin/personnes/${c.personOf(c.e1)}?q=S`];
  // Images des données personnelles (photo de repère, signature, carte) : chacune est une lecture sensible de plus quand le
  // navigateur la charge ; la v2 demande exactement les mêmes.
  const images = html => (html.match(/\/admin\/(?:rencontres|personnes)\/\d+\/(?:portrait(?:\?mini=1)?|signature|carte)/g) || []).sort();
  const seen = await c.security();
  const step = async (a, url) => {
    await c.security();
    const before = seen.length, d0 = decrypts;
    const res = await a.get(url);
    const after = await c.security();
    const events = after.slice(before).filter(e => !e.type.startsWith('sys_') && !['authn_login_success', 'config_public_changed'].includes(e.type)).map(e => ({ type: e.type, detail: e.detail }));
    return { res, events, decrypts: decrypts - d0 };
  };
  for (const url of [...Object.values(URLS), ...extra]) {
    const a = await step(v1, url), b = await step(v2, url);
    assert.equal(a.res.statusCode, 200, url);
    assert.ok(isV2(b.res.body) && !isV2(a.res.body), url);
    assert.deepEqual(b.events, a.events, `${url} : mêmes émissions de la Vigie`);
    assert.equal(b.decrypts, a.decrypts, `${url} : mêmes déchiffrements`);
    assert.deepEqual(images(b.res.body), images(a.res.body), `${url} : mêmes images personnelles`);
    for (const v of c.PERSONAL) assert.equal(b.res.body.includes(v), a.res.body.includes(v), `${url} : « ${v} » ${a.res.body.includes(v) ? 'montré en v1' : 'absent de la v1'}`);
    if (/^\/admin\/(?:personnes|rencontres)\/\d+/.test(url)) {
      assert.deepEqual(b.events.map(e => e.type), ['sensitive_read'], url);
      assert.equal(b.events[0].detail.cible, url.startsWith('/admin/personnes') ? '/admin/personnes/:id' : '/admin/rencontres/:id', url);
    } else assert.deepEqual(b.events, [], url);
  }
  // Exports : les mêmes liens, la même lecture journalisée (sensitive_export), la même trace dans l'historique.
  for (const url of [`/admin/rencontres/${c.e1}/export.zip`, `/admin/personnes/${c.personOf(c.e1)}/export.zip`]) {
    assert.ok((await v2.get(url.replace(/\/export\.zip$/, ''))).body.includes(`href="${url}"`), url);
    const a = await step(v1, url), b = await step(v2, url);
    assert.equal(b.res.statusCode, 200, url);
    assert.deepEqual(b.events, a.events, url);
    assert.deepEqual(b.events.map(e => e.type), ['sensitive_export'], url);
    assert.equal(b.decrypts, a.decrypts, url);
  }
  // Les données sont bien chiffrées dans la base, et déchiffrées pour la fiche.
  assert.match(c.db.prepare('SELECT email FROM encounters WHERE id = ?').pluck().get(c.e1), /^enc1:/);
  assert.ok((await step(v2, `/admin/rencontres/${c.e1}`)).decrypts > 0);
});

test('portée « les miennes » en v2 : personnes, rencontres et voyages d’un autre photographe introuvables et signalés (BV-14)', async t => {
  const c = await site(t);
  const ph = await c.account('jul-ph', { roles: ['photographe'], author: c.jul });
  const list = (await ph.get('/admin/personnes')).body;
  assert.ok(isV2(list));
  assert.match(list, /Lou Bernard/);
  assert.doesNotMatch(list, /Inès Martin|Paul Durand/);
  assert.doesNotMatch((await ph.get('/admin/rencontres')).body, /S-0142|S-0143/);
  const seen = await c.security();
  let n = seen.length;
  const fails = async () => { const all = await c.security(); const out = all.slice(n).filter(e => e.type === 'authz_fail'); n = all.length; return out; };
  assert.equal((await ph.get(`/admin/personnes/${c.personOf(c.e1)}`)).statusCode, 404);
  assert.equal((await ph.get(`/admin/rencontres/${c.e1}`)).statusCode, 404);
  assert.deepEqual((await fails()).map(e => e.detail.raison), ['hors portée', 'hors portée']);
  // Un voyage d'un autre : lu, puis écrit depuis la v2 (JSON) : 404 et authz_fail avec l'objet, son numéro et l'écriture.
  assert.equal((await ph.get(`/admin/voyages/${c.trip}`)).statusCode, 404);
  const w = await ph.json(`/admin/voyages/${c.trip}`, { name: 'Pris' });
  assert.equal(w.statusCode, 404);
  const f = await fails();
  assert.deepEqual(f.map(e => [e.detail.objet, e.detail.id, e.detail.ecriture]), [['voyage', c.trip, false], ['voyage', c.trip, true]]);
  assert.equal(c.app.trips.get(c.trip).name, 'Bords de Loire');
  // Ses propres écrans : les siens seulement ; ni effacer ni exporter (droits de la v1) ; pas de Séries (403).
  const mine = (await ph.get(`/admin/rencontres/${c.e3}`)).body;
  assert.ok(isV2(mine));
  assert.doesNotMatch(mine, /dlg-effacer|export\.zip/);
  assert.match(mine, /L’export et l’effacement des données sont faits par un administrateur\./);
  assert.equal((await ph.get('/admin/series')).statusCode, 403);
  const trips = (await ph.get('/admin/voyages')).body;
  assert.match(trips, /Lisbonne/);
  assert.doesNotMatch(trips, /Bords de Loire/);
  // Le voyage commun (sans photographe) ne se modifie pas : il est à qui gère toutes les sorties.
  const common = c.app.trips.create({ name: 'Commun', authorId: null });
  assert.equal((await ph.json(`/admin/voyages/${common}`, { name: 'Modifié' })).statusCode, 404);
  assert.equal(c.app.trips.get(common).name, 'Commun');
});

test('Séries v2 : champ par champ en JSON (route de la v1), erreur sous le champ, journal avec les noms des champs, CSRF, texte d’intention vu par la Vigie (BV-20, BV-21)', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const html = (await adm.get('/admin/series')).body;
  assert.match(html, new RegExp(`<form class="form serie-form" method="post" action="/admin/series/${c.cat.id}" novalidate data-serie-auto data-url="/admin/series/${c.cat.id}">`));
  for (const k of ['name', 'name_en', 'name_de', 'intent', 'intent_en', 'intent_de', 'slug']) assert.match(html, new RegExp(`id="${k}-${c.cat.id}" name="${k}"[^>]*data-champ="${k}"`), k);
  assert.match(html, new RegExp(`id="dlg-suppr-${c.cat.id}"[^]*?action="/admin/series/${c.cat.id}/delete"`));
  assert.doesNotMatch(html, /id="propositions"|id="descriptions"/, 'assistants dans les Réglages');
  const form = { name: c.cat.name, name_en: '', name_de: '', intent: '', intent_en: '', intent_de: '', slug: c.cat.slug };
  await c.security();
  const before = (await c.security()).length;
  // Le texte d'intention, enregistré au champ quitté : JSON, journal, Vigie.
  const r = await adm.json(`/admin/series/${c.cat.id}`, { ...form, intent: 'Ce que la ville garde : écrire à contact@exemple.org' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { ok: true, serie: { name: c.cat.name, slug: c.cat.slug } });
  assert.match(c.db.prepare('SELECT intent FROM categories WHERE id = ?').pluck().get(c.cat.id), /^Ce que la ville garde/);
  const log = c.audits('POST /admin/series/:id').at(-1);
  assert.equal(log.detail, 'champs : intent');
  assert.doesNotMatch(log.detail, /ville/);
  const ev = (await c.security()).slice(before).filter(e => e.type === 'config_public_changed');
  assert.ok(ev.some(e => e.detail.objet === 'textes_publics' && e.detail.champs.includes('categories.intent')), 'BV-21');
  assert.ok(ev.some(e => e.detail.objet === 'texte_public' && e.detail.ajout === 'email' && e.detail.champ === 'categories.intent'), 'BV-20');
  // Un nom vide : refusé, 422 avec l'erreur du champ ; rien ne change.
  const bad = await adm.json(`/admin/series/${c.cat.id}`, { ...form, name: '' });
  assert.equal(bad.statusCode, 422);
  assert.match(bad.json().errors.name, /obligatoire/);
  assert.equal(c.db.prepare('SELECT name FROM categories WHERE id = ?').pluck().get(c.cat.id), c.cat.name);
  // Sans jeton : refusé.
  assert.equal((await adm.json(`/admin/series/${c.cat.id}`, { ...form, intent: 'x' }, { token: null })).statusCode, 403);
  // Sans script : le formulaire de la v1 et sa redirection.
  const p = await adm.post(`/admin/series/${c.cat.id}`, { ...form, name_en: 'Street' });
  assert.deepEqual([p.statusCode, p.headers.location], [303, `/admin/series#serie-${c.cat.id}`]);
  // L'ordre (poignée, menu) : la route de la v1, en JSON.
  const ids = c.db.prepare('SELECT id FROM categories ORDER BY position').pluck().all();
  assert.equal((await adm.json('/admin/series/order', { ids: [...ids].reverse() })).statusCode, 200);
  assert.deepEqual(c.db.prepare('SELECT id FROM categories ORDER BY position').pluck().all(), [...ids].reverse());
});

test('Voyage v2 : champ par champ en JSON, journal avec les noms des champs, page en ligne par son dialogue, suppression par dialogue, CSRF', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const html = (await adm.get(`/admin/voyages/${c.trip}`)).body;
  assert.match(html, new RegExp(`<form class="form voyage-form" method="post" action="/admin/voyages/${c.trip}" novalidate data-autosave data-url="/admin/voyages/${c.trip}"`));
  for (const k of ['name', 'name_en', 'name_de', 'intro', 'intro_en', 'intro_de', 'author_id']) assert.match(html, new RegExp(`name="${k}"[^>]*data-champ="${k}"`), k);
  assert.match(html, /id="dlg-supprimer"[^]*?action="\/admin\/voyages\/\d+\/supprimer"/);
  assert.match(html, /id="dlg-en-ligne"[^]*?name="public_set" value="1"><input type="hidden" name="public" value="on">/);
  assert.doesNotMatch(html, /<button class="btn danger" type="submit">Supprimer « /, 'plus de suppression en un clic hors du dialogue');
  const r = await adm.json(`/admin/voyages/${c.trip}`, { intro: 'Trois journées le long du fleuve.' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().ok, true);
  assert.equal(c.app.trips.get(c.trip).intro, 'Trois journées le long du fleuve.');
  assert.equal(c.audits('POST /admin/voyages/:id').at(-1).detail, 'champs : intro');
  const n = await adm.json(`/admin/voyages/${c.trip}`, { name: '' });
  assert.equal(n.statusCode, 422);
  assert.match(n.json().error, /nom/);
  assert.equal((await adm.json(`/admin/voyages/${c.trip}`, { name: 'Sans jeton' }, { token: null })).statusCode, 403);
  // Mettre la page en ligne (le dialogue envoie le formulaire de la v1), puis l'en retirer.
  const on = await adm.post(`/admin/voyages/${c.trip}`, { public_set: '1', public: 'on' });
  assert.equal(on.statusCode, 303);
  assert.equal(Boolean(c.app.trips.get(c.trip).public), true);
  assert.equal(c.audits('POST /admin/voyages/:id').at(-1).detail, 'champs : public');
  assert.match((await adm.get(`/admin/voyages/${c.trip}`)).body, /id="dlg-retirer"/);
  await adm.post(`/admin/voyages/${c.trip}`, { public_set: '1' });
  assert.equal(Boolean(c.app.trips.get(c.trip).public), false);
  // Supprimer : le dialogue mène à la route de la v1.
  assert.equal((await adm.post(`/admin/voyages/${c.trip}/supprimer`)).statusCode, 303);
  assert.equal(c.app.trips.get(c.trip), null);
});

test('Sortie v2 : le lieu au champ quitté (JSON), les photos cochées, publier par dialogue ; CSRF', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const url = '/admin/sorties/sebastien/2025-10-12';
  const html = (await adm.get(url)).body;
  assert.match(html, /data-autosave data-url="\/admin\/sorties\/sebastien\/2025-10-12\/lieu"/);
  assert.match(html, /name="lieu"[^>]*data-champ="lieu"/);
  assert.match(html, /<button class="btn ghost" type="submit" name="action" value="lier">Lier les photos cochées à cette personne<\/button>/);
  const r = await adm.json(`${url}/lieu`, { lieu: 'Quais d’Angers' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().lieu, 'Quais d’Angers');
  assert.match((await adm.get(url)).body, /<h1 data-sortie-titre>Quais d’Angers<\/h1>/);
  assert.equal((await adm.json(`${url}/lieu`, { lieu: 'x' }, { token: null })).statusCode, 403);
  const link = await adm.post(`${url}/photos`, { photo: String(c.photos[1]), action: 'lier', personne: String(c.e2) });
  assert.equal(link.statusCode, 303);
  assert.ok(c.app.encounters.photos(c.e2).some(p => p.id === c.photos[1]));
  // Le journal note la route ; sans jeton, rien.
  assert.equal((await adm.post(`${url}/photos`, { photo: String(c.photos[2]), action: 'lier', personne: String(c.e2) }, { token: null })).statusCode, 403);
});

test('Personnes et rencontre v2 : effacer et appliquer le refus par un dialogue (Annuler d’abord), écritures de la v1 ; CSRF', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const pid = c.personOf(c.e2);
  const p = (await adm.get(`/admin/personnes/${pid}`)).body;
  assert.match(p, /<a class="btn danger-c" href="#dlg-effacer" data-ouvre="dlg-effacer">Effacer cette personne…<\/a>/);
  assert.match(p, new RegExp(`<dialog class="confirm cible" id="dlg-effacer"[^>]*>\\s*<form method="post" action="/admin/personnes/${pid}/effacer">[^]*?<a class="btn ghost" href="#droits" data-annuler>Annuler</a><button class="btn danger" type="submit">`));
  // Vignettes nommées (UX-A-28) : aucun lien vers une photo sans texte.
  const e = (await adm.get(`/admin/rencontres/${c.e1}`)).body;
  assert.doesNotMatch(e, /<a [^>]*href="\/admin\/photos\/\d+"[^>]*>\s*(?:<picture|<img|<span class="ph")/);
  assert.match(e, /Exclure<span class="sr-only"> « [^»]+ »<\/span>/);
  // Le formulaire de la carte : multipart, la route de la v1, retenu au départ s'il est modifié.
  assert.match(e, new RegExp(`<form class="form renc-form" method="post" action="/admin/rencontres/${c.e1}" enctype="multipart/form-data" data-garde>`));
  // Statut, puis effacer depuis le dialogue (le formulaire de la v1) ; sans jeton, rien.
  assert.equal((await adm.post(`/admin/rencontres/${c.e2}/statut`, { status: 'traitee' })).statusCode, 303);
  assert.equal(c.app.encounters.get(c.e2).status, 'traitee');
  assert.equal((await adm.post(`/admin/personnes/${pid}/effacer`, {}, { token: null })).statusCode, 403);
  assert.ok(c.app.encounters.get(c.e2));
  const er = await adm.post(`/admin/personnes/${pid}/effacer`, {});
  assert.deepEqual([er.statusCode, er.headers.location], [303, '/admin/personnes']);
  assert.equal(c.app.encounters.get(c.e2), null);
  // Refus : « Appliquer le refus… » mène à son dialogue.
  c.db.prepare('UPDATE encounters SET refused = 1, refused_at = ? WHERE id = ?').run(Date.now(), c.e1);
  const ref = (await adm.get(`/admin/rencontres/${c.e1}`)).body;
  assert.match(ref, /href="#dlg-refus" data-ouvre="dlg-refus">Appliquer le refus…/);
  assert.match(ref, new RegExp(`id="dlg-refus"[^]*?action="/admin/rencontres/${c.e1}/refus"`));
});

test('Vigie sur les écrans de la vague : entrée « Sécurité », badge, bandeau critique ; bandeau de vérification d’identité', async t => {
  const c = await site(t);
  const p = JSON.stringify({ usage: 'resume', emis_a: Date.now(), ouvertes: { critique: 1, haut: 0, moyen: 0, bas: 0 }, plus_grave: { id: 7, gravite: 'critique', depuis: Date.now() - 60e3 }, critique_a_prendre: true });
  c.app.decisions.acceptSummary({ payload: p, signature: crypto.sign(null, Buffer.from(p), VIGIE_KEYS.privateKey).toString('base64') });
  const adm = await c.account('adm');
  const URLS = Object.values(urlsOf(c));
  for (const url of URLS) {
    const html = (await adm.get(url)).body;
    assert.ok(isV2(html), url);
    assert.match(html, /<a class="nav-sec" href="[^"]+" target="_blank" rel="noopener noreferrer">[^]*?Sécurité<span class="sr-only"> \(nouvel onglet\)<\/span>[^]*?<span class="nav-badge/, url);
    assert.match(html, /<div class="sec-bandeau" role="alert">/, url);
    assert.doesNotMatch(html, /sec-bandeau identite/, url);
  }
  // Vérification d'identité demandée pour ce compte : le bandeau sur chaque écran, et les écritures de la v2 arrêtées.
  const v = JSON.stringify({ usage: 'site', version: Date.now(), emis_a: Date.now(), blocages: [], sessions: [], comptes: [], gels: [], verrouillage: null, verifications: [{ sub: 'adm', depuis: Date.now() - 1000, fin: Date.now() + 864e5 }] });
  c.app.decisions.accept({ payload: v, signature: crypto.sign(null, Buffer.from(v), VIGIE_KEYS.privateKey).toString('base64') });
  for (const url of URLS) assert.match((await adm.get(url)).body, /<div class="sec-bandeau identite" role="status">[^]*?href="\/auth\/verifier\?next=/, url);
  const w = await adm.json(`/admin/series/${c.cat.id}`, { name: 'Autre', slug: c.cat.slug });
  assert.equal(w.statusCode, 403);
  assert.equal(c.db.prepare('SELECT name FROM categories WHERE id = ?').pluck().get(c.cat.id), c.cat.name);
});
