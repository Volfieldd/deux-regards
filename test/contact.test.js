import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { openDb, migrate } from '../server/db/index.js';
import { createMessages, MessageError, LIMITS } from '../server/messages.js';
import { createVault } from '../server/vault.js';
import { grantsOf, SCOPES } from '../server/permissions.js';
import { TRAP_PATH } from '../server/securite/piege.js';
import os from 'node:os';
import path from 'node:path';

// Page Contact et demande de licence (PLAN point 8, maquette MQ-06 sans la vente de tirages ; registre de la Vigie,
// BV-27 à BV-30) : pages v1, v2 et v3 en trois langues, mêmes champs partout ; accroches de la Vigie (piège, autre site,
// limite, saisie malveillante une seule fois, formulaire forgé) ; données chiffrées et effacées après 12 mois ; boîte de
// l'admin (droits, portée, CSRF, lecture sensible), e-mail aux photographes sans donnée personnelle.
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const DATA_KEY = 'cle-de-donnees-de-test-0123456789abcdef';
const SLUG = 'brume-sur-la-loire';
const LANG_PREFIX = { fr: '', en: '/en', de: '/de' };

function fakeVigie() {
  const v = { events: [] };
  v.send = async (body, headers) => {
    const expected = crypto.createHmac('sha256', KEY).update(`${headers['x-vigie-ts']}.${headers['x-vigie-nonce']}.${body}`).digest('hex');
    assert.equal(headers['x-vigie-sig'], expected, 'signature du lot');
    v.events.push(...JSON.parse(body).lot);
  };
  v.of = type => v.events.filter(e => e.type === type);
  return v;
}
async function site(t, version = 'v2', { vigie = false, env = {}, mail = false } = {}) {
  const fake = fakeVigie();
  const sent = [];
  const opts = { seeded: true, env: { ...(vigie ? VIGIE : {}), ...env }, ...(vigie ? { vigieOptions: { send: fake.send, timers: false, pollDecisions: false } } : {}),
    ...(mail ? { mailTransport: { sendMail: async m => { sent.push(m); } } } : {}) };
  const c = await setup(t, opts);
  c.app.publicVersion.save(version);
  const flush = async () => { c.app.securite.runTasks(); c.app.securite.retryNow(); await c.app.securite.flush(); return fake; };
  const store = createSessionStore(c.db);
  const authorId = slug => c.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(slug);
  // Un compte de l'admin (rôles, photographe lié, version de l'admin).
  const account = async (sub, { roles = ['admin'], author = null, version: av = 'v1', email = '' } = {}) => {
    c.app.accounts.ensure({ sub, name: sub, email, roles });
    if (author) c.app.accounts.update(c.app.accounts.bySub(sub).id, { authorId: author }, 'test');
    const token = store.create({ sub, name: sub, roles: [] });
    const csrf = c.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token };
    const get = url => c.app.inject({ url, cookies, headers: { accept: 'text/html' } });
    const post = (url, payload = {}, { token: tok = csrf } = {}) => c.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, ...(tok ? { _csrf: tok } : {}) } });
    await post('/admin/version', { version: av, back: '/admin' });
    await get('/admin/nouveautes');
    return { get, post, csrf };
  };
  return { ...c, vigie: fake, flush, sent, account, authorId };
}

const attrs = s => Object.fromEntries([...s.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(m => [m[1], m[2] ?? '']));
function formOf(body, action) {
  const m = body.match(new RegExp(`<form([^>]*\\saction="${action.replace(/[/?.]/g, '\\$&')}"[^>]*)>([\\s\\S]*?)</form>`));
  assert.ok(m, `formulaire ${action}`);
  const a = attrs(m[1]);
  const fields = [...m[2].matchAll(/<(input|textarea|select)\b([^>]*)>/g)].map(([, tag, at]) => {
    const x = attrs(at);
    const type = tag === 'input' ? x.type || 'text' : tag;
    return { tag, type, name: x.name, value: x.value ?? '', checked: 'checked' in x, attrs: x };
  }).filter(f => f.name);
  const sig = [...new Set(fields.map(f => `${f.type}:${f.name}${f.type === 'radio' || f.type === 'hidden' ? `=${f.value}` : ''}${f.attrs.maxlength ? `/${f.attrs.maxlength}` : ''}`))].sort();
  return { method: a.method, novalidate: 'novalidate' in a, fields, sig, html: m[2] };
}
function payloadOf(form, values = {}) {
  const out = new URLSearchParams();
  for (const f of form.fields) {
    if (f.type === 'radio') { if (f.name in values ? values[f.name] === f.value : f.checked) out.append(f.name, f.value); continue; }
    out.append(f.name, values[f.name] ?? f.value);
  }
  for (const [k, v] of Object.entries(values)) if (!form.fields.some(f => f.name === k)) assert.fail(`champ absent de la page : ${k}`);
  return out.toString();
}
const post = (app, url, payload, { ip = '198.51.100.1', origin } = {}) => app.inject({ method: 'POST', url, payload, remoteAddress: ip,
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...(origin ? { origin } : {}) } });
const TRAP = /<div class="(?:hello-trap|piege)" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"><\/label><\/div>/;
const nb = s => s.replace(/[  ]/g, ' ');
const count = c => c.db.prepare('SELECT COUNT(*) FROM messages').pluck().get();
const CONTACT_OK = { pour: 'julien', message: 'Bonjour, une question sur une exposition.', name: 'Lucie Exemple', email: 'lucie.exemple@example.org' };
const LICENCE_OK = { usage: 'presse', message: 'Couverture d’un guide de Lisbonne.', name: 'Lucie Exemple', email: 'lucie.exemple@example.org' };

