import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { createFeedback } from '../server/feedback.js';
import { createSearch } from '../server/search.js';
import { createShares } from '../server/share.js';
import { slugify } from '../server/slug.js';
import { photoMap } from '../server/photo-map.js';
import { barsAndLine } from '../server/charts.js';
import { UI } from '../server/i18n.js';

// Non-régression de la revue de sécurité et de code du 16 octobre 2026, site public : code de contrôle des cartes
// (plus d'oracle sur /bonjour/<réf>, essais faux comptés par référence), redirection du sélecteur de langue, « j'aime »
// (mémoire bornée, « j'aime » ignoré signalé), demandes RGPD (origine contrôlée, relances sérialisées), recherche
// (ß, œ…, documents gardés, ordre de la galerie, une lettre), photo offerte (rendu gardé, HEAD), carte de la page photo,
// voyage dans l'ordre du jour, pluriels, ponctuation, partages au jour de Paris, vues de la photo suivante, scans de QR,
// accessibilité des formulaires et du bouton « J'aime », polices et italiques des thèmes, graphiques de l'admin,
// méta-description, contacts des pages Confidentialité et Mentions légales.

const main = html => (/<main[\s\S]*<\/main>/.exec(html) || [''])[0];
const set = (db, key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));

// ---------- A019 : code de contrôle des cartes ----------

test('A019 : /bonjour/<réf> ne dit plus si le code est bon (même page, code prérempli tel quel), dans les trois langues', async t => {
  const { app } = await setup(t, { seeded: true });
  const good = app.encounters.codeOf('J-0142');
  const bad = (good[0] === 'A' ? 'B' : 'A') + good.slice(1);
  for (const prefix of ['', '/en', '/de']) {
    const ok = await app.inject(`${prefix}/bonjour/J-0142-${good}`);
    const ko = await app.inject(`${prefix}/bonjour/J-0142-${bad}`);
    assert.equal(ok.statusCode, 200);
    assert.equal(ko.statusCode, ok.statusCode);
    assert.match(ko.body, new RegExp(`name="ref" value="J-0142-${bad}"`));                 // prérempli, même faux
    assert.equal(main(ko.body).replaceAll(bad, 'XXX'), main(ok.body).replaceAll(good, 'XXX'), prefix);
  }
  assert.match((await app.inject(`/bonjour/J-0142-${bad}`)).body, /J-0142 · Carte de Julien : merci de l’avoir gardée\./);
  // Page « trop de demandes » (429) : la même, code bon ou faux.
  const flood = ref => app.inject({ method: 'POST', url: '/bonjour', payload: { ref, wants_photo: 'on', email: 'x@exemple.fr' }, remoteAddress: '198.51.100.30' });
  for (let i = 0; i < 8; i++) await flood('J-0999');
  const a = await flood(`J-0142-${good}`), b = await flood(`J-0142-${bad}`);
  assert.deepEqual([a.statusCode, b.statusCode], [429, 429]);
  assert.equal(main(b.body).replaceAll(bad, 'XXX'), main(a.body).replaceAll(good, 'XXX'));
});

