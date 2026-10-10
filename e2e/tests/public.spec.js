import { test, expect } from '@playwright/test';

// Toute erreur JS, violation de CSP ou ressource (image, CSS, police…) en échec fait échouer le test.
// Les pages d'erreur elles-mêmes (404, 503) sont attendues : seul le document est exempté.
let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  page.on('requestfailed', r => errors.push(`${r.failure()?.errorText} ${r.url()}`));
  page.on('response', r => {
    if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`);
  });
});
test.afterEach(async () => {
  expect(errors, 'erreurs console / CSP').toEqual([]);
});

test('accueil : ouverture, regards, séries, 12 photos chargées', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('.hero-item.on img')).toBeVisible();
  await expect(page.locator('.cap.on h1')).toHaveText('Le ciel s’est ouvert');
  await expect(page.locator('#grid .tile')).toHaveCount(12);
  // Chaque image de la grille finit par se charger (lazy-loading compris).
  for (const img of await page.locator('#grid .tile img').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
  }
  // Polices auto-hébergées effectivement utilisées.
  expect(await page.evaluate(() => document.fonts.check('italic 400 40px "Cormorant Garamond"'))).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `results/accueil-${info.project.name}.png`, fullPage: true });
});

test('ouverture : vignettes et bouton pause', async ({ page, isMobile }) => {
  await page.goto('/');
  const pause = page.locator('[data-pause]');
  await expect(pause).toBeInViewport({ ratio: 1 });
  // Aucune vignette sous le bouton (la bande s'arrête avant lui).
  const p = await pause.boundingBox();
  const strip = await page.locator('.strip').boundingBox();
  expect(strip.x + strip.width).toBeLessThanOrEqual(p.x);
  await page.locator('.strip button[data-h="2"]').click();
  await expect(page.locator('.cap.on h1')).toHaveText('Deux, minuit');
  await pause.click();
  await expect(pause).toHaveText('Lecture');
  await expect(page.locator('.bar')).not.toHaveClass(/run/);
  await page.waitForTimeout(6500);
  await expect(page.locator('.cap.on h1')).toHaveText('Deux, minuit');   // n'a pas avancé
  await pause.click();
  await expect(pause).toHaveText('Pause');
  await expect(page.locator('.bar')).toHaveClass(/run/);
});

test('filtre par regard sans rechargement, URL et historique à jour', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__sansRechargement = true; });
  await page.locator('.who a', { hasText: 'Julien' }).click();
  await expect(page).toHaveURL(/\/auteur\/julien$/);
  await expect(page.locator('#grid .tile')).toHaveCount(6);
  await expect(page.locator('.gridhead h3')).toHaveText('Toutes les séries, par Julien');
  expect(await page.evaluate(() => window.__sansRechargement)).toBe(true);
  await page.locator('.series a.idx', { hasText: 'Rue' }).click();
  await expect(page).toHaveURL(/regard=julien&serie=rue/);
  await expect(page.locator('#grid .tile')).toHaveCount(3);
  await page.goBack();
  await expect(page.locator('#grid .tile')).toHaveCount(6);
  expect(await page.evaluate(() => window.__sansRechargement)).toBe(true);
});

test('page photo : visionneuse, clavier, retour à la galerie filtrée', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'clavier : bureau uniquement');
  await page.goto('/auteur/julien');
  await page.locator('#grid .tile').first().click();
  await expect(page.locator('body')).toHaveClass(/dark/);
  await expect(page.locator('.viewer .mono').first()).toHaveText('01 / 06');
  const first = await page.locator('.vtext h1').textContent();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.viewer .mono').first()).toHaveText('02 / 06');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.vtext h1')).toHaveText(first);
  await page.screenshot({ path: `results/photo-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/auteur\/julien#galerie$/);
});

test('page photo : swipe sur mobile', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, 'mobile uniquement');
  await page.goto('/');
  await page.locator('#grid .tile').first().click();
  await expect(page.locator('.viewer .mono').first()).toHaveText('01 / 12');
  const box = await page.locator('.vimg').boundingBox();
  const y = box.y + box.height / 2;
  await page.locator('.vimg').dispatchEvent('touchstart', { touches: [{ identifier: 0, clientX: box.x + box.width - 20, clientY: y }] });
  await page.locator('.vimg').dispatchEvent('touchend', { changedTouches: [{ identifier: 0, clientX: box.x + 20, clientY: y }] });
  await expect(page.locator('.viewer .mono').first()).toHaveText('02 / 12');
  await page.screenshot({ path: `results/photo-${info.project.name}.png` });
});

test('clic droit et glisser bloqués sur les images', async ({ page }) => {
  await page.goto('/');
  const prevented = await page.locator('#grid img').first().evaluate(img => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    img.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test('à propos, 404 et en-têtes de sécurité', async ({ page }, info) => {
  const res = await page.goto('/a-propos');
  expect(res.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.locator('.people h2')).toHaveCount(2);
  await page.screenshot({ path: `results/a-propos-${info.project.name}.png`, fullPage: true });
  const missing = await page.goto('/photo/nexiste-pas');
  expect(missing.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('n’existe pas');
});

test('l’admin renvoie vers la connexion', async ({ page }) => {
  const res = await page.goto('/admin');
  expect(page.url()).toMatch(/\/auth\/(login|local)\?next=%2Fadmin/);
  expect([200, 503]).toContain(res.status());
});

test.describe('sans JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('le site reste utilisable', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#grid .tile')).toHaveCount(12);
    await expect(page.locator('[data-pause]')).toBeHidden();
    await page.locator('.who a', { hasText: 'Sébastien' }).click();
    await expect(page).toHaveURL(/\/auteur\/sebastien/);
    await expect(page.locator('#grid .tile')).toHaveCount(6);
  });
});

test('droits d’utilisation : page et lien en pied de page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Droits d’utilisation' }).click();
  await expect(page).toHaveURL(/\/droits$/);
  await expect(page.locator('h1')).toHaveText('Droits d’utilisation');
  await expect(page.getByText(/protégées par le droit d’auteur/)).toBeVisible();
});
