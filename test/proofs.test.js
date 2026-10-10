import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { loadConfig } from '../server/config.js';
import { buildRequest, readDer, parseReply, verifyToken, requestTimestamp } from '../server/timestamp.js';

// Jetons réels émis par FreeTSA (voir test/fixtures/README.md), vérifiables hors ligne jusqu'en 2040.
const FIXTURE = fs.readFileSync(new URL('./fixtures/freetsa-deux-regards.tsr', import.meta.url));
const NO_NONCE = fs.readFileSync(new URL('./fixtures/freetsa-test.tsr', import.meta.url));
const CA = fs.readFileSync(new URL('../assets/tsa/freetsa-cacert.pem', import.meta.url), 'utf8');
const DATA = 'deux regards';
const SHA = crypto.createHash('sha256').update(DATA).digest('hex');
const FIXTURE_NONCE = Buffer.from(parseReply(FIXTURE).nonce.toString(16).padStart(16, '0'), 'hex');
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

// Faux service d'horodatage : renvoie le jeton enregistré, ou échoue.
const fakeTsa = (reply = FIXTURE) => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: Buffer.from(opts.body) });
    if (reply instanceof Error) throw reply;
    return new Response(reply, { status: 200, headers: { 'content-type': 'application/timestamp-reply' } });
  };
  return { fetchImpl, calls, nonce: () => FIXTURE_NONCE };
};

// ---------- RFC 3161 ----------

test('requête RFC 3161 : version 1, SHA-256, empreinte, nonce, certificat demandé', () => {
  const { der, nonce } = buildRequest(SHA, Buffer.from('0102030405060708', 'hex'));
  const [version, imprint, n, certReq] = readDer(der).children;
  assert.equal(version.value[0], 1);
  assert.equal(imprint.children[0].children[0].value.toString('hex'), '608648016503040201');   // OID sha256
  assert.equal(imprint.children[1].value.toString('hex'), SHA);
  assert.equal(n.value.toString('hex'), '0102030405060708');
  assert.equal(nonce, 0x0102030405060708n);
  assert.equal(certReq.value[0], 0xff);
  assert.throws(() => buildRequest('abc'), /empreinte SHA-256 invalide/);
});

test('jeton réel : analyse, signature et chaîne jusqu’à l’autorité FreeTSA', () => {
  const p = parseReply(FIXTURE);
  assert.equal(p.hashAlgorithm, 'sha256');
  assert.equal(p.hashedMessage, SHA);
  assert.equal(p.genTime.toISOString(), '2026-10-10T10:55:24.000Z');
  assert.ok(p.nonce > 0n);
  const v = verifyToken(p, { caPem: CA });
  assert.match(v.signer, /CN=www\.freetsa\.org/);
  assert.equal(v.chained, true);
  assert.equal(parseReply(NO_NONCE).nonce, null);
});

test('jeton altéré ou autorité inattendue : refusé', () => {
  const p = parseReply(FIXTURE);
  const bad = Buffer.from(FIXTURE);
  bad[bad.indexOf(p.tstDer) + 20] ^= 1;                       // un bit du contenu signé
  assert.throws(() => verifyToken(parseReply(bad)), /ne correspond pas|illisible|invalide/);
  const otherCa = new crypto.X509Certificate(parseReply(FIXTURE).certs[0]).toString();   // le certificat de la TSA n'est pas sa propre racine
  assert.throws(() => verifyToken(p, { caPem: otherCa }), /autorité attendue/);
});

test('requête : la réponse doit porter sur l’empreinte et le nonce envoyés', async () => {
  const tsa = fakeTsa();
  const ok = await requestTimestamp('https://tsa.example', SHA, { fetchImpl: tsa.fetchImpl, nonce: FIXTURE_NONCE });
  assert.equal(ok.serial, parseReply(FIXTURE).serial);
  assert.equal(tsa.calls[0].body.toString('hex'), buildRequest(SHA, FIXTURE_NONCE).der.toString('hex'));
  await assert.rejects(requestTimestamp('https://tsa.example', SHA, { fetchImpl: tsa.fetchImpl }), /nonce différent/);
  await assert.rejects(requestTimestamp('https://tsa.example', 'a'.repeat(64), { fetchImpl: tsa.fetchImpl, nonce: FIXTURE_NONCE }), /ne porte pas sur cette empreinte/);
  const refused = async () => new Response('non', { status: 503 });
  await assert.rejects(requestTimestamp('https://tsa.example', SHA, { fetchImpl: refused }), /répondu 503/);
});

