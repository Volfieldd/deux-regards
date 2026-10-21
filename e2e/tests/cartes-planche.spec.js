import { test, expect } from '@playwright/test';

test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
test.use({ storageState: 'results/.auth/admin.json' });

// Régression : le papier A4 élargissait toute la page au téléphone. Son cadre doit défiler sans réduire l’impression.
test('planche A4 : aperçu contenu au téléphone, clavier et dimensions imprimées conservées', async ({ page }) => {
  await page.goto('/admin/rencontres/cartes');
  const auteur = await page.locator('select[name="author_id"] option').evaluateAll(opts => opts.find(o => /^\d+$/.test(o.value))?.value);
  expect(auteur).toBeTruthy();
  await page.goto(`/admin/rencontres/cartes/planche?auteur=${auteur}&nombre=7&generiques=1`);
  const apercu = page.getByRole('main', { name: 'Aperçu des planches A4' });
  await expect(page.locator('.sheet')).toHaveCount(2);
  await expect(page.locator('.pair')).toHaveCount(7);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 800) {
      await apercu.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => apercu.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
  }
  await page.emulateMedia({ media: 'print' });
  expect((await page.locator('.sheet').first().boundingBox()).width).toBeCloseTo(210 * 96 / 25.4, 1);
  expect((await page.locator('.card').first().boundingBox()).width).toBeCloseTo(85 * 96 / 25.4, 1);
  expect((await page.locator('.card').first().boundingBox()).height).toBeCloseTo(55 * 96 / 25.4, 1);
  await expect(page.locator('.bar')).toBeHidden();
  await expect(apercu).toHaveCSS('overflow-x', 'visible');
});
