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
import { createConsole } from '../vigie/console/server.js';
import { celluleCsv, lecture, parametres, lireFiltres, masquer, requetesPourEssais, LECTURE_MAX, PAGE } from '../vigie/console/ecrans/evenements.js';

// Console de la Vigie, phase D3b : journal des événements (MV-03), fiche d'un événement, entités (MV-04). Lecture seule,
// requêtes bornées par un index, adresses tronquées pour un Lecteur, détail venu du site échappé, export CSV neutralisé.
const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const TEAM = 'nicephos-essai';
const AUD = 'a1'.repeat(32);
const ISS = `https://${TEAM}.cloudflareaccess.com`;
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const CERTS = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] };
const START = Date.parse('2026-10-20T10:00:00Z');                      // 12 h 00 à Paris
const PIEGE = '<img src=x onerror=alert(1)>';
const EXTRAIT = 'EXTRAIT-SECRET"><svg/onload=fetch(1)>';

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function accessJwt(clock, email) {
  const iat = Math.floor(clock.t / 1000);
  const unsigned = `${b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${b64({ iss: ISS, aud: [AUD], email, sub: `cf-${email}`, iat, exp: iat + 3600 })}`;
  return `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
}

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-console-ev-'));
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  const clock = { t: START };
  const now = () => clock.t;
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now });
  store.onAdded(rows => engine.process(rows));
  let n = 0;
  const oidc = {
    origin: 'https://idp.example', claims: null,
    async start() { n += 1; return { url: `https://idp.example/authorize?n=${n}`, tx: { state: `etat-${n}-${'x'.repeat(30)}`, verifier: 'v', nonce: 'n' } }; },
    async finish() { return this.claims; },
    async logoutUrl() { return null; },
  };
  const ceilings = { 'sub-seb': 'admin', 'sub-camille': 'viewer', 'sub-ana': 'analyst', 'sub-hugo': 'handler' };
  const readCeiling = async sub => ceilings[sub] ?? null;
  const config = { url: 'https://vigie.example', access: { team: TEAM, aud: AUD }, adminSubs: ['sub-seb'], roles: 'deux-cles', projectId: '100', orgId: '200' };
  const c = createConsole({ config, store, engine, switches, decisions, zitadel: null, logger: false, fetchImpl: async () => new Response(JSON.stringify(CERTS)), now, oidc, readCeiling });
  t.after(async () => { await c.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  // Une session par rôle (Lecteur : plafond Lecteur ; Analyste, Intervenant : attribution par l'Administrateur).
  async function login(sub, nom, role) {
    const email = `${sub}@exemple.org`;
    oidc.claims = { sub, nom, amr: ['user', 'mfa'], authTime: clock.t, roles: [`vigie.${role}`] };
    const headers = { 'cf-access-jwt-assertion': accessJwt(clock, email), 'cf-connecting-ip': '198.51.100.7' };
    const r1 = await c.app.inject({ url: '/auth/login?retour=%2F', headers });
    const state = r1.cookies.find(x => x.name === '__Host-vigie-tx').value;
    const r2 = await c.app.inject({ url: `/auth/callback?code=c&state=${state}`, headers, cookies: { '__Host-vigie-tx': state } });
    const cookie = r2.cookies.find(x => x.name === '__Host-vigie').value;
    if (sub !== 'sub-seb' && role !== 'viewer') c.rights.assign({ par: 'sub-seb', parRole: 'admin', sub, role });
    return url => c.app.inject({ url, headers, cookies: { '__Host-vigie': cookie } });
  }
  const events = type => db.prepare('SELECT * FROM events WHERE type = ? ORDER BY seq').all(type).map(r => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
  let k = 0;
  const add = (e, ecart = 1000) => {
    k += 1;
    const id = `ev-${k}-${crypto.randomUUID()}`;
    store.add([{ id, recu_a: clock.t, survenu_a: clock.t - ecart, canal: 'ingestion signée', confiance: 'rapporté', severity: 'moyen', composant: 'site · public', ...e }]);
    // Le numéro de cette ligne (le moteur en écrit d'autres après elle : signaux, alertes).
    return db.prepare('SELECT seq FROM events WHERE id = ?').pluck().get(id);
  };
  return { db, store, engine, clock, c, login, events, add };
}

// Le journal de l'essai : une saisie malveillante (extrait piégé), un piège, une connexion chez Zitadel et une session d'un
// compte nommé, un battement (routine), une adresse IPv6, un réglage qui cite une adresse, une route piégée pour le tableur.
function remplir(v) {
  const s = {};
  v.db.prepare('INSERT INTO console_droits (sub, nom, premiere, derniere) VALUES (?, ?, ?, ?)').run('zitadel-318204977', 'Julien', START, START);
  s.saisie = v.add({ type: 'malicious_input', ip: '198.51.100.23', ip_net: '198.51.100.0', route: '/recherche', emetteur: 'server/securite · saisies', ua: 'Mozilla/5.0 <b>secret-ua</b>', ua_family: 'Firefox · Linux',
    detail: { familles: ['xss'], constats: [{ famille: 'xss', champ: 'query.q', extrait: EXTRAIT }] } });
  v.clock.t += 1000;
  s.piege = v.add({ type: 'malicious_honeypot', ip: '198.51.100.23', ip_net: '198.51.100.0', emetteur: 'server/routes/public.js · champ piège', detail: { piege: PIEGE, formulaire: 'contact' } });
  v.clock.t += 1000;
  s.zitadel = v.add({ type: 'zitadel_connexion', severity: 'info', composant: 'zitadel', confiance: 'constaté', canal: 'API Zitadel', emetteur: 'zitadel · API des événements', sub: 'zitadel-318204977', ip: '192.0.2.77', ip_net: '192.0.2.77' }, 36_000);
  v.clock.t += 1000;
  s.session = v.add({ type: 'session_created', severity: 'info', composant: 'site · connexion', sub: 'zitadel-318204977', ip: '192.0.2.77', ip_net: '192.0.2.0', session: '7be21d90c4a8', route: '/auth/callback' });
  v.clock.t += 1000;
  s.battement = v.add({ type: 'sys_heartbeat', severity: 'info', composant: 'site · système', detail: { attente: 0 } });
  v.clock.t += 1000;
  s.v6 = v.add({ type: 'token_guess', severity: 'bas', ip: '2001:db8:4:1c::5e', ip_net: '2001:db8:4::', route: '/pour-vous/:token', detail: { nature: 'lien de photo offerte' } });
  v.clock.t += 1000;
  v.store.own('vigie_interrupteur', { emetteur: 'console · sub-seb', detail: { adresse_confiance: '203.0.113.9', ip: '203.0.113.9' } });
  s.reglage = v.db.prepare("SELECT MAX(seq) FROM events WHERE type = 'vigie_interrupteur'").pluck().get();
  v.clock.t += 1000;
  s.formule = v.add({ type: 'authz_fail', severity: 'bas', composant: 'site · admin', ip: '198.51.100.23', ip_net: '198.51.100.0', route: '=2+3', emetteur: '@SUM(A1)', detail: { raison: '-cmd|calc' } });
  v.clock.t += 1000;
  // Une alerte et ses événements (alert_events), sur l'adresse.
  const a = v.db.prepare(`INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, statut, premiere, derniere, compteur, score, sources)
    VALUES ('entite.score', 'quorum', 'ip', '198.51.100.23', 'haut', 'observer', 'ouverte', ?, ?, 2, 13.9, '["site","bordure"]')`).run(START, v.clock.t);
  s.alerte = Number(a.lastInsertRowid);
  v.db.prepare('INSERT INTO alert_events (alert_id, seq) VALUES (?, ?), (?, ?)').run(s.alerte, s.saisie, s.alerte, s.piege);
  return s;
}

const balises = html => html.match(/<[a-zA-Z][^>]*>/g) || [];
function sansEnLigne(html, url) {
  for (const b of balises(html)) {
    assert.doesNotMatch(b, /\sstyle\s*=/i, `${url} : attribut style (${b})`);
    assert.doesNotMatch(b, /\son[a-z]+\s*=/i, `${url} : attribut on…= (${b})`);
    if (/^<script/i.test(b)) assert.match(b, /\ssrc="\/static\//, `${url} : script en ligne`);
    if (/^<style/i.test(b)) assert.fail(`${url} : style en ligne`);
  }
  assert.doesNotMatch(html, /href="javascript:/i);
}

test('journal (MV-03) : rendu en Administrateur et en Lecteur, adresses tronquées, valeurs piégées échappées, rien en ligne', async t => {
  const v = setup(t);
  const s = remplir(v);
  const admin = await v.login('sub-seb', 'Sébastien', 'admin');
  const lect = await v.login('sub-camille', 'Camille', 'viewer');
  const ra = await admin('/evenements');
  assert.equal(ra.statusCode, 200);
  assert.equal(ra.headers['cache-control'], 'no-store');
  sansEnLigne(ra.body, '/evenements');
  assert.match(ra.body, /<h1>Événements<\/h1>/);
  assert.match(ra.body, /198\.51\.100\.23/);
  assert.match(ra.body, /2001:db8:4:1c::5e/);
  assert.match(ra.body, />malicious_input<\/code>/);
  assert.match(ra.body, />malicious_honeypot<\/code>/);
  // Le piège et l'extrait : échappés, jamais en HTML.
  assert.ok(!ra.body.includes(PIEGE) && !ra.body.includes('<svg/onload'), 'valeur piégée rendue en HTML');
  assert.ok(ra.body.includes('&lt;img src=x onerror=alert(1)&gt;'), 'piège échappé');
  assert.match(ra.body, /EXTRAIT-SECRET&quot;&gt;&lt;svg\/onl/, 'extrait coupé à 24 signes, échappé');
  assert.match(ra.body, /de plus, non affichés/);
  // La routine est masquée et comptée ; le compte nommé ; l'export offert à un Administrateur.
  assert.doesNotMatch(ra.body, />sys_heartbeat<\/code>/);
  assert.match(ra.body, /\d+.lignes? de routine masquées?.{0,3}: [^<]*battement du site/);
  assert.match(ra.body, /Julien/);
  assert.match(ra.body, /href="\/evenements\.csv\?periode=aujourdhui"/);
  assert.match(ra.body, /Exporter les \d+ en CSV/);
  // Avec la routine.
  assert.match((await admin('/evenements?type=tout')).body, />sys_heartbeat<\/code>/);

  const rl = await lect('/evenements');
  assert.equal(rl.statusCode, 200);
  sansEnLigne(rl.body, '/evenements (Lecteur)');
  for (const ip of ['198.51.100.23', '192.0.2.77', '2001:db8:4:1c::5e', '203.0.113.9']) assert.ok(!rl.body.includes(ip), `adresse complète montrée à un Lecteur : ${ip}`);
  assert.match(rl.body, /198\.51\.100\.0\/24/);
  assert.match(rl.body, /2001:db8:4::\/48/);
  assert.match(rl.body, /203\.0\.113\.0\/24/, 'adresse d’un détail tronquée');
  assert.match(rl.body, /\(tronquée\)/);
  assert.match(rl.body, /href="\/entites\/reseau\/198\.51\.100\.0"/);
  assert.doesNotMatch(rl.body, /EXTRAIT-SECRET/);
  assert.match(rl.body, /Extrait réservé aux Analystes et aux Administrateurs/);
  assert.doesNotMatch(rl.body, /evenements\.csv/, 'pas d’export pour un Lecteur');
  assert.match(rl.body, /Lecture seule/);
  // Un Intervenant voit les adresses, pas l'extrait, pas d'export.
  const inter = await v.login('sub-hugo', 'Hugo', 'handler');
  const ri = await inter('/evenements');
  assert.match(ri.body, /198\.51\.100\.23/);
  assert.doesNotMatch(ri.body, /EXTRAIT-SECRET/);
  assert.doesNotMatch(ri.body, /evenements\.csv/);
  assert.ok(s.alerte);
});

test('journal : filtres indexés, adresse complète refusée à un Lecteur (redirection vers le réseau), erreur près du champ, alerte', async t => {
  const v = setup(t);
  const s = remplir(v);
  const admin = await v.login('sub-seb', 'Sébastien', 'admin');
  const lect = await v.login('sub-camille', 'Camille', 'viewer');
  const red = await lect('/evenements?periode=7j&adresse=198.51.100.23&source=site');
  assert.equal(red.statusCode, 302);
  assert.equal(red.headers.location, '/evenements?periode=7j&source=site&adresse=198.51.100.0%2F24');
  const rn = await lect(red.headers.location);
  assert.equal(rn.statusCode, 200);
  assert.match(rn.body, />malicious_input<\/code>/);
  assert.doesNotMatch(rn.body, /198\.51\.100\.23/);
  // Adresse exacte (Administrateur) : ses seuls événements.
  const ra = await admin('/evenements?adresse=198.51.100.23');
  assert.match(ra.body, />malicious_input<\/code>/);
  assert.doesNotMatch(ra.body, />token_guess<\/code>/);
  // Compte, type, gravité, source.
  const rc = await admin('/evenements?compte=zitadel-318204977');
  assert.match(rc.body, />zitadel_connexion<\/code>/);
  assert.match(rc.body, />session_created<\/code>/);
  assert.doesNotMatch(rc.body, />malicious_input<\/code>/);
  assert.match((await admin('/evenements?source=zitadel')).body, /2 événements|1 événement/);
  const rg = await admin('/evenements?gravite=moyenne');
  assert.match(rg.body, />malicious_input<\/code>/);
  assert.doesNotMatch(rg.body, />token_guess<\/code>/);
  assert.match((await admin('/evenements?type=token_guess')).body, /1 événement aujourd’hui/);
  // Liste vide pour un filtre : la phrase reprend les filtres, deux issues.
  const vide = await admin('/evenements?source=zitadel&adresse=198.51.100.23');
  assert.match(vide.body, /Aucun événement de Zitadel pour l’adresse <span class="ip">198\.51\.100\.23<\/span> aujourd’hui\./);
  assert.match(vide.body, /Fiche de l’adresse 198\.51\.100\.23/);
  // Filtre invalide : la saisie reste (échappée), l'erreur près du champ, la liste des autres filtres.
  const err = await admin(`/evenements?adresse=${encodeURIComponent('198.51.100"><b>')}`);
  assert.equal(err.statusCode, 200);
  assert.match(err.body, /aria-invalid="true"/);
  assert.match(err.body, /Erreur/);
  assert.match(err.body, /value="198\.51\.100&quot;&gt;&lt;b&gt;"/);
  assert.match(err.body, />malicious_input<\/code>/);
  assert.match((await admin('/evenements?adresse=198.51.100.0%2F16')).body, /non pris en charge/);
  // Par alerte (alert_events) : ses deux événements, sans période.
  const al = await admin(`/evenements?alerte=${s.alerte}`);
  assert.match(al.body, /2 événements de l’alerte/);
  assert.match(al.body, new RegExp(`href="/evenements/${s.saisie}"`));
  assert.match(al.body, new RegExp(`href="/evenements/${s.piege}"`));
  assert.doesNotMatch(al.body, new RegExp(`href="/evenements/${s.v6}"`));
});

test('journal : pages de 50 par jeu de clés (avant=<seq>), sans trou ni doublon', async t => {
  const v = setup(t);
  const tous = [];
  for (let i = 0; i < 120; i++) { tous.push(v.add({ type: 'token_guess', severity: 'bas', ip: `203.0.113.${i % 250}`, ip_net: '203.0.113.0', detail: { nature: 'essai' } })); if (i % 7 === 0) v.clock.t += 1000; }
  const admin = await v.login('sub-seb', 'Sébastien', 'admin');
  const vus = [];
  let url = '/evenements?type=token_guess';
  for (let p = 1; url && p < 10; p++) {
    const r = await admin(url);
    assert.equal(r.statusCode, 200);
    const seqs = [...r.body.matchAll(/class="ligne-lien" href="\/evenements\/(\d+)"/g)].map(m => Number(m[1]));
    assert.ok(seqs.length <= PAGE);
    if (p === 1) { assert.equal(seqs.length, PAGE); assert.match(r.body, /Page 1 sur 3 · événements 1 à 50 sur 120/); assert.doesNotMatch(r.body, /Les plus récents/); }
    vus.push(...seqs);
    const m = /href="([^"]*avant=\d+[^"]*)" rel="next"/.exec(r.body);
    url = m ? m[1].replaceAll('&amp;', '&') : null;
    if (p === 2) assert.match(r.body, /Les plus récents/);
  }
  assert.equal(vus.length, 120);
  assert.equal(new Set(vus).size, 120);
  assert.deepEqual([...vus].sort((a, b) => a - b), [...tous].sort((a, b) => a - b));
  assert.deepEqual(vus, [...vus].sort((a, b) => b - a), 'du plus récent au plus ancien');
});

test('fiche d’un événement : deux heures, origine, maillon, alertes, détail échappé ; 404 propre ; Lecteur tronqué', async t => {
  const v = setup(t);
  const s = remplir(v);
  const admin = await v.login('sub-seb', 'Sébastien', 'admin');
  const lect = await v.login('sub-camille', 'Camille', 'viewer');
  const r = await admin(`/evenements/${s.saisie}`);
  assert.equal(r.statusCode, 200);
  sansEnLigne(r.body, '/evenements/:seq');
  assert.match(r.body, /<title>Événement n° \d+ · Vigie · Nicephos<\/title>/);
  assert.match(r.body, /Deux heures/);
  assert.match(r.body, /reçu \+ \d/);
  assert.match(r.body, /ingestion signée/);
  assert.match(r.body, /rapporté/);
  assert.match(r.body, /server\/securite · saisies/);
  assert.match(r.body, new RegExp(`href="/alertes/${s.alerte}"`));
  const chain = v.db.prepare('SELECT chain FROM events WHERE seq = ?').pluck().get(s.saisie);
  assert.ok(r.body.includes(chain), 'maillon de la chaîne');
  assert.match(r.body, /href="\/entites\/ip\/198\.51\.100\.23"/);
  assert.match(r.body, /secret-ua/, 'agent complet pour un Administrateur');
  assert.ok(!r.body.includes('<b>secret-ua</b>'), 'agent échappé');
  assert.ok(!r.body.includes('<svg/onload'), 'extrait échappé');
  assert.match(r.body, /constats\[0\]\.extrait/);
  const p = await admin(`/evenements/${s.piege}`);
  assert.ok(p.body.includes('&lt;img src=x onerror=alert(1)&gt;') && !p.body.includes(PIEGE));
  // Lecteur : ni adresse complète, ni extrait, ni agent complet.
  const rl = await lect(`/evenements/${s.saisie}`);
  assert.equal(rl.statusCode, 200);
  sansEnLigne(rl.body, '/evenements/:seq (Lecteur)');
  assert.doesNotMatch(rl.body, /198\.51\.100\.23|EXTRAIT-SECRET|secret-ua/);
  assert.match(rl.body, /réservé aux Analystes et aux Administrateurs/);
  assert.doesNotMatch((await lect(`/evenements/${s.zitadel}`)).body, /192\.0\.2\.77/, 'réseau de Zitadel (adresse complète) tronqué');
  assert.doesNotMatch((await lect(`/evenements/${s.reglage}`)).body, /203\.0\.113\.9/, 'adresse du détail tronquée');
  // Inconnu, ou pas un numéro : 404 dans la console.
  for (const u of ['/evenements/999999', '/evenements/abc', '/evenements/1e3']) {
    const n = await admin(u);
    assert.equal(n.statusCode, 404, u);
    assert.match(n.body, /Événement introuvable/);
    sansEnLigne(n.body, u);
  }
});

test('entités (MV-04) : liste, fiche d’une adresse, d’un compte, d’une session ; un Lecteur va au réseau ; 404 propre', async t => {
  const v = setup(t);
  const s = remplir(v);
  const admin = await v.login('sub-seb', 'Sébastien', 'admin');
  const lect = await v.login('sub-camille', 'Camille', 'viewer');
  const l = await admin('/entites');
  assert.equal(l.statusCode, 200);
  sansEnLigne(l.body, '/entites');
  assert.match(l.body, /Les plus chaudes/);
  assert.match(l.body, /href="\/entites\/ip\/198\.51\.100\.23"/);
  const ll = await lect('/entites');
  assert.equal(ll.statusCode, 200);
  assert.doesNotMatch(ll.body, /198\.51\.100\.23|2001:db8:4:1c::5e|192\.0\.2\.77/);

  const f = await admin('/entites/ip/198.51.100.23');
  assert.equal(f.statusCode, 200);
  sansEnLigne(f.body, '/entites/ip');
  assert.match(f.body, /<title>Fiche d’une adresse · Vigie · Nicephos<\/title>/, 'le titre de l’onglet ne porte pas l’adresse');
  assert.match(f.body, /Score par source/);
  assert.match(f.body, /<meter class="vg-m/);
  assert.match(f.body, /Seuil d’une adresse/);
  assert.match(f.body, /Vue avec/);
  assert.match(f.body, /href="\/entites\/reseau\/198\.51\.100\.0"/);
  assert.match(f.body, new RegExp(`Ouvrir l’alerte #${s.alerte}`));
  assert.match(f.body, /Derniers événements/);
  assert.match(f.body, />malicious_input<\/code>/);
  assert.match(f.body, /Réponse automatique|Aucun contrôle des rôles réussi/);
  assert.ok(!f.body.includes(PIEGE) && !f.body.includes('<svg/onload'));
  // Actions forcées (D3c) : des formulaires POST vers /decisions seulement (vigie-console-decisions.test.js les vérifie).
  for (const fo of f.body.slice(f.body.indexOf('<main'), f.body.indexOf('</main>')).match(/<form[^>]*method="post"[^>]*>/gi) || []) assert.match(fo, /action="\/decisions"/);

  // Lecteur : l'adresse complète n'a pas de fiche, ni dans l'adresse de la page ; redirection vers le réseau.
  const r = await lect('/entites/ip/198.51.100.23');
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/entites/reseau/198.51.100.0');
  const fr = await lect(r.headers.location);
  assert.equal(fr.statusCode, 200);
  sansEnLigne(fr.body, '/entites/reseau (Lecteur)');
  assert.doesNotMatch(fr.body, /198\.51\.100\.23/);
  assert.match(fr.body, /198\.51\.100\.0\/24/);
  assert.match(fr.body, /vous voyez le réseau, pas l’adresse/);
  assert.doesNotMatch(fr.body.slice(fr.body.indexOf('<main'), fr.body.indexOf('</main>')), /<form[^>]*method="post"|<button/i, 'aucune action pour un Lecteur');
  assert.match(fr.body, new RegExp(`#${s.alerte}`), 'les alertes des adresses du réseau');
  assert.equal((await lect('/entites/ip/2001:db8:4:1c::5e')).headers.location, '/entites/reseau/2001%3Adb8%3A4%3A%3A');
  // Réseau écrit comme une adresse (Zitadel) : un Lecteur va au réseau tronqué.
  assert.equal((await lect('/entites/reseau/192.0.2.77')).headers.location, '/entites/reseau/192.0.2.0');
  // Recherche : un Lecteur qui tape une adresse complète va au réseau.
  assert.equal((await lect('/entites?type=ip&cle=198.51.100.23')).headers.location, '/entites/reseau/198.51.100.0');
  assert.equal((await admin('/entites?type=ip&cle=198.51.100.23')).headers.location, '/entites/ip/198.51.100.23');
  const rech = await admin('/entites?type=ip&cle=pas-une-adresse');
  assert.equal(rech.statusCode, 200);
  assert.match(rech.body, /aria-invalid="true"/);

  // Compte : nom, adresses vues, session, derniers événements.
  const c = await admin('/entites/compte/zitadel-318204977');
  assert.equal(c.statusCode, 200);
  sansEnLigne(c.body, '/entites/compte');
  assert.match(c.body, /Julien/);
  assert.match(c.body, /Fiche de l’adresse 192\.0\.2\.77/);
  assert.match(c.body, /href="\/entites\/session\/7be21d90c4a8"/);
  assert.match(c.body, />zitadel_connexion<\/code>/);
  const cl = await lect('/entites/compte/zitadel-318204977');
  assert.equal(cl.statusCode, 200);
  assert.doesNotMatch(cl.body, /192\.0\.2\.77/);
  // Session : retrouvée par son compte.
  const se = await admin('/entites/session/7be21d90c4a8');
  assert.equal(se.statusCode, 200);
  assert.match(se.body, />session_created<\/code>/);

  // Inconnues : 404 dans la console.
  for (const u of ['/entites/compte/personne', '/entites/ip/pas-une-adresse', '/entites/planete/x', '/entites/ip/203.0.113.250']) {
    const n = await admin(u);
    assert.equal(n.statusCode, 404, u);
    assert.match(n.body, /Entité introuvable/);
    sansEnLigne(n.body, u);
  }
});

test('export CSV : Analyste seulement, cellules neutralisées, séparateur « ; », UTF-8 avec BOM, noté au journal', async t => {
  const v = setup(t);
  remplir(v);
  const lect = await v.login('sub-camille', 'Camille', 'viewer');
  const inter = await v.login('sub-hugo', 'Hugo', 'handler');
  assert.equal((await lect('/evenements.csv')).statusCode, 403);
  assert.equal((await inter('/evenements.csv')).statusCode, 403);
  assert.equal(v.events('vigie_console_export').length, 0);
  const ana = await v.login('sub-ana', 'Ana', 'analyst');
  const ra = await ana('/evenements');
  assert.match(ra.body, /evenements\.csv/);
  const r = await ana('/evenements.csv?periode=aujourdhui&adresse=198.51.100.23');
  assert.equal(r.statusCode, 200);
  assert.match(r.headers['content-type'], /^text\/csv; charset=utf-8/);
  assert.match(r.headers['content-disposition'], /^attachment; filename="vigie-evenements-20261020-\d{4}\.csv"$/);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.ok(r.body.startsWith('\ufeff"numéro";"heure à la source (Paris)"'));
  const lignes = r.body.split('\r\n').filter(Boolean);
  assert.equal(lignes.length, 1 + 3, 'en-tête et les trois événements de l’adresse');
  assert.ok(r.body.includes('"\'=2+3"'), 'route neutralisée');
  assert.ok(r.body.includes('"\'@SUM(A1)"'), 'émetteur neutralisé');
  assert.ok(r.body.includes('"198.51.100.23"'), 'adresses entières');
  assert.ok(r.body.includes('EXTRAIT-SECRET""&gt;') || r.body.includes('EXTRAIT-SECRET\\""><svg'), 'détail brut, guillemets doublés');
  const ex = v.events('vigie_console_export');
  assert.equal(ex.length, 1);
  assert.equal(ex[0].sub, 'sub-ana');
  assert.equal(ex[0].composant, 'vigie · console');
  assert.deepEqual(ex[0].detail, { filtres: { periode: 'aujourdhui', adresse: '198.51.100.0/24' }, lignes: 3 });
  // Filtre refusé : rien ne sort, rien n'est noté.
  assert.equal((await ana('/evenements.csv?adresse=nimporte')).statusCode, 400);
  assert.equal(v.events('vigie_console_export').length, 1);
  // Neutralisation, cellule par cellule.
  for (const [entree, sortie] of [['=1+1', '"\'=1+1"'], ['+33 6', '"\'+33 6"'], ['-2', '"\'-2"'], ['@x', '"\'@x"'], ['\tx', '"\'\tx"'], ['\rx', '"\'\rx"'],
    ['a"b', '"a""b"'], ['texte', '"texte"'], [null, '""'], [12, '"12"']]) assert.equal(celluleCsv(entree), sortie);
});

test('bornes : chaque lecture du journal passe par un index, dans son ordre (sans tri), avec un LIMIT ; jamais OFFSET', async t => {
  const v = setup(t);
  remplir(v);
  const plan = (sql, params) => v.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map(x => x.detail);
  const t0 = v.clock.t;
  const cas = {
    recu: [{}, /USING (COVERING )?INDEX events_recu/],
    type: [{ type: 'token_guess' }, /USING (COVERING )?INDEX events_type/],
    sub: [{ compte: 'zitadel-318204977' }, /USING (COVERING )?INDEX events_sub\b/],
    ip: [{ adresse: '198.51.100.23' }, /USING (COVERING )?INDEX events_ip/],
    ip_net: [{ adresse: '198.51.100.0/24' }, /USING (COVERING )?INDEX events_net/],
    alerte: [{ alerte: '1' }, /^SEARCH ae USING (COVERING )?INDEX sqlite_autoindex_alert_events_1/],
  };
  for (const [k, [query, attendu]] of Object.entries(cas)) {
    const lf = lireFiltres({ periode: '7j', ...query }, 'admin', t0);
    assert.equal(lf.driver.k, k);
    for (const cols of ['*', 'seq, recu_a, type, severity, composant, ip, ip_net, sub']) {
      const st = lecture(v.db, lf.driver, cols);
      assert.match(st.source, /LIMIT \?$/);
      assert.doesNotMatch(st.source, /OFFSET/i);
      const params = parametres(lf, null, LECTURE_MAX);
      assert.equal(params.at(-1), LECTURE_MAX);
      const p = plan(st.source, params);
      assert.ok(p.some(d => attendu.test(d)), `${k} : ${p.join(' | ')}`);
      assert.ok(!p.some(d => /TEMP B-TREE/.test(d)), `${k} : tri hors index : ${p.join(' | ')}`);
      assert.ok(!p.some(d => /^SCAN (events|e)\b(?! USING)/.test(d)), `${k} : parcours de la table : ${p.join(' | ')}`);
    }
  }
  // Les requêtes des fiches : un index, une borne.
  const q = requetesPourEssais(v.db);
  for (const [nom, st] of Object.entries(q)) {
    if (typeof st !== 'object' || !st?.source) continue;
    const n = (st.source.match(/\?/g) || []).length;
    const p = plan(st.source, Array(n).fill(1));
    assert.ok(!p.some(d => /^SCAN (events|alerts|alert_events|entity_links|decisions|entities)\b(?! USING)/.test(d)), `${nom} : ${p.join(' | ')}`);
    if (/FROM (events|alerts|entity_links|decisions)\b/.test(st.source) && !/WHERE seq = \?$|WHERE id = \?$/.test(st.source)) assert.match(st.source, /LIMIT \d+/, `${nom} : sans LIMIT`);
  }
  // Masque d'un texte pour un Lecteur : IPv4, IPv6, IPv4 dans IPv6 ; les heures restent.
  assert.equal(masquer('de 198.51.100.23 et 2001:db8:4:1c::5e à 14:02:33 (::ffff:192.0.2.7)', 'viewer'), 'de 198.51.100.0/24 et 2001:db8:4::/48 à 14:02:33 (192.0.2.0/24)');
  assert.equal(masquer('198.51.100.23', 'handler'), '198.51.100.23');
});

test('export CSV par tranches (audit D3-D4) : même fichier quelle que soit la tranche, heures de Paris justes (changement d’heure compris)', async t => {
  const { exportCsv, EXPORT_TRANCHE } = await import('../vigie/console/ecrans/evenements.js');
  const v = setup(t);
  // Autour du passage à l'heure d'hiver (25 octobre 2026, 3 h → 2 h à Paris) : 400 événements, parfois plusieurs dans la
  // même milliseconde (ordre par numéro), de gravités et d'adresses diverses.
  v.clock.t = Date.parse('2026-10-25T00:20:00Z');
  const seqs = [];
  for (let i = 0; i < 400; i++) {
    if (i % 3) v.clock.t += 13_337;
    seqs.push(v.add({ type: i % 5 ? 'malicious_excess_404' : 'malicious_input', severity: i % 4 ? 'bas' : 'moyen', ip: `203.0.113.${i % 9}`, ip_net: '203.0.113.0', route: `/r${i}` }, (i % 7) * 1000));
  }
  const id = Number(v.db.prepare("INSERT INTO alerts (regle, entite_kind, entite_key, gravite, mode, premiere, derniere) VALUES ('entite.score', 'ip', '203.0.113.1', 'haut', 'observer', 1, 2)").run().lastInsertRowid);
  for (const s of seqs.filter((_, i) => i % 2)) v.db.prepare('INSERT INTO alert_events (alert_id, seq) VALUES (?, ?)').run(id, s);
  const t1 = v.clock.t + 60e3;
  const paris = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (const query of [{ periode: '7j' }, { periode: 'tout', type: 'tout' }, { periode: '7j', gravite: 'moyen' }, { periode: '7j', adresse: '203.0.113.4' }, { alerte: String(id) }]) {
    const ref = await exportCsv({ db: v.db, query, role: 'admin', t: t1, tranche: EXPORT_TRANCHE });
    assert.ok(ref.n > 0, JSON.stringify(query));
    for (const tranche of [1, 7, 64, 199]) {
      const r = await exportCsv({ db: v.db, query, role: 'admin', t: t1, tranche });
      assert.deepEqual(r, ref, `${JSON.stringify(query)}, tranche de ${tranche}`);
    }
    // Les heures : celles de Paris à la seconde, lues une à une par Intl.
    const lignes = ref.csv.replace(/^\ufeff/, '').split('\r\n').filter(Boolean).slice(1).map(l => l.split(';').map(c => c.slice(1, -1)));
    for (const l of lignes) {
      const r = v.db.prepare('SELECT recu_a, survenu_a FROM events WHERE seq = ?').get(Number(l[0]));
      assert.equal(l[1], paris.format(r.survenu_a).replace('T', ' '));
      assert.equal(l[2], paris.format(r.recu_a).replace('T', ' '));
    }
    // Toujours du plus récent au plus ancien (ordre de réception, puis numéro), sans doublon.
    const nums = lignes.map(l => Number(l[0]));
    assert.equal(new Set(nums).size, nums.length);
  }
  // L'heure d'été puis l'heure d'hiver dans le même fichier : 2 h 59 (heure d'été) puis de nouveau 2 h 00 à Paris.
  const tout = (await exportCsv({ db: v.db, query: { periode: '7j' }, role: 'admin', t: t1 })).csv;
  assert.match(tout, /"2026-10-25 02:59:\d\d"/);
  assert.match(tout, /"2026-10-25 02:00:\d\d"/);
});
