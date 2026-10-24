import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { openDb, migrate } from '../server/db/index.js';
import { createVault } from '../server/vault.js';
import { createSaisons } from '../server/saisons.js';
import { createSaisonsVotes, createVoteToken, SaisonVoteError, NOTICE_VERSION } from '../server/saisons-votes.js';

// Bases jetables et photos neutres : les effets métier sont vérifiés sans cookie HTTP, original ni compte.
const START = Date.parse('2026-11-01T10:00:00Z'), END = START + 7 * 86400000;
const consent = { consent: true, noticeVersion: NOTICE_VERSION };
const informed = { noticeVersion: NOTICE_VERSION };
const domain = (status = 422, field = null) => error => error instanceof SaisonVoteError && error.status === status && (field == null || error.field === field);
function setup(t, { file = ':memory:', vault = createVault('cle-de-test-votes'), readiness = null } = {}) {
  const db = openDb(file);
  migrate(db);
  t.after(() => { if (db.open) db.close(); });
  db.prepare("INSERT INTO authors (id, slug, name) VALUES (1, 'auteur-test', 'Auteur de test')").run();
  db.prepare("INSERT INTO categories (id, slug, name) VALUES (1, 'serie-test', 'Série de test')").run();
  const add = db.prepare("INSERT INTO photos (id, slug, title, category_id, author_id, file, width, height, status, position) VALUES (?, ?, ?, 1, 1, ?, 1200, 800, ?, ?)");
  for (let id = 1; id <= 4; id++) add.run(id, `photo-${id}`, `Photographie ${id}`, `neutre-${id}.jpg`, id === 4 ? 'draft' : 'published', id);
  let clock = START - 1000, approved = [1, 2, 3];
  const now = () => clock, saisons = createSaisons({ db, now });
  const params = { db, vault, saisons, now, readiness, approvedIds: () => approved };
  const votes = createSaisonsVotes(params);
  function exhibition() {
    const sid = saisons.create({ author_id: 1, title: 'Une exposition', title_en: 'An exhibition', title_de: 'Eine Ausstellung', intro: 'Une intention.', intro_en: 'An intention.', intro_de: 'Eine Absicht.', cover_id: 1, opens_at: START, closes_at: END });
    saisons.setPhotos(sid, [1, 2, 3]);
    saisons.schedule(sid);
    return sid;
  }
  const sid = exhibition();
  clock = START;
  return { db, vault, saisons, votes, params, sid, exhibition, at: value => { clock = value; }, approve: ids => { approved = ids; } };
}
const size = (db, table) => db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();
const rawCounts = db => db.prepare('SELECT saison_id, photo_id, total FROM saison_vote_totaux ORDER BY saison_id, photo_id').all();

test('Votes : migration additive et rejouable, clés étrangères indexées et unicité en base', t => {
  const c = setup(t), a = createVoteToken();
  assert.equal(c.db.prepare("SELECT name FROM migrations WHERE name = '070_expositions_votes.sql'").pluck().get(), '070_expositions_votes.sql');
  assert.deepEqual(migrate(c.db), []);
  assert.deepEqual(c.db.pragma('foreign_key_check'), []);
  for (const [table, columns] of [['saison_vote_votants', ['saison_id']], ['saison_votes', ['saison_id']], ['saison_votes', ['photo_id']], ['saison_votes', ['navigateur_index', 'saison_id']], ['saison_vote_totaux', ['saison_id']], ['saison_vote_totaux', ['photo_id']]]) {
    const indexes = c.db.pragma(`index_list('${table}')`).map(row => c.db.pragma(`index_info('${row.name}')`).map(col => col.name));
    assert.ok(indexes.some(index => columns.every((column, i) => index[i] === column)), `${table} : index de ${columns.join(', ')}`);
  }
  c.votes.cast(c.sid, 1, a, consent);
  const key = c.vault.index(`vote:${c.sid}:${a}`);
  assert.throws(() => c.db.prepare('INSERT INTO saison_votes (saison_id, photo_id, navigateur_index) VALUES (?, 1, ?)').run(c.sid, key), /UNIQUE/);
  assert.throws(() => c.db.prepare('INSERT INTO saison_votes (saison_id, photo_id, navigateur_index) VALUES (?, 2, ?)').run(c.sid, 'inconnu'), /FOREIGN KEY/);
  assert.equal(size(c.db, 'accounts'), 0);
});

