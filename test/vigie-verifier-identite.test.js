import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup, VIGIE_KEYS } from './helpers.js';
import { startProvider } from './oidc-provider.js';
import { setup as consoleSetup } from './console-env.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions, DecisionError, KINDS, MAX_DURATION } from '../vigie/decisions.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createEngine } from '../vigie/moteur.js';
import { loadRules } from '../vigie/sigma.js';
import { loadVigieConfig } from '../vigie/config.js';
import { run as cli, keys } from '../vigie/cli.js';
import { EVENTS } from '../server/securite/vocabulaire.js';
import { createDecisionsClient } from '../server/securite/decisions.js';
import { createSessionStore } from '../server/sessions.js';

// Décision « verifier_identite » (décision du propriétaire du 19 octobre 2026) : plutôt que geler un compte ou fermer ses
// sessions, le site redemande l'identité (nouvelle connexion chez Zitadel, second facteur) avant toute écriture dans
// l'admin, tant que la session a été authentifiée avant la décision. Vigie (genre, migration 014, liste signée, réponse
// automatique, console, ligne de commande) et site (migration 058, contrôle des écritures, bandeau, retour OIDC).
const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const TOKEN = 'jeton-de-test-0123456789';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const ADMIN = { 'urn:zitadel:iam:org:project:roles': { admin: { 123: 'site.zitadel.cloud' } } };
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-vi-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
const sign = p => { const payload = JSON.stringify({ usage: 'site', version: 1, emis_a: Date.now(), blocages: [], sessions: [], comptes: [], gels: [], verrouillage: null, ...p }); return { payload, signature: crypto.sign(null, Buffer.from(payload), VIGIE_KEYS.privateKey).toString('base64') }; };

function vigieOf(t, { start = Date.parse('2026-10-20T10:00:00Z') } = {}) {
  const dir = tmp(t);
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  t.after(() => db.close());
  const clock = { t: start };
  const now = () => clock.t;
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now });
  store.onAdded(rows => engine.process(rows));
  const add = (type, severity, extra = {}) => store.add([{ id: crypto.randomUUID(), recu_a: now(), survenu_a: now(), type, severity, canal: 'ingestion signée', confiance: 'rapporté', composant: 'site · connexion', ...extra,
    detail: extra.detail && typeof extra.detail === 'object' ? JSON.stringify(extra.detail) : extra.detail }]);
  const alerts = regle => db.prepare('SELECT * FROM alerts ORDER BY id').all().filter(a => !regle || a.regle === regle);
  return { dir, db, store, engine, decisions, switches, clock, now, add, alerts };
}

// ---------------------------------------------------------------------------------------------------------------------
// Vigie