test('configuration : FreeTSA par défaut, « off », HTTPS exigé en ligne', () => {
  assert.equal(loadConfig({}).tsa.url, 'https://freetsa.org/tsr');
  assert.match(loadConfig({}).tsa.caFile, /freetsa-cacert\.pem$/);
  assert.equal(loadConfig({ TSA_URL: 'off' }).tsa.url, null);
  assert.equal(loadConfig({ TSA_URL: 'https://tsa.example/' }).tsa.caFile, null);
  assert.throws(() => loadConfig({ TSA_URL: 'http://tsa.example', PUBLIC_URL: 'https://a.example', COOKIE_SECRET: 'x'.repeat(32) }), /TSA_URL doit être en HTTPS/);
});

// ---------- dans l'application ----------

// App seedée, connectée, avec une photo dont l'original contient exactement DATA (empreinte = SHA du jeton).
async function withProof(t, tsa = fakeTsa()) {
  const c = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, TSA_URL: 'https://tsa.example/tsr', TSA_CA_FILE: new URL('../assets/tsa/freetsa-cacert.pem', import.meta.url).pathname }, proofOptions: tsa });
  const file = `${crypto.randomUUID()}.jpg`;
  fs.writeFileSync(path.join(c.config.storageDir, 'originals', file), DATA);
  const { lastInsertRowid } = c.db.prepare(`INSERT INTO photos (slug, title, category_id, author_id, status, position, file, width, height)
    VALUES ('preuve', 'Preuve', 1, 1, 'draft', 99, ?, 10, 10)`).run(file);
  const id = Number(lastInsertRowid);
  const res = await c.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  const cookies = cookiesOf(res);
  const csrf = c.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = opts => c.app.inject({ ...opts, cookies: { ...cookies, ...opts.cookies } });
  const post = (url, payload = {}) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  await c.app.proofs.idle();
  return { ...c, id, file, as, post, tsa, flash: async res => (await as({ url: res.headers.location, cookies: { flash: cookiesOf(res).flash } })).body };
}

test('au démarrage : empreinte de chaque original, puis horodatage', async t => {
  const c = await withProof(t);
  const hashes = c.db.prepare('SELECT file, sha256 FROM photos').all();
  assert.ok(hashes.every(h => /^[0-9a-f]{64}$/.test(h.sha256)));
  const seeded = hashes.find(h => h.file !== c.file);
  const bytes = fs.readFileSync(path.join(c.config.storageDir, 'originals', seeded.file));
  assert.equal(seeded.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));

  const t1 = c.app.proofs.get(c.id);
  assert.equal(t1.status, 'ok');
  assert.equal(t1.sha256, SHA);
  assert.equal(t1.gen_time, '2026-10-10T10:55:24.000Z');
  assert.match(t1.signer, /freetsa/);
  // Les photos de démo, d'empreinte différente, sont refusées (le faux service renvoie toujours le même jeton).
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM timestamps WHERE status = 'error'").pluck().get(), 12);
  assert.match(c.app.proofs.get(1).error, /ne porte pas sur cette empreinte/);
});

test('fiche photo : preuve affichée, téléchargements, vérification', async t => {
  const c = await withProof(t);
  const page = (await c.as({ url: `/admin/photos/${c.id}` })).body;
  assert.match(page, new RegExp(SHA));
  assert.match(page, /Horodatée le 2026-10-10 à 10:55:24 UTC/);

  const tsr = await c.as({ url: `/admin/photos/${c.id}/preuve.tsr` });
  assert.equal(tsr.headers['content-type'], 'application/timestamp-reply');
  assert.match(tsr.headers['content-disposition'], /attachment; filename="preuve\.tsr"/);
  assert.ok(tsr.rawPayload.equals(FIXTURE));
  const txt = (await c.as({ url: `/admin/photos/${c.id}/preuve.txt` })).body;
  assert.match(txt, new RegExp(`Empreinte SHA-256     : ${SHA}`));
  assert.match(txt, /openssl ts -verify -in preuve\.tsr -data preuve\.jpg -CAfile autorite-horodatage\.pem/);
  assert.equal((await c.as({ url: `/admin/photos/${c.id}/original` })).body, DATA);
  assert.match((await c.as({ url: '/admin/preuves/autorite.pem' })).body, /BEGIN CERTIFICATE/);
  for (const u of ['original', 'preuve.tsr', 'preuve.txt']) assert.equal((await c.app.inject(`/admin/photos/${c.id}/${u}`)).statusCode, 302);

  const ok = await c.post(`/admin/photos/${c.id}/verifier`);
  assert.match(await c.flash(ok), /Preuve valide : original intact, horodaté le 2026-10-10 à 10:55:24 UTC, signature vérifiée jusqu’à l’autorité racine/);

  fs.appendFileSync(path.join(c.config.storageDir, 'originals', c.file), '!');
  const ko = await c.post(`/admin/photos/${c.id}/verifier`);
  assert.match(await c.flash(ko), /Preuve non valide : l’original a été modifié depuis son import/);
  assert.equal((await c.post(`/admin/photos/${c.id}/verifier`, { _csrf: 'faux' })).statusCode, 403);
});

