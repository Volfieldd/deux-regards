import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Parcours d'audit ergonomique (E2E_AUDIT=1) : mêmes tâches que l'audit d'octobre 2026, rejouées sur
// les écrans revus, avec les mesures qui servent de seuils (actions, écrans, tabulations, positions).
// Modifie des données de test (import, séries) puis les remet en état. Serveur de test uniquement.
const STATE = 'results/.auth/admin.json';
test.skip(process.env.E2E_AUDIT !== '1', 'E2E_AUDIT=1 requis');
test.use({ storageState: STATE, viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const OUT = 'audit/apres';
const metrics = {};
const shot = (page, id, opts = {}) => page.screenshot({ path: `${OUT}/${id}.png`, ...opts });
const save = () => fs.writeFileSync(`${OUT}/mesures.json`, JSON.stringify(metrics, null, 2));
fs.mkdirSync(OUT, { recursive: true });
let lotUrl = null;

test('J1 — importer un lot de photos', async ({ page }) => {
  test.setTimeout(600_000);
  const m = metrics.J1 = { actions: 0 };
  await page.goto('/admin/photos');
  await shot(page, 'J1-01-photos');
  // « Importer des photos » ouvre directement le choix des fichiers ; les photos valides partent aussitôt.
  const files = ['DSCF0241.jpg', 'DSCF0242.jpg', 'DSCF0243.jpg', 'notes-de-voyage.jpg'].map(f => `fixtures/audit/${f}`);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('link', { name: '＋ Importer des photos' }).click()]);
  m.actions++;
  const t0 = Date.now();
  await chooser.setFiles(files); m.actions++;
  await expect(page.locator('[data-files] li')).toHaveCount(4);
  await expect(page.getByText('✕ Ce n’est pas une image')).toBeVisible();
  m.invalidFlaggedBeforeSend = await page.locator('[data-files] li.bad .cap').count() === 0;   // écarté sans envoi
  await shot(page, 'J1-02-verification');
  await expect(page.locator('[data-summary]')).toBeVisible();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-files] .bar.proc i')].some(i => parseFloat(i.style.width) > 0), null, { timeout: 120_000 });
  m.progressShown = await page.locator('[data-files] .bar').count() > 0;
  await shot(page, 'J1-03-progression');
  await expect(page.locator('[data-activity]')).toBeVisible();
  const next = page.locator('[data-sum-next]');
  await expect(page.locator('[data-sum-title]')).toHaveText('3 photos prêtes sur 3', { timeout: 540_000 });
  m.importSeconds = Math.round((Date.now() - t0) / 100) / 10;
  await shot(page, 'J1-04-pret');
  lotUrl = await next.getAttribute('href');
  save();
});

test('J2 — compléter puis publier les photos importées', async ({ page }) => {
  const m = metrics.J2 = { actions: 0, screens: 1 };
  await page.goto(lotUrl);
  await shot(page, 'J2-01-lot');
  const titles = ['Audit lisière', 'Audit seconde veille', 'Audit pluie fine'];
  const inputs = page.locator('input[data-field=title]');
  for (const [i, t] of titles.entries()) {
    await inputs.nth(i).fill(t); m.actions++;
    await inputs.nth(i).press('Tab');
    await expect(page.locator('tbody tr').nth(i).locator('[data-state]')).toHaveText('✓ Enregistré');
  }
  const bulk = page.locator('[data-bulk]');
  // Date : reprise de l'appareil (EXIF) à l'import. Lieu : appliqué au lot dès la sortie du champ.
  m.datesFromCamera = await page.locator('input[data-field=taken_on]').evaluateAll(f => f.every(i => /^2026-10-0\d$/.test(i.value)));
  await bulk.getByPlaceholder('Lieu').fill('Atelier'); m.actions++;
  await bulk.getByPlaceholder('Lieu').press('Tab');
  await expect(page.locator('[data-toast]')).toContainText('Lieu « Atelier » appliqué à 3 photos');
  await expect(page.locator('input[data-field=place]').first()).toHaveValue('Atelier');
  await shot(page, 'J2-02-complete');
  await bulk.getByRole('button', { name: 'Publier' }).click(); m.actions++;
  await expect(page.locator('[data-toast]')).toContainText('3 photos publiées');
  await page.reload();
  m.placesSaved = await page.locator('input[data-field=place]').evaluateAll(f => f.every(i => i.value === 'Atelier'));
  m.published = await page.locator('tbody [data-state]').filter({ hasText: 'Publiée' }).count();
  await shot(page, 'J2-03-publie');
  save();
});

