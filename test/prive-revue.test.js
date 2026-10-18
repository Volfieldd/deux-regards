import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup, VIGIE_KEYS } from './helpers.js';
import { redactUrl } from '../server/app.js';

// Non-régression des sept constats de la revue de sécurité de la PR #149 (galeries privées) : réouverture par les
// réglages, archives simultanées, photos à vérifier montrées, téléchargements sans filigrane, jeton dans les journaux,
// contact non échappé, vue équipe malgré un blocage de l'administration.
const ORIGIN = 'http://localhost:3000';
const FORM = { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN };
const TOKEN = 'jeton-de-test-0123456789';
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const enc = o => new URLSearchParams(o).toString();
const cookieOf = res => [].concat(res.headers['set-cookie'] || []).map(x => x.split(';')[0]).find(x => /visiteur=/.test(x));
const csrfOf = body => /name="csrf" value="([^"]+)"/.exec(body)?.[1];

async function site(t, { vigie = false } = {}) {
  const events = [];
  const c = vigie ? await setup(t, { seeded: true, env: { ...VIGIE, LOCAL_AUTH_TOKEN: TOKEN }, vigieOptions: { send: async body => { events.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false } })
    : await setup(t, { seeded: true, env: { VIGIE_URL: '', LOCAL_AUTH_TOKEN: TOKEN } });
  c.events = async type => { c.app.securite.retryNow?.(); await c.app.securite.flush?.(); return events.filter(e => e.type === type); };
  c.login = async author => {
    const res = await c.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author, next: '/admin' } });
    const cookies = Object.fromEntries(res.cookies.filter(x => x.value).map(x => [x.name, x.value]));
    const sub = c.db.prepare('SELECT sub FROM sessions ORDER BY created_at DESC LIMIT 1').pluck().get();
    const csrf = c.db.prepare('SELECT csrf FROM sessions WHERE sub = ?').pluck().get(sub);
    return { cookies, csrf, get: url => c.app.inject({ url, cookies }), post: (url, payload = {}) => c.app.inject({ method: 'POST', url, cookies, payload: { _csrf: csrf, ...payload } }) };
  };
  return c;
}
async function gallery(c, { n = 3, rights = { favoris: '1' } } = {}) {
  const sp = c.app.spaces;
  const authorId = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const id = sp.createSpace({ title: 'Lisbonne', closes: day(60) }, { authorId, by: 'test' });
  sp.addPhotos(id, c.db.prepare("SELECT id FROM photos WHERE status = 'published' AND author_id = ? ORDER BY id LIMIT ?").pluck().all(authorId, n));
  sp.setState(id, 'ouverte', null);
  const r = await sp.createInvite(id, { label: 'Lucie', lang: 'fr', expires: day(30), ...rights }, { by: 'test', request: null });
  return { s: sp.get(id), token: r.token, password: r.password, invite: r.id };
}
async function enter(c, g) {
  const res = await c.app.inject({ method: 'POST', url: `/g/${g.token}`, headers: FORM, payload: enc({ password: g.password }) });
  assert.equal(res.statusCode, 303);
  return cookieOf(res);
}

test('revue 1 : enregistrer les réglages d’une galerie fermée ne la rouvre pas ; seule « Ouvrir » la rouvre, notée et signalée (BV-23)', async t => {
  const c = await site(t, { vigie: true });
  const g = await gallery(c);
  const a = await c.login('julien');
  assert.equal((await a.post(`/admin/galeries/${g.s.id}/fermer`)).statusCode, 303);
  const form = (await a.get(`/admin/galeries/${g.s.id}/reglages`)).body;
  const closes = /name="closes" maxlength="40" value="([^"]*)"/.exec(form)[1];
  assert.equal((await a.post(`/admin/galeries/${g.s.id}`, { title: 'Lisbonne (coquille corrigée)', closes })).statusCode, 303);
  assert.equal(c.app.spaces.get(g.s.id).state, 'fermee');
  assert.equal((await c.app.inject(`/g/${g.token}`)).statusCode, 410);
  // Galerie échue dont on repousse la date : toujours fermée.
  c.db.prepare('UPDATE private_spaces SET closes_at = ? WHERE id = ?').run(Date.now() - 1000, g.s.id);
  await a.post(`/admin/galeries/${g.s.id}`, { title: 'Lisbonne', closes: day(90) });
  assert.equal(c.app.spaces.get(g.s.id).state, 'fermee');
  const before = (await c.events('privacy_exposure_changed')).filter(e => e.detail.action === 'espace_ouvert').length;
  assert.equal((await a.post(`/admin/galeries/${g.s.id}/ouvrir`)).statusCode, 303);
  assert.equal(c.app.spaces.get(g.s.id).state, 'ouverte');
  assert.equal((await c.events('privacy_exposure_changed')).filter(e => e.detail.action === 'espace_ouvert').length, before + 1);
  assert.ok(c.db.prepare("SELECT 1 FROM audit_log WHERE action = 'galerie privée : galerie ouverte'").get());
});

