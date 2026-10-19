import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { shootingOf, shootingFromExif, shotLine, cleanText, normMake, normModel, SHOT_COLUMNS, createShotBackfill } from '../server/prise-de-vue.js';
import { specFor, WATERMARK_DEFAULTS } from '../server/variants.js';
import { renderVariants, variantName } from '../server/images.js';

// Prise de vue dans la visionneuse (MQ-04, PLAN point 8, migration 060) : six données lues dans l'EXIF de l'original à
// l'import (ou par le rattrapage, une fois) — boîtier, objectif, focale, ouverture, vitesse, ISO —, jamais rien d'autre
// (ni GPS, ni numéro de série, ni propriétaire, ni logiciel, ni commentaire, ni MakerNote) ; montrées par défaut, une case
// de la fiche les cache, sur la page comme dans les images servies (mode EXIF « Prise de vue »).

// Un original comme en donne un appareil, avec tout ce qu'on ne doit jamais garder.
const SECRETS = ['SN-4242-SECRET', 'LENS-SN-77', 'Jean Dupont', 'Digital Camera X-T5 Ver2.00', 'commentaire secret', 'Artiste Privé', 'FUJIFILMNOTE', '38.7', '9.13'];
async function camera({ width = 900, height = 600, ifd0 = {}, ifd2 = {} } = {}) {
  return sharp({ create: { width, height, channels: 3, background: '#557788' } }).jpeg()
    .withExif({
      IFD0: { Make: 'FUJIFILM', Model: 'X-T5', Software: 'Digital Camera X-T5 Ver2.00', Artist: 'Artiste Privé', ...ifd0 },
      IFD2: { LensModel: 'XF23mmF1.4 R LM WR', FNumber: '11/1', ISOSpeedRatings: '160', FocalLength: '23/1', ExposureTime: '1/1000',
        BodySerialNumber: 'SN-4242-SECRET', LensSerialNumber: 'LENS-SN-77', CameraOwnerName: 'Jean Dupont', UserComment: 'commentaire secret',
        MakerNote: 'FUJIFILMNOTE', DateTimeOriginal: '2026:10:10 18:52:00', ...ifd2 },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '38/1 43/1 12/1', GPSLongitudeRef: 'W', GPSLongitude: '9/1 8/1 0/1' },
    }).toBuffer();
}
const exifOfBuffer = async buf => exifReader((await sharp(buf).metadata()).exif);
const LINE_FR = 'Fujifilm X-T5 · XF23mmF1.4 R LM WR · 23\u00a0mm · 1/1000\u00a0s · f/11 · ISO\u00a0160';
const plain = s => s.replace(/[\u00a0\u202f]/g, ' ');

test('extraction : les six données, et rien d’autre (ni GPS, ni série, ni propriétaire, ni logiciel)', async () => {
  const e = await exifOfBuffer(await camera());
  // L'original porte bien tout cela…
  assert.equal(e.Photo.BodySerialNumber, 'SN-4242-SECRET');
  assert.ok(e.GPSInfo);
  // … la prise de vue n'en garde que les six données, en sept colonnes.
  const shot = shootingOf(e);
  assert.deepEqual(Object.keys(shot).sort(), [...SHOT_COLUMNS].sort());
  assert.deepEqual(shot, { shot_make: 'Fujifilm', shot_model: 'X-T5', shot_lens: 'XF23mmF1.4 R LM WR', shot_focal: 23, shot_fnumber: 11, shot_exposure: 0.001, shot_iso: 160 });
  const json = JSON.stringify(shot);
  for (const s of SECRETS) assert.ok(!json.includes(s), s);
  // Sans EXIF, ou illisible : tout à null.
  assert.ok(Object.values(shootingOf(null)).every(v => v === null));
  assert.ok(Object.values(shootingFromExif(Buffer.from('pas un exif'))).every(v => v === null));
});

