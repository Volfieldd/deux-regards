import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDb, migrate } from '../server/db/index.js';
import { createSaisons, SaisonError, LIMITS } from '../server/saisons.js';

// Le jalon S0 n'est pas branché au serveur : une base en mémoire et des fiches neutres suffisent aux effets métier.
// L'horloge est contrôlée sans attente ; aucun original, compte, dossier de stockage ni service externe n'est utilisé.
const START = Date.parse('2026-11-01T10:00:00Z');
const END = START + 7 * 86400000;
function setup(t) {
  const db = openDb(':memory:');
  migrate(db);
  t.after(() => db.close());
  db.prepare("INSERT INTO authors (id, slug, name) VALUES (1, 'auteur-test', 'Auteur de test')").run();
  db.prepare("INSERT INTO categories (id, slug, name) VALUES (1, 'serie-a', 'Série A'), (2, 'serie-b', 'Série B')").run();
  const insert = db.prepare('INSERT INTO photos (id, slug, title, category_id, author_id, file, width, height, status, position) VALUES (?, ?, ?, ?, 1, ?, 1200, 800, ?, ?)');
  for (let id = 1; id <= 4; id++) insert.run(id, `photo-${id}`, `Photographie ${id}`, id % 2 + 1, `neutre-${id}.jpg`, id === 4 ? 'draft' : 'published', id * 10);
  let clock = START - 1000;
  const now = () => clock;
  return { db, saisons: createSaisons({ db, now }), now, at: t => { clock = t; } };
}
function draft(ctx, extra = {}, photos = [1, 2, 3]) {
  const id = ctx.saisons.create({ title: 'Une couleur qui insiste', intro: 'Une intention photographique.', opens_at: START, closes_at: END, ...extra });
  ctx.saisons.setPhotos(id, photos);
  return id;
}
const domain = (status = 422, field = null) => error => error instanceof SaisonError && error.status === status && (field == null || error.field === field);

test('Saisons : migration additive et rejouable, sans changement des tables de photos', t => {
  const c = setup(t);
  assert.equal(c.db.prepare("SELECT name FROM migrations WHERE name = '065_saisons.sql'").pluck().get(), '065_saisons.sql');
  assert.deepEqual(migrate(c.db), []);
  assert.deepEqual(c.db.pragma('foreign_key_check'), []);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM photos').pluck().get(), 4);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM accounts').pluck().get(), 0);
});

test('Brouillon : textes en trois langues bornés, ordre privé et aucune ouverture implicite', t => {
  const c = setup(t), s = c.saisons;
  const id = draft(c, { title_en: 'A lingering colour', title_de: 'Eine bleibende Farbe', report: 'Bilan préparé, encore privé.' });
  s.update(id, { intro_en: 'An intention.', intro_de: 'Eine Absicht.' });
  assert.equal(s.get(id).title_en, 'A lingering colour');
  assert.equal(s.get(id).intro_de, 'Eine Absicht.');
  assert.deepEqual(s.get(id).photo_ids, [1, 2, 3]);
  c.at(END + 1);
  assert.equal(s.get(id).phase, 'brouillon');
  assert.deepEqual(s.publicList(), []);
  assert.equal(s.publicBySlug(s.get(id).slug), null);
  const before = s.get(id);
  for (const input of [{ title: ' ' }, { title: 'x'.repeat(LIMITS.title + 1) }, { intro_en: 'x'.repeat(LIMITS.intro + 1) }, { report_de: 'x'.repeat(LIMITS.report + 1) }, { title: ['répété'] }, { title_en: {} }]) {
    assert.throws(() => s.update(id, input), domain());
    assert.deepEqual(s.get(id), before);
  }
  assert.throws(() => s.create({ intro: 'Sans titre' }), domain(422, 'title'));
  assert.equal(s.list().length, 1);
});

test('Dates : instants entiers finis, fermeture postérieure et validation sans écriture partielle', t => {
  const c = setup(t), s = c.saisons, id = draft(c), before = s.get(id);
  for (const value of [NaN, Infinity, -1, 12.5, String(START), {}, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => s.update(id, { title: 'Ne doit pas changer', opens_at: value }), domain(422, 'opens_at'));
    assert.deepEqual(s.get(id), before);
  }
  for (const closes_at of [START, START - 1]) assert.throws(() => s.update(id, { closes_at }), domain(422, 'closes_at'));
  s.update(id, { closes_at: null });
  assert.throws(() => s.schedule(id), domain(422, 'closes_at'));
  assert.equal(s.get(id).state, 'brouillon');
});