test('J2b — titres provisoires : confirmation avant publication', async ({ page }) => {
  await page.goto(lotUrl);
  const first = page.locator('input[data-field=title]').first();
  const original = await first.inputValue();
  await first.fill('DSCF0241'); await first.press('Tab');
  await expect(page.locator('tbody tr').first().locator('[data-state]')).toHaveText('✓ Enregistré');
  await page.locator('[data-bulk]').getByRole('button', { name: 'Publier' }).click();
  await expect(page.locator('[data-confirm-publish]')).toBeVisible();
  await shot(page, 'J2-04-titres-provisoires');
  await page.getByRole('button', { name: 'Corriger les titres' }).click();
  await expect(first).toBeFocused();
  await first.fill(original); await first.press('Tab');
  await expect(page.locator('tbody tr').first().locator('[data-state]')).toHaveText('✓ Enregistré');
});

test('J3 — gérer les séries', async ({ page }) => {
  const m = metrics.J3 = { actions: 0 };
  await page.goto('/admin/series');
  await shot(page, 'J3-01-series');
  const box = await page.getByRole('link', { name: '＋ Nouvelle série' }).boundingBox();
  m.newSeriesY = Math.round(box.y);
  await page.getByRole('link', { name: '＋ Nouvelle série' }).click(); m.actions++;
  await page.keyboard.type('Nuits d’automne'); m.actions++;
  await page.keyboard.press('Enter'); m.actions++;
  await expect(page.locator('.scard[data-id] .title').first()).toHaveText('Nuits d’automne');
  m.newSeriesFirst = true;
  await shot(page, 'J3-02-creee');
  // Reculer d'une place au clavier sur la poignée, puis revenir en tête : une touche par place.
  const grip = page.locator('.scard[data-id]').first().locator('[data-grip]');
  await grip.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.scard[data-id] .title').nth(1)).toHaveText('Nuits d’automne');
  await page.keyboard.press('ArrowLeft'); m.reorderKeysPerPlace = 1;
  await expect(page.locator('.scard[data-id] .title').first()).toHaveText('Nuits d’automne');
  await page.reload();
  await expect(page.locator('.scard[data-id] .title').first()).toHaveText('Nuits d’automne');
  // Suppression d'une série non vide : la fenêtre propose de déplacer les photos.
  const full = page.locator('.scard[data-id]').filter({ hasText: /[1-9]\d* photos?/ }).first();
  await full.locator('summary[aria-label^="Plus d’actions"]').click();
  await full.locator('.danger > summary').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await shot(page, 'J3-03-suppression');
  await page.locator('dialog[open]').getByRole('button', { name: 'Annuler' }).click();
  await page.setViewportSize({ width: 412, height: 915 });
  await page.reload();
  // Mobile : plus d'en-tête ; la navigation tient dans la barre d'onglets du bas.
  m.mobileHeaderHeight = 0;
  m.mobileTabbarHeight = Math.round((await page.locator('.tabbar').boundingBox()).height);
  await shot(page, 'J3-04-series-mobile', { fullPage: true });
  save();
});

test('J4 — classer 3 photos dans la nouvelle série', async ({ page }) => {
  const m = metrics.J4 = { actions: 0, screens: 1 };
  await page.goto('/admin/photos?q=Audit');
  const tiles = page.locator('.contact .tile');
  await tiles.nth(0).click(); m.actions++;
  await tiles.nth(2).click({ modifiers: ['Shift'] }); m.actions++;
  const insp = page.locator('[data-inspector]');
  await expect(insp.locator('[data-insp-title]')).toHaveText('3 photos');
  await shot(page, 'J4-01-selection');
  await insp.locator('[data-many-series]').getByRole('button', { name: 'Nuits d’automne' }).click(); m.actions++;
  await expect(page.locator('[data-toast]')).toContainText('3 photos déplacées vers « Nuits d’automne »');
  await expect(insp.locator('[data-many-series]').getByRole('button', { name: 'Nuits d’automne' })).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'J4-02-deplacees');
  save();
});

