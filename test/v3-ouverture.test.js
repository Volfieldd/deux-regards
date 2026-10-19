import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { as, visitor } from './carnet-helpers.js';
import { FOCALS, parseFocal } from '../server/point-focal.js';

// Site public v3, suite (PLAN point 9, Spécifications P28) : point fort du cadrage de chaque photo (migration 059, fiche
// v1 et v2) et ouverture du téléphone (réglage hero_tel, Site public v1 et v2) ; rendu de l'ouverture plein cadre en
// classes seulement (CSP sans style en ligne).
async function site(t) {
  const c = await setup(t, { seeded: true });
  const admin = as(c, { sub: 'v3-admin', roles: ['admin'] });
  const photo = slug => c.db.prepare('SELECT * FROM photos WHERE slug = ?').get(slug);
  const published = () => c.db.prepare("SELECT * FROM photos WHERE status = 'published' ORDER BY position").all();
  return { ...c, admin, photo, published, see: visitor(c) };
}
// Le formulaire complet de la fiche v1, tel que la page l'envoie (valeurs de la photo), plus ce qui change.
const fiche = (p, extra = {}) => ({ title: p.title, slug: p.slug, category_id: String(p.category_id), author_id: String(p.author_id), place: p.place || '', taken_on: p.taken_on || '', legend: p.legend || '', status: p.status, watermark: p.watermark === 0 ? 'none' : 'default', ...extra });

test('migration 059 : centre par défaut, neuf positions seulement', async t => {
  const c = await site(t);
  const p = c.published()[0];
  assert.deepEqual([p.focal_x, p.focal_y], [50, 50]);
  assert.throws(() => c.db.prepare('UPDATE photos SET focal_x = 30 WHERE id = ?').run(p.id), /CHECK/);
  assert.equal(FOCALS.length, 9);
  assert.deepEqual(parseFocal('0 100'), [0, 100]);
  for (const bad of ['30 30', '50', '', '50 50 50', '-0 50', '<b>', null]) assert.equal(parseFocal(bad), null, String(bad));
});

test('fiche v1 : le point fort se choisit, se garde quand il n’est pas envoyé, et une valeur inconnue est refusée', async t => {
  const c = await site(t);
  const p = c.published()[0];
  let page = (await c.admin.get(`/admin/photos/${p.id}`)).body;
  assert.match(page, /<select id="focal" name="focal" aria-describedby="focal-aide">/);
  assert.match(page, /<option value="50 50" selected>Au centre<\/option>/);
  assert.equal((await c.admin.post(`/admin/photos/${p.id}`, fiche(p, { focal: '0 100' }))).statusCode, 303);
  assert.deepEqual([c.photo(p.slug).focal_x, c.photo(p.slug).focal_y], [0, 100]);
  page = (await c.admin.get(`/admin/photos/${p.id}`)).body;
  assert.match(page, /<option value="0 100" selected>En bas à gauche<\/option>/);
  // Formulaire sans le champ (une autre page) : gardé.
  assert.equal((await c.admin.post(`/admin/photos/${p.id}`, fiche(c.photo(p.slug)))).statusCode, 303);
  assert.deepEqual([c.photo(p.slug).focal_x, c.photo(p.slug).focal_y], [0, 100]);
  // Valeur inconnue : 422, l'erreur sous le champ, rien d'enregistré.
  const bad = await c.admin.post(`/admin/photos/${p.id}`, fiche(c.photo(p.slug), { focal: '30 30' }));
  assert.equal(bad.statusCode, 422);
  assert.match(bad.body, /id="err-focal" role="alert">Point fort inconnu\./);
  assert.match(bad.body, /<select id="focal" name="focal" aria-describedby="focal-aide err-focal" aria-invalid="true">/);
  assert.deepEqual([c.photo(p.slug).focal_x, c.photo(p.slug).focal_y], [0, 100]);
});

