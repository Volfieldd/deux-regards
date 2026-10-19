import { test, expect } from '@playwright/test';

// Admin v2, vague 4 « suivi et aide » : Journal, Statistiques, Signalements des visiteurs, Circuit de publication, Aide,
// Nouveautés, au bureau (Chrome) et au téléphone (Pixel 7), avec le compte de test de la v2 (Sébastien) : au clavier
// (circuit au geste et « Défaire », dialogue de suppression, recherche de l'aide), focus jamais caché, sans JavaScript
// (formulaires de la v1, dialogue par son ancre, sommaire replié), au téléphone (cibles de 44 px), aucun débordement. Les
// tests qui écrivent tournent au bureau seulement et remettent ce qu'ils ont changé.
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
const SCREENS = ['/admin/journal', '/admin/statistiques', '/admin/signalements', '/admin/circuit', '/admin/aide', '/admin/nouveautes'];
const toast = page => page.locator('[data-toast]');
const undo = async page => { const b = toast(page).getByRole('button', { name: 'Défaire' }); await b.focus(); await page.keyboard.press('Enter'); };
const PHOTO = '/photo/brume-sur-la-loire';

// Un signalement envoyé par le formulaire public (un visiteur, sans session), puis son numéro dans l'admin.
async function signaler(browser, info, message) {
  const ctx = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto(`${PHOTO}/signaler`);
  await page.locator('input[name="kind"][value="texte"]').check();
  await page.locator('textarea[name="message"]').fill(message);
  await page.locator('form[method="post"] button[type="submit"]').first().click();
  await expect(page).toHaveURL(/\/signaler\?envoye=1$/);
  await ctx.close();
}

test('les six écrans en v2 : titre, feuille de la vague, entrée courante du menu', async ({ page }) => {
  for (const [url, h1] of [['/admin/journal', 'Journal'], ['/admin/statistiques', 'Statistiques'], ['/admin/signalements', 'Signalements des visiteurs'], ['/admin/circuit', 'Circuit de publication'], ['/admin/aide', 'Aide'], ['/admin/nouveautes', 'Nouveautés']]) {
    await page.goto(url);
    await expect(page.locator('h1')).toHaveText(h1);
    await expect(page.locator('link[href*="admin/v2/v2.css"]')).toHaveCount(1);
    await expect(page.locator('link[href*="admin/v2/suivi-v2.css"]')).toHaveCount(1);
    await expect(page.locator('.side [aria-current="page"]')).toHaveCount(1);
  }
});

test('journal : filtres au clavier (type, période), libellés lisibles, tableau titré', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (le clavier)');
  await page.goto('/admin/journal');
  await expect(page.locator('table.jr-liste caption')).toContainText('la plus récente d’abord');
  await expect(page.locator('table.jr-liste tbody')).not.toContainText(/POST \/admin\/(photos|series|voyages|comptes|apparence|reglages)/);
  await page.getByRole('link', { name: 'Connexions' }).click();
  await expect(page).toHaveURL(/type=connexions/);
  await expect(page.getByRole('link', { name: 'Connexions' })).toHaveAttribute('aria-current', 'page');
  await page.locator('#jr-periode').selectOption('7');
  await page.locator('#jr-q').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/periode=7/);
  await expect(page).toHaveURL(/type=connexions/);
  await expect(page.locator('#jr-periode')).toHaveValue('7');
});

