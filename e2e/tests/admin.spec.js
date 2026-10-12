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
  test.setTimeout(90_000);            // 10 pages, captures pleine page
  for (const [url, title, shot] of [['/admin', /^(Bonjour|Bonsoir)/, 'tableau'], ['/admin/photos', 'Photothèque', 'photos'],
    ['/admin/series', 'Séries', 'series'], ['/admin/auteurs', 'Auteurs', 'auteurs'], ['/admin/images', 'Filigrane et métadonnées', 'images'],
    ['/admin/reglages', 'Réglages', 'reglages'], ['/admin/statistiques', 'Statistiques', 'statistiques'], ['/admin/instagram', 'Instagram', 'instagram'], ['/admin/aide', 'Aide', 'aide']]) {
    await page.goto(url);
    await expect(page.locator('h1')).toHaveText(title);
    // Mobile : la barre latérale est repliée derrière « Menu » (barre d'onglets en bas).
    const menu = page.locator('.tabbar').getByRole('button', { name: 'Menu' });
    if (await menu.isVisible()) {
      await menu.click();
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
    }
    await expect(page.locator('.side nav a[aria-current="page"]')).toBeVisible();
    if (await menu.isVisible()) await page.keyboard.press('Escape');
    // Aucune vignette cassée (les brouillons passent par /admin/media/).
    for (const img of await page.locator('main img:visible').all()) {
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
  await page.locator('.contact .tile').first().click();                         // sélection : l'inspecteur mène à la fiche
  await page.locator('[data-inspector]').getByRole('link', { name: /Fiche complète/ }).click();
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
test('accessibilité de l’admin : aucune violation, en mode sombre et en mode clair', async ({ page, context }) => {
  test.setTimeout(240_000);
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await page.emulateMedia({ reducedMotion: 'reduce' });   // mesure l'état final, pas une animation d'apparition
  for (const theme of ['dark', 'light']) {
    await context.addCookies([{ name: 'admin_theme', value: theme, url: `${process.env.BASE_URL}/admin` }]);
    for (const url of ['/admin', '/admin/photos', '/admin/photos?importer', '/admin/photos?vue=liste', '/admin/photos/lot?ids=1,2,3', '/admin/series', '/admin/auteurs', '/admin/images', '/admin/apparence', '/admin/reglages', '/admin/statistiques', '/admin/instagram', '/admin/photos/1', '/admin/aide']) {
      await page.goto(url);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const serious = violations;
      expect(serious.map(v => `${theme} ${url} ${v.id} : ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    }
  }
});

test('aide : lien contextuel, sommaire, recherche', async ({ page }) => {
  await page.goto('/admin/photos');
  await page.locator('.lib-top').getByRole('link', { name: 'Aide' }).click();
  await expect(page).toHaveURL(/\/admin\/aide#photos$/);
  await page.goto('/admin/series');
  await page.getByRole('link', { name: 'Aide sur cette page' }).click();
  await expect(page).toHaveURL(/\/admin\/aide#series$/);
  await page.goto('/admin/aide#photos');
  await expect(page.locator('#photos')).toBeInViewport();
  const search = page.getByLabel('Rechercher dans l’aide');
  await search.fill('mosaique');                                 // sans accent : trouvé quand même
  await expect(page.locator('[data-help-section]:visible')).toHaveCount(1);
  await expect(page.locator('#filigrane-exif')).toBeVisible();
  await search.fill('zzzz introuvable');
  await expect(page.getByText('Aucune section ne contient ce texte.')).toBeVisible();
  await search.fill('');
  await expect(page.locator('[data-help-section]:visible')).toHaveCount(14);
  await page.locator('.help-toc').getByRole('link', { name: /^Changer l.ordre$/ }).click();
  await expect(page.locator('#photos-changer-lordre')).toBeInViewport();
});

// Photothèque : sélection, inspecteur, loupe, raccourcis, palette ⌘K et mode clair / sombre (lecture seule).
test('photothèque : inspecteur, loupe, palette, mode clair / sombre', async ({ page, isMobile }) => {
  test.skip(isMobile, 'souris et clavier');
  await page.goto('/admin/photos');
  const tiles = page.locator('.contact .tile');
  const insp = page.locator('[data-inspector]');
  await tiles.nth(1).click();
  const title = await page.evaluate(() => JSON.parse(document.getElementById('photos-data').textContent)[1].title);
  await expect(insp.locator('[data-one-field=title]')).toHaveValue(title);
  await expect(insp.locator('[data-one-preview] img')).toBeVisible();
  await tiles.nth(3).click({ modifiers: ['Shift'] });
  await expect(insp.locator('[data-insp-title]')).toHaveText('3 photos');
  await expect(insp.locator('[data-insp-many]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(insp.locator('[data-insp-empty]')).toBeVisible();
  // Loupe : L, flèches, Échap.
  await tiles.nth(0).click();
  await page.keyboard.press('l');
  const loupe = page.getByRole('dialog', { name: 'Loupe' });
  await expect(loupe).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(loupe.locator('.strip button[aria-current]')).toHaveAttribute('data-id', await tiles.nth(1).getAttribute('data-id'));
  await page.keyboard.press('Escape');
  await expect(loupe).toHaveCount(0);
  // Palette : ⌘K, recherche d'une photo, Entrée ouvre sa fiche.
  await page.keyboard.press('Control+k');
  const pal = page.locator('dialog.palette');
  await expect(pal).toBeVisible();
  await page.keyboard.type(title.slice(0, 6));
  await expect(pal.locator('[role=option]').filter({ hasText: title }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  // Mode clair / sombre : appliqué tout de suite, gardé au rechargement.
  const before = await page.evaluate(() => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  const other = before === 'light' ? 'dark' : 'light';
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', other);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', other);
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', before);
});

// Statistiques : une visite publique (navigateur ordinaire, hors session admin) apparaît dans l'admin.
test('statistiques : une visite publique est comptée et visible dans l’admin', async ({ page, browser, isMobile }) => {
  test.skip(isMobile, 'une fois suffit');
  await page.goto('/admin/statistiques');
  const views = async () => Number((await page.locator('.figures div', { hasText: 'pages vues' }).locator('b').textContent()).replace(/\s/g, ''));
  const before = await views();
  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0 E2E' });
  const pub = await visitor.newPage();
  await pub.goto('/a-propos');
  await visitor.close();
  await page.reload();
  expect(await views()).toBe(before + 1);
  await expect(page.locator('.chart')).toBeVisible();
});

test('réglages : vignettes de l’ouverture aux proportions fixes, pied de la barre latérale dans son cadre', async ({ page, isMobile }) => {
  await page.goto('/admin/reglages#ouverture');
  // Une vignette ne dépend jamais de la taille de l'original (attribut height de l'image) : cadre 3:2, photo entière.
  const sizes = await page.locator('.pick:not([hidden]) img').evaluateAll(is => is.map(i => [i.getBoundingClientRect().width, i.getBoundingClientRect().height, getComputedStyle(i).objectFit]));
  expect(sizes.length).toBeGreaterThan(0);
  for (const [w, h, fit] of sizes) { expect(Math.abs(w / h - 1.5)).toBeLessThan(0.02); expect(fit).toBe('contain'); }
  test.skip(isMobile, 'barre latérale repliée sur téléphone');
  // Nom long : tronqué, boutons du pied toujours dans la barre.
  await page.evaluate(() => { document.querySelector('.who').firstChild.textContent = 'Sebastien Wojcicki-Delacroix'; });
  const { side, right } = await page.evaluate(() => ({
    side: document.querySelector('.side').getBoundingClientRect().right,
    right: Math.max(...[...document.querySelectorAll('.me button')].map(b => b.getBoundingClientRect().right)),
  }));
  expect(right).toBeLessThanOrEqual(side);
});
