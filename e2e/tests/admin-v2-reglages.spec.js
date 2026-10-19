import { test, expect } from '@playwright/test';
import zlib from 'node:zlib';

// Admin v2, vague 3a : Identité et apparence, Comptes et rôles, Site public, au bureau (Chrome) et au téléphone (Pixel 7),
// avec le compte de test de la v2 (Sébastien) : au clavier (enregistrer au geste, Défaire, dialogues), focus jamais caché,
// sans JavaScript (les formulaires de la v1, les dialogues par leur ancre), onglets en cases au téléphone, aucun
// débordement. Les tests qui écrivent tournent au bureau seulement et remettent ce qu'ils ont changé.
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
const SCREENS = ['/admin/apparence', '/admin/comptes', '/admin/site'];
const csrf = page => page.locator('body').getAttribute('data-csrf');
const toast = page => page.locator('[data-toast]');
// « Défaire » au clavier : le message d'action est atteint par la tabulation inverse depuis la fin de la page ; ici, le
// bouton reçoit le focus puis Entrée (le message se met en pause tant qu'il a le focus).
const undo = async page => { const b = toast(page).getByRole('button', { name: 'Défaire' }); await b.focus(); await page.keyboard.press('Enter'); };

// Un anneau sombre sur fond transparent (PNG 128 px) : un emblème que le serveur accepte.
function ring() {
  const w = 128, rows = [];
  for (let y = 0; y < w; y++) { const r = [0]; for (let x = 0; x < w; x++) { const d = (x - 64) ** 2 + (y - 64) ** 2; r.push(...(d < 1600 && d > 625 ? [16, 16, 16, 255] : [0, 0, 0, 0])); } rows.push(Buffer.from(r)); }
  const crc = buf => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(w, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

test('les trois écrans en v2 : titre, menu, onglet ou entrée courante', async ({ page }) => {
  for (const [url, h1, current] of [['/admin/apparence', 'Réglages', '.onglets a[aria-current="page"]'], ['/admin/comptes', 'Comptes et rôles', '.side a[aria-current="page"]'], ['/admin/site', 'Site public', '.side a[aria-current="page"]']]) {
    await page.goto(url);
    await expect(page.locator('h1')).toHaveText(h1);
    await expect(page.locator('link[href*="admin/v2/v2.css"]')).toHaveCount(1);
    await expect(page.locator('link[href*="admin/v2/reglages-v2.css"]')).toHaveCount(1);
    await expect(page.locator(current)).toHaveCount(1);
  }
  await expect(page.locator('.side a[aria-current="page"]')).toContainText('Site public');
});

test('Identité et apparence au clavier : le sous-titre en quittant le champ, le thème au choix, « Défaire »', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (le clavier, et les données partagées)');
  await page.goto('/admin/apparence');
  const sub = page.locator('#subtitle');
  const before = await sub.inputValue();
  await sub.focus();
  await sub.fill('Galerie e2e');
  await page.keyboard.press('Tab');
  await expect(toast(page)).toContainText('« Sous-titre » enregistré.');
  await expect(page.locator('[data-temoin]')).toContainText(/Enregistré à/);
  await undo(page);
  await expect(toast(page)).toContainText('« Sous-titre » rétabli.');
  await expect(sub).toHaveValue(before);
  // Thème : les flèches changent le choix, qui s'enregistre ; « Défaire » remet le précédent.
  const checked = page.locator('input[name="theme"]:checked');
  const was = await checked.getAttribute('value');
  await checked.focus();
  await page.keyboard.press('ArrowDown');
  await expect(toast(page)).toContainText('« Thème » enregistré :');
  const now = await page.locator('input[name="theme"]:checked').getAttribute('value');
  expect(now).not.toBe(was);
  await undo(page);
  await expect(toast(page)).toContainText('« Thème » rétabli :');
  await expect(page.locator(`input[name="theme"][value="${was}"]`)).toBeChecked();
  await page.reload();
  await expect(page.locator(`input[name="theme"][value="${was}"]`)).toBeChecked();
  await expect(page.locator('#subtitle')).toHaveValue(before);
});

test('logos : enregistré au choix, « Défaire » dans un emplacement vide ; remplacer et retirer passent par un dialogue (Annuler d’abord)', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (les données partagées)');
  await page.goto('/admin/apparence');
  const slot = page.locator('#marque-partage');
  test.skip(await slot.evaluate(s => s.hasAttribute('data-plein')), 'emplacement déjà rempli sur ce serveur');
  const file = { name: 'anneau.png', mimeType: 'image/png', buffer: ring() };
  await page.locator('#f-partage').setInputFiles(file);
  await expect(toast(page)).toContainText('Image de partage enregistré.');
  await expect(slot.locator('[data-apercu] img')).toHaveCount(1);
  await undo(page);
  await expect(toast(page)).toContainText('Image de partage retiré.');
  await expect(slot.locator('[data-apercu] img')).toHaveCount(0);
  await expect(page.locator('#f-partage')).toBeFocused();
  // Rempli : un nouveau fichier demande d'abord ; Échap annule et rend le focus au champ.
  await page.locator('#f-partage').setInputFiles(file);
  await expect(slot.locator('[data-apercu] img')).toHaveCount(1);
  await page.locator('#f-partage').setInputFiles(file);
  const dlg = page.locator('#dlg-remplacer');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Annuler' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(page.locator('#f-partage')).toBeFocused();
  // Retirer : le dialogue nomme l'emplacement ; Annuler d'abord ; le confirmer retire le fichier (la route de la v1).
  await slot.getByRole('link', { name: /Retirer…/ }).click();
  const rm = page.locator('#dlg-retirer-partage');
  await expect(rm).toBeVisible();
  await expect(rm.getByRole('heading')).toHaveText('Retirer « Image de partage » ?');
  await expect(rm.getByRole('link', { name: 'Annuler' })).toBeFocused();
  await rm.getByRole('button', { name: 'Retirer le fichier' }).click();
  await expect(page.locator('.flash')).toContainText('Image de partage retiré.');
  await expect(page.locator('#marque-partage [data-apercu] img')).toHaveCount(0);
});

