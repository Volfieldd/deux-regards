import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { createStats, parisDay, sourceOf, siteOf, countryOf } from '../server/stats.js';

const TOKEN = 'jeton-de-test-0123456789';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
const visit = (app, url, { ua = UA, ip = '203.0.113.7', headers = {}, cookies } = {}) =>
  app.inject({ url, remoteAddress: ip, headers: { 'user-agent': ua, ...headers }, cookies });
const count = (db, sql, ...a) => db.prepare(sql).pluck().get(...a) ?? 0;

test('jour à l’heure de Paris, provenance réduite au nom du site', () => {
  assert.equal(parisDay(new Date('2026-10-10T22:30:00Z')), '2026-10-11');         // minuit passé à Paris
  assert.equal(sourceOf('', 'nicephos.com'), 'direct');
  assert.equal(sourceOf('https://www.Google.fr/search?q=secret', 'nicephos.com'), 'google.fr');   // jamais la requête
  assert.equal(sourceOf('https://nicephos.com/serie/rue', 'nicephos.com'), null);   // navigation interne
  assert.equal(sourceOf('pas une url', 'nicephos.com'), 'direct');
});

test('pages et photos comptées ; visiteur unique par jour, sans IP stockée', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const slug = db.prepare("SELECT slug FROM photos WHERE status = 'published' ORDER BY position LIMIT 1").pluck().get();
  const id = db.prepare('SELECT id FROM photos WHERE slug = ?').pluck().get(slug);
  await visit(app, '/', { headers: { referer: 'https://www.instagram.com/p/xyz' } });
  await visit(app, `/photo/${slug}`, { headers: { referer: 'http://localhost:3000/' } });
  await visit(app, `/photo/${slug}`);
  await visit(app, '/serie/rue');
  await visit(app, '/a-propos', { ua: MOBILE, ip: '198.51.100.4' });                  // second visiteur, sur téléphone
  await visit(app, '/droits', { ua: MOBILE, ip: '198.51.100.4' });
  const day = parisDay();
  assert.equal(count(db, 'SELECT views FROM stats_pages WHERE day = ? AND page = ?', day, 'accueil'), 1);
  assert.equal(count(db, 'SELECT views FROM stats_pages WHERE day = ? AND page = ?', day, 'serie:rue'), 1);
  assert.equal(count(db, 'SELECT views FROM stats_photos WHERE day = ? AND photo_id = ?', day, id), 2);
  assert.deepEqual(db.prepare('SELECT visitors, mobile FROM stats_days WHERE day = ?').get(day), { visitors: 2, mobile: 1 });
  assert.deepEqual(db.prepare('SELECT source, visits FROM stats_sources ORDER BY source').all(), [{ source: 'direct', visits: 1 }, { source: 'instagram.com', visits: 1 }]);
  // Aucune trace d'adresse ni de navigateur dans la base.
  const dump = JSON.stringify(['stats_pages', 'stats_photos', 'stats_days', 'stats_sources'].map(tb => db.prepare(`SELECT * FROM ${tb}`).all()));
  assert.doesNotMatch(dump, /203\.0\.113|198\.51\.100|Mozilla/);
});

