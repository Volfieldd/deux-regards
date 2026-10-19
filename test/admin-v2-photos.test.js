import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { titleFromFilename } from '../server/admin-repo.js';

// Admin v2, vague 2 : la fiche d'une photo, la photothèque et « À valider ». Mêmes champs, mêmes droits, mêmes routes
// d'écriture que la v1 ; la v1 ne change pas ; chaque écran a son repli (un compte en v1 voit la v1) ; CSRF, portée « les
// miennes » (authz_fail hors portée), journal avec les noms des champs et jamais leurs valeurs, BV-2 vu depuis la v2,
// suggestion jamais enregistrée sans « Enregistrer » ; la Vigie (entrée, badge, bandeau) sur les trois écrans.
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const isV2 = html => html.includes('/static/admin/v2/v2.css');
const plain = r => Object.defineProperty(r, 'body', { value: r.body.replace(/[  ]/g, ' ') });

async function site(t, opts = {}) {
  const received = [];
  const ctx = await setup(t, { seeded: true, env: VIGIE, vigieOptions: { send: async body => { received.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false }, ...opts });
  const security = async () => { ctx.app.securite.runTasks(); ctx.app.securite.retryNow(); await ctx.app.securite.flush(); return received; };
  const store = createSessionStore(ctx.db);
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  // Un compte, sa session et son choix de version : get, post (formulaire, jeton), json (en-tête x-csrf-token).
  const account = async (sub, { roles = ['admin'], author = null, version = 'v2' } = {}) => {
    ctx.app.accounts.ensure({ sub, name: sub, roles });
    if (author) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId: author }, 'test');
    const token = store.create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token };
    const get = async url => plain(await ctx.app.inject({ url, cookies, headers: { accept: 'text/html' } }));
    const post = async (url, payload = {}, { token: tok = csrf } = {}) => plain(await ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, ...(tok ? { _csrf: tok } : {}) } }));
    const json = (url, payload, { token: tok = csrf } = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'application/json', ...(tok ? { 'x-csrf-token': tok } : {}) }, payload });
    const a = { sub, csrf, get, post, json, version: async v => { await post('/admin/version', { version: v, back: '/admin' }); } };
    await a.version(version);
    await get('/admin/aide');                                                   // fenêtre « Nouveautés » vue une fois
    return a;
  };
  const row = id => ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  const first = (author, status = 'published') => ctx.db.prepare('SELECT * FROM photos WHERE status = ? AND author_id = ? ORDER BY position, id LIMIT 1').get(status, author);
  const audits = action => ctx.db.prepare('SELECT action, target, detail FROM audit_log WHERE action = ? ORDER BY id').all(action);
  // Le formulaire de la fiche tel que le navigateur l'envoie sans script (le bouton porte le statut actuel).
  const form = (p, extra = {}) => ({ title: p.title, slug: p.slug, category_id: String(p.category_id), author_id: String(p.author_id), place: p.place || '',
    taken_on: p.taken_on || '', legend: p.legend || '', status: p.status, watermark: 'default', ...extra });
  return { ...ctx, security, account, seb, jul, row, first, audits, form };
}

// Ce qui signe le gabarit v1 de chaque écran (views/admin/<écran>.eta) et qu'aucun gabarit v2 n'a.
const V1_MARKS = { photo: '<div class="edit">', photos: '<form class="filters"', review: '<p class="prose">' };