test('normalisation : marques courantes, modèle sans la marque, valeurs de remplissage', () => {
  const cases = [['FUJIFILM', 'Fujifilm'], ['NIKON CORPORATION', 'Nikon'], ['RICOH IMAGING COMPANY, LTD.', 'Ricoh'], ['Canon', 'Canon'], ['SONY', 'Sony'],
    ['OLYMPUS IMAGING CORP.', 'Olympus'], ['OM Digital Solutions', 'OM System'], ['LEICA CAMERA AG', 'Leica'], ['Apple', 'Apple'],
    ['ACME OPTICAL CO., LTD.', 'Acme'], ['DJI', 'DJI'], ['Unknown', null], ['----', null], ['', null], [42, null]];
  for (const [raw, want] of cases) assert.equal(normMake(raw), want, String(raw));
  assert.equal(normModel('NIKON Z 6_2', 'Nikon', 'NIKON CORPORATION'), 'Z 6_2');
  assert.equal(normModel('Canon EOS R5', 'Canon', 'Canon'), 'EOS R5');
  assert.equal(normModel('LEICA M11', 'Leica', 'LEICA CAMERA AG'), 'M11');
  assert.equal(normModel('X-T5', 'Fujifilm', 'FUJIFILM'), 'X-T5');
  // Objectif qui répète le modèle, ou rien que des zéros : écarté.
  assert.equal(shootingOf({ Image: { Make: 'FUJIFILM', Model: 'X100V' }, Photo: { LensModel: 'X100V' } }).shot_lens, null);
  assert.equal(shootingOf({ Image: {}, Photo: { LensModel: '0.0 mm f/0.0' } }).shot_lens, null);
  // ISO en liste (certains boîtiers), ou dans la balise ISOSpeed.
  assert.equal(shootingOf({ Photo: { ISOSpeedRatings: [400, 0] } }).shot_iso, 400);
  assert.equal(shootingOf({ Photo: { ISOSpeed: 800 } }).shot_iso, 800);
});

test('bornes et nettoyage : longueurs, caractères de contrôle et de mise en forme, nombres hors bornes', () => {
  const long = 'A'.repeat(500);
  const s = shootingOf({ Image: { Make: long, Model: long }, Photo: { LensModel: long } });
  assert.equal(s.shot_make.length, 40);
  assert.equal(s.shot_model.length, 60);
  assert.equal(s.shot_lens.length, 80);
  // Contrôle (C0, C1, DEL), sens d'écriture forcé, largeur nulle, sauts de ligne : remplacés par une espace, réunies.
  const dirty = shootingOf({ Image: { Make: 'Fuji\u0000film', Model: 'X\u202e-T5\u200b\r\n<b>\u0085' }, Photo: { LensModel: '\u0007XF\t23mm\u2028F2\u007f' } });
  assert.equal(dirty.shot_make, 'Fujifilm');
  assert.equal(dirty.shot_model, 'X -T5 <b>');
  assert.equal(dirty.shot_lens, 'XF 23mm F2');
  for (const v of [dirty.shot_model, dirty.shot_lens]) assert.doesNotMatch(v, /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2028\u2029]/);
  assert.equal(cleanText('\u200b\u200b', 10), null);
  // Nombres : hors bornes, négatifs, infinis ou non numériques, écartés.
  const bad = shootingOf({ Photo: { FocalLength: 0, FNumber: 0.1, ExposureTime: 7200, ISOSpeedRatings: 0 } });
  assert.deepEqual([bad.shot_focal, bad.shot_fnumber, bad.shot_exposure, bad.shot_iso], [null, null, null, null]);
  const worse = shootingOf({ Photo: { FocalLength: Infinity, FNumber: NaN, ExposureTime: -1, ISOSpeedRatings: '400' } });
  assert.deepEqual([worse.shot_focal, worse.shot_fnumber, worse.shot_exposure, worse.shot_iso], [null, null, null, null]);
  assert.equal(shootingOf({ Photo: { FocalLength: 99999 } }).shot_focal, null);
  assert.equal(shootingOf({ Photo: { ISOSpeedRatings: 3_280_000 } }).shot_iso, 3_280_000);
});

test('format du lexique : boîtier · objectif · focale · vitesse · ouverture · ISO, nombres dans la langue de la page', () => {
  const p = { shot_make: 'Fujifilm', shot_model: 'X-T5', shot_lens: 'XF23mmF1.4 R LM WR', shot_focal: 23, shot_fnumber: 11, shot_exposure: 0.001, shot_iso: 160 };
  assert.equal(shotLine(p, 'fr'), LINE_FR);
  const gr = { shot_make: 'Ricoh', shot_model: 'GR III', shot_focal: 18.3, shot_fnumber: 2.8, shot_exposure: 1 / 250, shot_iso: 400 };
  assert.equal(plain(shotLine(gr, 'fr')), 'Ricoh GR III · 18,3 mm · 1/250 s · f/2,8 · ISO 400');
  assert.equal(plain(shotLine(gr, 'en')), 'Ricoh GR III · 18.3 mm · 1/250 s · f/2.8 · ISO 400');
  assert.equal(plain(shotLine(gr, 'de')), 'Ricoh GR III · 18,3 mm · 1/250 s · f/2,8 · ISO 400');
  // Poses longues : en secondes ; 0,3 s n'est pas une fraction (1/3,3).
  assert.equal(plain(shotLine({ shot_exposure: 2 }, 'fr')), '2 s');
  assert.equal(plain(shotLine({ shot_exposure: 0.3 }, 'fr')), '0,3 s');
  assert.equal(plain(shotLine({ shot_exposure: 0.5 }, 'en')), '1/2 s');
  assert.equal(shotLine({}, 'fr'), '');
  assert.equal(shotLine(null), '');
});

