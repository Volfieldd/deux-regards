import { test, expect, devices } from '@playwright/test';

// Admin v2, vague 2 : la fiche d'une photo, la photothèque, « À valider », au bureau (Chrome), au téléphone (Pixel 7) et
// sur iPad, avec le compte de test de la v2 (Sébastien) : au clavier (enregistrer, Défaire, dialogues, raccourcis), focus
// jamais caché, sans JavaScript pour les écritures, aucun débordement. Les tests qui écrivent tournent au bureau seulement
// (les deux projets partagent les photos de démonstration) et remettent ce qu'ils ont changé.
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
const ids = async page => { await page.goto('/admin/photos'); return page.locator('.tile').evaluateAll(ts => ts.map(t => Number(t.dataset.id))); };
const csrf = page => page.locator('body').getAttribute('data-csrf');
// Une photo en brouillon le temps d'un test (rendue à son état ensuite).
const asDraft = async (page, id) => page.request.post(`/admin/photos/${id}/status`, { form: { _csrf: await csrf(page), status: 'draft', back: '/admin/photos' } });
const asPublished = async (page, id) => page.request.post(`/admin/photos/${id}/status`, { form: { _csrf: await csrf(page), status: 'published', back: '/admin/photos' } });

test('fiche : un champ s’enregistre en le quittant, le témoin le dit, « Défaire » au clavier le rétablit', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (le clavier, et les données partagées)');
  const [id] = await ids(page);
  await page.goto(`/admin/photos/${id}`);
  await expect(page.locator('link[href*="admin/v2/v2.css"]')).toHaveCount(1);
  const legend = page.locator('#legend');
  const before = await legend.inputValue();
  await legend.focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Brume du matin, essai.');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-temoin] .enreg--ok')).toContainText('Enregistré à');
  const toast = page.locator('[data-toast]');
  await expect(toast).toContainText('Légende');
  await toast.getByRole('button', { name: 'Défaire' }).focus();
  await page.keyboard.press('Enter');
  await expect(legend).toHaveValue(before);
  await expect(legend).toBeFocused();
  await page.reload();
  await expect(legend).toHaveValue(before);
  // Une date refusée : sous le champ, dans le témoin ; quitter la page retient (Rester d'abord).
  const date = page.locator('#taken_on');
  const d0 = await date.inputValue();
  await date.fill('demain matin');
  await date.press('Tab');
  await expect(page.locator('#err-taken_on')).toContainText('Erreur');
  await expect(date).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-temoin] a.enreg--attente')).toContainText('1 champ non enregistré');
  await page.locator('.ep-retour').click();
  const quit = page.locator('dialog[data-quitter]');
  await expect(quit).toBeVisible();
  await expect(quit.getByRole('button', { name: 'Rester' })).toBeFocused();
  await page.keyboard.press('Escape');
  await date.fill(d0);
  await date.press('Tab');
  await expect(page.locator('[data-temoin] .enreg--ok')).toBeVisible();
});

