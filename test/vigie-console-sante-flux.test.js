import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import { VIGIE_KEYS } from './helpers.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions } from '../vigie/decisions.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createEngine } from '../vigie/moteur.js';
import { createConsole } from '../vigie/console/server.js';
import { overview } from '../vigie/console/vue-ensemble.js';
import * as F from '../vigie/console/flux.js';
import { lireFlux, vueFlux, vueSante, barreAlertes, provenanceAlertes, origineDe, cheminDe, phraseFlux, ROUTINE } from '../vigie/console/ecrans/sante-flux.js';

// Console de la Vigie, phase D3b : santé (MV-07), flux et provenance des alertes (MV-11) et la barre de provenance de la vue
// d'ensemble (MV-01). Lecture seule ; base de la Vigie dans un dossier temporaire ; faux Cloudflare Access et faux Zitadel.

const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const TEAM = 'nicephos-essai';
const AUD = 'a1'.repeat(32);
const ISS = `https://${TEAM}.cloudflareaccess.com`;
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const CERTS = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] };
const T0 = Date.parse('2026-10-17T12:20:00Z');          // sam. 17 oct. 2026, 14 h 20 à Paris
const PIEGE = '<img src=x onerror=alert(1)>';
const VIEWS = fileURLToPath(new URL('../vigie/console/views/', import.meta.url));

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function accessJwt(clock, email = 'seb@exemple.org') {
  const iat = Math.floor(clock.t / 1000);
  const unsigned = `${b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${b64({ iss: ISS, aud: [AUD], email, sub: `cf-${email}`, iat, exp: iat + 3600 })}`;
  return `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
}

function setup(t, { moteur = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-sante-flux-'));
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  const clock = { t: T0 };
  const now = () => clock.t;
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now });
  if (moteur) store.onAdded(rows => engine.process(rows));
  const oidc = {
    origin: 'https://idp.example', claims: null, n: 0,
    async start() { this.n += 1; return { url: `https://idp.example/authorize?n=${this.n}`, tx: { state: `etat-${this.n}-${'x'.repeat(30)}`, verifier: 'v', nonce: 'n' } }; },
    async finish() { return this.claims; },
    async logoutUrl() { return null; },
  };
  const ceilings = { 'sub-seb': 'admin', 'sub-camille': 'viewer' };
  const config = { url: 'https://vigie.example', access: { team: TEAM, aud: AUD }, adminSubs: ['sub-seb'], roles: 'deux-cles', projectId: '100', orgId: '200' };
  const c = createConsole({ config, store, engine, switches, decisions, zitadel: null, logger: false, now, oidc, readCeiling: async sub => ceilings[sub] ?? null,
    fetchImpl: async () => new Response(JSON.stringify(CERTS), { status: 200 }) });
  t.after(async () => { await c.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const h = email => ({ 'cf-access-jwt-assertion': accessJwt(clock, email), 'cf-connecting-ip': '198.51.100.7' });
  async function login({ sub = 'sub-seb', nom = 'Sébastien', roles = ['vigie.admin'], email = 'seb@exemple.org' } = {}) {
    oidc.claims = { sub, nom, amr: ['user', 'mfa'], authTime: clock.t, roles };
    const headers = h(email);
    const r1 = await c.app.inject({ url: '/auth/login?retour=%2F', headers });
    const state = r1.cookies.find(x => x.name === '__Host-vigie-tx')?.value;
    const r2 = await c.app.inject({ url: `/auth/callback?code=code&state=${state}`, headers, cookies: { '__Host-vigie-tx': state } });
    const cookie = r2.cookies.find(x => x.name === '__Host-vigie')?.value;
    return url => c.app.inject({ url, headers, cookies: { '__Host-vigie': cookie } });
  }
  return { db, store, engine, switches, clock, now, app: c.app, login };
}

// Un journal de sept jours et demi, de toutes les sources, et des alertes reliées à leurs événements (alert_events).
let nId = 0;
const ev = (recu_a, type, severity, composant, extra = {}) => ({ id: `e${++nId}`, recu_a, survenu_a: recu_a, type, severity, composant, canal: 'essai', confiance: 'rapporté', ...extra });
function peupler({ db, store }, { piege = false } = {}) {
  const rows = [];
  for (let d = 9; d >= 0; d--) {
    const j = T0 - d * 864e5;
    for (let i = 0; i < 6; i++) rows.push(ev(j - i * 60e3, 'sys_heartbeat', 'info', 'site · système', { detail: { attente: 0 } }));
    for (let i = 0; i < 12; i++) rows.push(ev(j - 3600e3 - i * 7e3, 'malicious_excess_404', 'bas', 'site · public', { ip: '198.51.100.23', ip_net: '198.51.100.0', country: 'NL', route: '/wp-login.php' }));
    for (let i = 0; i < 4; i++) rows.push(ev(j - 2 * 3600e3 - i * 9e3, 'authn_login_fail', 'moyen', 'site · connexion', { ip: '203.0.113.9', country: piege ? PIEGE : 'US' }));
    rows.push(ev(j - 3 * 3600e3, 'authn_login_success', 'info', 'site · connexion', { ip: '192.0.2.10', sub: 'zitadel-318204977', country: 'FR' }));
    for (let i = 0; i < 3; i++) rows.push(ev(j - 3 * 3600e3 + i * 60e3, 'sensitive_read', 'info', 'site · admin', { ip: '192.0.2.10', sub: 'zitadel-318204977', country: 'FR' }));
    rows.push(ev(j - 4 * 3600e3, 'zitadel_connexion', 'info', 'zitadel', { sub: 'zitadel-318204977' }));
    rows.push(ev(j - 4 * 3600e3 + 1000, 'zitadel_echec', 'moyen', 'zitadel', { ip: '203.0.113.9' }));
    for (let i = 0; i < 2; i++) rows.push(ev(j - 5 * 3600e3 - i * 60e3, 'bordure_rafale', 'moyen', 'bordure', { ip: '198.51.100.23', country: 'NL', detail: { asn: '64501', operateur: piege ? PIEGE : 'Hébergeur de serveurs' } }));
    rows.push(ev(j - 5 * 3600e3 + 5000, 'bordure_blocage', 'info', 'bordure', { ip: '192.0.2.10', country: 'FR', detail: { asn: '3215', operateur: 'Orange' } }));
    rows.push(ev(j - 6 * 3600e3, 'vigie_controle_roles', 'info', 'vigie · contrôle', { detail: { instantane: 'site-x.db', administrateurs: 3 } }));
    rows.push(ev(j - 6 * 3600e3 + 1, 'vigie_signal', 'info', 'vigie · contrôle'));
  }
  rows.push(ev(T0 - 2 * 3600e3, 'sys_config_changed', 'haut', 'site · système', { sub: 'zitadel-329906113' }));
  rows.push(ev(T0 - 3600e3, 'vigie_interrupteur', 'moyen', 'vigie · ligne de commande', { detail: { interrupteur: 'blocages' } }));
  store.add(rows);
  const seqs = (type, depuis = Date.parse('2026-10-11T00:00:00Z')) => db.prepare('SELECT seq FROM events WHERE type = ? AND recu_a >= ? ORDER BY seq').pluck().all(type, depuis);
  const alerte = (a, liens) => {
    const id = Number(db.prepare(`INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, statut, premiere, derniere, compteur, score, sources)
      VALUES (@regle, @cas, @entite_kind, @entite_key, @gravite, @mode, @statut, @premiere, @derniere, @compteur, @score, @sources)`)
      .run({ cas: null, statut: 'ouverte', compteur: liens.length || 1, score: null, sources: '["site"]', mode: 'alerter', premiere: T0 - 5 * 864e5, derniere: T0 - 3600e3, ...a }).lastInsertRowid);
    const ins = db.prepare('INSERT INTO alert_events (alert_id, seq) VALUES (?, ?)');
    for (const s of liens) ins.run(id, s);
    return id;
  };
  const conf = seqs('sys_config_changed');
  const ids = {};
  ids.config = alerte({ regle: 'sigma.configuration', entite_kind: 'compte', entite_key: 'zitadel-329906113', gravite: 'critique' }, conf);
  // Score d'une adresse : ses 404 du site et ses rafales en bordure, sur la période.
  const score = [...seqs('malicious_excess_404'), ...seqs('bordure_rafale')];
  ids.score = alerte({ regle: 'entite.score', entite_kind: 'ip', entite_key: '198.51.100.23', gravite: 'haut', sources: '["bordure","site"]', score: 14.2 }, score);
  // Une corrélation (règle Sigma de corrélation) qui partage quelques événements avec l'alerte de score (comptés une fois).
  ids.correl = alerte({ regle: 'sigma.rafale_erreurs', entite_kind: 'ip', entite_key: '198.51.100.23', gravite: 'moyen', derniere: T0 - 2 * 3600e3 }, seqs('malicious_excess_404').slice(0, 10));
  ids.echecs = alerte({ regle: 'sigma.zitadel_echecs_repetes', entite_kind: 'ip', entite_key: '203.0.113.9', gravite: 'moyen', sources: '["zitadel"]', derniere: T0 - 3 * 3600e3 }, seqs('zitadel_echec'));
  // Close, plus ancienne que la période : hors des flux de 7 jours, dans ceux de 30.
  ids.vieille = alerte({ regle: 'sigma.oidc_echecs_repetes', entite_kind: 'ip', entite_key: '203.0.113.9', gravite: 'bas', statut: 'close', premiere: T0 - 9 * 864e5, derniere: T0 - 8 * 864e5 },
    seqs('authn_login_fail', T0 - 10 * 864e5).slice(0, 4));
  // Sans événement (détecteur « silence ») : provenance dite par l'entité.
  ids.silence = alerte({ regle: 'detecteur.silence', entite_kind: 'site', entite_key: 'battement', gravite: 'haut', sources: '["vigie"]', derniere: T0 - 1800e3 }, []);
  return ids;
}

function verifierPage(html) {
  for (const b of html.match(/<[a-zA-Z][^>]*>/g) || []) {
    assert.doesNotMatch(b, /\sstyle\s*=/i, `attribut style : ${b}`);
    assert.doesNotMatch(b, /\son[a-z]+\s*=/i, `gestionnaire en ligne : ${b}`);
    assert.doesNotMatch(b, /\s(?:href|src|action)\s*=\s*"\s*javascript:/i, `lien javascript: ${b}`);
  }
  for (const s of html.match(/<script\b[^>]*>/gi) || []) assert.match(s, /\ssrc="\/static\/[a-z-]+\.js(\?v=[^"]*)?"/, `script sans src local : ${s}`);
  assert.doesNotMatch(html, /<script\b[^>]*>[^<]+<\/script>/i, 'script en ligne');
  assert.doesNotMatch(html, /<style\b/i, 'feuille en ligne');
  assert.ok(!html.includes(PIEGE), 'valeur piégée rendue telle quelle');
  assert.doesNotMatch(html, /<img\b/i, 'image injectée');
}

// ---------- flux.js : le port de flux.py ----------

// Les données de MV-11 (flux_donnees.py, AUJOURDHUI), « réseaux listés » rangés avec les visiteurs.
const ch = (origine, source, chemin, issue, n, alerte = null) => ({ origine, source, chemin, issue, n, alerte });
const AUJOURDHUI = [
  ch('hors', 'vigie', 'direct', 'critique', 1, 413), ch('hors', 'site', 'direct', 'critique', 1, 412),
  ch('adm', 'site', 'direct', 'haute', 1, 407), ch('vig', 'vigie', 'direct', 'moyenne', 1, 414),
  ch('vis', 'site', 'score', 'haute', 26, 409), ch('vis', 'bordure', 'score', 'haute', 11, 409),
  ch('vis', 'site', 'score', 'moyenne', 9, 405), ch('vis', 'bordure', 'score', 'moyenne', 3, 405),
  ch('vis', 'site', 'score', 'sans', 158), ch('adm', 'site', 'score', 'sans', 4), ch('vis', 'bordure', 'score', 'sans', 18),
  ch('zit', 'zitadel', 'score', 'sans', 7), ch('adm', 'site', 'sanspoint', 'sans', 21), ch('vis', 'site', 'sanspoint', 'sans', 21),
  ch('vis', 'bordure', 'sanspoint', 'sans', 6), ch('zit', 'zitadel', 'sanspoint', 'sans', 12), ch('hors', 'vigie', 'sanspoint', 'sans', 14), ch('vig', 'vigie', 'sanspoint', 'sans', 5),
];

test('flux.js : graphe conservé (ce qui entre dans un nœud en sort), totaux de MV-11, SVG déterministe, accessible et échappé', () => {
  assert.equal(F.total(AUJOURDHUI), 319);
  assert.deepEqual(Object.fromEntries(['site', 'bordure', 'zitadel', 'vigie'].map(s => [s, F.total(AUJOURDHUI, 'source', s)])), { site: 241, bordure: 38, zitadel: 19, vigie: 21 });
  assert.equal(F.total(AUJOURDHUI, 'issue', 'sans'), 266);
  const g = F.graphe(AUJOURDHUI, F.COLS);
  assert.deepEqual(F.ecartsDeConservation(g, 319), []);
  const a = F.diagrammeEvenements(AUJOURDHUI, { prefixe: 'fxe', titre: 'Les 319 événements', desc: 'De gauche à droite' });
  assert.equal(a.html, F.diagrammeEvenements(AUJOURDHUI, { prefixe: 'fxe', titre: 'Les 319 événements', desc: 'De gauche à droite' }).html, 'mêmes données, même SVG');
  assert.match(a.html, /^<svg class="fx-svg fx-ev" viewBox="0 0 760 [\d.]+" role="img" aria-labelledby="fxe-t" aria-describedby="fxe-d">/);
  assert.match(a.html, /<title id="fxe-t">Les 319 événements<\/title><desc id="fxe-d">De gauche à droite<\/desc>/);
  assert.equal(a.lay.k, 1, '1 px par événement');
  // Rubans entre deux bornes de colonnes, épaisseur au moins 3.
  for (const l of a.lay.liens) assert.ok(l.w >= 3 && l.lA > l.lDe);
  // Les nœuds d'une même colonne ne se chevauchent pas.
  for (const col of a.lay.ordre) for (let i = 1; i < col.length; i++) assert.ok(a.lay.noeuds.get(col[i]).t0 >= a.lay.noeuds.get(col[i - 1]).t1, `${col[i - 1]} / ${col[i]}`);
  // Le diagramme des alertes : une bande égale par alerte (18 unités), l'alerte surlignée seule allumée.
  const alertes = [413, 412, 409, 407, 414, 405].map(id => {
    const cs = AUJOURDHUI.filter(c => c.alerte === id);
    return { id, grav: cs[0].issue, mot: F.MOT[cs[0].issue], chemin: cs[0].chemin, evenements: F.total(cs), parts: cs.map(c => ({ origine: c.origine, source: c.source, n: c.n })) };
  });
  const al = F.diagrammeAlertes(alertes, { prefixe: 'fxa', titre: 'Les 6 alertes', desc: 'd', surligne: 412 });
  for (const id of [413, 412, 409]) assert.equal(F.somme(al.lay.liens.filter(l => l.col === 2 && l.a === `a${id}`).map(l => l.w)), 18);
  assert.equal((al.html.match(/fx-surligne/g) || []).length > 0 && (al.html.match(/fx-estompe/g) || []).length > 0, true);
  assert.deepEqual(F.ecartsDeConservation(F.graphe(F.parAlerte(alertes), F.COLS), 6), []);
  // Échappement : un libellé ou un titre venu des données n'est jamais du SVG.
  const p = F.diagrammeEvenements(AUJOURDHUI, { prefixe: 'x', titre: PIEGE, desc: PIEGE });
  assert.ok(!p.html.includes(PIEGE) && p.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  verifierPage(p.html);
  // Arrondi du dixième comme Python (f'{v:.1f}') : un vrai milieu va au chiffre pair.
  assert.deepEqual([F.f(12.25), F.f(12.75), F.f(3), F.f(-0.25), F.f(0.15)], ['12.2', '12.8', '3', '-0.2', '0.1']);
});

test('origine, source, chemin : le type et le composant suffisent (table daily) ; corrélations relues dans les règles', () => {
  assert.equal(origineDe('malicious_excess_404', 'site · public'), 'vis');
  assert.equal(origineDe('authn_login_fail', 'site · connexion'), 'vis');
  assert.equal(origineDe('authn_login_success', 'site · connexion'), 'adm');
  assert.equal(origineDe('sensitive_read', 'site · admin'), 'adm');
  assert.equal(origineDe('sys_config_changed', 'site · système'), 'hors');
  assert.equal(origineDe('vigie_controle_roles', 'vigie · contrôle'), 'hors');
  assert.equal(origineDe('vigie_purge', 'vigie · contrôle'), 'vig');
  assert.equal(origineDe('vigie_interrupteur', 'vigie · ligne de commande'), 'vig');
  assert.equal(origineDe('bordure_rafale', 'bordure'), 'vis');
  assert.equal(origineDe('zitadel_echec', 'zitadel'), 'zit');
  assert.equal(cheminDe('entite.score'), 'score');
  assert.equal(cheminDe('sigma.rafale_erreurs', new Set(['rafale_erreurs'])), 'correl');
  assert.equal(cheminDe('sigma.configuration', new Set(['rafale_erreurs'])), 'direct');
  assert.equal(cheminDe('detecteur.silence'), 'direct');
  assert.deepEqual(ROUTINE, ['sys_heartbeat', 'sys_state', 'vigie_signal']);
});

test('lireFlux : volumes de la table daily, événements des alertes repris par alert_events et comptés une fois ; sommes conservées', t => {
  const v = setup(t);
  const ids = peupler(v);
  const fl = lireFlux({ db: v.db, now: v.now, jours: 7 });
  // Le total : les événements de la période hors routine, comme le journal (relu ici dans la table brute pour comparer).
  const debut = Date.parse(`${new Date(T0 - 6 * 864e5).toISOString().slice(0, 10)}T00:00:00Z`);
  const brut = v.db.prepare(`SELECT COUNT(*) FROM events WHERE recu_a >= ? AND type NOT IN (${ROUTINE.map(x => `'${x}'`).join(', ')})`).pluck().get(debut);
  assert.equal(fl.total, brut);
  assert.equal(F.total(fl.chemins), fl.total, 'tout événement a un chemin, un seul');
  assert.equal(fl.ecarts, 0);
  assert.deepEqual(F.ecartsDeConservation(F.graphe(fl.chemins, F.COLS), fl.total), []);
  // Les alertes de la période, dans l'ordre de la console ; la vieille close est dehors.
  assert.deepEqual(fl.alertes.map(a => a.id), [ids.config, ids.silence, ids.score, ids.correl, ids.echecs]);
  const parId = Object.fromEntries(fl.alertes.map(a => [a.id, a]));
  assert.equal(parId[ids.score].chemin, 'score');
  assert.equal(parId[ids.correl].chemin, 'correl');
  assert.equal(parId[ids.echecs].chemin, 'correl', 'zitadel_echecs_repetes est une corrélation');
  assert.equal(parId[ids.config].chemin, 'direct');
  assert.deepEqual(parId[ids.config].parts, [{ origine: 'hors', source: 'site', n: 1 }]);
  // #score : 404 du site (12 par jour sur 7 jours) et rafales de la bordure (2 par jour).
  assert.equal(parId[ids.score].evenements, 7 * 12 + 7 * 2);
  assert.deepEqual(parId[ids.score].parts.map(p => `${p.origine}/${p.source}/${p.n}`), ['vis/site/84', 'vis/bordure/14']);
  // Un événement de deux alertes (#score et la corrélation) n'est compté qu'une fois, pour la première qui l'a rattaché.
  assert.equal(F.total(fl.chemins, 'alerte', ids.correl), 0);
  assert.equal(F.total(fl.chemins, 'alerte', ids.score), 98);
  assert.equal(parId[ids.correl].evenements, 10, 'mais le diagramme des alertes compte tous les siens');
  // L'alerte sans événement : provenance par son entité et ses sources.
  assert.deepEqual(parId[ids.silence].parts, [{ origine: 'vig', source: 'vigie', n: 0 }]);
  // 30 jours : la vieille close entre.
  const f30 = lireFlux({ db: v.db, now: v.now, jours: 30 });
  assert.ok(f30.alertes.some(a => a.id === ids.vieille));
  assert.equal(F.total(f30.chemins), f30.total);
  assert.deepEqual(F.ecartsDeConservation(F.graphe(f30.chemins, F.COLS), f30.total), []);
  // Diagramme des alertes conservé (une alerte vaut 1), et la barre par origine dit les mêmes alertes.
  assert.deepEqual(F.ecartsDeConservation(F.graphe(F.parAlerte(fl.alertes), F.COLS), fl.alertes.length), []);
  const barre = barreAlertes(fl.alertes);
  assert.equal(barre.reduce((s, g) => s + g.n, 0), fl.alertes.length);
  assert.deepEqual(barre.map(g => g.origine), ['hors', 'vig', 'vis', 'zit'], 'ordre du métier');
  // La phrase.
  const phrase = phraseFlux(fl, '7j');
  assert.match(phrase, /^En 7\u00a0jours, [\d\u00a0]+ événements ont donné 5 alertes, toutes encore ouvertes\u202f: 2 par preuve directe \(#\d+, #\d+\), 1 par le score d’une entité \(#\d+\), 2 par corrélation \(#\d+, #\d+\)\u202f; [\d\u00a0]+ sont restés sans alerte\.$/);
});

test('lireFlux avec le vrai moteur : les alertes qu’il ouvre se retrouvent dans les flux, sommes conservées', t => {
  const v = setup(t, { moteur: true });
  peupler(v);
  const fl = lireFlux({ db: v.db, now: v.now, jours: 7 });
  assert.ok(fl.alertes.length >= 5, `alertes : ${fl.alertes.length}`);
  assert.equal(fl.ecarts, 0);
  assert.equal(F.total(fl.chemins), fl.total);
  assert.deepEqual(F.ecartsDeConservation(F.graphe(fl.chemins, F.COLS), fl.total), []);
  const vue = vueFlux({ db: v.db, now: v.now, role: 'admin' });
  assert.ok(vue.dessinAl && vue.dessinEv);
});

test('migration 009 : alert_flux suit alert_events (déclencheurs), part avec l’alerte, et reprend l’existant', t => {
  const v = setup(t);
  const ids = peupler(v);
  const attendu = db => db.prepare(`SELECT ae.alert_id, strftime('%Y-%m-%d', e.recu_a / 1000, 'unixepoch') jour, e.type, e.severity, e.composant, COUNT(*) n,
    SUM(ae.alert_id = (SELECT MIN(a2.alert_id) FROM alert_events a2 WHERE a2.seq = ae.seq)) premier
    FROM alert_events ae JOIN events e ON e.seq = ae.seq GROUP BY 1, 2, 3, 4, 5 ORDER BY 1, 2, 3, 4, 5`).all();
  const tenu = db => db.prepare('SELECT alert_id, jour, type, severity, composant, n, premier FROM alert_flux ORDER BY 1, 2, 3, 4, 5').all();
  assert.deepEqual(tenu(v.db), attendu(v.db));
  // Un lien déjà connu (INSERT OR IGNORE du moteur) ne compte pas deux fois.
  const seq = v.db.prepare('SELECT seq FROM alert_events WHERE alert_id = ? LIMIT 1').pluck().get(ids.config);
  v.db.prepare('INSERT OR IGNORE INTO alert_events (alert_id, seq) VALUES (?, ?)').run(ids.config, seq);
  assert.deepEqual(tenu(v.db), attendu(v.db));
  // Purge d'une alerte : ses lignes partent avec elle.
  v.db.prepare('DELETE FROM alert_events WHERE alert_id = ?').run(ids.vieille);
  v.db.prepare('DELETE FROM alerts WHERE id = ?').run(ids.vieille);
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM alert_flux WHERE alert_id = ?').pluck().get(ids.vieille), 0);
  // Reprise : une base d'avant la migration, avec ses liens, la reçoit à l'ouverture.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-009-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fichier = path.join(dir, 'vigie.db');
  let db = openVigieDb(fichier);
  db.exec("DROP TRIGGER alert_flux_lien; DROP TRIGGER alert_flux_alerte; DROP TABLE alert_flux; DELETE FROM migrations WHERE name = '009_flux_alertes.sql'");
  const store = createStore({ db, logKey: LOG_KEY, now: () => T0 });
  peupler({ db, store });
  db.close();
  db = openVigieDb(fichier);
  assert.deepEqual(tenu(db), attendu(db));
  db.close();
});

test('GET /flux : 200 en Administrateur et en Lecteur, diagrammes, tableaux, échappement, aucun style ni script en ligne', async t => {
  const v = setup(t);
  const ids = peupler(v, { piege: true });
  v.store.setting.set('controle_roles_admins', { administrateurs: ['zitadel-318204977'], instantane_a: T0 - 3600e3 });
  const admin = await v.login();
  const r = await admin('/flux');
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'text/html; charset=utf-8');
  const html = r.body;
  verifierPage(html);
  assert.match(html, /<h1>Flux et provenance des alertes<\/h1>/);
  assert.match(html, /<a href="\/flux"[^>]*aria-current="page"[^>]*>Vue|<a href="\/flux" aria-current="page">7 jours<\/a>/);
  assert.match(html, /<h2 class="vg-section-t" id="t-al">Les 5 alertes<\/h2>/);
  // Deux boîtes de dessin par diagramme (760 et 1 120 unités), titre et description liés.
  for (const p of ['fxa', 'fxaL', 'fxe', 'fxeL']) assert.match(html, new RegExp(`<svg class="fx-svg [^"]*" viewBox="[^"]+" role="img" aria-labelledby="${p}-t" aria-describedby="${p}-d">`), p);
  assert.ok(html.includes('id="fx-dessin-al"') && html.includes('href="#fx-dessin-al"'));
  // Tableau des alertes : une ligne par alerte, provenance sur une ligne.
  const tab = html.slice(html.indexOf('vg-flux-al'), html.indexOf('</table>', html.indexOf('vg-flux-al')));
  assert.equal((tab.match(/<tr><th scope="row">/g) || []).length, 5);
  assert.ok(tab.includes(`href="/alertes/${ids.score}"`));
  assert.match(tab, /visiteurs du site public → site et bordure Cloudflare → score d’une entité/);
  // Tableau des événements : total = nombre de « Les N événements ».
  const total = /id="t-ev">Les ([\d ]+) événements</.exec(html)[1];
  assert.match(html, new RegExp(`<tfoot><tr><th scope="row" colspan="4">Total</th><td class="num">${total}</td>`));
  // Provenances : sans les administrateurs (l'adresse de leur connexion réussie), valeurs piégées échappées.
  assert.match(html, /événements des administrateurs, non comptés/);
  const provs = html.slice(html.indexOf('id="t-prov"'));
  assert.ok(!provs.includes('192.0.2.10'), 'adresse d’un administrateur dans les provenances');
  assert.ok(provs.includes('198.51.100.23'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'valeur piégée échappée');
  // Lecteur : mêmes diagrammes, adresses tronquées.
  const lecteur = await v.login({ sub: 'sub-camille', nom: 'Camille', roles: ['vigie.viewer'], email: 'camille@exemple.org' });
  const rl = await lecteur('/flux?periode=30j');
  assert.equal(rl.statusCode, 200);
  verifierPage(rl.body);
  assert.match(rl.body, /Lecture seule/);
  assert.ok(!rl.body.includes('198.51.100.23') && rl.body.includes('198.51.100.0/24'), 'adresse tronquée pour un Lecteur');
  assert.match(rl.body, /<a href="\/flux\?periode=30j" aria-current="page">30 jours<\/a>/);
  assert.match(rl.body, new RegExp(`href="/alertes/${ids.vieille}"`), '30 jours : la vieille alerte close');
});

test('GET /flux : paramètres refusés sans jamais renvoyer la saisie ; une alerte mise en avant', async t => {
  const v = setup(t);
  const ids = peupler(v);
  const admin = await v.login();
  const r = await admin(`/flux?periode=${encodeURIComponent(PIEGE)}&alerte=${encodeURIComponent('12<b>')}`);
  assert.equal(r.statusCode, 200);
  verifierPage(r.body);
  assert.match(r.body, /Deux paramètres de l’adresse ont été ignorés/);
  assert.match(r.body, /Alerte inconnue/);
  assert.match(r.body, /Période inconnue/);
  assert.ok(!r.body.includes('12&lt;b&gt;') && !r.body.includes('&lt;img'), 'saisie jamais renvoyée');
  const inconnue = await admin('/flux?alerte=999999');
  assert.match(inconnue.body, /Un paramètre de l’adresse a été ignoré/);
  const tab = await admin('/flux?periode=7j&periode=30j');
  assert.match(tab.body, /Période inconnue/);
  const s = await admin(`/flux?alerte=${ids.score}`);
  assert.equal(s.statusCode, 200);
  assert.doesNotMatch(s.body, /resume-a/);
  assert.match(s.body, new RegExp(`<b>#${ids.score}, Haute, ouverte `));
  const svgAl = s.body.slice(s.body.indexOf('<svg class="fx-svg fx-al"'), s.body.indexOf('</svg>', s.body.indexOf('<svg class="fx-svg fx-al"')));
  assert.match(svgAl, /fx-surligne/);
  assert.match(svgAl, /fx-estompe/);
  assert.match(svgAl, new RegExp(`<title id="fxa-t">[^<]*l’alerte #${ids.score} mise en avant</title>`));
});

test('GET /flux sur une base vide : la phrase le dit, pas de diagramme des alertes', async t => {
  const v = setup(t);
  const vide = vueFlux({ db: v.db, now: v.now, role: 'admin' });
  assert.equal(vide.phrase, 'En 7\u00a0jours, aucun événement ni aucune alerte.');
  assert.equal(vide.dessinAl, null);
  assert.equal(vide.dessinEv, null);
  const admin = await v.login();          // la connexion à la console est elle-même un événement
  const r = await admin('/flux');
  assert.equal(r.statusCode, 200);
  verifierPage(r.body);
  assert.match(r.body, /Aucune alerte sur les 7\u00a0jours/);
  assert.match(r.body, /En 7\u00a0jours, 1 événement, aucune alerte/);
  assert.doesNotMatch(r.body, /<svg class="fx-svg fx-al/);
});

test('vue d’ensemble : la barre de provenance dit les mêmes nombres que /flux (même période), lien « Voir les flux »', async t => {
  const v = setup(t);
  peupler(v);
  const admin = await v.login();
  const accueil = (await admin('/')).body;
  const flux = (await admin('/flux')).body;
  verifierPage(accueil);
  const n = /<h2 class="fx-barre-t" id="t-prov">Provenance des (\d+) alertes des 7 derniers jours<\/h2>/.exec(accueil);
  assert.ok(n, 'barre de provenance sur la vue d’ensemble');
  assert.equal(`Les ${n[1]} alertes`, /id="t-al">(Les \d+ alertes)</.exec(flux)[1]);
  // Les mêmes groupes, les mêmes nombres, les mêmes cases : la barre du téléphone de /flux et celle de la vue d'ensemble.
  const groupes = html => [...html.matchAll(/<li class="g g-\d"><span class="lb">([^<]+) <b>(\d+)<\/b><\/span><ol class="cases">(.*?)<\/ol>/g)].map(m => `${m[1]}=${m[2]}:${[...m[3].matchAll(/#(\d+)/g)].map(x => x[1]).join(',')}`);
  const barreFlux = flux.slice(flux.indexOf('id="fxa-bt"'));
  assert.deepEqual(groupes(accueil), groupes(barreFlux.slice(0, barreFlux.indexOf('</ul>') + 5)));
  assert.match(accueil, /<a class="vg-lien" href="\/flux">Voir les flux<\/a>/);
  // Et la fonction partagée.
  const pv = overview({ db: v.db, engine: v.engine, switches: v.switches, now: v.now, role: 'admin' }).provenance;
  const fl = lireFlux({ db: v.db, now: v.now, jours: 7 });
  assert.equal(pv.n, fl.alertes.length);
  assert.deepEqual(pv.groupes, barreAlertes(fl.alertes));
  assert.deepEqual(provenanceAlertes({ db: v.db, now: v.now }).groupes, pv.groupes);
});

test('GET /sante : 200 en Administrateur et en Lecteur, composants dans l’ordre, écarts dits, commandes de secours, valeurs échappées', async t => {
  const v = setup(t);
  peupler(v);
  const set = (k, x) => v.store.setting.set(k, x);
  set('chaine_verifiee', { at: T0 - 11 * 3600e3, ok: true, lignes: 1182406 });
  set('tete_publiee', { seq: 1182406, chain: '9f3c51e0aa11bb22cc33dd44e1a7', at: T0 - 11 * 3600e3, mac: 'x' });
  set('zitadel_derniere_lecture', T0 - 93 * 60e3);
  set('bordure_dernier_battement', { at: T0 - 5 * 60e3, etat: PIEGE });
  set('bordure_kv', { version: 31, empreinte: 'x', at: T0 - 17 * 60e3 });
  set('bordure_curseur', T0 - 3 * 60e3);
  set('controle_roles_vu', { fichier: PIEGE, at: T0 - 15 * 60e3 });
  set('menaces_maj', { at: T0 - 10 * 3600e3, spamhaus_drop: 1498, feodo: 'erreur : réponse 503', tor: 1207 });
  set('moteur_curseur', 0);
  v.clock.t = T0 + 30e3;
  v.store.own('vigie_zitadel_erreur', { detail: { erreur: `Zitadel : réponse 503 ${PIEGE}`, echecs: 93 } });
  v.store.own('vigie_canal_echec', { detail: { canal: 'signal', erreur: 'passerelle Signal : réponse 500' } });
  const admin = await v.login();
  const r = await admin('/sante');
  assert.equal(r.statusCode, 200);
  verifierPage(r.body);
  const html = r.body;
  assert.match(html, /<h1>Santé et intégrité<\/h1>/);
  const ordre = [...html.matchAll(/<section class="vg-compo[^"]*" id="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(ordre, ['chaine', 'site', 'zitadel', 'bordure', 'roles', 'menaces', 'analyse', 'disque', 'canaux', 'version']);
  assert.match(html, /id="zitadel" aria-labelledby="t-zitadel">[\s\S]*?Injoignable/);
  assert.match(html, /class="vg-compo panne" id="zitadel"/);
  assert.match(html, /class="vg-compo ecart" id="menaces"/);
  assert.match(html, /class="vg-compo ecart" id="canaux"/);
  assert.match(html, /id="analyse"[\s\S]*?<dt>En attente<\/dt><dd>[\d\u00a0]+ événements<span class="sec">dernier analysé\u202f: ligne 0<\/span>/);
  assert.match(html, /<span class="vg-empreinte">ligne 1 182 406 · maillon 9f3c51e0…e1a7<\/span>/);
  assert.match(html, /<pre class="vg-commande"><code><span class="mot">node<\/span> <span class="mot">vigie\/cli.js<\/span> <span class="mot">verifier<\/span><\/code><\/pre>/);
  assert.match(html, /<span class="mot">--accepter<\/span>/);
  assert.match(html, /Disque libre/);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  // Lecture seule : aucun formulaire d'action (seule la sortie de la barre latérale en est un).
  assert.equal((html.match(/<form\b/g) || []).length, 1);
  const lecteur = await v.login({ sub: 'sub-camille', nom: 'Camille', roles: ['vigie.viewer'], email: 'camille@exemple.org' });
  const rl = await lecteur('/sante');
  assert.equal(rl.statusCode, 200);
  verifierPage(rl.body);
  assert.match(rl.body, /Lecture seule/);
});

test('vueSante : chaîne rompue en tête, bordure non réglée, Zitadel jamais lu', t => {
  const v = setup(t);
  v.store.setting.set('chaine_verifiee', { at: T0 - 3600e3, ok: false, lignes: 1200, rupture: { seq: 1181950, raison: 'ligne modifiée ou insérée' }, ruptures: [{ seq: 1181950, raison: 'ligne modifiée ou insérée' }] });
  const s = vueSante({ db: v.db, engine: v.engine, switches: v.switches, now: v.now, role: 'admin' });
  assert.equal(s.phrase, 'La chaîne du journal est rompue à la ligne 1 181 950.');
  assert.equal(s.cartes[0].etat.mot, 'Rompue');
  assert.equal(s.cartes.find(c => c.id === 'bordure').etat.mot, 'Non réglée');
  assert.equal(s.cartes.find(c => c.id === 'zitadel').etat.mot, 'Non réglé');
  const eta = new Eta({ views: VIEWS, autoEscape: true });
  const html = eta.render('sante', { sante: s, titre: 'Santé et intégrité · Vigie', moi: { nom: 'Sébastien', role: 'admin' }, compteurs: {}, csrf: 'x' });
  verifierPage(html);
  assert.match(html, /<ol class="vg-ruptures"[^>]*><li><span class="n">1 181 950<\/span><span class="raison">ligne modifiée ou insérée<\/span>/);
});
