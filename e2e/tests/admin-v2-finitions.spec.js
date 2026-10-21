import { test, expect } from '@playwright/test';
import { creerGalerie, supprimerGalerie, creerBillet, supprimerBillet } from './publier-donnees.js';

// Admin v2, finitions : la liste des galeries au format v2, les dialogues de confirmation (avec et sans JavaScript,
// `dialog:target`), les réglages d'une galerie au champ quitté avec « Défaire », l'ordre des photos, le panneau d'aide
// contextuelle, Sur le terrain et les cartes d'accord, la page refusée ; clavier, téléphone, aucun débordement à 320, 412,
// 1 032 × 1 250, 1 376 × 900 et 1 440 px. Chaque test crée ses données et les efface.
const STATE = 'results/.auth/admin-v2.json';
test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
test.use({ storageState: STATE });
test.describe.configure({ mode: 'serial' });

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
});
test.afterEach(async () => expect(errors, 'erreurs console / CSP').toEqual([]));

const phone = info => info.project.name === 'mobile';
const writes = () => process.env.E2E_ALLOW_WRITES === '1';
const toast = page => page.locator('[data-toast]');
const undo = async page => { const b = toast(page).getByRole('button', { name: 'Défaire' }); await b.focus(); await page.keyboard.press('Enter'); };
const overflow = page => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const bad = [...document.querySelectorAll('body *')].filter(el => {
    if (el.closest('.sr-only, dialog:not([open]), [hidden], details:not([open]) > :not(summary), #admin-nav')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > vw + 1;
  }).map(el => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60));
  return { scroll: document.documentElement.scrollWidth - vw, bad: bad.slice(0, 5) };
});
// Un accès à la galerie, créé comme le fait le formulaire.
async function creerAcces(page, id) {
  await page.goto(`/admin/galeries/${id}/acces/nouveau`);
  await page.getByLabel('Nom de la personne').fill('Lucie Exemple');
  await page.getByRole('button', { name: 'Créer l’accès' }).click();
  await expect(page).toHaveURL(/\/acces\/(\d+)\/secrets$/);
  return Number(/\/acces\/(\d+)\/secrets$/.exec(page.url())[1]);
}

test('la liste des galeries au format v2 : tableau titré, filtres à symbole, vignettes, états en symbole et en mot', async ({ page }, info) => {
  test.skip(phone(info) || !writes(), 'au bureau, E2E_ALLOW_WRITES=1');
  const id = await creerGalerie(page);
  try {
    await page.goto('/admin/galeries');
    await expect(page.locator('h1')).toHaveText('Galeries privées');
    const table = page.locator('table.liste-a.galeries-liste');
    await expect(table.locator('caption')).toBeVisible();
    await expect(page.locator('.chip .chip-st svg').first()).toBeVisible();
    await expect(table.locator('tbody tr').first().locator('.etat')).toContainText(/Ouverte|Brouillon|Ferme/);
    await expect(table.locator('tbody tr').first().locator('img').first()).toBeVisible();
    await expect(page.locator('.tablewrap')).toHaveCount(0);
    await page.getByRole('link', { name: /^Ouvertes/ }).click();
    await expect(page.getByRole('link', { name: /^Ouvertes/ })).toHaveAttribute('aria-current', 'page');
  } finally { await supprimerGalerie(page, id); }
});

