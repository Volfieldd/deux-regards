import { test, expect } from '@playwright/test';

// Carnets, parcours qui modifie les données (projet « parcours », E2E_ALLOW_WRITES=1) : écrire un billet dans l'éditeur
// (MQ-20), le publier, le voir sur le site dans la vue v2 (MQ-12), avec sa photo qui mène à la visionneuse du
// billet ; un visiteur, lui, reste en v1 (404). À la fin, le billet est retiré du site et l'aperçu fermé.
const STATE = 'results/.auth/admin.json';
test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
test.skip(process.env.E2E_ALLOW_WRITES !== '1', 'E2E_ALLOW_WRITES=1 requis : ce parcours modifie les données du serveur');
test.use({ storageState: STATE, viewport: { width: 1440, height: 1100 } });

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
});
test.afterEach(async () => expect(errors, 'erreurs console / CSP').toEqual([]));

test('écrire, publier, voir : un billet de bout en bout', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const title = `Carnet E2E ${Date.now().toString(36)}`;
  await page.goto('/admin/carnet');
  await page.getByLabel('Titre').fill(title);
  await page.getByRole('radio', { name: 'Voyages' }).check();
  await page.getByRole('button', { name: 'Commencer le billet' }).click();
  await expect(page.locator('h1')).toHaveText(title);
  const id = page.url().match(/\/admin\/carnet\/(\d+)/)[1];
  const photos = await page.request.get(`/admin/carnet/${id}/photos.json`).then(r => r.json());
  const photo = photos.find(p => p.published);
  test.skip(!photo, 'aucune photo publiée');
  await page.getByLabel('Chapô').fill('Un chapô écrit par le parcours de bout en bout.');
  await page.locator('#texte').fill(`Un premier paragraphe, écrit au clavier.\n\nphoto:${photo.slug}\n\n## Une partie\n\nUn second paragraphe.`);
  // L'aperçu, rendu par le serveur, suit le texte (avec le script).
  await expect(page.locator('[data-apercu] h2.jour')).toHaveText('Une partie', { timeout: 10_000 });
  await expect(page.locator('[data-enreg]')).toContainText(/Enregistré à/, { timeout: 10_000 });
  const publier = page.locator('.ep-actions').getByRole('button', { name: 'Publier' });
  await publier.click();
  // Chaque photo d'un billet demande un texte de remplacement (B37) ; celles du jeu de démonstration n'en ont pas. Comme
  // un auteur : « Publier » enregistre le texte du billet puis refuse ; le résumé mène à la photo, « Décrire la photo… »
  // donne ce texte au billet (la photo elle-même ne change pas), et l'on publie de nouveau.
  await expect(page.locator('.flash')).toBeVisible();
  const altPoint = page.locator('#resume').getByRole('link', { name: /écrivez son texte de remplacement/ });
  if (await altPoint.count()) {
    await expect(page.locator('.flash.error')).toContainText('Pas encore publié');
    const item = page.locator(String(await altPoint.getAttribute('href')));
    await altPoint.click();
    await item.getByRole('link', { name: 'Décrire la photo…' }).click();
    await page.getByRole('textbox', { name: 'Texte de remplacement' }).fill('Une photo décrite par le parcours de bout en bout.');
    await page.getByRole('button', { name: 'Mettre à jour la photo' }).click();
    await expect(page.locator('.flash.ok')).toContainText('Photo mise à jour');
    await expect(item).toContainText('texte de remplacement écrit');
    await publier.click();
  }
  await expect(page.locator('.flash.ok')).toContainText('Billet publié');
  await expect(page.locator('.ep-titre .etat')).toContainText('Publié');
  const slug = (await page.locator('#publication .donnee').innerText()).replace('/carnet/', '');

  // Sur le site, dans la vue v2 de cette session.
  await page.goto('/admin/apparence');
  const open = page.getByRole('button', { name: 'Voir le site en v2' });
  const opened = Boolean(await open.count());
  if (opened) await open.click();
  await page.goto(`/carnet/${slug}`);
  await expect(page.locator('h1')).toHaveText(title);
  await expect(page.locator('.billet-meta')).toContainText('Publié le');
  await page.locator(`a[href^="/photo/${photo.slug}?carnet=${slug}"]`).first().click();
  await expect(page.locator('.sh-retour')).toContainText(title);
  await page.goto('/carnet');
  await expect(page.locator(`#b-${slug}`)).toBeVisible();

  // Un visiteur reste en v1 : le billet n'existe pas pour lui.
  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const vp = await visitor.newPage();
  expect((await vp.goto(`/carnet/${slug}`)).status()).toBe(404);
  await visitor.close();

  // Remise en état : le billet est retiré du site (un billet publié ne se supprime pas), la vue v2 refermée.
  await page.goto(`/admin/carnet/${id}/retirer`);
  await page.getByLabel('Pourquoi le retirer').fill('Billet de test du parcours.');
  await page.getByRole('button', { name: 'Retirer du site' }).click();
  await expect(page.locator('.ep-titre .etat')).toContainText('Retiré');
  if (opened) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Voir en v1' }).click();
  }
});
