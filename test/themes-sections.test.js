import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { as, billet, visitor } from './carnet-helpers.js';
import { DESIGNS, sectionOf } from '../server/designs.js';
import { createPublicVersion } from '../server/version-publique.js';

async function world(t) {
  const c = await setup(t, { seeded: true });
  const admin = as(c, { sub: 'themes-admin', roles: ['admin'] });
  const post = await billet(c, { title: 'Le temps du regard', body: '## Regarder\n\nphoto:brume-sur-la-loire\n\n## Revenir\n\nUne seconde lecture.' });
  return { ...c, admin, post, visit: visitor(c) };
}
const save = (c, body) => c.admin.post('/admin/apparence/compositions', body);

test('thème général et exceptions : rendu, héritage, persistance et retour aux réglages historiques', async t => {
  const c = await world(t);
  assert.equal(c.app.publicVersion.designSettings(), null);
  assert.equal((await save(c, { default: 'obscura', section_accueil: 'v1', section_carnets: 'resonances' })).statusCode, 303);
  assert.deepEqual(JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'public_design'").pluck().get()), { default: 'obscura', sections: { accueil: 'v1', carnets: 'resonances' } });
  const restarted = createPublicVersion({ db: c.db, viewsDir: 'views' });
  assert.equal(restarted.forRequest({ url: '/en/carnet' }).design, 'resonances');
  const home = await c.visit('/');
  assert.doesNotMatch(home.body, /chambre-noire.css/);
  assert.match(home.body, /href="\/carnet"/);
  assert.match(home.body, /href="\/galerie"/);
  for (const url of ['/carnet', `/carnet/${c.post.slug}`, '/de/carnet', `/en/carnet/${c.post.slug}/partager`]) {
    const r = await c.visit(url); assert.equal(r.statusCode, 200, url); assert.match(r.body, /data-composition="resonances"/, url);
  }
  const photo = await c.visit(`/photo/brume-sur-la-loire?carnet=${c.post.slug}`);
  assert.equal(photo.statusCode, 200); assert.match(photo.body, /data-composition="obscura"/);
  assert.match(photo.body, new RegExp(`/carnet/${c.post.slug}`));
  assert.match((await c.visit('/galerie')).body, /data-composition="obscura"/);
  assert.match((await c.visit('/sitemap.xml')).body, /carnet\/le-temps-du-regard/);
  assert.equal((await c.visit('/carnet/flux.xml')).statusCode, 200);
  await save(c, { default: 'contact', section_accueil: 'v1', section_carnets: 'inherit' });
  assert.match((await c.visit('/carnet')).body, /data-composition="contact"/);
  assert.equal(c.app.publicVersion.setting(), 'v1', 'ancien réglage conservé');
  assert.doesNotMatch((await c.admin.get('/admin/carnet')).body, /Les Carnets n’existent que dans la version 2/);
  await save(c, { reset: '1' });
  assert.equal(c.app.publicVersion.designSettings(), null);
  assert.equal((await c.visit('/carnet')).statusCode, 404);
  assert.equal((await c.visit('/galerie')).statusCode, 404);
  assert.match((await c.admin.get('/admin/carnet')).body, /Les Carnets n’existent que dans la version 2/);
});

test('les six thèmes servent les pages fonctionnelles ; pas de médias de maquette ni de changement dans l’admin', async t => {
  const c = await world(t);
  const urls = ['/', '/galerie', '/recherche?q=brume', '/photo/brume-sur-la-loire', '/a-propos', '/contact', '/droits', '/carnet', `/carnet/${c.post.slug}`];
  for (const [id,d] of Object.entries(DESIGNS).filter(([,d]) => d.darkroom)) {
    await save(c, { default: id });
    for (const url of urls) {
      const r = await c.visit(url); assert.equal(r.statusCode, 200, `${id} ${url}`);
      assert.match(r.body, new RegExp(`data-composition="${id}"`));
      assert.match(r.body, /css\/themes\/chambre-noire.css/);
      assert.doesNotMatch(r.body, /maquettes-v4|assets\/(maree|foret|dune|cimes)\.webp|chambre.js/);
    }
    assert.doesNotMatch((await c.admin.get('/admin')).body, /chambre-noire.css/);
  }
  await save(c, { default: 'v1' });
  assert.equal((await c.visit('/carnet')).statusCode, 200, 'les Carnets utilisent le socle V2 dans le nouveau système');
});

test('validation atomique, permission et CSRF : un thème forgé ne modifie aucun choix', async t => {
  const c = await world(t);
  await save(c, { default: 'obscura', section_carnets: 'contact' });
  const initial = c.app.publicVersion.designSettings();
  for (const body of [{ default: '../../etc/passwd' }, { default: 'constructor' }, { default: ['obscura'] },
    { default: 'contact', section_carnets: '__proto__' }, { default: 'contact', section_carnets: { id: 'obscura' } }, { default: 'contact', section_inconnue: 'v1' }]) {
    assert.equal((await save(c, body)).statusCode, 400);
    assert.deepEqual(c.app.publicVersion.designSettings(), initial);
  }
  assert.equal((await c.admin.post('/admin/apparence/compositions', { _csrf: 'faux', default: 'contact' })).statusCode, 403);
  const limited = as(c, { sub: 'no-appearance', roles: ['photographe'], author: 'julien' });
  assert.equal((await limited.post('/admin/apparence/compositions', { default: 'contact' })).statusCode, 403);
  assert.notEqual((await c.app.inject({ method: 'POST', url: '/admin/apparence/compositions', payload: { default: 'contact' } })).statusCode, 303);
  assert.deepEqual(c.app.publicVersion.designSettings(), initial);
  const forged = await c.visit('/?design=contact&theme=contact&site_public=v1');
  assert.match(forged.body, /data-composition="obscura"/);
});

test('aperçu de composition réservé à la session, sans cache partagé, réversible et sans changer les visiteurs', async t => {
  const c = await world(t);
  await save(c, { default: 'obscura', section_carnets: 'contact' });
  assert.equal((await c.admin.post('/admin/apparence/apercu-v2', { vue: 'hors-cadre', vers: '/' })).statusCode, 303);
  for (const url of ['/', '/carnet', '/de/a-propos']) {
    const r = await c.admin.get(url); assert.equal(r.statusCode, 200); assert.match(r.body, /data-composition="hors-cadre"/);
    assert.equal(r.headers['cache-control'], 'private, no-store');
  }
  assert.match((await c.visit('/carnet')).body, /data-composition="contact"/);
  await c.admin.post('/admin/apparence/apercu-v2', { vue: 'suivre', vers: '/carnet' });
  assert.match((await c.admin.get('/carnet')).body, /data-composition="contact"/);
  for (const version of ['v1','v2']) {
    await c.admin.post('/admin/version', { version, back: '/admin/apparence' });
    const r = await c.admin.get('/admin/apparence'); assert.equal(r.statusCode, 200);
    assert.match(r.body, /id="design-default"/); assert.match(r.body, /name="section_carnets"/);
  }
});

test('résolution des rubriques : langues, détails, formulaires et fichiers publics', () => {
  for (const [url,expected] of Object.entries({ '/':'accueil', '/en':'accueil', '/de/?ordre=recentes':'galerie', '/en/galerie':'galerie', '/auteur/x':'galerie', '/serie/x':'galerie', '/recherche?q=x':'galerie', '/en/photo/x/partager':'photos', '/carnet/x/partager':'carnets', '/de/carnet/flux.xml':'carnets', '/voyage/x':'voyages', '/voyages':'voyages', '/carte':'carte', '/a-propos':'regards', '/contact':'contact', '/confidentialite':'informations' })) {
    assert.equal(sectionOf({url}),expected,url);
  }
});
