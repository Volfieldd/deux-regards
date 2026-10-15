import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import crypto from 'node:crypto';
import { createSessionStore } from '../server/sessions.js';
import { setup } from './helpers.js';
import { renderCaption, normalizeSettings, captionWarnings, sealer, upcomingSlots, lastSlot, hashtagsFor, DEFAULTS, createInstagram } from '../server/instagram.js';

const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
const LONG = 'IGQVJlongtoken0123456789abcdef';
const HTTPS = { PUBLIC_URL: 'https://nicephos.example', COOKIE_SECRET: 'x'.repeat(40), INSTAGRAM_APP_ID: '123456', INSTAGRAM_APP_SECRET: 'app-secret-0123456789' };

// Faux service Meta : enregistre les appels ; `fail` force une erreur sur une étape.
function fakeMeta({ getApp, fail = null } = {}) {
  let published = 0;
  const calls = [];
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const form = init.body ? Object.fromEntries(new URLSearchParams(init.body.toString())) : {};
    calls.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), form });
    if (u.pathname === '/oauth/access_token') return json({ access_token: 'short-token', user_id: 1784 });
    if (u.pathname === '/access_token') return json({ access_token: LONG, expires_in: 5184000 });
    if (u.pathname === '/refresh_access_token') return json({ access_token: `${LONG}-r`, expires_in: 5184000 });
    if (u.pathname.endsWith('/me')) return json({ user_id: '1784', username: 'nicephos' });
    if (u.pathname.endsWith('/1784/media')) {
      // Meta muette : la requête n'aboutit jamais, seul le délai maximal l'interrompt.
      if (fail === 'hang') return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
      if (fail === 'media') return json({ error: { message: `Invalid parameter access_token=${form.access_token}` } }, 400);
      // Instagram télécharge l'image à l'adresse donnée : on vérifie qu'elle est bien servie.
      const img = await getApp().inject(new URL(form.image_url).pathname);
      calls.at(-1).image = { status: img.statusCode, type: img.headers['content-type'], body: img.rawPayload };
      return json({ id: 'container-1' });
    }
    if (u.pathname.endsWith('/container-1')) return json({ status_code: 'FINISHED' });
    if (u.pathname.endsWith('/1784/media_publish')) {
      published++;
      if (fail === 'publish') return json({ error: { message: 'Service temporairement indisponible' } }, 500);
      return json({ id: 'media-9' });
    }
    if (u.pathname.endsWith('/media-9')) return json({ permalink: 'https://www.instagram.com/p/abc/' });
    return json({ error: { message: 'inconnu' } }, 404);
  };
  return { calls, fetchImpl, published: () => published };
}

async function igApp(t, { fail, clock } = {}) {
  let app;
  const meta = fakeMeta({ getApp: () => app, fail });
  let now = clock || new Date('2026-10-11T10:00:00Z');
  const ctx = await setup(t, { seeded: true, env: HTTPS, instagramOptions: { manual: true, fetchImpl: meta.fetchImpl, sleep: async () => {}, now: () => now, timeoutMs: 100 } });
  app = ctx.app;
  return { ...ctx, meta, setNow: d => { now = d; } };
}

// ---------- règles ----------

