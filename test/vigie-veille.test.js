import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createVeille, lireInventaire, JOUR, REESSAI } from '../vigie/veille.js';
import { setup } from './console-env.js';
import { vueVeille } from '../vigie/console/ecrans/veille.js';

const paquet = (version = '1.0.0', extra = {}) => ({ version, resolved: 'https://registry.npmjs.org/exemple/-/exemple.tgz', ...extra });
const lock = (packages = {}, dependencies = { exemple: '1.0.0' }) => ({ lockfileVersion: 3, packages: { '': { version: '1.0.0', dependencies }, 'node_modules/exemple': paquet(), ...packages } });
const sources = () => [{ id: 'site', nom: 'Site', lock: lock() }, { id: 'vigie', nom: 'Vigie', lock: lock() }];
const avis = (id = 'GHSA-aaaa-bbbb-cccc') => ({ id, summary: 'Une bibliothèque à examiner', database_specific: { severity: 'HIGH' }, aliases: ['CVE-2026-12345'],
  affected: [{ package: { ecosystem: 'npm', name: 'exemple' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.0.1' }] }] }] });
const reponse = x => new Response(JSON.stringify(x));
const api = async url => reponse(url.endsWith('/querybatch') ? { results: [{ vulns: [{ id: 'GHSA-aaaa-bbbb-cccc' }] }] } : avis());
function environnement(t, opts = {}) {
  const db = openVigieDb(':memory:'), clock = { t: Date.parse('2026-10-22T12:00:00Z') };
  const store = createStore({ db, logKey: 'cle-test-veille-012345678901234567890', now: () => clock.t });
  const args = { store, now: () => clock.t, inventaire: lireInventaire(sources()), fetchImpl: api, ...opts };
  const veille = createVeille(args);
  t.after(async () => { await veille.close(); db.close(); });
  return { db, store, clock, args, veille };
}

test('Veille : bibliothèques directes, imbriquées, partagées, optionnelles, dev et sources hors npm', () => {
  const s = sources();
  s[0].lock = lock({ 'node_modules/a/node_modules/exemple': paquet('0.9.0'), 'node_modules/@port/binaire': paquet('2.0.0', { optional: true }),
    'node_modules/test': paquet('1.0.0', { dev: true }), 'node_modules/git': paquet('1.0.0', { resolved: 'git+https://example.org/a.git' }),
    'node_modules/local': { link: true }, 'node_modules/alias': paquet('1.0.0', { name: '@nom/reel' }) }, { exemple: '1.0.0', alias: 'npm:@nom/reel@1.0.0' });
  const i = lireInventaire(s);
  assert.deepEqual(i.cibles[0], { id: 'site', nom: 'Site', version: '1.0.0', directs: 2, indirects: 2, optionnels: 1, developpement: 1, exclus: 2, erreur: null });
  assert.equal(i.paquets.find(p => p.nom === 'exemple' && p.version === '1.0.0').usages.length, 2);
  assert.equal(i.paquets.find(p => p.nom === '@nom/reel').usages[0].direct, true);
  assert.equal(i.paquets.find(p => p.version === '0.9.0').usages[0].direct, false);
  assert.notEqual(i.empreinte, lireInventaire(sources()).empreinte);
});

test('Veille : inventaire absent annoncé et inventaire du dépôt lisible pour les deux cibles', () => {
  const i = lireInventaire([{ id: 'site', nom: 'Site', fichier: '/chemin-inexistant-veille/package-lock.json' }]);
  assert.match(i.cibles[0].erreur, /absent/);
  assert.equal(i.paquets.length, 0);
  const reel = lireInventaire();
  assert.equal(reel.cibles.length, 2);
  assert.ok(reel.cibles.every(c => c.directs > 0 && c.indirects > 0 && !c.erreur && !c.exclus));
});

test('Veille : inventaire vide ne réussit pas et reste réessayable', async t => {
  let appels = 0;
  const e = environnement(t, { inventaire: lireInventaire([{ id: 'site', nom: 'Site', lock: {} }]), fetchImpl: async () => { appels++; } });
  await e.veille.actualiser();
  assert.equal(e.veille.etat().encours, false);
  assert.equal(e.veille.etat().succes, null);
  assert.equal(e.veille.etat().incomplet, true);
  assert.ok(e.veille.etat().erreur);
  e.clock.t += REESSAI;
  await e.veille.actualiser();
  assert.equal(e.veille.etat().tentative, e.clock.t);
  assert.equal(appels, 0);
});

test('Veille : correspondance OSV persistée, source fixe et minimisation des requêtes', async t => {
  const appels = [];
  const e = environnement(t, { fetchImpl: async (url, opts) => { appels.push({ url, opts }); return api(url); } });
  await e.veille.actualiser();
  const etat = e.veille.etat();
  assert.equal(etat.avis.length, 1);
  assert.equal(etat.avis[0].gravite, 'haute');
  assert.deepEqual(etat.avis[0].paquets[0].correctifs, ['1.0.1']);
  assert.equal(etat.avis[0].paquets[0].usages.length, 2);
  assert.equal(e.db.prepare('SELECT count(*) AS n FROM events').get().n, 0);
  assert.deepEqual(JSON.parse(appels[0].opts.body), { queries: [{ package: { ecosystem: 'npm', name: 'exemple' }, version: '1.0.0' }] });
  assert.ok(appels.every(x => x.url.startsWith('https://api.osv.dev/v1/') && x.opts.redirect === 'error' && x.opts.signal));
  const reprise = createVeille(e.args);
  assert.deepEqual(reprise.etat().avis, etat.avis);
  await reprise.actualiser();
  assert.equal(appels.length, 2);
  await reprise.close();
});

test('Veille : pagination OSV par paquet, déduplication et retrait des avis', async t => {
  let n = 0;
  const e = environnement(t, { fetchImpl: async (url, opts) => {
    if (!url.endsWith('/querybatch')) return reponse({ ...avis(), withdrawn: '2026-10-20T00:00:00Z' });
    const query = JSON.parse(opts.body).queries[0];
    n++;
    if (n === 1) { assert.equal(query.page_token, undefined); return reponse({ results: [{ vulns: [{ id: avis().id }], next_page_token: 'page-2' }] }); }
    assert.equal(query.page_token, 'page-2');
    return reponse({ results: [{ vulns: [{ id: avis().id }] }] });
  } });
  await e.veille.actualiser();
  assert.equal(n, 2);
  assert.equal(e.veille.etat().avis.length, 0);
  assert.equal(e.veille.etat().succes, e.clock.t);
});

test('Veille : panne après succès, résultats conservés et réessai horaire', async t => {
  let panne = false, appels = 0;
  const e = environnement(t, { fetchImpl: async url => { appels++; return panne ? new Response('secret-distant', { status: 503 }) : api(url); } });
  await e.veille.actualiser();
  const succes = e.veille.etat().succes;
  panne = true; e.clock.t += JOUR;
  await e.veille.actualiser();
  assert.equal(e.veille.etat().succes, succes);
  assert.equal(e.veille.etat().avis.length, 1);
  assert.equal(e.veille.etat().perime, true);
  assert.ok(e.veille.etat().erreur);
  assert.doesNotMatch(JSON.stringify(e.veille.etat()), /secret-distant/);
  await e.veille.actualiser(); assert.equal(appels, 3);
  panne = false; e.clock.t += REESSAI;
  await e.veille.actualiser();
  assert.equal(e.veille.etat().erreur, null);
  assert.equal(e.veille.etat().perime, false);
  assert.equal(appels, 5);
});

test('Veille : un changement d’inventaire invalide les anciens résultats dès le redémarrage', async t => {
  const e = environnement(t);
  await e.veille.actualiser();
  const s = sources(); s[0].lock.packages['node_modules/exemple'].version = '2.0.0';
  const nouvelle = createVeille({ ...e.args, inventaire: lireInventaire(s) });
  assert.equal(nouvelle.etat().succes, null);
  assert.deepEqual(nouvelle.etat().avis, []);
  await nouvelle.close();
});

test('Veille : réponses tronquées, erreurs, détails manquants et pagination excessive ne valent jamais zéro avis', async t => {
  for (const fetchImpl of [
    async () => reponse({ results: [] }),
    async () => reponse({ results: [{ error: 'erreur' }] }),
    async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)),
    async () => reponse({ results: [{ next_page_token: 'encore' }] }),
    async url => url.endsWith('/querybatch') ? api(url) : new Response('absent', { status: 404 }),
    async url => url.endsWith('/querybatch') ? api(url) : reponse({ ...avis(), affected: [] }),
  ]) {
    const e = environnement(t, { fetchImpl });
    await e.veille.actualiser();
    assert.equal(e.veille.etat().succes, null);
    assert.ok(e.veille.etat().erreur);
  }
});

test('Veille : un seul traitement, arrêt interrompt le réseau sans écrire après fermeture', async t => {
  let appels = 0, commence;
  const debut = new Promise(resolve => { commence = resolve; });
  const e = environnement(t, { fetchImpl: async (url, opts) => {
    appels++; commence();
    return new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => reject(new Error('arrêt')), { once: true }));
  } });
  const a = e.veille.actualiser(), b = e.veille.actualiser();
  assert.equal(a, b);
  await debut;
  await e.veille.close();
  assert.equal(appels, 1);
  assert.equal(e.veille.etat().tentative, null);
});

test('Veille : lots de cent paquets, pages propres à chaque paquet et absence d’avis attestée', async t => {
  const s = sources().slice(0, 1);
  s[0].lock = lock(Object.fromEntries(Array.from({ length: 105 }, (_, i) => [`node_modules/paquet-${i}`, paquet()])));
  const lots = [];
  const e = environnement(t, { inventaire: lireInventaire(s), fetchImpl: async (url, opts) => {
    assert.ok(url.endsWith('/querybatch'));
    const queries = JSON.parse(opts.body).queries;
    lots.push(queries);
    return reponse({ results: queries.map((q, i) => lots.length === 1 && i === 0 ? { next_page_token: 'seul-ce-paquet' } : {}) });
  } });
  await e.veille.actualiser();
  assert.deepEqual(lots.map(x => x.length), [100, 1, 6]);
  assert.deepEqual(lots[1][0], { ...lots[0][0], page_token: 'seul-ce-paquet' });
  assert.equal(e.veille.etat().succes, e.clock.t);
  assert.deepEqual(e.veille.etat().avis, []);
});

test('Console Veille : filtres avant pagination, cible et paramètres bornés', () => {
  const inventaire = lireInventaire(sources());
  const etat = { inventaire, avis: Array.from({ length: 35 }, (_, i) => ({ id: `GHSA-${i}`, titre: 'Avis', aliases: [], gravite: 'haute', paquets: [inventaire.paquets[0]] })) };
  const v = vueVeille(etat, { p: '2', cible: 'site', q: 'exemple' });
  assert.equal(v.avis.length, 5);
  assert.equal(v.total, 35);
  assert.equal(v.pages, 2);
  assert.match(v.precedent, /cible=site.*q=exemple.*p=1/);
  assert.equal(vueVeille(etat, { p: '9999', gravite: 'basse' }).page, 1);
  assert.equal(vueVeille(etat, { p: '-1', q: 'a'.repeat(500) }).q.length, 100);
  assert.equal(vueVeille(etat, { cible: '__proto__', gravite: '__proto__' }).total, 35);
});

test('Veille : niveau inconnu, texte hostile et correctifs limités au bon paquet', async t => {
  const e = environnement(t, { fetchImpl: async url => url.endsWith('/querybatch') ? api(url) : reponse({ ...avis(), summary: '<script>danger</script>', database_specific: { severity: 'NEW' },
    affected: [...avis().affected, { package: { ecosystem: 'npm', name: 'autre' }, ranges: [{ type: 'SEMVER', events: [{ fixed: '9.9.9' }] }] }] }) });
  await e.veille.actualiser();
  assert.equal(e.veille.etat().avis[0].gravite, 'inconnue');
  assert.deepEqual(e.veille.etat().avis[0].paquets[0].correctifs, ['1.0.1']);
});

test('Console Veille : accès protégé, lecture par la Lectrice, filtres et absence de mutation', async t => {
  const e = environnement(t);
  await e.veille.actualiser();
  const c = setup(t, { extra: { veille: e.veille } });
  const sansAccess = await c.app.inject('/veille');
  assert.equal(sansAccess.statusCode, 403);
  const sansSession = await c.app.inject({ url: '/veille', headers: c.h() });
  assert.equal(sansSession.statusCode, 302);
  c.ceilings['sub-lecture'] = 'viewer';
  const { cookie, headers } = await c.login({ sub: 'sub-lecture', roles: ['vigie.viewer'] });
  const avant = c.alerts().length;
  const lire = url => c.app.inject({ url, headers, cookies: { '__Host-vigie': cookie } });
  const r = await lire('/veille');
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Veille des vulnérabilités/);
  assert.match(r.body, /CVE-2026-12345/);
  assert.match(r.body, /1\.0\.1/);
  assert.match(r.body, /href="\/veille" aria-current="page"/);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.headers['referrer-policy'], 'no-referrer');
  assert.match((await lire('/veille?gravite=basse')).body, /Aucun avis ne correspond/);
  assert.match((await lire('/veille?cible=site&q=exemple')).body, /CVE-2026-12345/);
  assert.match((await lire('/veille?q=absent')).body, /Aucun avis ne correspond/);
  assert.equal(c.alerts().length, avant);
  assert.equal((await c.app.inject({ method: 'POST', url: '/veille', headers, cookies: { '__Host-vigie': cookie } })).statusCode, 403);
});

test('Console Veille : état initial, panne, ancienneté et contenu distant échappé', async t => {
  let panne = false;
  const e = environnement(t, { fetchImpl: async url => {
    if (panne) throw new Error('panne');
    return url.endsWith('/querybatch') ? api(url) : reponse({ ...avis(), summary: '<img src=x onerror=alert(1)>' });
  } });
  const c = setup(t, { extra: { veille: e.veille } });
  const { cookie, headers } = await c.login();
  const lire = () => c.app.inject({ url: '/veille', headers, cookies: { '__Host-vigie': cookie } });
  const initial = await lire();
  assert.match(initial.body, /Vérification en attente/);
  assert.doesNotMatch(initial.body, /Aucun avis connu trouvé/);
  await e.veille.actualiser();
  const ok = await lire();
  assert.match(ok.body, /&lt;img/);
  assert.doesNotMatch(ok.body, /<img src=x/);
  panne = true; e.clock.t += JOUR;
  await e.veille.actualiser();
  const ancien = await lire();
  assert.match(ancien.body, /Résultats anciens/);
  assert.match(ancien.body, /derniers résultats réussis restent affichés/);
  assert.match(ancien.body, /CVE-2026-12345/);
});
