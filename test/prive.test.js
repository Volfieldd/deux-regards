import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import sharp from 'sharp';
import { setup, VIGIE_KEYS } from './helpers.js';
import { variantName, widthsFor } from '../server/images.js';

// Galeries privées, côté invité (annexe de sécurité docs/etudes/annexe-galeries-privees-securite.md, § 6, T1 à T22,
// T32, T34, T35 ; décisions « Tranché » du registre de la Vigie) : lien et mot de passe, essais et verrous, sessions,
// révocation, images, téléchargements, en-têtes, journaux.
const ORIGIN = 'http://localhost:3000';
const FORM = { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN };
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const enc = o => new URLSearchParams(o).toString();

function fakeVigie() {
  const v = { events: [] };
  v.send = async (body, headers) => {
    assert.equal(headers['x-vigie-sig'], crypto.createHmac('sha256', KEY).update(`${headers['x-vigie-ts']}.${headers['x-vigie-nonce']}.${body}`).digest('hex'));
    v.events.push(...JSON.parse(body).lot);
  };
  v.of = type => v.events.filter(e => e.type === type);
  return v;
}
async function site(t, { vigie = false, env = {}, logger } = {}) {
  const fake = fakeVigie();
  const c = vigie ? await setup(t, { seeded: true, logger, env: { ...VIGIE, ...env }, vigieOptions: { send: fake.send, timers: false, pollDecisions: false } })
    : await setup(t, { seeded: true, logger, env: { VIGIE_URL: '', ...env } });
  c.flush = async () => { c.app.securite.runTasks?.(); c.app.securite.retryNow?.(); await c.app.securite.flush?.(); return fake; };
  return c;
}
// Une galerie ouverte de n photos publiées et un accès : { s, token, password, invite }.
async function gallery(c, { author = 'julien', n = 4, rights = { favoris: '1' }, lang = 'fr', expires = day(30), open = true, title = 'Lisbonne et Porto' } = {}) {
  const sp = c.app.spaces;
  const authorId = c.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(author);
  const id = sp.createSpace({ title, title_de: 'Lissabon und Porto', closes: day(60), intro: 'Marquez d’une étoile celles qui vous intéressent.' }, { authorId, by: 'test' });
  sp.addPhotos(id, c.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT ?").pluck().all(n));
  if (open) sp.setState(id, 'ouverte', null);
  const r = await sp.createInvite(id, { label: 'Lucie Exemple, Éditions du Fleuve', lang, expires, ...rights }, { by: 'test', request: null });
  return { s: sp.get(id), token: r.token, password: r.password, invite: r.id };
}
const cookieOf = res => [].concat(res.headers['set-cookie'] || []).map(x => x.split(';')[0]).find(x => /visiteur=/.test(x));
// Avec une session visiteur déjà ouverte, le formulaire porte son jeton CSRF (G28) : il est lu sur la page du lien.
async function enter(c, g, { ip = '127.0.0.1', remember = false, cookie, password = g.password } = {}) {
  const csrf = cookie ? csrfOf((await c.app.inject({ url: `/g/${g.token}`, remoteAddress: ip, headers: { cookie } })).body) : null;
  const res = await c.app.inject({ method: 'POST', url: `/g/${g.token}`, remoteAddress: ip, headers: { ...FORM, ...(cookie ? { cookie } : {}) }, payload: enc({ password, ...(remember ? { remember: '1' } : {}), ...(csrf ? { csrf } : {}) }) });
  return { res, cookie: cookieOf(res) || cookie };
}
const csrfOf = body => /name="csrf" value="([^"]+)"/.exec(body)?.[1];

