import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate } from '../server/db/index.js';
import { createSaisons, SaisonError } from '../server/saisons.js';
import { createSaisonsAtelier } from '../server/saisons-atelier.js';

function setup(t) {
  const db = openDb(':memory:'); migrate(db); t.after(() => db.close());
  db.prepare("INSERT INTO authors (id, slug, name) VALUES (1, 'auteur', 'Auteur de test')").run();
  db.prepare("INSERT INTO categories (id, slug, name) VALUES (1, 'serie', 'Série de test')").run();
  const add = db.prepare("INSERT INTO photos (id, slug, title, category_id, author_id, file, width, height, status) VALUES (?, ?, ?, 1, 1, ?, 1200, 800, ?)");
  for (let id = 1; id <= 30; id++) add.run(id, `photo-${id}`, id === 1 ? '100% neutre' : `Photographie ${id}`, `neutre-${id}.jpg`, id === 30 ? 'draft' : 'published');
  const saisons = createSaisons({ db, now: () => Date.parse('2026-10-23T10:00:00Z') });
  const id = saisons.create({ author_id: 1, title: 'Saison de test', title_en: 'A test season', title_de: 'Eine Testsaison', intro: 'Une intention.', intro_en: 'An intention.', intro_de: 'Eine Absicht.', cover_id: 1 });
  saisons.setPhotos(id, [1, 2]);
  const atelier = createSaisonsAtelier({ db, saisons, zone: 'Europe/Paris' });
  const form = () => ({ ...atelier.fields(saisons.get(id)), version: String(saisons.get(id).version), 'photo_ids[]': ['1', '2'], position_1: '1', position_2: '2' });
  return { db, saisons, atelier, id, form };
}

test('atelier saisons : textes, heures et ordre persistés ensemble sans changer les séries', t => {
  const c = setup(t), body = { ...c.form(), title: 'Nouveau titre', title_en: 'New title', intro_de: 'Eine Absicht.', opens_at: '2026-11-01T12:30', closes_at: '2026-11-08T12:30', position_1: '2', position_2: '1', 'ajouter[]': '3' };
  const result = c.atelier.save(c.id, body);
  assert.equal(result.title, 'Nouveau titre');
  assert.equal(result.title_en, 'New title');
  assert.equal(result.intro_de, 'Eine Absicht.');
  assert.equal(new Date(result.opens_at).toISOString(), '2026-11-01T11:30:00.000Z');
  assert.deepEqual(result.photo_ids, [2, 1, 3]);
  assert.equal(c.atelier.fields(result).opens_at, body.opens_at);
  assert.deepEqual(c.db.prepare('SELECT DISTINCT category_id, status FROM photos WHERE id IN (1, 2, 3)').all(), [{ category_id: 1, status: 'published' }]);
  const remove = { ...c.atelier.fields(result), version: String(result.version), 'photo_ids[]': ['2', '1', '3'], position_2: '1', position_1: '2', position_3: '3', retirer_photo: '1' };
  assert.deepEqual(c.atelier.save(c.id, remove).photo_ids, [2, 3]);
});

test('atelier saisons : identifiants forgés, types, doublons et photos privées refusés sans écriture', t => {
  const c = setup(t), before = c.saisons.get(c.id);
  for (const patch of [
    { title: [] }, { opens_at: '2026-10-25T02:30' }, { 'photo_ids[]': ['1'] },
    { 'photo_ids[]': ['1', '1'] }, { 'ajouter[]': '30' }, { 'ajouter[]': '999' },
    { 'ajouter[]': ['3', '3'] }, { 'ajouter[]': {} }, { position_1: '2' },
    { position_1: '501' }, { retirer_photo: '29' }, { version: '1e3' },
  ]) {
    assert.throws(() => c.atelier.save(c.id, { ...c.form(), ...patch, intro: 'Ne doit pas être écrit.' }), SaisonError);
    assert.deepEqual(c.saisons.get(c.id), before);
  }
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = 3").run();
  assert.throws(() => c.atelier.save(c.id, { ...c.form(), 'ajouter[]': '3' }), SaisonError);
});

test('atelier saisons : ancien écran et saison programmée ne peuvent écraser les données', t => {
  const c = setup(t), stale = c.form();
  c.atelier.save(c.id, { ...stale, title: 'Dernière version' });
  const current = c.saisons.get(c.id);
  assert.throws(() => c.atelier.save(c.id, { ...stale, title: 'Ancienne version' }), err => err.status === 409);
  assert.deepEqual(c.saisons.get(c.id), current);
  c.saisons.update(c.id, { opens_at: Date.parse('2026-11-01T10:00:00Z'), closes_at: Date.parse('2026-11-08T10:00:00Z') });
  c.saisons.schedule(c.id);
  const scheduled = c.saisons.get(c.id);
  assert.throws(() => c.atelier.save(c.id, { ...c.form(), title: 'Écrasement interdit' }), err => err.status === 409);
  assert.deepEqual(c.saisons.get(c.id), scheduled);
});

