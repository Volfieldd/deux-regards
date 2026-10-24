import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archiveEndsAt, createSaisonsPubliques } from '../server/saisons-publiques.js';
import { variantName, widthsFor } from '../server/images.js';
import { createSaisons } from '../server/saisons.js';
import { setup } from './helpers.js';
import { visitor, setV2 } from './carnet-helpers.js';

const OPEN = Date.parse('2026-11-01T10:00:00Z'), CLOSE = Date.parse('2026-11-08T10:00:00Z');
function projection(t) {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nicephos-expositions-projection-'));
  fs.mkdirSync(path.join(storageDir, 'variants'));
  t.after(() => fs.rmSync(storageDir, { recursive: true, force: true }));
  const saison = { id: 1, slug: 'saison-test', author_id: 1, state: 'programme', opens_at: OPEN, closes_at: CLOSE, cover_id: 2,
    title: 'Titre FR', title_en: 'Title EN', title_de: 'Titel DE', intro: 'Intention privée avant ouverture', intro_en: 'An intention', intro_de: 'Eine Absicht',
    subtitle: 'Sous-titre', subtitle_en: 'Subtitle', subtitle_de: 'Untertitel', prologue: 'Prologue privé', prologue_en: 'Prologue EN', prologue_de: 'Prolog DE',
    conclusion: 'Conclusion privée', conclusion_en: 'Conclusion EN', conclusion_de: 'Schlusswort DE',
    photo_ids: [1, 2, 3], cartels: [{ photo_id: 1, cartel: 'Cartel 1 FR', cartel_en: 'Cartel 1 EN', cartel_de: 'Cartel 1 DE' }, { photo_id: 2, cartel: '', cartel_en: '', cartel_de: '' }],
    report: 'Bilan préparé privé', report_en: 'Draft report', report_de: 'Vorbereiteter Rückblick', report_published_at: null };
  const photos = new Map([1, 2, 3].map(id => [id, { id, slug: `photo-${id}`, title: `Photo ${id}`, author: 'Atelier fictif', file: `neutre-${id}.jpg`, width: 1200, height: 800, variant_key: '', status: id === 3 ? 'draft' : 'published', category_id: 8 }]));
  for (const p of photos.values()) fs.writeFileSync(path.join(storageDir, 'variants', variantName(p.file, widthsFor(p.width).at(-1), 'webp', p.variant_key)), 'variante factice pour la projection');
  const refused = new Set();
  let clock = OPEN - 1;
  const e = createSaisonsPubliques({ saisons: { list: () => [saison], get: id => id === saison.id ? saison : null }, storageDir, now: () => clock,
    repo: { photosByIds: ids => new Map(ids.filter(id => photos.has(id)).map(id => [id, photos.get(id)])), authors: () => [{ id: 1, name: 'Atelier fictif', slug: 'atelier' }] },
    readiness: { gate: ids => ({ ok: ids.filter(id => !refused.has(id)) }) } });
  return { e, saison, photos, refused, storageDir, at: value => { clock = value; } };
}

test('S2 projection : annonce bornée au titre, aux dates et à la couverture, sans cartel ni accrochage', t => {
  const c = projection(t), shown = c.e.bySlug('saison-test');
  assert.equal(shown.phase, 'annonce');
  assert.equal(shown.title, 'Titre FR');
  assert.equal(shown.cover.id, 2);
  assert.equal(shown.author, null);
  assert.deepEqual(shown.photos, []);
  assert.deepEqual(shown.photo_ids, []);
  for (const field of ['subtitle', 'intro', 'prologue', 'conclusion', 'report']) assert.equal(shown[field], '', field);
  assert.equal(c.e.photo('saison-test', 'photo-2'), null);
  const rows = c.e.textRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'saisons#1');
  assert.equal(rows[0].champs.title_en, 'Title EN');
  assert.equal(rows[0].champs.intro, '');
  assert.equal(rows[0].champs.report, '');
});

