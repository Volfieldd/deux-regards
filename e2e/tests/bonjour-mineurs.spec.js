import { test, expect } from '@playwright/test';

// « Je vous ai photographié » (MQ-05, cadres 5, 11 et 13) : l'âge et le nom du parent, la date en texte libre, le
// récapitulatif après l'envoi. Vue v2 dans l'aperçu d'une session d'administrateur (comme formulaires-v2.spec.js) ; les
// visiteurs et les autres tests gardent la v1. Projet desktop seulement : la page compte 8 envois par heure et par
// adresse, ces tests en font trois (deux refusés, un accepté avec E2E_ALLOW_WRITES=1).
let errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`); });
};
test.beforeEach(({}, info) => { errors = []; test.skip(info.project.name !== 'desktop', 'projet desktop (limites de débit du serveur)'); });
test.afterEach(() => { expect(errors, 'erreurs console / CSP').toEqual([]); });

async function apercu(browser, info, options = {}) {
  test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent : la vue v2 demande une session d’administrateur');
  const ctx = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] }, ...options });
  const page = await ctx.newPage();
  const login = options.javaScriptEnabled === false ? await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } }) : ctx;
  const lp = login === ctx ? page : await login.newPage();
  await lp.goto('/auth/local?next=%2Fadmin%2Fapparence');
  await lp.getByLabel('Se connecter en tant que').selectOption('julien');
  await lp.getByLabel('Jeton de test').fill(process.env.E2E_LOCAL_AUTH);
  await lp.getByRole('button', { name: 'Se connecter' }).click();
  await expect(lp).toHaveURL(/\/admin\/apparence$/);
  const news = lp.getByRole('dialog', { name: /Nouveau depuis votre dernière visite/ });
  if (await news.isVisible()) await news.getByRole('button', { name: 'C’est noté' }).click();
  await lp.getByRole('button', { name: 'Voir le site en v2' }).click();
  if (login !== ctx) { await ctx.addCookies(await login.cookies()); await login.close(); }
  watch(page);
  return { ctx, page };
}
const focused = page => page.evaluate(() => {
  const a = document.activeElement, r = a.getBoundingClientRect();
  return { id: a.id, visible: a.matches(':focus-visible') && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && r.width > 0 };
});
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const SIZES = [[320, 640], [412, 915], [1032, 1250], [1376, 900], [1440, 900]];

test('au clavier : l’âge avant les usages, le nom du parent apparaît sous « moins de 18 ans » et se tabule', async ({ browser }, info) => {
  const { ctx, page } = await apercu(browser, info, { viewport: { width: 1440, height: 900 } });
  await page.goto('/bonjour');
  const parent = page.locator('#bj-parent');
  await expect(parent).toBeHidden();
  // Du dernier élément du bloc de la carte (« Pas de carte ? », replié), la tabulation entre dans le groupe « Votre âge »
  // (avant « Ce que vous souhaitez »).
  await page.locator('#bj-ref').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.depliant > summary')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#bj-age-oui')).toBeFocused();
  await expect.poll(() => focused(page)).toEqual({ id: 'bj-age-oui', visible: true });
  // Flèche : « moins de 18 ans », coché ; le nom du parent apparaît, juste après dans l'ordre de tabulation.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#bj-age-non')).toBeChecked();
  await expect(parent).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(parent).toBeFocused();
  await expect.poll(() => focused(page)).toEqual({ id: 'bj-parent', visible: true });
  // Retour à « 18 ans ou plus » : le champ disparaît, la tabulation le saute.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#bj-age-oui')).toBeChecked();
  await expect(parent).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(page.locator('#bj-photo')).toBeFocused();
  // « Moins de 15 ans » n'est proposé qu'avec « Recevoir la photo » ou « J'accepte » ; coché, l'adresse d'un parent apparaît, et la phrase
  // sous « Votre e-mail ».
  await expect(page.locator('#bj-age-15')).toBeHidden();
  await page.locator('#bj-photo').check();
  await expect(page.locator('#bj-age-15')).toBeVisible();
  await page.locator('#bj-age-15').check();
  await expect(page.locator('#bj-parent-email')).toBeVisible();
  await expect(page.locator('#bj-parent')).toBeVisible();
  await expect(page.locator('#bj-email-aide')).toContainText('Avant 15 ans, laissez ce champ vide');
  await expect(page.locator('#bj-parent-aide')).toContainText('avec l’accord des deux parents (ou du parent qui exerce seul l’autorité parentale)');
  await page.locator('#bj-age-oui').check();
  await expect(page.locator('#bj-parent-email')).toBeHidden();
  // Proposé aussi pour une publication seule, sans la photo : « J'accepte » suffit.
  await page.locator('#bj-photo').uncheck();
  await expect(page.locator('#bj-age-15')).toBeHidden();
  await page.locator('#bj-accord').check();
  await expect(page.locator('#bj-age-15')).toBeVisible();
  await page.locator('#bj-age-15').check();
  await expect(page.locator('#bj-parent-email')).toBeVisible();
  await page.locator('#bj-age-oui').check();
  // La date se tape en texte libre (pas de calendrier natif).
  await expect(page.locator('#bj-date')).not.toHaveAttribute('type', 'date');
  await ctx.close();
});

test('sans JavaScript : parent révélé, erreurs sous les champs, focus ; envoi accepté, récapitulatif sans nom dans l’adresse', async ({ browser }, info) => {
  const { ctx, page } = await apercu(browser, info, { javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  await page.goto('/bonjour');
  await expect(page.locator('#bj-parent')).toBeHidden();
  await page.getByLabel('J’ai moins de 18 ans').check();
  await expect(page.locator('#bj-parent')).toBeVisible();
  // Deux points : une date impossible et le nom du parent manquant avec un accord.
  await page.locator('.depliant > summary').click();
  await page.locator('#bj-date').fill('31/02/2026');
  await page.getByLabel('Lieu').fill('Quai de la Loire, Angers');
  await page.locator('input[name="decision"][value="accord"]').check();
  await page.getByLabel('sur le site').check();
  await page.getByLabel('Votre e-mail').fill('lea.exemple@example.org');
  await page.getByLabel('Votre prénom ou nom').fill('Léa Exemple');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page).toHaveTitle(/^Erreur\s:\s2 points à corriger/);
  await expect.poll(() => focused(page)).toEqual({ id: 'resume', visible: true });
  await expect(page.locator('#err-met_on')).toContainText('cette date n’existe pas');
  await expect(page.locator('#err-guardian')).toContainText('avant 18 ans, la publication se décide avec un parent');
  // Saisie gardée, parent visible (moins de 18 ans reste coché) ; le lien du résumé mène au champ.
  await expect(page.locator('#bj-date')).toHaveValue('31/02/2026');
  await expect(page.locator('#bj-parent')).toBeVisible();
  await page.locator('#resume a[href="#bj-parent"]').click();
  await expect.poll(() => focused(page)).toEqual({ id: 'bj-parent', visible: true });
  await expect(page.locator('#bj-parent')).toHaveAttribute('aria-invalid', 'true');
  test.skip(!process.env.E2E_ALLOW_WRITES, 'la suite écrit une rencontre : E2E_ALLOW_WRITES=1');
  await page.locator('#bj-parent').fill('Anne Exemple');
  await page.locator('#bj-date').fill('hier soir');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page).toHaveURL(/\/bonjour\/merci$/);
  expect(page.url()).not.toMatch(/L%C3%A9a|Exemple|Anne|example\.org|Loire/);
  await expect.poll(() => focused(page)).toEqual({ id: 'merci-t', visible: true });
  const recap = page.locator('.pf-recap');
  await expect(recap.getByRole('heading', { level: 2 })).toHaveText('Ce que vous nous avez envoyé');
  await expect(recap).toContainText('Quai de la Loire, Angers');
  await expect(recap).toContainText('sa publication sur le site');
  await expect(recap).toContainText('moins de 18 ans, avec l’accord de votre parent');
  await expect(page.locator('main')).not.toContainText('Anne Exemple');
  await expect(page.locator('main')).not.toContainText('Léa');
  await expect(page.locator('main')).toContainText('Nous n’envoyons pas d’accusé de réception par e-mail');
  // La date relue en toutes lettres (hier, à Paris).
  const hier = await page.evaluate(() => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(Date.now() - 864e5));
  await expect(recap).toContainText(hier);
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    expect(await overflow(page), `récapitulatif à ${width} × ${height}`).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});

test('aucun débordement à 320, 412, 1032 × 1250, 1376 × 900 et 1440 px, en allemand aussi, parent visible et erreurs comprises', async ({ browser }, info) => {
  test.setTimeout(120000);
  const { ctx, page } = await apercu(browser, info);
  for (const url of ['/bonjour', '/de/bonjour', '/en/bonjour']) {
    await page.goto(url);
    await page.locator('#bj-age-non').check();
    await expect(page.locator('#bj-parent')).toBeVisible();
    await page.locator('.depliant > summary').click();
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      expect(await overflow(page), `${url} à ${width} × ${height}`).toBeLessThanOrEqual(0);
    }
  }
  // En allemand, un envoi refusé (date ambiguë ou illisible, parent manquant) : erreurs sous les champs, mesurées.
  await page.goto('/de/bonjour');
  await page.locator('#bj-age-non').check();
  await page.locator('.depliant > summary').click();
  await page.locator('#bj-date').fill('nächsten Dienstag');
  await page.getByLabel('Ort', { exact: true }).fill('Köln');
  await page.locator('input[name="decision"][value="accord"]').check();
  await page.getByLabel('auf der Website').check();
  await page.getByLabel('Ihre E-Mail').fill('anna@beispiel.de');
  await page.getByLabel('Ihr Vor- oder Nachname').fill('Anna');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.locator('#resume')).toBeFocused();
  await expect(page.locator('#err-met_on')).toContainText('Unleserliches Datum');
  await expect(page.locator('#err-guardian')).toBeVisible();
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    expect(await overflow(page), `erreurs en allemand à ${width} × ${height}`).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});
