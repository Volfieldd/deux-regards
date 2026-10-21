import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { createVault, LOCKED, compterDechiffrements } from '../server/vault.js';
import { createEncounters } from '../server/encounters.js';
import { loadConfig } from '../server/config.js';

// Données personnelles chiffrées dans la base (DATA_KEY) : illisibles dans le fichier, lisibles dans l'admin.
const TOKEN = 'jeton-de-test-0123456789';
const KEY = 'cle-de-test-0123456789-abcdefghijklmnop';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

test('BV-33 : compteurs de déchiffrement isolés entre requêtes concurrentes, sans clair, échecs ni tâches après réponse', async () => {
  const v = createVault(KEY), autre = createVault(`${KEY}-autre`);
  const texte = v.seal('ne jamais transmettre'), binaire = v.sealBuf(Buffer.from('signature privée'));
  const a = { actif: true, nombre: 0 }, b = { actif: true, nombre: 0 };
  let liberer;
  const attente = new Promise(resolve => { liberer = resolve; });
  await Promise.all([
    compterDechiffrements(a, async () => {
      v.open(texte); await attente; v.openBuf(binaire);
      v.open('en clair'); autre.open(texte); autre.openBuf(binaire); createVault(null).open(texte);
      a.actif = false; await Promise.resolve(); v.open(texte);
    }),
    compterDechiffrements(b, async () => { await Promise.resolve(); for (let i = 0; i < 7; i++) v.open(texte); liberer(); }),
  ]);
  v.open(texte);
  assert.deepEqual(a, { actif: false, nombre: 2 });
  assert.deepEqual(b, { actif: true, nombre: 7 });
});

test('coffre : aller-retour texte et binaire, mauvaise clé ou clé absente sans erreur, anciennes valeurs en clair lues', () => {
  const v = createVault(KEY);
  const sealed = v.seal('alice@exemple.fr');
  assert.match(sealed, /^enc1:/);
  assert.notEqual(v.seal('alice@exemple.fr'), sealed);                                     // nonce aléatoire
  assert.equal(v.open(sealed), 'alice@exemple.fr');
  assert.equal(v.seal(''), '');
  assert.notEqual(v.seal(sealed), sealed);                                                 // une saisie qui ressemble à un chiffré est chiffrée
  assert.equal(v.open(v.seal(sealed)), sealed);                                            // (jamais déchiffrée pour l'admin)
  const buf = Buffer.from('\x89PNG signature');
  const sb = v.sealBuf(buf);
  assert.equal(sb.subarray(0, 4).toString(), 'NCE1');
  assert.deepEqual(v.openBuf(sb), buf);
  assert.equal(v.open('en clair'), 'en clair');
  assert.equal(createVault('une-autre-cle-0123456789-abcdefghijklm').open(sealed), LOCKED);
  assert.equal(createVault(null).open(sealed), LOCKED);
  assert.equal(createVault(null).openBuf(sb), null);
  assert.equal(createVault(null).seal('x'), 'x');
  assert.throws(() => loadConfig({ DATA_KEY: 'trop-courte' }), /DATA_KEY doit faire au moins 32 caractères/);
});