test('S2 projection : bornes de visite et douze mois calendaires UTC, puis page de bilan sans photos', t => {
  const c = projection(t), end = archiveEndsAt(CLOSE);
  assert.equal(archiveEndsAt(Date.parse('2024-02-29T16:20:30.123Z')), Date.parse('2025-02-28T16:20:30.123Z'));
  assert.equal(archiveEndsAt(null), null);
  c.at(OPEN);
  let shown = c.e.byId(1);
  assert.equal(shown.phase, 'ouverte'); assert.equal(shown.intro, c.saison.intro);
  assert.deepEqual(shown.photo_ids, [1, 2]);
  assert.equal(c.e.photo('saison-test', 'photo-1').next.id, 2);
  assert.equal(c.e.photo('saison-test', 'photo-1').prev, null);
  assert.equal(c.e.photo('saison-test', 'photo-2').next, null);
  c.at(CLOSE); assert.equal(c.e.byId(1).phase, 'archive');
  c.at(end - 1); assert.equal(c.e.byId(1).photos.length, 2);
  c.at(end); shown = c.e.byId(1);
  assert.equal(shown.phase, 'bilan'); assert.equal(shown.cover, null);
  assert.deepEqual(shown.photos, []); assert.deepEqual(shown.photo_ids, []);
  assert.equal(shown.intro, ''); assert.equal(shown.prologue, ''); assert.equal(shown.conclusion, '');
  assert.equal(c.e.photo('saison-test', 'photo-1'), null);
  assert.equal(c.e.textRows().length, 1);
  assert.equal(c.e.textRows()[0].champs.intro, '');
});

test('S2 projection : traductions nécessaires sans repli, états privés et retrait prioritaires', t => {
  const c = projection(t); c.at(OPEN);
  assert.equal(c.e.byId(1, { lang: 'de' }).title, 'Titel DE');
  assert.equal(c.e.byId(1, { lang: 'en' }).photos[0].cartel, 'Cartel 1 EN');
  c.saison.title_en = '';
  assert.equal(c.e.byId(1), null); assert.deepEqual(c.e.textRows(), []);
  c.saison.title_en = 'Title EN';
  for (const state of ['brouillon', 'retire']) {
    c.saison.state = state;
    assert.equal(c.e.byId(1), null); assert.deepEqual(c.e.list(), []); assert.deepEqual(c.e.textRows(), []);
  }
});

test('S2 projection : photo, couverture, droits et variantes refiltrés sans remplacement automatique', t => {
  const c = projection(t); c.at(OPEN);
  c.photos.get(2).status = 'draft';
  assert.equal(c.e.byId(1).cover, null); assert.deepEqual(c.e.byId(1).photo_ids, [1]);
  assert.equal(c.e.photo('saison-test', 'photo-2'), null);
  c.photos.get(2).status = 'published'; c.refused.add(1);
  assert.deepEqual(c.e.byId(1).photo_ids, [2]);
  assert.equal(c.e.textRows().some(r => r.photo_id === 1), false);
  const p = c.photos.get(2);
  fs.rmSync(path.join(c.storageDir, 'variants', variantName(p.file, widthsFor(p.width).at(-1), 'webp', p.variant_key)));
  assert.equal(c.e.byId(1).cover, null); assert.deepEqual(c.e.byId(1).photos, []);
});

test('S2 projection : bilan préparé toujours privé, publication après clôture, aucune ancienne sélection exposée', t => {
  const c = projection(t); c.saison.selection_ids = [3];
  c.saison.report_published_at = CLOSE;
  c.at(OPEN); assert.equal(c.e.byId(1).report, '');
  assert.equal(c.e.textRows()[0].champs.report, '');
  c.at(CLOSE); assert.equal(c.e.byId(1, { lang: 'en' }).report, 'Draft report');
  assert.equal(c.e.textRows()[0].champs.report, 'Bilan préparé privé');
  assert.equal(Object.hasOwn(c.e.byId(1), 'selection_ids'), false);
  c.saison.report_de = '';
  assert.equal(c.e.byId(1).report, ''); assert.equal(c.e.textRows()[0].champs.report, '');
});

