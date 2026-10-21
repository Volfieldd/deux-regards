import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Admin v2, vague 3a : Identité et apparence, Comptes et rôles, Site public. Mêmes champs, mêmes droits, mêmes routes
// d'écriture que la v1 (la v2 demande seulement une réponse JSON aux mêmes routes) ; un compte en v1 voit la v1 ; CSRF ;
// journal avec les noms des champs ; et pour la Vigie, les mêmes émissions depuis la v1 et depuis la v2 : comptes (mêmes
// fonctions serveur, mêmes tickets, même journal account_changes), réglages publics (config_public_changed, vu par
// watchWrites) ; entrée « Sécurité », badge, bandeau critique et bandeau d'identité sur les trois écrans.
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const isV2 = html => html.includes('/static/admin/v2/v2.css');
const plain = r => Object.defineProperty(r, 'body', { value: r.body.replace(/[  ]/g, ' ') });
const SCREENS = ['/admin/apparence', '/admin/comptes', '/admin/site'];

async function site(t, opts = {}) {
  const received = [];
  const ctx = await setup(t, { seeded: true, env: VIGIE, vigieOptions: { send: async body => { received.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false }, ...opts });
  // Vigie simulée : les lots reçus, dans l'ordre.
  const security = async () => { ctx.app.securite.runTasks(); ctx.app.securite.retryNow(); await ctx.app.securite.flush(); return received; };
  const store = createSessionStore(ctx.db);
  // Un compte, sa session et son choix de version : get, post (formulaire, jeton), json (en-tête x-csrf-token), comme le
  // navigateur sans script et le script de la v2.
  const account = async (sub, { roles = ['admin'], version = 'v2', name = sub } = {}) => {
    ctx.app.accounts.ensure({ sub, name, roles });
    const token = store.create({ sub, name, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token };
    const get = async url => plain(await ctx.app.inject({ url, cookies, headers: { accept: 'text/html' } }));
    const post = async (url, payload = {}, { token: tok = csrf } = {}) => plain(await ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, ...(tok ? { _csrf: tok } : {}) } }));
    const json = (url, payload, { token: tok = csrf } = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'application/json', ...(tok ? { 'x-csrf-token': tok } : {}) }, payload });
    // Envoi d'un fichier comme le navigateur (multipart, jeton en premier champ) ; json : réponse JSON (script de la v2).
    const upload = (url, file, { asJson = false, tok = csrf } = {}) => {
      const b = `----dr${crypto.randomUUID()}`;
      const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${tok}\r\n--${b}\r\nContent-Disposition: form-data; name="fichier"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n`), file, Buffer.from(`\r\n--${b}--\r\n`)]);
      return ctx.app.inject({ method: 'POST', url, cookies, headers: { 'content-type': `multipart/form-data; boundary=${b}`, accept: asJson ? 'application/json' : 'text/html' }, payload: body });
    };
    const a = { sub, csrf, get, post, json, upload, version: async v => { await post('/admin/version', { version: v, back: '/admin' }); } };
    await a.version(version);
    await get('/admin/aide');                                                   // fenêtre « Nouveautés » vue une fois
    return a;
  };
  const setting = k => { const v = ctx.db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(k); return v == null ? undefined : JSON.parse(v); };
  const audits = action => ctx.db.prepare('SELECT action, target, status, detail FROM audit_log WHERE action = ? ORDER BY id').all(action);
  return { ...ctx, security, account, setting, audits };
}

// Un dessin de 128 px (anneau sombre sur fond transparent), PNG, accepté comme emblème.
function ring() {
  const w = 128, rows = [];
  for (let y = 0; y < w; y++) {
    const r = [0];
    for (let x = 0; x < w; x++) { const d = (x - 64) ** 2 + (y - 64) ** 2; r.push(...(d < 1600 && d > 625 ? [16, 16, 16, 255] : [0, 0, 0, 0])); }
    rows.push(Buffer.from(r));
  }
  const crc = buf => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(w, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

// Ce qui signe le gabarit v1 de chaque écran (views/admin/<écran>.eta) et qu'aucun gabarit v2 n'a.
const V1_MARKS = { appearance: '<div class="themes">', accounts: '<ul class="accounts">', settings: 'name="hero_save"' };

test('écrans en v2 ; un compte en v1 voit la v1 (son gabarit, son script), sans rien de la v2 ; repli des autres écrans', async t => {
  const read = f => fs.readFileSync(new URL(`../views/admin/${f}`, import.meta.url), 'utf8');
  const v2Views = fs.readdirSync(new URL('../views/admin/v2/', import.meta.url)).filter(f => f.endsWith('.eta')).map(f => read(`v2/${f}`));
  for (const [screen, mark] of Object.entries(V1_MARKS)) {
    assert.ok(read(`${screen}.eta`).includes(mark), `${screen} : repère du gabarit v1 introuvable`);
    assert.ok(!v2Views.some(v => v.includes(mark)), `${screen} : repère partagé avec un gabarit v2`);
  }
  const c = await site(t);
  const v1 = await c.account('compte-v1', { version: 'v1' });
  const v2 = await c.account('compte-v2');
  for (const [url, screen] of [['/admin/apparence', 'appearance'], ['/admin/comptes', 'accounts'], ['/admin/site', 'settings']]) {
    const a = await v1.get(url), b = await v2.get(url);
    assert.equal(a.statusCode, 200, url);
    assert.ok(!isV2(a.body), `${url} : la v1 pour le compte en v1`);
    assert.ok(a.body.includes(V1_MARKS[screen]), `${url} : le gabarit v1`);
    assert.match(a.body, /<script src="\/static\/admin\/admin\.js[?"]/, `${url} : le script de la v1`);
    assert.doesNotMatch(a.body, /\/static\/admin\/v2\//, `${url} : rien de la v2`);
    assert.equal(b.statusCode, 200, url);
    assert.ok(isV2(b.body), `${url} : la v2 pour le compte en v2`);
    assert.ok(!b.body.includes(V1_MARKS[screen]), `${url} : pas le gabarit v1`);
    assert.match(b.body, /\/static\/admin\/v2\/reglages-v2\.js/, url);
    assert.match(b.body, /\/static\/admin\/v2\/reglages-v2\.css/, url);
    assert.equal(b.headers['cache-control'], 'no-store', url);
    assert.doesNotMatch(b.body, /\sstyle="/, `${url} : aucun style en ligne`);
    assert.doesNotMatch(b.body, /<script(?![^>]*(?:\bsrc=|type="application\/json"))[^>]*>/, `${url} : aucun script en ligne`);
    assert.doesNotMatch(b.body, /\son[a-z]+="/, `${url} : aucun gestionnaire en ligne`);
  }
  // Droits & confidentialité garde son gabarit v2 (le gabarit partagé « settings » sert les deux pages).
  assert.match((await v2.get('/admin/droits')).body, /Mentions et confidentialité/);
  // Identité et apparence est dans les onglets des Réglages (MQ-07) ; Site public et Comptes ont leur entrée du menu.
  const ap = (await v2.get('/admin/apparence')).body;
  assert.match(ap, /<nav class="onglets"[^>]*>[^]*?<a href="\/admin\/apparence" aria-current="page">Identité et apparence/);
  assert.match((await v2.get('/admin/site')).body, /<a href="\/admin\/site" aria-current="page">[^]*?Site public<\/a>/);
  assert.match((await v2.get('/admin/comptes')).body, /<a href="\/admin\/comptes" aria-current="page">[^]*?Comptes et rôles<\/a>/);
  // Un écran pas encore en v2 reste en repli.
  // (Tous les écrans ont leur v2 : reste la confirmation de suppression de photos, que seule la v1 écrit.)
  const rep = await v2.post('/admin/photos/actions', { action: 'delete', ids: ['1'], back: '/admin/photos' });
  assert.ok(!isV2(rep.body));
  assert.match(rep.body, /Écran pas encore en v2/);
});

test('droits et portée : mêmes permissions que la v1, en page et à l’écriture (JSON compris)', async t => {
  const c = await site(t);
  const photographe = await c.account('ph', { roles: ['photographe'] });
  const relecteur = await c.account('rel', { roles: ['relecteur'] });
  const moderateur = await c.account('mod', { roles: ['moderateur'] });
  for (const u of SCREENS) assert.equal((await photographe.get(u)).statusCode, 403, u);
  // Relecteur et modérateur : Site public (site.textes) ; ni Apparence ni Comptes.
  for (const who of [relecteur, moderateur]) {
    assert.equal((await who.get('/admin/site')).statusCode, 200);
    assert.ok(isV2((await who.get('/admin/site')).body));
    assert.equal((await who.get('/admin/apparence')).statusCode, 403);
    assert.equal((await who.get('/admin/comptes')).statusCode, 403);
    assert.equal((await who.json('/admin/apparence', { theme: 'nicephos-nuit' })).statusCode, 403);
    assert.equal((await who.json('/admin/comptes/1', { roles: ['admin'] })).statusCode, 403);
    // Le lien vers Site public est là, pas « Identité et apparence » dans les Réglages ; le nom du site se lit dans Site public.
    const menu = (await who.get('/admin/site')).body;
    assert.doesNotMatch(menu, /href="\/admin\/apparence"/);
    assert.doesNotMatch(menu, /href="\/admin\/comptes"/);
  }
  // Le relecteur enregistre Site public depuis la v2 (part=site), pas les Droits (reglages.droits).
  assert.equal((await relecteur.json('/admin/reglages', { part: 'site', site_name: 'Relu' })).statusCode, 200);
  assert.equal(c.setting('site_name'), 'Relu');
  assert.equal((await relecteur.json('/admin/reglages', { part: 'droits', legal_names: 'X' })).statusCode, 403);
  // Le photographe n'écrit rien.
  assert.equal((await photographe.json('/admin/reglages', { part: 'site', site_name: 'Piège' })).statusCode, 403);
  assert.equal(c.setting('site_name'), 'Relu');
  assert.equal((await photographe.json('/admin/comptes/1', { roles: ['photographe'] })).statusCode, 403);
  // Identité et apparence : le nom du site est montré, et mène à Site public pour qui peut l'ouvrir.
  const adm = await c.account('adm');
  assert.match((await adm.get('/admin/apparence')).body, /<p class="rg-lu"><b>Relu<\/b> · <a href="\/admin\/site#textes">se règle dans Site public<\/a><\/p>/);
});

test('CSRF : aucune écriture sans jeton (formulaire ou JSON), rien ne change', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  c.app.accounts.ensure({ sub: 'cam', name: 'Camille', roles: [] });
  const cam = c.app.accounts.bySub('cam');
  const theme = c.setting('theme');
  for (const [url, payload] of [['/admin/apparence', { theme: 'nicephos-nuit' }], ['/admin/reglages', { part: 'site', site_name: 'Sans jeton' }], [`/admin/comptes/${cam.id}`, { roles: ['admin'] }], [`/admin/comptes/${cam.id}/supprimer`, {}]]) {
    assert.equal((await adm.json(url, payload, { token: null })).statusCode, 403, url);
    assert.equal((await adm.post(url, payload, { token: null })).statusCode, 403, url);
    assert.equal((await adm.json(url, payload, { token: 'faux' })).statusCode, 403, url);
  }
  assert.equal(c.setting('theme'), theme);
  assert.notEqual(c.setting('site_name'), 'Sans jeton');
  assert.deepEqual(c.app.accounts.bySub('cam').roles, []);
  // Logo : le jeton est lu avant le fichier ; faux, rien n'est écrit.
  const r = await adm.upload('/admin/apparence/marque/embleme', ring(), { tok: 'faux', asJson: true });
  assert.equal(r.statusCode, 403);
  assert.equal(c.app.appearance.brand().emblem, null);
});

test('Identité et apparence v2 : au geste (JSON), Défaire, logos, version du site public inchangée ; journal avec les noms des champs', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const html = (await adm.get('/admin/apparence')).body;
  // Les champs de la v1 : sous-titre, marque, thème, quatre emplacements de logo, version du site public, vue de la session.
  for (const re of [/name="subtitle"[^>]*maxlength="60"/, /name="brand_mode" value="texte"/, /name="brand_mode" value="embleme"[^>]* disabled/, /name="theme" value="atelier"/,
    /action="\/admin\/apparence\/marque\/embleme" enctype="multipart\/form-data"/, /action="\/admin\/apparence\/marque\/partage"/, /name="site_public" value="v3"/,
    /action="\/admin\/apparence\/apercu-v2"[^]*?name="vue" value="v2"/, /<button class="btn" type="submit">Enregistrer la version<\/button>/]) assert.match(html, re);
  // Sans script : un bouton enregistre identité et thème ; retirer un logo passe par son dialogue (ancre).
  assert.match(html, /<p class="sans-script form-pied"><button class="btn" type="submit">Enregistrer l’identité et le thème<\/button><\/p>/);
  assert.match(html, /<dialog class="confirm cible" id="dlg-retirer-embleme"[^>]*>[^]*?action="\/admin\/apparence\/marque\/embleme\/delete"[^]*?<a class="btn ghost" href="#marque-embleme" data-annuler>Annuler<\/a>/);
  // Au geste : un champ à la fois ; le reste ne bouge pas.
  const before = c.app.appearance.brand();
  let r = await adm.json('/admin/apparence', { subtitle: '  Galerie  ' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().subtitle, 'Galerie');
  assert.equal(c.app.appearance.brand().mode, before.mode);
  r = await adm.json('/admin/apparence', { theme: 'nicephos-nuit' });
  assert.deepEqual([r.json().theme, r.json().subtitle], ['nicephos-nuit', 'Galerie']);
  // « Défaire » : la valeur d'avant, par la même route.
  await adm.json('/admin/apparence', { theme: 'atelier' });
  assert.equal(c.setting('theme'), 'atelier');
  const lines = c.audits('POST /admin/apparence');
  assert.deepEqual(lines.map(l => l.detail), ['champs : subtitle', 'champs : theme', 'champs : theme']);
  assert.ok(lines.every(l => !/Galerie|nuit/.test(l.detail)), 'jamais les valeurs');
  // La version du site public : même formulaire et même ligne de journal qu'en v1.
  await adm.post('/admin/apparence', { site_public: 'v3' });
  assert.equal(c.app.publicVersion.setting(), 'v3');
  assert.equal(c.audits('POST /admin/apparence').at(-1).detail, 'site public : v1 → v3');
  // Vue de la session : la route de la v1, inchangée.
  const v = await adm.post('/admin/apparence/apercu-v2', { vue: 'v2', vers: '/' });
  assert.deepEqual([v.statusCode, v.headers.location], [303, '/']);
  assert.match((await adm.get('/admin/apparence')).body, /name="vue" value="suivre"[^]*?Votre vue : la v2, pour vous seul, sur cette session\./);
  // Logo : enregistré au choix du fichier (JSON) ; la marque passe à l'emblème ; « Défaire » le retire.
  const up = await adm.upload('/admin/apparence/marque/embleme', ring(), { asJson: true });
  assert.equal(up.statusCode, 200, up.body);
  const u = up.json();
  assert.match(u.file, /^embleme-[0-9a-f]{8}\.png$/);
  assert.deepEqual([u.mode, u.modeBefore], ['embleme', 'texte']);
  assert.equal(c.app.appearance.brand().emblem, u.file);
  assert.equal(c.audits('POST /admin/apparence/marque/:slot').at(-1).detail, 'champs : mode, emblem, ratio, favicon64, favicon180');
  const del = await adm.json('/admin/apparence/marque/embleme/delete', {});
  assert.deepEqual([del.statusCode, del.json().mode], [200, 'texte']);
  assert.equal(c.app.appearance.brand().emblem, null);
  // Fichier refusé : 422 en JSON, avec la raison ; « refusé » au journal ; rien d'écrit.
  const bad = await adm.upload('/admin/apparence/marque/embleme', Buffer.from('GIF89a'), { asJson: true });
  assert.equal(bad.statusCode, 422);
  assert.match(bad.json().error, /Emblème \(dessin\) refusé/);
  assert.equal(c.audits('POST /admin/apparence/marque/:slot').at(-1).status, 422);
  // Sans script : la même route redirige avec son message, comme en v1.
  const form = await adm.upload('/admin/apparence/marque/embleme', ring());
  assert.deepEqual([form.statusCode, form.headers.location], [303, '/admin/apparence']);
});

test('Comptes et rôles v2 : cartes, Modifier, Défaire, supprimer après un dialogue et seulement un compte désactivé ou en attente', async t => {
  const c = await site(t);
  const adm = await c.account('adm', { name: 'Admin' });
  c.app.accounts.ensure({ sub: 'zitadel-cam', name: 'Camille', roles: [] });
  c.app.accounts.ensure({ sub: 'zitadel-dom', name: 'Dominique', roles: ['relecteur'] });
  const cam = c.app.accounts.bySub('zitadel-cam'), dom = c.app.accounts.bySub('zitadel-dom');
  let html = (await adm.get('/admin/comptes')).body;
  // En attente d'abord, son formulaire ouvert, l'identifiant à vérifier ; les champs de la v1 (rôles, photographe, état).
  assert.match(html, /<h2 class="rub-titre" id="g-attente">En attente d’un rôle <span class="rg-n">\(1\)<\/span><\/h2>[^]*?id="g-actifs">Comptes actifs/);
  assert.match(html, new RegExp(`<article class="panel rg-compte" id="compte-${cam.id}"[^]*?<details class="plier modif" open><summary>[^]*?Donner un rôle[^]*?<code class="sub-nolang">zitadel-cam</code>[^]*?name="roles" value="admin"[^]*?name="author_id"[^]*?name="status" value="desactive"[^]*?Donner ce rôle`));
  // Supprimer : seulement pour un compte en attente ou désactivé, par un dialogue qui le nomme (Annuler d'abord).
  assert.match(html, new RegExp(`<a class="btn danger-c" href="#dlg-suppr-${cam.id}" data-ouvre="dlg-suppr-${cam.id}"`));
  assert.match(html, new RegExp(`<dialog class="confirm cible" id="dlg-suppr-${cam.id}"[^]*?Supprimer le compte « Camille » \\?[^]*?<a class="btn ghost" href="#compte-${cam.id}" data-annuler>Annuler</a><button class="btn danger" type="submit">Supprimer le compte</button>`));
  assert.doesNotMatch(html, new RegExp(`dlg-suppr-${dom.id}"`), 'compte actif : pas de suppression directe');
  assert.match(html, /Pour supprimer ce compte, désactivez-le d’abord/);
  assert.doesNotMatch(html, new RegExp(`dlg-suppr-${c.app.accounts.bySub('adm').id}"`), 'pas soi-même');
  // Donner un rôle depuis la v2 (JSON) : l'état enregistré revient ; « Défaire » renvoie l'état d'avant par la même route.
  let r = await adm.json(`/admin/comptes/${cam.id}`, { roles: ['relecteur'], author_id: '', status: '' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json().account, { id: cam.id, roles: ['relecteur'], status: 'actif', author_id: null });
  assert.equal(r.json().message, 'Compte « Camille » enregistré.');
  r = await adm.json(`/admin/comptes/${cam.id}`, { roles: [], author_id: '', status: '' });
  assert.deepEqual([r.json().account.roles, r.json().account.status], [[], 'en_attente']);
  // Garde-fous de app.accounts.update : refus en JSON (422), « refusé » au journal, rien de changé.
  const me = c.app.accounts.bySub('adm');
  r = await adm.json(`/admin/comptes/${me.id}`, { roles: ['admin'], status: 'desactive' });
  assert.equal(r.statusCode, 422);
  assert.equal(r.json().error, 'Vous ne pouvez pas désactiver votre propre compte.');
  assert.equal(c.app.accounts.bySub('adm').status, 'actif');
  assert.equal(c.audits('POST /admin/comptes/:id').at(-1).status, 422);
  // Journal : la ligne « compte modifié » de la v1, avec son détail (rôles, état).
  const mod = c.audits('compte modifié');
  assert.deepEqual(mod.map(l => l.detail), ['rôles : — → Relecteur ; état : en attente → actif', 'rôles : Relecteur → — ; état : actif → en attente']);
  // Désactiver (v2 : la case du formulaire), puis supprimer par le formulaire du dialogue (la route de la v1).
  await adm.json(`/admin/comptes/${dom.id}`, { roles: ['relecteur'], author_id: '', status: 'desactive' });
  assert.equal(c.app.accounts.bySub('zitadel-dom').status, 'desactive');
  html = (await adm.get('/admin/comptes')).body;
  assert.match(html, new RegExp(`id="dlg-suppr-${dom.id}"`));
  assert.match(html, /id="g-actifs">Comptes actifs[^]*?id="g-desactives">Comptes désactivés <span class="rg-n">\(1\)<\/span>/);
  const del = await adm.post(`/admin/comptes/${dom.id}/supprimer`);
  assert.deepEqual([del.statusCode, del.headers.location], [303, '/admin/comptes']);
  assert.equal(c.app.accounts.bySub('zitadel-dom'), undefined);
  assert.equal(c.audits('compte supprimé').length, 1);
  // Sans script : le formulaire de la carte part tel quel vers la même route.
  const f = await adm.post(`/admin/comptes/${cam.id}`, { roles: 'moderateur', author_id: '' });
  assert.deepEqual([f.statusCode, f.headers.location], [303, '/admin/comptes']);
  assert.deepEqual(c.app.accounts.bySub('zitadel-cam').roles, ['moderateur']);
});

