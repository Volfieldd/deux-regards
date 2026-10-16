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
      while (await page.goto(`/admin/photos?vue=liste&q=${encodeURIComponent(title)}`).then(() => page.locator('.plist li').count())) {
        await page.locator('.plist li a.ttl').first().click();
        await page.getByText('Supprimer cette photo').click();
        await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
      }
    }
    await page.goto('/admin/series');
    const leftover = page.locator('.scard[data-id]').filter({ has: page.locator('.title', { hasText: 'Série E2E' }) });
    if (await leftover.count()) {
      await leftover.locator('summary[aria-label^="Plus d’actions"]').click();
      await leftover.locator('.danger > summary').click();
      await page.locator('dialog[open]').getByRole('button', { name: /^Supprimer|^Déplacer/ }).click();
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
    test.setTimeout(240_000);          // traitement de l'import, puis une page rechargée par déplacement au menu ⋯
    // Import : vérification, envoi, traitement suivi, puis page « Compléter et publier ».
    await page.goto('/admin/photos?vue=liste');
    const items = page.locator('.plist li');
    const initial = await items.count();
    const firstTitle = (await items.first().locator('a.ttl').textContent()).trim();
    await page.goto('/admin/photos');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('link', { name: '＋ Importer des photos' }).click()]);
    await chooser.setFiles('fixtures/import-test.jpg');                 // l'envoi part aussitôt
    await expect(page.locator('[data-sum-title]')).toHaveText('1 photo prête sur 1', { timeout: 120_000 });
    // Planche : la photo est arrivée, développée, et sélectionnée ; l'inspecteur propose son titre.
    const tile = page.locator('.contact .tile', { hasText: 'import test' });
    await expect(tile).toBeVisible();
    await expect(tile).not.toHaveClass(/developing/);
    await expect(page.locator('[data-inspector] [data-one-field=title]')).toHaveValue('import test');
    await page.getByRole('link', { name: 'Compléter et publier la photo →' }).click();
    await expect(page.locator('h1')).toHaveText('Compléter et publier');
    await expect(page.locator('input[data-field=title]')).toHaveValue('import test');
    await expect(page.getByText('Titre provisoire (nom du fichier)')).toBeVisible();
    await page.goto('/admin/photos?statut=draft&vue=liste');
    const row = page.locator('.plist li', { hasText: 'import test' });
    await expect(row).toHaveCount(1);
    await expect(row.locator('.st')).toContainText('Brouillon');

    // Édition : erreur de validation puis succès.
    await row.locator('a.ttl').click();
    await page.getByLabel('Date').fill('2024-13');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText(/Date non comprise/)).toBeVisible();
    await page.getByLabel('Titre').fill('Lisière E2E');
    await page.getByLabel('Adresse').fill('');
    await page.getByLabel('Date').fill('sept. 2025');
    await page.getByLabel('Lieu').fill('Forêt de Chandelais');
    await page.getByLabel('Légende').fill('Test de bout en bout.');
    await page.getByLabel('Publiée').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Photo enregistrée.' })).toHaveText('Photo enregistrée.');
    const editUrl = page.url();

    // Visible sur le site public, en dernière position.
    const pub = await context.browser().newPage();
    await pub.goto('/photo/lisiere-e2e');
    await expect(pub.locator('.vtext h1')).toHaveText('Lisière E2E');
    const [last, total] = (await pub.locator('.viewer .mono').first().textContent()).split(' / ');
    expect(last).toBe(total);
    await expect.poll(() => pub.locator('.vimg img').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);

    // Glisser-déposer : la nouvelle photo passe en tête.
    await page.goto('/admin/photos?vue=liste');
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
    await page.reload();
    await expect(items.last()).toContainText('Lisière E2E');
    const menuOf = li => { const m = li.locator('details.menu'); return { open: () => m.locator('summary').click(), item: name => m.getByRole('button', { name }) }; };
    await menuOf(items.last()).open();
    await expect(menuOf(items.last()).item('Descendre d’une place')).toHaveCount(0);
    await expect(menuOf(items.last()).item('Monter d’une place')).toBeVisible();
    await page.keyboard.press('Escape');                                   // Échap referme le menu
    await expect(items.last().locator('details.menu')).not.toHaveAttribute('open', '');

    // Menu ⋯ (alternative clavier) : remonter en tête puis redescendre en dernière place.
    for (let i = 0; i < initial; i++) {
      const li = page.locator('.plist li', { hasText: 'Lisière E2E' });
      await menuOf(li).open();
      await Promise.all([page.waitForEvent('load'), menuOf(li).item('Monter d’une place').click()]);
    }
    await expect(items.first()).toContainText('Lisière E2E');
    for (let i = 0; i < initial; i++) {
      const li = page.locator('.plist li', { hasText: 'Lisière E2E' });
      await menuOf(li).open();
      await Promise.all([page.waitForEvent('load'), menuOf(li).item('Descendre d’une place').click()]);
    }
    await expect(items.last()).toContainText('Lisière E2E');
    await expect(items.first()).toContainText(firstTitle);

    // Suppression avec confirmation dans la page.
    await page.goto(editUrl);
    await page.getByText('Supprimer cette photo').click();
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(page.locator('.flash[role=status]')).toHaveText('Photo supprimée.');
    await expect(page.locator('.contact li')).toHaveCount(initial);
    expect((await pub.goto('/photo/lisiere-e2e')).status()).toBe(404);
    await pub.close();
  });

  test('séries : création en tête, ordre au clavier, suppression qui déplace les photos', async ({ page }) => {
    await page.goto('/admin/series');
    const cards = page.locator('.scard[data-id]');
    const names = () => cards.locator('.title').allTextContents();
    const before = await names();
    // Création : la nouvelle série prend la première place.
    await page.getByRole('link', { name: '＋ Nouvelle série' }).click();
    await page.keyboard.type('Série E2E');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').first()).toHaveText('Série « Série E2E » créée.');
    expect(await names()).toEqual(['Série E2E', ...before]);
    // Clavier sur la poignée : reculer de deux places, enregistré côté serveur.
    await cards.first().locator('[data-grip]').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-toast]')).toContainText('« Série E2E » : place 3');
    await page.reload();
    expect((await names())[2]).toBe('Série E2E');
    // Série non vide : la fenêtre de suppression propose de déplacer ses photos (annulée ici).
    const full = cards.filter({ hasText: /[1-9]\d* photos?/ }).first();
    await full.locator('summary[aria-label^="Plus d’actions"]').click();
    await full.locator('.danger > summary').click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByText(/Elles ne seront pas supprimées/)).toBeVisible();
    await expect(dialog.getByLabel('Déplacer vers')).toBeVisible();
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toHaveCount(0);
    // Série vide : suppression simple.
    const temp = cards.filter({ has: page.locator('.title', { hasText: 'Série E2E' }) });
    await temp.locator('summary[aria-label^="Plus d’actions"]').click();
    await temp.locator('.danger > summary').click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Supprimer « Série E2E »' }).click();
    await expect(page.getByRole('status').first()).toHaveText('Série « Série E2E » supprimée.');
    expect(await names()).toEqual(before);
  });

  test('photothèque : modifier dans l’inspecteur, annuler (⌘Z), classer en glissant vers une série', async ({ page }) => {
    await page.goto('/admin/photos');
    const data = () => page.evaluate(() => JSON.parse(document.getElementById('photos-data').textContent));
    const first = (await data())[0];
    const tile = page.locator(`#photo-${first.id}`);
    const insp = page.locator('[data-inspector]');
    await tile.click();
    const title = insp.locator('[data-one-field=title]');
    await expect(title).toHaveValue(first.title);
    await title.fill('Titre E2E');
    await title.press('Enter');
    await expect(page.locator('[data-toast]')).toContainText('« Titre E2E » enregistrée');
    await expect(tile.locator('.ttl')).toHaveText('Titre E2E');
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-toast]')).toContainText('Modification annulée.');
    await page.reload();
    expect((await data())[0].title).toBe(first.title);                       // annulé côté serveur

    // Glisser la photo sur une autre série de la barre latérale, puis « Annuler » dans le message.
    const target = page.locator('[data-drop-series]').filter({ hasNotText: first.category }).first();
    const targetName = await target.getAttribute('data-series-name');
    await page.locator(`#photo-${first.id}`).dragTo(target);
    await expect(page.locator('[data-toast]')).toContainText(`1 photo déplacée vers « ${targetName} »`);
    await page.locator('[data-toast]').getByRole('button', { name: 'Annuler' }).click();
    await expect(page.locator('[data-toast]')).toContainText('Annulé.');
    await page.reload();
    expect((await data())[0].category).toBe(first.category);
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
    // Un autre compte (photographe par défaut) : sa fenêtre des nouveautés s'affiche une fois.
    const news = page.getByRole('dialog', { name: /Nouveau depuis votre dernière visite/ });
    if (await news.isVisible()) await news.getByRole('button', { name: 'C’est noté' }).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/auth\/local/);
    await ctx.close();
  });
});
