import { test as setup, expect } from '@playwright/test';

// Admin v2 : un second compte de test (Sébastien), passé en v2 ; celui de Julien (admin.json) reste en v1, pour que les
// tests des deux versions tournent en même temps (le choix est celui de chaque compte).
const STATE = 'results/.auth/admin-v2.json';

setup('connexion locale de test, admin v2', async ({ page }) => {
  setup.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent : tests de l’admin ignorés');
  await page.goto('/admin');
  await page.getByLabel('Se connecter en tant que').selectOption('sebastien');
  await page.getByLabel('Jeton de test').fill(process.env.E2E_LOCAL_AUTH);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const news = page.getByRole('dialog', { name: /Nouveau depuis votre dernière visite/ });
  if (await news.isVisible()) await news.getByRole('button', { name: /C’est noté|Noted|Verstanden/ }).click();
  // Langue de l'admin en français (un test précédent a pu la laisser en allemand), puis la v2.
  await page.request.post('/admin/langue', { form: { _csrf: await page.locator('body').getAttribute('data-csrf'), lang: 'fr', back: '/admin' } });
  await page.goto('/admin');
  const choix = page.locator('form.ver-choix button');
  if (await choix.textContent() !== 'Revenir à l’admin v1') await choix.click();
  await page.goto('/admin');
  await expect(page.locator('link[href*="admin/v2/v2.css"]')).toHaveCount(1);
  await page.context().storageState({ path: STATE });
});
