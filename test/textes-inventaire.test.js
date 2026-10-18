import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { openDb } from '../server/db/index.js';
import { LIMITS } from '../server/admin-repo.js';
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

// ---------- migration ----------

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

// ---------- numéro d'inventaire ----------

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

// ---------- droits ----------

test('droits : le photographe écrit le texte de remplacement des siennes seulement ; une photo d’un autre est hors portée', async t => {
  const c = await site(t);
  const ph = c.photographer();
  const mine = c.first(c.seb), other = c.first(c.jul);
  // Les siennes : par la fiche, champ par champ et par « textes seuls ».
  assert.equal((await ph.post(`/admin/photos/${mine.id}`, c.form(mine, { alt_text: 'Un quai désert.' }))).statusCode, 303);
  assert.equal(c.row(mine.id).alt_text, 'Un quai désert.');
  assert.equal((await ph.json(`/admin/photos/${mine.id}/champs`, { alt_text_en: 'An empty quay.' })).statusCode, 200);
  assert.equal(c.row(mine.id).alt_text_en, 'An empty quay.');
  assert.equal((await ph.post(`/admin/photos/${mine.id}/textes`, { alt_text_de: 'Ein leerer Kai.' })).statusCode, 303);
  assert.equal(c.row(mine.id).alt_text_de, 'Ein leerer Kai.');
  // Celles de Julien : introuvables pour lui (404), signalées « hors portée », rien d'écrit.
  const before = (await c.security()).length;
  for (const r of [await ph.post(`/admin/photos/${other.id}`, c.form(other, { alt_text: 'piraté' })), await ph.json(`/admin/photos/${other.id}/champs`, { alt_text: 'piraté' }),
    await ph.post(`/admin/photos/${other.id}/textes`, { alt_text: 'piraté' }), await ph.get(`/admin/photos/${other.id}`)]) assert.equal(r.statusCode, 404);
  assert.equal(c.row(other.id).alt_text, '');
  const fails = (await c.security()).slice(before).filter(e => e.type === 'authz_fail');
  assert.equal(fails.length, 4);
  assert.ok(fails.every(e => e.detail.raison === 'hors portée'));
  // Lot : une photo d'un autre glissée dans la liste est ignorée.
  await ph.post('/admin/photos/lot', { ids: `${mine.id},${other.id}`, [`title_${other.id}`]: 'piraté' });
  assert.equal(c.row(other.id).title, other.title);
});

test('droits : séries et photographes réservés à leurs gestionnaires ; le relecteur corrige le texte de remplacement', async t => {
  const c = await site(t);
  const ph = c.photographer(), relu = c.as('relecteur'), modo = c.as('moderateur'), admin = c.as('admin');
  const rue = c.serie('paysage') || c.db.prepare('SELECT * FROM categories LIMIT 1').get();
  const sebRow = c.db.prepare('SELECT * FROM authors WHERE id = ?').get(c.seb);
  const before = (await c.security()).length;
  // Photographe : ni le texte d'intention d'une série (même où sont ses photos), ni sa propre description courte.
  assert.equal((await ph.post(`/admin/series/${rue.id}`, { name: rue.name, intent: 'piraté' })).statusCode, 403);
  assert.equal((await ph.post(`/admin/auteurs/${c.seb}`, { name: sebRow.name, short_bio: 'piraté' })).statusCode, 403);
  assert.equal((await relu.post(`/admin/series/${rue.id}`, { name: rue.name, intent: 'piraté' })).statusCode, 403);
  assert.equal(c.serie(rue.slug).intent, '');
  assert.equal(c.db.prepare('SELECT short_bio FROM authors WHERE id = ?').pluck().get(c.seb), '');
  const refused = (await c.security()).slice(before).filter(e => e.type === 'authz_fail');
  assert.equal(refused.length, 3);
  assert.ok(refused.every(e => e.detail.raison === 'permission'));
  // Modérateur : les séries (series.gerer) ; administrateur : les photographes (photographes.gerer).
  assert.equal((await modo.post(`/admin/series/${rue.id}`, { name: rue.name, intent: 'Ce que la série cherche.' })).statusCode, 303);
  assert.equal(c.serie(rue.slug).intent, 'Ce que la série cherche.');
  assert.equal((await admin.post(`/admin/auteurs/${c.seb}`, { name: sebRow.name, short_bio: 'le matin, les quais, les fleuves' })).statusCode, 303);
  assert.equal(c.db.prepare('SELECT short_bio FROM authors WHERE id = ?').pluck().get(c.seb), 'le matin, les quais, les fleuves');
  // Relecteur : le texte de remplacement est un texte de la photo, comme la légende (photos.textes), publiée comprise.
  const p = c.first(c.jul);
  assert.equal((await relu.post(`/admin/photos/${p.id}/textes`, { alt_text: 'Une ruelle brune.', category_id: '999' })).statusCode, 303);
  assert.equal(c.row(p.id).alt_text, 'Une ruelle brune.');
  assert.equal(c.row(p.id).category_id, p.category_id, 'rien d’autre que les textes');
  assert.equal((await relu.json(`/admin/photos/${p.id}/champs`, { alt_text_en: 'A brown alley.' })).statusCode, 200);
  assert.equal(c.row(p.id).alt_text_en, 'A brown alley.');
  // Modérateur : ne retouche pas les photos.
  assert.equal((await modo.json(`/admin/photos/${p.id}/champs`, { alt_text: 'non' })).statusCode, 403);
  assert.equal(c.row(p.id).alt_text, 'Une ruelle brune.');
  // La fiche du relecteur et la page des séries montrent les champs ; la page Photographes aussi.
  assert.match((await relu.get(`/admin/photos/${p.id}`)).body, /name="alt_text"[^>]*>Une ruelle brune\.<\/textarea>/);
  assert.match((await modo.get('/admin/series')).body, /name="intent" rows="4" maxlength="800">Ce que la série cherche\.<\/textarea>/);
  assert.match((await admin.get('/admin/auteurs')).body, /name="short_bio" value="le matin, les quais, les fleuves" maxlength="160"/);
});