test('non comptés : robots, refus de suivi, préchargement, admins connectés, 404, HEAD', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const { app, db } = ctx;
  await visit(app, '/', { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  await visit(app, '/', { ua: 'facebookexternalhit/1.1' });
  await visit(app, '/', { ua: '' });
  await visit(app, '/', { headers: { dnt: '1' } });
  await visit(app, '/', { headers: { 'sec-gpc': '1' } });
  await visit(app, '/', { headers: { 'sec-purpose': 'prefetch' } });
  await visit(app, '/photo/nexiste-pas');
  await app.inject({ method: 'HEAD', url: '/', headers: { 'user-agent': UA } });
  const login = await app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  await visit(app, '/', { cookies: cookiesOf(login) });
  assert.equal(count(db, 'SELECT COUNT(*) FROM stats_pages'), 0);
  assert.equal(count(db, 'SELECT COUNT(*) FROM stats_days'), 0);
});

test('nouveau jour : visiteurs reconnus à nouveau (clé changée) ; purge au-delà de 25 mois ; photo supprimée', async t => {
  const { db } = await setup(t, { seeded: true });
  let clock = new Date('2026-10-11T08:00:00Z');
  const stats = createStats({ db, publicUrl: 'https://nicephos.com', now: () => clock });
  const req = { method: 'GET', ip: '203.0.113.7', headers: { 'user-agent': UA }, session: null };
  db.prepare("INSERT INTO stats_pages (day, page, views) VALUES ('2024-08-01', 'accueil', 5), ('2024-09-30', 'accueil', 2)").run();
  stats.hit(req, { page: 'accueil' });
  stats.hit(req, { page: 'accueil' });
  assert.equal(count(db, "SELECT visitors FROM stats_days WHERE day = '2026-10-11'"), 1);
  assert.deepEqual(db.prepare("SELECT day FROM stats_pages WHERE day < '2026'").pluck().all(), ['2024-09-30']);   // > 25 mois : effacé ; 24 mois : gardé
  clock = new Date('2026-10-12T08:00:00Z');
  stats.hit(req, { page: 'accueil' });
  assert.equal(count(db, "SELECT visitors FROM stats_days WHERE day = '2026-10-12'"), 1);
  const id = db.prepare('SELECT id FROM photos LIMIT 1').pluck().get();
  stats.hit(req, { photoId: id });
  db.prepare('DELETE FROM photos WHERE id = ?').run(id);
  assert.equal(count(db, 'SELECT COUNT(*) FROM stats_photos'), 0);                              // suivie par la suppression
  const r = stats.range(30);
  assert.equal(stats.daily(r.from, r.to).length, 30);
});

test('admin : page Statistiques, audience d’une photo, accueil ; réservé aux admins', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const { app, db } = ctx;
  const p = db.prepare("SELECT id, slug, title FROM photos WHERE status = 'published' ORDER BY position LIMIT 1").get();
  for (let i = 0; i < 3; i++) await visit(app, `/photo/${p.slug}`, { ip: `203.0.113.${i + 1}` });
  await visit(app, '/');
  const login = await app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  const as = url => app.inject({ url, cookies: cookiesOf(login) });
  for (const periode of ['30', '90', '365', 'nimporte']) {
    const page = await as(`/admin/statistiques?periode=${periode}`);
    assert.equal(page.statusCode, 200, periode);
    assert.match(page.body, /<svg class="chart"/);
  }
  const body = (await as('/admin/statistiques')).body;
  assert.match(body, /<b>4<\/b><span>visiteurs/);                      // 3 adresses sur la photo + une 4e sur l'accueil
  assert.match(body, /<b>4<\/b><span>pages vues/);
  assert.ok(body.includes(`>${p.title}</a>`));
  assert.match(body, /<title>\d+ (oct|nov|déc|janv)/);
  const s = (await as(`/admin/photos/${p.id}/statistiques`)).json();
  assert.equal(s.total, 3);
  assert.equal(s.rank, 1);
  assert.equal(s.days.length, 30);
  assert.match(s.spark, /^<svg class="spark"/);
  assert.match((await as(`/admin/photos/${p.id}`)).body, /<strong>3<\/strong> ouvertures en grand · 1ʳᵉ photo la plus vue/);
  assert.match((await as('/admin')).body, /<b>4<\/b><span>visiteurs aujourd’hui<\/span>/);
  assert.match((await as('/admin')).body, /La photo du moment/);
  assert.notEqual((await app.inject('/admin/statistiques')).statusCode, 200);
  assert.notEqual((await app.inject(`/admin/photos/${p.id}/statistiques`)).statusCode, 200);
  assert.match((await app.inject('/droits')).body, /Mesure d’audience/);
});