test('circuit au clavier : un interrupteur s’enregistre au geste, « Défaire » rétablit', async ({ page }, info) => {
  test.skip(phone(info), 'au bureau (le clavier, et les données partagées)');
  await page.goto('/admin/circuit');
  const sw = page.locator('form[data-circuit] input[role="switch"][name="instagram"]').first();
  test.skip(!(await sw.count()), 'aucun compte Photographe sur ce serveur');
  const was = await sw.isChecked();
  await sw.focus();
  await page.keyboard.press('Space');
  await expect(toast(page)).toContainText(/«\s.+\s»\s:\sMettre ses photos dans la file Instagram sans validation · (Oui|Non)/);
  await expect(page.locator('[data-temoin]')).toContainText(/Enregistré à/);
  await page.reload();
  await expect(page.locator('form[data-circuit] input[name="instagram"]').first()).toBeChecked({ checked: !was });
  await page.locator('form[data-circuit] input[name="instagram"]').first().focus();
  await page.keyboard.press('Space');
  await expect(toast(page)).toContainText('Mettre ses photos dans la file Instagram sans validation');
  await undo(page);
  await expect(toast(page)).toContainText('rétabli');
  await expect(page.locator('form[data-circuit] input[name="instagram"]').first()).toBeChecked({ checked: !was });
  // Remis comme avant.
  await page.locator('form[data-circuit] input[name="instagram"]').first().focus();
  await page.keyboard.press('Space');
  await expect(toast(page)).toContainText(was ? '· Oui' : '· Non');
  await page.reload();
  await expect(page.locator('form[data-circuit] input[name="instagram"]').first()).toBeChecked({ checked: was });
});

