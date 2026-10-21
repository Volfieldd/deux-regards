import { test, expect } from '@playwright/test';

// Serveur jetable uniquement : descriptions activées avec le modèle local ou le modèle factice de test/helpers.js.
// Les deux admins doivent préserver la saisie pendant la demande et avant d’accepter une suggestion.
test.skip(!process.env.E2E_LOCAL_AUTH || !process.env.E2E_ALLOW_WRITES, 'serveur jetable avec écritures autorisées requis');
test.describe.configure({ mode: 'serial' });
const observations = new WeakMap();
test.beforeEach(async ({ page }) => {
  const log = { erreursScript: [], reponses: [] };
  observations.set(page, log);
  page.on('pageerror', e => log.erreursScript.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) log.erreursScript.push(m.text()); });
  // Aucun corps, cookie ni paramètre d’URL dans la preuve réseau.
  page.on('response', r => { if (r.request().method() === 'POST' || r.status() >= 400) log.reponses.push({ methode: r.request().method(), chemin: new URL(r.url()).pathname, statut: r.status() }); });
});
test.afterEach(async ({ page }, info) => {
  const log = observations.get(page);
  await info.attach('console-reseau-expurge', { body: JSON.stringify(log, null, 2), contentType: 'application/json' });
  expect(log.erreursScript).toEqual([]);
});


