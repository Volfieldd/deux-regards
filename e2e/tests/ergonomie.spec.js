import { test, expect } from '@playwright/test';
// Correctifs d'ergonomie relevés par le jury des maquettes (docs/audit-ergonomie-2026-10-16/maquettes/CORRECTIFS-POUR-LE-CODE.md) :
// chaque test refait la « vérification » prévue pour un défaut (numéro du § entre parenthèses). Lecture seule : un envoi
// refusé (422) n'enregistre rien.
const STATE = 'results/.auth/admin.json';

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
});
test.afterEach(async () => expect(errors, 'erreurs console / CSP').toEqual([]));

// (§ 12) Le nom lu du bouton de langue commence par le code visible : « clique sur FR » le trouve (WCAG 2.5.3).
test('site public : le bouton de langue se nomme par son code visible, puis sa langue', async ({ page }) => {
  for (const [url, name] of [['/', 'FR – Langue : français'], ['/de/', 'DE – Sprache: Deutsch'], ['/en/', 'EN – Language: English']]) {
    await page.goto(url);
    const summary = page.locator('[data-lang-pick] summary').first();
    await expect(summary).toHaveAccessibleName(name);
    await expect(summary).not.toHaveAttribute('aria-label', /.*/);
    // axe-core, règle « expérimentale » à activer : le nom accessible contient l'étiquette visible.
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const { violations } = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze();
    expect(violations.map(v => `${url} ${v.id} : ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  }
});

test.describe('administration', () => {
  test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
  test.use({ storageState: STATE });

  // (§ 1) Un champ en erreur garde un focus visible : le filet rouge reste, l'anneau du focus s'ajoute.
  test('fiche photo : le champ en erreur montre son focus, en sombre et en clair', async ({ page, context }) => {
    for (const theme of ['dark', 'light']) {
      await context.addCookies([{ name: 'admin_theme', value: theme, url: `${process.env.BASE_URL}/admin` }]);
      await page.goto('/admin/photos/1');
      const date = page.locator('input[name="taken_on"]');
      await date.fill('demain matin');
      const [res] = await Promise.all([page.waitForResponse(r => r.request().method() === 'POST'), date.press('Enter')]);
      expect(res.status()).toBe(422);                                                     // refusé : rien n'est enregistré
      await expect(date).toHaveAttribute('aria-invalid', 'true');
      await page.evaluate(() => document.activeElement?.blur());
      expect(await date.evaluate(el => getComputedStyle(el).outlineStyle), theme).toBe('none');
      await date.focus();
      expect(await date.evaluate(el => getComputedStyle(el).outlineStyle), theme).toBe('solid');
      expect(await date.evaluate(el => getComputedStyle(el).boxShadow), theme).toMatch(/inset/);   // le filet rouge reste
    }
  });

  // (§ 2, § 3) Danger en rouge, distinct de l'ambre ; numéro de version à 12 px.
  test('couleur du danger et numéro de version', async ({ page, context }) => {
    await context.addCookies([{ name: 'admin_theme', value: 'dark', url: `${process.env.BASE_URL}/admin` }]);
    await page.goto('/admin');
    const css = await page.evaluate(() => { const s = getComputedStyle(document.documentElement); return [s.getPropertyValue('--danger').trim(), s.getPropertyValue('--accent').trim()]; });
    expect(css).toEqual(['#f0605a', '#f0a94c']);
    expect(await page.locator('.nav-ver').evaluate(el => getComputedStyle(el).fontSize)).toBe('12px');
  });

  // (§ 8) Au téléphone, sans script : « Menu » est un lien vers la barre, ouverte par :target ; le clavier y reste.
  test.describe('menu au téléphone sans JavaScript', () => {
    test.use({ javaScriptEnabled: false, viewport: { width: 412, height: 915 } });
    test('le menu s’ouvre, ses liens mènent où ils disent, le clavier reste dedans, « Fermer » le referme', async ({ page }) => {
      await page.goto('/admin');
      const side = page.locator('#admin-nav');
      await expect(side).toBeHidden();
      await page.locator('.tabbar').getByRole('link', { name: 'Menu' }).click();
      await expect(page).toHaveURL(/#admin-nav$/);
      await expect(side).toBeVisible();
      await expect(page.locator('.tabbar')).toBeHidden();
      // Depuis le dernier élément du menu, Tab ne va ni sur la page ni sur la barre d'onglets.
      await side.locator('.foot button').last().focus();
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.shell > .main, .tabbar')))).toBe(false);
      // « Fermer » : la barre se referme, le focus est sur le contenu.
      await side.getByRole('link', { name: 'Fermer le menu' }).click();
      await expect(page).toHaveURL(/#contenu$/);
      await expect(side).toBeHidden();
      await expect(page.locator('#contenu')).toBeFocused();
      // Les liens du menu mènent où ils disent.
      await page.locator('.tabbar').getByRole('link', { name: 'Menu' }).click();
      await side.getByRole('link', { name: 'Séries', exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/series$/);
      await expect(page.locator('h1')).toHaveText('Séries');
    });
  });

  // (§ 8) Avec le script : un vrai bouton (aria-expanded), la page inerte tant que le menu est ouvert.
  test('menu au téléphone avec JavaScript : bouton, page inerte, focus rendu', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'téléphone');
    await page.goto('/admin');
    const btn = page.locator('.tabbar').getByRole('button', { name: 'Menu' });
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate(() => document.querySelector('.shell > .main').inert)).toBe(true);
    expect(page.url()).not.toMatch(/#/);
    await page.locator('#admin-nav').getByRole('link', { name: 'Fermer le menu' }).click();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.querySelector('.shell > .main').inert)).toBe(false);
    await expect(btn).toBeFocused();
    await btn.click();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.querySelector('.shell > .main').inert)).toBe(false);
    await expect(btn).toBeFocused();
  });

  // (§ 9) La palette ⌘K montre le focus de son champ.
  test('palette : le champ montre son focus', async ({ page, isMobile }) => {
    test.skip(isMobile, 'clavier');
    await page.goto('/admin/photos');
    await page.keyboard.press('Control+k');
    await expect(page.locator('dialog.palette')).toBeVisible();
    expect(await page.locator('.pal-in').evaluate(el => getComputedStyle(el).boxShadow)).toMatch(/inset/);
    await page.keyboard.press('Escape');
  });

  // (§ 5) App de terrain : les boutons radio d'une question sans réponse portent le filet ; au focus, l'anneau s'ajoute à 4 px.
  test('app de terrain : radio en erreur, filet et focus ensemble', async ({ page }) => {
    await page.goto('/admin/rencontre');
    await page.locator('input[name="decision"][value="accord"]').check();
    await page.locator('input[name="scope_site"]').check();
    await page.locator('input[name="name"]').fill('Personne Exemple');
    await page.locator('[data-save]').focus();
    await page.keyboard.press('Enter');                                                   // refusé avant l'envoi (âge, signature)
    const radio = page.locator('input[name="adult"][value="oui"]');
    await expect(radio).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('input[name="adult"][value="non"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#err-adult')).toBeVisible();
    await expect(page.locator('fieldset.app-age')).toHaveAttribute('aria-describedby', 'err-adult');
    await page.evaluate(() => document.activeElement?.blur());
    expect(await radio.evaluate(el => getComputedStyle(el).outlineOffset)).toBe('1px');
    await page.locator('input[name="wants_photo"]').focus();
    await page.keyboard.press('Tab');
    await expect(radio).toBeFocused();
    expect(await radio.evaluate(el => getComputedStyle(el).outlineOffset)).toBe('4px');
  });

  test.describe('app de terrain sans JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    // (§ 10) La langue cochée pour la personne change son texte, sans script.
    test('la langue choisie change le texte de la personne', async ({ page }) => {
      await page.goto('/admin/rencontre');
      const shown = l => page.locator(`.app-l10n[data-l="${l}"]`).evaluate(el => getComputedStyle(el).display);
      expect(await shown('fr')).toBe('block');
      await page.locator('.app-langs label').filter({ hasText: 'DE' }).click();      // le libellé est le bouton
      expect([await shown('fr'), await shown('de')]).toEqual(['none', 'block']);
      await expect(page.locator('.app-l10n[data-l="de"]')).toHaveAttribute('lang', 'de');
      await page.locator('.app-langs label').filter({ hasText: 'EN' }).click();
      expect([await shown('de'), await shown('en')]).toEqual(['none', 'block']);
    });
    // (§ 5) Refus du serveur : le groupe est marqué, la phrase est dans la langue de la personne.
    test('envoi refusé : le groupe sans réponse est marqué, dans la langue de la personne', async ({ page }) => {
      await page.goto('/admin/rencontre');
      await page.locator('.app-langs label').filter({ hasText: 'DE' }).click();      // le libellé est le bouton
      await page.locator('input[name="decision"][value="accord"]').check();
      await page.locator('input[name="scope_site"]').check();
      await page.locator('input[name="name"]').fill('Personne Exemple');
      const [res] = await Promise.all([page.waitForResponse(r => r.request().method() === 'POST'), page.locator('[data-save]').click()]);
      expect(res.status()).toBe(422);
      await expect(page.locator('input[name="adult"][value="oui"]')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('fieldset.app-age')).toHaveAttribute('aria-describedby', 'err-adult');
      await expect(page.locator('#err-adult')).toHaveText('Bitte beantworten Sie diese Frage: Sind Sie 18 Jahre oder älter?', { useInnerText: true });
    });
  });
});
