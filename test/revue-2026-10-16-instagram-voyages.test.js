import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { tripStory } from '../server/trip-story.js';
import { createSearch } from '../server/search.js';
import { search as cities } from '../server/geo/cities.js';
import { renderCaption, parseTimes, InstagramError } from '../server/instagram.js';
import { checkBudget, normalizeLimits, rateLimitFrom, whenText, LIMIT_DEFAULTS, BOUNDS, MAX_PAUSE } from '../server/instagram-limits.js';
import { meilleur } from './duree.js';

// Non-régression de la revue du 16 octobre 2026, sous-système « Instagram et voyages » : ville d'une photo hors
// carte jamais montrée (voyage, recherche) ; aperçu d'un voyage selon la portée ; page publique d'un voyage soumise
// au circuit de publication ; dates impossibles ; « Publier les photos prêtes » sans les programmées ni les renvoyées ;
// changement de photographe et journées d'un voyage commun ; adresse figée une fois en ligne ; légende sans retour
// arrière coûteux ; attentes absurdes de Meta ; quota lu périmé ; « Réessayer » et « Retirer » ; connexion sous limite ;
// heures et limites saisies ; heures dans la langue de l'admin ; accessibilité de la page Instagram et du voyage.

const H = 3600 * 1000;
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
const flashOf = res => decodeURIComponent(cookiesOf(res).flash || '');
const pt = name => cities(name, 10).find(c => c.cc === 'PT');

async function world(t, opts = {}) {
  const ctx = await setup(t, { seeded: true, ...opts });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const as = (sub, roles, authorId = null) => {
    ctx.app.accounts.ensure({ sub, name: sub, roles });
    if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token };
    return {
      id: () => ctx.app.accounts.bySub(sub).id,
      get: url => ctx.app.inject({ url, cookies, headers: { accept: 'text/html' } }),
      post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
    };
  };
  const trip = id => ctx.db.prepare('SELECT * FROM trips WHERE id = ?').get(id);
  const lastTrip = () => ctx.db.prepare('SELECT * FROM trips ORDER BY id DESC LIMIT 1').get();
  const tripDays = id => ctx.db.prepare('SELECT author_id, day FROM trip_days WHERE trip_id = ? ORDER BY day, author_id').all(id);
  const photo = id => ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  const photosOf = a => ctx.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id').pluck().all(a);
  return { ...ctx, seb, jul, as, trip, lastTrip, tripDays, photo, photosOf };
}

// ---------- voyages ----------

test('voyage public et recherche : la ville d’une photo hors carte (déduite du GPS) n’est jamais montrée', async t => {
  const c = await world(t);
  const [id] = c.photosOf(c.seb);
  const sintra = pt('Sintra');
  c.db.prepare("UPDATE photos SET status = 'published', taken_on = '2025-09-03', place = '', title = 'Secret', legend = '', keywords = '', city_id = ?, city_name = ?, city_cc = ?, city_lat = ?, city_lon = ?, city_source = 'gps', on_map = 0 WHERE id = ?")
    .run(sintra.id, sintra.name, sintra.cc, sintra.lat, sintra.lon, id);
  const tr = c.app.trips.create({ name: 'Secret', authorId: c.seb });
  c.app.trips.update(tr, { public: true });
  c.app.trips.addDays(tr, [{ author_id: c.seb, day: '2025-09-03' }]);
  // Récit : le jour existe, sans ville ni étape ; la page ne nomme pas Sintra.
  const story = tripStory({ trip: c.app.trips.get(tr), photos: c.app.trips.photos(tr), lang: 'fr', locale: 'fr-FR' });
  assert.deepEqual([story.days.length, story.days[0].city, story.days[0].place, story.stops.length], [1, '', '', 0]);
  const page = await c.app.inject('/voyage/secret');
  assert.equal(page.statusCode, 200);
  assert.doesNotMatch(page.body, /Sintra/);
  assert.doesNotMatch(page.body, /class="trip-svg"/);
  // La recherche par ville ne trouve pas la photo hors carte.
  assert.deepEqual(createSearch({ db: c.db }).find('sintra'), []);
  // Cochée « Afficher sur la carte du monde » : ville, étape et recherche.
  c.db.prepare('UPDATE photos SET on_map = 1 WHERE id = ?').run(id);
  assert.match((await c.app.inject('/voyage/secret')).body, /trip-tag-city[^>]*>Sintra</);
  assert.deepEqual(createSearch({ db: c.db }).find('sintra'), [id]);
});

