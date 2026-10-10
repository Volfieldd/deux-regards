import { test as setup, expect } from '@playwright/test';

const STATE = 'results/.auth/admin.json'; // relu par admin.spec.js

setup('connexion locale de test', async ({ page }) => {
  setup.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent : tests de l’admin ignorés');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/auth\/local\?next=%2Fadmin/);
  await page.getByLabel('Se connecter en tant que').selectOption('julien');
  await page.getByLabel('Jeton de test').fill(process.env.E2E_LOCAL_AUTH);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText('Connexion locale de test')).toBeVisible();
  await page.context().storageState({ path: STATE });
});
