import { webkit, devices } from '@playwright/test';
import fs from 'node:fs';
const BASE = process.env.BASE, TOKEN = process.env.TOKEN;
const out = { steps: [], console: [] };
const log = (k, v) => { out.steps.push({ k, v }); console.log(k, JSON.stringify(v)); };
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15'] });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') out.console.push(m.text()); });
page.on('pageerror', e => out.console.push('pageerror: ' + e.message));
const shot = async name => page.screenshot({ path: `shots/${name}.png`, fullPage: false });
const full = async name => page.screenshot({ path: `shots/${name}-full.png`, fullPage: true });
// Mesures génériques d'une page : débordement horizontal, cibles trop petites (< 44 px).
const measure = async name => log(name, await page.evaluate(() => {
  const vw = innerWidth;
  const small = [...document.querySelectorAll('a, button, input, select, summary, label.chk, [role=button]')]
    .filter(el => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && (r.width < 44 || r.height < 44) && r.top < innerHeight * 3; })
    .slice(0, 12).map(el => { const r = el.getBoundingClientRect(); return `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} "${(el.getAttribute('aria-label') || el.textContent || el.value || '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`; });
  return { overflowX: document.documentElement.scrollWidth - vw, pageHeight: document.documentElement.scrollHeight, small };
}));

// Connexion locale de test
await page.goto(`${BASE}/admin`);
await page.getByLabel('Se connecter en tant que').selectOption('julien');
await page.getByLabel('Jeton de test').fill(TOKEN);
await page.getByRole('button', { name: 'Se connecter' }).click();
await page.waitForURL(/\/admin$/);
await shot('01-accueil'); await full('01-accueil'); await measure('accueil');

// Photothèque
await page.goto(`${BASE}/admin/photos`);
await shot('02-photos'); await full('02-photos'); await measure('photos');
// Toucher une vignette : que se passe-t-il ?
const tile = page.locator('.tile').first();
await tile.locator('a.img').tap();
await page.waitForTimeout(600);
log('apres-tap-vignette', { url: page.url(), inspVisible: await page.locator('[data-inspector]').isVisible(), inspBox: await page.locator('[data-inspector]').boundingBox() });
await shot('03-tap-vignette');
// Lien vers la fiche complète : visible sans défiler ?
const link = page.locator('[data-one-link]');
const lb = await link.boundingBox();
log('lien-fiche-complete', { box: lb, inViewport: lb ? lb.y >= 0 && lb.y + lb.height <= 844 : false });
// Défiler le panneau jusqu'au lien
await link.scrollIntoViewIfNeeded().catch(() => {});
await shot('04-panneau-defile');
// Toucher le titre de la vignette
await page.goto(`${BASE}/admin/photos`);
const ttl = page.locator('.tile .ttl').first();
log('titre-vignette', { pointerEvents: await ttl.evaluate(el => getComputedStyle(el).pointerEvents) });

// Sélection multiple puis série via la liste déroulante du panneau
await page.goto(`${BASE}/admin/photos`);
const ids = await page.locator('.tile').evaluateAll(ts => ts.slice(0, 2).map(t => Number(t.dataset.id)));
for (const id of ids) await page.locator(`.tile[data-id="${id}"] input.chk`).tap();
await page.waitForTimeout(400);
await shot('05-deux-cochees');
const sel = page.locator('[data-insp-many] select[data-bulk-category]');
const cats = await sel.locator('option').evaluateAll(os => os.map(o => ({ v: o.value, t: o.textContent })));
const target = cats.find(c => c.v && c.v !== 'new' && c.t.trim() === 'Voyage') || cats.find(c => c.v && c.v !== 'new');
const before = await page.evaluate(async ids => Promise.all(ids.map(async id => (await (await fetch(`/admin/photos/${id}/donnees`)).json()).category_id)), ids);
log('selecteur-serie-visible', { visible: await sel.isVisible(), pillsVisible: await page.locator('[data-many-series]').isVisible(), applyBtnVisible: await page.locator('[data-insp-many] button[value=category]').isVisible() });
// (liste déroulante masquée avec JS : seules les pastilles servent)
const after = await page.evaluate(async ids => Promise.all(ids.map(async id => (await (await fetch(`/admin/photos/${id}/donnees`)).json()).category_id)), ids);
log('serie-via-liste-deroulante', { target: target.t, before, after, applied: after.every(c => String(c) === target.v) });
await shot('06-apres-liste-serie');
// Puis via les pastilles
const pill = page.locator(`[data-many-series] [data-category="${target.v}"]`);
if (await pill.isVisible()) { await pill.tap(); await page.waitForTimeout(1200); }
const after2 = await page.evaluate(async ids => Promise.all(ids.map(async id => (await (await fetch(`/admin/photos/${id}/donnees`)).json()).category_id)), ids);
log('serie-via-pastille', { after: after2, applied: after2.every(c => String(c) === target.v) });