// ---------- dans l'application ----------

const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
async function site(t) {
  const received = [];
  const ctx = await setup(t, { seeded: true, env: VIGIE, vigieOptions: { send: async body => { received.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false } });
  const security = async () => { ctx.app.securite.runTasks(); ctx.app.securite.retryNow(); await ctx.app.securite.flush(); return received; };
  const store = createSessionStore(ctx.db);
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const account = async (sub, { roles = ['admin'], author = null, version = 'v2' } = {}) => {
    ctx.app.accounts.ensure({ sub, name: sub, roles });
    if (author) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId: author }, 'test');
    const token = store.create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token };
    const get = (url, lang) => ctx.app.inject({ url, cookies: lang ? { ...cookies, admin_langue: lang } : cookies, headers: { accept: 'text/html' } });
    const post = (url, payload = {}, { token: tok = csrf } = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, ...(tok ? { _csrf: tok } : {}) } });
    const json = (url, payload) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload });
    const upload = async (buf, name, author = seb) => {
      const boundary = '----prise';
      const part = (n, value, filename) => Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${n}"${filename ? `; filename="${filename}"` : ''}\r\n\r\n`), Buffer.from(value), Buffer.from('\r\n')]);
      const payload = Buffer.concat([part('_csrf', csrf), part('author_id', String(author)), part('category_id', '1'), part('photos', buf, name), Buffer.from(`--${boundary}--\r\n`)]);
      const res = await ctx.app.inject({ method: 'POST', url: '/admin/photos/import', cookies, payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'application/json' } });
      assert.equal(res.statusCode, 200, res.body);
      return res.json().imported[0].id;
    };
    await post('/admin/version', { version, back: '/admin' });
    await get('/admin/aide');
    return { get, post, json, upload };
  };
  const row = id => ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  const form = (p, extra = {}) => ({ title: p.title, slug: p.slug, category_id: String(p.category_id), author_id: String(p.author_id), place: p.place || '',
    taken_on: p.taken_on || '', legend: p.legend || '', status: p.status, watermark: 'default', ...extra });
  // Une photo publiée de Sébastien, avec une prise de vue connue.
  const a = ctx.db.prepare("SELECT * FROM photos WHERE status = 'published' AND author_id = ? ORDER BY position, id LIMIT 1").get(seb);
  ctx.db.prepare(`UPDATE photos SET shot_make = 'Fujifilm', shot_model = 'X-T5', shot_lens = 'XF23mmF1.4 R LM WR', shot_focal = 23, shot_fnumber = 11,
    shot_exposure = 0.001, shot_iso = 160, shot_read = 1, taken_on = '2026-10-10', taken_time = '18:52' WHERE id = ?`).run(a.id);
  const setExif = mode => ctx.db.prepare("INSERT INTO settings (key, value) VALUES ('exif', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ mode }));
  return { ...ctx, security, account, seb, jul, row, form, a: row(a.id), setExif };
}

test('migration 060 : sept colonnes vides, à relire (shot_read 0), montrées par défaut ; ni accounts ni autre table touchés', async t => {
  const c = await setup(t, { seeded: true });
  const cols = c.db.prepare('PRAGMA table_info(photos)').all().map(r => r.name);
  for (const k of [...SHOT_COLUMNS, 'shot_read', 'show_shot']) assert.ok(cols.includes(k), k);
  const row = c.db.prepare('SELECT * FROM photos ORDER BY id LIMIT 1').get();
  assert.equal(row.show_shot, 1);
  assert.throws(() => c.db.prepare('UPDATE photos SET show_shot = 2 WHERE id = ?').run(row.id), /CHECK/);
  assert.throws(() => c.db.prepare('UPDATE photos SET shot_read = 5 WHERE id = ?').run(row.id), /CHECK/);
  const sql = fs.readFileSync(new URL('../server/db/migrations/060_prise_de_vue.sql', import.meta.url), 'utf8').replace(/^--.*$/gm, '');
  assert.deepEqual([...sql.matchAll(/ALTER TABLE (\w+)/g)].map(m => m[1]).filter((v, i, l) => l.indexOf(v) === i), ['photos']);
  assert.doesNotMatch(sql, /accounts/i);
});

