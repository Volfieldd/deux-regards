import { test, expect } from '@playwright/test';
import { creerRencontre, effacerRencontre } from './terrain-donnees.js';

// App de terrain de la v2 (MQ-10) au toucher, dans WebKit (moteur de Safari), écran d'iPhone, avec le compte de la v2.
const STATE = 'results/.auth/admin-v2.json';
test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
test.use({ storageState: STATE });

let errors = [];
test.beforeEach(async ({ page }) => { errors = []; page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(async () => expect(errors, 'erreurs JavaScript').toEqual([]));

test('nouvelle rencontre : titre, session, « Tendre le téléphone », langue de la personne, erreurs dans sa langue', async ({ page }) => {
  await page.goto('/admin/rencontre');
  await expect(page.locator('h1')).toHaveText('Nouvelle rencontre');
  await expect(page.locator('.app-session')).toContainText('connecté jusqu’à');
  await page.getByRole('link', { name: 'Tendre le téléphone à la personne' }).tap();
  await expect(page.locator('[data-vous]')).not.toHaveAttribute('open', '');
  await expect(page.locator('#s-pers')).toBeFocused();
  // La personne passe l'écran en anglais : toute sa section suit.
  await page.locator('.langues label[lang="en"]').tap();
  await expect(page.locator('#decision > legend [data-l="en"]')).toHaveText('Your decision');
  await expect(page.locator('#decision > legend [data-l="en"]')).toBeVisible();
  await expect(page.locator('#decision > legend [data-l="fr"]')).toBeHidden();
  await expect(page.locator('[data-save] [data-l="en"]')).toBeVisible();
  await expect(page.locator('[data-save] [data-l="fr"]')).toBeHidden();
  // Elle accepte, signe, oublie son âge : l'envoi est arrêté avant de partir, dans sa langue.
  await page.locator('input[name="decision"][value="accord"]').check();
  await page.locator('input[name="scope_site"]').check();
  await page.locator('#nom').fill('Inês Exemplo');
  // Un trait au doigt (évènements de pointeur, comme le toucher de Safari).
  await page.locator('[data-sign]').evaluate(c => {
    const r = c.getBoundingClientRect();
    const at = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: r.left + x, clientY: r.top + y }));
    at('pointerdown', 20, 40); for (let i = 1; i <= 6; i++) at('pointermove', 20 + i * 16, 40 + i * 6); at('pointerup', 116, 76);
  });
  await expect(page.locator('[data-sig-ok]')).toBeVisible();
  await page.locator('[data-save]').tap();
  const resume = page.locator('.resume');
  await expect(resume).toBeFocused();
  await expect(resume).toContainText('Age: tell us whether you are 18 or older.');
  await expect(page.locator('input[name="adult"]').first()).toHaveAttribute('aria-invalid', 'true');
  // « Clear » se défait.
  await page.locator('[data-sign-clear]').tap();
  await expect(page.locator('[data-sig-defaire]')).toBeVisible();
  await page.locator('[data-sig-undo]').tap();
  await expect(page.locator('[data-sig-ok]')).toBeVisible();
  // Cibles d'au moins 44 px, et aucun débordement.
  for (const sel of ['[data-sign-clear]', '.langues label', '[data-save]', '.app-bar a']) {
    const b = await page.locator(sel).first().boundingBox();
    expect(b.height, sel).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test('accueil Terrain : un titre, la session, la prochaine carte', async ({ page }) => {
  await page.goto('/admin/rencontre/accueil');
  await expect(page.locator('h1')).toHaveText('Terrain');
  await expect(page.locator('.app-session')).toContainText('connecté jusqu’à');
  await expect(page.getByRole('link', { name: /Nouvelle rencontre/ })).toBeVisible();
});

test('le lot au toucher : chaque champ touchable, la barre des cochées repliée puis dépliée', async ({ page }) => {
  await page.goto('/admin/photos');
  const ids = await page.locator('.tile').evaluateAll(ts => ts.slice(0, 2).map(t => Number(t.dataset.id)));
  await page.goto(`/admin/photos/lot?ids=${ids.join(',')}`);
  for (const id of ids) for (const sel of [`#titre-${id}`, `#serie-${id}`, `#lieu-${id}`, `#date-${id}`]) {
    const ok = await page.locator(sel).evaluate(e => { e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === e && b.left >= 0 && b.right <= innerWidth; });
    expect(ok, sel).toBe(true);
  }
  await expect(page.locator('#b-lieu')).toBeHidden();
  await page.locator('[data-bulk-toggle]').tap();
  await expect(page.locator('#b-lieu')).toBeVisible();
});

// Vague 3b : une rencontre (données personnelles, accord, carte) dans WebKit au toucher : la fiche tient dans l'écran,
// la décision est en tête, « Effacer les données… » ouvre son dialogue (Annuler d'abord), le formulaire de la carte au doigt.
test('une rencontre au toucher : décision en tête, dialogue d’effacement, formulaire de la carte, rien ne déborde', async ({ page }) => {
  const r = await creerRencontre(page, { jour: '2025-10-19', nom: 'iPhone Essai' });
  try {
    await page.goto(`/admin/rencontres/${r.id}`);
    await expect(page.locator('link[href*="admin/v2/contenus-v2.css"]')).toHaveCount(1);
    await expect(page.locator('.fiche-pastilles')).toContainText('Accord signé : site');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.getByRole('link', { name: 'Effacer les données…' }).tap();
    const d = page.locator('#dlg-effacer');
    await expect(d).toBeVisible();
    await d.getByRole('link', { name: 'Annuler' }).tap();
    await expect(d).toBeHidden();
    await page.getByText('Corriger la rencontre et la carte').tap();
    const email = page.locator('#rc-email');
    await expect(email).toBeVisible();
    expect((await email.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.goto('/admin/personnes');
    await expect(page.getByRole('link', { name: 'iPhone Essai' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  } finally { await effacerRencontre(page, r.id); }
});
