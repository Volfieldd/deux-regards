import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as, billet, setV2, visitor } from './carnet-helpers.js';
import { seoSettings, validateSeo, SeoError } from '../server/seo.js';
import { createSaisons } from '../server/saisons.js';

const URL = '/admin/referencement';
const defaults = () => ({ seo_visibility: 'public', seo_images: 'oui', seo_title: '', seo_title_en: '', seo_title_de: '', seo_description: '', seo_description_en: '', seo_description_de: '' });
const setting = (db, key) => { const value = db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(key); return value === undefined ? undefined : JSON.parse(value); };
const put = (db, key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
const title = html => /<title>([^]*?)<\/title>/.exec(html)?.[1];
const description = html => /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
const jsonLd = html => [...html.matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const entities = html => jsonLd(html).flatMap(j => j['@graph'] || [j]);

test('référencement : les réglages absents gardent la visibilité publique et les textes automatiques', () => {
  assert.deepEqual(seoSettings({}), { visibility: 'public', images: true, title: { fr: '', en: '', de: '' }, description: { fr: '', en: '', de: '' } });
  const values = validateSeo(defaults());
  assert.equal(values.seo_visibility, 'public');
  assert.equal(values.seo_images, true);
  assert.equal(values.seo_description, '');
});

test('référencement : champs typés et bornés, choix fermés, aucune conversion d’objet en texte', () => {
  for (const change of [
    { seo_visibility: 'constructor' }, { seo_images: 'peut-être' }, { seo_images: true },
    { seo_title: 'x'.repeat(101) }, { seo_description: 'x'.repeat(321) },
    { seo_title_en: ['texte'] }, { seo_description_de: { text: 'texte' } },
  ]) assert.throws(() => validateSeo({ ...defaults(), ...change }), SeoError, JSON.stringify(change));
  const incomplete = defaults();
  delete incomplete.seo_images;
  assert.throws(() => validateSeo(incomplete), SeoError);
  assert.equal(validateSeo({ ...defaults(), seo_title: 'x'.repeat(100), seo_description: 'x'.repeat(320) }).seo_title.length, 100);
});

test('référencement : formulaire serveur en admin v1 et v2, jeton CSRF et valeurs enregistrées', async t => {
  const c = await setup(t);
  const admin = as(c, { sub: 'seo-admin', roles: ['admin'] });
  for (const version of ['v1', 'v2']) {
    await admin.post('/admin/version', { version, back: URL });
    const page = await admin.get(URL);
    assert.equal(page.statusCode, 200, version);
    assert.equal(page.headers['cache-control'], 'no-store');
    assert.match(page.body, /<form[^>]*action="\/admin\/referencement"[^>]*method="post"|<form[^>]*method="post"[^>]*action="\/admin\/referencement"/i);
    assert.match(page.body, new RegExp(`name="_csrf" value="${admin.csrf}"`));
    for (const key of Object.keys(defaults())) assert.ok(page.body.includes(`name="${key}"`), `${version} : ${key}`);
    assert.equal(page.body.includes('/static/admin/v2/v2.css'), version === 'v2');
    assert.doesNotMatch(page.body, /\sstyle="|\son[a-z]+="/);
    assert.doesNotMatch(page.body, /<script(?![^>]*(?:\bsrc=|type="application\/json"))[^>]*>/);
    const form = new URLSearchParams({ _csrf: admin.csrf, ...defaults(), seo_title: `Accueil ${version}` });
    const saved = await c.app.inject({ method: 'POST', url: URL, cookies: admin.cookies, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: form.toString() });
    assert.equal(saved.statusCode, 303, saved.body);
    assert.equal(setting(c.db, 'seo_title'), `Accueil ${version}`);
    assert.match((await admin.get(URL)).body, new RegExp(`Accueil ${version}`));
  }
});

test('référencement : lecture et écriture réservées au droit existant site.apparence', async t => {
  const c = await setup(t);
  as(c, { sub: 'seo-admin', roles: ['admin'] });
  assert.equal((await c.app.inject(URL)).statusCode, 302);
  for (const role of ['photographe', 'moderateur', 'relecteur']) {
    const user = as(c, { sub: `seo-${role}`, roles: [role] });
    assert.equal((await user.get(URL)).statusCode, 403, role);
    assert.equal((await user.post(URL, { ...defaults(), seo_visibility: 'off' })).statusCode, 403, role);
    assert.equal(setting(c.db, 'seo_visibility'), undefined);
    assert.doesNotMatch((await user.get('/admin')).body, /href="\/admin\/referencement"/, role);
  }
});

test('référencement : CSRF et validation refusent une écriture atomiquement en gardant la saisie', async t => {
  const c = await setup(t);
  const admin = as(c, { sub: 'seo-admin', roles: ['admin'] });
  assert.equal((await admin.post(URL, { ...defaults(), _csrf: '' })).statusCode, 403);
  assert.equal((await admin.post(URL, { ...defaults(), _csrf: 'incorrect' })).statusCode, 403);
  assert.equal(setting(c.db, 'seo_title'), undefined);
  await admin.post(URL, { ...defaults(), seo_title: 'Titre conservé' });
  for (const invalid of [{ seo_images: [] }, { seo_description: 'x'.repeat(321) }, { seo_title_de: { text: '<script>refus</script>' } }]) {
    const res = await admin.post(URL, { ...defaults(), seo_title: 'Saisie <à corriger>', ...invalid });
    assert.equal(res.statusCode, 422, res.body);
    assert.match(res.body, /Saisie &lt;à corriger&gt;/);
    assert.match(res.body, /aria-invalid="true"/);
    assert.equal(setting(c.db, 'seo_title'), 'Titre conservé');
    assert.equal(setting(c.db, 'seo_images'), true);
  }
});

test('référencement : enregistrement indépendant et accueil traduit en v1, v2 et v3, textes échappés', async t => {
  const c = await setup(t, { seeded: true });
  const admin = as(c, { sub: 'seo-admin', roles: ['admin'] });
  const before = Object.fromEntries(c.db.prepare("SELECT key, value FROM settings WHERE key NOT LIKE 'seo_%'").all().map(r => [r.key, r.value]));
  const form = { ...defaults(), seo_title: 'Photographies <du fleuve>', seo_title_en: 'River photographs', seo_title_de: 'Fotografien am Fluss',
    seo_description: 'Deux regards & une lumière.', seo_description_en: 'Two views of the river.', seo_description_de: 'Zwei Blicke auf den Fluss.' };
  assert.equal((await admin.post(URL, form)).statusCode, 303);
  for (const [key, value] of Object.entries(before)) assert.equal(c.db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(key), value, key);
  for (const version of ['v1', 'v2', 'v3']) {
    c.app.publicVersion.save(version);
    for (const [lang, path] of [['fr', '/'], ['en', '/en'], ['de', '/de']]) {
      const html = (await c.app.inject(path)).body;
      const suffix = lang === 'fr' ? '' : `_${lang}`;
      assert.equal(title(html), form[`seo_title${suffix}`].replace('<', '&lt;').replace('>', '&gt;'), `${version}, ${lang}`);
      assert.equal(description(html), form[`seo_description${suffix}`].replace('&', '&amp;'), `${version}, ${lang}`);
      assert.match(html, /rel="canonical"/);
      assert.match(html, /hreflang="fr"/);
      assert.doesNotMatch(html, /<du fleuve>/);
    }
  }
  const photo = await c.app.inject('/photo/brume-sur-la-loire');
  assert.doesNotMatch(title(photo.body), /Photographies/);
  assert.equal((await admin.post('/admin/reglages', { part: 'site', site_name: 'Nouveau nom', tagline: 'Une accroche.', intro: '', about: '' })).statusCode, 303);
  assert.equal(setting(c.db, 'seo_title'), form.seo_title);
  assert.equal((await admin.post(URL, defaults())).statusCode, 303);
  const auto = await c.app.inject('/');
  assert.match(title(auto.body), /Nouveau nom/);
  assert.equal(description(auto.body), 'Une accroche.');
});

test('référencement : hors moteurs, noindex lisible par les robots, sitemap vide puis rétabli', async t => {
  const c = await setup(t, { seeded: true });
  const admin = as(c, { sub: 'seo-admin', roles: ['admin'] });
  assert.equal((await admin.post(URL, { ...defaults(), seo_visibility: 'off' })).statusCode, 303);
  for (const path of ['/', '/en', '/de/a-propos', '/photo/brume-sur-la-loire', '/droits']) {
    const page = await c.app.inject(path);
    assert.equal(page.statusCode, 200, path);
    assert.match(page.headers['x-robots-tag'] || '', /(?:^|[,\s])noindex(?:$|[,\s])/, path);
    assert.match(page.body, /<meta name="robots" content="[^"]*noindex/);
  }
  const sitemap = await c.app.inject('/sitemap.xml');
  assert.equal(sitemap.statusCode, 200);
  assert.doesNotMatch(sitemap.body, /<url>/);
  const robots = (await c.app.inject('/robots.txt')).body;
  assert.doesNotMatch(robots, /^Disallow: \/\s*$/m);
  assert.match(robots, /^Disallow: \/admin$/m);
  assert.match(robots, /^Disallow: \/prive\/$/m);
  assert.doesNotMatch(robots, /^Disallow: \/g\//m);
  assert.equal((await admin.post(URL, defaults())).statusCode, 303);
  assert.doesNotMatch((await c.app.inject('/')).headers['x-robots-tag'] || '', /noindex/);
  assert.match((await c.app.inject('/sitemap.xml')).body, /<url>/);
});

test('référencement : exclusion des images par HTML et média, sans exposer les originaux ni les brouillons', async t => {
  const c = await setup(t, { seeded: true });
  const admin = as(c, { sub: 'seo-admin', roles: ['admin'] });
  const photo = c.db.prepare("SELECT * FROM photos WHERE slug = 'brume-sur-la-loire'").get();
  const media = `/media/${photo.file.replace(/\.jpg$/, '')}-640.webp`;
  assert.equal((await admin.post(URL, { ...defaults(), seo_images: 'non' })).statusCode, 303);
  const page = await c.app.inject(`/photo/${photo.slug}`);
  assert.match(page.headers['x-robots-tag'] || '', /noimageindex/);
  assert.match(page.body, /<meta name="robots" content="[^"]*noimageindex/);
  const image = await c.app.inject(media);
  assert.equal(image.statusCode, 200);
  assert.match(image.headers['x-robots-tag'] || '', /noindex/);
  assert.doesNotMatch((await c.app.inject('/sitemap.xml')).body, /<image:image>/);
  assert.equal((await c.app.inject(`/media/${photo.file}`)).statusCode, 404);
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(photo.id);
  assert.equal((await c.app.inject(media)).statusCode, 404);
  assert.equal((await c.app.inject(`/photo/${photo.slug}`)).statusCode, 404);
  c.db.prepare("UPDATE photos SET status = 'published' WHERE id = ?").run(photo.id);
  await admin.post(URL, defaults());
  assert.doesNotMatch((await c.app.inject(media)).headers['x-robots-tag'] || '', /noindex/);
});

test('référencement : les médias conservent la politique courante sur une réponse conditionnelle 304', async t => {
  const c = await setup(t, { seeded: true });
  const admin = as(c, { sub: 'seo-admin', roles: ['admin'] });
  const file = c.db.prepare("SELECT file FROM photos WHERE slug = 'brume-sur-la-loire'").pluck().get();
  const media = `/media/${file.replace(/\.jpg$/, '')}-640.webp`;
  const initial = await c.app.inject(media);
  assert.equal(initial.statusCode, 200);
  const etag = initial.headers.etag;
  assert.ok(etag);
  for (const images of ['non', 'oui']) {
    assert.equal((await admin.post(URL, { ...defaults(), seo_images: images })).statusCode, 303);
    for (const method of ['GET', 'HEAD']) {
      const cached = await c.app.inject({ method, url: media, headers: { 'if-none-match': etag } });
      assert.equal(cached.statusCode, 304, `${images}, ${method}`);
      assert.equal(cached.body, '');
      assert.equal(/noindex/.test(cached.headers['x-robots-tag'] || ''), images === 'non', `${images}, ${method}`);
    }
  }
});

test('référencement : données structurées photo sûres, variantes publiques et sitemap images multilingue', async t => {
  const c = await setup(t, { seeded: true });
  const bad = '</script><script>alert(1)</script>';
  c.db.prepare("UPDATE photos SET title = ?, legend = ?, show_time = 0, on_map = 0 WHERE slug = 'brume-sur-la-loire'").run(`Brume ${bad}`, `Un matin ${bad}`);
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE slug = 'deux-minuit'").run();
  for (const version of ['v1', 'v2', 'v3']) {
    c.app.publicVersion.save(version);
    const home = (await c.app.inject('/')).body;
    assert.ok(entities(home).some(e => e['@type'] === 'WebSite'), version);
    const html = (await c.app.inject('/photo/brume-sur-la-loire')).body;
    const image = entities(html).find(e => e['@type'] === 'ImageObject');
    assert.ok(image, version);
    assert.match(image.contentUrl || image.url, /^http:\/\/localhost:3000\/media\/[^/]+\.(?:webp|avif|jpg)$/);
    assert.match(image.name || image.caption, /Brume|Un matin/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.doesNotMatch(JSON.stringify(image), /originals|latitude|longitude|contentLocation|dateCreated|DateTimeOriginal/);
    assert.ok(image.creator || image.creditText || image.copyrightNotice || image.license);
  }
  const sitemap = (await c.app.inject('/sitemap.xml')).body;
  assert.match(sitemap, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.match(sitemap, /<image:image><image:loc>http:\/\/localhost:3000\/media\//);
  assert.match(sitemap, /<loc>http:\/\/localhost:3000\/en\/photo\/brume-sur-la-loire<\/loc>/);
  assert.doesNotMatch(sitemap, /\/photo\/deux-minuit/);
  assert.doesNotMatch(sitemap, /originals|<script>/);
});

test('référencement : descriptions propres aux séries et aux photographes, couverture issue de leur contenu', async t => {
  const c = await setup(t, { seeded: true });
  c.db.prepare("UPDATE categories SET intent = 'Une promenade au bord du fleuve.' WHERE slug = 'paysage'").run();
  c.db.prepare("UPDATE authors SET short_bio = 'Je photographie les nuits de la ville.' WHERE slug = 'julien'").run();
  for (const version of ['v1', 'v2', 'v3']) {
    c.app.publicVersion.save(version);
    assert.equal(description((await c.app.inject('/serie/paysage')).body), 'Une promenade au bord du fleuve.');
    const by = (await c.app.inject('/auteur/julien')).body;
    assert.equal(description(by), 'Je photographie les nuits de la ville.');
    const og = /<meta property="og:image" content="[^"]*\/media\/([^"/]+)"/.exec(by)?.[1];
    assert.ok(og);
    const ownFiles = c.db.prepare("SELECT p.file FROM photos p JOIN authors a ON a.id = p.author_id WHERE a.slug = 'julien' AND p.status = 'published'").pluck().all();
    assert.ok(ownFiles.some(f => og.startsWith(f.replace(/\.jpg$/, ''))), `${version} : ${og}`);
  }
});

test('référencement : le sitemap suit les projections publiques des expositions et collections', async t => {
  const c = await setup(t, { seeded: true });
  setV2(c);
  const closes = Date.now() - 864e5, opens = closes - 7 * 864e5;
  const saisons = createSaisons({ db: c.db, readiness: c.app.readiness, now: () => opens + 60000 });
  const photo_ids = c.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 2").pluck().all();
  const id = saisons.create({ title: 'Exposition publique', title_en: 'Public exhibition', title_de: 'Öffentliche Ausstellung', intro: 'Une exposition.', intro_en: 'An exhibition.', intro_de: 'Eine Ausstellung.', opens_at: opens, closes_at: closes });
  saisons.setPhotos(id, photo_ids);
  saisons.update(id, { cover_id: photo_ids[0] });
  saisons.open(id);
  const slug = saisons.get(id).slug;
  const draft = saisons.create({ title: 'Exposition préparée' });
  const draftSlug = saisons.get(draft).slug;
  const bilans = c.app.saisonsBilans;
  const report = bilans.createReport(id, { title: 'Bilan', title_en: 'Retrospective', title_de: 'Rückblick', body: 'Notre récit.', body_en: 'Our account.', body_de: 'Unser Bericht.', photo_ids });
  bilans.publishReport(report, { version: 1 });
  const collection = bilans.createCollection(report, { title: 'Collection publique', title_en: 'Public collection', title_de: 'Öffentliche Sammlung', intro: 'Deux photographies.', intro_en: 'Two photographs.', intro_de: 'Zwei Fotografien.', photo_ids, cover_id: photo_ids[0] });
  bilans.publishCollection(collection, { version: 1 });
  const collectionSlug = bilans.getCollection(collection).slug;
  const hidden = bilans.createCollection(report, { title: 'Collection préparée' });
  const hiddenSlug = bilans.getCollection(hidden).slug;
  let sitemap = (await c.app.inject('/sitemap.xml')).body;
  for (const prefix of ['', '/en', '/de']) {
    for (const path of ['/expositions', `/exposition/${slug}`, '/collections', `/collection/${collectionSlug}`]) {
      assert.ok(sitemap.includes(`<loc>http://localhost:3000${prefix}${path}</loc>`), `${prefix}${path}`);
    }
  }
  assert.doesNotMatch(sitemap, new RegExp(`/exposition/${draftSlug}|/collection/${hiddenSlug}`));
  saisons.withdraw(id);
  sitemap = (await c.app.inject('/sitemap.xml')).body;
  assert.doesNotMatch(sitemap, new RegExp(`/exposition/${slug}`));
  assert.ok(sitemap.includes(`/collection/${collectionSlug}`));
  bilans.withdrawCollection(collection, { version: bilans.getCollection(collection).version });
  assert.doesNotMatch((await c.app.inject('/sitemap.xml')).body, new RegExp(`/collection/${collectionSlug}`));
});

test('référencement : les exclusions propres aux Carnets et aux galeries privées restent prioritaires', async t => {
  const c = await setup(t, { seeded: true });
  setV2(c);
  const post = await billet(c, { title: 'Carnet de la rive', body: 'photo:brume-sur-la-loire' });
  const see = visitor(c);
  const published = await see(`/carnet/${post.slug}`);
  assert.ok(entities(published.body).some(e => e['@type'] === 'BlogPosting'));
  const fallback = await see(`/en/carnet/${post.slug}`);
  assert.match(fallback.headers['x-robots-tag'] || '', /noindex/);
  assert.doesNotMatch(fallback.body, /<link rel="alternate" hreflang="en"/);
  const authorId = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const date = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const id = c.app.spaces.createSpace({ title: 'Titre privé à ne pas publier', closes: date(60) }, { authorId, by: 'test' });
  c.app.spaces.addPhotos(id, [c.db.prepare('SELECT id FROM photos LIMIT 1').pluck().get()]);
  c.app.spaces.setState(id, 'ouverte', null);
  const invite = await c.app.spaces.createInvite(id, { label: 'Invitée', lang: 'fr', expires: date(30) }, { by: 'test', request: null });
  const privatePage = await see(`/g/${invite.token}`);
  assert.equal(privatePage.statusCode, 200);
  assert.match(privatePage.headers['x-robots-tag'] || '', /noindex/);
  assert.match(privatePage.body, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(privatePage.body, /Titre privé|og:|rel="canonical"|application\/ld\+json/);
  const sitemap = (await see('/sitemap.xml')).body;
  assert.doesNotMatch(sitemap, /Titre privé|\/g\/|\/prive\//);
});

test('référencement : la Vigie voit les changements sans texte libre ; identique ou refusé ne change rien', async t => {
  const received = [];
  const c = await setup(t, { env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { send: async body => { received.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false } });
  const admin = as(c, { sub: 'seo-admin', roles: ['admin'] });
  const flush = async () => { c.app.securite.runTasks(); c.app.securite.retryNow(); await c.app.securite.flush(); return received.filter(e => e.type === 'config_public_changed'); };
  const text = 'Texte éditorial réservé au rendu des métadonnées.';
  const form = { ...defaults(), seo_visibility: 'off', seo_images: 'non', seo_title: text, seo_description: text };
  assert.equal((await admin.post(URL, form)).statusCode, 303);
  const events = await flush();
  const config = events.find(e => e.detail?.cles?.includes('seo_visibility'));
  assert.ok(config, JSON.stringify(events));
  assert.ok(config.detail.cles.includes('seo_images'));
  assert.ok(config.detail.cles.includes('seo_title'));
  assert.equal(config.detail.valeurs.seo_visibility.apres, 'off');
  assert.equal(config.detail.valeurs.seo_images.apres, false);
  assert.doesNotMatch(JSON.stringify(received), new RegExp(text));
  const audit = c.db.prepare('SELECT detail FROM audit_log ORDER BY id').all();
  assert.match(JSON.stringify(audit), /seo_title/);
  assert.doesNotMatch(JSON.stringify(audit), new RegExp(text));
  const count = events.length;
  assert.equal((await admin.post(URL, form)).statusCode, 303);
  assert.equal((await flush()).length, count);
  assert.equal((await admin.post(URL, { ...form, seo_visibility: 'refus' })).statusCode, 422);
  assert.equal((await flush()).length, count);
});