test('légende : variables, lignes vides retirées, hashtags dédoublonnés', () => {
  const s = { ...DEFAULTS, hashtags: '#photographie #Nantes', seriesHashtags: { 1: '#rue #nantes #streetphotography' } };
  const photo = { title: 'Deux, minuit', legend: '', place: 'Nantes', taken_on: '2023-11', author: 'Julien', category: 'Rue', category_id: 1 };
  const c = renderCaption(DEFAULTS.template, photo, s, 'Nicephos');
  assert.equal(c, 'Deux, minuit\nNantes, nov. 2023\n\n📷 Julien · série Rue\nLien en bio · Nicephos\n\n#photographie #Nantes #rue #streetphotography');
  // Lieu absent : pas de virgule orpheline ; date absente aussi : ligne retirée.
  assert.match(renderCaption('{titre}\n{lieu}, {date}', { ...photo, place: '' }, s, 'N'), /^Deux, minuit\nnov\. 2023$/);
  assert.equal(renderCaption('{titre}\n{lieu}, {date}', { ...photo, place: '', taken_on: null }, s, 'N'), 'Deux, minuit');
  assert.equal(hashtagsFor(photo, { hashtags: Array.from({ length: 40 }, (_, i) => `#t${i}`).join(' ') }).length, 30);
  assert.deepEqual(captionWarnings('x'.repeat(2300)).length, 1);
  assert.match(captionWarnings('voir https://nicephos.com').join(), /pas cliquables/);
});

test('réglages : heures valides, cadre connu, hashtags nettoyés', () => {
  const s = normalizeSettings({ times: '18:30, 07:05 25:00 abc, 18:30', frame: 'rouge', hashtags: 'photo #ok #très_bien !', hashtags_2: '#portrait', auto_2: 'on', auto_9: 'on' }, [{ id: 2 }, { id: 3 }]);
  assert.deepEqual(s.times, ['07:05', '18:30']);
  assert.equal(s.frame, 'crop');                                                   // cadre inconnu : le défaut (recadrage)
  assert.equal(s.hashtags, '#ok #très_bien');
  assert.deepEqual(s.seriesHashtags, { 2: '#portrait' });
  assert.deepEqual(s.autoSeries, [2]);                                       // série inconnue (9) ignorée
  assert.deepEqual(normalizeSettings({}).autoSeries, []);
});

test('jeton chiffré : aller-retour, falsification refusée', () => {
  const v = sealer('clé secrète');
  const sealed = v.seal(LONG);
  assert.doesNotMatch(sealed, /IGQV/);
  assert.equal(v.open(sealed), LONG);
  const bad = Buffer.from(sealed, 'base64url');
  bad[bad.length - 1] ^= 1;
  assert.throws(() => v.open(bad.toString('base64url')));
  assert.throws(() => sealer('autre clé').open(sealed));
});

test('créneaux à l’heure de Paris', () => {
  const now = new Date('2026-10-11T15:00:00Z');                       // 17 h à Paris
  assert.deepEqual(upcomingSlots(['12:00', '18:30'], now, 3), ['2026-10-11 18:30', '2026-10-12 12:00', '2026-10-12 18:30']);
  assert.equal(lastSlot(['12:00', '18:30'], now), '2026-10-11 12:00');
  assert.equal(lastSlot(['18:30'], now), '2026-10-10 18:30');
});

// ---------- image ----------

test('image : 1080 px, passe-partout 4:5 blanc ou noir, recadrage, JPEG sans métadonnées', async t => {
  const { app, db } = await igApp(t);
  const portrait = db.prepare('SELECT id FROM photos WHERE height > width LIMIT 1').pluck().get();
  const landscape = db.prepare('SELECT id FROM photos WHERE width > height LIMIT 1').pluck().get();
  const meta = async buf => sharp(buf).metadata();
  const white = await app.instagram.image(landscape, { frame: 'white', watermark: false });
  assert.deepEqual([(await meta(white)).width, (await meta(white)).height, (await meta(white)).format], [1080, 1350, 'jpeg']);
  assert.equal((await meta(white)).exif, undefined);
  // stats() mesure l'image d'entrée : on découpe d'abord le coin dans un tampon.
  const corner = async buf => (await sharp(await sharp(buf).extract({ left: 2, top: 2, width: 4, height: 4 }).png().toBuffer()).stats()).channels[0].mean;
  assert.ok(await corner(white) > 245);
  assert.ok(await corner(await app.instagram.image(landscape, { frame: 'black', watermark: false })) < 10);
  const crop = await meta(await app.instagram.image(portrait, { frame: 'crop', watermark: false }));
  assert.deepEqual([crop.width, crop.height], [1080, 1350]);                          // 2:3 recadré en 4:5
  const wide = await meta(await app.instagram.image(landscape, { frame: 'crop', watermark: false }));
  assert.deepEqual([wide.width, wide.height], [1080, 720]);                           // 3:2 gardé tel quel
  const marked = await app.instagram.image(landscape, { frame: 'crop', watermark: true });
  assert.notDeepEqual(marked, await app.instagram.image(landscape, { frame: 'crop', watermark: false }));
});

