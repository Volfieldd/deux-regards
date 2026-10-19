import { test, expect } from '@playwright/test';
import { creerRencontre, effacerRencontre, creerVoyage, supprimerVoyage } from './terrain-donnees.js';

// Admin v2 en allemand (le plus long des trois) : aucun débordement à 320, 412, 1 032 × 1 250, 1 376 × 900 et 1 440 px.
// La langue est celle du compte de test de la v2 : ce projet passe après les autres tests de la v2, et la remet en français.
const STATE = 'results/.auth/admin-v2.json';
test.skip(!process.env.E2E_LOCAL_AUTH, 'E2E_LOCAL_AUTH absent');
test.use({ storageState: STATE });

const lang = async (page, l) => {
  await page.goto('/admin');
  const csrf = await page.locator('body').getAttribute('data-csrf');
  await page.request.post('/admin/langue', { form: { _csrf: csrf, lang: l, back: '/admin' } });
};

test('en allemand, aucun débordement sur les écrans de la v2', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/admin/photos');
  const ids = await page.locator('.tile').evaluateAll(ts => ts.slice(0, 3).map(t => Number(t.dataset.id)));
  // Vague 3b : une rencontre (et sa sortie) et un voyage le temps du test.
  const r = await creerRencontre(page, { jour: '2025-10-20', nom: 'Deutsch Essai' });
  const tid = await creerVoyage(page, 'Reise Essai');
  await lang(page, 'de');
  try {
    const urls = ['/admin', '/admin/reglages/assistants', '/admin/droits', '/admin/images', '/admin/auteurs', '/admin/compte', `/admin/photos/lot?ids=${ids.join(',')}`, '/admin/rencontre', '/admin/rencontre/accueil',
      // Vague 2 : la fiche d'une photo, la photothèque (planche et liste), À valider.
      `/admin/photos/${ids[0]}`, '/admin/photos', '/admin/photos?vue=liste', '/admin/a-valider',
      // Vague 3b : Personnes, Demandes et rencontres, une rencontre, Séries, Sorties, une sortie, Voyages, un voyage.
      '/admin/personnes', '/admin/rencontres', `/admin/rencontres/${r.id}`, '/admin/series', '/admin/sorties', '/admin/sorties/sebastien/2025-10-20', '/admin/voyages', `/admin/voyages/${tid}`];
    for (const [w, h] of [[320, 640], [412, 839], [1032, 1250], [1376, 900], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const url of urls) {
        await page.goto(url);
        await expect(page.locator('html')).toHaveAttribute('lang', 'de');
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
    // Les onglets et le menu en allemand.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/reglages/assistants');
    await expect(page.locator('.onglets a[aria-current="page"]')).toHaveText('Analyse-Assistenten');
    await expect(page.locator('.side .grp')).toHaveText(['Fotos', 'Personen', 'Veröffentlichen', 'Team']);
  } finally {
    await lang(page, 'fr');
    await effacerRencontre(page, r.id);
    await supprimerVoyage(page, tid);
  }
});
