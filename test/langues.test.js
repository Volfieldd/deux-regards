import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { detectLang, browserLangs, pick, splitLang, localize } from '../server/i18n.js';

// Site en trois langues : français à la racine, anglais à /en, allemand à /de ; textes de l'interface traduits,
// textes des auteurs traduisibles (repli sur une autre langue), langue choisie d'après le pays et le navigateur.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15';

async function admin(t, env = {}) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, ...env } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = opts => ctx.app.inject({ ...opts, cookies: { ...cookies, ...opts.cookies } });
  const post = (url, payload = {}) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  const id = (table, slug) => ctx.db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).pluck().get(slug);
  return { ...ctx, as, post, id };
}

test('langue d’un visiteur : pays francophone, germanophone, sinon anglais ; pays à plusieurs langues départagés par le navigateur', () => {
  assert.equal(detectLang({ country: 'FR', acceptLanguage: 'en-US' }), 'fr');
  assert.equal(detectLang({ country: 'SN' }), 'fr');
  assert.equal(detectLang({ country: 'AT', acceptLanguage: 'en' }), 'de');
  assert.equal(detectLang({ country: 'US', acceptLanguage: 'fr-FR' }), 'en');
  assert.equal(detectLang({ country: 'JP', acceptLanguage: 'ja' }), 'en');
  assert.equal(detectLang({ country: 'CH', acceptLanguage: 'de-CH,de;q=0.9' }), 'de');
  assert.equal(detectLang({ country: 'CH', acceptLanguage: 'fr-CH,fr;q=0.9,de;q=0.5' }), 'fr');
  assert.equal(detectLang({ country: 'BE', acceptLanguage: 'nl-BE,nl;q=0.9' }), 'en');
  assert.equal(detectLang({ country: 'CA', acceptLanguage: 'fr-CA' }), 'fr');
  assert.equal(detectLang({ country: 'CA', acceptLanguage: 'en-CA' }), 'en');
  assert.equal(detectLang({ country: 'XX', acceptLanguage: 'de-DE,en;q=0.5' }), 'de');   // pays inconnu (réseau local)
  assert.equal(detectLang({ country: 'XX', acceptLanguage: 'es-ES' }), 'en');
  assert.deepEqual(browserLangs('en;q=0.5, de-AT, fr;q=0'), ['de', 'en']);
});

test('textes des auteurs : langue de la page, sinon repli (allemand → français → anglais ; anglais → français ; français → anglais)', () => {
  const row = { title: 'Brume', title_en: 'Mist', title_de: '' };
  assert.equal(pick(row, 'title', 'de'), 'Brume');
  assert.equal(pick(row, 'title', 'en'), 'Mist');
  const enOnly = { legend: '', legend_en: 'Only English', legend_de: '' };
  for (const l of ['fr', 'en', 'de']) assert.equal(pick(enOnly, 'legend', l), 'Only English');
  assert.equal(pick({ legend: '', legend_de: 'Nur Deutsch' }, 'legend', 'en'), 'Nur Deutsch');
  assert.deepEqual(splitLang('/en/photo/a?serie=rue'), { lang: 'en', path: '/photo/a?serie=rue' });
  assert.deepEqual(splitLang('/de'), { lang: 'de', path: '/' });
  assert.deepEqual(splitLang('/entree'), { lang: 'fr', path: '/entree' });
  assert.equal(localize('/', 'de'), '/de/');
});