// ---------- modèle : champs et bornes ----------
test('champs et bornes : obligatoires, longueurs de la page, listes fermées, saisies forgées relevées', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'messages-'));
  const db = openDb(path.join(dir, 't.db'));
  migrate(db);
  db.prepare("INSERT INTO authors (slug, name) VALUES ('sebastien', 'Sébastien'), ('julien', 'Julien')").run();
  const authors = db.prepare('SELECT id, slug FROM authors').all();
  const m = createMessages({ db });
  const errorsOf = (kind, body, o = {}) => { try { m.submit(kind, body, { authors, ...o }); return null; } catch (e) { assert.ok(e instanceof MessageError); return e; } };
  // Vide : chaque obligatoire.
  assert.deepEqual(errorsOf('contact', {}).errors, { pour: 'pour', message: 'message', name: 'name', email: 'email_required' });
  assert.deepEqual(errorsOf('licence', {}).errors, { usage: 'usage', message: 'message', name: 'name', email: 'email_required' });
  assert.equal(errorsOf('contact', { ...CONTACT_OK, email: 'pas-une-adresse' }).errors.email, 'email');
  // Aux bornes : accepté ; un signe de plus que la page ne le permet : refusé et relevé.
  const crlf = `${'a'.repeat(999)}\r\n${'b'.repeat(1000)}`;                      // 2 000 signes pour le navigateur (CRLF = 1)
  assert.equal(errorsOf('contact', { ...CONTACT_OK, message: crlf, name: 'n'.repeat(LIMITS.name), email: `${'e'.repeat(80)}@example.org` }), null);
  const long = errorsOf('licence', { ...LICENCE_OK, message: 'm'.repeat(2001), diffusion: 'd'.repeat(301), company: 'c'.repeat(121), name: 'n'.repeat(101) });
  assert.deepEqual(long.errors, { message: 'long', diffusion: 'long', company: 'long', name: 'long' });
  assert.deepEqual(long.forged.map(f => [f.raison, f.champ, f.longueur]), [['saisie hors formulaire', 'message', 2001], ['saisie hors formulaire', 'name', 101],
    ['saisie hors formulaire', 'company', 121], ['saisie hors formulaire', 'diffusion', 301]]);
  // Hors liste : destinataire, usage ; un champ répété (tableau) ne vient pas de la page.
  const f1 = errorsOf('contact', { ...CONTACT_OK, pour: 'quelquun' });
  assert.deepEqual([f1.errors, f1.forged], [{ pour: 'pour' }, [{ raison: 'valeur hors liste', champ: 'pour', valeur: 'quelquun' }]]);
  assert.deepEqual(errorsOf('licence', { ...LICENCE_OK, usage: 'tirage' }).forged, [{ raison: 'valeur hors liste', champ: 'usage', valeur: 'tirage' }]);
  assert.deepEqual(errorsOf('contact', { ...CONTACT_OK, message: ['a', 'b'] }).forged, [{ raison: 'saisie hors formulaire', champ: 'message', longueur: 3 }]);
  // Rien n'a été enregistré par les refus ; « aux deux » : pas de photographe.
  assert.equal(db.prepare('SELECT COUNT(*) FROM messages').pluck().get(), 1);
  const id = m.submit('contact', { ...CONTACT_OK, pour: 'tous', name: 'Lu\u0007cie\n Exemple', message: ' Deux\r\nlignes ' }, { authors, lang: 'de' });
  const r = m.get(id);
  assert.deepEqual([r.author_id, r.name, r.message, r.lang, r.kind, r.status], [null, 'Lucie Exemple', 'Deux\nlignes', 'de', 'contact', 'nouveau']);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('chiffrement au repos (DATA_KEY) et effacement 12 mois après l’envoi', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'messages-'));
  const db = openDb(path.join(dir, 't.db'));
  migrate(db);
  db.prepare("INSERT INTO authors (slug, name) VALUES ('julien', 'Julien')").run();
  const authors = db.prepare('SELECT id, slug FROM authors').all();
  let clock = Date.parse('2026-10-16T13:34:00Z');
  const m = createMessages({ db, vault: createVault(DATA_KEY), now: () => clock });
  const id = m.submit('licence', { ...LICENCE_OK, company: 'Éditions du Fleuve', diffusion: '3 000 exemplaires' }, { authors, photo: null });
  const raw = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  for (const k of ['name', 'email', 'company', 'diffusion', 'message']) assert.match(raw[k], /^enc1:/, k);
  assert.doesNotMatch(JSON.stringify(raw), /Lucie|example\.org|Fleuve|Lisbonne|3 000/);
  assert.deepEqual([raw.usage, raw.kind, raw.lang], ['presse', 'licence', 'fr']);
  const open = m.get(id);
  assert.deepEqual([open.name, open.email, open.company, open.diffusion], ['Lucie Exemple', 'lucie.exemple@example.org', 'Éditions du Fleuve', '3 000 exemplaires']);
  // Sans la clé : un avertissement, jamais une erreur.
  assert.match(createMessages({ db }).get(id).name, /donnée chiffrée/);
  // Une valeur en clair (clé ajoutée après coup) : chiffrée au démarrage.
  db.prepare("INSERT INTO messages (kind, name, email, message, created_at) VALUES ('contact', 'En clair', 'a@b.fr', 'Texte', ?)").run(clock);
  assert.equal(m.sealExisting(), 1);
  assert.equal(db.prepare("SELECT COUNT(*) FROM messages WHERE name NOT LIKE 'enc1:%'").pluck().get(), 0);
  // 12 mois moins un jour : gardé ; 12 mois et un jour : effacé.
  clock += 364 * 864e5;
  assert.equal(m.purge(), 0);
  clock += 2 * 864e5;
  assert.equal(m.purge(), 2);
  assert.equal(db.prepare('SELECT COUNT(*) FROM messages').pluck().get(), 0);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- pages publiques ----------