test('A019 : 5 codes faux par référence en 24 h, d’où qu’ils viennent ; au-delà, tout code est ignoré (la rencontre établie ne bouge pas)', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const jul = db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const id = app.encounters.saveCard(null, { ref: 'J-0007', signed: 'on', scope_site: 'on', author_id: jul, name: 'Personne', email: 'personne@example.org', met_on: '2026-10-10' });
  const good = app.encounters.codeOf('J-0007');
  const wrong = [...'ABCDEFGHJK'].map(c => `${c}${c}${c}`).filter(c => c !== good);
  let ip = 10;
  const post = (code, extra = {}) => app.inject({ method: 'POST', url: '/bonjour', remoteAddress: `203.0.113.${ip++}`,
    payload: { ref: `J-0007-${code}`, decision: 'accord', scope_site: 'on', scope_instagram: 'on', email: 'attaquant@evil.example', name: 'Attaquant', rights: 'acces', ...extra } });
  for (let i = 0; i < 5; i++) {
    const r = await post(wrong[i]);
    assert.equal(r.statusCode, 422);
    assert.match(r.body, /Le code de la carte ne correspond pas/);
  }
  // Référence bloquée : le bon code ne vérifie plus rien, un faux ne se distingue plus.
  const withGood = await post(good);
  const withWrong = await post(wrong[5]);
  assert.deepEqual([withGood.statusCode, withGood.headers.location], [303, '/bonjour/merci?ref=J-0007']);
  assert.deepEqual([withWrong.statusCode, withWrong.headers.location], [303, '/bonjour/merci?ref=J-0007']);
  let e = app.encounters.get(id);
  assert.deepEqual([e.email, e.name, e.consent_source, e.consent.instagram, e.refused], ['personne@example.org', 'Personne', 'carte', false, 0]);
  const last = app.encounters.events(id).at(-1);
  assert.equal(last.detail.non_verifiee, true);
  assert.equal(last.verified, 0);
  // Une autre référence n'est pas touchée.
  const other = app.encounters.codeOf('J-0008');
  assert.equal((await app.inject({ method: 'POST', url: '/bonjour', payload: { ref: `J-0008-${other}`, wants_photo: 'on', email: 'b@exemple.fr' }, remoteAddress: '203.0.113.90' })).statusCode, 303);
  assert.equal(db.prepare("SELECT verified FROM encounters WHERE ref = 'J-0008'").pluck().get(), 1);
  // 24 h plus tard : le bon code vérifie de nouveau.
  db.prepare('UPDATE card_code_failures SET at = at - ?').run(25 * 3600 * 1000);
  assert.equal((await post(good, { email: 'personne@example.org', name: 'Personne', scope_instagram: '', rights: '' })).statusCode, 303);
  e = app.encounters.get(id);
  assert.deepEqual([e.consent_source, e.verified], ['en_ligne', 1]);
  // Essais périmés effacés au passage (au prochain code faux, quelle que soit la référence).
  await app.inject({ method: 'POST', url: '/bonjour', payload: { ref: `J-0008-${wrong.find(c => c !== other)}`, wants_photo: 'on', email: 'b@exemple.fr' }, remoteAddress: '203.0.113.91' });
  assert.equal(db.prepare('SELECT COUNT(*) FROM card_code_failures').pluck().get(), 1);
});

// ---------- A020 : sélecteur de langue ----------

test('A020 : /langue/<l>?vers= ne mène jamais hors du site, même après le retrait du préfixe de langue', async t => {
  const { app } = await setup(t, { seeded: true });
  const to = async (lang, vers) => { const r = await app.inject(`/langue/${lang}?vers=${vers}`); return [r.statusCode, r.headers.location]; };
  for (const vers of ['%2Fen%2F%2Fevil.example', '/de//evil.example', '/de/%5Cevil.example', '/%09/evil.example', '/en/%09/evil.example', '/%0A/x', '/en/%0D/x', '%2F%2Fexemple.org', 'https://evil.example/']) {
    assert.deepEqual(await to('fr', vers), [303, '/'], vers);
  }
  assert.deepEqual(await to('de', '%2Fen%2Fphoto%2Fquai-7h12%3Fserie%3Drue'), [303, '/de/photo/quai-7h12?serie=rue']);
  assert.deepEqual(await to('en', '/%E2%82%AC'), [303, '/en/%E2%82%AC']);                           // caractère non ASCII : encodé, pas d'erreur
  assert.deepEqual(await to('fr', '/en/a-propos'), [303, '/a-propos']);
});

// ---------- A022 : j'aime ----------