test('Site public v2 : les champs de la v1, la page entière au geste (JSON), ouverture sans script, journal avec les noms des champs', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const html = (await adm.get('/admin/site')).body;
  for (const n of ['site_name', 'tagline', 'tagline_en', 'tagline_de', 'intro', 'intro_en', 'intro_de', 'about', 'about_en', 'about_de', 'map_page', 'search_page', 'keywords_shown']) assert.match(html, new RegExp(`name="${n}"`), n);
  assert.match(html, /<form class="form rg-form" id="site-f" method="post" action="\/admin\/reglages" novalidate data-site>[^]*?name="part" value="site"/);
  assert.match(html, /<p class="sans-script form-pied"><button class="btn" type="submit">Enregistrer le site public<\/button><\/p>/);
  assert.doesNotMatch(html, /hero_save/, 'un seul bouton (UX-A-06)');
  const published = c.db.prepare("SELECT slug FROM photos WHERE status = 'published' ORDER BY id").pluck().all();
  // Au geste : le formulaire entier, comme sans script.
  const page = { part: 'site', site_name: 'Nicephos', tagline: 'Deux regards', intro: '', about: '', search_page: 'on', hero: published.slice(0, 2) };
  let r = await adm.json('/admin/reglages', page);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json().hero, published.slice(0, 2));
  assert.equal(c.setting('tagline'), 'Deux regards');
  // Changer l'ordre, puis « Défaire » : l'état d'avant, par la même route.
  await adm.json('/admin/reglages', { ...page, hero: [published[1], published[0]] });
  assert.deepEqual(c.setting('hero'), [published[1], published[0]]);
  await adm.json('/admin/reglages', page);
  assert.deepEqual(c.setting('hero'), published.slice(0, 2));
  // Sans script : les boutons ← → ✕ de l'ouverture, la route de la v1.
  const nojs = await adm.post('/admin/reglages', { ...page, hero_op: `right:${published[0]}` });
  assert.deepEqual([nojs.statusCode, nojs.headers.location], [303, '/admin/site#ouverture']);
  assert.deepEqual(c.setting('hero'), [published[1], published[0]]);
  // Journal : les noms des champs, jamais leurs valeurs.
  const lines = c.audits('POST /admin/reglages').map(l => l.detail);
  assert.ok(lines[0].startsWith('champs : ') && lines[0].includes('tagline') && lines[0].includes('hero'), lines[0]);
  assert.deepEqual(lines.slice(1), ['champs : hero', 'champs : hero', 'champs : hero']);
  assert.ok(lines.every(l => !/Deux regards/.test(l)));
});