test('pages en anglais et en allemand : langue déclarée, menu et textes traduits, liens dans la même langue, hreflang', async t => {
  const { app } = await setup(t, { seeded: true });
  const en = await app.inject('/en/');
  assert.equal(en.statusCode, 200);
  assert.match(en.body, /<html lang="en"/);
  assert.match(en.body, />Gallery<\/a>/);
  assert.match(en.body, />All series</);
  assert.match(en.body, />Most recent</);
  assert.match(en.body, /<a class="tile" href="\/en\/photo\//);
  assert.match(en.body, /<link rel="canonical" href="http:\/\/localhost:3000\/en\/">/);
  assert.match(en.body, /<link rel="alternate" hreflang="de" href="http:\/\/localhost:3000\/de\/">/);
  assert.match(en.body, /<link rel="alternate" hreflang="x-default" href="http:\/\/localhost:3000\/">/);
  assert.match(en.body, /<meta property="og:locale" content="en_GB">/);
  // Nom lu : le code visible, puis son nom (pas d'aria-label, qui masquerait « EN » : WCAG 2.5.3).
  assert.match(en.body, /<summary><img class="flag" src="\/static\/flags\/en\.svg\?v=[0-9a-f]{10}" alt="" width="20" height="14"><span>EN<\/span><span class="sr-only"> – Language: English<\/span><\/summary>/);
  const photo = (await app.inject('/de/photo/brume-sur-la-loire?serie=paysage')).body;
  assert.match(photo, /<html lang="de"/);
  assert.match(photo, />Schließen<\/a>/);
  assert.match(photo, /März 2024/);                                                    // date du mois en allemand
  assert.match(photo, /data-back="\/de\/serie\/paysage#galerie"/);
  assert.match(photo, /data-more="Weiterlesen"/);
  // Sélecteur : la page courante dans chaque langue, filtres compris.
  assert.match(photo, /href="\/langue\/en\?vers=%2Fphoto%2Fbrume-sur-la-loire%3Fserie%3Dpaysage" hreflang="en"/);
  const nf = await app.inject('/en/nope');
  assert.equal(nf.statusCode, 404);
  assert.match(nf.body, /This page does not exist/);
  assert.match((await app.inject('/de/a-propos')).body, /<a href="\/de\/a-propos" aria-current="page">Über uns<\/a>/);
});

test('arrivée sur une page française : choix mémorisé, sinon pays puis navigateur ; jamais pour les robots ni sur /en, /de', async t => {
  const { app } = await setup(t, { seeded: true, env: { TRUST_PROXY: '127.0.0.1' } });
  const get = (url, headers = {}, cookies = {}) => app.inject({ url, headers: { 'user-agent': BROWSER, ...headers }, cookies });
  let r = await get('/photo/quai-7h12?serie=rue', { 'accept-language': 'en-US', 'cf-ipcountry': 'DE' });
  assert.deepEqual([r.statusCode, r.headers.location], [302, '/de/photo/quai-7h12?serie=rue']);
  r = await get('/', { 'accept-language': 'fr-FR', 'cf-ipcountry': 'US' });
  assert.deepEqual([r.statusCode, r.headers.location], [302, '/en/']);
  assert.equal((await get('/', { 'accept-language': 'en-US', 'cf-ipcountry': 'FR' })).statusCode, 200);
  assert.equal((await get('/', { 'accept-language': 'de', 'cf-ipcountry': 'DE' }, { langue: 'fr' })).statusCode, 200);   // choix gardé
  r = await get('/a-propos', { 'accept-language': 'fr', 'cf-ipcountry': 'FR' }, { langue: 'en' });
  assert.deepEqual([r.statusCode, r.headers.location], [302, '/en/a-propos']);
  assert.equal((await get('/', { 'accept-language': 'de', 'cf-ipcountry': 'DE', 'user-agent': 'Googlebot/2.1' })).statusCode, 200);
  assert.equal((await get('/', { 'cf-ipcountry': 'DE' })).statusCode, 200);            // sans langue de navigateur : pas un navigateur
  assert.equal((await get('/en/', { 'accept-language': 'de', 'cf-ipcountry': 'DE' })).statusCode, 200);
  assert.match((await get('/', { 'accept-language': 'de', 'cf-ipcountry': 'DE' })).headers.vary, /Accept-Language/);
});

test('sélecteur de langue : retient le choix (cookie) et ouvre la même page dans la langue choisie', async t => {
  const { app } = await setup(t, { seeded: true });
  const r = await app.inject('/langue/de?vers=%2Fen%2Fphoto%2Fquai-7h12%3Fserie%3Drue');
  assert.deepEqual([r.statusCode, r.headers.location], [303, '/de/photo/quai-7h12?serie=rue']);
  const cookie = r.cookies.find(c => c.name === 'langue');
  assert.equal(cookie.value, 'de');
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'Lax');
  assert.equal((await app.inject('/langue/fr?vers=%2F%2Fexemple.org')).headers.location, '/');   // jamais ailleurs
  assert.equal((await app.inject('/langue/es?vers=%2F')).statusCode, 404);
  assert.match((await app.inject('/droits')).body, /Un cookie du site retient la langue/);
});

