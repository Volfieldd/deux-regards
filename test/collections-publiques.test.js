import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup } from './helpers.js';
import { visitor, setV2 } from './carnet-helpers.js';
import { createSaisons } from '../server/saisons.js';
import { variantName, widthsFor } from '../server/images.js';

const reportTexts = { title: 'Bilan initial <em>intact</em>', title_en: 'Initial retrospective EN', title_de: 'Erster Rückblick DE', body: 'Le récit initial reste intact.', body_en: 'The initial account remains intact.', body_de: 'Der erste Bericht bleibt unverändert.' };
const correctionTexts = { title: 'Rectificatif complémentaire', title_en: 'Additional correction EN', title_de: 'Zusätzliche Berichtigung DE', body: 'Un second regard <b>distinct</b>.', body_en: 'A second distinct perspective.', body_de: 'Eine zweite eigene Sichtweise.' };
const collectionTexts = { title: 'Ce qui demeure', title_en: 'What remains EN', title_de: 'Was bleibt DE', intro: 'Une nouvelle exposition permanente.', intro_en: 'A new permanent exhibition.', intro_de: 'Eine neue Dauerausstellung.',
  prologue: 'Une autre entrée.', prologue_en: 'Another entrance.', prologue_de: 'Ein anderer Einstieg.', conclusion: 'Un regard qui continue.', conclusion_en: 'A continuing perspective.', conclusion_de: 'Eine fortdauernde Sichtweise.' };
function exhibition(c, { expired = false, title = 'Origine de la collection' } = {}) {
  const closes = expired ? Date.parse('2023-02-01T12:00:00Z') : Date.now() - 86400000, opens = closes - 7 * 86400000;
  const s = createSaisons({ db: c.db, readiness: c.app.readiness, now: () => opens + 60000 });
  const photos = c.db.prepare("SELECT id, slug FROM photos WHERE status = 'published' ORDER BY id LIMIT 3").all(), photo_ids = photos.map(p => p.id);
  const id = s.create({ title, title_en: `${title} EN`, title_de: `${title} DE`, intro: 'L’intention d’origine.', intro_en: 'The original intention.', intro_de: 'Die ursprüngliche Absicht.', opens_at: opens, closes_at: closes });
  s.setPhotos(id, photo_ids); s.update(id, { cover_id: photo_ids[0] }); s.open(id);
  const b = c.app.saisonsBilans, rid = b.createReport(id, { ...reportTexts, photo_ids }); b.publishReport(rid, { version: 1 });
  const rectificatif = b.createReport(id, { ...correctionTexts, rectifies_id: rid, photo_ids: [] }); b.publishReport(rectificatif, { version: 1 });
  const ordered = [photo_ids[2], photo_ids[0]], cid = b.createCollection(rid, { ...collectionTexts, photo_ids: ordered, cover_id: ordered[1] });
  const saved = b.saveCollection(cid, { version: 1, cartels: [{ photo_id: ordered[0], cartel: 'Cartel permanent <b>propre</b>.', cartel_en: 'Own permanent caption EN.', cartel_de: 'Eigene dauerhafte Beschriftung DE.' }] });
  b.publishCollection(cid, { version: saved.version });
  return { id, slug: s.get(id).slug, rid, rectificatif, cid, collection: b.getCollection(cid), photos, ordered };
}

