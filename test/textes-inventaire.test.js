import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { openDb } from '../server/db/index.js';
import { intentParts } from '../server/v2-vues.js';

// Données du site public v2 créées par la migration 053 (PLAN.md, point 8) : texte d'intention d'une série (MQ-03),
// description courte d'un photographe (MQ-01), texte de remplacement d'une photo (UX-F-44) et numéro d'inventaire
// (UX-T-05, MQ-04). Écrits dans l'admin avec les droits de leurs voisins, notés au journal, échappés et bornés ; la v1
// ne change que par l'attribut alt de la photo de la visionneuse.
const YY = String(new Date().getUTCFullYear()).slice(2);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Vigie simulée : les événements de sécurité reçus (« hors portée », droit refusé).
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };

async function site(t, opts = {}) {
  const received = [];
  const ctx = await setup(t, { seeded: true, env: VIGIE, vigieOptions: { send: async body => { received.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false }, ...opts });
  const security = async () => { ctx.app.securite.runTasks(); ctx.app.securite.retryNow(); await ctx.app.securite.flush(); return received; };
  const store = createSessionStore(ctx.db);
  const session = sub => {
    const token = store.create({ sub, name: sub });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const get = url => ctx.app.inject({ url, cookies: { session: token }, headers: { accept: 'text/html' } });
    const post = (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } });
    const json = (url, payload) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload });
    return { get, post, json };
  };
  const as = role => { ctx.app.accounts.ensure({ sub: `test:${role}`, name: role, roles: [role] }); return session(`test:${role}`); };
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  // Compte Photographe lié à Sébastien (portée « les miennes »).
  const photographer = () => {
    ctx.app.accounts.ensure({ sub: 'zitadel-seb', name: 'Sébastien', roles: ['photographe'] });
    ctx.app.accounts.update(ctx.app.accounts.bySub('zitadel-seb').id, { authorId: seb }, 'test');
    return session('zitadel-seb');
  };
  const row = id => ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  const first = author => ctx.db.prepare("SELECT * FROM photos WHERE status = 'published' AND author_id = ? ORDER BY position, id LIMIT 1").get(author);
  const serie = slug => ctx.db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  // Le formulaire de la fiche tel que le navigateur l'envoie.
  const form = (p, extra = {}) => ({ title: p.title, slug: p.slug, category_id: String(p.category_id), author_id: String(p.author_id), place: p.place || '',
    taken_on: p.taken_on || '', legend: p.legend || '', status: p.status, watermark: 'default', ...extra });
  const visit = url => ctx.app.inject({ url });
  return { ...ctx, as, photographer, seb, jul, row, first, serie, form, security, visit };
}
const audits = (db, action) => db.prepare('SELECT action, target, detail FROM audit_log WHERE action = ? ORDER BY id').all(action);