test('fiche v2 : champ par champ ; le relecteur (textes seuls) ne le change pas', async t => {
  const c = await site(t);
  const p = c.published()[0];
  await c.admin.post('/admin/version', { version: 'v2', back: '/admin' });
  const page = (await c.admin.get(`/admin/photos/${p.id}`)).body;
  assert.match(page, /<select id="focal" name="focal" aria-describedby="focal-a" data-champ="focal" data-label="Point fort du cadrage">/);
  const r = await c.admin.json(`/admin/photos/${p.id}/champs`, { focal: '100 0' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual([c.photo(p.slug).focal_x, c.photo(p.slug).focal_y], [100, 0]);
  assert.equal((await c.admin.json(`/admin/photos/${p.id}/champs`, { focal: 'en haut' })).statusCode, 422);
  const relu = as(c, { sub: 'v3-relu', roles: ['relecteur'] });
  assert.equal((await relu.json(`/admin/photos/${p.id}/champs`, { focal: '0 0' })).statusCode, 403);
  assert.deepEqual([c.photo(p.slug).focal_x, c.photo(p.slug).focal_y], [100, 0]);
});

test('ouverture v3 : format et point fort en classes, jamais en style en ligne (CSP)', async t => {
  const c = await site(t);
  c.app.publicVersion.save('v3');
  const first = c.published()[0];
  c.db.prepare('UPDATE photos SET focal_x = 0, focal_y = 100 WHERE id = ?').run(first.id);
  const body = (await c.see('/')).body;
  const ouv = body.slice(body.indexOf('<div class="plein-zone'), body.indexOf('class="wrap promesse"'));
  assert.doesNotMatch(ouv, /style="/);
  assert.match(ouv, /<section class="plein fmt-[\dx]+"/);
  assert.match(ouv, /<div class="plein-photo focal-0-100"><picture class="plein-pic/, 'le point fort réglé dans la fiche');
  assert.equal((ouv.match(/class="plein-photo focal-/g) || []).length, (ouv.match(/data-ouv-point=/g) || []).length || 1, 'une classe par photo');
  assert.match(ouv, /fetchpriority="high"/);
  assert.match(ouv, /<template data-ouv-diapo="1"><div data-image><div class="plein-photo focal-\d+-\d+">/, 'les suivantes, dans l’ouverture');
});

test('ouverture du téléphone : enregistrée (v1 et v2 de l’admin), ← → ✕ sans script, suit le renommage et la suppression', async t => {
  const c = await site(t);
  const pub = c.published();
  const verticals = pub.filter(p => p.height > p.width).map(p => p.slug);
  const horizontals = pub.filter(p => p.width > p.height).map(p => p.slug);
  assert.ok(verticals.length >= 2, 'des verticales dans le jeu de test');
  // v1 : la page montre les deux listes ; la réserve du téléphone n'a que des verticales.
  let page = (await c.admin.get('/admin/site')).body;
  const tel = page.slice(page.indexOf('id="ouverture-tel"'), page.indexOf('</fieldset>', page.indexOf('id="ouverture-tel"')));
  assert.match(page, /id="ouverture" data-hero data-name="hero"/);
  assert.match(tel, /data-hero data-name="hero_tel"/);
  assert.match(tel, /Ouverture au téléphone \(v3\)/);
  for (const s of horizontals) assert.doesNotMatch(tel, new RegExp(`data-slug="${s}"`), `${s} : pas une verticale`);
  // Enregistrer : les deux listes, dans l'ordre ; une adresse inconnue ou non publiée est ignorée.
  const r = await c.admin.post('/admin/reglages', { part: 'site', hero: horizontals.slice(0, 2), hero_tel: [verticals[0], verticals[1], 'inconnue'], hero_save: '1' });
  assert.equal(r.statusCode, 303);
  const heroTel = () => JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'hero_tel'").pluck().get());
  assert.deepEqual(heroTel(), [verticals[0], verticals[1]]);
  // ← sans script : l'ordre change, retour à la liste du téléphone.
  const left = await c.admin.post('/admin/reglages', { part: 'site', hero: horizontals.slice(0, 2), hero_tel: heroTel(), hero_tel_op: `left:${verticals[1]}` });
  assert.equal(left.headers.location, '/admin/site#ouverture-tel');
  assert.deepEqual(heroTel(), [verticals[1], verticals[0]]);
  assert.deepEqual(JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'hero'").pluck().get()), horizontals.slice(0, 2), 'l’autre liste ne bouge pas');
  // Renommer une photo : l'ouverture du téléphone suit ; la supprimer : elle en sort.
  const p = c.photo(verticals[0]);
  await c.admin.post(`/admin/photos/${p.id}`, fiche(p, { slug: 'nouvelle-adresse-v3' }));
  assert.ok(heroTel().includes('nouvelle-adresse-v3'));
  assert.equal((await c.admin.post(`/admin/photos/${p.id}/delete`, {})).statusCode, 303);
  assert.equal(c.photo('nouvelle-adresse-v3'), undefined);
  assert.ok(!heroTel().includes('nouvelle-adresse-v3'));
  // v2 de l'admin : les deux listes aussi.
  await c.admin.post('/admin/version', { version: 'v2', back: '/admin' });
  page = (await c.admin.get('/admin/site')).body;
  assert.match(page, /id="ouverture-tel" aria-labelledby="ouverture-tel-t" data-hero data-name="hero_tel"/);
  assert.match(page, /<a href="#ouverture-tel">Ouverture au téléphone<\/a>/);
  const j = await c.admin.json('/admin/reglages', { part: 'site', hero: horizontals.slice(0, 1), hero_tel: [verticals[1]] });
  assert.equal(j.statusCode, 200);
  assert.deepEqual(JSON.parse(j.body).hero_tel, [verticals[1]]);
});

test('accueil v3 avec une ouverture du téléphone : deux ouvertures, une par appareil, ids uniques ; la v2 l’ignore', async t => {
  const c = await site(t);
  const pub = c.published();
  const verticals = pub.filter(p => p.height > p.width).map(p => p.slug);
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('hero_tel', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(verticals.slice(0, 2)));
  c.app.publicVersion.save('v3');
  const body = (await c.see('/')).body;
  assert.match(body, /<div class="plein-zone plein-zone--bureau">/);
  assert.match(body, /<div class="plein-zone plein-zone--tel">/);
  assert.equal((body.match(/data-ouverture>/g) || []).length, 2);
  assert.match(body, /id="ouv-cartel"/);
  assert.match(body, /id="ouv-cartel-tel"/);
  // Aucune image chargée d'office : celle de l'appareil qui ne la montre pas reste cachée, donc jamais chargée.
  assert.doesNotMatch(body.slice(0, body.indexOf('class="wrap promesse"')), /fetchpriority="high"/);
  const telZone = body.slice(body.indexOf('plein-zone--tel'), body.indexOf('class="wrap promesse"'));
  assert.equal((telZone.match(/data-ouv-point=/g) || []).length, 2);
  assert.equal((body.match(/<h1\b/g) || []).length, 1);
  // Sans liste du téléphone : une seule ouverture, chargée d'office.
  c.db.prepare("UPDATE settings SET value = '[]' WHERE key = 'hero_tel'").run();
  const one = (await c.see('/')).body;
  assert.equal((one.match(/data-ouverture>/g) || []).length, 1);
  assert.doesNotMatch(one, /plein-zone--tel/);
  // En v2 : l'ouverture de toujours, une seule.
  c.db.prepare("UPDATE settings SET value = ? WHERE key = 'hero_tel'").run(JSON.stringify(verticals.slice(0, 2)));
  c.app.publicVersion.save('v2');
  const v2 = (await c.see('/')).body;
  assert.equal((v2.match(/data-ouverture/g) || []).length, 1);
  assert.doesNotMatch(v2, /plein-zone/);
});