test('import : la prise de vue est lue dans l’original et rangée ; rien d’autre en base', async t => {
  const c = await site(t);
  const admin = await c.account('admin-import');
  const id = await admin.upload(await camera(), 'DSCF2117.JPG');
  const r = c.row(id);
  assert.deepEqual(Object.fromEntries(SHOT_COLUMNS.map(k => [k, r[k]])), { shot_make: 'Fujifilm', shot_model: 'X-T5', shot_lens: 'XF23mmF1.4 R LM WR', shot_focal: 23, shot_fnumber: 11, shot_exposure: 0.001, shot_iso: 160 });
  assert.equal(r.shot_read, 1);
  assert.equal(r.show_shot, 1);
  // Aucune valeur cachée de l'EXIF, nulle part dans la base (toutes les tables, toutes les colonnes de texte).
  const tables = c.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all();
  for (const table of tables) {
    for (const line of c.db.prepare(`SELECT * FROM "${table}"`).all()) {
      const text = JSON.stringify(line);
      for (const s of SECRETS.slice(0, 7)) assert.ok(!text.includes(s), `${table} : ${s}`);
    }
  }
  // Une image sans EXIF : lue aussi (rien), le rattrapage n'y reviendra pas.
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#123' } }).png().toBuffer();
  const none = c.row(await admin.upload(png, 'sans.png'));
  assert.equal(none.shot_read, 1);
  assert.ok(SHOT_COLUMNS.every(k => none[k] === null));
});

test('rattrapage : les photos déjà importées sont lues une fois, en arrière-plan, puis plus jamais', async t => {
  const c = await site(t);
  // Une ancienne photo : prise de vue jamais lue, original remplacé par un fichier d'appareil.
  const old = c.db.prepare('SELECT * FROM photos WHERE id != ? ORDER BY id LIMIT 1').get(c.a.id);
  const original = path.join(c.dir, 'originals', old.file);
  fs.writeFileSync(original, await camera({ ifd0: { Make: 'RICOH IMAGING COMPANY, LTD.', Model: 'RICOH GR III' }, ifd2: { LensModel: 'GR LENS 18.3mm F2.8', FocalLength: '183/10', FNumber: '28/10', ExposureTime: '1/250', ISOSpeedRatings: '400' } }));
  c.db.prepare('UPDATE photos SET shot_read = 0 WHERE 1').run();
  // Une autre, dont l'original a disparu : marquée lue, sans rien.
  const lost = c.db.prepare('SELECT * FROM photos WHERE id NOT IN (?, ?) ORDER BY id LIMIT 1').get(c.a.id, old.id);
  fs.rmSync(path.join(c.dir, 'originals', lost.file));
  const fill = createShotBackfill({ db: c.db, storageDir: c.dir });
  const total = c.db.prepare('SELECT COUNT(*) FROM photos').pluck().get();
  let read = 0;
  for (let k; (k = await fill.batch(5)); ) read += k;
  assert.equal(read, total);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM photos WHERE shot_read = 0').pluck().get(), 0);
  const r = c.row(old.id);
  assert.deepEqual([r.shot_make, r.shot_model, r.shot_lens, r.shot_focal, r.shot_fnumber, r.shot_exposure, r.shot_iso], ['Ricoh', 'GR III', 'GR LENS 18.3mm F2.8', 18.3, 2.8, 0.004, 400]);
  assert.ok(SHOT_COLUMNS.every(k => c.row(lost.id)[k] === null));
  // Plus jamais : l'original changé ensuite n'est pas relu.
  fs.writeFileSync(original, await camera({ ifd0: { Make: 'Canon', Model: 'Canon EOS R5' } }));
  assert.equal(await fill.batch(), 0);
  assert.equal(c.row(old.id).shot_make, 'Ricoh');
  // Le service de l'application (onReady) fait la même chose, et s'arrête avec elle.
  c.db.prepare('UPDATE photos SET shot_read = 0 WHERE id = ?').run(old.id);
  assert.equal(await c.app.shotBackfill.all(), 1);
  assert.equal(c.row(old.id).shot_make, 'Canon');
});

