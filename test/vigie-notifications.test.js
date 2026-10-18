import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VIGIE_KEYS } from './helpers.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions } from '../vigie/decisions.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createEngine } from '../vigie/moteur.js';
import { createIngest } from '../vigie/ingest.js';
import { createNotifier, messageOf } from '../vigie/notifications.js';
import { loadVigieConfig } from '../vigie/config.js';
import { run as cli } from '../vigie/cli.js';
import { createDecisionsClient } from '../server/securite/decisions.js';
import { acceptEdgeList } from '../bordure/decisions.js';

// Vigie, phase D (D1) : notifications Signal et e-mail, résumé signé pour l'admin du site, diagnostic de la bordure.
const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-notif-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const SIGNAL = { url: 'http://nicephos-signal:8080', number: '+33100000000', group: 'group.QUJDREVGR0hJSktM' };
const MAIL = { url: 'smtps://vigie%40exemple.org:x@smtp.exemple.org:465', from: 'Vigie <vigie@exemple.org>', to: ['admin@exemple.org'] };

function vigieOf(t, { signalStatus = 201, start = Date.parse('2026-10-20T12:02:00Z') } = {}) {
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
  const sent = [], mails = [];
  const status = { signal: signalStatus };
  const fetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response('{}', { status: status.signal }); };
  const transport = { sendMail: async m => { mails.push(m); } };
  const notifier = createNotifier({ store, engine, switches, config: { signal: SIGNAL, mail: MAIL, consoleUrl: 'https://vigie.nicephos.art' }, fetchImpl, transport, now });
  const site = (type, severity, extra = {}) => store.add([{ id: crypto.randomUUID(), recu_a: now(), survenu_a: now(), type, severity, canal: 'ingestion signée', confiance: 'rapporté', composant: 'site · système', ...extra }]);
  return { dir, db, store, decisions, switches, engine, notifier, sent, mails, status, clock, site, now };
}

test('notification : alerte critique en mode bloquer → Signal (groupe), message sans adresse ni compte ; observation, gravité moyenne, interrupteur arrêté : rien', async t => {
  const v = vigieOf(t);
  // Rôle donné hors de l'application (critique, mode bloquer par défaut, D3).
  v.site('privilege_permissions_changed', 'critique', { composant: 'site · admin', sub: 'zitadel-qui', ip: '203.0.113.9', detail: JSON.stringify({ hors_application: true, compte: 'zitadel-cible' }) });
  await v.notifier.idle();
  assert.equal(v.sent.length, 1);
  assert.equal(v.sent[0].url, 'http://nicephos-signal:8080/v2/send');
  assert.deepEqual(v.sent[0].body.recipients, [SIGNAL.group]);
  const text = v.sent[0].body.message;
  assert.match(text, /^\[Critique\] /);
  assert.match(text, /Source : site/);
  assert.match(text, /14 h 02 · https:\/\/vigie\.nicephos\.art\/alertes\/\d+/, 'heure de Paris');
  assert.doesNotMatch(text, /203\.0\.113|zitadel-/, 'ni adresse ni compte');
  assert.match(text, /\nRéponse : compte gelé 24 h, sessions du compte fermées\n/, 'la réponse déjà faite, sans cible');
  // Mode « observer » (règle par défaut) : alerte ouverte, aucun message.
  v.site('sys_config_changed', 'haut');
  await v.notifier.idle();
  assert.equal(v.sent.length, 1);
  // Interrupteur des alertes arrêté : cet arrêt lui-même est signalé (surveillance réduite), puis plus rien.
  v.engine.setMode('sigma.restauration', 'alerter', 'test');
  v.switches.set('alertes', 'arret', { duree: '1h', par: 'test', motif: 'essai' });
  await v.notifier.idle();
  assert.equal(v.sent.length, 2);
  assert.match(v.sent[1].body.message, /^\[Moyenne\] Surveillance réduite/);
  v.site('sys_restore', 'haut');
  await v.notifier.idle();
  assert.equal(v.sent.length, 2);
  assert.equal(v.mails.length, 0);
});