test('Accrochages : ordre indépendant des séries, réemploi entre saisons et refus atomiques', t => {
  const c = setup(t), s = c.saisons;
  const original = c.db.prepare('SELECT id, category_id, position, status FROM photos ORDER BY id').all();
  const a = draft(c, {}, [3, 1]), b = draft(c, {}, [1, 2]);
  s.setPhotos(a, [4, 1, 3]);
  assert.deepEqual(s.get(a).photo_ids, [4, 1, 3], 'un brouillon peut préparer une photo non publiée');
  assert.deepEqual(s.get(b).photo_ids, [1, 2]);
  const before = s.get(a);
  for (const list of [[1, 1], [2, 999], [1, '2'], [1.5], [0], Array(501).fill(1), null]) {
    assert.throws(() => s.setPhotos(a, list), domain(422, 'photo_ids'));
    assert.deepEqual(s.get(a), before);
  }
  assert.deepEqual(c.db.prepare('SELECT id, category_id, position, status FROM photos ORDER BY id').all(), original);
});

test('Programmer exige dates, intention, accrochage et publication préalable de chaque photo', t => {
  const c = setup(t), s = c.saisons;
  for (const [extra, photos] of [[{ opens_at: null }, [1]], [{ intro: '' }, [1]], [{}, []], [{}, [1, 4]]]) {
    const id = draft(c, extra, photos);
    assert.throws(() => s.schedule(id), domain());
    assert.equal(s.get(id).state, 'brouillon');
  }
  const id = draft(c);
  c.at(START);
  assert.throws(() => s.schedule(id), domain(422, 'opens_at'));
  assert.equal(c.db.prepare('SELECT status FROM photos WHERE id = 4').pluck().get(), 'draft');
});

test('Période publique : ouverture incluse, fermeture exclue ; le temps ne publie pas le bilan', t => {
  const c = setup(t), s = c.saisons, id = draft(c, { report: 'Ne doit pas paraître automatiquement.' });
  s.schedule(id);
  const slug = s.get(id).slug;
  c.at(START - 1);
  assert.equal(s.publicBySlug(slug), null);
  assert.deepEqual(s.publicList(), []);
  c.at(START);
  assert.equal(s.publicBySlug(slug).phase, 'ouverte');
  assert.equal(s.publicBySlug(slug).report, '');
  c.at(END - 1);
  assert.equal(s.publicBySlug(slug).phase, 'ouverte');
  c.at(END);
  assert.equal(s.publicBySlug(slug).phase, 'close');
  assert.equal(s.publicBySlug(slug).report, '');
  assert.deepEqual(s.publicBySlug(slug).selection_ids, []);
  const restarted = createSaisons({ db: c.db, now: c.now });
  assert.equal(restarted.publicList()[0].phase, 'close', 'une reprise tardive ne demande aucun traitement périodique');
  assert.equal(restarted.get(id).state, 'programme', 'le temps ne réécrit pas la décision éditoriale');
});

test('Ouverture immédiate : décision explicite dans la période seulement', t => {
  const c = setup(t), s = c.saisons, first = draft(c), second = draft(c);
  assert.throws(() => s.open(first), domain(422, 'opens_at'));
  c.at(START);
  s.open(first);
  assert.equal(s.get(first).state, 'publie');
  assert.equal(s.get(first).decided_at, START);
  c.at(END);
  assert.throws(() => s.open(second), domain(422, 'opens_at'));
  assert.equal(s.get(second).state, 'brouillon');
});

test('Programmation figée : annuler avant ouverture pour modifier, chevauchement permis', t => {
  const c = setup(t), s = c.saisons, a = draft(c), b = draft(c);
  s.schedule(a); s.schedule(b);
  const before = s.get(a);
  assert.throws(() => s.update(a, { closes_at: END + 1000 }), domain(409));
  assert.throws(() => s.setPhotos(a, [2, 1]), domain(409));
  assert.deepEqual(s.get(a), before);
  s.cancelSchedule(a);
  s.setPhotos(a, [2, 1]);
  assert.equal(s.get(a).decided_at, null);
  s.schedule(a);
  c.at(START);
  assert.equal(s.publicList().length, 2);
  assert.throws(() => s.cancelSchedule(a), domain(409));
  assert.equal(s.get(a).state, 'programme');
});