test('aperçu d’un voyage non publié : la portée de l’admin (« les miennes »), et jamais en cache', async t => {
  const c = await world(t);
  const seb = c.as('seb', ['photographe'], c.seb), jul = c.as('jul', ['photographe'], c.jul), admin = c.as('root', ['admin']);
  c.db.prepare("UPDATE photos SET status = 'published', taken_on = '2025-04-01' WHERE id = ?").run(c.photosOf(c.jul)[0]);
  const mine = c.app.trips.create({ name: 'Projet confidentiel Julien', authorId: c.jul });
  c.app.trips.update(mine, { intro: 'Texte de travail non publié' });
  c.app.trips.addDays(mine, [{ author_id: c.jul, day: '2025-04-01' }]);
  const common = c.app.trips.create({ name: 'Commun secret' });
  for (const url of ['/voyage/projet-confidentiel-julien', '/en/voyage/projet-confidentiel-julien', '/voyage/commun-secret']) {
    assert.equal((await seb.get(url)).statusCode, 404, url);
  }
  assert.equal((await jul.get('/voyage/commun-secret')).statusCode, 404);           // comme dans l'admin
  const own = await jul.get('/voyage/projet-confidentiel-julien');
  assert.equal(own.statusCode, 200);
  assert.equal(own.headers['cache-control'], 'private, no-store');
  assert.equal(own.headers['x-robots-tag'], 'noindex');
  assert.equal((await admin.get('/voyage/commun-secret')).statusCode, 200);
  assert.equal((await c.app.inject('/voyage/projet-confidentiel-julien')).statusCode, 404);
  // Bandeau d'aperçu dans la langue de la page ; carte défilante nommée (région).
  const en = (await admin.get('/en/voyage/projet-confidentiel-julien')).body;
  assert.match(en, /Team-only preview: this trip is not published/);
  assert.match(en, />Trip settings</);
  assert.doesNotMatch(en, /Aperçu réservé à l’équipe/);
  assert.ok(common);
});

test('carte publique d’un voyage : conteneur défilant au rôle de région', async t => {
  const c = await world(t);
  const ids = c.photosOf(c.seb).slice(0, 2);
  ids.forEach((id, i) => { const city = pt(i ? 'Porto' : 'Lisboa'); c.db.prepare("UPDATE photos SET status = 'published', on_map = 1, taken_on = ?, city_id = ?, city_name = ?, city_cc = ?, city_lat = ?, city_lon = ? WHERE id = ?").run(`2025-09-0${i + 1}`, city.id, city.name, city.cc, city.lat, city.lon, id); });
  const tr = c.app.trips.create({ name: 'Côte', authorId: c.seb });
  c.app.trips.update(tr, { public: true });
  c.app.trips.addDays(tr, [{ author_id: c.seb, day: '2025-09-01' }, { author_id: c.seb, day: '2025-09-02' }]);
  assert.match((await c.app.inject('/voyage/cote')).body, /<div class="trip-map-scroll" data-trip-scroll tabindex="0" role="region" aria-label="Itinéraire du voyage « Côte »">/);
});

test('/voyages et plan du site : seulement les voyages publiés, sans résumer les voyages privés', async t => {
  const c = await world(t);
  const [id] = c.photosOf(c.seb);
  c.db.prepare("UPDATE photos SET status = 'published', taken_on = '2025-06-01' WHERE id = ?").run(id);
  const open = c.app.trips.create({ name: 'Ouvert', authorId: c.seb });
  c.app.trips.update(open, { public: true });
  c.app.trips.addDays(open, [{ author_id: c.seb, day: '2025-06-01' }]);
  c.app.trips.create({ name: 'Privé', authorId: c.seb });
  c.app.trips.list = () => { throw new Error('liste complète (résumés) lue par une page publique'); };
  const list = await c.app.inject('/voyages');
  assert.equal(list.statusCode, 200);
  assert.match(list.body, /href="\/voyage\/ouvert"/);
  assert.doesNotMatch(list.body, /Privé/);
  const sitemap = (await c.app.inject('/sitemap.xml')).body;
  assert.match(sitemap, /\/voyage\/ouvert</);
  assert.doesNotMatch(sitemap, /\/voyage\/prive</);
});

