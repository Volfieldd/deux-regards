import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './console-env.js';
import { createVeille, lireInventaire, JOUR, REESSAI } from '../vigie/veille.js';
import { REGLE_VEILLE, TITRE_VEILLE } from '../vigie/veille-alertes.js';
import { createNotifier } from '../vigie/notifications.js';

const ID = 'GHSA-aaaa-bbbb-cccc';
function inventaire({ version = '1.0.0', cible = null, incomplet = false } = {}) {
  const s = ['site', 'vigie'].filter(id => !cible || id === cible).map(id => ({ id, nom: id, lock: {
    lockfileVersion: 3, packages: { '': { version: '1.214.0', dependencies: { exemple: version } },
      'node_modules/exemple': { version, resolved: 'https://registry.npmjs.org/exemple/-/exemple.tgz' } },
  } }));
  if (incomplet) s.push({ id: 'absent', nom: 'Absent', lock: {} });
  return lireInventaire(s);
}
function environnement(t) {
  let veille;
  const e = setup(t, { extra: { veille: { etat: () => veille.etat() } } });
  const messages = [], mails = [], source = { niveau: 'HIGH', present: true, panne: false, appels: 0, signal: 201 };
  const notifier = createNotifier({ store: e.store, engine: e.engine, switches: e.switches, now: () => e.clock.t,
    config: { signal: { url: 'https://signal.example', number: '+33100000000', group: 'groupe-test' }, mail: { url: 'smtps://smtp.example', from: 'test@example.org', to: ['test@example.org'] }, consoleUrl: 'https://vigie.example' },
    fetchImpl: async (url, opts) => { messages.push(JSON.parse(opts.body).message); return new Response('{}', { status: source.signal }); },
    transport: { sendMail: async m => { mails.push(m.text); } } });
  const fetchImpl = async (url, opts) => {
    source.appels++;
    if (source.panne) return new Response('{}', { status: 503 });
    if (url.endsWith('/querybatch')) return Response.json({ results: JSON.parse(opts.body).queries.map(() => source.present ? { vulns: [{ id: ID }] } : {}) });
    return Response.json({ id: ID, summary: 'Avis de test <img src=x onerror=alert(1)>', database_specific: { severity: source.niveau },
      aliases: ['CVE-2026-12345'], affected: [{ package: { name: 'exemple', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ fixed: '1.0.1' }] }] }] });
  };
  const changer = async (inv = inventaire()) => {
    await veille?.close();
    veille = createVeille({ store: e.store, switches: e.switches, now: () => e.clock.t, fetchImpl, inventaire: inv });
  };
  const cycle = async (delai = JOUR) => { e.clock.t += delai; await veille.actualiser(); await notifier.idle(); };
  const alertes = () => e.db.prepare('SELECT * FROM alerts WHERE regle = ? ORDER BY id').all(REGLE_VEILLE);
  const evenements = () => e.events('vigie_alerte').filter(x => x.detail.regle === REGLE_VEILLE);
  return { ...e, source, messages, mails, notifier, changer, cycle, alertes, evenements, etat: () => veille.etat() };
}

test('Veille : première alerte, notification Signal et résumé ; ni doublon quotidien, ni dossier, ni décision', async t => {
  const e = environnement(t); await e.changer(); await e.cycle(0);
  const a = e.alertes()[0];
  assert.equal(e.alertes().length, 1, 'même paquet des deux cibles regroupé');
  assert.equal(a.gravite, 'haut'); assert.equal(a.mode, 'alerter'); assert.equal(a.dossier_id, null);
  assert.equal(e.messages.length, 1);
  assert.match(e.messages[0], /bibliothèque déclarée, à vérifier/);
  assert.match(e.messages[0], new RegExp(`/alertes/${a.id}$`));
  assert.match(e.messages[0], /Aucune réponse automatique/);
  assert.equal(e.engine.summary().ouvertes.haut, 1);
  assert.equal(e.db.prepare('SELECT count(*) FROM decisions').pluck().get(), 0);
  assert.equal(e.db.prepare('SELECT count(*) FROM dossiers').pluck().get(), 0);
  const avant = e.evenements().length;
  await e.cycle(); await e.changer(); await e.cycle(0); await e.cycle();
  assert.equal(e.alertes().length, 1); assert.equal(e.messages.length, 1);
  assert.equal(e.evenements().length, avant); assert.equal(e.alertes()[0].compteur, 1);
  assert.equal(e.etat().avis[0].paquets[0].alerte.id, a.id);
  assert.equal(e.store.verify().ok, true);
});

