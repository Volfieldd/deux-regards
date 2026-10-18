import { test, expect } from '@playwright/test';

// Accueil (MQ-01), galerie en rangées et filtres (MQ-02), page d'une série (MQ-03) en v2, vus dans l'aperçu de la v2 :
// chaque test ouvre sa propre session d'administrateur (connexion locale de test) et y ouvre l'aperçu ; les visiteurs
// et les autres tests gardent la v1. Rien n'est écrit dans les données.
let errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`); });
};
test.beforeEach(() => { errors = []; });
test.afterEach(() => { expect(errors, 'erreurs console / CSP').toEqual([]); });

async function apercu(browser, info, options = {}) {
  test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent : l’aperçu de la v2 demande une session d’administrateur');
  const ctx = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] }, ...options });
  const page = await ctx.newPage();
  // Connexion avec le script (formulaire de test) ; le contexte sans script, lui, n'en a pas besoin pour la suite.
  const login = options.javaScriptEnabled === false ? await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } }) : ctx;
  const lp = login === ctx ? page : await login.newPage();
  await lp.goto('/auth/local?next=%2Fadmin%2Fapparence');
  await lp.getByLabel('Se connecter en tant que').selectOption('julien');
  await lp.getByLabel('Jeton de test').fill(process.env.E2E_LOCAL_AUTH);
  await lp.getByRole('button', { name: 'Se connecter' }).click();
  await expect(lp).toHaveURL(/\/admin\/apparence$/);
  const news = lp.getByRole('dialog', { name: /Nouveau depuis votre dernière visite/ });
  if (await news.isVisible()) await news.getByRole('button', { name: 'C’est noté' }).click();
  await lp.getByRole('button', { name: 'Ouvrir l’aperçu de la v2' }).click();
  if (login !== ctx) { await ctx.addCookies(await login.cookies()); await login.close(); }
  watch(page);
  return { ctx, page };
}

const PAGES = ['/', '/auteur/julien', '/serie/rue'];

test.describe('bureau', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'mesures au bureau : projet desktop'));

  test('ordre de lecture au clavier = ordre visuel des rangées : le focus ne remonte jamais', async ({ browser }, info) => {
    test.setTimeout(90000);
    const { ctx, page } = await apercu(browser, info, { viewport: { width: 1440, height: 900 } });
    for (const url of PAGES) {
      await page.goto(url);
      const tiles = page.locator('.rangees:not(.rangees--etiree) a.vignette');
      const n = await tiles.count();
      expect(n, url).toBeGreaterThan(3);
      await tiles.first().focus();
      let prev = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY }; });
      for (let i = 1; i < n; i++) {
        await page.keyboard.press('Tab');
        const cur = await page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, tile: a.matches('.vignette') }; });
        expect(cur.tile, `${url} : la ${i + 1}e tabulation reste dans les rangées`).toBe(true);
        // Même rangée : vers la droite ; sinon la rangée suivante, plus bas. Jamais un saut vers le haut.
        if (Math.abs(cur.y - prev.y) < 8) expect(cur.x, `${url} : vignette ${i + 1}`).toBeGreaterThan(prev.x);
        else expect(cur.y - prev.y, `${url} : vignette ${i + 1}`).toBeGreaterThan(0);
        prev = cur;
      }
    }
    await ctx.close();
  });

  test('aucun débordement horizontal à 320, 412, 820, 1032 × 1250, 1376 × 900 et 1440 px ; la photo d’ouverture dans le premier écran', async ({ browser }, info) => {
    test.setTimeout(150000);                                                // 6 écrans × 6 pages, sur un hôte chargé
    const { ctx, page } = await apercu(browser, info);
    for (const [width, height] of [[320, 640], [412, 915], [820, 1180], [1032, 1250], [1376, 900], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      for (const url of [...PAGES, '/?regard=julien&serie=voyage', '/de/']) {
        await page.goto(url);
        const debord = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(debord, `${url} à ${width} × ${height}`).toBeLessThanOrEqual(0);
      }
      await page.goto('/');
      const img = await page.locator('.ouverture-cadre img').boundingBox();
      expect(img.y + img.height, `ouverture à ${width} × ${height}`).toBeLessThanOrEqual(height);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const url of PAGES) { await page.goto(url); await page.screenshot({ path: `results/galerie-v2-1440-${url.replace(/\W+/g, '_')}.png`, fullPage: true }); }
    await ctx.close();
  });

  test('filtre par photographe : une adresse, l’état actif, les seules photos du regard ; l’ordre dans un menu', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info, { viewport: { width: 1440, height: 900 } });
    await page.goto('/');
    const regard = page.getByRole('navigation', { name: 'Regard' });
    await regard.getByRole('link', { name: /Julien/ }).click();
    await expect(page).toHaveURL(/\/auteur\/julien#filtres$/);
    await expect(page).toHaveTitle(/^Galerie, par Julien \(\d+ photos\)/);
    await expect(page.getByRole('navigation', { name: 'Regard' }).getByRole('link', { name: /Julien/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#g-h')).toHaveText('Les photos de Julien');
    // Chaque vignette mène à une photo de Julien (la visionneuse le dit dans son retour).
    const first = page.locator('.rangees a.vignette').first();
    await first.click();
    await expect(page.locator('.sh-retour')).toContainText('Julien');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/auteur\/julien(#\w+)?$/);
    // La barre est collante : un élément atteint au clavier n'est jamais dessous.
    const bar = await page.locator('.filtres-barre').boundingBox();
    await page.locator('.rangees a.vignette').last().focus();
    const f = await page.locator('.rangees a.vignette').last().boundingBox();
    expect(f.y).toBeGreaterThanOrEqual(bar.height - 1);
    // L'ordre : un <details> ; « Plus récentes d'abord » garde le regard.
    await page.locator('.deroulant > summary').click();
    await page.getByRole('link', { name: 'Plus récentes d’abord' }).click();
    await expect(page).toHaveURL(/\/auteur\/julien\?ordre=recentes#filtres$/);
    await expect(page.locator('.deroulant > summary')).toContainText('plus récentes d’abord');
    await ctx.close();
  });

  test('diaporama à l’arrêt par défaut ; un point choisit une photo ; « Lire » le lance, « Pause » l’arrête', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info, { viewport: { width: 1440, height: 900 } });
    await page.clock.install();
    await page.goto('/');
    const cartel = page.locator('[data-ouv-cartel] .cartel-t');
    const first = await cartel.textContent();
    await page.clock.runFor(20000);
    await expect(cartel).toHaveText(first);                                 // rien ne bouge sans geste
    const points = page.locator('[data-ouv-point]');
    expect(await points.count()).toBeGreaterThan(1);
    await points.nth(1).click();
    await expect(points.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(points.nth(0)).toHaveAttribute('aria-pressed', 'false');
    const second = await cartel.textContent();
    expect(second).not.toBe(first);
    await expect.poll(() => page.locator('.ouverture-cadre img').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
    // « Lire » au clavier (la souris ailleurs) : la photo suivante au bout de 6 s, puis « Pause » l'arrête.
    await page.mouse.move(5, 890);
    await page.getByRole('button', { name: 'Lire le diaporama' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.clock.runFor(6500);
    await expect(points.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Pause' }).press('Enter');
    await page.clock.runFor(20000);
    await expect(points.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await ctx.close();
  });
});

test.describe('téléphone', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'mobile', 'téléphone : projet mobile (Pixel 7)'));

  test('Pixel 7 : deux photos au plus par rangée, la barre de filtres non collante, aucun débordement', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info);
    for (const url of PAGES) {
      await page.goto(url);
      const rows = await page.locator('.rangees:not(.rangees--etiree)').first().evaluate(ul => {
        const tops = new Map();
        for (const li of ul.children) { const y = Math.round(li.getBoundingClientRect().top); tops.set(y, (tops.get(y) || 0) + 1); }
        return [...tops.values()];
      });
      expect(Math.max(...rows), `${url} : ${rows.join(' · ')}`).toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), url).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `results/galerie-v2-pixel7-${url.replace(/\W+/g, '_')}.png`, fullPage: true });
    }
    await page.goto('/auteur/julien');
    expect(await page.locator('.filtres-barre').evaluate(b => getComputedStyle(b).position)).toBe('static');
    await ctx.close();
  });
});

test('sans JavaScript : ouverture sans points ni « Lire », filtres et ordre en liens, menu en <details>', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'une fois suffit');
  const { ctx, page } = await apercu(browser, info, { javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  await page.goto('/');
  await expect(page.locator('.ouverture-cadre img')).toBeVisible();
  await expect(page.locator('.ouverture-ctl')).toBeHidden();
  await expect(page.locator('[data-ouv-cartel] a')).toBeVisible();
  await page.getByRole('navigation', { name: 'Regard' }).getByRole('link', { name: /Sébastien/ }).click();
  await expect(page).toHaveURL(/\/auteur\/sebastien#filtres$/);
  await page.locator('.deroulant > summary').click();
  await page.getByRole('link', { name: 'Plus récentes d’abord' }).click();
  await expect(page).toHaveURL(/\/auteur\/sebastien\?ordre=recentes#filtres$/);
  await page.getByRole('navigation', { name: 'Séries' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\?regard=sebastien&serie=[\w-]+&ordre=recentes#filtres$/);
  await page.goto('/serie/rue');
  await expect(page.locator('h1')).toHaveText('Rue');
  await expect(page.locator('.rangees a.vignette').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await ctx.close();
});

test('visiteur : la v1 de l’accueil et des séries, même pendant l’aperçu d’un administrateur', async ({ browser }, info) => {
  const { ctx } = await apercu(browser, info);
  const visitor = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
  const page = await visitor.newPage();
  for (const url of PAGES) {
    await page.goto(url);
    await expect(page.locator('#grid')).toBeVisible();
    await expect(page.locator('.rangees')).toHaveCount(0);
  }
  await visitor.close();
  await ctx.close();
});
