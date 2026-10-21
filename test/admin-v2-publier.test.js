import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { billet, UA } from './carnet-helpers.js';

// Admin v2, dernière vague, partie B (publier et terrain) : Instagram (file, réglages du compte, propositions), l'app de
// terrain (Mon QR, Merci), Carnets et Galeries privées dans la coquille v2. Mêmes données, droits et routes que la v1 ; un
// compte en v1 voit la v1 (vérifié par le comportement) ; CSRF ; et pour la Vigie, les mêmes émissions depuis la v1 et
// depuis la v2 : galeries privées (BV-14, BV-23, BV-24 : privacy_exposure_changed « acces_prive », sensitive_read,
// sensitive_export, authz_fail hors portée ; le lien et le mot de passe une seule fois, en no-store), Carnets (BV-12,
// BV-13, BV-14, BV-20 et BV-21 ; runDue seule à publier un billet programmé ; limites de l'aperçu et du brouillon) ;
// bandeaux de la Vigie sur chaque écran, app comprise.
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const isV2 = html => html.includes('/static/admin/v2/v2.css');
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

async function site(t, opts = {}) {
  const received = [];
  const ctx = await setup(t, { seeded: true, env: VIGIE, vigieOptions: { send: async body => { received.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false }, ...opts });
  const security = async () => { ctx.app.securite.runTasks(); ctx.app.securite.retryNow(); await ctx.app.securite.flush(); return received; };
  const store = createSessionStore(ctx.db);
  let n = 0;
  // Un compte, sa session, son photographe et son choix de version : get, post (formulaire), json (script de la v2).
  const account = async (sub, { roles = ['admin'], version = 'v2', author = null, name = sub } = {}) => {
    ctx.app.accounts.ensure({ sub, name, roles });
    if (author) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId: ctx.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(author) }, 'test');
    const token = store.create({ sub, name, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { [ctx.config.secureCookies ? '__Host-session' : 'session']: token };
    const ip = () => `192.0.2.${(++n % 250) + 1}`;
    const get = (url, headers = {}) => ctx.app.inject({ url, cookies, remoteAddress: ip(), headers: { accept: 'text/html', 'user-agent': UA, ...headers } });
    const post = (url, payload = {}, { token: tok = csrf } = {}) => ctx.app.inject({ method: 'POST', url, cookies, remoteAddress: ip(), headers: { accept: 'text/html', 'user-agent': UA }, payload: { ...payload, ...(tok ? { _csrf: tok } : {}) } });
    const form = (url, pairs) => ctx.app.inject({ method: 'POST', url, cookies, remoteAddress: ip(), headers: { accept: 'text/html', 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams([['_csrf', csrf], ...pairs]).toString() });
    const json = (url, payload = {}, { token: tok = csrf } = {}) => ctx.app.inject({ method: 'POST', url, cookies, remoteAddress: ip(), headers: { accept: 'application/json', 'user-agent': UA, ...(tok ? { 'x-csrf-token': tok } : {}) }, payload });
    const a = { sub, csrf, get, post, form, json };
    await post('/admin/version', { version, back: '/admin' });
    // (Site en https : le choix s'écrit aussi directement, comme le fait la route.)
    ctx.db.prepare(`INSERT INTO account_prefs (account_id, key, value, updated_at) VALUES (?, 'admin_version', ?, ?)
      ON CONFLICT(account_id, key) DO UPDATE SET value = excluded.value`).run(ctx.app.accounts.bySub(sub).id, version, Date.now());
    await get('/admin/aide');                                                   // fenêtre « Nouveautés » vue une fois
    return a;
  };
  const authorId = slug => ctx.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(slug);
  return { ...ctx, security, account, authorId };
}

// Une galerie ouverte de Julien, ses photos, et un accès (le lien et le mot de passe : la page « secrets »).
async function gallery(c, a, { author = 'julien' } = {}) {
  const r = await a.post('/admin/galeries', { title: 'Lisbonne et Porto', closes: day(60), author_id: String(c.authorId(author)) });
  assert.equal(r.statusCode, 303, r.body);
  const id = Number(r.headers.location.split('/')[3]);
  const ids = c.db.prepare("SELECT id FROM photos WHERE status = 'published' AND author_id = ? ORDER BY id LIMIT 3").pluck().all(c.authorId(author));
  await a.form(`/admin/galeries/${id}/photos`, ids.map(x => ['photos', String(x)]));
  await a.post(`/admin/galeries/${id}/ouvrir`);
  return id;
}
async function newAccess(a, id) {
  const form = await a.get(`/admin/galeries/${id}/acces/nouveau`);
  const jeton = /name="jeton" value="([^"]+)"/.exec(form.body)[1];
  const r = await a.post(`/admin/galeries/${id}/acces`, { jeton, label: 'Lucie Exemple, Éditions du Fleuve', groupe: '0', lang: 'fr', expires: day(30), favoris: '1' });
  return { r, inv: Number(r.headers.location.split('/')[5]) };
}