test('TSA injoignable : erreur notée, reprise espacée, relance manuelle', async t => {
  const c = await withProof(t, fakeTsa(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })));
  const row = c.app.proofs.get(c.id);
  assert.equal(row.status, 'error');
  assert.equal(row.error, 'service injoignable (ENOTFOUND)');
  assert.equal(row.attempts, 1);
  const calls = c.tsa.calls.length;
  await c.app.proofs.schedule();                               // trop tôt : pas de nouvel essai
  assert.equal(c.tsa.calls.length, calls);
  const res = await c.post('/admin/preuves/reessayer', { back: `/admin/photos/${c.id}` });
  assert.equal(res.headers.location, `/admin/photos/${c.id}`);
  await c.app.proofs.idle();
  assert.equal(c.app.proofs.get(c.id).attempts, 2);
  assert.match((await c.as({ url: '/admin' })).body, /0<\/strong> photo\(s\) sur 13 horodatée\(s\), 13 en attente après une erreur/);
  assert.match((await c.as({ url: `/admin/photos/${c.id}` })).body, /Réessayer maintenant/);
});

test('import : empreinte calculée à la réception ; suppression : preuve effacée', async t => {
  const c = await withProof(t);
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#123' } }).png().toBuffer();
  const boundary = '----t';
  const author = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const csrf = c.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const part = (name, value, filename) => Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${filename ? `; filename="${filename}"` : ''}\r\n\r\n`), Buffer.from(value), Buffer.from('\r\n')]);
  const payload = Buffer.concat([part('_csrf', csrf), part('author_id', String(author)), part('category_id', '1'), part('photos', png, 'p.png'), Buffer.from(`--${boundary}--\r\n`)]);
  const res = await c.as({ method: 'POST', url: '/admin/photos/import', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'application/json' } });
  const id = res.json().imported[0].id;
  assert.equal(c.db.prepare('SELECT sha256 FROM photos WHERE id = ?').pluck().get(id), crypto.createHash('sha256').update(png).digest('hex'));

  await c.post(`/admin/photos/${c.id}/delete`);
  assert.equal(c.app.proofs.get(c.id), undefined);
});

test('horodatage désactivé : empreintes seules, message clair', async t => {
  const c = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  await c.app.ready();
  await c.app.proofs.idle();
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM photos WHERE sha256 IS NULL').pluck().get(), 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM timestamps').pluck().get(), 0);
  const res = await c.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  assert.match((await c.app.inject({ url: '/admin', cookies: cookiesOf(res) })).body, /Horodatage désactivé sur ce serveur/);
});

// ---------- droits d'utilisation ----------

test('page /droits : texte par défaut, texte et contact réglables, lien en pied de page', async t => {
  const c = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const page = await c.app.inject('/droits');
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /appartiennent à leurs auteurs, Sébastien et Julien\./);
  assert.match(page.body, /L\.122-4/);
  assert.match((await c.app.inject('/')).body, /<a href="\/droits">Droits d’utilisation<\/a>/);

  const set = (k, v) => c.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
  set('rights_text', 'Licence sur demande.\n\nMerci.');
  set('rights_contact', 'photos@example.org');
  const custom = (await c.app.inject('/droits')).body;
  assert.match(custom, /<p>Licence sur demande\.<\/p>\s*<p>Merci\.<\/p>/);
  assert.match(custom, /href="mailto:photos@example\.org"/);
  set('rights_contact', 'javascript:alert(1)');
  assert.doesNotMatch((await c.app.inject('/droits')).body, /href="javascript/);
});