test('Comptes et rôles au clavier : Modifier, enregistrer sur place, « Défaire » renvoie l’état d’avant', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (les données partagées)');
  await page.goto('/admin/comptes');
  const card = page.locator('article.rg-compte').filter({ has: page.locator('.enc-tag', { hasText: 'vous' }) });
  await card.locator('summary').focus();
  await page.keyboard.press('Enter');
  const sel = card.locator('select[name="author_id"]');
  await expect(sel).toBeVisible();
  const was = await sel.inputValue();
  const other = await sel.locator('option').evaluateAll((os, w) => os.map(o => o.value).find(v => v && v !== w), was);
  test.skip(!other, 'pas d’autre photographe libre');
  // Lier un photographe déjà lié à un autre compte est refusé sous le formulaire ; rien ne change.
  await sel.selectOption(other);
  await card.getByRole('button', { name: /Enregistrer/ }).press('Enter');
  const err = card.locator('[data-compte-err]');
  const ok = toast(page).getByRole('button', { name: 'Défaire' });
  await expect(err.or(ok).first()).toBeVisible();
  if (await err.isVisible()) {
    await expect(err).toContainText('Ce photographe est déjà lié à un autre compte.');
    await sel.selectOption(was);
    await card.getByRole('button', { name: /Enregistrer/ }).press('Enter');
    await expect(err).toBeHidden();
  } else {
    await undo(page);
    await expect(toast(page)).toContainText('rétabli');
    await expect(sel).toHaveValue(was);
  }
  await page.reload();
  await expect(page.locator('article.rg-compte').filter({ has: page.locator('.enc-tag', { hasText: 'vous' }) }).locator('select[name="author_id"]')).toHaveValue(was);
});

test('Site public au clavier : un texte en quittant le champ, l’ouverture par ← → ✕, « Défaire »', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (les données partagées)');
  await page.goto('/admin/site');
  const tag = page.locator('#tagline');
  const before = await tag.inputValue();
  await tag.fill(`${before} (e2e)`);
  await page.keyboard.press('Tab');
  await expect(toast(page)).toContainText('« Accroche » enregistré.');
  await undo(page);
  await expect(toast(page)).toContainText('« Accroche » rétabli.');
  await expect(tag).toHaveValue(before);
  // Ouverture : → sur la première photo, le focus reste sur la flèche ; « Défaire » remet l'ordre.
  const titles = () => page.locator('[data-hero-chosen] li .t').allTextContents();
  const order = await titles();
  test.skip(order.length < 2, 'ouverture trop courte');
  const right = page.locator('[data-hero-chosen] li').first().locator('[data-hero-op="right"]');
  await right.focus();
  await page.keyboard.press('Enter');
  await expect(toast(page)).toContainText(`Ouverture : « ${order[0]} » en place 2.`);
  expect((await titles()).slice(0, 2)).toEqual([order[1], order[0]]);
  await expect(page.locator(`[data-hero-chosen] li:nth-child(2) [data-hero-op="right"]`)).toBeFocused();
  await undo(page);
  await expect(toast(page)).toContainText('Ouverture rétablie.');
  expect(await titles()).toEqual(order);
  await page.reload();
  expect(await titles()).toEqual(order);
  await expect(page.locator('#tagline')).toHaveValue(before);
});