test('notification : Signal en échec → e-mail de secours et alerte « canal en échec » ; 20 messages par heure puis une synthèse', async t => {
  const v = vigieOf(t, { signalStatus: 500 });
  v.engine.setMode('sigma.restauration', 'alerter', 'test');
  v.site('sys_restore', 'haut');
  await v.notifier.idle();
  assert.equal(v.mails.length, 1, 'e-mail à la place de Signal');
  assert.match(v.mails[0].subject, /^\[Haute\] /);
  assert.match(v.mails[0].text, /aucune donnée personnelle/);
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_canal_echec'").pluck().get(), 1);
  assert.ok(v.db.prepare("SELECT 1 FROM alerts WHERE regle = 'sigma.canal_echec'").get(), 'alerte dans la console');
  // Plafond : 20 par heure et par canal.
  v.status.signal = 201;
  const before = v.sent.length;
  for (let i = 0; i < 25; i++) await v.notifier.send(`message ${i}`);
  assert.equal(v.sent.length - before, 19, '20 au plus dans l’heure (un essai déjà compté)');
  v.clock.t += 3600e3;
  await v.notifier.tick();
  assert.match(v.sent.at(-1).body.message, /6 autre\(s\) alerte\(s\) l’heure précédente/);
});

test('résumé signé pour l’admin du site : nombres par gravité, titre générique, jamais d’adresse ; lu et vérifié par le site', async t => {
  const v = vigieOf(t, { start: Date.now() });
  v.site('privilege_permissions_changed', 'critique', { composant: 'site · admin', sub: 'zitadel-qui', ip: '203.0.113.9', detail: JSON.stringify({ hors_application: true, compte: 'zitadel-cible' }) });
  v.site('sys_config_changed', 'haut');                       // en observation : pas dans le résumé
  const s = v.engine.summary();
  assert.deepEqual(s.ouvertes, { critique: 1, haut: 0, moyen: 0, bas: 0 });
  assert.equal(s.critique_a_prendre, true);
  assert.equal(s.plus_grave.titre, undefined, 'ni titre ni règle dans le résumé');
  assert.ok(Number.isSafeInteger(s.plus_grave.id));
  const ingest = createIngest({ store: v.store, decisions: v.decisions, ingestKey: KEY, summary: () => v.engine.summary(), consoleUrl: 'https://vigie.nicephos.art' });
  t.after(() => ingest.close());
  const signedGet = p => { const ts = String(Date.now()), nonce = crypto.randomBytes(16).toString('hex'); return { 'x-vigie-ts': ts, 'x-vigie-nonce': nonce, 'x-vigie-sig': crypto.createHmac('sha256', KEY).update(`${ts}.${nonce}.GET ${p}`).digest('hex') }; };
  const res = await ingest.inject({ url: '/v1/resume', headers: signedGet('/v1/resume') });
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body, /203\.0\.113|zitadel-/);
  assert.equal((await ingest.inject({ url: '/v1/resume' })).statusCode, 401, 'requête non signée refusée');
  // Le site vérifie la signature et l'usage ; un résumé n'est jamais pris pour une liste de décisions (ni l'inverse).
  const pubkey = crypto.createPublicKey({ key: Buffer.from(VIGIE_KEYS.pub64, 'base64'), format: 'der', type: 'spki' });
  const client = createDecisionsClient({ url: 'http://x', key: KEY, pubkey, storageDir: tmp(t) });
  const got = client.acceptSummary(res.json());
  assert.deepEqual(got.ouvertes, s.ouvertes);
  assert.equal(got.console, 'https://vigie.nicephos.art');
  assert.equal(client.summary.ouvertes.critique, 1);
  assert.throws(() => client.accept(res.json()), /pas destinée au site/);
  await assert.rejects(acceptEdgeList(res.json(), VIGIE_KEYS.pub64), /pas destinée à la bordure/);
  assert.throws(() => client.acceptSummary(v.decisions.signed()), /pas un résumé/);
  const forged = { ...res.json(), payload: res.json().payload.replace('"critique":1', '"critique":0') };
  assert.throws(() => client.acceptSummary(forged), /signature du résumé fausse/);
});