test('migration 053 : textes vides par défaut, numéro d’inventaire pour chaque photo publiée, compteur par préfixe', async t => {
  const c = await site(t);
  assert.ok(c.db.prepare('SELECT 1 FROM migrations WHERE name = ?').get('053_textes_inventaire.sql'));
  const cols = table => Object.fromEntries(c.db.prepare(`PRAGMA table_info(${table})`).all().map(x => [x.name, x]));
  for (const [table, names] of [['categories', ['intent', 'intent_en', 'intent_de']], ['authors', ['short_bio', 'short_bio_en', 'short_bio_de']], ['photos', ['alt_text', 'alt_text_en', 'alt_text_de']]]) {
    const all = cols(table);
    for (const n of names) {
      assert.equal(all[n]?.notnull, 1, `${table}.${n}`);
      assert.equal(all[n].dflt_value, "''", `${table}.${n}`);
      assert.equal(c.db.prepare(`SELECT COUNT(*) FROM ${table} WHERE ${n} != ''`).pluck().get(), 0, `${table}.${n} vide`);
    }
  }
  // Jeu de démonstration : six photos de chacun, numérotées dans l'ordre de publication (ici, l'ordre d'import).
  const inv = c.db.prepare('SELECT a.slug, p.inventory FROM photos p JOIN authors a ON a.id = p.author_id ORDER BY p.id').all();
  assert.deepEqual(inv.filter(r => r.slug === 'sebastien').map(r => r.inventory), [1, 2, 3, 4, 5, 6].map(n => `S${YY}-00${n}`));
  assert.deepEqual(inv.filter(r => r.slug === 'julien').map(r => r.inventory), [1, 2, 3, 4, 5, 6].map(n => `J${YY}-00${n}`));
  assert.deepEqual(c.db.prepare('SELECT prefix, last FROM inventory_counters ORDER BY prefix').all(), [{ prefix: `J${YY}`, last: 6 }, { prefix: `S${YY}`, last: 6 }]);
  assert.ok(c.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'photos_inventory'").get(), 'index unique');
});

test('migration 053 sur une base en service : photos déjà publiées numérotées par photographe et par année de première publication', async t => {
  const c = await site(t);
  // Une base d'avant 053 : on refait la migration sur une copie vidée de ses numéros.
  const file = `${c.dir}/avant.db`;
  const db = openDb(file);
  t.after(() => db.close());
  const sql = fs.readFileSync(new URL('../server/db/migrations/053_textes_inventaire.sql', import.meta.url), 'utf8');
  db.exec(`CREATE TABLE authors (id INTEGER PRIMARY KEY, slug TEXT, name TEXT, card_prefix TEXT NOT NULL DEFAULT '');
    CREATE TABLE categories (id INTEGER PRIMARY KEY, slug TEXT, name TEXT);
    CREATE TABLE photos (id INTEGER PRIMARY KEY, author_id INTEGER, status TEXT, published_at TEXT);
    INSERT INTO authors VALUES (1, 'julien', 'Julien', ''), (2, 'sebastien', 'Sébastien', ''), (3, 'kim', 'Kim', 'Q');
    INSERT INTO photos VALUES (1, 1, 'published', '2025-03-01 10:00:00'), (2, 1, 'published', '2026-01-02 10:00:00'),
      (3, 1, 'draft', '2025-01-01 10:00:00'), (4, 2, 'published', '2025-05-01 10:00:00'), (5, 1, 'draft', NULL), (6, 3, 'published', '2026-02-01 08:00:00');`);
  db.exec(sql);
  // Une photo dépubliée garde le numéro de sa première publication ; un brouillon jamais publié n'en a pas ; la lettre
  // des cartes l'emporte sur l'adresse.
  assert.deepEqual(db.prepare('SELECT id, inventory FROM photos ORDER BY id').all().map(r => r.inventory), ['J25-002', 'J26-001', 'J25-001', 'S25-001', null, 'Q26-001']);
  assert.deepEqual(db.prepare('SELECT prefix, last FROM inventory_counters ORDER BY prefix').all(),
    [{ prefix: 'J25', last: 2 }, { prefix: 'J26', last: 1 }, { prefix: 'Q26', last: 1 }, { prefix: 'S25', last: 1 }]);
  // Le brouillon publié ensuite prend le rang suivant de l'année en cours.
  db.prepare("UPDATE photos SET status = 'published' WHERE id = 5").run();
  assert.equal(db.prepare('SELECT inventory FROM photos WHERE id = 5').pluck().get(), YY === '26' ? 'J26-002' : `J${YY}-001`);
});

test('numéro d’inventaire : donné à la première publication, unique, stable, jamais réutilisé après suppression', async t => {
  const c = await site(t);
  const admin = c.as('admin');
  // Une photo importée est un brouillon : pas de numéro, et la fiche le dit.
  const draft = c.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id DESC LIMIT 1').pluck().get(c.seb);
  c.db.prepare("UPDATE photos SET status = 'draft', inventory = inventory WHERE id = ?").run(draft);
  const id = Number(c.db.prepare(`INSERT INTO photos (slug, title, category_id, author_id, status, position, file, width, height)
    SELECT 'nouvelle', 'Nouvelle', category_id, author_id, 'draft', 99, 'nouvelle.jpg', width, height FROM photos WHERE id = ?`).run(draft).lastInsertRowid);
  c.db.prepare("UPDATE photos SET faces = 0, face_boxes = '[]' WHERE id = ?").run(id);          // examinée : personne
  assert.equal(c.row(id).inventory, null);
  assert.match((await admin.get(`/admin/photos/${id}`)).body, /numéro d’inventaire à la première publication/);
  // Publiée par la fiche : le rang suivant de Sébastien.
  assert.equal((await admin.post(`/admin/photos/${id}`, c.form(c.row(id), { status: 'published' }))).statusCode, 303);
  const n = c.row(id).inventory;
  assert.equal(n, `S${YY}-007`);
  assert.match((await admin.get(`/admin/photos/${id}`)).body, new RegExp(`inventaire ${n}`));
  // Dépubliée, republiée, réordonnée, donnée à un autre photographe : le même numéro.
  await admin.post(`/admin/photos/${id}/status`, { status: 'draft' });
  assert.equal(c.row(id).status, 'draft');
  await admin.post(`/admin/photos/${id}/status`, { status: 'published' });
  await admin.post(`/admin/photos/${id}/move`, { dir: 'up' });
  assert.equal((await admin.post(`/admin/photos/${id}`, c.form(c.row(id), { author_id: String(c.jul) }))).statusCode, 303);
  assert.equal(c.row(id).author_id, c.jul);
  assert.equal(c.row(id).inventory, n);
  // Jamais modifiable à la main : ni par la fiche, ni par la base.
  await admin.post(`/admin/photos/${id}`, c.form(c.row(id), { inventory: 'X99-999' }));
  await admin.json(`/admin/photos/${id}/champs`, { inventory: 'X99-999' });
  assert.equal(c.row(id).inventory, n);
  assert.throws(() => c.db.prepare("UPDATE photos SET inventory = 'S00-001' WHERE id = ?").run(id), /il ne change jamais/);
  assert.throws(() => c.db.prepare('DELETE FROM inventory_counters').run(), /jamais redonné/);
  assert.throws(() => c.db.prepare('UPDATE inventory_counters SET last = 1').run(), /jamais redonné/);
  // Supprimée : son numéro n'est pas redonné à la photo publiée suivante.
  assert.equal((await admin.post(`/admin/photos/${id}/delete`)).statusCode, 303);
  assert.equal(c.row(id), undefined);
  const next = Number(c.db.prepare(`INSERT INTO photos (slug, title, category_id, author_id, status, position, file, width, height)
    SELECT 'suivante', 'Suivante', category_id, ?, 'published', 100, 'suivante.jpg', width, height FROM photos WHERE id = ?`).run(c.seb, draft).lastInsertRowid);
  assert.equal(c.row(next).inventory, `S${YY}-008`);
  // Unique : l'index le garantit, même pour une écriture directe.
  assert.throws(() => c.db.prepare(`INSERT INTO photos (slug, title, category_id, author_id, status, position, file, width, height, inventory)
    SELECT 'double', 'Double', category_id, author_id, 'draft', 101, 'double.jpg', width, height, ? FROM photos WHERE id = ?`).run(`S${YY}-001`, draft), /UNIQUE/);
  const all = c.db.prepare('SELECT inventory FROM photos WHERE inventory IS NOT NULL').pluck().all();
  assert.equal(new Set(all).size, all.length);
});

test('numéro d’inventaire : rien de privé (ni l’heure, ni l’identifiant interne), toujours lettre, année, rang', async t => {
  const c = await site(t);
  for (const p of c.db.prepare('SELECT id, inventory, published_at FROM photos').all()) {
    assert.match(p.inventory, /^[A-Z]\d{2}-\d{3,}$/);
    const [, rank] = p.inventory.split('-');
    assert.doesNotMatch(p.inventory, new RegExp(p.published_at.slice(11, 13) + p.published_at.slice(14, 16)), 'pas l’heure');
    assert.ok(Number(rank) <= 6, `rang de l’auteur, pas l’identifiant ${p.id}`);
  }
});

test('coupe du texte d’intention : à la fin d’une phrase, jamais dans un nombre', () => {
  assert.deepEqual(intentParts('Un. Deux ! Trois ? Quatre.'), { head: 'Un. Deux !', rest: 'Trois ? Quatre.' });
  assert.deepEqual(intentParts('À 1.5 km du port. « Rien », dit-il. Puis la suite…'), { head: 'À 1.5 km du port. « Rien », dit-il.', rest: 'Puis la suite…' });
  assert.deepEqual(intentParts('Elle dit « Viens. » Il vient. Fin.'), { head: 'Elle dit « Viens. » Il vient.', rest: 'Fin.' });
  assert.deepEqual(intentParts(''), { head: '', rest: '' });
  assert.deepEqual(intentParts(null), { head: '', rest: '' });
});
