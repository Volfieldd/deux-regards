// Non-régression des constats de la revue de code et de sécurité (octobre 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { loadConfig } from '../server/config.js';
import { safeNext } from '../server/auth.js';
import { renderVariants, variantName } from '../server/images.js';
import { buildRequest, parseReply, requestTimestamp, verifyToken, TimestampError } from '../server/timestamp.js';

const TOKEN = 'jeton-de-test-0123456789';
const FIXTURE = fs.readFileSync(new URL('./fixtures/freetsa-deux-regards.tsr', import.meta.url));
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

async function admin(t, opts = {}) {
  const c = await setup(t, { seeded: true, ...opts, env: { LOCAL_AUTH_TOKEN: TOKEN, ...opts.env } });
  const res = await c.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  const cookies = cookiesOf(res);
  const csrf = c.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = o => c.app.inject({ ...o, cookies: { ...cookies, ...o.cookies } });
  const post = (url, payload = {}, headers = { accept: 'text/html' }) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers });
  return { ...c, cookies, csrf, as, post };
}

// ---------- sécurité ----------

test('redirection ouverte : les segments « /./ » et « /../ » ne mènent jamais hors du site', async t => {
  for (const bad of ['/.//evil.com', '/a/..//evil.com', '/%2e//evil.com', '/./\\evil.com', '/admin/..//evil.com/x?y#z']) {
    assert.equal(safeNext(bad), '/admin', bad);
  }
  assert.equal(safeNext('/admin/../photo/x'), '/photo/x');
  const c = await admin(t);
  const login = await c.as({ url: '/auth/login?next=/.//evil.example/phish' });
  assert.equal(login.headers.location, '/admin');
  const back = await c.post('/admin/photos/1/status', { status: 'published', back: '/admin/..//evil.example' });
  assert.equal(back.headers.location, '/admin/photos');
});

test('erreur inattendue : message générique, aucun chemin ni nom de fichier', async t => {
  const c = await admin(t);
  const p = c.db.prepare('SELECT id, file FROM photos LIMIT 1').get();
  fs.rmSync(path.join(c.config.storageDir, 'originals', p.file));
  const json = await c.as({ url: `/admin/images/apercu.webp?photo=${p.id}` });
  assert.equal(json.statusCode, 500);
  assert.doesNotMatch(json.body, /originals|storage|\.jpg|Input file/);
  const html = await c.as({ url: `/admin/images/apercu.webp?photo=${p.id}`, headers: { accept: 'text/html' } });
  assert.match(html.body, /Une erreur inattendue est survenue/);
});

test('chaque route d’admin exige une session, chaque écriture le jeton CSRF', async t => {
  const c = await admin(t);
  const routes = c.app.routeList.filter(r => r.url.startsWith('/admin') && r.method !== 'HEAD');
  assert.ok(routes.length > 25);
  const concrete = url => url.replace(':id', '1').replace(':name', '00000000-0000-0000-0000-000000000000-640.webp');
  for (const r of routes) {
    const anon = await c.app.inject({ method: r.method, url: concrete(r.url), payload: r.method === 'POST' ? {} : undefined });
    assert.ok([302, 401].includes(anon.statusCode), `${r.method} ${r.url} sans session : ${anon.statusCode}`);
    if (r.method === 'POST') {
      const forged = await c.as({ method: 'POST', url: concrete(r.url), payload: { _csrf: 'faux', ids: [1] } });
      assert.ok(forged.statusCode >= 400 && forged.statusCode < 500, `${r.url} sans CSRF : ${forged.statusCode}`);
    }
  }
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM photos').pluck().get(), 12);
});

test('configuration : TRUST_PROXY interprété, secret exigé hors de la boucle locale', () => {
  assert.equal(loadConfig({ TRUST_PROXY: '1' }).trustProxy, 1);
  assert.equal(loadConfig({ TRUST_PROXY: 'false' }).trustProxy, false);
  assert.equal(loadConfig({ TRUST_PROXY: '10.0.0.2' }).trustProxy, '10.0.0.2');
  assert.throws(() => loadConfig({ TRUST_PROXY: 'true' }), /TRUST_PROXY=true est refusé/);
  assert.throws(() => loadConfig({ HOST: '0.0.0.0' }), /COOKIE_SECRET/);
  assert.equal(loadConfig({ HOST: '0.0.0.0', COOKIE_SECRET: 'x'.repeat(32) }).host, '0.0.0.0');
});

