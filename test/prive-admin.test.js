import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup, VIGIE_KEYS } from './helpers.js';

// Galeries privées, côté équipe (annexe de sécurité, § 5 et § 6 : T23 à T28 ; registre de la Vigie BV-14, BV-23, BV-24) :
// création d'un accès (secrets une seule fois, jeton de formulaire), journal d'audit, portée « les miennes », usage privé
// des photos, purges, droits des rôles, émissions vers la Vigie.
const TOKEN = 'jeton-de-test-0123456789';
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

function fakeVigie() {
  const v = { events: [] };
  v.send = async body => { v.events.push(...JSON.parse(body).lot); };
  v.of = type => v.events.filter(e => e.type === type);
  return v;
}
async function site(t, { vigie = false } = {}) {
  const fake = fakeVigie();
  const c = vigie ? await setup(t, { seeded: true, env: { ...VIGIE, LOCAL_AUTH_TOKEN: TOKEN }, vigieOptions: { send: fake.send, timers: false, pollDecisions: false } })
    : await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  c.flush = async () => { c.app.securite.retryNow?.(); await c.app.securite.flush?.(); return fake; };
  // Connexion de test : Julien (administrateur) ou Sébastien (rôle donné par le test).
  c.login = async (author, roles = null) => {
    const res = await c.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author, next: '/admin' } });
    const cookies = Object.fromEntries(res.cookies.filter(x => x.value).map(x => [x.name, x.value]));
    const sub = c.db.prepare('SELECT sub FROM sessions ORDER BY created_at DESC LIMIT 1').pluck().get();
    if (roles) c.db.prepare('UPDATE accounts SET roles = ? WHERE sub = ?').run(JSON.stringify(roles), sub);
    const csrf = c.db.prepare('SELECT csrf FROM sessions WHERE sub = ?').pluck().get(sub);
    const get = url => c.app.inject({ url, cookies });
    const post = (url, payload = {}) => c.app.inject({ method: 'POST', url, cookies, payload: { _csrf: csrf, ...payload } });
    return { cookies, csrf, get, post, sub };
  };
  c.authorId = slug => c.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(slug);
  return c;
}
async function galleryOf(c, a, { author = null, n = 3 } = {}) {
  const r = await a.post('/admin/galeries', { title: 'Lisbonne et Porto', closes: day(60), ...(author ? { author_id: String(author) } : {}) });
  assert.equal(r.statusCode, 303, r.body);
  const id = Number(r.headers.location.split('/')[3]);
  const ids = c.db.prepare("SELECT id FROM photos WHERE status = 'published' AND (? IS NULL OR author_id = ?) ORDER BY id LIMIT ?").pluck().all(author, author, n);
  await c.app.inject({ method: 'POST', url: `/admin/galeries/${id}/photos`, cookies: a.cookies, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams([['_csrf', a.csrf], ...ids.map(x => ['photos', String(x)])]).toString() });
  await a.post(`/admin/galeries/${id}/ouvrir`);
  return id;
}
async function newAccess(a, id, extra = {}) {
  const form = await a.get(`/admin/galeries/${id}/acces/nouveau`);
  const jeton = /name="jeton" value="([^"]+)"/.exec(form.body)[1];
  const payload = { jeton, label: 'Lucie Exemple, Éditions du Fleuve', groupe: '0', lang: 'fr', expires: day(30), favoris: '1', ...extra };
  const r = await a.post(`/admin/galeries/${id}/acces`, payload);
  return { r, jeton, payload, form };
}

