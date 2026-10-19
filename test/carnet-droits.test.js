import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { as, billet, visitor, setV2 } from './carnet-helpers.js';
import { ROLES, ADJUSTABLE, PERMISSIONS, grantsOf } from '../server/permissions.js';

// Carnets, les droits (étude B41, B42 ; « Permissions et contrôle des rôles » du registre de la Vigie) : permissions
// carnet.* avec leur portée, rôles de départ, droits réglables par photographe ; portée « les miennes » : un billet est au
// compte si l'un de ses auteurs est son photographe ; celui d'un autre n'existe pas (404), même par l'adresse ; un droit
// absent est refusé (403) ; chaque écriture exige le jeton CSRF.

test('permissions et rôles : carnet.* déclarées avec leur portée, réparties par rôle, deux droits réglables', () => {
  for (const p of ['carnet.voir', 'carnet.ecrire', 'carnet.publier', 'carnet.publies.modifier']) assert.equal(PERMISSIONS[p]?.scoped, true, p);
  assert.ok(PERMISSIONS['carnet.textes'] && !PERMISSIONS['carnet.textes'].scoped);
  assert.ok(!Object.keys(PERMISSIONS).some(p => p.startsWith('journal.') && p !== 'journal.voir'), 'jamais « journal » pour les Carnets');
  const g = r => Object.fromEntries([...grantsOf([r])].filter(([k]) => k.startsWith('carnet.')));
  assert.deepEqual(g('photographe'), { 'carnet.voir': 'les miennes', 'carnet.ecrire': 'les miennes', 'carnet.publies.modifier': 'les miennes' });
  assert.deepEqual(g('moderateur'), { 'carnet.voir': 'tout', 'carnet.publier': 'tout' });
  assert.deepEqual(g('relecteur'), { 'carnet.voir': 'tout', 'carnet.textes': 'tout', 'carnet.publies.modifier': 'tout' });
  assert.equal(Object.keys(g('admin')).length, 5);
  assert.ok(ADJUSTABLE['carnet.publier'] && ADJUSTABLE['carnet.publies.modifier']);
  // Réglé photographe par photographe : publier ses billets sans validation (sur les siens seulement).
  assert.equal(grantsOf(['photographe'], { add: ['carnet.publier'] }).get('carnet.publier'), 'les miennes');
  assert.equal(grantsOf(['photographe'], { remove: ['carnet.publies.modifier'] }).get('carnet.publies.modifier'), undefined);
  assert.ok(ROLES.moderateur.perms['carnet.publier']);
});

test('portée « les miennes » : le photographe ne voit que ses billets (et ceux qu’il cosigne) ; celui de l’autre est introuvable sous toutes ses adresses', async t => {
  const c = await setup(t, { seeded: true });
  const seb = as(c, { sub: 'z-seb', name: 'Sébastien', roles: ['photographe'], author: 'sebastien' });
  const mine = await billet(c, { title: 'Le mien', authors: ['sebastien'], publish: false });
  const both = await billet(c, { title: 'À deux voix', authors: ['julien', 'sebastien'], publish: false });
  const other = await billet(c, { title: 'Celui de Julien', authors: ['julien'], publish: false });
  const list = (await seb.get('/admin/carnet')).body;
  assert.match(list, /Le mien/);
  assert.match(list, /À deux voix/);
  assert.doesNotMatch(list, /Celui de Julien/);
  for (const url of [`/admin/carnet/${other.id}`, `/admin/carnet/${other.id}/versions`, `/admin/carnet/${other.id}/photos/1`, `/admin/carnet/${other.id}/supprimer`, `/admin/carnet/${other.id}/photos.json`])
    assert.equal((await seb.get(url)).statusCode, 404, url);
  for (const [url, payload] of [[`/admin/carnet/${other.id}`, { title: 'Volé' }], [`/admin/carnet/${other.id}/proposer`, {}], [`/admin/carnet/${other.id}/supprimer`, {}], [`/admin/carnet/${other.id}/brouillon/ecarter`, {}]])
    assert.equal((await seb.post(url, payload)).statusCode, 404, url);
  assert.equal((await seb.json(`/admin/carnet/${other.id}/brouillon`, { body: 'x' })).statusCode, 404);
  assert.equal((await seb.json(`/admin/carnet/${other.id}/apercu`, { body: 'x' })).statusCode, 404);
  assert.equal(c.app.carnet.get(other.id).title, 'Celui de Julien');
  for (const p of [mine, both]) assert.equal((await seb.get(`/admin/carnet/${p.id}`)).statusCode, 200);
  // Il reste signataire d'un billet qu'il règle : retirer sa signature ne le lui fait pas perdre.
  await seb.post(`/admin/carnet/${both.id}`, { langue: 'fr', authors_set: '1', authors: [String(c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get())] });
  assert.equal(c.app.carnet.get(both.id).authors.length, 2);
  // L'aperçu public d'un billet non publié (v2) : pour l'équipe et dans sa portée seulement.
  setV2(c);
  assert.equal((await seb.get('/carnet/le-mien')).statusCode, 200);
  assert.equal((await seb.get('/carnet/celui-de-julien')).statusCode, 404);
  assert.equal((await visitor(c)('/carnet/le-mien')).statusCode, 404);
});

