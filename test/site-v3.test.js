import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { as, billet, visitor } from './carnet-helpers.js';

// Site public v3 (server/version-publique.js, docs/maquettes-v3) : les pages de la v2, redessinées par css/v3/v3.css ;
// l'accueil en plein cadre (views/v3/_ouverture.eta) et les regards par l'image (views/v3/_regards.eta). Réglage pour
// tous dans Apparence, vue de session pour l'administrateur ; Carnets ouverts comme en v2 ; galeries privées inchangées ;
// aucun bouton d'achat.
const PHOTO = '/photo/brume-sur-la-loire';
const V3CSS = /css\/v3\/v3\.css/;
const isV2Page = body => /css\/v2\/public\.css/.test(body);

async function site(t) {
  const c = await setup(t, { seeded: true });
  return { ...c, admin: (sub = 'v3-admin') => as(c, { sub, roles: ['admin'] }), see: visitor(c) };
}

test('réglage v3 : les gabarits v2 et la feuille v3 pour tous ; la v2 et la v1 ne la chargent pas', async t => {
  const c = await site(t);
  for (const [v, v3css, v2page] of [['v1', false, false], ['v2', false, true], ['v3', true, true]]) {
    c.app.publicVersion.save(v);
    for (const url of ['/', PHOTO, '/a-propos', '/en/', '/de/recherche']) {
      const res = await c.see(url);
      assert.equal(res.statusCode, 200, `${v} ${url}`);
      assert.equal(V3CSS.test(res.body), v3css, `${v} ${url} : feuille v3`);
      assert.equal(isV2Page(res.body), v2page, `${v} ${url} : gabarits v2`);
      assert.equal(res.headers['cache-control'], undefined, `${v} ${url} : pas de « private » pour un visiteur`);
    }
  }
});

test('accueil v3 : plein cadre, en-tête posé sur la photo, promesse en H1 ensuite, diaporama à l’arrêt', async t => {
  const c = await site(t);
  c.app.publicVersion.save('v3');
  const body = (await c.see('/')).body;
  assert.match(body, /<header class="sh sh--site sh--sur-photo">/);
  assert.match(body, /<section class="plein fmt-[\dx]+" aria-labelledby="ouv-cartel"[^>]*data-ouverture>/);
  assert.match(body, /<picture class="plein-pic(?: plein-pic--entiere)?">/);
  assert.match(body, /fetchpriority="high"/);
  assert.doesNotMatch(body, /class="wrap ouverture-zone"/);
  // H1 unique, après la photo ; points À L'ARRÊT (premier pressé), « Lire », position écrite.
  assert.equal((body.match(/<h1\b/g) || []).length, 1);
  assert.ok(body.indexOf('class="promesse-h1"') > body.indexOf('data-ouverture'));
  assert.match(body, /aria-pressed="true"[^>]*data-ouv-point="0"/);
  assert.match(body, /data-ouv-pos>1 \/ \d+<\/p>/);
  assert.match(body, /data-ouv-lire/);
  // La galerie (ancre #galerie) et les séries restent.
  assert.match(body, /id="galerie"/);
  assert.match(body, /id="series"/);
  // Ailleurs que l'accueil, l'en-tête reste dans le flux.
  assert.doesNotMatch((await c.see('/a-propos')).body, /sh--sur-photo/);
  assert.doesNotMatch((await c.see('/?regard=julien')).body, /sh--sur-photo|class="plein"/);
});

test('accueil v3 : les regards par l’image (deux photographes, trois horizontales chacun), sinon la liste de la v2', async t => {
  const c = await site(t);
  c.app.publicVersion.save('v3');
  const hz = c.db.prepare(`SELECT a.slug, COUNT(*) n FROM photos p JOIN authors a ON a.id = p.author_id
    WHERE p.status = 'published' AND p.width * 1.0 / p.height >= 1.2 GROUP BY a.slug`).all();
  const cartes = hz.length === 2 && hz.every(r => r.n >= 3);
  const body = (await c.see('/')).body;
  const section = body.slice(body.indexOf('id="regards"'), body.indexOf('</section>', body.indexOf('id="regards"')));
  if (cartes) {
    assert.equal((section.match(/<li class="regard">/g) || []).length, 3);
    assert.match(section, /<h3 class="regard-n"><a href="\/galerie">/);
    assert.match(section, /<a href="\/(?:auteur\/[a-z-]+|\?regard=[a-z-]+)#filtres">/);
    assert.equal((section.match(/<picture/g) || []).length, 6);
  } else {
    assert.match(section, /<ul class="liste-liens"/);
  }
  // En v2, toujours la liste.
  c.app.publicVersion.save('v2');
  const v2 = (await c.see('/')).body;
  assert.match(v2.slice(v2.indexOf('id="regards"')), /<ul class="liste-liens"/);
  assert.doesNotMatch(v2, /class="regards"|class="plein"|sh--sur-photo/);
});