test('J5 — choisir les photos de l’ouverture', async ({ page }) => {
  const m = metrics.J5 = {};
  await page.goto('/admin/reglages#ouverture');
  await shot(page, 'J5-01-ouverture', { fullPage: true });
  m.counter = await page.locator('[data-hero-count]').textContent();
  save();
});

test('mesures transverses', async ({ page }) => {
  const m = metrics.transverse = {};
  await page.goto('/admin/photos');
  m.firstPhotoY = Math.round((await page.locator('.contact li').first().boundingBox()).y);
  // Clavier : tabulations jusqu'au bouton d'import.
  let tabs = 0;
  for (; tabs < 40; tabs++) {
    const name = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (name === '＋ Importer des photos') break;
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.classList.contains('skip'))) { await page.keyboard.press('Enter'); }
  }
  m.tabsToImport = tabs;
  await page.goto('/admin/photos');
  await page.keyboard.press('Tab');
  await shot(page, 'T-01-lien-evitement', { clip: { x: 0, y: 0, width: 1440, height: 300 } });
  save();
});

// WCAG 2.2 A/AA : toutes les violations, quel que soit leur impact, sur chaque écran revu et ses états.
test('accessibilité des écrans revus (axe-core)', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const found = {};
  const check = async name => {
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    found[name] = violations.map(v => `${v.id} (${v.impact}) : ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  };
  await page.goto('/admin/photos');
  await page.locator('.contact .tile').nth(0).click();
  await page.locator('.contact .tile').nth(1).click({ modifiers: ['Shift'] });
  await check('photos + sélection');
  await page.goto('/admin/photos?importer');
  await page.locator('[data-import] input[type=file]').setInputFiles(['fixtures/audit/DSCF0241.jpg', 'fixtures/audit/notes-de-voyage.jpg']);
  await expect(page.locator('[data-files] li')).toHaveCount(2);
  await check('import : vérification');
  await page.goto(lotUrl);
  await check('compléter le lot');
  await page.goto('/admin/series');
  await check('séries');
  await page.goto('/admin/reglages');
  await check('réglages (ouverture)');
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/admin/photos');
  await page.locator('.contact .tile').first().click();
  await check('mobile : photos + sélection');
  metrics.axe = found;
  save();
  expect(Object.values(found).flat()).toEqual([]);
});

test('nettoyage', async ({ page }) => {
  test.setTimeout(120_000);
  // Seulement les photos créées par ce parcours (titres exacts) : jamais celles des auteurs.
  const mine = ['Audit lisière', 'Audit seconde veille', 'Audit pluie fine', 'DSCF0241', 'DSCF0242', 'DSCF0243'];
  for (const q of ['Audit', 'DSCF024']) {
    await page.goto(`/admin/photos?q=${q}`);
    const rows = page.locator('.contact li').filter({ has: page.locator('a.ttl').filter({ hasText: new RegExp(`^(${mine.join('|')})$`) }) });
    const n = await rows.count();
    if (!n) continue;
    for (let i = 0; i < n; i++) await rows.nth(i).locator('.chk').check({ force: true });
    await page.locator('[data-bulk]').getByRole('button', { name: 'Supprimer…' }).click();
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(page.locator('[data-toast]')).toContainText('supprimée');
  }
  // Séries créées par ce parcours (plusieurs si un passage précédent a été interrompu).
  const ours = () => page.locator('.scard[data-id]').filter({ has: page.locator('.title', { hasText: /^Nuits d’automne$/ }) });
  for (let k = 0; k < 5; k++) {
    await page.goto('/admin/series');
    const s = ours().first();
    if (!(await s.count())) break;
    await s.locator('summary[aria-label^="Plus d’actions"]').click();
    await s.locator('.danger > summary').click();
    await page.locator('dialog[open]').getByRole('button', { name: /^Supprimer/ }).click();
    await page.waitForLoadState('load');
  }
  await page.goto('/admin/series');
  await expect(ours()).toHaveCount(0);
});
