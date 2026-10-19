import { test, expect } from '@playwright/test';

// Bouton « Voir en v1 / Voir en v2 » des pages publiques (server/vue-site.js) : pour l'administrateur connecté seulement ;
// d'un clic, la vue de sa session passe d'une version à l'autre et revient à la même page. Au clavier et sans script, à
// 320 et 1 440 px : cible, focus visible et jamais caché, aucun débordement. Le visiteur, lui, n'a jamais le bouton.
const PHOTO = '/photo/brume-sur-la-loire';

let errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`); });
};
test.beforeEach(() => { errors = []; });
test.afterEach(() => { expect(errors, 'erreurs console / CSP').toEqual([]); });

// Une connexion par projet (AUTH_RATE_LIMIT : 30 par 10 minutes pour toute la suite) : les tests de ce fichier tournent à
// la suite, dans un même processus ; chaque test repart de la vue « suivre ».
test.describe.configure({ mode: 'serial' });
let session = null;
async function admin(browser, info, options = {}) {
  test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent : le bouton demande une session d’administrateur');
  if (!session) {
    const login = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
    const lp = await login.newPage();
    await lp.goto('/auth/local?next=%2Fadmin%2Fapparence');
    await lp.getByLabel('Se connecter en tant que').selectOption('julien');
    await lp.getByLabel('Jeton de test').fill(process.env.E2E_LOCAL_AUTH);
    await lp.getByRole('button', { name: 'Se connecter' }).click();
    await expect(lp).toHaveURL(/\/admin\/apparence$/);
    session = await login.storageState();
    await login.close();
  }
  const ctx = await browser.newContext({ ...info.project.use, storageState: session, ...options });
  const page = await ctx.newPage();
  await page.goto('/admin/apparence');
  const news = page.getByRole('dialog', { name: /Nouveau depuis votre dernière visite/ });
  if (await news.isVisible()) await news.getByRole('button', { name: 'C’est noté' }).click();
  const back = page.getByRole('button', { name: 'Revenir à la version des visiteurs' });
  if (await back.count()) await back.click();
  watch(page);
  return { ctx, page };
}

const isV2 = page => page.locator('.vis-scene').count().then(n => n > 0);
// Le bouton : visible, assez grand, focus visible, jamais sous un autre élément, aucun débordement de la page.
async function verifie(page, { coarse = false } = {}) {
  const b = page.locator('.vue-site-b');
  await expect(b).toBeVisible();
  const m = await b.evaluate(el => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { w: r.width, h: r.height, right: r.right, dessus: el === top || el.contains(top), debord: document.documentElement.scrollWidth - innerWidth, vw: innerWidth };
  });
  expect(m.h, 'hauteur de la cible').toBeGreaterThanOrEqual(coarse ? 44 : 24);
  expect(m.w, 'largeur de la cible').toBeGreaterThanOrEqual(coarse ? 44 : 24);
  expect(m.dessus, 'rien sur le bouton').toBe(true);
  expect(m.right, 'bouton dans l’écran').toBeLessThanOrEqual(m.vw);
  expect(m.debord, 'débordement horizontal').toBeLessThanOrEqual(0);
}

for (const width of [320, 1440]) {
  test(`sans script, ${width} px : Voir en v2, puis Voir en v1, sur la même page`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'tailles fixées : projet desktop');
    const { ctx, page } = await admin(browser, info, { javaScriptEnabled: false, viewport: { width, height: 900 } });
    await page.goto(PHOTO);
    await expect(page.locator('.vue-site')).toContainText('Vous voyez la v1, comme les visiteurs.');
    expect(await isV2(page)).toBe(false);
    await verifie(page);
    await page.getByRole('button', { name: 'Voir en v2' }).click();
    await expect(page).toHaveURL(new RegExp(`${PHOTO}$`));
    expect(await isV2(page)).toBe(true);
    await expect(page.locator('.vue-site')).toContainText('Vous seul voyez la v2 ; les visiteurs voient la v1.');
    await verifie(page);
    await page.getByRole('button', { name: 'Voir en v1' }).click();
    await expect(page).toHaveURL(new RegExp(`${PHOTO}$`));
    expect(await isV2(page)).toBe(false);
    await expect(page.locator('.vue-site')).toContainText('comme les visiteurs');
    await ctx.close();
  });

  test(`au clavier, ${width} px : le bouton se trouve en quelques tabulations, focus visible, Entrée bascule`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'tailles fixées : projet desktop');
    const { ctx, page } = await admin(browser, info, { viewport: { width, height: 900 } });
    for (const [from, to, label] of [['v1', 'v2', 'Voir en v2'], ['v2', 'v1', 'Voir en v1']]) {
      await page.goto(PHOTO);
      expect(await isV2(page), `départ en ${from}`).toBe(from === 'v2');
      let found = false;
      for (let i = 0; i < 4 && !found; i++) {
        await page.keyboard.press('Tab');
        found = await page.evaluate(() => document.activeElement?.classList.contains('vue-site-b'));
      }
      expect(found, `bouton atteint au clavier en ${from}`).toBe(true);
      await expect(page.locator('.vue-site-b')).toHaveText(label);
      const focus = await page.locator('.vue-site-b').evaluate(el => { const s = getComputedStyle(el); return { style: s.outlineStyle, w: parseFloat(s.outlineWidth) }; });
      expect(focus.style, 'focus visible').not.toBe('none');
      expect(focus.w).toBeGreaterThanOrEqual(2);
      await verifie(page);
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`${PHOTO}$`));
      expect(await isV2(page), `arrivée en ${to}`).toBe(to === 'v2');
    }
    await ctx.close();
  });
}

test('au toucher (Pixel 7) : cible de 44 px, accueil v1 et v2', async ({ browser }, info) => {
  test.skip(info.project.name !== 'mobile', 'toucher : projet mobile');
  const { ctx, page } = await admin(browser, info);
  await page.goto('/');
  await verifie(page, { coarse: true });
  await page.getByRole('button', { name: 'Voir en v2' }).click();
  await expect(page).toHaveURL(/\/$/);
  await verifie(page, { coarse: true });
  await page.getByRole('button', { name: 'Voir en v1' }).click();
  await ctx.close();
});

test('visiteur : jamais de bouton, pendant la vue v2 d’un administrateur', async ({ browser }, info) => {
  const { ctx, page } = await admin(browser, info);
  await page.goto(PHOTO);
  await page.getByRole('button', { name: 'Voir en v2' }).click();
  expect(await isV2(page)).toBe(true);
  const visitor = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
  const vp = await visitor.newPage();
  for (const url of [PHOTO, '/', '/en', '/a-propos']) {
    await vp.goto(url);
    await expect(vp.locator('.vue-site')).toHaveCount(0);
    expect(await isV2(vp)).toBe(false);
  }
  await visitor.close();
  await page.getByRole('button', { name: 'Voir en v1' }).click();
  await ctx.close();
});