test('v3 : aucun bouton d’achat, ni « Tirages », ni panier', async t => {
  const c = await site(t);
  c.app.publicVersion.save('v3');
  for (const url of ['/', PHOTO, '/a-propos', '/recherche', '/en/', '/de/']) {
    const body = (await c.see(url)).body;
    assert.doesNotMatch(body, /\/tirages|\/panier|Tirage\s*:|à partir de \d|Warenkorb|class="sh-panier/, url);
  }
});

test('Carnets : ouverts en v3 comme en v2, introuvables en v1', async t => {
  const c = await site(t);
  await billet(c);
  for (const [v, code] of [['v1', 404], ['v2', 200], ['v3', 200]]) {
    c.app.publicVersion.save(v);
    assert.equal((await c.see('/carnet')).statusCode, code, v);
  }
  c.app.publicVersion.save('v3');
  assert.match((await c.see('/carnet')).body, V3CSS);
});

test('administrateur : vue v3 pour lui seul, boutons vers les huit autres compositions ; journal d’audit', async t => {
  const c = await site(t);
  const a = c.admin();
  assert.equal((await a.post('/admin/apparence/apercu-v2', { vue: 'v3', vers: PHOTO })).statusCode, 303);
  const page = await a.get(PHOTO);
  assert.match(page.body, V3CSS);
  assert.equal(page.headers['cache-control'], 'private, no-store');
  const aside = page.body.slice(page.body.indexOf('<aside class="vue-site'), page.body.indexOf('</aside>') + 8);
  assert.match(aside, /vue-site--forcee/);
  assert.deepEqual([...aside.matchAll(/name="vue" value="([^"]+)"><input type="hidden" name="vers" value="[^"]*"><button class="vue-site-b" type="submit">([^<]+)</g)].map(m => [m[1], m[2]]),
    [['v2', 'Voir en v2'], ['suivre', 'Voir en v1'], ['obscura', 'Voir en Obscura'], ['panoramique', 'Voir en Panoramique'],
      ['contact', 'Voir en Contact'], ['resonances', 'Voir en Résonances'], ['itinerance', 'Voir en Itinérance'], ['hors-cadre', 'Voir en Hors cadre']]);
  assert.ok(c.db.prepare("SELECT 1 FROM audit_log WHERE detail = 'vue de la session : v3 (visiteurs : v1)'").get());
  // Le visiteur, en même temps : la v1.
  assert.doesNotMatch((await c.see(PHOTO)).body, V3CSS);
});

test('Apparence : la v3 se choisit pour tous, le changement est noté ; une valeur inconnue est ignorée', async t => {
  const c = await site(t);
  const a = c.admin();
  let page = (await a.get('/admin/apparence')).body;
  assert.match(page, /<input type="radio" name="site_public" value="v3">/);
  assert.match(page, /Voir le site en v3/);
  assert.equal((await a.post('/admin/apparence', { site_public: 'v3' })).statusCode, 303);
  assert.equal(c.app.publicVersion.setting(), 'v3');
  assert.ok(c.db.prepare("SELECT 1 FROM audit_log WHERE detail = 'site public : v1 → v3'").get());
  page = (await a.get('/admin/apparence')).body;
  assert.match(page, /<input type="radio" name="site_public" value="v3" checked>/);
  assert.match(page, /La v3 est appliquée/);
  assert.match((await c.see('/')).body, V3CSS);
  await a.post('/admin/apparence', { site_public: 'v4' });
  assert.equal(c.app.publicVersion.setting(), 'v3');
  const { translator } = await import('../server/admin-i18n.js');
  for (const l of ['en', 'de']) for (const k of ['Site public : v1, v2 ou v3', 'la v2 redessinée, photo en plein cadre', 'La v3 est appliquée : tous les visiteurs la voient.']) {
    assert.notEqual(translator(l)(k), k, `${l} : ${k}`);
  }
});

test('galeries privées : leur dessin ne change pas en v3', async t => {
  const c = await site(t);
  c.app.publicVersion.save('v3');
  const sp = c.app.spaces;
  const authorId = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const id = sp.createSpace({ title: 'Lisbonne et Porto', closes: new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10) }, { authorId, by: 'test' });
  sp.addPhotos(id, c.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 2").pluck().all());
  sp.setState(id, 'ouverte', null);
  const inv = await sp.createInvite(id, { label: 'Lucie', lang: 'fr', expires: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), favoris: '1' }, { by: 'test', request: null });
  const res = await c.see(`/g/${inv.token}`);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /css\/v2\/prive\.css/);
  assert.doesNotMatch(res.body, V3CSS);
});
