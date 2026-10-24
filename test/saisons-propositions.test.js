import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate } from '../server/db/index.js';
import { createSaisons } from '../server/saisons.js';
import { createSaisonsPropositions, SaisonPropositionsError } from '../server/saisons-propositions.js';

const START = Date.parse('2026-11-01T10:00:00Z'), END = START + 86400000;
function setup(t) {
  const db = openDb(':memory:'); migrate(db); t.after(() => db.close());
  db.exec("INSERT INTO authors(id,slug,name) VALUES (1,'auteur-test','Auteur de test'); INSERT INTO categories(id,slug,name) VALUES (1,'neutre','Neutre')");
  const insert = db.prepare("INSERT INTO photos (id,slug,title,category_id,author_id,file,width,height,status) VALUES (?,?,?,1,1,?,1200,800,?)");
  for (let id = 1; id <= 5; id++) insert.run(id, `photo-${id}`, `Photo ${id}`, `neutre-${id}.jpg`, id === 5 ? 'draft' : 'published');
  let clock = START - 1000, denied = [];
  const readiness = { gate: ids => ({ ok: ids.filter(id => !denied.includes(id)) }) };
  const saisons = createSaisons({ db, now: () => clock, readiness });
  const id = saisons.create({ title: 'Une exposition', title_en: 'An exhibition', title_de: 'Eine Ausstellung', intro: 'Une intention.', intro_en: 'An intention.', intro_de: 'Eine Absicht.', author_id: 1, cover_id: 1, opens_at: START, closes_at: END });
  saisons.setPhotos(id, [1, 2, 3, 5]);
  const p = createSaisonsPropositions({ db, saisons, readiness, now: () => clock });
  return { db, saisons, p, id, at: v => { clock = v; }, deny: ids => { denied = ids; } };
}
const fails = (status = 422) => err => err instanceof SaisonPropositionsError && err.status === status;
const approve = c => { const version = c.p.get(c.id).version; c.p.review(c.id, { version }); c.p.validate(c.id, { version }); };

test('propositions : migration rejouable, état initial sans compte ni collecte personnelle', t => {
  const c = setup(t);
  assert.deepEqual(c.p.get(c.id), { version: 1, reviewed_version: null, validated_version: null, photo_ids: [] });
  assert.deepEqual(c.p.approvedIds(c.id), []); assert.deepEqual(c.p.approvedIds(9999), []);
  assert.deepEqual(migrate(c.db), []); assert.deepEqual(c.db.pragma('foreign_key_check'), []);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM accounts').pluck().get(), 0);
  assert.throws(() => c.p.get(9999), fails(404));
});

test('propositions : le photographe conserve l’ordre existant et ajoute en fin ; seule une permutation réordonne', t => {
  const c = setup(t), p = c.p, id = c.id;
  p.propose(id, { version: 1, photo_ids: [2, 1] });
  const second = p.propose(id, { version: 2, photo_ids: [3, 1, 2] });
  assert.deepEqual(second.photo_ids, [2, 1, 3]);
  assert.equal(second.version, 3);
  assert.deepEqual(p.propose(id, { version: 3, photo_ids: [3, 2, 1] }), second, 'un POST forgé ne réordonne pas');
  const next = p.reorder(id, { version: 3, photo_ids: [3, 2, 1] });
  assert.deepEqual(next.photo_ids, [3, 2, 1]); assert.equal(next.version, 4);
  const removed = p.propose(id, { version: 4, photo_ids: [1, 3] });
  assert.deepEqual(removed.photo_ids, [3, 1]);
});

test('propositions : double validation actuelle et suspension après changement pendant l’exposition', t => {
  const c = setup(t), p = c.p, id = c.id;
  p.propose(id, { version: 1, photo_ids: [1, 2] });
  assert.throws(() => p.validate(id, { version: 2 }), fails(409));
  p.review(id, { version: 2 }); assert.deepEqual(p.approvedIds(id), []);
  p.validate(id, { version: 2 }); assert.deepEqual(p.approvedIds(id), [1, 2]);
  c.saisons.setPhotos(id, [1, 2, 3]); c.saisons.schedule(id); c.at(START);
  p.reorder(id, { version: 2, photo_ids: [2, 1] });
  assert.deepEqual(p.get(id), { version: 3, reviewed_version: null, validated_version: null, photo_ids: [2, 1] });
  assert.deepEqual(p.approvedIds(id), []);
  for (const fn of ['propose', 'reorder', 'review', 'validate']) assert.throws(() => p[fn](id, { version: 2, photo_ids: [1] }), fails(409));
  approve(c); assert.deepEqual(p.approvedIds(id), [2, 1]);
  c.at(END); assert.throws(() => p.reorder(id, { version: 3, photo_ids: [1, 2] }), fails(409));
});

test('propositions : disponibilité relue à la validation et à chaque lecture publique', t => {
  const c = setup(t), p = c.p, id = c.id;
  p.propose(id, { version: 1, photo_ids: [1, 2, 3] }); p.review(id, { version: 2 });
  c.deny([2]); assert.throws(() => p.validate(id, { version: 2 }), fails());
  c.deny([]); p.validate(id, { version: 2 });
  c.db.exec("UPDATE photos SET status = 'draft' WHERE id = 1"); c.deny([2]);
  assert.deepEqual(p.approvedIds(id), [3]);
  c.deny([]); c.saisons.setPhotos(id, [1, 2]);
  assert.deepEqual(p.approvedIds(id), [2], 'une ancienne proposition n’autorise pas une photo retirée de l’accrochage');
});

test('propositions : formes, périmètre et permutations invalides sont atomiques', t => {
  const c = setup(t), p = c.p, id = c.id;
  p.propose(id, { version: 1, photo_ids: [1, 2] }); approve(c);
  const before = p.get(id);
  for (const photo_ids of [null, [1, 1], ['1'], [0], [4], [5], [999], Array(501).fill(1)]) {
    assert.throws(() => p.propose(id, { version: 2, photo_ids }), fails()); assert.deepEqual(p.get(id), before);
  }
  for (const photo_ids of [[1], [1, 3], [1, 2, 3]]) {
    assert.throws(() => p.reorder(id, { version: 2, photo_ids }), fails()); assert.deepEqual(p.get(id), before);
  }
  for (const version of [null, '2', 0, NaN, 1.5]) assert.throws(() => p.review(id, { version }), fails());
  c.db.exec("CREATE TRIGGER panne_proposition BEFORE INSERT ON saison_proposition_photos WHEN NEW.photo_id = 3 BEGIN SELECT RAISE(ABORT, 'panne simulée'); END");
  assert.throws(() => p.propose(id, { version: 2, photo_ids: [1, 3] }), /panne simulée/);
  assert.deepEqual(p.get(id), before);
});
