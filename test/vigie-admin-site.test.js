import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { createDecisionsClient } from '../server/securite/decisions.js';
import { createVigieAdmin } from '../server/vigie-admin.js';
import { translator } from '../server/admin-i18n.js';
import { loadConfig } from '../server/config.js';
import { grantsOf } from '../server/permissions.js';

// La Vigie dans l'admin du site (phase D3d, maquette MV-10) : permission securite.voir, entrée « Sécurité » et son
// badge, ligne de « Aujourd'hui », bandeau d'une critique à prendre, résumé indisponible daté ; rien sans la
// permission, rien sans Vigie réglée côté site.
const TOKEN = 'jeton-de-test-0123456789';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
// Résumé signé comme le sert la Vigie (GET /v1/resume, usage « resume », clé des décisions).
const signed = payload => { const p = JSON.stringify({ usage: 'resume', emis_a: Date.now(), ...payload }); return { payload: p, signature: crypto.sign(null, Buffer.from(p), VIGIE_KEYS.privateKey).toString('base64') }; };
const MV10 = { ouvertes: { critique: 2, haut: 1, moyen: 1, bas: 0 }, plus_grave: { id: 413, gravite: 'critique', depuis: Date.now() - 15 * 60e3 }, critique_a_prendre: true };
const side = html => html.slice(html.indexOf('<aside class="side"'), html.indexOf('</aside>'));
const entry = html => (/<a class="nav-sec"[\s\S]*?<\/a>/.exec(html) || [''])[0];

async function admin(t, { env = VIGIE, vigieOptions = { send: async () => {}, timers: false, pollDecisions: false } } = {}) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, ...env }, vigieOptions });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare("SELECT csrf FROM sessions WHERE sub = 'local:julien'").pluck().get();
  const get = async url => (await ctx.app.inject({ url, cookies })).body;
  const lang = l => ctx.app.inject({ method: 'POST', url: '/admin/langue', cookies, payload: { _csrf: csrf, lang: l, back: '/admin' } });
  // Autre compte, avec un rôle de l'admin (les rôles viennent du compte).
  const as = role => {
    ctx.app.accounts.ensure({ sub: `test:${role}`, name: role, roles: [role] });
    const token = createSessionStore(ctx.db).create({ sub: `test:${role}`, name: role, roles: [role] });
    return async url => (await ctx.app.inject({ url, cookies: { session: token }, headers: { accept: 'text/html' } })).body;
  };
  return { ...ctx, get, lang, as };
}

test('securite.voir : donnée au rôle Administrateur seulement', () => {
  assert.equal(grantsOf(['admin']).get('securite.voir'), 'tout');
  for (const r of ['photographe', 'moderateur', 'relecteur']) assert.equal(grantsOf([r]).has('securite.voir'), false, r);
});

test('VIGIE_CONSOLE_URL : https://vigie.nicephos.art par défaut, https:// obligatoire en ligne, adresse simple', () => {
  assert.equal(loadConfig({ ...VIGIE, STORAGE_DIR: os.tmpdir() }).vigie.consoleUrl, 'https://vigie.nicephos.art');
  assert.equal(loadConfig({ ...VIGIE, STORAGE_DIR: os.tmpdir(), VIGIE_CONSOLE_URL: 'https://Vigie.Exemple.org/' }).vigie.consoleUrl, 'https://vigie.exemple.org');
  assert.equal(loadConfig({ ...VIGIE, STORAGE_DIR: os.tmpdir(), VIGIE_CONSOLE_URL: 'http://localhost:4300' }).vigie.consoleUrl, 'http://localhost:4300');   // développement
  const online = { ...VIGIE, STORAGE_DIR: os.tmpdir(), PUBLIC_URL: 'https://www.exemple.org', COOKIE_SECRET: 'x'.repeat(40) };
  assert.throws(() => loadConfig({ ...online, VIGIE_CONSOLE_URL: 'http://vigie.exemple.org' }), /VIGIE_CONSOLE_URL doit commencer par https/);
  assert.throws(() => loadConfig({ ...VIGIE, STORAGE_DIR: os.tmpdir(), VIGIE_CONSOLE_URL: 'javascript:alert(1)' }), /VIGIE_CONSOLE_URL/);
  assert.throws(() => loadConfig({ ...VIGIE, STORAGE_DIR: os.tmpdir(), VIGIE_CONSOLE_URL: 'https://u:p@vigie.exemple.org' }), /adresse simple/);
  assert.equal(loadConfig({ STORAGE_DIR: os.tmpdir(), VIGIE_CONSOLE_URL: 'pas une adresse' }).vigie, null);                 // sans Vigie : ignorée
});