test('journal : chaque modification de ces textes est notée avec le nom du champ, jamais sa valeur', async t => {
  const c = await site(t);
  const admin = c.as('admin'), modo = c.as('moderateur');
  const p = c.first(c.seb), s = c.db.prepare('SELECT * FROM categories LIMIT 1').get();
  c.db.prepare('UPDATE authors SET card_prefix = upper(substr(slug, 1, 1))').run();            // lettre déjà enregistrée
  await admin.post(`/admin/photos/${p.id}`, c.form(p, { alt_text: 'Un secret bien gardé.' }));
  await admin.json(`/admin/photos/${p.id}/champs`, { alt_text_en: 'A quay.' });
  await admin.post(`/admin/photos/${p.id}/textes`, { alt_text_de: 'Ein Kai.', legend: 'Nouvelle légende' });
  await modo.post(`/admin/series/${s.id}`, { name: s.name, intent: 'Une intention.', intent_de: 'Eine Absicht.' });
  await admin.post(`/admin/auteurs/${c.seb}`, { name: 'Sébastien', short_bio: 'les quais' });
  assert.deepEqual(audits(c.db, 'POST /admin/photos/:id').map(r => [r.target, r.detail]), [[String(p.id), 'champs : alt_text']]);
  assert.deepEqual(audits(c.db, 'POST /admin/photos/:id/champs').map(r => r.detail), ['champs : alt_text_en']);
  assert.deepEqual(audits(c.db, 'POST /admin/photos/:id/textes').map(r => r.detail), ['champs : legend, alt_text_de']);
  assert.deepEqual(audits(c.db, 'POST /admin/series/:id').map(r => [r.target, r.detail]), [[String(s.id), 'champs : intent, intent_de']]);
  assert.deepEqual(audits(c.db, 'POST /admin/auteurs/:id').map(r => r.detail), ['champs : short_bio']);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM audit_log WHERE detail LIKE '%secret%' OR detail LIKE '%quais%'").pluck().get(), 0);
  // Rien de changé : rien de noté en plus de l'action.
  await admin.json(`/admin/photos/${p.id}/champs`, { alt_text_en: 'A quay.' });
  assert.equal(audits(c.db, 'POST /admin/photos/:id/champs').at(-1).detail, '');
  // Lot : le numéro de chaque photo précède ses champs.
  const q = c.first(c.jul);
  await admin.post('/admin/photos/lot', { ids: `${p.id},${q.id}`, [`title_${p.id}`]: 'Titre A', [`title_${q.id}`]: q.title });
  assert.equal(audits(c.db, 'POST /admin/photos/lot').at(-1).detail, `champs : photo ${p.id} : title`);
});