// ---------- file et envoi ----------

test('envoi complet : image servie le temps de l’envoi, post publié, jeton jamais en clair', async t => {
  const { app, db, meta } = await igApp(t);
  assert.equal(await app.instagram.connect('code-oauth#_'), 'nicephos');
  assert.equal(meta.calls[0].form.code, 'code-oauth');                                // suffixe « #_ » retiré
  assert.equal(meta.calls[0].form.redirect_uri, 'https://nicephos.example/admin/instagram/callback');
  assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM instagram_account').all()), /IGQV|short-token/);
  const photo = db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  const post = app.instagram.enqueue(photo, { frame: 'black', watermark: false });
  assert.equal(app.instagram.enqueue(photo, { frame: 'white' }), post);                 // pas de doublon : mise à jour
  const r = await app.instagram.publish(post);
  assert.equal(r.permalink, 'https://www.instagram.com/p/abc/');
  const media = meta.calls.find(c => c.path.endsWith('/1784/media'));
  assert.match(media.form.image_url, /^https:\/\/nicephos\.example\/partage\/instagram\/[\w-]{32}\.jpg$/);
  assert.equal(media.image.status, 200);
  assert.equal(media.image.type, 'image/jpeg');
  assert.match(media.form.caption, /^[^\n]+\n/);
  const row = db.prepare('SELECT * FROM instagram_posts WHERE id = ?').get(post);
  assert.equal(row.status, 'published');
  assert.equal(row.media_token, null);
  // Après l'envoi, l'adresse de l'image ne répond plus.
  assert.equal((await app.inject(new URL(media.form.image_url).pathname)).statusCode, 404);
  assert.equal((await app.inject('/partage/instagram/nimporte-quoi-de-tres-long-xx.jpg')).statusCode, 404);
});

test('échec : message sans jeton, nouvel essai au créneau suivant, abandon après 3 essais', async t => {
  const { app, db } = await igApp(t, { fail: 'media' });
  await app.instagram.connect('code');
  const photo = db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  const post = app.instagram.enqueue(photo);
  for (let i = 1; i <= 3; i++) {
    await assert.rejects(app.instagram.publish(post), err => !/IGQV|access_token=[^…]/.test(err.message));
    const row = db.prepare('SELECT status, attempts, error FROM instagram_posts WHERE id = ?').get(post);
    assert.equal(row.attempts, i);
    assert.equal(row.status, i < 3 ? 'queued' : 'failed');
    assert.doesNotMatch(row.error, /IGQV/);
  }
  assert.equal(app.instagram.retry(post), true);
  assert.equal(db.prepare('SELECT status FROM instagram_posts WHERE id = ?').pluck().get(post), 'queued');
});

test('créneaux : rien au premier passage, puis une photo par créneau ; jeton renouvelé', async t => {
  const { app, db, meta, setNow } = await igApp(t, { clock: new Date('2026-10-11T15:00:00Z') });
  await app.instagram.connect('code');
  const ids = db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY position LIMIT 2").pluck().all();
  ids.forEach(id => app.instagram.enqueue(id));
  assert.equal(await app.instagram.tick(), null);                                     // premier démarrage
  setNow(new Date('2026-10-11T16:31:00Z'));                                          // 18 h 31 à Paris
  assert.ok((await app.instagram.tick()).permalink);
  assert.equal(await app.instagram.tick(), null);                                     // même créneau : rien de plus
  assert.equal(db.prepare("SELECT COUNT(*) FROM instagram_posts WHERE status = 'queued'").pluck().get(), 1);
  // 40 jours plus tard (jeton à moins de 30 jours de l'expiration) : renouvelé.
  setNow(new Date('2026-11-20T10:00:00Z'));
  assert.equal(await app.instagram.refresh(), true);
  assert.ok(meta.calls.some(c => c.path === '/refresh_access_token'));
});

