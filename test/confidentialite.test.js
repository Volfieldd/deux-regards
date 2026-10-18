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

test('mentions légales / Impressum : en pied de chaque page, remplies depuis l’admin, signalées tant qu’incomplètes', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: 'jeton-de-test-0123456789' } });
  for (const [url, label] of [['/', 'Mentions légales'], ['/en/', 'Legal notice'], ['/de/droits', 'Impressum']]) {
    assert.match((await ctx.app.inject(url)).body, new RegExp(`href="(/en|/de)?/mentions-legales">${label}</a>`), url);
  }
  assert.equal((await ctx.app.inject('/impressum')).headers.location, '/de/mentions-legales');
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: 'jeton-de-test-0123456789', author: 'julien', next: '/admin' } });
  const cookies = Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  assert.match((await ctx.app.inject({ url: '/admin', cookies })).body, /Mentions légales \/ Impressum à compléter/);
  const legal = { _csrf: csrf, part: 'droits', legal_names: 'Sébastien Exemple et Julien Exemple', legal_address: '1 rue des Photos\n49000 Angers\nFrance', legal_email: 'info@nicephos.art', legal_director: 'Sébastien Exemple' };
  await ctx.app.inject({ method: 'POST', url: '/admin/reglages', cookies, headers: { accept: 'text/html' }, payload: legal });
  // Le téléphone est dû (LCEN art. 1-1, personne physique qui édite le site) : sans lui, toujours incomplètes.
  assert.match((await ctx.app.inject({ url: '/admin', cookies })).body, /Impressum à compléter/);
  assert.match((await ctx.app.inject({ url: '/admin/droits', cookies })).body, /<p class="cellnote warn" id="mentions-manque">1 rubrique obligatoire à remplir : Téléphone\./);
  await ctx.app.inject({ method: 'POST', url: '/admin/reglages', cookies, headers: { accept: 'text/html' }, payload: { ...legal, legal_phone: '+33 6 00 00 00 00' } });
  const de = (await ctx.app.inject('/de/mentions-legales')).body;
  assert.match(de, /<h1>Impressum<\/h1>/);
  assert.match(de, /Angaben gemäß § 5 DDG<\/h2>\s*<p>Sébastien Exemple et Julien Exemple<\/p>\s*<p>1 rue des Photos<\/p>\s*<p>49000 Angers<\/p>/);
  assert.match(de, /Verantwortlich für den Inhalt nach § 18 Abs\. 2 MStV<\/h2>\s*<p>Sébastien Exemple<\/p>/);
  const fr = (await ctx.app.inject('/mentions-legales')).body;
  assert.match(fr, /E-mail : <a class="more" href="mailto:info@nicephos\.art">info@nicephos\.art<\/a>/);   // l'e-mail, en lien
  assert.match(fr, /Téléphone : \+33 6 00 00 00 00/);
  assert.match(fr, /<h2>Directeur de la publication<\/h2>\s*<p>Sébastien Exemple<\/p>/);                    // le terme de la loi
  assert.doesNotMatch(fr, /esponsable de la publication/);
  assert.doesNotMatch((await ctx.app.inject({ url: '/admin', cookies })).body, /Impressum à compléter/);
  assert.doesNotMatch((await ctx.app.inject({ url: '/admin/droits', cookies })).body, /mentions-manque/);
  // Enregistrer la page Droits ne touche pas au site public, et inversement.
  assert.match((await ctx.app.inject({ url: '/admin/droits', cookies })).body, /name="legal_names" value="Sébastien Exemple et Julien Exemple"/);
});