// ---------- bornes et échappement ----------

test('bornes : une ligne pour le texte de remplacement et la description courte, longueurs coupées côté serveur', async t => {
  const c = await site(t);
  const admin = c.as('admin'), p = c.first(c.seb);
  assert.deepEqual(LIMITS, { alt_text: 250, short_bio: 160, intent: 800 });
  await admin.post(`/admin/photos/${p.id}`, c.form(p, { alt_text: `  Un quai\r\nau matin\t\u2028gris  ${'x'.repeat(400)}`, alt_text_en: 'a\u0000b\u0007c' }));
  const r = c.row(p.id);
  assert.ok(r.alt_text.startsWith('Un quai au matin gris x'));
  assert.equal(r.alt_text.length, 250);
  assert.doesNotMatch(r.alt_text, /[\r\n\t\u2028]/);
  assert.equal(r.alt_text_en, 'a b c');
  await admin.post(`/admin/auteurs/${c.seb}`, { name: 'Sébastien', short_bio: `le matin,\nles quais ${'y'.repeat(300)}` });
  const sb = c.db.prepare('SELECT short_bio FROM authors WHERE id = ?').pluck().get(c.seb);
  assert.equal(sb.length, 160);
  assert.ok(sb.startsWith('le matin, les quais'));
  const s = c.db.prepare('SELECT * FROM categories LIMIT 1').get();
  await admin.post(`/admin/series/${s.id}`, { name: s.name, intent: `Une.\n\nDeux. ${'z'.repeat(2000)}` });
  const it = c.serie(s.slug).intent;
  assert.equal(it.length, 800);
  assert.ok(it.startsWith('Une. Deux. z'));
  // Un champ absent du formulaire garde sa valeur (traductions comprises).
  await admin.post(`/admin/photos/${p.id}`, c.form(c.row(p.id), { title: 'Autre titre' }));
  assert.equal(c.row(p.id).alt_text_en, 'a b c');
  await admin.post(`/admin/series/${s.id}`, { name: 'Renommée', slug: s.slug });
  assert.equal(c.serie(s.slug).intent, it);
  // Champs du formulaire bornés aussi dans la page (maxlength).
  assert.match((await admin.get(`/admin/photos/${p.id}`)).body, /<textarea name="alt_text" rows="2" maxlength="250"/);
});

test('échappement : une saisie <script> reste du texte, dans l’admin, en v1 et en v2', async t => {
  const c = await site(t);
  const admin = c.as('admin'), modo = c.as('moderateur'), p = c.first(c.seb);
  const evil = '<script>alert(1)</script>" onerror="x';
  await admin.post(`/admin/photos/${p.id}`, c.form(p, { alt_text: evil }));
  const s = c.serie(p.category_id ? c.db.prepare('SELECT slug FROM categories WHERE id = ?').pluck().get(p.category_id) : 'rue');
  await modo.post(`/admin/series/${s.id}`, { name: s.name, intent: `${evil}. Deux. Trois.` });
  await admin.post(`/admin/auteurs/${c.seb}`, { name: 'Sébastien', short_bio: evil });
  const pages = async () => [await c.visit(`/photo/${p.slug}`), await c.visit(`/serie/${s.slug}`), await c.visit('/'), await c.visit(`/auteur/sebastien`)];
  for (const v of ['v1', 'v2']) {
    c.app.publicVersion.save(v);
    for (const res of await pages()) {
      assert.equal(res.statusCode, 200);
      assert.doesNotMatch(res.body, /<script>alert/, v);
      assert.doesNotMatch(res.body, /" onerror="x/, v);
    }
  }
  const v2photo = (await c.visit(`/photo/${p.slug}`)).body;
  assert.ok(v2photo.includes(`alt="${esc(evil)}"`));
  const v2serie = (await c.visit(`/serie/${s.slug}`)).body;
  assert.ok(v2serie.includes('&lt;script&gt;alert(1)&lt;/script&gt;&quot; onerror=&quot;x.'));
  const fiche = (await admin.get(`/admin/photos/${p.id}`)).body;
  assert.ok(fiche.includes('&lt;script&gt;alert(1)&lt;/script&gt;&quot; onerror=&quot;x</textarea>'));
  assert.doesNotMatch(fiche, /<script>alert/);
});