test('logo trop étiré refusé ; aperçus des brouillons jamais mis en cache', async t => {
  const c = await admin(t);
  const boundary = '----t';
  const body = buf => Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${c.csrf}\r\n--${boundary}\r\nContent-Disposition: form-data; name="logo"; filename="l.png"\r\n\r\n`),
    buf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const thin = await sharp({ create: { width: 4, height: 4000, channels: 4, background: '#fff' } }).png().toBuffer();
  const res = await c.as({ method: 'POST', url: '/admin/images/logo', payload: body(thin), headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'text/html' } });
  const page = await c.as({ url: res.headers.location, cookies: { flash: cookiesOf(res).flash } });
  assert.match(page.body, /Logo trop étiré ou trop petit/);
  const p = c.db.prepare('SELECT file, width FROM photos LIMIT 1').get();
  const media = await c.as({ url: `/admin/media/${variantName(p.file, 640, 'webp')}` });
  assert.equal(media.headers['cache-control'], 'no-store');
});

test('journal d’audit : chaque écriture d’admin est tracée avec le compte', async t => {
  const lines = [];
  const c = await admin(t, { logger: { level: 'info', stream: { write: l => lines.push(JSON.parse(l)) } } });
  await c.post('/admin/series', { name: 'Audit' });
  const entry = lines.find(l => l.audit);
  assert.equal(entry.sub, 'local:julien');
  assert.equal(entry.action, 'POST /admin/series');
  assert.equal(entry.status, 303);
});

// ---------- horodatage ----------

test('requête RFC 3161 : nonce en DER minimal (jamais de zéro de tête)', () => {
  for (let i = 0; i < 2000; i++) {
    const { der } = buildRequest('a'.repeat(64));
    const nonceTlv = der.subarray(der.length - 3 - 10, der.length - 3);   // INTEGER de 8 octets avant certReq
    assert.equal(nonceTlv[0], 0x02);
    assert.equal(nonceTlv[1], 8);
    assert.ok(nonceTlv[2] >= 1 && nonceTlv[2] <= 0x7f);
  }
});

test('jeton mal formé : toujours une TimestampError lisible, jamais une erreur brute', () => {
  const mutated = [];
  for (let i = 0; i < 400; i++) {
    const b = Buffer.from(FIXTURE);
    b[crypto.randomInt(b.length)] = crypto.randomInt(256);
    mutated.push(b);
  }
  mutated.push(Buffer.concat([FIXTURE, Buffer.from([0])]), FIXTURE.subarray(0, 100), Buffer.from([0x30, 0x84, 0xff]));
  for (const b of mutated) {
    try {
      verifyToken(parseReply(b));
    } catch (err) {
      assert.ok(err instanceof TimestampError, `${err.constructor.name}: ${err.message}`);
    }
  }
  // Date impossible (mois 13).
  const p = parseReply(FIXTURE);
  const bad = Buffer.from(FIXTURE);
  const at = bad.indexOf(Buffer.from('20261010', 'latin1'));
  bad.write('20261310', at, 'latin1');
  assert.throws(() => parseReply(bad), /date du jeton illisible/);
  assert.ok(p.genTime instanceof Date);
});

test('réponse de la TSA : pas de redirection suivie, taille bornée', async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = opts; return new Response(Buffer.alloc(70 * 1024), { status: 200 }); };
  await assert.rejects(requestTimestamp('https://tsa.example', 'a'.repeat(64), { fetchImpl }), /trop volumineuse/);
  assert.equal(seen.redirect, 'error');
});

test('photo supprimée pendant sa demande d’horodatage : ni plantage ni ligne orpheline', async t => {
  let release;
  const gate = new Promise(r => { release = r; });
  const fetchImpl = async () => { await gate; return new Response(FIXTURE, { status: 200 }); };
  const rejections = [];
  const onRejection = err => rejections.push(err);
  process.on('unhandledRejection', onRejection);
  t.after(() => process.off('unhandledRejection', onRejection));
  const c = await admin(t, { env: { TSA_URL: 'https://tsa.example/tsr' }, proofOptions: { fetchImpl } });
  await new Promise(r => setTimeout(r, 50));                     // la première requête est en vol
  const id = c.db.prepare('SELECT id FROM photos ORDER BY position LIMIT 1').pluck().get();
  await c.post(`/admin/photos/${id}/delete`);
  release();
  await c.app.proofs.idle();
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(rejections, []);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM timestamps WHERE photo_id = ?').pluck().get(id), 0);
});

test('« Réessayer » demandé pendant qu’un passage attend : pris en compte', async t => {
  const calls = [];
  const fetchImpl = async () => { calls.push(1); throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };
  const c = await admin(t, { env: { TSA_URL: 'https://tsa.example/tsr' }, proofOptions: { fetchImpl } });
  await c.app.proofs.idle();
  const first = calls.length;
  c.app.proofs.schedule();
  c.app.proofs.schedule({ retryNow: true });                       // fusionné avec le passage déjà demandé
  await c.app.proofs.idle();
  assert.equal(calls.length, first * 2);
});

// ---------- variantes ----------

test('photo supprimée pendant son rendu : aucune variante orpheline', async t => {
  const c = await admin(t);
  const p = c.db.prepare('SELECT id, file FROM photos LIMIT 1').get();
  const stem = path.parse(p.file).name;
  const pending = c.post('/admin/images', { wm_enabled: 'on', exif_mode: 'rights' });
  await pending;
  await c.post(`/admin/photos/${p.id}/delete`);
  await c.app.variants.idle();
  assert.equal(fs.readdirSync(path.join(c.config.storageDir, 'variants')).some(f => f.startsWith(stem)), false);
});

test('rendu interrompu : restes .tmp et variantes sans photo effacés au démarrage', async t => {
  const c = await setup(t, { seeded: true });
  const dir = path.join(c.config.storageDir, 'variants');
  const any = fs.readdirSync(dir)[0];
  fs.writeFileSync(path.join(dir, `${any}.dead.tmp`), 'x');
  fs.writeFileSync(path.join(dir, '99999999-9999-9999-9999-999999999999-640.webp'), 'x');
  await c.app.ready();
  await c.app.variants.idle();
  assert.equal(fs.existsSync(path.join(dir, `${any}.dead.tmp`)), false);
  assert.equal(fs.existsSync(path.join(dir, '99999999-9999-9999-9999-999999999999-640.webp')), false);
  assert.ok(fs.existsSync(path.join(dir, any)));
});

test('un rendu en échec n’empêche pas l’arrêt du serveur', async t => {
  const c = await admin(t);
  const p = c.db.prepare('SELECT id, file FROM photos LIMIT 1').get();
  fs.writeFileSync(path.join(c.config.storageDir, 'originals', p.file), 'pas une image');
  fs.rmSync(path.join(c.config.storageDir, 'variants'), { recursive: true });
  await assert.rejects(c.app.variants.renderPhoto(p.id));
  await c.app.variants.idle();                                    // ne rejette pas
});

test('filigrane : la plus grande variante est marquée même sous le seuil ; images minuscules acceptées', async t => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-wm-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'originals'));
  const mark = { kind: 'text', text: 'COPYRIGHT', font: 'sans', tone: 'light', position: 'bas-droite', opacity: 100, size: 40, margin: 2, minWidth: 2000 };
  const file = '11111111-1111-1111-1111-111111111111.jpg';
  await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#808080' } }).jpeg().toFile(path.join(dir, 'originals', file));
  await renderVariants(dir, file, { key: 'aaaaaaaa', mark });
  const max = async w => (await sharp(path.join(dir, 'variants', variantName(file, w, 'webp', 'aaaaaaaa'))).stats()).channels[0].max;
  assert.ok(await max(1000) > 230, 'plus grande variante marquée');
  assert.ok(await max(640) < 150, 'vignette épargnée');
  for (const [w, h] of [[700, 1], [3000, 2], [1, 1]]) {
    const f = `2222222${w % 10}-2222-2222-2222-22222222222${h}.png`;
    await sharp({ create: { width: w, height: h, channels: 3, background: '#000' } }).png().toFile(path.join(dir, 'originals', f));
    await renderVariants(dir, f, { key: 'bbbbbbbb', mark: { ...mark, minWidth: 0 } });
  }
});

test('ouverture : renommer l’adresse d’une photo la garde dans la sélection', async t => {
  const c = await admin(t);
  const p = c.db.prepare("SELECT * FROM photos WHERE slug = 'deux-minuit'").get();
  await c.post(`/admin/photos/${p.id}`, { title: p.title, slug: 'minuit-a-deux', category_id: p.category_id, author_id: p.author_id, status: 'published' });
  const hero = JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'hero'").pluck().get());
  assert.ok(hero.includes('minuit-a-deux'));
  assert.ok(!hero.includes('deux-minuit'));
});

test('import : un fichier trop lourd est refusé seul, le reste du lot passe', async t => {
  const c = await admin(t);
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#123' } }).png().toBuffer();
  const boundary = '----t';
  const part = (name, value, filename) => Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${filename ? `; filename="${filename}"` : ''}\r\n\r\n`), Buffer.from(value), Buffer.from('\r\n')]);
  const payload = Buffer.concat([part('_csrf', c.csrf), part('author_id', '1'), part('category_id', '1'),
    part('photos', png, 'ok.png'), part('photos', Buffer.alloc(61 * 1024 * 1024), 'enorme.jpg'), Buffer.from(`--${boundary}--\r\n`)]);
  const res = await c.as({ method: 'POST', url: '/admin/photos/import', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'application/json' } });
  assert.equal(res.statusCode, 200);
  const { imported, refused } = res.json();
  assert.equal(imported.length, 1);
  assert.match(refused[0].reason, /trop lourd/);
  assert.deepEqual(fs.readdirSync(path.join(c.config.storageDir, 'tmp')), []);
});

// ---------- pages ----------

test('pages publiques : numérotation sans trou, base vide sans « undefined », auteurs en pied de page', async t => {
  const c = await setup(t, { seeded: true });
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE position = 0").run();
  const home = (await c.app.inject('/')).body;
  assert.match(home, /N°01 · /);
  assert.doesNotMatch(home, /N°12 · /);
  assert.match(home, /Test · Sébastien &amp; Julien/);

  const empty = await setup(t);
  for (const url of ['/', '/a-propos', '/droits']) {
    const body = (await empty.app.inject(url)).body;
    assert.doesNotMatch(body, /undefined/, url);
    assert.match(body, /<h1/, url);
  }
});