test('avec DATA_KEY : demandes et rencontres chiffrées dans la base, en clair dans l’admin ; données existantes chiffrées', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, DATA_KEY: KEY } });
  await ctx.app.inject({ method: 'POST', url: '/bonjour', payload: { ref: 'J-0142', wants_photo: 'on', adult: 'oui', email: 'alice@exemple.fr', name: 'Alice', message: 'Super photo', met_on: '2026-10-14', place: 'Angers' } });
  const raw = ctx.db.prepare("SELECT * FROM encounters WHERE ref = 'J-0142'").get();
  assert.match(raw.email, /^enc1:/);
  assert.match(raw.name, /^enc1:/);
  const ev = ctx.db.prepare('SELECT detail FROM encounter_events WHERE encounter_id = ?').pluck().get(raw.id);
  assert.match(ev, /^enc1:/);
  assert.doesNotMatch(ev, /Super photo/);
  // Admin : tout se lit normalement.
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  assert.match((await ctx.app.inject({ url: '/admin/rencontres', cookies })).body, /J-0142 · Alice[\s\S]*« Super photo »/);
  assert.match((await ctx.app.inject({ url: `/admin/rencontres/${raw.id}`, cookies })).body, /alice@exemple\.fr/);
  // App : signature et position chiffrées, image servie déchiffrée.
  const signature = `data:image/png;base64,${(await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer()).toString('base64')}`;
  const boundary = '----t1';
  const fields = { _csrf: csrf, decision: 'accord', scope_site: 'on', name: 'Bob', adult: 'oui', signature, lat: '47.473', lon: '-0.551' };
  const payload = Buffer.concat([...Object.entries(fields).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)), Buffer.from(`--${boundary}--\r\n`)]);
  const saved = await ctx.app.inject({ method: 'POST', url: '/admin/rencontre', payload, cookies, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  assert.equal(saved.statusCode, 303);
  const app = ctx.db.prepare('SELECT * FROM encounters WHERE id = (SELECT MAX(id) FROM encounters)').get();
  assert.equal(app.signature_png.subarray(0, 4).toString(), 'NCE1');
  assert.match(String(app.lat), /^enc1:/);
  const img = await ctx.app.inject({ url: `/admin/rencontres/${app.id}/signature`, cookies });
  assert.equal((await sharp(img.rawPayload).metadata()).format, 'png');
  assert.match((await ctx.app.inject({ url: `/admin/rencontres/${app.id}`, cookies })).body, /47\.473, -0\.551/);
  // Export : déchiffré pour la personne.
  assert.match((await ctx.app.inject({ url: `/admin/rencontres/${raw.id}/export.zip`, cookies })).rawPayload.toString('utf8'), /"email": "alice@exemple\.fr"/);
  // Réglages et page Confidentialité l'annoncent.
  assert.match((await ctx.app.inject({ url: '/admin/droits', cookies })).body, /Chiffrement des données personnelles dans la base<\/strong>[^<]*: actif/);
  assert.match((await ctx.app.inject('/confidentialite')).body, /chiffrés dans notre base, avec une clé conservée à part/);
  // Données entrées avant la clé : chiffrées au démarrage suivant.
  ctx.db.prepare("INSERT INTO encounters (ref, email, name, created_at, updated_at) VALUES ('S-0001', 'ancien@exemple.fr', 'Ancien', 1, 1)").run();
  ctx.db.prepare("INSERT INTO encounter_events (encounter_id, at, kind, detail) SELECT id, 1, 'visiteur', '{\"message\":\"en clair\"}' FROM encounters WHERE ref = 'S-0001'").run();
  assert.ok(ctx.app.encounters.sealExisting() >= 2);
  const old = ctx.db.prepare("SELECT * FROM encounters WHERE ref = 'S-0001'").get();
  assert.match(old.email, /^enc1:/);
  assert.equal(ctx.app.encounters.get(old.id).email, 'ancien@exemple.fr');
  assert.equal(ctx.app.encounters.sealExisting(), 0);                                    // une seule fois
  // Mauvaise clé : avertissement à la place des données, jamais d'erreur.
  const wrong = createEncounters({ db: ctx.db, vault: createVault('une-autre-cle-0123456789-abcdefghijklm') });
  assert.equal(wrong.get(old.id).email, LOCKED);
});

test('sans DATA_KEY : rien n’est chiffré, et Réglages le signale', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  await ctx.app.inject({ method: 'POST', url: '/bonjour', payload: { ref: 'J-0001', wants_photo: 'on', adult: 'oui', email: 'z@exemple.fr' } });
  assert.equal(ctx.db.prepare("SELECT email FROM encounters WHERE ref = 'J-0001'").pluck().get(), 'z@exemple.fr');
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  assert.match((await ctx.app.inject({ url: '/admin/droits', cookies: cookiesOf(res) })).body, /: inactif\. Ajoutez DATA_KEY/);
  assert.doesNotMatch((await ctx.app.inject('/confidentialite')).body, /chiffrés dans notre base/);
});