test('signalements : « Supprimer… » par un dialogue (Annuler d’abord, Échap rend le focus), puis supprimé', async ({ page, browser }, info) => {
  test.skip(phone(info) || !process.env.E2E_ALLOW_WRITES, 'au bureau, écrit un signalement : E2E_ALLOW_WRITES=1');
  await signaler(browser, info, 'Essai de bout en bout (admin v2) : à effacer.');
  await page.goto('/admin/signalements?etat=nouveau');
  const card = page.locator('li.sg').filter({ hasText: 'Essai de bout en bout (admin v2)' }).first();
  await expect(card).toBeVisible();
  await expect(card.locator('blockquote.sg-msg')).toHaveAttribute('lang', 'fr');
  const open = card.getByRole('link', { name: 'Supprimer…' });
  await open.click();
  const dlg = page.locator('dialog[open]');
  await expect(dlg.getByRole('heading')).toContainText('Supprimer le signalement sur');
  await expect(dlg.getByRole('link', { name: 'Annuler' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Supprimer le signalement' }).click();
  await expect(page.locator('.flash')).toContainText('Signalement supprimé.');
  await expect(page.locator('li.sg').filter({ hasText: 'Essai de bout en bout (admin v2)' })).toHaveCount(0);
});

test('aide : la recherche liste les passages, le mot surligné dans l’extrait, un lien qui mène au titre', async ({ page }, info) => {
  await page.goto('/admin/aide');
  const q = page.getByLabel('Rechercher dans l’aide');
  await q.fill('filigrane');
  await expect(page.locator('[data-aide-statut]')).toContainText(/passages? contien/);
  const first = page.locator('[data-aide-resultats] a').first();
  await expect(first.locator('mark').first()).toHaveText(/filigrane/i);
  await q.fill('zzqqxx');
  await expect(page.locator('[data-aide-statut]')).toContainText('Aucun passage ne contient « zzqqxx ».');
  await expect(page.locator('[data-aide-resultats]')).toBeHidden();
  await q.fill('filigrane');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-aide-resultats] a').first()).toBeFocused();
  const href = await page.locator('[data-aide-resultats] a').first().getAttribute('href');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  // Le focus est sur le titre visé (celui d'une rubrique, ou son sous-titre).
  const focused = await page.evaluate(id => { const a = document.activeElement, el = document.getElementById(id); return Boolean(a && el && (a === el || (el.matches('section') && a === el.querySelector('h2')))); }, href.slice(1));
  expect(focused).toBe(true);
  if (phone(info)) {
    // Au téléphone, le sommaire est replié : la première rubrique est à l'écran sans défiler.
    await page.goto('/admin/aide');
    await expect(page.locator('details.aide-toc-tel')).not.toHaveAttribute('open', '');
    expect((await page.locator('section.aide-section').first().boundingBox()).y).toBeLessThan(900);
  }
});

test('nouveautés : dix versions en cartes, les mois repliés ; une ancre vers une version repliée ouvre son mois', async ({ page }) => {
  await page.goto('/admin/nouveautes');
  const cards = page.locator('ol.nv-liste > li.panel.nv');
  expect(await cards.count()).toBeLessThanOrEqual(10);
  const folded = page.locator('details[data-nv-mois] li.nv');
  test.skip(!(await folded.count()), 'moins de onze versions visibles pour ce rôle');
  const id = await folded.first().getAttribute('id');
  await page.goto(`/admin/nouveautes#${id}`);
  await expect(page.locator(`[id="${id}"]`)).toBeVisible();
});

test('sans JavaScript : le circuit par son bouton, le dialogue de suppression par son ancre, l’aide par son sommaire', async ({ browser }, info) => {
  test.skip(phone(info), 'au bureau (les données partagées)');
  const ctx = await browser.newContext({ ...info.project.use, storageState: STATE, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/admin/circuit');
  const form = page.locator('form[data-circuit]').first();
  if (await form.count()) {
    const btn = form.getByRole('button', { name: /^Enregistrer « .+ »$/ });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator('.flash')).toContainText(/Réglages de .+ enregistrés\./);
  }
  await page.goto('/admin/signalements');
  const link = page.locator('li.sg a[href^="#dlg-sg-"]').first();
  if (await link.count()) {
    const href = await link.getAttribute('href');
    await page.goto(`/admin/signalements${href}`);
    await expect(page.locator(href)).toBeVisible();
    await expect(page.locator(href).getByRole('button', { name: 'Supprimer le signalement' })).toBeVisible();
  }
  await page.goto('/admin/aide');
  await expect(page.locator('[data-aide-cherche]')).toBeHidden();
  await page.setViewportSize({ width: 412, height: 839 });
  await page.locator('details.aide-toc-tel summary').click();
  await expect(page.locator('details.aide-toc-tel nav a').first()).toBeVisible();
  await page.goto('/admin/journal');
  await page.locator('#jr-periode').selectOption('30');
  await page.getByRole('button', { name: 'Filtrer' }).click();
  await expect(page).toHaveURL(/periode=30/);
  await ctx.close();
});

test('focus jamais caché sous une barre fixe ou collante (WCAG 2.4.11)', async ({ page }) => {
  test.setTimeout(200_000);
  for (const url of SCREENS) {
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

test('au téléphone : cibles de 44 px (filtres, liens des lignes, interrupteurs, boutons), cartes dans l’écran', async ({ page }, info) => {
  test.skip(!phone(info), 'téléphone seulement');
  const vw = page.viewportSize().width;
  const tall = async (sel) => { for (const b of await page.locator(sel).evaluateAll(els => els.filter(e => e.getClientRects().length).map(e => ({ h: e.getBoundingClientRect().height, r: e.getBoundingClientRect().right, t: e.textContent.trim().slice(0, 30) })))) { expect(b.h, `${sel} ${b.t}`).toBeGreaterThanOrEqual(44); expect(b.r, `${sel} ${b.t}`).toBeLessThanOrEqual(vw); } };
  await page.goto('/admin/journal');
  await tall('.chips .chip');
  await tall('.jr-liste a.ligne-lien');
  await page.goto('/admin/statistiques');
  await tall('.chips .chip');
  await page.goto('/admin/signalements');
  await tall('.chips .chip');
  await tall('li.sg .btn');
  await page.goto('/admin/circuit');
  await tall('.inter');
  await page.goto('/admin/aide');
  await tall('details.aide-toc-tel > summary');
});

test('aucun débordement horizontal des six écrans, de 320 à 1 440 px', async ({ page }, info) => {
  test.skip(phone(info), 'les largeurs sont posées ici');
  test.setTimeout(240_000);
  for (const [w, h] of [[320, 640], [412, 839], [1032, 1250], [1376, 900], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const url of [...SCREENS, '/admin/statistiques?periode=365', '/admin/journal?type=connexions']) {
      await page.goto(url);
      await page.locator('details').evaluateAll(ds => ds.forEach(d => { d.open = true; }));
      const out = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const bad = [...document.querySelectorAll('body *')].filter(el => {
          if (el.closest('.sr-only, dialog:not([open]), [hidden], details:not([open]) > :not(summary), #admin-nav, .tablewrap')) return false;
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