test('créer un accès : secrets sur une page no-store, lus une seule fois ; ni flash ni base en clair ; F5 ne crée pas un second accès (T23, G7, G22, G57)', async t => {
  const c = await site(t);
  const a = await c.login('julien');
  const id = await galleryOf(c, a, { author: c.authorId('julien') });
  const { r, payload } = await newAccess(a, id);
  assert.equal(r.statusCode, 303);
  assert.match(r.headers.location, /^\/admin\/galeries\/\d+\/acces\/\d+\/secrets$/);
  assert.ok(!r.cookies.some(x => x.name === 'flash'), 'pas de message flash');
  const page = await a.get(r.headers.location);
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.equal(page.headers['referrer-policy'], 'no-referrer');
  const pw = /<output class="mdp"[^>]*>([^<]+)</.exec(page.body)[1];
  const link = /(http:\/\/localhost:3000\/g\/[\w-]{32})/.exec(page.body)[1];
  assert.match(pw, /^[a-z0-9]{4} [a-z0-9]{4} [a-z0-9]{4}$/);
  // Les messages prêts à copier : le lien dans l'un, le mot de passe dans l'autre, jamais les deux ensemble.
  const mail = /<pre id="mail-v">([\s\S]*?)<\/pre>/.exec(page.body)[1];
  assert.ok(mail.includes(link));
  assert.ok(!mail.toLowerCase().includes(pw.replace(/ /g, '').slice(0, 8)));
  // Seconde lecture : déjà affichés.
  const again = await a.get(r.headers.location);
  assert.match(again.body, /déjà été affichés/);
  assert.ok(!again.body.includes(link.split('/g/')[1]));
  // Même formulaire renvoyé : aucun second accès.
  const twice = await a.post(`/admin/galeries/${id}/acces`, payload);
  assert.equal(twice.statusCode, 303);
  assert.doesNotMatch(twice.headers.location, /secrets/);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM space_invites').pluck().get(), 1);
  // Rien en clair dans la base : ni le jeton, ni le mot de passe, ni l'étiquette (chiffrée si DATA_KEY).
  c.db.pragma('wal_checkpoint(TRUNCATE)');
  const file = fs.readFileSync(c.config.databasePath).toString('latin1');
  assert.ok(!file.includes(link.split('/g/')[1]));
  assert.ok(!file.includes(pw.replace(/ /g, '').toUpperCase()));
  // Le lien et le mot de passe mènent bien à la galerie.
  const enter = await c.app.inject({ method: 'POST', url: link.replace('http://localhost:3000', ''), headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost:3000' }, payload: `password=${encodeURIComponent(pw)}` });
  assert.equal(enter.statusCode, 303);
});

test('journal d’audit : accès créé, élargi, nouveau lien, nouveau mot de passe, révoqué, avec identifiants seulement ; jamais le jeton, le mot de passe ni le nom (T24, BV-23)', async t => {
  const c = await site(t, { vigie: true });
  const a = await c.login('julien');
  const id = await galleryOf(c, a, { author: c.authorId('julien') });
  const { r } = await newAccess(a, id);
  const inv = Number(r.headers.location.split('/')[5]);
  const sec1 = await a.get(r.headers.location);
  await a.post(`/admin/galeries/${id}/acces/${inv}`, { expires: day(40), favoris: '1', telecharger: '1', grande: '1' });
  const nl = await a.post(`/admin/galeries/${id}/acces/${inv}/nouveau-lien`);
  const sec2 = await a.get(nl.headers.location);
  const np = await a.post(`/admin/galeries/${id}/acces/${inv}/nouveau-mot-de-passe`);
  const sec3 = await a.get(np.headers.location);
  await a.post(`/admin/galeries/${id}/acces/${inv}/revoquer`);
  const rows = c.db.prepare("SELECT action, target, detail FROM audit_log WHERE action LIKE 'galerie privée%'").all();
  const actions = rows.map(x => x.action);
  for (const x of ['galerie privée : galerie créée', 'galerie privée : accès créé', 'galerie privée : accès modifié', 'galerie privée : nouveau lien', 'galerie privée : nouveau mot de passe', 'galerie privée : accès révoqué']) assert.ok(actions.includes(x), x);
  assert.ok(rows.find(x => x.action === 'galerie privée : accès créé').target === `galerie ${id} / accès ${inv}`);
  const all = JSON.stringify(c.db.prepare('SELECT * FROM audit_log').all());
  const secrets = [sec1, sec2, sec3].flatMap(p => [/\/g\/([\w-]{32})/.exec(p.body)?.[1], /<output class="mdp"[^>]*>([^<]+)</.exec(p.body)?.[1]]).filter(Boolean);
  assert.ok(secrets.length >= 4);
  for (const s of [...secrets, 'Lucie']) assert.ok(!all.includes(s) && !all.includes(s.replace(/ /g, '').toUpperCase()), `« ${s} » au journal`);
  // Vigie : privacy_exposure_changed (objet acces_prive), gravité « bas » pour la grande taille.
  const v = await c.flush();
  const ex = v.of('privacy_exposure_changed').filter(e => e.detail.objet === 'acces_prive');
  assert.deepEqual(ex.map(e => e.detail.action), ['espace_ouvert', 'cree', 'droits_elargis', 'prolonge', 'nouveau_lien', 'nouveau_mot_de_passe', 'revoque']);
  assert.equal(ex.find(e => e.detail.action === 'droits_elargis').severity, 'bas');
  assert.equal(ex.find(e => e.detail.action === 'cree').detail.auteur_espace, c.authorId('julien'));
  assert.ok(ex.every(e => Number.isInteger(e.detail.espace) && typeof e.detail.echeance_jours === 'number'));
  const json = JSON.stringify(v.events);
  for (const s of [...secrets, 'Lucie']) assert.ok(!json.includes(s), `« ${s} » envoyé à la Vigie`);
});

test('lecture des données d’un invité : notée au journal et signalée (sensitive_read) ; export de la sélection : config.audit (BV-24, G53)', async t => {
  const c = await site(t, { vigie: true });
  const a = await c.login('julien');
  const id = await galleryOf(c, a, { author: c.authorId('julien') });
  const { r } = await newAccess(a, id);
  const inv = Number(r.headers.location.split('/')[5]);
  const item = c.db.prepare('SELECT id FROM space_items WHERE space_id = ? LIMIT 1').pluck().get(id);
  c.db.prepare('INSERT INTO space_favorites (invite_id, item_id, added_at) VALUES (?, ?, ?)').run(inv, item, Date.now());
  assert.equal((await a.get(`/admin/galeries/${id}/acces/${inv}`)).statusCode, 200);
  assert.equal((await a.get(`/admin/galeries/${id}/activite`)).statusCode, 200);
  const csv = await a.get(`/admin/galeries/${id}/acces/${inv}/selection.csv`);
  assert.equal(csv.statusCode, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.body, /fichier d’origine/);
  const audit = c.db.prepare('SELECT action FROM audit_log').pluck().all();
  assert.ok(audit.includes('galerie privée : lecture (fiche d’un accès)'));
  assert.ok(audit.includes('galerie privée : lecture (activité)'));
  assert.ok(audit.includes('GET /admin/galeries/:id/acces/:inv/selection.csv'));
  const v = await c.flush();
  assert.ok(v.of('sensitive_read').some(e => e.detail.objet === 'acces' && e.detail.id === inv));
  assert.ok(v.of('sensitive_export').some(e => e.detail.cible === '/admin/galeries/:id/acces/:inv/selection.csv'));
});

test('portée « les miennes » : un photographe ne voit ni la galerie de l’autre ni une galerie commune ; hors portée : 404 et signalé ; Modérateur et Relecteur : refusés (T26, G1, G55, BV-14, D16)', async t => {
  const c = await site(t, { vigie: true });
  const admin = await c.login('julien');
  const jul = await galleryOf(c, admin, { author: c.authorId('julien') });
  const common = await galleryOf(c, admin, {});
  assert.equal(c.db.prepare('SELECT author_id FROM private_spaces WHERE id = ?').pluck().get(common), null);
  const seb = await c.login('sebastien', ['photographe']);
  const own = await galleryOf(c, seb, { author: c.authorId('sebastien') });
  const list = (await seb.get('/admin/galeries')).body;
  assert.match(list, new RegExp(`/admin/galeries/${own}"`));
  assert.doesNotMatch(list, new RegExp(`/admin/galeries/(${jul}|${common})"`));
  for (const url of [`/admin/galeries/${jul}`, `/admin/galeries/${common}`, `/admin/galeries/${jul}/acces/nouveau`, `/admin/galeries/${jul}/photos`]) assert.equal((await seb.get(url)).statusCode, 404, url);
  assert.equal((await seb.post(`/admin/galeries/${jul}/acces`, { label: 'Tiers', expires: day(10) })).statusCode, 404);
  assert.equal((await seb.post(`/admin/galeries/${jul}/fermer`)).statusCode, 404);
  // Une galerie créée par un photographe est toujours la sienne, même s'il demande l'autre.
  const forced = await seb.post('/admin/galeries', { title: 'Essai', closes: day(20), author_id: String(c.authorId('julien')) });
  assert.equal(c.db.prepare('SELECT author_id FROM private_spaces WHERE id = ?').pluck().get(Number(forced.headers.location.split('/')[3])), c.authorId('sebastien'));
  // Modérateur et Relecteur : pas d'accès aux galeries privées.
  for (const role of ['moderateur', 'relecteur']) {
    const m = await c.login('sebastien', [role]);
    assert.equal((await m.get('/admin/galeries')).statusCode, 403, role);
    assert.doesNotMatch((await m.get('/admin')).body, /href="\/admin\/galeries"/);
  }
  const v = await c.flush();
  const hp = v.of('authz_fail').filter(e => e.detail.raison === 'hors portée' && e.detail.objet === 'galerie');
  assert.ok(hp.some(e => e.detail.id === jul && e.detail.ecriture === false));
  assert.ok(hp.some(e => e.detail.id === jul && e.detail.ecriture === true));
  assert.ok(hp.some(e => e.detail.id === common));
});

test('photos de la galerie : bloquée (refus) refusée à l’ajout et jamais montrée ; à vérifier : confirmation gardée ; l’ordre se règle (T27, G2, G61)', async t => {
  const c = await site(t);
  const a = await c.login('julien');
  const id = await galleryOf(c, a, { author: c.authorId('julien'), n: 0 });
  const [p1, p2, p3] = c.db.prepare("SELECT id, status FROM photos WHERE status = 'published' LIMIT 3").all();
  // p2 : un visage, une personne liée sans décision (à vérifier) ; p3 : une personne liée qui refuse (bloquée).
  c.db.prepare('UPDATE photos SET faces = 1 WHERE id IN (?, ?)').run(p2.id, p3.id);
  const enc = refused => c.db.prepare("INSERT INTO encounters (author_id, status, refused, created_at, updated_at) VALUES (?, 'traitee', ?, ?, ?)").run(c.authorId('julien'), refused, Date.now(), Date.now()).lastInsertRowid;
  c.db.prepare('INSERT INTO encounter_photos (encounter_id, photo_id) VALUES (?, ?)').run(enc(0), p2.id);
  c.db.prepare('INSERT INTO encounter_photos (encounter_id, photo_id) VALUES (?, ?)').run(enc(1), p3.id);
  const body = new URLSearchParams([['_csrf', a.csrf], ...[p1, p2, p3].map(p => ['photos', String(p.id)])]).toString();
  const r = await c.app.inject({ method: 'POST', url: `/admin/galeries/${id}/photos`, cookies: a.cookies, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: body });
  assert.equal(r.statusCode, 303);
  const items = c.db.prepare('SELECT photo_id FROM space_items WHERE space_id = ? ORDER BY position').pluck().all(id);
  assert.deepEqual(items, [p1.id, p2.id]);
  assert.deepEqual(c.db.prepare('SELECT status FROM photos WHERE id IN (?, ?) ORDER BY id').pluck().all(p1.id, p2.id), ['published', 'published']);   // G2
  const tab = (await a.get(`/admin/galeries/${id}/photos`)).body;
  assert.match(tab, /usage privé\u202f: à vérifier/);
  const item2 = c.db.prepare('SELECT id FROM space_items WHERE photo_id = ?').pluck().get(p2.id);
  await a.post(`/admin/galeries/${id}/photos/${item2}/confirmer`);
  assert.ok(c.db.prepare('SELECT confirmed_at FROM space_items WHERE id = ?').pluck().get(item2));
  await a.post(`/admin/galeries/${id}/photos/${item2}/monter`);
  assert.deepEqual(c.db.prepare('SELECT photo_id FROM space_items WHERE space_id = ? ORDER BY position').pluck().all(id), [p2.id, p1.id]);
  // Un refus arrivé après l'ajout : la photo disparaît pour les invités.
  c.db.prepare('UPDATE encounters SET refused = 1').run();
  assert.equal(c.app.spaces.items(id, { forGuests: true }).length, 1);
});

test('purges : un accès fini depuis plus de 6 mois est effacé avec son journal, ses favoris, ses appareils ; galerie fermée à l’échéance (T28, G3, G71)', async t => {
  const c = await site(t);
  const a = await c.login('julien');
  const id = await galleryOf(c, a, { author: c.authorId('julien') });
  const { r } = await newAccess(a, id);
  const inv = Number(r.headers.location.split('/')[5]);
  const item = c.db.prepare('SELECT id FROM space_items WHERE space_id = ? LIMIT 1').pluck().get(id);
  c.db.prepare('INSERT INTO space_favorites (invite_id, item_id, added_at) VALUES (?, ?, ?)').run(inv, item, Date.now());
  c.app.spaces.revoke(inv, null);
  c.app.spaces.purge();
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM space_invites').pluck().get(), 1);              // moins de 6 mois : gardé
  c.db.prepare('UPDATE space_invites SET ended_at = ? WHERE id = ?').run(Date.now() - 184 * 864e5, inv);
  c.app.spaces.purge();
  for (const tb of ['space_invites', 'space_favorites', 'space_events', 'space_invite_devices']) assert.equal(c.db.prepare(`SELECT COUNT(*) FROM ${tb}`).pluck().get(), 0, tb);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM private_spaces').pluck().get(), 1);              // la galerie reste
  // Échéance de la galerie : fermée, d'elle-même.
  c.db.prepare('UPDATE private_spaces SET closes_at = ? WHERE id = ?').run(Date.now() - 1000, id);
  c.app.spaces.purge();
  assert.equal(c.db.prepare('SELECT state FROM private_spaces WHERE id = ?').pluck().get(id), 'fermee');
});

test('pages de l’admin : liste, fiche, onglets, nouvel accès, confirmations, en trois langues ; menu « Galeries privées » ; « Aujourd’hui » signale une sélection envoyée', async t => {
  const c = await site(t);
  const a = await c.login('julien');
  const id = await galleryOf(c, a, { author: c.authorId('julien') });
  const { r } = await newAccess(a, id);
  const inv = Number(r.headers.location.split('/')[5]);
  c.db.prepare('UPDATE space_invites SET selection_sent_at = ? WHERE id = ?').run(Date.now(), inv);
  const urls = ['/admin/galeries', '/admin/galeries/nouvelle', `/admin/galeries/${id}`, `/admin/galeries/${id}/photos`, `/admin/galeries/${id}/selections`, `/admin/galeries/${id}/activite`, `/admin/galeries/${id}/reglages`,
    `/admin/galeries/${id}/acces/nouveau`, `/admin/galeries/${id}/acces/${inv}/revoquer`, `/admin/galeries/${id}/acces/${inv}/effacer`, `/admin/galeries/${id}/supprimer`];
  const home = await a.get('/admin');
  assert.match(home.body, /href="\/admin\/galeries"/);
  assert.match(home.body, /Sélection envoyée : « Lisbonne et Porto »/);
  for (const lang of ['fr', 'en', 'de']) {
    await a.post('/admin/langue', { lang, back: '/admin' });
    for (const url of urls) {
      const p = await a.get(url);
      assert.equal(p.statusCode, 200, `${lang} ${url}`);
      assert.doesNotMatch(p.body, /style="/, `${url} : aucun style en ligne (CSP)`);
    }
    // La fiche de l'accès (lue après coup : elle fige la sélection).
    assert.equal((await a.get(`/admin/galeries/${id}/acces/${inv}`)).statusCode, 200);
  }
  assert.match((await a.get('/admin/galeries')).body, /Private Galerien|Galerien/);
  assert.ok(c.db.prepare('SELECT selection_seen_at FROM space_invites WHERE id = ?').pluck().get(inv));
});