test('A022 : un « j’aime » ignoré (même adresse) est signalé ; mémoire bornée, entrées expirées oubliées', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const p = db.prepare("SELECT slug, id FROM photos WHERE status = 'published' ORDER BY position LIMIT 1").get();
  const like = payload => app.inject({ method: 'POST', url: `/photo/${p.slug}/aime`, payload, remoteAddress: '198.51.100.7', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' } });
  assert.deepEqual((await like('')).json(), { likes: 1, liked: true, counted: true, label: '1 j’aime' });
  const again = (await like('')).json();                                                // un autre navigateur, même box
  assert.deepEqual([again.likes, again.counted], [1, false]);
  assert.match(fs.readFileSync(new URL('../public/js/site.js', import.meta.url), 'utf8'), /r\.counted === false/);
  // Mémoire : plafonnée (les plus anciennes oubliées), et purgée par la tête après 12 h.
  let clock = 0;
  const f = createFeedback({ db, now: () => clock, maxSeen: 3 });
  for (const c of ['a', 'b', 'c', 'd']) assert.equal(f.like(p.id, c).counted, true);
  assert.equal(f.like(p.id, 'a').counted, true);                                           // « a » oublié (plafond)
  assert.equal(f.like(p.id, 'd').counted, false);
  clock = 12 * 3600 * 1000 + 1;
  assert.equal(f.like(p.id, 'd').counted, true);                                           // 12 h plus tard
  assert.equal(f.like(p.id, 'zz', { undo: true }).counted, false);                          // rien à retirer
});

// ---------- A024 : demandes RGPD ----------

test('A024 : /bonjour refuse un envoi depuis un autre site ; demandes simultanées : une relance chacune, pas de doublon', async t => {
  const sent = [];
  const { app, db } = await setup(t, { seeded: true, mailTransport: { sendMail: async m => { await new Promise(r => setTimeout(r, 40)); sent.push(m); } } });
  app.accounts.ensure({ sub: 'root', name: 'root', email: 'root@example.org', roles: ['admin'] });
  const count = () => db.prepare('SELECT COUNT(*) FROM encounters').pluck().get();
  const r = await app.inject({ method: 'POST', url: '/bonjour', headers: { origin: 'https://evil.example' }, payload: { met_on: '2026-10-10', place: 'Angers', rights: 'effacement' }, remoteAddress: '203.0.113.40' });
  assert.deepEqual([r.statusCode, r.headers.location, count()], [303, '/bonjour/merci', 0]);
  const res = await Promise.all([1, 2, 3, 4].map(i => app.inject({ method: 'POST', url: '/bonjour', payload: { met_on: '2026-10-10', place: `Lieu ${i}`, rights: 'effacement' }, remoteAddress: `203.0.113.${50 + i}` })));
  assert.ok(res.every(x => x.statusCode === 303));
  await app.reminders.rights();                                                            // attend le passage en cours
  assert.equal(count(), 4);
  assert.equal(sent.length, 4);
  assert.equal(new Set(sent.map(m => m.text)).size, 4);
});

// ---------- A026, A083, A092 : recherche ----------

test('A026, A083, A092 : ß, œ… repliés ; documents gardés mais à jour ; ex aequo dans l’ordre de la galerie ; adresses', async t => {
  const { db } = await setup(t, { seeded: true });
  const s = createSearch({ db });
  const brume = db.prepare("SELECT id FROM photos WHERE slug = 'brume-sur-la-loire'").pluck().get();
  db.prepare("UPDATE photos SET title_de = 'Nebel an der Straße', legend = 'Au cœur de la ville, Ærø' WHERE id = ?").run(brume);
  for (const q of ['strasse', 'Straße', 'coeur', 'cœur', 'aero']) assert.deepEqual(s.find(q), [brume], q);
  // Gardés d'une recherche à l'autre, recalculés pour la photo modifiée (même sans date de modification).
  db.prepare("UPDATE photos SET title_de = 'Nebel' WHERE id = ?").run(brume);
  assert.deepEqual(s.find('strasse'), []);
  // À score égal : l'ordre de la galerie.
  const two = db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY position LIMIT 2").pluck().all();
  db.prepare("UPDATE photos SET keywords = 'zebre' WHERE id IN (?, ?)").run(...two);
  db.prepare('UPDATE photos SET position = CASE id WHEN ? THEN 100 ELSE 101 END WHERE id IN (?, ?)').run(two[1], ...two);
  assert.deepEqual(s.find('zebre'), [two[1], two[0]]);
  assert.deepEqual([slugify('Cœur de ville'), slugify('Straße'), slugify('Ærøskøbing'), slugify('Łódź')], ['coeur-de-ville', 'strasse', 'aeroskobing', 'lodz']);
});

test('A089, A090, A091 : titre de la recherche ponctué selon la langue ; une seule lettre expliquée ; aide complète', async t => {
  const { app } = await setup(t, { seeded: true });
  assert.match((await app.inject('/en/recherche?q=x')).body, /<title>Search: x · Test<\/title>/);
  assert.match((await app.inject('/de/recherche?q=Nebel')).body, /<title>Suchen: Nebel · Test<\/title>/);
  const fr = (await app.inject('/recherche?q=x')).body;
  assert.match(fr, /<title>Rechercher : x · Test<\/title>/);
  assert.match(fr, /role="status">Tapez au moins deux lettres\./);
  assert.match(fr, /séries, photographes et mots-clés/);
  assert.match((await app.inject('/en/recherche?q=%C3%A9')).body, /Type at least two letters\./);
  assert.doesNotMatch((await app.inject('/recherche')).body, /au moins deux lettres/);
  assert.match((await app.inject('/')).body, /data-announce data-colon=" :"/);
  assert.match((await app.inject('/en/')).body, /data-announce data-colon=":"/);
});

// ---------- A082 : photo offerte ----------

test('A082 : photo offerte rendue une fois puis gardée ; un HEAD ne compte pas comme un téléchargement', async t => {
  const { app, db, dir } = await setup(t, { seeded: true });
  const jul = db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const photo = db.prepare("SELECT id FROM photos WHERE author_id = ? AND status = 'published' LIMIT 1").pluck().get(jul);
  const original = `${dir}/originals/${db.prepare('SELECT file FROM photos WHERE id = ?').pluck().get(photo)}`;
  const id = app.encounters.saveCard(null, { ref: 'J-0300', author_id: jul, met_on: '2026-10-10' });
  app.encounters.link(id, [photo]);
  const token = app.encounters.createShare(id, photo);
  assert.equal((await app.inject({ method: 'HEAD', url: `/pour-vous/${token}/photo.jpg` })).statusCode, 200);
  const a = await app.inject(`/pour-vous/${token}/photo.jpg`);
  fs.renameSync(original, `${original}.cache`);                                             // l'original n'est plus relu
  const b = await app.inject(`/pour-vous/${token}/photo.jpg`);
  fs.renameSync(`${original}.cache`, original);
  assert.deepEqual([a.statusCode, b.statusCode], [200, 200]);
  assert.ok(a.rawPayload.equals(b.rawPayload));
  assert.equal(db.prepare('SELECT downloads FROM encounter_shares WHERE token = ?').pluck().get(token), 2);
});

// ---------- A085 : carte de la page photo ----------

test('A085 : une ville très fournie ne cache pas ses voisines sur la carte de la page photo', () => {
  const PARIS = 990000001, VERSAILLES = 990000002;                                          // identifiants fictifs
  const at = (id, city, lat, lon) => ({ id, slug: `p${id}`, on_map: 1, city_id: city, city_lat: lat, city_lon: lon, city_name: city === PARIS ? 'Paris' : 'Versailles', city_cc: 'FR' });
  const photos = [...Array.from({ length: 61 }, (_, i) => at(i + 1, PARIS, 48.85, 2.35)), at(100, VERSAILLES, 48.80, 2.13)];
  const m = photoMap(photos[0], photos, 'fr');
  assert.deepEqual(m.others.map(o => [o.cityId, o.city]), [[VERSAILLES, 'Versailles']]);
  assert.equal(m.me.same, 60);
  assert.equal(m.count, 61);
});

// ---------- A086 : voyage ----------

test('A086 : page publique d’un voyage : photos d’une journée dans l’ordre de prise de vue, couverture de l’admin', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const [a, b] = db.prepare("SELECT id, author_id, slug FROM photos WHERE author_id = (SELECT id FROM authors WHERE slug = 'julien') AND status = 'published' ORDER BY position LIMIT 2").all();
  db.prepare("UPDATE photos SET taken_on = '2025-05-01', taken_time = '18:00' WHERE id = ?").run(a.id);  // la première de la galerie, le soir
  db.prepare("UPDATE photos SET taken_on = '2025-05-01', taken_time = '08:00' WHERE id = ?").run(b.id);
  const trip = app.trips.create({ name: 'Essai' });
  app.trips.addDays(trip, [{ author_id: a.author_id, day: '2025-05-01' }]);
  app.trips.update(trip, { public: true });
  const html = (await app.inject('/voyage/essai')).body;
  assert.ok(html.indexOf(`href="/photo/${b.slug}"`) < html.indexOf(`href="/photo/${a.slug}"`));
  assert.equal(app.trips.get(trip).cover.id, b.id);                                         // couverture de l'admin…
  const card = /<a class="trip-card"[\s\S]*?<\/a>/.exec((await app.inject('/voyages')).body)[0];   // … et du site
  const stem = id => db.prepare('SELECT file FROM photos WHERE id = ?').pluck().get(id).split('.')[0];
  assert.ok(card.includes(stem(b.id)) && !card.includes(stem(a.id)));
});

