import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setup } from './helpers.js';

// Droits des personnes (RGPD) : demande depuis /bonjour (délai d'un mois), export de leurs données, effacement
// (photos comprises sur demande), refus gardé sans identité.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function ctxOf(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = o => ctx.app.inject({ ...o, cookies: { ...cookies, ...o.cookies } });
  const post = (url, payload = {}) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  const hello = payload => ctx.app.inject({ method: 'POST', url: '/bonjour', payload, remoteAddress: '203.0.113.20' });
  const enc = ref => ctx.db.prepare('SELECT * FROM encounters WHERE ref IS ?').get(ref);
  const photo = slug => ctx.db.prepare('SELECT * FROM photos WHERE slug = ?').get(slug);
  return { ...ctx, as, post, hello, enc, photo, cookies };
}

test('demande sur ses données depuis /bonjour : accès (adresse exigée) ou effacement ; délai d’un mois affiché', async t => {
  const c = await ctxOf(t);
  assert.match((await c.app.inject('/bonjour')).body, /Recevoir une copie de toutes mes données/);
  let r = await c.hello({ ref: 'J-0142', rights: 'acces' });
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /Indiquez votre e-mail/);
  r = await c.hello({ ref: 'J-0142', rights: 'effacement' });
  assert.equal(r.statusCode, 303);
  const e = c.enc('J-0142');
  assert.equal(e.rights_request, 'effacement');
  assert.ok(e.rights_requested_at);
  const list = (await c.as({ url: '/admin/rencontres' })).body;
  assert.match(list, /Demande d’effacement · avant le/);
  const detail = (await c.as({ url: `/admin/rencontres/${e.id}` })).body;
  assert.match(detail, /Demande <strong>d’effacement<\/strong>/);
  assert.match(detail, /Référence non vérifiée : assurez-vous que la demande vient bien de cette personne/);
  assert.match(detail, /<details class="danger" open>/);                                    // formulaire d'effacement déplié
  assert.equal((await c.post(`/admin/rencontres/${e.id}/droits-traites`)).statusCode, 303);
  assert.ok(c.enc('J-0142').rights_done_at);
  assert.doesNotMatch((await c.as({ url: '/admin/rencontres' })).body, /Demande d’effacement · avant le/);
});

test('export : archive ZIP avec toutes ses données, sa signature et les photos liées ; réservé aux admins', async t => {
  const c = await ctxOf(t);
  await c.hello({ ref: 'J-0142', wants_photo: 'on', adult: 'oui', email: 'alice@exemple.fr', name: 'Alice', message: 'Merci !' });
  const e = c.enc('J-0142');
  c.db.prepare('UPDATE encounters SET signature_png = ? WHERE id = ?').run(Buffer.from('\x89PNG fausse signature'), e.id);
  await c.post(`/admin/rencontres/${e.id}/photos`, { photo: String(c.photo('quai-7h12').id) });
  const r = await c.as({ url: `/admin/rencontres/${e.id}/export.zip` });
  assert.equal(r.headers['content-type'], 'application/zip');
  assert.match(r.headers['content-disposition'], /attachment; filename="test-donnees-j-0142\.zip"/);
  const zip = r.rawPayload;
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const text = zip.toString('latin1');
  for (const name of ['LISEZMOI.txt', 'donnees.json', 'signature.png', 'photos/quai-7h12.jpg']) assert.ok(text.includes(name), name);
  assert.match(zip.toString('utf8'), /"reference": "J-0142",\n\s+"photographe": "Julien"/);
  assert.match(zip.toString('utf8'), /"email": "alice@exemple\.fr"/);
  assert.match(zip.toString('utf8'), /"message": "Merci !"/);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM encounter_events WHERE kind = 'export'").pluck().get(), 1);
  assert.notEqual((await c.app.inject(`/admin/rencontres/${e.id}/export.zip`)).statusCode, 200);
});

test('effacement : rencontre effacée ; refus gardé sans identité si des photos restent ; photos supprimées sur demande', async t => {
  const c = await ctxOf(t);
  // Sans refus : tout disparaît.
  await c.hello({ ref: 'J-0001', wants_photo: 'on', adult: 'oui', email: 'a@exemple.fr' });
  assert.equal((await c.post(`/admin/rencontres/${c.enc('J-0001').id}/effacer`)).statusCode, 303);
  assert.equal(c.enc('J-0001'), undefined);
  // Refus et photo gardée : trace anonyme, publication toujours impossible.
  await c.hello({ ref: 'J-0002', decision: 'refus', email: 'b@exemple.fr', message: 'Non merci' });
  const id = c.enc('J-0002').id;
  const quai = c.photo('quai-7h12');
  await c.post(`/admin/rencontres/${id}/photos`, { photo: String(quai.id) });
  await c.post(`/admin/rencontres/${id}/liens`, { photo_id: quai.id });
  await c.post(`/admin/rencontres/${id}/effacer`);
  const anon = c.db.prepare('SELECT * FROM encounters WHERE id = ?').get(id);
  assert.deepEqual([anon.ref, anon.email, anon.name, anon.refused, anon.anonymized, anon.status], [null, '', '', 1, 1, 'traitee']);
  assert.deepEqual(c.db.prepare('SELECT kind FROM encounter_events WHERE encounter_id = ?').pluck().all(id), ['anonymise']);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounter_shares').pluck().get(), 0);
  const edit = await c.post(`/admin/photos/${quai.id}`, { title: quai.title, slug: quai.slug, category_id: quai.category_id, author_id: quai.author_id, status: 'published' });
  assert.equal(edit.statusCode, 422);                                                      // le refus tient toujours
  assert.match((await c.as({ url: `/admin/rencontres/${id}` })).body, /<h1 class="enc-title">Refus anonymisé<\/h1>/);
  // Avec les photos : originaux supprimés, rappel des posts Instagram à retirer à la main.
  await c.hello({ ref: 'J-0003', decision: 'refus' });
  const id3 = c.enc('J-0003').id;
  const brume = c.photo('brume-sur-la-loire');
  await c.post(`/admin/rencontres/${id3}/photos`, { photo: String(brume.id) });
  c.db.prepare("INSERT INTO instagram_posts (photo_id, status, frame, permalink, created_at, published_at) VALUES (?, 'published', 'white', 'https://www.instagram.com/p/xyz/', 0, 0)").run(brume.id);
  const original = path.join(c.config.storageDir, 'originals', brume.file);
  assert.ok(fs.existsSync(original));
  const r = await c.post(`/admin/rencontres/${id3}/effacer`, { photos: 'on' });
  assert.equal(r.statusCode, 303);
  assert.equal(c.photo('brume-sur-la-loire'), undefined);
  assert.equal(fs.existsSync(original), false);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounters WHERE id = ?').pluck().get(id3), 0);  // plus de photo liée : rien à garder
  const flash = (await c.as({ url: '/admin/rencontres', cookies: cookiesOf(r) })).body;
  assert.match(flash, /1 photo supprimée \(effacée des sauvegardes sous 90 jours\)/);
  assert.match(flash, /Encore sur Instagram, à supprimer dans l’application/);
  assert.match(flash, /https:\/\/www\.instagram\.com\/p\/xyz\//);
});