test('configuration et ligne de commande : Signal, e-mail, console ; diagnostic de la bordure ; essai d’un canal non configuré', async t => {
  const dir = tmp(t);
  const env = { VIGIE_DATA_DIR: dir, VIGIE_SITE_BACKUP_DIR: dir, VIGIE_INGEST_KEY: KEY, VIGIE_LOG_KEY: LOG_KEY, VIGIE_DECISIONS_PRIVATE_KEY: VIGIE_KEYS.priv64 };
  const base = loadVigieConfig(env);
  assert.deepEqual(base.notifications, { signal: null, mail: null, consoleUrl: 'https://vigie.nicephos.art' });
  assert.throws(() => loadVigieConfig({ ...env, VIGIE_SIGNAL_NUMERO: '0612' }), /numéro international/);
  assert.throws(() => loadVigieConfig({ ...env, VIGIE_SIGNAL_NUMERO: '+33100000000' }), /VIGIE_SIGNAL_GROUPE/);
  assert.throws(() => loadVigieConfig({ ...env, VIGIE_SIGNAL_NUMERO: '+33100000000', VIGIE_SIGNAL_GROUPE: SIGNAL.group, VIGIE_SIGNAL_URL: 'http://evil.example.com' }), /réseau interne/);
  assert.equal(loadVigieConfig({ ...env, VIGIE_SIGNAL_NUMERO: '+33100000000', VIGIE_SIGNAL_GROUPE: SIGNAL.group }).notifications.signal.url, 'http://nicephos-signal:8080');
  assert.throws(() => loadVigieConfig({ ...env, VIGIE_SMTP_URL: 'smtps://x@y:465' }), /VIGIE_MAIL_TO/);
  assert.throws(() => loadVigieConfig({ ...env, VIGIE_CONSOLE_URL: 'http://vigie.nicephos.art' }), /https/);
  assert.match(cli(['bordure'], { config: base }), /Blocages copiés dans KV : jamais/);
  await assert.rejects(cli(['notifier', 'essai', 'signal'], { config: base }), /non configuré/);
  assert.equal(messageOf({ id: 3, gravite: 'haut', titre: 'Essai', sources: ['bordure', 'zitadel'], t: Date.parse('2026-10-20T07:05:00Z'), console: 'https://v' }), '[Haute] Essai\nSource : bordure Cloudflare, Zitadel\n09 h 05 · https://v/alertes/3');
});

test('surveillance réduite : un message à chaque geste (même alerte déjà ouverte), qui dit quoi et jusqu’à quand, hors plafond', async t => {
  const v = vigieOf(t);
  for (let i = 0; i < 25; i++) await v.notifier.send(`remplissage ${i}`);     // plafond des alertes atteint
  const before = v.sent.length;
  v.switches.set('blocages', 'arret', { duree: '1h', par: 'Julien', motif: 'essai de la bordure' });
  await v.notifier.idle();
  v.switches.set('blocages', 'arret', { duree: '7j', par: 'quelqu’un', motif: 'prolongé' });
  await v.notifier.idle();
  v.engine.setMode('sigma.cookie_rejoue', 'observer', 'Julien', { motif: 'trop de faux positifs' });
  v.engine.setThreshold('ip', 20, 'Julien', { motif: 'bruit' });
  await v.notifier.idle();
  const msgs = v.sent.slice(before).map(s => s.body.message);
  assert.equal(msgs.length, 4, 'chaque geste prévient, malgré le plafond et l’alerte déjà ouverte');
  assert.match(msgs[0], /^\[Moyenne\] Surveillance réduite : blocages automatiques arrêtés jusqu’à 15 h 02/);
  assert.match(msgs[1], /blocages automatiques arrêtés jusqu’au mar\. 27 oct\., 13 h 02/, 'sept jours plus tard, heure d’hiver comprise');
  assert.match(msgs[2], /règle « Cookie d'une session fermée rejoué depuis un autre appareil » passée de Bloquer à Observer/);
  assert.match(msgs[3], /seuil d’une adresse relevé de 7 à 20 points/);
  assert.ok(msgs.every(m => !/essai de la bordure|prolongé|bruit/.test(m)), 'jamais le motif');
  assert.throws(() => v.engine.setThreshold('ip', 30, 'Julien'), /motif obligatoire/, 'seuil relevé sans motif : refusé partout');
  // Au-delà de 60 gestes dans l'heure : comptés, puis une synthèse à l'heure suivante (jamais perdus sans trace).
  const start = v.sent.length;
  for (let i = 0; i < 70; i++) await v.notifier.send(`geste ${i}`, { prioritaire: true });
  assert.equal(v.sent.length - start, 56, '60 par heure au plus (4 déjà envoyés)');
  v.clock.t += 3600e3;
  await v.notifier.tick();
  assert.match(v.sent.at(-1).body.message, /14 autre\(s\) geste\(s\) l’heure précédente/);
  // Après un arrêt, une règle reprend le mode qu'elle avait (et non son mode de départ).
  v.engine.setMode('sigma.restauration', 'alerter', 'test');
  v.engine.setMode('sigma.restauration', 'arret', 'test', { duree: '1h', motif: 'm' });
  v.clock.t += 2 * 3600e3;
  assert.equal(v.engine.modeOf('sigma.restauration'), 'alerter');
});