// ---------- A088 : pluriels ----------

test('A088 : pluriels à zéro selon la langue (0 photo en français, 0 photos / 0 Fotos ailleurs)', () => {
  assert.deepEqual([UI.fr.photos(0), UI.fr.photos(1), UI.fr.photos('05'), UI.fr.photos('01')], ['0 photo', '1 photo', '05 photos', '01 photo']);
  assert.deepEqual([UI.en.photos(0), UI.en.photos('00'), UI.en.photos(1), UI.en.photos(2), UI.en.places(0)], ['0 photos', '00 photos', '1 photo', '2 photos', '0 places']);
  assert.deepEqual([UI.de.photos(0), UI.de.photos(1), UI.de.places(3)], ['0 Fotos', '1 Foto', '3 Orte']);
});

// ---------- A093 : partages ----------

test('A093 : un partage est daté du jour de Paris (0 h 30 le 16 : le 16, pas la veille)', async t => {
  const { db } = await setup(t, { seeded: true });
  const photo = db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  createShares({ db, now: () => new Date('2026-10-15T22:30:00Z') }).record(photo, 'copie');
  assert.equal(db.prepare('SELECT day FROM photo_shares WHERE photo_id = ?').pluck().get(photo), '2026-10-16');
});

// ---------- A094, A095, A096, A104 : page photo ----------

