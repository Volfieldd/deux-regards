import { test, expect } from '@playwright/test';

// Visionneuse v2 (maquette MQ-04), vue dans la vue v2 : chaque test ouvre sa propre session d'administrateur
// (connexion locale de test) et y ouvre l'aperçu ; les visiteurs et les autres tests gardent la v1. La même page, une
// fois la v2 appliquée (Réglages → Apparence), est celle de tous les visiteurs.
const PHOTO = '/photo/brume-sur-la-loire';            // 3:2 dans le jeu de démonstration

let errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('requestfailed', r => { if (!/\/media\//.test(r.url()) || r.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`${r.failure()?.errorText} ${r.url()}`); });
  page.on('response', r => { if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`); });
};
test.beforeEach(() => { errors = []; });
test.afterEach(() => { expect(errors, 'erreurs console / CSP').toEqual([]); });

// Session d'administrateur neuve, aperçu de la v2 ouvert ; options : celles du contexte (écran, script…).
async function apercu(browser, info, options = {}) {
  test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent : la vue v2 demande une session d’administrateur');
  const ctx = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] }, ...options });
  const page = await ctx.newPage();
  await page.goto('/auth/local?next=%2Fadmin%2Fapparence');
  await page.getByLabel('Se connecter en tant que').selectOption('julien');
  await page.getByLabel('Jeton de test').fill(process.env.E2E_LOCAL_AUTH);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/admin\/apparence$/);
  const news = page.getByRole('dialog', { name: /Nouveau depuis votre dernière visite/ });
  if (await news.isVisible()) await news.getByRole('button', { name: 'C’est noté' }).click();
  await page.getByRole('button', { name: 'Voir le site en v2' }).click();
  watch(page);
  return { ctx, page };
}

// Ce que mesure chaque écran : la photo (taille, part de l'écran), son bas dans le premier écran, aucun débordement.
const mesure = page => page.evaluate(() => {
  const r = document.querySelector('.vis-cadre img').getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), bottom: r.bottom, part: (r.width * r.height) / (innerWidth * innerHeight),
    debord: document.documentElement.scrollWidth - innerWidth, vw: innerWidth, vh: innerHeight };
});

test.describe('bureau et tablette', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'mesures au bureau : projet desktop'));

  test('la photo d’abord : 1376 × 900 (iPad 13 pouces, paysage), 1032 × 1250 (portrait), 1440 × 900', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info);
    const attendu = { '1376x900': { w: 1064, part: 0.55 }, '1032x1250': { w: 920, part: 0.4 }, '1440x900': { w: 1064, part: 0.55 } };
    for (const [taille, a] of Object.entries(attendu)) {
      const [width, height] = taille.split('x').map(Number);
      await page.setViewportSize({ width, height });
      await page.goto(PHOTO);
      await expect(page.locator('.vue-site')).toBeVisible();
      await expect.poll(() => page.locator('.vis-cadre img').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
      const m = await mesure(page);
      expect(Math.abs(m.w - a.w), `${taille} : largeur ${m.w}`).toBeLessThanOrEqual(2);
      expect(m.part, `${taille} : part de l’écran`).toBeGreaterThanOrEqual(a.part);
      expect(m.bottom, `${taille} : la photo tient dans le premier écran`).toBeLessThanOrEqual(m.vh);
      expect(m.debord, `${taille} : débordement horizontal`).toBeLessThanOrEqual(0);
      // Au-delà de 1 200 px, les flèches sont dans les marges, au milieu de la photo, dans l'écran.
      if (width >= 1200) {
        for (const sel of ['.vis-prec', '.vis-suiv']) {
          const b = await page.locator(`.vis-nav ${sel}`).boundingBox();
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width).toBeLessThanOrEqual(width);
        }
      }
      await page.screenshot({ path: `results/visionneuse-v2-${taille}.png` });
    }
    await ctx.close();
  });

  test('clavier : aide, flèches, Échap, plein écran ; le focus reste visible', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info, { viewport: { width: 1440, height: 900 } });
    await page.goto(PHOTO);
    await expect(page.locator('.vis-clavier')).toContainText('Clavier\u202f: ← → précédente, suivante · Échap retour');
    // Premier arrêt : le lien d'évitement, visible au focus.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
    await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeInViewport();
    const next = await page.locator('.vis-nav a[rel="next"]').getAttribute('href');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`${next.replace(/[?]/g, '\\?')}$`));
    await expect(page.locator('.vis-scene')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(new RegExp(`${PHOTO}$`));
    // Plein écran : un dialogue, la photo seule ; Échap le ferme et rend le focus au bouton.
    await page.getByRole('button', { name: 'Plein écran' }).click();
    const plein = page.getByRole('dialog', { name: 'Photo en plein écran' });
    await expect(plein).toBeVisible();
    await expect(plein.locator('img')).toBeVisible();
    await page.keyboard.press('Escape');
    if (await plein.isVisible()) await page.keyboard.press('Escape');      // la 1re touche peut seulement quitter le plein écran du navigateur
    await expect(plein).toBeHidden();
    await expect(page.getByRole('button', { name: 'Plein écran' })).toBeFocused();
    // Échap hors dialogue : retour à la galerie.
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/(galerie)?(#galerie)?$/);
    await ctx.close();
  });

  test('J’aime en bascule, Partager en fenêtre, menu et langue', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info, { viewport: { width: 1376, height: 900 } });
    await page.goto(PHOTO);
    const like = page.locator('.vis-actions .bascule');
    await expect(like).toHaveAttribute('aria-pressed', 'false');
    const before = Number((await page.locator('[data-like-n]').textContent()) || 0);
    await like.click();
    await expect(like).toHaveAttribute('aria-pressed', 'true');
    // Le serveur ne compte qu'un « j'aime » par adresse : le compteur monte d'un, ou reste s'il était déjà compté.
    await expect.poll(async () => Number((await page.locator('[data-like-n]').textContent()) || 0)).toBeGreaterThanOrEqual(before);
    await like.click();                                                      // remis comme avant
    await expect(like).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('link', { name: 'Partager' }).click();
    const share = page.getByRole('dialog', { name: 'Partager' });
    await expect(share).toBeVisible();
    await share.getByRole('button', { name: 'Fermer' }).click();
    await expect(share).toBeHidden();
    await page.locator('.sh-menu > summary').click();
    const nav = page.getByRole('navigation', { name: 'Navigation' });
    await expect(nav.getByRole('link', { name: /Accueil/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await page.locator('.lang-pick > summary').click();
    await expect(page.getByRole('link', { name: 'English' })).toBeVisible();
    await ctx.close();
  });
});

test.describe('téléphone', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'mobile', 'téléphone : projet mobile (Pixel 7)'));

  test('Pixel 7 : la photo bord à bord, aucun débordement, menu dans l’écran, glissé vers la suivante', async ({ browser }, info) => {
    const { ctx, page } = await apercu(browser, info);
    await page.goto(PHOTO);
    await expect.poll(() => page.locator('.vis-cadre img').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
    const m = await mesure(page);
    expect(m.w).toBe(m.vw);
    expect(m.debord).toBeLessThanOrEqual(0);
    expect(m.bottom).toBeLessThanOrEqual(m.vh);
    // L'aide du clavier n'a pas de sens au toucher ; le plein écran reste.
    await expect(page.locator('.vis-clavier p')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Plein écran' })).toBeVisible();
    await page.screenshot({ path: 'results/visionneuse-v2-pixel7.png', fullPage: true });
    await page.locator('.sh-menu > summary').click();
    const panel = await page.locator('.sh-panneau').boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(m.vw + 0.5);
    await page.locator('.sh-menu > summary').click();
    // Glissé vers la gauche sur la photo : la photo suivante.
    const next = await page.locator('.vis-nav a[rel="next"]').getAttribute('href');
    await page.locator('.vis-cadre img').evaluate(img => {
      const r = img.getBoundingClientRect();
      const at = x => new Touch({ identifier: 1, target: img, clientX: x, clientY: r.top + r.height / 2 });
      img.dispatchEvent(new TouchEvent('touchstart', { touches: [at(r.right - 20)], changedTouches: [at(r.right - 20)], bubbles: true }));
      img.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [at(r.left + 20)], bubbles: true }));
    });
    await expect(page).toHaveURL(new RegExp(`${next.replace(/[?]/g, '\\?')}$`));
    await ctx.close();
  });
});

test('sans JavaScript : la page entière, le menu, la langue, les flèches et J’aime marchent', async ({ browser }, info) => {
  const { ctx, page } = await apercu(browser, info, { javaScriptEnabled: false });
  await page.goto(PHOTO);
  await expect(page.locator('.vis-cadre img')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Brume sur la Loire');
  // Ce qui exige un script est caché.
  await expect(page.getByRole('button', { name: 'Plein écran' })).toBeHidden();
  await page.locator('.sh-menu > summary').click();
  await expect(page.getByRole('navigation', { name: 'Navigation' }).getByRole('link', { name: /À propos/ })).toBeVisible();
  await page.locator('.sh-menu > summary').click();
  const m = await mesure(page);
  expect(m.debord).toBeLessThanOrEqual(0);
  // J'aime : formulaire POST, retour à la photo.
  await page.locator('.vis-actions .bascule').click();
  await expect(page).toHaveURL(new RegExp(`${PHOTO}$`));
  // Flèche « Suivante » : un lien.
  const next = await page.locator('.vis-nav a[rel="next"]').getAttribute('href');
  await page.locator('.vis-nav a[rel="next"]').click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[?]/g, '\\?')}$`));
  await ctx.close();
});

// Mini-carte (PLAN point 8, MQ-04) : cadrée sur la ville, barre d'échelle à la longueur annoncée, noms d'au moins 13 px
// rendus (taille du SVG mesurée), dans le cadre, sans chevauchement ; le même cadre et la même barre sans script. La photo
// doit avoir une ville et être sur la carte (sinon le test est sauté).
const carte = page => page.evaluate(() => {
  const fig = document.querySelector('.vis-carte');
  if (!fig) return null;
  const cadre = fig.querySelector('.vis-carte-cadre').getBoundingClientRect();
  const textes = [...fig.querySelectorAll('svg text')].map(t => {
    const r = t.getBoundingClientRect(), m = t.getScreenCTM();
    return { t: t.textContent, px: parseFloat(getComputedStyle(t).fontSize) * Math.hypot(m.a, m.b), r: { x: r.x, y: r.y, w: r.width, h: r.height } };
  });
  const ici = fig.querySelector('.vis-carte-ici circle').getBoundingClientRect();
  const g = fig.querySelector('.vis-carte-echelle');
  const trait = g.querySelector('line').getBoundingClientRect();
  return {
    viewBox: fig.querySelector('[data-carte-fond]').getAttribute('viewBox'),
    largeur: g.querySelector('svg').getAttribute('width'), lu: g.getAttribute('aria-label'),
    cadre: { x: cadre.x, y: cadre.y, w: cadre.width, h: cadre.height }, trait: trait.width, textes,
    ici: { x: ici.x, y: ici.y, w: ici.width, h: ici.height }, debord: document.documentElement.scrollWidth - innerWidth,
  };
});
const chevauche = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

test('mini-carte : cadrée, à l’échelle, noms de 13 px au moins dans le cadre, sans chevauchement ; la même sans script', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'largeurs mesurées depuis le projet desktop');
  const avec = await apercu(browser, info);
  const sans = await apercu(browser, info, { javaScriptEnabled: false });
  await avec.page.goto(PHOTO);
  test.skip(!(await avec.page.locator('.vis-carte').count()), 'la photo n’est pas sur la carte dans ce jeu de données');
  let ref = null;
  for (const [width, height] of [[320, 800], [412, 915], [1032, 1250], [1376, 900], [1440, 900]]) {
    for (const { page } of [avec, sans]) {
      await page.setViewportSize({ width, height });
      await page.goto(PHOTO);
      await page.locator('.vis-carte').scrollIntoViewIfNeeded();
      const m = await carte(page);
      const ou = `${width} px${page === sans.page ? ', sans script' : ''}`;
      expect(m.debord, `${ou} : débordement`).toBeLessThanOrEqual(0);
      // Le cadre et la barre ne dépendent ni de la largeur ni du script.
      ref ??= { viewBox: m.viewBox, largeur: m.largeur, lu: m.lu };
      expect({ viewBox: m.viewBox, largeur: m.largeur, lu: m.lu }, ou).toEqual(ref);
      expect(m.lu).toMatch(/^Échelle\u202f: \d[\d\u202f]*\u00a0k?m$/);
      // Le trait mesure la part annoncée du cadre (la longueur écrite, à l'échelle du fond).
      expect(Math.abs(m.trait - (parseFloat(m.largeur) / 100) * m.cadre.w), `${ou} : longueur du trait`).toBeLessThanOrEqual(1.5);
      for (const t of m.textes) {
        expect(t.px, `${ou} : « ${t.t} »`).toBeGreaterThanOrEqual(13 - 0.05);
        expect(t.r.x >= m.cadre.x && t.r.y >= m.cadre.y && t.r.x + t.r.w <= m.cadre.x + m.cadre.w && t.r.y + t.r.h <= m.cadre.y + m.cadre.h, `${ou} : « ${t.t} » dans le cadre`).toBe(true);
        expect(chevauche(t.r, m.ici), `${ou} : « ${t.t} » sur la vignette`).toBe(false);
        for (const o of m.textes) if (o !== t) expect(chevauche(t.r, o.r), `${ou} : « ${t.t} » sur « ${o.t} »`).toBe(false);
      }
    }
  }
  await avec.ctx.close();
  await sans.ctx.close();
});

test('visiteur : la v1, même pendant l’aperçu d’un administrateur', async ({ browser }, info) => {
  const { ctx } = await apercu(browser, info);
  const visitor = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
  const page = await visitor.newPage();
  const res = await page.goto(PHOTO);
  await expect(page.locator('main.viewer')).toBeVisible();
  await expect(page.locator('.vis-scene')).toHaveCount(0);
  expect(res.headers()['cache-control'] || '').not.toContain('private');
  await visitor.close();
  await ctx.close();
});
