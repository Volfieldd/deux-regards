import { test, expect } from '@playwright/test';

// Admin v2 (MQ-07 à MQ-10), au bureau (Chrome) et au téléphone (Pixel 7), avec le compte de test de la v2 (Sébastien) :
// menu sans script, focus jamais caché sous les barres, onglets en cases au téléphone, le lot au clavier (enregistrer,
// Défaire, Appliquer), aucun débordement.
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
const lotIds = async page => {
  await page.goto('/admin/photos');
  return page.locator('.tile').evaluateAll(ts => ts.slice(0, 3).map(t => Number(t.dataset.id)));
};
const PAGES = ['/admin', '/admin/reglages/assistants', '/admin/droits', '/admin/images', '/admin/auteurs', '/admin/compte'];

test('les écrans de la v2 : titre, menu à quatre groupes, onglet courant, Vigie absente sans réglage', async ({ page }) => {
  for (const [url, h1] of [['/admin', /^(Bonjour|Bonsoir)/], ['/admin/reglages/assistants', 'Réglages'], ['/admin/droits', 'Réglages'], ['/admin/compte', 'Mon compte']]) {
    await page.goto(url);
    await expect(page.locator('h1')).toHaveText(h1);
    await expect(page.locator('link[href*="admin/v2/v2.css"]')).toHaveCount(1);
    await expect(page.locator('.side .grp')).toHaveText(['Photos', 'Personnes', 'Publier', 'Équipe']);
  }
  await page.goto('/admin/reglages/assistants');
  await expect(page.locator('.onglets a[aria-current="page"]')).toHaveText('Assistants d’analyse');
});

test('menu du téléphone sans JavaScript : « Menu » l’ouvre, la page dessous est masquée, « Fermer » le referme', async ({ browser }, info) => {
  test.skip(!phone(info), 'téléphone seulement');
  const ctx = await browser.newContext({ ...info.project.use, storageState: STATE, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/admin/droits');
  const side = page.locator('#admin-nav');
  await expect(side).toBeHidden();
  await page.locator('.tabbar a[href="#admin-nav"]').click();
  await expect(side).toBeVisible();
  await expect(page.locator('main#contenu')).toBeHidden();
  await expect(side.getByRole('link', { name: /Réglages/ })).toBeVisible();
  // Au clavier, rien sous le panneau : la tabulation ne sort pas du menu (le lien d'évitement mis à part).
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => { const a = document.activeElement; return !a || a === document.body || a.closest('#admin-nav') !== null || a.matches('.skip'); });
    expect(inside, `tabulation ${i}`).toBe(true);
  }
  await side.getByRole('link', { name: /Fermer/ }).click();
  await expect(side).toBeHidden();
  await expect(page.locator('main#contenu')).toBeVisible();
  await ctx.close();
});

test('menu du téléphone avec JavaScript : un bouton, la page inerte, Échap le referme et rend le focus', async ({ page }, info) => {
  test.skip(!phone(info), 'téléphone seulement');
  await page.goto('/admin');
  const menu = page.locator('.tabbar').getByRole('button', { name: 'Menu' });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  expect(await page.locator('main#contenu').evaluate(m => m.inert)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
});

test('onglets des Réglages en cases au téléphone : tous visibles, passés à la ligne, le courant cerclé', async ({ page }, info) => {
  test.skip(!phone(info), 'téléphone seulement');
  await page.goto('/admin/images');
  const tabs = page.locator('.onglets a');
  const n = await tabs.count();
  expect(n).toBeGreaterThan(3);
  const vw = page.viewportSize().width;
  const boxes = [];
  for (let i = 0; i < n; i++) boxes.push(await tabs.nth(i).boundingBox());
  for (const b of boxes) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(vw); expect(b.height).toBeGreaterThanOrEqual(44); }
  expect(new Set(boxes.map(b => Math.round(b.y))).size, 'plusieurs rangées').toBeGreaterThan(1);
  const cur = page.locator('.onglets a[aria-current="page"]');
  await expect(cur).toHaveText('Filigrane et EXIF');
  expect(await cur.evaluate(a => getComputedStyle(a).borderTopStyle)).toBe('solid');
  expect(await page.locator('.onglets ul').evaluate(u => u.scrollWidth <= u.clientWidth)).toBe(true);
});

