import { test, expect } from '@playwright/test';

// Parcours qui modifie les données : projet « parcours », lancé après les tests de rendu
// (voir playwright.config.js) et remis en état à la fin.
const STATE = 'results/.auth/admin.json';
test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
// Fenêtre haute : toute la liste est visible, le glisser-déposer ne fait pas défiler la page.
test.use({ storageState: STATE, viewport: { width: 1280, height: 2600 } });

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
});
test.afterEach(async () => expect(errors, 'erreurs console / CSP').toEqual([]));

test.describe('parcours d’une photo', () => {
  test.describe.configure({ mode: 'serial' });

  // Restes d'un passage interrompu : supprimés avant de commencer.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ storageState: STATE });
    for (const title of ['Lisière E2E', 'import test']) {
      while (await page.goto(`/admin/photos?q=${encodeURIComponent(title)}`).then(() => page.locator('.plist li').count())) {
        await page.locator('.plist li a.ttl').first().click();
        await page.getByText('Supprimer cette photo').click();
        await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
      }
    }
    await page.goto('/admin/series');
    const leftover = page.locator('.rows li', { has: page.locator('input[value="Série E2E"]') });
    if (await leftover.count()) {
      await leftover.getByText('Supprimer', { exact: true }).click();
      await leftover.getByRole('button', { name: 'Supprimer « Série E2E »' }).click();
    }
    await page.close();
  });

  test('importer, éditer, publier, réordonner, supprimer', async ({ page, context }) => {
    // Import par le formulaire.
    await page.goto('/admin/photos');
    await page.locator('input[type=file]').setInputFiles('fixtures/import-test.jpg');
    await expect(page.locator('[data-drop] span').first()).toHaveText('1 fichier(s) prêt(s) à importer');
    await page.getByRole('button', { name: 'Importer', exact: true }).click();
    await expect(page).toHaveURL(/statut=draft/);
    await expect(page.getByRole('status')).toContainText('1 photo(s) importée(s) en brouillon');
    const row = page.locator('.plist li', { hasText: 'import test' });
    await expect(row).toHaveCount(1);
    await expect(row.locator('.status')).toHaveText('Brouillon');

    // Édition : erreur de validation puis succès.
    await row.locator('a.ttl').click();
    await page.getByLabel('Date').fill('2024-13');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Format AAAA-MM ou AAAA-MM-JJ.')).toBeVisible();
    await page.getByLabel('Titre').fill('Lisière E2E');
    await page.getByLabel('Adresse').fill('');
    await page.getByLabel('Date').fill('2025-09');
    await page.getByLabel('Lieu').fill('Forêt de Chandelais');
    await page.getByLabel('Légende').fill('Test de bout en bout.');
    await page.getByLabel('Publiée').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('status')).toHaveText('Photo enregistrée.');
    const editUrl = page.url();

    // Visible sur le site public, en dernière position.
    const pub = await context.browser().newPage();
    await pub.goto('/photo/lisiere-e2e');
    await expect(pub.locator('.vtext h1')).toHaveText('Lisière E2E');
    await expect(pub.locator('.viewer .mono').first()).toHaveText('13 / 13');
    await expect.poll(() => pub.locator('.vimg img').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);

    // Glisser-déposer : la nouvelle photo passe en tête.
    await page.goto('/admin/photos');
    const items = page.locator('.plist li');
    await items.last().dragTo(items.first());
    await expect(items.first()).toContainText('Lisière E2E');
    await expect(items.first().locator('.handle')).toHaveText('N°01');
    await page.reload();
    await expect(items.first()).toContainText('Lisière E2E');            // enregistré côté serveur
    await pub.goto('/photo/lisiere-e2e');
    await expect(pub.locator('.viewer .mono').first()).toHaveText('01 / 13');

    // Bouton ↓ : retour à l'ordre initial (12 descentes).
    for (let i = 0; i < 12; i++) {
      await page.locator('.plist li', { hasText: 'Lisière E2E' }).getByRole('button', { name: /Descendre/ }).click();
    }
    await expect(items.last()).toContainText('Lisière E2E');
    await expect(items.first()).toContainText('Brume sur la Loire');

    // Suppression avec confirmation dans la page.
    await page.goto(editUrl);
    await page.getByText('Supprimer cette photo').click();
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(page.getByRole('status')).toHaveText('Photo supprimée.');
    await expect(page.locator('.plist li')).toHaveCount(12);
    expect((await pub.goto('/photo/lisiere-e2e')).status()).toBe(404);
    await pub.close();
  });

  test('séries : suppression refusée tant qu’elle contient des photos', async ({ page }) => {
    await page.goto('/admin/series');
    const rue = page.locator('.rows li', { has: page.locator('input[value="Rue"]') });
    await rue.getByText('Supprimer').click();
    await expect(rue.getByText(/Impossible : la série contient encore/)).toBeVisible();
    // Création puis suppression d'une série vide.
    await page.getByLabel('Nouvelle série').fill('Série E2E');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByRole('status')).toHaveText('Série créée.');
    const temp = page.locator('.rows li', { has: page.locator('input[value="Série E2E"]') });
    await temp.getByText('Supprimer', { exact: true }).click();
    await temp.getByRole('button', { name: 'Supprimer « Série E2E »' }).click();
    await expect(page.getByRole('status')).toHaveText('Série supprimée.');
  });

  test('déconnexion', async ({ browser }) => {
    // Nouvelle session pour ne pas détruire celle des autres tests.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('/auth/local?next=/admin');
    await page.getByLabel('Jeton de test').fill(process.env.E2E_LOCAL_AUTH);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/auth\/local/);
    await ctx.close();
  });
});
