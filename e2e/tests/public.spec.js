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

test('accueil : ouverture, regards, séries, photos chargées', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('.hero-item.on img')).toBeVisible();
  // La première diapositive est la première photo de l'ouverture (quel que soit son contenu).
  const first = (await page.locator('.cap h1').first().textContent()).trim();
  await expect(page.locator('.cap.on h1')).toHaveText(first);
  const total = Number(/\/ (\d+) vues/.exec(await page.locator('#galerie > span.mono').textContent())[1]);
  await expect(page.locator('#grid .tile')).toHaveCount(total);
  // Chaque image de la grille finit par se charger (lazy-loading compris).
  for (const img of await page.locator('#grid .tile img').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
  }
  // Police du titre (celle du thème) auto-hébergée et effectivement chargée.
  const font = await page.locator('.cap.on h1').evaluate(h => { const s = getComputedStyle(h); return `${s.fontStyle} ${s.fontWeight} 40px ${s.fontFamily.split(',')[0]}`; });
  expect(await page.evaluate(f => document.fonts.check(f), font), font).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `results/accueil-${info.project.name}.png`, fullPage: true });
});

test('ouverture : défilement, vignettes, pause, suspension sous le focus', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const pause = page.locator('[data-pause]');
  await expect(pause).toBeInViewport({ ratio: 1 });
  // Aucune vignette sous le bouton (la bande s'arrête avant lui).
  const p = await pause.boundingBox();
  const strip = await page.locator('.strip').boundingBox();
  expect(strip.x + strip.width).toBeLessThanOrEqual(p.x);

  const titles = await page.locator('.cap h1').allTextContents();
  const current = page.locator('.cap.on h1');
  const leave = async () => {                        // pointeur et focus hors de l'ouverture
    await page.locator('#regards').hover();
    await page.evaluate(() => document.activeElement?.blur());
  };
  await expect(current).toHaveText(titles[0]);
  await page.clock.runFor(6100);
  await expect(current).toHaveText(titles[1]);       // défilement automatique

  await page.locator('.strip button[data-h="2"]').click();
  await expect(current).toHaveText(titles[2]);
  await pause.click();
  await expect(pause).toHaveText('Lecture');
  await leave();
  await page.clock.runFor(13000);
  await expect(current).toHaveText(titles[2]);       // en pause : n'avance plus

  await pause.click();
  await expect(pause).toHaveText('Pause');
  await leave();
  await expect(page.locator('.bar')).toHaveClass(/run/);
  await page.clock.runFor(6100);
  await expect(current).toHaveText(titles[3 % titles.length]);

  // Focus clavier sur « Voir la photo » : le lien ne disparaît pas sous le focus.
  await page.locator('.cap.on .open').focus();
  await page.clock.runFor(13000);
  await expect(page.locator('.cap.on .open')).toBeFocused();
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
  await expect(page).toHaveURL(/\/auteur\/julien$/);                 // vrai retour arrière : la galerie telle qu'on l'a quittée
});

test('page photo : swipe sur mobile', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, 'mobile uniquement');
  await page.goto('/');
  await page.locator('#grid .tile').first().click();
  // Le serveur peut contenir plus que les 12 photos de démonstration.
  await expect(page.locator('.viewer .mono').first()).toHaveText(/^01 \/ \d+$/);
  const total = (await page.locator('.viewer .mono').first().textContent()).split(' / ')[1];
  const box = await page.locator('.vimg').boundingBox();
  const y = box.y + box.height / 2;
  await page.locator('.vimg').dispatchEvent('touchstart', { touches: [{ identifier: 0, clientX: box.x + box.width - 20, clientY: y }] });
  await page.locator('.vimg').dispatchEvent('touchend', { changedTouches: [{ identifier: 0, clientX: box.x + 20, clientY: y }] });
  await expect(page.locator('.viewer .mono').first()).toHaveText(`02 / ${total}`);
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
    // Toutes les photos publiées sont dans la page (au moins les 12 de démonstration).
    const all = await page.locator('#grid .tile').count();
    expect(all).toBeGreaterThanOrEqual(12);
    await expect(page.locator('[data-pause]')).toBeHidden();
    await page.locator('.who a', { hasText: 'Sébastien' }).click();
    await expect(page).toHaveURL(/\/auteur\/sebastien/);
    const his = await page.locator('#grid .tile').count();
    expect(his).toBeGreaterThanOrEqual(6);
    expect(his).toBeLessThan(all);
  });
});