test('v1, v2 et v3, trois langues : mêmes champs, même méthode, même champ piège ; liens vers le contact et la demande', async t => {
  const c = await site(t, 'v1', { vigie: true });
  const seen = {};
  for (const version of ['v1', 'v2', 'v3']) {
    c.app.publicVersion.save(version);
    for (const lang of ['fr', 'en', 'de']) {
      const P = LANG_PREFIX[lang];
      for (const [url, action] of [[`${P}/contact`, `${P}/contact`], [`${P}/droits/demande?photo=${SLUG}`, `${P}/droits/demande`], [`${P}/droits/demande`, `${P}/droits/demande`]]) {
        const res = await c.app.inject(url);
        assert.equal(res.statusCode, 200, `${version} ${url}`);
        assert.match(res.body, new RegExp(`<html lang="${lang}"`), url);
        assert.equal(res.headers['cache-control'], 'no-store', url);
        assert.equal(res.headers['x-robots-tag'], 'noindex', url);
        if (version !== 'v1') assert.match(res.body, /css\/v2\/formulaires\.css/, url);
        else assert.doesNotMatch(res.body, /css\/v2\//, url);
        if (version === 'v3') assert.match(res.body, /css\/v3\/v3\.css/, url);
        const f = formOf(res.body, action);
        assert.deepEqual([f.method, f.novalidate], ['post', true], `${version} ${url}`);
        assert.match(f.html, TRAP, `${version} ${url} : champ piège`);
        assert.equal(res.body.match(/name="website"/g).length, 1);
        // Lien piège de la Vigie présent (pied de page), caché.
        assert.ok(res.body.includes(`<a href="${TRAP_PATH}" rel="nofollow" hidden tabindex="-1" aria-hidden="true">archives</a>`), `${version} ${url} : lien piège`);
        (seen[url.replace(P, '')] ??= {})[`${version}-${lang}`] = f.sig;
      }
    }
  }
  for (const [url, s] of Object.entries(seen)) for (const [k, sig] of Object.entries(s)) assert.deepEqual(sig, s['v1-fr'], `${url} ${k}`);
  assert.deepEqual(seen['/contact']['v1-fr'], ['email:email/200', 'radio:pour=julien', 'radio:pour=sebastien', 'radio:pour=tous', 'text:name/100', 'text:website', 'textarea:message/2000']);
  assert.deepEqual(seen[`/droits/demande?photo=${SLUG}`]['v1-fr'], ['email:email/200', `hidden:photo=${SLUG}`, 'radio:usage=autre', 'radio:usage=presse', 'radio:usage=publicite', 'radio:usage=web',
    'text:company/120', 'text:diffusion/300', 'text:name/100', 'text:website', 'textarea:message/2000']);
  assert.ok(!seen['/droits/demande']['v1-fr'].some(s => s.startsWith('hidden:photo')), 'sans photo : pas de champ caché');
  // Liens : pied de page (v1 et v2) vers le contact ; visionneuse v2 vers la demande préremplie ; Droits vers la demande ;
  // À propos (#contact) vers le contact, photographe par photographe.
  for (const version of ['v1', 'v2']) {
    c.app.publicVersion.save(version);
    for (const lang of ['fr', 'de']) {
      const P = LANG_PREFIX[lang];
      assert.match((await c.app.inject(`${P}/`)).body, new RegExp(`href="${P}/contact"`), `${version} ${lang} pied de page`);
      assert.match((await c.app.inject(`${P}/droits`)).body, new RegExp(`href="${P}/droits/demande"`), `${version} ${lang} Droits`);
      const about = (await c.app.inject(`${P}/a-propos`)).body;
      assert.match(about, /id="contact"/);
      assert.match(about, new RegExp(`href="${P}/contact\\?pour=julien"`));
      assert.match(about, new RegExp(`href="${P}/contact\\?pour=tous"`));
    }
  }
  c.app.publicVersion.save('v2');
  assert.match((await c.app.inject(`/photo/${SLUG}`)).body, new RegExp(`<a class="lien" href="/droits/demande\\?photo=${SLUG}">Demander une licence</a>`));
  assert.match((await c.app.inject(`/de/photo/${SLUG}`)).body, new RegExp(`<a class="lien" href="/de/droits/demande\\?photo=${SLUG}">Lizenz anfragen</a>`));
  // Préremplis : le destinataire par ?pour=, la photo par ?photo=.
  assert.match((await c.app.inject('/contact?pour=julien')).body, /value="julien" checked/);
  const pre = (await c.app.inject(`/en/droits/demande?photo=${SLUG}`)).body;
  assert.match(pre, /<span class="cartel-t">[^<]+<\/span>/);
  assert.match(pre, /Request a licence/);
  // Pages « merci » : rien de la saisie, le titre prend le focus.
  for (const version of ['v1', 'v2']) {
    c.app.publicVersion.save(version);
    for (const url of ['/contact/merci', `/droits/demande/merci?photo=${SLUG}`, '/de/contact/merci']) {
      const r = await c.app.inject(url);
      assert.equal(r.statusCode, 200, url);
      assert.match(r.body, /id="merci-t" tabindex="-1" autofocus/, `${version} ${url}`);
    }
  }
});

for (const version of ['v1', 'v2']) {
  test(`${version} · envoi accepté, champ piège, autre site, limite de débit (Vigie) ; rien de stocké hors de l’envoi accepté`, async t => {
    const c = await site(t, version, { vigie: true });
    const form = formOf((await c.app.inject('/contact')).body, '/contact');
    const lic = formOf((await c.app.inject(`/droits/demande?photo=${SLUG}`)).body, '/droits/demande');
    // Accepté : enregistré, « merci ».
    let r = await post(c.app, '/contact', payloadOf(form, CONTACT_OK), { ip: '198.51.100.10' });
    assert.deepEqual([r.statusCode, r.headers.location], [303, '/contact/merci']);
    r = await post(c.app, '/droits/demande', payloadOf(lic, LICENCE_OK), { ip: '198.51.100.10' });
    assert.deepEqual([r.statusCode, r.headers.location], [303, `/droits/demande/merci?photo=${SLUG}`]);
    assert.equal(count(c), 2);
    const lr = c.db.prepare("SELECT m.*, p.slug FROM messages m JOIN photos p ON p.id = m.photo_id WHERE kind = 'licence'").get();
    assert.equal(lr.slug, SLUG);
    assert.equal(lr.author_id, c.db.prepare('SELECT author_id FROM photos WHERE slug = ?').pluck().get(SLUG));
    // Piège : « merci », rien d'enregistré.
    r = await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, website: 'http://spam.example' }), { ip: '198.51.100.11' });
    assert.deepEqual([r.statusCode, r.headers.location], [303, '/contact/merci']);
    r = await post(c.app, '/de/droits/demande', payloadOf(lic, { ...LICENCE_OK, website: 'x' }), { ip: '198.51.100.15' });
    assert.deepEqual([r.statusCode, r.headers.location], [303, '/de/droits/demande/merci']);
    // Autre site : même réponse, rien d'enregistré.
    r = await post(c.app, '/contact', payloadOf(form, CONTACT_OK), { ip: '198.51.100.12', origin: 'https://ailleurs.example' });
    assert.deepEqual([r.statusCode, r.headers.location], [303, '/contact/merci']);
    r = await post(c.app, '/droits/demande', payloadOf(lic, LICENCE_OK), { ip: '198.51.100.16', origin: 'https://ailleurs.example' });
    assert.equal(r.statusCode, 303);
    assert.equal(count(c), 2);
    // Limite : 8 envois par heure et par adresse, communs aux deux formulaires ; le 9e : 429, signalé, saisie gardée.
    for (let i = 0; i < 4; i++) assert.equal((await post(c.app, '/contact', payloadOf(form, { email: 'x' }), { ip: '198.51.100.14' })).statusCode, 422);
    for (let i = 0; i < 4; i++) assert.equal((await post(c.app, '/en/droits/demande', payloadOf(lic, { email: 'x' }), { ip: '198.51.100.14' })).statusCode, 422);
    r = await post(c.app, '/de/contact', payloadOf(form, { ...CONTACT_OK, message: 'Gardé tel quel' }), { ip: '198.51.100.14' });
    assert.equal(r.statusCode, 429);
    assert.match(r.body, /Gardé tel quel<\/textarea>/);
    if (version === 'v2') {
      assert.match(r.body, /<div class="msg" id="limite" role="status" tabindex="-1" autofocus>/);
      assert.match(nb(r.body), /<title>Sendung kurz ausgesetzt · Kontakt · Test<\/title>|<title>[^<]+ · Kontakt · Test<\/title>/);
    }
    assert.equal(count(c), 2);
    const v = await c.flush();
    assert.deepEqual(v.of('malicious_honeypot').map(e => [e.detail.piege, e.detail.formulaire]), [['champ caché', 'contact'], ['champ caché', 'licence']]);
    assert.deepEqual(v.of('input_validation_fail').filter(e => e.detail.raison === 'formulaire envoyé depuis un autre site').map(e => [e.detail.formulaire, e.detail.origine]),
      [['contact', 'https://ailleurs.example'], ['licence', 'https://ailleurs.example']]);
    assert.deepEqual(v.of('excess_rate_limit_exceeded').map(e => e.detail.limite), ['contact']);
    // Jamais le message, le nom ni l'adresse dans un événement.
    assert.doesNotMatch(JSON.stringify(v.events), /Lucie|lucie\.exemple|exposition|Lisbonne|Gardé tel quel/);
  });
}

