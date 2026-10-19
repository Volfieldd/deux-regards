import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Admin v2 (maquettes MQ-07 à MQ-10), à côté de la v1 : le choix est celui de chaque compte (« Admin : v1 / v2 »), gardé
// dans account_prefs (migration 057, la table accounts ne change pas) ; un écran sans gabarit v2 s'affiche en v1, entier ;
// la v1 ne change que par le lien du choix ; la v2 reprend la Vigie de la v1 (entrée, badge, ligne, bandeau) et ses
// contrôles (permissions, portée « les miennes », CSRF, journal, no-store).
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const signed = payload => { const p = JSON.stringify({ usage: 'resume', emis_a: Date.now(), ...payload }); return { payload: p, signature: crypto.sign(null, Buffer.from(p), VIGIE_KEYS.privateKey).toString('base64') }; };
const MV10 = { ouvertes: { critique: 2, haut: 1, moyen: 1, bas: 0 }, plus_grave: { id: 413, gravite: 'critique', depuis: Date.now() - 60e3 }, critique_a_prendre: true };
const side = html => { const i = html.indexOf('<aside class="side"'); return html.slice(i, html.indexOf('</aside>', i)); };
const entry = html => (/<a class="nav-sec"[\s\S]*?<\/a>/.exec(html) || [''])[0];
const isV2 = html => html.includes('/static/admin/v2/v2.css');

// Un compte et sa session : rôles, photographe lié (portée « les miennes »).
function account(ctx, { sub, name = sub, roles = ['admin'], author = null }) {
  ctx.app.accounts.ensure({ sub, name, roles });
  if (author) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId: author }, 'test');
  const token = createSessionStore(ctx.db).create({ sub, name, roles: [] });
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
  const cookies = { session: token };
  // Les pages de la v2 ont leurs espaces insécables (server/typo-html.js) : lues ici avec des espaces ordinaires.
  const plain = r => Object.defineProperty(r, 'body', { value: r.body.replace(/[\u202f\u00a0]/g, ' ') });
  const get = async url => plain(await ctx.app.inject({ url, cookies, headers: { accept: 'text/html' } }));
  const post = async (url, payload = {}, { token: tok = csrf, accept = 'text/html' } = {}) => plain(await ctx.app.inject({ method: 'POST', url, cookies, headers: { accept }, payload: { ...payload, ...(tok ? { _csrf: tok } : {}) } }));
  const json = (url, payload) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload });
  const version = async v => { const r = await post('/admin/version', { version: v, back: '/admin' }); assert.equal(r.statusCode, 303); await get('/admin/aide'); return r; };
  return { sub, csrf, cookies, get, post, json, version };
}
async function site(t, opts = {}) {
  const ctx = await setup(t, { seeded: true, ...opts });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  return { ...ctx, seb, jul };
}