test('Chaque navigateur peut voter une fois sur chaque photo, sans changer sa preuve au doublon', t => {
  const c = setup(t), a = createVoteToken(), b = createVoteToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.deepEqual(c.votes.cast(c.sid, 1, a, consent), { recorded: true, alreadyVoted: false, photo_id: 1, closes_at: END });
  const sealed = c.db.prepare('SELECT consentement FROM saison_vote_votants').pluck().get();
  c.at(START + 1000);
  assert.deepEqual(c.votes.cast(c.sid, 1, a, informed), { recorded: false, alreadyVoted: true, photo_id: 1, closes_at: END });
  assert.equal(c.votes.cast(c.sid, 2, a, informed).recorded, true);
  assert.equal(c.votes.cast(c.sid, 1, b, consent).recorded, true);
  assert.deepEqual(c.votes.counts(c.sid), [{ photo_id: 1, total: 2 }, { photo_id: 2, total: 1 }]);
  assert.deepEqual(c.votes.forBrowser(c.sid, a), { photo_ids: [1, 2], consented: true, closes_at: END, closed: false });
  assert.equal(c.db.prepare('SELECT consentement FROM saison_vote_votants WHERE navigateur_index = ?').pluck().get(c.vault.index(`vote:${c.sid}:${a}`)), sealed);
  assert.equal(c.votes.exportForBrowser(c.sid, a).consent.at, START);
  assert.equal(size(c.db, 'saison_votes'), 3);
});

test('Une photo partagée par deux expositions reçoit deux votes indépendants et des index distincts', t => {
  const c = setup(t), raw = createVoteToken();
  c.at(START - 1);
  const second = c.exhibition();
  c.at(START);
  c.votes.cast(c.sid, 1, raw, consent);
  assert.throws(() => c.votes.cast(second, 1, raw, informed), domain(422, 'consent'));
  c.votes.cast(second, 1, raw, consent);
  assert.deepEqual(c.votes.counts(c.sid), [{ photo_id: 1, total: 1 }]);
  assert.deepEqual(c.votes.counts(second), [{ photo_id: 1, total: 1 }]);
  const indexes = c.db.prepare('SELECT navigateur_index FROM saison_vote_votants').pluck().all();
  assert.equal(new Set(indexes).size, 2);
});

test('Consentement explicite et version courante obligatoires avant le premier bulletin', t => {
  const c = setup(t), raw = createVoteToken();
  for (const options of [undefined, informed, { ...consent, consent: false }, { ...consent, consent: 'oui' }, { ...consent, noticeVersion: 'ancienne' }, null, []]) {
    assert.throws(() => c.votes.cast(c.sid, 1, raw, options), domain(422, 'consent'));
    assert.equal(size(c.db, 'saison_vote_votants'), 0);
    assert.deepEqual(rawCounts(c.db), []);
  }
  c.votes.cast(c.sid, 1, raw, consent);
  assert.equal(c.votes.cast(c.sid, 2, raw, informed).recorded, true);
});

test('Une nouvelle version d’information requiert un nouvel accord sans renouveler le suivi à chaque vote', t => {
  const c = setup(t), raw = createVoteToken();
  c.votes.cast(c.sid, 1, raw, consent);
  c.db.prepare('UPDATE saison_vote_votants SET consentement = ?').run(c.vault.seal(JSON.stringify({ at: START, version: 'ancienne-version' })));
  c.at(START + 1000);
  assert.equal(c.votes.forBrowser(c.sid, raw).consented, false);
  assert.throws(() => c.votes.cast(c.sid, 2, raw, informed), domain(422, 'consent'));
  assert.equal(c.votes.cast(c.sid, 2, raw, consent).recorded, true);
  assert.deepEqual(c.votes.exportForBrowser(c.sid, raw).consent, { at: START + 1000, version: NOTICE_VERSION });
  c.at(START + 2000);
  c.votes.cast(c.sid, 3, raw, consent);
  assert.equal(c.votes.exportForBrowser(c.sid, raw).consent.at, START + 1000);
});