for (const version of ['v1', 'v2']) {
  test.describe(`édition des photos, admin ${version}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.request.post('/auth/local', { form: { token: process.env.E2E_LOCAL_AUTH, author: version === 'v1' ? 'julien' : 'sebastien' } });
      await page.goto('/admin');
      const news = page.locator('[data-release-pop]');
      if (await news.isVisible()) await news.getByRole('button', { name: 'C’est noté' }).click();
      const csrf = await page.locator('body').getAttribute('data-csrf');
      await page.request.post('/admin/version', { form: { _csrf: csrf, version, back: '/admin' } });
    });

    test('description : demander sans perdre la saisie, annuler puis confirmer le remplacement', async ({ page }, info) => {
      await page.goto('/admin/photos');
      const href = await page.locator('a[href]').evaluateAll(as => as.map(a => a.getAttribute('href')).find(h => /^\/admin\/photos\/\d+$/.test(h)));
      await page.goto(href);
      const desc = page.locator('[data-desc]');
      await expect(desc, 'activer les descriptions sur le serveur jetable').toHaveCount(1);
      const field = page.locator('textarea[name="alt_text_en"]');
      await field.evaluate(el => { el.closest('details')?.setAttribute('open', ''); });
      const before = await page.locator('textarea[name^="alt_text"]').evaluateAll(es => Object.fromEntries(es.map(e => [e.name, e.value])));
      const failures = [];
      page.on('pageerror', e => failures.push(e.message));
      await field.fill('Texte écrit à la main, à conserver.');
      const values = () => page.locator('input[name="title"], textarea[name="legend"], input[name="place"], textarea[name^="alt_text"]').evaluateAll(es => es.map(e => [e.name, e.value]));
      const entered = await values();
      const ready = page.waitForResponse(r => r.url().endsWith(`${href}/description`) && r.request().method() === 'GET');
      await desc.locator('button[form="desc-form"]').click();
      expect((await ready).status()).toBe(200);
      await expect(desc.locator('[data-desc-use]')).toBeVisible({ timeout: 90000 });
      expect(await values()).toEqual(entered);
      expect(page.url()).toContain(href);
      const use = desc.locator('[data-desc-use]');
      const target = page.locator(`textarea[name="${await use.getAttribute('data-desc-field')}"]`);
      await target.evaluate(el => { el.closest('details')?.setAttribute('open', ''); });
      await target.fill('Texte écrit à la main, à conserver.');
      const snapshot = await values();
      page.once('dialog', async d => { expect(d.type()).toBe('confirm'); await d.dismiss(); });
      await use.click();
      expect(await values()).toEqual(snapshot);
      if (version === 'v2') await expect(target).toHaveAttribute('data-saved', 'Texte écrit à la main, à conserver.');
      const saved = async () => page.evaluate(html => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('textarea[name^="alt_text"]')].map(e => [e.name, e.value]), await (await page.request.get(href)).text());
      const persisted = await saved();
      page.once('dialog', async d => d.accept());
      await use.click();
      await expect(target).toHaveValue(await use.getAttribute('data-desc-use'));
      expect(await saved(), 'reprendre ne doit pas enregistrer la suggestion').toEqual(persisted);
      await desc.screenshot({ path: info.outputPath(`description-${version}.png`) });
      if (version === 'v2') {
        await desc.getByRole('button', { name: 'Défaire', exact: true }).click();
        expect(await values()).toEqual(snapshot);
      }
      // Restaurer les saisies éventuellement enregistrées au champ quitté dans l’admin v2.
      const csrf = await page.locator('body').getAttribute('data-csrf');
      expect((await page.request.post(`${href}/champs`, { form: { _csrf: csrf, ...before } })).ok()).toBe(true);
      expect(failures).toEqual([]);
    });

    test('filigrane sans JavaScript : l’aperçu reste disponible dans un nouvel onglet', async ({ page, browser }, info) => {
      const context = await browser.newContext({ ...info.project.use, storageState: await page.context().storageState(), javaScriptEnabled: false, locale: 'fr-FR' });
      try {
        const plain = await context.newPage();
        await plain.goto('/admin/images');
        await plain.locator('[name="wm_enabled"]').check();
        await plain.locator('[name="wm_text"]').fill('APERÇU SANS SCRIPT');
        const popup = context.waitForEvent('page');
        await plain.getByRole('button', { name: 'Actualiser l’aperçu', exact: true }).click();
        const preview = await popup;
        await preview.waitForLoadState();
        expect(preview.url()).toContain('/admin/images/apercu');
        await expect(preview.locator('img')).toBeVisible();
        expect(await preview.locator('img').evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
        expect(await (await plain.request.get('/admin/images')).text()).not.toContain('value="APERÇU SANS SCRIPT"');
      } finally { await context.close(); }
    });

    test('filigrane : actualiser sur place sans enregistrer, puis signaler une erreur', async ({ page }, info) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('/admin/images');
      const image = page.locator('[data-images-preview]');
      const oldSrc = await image.getAttribute('src');
      await page.locator('[name="wm_enabled"]').check();
      await page.locator('[name="wm_text"]').fill('ESSAI FILIGRANE');
      await page.locator('[name="wm_position"]').selectOption('centre');
      const response = page.waitForResponse(r => r.url().endsWith('/admin/images/apercu') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Actualiser l’aperçu', exact: true }).click();
      expect((await response).status()).toBe(200);
      await expect(image).toHaveAttribute('src', /^blob:/);
      await expect(page.locator('[data-images-status]')).toContainText('non enregistrés');
      expect(await image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
      expect(page.context().pages()).toHaveLength(1);
      await page.screenshot({ path: info.outputPath(`filigrane-${version}.png`), fullPage: true });
      // Le serveur sert encore les réglages d’avant : la prévisualisation n’écrit rien.
      const saved = await page.request.get('/admin/images');
      expect(await saved.text()).not.toContain('value="ESSAI FILIGRANE"');
      await page.route('**/admin/images/apercu', route => route.fulfill({ status: 503, body: 'Indisponible' }));
      await page.getByRole('button', { name: 'Actualiser l’aperçu', exact: true }).click();
      await expect(page.locator('[data-images-status]')).toContainText('Impossible');
      expect(await image.getAttribute('src')).not.toBe(oldSrc);
      expect(errors).toEqual([]);
    });
  });
}

test('bandeau : les six compositions sont accessibles, le visiteur garde sa présentation', async ({ page, browser }, info) => {
  await page.request.post('/auth/local', { form: { token: process.env.E2E_LOCAL_AUTH, author: 'julien' } });
  await page.goto('/');
  const visitor = await browser.newContext({ locale: 'fr-FR' });
  try {
    const publicPage = await visitor.newPage();
    await publicPage.goto('/');
    const before = await publicPage.locator('body').getAttribute('data-composition');
    for (const name of ['Obscura', 'Panoramique', 'Contact', 'Résonances', 'Itinérance', 'Hors cadre']) {
      await page.locator('.vue-site').getByRole('button', { name: `Voir en ${name}`, exact: true }).click();
      await expect(page.locator('.vue-site-t')).toContainText(name);
      await expect(page.locator('body')).toHaveAttribute('data-composition', ({ 'Résonances': 'resonances', 'Itinérance': 'itinerance', 'Hors cadre': 'hors-cadre' })[name] || name.toLowerCase());
      await expect(page.locator('.vue-site')).toBeVisible();
    }
    await page.screenshot({ path: info.outputPath('compositions.png') });
    await publicPage.reload();
    expect(await publicPage.locator('body').getAttribute('data-composition')).toBe(before);
    await expect(publicPage.locator('.vue-site')).toHaveCount(0);
    await page.locator('.vue-site').getByRole('button', { name: 'Revenir au thème des visiteurs' }).click();
  } finally { await visitor.close(); }
});