test('site public v2 et v3 : la prise de vue dans les données de la visionneuse, en trois langues ; cachée, plus rien', async t => {
  const c = await site(t);
  const LABEL = { '': 'Prise de vue', '/en': 'Camera and settings', '/de': 'Aufnahmedaten' };
  const LINE = { '': 'Fujifilm X-T5 · XF23mmF1.4 R LM WR · 23 mm · 1/1000 s · f/11 · ISO 160', '/en': 'Fujifilm X-T5 · XF23mmF1.4 R LM WR · 23 mm · 1/1000 s · f/11 · ISO 160', '/de': 'Fujifilm X-T5 · XF23mmF1.4 R LM WR · 23 mm · 1/1000 s · f/11 · ISO 160' };
  for (const version of ['v2', 'v3']) {
    c.app.publicVersion.save(version);
    for (const pre of ['', '/en', '/de']) {
      const html = plain((await c.app.inject({ url: `${pre}/photo/${c.a.slug}` })).body);
      assert.ok(html.includes(`<dt>${LABEL[pre]}</dt><dd class="donnee">${LINE[pre]}</dd>`), `${version} ${pre}`);
      // Jamais l'heure à cet endroit (elle suit show_time, décochée ici).
      assert.doesNotMatch(html, /18\s*h\s*52|18:52|6:52/, `${version} ${pre}`);
    }
  }
  // Cachée : ni la ligne, ni une valeur.
  c.db.prepare('UPDATE photos SET show_shot = 0 WHERE id = ?').run(c.a.id);
  for (const version of ['v1', 'v2', 'v3']) {
    c.app.publicVersion.save(version);
    for (const pre of ['', '/en', '/de']) {
      const html = plain((await c.app.inject({ url: `${pre}/photo/${c.a.slug}` })).body);
      assert.doesNotMatch(html, /X-T5|XF23mm|ISO 160|f\/11|1\/1000/, `${version} ${pre}`);
    }
  }
});

test('site public v1 : une seconde ligne de méta, sobre, avec son nom pour les lecteurs d’écran', async t => {
  const c = await site(t);
  c.app.publicVersion.save('v1');
  const fr = plain((await c.app.inject({ url: `/photo/${c.a.slug}` })).body);
  assert.ok(fr.includes('<p class="meta mono shot"><span class="sr-only">Prise de vue :</span> Fujifilm X-T5 · XF23mmF1.4 R LM WR · 23 mm · 1/1000 s · f/11 · ISO 160</p>'), fr.match(/meta mono shot.*/)?.[0]);
  const en = plain((await c.app.inject({ url: `/en/photo/${c.a.slug}` })).body);
  assert.match(en, /<span class="sr-only">Camera and settings:<\/span> Fujifilm X-T5/);
  const de = plain((await c.app.inject({ url: `/de/photo/${c.a.slug}` })).body);
  assert.match(de, /<span class="sr-only">Aufnahmedaten:<\/span> Fujifilm X-T5/);
  // Ni la galerie, ni l'accueil : la page de la photo seulement.
  assert.doesNotMatch((await c.app.inject({ url: '/' })).body, /XF23mm/);
});

