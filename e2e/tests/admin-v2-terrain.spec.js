import { test, expect } from '@playwright/test';
import { creerRencontre, effacerRencontre, creerVoyage, supprimerVoyage, csrfOf } from './terrain-donnees.js';

// Admin v2, vague 3b : Personnes, une rencontre, Séries, Sorties, Voyages, au bureau (Chrome) et au téléphone (Pixel 7),
// avec le compte de test de la v2 (Sébastien) : au clavier (enregistrer, Défaire, ordre des séries, dialogues), focus
// jamais caché, sans JavaScript pour les écritures, aucun débordement. Les tests qui écrivent créent leurs données et les
// effacent ensuite (le jeu de démonstration n'a ni rencontre ni voyage).
const STATE = 'results/.auth/admin-v2.json';
test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
test.use({ storageState: STATE });

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
});
test.afterEach(async () => expect(errors, 'erreurs console / CSP').toEqual([]));

const phone = info => info.project.name === 'mobile';
const v2 = page => expect(page.locator('link[href*="admin/v2/contenus-v2.css"]')).toHaveCount(1);

test('Séries : un champ s’enregistre en le quittant, « Défaire » au clavier le rétablit ; l’ordre au clavier, avec « Défaire »', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (le clavier, et les données partagées)');
  await page.goto('/admin/series');
  await v2(page);
  const card = page.locator('.serie-c').first();
  const name = (await card.locator('[data-serie-nom]').textContent()).trim();
  await card.locator('details.modif > summary').click();
  const intent = card.locator('textarea[name="intent"]');
  const before = await intent.inputValue();
  await intent.fill('Essai : ce que la série cherche.');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-temoin] .enreg--ok')).toContainText('Enregistré à');
  await expect(card.locator('[data-serie-intention]')).toHaveText('Essai : ce que la série cherche.');
  const toast = page.locator('[data-toast]');
  await expect(toast).toContainText(`« Texte d’intention » de « ${name} »`);
  await toast.getByRole('button', { name: 'Défaire' }).focus();
  await page.keyboard.press('Enter');
  await expect(intent).toHaveValue(before);
  await expect(intent).toBeFocused();
  await page.reload();
  await page.locator('.serie-c').first().locator('details.modif > summary').click();
  await expect(page.locator('.serie-c').first().locator('textarea[name="intent"]')).toHaveValue(before);
  // Un nom vide : l'erreur sous le champ et dans le témoin, rien d'enregistré.
  const nom = page.locator('.serie-c').first().locator('input[name="name"]');
  await nom.fill('');
  await nom.press('Tab');
  await expect(page.locator(`#err-${await nom.getAttribute('id')}`)).toContainText('Erreur');
  await expect(page.locator('[data-temoin] a.enreg--attente')).toContainText('1 champ non enregistré');
  await nom.fill(name);
  await nom.press('Tab');
  await expect(page.locator('[data-temoin] .enreg--ok')).toBeVisible();
  // L'ordre : la poignée et la flèche bas, puis « Défaire ».
  const order = () => page.locator('.serie-c').evaluateAll(l => l.map(x => x.dataset.id));
  const o0 = await order();
  await page.locator('.serie-c').first().locator('[data-poignee]').focus();
  await page.keyboard.press('ArrowDown');
  await expect(toast).toContainText(`« ${name} » : 2ᵉ sur`);
  expect((await order())[1]).toBe(o0[0]);
  await expect(page.locator('.serie-c').nth(1).locator('[data-poignee]')).toBeFocused();
  await toast.getByRole('button', { name: 'Défaire' }).click();
  await expect(toast).toContainText('Ordre rétabli.');
  expect(await order()).toEqual(o0);
  await page.reload();
  expect(await order()).toEqual(o0);
});