test('module des décisions : dernier résumé gardé après 5 minutes, heure de la première lecture manquée', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-admin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { t: Date.now() };
  const status = { code: 200, body: null };
  const fetchImpl = async () => new Response(status.body, { status: status.code });
  const client = createDecisionsClient({ url: 'http://vigie:4100', key: VIGIE.VIGIE_INGEST_KEY, pubkey: VIGIE_KEYS.publicKey, storageDir: dir, fetchImpl, now: () => clock.t });
  assert.equal(client.lastSummary, null);
  status.body = JSON.stringify(signed({ ...MV10, emis_a: clock.t }));
  await client.pollSummary();
  const first = clock.t;
  assert.equal(client.summary.recu_a, first);
  assert.equal(client.summaryFailedAt, null);
  clock.t += 60e3;
  status.code = 503; status.body = '';
  await assert.rejects(client.pollSummary(), /réponse 503/);
  assert.equal(client.summaryFailedAt, first + 60e3);
  clock.t += 60e3;
  await assert.rejects(client.pollSummary());
  assert.equal(client.summaryFailedAt, first + 60e3, 'la première lecture manquée, pas la dernière');
  clock.t = first + 6 * 60e3;
  assert.equal(client.summary, null, 'getter summary inchangé : null après 5 minutes');
  assert.equal(client.lastSummary.recu_a, first);
  assert.deepEqual(client.lastSummary.ouvertes, MV10.ouvertes);
  // Un résumé reçu de nouveau : plus d'indisponibilité.
  status.code = 200; status.body = JSON.stringify(signed({ ...MV10, emis_a: clock.t }));
  await client.pollSummary();
  assert.equal(client.summaryFailedAt, null);
  assert.equal(client.summary.recu_a, clock.t);
});