test('réglages d’une galerie au champ quitté : enregistré, « Défaire » au clavier, erreur sous le champ ; l’ordre des photos avec « Défaire »', async ({ page }, info) => {
  test.skip(phone(info) || !writes(), 'au bureau, E2E_ALLOW_WRITES=1');
  const id = await creerGalerie(page, `Réglages ${Date.now()}`);
  try {
    await page.goto(`/admin/galeries/${id}/reglages`);
    await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeHidden();      // sans script seulement
    const titre = page.getByLabel('Titre de la galerie', { exact: true });
    const avant = await titre.inputValue();
    await titre.fill(`${avant} bis`);
    await page.keyboard.press('Tab');
    await expect(toast(page)).toContainText('« Titre de la galerie » enregistré.');
    await page.reload();
    await expect(titre).toHaveValue(`${avant} bis`);
    await titre.fill(`${avant} ter`);
    await page.keyboard.press('Tab');
    await expect(toast(page)).toContainText('enregistré.');
    await undo(page);
    await expect(toast(page)).toContainText('« Titre de la galerie » rétabli.');
    await expect(titre).toHaveValue(`${avant} bis`);
    await page.reload();
    await expect(titre).toHaveValue(`${avant} bis`);
    // Un titre vide est refusé sous le champ, rien n'est enregistré.
    await titre.fill('');
    await page.keyboard.press('Tab');
    await expect(titre).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#err-g-title')).toContainText('Donnez un titre');
    await page.reload();
    await expect(titre).toHaveValue(`${avant} bis`);
    // L'ordre des photos : « Monter » sans recharger, le focus gardé, « Défaire ».
    await page.goto(`/admin/galeries/${id}/photos`);
    const lignes = page.locator('[data-gp-photos] > li');
    const titres = await lignes.evaluateAll(els => els.map(e => e.dataset.titre));
    const second = lignes.nth(1);
    await expect(lignes.first().locator('form[data-gp-deplacer="monter"] button')).toBeDisabled();
    await second.locator('form[data-gp-deplacer="monter"] button').focus();
    await page.keyboard.press('Enter');
    await expect(toast(page)).toContainText(`« ${titres[1]} » en place 1 dans la galerie.`);
    expect(await lignes.first().getAttribute('data-titre')).toBe(titres[1]);
    await expect(lignes.first().locator('[data-gp-rang]')).toHaveText('1');
    expect(await page.evaluate(() => document.activeElement.closest('[data-gp-item]')?.dataset.titre)).toBe(titres[1]);
    await undo(page);
    await expect(toast(page)).toContainText('remise en place 2.');
    expect(await lignes.evaluateAll(els => els.map(e => e.dataset.titre))).toEqual(titres);
    await page.reload();
    expect(await page.locator('[data-gp-photos] > li').evaluateAll(els => els.map(e => e.dataset.titre))).toEqual(titres);
  } finally { await supprimerGalerie(page, id); }
});