test('sans JavaScript : les formulaires de la v1 et les dialogues par leur ancre', async ({ browser }, info) => {
  test.skip(phone(info), 'au bureau (les données partagées)');
  const ctx = await browser.newContext({ ...info.project.use, storageState: STATE, javaScriptEnabled: false });
  const page = await ctx.newPage();
  // Identité : le bouton enregistre sous-titre, marque et thème ; « Retirer… » ouvre son dialogue dans la page.
  await page.goto('/admin/apparence');
  const sub = page.locator('#subtitle');
  const before = await sub.inputValue();
  await sub.fill('Sans script');
  await page.getByRole('button', { name: 'Enregistrer l’identité et le thème' }).click();
  await expect(page.locator('.flash')).toContainText('Apparence enregistrée.');
  await expect(page.locator('#subtitle')).toHaveValue('Sans script');
  await page.locator('#subtitle').fill(before);
  await page.getByRole('button', { name: 'Enregistrer l’identité et le thème' }).click();
  await expect(page.locator('#subtitle')).toHaveValue(before);
  await page.goto('/admin/apparence#dlg-retirer-embleme');
  await expect(page.locator('#dlg-retirer-embleme')).toBeVisible();
  // Site public : « Enregistrer le site public » ; l'ouverture par ses boutons (la page revient à #ouverture).
  await page.goto('/admin/site');
  const titles = () => page.locator('[data-hero-chosen] li .t').allTextContents();
  const order = await titles();
  // Entrée dans un champ : le bouton par défaut (caché) enregistre la page, jamais une flèche de l'ouverture.
  await page.locator('#site_name').press('Enter');
  await expect(page.locator('.flash')).toContainText('Réglages enregistrés.');
  expect(await titles()).toEqual(order);
  await page.getByRole('button', { name: 'Enregistrer le site public' }).click();
  await expect(page.locator('.flash')).toContainText('Réglages enregistrés.');
  if (order.length > 1) {
    await page.locator('[data-hero-chosen] li').first().locator('[data-hero-op="right"]').click();
    await expect(page).toHaveURL(/#ouverture$/);
    expect((await titles()).slice(0, 2)).toEqual([order[1], order[0]]);
    await page.locator('[data-hero-chosen] li').first().locator('[data-hero-op="right"]').click();
    expect(await titles()).toEqual(order);
  }
  // Comptes : « Modifier » se déplie (details), le formulaire part vers la route de la v1.
  await page.goto('/admin/comptes');
  const card = page.locator('article.rg-compte').filter({ has: page.locator('.enc-tag', { hasText: 'vous' }) });
  await card.locator('summary').click();
  await card.getByRole('button', { name: /Enregistrer/ }).click();
  await expect(page.locator('.flash')).toContainText(/Compte\s«\s.+\s»\senregistré\./);
  await ctx.close();
});

test('focus jamais caché sous une barre fixe ou collante (WCAG 2.4.11)', async ({ page }) => {
  test.setTimeout(150_000);
  for (const url of SCREENS) {
    await page.goto(url);
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const hidden = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body || a.closest('#admin-nav') || a.closest('.tabbar') || a.closest('dialog')) return null;
        const r = a.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        const bars = [...document.querySelectorAll('.tabbar, .toast')].filter(b => ['fixed', 'sticky'].includes(getComputedStyle(b).position) && b.offsetParent !== null && !b.contains(a) && getComputedStyle(b).display !== 'none');
        const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.bottom - 2]];
        const covered = pts.filter(([x, y]) => bars.some(b => { const q = b.getBoundingClientRect(); return x >= q.left && x <= q.right && y >= q.top && y <= q.bottom; }));
        return covered.length === pts.length ? (a.id || a.name || a.textContent.trim().slice(0, 30)) : null;
      });
      expect(hidden, `${url}, tabulation ${i}`).toBeNull();
    }
  }
});

test('au téléphone : les onglets des Réglages en cases, des cibles de 44 px, les cartes des comptes dans l’écran', async ({ page }, info) => {
  test.skip(!phone(info), 'téléphone seulement');
  const vw = page.viewportSize().width;
  await page.goto('/admin/apparence');
  const tabs = page.locator('.onglets a');
  const n = await tabs.count();
  expect(n).toBeGreaterThan(3);
  for (let i = 0; i < n; i++) { const b = await tabs.nth(i).boundingBox(); expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(vw); expect(b.height).toBeGreaterThanOrEqual(44); }
  for (const sel of ['.sur-page a', '.rg-theme > label', '.rg-apercu']) {
    const boxes = await page.locator(sel).evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
    for (const h of boxes) expect(h, sel).toBeGreaterThanOrEqual(44);
  }
  await page.goto('/admin/comptes');
  for (const b of await page.locator('article.rg-compte').evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()))) expect(b.right).toBeLessThanOrEqual(vw);
  await page.goto('/admin/site');
  for (const h of await page.locator('[data-hero-chosen] .mv button').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
});

test('aucun débordement horizontal des trois écrans, de 320 à 1 440 px', async ({ page }, info) => {
  test.skip(phone(info), 'les largeurs sont posées ici');
  test.setTimeout(180_000);
  for (const [w, h] of [[320, 640], [412, 839], [1032, 1250], [1376, 900], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const url of SCREENS) {
      await page.goto(url);
      await page.locator('details.modif').evaluateAll(ds => ds.forEach(d => { d.open = true; }));
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