// ---------- admin ----------

async function admin(t, env = {}) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, ...env } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = o => ctx.app.inject({ ...o, cookies: { ...cookies, ...o.cookies } });
  const post = (url, payload = {}) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  return { ...ctx, as, post, csrf };
}

test('admin : file automatique à la publication, réglages, fiche, aperçu, actions de file', async t => {
  const c = await admin(t, { INSTAGRAM_APP_ID: '1', INSTAGRAM_APP_SECRET: 's' });
  const draft = c.db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  const cat = c.db.prepare('SELECT category_id FROM photos WHERE id = ?').pluck().get(draft);
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(draft);
  await c.post('/admin/instagram/reglages', { [`auto_${cat}`]: 'on' });
  await c.post(`/admin/photos/${draft}/status`, { status: 'published' });
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM instagram_posts WHERE photo_id = ? AND status = 'queued'").pluck().get(draft), 1);
  await c.post(`/admin/photos/${draft}/status`, { status: 'draft' });
  await c.post(`/admin/photos/${draft}/status`, { status: 'published' });
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM instagram_posts WHERE photo_id = ?').pluck().get(draft), 1);   // jamais deux fois

  const page = await c.as({ url: '/admin/instagram' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Le site doit être en HTTPS/);
  assert.match(page.body, /File d’attente <span class="mono">1 photo<\/span>/);
  const saved = await c.post('/admin/instagram/reglages', { times: '12:00, 18:30', frame: 'black', template: '{titre} · {serie}', hashtags: '#nicephos' });
  assert.equal(saved.statusCode, 303);
  assert.deepEqual(JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'instagram'").pluck().get()).times, ['12:00', '18:30']);

  const other = c.db.prepare("SELECT id FROM photos WHERE status = 'published' AND id <> ? LIMIT 1").pluck().get(draft);
  const fiche = (await c.as({ url: `/admin/photos/${other}` })).body;
  assert.match(fiche, /id="instagram"/);
  assert.match(fiche, /Ajouter à la file Instagram/);
  await c.post('/admin/instagram/file', { photo_id: other, frame: 'crop', watermark_set: '1', custom: 'on', caption: 'Ma légende #test' });
  const row = c.db.prepare('SELECT * FROM instagram_posts WHERE photo_id = ?').get(other);
  assert.deepEqual([row.frame, row.watermark, row.caption], ['crop', 0, 'Ma légende #test']);
  assert.match((await c.as({ url: `/admin/photos/${other}` })).body, /Dans la file : prévue le/);

  const prev = await c.as({ url: `/admin/instagram/apercu.jpg?photo=${other}&cadre=white&filigrane=0` });
  assert.equal(prev.headers['content-type'], 'image/jpeg');
  const leg = (await c.as({ url: `/admin/instagram/legende?photo=${other}` })).json();
  assert.match(leg.caption, /· /);
  await c.post(`/admin/instagram/${row.id}/monter`);
  assert.equal(c.db.prepare("SELECT id FROM instagram_posts WHERE status = 'queued' ORDER BY position LIMIT 1").pluck().get(), row.id);
  const pub = await c.post(`/admin/instagram/${row.id}/publier`);
  assert.match(decodeURIComponent(cookiesOf(pub).flash || ''), /HTTPS|connecté/);                  // pas de compte, pas d'HTTPS : refusé
  await c.post(`/admin/instagram/${row.id}/annuler`);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM instagram_posts WHERE id = ?').pluck().get(row.id), 0);
  // Brouillon : refusé.
  const r = await c.post('/admin/instagram/file', { photo_id: draft, frame: 'white' });
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(other);
  const refused = await c.post('/admin/instagram/file', { photo_id: other });
  assert.match(decodeURIComponent(cookiesOf(refused).flash || ''), /seules les photos publiées/);
  assert.equal(r.statusCode, 303);
});

test('admin : connexion refusée sans HTTPS, « state » vérifié, CSRF, réservé aux admins', async t => {
  const c = await admin(t, { INSTAGRAM_APP_ID: '1', INSTAGRAM_APP_SECRET: 's' });
  const go = await c.as({ url: '/admin/instagram/connexion' });
  assert.equal(go.statusCode, 303);
  assert.equal(go.headers.location, '/admin/instagram');                              // http : pas de redirection vers Meta
  const cb = await c.as({ url: '/admin/instagram/callback?code=abc&state=forge' });
  assert.match(decodeURIComponent(cookiesOf(cb).flash || ''), /ne vient pas de cet écran/);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM instagram_account').pluck().get(), 0);
  assert.equal((await c.post('/admin/instagram/reglages', { _csrf: 'faux' })).statusCode, 403);
  for (const url of ['/admin/instagram', '/admin/instagram/apercu.jpg?photo=1', '/admin/instagram/legende?photo=1', '/admin/instagram/connexion']) {
    assert.notEqual((await c.app.inject(url)).statusCode, 200, url);
  }
});

// ---------- revue de code : cas limites ----------

test('envoi interrompu par un redémarrage : jamais bloqué, jamais republié tout seul', async t => {
  const { app, db, config } = await igApp(t);
  const photo = db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  const post = app.instagram.enqueue(photo);
  db.prepare("UPDATE instagram_posts SET status = 'publishing', media_token = ? WHERE id = ?").run('a'.repeat(32), post);
  createInstagram({ db, storageDir: config.storageDir, config, variants: app.variants, siteName: () => 'N' });   // redémarrage
  const row = db.prepare('SELECT status, media_token, error FROM instagram_posts WHERE id = ?').get(post);
  assert.equal(row.status, 'failed');
  assert.equal(row.media_token, null);
  assert.match(row.error, /redémarrage/);
  assert.equal(app.instagram.retry(post), true);                                      // déblocable depuis l'admin
});

test('Meta muette : délai maximal, la file n’est pas bloquée', async t => {
  const { app, db } = await igApp(t, { fail: 'hang' });
  // Le minuteur d'AbortSignal.timeout ne retient pas le processus : le serveur, lui, tourne.
  const keep = setInterval(() => {}, 20);
  t.after(() => clearInterval(keep));
  await app.instagram.connect('code');
  const photo = db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  const post = app.instagram.enqueue(photo);
  await assert.rejects(app.instagram.publish(post), /pas répondu à temps/);
  assert.equal(db.prepare('SELECT status FROM instagram_posts WHERE id = ?').pluck().get(post), 'queued');
  await assert.rejects(app.instagram.publish(post), /pas répondu à temps/);            // pas « déjà en cours »
});

test('échec pendant la publication : pas de nouvel essai automatique (pas de doublon)', async t => {
  const { app, db, meta } = await igApp(t, { fail: 'publish' });
  await app.instagram.connect('code');
  const photo = db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  const post = app.instagram.enqueue(photo);
  await assert.rejects(app.instagram.publish(post), /a peut-être abouti/);
  const row = db.prepare('SELECT status, attempts FROM instagram_posts WHERE id = ?').get(post);
  assert.deepEqual([row.status, row.attempts], ['failed', 1]);
  assert.equal(meta.published(), 1);
});

test('créneaux : changer les heures ne publie rien d’avance ; photo dépubliée sautée ; horaires affichés', async t => {
  const { app, db, setNow } = await igApp(t, { clock: new Date('2026-10-11T15:00:00Z') });
  await app.instagram.connect('code');
  const [a, b, c] = db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY position LIMIT 3").pluck().all();
  [a, b, c].forEach(id => app.instagram.enqueue(id));
  await app.instagram.tick();                                                         // premier passage
  setNow(new Date('2026-10-11T16:31:00Z'));                                          // 18 h 31 : a part
  assert.ok(await app.instagram.tick());
  setNow(new Date('2026-10-11T17:00:00Z'));                                          // 19 h
  app.instagram.saveSettings({ ...app.instagram.settings(), times: ['12:00'] });
  assert.equal(await app.instagram.tick(), null);                                     // pas de second post aujourd'hui
  // b repasse en brouillon : retirée de la file (route), c part au créneau suivant.
  db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(b);
  app.instagram.onUnpublished([b]);
  assert.equal(db.prepare('SELECT COUNT(*) FROM instagram_posts WHERE photo_id = ?').pluck().get(b), 0);
  setNow(new Date('2026-10-12T10:05:00Z'));                                          // lendemain 12 h 05
  await app.instagram.tick();
  assert.equal(db.prepare('SELECT status FROM instagram_posts WHERE photo_id = ?').pluck().get(c), 'published');
  // Horaires : la tête de file en attente prend le premier créneau.
  const d = db.prepare("SELECT id FROM photos WHERE status = 'published' AND id NOT IN (?, ?, ?) LIMIT 2").pluck().all(a, b, c);
  d.forEach(id => app.instagram.enqueue(id));
  db.prepare("UPDATE instagram_posts SET status = 'publishing' WHERE photo_id = ?").run(d[0]);
  const q = app.instagram.queue();
  assert.equal(q[0].slot, 'maintenant');
  assert.equal(q[1].slot, '2026-10-13 12:00');
});

test('image publique : 15 minutes au plus, refusée si la photo n’est plus publiée', async t => {
  const { app, db, setNow } = await igApp(t);
  const photo = db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  const post = app.instagram.enqueue(photo);
  db.prepare("UPDATE instagram_posts SET status = 'publishing', media_token = ?, media_token_at = ? WHERE id = ?").run('b'.repeat(32), Date.parse('2026-10-11T10:00:00Z'), post);
  assert.equal((await app.inject(`/partage/instagram/${'b'.repeat(32)}.jpg`)).statusCode, 200);
  setNow(new Date('2026-10-11T10:16:00Z'));                                          // 16 minutes plus tard : expirée
  assert.equal((await app.inject(`/partage/instagram/${'b'.repeat(32)}.jpg`)).statusCode, 404);
  setNow(new Date('2026-10-11T10:01:00Z'));
  db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(photo);
  assert.equal((await app.inject(`/partage/instagram/${'b'.repeat(32)}.jpg`)).statusCode, 404);
});

test('mise en file automatique : rien par défaut, seulement les séries cochées', async t => {
  const c = await admin(t, { INSTAGRAM_APP_ID: '1', INSTAGRAM_APP_SECRET: 's' });
  const queued = id => c.db.prepare("SELECT COUNT(*) FROM instagram_posts WHERE photo_id = ? AND status = 'queued'").pluck().get(id);
  const [a, b] = c.db.prepare(`SELECT p.id FROM photos p WHERE p.status = 'published'
    AND p.category_id <> (SELECT category_id FROM photos WHERE status = 'published' ORDER BY id LIMIT 1) LIMIT 1`).pluck().all()
    .concat(c.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 1").pluck().all());
  const catOf = id => c.db.prepare('SELECT category_id FROM photos WHERE id = ?').pluck().get(id);
  assert.notEqual(catOf(a), catOf(b));
  const republish = async id => {
    c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(id);
    await c.post(`/admin/photos/${id}/status`, { status: 'published' });
  };

  // Réglages jamais enregistrés : rien n'entre dans la file.
  await republish(a); await republish(b);
  assert.equal(queued(a) + queued(b), 0);
  assert.match((await c.as({ url: '/admin/instagram' })).body, /Aucune mise en file automatique/);

  // Ancien réglage global encore en base (coché par défaut avant) : ignoré.
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('instagram', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ autoQueue: true }));
  await republish(a);
  assert.equal(queued(a), 0);

  // Une série cochée : seules ses photos entrent dans la file.
  await c.post('/admin/instagram/reglages', { [`auto_${catOf(b)}`]: 'on' });
  await republish(a); await republish(b);
  assert.equal(queued(a), 0);
  assert.equal(queued(b), 1);
  const page = (await c.as({ url: '/admin/instagram' })).body;
  assert.match(page, new RegExp(`name="auto_${catOf(b)}" checked`));
  assert.match(page, /Mise en file automatique à la publication : /);
});

test('signature du photographe : sous la légende si la photo en a une, retirable par photo, placée par {signature}', async t => {
  const s = { ...DEFAULTS };
  const photo = { title: 'Deux, minuit', legend: 'Une phrase.', place: 'Nantes', taken_on: '2023-11', author: 'Julien', author_signature: '— Julien · @julien.photo', category: 'Rue', ig_signature: 1 };
  assert.match(renderCaption(DEFAULTS.template, photo, s, 'N'), /Une phrase\.\n— Julien · @julien\.photo\n/);
  assert.doesNotMatch(renderCaption(DEFAULTS.template, { ...photo, legend: '' }, s, 'N'), /@julien/);        // pas de légende : pas de signature
  assert.doesNotMatch(renderCaption(DEFAULTS.template, { ...photo, ig_signature: 0 }, s, 'N'), /@julien/);   // retirée pour cette photo
  assert.equal(renderCaption('{titre}\n{legende}\n\n{signature}', photo, s, 'N'), 'Deux, minuit\nUne phrase.\n\n— Julien · @julien.photo');
  // Dans l'admin : la signature se règle sur le photographe, la case de la fiche la retire.
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: 'jeton-de-test-0123456789' } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: 'jeton-de-test-0123456789', author: 'julien', next: '/admin' } });
  const cookies = Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const julien = ctx.db.prepare("SELECT * FROM authors WHERE slug = 'julien'").get();
  await ctx.app.inject({ method: 'POST', url: `/admin/auteurs/${julien.id}`, cookies, payload: { _csrf: csrf, name: julien.name, slug: julien.slug, ig_signature: '— Julien · @julien.photo' }, headers: { accept: 'text/html' } });
  const p = ctx.db.prepare("SELECT id FROM photos WHERE author_id = ? AND status = 'published' AND legend <> '' LIMIT 1").pluck().get(julien.id);
  assert.match(ctx.app.instagram.caption(p), /— Julien · @julien\.photo/);
  assert.match((await ctx.app.inject({ url: `/admin/photos/${p}`, cookies })).body, /name="signature" checked> Ajouter ma signature/);
  await ctx.app.inject({ method: 'POST', url: '/admin/instagram/file', cookies, payload: { _csrf: csrf, photo_id: String(p), signature_set: '1' }, headers: { accept: 'text/html' } });
  assert.equal(ctx.db.prepare('SELECT ig_signature FROM photos WHERE id = ?').pluck().get(p), 0);
  assert.doesNotMatch(ctx.app.instagram.caption(p), /@julien/);
});