test('S3 HTTP : seuls les accrochages de la page demandée sont projetés, jamais ceux des menus', async t => {
  const c = await setup(t, { seeded: true, env: { VIGIE_URL: '' } }); setV2(c);
  const e = exhibition(c), b = c.app.saisonsBilans, see = visitor(c);
  b.withdrawCollection(e.cid, { version: b.getCollection(e.cid).version });
  const photo_ids = c.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 12").pluck().all();
  assert.equal(photo_ids.length, 12);
  const at = Date.now(), insert = c.db.prepare(`INSERT INTO saison_collections (bilan_id, slug, state, title, title_en, title_de, intro, intro_en, intro_de, cover_id, created_at, updated_at, published_at)
    VALUES (?, ?, 'publie', ?, ?, ?, 'Intention', 'Intention EN', 'Absicht', ?, ?, ?, ?)`);
  const photo = c.db.prepare('INSERT INTO saison_collection_photos (collection_id, photo_id, position) VALUES (?, ?, ?)');
  const add = c.db.transaction((from, to) => {
    for (let n = from; n <= to; n++) {
      const name = `Collection de stock ${n}`, id = Number(insert.run(e.rid, `stock-${n}`, name, `${name} EN`, `${name} DE`, photo_ids[0], at, at, at).lastInsertRowid);
      photo_ids.forEach((pid, position) => photo.run(id, pid, position));
    }
  });
  let loaded = 0;
  for (const name of ['publicCollections', 'publicCollectionBySlug']) {
    const read = b[name];
    b[name] = (...args) => {
      const result = read(...args);
      loaded += (Array.isArray(result) ? result : [result]).reduce((sum, row) => sum + (row?.photo_ids.length || 0), 0);
      return result;
    };
  }
  const origin = c.app.expositions.byId;
  c.app.expositions.byId = (...args) => { const row = origin(...args); loaded += row?.photo_ids.length || 0; return row; };
  const measures = [], check = async (url, status, references) => {
    loaded = 0; const response = await see(url);
    assert.equal(response.statusCode, status, url); assert.equal(loaded, references, `${url} : références photo chargées`);
    return response;
  };
  for (const stock of [10, 1000]) {
    add(stock === 10 ? 1 : 11, stock);
    const first = await check('/collections', 200, Math.min(stock, 12) * 12);
    assert.equal(b.publicCollectionsCount(), stock); assert.equal(b.publicCollectionsExist(), true);
    assert.match(first.body, new RegExp(`href="/collection/stock-${stock}"`));
    measures.push({ stock, index: loaded });
    await check('/collection/inconnue', 404, 0); await check('/a-propos', 200, 0); await check('/collections?page=999999', 404, 0);
    await check(`/collection/stock-${stock}`, 200, 12);
  }
  const second = await check('/de/collections?page=2', 200, 144);
  assert.match(second.body, /href="\/de\/collection\/stock-988"/); assert.doesNotMatch(second.body, /href="\/de\/collection\/stock-1000"/);
  const last = await check('/en/collections?page=84', 200, 48); assert.match(last.body, /href="\/en\/collection\/stock-1"/);
  c.db.prepare("UPDATE saison_collections SET state = 'retire'").run();
  assert.equal(b.publicCollectionsCount(), 0); assert.equal(b.publicCollectionsExist(), false);
  assert.match((await check('/collections', 200, 0)).body, /Aucune collection permanente/);
  c.app.publicVersion.save('v1'); await check('/collections', 404, 0); await check('/collection/stock-1', 404, 0);
  t.diagnostic(JSON.stringify({ mesures: measures, menus: 0, adresseInconnue: 0, pageHorsStock: 0 }));
});

