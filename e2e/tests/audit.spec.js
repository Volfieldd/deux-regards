import fs from 'node:fs';
import { test, expect } from '@playwright/test';

// Parcours d'audit ergonomique (E2E_AUDIT=1) : captures de chaque état et mesures (clics, écrans, durées).
// Modifie des données de test (import, séries) puis les remet en état. Serveur de test uniquement.
const STATE = 'results/.auth/admin.json';
test.skip(process.env.E2E_AUDIT !== '1', 'E2E_AUDIT=1 requis');
test.use({ storageState: STATE, viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const OUT = 'audit';
const metrics = {};
const shot = (page, id, opts = {}) => page.screenshot({ path: `${OUT}/${id}.png`, ...opts });
const save = () => fs.writeFileSync(`${OUT}/mesures.json`, JSON.stringify(metrics, null, 2));
fs.mkdirSync(OUT, { recursive: true });

test('J1 — importer un lot de photos', async ({ page }) => {
  test.setTimeout(600_000);
  const m = metrics.J1 = { clicks: 0, screens: 0 };
  await page.goto('/admin');
  await shot(page, 'J1-S01-tableau-de-bord');
  await page.getByRole('link', { name: 'Photos', exact: true }).click(); m.clicks++; m.screens++;
  await shot(page, 'J1-S02-page-photos');
  const files = ['DSCF0241.jpg', 'DSCF0242.jpg', 'DSCF0243.jpg', 'notes-de-voyage.jpg'].map(f => `fixtures/audit/${f}`);
  await page.locator('input[type=file]').setInputFiles(files); m.clicks++;
  await shot(page, 'J1-S03-fichiers-choisis', { clip: { x: 0, y: 150, width: 1440, height: 480 } });
  // État vu pendant toute l'attente : on laisse la page réagir au premier envoi, en l'annulant, puis on capture.
  await page.evaluate(() => { window.__hold = e => e.preventDefault(); document.querySelector('[data-import]').addEventListener('submit', window.__hold); });
  await page.getByRole('button', { name: 'Importer', exact: true }).click(); m.clicks++;
  await page.waitForTimeout(300);
  m.feedbackDuringWait = await page.locator('[data-progress]').textContent();
  m.buttonDisabled = await page.getByRole('button', { name: 'Importer', exact: true }).isDisabled();
  await shot(page, 'J1-S04-pendant-import', { clip: { x: 0, y: 150, width: 1440, height: 480 } });
  await page.evaluate(() => { const f = document.querySelector('[data-import]'); f.removeEventListener('submit', window.__hold); f.querySelector('button[type=submit]').disabled = false; });
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await page.waitForURL(/statut=draft/, { timeout: 540_000 });
  m.importSeconds = Math.round((Date.now() - t0) / 100) / 10; m.screens++;
  await shot(page, 'J1-S05-resultat-import');
  m.flash = (await page.locator('.flash').first().textContent()).replace(/\s+/g, ' ').trim();
  save();
});

test('J2 — compléter puis publier les photos importées', async ({ page }) => {
  const m = metrics.J2 = { clicks: 0, screens: 0, perPhotoClicks: [] };
  await page.goto('/admin/photos?statut=draft');
  const titles = await page.locator('.plist li a.ttl').allTextContents();
  m.drafts = titles.length;
  for (const [i, title] of titles.entries()) {
    let c = 0;
    await page.goto('/admin/photos?statut=draft');
    await page.locator('.plist li a.ttl', { hasText: title }).click(); c++;
    if (i === 0) await shot(page, 'J2-S01-fiche-brouillon', { fullPage: true });
    await page.getByLabel('Titre').fill(`Audit ${i + 1}`); c++;
    await page.getByLabel('Lieu').fill('Atelier'); c++;
    await page.getByLabel('Date').fill(i === 0 ? '10/2026' : '2026-10'); c++;
    await page.getByLabel('Publiée').check(); c++;
    await page.getByRole('button', { name: 'Enregistrer' }).click(); c++;
    if (i === 0) {
      await shot(page, 'J2-S02-erreur-date', { fullPage: true });
      await page.getByLabel('Date').fill('2026-10'); c++;
      await page.getByLabel('Publiée').check();
      await page.getByRole('button', { name: 'Enregistrer' }).click(); c++;
      await shot(page, 'J2-S03-enregistre');
    }
    m.perPhotoClicks.push(c);
  }
  m.clicks = m.perPhotoClicks.reduce((a, b) => a + b, 0);
  m.screens = m.drafts * 3;
  save();
});

test('J3 — gérer les séries', async ({ page }) => {
  const m = metrics.J3 = { clicks: 0 };
  await page.goto('/admin/series');
  await shot(page, 'J3-S01-page-series', { fullPage: true });
  await page.getByLabel('Nouvelle série').fill('Nuits d’automne'); m.clicks++;
  await page.getByRole('button', { name: 'Créer' }).click(); m.clicks++;
  await shot(page, 'J3-S02-serie-creee', { fullPage: true });
  const row = page.locator('.rows li', { has: page.locator('input[value="Nuits d’automne"]') });
  m.slugCreated = await row.locator('input[name=slug]').inputValue();
  // Remonter la nouvelle série en tête : un clic par place.
  const count = await page.locator('.rows li').count();
  for (let i = 0; i < count - 1; i++) {
    await page.locator('.rows li', { has: page.locator('input[value="Nuits d’automne"]') }).getByRole('button', { name: /Monter/ }).click(); m.clicks++;
  }
  m.reorderClicksToTop = count - 1;
  await shot(page, 'J3-S03-serie-en-tete', { fullPage: true });
  // Supprimer une série non vide : le refus n'apparaît qu'après ouverture.
  const full = page.locator('.rows li').filter({ has: page.locator('.mono', { hasText: /^[1-9]\d* photo/ }) }).first();
  await full.getByText('Supprimer', { exact: true }).click(); m.clicks++;
  await shot(page, 'J3-S04-suppression-refusee', { fullPage: true });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.reload();
  await shot(page, 'J3-S05-series-mobile', { fullPage: true });
  save();
});

test('J4 — classer 3 photos dans la nouvelle série', async ({ page }) => {
  const m = metrics.J4 = { clicks: 0, screens: 0 };
  await page.goto('/admin/photos');
  await shot(page, 'J4-S01-liste-sans-selection', { clip: { x: 0, y: 560, width: 1440, height: 340 } });
  for (const t of ['Audit 1', 'Audit 2', 'Audit 3']) {
    await page.goto('/admin/photos');
    await page.locator('.plist li a.ttl', { hasText: t }).click(); m.clicks++; m.screens++;
    await page.getByLabel('Série').selectOption({ label: 'Nuits d’automne' }); m.clicks++;
    await page.getByRole('button', { name: 'Enregistrer' }).click(); m.clicks++; m.screens++;
    await page.goto('/admin/photos'); m.clicks++; m.screens++;
  }
  await page.goto('/admin/series');
  await shot(page, 'J4-S02-serie-remplie', { clip: { x: 0, y: 0, width: 1440, height: 520 } });
  save();
});

test('J5 — choisir les photos de l’ouverture', async ({ page }) => {
  const m = metrics.J5 = {};
  await page.goto('/admin/reglages');
  await shot(page, 'J5-S01-reglages', { fullPage: true });
  m.publishedChoices = await page.locator('input[name=hero]').count();
  save();
});

test('nettoyage', async ({ page }) => {
  test.setTimeout(120_000);
  for (const q of ['Audit', 'DSCF']) for (;;) {
    await page.goto(`/admin/photos?q=${q}`);
    if (!(await page.locator('.plist li').count())) break;
    await page.locator('.plist li a.ttl').first().click();
    await page.getByText('Supprimer cette photo').click();
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
  }
  await page.goto('/admin/series');
  const s = page.locator('.rows li', { has: page.locator('input[value="Nuits d’automne"]') });
  if (await s.count()) {
    await s.getByText('Supprimer', { exact: true }).click();
    await s.getByRole('button', { name: /Supprimer « Nuits/ }).click();
  }
  await expect(page.locator('.rows li', { has: page.locator('input[value="Nuits d’automne"]') })).toHaveCount(0);
});
