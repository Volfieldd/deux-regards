import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Rôles et permissions, étape 3 : portée « les miennes ». Un compte Photographe lié à Sébastien ne voit que les
// photos, sorties et personnes de Sébastien ; ce qui est à Julien n'existe pas pour lui (404), même par l'adresse.
async function photographer(t) {
  const ctx = await setup(t, { seeded: true });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  ctx.app.accounts.ensure({ sub: 'zitadel-seb', name: 'Sébastien', roles: ['photographe'] });
  ctx.app.accounts.update(ctx.app.accounts.bySub('zitadel-seb').id, { authorId: seb }, 'test');
  const token = createSessionStore(ctx.db).create({ sub: 'zitadel-seb', name: 'Sébastien', roles: [] });
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
  const cookies = { session: token };
  const get = url => ctx.app.inject({ url, cookies, headers: { accept: 'text/html' } });
  const post = (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } });
  const json = (url, payload) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload });
  const photo = author => ctx.db.prepare('SELECT * FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').get(author);
  return { ...ctx, seb, jul, get, post, json, photo };
}

test('photos : la photothèque, la recherche, la fiche et les images ne montrent que les siennes', async t => {
  const c = await photographer(t);
  const mine = c.photo(c.seb), other = c.photo(c.jul);
  const lib = (await c.get('/admin/photos')).body;
  assert.match(lib, new RegExp(`id="photo-${mine.id}"`));
  assert.doesNotMatch(lib, new RegExp(`id="photo-${other.id}"`));
  assert.match(lib, /6 photos/);
  const search = (await c.get('/admin/recherche.json')).json();
  assert.ok(search.photos.every(p => c.db.prepare('SELECT author_id FROM photos WHERE id = ?').pluck().get(p.id) === c.seb));
  // Une photo de Julien n'existe pas pour lui, sous aucune adresse.
  for (const url of [`/admin/photos/${other.id}`, `/admin/photos/${other.id}/donnees`, `/admin/photos/${other.id}/original`, `/admin/photos/${other.id}/statistiques`]) {
    assert.equal((await c.get(url)).statusCode, 404, url);
  }
  assert.equal((await c.get(`/admin/photos/${mine.id}`)).statusCode, 200);
  // Les images de l'admin (brouillons) suivent la même règle.
  const fs = await import('node:fs');
  const variantOf = ph => fs.readdirSync(`${c.config.storageDir}/variants`).find(f => f.startsWith(ph.file.replace(/\.[^.]+$/, '')) && f.endsWith('.webp'));
  assert.ok(variantOf(mine) && variantOf(other), 'variantes présentes');
  assert.equal((await c.get(`/admin/media/${variantOf(mine)}`)).statusCode, 200);
  assert.equal((await c.get(`/admin/media/${variantOf(other)}`)).statusCode, 404);
  // Ni donner une photo à l'autre photographe, ni importer pour lui.
  assert.equal((await c.json(`/admin/photos/${mine.id}/champs`, { author_id: String(c.jul) })).statusCode, 403);
  assert.equal((await c.json(`/admin/photos/${mine.id}/champs`, { title: 'Mon titre' })).statusCode, 200);
  // Actions groupées : les photos de l'autre sont ignorées ; l'ordre de la galerie (toutes les photos) est refusé.
  const r = await c.json('/admin/photos/actions', { action: 'map_off', ids: [mine.id, other.id] });
  assert.equal(r.json().count, 1);
  assert.equal((await c.json('/admin/photos/order', { ids: [mine.id, other.id] })).statusCode, 403);
  // Supprimer une de ses photos : permis (elle reste sa propriété) ; celle de l'autre : introuvable.
  assert.equal((await c.post(`/admin/photos/${other.id}/delete`)).statusCode, 404);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM photos WHERE id = ?').pluck().get(other.id), 1);
  // Le formulaire ne propose que son photographe.
  const fiche = (await c.get(`/admin/photos/${mine.id}`)).body;
  const authorSelect = fiche.slice(fiche.indexOf('name="author_id"'), fiche.indexOf('</select>', fiche.indexOf('name="author_id"')));
  assert.match(authorSelect, new RegExp(`<option value="${c.seb}"`));
  assert.doesNotMatch(authorSelect, new RegExp(`<option value="${c.jul}"`));
});

