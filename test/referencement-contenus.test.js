import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { as, billet, visitor, photoId, authorId } from './carnet-helpers.js';

// Le référencement s’appuie sur les contenus déjà publiés : aucun récit ni lieu n’est créé pour remplir une page.
const setting = (db, key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
const main = html => /<main\b[^>]*>([^]*?)<\/main>/.exec(html)?.[1] || '';
const related = html => /<section[^>]*aria-labelledby="carnets-lies-t"[^>]*>([^]*?)<\/section>/.exec(html)?.[1] || '';
const by = { sub: 'test', name: 'Test' };

async function trip(c) {
  const id = photoId(c.db, 'brume-sur-la-loire'), author = authorId(c.db, 'sebastien');
  c.db.prepare("UPDATE photos SET taken_on = '2026-03-12' WHERE id = ?").run(id);
  const created = c.app.trips.create({ name: 'Voyage de démonstration', authorId: author });
  c.app.trips.addDays(created, [{ author_id: author, day: '2026-03-12' }]);
  return c.app.trips.update(created, { public: true });
}

test('référencement : une page auteur nomme son auteur et reprend seulement sa présentation publique localisée', async t => {
  const c = await setup(t, { seeded: true });
  c.db.prepare("UPDATE authors SET short_bio = 'Les quais & la lumière.', short_bio_en = 'Quays and light.', short_bio_de = 'Kais und Licht.', bio = 'Une biographie déjà publique.' WHERE slug = 'sebastien'").run();
  for (const version of ['v2', 'v3']) {
    c.app.publicVersion.save(version);
    for (const [prefix, description] of [['', 'Les quais &amp; la lumière.'], ['/en', 'Quays and light.'], ['/de', 'Kais und Licht.']]) {
      const res = await c.app.inject(`${prefix}/auteur/sebastien`);
      assert.equal(res.statusCode, 200);
      const body = main(res.body);
      assert.match(body, /<h1 class="titre-page">Sébastien<\/h1>/);
      assert.ok(body.includes(description), `${version} ${prefix}`);
      assert.doesNotMatch(body, /Une biographie déjà publique/);
      assert.match(body, /6 photos|6 Fotos/);
    }
  }
  c.db.prepare("UPDATE authors SET short_bio = '', short_bio_en = '', short_bio_de = '', bio = 'Une biographie déjà publique.' WHERE slug = 'sebastien'").run();
  assert.match(main((await c.app.inject('/auteur/sebastien')).body), /Une biographie déjà publique\./);
  c.db.prepare("UPDATE authors SET bio = '' WHERE slug = 'sebastien'").run();
  const fallback = main((await c.app.inject('/auteur/sebastien')).body);
  assert.match(fallback, /<h1 class="titre-page">Sébastien<\/h1>/);
  assert.match(fallback, /6 photographies|6 photos/);
});

test('référencement : À propos reprend l’introduction publique quand son texte manque, dans les trois présentations', async t => {
  const c = await setup(t, { seeded: true });
  for (const [key, value] of Object.entries({ about: '', about_en: '', about_de: '', intro: 'Une présentation commune & vérifiée.', intro_en: 'A shared introduction.', intro_de: 'Eine gemeinsame Vorstellung.' })) setting(c.db, key, value);
  for (const version of ['v1', 'v2', 'v3']) {
    c.app.publicVersion.save(version);
    for (const [prefix, text] of [['', 'Une présentation commune &amp; vérifiée.'], ['/en', 'A shared introduction.'], ['/de', 'Eine gemeinsame Vorstellung.']]) {
      const res = await c.app.inject(`${prefix}/a-propos`);
      assert.equal(res.statusCode, 200);
      assert.ok(main(res.body).includes(text), `${version} ${prefix}`);
    }
  }
  setting(c.db, 'about', 'Une présentation propre à cette page.');
  const explicit = main((await c.app.inject('/a-propos')).body);
  assert.match(explicit, /Une présentation propre à cette page\./);
  assert.doesNotMatch(explicit, /Une présentation commune/);
});

test('référencement : une photo mène uniquement aux billets publics publiés qui la citent, avec des textes échappés', async t => {
  const c = await setup(t, { seeded: true });
  c.app.publicVersion.save('v2');
  const visible = await billet(c, { title: 'Lumière <du fleuve>', dek: 'Une image & son récit.', body: 'Un récit de démonstration.\n\nphoto:brume-sur-la-loire' });
  const hidden = await billet(c, { title: 'Titre privé à ne pas révéler', body: 'photo:brume-sur-la-loire' });
  c.db.prepare("UPDATE posts SET visibility = 'prive' WHERE id = ?").run(hidden.id);
  await billet(c, { title: 'Brouillon à ne pas révéler', body: 'photo:brume-sur-la-loire', publish: false });
  const retired = await billet(c, { title: 'Titre retiré à ne pas révéler', body: 'photo:brume-sur-la-loire' });
  c.app.carnet.retire(retired.id, by, 'Retiré pour le test.');
  const res = await visitor(c)('/photo/brume-sur-la-loire');
  assert.equal(res.statusCode, 200);
  const block = related(res.body);
  assert.ok(block);
  assert.match(block, new RegExp(`href="/carnet/${visible.slug}"`));
  assert.match(block, /Lumière &lt;du fleuve&gt;/);
  assert.match(block, /Une image &amp; son récit\./);
  assert.doesNotMatch(res.body, /Titre privé à ne pas révéler|Brouillon à ne pas révéler|Titre retiré à ne pas révéler|<du fleuve>/);
  assert.equal((await visitor(c)(`/carnet/${visible.slug}`)).statusCode, 200);
  c.app.carnet.retire(visible.id, by, 'Retiré après publication.');
  assert.equal(related((await visitor(c)('/photo/brume-sur-la-loire')).body), '');
});

test('référencement : le maillage des Carnets suit les langues publiées et les citations de leur propre texte', async t => {
  const c = await setup(t, { seeded: true });
  c.app.publicVersion.save('v3');
  const frOnly = await billet(c, { title: 'Un récit français', body: 'photo:brume-sur-la-loire',
    extra: { title_en: 'A translation still being written', body_en: 'photo:brume-sur-la-loire' } });
  const translated = await billet(c, { title: 'Autre récit public', body: 'photo:deux-minuit', extra: {
    title_en: 'A published translation', body_en: 'photo:brume-sur-la-loire',
    title_de: 'Eine veröffentlichte Übersetzung', body_de: 'photo:brume-sur-la-loire', langs: ['en', 'de'] } });
  const en = related((await visitor(c)('/en/photo/brume-sur-la-loire')).body);
  assert.match(en, /A published translation/);
  assert.match(en, new RegExp(`href="/en/carnet/${translated.slug}"`));
  assert.doesNotMatch(en, /Un récit français|A translation still being written/);
  const de = related((await visitor(c)('/de/photo/brume-sur-la-loire')).body);
  assert.match(de, /Eine veröffentlichte Übersetzung/);
  assert.match(de, new RegExp(`href="/de/carnet/${translated.slug}"`));
  const fr = related((await visitor(c)('/photo/brume-sur-la-loire')).body);
  assert.match(fr, new RegExp(`href="/carnet/${frOnly.slug}"`));
  assert.doesNotMatch(fr, /Autre récit public/);
});

test('référencement : le maillage est borné aux six derniers récits éligibles dans l’ordre du modèle', async t => {
  const c = await setup(t, { seeded: true });
  c.app.publicVersion.save('v2');
  const posts = [];
  for (let i = 0; i < 8; i++) posts.push(await billet(c, { title: `Récit de démonstration ${i}`, body: 'photo:brume-sur-la-loire', at: Date.parse(`2026-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`) }));
  const block = related((await visitor(c)('/photo/brume-sur-la-loire')).body);
  assert.equal((block.match(/href="\/carnet\//g) || []).length, 6);
  assert.doesNotMatch(block, /Récit de démonstration 0|Récit de démonstration 1/);
  const seen = [...block.matchAll(/href="\/carnet\/([^"/]+)"/g)].map(m => m[1]);
  assert.deepEqual(seen, posts.slice(-6).reverse().map(p => p.slug));
});

test('référencement : l’aperçu d’un administrateur ne publie pas le maillage d’une rubrique restée en v1', async t => {
  const c = await setup(t, { seeded: true });
  const post = await billet(c, { title: 'Un récit encore hors du site public', body: 'photo:brume-sur-la-loire' });
  const admin = as(c, { sub: 'seo-contents-admin', roles: ['admin'] });
  assert.equal((await admin.post('/admin/apparence/apercu-v2', { vue: 'v2', vers: '/photo/brume-sur-la-loire' })).statusCode, 303);
  const preview = await admin.get('/photo/brume-sur-la-loire');
  assert.equal(preview.statusCode, 200);
  assert.match(preview.body, /css\/v2\/public\.css/);
  assert.equal(related(preview.body), '');
  assert.doesNotMatch(preview.body, new RegExp(post.slug));
  assert.equal(related((await visitor(c)('/photo/brume-sur-la-loire')).body), '');
  c.app.publicVersion.save('v2');
  assert.match(related((await visitor(c)('/photo/brume-sur-la-loire')).body), new RegExp(post.slug));
});

test('référencement : un voyage public mène aux billets publics qui le citent et perd ce maillage en aperçu', async t => {
  const c = await setup(t, { seeded: true });
  c.app.publicVersion.save('v2');
  const tr = await trip(c);
  const visible = await billet(c, { title: 'Le récit du voyage', body: 'Un récit de démonstration.', extra: { trip_id: tr.id } });
  const privatePost = await billet(c, { title: 'Récit privé du voyage', body: `Voir [le voyage](voyage:${tr.id}).` });
  c.db.prepare("UPDATE posts SET visibility = 'prive' WHERE id = ?").run(privatePost.id);
  const page = await visitor(c)(`/voyage/${tr.slug}`);
  assert.equal(page.statusCode, 200);
  assert.match(related(page.body), new RegExp(`href="/carnet/${visible.slug}"`));
  assert.doesNotMatch(page.body, /Récit privé du voyage/);
  c.app.trips.update(tr.id, { public: false });
  assert.equal((await visitor(c)(`/voyage/${tr.slug}`)).statusCode, 404);
  const admin = as(c, { sub: 'seo-trip-admin', roles: ['admin'] });
  const preview = await admin.get(`/voyage/${tr.slug}`);
  assert.equal(preview.statusCode, 200);
  assert.match(preview.headers['x-robots-tag'] || '', /noindex/);
  assert.equal(related(preview.body), '');
});
