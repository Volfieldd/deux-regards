import { test, expect } from '@playwright/test';

// Carnets (maquette MQ-20), en lecture seule : l'éditeur de l'admin au clavier (barre de mise en forme, raccourcis,
// sélecteur de photos), avec la session de la configuration (auth.setup.js) : l'enregistrement automatique et l'aperçu sont
// interceptés, rien n'est écrit ; et un visiteur en v1, pour qui les Carnets n'existent pas. La liste et le billet du site
// v2 sont mesurés par pages-v2.spec.js, dans sa session d'aperçu (une connexion de moins : AUTH_RATE_LIMIT). Ignoré si le
// serveur n'a aucun billet (le jeu de démonstration n'en a pas : voir docs/wiki/Tests.md).
let errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`); });
};
test.beforeEach(() => { errors = []; });
test.afterEach(() => { expect(errors, 'erreurs console / CSP').toEqual([]); });

test.describe('bureau', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'mesures au bureau : projet desktop'));

  test('éditeur de l’admin au clavier : barre de mise en forme, Ctrl+B, sélecteur de photos (Échap rend le focus) ; rien n’est écrit', async ({ browser }, info) => {
    test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
    const ctx = await browser.newContext({ ...info.project.use, storageState: 'results/.auth/admin.json', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page);
    // Lecture seule : l'enregistrement automatique et l'aperçu sont interceptés.
    const sent = [];
    await page.route(/\/admin\/carnet\/\d+\/(brouillon|apercu)$/, route => { sent.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, time: '12:00', html: '<p>Aperçu</p>', words: 1, minutes: 1 }) }); });
    await page.goto('/admin/carnet');
    const edit = page.locator('.liste-a a.ligne-lien').first();
    test.skip(!(await edit.count()), 'aucun billet');
    await edit.click();
    const area = page.locator('#texte');
    await area.focus();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' mot');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Control+b');
    await expect(area).toHaveValue(/\*\*mot\*\*$/);
    // La barre : de vrais boutons, atteints au clavier, au focus visible.
    const bold = page.getByRole('toolbar', { name: 'Mise en forme' }).getByRole('button', { name: 'Gras' });
    await bold.focus();
    await expect(bold).toBeFocused();
    const outline = await bold.evaluate(b => getComputedStyle(b).outlineStyle + getComputedStyle(b).boxShadow);
    expect(outline).not.toBe('nonenone');
    // Photo… : le dialogue s'ouvre, la recherche a le focus, Échap le ferme et rend le focus au texte.
    await page.getByRole('toolbar', { name: 'Mise en forme' }).getByRole('button', { name: 'Photo…' }).press('Enter');
    const dlg = page.getByRole('dialog', { name: 'Ajouter une photo' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByLabel('Rechercher dans vos photos')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(area).toBeFocused();
    await page.waitForTimeout(2500);
    expect(sent.some(u => u.endsWith('/brouillon')), 'enregistrement automatique demandé (intercepté)').toBeTruthy();
    await ctx.close();
  });

  test('visiteur : en v1, les Carnets répondent 404 et le menu ne les montre pas', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const r = await page.goto('/carnet');
    const v2 = await page.locator('link[href*="css/v2/"]').count();
    test.skip(v2 > 0, 'serveur en v2 pour tous');
    expect(r.status()).toBe(404);
    await page.goto('/');
    await expect(page.locator('a[href="/carnet"]')).toHaveCount(0);
    await ctx.close();
  });
});