test('v1 inchangée : un compte en v1 voit la v1 de ces écrans (son gabarit, sa mise en page, son script), sans rien de la v2', async t => {
  const read = f => fs.readFileSync(new URL(`../views/admin/${f}`, import.meta.url), 'utf8');
  const v2Views = fs.readdirSync(new URL('../views/admin/v2/', import.meta.url)).filter(f => f.endsWith('.eta')).map(f => read(`v2/${f}`));
  for (const [screen, mark] of Object.entries(V1_MARKS)) {
    assert.ok(read(`${screen}.eta`).includes(mark), `${screen} : repère du gabarit v1 introuvable`);
    assert.ok(!v2Views.some(v => v.includes(mark)), `${screen} : repère partagé avec un gabarit v2`);
  }
  const c = await site(t);
  const v1 = await c.account('compte-v1', { version: 'v1' });
  const v2 = await c.account('compte-v2');
  const id = c.first(c.seb).id;
  for (const [url, screen] of [[`/admin/photos/${id}`, 'photo'], ['/admin/photos', 'photos'], ['/admin/a-valider', 'review']]) {
    const a = await v1.get(url), b = await v2.get(url);
    assert.equal(a.statusCode, 200, url);
    assert.ok(!isV2(a.body), `${url} : la v1 pour le compte en v1`);
    assert.ok(a.body.includes(V1_MARKS[screen]), `${url} : le gabarit v1 (views/admin/${screen}.eta)`);
    assert.match(a.body, /<script src="\/static\/admin\/admin\.js[?"]/, `${url} : le script de la v1`);
    assert.doesNotMatch(a.body, /\/static\/admin\/v2\//, `${url} : aucune feuille ni aucun script de la v2`);
    assert.ok(!b.body.includes(V1_MARKS[screen]), `${url} : pas le gabarit v1 pour le compte en v2`);
    assert.ok(isV2(b.body), `${url} : la v2 pour le compte en v2`);
    assert.equal(b.headers['cache-control'], 'no-store', url);
    assert.doesNotMatch(b.body, /\sstyle="/, `${url} : aucun style en ligne`);
    assert.doesNotMatch(b.body, /<script(?![^>]*(?:\bsrc=|type="application\/json"))[^>]*>/, `${url} : aucun script en ligne`);
  }
});

test('fiche v2 : les champs de la v1, le témoin, les dialogues ; sans script, « Enregistrer la fiche » garde le statut', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const p = c.first(c.seb);
  c.db.prepare("UPDATE photos SET taken_on = '2025-05-01', taken_time = '14:32' WHERE id = ?").run(p.id);
  const html = (await adm.get(`/admin/photos/${p.id}`)).body;
  assert.match(html, /<form class="form fiche-form" id="fiche-f" method="post" action="\/admin\/photos\/\d+" novalidate data-autosave data-url="\/admin\/photos\/\d+\/champs">/);
  // Les champs de la v1 : titre et traductions, légende, texte de remplacement (trois langues), mots-clés, série,
  // photographe, lieu, ville de la carte, carte, date, heure montrée, filigrane, adresse.
  for (const name of ['title', 'title_en', 'title_de', 'legend', 'legend_en', 'legend_de', 'alt_text', 'alt_text_en', 'alt_text_de', 'keywords', 'category_id', 'author_id', 'place', 'place_en', 'place_de', 'city_label', 'city_id', 'on_map', 'taken_on', 'show_time', 'watermark', 'slug']) {
    assert.match(html, new RegExp(`name="${name}"`), name);
  }
  assert.match(html, /data-champ="show_time" data-label="Heure sur le site"/);
  assert.match(html, /Montrer l’heure sur le site \(14 h 32\)/);
  assert.match(html, /L’appareil indique le jeudi 1 mai 2025 à 14 h 32\./);
  assert.match(html, /inventaire [A-Z]\d{2}-\d{3}/);
  // Plus de boutons radio de statut (UX-A-23) : « Enregistrer la fiche » (sans script) porte le statut actuel.
  assert.doesNotMatch(html, /type="radio" name="status"/);
  assert.match(html, /<p class="sans-script form-pied"><button class="btn" type="submit" name="status" value="published">Enregistrer la fiche<\/button><\/p>/);
  // Dépublier : un dialogue qui demande la raison, joignable sans script par son ancre.
  assert.match(html, /<a class="btn danger-c" href="#dlg-depublier" data-ouvre="dlg-depublier"/);
  assert.match(html, /<dialog class="confirm cible" id="dlg-depublier"[^>]*>\s*<form method="post" action="\/admin\/photos\/\d+\/depublier" novalidate>\s*<input type="hidden" name="_csrf" value="[^"]+">[^]*?name="raison"[^]*?required/);
  assert.match(html, /id="dlg-supprimer"[^]*?action="\/admin\/photos\/\d+\/delete"/);
  // Sans script : le formulaire complet, comme la v1 ; une photo publiée reste publiée.
  const r = await adm.post(`/admin/photos/${p.id}`, c.form(c.row(p.id), { legend: 'Une légende', status: 'published' }));
  assert.deepEqual([r.statusCode, r.headers.location], [303, `/admin/photos/${p.id}`]);
  assert.equal(c.row(p.id).status, 'published');
  assert.equal(c.row(p.id).legend, 'Une légende');
  // Une erreur : la fiche revient (422) avec le résumé titré, le témoin et l'erreur sous le champ ; rien n'est enregistré.
  const bad = await adm.post(`/admin/photos/${p.id}`, c.form(c.row(p.id), { taken_on: 'demain matin', legend: 'Perdue ?' }));
  assert.equal(bad.statusCode, 422);
  assert.match(bad.body, /<section class="resume-a" id="resume-fiche" tabindex="-1"[^]*?Fiche non enregistrée : 1 champ à corriger/);
  assert.match(bad.body, /<a class="enreg enreg--attente" href="#taken_on">[^]*?1 champ non enregistré : Date de la prise de vue/);
  assert.match(bad.body, /id="taken_on"[^>]*aria-describedby="taken_on-a taken_on-lu err-taken_on"[^>]*aria-invalid="true"/);
  assert.match(bad.body, /<textarea id="legend"[^>]*>Perdue \?<\/textarea>/);
  assert.equal(c.row(p.id).legend, 'Une légende');
  // Brouillon : « Publier… » mène au dialogue (publier maintenant ou programmer, POST …/valider).
  const d = c.first(c.jul);
  await adm.post(`/admin/photos/${d.id}/status`, { status: 'draft' });
  const draft = (await adm.get(`/admin/photos/${d.id}`)).body;
  assert.match(draft, /<a class="btn" href="#dlg-publier" data-ouvre="dlg-publier"/);
  assert.match(draft, /id="dlg-publier"[^]*?action="\/admin\/photos\/\d+\/valider"[^]*?name="quand" value="maintenant" checked[^]*?type="datetime-local"/);
  const pub = await adm.post(`/admin/photos/${d.id}/valider`, { quand: 'maintenant' });
  assert.equal(pub.statusCode, 303);
  assert.equal(c.row(d.id).status, 'published');
});