test('page publique d’un voyage : la mettre en ligne suit le circuit (droit de publier), la retirer reste possible', async t => {
  const c = await world(t);
  const ph = c.as('seb', ['photographe'], c.seb);
  c.db.prepare("UPDATE photos SET status = 'published', taken_on = '2026-08-01' WHERE id = ?").run(c.photosOf(c.seb)[0]);
  await ph.post('/admin/voyages', { name: 'Annonce' });
  const tr = c.lastTrip();
  await ph.post(`/admin/voyages/${tr.id}/journees`, { jours: `${c.seb}:2026-08-01` });
  // Sans « Publier ses photos sans validation » : la case est grisée, la demande est refusée, rien en ligne.
  assert.match((await ph.get(`/admin/voyages/${tr.id}`)).body, /name="public" disabled aria-describedby="tr-public-hint"/);
  const r = await ph.post(`/admin/voyages/${tr.id}`, { public_set: '1', public: 'on', name: 'Annonce', intro: 'TEXTE NON MODÉRÉ' });
  assert.match(flashOf(r), /demande le droit de publier/);
  assert.deepEqual([c.trip(tr.id).public, c.trip(tr.id).intro], [0, '']);
  assert.equal((await c.app.inject('/voyage/annonce')).statusCode, 404);
  // Avec ce droit : en ligne.
  c.app.accounts.setAdjust(ph.id(), 'photos.publier', true);
  await ph.post(`/admin/voyages/${tr.id}`, { public_set: '1', public: 'on', name: 'Annonce', intro: 'Un texte.' });
  assert.equal(c.trip(tr.id).public, 1);
  assert.equal((await c.app.inject('/voyage/annonce')).statusCode, 200);
  // En ligne, sans le droit de modifier ses photos publiées : textes inchangés ; la retirer du site, oui.
  c.app.accounts.setAdjust(ph.id(), 'photos.publier', null);
  c.app.accounts.setAdjust(ph.id(), 'photos.publiees.modifier', false);
  const edit = await ph.post(`/admin/voyages/${tr.id}`, { public_set: '1', public: 'on', name: 'Annonce', intro: 'Autre texte' });
  assert.match(flashOf(edit), /ses textes ne se modifient/);
  assert.equal(c.trip(tr.id).intro, 'Un texte.');
  await ph.post(`/admin/voyages/${tr.id}`, { public_set: '1', name: 'Annonce', intro: 'Un texte.' });
  assert.equal(c.trip(tr.id).public, 0);
});

test('dates impossibles : jamais rattachées, et une ancienne ligne ne fait plus tomber les pages', async t => {
  const c = await world(t);
  const ph = c.as('seb', ['photographe'], c.seb), admin = c.as('root', ['admin']);
  await ph.post('/admin/voyages', { name: 'Calendrier' });
  const tr = c.lastTrip();
  await ph.post(`/admin/voyages/${tr.id}/journees`, { jours: [`${c.seb}:2025-13-01`, `${c.seb}:2025-02-30`, `${c.seb}:2025-00-00`] });
  assert.deepEqual(c.tripDays(tr.id), []);
  assert.equal((await ph.post('/admin/sorties/sebastien/2025-00-00/voyage', { voyage: String(tr.id) })).statusCode, 404);
  assert.match(flashOf(await ph.post(`/admin/voyages/${tr.id}/journees`, { du: '2025-02-30', au: '2025-03-02' })), /Indiquez deux dates/);
  // Ligne enregistrée avant ce contrôle : les pages s'affichent.
  c.db.prepare('INSERT INTO trip_days (trip_id, author_id, day) VALUES (?, ?, ?)').run(tr.id, c.seb, '2025-13-01');
  assert.equal((await ph.get(`/admin/voyages/${tr.id}`)).statusCode, 200);
  assert.equal((await admin.get('/admin/voyages')).statusCode, 200);
});

test('« Publier les photos prêtes » d’un voyage : ni les programmées ni les renvoyées ; le bouton compte juste', async t => {
  const c = await world(t);
  const admin = c.as('root', ['admin']);
  const [plain, proposed, scheduled, back] = c.photosOf(c.seb);
  const later = Date.now() + 30 * 24 * H;
  for (const id of [plain, proposed, scheduled, back]) c.db.prepare("UPDATE photos SET status = 'draft', faces = 0, taken_on = '2025-03-10', review = NULL, publish_at = NULL WHERE id = ?").run(id);
  c.db.prepare("UPDATE photos SET review = 'proposee' WHERE id = ?").run(proposed);
  c.db.prepare("UPDATE photos SET review = 'programmee', publish_at = ? WHERE id = ?").run(later, scheduled);
  c.db.prepare("UPDATE photos SET review = 'a_reprendre' WHERE id = ?").run(back);
  const tr = c.app.trips.create({ name: 'Maroc', authorId: c.seb });
  c.app.trips.addDays(tr, [{ author_id: c.seb, day: '2025-03-10' }]);
  assert.match((await admin.get(`/admin/voyages/${tr}`)).body, /Publier les photos prêtes · 2/);
  const r = await admin.post(`/admin/voyages/${tr}/publier`);
  assert.match(flashOf(r), /2 photos publiées/);
  assert.deepEqual([plain, proposed].map(id => [c.photo(id).status, c.photo(id).review]), [['published', null], ['published', null]]);
  assert.deepEqual([c.photo(scheduled).status, c.photo(scheduled).review, c.photo(scheduled).publish_at], ['draft', 'programmee', later]);
  assert.deepEqual([c.photo(back).status, c.photo(back).review], ['draft', 'a_reprendre']);
  // Même règle pour une sortie.
  c.db.prepare("UPDATE photos SET review = NULL, publish_at = NULL WHERE id = ?").run(back);
  c.db.prepare("UPDATE photos SET review = 'a_reprendre' WHERE id = ?").run(back);
  await admin.post('/admin/sorties/sebastien/2025-03-10/publier');
  assert.deepEqual([c.photo(scheduled).status, c.photo(back).status], ['draft', 'draft']);
});

