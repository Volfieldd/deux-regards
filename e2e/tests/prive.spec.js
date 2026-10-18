import { test, expect } from '@playwright/test';

// Galeries privées (MQ-16, MQ-17, MQ-18 ; annexe de sécurité, § 6, parcours de l'invité). Chaque test crée sa galerie
// et son accès dans l'admin (connexion locale de test), puis ouvre la galerie dans un navigateur neuf, sans session :
// celui de l'invité. Écrit dans la base : seulement avec E2E_ALLOW_WRITES=1 et E2E_LOCAL_AUTH (serveur jetable).
let errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`); });
};
test.beforeEach(() => { errors = []; });
test.afterEach(() => { expect(errors, 'erreurs console / CSP').toEqual([]); });
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

async function admin(browser, info) {
  test.skip(!process.env.E2E_LOCAL_AUTH || process.env.E2E_ALLOW_WRITES !== '1', 'E2E_LOCAL_AUTH et E2E_ALLOW_WRITES=1 : crée une galerie et un accès');
  // La session de auth.setup.js (une connexion de moins : la limite de 30 connexions par 10 minutes et par adresse sert
  // à toute la suite).
  const ctx = await browser.newContext({ ...info.project.use, storageState: 'results/.auth/admin.json' });
  const page = await ctx.newPage();
  await page.goto('/admin/galeries');
  await expect(page).toHaveURL(/\/admin\/galeries$/);
  return { ctx, page };
}
// Parcours de l'équipe (MQ-18) : nouvelle galerie, photos, ouverture, nouvel accès ; renvoie le lien et le mot de passe.
async function prepare(page, { title = `Galerie e2e ${Date.now()}`, rights = ['Choisir ses favoris'] } = {}) {
  await page.getByRole('link', { name: 'Nouvelle galerie' }).click();
  await page.getByLabel('Titre de la galerie').fill(title);
  await page.getByLabel('Titre en allemand').fill(`${title} (de)`);
  await page.getByLabel('Fermeture de la galerie').fill(day(60));
  await page.getByRole('button', { name: 'Créer la galerie' }).click();
  await expect(page).toHaveURL(/\/admin\/galeries\/\d+\/photos$/);
  const boxes = page.locator('.gp-candidats input[type="checkbox"]');
  for (let i = 0; i < 4; i++) await boxes.nth(i).check();
  await page.getByRole('button', { name: 'Ajouter les photos cochées' }).click();
  await page.getByRole('button', { name: 'Ouvrir la galerie' }).first().click();
  await page.getByRole('link', { name: 'Nouvel accès' }).first().click();
  await page.getByLabel('Nom de la personne').fill('Lucie Exemple, Éditions du Fleuve');
  for (const label of ['Choisir ses favoris', 'Télécharger les photos en 2 048 px']) {
    const box = page.getByLabel(label);
    if (rights.includes(label)) await box.check(); else await box.uncheck();
  }
  await page.getByRole('button', { name: 'Créer l’accès' }).click();
  await expect(page).toHaveURL(/\/acces\/\d+\/secrets$/);
  const password = (await page.locator('output.mdp').textContent()).trim();
  const link = (await page.locator('#lien-v').textContent()).trim();
  const back = page.url().replace(/\/secrets$/, '');
  return { title, password, link, back, path: new URL(link).pathname };
}
async function guest(browser, info, options = {}) {
  const ctx = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] }, ...options });
  const page = await ctx.newPage();
  watch(page);
  return { ctx, page };
}

test('parcours : l’équipe crée l’accès, l’invitée entre (refus, puis saisie tolérante), choisit, envoie ; l’équipe voit sa sélection', async ({ browser }, info) => {
  test.setTimeout(120000);
  const a = await admin(browser, info);
  const g = await prepare(a.page);
  const { ctx, page } = await guest(browser, info);
  await page.goto(g.path);
  await expect(page).toHaveTitle(/^Galerie privée/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Galerie privée');
  await expect(page.getByText(g.title)).toHaveCount(0);                                  // neutre jusqu'au mot de passe
  await page.getByLabel('Mot de passe').fill('AAAA-BBBB-CCCC');
  await page.getByRole('button', { name: 'Ouvrir la galerie' }).click();
  await expect(page.getByText(/ce mot de passe ne correspond pas/)).toBeVisible();
  await expect(page.getByLabel('Mot de passe')).toBeFocused();
  await expect(page.getByLabel('Mot de passe')).toHaveValue('');
  // Afficher (avec script) : une vraie bascule.
  await page.getByLabel('Mot de passe').fill(g.password.toUpperCase());
  await page.getByRole('button', { name: /Afficher/ }).click();
  await expect(page.getByLabel('Mot de passe')).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: /Afficher/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Ouvrir la galerie' }).click();
  await expect(page).toHaveURL(/\/prive\/[A-Za-z0-9]{12}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(g.title);
  await expect(page.getByText('Galerie de Lucie')).toBeVisible();
  const star = page.locator('.fav button').nth(1);
  await star.click();
  await expect(page).toHaveURL(/#p2$/);
  await expect(page.locator('.fav button').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'Vos favoris 1' })).toBeVisible();
  await page.getByRole('button', { name: /Envoyer ma sélection/ }).click();
  await expect(page.getByText(/Sélection envoyée à/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reprendre ma sélection' })).toBeVisible();
  // La photo, dans la visionneuse compacte : on reste dans la galerie.
  await page.locator('.vignette').first().click();
  await expect(page.getByText('1 / 4')).toBeVisible();
  await expect(page.locator('a[href^="http"]')).toHaveCount(0);
  // Côté équipe : la sélection, l'activité.
  await a.page.goto(g.back);
  await expect(a.page.getByRole('heading', { name: /Sa sélection · 1 favori/ })).toBeVisible();
  await expect(a.page.getByText('Mot de passe refusé.')).toBeVisible();
  await expect(a.page.getByText('Mot de passe accepté.')).toBeVisible();
  await ctx.close(); await a.ctx.close();
});

test('sans JavaScript : pas de bouton « Afficher », mot de passe, favori, envoi et « Quitter » par des formulaires', async ({ browser }, info) => {
  test.setTimeout(120000);
  const a = await admin(browser, info);
  const g = await prepare(a.page);
  const { ctx, page } = await guest(browser, info, { javaScriptEnabled: false });
  await page.goto(g.path);
  await expect(page.getByRole('button', { name: /Afficher/ })).toBeHidden();
  await page.getByLabel('Mot de passe').fill(g.password);
  await page.getByLabel('Se souvenir de cet appareil pendant 30 jours').check();
  await page.getByRole('button', { name: 'Ouvrir la galerie' }).click();
  await expect(page).toHaveURL(/\/prive\//);
  await page.locator('.fav button').first().click();
  await expect(page.locator('.fav button').first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: /Vos favoris/ }).click();
  await expect(page.locator('.rangees > li')).toHaveCount(1);
  // La langue, par un formulaire POST (le <details> s'ouvre sans script).
  await page.locator('.lang-pick summary').click();
  await page.getByRole('button', { name: 'Deutsch' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.getByRole('button', { name: /Galerie verlassen|Verlassen/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Sie haben die Galerie verlassen.' })).toBeVisible();
  await ctx.close(); await a.ctx.close();
});

test('révocation : l’équipe révoque, la page suivante de l’invitée dit que l’accès n’est plus valable ; le lien répond 410', async ({ browser }, info) => {
  test.setTimeout(120000);
  const a = await admin(browser, info);
  const g = await prepare(a.page);
  const { ctx, page } = await guest(browser, info);
  await page.goto(g.path);
  await page.getByLabel('Mot de passe').fill(g.password);
  await page.getByRole('button', { name: 'Ouvrir la galerie' }).click();
  const gallery = page.url();
  await a.page.goto(g.back);
  await a.page.getByRole('link', { name: 'Révoquer l’accès…' }).click();
  await expect(a.page.getByRole('heading', { name: /Révoquer l’accès de Lucie Exemple/ })).toBeVisible();
  await a.page.getByRole('button', { name: /Révoquer l’accès de Lucie/ }).click();
  await expect(a.page.getByText(/révoqué/).first()).toBeVisible();
  const res = await page.goto(gallery);
  expect(res.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Cet accès n’est plus valable.' })).toBeVisible();
  const again = await page.goto(g.path);
  expect(again.status()).toBe(410);
  await ctx.close(); await a.ctx.close();
});

test('aucun débordement horizontal à 320, 412, 1032 × 1250, 1376 × 900 et 1440 px, en allemand aussi : page du lien (refus), galerie, photo, admin', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'tailles d’écran réglées par le test : projet desktop');
  test.setTimeout(180000);
  const a = await admin(browser, info);
  const g = await prepare(a.page, { rights: ['Choisir ses favoris', 'Télécharger les photos en 2 048 px'] });
  const SIZES = [[320, 640], [412, 915], [1032, 1250], [1376, 900], [1440, 900]];
  const measure = async (page, what) => {
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${what} à ${width} × ${height}`).toBeLessThanOrEqual(0);
    }
  };
  const { ctx, page } = await guest(browser, info);
  await page.goto(g.path);
  await page.getByLabel('Mot de passe').fill('mauvais');
  await page.getByRole('button', { name: 'Ouvrir la galerie' }).click();
  await measure(page, 'page du lien, en erreur');
  await page.getByLabel('Mot de passe').fill(g.password);
  await page.getByRole('button', { name: 'Ouvrir la galerie' }).click();
  await measure(page, 'galerie');
  const gallery = page.url();
  await page.goto(`${gallery}/photo/2`);
  await measure(page, 'photo');
  await page.locator('.lang-pick summary').click();
  await page.getByRole('button', { name: 'Deutsch' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await measure(page, 'photo en allemand');
  await page.goto(gallery);
  await measure(page, 'galerie en allemand');
  // Admin : la fiche de l'accès, le nouvel accès, la liste.
  for (const url of [g.back, g.back.replace(/\/acces\/\d+$/, '/acces/nouveau'), '/admin/galeries']) {
    await a.page.goto(url);
    await measure(a.page, `admin ${url}`);
  }
  await ctx.close(); await a.ctx.close();
});