test('sorties, personnes, terrain : seulement les siennes ; une personne partagée reste à l’administrateur', async t => {
  const c = await photographer(t);
  const enc = c.app.encounters;
  const own = enc.saveCard(null, { ref: 'S-0001', signed: 'on', scope_site: 'on', met_on: '2026-10-13', author_id: c.seb, name: 'Ana', email: 'ana@example.org' });
  const theirs = enc.saveCard(null, { ref: 'J-0001', signed: 'on', scope_site: 'on', met_on: '2026-10-12', author_id: c.jul, name: 'Bruno' });
  const sharedSeb = enc.saveCard(null, { ref: 'S-0002', signed: 'on', scope_site: 'on', met_on: '2026-10-14', author_id: c.seb, name: 'Chloé', email: 'chloe@example.org' });
  const sharedJul = enc.saveCard(null, { ref: 'J-0002', signed: 'on', scope_site: 'on', met_on: '2026-10-15', author_id: c.jul, name: 'Chloé', email: 'chloe@example.org' });
  c.app.people.sync();
  const personOf = id => c.db.prepare('SELECT person_id FROM encounters WHERE id = ?').pluck().get(id);
  c.app.people.merge(personOf(sharedSeb), personOf(sharedJul));
  // Rencontres et personnes : les siennes seulement.
  const list = (await c.get('/admin/rencontres')).body;
  assert.match(list, /S-0001/);
  assert.doesNotMatch(list, /J-0001|J-0002/);
  assert.equal((await c.get(`/admin/rencontres/${theirs}`)).statusCode, 404);
  assert.equal((await c.get(`/admin/rencontres/${own}`)).statusCode, 200);
  assert.equal((await c.get(`/admin/personnes/${personOf(theirs)}`)).statusCode, 404);
  const people = (await c.get('/admin/personnes')).body;
  assert.match(people, /Ana/);
  assert.doesNotMatch(people, /Bruno/);
  // Personne partagée : visible avec sa seule rencontre ; la modifier est refusé.
  const shared = (await c.get(`/admin/personnes/${personOf(sharedSeb)}`)).body;
  assert.match(shared, /S-0002/);
  assert.doesNotMatch(shared, /J-0002/);
  assert.match(shared, /aussi été photographiée par l’autre photographe/);
  assert.doesNotMatch(shared, /\/detacher|\/fusionner|\/rattacher|export\.zip/);
  assert.equal((await c.post(`/admin/personnes/${personOf(sharedSeb)}/detacher`, { rencontre: String(sharedSeb) })).statusCode, 403);
  // Sorties : les siennes.
  assert.equal((await c.get('/admin/sorties/julien/2026-10-12')).statusCode, 404);
  assert.equal((await c.get('/admin/sorties/sebastien/2026-10-13')).statusCode, 200);
  assert.doesNotMatch((await c.get('/admin/sorties')).body, /2026-10-12|12 octobre/);
  // Terrain : l'app et les cartes ne connaissent que son photographe.
  assert.doesNotMatch((await c.get('/admin/rencontres/cartes')).body, new RegExp(`value="${c.jul}"`));
  assert.equal((await c.post('/admin/rencontres/cartes', { author_id: String(c.jul), count: '2', from: '10' })).statusCode, 422);
  assert.equal((await c.get(`/admin/auteurs/${c.jul}/qr/vertical-noir.svg`)).statusCode, 404);
});

test('Aujourd’hui et Statistiques : ses chiffres, sans ce qui concerne tout le site', async t => {
  const c = await photographer(t);
  const home = (await c.get('/admin')).body;
  assert.doesNotMatch(home, /Mentions légales \/ Impressum à compléter/);       // réglage du site : pas pour lui
  assert.doesNotMatch(home, /Le site, en ce moment|visiteurs? aujourd’hui|href="\/admin\/series"/);
  assert.match(home, /<b>6<\/b><span>photos publiées/);
  const stats = (await c.get('/admin/statistiques')).body;
  assert.match(stats, /Vos photos : ouvertures en grand et partages/);
  assert.doesNotMatch(stats, /Fréquentation|Provenance|id="pays-title"/);
  // Un administrateur, lui, voit tout.
  const admin = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: 'jeton-de-test-0123456789' } });
  const res = await admin.app.inject({ method: 'POST', url: '/auth/local', payload: { token: 'jeton-de-test-0123456789', author: 'julien' } });
  const cookies = Object.fromEntries(res.cookies.filter(x => x.value).map(x => [x.name, x.value]));
  assert.match((await admin.app.inject({ url: '/admin', cookies })).body, /<b>12<\/b><span>photos publiées/);
});

test('compte Photographe sans photographe lié : rien n’est à lui', async t => {
  const c = await setup(t, { seeded: true });
  c.app.accounts.ensure({ sub: 'zitadel-x', name: 'X', roles: ['photographe'] });
  const token = createSessionStore(c.db).create({ sub: 'zitadel-x', roles: [] });
  const get = url => c.app.inject({ url, cookies: { session: token }, headers: { accept: 'text/html' } });
  assert.equal((await get('/admin')).statusCode, 200);
  assert.match((await get('/admin/photos')).body, /0 photo/);
  const p = c.db.prepare('SELECT id FROM photos LIMIT 1').pluck().get();
  assert.equal((await get(`/admin/photos/${p}`)).statusCode, 404);
});
