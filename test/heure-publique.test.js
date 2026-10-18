import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { clockTime, shownTime } from '../server/format.js';
import { specFor, WATERMARK_DEFAULTS } from '../server/variants.js';
import { renderVariants, variantName } from '../server/images.js';
import { search } from '../server/geo/cities.js';
import { createRepo } from '../server/repo.js';

// Heure de prise de vue sur le site public : choisie photo par photo dans la fiche de l'admin (« Montrer l'heure sur le
// site », décochée par défaut, migration 052). Le site ne la montre que sur la page de la photo, case cochée, date au
// jour et heure connue ; nulle part ailleurs, ni dans les images servies.
const DAY = '2025-05-01';
const FR = '14 h 32', EN = '2:32 pm', DE = '14:32 Uhr';
// Toute écriture de 14 h 32, quelle que soit la langue ou l'espace.
const ANY_TIME = /14\s*h\s*32|14:32|2:32/;
const angers = () => search('Angers', 10).find(c => c.cc === 'FR');

async function site(t) {
  const ctx = await setup(t, { seeded: true });
  const store = createSessionStore(ctx.db);
  const session = (sub, roles) => {
    const token = store.create({ sub, name: sub, roles });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const get = url => ctx.app.inject({ url, cookies: { session: token }, headers: { accept: 'text/html' } });
    const post = (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } });
    const json = (url, payload) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload });
    return { get, post, json };
  };
  const as = role => { ctx.app.accounts.ensure({ sub: `test:${role}`, name: role, roles: [role] }); return session(`test:${role}`, [role]); };
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  // Compte Photographe lié à Sébastien (portée « les miennes »).
  const photographer = () => {
    ctx.app.accounts.ensure({ sub: 'zitadel-seb', name: 'Sébastien', roles: ['photographe'] });
    ctx.app.accounts.update(ctx.app.accounts.bySub('zitadel-seb').id, { authorId: seb }, 'test');
    return session('zitadel-seb', []);
  };
  // Deux photos publiées, prises à Angers le même jour : la première à 14 h 32, la seconde (« À proximité ») à 9 h 05.
  const [a, b] = ctx.db.prepare("SELECT * FROM photos WHERE status = 'published' AND author_id = ? ORDER BY position, id LIMIT 2").all(seb);
  const c = angers();
  const place = ctx.db.prepare('UPDATE photos SET taken_on = ?, taken_time = ?, on_map = 1, city_id = ?, city_name = ?, city_cc = ?, city_lat = ?, city_lon = ? WHERE id = ?');
  place.run(DAY, '14:32', c.id, c.name, c.cc, c.lat, c.lon, a.id);
  place.run(DAY, '09:05', c.id, c.name, c.cc, c.lat, c.lon, b.id);
  const row = id => ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  // Le formulaire de la fiche tel que le navigateur l'envoie (case décochée : champ absent).
  const form = (p, extra = {}) => ({ title: p.title, slug: p.slug, category_id: String(p.category_id), author_id: String(p.author_id), place: p.place || '',
    taken_on: p.taken_on || '', legend: p.legend || '', status: p.status, watermark: 'default', ...(p.on_map ? { on_map: 'on' } : {}), ...extra });
  const visit = url => ctx.app.inject({ url });
  return { ...ctx, as, photographer, seb, jul, a: row(a.id), b: row(b.id), row, form, visit };
}

