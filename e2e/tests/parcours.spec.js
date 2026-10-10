import { test, expect } from '@playwright/test';

// Parcours qui modifie les données : projet « parcours », lancé après les tests de rendu
// (voir playwright.config.js). Il ne suppose rien du contenu du site, nettoie les restes d'un
// passage interrompu et restaure à l'identique les réglages d'images trouvés en arrivant.
const STATE = 'results/.auth/admin.json';
test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
test.skip(process.env.E2E_ALLOW_WRITES !== '1', 'E2E_ALLOW_WRITES=1 requis : ce parcours modifie les données du serveur');

const idle = page => expect.poll(async () => (await page.request.get('/admin/images/etat').then(r => r.json())).running, { timeout: 180_000 }).toBe(false);
let imageSettings = null;          // formulaire « Filigrane & EXIF » tel que trouvé (restauré à la fin)
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
    test.setTimeout(180_000);
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
    await page.goto('/admin/images');
    imageSettings = await page.locator('#images-form').evaluate(f => Object.fromEntries(new FormData(f)));
    await page.close();
  });

  // Réglages d'images restaurés même si un test a échoué.
  test.afterAll(async ({ browser }) => {
    test.setTimeout(240_000);
    if (!imageSettings) return;
    const page = await browser.newPage({ storageState: STATE });
    await page.goto('/admin/images');
    const csrf = await page.locator('#images-form input[name=_csrf]').inputValue();
    await page.request.post('/admin/images', { form: { ...imageSettings, _csrf: csrf } });
    await idle(page);
    await page.close();
  });

  test('importer, éditer, publier, réordonner, supprimer', async ({ page, context }) => {
    // Import par le formulaire.
    await page.goto('/admin/photos');
    const items = page.locator('.plist li');
    const initial = await items.count();
    const firstTitle = (await items.first().locator('a.ttl').textContent()).trim();
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
    const [last, total] = (await pub.locator('.viewer .mono').first().textContent()).split(' / ');
    expect(last).toBe(total);
    await expect.poll(() => pub.locator('.vimg img').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);

    // Glisser-déposer : la nouvelle photo passe en tête.
    await page.goto('/admin/photos');
    await expect(items).toHaveCount(initial + 1);
    await items.last().dragTo(items.first(), { targetPosition: { x: 20, y: 4 } });
    await expect(items.first()).toContainText('Lisière E2E');
    await expect(items.first().locator('.handle')).toHaveText('N°01');
    await page.reload();
    await expect(items.first()).toContainText('Lisière E2E');            // enregistré côté serveur
    await pub.goto('/photo/lisiere-e2e');
    await expect(pub.locator('.viewer .mono').first()).toHaveText(`01 / ${total}`);

    // Glisser sur la moitié basse de la dernière ligne : dépôt après elle (dernière place).
    await items.first().dragTo(items.last(), { targetPosition: { x: 20, y: 60 } });
    await expect(items.last()).toContainText('Lisière E2E');
    await expect(items.last().getByRole('button', { name: /Descendre/ })).toBeDisabled();
    await expect(items.first().getByRole('button', { name: /Monter/ })).toBeDisabled();

    // Boutons ↑ ↓ (alternative clavier) : remonter en tête puis redescendre en dernière place.
    for (let i = 0; i < initial; i++) {
      await page.locator('.plist li', { hasText: 'Lisière E2E' }).getByRole('button', { name: /Monter/ }).click();
    }
    await expect(items.first()).toContainText('Lisière E2E');
    for (let i = 0; i < initial; i++) {
      await page.locator('.plist li', { hasText: 'Lisière E2E' }).getByRole('button', { name: /Descendre/ }).click();
    }
    await expect(items.last()).toContainText('Lisière E2E');
    await expect(items.first()).toContainText(firstTitle);

    // Suppression avec confirmation dans la page.
    await page.goto(editUrl);
    await page.getByText('Supprimer cette photo').click();
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(page.getByRole('status')).toHaveText('Photo supprimée.');
    await expect(page.locator('.plist li')).toHaveCount(initial);
    expect((await pub.goto('/photo/lisiere-e2e')).status()).toBe(404);
    await pub.close();
  });

  test('séries : suppression refusée tant qu’elle contient des photos', async ({ page }) => {
    await page.goto('/admin/series');
    const full = page.locator('.rows li').filter({ has: page.locator('.mono', { hasText: /^[1-9]\d* photo/ }) }).first();
    await full.getByText('Supprimer', { exact: true }).click();
    await expect(full.getByText(/Impossible : la série contient encore/)).toBeVisible();
    // Création puis suppression d'une série vide.
    await page.getByLabel('Nouvelle série').fill('Série E2E');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByRole('status')).toHaveText('Série créée.');
    const temp = page.locator('.rows li', { has: page.locator('input[value="Série E2E"]') });
    await temp.getByText('Supprimer', { exact: true }).click();
    await temp.getByRole('button', { name: 'Supprimer « Série E2E »' }).click();
    await expect(page.getByRole('status')).toHaveText('Série supprimée.');
  });

  test('filigrane : aperçu, application au site, retour à l’état initial', async ({ page, context }, info) => {
    test.setTimeout(300_000);           // deux recalculs complets des images (AVIF)
    await page.goto('/admin/images');
    await expect(page.locator('h1')).toHaveText('Filigrane et métadonnées');
    await expect.poll(() => page.locator('.preview img').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);

    // Aperçu sans enregistrer : nouvel onglet avec l'image, réglages inchangés.
    await page.getByRole('textbox', { name: /^Texte/ }).fill('© {auteur} · E2E');
    await page.getByLabel('Position').selectOption('mosaique');
    const [preview] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'Aperçu sans enregistrer' }).click()]);
    await preview.waitForLoadState();
    expect(await preview.evaluate(() => document.contentType)).toBe('image/webp');
    await preview.close();

    // Enregistrer : les images publiques changent de nom (empreinte) une fois la mise à jour finie.
    const home = await page.request.get('/').then(r => r.text());
    const photoUrl = /href="(\/photo\/[a-z0-9-]+)"/.exec(home)[1];
    const before = await page.request.get(photoUrl).then(r => r.text());
    const src = html => /\/media\/([\w-]+)-\d+\.webp/.exec(html)[1];
    await page.getByLabel('Ajouter un filigrane aux images du site').check();
    await page.getByLabel('Position').selectOption('bas-droite');
    await page.getByRole('button', { name: 'Enregistrer et mettre à jour les images' }).click();
    await expect(page.locator('.flash').first()).toContainText(/Réglages enregistrés|Mise à jour des images/);
    await idle(page);
    await page.goto(photoUrl);
    expect(src(await page.content())).not.toBe(src(before));
    await expect.poll(() => page.locator('.vimg img').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: `results/photo-filigrane-${info.project.name}.png` });

    // Retour aux réglages trouvés en arrivant : mêmes images, mêmes adresses qu'avant.
    await page.goto('/admin/images');
    const csrf = await page.locator('#images-form input[name=_csrf]').inputValue();
    await page.request.post('/admin/images', { form: { ...imageSettings, _csrf: csrf } });
    await idle(page);
    const after = await page.request.get(photoUrl).then(r => r.text());
    expect(src(after)).toBe(src(before));
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
