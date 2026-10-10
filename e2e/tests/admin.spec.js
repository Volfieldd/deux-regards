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
    ['/admin/series', 'Séries', 'series'], ['/admin/auteurs', 'Auteurs', 'auteurs'], ['/admin/images', 'Filigrane et métadonnées', 'images'],
    ['/admin/reglages', 'Réglages', 'reglages']]) {
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

test('preuve d’antériorité : horodatage affiché et vérifié', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Preuves d’antériorité' })).toBeVisible();
  await page.goto('/admin/photos');
  await page.locator('.plist a.ttl').first().click();
  const proof = page.locator('#preuve');
  test.skip(await proof.getByText(/Désactivé sur ce serveur/).count() > 0, 'horodatage désactivé (TSA_URL=off)');
  // Page rendue côté serveur : on la recharge jusqu'à ce que l'horodatage soit fait.
  await expect.poll(async () => {
    await page.reload();
    return proof.getByText(/^Horodatée le \d{4}-\d{2}-\d{2} à /).count();
  }, { timeout: 60_000, intervals: [2000] }).toBe(1);
  await expect(proof.locator('code')).toHaveText(/^[0-9a-f]{64}$/);
  await proof.getByRole('button', { name: 'Vérifier la preuve' }).click();
  await expect(page.getByRole('status').first()).toContainText('Preuve valide : original intact');
  const [download] = await Promise.all([page.waitForEvent('download'), proof.getByRole('link', { name: 'Fiche de preuve' }).click()]);
  expect(download.suggestedFilename()).toMatch(/-preuve\.txt$/);
});

// Audit automatique d'accessibilité (axe-core, WCAG 2.2 A/AA) des pages de l'admin.
test('accessibilité de l’admin : aucune violation sérieuse', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await page.emulateMedia({ reducedMotion: 'reduce' });   // mesure l'état final, pas une animation d'apparition
  for (const url of ['/admin', '/admin/photos', '/admin/series', '/admin/auteurs', '/admin/images', '/admin/reglages']) {
    await page.goto(url);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const serious = violations.filter(v => ['serious', 'critical'].includes(v.impact));
    expect(serious.map(v => `${url} ${v.id} : ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  }
});