test('mentions légales : hébergement par les éditeurs (page inchangée) ou chez un hébergeur nommé, en trois langues', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const legal = { _csrf: csrf, part: 'droits', legal_names: 'Sébastien Exemple et Julien Exemple', legal_address: '1 rue des Photos\n49000 Angers', legal_email: 'info@nicephos.art', legal_phone: '02 00 00 00 00', legal_director: 'Sébastien Exemple' };
  const avant = (await ctx.app.inject('/mentions-legales')).body;
  assert.match(avant, /Le site est hébergé par ses éditeurs, sur leur propre serveur, en France, à l’adresse ci-dessus\./);
  // Réglages : le choix « éditeurs » est coché par défaut ; le téléphone le dit dû, puisqu'ils hébergent le site.
  const page = (await ctx.app.inject({ url: '/admin/droits', cookies })).body;
  assert.match(page, /name="legal_host" value="editeurs" checked>/);
  assert.match(page, /Dû, puisque vous hébergez le site\./);
  assert.match(page, /<input type="email" name="legal_email" value="" maxlength="200" autocomplete="email">/);
  assert.match(page, /name="legal_phone" value="" maxlength="40" inputmode="tel" autocomplete="tel">/);
  // Enregistrer sans toucher au choix : la rubrique Hébergement ne change pas (hors réglages des noms et adresse).
  await ctx.app.inject({ method: 'POST', url: '/admin/reglages', cookies, headers: { accept: 'text/html' }, payload: { ...legal, legal_host: 'editeurs' } });
  assert.equal(ctx.db.prepare("SELECT value FROM settings WHERE key = 'legal_host'").pluck().get(), '"editeurs"');
  assert.match((await ctx.app.inject('/mentions-legales')).body, /<h2>Hébergement<\/h2>\s*<p>Le site est hébergé par ses éditeurs, sur leur propre serveur/);
  // Chez un hébergeur, sans ses coordonnées : trois rubriques obligatoires manquent, et la page n'invente rien.
  await ctx.app.inject({ method: 'POST', url: '/admin/reglages', cookies, headers: { accept: 'text/html' }, payload: { ...legal, legal_host: 'hebergeur' } });
  const manque = (await ctx.app.inject({ url: '/admin/droits', cookies })).body;
  assert.match(manque, /3 rubriques obligatoires à remplir : Nom de l’hébergeur, Adresse de l’hébergeur, Téléphone de l’hébergeur\./);
  assert.match(manque, /name="legal_host" value="hebergeur" checked>/);
  assert.match(manque, /Dû par la loi pour une personne qui édite un site\./);
  assert.match((await ctx.app.inject({ url: '/admin', cookies })).body, /Impressum à compléter/);
  const vide = (await ctx.app.inject('/mentions-legales')).body;
  assert.doesNotMatch(vide, /hébergé par ses éditeurs|hébergé par \./);
  assert.match(vide, /<h2>Hébergement<\/h2>\s*<p>Le trafic transite par Cloudflare/);
  // Coordonnées données : la page nomme l'hébergeur, en trois langues ; plus rien ne manque.
  await ctx.app.inject({ method: 'POST', url: '/admin/reglages', cookies, headers: { accept: 'text/html' }, payload: { ...legal, legal_host: 'hebergeur',
    legal_host_name: 'Hébergeur Exemple SAS', legal_host_address: '2 rue du Serveur\n59100 Roubaix', legal_host_phone: '03 00 00 00 00' } });
  assert.match((await ctx.app.inject('/mentions-legales')).body, /Le site est hébergé par Hébergeur Exemple SAS, 2 rue du Serveur, 59100 Roubaix, 03 00 00 00 00\./);
  assert.match((await ctx.app.inject('/en/mentions-legales')).body, /The website is hosted by Hébergeur Exemple SAS, 2 rue du Serveur, 59100 Roubaix, 03 00 00 00 00\./);
  assert.match((await ctx.app.inject('/de/mentions-legales')).body, /Die Website wird gehostet von Hébergeur Exemple SAS, 2 rue du Serveur, 59100 Roubaix, 03 00 00 00 00\./);
  assert.match((await ctx.app.inject('/de/mentions-legales')).body, /Der Datenverkehr läuft über Cloudflare/);   // Cloudflare, dans les deux cas
  assert.doesNotMatch((await ctx.app.inject({ url: '/admin', cookies })).body, /Impressum à compléter/);
});

test('mentions légales : l’e-mail est dû, et le contact de la confidentialité ne le remplace que s’il est une adresse e-mail', async () => {
  const { legalMissing } = await import('../server/legal.js');
  const base = { legal_names: 'A', legal_address: '1 rue', legal_phone: '01', legal_director: 'A' };
  assert.deepEqual(legalMissing({ ...base, legal_email: 'a@exemple.fr' }), []);
  assert.deepEqual(legalMissing({ ...base, privacy_contact: 'info@exemple.fr' }), []);
  assert.deepEqual(legalMissing({ ...base, privacy_contact: 'https://exemple.fr/contact' }), ['email']);  // un formulaire n'est pas un e-mail
  assert.deepEqual(legalMissing({ ...base, legal_phone: ' ' }), ['email', 'phone']);
  assert.deepEqual(legalMissing({ ...base, legal_email: 'a@exemple.fr', legal_host: 'hebergeur', legal_host_name: 'H' }), ['host_address', 'host_phone']);
});