test('Veille : gravités moyennes et inconnues visibles, aggravation haute puis critique notifiée une fois', async t => {
  const e = environnement(t); e.source.niveau = 'MODERATE'; await e.changer(); await e.cycle(0);
  assert.equal(e.alertes()[0].gravite, 'moyen'); assert.equal(e.messages.length, 0);
  e.source.niveau = 'HIGH'; await e.cycle();
  assert.equal(e.alertes().length, 1); assert.equal(e.messages.length, 1); assert.match(e.messages[0], /aggravée/);
  e.source.niveau = 'CRITICAL'; await e.cycle();
  assert.equal(e.messages.length, 2); assert.equal(e.alertes()[0].gravite, 'critique');
  e.source.niveau = 'HIGH'; await e.cycle(); e.source.niveau = 'CRITICAL'; await e.cycle();
  assert.equal(e.messages.length, 2, 'pas de notification pour une oscillation déjà connue');
  e.source.niveau = 'INCONNUE'; await e.changer(inventaire({ version: '2.0.0' })); await e.cycle();
  assert.equal(e.alertes().at(-1).gravite, 'info'); assert.equal(e.messages.length, 2);
});

test('Veille : classement manuel respecté ; aggravation et nouvelle cible après classement ouvrent un nouveau suivi', async t => {
  const e = environnement(t); await e.changer(inventaire({ cible: 'site' })); await e.cycle(0);
  const premier = e.alertes()[0].id;
  e.engine.classify(premier, { statut: 'close', par: 'Test', classement: 'faux_positif', note: 'Bibliothèque absente de cette image.' });
  await e.cycle(); await e.changer(inventaire({ cible: 'site' })); await e.cycle(0);
  assert.equal(e.alertes().length, 1); assert.equal(e.alertes()[0].statut, 'close'); assert.equal(e.messages.length, 1);
  await e.changer(inventaire()); await e.cycle();
  assert.equal(e.alertes().length, 2); assert.equal(e.messages.length, 2);
  e.engine.classify(e.alertes()[1].id, { statut: 'close', par: 'Test', classement: 'faux_positif', note: 'Examiner à nouveau si aggravation.' });
  e.source.niveau = 'CRITICAL'; await e.cycle();
  assert.equal(e.alertes().length, 3); assert.equal(e.messages.length, 3);
  assert.equal(e.alertes()[0].classement, 'faux_positif');
});

test('Veille : disparition complète clôt sans prétendre à un correctif installé ; réapparition signalée', async t => {
  const e = environnement(t); await e.changer(); await e.cycle(0);
  e.source.present = false; await e.cycle();
  assert.equal(e.alertes()[0].statut, 'close');
  assert.match(e.alertes()[0].note, /correction installée non attestée/);
  assert.equal(e.messages.length, 1);
  e.source.present = true; await e.cycle();
  assert.equal(e.alertes().length, 2); assert.equal(e.messages.length, 2);
  assert.equal(e.etat().avis[0].paquets[0].alerte.id, e.alertes()[1].id);
});

test('Veille : une panne, une couverture partielle et sept jours de silence ne ferment pas une alerte', async t => {
  const e = environnement(t); await e.changer(); await e.cycle(0);
  e.source.panne = true; await e.cycle(8 * JOUR);
  assert.ok(e.etat().erreur); e.engine.closeQuiet(); assert.equal(e.alertes()[0].statut, 'ouverte');
  e.source.panne = false; e.source.present = false;
  await e.changer(inventaire({ incomplet: true })); await e.cycle();
  assert.equal(e.etat().incomplet, true); assert.equal(e.alertes()[0].statut, 'ouverte');
  assert.equal(e.messages.length, 1);
});