test('Sans clé de données, aucun vote ni preuve en clair ne peut être écrit', t => {
  const c = setup(t, { vault: createVault(null) });
  assert.throws(() => c.votes.cast(c.sid, 1, createVoteToken(), consent), domain(503));
  assert.equal(size(c.db, 'saison_vote_votants'), 0);
  assert.equal(size(c.db, 'saison_votes'), 0);
  assert.deepEqual(rawCounts(c.db), []);
});

test('Jetons et identifiants invalides : refus avant toute écriture', t => {
  const c = setup(t);
  for (const raw of [null, '', 'a'.repeat(42), 'a'.repeat(44), '!'.repeat(43), 'a'.repeat(42) + 'B', {}, ['x']]) {
    assert.throws(() => c.votes.cast(c.sid, 1, raw, consent), domain(422, 'token'));
    assert.equal(size(c.db, 'saison_vote_votants'), 0);
  }
  for (const pid of [0, 1.5, '1', NaN]) assert.throws(() => c.votes.cast(c.sid, pid, createVoteToken(), consent), domain(422, 'photo_id'));
  assert.throws(() => c.votes.cast(9999, 1, createVoteToken(), consent), domain(404));
  assert.deepEqual(rawCounts(c.db), []);
});

test('Proposition validée, présence et publication sont contrôlées à nouveau même après un vote', t => {
  const c = setup(t), raw = createVoteToken();
  c.votes.cast(c.sid, 1, raw, consent);
  c.approve([2, 3]);
  assert.throws(() => c.votes.cast(c.sid, 1, raw, informed), domain(409, 'photo_id'));
  c.approve([1, 2, 3, 4]);
  assert.throws(() => c.votes.cast(c.sid, 4, raw, informed), domain(409, 'photo_id'));
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = 1").run();
  assert.throws(() => c.votes.cast(c.sid, 1, raw, informed), domain(409, 'photo_id'));
  c.db.prepare('DELETE FROM saison_photos WHERE saison_id = ? AND photo_id = 2').run(c.sid);
  assert.throws(() => c.votes.cast(c.sid, 2, raw, informed), domain(409, 'photo_id'));
  for (const invalid of [null, Promise.resolve([3]), ['3'], [3, 3]]) {
    c.approve(invalid);
    assert.throws(() => c.votes.cast(c.sid, 3, raw, informed), domain(503));
  }
  assert.equal(size(c.db, 'saison_votes'), 1);
  assert.deepEqual(rawCounts(c.db), [{ saison_id: c.sid, photo_id: 1, total: 1 }]);
});

test('Un média bloqué par le contrôle de publication ne reçoit aucun bulletin', t => {
  const c = setup(t, { readiness: { gate: ids => ({ ok: ids.filter(id => id !== 2), verify: [], blocked: [2] }) } });
  const raw = createVoteToken();
  c.votes.cast(c.sid, 1, raw, consent);
  assert.throws(() => c.votes.cast(c.sid, 2, raw, informed), domain(409, 'photo_id'));
  assert.deepEqual(c.votes.counts(c.sid), [{ photo_id: 1, total: 1 }]);
});