test('textes de MV-10 : badge, ligne, bandeau, résumé indisponible daté ; en allemand et en anglais', () => {
  const at = (h, m) => Date.UTC(2026, 9, 17, h - 2, m);              // heure de Paris le 17 oct. 2026 (UTC+2)
  const sum = (recu, s = MV10) => ({ recu_a: recu, ...s, plus_grave: s.plus_grave && { ...s.plus_grave, depuis: at(14, 5) } });
  const view = d => createVigieAdmin({ decisions: d, consoleUrl: 'https://vigie.nicephos.art', startedAt: at(13, 58) });
  const fresh = view({ summary: sum(at(14, 20)), lastSummary: sum(at(14, 20)), summaryFailedAt: null });
  const fr = fresh(translator('fr'), at(14, 20));
  assert.equal(fr.href, 'https://vigie.nicephos.art/');
  assert.deepEqual(fr.badge, { text: '▲ 3', attention: true, sr: '3 alertes hautes ou critiques ouvertes' });
  assert.deepEqual(fr.task, { level: 'urgent', title: 'Sécurité : 2 alertes critiques, 1 haute et 1 moyenne dans la Vigie',
    detail: 'la dernière critique ouverte à 14 h 05 ; une au moins n’est pas prise en charge', href: 'https://vigie.nicephos.art/alertes/413', action: 'Ouvrir l’alerte #413', external: true });
  assert.deepEqual(fr.banner, { title: '2 alertes critiques dans la Vigie · la dernière ouverte à 14 h 05',
    detail: 'Une au moins attend sa prise en charge ; ce bandeau reste tant qu’une critique attend.', href: 'https://vigie.nicephos.art/alertes/413', action: 'Ouvrir l’alerte #413' });
  const de = fresh(translator('de'), at(14, 20));
  assert.equal(de.task.title, 'Sicherheit: 2 kritische Sicherheitswarnungen, 1 hohe und 1 mittlere in der Vigie');
  assert.equal(de.task.action, 'Warnung #413 öffnen');
  assert.equal(de.banner.title, '2 kritische Sicherheitswarnungen in der Vigie · die letzte seit 14:05 Uhr');
  const en = fresh(translator('en'), at(14, 20));
  assert.equal(en.task.title, 'Security: 2 critical alerts, 1 high and 1 medium in Vigie');
  assert.equal(en.banner.action, 'Open alert #413');
  // Résumé indisponible depuis 14 h 11, le dernier reçu à 14 h 10 : le bandeau reste, daté ; ▲ seul sur l'entrée.
  const stale = view({ summary: null, lastSummary: sum(at(14, 10)), summaryFailedAt: at(14, 11) })(translator('fr'), at(14, 20));
  assert.deepEqual(stale.badge, { text: '▲', attention: true, sr: 'résumé indisponible depuis 14 h 11' });
  assert.equal(stale.banner.title, 'Au dernier résumé, 14 h 10 : 2 alertes critiques dans la Vigie · la dernière ouverte à 14 h 05');
  assert.equal(stale.banner.detail, 'Résumé de la Vigie indisponible depuis 14 h 11 : l’admin ne peut plus le confirmer.');
  assert.equal(stale.task.level, 'urgent');
  assert.equal(stale.task.title, 'Sécurité : au dernier résumé (14 h 10), 2 alertes critiques, 1 haute et 1 moyenne dans la Vigie');
  assert.match(stale.task.detail, /^résumé de la Vigie indisponible depuis 14 h 11 : l’admin ne sait plus où elles en sont ; la Vigie, elle, envoie toujours/);
  // Un autre jour : la date avec l'heure.
  assert.equal(view({ summary: null, lastSummary: sum(at(14, 10)), summaryFailedAt: at(14, 11) })(translator('fr'), at(14, 10) + 864e5).banner.title.slice(0, 35), 'Au dernier résumé, 17 oct., 14 h 10');
  // Jamais reçu : jamais « aucune alerte » ; la ligne dit depuis quand (démarrage du site), sans bandeau.
  const never = view({ summary: null, lastSummary: null, summaryFailedAt: null })(translator('fr'), at(14, 20));
  assert.equal(never.badge.text, '▲');
  assert.equal(never.banner, null);
  assert.deepEqual([never.task.level, never.task.title, never.task.href, never.task.action], ['bientot', 'Sécurité : résumé de la Vigie indisponible depuis 13 h 58', 'https://vigie.nicephos.art/', 'Ouvrir la Vigie']);
  // Périmé, sans alerte au dernier résumé.
  const quiet = { ouvertes: { critique: 0, haut: 0, moyen: 0, bas: 0 }, plus_grave: null, critique_a_prendre: false };
  const staleQuiet = view({ summary: null, lastSummary: sum(at(14, 10), quiet), summaryFailedAt: null })(translator('fr'), at(14, 20));
  assert.equal(staleQuiet.task.title, 'Sécurité : résumé de la Vigie indisponible depuis 14 h 11');
  assert.equal(staleQuiet.task.detail, 'dernier résumé reçu à 14 h 10, sans alerte ouverte ; l’admin ne peut plus le confirmer');
  // Aucune alerte : l'entrée sans badge, ni ligne ni bandeau.
  assert.deepEqual(view({ summary: sum(at(14, 20), quiet), lastSummary: sum(at(14, 20), quiet), summaryFailedAt: null })(translator('fr'), at(14, 20)),
    { href: 'https://vigie.nicephos.art/', badge: null, task: null, banner: null });
  // Une moyenne seule : bientôt, le nombre seul ; pas de bandeau.
  const one = view({ summary: sum(at(14, 20), { ouvertes: { critique: 0, haut: 0, moyen: 1, bas: 0 }, plus_grave: { id: 414, gravite: 'moyen' }, critique_a_prendre: false }), summaryFailedAt: null })(translator('fr'), at(14, 20));
  assert.deepEqual([one.badge.text, one.badge.attention, one.task.level, one.task.title, one.banner], ['1', false, 'bientot', 'Sécurité : 1 alerte moyenne dans la Vigie', null]);
});

