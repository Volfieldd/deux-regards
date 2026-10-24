// Contrôle ponctuel sur données fictives : réutilise le serveur jetable du dépôt et Playwright existant.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setup } from '../../../test/helpers.js';
import { chromium } from '/home/claudecode/deux-regards/e2e/node_modules/playwright/index.mjs';

const cleanups = [], cases = [], errors = [];
const t = { after: fn => cleanups.push(fn) };
const token = 'controle-cnil-local-factice-0123456789';
const evidence = new URL('.', import.meta.url);
let browser;
try {
  const { app } = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: token } });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const publicContext = await browser.newContext({ locale: 'fr-FR' });
  const page = await publicContext.newPage();
  const foreign = new Set();
  page.on('pageerror', () => errors.push('public : erreur de script'));
  page.on('request', r => { if (new URL(r.url()).origin !== origin) foreign.add(new URL(r.url()).origin); });
  await page.goto(origin + '/');
  assert.equal((await publicContext.cookies()).length, 0);
  assert.equal(foreign.size, 0);
  cases.push({ cas: 'Accueil neuf', obtenu: 'Aucun cookie applicatif ni requête extérieure' });
  await page.goto(origin + '/langue/de?vers=/');
  assert.equal(await page.locator('html').getAttribute('lang'), 'de');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('lang'), 'de');
  cases.push({ cas: 'Langue', obtenu: 'Choix allemand conservé après rechargement' });
  await page.goto(origin + '/photo/deux-minuit');
  await page.locator('[data-like] button').click();
  await page.waitForFunction(() => localStorage.getItem('aime:deux-minuit') === '1');
  await page.reload();
  assert.equal(await page.locator('[data-like] button').getAttribute('aria-pressed'), 'true');
  cases.push({ cas: 'J’aime', obtenu: 'État visible conservé après rechargement ; durée et qualification encore ouvertes' });
  await publicContext.close();

  for (const version of ['v1', 'v2']) for (const denied of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fr-FR' });
    if (denied) await context.addInitScript(() => {
      for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, {
        configurable: true, get() { throw new DOMException('Stockage refusé pour le contrôle', 'SecurityError'); },
      });
    });
    const admin = await context.newPage();
    admin.on('pageerror', () => errors.push(`${version}/${denied} : erreur de script`));
    admin.on('console', m => { if (m.type() === 'error') errors.push(`${version}/${denied} : erreur console`); });
    const login = await context.request.post(origin + '/auth/local', {
      form: { token, author: 'julien', next: '/admin/photos' }, maxRedirects: 0,
    });
    assert.equal(login.status(), 303);
    await admin.goto(origin + '/admin/photos');
    const csrf = await admin.locator('body').getAttribute('data-csrf');
    assert.ok(csrf);
    const choice = await context.request.post(origin + '/admin/version', {
      form: { version, _csrf: csrf, back: '/admin/photos' }, headers: { accept: 'text/html' }, maxRedirects: 0,
    });
    assert.equal(choice.status(), 303);
    await admin.goto(origin + '/admin/photos');
    const density = admin.locator('[data-density]');
    await density.waitFor({ state: 'visible' });
    await density.focus();
    await density.press('End');
    assert.equal(await admin.locator('[data-contact]').evaluate(el => el.style.getPropertyValue('--rowh')), '320px');
    if (!denied) {
      assert.equal(await admin.evaluate(() => localStorage.getItem('planche-taille')), '320');
      await admin.reload();
      assert.equal(await density.inputValue(), '320');
    } else {
      await admin.reload();
      await density.waitFor({ state: 'visible' });
      assert.equal(await density.inputValue(), '190');
      if (version === 'v2') await admin.locator('[data-contact]').screenshot({ path: new URL('densite-stockage-refuse.png', evidence).pathname });
    }
    cases.push({ cas: `Admin ${version}, stockage ${denied ? 'refusé' : 'autorisé'}`, obtenu: denied
      ? 'Curseur utilisable ; taille par défaut retrouvée au rechargement'
      : 'Taille appliquée et mémorisée après rechargement' });
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  if (browser) await browser.close();
  for (const cleanup of cleanups.reverse()) await cleanup();
  fs.writeFileSync(new URL('controle-navigateur.json', evidence), JSON.stringify({
    version: '1.226.0', revision: '994a899c8fe1ac663f90671894e5d843d847eb48',
    perimetre: 'Chromium, serveur jetable, données fictives, aucun accès prestataire réel',
    cas: cases, erreurs: errors,
  }, null, 2) + '\n');
}
