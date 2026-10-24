// Contrôles ponctuels du diagnostic cookies, sur les seules bases jetables des helpers existants.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup } from '../../../test/helpers.js';
import { loadConfig } from '../../../server/config.js';
import { chromium } from '/home/claudecode/deux-regards/e2e/node_modules/playwright/index.mjs';

const cleanups = [], cases = [], events = [];
const t = { after: fn => cleanups.push(fn) };
const check = (nom, observation) => cases.push({ nom, observation });
const metadata = c => ({ nom: c.name.replace(/oidc-.+$/, 'oidc-<state>'), chemin: c.path, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite, maxAge: c.maxAge ?? null });
const cookieMap = r => Object.fromEntries(r.cookies.filter(c => c.value).map(c => [c.name, c.value]));
const csrfOf = body => /data-csrf="([^"]+)"/.exec(body)?.[1] || /name="_csrf" value="([^"]+)"/.exec(body)?.[1];
let browser;
try {
  const config = loadConfig({ NODE_ENV: 'production', PUBLIC_URL: 'http://photos.example', COOKIE_SECRET: 'x'.repeat(32), TSA_URL: 'off' });
  assert.equal(config.secureCookies, false);
  check('Configuration production en HTTP', 'Acceptée ; secureCookies=false. Risque conditionnel confirmé, aucune configuration réelle lue.');

  let finishCalls = 0;
  const oidc = { configured: true, origin: 'https://idp.example',
    start: async () => ({ url: 'https://idp.example/authorize', tx: { state: crypto.randomBytes(32).toString('base64url'), verifier: 'test', nonce: 'test' } }),
    finish: async () => { finishCalls++; return { claims: { sub: 'audit', name: 'Compte fictif' }, roles: ['admin'], admin: true, listed: true }; },
    logoutUrl: async () => null };
  const secure = await setup(t, { env: { PUBLIC_URL: 'https://photos.example', COOKIE_SECRET: 'x'.repeat(32), INSTAGRAM_APP_ID: 'test', INSTAGRAM_APP_SECRET: 'test' }, oidc });
  const start = await secure.app.inject('/auth/login');
  assert.ok(start.cookies[0].secure && start.cookies[0].httpOnly);
  assert.equal(start.cookies[0].maxAge, 600);
  check('Cookie OIDC HTTPS', metadata(start.cookies[0]));
  const cookies = cookieMap(start), state = Object.keys(cookies)[0].replace('__Host-oidc-', '');
  const realNow = Date.now, afterTTL = realNow() + 11 * 60e3;
  let callback;
  try {
    Date.now = () => afterTTL;
    callback = await secure.app.inject({ url: `/auth/callback?state=${state}&code=factice`, cookies });
  } finally { Date.now = realNow; }
  assert.equal(finishCalls, 1);
  assert.equal(callback.statusCode, 302);
  check('Transaction OIDC copiée après 11 minutes', 'Client OIDC factice appelé ; aucune expiration locale avant échange. Ne démontre pas une acceptation par Zitadel.');
  const session = cookieMap(callback);
  const ig = await secure.app.inject({ url: '/admin/instagram/connexion', cookies: session });
  assert.ok(ig.cookies.some(c => c.name === 'ig_state' && c.secure));
  check('Transaction Instagram HTTPS', metadata(ig.cookies.find(c => c.name === 'ig_state')));
  const unsignedIG = secure.app.unsignCookie(ig.cookies.find(c => c.name === 'ig_state').value).value;
  const denial = await secure.app.inject({ url: `/admin/instagram/callback?state=${unsignedIG}&error_description=DonneeFictive`, cookies: { ...session, ...cookieMap(ig) } });
  const flash = denial.cookies.find(c => c.name === 'flash');
  assert.ok(secure.app.unsignCookie(flash.value).value.includes('DonneeFictive'));
  check('Message flash signé', 'La valeur applicative est lisible après vérification de signature : intégrité, sans chiffrement. Exemple uniquement fictif.');
  secure.db.prepare('UPDATE sessions SET created_at = ?, expires_at = ?').run(realNow() - 48 * 3600e3, realNow() - 24 * 3600e3);
  await secure.app.inject('/');
  assert.equal(secure.db.prepare('SELECT count(*) FROM sessions').pluck().get(), 1);
  check('Conservation de session admin expirée', 'La ligne expirée reste en base après navigation anonyme ; le magasin ne fournit pas de purge périodique.');

  const local = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: 'audit-local-factice-0123456789' } });
  await local.app.listen({ port: 0, host: '127.0.0.1' });
  const origin = `http://127.0.0.1:${local.app.server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'fr-FR' });
  const page = await context.newPage();
  page.on('pageerror', e => events.push({ type: 'pageerror', texte: e.message.slice(0, 250) }));
  page.on('console', m => { if (m.type() === 'error') events.push({ type: 'console', attendu: m.text().includes('503'), texte: m.text().replace(/http:\/\/127\.0\.0\.1:\d+/g, '[origine locale]').slice(0, 250) }); });
  const foreign = new Set();
  page.on('request', r => { if (new URL(r.url()).origin !== origin) foreign.add(new URL(r.url()).origin); });
  await page.goto(origin + '/');
  assert.equal((await context.cookies()).length, 0);
  assert.equal(foreign.size, 0);
  await page.screenshot({ path: new URL('visite-anonyme.png', import.meta.url).pathname });
  check('Navigateur neuf : accueil', { cookies: 0, originesExternes: [...foreign], langue: await page.locator('html').getAttribute('lang') });
  await page.goto(origin + '/langue/de?vers=/');
  assert.equal(await page.locator('html').getAttribute('lang'), 'de');
  const language = (await context.cookies()).find(c => c.name === 'langue');
  assert.ok(language.httpOnly && language.sameSite === 'Lax');
  assert.equal(await page.evaluate(() => document.cookie), '');
  check('Navigateur : sélection langue', { nom: language.name, httpOnly: language.httpOnly, sameSite: language.sameSite, langueVisible: 'de', inaccessibleDepuisDocumentCookie: true });
  await page.goto(origin + '/photo/deux-minuit');
  const like = page.locator('[data-like] button');
  await like.click();
  await page.waitForFunction(() => localStorage.getItem('aime:deux-minuit') === '1');
  await page.reload();
  assert.equal(await page.locator('[data-like] button').getAttribute('aria-pressed'), 'true');
  assert.equal((await context.cookies()).length, 1);
  check('Navigateur : J’aime et rechargement', 'État visible conservé par localStorage aime:deux-minuit ; aucun cookie supplémentaire.');
  const login = await context.request.post(origin + '/auth/local', { form: { token: 'audit-local-factice-0123456789', author: 'julien', next: '/admin' }, maxRedirects: 0 });
  assert.equal(login.status(), 303);
  await page.goto(origin + '/admin');
  const csrf = await page.locator('body').getAttribute('data-csrf') || csrfOf(await page.content());
  assert.ok(csrf);
  const theme = await context.request.post(origin + '/admin/theme', { form: { theme: 'dark', _csrf: csrf } });
  assert.equal(theme.status(), 200);
  const authorId = local.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const postId = local.app.carnet.create({ title: 'Diagnostic fictif', rubrique: 'voyages', authors: [authorId], by: { sub: 'local:julien', name: 'Test' } });
  await page.route(`**/admin/carnet/${postId}/brouillon`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"panne simulée"}' }));
  await page.goto(origin + `/admin/carnet/${postId}`);
  await page.locator('#texte').fill('Brouillon fictif du diagnostic cookies.');
  const draftKey = `carnet-${postId}-fr`;
  await page.waitForFunction(key => localStorage.getItem(key) !== null, draftKey);
  check('Navigateur : secours du brouillon Carnets', 'Échec 503 simulé de l’enregistrement ; copie locale créée par le vrai script Carnets.');
  const logout = await context.request.post(origin + '/auth/logout', { form: { _csrf: csrf }, maxRedirects: 0 });
  assert.equal(logout.status(), 303);
  const remaining = (await context.cookies()).map(c => c.name);
  assert.ok(!remaining.includes('session') && remaining.includes('admin_theme'));
  assert.equal(await page.evaluate(key => !!localStorage.getItem(key), draftKey), true);
  check('Navigateur : déconnexion', { sessionSupprimee: true, cookiesRestants: remaining, brouillonLocalConserve: true });
  local.app.accounts.ensure({ sub: 'local:sebastien', name: 'Test', roles: ['admin'] });
  const second = await context.request.post(origin + '/auth/local', { form: { token: 'audit-local-factice-0123456789', author: 'sebastien', next: '/admin' }, maxRedirects: 0 });
  assert.equal(second.status(), 303);
  const prompt = page.waitForEvent('dialog');
  const navigation = page.goto(origin + `/admin/carnet/${postId}`);
  const dialog = await prompt;
  assert.equal(dialog.type(), 'confirm');
  await dialog.dismiss();
  await navigation;
  check('Navigateur partagé : second compte autorisé', 'Le vrai éditeur propose au second compte de reprendre la copie locale du premier. Aucun accès serveur sans droit démontré.');
  await context.close();
  const noJS = await browser.newContext({ javaScriptEnabled: false, locale: 'fr-FR' });
  const p2 = await noJS.newPage();
  await p2.goto(origin + '/langue/en?vers=/');
  assert.equal(await p2.locator('html').getAttribute('lang'), 'en');
  assert.equal((await noJS.cookies()).find(c => c.name === 'langue').value, 'en');
  check('Navigateur sans JavaScript : langue', 'Page anglaise et cookie langue=en : parcours fonctionnel sans script.');
  await noJS.close();
} finally {
  if (browser) await browser.close();
  for (const fn of cleanups.reverse()) await fn();
  fs.writeFileSync(new URL('controles.json', import.meta.url), JSON.stringify({ date: new Date().toISOString(), commit: 'f44cdf31f8c8c8893071e9350962cdf1370202ee', cas: cases, erreursNavigateur: events }, null, 2) + '\n');
}
console.log(`${cases.length} contrôles terminés ; ${events.length} erreur(s) navigateur ; aucun jeton enregistré.`);
