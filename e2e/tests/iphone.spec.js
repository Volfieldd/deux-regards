import { test, expect } from '@playwright/test';
const STATE = 'results/.auth/admin.json';

// Admin au toucher, dans WebKit (moteur de Safari) : voir docs/audit-iphone-2026-10.
test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
test.use({ storageState: STATE });

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
});
test.afterEach(async () => expect(errors, 'erreurs JavaScript').toEqual([]));

const ids = async page => {
  await page.goto('/admin/photos');
  return page.locator('.tile').evaluateAll(ts => ts.slice(0, 3).map(t => Number(t.dataset.id)));
};
// Le champ est-il réellement touchable une fois amené au milieu de l'écran (rien par-dessus, rien hors écran) ?
const touchable = loc => loc.evaluate(e => {
  e.scrollIntoView({ block: 'center' });
  const b = e.getBoundingClientRect();
  return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === e && b.left >= 0 && b.right <= innerWidth;
});

test('compléter et publier : chaque champ de chaque photo est touchable', async ({ page }) => {
  const lot = await ids(page);
  await page.goto(`/admin/photos/lot?ids=${lot.join(',')}`);
  for (const id of lot) {
    for (const f of ['title', 'alt_text', 'category_id', 'place', 'taken_on']) {
      expect(await touchable(page.locator(`tr[data-id="${id}"] [data-field="${f}"]`)), `photo ${id}, champ ${f}`).toBe(true);
    }
  }
  // Champs pour toutes les cochées : repliés, puis dépliés par le bouton.
  await expect(page.locator('#bulk-groups select')).toBeHidden();
  await page.getByRole('button', { name: /pour toutes les cochées/ }).tap();
  await expect(page.locator('#bulk-groups select')).toBeVisible();
});

test('compléter et publier : changer la série d’une photo depuis sa carte', async ({ page }) => {
  test.skip(!process.env.E2E_ALLOW_WRITES, 'modifie une photo (E2E_ALLOW_WRITES=1)');
  const [id] = await ids(page);
  await page.goto(`/admin/photos/lot?ids=${id}`);
  const sel = page.locator(`select[name="category_id_${id}"]`);
  const before = await sel.inputValue();
  const other = await sel.locator('option').evaluateAll((os, v) => os.map(o => o.value).find(x => x !== v), before);
  await sel.focus();
  await sel.selectOption(other);
  await sel.blur();                                                 // au clavier ou par programme, la liste agit en la quittant (WCAG 3.2.2)
  await expect(page.locator(`tr[data-id="${id}"] [data-state]`)).toHaveText('✓ Enregistré');
  await page.reload();
  await expect(sel).toHaveValue(other);
  await sel.focus();
  await sel.selectOption(before);                                   // remise en état
  await sel.blur();
  await expect(page.locator(`tr[data-id="${id}"] [data-state]`)).toHaveText('✓ Enregistré');
});

test('photothèque : une photo touchée s’ouvre en un toucher', async ({ page }) => {
  await page.goto('/admin/photos');
  await page.locator('.tile a.img').first().tap();
  const open = page.locator('[data-one-open]');
  await expect(open).toBeInViewport();
  await open.tap();
  await expect(page).toHaveURL(/\/admin\/photos\/\d+$/);
});

test('cibles d’au moins 44 px', async ({ page }) => {
  for (const url of ['/admin/photos', '/admin/series']) {
    await page.goto(url);
    const small = await page.evaluate(() => [...document.querySelectorAll('a, button, select, input:not([type=hidden]), summary')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height && getComputedStyle(el).visibility !== 'hidden' && r.height < 44
        && !el.closest('label.inline') && !el.matches('.skip, input[type=checkbox], input[type=radio], .tile .ttl'); })
      .map(el => `${el.tagName.toLowerCase()} « ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)} »`));
    expect(small, url).toEqual([]);
  }
});