test('A094, A095, A096, A104 : image suivante préparée (pas la page), scan de QR compté une fois, bouton « J’aime », description', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const p = db.prepare("SELECT id, slug FROM photos WHERE status = 'published' ORDER BY position LIMIT 1").get();
  const page = (await app.inject(`/photo/${p.slug}`)).body;
  assert.doesNotMatch(page, /rel="prefetch"/);
  assert.match(page, /<template data-next-image><picture>[\s\S]*?<\/picture><\/template>/);
  assert.doesNotMatch(/<template data-next-image>[\s\S]*?<\/template>/.exec(page)[0], /loading="lazy"/);
  // J'aime : nom = « J'aime » + compteur visible, état par aria-pressed seul, total annoncé.
  const btn = /<button type="submit" class="like"[^>]*>[\s\S]*?<\/button>/.exec(page)[0];
  assert.doesNotMatch(btn, /aria-label/);
  assert.match(btn, /<span class="sr-only">J’aime, <\/span>[\s\S]*data-like-n>0 j’aime</);
  assert.match(page, /<span class="sr-only" aria-live="polite" data-like-live><\/span>/);
  // QR : compté, puis l'adresse est nettoyée.
  const ua = { 'user-agent': 'Mozilla/5.0' };
  const r = await app.inject({ url: `/photo/${p.slug}?partage=qr`, headers: ua });
  assert.deepEqual([r.statusCode, r.headers.location], [303, `/photo/${p.slug}`]);
  await app.inject({ url: r.headers.location, headers: ua });
  assert.equal(app.shares.forPhoto(p.id), 1);
  // Méta-description : légende coupée, l'auteur reste.
  db.prepare('UPDATE photos SET legend = ? WHERE id = ?').run('Une très longue légende. '.repeat(80), p.id);
  const desc = /<meta name="description" content="([^"]*)"/.exec((await app.inject(`/photo/${p.slug}`)).body)[1];
  assert.ok(desc.length < 260, String(desc.length));
  assert.match(desc, /…/);
  assert.match(desc, /Sébastien|Julien/);
});

