import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDb, migrate } from '../server/db/index.js';
import { createSaisons } from '../server/saisons.js';
import { createSaisonsBilans, SaisonBilanError } from '../server/saisons-bilans.js';

const OPEN = Date.parse('2026-11-01T10:00:00Z'), CLOSE = OPEN + 7 * 86400000;
const fullReport = (title = 'Bilan de la saison') => ({ title, title_en: 'Season report', title_de: 'Rückblick der Saison', body: 'Notre regard rétrospectif.', body_en: 'Our retrospective view.', body_de: 'Unser Rückblick.' });
const fullCollection = (title = 'Ce qui demeure') => ({ title, title_en: 'What remains', title_de: 'Was bleibt', intro: 'Une nouvelle exposition permanente.', intro_en: 'A new permanent exhibition.', intro_de: 'Eine neue Dauerausstellung.', cover_id: 1 });
const refused = (status = 422, field = null) => e => e instanceof SaisonBilanError && e.status === status && (field == null || e.field === field);

function setup(t) {
  const db = openDb(':memory:'); migrate(db); t.after(() => db.close());
  db.prepare("INSERT INTO authors (id, slug, name) VALUES (1, 'auteur-test', 'Auteur de test')").run();
  db.prepare("INSERT INTO categories (id, slug, name) VALUES (1, 'serie-test', 'Série de test')").run();
  const add = db.prepare('INSERT INTO photos (id, slug, title, file, category_id, author_id, width, height, status) VALUES (?, ?, ?, ?, 1, 1, 1200, 800, ?)');
  for (let id = 1; id <= 5; id++) add.run(id, `photo-${id}`, `Photographie ${id}`, `neutre-${id}.jpg`, id === 5 ? 'draft' : 'published');
  let clock = OPEN - 1000;
  const now = () => clock, permitted = new Set([1, 2, 3, 4]);
  const readiness = { gate: ids => ({ ok: ids.filter(id => permitted.has(id)), verify: [], blocked: [] }) };
  const saisons = createSaisons({ db, now, readiness });
  const sid = saisons.create({ author_id: 1, cover_id: 1, title: 'Une saison', title_en: 'A season', title_de: 'Eine Saison', intro: 'Une intention.', intro_en: 'An intention.', intro_de: 'Eine Absicht.', opens_at: OPEN, closes_at: CLOSE });
  saisons.setPhotos(sid, [1, 2, 3]); saisons.schedule(sid);
  const bilans = createSaisonsBilans({ db, now, readiness });
  return { db, saisons, sid, bilans, now, at: value => { clock = value; }, permitted };
}
function report(c, photos = [1, 3]) {
  c.at(CLOSE);
  const id = c.bilans.createReport(c.sid, { ...fullReport(), photo_ids: photos });
  return c.bilans.publishReport(id, { version: c.bilans.getReport(id).version });
}
function collection(c) {
  const r = report(c), id = c.bilans.createCollection(r.id, { ...fullCollection(), photo_ids: [3, 1] });
  return c.bilans.publishCollection(id, { version: c.bilans.getCollection(id).version });
}