test('Veille : interrupteurs existants, rattrapage du cache et e-mail de secours', async t => {
  const e = environnement(t); await e.changer();
  e.store.setting.set('interrupteurs', { detection: { etat: 'arret', jusqua: e.clock.t + JOUR } });
  await e.cycle(0); assert.equal(e.alertes().length, 0);
  const appels = e.source.appels;
  e.store.setting.set('interrupteurs', { alertes: { etat: 'arret', jusqua: e.clock.t + JOUR } });
  await e.cycle(0); assert.equal(e.source.appels, appels); assert.equal(e.alertes().length, 1); assert.equal(e.messages.length, 0);
  e.store.setting.set('interrupteurs', {}); e.source.niveau = 'CRITICAL'; e.source.signal = 503;
  await e.cycle();
  assert.equal(e.messages.length, 1); assert.equal(e.mails.length, 1); assert.match(e.mails[0], /\[Critique\]/);
});

test('Veille : échec transactionnel puis reprise, sans alerte orpheline ni double notification', async t => {
  const e = environnement(t); await e.changer();
  const set = e.store.setting.set;
  e.store.setting.set = (cle, valeur) => { if (cle === 'veille_npm_v1' && !valeur.erreur) throw new Error('échec simulé du cache'); return set(cle, valeur); };
  // Sans vider la file avant la reprise : un événement annulé ne doit pas notifier l'alerte réutilisant son numéro.
  const attente = e.notifier.idle; e.notifier.idle = async () => {};
  await e.cycle(0);
  assert.equal(e.alertes().length, 0); assert.equal(e.db.prepare('SELECT count(*) FROM veille_alertes').pluck().get(), 0);
  assert.equal(e.evenements().length, 0); assert.equal(e.etat().succes, null);
  e.store.setting.set = set; await e.cycle(REESSAI);
  e.notifier.idle = attente; await attente();
  assert.equal(e.alertes().length, 1); assert.equal(e.messages.length, 1); assert.equal(e.store.verify().ok, true);
});

test('Veille : purge d’une alerte classée ne réémet pas le même avis encore présent', async t => {
  const e = environnement(t); await e.changer(); await e.cycle(0);
  e.engine.classify(e.alertes()[0].id, { statut: 'close', par: 'Test', classement: 'faux_positif', note: 'Absente.' });
  e.clock.t += 396 * JOUR; e.engine.purge();
  assert.equal(e.alertes().length, 0);
  await e.cycle(0);
  assert.equal(e.alertes().length, 0); assert.equal(e.messages.length, 1);
  assert.equal(e.etat().avis[0].paquets[0].alerte, null);
});

test('Console : Veille mène à l’alerte, fiche explicite et filtre utilisables par la Lectrice', async t => {
  const e = environnement(t); await e.changer(); await e.cycle(0);
  e.ceilings['sub-lecture'] = 'viewer';
  const { cookie, headers } = await e.login({ sub: 'sub-lecture', roles: ['vigie.viewer'] });
  const lire = url => e.app.inject({ url, headers, cookies: { '__Host-vigie': cookie } });
  const id = e.alertes()[0].id, page = await lire('/veille');
  assert.match(page.body, new RegExp(`href="/alertes/${id}"`));
  const fiche = await lire(`/alertes/${id}`);
  assert.equal(fiche.statusCode, 200); assert.match(fiche.body, /présence à confirmer/);
  assert.match(fiche.body, /href="\/veille\?q=GHSA-aaaa-bbbb-cccc"/);
  assert.doesNotMatch(fiche.body, /Actions forcées|form="f-prendre"/);
  assert.equal(fiche.headers['cache-control'], 'no-store');
  const liste = await lire(`/alertes?regle=${REGLE_VEILLE}`);
  assert.equal(liste.statusCode, 200); assert.match(liste.body, new RegExp(TITRE_VEILLE));
  assert.doesNotMatch(liste.body, /Filtre ignoré/);
});