// ---------- page Instagram : publier maintenant suivi, journal, dernières publications ----------

async function igAdmin(t, { fail } = {}) {
  let app;
  const meta = fakeMeta({ getApp: () => app, fail });
  const ctx = await setup(t, { seeded: true, env: HTTPS, instagramOptions: { manual: true, fetchImpl: meta.fetchImpl, sleep: async () => {}, timeoutMs: 100 } });
  app = ctx.app;
  await app.instagram.connect('code-oauth');
  // Session d'administrateur (la connexion locale de test est interdite en HTTPS).
  app.accounts.ensure({ sub: 'julien', name: 'julien', roles: ['admin'] });
  const julien = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  app.accounts.update(app.accounts.bySub('julien').id, { authorId: julien }, 'test');
  const token = createSessionStore(ctx.db).create({ sub: 'julien', name: 'julien', roles: [] });
  const cookies = { [app.config.secureCookies ? '__Host-session' : 'session']: token };
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
  const json = (method, url) => app.inject({ method, url, cookies, headers: { accept: 'application/json', 'x-csrf-token': csrf } });
  const html = url => app.inject({ url, cookies, headers: { accept: 'text/html' } }).then(r => r.body);
  const photo = ctx.db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  ctx.db.prepare('UPDATE photos SET faces = 0 WHERE id = ?').run(photo);
  return { ...ctx, meta, json, html, photo, cookies, csrf };
}

