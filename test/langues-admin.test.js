import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setup } from './helpers.js';
import { dictionary, translator } from '../server/admin-i18n.js';

// Admin en trois langues : préférence gardée sur le photographe (cookie pour un compte sans photographe), tout texte
// passé à t('…') traduit en anglais et en allemand.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

// Clés littérales t('…') des vues de l'admin (v1 et v2) et du code serveur ; tk('…') : textes du script de la v2
// (views/admin/v2/_textes.eta) ; TL[l]('…') : textes de l'app de terrain v2 dans la langue de la personne.
function keys() {
  const files = [
    ...fs.readdirSync(new URL('../views/admin/', import.meta.url)).filter(f => f.endsWith('.eta')).map(f => new URL(`../views/admin/${f}`, import.meta.url)),
    ...fs.readdirSync(new URL('../views/admin/v2/', import.meta.url)).filter(f => f.endsWith('.eta')).map(f => new URL(`../views/admin/v2/${f}`, import.meta.url)),
    ...fs.readdirSync(new URL('../server/', import.meta.url)).filter(f => f.endsWith('.js') && f !== 'admin-i18n.js').map(f => new URL(`../server/${f}`, import.meta.url)),
    ...fs.readdirSync(new URL('../server/routes/', import.meta.url)).map(f => new URL(`../server/routes/${f}`, import.meta.url)),
  ];
  const found = new Map();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:\btk?|\bTL\[l\])\(\s*'((?:[^'\\]|\\.)+)'/g)) found.set(m[1].replace(/\\'/g, "'"), f.pathname.split('/').slice(-2).join('/'));
  }
  return found;
}

test('chaque texte traduisible de l’admin a sa version anglaise et allemande', () => {
  const d = dictionary();
  const missing = [];
  for (const [k, file] of keys()) for (const l of ['en', 'de']) if (!d[k]?.[l]) missing.push(`${file} [${l}] ${k}`);
  assert.deepEqual(missing, []);
  const t = translator('de');
  assert.equal(t('Photothèque'), 'Fotothek');
  assert.equal(t('Traitement : {n} photos', { n: 3 }), 'Verarbeitung: 3 Fotos');
  assert.equal(translator('fr')('Photothèque'), 'Photothèque');
  assert.equal(translator('xx')('Photothèque'), 'Photothèque');                       // langue inconnue : français
});

test('sélecteur de langue : préférence gardée sur le photographe, pages et messages dans sa langue', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const fr = (await ctx.app.inject({ url: '/admin', cookies })).body;
  assert.match(fr, /<html lang="fr"/);
  assert.match(fr, /class="lang-pick admin-lang"[\s\S]*name="lang" value="de" lang="de"[^>]*>[\s\S]*Deutsch/);
  const r = await ctx.app.inject({ method: 'POST', url: '/admin/langue', cookies, payload: { _csrf: csrf, lang: 'de', back: '/admin/photos' } });
  assert.deepEqual([r.statusCode, r.headers.location], [303, '/admin/photos']);
  assert.equal(ctx.db.prepare("SELECT admin_lang FROM authors WHERE slug = 'julien'").pluck().get(), 'de');
  const de = (await ctx.app.inject({ url: '/admin', cookies })).body;
  assert.match(de, /<html lang="de"/);
  assert.match(de, />Fotothek</);
  assert.match(de, /Verwaltung/);
  // Le site public, lui, garde sa propre langue.
  assert.match((await ctx.app.inject('/')).body, /<html lang="fr"/);
  // CSRF exigé.
  assert.equal((await ctx.app.inject({ method: 'POST', url: '/admin/langue', cookies, payload: { lang: 'en' } })).statusCode, 403);
});

test('messages d’erreur dans la langue de l’admin : validations, refus, messages composés ; l’identifiant du compte', async t => {
  const en = translator('en'), de = translator('de');
  // Message levé par un module, ou composé avec des variables (erreurs Instagram, e-mail, preuves) : reconnu.
  assert.equal(en.msg('Adresse e-mail invalide.'), 'Invalid email address.');
  assert.equal(en.msg('E-mail non envoyé : serveur de messagerie injoignable.'), 'Email not sent: mail server unreachable.');
  assert.equal(de.msg('En attente : trop d’appels à l’API Instagram. File en pause jusqu’à 14 h 30.'), 'Wartend: zu viele Aufrufe der Instagram-API. Warteschlange pausiert bis 14 h 30.');
  assert.equal(en.msg('la TSA a répondu 503'), 'the TSA answered 503');
  assert.equal(en.msg('Texte libre de l’utilisateur'), 'Texte libre de l’utilisateur');            // inconnu : tel quel
  assert.equal(translator('fr').msg('Adresse e-mail invalide.'), 'Adresse e-mail invalide.');
  // En situation : un compte en anglais.
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  await ctx.app.inject({ method: 'POST', url: '/admin/langue', cookies, payload: { _csrf: csrf, lang: 'en', back: '/admin' } });
  const images = (await ctx.app.inject({ url: '/admin/images', cookies })).body;
  assert.match(images, />All sizes</);
  assert.doesNotMatch(images, /Toutes les tailles/);
  const accounts = (await ctx.app.inject({ url: '/admin/comptes', cookies })).body;
  const sub = ctx.db.prepare('SELECT sub FROM accounts LIMIT 1').pluck().get();
  assert.match(accounts, new RegExp(`Identifier \\(sub\\) : <code class="sub-nolang">${sub}</code>`));
  // Refus de droit, en anglais.
  const { createSessionStore } = await import('../server/sessions.js');
  ctx.app.accounts.ensure({ sub: 'rita', name: 'rita', roles: ['relecteur'] });
  const token = createSessionStore(ctx.db).create({ sub: 'rita', name: 'rita', roles: [] });
  ctx.db.prepare("UPDATE authors SET admin_lang = 'en'").run();
  const r = await ctx.app.inject({ url: '/admin/comptes', cookies: { session: token, admin_langue: 'en' }, headers: { accept: 'text/html' } });
  assert.equal(r.statusCode, 403);
  assert.match(r.body, /Access denied/);
  assert.doesNotMatch(r.body, /Accès refusé/);
});