test('revue 2 : 8 archives demandées en même temps donnent 3 archives (limite du jour), écrites en flux, ZIP valide', async t => {
  const c = await site(t);
  const g = await gallery(c, { n: 2, rights: { telecharger: '1' } });
  const cookie = await enter(c, g);
  const csrf = csrfOf((await c.app.inject({ url: `/prive/${g.s.public_id}`, headers: { cookie } })).body);
  const post = () => c.app.inject({ method: 'POST', url: `/prive/${g.s.public_id}/archive`, headers: { ...FORM, cookie }, payload: enc({ csrf }) });
  const rs = await Promise.all(Array.from({ length: 8 }, post));
  assert.equal(rs.filter(r => /\/archive\/\d+$/.test(r.headers.location || '')).length, 3);
  assert.equal(rs.filter(r => /etat=archive-limite/.test(r.headers.location || '')).length, 5);
  const rows = c.db.prepare('SELECT * FROM space_archives WHERE invite_id = ?').all(g.invite);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    const buf = fs.readFileSync(path.join(c.config.storageDir, 'private', 'archives', row.file));
    assert.equal(buf.length, row.bytes);
    assert.equal(buf.subarray(0, 4).toString('hex'), '504b0304');
    const end = buf.subarray(buf.length - 22);
    assert.equal(end.readUInt32LE(0), 0x06054b50);
    assert.equal(end.readUInt16LE(10), 2);                                                  // deux photos
    assert.equal(row.photos, 2);
  }
});