test('changer le photographe d’un voyage : il existe, et le voyage ne garde pas les journées d’un autre', async t => {
  const c = await world(t);
  const admin = c.as('root', ['admin']), jul = c.as('jul', ['photographe'], c.jul);
  const [s1] = c.photosOf(c.seb), [j1] = c.photosOf(c.jul);
  c.db.prepare("UPDATE photos SET taken_on = '2025-03-10' WHERE id = ?").run(s1);
  c.db.prepare("UPDATE photos SET taken_on = '2025-03-11' WHERE id = ?").run(j1);
  await admin.post('/admin/voyages', { name: 'Maroc', author_id: String(c.seb) });
  const tr = c.lastTrip();
  await admin.post(`/admin/voyages/${tr.id}/journees`, { jours: `${c.seb}:2025-03-10` });
  const r = await admin.post(`/admin/voyages/${tr.id}`, { name: 'Maroc', author_id: String(c.jul) });
  assert.match(flashOf(r), /journées de l’autre photographe/);
  assert.equal(c.trip(tr.id).author_id, c.seb);
  assert.equal((await jul.get(`/admin/voyages/${tr.id}`)).statusCode, 404);
  // Photographe inconnu : refusé avec un message (plus d'erreur 500), à la création comme à la modification.
  assert.equal((await admin.post(`/admin/voyages/${tr.id}`, { name: 'Maroc', author_id: '9999' })).statusCode, 303);
  assert.equal(c.trip(tr.id).author_id, c.seb);
  const n = c.db.prepare('SELECT COUNT(*) FROM trips').pluck().get();
  const created = await admin.post('/admin/voyages', { name: 'Fantôme', author_id: '9999' });
  assert.equal(created.statusCode, 303);
  assert.match(flashOf(created), /Photographe inconnu/);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM trips').pluck().get(), n);
  // Voyage commun avec les journées des deux : pas confié à l'un d'eux ; renommer reste possible.
  await admin.post('/admin/voyages', { name: 'Commun', author_id: '' });
  const common = c.lastTrip();
  await admin.post(`/admin/voyages/${common.id}/journees`, { jours: [`${c.seb}:2025-03-10`, `${c.jul}:2025-03-11`] });
  await admin.post(`/admin/voyages/${common.id}`, { name: 'Commun', author_id: String(c.seb) });
  assert.equal(c.trip(common.id).author_id, null);
  await admin.post(`/admin/voyages/${common.id}`, { name: 'Commun 2025', author_id: '' });
  assert.equal(c.trip(common.id).name, 'Commun 2025');
  // Journées d'un seul photographe : confié à lui.
  await admin.post(`/admin/voyages/${common.id}/journees/retirer`, { jour: `${c.jul}:2025-03-11` });
  await admin.post(`/admin/voyages/${common.id}`, { name: 'Commun 2025', author_id: String(c.seb) });
  assert.equal(c.trip(common.id).author_id, c.seb);
});

test('journée d’un voyage commun : le photographe ne l’en sort pas en la rattachant au sien', async t => {
  const c = await world(t);
  const admin = c.as('root', ['admin']), ph = c.as('seb', ['photographe'], c.seb);
  c.db.prepare("UPDATE photos SET taken_on = '2025-03-10' WHERE id = ?").run(c.photosOf(c.seb)[0]);
  await admin.post('/admin/voyages', { name: 'Commun', author_id: '' });
  const common = c.lastTrip();
  await admin.post(`/admin/voyages/${common.id}/journees`, { jours: `${c.seb}:2025-03-10` });
  await ph.post('/admin/voyages', { name: 'Le mien' });
  const mine = c.lastTrip();
  const r = await ph.post(`/admin/voyages/${mine.id}/journees`, { jours: `${c.seb}:2025-03-10` });
  assert.match(flashOf(r), /voyage que vous ne gérez pas/);
  assert.match(flashOf(await ph.post('/admin/sorties/sebastien/2025-03-10/voyage', { voyage: String(mine.id) })), /voyage que vous ne gérez pas/);
  assert.match(flashOf(await ph.post('/admin/sorties/sebastien/2025-03-10/voyage', { voyage: '' })), /voyage que vous ne gérez pas/);
  assert.deepEqual([c.tripDays(common.id).length, c.tripDays(mine.id).length], [1, 0]);
  // L'administrateur, qui gère les deux, la déplace.
  await admin.post(`/admin/voyages/${mine.id}/journees`, { jours: `${c.seb}:2025-03-10` });
  assert.deepEqual([c.tripDays(common.id).length, c.tripDays(mine.id).length], [0, 1]);
});

