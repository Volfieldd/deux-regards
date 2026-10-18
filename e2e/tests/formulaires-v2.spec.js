import { test, expect } from '@playwright/test';

// Pages à formulaire de la v2 (« Je vous ai photographié », MQ-05 ; Signaler et Partager sans script, planche MQ-00),
// vues dans l'aperçu de la v2 : chaque test ouvre sa propre session d'administrateur (connexion locale de test) et y
// ouvre l'aperçu ; les visiteurs et les autres tests gardent la v1. Les envois refusés (erreurs) n'écrivent rien ; un
// envoi accepté écrit (une rencontre, un signalement) : il ne tourne qu'avec E2E_ALLOW_WRITES=1. Les limites du serveur
// (8 envois par heure et par adresse sur /bonjour, 5 sur Signaler) comptent aussi ces envois : relancer la suite plus de
// deux fois dans l'heure contre le même serveur les atteint (redémarrez-le).
let errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`); });
};
test.beforeEach(() => { errors = []; });
test.afterEach(() => { expect(errors, 'erreurs console / CSP').toEqual([]); });

async function apercu(browser, info, options = {}) {
  test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent : l’aperçu de la v2 demande une session d’administrateur');
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
  await lp.getByRole('button', { name: 'Ouvrir l’aperçu de la v2' }).click();
  if (login !== ctx) { await ctx.addCookies(await login.cookies()); await login.close(); }
  watch(page);
  return { ctx, page };
}
const PHOTO = '/photo/brume-sur-la-loire';
// L'élément qui a le focus : son id, focus visible (:focus-visible) et entièrement dans l'écran. L'autofocus est posé
// après le chargement : lu jusqu'à ce qu'il arrive (expect.poll).
const focused = page => page.evaluate(() => {
  const a = document.activeElement, r = a.getBoundingClientRect();
  return { id: a.id, visible: a.matches(':focus-visible') && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && r.width > 0 };
});

test('aucun débordement horizontal à 320, 412, 1032 × 1250, 1376 × 900 et 1440 px, en allemand aussi, erreurs comprises', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'tailles d’écran réglées par le test : projet desktop');
  test.setTimeout(150000);
  const { ctx, page } = await apercu(browser, info);
  // Un envoi refusé en allemand (deux points à corriger) : la même page, mesurée à chaque taille (un seul envoi).
  await page.goto('/de/bonjour');
  await page.getByLabel('Das Foto per E-Mail erhalten').check();
  await page.getByLabel('Ihre E-Mail').fill('anna@beispiel,de');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.locator('#resume')).toBeFocused();
  const SIZES = [[320, 640], [412, 915], [1032, 1250], [1376, 900], [1440, 900]];
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `erreurs en allemand à ${width} × ${height}`).toBeLessThanOrEqual(0);
  }
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    for (const url of ['/bonjour', '/de/bonjour', '/en/bonjour/J-0142', `${PHOTO}/signaler`, `/de${PHOTO}/signaler`, `${PHOTO}/partager`, `/de${PHOTO}/partager`, '/bonjour/merci', `/de${PHOTO}/signaler?envoye=1`]) {
      await page.goto(url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${url} à ${width} × ${height}`).toBeLessThanOrEqual(0);
    }
  }
  await ctx.close();
});

test('sans JavaScript : envoi refusé, résumé focalisé et visible, lien vers le champ ; un seul point : le champ prend le focus', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'une fois suffit (limites de débit du serveur)');
  const { ctx, page } = await apercu(browser, info, { javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  // Deux points (sans carte ni date et lieu ; e-mail faux) : le résumé prend le focus, visible ; la saisie est gardée.
  await page.goto('/bonjour');
  await expect(page.locator('#resume')).toHaveCount(0);
  await page.getByLabel('Recevoir la photo par e-mail').check();
  await page.getByLabel('Votre e-mail').fill('claire@example,org');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page).toHaveTitle(/^Erreur\s:\s2 points à corriger\s·\sJe vous ai photographié\s·\s/);
  await expect.poll(() => focused(page)).toEqual({ id: 'resume', visible: true });
  await expect(page.getByLabel('Votre e-mail')).toHaveValue('claire@example,org');
  await expect(page.getByLabel('Recevoir la photo par e-mail')).toBeChecked();
  // Le premier lien du résumé mène au premier champ en erreur (la date, dans le dépliant ouvert) : focus visible.
  await page.locator('#resume a').first().click();
  await expect.poll(() => focused(page)).toEqual({ id: 'bj-date', visible: true });
  await expect(page.locator('#bj-date')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#err-where')).toBeVisible();
  // Un seul point (carte donnée, e-mail manquant) : pas de résumé, le champ en erreur prend le focus, visible.
  await page.getByLabel('Référence de la carte').fill('J-0142');
  await page.getByLabel('Votre e-mail').fill('');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.locator('#resume')).toHaveCount(0);
  await expect.poll(() => focused(page)).toEqual({ id: 'bj-email', visible: true });
  await expect(page.locator('#err-email')).toContainText('indiquez votre e-mail');
  // Signaler, un seul point : le groupe « Que voulez-vous nous dire ? », premier choix focalisé.
  await page.goto(`${PHOTO}/signaler`);
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect.poll(() => focused(page)).toEqual({ id: 'sg-kind-inapproprie', visible: true });
  await expect(page.locator('#err-kind')).toBeVisible();
  // Le dépliant « Pas de carte ? » et le menu s'ouvrent sans script.
  await page.goto('/bonjour');
  await page.locator('.depliant > summary').click();
  await expect(page.getByLabel('Lieu')).toBeVisible();
  // Partager sans script : les liens, sans « Copier le lien ».
  await page.goto(`${PHOTO}/partager`);
  await expect(page.getByRole('heading', { level: 1, name: 'Partager' })).toBeVisible();
  await expect(page.locator('[data-share-copy]')).toBeHidden();
  await expect(page.getByRole('link', { name: /WhatsApp/ })).toBeVisible();
  await ctx.close();
});