test('migration 057 : une table à part pour les préférences ; la table accounts et ses déclencheurs ne changent pas', async t => {
  const c = await site(t);
  const accounts = c.db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = 'accounts' ORDER BY name").pluck().all().join(';');
  assert.doesNotMatch(accounts, /admin_version|account_prefs/);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'account_prefs'").pluck().get(), 0);
  assert.match(c.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'account_prefs'").pluck().get(), /REFERENCES accounts\(id\) ON DELETE CASCADE/);
  // Les colonnes de accounts sont celles d'avant la migration (rien d'ajouté).
  assert.deepEqual(c.db.prepare('PRAGMA table_info(accounts)').all().map(x => x.name).filter(n => /version|pref/.test(n)), []);
});

test('choix par compte : un compte en v2 et un autre en v1 en même temps ; retour en v1 d’un clic ; CSRF ; pas au journal', async t => {
  const c = await site(t);
  const a = account(c, { sub: 'compte-a' }), b = account(c, { sub: 'compte-b' });
  await a.get('/admin'); await b.get('/admin');                                   // fenêtre « Nouveautés » vue
  // v1 par défaut : le lien « Essayer l'admin v2 », dans le pied du menu, au-dessus du compte.
  const v1 = (await a.get('/admin')).body;
  assert.ok(!isV2(v1));
  assert.match(side(v1), /<form class="ver-choix" method="post" action="\/admin\/version"><input type="hidden" name="_csrf" value="[^"]+"><input type="hidden" name="back" value="\/admin"><input type="hidden" name="version" value="v2"><button type="submit">Essayer l’admin v2<\/button><\/form>/);
  // Sans jeton : refusé, rien ne change.
  assert.equal((await a.post('/admin/version', { version: 'v2' }, { token: null })).statusCode, 403);
  assert.ok(!isV2((await a.get('/admin')).body));
  // Version inconnue : refusée, rien ne change.
  const bad = await a.post('/admin/version', { version: 'v3', back: '/admin' });
  assert.equal(bad.statusCode, 303);
  assert.ok(!isV2((await a.get('/admin')).body));
  // A passe en v2 ; B reste en v1.
  const r = await a.post('/admin/version', { version: 'v2', back: '/admin/photos' });
  assert.deepEqual([r.statusCode, r.headers.location], [303, '/admin/photos']);
  const homeA = (await a.get('/admin')).body, homeB = (await b.get('/admin')).body;
  assert.ok(isV2(homeA), 'A en v2');
  assert.ok(!isV2(homeB), 'B toujours en v1');
  assert.equal(c.db.prepare("SELECT value FROM account_prefs p JOIN accounts a ON a.id = p.account_id WHERE a.sub = 'compte-a' AND key = 'admin_version'").pluck().get(), 'v2');
  // En v2, « Revenir à l'admin v1 » est un formulaire d'un clic au pied du menu.
  assert.match(side(homeA), /<form class="ver-choix" method="post" action="\/admin\/version">[^]*?name="version" value="v1"><button type="submit"><svg[^>]*>[^]*?<\/svg>Revenir à l’admin v1<\/button><\/form>/);
  await a.version('v1');
  assert.ok(!isV2((await a.get('/admin')).body));
  // Préférence, comme la langue et le thème : pas de ligne au journal d'audit.
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM audit_log WHERE action = 'POST /admin/version'").pluck().get(), 0);
  // Le compte supprimé emporte ses préférences.
  const id = c.app.accounts.bySub('compte-a').id;
  c.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM account_prefs WHERE account_id = ?').pluck().get(id), 0);
});

test('repli : un écran sans gabarit v2 s’affiche en v1, entier, identique à l’octet hors du lien du choix', async t => {
  const c = await site(t);
  const a = account(c, { sub: 'compte-a' });
  await a.get('/admin');
  const strip = html => html.replace(/\s*<form class="ver-choix"[\s\S]*?<\/form>/, '');
  for (const url of ['/admin/signalements', '/admin/statistiques', '/admin/journal', '/admin/aide', '/admin/apparence', '/admin/site', '/admin/terrain', '/admin/carnet', '/admin/galeries']) {
    await a.version('v1');
    const v1 = (await a.get(url)).body;
    await a.version('v2');
    const res = await a.get(url);
    assert.equal(res.statusCode, 200, url);
    assert.ok(!isV2(res.body), `${url} : pas de gabarit v2, donc la v1`);
    assert.match(res.body, /<span class="ver-note">Écran pas encore en v2\.<\/span> <button type="submit">Revenir à l’admin v1<\/button>/, url);
    assert.equal(strip(res.body), strip(v1), `${url} : la v1 à l’octet près`);
  }
  // Les écrans de la v2 de ce lot.
  for (const url of ['/admin', '/admin/droits', '/admin/images', '/admin/auteurs', '/admin/reglages/assistants', '/admin/compte', '/admin/photos/lot?ids=1,2', '/admin/photos', '/admin/photos/1', '/admin/a-valider']) {
    const res = await a.get(url);
    assert.equal(res.statusCode, 200, url);
    assert.ok(isV2(res.body), `${url} en v2`);
  }
  // Le gabarit de la v1 pour un compte en v1, sur tous ces écrans : sa mise en page (repères propres à
  // views/admin/layout.eta, absents de la v2), son script et sa feuille, rien de la v2, et le seul bloc du choix en plus.
  const layout = f => fs.readFileSync(new URL(`../views/admin/${f}`, import.meta.url), 'utf8');
  const marks = ['<button class="cmdk"', '<p class="grp" id="nav-work">', '<span class="nav-ver mono">'];
  for (const m of marks) {
    assert.ok(layout('layout.eta').includes(m), `repère de la mise en page v1 introuvable : ${m}`);
    assert.ok(!layout('v2/layout.eta').includes(m), `repère partagé avec la mise en page v2 : ${m}`);
  }
  await a.version('v1');
  for (const url of ['/admin/series', '/admin/journal', '/admin', '/admin/droits', '/admin/photos', '/admin/photos/1', '/admin/a-valider']) {
    const res = await a.get(url);
    assert.equal(res.statusCode, 200, url);
    for (const m of marks) assert.ok(res.body.includes(m), `${url} : mise en page v1 (${m})`);
    assert.match(res.body, /<link rel="stylesheet" href="\/static\/admin\/admin\.css[?"]/, `${url} : feuille de la v1`);
    assert.match(res.body, /<script src="\/static\/admin\/admin\.js[?"]/, `${url} : script de la v1`);
    assert.doesNotMatch(res.body, /\/static\/admin\/v2\//, `${url} : aucune feuille ni aucun script de la v2`);
    // Le bloc du choix : une fois, « Essayer l'admin v2 » ; hors de lui, rien ne mène à la v2.
    const choix = res.body.match(/<form class="ver-choix"[\s\S]*?<\/form>/g) || [];
    assert.equal(choix.length, 1, `${url} : un seul bloc du choix`);
    assert.match(choix[0], /name="version" value="v2"><button type="submit">Essayer l’admin v2<\/button>/, url);
    assert.doesNotMatch(res.body.replace(choix[0], ''), /action="\/admin\/version"|class="ver-/, `${url} : rien d'autre du choix`);
  }
});

test('v2 : no-store, permissions de chaque écran, menu sans page interdite (rôle Photographe), Mon compte', async t => {
  const c = await site(t);
  const adm = account(c, { sub: 'adm' });
  await adm.version('v2');
  for (const url of ['/admin', '/admin/droits', '/admin/reglages/assistants', '/admin/compte', '/admin/photos/lot?ids=1']) assert.equal((await adm.get(url)).headers['cache-control'], 'no-store', url);
  // Le menu de l'administrateur : quatre groupes, Carnets et Galeries privées gardés, Réglages au pied.
  const s = side((await adm.get('/admin')).body);
  for (const [label, href] of [['Photothèque', '/admin/photos'], ['Séries', '/admin/series'], ['Personnes', '/admin/personnes'], ['Signalements', '/admin/signalements'], ['App de terrain', '/admin/terrain'],
    ['À valider', '/admin/a-valider'], ['Site public', '/admin/site'], ['Carnets', '/admin/carnet'], ['Galeries privées', '/admin/galeries'], ['Comptes et rôles', '/admin/comptes'], ['Journal', '/admin/journal'], ['Réglages', '/admin/apparence']]) {
    assert.match(s, new RegExp(`<a href="${href.replace(/[/]/g, '\\/')}"[^>]*>(?:<svg[^]*?</svg>)?${label}`), label);
  }
  for (const g of ['Photos', 'Personnes', 'Publier', 'Équipe']) assert.match(s, new RegExp(`<p class="grp" id="[^"]+">${g}</p>`));
  // Photographe lié à Sébastien, en v2 : pas de lien vers une page interdite ; « Séries » est un intitulé qui se déplie ;
  // « Mes propositions » ; ni Réglages, ni Signalements, ni Comptes.
  const ph = account(c, { sub: 'seb-ph', name: 'Sébastien', roles: ['photographe'], author: c.seb });
  await ph.version('v2');
  const p = side((await ph.get('/admin')).body);
  assert.match(p, /<details class="ser-titre"><summary>/);
  assert.match(p, /href="\/admin\/photos\?manque=proposees">[^]*?Mes propositions/);
  for (const href of ['/admin/series"', '/admin/signalements', '/admin/comptes', '/admin/apparence', '/admin/droits', '/admin/reglages/assistants', '/admin/a-valider', '/admin/journal']) assert.ok(!p.includes(`href="${href}`), href);
  for (const url of ['/admin/reglages/assistants', '/admin/droits', '/admin/auteurs', '/admin/images']) assert.equal((await ph.get(url)).statusCode, 403, url);
  // Mon compte : en v2, la page ; en v1, les mêmes réglages sont sur « Aujourd'hui ».
  assert.match((await ph.get('/admin/compte')).body, /<h1>Mon compte<\/h1>[^]*name="version" value="v2" checked/);
  await ph.version('v1');
  const back = await ph.get('/admin/compte');
  assert.deepEqual([back.statusCode, back.headers.location], [303, '/admin#compte']);
});

test('Vigie en v2 : même entrée et badge, ligne d’« Aujourd’hui », bandeau sur les pages v2 et en repli ; rien sans securite.voir', async t => {
  const c = await site(t, { env: VIGIE, vigieOptions: { send: async () => {}, timers: false, pollDecisions: false } });
  c.app.decisions.acceptSummary(signed({ ...MV10, console: 'https://piege.example' }));
  const adm = account(c, { sub: 'adm', author: c.jul });                         // langue gardée sur le photographe lié
  await adm.version('v2');
  const home = (await adm.get('/admin')).body;
  assert.ok(isV2(home));
  const e = entry(side(home));
  assert.match(e, /^<a class="nav-sec" href="https:\/\/vigie\.nicephos\.art\/" target="_blank" rel="noopener noreferrer">/);
  assert.match(e, />Sécurité<span class="sr-only"> \(nouvel onglet\)<\/span>/);
  assert.match(e, /<span class="nav-badge attention"><span aria-hidden="true">▲ 3<\/span><span class="sr-only">, 3 alertes hautes ou critiques ouvertes<\/span>/);
  assert.match(side(home), /href="\/admin\/journal"[^]*class="nav-sec"/, 'après « Journal »');
  assert.doesNotMatch(home, /piege\.example/);
  // Bandeau : le même que la v1.
  assert.match(home, /<div class="sec-bandeau" role="alert"><svg[^>]*>[^]*?<\/svg><p><span class="t">2 alertes critiques dans la Vigie · la dernière ouverte (?:le [^<]+? )?à \d{1,2} h \d{2}<\/span><span class="sec">Une au moins attend sa prise en charge ; ce bandeau reste tant qu’une critique attend\.<\/span><\/p><a class="btn ghost" href="https:\/\/vigie\.nicephos\.art\/alertes\/413" target="_blank" rel="noopener noreferrer">Ouvrir l’alerte #413<span class="sr-only"> \(nouvel onglet\)<\/span>/);
  // Ligne urgente en tête d'« À faire », vers l'alerte dans un nouvel onglet ; comptée dans le badge des urgences.
  const list = home.slice(home.indexOf('<ul class="taches">'), home.indexOf('</ul>', home.indexOf('<ul class="taches">')));
  assert.match(list, /^<ul class="taches">\s*<li class="tache tache--urgent">[^]*?<span class="tt-t">Sécurité : 2 alertes critiques, 1 haute et 1 moyenne dans la Vigie<\/span><span class="q">urgent · la dernière critique ouverte [^<]*; une au moins n’est pas prise en charge<\/span><\/span>\s*<a class="btn ghost" href="https:\/\/vigie\.nicephos\.art\/alertes\/413" target="_blank" rel="noopener noreferrer">Ouvrir l’alerte #413<span class="sr-only"> \(nouvel onglet\)<\/span>/);
  assert.match(side(home), /<span class="nav-badge urgent"><span aria-hidden="true">✕ 1<\/span>/);
  for (const frag of [e, /<div class="sec-bandeau"[\s\S]*?<\/div>/.exec(home)[0]]) assert.doesNotMatch(frag, /style=/);
  // Le bandeau sur les autres pages de la v2, et sur un écran resté en v1.
  for (const url of ['/admin/droits', '/admin/reglages/assistants', '/admin/compte', '/admin/photos/lot?ids=1', '/admin/journal']) assert.match((await adm.get(url)).body, /class="sec-bandeau"/, url);
  // Allemand.
  await adm.post('/admin/langue', { lang: 'de', back: '/admin' });
  const de = (await adm.get('/admin')).body;
  assert.match(entry(de), />Sicherheit<span class="sr-only"> \(neuer Tab\)<\/span>/);
  assert.match(de, /Sicherheit: 2 kritische Sicherheitswarnungen, 1 hohe und 1 mittlere in der Vigie/);
  // Sans securite.voir (modérateur en v2) : aucune trace.
  const mod = account(c, { sub: 'mod', roles: ['moderateur'] });
  await mod.version('v2');
  const m = (await mod.get('/admin')).body;
  assert.ok(isV2(m));
  assert.doesNotMatch(m, /nav-sec|sec-bandeau|alertes\/413|vigie\.nicephos/);
});

test('lot v2 : traductions, suggestion acceptée sans script, « Appliquer » et « Défaire », champs au journal ; CSRF ; portée', async t => {
  const c = await site(t);
  const adm = account(c, { sub: 'adm' });
  await adm.version('v2');
  const [p1, p2] = c.db.prepare('SELECT * FROM photos WHERE author_id = ? ORDER BY id LIMIT 2').all(c.seb);
  const page = (await adm.get(`/admin/photos/lot?ids=${p1.id},${p2.id}`)).body;
  assert.match(page, /<h1>Compléter et publier<\/h1>/);
  assert.match(page, new RegExp(`<th scope="row" class="c-thumb" id="p${p1.id}">`));
  assert.match(page, new RegExp(`name="title_en_${p1.id}"[^>]*data-champ="title_en"`));
  assert.match(page, /<button class="btn" type="submit" form="lot-f" name="publish" value="1">Publier les 2 photos<\/button>/);
  // Sans script : le tableau entier, titres anglais et allemand compris ; le journal note les noms des champs.
  const cat = c.db.prepare('SELECT id FROM categories WHERE id != ? ORDER BY id LIMIT 1').pluck().get(p1.category_id);
  const r = await adm.post('/admin/photos/lot', { ids: `${p1.id},${p2.id}`, [`title_${p1.id}`]: p1.title, [`title_en_${p1.id}`]: 'Mist', [`title_de_${p1.id}`]: 'Nebel', [`accept_suggestion_${p1.id}`]: String(cat) });
  assert.equal(r.statusCode, 303);
  const after = c.db.prepare('SELECT * FROM photos WHERE id = ?').get(p1.id);
  assert.deepEqual([after.title_en, after.title_de, after.category_id], ['Mist', 'Nebel', cat]);
  assert.match(c.db.prepare("SELECT detail FROM audit_log WHERE action = 'POST /admin/photos/lot' ORDER BY id DESC LIMIT 1").pluck().get(), /^champs : photo \d+ : [^;]*title_en[^;]*title_de/);
  // « Appliquer » aux cochées (JSON), puis « Défaire ».
  const before2 = c.db.prepare('SELECT place, category_id FROM photos WHERE id = ?').get(p2.id);
  const ap = await adm.json('/admin/photos/actions', { ids: [p2.id], action: 'appliquer', category_id: '', place: 'Quai Ligny', taken_on: '', city_label: '' });
  assert.equal(ap.statusCode, 200);
  assert.equal(c.db.prepare('SELECT place FROM photos WHERE id = ?').pluck().get(p2.id), 'Quai Ligny');
  assert.equal(ap.json().photos[0].place, 'Quai Ligny');
  const undo = await adm.json('/admin/photos/actions', ap.json().undo);
  assert.equal(undo.statusCode, 200);
  assert.deepEqual(c.db.prepare('SELECT place, category_id FROM photos WHERE id = ?').get(p2.id), before2);
  // Rien à appliquer : refusé ; sans jeton : 403.
  assert.equal((await adm.json('/admin/photos/actions', { ids: [p2.id], action: 'appliquer' })).statusCode, 422);
  assert.equal((await adm.post('/admin/photos/actions', { ids: [p2.id], action: 'appliquer', place: 'X' }, { token: null })).statusCode, 403);
  assert.equal((await adm.post('/admin/photos/lot', { ids: String(p1.id), [`title_${p1.id}`]: 'Pirate' }, { token: null })).statusCode, 403);
  assert.notEqual(c.db.prepare('SELECT title FROM photos WHERE id = ?').pluck().get(p1.id), 'Pirate');
  // Portée « les miennes » : le photographe de Sébastien ne voit ni ne change une photo de Julien.
  const other = c.db.prepare('SELECT * FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').get(c.jul);
  const ph = account(c, { sub: 'seb-ph', name: 'Sébastien', roles: ['photographe'], author: c.seb });
  await ph.version('v2');
  const lot = await ph.get(`/admin/photos/lot?ids=${other.id}`);
  assert.equal(lot.statusCode, 303, 'aucune photo visible : retour à la photothèque');
  await ph.post('/admin/photos/lot', { ids: String(other.id), [`title_${other.id}`]: 'Pas à moi' });
  assert.equal(c.db.prepare('SELECT title FROM photos WHERE id = ?').pluck().get(other.id), other.title);
  await ph.json('/admin/photos/actions', { ids: [other.id], action: 'appliquer', place: 'Ailleurs' });
  assert.equal(c.db.prepare('SELECT place FROM photos WHERE id = ?').pluck().get(other.id), other.place);
});

test('lot v2 : « Proposer » montre d’abord ce qui reste à revoir, se corrige dans le dialogue, puis propose ; la v1 ne change pas', async t => {
  const c = await site(t);
  const ph = account(c, { sub: 'seb-ph', name: 'Sébastien', roles: ['photographe'], author: c.seb });
  await ph.version('v2');
  const p = c.db.prepare("SELECT * FROM photos WHERE author_id = ? ORDER BY id LIMIT 1").get(c.seb);
  // Un brouillon au titre provisoire (le nom du fichier).
  c.db.prepare("UPDATE photos SET status = 'draft', source_name = 'R0004057.JPG', title = 'R0004057' WHERE id = ?").run(p.id);
  const page = (await ph.get(`/admin/photos/lot?ids=${p.id}`)).body;
  assert.match(page, /<h1>Compléter et proposer<\/h1>/);
  assert.match(page, /name="proposer" value="1">Proposer la photo</);
  assert.match(page, new RegExp(`id="prov-${p.id}" data-provisoire>`));
  const first = await ph.post('/admin/photos/lot', { ids: String(p.id), proposer: '1', [`title_${p.id}`]: 'R0004057' });
  assert.equal(first.statusCode, 200);
  assert.match(first.body, /<dialog class="confirm lot-dlg" open data-modal aria-labelledby="dlg-t"/);
  assert.match(first.body, /Proposer la photo à (?:la modération|[^?]+) \?/);
  assert.match(first.body, new RegExp(`name="title_${p.id}" value="R0004057"`));
  assert.equal(c.db.prepare('SELECT review FROM photos WHERE id = ?').pluck().get(p.id), null, 'rien n’est proposé avant le dialogue');
  // Corrigé dans le dialogue, puis proposé.
  const sent = await ph.post('/admin/photos/lot', { ids: String(p.id), proposer: '1', forcer: '1', [`title_${p.id}`]: 'Réverbères, quai Ligny', message: 'Bonsoir' });
  assert.deepEqual([sent.statusCode, sent.headers.location], [303, '/admin/photos?manque=proposees']);
  assert.deepEqual(c.db.prepare('SELECT title, review FROM photos WHERE id = ?').get(p.id), { title: 'Réverbères, quai Ligny', review: 'proposee' });
  // Une date refusée dans le dialogue le rouvre (422), avec l'erreur sous le champ.
  const q = c.db.prepare('SELECT * FROM photos WHERE author_id = ? ORDER BY id LIMIT 1 OFFSET 1').get(c.seb);
  c.db.prepare("UPDATE photos SET status = 'draft', review = NULL WHERE id = ?").run(q.id);
  const wrong = await ph.post('/admin/photos/lot', { ids: String(q.id), proposer: '1', forcer: '1', [`taken_on_${q.id}`]: '14/15/2026' });
  assert.equal(wrong.statusCode, 422);
  assert.match(wrong.body, new RegExp(`id="dlg-date-${q.id}" name="taken_on_${q.id}" value="14/15/2026"[^>]*aria-invalid="true"`));
  // « Proposer sans corriger » : les corrections du dialogue ne sont pas reprises, la photo part.
  const anyway = await ph.post('/admin/photos/lot', { ids: String(q.id), proposer: '1', forcer: '1', sans_corriger: '1', [`taken_on_${q.id}`]: '14/15/2026' });
  assert.equal(anyway.statusCode, 303);
  assert.equal(c.db.prepare('SELECT review FROM photos WHERE id = ?').pluck().get(q.id), 'proposee');
  // Publier sans droit : 403.
  assert.equal((await ph.post('/admin/photos/lot', { ids: String(q.id), publish: '1' })).statusCode, 403);
  // La v1 garde sa règle : publier part sans dialogue.
  const adm = account(c, { sub: 'adm' });
  const r = c.db.prepare('SELECT * FROM photos WHERE author_id = ? ORDER BY id LIMIT 1 OFFSET 2').get(c.seb);
  c.db.prepare("UPDATE photos SET status = 'draft', source_name = 'X1.JPG', title = 'X1' WHERE id = ?").run(r.id);
  const v1 = await adm.post('/admin/photos/lot', { ids: String(r.id), publish: '1', [`title_${r.id}`]: 'X1' });
  assert.equal(v1.statusCode, 303);
  assert.equal(c.db.prepare('SELECT status FROM photos WHERE id = ?').pluck().get(r.id), 'published');
});

test('Réglages v2 : assistants (interrupteurs en JSON, ou formulaire sans script), mentions qui disent ce qui manque', async t => {
  const c = await site(t);
  const adm = account(c, { sub: 'adm' });
  // En v1, l'adresse des assistants mène à la page Séries.
  const v1 = await adm.get('/admin/reglages/assistants');
  assert.deepEqual([v1.statusCode, v1.headers.location], [303, '/admin/series#propositions']);
  await adm.version('v2');
  const page = (await adm.get('/admin/reglages/assistants')).body;
  assert.match(page, /<nav class="onglets" aria-label="Rubriques des réglages"><ul>[^]*?<a href="\/admin\/reglages\/assistants" aria-current="page">Assistants d’analyse<\/a>/);
  assert.match(page, /<input type="checkbox" role="switch" name="action" value="on" aria-labelledby="a1-t"/);
  // Avec le script : un geste, une réponse JSON.
  const on = await adm.json('/admin/series/propositions', { action: 'on', back: '/admin/reglages/assistants' });
  assert.equal(on.statusCode, 200);
  assert.equal(c.app.seriesSuggest.enabled(), true);
  // Sans script : la case décochée n'envoie que le champ caché « off ».
  const off = await adm.post('/admin/series/propositions', { action: 'off', back: '/admin/reglages/assistants' });
  assert.deepEqual([off.statusCode, off.headers.location], [303, '/admin/reglages/assistants']);
  assert.equal(c.app.seriesSuggest.enabled(), false);
  // Case cochée : « off » puis « on » ; la dernière décide.
  await c.app.inject({ method: 'POST', url: '/admin/series/propositions', cookies: adm.cookies, headers: { accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' }, payload: `_csrf=${encodeURIComponent(adm.csrf)}&action=off&action=on&back=%2Fadmin%2Freglages%2Fassistants` });
  assert.equal(c.app.seriesSuggest.enabled(), true);
  // Mentions : ce qui manque, en tête (un lien par rubrique) et sous le champ ; le même formulaire que la v1.
  const ml = (await adm.get('/admin/droits')).body;
  assert.match(ml, /<section class="resume-a" tabindex="-1" aria-labelledby="res-t" data-resume><h2 id="res-t">[^]*?Mentions incomplètes : \d rubriques? à remplir/);
  assert.match(ml, /<a href="#ml-dir">Directeur de la publication<\/a>/);
  assert.match(ml, /id="ml-dir" name="legal_director" value="" maxlength="120" aria-invalid="true" aria-describedby="ml-dir-a ml-dir-e"/);
  assert.match(ml, /<form class="form" action="\/admin\/reglages" method="post" data-garde aria-labelledby="mentions">[^]*?name="part" value="droits"/);
  const saved = await adm.post('/admin/reglages', { part: 'droits', legal_names: 'A et B', legal_address: '1 rue X', legal_email: 'a@example.org', legal_phone: '+33 1', legal_director: 'A', legal_host: 'editeurs' });
  assert.equal(saved.statusCode, 303);
  assert.doesNotMatch((await adm.get('/admin/droits')).body, /Mentions incomplètes/);
});

test('app de terrain v2 : titre, session lisible, langue sans drapeau ; la signature revient après un refus (v2 seulement)', async t => {
  const c = await site(t);
  const adm = account(c, { sub: 'adm', author: c.jul });
  await adm.version('v2');
  const page = (await adm.get('/admin/rencontre')).body;
  assert.match(page, /<h1>Nouvelle rencontre<\/h1>/);
  assert.match(page, /<a class="skip" href="#contenu">Aller au formulaire<\/a>/);
  assert.match(page, /<p class="app-session">[^]*connecté jusqu’à \d{1,2} h \d{2}/);
  assert.match(page, /<label lang="en"><input type="radio" name="lang" value="en" data-lang-pick>English<\/label>/);
  assert.doesNotMatch(page, /flags\//);
  assert.equal((await adm.get('/admin/rencontre')).headers['cache-control'], 'no-store');
  // Un accord sans âge : refusé, la signature revient (vérifiée), les erreurs dans la langue de la personne.
  const png = (await import('sharp')).default;
  const sig = `data:image/png;base64,${(await png({ create: { width: 20, height: 10, channels: 3, background: '#fff' } }).png().toBuffer()).toString('base64')}`;
  const boundary = '----x';
  const parts = { _csrf: adm.csrf, author_id: String(c.jul), lang: 'en', decision: 'accord', scope_site: 'on', name: 'Inês', signature: sig };
  const body = Object.entries(parts).map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`).join('') + `--${boundary}--\r\n`;
  const res = await c.app.inject({ method: 'POST', url: '/admin/rencontre', cookies: adm.cookies, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'text/html' }, payload: body });
  res.body = res.body.replace(/[\u202f\u00a0]/g, ' ');
  assert.equal(res.statusCode, 422);
  assert.match(res.body, new RegExp(`name="signature" value="${sig.replace(/[+/]/g, m => `\\${m}`)}" data-sign-value`));
  assert.match(res.body, /<section class="resume" tabindex="-1" aria-labelledby="res-p" data-resume>/);
  assert.match(res.body, /<span data-l="en" lang="en">Age<\/span>/);
  assert.match(res.body, /data-lang="en"/);
  // En v1, l'écran d'origine (signature à refaire).
  await adm.version('v1');
  const res1 = await c.app.inject({ method: 'POST', url: '/admin/rencontre', cookies: adm.cookies, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'text/html' }, payload: body });
  assert.equal(res1.statusCode, 422);
  assert.doesNotMatch(res1.body, /data-sign-value value="data:/);
  assert.match(res1.body, /Faites signer de nouveau la personne/);
});

// Vérification d'identité demandée par la Vigie (décision verifier_identite) : le bandeau de la v2 (gabarit et app de
// terrain), à la seule personne visée dont la session est plus ancienne que la décision ; écritures de la v2 arrêtées.
test('vérification d’identité en v2 : bandeau (gabarit, app de terrain et son accueil) au compte visé, session ancienne ; écritures arrêtées ; choix v1 / v2 permis', async t => {
  const c = await site(t, { env: VIGIE, vigieOptions: { send: async () => {}, timers: false, pollDecisions: false } });
  const verifs = list => { const p = JSON.stringify({ usage: 'site', version: Date.now(), emis_a: Date.now(), blocages: [], sessions: [], comptes: [], gels: [], verrouillage: null, verifications: list }); return { payload: p, signature: crypto.sign(null, Buffer.from(p), VIGIE_KEYS.privateKey).toString('base64') }; };
  const adm = account(c, { sub: 'adm', author: c.seb }), autre = account(c, { sub: 'autre', author: c.jul });
  await adm.version('v2'); await autre.version('v2');
  const PAGES = ['/admin', '/admin/compte', '/admin/rencontre', '/admin/rencontre/accueil'];
  const banner = html => /<div class="sec-bandeau identite" role="status">[^]*?<\/div>|<div class="msg msg-identite" role="status">[^]*?<\/div><\/div>/.exec(html)?.[0] || null;
  // Sans décision : rien.
  for (const url of PAGES) assert.equal(banner((await adm.get(url)).body), null, url);
  c.app.decisions.accept(verifs([{ sub: 'adm', depuis: Date.now() - 1000, fin: Date.now() + 864e5 }]));
  // Gabarit de la v2 : le bandeau de la v1 (mêmes classes, role="status"), sans style en ligne ni script, retour à la page.
  const home = (await adm.get('/admin')).body;
  assert.ok(isV2(home));
  assert.match(banner(home), /^<div class="sec-bandeau identite" role="status"><svg class="ic"[^>]*aria-hidden="true"[^>]*>[^]*?<\/svg><p><span class="t">Par sécurité, confirmez votre identité avant de modifier quoi que ce soit\.<\/span><span class="sec">Une nouvelle connexion est demandée pour ce compte[^<]*<\/span><\/p><a class="btn" href="\/auth\/verifier\?next=%2Fadmin">Confirmer mon identité<\/a><\/div>$/);
  assert.match(banner((await adm.get('/admin/compte')).body), /href="\/auth\/verifier\?next=%2Fadmin%2Fcompte"/);
  // App de terrain (formulaire et accueil) : avant de tendre le téléphone.
  const app = (await adm.get('/admin/rencontre')).body;
  assert.match(app, /\/static\/admin\/v2\/app-v2\.css/);
  assert.match(banner(app), /^<div class="msg msg-identite" role="status"><svg class="ic"[^>]*aria-hidden="true"[^>]*>[^]*?<\/svg><div><p><b>Par sécurité, confirmez votre identité avant de modifier quoi que ce soit\.<\/b> [^<]+<\/p><a class="btn-app" href="\/auth\/verifier\?next=%2Fadmin%2Frencontre">Confirmer mon identité<\/a><\/div><\/div>$/);
  assert.ok(app.indexOf('msg-identite') < app.indexOf('<form class="app-form"'), 'avant le formulaire');
  assert.match(banner((await adm.get('/admin/rencontre/accueil')).body), /href="\/auth\/verifier\?next=%2Fadmin%2Frencontre%2Faccueil"/);
  for (const url of PAGES) { const b = banner((await adm.get(url)).body); assert.ok(b, url); assert.doesNotMatch(b, /style=|<script|on[a-z]+=/, url); }
  // Un autre compte, ou une session ouverte après la décision : pas de bandeau.
  for (const url of PAGES) assert.equal(banner((await autre.get(url)).body), null, url);
  c.db.prepare("UPDATE sessions SET auth_time = ? WHERE sub = 'adm'").run(Date.now());
  for (const url of PAGES) assert.equal(banner((await adm.get(url)).body), null, url);
  c.db.prepare("UPDATE sessions SET auth_time = NULL WHERE sub = 'adm'").run();
  // Écritures de la v2 arrêtées : interrupteur des assistants (JSON), accord signé dans l'app (formulaire).
  const j = await adm.json('/admin/series/propositions', { action: 'on', back: '/admin/reglages/assistants' });
  assert.equal(j.statusCode, 403);
  assert.match(j.json().verifier, /^\/auth\/verifier\?next=/);
  const avant = c.db.prepare('SELECT COUNT(*) FROM encounters').pluck().get();
  const r = await adm.post('/admin/rencontre', { author_id: String(c.seb), lang: 'fr', decision: 'refus' });
  assert.equal(r.statusCode, 303);
  assert.match(r.headers.location, /^\/auth\/verifier\?next=/);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounters').pluck().get(), avant, 'rien d’enregistré');
  // Le choix v1 / v2 est une préférence d'affichage : laissé passer, et la v1 montre le même bandeau.
  const v = await adm.post('/admin/version', { version: 'v1', back: '/admin' });
  assert.equal(v.statusCode, 303);
  assert.doesNotMatch(v.headers.location, /^\/auth\//);
  const v1 = (await adm.get('/admin')).body;
  assert.ok(!isV2(v1));
  assert.match(v1, /class="sec-bandeau identite"/);
});
