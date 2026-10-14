import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

// Page « Confidentialité » (RGPD) et durées de conservation qu'elle annonce.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

test('page Confidentialité : trois langues, responsables conjoints et contact, durées, droits ; liens depuis tout le site', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const fr = await app.inject('/confidentialite');
  assert.equal(fr.statusCode, 200);
  assert.match(fr.body, /<h1>Confidentialité<\/h1>/);
  assert.match(fr.body, /Sébastien et Julien, photographes du site Test, sont responsables ensemble \(responsables conjoints\)/);
  assert.match(fr.body, /info@nicephos\.art/);                                            // contact par défaut (migration 018)
  assert.match(fr.body, /effacée après 12 mois sans nouvelle/);
  assert.match(fr.body, /Photo de vous jointe à votre accord : conservée avec l’accord ; sans accord, effacée après 6 mois/);
  assert.match(fr.body, /une photo que nous supprimons disparaît de nos sauvegardes au bout de 90 jours/);
  assert.match(fr.body, /www\.cnil\.fr\/plaintes/);
  // Rien d'affirmé avant d'être vrai : authentification à deux facteurs et disque chiffré déclarés dans Réglages.
  assert.doesNotMatch(fr.body, /deux facteurs|disque chiffré/);
  db.prepare("INSERT INTO settings (key, value) VALUES ('privacy_mfa', 'true'), ('privacy_encrypted', 'true')").run();
  const after = (await app.inject('/confidentialite')).body;
  assert.match(after, /avec une authentification à deux facteurs/);
  assert.match(after, /stockées sur un disque chiffré/);
  assert.match((await app.inject('/en/confidentialite')).body, /are jointly responsible \(joint controllers\)/);
  assert.match((await app.inject('/de/confidentialite')).body, /gemeinsam Verantwortliche/);
  // Liens : pied de page partout, page /bonjour.
  for (const url of ['/', '/a-propos', '/en/droits', '/bonjour']) assert.match((await app.inject(url)).body, /href="(\/en)?\/confidentialite">(Confidentialité|Privacy)</, url);
  assert.match((await app.inject('/sitemap.xml')).body, /\/de\/confidentialite<\/loc>/);
});

test('réglages : contact et cases de sécurité ; l’app montre l’information dans la langue de la personne', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const page = (await ctx.app.inject({ url: '/admin/droits', cookies })).body;
  assert.match(page, /name="privacy_contact" value="info@nicephos\.art"/);
  await ctx.app.inject({ method: 'POST', url: '/admin/reglages', cookies, payload: { _csrf: csrf, privacy_contact: 'admin@nicephos.art', privacy_mfa: 'on' }, headers: { accept: 'text/html' } });
  const body = (await ctx.app.inject('/confidentialite')).body;
  assert.match(body, /admin@nicephos\.art/);
  assert.match(body, /deux facteurs/);
  assert.doesNotMatch(body, /disque chiffré/);
  const app = (await ctx.app.inject({ url: '/admin/rencontre', cookies })).body;
  assert.match(app, /Durées et droits : localhost:3000\/confidentialite/);
  assert.match(app, /Retention and rights: localhost:3000\/en\/confidentialite/);
});

test('durées de conservation : visage gardé avec l’accord (6 mois sans accord), accord gardé tant qu’une photo liée existe, puis 5 ans', async t => {
  const { app, db } = await setup(t, { seeded: true });
  const day = 864e5;
  const ins = db.prepare(`INSERT INTO encounters (ref, status, consent, consent_source, refused, portrait_jpeg, created_at, updated_at)
    VALUES (?, 'en_cours', ?, 'signature', ?, ?, ?, ?)`);
  const old = Date.now() - 200 * day;
  ins.run('J-0001', '{"site":true}', 0, Buffer.from('x'), old, old);
  ins.run('J-0004', null, 0, Buffer.from('y'), old, old);                                   // pas d'accord : visage effacé à 6 mois
  const veryOld = Date.now() - 6 * 365 * day;
  ins.run('J-0002', '{"site":true}', 0, null, veryOld, veryOld);                          // aucune photo liée : effacée
  ins.run('J-0003', null, 1, null, veryOld, veryOld);                                      // refus, photo liée : gardé
  const photo = db.prepare("SELECT id FROM photos LIMIT 1").pluck().get();
  db.prepare("INSERT INTO encounter_photos (encounter_id, photo_id) SELECT id, ? FROM encounters WHERE ref = 'J-0003'").run(photo);
  // Accord sans photo liée mais avec une photo de sa session : gardé lui aussi.
  const julien = db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  db.prepare("UPDATE photos SET taken_on = '2020-05-02' WHERE id = (SELECT id FROM photos WHERE author_id = ? LIMIT 1)").run(julien);
  db.prepare("INSERT INTO encounters (ref, status, consent, consent_source, author_id, met_on, created_at, updated_at) VALUES ('J-0005', 'en_cours', '{\"site\":true}', 'carte', ?, '2020-05-02', ?, ?)").run(julien, veryOld, veryOld);
  app.encounters.purge();
  assert.ok(db.prepare("SELECT portrait_jpeg FROM encounters WHERE ref = 'J-0001'").pluck().get());      // avec l'accord : gardé
  assert.equal(db.prepare("SELECT portrait_jpeg FROM encounters WHERE ref = 'J-0004'").pluck().get(), null);
  assert.deepEqual(db.prepare('SELECT ref FROM encounters ORDER BY ref').pluck().all(), ['J-0001', 'J-0003', 'J-0004', 'J-0005']);
});