test('admin : traductions des photos, séries, biographies et textes du site ; vides, repli sur le français', async t => {
  const ctx = await admin(t);
  const pid = ctx.id('photos', 'brume-sur-la-loire');
  const p = ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(pid);
  const fiche = (await ctx.as({ url: `/admin/photos/${pid}` })).body;
  assert.match(fiche, /name="title_en"/);
  assert.match(fiche, /name="legend_de"/);
  const res = await ctx.post(`/admin/photos/${pid}`, {
    title: p.title, slug: p.slug, category_id: p.category_id, author_id: p.author_id, place: p.place, taken_on: p.taken_on, legend: p.legend, status: 'published',
    title_en: 'Mist on the Loire', title_de: '', legend_en: 'Six in the morning.', legend_de: 'Sechs Uhr morgens.', place_en: '', place_de: 'Anjou (Frankreich)',
  });
  assert.equal(res.statusCode, 303);
  const en = (await ctx.app.inject('/en/photo/brume-sur-la-loire')).body;
  assert.match(en, /<h1>Mist on the Loire<\/h1>/);
  assert.match(en, /Six in the morning\./);
  const de = (await ctx.app.inject('/de/photo/brume-sur-la-loire')).body;
  assert.match(de, /<h1>Brume sur la Loire<\/h1>/);                                     // pas de titre allemand : français
  assert.match(de, /Sechs Uhr morgens\./);
  assert.match(de, /Anjou \(Frankreich\)/);
  // Un autre champ modifié depuis la photothèque ne perd pas les traductions.
  await ctx.as({ method: 'POST', url: `/admin/photos/${pid}/champs`, payload: { title: 'Brume sur la Loire, 6h' }, headers: { 'x-csrf-token': ctx.db.prepare('SELECT csrf FROM sessions').pluck().get(), accept: 'application/json' } });
  assert.equal(ctx.db.prepare('SELECT title_en FROM photos WHERE id = ?').pluck().get(pid), 'Mist on the Loire');
  // Série, biographie, accroche.
  const rue = ctx.id('categories', 'rue');
  await ctx.post(`/admin/series/${rue}`, { name: 'Rue', slug: 'rue', name_en: 'Street', name_de: 'Straße' });
  assert.match((await ctx.app.inject('/de/')).body, /Straße/);
  const julien = ctx.id('authors', 'julien');
  await ctx.post(`/admin/auteurs/${julien}`, { name: 'Julien', slug: 'julien', bio: 'Photographe de rue.', bio_de: 'Straßenfotograf.' });
  assert.match((await ctx.app.inject('/de/a-propos')).body, /Straßenfotograf\./);
  assert.match((await ctx.app.inject('/en/a-propos')).body, /Photographe de rue\./);       // pas d'anglais : français
  await ctx.post('/admin/reglages', { tagline: 'Deux regards', tagline_en: 'Two views', intro: 'Intro', about: 'À propos.' });
  assert.match((await ctx.app.inject('/en/')).body, /<h2>Two views<\/h2>/);
  assert.match((await ctx.app.inject('/de/')).body, /<h2>Deux regards<\/h2>/);
  assert.match((await ctx.as({ url: '/admin/site' })).body, /name="tagline_en" value="Two views"/);
});