test('lien : jeton mal formé ou inconnu, 404 ordinaire ; fini, révoqué, galerie fermée : 410 sans le titre (T1 à T3, G11)', async t => {
  const c = await site(t);
  const g = await gallery(c);
  const other = await c.app.inject('/page-qui-n-existe-pas');
  const strip = b => b.replace(/vers=[^"]*/g, '');
  for (const url of ['/g/court', `/g/${'x'.repeat(33)}`, `/g/${'A'.repeat(32)}`]) {
    const r = await c.app.inject(url);
    assert.equal(r.statusCode, 404, url);
    assert.equal(strip(r.body), strip(other.body), `${url} : même page que toute page absente`);
  }
  assert.equal((await c.app.inject(`/g/${g.token}`)).statusCode, 200);
  // Révoqué : 410, le titre de la galerie n'apparaît pas.
  c.app.spaces.revoke(g.invite, null);
  let r = await c.app.inject(`/g/${g.token}`);
  assert.equal(r.statusCode, 410);
  assert.doesNotMatch(r.body, /Lisbonne/);
  // Échu : 410 avec la date.
  const g2 = await gallery(c);
  c.db.prepare('UPDATE space_invites SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, g2.invite);
  r = await c.app.inject(`/g/${g2.token}`);
  assert.equal(r.statusCode, 410);
  assert.match(r.body, /Cet accès a pris fin le/);
  assert.doesNotMatch(r.body, /Lisbonne/);
  // Galerie fermée : 410 ; en brouillon : 404 (l'équipe seule).
  const g3 = await gallery(c);
  c.app.spaces.setState(g3.s.id, 'fermee', null);
  assert.equal((await c.app.inject(`/g/${g3.token}`)).statusCode, 410);
  const g4 = await gallery(c, { open: false });
  assert.equal((await c.app.inject(`/g/${g4.token}`)).statusCode, 404);
});

test('lien : le GET ne consomme rien (« lien consulté », une fois par adresse et par jour, sans « ouvert ») ; page neutre (T4, T35, G12, G33)', async t => {
  const c = await site(t);
  const g = await gallery(c);
  for (let i = 0; i < 3; i++) await c.app.inject({ url: `/g/${g.token}`, remoteAddress: '198.51.100.4' });
  await c.app.inject({ url: `/g/${g.token}`, remoteAddress: '192.0.2.99', headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot)' } });
  const inv = c.db.prepare('SELECT * FROM space_invites WHERE id = ?').get(g.invite);
  assert.equal(inv.first_opened_at, null);
  assert.equal(inv.failed_count, 0);
  const ev = c.db.prepare("SELECT ip, robot FROM space_events WHERE invite_id = ? AND kind = 'lien_consulte' ORDER BY id").all(g.invite);
  assert.deepEqual(ev, [{ ip: '198.51.100.0', robot: 0 }, { ip: '192.0.2.0', robot: 1 }]);
  const r = await c.app.inject(`/g/${g.token}`);
  // Neutre : ni titre, ni nom de l'invité, ni Open Graph, ni canonical, ni hreflang, ni lien /langue/, ni lien sortant.
  assert.match(r.body, /<title>Galerie privée\u00a0· Test<\/title>/);
  for (const re of [/Lisbonne/, /Lucie/, /og:/, /rel="canonical"/, /hreflang/, /\/langue\//, /href="https?:\/\//]) assert.doesNotMatch(r.body, re);
  assert.match(r.body, /autocomplete="current-password"/);
  assert.match(r.body, /<meta name="robots" content="noindex">/);
});

test('mot de passe : refusé (403, essais restants), accepté avec une saisie tolérante, 303 vers /prive/<id> ; empreintes seules en base (T5, T8, G15)', async t => {
  const c = await site(t, { env: { PUBLIC_URL: 'https://photos.example', COOKIE_SECRET: 'x'.repeat(40) } });
  const g = await gallery(c);
  const origin = { ...FORM, origin: 'https://photos.example' };
  let r = await c.app.inject({ method: 'POST', url: `/g/${g.token}`, headers: origin, payload: enc({ password: 'AAAA-BBBB-CCCC' }) });
  assert.equal(r.statusCode, 403);
  assert.match(r.body, /ne correspond pas[\s\S]*Encore 4 essais avant une pause d’une minute/);
  assert.match(r.body, /aria-invalid="true"/);
  assert.doesNotMatch(r.body, /AAAA-BBBB-CCCC/);                                   // jamais renvoyé dans la page
  assert.equal(c.db.prepare('SELECT failed_count FROM space_invites WHERE id = ?').pluck().get(g.invite), 1);
  const typed = `  ${g.password.toLowerCase().replace(/-/g, ' ')} `;
  r = await c.app.inject({ method: 'POST', url: `/g/${g.token}`, headers: origin, payload: enc({ password: typed }) });
  assert.equal(r.statusCode, 303);
  assert.equal(r.headers.location, `/prive/${g.s.public_id}`);
  const raw = [].concat(r.headers['set-cookie']).find(x => x.startsWith('__Host-visiteur='));
  assert.ok(raw, 'cookie __Host-visiteur');
  for (const a of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.match(raw, new RegExp(a));
  assert.doesNotMatch(raw, /Domain=|Max-Age/);                                         // cookie de session (sans « se souvenir »)
  const token = raw.split(';')[0].split('=')[1];
  const inv = c.db.prepare('SELECT * FROM space_invites WHERE id = ?').get(g.invite);
  assert.equal(inv.failed_count, 0);
  assert.ok(inv.first_opened_at);
  assert.match(inv.password_hash, /^scrypt\$15\$8\$3\$[\w-]+\$[\w-]+$/);
  assert.equal(inv.token_hash, crypto.createHash('sha256').update(g.token).digest('hex'));
  // Ni le jeton du lien, ni le mot de passe, ni le jeton du cookie dans le fichier de la base.
  c.db.pragma('wal_checkpoint(TRUNCATE)');
  const file = fs.readFileSync(c.config.databasePath).toString('latin1') + (fs.existsSync(`${c.config.databasePath}-wal`) ? fs.readFileSync(`${c.config.databasePath}-wal`).toString('latin1') : '');
  for (const secret of [g.token, g.password, g.password.replace(/-/g, ''), token]) assert.ok(!file.includes(secret), 'secret en clair dans la base');
  // « Se souvenir » : cookie de 30 jours.
  r = await c.app.inject({ method: 'POST', url: `/g/${g.token}`, headers: origin, payload: enc({ password: g.password, remember: '1' }) });
  assert.match([].concat(r.headers['set-cookie']).join(';'), /Max-Age=2592000/);
});

test('essais : 5 refus → pause d’une minute, 10 → 15 min (le bon mot de passe refusé pendant la pause), 30 → suspension ; débloquer rétablit (T6, G19, Tranché 3)', async t => {
  const c = await site(t);
  const g = await gallery(c);
  for (let i = 1; i <= 5; i++) assert.equal((await enter(c, g, { password: 'mauvais', ip: `203.0.113.${i}` })).res.statusCode, 403);
  let inv = c.db.prepare('SELECT * FROM space_invites WHERE id = ?').get(g.invite);
  assert.equal(inv.failed_count, 5);
  assert.ok(inv.locked_until > Date.now() + 50e3 && inv.locked_until <= Date.now() + 61e3);
  // Pendant la pause : le bon mot de passe est refusé, sans compter l'essai.
  let r = (await enter(c, g, { ip: '203.0.113.9' })).res;
  assert.equal(r.statusCode, 403);
  assert.match(r.body, /Pause de sécurité après 5 essais refusés/);
  assert.equal(c.db.prepare('SELECT failed_count FROM space_invites WHERE id = ?').pluck().get(g.invite), 5);
  // Horloge avancée : la pause est passée ; 5 refus de plus → 15 min.
  c.db.prepare('UPDATE space_invites SET locked_until = ? WHERE id = ?').run(Date.now() - 1, g.invite);
  for (let i = 0; i < 5; i++) await enter(c, g, { password: 'mauvais', ip: `203.0.114.${i}` });
  inv = c.db.prepare('SELECT * FROM space_invites WHERE id = ?').get(g.invite);
  assert.equal(inv.failed_count, 10);
  assert.ok(inv.locked_until > Date.now() + 14 * 60e3);
  assert.equal((await enter(c, g, { ip: '203.0.114.50' })).res.statusCode, 403);
  // 30 refus depuis le dernier succès : suspendu, même avec le bon mot de passe ; les autorisations ouvertes tombent.
  c.db.prepare('UPDATE space_invites SET locked_until = NULL, failed_total = 29, failed_count = 11 WHERE id = ?').run(g.invite);
  r = (await enter(c, g, { password: 'mauvais', ip: '203.0.115.1' })).res;
  assert.equal(r.statusCode, 403);
  assert.match(r.body, /Accès suspendu/);
  assert.ok(c.db.prepare('SELECT suspended_at FROM space_invites WHERE id = ?').pluck().get(g.invite));
  assert.equal((await enter(c, g, { ip: '203.0.115.2' })).res.statusCode, 403);
  assert.equal((await c.app.inject(`/g/${g.token}`)).statusCode, 403);
  c.app.spaces.unlock(g.invite, null);
  assert.equal((await enter(c, g, { ip: '203.0.115.3' })).res.statusCode, 303);
});

test('essais en parallèle : un seul calcul à la fois par accès, les seuils ne sont jamais dépassés (T6, G18, G19)', async t => {
  const c = await site(t);
  const g = await gallery(c);
  c.db.prepare('UPDATE space_invites SET failed_count = 4, failed_total = 4 WHERE id = ?').run(g.invite);
  const all = await Promise.all(Array.from({ length: 20 }, (_, i) => enter(c, g, { password: 'mauvais', ip: `192.0.2.${i + 1}` })));
  const codes = all.map(x => x.res.statusCode);
  assert.equal(codes.filter(x => x === 403).length, 1, 'un seul calcul pour cet accès');
  assert.equal(codes.filter(x => x === 503).length, 19, 'les autres : « réessayez », sans compter');
  const inv = c.db.prepare('SELECT failed_count, failed_total FROM space_invites WHERE id = ?').get(g.invite);
  assert.deepEqual(inv, { failed_count: 5, failed_total: 5 });
  assert.match(all.find(x => x.res.statusCode === 503).res.body, /Beaucoup de demandes en ce moment/);
});

test('limites par adresse : 21e essai en 15 min, 61e ouverture de /g/ en 1 h : 429 (T7, G20)', async t => {
  const c = await site(t);
  const g = await gallery(c);
  const ip = '198.51.100.20';
  for (let i = 0; i < 20; i++) await enter(c, g, { password: 'mauvais', ip });
  assert.equal((await enter(c, g, { ip })).res.statusCode, 429);
  assert.equal((await enter(c, g, { ip: '198.51.100.21' })).res.statusCode, 403);     // autre adresse : la pause de l'accès
  for (let i = 0; i < 60; i++) await c.app.inject({ url: `/g/${g.token}`, remoteAddress: '198.51.100.30' });
  assert.equal((await c.app.inject({ url: `/g/${g.token}`, remoteAddress: '198.51.100.30' })).statusCode, 429);
});

test('galerie : 404 identique sans autorisation, pour une galerie qui existe ou non ; une session de A ne voit ni la page ni les images de B (T10, T11)', async t => {
  const c = await site(t);
  const a = await gallery(c), b = await gallery(c, { title: 'Quai Ligny' });
  const none = await c.app.inject('/prive/AAAAAAAAAAAA');
  const real = await c.app.inject(`/prive/${b.s.public_id}`);
  assert.equal(none.statusCode, 404);
  assert.equal(real.statusCode, 404);
  assert.equal(real.body, none.body);
  assert.match(none.body, /Cette page n’est pas disponible/);
  const { cookie } = await enter(c, a);
  const page = await c.app.inject({ url: `/prive/${a.s.public_id}`, headers: { cookie } });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Lisbonne et Porto/);
  assert.equal((await c.app.inject({ url: `/prive/${b.s.public_id}`, headers: { cookie } })).statusCode, 404);
  // Images : celles de A pour la session de A ; pas par le chemin de B, ni sans session.
  const img = /src="(\/prive\/[^"]+\/m\/[^"]+)"/.exec(page.body)[1];
  assert.equal((await c.app.inject({ url: img, headers: { cookie } })).statusCode, 200);
  assert.equal((await c.app.inject(img)).statusCode, 404);
  assert.equal((await c.app.inject({ url: img.replace(a.s.public_id, b.s.public_id), headers: { cookie } })).statusCode, 404);
});

test('révocation : la requête suivante de la même session répond 404, l’accès retiré est dit ; le rejeu est signalé à la Vigie (T12, G9, BV-22)', async t => {
  const c = await site(t, { vigie: true });
  const g = await gallery(c);
  const { cookie } = await enter(c, g);
  assert.equal((await c.app.inject({ url: `/prive/${g.s.public_id}`, headers: { cookie } })).statusCode, 200);
  c.app.spaces.revoke(g.invite, null);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM visitor_grants WHERE invite_id = ?').pluck().get(g.invite), 0);
  const r = await c.app.inject({ url: `/prive/${g.s.public_id}`, headers: { cookie } });
  assert.equal(r.statusCode, 404);
  assert.match(r.body, /Cet accès n’est plus valable/);
  // L'ancien lien, rejoué : 410 et signalé.
  assert.equal((await c.app.inject(`/g/${g.token}`)).statusCode, 410);
  const v = await c.flush();
  const used = v.of('session_use_after_expire');
  assert.deepEqual(used.map(e => [e.detail.jeton, e.detail.raison, e.origine.composant]), [['cookie_visiteur', 'acces_revoque', 'site · public'], ['lien', 'acces_revoque', 'site · public']]);
  assert.equal(used[0].detail.acces, g.invite);
  assert.equal(used[0].detail.meme_reseau_et_navigateur, true);
});

test('prolonger garde le lien ; « Nouveau lien » invalide l’ancien (410, rejeu signalé) ; « Nouveau mot de passe » garde le lien (T13, G10)', async t => {
  const c = await site(t, { vigie: true });
  const g = await gallery(c);
  c.app.spaces.updateInvite(g.invite, { expires: day(50), favoris: '1' }, null);
  assert.equal((await c.app.inject(`/g/${g.token}`)).statusCode, 200);
  const fresh = c.app.spaces.newLink(g.invite, null);
  assert.equal((await c.app.inject(`/g/${g.token}`)).statusCode, 410);
  assert.equal((await c.app.inject(`/g/${fresh}`)).statusCode, 200);
  const pw = await c.app.spaces.newPassword(g.invite, null);
  assert.equal((await enter(c, { ...g, token: fresh })).res.statusCode, 403);
  assert.equal((await enter(c, { ...g, token: fresh, password: pw })).res.statusCode, 303);
  const v = await c.flush();
  assert.ok(v.of('session_use_after_expire').some(e => e.detail.raison === 'lien_remplace' && e.detail.jeton === 'lien'));
});

test('en-têtes : pages en no-store, noindex, no-referrer réellement envoyé ; images en private, no-cache, ETag, CORP, 304 ; robots.txt (T14, T15, T18, G32, G36, G39, G40)', async t => {
  const c = await site(t);
  const g = await gallery(c);
  const check = (r, cache) => { assert.equal(r.headers['cache-control'], cache); assert.equal(r.headers['x-robots-tag'], 'noindex'); assert.equal(r.headers['referrer-policy'], 'no-referrer'); };
  check(await c.app.inject(`/g/${g.token}`), 'no-store');
  check((await enter(c, g, { password: 'mauvais' })).res, 'no-store');
  const { cookie, res } = await enter(c, g, { ip: '203.0.113.50' });
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  const page = await c.app.inject({ url: `/prive/${g.s.public_id}`, headers: { cookie } });
  check(page, 'no-store');
  check(await c.app.inject(`/prive/${g.s.public_id}`), 'no-store');                      // 404 aussi
  const img = /src="(\/prive\/[^"]+\/m\/[^"]+)"/.exec(page.body)[1];
  const i1 = await c.app.inject({ url: img, headers: { cookie } });
  check(i1, 'private, no-cache');
  assert.equal(i1.headers['cross-origin-resource-policy'], 'same-origin');
  assert.ok(i1.headers.etag);
  assert.doesNotMatch(String(i1.headers['cache-control']), /public|immutable/);
  assert.equal((await c.app.inject({ url: img, headers: { cookie, 'if-none-match': i1.headers.etag } })).statusCode, 304);
  // La v2 seule, même quand le site public est en v1 (réglage par défaut).
  assert.match(page.body, /css\/v2\/prive\.css/);
  assert.match(page.body, /<meta name="referrer" content="no-referrer">/);
  const robots = (await c.app.inject('/robots.txt')).body;
  assert.match(robots, /^Disallow: \/prive\/$/m);
  assert.doesNotMatch(robots, /Disallow: \/g\//);
  // Absentes du sitemap et de la recherche.
  assert.doesNotMatch((await c.app.inject('/sitemap.xml')).body, /\/prive\/|\/g\//);
});

test('journaux : le jeton du lien masqué partout (adresse, « vers= », /en/g/…), ni mot de passe ni cookie (T16, G13, M14)', async t => {
  const lines = [];
  const stream = new Writable({ write(chunk, e, cb) { lines.push(String(chunk)); cb(); } });
  const c = await site(t, { logger: { level: 'info', stream } });
  const g = await gallery(c);
  await c.app.inject(`/g/${g.token}`);
  await c.app.inject(`/langue/en?vers=${encodeURIComponent(`/g/${g.token}`)}`);
  await c.app.inject(`/en/g/${g.token}`);
  const { cookie } = await enter(c, g);
  await c.app.inject({ url: `/prive/${g.s.public_id}`, headers: { cookie } });
  const log = lines.join('\n');
  assert.ok(log.includes('/g/[masqué]'));
  for (const secret of [g.token, g.password, cookie.split('=')[1]]) assert.ok(!log.includes(secret), 'secret dans le journal');
  // La page du 404 sous /g/ (sélecteur de langue) : sans Referer, le jeton y étant recopié.
  assert.equal((await c.app.inject(`/g/${'A'.repeat(32)}`)).headers['referrer-policy'], 'no-referrer');
});

test('durées : 12 h sans visite, 7 jours au plus, 30 jours avec « se souvenir », jamais au-delà de l’accès (T17, G26)', async t => {
  const c = await site(t);
  const g = await gallery(c);
  const page = cookie => c.app.inject({ url: `/prive/${g.s.public_id}`, headers: { cookie } });
  const { cookie } = await enter(c, g);
  const grant = () => c.db.prepare('SELECT * FROM visitor_grants WHERE invite_id = ?').get(g.invite);
  assert.ok(grant().expires_at <= Date.now() + 7 * 864e5 + 1000);
  c.db.prepare('UPDATE visitor_grants SET last_seen_at = ? WHERE invite_id = ?').run(Date.now() - 13 * 3600e3, g.invite);
  assert.equal((await page(cookie)).statusCode, 404);
  const r = await enter(c, g, { remember: true, cookie });
  assert.equal(grant().remember, 1);
  c.db.prepare('UPDATE visitor_grants SET last_seen_at = ? WHERE invite_id = ?').run(Date.now() - 13 * 3600e3, g.invite);
  assert.equal((await page(r.cookie)).statusCode, 200);
  // L'accès finit avant les 30 jours : l'autorisation aussi.
  c.db.prepare('UPDATE space_invites SET expires_at = ? WHERE id = ?').run(Date.now() - 1, g.invite);
  assert.equal((await page(r.cookie)).statusCode, 404);
});

test('session : un mot de passe accepté change le jeton, garde la session et ses autres autorisations (T9, G24, G30)', async t => {
  const c = await site(t);
  const a = await gallery(c), b = await gallery(c, { title: 'Quai Ligny' });
  const first = await enter(c, a);
  const id = c.db.prepare('SELECT id FROM visitor_sessions').pluck().get();
  const second = await enter(c, b, { cookie: first.cookie });
  assert.notEqual(second.cookie, first.cookie);
  assert.deepEqual(c.db.prepare('SELECT id FROM visitor_sessions').pluck().all(), [id]);
  for (const s of [a.s, b.s]) assert.equal((await c.app.inject({ url: `/prive/${s.public_id}`, headers: { cookie: second.cookie } })).statusCode, 200);
  assert.equal((await c.app.inject({ url: `/prive/${a.s.public_id}`, headers: { cookie: first.cookie } })).statusCode, 404);
});

test('images : photo hors de la galerie (même publiée), ancienne clé, /media/ d’une photo privée seulement, « Tout l’EXIF » : 404 (T19, T20, G38, M19)', async t => {
  const c = await site(t, { vigie: true });
  const g = await gallery(c, { n: 2 });
  const { cookie } = await enter(c, g);
  const inside = c.db.prepare('SELECT p.* FROM space_items i JOIN photos p ON p.id = i.photo_id WHERE i.space_id = ? ORDER BY i.position').get(g.s.id);
  const outside = c.db.prepare("SELECT * FROM photos WHERE status = 'published' AND id NOT IN (SELECT photo_id FROM space_items) LIMIT 1").get();
  const url = (p, key = p.variant_key) => `/prive/${g.s.public_id}/m/${variantName(p.file, widthsFor(p.width)[0], 'webp', key)}`;
  assert.equal((await c.app.inject({ url: url(inside), headers: { cookie } })).statusCode, 200);
  assert.equal((await c.app.inject({ url: url(outside), headers: { cookie } })).statusCode, 404);
  assert.equal((await c.app.inject({ url: url(inside, 'deadbeef'), headers: { cookie } })).statusCode, 404);
  // La photo passe en brouillon : /media/ ne la sert plus, la galerie privée oui.
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(inside.id);
  assert.equal((await c.app.inject(`/media/${variantName(inside.file, widthsFor(inside.width)[0], 'webp', inside.variant_key)}`)).statusCode, 404);
  assert.equal((await c.app.inject({ url: url(inside), headers: { cookie } })).statusCode, 200);
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('exif', '{\"mode\":\"all\"}') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  assert.equal((await c.app.inject({ url: url(inside), headers: { cookie } })).statusCode, 404);
  const v = await c.flush();
  assert.ok(v.of('token_guess').some(e => e.detail.nature === 'image privée'));
});

test('téléchargements : refusés sans le droit ou hors liste (signalés) ; JPEG sans GPS, auteur, rendu une fois, compteur ; HEAD non compté (T21, G44, Tranché 7, BV-25)', async t => {
  const c = await site(t, { vigie: true });
  const g = await gallery(c, { n: 2, rights: { favoris: '1' } });
  const { cookie } = await enter(c, g);
  const pid = g.s.public_id;
  assert.equal((await c.app.inject({ url: `/prive/${pid}/telecharger/1/web`, remoteAddress: '192.0.2.10', headers: { cookie } })).statusCode, 404);
  const d = await gallery(c, { n: 2, rights: { telecharger: '1' } });
  const dl = await enter(c, d, { cookie });
  const base = `/prive/${d.s.public_id}/telecharger`;
  // Une adresse par geste : la Vigie résume les signalements d'une même adresse (5 minutes).
  assert.equal((await c.app.inject({ url: `${base}/1/grande`, remoteAddress: '192.0.2.11', headers: { cookie: dl.cookie } })).statusCode, 404);   // web seulement
  assert.equal((await c.app.inject({ url: `${base}/1/originale`, remoteAddress: '192.0.2.12', headers: { cookie: dl.cookie } })).statusCode, 404);
  assert.equal((await c.app.inject({ url: `${base}/9/web`, remoteAddress: '192.0.2.13', headers: { cookie: dl.cookie } })).statusCode, 404);
  assert.equal((await c.app.inject({ method: 'HEAD', url: `${base}/1/web`, headers: { cookie: dl.cookie } })).statusCode, 200);
  const r = await c.app.inject({ url: `${base}/1/web`, headers: { cookie: dl.cookie } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'image/jpeg');
  assert.match(r.headers['content-disposition'], /^attachment; filename="[\w.-]+-web\.jpg"$/);
  assert.equal(r.headers['cache-control'], 'private, no-store');
  assert.equal(r.headers['cross-origin-resource-policy'], 'same-origin');
  const meta = await sharp(r.rawPayload).metadata();
  assert.ok(meta.width <= 2048 && meta.height <= 2048);
  const exif = meta.exif ? meta.exif.toString('latin1') : '';
  assert.match(exif, /usage personnel/);
  assert.doesNotMatch(exif, /GPS/);
  const file = fs.readdirSync(path.join(c.config.storageDir, 'private', 'telechargements'))[0];
  const mtime = fs.statSync(path.join(c.config.storageDir, 'private', 'telechargements', file)).mtimeMs;
  await c.app.inject({ url: `${base}/1/web`, headers: { cookie: dl.cookie } });
  assert.equal(fs.statSync(path.join(c.config.storageDir, 'private', 'telechargements', file)).mtimeMs, mtime, 'pas de second rendu');
  assert.equal(c.db.prepare('SELECT downloads FROM space_invites WHERE id = ?').pluck().get(d.invite), 2);
  // Grande taille : 4 000 px au plus.
  c.app.spaces.updateInvite(d.invite, { telecharger: '1', grande: '1', expires: day(30) }, null);
  const big = await c.app.inject({ url: `${base}/1/grande`, headers: { cookie: dl.cookie } });
  assert.equal(big.statusCode, 200);
  const m2 = await sharp(big.rawPayload).metadata();
  assert.ok(Math.max(m2.width, m2.height) <= 4000);
  const v = await c.flush();
  assert.deepEqual(v.of('input_validation_fail').map(e => e.detail.raison).sort(), ['photo hors galerie', 'taille hors liste', 'taille non permise', 'taille non permise']);
});

test('archive : ZIP de la galerie, 3 par jour et par accès au plus, export signalé à la Vigie, effacée après 24 h (T22, G46, BV-19)', async t => {
  const c = await site(t, { vigie: true });
  const g = await gallery(c, { n: 2, rights: { telecharger: '1' } });
  const { cookie } = await enter(c, g);
  const page = await c.app.inject({ url: `/prive/${g.s.public_id}`, headers: { cookie } });
  const csrf = csrfOf(page.body);
  const post = () => c.app.inject({ method: 'POST', url: `/prive/${g.s.public_id}/archive`, headers: { ...FORM, cookie }, payload: enc({ csrf }) });
  let r = await post();
  assert.equal(r.statusCode, 303);
  const zip = await c.app.inject({ url: r.headers.location, headers: { cookie } });
  assert.equal(zip.statusCode, 200);
  assert.equal(zip.headers['content-type'], 'application/zip');
  assert.equal(zip.rawPayload.subarray(0, 4).toString('hex'), '504b0304');
  await post(); await post();
  r = await post();
  assert.match(r.headers.location, /etat=archive-limite/);
  // Une autre session n'ouvre pas l'archive.
  assert.equal((await c.app.inject(zip.request?.url || r.headers.location)).statusCode, 404);
  c.db.prepare('UPDATE space_archives SET created_at = ?').run(Date.now() - 25 * 3600e3);
  c.app.spaces.purge();
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM space_archives').pluck().get(), 0);
  assert.deepEqual(fs.readdirSync(path.join(c.config.storageDir, 'private', 'archives')), []);
  const v = await c.flush();
  assert.equal(v.of('sensitive_export').length, 3);
  assert.deepEqual(Object.keys(v.of('sensitive_export')[0].detail).sort(), ['acces', 'espace', 'nature', 'octets', 'photos', 'portail', 'taille']);
  assert.ok(v.of('excess_rate_limit_exceeded').some(e => e.detail.limite === 'archives'));
});

test('écritures de l’invité : Origin du site (ou Sec-Fetch-Site) et jeton CSRF exigés ; favori, sélection envoyée puis reprise, figée une fois vue (T32, G28, G48, G50, BV-25)', async t => {
  const c = await site(t, { vigie: true });
  const g = await gallery(c);
  // POST /g sans Origin : refusé (CSRF de connexion) ; « Origin: null » avec Sec-Fetch-Site: same-origin : accepté.
  assert.equal((await c.app.inject({ method: 'POST', url: `/g/${g.token}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: enc({ password: g.password }) })).statusCode, 403);
  const ok = await c.app.inject({ method: 'POST', url: `/g/${g.token}`, headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'null', 'sec-fetch-site': 'same-origin' }, payload: enc({ password: g.password }) });
  assert.equal(ok.statusCode, 303);
  const cookie = cookieOf(ok);
  const pid = g.s.public_id;
  const csrf = csrfOf((await c.app.inject({ url: `/prive/${pid}`, headers: { cookie } })).body);
  let n = 0;   // une adresse par envoi : la Vigie résume les signalements d'une même adresse (5 minutes)
  const fav = (headers, payload) => c.app.inject({ method: 'POST', url: `/prive/${pid}/selection/2`, remoteAddress: `192.0.2.${++n}`, headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, ...headers }, payload: enc(payload) });
  assert.equal((await fav({ origin: ORIGIN }, {})).statusCode, 403);                               // sans jeton
  assert.equal((await fav({ origin: ORIGIN }, { csrf: 'faux' })).statusCode, 403);
  assert.equal((await fav({ origin: 'https://ailleurs.example' }, { csrf })).statusCode, 403);
  assert.equal((await fav({}, { csrf })).statusCode, 403);                                         // ni Origin ni Sec-Fetch-Site
  const r = await fav({ origin: ORIGIN }, { csrf, retour: 'galerie' });
  assert.equal(r.statusCode, 303);
  assert.equal(r.headers.location, `/prive/${pid}#p2`);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM space_favorites WHERE invite_id = ?').pluck().get(g.invite), 1);
  assert.equal((await c.app.inject({ method: 'POST', url: `/prive/${pid}/selection/99`, remoteAddress: '192.0.2.200', headers: { ...FORM, cookie }, payload: enc({ csrf }) })).statusCode, 404);
  // Envoyer, reprendre (tant que l'équipe ne l'a pas vue), puis figée.
  const send = what => c.app.inject({ method: 'POST', url: `/prive/${pid}/selection/${what}`, headers: { ...FORM, cookie }, payload: enc({ csrf }) });
  assert.match((await send('terminer')).headers.location, /etat=envoye/);
  assert.ok(c.db.prepare('SELECT selection_sent_at FROM space_invites WHERE id = ?').pluck().get(g.invite));
  assert.match((await send('reprendre')).headers.location, /etat=repris/);
  await send('terminer');
  c.app.spaces.markSeen(c.app.spaces.invite(g.invite));
  assert.match((await send('reprendre')).headers.location, /etat=figee/);
  assert.match((await fav({ origin: ORIGIN }, { csrf })).headers.location, /etat=figee/);
  // ?vue= inconnue : ignorée, signalée.
  assert.equal((await c.app.inject({ url: `/prive/${pid}?vue=toutes-les-autres`, remoteAddress: '192.0.2.201', headers: { cookie } })).statusCode, 200);
  const v = await c.flush();
  assert.deepEqual(v.of('authz_csrf_fail').map(e => [e.detail.jeton, e.origine.composant]), [['absent', 'site · public'], ['faux', 'site · public']]);
  const raisons = v.of('input_validation_fail').map(e => e.detail.raison);
  for (const x of ['provenance absente', 'formulaire envoyé depuis un autre site', 'photo hors galerie', 'vue inconnue']) assert.ok(raisons.includes(x), x);
});

test('langue et départ : POST /prive/<id>/langue ; « Quitter » retire les autorisations, change le jeton, vide le cache ; l’ancien cookie rejoué est signalé (T34, T35, G29, G37)', async t => {
  const c = await site(t, { vigie: true });
  const g = await gallery(c);
  const { cookie } = await enter(c, g);
  const pid = g.s.public_id;
  let page = await c.app.inject({ url: `/prive/${pid}`, headers: { cookie } });
  assert.match(page.body, /<html lang="fr"/);
  assert.doesNotMatch(page.body, /\/langue\/|og:|rel="canonical"|hreflang/);
  const csrf = csrfOf(page.body);
  let r = await c.app.inject({ method: 'POST', url: `/prive/${pid}/langue`, headers: { ...FORM, cookie }, payload: enc({ csrf, lang: 'de' }) });
  assert.equal(r.statusCode, 303);
  page = await c.app.inject({ url: `/prive/${pid}`, headers: { cookie } });
  assert.match(page.body, /<html lang="de"/);
  assert.match(page.body, /Lissabon und Porto/);
  assert.match(page.body, /Galerie verlassen/);
  r = await c.app.inject({ method: 'POST', url: '/prive/quitter', headers: { ...FORM, cookie }, payload: enc({ csrf }) });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['clear-site-data'], '"cache"');
  assert.match(r.body, /Sie haben die Galerie verlassen/);
  const next = cookieOf(r);
  assert.notEqual(next, cookie);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM visitor_grants').pluck().get(), 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM visitor_sessions').pluck().get(), 1);         // la session reste
  assert.equal((await c.app.inject({ url: `/prive/${pid}`, headers: { cookie: next } })).statusCode, 404);
  // L'ancien cookie, rejoué plus tard (copié) : signalé.
  c.db.prepare('UPDATE visitor_tokens_revoked SET revoked_at = ?').run(Date.now() - 60e3);
  assert.equal((await c.app.inject({ url: `/prive/${pid}`, headers: { cookie } })).statusCode, 404);
  const v = await c.flush();
  assert.ok(v.of('session_use_after_expire').some(e => e.detail.raison === 'quitte' && e.detail.jeton === 'cookie_visiteur'));
  // Après « Quitter », pas d'énumération signalée pour le retour ordinaire (BV-17, exception).
  assert.equal(v.of('token_guess').filter(e => e.detail.nature === 'espace privé').length, 0);
});

test('vue équipe : sans mot de passe pour qui voit la galerie, aucun événement d’invité ; hors portée : 404 et signalé (T26, G55, G60, BV-14)', async t => {
  const TOKEN = 'jeton-de-test-0123456789';
  const c = await site(t, { vigie: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const g = await gallery(c, { author: 'julien' });
  const login = async author => {
    const res = await c.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author, next: '/admin' } });
    return res.cookies.filter(x => x.value).map(x => `${x.name}=${x.value}`).join('; ');
  };
  const julien = await login('julien');
  const page = await c.app.inject({ url: `/prive/${g.s.public_id}`, headers: { cookie: julien } });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Vue équipe/);
  assert.doesNotMatch(page.body, /action="\/prive\/quitter"|selection\/terminer/);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM space_events WHERE kind = 'visite'").pluck().get(), 0);
  // Sébastien, photographe (portée « les miennes »), ne voit pas la galerie de Julien.
  const sid = c.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const seb = await login('sebastien');
  const sub = c.db.prepare('SELECT sub FROM accounts WHERE author_id = ?').pluck().get(sid);
  c.db.prepare("UPDATE accounts SET roles = '[\"photographe\"]' WHERE sub = ?").run(sub);
  assert.equal((await c.app.inject({ url: `/prive/${g.s.public_id}`, headers: { cookie: seb } })).statusCode, 404);
  const v = await c.flush();
  assert.ok(v.of('authz_fail').some(e => e.detail.raison === 'hors portée' && e.detail.objet === 'galerie' && e.detail.id === g.s.id));
});

test('Vigie : émissions des invités, types du vocabulaire, composant public, jamais de jeton, de mot de passe ni d’étiquette (BV-16 à BV-18)', async t => {
  const c = await site(t, { vigie: true });
  const g = await gallery(c);
  await c.app.inject({ url: `/g/${'B'.repeat(32)}`, remoteAddress: '198.51.100.70' });
  for (let i = 0; i < 5; i++) await enter(c, g, { password: 'mauvais', ip: `198.51.100.${80 + i}` });
  c.db.prepare('UPDATE space_invites SET locked_until = NULL WHERE id = ?').run(g.invite);
  await enter(c, g, { ip: '198.51.100.90' });
  const v = await c.flush();
  const json = JSON.stringify(v.events);
  for (const secret of [g.token, g.password, g.password.replace(/-/g, ''), 'Lucie', 'Lisbonne']) assert.ok(!json.includes(secret), `« ${secret} » envoyé à la Vigie`);
  assert.equal(v.of('token_guess').find(e => e.detail.nature === 'lien de galerie privée').route, '/g/:token');
  const fails = v.of('authn_login_fail');
  assert.equal(fails.length, 5);
  assert.deepEqual([...new Set(fails.map(e => `${e.origine.composant}|${e.severity}`))], ['site · public|bas']);
  assert.deepEqual(fails.map(e => e.detail.echecs_consecutifs), [1, 2, 3, 4, 5]);
  assert.equal(fails[0].detail.portail, 'galerie_privee');
  assert.equal(fails[0].sub, undefined);
  const lock = v.of('authn_login_disabled');
  assert.equal(lock.length, 1);
  assert.deepEqual([lock[0].detail.type_attendu, lock[0].detail.palier, lock[0].detail.acces, lock[0].detail.refus_24h, lock[0].detail.reseaux_24h], ['authn_login_lock', 'pause_1min', g.invite, 5, 1]);
  const created = v.of('session_created').filter(e => e.detail?.portail === 'galerie_privee');
  assert.equal(created.length, 1);
  // Entrée ordinaire : réseau seul (J6), ni adresse complète ni navigateur, identité technique de 12 signes.
  assert.equal(created[0].ip, undefined);
  assert.equal(created[0].ua, undefined);
  assert.equal(created[0].ip_net, '198.51.100.0');
  assert.match(created[0].origine.reference, /^visiteur:[0-9a-f]{12}$/);
  assert.deepEqual([created[0].detail.appareil_n, created[0].detail.groupe, created[0].detail.se_souvenir], [1, false, false]);
});
