import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { as, billet, setV2 } from './carnet-helpers.js';
import { seoRobots, seoSettings } from '../server/seo.js';

const put = (db, key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
const robots = html => /<meta name="robots" content="([^"]*)"/.exec(html)?.[1] || '';
const large = html => /(?:^|,\s*)max-image-preview:large(?:,|$)/.test(robots(html));

// Les outils déclarés ne deviennent pas des navigateurs sous prétexte qu’ils fournissent une langue. Ce n’est
// pas une authentification de Google : la requête conserve exactement les mêmes données et droits publics.
test('lancement SEO : Inspection et GoogleOther gardent la langue de l’URL et ne gonflent pas l’audience', async t => {
  const c = await setup(t, { seeded: true });
  for (const ua of ['Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)', 'GoogleOther', 'GoogleOther-Image/1.0']) {
    for (const url of ['/', '/photo/brume-sur-la-loire', '/a-propos']) {
      const r = await c.app.inject({ url, headers: { 'user-agent': ua, 'accept-language': 'de-DE,de;q=0.9' }, cookies: { langue: 'de' } });
      assert.equal(r.statusCode, 200, `${ua} ${url}`);
      assert.equal(r.headers.location, undefined);
      assert.match(r.body, /<html lang="fr"/);
    }
  }
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM stats_days').pluck().get(), 0);
  const visitor = await c.app.inject({ url: '/', headers: { 'user-agent': 'Mozilla/5.0 Firefox/145.0', 'accept-language': 'de-DE' } });
  assert.equal(visitor.statusCode, 302);
  assert.equal(visitor.headers.location, '/de/');
});

test('lancement SEO : aucun lastmod inventé pour les agrégats, date réelle conservée sur chaque photo', async t => {
  const c = await setup(t, { seeded: true });
  setV2(c);
  c.db.prepare("UPDATE photos SET updated_at = '2026-10-10 12:00:00' WHERE slug = 'brume-sur-la-loire'").run();
  put(c.db, 'seo_title', 'Une nouvelle présentation de l’accueil');
  const r = await c.app.inject('/sitemap.xml');
  assert.equal(r.statusCode, 200);
  const urls = [...r.body.matchAll(/<url><loc>([^<]*)<\/loc>([^]*?)<\/url>/g)];
  for (const path of ['/', '/galerie', '/series']) {
    const entry = urls.find(m => m[1] === `http://localhost:3000${path}`);
    assert.ok(entry, path);
    assert.doesNotMatch(entry[2], /<lastmod>/, path);
  }
  const photo = urls.find(m => m[1] === 'http://localhost:3000/photo/brume-sur-la-loire');
  assert.ok(photo);
  assert.match(photo[2], /<lastmod>2026-10-10<\/lastmod>/);
});

test('lancement SEO : grandes vignettes comme défaut, limites et exclusions explicites prioritaires', () => {
  const s = seoSettings({});
  assert.equal(seoRobots(null, s), '');
  assert.equal(seoRobots(null, s, { indexable: true }), 'max-image-preview:large');
  for (const directive of ['max-image-preview:none', 'max-image-preview:standard', 'max-image-preview:large', 'noindex, follow', 'NOINDEX', 'none', 'noimageindex']) {
    assert.equal(seoRobots(directive, s, { indexable: true }), directive);
  }
  assert.equal(seoRobots(null, { ...s, images: false }, { indexable: true }), 'noimageindex');
  assert.equal(seoRobots(null, { ...s, visibility: 'off' }, { indexable: true }), 'noindex');
});

test('lancement SEO : grandes vignettes sur le public indexable, dans les trois présentations et langues', async t => {
  const c = await setup(t, { seeded: true });
  for (const version of ['v1', 'v2', 'v3']) {
    c.app.publicVersion.save(version);
    for (const prefix of ['', '/en', '/de']) {
      for (const path of ['/', '/photo/brume-sur-la-loire', '/serie/paysage', '/a-propos']) {
        const r = await c.app.inject(`${prefix}${path}`);
        assert.equal(r.statusCode, 200, `${version} ${prefix}${path}`);
        assert.ok(large(r.body), `${version} ${prefix}${path}`);
      }
    }
  }
});

test('lancement SEO : ni formulaire sensible, ni erreur, ni aperçu, ni site ou images exclus ne reçoit la permission large', async t => {
  const c = await setup(t, { seeded: true });
  setV2(c);
  for (const path of ['/bonjour', '/contact', '/droits/demande', '/introuvable']) {
    const r = await c.app.inject(path);
    assert.ok([200, 404].includes(r.statusCode), path);
    assert.ok(!large(r.body), path);
  }
  const admin = as(c, { sub: 'seo-lancement', roles: ['admin'] });
  const preview = await admin.get('/carte');
  assert.equal(preview.statusCode, 200);
  assert.match(preview.headers['x-robots-tag'] || '', /noindex/);
  assert.ok(!large(preview.body));
  for (const [key, value, directive] of [['seo_images', false, 'noimageindex'], ['seo_visibility', 'off', 'noindex']]) {
    put(c.db, key, value);
    const home = await c.app.inject('/');
    assert.match(robots(home.body), new RegExp(directive));
    assert.ok(!large(home.body), key);
  }
});

test('lancement SEO : les Carnets conservent leur permission explicite et la langue de repli reste exclue', async t => {
  const c = await setup(t, { seeded: true });
  setV2(c);
  const p = await billet(c, { title: 'Le fleuve au matin', body: 'Un regard sur le fleuve.\n\nphoto:brume-sur-la-loire' });
  const slug = c.app.carnet.get(p.id).slug;
  const fr = await c.app.inject(`/carnet/${slug}`);
  assert.equal(fr.statusCode, 200);
  assert.equal(robots(fr.body), 'max-image-preview:large');
  const de = await c.app.inject(`/de/carnet/${slug}`);
  assert.equal(de.statusCode, 200);
  assert.match(de.headers['x-robots-tag'] || '', /noindex/);
  assert.ok(!large(de.body));
});