test('publier maintenant depuis la page : envoi en arrière-plan, avancement, journal et dernières publications', async t => {
  const c = await igAdmin(t);
  const post = c.app.instagram.enqueue(c.photo, { byName: 'julien' });
  const page = await c.html('/admin/instagram');
  assert.match(page, new RegExp(`data-ig-publish="${post}"`));
  assert.match(page, /data-ig-progress hidden/);
  const r = await c.json('POST', `/admin/instagram/${post}/publier`);
  assert.ok([200, 202].includes(r.statusCode));
  let st;
  for (let k = 0; k < 50; k++) {
    st = (await c.json('GET', `/admin/instagram/${post}/etat`)).json();
    if (st.done) break;
    await new Promise(res => setTimeout(res, 20));
  }
  assert.deepEqual([st.done, st.ok, st.percent, st.permalink], [true, true, 100, 'https://www.instagram.com/p/abc/']);
  assert.equal(st.label, 'Publiée sur Instagram.');
  const after = await c.html('/admin/instagram');
  assert.match(after, /Dernières publications[\s\S]*voir|Dernières publications[\s\S]*publiée le/i);
  // Journal : mise en file, envoi commencé, publiée, avec qui ; état par forme et mot.
  assert.match(after, /class="enc-tag ok">réussi<\/span><\/td><td><a href="\/admin\/photos\/\d+#instagram">[^<]+<\/a><\/td><td>Publiée sur Instagram<\/td><td class="mono">julien/);
  assert.match(after, /<td>Envoi à Instagram commencé<\/td>/);
  assert.match(after, /<td>Mise en file<\/td>/);
  // En anglais, les messages du journal sont traduits.
  const en = (await c.app.inject({ url: '/admin/instagram', cookies: { ...c.cookies, admin_langue: 'en' }, headers: { accept: 'text/html' } })).body;
  assert.match(en, /<td>Published on Instagram<\/td>/);
});

test('publier maintenant : un refus ou un échec revient avec l’état, et s’inscrit au journal', async t => {
  const c = await igAdmin(t, { fail: 'media' });
  const post = c.app.instagram.enqueue(c.photo);
  const r = await c.json('POST', `/admin/instagram/${post}/publier`);
  let st = r.statusCode === 422 ? r.json().state : null;
  for (let k = 0; !st?.done && k < 50; k++) { await new Promise(res => setTimeout(res, 20)); st = (await c.json('GET', `/admin/instagram/${post}/etat`)).json(); }
  assert.equal(st.done, true);
  assert.equal(st.ok, false);
  assert.match(st.label, /^Pas envoyée : /);                                      // 1er essai : reste en file
  assert.doesNotMatch(st.label, /IGQV|access_token=[^…]/);
  assert.match(await c.html('/admin/instagram'), /class="enc-tag warn">attention[\s\S]*Pas envoyée/);
  // Hors file : introuvable ; état d'un post inconnu : « retiré ».
  assert.equal((await c.json('GET', '/admin/instagram/9999/etat')).json().status, 'removed');
});