test('saisie malveillante : DS11 une seule fois ; message légitime (lien, « < ») : rien ; formulaire forgé : DS12', async t => {
  const c = await site(t, 'v2', { vigie: true });
  const form = formOf((await c.app.inject('/contact')).body, '/contact');
  const lic = formOf((await c.app.inject('/droits/demande')).body, '/droits/demande');
  // Un message ordinaire, avec un lien et un « < » : accepté, aucun événement.
  const legit = 'Bonjour, voici notre guide : https://guide.example.org/lisbonne?page=2 — tirage < 3 000 exemplaires, et 2 < 5.';
  let r = await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, message: legit }), { ip: '198.51.100.20' });
  assert.equal(r.statusCode, 303);
  let v = await c.flush();
  assert.deepEqual(v.events.filter(e => ['malicious_input', 'input_validation_fail'].includes(e.type)), []);
  // Un message malveillant : enregistré comme un autre (il ne s'exécute nulle part), signalé une seule fois, par le crochet
  // commun (longueur seule, jamais l'extrait) ; pas de input_validation_fail en plus.
  const evil = 'Bonjour <script>alert(1)</script>';
  r = await post(c.app, '/droits/demande', payloadOf(lic, { ...LICENCE_OK, message: evil }), { ip: '198.51.100.21' });
  assert.equal(r.statusCode, 303);
  v = await c.flush();
  const mi = v.of('malicious_input');
  assert.equal(mi.length, 1);
  assert.deepEqual(mi[0].detail.constats, [{ famille: 'xss', champ: 'body.message', longueur: evil.length }]);
  assert.equal(mi[0].severity, 'moyen');
  assert.doesNotMatch(JSON.stringify(mi), /alert|script>/);
  // Trop long ET malveillant : le crochet le signale, la route ne le signale pas une seconde fois.
  r = await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, message: `<script>${'x'.repeat(2100)}` }), { ip: '198.51.100.22' });
  assert.equal(r.statusCode, 422);
  v = await c.flush();
  assert.equal(v.of('malicious_input').length, 2);
  assert.equal(v.of('input_validation_fail').length, 0);
  // Formulaire forgé : destinataire et usage hors liste, texte trop long, photo inconnue (GET et POST) ; 422, rien de stocké.
  const before = count(c);
  r = await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, pour: 'tous' }).replace('pour=tous', 'pour=ailleurs'), { ip: '198.51.100.23' });
  assert.equal(r.statusCode, 422);
  r = await post(c.app, '/droits/demande', payloadOf(lic, { ...LICENCE_OK }).replace('usage=presse', 'usage=tirage'), { ip: '198.51.100.25' });
  assert.equal(r.statusCode, 422);
  r = await post(c.app, '/droits/demande', payloadOf(lic, { ...LICENCE_OK, diffusion: 'd'.repeat(400) }), { ip: '198.51.100.26' });
  assert.equal(r.statusCode, 422);
  assert.equal(count(c), before);
  assert.equal((await c.app.inject({ url: '/droits/demande?photo=photo-qui-n-existe-pas', remoteAddress: '198.51.100.27' })).statusCode, 200);
  assert.equal((await c.app.inject({ url: '/contact?pour=personne', remoteAddress: '198.51.100.28' })).statusCode, 200);
  r = await post(c.app, '/droits/demande', `${payloadOf(lic, LICENCE_OK)}&photo=inventee`, { ip: '198.51.100.24' });
  assert.equal(r.statusCode, 303);                                     // photo inconnue : la demande arrive sans photo
  assert.equal(c.db.prepare('SELECT photo_id FROM messages ORDER BY id DESC LIMIT 1').pluck().get(), null);
  v = await c.flush();
  assert.deepEqual(v.of('input_validation_fail').map(e => [e.origine.emetteur, e.detail.raison, e.detail.formulaire, e.detail.champ, e.detail.valeur ?? e.detail.longueur]), [
    ['server/routes/contact-public.js · contact', 'valeur hors liste', 'contact', 'pour', 'ailleurs'],
    ['server/routes/contact-public.js · licence', 'valeur hors liste', 'licence', 'usage', 'tirage'],
    ['server/routes/contact-public.js · licence', 'saisie hors formulaire', 'licence', 'diffusion', 400],
    ['server/routes/contact-public.js · licence', 'valeur hors liste', 'licence', 'photo', 'photo-qui-n-existe-pas'],
    ['server/routes/contact-public.js · contact', 'valeur hors liste', 'contact', 'pour', 'personne'],
    ['server/routes/contact-public.js · licence', 'valeur hors liste', 'licence', 'photo', 'inventee'],
  ]);
  // Photo dépubliée depuis (vieux lien) : rien à signaler.
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE slug = ?").run(SLUG);
  assert.equal((await c.app.inject({ url: `/droits/demande?photo=${SLUG}`, remoteAddress: '198.51.100.29' })).statusCode, 200);
  v = await c.flush();
  assert.equal(v.of('input_validation_fail').length, 6);
  // Ni le message, ni le nom, ni l'adresse.
  assert.doesNotMatch(JSON.stringify(v.events), /Lucie|lucie\.exemple|guide\.example|Couverture/);
});

