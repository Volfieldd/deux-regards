import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

// J'aime anonymes et signalements des visiteurs sur la page photo.
const TOKEN = 'jeton-de-test-0123456789';
const KEY = 'cle-de-test-0123456789-abcdefghijklmnop';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

test('j’aime : une fois par visiteur, retirable, compteur affiché ; un autre site ne peut pas aimer à sa place', async t => {
  const ctx = await setup(t, { seeded: true });
  const p = ctx.db.prepare("SELECT slug, id FROM photos WHERE status = 'published' ORDER BY position LIMIT 1").get();
  const like = (ip, payload = '', headers = {}) => ctx.app.inject({ method: 'POST', url: `/photo/${p.slug}/aime`, payload, remoteAddress: ip,
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', ...headers } });
  assert.match((await ctx.app.inject(`/photo/${p.slug}`)).body, /data-like-n>0 j’aime</);
  assert.deepEqual((await like('203.0.113.1')).json(), { likes: 1, liked: true, label: '1 j’aime' });
  assert.equal((await like('203.0.113.1')).json().likes, 1);                         // même visiteur : pas de doublon
  assert.equal((await like('203.0.113.2')).json().likes, 2);
  assert.equal((await like('203.0.113.1', 'retirer=1')).json().likes, 1);           // « je n'aime plus »
  assert.equal((await like('203.0.113.9', 'retirer=1')).json().likes, 1);           // jamais aimé : rien à retirer
  assert.equal((await like('203.0.113.3', '', { origin: 'https://ailleurs.example' })).statusCode, 429);
  assert.equal((await like('203.0.113.5', '', { origin: 'http://nicephos.local', host: 'nicephos.local' })).json().likes, 2); // même hôte que la page
  await like('203.0.113.5', 'retirer=1', { host: 'nicephos.local' });
  assert.equal(ctx.db.prepare('SELECT likes FROM photos WHERE id = ?').pluck().get(p.id), 1);
  // Sans JavaScript : retour à la photo ; en anglais, le libellé suit.
  const r = await ctx.app.inject({ method: 'POST', url: `/en/photo/${p.slug}/aime`, remoteAddress: '203.0.113.4' });
  assert.deepEqual([r.statusCode, r.headers.location], [303, `/en/photo/${p.slug}`]);
  assert.match((await ctx.app.inject(`/en/photo/${p.slug}`)).body, /data-like-n>2 likes</);
  assert.equal((await ctx.app.inject({ method: 'POST', url: '/photo/inconnue/aime' })).statusCode, 404);
});

test('signaler : formulaire, validations, piège à robots ; chiffré ; à traiter dans l’admin', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, DATA_KEY: KEY } });
  const p = ctx.db.prepare("SELECT slug, id, title FROM photos WHERE status = 'published' ORDER BY position LIMIT 1").get();
  const form = (await ctx.app.inject(`/de/photo/${p.slug}/signaler`)).body;
  assert.match(form, /Dieses Foto melden/);
  assert.match(form, /href="\/de\/bonjour">Ich habe Sie fotografiert/);
  const send = (payload, ip = '203.0.113.20') => ctx.app.inject({ method: 'POST', url: `/photo/${p.slug}/signaler`, payload, remoteAddress: ip });
  assert.equal((await send({ kind: 'texte' })).statusCode, 422);                     // une suggestion demande un message
  assert.equal((await send({ kind: 'texte', message: 'x', email: 'pas-une-adresse' })).statusCode, 422);
  const ok = await send({ kind: 'texte', message: 'Il s’agit du quai de la Fosse, pas de la Loire.', email: 'lecteur@exemple.fr' });
  assert.deepEqual([ok.statusCode, ok.headers.location], [303, `/photo/${p.slug}/signaler?envoye=1`]);
  assert.match((await ctx.app.inject(ok.headers.location)).body, /Merci, votre message est bien arrivé/);
  await send({ kind: 'inapproprie', website: 'http://spam' });                         // robot : ignoré sans le dire
  const raw = ctx.db.prepare('SELECT * FROM photo_reports').all();
  assert.equal(raw.length, 1);
  assert.match(raw[0].message, /^enc1:/);
  assert.match(raw[0].email, /^enc1:/);
  // Admin : la tâche, la liste en clair, « Traité », « Supprimer ».
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  assert.match((await ctx.app.inject({ url: '/admin', cookies })).body, /1 signalement de visiteur/);
  const list = (await ctx.app.inject({ url: '/admin/signalements', cookies })).body;
  assert.match(list, /Il s’agit du quai de la Fosse/);
  assert.match(list, /lecteur@exemple\.fr/);
  await ctx.app.inject({ method: 'POST', url: `/admin/signalements/${raw[0].id}/traite`, cookies, payload: { _csrf: csrf }, headers: { accept: 'text/html' } });
  assert.doesNotMatch((await ctx.app.inject({ url: '/admin', cookies })).body, /signalement de visiteur/);
  // Effacés au bout de 12 mois.
  ctx.db.prepare('UPDATE photo_reports SET created_at = ?').run(Date.now() - 366 * 864e5);
  assert.equal(ctx.app.feedback.purge(), 1);
  // Cinq signalements par heure et par adresse au plus.
  for (let i = 0; i < 5; i++) await send({ kind: 'autre', message: `m${i}` }, '203.0.113.30');
  assert.equal((await send({ kind: 'autre', message: 'm6' }, '203.0.113.30')).statusCode, 429);
});
