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
  ['09-aide', '/admin/aide'],
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
      for (const img of await page.locator('main img:visible').all()) {
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

// Écrans des parcours (import suivi, lot, sélection, suppression d'une série) : ils créent des
// données, donc seulement avec E2E_ALLOW_WRITES=1, sur une instance jetable (jeu de démonstration).
test.describe('parcours', () => {
  test.skip(process.env.E2E_ALLOW_WRITES !== '1', 'E2E_ALLOW_WRITES=1 requis');
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: STATE });
  const out = (name, info) => `captures/admin/${name}-${info.project.name.replace('captures-', '')}.png`;
  let lot = null;

  test('import suivi puis lot', async ({ page }, info) => {
    test.skip(info.project.name !== 'captures-bureau', 'bureau seulement');
    test.setTimeout(300_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/admin/photos');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('link', { name: '＋ Importer des photos' }).click()]);
    await chooser.setFiles(['DSCF0241.jpg', 'DSCF0242.jpg', 'DSCF0243.jpg', 'notes-de-voyage.jpg'].map(f => `fixtures/audit/${f}`));
    await page.waitForFunction(() => [...document.querySelectorAll('[data-files] .bar.proc i')].some(i => parseFloat(i.style.width) > 0), null, { timeout: 120_000 });
    await page.locator('#import').scrollIntoViewIfNeeded();
    await page.screenshot({ path: out('02b-import-progression', info), fullPage: true });
    await expect(page.locator('[data-sum-title]')).toHaveText('3 photos prêtes sur 3', { timeout: 240_000 });
    lot = await page.locator('[data-sum-next]').getAttribute('href');
    await page.goto(lot);
    await page.locator('[data-bulk]').getByPlaceholder('Lieu').fill('Nantes');
    await page.locator('[data-bulk]').getByPlaceholder('Lieu').press('Tab');
    await expect(page.locator('[data-toast]')).toContainText('appliqué');
    await page.locator('input[data-field=title]').first().fill('Lisière');
    await page.locator('input[data-field=title]').first().press('Tab');
    await expect(page.locator('tbody tr').first().locator('[data-state]')).toHaveText('✓ Enregistré');
    await page.screenshot({ path: out('02c-completer-le-lot', info) });
  });

  test('sélection multiple', async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/admin/photos');
    const boxes = page.locator('.plist .chk');
    await boxes.nth(0).check();
    await boxes.nth(2).click({ modifiers: ['Shift'] });
    await page.locator('[data-bulk]').getByLabel('Série de destination').selectOption({ label: 'Rue' });
    await page.screenshot({ path: out('02d-selection', info) });
  });

  test('suppression d’une série', async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/admin/series');
    const card = page.locator('.scard[data-id]').filter({ hasText: /[1-9]\d* photos/ }).first();
    await card.locator('summary[aria-label^="Plus d’actions"]').click();
    await card.locator('.danger > summary').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.screenshot({ path: out('04b-series-suppression', info) });
  });
});
