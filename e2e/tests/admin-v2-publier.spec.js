import { test, expect } from '@playwright/test';
import { creerGalerie, supprimerGalerie, creerBillet, supprimerBillet, remplirFile, viderFile, creerRencontreCarte } from './publier-donnees.js';
import { effacerRencontre } from './terrain-donnees.js';

// Admin v2, dernière vague, partie B : Instagram, Carnets et Galeries privées dans la coquille v2, Mon QR et Merci, au
// bureau (Chrome) et au téléphone (Pixel 7), avec le compte de test de la v2 (Sébastien) : au clavier (file sans recharger
// et « Défaire », réglages au geste, dialogues), sans JavaScript, focus jamais caché, cibles de 44 px au téléphone, aucun
// débordement de 320 à 1 440 px. Chaque test crée ses données et les efface ; ceux qui écrivent tournent au bureau.
const STATE = 'results/.auth/admin-v2.json';
test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
test.use({ storageState: STATE });
// Les tests qui écrivent partagent la file et les réglages d'Instagram : l'un après l'autre.
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

test('les écrans en v2 : la coquille (menu, entrée courante), leur feuille ; le contenu des Carnets et des galeries', async ({ page }) => {
  for (const [url, h1, menu] of [['/admin/instagram', 'Instagram', 'Instagram'], ['/admin/galeries', 'Galeries privées', 'Galeries privées'], ['/admin/carnet', 'Carnets', 'Carnets']]) {
    await page.goto(url);
    await expect(page.locator('h1')).toHaveText(h1);
    await expect(page.locator('link[href*="admin/v2/v2.css"]')).toHaveCount(1);
    await expect(page.locator('link[href*="admin/v2/publier-v2.css"]')).toHaveCount(1);
    await expect(page.locator('.side a[aria-current="page"]')).toContainText(menu);
    await expect(page.getByRole('link', { name: 'Aide sur cette page' })).toHaveCount(1);
    await expect(page.locator('form.ver-choix button')).toHaveText('Revenir à l’admin v1');
  }
});