test('fiche v2 : champ par champ (filigrane, adresse, heure), journal avec les noms des champs, CSRF, BV-2 vu depuis la v2', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const p = c.first(c.seb);
  c.db.prepare("UPDATE photos SET taken_on = '2025-05-01', taken_time = '14:32', show_time = 0 WHERE id = ?").run(p.id);
  // Le filigrane et l'adresse s'enregistrent champ par champ (ce que la v1 ne faisait que par le formulaire entier).
  const w = await adm.json(`/admin/photos/${p.id}/champs`, { watermark: 'none' });
  assert.equal(w.statusCode, 200);
  assert.equal(c.row(p.id).watermark, 0);
  const s = await adm.json(`/admin/photos/${p.id}/champs`, { slug: 'Pas Valide' });
  assert.equal(s.statusCode, 422);
  assert.match(JSON.parse(s.body).errors.slug, /Minuscules/);
  assert.equal((await adm.json(`/admin/photos/${p.id}/champs`, { slug: 'nouvelle-adresse' })).statusCode, 200);
  assert.equal(c.row(p.id).slug, 'nouvelle-adresse');
  // Sans jeton : refusé, rien ne change.
  assert.equal((await adm.json(`/admin/photos/${p.id}/champs`, { watermark: 'default' }, { token: null })).statusCode, 403);
  assert.equal(c.row(p.id).watermark, 0);
  // Journal : les noms des champs, jamais leurs valeurs.
  const lines = c.audits('POST /admin/photos/:id/champs');
  assert.ok(lines.some(l => l.detail === 'champs : watermark'), JSON.stringify(lines));
  assert.ok(lines.some(l => l.detail === 'champs : slug'));
  assert.ok(lines.every(l => !/nouvelle-adresse|none/.test(l.detail)));
  // BV-2 : l'heure montrée, cochée depuis la fiche v2 (enregistrement au champ quitté), est vue par la Vigie.
  const before = (await c.security()).length;
  assert.equal((await adm.json(`/admin/photos/${p.id}/champs`, { show_time: 'on' })).statusCode, 200);
  assert.equal(c.row(p.id).show_time, 1);
  const exp = (await c.security()).slice(before).filter(e => e.type === 'privacy_exposure_changed');
  assert.equal(exp.length, 1);
  assert.equal(exp[0].detail.heure_visible_ajoutees, 1);
  assert.ok(c.audits('POST /admin/photos/:id/champs').some(l => l.detail === 'champs : show_time'));
});

