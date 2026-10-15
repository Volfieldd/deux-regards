import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { createSearch } from '../server/search.js';
import { search as cities } from '../server/geo/cities.js';

// Recherche par mots-clés sur le site : titre, légende, lieu, mots-clés, ville (et région), série, photographe, dans
// les trois langues ; mots-clés de la fiche, affichés ou non sur la page de la photo.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
const idOf = (db, title) => db.prepare('SELECT id FROM photos WHERE title = ?').pluck().get(title);

test('moteur : début de mot, sans accents, tous les mots, toutes les langues, brouillons exclus, titre d’abord', async t => {
  const { db } = await setup(t, { seeded: true });
  const s = createSearch({ db });
  const brume = idOf(db, 'Brume sur la Loire');
  assert.equal(s.find('brum')[0], brume);                                               // début de mot
  assert.deepEqual(s.find('BRUME loire'), [brume]);                                     // majuscules, plusieurs mots
  assert.deepEqual(s.find('brume nantes'), []);                                          // tous les mots
  assert.ok(s.find('derniere').includes(idOf(db, 'Dernière heure')));                    // sans accents
  assert.ok(s.find('sebastien').includes(brume));                                        // photographe
  assert.ok(s.find('paysage').includes(brume));                                          // série
  assert.ok(s.find('fleuve').includes(brume));                                           // légende
  assert.deepEqual(s.find('a'), []);                                                     // trop court
  // Mots-clés et traductions ; la ville, dans toutes les langues, avec sa région.
  const quai = idOf(db, 'Quai, 7h12');
  const munich = cities('München', 1, 'de')[0];
  db.prepare("UPDATE photos SET keywords = 'tramway, matin', title_de = 'Kai um sieben', city_id = ?, city_name = 'Munich', city_cc = 'DE' WHERE id = ?").run(munich.id, quai);
  assert.deepEqual(s.find('tramway'), [quai]);
  assert.deepEqual(s.find('kai'), [quai]);
  assert.deepEqual(s.find('München'), [quai]);
  assert.deepEqual(s.find('munich'), [quai]);
  assert.deepEqual(s.find('bavière'), [quai]);
  // Le titre pèse plus que la légende.
  db.prepare("UPDATE photos SET legend = 'Un quai au matin' WHERE id = ?").run(brume);
  assert.equal(s.find('quai')[0], quai);
  // Brouillon : jamais.
  db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(quai);
  assert.deepEqual(s.find('tramway'), []);
});

test('page publique : formulaire, résultats, trois langues, pas indexée ; lien du menu ; désactivable', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const home = (await app.inject('/')).body;
  assert.match(home, /<a class="nav-search" href="\/recherche"/);
  const empty = await app.inject('/recherche');
  assert.equal(empty.statusCode, 200);
  assert.match(empty.body, /role="search"[\s\S]*name="q"/);
  assert.equal(empty.headers['x-robots-tag'], undefined);
  const r = await app.inject('/recherche?q=brume');
  assert.match(r.body, /1 photo pour « brume »/);
  assert.match(r.body, /href="\/photo\/brume-sur-la-loire"/);
  assert.equal(r.headers['x-robots-tag'], 'noindex');
  assert.match((await app.inject('/recherche?q=zzzz')).body, /Aucune photo pour « zzzz »/);
  const en = await app.inject('/en/recherche?q=brume');
  assert.match(en.body, /1 photo for “brume”/);
  assert.match(en.body, /href="\/en\/photo\/brume-sur-la-loire"/);
  assert.match((await app.inject('/de/recherche?q=xyz')).body, /Kein Foto für „xyz“/);
  assert.match((await app.inject('/recherche?q=%3Cscript%3E')).body, /« &lt;script&gt; »/);   // échappé
  // Désactivée : ni lien ni page pour les visiteurs.
  db.prepare("INSERT INTO settings (key, value) VALUES ('search_page', 'false') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  assert.doesNotMatch((await app.inject('/')).body, /nav-search/);
  assert.equal((await app.inject('/recherche?q=brume')).statusCode, 404);
});

test('mots-clés de la fiche : enregistrés proprement, affichés sur la page de la photo si le réglage le demande', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const brume = idOf(ctx.db, 'Brume sur la Loire');
  await ctx.app.inject({ method: 'POST', url: `/admin/photos/${brume}/champs`, cookies, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload: { keywords: ' brouillard ; Loire,loire ,  #aube\nfleuve ' } });
  assert.equal(ctx.db.prepare('SELECT keywords FROM photos WHERE id = ?').pluck().get(brume), 'brouillard, Loire, aube, fleuve');
  assert.match((await ctx.app.inject({ url: `/admin/photos/${brume}`, cookies })).body, /name="keywords" value="brouillard, Loire, aube, fleuve"/);
  // Cachés par défaut ; affichés, chacun mène à la recherche.
  assert.doesNotMatch((await ctx.app.inject('/photo/brume-sur-la-loire')).body, /class="kw/);
  ctx.db.prepare("INSERT INTO settings (key, value) VALUES ('keywords_shown', 'true') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  const page = (await ctx.app.inject('/photo/brume-sur-la-loire')).body;
  assert.match(page, /<ul class="kw mono" aria-label="Mots-clés"><li><a href="\/recherche\?q=brouillard" rel="nofollow">brouillard<\/a><\/li>/);
  assert.match((await ctx.app.inject('/recherche?q=brouillard')).body, /1 photo pour « brouillard »/);
  // Réglages : Site public.
  const settings = (await ctx.app.inject({ url: '/admin/site', cookies })).body;
  assert.match(settings, /name="search_page" checked[\s\S]*name="keywords_shown" checked/);
});
