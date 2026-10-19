import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { dictionary } from '../server/admin-i18n.js';
import * as J from '../server/journal-libelles.js';

// Admin v2, vague 4 « suivi et aide » : Journal, Statistiques, Signalements des visiteurs, Circuit de publication, Aide,
// Nouveautés (et la fenêtre « Nouveau depuis votre dernière visite »). Mêmes données, mêmes droits, mêmes routes que la
// v1 ; un compte en v1 voit la v1 ; lectures sensibles, déchiffrements et émissions de la Vigie identiques ; CSRF ;
// Circuit au geste (JSON) avec les mêmes tickets et le même journal qu'en v1 ; un libellé pour chaque action du journal ;
// entrée « Sécurité », badge, bandeau critique et bandeau d'identité sur les six écrans.
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const DATA_KEY = 'cle-des-donnees-personnelles-0123456789abcdef';
const isV2 = html => html.includes('/static/admin/v2/v2.css');
const plain = r => Object.defineProperty(r, 'body', { value: r.body.replace(/[  ]/g, ' ') });
const signe = obj => { const p = JSON.stringify(obj); return { payload: p, signature: crypto.sign(null, Buffer.from(p), VIGIE_KEYS.privateKey).toString('base64') }; };

// Déchiffrements : comptés à la source (vault.js déchiffre par crypto.createDecipheriv d'AES-256-GCM).
let decrypts = 0;
const realDecipher = crypto.createDecipheriv;
crypto.createDecipheriv = function (...args) { if (args[0] === 'aes-256-gcm') decrypts++; return realDecipher.apply(this, args); };

