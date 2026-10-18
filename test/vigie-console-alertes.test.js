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
import { requetesAlertes, mitre, filtresDe } from '../vigie/console/ecrans/alertes.js';

// Console de la Vigie, phase D3b : la liste des alertes et la fiche d'une alerte (MV-02), en lecture seule. Rendu en
// Administrateur et en Lecteur (adresses tronquées, jamais dans une adresse de lien), valeurs piégées échappées, aucun
// style ni script en ligne, 404 propre, pagination et requêtes bornées (plans d'exécution : index, jamais un parcours de
// la table des événements).
const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const TEAM = 'nicephos-essai';
const AUD = 'a1'.repeat(32);
const ISS = `https://${TEAM}.cloudflareaccess.com`;
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const CERTS = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] };
const T0 = Date.parse('2026-10-17T12:20:00Z');          // sam. 17 oct. 2026, 14 h 20 à Paris
const min = 60e3;
const PIEGE = '<img src=x onerror=alert(1)>';
const IP = '198.51.100.23';

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function accessJwt(clock, email) {
  const iat = Math.floor(clock.t / 1000);
  const unsigned = `${b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${b64({ iss: ISS, aud: [AUD], email, sub: `cf-${email}`, iat, exp: iat + 3600 })}`;
  return `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
}

// Une Vigie dans un dossier temporaire, sa console (Access et Zitadel simulés), et le décor de MV-02.
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-alertes-'));
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  const clock = { t: T0 - 3 * 3600e3 };
  const now = () => clock.t;
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now });
  const fetchImpl = async () => new Response(JSON.stringify(CERTS), { status: 200 });
  const oidc = {
    origin: 'https://idp.example', claims: null, n: 0,
    async start() { this.n += 1; return { url: `https://idp.example/authorize?n=${this.n}`, tx: { state: `etat-${this.n}-${'x'.repeat(30)}`, verifier: 'v', nonce: 'n' } }; },
    async finish() { return this.claims; },
    async logoutUrl() { return 'https://idp.example/logout'; },
  };
  const ceilings = { 'sub-seb': 'admin', 'sub-camille': 'viewer' };
  const config = { url: 'https://vigie.example', access: { team: TEAM, aud: AUD }, adminSubs: ['sub-seb'], roles: 'deux-cles', projectId: '100', orgId: '200' };
  const c = createConsole({ config, store, engine, switches, decisions, zitadel: null, logger: false, fetchImpl, now, oidc, readCeiling: async sub => ceilings[sub] ?? null });
  t.after(async () => { await c.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  async function login(sub, nom, role, email) {
    oidc.claims = { sub, nom, amr: ['user', 'mfa'], authTime: clock.t, roles: [`vigie.${role}`] };
    const headers = { 'cf-access-jwt-assertion': accessJwt(clock, email), 'cf-connecting-ip': '192.0.2.10' };
    const r1 = await c.app.inject({ url: '/auth/login?retour=%2F', headers });
    const state = r1.cookies.find(x => x.name === '__Host-vigie-tx')?.value;
    const r2 = await c.app.inject({ url: `/auth/callback?code=code&state=${state}`, headers, cookies: { '__Host-vigie-tx': state } });
    const cookie = r2.cookies.find(x => x.name === '__Host-vigie')?.value;
    assert.ok(cookie, `session ouverte pour ${sub}`);
    // Chaque requête : un jeton Access frais (l'horloge avance entre les étapes du décor).
    return url => c.app.inject({ url, headers: { 'cf-access-jwt-assertion': accessJwt(clock, email), 'cf-connecting-ip': '192.0.2.10' }, cookies: { '__Host-vigie': cookie } });
  }

  const alerte = a => Number(db.prepare(`INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, statut, classement, note, premiere, derniere, compteur, score, sources, reponse, traite_par, traite_a)
    VALUES (@regle, @cas, @entite_kind, @entite_key, @gravite, @mode, @statut, @classement, @note, @premiere, @derniere, @compteur, @score, @sources, @reponse, @traite_par, @traite_a)`)
    .run({ cas: null, statut: 'ouverte', classement: null, note: null, compteur: 1, score: null, sources: '["site"]', reponse: null, traite_par: null, traite_a: null, ...a }).lastInsertRowid);
  // Un événement du site relié à une alerte.
  const lier = db.prepare('INSERT INTO alert_events (alert_id, seq) VALUES (?, ?)');
  function evenement(alertId, e = {}) {
    store.add([{ id: crypto.randomUUID(), recu_a: clock.t, survenu_a: clock.t - 1000, type: 'malicious_honeypot', severity: 'moyen', composant: 'site · public', canal: 'ingestion signée',
      confiance: 'rapporté', emetteur: 'server/routes/public.js', ip: IP, route: '/wp-login.php', method: 'GET', status: 404, ...e }]);
    const seq = db.prepare('SELECT MAX(seq) FROM events').pluck().get();
    if (alertId) lier.run(alertId, seq);
    return seq;
  }
  return { db, store, engine, decisions, switches, clock, c, login, alerte, evenement, lier };
}

// Le décor : #1 rôle donné hors de l'application (compte piégé, gel automatique, historique), #2 score d'une adresse
// (37 événements, deux sources), #3 close et classée, avec une note piégée, #4 d'une règle inconnue au nom piégé.
function decor(v) {
  const { alerte, decisions, engine, clock, evenement, store } = v;
  clock.t = T0 - 18 * min;
  const a1 = alerte({ regle: 'sigma.role_hors_application', cas: 'DS8', entite_kind: 'compte', entite_key: `zitadel-${PIEGE}`, gravite: 'critique', mode: 'bloquer',
    premiere: clock.t, derniere: clock.t, reponse: `geler zitadel-${PIEGE} ; revoquer_compte zitadel-${PIEGE}` });
  store.own('vigie_alerte', { emetteur: 'vigie/moteur.js · sigma.role_hors_application', detail: { action: 'ouverte', id: a1, regle: 'sigma.role_hors_application', gravite: 'critique', mode: 'bloquer', sources: ['site'] } });
  decisions.create({ kind: 'geler', cible: 'zitadel-329906113', duree: '24h', par: 'Vigie · règle sigma.role_hors_application', auto: true, motif: `alerte #${a1}` });
  evenement(a1, { type: 'privilege_permissions_changed', severity: 'critique', composant: 'site · base', emetteur: `déclencheur ${PIEGE}`, ip: null, route: null, sub: 'zitadel-329906113',
    detail: { hors_application: true, note: PIEGE } });
  // #2 : score d'une adresse, 37 événements (pages de 20), deux sources.
  clock.t = T0 - 39 * min;
  const a2 = alerte({ regle: 'entite.score', cas: 'quorum', entite_kind: 'ip', entite_key: IP, gravite: 'haut', mode: 'observer', premiere: clock.t, derniere: T0 - 8 * min,
    compteur: 37, score: 15.24, sources: '["bordure","site"]' });
  for (let i = 0; i < 37; i += 1) { clock.t += 30e3; evenement(a2, i % 6 ? {} : { composant: 'bordure', type: 'bordure_rafale', confiance: 'constaté', emetteur: 'worker', route: null }); }
  db_points(v, IP);
  // #3 : close, classée Faux positif, avec une note piégée ; prise en charge puis classée par la console (historique).
  clock.t = T0 - 120 * min;
  const a3 = alerte({ regle: 'sigma.oidc_echecs_repetes', cas: 'DS5', entite_kind: 'ip', entite_key: '192.0.2.77', gravite: 'moyen', mode: 'alerter', premiere: clock.t, derniere: clock.t + 19 * min, compteur: 4,
    sources: '["site","zitadel"]' });
  clock.t = T0 - 90 * min;
  engine.classify(a3, { classement: null, par: 'console · Julien', statut: 'en_cours' });
  clock.t = T0 - 80 * min;
  engine.classify(a3, { classement: 'faux_positif', note: `box redémarrée ${PIEGE}`, par: 'console · Julien' });
  // #4 : règle inconnue au nom piégé, sur une adresse IPv6.
  const a4 = alerte({ regle: `sigma.${PIEGE}`, entite_kind: 'ip', entite_key: '2001:db8:4:1c::5e', gravite: 'bas', mode: 'observer', premiere: T0 - 300 * min, derniere: T0 - 200 * min, compteur: 3 });
  clock.t = T0;
  return { a1, a2, a3, a4 };
}
// Points de score sur l'adresse (site et bordure), comme le moteur les dépose.
function db_points(v, ip) {
  v.db.prepare('INSERT OR REPLACE INTO entities (kind, key, score, at, contributions, signaux, premiere, derniere) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('ip', ip, 15.2, T0, JSON.stringify({ site: 9.1, bordure: 6.1 }), 37, T0 - 39 * min, T0 - 8 * min);
}

// Contrôles communs : ni style ni gestionnaire en ligne, pas de script en ligne, valeur piégée jamais rendue telle quelle.
function verifierPage(html) {
  for (const b of html.match(/<[a-zA-Z][^>]*>/g) || []) {
    assert.doesNotMatch(b, /\sstyle\s*=/i, `attribut style : ${b}`);
    assert.doesNotMatch(b, /\son[a-z]+\s*=/i, `gestionnaire en ligne : ${b}`);
    for (const [, , val] of b.matchAll(/\s(src|href|action)\s*=\s*"([^"]*)"/gi)) {
      assert.doesNotMatch(val, /^\s*javascript:/i);
      assert.doesNotMatch(val, /^(https?:)?\/\//i, `ressource externe : ${val}`);
    }
  }
  for (const s of html.match(/<script\b[^>]*>/gi) || []) assert.match(s, /\ssrc="\/static\/[a-z-]+\.js(\?v=[^"]*)?"/, `script sans src local : ${s}`);
  assert.doesNotMatch(html, /<script\b[^>]*>[^<]+<\/script>/i, 'script en ligne');
  assert.doesNotMatch(html, /<style\b/i, 'feuille en ligne');
  assert.ok(!html.includes(PIEGE), 'valeur piégée rendue telle quelle');
  assert.doesNotMatch(html, /<img\b/i, 'image injectée');
  // Formulaires : GET, la sortie, ou les gestes de la console (D3c, vigie/console/actions.js), jamais une autre adresse.
  for (const f of html.match(/<form\b[^>]*>/gi) || []) assert.ok(/method="get"/.test(f) || /action="(\/auth\/logout|\/alertes\/\d+\/(prendre|classer|note)|\/decisions)"/.test(f), `formulaire d'action : ${f}`);
}

test('liste : Administrateur et Lecteur, ordre de gravité, adresses tronquées pour le Lecteur, valeurs piégées échappées', async t => {
  const v = setup(t);
  const ids = decor(v);
  const admin = await v.login('sub-seb', 'Sébastien', 'admin', 'seb@exemple.org');
  const r = await admin('/alertes');
  assert.equal(r.statusCode, 200);
  verifierPage(r.body);
  assert.match(r.body, /<title>Alertes · Vigie · Nicephos<\/title>/);
  assert.match(r.body, /<a href="\/alertes" aria-current="page">/);
  // Non closes : #1 (critique), #2 (haute), #4 (basse) ; la close #3 n'y est pas.
  const ordre = [...r.body.matchAll(/<a class="ligne-lien" href="\/alertes\/(\d+)">/g)].map(m => Number(m[1]));
  assert.deepEqual(ordre, [ids.a1, ids.a2, ids.a4]);
  assert.ok(r.body.includes(`<span class="ip">${IP}</span>`), 'adresse entière pour un Administrateur');
  assert.ok(r.body.includes('zitadel-&lt;img src=x onerror=alert(1)&gt;'), 'compte piégé échappé');
  assert.ok(r.body.includes('sigma.&lt;img src=x onerror=alert(1)&gt;'), 'règle piégée échappée');
  assert.match(r.body, /3 alertes non closes/);
  assert.match(r.body, /1 critique, 1 haute, 1 basse/);
  assert.match(r.body, /réponse faite : compte gelé 24 h/);
  assert.match(r.body, /<form class="vg-filtres vg-replie" id="filtres" method="get" action="\/alertes" role="search"/);

  const lecteur = await v.login('sub-camille', 'Camille', 'viewer', 'camille@exemple.org');
  const rl = await lecteur('/alertes');
  assert.equal(rl.statusCode, 200);
  verifierPage(rl.body);
  assert.ok(!rl.body.includes(IP), 'adresse entière jamais montrée à un Lecteur');
  assert.ok(!rl.body.includes('2001:db8:4:1c::5e'));
  assert.ok(rl.body.includes('<span class="ip">198.51.100.0/24</span><span class="tronq">(tronquée)</span>'));
  assert.ok(rl.body.includes('<span class="ip v6">2001:db8:4::/48</span>'));
  assert.match(rl.body, /Lecture seule/);
});

test('liste : filtres (statut, gravité, règle), valeurs inconnues ignorées et dites, liste vide', async t => {
  const v = setup(t);
  const ids = decor(v);
  const admin = await v.login('sub-seb', 'Sébastien', 'admin', 'seb@exemple.org');
  const ids_ = body => [...body.matchAll(/<a class="ligne-lien" href="\/alertes\/(\d+)">/g)].map(m => Number(m[1]));
  const closes = await admin('/alertes?statut=close');
  assert.deepEqual(ids_(closes.body), [ids.a3]);
  assert.match(closes.body, /classée Faux positif par Julien, /);
  const toutes = await admin('/alertes?statut=toutes');
  assert.deepEqual(ids_(toutes.body), [ids.a2, ids.a1, ids.a3, ids.a4], 'toutes : de la plus récente à la plus ancienne');
  const hautes = await admin('/alertes?gravite=haute');
  assert.deepEqual(ids_(hautes.body), [ids.a1, ids.a2]);
  assert.match(hautes.body, /<option value="haute" selected>Haute et plus<\/option>/);
  const regle = await admin('/alertes?regle=entite.score');
  assert.deepEqual(ids_(regle.body), [ids.a2]);
  assert.match(regle.body, /<option value="entite.score" selected>/);
  // Valeurs inconnues : ignorées, dites ; jamais renvoyées dans la page.
  const faux = await admin(`/alertes?statut=${encodeURIComponent(PIEGE)}&gravite=enorme&regle=${encodeURIComponent(PIEGE)}&page=-3`);
  assert.equal(faux.statusCode, 200);
  verifierPage(faux.body);
  assert.match(faux.body, /Filtre ignoré : statut, gravité, règle, page\./);
  assert.deepEqual(ids_(faux.body), [ids.a1, ids.a2, ids.a4]);
  const vide = await admin('/alertes?statut=en_cours&gravite=critique');
  assert.equal(vide.statusCode, 200);
  assert.match(vide.body, /Aucune alerte pour ces filtres\./);
  assert.doesNotMatch(vide.body, /<table/);
  // Un tableau de valeurs (paramètre répété) : ignoré.
  const { f, ignores } = filtresDe({ statut: ['close', 'toutes'] }, new Map());
  assert.equal(f.statut, 'ouvertes');
  assert.deepEqual(ignores, ['statut']);
});

test('fiche (MV-02) : règle, cas, tactiques MITRE, entité, réponse faite, événements, historique ; Administrateur', async t => {
  const v = setup(t);
  const ids = decor(v);
  const admin = await v.login('sub-seb', 'Sébastien', 'admin', 'seb@exemple.org');
  const r = await admin(`/alertes/${ids.a1}`);
  assert.equal(r.statusCode, 200);
  verifierPage(r.body);
  const h = r.body;
  assert.match(h, new RegExp(`<title>Alerte #${ids.a1} · Vigie · Nicephos</title>`));
  assert.match(h, /<h1>Rôle donné, retiré ou compte changé hors de l’application<\/h1>/);
  assert.match(h, /<span class="vg-code">DS8<\/span>/);
  assert.match(h, /grav--critique/);
  assert.match(h, /etat--afaire[^<]*<svg[\s\S]*?<\/svg>Ouverte/);
  assert.match(h, /MITRE ATT&amp;CK : Persistance, Élévation de privilèges <span class="vg-code">T1098<\/span>/);
  assert.match(h, /sigma\.role_hors_application · DS8/);
  assert.match(h, /Une seule observation suffit/);
  // Entité : lien vers sa fiche, clé encodée.
  assert.ok(h.includes(`href="/entites/compte/${encodeURIComponent(`zitadel-${PIEGE}`).replace(/'/g, '&#39;')}"`), 'lien vers la fiche du compte, clé encodée');
  // Réponse faite : la décision automatique, liée par son motif.
  assert.match(h, /<h2 class="panel-t" id="t-rep">Réponse déjà faite<\/h2>/);
  assert.match(h, /<span class="t">Compte gelé · <span class="sub">zitadel-329906113<\/span><\/span><span class="n">#\d+<\/span>/);
  assert.match(h, /jusqu’au dim\. 18 oct\., 14 h 02 · par la Vigie/);
  // Événements : lien vers /evenements/<seq>, émetteur piégé échappé.
  assert.match(h, /<a class="vg-lien t" href="\/evenements\/\d+">Droits d’un compte changés/);
  assert.ok(h.includes('déclencheur &lt;img src=x onerror=alert(1)&gt;'));
  assert.match(h, /reçu \+ 1 s/);
  // Historique : l'ouverture.
  assert.match(h, /<ol class="chrono">\s*<li><time datetime="[^"]+">14 h 02<\/time><span>Ouverte, gravité Critique, mode Bloquer<\/span><\/li>/);
  // Gestes (D3c) pour un Administrateur : vigie-console-decisions.test.js les vérifie en détail.
  assert.match(h, /Prendre en charge<\/button>/);
  assert.match(h, /Classer et clore l’alerte/);

  // #2 : score par source, quorum, 20 événements sur 37, les plus récents d'abord, suite par jeu de clés.
  const r2 = await admin(`/alertes/${ids.a2}`);
  verifierPage(r2.body);
  assert.match(r2.body, /<meter class="vg-m" min="0" max="20" value="9\.1" aria-labelledby="s-0">9,1<\/meter>/);
  assert.match(r2.body, /Seuil d’une adresse : 7 points ; Haute au double, 14\. Deux sources : le quorum est atteint\./);
  assert.match(r2.body, /Deux sources indépendantes : bordure Cloudflare et site\./);
  const seqs = [...r2.body.matchAll(/href="\/evenements\/(\d+)"/g)].map(m => Number(m[1]));
  assert.equal(seqs.length, 20, '20 événements par page');
  assert.deepEqual(seqs, [...seqs].sort((a, b) => b - a), 'les plus récents d’abord');
  assert.match(r2.body, /37 événements reliés à l’alerte ; les 20 plus récents ici\./);
  const suite = /<a class="btn ghost" href="(\/alertes\/\d+\?avant=(\d+)#t-signal)" rel="next">Plus anciens<\/a>/.exec(r2.body);
  assert.ok(suite, 'lien « Plus anciens »');
  assert.equal(Number(suite[2]), seqs.at(-1));
  const p2 = await admin(suite[1].replace('#t-signal', ''));
  const seqs2 = [...p2.body.matchAll(/href="\/evenements\/(\d+)"/g)].map(m => Number(m[1]));
  assert.equal(seqs2.length, 17);
  assert.ok(Math.max(...seqs2) < Math.min(...seqs));
  assert.doesNotMatch(p2.body, /rel="next">Plus anciens/);
  assert.match(p2.body, /<a class="btn ghost" href="\/alertes\/\d+#t-signal">Les plus récents<\/a>/);
  assert.ok(p2.body.includes(`href="/entites/ip/${IP}"`), 'fiche de l’adresse pour un Administrateur');
  assert.match(p2.body, /<span class="src"><svg[^>]*>[\s\S]*?<\/svg>bordure Cloudflare<\/span><span class="emetteur">worker<\/span><span class="conf conf--constate">/);

  // #3 : close, classement et note piégée échappée ; historique de la console.
  const r3 = await admin(`/alertes/${ids.a3}`);
  verifierPage(r3.body);
  assert.match(r3.body, /<dt>Classée<\/dt><dd>Faux positif<\/dd>/);
  assert.ok(r3.body.includes('« box redémarrée &lt;img src=x onerror=alert(1)&gt; »'));
  assert.match(r3.body, /Prise en charge par Julien/);
  assert.match(r3.body, /Classée Faux positif par Julien, alerte close/);
  assert.match(r3.body, /<a class="ep-retour" href="\/alertes\?statut=close">/);
  assert.match(r3.body, /etat--abouti/);
  // #4 : règle inconnue (nom piégé) : la fiche s'affiche, échappée, sans tactique.
  const r4 = await admin(`/alertes/${ids.a4}`);
  assert.equal(r4.statusCode, 200);
  verifierPage(r4.body);
  assert.doesNotMatch(r4.body, /MITRE/);
});

test('fiche : un Lecteur ne voit que des adresses tronquées, jamais dans une adresse de lien ; ni la réponse brute', async t => {
  const v = setup(t);
  const ids = decor(v);
  const lecteur = await v.login('sub-camille', 'Camille', 'viewer', 'camille@exemple.org');
  for (const id of [ids.a1, ids.a2, ids.a3, ids.a4]) {
    const r = await lecteur(`/alertes/${id}`);
    assert.equal(r.statusCode, 200, `#${id}`);
    verifierPage(r.body);
    for (const ip of [IP, '192.0.2.77', '2001:db8:4:1c::5e', encodeURIComponent(IP)]) assert.ok(!r.body.includes(ip), `#${id} : ${ip}`);
    assert.match(r.body, /Lecture seule/);
    // Aucun geste pour un Lecteur : ni formulaire POST (sauf la sortie), ni bouton dans le contenu.
    for (const f of r.body.match(/<form\b[^>]*method="post"[^>]*>/gi) || []) assert.match(f, /action="\/auth\/logout"/, `#${id} : ${f}`);
    assert.doesNotMatch(r.body.slice(r.body.indexOf('<main'), r.body.indexOf('</main>')), /<button/i);
  }
  const r2 = await lecteur(`/alertes/${ids.a2}`);
  assert.ok(r2.body.includes('<span class="ip">198.51.100.0/24</span>'));
  assert.ok(r2.body.includes('href="/entites/reseau/198.51.100.0">Fiche du réseau</a>'), 'un Lecteur est mené au réseau');
  assert.match(r2.body, /adresse <span class="ip">198\.51\.100\.0\/24<\/span> <span class="tronq">\(tronquée\)<\/span>/);
  // La réponse brute du moteur (qui cite le compte) n'est jamais montrée telle quelle.
  const r1 = await lecteur(`/alertes/${ids.a1}`);
  assert.doesNotMatch(r1.body, /geler zitadel|revoquer_compte zitadel/);
});

test('404 propre dans la console : numéro inconnu, nul, non entier, trop long', async t => {
  const v = setup(t);
  decor(v);
  const admin = await v.login('sub-seb', 'Sébastien', 'admin', 'seb@exemple.org');
  for (const url of ['/alertes/99999', '/alertes/0', '/alertes/abc', '/alertes/1e3', '/alertes/-1', `/alertes/${'9'.repeat(30)}`, `/alertes/${encodeURIComponent(PIEGE)}`]) {
    const r = await admin(url);
    assert.equal(r.statusCode, 404, url);
    assert.match(r.headers['content-type'], /text\/html/);
    verifierPage(r.body);
    assert.match(r.body, /<h1>Alerte introuvable<\/h1>/, url);
    assert.match(r.body, /class="side"/, `${url} : page en session`);
    assert.match(r.body, /<a href="\/alertes" aria-current="page">/);
  }
  assert.match((await admin('/alertes/99999')).body, /Aucune alerte n° 99999\./);
  // Sans session : la connexion, pas la page.
  const sans = await v.c.app.inject({ url: '/alertes/1', headers: { 'cf-access-jwt-assertion': accessJwt(v.clock, 'seb@exemple.org') } });
  assert.equal(sans.statusCode, 302);
  assert.match(sans.headers.location, /^\/auth\/login\?retour=%2Falertes%2F1/);
});

test('bornes : pages de 50 (numérotées pour les non closes, par jeu de clés pour les closes), requêtes indexées', async t => {
  const v = setup(t);
  const { alerte, db } = v;
  for (let i = 0; i < 60; i += 1) alerte({ regle: 'entite.score', cas: 'quorum', entite_kind: 'ip', entite_key: `203.0.113.${i}`, gravite: i % 2 ? 'moyen' : 'haut', mode: 'observer', premiere: T0 - i * min, derniere: T0 - i * min });
  for (let i = 0; i < 55; i += 1) alerte({ regle: 'sigma.oidc_echecs_repetes', entite_kind: 'ip', entite_key: `192.0.2.${i}`, gravite: 'moyen', mode: 'alerter', statut: 'close', classement: 'test',
    premiere: T0 - 3600e3 - i * min, derniere: T0 - 3600e3 - i * min });
  v.clock.t = T0;
  const admin = await v.login('sub-seb', 'Sébastien', 'admin', 'seb@exemple.org');
  const ids = body => [...body.matchAll(/<a class="ligne-lien" href="\/alertes\/(\d+)">/g)].map(m => Number(m[1]));
  const p1 = await admin('/alertes');
  assert.equal(ids(p1.body).length, 50);
  assert.match(p1.body, /Page 1 sur 2 · alertes 1 à 50 sur 60/);
  assert.match(p1.body, /<a class="btn ghost" href="\/alertes\?page=2" rel="next">Page suivante<\/a>/);
  assert.doesNotMatch(p1.body, /rel="prev"/, 'pas de lien mort sur la première page');
  const p2 = await admin('/alertes?page=2');
  assert.equal(ids(p2.body).length, 10);
  assert.equal(new Set([...ids(p1.body), ...ids(p2.body)]).size, 60);
  assert.match(p2.body, /<a class="btn ghost" href="\/alertes" rel="prev">Page précédente<\/a>/);
  // Hautes d'abord, puis moyennes.
  const graves = [...p1.body.matchAll(/<td class="c-grav"><span class="grav grav--(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(graves.slice(0, 30), Array(30).fill('haute'));
  // Closes : jeu de clés.
  const c1 = await admin('/alertes?statut=close');
  assert.equal(ids(c1.body).length, 50);
  const suite = /href="(\/alertes\?statut=close&amp;apres=\d+-\d+)" rel="next">Plus anciennes/.exec(c1.body);
  assert.ok(suite);
  const c2 = await admin(suite[1].replaceAll('&amp;', '&'));
  assert.equal(ids(c2.body).length, 5);
  assert.equal(new Set([...ids(c1.body), ...ids(c2.body)]).size, 55);
  assert.match(c2.body, /Les plus récentes/);

  // Plans d'exécution : chaque requête du module passe par un index ; jamais un parcours de la table des événements.
  const q = requetesAlertes(db);
  const plan = (st, ...a) => db.prepare(`EXPLAIN QUERY PLAN ${st.source}`).all(...a).map(r => r.detail).join(' | ');
  assert.match(plan(q.historique, 1), /SEARCH events USING INDEX events_alerte/);
  assert.match(plan(q.evenements, 1, 10), /SEARCH a USING COVERING INDEX .*alert_id=\? AND seq<\?.*SEARCH e USING INTEGER PRIMARY KEY/);
  for (const [nom, st, args] of [['historique', q.historique, [1]], ['evenements', q.evenements, [1, 10]], ['nbEvenements', q.nbEvenements, [1]], ['decisions', q.decisions, [1]],
    ['alerte', q.alerte, [1]], ['autres', q.autres, ['ip', 'x', 1]]]) {
    assert.doesNotMatch(plan(st, ...args), /SCAN (events|e)\b/, nom);
    assert.match(st.source, /LIMIT|WHERE id = \?/, `${nom} : bornée`);
  }
  // Décisions d'une alerte et réponses d'une page : par l'index de alerte_id (migration 012, audit D3-D3), jamais un
  // parcours de la table des décisions (jamais purgée avant, 200 000 lignes en 13 mois au pire).
  assert.match(plan(q.decisions, 1), /SEARCH decisions USING INDEX decisions_alerte \(alerte_id=\?\)/);
  assert.match(plan(q.reponses, '[1,2]'), /SEARCH decisions USING INDEX decisions_alerte \(alerte_id=\?\)/);
  // Les listes préparées pour les filtres : bornées, par un index de la table des alertes.
  const formes = ["SELECT id FROM alerts WHERE statut != 'close' AND regle = ? ORDER BY derniere DESC LIMIT 51", "SELECT id FROM alerts WHERE statut = 'close' AND (derniere < ? OR (derniere = ? AND id < ?)) ORDER BY derniere DESC, id DESC LIMIT 51"];
  assert.match(db.prepare(`EXPLAIN QUERY PLAN ${formes[0]}`).all('x').map(r => r.detail).join(' '), /alerts_ouvertes/);
  assert.match(db.prepare(`EXPLAIN QUERY PLAN ${formes[1]}`).all(1, 1, 1).map(r => r.detail).join(' '), /alerts_derniere/);
});

test('historique : index partiel sur detail.id des événements vigie_alerte ; détail illisible sans effet', async t => {
  const v = setup(t);
  const { db, store, alerte, clock } = v;
  clock.t = T0 - 10 * min;
  const id = alerte({ regle: 'sigma.cookie_rejoue', cas: 'DS1', entite_kind: 'compte', entite_key: 'zitadel-1', gravite: 'haut', mode: 'alerter', premiere: clock.t, derniere: clock.t });
  store.own('vigie_alerte', { emetteur: 'vigie/moteur.js · sigma.cookie_rejoue', detail: { action: 'ouverte', id, gravite: 'moyen', mode: 'alerter' } });
  clock.t += min;
  store.own('vigie_alerte', { emetteur: 'vigie/moteur.js · sigma.cookie_rejoue', detail: { action: 'aggravee', id, gravite: 'haut', avant: 'moyen' } });
  // Un autre numéro, et un détail qui n'est pas du JSON : ni l'un ni l'autre ne gêne.
  store.own('vigie_alerte', { emetteur: 'x', detail: { action: 'ouverte', id: id + 1 } });
  store.add([{ id: crypto.randomUUID(), type: 'vigie_alerte', severity: 'info', composant: 'vigie · contrôle', canal: 'interne', confiance: 'constaté', detail: 'pas du json {' }]);
  clock.t += min;
  v.engine.classify(id, { classement: 'test', note: 'essai', par: 'console · Sébastien' });
  clock.t = T0;
  const admin = await v.login('sub-seb', 'Sébastien', 'admin', 'seb@exemple.org');
  const r = await admin(`/alertes/${id}`);
  assert.equal(r.statusCode, 200);
  const items = [...r.body.matchAll(/<ol class="chrono">([\s\S]*?)<\/ol>/g)][0][1].match(/<li>[\s\S]*?<\/li>/g);
  assert.equal(items.length, 3);
  assert.match(items[0], /Ouverte, gravité Moyenne, mode Alerter/);
  assert.match(items[1], /Aggravée : Moyenne, puis Haute/);
  assert.match(items[2], /Classée Test par Sébastien, alerte close : « essai »/);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'events_alerte'").pluck().get(), 'events_alerte');
});

test('tactiques MITRE : étiquettes Sigma en français, techniques en majuscules, le reste ignoré', () => {
  assert.deepEqual(mitre(['attack.persistence', 'attack.privilege_escalation', 'attack.t1098', 'attack.t1098', 'cve.2024-1', 'attack.t1110.001']),
    { tactiques: ['Persistance', 'Élévation de privilèges'], techniques: ['T1098', 'T1110.001'] });
  assert.equal(mitre([]), null);
  assert.equal(mitre([PIEGE, 'attack.inconnue']), null);
});

test('fiche d’une alerte ancienne (audit D3-D14) : événements comptés par la jointure, ceux effacés par la conservation dits', async t => {
  const v = setup(t);
  const { alerte, evenement, lier, clock } = v;
  clock.t = T0 - 3600e3;
  // Alerte de 8 mois : trois de ses quatre événements ont été purgés (liens restés), le quatrième est encore au journal.
  const vieille = alerte({ regle: 'sigma.oidc_echecs_repetes', entite_kind: 'ip', entite_key: IP, gravite: 'bas', mode: 'alerter', statut: 'close', classement: 'incident',
    premiere: T0 - 240 * 864e5, derniere: T0 - 239 * 864e5, compteur: 4 });
  for (const seq of [900_001, 900_002, 900_003]) lier.run(vieille, seq);
  evenement(vieille);
  // Alerte de 10 mois : tous ses événements effacés.
  const toute = alerte({ regle: 'sigma.oidc_echecs_repetes', entite_kind: 'ip', entite_key: IP, gravite: 'bas', mode: 'alerter', statut: 'close', classement: 'test',
    premiere: T0 - 300 * 864e5, derniere: T0 - 300 * 864e5, compteur: 2 });
  for (const seq of [900_004, 900_005]) lier.run(toute, seq);
  clock.t = T0;
  const admin = await v.login('sub-seb', 'Sébastien', 'admin', 'seb@exemple.org');
  const r = await admin(`/alertes/${vieille}`);
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /1 événement relié à l’alerte\u202f; 3 événements effacés par la durée de conservation\./);
  assert.equal((r.body.match(/class="vg-type"/g) || []).length, 1, 'un seul événement listé');
  const r2 = await admin(`/alertes/${toute}`);
  assert.match(r2.body, /<p class="vg-compte">2 événements effacés par la durée de conservation\.<\/p>/);
  assert.match(r2.body, /Aucun événement relié encore au journal\u202f; 2 événements effacés par la durée de conservation\./);
  assert.doesNotMatch(r2.body, /2 événements reliés/);
});