// Émissions vers la Vigie, normalisées pour comparer la v1 et la v2 : type, gravité, émetteur, et le détail sans le compte
// visé ni les numéros (référence, horodatage).
const norm = e => ({ type: e.type, severity: e.severity, sub: e.sub, emetteur: e.origine?.emetteur, detail: { ...e.detail, compte: undefined } });
const accountTables = db => ({ changes: db.prepare('SELECT COUNT(*) FROM account_changes').pluck().get(), tickets: db.prepare('SELECT COUNT(*) FROM account_change_tickets').pluck().get() });

test('Vigie — comptes : mêmes émissions, mêmes tickets, même journal account_changes depuis la v1 et depuis la v2', async t => {
  const run = async version => {
    const c = await site(t);
    const adm = await c.account('adm', { version });
    for (const s of ['cam', 'dom']) c.app.accounts.ensure({ sub: `zitadel-${s}`, name: s, roles: [] });
    const cam = c.app.accounts.bySub('zitadel-cam'), dom = c.app.accounts.bySub('zitadel-dom');
    const start = (await c.security()).length;
    const t0 = accountTables(c.db);
    // v1 : le formulaire (cases, liste, case « Désactivé ») ; v2 : le même envoi en JSON, et le même formulaire sans script.
    const send = (id, s) => (version === 'v1'
      ? adm.post(`/admin/comptes/${id}`, { roles: s.roles, author_id: s.author_id ?? '', ...(s.status ? { status: s.status } : {}) })
      : adm.json(`/admin/comptes/${id}`, { roles: s.roles, author_id: s.author_id ?? '', status: s.status || '' }));
    const ok = r => assert.ok([200, 303].includes(r.statusCode), r.body);
    ok(await send(cam.id, { roles: ['admin'] }));                                 // administrateur donné : « haut »
    ok(await send(cam.id, { roles: ['relecteur'] }));                             // rôle retiré
    ok(await send(dom.id, { roles: ['photographe'], author_id: '' }));
    ok(await send(dom.id, { roles: ['photographe'], status: 'desactive' }));      // désactivé
    ok(await adm.post(`/admin/comptes/${dom.id}/supprimer`));                       // supprimé (formulaire du dialogue)
    const events = (await c.security()).slice(start).filter(e => /^(privilege_permissions_changed|user_created|user_deleted|user_rescued)$/.test(e.type));
    const t1 = accountTables(c.db);
    const audit = c.db.prepare("SELECT action, detail FROM audit_log WHERE action IN ('compte modifié', 'compte supprimé') ORDER BY id").all();
    return { events: events.map(norm), raw: events, tables: { changes: t1.changes - t0.changes, tickets: t1.tickets - t0.tickets }, audit };
  };
  const v1 = await run('v1'), v2 = await run('v2');
  assert.equal(v1.events.length, 5, JSON.stringify(v1.events));
  assert.deepEqual(v2.events, v1.events);
  assert.deepEqual(v2.tables, v1.tables);
  assert.deepEqual(v2.audit, v1.audit);
  // Chaque changement porte un ticket valide de l'application (rien « hors application »), comme en v1.
  assert.ok(v2.raw.every(e => e.detail.hors_application === false && e.origine.emetteur.startsWith('server/accounts.js · ')));
  const given = v2.raw.find(e => e.detail.administrateur_donne);
  assert.equal(given.severity, 'haut');
  assert.equal(given.sub, 'adm');
  assert.deepEqual(v2.raw.map(e => e.type), ['privilege_permissions_changed', 'privilege_permissions_changed', 'privilege_permissions_changed', 'privilege_permissions_changed', 'user_deleted']);
});