test('v2 : erreurs reliées aux champs, résumé dès deux points, focus sur le seul champ en erreur, titre de l’onglet', async t => {
  const c = await site(t, 'v2');
  const form = formOf((await c.app.inject('/contact')).body, '/contact');
  let r = await post(c.app, '/contact', payloadOf(form, { message: '', email: 'x' }));
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /<section class="resume" id="resume" tabindex="-1" autofocus aria-labelledby="resume-t">/);
  assert.match(nb(r.body), /<title>Erreur : 4 points à corriger · Contact · Test<\/title>/);
  for (const [k, id] of [['pour', 'ct-pour-sebastien'], ['message', 'ct-message'], ['name', 'ct-nom'], ['email', 'ct-email']]) {
    assert.match(r.body, new RegExp(`<li><a href="#${id}">`), k);
    assert.match(r.body, new RegExp(`id="err-${k}"`), k);
  }
  assert.match(r.body, /<textarea id="ct-message" name="message" rows="6" maxlength="2000" aria-describedby="err-message ct-message-aide" aria-invalid="true">/);
  // Un seul point : pas de résumé, le focus au champ, le titre le nomme.
  r = await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, email: 'lucie@' }));
  assert.doesNotMatch(r.body, /class="resume"/);
  assert.match(r.body, /<input id="ct-email" type="email" name="email" value="lucie@" maxlength="200" autocomplete="email" aria-describedby="err-email ct-email-aide" aria-invalid="true" autofocus>/);
  assert.match(nb(r.body), /<title>Erreur : votre e-mail · Contact · Test<\/title>/);
  // Demande de licence : l'usage, erreur sous la légende du groupe.
  const lic = formOf((await c.app.inject(`/de/droits/demande?photo=${SLUG}`)).body, '/de/droits/demande');
  r = await post(c.app, '/de/droits/demande', payloadOf(lic, { ...LICENCE_OK, usage: '' }));
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /<fieldset class="bloc groupe groupe--erreur" aria-describedby="err-usage"><legend>Geplante Nutzung<\/legend>\s*<p class="champ-err" id="err-usage">/);
  assert.match(r.body, /<input id="dl-usage-presse" type="radio" name="usage" value="presse" aria-invalid="true" autofocus>/);
  assert.match(r.body, new RegExp(`name="photo" value="${SLUG}"`), 'photo gardée');
});

// ---------- admin ----------
test('admin : droits, portée, CSRF, lecture sensible ; v1 et v2 selon le compte ; « Aujourd’hui »', async t => {
  const c = await site(t, 'v2', { vigie: true, env: { DATA_KEY } });
  const seb = c.authorId('sebastien'), jul = c.authorId('julien');
  const form = formOf((await c.app.inject('/contact')).body, '/contact');
  await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, pour: 'julien', name: 'Anaïs Exemple' }), { ip: '198.51.100.30' });
  await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, pour: 'sebastien', name: 'Bruno Exemple' }), { ip: '198.51.100.31' });
  await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, pour: 'tous', name: 'Chloé Exemple', message: 'Lien piégé https://hameçon.example <b>gras</b>' }), { ip: '198.51.100.32' });
  const [toJul, toSeb, toAll] = c.db.prepare('SELECT id FROM messages ORDER BY id').pluck().all();
  // Permissions : Administrateur (tout), Photographe (les siens) ; ni Modérateur ni Relecteur.
  assert.equal(grantsOf(['admin']).get('messages.traiter'), SCOPES.ALL);
  assert.equal(grantsOf(['photographe']).get('messages.traiter'), SCOPES.OWN);
  assert.equal(grantsOf(['moderateur']).has('messages.traiter'), false);
  assert.equal(grantsOf(['relecteur']).has('messages.traiter'), false);
  const mod = await c.account('mod', { roles: ['moderateur'] });
  assert.equal((await mod.get('/admin/messages')).statusCode, 403);
  assert.equal((await mod.get(`/admin/messages/${toJul}`)).statusCode, 403);
  // L'administrateur (admin v1) : la liste sans donnée personnelle, puis la fiche déchiffrée (lecture notée et signalée).
  const root = await c.account('root', { roles: ['admin'], version: 'v1' });
  const list = (await root.get('/admin/messages')).body;
  assert.match(list, /Messages et demandes/);
  for (const id of [toJul, toSeb, toAll]) assert.match(list, new RegExp(`href="/admin/messages/${id}"`));
  assert.doesNotMatch(list, /Anaïs|Bruno|Chloé|lucie\.exemple|exposition/);
  assert.match(list, /class="reports"/);                                         // l'écran de la v1
  let res = await root.get(`/admin/messages/${toAll}`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.match(res.body, /Chloé Exemple/);
  assert.match(res.body, /mailto:lucie\.exemple@example\.org/);
  assert.match(res.body, /Lien piégé https:\/\/hameçon\.example &lt;b&gt;gras&lt;\/b&gt;/);  // en texte, jamais un lien
  assert.doesNotMatch(res.body, /href="https:\/\/hame/);
  assert.match(res.body, /<details class="msg-suppr">/);                         // v1 : suppression dans un dépliant
  // Site public en v2 ; la session de cet administrateur regarde la v1 : la page Contact de la v1 (comportement : le
  // formulaire de la v1, sans la feuille des formulaires v2), les visiteurs la v2.
  assert.equal((await root.post('/admin/apparence/apercu-v2', { vue: 'v1', vers: '/contact' })).statusCode, 303);
  const seenV1 = (await root.get('/contact')).body;
  assert.match(seenV1, /<form class="hello-form" method="post" action="\/contact" novalidate>/);
  assert.doesNotMatch(seenV1, /css\/v2\/formulaires\.css/);
  assert.match((await c.app.inject('/contact')).body, /<form class="form ct-form" id="ct-form" method="post" action="\/contact" novalidate>/);
  // Un compte en admin v2 voit l'écran v2 : cartes, dialogue de suppression.
  const root2 = await c.account('root2', { roles: ['admin'], version: 'v2' });
  assert.match((await root2.get('/admin/messages')).body, /class="sg-liste"/);
  res = await root2.get(`/admin/messages/${toJul}`);
  assert.match(res.body, new RegExp(`<dialog class="confirm cible" id="dlg-msg-${toJul}"`));
  assert.doesNotMatch(res.body, /msg-suppr/);
  // Photographe lié à Sébastien : ses messages et ceux adressés aux deux ; celui de Julien n'existe pas pour lui (404),
  // signalé « hors portée ».
  const ph = await c.account('ph-seb', { roles: ['photographe'], author: seb });
  const mine = (await ph.get('/admin/messages')).body;
  assert.match(mine, new RegExp(`href="/admin/messages/${toSeb}"`));
  assert.match(mine, new RegExp(`href="/admin/messages/${toAll}"`));
  assert.doesNotMatch(mine, new RegExp(`href="/admin/messages/${toJul}"`));
  assert.equal((await ph.get(`/admin/messages/${toJul}`)).statusCode, 404);
  assert.equal((await ph.post(`/admin/messages/${toJul}/supprimer`)).statusCode, 404);
  assert.equal(count(c), 3);
  assert.equal((await ph.get(`/admin/messages/${toSeb}`)).statusCode, 200);
  assert.equal((await ph.get('/admin/messages/999999')).statusCode, 404);       // inconnu : 404, non signalé
  // « Aujourd'hui » : la ligne, comptée dans la portée.
  assert.match((await ph.get('/admin')).body, /2 messages ou demandes de licence à lire/);
  assert.match((await root.get('/admin')).body, /3 messages ou demandes de licence à lire/);
  // CSRF : sans jeton, refusé ; avec, traité puis supprimé (dialogue).
  assert.equal((await root.post(`/admin/messages/${toSeb}/traite`, {}, { token: null })).statusCode, 403);
  assert.equal(c.db.prepare('SELECT status FROM messages WHERE id = ?').pluck().get(toSeb), 'nouveau');
  res = await root.post(`/admin/messages/${toSeb}/traite`);
  assert.deepEqual([res.statusCode, res.headers.location], [303, `/admin/messages/${toSeb}`]);
  assert.equal(c.db.prepare('SELECT status FROM messages WHERE id = ?').pluck().get(toSeb), 'traite');
  assert.match((await root.get('/admin')).body, /2 messages ou demandes de licence à lire/);
  assert.equal((await root.post(`/admin/messages/${toSeb}/supprimer`, {}, { token: null })).statusCode, 403);
  res = await root.post(`/admin/messages/${toSeb}/supprimer`);
  assert.deepEqual([res.statusCode, res.headers.location], [303, '/admin/messages']);
  assert.equal(count(c), 2);
  // Journal : lectures et gestes, avec le numéro seul.
  const audit = c.db.prepare("SELECT action, target, status FROM audit_log WHERE action LIKE '%message%' ORDER BY id").all();
  assert.deepEqual(audit.map(a => `${a.action} ${a.status}`), ['message lu 200', 'message lu 200', 'message lu 200',
    'POST /admin/messages/:id/traite 403', 'POST /admin/messages/:id/traite 303', 'POST /admin/messages/:id/supprimer 403', 'POST /admin/messages/:id/supprimer 303']);
  assert.deepEqual(audit.filter(a => a.action === 'message lu').map(a => a.target), [String(toAll), String(toJul), String(toSeb)]);
  assert.doesNotMatch(JSON.stringify(c.db.prepare('SELECT * FROM audit_log').all()), /Lucie|Anaïs|Chloé|lucie\.exemple/);
  const v = await c.flush();
  assert.deepEqual(v.of('sensitive_read').map(e => [e.detail.cible, e.detail.objet, e.detail.id]),
    [['/admin/messages/:id', 'message', toAll], ['/admin/messages/:id', 'message', toJul], ['/admin/messages/:id', 'message', toSeb]]);
  assert.deepEqual(v.of('authz_fail').filter(e => e.detail.objet === 'message').map(e => [e.detail.raison, e.detail.permission, e.detail.id, e.detail.ecriture]),
    [['hors portée', 'messages.traiter', toJul, false], ['hors portée', 'messages.traiter', toJul, true]]);
  assert.ok(v.of('authz_csrf_fail').length >= 2);
  assert.doesNotMatch(JSON.stringify(v.events), /Lucie|lucie\.exemple|hameçon/);
});