test('fiche v2 : droits — textes seuls, lecture seule, Proposer pour le photographe, hors portée signalé', async t => {
  const c = await site(t);
  const relu = await c.account('relu', { roles: ['relecteur'] });
  const p = c.first(c.seb);
  const r = (await relu.get(`/admin/photos/${p.id}`)).body;
  assert.ok(isV2(r));
  // Le relecteur : le formulaire des textes (POST …/textes), sans série, carte, date, filigrane ni publication.
  assert.match(r, new RegExp(`<form class="form fiche-form" id="fiche-f" method="post" action="/admin/photos/${p.id}/textes" novalidate data-autosave`));
  for (const name of ['category_id', 'author_id', 'city_label', 'taken_on', 'watermark', 'slug']) assert.doesNotMatch(r, new RegExp(`name="${name}"`), name);
  assert.doesNotMatch(r, /dlg-depublier|dlg-publier|dlg-supprimer/);
  assert.match(r, /Enregistrer les textes/);
  // Une série changée en JSON par le relecteur : refusée (plus que du texte).
  assert.equal((await relu.json(`/admin/photos/${p.id}/champs`, { watermark: 'none' })).statusCode, 403);
  assert.equal(c.row(p.id).watermark, null);
  // Le photographe : ses photos, « Proposer… » pour un brouillon, ni Publier ni Dépublier.
  const ph = await c.account('seb-ph', { roles: ['photographe'], author: c.seb });
  const mine = c.first(c.seb);
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(mine.id);
  const h = (await ph.get(`/admin/photos/${mine.id}`)).body;
  assert.match(h, /href="#dlg-proposer" data-ouvre="dlg-proposer"/);
  assert.match(h, /id="dlg-proposer"[^]*?action="\/admin\/photos\/\d+\/proposer"/);
  assert.doesNotMatch(h, /dlg-publier|dlg-depublier/);
  // Celle de Julien : introuvable pour lui, signalée « hors portée », en page comme en JSON.
  const other = c.first(c.jul);
  const before = (await c.security()).length;
  for (const res of [await ph.get(`/admin/photos/${other.id}`), await ph.json(`/admin/photos/${other.id}/champs`, { watermark: 'none' })]) assert.equal(res.statusCode, 404);
  assert.equal(c.row(other.id).watermark, null);
  const fails = (await c.security()).slice(before).filter(e => e.type === 'authz_fail');
  assert.equal(fails.length, 2);
  assert.ok(fails.every(e => e.detail.raison === 'hors portée'));
});