// ---------- suggestion ----------

test('description suggérée : jamais publiée ni enregistrée sans une personne ; la fiche la propose sous le texte de remplacement', async t => {
  const c = await site(t, { describeOptions: { manual: true, model: { describe: async () => 'A quay at dawn.', unload: async () => {}, remove: async () => {} } } });
  const admin = c.as('admin'), p = c.first(c.seb);
  c.app.describer.save({ on: true, model: 'base', from: 1, to: 6 });
  await admin.post(`/admin/photos/${p.id}/description`);
  await c.app.describer.idle();
  assert.equal(c.app.describer.forPhoto(p.id).en, 'A quay at dawn.');
  // Calculée : rien dans la photo, rien sur le site public (v1 et v2), ni dans aucune langue.
  assert.equal(c.row(p.id).alt_text_en, '');
  for (const v of ['v1', 'v2']) {
    c.app.publicVersion.save(v);
    for (const url of [`/photo/${p.slug}`, `/en/photo/${p.slug}`, '/', `/en/auteur/sebastien`]) assert.doesNotMatch((await c.visit(url)).body, /A quay at dawn/, `${v} ${url}`);
  }
  // La fiche la montre sous le champ, avec un bouton qui remplit le champ (script) sans rien enregistrer.
  const fiche = (await admin.get(`/admin/photos/${p.id}`)).body;
  const field = fiche.indexOf('name="alt_text"'), sugg = fiche.indexOf('id="description"');
  assert.ok(field > 0 && sugg > field, 'suggestion sous le texte de remplacement');
  assert.match(fiche, /data-desc-use="A quay at dawn\." data-desc-field="alt_text_en"[^>]*data-js-only hidden>Reprendre comme texte de remplacement anglais</);
  assert.match(fiche, /Rien n’est publié sans « Enregistrer »/);
  // Enregistrer la fiche telle quelle ne la reprend pas ; seule la saisie de la personne compte.
  await admin.post(`/admin/photos/${p.id}`, c.form(c.row(p.id)));
  assert.equal(c.row(p.id).alt_text_en, '');
  await admin.post(`/admin/photos/${p.id}`, c.form(c.row(p.id), { alt_text_en: 'A quay at dawn, two mooring posts.' }));
  c.app.publicVersion.save('v2');
  assert.ok((await c.visit(`/en/photo/${p.slug}`)).body.includes('alt="A quay at dawn, two mooring posts."'));
});

// ---------- texte de remplacement sur le site ----------

test('alt : le texte de remplacement dans la visionneuse (v1 et v2) et les vignettes v2 ; le titre, ou rien, sans lui', async t => {
  const c = await site(t);
  const admin = c.as('admin'), p = c.first(c.seb);
  const serie = c.db.prepare('SELECT slug FROM categories WHERE id = ?').pluck().get(p.category_id);
  const main = body => /<div class="vimg">[\s\S]*?alt="([^"]*)"/.exec(body)?.[1];
  const v2main = body => /<div class="vis-cadre" data-cadre>[\s\S]*?alt="([^"]*)"/.exec(body)?.[1];
  const thumb = (body, slug) => new RegExp(`href="[^"]*/photo/${slug}[^"]*"><picture>[\\s\\S]*?alt="([^"]*)"`).exec(body)?.[1];
  // Sans texte : le titre pour la photo, rien pour une vignette (son lien dit déjà le titre).
  c.app.publicVersion.save('v1');
  assert.equal(main((await c.visit(`/photo/${p.slug}`)).body), esc(p.title));
  c.app.publicVersion.save('v2');
  assert.equal(v2main((await c.visit(`/photo/${p.slug}`)).body), esc(p.title));
  assert.equal(thumb((await c.visit(`/serie/${serie}`)).body, p.slug), '');
  // Écrit, en trois langues.
  await admin.post(`/admin/photos/${p.id}`, c.form(p, { alt_text: 'Brume sur le fleuve.', alt_text_en: 'Mist on the river.', alt_text_de: 'Nebel über dem Fluss.' }));
  const ALT = { '': 'Brume sur le fleuve.', '/en': 'Mist on the river.', '/de': 'Nebel über dem Fluss.' };
  for (const [prefix, alt] of Object.entries(ALT)) {
    c.app.publicVersion.save('v1');
    assert.equal(main((await c.visit(`${prefix}/photo/${p.slug}`)).body), alt, `v1 ${prefix || '/'}`);
    c.app.publicVersion.save('v2');
    assert.equal(v2main((await c.visit(`${prefix}/photo/${p.slug}`)).body), alt, `v2 ${prefix || '/'}`);
    for (const url of [`${prefix}/serie/${serie}`, `${prefix}/`, `${prefix}/auteur/sebastien`]) assert.equal(thumb((await c.visit(url)).body, p.slug), alt, `vignette ${url}`);
  }
  // Une seule langue écrite : repli comme les autres textes.
  await admin.post(`/admin/photos/${p.id}`, c.form(c.row(p.id), { alt_text_en: '', alt_text_de: '' }));
  assert.equal(v2main((await c.visit(`/de/photo/${p.slug}`)).body), 'Brume sur le fleuve.');
});