test('renommer un voyage en ligne garde son adresse ; hors ligne, elle suit le nom', async t => {
  const c = await world(t);
  const tr = c.app.trips.create({ name: 'Maroc', authorId: c.seb });
  c.app.trips.update(tr, { public: true });
  c.app.trips.update(tr, { name: 'Maroc 2025' });
  assert.deepEqual([c.trip(tr).name, c.trip(tr).slug], ['Maroc 2025', 'maroc']);
  c.app.trips.update(tr, { public: false });
  c.app.trips.update(tr, { name: 'Maroc, printemps' });
  assert.equal(c.trip(tr).slug, 'maroc-printemps');
});

test('page admin d’un voyage : sorties de ses journées et propositions bornées', async t => {
  const c = await world(t);
  const ids = c.photosOf(c.seb);
  ['2025-03-10', '2025-03-11', '2025-03-12'].forEach((d, i) => c.db.prepare('UPDATE photos SET taken_on = ? WHERE id = ?').run(d, ids[i]));
  const days = c.app.outings.list({ author: c.seb, max: 1 });
  assert.equal(new Set(days.map(o => o.day)).size, 1);
  assert.ok(c.app.outings.list({ author: c.seb, skip: (a, d) => d === '2025-03-12' }).every(o => o.day !== '2025-03-12'));
  assert.deepEqual(c.app.outings.ofDays([{ author_id: c.seb, day: '2025-03-11' }, { author_id: c.seb, day: '2025-13-01' }]).map(o => o.day), ['2025-03-11']);
  const tr = c.app.trips.create({ name: 'Maroc', authorId: c.seb });
  c.app.trips.addDays(tr, [{ author_id: c.seb, day: '2025-03-11' }]);
  const page = (await c.as('root', ['admin']).get(`/admin/voyages/${tr}`)).body;
  assert.match(page, /mardi 11 mars · |mardi 11 mars</);
  assert.match(page, /name="jours" value="\d+:2025-03-12"/);                      // proposée
  assert.doesNotMatch(page, /name="jours" value="\d+:2025-03-11"/);               // déjà dans le voyage
});

// ---------- Instagram : règles ----------

test('légende : une légende de 2 000 espaces avec une variable vide sur sa ligne se rend aussitôt', () => {
  const photo = { title: 'T', legend: `a${' '.repeat(1998)}b`, ig_signature: 0, author_signature: 'sig' };
  const model = '{titre}\n{legende} {signature}\n{hashtags}';
  const out = renderCaption(model, photo, { hashtags: '#x' }, 'Site');
  // Durées relatives, meilleur de 5 essais : huit fois plus d'espaces ne doit coûter que ~8 fois plus (le retour arrière
  // d'une expression régulière en coûterait 64 ou plus).
  const avec = n => { const p = { ...photo, legend: `a${' '.repeat(n)}b` }; return meilleur(() => renderCaption(model, p, { hashtags: '#x' }, 'Site')); };
  const [petit, grand] = [avec(500), avec(4000)];
  assert.ok(grand < petit * 30 + 2, `${grand.toFixed(2)} ms pour 4 000 espaces, ${petit.toFixed(2)} ms pour 500`);
  assert.equal(out, 'T\na b\n#x');
  // Séparateurs orphelins toujours retirés, valeurs intactes.
  assert.equal(renderCaption('{titre} · {lieu} — {date}', { title: 'Brume', place: '' }, {}, 'S'), 'Brume');
  assert.equal(renderCaption('{lieu}, {date}', { place: '- x -' }, {}, 'S'), '- x -');
});

test('attente absurde signalée par Meta : bornée à 7 jours ; un instant impossible s’écrit « — »', () => {
  const headers = h => ({ get: k => h[k.toLowerCase()] ?? null });
  assert.equal(rateLimitFrom(429, headers({ 'retry-after': '1e20' }), {}).retryAfterMs, MAX_PAUSE);
  assert.equal(rateLimitFrom(429, headers({ 'retry-after': 'Infinity' }), {}).retryAfterMs, null);
  const usage = JSON.stringify({ 1: [{ estimated_time_to_regain_access: 1e30 }] });
  assert.equal(rateLimitFrom(400, headers({ 'x-business-use-case-usage': usage }), { error: { code: 4 } }).retryAfterMs, MAX_PAUSE);
  assert.equal(whenText(1e23, Date.now()), '—');
  assert.equal(whenText(NaN, Date.now()), '—');
});