test('fiche : « Dépublier… » ouvre son dialogue, Annuler d’abord ; Échap le ferme et rend le focus', async ({ page }) => {
  const [id] = await ids(page);
  await page.goto(`/admin/photos/${id}`);
  const open = page.locator('#publication').getByRole('link', { name: 'Dépublier…' });
  await open.click();
  const d = page.locator('#dlg-depublier');
  await expect(d).toBeVisible();
  await expect(d.getByRole('link', { name: 'Annuler' })).toBeFocused();
  await expect(d.getByLabel(/Raison/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(d).toBeHidden();
  await expect(open).toBeFocused();
});

test('fiche sans JavaScript : « Enregistrer la fiche » envoie le formulaire ; « Dépublier… » s’ouvre dans la page', async ({ browser }, info) => {
  test.skip(phone(info), 'au bureau (les données partagées)');
  const ctx = await browser.newContext({ ...info.project.use, storageState: STATE, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/admin/photos');
  // La troisième photo : la première sert au test avec script, qui tourne en même temps.
  const id = await page.locator('.tile').nth(2).getAttribute('data-id');
  await page.goto(`/admin/photos/${id}`);
  const legend = page.locator('#legend');
  const before = await legend.inputValue();
  await legend.fill('Sans script.');
  await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
  await expect(page.locator('.flash.ok')).toContainText('Photo enregistrée');
  await expect(legend).toHaveValue('Sans script.');
  await expect(page.locator('.ep-titre .etat')).toHaveText('Publiée');
  await legend.fill(before);
  await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
  await expect(legend).toHaveValue(before);
  await page.locator('#publication').getByRole('link', { name: 'Dépublier…' }).click();
  const d = page.locator('#dlg-depublier');
  await expect(d).toBeVisible();
  await expect(d.getByRole('button', { name: 'Dépublier la photo' })).toBeVisible();
  await d.getByRole('link', { name: 'Annuler' }).click();
  await expect(d).toBeHidden();
  await ctx.close();
});

test('photothèque : l’inspecteur annonce la photo, une erreur sous le champ, P ouvre la publication confirmée', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (le clavier, et les données partagées)');
  const all = await ids(page);
  const id = all.at(-1);
  await asDraft(page, id);
  try {
    await page.goto('/admin/photos');
    await page.locator(`#photo-${id}`).click({ position: { x: 30, y: 30 } });
    const insp = page.locator('[data-inspector]');
    const title = await page.locator(`#photo-${id} .ttl`).textContent();
    await expect(insp.locator('h2')).toHaveText(title);
    await expect(insp.locator('[data-annonce]')).toContainText(`« ${title} » sélectionnée`);
    // Une date refusée : l'erreur sous le champ (UX-A-14), pas seulement dans le message.
    const date = page.locator('#one-date');
    const d0 = await date.inputValue();
    await date.fill('demain matin');
    await date.press('Enter');
    await expect(page.locator('#err-one-date')).toContainText('Erreur');
    await expect(date).toHaveAttribute('aria-invalid', 'true');
    await date.fill(d0);
    await date.press('Enter');
    await expect(date).not.toHaveAttribute('aria-invalid', 'true');
    // P, le focus sur la vignette : le dialogue de publication, jamais une publication directe (UX-A-02).
    await page.locator(`#photo-${id} .chk`).focus();
    await page.keyboard.press('p');
    const dlg = page.locator('dialog[data-dlg-publier]');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Annuler' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await page.goto(`/admin/photos/${id}`);
    await expect(page.locator('.ep-titre .etat')).toHaveText('Brouillon');
    // P puis « Publier la photo » : publiée, et « Défaire » la remet en brouillon.
    await page.goto('/admin/photos');
    await page.locator(`#photo-${id}`).click({ position: { x: 30, y: 30 } });
    await page.locator(`#photo-${id} .chk`).focus();
    await page.keyboard.press('p');
    await dlg.getByRole('button', { name: 'Publier la photo' }).click();
    await expect(page.locator('[data-toast]')).toContainText('publiée');
    await page.locator('[data-toast]').getByRole('button', { name: 'Défaire' }).click();
    await expect(page.locator('[data-toast]')).toContainText('annulée');
  } finally {
    await asPublished(page, id);
  }
});

test('photothèque sans JavaScript : filtrer, cocher et agir par le formulaire', async ({ browser }, info) => {
  test.skip(phone(info), 'au bureau (les données partagées)');
  const ctx = await browser.newContext({ ...info.project.use, storageState: STATE, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/admin/photos');
  const serie = page.getByLabel('Série', { exact: true }).first();
  const slug = await serie.locator('option').nth(1).getAttribute('value');
  await serie.selectOption(slug);
  await page.getByRole('button', { name: 'Filtrer' }).click();
  await expect(page).toHaveURL(new RegExp(`serie=${slug}`));
  await page.locator('.tile .chk').first().check();
  await page.getByRole('button', { name: 'Retirer de la carte' }).click();
  await expect(page.locator('.flash')).toBeVisible();
  await ctx.close();
});

test('À valider : la liste, puis valider après le dialogue ; renvoyer s’ouvre sans script', async ({ page, browser }, info) => {
  test.skip(phone(info), 'au bureau (les données partagées)');
  const all = await ids(page);
  const id = all.at(-2);
  await asDraft(page, id);
  try {
    await page.request.post(`/admin/photos/${id}/proposer`, { form: { _csrf: await csrf(page), message: 'Essai e2e' } });
    await page.goto('/admin/a-valider');
    await expect(page.locator('h1')).toHaveText('À valider');
    const row = page.locator(`tr[data-photo="${id}"]`);
    await expect(row).toContainText('Essai e2e');
    // Sans script : « Renvoyer… » ouvre son dialogue dans la page.
    const ctx = await browser.newContext({ ...info.project.use, storageState: STATE, javaScriptEnabled: false });
    const np = await ctx.newPage();
    await np.goto('/admin/a-valider');
    await np.locator(`#ouvre-renvoyer-${id}`).click();
    await expect(np.locator(`#dlg-renvoyer-${id}`)).toBeVisible();
    await ctx.close();
    // Avec : cocher, « Publier la photo… », le dialogue (Annuler d'abord), puis publier.
    await row.locator('input[name="ids"]').check();
    await page.locator('[data-rv-valider]').click();
    const dlg = page.locator('dialog[data-dlg-valider]');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Annuler' })).toBeFocused();
    await dlg.getByRole('button', { name: /^Publier/ }).click();
    await expect(page.locator('.flash.ok')).toContainText('publiée');
  } finally {
    await asPublished(page, id);
  }
});

test('focus jamais caché sous une barre fixe ou collante : fiche, photothèque, À valider (WCAG 2.4.11)', async ({ page }) => {
  test.setTimeout(150_000);
  const [id] = await ids(page);
  for (const url of [`/admin/photos/${id}`, '/admin/photos', '/admin/a-valider']) {
    await page.goto(url);
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('Tab');
      const hidden = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body || a.closest('#admin-nav') || a.closest('.tabbar') || a.closest('.ep-actions') || a.closest('dialog') || a.closest('.insp')) return null;
        const r = a.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        const bars = [...document.querySelectorAll('.tabbar, .ep-actions, .insp')].filter(b => ['fixed', 'sticky'].includes(getComputedStyle(b).position) && b.offsetParent !== null && !b.contains(a) && getComputedStyle(b).display !== 'none');
        const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.bottom - 2]];
        const covered = pts.filter(([x, y]) => bars.some(b => { const q = b.getBoundingClientRect(); return x >= q.left && x <= q.right && y >= q.top && y <= q.bottom; }));
        return covered.length === pts.length ? (a.id || a.name || a.textContent.trim().slice(0, 30)) : null;
      });
      expect(hidden, `${url}, tabulation ${i}`).toBeNull();
    }
  }
});