test('bilans : reprise des textes S0 publiés et de leur sélection, sans exposer les brouillons', t => {
  const db = openDb(':memory:'); t.after(() => db.close());
  db.exec('CREATE TABLE authors (id INTEGER PRIMARY KEY); CREATE TABLE photos (id INTEGER PRIMARY KEY)');
  const sql = name => fs.readFileSync(new URL(`../server/db/migrations/${name}`, import.meta.url), 'utf8');
  db.exec(sql('065_saisons.sql')); db.exec(sql('066_saisons_versions.sql'));
  db.prepare("INSERT INTO saisons (id, slug, title, report, created_at, updated_at, report_published_at) VALUES (1, 'publique', 'Saison publique', 'Bilan publié', ?, ?, ?), (2, 'privee', 'Saison privée', 'Bilan encore préparé', ?, ?, NULL)").run(OPEN, CLOSE, CLOSE, OPEN, CLOSE);
  db.exec('INSERT INTO photos (id) VALUES (1); INSERT INTO saison_photos (saison_id, photo_id, position) VALUES (1, 1, 0); INSERT INTO saison_selection (saison_id, photo_id, position) VALUES (1, 1, 0)');
  db.exec(sql('068_expositions_bilans.sql'));
  assert.deepEqual(db.prepare('SELECT saison_id, state, body, body_en FROM saison_bilans').all(), [{ saison_id: 1, state: 'publie', body: 'Bilan publié', body_en: '' }]);
  assert.deepEqual(db.prepare('SELECT photo_id FROM saison_bilan_photos').pluck().all(), [1]);
  assert.equal(db.prepare('SELECT report FROM saisons WHERE id = 2').pluck().get(), 'Bilan encore préparé');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('bilans : publication après clôture, trois langues et sélection vide autorisée', t => {
  const c = setup(t), b = c.bilans;
  const id = b.createReport(c.sid, { title: 'Un bilan en préparation', body: 'Texte encore privé.' });
  assert.deepEqual(b.publicForSaison(c.sid), []);
  assert.throws(() => b.publishReport(id, { version: 1 }), refused(409));
  c.at(CLOSE);
  assert.throws(() => b.publishReport(id, { version: 1 }), refused(422, 'title_en'));
  const saved = b.saveReport(id, { version: 1, input: fullReport(), photo_ids: [] });
  const published = b.publishReport(id, { version: saved.version });
  assert.equal(published.state, 'publie'); assert.deepEqual(published.photo_ids, []);
  assert.equal(c.saisons.get(c.sid).phase, 'bilan');
  assert.equal(b.publicForSaison(c.sid, { lang: 'de' })[0].body, 'Unser Rückblick.');
  assert.equal(b.publicForSaison(c.sid, { lang: 'en' })[0].title, 'Season report');
});

test('bilans : texte publié immuable et rectificatif distinct lié à la même saison', t => {
  const c = setup(t), b = c.bilans, initial = report(c), before = b.getReport(initial.id);
  assert.throws(() => b.saveReport(initial.id, { version: initial.version, input: { body: 'Écrasement interdit' }, photo_ids: [] }), refused(409));
  const correctionId = b.createReport(c.sid, { ...fullReport('Rectificatif'), rectifies_id: initial.id, photo_ids: [3] });
  const corrected = b.publishReport(correctionId, { version: b.getReport(correctionId).version });
  assert.equal(corrected.rectifies_id, initial.id); assert.deepEqual(b.getReport(initial.id), before);
  assert.deepEqual(b.publicForSaison(c.sid).map(r => r.rectifies_id), [null, initial.id]);
  const duplicate = b.createReport(c.sid, fullReport('Autre bilan initial'));
  assert.throws(() => b.publishReport(duplicate, { version: 1 }), refused(409));
  const other = c.saisons.create({ title: 'Une autre saison' });
  assert.throws(() => b.createReport(other, { ...fullReport(), rectifies_id: initial.id }), refused(422, 'rectifies_id'));
  assert.throws(() => b.createReport(c.sid, { ...fullReport(), rectifies_id: duplicate }), refused(422, 'rectifies_id'));
});

test('bilans : sélections hors exposition, privées ou bloquées refusées sans écriture partielle', t => {
  const c = setup(t), b = c.bilans, id = b.createReport(c.sid, fullReport()), before = b.getReport(id);
  for (const photo_ids of [[1, 4], [1, 5], [1, 999], [1, 1], [1, '2']]) {
    assert.throws(() => b.saveReport(id, { version: before.version, input: { body: 'Ne pas conserver' }, photo_ids }), refused());
    assert.deepEqual(b.getReport(id), before);
  }
  c.permitted.delete(2);
  assert.throws(() => b.saveReport(id, { version: before.version, photo_ids: [2] }), refused(422, 'photo_ids'));
  c.db.exec("CREATE TRIGGER panne_bilan BEFORE INSERT ON saison_bilan_photos WHEN NEW.photo_id = 2 BEGIN SELECT RAISE(ABORT, 'panne simulée'); END");
  c.permitted.add(2);
  assert.throws(() => b.saveReport(id, { version: before.version, input: { title: 'Ne pas garder' }, photo_ids: [1, 2] }), /panne simulée/);
  assert.deepEqual(b.getReport(id), before);
});

test('bilans : préconditions de version, identifiants et limites empêchent les écrasements', t => {
  const c = setup(t), b = c.bilans, id = b.createReport(c.sid, fullReport()), first = b.getReport(id);
  const saved = b.saveReport(id, { version: first.version, input: { body: 'Version récente.' } });
  assert.equal(saved.updated_at, first.updated_at); assert.ok(saved.version > first.version);
  assert.throws(() => b.saveReport(id, { version: first.version, input: { body: 'Ancien écran' } }), refused(409, 'version'));
  for (const version of [undefined, null, 0, '1', 1.5]) assert.throws(() => b.publishReport(id, { version }), refused(422, 'version'));
  for (const input of [{ title: '' }, { body: [] }, { body_de: 'x'.repeat(12001) }, { title_en: 'x'.repeat(121) }]) {
    assert.throws(() => b.saveReport(id, { version: saved.version, input }), refused());
    assert.deepEqual(b.getReport(id), saved);
  }
  assert.equal(b.getReport('1'), null); assert.equal(b.getReport(999), null);
});

test('collections : accrochage permanent propre, trois langues et filiation du bilan publié', t => {
  const c = setup(t), b = c.bilans, r = report(c), originals = c.db.prepare('SELECT id, category_id, title, status FROM photos ORDER BY id').all();
  const id = b.createCollection(r.id, { title: 'Un prolongement', photo_ids: [3, 1], cover_id: 1 });
  assert.deepEqual(b.publicCollections(), []);
  assert.throws(() => b.publishCollection(id, { version: 1 }), refused(422, 'title_en'));
  const saved = b.saveCollection(id, { version: 1, input: fullCollection(), cartels: [{ photo_id: 3, cartel: 'Autre place.', cartel_en: 'Another place.', cartel_de: 'Ein anderer Platz.' }] });
  const published = b.publishCollection(id, { version: saved.version });
  const result = b.publicCollectionBySlug(published.slug, { lang: 'de' });
  assert.equal(result.title, 'Was bleibt'); assert.deepEqual(result.photo_ids, [3, 1]); assert.equal(result.cartels[0].cartel, 'Ein anderer Platz.');
  assert.equal(result.origin.saison_id, c.sid); assert.equal(result.origin.bilan_id, r.id);
  assert.equal(b.publicForSaison(c.sid)[0].collections[0].slug, result.slug);
  assert.deepEqual(c.db.prepare('SELECT id, category_id, title, status FROM photos ORDER BY id').all(), originals);
  assert.throws(() => b.saveCollection(id, { version: published.version, input: { title: 'Écrasement' } }), refused(409));
});

test('collections : références, couverture et cartels invalides annulent toute la révision', t => {
  const c = setup(t), b = c.bilans, draft = b.createReport(c.sid, fullReport());
  assert.throws(() => b.createCollection(draft, fullCollection()), refused(409));
  const r = report(c), id = b.createCollection(r.id, { ...fullCollection(), photo_ids: [1, 3] }), before = b.getCollection(id);
  for (const revision of [{ photo_ids: [2] }, { input: { cover_id: 2 } }, { cartels: [{ photo_id: 2, cartel: 'Hors sélection' }] }, { cartels: [{ photo_id: 1, cartel: 'x'.repeat(501) }] }, { cartels: [{ photo_id: 1 }, { photo_id: 1 }] }]) {
    assert.throws(() => b.saveCollection(id, { version: before.version, input: { title: 'Ne pas garder' }, ...revision }), refused());
    assert.deepEqual(b.getCollection(id), before);
  }
  const missingLanguage = b.saveCollection(id, { version: before.version, cartels: [{ photo_id: 1, cartel: 'Un contexte.' }] });
  assert.throws(() => b.publishCollection(id, { version: missingLanguage.version }), refused(422, 'cartel_1_en'));
});

test('collections : le réordonnancement conserve les cartels et leurs identifiants de suivi', t => {
  const c = setup(t), b = c.bilans, r = report(c), id = b.createCollection(r.id, { ...fullCollection(), photo_ids: [1, 3] });
  const saved = b.saveCollection(id, { version: 1, cartels: [{ photo_id: 1, cartel: 'Un contexte.', cartel_en: 'A context.', cartel_de: 'Ein Kontext.' }] });
  const rows = () => c.db.prepare('SELECT id, photo_id, cartel FROM saison_collection_photos WHERE collection_id = ? ORDER BY photo_id').all(id), before = rows();
  const ordered = b.saveCollection(id, { version: saved.version, photo_ids: [3, 1] });
  assert.deepEqual(ordered.photo_ids, [3, 1]); assert.deepEqual(rows(), before);
  assert.equal(ordered.cartels[1].cartel_en, 'A context.');
});

test('archives : les photos du bilan disparaissent à échéance, la collection conserve sa propre visite', t => {
  const c = setup(t), b = c.bilans, permanent = collection(c);
  c.at(Date.parse('2027-11-08T09:59:59.999Z'));
  assert.deepEqual(b.publicForSaison(c.sid)[0].photo_ids, [1, 3]);
  c.at(Date.parse('2027-11-08T10:00:00Z'));
  assert.deepEqual(b.publicForSaison(c.sid)[0].photo_ids, []);
  assert.ok(b.publicForSaison(c.sid)[0].body);
  assert.equal(b.publicForSaison(c.sid)[0].collections.length, 1);
  assert.deepEqual(b.publicCollectionBySlug(permanent.slug).photo_ids, [3, 1]);
});

test('collections : retrait des photos et des origines respecté sans fuite de référence privée', t => {
  const c = setup(t), b = c.bilans, permanent = collection(c);
  c.permitted.delete(1);
  let visible = b.publicCollectionBySlug(permanent.slug);
  assert.equal(visible.cover_id, null); assert.deepEqual(visible.photo_ids, [3]);
  c.db.prepare("UPDATE saisons SET state = 'retire', title = 'Origine devenue privée' WHERE id = ?").run(c.sid);
  visible = b.publicCollectionBySlug(permanent.slug);
  assert.equal(visible.origin, null); assert.ok(!JSON.stringify(visible).includes('Origine devenue privée'));
  assert.deepEqual(b.publicForSaison(c.sid), []);
  const current = b.getCollection(permanent.id);
  b.withdrawCollection(permanent.id, { version: current.version });
  assert.equal(b.publicCollectionBySlug(permanent.slug), null); assert.deepEqual(b.publicCollections(), []);
});

test('Vigie : seules les lignes de textes réellement publiques sortent du fournisseur', t => {
  const c = setup(t), b = c.bilans;
  b.createReport(c.sid, { title: 'Brouillon privé', body: 'Contact privé : prive.example.test' });
  assert.deepEqual(b.textRows(), []);
  const permanent = collection(c), rows = b.textRows();
  assert.ok(rows.some(r => r.source === 'saison_bilans')); assert.ok(rows.some(r => r.source === 'saison_collections'));
  assert.ok(rows.every(r => r.key === `${r.source}#${r.id}`));
  assert.ok(!JSON.stringify(rows).includes('prive.example.test'));
  c.db.prepare("UPDATE saisons SET state = 'retire' WHERE id = ?").run(c.sid);
  assert.ok(!b.textRows().some(r => r.source === 'saison_bilans'));
  assert.ok(b.textRows().some(r => r.source === 'saison_collections' && r.id === permanent.id));
});