// ---------- A097, A098 : formulaires ----------

test('A097, A098 : erreurs reliées aux champs, la liste prend le focus ; bouton « Envoyer » de Signaler stylé', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const r = await app.inject({ method: 'POST', url: '/en/bonjour', payload: { ref: '', decision: '' }, remoteAddress: '203.0.113.70' });
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /<div class="hello-errors" id="erreurs" role="alert" tabindex="-1" autofocus>/);
  assert.match(r.body, /<li id="err-where">/);
  assert.match(r.body, /<li id="err-what">/);
  assert.match(r.body, /name="place"[^>]*aria-invalid="true" aria-describedby="err-where"/);
  assert.match(r.body, /<fieldset aria-invalid="true" aria-describedby="err-what">/);
  const slug = db.prepare("SELECT slug FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  const rep = await app.inject({ method: 'POST', url: `/photo/${slug}/signaler`, payload: { kind: 'texte' }, remoteAddress: '203.0.113.71' });
  assert.equal(rep.statusCode, 422);
  assert.match(rep.body, /<textarea name="message"[^>]*aria-invalid="true" aria-describedby="err-message"/);
  assert.match(rep.body, /<li id="err-message">/);
  assert.match(rep.body, /<button class="hello-send eyebrow" type="submit">Envoyer<\/button>/);
  assert.doesNotMatch(rep.body, /class="btn"/);
});

// ---------- A084, A101 : feuilles de style ----------