test('Bilan : refus avant clôture et sélections invalides sans effet partiel', t => {
  const c = setup(t), s = c.saisons, id = draft(c, { report: 'Préparation.' }, [1, 2]);
  s.schedule(id);
  c.at(END - 1);
  assert.throws(() => s.publishReport(id, { report: 'Trop tôt', selection_ids: [1] }), domain(409));
  c.at(END);
  const before = s.get(id);
  for (const selection_ids of [[1, 3], [1, 999], [1, 1], [1, '2'], [1, 4]]) {
    assert.throws(() => s.publishReport(id, { report: 'Ne pas écrire', selection_ids }), domain(422, 'selection_ids'));
    assert.deepEqual(s.get(id), before);
  }
  assert.throws(() => s.publishReport(id, { report: '', selection_ids: [] }), domain(422, 'report'));
  assert.throws(() => s.publishReport(id, { report: 'Bilan', opens_at: START }), domain());
  assert.deepEqual(s.get(id), before);
  assert.equal(s.publicList()[0].report, '');
});

test('Bilan et sélection : décision unique, ordre propre et langues, sans modifier les séries', t => {
  const c = setup(t), s = c.saisons, id = draft(c, { title_en: 'A lingering colour', intro_en: 'An intention.' });
  s.schedule(id); c.at(END);
  s.publishReport(id, { report: 'Nous retenons ces deux œuvres.', report_de: 'Unsere Auswahl.', selection_ids: [3, 1] });
  const result = s.publicBySlug(s.get(id).slug, { lang: 'de' });
  assert.equal(result.phase, 'bilan');
  assert.equal(result.report, 'Unsere Auswahl.');
  assert.equal(result.title, 'Une couleur qui insiste', 'traduction absente : repli français');
  assert.deepEqual(result.selection_ids, [3, 1]);
  assert.deepEqual(result.photo_ids, [1, 2, 3]);
  assert.equal(s.publicList({ lang: 'en' })[0].title, 'A lingering colour');
  assert.equal(s.publicList({ lang: 'inconnu' })[0].report, 'Nous retenons ces deux œuvres.');
  const before = s.get(id);
  assert.throws(() => s.publishReport(id, { report: 'Écrasé', selection_ids: [2] }), domain(409));
  assert.deepEqual(s.get(id), before);
  assert.deepEqual(c.db.prepare('SELECT category_id FROM photos ORDER BY id').pluck().all(), [2, 1, 2, 1]);
});

test('Panne SQL en cours d’écriture : accrochage et publication du bilan entièrement annulés', t => {
  const c = setup(t), s = c.saisons, id = draft(c, { report: 'Bilan préparé.' });
  const before = s.get(id);
  c.db.exec("CREATE TRIGGER panne_accrochage BEFORE INSERT ON saison_photos WHEN NEW.photo_id = 2 BEGIN SELECT RAISE(ABORT, 'panne simulée'); END");
  assert.throws(() => s.setPhotos(id, [3, 2, 1]), /panne simulée/);
  assert.deepEqual(s.get(id), before, 'le DELETE et la première insertion sont annulés ensemble');
  c.db.exec('DROP TRIGGER panne_accrochage');
  s.schedule(id); c.at(END);
  const closed = s.get(id);
  c.db.exec("CREATE TRIGGER panne_selection BEFORE INSERT ON saison_selection WHEN NEW.photo_id = 2 BEGIN SELECT RAISE(ABORT, 'panne simulée'); END");
  assert.throws(() => s.publishReport(id, { report: 'Ne doit pas remplacer le bilan.', selection_ids: [1, 2] }), /panne simulée/);
  assert.deepEqual(s.get(id), closed, 'aucun choix partiel ni bilan publié après l’échec');
  assert.equal(s.publicList()[0].phase, 'close');
  assert.equal(s.publicList()[0].report, '');
});

test('Clôture sans choix : un bilan textuel suffit, préparé en brouillon mais publié explicitement', t => {
  const c = setup(t), s = c.saisons, id = draft(c, { report: 'Cette saison demeure une recherche ouverte.' });
  s.schedule(id); c.at(END);
  assert.equal(s.publicList()[0].report, '');
  s.publishReport(id, {});
  assert.equal(s.publicList()[0].report, 'Cette saison demeure une recherche ouverte.');
  assert.deepEqual(s.publicList()[0].selection_ids, []);
});