test('heure de reprise dans la langue de l’admin', () => {
  const now = Date.parse('2026-10-16T08:00:00Z');                                   // 10 h, heure de Paris
  assert.equal(whenText(now + 2 * H, now), 'à 12 h 00');
  assert.equal(whenText(now + 26 * H, now), 'le 17 oct. à 12 h 00');
  assert.equal(whenText(now + 2 * H, now, 'en-GB'), '12:00');
  assert.equal(whenText(now + 26 * H, now, 'en-GB'), '17 Oct, 12:00');
  assert.equal(whenText(now + 26 * H, now, 'de-DE'), '17. Okt., 12:00');
  // Refus du budget : clé et variables pour l'écrire dans la langue de l'admin ; motif français inchangé.
  const b = checkBudget({ limits: { ...LIMIT_DEFAULTS, preset: 'custom', postsPerDay: 1, minGapMinutes: 0 }, nowMs: now, publishedAt: [now - H] });
  assert.equal(b.key, '{n} publication sur les dernières 24 h (limite : {max}) : prochaine possible {when}.');
  assert.deepEqual(b.params, { n: 1, max: 1 });
  assert.equal(b.reason, '1 publication sur les dernières 24 h (limite : 1) : prochaine possible le 17 oct. à 09 h 00.');
});

test('quota lu plein il y a plus d’une heure : il ne bloque plus, il sera relu', () => {
  const now = Date.parse('2026-10-16T08:00:00Z');
  const full = { usage: 100, total: 100 };
  assert.equal(checkBudget({ limits: LIMIT_DEFAULTS, nowMs: now, liveQuota: { ...full, at: now - 10 * 60 * 1000 } }).ok, false);
  assert.equal(checkBudget({ limits: LIMIT_DEFAULTS, nowMs: now, liveQuota: { ...full, at: now - 2 * H } }).ok, true);
});

test('heures et limites saisies : « 9:00 », « 18 h 30 » comprises ; champ vidé : la valeur par défaut', () => {
  assert.deepEqual(parseTimes('9:00, 18 h 30'), { times: ['09:00', '18:30'], rejected: [] });
  assert.deepEqual(parseTimes('18h; 7H05 12:00'), { times: ['07:05', '12:00', '18:00'], rejected: [] });
  assert.deepEqual(parseTimes('25:00, midi, 18:30'), { times: ['18:30'], rejected: ['25:00', 'midi'] });
  assert.deepEqual(normalizeLimits({ limits_preset: 'custom', limits_posts: '', limits_gap: '', limits_calls: '' }),
    { preset: 'custom', postsPerDay: LIMIT_DEFAULTS.postsPerDay, minGapMinutes: LIMIT_DEFAULTS.minGapMinutes, callsPerHour: LIMIT_DEFAULTS.callsPerHour });
  assert.equal(normalizeLimits({ limits_preset: 'custom', limits_calls: '5' }).callsPerHour, 20);
  assert.equal(BOUNDS.callsPerHour[0], 20);
});

// ---------- Instagram : service ----------

const HTTPS = { PUBLIC_URL: 'https://nicephos.example', COOKIE_SECRET: 'x'.repeat(40), INSTAGRAM_APP_ID: '123456', INSTAGRAM_APP_SECRET: 'app-secret-0123456789' };
function fakeMeta(getApp) {
  const calls = [];
  const behave = { media: null, token: null, quota: null };
  const headers = h => ({ get: k => h[k.toLowerCase()] ?? null });
  const json = (body, status = 200, h = {}) => ({ ok: status < 400, status, headers: headers(h), json: async () => body });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, redirect: init.redirect });
    if (u.pathname === '/oauth/access_token') return behave.token ? behave.token() : json({ access_token: 'short', user_id: 1784 });
    if (u.pathname === '/access_token') return json({ access_token: 'IGQVlong0123456789', expires_in: 5184000 });
    if (u.pathname.endsWith('/me')) return json({ user_id: '1784', username: 'nicephos' });
    if (u.pathname.endsWith('/content_publishing_limit')) return behave.quota ? json(behave.quota) : json({ error: { message: 'inconnu' } }, 404);
    if (u.pathname.endsWith('/1784/media')) {
      if (behave.media) return behave.media();
      const img = await getApp().inject(new URL(Object.fromEntries(new URLSearchParams(init.body.toString())).image_url).pathname);
      calls.at(-1).image = img.statusCode;
      return json({ id: 'container-1' });
    }
    if (u.pathname.endsWith('/container-1')) return json({ status_code: 'FINISHED' });
    if (u.pathname.endsWith('/1784/media_publish')) return json({ id: 'media-9' });
    if (u.pathname.endsWith('/media-9')) return json({ permalink: 'https://www.instagram.com/p/abc/' });
    return json({ error: { message: 'inconnu' } }, 404);
  };
  return { calls, behave, json, fetchImpl };
}
async function igApp(t, { connect = true } = {}) {
  let app;
  const meta = fakeMeta(() => app);
  let now = new Date('2026-10-13T08:00:00Z');
  const ctx = await setup(t, { seeded: true, env: HTTPS, instagramOptions: { manual: true, fetchImpl: meta.fetchImpl, sleep: async () => {}, now: () => now, timeoutMs: 100 } });
  app = ctx.app;
  if (connect) await app.instagram.connect('code');
  const photos = ctx.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY position LIMIT 4").pluck().all();
  const row = id => ctx.db.prepare('SELECT * FROM instagram_posts WHERE id = ?').get(id);
  return { ...ctx, meta, photos, row, setNow: d => { now = new Date(d); } };
}