async function site(t, opts = {}) {
  const received = [];
  const ctx = await setup(t, { seeded: true, env: { ...VIGIE, DATA_KEY }, vigieOptions: { send: async body => { received.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false }, ...opts });
  const security = async () => { ctx.app.securite.runTasks(); ctx.app.securite.retryNow(); await ctx.app.securite.flush(); return received; };
  const store = createSessionStore(ctx.db);
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const account = async (sub, { roles = ['admin'], author = null, version = 'v2', seen = true } = {}) => {
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
    if (seen) await get('/admin/nouveautes');                                   // fenêtre « Nouveautés » déjà vue
    return a;
  };
  // Deux signalements (message et adresse chiffrés), un photographe pour le circuit.
  const photos = ctx.db.prepare('SELECT id, title FROM photos ORDER BY id LIMIT 2').all();
  const r1 = ctx.app.feedback.report(photos[0].id, { kind: 'inapproprie', message: 'Je me reconnais, merci de retirer', email: 'visiteur@exemple.fr' }, { lang: 'fr' });
  const r2 = ctx.app.feedback.report(photos[1].id, { kind: 'texte', message: 'Caption says Porto, it is Lisbon' }, { lang: 'en' });
  ctx.app.accounts.ensure({ sub: 'lea', name: 'Léa', roles: ['photographe'] });
  const lea = ctx.app.accounts.bySub('lea').id;
  ctx.app.accounts.ensure({ sub: 'max', name: 'Max', roles: ['photographe'] });
  const max = ctx.app.accounts.bySub('max').id;
  const audits = action => ctx.db.prepare('SELECT action, target, detail, status FROM audit_log WHERE action = ? ORDER BY id').all(action);
  return { ...ctx, security, account, seb, photos, r1, r2, lea, max, audits, PERSONAL: ['Je me reconnais, merci de retirer', 'visiteur@exemple.fr', 'Caption says Porto, it is Lisbon'] };
}

// Les écrans de la vague, leur adresse et leur repère dans le gabarit v1 (views/admin/<écran>.eta), absent de la v2.
const SCREENS = { journal: '/admin/journal', stats: '/admin/statistiques', reports: '/admin/signalements', circuit: '/admin/circuit', help: '/admin/aide', releases: '/admin/nouveautes' };
const V1_MARKS = { journal: '<form class="filters" method="get" action="/admin/journal"', stats: '<div class="stats-grid">', reports: '<ul class="reports">', circuit: '<ul class="accounts">', help: '<div class="help">', releases: '<ol class="releases">' };

test('v2 et repli : un compte en v1 voit la v1 de ces six écrans (gabarit, mise en page, script), un compte en v2 la v2', async t => {
  const read = f => fs.readFileSync(new URL(`../views/admin/${f}`, import.meta.url), 'utf8');
  const v2Views = fs.readdirSync(new URL('../views/admin/v2/', import.meta.url)).filter(f => f.endsWith('.eta')).map(f => read(`v2/${f}`));
  const c = await site(t);
  const v1 = await c.account('compte-v1', { version: 'v1' });
  const v2 = await c.account('compte-v2');
  for (const [screen, url] of Object.entries(SCREENS)) {
    assert.ok(read(`${screen}.eta`).includes(V1_MARKS[screen]), `${screen} : repère du gabarit v1`);
    assert.ok(!v2Views.some(v => v.includes(V1_MARKS[screen])), `${screen} : repère partagé avec un gabarit v2`);
    const a = await v1.get(url), b = await v2.get(url);
    assert.equal(a.statusCode, 200, url);
    assert.equal(b.statusCode, 200, url);
    assert.ok(!isV2(a.body), `${url} : la v1 pour le compte en v1`);
    assert.ok(a.body.includes(V1_MARKS[screen]), `${url} : le gabarit v1`);
    assert.match(a.body, /<script src="\/static\/admin\/admin\.js[?"]/, `${url} : le script de la v1`);
    assert.doesNotMatch(a.body, /\/static\/admin\/v2\//, `${url} : rien de la v2 en v1`);
    assert.ok(isV2(b.body), `${url} : la v2`);
    assert.ok(!b.body.includes(V1_MARKS[screen]), `${url} : pas le gabarit v1 en v2`);
    assert.match(b.body, /\/static\/admin\/v2\/suivi-v2\.css/, url);
    assert.doesNotMatch(b.body, /class="ver-note"/, url);
    if (screen !== 'help') assert.match(b.body, /<p class="help-link"><a href="\/admin\/aide#[^"]+">Aide sur cette page<\/a><\/p>/, url);
    assert.equal(b.headers['cache-control'], 'no-store', url);
    assert.doesNotMatch(b.body, /\sstyle="/, `${url} : aucun style en ligne`);
    assert.doesNotMatch(b.body, /<script(?![^>]*(?:\bsrc=|type="application\/json"))[^>]*>/, `${url} : aucun script en ligne`);
    assert.doesNotMatch(b.body, /\son[a-z]+="/, `${url} : aucun gestionnaire en ligne`);
    assert.equal((b.body.match(/<h1[ >]/g) || []).length, 1, `${url} : un seul h1`);
  }
  // Les ancres de l'aide « Aide sur cette page » de ces écrans existent dans l'aide.
  const aide = (await v2.get('/admin/aide')).body;
  for (const url of Object.values(SCREENS).filter(u => u !== '/admin/aide')) {
    const anchor = /<p class="help-link"><a href="\/admin\/aide#([^"]+)"/.exec((await v2.get(url)).body)[1];
    assert.match(aide, new RegExp(`id="${anchor}"`), `${url} → #${anchor}`);
  }
  // L'aide v2 garde les ancres de la v1 (les liens de l'admin ne changent pas).
  const ids = html => [...html.matchAll(/<(?:section|h3|h4)[^>]* id="([^"]+)"/g)].map(m => m[1]).sort();
  assert.deepEqual(ids(aide), ids((await v1.get('/admin/aide')).body));
});

test('droits : mêmes permissions qu’en v1, en page et en écriture ; le menu ne montre que les pages permises', async t => {
  const c = await site(t);
  const ph = await c.account('ph', { roles: ['photographe'], author: c.seb });
  const mod = await c.account('mod', { roles: ['moderateur'] });
  const rel = await c.account('rel', { roles: ['relecteur'] });
  const exp = { ph: { journal: 403, stats: 200, reports: 403, circuit: 403, help: 200, releases: 200 }, mod: { journal: 403, stats: 200, reports: 200, circuit: 200, help: 200, releases: 200 }, rel: { journal: 403, stats: 403, reports: 403, circuit: 403, help: 200, releases: 200 } };
  // Chaque rôle, en v1 puis en v2 : le même code de réponse.
  for (const [name, roles] of Object.entries({ ph: ['photographe'], mod: ['moderateur'], rel: ['relecteur'] })) {
    const one = await c.account(`${name}-v1`, { roles, version: 'v1', author: name === 'ph' ? c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get() : null });
    for (const url of Object.values(SCREENS)) assert.equal((await one.get(url)).statusCode, exp[name][Object.keys(SCREENS).find(k => SCREENS[k] === url)], `${name} v1 ${url}`);
  }
  for (const [name, a] of Object.entries({ ph, mod, rel })) {
    for (const [screen, url] of Object.entries(SCREENS)) assert.equal((await a.get(url)).statusCode, exp[name][screen], `${name} ${url}`);
    const home = (await a.get('/admin/aide')).body;
    assert.ok(isV2(home));
    for (const [screen, url] of Object.entries(SCREENS)) if (exp[name][screen] === 403) assert.ok(!home.includes(`href="${url}"`), `${name} : pas d’entrée ${url}`);
  }
  // Photographe : ses photos seulement ; ni la fréquentation, ni les pages, ni les pays.
  const st = (await ph.get('/admin/statistiques')).body;
  assert.ok(isV2(st));
  assert.match(st, /Vos photos : ouvertures en grand et partages\./);
  assert.doesNotMatch(st, /id="st-freq-t"|id="st-pages-t"|id="st-pays-t"/);
  // Écritures refusées hors droit, en page et en JSON.
  assert.equal((await ph.post(`/admin/circuit/${c.lea}`, { publier: '1' })).statusCode, 403);
  assert.equal((await ph.json(`/admin/circuit/${c.lea}`, { publier: '1' })).statusCode, 403);
  assert.equal((await rel.post(`/admin/signalements/${c.r1}/traite`)).statusCode, 403);
  assert.equal(c.app.accounts.byId(c.lea).adjust.add.length, 0);
  // Modérateur : il traite les signalements et règle le circuit, mais ne voit jamais l'adresse laissée.
  const rp = (await mod.get('/admin/signalements')).body;
  assert.match(rp, /Je me reconnais, merci de retirer/);
  assert.doesNotMatch(rp, /visiteur@exemple\.fr/);
  assert.match(rp, /Adresse laissée pour une réponse : seul un administrateur la voit\./);
  assert.equal((await mod.json(`/admin/circuit/${c.lea}`, { modifier: '1' })).statusCode, 200);
});

test('signalements v2 : mêmes lectures, mêmes déchiffrements et rien de personnel en plus ; filtres ; traiter ; supprimer par un dialogue ; CSRF', async t => {
  const c = await site(t);
  const v1 = await c.account('adm-v1', { version: 'v1' });
  const v2 = await c.account('adm-v2');
  const seen = await c.security();
  const step = async (a, url) => {
    await c.security();
    const before = seen.length, d0 = decrypts;
    const res = await a.get(url);
    const after = await c.security();
    const events = after.slice(before).filter(e => !e.type.startsWith('sys_') && !['authn_login_success', 'config_public_changed'].includes(e.type)).map(e => ({ type: e.type, detail: e.detail }));
    return { res, events, decrypts: decrypts - d0 };
  };
  for (const url of ['/admin/signalements', '/admin/signalements?etat=nouveau', '/admin/signalements?etat=traite']) {
    const a = await step(v1, '/admin/signalements'), b = await step(v2, url);
    assert.ok(isV2(b.res.body) && !isV2(a.res.body), url);
    assert.deepEqual(b.events, a.events, `${url} : mêmes émissions`);
    assert.deepEqual(b.events, [], `${url} : aucune lecture sensible notée (comme en v1)`);
    assert.equal(b.decrypts, a.decrypts, `${url} : mêmes déchiffrements`);
    if (url === '/admin/signalements') for (const v of c.PERSONAL) assert.equal(b.res.body.includes(v), a.res.body.includes(v), `« ${v} »`);
  }
  assert.match(c.db.prepare('SELECT email FROM photo_reports WHERE id = ?').pluck().get(c.r1), /^enc1:/);
  // La v2 : la photo nommée, le message dans sa langue, la réponse, un dialogue de suppression par signalement.
  const html = (await v2.get('/admin/signalements')).body;
  assert.match(html, new RegExp(`<a class="ligne-lien" href="/admin/photos/${c.photos[0].id}">Photo « ${c.photos[0].title} »</a>`));
  assert.match(html, /<blockquote class="sg-msg" lang="en"><p>Caption says Porto, it is Lisbon<\/p><\/blockquote>/);
  assert.match(html, /href="mailto:visiteur@exemple\.fr">[^]*?Répondre à visiteur@exemple\.fr/);
  for (const id of [c.r1, c.r2]) assert.match(html, new RegExp(`<dialog class="confirm cible" id="dlg-sg-${id}"[^]*?action="/admin/signalements/${id}/supprimer"[^]*?<a class="btn ghost" href="#sg-${id}" data-annuler>Annuler</a><button class="btn danger" type="submit">`));
  assert.match(html, new RegExp(`href="#dlg-sg-${c.r1}" data-ouvre="dlg-sg-${c.r1}">Supprimer…</a>`));
  // CSRF, puis traiter et supprimer par les routes de la v1.
  assert.equal((await v2.post(`/admin/signalements/${c.r1}/traite`, {}, { token: null })).statusCode, 403);
  assert.equal((await v2.post(`/admin/signalements/${c.r2}/supprimer`, {}, { token: 'faux' })).statusCode, 403);
  const tr = await v2.post(`/admin/signalements/${c.r1}/traite`);
  assert.deepEqual([tr.statusCode, tr.headers.location], [303, '/admin/signalements']);
  const filt = (await v2.get('/admin/signalements?etat=traite')).body;
  assert.match(filt, /aria-current="page"><span class="chip-st chip-st--abouti">[^]*?Traités <span class="chip-n">1<\/span>/);
  assert.ok(filt.includes(`id="sg-${c.r1}"`) && !filt.includes(`id="sg-${c.r2}"`));
  assert.equal((await v2.post(`/admin/signalements/${c.r2}/supprimer`)).statusCode, 303);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM photo_reports WHERE id = ?').pluck().get(c.r2), 0);
  assert.deepEqual(c.audits('POST /admin/signalements/:id/traite').map(x => [x.target, x.status]), [[String(c.r1), 403], [String(c.r1), 303]]);
});

test('circuit v2 : au geste en JSON par la route de la v1, « Défaire » ; mêmes tickets, mêmes émissions et même journal qu’en v1 ; CSRF', async t => {
  const c = await site(t);
  const v1 = await c.account('adm-v1', { version: 'v1' });
  const v2 = await c.account('adm-v2');
  const html = (await v2.get('/admin/circuit')).body;
  assert.match(html, new RegExp(`<form method="post" action="/admin/circuit/${c.lea}" data-circuit data-nom="Léa">`));
  for (const n of ['publier', 'modifier', 'instagram']) assert.match(html, new RegExp(`<input type="checkbox" role="switch" name="${n}" value="1"[^>]*aria-labelledby="ci-${c.lea}-${n}-t" aria-describedby="ci-${c.lea}-${n}-e">`), n);
  assert.match(html, /<p class="sans-script form-pied"><button class="btn" type="submit">Enregistrer « Léa »<\/button><\/p>/);
  assert.match(html, /\/static\/admin\/v2\/suivi-v2\.js/);
  // CSRF : sans jeton, faux jeton, en formulaire et en JSON.
  assert.equal((await v2.post(`/admin/circuit/${c.lea}`, { publier: '1' }, { token: null })).statusCode, 403);
  assert.equal((await v2.json(`/admin/circuit/${c.lea}`, { publier: '1' }, { token: null })).statusCode, 403);
  assert.equal((await v2.json(`/admin/circuit/${c.lea}`, { publier: '1' }, { token: 'faux' })).statusCode, 403);
  assert.equal(c.app.accounts.byId(c.lea).adjust.add.length, 0);
  // Un même scénario (publier sans validation, puis le défaire) depuis la v1 (formulaire) et depuis la v2 (JSON).
  const norm = e => ({ type: e.type, severity: e.severity, emetteur: e.origine?.emetteur, detail: { ...e.detail, compte: undefined } });
  const tables = () => ({ changes: c.db.prepare('SELECT COUNT(*) FROM account_changes').pluck().get(), tickets: c.db.prepare('SELECT COUNT(*) FROM account_change_tickets').pluck().get() });
  // (Deux photographes neufs, l'un réglé depuis la v1, l'autre depuis la v2 : le même état de départ.)
  const run = async (id, send) => {
    const start = (await c.security()).length, t0 = tables(), a0 = c.audits('circuit réglé').length;
    await send(id, { publier: '1', modifier: '1' });
    const mid = c.app.accounts.byId(id).adjust;
    await send(id, { modifier: '1' });
    const t1 = tables();
    const events = (await c.security()).slice(start).filter(e => !e.type.startsWith('sys_') && e.type !== 'authn_login_success').map(norm);
    return { mid, end: c.app.accounts.byId(id).adjust, events, tables: { changes: t1.changes - t0.changes, tickets: t1.tickets - t0.tickets }, audit: c.audits('circuit réglé').slice(a0).map(x => x.detail) };
  };
  const a = await run(c.lea, async (id, body) => { const r = await v1.post(`/admin/circuit/${id}`, body); assert.equal(r.statusCode, 303); });
  const b = await run(c.max, async (id, body) => {
    const r = await v2.json(`/admin/circuit/${id}`, body);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json().circuit, { publier: body.publier === '1', modifier: true, instagram: false });
    assert.equal(r.json().message, 'Réglages de Max enregistrés.');
  });
  assert.deepEqual(a.mid.add, ['photos.publier']);
  assert.deepEqual(b.mid, a.mid);
  assert.deepEqual(b.end, a.end);
  assert.deepEqual(b.tables, a.tables);
  assert.ok(b.tables.tickets > 0, 'des tickets, comme en v1');
  assert.deepEqual(b.events, a.events, 'mêmes émissions vers la Vigie');
  assert.deepEqual(b.audit, a.audit, 'même journal « circuit réglé »');
  assert.deepEqual(b.audit, ['publier sans validation : oui ; modifier ses photos publiées : oui ; Instagram sans validation : non', 'publier sans validation : non ; modifier ses photos publiées : oui ; Instagram sans validation : non']);
  // Un compte qui n'est pas photographe (ou administrateur) : introuvable, comme en v1.
  const me = c.app.accounts.bySub('adm-v2').id;
  assert.equal((await v2.json(`/admin/circuit/${me}`, { publier: '1' })).statusCode, 404);
});

