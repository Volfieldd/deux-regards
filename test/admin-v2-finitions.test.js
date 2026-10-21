import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { billet, UA } from './carnet-helpers.js';
import * as JOURNAL from '../server/journal-libelles.js';

// Admin v2, finitions : Carnets et Galeries privées (confirmations en dialogues, réglages au geste avec « Défaire », liste des
// galeries au format des autres listes), « Sur le terrain » et les cartes d'accord, le Journal (cible nommée, actions groupées
// détaillées), l'aide (un chapitre par page, panneau contextuel), la page refusée (403) dans la mise en page de l'admin. Mêmes
// routes, mêmes droits que la v1 ; un compte en v1 voit la v1 (vérifié par le comportement) ; CSRF ; et pour la Vigie, les
// mêmes émissions qu'en v1 (galeries privées : privacy_exposure_changed « acces_prive », sensitive_read, sensitive_export,
// authz_fail hors portée ; Carnets : un seul chemin de publication programmée), les bandeaux de la Vigie et celui d'identité.
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const isV2 = html => html.includes('/static/admin/v2/v2.css');
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const signe = obj => { const p = JSON.stringify(obj); return { payload: p, signature: crypto.sign(null, Buffer.from(p), VIGIE_KEYS.privateKey).toString('base64') }; };
const plain = r => Object.defineProperty(r, 'body', { value: r.body.replace(/[  ]/g, ' ') });

async function site(t, opts = {}) {
  const received = [];
  const ctx = await setup(t, { seeded: true, env: VIGIE, vigieOptions: { send: async body => { received.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false }, ...opts });
  const security = async () => { ctx.app.securite.runTasks(); ctx.app.securite.retryNow(); await ctx.app.securite.flush(); return received; };
  const store = createSessionStore(ctx.db);
  let n = 0;
  const account = async (sub, { roles = ['admin'], version = 'v2', author = null } = {}) => {
    ctx.app.accounts.ensure({ sub, name: sub, roles });
    if (author) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId: ctx.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(author) }, 'test');
    const token = store.create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token };
    const ip = () => `192.0.2.${(++n % 250) + 1}`;
    const get = async (url, headers = {}) => plain(await ctx.app.inject({ url, cookies, remoteAddress: ip(), headers: { accept: 'text/html', 'user-agent': UA, ...headers } }));
    const post = async (url, payload = {}, { token: tok = csrf } = {}) => plain(await ctx.app.inject({ method: 'POST', url, cookies, remoteAddress: ip(), headers: { accept: 'text/html', 'user-agent': UA }, payload: { ...payload, ...(tok ? { _csrf: tok } : {}) } }));
    const json = (url, payload = {}, { token: tok = csrf } = {}) => ctx.app.inject({ method: 'POST', url, cookies, remoteAddress: ip(), headers: { accept: 'application/json', 'user-agent': UA, ...(tok ? { 'x-csrf-token': tok } : {}) }, payload });
    const a = { sub, csrf, get, post, json };
    await post('/admin/version', { version, back: '/admin' });
    await get('/admin/aide');                                                   // fenêtre « Nouveautés » vue une fois
    return a;
  };
  const authorId = slug => ctx.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(slug);
  const audits = action => ctx.db.prepare('SELECT action, target, detail, status FROM audit_log WHERE action = ? ORDER BY id').all(action);
  return { ...ctx, security, account, authorId, audits };
}

async function gallery(c, a, { author = 'julien', open = true } = {}) {
  const r = await a.post('/admin/galeries', { title: 'Lisbonne et Porto', closes: day(60), author_id: String(c.authorId(author)) });
  assert.equal(r.statusCode, 303, r.body);
  const id = Number(r.headers.location.split('/')[3]);
  const ids = c.db.prepare("SELECT id FROM photos WHERE status = 'published' AND author_id = ? ORDER BY id LIMIT 3").pluck().all(c.authorId(author));
  for (const x of ids) c.app.spaces.addPhotos(id, [x]);
  if (open) await a.post(`/admin/galeries/${id}/ouvrir`);
  return id;
}
async function newAccess(a, id) {
  const form = await a.get(`/admin/galeries/${id}/acces/nouveau`);
  const jeton = /name="jeton" value="([^"]+)"/.exec(form.body)[1];
  const r = await a.post(`/admin/galeries/${id}/acces`, { jeton, label: 'Lucie Exemple, Éditions du Fleuve', groupe: '0', lang: 'fr', expires: day(30), favoris: '1' });
  return { r, inv: Number(r.headers.location.split('/')[5]) };
}
const dialogs = html => [...html.matchAll(/<dialog class="confirm cible" id="(dlg-[a-z-]+)"[^>]*>\s*<form method="post" action="([^"]+)">/g)].map(m => ({ id: m[1], action: m[2] }));

