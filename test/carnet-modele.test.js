import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { billet, photoId, authorId } from './carnet-helpers.js';
import { CarnetError, parseWhen, RUBRIQUES, STATES } from '../server/carnet.js';
import { toStored, toEditor, photoIdsOf, refsOf } from '../server/carnet-markdown.js';

// Carnets, le modèle (migration 055, server/carnet.js) : tables, champs bornés, adresse qui suit le titre puis se fige (et
// l'ancienne qui mène à la nouvelle), signatures, verrou optimiste, versions, enregistrement automatique hors du billet,
// références internes par identifiant, réglages des photos du billet, date de programmation écrite librement.
const by = { sub: 'test', name: 'Test' };

test('migration 055 : les tables des Carnets, leurs colonnes et leurs index ; états et rubriques fermés dans le code', async t => {
  const { db } = await setup(t);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'post%' ORDER BY name").pluck().all();
  assert.deepEqual(tables, ['post_authors', 'post_drafts', 'post_photos', 'post_refs', 'post_reviews', 'post_revisions', 'post_slugs', 'posts']);
  const cols = db.prepare('PRAGMA table_info(posts)').all().map(c => c.name);
  for (const c of ['slug', 'state', 'rubrique', 'title', 'title_en', 'title_de', 'dek', 'body', 'body_de', 'mention', 'reply', 'reply_at', 'langs', 'cover_id', 'share_id', 'trip_id', 'contact', 'visibility', 'version', 'created_at', 'updated_at', 'publish_at', 'published_at', 'revised_at', 'retired_at'])
    assert.ok(cols.includes(c), c);
  assert.equal(db.prepare("SELECT name FROM migrations WHERE name = '055_carnets.sql'").pluck().get(), '055_carnets.sql');
  // Pas de CHECK sur les états (SQLite ne sait pas le modifier, B12) : ils sont validés par le module.
  assert.doesNotMatch(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'posts'").pluck().get(), /CHECK/);
  assert.deepEqual(STATES, ['brouillon', 'propose', 'a_reprendre', 'programme', 'publie', 'retire']);
  assert.deepEqual(RUBRIQUES, ['voyages', 'atelier']);
});

test('créer et enregistrer : titre exigé et borné, signatures (une ou deux), rubrique de la liste, champs changés rendus sans leur valeur', async t => {
  const c = await setup(t, { seeded: true });
  const k = c.app.carnet;
  const seb = authorId(c.db, 'sebastien'), jul = authorId(c.db, 'julien');
  assert.throws(() => k.create({ title: '  ', authors: [seb], by }), CarnetError);
  assert.throws(() => k.create({ title: 'x'.repeat(121), authors: [seb], by }), /120 signes/);
  assert.throws(() => k.create({ title: 'Sans auteur', authors: [], by }), /une ou deux signatures/);
  assert.throws(() => k.create({ title: 'Trois', authors: [seb, jul, 999], by }), /Deux signatures au plus/);
  assert.throws(() => k.create({ title: 'Rubrique', rubrique: 'etiquette', authors: [seb], by }), /Rubrique inconnue/);
  const id = k.create({ title: 'Brume sur le Vercors', rubrique: 'voyages', authors: [seb, jul], by });
  const p = k.get(id);
  assert.deepEqual([p.slug, p.state, p.authors, p.langs, p.version, p.visibility], ['brume-sur-le-vercors', 'brouillon', [seb, jul], ['fr'], 1, 'public']);
  assert.throws(() => k.update(id, { dek: 'x'.repeat(301) }, by), /Chapô : 300 signes/);
  assert.throws(() => k.update(id, { body: 'x'.repeat(60001) }, by), /60000 signes/);
  const r = k.update(id, { dek: 'Un chapô.', body: 'Un texte secret.', title_de: 'Nebel', authors: [jul] }, by);
  assert.deepEqual(r.changed.sort(), ['authors', 'body', 'dek', 'title_de']);
  assert.ok(!JSON.stringify(r.changed).includes('secret'));
  // Rien de changé : rien d'écrit (la version ne bouge pas).
  const v = k.get(id).version;
  assert.deepEqual(k.update(id, { dek: 'Un chapô.' }, by).changed, []);
  assert.equal(k.get(id).version, v);
});

test('adresse : elle suit le titre jusqu’à la première publication, se fige ensuite ; changée, l’ancienne mène à la nouvelle ; jamais reprise', async t => {
  const c = await setup(t, { seeded: true });
  const k = c.app.carnet;
  const p = await billet(c, { title: 'Premier titre', publish: false });
  k.update(p.id, { title: 'Second titre' }, by);
  assert.equal(k.get(p.id).slug, 'second-titre');
  await k.publish(p.id, by);
  k.update(p.id, { title: 'Troisième titre' }, by);
  assert.equal(k.get(p.id).slug, 'second-titre', 'publié : l’adresse ne suit plus le titre');
  k.update(p.id, { slug: 'nouvelle-adresse' }, by);
  assert.equal(k.get(p.id).slug, 'nouvelle-adresse');
  assert.deepEqual(k.bySlug('second-titre').moved, 'nouvelle-adresse');
  // Une adresse prise, maintenant ou autrefois, est refusée à un autre billet.
  const q = await billet(c, { title: 'Un autre', publish: false });
  assert.throws(() => k.update(q.id, { slug: 'nouvelle-adresse' }, by), /déjà prise/);
  assert.throws(() => k.update(q.id, { slug: 'second-titre' }, by), /déjà prise/);
  assert.equal(k.create({ title: 'Second titre', authors: [authorId(c.db, 'julien')], by }) && k.list()[0].slug, 'second-titre-2');
});

test('verrou optimiste (409, rien d’écrasé), 30 versions gardées et rétablies, enregistrement automatique jamais dans le billet', async t => {
  const c = await setup(t, { seeded: true });
  const k = c.app.carnet;
  const p = await billet(c, { publish: false });
  const err = (() => { try { k.update(p.id, { body: 'Écrasé ?' }, by, { version: p.version - 1 }); } catch (e) { return e; } return null; })();
  assert.equal(err?.status, 409);
  assert.notEqual(k.get(p.id).body, 'Écrasé ?');
  for (let i = 0; i < 35; i++) k.update(p.id, { body: `Version ${i}` }, by);
  const list = k.revisions(p.id);
  assert.equal(list.length, 30);
  const old = list.at(-1);
  k.restore(p.id, old.id, by);
  assert.equal(k.get(p.id).body, 'Version 5');
  // Brouillon automatique : gardé à part, le billet ne change pas ; effacé par l'enregistrement suivant.
  const before = k.get(p.id);
  k.saveDraft(p.id, { body: 'Tapé à l’instant', title: 'Titre en cours', inconnu: 'ignoré' }, by);
  assert.equal(k.get(p.id).body, before.body);
  assert.deepEqual(Object.keys(k.draftOf(p.id).data).sort(), ['body', 'title']);
  k.update(p.id, { body: 'Enregistré' }, by);
  assert.equal(k.draftOf(p.id), null);
});

test('références par identifiant (B9) : le slug dans l’éditeur, l’identifiant en base, l’index post_refs ; réglages des photos du billet', async t => {
  const c = await setup(t, { seeded: true });
  const k = c.app.carnet;
  const a = photoId(c.db, 'brume-sur-la-loire'), b = photoId(c.db, 'deux-minuit');
  const resolve = (kind, v) => (kind === 'photo' ? photoId(c.db, v) : kind === 'serie' ? c.db.prepare('SELECT id FROM categories WHERE slug = ?').pluck().get(v) : null) ?? null;
  const stored = toStored('Texte\n\nphoto:brume-sur-la-loire\nphoto:deux-minuit\n\nVoir [la série](serie:rue) et photo:dans-une-phrase.', resolve);
  assert.match(stored, new RegExp(`^photo:${a}$`, 'm'));
  assert.match(stored, /\]\(serie:\d+\)/);
  assert.match(stored, /photo:dans-une-phrase/, 'une photo dans une phrase n’est pas une ligne photo');
  assert.deepEqual(photoIdsOf(stored), [a, b]);
  assert.deepEqual(toEditor(stored, (kind, id) => c.db.prepare(`SELECT slug FROM ${kind === 'photo' ? 'photos' : 'categories'} WHERE id = ?`).pluck().get(id)).split('\n')[2], 'photo:brume-sur-la-loire');
  assert.ok(refsOf(stored).some(r => r.kind === 'serie'));
  const p = await billet(c, { body: `Texte\n\nphoto:${a}\nphoto:${b}`, publish: false });
  assert.deepEqual(c.db.prepare('SELECT kind, ref_id FROM post_refs WHERE post_id = ? ORDER BY kind, ref_id').all(p.id).map(r => `${r.kind}:${r.ref_id}`).sort(), [`photo:${a}`, `photo:${b}`].sort());
  assert.deepEqual([...k.settings(p.id).keys()].sort(), [a, b].sort());
  assert.deepEqual(k.setPhoto(p.id, a, { alt_de: 'Nebel über der Loire', size: 'large', legend: 'x'.repeat(10) }).sort(), ['alt_de', 'legend', 'size']);
  assert.throws(() => k.setPhoto(p.id, a, { alt: 'x'.repeat(301) }), /300 signes/);
  // Retirer une photo : sa ligne dans les trois langues, ses réglages.
  k.removePhoto(p.id, b, by);
  assert.deepEqual(photoIdsOf(k.get(p.id).body), [a]);
  assert.ok(!k.settings(p.id).has(b));
  assert.equal(k.coverId(k.get(p.id)), a, 'couverture par défaut : la première photo du texte');
});

test('date de programmation écrite librement, à l’heure de Paris (MQ-20) ; illisible : null', () => {
  const now = Date.parse('2026-10-16T20:42:00Z');                                   // vendredi 16 octobre, 22 h 42 à Paris
  const paris = ms => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short' }).format(ms);
  for (const s of ['sam. 17 oct., 8 h', '17/10 8:00', 'samedi 8 h', '2026-10-17T08:00', 'Sa. 17. Okt., 8:00 Uhr', 'Saturday 8am', 'demain 8h']) assert.equal(paris(parseWhen(s, now)), 'samedi 17 octobre 2026 à 08:00', s);
  assert.equal(paris(parseWhen('jeu. 15 oct., 8 h', now)), 'jeudi 15 octobre 2026 à 08:00', 'une date passée reste passée (refusée par la route)');
  for (const s of ['', 'bientôt', '31/02 8h', '25 h', 'x'.repeat(100)]) assert.equal(parseWhen(s, now), null, s);
  // Changement d'heure : le 25 octobre 2026, 10 h à Paris est 9 h UTC.
  assert.equal(new Date(parseWhen('25/10/2026 10:00', now)).toISOString(), '2026-10-25T09:00:00.000Z');
});