test('Fenêtre UTC : ouverture incluse, clôture exclue, retrait et brouillon refusés sans bulletin', t => {
  const c = setup(t), raw = createVoteToken();
  c.at(START - 1);
  assert.throws(() => c.votes.cast(c.sid, 1, raw, consent), domain(409));
  c.at(START);
  c.votes.cast(c.sid, 1, raw, consent);
  c.at(END - 1);
  c.votes.cast(c.sid, 2, raw, informed);
  const before = rawCounts(c.db);
  c.at(END);
  assert.throws(() => c.votes.cast(c.sid, 3, raw, informed), domain(409));
  assert.deepEqual(rawCounts(c.db), before);
  c.at(START);
  for (const state of ['retire', 'brouillon']) {
    c.db.prepare('UPDATE saisons SET state = ? WHERE id = ?').run(state, c.sid);
    assert.throws(() => c.votes.cast(c.sid, 3, raw, informed), domain(409));
  }
  assert.deepEqual(rawCounts(c.db), before);
});

test('Clôture : toute lecture purge les identifiants et bulletins et conserve seulement les totaux', t => {
  const c = setup(t), raw = createVoteToken();
  c.votes.cast(c.sid, 1, raw, consent);
  c.votes.cast(c.sid, 2, raw, informed);
  const before = rawCounts(c.db);
  c.at(END);
  assert.deepEqual(c.votes.exportForBrowser(c.sid, raw), { photo_ids: [], consented: false, closes_at: END, closed: true, consent: null });
  assert.equal(size(c.db, 'saison_vote_votants'), 0);
  assert.equal(size(c.db, 'saison_votes'), 0);
  assert.deepEqual(rawCounts(c.db), before);
  assert.deepEqual(c.votes.withdraw(c.sid, raw), { removed: 0, closed: true });
  assert.deepEqual(rawCounts(c.db), before);
  assert.equal(c.votes.purgeDue(), 0);
  assert.deepEqual(c.db.pragma('foreign_key_check'), []);
});

test('Une validation commencée avant la clôture ne peut inscrire un bulletin une fois la fenêtre fermée', t => {
  const c = setup(t), raw = createVoteToken();
  c.at(END - 1);
  const votes = createSaisonsVotes({ ...c.params, approvedIds: () => { c.at(END); return [1, 2, 3]; } });
  assert.throws(() => votes.cast(c.sid, 1, raw, consent), domain(409));
  assert.equal(size(c.db, 'saison_vote_votants'), 0);
  assert.equal(size(c.db, 'saison_votes'), 0);
  assert.deepEqual(rawCounts(c.db), []);
});

test('Purge périodique et lecture des totaux couvrent le retrait, sans toucher une exposition ouverte', t => {
  const c = setup(t), raw = createVoteToken();
  c.at(START - 1);
  const second = c.exhibition();
  c.at(START);
  c.votes.cast(c.sid, 1, raw, consent);
  c.votes.cast(second, 1, raw, consent);
  c.db.prepare("UPDATE saisons SET state = 'retire' WHERE id = ?").run(c.sid);
  assert.deepEqual(c.votes.counts(c.sid), [{ photo_id: 1, total: 1 }]);
  assert.equal(size(c.db, 'saison_vote_votants'), 1);
  assert.deepEqual(c.votes.forBrowser(second, raw).photo_ids, [1]);
  c.at(END);
  assert.equal(c.votes.purgeDue(), 1);
  assert.equal(size(c.db, 'saison_votes'), 0);
  assert.equal(rawCounts(c.db).length, 2);
});

test('Retirer son consentement annule ses votes et sa preuve, en conservant ceux des autres navigateurs', t => {
  const c = setup(t), a = createVoteToken(), b = createVoteToken();
  c.votes.cast(c.sid, 1, a, consent);
  c.votes.cast(c.sid, 2, a, informed);
  c.votes.cast(c.sid, 1, b, consent);
  assert.deepEqual(c.votes.withdraw(c.sid, a), { removed: 2, closed: false });
  assert.deepEqual(c.votes.counts(c.sid), [{ photo_id: 1, total: 1 }, { photo_id: 2, total: 0 }]);
  assert.deepEqual(c.votes.forBrowser(c.sid, a).photo_ids, []);
  assert.equal(c.votes.forBrowser(c.sid, a).consented, false);
  assert.deepEqual(c.votes.forBrowser(c.sid, b).photo_ids, [1]);
  assert.equal(size(c.db, 'saison_vote_votants'), 1);
  assert.deepEqual(c.votes.withdraw(c.sid, a), { removed: 0, closed: false });
  assert.throws(() => c.votes.cast(c.sid, 2, a, informed), domain(422, 'consent'));
  assert.equal(c.votes.cast(c.sid, 2, a, consent).recorded, true);
});