test('Vigie — aucune écriture SQL directe dans la v2 : les écrans passent par les mêmes fonctions serveur', () => {
  // Les gabarits et le script de la v2 n'écrivent que par les routes de la v1 ; la route des comptes appelle
  // app.accounts.update / remove (ticket, account_changes), jamais la table accounts.
  const src = fs.readFileSync(new URL('../server/routes/admin.js', import.meta.url), 'utf8');
  const route = (s, from) => s.slice(s.indexOf(from), s.indexOf('\n  });', s.indexOf(from)));
  for (const r of [route(src, "app.post('/admin/comptes/:id', "), route(src, "app.post('/admin/comptes/:id/supprimer'")]) {
    assert.match(r, /app\.accounts\.(update|remove)\(/);
    assert.doesNotMatch(r, /db\.prepare|UPDATE accounts|DELETE FROM accounts|INSERT INTO accounts/);
  }
  const js = fs.readFileSync(new URL('../public/admin/v2/reglages-v2.js', import.meta.url), 'utf8');
  const urls = [...js.matchAll(/(?:post|fetch)\((?:'([^']+)'|`([^`]+)`|([a-zA-Z.]+))/g)].map(m => m[1] || m[2] || m[3]);
  for (const u of urls) assert.match(u, /^(?:\/admin\/(?:apparence|reglages|comptes|traduction)|url|form\.action|\$\{form\.action\}\/delete)$/, u);
});

test('Vigie — réglages publics : config_public_changed vu par watchWrites, le même depuis la v1 et depuis la v2', async t => {
  const run = async version => {
    const c = await site(t);
    const adm = await c.account('adm', { version });
    await adm.post('/admin/theme', { theme: 'dark' });                              // première écriture : point de départ
    const start = (await c.security()).length;
    const page = { part: 'site', site_name: 'Nicephos', tagline: 'Une autre accroche', intro: '', about: '', search_page: 'on' };
    if (version === 'v1') {
      await adm.post('/admin/reglages', page);
      await adm.post('/admin/apparence', { theme: 'nicephos-nuit', brand_mode: 'texte', subtitle: '' });
      await adm.post('/admin/apparence', { site_public: 'v2' });
    } else {
      assert.equal((await adm.json('/admin/reglages', page)).statusCode, 200);
      assert.equal((await adm.json('/admin/apparence', { theme: 'nicephos-nuit' })).statusCode, 200);
      await adm.post('/admin/apparence', { site_public: 'v2' });                     // la v2 garde le formulaire de la v1
    }
    return (await c.security()).slice(start).filter(e => e.type === 'config_public_changed' && !e.detail?.objet).map(norm);
  };
  const v1 = await run('v1'), v2 = await run('v2');
  assert.deepEqual(v2, v1);
  assert.equal(v2.length, 3);
  assert.ok(['site_name', 'tagline'].every(k => v2[0].detail.cles.includes(k)), JSON.stringify(v2[0].detail.cles));
  assert.deepEqual(v2.slice(1).map(e => e.detail.cles), [['theme'], ['public_version']]);
  assert.equal(v2[1].detail.valeurs.theme.apres, 'nicephos-nuit');
  assert.equal(v2[2].detail.valeurs.public_version.apres, 'v2');
});

test('Vigie sur les trois écrans v2 : entrée « Sécurité », badge, bandeau critique ; bandeau d’identité et écritures arrêtées', async t => {
  const c = await site(t);
  const p = JSON.stringify({ usage: 'resume', emis_a: Date.now(), ouvertes: { critique: 1, haut: 0, moyen: 0, bas: 0 }, plus_grave: { id: 7, gravite: 'critique', depuis: Date.now() - 60e3 }, critique_a_prendre: true });
  c.app.decisions.acceptSummary({ payload: p, signature: crypto.sign(null, Buffer.from(p), VIGIE_KEYS.privateKey).toString('base64') });
  const adm = await c.account('adm');
  for (const url of SCREENS) {
    const html = (await adm.get(url)).body;
    assert.ok(isV2(html), url);
    assert.match(html, /<a class="nav-sec" href="[^"]+" target="_blank" rel="noopener noreferrer">[^]*?Sécurité<span class="sr-only"> \(nouvel onglet\)<\/span>[^]*?<span class="nav-badge/, url);
    assert.match(html, /<div class="sec-bandeau" role="alert">/, url);
    assert.doesNotMatch(html, /class="sec-bandeau identite"/, url);
  }
  // Rien pour un compte sans securite.voir (le modérateur ouvre Site public).
  const mod = await c.account('mod', { roles: ['moderateur'] });
  assert.doesNotMatch((await mod.get('/admin/site')).body, /nav-sec|sec-bandeau/);
  // Vérification d'identité demandée par la Vigie : le bandeau sur les trois écrans, les écritures de la v2 arrêtées.
  const v = JSON.stringify({ usage: 'site', version: Date.now(), emis_a: Date.now(), blocages: [], sessions: [], comptes: [], gels: [], verrouillage: null, verifications: [{ sub: 'adm', depuis: Date.now() - 1000, fin: Date.now() + 864e5 }] });
  c.app.decisions.accept({ payload: v, signature: crypto.sign(null, Buffer.from(v), VIGIE_KEYS.privateKey).toString('base64') });
  for (const url of SCREENS) {
    const html = (await adm.get(url)).body;
    assert.match(html, new RegExp(`<div class="sec-bandeau identite" role="status">[^]*?<a class="btn" href="/auth/verifier\\?next=${encodeURIComponent(url).replace(/%/g, '%')}">Confirmer mon identité</a></div>`), url);
  }
  const theme = c.setting('theme');
  const j = await adm.json('/admin/apparence', { theme: 'nicephos-nuit' });
  assert.equal(j.statusCode, 403);
  assert.match(j.json().verifier, /^\/auth\/verifier\?next=/);
  assert.equal(c.setting('theme'), theme);
  c.app.accounts.ensure({ sub: 'zitadel-cam', name: 'Camille', roles: [] });
  assert.equal((await adm.json(`/admin/comptes/${c.app.accounts.bySub('zitadel-cam').id}`, { roles: ['admin'] })).statusCode, 403);
  assert.deepEqual(c.app.accounts.bySub('zitadel-cam').roles, []);
  assert.equal((await adm.json('/admin/reglages', { part: 'site', site_name: 'Pendant' })).statusCode, 403);
  assert.notEqual(c.setting('site_name'), 'Pendant');
});