test('Vigie : genre verifier_identite (sub attendu, 7 jours au plus), migration 014 (numéros gardés), liste signée pour le site, jamais pour la bordure', async t => {
  const v = vigieOf(t, { start: Date.now() });
  assert.ok(KINDS.includes('verifier_identite'));
  assert.equal(MAX_DURATION.verifier_identite, 7 * 864e5);
  // Migration 014 : la contrainte CHECK admet le genre ; les numéros ne sont jamais redonnés.
  const first = v.decisions.create({ kind: 'geler', cible: 'zitadel-x', duree: '1h', par: 'test' });
  assert.throws(() => v.decisions.create({ kind: 'verifier_identite', cible: '', duree: '24h', par: 'test' }), /compte \(sub\) attendu/);
  assert.throws(() => v.decisions.create({ kind: 'verifier_identite', cible: 'x'.repeat(201), duree: '24h', par: 'test' }), DecisionError);
  const id = v.decisions.create({ kind: 'verifier_identite', cible: 'zitadel-julien', duree: '30j', motif: 'cookie copié ?', par: 'test' });
  assert.ok(id > first);
  const d = v.decisions.active().find(x => x.id === id);
  assert.equal(d.fin - d.cree_a, 7 * 864e5, '7 jours au plus');
  const p = JSON.parse(v.decisions.signed().payload);
  assert.deepEqual(p.verifications, [{ sub: 'zitadel-julien', depuis: d.cree_a, fin: d.fin }]);
  assert.deepEqual(p.gels.map(g => g.sub), ['zitadel-x'], 'les autres listes inchangées');
  assert.equal(JSON.parse(v.decisions.signedEdge().payload).verifications, undefined, 'rien d’un compte ne part chez Cloudflare');
  assert.ok(v.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'decisions'").pluck().get().includes("'verifier_identite'"));
  // Écrite à la main dans la base (sans empreinte) : jamais signée pour le site.
  v.db.prepare("INSERT INTO decisions (kind, cible, par, cree_a, fin) VALUES ('verifier_identite', 'zitadel-intrus', 'main', ?, ?)").run(Date.now(), Date.now() + 3600e3);
  assert.deepEqual(JSON.parse(v.decisions.signed().payload).verifications.map(x => x.sub), ['zitadel-julien']);
});

test('Vigie : session_autre_appareil en mode « bloquer » → verifier_identite 24 h (même pour un administrateur) ; jamais en double ; identité confirmée puis nouvelle reprise → nouvelle décision', async t => {
  const v = vigieOf(t);
  const { rules, correlations } = loadRules(new URL('../vigie/regles/', import.meta.url).pathname);
  const by = n => [...rules, ...correlations].find(r => r.name === n);
  assert.deepEqual([by('session_autre_appareil').mode, by('session_autre_appareil').reponse], ['bloquer', 'verifier_identite']);
  assert.deepEqual([by('reglage_apres_session_reprise').mode, by('reglage_apres_session_reprise').reponse], ['bloquer', 'verifier_identite']);
  assert.deepEqual([by('billet_apres_session_reprise').mode, by('billet_apres_session_reprise').reponse], ['bloquer', 'verifier_identite']);
  assert.equal(by('ecritures_sans_identite').mode, 'alerter');
  // Un administrateur (compte de l'amorce compris) : c'est le cas utile, rien ne l'en exempte.
  v.store.setting.set('controle_roles_admins', { administrateurs: ['zitadel-julien'], instantane_a: v.clock.t });
  const reprise = () => v.add('session_context_change', 'critique', { composant: 'site · connexion', sub: 'zitadel-julien', ip: '203.0.113.50', detail: { navigateur: { avant: 'Safari · macOS', apres: 'Chrome · Android' } } });
  reprise();
  const a = v.alerts('sigma.session_autre_appareil')[0];
  assert.equal(a.mode, 'bloquer');
  let d = v.decisions.active();
  assert.deepEqual(d.map(x => [x.kind, x.cible, x.auto, x.fin - x.cree_a, x.alerte_id]), [['verifier_identite', 'zitadel-julien', 1, 864e5, a.id]]);
  assert.match(a.reponse, /verifier_identite zitadel-julien/);
  assert.deepEqual(JSON.parse(v.decisions.signed().payload).verifications.map(x => x.sub), ['zitadel-julien']);
  // Une autre reprise sans confirmation : la vérification en cours suffit.
  v.clock.t += 60e3;
  v.add('session_context_change', 'critique', { composant: 'site · connexion', sub: 'zitadel-julien', ip: '203.0.113.51', detail: { navigateur: { avant: 'Safari · macOS', apres: 'Firefox · Linux' } } });
  v.clock.t += 6 * 60e3;
  v.engine.process([]);
  assert.equal(v.decisions.active().length, 1, 'jamais en double');
  // Julien confirme son identité ; il change un réglage public : la corrélation s'ouvre, sans nouvelle vérification.
  v.clock.t += 60e3;
  v.add('authn_reauth_success', 'info', { sub: 'zitadel-julien', ip: '192.0.2.10' });
  v.clock.t += 60e3;
  v.add('config_public_changed', 'bas', { composant: 'site · admin', sub: 'zitadel-julien', ip: '192.0.2.10', detail: { cles: ['tagline'], contact_change: false } });
  const c = v.alerts('sigma.reglage_apres_session_reprise')[0];
  assert.equal(c.mode, 'bloquer');
  assert.match(c.reponse, /identité confirmée après la dernière session reprise/);
  assert.equal(v.decisions.active().length, 1);
  // Nouvelle reprise après la confirmation (la session neuve volée à son tour) : nouvelle décision.
  v.clock.t += 25 * 3600e3;                                      // l'alerte d'avant est retombée dans le calme
  reprise();
  d = v.decisions.active().filter(x => x.kind === 'verifier_identite');
  assert.equal(d.length, 1);
  assert.ok(d[0].cree_a > v.clock.t - 1000, 'une décision neuve');
  // Interrupteur des blocages arrêté : aucune réponse.
  v.decisions.lift({ all: true, par: 'test', motif: 'essai' });
  v.switches.set('blocages', 'arret', { duree: '2h', par: 'test', motif: 'essai' });
  v.add('session_context_change', 'critique', { composant: 'site · connexion', sub: 'zitadel-lea', ip: '203.0.113.60', detail: {} });
  assert.equal(v.decisions.active().length, 0);
});

test('Vigie : écritures arrêtées en série (5 routes en 15 min) → alerte haute ; une ou deux (la personne légitime), ou la même route répétée : rien', async t => {
  const v = vigieOf(t);
  assert.deepEqual(EVENTS.authz_reauth_required, { severity: 'bas', composant: 'site · admin' });
  assert.deepEqual(EVENTS.authn_reauth_success, { severity: 'info', composant: 'site · connexion' });
  const ecriture = (sub, route) => v.add('authz_reauth_required', 'bas', { composant: 'site · admin', sub, ip: '203.0.113.9', method: 'POST', route });
  ecriture('zitadel-lea', '/admin/reglages'); ecriture('zitadel-lea', '/admin/reglages');
  for (let i = 0; i < 10; i++) ecriture('zitadel-julien', '/admin/carnet/:id/brouillon');
  assert.equal(v.alerts().length, 0);
  for (const r of ['/admin/reglages', '/admin/comptes/:id', '/admin/photos/import', '/admin/carnet/:id']) ecriture('zitadel-julien', r);
  assert.deepEqual(v.alerts('sigma.ecritures_sans_identite').map(a => [a.entite_key, a.gravite, a.mode]), [['zitadel-julien', 'haut', 'alerter']]);
});

test('Vigie : ligne de commande verifier-identite (motif obligatoire, 24 h par défaut)', async t => {
  const dir = tmp(t);
  const k = keys();
  const config = loadVigieConfig({ VIGIE_DATA_DIR: dir, VIGIE_SITE_BACKUP_DIR: dir, VIGIE_INGEST_KEY: k.vigie.VIGIE_INGEST_KEY, VIGIE_LOG_KEY: k.vigie.VIGIE_LOG_KEY, VIGIE_DECISIONS_PRIVATE_KEY: k.vigie.VIGIE_DECISIONS_PRIVATE_KEY });
  assert.throws(() => cli(['verifier-identite', 'zitadel-julien'], { config }), /motif obligatoire/);
  assert.match(cli(['verifier-identite', 'zitadel-julien', '--motif', 'téléphone perdu'], { config }), /Décision #1 : identité de zitadel-julien redemandée/);
  assert.match(cli(['verifier-identite', 'zitadel-lea', '--motif', 'essai', '--duree', '7j'], { config }), /Décision #2/);
  const db = openVigieDb(config.databasePath);
  t.after(() => db.close());
  assert.deepEqual(db.prepare("SELECT cible, fin - cree_a AS d FROM decisions WHERE kind = 'verifier_identite' ORDER BY id").all().map(x => [x.cible, x.d]), [['zitadel-julien', 864e5], ['zitadel-lea', 7 * 864e5]]);
});

test('console : « Redemander l’identité » — formulaire de la fiche d’un compte, décision sans case de confirmation, même pour son propre compte', async t => {
  const v = consoleSetup(t);
  const { cookie } = await v.login();
  const s = v.sessionOf(cookie);
  const post = body => v.app.inject({ method: 'POST', url: '/decisions', headers: { ...v.h(), 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' },
    cookies: { '__Host-vigie': cookie }, payload: new URLSearchParams({ _csrf: s.csrf, ...body }).toString() });
  v.store.add([{ id: crypto.randomUUID(), recu_a: v.clock.t, survenu_a: v.clock.t, type: 'authn_login_success', severity: 'info', canal: 'ingestion signée', confiance: 'rapporté', composant: 'site · connexion', sub: 'zitadel-julien', ip: '203.0.113.50' }]);
  const fiche = await v.app.inject({ url: '/entites/compte/zitadel-julien', headers: v.h(), cookies: { '__Host-vigie': cookie } });
  assert.equal(fiche.statusCode, 200);
  assert.match(fiche.body, /Redemander l’identité/);
  assert.match(fiche.body, /name="type" value="verifier_identite"/);
  const page = await v.app.inject({ url: '/decisions?type=verifier_identite', headers: v.h(), cookies: { '__Host-vigie': cookie } });
  assert.match(page.body, /Redemander l’identité d’un compte/);
  await post({ type: 'verifier_identite', cible: 'sub-seb', motif: 'mon téléphone a disparu' });
  const d = v.db.prepare("SELECT * FROM decisions WHERE kind = 'verifier_identite'").get();
  assert.deepEqual([d.cible, d.fin - d.cree_a], ['sub-seb', 864e5], 'son propre compte, sans confirmation ; 24 h par défaut');
  const liste = await v.app.inject({ url: '/decisions', headers: v.h(), cookies: { '__Host-vigie': cookie } });
  assert.match(liste.body, /confirme son identité avant d’écrire/);
});

// ---------------------------------------------------------------------------------------------------------------------
// Site

async function site(t, { env = VIGIE } = {}) {
  const events = [];
  const send = async body => { events.push(...JSON.parse(body).lot); };
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, ...env }, vigieOptions: env.VIGIE_URL ? { send, timers: false, pollDecisions: false } : undefined });
  const login = async (author = 'julien') => {
    const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author, next: '/admin' } });
    assert.equal(res.statusCode, 303);
    return cookiesOf(res);
  };
  const csrfOf = cookies => ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(cookies.session).digest('hex'));
  const write = (cookies, { json = false, tagline = 'Accroche' } = {}) => ctx.app.inject({ method: 'POST', url: '/admin/reglages', cookies,
    headers: { host: 'localhost', referer: 'http://localhost/admin/reglages?onglet=site', accept: json ? 'application/json' : 'text/html,application/xhtml+xml', 'x-csrf-token': csrfOf(cookies) },
    payload: { _csrf: csrfOf(cookies), part: 'site', tagline } });
  const tagline = () => ctx.db.prepare("SELECT value FROM settings WHERE key = 'tagline'").pluck().get() || '';
  const flush = async () => { if (ctx.app.securite.enabled) { ctx.app.securite.retryNow(); await ctx.app.securite.flush(); } return events; };
  return { ...ctx, login, write, tagline, csrfOf, flush, events };
}