test('Export cloisonné : preuve minimale chiffrée en base, jamais de jeton ni d’index dans les résultats', t => {
  const c = setup(t), a = createVoteToken(), b = createVoteToken();
  c.votes.cast(c.sid, 1, a, consent);
  c.votes.cast(c.sid, 3, b, consent);
  const stored = c.db.prepare('SELECT * FROM saison_vote_votants ORDER BY navigateur_index').all();
  for (const row of stored) {
    assert.match(row.navigateur_index, /^[a-f0-9]{64}$/);
    assert.ok(c.vault.sealed(row.consentement));
    assert.ok(!row.consentement.includes(NOTICE_VERSION));
    assert.ok(!JSON.stringify(row).includes(a));
    assert.ok(!JSON.stringify(row).includes(b));
  }
  const exported = c.votes.exportForBrowser(c.sid, a);
  assert.deepEqual(exported, { photo_ids: [1], consented: true, closes_at: END, closed: false, consent: { at: START, version: NOTICE_VERSION } });
  for (const row of stored) assert.ok(!JSON.stringify(exported).includes(row.navigateur_index));
  assert.ok(!JSON.stringify(exported).includes(a));
  assert.deepEqual(c.votes.forBrowser(c.sid, null), { photo_ids: [], consented: false, closes_at: END, closed: false });
  assert.equal(c.votes.exportForBrowser(c.sid, createVoteToken()).consent, null);
});

test('Preuve altérée : refus fermé, sans consentement implicite ni vote supplémentaire', t => {
  const c = setup(t), raw = createVoteToken();
  c.votes.cast(c.sid, 1, raw, consent);
  c.db.prepare("UPDATE saison_vote_votants SET consentement = 'enc1:altéré'").run();
  assert.throws(() => c.votes.cast(c.sid, 2, raw, consent), domain(503));
  assert.throws(() => c.votes.exportForBrowser(c.sid, raw), domain(503));
  assert.deepEqual(c.votes.counts(c.sid), [{ photo_id: 1, total: 1 }]);
  assert.deepEqual(c.votes.withdraw(c.sid, raw), { removed: 1, closed: false });
});

test('Bulletin et total sont atomiques, même si le stockage du compteur échoue', t => {
  const c = setup(t), raw = createVoteToken();
  c.db.exec("CREATE TRIGGER total_refuse BEFORE INSERT ON saison_vote_totaux BEGIN SELECT RAISE(ABORT, 'compteur indisponible'); END");
  assert.throws(() => c.votes.cast(c.sid, 1, raw, consent), /compteur indisponible/);
  assert.equal(size(c.db, 'saison_vote_votants'), 0);
  assert.equal(size(c.db, 'saison_votes'), 0);
  assert.deepEqual(rawCounts(c.db), []);
  c.db.exec('DROP TRIGGER total_refuse');
  c.votes.cast(c.sid, 1, raw, consent);
  const sealed = c.db.prepare('SELECT consentement FROM saison_vote_votants').pluck().get();
  c.db.exec("CREATE TRIGGER total_refuse BEFORE INSERT ON saison_vote_totaux BEGIN SELECT RAISE(ABORT, 'compteur indisponible'); END");
  assert.throws(() => c.votes.cast(c.sid, 2, raw, informed), /compteur indisponible/);
  assert.deepEqual(c.votes.forBrowser(c.sid, raw).photo_ids, [1]);
  assert.equal(c.db.prepare('SELECT consentement FROM saison_vote_votants').pluck().get(), sealed);
});