test('fiche v2 : une suggestion n’est jamais enregistrée sans « Enregistrer » (description, mots-clés)', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const p = c.first(c.seb);
  c.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('describe', ?)").run(JSON.stringify({ ...c.app.describer.settings(), on: true }));
  c.db.prepare("INSERT OR REPLACE INTO photo_descriptions (photo_id, text_en, text_fr, created_at) VALUES (?, 'A quiet quay.', 'Un quai tranquille.', datetime('now'))").run(p.id);
  const html = (await adm.get(`/admin/photos/${p.id}`)).body;
  // La suggestion est montrée, le champ reste vide ; « Reprendre ce texte » est un bouton du script, pas un envoi.
  assert.match(html, /<p data-desc-text>« Un quai tranquille\. »<\/p>/);
  assert.match(html, /<textarea id="alt_text"[^>]*><\/textarea>/);
  assert.match(html, /<button class="btn ghost js-seul" type="button" data-desc-use="Un quai tranquille\."/);
  assert.equal(c.row(p.id).alt_text, '');
  // Le script remplit le champ et attend « Enregistrer » (photo-v2.js : suggest()) : rien n'est envoyé au remplissage.
  const js = fs.readFileSync(new URL('../public/admin/v2/photo-v2.js', import.meta.url), 'utf8');
  const fn = js.slice(js.indexOf('function suggest('), js.indexOf('// Une fois le champ enregistré'));
  assert.doesNotMatch(fn.replace(/save\.addEventListener\('click', \(\) => \{ field\._commit\?\.\(\); \}\);/, ''), /post\(|_commit\(|dispatchEvent/);
  assert.match(fn, /temoin\.ko\(field/);
});

test('photothèque v2 : filtres d’état à symbole, « Filtrer » toujours là, raccourcis coupés dans Mon compte (pas au journal, CSRF)', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const html = (await adm.get('/admin/photos')).body;
  assert.match(html, /<nav class="chips" aria-label="Filtrer par état">/);
  assert.match(html, /<a class="chip" href="\/admin\/photos\?statut=published"><span class="chip-st chip-st--abouti"><svg/);
  assert.match(html, /<button class="btn ghost" type="submit">Filtrer<\/button>/);
  assert.doesNotMatch(html, /data-raccourcis="off"/);
  assert.match(html, /<kbd>P<\/kbd>/);
  // L'inspecteur et la barre de sélection : le formulaire des actions groupées de la v1 (POST /admin/photos/actions, jeton).
  assert.match(html, /<form class="bulk" id="bulk" method="post" action="\/admin\/photos\/actions" data-bulk>\s*<input type="hidden" name="_csrf"/);
  assert.match(html, /<button class="btn" type="submit" name="action" value="publish" data-publish>Publier…<\/button>/);
  // Couper les raccourcis d'une touche : sans jeton, refusé ; avec, gardé pour ce compte seulement, pas au journal.
  assert.equal((await adm.post('/admin/compte/raccourcis', { raccourcis: 'off' }, { token: null })).statusCode, 403);
  const off = await adm.post('/admin/compte/raccourcis', { raccourcis: 'off', back: '/admin/compte' });
  assert.deepEqual([off.statusCode, off.headers.location], [303, '/admin/compte']);
  const after = (await adm.get('/admin/photos')).body;
  assert.match(after, /data-raccourcis="off"/);
  assert.doesNotMatch(after, /<kbd>P<\/kbd>/);
  assert.match((await adm.get('/admin/compte')).body, /name="raccourcis" value="on" aria-labelledby="rac-t"/);
  // L'interrupteur, en JSON (au geste) : rallumé.
  const on = await adm.json('/admin/compte/raccourcis', { raccourcis: 'off', action: 'on' });
  assert.deepEqual(JSON.parse(on.body), { ok: true, raccourcis: true });
  assert.doesNotMatch((await adm.get('/admin/photos')).body, /data-raccourcis="off"/);
  assert.equal(c.audits('POST /admin/compte/raccourcis').length, 0);
  // Un autre compte garde les siens.
  const other = await c.account('autre');
  assert.doesNotMatch((await other.get('/admin/photos')).body, /data-raccourcis/);
  // Actions groupées depuis la v2 : publier, puis « Défaire » ; le photographe ne publie pas (permission).
  const ids = [c.first(c.seb).id];
  await adm.json('/admin/photos/actions', { ids, action: 'draft' });
  const r = JSON.parse((await adm.json('/admin/photos/actions', { ids, action: 'publish' })).body);
  assert.equal(c.row(ids[0]).status, 'published');
  await adm.json('/admin/photos/actions', r.undo);
  assert.equal(c.row(ids[0]).status, 'draft');
  const ph = await c.account('seb-ph', { roles: ['photographe'], author: c.seb });
  assert.equal((await ph.json('/admin/photos/actions', { ids, action: 'publish' })).statusCode, 403);
  const p = (await ph.get('/admin/photos')).body;
  assert.ok(isV2(p));
  assert.doesNotMatch(p, /data-publish/);
  assert.match(p, /data-propose>Proposer à la publication/);
});

test('À valider v2 : liste, titre provisoire, renvoyer et programmer depuis la page ; droits', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const ph = await c.account('seb-ph', { roles: ['photographe'], author: c.seb });
  const [a, b] = c.db.prepare("SELECT * FROM photos WHERE author_id = ? AND status = 'published' ORDER BY id LIMIT 2").all(c.seb);
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id IN (?, ?)").run(a.id, b.id);
  c.db.prepare('UPDATE photos SET source_name = ?, title = ? WHERE id = ?').run('R0004012.JPG', titleFromFilename('R0004012.JPG'), b.id);
  for (const id of [a.id, b.id]) assert.equal((await ph.post(`/admin/photos/${id}/proposer`, { message: 'Pour Rue' })).statusCode, 303);
  const html = (await adm.get('/admin/a-valider')).body;
  assert.ok(isV2(html));
  assert.match(html, /<form method="post" action="\/admin\/a-valider" id="valider-f"/);
  assert.match(html, new RegExp(`<tr data-photo="${b.id}" data-provisoire[^]*?Titre provisoire \\(nom du fichier\\)`));
  assert.match(html, new RegExp(`id="dlg-renvoyer-${a.id}"[^]*?action="/admin/photos/${a.id}/renvoyer" novalidate>\\s*<input type="hidden" name="_csrf" value="[^"]+"><input type="hidden" name="back" value="/admin/a-valider">`));
  // Renvoyer depuis la page : retour à « À valider ».
  const back = await adm.post(`/admin/photos/${b.id}/renvoyer`, { message: 'Un vrai titre, s’il vous plaît.', back: '/admin/a-valider' });
  assert.deepEqual([back.statusCode, back.headers.location], [303, '/admin/a-valider']);
  assert.equal(c.row(b.id).review, 'a_reprendre');
  // Programmer la photo cochée, puis annuler la programmation depuis la page.
  const when = new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 16);
  assert.equal((await adm.post('/admin/a-valider', { ids: String(a.id), quand: 'date', date: when })).statusCode, 303);
  assert.equal(c.row(a.id).review, 'programmee');
  const sched = (await adm.get('/admin/a-valider')).body;
  assert.match(sched, new RegExp(`action="/admin/photos/${a.id}/deprogrammer"><input type="hidden" name="_csrf" value="[^"]+"><input type="hidden" name="back" value="/admin/a-valider">`));
  const un = await adm.post(`/admin/photos/${a.id}/deprogrammer`, { back: '/admin/a-valider' });
  assert.deepEqual([un.statusCode, un.headers.location], [303, '/admin/a-valider']);
  // Sans jeton : refusé. Le photographe n'ouvre pas la page (403).
  assert.equal((await adm.post('/admin/a-valider', { ids: String(a.id) }, { token: null })).statusCode, 403);
  assert.equal((await ph.get('/admin/a-valider')).statusCode, 403);
});

test('Vigie sur les trois écrans v2 : entrée « Sécurité » et son badge, bandeau critique', async t => {
  const c = await site(t, { vigieOptions: { send: async () => {}, timers: false, pollDecisions: false } });
  const p = JSON.stringify({ usage: 'resume', emis_a: Date.now(), ouvertes: { critique: 1, haut: 0, moyen: 0, bas: 0 }, plus_grave: { id: 7, gravite: 'critique', depuis: Date.now() - 60e3 }, critique_a_prendre: true });
  c.app.decisions.acceptSummary({ payload: p, signature: crypto.sign(null, Buffer.from(p), VIGIE_KEYS.privateKey).toString('base64') });
  const adm = await c.account('adm');
  for (const url of [`/admin/photos/${c.first(c.seb).id}`, '/admin/photos', '/admin/a-valider']) {
    const html = (await adm.get(url)).body;
    assert.ok(isV2(html), url);
    assert.match(html, /<a class="nav-sec" href="[^"]+" target="_blank" rel="noopener noreferrer">[^]*?Sécurité<span class="sr-only"> \(nouvel onglet\)<\/span>[^]*?<span class="nav-badge/, url);
    assert.match(html, /<div class="sec-bandeau" role="alert">/, url);
  }
});