test('Meta demande d’attendre « 1e20 s » : l’envoi revient dans la file, la pause est bornée, les pages s’affichent', async t => {
  const { app, meta, photos, row } = await igApp(t);
  meta.behave.media = () => meta.json({ error: { message: 'Too many' } }, 429, { 'retry-after': '1e20' });
  const post = app.instagram.enqueue(photos[0]);
  await assert.rejects(app.instagram.publish(post), /File en pause jusqu’/);
  assert.deepEqual([row(post).status, row(post).media_token, row(post).attempts], ['queued', null, 0]);
  const u = app.instagram.usage();
  assert.ok(u.paused.until <= Date.parse('2026-10-13T08:00:00Z') + MAX_PAUSE);
  assert.match(u.paused.when, /^le \d+ \S+ à \d\d h \d\d$/);
  // Les appels à Meta ne suivent jamais une redirection.
  assert.ok(meta.calls.length && meta.calls.every(c => c.redirect === 'error'));
});

test('quota lu plein, puis rendu par Meta : relu une heure plus tard, la file repart ; oublié à la reprise', async t => {
  const { app, meta, photos, row, setNow } = await igApp(t);
  meta.behave.quota = { data: [{ quota_usage: 100, config: { quota_total: 100 } }] };
  const post = app.instagram.enqueue(photos[0]);
  await assert.rejects(app.instagram.publish(post), /Quota d’Instagram atteint/);
  meta.behave.quota = { data: [{ quota_usage: 0, config: { quota_total: 100 } }] };
  setNow('2026-10-13T08:30:00Z');
  await assert.rejects(app.instagram.publish(post), /Quota d’Instagram atteint/);  // lu il y a 30 min : il vaut encore
  setNow('2026-10-13T09:30:00Z');
  await app.instagram.publish(post);
  assert.equal(row(post).status, 'published');
  assert.equal(app.instagram.usage().liveQuota.usage, 0);
  app.instagram.resume();
  assert.equal(app.instagram.usage().liveQuota, null);
});

test('« Réessayer » un ancien échec : refusé si la photo est déjà dans la file, ou dépubliée', async t => {
  const { app, db, photos, row } = await igApp(t);
  const first = app.instagram.enqueue(photos[0]);
  db.prepare("UPDATE instagram_posts SET status = 'failed', error = 'x' WHERE id = ?").run(first);
  const second = app.instagram.enqueue(photos[0]);
  assert.notEqual(second, first);
  assert.throws(() => app.instagram.retry(first), InstagramError);
  assert.equal(row(first).status, 'failed');
  assert.equal(db.prepare("SELECT COUNT(*) FROM instagram_posts WHERE photo_id = ? AND status = 'queued'").pluck().get(photos[0]), 1);
  // Dernier envoi, en échec, photo dépubliée : refusé aussi ; republiée : remis en file.
  db.prepare("UPDATE instagram_posts SET status = 'failed' WHERE id = ?").run(second);
  db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(photos[0]);
  assert.throws(() => app.instagram.retry(second), /dépubliée/);
  db.prepare("UPDATE photos SET status = 'published' WHERE id = ?").run(photos[0]);
  assert.equal(app.instagram.retry(second), true);
  assert.equal(row(second).status, 'queued');
});

test('« Retirer » : l’envoi est gardé annulé, la mise en file automatique ne remet pas la photo dans la file', async t => {
  const { app, db, photos, row } = await igApp(t);
  const cat = db.prepare('SELECT category_id FROM photos WHERE id = ?').pluck().get(photos[0]);
  app.instagram.saveSettings({ ...app.instagram.settings(), autoSeries: [cat] });
  const [post] = app.instagram.onPublished([photos[0]]);
  assert.equal(row(post).status, 'queued');
  assert.equal(app.instagram.cancel(post), true);
  assert.equal(row(post).status, 'cancelled');
  assert.deepEqual(app.instagram.onPublished([photos[0]]), []);                    // dépubliée puis republiée
  assert.equal(app.instagram.forPhoto(photos[0]), null);
  // À la main, elle peut revenir.
  assert.equal(row(app.instagram.enqueue(photos[0])).status, 'queued');
});