function seedSaison(c, { title = 'Une exposition', opens = Date.now() - 3600000, closes = Date.now() + 86400000, state = 'publie' } = {}) {
  const s = createSaisons({ db: c.db, readiness: c.app.readiness, now: () => state === 'programme' ? opens - 1000 : Math.min(Math.max(opens, Date.now()), closes - 1) });
  const photos = c.db.prepare("SELECT id, slug FROM photos WHERE status = 'published' ORDER BY id LIMIT 3").all();
  const id = s.create({ title, title_en: `${title} EN`, title_de: `${title} DE`, intro: 'Intention de test', intro_en: 'Test intention', intro_de: 'Testabsicht',
    prologue: 'Prologue de test', prologue_en: 'Test prologue', prologue_de: 'Testprolog', conclusion: 'Conclusion de test', conclusion_en: 'Test conclusion', conclusion_de: 'Testschlusswort',
    opens_at: opens, closes_at: closes });
  s.setPhotos(id, photos.map(p => p.id)); s.update(id, { cover_id: photos[1].id });
  s.setCartels(id, [{ photo_id: photos[0].id, cartel: 'Cartel de saison', cartel_en: 'Season caption', cartel_de: 'Ausstellungstext' }]);
  if (state === 'programme') s.schedule(id); else if (state === 'publie') s.open(id);
  return { id, slug: s.get(id).slug, photos, s };
}

