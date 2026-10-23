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
  const id = saisons.create({ title: 'Saison de test', intro: 'Une intention.' });
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