test('bornes : un client qui change de navigateur ne gonfle ni les visiteurs ni les provenances', async t => {
  const { app, db } = await setup(t, { seeded: true });
  for (let i = 0; i < 40; i++) await visit(app, '/', { ua: `${UA} variante/${i}`, headers: { referer: `https://site${i}.example/page` } });
  assert.equal(count(db, 'SELECT visitors FROM stats_days'), 5);                       // 5 navigateurs au plus par adresse
  assert.equal(count(db, 'SELECT views FROM stats_pages WHERE page = ?', 'accueil'), 40);   // les pages vues, elles, comptent
  assert.equal(siteOf('l.instagram.com'), 'instagram.com');
  assert.equal(siteOf('news.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(sourceOf('https://xn--caf-dma.fr/', 'x'), 'xn--caf-dma.fr');
});

test('pays : code de Cloudflare, derrière le proxy de confiance seulement, par visiteur unique', async t => {
  assert.equal(countryOf({ 'cf-ipcountry': 'fr' }, true), 'FR');
  for (const v of ['XX', 'T1', 'FRA', '', undefined, '<b>']) assert.equal(countryOf({ 'cf-ipcountry': v }, true), 'XX', String(v));
  assert.equal(countryOf({ 'cf-ipcountry': 'FR' }, false), 'XX');                      // sans proxy de confiance : en-tête inventable
  // Derrière un proxy de confiance (comme le tunnel Cloudflare en production).
  const { app, db } = await setup(t, { seeded: true, env: { TRUST_PROXY: '127.0.0.1' } });
  const fr = { 'cf-ipcountry': 'FR' };
  await visit(app, '/', { ip: '127.0.0.1', headers: { ...fr, 'x-forwarded-for': '203.0.113.7' } });
  await visit(app, '/a-propos', { ip: '127.0.0.1', headers: { ...fr, 'x-forwarded-for': '203.0.113.7' } });   // même visiteur
  await visit(app, '/', { ip: '127.0.0.1', headers: { 'cf-ipcountry': 'DE', 'x-forwarded-for': '198.51.100.4' } });
  await visit(app, '/', { ip: '127.0.0.1', headers: { 'x-forwarded-for': '192.0.2.9' } });                  // sans pays
  assert.deepEqual(db.prepare('SELECT country, visitors FROM stats_countries ORDER BY country').all(),
    [{ country: 'DE', visitors: 1 }, { country: 'FR', visitors: 1 }, { country: 'XX', visitors: 1 }]);
  assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM stats_countries').all()), /203\.0\.113|198\.51/);
});

test('sans proxy de confiance, le pays envoyé par le client est ignoré', async t => {
  const { app, db } = await setup(t, { seeded: true });
  await visit(app, '/', { headers: { 'cf-ipcountry': 'JP' } });
  assert.deepEqual(db.prepare('SELECT country, visitors FROM stats_countries').all(), [{ country: 'XX', visitors: 1 }]);
});

test('admin : carte des visiteurs par pays (bulles) et liste ; mention publique dans les trois langues', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const day = parisDay();
  const ins = ctx.db.prepare('INSERT INTO stats_countries (day, country, visitors) VALUES (?, ?, ?)');
  ins.run(day, 'FR', 120); ins.run(day, 'DE', 30); ins.run(day, 'JP', 3); ins.run(day, 'XX', 5);
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  const page = (await ctx.app.inject({ url: '/admin/statistiques', cookies: cookiesOf(res) })).body;
  assert.match(page, /<image href="\/static\/admin\/carte-monde\.svg[^"]*"/);
  const circles = [...page.matchAll(/<circle cx="(\d+)" cy="(\d+)" r="([\d.]+)"><title>([^<]+)<\/title>/g)].map(m => ({ x: +m[1], y: +m[2], r: +m[3], t: m[4] }));
  assert.equal(circles.length, 3);                                                     // pays inconnu : liste seulement
  assert.equal(circles[0].t, 'France · 120 visiteurs');
  assert.equal(circles[0].r, 24);                                                      // la plus grande bulle
  assert.ok(circles[1].r < circles[0].r && circles[2].r < circles[1].r);
  assert.ok(circles[0].x > 480 && circles[0].x < 540 && circles[0].y > 90 && circles[0].y < 140, 'France en Europe de l’Ouest');
  assert.match(page, /<li><span class="t">Pays inconnu/);
  assert.match((await ctx.app.inject('/droits')).body, /pays \(indiqué par notre hébergeur Cloudflare\)/);
  assert.match((await ctx.app.inject('/en/droits')).body, /country \(as provided by our host, Cloudflare\)/);
  assert.match((await ctx.app.inject('/de/droits')).body, /Land \(von unserem Hoster Cloudflare übermittelt\)/);
});