test('site : migration 058 (auth_time de la session, jamais dans la table accounts) ; connexion de test : heure de la connexion', async t => {
  const c = await site(t);
  assert.ok(c.db.prepare("SELECT 1 FROM migrations WHERE name = '058_session_auth_time.sql'").get());
  assert.ok(c.db.prepare('PRAGMA table_info(sessions)').all().some(x => x.name === 'auth_time'));
  assert.ok(!c.db.prepare('PRAGMA table_info(accounts)').all().some(x => x.name === 'auth_time'), 'schéma des comptes inchangé (surveillé par la Vigie)');
  const t0 = Date.now();
  await c.login();
  const at = c.db.prepare("SELECT auth_time FROM sessions WHERE sub = 'local:julien'").pluck().get();
  assert.ok(at >= t0 - 1000 && at <= Date.now());
});

test('site : écriture de l’admin arrêtée pour une session d’avant la décision (formulaire : vers /auth/verifier ; fetch : 403 JSON), lectures permises avec un bandeau ; confirmée par le même compte, permise ; un autre compte, refusé ; compte non visé intact', async t => {
  const c = await site(t);
  const old = await c.login();
  // Session authentifiée une minute avant la décision.
  c.db.prepare("UPDATE sessions SET auth_time = auth_time - 60000 WHERE sub = 'local:julien'").run();
  const other = await c.login('sebastien');
  c.app.decisions.accept(sign({ verifications: [{ sub: 'local:julien', depuis: Date.now() - 1000, fin: Date.now() + 864e5 }] }));
  assert.equal(c.app.decisions.state.counts.verifications, 1);
  // Lecture : permise, bandeau.
  const page = await c.app.inject({ url: '/admin/site', cookies: old });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /class="sec-bandeau identite"/);
  assert.match(page.body, /Par sécurité, confirmez votre identité avant de modifier quoi que ce soit\./);
  assert.match(page.body, /href="\/auth\/verifier\?next=%2Fadmin%2Fsite">Confirmer mon identité</);
  // Écriture par formulaire : nouvelle connexion, retour à la page d'où part l'écriture ; rien d'enregistré.
  const w = await c.write(old, { tagline: 'Tirages offerts' });
  assert.equal(w.statusCode, 303);
  assert.equal(w.headers.location, '/auth/verifier?next=%2Fadmin%2Freglages%3Fonglet%3Dsite');
  assert.doesNotMatch(c.tagline(), /Tirages offerts/);
  // Par fetch : 403 JSON, message et lien.
  const j = await c.write(old, { json: true, tagline: 'Tirages offerts' });
  assert.equal(j.statusCode, 403);
  assert.deepEqual(j.json(), { error: 'Par sécurité, confirmez votre identité avant de modifier quoi que ce soit.', verifier: '/auth/verifier?next=%2Fadmin%2Freglages%3Fonglet%3Dsite' });
  // Préférences d'affichage : laissées passer.
  assert.equal((await c.app.inject({ method: 'POST', url: '/admin/theme', cookies: old, headers: { accept: 'text/html' }, payload: { _csrf: c.csrfOf(old), theme: 'light', back: '/admin' } })).headers.location, '/admin');
  // Exportations et originaux (lectures notées au journal) : arrêtés eux aussi.
  const ex = await c.app.inject({ url: '/admin/personnes/1/export.zip', cookies: old, headers: { accept: 'text/html' } });
  assert.equal(ex.statusCode, 303);
  assert.equal(ex.headers.location, '/auth/verifier?next=%2Fadmin');
  assert.equal((await c.app.inject({ url: '/admin/photos/1/original', cookies: old })).statusCode, 403);
  // Compte non visé : rien ne change, pas de bandeau.
  const ow = await c.write(other, { tagline: 'Accroche de Sébastien' });
  assert.equal(ow.statusCode, 303);
  assert.doesNotMatch(ow.headers.location, /^\/auth\//);
  assert.match(c.tagline(), /Accroche de Sébastien/);
  assert.doesNotMatch((await c.app.inject({ url: '/admin', cookies: other })).body, /sec-bandeau identite/);
  // /auth/verifier sans IdP : la connexion de test, formulaire même avec la session ouverte.
  const go = await c.app.inject({ url: '/auth/verifier?next=%2Fadmin%2Freglages', cookies: old });
  assert.equal(go.headers.location, '/auth/local?verifier=1&next=%2Fadmin%2Freglages');
  const form = await c.app.inject({ url: go.headers.location, cookies: old });
  assert.equal(form.statusCode, 200);
  assert.match(form.body, /name="verifier" value="1"/);
  // Un autre compte au retour : refusé, la session reste celle d'avant (et toujours retenue).
  const autre = await c.app.inject({ method: 'POST', url: '/auth/local', cookies: old, payload: { token: TOKEN, author: 'sebastien', verifier: '1', next: '/admin/reglages' } });
  assert.equal(autre.statusCode, 403);
  assert.equal(cookiesOf(autre).session, undefined);
  assert.equal((await c.write(old)).statusCode, 303);
  assert.match((await c.write(old)).headers.location, /^\/auth\/verifier/);
  // Le même compte : nouvelle session (l'ancienne est détruite : pas de fixation), écriture permise, bandeau parti.
  const ok = await c.app.inject({ method: 'POST', url: '/auth/local', cookies: old, payload: { token: TOKEN, author: 'julien', verifier: '1', next: '/admin/reglages' } });
  assert.equal(ok.statusCode, 303);
  assert.equal(ok.headers.location, '/admin/reglages');
  const fresh = cookiesOf(ok);
  assert.ok(fresh.session && fresh.session !== old.session);
  assert.equal((await c.app.inject({ url: '/admin', cookies: old })).statusCode, 302, 'l’ancienne session est fermée');
  const w2 = await c.write(fresh, { tagline: 'Photographies de rue' });
  assert.equal(w2.statusCode, 303);
  assert.doesNotMatch(w2.headers.location, /^\/auth\//);
  assert.match(c.tagline(), /Photographies de rue/);
  assert.doesNotMatch((await c.app.inject({ url: '/admin', cookies: fresh })).body, /sec-bandeau identite/);
  // Événements : écritures arrêtées (une par minute, par session et par route), identité confirmée, autre compte refusé.
  const ev = await c.flush();
  const of = type => ev.filter(e => e.type === type);
  assert.deepEqual(of('authz_reauth_required').map(e => [e.sub, e.route, e.method]), [['local:julien', '/admin/reglages', 'POST'], ['local:julien', '/admin/personnes/:id/export.zip', 'GET'], ['local:julien', '/admin/photos/:id/original', 'GET']]);
  assert.deepEqual(of('authn_reauth_success').map(e => [e.sub, e.detail?.verification]), [['local:julien', true]]);
  assert.ok(of('authn_login_fail').some(e => /autre compte/.test(JSON.stringify(e.detail))));
  // Journal de l'admin.
  assert.ok(c.db.prepare("SELECT 1 FROM audit_log WHERE sub = 'local:julien' AND action = 'identité confirmée (test)'").get());
});

test('site : décision échue ou levée, VIGIE_APPLIQUER=0 : sans effet ; sessions sans heure d’authentification : tenues pour anciennes ; début daté dans le futur ramené à la réception', async t => {
  const dir = tmp(t);
  const clock = { t: Date.now() };
  const pubkey = crypto.createPublicKey({ key: Buffer.from(VIGIE_KEYS.pub64, 'base64'), format: 'der', type: 'spki' });
  const c = createDecisionsClient({ url: 'http://x', key: KEY, pubkey, storageDir: dir, adminSubs: ['proprietaire'], now: () => clock.t });
  const list = (verifications, version = 1) => { const payload = JSON.stringify({ usage: 'site', version, emis_a: clock.t, blocages: [], sessions: [], comptes: [], gels: [], verrouillage: null, verifications }); return { payload, signature: crypto.sign(null, Buffer.from(payload), VIGIE_KEYS.privateKey).toString('base64') }; };
  c.accept(list([{ sub: 'zitadel-julien', depuis: clock.t - 1000, fin: clock.t + 3600e3 }, { sub: 'proprietaire', depuis: clock.t - 1000, fin: clock.t + 3600e3 }]));
  const ancienne = { sub: 'zitadel-julien', auth_time: clock.t - 60e3 };
  assert.ok(c.identityRequired(ancienne));
  assert.equal(c.identityRequired({ sub: 'zitadel-julien', auth_time: clock.t }), null, 'authentifiée après');
  assert.ok(c.identityRequired({ sub: 'zitadel-julien', auth_time: null }), 'sans heure : ancienne');
  assert.ok(c.identityRequired({ sub: 'proprietaire', auth_time: 0 }), 'un compte de l’amorce n’en est pas exempté');
  assert.equal(c.identityRequired({ sub: 'zitadel-lea', auth_time: 0 }), null);
  // Échue : plus rien.
  clock.t += 3600e3 + 1;
  assert.equal(c.identityRequired(ancienne), null);
  // Levée (absente de la liste suivante) : plus rien.
  clock.t += 1000;
  c.accept(list([{ sub: 'zitadel-julien', depuis: clock.t - 1000, fin: clock.t + 3600e3 }], 2));
  assert.ok(c.identityRequired({ sub: 'zitadel-julien', auth_time: clock.t - 5000 }));
  clock.t += 1000;
  c.accept(list([], 3));
  assert.equal(c.identityRequired({ sub: 'zitadel-julien', auth_time: 0 }), null);
  // 7 jours au plus, même si la liste dit plus ; début dans le futur ramené à la réception.
  c.accept(list([{ sub: 'zitadel-julien', depuis: clock.t + 3600e3, fin: clock.t + 30 * 864e5 }], 4));
  assert.equal(c.verification('zitadel-julien').fin, clock.t + 7 * 864e5);
  assert.equal(c.verification('zitadel-julien').depuis, clock.t);
  // Liste mal formée : refusée en entier.
  assert.throws(() => c.accept(list([{ sub: '', depuis: clock.t, fin: clock.t + 1 }], 5)), /vérification d’identité invalide/);
  assert.throws(() => c.accept(list({ sub: 'x' }, 6)), /vérifications d’identité invalides/);
  // VIGIE_APPLIQUER=0 : rien d'appliqué.
  const off = createDecisionsClient({ url: 'http://x', key: KEY, pubkey, storageDir: tmp(t), apply: false, now: () => clock.t });
  off.accept(list([{ sub: 'zitadel-julien', depuis: clock.t, fin: clock.t + 3600e3 }], 7));
  assert.equal(off.identityRequired({ sub: 'zitadel-julien', auth_time: 0 }), null);
});

test('site sans Vigie : rien ne change (écriture permise, pas de bandeau)', async t => {
  const c = await site(t, { env: { VIGIE_URL: '' } });
  assert.equal(c.app.decisions, undefined);
  const s = await c.login();
  c.db.prepare('UPDATE sessions SET auth_time = NULL').run();
  const w = await c.write(s, { tagline: 'Sans Vigie' });
  assert.equal(w.statusCode, 303);
  assert.doesNotMatch(w.headers.location, /^\/auth\//);
  assert.match(c.tagline(), /Sans Vigie/);
  assert.doesNotMatch((await c.app.inject({ url: '/admin', cookies: s })).body, /sec-bandeau identite/);
});

test('site, connexion OIDC : auth_time gardé ; vérification prompt=login et max_age=300 ; un autre compte ou une authentification ancienne refusés ; le même compte, à l’instant : session neuve', async t => {
  const provider = await startProvider(t);
  const c = await setup(t, { env: { OIDC_ISSUER: provider.issuer, OIDC_CLIENT_ID: 'site', OIDC_CLIENT_SECRET: 'secret', OIDC_PROJECT_ID: '42', ...VIGIE }, vigieOptions: { send: async () => {}, timers: false, pollDecisions: false } });
  const now = () => Math.floor(Date.now() / 1000);
  const flow = async (startUrl, cookies) => {
    const start = await c.app.inject({ url: startUrl, cookies });
    assert.equal(start.statusCode, 302);
    const { code, state, params } = provider.authorize(start.headers.location);
    const res = await c.app.inject({ url: `/auth/callback?code=${code}&state=${state}`, cookies: { ...cookies, ...cookiesOf(start) } });
    return { params, res };
  };
  // Connexion ordinaire, faite il y a une heure chez Zitadel (session SSO).
  const authAvant = now() - 3600;
  provider.user = { sub: 'zitadel-julien', name: 'Julien', email: 'j@example.org', email_verified: true, auth_time: authAvant, ...ADMIN };
  const first = await flow('/auth/login');
  assert.equal(first.res.statusCode, 302);
  assert.equal(first.params.get('max_age'), null);
  const s = cookiesOf(first.res);
  const at = c.db.prepare("SELECT auth_time FROM sessions WHERE sub = 'zitadel-julien'").pluck().get();
  assert.equal(at, authAvant * 1000, 'auth_time du jeton d’identité, en millisecondes');
  c.app.decisions.accept(sign({ verifications: [{ sub: 'zitadel-julien', depuis: Date.now() - 1000, fin: Date.now() + 864e5 }] }));
  const csrf = c.db.prepare("SELECT csrf FROM sessions WHERE sub = 'zitadel-julien'").pluck().get();
  const w = await c.app.inject({ method: 'POST', url: '/admin/reglages', cookies: s, headers: { accept: 'text/html' }, payload: { _csrf: csrf, part: 'site', tagline: 'x' } });
  assert.equal(w.statusCode, 303);
  assert.equal(w.headers.location, '/auth/verifier?next=%2Fadmin');
  // Retour d'un autre compte : refusé, aucune session neuve.
  provider.user = { sub: 'zitadel-autre', email_verified: true, auth_time: now(), ...ADMIN };
  const autre = await flow('/auth/verifier?next=%2Fadmin%2Freglages', s);
  assert.equal(autre.params.get('prompt'), 'login');
  assert.equal(autre.params.get('max_age'), '300');
  assert.equal(autre.res.statusCode, 403);
  assert.match(autre.res.body, /Identité non confirmée/);
  assert.equal(cookiesOf(autre.res).session, undefined);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM accounts WHERE sub = 'zitadel-autre'").pluck().get(), 0, 'aucun compte créé');
  // Authentification ancienne (Zitadel n'a pas redemandé la clé) : refusée par la vérification de max_age.
  provider.user = { sub: 'zitadel-julien', email_verified: true, auth_time: now() - 3600, ...ADMIN };
  const vieille = await flow('/auth/verifier?next=%2Fadmin%2Freglages', s);
  assert.equal(vieille.res.statusCode, 400);
  // Sans auth_time : refusée aussi.
  provider.user = { sub: 'zitadel-julien', email_verified: true, ...ADMIN };
  assert.equal((await flow('/auth/verifier?next=%2Fadmin%2Freglages', s)).res.statusCode, 400);
  // Le même compte, à l'instant : session neuve, retour à la page, écriture permise.
  provider.user = { sub: 'zitadel-julien', name: 'Julien', email: 'j@example.org', email_verified: true, auth_time: now(), amr: ['user', 'mfa'], ...ADMIN };
  const bon = await flow('/auth/verifier?next=%2Fadmin%2Freglages', s);
  assert.equal(bon.res.statusCode, 302);
  assert.equal(bon.res.headers.location, '/admin/reglages');
  const neuve = cookiesOf(bon.res);
  assert.ok(neuve.session && neuve.session !== s.session);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(s.session).digest('hex')), 0, 'ancienne session détruite');
  const csrf2 = c.db.prepare("SELECT csrf FROM sessions WHERE sub = 'zitadel-julien'").pluck().get();
  const w2 = await c.app.inject({ method: 'POST', url: '/admin/reglages', cookies: neuve, headers: { accept: 'text/html' }, payload: { _csrf: csrf2, part: 'site', tagline: 'y' } });
  assert.equal(w2.statusCode, 303);
  assert.doesNotMatch(w2.headers.location, /^\/auth\//);
  assert.ok(c.db.prepare("SELECT 1 FROM audit_log WHERE sub = 'zitadel-julien' AND action = 'identité confirmée'").get());
  // Sans session : /auth/verifier mène à la connexion ordinaire.
  assert.equal((await c.app.inject('/auth/verifier?next=%2Fadmin')).headers.location, '/auth/login?next=%2Fadmin');
});

test('site : une session ouverte avant la migration 058 (auth_time vide) n’a rien à confirmer sans décision', async t => {
  const c = await site(t);
  const s = await c.login();
  c.db.prepare('UPDATE sessions SET auth_time = NULL').run();
  const w = await c.write(s, { tagline: 'Rien à confirmer' });
  assert.equal(w.statusCode, 303);
  assert.doesNotMatch(w.headers.location, /^\/auth\//);
  // Une session créée par la boutique des sessions sans heure : null, jamais une valeur inventée.
  const token = createSessionStore(c.db).create({ sub: 'x', roles: [] });
  assert.equal(c.db.prepare('SELECT auth_time FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex')), null);
});