test('e-mail aux photographes : sans donnée personnelle ni message, aux bons comptes, plafond du jour signalé', async t => {
  const c = await site(t, 'v2', { vigie: true, mail: true });
  const seb = c.authorId('sebastien'), jul = c.authorId('julien');
  c.app.accounts.ensure({ sub: 'seb', name: 'seb', email: 'seb@example.org', roles: ['photographe'] });
  c.app.accounts.update(c.app.accounts.bySub('seb').id, { authorId: seb }, 'test');
  c.app.accounts.ensure({ sub: 'jul', name: 'jul', email: 'jul@example.org', roles: ['photographe'] });
  c.app.accounts.update(c.app.accounts.bySub('jul').id, { authorId: jul }, 'test');
  c.app.accounts.ensure({ sub: 'root', name: 'root', email: 'root@example.org', roles: ['admin'] });
  const form = formOf((await c.app.inject('/contact')).body, '/contact');
  await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, pour: 'julien' }), { ip: '198.51.100.40' });
  await c.app.reminders.messages();
  assert.deepEqual(c.sent.map(m => m.to), ['jul@example.org']);
  assert.match(c.sent[0].subject, /^Test · Un nouveau message vous attend$/);
  assert.match(c.sent[0].text, /\/admin\/messages$/);
  // Une demande de licence sur une photo de Sébastien, puis un message aux deux.
  const slugSeb = c.db.prepare("SELECT slug FROM photos WHERE author_id = ? AND status = 'published' LIMIT 1").pluck().get(seb);
  const lic = formOf((await c.app.inject(`/droits/demande?photo=${slugSeb}`)).body, '/droits/demande');
  await post(c.app, '/droits/demande', payloadOf(lic, { ...LICENCE_OK, company: 'Éditions du Fleuve' }), { ip: '198.51.100.41' });
  await c.app.reminders.messages();
  assert.deepEqual(c.sent.slice(1).map(m => m.to), ['seb@example.org']);
  await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, pour: 'tous' }), { ip: '198.51.100.42' });
  await c.app.reminders.messages();
  assert.deepEqual(c.sent.slice(2).map(m => m.to).sort(), ['jul@example.org', 'seb@example.org']);
  // Rien d'autre qu'une annonce : ni nom, ni adresse, ni société, ni message, ni photo, ni Reply-To.
  const all = JSON.stringify(c.sent);
  assert.doesNotMatch(all, /Lucie|lucie\.exemple|Fleuve|exposition|Couverture|Lisbonne|replyTo|reply-to/i);
  assert.doesNotMatch(all, new RegExp(slugSeb));
  // Déjà annoncés : pas d'autre e-mail.
  await c.app.reminders.messages();
  assert.equal(c.sent.length, 4);
  // Plafond : 30 e-mails par jour (4 déjà partis) ; au-delà, les messages attendent et la Vigie est prévenue une fois.
  const authors = c.db.prepare('SELECT id, slug FROM authors').all();
  for (let i = 0; i < 30; i++) {
    c.app.messages.submit('contact', { ...CONTACT_OK, pour: 'julien' }, { authors });
    await c.app.reminders.messages();
  }
  assert.equal(c.sent.length, 30);
  assert.ok(c.db.prepare('SELECT COUNT(*) FROM messages WHERE notified_at IS NULL').pluck().get() >= 1, 'des messages attendent le lendemain');
  await c.app.reminders.messages();
  const v = await c.flush();
  const cap = v.of('excess_rate_limit_exceeded').filter(e => e.detail.limite === 'messages_global' && e.detail.plafond === 'annonces');
  assert.equal(cap.length, 1);
  assert.deepEqual([cap[0].severity, cap[0].origine.emetteur], ['moyen', 'server/messages.js · notifications']);
});

