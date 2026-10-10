import { test, expect } from '@playwright/test';

// Captures d'écran de l'admin pour la documentation (docs/captures/admin). Lecture seule.
// Lancement : E2E_CAPTURES=1 … e2e/run.sh --project=captures
const STATE = 'results/.auth/admin.json';
test.skip(process.env.E2E_CAPTURES !== '1', 'E2E_CAPTURES=1 requis');

const PAGES = [
  ['01-tableau-de-bord', '/admin'],
  ['02-photos', '/admin/photos'],
  ['03-fiche-photo', null],
  ['04-series', '/admin/series'],
  ['05-auteurs', '/admin/auteurs'],
  ['06-filigrane-exif', '/admin/images'],
  ['07-reglages', '/admin/reglages'],
  ['08-apparence', '/admin/apparence'],
];

test.describe('admin', () => {
  test.use({ storageState: STATE });
  for (const [name, url] of PAGES) {
    test(name, async ({ page }, info) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (url) await page.goto(url);
      else {
        await page.goto('/admin/photos');
        await page.locator('.plist li a.ttl').first().click();
      }
      for (const img of await page.locator('main img').all()) {
        await img.scrollIntoViewIfNeeded();
        await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
      }
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `captures/admin/${name}-${info.project.name.replace('captures-', '')}.png`, fullPage: true });
    });
  }
});

test('00-connexion-de-test', async ({ browser }, info) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, ...info.project.use });
  const page = await ctx.newPage();
  await page.goto('/auth/local?next=/admin');
  await page.screenshot({ path: `captures/admin/00-connexion-de-test-${info.project.name.replace('captures-', '')}.png` });
  await ctx.close();
});

// Front public, avec le thème appliqué sur le serveur.
const FRONT = [['10-accueil', '/'], ['11-photo', null], ['12-a-propos', '/a-propos']];
for (const [name, url] of FRONT) {
  test(`front ${name}`, async ({ browser }, info) => {
    const ctx = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    if (url) await page.goto(url);
    else { await page.goto('/'); await page.locator('#grid .tile').nth(1).click(); }
    for (const img of await page.locator('img:visible').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
    }
    // Toutes les images de la page chargées (y compris celles à chargement différé, hors écran).
    await page.evaluate(async () => {
      document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager'; });
      await Promise.all([...document.images].map(i => (i.complete ? i.decode().catch(() => {}) : new Promise(r => { i.onload = i.onerror = r; }))));
      scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `captures/front/${name}-${info.project.name.replace('captures-', '')}.png`, fullPage: name !== '11-photo' });
    await ctx.close();
  });
}