// Ce qui signe le gabarit v1 de chaque écran et qu'aucun gabarit v2 n'a : la mise en page v1 (son menu), et pour Instagram,
// la page v1 (« ig-status »), pour l'app, sa feuille seule.
const V1_LAYOUT = '<p class="grp" id="nav-work">';

test('un compte en v1 voit la v1, un compte en v2 la v2 : Instagram, Carnets, Galeries privées, Mon QR, Merci', async t => {
  const c = await site(t);
  const v1 = await c.account('compte-v1', { version: 'v1', author: 'sebastien' });
  const v2 = await c.account('compte-v2', { author: 'julien' });
  const g = await gallery(c, v2);
  const { inv } = await newAccess(v2, g);
  const p = await billet(c, { title: 'Brume et lumière', authors: ['julien'], publish: false, body: 'Un texte.\n\nphoto:brume-sur-la-loire' });
  const e = c.db.prepare("INSERT INTO encounters (ref, author_id, status, email, name, lang, consent, consent_source, consent_at, met_on, created_at, updated_at) VALUES ('J-0901', ?, 'nouvelle', 'ines@example.org', 'Inês', 'en', '{\"site\":true}', 'en_ligne', ?, '2026-10-19', ?, ?)").run(c.authorId('julien'), Date.now(), Date.now(), Date.now()).lastInsertRowid;
  const slug = c.db.prepare('SELECT slug FROM photos WHERE id = (SELECT photo_id FROM post_photos WHERE post_id = ? LIMIT 1)').pluck().get(p.id);
  const shell = ['/admin/instagram', '/admin/galeries', '/admin/galeries/nouvelle', `/admin/galeries/${g}`, `/admin/galeries/${g}/photos`, `/admin/galeries/${g}/selections`, `/admin/galeries/${g}/activite`, `/admin/galeries/${g}/reglages`,
    `/admin/galeries/${g}/acces/nouveau`, `/admin/galeries/${g}/acces/${inv}`, `/admin/galeries/${g}/acces/${inv}/revoquer`, `/admin/galeries/${g}/supprimer`,
    '/admin/carnet', `/admin/carnet/${p.id}`, `/admin/carnet/${p.id}/versions`, `/admin/carnet/${p.id}/renvoyer`, `/admin/carnet/${p.id}/supprimer`, `/admin/carnet/${p.id}/photos/1`].concat(slug ? [`/admin/carnet/${p.id}/apercu/photo/${slug}`] : []);
  for (const url of shell) {
    const a = await v1.get(url), b = await v2.get(url);
    assert.equal(a.statusCode, 200, `${url} v1`);
    assert.ok(!isV2(a.body), `${url} : la v1 pour le compte en v1`);
    assert.ok(a.body.includes(V1_LAYOUT), `${url} : la mise en page v1`);
    assert.match(a.body, /<script src="\/static\/admin\/admin\.js[?"]/, `${url} : le script de la v1`);
    assert.doesNotMatch(a.body, /\/static\/admin\/v2\//, `${url} : rien de la v2`);
    assert.match(a.body, /name="version" value="v2"><button type="submit">Essayer l’admin v2/, url);
    assert.equal(b.statusCode, 200, `${url} v2`);
    assert.ok(isV2(b.body), `${url} : la v2 pour le compte en v2`);
    assert.ok(!b.body.includes(V1_LAYOUT), `${url} : pas la mise en page v1`);
    assert.doesNotMatch(b.body, /Écran pas encore en v2/, url);
    assert.match(b.body, /\/static\/admin\/v2\/publier-v2\.css/, url);
    assert.match(b.body, /\/static\/admin\/v2\/publier-v2\.js/, url);
    assert.doesNotMatch(b.body, /\/static\/admin\/admin\.js/, `${url} : pas le script de la v1`);
    assert.equal(b.headers['cache-control'], 'no-store', url);
    assert.doesNotMatch(b.body, /\sstyle="/, `${url} : aucun style en ligne`);
    assert.doesNotMatch(b.body, /<script(?![^>]*(?:\bsrc=|type="application\/json"))[^>]*>/, `${url} : aucun script en ligne`);
    assert.doesNotMatch(b.body, /\son[a-z]+="/, `${url} : aucun gestionnaire en ligne`);
    assert.equal((b.body.match(/<h1[\s>]/g) || []).length, 1, `${url} : un seul titre de page`);
  }
  // Le contenu d'une galerie et d'un billet est celui de la v1 (mêmes formulaires, mêmes routes) ; la v2 n'ajoute que la
  // coquille. Les Carnets gardent leur feuille et leur script d'éditeur.
  for (const url of [`/admin/galeries/${g}/reglages`, `/admin/carnet/${p.id}`]) {
    const actions = html => [...html.replace(/<aside class="side"[^]*?<\/aside>/, '').matchAll(/<form[^>]*action="(\/admin\/(?:galeries|carnet)[^"]*)"/g)].map(m => m[1]).sort();
    // La v2 confirme par des dialogues de la page (finitions) : leurs formulaires (supprimer, fermer, renvoyer, retirer) sont de
    // plus, vers les routes de la v1 ; tout ce que la v1 poste, la v2 le poste.
    const v1a = actions((await v1.get(url)).body), v2a = actions((await v2.get(url)).body);
    assert.deepEqual(v1a.filter(x => !v2a.includes(x)), [], url);
    assert.ok(v2a.filter(x => !v1a.includes(x)).every(x => /\/(supprimer|renvoyer|retirer|fermer)$/.test(x)), `${url} : ${v2a.join(' ')}`);
  }
  const ed = (await v2.get(`/admin/carnet/${p.id}`)).body;
  assert.match(ed, /\/static\/admin\/carnet\.css/);
  assert.match(ed, /\/static\/admin\/carnet\.js/);
  assert.match(ed, /data-editeur/);
  assert.match(ed, /<a href="\/admin\/carnet" aria-current="page">/, 'menu : Carnets');
  assert.match((await v2.get('/admin/galeries')).body, /<a href="\/admin\/galeries" aria-current="page">/, 'menu : Galeries privées');
  assert.match((await v2.get('/admin/instagram')).body, /<a href="\/admin\/instagram" aria-current="page">/, 'menu : Instagram');
  // L'app : Mon QR et Merci.
  for (const url of ['/admin/rencontre/qr', `/admin/rencontre/${e}/merci`]) {
    const a = await v1.get(url), b = await v2.get(url);
    assert.equal(a.statusCode, 200, url);
    assert.doesNotMatch(a.body, /\/static\/admin\/v2\//, `${url} : rien de la v2 en v1`);
    assert.equal(b.statusCode, 200, url);
    assert.match(b.body, /\/static\/admin\/v2\/app-v2\.css/, url);
    assert.match(b.body, /<a class="skip" href="#contenu">/, `${url} : évitement`);
    assert.match(b.body, /<main[^>]*id="contenu"/, url);
    assert.equal((b.body.match(/<h1[\s>]/g) || []).length, 1, url);
    assert.equal(b.headers['cache-control'], 'no-store', url);
    assert.doesNotMatch(b.body, /\sstyle="|\son[a-z]+="/, url);
  }
  const merci = (await v2.get(`/admin/rencontre/${e}/merci`)).body;
  assert.match(merci, /<html lang="en"/, 'Merci : dans la langue de la personne');
  assert.match(merci, /role="img" aria-label="QR code of your page, reference J-0901"/);
  assert.match(merci, /<section class="app-after" lang="fr"/, 'la suite : dans la langue de l’admin');
  assert.match((await v2.get('/admin/rencontre/qr')).body, /<h1>Mon QR<\/h1>/);
});

test('droits et portée : mêmes permissions que la v1 ; hors portée signalé ; Modérateur et Relecteur refusés', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const jul = await gallery(c, adm);
  const seb = await c.account('seb', { roles: ['photographe'], author: 'sebastien' });
  const own = await gallery(c, seb, { author: 'sebastien' });
  const list = (await seb.get('/admin/galeries')).body;
  assert.ok(isV2(list));
  assert.match(list, new RegExp(`/admin/galeries/${own}"`));
  assert.doesNotMatch(list, new RegExp(`/admin/galeries/${jul}"`));
  for (const url of [`/admin/galeries/${jul}`, `/admin/galeries/${jul}/acces/nouveau`, `/admin/galeries/${jul}/reglages`]) assert.equal((await seb.get(url)).statusCode, 404, url);
  assert.equal((await seb.post(`/admin/galeries/${jul}/fermer`)).statusCode, 404);
  const other = await billet(c, { title: 'Celui de Julien', authors: ['julien'], publish: false });
  assert.equal((await seb.get(`/admin/carnet/${other.id}`)).statusCode, 404);
  // Instagram : le photographe n'a pas la page (instagram.voir), ni la file.
  assert.equal((await seb.get('/admin/instagram')).statusCode, 403);
  for (const role of ['moderateur', 'relecteur']) {
    const m = await c.account(`m-${role}`, { roles: [role] });
    assert.equal((await m.get('/admin/galeries')).statusCode, 403, role);
    assert.doesNotMatch((await m.get('/admin')).body, /href="\/admin\/galeries"/, role);
  }
  // Modérateur : la file Instagram (instagram.file) sans le compte (instagram.compte) : ni réglages ni déconnexion.
  const mod = await c.account('mod', { roles: ['moderateur'] });
  const ig = await mod.get('/admin/instagram');
  assert.equal(ig.statusCode, 200);
  assert.ok(isV2(ig.body));
  assert.doesNotMatch(ig.body, /action="\/admin\/instagram\/reglages"|action="\/admin\/instagram\/deconnexion"/);
  assert.match(ig.body, /Le compte et les réglages Instagram sont gérés par un administrateur/);
  assert.equal((await mod.json('/admin/instagram/reglages', { times: '09:00' })).statusCode, 403);
  const v = await c.security();
  const hp = v.filter(e => e.type === 'authz_fail' && e.detail.raison === 'hors portée');
  assert.ok(hp.some(e => e.detail.objet === 'galerie' && e.detail.id === jul && e.detail.ecriture === false));
  assert.ok(hp.some(e => e.detail.objet === 'galerie' && e.detail.id === jul && e.detail.ecriture === true));
  assert.ok(hp.some(e => e.detail.objet === 'billet' && e.detail.id === other.id));
});

test('galeries privées : émissions vers la Vigie et journal identiques depuis la v1 et depuis la v2 (BV-14, BV-23, BV-24) ; secrets une fois, no-store', async t => {
  const TYPES = ['privacy_exposure_changed', 'sensitive_read', 'sensitive_export', 'authz_fail'];
  const norm = e => ({ type: e.type, severity: e.severity, emetteur: e.origine?.emetteur, composant: e.origine?.composant, sub: e.sub, detail: e.detail });
  const run = async version => {
    const c = await site(t);
    const a = await c.account('adm', { version });
    const id = await gallery(c, a);
    const { r, inv } = await newAccess(a, id);
    // Le lien et le mot de passe : une page no-store, sans Referer, lue une seule fois.
    const sec = await a.get(r.headers.location);
    assert.equal(sec.headers['cache-control'], 'no-store', version);
    assert.equal(sec.headers['referrer-policy'], 'no-referrer', version);
    assert.equal(isV2(sec.body), version === 'v2', version);
    const pw = /<output class="mdp"[^>]*>([^<]+)</.exec(sec.body)[1];
    assert.match(pw, /^[a-z0-9]{4} [a-z0-9]{4} [a-z0-9]{4}$/, `${version} : le mot de passe tel quel (aucune espace insécable)`);
    const link = /(http:\/\/localhost:3000\/g\/[\w-]{32})/.exec(sec.body)[1];
    const again = await a.get(r.headers.location);
    assert.match(again.body, /déjà été affichés/, version);
    assert.ok(!again.body.includes(link.split('/g/')[1]), version);
    assert.ok(!again.body.includes(pw), version);
    // Lectures, export, réglages, nouveaux secrets, révocation.
    const item = c.db.prepare('SELECT id FROM space_items WHERE space_id = ? LIMIT 1').pluck().get(id);
    c.db.prepare('INSERT INTO space_favorites (invite_id, item_id, added_at) VALUES (?, ?, ?)').run(inv, item, Date.now());
    for (const url of [`/admin/galeries/${id}/acces/${inv}`, `/admin/galeries/${id}/activite`, `/admin/galeries/${id}/selections`]) assert.equal((await a.get(url)).statusCode, 200, `${version} ${url}`);
    assert.equal((await a.get(`/admin/galeries/${id}/acces/${inv}/selection.csv`)).statusCode, 200);
    await a.post(`/admin/galeries/${id}/acces/${inv}`, { expires: day(40), favoris: '1', telecharger: '1', grande: '1' });
    for (const k of ['nouveau-lien', 'nouveau-mot-de-passe']) {
      assert.equal((await a.get(`/admin/galeries/${id}/acces/${inv}/${k}`)).statusCode, 200);
      const x = await a.post(`/admin/galeries/${id}/acces/${inv}/${k}`);
      const s2 = await a.get(x.headers.location);
      assert.equal(s2.headers['cache-control'], 'no-store');
    }
    assert.equal((await a.post(`/admin/galeries/${id}/acces/${inv}/revoquer`, {}, { token: 'faux' })).statusCode, 403, `${version} : CSRF`);
    await a.post(`/admin/galeries/${id}/acces/${inv}/revoquer`);
    // Hors portée : le photographe et la galerie de Julien.
    const seb = await c.account('seb', { roles: ['photographe'], author: 'sebastien', version });
    await seb.get(`/admin/galeries/${id}/acces/${inv}`);
    await seb.post(`/admin/galeries/${id}/acces/${inv}/revoquer`);
    const events = (await c.security()).filter(e => TYPES.includes(e.type)).map(norm);
    const audit = c.db.prepare("SELECT action, target, status FROM audit_log WHERE action LIKE 'galerie privée%' OR action LIKE 'GET /admin/galeries%' OR action LIKE 'POST /admin/galeries%' ORDER BY id").all();
    return { events, audit };
  };
  const v1 = await run('v1'), v2 = await run('v2');
  assert.deepEqual(v2.events, v1.events);
  assert.deepEqual(v2.audit, v1.audit);
  const exp = v2.events.filter(e => e.type === 'privacy_exposure_changed' && e.detail.objet === 'acces_prive').map(e => e.detail.action);
  assert.deepEqual(exp, ['espace_ouvert', 'cree', 'droits_elargis', 'prolonge', 'nouveau_lien', 'nouveau_mot_de_passe', 'revoque']);
  assert.ok(v2.events.some(e => e.type === 'sensitive_read' && e.detail.objet === 'acces'));
  assert.ok(v2.events.some(e => e.type === 'sensitive_export' && e.detail.cible === '/admin/galeries/:id/acces/:inv/selection.csv'));
  assert.ok(v2.events.some(e => e.type === 'authz_fail' && e.detail.raison === 'hors portée' && e.detail.objet === 'galerie' && e.detail.ecriture === true));
});

test('Carnets depuis la v2 : BV-12, BV-14, BV-20 et BV-21 comme en v1 ; runDue seule publie un billet programmé ; limites de l’aperçu et du brouillon', async t => {
  const run = async version => {
    const c = await site(t);
    c.app.publicVersion.save('v2');
    const adm = await c.account('adm', { version });
    const p = await billet(c, { title: 'Billet de test', authors: ['julien'], publish: false });
    // Aperçu et brouillon (JSON, comme l'éditeur) : rien de signalé par le rendu.
    await adm.json(`/admin/carnet/${p.id}/apercu`, { langue: 'fr', body: '<script>alert(1)</script>' });
    await adm.json(`/admin/carnet/${p.id}/brouillon`, { langue: 'fr', body: '<script>alert(1)</script>' });
    // Enregistrer (le formulaire de l'éditeur) : signalé une fois ; noms des champs au journal, jamais leurs valeurs.
    await adm.post(`/admin/carnet/${p.id}`, { langue: 'fr', body: 'Texte <script>alert("SECRET")</script>' });
    await adm.post(`/admin/carnet/${p.id}`, { langue: 'de', title: 'Titel' });
    // Programmer, puis la minuterie : app.carnet.runDue() seule met le billet en ligne.
    c.db.prepare("UPDATE photos SET alt_text = 'Une photo.' WHERE alt_text = ''").run();
    await adm.post(`/admin/carnet/${p.id}`, { langue: 'fr', dek: 'Un chapô.', body: 'Un texte sûr.' });
    const at = new Date(Date.now() + 3 * 864e5);
    const when = `${String(at.getDate()).padStart(2, '0')}/${String(at.getMonth() + 1).padStart(2, '0')}/${at.getFullYear()} 9:00`;
    const pr = await adm.post(`/admin/carnet/${p.id}/publier`, { quand: 'programmer', publish_at: when });
    assert.equal(pr.statusCode, 303, `${version} programmer`);
    assert.equal(c.app.carnet.get(p.id).state, 'programme', `${version} : programmé, pas publié`);
    c.db.prepare('UPDATE posts SET publish_at = ? WHERE id = ?').run(Date.now() - 1000, p.id);
    await c.app.carnet.runDue();
    assert.equal(c.app.carnet.get(p.id).state, 'publie', version);
    // Hors portée : un photographe et le billet de Julien.
    const seb = await c.account('seb', { roles: ['photographe'], author: 'sebastien', version });
    await seb.get(`/admin/carnet/${p.id}`);
    await seb.post(`/admin/carnet/${p.id}`, { title: 'Volé' });
    // Limite du brouillon : 30 par minute et par compte, puis 429 (signalé).
    const codes = [];
    for (let k = 0; k < 31; k++) codes.push((await adm.json(`/admin/carnet/${p.id}/brouillon`, { langue: 'en', body: 'x' })).statusCode);
    const tooDeep = (await adm.json(`/admin/carnet/${p.id}/apercu`, { langue: 'fr', body: `${'>'.repeat(9)} trop` })).statusCode;
    const v = await c.security();
    const norm = e => ({ type: e.type, severity: e.severity, emetteur: e.origine?.emetteur, sub: e.sub, detail: e.detail });
    const events = v.filter(e => (e.type === 'malicious_input' && e.origine?.emetteur === 'server/carnet-markdown.js · billet') || (e.type === 'authz_fail' && e.detail.raison === 'hors portée')
      || (e.type === 'excess_rate_limit_exceeded' && e.origine?.emetteur === 'server/routes/carnet.js · limite')).map(norm);
    const audit = c.db.prepare("SELECT action, target, detail, status FROM audit_log WHERE action LIKE '%carnet%' ORDER BY id").all().map(x => ({ ...x, detail: String(x.detail || '').replace(/\d{1,2}[/:]\d{2}/g, '') }));
    return { events, audit, codes, tooDeep, json: JSON.stringify(v) };
  };
  const v1 = await run('v1'), v2 = await run('v2');
  assert.deepEqual(v2.events, v1.events);
  assert.deepEqual(v2.audit, v1.audit);
  assert.deepEqual(v2.codes, v1.codes);
  assert.equal(v2.codes.at(-1), 429);
  assert.equal(v2.tooDeep, 422);
  assert.ok(!v2.json.includes('SECRET'), 'jamais le texte du billet');
  assert.equal(v2.events.filter(e => e.type === 'malicious_input').length, 1, 'BV-12 : une fois, à l’enregistrement, jamais à l’aperçu ni au brouillon');
  assert.ok(v2.events.some(e => e.type === 'authz_fail' && e.detail.objet === 'billet' && e.detail.ecriture === true), 'BV-14');
  assert.ok(v2.events.some(e => e.type === 'excess_rate_limit_exceeded' && e.detail.limite === 'carnet_brouillon'));
  assert.ok(v2.audit.some(x => /champs : body/.test(x.detail)), 'BV-20 : noms des champs au journal');
  assert.ok(!JSON.stringify(v2.audit).includes('SECRET'), 'jamais la valeur au journal');
  assert.ok(v2.audit.some(x => x.action === 'carnet · publication programmée'), 'BV-21 : la publication programmée au journal (runDue)');
  // Un seul chemin de publication programmée : aucun gabarit ni script de la v2 n'appelle autre chose que les routes de la
  // v1 (POST /admin/carnet/:id/publier, quand=programmer) ; runDue n'est appelée que par la minuterie de server/app.js.
  const src = ['server/app.js', 'server/routes/carnet.js', 'server/routes/admin.js'].map(f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
  assert.equal(src.join('\n').match(/carnet\.runDue\(/g).length, 1);
  const mine = fs.readdirSync(new URL('../views/admin/v2/', import.meta.url)).filter(f => /^(carnet|_coquille|_textes-publier)/.test(f)).map(f => `views/admin/v2/${f}`).concat('public/admin/v2/publier-v2.js');
  for (const f of mine) assert.doesNotMatch(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), /runDue|publish_at|carnet\/[^'"]*\/publier/, f);
  for (const f of mine.filter(x => /\/carnet/.test(x))) assert.match(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), /^<% layout\('\.\/layout'\) %>\n<% \/\*[^]*?\*\/ %>\n<%~ include\('\.\/_coquille-publier', \{ \.\.\.it, vue: '[\w-]+' \}\) %>\n$/, `${f} : la coquille seule`);
});

test('Instagram en v2 : file sans recharger avec « Défaire », réglages au geste, propositions, dialogues ; CSRF ; jeton jamais affiché', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const ids = c.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 4").pluck().all();
  for (const id of ids.slice(0, 3)) assert.equal((await adm.post('/admin/instagram/file', { photo_id: String(id) })).statusCode, 303);
  const queue = () => c.app.instagram.queue().map(x => x.photo_id);
  const posts = c.app.instagram.queue().map(x => x.id);
  // Avancer en JSON (script de la v2) ; « Défaire » est le geste inverse.
  const up = await adm.json(`/admin/instagram/${posts[2]}/monter`);
  assert.equal(up.statusCode, 200);
  assert.deepEqual(up.json().queue, c.app.instagram.queue().map(x => x.id));
  assert.deepEqual(queue(), [ids[0], ids[2], ids[1]]);
  assert.equal((await adm.json(`/admin/instagram/${posts[2]}/descendre`)).statusCode, 200);
  assert.deepEqual(queue(), ids.slice(0, 3));
  // Sans script : le formulaire et la redirection, comme en v1.
  const f = await adm.post(`/admin/instagram/${posts[1]}/monter`);
  assert.deepEqual([f.statusCode, f.headers.location], [303, '/admin/instagram']);
  await adm.post(`/admin/instagram/${posts[1]}/descendre`);
  // CSRF : formulaire, JSON, faux jeton.
  for (const r of [await adm.post(`/admin/instagram/${posts[0]}/descendre`, {}, { token: null }), await adm.json(`/admin/instagram/${posts[0]}/descendre`, {}, { token: null }), await adm.json(`/admin/instagram/${posts[0]}/descendre`, {}, { token: 'faux' }),
    await adm.json('/admin/instagram/reglages', { times: '07:00' }, { token: 'faux' })]) assert.equal(r.statusCode, 403);
  assert.deepEqual(queue(), ids.slice(0, 3));
  // Réglages au geste (le formulaire entier, en JSON) : les heures gardées, une heure illisible écartée et dite.
  const page = (await adm.get('/admin/instagram')).body;
  assert.match(page, /<form class="form ig-reglages" method="post" action="\/admin\/instagram\/reglages" novalidate data-ig-reglages>/);
  const r = await adm.json('/admin/instagram/reglages', { limits_preset: 'prudent', times: '09:00, 25:99, 18:30', frame: 'white', template: '{titre}', hashtags: '#essai' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json().times, ['09:00', '18:30']);
  assert.deepEqual(r.json().rejected, ['25:99']);
  assert.deepEqual(c.app.instagram.settings().times, ['09:00', '18:30']);
  assert.equal(c.app.instagram.settings().frame, 'white');
  // Sans script, le bouton « Enregistrer les réglages » et la redirection de la v1.
  const nf = await adm.post('/admin/instagram/reglages', { times: '10:00', frame: 'white', template: '{titre}' });
  assert.deepEqual([nf.statusCode, nf.headers.location], [303, '/admin/instagram#reglages']);
  // Propositions des photographes : sur la page Instagram (mêmes routes qu'« À valider »), retour à la page.
  c.db.prepare("INSERT INTO instagram_proposals (photo_id, frame, watermark, message, by_name, at) VALUES (?, 'white', 1, 'Celle-ci.', 'Sébastien', ?)").run(ids[3], Date.now());
  const withProp = (await adm.get('/admin/instagram')).body;
  assert.match(withProp, /id="propositions"/);
  assert.match(withProp, /action="\/admin\/instagram\/propositions\/\d+\/valider"><input type="hidden" name="_csrf" value="[^"]+"><input type="hidden" name="back" value="\/admin\/instagram#propositions">/);
  assert.match(withProp, /<dialog class="confirm cible" id="dlg-prop-\d+"/);
  const pid = c.db.prepare('SELECT id FROM instagram_proposals').pluck().get();
  const ok = await adm.post(`/admin/instagram/propositions/${pid}/valider`, { back: '/admin/instagram#propositions' });
  assert.deepEqual([ok.statusCode, ok.headers.location], [303, '/admin/instagram#propositions']);
  assert.ok(queue().includes(ids[3]));
  // Ce qui ne se défait pas passe par un dialogue : publier maintenant, retirer de la file (Annuler d'abord).
  const html = (await adm.get('/admin/instagram')).body;
  for (const p of c.app.instagram.queue()) {
    assert.match(html, new RegExp(`<a class="btn" href="#dlg-publier-${p.id}" data-ouvre="dlg-publier-${p.id}">`));
    assert.match(html, new RegExp(`<dialog class="confirm cible" id="dlg-retirer-${p.id}"[^]*?<div class="actions"><a class="btn ghost" href="#file" data-annuler>Annuler</a><button class="btn" type="submit">Retirer de la file</button>`));
  }
});

test('Instagram en v2 : le jeton de l’API reste chiffré dans la base, jamais affiché ; « Déconnecter… » passe par un dialogue', async t => {
  const LONG = 'IGQVJ-jeton-secret-0123456789abcdefghijklmnopqrstuvwxyz';
  const json = body => ({ ok: true, status: 200, json: async () => body });
  const fetchImpl = async url => {
    const u = new URL(url);
    if (u.pathname === '/oauth/access_token') return json({ access_token: 'short-token', user_id: 1784 });
    if (u.pathname === '/access_token') return json({ access_token: LONG, expires_in: 5184000 });
    if (u.pathname.endsWith('/me')) return json({ user_id: '1784', username: 'nicephos' });
    return { ok: false, status: 404, json: async () => ({ error: { message: 'inconnu' } }) };
  };
  const c = await site(t, { env: { ...VIGIE, PUBLIC_URL: 'https://nicephos.example', COOKIE_SECRET: 'x'.repeat(40), INSTAGRAM_APP_ID: '123456', INSTAGRAM_APP_SECRET: 'app-secret-0123456789' }, instagramOptions: { manual: true, fetchImpl, sleep: async () => {}, timeoutMs: 100 } });
  assert.equal(await c.app.instagram.connect('code'), 'nicephos');
  const adm = await c.account('adm');
  c.db.pragma('wal_checkpoint(TRUNCATE)');
  assert.ok(!fs.readFileSync(c.config.databasePath).toString('latin1').includes('jeton-secret'), 'jeton chiffré en base');
  const res = await adm.get('/admin/instagram');
  const html = res.body;
  assert.ok(isV2(html), `${res.statusCode} ${res.headers.location || ''} ${html.slice(0, 300)}`);
  assert.match(html, /<strong>@nicephos<\/strong>/);
  assert.ok(!html.includes('jeton-secret') && !html.includes('IGQVJ') && !html.includes('short-token'), 'jeton jamais affiché');
  assert.match(html, /Le jeton d’accès est gardé chiffré sur le serveur\s;\sil n’est jamais affiché/);
  assert.match(html, /<a class="btn ghost" href="#dlg-deconnecter" data-ouvre="dlg-deconnecter">Déconnecter…<\/a>/);
  assert.match(html, /<dialog class="confirm cible" id="dlg-deconnecter"[^]*?<a class="btn ghost" href="#compte" data-annuler>Annuler<\/a><button class="btn danger" type="submit">Déconnecter<\/button>/);
  // Le modérateur (instagram.file, pas instagram.compte) voit le compte, sans « Déconnecter… ».
  const mod = await c.account('mod', { roles: ['moderateur'] });
  assert.doesNotMatch((await mod.get('/admin/instagram')).body, /dlg-deconnecter/);
});

test('Vigie sur les écrans de la partie B : entrée « Sécurité », badge, bandeau critique ; bandeau d’identité, app comprise', async t => {
  const c = await site(t);
  const adm = await c.account('adm', { author: 'julien' });
  const g = await gallery(c, adm);
  const p = await billet(c, { title: 'Brume', authors: ['julien'], publish: false });
  const e = c.db.prepare("INSERT INTO encounters (ref, author_id, status, lang, created_at, updated_at) VALUES ('J-0902', ?, 'nouvelle', 'fr', ?, ?)").run(c.authorId('julien'), Date.now(), Date.now()).lastInsertRowid;
  const URLS = ['/admin/instagram', '/admin/galeries', `/admin/galeries/${g}`, `/admin/galeries/${g}/reglages`, '/admin/carnet', `/admin/carnet/${p.id}`, `/admin/carnet/${p.id}/versions`];
  const APP = ['/admin/rencontre/qr', `/admin/rencontre/${e}/merci`];
  const s = JSON.stringify({ usage: 'resume', emis_a: Date.now(), ouvertes: { critique: 1, haut: 0, moyen: 0, bas: 0 }, plus_grave: { id: 7, gravite: 'critique', depuis: Date.now() - 60e3 }, critique_a_prendre: true });
  c.app.decisions.acceptSummary({ payload: s, signature: crypto.sign(null, Buffer.from(s), VIGIE_KEYS.privateKey).toString('base64') });
  for (const url of URLS) {
    const html = (await adm.get(url)).body;
    assert.ok(isV2(html), url);
    assert.match(html, /<a class="nav-sec" href="[^"]+" target="_blank" rel="noopener noreferrer">[^]*?Sécurité<span class="sr-only"> \(nouvel onglet\)<\/span>[^]*?<span class="nav-badge/, url);
    assert.match(html, /<div class="sec-bandeau" role="alert">/, url);
    assert.doesNotMatch(html, /sec-bandeau identite/, url);
  }
  for (const url of APP) assert.doesNotMatch((await adm.get(url)).body, /msg-identite/, url);
  const v = JSON.stringify({ usage: 'site', version: Date.now(), emis_a: Date.now(), blocages: [], sessions: [], comptes: [], gels: [], verrouillage: null, verifications: [{ sub: 'adm', depuis: Date.now() - 1000, fin: Date.now() + 864e5 }] });
  c.app.decisions.accept({ payload: v, signature: crypto.sign(null, Buffer.from(v), VIGIE_KEYS.privateKey).toString('base64') });
  for (const url of URLS) assert.match((await adm.get(url)).body, /<div class="sec-bandeau identite" role="status">[^]*?href="\/auth\/verifier\?next=/, url);
  // L'app : le bandeau d'identité par appView (identity : identityOf), sur Mon QR et Merci aussi.
  for (const url of APP) assert.match((await adm.get(url)).body, /<div class="msg msg-identite" role="status">[^]*?<a class="btn-app" href="\/auth\/verifier\?next=/, url);
  // Pendant la vérification, les écritures de la v2 sont arrêtées (JSON compris).
  const r = await adm.json('/admin/instagram/reglages', { times: '07:00' });
  assert.equal(r.statusCode, 403);
  assert.notDeepEqual(c.app.instagram.settings().times, ['07:00']);
});

test('l’éditeur d’un billet dans la coquille v2 : la page dans la langue de l’admin, le billet dans celle de son onglet', async t => {
  const c = await site(t);
  const adm = await c.account('adm', { author: 'julien' });
  await adm.post('/admin/langue', { lang: 'de', back: '/admin' });         // gardée sur le photographe lié
  const p = await billet(c, { title: 'Brume', authors: ['julien'], publish: false });
  const html = (await adm.get(`/admin/carnet/${p.id}`)).body;
  assert.match(html, /^<!doctype html>\n<html lang="de"/);
  assert.match(html, /<details class="lang-pick admin-lang">\s*<summary>[^]*?<span>DE<\/span>/);
  assert.match(html, /name="langue" value="fr"|lang="fr"/, 'le billet garde la langue de son onglet');
});