// ---------- rendu v2 ----------

test('v2 : texte d’intention (deux phrases, puis « Lire la suite »), description courte et inventaire, en trois langues', async t => {
  const c = await site(t);
  const admin = c.as('admin'), modo = c.as('moderateur'), p = c.first(c.jul);
  const s = c.db.prepare('SELECT * FROM categories WHERE id = ?').get(p.category_id);
  const INTENT = {
    '': ['Des passants, des seuils : la ville quand elle ne pose pas. Julien y cherche les visages.', 'Tout a été fait à pied, sans flash.', 'Lire la suite', ' du texte de la série'],
    '/en': ['Passers-by, doorways: the city when it is not posing. Julien looks for faces.', 'Everything was done on foot, without flash.', 'Read more', ' about the series'],
    '/de': ['Passanten, Schwellen: die Stadt, wenn sie nicht posiert. Julien sucht die Gesichter.', 'Alles zu Fuß, ohne Blitz.', 'Weiterlesen', ' (Text der Serie)'],
  };
  await modo.post(`/admin/series/${s.id}`, { name: s.name, intent: `${INTENT[''][0]} ${INTENT[''][1]}`, intent_en: `${INTENT['/en'][0]} ${INTENT['/en'][1]}`, intent_de: `${INTENT['/de'][0]} ${INTENT['/de'][1]}` });
  const SHORT = { '': ['la rue, et ceux qui y passent', '12 photos'], '/en': ['the street, and those who pass by', 'photos'], '/de': ['die Straße und wer vorbeigeht', 'Fotos'] };
  await admin.post(`/admin/auteurs/${c.jul}`, { name: 'Julien', short_bio: SHORT[''][0], short_bio_en: SHORT['/en'][0], short_bio_de: SHORT['/de'][0] });
  const INV = { '': 'Inventaire', '/en': 'Inventory number', '/de': 'Inventarnummer' };
  c.app.publicVersion.save('v2');
  for (const prefix of ['', '/en', '/de']) {
    const [head, rest, more, of] = INTENT[prefix];
    const serie = (await c.visit(`${prefix}/serie/${s.slug}`)).body;
    const at = serie.indexOf('<div class="ser-txt">'), box = serie.slice(at, serie.indexOf('</details>', at) + 10);
    assert.ok(box.includes(`<p class="ser-int">${prefix ? head : head.replace(' :', ' :')}</p>`), `tête ${prefix || '/'}`);
    assert.ok(box.includes(`<p class="ser-int que-bureau">${rest}</p>`), `suite au bureau ${prefix || '/'}`);
    assert.ok(box.includes(`<details class="depliant depliant--suite"><summary>${more}<span class="sr-only">${of}</span></summary><p class="ser-int">${rest}</p></details>`), `dépliant ${prefix || '/'}`);
    const home = (await c.visit(`${prefix}/`)).body;
    assert.match(home, new RegExp(`<span class="liste-liens-n">Julien</span><span class="liste-liens-d">6 [^<]+&nbsp;· ${SHORT[prefix][0]}</span>`), `regard ${prefix || '/'}`);
    const photo = (await c.visit(`${prefix}/photo/${p.slug}`)).body;
    assert.ok(photo.includes(`<dt>${INV[prefix]}</dt><dd class="donnee">${p.inventory}</dd>`), `inventaire ${prefix || '/'}`);
  }
  // Repli : une langue sans traduction montre le français.
  await modo.post(`/admin/series/${s.id}`, { name: s.name, intent_de: '' });
  assert.ok((await c.visit(`/de/serie/${s.slug}`)).body.includes(`<p class="ser-int">${INTENT[''][0]}</p>`));
  // Deux phrases ou moins : pas de « Lire la suite » ; rien d'écrit : ni bloc, ni séparateur.
  await modo.post(`/admin/series/${s.id}`, { name: s.name, intent: 'Une seule phrase.', intent_en: '', intent_de: '' });
  const short = (await c.visit(`/serie/${s.slug}`)).body;
  assert.ok(short.includes('<p class="ser-int">Une seule phrase.</p>'));
  assert.doesNotMatch(short, /depliant--suite|que-bureau">/);
  await modo.post(`/admin/series/${s.id}`, { name: s.name, intent: '' });
  assert.doesNotMatch((await c.visit(`/serie/${s.slug}`)).body, /ser-txt/);
  await admin.post(`/admin/auteurs/${c.jul}`, { name: 'Julien', short_bio: '', short_bio_en: '', short_bio_de: '' });
  assert.match((await c.visit('/')).body, /<span class="liste-liens-n">Julien<\/span><span class="liste-liens-d">6 photos<\/span>/);
});

test('coupe du texte d’intention : à la fin d’une phrase, jamais dans un nombre', () => {
  assert.deepEqual(intentParts('Un. Deux ! Trois ? Quatre.'), { head: 'Un. Deux !', rest: 'Trois ? Quatre.' });
  assert.deepEqual(intentParts('À 1.5 km du port. « Rien », dit-il. Puis la suite…'), { head: 'À 1.5 km du port. « Rien », dit-il.', rest: 'Puis la suite…' });
  assert.deepEqual(intentParts('Elle dit « Viens. » Il vient. Fin.'), { head: 'Elle dit « Viens. » Il vient.', rest: 'Fin.' });
  assert.deepEqual(intentParts(''), { head: '', rest: '' });
  assert.deepEqual(intentParts(null), { head: '', rest: '' });
});

// ---------- la v1 ne change pas ----------

test('v1 : le même HTML avant et après ces données, sauf l’attribut alt de la photo de la visionneuse', async t => {
  const c = await site(t);
  const admin = c.as('admin'), modo = c.as('moderateur'), p = c.first(c.seb);
  const serie = c.db.prepare('SELECT * FROM categories WHERE id = ?').get(p.category_id);
  c.app.publicVersion.save('v1');
  const urls = ['/', `/serie/${serie.slug}`, '/auteur/sebastien', `/photo/${p.slug}`, '/a-propos', '/recherche?q=brume', '/carte', '/en/', `/de/photo/${p.slug}`, `/en/serie/${serie.slug}`];
  const snap = async () => Object.fromEntries(await Promise.all(urls.map(async u => [u, (await c.visit(u)).body])));
  const before = await snap();
  assert.deepEqual(await snap(), before, 'pages stables d’une visite à l’autre');
  await admin.post(`/admin/photos/${p.id}`, c.form(p, { alt_text: 'Brume « bleue » & quai.', alt_text_de: 'Nebel.' }));
  await modo.post(`/admin/series/${serie.id}`, { name: serie.name, intent: 'Une. Deux. Trois.', intent_en: 'One. Two. Three.' });
  await admin.post(`/admin/auteurs/${c.seb}`, { name: 'Sébastien', short_bio: 'le matin, les quais, les fleuves', short_bio_en: 'mornings' });
  const after = await snap();
  for (const u of urls) {
    const expected = u === `/photo/${p.slug}` ? before[u].replace(`alt="${esc(p.title)}"`, `alt="${esc('Brume « bleue » & quai.')}"`)
      : u === `/de/photo/${p.slug}` ? before[u].replace(`alt="${esc(p.title)}"`, 'alt="Nebel."') : before[u];
    assert.equal(after[u], expected, u);
  }
  assert.notEqual(after[`/photo/${p.slug}`], before[`/photo/${p.slug}`]);
  // Rien de la v2 ne passe en v1 : ni l'inventaire, ni l'intention, ni la description courte.
  for (const u of urls) assert.doesNotMatch(after[u], new RegExp(`${p.inventory}|Une\\. Deux|le matin, les quais`), u);
});