test('droits refusés : photographe sans « publier » (403), relecteur qui corrige les textes mais ne règle rien, billet en ligne sans « modifier les billets publiés »', async t => {
  const c = await setup(t, { seeded: true });
  const seb = as(c, { sub: 'z-seb', name: 'Sébastien', roles: ['photographe'], author: 'sebastien' });
  const rel = as(c, { sub: 'z-rel', name: 'Relectrice', roles: ['relecteur'] });
  const mod = as(c, { sub: 'z-mod', name: 'Modératrice', roles: ['moderateur'] });
  const p = await billet(c, { title: 'Brouillon de Sébastien', authors: ['sebastien'], publish: false });
  assert.equal((await seb.post(`/admin/carnet/${p.id}/publier`, { quand: 'maintenant' })).statusCode, 403);
  assert.equal((await seb.post(`/admin/carnet/${p.id}`, { faire: 'publier' })).statusCode, 403);
  assert.equal((await seb.post(`/admin/carnet/${p.id}/retirer`, { reason: 'x' })).statusCode, 403);
  // Le relecteur corrige le texte, pas la rubrique ni les signatures ; il ne crée pas de billet.
  assert.equal((await rel.post(`/admin/carnet/${p.id}`, { langue: 'fr', dek: 'Chapô relu.' })).statusCode, 303);
  assert.equal(c.app.carnet.get(p.id).dek, 'Chapô relu.');
  assert.equal((await rel.post(`/admin/carnet/${p.id}`, { langue: 'fr', rubrique: 'atelier' })).statusCode, 403);
  assert.equal(c.app.carnet.get(p.id).rubrique, 'voyages');
  assert.equal((await rel.post('/admin/carnet', { title: 'Nouveau' })).statusCode, 403);
  // La modératrice publie, mais n'écrit pas.
  assert.equal((await mod.post(`/admin/carnet/${p.id}`, { langue: 'fr', body: 'Réécrit.' })).statusCode, 403);
  // En ligne : un photographe privé de « modifier ses billets publiés » ne le change plus.
  const q = await billet(c, { title: 'En ligne', authors: ['sebastien'] });
  const sebSans = as(c, { sub: 'z-seb', name: 'Sébastien', roles: ['photographe'], adjust: { add: [], remove: ['carnet.publies.modifier'] } });
  const r = await sebSans.post(`/admin/carnet/${q.id}`, { langue: 'fr', body: 'Changé en ligne.' });
  assert.equal(r.statusCode, 303);
  assert.notEqual(c.app.carnet.get(q.id).body, 'Changé en ligne.');
  assert.match(decodeURIComponent(String(r.headers['set-cookie'])), /modifier les billets publiés/);
  // Avec le droit (rôle de départ), si.
  c.db.prepare("UPDATE accounts SET adjust = '{}' WHERE sub = 'z-seb'").run();
  await seb.post(`/admin/carnet/${q.id}`, { langue: 'fr', body: 'Changé en ligne.' });
  assert.equal(c.app.carnet.get(q.id).body, 'Changé en ligne.');
});

test('chaque route des Carnets déclare sa permission ; chaque écriture exige le jeton CSRF ; un compte sans rôle n’ouvre rien', async t => {
  const c = await setup(t, { seeded: true });
  const routes = c.app.routeList.filter(r => r.url.startsWith('/admin/carnet'));
  assert.ok(routes.length >= 20, `${routes.length} routes`);
  assert.ok(routes.every(r => r.perm && r.perm.startsWith('carnet.') || r.perm === 'reglages.droits'), JSON.stringify(routes.filter(r => !r.perm)));
  const adm = as(c, { sub: 'z-adm', name: 'Admin', roles: ['admin'] });
  const p = await billet(c, { publish: false });
  for (const url of [`/admin/carnet/${p.id}`, `/admin/carnet/${p.id}/proposer`, `/admin/carnet/${p.id}/publier`, `/admin/carnet/${p.id}/supprimer`, '/admin/carnet', '/admin/carnet/reglages']) {
    const r = await c.app.inject({ method: 'POST', url, cookies: adm.cookies, headers: { accept: 'text/html' }, payload: { title: 'x', faire: 'publier' } });
    assert.equal(r.statusCode, 403, url);
  }
  assert.ok(c.app.carnet.get(p.id));
  assert.equal(c.app.carnet.get(p.id).state, 'brouillon');
  const none = await c.app.inject({ url: '/admin/carnet' });
  assert.ok([302, 303, 401].includes(none.statusCode), String(none.statusCode));
});

test('menu de l’admin : « Carnets » pour qui voit les billets, groupe Publier ; l’entrée « Sécurité » et la barre restent', async t => {
  const c = await setup(t, { seeded: true });
  const adm = as(c, { sub: 'z-adm', name: 'Admin', roles: ['admin'] });
  const seb = as(c, { sub: 'z-seb', name: 'Sébastien', roles: ['photographe'], author: 'sebastien' });
  const page = (await adm.get('/admin')).body;
  assert.match(page, /<a href="\/admin\/carnet"[^>]*>[\s\S]{0,400}Carnets<\/a>/);
  assert.ok(page.indexOf('/admin/carnet"') > page.indexOf('nav-publish'), 'dans le groupe Publier');
  assert.match((await seb.get('/admin')).body, /href="\/admin\/carnet"/);
  assert.match((await adm.get('/admin/carnet')).body, /aria-current="page"[^>]*>[\s\S]{0,300}Carnets/);
});