test('Dépublication tardive : refiltrer exposition et sélection à chaque lecture, sans fuite de métadonnées', t => {
  const c = setup(t), s = c.saisons, id = draft(c);
  s.schedule(id);
  c.db.prepare("UPDATE photos SET status = 'draft', title = 'Titre privé après programmation' WHERE id = 2").run();
  c.at(START);
  let result = s.publicList()[0];
  assert.deepEqual(result.photo_ids, [1, 3]);
  assert.ok(!JSON.stringify(result).includes('Titre privé'));
  assert.ok(!Object.hasOwn(result, 'file'));
  c.at(END);
  assert.throws(() => s.publishReport(id, { report: 'Bilan', selection_ids: [2] }), domain(422, 'selection_ids'));
  s.publishReport(id, { report: 'Bilan', selection_ids: [3, 1] });
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = 3").run();
  result = s.publicBySlug(s.get(id).slug);
  assert.deepEqual(result.photo_ids, [1]);
  assert.deepEqual(result.selection_ids, [1]);
  c.db.prepare('DELETE FROM photos WHERE id = 1').run();
  result = s.publicList()[0];
  assert.deepEqual(result.photo_ids, []);
  assert.deepEqual(result.selection_ids, []);
  assert.equal(result.report, 'Bilan', 'le récit reste lisible si toutes les photos ont été retirées');
  assert.deepEqual(c.db.pragma('foreign_key_check'), []);
});

test('Retrait : une saison programmée, ouverte ou en bilan disparaît de toutes les lectures publiques', t => {
  const c = setup(t), s = c.saisons;
  for (const stage of ['programme', 'ouverte', 'bilan']) {
    c.at(START - 1000);
    const id = draft(c); s.schedule(id);
    if (stage === 'ouverte') c.at(START);
    if (stage === 'bilan') { c.at(END); s.publishReport(id, { report: 'Un bilan.', selection_ids: [1] }); }
    s.withdraw(id);
    assert.equal(s.get(id).phase, 'retire');
    assert.equal(s.publicBySlug(s.get(id).slug), null);
    assert.deepEqual(s.publicList(), []);
    assert.throws(() => s.publishReport(id, { report: 'Ne pas republier' }), domain(409));
    assert.throws(() => s.update(id, { title: 'Ne pas republier' }), domain(409));
  }
  assert.deepEqual(c.db.prepare('SELECT status FROM photos ORDER BY id').pluck().all(), ['published', 'published', 'published', 'draft']);
});

test('Identifiants stricts et adresses stables : inconnus sans effet, collisions bornées', t => {
  const c = setup(t), s = c.saisons, a = draft(c), b = draft(c);
  assert.notEqual(s.get(a).slug, s.get(b).slug);
  const slug = s.get(a).slug;
  s.update(a, { title: 'Un autre titre' });
  assert.equal(s.get(a).slug, slug);
  for (const id of [String(a), 1.5, 0, -1, NaN, 999]) {
    assert.equal(s.get(id), null);
    assert.throws(() => s.update(id, { title: 'Ne pas écrire' }), domain(404));
  }
  assert.equal(s.publicBySlug({}), null);
  assert.equal(s.publicBySlug("' OR 1=1 --"), null);
  const long = 'œ'.repeat(LIMITS.title);
  const x = s.create({ title: long }), y = s.create({ title: long });
  assert.ok(s.get(x).slug.length <= LIMITS.slug);
  assert.ok(s.get(y).slug.length <= LIMITS.slug);
});

test('Atelier : migration de version sur une saison existante, sans perte de son accrochage', t => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  db.exec('CREATE TABLE photos (id INTEGER PRIMARY KEY)');
  const sql = name => fs.readFileSync(new URL(`../server/db/migrations/${name}`, import.meta.url), 'utf8');
  db.exec(sql('065_saisons.sql'));
  db.prepare('INSERT INTO saisons (id, slug, title, created_at, updated_at) VALUES (1, ?, ?, ?, ?)').run('deja-preparee', 'Déjà préparée', START, START);
  db.exec('INSERT INTO photos (id) VALUES (1), (2); INSERT INTO saison_photos (saison_id, photo_id, position) VALUES (1, 2, 0), (1, 1, 1)');
  db.exec(sql('066_saisons_versions.sql'));
  const s = db.prepare('SELECT * FROM saisons').get();
  assert.equal(s.version, 1);
  assert.equal(s.title, 'Déjà préparée');
  assert.equal(s.updated_at, START);
  assert.deepEqual(db.prepare('SELECT photo_id FROM saison_photos ORDER BY position').pluck().all(), [2, 1]);
  assert.throws(() => db.prepare('UPDATE saisons SET version = 0').run(), /CHECK constraint/);
});