test('sans messagerie : rien n’est envoyé, les messages attendent dans l’admin', async t => {
  const c = await site(t, 'v1');
  const form = formOf((await c.app.inject('/contact')).body, '/contact');
  assert.equal((await post(c.app, '/contact', payloadOf(form, CONTACT_OK))).statusCode, 303);
  assert.equal(await c.app.reminders.messages(), 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM messages WHERE notified_at IS NULL').pluck().get(), 1);
});

// ---------- revue de sécurité de la PR #183 (un test par constat) ----------
test('revue 1 : un compte Photographe sans photographe lié ne voit ni ne supprime rien, pas même les messages aux deux', async t => {
  const c = await site(t, 'v2', { vigie: true });
  const form = formOf((await c.app.inject('/contact')).body, '/contact');
  const lic = formOf((await c.app.inject('/droits/demande')).body, '/droits/demande');
  await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, pour: 'tous' }), { ip: '198.51.100.50' });
  await post(c.app, '/droits/demande', payloadOf(lic, LICENCE_OK), { ip: '198.51.100.51' });             // sans photo : aux deux
  const [toAll, noPhoto] = c.db.prepare('SELECT id FROM messages ORDER BY id').pluck().all();
  assert.deepEqual(c.db.prepare('SELECT to_all FROM messages ORDER BY id').pluck().all(), [1, 1]);
  const lone = await c.account('lone', { roles: ['photographe'] });
  const list = (await lone.get('/admin/messages')).body;
  assert.doesNotMatch(list, /href="\/admin\/messages\/\d+"/);
  for (const id of [toAll, noPhoto]) {
    assert.equal((await lone.get(`/admin/messages/${id}`)).statusCode, 404);
    assert.equal((await lone.post(`/admin/messages/${id}/supprimer`)).statusCode, 404);
  }
  assert.equal(count(c), 2);
  assert.doesNotMatch((await lone.get('/admin')).body, /demandes? de licence à lire/);
  // Lié à un photographe : il les voit.
  const seb = await c.account('seb', { roles: ['photographe'], author: c.authorId('sebastien') });
  assert.equal((await seb.get(`/admin/messages/${toAll}`)).statusCode, 200);
  const v = await c.flush();
  assert.equal(v.of('authz_fail').filter(e => e.detail.objet === 'message').length, 4);
});

test('revue 2 : un photographe supprimé ne rend pas ses messages lisibles par l’autre ; sa suppression est retenue par ses messages', async t => {
  const c = await site(t, 'v2');
  const jul = c.authorId('julien'), seb = c.authorId('sebastien');
  const form = formOf((await c.app.inject('/contact')).body, '/contact');
  await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, pour: 'julien' }), { ip: '198.51.100.52' });
  const id = c.db.prepare('SELECT MAX(id) FROM messages').pluck().get();
  // La suppression de Julien est retenue par son message (comme par ses photos et ses rencontres).
  c.db.prepare('UPDATE photos SET author_id = ? WHERE author_id = ?').run(seb, jul);
  c.db.prepare('UPDATE accounts SET author_id = NULL WHERE author_id = ?').run(jul);
  const root = await c.account('root', { roles: ['admin'] });
  const page = (await root.get('/admin/auteurs')).body;
  assert.match(page, /Julien a encore 1 message\(s\) de visiteurs/);
  // Supprimé quand même (base modifiée à la main, ou ancienne base) : le message devient orphelin, jamais « aux deux ».
  c.db.prepare('DELETE FROM authors WHERE id = ?').run(jul);
  assert.deepEqual(c.db.prepare('SELECT author_id, to_all FROM messages WHERE id = ?').get(id), { author_id: null, to_all: 0 });
  const ph = await c.account('ph-seb', { roles: ['photographe'], author: seb });
  assert.equal((await ph.get(`/admin/messages/${id}`)).statusCode, 404);
  assert.doesNotMatch((await ph.get('/admin/messages')).body, new RegExp(`href="/admin/messages/${id}"`));
  const r = await root.get(`/admin/messages/${id}`);
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Photographe supprimé depuis/);
});