test('focus jamais caché sous une barre fixe ou collante (WCAG 2.4.11)', async ({ page }) => {
  test.setTimeout(120_000);           // trois pages, soixante tabulations chacune
  const ids = await lotIds(page);
  for (const url of [`/admin/photos/lot?ids=${ids.join(',')}`, '/admin/droits', '/admin/reglages/assistants']) {
    await page.goto(url);
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const hidden = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body || a.closest('#admin-nav') || a.closest('.tabbar') || a.closest('.ep-actions') || a.closest('dialog')) return null;
        const r = a.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        const bars = [...document.querySelectorAll('.tabbar, .ep-actions, .bulk')].filter(b => ['fixed', 'sticky'].includes(getComputedStyle(b).position) && b.offsetParent !== null && !b.contains(a));
        const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.bottom - 2]];
        const covered = pts.filter(([x, y]) => bars.some(b => { const q = b.getBoundingClientRect(); return x >= q.left && x <= q.right && y >= q.top && y <= q.bottom; }));
        return covered.length === pts.length ? (a.id || a.name || a.textContent.trim().slice(0, 30)) : null;
      });
      expect(hidden, `${url}, tabulation ${i}`).toBeNull();
    }
  }
});

test('le lot au clavier : un champ s’enregistre en le quittant, le témoin le dit, « Défaire » le rétablit', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (le clavier)');
  const [id] = await lotIds(page);
  await page.goto(`/admin/photos/lot?ids=${id}`);
  const place = page.locator(`#lieu-${id}`);
  const before = await place.inputValue();
  await place.focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Quai Ligny');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-temoin] .enreg--ok')).toContainText('Enregistré à');
  const toast = page.locator('[data-toast]');
  await expect(toast).toContainText('Lieu');
  // « Défaire » atteint au clavier ; le message reste tant que le focus y est ; le focus revient au champ.
  await toast.getByRole('button', { name: 'Défaire' }).focus();
  await page.keyboard.press('Enter');
  await expect(place).toHaveValue(before);
  await expect(place).toBeFocused();
  await page.reload();
  await expect(place).toHaveValue(before);
  // Une date refusée : dite sous la ligne, et dans le témoin, avec un lien vers le champ.
  const date = page.locator(`#date-${id}`);
  const d0 = await date.inputValue();
  await date.fill('14/15/2026');
  await date.press('Tab');
  await expect(page.locator(`#err-date-${id}`)).toContainText('Erreur');
  await expect(date).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-temoin] a.enreg--attente')).toContainText('1 champ non enregistré');
  await page.locator('[data-temoin] a').click();
  await expect(date).toBeFocused();
  // Quitter la page : le dialogue retient (Rester d'abord) ; puis on corrige.
  await page.locator('.ep-retour').click();
  const quit = page.locator('dialog[data-quitter]');
  await expect(quit).toBeVisible();
  await expect(quit.getByRole('button', { name: 'Rester' })).toBeFocused();
  await page.keyboard.press('Escape');
  await date.fill(d0);
  await date.press('Tab');
  await expect(page.locator('[data-temoin] .enreg--ok')).toBeVisible();
});

test('le lot : « Appliquer » aux photos cochées, au clavier, puis « Défaire »', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau seulement : les deux projets partagent les photos de démonstration');
  const ids = await lotIds(page);
  await page.goto(`/admin/photos/lot?ids=${ids.join(',')}`);
  const before = await Promise.all(ids.map(id => page.locator(`#lieu-${id}`).inputValue()));
  const toggle = page.locator('[data-bulk-toggle]');
  if (await toggle.isVisible()) { await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'true'); }
  await page.locator('#b-lieu').fill('Angers');
  await expect(page.locator('[data-bulk-count]')).toHaveText(`Pour les ${ids.length} photos cochées :`);
  await page.locator('[data-bulk-apply]').press('Enter');
  for (const id of ids) await expect(page.locator(`#lieu-${id}`)).toHaveValue('Angers');
  await page.locator('[data-toast]').getByRole('button', { name: 'Défaire' }).click();
  await page.waitForLoadState('load');
  for (const [i, id] of ids.entries()) await expect(page.locator(`#lieu-${id}`)).toHaveValue(before[i]);
});

test('palette Ctrl K : « impressum » mène aux mentions légales ; aucun résultat annoncé avec une issue', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (le clavier)');
  await page.goto('/admin');
  await page.keyboard.press('Control+k');
  const pal = page.locator('dialog[data-cmdk]');
  await expect(pal).toBeVisible();
  await page.keyboard.type('impressum');
  await expect(pal.locator('[role="option"]').first()).toContainText('Mentions légales');
  await expect(pal.locator('[data-cmdk-status]')).toContainText('résultat');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('zzzz');
  await expect(pal.locator('[data-cmdk-status]')).toContainText('Aucun résultat pour « zzzz »');
  await page.keyboard.press('Escape');
});

test('aucun débordement horizontal, de 320 à 1 440 px (et 1 032 × 1 250, 1 376 × 900)', async ({ page }, info) => {
  test.skip(phone(info), 'les largeurs sont posées ici');
  test.setTimeout(180_000);
  const ids = await lotIds(page);
  const urls = [...PAGES, `/admin/photos/lot?ids=${ids.join(',')}`, '/admin/rencontre', '/admin/rencontre/accueil'];
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