test('Atelier : deux validations dans la même milliseconde ne s’écrasent pas', t => {
  const c = setup(t), s = c.saisons, id = draft(c), before = s.get(id);
  const other = createSaisons({ db: c.db, now: c.now });
  const saved = s.revise(id, { version: before.version, input: { title: 'Premier regard' }, photo_ids: [3, 1] });
  assert.equal(saved.title, 'Premier regard');
  assert.deepEqual(saved.photo_ids, [3, 1]);
  assert.equal(saved.updated_at, before.updated_at, 'l’horloge demeure volontairement figée');
  assert.ok(saved.version > before.version);
  assert.throws(() => other.revise(id, { version: before.version, input: { title: 'Écrasement' }, photo_ids: [2] }), domain(409, 'version'));
  assert.deepEqual(s.get(id), saved);
  for (const version of [undefined, null, 0, -1, 1.5, String(saved.version), NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => s.revise(id, { version, input: { title: 'Sans précondition' } }), domain(422, 'version'));
    assert.deepEqual(s.get(id), saved);
  }
});

test('Atelier : textes, ordre et programmation réussissent ou sont annulés ensemble', t => {
  const c = setup(t), s = c.saisons, id = draft(c), before = s.get(id);
  for (const extra of [
    { photo_ids: [1, 1] }, { photo_ids: [1, 999] }, { input: { title: 'Ne pas garder', closes_at: START } },
    { action: 'open' }, { photo_ids: [4, 1], action: 'schedule' }, { action: 'inconnue' }, { action: ['schedule'] },
  ]) {
    assert.throws(() => s.revise(id, { version: before.version, input: { title: 'Ne pas garder' }, photo_ids: [2, 1], ...extra }), domain());
    assert.deepEqual(s.get(id), before, 'aucun texte, ordre ni compteur conservé après refus');
  }
  const saved = s.revise(id, { version: before.version, input: { title: 'Saison validée', intro_en: 'A shared intention.' }, photo_ids: [3, 2], action: 'schedule' });
  assert.equal(saved.state, 'programme');
  assert.equal(saved.title, 'Saison validée');
  assert.equal(saved.intro_en, 'A shared intention.');
  assert.deepEqual(saved.photo_ids, [3, 2]);
  assert.ok(saved.version > before.version);
  c.at(START);
  assert.equal(s.publicList()[0].title, 'Saison validée');
  assert.ok(!Object.hasOwn(s.publicList()[0], 'version'), 'la précondition de l’atelier reste privée');
});

test('Atelier : une panne SQL annule aussi les textes déjà écrits et le compteur', t => {
  const c = setup(t), s = c.saisons, id = draft(c), before = s.get(id);
  c.db.exec("CREATE TRIGGER panne_revision BEFORE INSERT ON saison_photos WHEN NEW.photo_id = 2 BEGIN SELECT RAISE(ABORT, 'panne simulée'); END");
  assert.throws(() => s.revise(id, { version: before.version, input: { intro: 'Ne doit pas rester.' }, photo_ids: [3, 2], action: 'schedule' }), /panne simulée/);
  assert.deepEqual(s.get(id), before);
});

test('Atelier : les décisions seules vérifient leur version et avancent le compteur', t => {
  const c = setup(t), s = c.saisons, id = draft(c);
  let current = s.get(id);
  const transition = action => {
    const next = s.revise(id, { version: current.version, action });
    assert.ok(next.version > current.version);
    assert.throws(() => s.revise(id, { version: current.version, action }), domain(409, 'version'));
    assert.deepEqual(s.get(id), next);
    current = next;
  };
  transition('schedule');
  transition('cancelSchedule');
  assert.equal(current.state, 'brouillon');
  c.at(START);
  transition('open');
  transition('withdraw');
  assert.equal(current.state, 'retire');
  const other = draft(c);
  c.at(START - 1000);
  s.schedule(other); c.at(END);
  const beforeReport = s.get(other).version;
  s.publishReport(other, { report: 'Bilan unique.' });
  assert.ok(s.get(other).version > beforeReport, 'le bilan interne ne contourne pas le compteur');
});