test('atelier saisons : modifier un texte conserve les secondes des dates inchangées', t => {
  const c = setup(t), opens_at = Date.parse('2026-11-01T10:00:45.123Z'), closes_at = opens_at + 86400000;
  c.saisons.update(c.id, { opens_at, closes_at });
  const result = c.atelier.save(c.id, { ...c.form(), title: 'Titre corrigé' });
  assert.equal(result.opens_at, opens_at);
  assert.equal(result.closes_at, closes_at);
});

test('atelier saisons : choix publiés paginés et recherche littérale, sans chemins de fichiers', t => {
  const c = setup(t), first = c.atelier.candidates(), second = c.atelier.candidates({ page: 2 });
  assert.equal(first.total, 29); assert.equal(first.pages, 2);
  assert.equal(first.photos.length, 24); assert.equal(second.photos.length, 5);
  assert.equal(new Set([...first.photos, ...second.photos].map(p => p.id)).size, 29);
  assert.deepEqual(c.atelier.candidates({ search: '%' }).photos, [{ id: 1, title: '100% neutre' }]);
  assert.deepEqual(Object.keys(first.photos[0]), ['id', 'title']);
  for (const input of [{ search: [] }, { search: 'x'.repeat(121) }, { page: 0 }, { page: 1.2 }])
    assert.throws(() => c.atelier.candidates(input), SaisonError);
  assert.throws(() => createSaisonsAtelier({ db: c.db, saisons: c.saisons }), /Fuseau/);
});

test('atelier expositions : contenus, couverture et cartels enregistrés ensemble puis restitués', t => {
  const c = setup(t), body = { ...c.form(), subtitle: 'Une autre entrée', subtitle_en: 'Another opening', subtitle_de: 'Ein anderer Einstieg', prologue: 'Au début.', conclusion_de: 'Am Ende.', cover_id: '2', cartel_1: 'Une image ici.', cartel_1_en: 'An image here.', cartel_1_de: 'Ein Bild hier.', position_1: '2', position_2: '1' };
  const result = c.atelier.save(c.id, body);
  assert.equal(result.author_id, 1); assert.equal(result.cover_id, 2);
  assert.equal(result.subtitle_en, 'Another opening'); assert.equal(result.prologue, 'Au début.'); assert.equal(result.conclusion_de, 'Am Ende.');
  assert.deepEqual(result.photo_ids, [2, 1]);
  assert.deepEqual(result.cartels[1], { photo_id: 1, cartel: 'Une image ici.', cartel_en: 'An image here.', cartel_de: 'Ein Bild hier.' });
  const fields = c.atelier.fields(result);
  assert.equal(fields.cover_id, '2'); assert.equal(fields.cartel_1_de, 'Ein Bild hier.');
  const remove = { ...fields, version: String(result.version), 'photo_ids[]': ['2', '1'], position_2: '1', position_1: '2', retirer_photo: '2' };
  const withoutCover = c.atelier.save(c.id, remove);
  assert.equal(withoutCover.cover_id, null); assert.equal(withoutCover.cartels[0].cartel, 'Une image ici.');
});

test('atelier expositions : défaut de cartel ou de couverture annule la sauvegarde complète', t => {
  const c = setup(t), before = c.saisons.get(c.id);
  for (const patch of [{ cartel_1_en: [] }, { cartel_1: 'x'.repeat(501) }, { cover_id: '999' }, { cover_id: '3' }, { author_id: '999' }, { subtitle_de: {} }]) {
    assert.throws(() => c.atelier.save(c.id, { ...c.form(), title: 'Ne pas garder', position_1: '2', position_2: '1', ...patch }), SaisonError);
    assert.deepEqual(c.saisons.get(c.id), before);
  }
});

test('atelier expositions : les choix du photographe sont filtrés avant pagination', t => {
  const c = setup(t);
  c.db.prepare("INSERT INTO authors (id, slug, name) VALUES (2, 'autre', 'Autre photographe')").run();
  c.db.prepare('UPDATE photos SET author_id = 2 WHERE id >= 20').run();
  const own = c.atelier.candidates({ author_id: 1 }), other = c.atelier.candidates({ author_id: 2 });
  assert.equal(own.total, 19); assert.equal(own.pages, 1); assert.equal(own.photos.length, 19);
  assert.ok(own.photos.every(p => p.id < 20));
  assert.equal(other.total, 10); assert.equal(other.photos.length, 10);
  assert.ok(other.photos.every(p => p.id >= 20 && p.id < 30));
  for (const author_id of ['1', 0, -1, [], NaN]) assert.throws(() => c.atelier.candidates({ author_id }), SaisonError);
});