test('S2 HTTP : v1 sans nouvelles pages ; v2 visite, cartels et navigation dans le contexte en trois langues', async t => {
  const c = await setup(t, { seeded: true }), e = seedSaison(c), see = visitor(c);
  assert.equal((await see(`/exposition/${e.slug}`)).statusCode, 404);
  setV2(c);
  for (const prefix of ['', '/en', '/de']) {
    const one = await see(`${prefix}/expositions`);
    assert.equal(one.statusCode, 200); assert.equal((one.body.match(/<h1/g) || []).length, 1);
    const entry = await see(`${prefix}/exposition/${e.slug}`);
    assert.equal(entry.statusCode, 200); assert.equal(entry.headers['cache-control'], 'no-store');
    assert.match(entry.body, new RegExp(`${prefix}/exposition/${e.slug}/photo/${e.photos[0].slug}`));
    assert.doesNotMatch(entry.body, /\/admin\/media\/|originals\//);
    assert.match(entry.body, /id="conclusion"/);
    const first = await see(`${prefix}/exposition/${e.slug}/photo/${e.photos[0].slug}`);
    assert.equal(first.statusCode, 200);
    assert.match(first.body, new RegExp(`href="${prefix}/exposition/${e.slug}/photo/${e.photos[1].slug}" rel="next"`));
    const last = await see(`${prefix}/exposition/${e.slug}/photo/${e.photos[2].slug}`);
    assert.match(last.body, new RegExp(`${prefix}/exposition/${e.slug}#conclusion`));
  }
  assert.match((await see(`/exposition/${e.slug}`)).body, /Cartel de saison/);
  assert.match((await see(`/en/exposition/${e.slug}`)).body, /Season caption/);
  assert.match((await see(`/de/exposition/${e.slug}`)).body, /Ausstellungstext/);
});

test('S2 HTTP : couverture d’annonce seule, brouillon/retrait absents et photo dépubliée retirée du parcours', async t => {
  const c = await setup(t, { seeded: true }); setV2(c);
  const categoriesBefore = c.db.prepare('SELECT COUNT(*) FROM categories').pluck().get();
  const e = seedSaison(c, { title: 'Demain', opens: Date.now() + 86400000, closes: Date.now() + 2 * 86400000, state: 'programme' }), see = visitor(c);
  const announcement = await see(`/exposition/${e.slug}`);
  assert.equal(announcement.statusCode, 200);
  assert.doesNotMatch(announcement.body, /Intention de test|Prologue de test|Cartel de saison|Conclusion de test|id="accrochage"/);
  assert.equal((await see(`/exposition/${e.slug}/photo/${e.photos[1].slug}`)).statusCode, 404);
  const draft = seedSaison(c, { title: 'Brouillon invisible', state: 'brouillon' });
  assert.equal((await see(`/exposition/${draft.slug}`)).statusCode, 404);
  e.s.withdraw(e.id); assert.equal((await see(`/exposition/${e.slug}`)).statusCode, 404);
  const open = seedSaison(c, { title: 'Maintenant' });
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(open.photos[1].id);
  assert.equal((await see(`/exposition/${open.slug}/photo/${open.photos[1].slug}`)).statusCode, 404);
  const entry = await see(`/exposition/${open.slug}`);
  assert.equal(entry.statusCode, 200);
  assert.doesNotMatch(entry.body, new RegExp(`/exposition/${open.slug}/photo/${open.photos[1].slug}`));
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM categories').pluck().get(), categoriesBefore, 'les séries sont intactes');
});

test('S2 HTTP : après douze mois seule la page de bilan demeure, aucune photographie de l’exposition', async t => {
  const c = await setup(t, { seeded: true }); setV2(c);
  const e = seedSaison(c, { title: 'Archive arrivée à échéance', opens: Date.parse('2023-01-01T10:00:00Z'), closes: Date.parse('2023-02-01T10:00:00Z') });
  const see = visitor(c), r = await see(`/exposition/${e.slug}`);
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /id="bilan"/); assert.match(r.body, /La période de consultation/);
  assert.doesNotMatch(r.body, /id="accrochage"|id="conclusion"|Prologue de test|Cartel de saison|\/media\//);
  assert.equal((await see(`/exposition/${e.slug}/photo/${e.photos[0].slug}`)).statusCode, 404);
});

test('S2 HTTP : accueil choisi par l’admin, menu publié, aucune ouverture sur les vues filtrées ou privées', async t => {
  const c = await setup(t, { seeded: true }); setV2(c);
  const see = visitor(c), chosen = seedSaison(c, { title: 'Choix éditorial', opens: Date.now() + 86400000, closes: Date.now() + 2 * 86400000, state: 'programme' });
  const open = seedSaison(c, { title: 'Autre exposition ouverte' });
  const write = c.db.prepare("INSERT INTO settings (key, value) VALUES ('saison_accueil', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const fallback = await see('/');
  assert.equal(fallback.statusCode, 200); assert.match(fallback.body, /data-ouverture/);
  assert.doesNotMatch(fallback.body, /id="acc-exposition-t"/);
  assert.match(fallback.body, /href="\/expositions"[^>]*>Expositions<\/a>/);
  write.run(JSON.stringify(chosen.id));
  for (const [prefix, label, action] of [['', 'Expositions', 'Découvrir l’annonce'], ['/en', 'Exhibitions', 'View the announcement'], ['/de', 'Ausstellungen', 'Ankündigung ansehen']]) {
    const r = await see(`${prefix}/`);
    assert.equal(r.statusCode, 200); assert.equal(r.headers['cache-control'], 'no-store');
    assert.match(r.body, /id="acc-exposition-t"/); assert.match(r.body, /Choix éditorial/);
    assert.match(r.body, new RegExp(`href="${prefix}/exposition/${chosen.slug}"[^>]*>${action}</a>`));
    assert.match(r.body, new RegExp(`href="${prefix}/expositions"[^>]*>${label}</a>`));
    assert.match(r.body, /UTC<\/time>/); assert.match(r.body, /css\/expositions.css/);
    assert.doesNotMatch(r.body, /data-ouverture|Intention de test|Prologue de test|Cartel de saison/);
    assert.equal((r.body.match(/<h1/g) || []).length, 1);
  }
  const author = c.db.prepare('SELECT slug FROM authors ORDER BY id LIMIT 1').pluck().get();
  const serie = c.db.prepare('SELECT slug FROM categories ORDER BY id LIMIT 1').pluck().get();
  for (const url of [`/?regard=${author}`, `/auteur/${author}`, `/serie/${serie}`, '/galerie']) {
    const r = await see(url); assert.equal(r.statusCode, 200); assert.doesNotMatch(r.body, /id="acc-exposition-t"/);
  }
  c.app.publicVersion.save('v3');
  const v3 = await see('/');
  assert.equal(v3.statusCode, 200); assert.match(v3.body, /id="acc-exposition-t"/); assert.doesNotMatch(v3.body, /sh--sur-photo/);
  write.run(JSON.stringify(open.id));
  assert.match((await see('/')).body, /href="\/exposition\/autre-exposition-ouverte"[^>]*>Visiter l’exposition<\/a>/);
  const archive = seedSaison(c, { title: 'Archive encore visible', opens: Date.now() - 3 * 86400000, closes: Date.now() - 86400000 });
  write.run(JSON.stringify(archive.id));
  assert.match((await see('/')).body, /Consulter l’exposition archivée<\/a>/);
  const expired = seedSaison(c, { title: 'Ancienne exposition', opens: Date.parse('2023-01-01T10:00:00Z'), closes: Date.parse('2023-02-01T10:00:00Z') });
  write.run(JSON.stringify(expired.id));
  assert.doesNotMatch((await see('/')).body, /id="acc-exposition-t"/, 'l’archive échue rend la place à l’ouverture habituelle');
  write.run(JSON.stringify(chosen.id));
  assert.equal(c.app.publicVersion.saveDesign({ default: 'v2', sections: { expositions: 'v1' } }), true);
  const unpublished = await see('/');
  assert.equal(unpublished.statusCode, 200); assert.doesNotMatch(unpublished.body, /id="acc-exposition-t"|href="\/expositions"/);
  c.app.publicVersion.saveDesign(null); c.app.publicVersion.save('v2');

  const space = c.app.spaces.createSpace({ title: 'Galerie privée de test', closes: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10) }, { authorId: null, by: 'test' });
  c.app.spaces.addPhotos(space, chosen.photos.map(p => p.id)); c.app.spaces.setState(space, 'ouverte', null);
  const invite = await c.app.spaces.createInvite(space, { label: 'Invité de test', lang: 'fr', expires: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }, { by: 'test', request: null });
  const enter = await c.app.inject({ method: 'POST', url: `/g/${invite.token}`, headers: { origin: 'http://localhost:3000' }, payload: { password: invite.password } });
  assert.equal(enter.statusCode, 303);
  const cookies = Object.fromEntries(enter.cookies.filter(cookie => cookie.value).map(cookie => [cookie.name, cookie.value]));
  const privatePage = await c.app.inject({ url: enter.headers.location, cookies });
  assert.equal(privatePage.statusCode, 200); assert.doesNotMatch(privatePage.body, /id="acc-exposition-t"|href="\/expositions"|Choix éditorial/);

  chosen.s.withdraw(chosen.id);
  assert.doesNotMatch((await see('/')).body, /id="acc-exposition-t"/, 'un retrait ne choisit pas une autre exposition');
  write.run(JSON.stringify(999999)); assert.doesNotMatch((await see('/')).body, /id="acc-exposition-t"/);
  write.run(JSON.stringify('1')); assert.doesNotMatch((await see('/')).body, /id="acc-exposition-t"/);
  c.app.publicVersion.save('v1');
  assert.doesNotMatch((await see('/')).body, /id="acc-exposition-t"|href="\/expositions"/);
});