test('Annulation atomique : un échec de décrémentation conserve bulletins et preuve', t => {
  const c = setup(t), raw = createVoteToken();
  c.votes.cast(c.sid, 1, raw, consent);
  c.votes.cast(c.sid, 2, raw, informed);
  c.db.exec("CREATE TRIGGER retrait_refuse BEFORE UPDATE ON saison_vote_totaux WHEN OLD.photo_id = 2 BEGIN SELECT RAISE(ABORT, 'retrait indisponible'); END");
  assert.throws(() => c.votes.withdraw(c.sid, raw), /retrait indisponible/);
  assert.deepEqual(c.votes.counts(c.sid), [{ photo_id: 1, total: 1 }, { photo_id: 2, total: 1 }]);
  assert.deepEqual(c.votes.forBrowser(c.sid, raw).photo_ids, [1, 2]);
  assert.equal(size(c.db, 'saison_vote_votants'), 1);
});

test('Redémarrage : le même navigateur reste reconnu et les doublons ne gonflent pas le total', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nicephos-votes-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'votes.sqlite'), c = setup(t, { file }), raw = createVoteToken();
  c.votes.cast(c.sid, 1, raw, consent);
  c.db.close();
  const db = openDb(file), vault = createVault('cle-de-test-votes'), now = () => START + 1000;
  t.after(() => db.close());
  const votes = createSaisonsVotes({ db, vault, saisons: createSaisons({ db, now }), now, approvedIds: () => [1, 2, 3] });
  assert.deepEqual(votes.forBrowser(c.sid, raw).photo_ids, [1]);
  assert.equal(votes.cast(c.sid, 1, raw, informed).alreadyVoted, true);
  assert.equal(votes.cast(c.sid, 2, raw, informed).recorded, true);
  assert.deepEqual(votes.counts(c.sid), [{ photo_id: 1, total: 1 }, { photo_id: 2, total: 1 }]);
  assert.equal(votes.exportForBrowser(c.sid, raw).consent.at, START);
});

test('Deux connexions simultanées ne peuvent compter deux fois le même bulletin', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nicephos-votes-concurrents-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'votes.sqlite'), c = setup(t, { file }), raw = createVoteToken();
  const modules = ['../server/db/index.js', '../server/vault.js', '../server/saisons.js', '../server/saisons-votes.js'].map(module => new URL(module, import.meta.url).href);
  // Deux connexions SQLite réelles attendent le même départ ; pas de faux client ni de service partagé.
  const source = `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const [{ openDb }, { createVault }, { createSaisons }, { createSaisonsVotes }] = await Promise.all(workerData.modules.map(module => import(module)));
      const db = openDb(workerData.file), now = () => workerData.now;
      try {
        const votes = createSaisonsVotes({ db, vault: createVault('cle-de-test-votes'), saisons: createSaisons({ db, now }), now, approvedIds: () => [1, 2, 3] });
        parentPort.postMessage('pret');
        await new Promise(resolve => parentPort.once('message', resolve));
        parentPort.postMessage(votes.cast(workerData.sid, 1, workerData.raw, workerData.consent));
      } finally { db.close(); }
    })().catch(error => { throw error; });
  `;
  const contenders = await Promise.all([1, 2].map(async () => {
    const worker = new Worker(source, { eval: true, workerData: { file, modules, raw, sid: c.sid, now: START, consent } });
    t.after(() => worker.terminate());
    assert.deepEqual(await once(worker, 'message'), ['pret']);
    return { worker, result: once(worker, 'message') };
  }));
  for (const { worker } of contenders) worker.postMessage('voter');
  const results = (await Promise.all(contenders.map(({ result }) => result))).map(([result]) => result);
  assert.equal(results.filter(result => result.recorded).length, 1);
  assert.equal(results.filter(result => result.alreadyVoted).length, 1);
  assert.equal(size(c.db, 'saison_vote_votants'), 1);
  assert.equal(size(c.db, 'saison_votes'), 1);
  assert.deepEqual(c.votes.counts(c.sid), [{ photo_id: 1, total: 1 }]);
});