test('S3 HTTP : de l’accueil à l’exposition, ses bilans et une collection visitable dans les trois langues', async t => {
  const c = await setup(t, { seeded: true }); setV2(c);
  const e = exhibition(c), see = visitor(c), b = c.app.saisonsBilans, initial = b.getReport(e.rid);
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('saison_accueil', ?)").run(JSON.stringify(e.id));
  for (const [prefix, heading, caption] of [['', 'Ce qui demeure', 'Cartel permanent &lt;b&gt;propre&lt;/b&gt;.'], ['/en', 'What remains EN', 'Own permanent caption EN.'], ['/de', 'Was bleibt DE', 'Eigene dauerhafte Beschriftung DE.']]) {
    const home = await see(`${prefix}/`); assert.equal(home.statusCode, 200); assert.match(home.body, new RegExp(`href="${prefix}/collections"`));
    const list = await see(`${prefix}/expositions`); assert.equal(list.statusCode, 200); assert.match(list.body, new RegExp(`href="${prefix}/collections"`));
    const expo = await see(`${prefix}/exposition/${e.slug}`); assert.equal(expo.statusCode, 200, expo.body);
    assert.match(expo.body, new RegExp(`id="bilan-${e.rid}"`)); assert.match(expo.body, new RegExp(`id="bilan-${e.rectificatif}"`));
    assert.match(expo.body, new RegExp(`href="#bilan-${e.rid}"`)); assert.match(expo.body, new RegExp(`href="#bilan-${e.rectificatif}"`));
    assert.match(expo.body, new RegExp(`href="${prefix}/collection/${e.collection.slug}"`));
    const permanent = await see(`${prefix}/collection/${e.collection.slug}`); assert.equal(permanent.statusCode, 200, permanent.body);
    assert.equal(permanent.headers['cache-control'], 'no-store'); assert.match(permanent.body, new RegExp(`<h1[^>]*>${heading}</h1>`)); assert.match(permanent.body, new RegExp(caption));
    assert.match(permanent.body, new RegExp(`href="${prefix}/exposition/${e.slug}#bilan-${e.rid}"`));
    assert.doesNotMatch(permanent.body, /\/admin\/media\/|originals\/|style="/);
    const first = e.photos.find(p => p.id === e.ordered[0]), last = e.photos.find(p => p.id === e.ordered[1]);
    const photo = await see(`${prefix}/collection/${e.collection.slug}/photo/${first.slug}`); assert.equal(photo.statusCode, 200);
    assert.match(photo.body, new RegExp(`href="${prefix}/collection/${e.collection.slug}/photo/${last.slug}" rel="next"`));
    assert.match(photo.body, new RegExp(caption)); assert.doesNotMatch(photo.body, new RegExp(`/exposition/${e.slug}/photo/`));
    const end = await see(`${prefix}/collection/${e.collection.slug}/photo/${last.slug}`); assert.match(end.body, new RegExp(`${prefix}/collection/${e.collection.slug}#conclusion`));
    assert.equal((await see(`${prefix}/collections`)).statusCode, 200);
  }
  assert.deepEqual(b.getReport(e.rid), initial, 'la consultation et le rectificatif ne changent pas le premier bilan');
  assert.match((await see(`/exposition/${e.slug}`)).body, /Bilan initial &lt;em&gt;intact&lt;\/em&gt;/);
});

test('S3 HTTP : après douze mois, bilans et filiation restent lisibles sans réexposer les photos de l’exposition', async t => {
  const c = await setup(t, { seeded: true }); setV2(c);
  const e = exhibition(c, { expired: true }), see = visitor(c);
  const archive = await see(`/exposition/${e.slug}`); assert.equal(archive.statusCode, 200);
  assert.match(archive.body, /Le récit initial reste intact/); assert.match(archive.body, /Un second regard &lt;b&gt;distinct&lt;\/b&gt;/);
  assert.match(archive.body, new RegExp(`href="/collection/${e.collection.slug}"`));
  assert.doesNotMatch(archive.body, /id="accrochage"|\/media\/|L’intention d’origine/);
  assert.deepEqual(c.app.saisonsBilans.publicForSaison(e.id)[0].photo_ids, []);
  assert.equal((await see(`/exposition/${e.slug}/photo/${e.photos[0].slug}`)).statusCode, 404);
  const collection = await see(`/collection/${e.collection.slug}`); assert.equal(collection.statusCode, 200); assert.match(collection.body, /\/media\//);
  assert.match(collection.body, /Une nouvelle exposition permanente/);
});

test('S3 HTTP et fournisseur : dépublication, accords, variantes et origines retirées filtrent chaque requête', async t => {
  const c = await setup(t, { seeded: true }); setV2(c);
  const e = exhibition(c), see = visitor(c), b = c.app.saisonsBilans, first = e.photos.find(p => p.id === e.ordered[0]);
  const publicRows = () => b.textRows().filter(r => r.source === 'saison_collection_photos');
  assert.ok(publicRows().some(r => r.champs.cartel.includes('Cartel permanent')));
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(first.id);
  assert.equal((await see(`/collection/${e.collection.slug}/photo/${first.slug}`)).statusCode, 404);
  assert.doesNotMatch((await see(`/collection/${e.collection.slug}`)).body, /Cartel permanent|Own permanent caption/);
  assert.ok(!publicRows().some(r => r.champs.cartel.includes('Cartel permanent')));
  c.db.prepare("UPDATE photos SET status = 'published', faces_override = 1 WHERE id = ?").run(first.id);
  assert.equal((await see(`/collection/${e.collection.slug}/photo/${first.slug}`)).statusCode, 404);
  c.db.prepare('UPDATE photos SET faces_override = 0 WHERE id = ?').run(first.id);
  const p = c.db.prepare('SELECT * FROM photos WHERE id = ?').get(first.id), file = path.join(c.dir, 'variants', variantName(p.file, widthsFor(p.width).at(-1), 'webp', p.variant_key)), content = fs.readFileSync(file);
  fs.unlinkSync(file);
  assert.equal((await see(`/collection/${e.collection.slug}/photo/${first.slug}`)).statusCode, 404);
  assert.ok(!publicRows().some(r => r.champs.cartel.includes('Cartel permanent')));
  fs.writeFileSync(file, content);
  assert.equal((await see(`/collection/${e.collection.slug}/photo/${first.slug}`)).statusCode, 200);
  c.app.saisons.withdraw(e.id);
  const surviving = await see(`/collection/${e.collection.slug}`); assert.equal(surviving.statusCode, 200);
  assert.doesNotMatch(surviving.body, /Origine de la collection|Bilan initial &lt;em&gt;intact|id="origine-t"/);
  assert.match(surviving.body, /Cartel permanent/);
  const home = await see('/'); assert.match(home.body, /href="\/expositions"/); assert.match(home.body, /href="\/collections"/);
  assert.equal((await see(`/exposition/${e.slug}`)).statusCode, 404);
  b.withdrawCollection(e.cid, { version: b.getCollection(e.cid).version });
  assert.equal((await see(`/collection/${e.collection.slug}`)).statusCode, 404); assert.equal((await see(`/collection/${e.collection.slug}/photo/${first.slug}`)).statusCode, 404);
});

test('S3 HTTP : brouillons, bilan retiré et chemins étrangers ne deviennent jamais une collection publique', async t => {
  const c = await setup(t, { seeded: true }), e = exhibition(c), see = visitor(c), b = c.app.saisonsBilans;
  assert.equal((await see('/collections')).statusCode, 404);
  setV2(c);
  const draft = b.createCollection(e.rid, { title: 'Collection encore privée' });
  assert.equal((await see(`/collection/${b.getCollection(draft).slug}`)).statusCode, 404);
  const outside = e.photos.find(p => !e.ordered.includes(p.id));
  assert.equal((await see(`/collection/${e.collection.slug}/photo/${outside.slug}`)).statusCode, 404);
  for (const query of ['0', '-1', '2', 'abc', '1&page=1']) assert.equal((await see(`/collections?page=${query}`)).statusCode, 404);
  b.withdrawReport(e.rid, { version: b.getReport(e.rid).version });
  const expo = await see(`/exposition/${e.slug}`);
  assert.doesNotMatch(expo.body, /Le récit initial reste intact|Bilan initial &lt;em&gt;intact/); assert.match(expo.body, /Bilan rectificatif/);
  assert.doesNotMatch(expo.body, new RegExp(`href="#bilan-${e.rid}"`));
  assert.equal((await see(`/collection/${e.collection.slug}`)).statusCode, 200);
  assert.equal(c.app.publicVersion.saveDesign({ default: 'v2', sections: { expositions: 'v1' } }), true);
  assert.equal((await see('/collections')).statusCode, 404); assert.equal((await see(`/collection/${e.collection.slug}`)).statusCode, 404);
});