test('revue 3 : boîte paginée (50 par page, filtre Nouveaux sans troncature) ; plafond global de 50 messages acceptés par jour (503, saisie gardée, Vigie)', async t => {
  const c = await site(t, 'v2', { vigie: true });
  const authors = c.db.prepare('SELECT id, slug FROM authors').all();
  for (let i = 0; i < 49; i++) c.app.messages.submit('contact', { ...CONTACT_OK, pour: 'julien' }, { authors });
  const form = formOf((await c.app.inject('/contact')).body, '/contact');
  assert.equal((await post(c.app, '/contact', payloadOf(form, CONTACT_OK), { ip: '198.51.100.60' })).statusCode, 303);   // le 50e
  const r = await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, message: 'Gardé au plafond' }), { ip: '198.51.100.61' });
  assert.equal(r.statusCode, 503);
  assert.match(r.body, /Gardé au plafond<\/textarea>/);
  assert.match(r.body, /<div class="msg" id="limite" role="status" tabindex="-1" autofocus>/);
  assert.match(nb(r.body), /Beaucoup de messages nous sont arrivés aujourd’hui/);
  const lic = formOf((await c.app.inject('/droits/demande')).body, '/droits/demande');
  assert.equal((await post(c.app, '/droits/demande', payloadOf(lic, LICENCE_OK), { ip: '198.51.100.62' })).statusCode, 503);
  assert.equal(count(c), 50);
  const v = await c.flush();
  assert.deepEqual(v.of('excess_rate_limit_exceeded').filter(e => e.detail.limite === 'messages_global' && e.detail.plafond === 'messages').map(e => [e.detail.formulaire, e.severity]), [['contact', 'moyen'], ['licence', 'moyen']]);
  // Le lendemain (heure de Paris), le compteur repart.
  c.db.prepare('UPDATE messages SET created_at = created_at - 2 * 86400000').run();
  assert.equal(c.app.messages.acceptedToday(), 0);
  // Boîte : 51 messages au plus vus, en deux pages ; « Nouveaux » compte et pagine tout.
  c.app.messages.submit('contact', { ...CONTACT_OK, pour: 'julien' }, { authors });
  c.db.prepare('UPDATE messages SET status = \'traite\' WHERE id <= 3').run();
  const root = await c.account('root', { roles: ['admin'], version: 'v2' });
  const p1 = (await root.get('/admin/messages')).body;
  assert.equal(p1.match(/<li class="panel sg/g).length, 50);
  assert.match(p1, /Page 1 sur 2/);
  const p2 = (await root.get('/admin/messages?page=2')).body;
  assert.equal(p2.match(/<li class="panel sg/g).length, 1);
  const fresh = (await root.get('/admin/messages?etat=nouveau&page=2')).body;
  assert.equal(fresh.match(/<li class="panel sg/g).length, 48);                 // une seule page de nouveaux : la page 2 ramène à la 1
  assert.match((await root.get('/admin/messages?etat=nouveau')).body, /Nouveaux <span class="chip-n">48<\/span>/);
  const v1 = await c.account('root1', { roles: ['admin'], version: 'v1' });
  assert.match((await v1.get('/admin/messages?page=2')).body, /Page 2 sur 2/);
});

test('revue 4 : le plafond des annonces par e-mail survit à un redémarrage (compté dans la base, jour de Paris)', async t => {
  const c = await site(t, 'v2', { mail: true });
  c.app.accounts.ensure({ sub: 'jul', name: 'jul', email: 'jul@example.org', roles: ['photographe'] });
  c.app.accounts.update(c.app.accounts.bySub('jul').id, { authorId: c.authorId('julien') }, 'test');
  const authors = c.db.prepare('SELECT id, slug FROM authors').all();
  c.app.messages.submit('contact', { ...CONTACT_OK, pour: 'julien' }, { authors });
  await c.app.reminders.messages();
  const stored = JSON.parse(c.db.prepare("SELECT value FROM settings WHERE key = 'messages_annonces'").pluck().get());
  assert.equal(stored.n, 1);
  // Un « redémarrage » : un nouveau module de relances relit le compte du jour, déjà au plafond.
  c.db.prepare("UPDATE settings SET value = ? WHERE key = 'messages_annonces'").run(JSON.stringify({ ...stored, n: 30 }));
  const { createReminders } = await import('../server/reminders.js');
  const again = createReminders({ db: c.db, accounts: c.app.accounts, todo: c.app.todo, mailer: c.app.mailer, messages: c.app.messages, siteName: () => 'Test', publicUrl: '' });
  c.app.messages.submit('contact', { ...CONTACT_OK, pour: 'julien' }, { authors });
  const before = c.sent.length;
  assert.equal(await again.messages(), 0);
  assert.equal(c.sent.length, before);
  // Un autre jour : le compte repart.
  c.db.prepare("UPDATE settings SET value = ? WHERE key = 'messages_annonces'").run(JSON.stringify({ day: '01/01/2020', n: 30 }));
  assert.equal(await again.messages(), 1);
});

test('revue 5 : caractères invisibles et de direction retirés des champs d’une ligne', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'messages-'));
  const db = openDb(path.join(dir, 't.db'));
  migrate(db);
  db.prepare("INSERT INTO authors (slug, name) VALUES ('julien', 'Julien')").run();
  const m = createMessages({ db });
  const id = m.submit('licence', { ...LICENCE_OK, name: 'Lu‮cie​ Ex­em⁦ple﻿', company: '‏Éditions⁠ du Fleuve', diffusion: '3‍000 ex.', email: 'lucie​@example.org', message: 'Texte​ gardé' }, { authors: [] });
  const r = m.get(id);
  assert.deepEqual([r.name, r.company, r.diffusion, r.email], ['Lucie Exemple', 'Éditions du Fleuve', '3000 ex.', 'lucie@example.org']);
  assert.equal(r.message, 'Texte​ gardé');                      // le message, texte libre, n'est pas une ligne
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('suppression d’un message : sensitive_delete (objet, numéro et catégories, aucun contenu) seulement si elle a lieu ; rien sur un 404 hors portée ni un refus CSRF', async t => {
  const c = await site(t, 'v2', { vigie: true });
  const form = formOf((await c.app.inject('/contact')).body, '/contact');
  await post(c.app, '/contact', payloadOf(form, { ...CONTACT_OK, pour: 'julien' }), { ip: '198.51.100.70' });
  const id = c.db.prepare('SELECT MAX(id) FROM messages').pluck().get();
  const ph = await c.account('ph-seb', { roles: ['photographe'], author: c.authorId('sebastien') });
  assert.equal((await ph.post(`/admin/messages/${id}/supprimer`)).statusCode, 404);
  const root = await c.account('root', { roles: ['admin'] });
  assert.equal((await root.post(`/admin/messages/${id}/supprimer`, {}, { token: null })).statusCode, 403);
  assert.equal((await root.post(`/admin/messages/${id}/supprimer`, {}, { token: 'faux' })).statusCode, 403);
  assert.equal(count(c), 1);
  let v = await c.flush();
  assert.deepEqual(v.of('sensitive_delete'), []);
  await root.get(`/admin/messages/${id}`);
  assert.equal((await root.post(`/admin/messages/${id}/supprimer`)).statusCode, 303);
  assert.equal(count(c), 0);
  v = await c.flush();
  const del = v.of('sensitive_delete');
  assert.equal(del.length, 1);
  assert.deepEqual(del[0].detail, { objet: 'message', id, categorie: ['identite', 'coordonnees', 'message_libre'] });
  assert.equal(typeof del[0].detail.id, 'number');
  assert.deepEqual([del[0].severity, del[0].origine.composant, del[0].origine.emetteur], ['bas', 'site · admin', 'server/routes/messages.js · suppression']);
  assert.equal(v.of('sensitive_read').find(e => e.detail.objet === 'message').detail.id, id);   // même numéro que la lecture
  // Déjà supprimé : 404, rien de plus.
  assert.equal((await root.post(`/admin/messages/${id}/supprimer`)).statusCode, 404);
  v = await c.flush();
  assert.equal(v.of('sensitive_delete').length, 1);
});