test('migration 052 : une colonne show_time à 0 pour toutes les photos, 0 ou 1 seulement', async t => {
  const c = await site(t);
  const col = c.db.prepare('PRAGMA table_info(photos)').all().find(x => x.name === 'show_time');
  assert.ok(col, 'colonne show_time');
  assert.equal(col.notnull, 1);
  assert.equal(col.dflt_value, '0');
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM photos WHERE show_time != 0').pluck().get(), 0);
  assert.ok(c.db.prepare('SELECT 1 FROM migrations WHERE name = ?').get('052_heure_publique.sql'));
  assert.throws(() => c.db.prepare('UPDATE photos SET show_time = 2 WHERE id = ?').run(c.a.id), /CHECK/);
  // Aucun déclencheur sur la colonne (la Vigie surveille les déclencheurs des comptes, pas ceux des photos) : ceux des
  // photos sont la date de première publication (009) et le numéro d'inventaire (053).
  assert.deepEqual(c.db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'photos'").pluck().all().sort(),
    ['photos_inventory_insert', 'photos_inventory_stable', 'photos_inventory_update', 'photos_published_at_insert', 'photos_published_at_update']);
  assert.deepEqual(c.db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND sql LIKE '%show_time%'").pluck().all(), []);
});

test('format de l’heure : 14 h 32, 2:32 pm, 14:32 Uhr ; rien sans case cochée, sans jour ou sans heure', () => {
  assert.equal(clockTime('14:32', 'fr'), FR);
  assert.equal(clockTime('14:32', 'en'), EN);
  assert.equal(clockTime('14:32', 'de'), DE);
  assert.equal(clockTime('07:05', 'fr'), '7 h 05');
  assert.equal(clockTime('00:10', 'en'), '12:10 am');
  assert.equal(clockTime('12:00', 'en'), '12:00 pm');
  assert.equal(clockTime('07:05', 'de'), '7:05 Uhr');
  for (const bad of ['', null, '24:00', '9:05', '14:32:10', '<b>']) assert.equal(clockTime(bad, 'fr'), '', String(bad));
  const p = { show_time: 1, taken_on: DAY, taken_time: '14:32' };
  assert.equal(shownTime(p, 'fr'), FR);
  assert.equal(shownTime({ ...p, show_time: 0 }), '');
  assert.equal(shownTime({ ...p, taken_on: '2025-05' }), '');
  assert.equal(shownTime({ ...p, taken_time: '' }), '');
  assert.equal(shownTime({ ...p, taken_time: null }), '');
});

test('site public v1 et v2 : l’heure n’apparaît pas tant que la case n’est pas cochée', async t => {
  const c = await site(t);
  for (const v of ['v1', 'v2']) {
    c.app.publicVersion.save(v);
    for (const prefix of ['', '/en', '/de']) {
      const res = await c.visit(`${prefix}/photo/${c.a.slug}`);
      assert.equal(res.statusCode, 200);
      assert.doesNotMatch(res.body, ANY_TIME, `${v} ${prefix || '/'}`);
    }
  }
});

test('case cochée : l’heure suit la date sur la page de la photo, en français, en anglais et en allemand', async t => {
  const c = await site(t);
  assert.equal((await c.as('admin').post(`/admin/photos/${c.a.id}`, c.form(c.a, { show_time: '1' }))).statusCode, 303);
  assert.equal(c.row(c.a.id).show_time, 1);
  // v1 : la ligne de méta, avec la date au jour (« Angers, 1 mai 2025, 14 h 32 »).
  c.app.publicVersion.save('v1');
  const v1 = { '': `1 mai 2025, ${FR}`, '/en': `1 May 2025, ${EN}`, '/de': `1. Mai 2025, ${DE}` };
  for (const [prefix, text] of Object.entries(v1)) {
    const body = (await c.visit(`${prefix}/photo/${c.a.slug}`)).body;
    assert.ok(body.includes(text), `v1 ${prefix || '/'} : ${text}`);
  }
  // v2 : le cartel et la ligne « Lieu, date et heure ».
  c.app.publicVersion.save('v2');
  const v2 = { '': [FR, 'Lieu, date et heure'], '/en': [EN, 'Place, date and time'], '/de': [DE, 'Ort, Datum und Uhrzeit'] };
  for (const [prefix, [time, label]] of Object.entries(v2)) {
    const body = (await c.visit(`${prefix}/photo/${c.a.slug}`)).body;
    const cartel = body.slice(body.indexOf('<span class="cartel-m">'), body.indexOf('</figcaption>'));
    assert.ok(cartel.includes(time), `cartel v2 ${prefix || '/'}`);
    assert.ok(body.includes(`<dt>${label}</dt>`), `données v2 ${prefix || '/'}`);
    assert.equal(body.split(time).length - 1, 2, 'cartel et données, rien d’autre');
  }
});

test('case cochée, mais date au mois ou heure inconnue : pas d’heure sur le site', async t => {
  const c = await site(t);
  c.db.prepare('UPDATE photos SET show_time = 1 WHERE id = ?').run(c.a.id);
  c.db.prepare("UPDATE photos SET taken_on = '2025-05' WHERE id = ?").run(c.a.id);
  for (const v of ['v1', 'v2']) {
    c.app.publicVersion.save(v);
    assert.doesNotMatch((await c.visit(`/photo/${c.a.slug}`)).body, ANY_TIME, `${v} au mois`);
  }
  c.db.prepare("UPDATE photos SET taken_on = ?, taken_time = '' WHERE id = ?").run(DAY, c.a.id);
  assert.doesNotMatch((await c.visit(`/photo/${c.a.slug}`)).body, /\d h \d\d|Lieu, date et heure/);
});

test('l’heure ne sort nulle part ailleurs : galerie, À proximité, carte, partage, plan du site, aperçus de liens', async t => {
  const c = await site(t);
  // Les deux photos montrent leur heure : leur page seule la porte.
  c.db.prepare('UPDATE photos SET show_time = 1 WHERE id IN (?, ?)').run(c.a.id, c.b.id);
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('map_page', 'true') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  for (const v of ['v1', 'v2']) {
    c.app.publicVersion.save(v);
    const page = (await c.visit(`/photo/${c.b.slug}`)).body;
    assert.ok(page.includes('9 h 05'), 'sa propre heure');
    assert.ok(page.includes(`href="/photo/${c.a.slug}"`), 'la voisine est « À proximité »');
    assert.doesNotMatch(page, ANY_TIME, `${v} : pas l’heure de la voisine`);
    assert.doesNotMatch(page.match(/<meta[^>]+>/g).join('\n'), /9\s*h\s*05|09:05|9:05/, 'ni dans les balises meta');
  }
  for (const url of ['/', `/serie/${c.db.prepare('SELECT slug FROM categories WHERE id = ?').pluck().get(c.a.category_id)}`, '/carte', `/photo/${c.a.slug}/partager`, '/sitemap.xml', '/recherche?q=Angers', '/en/carte']) {
    const res = await c.visit(url);
    assert.ok(res.statusCode < 400, `${url} : ${res.statusCode}`);
    assert.doesNotMatch(res.body, ANY_TIME, url);
  }
  // Les données publiques des photos ne portent jamais l'heure brute, seulement celle qui est montrée.
  const repo = createRepo(c.db);
  const list = repo.publishedPhotos();
  assert.ok(list.every(p => !('taken_time' in p)));
  c.db.prepare('UPDATE photos SET show_time = 0 WHERE id = ?').run(c.a.id);
  const again = repo.publishedPhotos().find(p => p.id === c.a.id);
  assert.equal(again.shown_time, null);
  assert.equal(again.time, '');
});

test('fiche de l’admin : case décochée par défaut, avec l’heure ; absente sans heure connue', async t => {
  const c = await site(t);
  const admin = c.as('admin');
  const fiche = (await admin.get(`/admin/photos/${c.a.id}`)).body;
  const box = fiche.match(/<input type="checkbox" name="show_time"[^>]*>/)?.[0];
  assert.ok(box, 'case présente');
  assert.doesNotMatch(box, /checked/);
  assert.match(fiche, /Montrer l’heure sur le site <span class="mono">\(14 h 32\)<\/span><\/label>/);
  assert.match(fiche, /où se trouvaient les personnes photographiées/);
  // Sans heure connue (NULL : pas encore lue ; '' : inconnue) : pas de case.
  for (const time of [null, '']) {
    c.db.prepare('UPDATE photos SET taken_time = ? WHERE id = ?').run(time, c.b.id);
    assert.doesNotMatch((await admin.get(`/admin/photos/${c.b.id}`)).body, /name="show_time"/, String(time));
  }
  // Cochée : la fiche la montre cochée ; décochée (champ absent) : remise à 0.
  await admin.post(`/admin/photos/${c.a.id}`, c.form(c.a, { show_time: '1' }));
  assert.match((await admin.get(`/admin/photos/${c.a.id}`)).body, /name="show_time" value="1" checked/);
  await admin.post(`/admin/photos/${c.a.id}`, c.form(c.row(c.a.id)));
  assert.equal(c.row(c.a.id).show_time, 0);
  // Date au mois : la fiche prévient que l'heure n'est pas montrée.
  c.db.prepare("UPDATE photos SET show_time = 1, taken_on = '2025-05' WHERE id = ?").run(c.a.id);
  assert.match((await admin.get(`/admin/photos/${c.a.id}`)).body, /Date au mois : l’heure n’est pas montrée\./);
  // Métadonnées « tout l'EXIF » : la fiche prévient que les images servies portent l'heure.
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('exif', '{\"mode\":\"all\"}') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  assert.match((await admin.get(`/admin/photos/${c.a.id}`)).body, /les images servies portent l’heure/);
});

test('valeur forgée de la case : ramenée à 0 ou 1 ; jamais 1 sans heure connue', async t => {
  const c = await site(t);
  const admin = c.as('admin');
  const cases = [['1', 1], ['on', 1], ['2', 0], ['oui', 0], ['1 OR 1=1', 0], [['1', '1'], 0], ['', 0]];
  for (const [value, want] of cases) {
    c.db.prepare('UPDATE photos SET show_time = 0 WHERE id = ?').run(c.a.id);
    const res = await admin.post(`/admin/photos/${c.a.id}`, c.form(c.row(c.a.id), { show_time: value }));
    assert.equal(res.statusCode, 303, JSON.stringify(value));
    assert.equal(c.row(c.a.id).show_time, want, JSON.stringify(value));
  }
  // Photo sans heure connue : la case forgée ne vaut rien.
  c.db.prepare("UPDATE photos SET taken_time = '' WHERE id = ?").run(c.b.id);
  await admin.post(`/admin/photos/${c.b.id}`, c.form(c.b, { show_time: '1' }));
  assert.equal(c.row(c.b.id).show_time, 0);
  // Enregistrement champ par champ (photothèque) : même règle, et les autres champs gardent la case.
  assert.equal((await admin.json(`/admin/photos/${c.a.id}/champs`, { show_time: true })).statusCode, 200);
  assert.equal(c.row(c.a.id).show_time, 1);
  assert.equal((await admin.json(`/admin/photos/${c.a.id}/champs`, { title: 'Autre titre' })).statusCode, 200);
  assert.equal(c.row(c.a.id).show_time, 1, 'un autre champ ne touche pas à la case');
  assert.equal((await admin.json(`/admin/photos/${c.a.id}/champs`, { show_time: { $ne: 0 } })).statusCode, 200);
  assert.equal(c.row(c.a.id).show_time, 0);
});

test('droits : le photographe règle l’heure de ses photos seulement ; le relecteur jamais', async t => {
  const c = await site(t);
  const seb = c.photographer();
  // Sa photo : permis.
  assert.equal((await seb.post(`/admin/photos/${c.a.id}`, c.form(c.a, { show_time: '1' }))).statusCode, 303);
  assert.equal(c.row(c.a.id).show_time, 1);
  // Celle de Julien : introuvable pour lui (portée « les miennes »), sous toutes les adresses ; rien ne change.
  const other = c.db.prepare('SELECT * FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').get(c.jul);
  c.db.prepare("UPDATE photos SET taken_on = ?, taken_time = '10:00' WHERE id = ?").run(DAY, other.id);
  assert.equal((await seb.post(`/admin/photos/${other.id}`, c.form(other, { show_time: '1', author_id: String(c.seb) }))).statusCode, 404);
  assert.equal((await seb.json(`/admin/photos/${other.id}/champs`, { show_time: true })).statusCode, 404);
  assert.equal((await seb.post('/admin/photos/lot', { ids: String(other.id), [`title_${other.id}`]: other.title, [`show_time_${other.id}`]: '1' })).statusCode, 303);
  assert.equal(c.row(other.id).show_time, 0);
  // Relecteur (textes seuls) : la case n'est pas un texte.
  const rel = c.as('relecteur');
  assert.equal((await rel.json(`/admin/photos/${other.id}/champs`, { show_time: true })).statusCode, 403);
  assert.equal((await rel.post(`/admin/photos/${other.id}`, c.form(other, { show_time: '1' }))).statusCode, 403);
  await rel.post(`/admin/photos/${other.id}/textes`, { title: other.title, legend: other.legend || '', show_time: '1' });
  assert.equal(c.row(other.id).show_time, 0);
  // Sans jeton CSRF : refusé.
  const admin = c.as('admin');
  const noCsrf = await c.app.inject({ method: 'POST', url: `/admin/photos/${other.id}`, headers: { accept: 'text/html' }, payload: c.form(other, { show_time: '1' }) });
  assert.ok(noCsrf.statusCode >= 400);
  assert.equal(c.row(other.id).show_time, 0);
  assert.equal((await admin.post(`/admin/photos/${other.id}`, c.form(other, { show_time: '1' }))).statusCode, 303);
  assert.equal(c.row(other.id).show_time, 1);
});

test('admin : l’heure accompagne la date (photothèque, lot, À valider)', async t => {
  const c = await site(t);
  const admin = c.as('admin');
  const data = (await admin.get(`/admin/photos/${c.a.id}/donnees`)).json();
  assert.equal(data.time, '14 h 32');
  const lot = (await admin.get(`/admin/photos/lot?ids=${c.a.id}`)).body;
  assert.match(lot, /prise à 14 h 32/);
  // À valider : l'heure, et si elle est montrée sur le site.
  const seb = c.photographer();
  c.db.prepare("UPDATE photos SET status = 'draft', show_time = 1 WHERE id = ?").run(c.a.id);
  await seb.json('/admin/photos/actions', { action: 'propose', ids: [c.a.id] });
  const review = (await admin.get('/admin/a-valider')).body;
  assert.match(review, /2025-05-01 · 14 h 32 \(heure montrée sur le site\)/);
});

test('images servies : aucun EXIF par défaut ; en mode « prise de vue », la date et l’heure suivent la case', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heure-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'originals'));
  const file = '22222222-2222-2222-2222-222222222222.jpg';
  await sharp({ create: { width: 800, height: 500, channels: 3, background: '#777' } }).jpeg()
    .withExif({ IFD0: { Make: 'FUJIFILM' }, IFD2: { DateTimeOriginal: '2025:05:01 14:32:10', ExposureTime: '1/250' } })
    .toFile(path.join(dir, 'originals', file));
  const exifOf = async (key, w = 640) => { const m = await sharp(path.join(dir, 'variants', variantName(file, w, 'webp', key))).metadata(); return m.exif ? exifReader(m.exif) : null; };
  // Réglage par défaut (« aucune métadonnée ») : sharp ne recopie rien, ni date ni heure.
  await renderVariants(dir, file, {});
  assert.equal(await exifOf(''), null);
  // « Prise de vue » : l'empreinte suit la case (les images sont recalculées quand elle change).
  const P = { id: 1, author: 'Julien', title: 'Quai', taken_on: DAY, taken_time: '14:32', created_at: '2026-01-01 10:00:00', watermark: null };
  const ctx = { watermark: WATERMARK_DEFAULTS, exif: { mode: 'shooting' }, siteName: 'Nicephos', watermarkDir: '/tmp' };
  const hidden = specFor({ ...P, show_time: 0 }, ctx), shown = specFor({ ...P, show_time: 1 }, ctx);
  assert.equal(hidden.meta.time, 0);
  assert.equal(shown.meta.time, 1);
  assert.notEqual(hidden.key, shown.key);
  assert.equal(specFor({ ...P, show_time: 1, taken_on: '2025-05' }, ctx).meta.time, 0);     // date au mois : jamais
  // Les autres modes gardent leur empreinte (pas de recalcul des images au déploiement).
  assert.equal(specFor({ ...P, show_time: 1 }, { ...ctx, exif: { mode: 'rights' } }).key, specFor({ ...P, show_time: 0 }, { ...ctx, exif: { mode: 'rights' } }).key);
  await renderVariants(dir, file, { key: hidden.key, meta: hidden.meta });
  const without = await exifOf(hidden.key);
  assert.equal(without.Image.Make, 'FUJIFILM');
  assert.equal(without.Photo.ExposureTime, 0.004);
  assert.equal(without.Photo.DateTimeOriginal, undefined, 'ni date ni heure');
  await renderVariants(dir, file, { key: shown.key, meta: shown.meta });
  assert.equal((await exifOf(shown.key)).Photo.DateTimeOriginal.toISOString(), '2025-05-01T14:32:10.000Z');
});

test('dans l’application : cocher la case recalcule les images en mode « prise de vue »', async t => {
  const c = await site(t);
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('exif', '{\"mode\":\"shooting\"}') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  c.app.variants.schedule();
  await c.app.variants.idle();
  const before = c.row(c.a.id).variant_key;
  assert.match(before, /^[0-9a-f]{8}$/);
  await c.as('admin').post(`/admin/photos/${c.a.id}`, c.form(c.a, { show_time: '1' }));
  await c.app.variants.idle();
  assert.notEqual(c.row(c.a.id).variant_key, before);
});