test('journal v2 : un libellé pour chaque action notée, traduit ; cible nommée et cliquable ; familles, période, pages ; connexions regroupées', async t => {
  // Toutes les routes d'écriture de l'admin, et les lectures notées (config.audit), ont leur libellé.
  const routes = new Set();
  for (const f of fs.readdirSync(new URL('../server/routes/', import.meta.url))) {
    const src = fs.readFileSync(new URL(`../server/routes/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/app\.(post|put|delete|patch)\('(\/admin[^']*)'/g)) routes.add(`${m[1].toUpperCase()} ${m[2]}`);
    for (const m of src.matchAll(/app\.get\('(\/admin[^']*)',\s*\{\s*config:\s*\{[^}]*audit:\s*true/g)) routes.add(`GET ${m[1]}`);
  }
  assert.ok(routes.size > 100);
  assert.deepEqual([...routes].filter(r => !J.libelle(r)), [], 'route sans libellé au journal');
  const d = dictionary();
  const keys = [...Object.values(J.LIBELLES), ...Object.values(J.FAMILLE_NOMS)];
  assert.deepEqual(keys.filter(k => !d[k]?.en || !d[k]?.de), [], 'libellé sans traduction');
  for (const r of routes) assert.ok(J.FAMILLES.includes(J.famille(r)), r);
  assert.equal(J.famille('POST /admin/comptes/:id'), 'equipe');
  assert.equal(J.famille('GET /admin/personnes/:id/export.zip'), 'lectures');
  assert.equal(J.famille('POST /admin/signalements/:id/traite'), 'personnes');
  assert.equal(J.famille('POST /admin/apparence'), 'reglages');
  assert.equal(J.famille('connexion (test)'), 'connexions');
  assert.equal(J.famille('POST /admin/photos/:id/champs'), 'publication');

  const c = await site(t);
  const v1 = await c.account('adm-v1', { version: 'v1' });
  const v2 = await c.account('adm-v2');
  await v2.post(`/admin/signalements/${c.r1}/traite`);
  await v2.json(`/admin/circuit/${c.lea}`, { publier: '1' });
  const now = Date.now();
  for (let i = 0; i < 3; i++) c.app.audit.log({ sub: 'adm-v2', name: 'adm-v2', action: 'connexion', status: null });
  c.app.audit.log({ sub: 'adm-v2', name: 'adm-v2', action: 'POST /admin/photos/:id/champs', target: String(c.photos[0].id), status: 200, detail: 'champs : title' });
  c.app.audit.log({ sub: 'adm-v2', name: 'adm-v2', action: 'POST /admin/sorties/:author/:day/lieu', target: 'sebastien / 2025-10-12', status: 422 });
  c.app.audit.log({ sub: 'adm-v2', name: 'adm-v2', action: 'POST /admin/inconnue', target: '', status: 200 });
  c.db.prepare('UPDATE audit_log SET at = ? WHERE action = ?').run(now - 40 * 864e5, 'POST /admin/inconnue');
  const html = (await v2.get('/admin/journal')).body;
  const rows = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  // Aucune adresse technique pour une action connue ; la cible nommée et cliquable ; le détail, jamais une valeur.
  assert.doesNotMatch(rows.replace(/POST \/admin\/inconnue/, ''), /POST \/admin|GET \/admin/);
  assert.match(rows, />Signalement traité</);
  assert.match(rows, />Circuit réglé</);
  assert.match(rows, new RegExp(`<a class="ligne-lien" href="/admin/photos/${c.photos[0].id}">Photo n° ${c.photos[0].id}</a>`));
  assert.match(rows, /<a class="ligne-lien" href="\/admin\/sorties\/sebastien\/2025-10-12">Sortie du 2025-10-12 \(sebastien\)<\/a>/);
  assert.match(rows, /<a class="ligne-lien" href="\/admin\/circuit">Léa<\/a>/);
  assert.match(rows, /Lieu d’une sortie enregistré[^]*?etat--arret[^]*?Refusé/);
  assert.match(rows, /<span class="sec jr-detail">champs : title<\/span>/);
  assert.match(rows, /POST \/admin\/inconnue<span class="sec">action notée telle quelle<\/span>/);
  // Trois connexions du même compte le même jour : une ligne, « 3 fois ce jour-là ».
  assert.match(rows, />Connexion <span class="jr-fois">3 fois ce jour-là<\/span>/);
  assert.equal((rows.match(/>Connexion </g) || []).length, 1);
  assert.match(html, /<table class="liste-a jr-liste">\s*<caption>/);
  // Familles et période : à l'affichage, sur les mêmes lignes ; la v1 les ignore.
  const eq = (await v2.get('/admin/journal?type=equipe')).body;
  assert.match(eq, /<a class="chip" href="\/admin\/journal\?type=equipe" aria-current="page">Comptes et droits<\/a>/);
  assert.match(eq, />Circuit réglé</);
  assert.doesNotMatch(eq.slice(eq.indexOf('<tbody>')), />Signalement traité<|>Connexion </);
  assert.match((await v2.get('/admin/journal?periode=30')).body, /<option value="30" selected>30 derniers jours<\/option>/);
  assert.doesNotMatch((await v2.get('/admin/journal?periode=30')).body, /POST \/admin\/inconnue/);
  assert.match((await v2.get('/admin/journal')).body, /POST \/admin\/inconnue/);
  assert.equal((await v2.get('/admin/journal?type=<script>&periode=x&page=-4')).statusCode, 200);
  const one = (await v1.get('/admin/journal?type=equipe')).body;
  assert.match(one, />Signalement traité</, 'la v1 ignore le filtre de type');
  // 50 lignes par page, avec « Plus anciennes » et « Plus récentes ».
  for (let i = 0; i < 60; i++) c.app.audit.log({ sub: 'adm-v2', name: 'adm-v2', action: 'POST /admin/photos/:id/champs', target: String(c.photos[1].id), status: 200 });
  const p1 = (await v2.get('/admin/journal')).body, p2 = (await v2.get('/admin/journal?page=2')).body;
  assert.equal((p1.match(/<tr>/g) || []).length - 1, 50);
  assert.match(p1, /href="\/admin\/journal\?page=2" rel="next">Plus anciennes/);
  assert.match(p2, /href="\/admin\/journal" rel="prev">[^]*?Plus récentes/);
  assert.match(p2, /Page 2 sur 2/);
  // L'heure de Paris en toutes lettres.
  assert.match(rows, /<time datetime="[^"]+">\d{1,2} [a-zéû]+\.? \d{4}, (de )?\d{1,2} h \d\d/);
});

test('Vigie sur les six écrans : entrée « Sécurité », badge, bandeau critique ; bandeau d’identité et écritures arrêtées pendant une vérification', async t => {
  const c = await site(t);
  c.app.decisions.acceptSummary(signe({ usage: 'resume', emis_a: Date.now(), ouvertes: { critique: 1, haut: 0, moyen: 0, bas: 0 }, plus_grave: { id: 7, gravite: 'critique', depuis: Date.now() - 60e3 }, critique_a_prendre: true }));
  const adm = await c.account('adm');
  for (const url of Object.values(SCREENS)) {
    const html = (await adm.get(url)).body;
    assert.ok(isV2(html), url);
    assert.match(html, /<a class="nav-sec" href="[^"]+" target="_blank" rel="noopener noreferrer">[^]*?Sécurité<span class="sr-only"> \(nouvel onglet\)<\/span>[^]*?<span class="nav-badge/, url);
    assert.match(html, /<div class="sec-bandeau" role="alert">/, url);
    assert.doesNotMatch(html, /sec-bandeau identite/, url);
  }
  // Sans securite.voir : ni entrée ni bandeau.
  const mod = await c.account('mod', { roles: ['moderateur'] });
  const m = (await mod.get('/admin/signalements')).body;
  assert.doesNotMatch(m, /class="nav-sec"|class="sec-bandeau"/);
  // Vérification d'identité : le bandeau sur chaque écran ; les écritures (formulaire et JSON) et les exports arrêtés.
  c.app.decisions.accept(signe({ usage: 'site', version: Date.now(), emis_a: Date.now(), blocages: [], sessions: [], comptes: [], gels: [], verrouillage: null, verifications: [{ sub: 'adm', depuis: Date.now() - 1000, fin: Date.now() + 864e5 }] }));
  for (const url of Object.values(SCREENS)) assert.match((await adm.get(url)).body, /<div class="sec-bandeau identite" role="status">[^]*?href="\/auth\/verifier\?next=/, url);
  const w = await adm.json(`/admin/circuit/${c.lea}`, { publier: '1' });
  assert.equal(w.statusCode, 403);
  assert.match(w.json().verifier, /^\/auth\/verifier\?next=/);
  assert.equal((await adm.post(`/admin/signalements/${c.r1}/supprimer`)).statusCode, 303);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM photo_reports WHERE id = ?').pluck().get(c.r1), 1, 'rien d’effacé');
  assert.equal(c.app.accounts.byId(c.lea).adjust.add.length, 0);
  // Un export (GET journalisé, config.audit) depuis la v2 : arrêté aussi ; une simple lecture d'écran, non.
  c.app.encounters.saveCard(null, { ref: 'S-0001', met_on: '2025-10-12', author_id: c.seb, name: 'Inès', email: 'ines@exemple.fr' });
  const pid = c.db.prepare('SELECT person_id FROM encounters ORDER BY id DESC LIMIT 1').pluck().get();
  const ex = await adm.get(`/admin/personnes/${pid}/export.zip`);
  assert.equal(ex.statusCode, 303);
  assert.match(ex.headers.location, /^\/auth\/verifier\?next=/);
  assert.equal((await adm.get('/admin/journal')).statusCode, 200);
});

test('Nouveautés v2 : la page (dix versions, puis les mois repliés, ancres gardées) ; la fenêtre « Nouveau depuis votre dernière visite » en v2, une fois', async t => {
  const c = await site(t);
  const adm = await c.account('adm', { seen: false });
  // Première page affichée : la fenêtre de la mise en page v2, une seule fois ; jamais sur la page Nouveautés.
  const first = (await adm.get('/admin/journal')).body;
  assert.ok(isV2(first));
  assert.match(first, /<dialog class="release-pop" open data-release-pop aria-labelledby="rel-pop-t">[^]*?<h2 id="rel-pop-t">Nouveau depuis votre dernière visite/);
  assert.doesNotMatch((await adm.get('/admin/journal')).body, /data-release-pop/);
  const fresh = await c.account('adm2', { seen: false });
  assert.doesNotMatch((await fresh.get('/admin/nouveautes')).body, /data-release-pop/);
  const v1 = await c.account('adm-v1', { version: 'v1', seen: false });
  const pop1 = (await v1.get('/admin/journal')).body;
  assert.ok(!isV2(pop1) && /data-release-pop/.test(pop1), 'la v1 garde sa fenêtre');
  const html = (await adm.get('/admin/nouveautes')).body;
  const all = (html.match(/<li class="(?:panel )?nv" id="v[\d.]+">/g) || []).length;
  assert.equal((html.match(/<li class="panel nv" id="v/g) || []).length, Math.min(10, all));
  assert.equal((html.match(/<li class="nv" id="v/g) || []).length, Math.max(0, all - 10));
  const v1html = (await v1.get('/admin/nouveautes')).body;
  assert.deepEqual([...html.matchAll(/id="(v[\d.]+)"/g)].map(m => m[1]), [...v1html.matchAll(/id="(v[\d.]+)"/g)].map(m => m[1]), 'mêmes versions, mêmes ancres');
  if (all > 10) assert.match(html, /<details class="panel plier-p nv-mois" data-nv-mois>/);
  assert.match(html, /etat--abouti[^]*?version installée/);
});