test('valeurs EXIF hostiles : échappées sur la page publique et dans l’admin', async t => {
  const c = await site(t);
  c.db.prepare("UPDATE photos SET shot_model = '<script>alert(1)</script>', shot_lens = '\"><img src=x onerror=alert(1)>' WHERE id = ?").run(c.a.id);
  for (const version of ['v1', 'v2']) {
    c.app.publicVersion.save(version);
    const html = (await c.app.inject({ url: `/photo/${c.a.slug}` })).body;
    assert.doesNotMatch(html, /<script>alert|<img src=x/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  }
  for (const version of ['v1', 'v2']) {
    const admin = await c.account(`admin-${version}`, { version });
    const html = (await admin.get(`/admin/photos/${c.a.id}`)).body;
    assert.doesNotMatch(html, /<script>alert|<img src=x/);
  }
});

test('fiche v1 et v2 : la prise de vue en lecture seule et la case, cochée par défaut ; un compte en v1 voit la v1', async t => {
  const c = await site(t);
  const v1 = await c.account('compte-v1', { version: 'v1' });
  const v2 = await c.account('compte-v2');
  const p1 = plain((await v1.get(`/admin/photos/${c.a.id}`)).body);
  const p2 = plain((await v2.get(`/admin/photos/${c.a.id}`)).body);
  // La v1 est la v1 (son gabarit, sa feuille), la v2 la v2.
  assert.ok(p1.includes('<div class="edit">') && !p1.includes('/static/admin/v2/v2.css'));
  assert.ok(!p2.includes('<div class="edit">') && p2.includes('/static/admin/v2/v2.css'));
  for (const html of [p1, p2]) {
    assert.match(html, /Prise de vue : Fujifilm X-T5 · XF23mmF1\.4 R LM WR · 23 mm · 1\/1000 s · f\/11 · ISO 160/);
    assert.match(html, /<input type="hidden" name="show_shot_case" value="1">/);
    assert.match(html, /name="show_shot" value="1"[^>]* checked/);
    assert.match(html, /Montrer la prise de vue sur le site/);
  }
  assert.match(p1, /<label class="inline"><input type="checkbox" name="show_shot"/);
  assert.match(p2, /data-champ="show_shot" data-label="Prise de vue sur le site"/);
  // Mode des images : « Prise de vue » dit que les fichiers suivent la case ; « tout l'EXIF » prévient.
  c.setExif('shooting');
  assert.match(plain((await v2.get(`/admin/photos/${c.a.id}`)).body), /Les images servies \(métadonnées « Prise de vue »\) les portent selon ce choix\./);
  c.setExif('all');
  for (const a of [v1, v2]) assert.match(plain((await a.get(`/admin/photos/${c.a.id}`)).body), /les images servies portent la prise de vue \(et la position GPS\), quel que soit ce choix/);
  // Photo sans prise de vue : pas de case ; lue ou pas encore lue, la fiche le dit.
  const other = c.db.prepare('SELECT id FROM photos WHERE id != ? ORDER BY id LIMIT 1').pluck().get(c.a.id);
  c.db.prepare('UPDATE photos SET shot_read = 1 WHERE id = ?').run(other);
  for (const a of [v1, v2]) {
    const html = plain((await a.get(`/admin/photos/${other}`)).body);
    assert.doesNotMatch(html, /name="show_shot"/);
    assert.match(html, /Prise de vue : aucune dans l’EXIF de l’original/);
  }
  c.db.prepare('UPDATE photos SET shot_read = 0 WHERE id = ?').run(other);
  assert.match(plain((await v1.get(`/admin/photos/${other}`)).body), /Prise de vue : pas encore lue dans l’original/);
  // En anglais et en allemand.
  for (const a of [v1, v2]) {
    assert.match(plain((await a.get(`/admin/photos/${c.a.id}`, 'en')).body), /Camera and settings: Fujifilm X-T5[\s\S]*Show the camera and settings on the site/);
    assert.match(plain((await a.get(`/admin/photos/${c.a.id}`, 'de')).body), /Aufnahmedaten: Fujifilm X-T5[\s\S]*Aufnahmedaten auf der Website zeigen/);
  }
});

test('case : enregistrée par la fiche (avec ou sans script) et champ par champ ; valeurs forgées ramenées à 0 ou 1', async t => {
  const c = await site(t);
  const admin = await c.account('admin-case', { version: 'v1' });
  // Formulaire de la fiche, case décochée : le navigateur n'envoie que show_shot_case.
  assert.equal((await admin.post(`/admin/photos/${c.a.id}`, c.form(c.a, { show_shot_case: '1' }))).statusCode, 303);
  assert.equal(c.row(c.a.id).show_shot, 0);
  assert.equal((await admin.post(`/admin/photos/${c.a.id}`, c.form(c.a, { show_shot_case: '1', show_shot: '1' }))).statusCode, 303);
  assert.equal(c.row(c.a.id).show_shot, 1);
  // Un formulaire sans la case (autre écran) ne la touche pas.
  c.db.prepare('UPDATE photos SET show_shot = 0 WHERE id = ?').run(c.a.id);
  await admin.post(`/admin/photos/${c.a.id}`, c.form(c.a));
  assert.equal(c.row(c.a.id).show_shot, 0);
  // Valeurs forgées.
  for (const [value, want] of [['1', 1], ['on', 1], ['2', 0], ['oui', 0], [['1', '1'], 0], ['', 0], ['1 OR 1=1', 0]]) {
    c.db.prepare('UPDATE photos SET show_shot = ? WHERE id = ?').run(want ? 0 : 1, c.a.id);
    await admin.post(`/admin/photos/${c.a.id}`, c.form(c.row(c.a.id), { show_shot_case: '1', show_shot: value }));
    assert.equal(c.row(c.a.id).show_shot, want, JSON.stringify(value));
  }
  // Champ par champ (fiche v2 avec script) : « on » ou vide ; un autre champ ne la touche pas.
  assert.equal((await admin.json(`/admin/photos/${c.a.id}/champs`, { show_shot: '' })).statusCode, 200);
  assert.equal(c.row(c.a.id).show_shot, 0);
  assert.equal((await admin.json(`/admin/photos/${c.a.id}/champs`, { show_shot: 'on' })).statusCode, 200);
  assert.equal(c.row(c.a.id).show_shot, 1);
  assert.equal((await admin.json(`/admin/photos/${c.a.id}/champs`, { title: 'Autre titre' })).statusCode, 200);
  assert.equal(c.row(c.a.id).show_shot, 1);
  assert.equal((await admin.json(`/admin/photos/${c.a.id}/champs`, { show_shot: { $ne: 0 } })).statusCode, 200);
  assert.equal(c.row(c.a.id).show_shot, 0);
  // Le lot (« Compléter le lot ») et les textes ne la touchent pas.
  await admin.post('/admin/photos/lot', { ids: String(c.a.id), [`title_${c.a.id}`]: 'Titre du lot' });
  assert.equal(c.row(c.a.id).show_shot, 0);
});

test('droits : ceux des champs voisins ; journal avec le nom du champ ; pas de privacy_exposure_changed', async t => {
  const c = await site(t);
  const seb = await c.account('zitadel-seb', { roles: ['photographe'], author: c.seb, version: 'v1' });
  // Sa photo : permis.
  assert.equal((await seb.post(`/admin/photos/${c.a.id}`, c.form(c.a, { show_shot_case: '1' }))).statusCode, 303);
  assert.equal(c.row(c.a.id).show_shot, 0);
  // Celle de Julien : hors de sa portée, sous toutes les adresses.
  const other = c.db.prepare('SELECT * FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').get(c.jul);
  assert.equal((await seb.post(`/admin/photos/${other.id}`, c.form(other, { show_shot_case: '1', author_id: String(c.seb) }))).statusCode, 404);
  assert.equal((await seb.json(`/admin/photos/${other.id}/champs`, { show_shot: '' })).statusCode, 404);
  assert.equal(c.row(other.id).show_shot, 1);
  // Relecteur (textes seuls) : la case n'est pas un texte.
  const rel = await c.account('relecteur', { roles: ['relecteur'] });
  assert.equal((await rel.json(`/admin/photos/${other.id}/champs`, { show_shot: '' })).statusCode, 403);
  assert.equal((await rel.post(`/admin/photos/${other.id}`, c.form(other, { show_shot_case: '1' }))).statusCode, 403);
  await rel.post(`/admin/photos/${other.id}/textes`, { title: other.title, legend: other.legend || '', show_shot_case: '1' });
  assert.equal(c.row(other.id).show_shot, 1);
  // Sans jeton CSRF : refusé.
  const admin = await c.account('admin-droits');
  assert.ok((await admin.post(`/admin/photos/${other.id}`, c.form(other, { show_shot_case: '1' }), { token: null })).statusCode >= 400);
  assert.equal(c.row(other.id).show_shot, 1);
  // Journal : le nom du champ, jamais sa valeur.
  await c.security();
  const before = (await c.security()).length;
  assert.equal((await admin.json(`/admin/photos/${other.id}/champs`, { show_shot: '' })).statusCode, 200);
  const line = c.db.prepare("SELECT detail FROM audit_log WHERE action = 'POST /admin/photos/:id/champs' ORDER BY id DESC LIMIT 1").pluck().get();
  assert.equal(line, 'champs : show_shot');
  await admin.json(`/admin/photos/${other.id}/champs`, { show_shot: 'on' });
  // Ce n'est pas une donnée personnelle : la Vigie ne reçoit pas de privacy_exposure_changed pour cette case.
  const events = (await c.security()).slice(before);
  assert.ok(!events.some(e => e.type === 'privacy_exposure_changed'), JSON.stringify(events.map(e => e.type)));
});

test('images servies : en mode « Prise de vue », les six données seulement, et seulement si la case est cochée', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prise-de-vue-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'originals'));
  const file = '33333333-3333-3333-3333-333333333333.jpg';
  fs.writeFileSync(path.join(dir, 'originals', file), await camera({ width: 800, height: 500 }));
  const P = { id: 1, author: 'Julien', title: 'Miradouro', taken_on: '2026-10-10', taken_time: '18:52', show_time: 0, created_at: '2026-01-01 10:00:00', watermark: null };
  const ctx = { watermark: WATERMARK_DEFAULTS, exif: { mode: 'shooting' }, siteName: 'Nicephos', watermarkDir: '/tmp' };
  const shown = specFor({ ...P, show_shot: 1 }, ctx), hidden = specFor({ ...P, show_shot: 0 }, ctx);
  assert.notEqual(shown.key, hidden.key);
  assert.equal(hidden.meta.shot, 0);
  assert.equal('shot' in shown.meta, false, 'montrée (par défaut) : l’empreinte d’avant la migration, pas de recalcul au déploiement');
  assert.equal(specFor(P, ctx).key, shown.key);
  // Les autres modes ne dépendent pas de la case.
  for (const mode of ['none', 'rights', 'all']) assert.equal(specFor({ ...P, show_shot: 0 }, { ...ctx, exif: { mode } }).key, specFor({ ...P, show_shot: 1 }, { ...ctx, exif: { mode } }).key, mode);
  const fileOf = (key, w = 640, f = 'webp') => path.join(dir, 'variants', variantName(file, w, f, key));
  const read = async (key, f = 'webp') => { const buf = fs.readFileSync(fileOf(key, 640, f)); const m = await sharp(buf).metadata(); return { buf, exif: m.exif ? exifReader(m.exif) : null, raw: Buffer.concat([m.exif || Buffer.alloc(0), m.xmp || Buffer.alloc(0)]).toString('latin1') }; };
  await renderVariants(dir, file, { key: shown.key, meta: shown.meta });
  await renderVariants(dir, file, { key: hidden.key, meta: hidden.meta });
  // Ce que libvips écrit de lui-même (structure du fichier), à côté des six données et des droits.
  const STRUCT = ['XResolution', 'YResolution', 'ResolutionUnit', 'YCbCrPositioning', 'ExifTag', 'Orientation', 'ExifVersion', 'ComponentsConfiguration', 'FlashpixVersion', 'ColorSpace', 'PixelXDimension', 'PixelYDimension', 'InteropTag'];
  for (const f of ['webp', 'avif']) {
    const on = await read(shown.key, f);
    assert.equal(on.exif.Image.Make, 'FUJIFILM');
    assert.equal(on.exif.Image.Model, 'X-T5');
    assert.equal(on.exif.Photo.LensModel, 'XF23mmF1.4 R LM WR');
    assert.equal(on.exif.Photo.FocalLength, 23);
    assert.equal(on.exif.Photo.FNumber, 11);
    assert.equal(on.exif.Photo.ExposureTime, 0.001);
    assert.equal(on.exif.Photo.ISOSpeedRatings, 160);
    assert.equal(on.exif.Image.Artist, 'Julien');
    assert.equal(on.exif.GPSInfo, undefined);
    const keys = [...Object.keys(on.exif.Image), ...Object.keys(on.exif.Photo)].filter(k => !STRUCT.includes(k)).sort();
    assert.deepEqual(keys, ['Artist', 'Copyright', 'ExposureTime', 'FNumber', 'FocalLength', 'ISOSpeedRatings', 'LensModel', 'Make', 'Model'], f);
    for (const s of SECRETS.slice(0, 7)) assert.ok(!on.raw.includes(s), `${f} : ${s}`);
    // Cachée : les droits seulement.
    const off = await read(hidden.key, f);
    const offKeys = [...Object.keys(off.exif.Image), ...Object.keys(off.exif.Photo || {})].filter(k => !STRUCT.includes(k)).sort();
    assert.deepEqual(offKeys, ['Artist', 'Copyright'], f);
    for (const s of [...SECRETS.slice(0, 7), 'FUJIFILM', 'X-T5', 'XF23mm']) assert.ok(!off.raw.includes(s), `${f} : ${s}`);
  }
});