test('droits d’utilisation : page et lien en pied de page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Droits d’utilisation' }).click();
  await expect(page).toHaveURL(/\/droits$/);
  await expect(page.locator('h1')).toHaveText('Droits d’utilisation');
  await expect(page.getByText(/protégées par le droit d’auteur/)).toBeVisible();
});

// Audit automatique d'accessibilité (axe-core, WCAG 2.2 A/AA) des pages publiques.
test('accessibilité du site : aucune violation sérieuse', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await page.emulateMedia({ reducedMotion: 'reduce' });   // mesure l'état final, pas une animation d'apparition
  await page.goto('/');
  const photo = await page.locator('#grid .tile').first().getAttribute('href');
  for (const url of ['/', '/a-propos', '/droits', photo, '/page-inexistante', '/bonjour', '/en/bonjour']) {
    await page.goto(url);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const serious = violations.filter(v => ['serious', 'critical'].includes(v.impact));
    expect(serious.map(v => `${url} ${v.id} : ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  }
});

test('filtre au clavier : focus conservé et résultat annoncé', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('.who a', { hasText: 'Julien' });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/auteur\/julien$/);
  await expect(page.locator('[data-announce]')).toContainText('par Julien');
  expect(await page.evaluate(() => document.activeElement?.textContent)).toContain('Julien');
});

test('retour arrière depuis une ancre : contenu et adresse restent cohérents', async ({ page }) => {
  await page.goto('/');
  await page.locator('header nav a', { hasText: 'Séries' }).first().click();
  await expect(page).toHaveURL(/#series$/);
  const total = await page.locator('#grid .tile').count();
  await page.locator('.who a', { hasText: 'Julien' }).click();
  await expect(page).toHaveURL(/\/auteur\/julien$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/#series$/);
  await expect(page.locator('#grid .tile')).toHaveCount(total);
});

test('retour à la série après une photo : position conservée, même après avoir parcouru des photos', async ({ page }) => {
  const visible = (slug) => page.evaluate(s => {
    const a = document.querySelector(`#grid a.tile[href^="/photo/${s}"]`);
    const b = a.getBoundingClientRect();
    return b.top >= 0 && b.bottom <= innerHeight;
  }, slug);
  const open = async () => {
    await page.goto('/serie/paysage');
    const tile = page.locator('#grid a.tile').last();
    await tile.scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => scrollY);
    expect(y).toBeGreaterThan(300);                                   // la série est longue : on est bien descendu
    await tile.click();
    await page.waitForURL(/\/photo\//);
    return y;
  };
  // Fermer : la page de la série revient là où on l'avait quittée (pas en haut de la galerie).
  const y = await open();
  await page.locator('.viewer a.back').click();
  await page.waitForURL(/\/serie\/paysage$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y - 120);
  // Deux photos plus loin, puis le bouton Retour du navigateur : un seul retour, la dernière photo vue à l'écran.
  await open();
  for (let i = 0; i < 2; i++) { const u = page.url(); await page.keyboard.press('ArrowLeft'); await page.waitForURL(x => x.href !== u); }
  const slug = new URL(page.url()).pathname.split('/').pop();
  await page.goBack();
  await page.waitForURL(/\/serie\/paysage$/);
  await expect.poll(() => visible(slug)).toBe(true);
});
