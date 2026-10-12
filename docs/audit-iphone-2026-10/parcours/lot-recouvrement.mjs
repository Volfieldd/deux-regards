import { webkit, devices } from '@playwright/test';
const BASE = process.env.BASE, TOKEN = process.env.TOKEN;
const browser = await webkit.launch();
for (const dev of ['iPhone 15', 'iPhone SE', 'iPhone 15 Pro Max']) {
  const ctx = await browser.newContext({ ...devices[dev] });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`);
  await page.getByLabel('Se connecter en tant que').selectOption('julien');
  await page.getByLabel('Jeton de test').fill(TOKEN);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/admin$/);
  await page.goto(`${BASE}/admin/photos/lot?ids=13,14,15`);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const out = [];
    for (const tr of document.querySelectorAll('tr[data-id]')) {
      const t = tr.querySelector('input[data-field=title]');
      const b = t.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + 10, b.top + b.height / 2);
      out.push({ id: tr.dataset.id, titleY: Math.round(b.top), touchable: hit === t, coveredBy: hit && hit !== t ? (hit.closest('[data-batch]') ? 'barre du lot' : hit.closest('.tabbar') ? 'barre d’onglets' : hit.tagName) : null });
    }
    const bar = document.querySelector('[data-batch]').getBoundingClientRect();
    return { viewport: [innerWidth, innerHeight], barTop: Math.round(bar.top), barH: Math.round(bar.height), rows: out };
  });
  console.log(dev, JSON.stringify(r));
  await page.screenshot({ path: `shots/lot-bas-${dev.replace(/ /g, '-')}.png` });
  await ctx.close();
}
await browser.close();