test('au téléphone : toucher une vignette ouvre la feuille de l’inspecteur ; le titre s’y lit', async ({ page }, info) => {
  test.skip(!phone(info), 'téléphone seulement');
  await page.goto('/admin/photos');
  const tile = page.locator('.tile').first();
  await tile.click({ position: { x: 40, y: 40 } });
  const insp = page.locator('[data-inspector]');
  await expect(insp).toHaveClass(/has-sel/);
  await expect(insp.locator('h2')).toHaveText((await tile.locator('.ttl').textContent()).trim());
  await expect(page.locator('#one-title')).toBeVisible();
  const box = await page.locator('.insp-ft [data-publish]').boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('sur iPad : la fiche, la photothèque et À valider tiennent dans l’écran, en portrait et en paysage', async ({ browser }, info) => {
  test.skip(phone(info), 'une fois');
  for (const viewport of [{ width: 820, height: 1180 }, { width: 1180, height: 820 }]) {
    const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport, storageState: STATE });
    const page = await ctx.newPage();
    const [id] = await ids(page);
    for (const url of [`/admin/photos/${id}`, '/admin/photos', '/admin/a-valider']) {
      await page.goto(url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${url} ${viewport.width}`).toBeLessThanOrEqual(0);
    }
    await page.goto('/admin/photos');
    await page.locator('.tile').first().tap();
    await expect(page.locator('[data-inspector]')).toHaveClass(/has-sel/);
    await ctx.close();
  }
});

test('aucun débordement horizontal de la fiche, de la photothèque et d’À valider, de 320 à 1 440 px', async ({ page }, info) => {
  test.skip(phone(info), 'les largeurs sont posées ici');
  test.setTimeout(180_000);
  const [id] = await ids(page);
  const urls = [`/admin/photos/${id}`, '/admin/photos', '/admin/photos?vue=liste', '/admin/a-valider'];
  for (const [w, h] of [[320, 640], [412, 839], [1032, 1250], [1376, 900], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const url of urls) {
      await page.goto(url);
      const out = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const bad = [...document.querySelectorAll('body *')].filter(el => {
          if (el.closest('.sr-only, dialog:not([open]), [hidden], details:not([open]) > :not(summary), #admin-nav')) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > vw + 1;
        }).map(el => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60));
        return { scroll: document.documentElement.scrollWidth - vw, bad: bad.slice(0, 5) };
      });
      expect(out.scroll, `${url} à ${w} px`).toBeLessThanOrEqual(0);
      expect(out.bad, `${url} à ${w} px`).toEqual([]);
    }
  }
});