test('messages de succès : le titre ou le message prend le focus, visible', async ({ browser }, info) => {
  const { ctx, page } = await apercu(browser, info, { javaScriptEnabled: false });
  await page.goto('/bonjour/merci');
  await expect.poll(() => focused(page)).toEqual({ id: 'merci-t', visible: true });
  await expect(page.getByRole('status')).toContainText('Envoyé.');
  await page.goto(`${PHOTO}/signaler?envoye=1`);
  await expect(page.getByRole('status')).toContainText('Merci, votre message est bien arrivé.');
  await expect.poll(() => page.evaluate(() => document.activeElement.matches('.msg--ok:focus-visible'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await ctx.close();
});

test('envoi accepté sans JavaScript : Signaler, puis le message de succès (écrit un signalement)', async ({ browser }, info) => {
  test.skip(!process.env.E2E_ALLOW_WRITES, 'écrit dans les données : E2E_ALLOW_WRITES=1');
  test.skip(info.project.name !== 'desktop', 'une fois suffit');
  const { ctx, page } = await apercu(browser, info, { javaScriptEnabled: false });
  await page.goto(`${PHOTO}/signaler`);
  await page.getByLabel('Une suggestion pour le texte (titre, légende, lieu)').check();
  await page.getByLabel('Votre message').fill('Essai de bout en bout : à effacer.');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page).toHaveURL(/\/signaler\?envoye=1$/);
  await expect(page.getByRole('status')).toContainText('Merci, votre message est bien arrivé.');
  await ctx.close();
});

test('Partager avec le script : « Copier le lien » copie et compte par la route de la fenêtre', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'presse-papiers : projet desktop');
  const { ctx, page } = await apercu(browser, info, { permissions: ['clipboard-read', 'clipboard-write'] });
  const counted = [];
  // Le compte n'est pas écrit : la requête est interceptée (même adresse, même corps que la fenêtre de la visionneuse).
  await page.route('**/photo/brume-sur-la-loire/partage', route => { counted.push(route.request().postData()); return route.fulfill({ status: 204 }); });
  await page.goto(`${PHOTO}/partager`);
  const copy = page.locator('[data-share-copy]');
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(copy).toHaveText('✓ Lien copié');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/photo\/brume-sur-la-loire$/);
  await expect.poll(() => counted.join()).toContain('via=copie');
  await ctx.close();
});

test.describe('téléphone', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'mobile', 'téléphone : projet mobile (Pixel 7)'));
  test('Pixel 7 : formulaire sur une colonne, cases de 44 px, aucun débordement', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info);
    for (const url of ['/bonjour', '/de/bonjour', `${PHOTO}/signaler`, `${PHOTO}/partager`]) {
      await page.goto(url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), url).toBeLessThanOrEqual(0);
    }
    await page.goto('/bonjour');
    const box = await page.locator('.choix').first().boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    const form = await page.locator('form.form').boundingBox(), intro = await page.locator('.pf-intro').boundingBox();
    expect(form.y).toBeGreaterThan(intro.y + intro.height - 1);
    await ctx.close();
  });
});

test('visiteur : la v1 des pages à formulaire, même pendant l’aperçu d’un administrateur', async ({ browser }, info) => {
  const { ctx } = await apercu(browser, info);
  const visitor = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
  const page = await visitor.newPage();
  for (const url of ['/bonjour', `${PHOTO}/signaler`, `${PHOTO}/partager`]) {
    await page.goto(url);
    await expect(page.locator('link[href*="css/v2/"]')).toHaveCount(0);
  }
  await expect(page.locator('form.hello-form')).toHaveCount(0);
  await page.goto('/bonjour');
  await expect(page.locator('form.hello-form')).toHaveCount(1);
  await visitor.close();
  await ctx.close();
});