test('un compte en v1 voit la v1 (confirmations en pages), un compte en v2 des dialogues : galeries, accès, billet', async t => {
  const c = await site(t);
  const v1 = await c.account('compte-v1', { version: 'v1' });
  const v2 = await c.account('compte-v2');
  const g = await gallery(c, v2);
  const { inv } = await newAccess(v2, g);
  const p = await billet(c, { title: 'Brume et lumière', authors: ['julien'], publish: true });
  const d = await billet(c, { title: 'Brouillon du soir', authors: ['julien'], publish: false });
  const acces = `/admin/galeries/${g}/acces/${inv}`;
  // v1 : des liens vers les pages de confirmation, aucun dialogue, rien de la v2.
  const a1 = (await v1.get(acces)).body;
  assert.ok(!isV2(a1));
  assert.doesNotMatch(a1, /<dialog class="confirm/);
  for (const k of ['revoquer', 'nouveau-mot-de-passe', 'nouveau-lien', 'effacer']) assert.match(a1, new RegExp(`href="${acces.replace(/\//g, '\\/')}\\/${k}"`), `v1 ${k}`);
  assert.doesNotMatch(a1, /data-gp-auto/);
  const r1 = (await v1.get(`/admin/galeries/${g}/reglages`)).body;
  assert.match(r1, /href="\/admin\/galeries\/\d+\/supprimer"/);
  assert.match(r1, /<form method="post" action="\/admin\/galeries\/\d+\/fermer">/);
  assert.doesNotMatch(r1, /<dialog class="confirm|data-gp-auto/);
  assert.doesNotMatch((await v1.get(`/admin/galeries/${g}/photos`)).body, /data-gp-/);
  const c1 = (await v1.get(`/admin/carnet/${p.id}`)).body;
  assert.match(c1, new RegExp(`href="/admin/carnet/${p.id}/retirer"`));
  assert.doesNotMatch(c1, /<dialog class="confirm/);
  // v2 : les mêmes routes, en dialogues de la page (dialog:target sans script : un lien vers l'ancre, le dialogue dans la page).
  const a2 = (await v2.get(acces)).body;
  assert.ok(isV2(a2));
  assert.deepEqual(dialogs(a2).map(x => x.action).sort(), ['revoquer', 'nouveau-mot-de-passe', 'nouveau-lien', 'effacer'].map(k => `${acces}/${k}`).sort());
  for (const k of ['revoquer', 'nouveau-mot-de-passe', 'nouveau-lien', 'effacer']) {
    assert.match(a2, new RegExp(`href="#dlg-${k}" data-ouvre="dlg-${k}"`), `v2 ${k}`);
    assert.doesNotMatch(a2, new RegExp(`href="${acces.replace(/\//g, '\\/')}\\/${k}"`), `v2 : plus de page pour ${k}`);
  }
  // Chaque dialogue nomme la personne, dit ce qui part, garde « Annuler » d'abord ; le jeton est dans le formulaire.
  const rev = /<dialog class="confirm cible" id="dlg-revoquer"[^]*?<\/dialog>/.exec(a2)[0];
  assert.match(rev, /Révoquer l’accès de Lucie Exemple, Éditions du Fleuve \?/);
  assert.match(rev, /name="_csrf" value="[^"]+"/);
  assert.ok(rev.indexOf('data-annuler') < rev.indexOf('type="submit"'), 'Annuler avant l’action');
  // La page de confirmation de la v1 reste le recours (un refus y renvoie) : elle existe aussi pour un compte en v2.
  assert.equal((await v2.get(`${acces}/revoquer`)).statusCode, 200);
  const r2 = (await v2.get(`/admin/galeries/${g}/reglages`)).body;
  assert.deepEqual(dialogs(r2).map(x => x.action).sort(), [`/admin/galeries/${g}/fermer`, `/admin/galeries/${g}/supprimer`]);
  assert.match(r2, /data-gp-auto="galerie"/);
  assert.match(r2, /<div class="form-pied sans-script"><button/, 'sans script : le bouton Enregistrer reste');
  assert.doesNotMatch(r2, /<button class="btn ghost" type="submit">Fermer la galerie<\/button>/, 'fermer : un lien vers son dialogue');
  assert.match(a2, /data-gp-auto="acces"/);
  const ph = (await v2.get(`/admin/galeries/${g}/photos`)).body;
  assert.equal((ph.match(/data-gp-deplacer="monter"/g) || []).length, 3);
  assert.match(ph, /data-gp-deplacer="monter"[^>]*><input[^>]*><button class="btn ghost" type="submit" disabled>/, 'la première ne monte pas');
  // Carnets : retirer (billet en ligne) et supprimer (jamais publié) par un dialogue ; renvoyer à son tour.
  const c2 = (await v2.get(`/admin/carnet/${p.id}`)).body;
  assert.deepEqual(dialogs(c2).map(x => x.action), [`/admin/carnet/${p.id}/retirer`]);
  assert.match(c2, /name="reason"[^>]*required/);
  assert.deepEqual(dialogs((await v2.get(`/admin/carnet/${d.id}`)).body).map(x => x.action), [`/admin/carnet/${d.id}/supprimer`]);
  for (const [id, url] of [['dlg-retirer', `/admin/carnet/${p.id}/retirer`], ['dlg-supprimer', `/admin/carnet/${d.id}/supprimer`]]) assert.ok(isV2((await v2.get(url)).body), `${url} : la page de repli en v2`);
  // Sans jeton : refusé, rien ne change.
  assert.equal((await v2.post(`${acces}/revoquer`, {}, { token: 'faux' })).statusCode, 403);
  assert.equal(c.app.spaces.invite(inv).revoked_at, null);
});

test('les dialogues postent vers les routes de la v1 : mêmes émissions vers la Vigie et même journal depuis la v1 et la v2 ; secrets une fois, no-store, sans Referer', async t => {
  const TYPES = ['privacy_exposure_changed', 'sensitive_read', 'sensitive_export', 'authz_fail'];
  const norm = e => ({ type: e.type, severity: e.severity, emetteur: e.origine?.emetteur, sub: e.sub, detail: { ...e.detail, octets_servis: undefined } });   // (la taille d'une page diffère : sa mise en page)
  const run = async version => {
    const c = await site(t);
    const a = await c.account('adm', { version });
    const id = await gallery(c, a);
    const { r, inv } = await newAccess(a, id);
    const sec = await a.get(r.headers.location);
    assert.equal(sec.headers['cache-control'], 'no-store', version);
    assert.equal(sec.headers['referrer-policy'], 'no-referrer', version);
    assert.match((await a.get(r.headers.location)).body, /déjà été affichés/, version);
    const acces = `/admin/galeries/${id}/acces/${inv}`;
    // En v2, les actions sont celles que les dialogues de la page déclarent (leur formulaire), pas des adresses écrites ici.
    const page = (await a.get(acces)).body;
    const act = k => (version === 'v2' ? dialogs(page).find(x => x.id === `dlg-${k}`).action : `${acces}/${k}`);
    for (const k of ['nouveau-lien', 'nouveau-mot-de-passe']) {
      const x = await a.post(act(k));
      assert.equal(x.statusCode, 303, `${version} ${k}`);
      const s2 = await a.get(x.headers.location);
      assert.equal(s2.headers['cache-control'], 'no-store', `${version} ${k}`);
      assert.equal(s2.headers['referrer-policy'], 'no-referrer', `${version} ${k}`);
      assert.doesNotMatch((await a.get(x.headers.location)).body, /<output class="mdp"/, `${version} ${k} : une seule fois`);
    }
    c.db.prepare('INSERT INTO space_favorites (invite_id, item_id, added_at) SELECT ?, id, ? FROM space_items WHERE space_id = ? LIMIT 1').run(inv, Date.now(), id);
    assert.equal((await a.get(`${acces}/selection.csv`)).statusCode, 200);
    await a.get(`/admin/galeries/${id}/activite`);
    // Réglages en JSON (v2) ou par le formulaire (v1) : même route, même effet, mêmes émissions (droits élargis, prolongé).
    if (version === 'v2') {
      const j = await a.json(acces, { expires: day(40), favoris: '1', telecharger: '1', grande: '1' });
      assert.equal(j.statusCode, 200);
      assert.equal(j.json().ok, true);
    } else await a.post(acces, { expires: day(40), favoris: '1', telecharger: '1', grande: '1' });
    assert.equal((await a.post(act('revoquer'))).statusCode, 303);
    const sebast = await c.account('seb', { roles: ['photographe'], author: 'sebastien', version });
    await sebast.get(acces);
    await sebast.post(`${acces}/revoquer`);
    const { inv: inv2 } = await newAccess(a, id);
    const page2 = (await a.get(`/admin/galeries/${id}/acces/${inv2}`)).body;
    const eff = version === 'v2' ? dialogs(page2).find(x => x.id === 'dlg-effacer').action : `/admin/galeries/${id}/acces/${inv2}/effacer`;
    assert.equal((await a.post(eff)).statusCode, 303, `${version} effacer`);
    const events = (await c.security()).filter(e => TYPES.includes(e.type)).map(norm);
    const audit = c.db.prepare("SELECT action, target, status FROM audit_log WHERE action LIKE 'galerie privée%' OR action LIKE 'GET /admin/galeries%' OR action LIKE 'POST /admin/galeries%' ORDER BY id").all();
    return { events, audit };
  };
  const v1 = await run('v1'), v2 = await run('v2');
  assert.deepEqual(v2.events, v1.events);
  assert.deepEqual(v2.audit, v1.audit);
  const exp = v2.events.filter(e => e.type === 'privacy_exposure_changed' && e.detail.objet === 'acces_prive').map(e => e.detail.action);
  assert.deepEqual(exp, ['espace_ouvert', 'cree', 'nouveau_lien', 'nouveau_mot_de_passe', 'droits_elargis', 'prolonge', 'revoque', 'cree', 'efface']);
  assert.ok(v2.events.some(e => e.type === 'sensitive_read' && e.detail.objet === 'acces'));
  assert.ok(v2.events.some(e => e.type === 'sensitive_export' && e.detail.cible === '/admin/galeries/:id/acces/:inv/selection.csv'));
  assert.ok(v2.events.some(e => e.type === 'authz_fail' && e.detail.raison === 'hors portée' && e.detail.objet === 'galerie'));
});

test('réglages au geste : la galerie et l’accès répondent en JSON (route de la v1), erreur sous le champ, « Défaire » rétablit, fermeture avancée dite irréversible ; CSRF, portée, identité', async t => {
  const c = await site(t);
  const adm = await c.account('adm', { author: 'julien' });
  const id = await gallery(c, adm);
  const { inv } = await newAccess(adm, id);
  const base = { title: 'Lisbonne et Porto', title_en: '', title_de: '', intro: '', intro_en: '', intro_de: '' };
  // Un champ quitté : le formulaire entier part, la route répond en JSON avec la date telle que gardée.
  const ok = await adm.json(`/admin/galeries/${id}`, { ...base, title: 'Lisbonne', closes: day(200) });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.json()));
  assert.equal(ok.json().ok, true);
  assert.equal(ok.json().reversible, true);
  assert.match(ok.json().closes, /\d{4}$/);
  assert.equal(c.app.spaces.get(id).title, 'Lisbonne');
  // « Défaire » : le même envoi avec l'état d'avant.
  const back = await adm.json(`/admin/galeries/${id}`, { ...base, closes: day(60) });
  assert.equal(back.statusCode, 200);
  assert.equal(c.app.spaces.get(id).title, 'Lisbonne et Porto');
  // Erreur : 422 en JSON, le premier message et tous par champ ; rien n'est enregistré.
  const bad = await adm.json(`/admin/galeries/${id}`, { ...base, title: '', closes: day(60) });
  assert.equal(bad.statusCode, 422);
  assert.ok(bad.json().error && bad.json().errors.title);
  assert.equal(c.app.spaces.get(id).title, 'Lisbonne et Porto');
  // Fermeture avancée : l'accès plus long est raccourci, et la réponse le dit (pas de « Défaire »).
  const early = await adm.json(`/admin/galeries/${id}`, { ...base, closes: day(10) });
  assert.equal(early.json().reversible, false);
  assert.ok(c.app.spaces.invite(inv).expires_at <= c.app.spaces.get(id).closes_at);
  assert.equal((await adm.json(`/admin/galeries/${id}`, { ...base, closes: day(12) })).json().reversible, true, 'rien de plus à raccourcir');
  // Accès : fin et droits ; une date illisible est refusée sous le champ.
  const acc = await adm.json(`/admin/galeries/${id}/acces/${inv}`, { expires: day(9), favoris: '1', telecharger: '1' });
  assert.equal(acc.statusCode, 200);
  assert.deepEqual(c.app.spaces.invite(inv).rights, { favoris: true, telechargement: 'web' });
  assert.match(acc.json().lu, /jusqu’à/);
  const undo = await adm.json(`/admin/galeries/${id}/acces/${inv}`, { expires: day(8), favoris: '1' });
  assert.equal(undo.statusCode, 200);
  assert.deepEqual(c.app.spaces.invite(inv).rights, { favoris: true, telechargement: 'non' });
  const err = await adm.json(`/admin/galeries/${id}/acces/${inv}`, { expires: 'xx', favoris: '1' });
  assert.equal(err.statusCode, 422);
  assert.ok(err.json().errors.expires);
  // L'ordre des photos : JSON, puis le geste inverse.
  const items = c.db.prepare('SELECT id FROM space_items WHERE space_id = ? ORDER BY position, id').pluck().all(id);
  const order = () => c.db.prepare('SELECT id FROM space_items WHERE space_id = ? ORDER BY position, id').pluck().all(id);
  assert.equal((await adm.json(`/admin/galeries/${id}/photos/${items[1]}/monter`)).json().ok, true);
  assert.deepEqual(order().slice(0, 2), [items[1], items[0]]);
  await adm.json(`/admin/galeries/${id}/photos/${items[1]}/descendre`);
  assert.deepEqual(order(), items);
  // CSRF : sans jeton et avec un faux, rien ne change.
  for (const tok of [null, 'faux']) {
    assert.equal((await adm.json(`/admin/galeries/${id}`, { ...base, title: 'Pirate', closes: day(60) }, { token: tok })).statusCode, 403);
    assert.equal((await adm.json(`/admin/galeries/${id}/acces/${inv}`, { expires: day(5) }, { token: tok })).statusCode, 403);
  }
  assert.equal(c.app.spaces.get(id).title, 'Lisbonne et Porto');
  // Portée : le photographe de l'autre n'y touche pas (introuvable), signalé hors portée.
  const seb = await c.account('seb', { roles: ['photographe'], author: 'sebastien' });
  assert.equal((await seb.json(`/admin/galeries/${id}`, { ...base, title: 'Volé', closes: day(60) })).statusCode, 404);
  assert.equal((await seb.json(`/admin/galeries/${id}/acces/${inv}`, { expires: day(2) })).statusCode, 404);
  assert.equal(c.app.spaces.get(id).title, 'Lisbonne et Porto');
  assert.ok((await c.security()).some(e => e.type === 'authz_fail' && e.detail.raison === 'hors portée' && e.detail.objet === 'galerie' && e.detail.ecriture === true));
  // Vérification d'identité : les écritures en JSON sont arrêtées (403 avec l'adresse de vérification).
  c.app.decisions.accept(signe({ usage: 'site', version: Date.now(), emis_a: Date.now(), blocages: [], sessions: [], comptes: [], gels: [], verrouillage: null, verifications: [{ sub: 'adm', depuis: Date.now() - 1000, fin: Date.now() + 864e5 }] }));
  const stopped = await adm.json(`/admin/galeries/${id}`, { ...base, title: 'Trop tard', closes: day(60) });
  assert.equal(stopped.statusCode, 403);
  assert.match(stopped.json().verifier, /^\/auth\/verifier\?next=/);
  assert.equal(c.app.spaces.get(id).title, 'Lisbonne et Porto');
});

test('la liste des galeries au format des autres listes v2 ; la v1 garde la sienne ; Sur le terrain et les cartes d’accord en v2, la v1 inchangée', async t => {
  const c = await site(t);
  const v1 = await c.account('v1', { version: 'v1' });
  const v2 = await c.account('v2');
  const id = await gallery(c, v2);
  const { inv } = await newAccess(v2, id);
  c.db.prepare('UPDATE space_invites SET selection_sent_at = ? WHERE id = ?').run(Date.now(), inv);
  const l1 = (await v1.get('/admin/galeries')).body, l2 = (await v2.get('/admin/galeries')).body;
  assert.ok(!isV2(l1) && l1.includes('<div class="tablewrap liste-wrap"><table class="liste-a">'));
  assert.ok(isV2(l2));
  assert.match(l2, /<table class="liste-a galeries-liste">/);
  assert.doesNotMatch(l2, /tablewrap/);
  assert.match(l2, /<caption>/);
  assert.match(l2, /<span class="chip-st chip-st--abouti"><svg/, 'filtres à symbole');
  assert.match(l2, /class="etat etat--attention"><svg[^]*?Sélection envoyée/, 'le signal en pastille à symbole, avec ses mots');
  assert.doesNotMatch(l2, /class="att"/);
  assert.match(l2, /class="gal-bande"|gal-bande/);
  assert.match(l2, /1 à regarder/);
  assert.equal((l2.match(/<h1[\s>]/g) || []).length, 1);
  // Sur le terrain, les cartes : v2 pour la v2, v1 (mise en page v1, script de la v1) pour la v1.
  for (const url of ['/admin/terrain', '/admin/rencontres/cartes']) {
    const a = await v1.get(url), b = await v2.get(url);
    assert.equal(a.statusCode, 200, url);
    assert.ok(!isV2(a.body) && a.body.includes('<p class="grp" id="nav-work">'), `${url} : la v1`);
    assert.doesNotMatch(a.body, /\/static\/admin\/v2\//, url);
    assert.equal(b.statusCode, 200, url);
    assert.ok(isV2(b.body), `${url} : la v2`);
    assert.doesNotMatch(b.body, /Écran pas encore en v2/);
    assert.equal(b.headers['cache-control'], 'no-store', url);
    assert.doesNotMatch(b.body, /\sstyle="|\son[a-z]+="/, url);
    assert.equal((b.body.match(/<h1[\s>]/g) || []).length, 1, url);
  }
  const t2 = (await v2.get('/admin/terrain')).body;
  assert.match(t2, /Avant de partir/);
  assert.match(t2, /class="etat etat--(abouti|attention|afaire)"/, 'états à symbole');
  assert.match(t2, /href="\/admin\/rencontres\/cartes"/);
  assert.match(t2, /href="\/admin\/aide#rencontres-sur-le-terrain"/);
  // La portée : le photographe lié ne voit que son QR (autre photographe : pas de chips) ; un relecteur : 403.
  const own = (await (await c.account('jul', { roles: ['photographe'], author: 'julien' })).get('/admin/terrain')).body;
  assert.doesNotMatch(own, /<nav class="chips" aria-label="Photographe">/);
  const rel = await c.account('rel', { roles: ['relecteur'] });
  assert.equal((await rel.get('/admin/terrain')).statusCode, 403);
  assert.equal((await rel.get('/admin/rencontres/cartes')).statusCode, 403);
  // Cartes : mêmes champs et même route que la v1 ; une plage invalide revient en 422 avec l'erreur sous le champ ; CSRF.
  const form = (await v2.get('/admin/rencontres/cartes')).body;
  assert.match(form, /<form class="panel form cartes-form" method="post" action="\/admin\/rencontres\/cartes"/);
  for (const name of ['author_id', 'mode', 'from', 'count']) assert.match(form, new RegExp(`name="${name}"`), name);
  const aid = String(c.authorId('julien'));
  const bad = await v2.post('/admin/rencontres/cartes', { author_id: aid, mode: 'numerotees', from: '0', count: '3' });
  assert.equal(bad.statusCode, 422);
  assert.match(bad.body, /aria-invalid="true" aria-describedby="cartes-from-err"/);
  assert.match(bad.body, /id="cartes-from-err"/);
  assert.equal((await v2.post('/admin/rencontres/cartes', { author_id: aid, mode: 'generiques', count: '3' }, { token: 'faux' })).statusCode, 403);
  const next = await v2.post('/admin/rencontres/cartes', { author_id: aid, mode: 'generiques', count: '3' });
  assert.equal(next.statusCode, 303);
  assert.match(next.headers.location, /^\/admin\/rencontres\/cartes\/planche\?/);
  // Lectures : ni l'un ni l'autre n'est une lecture sensible (la v1 non plus) ; aucune donnée personnelle.
  assert.ok(!(await c.security()).some(e => e.type === 'sensitive_read'));
});

test('Journal : la cible nommée (voyage, série) et les actions groupées détaillées ; jamais un nom de personne ni un titre de rencontre ; la Vigie n’y lit rien de nouveau', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const before = (await c.security()).length;
  // Un voyage et une série : le titre est noté à l'écriture, y compris avant sa suppression.
  const tid = c.app.trips.create({ name: 'Lisbonne' }).id ?? c.db.prepare('SELECT id FROM trips ORDER BY id DESC LIMIT 1').pluck().get();
  assert.equal((await adm.json(`/admin/voyages/${tid}`, { intro: 'Trois jours.' })).statusCode, 200);
  assert.equal((await adm.post(`/admin/voyages/${tid}/supprimer`)).statusCode, 303);
  const lines = c.audits('POST /admin/voyages/:id');
  assert.equal(lines.at(0).detail, 'champs : intro ; nom : Lisbonne');
  const del = c.audits('POST /admin/voyages/:id/supprimer').at(-1);
  assert.equal(del.detail, 'nom : Lisbonne');
  // Une action groupée : ce qu'elle a fait et combien.
  const ids = c.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 3").pluck().all();
  const r = await adm.json('/admin/photos/actions', { action: 'draft', ids });
  assert.equal(r.statusCode, 200, r.body);
  const r2 = await adm.json('/admin/photos/actions', { action: 'publish', ids });
  assert.equal(r2.statusCode, 200, r2.body);
  const lots = c.audits('POST /admin/photos/actions').map(x => x.detail);
  assert.deepEqual(lots, ['lot : repassees 3', 'lot : publiees 3']);
  // La page : « Voyage « Lisbonne » », « Publiées : 3 photos » ; la v1, elle, ne montre ni « lot : » ni « nom : ».
  const page = (await adm.get('/admin/journal')).body;
  assert.match(page, /Publiées : 3 photos/);
  assert.match(page, /Repassées en brouillon : 3 photos/);
  assert.doesNotMatch(page, /lot : publiees|nom : Lisbonne/);
  const v1 = await c.account('v1', { version: 'v1' });
  const old = (await v1.get('/admin/journal')).body;
  assert.doesNotMatch(old, /lot : |nom : /);
  assert.ok(old.includes('<form class="filters" method="get" action="/admin/journal"'));
  // Les libellés et les verbes sont traduits.
  for (const v of JOURNAL.LOTS) assert.ok(JOURNAL.LOT_LIBELLES[v], v);
  // Aucune donnée personnelle : le titre d'une rencontre, le nom d'une personne n'entrent pas dans le journal.
  c.app.encounters.saveCard(null, { ref: 'S-0101', met_on: '2025-10-12', author_id: c.authorId('sebastien'), name: 'Inès Marchand', email: 'ines@exemple.fr' });
  const pid = c.db.prepare('SELECT person_id FROM encounters ORDER BY id DESC LIMIT 1').pluck().get();
  const eid = c.db.prepare('SELECT id FROM encounters ORDER BY id DESC LIMIT 1').pluck().get();
  await adm.get(`/admin/rencontres/${eid}`);
  await adm.post(`/admin/rencontres/${eid}/statut`, { status: 'traitee' });
  await adm.post(`/admin/personnes/${pid}/effacer`);
  const all = JSON.stringify(c.db.prepare('SELECT * FROM audit_log').all());
  assert.doesNotMatch(all, /Inès|Marchand|ines@/);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM audit_log WHERE detail LIKE '%nom : %' AND action NOT LIKE 'POST /admin/voyages/%' AND action NOT LIKE 'POST /admin/series/%'").pluck().get(), 0, 'le titre n’est noté que pour un voyage ou une série');
  // La Vigie ne lit pas le journal : mêmes émissions qu'avant (aucune n'est née des lignes de détail).
  const kinds = new Set((await c.security()).slice(before).map(e => e.type));
  assert.ok(![...kinds].some(k => /audit|journal/i.test(k)));
  // extraire() lit ce que detailDe() écrit, un titre avec « ; » compris.
  const d = JOURNAL.detailDe({ champs: 'a, b', lot: { verbe: 'publiees', n: 5 }, nom: 'Lis ; bonne' });
  assert.deepEqual(JOURNAL.extraire(d), { reste: 'champs : a, b', lot: { verbe: 'publiees', n: 5 }, nom: 'Lis ; bonne' });
  assert.deepEqual(JOURNAL.extraire('champs : title'), { reste: 'champs : title', lot: null, nom: '' });
  assert.equal(JOURNAL.nomPropre('  Un\u0000 titre\n très long '.padEnd(200, 'x')).length, 80);
  assert.deepEqual(JOURNAL.cible('POST /admin/voyages/:id', '3', 'Lisbonne'), { kind: 'Voyage « {nom} »', id: '3', nom: 'Lisbonne', href: '/admin/voyages/3' });
  assert.deepEqual(JOURNAL.cible('POST /admin/rencontres/:id', '12', 'Inès'), { kind: 'Rencontre n° {id}', id: '12', href: '/admin/rencontres/12' }, 'une rencontre : le numéro seul');
  assert.equal(JOURNAL.cible('POST /admin/voyages/:id/supprimer', '3', 'Lisbonne').href, null);
});

test('aide : un chapitre par page (v2), renvoi vers la page entière en v1, chapitres réservés et inconnus introuvables, panneau contextuel (données du script), lecture seule', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const v1 = await c.account('v1', { version: 'v1' });
  const full = (await adm.get('/admin/aide')).body;
  const one = await adm.get('/admin/aide/rencontres');
  assert.equal(one.statusCode, 200);
  assert.ok(isV2(one.body));
  assert.equal((one.body.match(/<section class="panel aide-section/g) || []).length, 1, 'un seul chapitre');
  assert.equal((one.body.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(one.body, /<h1>Rencontres<\/h1>/);
  assert.match(one.body, /aria-current="page">Rencontres<\/a>/);
  assert.match(one.body, /rel="prev"[^>]*>Chapitre précédent : /);
  // Les ancres du chapitre sont celles de la page entière.
  const ids = html => [...html.matchAll(/<h[234] id="(rencontres-[^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids(one.body), ids(full));
  assert.ok(ids(one.body).includes('rencontres-sur-le-terrain'));
  // Le panneau : la liste des chapitres lisibles est donnée au script (jamais un nom de fichier venu de la requête).
  const data = JSON.parse(/<script type="application\/json" id="v2-textes">([^]*?)<\/script>/.exec(one.body)[1]);
  assert.ok(data.aide.includes('rencontres') && data.aide.includes('premiers-pas'));
  assert.equal(JSON.stringify(data.t).includes('Ouvrir le chapitre'), true);
  // v1 : renvoyé à la page entière, à l'ancre du chapitre ; aucune nouveauté.
  const r = await v1.get('/admin/aide/rencontres');
  assert.equal(r.statusCode, 303);
  assert.equal(r.headers.location, '/admin/aide#rencontres');
  // Introuvables : un chapitre inconnu, un chemin de fichier, un chapitre réservé à qui n'a pas le droit.
  for (const bad of ['inconnu', '..%2F..%2Fpackage', '01-premiers-pas', 'PREMIERS-PAS']) assert.equal((await adm.get(`/admin/aide/${bad}`)).statusCode, 404, bad);
  const rel = await c.account('rel', { roles: ['relecteur'] });
  assert.equal((await rel.get('/admin/aide/premiers-pas')).statusCode, 200);
  assert.equal((await rel.get('/admin/aide/instagram')).statusCode, 404, 'chapitre réservé');
  assert.ok(!JSON.parse(/<script type="application\/json" id="v2-textes">([^]*?)<\/script>/.exec((await rel.get('/admin')).body)[1]).aide.includes('instagram'));
  // Lecture seule, derrière la connexion : une écriture n'existe pas ; sans session, pas d'aide.
  assert.equal((await adm.post('/admin/aide/rencontres')).statusCode, 404);
  const anon = await c.app.inject({ url: '/admin/aide/rencontres', headers: { accept: 'text/html' } });
  assert.notEqual(anon.statusCode, 200);
  assert.doesNotMatch(anon.body, /aide-section/);
  // Les lectures de l'aide ne sont pas des lectures sensibles.
  assert.ok(!(await c.security()).some(e => e.type === 'sensitive_read'));
});

test('page refusée (403) dans la mise en page de l’admin v2 : menu, bandeaux de la Vigie, no-store, signalée une fois ; v1 et JSON comme avant', async t => {
  const c = await site(t);
  c.app.decisions.acceptSummary(signe({ usage: 'resume', emis_a: Date.now(), ouvertes: { critique: 1, haut: 0, moyen: 0, bas: 0 }, plus_grave: { id: 7, gravite: 'critique', depuis: Date.now() - 60e3 }, critique_a_prendre: true }));
  const ph2 = await c.account('ph2', { roles: ['photographe'], author: 'julien' });
  const ph1 = await c.account('ph1', { roles: ['photographe'], author: 'sebastien', version: 'v1' });
  const r = await ph2.get('/admin/comptes');
  assert.equal(r.statusCode, 403);
  assert.ok(isV2(r.body));
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.match(r.body, /<h1>Accès refusé<\/h1>/);
  assert.match(r.body, /Votre rôle : Photographe\./);
  assert.match(r.body, /href="\/admin" aria-current|<a class="btn" href="\/admin">Revenir à Aujourd’hui<\/a>/);
  assert.doesNotMatch(r.body, /class="sec-bandeau"/, 'sans securite.voir, pas de bandeau');
  assert.equal((r.body.match(/<h1[\s>]/g) || []).length, 1);
  // v1 : la page du site, comme avant ; en JSON : l'erreur seule.
  const o = await ph1.get('/admin/comptes');
  assert.equal(o.statusCode, 403);
  assert.ok(!isV2(o.body));
  assert.match(o.body, /Revenir à l’administration/);
  const j = await ph2.get('/admin/comptes', { accept: 'application/json' });
  assert.equal(j.statusCode, 403);
  assert.deepEqual(j.json(), { error: 'Accès refusé : ce compte n’a pas ce droit.' });
  // L'administrateur qui a securite.voir voit les bandeaux sur une page refusée (un droit retiré par le rôle d'un relecteur).
  const refus = (await c.security()).filter(e => e.type === 'authz_fail' && e.detail.raison === 'permission');
  assert.equal(refus.length, 3, 'un signalement par refus, ni plus ni moins');
});

test('Vigie sur les écrans touchés : entrée « Sécurité », badge, bandeau critique ; bandeau d’identité sur chacun', async t => {
  const c = await site(t);
  const adm = await c.account('adm');
  const id = await gallery(c, adm);
  const { inv } = await newAccess(adm, id);
  const p = await billet(c, { title: 'Brume', authors: ['julien'], publish: false });
  const URLS = ['/admin/terrain', '/admin/rencontres/cartes', '/admin/galeries', `/admin/galeries/${id}/reglages`, `/admin/galeries/${id}/acces/${inv}`, `/admin/galeries/${id}/photos`, `/admin/carnet/${p.id}`, '/admin/aide/rencontres', '/admin/journal'];
  c.app.decisions.acceptSummary(signe({ usage: 'resume', emis_a: Date.now(), ouvertes: { critique: 1, haut: 0, moyen: 0, bas: 0 }, plus_grave: { id: 7, gravite: 'critique', depuis: Date.now() - 60e3 }, critique_a_prendre: true }));
  for (const url of URLS) {
    const html = (await adm.get(url)).body;
    assert.ok(isV2(html), url);
    assert.match(html, /<a class="nav-sec" href="[^"]+" target="_blank" rel="noopener noreferrer">[^]*?Sécurité<span class="sr-only"> \(nouvel onglet\)<\/span>[^]*?<span class="nav-badge/, url);
    assert.match(html, /<div class="sec-bandeau" role="alert">/, url);
    assert.doesNotMatch(html, /sec-bandeau identite/, url);
  }
  // Un compte sans securite.voir : ni entrée ni bandeau sur ces écrans.
  const ph = await c.account('ph', { roles: ['photographe'], author: 'sebastien' });
  for (const url of ['/admin/terrain', '/admin/rencontres/cartes', '/admin/galeries', '/admin/aide/rencontres']) assert.doesNotMatch((await ph.get(url)).body, /class="nav-sec"|class="sec-bandeau"/, url);
  c.app.decisions.accept(signe({ usage: 'site', version: Date.now(), emis_a: Date.now(), blocages: [], sessions: [], comptes: [], gels: [], verrouillage: null, verifications: [{ sub: 'adm', depuis: Date.now() - 1000, fin: Date.now() + 864e5 }] }));
  for (const url of URLS) assert.match((await adm.get(url)).body, /<div class="sec-bandeau identite" role="status">[^]*?href="\/auth\/verifier\?next=/, url);
  // Pendant la vérification : les écritures (dialogue de la page comprise) sont arrêtées, rien n'est révoqué.
  assert.equal((await adm.post(`/admin/galeries/${id}/acces/${inv}/revoquer`)).statusCode, 303);
  assert.equal(c.app.spaces.invite(inv).revoked_at, null, 'rien de révoqué');
  assert.equal((await adm.post('/admin/rencontres/cartes', { author_id: String(c.authorId('julien')), mode: 'generiques', count: '2' })).statusCode, 303);
  assert.match((await adm.post('/admin/rencontres/cartes', { author_id: String(c.authorId('julien')), mode: 'generiques', count: '2' })).headers.location, /^\/auth\/verifier\?next=/);
});
