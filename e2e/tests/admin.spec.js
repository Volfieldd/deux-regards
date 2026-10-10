import { test, expect } from '@playwright/test';
const STATE = 'results/.auth/admin.json';

test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
test.use({ storageState: STATE });

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
});
test.afterEach(async () => expect(errors, 'erreurs console / CSP').toEqual([]));

test('rendu des pages de l’admin', async ({ page }, info) => {
  for (const [url, title, shot] of [['/admin', 'Tableau de bord', 'tableau'], ['/admin/photos', 'Photos', 'photos'],
    ['/admin/series', 'Séries', 'series'], ['/admin/auteurs', 'Auteurs', 'auteurs'], ['/admin/reglages', 'Réglages', 'reglages']]) {
    await page.goto(url);
    await expect(page.locator('h1')).toHaveText(title);
    await expect(page.locator('nav a[aria-current="page"]')).toBeVisible();
    // Aucune vignette cassée (les brouillons passent par /admin/media/).
    for (const img of await page.locator('main img').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
    }
    await page.screenshot({ path: `results/admin-${shot}-${info.project.name}.png`, fullPage: true });
  }
});