test('admin avec la Vigie : entrée « Sécurité » et badge, ligne d’« Aujourd’hui », bandeau sur toutes les pages, en trois langues', async t => {
  const c = await admin(t);
  // Le résumé porte une adresse de console : jamais reprise (le lien est celui réglé côté site).
  c.app.decisions.acceptSummary(signed({ ...MV10, console: 'https://piege.example' }));
  const home = await c.get('/admin');
  const e = entry(side(home));
  assert.match(e, /^<a class="nav-sec" href="https:\/\/vigie\.nicephos\.art\/" target="_blank" rel="noopener noreferrer">/);
  assert.match(e, />Sécurité<span class="sr-only"> \(nouvel onglet\)<\/span>/);
  assert.match(e, /<span class="nav-badge attention"><span aria-hidden="true">▲ 3<\/span><span class="sr-only">, 3 alertes hautes ou critiques ouvertes<\/span>/);
  assert.match(side(home), /href="\/admin\/journal"[\s\S]*class="nav-sec"/, 'après « Journal »');
  assert.doesNotMatch(home, /piege\.example/);
  // Bandeau : en tête de la page, lien vers l'alerte dans un nouvel onglet.
  assert.match(home, /<div class="sec-bandeau" role="alert"><svg[^>]*>[\s\S]*?<\/svg><p><span class="t">2 alertes critiques dans la Vigie · la dernière ouverte à \d{1,2} h \d{2}<\/span><span class="sec">Une au moins attend sa prise en charge ; ce bandeau reste tant qu’une critique attend\.<\/span><\/p><a class="btn ghost" href="https:\/\/vigie\.nicephos\.art\/alertes\/413" target="_blank" rel="noopener noreferrer">Ouvrir l’alerte #413<span class="sr-only"> \(nouvel onglet\)<\/span>/);
  // Ligne urgente d'« Aujourd'hui », en tête ; comptée dans le badge des urgences.
  const tasks = home.slice(home.indexOf('class="task-list"'), home.indexOf('</ul>', home.indexOf('class="task-list"')));
  assert.match(tasks, /^class="task-list">\s*<li class="task urgent">[\s\S]*?<a href="https:\/\/vigie\.nicephos\.art\/alertes\/413" target="_blank" rel="noopener noreferrer">Sécurité : 2 alertes critiques, 1 haute et 1 moyenne dans la Vigie<span class="sr-only"> \(nouvel onglet\)<\/span><\/a>/);
  assert.match(tasks, /la dernière critique ouverte à \d{1,2} h \d{2} ; une au moins n’est pas prise en charge/);
  assert.match(side(home), /<span aria-hidden="true">✕ 1<\/span>/);
  // Aucun style en ligne (CSP) dans ce qui est ajouté.
  for (const frag of [e, /<div class="sec-bandeau"[\s\S]*?<\/div>/.exec(home)[0]]) assert.doesNotMatch(frag, /style=/);
  // Le bandeau est sur toutes les pages de l'admin (pas seulement « Aujourd'hui »).
  for (const url of ['/admin/photos', '/admin/journal', '/admin/aide']) assert.match(await c.get(url), /class="sec-bandeau"/, url);
  // Allemand, anglais.
  await c.lang('de');
  const de = await c.get('/admin');
  assert.match(entry(de), />Sicherheit<span class="sr-only"> \(neuer Tab\)<\/span>/);
  assert.match(entry(de), /, 3 offene hohe oder kritische Sicherheitswarnungen/);
  assert.match(de, /Sicherheit: 2 kritische Sicherheitswarnungen, 1 hohe und 1 mittlere in der Vigie/);
  assert.match(de, /2 kritische Sicherheitswarnungen in der Vigie · die letzte seit \d{2}:\d{2} Uhr/);
  assert.match(de, />Warnung #413 öffnen</);
  await c.lang('en');
  const en = await c.get('/admin');
  assert.match(entry(en), />Security<span class="sr-only"> \(new tab\)<\/span>/);
  assert.match(en, /Security: 2 critical alerts, 1 high and 1 medium in Vigie/);
  assert.match(en, />Open alert #413</);
  // Une critique prise en charge : plus de bandeau ; la ligne reste.
  await c.lang('fr');
  c.app.decisions.acceptSummary(signed({ ...MV10, critique_a_prendre: false }));
  const taken = await c.get('/admin');
  assert.doesNotMatch(taken, /class="sec-bandeau"/);
  assert.match(taken, /Sécurité : 2 alertes critiques/);
  // Aucune alerte : l'entrée reste, sans badge ; ni ligne, ni bandeau.
  c.app.decisions.acceptSummary(signed({ ouvertes: { critique: 0, haut: 0, moyen: 0, bas: 0 }, plus_grave: null, critique_a_prendre: false }));
  const calm = await c.get('/admin');
  assert.match(entry(calm), /class="nav-sec"/);
  assert.doesNotMatch(entry(calm), /nav-badge/);
  assert.doesNotMatch(calm, /Sécurité :|class="sec-bandeau"/);
});

test('résumé périmé ou jamais reçu : dernier état connu, daté ; jamais « aucune alerte »', async t => {
  const c = await admin(t, { vigieOptions: { send: async () => {}, timers: false, pollDecisions: false, decisionsFetch: async () => new Response('', { status: 503 }) } });
  // Jamais reçu.
  const never = await c.get('/admin');
  assert.match(entry(never), /<span class="nav-badge attention"><span aria-hidden="true">▲<\/span><span class="sr-only">, résumé indisponible depuis (?:[^<]*, )?\d{1,2} h \d{2}<\/span>/);
  assert.match(never, /<li class="task bientot">[\s\S]*?Sécurité : résumé de la Vigie indisponible depuis [^<]*\d{1,2} h \d{2}<span class="sr-only">[\s\S]*?aucun résumé reçu depuis le démarrage du site/);
  assert.doesNotMatch(never, /class="sec-bandeau"/);
  // Reçu, puis la Vigie ne répond plus et le résumé a plus de 5 minutes : le bandeau reste, daté.
  c.app.decisions.acceptSummary(signed(MV10));
  await assert.rejects(c.app.decisions.pollSummary(), /réponse 503/);
  c.app.decisions.lastSummary.recu_a -= 6 * 60e3;
  assert.equal(c.app.decisions.summary, null);
  const stale = await c.get('/admin');
  assert.match(stale, /<span class="t">Au dernier résumé, (?:[^<:]*, )?\d{1,2} h \d{2} : 2 alertes critiques dans la Vigie · la dernière ouverte (?:à|le) [^<]+<\/span><span class="sec">Résumé de la Vigie indisponible depuis (?:[^<]*, )?\d{1,2} h \d{2} : l’admin ne peut plus le confirmer\.<\/span>/);
  assert.match(stale, /Sécurité : au dernier résumé \((?:[^<]*, )?\d{1,2} h \d{2}\), 2 alertes critiques, 1 haute et 1 moyenne dans la Vigie/);
  assert.match(entry(stale), /<span aria-hidden="true">▲<\/span>/);
  assert.doesNotMatch(entry(stale), /▲ 3/);
});

test('sans la permission securite.voir, ou sans Vigie réglée : aucune trace de la Vigie dans l’admin', async t => {
  const c = await admin(t);
  c.app.decisions.acceptSummary(signed(MV10));
  for (const role of ['moderateur', 'relecteur', 'photographe']) {
    const get = c.as(role);
    for (const url of ['/admin', '/admin/aide']) {
      const html = await get(url);
      assert.match(html, /class="side"/, `${role} ${url}`);
      assert.doesNotMatch(html, /nav-sec|sec-bandeau|alertes\/413/, `${role} ${url}`);
      // L'aide décrit la Vigie (documentation) ; ailleurs, rien n'en paraît.
      if (url === '/admin') assert.doesNotMatch(html, /Vigie|vigie\.nicephos|Sécurité|▲/, role);
    }
  }
  // Sans Vigie côté site (même sous npm run test:vigie) : ni entrée, ni ligne, ni bandeau, même pour un administrateur.
  const plain = await admin(t, { env: { VIGIE_URL: '' }, vigieOptions: undefined });
  assert.equal(plain.app.decisions, undefined);
  const html = await plain.get('/admin');
  assert.doesNotMatch(html, /nav-sec|sec-bandeau|vigie\.nicephos|Sécurité :/);
});