test('revue 3 : une photo à vérifier non confirmée est cachée aux invités (page et image), l’admin dit combien ; confirmée, elle s’affiche (G61, M17, T27)', async t => {
  const c = await site(t);
  const g = await gallery(c, { n: 2 });
  const item = c.db.prepare('SELECT i.id, p.id AS pid, p.file, p.width, p.variant_key FROM space_items i JOIN photos p ON p.id = i.photo_id WHERE i.space_id = ? ORDER BY i.position LIMIT 1').get(g.s.id);
  c.db.prepare('UPDATE photos SET faces = 1 WHERE id = ?').run(item.pid);
  const cookie = await enter(c, g);
  const page = (await c.app.inject({ url: `/prive/${g.s.public_id}`, headers: { cookie } })).body;
  assert.equal((page.match(/class="favorisable/g) || []).length, 1);
  const { variantName, widthsFor } = await import('../server/images.js');
  const img = `/prive/${g.s.public_id}/m/${variantName(item.file, widthsFor(item.width)[0], 'webp', item.variant_key)}`;
  assert.equal((await c.app.inject({ url: img, headers: { cookie } })).statusCode, 404);
  const a = await c.login('julien');
  assert.match((await a.get(`/admin/galeries/${g.s.id}`)).body, /1 photo cachée aux invités/);
  assert.match((await a.get(`/admin/galeries/${g.s.id}/acces/nouveau`)).body, /cachée aux invités tant que vous ne la confirmez pas/);
  assert.doesNotMatch((await a.get(`/admin/galeries/${g.s.id}/acces/nouveau`)).body, /Rien ne bloque/);
  await a.post(`/admin/galeries/${g.s.id}/photos/${item.id}/confirmer`);
  assert.equal(((await c.app.inject({ url: `/prive/${g.s.public_id}`, headers: { cookie } })).body.match(/class="favorisable/g) || []).length, 2);
  assert.equal((await c.app.inject({ url: img, headers: { cookie } })).statusCode, 200);
});

test('revue 4 : les téléchargements portent le filigrane du site, refaits quand il change ; sans_filigrane dit la vérité (G42, G44, BV-23)', async t => {
  const c = await site(t, { vigie: true });
  const g = await gallery(c, { n: 1, rights: { telecharger: '1' } });
  const cookie = await enter(c, g);
  const dir = path.join(c.config.storageDir, 'private', 'telechargements');
  const url = `/prive/${g.s.public_id}/telecharger/1/web`;
  const plain = (await c.app.inject({ url, headers: { cookie } })).rawPayload;
  assert.equal(fs.readdirSync(dir).length, 1);
  assert.match(fs.readdirSync(dir)[0], /-brut-web\.jpg$/);
  const setWm = v => c.db.prepare("INSERT INTO settings (key, value) VALUES ('watermark', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(v));
  setWm({ enabled: true, kind: 'text', text: '© Julien', font: 'serif', tone: 'light', position: 'centre', opacity: 100, size: 40, margin: 3, minWidth: 0, image: null });
  const photoId = c.db.prepare('SELECT photo_id FROM space_items WHERE space_id = ?').pluck().get(g.s.id);
  const key = c.app.variants.specOf(photoId).key;
  assert.match(key, /^[0-9a-f]{8}$/);
  const marked = (await c.app.inject({ url, headers: { cookie } })).rawPayload;
  assert.deepEqual(fs.readdirSync(dir), [fs.readdirSync(dir).find(f => f.includes(`-${key}-web.jpg`))], 'rendu refait, l’ancien effacé');
  // Le filigrane change les pixels (même taille, même photo).
  const [m1, m2] = await Promise.all([plain, marked].map(b => sharp(b).raw().toBuffer({ resolveWithObject: true })));
  assert.deepEqual([m1.info.width, m1.info.height], [m2.info.width, m2.info.height]);
  assert.ok(!crypto.timingSafeEqual(crypto.createHash('sha256').update(m1.data).digest(), crypto.createHash('sha256').update(m2.data).digest()));
  // Vigie : sans_filigrane faux avec le filigrane, vrai sans.
  c.app.spaces.updateInvite(g.invite, { telecharger: '1', grande: '1', expires: day(30) }, null);
  setWm({ enabled: false });
  c.app.spaces.updateInvite(g.invite, { telecharger: '1', grande: '1', favoris: '1', expires: day(31) }, null);
  const ex = (await c.events('privacy_exposure_changed')).filter(e => e.detail.objet === 'acces_prive' && ['droits_elargis', 'prolonge'].includes(e.detail.action));
  assert.equal(ex[0].detail.sans_filigrane, false);
  assert.equal(ex.at(-1).detail.sans_filigrane, true);
});

test('revue 5 : redactUrl masque le jeton d’un lien sous toutes ses formes', () => {
  const tok = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  for (const u of [`/g/${tok}`, `//g/${tok}`, `/x?next=https://photos.example/g/${tok}`, `/langue/fr?vers=%2Fg%2F${tok}`, `/fr/g/${tok}`, `/G/${tok}`, `/g/${tok}/`, `/./g/${tok}`, `/en/g/${tok}?x=1`])
    assert.ok(!redactUrl(u).includes(tok) && redactUrl(u).includes('[masqué]'), u);
  assert.equal(redactUrl('/galerie/x'), '/galerie/x');
});

test('revue 6 : contact échappé dans les pages privées, restreint à une adresse sûre, validé à l’enregistrement', async t => {
  const c = await site(t);
  const evil = 'x"><meta/http-equiv="refresh"/content="0;url=//evil.example">@a.b';
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('privacy_contact', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(evil));
  const sp = c.app.spaces;
  const id = sp.createSpace({ title: 'X', closes: day(60) }, { authorId: null, by: 't' });
  sp.setState(id, 'ouverte', null);
  const r = await sp.createInvite(id, { label: 'L', lang: 'fr', expires: day(30) }, { by: 't', request: null });
  for (const res of [await c.app.inject(`/g/${r.token}`), (sp.revoke(r.id, null), await c.app.inject(`/g/${r.token}`))]) {
    assert.doesNotMatch(res.body, /<meta\/http-equiv/);
    assert.doesNotMatch(res.body, /href="mailto:x"/);
  }
  // Une adresse sûre reste un lien mailto:.
  c.db.prepare("UPDATE settings SET value = ? WHERE key = 'privacy_contact'").run(JSON.stringify('julien@exemple.fr'));
  assert.match((await c.app.inject(`/g/${r.token}`)).body, /href="mailto:julien@exemple.fr"/);
  // À l'enregistrement : refusé.
  const a = await c.login('julien');
  const res = await a.post('/admin/reglages', { part: 'droits', privacy_contact: evil });
  assert.equal(res.statusCode, 303);
  assert.equal(JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'privacy_contact'").pluck().get()), 'julien@exemple.fr');
  await a.post('/admin/reglages', { part: 'droits', privacy_contact: 'contact@nicephos.art', rights_contact: 'https://www.nicephos.art/bonjour' });
  assert.equal(JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'privacy_contact'").pluck().get()), 'contact@nicephos.art');
});

test('revue 7 : vue équipe refusée à une adresse bloquée pour l’administration par la Vigie ; téléchargement de l’équipe signalé (sensitive_export)', async t => {
  const c = await site(t, { vigie: true });
  const g = await gallery(c, { n: 1 });
  const a = await c.login('julien');
  const view = ip => c.app.inject({ url: `/prive/${g.s.public_id}`, remoteAddress: ip, cookies: a.cookies });
  assert.equal((await view('198.51.100.5')).statusCode, 200);
  const real = c.app.decisions.blocked.bind(c.app.decisions);
  c.app.decisions.blocked = (ip, p) => (ip === '203.0.113.66' && /^\/admin/.test(p) ? 'admin' : real(ip, p));
  assert.equal((await view('203.0.113.66')).statusCode, 404);
  assert.equal((await view('198.51.100.5')).statusCode, 200);
  const dl = await c.app.inject({ url: `/prive/${g.s.public_id}/telecharger/1/web`, remoteAddress: '198.51.100.5', cookies: a.cookies });
  assert.equal(dl.statusCode, 200);
  const ex = (await c.events('sensitive_export')).filter(e => e.detail.nature === 'telechargement');
  assert.equal(ex.length, 1);
  assert.equal(ex[0].detail.espace, g.s.id);
});