test('dans l’application : la case recalcule les images ; republiée avec la case cochée, toujours les six données seules', async t => {
  const c = await site(t);
  c.setExif('shooting');
  const admin = await c.account('admin-images', { version: 'v1' });
  const id = await admin.upload(await camera(), 'DSCF2117.JPG');
  await c.app.variants.idle();
  const exifOf = async () => { const r = c.row(id); const m = await sharp(path.join(c.dir, 'variants', variantName(r.file, 640, 'webp', r.variant_key))).metadata(); return { exif: exifReader(m.exif), raw: Buffer.concat([m.exif, m.xmp || Buffer.alloc(0)]).toString('latin1') }; };
  const first = c.row(id).variant_key;
  assert.equal((await exifOf()).exif.Image.Make, 'FUJIFILM');
  // Publiée, case décochée : nouvelles images, sans boîtier.
  let p = c.row(id);
  assert.equal((await admin.post(`/admin/photos/${id}`, c.form(p, { title: 'Miradouro', slug: '', status: 'published', show_shot_case: '1' }))).statusCode, 303);
  await c.app.variants.idle();
  assert.notEqual(c.row(id).variant_key, first);
  const off = await exifOf();
  assert.equal(off.exif.Image.Make, undefined);
  assert.equal(off.exif.Photo?.LensModel, undefined);
  // Dépubliée puis republiée, case cochée : les six données, rien d'autre de l'original.
  p = c.row(id);
  await admin.post(`/admin/photos/${id}`, c.form(p, { status: 'draft', show_shot_case: '1' }));
  p = c.row(id);
  await admin.post(`/admin/photos/${id}`, c.form(p, { status: 'published', show_shot_case: '1', show_shot: '1' }));
  await c.app.variants.idle();
  assert.equal(c.row(id).variant_key, first, 'même empreinte que l’import : mêmes réglages');
  const on = await exifOf();
  assert.equal(on.exif.Image.Make, 'FUJIFILM');
  assert.equal(on.exif.GPSInfo, undefined);
  for (const s of SECRETS.slice(0, 7)) assert.ok(!on.raw.includes(s), s);
  // La page publique non plus.
  for (const version of ['v1', 'v2', 'v3']) {
    c.app.publicVersion.save(version);
    const html = (await c.app.inject({ url: `/photo/${c.row(id).slug}` })).body;
    assert.match(plain(html), /Fujifilm X-T5/, version);
    for (const s of SECRETS.slice(0, 7)) assert.ok(!html.includes(s), `${version} : ${s}`);
  }
});
