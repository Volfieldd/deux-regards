import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setup } from './helpers.js';
import { loadConfig } from '../server/config.js';

// Propositions de traduction dans l'admin : un serveur LibreTranslate du réseau local (TRANSLATE_URL), remplacé ici
// par un faux serveur qui note les demandes. Sans TRANSLATE_URL, pas de bouton.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function fakeLibreTranslate(t, handler) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = JSON.parse(body || '{}');
      calls.push({ url: req.url, ...json });
      const [status, out] = handler(json);
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, calls };
}

async function admin(t, env = {}) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, ...env } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = opts => ctx.app.inject({ ...opts, cookies: { ...cookies, ...opts.cookies } });
  const translate = payload => as({ method: 'POST', url: '/admin/traduction', payload, headers: { 'x-csrf-token': csrf, accept: 'application/json' } });
  const id = slug => ctx.db.prepare('SELECT id FROM photos WHERE slug = ?').pluck().get(slug);
  return { ...ctx, as, translate, id };
}

test('sans TRANSLATE_URL : pas de bouton, demande refusée avec explication ; adresse invalide refusée au démarrage', async t => {
  const ctx = await admin(t);
  const fiche = (await ctx.as({ url: `/admin/photos/${ctx.id('brume-sur-la-loire')}` })).body;
  assert.match(fiche, /name="title_en"/);
  assert.doesNotMatch(fiche, /data-translate=/);
  const r = await ctx.translate({ text: 'Brume', source: 'fr', target: 'en' });
  assert.equal(r.statusCode, 422);
  assert.match(r.json().error, /TRANSLATE_URL/);
  assert.throws(() => loadConfig({ TRANSLATE_URL: 'libretranslate:5000' }), /TRANSLATE_URL/);
});

test('proposition de traduction : texte envoyé au serveur local, réponse rendue telle quelle ; erreurs expliquées', async t => {
  const lt = await fakeLibreTranslate(t, q => (q.q === 'casse' ? [400, { error: 'Invalid request' }] : [200, { translatedText: `[${q.target}] ${q.q}` }]));
  const ctx = await admin(t, { TRANSLATE_URL: `${lt.url}/`, TRANSLATE_API_KEY: 'cle-locale' });
  // Un bouton sous chaque champ anglais et allemand (fiche, séries, auteurs, réglages).
  const fiche = (await ctx.as({ url: `/admin/photos/${ctx.id('brume-sur-la-loire')}` })).body;
  for (const f of ['title', 'place', 'legend']) for (const l of ['en', 'de']) assert.match(fiche, new RegExp(`data-translate="${f}" data-to="${l}"`));
  assert.match((await ctx.as({ url: '/admin/series' })).body, /data-translate="name" data-to="de"/);
  assert.match((await ctx.as({ url: '/admin/auteurs' })).body, /data-translate="bio" data-to="en"/);
  assert.match((await ctx.as({ url: '/admin/reglages' })).body, /data-translate="about" data-to="de"/);

  const ok = await ctx.translate({ text: 'Six heures, le fleuve fume encore.', source: 'fr', target: 'de' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().text, '[de] Six heures, le fleuve fume encore.');
  assert.deepEqual(lt.calls[0], { url: '/translate', q: 'Six heures, le fleuve fume encore.', source: 'fr', target: 'de', format: 'text', api_key: 'cle-locale' });
  // Rien à traduire, langues inconnues, refus du serveur : message clair, rien n'est enregistré.
  assert.match((await ctx.translate({ text: '  ', source: 'fr', target: 'en' })).json().error, /Rien à traduire/);
  assert.equal((await ctx.translate({ text: 'x', source: 'fr', target: 'fr' })).statusCode, 422);
  assert.equal((await ctx.translate({ text: 'x', source: 'fr', target: 'es' })).statusCode, 422);
  assert.match((await ctx.translate({ text: 'casse', source: 'fr', target: 'en' })).json().error, /refusé la demande : Invalid request/);
  assert.equal(lt.calls.length, 2);                                                    // les demandes invalides ne partent pas
  // Réservé aux auteurs connectés, avec le jeton CSRF.
  assert.notEqual((await ctx.app.inject({ method: 'POST', url: '/admin/traduction', payload: { text: 'x', source: 'fr', target: 'en' } })).statusCode, 200);
  assert.equal((await ctx.as({ method: 'POST', url: '/admin/traduction', payload: { text: 'x', source: 'fr', target: 'en' }, headers: { accept: 'application/json' } })).statusCode, 403);
});

test('serveur de traduction arrêté : message pour vérifier le conteneur', async t => {
  const ctx = await admin(t, { TRANSLATE_URL: 'http://127.0.0.1:9' });
  const r = await ctx.translate({ text: 'Brume', source: 'fr', target: 'en' });
  assert.equal(r.statusCode, 422);
  assert.match(r.json().error, /Traducteur injoignable : vérifiez que le conteneur LibreTranslate tourne/);
});
