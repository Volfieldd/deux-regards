import { test, expect } from '@playwright/test';

// Pages /galerie (MQ-02) et /series (index des séries) de la v2, vues dans la vue v2 d'un administrateur (connexion
// locale de test) ; les visiteurs gardent le réglage (v1 sur le serveur de test : les deux pages y sont introuvables).
// Clavier, sans JavaScript, aucun débordement (320, 412, 1032 × 1250, 1376 × 900, 1440 px), en français et en allemand.
// Rien n'est écrit dans les données.
let errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`); });
};
test.beforeEach(() => { errors = []; });
test.afterEach(() => { expect(errors, 'erreurs console / CSP').toEqual([]); });

async function apercu(browser, info, options = {}) {
  test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent : la vue v2 demande une session d’administrateur');
  const ctx = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] }, ...options });
  const page = await ctx.newPage();
  const login = options.javaScriptEnabled === false ? await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } }) : ctx;
  const lp = login === ctx ? page : await login.newPage();
  await lp.goto('/auth/local?next=%2Fadmin%2Fapparence');
  await lp.getByLabel('Se connecter en tant que').selectOption('julien');
  await lp.getByLabel('Jeton de test').fill(process.env.E2E_LOCAL_AUTH);
  await lp.getByRole('button', { name: 'Se connecter' }).click();
  await expect(lp).toHaveURL(/\/admin\/apparence$/);
  const news = lp.getByRole('dialog', { name: /Nouveau depuis votre dernière visite/ });
  if (await news.isVisible()) await news.getByRole('button', { name: 'C’est noté' }).click();
  await lp.getByRole('button', { name: 'Voir le site en v2' }).click();
  if (login !== ctx) { await ctx.addCookies(await login.cookies()); await login.close(); }
  watch(page);
  return { ctx, page };
}

const URLS = ['/', '/galerie', '/series', '/galerie?regard=julien&serie=rue', '/galerie?ordre=recentes', '/de/galerie', '/de/series', '/de/'];

test.describe('bureau', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'mesures au bureau : projet desktop'));

  test('aucun débordement horizontal à 320, 412, 1032 × 1250, 1376 × 900 et 1440 px (fr, de) ; captures', async ({ browser }, info) => {
    test.setTimeout(180000);
    const { ctx, page } = await apercu(browser, info);
    for (const [width, height] of [[320, 640], [412, 915], [1032, 1250], [1376, 900], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      for (const url of URLS) {
        await page.goto(url);
        const debord = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(debord, `${url} à ${width} × ${height}`).toBeLessThanOrEqual(0);
        // Aucun texte coupé hors de sa carte dans l'index des séries.
        if (/series/.test(url)) {
          const sortis = await page.$$eval('.ser-e', cards => cards.filter(c => c.scrollWidth > c.clientWidth + 1).length);
          expect(sortis, `${url} à ${width} : cartes`).toBe(0);
        }
      }
      for (const url of ['/galerie', '/series', '/de/series']) {
        await page.goto(url);
        await page.screenshot({ path: `results/galerie-series-${width}-${url.replace(/\W+/g, '_')}.png`, fullPage: true });
      }
    }
    await ctx.close();
  });

  test('/galerie au clavier : lien d’évitement, menu (Galerie active), filtres, puis les rangées dans l’ordre visuel', async ({ browser }, info) => {
    test.setTimeout(90000);
    const { ctx, page } = await apercu(browser, info, { viewport: { width: 1440, height: 900 } });
    await page.goto('/galerie');
    await expect(page.locator('h1')).toHaveText('Galerie');
    await expect(page.getByRole('navigation', { name: 'Navigation', exact: true }).getByRole('link', { name: 'Galerie' })).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText(/Aller au contenu/);
    // Un filtre au clavier : Entrée ouvre sa vue, sur /galerie (deux filtres) ou sur la page du regard.
    const julien = page.getByRole('navigation', { name: 'Regard' }).getByRole('link', { name: /Julien/ });
    await julien.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/auteur\/julien#filtres$/);
    await page.goto('/galerie');
    const tiles = page.locator('.rangees a.vignette');
    const n = await tiles.count();
    expect(n).toBeGreaterThan(3);
    await tiles.first().focus();
    let prev = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY }; });
    for (let i = 1; i < n; i++) {
      await page.keyboard.press('Tab');
      const cur = await page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, tile: a.matches('.vignette') }; });
      expect(cur.tile, `la ${i + 1}e tabulation reste dans les rangées`).toBe(true);
      if (Math.abs(cur.y - prev.y) < 8) expect(cur.x).toBeGreaterThan(prev.x);
      else expect(cur.y - prev.y).toBeGreaterThan(0);
      prev = cur;
    }
    // La visionneuse ouverte depuis la galerie y ramène.
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/photo\//);
    await expect(page.locator('.sh-retour')).toHaveAttribute('href', '/galerie#galerie');
    await ctx.close();
  });

  test('/series au clavier : une carte par série, le nom seul lien, contour visible ; Entrée ouvre la série', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info, { viewport: { width: 1440, height: 900 } });
    await page.goto('/series');
    await expect(page.locator('h1')).toHaveText('Séries');
    await expect(page.getByRole('navigation', { name: 'Navigation', exact: true }).getByRole('link', { name: 'Séries' })).toHaveAttribute('aria-current', 'page');
    const names = page.locator('.ser-e-titre a');
    const n = await names.count();
    expect(n).toBeGreaterThan(1);
    // Chaque carte n'a qu'un lien ; il fait 24 px de haut au moins, et le focus dessine le contour de la carte.
    expect(await page.$$eval('.ser-e', cards => cards.map(c => c.querySelectorAll('a').length))).toEqual(Array(n).fill(1));
    await names.first().focus();
    const outline = await page.locator('.ser-e').first().evaluate(c => getComputedStyle(c).outlineStyle);
    expect(outline).toBe('solid');
    for (let i = 0; i < n; i++) expect((await names.nth(i).boundingBox()).height).toBeGreaterThanOrEqual(24);
    // L'ordre du clavier suit l'ordre des cartes.
    for (let i = 1; i < n; i++) { await page.keyboard.press('Tab'); await expect(names.nth(i)).toBeFocused(); }
    // Toute la carte est cliquable (le lien étendu) ; Entrée sur le nom ouvre la série, dont le fil d'Ariane ramène ici.
    const href = await names.first().getAttribute('href');
    await names.first().press('Enter');
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await page.getByRole('navigation', { name: 'Fil d’Ariane' }).getByRole('link', { name: 'Séries' }).click();
    await expect(page).toHaveURL(/\/series$/);
    // Un clic sur la couverture (sous le lien étendu du nom) ouvre aussi la série.
    const img = await page.locator('.ser-e-img img').nth(1).boundingBox();
    await page.mouse.click(img.x + img.width / 2, img.y + img.height / 2);
    await expect(page).toHaveURL(/\/serie\//);
    await ctx.close();
  });

  test('accueil : un aperçu de la galerie (douze photos au plus) et « Toute la galerie », « Toutes les séries »', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info, { viewport: { width: 1440, height: 900 } });
    await page.goto('/');
    expect(await page.locator('#galerie .rangees a.vignette').count()).toBeLessThanOrEqual(12);
    await expect(page.locator('.filtres-barre')).toHaveCount(0);
    await page.locator('#galerie .gal-fin').getByRole('link', { name: /Toute la galerie/ }).click();
    await expect(page).toHaveURL(/\/galerie$/);
    await page.goto('/');
    await page.locator('#series').getByRole('link', { name: 'Toutes les séries' }).click();
    await expect(page).toHaveURL(/\/series$/);
    await ctx.close();
  });
});

test.describe('téléphone', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'mobile', 'téléphone : projet mobile (Pixel 7)'));

  test('Pixel 7 : galerie à deux photos au plus par rangée, séries en une colonne, menu vers les deux pages ; aucun débordement', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info);
    await page.goto('/galerie');
    const rows = await page.locator('.rangees').first().evaluate(ul => {
      const tops = new Map();
      for (const li of ul.children) { const y = Math.round(li.getBoundingClientRect().top); tops.set(y, (tops.get(y) || 0) + 1); }
      return [...tops.values()];
    });
    expect(Math.max(...rows)).toBeLessThanOrEqual(2);
    await page.goto('/series');
    const lefts = await page.$$eval('.ser-index > li', lis => [...new Set(lis.map(li => Math.round(li.getBoundingClientRect().left)))]);
    expect(lefts.length).toBe(1);
    await page.locator('.sh-menu > summary').click();
    await page.getByRole('navigation', { name: 'Navigation (téléphone)' }).getByRole('link', { name: 'Galerie' }).click();
    await expect(page).toHaveURL(/\/galerie$/);
    for (const url of URLS) {
      await page.goto(url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), url).toBeLessThanOrEqual(0);
    }
    for (const url of ['/galerie', '/series']) { await page.goto(url); await page.screenshot({ path: `results/galerie-series-pixel7-${url.replace(/\W+/g, '_')}.png`, fullPage: true }); }
    await ctx.close();
  });
});

test('sans JavaScript : /galerie (filtres, ordre en <details>), /series et le menu marchent', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'une fois suffit');
  const { ctx, page } = await apercu(browser, info, { javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  await page.goto('/galerie');
  await expect(page.locator('.rangees a.vignette').first()).toBeVisible();
  await page.locator('.deroulant > summary').click();
  await page.getByRole('link', { name: 'Plus récentes d’abord' }).click();
  await expect(page).toHaveURL(/\/galerie\?ordre=recentes#filtres$/);
  await page.getByRole('navigation', { name: 'Regard' }).getByRole('link', { name: /Julien/ }).click();
  await expect(page).toHaveURL(/\/auteur\/julien\?ordre=recentes#filtres$/);
  await page.goto('/series');
  await expect(page.locator('.ser-e').first()).toBeVisible();
  await page.locator('.ser-e-titre a').first().click();
  await expect(page).toHaveURL(/\/serie\//);
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/series');
  await page.locator('.sh-menu > summary').click();
  await page.getByRole('navigation', { name: 'Navigation (téléphone)' }).getByRole('link', { name: 'Galerie' }).click();
  await expect(page).toHaveURL(/\/galerie$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await ctx.close();
});

test('visiteur : /galerie et /series introuvables tant que le site est en v1, même pendant l’aperçu d’un administrateur', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'une fois suffit');
  const { ctx } = await apercu(browser, info);
  const visitor = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
  const page = await visitor.newPage();
  const v1 = await page.goto('/');
  test.skip(!(await page.locator('#grid').count()), 'le serveur de test n’est pas en v1');
  expect(v1.status()).toBe(200);
  for (const url of ['/galerie', '/series', '/de/galerie', '/galerie/tout-telecharger']) expect((await page.goto(url)).status(), url).toBe(404);
  await page.goto('/');
  expect(await page.locator('a[href="/galerie"], a[href="/series"]').count()).toBe(0);
  await visitor.close();
  await ctx.close();
});
