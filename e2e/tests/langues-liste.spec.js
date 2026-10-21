import { test, expect } from '@playwright/test';

// La navigation nommée conserve la sémantique native de liste, y compris lorsque les puces sont masquées.
test('langues : trois choix dans une navigation nommée, changement de langue sans script', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: 'fr-FR', baseURL });
  const page = await context.newPage();
  try {
    for (const [url, nom] of [['/contact', 'Langue'], ['/en/contact', 'Language'], ['/de/contact', 'Sprache']]) {
      await page.goto(url);
      const choix = page.locator('.lang-pick').first();
      await choix.locator('summary').click();
      const navigation = choix.getByRole('navigation', { name: nom, exact: true });
      await expect(navigation.getByRole('list')).toBeVisible();
      await expect(navigation.getByRole('listitem')).toHaveCount(3);
      await expect(navigation.getByRole('link', { name: 'English', exact: true })).toHaveAttribute('href', /\/langue\/en\?vers=/);
    }
    await page.locator('.lang-pick').first().getByRole('link', { name: 'English', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/contact/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  } finally { await context.close(); }
});
