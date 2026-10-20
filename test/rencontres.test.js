import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { parseRef } from '../server/encounters.js';

// Rencontres : page /bonjour (QR des cartes « pour eux »), accords signés (cartes « pour nous »), refus qui empêchent
// la publication, effacement.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function ctxOf(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = opts => ctx.app.inject({ ...opts, cookies: { ...cookies, ...opts.cookies } });
  const post = (url, payload = {}) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  const json = (url, payload = {}) => as({ method: 'POST', url, payload, headers: { 'x-csrf-token': csrf, accept: 'application/json' } });
  const hello = (payload, ip = '203.0.113.7') => ctx.app.inject({ method: 'POST', url: '/bonjour', payload, remoteAddress: ip });
  const photo = slug => ctx.db.prepare('SELECT * FROM photos WHERE slug = ?').get(slug);
  return { ...ctx, csrf, as, post, json, hello, photo };
}

function multipart(parts) {
  const boundary = '----test' + Math.random().toString(16).slice(2);
  const chunks = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${p.filename ? `; filename="${p.filename}"\r\nContent-Type: image/jpeg` : ''}\r\n\r\n`));
    chunks.push(Buffer.isBuffer(p.value) ? p.value : Buffer.from(String(p.value)));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

test('références des cartes : lecture souple, code de contrôle stable, auteur d’après la lettre', async t => {
  assert.deepEqual(parseRef('j142'), { prefix: 'J', number: 142, ref: 'J-0142', code: null });
  assert.equal(parseRef(' J-0142-k7q ').code, 'K7Q');
  assert.equal(parseRef('S 87').ref, 'S-0087');
  assert.equal(parseRef('0142'), null);
  assert.equal(parseRef('J-0'), null);
  const { app } = await ctxOf(t);
  const code = app.encounters.codeOf('J-0142');
  assert.match(code, /^[A-HJKMNP-Z2-9]{3}$/);
  assert.equal(app.encounters.codeOf('J-0142'), code);                                 // même clé, même code
  const ok = app.encounters.card(`J-0142-${code}`);
  assert.deepEqual([ok.verified, ok.author.name], [true, 'Julien']);
  assert.equal(app.encounters.card('J-0142').verified, false);
  assert.equal(app.encounters.card('J-0142-AAA').badCode, code !== 'AAA');
  assert.equal(app.encounters.card('S-0001').author.name, 'Sébastien');
});

test('page /bonjour : trois langues, jamais indexée, carte reconnue par le QR', async t => {
  const { app } = await ctxOf(t);
  const fr = await app.inject('/bonjour');
  assert.equal(fr.statusCode, 200);
  assert.equal(fr.headers['x-robots-tag'], 'noindex');
  assert.match(fr.body, /<h1>Bonjour !<\/h1>/);
  assert.match(fr.body, /name="website"/);                                             // piège à robots
  assert.match((await app.inject('/en/bonjour')).body, /<h1>Hello!<\/h1>/);
  assert.match((await app.inject('/de/bonjour')).body, /Veröffentlichung des Fotos/);
  const code = app.encounters.codeOf('J-0142');
  const qr = (await app.inject(`/bonjour/J-0142-${code}`)).body;
  assert.match(qr, /J-0142 · Carte de Julien : merci de l’avoir gardée\./);
  assert.match(qr, new RegExp(`name="ref" value="J-0142-${code}"`));
  assert.match((await app.inject('/bonjour/J-0142')).body, /J-0142 · Référence notée\./);
});

test('demandes : validations expliquées, piège à robots, carte vérifiée, choix successifs gardés dans l’historique', async t => {
  const c = await ctxOf(t);
  const count = () => c.db.prepare('SELECT COUNT(*) FROM encounters').pluck().get();
  let r = await c.hello({ ref: '', decision: '' });
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /Sans carte, indiquez au moins la date et le lieu/);
  assert.match(r.body, /Dites-nous ce que vous souhaitez/);
  r = await c.hello({ ref: 'J-0142', wants_photo: 'on' });
  assert.match(r.body, /Indiquez votre e-mail/);
  r = await c.hello({ ref: 'J-0142', decision: 'accord', adult: 'oui', email: 'a@exemple.fr', name: 'Alice' });
  assert.match(r.body, /Cochez au moins un usage/);
  const good = c.app.encounters.codeOf('J-0142');
  const wrong = (good[0] === 'A' ? 'B' : 'A') + good.slice(1);
  r = await c.hello({ ref: `J-0142-${wrong}`, wants_photo: 'on', email: 'a@exemple.fr' });
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /Le code de la carte ne correspond pas/);
  assert.equal((await c.hello({ ref: 'J-0142', wants_photo: 'on', email: 'a@exemple.fr', website: 'http://spam' })).statusCode, 303);
  assert.equal(count(), 0);                                                              // rien d'enregistré jusqu'ici
  // Carte en main (code bon) : veut la photo et accepte site + Instagram.
  const code = c.app.encounters.codeOf('J-0142');
  r = await c.hello({ ref: `j-0142-${code.toLowerCase()}`, wants_photo: 'on', decision: 'accord', adult: 'oui', scope_site: 'on', scope_instagram: 'on', email: 'alice@exemple.fr', name: 'Alice' });
  assert.deepEqual([r.statusCode, r.headers.location], [303, '/bonjour/merci?ref=J-0142']);
  assert.match((await c.app.inject(r.headers.location)).body, /Votre référence : J-0142\./);
  let e = c.db.prepare("SELECT * FROM encounters WHERE ref = 'J-0142'").get();
  assert.deepEqual([e.verified, e.wants_photo, e.refused, e.consent_source, JSON.parse(e.consent).instagram, e.email], [1, 1, 0, 'en_ligne', true, 'alice@exemple.fr']);
  assert.equal(e.author_id, c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get());
  // Plus tard, en allemand, sans le code (référence tapée) : son refus est appliqué (il la protège), mais rien
  // d'autre ne change (rencontre vérifiée) ; l'historique garde la demande, marquée non vérifiée.
  r = await c.app.inject({ method: 'POST', url: '/de/bonjour', payload: { ref: 'J-0142', decision: 'refus', message: 'Bitte nicht veröffentlichen.' }, remoteAddress: '203.0.113.8' });
  assert.equal(r.headers.location, '/de/bonjour/merci?ref=J-0142');
  e = c.db.prepare("SELECT * FROM encounters WHERE ref = 'J-0142'").get();
  assert.deepEqual([e.refused, e.lang, e.status], [1, 'fr', 'nouvelle']);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounter_events WHERE encounter_id = ?').pluck().get(e.id), 2);
  // Quelqu'un d'autre, avec la seule référence (elle se devine) : ni accord, ni adresse, ni nom ne remplacent le refus.
  await c.hello({ ref: 'J-0142', decision: 'accord', adult: 'oui', scope_site: 'on', scope_instagram: 'on', name: 'X', email: 'attaquant@exemple.fr', rights: 'acces' }, '203.0.113.10');
  e = c.db.prepare("SELECT * FROM encounters WHERE ref = 'J-0142'").get();
  assert.deepEqual([e.refused, e.email, e.rights_request], [1, 'alice@exemple.fr', 'acces']);   // demande de droits signalée, identité à vérifier
  assert.match(c.app.encounters.events(e.id).at(-1).detail.non_verifiee ? 'ok' : '', /ok/);
  // Sans carte : date et lieu suffisent.
  r = await c.hello({ met_on: '2026-10-11', place: 'Angers, place du Ralliement', details: 'veste rouge', wants_photo: 'on', email: 'bob@exemple.fr' }, '203.0.113.9');
  assert.equal(r.headers.location, '/bonjour/merci');
  assert.equal(count(), 2);
});

test('anti-abus : 8 demandes par heure et par adresse', async t => {
  const c = await ctxOf(t);
  for (let i = 0; i < 8; i++) assert.equal((await c.hello({ met_on: '2026-10-11', place: 'Nantes', message: `m${i}`, email: 'x@exemple.fr' }, '198.51.100.4')).statusCode, 303);
  const r = await c.hello({ met_on: '2026-10-11', place: 'Nantes', message: 'm9', email: 'x@exemple.fr' }, '198.51.100.4');
  assert.equal(r.statusCode, 429);
  assert.match(r.body, /Trop de demandes/);
});

test('admin : liste, fiche, photos liées ; un refus empêche toute publication et s’applique aux photos déjà publiées', async t => {
  const c = await ctxOf(t);
  assert.notEqual((await c.app.inject('/admin/rencontres')).statusCode, 200);          // réservé aux admins
  await c.hello({ ref: 'J-0142', wants_photo: 'on', email: 'alice@exemple.fr', message: 'Merci pour la photo !' });
  const id = c.db.prepare("SELECT id FROM encounters WHERE ref = 'J-0142'").pluck().get();
  const list = (await c.as({ url: '/admin/rencontres' })).body;
  assert.match(list, /J-0142/);
  assert.match(list, /non vérifiée/);
  assert.match(list, /« Merci pour la photo ! »/);
  assert.match((await c.as({ url: '/admin' })).body, /class="nav-badge"><span aria-hidden="true">1</);
  const quai = c.photo('quai-7h12'), deux = c.photo('deux-minuit');
  assert.equal((await c.post(`/admin/rencontres/${id}/photos`, { photo: [String(quai.id), String(deux.id)] })).statusCode, 303);
  const detail = (await c.as({ url: `/admin/rencontres/${id}` })).body;
  assert.match(detail, /Photos liées/);
  assert.match(detail, /Photos de la sortie/);
  assert.match(detail, /mailto:alice@exemple\.fr\?subject=Votre%20photo%20\(J-0142\)/);
  assert.match((await c.as({ url: `/admin/photos/${quai.id}` })).body, /Ni accord ni refus pour l’instant/);
  // Refus : la fiche ne publie plus, l'action groupée non plus.
  await c.hello({ ref: 'J-0142', decision: 'refus' });
  const refusedEdit = await c.post(`/admin/photos/${deux.id}`, { title: deux.title, slug: deux.slug, category_id: deux.category_id, author_id: deux.author_id, status: 'published' });
  assert.equal(refusedEdit.statusCode, 422);
  assert.match(refusedEdit.body, /La personne photographiée refuse la publication \(rencontre J-0142\)/);
  const bulk = (await c.json('/admin/photos/actions', { ids: [deux.id], action: 'publish' })).json();
  assert.match(bulk.error || bulk.text, /refuse la publication/);
  assert.equal(c.photo('deux-minuit').status, deux.status);                           // inchangée tant que le refus n'est pas appliqué
  // Appliquer le refus : la photo publiée repasse en brouillon et quitte la file Instagram.
  c.db.prepare("INSERT INTO instagram_posts (photo_id, status, frame, created_at) VALUES (?, 'queued', 'white', 0)").run(quai.id);
  assert.match((await c.as({ url: `/admin/photos/${quai.id}` })).body, /Refuse la publication : la photo ne peut pas être publiée/);
  assert.equal((await c.post(`/admin/rencontres/${id}/refus`)).statusCode, 303);
  assert.deepEqual([c.photo('quai-7h12').status, c.photo('deux-minuit').status], ['draft', 'draft']);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM instagram_posts WHERE photo_id = ? AND status = 'queued'").pluck().get(quai.id), 0);
});

test('carte signée saisie dans l’admin : accord, photo de la carte (privée), effacement ; purge des demandes oubliées', async t => {
  const c = await ctxOf(t);
  const card = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#eee' } }).jpeg().toBuffer();
  const form = multipart([{ name: '_csrf', value: c.csrf }, { name: 'ref', value: 's-87' }, { name: 'name', value: 'Chloé' }, { name: 'met_on', value: '2026-10-12' },
    { name: 'place', value: 'Lisbonne' }, { name: 'signed', value: 'on' }, { name: 'scope_site', value: 'on' }, { name: 'scope_print', value: 'on' }, { name: 'card', filename: 'IMG.jpg', value: card }]);
  const r = await c.as({ method: 'POST', url: '/admin/rencontres', ...form });
  assert.equal(r.statusCode, 303);
  const e = c.db.prepare("SELECT * FROM encounters WHERE ref = 'S-0087'").get();
  assert.deepEqual([e.consent_source, e.verified, JSON.parse(e.consent).print, JSON.parse(e.consent).instagram, e.status], ['carte', 1, true, false, 'en_cours']);
  assert.equal(e.author_id, c.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get());
  const img = await c.as({ url: `/admin/rencontres/${e.id}/carte` });
  assert.deepEqual([img.statusCode, img.headers['content-type'], img.headers['cache-control']], [200, 'image/jpeg', 'no-store']);
  assert.notEqual((await c.app.inject(`/admin/rencontres/${e.id}/carte`)).statusCode, 200);
  assert.match((await c.as({ url: `/admin/rencontres/${e.id}` })).body, /Accord signé : site, expositions et tirages/);
  // CSRF exigé sur l'envoi multipart.
  const noCsrf = multipart([{ name: 'ref', value: 'S-0088' }]);
  assert.equal((await c.as({ method: 'POST', url: '/admin/rencontres', ...noCsrf })).statusCode, 403);
  // Effacement à la demande de la personne.
  assert.equal((await c.post(`/admin/rencontres/${e.id}/supprimer`)).statusCode, 303);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounters').pluck().get(), 0);
  // Purge : sans accord ni refus et sans nouvelle depuis plus de 12 mois.
  await c.hello({ met_on: '2025-01-02', place: 'Nantes', wants_photo: 'on', email: 'old@exemple.fr' });
  await c.hello({ ref: 'J-0001', decision: 'refus' });
  c.db.prepare('UPDATE encounters SET updated_at = ?').run(Date.now() - 400 * 864e5);
  assert.equal(c.app.encounters.purge(), 1);
  assert.equal(c.db.prepare('SELECT ref FROM encounters').pluck().get(), 'J-0001');      // le refus est gardé
});

test('accord par session : les photos du photographe ce jour-là sont couvertes, exclusion possible ; visage sur la fiche', async t => {
  const c = await ctxOf(t);
  const julien = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const ids = c.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id LIMIT 3').pluck().all(julien);
  c.db.prepare("UPDATE photos SET taken_on = '2026-10-14' WHERE id IN (?, ?)").run(ids[0], ids[1]);
  c.db.prepare("UPDATE photos SET taken_on = '2026-10-13' WHERE id = ?").run(ids[2]);
  // Carte signée le 14 octobre, avec le visage de la personne.
  const face = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#a88' } }).jpeg().toBuffer();
  const form = multipart([{ name: '_csrf', value: c.csrf }, { name: 'ref', value: 'J-0200' }, { name: 'name', value: 'Lou' }, { name: 'met_on', value: '2026-10-14' },
    { name: 'signed', value: 'on' }, { name: 'scope_site', value: 'on' }, { name: 'portrait', filename: 'lou.jpg', value: face }]);
  assert.equal((await c.as({ method: 'POST', url: '/admin/rencontres', ...form })).statusCode, 303);
  const e = c.db.prepare("SELECT * FROM encounters WHERE ref = 'J-0200'").get();
  assert.ok(e.portrait_jpeg);
  assert.deepEqual(c.app.encounters.session(e.id).photos.map(p => p.id).sort(), [ids[0], ids[1]].sort());
  // La fiche de chaque photo du jour montre l'accord ; pas celle de la veille.
  const fiche = (await c.as({ url: `/admin/photos/${ids[0]}` })).body;
  assert.match(fiche, /Personnes &amp; accords/);
  assert.match(fiche, /Rencontre J-0200 · Lou<\/a> <span class="mono">même sortie<\/span>/);
  assert.match(fiche, /class="enc-face"/);
  assert.doesNotMatch((await c.as({ url: `/admin/photos/${ids[2]}` })).body, /J-0200/);
  // Exclure une photo du jour : elle n'est plus couverte.
  await c.post(`/admin/rencontres/${e.id}/session/${ids[1]}`, { exclure: '1' });
  assert.doesNotMatch((await c.as({ url: `/admin/photos/${ids[1]}` })).body, /J-0200/);
  assert.match((await c.as({ url: `/admin/rencontres/${e.id}` })).body, /exclue/);
  // Horloge de l'appareil décalée d'un jour : la date de session corrige.
  const fix = multipart([{ name: '_csrf', value: c.csrf }, { name: 'ref', value: 'J-0200' }, { name: 'name', value: 'Lou' }, { name: 'met_on', value: '2026-10-14' },
    { name: 'session_day', value: '2026-10-13' }, { name: 'signed', value: 'on' }, { name: 'scope_site', value: 'on' }]);
  await c.as({ method: 'POST', url: `/admin/rencontres/${e.id}`, ...fix });
  assert.deepEqual(c.app.encounters.session(e.id).photos.map(p => p.id), [ids[2]]);
  assert.ok(c.db.prepare('SELECT portrait_jpeg FROM encounters WHERE id = ?').pluck().get(e.id));   // visage gardé
  // Vignette du visage dans la liste.
  assert.match((await c.as({ url: '/admin/rencontres' })).body, new RegExp(`/admin/rencontres/${e.id}/portrait\\?mini=1`));
  const mini = await c.as({ url: `/admin/rencontres/${e.id}/portrait?mini=1` });
  assert.deepEqual([(await sharp(mini.rawPayload).metadata()).width], [160]);
});