test('connexion Instagram : hors du budget horaire du réglage ; une limite de Meta donne un message, pas une erreur 500', async t => {
  const { app, db, meta } = await igApp(t, { connect: false });
  const at = Date.parse('2026-10-13T07:30:00Z');
  const ins = db.prepare("INSERT INTO instagram_calls (at, kind) VALUES (?, 'media')");
  for (let i = 0; i < 150; i++) ins.run(at + i);
  assert.equal(await app.instagram.connect('code'), 'nicephos');
  meta.behave.token = () => meta.json({ error: { message: 'Too many' } }, 429);
  await assert.rejects(app.instagram.connect('code'), err => err instanceof InstagramError && /Instagram limite les appels/.test(err.message));
});

test('images Instagram : rendus identiques regroupés, aperçus refusés au-delà de trois en attente', async t => {
  const { app, photos } = await igApp(t);
  const a = app.instagram.image(photos[0], { frame: 'white', watermark: false }, { preview: true });
  assert.equal(app.instagram.image(photos[0], { frame: 'white', watermark: false }, { preview: true }), a);
  const b = app.instagram.image(photos[0], { frame: 'black', watermark: false }, { preview: true });
  const c = app.instagram.image(photos[0], { frame: 'crop', watermark: false }, { preview: true });
  await assert.rejects(app.instagram.image(photos[1], { frame: 'crop', watermark: false }, { preview: true }), err => err.busy === true);
  // L'image d'un envoi n'est pas un aperçu : jamais refusée.
  const d = app.instagram.image(photos[1], { frame: 'white', watermark: false });
  for (const buf of await Promise.all([a, b, c, d])) assert.ok(buf.length > 1000);
});

// ---------- Instagram : pages de l'admin ----------

const TOKEN = 'jeton-de-test-0123456789';
async function admin(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, INSTAGRAM_APP_ID: '1', INSTAGRAM_APP_SECRET: 's' } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = o => ctx.app.inject({ ...o, cookies: { ...cookies, ...o.cookies } });
  const post = (url, payload = {}) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  return { ...ctx, as, post, lang: l => post('/admin/langue', { lang: l, back: '/admin' }) };
}

test('page Instagram : pause, budget et créneaux dans la langue de l’admin ; compteurs et boutons nommés', async t => {
  const c = await admin(t);
  const photo = c.db.prepare("SELECT id, title FROM photos WHERE status = 'published' ORDER BY id LIMIT 1").get();
  c.app.instagram.enqueue(photo.id);
  let page = (await c.as({ url: '/admin/instagram' })).body;
  assert.match(page, /<meter aria-labelledby="ig-m-posts"/);
  assert.match(page, /<span id="ig-m-calls">/);
  assert.match(page, /Prévue le \d{1,2} \p{L}+ à \d\d h \d\d/u);
  assert.match(page, new RegExp(`aria-label="Retirer « ${photo.title} » de la file"`));
  // Heures ignorées : signalées.
  const saved = await c.post('/admin/instagram/reglages', { times: '9:00, 18 h 30, midi' });
  assert.match(flashOf(saved), /Heures ignorées \(format HH:MM attendu\) : midi/);
  assert.deepEqual(c.app.instagram.settings().times, ['09:00', '18:30']);
  // En allemand : créneau en toutes lettres, nom du cadre avec ses majuscules.
  await c.lang('de');
  page = (await c.as({ url: '/admin/instagram' })).body;
  assert.match(page, /Geplant am \d{1,2}\. \p{L}+ um \d\d:\d\d · Zuschnitt \(ohne Rand\)/u);
  // En anglais : pause, avertissement du budget et « Aujourd'hui » sans heure à la française.
  await c.lang('en');
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('instagram_state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ lastSlot: null, pausedUntil: Date.now() + 26 * H, pauseReason: 'trop d’appels à l’API Instagram', pauseLevel: 1 }));
  page = (await c.as({ url: '/admin/instagram' })).body;
  assert.match(page, /Queue paused until \d{1,2} \w{3}, \d\d:\d\d: too many calls to the Instagram API\./);
  const home = (await c.as({ url: '/admin' })).body;
  assert.match(home, /resumes \d{1,2} \w{3}, \d\d:\d\d: too many calls to the Instagram API/);
  assert.doesNotMatch(home, /resumes le /);
  c.app.instagram.resume();
  c.app.instagram.saveSettings({ ...c.app.instagram.settings(), limits: { preset: 'custom', postsPerDay: 1, minGapMinutes: 0, callsPerHour: 100 } });
  c.db.prepare("INSERT INTO instagram_posts (photo_id, status, frame, created_at, published_at, permalink) VALUES (?, 'published', 'crop', ?, ?, 'https://www.instagram.com/p/abc/')").run(photo.id, Date.now() - H, Date.now() - H);
  page = (await c.as({ url: '/admin/instagram' })).body;
  assert.match(page, /1 post in the last 24 h \(limit: 1\): next one possible (\d{1,2} \w{3}, )?\d\d:\d\d\./);
  assert.match(page, new RegExp(`aria-label="View “${photo.title}” on Instagram \\(new tab\\)"`));
});
