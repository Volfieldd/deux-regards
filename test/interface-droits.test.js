import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Rôles et permissions, étape 4 : l'interface ne propose que ce qui est permis (photothèque, fiche, aide), le
// modérateur et le relecteur corrigent les textes depuis la fiche, et le modérateur adresse des remarques au
// photographe, qui les retrouve dans « Aujourd'hui ».
async function accounts(t) {
  const ctx = await setup(t, { seeded: true });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const as = (sub, roles, authorId = null) => {
    ctx.app.accounts.ensure({ sub, name: sub, roles });
    if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    return {
      get: url => ctx.app.inject({ url, cookies: { session: token }, headers: { accept: 'text/html' } }).then(r => r.body),
      post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
    };
  };
  const photo = ctx.db.prepare('SELECT * FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').get(seb);
  return { ...ctx, seb, photo, mod: as('marc', ['moderateur']), rel: as('rita', ['relecteur']), ph: as('seb', ['photographe'], seb) };
}

test('photothèque : boutons et glisser selon les droits ; droits transmis à la page', async t => {
  const c = await accounts(t);
  const mod = await c.mod.get('/admin/photos');
  assert.match(mod, /data-can="[^"]*photos\.publier[^"]*"/);
  assert.doesNotMatch(mod, /data-can="[^"]*photos\.supprimer/);
  assert.doesNotMatch(mod, /data-import-open|data-sortable/);
  assert.match(mod, /value="publish" data-publish>/);                          // publier : permis
  assert.match(mod, /value="delete" data-bulk-delete hidden>/);                // supprimer : masqué
  const ph = await c.ph.get('/admin/photos');
  assert.match(ph, /data-import-open/);
  assert.match(ph, /value="publish" data-publish hidden>/);
  assert.match(ph, /value="delete" data-bulk-delete>/);
  assert.doesNotMatch(ph, /data-sortable/);                                     // l'ordre touche toutes les photos
});

test('fiche : textes seuls pour le modérateur et le relecteur, sans données personnelles ; fiche du photographe sans publication', async t => {
  const c = await accounts(t);
  const url = `/admin/photos/${c.photo.id}`;
  const mod = await c.mod.get(url);
  assert.match(mod, new RegExp(`action="/admin/photos/${c.photo.id}/textes"`));
  assert.doesNotMatch(mod, new RegExp(`<form class="panel form" method="post" action="/admin/photos/${c.photo.id}" novalidate>`));
  assert.doesNotMatch(mod, /class="faces-fix"|id="rencontres"|Supprimer cette photo|\/original"/);
  assert.match(mod, /id="instagram"/);
  assert.match(mod, new RegExp(`action="/admin/photos/${c.photo.id}/status"`));
  assert.match(mod, /Remarque pour le photographe/);
  // Enregistrer un texte : oui ; changer la série par ce formulaire : ignoré.
  const other = c.db.prepare('SELECT id FROM categories WHERE id != ? LIMIT 1').pluck().get(c.photo.category_id);
  await c.mod.post(`${url}/textes`, { title: 'Titre relu', legend: 'Légende relue', category_id: String(other) });
  assert.deepEqual(c.db.prepare('SELECT title, legend, category_id FROM photos WHERE id = ?').get(c.photo.id), { title: 'Titre relu', legend: 'Légende relue', category_id: c.photo.category_id });
  // Relecteur : textes, sans publication, sans Instagram ni remarques.
  const rel = await c.rel.get(url);
  assert.match(rel, /\/textes"/);
  assert.doesNotMatch(rel, new RegExp(`action="/admin/photos/${c.photo.id}/status"|id="instagram"|Remarque pour le photographe`));
  // Photographe : la fiche complète, sans le choix du statut ni Instagram ; supprimer et l'original : permis.
  const ph = await c.ph.get(url);
  assert.match(ph, /name="status" value="(draft|published)">\s*<p class="hint">Statut :/);
  assert.doesNotMatch(ph, /type="radio" name="status"|id="instagram"/);
  assert.match(ph, /Supprimer cette photo/);
});

test('remarques : le modérateur écrit, le photographe la voit dans Aujourd’hui et la marque faite', async t => {
  const c = await accounts(t);
  const url = `/admin/photos/${c.photo.id}`;
  assert.equal((await c.ph.post(`${url}/remarques`, { message: 'Je ne peux pas.' })).statusCode, 403);
  assert.equal((await c.mod.post(`${url}/remarques`, { message: 'La légende parle de la Loire : c’est l’Erdre.' })).statusCode, 303);
  const home = await c.ph.get('/admin');
  assert.match(home, /Remarque de marc sur « [^»]+ »/);
  assert.match(home, /c’est l’Erdre/);
  assert.match(await c.ph.get(url), /id="remarques" open/);
  const note = c.db.prepare('SELECT id FROM photo_notes').pluck().get();
  assert.equal((await c.rel.post(`/admin/remarques/${note}/fait`)).statusCode, 403);   // ni la sienne, ni le droit d'en adresser
  await c.ph.post(`/admin/remarques/${note}/fait`);
  assert.doesNotMatch(await c.ph.get('/admin'), /Remarque de marc/);
  assert.ok(c.db.prepare('SELECT done_at FROM photo_notes WHERE id = ?').pluck().get(note));
  // Vide : refusé avec un message.
  assert.equal((await c.mod.post(`${url}/remarques`, { message: '  ' })).statusCode, 303);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM photo_notes').pluck().get(), 1);
});

test('aide : seulement les chapitres des pages que le compte peut ouvrir', async t => {
  const c = await accounts(t);
  const ph = await c.ph.get('/admin/aide');
  assert.match(ph, /id="photos"/);
  assert.match(ph, /id="rencontres"/);
  assert.doesNotMatch(ph, /id="instagram"|id="series"|id="apparence"|id="auteurs"/);
  const mod = await c.mod.get('/admin/aide');
  assert.match(mod, /id="instagram"/);
  assert.doesNotMatch(mod, /id="rencontres"/);
});
