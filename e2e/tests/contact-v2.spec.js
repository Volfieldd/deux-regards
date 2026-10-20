import { test, expect } from '@playwright/test';

// Page Contact et demande de licence (MQ-06 sans la vente de tirages ; PLAN point 8), vues dans la vue v2 d'une session
// d'administrateur (comme formulaires-v2.spec.js) ; les visiteurs gardent la v1. Les envois refusés n'écrivent rien ; un
// envoi accepté écrit un message (E2E_ALLOW_WRITES=1). Limite du serveur : 8 envois par heure et par adresse, communs à
// /contact et /droits/demande (cette suite en fait 7) : relancer la suite dans l'heure contre le même serveur l'atteint
// (redémarrez-le).
let errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`); });
};
test.beforeEach(() => { errors = []; });
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
const PHOTO = 'brume-sur-la-loire';
const focused = page => page.evaluate(() => {
  const a = document.activeElement, r = a.getBoundingClientRect();
  return { id: a.id, visible: a.matches(':focus-visible') && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && r.width > 0 };
});
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test('aucun débordement horizontal à 320, 412, 1032 × 1250, 1376 × 900 et 1440 px, en allemand aussi, erreurs comprises', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'tailles d’écran réglées par le test : projet desktop');
  test.setTimeout(150000);
  const { ctx, page } = await apercu(browser, info);
  // Une demande refusée en allemand (plusieurs points) : la même page, mesurée à chaque taille (un seul envoi).
  await page.goto(`/de/droits/demande?photo=${PHOTO}`);
  await page.getByLabel('Ihre E-Mail-Adresse').fill('anna@beispiel,de');
  await page.getByRole('button', { name: 'Anfrage senden' }).click();
  await expect(page.locator('#resume')).toBeFocused();
  const SIZES = [[320, 640], [412, 915], [1032, 1250], [1376, 900], [1440, 900]];
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    expect(await overflow(page), `erreurs en allemand à ${width} × ${height}`).toBeLessThanOrEqual(0);
  }
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    for (const url of ['/contact', '/de/contact', '/en/contact?pour=tous', `/droits/demande?photo=${PHOTO}`, `/de/droits/demande?photo=${PHOTO}`, '/droits/demande',
      '/contact/merci', `/de/droits/demande/merci?photo=${PHOTO}`, '/a-propos', '/de/a-propos']) {
      await page.goto(url);
      expect(await overflow(page), `${url} à ${width} × ${height}`).toBeLessThanOrEqual(0);
    }
  }
  await ctx.close();
});

test('sans JavaScript : envoi refusé, résumé focalisé et visible, lien vers le champ ; un seul point : le champ prend le focus', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'une fois suffit (limite de débit du serveur)');
  const { ctx, page } = await apercu(browser, info, { javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  await page.goto('/contact');
  await expect(page.locator('#resume')).toHaveCount(0);
  await page.getByLabel('Ce que vous avez en tête').fill('Une question sur une exposition.');
  await page.getByLabel('Votre e-mail').fill('claire@example,org');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(page).toHaveTitle(/^Erreur\s:\s3 points à corriger\s·\sContact\s·\s/);
  await expect.poll(() => focused(page)).toEqual({ id: 'resume', visible: true });
  await expect(page.getByLabel('Votre e-mail')).toHaveValue('claire@example,org');
  await expect(page.getByLabel('Ce que vous avez en tête')).toHaveValue('Une question sur une exposition.');
  // Le premier lien du résumé mène au premier champ en erreur (le destinataire) : focus visible.
  // Au clavier (Entrée sur le lien) : le premier choix prend le focus, visible.
  await page.locator('#resume a').first().focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => focused(page)).toEqual({ id: 'ct-pour-sebastien', visible: true });
  await expect(page.locator('#err-pour')).toBeVisible();
  // Un seul point (l'e-mail) : pas de résumé, le champ prend le focus, le titre le nomme.
  await page.getByLabel('Julien').check();
  await page.getByLabel('Votre nom').fill('Claire Exemple');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(page.locator('#resume')).toHaveCount(0);
  await expect(page).toHaveTitle(/^Erreur\s:\svotre e-mail\s·\sContact\s·\s/);
  await expect.poll(() => focused(page)).toEqual({ id: 'ct-email', visible: true });
  await expect(page.locator('#err-email')).toBeVisible();
  // Demande de licence, un seul point : l'usage, premier choix focalisé ; la photo reste en tête.
  await page.goto(`/droits/demande?photo=${PHOTO}`);
  await page.getByLabel('Ce que vous avez en tête').fill('Couverture d’un guide.');
  await page.getByLabel('Votre nom').fill('Claire Exemple');
  await page.getByLabel('Votre e-mail').fill('claire.exemple@example.org');
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect.poll(() => focused(page)).toEqual({ id: 'dl-usage-presse', visible: true });
  await expect(page.locator('#err-usage')).toBeVisible();
  await expect(page.locator('.photo-ref .cartel-t')).toBeVisible();
  await ctx.close();
});

test('envoi accepté sans JavaScript : Contact puis demande de licence, la page « merci » prend le focus (écrit deux messages)', async ({ browser }, info) => {
  test.skip(!process.env.E2E_ALLOW_WRITES, 'écrit dans les données : E2E_ALLOW_WRITES=1');
  test.skip(info.project.name !== 'desktop', 'une fois suffit');
  const { ctx, page } = await apercu(browser, info, { javaScriptEnabled: false });
  await page.goto('/contact?pour=julien');
  await expect(page.getByLabel('Julien')).toBeChecked();
  await page.getByLabel('Ce que vous avez en tête').fill('Essai de bout en bout : à effacer.');
  await page.getByLabel('Votre nom').fill('Essai Exemple');
  await page.getByLabel('Votre e-mail').fill('essai@example.org');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(page).toHaveURL(/\/contact\/merci$/);
  await expect.poll(() => focused(page)).toEqual({ id: 'merci-t', visible: true });
  await expect(page.getByRole('status')).toContainText('Envoyé.');
  await expect(page.locator('main')).not.toContainText('essai@example.org');
  // Depuis la visionneuse : « Demander une licence », préremplie avec la photo.
  await page.goto(`/photo/${PHOTO}`);
  await page.getByRole('link', { name: 'Demander une licence' }).click();
  await expect(page).toHaveURL(new RegExp(`/droits/demande\\?photo=${PHOTO}$`));
  await page.getByLabel('site web ou réseaux sociaux').check();
  await page.getByLabel('Ce que vous avez en tête').fill('Essai de bout en bout : à effacer.');
  await page.getByLabel('Votre nom').fill('Essai Exemple');
  await page.getByLabel('Votre e-mail').fill('essai@example.org');
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page).toHaveURL(new RegExp(`/droits/demande/merci\\?photo=${PHOTO}$`));
  await expect.poll(() => focused(page)).toEqual({ id: 'merci-t', visible: true });
  await ctx.close();
});

test('avec le script : rien ne change (même formulaire, envoi classique, aucune erreur de la CSP)', async ({ browser }, info) => {
  const { ctx, page } = await apercu(browser, info);
  for (const url of ['/contact', `/droits/demande?photo=${PHOTO}`, '/de/contact']) {
    await page.goto(url);
    await expect(page.locator('form[method="post"][novalidate]')).toHaveCount(1);
    // Champ piège hors de l'écran (comme /bonjour) : jamais atteint au clavier.
    const trap = await page.locator('input[name="website"]').boundingBox();
    expect(trap.x + trap.width).toBeLessThanOrEqual(0);
    await expect(page.locator('input[name="website"]')).toHaveAttribute('tabindex', '-1');
  }
  await ctx.close();
});

test.describe('téléphone', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'mobile', 'téléphone : projet mobile (Pixel 7)'));
  test('Pixel 7 : une colonne, choix de 44 px, « en bref » après le formulaire, aucun débordement', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info);
    for (const url of ['/contact', '/de/contact', `/droits/demande?photo=${PHOTO}`, '/a-propos']) {
      await page.goto(url);
      expect(await overflow(page), url).toBeLessThanOrEqual(0);
    }
    await page.goto(`/droits/demande?photo=${PHOTO}`);
    const box = await page.locator('.choix').first().boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    const form = await page.locator('form.form').boundingBox(), bref = await page.locator('.dl-bref').boundingBox();
    expect(bref.y).toBeGreaterThan(form.y + form.height - 1);
    await ctx.close();
  });
});

test('visiteur : la v1 du Contact et de la demande, même pendant l’aperçu d’un administrateur ; liens du pied de page', async ({ browser }, info) => {
  const { ctx } = await apercu(browser, info);
  const visitor = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
  const page = await visitor.newPage();
  for (const url of ['/contact', `/droits/demande?photo=${PHOTO}`]) {
    await page.goto(url);
    await expect(page.locator('link[href*="css/v2/"]')).toHaveCount(0);
    await expect(page.locator('form.hello-form')).toHaveCount(1);
  }
  await page.goto('/');
  await page.locator('footer').getByRole('link', { name: 'Contact' }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await page.goto('/droits');
  await page.getByRole('link', { name: 'Demander une licence pour une photo' }).click();
  await expect(page).toHaveURL(/\/droits\/demande$/);
  await visitor.close();
  await ctx.close();
});