test('Instagram au clavier : reculer une photo sans recharger, « Défaire » ; un réglage en quittant le champ, « Défaire » ; « Retirer… » par un dialogue', async ({ page }, info) => {
  test.skip(phone(info) || !writes(), 'au bureau, E2E_ALLOW_WRITES=1 (la file et les réglages)');
  const posts = await remplirFile(page, 2);
  try {
    await page.goto('/admin/instagram');
    const first = page.locator(`[data-ig-item="${posts[0]}"]`);
    const title = await first.getAttribute('data-titre');
    const down = first.locator('form[data-ig-deplacer="descendre"] button');
    const rank = await page.locator('[data-ig-file] > li').evaluateAll((els, id) => els.findIndex(e => e.dataset.igItem === String(id)), posts[0]);
    await down.focus();
    await page.keyboard.press('Enter');
    await expect(toast(page)).toContainText(`« ${title} » en place ${rank + 2} dans la file.`);
    // Le focus reste sur une flèche de la même photo (celle du même sens, ou l'autre si la photo est devenue la dernière).
    expect(await page.evaluate(() => document.activeElement.closest('[data-ig-item]')?.dataset.igItem)).toBe(String(posts[0]));
    await undo(page);
    await expect(toast(page)).toContainText(`« ${title} » remise en place ${rank + 1}.`);
    await page.reload();
    const order = await page.locator('[data-ig-file] > li').evaluateAll(els => els.map(e => Number(e.dataset.igItem)));
    expect(order.indexOf(posts[0])).toBeLessThan(order.indexOf(posts[1]));
    // Réglages : les heures, enregistrées en quittant le champ ; une heure illisible dite sous le champ ; « Défaire ».
    const times = page.locator('#ig-heures');
    const before = await times.inputValue();
    await times.fill('09:00, 25:99');
    await page.keyboard.press('Tab');
    await expect(toast(page)).toContainText('« Heures de publication » enregistré.');
    await expect(times).toHaveValue('09:00');
    await expect(times).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#err-ig-heures')).toContainText('25:99');
    await undo(page);
    await expect(toast(page)).toContainText('Réglages Instagram rétablis.');
    await expect(times).toHaveValue(before);
    await page.reload();
    await expect(page.locator('#ig-heures')).toHaveValue(before);
    // « Retirer… » : un dialogue, Annuler d'abord ; Échap rend le focus au bouton.
    const open = page.locator(`[data-ig-item="${posts[1]}"]`).getByRole('link', { name: /Retirer…/ });
    await open.focus();
    await page.keyboard.press('Enter');
    const d = page.locator(`#dlg-retirer-${posts[1]}`);
    await expect(d).toBeVisible();
    await expect(d.getByRole('link', { name: 'Annuler' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    await expect(open).toBeFocused();
  } finally { await viderFile(page, posts); }
});

test('Galeries privées en v2 : créer, ouvrir, un accès ; le lien et le mot de passe une seule fois, « Copier » avec le script', async ({ page }, info) => {
  test.skip(phone(info) || !writes(), 'au bureau, E2E_ALLOW_WRITES=1');
  const id = await creerGalerie(page);
  try {
    await page.goto(`/admin/galeries/${id}`);
    await expect(page.locator('.onglets a[aria-current="page"]')).toContainText('Accès');
    await page.getByRole('link', { name: 'Nouvel accès' }).first().click();
    await page.getByLabel('Nom de la personne').fill('Lucie Exemple');
    await page.getByRole('button', { name: 'Créer l’accès' }).click();
    await expect(page).toHaveURL(/\/acces\/\d+\/secrets$/);
    await expect(page.locator('link[href*="admin/v2/v2.css"]')).toHaveCount(1);
    const pw = (await page.locator('output.mdp').textContent()).trim();
    expect(pw).toMatch(/^[a-z0-9]{4} [a-z0-9]{4} [a-z0-9]{4}$/);
    await expect(page.getByRole('button', { name: 'Copier le mot de passe' })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Le lien et le mot de passe ont déjà été affichés')).toBeVisible();
    await expect(page.locator('output.mdp')).toHaveCount(0);
  } finally { await supprimerGalerie(page, id); }
});

test('Carnets en v2 : l’éditeur garde son script (barre de mise en forme, Ctrl+B), dans la coquille v2', async ({ page }, info) => {
  test.skip(phone(info) || !writes(), 'au bureau, E2E_ALLOW_WRITES=1');
  const id = await creerBillet(page);
  try {
    await page.goto(`/admin/carnet/${id}`);
    await expect(page.locator('link[href*="admin/carnet.css"]')).toHaveCount(1);
    await expect(page.locator('.side a[aria-current="page"]')).toContainText('Carnets');
    const text = page.locator('#texte');
    await text.click();
    await text.fill('mot');
    await text.selectText();
    await page.keyboard.press('Control+b');
    await expect(text).toHaveValue('**mot**');
    await expect(page.locator('[data-outil]').first()).toBeVisible();
  } finally { await supprimerBillet(page, id); }
});

test('sans JavaScript : Instagram (réglages par leur bouton, dialogues par leur ancre), une galerie, la liste des billets', async ({ browser }, info) => {
  test.skip(phone(info) || !writes(), 'au bureau, E2E_ALLOW_WRITES=1');
  const ctx = await browser.newContext({ ...info.project.use, storageState: STATE, javaScriptEnabled: false });
  const page = await ctx.newPage();
  const posts = await remplirFile(page, 1);
  const id = await creerGalerie(page);
  try {
    await page.goto('/admin/instagram');
    const before = await page.locator('#ig-heures').inputValue();
    await page.getByRole('button', { name: 'Enregistrer les réglages' }).click();
    await expect(page.locator('.flash')).toContainText('Réglages Instagram enregistrés.');
    await expect(page.locator('#ig-heures')).toHaveValue(before);
    await page.goto(`/admin/instagram#dlg-retirer-${posts[0]}`);
    await expect(page.locator(`#dlg-retirer-${posts[0]}`)).toBeVisible();
    await page.locator(`#dlg-retirer-${posts[0]}`).getByRole('button', { name: 'Retirer de la file' }).click();
    await expect(page.locator('.flash')).toContainText('Retirée de la file Instagram.');
    await page.goto(`/admin/galeries/${id}/reglages`);
    await page.getByLabel('Titre en anglais').fill('Lisbon');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByLabel('Titre en anglais')).toHaveValue('Lisbon');
    await page.goto('/admin/carnet');
    await expect(page.getByRole('button', { name: 'Commencer le billet' })).toBeVisible();
  } finally { await viderFile(page, posts); await supprimerGalerie(page, id); await ctx.close(); }
});

test('focus jamais caché sous une barre fixe ou collante (WCAG 2.4.11)', async ({ page }) => {
  test.setTimeout(150_000);
  for (const url of ['/admin/instagram', '/admin/galeries', '/admin/carnet']) {
    await page.goto(url);
    for (let i = 0; i < 50; i++) {
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

test('au téléphone : des cibles de 44 px (Instagram, galeries, Carnets)', async ({ page }, info) => {
  test.skip(!phone(info), 'téléphone seulement');
  for (const [url, sels] of [['/admin/instagram', ['.ig-sommaire a', '.v2-instagram .btn']], ['/admin/galeries', ['.chip', '.seg a', '.v2-publier .btn']], ['/admin/carnet', ['.v2-publier .btn', '.v2-publier .choix-a label']]]) {
    await page.goto(url);
    for (const sel of sels) {
      const hs = await page.locator(sel).evaluateAll(els => els.filter(e => e.offsetParent !== null && !e.closest('dialog')).map(e => e.getBoundingClientRect().height));
      for (const h of hs) expect(h, `${url} ${sel}`).toBeGreaterThanOrEqual(44);
    }
  }
});

test('aucun débordement horizontal, de 320 à 1 440 px : Instagram, galeries, Carnets, Mon QR, Merci', async ({ page }, info) => {
  test.skip(phone(info) || !writes(), 'les largeurs sont posées ici ; E2E_ALLOW_WRITES=1');
  test.setTimeout(300_000);
  const posts = await remplirFile(page, 2);
  const g = await creerGalerie(page);
  const b = await creerBillet(page);
  const r = await creerRencontreCarte(page);
  try {
    const urls = ['/admin/instagram', '/admin/galeries', `/admin/galeries/${g}`, `/admin/galeries/${g}/photos`, `/admin/galeries/${g}/reglages`, `/admin/galeries/${g}/acces/nouveau`, '/admin/galeries/nouvelle',
      '/admin/carnet', `/admin/carnet/${b}`, `/admin/carnet/${b}/versions`, '/admin/rencontre/qr', `/admin/rencontre/${r}/merci`];
    for (const [w, h] of [[320, 640], [412, 839], [1032, 1250], [1376, 900], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const url of urls) {
        await page.goto(url);
        const out = await overflow(page);
        expect(out.scroll, `${url} à ${w} px`).toBeLessThanOrEqual(0);
        expect(out.bad, `${url} à ${w} px`).toEqual([]);
      }
    }
  } finally { await viderFile(page, posts); await supprimerGalerie(page, g); await supprimerBillet(page, b); await effacerRencontre(page, r); }
});