test('dialogues de confirmation au clavier : Annuler d’abord, Échap rend le focus ; fermer la galerie ; un accès révoqué', async ({ page }, info) => {
  test.skip(phone(info) || !writes(), 'au bureau, E2E_ALLOW_WRITES=1');
  const id = await creerGalerie(page);
  try {
    const inv = await creerAcces(page, id);
    await page.goto(`/admin/galeries/${id}/acces/${inv}`);
    const lien = page.getByRole('link', { name: /Nouveau lien…/ });
    await lien.focus();
    await page.keyboard.press('Enter');
    const d = page.locator('#dlg-nouveau-lien');
    await expect(d).toBeVisible();
    await expect(d.getByRole('link', { name: 'Annuler' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    await expect(lien).toBeFocused();
    await page.getByRole('link', { name: /Révoquer l.accès/ }).first().click();
    await expect(page.locator('#dlg-revoquer')).toBeVisible();
    await page.locator('#dlg-revoquer').getByRole('button', { name: /Révoquer l.accès de Lucie/ }).click();
    await expect(page.locator('.flash')).toContainText('révoqué');
    await page.goto(`/admin/galeries/${id}/reglages`);
    await page.getByRole('link', { name: 'Fermer la galerie…' }).click();
    await expect(page.locator('#dlg-fermer')).toBeVisible();
    await expect(page.locator('#dlg-fermer')).toContainText('Rouvrir la galerie ne reconnecte personne');
    await page.locator('#dlg-fermer').getByRole('link', { name: 'Annuler' }).click();
    await expect(page.locator('#dlg-fermer')).toBeHidden();
  } finally { await supprimerGalerie(page, id); }
});

test('sans JavaScript : les confirmations s’ouvrent par leur ancre (dialog:target), les réglages ont leur bouton', async ({ browser }, info) => {
  test.skip(phone(info) || !writes(), 'au bureau, E2E_ALLOW_WRITES=1');
  const ctx = await browser.newContext({ ...info.project.use, storageState: STATE, javaScriptEnabled: false });
  const page = await ctx.newPage();
  const id = await creerGalerie(page);
  const b = await creerBillet(page);
  try {
    await page.goto(`/admin/galeries/${id}/acces/nouveau`);
    await page.getByLabel('Nom de la personne').fill('Lucie Exemple');
    await page.getByRole('button', { name: 'Créer l’accès' }).click();
    const inv = Number(/\/acces\/(\d+)\/secrets$/.exec(page.url())[1]);
    await page.goto(`/admin/galeries/${id}/acces/${inv}`);
    await expect(page.locator('#dlg-revoquer')).toBeHidden();
    await page.getByRole('link', { name: /Révoquer l.accès/ }).first().click();
    await expect(page).toHaveURL(/#dlg-revoquer$/);
    await expect(page.locator('#dlg-revoquer')).toBeVisible();
    await page.locator('#dlg-revoquer').getByRole('link', { name: 'Annuler' }).click();
    await expect(page.locator('#dlg-revoquer')).toBeHidden();
    await page.getByRole('link', { name: /Nouveau mot de passe…/ }).first().click();
    await expect(page.locator('#dlg-nouveau-mot-de-passe')).toBeVisible();
    await page.locator('#dlg-nouveau-mot-de-passe').getByRole('button', { name: /Créer un nouveau mot de passe/ }).click();
    await expect(page).toHaveURL(/\/secrets$/);                                              // affiché une seule fois
    await expect(page.locator('output.mdp')).toBeVisible();
    // Une galerie : réglages par leur bouton Enregistrer ; supprimer par son dialogue.
    await page.goto(`/admin/galeries/${id}/reglages`);
    await page.getByLabel('Titre en anglais').fill('Lisbon');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByLabel('Titre en anglais')).toHaveValue('Lisbon');
    await page.getByRole('link', { name: 'Supprimer la galerie…' }).click();
    await expect(page.locator('#dlg-supprimer')).toBeVisible();
    // Un billet jamais publié : supprimer par son dialogue.
    await page.goto(`/admin/carnet/${b}`);
    await page.getByRole('link', { name: 'Supprimer…' }).first().click();
    await expect(page.locator('#dlg-supprimer')).toBeVisible();
    await page.locator('#dlg-supprimer').getByRole('button', { name: /Supprimer le billet/ }).click();
    await expect(page).toHaveURL(/\/admin\/carnet$/);
  } finally { await supprimerGalerie(page, id); await ctx.close(); }
});

test('panneau d’aide contextuelle : « Aide sur cette page » ouvre le passage, Échap ferme et rend le focus ; sans script, l’aide entière', async ({ page, browser }, info) => {
  await page.goto('/admin/terrain');
  const lien = page.getByRole('link', { name: 'Aide sur cette page' });
  await lien.focus();
  await page.keyboard.press('Enter');
  const panneau = page.locator('dialog.aide-panneau');
  await expect(panneau).toBeVisible();
  await expect(panneau.getByRole('heading', { name: 'Aide sur cette page' })).toBeVisible();
  await expect(panneau.locator('.aide-p-corps')).toContainText('Sur le terrain', { timeout: 15_000 });
  await expect(panneau.locator('.aide-p-corps [id]')).toHaveCount(0);
  await expect(panneau.getByRole('link', { name: 'Ouvrir le chapitre' })).toHaveAttribute('href', /\/admin\/aide\/rencontres#/);
  await page.screenshot({ path: `results/capture-panneau-aide-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(panneau).toBeHidden();
  await expect(lien).toBeFocused();
  // Ouvert de nouveau (déjà lu : sans réseau), puis fermé par son bouton.
  await lien.click();
  await expect(panneau).toBeVisible();
  await panneau.getByRole('button', { name: 'Fermer l’aide' }).click();
  await expect(panneau).toBeHidden();
  // Sans script : le lien mène à l'aide entière, à l'ancre.
  const ctx = await browser.newContext({ ...info.project.use, storageState: STATE, javaScriptEnabled: false });
  const nojs = await ctx.newPage();
  await nojs.goto('/admin/terrain');
  await nojs.getByRole('link', { name: 'Aide sur cette page' }).click();
  await expect(nojs).toHaveURL(/\/admin\/aide#rencontres-sur-le-terrain$/);
  await expect(nojs.locator('h1')).toHaveText('Aide');
  await ctx.close();
  // Un chapitre sur sa page.
  await page.goto('/admin/aide/rencontres');
  await expect(page.locator('h1')).toHaveText('Rencontres');
  await expect(page.locator('.aide-section')).toHaveCount(1);
});

test('Sur le terrain et cartes d’accord en v2 : états à symbole, QR ; erreur sous le champ ; le premier numéro suit le photographe', async ({ page }) => {
  await page.goto('/admin/terrain');
  await expect(page.locator('h1')).toHaveText('Sur le terrain');
  await expect(page.locator('.side a[aria-current="page"]')).toContainText('terrain');
  await expect(page.locator('.avant-depart .etat svg').first()).toBeVisible();
  await expect(page.locator('.qr-model img')).toBeVisible();
  await page.getByRole('link', { name: 'Préparer une planche' }).click();
  await expect(page.locator('h1')).toHaveText('Cartes d’accord');
  await page.getByLabel('Premier numéro').fill('0');
  await page.getByRole('button', { name: 'Préparer la planche' }).click();
  await expect(page.locator('#cartes-from')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#cartes-from-err')).toContainText('Numéro de départ');
  const select = page.getByLabel('Photographe', { exact: true });
  if ((await select.locator('option').count()) > 1) {
    const [a, b] = await select.locator('option').evaluateAll(os => os.map(o => o.dataset.next));
    await select.selectOption({ index: 1 });
    await expect(page.locator('#cartes-from')).toHaveValue(b);
    await select.selectOption({ index: 0 });
    await expect(page.locator('#cartes-from')).toHaveValue(a);
  }
});

test('au téléphone : des cibles de 44 px (galeries, un accès, terrain, cartes)', async ({ page }, info) => {
  test.skip(!phone(info), 'téléphone seulement');
  for (const [url, sels] of [['/admin/galeries', ['.chip', '.v2-publier .btn']], ['/admin/terrain', ['.terrain-outils .btn', '.v2-terrain .chip']], ['/admin/rencontres/cartes', ['.cartes-form .btn']]]) {
    await page.goto(url);
    for (const sel of sels) {
      const hs = await page.locator(sel).evaluateAll(els => els.filter(e => e.offsetParent !== null && !e.closest('dialog')).map(e => e.getBoundingClientRect().height));
      for (const h of hs) expect(h, `${url} ${sel}`).toBeGreaterThanOrEqual(44);
    }
  }
});

test('aucun débordement horizontal, de 320 à 1 440 px : galeries, un accès, terrain, cartes, aide, journal, page refusée, panneau d’aide', async ({ page }, info) => {
  test.skip(phone(info) || !writes(), 'les largeurs sont posées ici ; E2E_ALLOW_WRITES=1');
  test.setTimeout(300_000);
  const g = await creerGalerie(page);
  const inv = await creerAcces(page, g);
  const b = await creerBillet(page);
  try {
    const urls = ['/admin/galeries', `/admin/galeries/${g}`, `/admin/galeries/${g}/photos`, `/admin/galeries/${g}/reglages`, `/admin/galeries/${g}/acces/${inv}`, `/admin/galeries/${g}/acces/${inv}#dlg-revoquer`,
      `/admin/galeries/${g}/reglages#dlg-supprimer`, `/admin/carnet/${b}`, `/admin/carnet/${b}#dlg-supprimer`, '/admin/terrain', '/admin/rencontres/cartes', '/admin/aide/rencontres', '/admin/aide/premiers-pas', '/admin/journal'];
    for (const [w, h] of [[320, 640], [412, 839], [1032, 1250], [1376, 900], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const url of urls) {
        await page.goto(url);
        const out = await overflow(page);
        expect(out.scroll, `${url} à ${w} px`).toBeLessThanOrEqual(0);
        expect(out.bad, `${url} à ${w} px`).toEqual([]);
      }
      // Le panneau d'aide ouvert.
      await page.goto('/admin/terrain');
      await page.getByRole('link', { name: 'Aide sur cette page' }).click();
      await expect(page.locator('dialog.aide-panneau .aide-p-corps')).toContainText('Sur le terrain', { timeout: 15_000 });
      const p = await page.locator('dialog.aide-panneau').boundingBox();
      expect(p.x + p.width, `panneau d’aide à ${w} px`).toBeLessThanOrEqual(w + 1);
      expect((await overflow(page)).scroll, `panneau à ${w} px`).toBeLessThanOrEqual(0);
    }
  } finally { await supprimerGalerie(page, g); await supprimerBillet(page, b); }
});
