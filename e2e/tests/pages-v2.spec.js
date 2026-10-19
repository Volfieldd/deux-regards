import { test, expect } from '@playwright/test';

// Pages v2 sans formulaire d'envoi (À propos, Droits, Mentions légales, Confidentialité, Recherche, Carte, Voyages, page
// introuvable), vues dans la vue v2 : chaque test ouvre sa propre session d'administrateur (connexion locale de test)
// et y ouvre l'aperçu ; les visiteurs et les autres tests gardent la v1. Rien n'est écrit dans les données. La carte et les
// voyages ne sont mesurés que si le serveur en a (jeu de démonstration enrichi) : sinon leur adresse répond par la page
// introuvable, mesurée elle aussi.
let errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`); });
};
test.beforeEach(() => { errors = []; });
test.afterEach(() => { expect(errors, 'erreurs console / CSP').toEqual([]); });

// Une seule connexion par processus de test : la session (et son aperçu de la v2, gardé par le serveur) est reprise par
// chaque test ; les connexions locales sont limitées (AUTH_RATE_LIMIT, 30 par 10 minutes), et toute la suite en ouvre.
let session = null;
async function apercu(browser, info, options = {}) {
  test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent : la vue v2 demande une session d’administrateur');
  if (!session) {
    const login = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
    const lp = await login.newPage();
    await lp.goto('/auth/local?next=%2Fadmin%2Fapparence');
    await lp.getByLabel('Se connecter en tant que').selectOption('julien');
    await lp.getByLabel('Jeton de test').fill(process.env.E2E_LOCAL_AUTH);
    await lp.getByRole('button', { name: 'Se connecter' }).click();
    await expect(lp).toHaveURL(/\/admin\/apparence$/);
    const news = lp.getByRole('dialog', { name: /Nouveau depuis votre dernière visite/ });
    if (await news.isVisible()) await news.getByRole('button', { name: 'C’est noté' }).click();
    await lp.getByRole('button', { name: 'Voir le site en v2' }).click();
    session = await login.storageState();
    await login.close();
  }
  const ctx = await browser.newContext({ ...info.project.use, storageState: session, ...options });
  const page = await ctx.newPage();
  watch(page);
  return { ctx, page };
}

const PAGES = ['/a-propos', '/droits', '/mentions-legales', '/confidentialite', '/recherche', '/recherche?q=brume', '/recherche?q=zzzz', '/carte', '/voyages', '/page-introuvable'];

test.describe('bureau', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'mesures au bureau : projet desktop'));

  test('aucun débordement horizontal à 320, 412, 1032 × 1250, 1376 × 900 et 1440 px, en français et en allemand', async ({ browser }, info) => {
    test.setTimeout(240000);                                                // 5 écrans × 20 pages, sur un hôte chargé
    const { ctx, page } = await apercu(browser, info);
    for (const [width, height] of [[320, 640], [412, 915], [1032, 1250], [1376, 900], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      for (const url of [...PAGES, ...PAGES.map(u => `/de${u}`)]) {
        await page.goto(url);
        await expect(page.locator('link[href*="css/v2/pages.css"]'), `${url} en v2`).toHaveCount(1);
        const debord = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(debord, `${url} à ${width} × ${height}`).toBeLessThanOrEqual(0);
      }
    }
    await ctx.close();
  });

  test('lecture longue : le sommaire mène à chaque partie, le focus suit ; « ↑ Sommaire » au téléphone', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info, { viewport: { width: 1440, height: 900 } });
    await page.goto('/confidentialite');
    const som = page.getByRole('navigation', { name: 'Sur cette page' });
    await expect(som).toBeVisible();
    const links = som.getByRole('link');
    expect(await links.count()).toBeGreaterThan(5);
    await links.nth(4).click();
    const id = decodeURIComponent(new URL(page.url()).hash.slice(1));
    const h = page.locator(`[id="${id}"]`);
    await expect(h).toBeInViewport();
    // Au bureau, le sommaire reste à l'écran (colonne de gauche) ; « ↑ Sommaire » n'y sert pas.
    await expect(som).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Sommaire' }).first()).toBeHidden();
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto('/mentions-legales');
    const haut = page.getByRole('link', { name: 'Sommaire' }).first();
    await expect(haut).toBeVisible();
    await haut.scrollIntoViewIfNeeded();
    await haut.click();
    await expect(page.getByRole('navigation', { name: 'Sur cette page' })).toBeInViewport();
    await ctx.close();
  });

  test('recherche : le même formulaire GET, la saisie réaffichée telle quelle et échappée', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info, { viewport: { width: 1376, height: 900 } });
    await page.goto('/recherche');
    const field = page.getByRole('searchbox', { name: 'Mots-clés' });
    await expect(field).toBeFocused();
    await field.fill('<b>brume</b> & "nuit"');
    await page.getByRole('button', { name: 'Chercher' }).click();
    await expect(page).toHaveURL(/\/recherche\?q=%3Cb%3Ebrume%3C%2Fb%3E\+%26\+%22nuit%22$/);
    await expect(field).toHaveValue('<b>brume</b> & "nuit"');
    await expect(page.getByRole('status')).toContainText('<b>brume</b> & "nuit"');
    await expect(page.locator('main b')).toHaveCount(0);
    // Sans résultat : les séries à parcourir.
    await expect(page.getByRole('heading', { name: 'Ou parcourez les séries' })).toBeVisible();
    await page.goto('/recherche?q=brume');
    await expect(page.getByRole('status')).toContainText(/\d+ photos? pour/);
    await expect(page.locator('.rangees a.vignette').first()).toBeVisible();
    await ctx.close();
  });

  test('page introuvable en v2 : 404, chercher une photo, la galerie, la langue vers l’accueil', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info, { viewport: { width: 1440, height: 900 } });
    const res = await page.goto('/une-adresse-qui-n-existe-pas');
    expect(res.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
    await expect(page.locator('link[href*="css/v2/pages.css"]')).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'Chercher une photo' }).fill('brume');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/recherche\?q=brume$/);
    await page.goto('/une-adresse-qui-n-existe-pas');
    await page.locator('[data-lang-pick] > summary').click();
    await page.getByRole('link', { name: 'Deutsch' }).click();
    await expect(page).toHaveURL(/\/de\/$/);
    await ctx.close();
  });

  test('carte au clavier : zoom, déplacement aux flèches, « Monde » ; aucune vignette hors du cadre n’a le focus', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info, { viewport: { width: 1376, height: 900 } });
    const res = await page.goto('/carte');
    test.skip(res.status() !== 200 || !(await page.locator('[data-pin]').count()), 'aucune photo sur la carte dans ce jeu de données');
    const vb = () => page.locator('[data-carte-svg]').getAttribute('viewBox');
    const start = await vb();
    // Au clavier depuis le lien d'évitement jusqu'à la première vignette.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    let guard = 0;
    while (!(await page.evaluate(() => document.activeElement?.matches('[data-pin]'))) && guard++ < 60) await page.keyboard.press('Tab');
    expect(guard, 'une vignette atteinte au clavier').toBeLessThan(60);
    await page.keyboard.press('+');
    const zoomed = await vb();
    expect(zoomed).not.toBe(start);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(i % 2 ? 'ArrowDown' : 'ArrowRight');
      // Le focus n'est jamais sur un élément caché ni hors du cadre de la carte.
      const ok = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a.matches('[data-pin]')) return a.matches('button') && !a.disabled;
        const r = a.getBoundingClientRect(), c = document.querySelector('[data-carte-vue]').getBoundingClientRect();
        return a.getAttribute('display') !== 'none' && r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom;
      });
      expect(ok, `focus visible après la flèche ${i + 1}`).toBe(true);
    }
    expect(await vb()).not.toBe(zoomed);
    // Les boutons, au clavier aussi.
    await page.getByRole('button', { name: 'Monde' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(vb).toBe('0 0 1000 520');
    await expect(page.getByRole('button', { name: 'Monde' })).toBeDisabled();
    expect(await page.evaluate(() => document.activeElement?.matches('button:not(:disabled)'))).toBe(true);
    await page.getByRole('button', { name: 'Vers l’est' }).click();
    await page.getByRole('button', { name: 'Zoom avant' }).click();
    await page.getByRole('button', { name: 'Vers l’est' }).click();
    expect(await vb()).not.toBe('0 0 1000 520');
    // « ↑ Carte » de chaque lieu ramène à la carte.
    await page.locator('.lieu-haut').first().click();
    await expect(page.locator('#carte')).toBeInViewport();
    await ctx.close();
  });
});

test('sans JavaScript : pages lisibles, sommaire, recherche par le formulaire, carte cadrée sans commandes', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'un seul projet suffit');
  const { ctx, page } = await apercu(browser, info, { javaScriptEnabled: false, viewport: { width: 412, height: 915 } });
  await page.goto('/confidentialite');
  await page.getByRole('navigation', { name: 'Sur cette page' }).getByRole('link').nth(1).click();
  await expect(page).toHaveURL(/#/);
  await page.goto('/recherche');
  await page.getByRole('searchbox', { name: 'Mots-clés' }).fill('brume');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await expect(page).toHaveURL(/\/recherche\?q=brume$/);
  await expect(page.getByRole('status')).toBeVisible();
  await page.locator('summary', { hasText: 'Menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Navigation (téléphone)' })).toBeVisible();
  const res = await page.goto('/carte');
  if (res.status() === 200 && await page.locator('[data-pin]').count()) {
    await expect(page.locator('.carte-outils')).toBeHidden();
    // Sans script, deux villes voisines peuvent se recouvrir : la dernière dessinée est au-dessus.
    await page.locator('[data-pin]').last().click();
    await expect(page).toHaveURL(/#lieu-\d+$/);
  }
  await ctx.close();
});

// Carnets (maquettes MQ-11 et MQ-12) : la liste et le premier billet, dans la même session d'aperçu ; ignoré si le serveur
// n'a aucun billet publié (le jeu de démonstration n'en a pas : docs/wiki/Tests.md).
async function carnet(browser, info, options = {}) {
  const { ctx, page } = await apercu(browser, info, options);
  const r = await page.goto('/carnet');
  test.skip(r.status() === 404, 'aucun billet publié sur ce serveur');
  return { ctx, page, billet: await page.locator('.billet-e-titre a').first().getAttribute('href') };
}

test.describe('Carnets, bureau', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'mesures au bureau : projet desktop'));

  test('liste et billet : aucun débordement horizontal à 320, 412, 1032 × 1250, 1376 × 900 et 1440 px, en français et en allemand', async ({ browser }, info) => {
    test.setTimeout(240000);
    const { ctx, page, billet } = await carnet(browser, info);
    const pages = ['/carnet', billet];
    for (const [width, height] of [[320, 640], [412, 915], [1032, 1250], [1376, 900], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      for (const url of [...pages, ...pages.map(u => `/de${u}`)]) {
        await page.goto(url);
        await expect(page.locator('link[href*="css/v2/carnet.css"]'), `${url} en v2`).toHaveCount(1);
        const debord = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(debord, `${url} à ${width} × ${height}`).toBeLessThanOrEqual(0);
      }
    }
    await ctx.close();
  });

  test('billet : sommaire, photos qui mènent à la visionneuse dans le contexte du billet, retour à la photo dans le texte ; une seule image prioritaire', async ({ browser }, info) => {
    const { ctx, page, billet } = await carnet(browser, info, { viewport: { width: 1440, height: 900 } });
    await page.goto(billet);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('img[fetchpriority="high"]')).toHaveCount(1);
    const link = page.locator('.billet-ouv-photo a[href*="?carnet="], .billet a[href*="?carnet="]').first();
    test.skip(!(await link.count()), 'billet sans photo dans le texte');
    await link.click();
    await expect(page).toHaveURL(/\/photo\/[^?]+\?carnet=/);
    await expect(page.locator('.vis-pos')).toContainText('/');
    // Sans script, le retour mène à la photo dans le texte (#photo-n) ; avec, la visionneuse revient en arrière dans
    // l'historique (site.js) : la même page, au même endroit.
    const back = await page.locator('.sh-retour').getAttribute('href');
    expect(back).toMatch(/\/carnet\/[^#]+#photo-\d+$/);
    await page.locator('.sh-retour').click();
    await expect(page).toHaveURL(new RegExp(`${billet}(#photo-\\d+)?$`));
    await expect(page.locator(`[id="${back.split('#')[1]}"]`)).toBeInViewport();
    await ctx.close();
  });

  test('sans JavaScript : filtres en liens, billet lisible, menu en <details>', async ({ browser }, info) => {
    const { ctx, page, billet } = await carnet(browser, info, { javaScriptEnabled: false, viewport: { width: 412, height: 915 } });
    const filtre = page.locator('.filtres a.filtre').nth(1);
    if (await filtre.count()) {
      const href = await filtre.getAttribute('href');
      await filtre.click();
      await expect(page).toHaveURL(new RegExp(href.replace(/[?]/g, '\\?')));
      await expect(page.locator('.filtres a[aria-current="page"]').first()).toBeVisible();
    }
    await page.goto(billet);
    await expect(page.locator('.billet p').first()).toBeVisible();
    await page.getByText('Menu', { exact: true }).first().click();
    await expect(page.locator('.sh-panneau a[href$="/carnet"]')).toBeVisible();
    await ctx.close();
  });

});

test.describe('Carnets, téléphone', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'mobile', 'Pixel 7 : projet mobile'));

  test('Pixel 7 : liste et billet sans débordement, couverture verticale à côté du titre, cibles de 44 px dans l’en-tête', async ({ browser }, info) => {
    const { ctx, page, billet } = await carnet(browser, info);
    for (const url of ['/carnet', billet, '/de/carnet']) {
      await page.goto(url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), url).toBeLessThanOrEqual(0);
    }
    await page.goto('/carnet');
    const cote = page.locator('.billet-e--cote').first();
    if (await cote.count()) {
      const img = await cote.locator('img').boundingBox(), title = await cote.locator('.billet-e-titre').boundingBox();
      expect(title.x).toBeGreaterThan(img.x + img.width - 1);
    }
    for (const el of await page.locator('.sh-bar a, .sh-bar summary').all()) {
      const b = await el.boundingBox();
      if (b && b.width) expect(b.height, await el.innerText()).toBeGreaterThanOrEqual(44);
    }
    await ctx.close();
  });
});