test('Séries : « Supprimer… » ouvre son dialogue, Annuler d’abord ; Échap le ferme', async ({ page }) => {
  await page.goto('/admin/series');
  const card = page.locator('.serie-c').first();
  await card.locator('details.menu > summary').click();
  await card.getByRole('link', { name: 'Supprimer…' }).click();
  const d = card.locator('dialog.confirm');
  await expect(d).toBeVisible();
  await expect(d.locator('[data-annuler]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(d).toBeHidden();
});

test('Voyage : le nom s’enregistre en le quittant ; supprimer passe par un dialogue (Annuler d’abord, Échap rend le focus)', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (les données partagées)');
  const id = await creerVoyage(page, `Essai e2e voyage ${Date.now() % 100000}`);
  try {
    await page.goto(`/admin/voyages/${id}`);
    await v2(page);
    const nom = page.locator('#tr-name');
    await nom.fill('Essai e2e, bords de Loire');
    await nom.press('Tab');
    await expect(page.locator('[data-temoin] .enreg--ok')).toContainText('Enregistré à');
    await expect(page.locator('[data-voyage-titre]')).toHaveText('Essai e2e, bords de Loire');
    await page.reload();
    await expect(nom).toHaveValue('Essai e2e, bords de Loire');
    const open = page.getByRole('link', { name: 'Supprimer le voyage…' });
    await open.click();
    const d = page.locator('#dlg-supprimer');
    await expect(d).toBeVisible();
    await expect(d.getByRole('link', { name: 'Annuler' })).toBeFocused();
    await expect(d).toContainText('restent');
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    await expect(open).toBeFocused();
    await open.click();
    await d.getByRole('button', { name: 'Supprimer le voyage' }).click();
    await expect(page).toHaveURL(/\/admin\/voyages$/);
    await expect(page.locator('.flash.ok')).toContainText('supprimé');
  } finally { await supprimerVoyage(page, id); }
});

test('Rencontre et personne : la fiche, effacer par son dialogue ; la sortie : le lieu au champ quitté, les cases comptées', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (les données partagées)');
  const r = await creerRencontre(page, { jour: '2025-10-14', nom: 'Inès Essai' });
  try {
    await page.goto(`/admin/rencontres/${r.id}`);
    await v2(page);
    await expect(page.locator('h1')).toContainText('Inès Essai');
    await expect(page.locator('.fiche-pastilles')).toContainText('Accord signé : site');
    const open = page.getByRole('link', { name: 'Effacer les données…' });
    await open.click();
    const d = page.locator('#dlg-effacer');
    await expect(d.getByRole('link', { name: 'Annuler' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(open).toBeFocused();
    // La fiche de la personne.
    await page.getByRole('link', { name: 'Fiche de la personne' }).click();
    await v2(page);
    await expect(page.locator('h1')).toHaveText('Inès Essai');
    // La sortie du jour : le lieu au champ quitté.
    await page.goto('/admin/sorties/sebastien/2025-10-14');
    await v2(page);
    const lieu = page.locator('#o-lieu');
    const place = `Quais d’essai ${Date.now() % 100000}`;
    await lieu.fill(place);
    await lieu.press('Tab');
    await expect(page.locator('[data-temoin] .enreg--ok')).toBeVisible();
    await expect(page.locator('[data-sortie-titre]')).toHaveText(place);
  } finally { await effacerRencontre(page, r.id); }
});

test('sans JavaScript : la série s’enregistre par son bouton ; « Effacer les données… » et « Supprimer le voyage… » s’ouvrent dans la page', async ({ browser }, info) => {
  test.skip(phone(info), 'au bureau (les données partagées)');
  const ctx = await browser.newContext({ ...info.project.use, storageState: STATE, javaScriptEnabled: false });
  const page = await ctx.newPage();
  const r = await creerRencontre(page, { jour: '2025-10-15', nom: 'Sans Script' });
  const tid = await creerVoyage(page, 'Essai sans script');
  try {
    await page.goto('/admin/series');
    const card = page.locator('.serie-c').first();
    const name = (await card.locator('[data-serie-nom]').textContent()).trim();
    await card.locator('details.modif > summary').click();
    const btn = card.getByRole('button', { name: `Enregistrer « ${name} »` });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator('.flash.ok')).toContainText('Série enregistrée.');
    await page.goto(`/admin/rencontres/${r.id}`);
    await page.getByRole('link', { name: 'Effacer les données…' }).click();
    await expect(page.locator('#dlg-effacer')).toBeVisible();
    await page.goto(`/admin/voyages/${tid}`);
    await page.getByRole('link', { name: 'Supprimer le voyage…' }).click();
    await expect(page.locator('#dlg-supprimer')).toBeVisible();
    await page.locator('#dlg-supprimer').getByRole('button', { name: 'Supprimer le voyage' }).click();
    await expect(page).toHaveURL(/\/admin\/voyages$/);
  } finally {
    await effacerRencontre(page, r.id);
    await supprimerVoyage(page, tid);
    await ctx.close();
  }
});

test('focus jamais caché sous une barre fixe ou collante : Personnes, rencontre, Séries, Sorties, Voyages (WCAG 2.4.11)', async ({ page }) => {
  test.setTimeout(240_000);
  const r = await creerRencontre(page, { jour: '2025-10-16', nom: 'Focus Essai' });
  const tid = await creerVoyage(page, 'Essai focus');
  try {
    for (const url of ['/admin/personnes', '/admin/rencontres', `/admin/rencontres/${r.id}`, '/admin/series', '/admin/sorties', '/admin/sorties/sebastien/2025-10-16', '/admin/voyages', `/admin/voyages/${tid}`]) {
      await page.goto(url);
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        const hidden = await page.evaluate(() => {
          const a = document.activeElement;
          if (!a || a === document.body || a.closest('#admin-nav') || a.closest('.tabbar') || a.closest('.ep-actions') || a.closest('.sortie-cochees') || a.closest('dialog')) return null;
          const rect = a.getBoundingClientRect();
          if (!rect.width || !rect.height) return null;
          const bars = [...document.querySelectorAll('.tabbar, .ep-actions, .sortie-cochees')].filter(b => ['fixed', 'sticky'].includes(getComputedStyle(b).position) && b.offsetParent !== null && !b.contains(a) && getComputedStyle(b).display !== 'none');
          const pts = [[rect.left + rect.width / 2, rect.top + rect.height / 2], [rect.left + 2, rect.top + 2], [rect.right - 2, rect.bottom - 2]];
          const covered = pts.filter(([x, y]) => bars.some(b => { const q = b.getBoundingClientRect(); return x >= q.left && x <= q.right && y >= q.top && y <= q.bottom; }));
          return covered.length === pts.length ? (a.id || a.name || a.textContent.trim().slice(0, 30)) : null;
        });
        expect(hidden, `${url}, tabulation ${i}`).toBeNull();
      }
    }
  } finally { await effacerRencontre(page, r.id); await supprimerVoyage(page, tid); }
});

test('aucun débordement horizontal de 320 à 1 440 px : Personnes, rencontre, personne, Séries, Sorties, sortie, Voyages, voyage', async ({ page }, info) => {
  test.skip(phone(info), 'les largeurs sont posées ici');
  test.setTimeout(240_000);
  const r = await creerRencontre(page, { jour: '2025-10-17', nom: 'Largeur Essai' });
  const tid = await creerVoyage(page, 'Essai largeur');
  try {
    await page.goto(`/admin/rencontres/${r.id}`);
    const person = await page.getByRole('link', { name: 'Fiche de la personne' }).getAttribute('href');
    const urls = ['/admin/personnes', '/admin/rencontres', `/admin/rencontres/${r.id}`, person, '/admin/series', '/admin/sorties', '/admin/sorties/sebastien/2025-10-17', '/admin/voyages', `/admin/voyages/${tid}`];
    for (const [w, h] of [[320, 640], [412, 839], [1032, 1250], [1376, 900], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const url of urls) {
        await page.goto(url);
        const out = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const bad = [...document.querySelectorAll('body *')].filter(el => {
            if (el.closest('.sr-only, dialog:not([open]), [hidden], details:not([open]) > :not(summary), #admin-nav')) return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.right > vw + 1;
          }).map(el => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60));
          return { scroll: document.documentElement.scrollWidth - vw, bad: bad.slice(0, 5) };
        });
        expect(out.scroll, `${url} à ${w} px`).toBeLessThanOrEqual(0);
        expect(out.bad, `${url} à ${w} px`).toEqual([]);
      }
    }
  } finally { await effacerRencontre(page, r.id); await supprimerVoyage(page, tid); }
});

test('au téléphone : une rencontre se lit et se corrige au doigt (cibles de 44 px), la sortie aussi', async ({ page }, info) => {
  test.skip(!phone(info), 'téléphone seulement');
  const r = await creerRencontre(page, { jour: '2025-10-18', nom: 'Doigt Essai' });
  try {
    await page.goto(`/admin/rencontres/${r.id}`);
    await v2(page);
    await page.getByText('Corriger la rencontre et la carte').click();
    for (const sel of ['#rc-ref', '#rc-email', '.renc-form button[type="submit"]']) {
      const box = await page.locator(sel).boundingBox();
      expect(box.height, sel).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.goto('/admin/sorties/sebastien/2025-10-18');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  } finally { await effacerRencontre(page, r.id); }
});

test('CSRF : une écriture JSON sans jeton est refusée', async ({ page }) => {
  await page.goto('/admin/series');
  const id = await page.locator('.serie-c').first().getAttribute('data-id');
  const res = await page.request.post(`/admin/series/${id}`, { data: { name: 'Sans jeton' }, headers: { accept: 'application/json' } });
  expect(res.status()).toBe(403);
  expect(await csrfOf(page)).toBeTruthy();
});