test('A084, A101 : champs des formulaires publics à 3:1 et contour de focus gardé ; fenêtre Partager sans italique imposée', () => {
  const css = fs.readFileSync(new URL('../public/css/site.css', import.meta.url), 'utf8');
  const theme = fs.readFileSync(new URL('../public/themes/nicephos.css', import.meta.url), 'utf8');
  const L = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const v = (src, scope, name) => new RegExp(`${scope}[^}]*--${name}: (#[0-9a-f]{6})`).exec(src)[1];
  assert.ok(ratio(v(css, ':root', 'field'), v(css, ':root', 'paper')) >= 3);
  for (const mode of ['mode-nuit', 'mode-jour']) assert.ok(ratio(v(theme, `\\.${mode}`, 'field'), v(theme, `\\.${mode}`, 'paper')) >= 3, mode);
  assert.match(css, /\.hello-form input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\), \.hello-form textarea \{[^}]*border-bottom: 1px solid var\(--field\)/);
  assert.doesNotMatch(css, /\.hello-form[^{]*:focus[^{]*\{[^}]*outline: none/);
  assert.doesNotMatch(css, /\.share-(h|card)[^{]*\{[^}]*font: italic/);
});

// ---------- A099, A100 : partager, polices ----------

test('A099, A100 : liens de partage annoncés « nouvelle fenêtre » ; police préchargée selon le thème', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const slug = db.prepare("SELECT slug FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  const share = (await app.inject(`/de/photo/${slug}/partager`)).body;
  assert.match(share, /target="_blank"[^>]*data-via="facebook">[\s\S]*?<span>Facebook<span class="sr-only"> \(neues Fenster\)<\/span><\/span>/);
  assert.doesNotMatch(/data-via="email">[\s\S]*?<\/a>/.exec(share)[0], /sr-only/);
  assert.match((await app.inject('/')).body, /rel="preload" href="\/fonts\/cormorant-garamond\/files\/cormorant-garamond-latin-400-italic\.woff2"/);
  set(db, 'theme', 'nicephos-nuit');
  const home = (await app.inject('/')).body;
  assert.doesNotMatch(home, /italic\.woff2/);
  assert.match(home, /rel="preload" href="\/fonts\/jost\/files\/jost-latin-300-normal\.woff2"/);
});

// ---------- A102, A103 : graphiques de l'admin ----------

test('A102, A103 : graduation du milieu entière ; infobulles des barres dans la langue de l’admin', async t => {
  const axis = svg => [...svg.matchAll(/<text class="c-axis"[^>]*text-anchor="end">(\d+)<\/text>/g)].map(m => Number(m[1]));
  const chart = max => barsAndLine([{ label: 'a', views: max, visitors: 0 }]);
  assert.deepEqual(axis(chart(1)), [0, 1, 2]);
  assert.deepEqual(axis(chart(3)), [0, 2, 4]);
  assert.deepEqual(axis(chart(7)), [0, 4, 8]);
  assert.deepEqual(axis(chart(40)), [0, 20, 40]);
  assert.match(chart(1), /<title>a : 1 vue, 0 visiteur<\/title>/);
  const { app, db } = await setup(t, { seeded: true });
  app.accounts.ensure({ sub: 'root', name: 'root', roles: ['admin'] });
  const token = createSessionStore(db).create({ sub: 'root', name: 'root', roles: [] });
  const en = (await app.inject({ url: '/admin/statistiques', cookies: { session: token, admin_langue: 'en' } })).body;
  assert.match(en, /<title>[^<]*: 0 views, 0 visitors<\/title>/);
  assert.doesNotMatch(en, /vues, 0 visiteurs/);
  const de = (await app.inject({ url: '/admin/statistiques', cookies: { session: token, admin_langue: 'de' } })).body;
  assert.match(de, /<title>[^<]*: 0 Aufrufe, 0 Besucher<\/title>/);
});

// ---------- A105 : contacts ----------

test('A105 : Confidentialité : contact de repli dans la langue de la page, adresse web cliquable ; Impressum : pas d’URL en « E-Mail »', async t => {
  const { app, db } = await setup(t, { seeded: true });
  set(db, 'privacy_contact', '');
  set(db, 'rights_contact', '');
  assert.match((await app.inject('/en/confidentialite')).body, /or at localhost:3000\/en\/bonjour\./);
  set(db, 'privacy_contact', 'https://exemple.org/contact');
  assert.match((await app.inject('/de/confidentialite')).body, /<a class="more" href="https:\/\/exemple\.org\/contact">https:\/\/exemple\.org\/contact<\/a>/);
  const de = (await app.inject('/de/mentions-legales')).body;
  assert.doesNotMatch(de, /E-Mail: https/);
  set(db, 'privacy_contact', 'contact@exemple.org');
  assert.match((await app.inject('/de/mentions-legales')).body, /E-Mail: <a class="more" href="mailto:contact@exemple\.org">contact@exemple\.org<\/a>/);
});