// Une seule photo cochée : pastilles de série
await page.goto(`${BASE}/admin/photos`);
await page.locator('.tile input.chk').nth(3).tap();
await page.waitForTimeout(400);
await shot('07-une-cochee');
const oneBox = await page.locator('[data-insp-one] [data-one-series]').boundingBox();
log('une-photo-pastilles', { box: oneBox });

// Fiche photo
const firstId = ids[0];
await page.goto(`${BASE}/admin/photos/${firstId}`);
await shot('08-fiche'); await full('08-fiche'); await measure('fiche');

// Import (3 photos) puis page lot
await page.goto(`${BASE}/admin/photos?importer#import`);
await shot('09-import');
const files = ['brume', 'mer', 'quai'].map(n => `/seed/${n}.jpg`);
await page.locator('[data-import] input[type=file]').setInputFiles(files);
await page.locator('[data-sum-next]').waitFor({ state: 'visible', timeout: 90000 }).catch(e => log('import-timeout', e.message));
await shot('10-import-fini');
const next = page.locator('[data-sum-next]');
log('import-suite', { href: await next.getAttribute('href').catch(() => null) });
await next.tap().catch(() => {});
await page.waitForLoadState('networkidle');
log('page-lot', { url: page.url() });
await shot('11-lot'); await full('11-lot'); await measure('lot');
const lotIds = await page.locator('tr[data-id]').evaluateAll(rs => rs.map(r => Number(r.dataset.id)));
// Série pour tout le lot (barre du bas)
const bsel = page.locator('[data-batch] select[data-bulk-category]');
log('lot-barre', { visible: await bsel.isVisible(), barBox: await page.locator('[data-batch]').boundingBox(), tableBox: await page.locator('.tablewrap').boundingBox(), tableScrollW: await page.locator('.tablewrap').evaluate(e => [e.scrollWidth, e.clientWidth]) });
const lcats = await bsel.locator('option').evaluateAll(os => os.map(o => ({ v: o.value, t: o.textContent })));
const lt = lcats.find(c => c.t.trim() === 'Portrait') || lcats[1];
await bsel.selectOption(lt.v);
await page.waitForTimeout(1500);
const lafter = await page.evaluate(async ids => Promise.all(ids.map(async id => (await (await fetch(`/admin/photos/${id}/donnees`)).json()).category_id)), lotIds);
log('lot-serie-barre', { target: lt.t, after: lafter, applied: lafter.every(c => String(c) === lt.v) });
await shot('12-lot-apres-serie');
// Série d'une ligne (colonne du tableau)
const rowSel = page.locator(`select[name="category_id_${lotIds[0]}"]`);
const rb = await rowSel.boundingBox();
log('lot-select-ligne', { box: rb, visibleInViewport: rb ? rb.x >= 0 && rb.x + rb.width <= 393 : false });
const rt = lcats.find(c => c.t.trim() === 'Rue') || lcats[2];
await rowSel.selectOption(rt.v);
await page.waitForTimeout(1500);
const rafter = await page.evaluate(async id => (await (await fetch(`/admin/photos/${id}/donnees`)).json()).category_id, lotIds[0]);
log('lot-serie-ligne', { target: rt.t, after: rafter, applied: String(rafter) === rt.v });

// Séries
await page.goto(`${BASE}/admin/series`);
await shot('13-series'); await full('13-series'); await measure('series');

fs.writeFileSync('result.json', JSON.stringify(out, null, 2));
await browser.close();
