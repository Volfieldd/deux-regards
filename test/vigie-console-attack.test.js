import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { environnement, PIEGE } from './console-dossiers.js';
import { VERSION, TACTIQUES } from '../vigie/attack.js';
import { vueAttack, calque, MAX_SIGNAUX, MAX_DOSSIER } from '../vigie/console/ecrans/attack.js';
import { lecture, parametres, lireFiltres, journal } from '../vigie/console/ecrans/evenements.js';

// D3 : l'index reste dérivé, les nombres sont ceux des étiquettes notées (pas du mode actuel), et les réponses
// réelles passent par les gardes de la console. Les calques ne transportent aucune donnée d'événement.
const tags = ['attack.initial_access', 'attack.t1078'];
function noter(v, extra = {}, champs = {}) {
  v.store.add([{ id: randomUUID(), type: 'vigie_signal', severity: 'info', recu_a: v.clock.t, survenu_a: v.clock.t, composant: 'vigie', canal: 'interne', confiance: 'constaté', detail: { regle: 'detecteur.premiere_apparition', titre: PIEGE, tags, ...extra }, ...champs }]);
  return v.db.prepare('SELECT max(seq) FROM events').pluck().get();
}
const vue = (v, query = {}, extra = {}) => vueAttack({ db: v.db, engine: v.engine, now: () => v.clock.t, query, ...extra });
const compteur = (v, id, tac) => v.cartes.find(c => c.cle === tac).items.find(x => x.id === id)?.n || 0;

test('ATT&CK : couverture complète et stable sans signal, modes et exceptions de projection', t => {
  const v = environnement(t), a = vue(v), b = vue(v, { periode: '24h' });
  assert.equal(a.cartes.length, 15); assert.equal(a.signaux, 0);
  assert.deepEqual(a.cartes.map(c => c.id), TACTIQUES.map(c => c.id));
  assert.equal(a.couverts, b.couverts); assert.ok(a.couverts > 20);
  const f = vue(v, {}, { id: 'T1078' });
  assert.ok(f.regles.some(r => /Connexion à la console refusée/.test(r.titre) && /Tentative.*exception explicite/.test(r.phase)));
  assert.ok(f.regles.some(r => /indice d’accès/.test(r.phase)));
  assert.ok(f.regles.every(r => !r.phase.includes('undefined')));
  assert.ok(a.cartes.find(c => c.cle === 'resource_development').sans.length > 0);
});

test('ATT&CK : un signal par technique et tactique réellement portée, doublons, sous-techniques et périodes', t => {
  const v = environnement(t);
  noter(v, { tags: [...tags, 'attack.T1078', 'attack.persistence', 'attack.t1550.004', 'attack.lateral_movement'] });
  noter(v, { tags: ['attack.discovery', 'attack.t1087'] }, { recu_a: v.clock.t - 2 * 864e5 });
  noter(v, { tags: ['attack.stealth', 'attack.t1078'] }, { recu_a: v.clock.t + 1 });
  const a = vue(v, { periode: '24h' });
  assert.equal(a.signaux, 1); assert.equal(compteur(a, 'T1078', 'initial_access'), 1);
  assert.equal(compteur(a, 'T1078', 'persistence'), 1); assert.equal(compteur(a, 'T1078', 'stealth'), 0);
  assert.equal(compteur(a, 'T1550.004', 'lateral_movement'), 1); assert.equal(a.parTechnique.get('T1550').n, 0);
  assert.equal(vue(v).signaux, 2); assert.equal(vue(v, {}, { id: 'T1087' }).tech.n, 1);
  assert.ok(v.store.verify().ok);
});

test('ATT&CK : étiquettes historiques indépendantes de la règle actuelle et détails mal formés', t => {
  const v = environnement(t);
  noter(v, { regle: 'ancienne.regle', tags: ['attack.collection', 'attack.t1005'] });
  for (const detail of ['{faux', 'null', '{"tags":"attack.t1078"}', '{"tags":[null,42,{},"attack.t9999"]}']) noter(v, {}, { detail });
  const a = vue(v);
  assert.equal(compteur(a, 'T1005', 'collection'), 1); assert.equal(a.sansTechnique, 4);
  assert.equal(v.db.prepare('SELECT count(*) FROM events_techniques WHERE technique = ?').pluck().get('T1078'), 0);
});

test('ATT&CK : migration rattrapée sans réécrire la chaîne, doublons ignorés et index purgé', t => {
  const v = environnement(t);
  const seq = noter(v, { tags: [...tags, 'attack.T1078', 'attack.t1550.004', 'attack.t1078x'] });
  noter(v, {}, { detail: '{cassé' });
  const avant = v.db.prepare('SELECT seq,chain,detail FROM events ORDER BY seq').all();
  v.db.exec('DROP TRIGGER events_techniques_effacer; DROP TABLE events_techniques; DROP INDEX dossier_signaux_regle;');
  v.db.exec(fs.readFileSync(new URL('../vigie/migrations/017_techniques_evenements.sql', import.meta.url), 'utf8'));
  assert.deepEqual(v.db.prepare('SELECT seq,chain,detail FROM events ORDER BY seq').all(), avant);
  assert.deepEqual(v.db.prepare('SELECT technique FROM events_techniques WHERE seq = ? ORDER BY technique').pluck().all(seq), ['T1078', 'T1550.004']);
  assert.ok(v.store.verify().ok);
  v.db.prepare('DELETE FROM events WHERE seq = ?').run(seq);
  assert.equal(v.db.prepare('SELECT count(*) FROM events_techniques WHERE seq = ?').pluck().get(seq), 0);
});

test('journal : technique indexée, pagination sans doublon, combinaison compte et alerte, CSV identique', async t => {
  const v = environnement(t), id = v.dossier(), alerte = v.alerte(id);
  for (let n = 0; n < 54; n++) noter(v, {}, { sub: 'a' });
  const cible = noter(v, {}, { sub: 'b' });
  v.db.prepare('INSERT INTO alert_events (alert_id,seq) VALUES (?,?)').run(alerte, cible);
  noter(v, { tags: ['attack.discovery', 'attack.t1087'] });
  const f = lireFiltres({ technique: 't1078', periode: '7j' }, 'admin', v.clock.t);
  assert.equal(f.f.type, 'vigie_signal'); assert.equal(f.driver.k, 'technique');
  const plan = v.db.prepare('EXPLAIN QUERY PLAN ' + lecture(v.db, f.driver).source).all(...parametres(f, null, 50)).map(x => x.detail).join('\n');
  assert.match(plan, /events_techniques_lecture/); assert.doesNotMatch(plan, /SCAN e\b|TEMP B-TREE/);
  const a = journal({ db: v.db, query: f.f, role: 'admin', t: v.clock.t });
  assert.equal(a.liste.lignes.length, 50); assert.match(a.pages.plusAnciens, /technique=T1078/);
  const params = Object.fromEntries(new URL(a.pages.plusAnciens, 'https://v.example').searchParams);
  const b = journal({ db: v.db, query: params, role: 'admin', t: v.clock.t });
  assert.equal(b.liste.lignes.length, 5);
  const { cookie } = await v.login();
  const r = await v.get(cookie, `/evenements?technique=T1078&alerte=${alerte}&compte=b`);
  assert.equal(r.statusCode, 200); assert.match(r.body, /1 événement/);
  const csv = await v.get(cookie, '/evenements.csv?technique=T1078&compte=b&periode=7j');
  assert.equal(csv.statusCode, 200); assert.equal(csv.body.trim().split('\n').length, 2);
  assert.equal(v.events('vigie_console_export').at(-1).detail.filtres.technique, 'T1078');
});

test('ATT&CK : Lectrice, accès refusé sans session, CSP, masquage, échappement et GET sans mutation', async t => {
  const v = environnement(t), d = v.dossier(); v.signal(d, { regle: 'detecteur.premiere_apparition' }); noter(v);
  v.ceilings.camille = 'viewer'; const { cookie } = await v.login({ sub: 'camille', roles: ['vigie.viewer'] });
  const avant = v.db.prepare('SELECT count(*) FROM events').pluck().get();
  for (const url of ['/attack', '/attack/T1078', '/attack?dossier=' + d, '/attack/navigator.json?calque=observe', '/evenements?technique=T1078']) {
    const refus = await v.app.inject({ url }); assert.equal(refus.statusCode, 403);
    const r = await v.get(cookie, url); assert.equal(r.statusCode, 200, url);
    assert.equal(r.headers['cache-control'], 'no-store'); assert.equal(r.headers['referrer-policy'], 'no-referrer');
    assert.doesNotMatch(r.headers['content-security-policy'], /unsafe-inline/);
    assert.doesNotMatch(r.body, /198\.51\.100\.23|2001:db8:1:2::9|<img src=x| style=/);
    if (!url.includes('.json')) { assert.doesNotMatch(r.body.match(/<title>(.*?)<\/title>/s)[1], /Compte|198\./); assert.doesNotMatch(r.body, /<form[^>]+method="post"[^>]+action="\/attack/); }
  }
  // Les refus sont journalisés par le garde commun ; les cinq lectures autorisées, elles, ne le sont pas.
  assert.equal(v.db.prepare('SELECT count(*) FROM events').pluck().get(), avant + 5);
});

test('Navigator : deux calques 4.5 déterministes, scores exacts, aucune donnée personnelle ni URL distante', async t => {
  const v = environnement(t); noter(v, { titre: PIEGE, entite: { kind: 'compte', key: 'secret-du-test' } });
  const a = vue(v), c = calque(a, 'couverture'), o = calque(a, 'observe');
  for (const x of [c, o]) {
    assert.deepEqual(x.versions, { attack: VERSION, navigator: '5.3.2', layer: '4.5' });
    assert.equal(x.domain, 'enterprise-attack'); assert.ok(x.gradient.maxValue > x.gradient.minValue);
    assert.equal(new Set(x.techniques.map(t => `${t.techniqueID}|${t.tactic}`)).size, x.techniques.length);
    assert.ok(x.techniques.every(t => Number.isInteger(t.score) && t.score >= 0));
    assert.doesNotMatch(JSON.stringify(x), /secret-du-test|onerror|https?:|compte-a|198\./);
  }
  assert.equal(o.techniques.find(t => t.techniqueID === 'T1078' && t.tactic === 'initial-access').score, 1);
  assert.equal(o.techniques.find(t => t.techniqueID === 'T1078' && t.tactic === 'persistence').score, 0);
  assert.deepEqual(calque(vue(v), 'observe'), o);
  const { cookie } = await v.login(); const r = await v.get(cookie, '/attack/navigator.json?calque=couverture');
  assert.equal(r.statusCode, 200); assert.match(r.headers['content-disposition'], /attachment; filename="vigie-attack-couverture.json"/);
  assert.deepEqual(r.json(), c);
});

test('ATT&CK : calque du dossier après purge de l’événement, faits exclus et alertes de la règle distinctes', t => {
  const v = environnement(t), d = v.dossier();
  v.signal(d, { regle: 'detecteur.premiere_apparition', survenu_a: v.clock.t - 60 * 864e5 });
  v.signal(d, { regle: 'detecteur.premiere_apparition', nature: 'fait' });
  v.alerte(d, { regle: 'detecteur.premiere_apparition' });
  const x = vue(v, { dossier: String(d), periode: '24h' });
  assert.equal(x.signaux, 1); assert.equal(compteur(x, 'T1078', 'initial_access'), 1);
  assert.equal(x.parTechnique.get('T1078').alertes.length, 1);
  assert.match(calque(x, 'observe').description, /copies du dossier/);
});

test('ATT&CK : bornes explicites des signaux et des copies du dossier, sans changement du journal', t => {
  const v = environnement(t), d = v.dossier();
  v.db.transaction(() => {
    for (let i=0; i<MAX_SIGNAUX + 1; i++) noter(v);
    for (let i=0; i<MAX_DOSSIER + 1; i++) v.signal(d);
  })();
  const a = vue(v); assert.equal(a.coupe, true); assert.equal(a.signaux, MAX_SIGNAUX);
  assert.equal(vue(v, { dossier: String(d) }).coupe, true);
  assert.match(calque(a, 'observe').description, /limitée aux 10000/);
  assert.ok(v.store.verify().ok);
});

test('ATT&CK : erreurs et identifiants hostiles refusés sans interpolation, fiches non couvertes lisibles', async t => {
  const v = environnement(t), { cookie } = await v.login();
  for (const url of ['/attack/T9999', '/attack/T1078%27', '/attack?dossier=999999', '/attack?dossier=1%20OR%201=1']) assert.equal((await v.get(cookie, url)).statusCode, 404);
  for (const url of ['/attack/navigator.json?calque=%22x', '/attack/navigator.json?periode=siècle', '/attack/navigator.json?dossier=-1']) assert.equal((await v.get(cookie, url)).statusCode, 400);
  assert.equal((await v.get(cookie, '/attack/T1001')).statusCode, 200);
  const r = await v.get(cookie, '/evenements?technique=' + encodeURIComponent(PIEGE));
  assert.equal(r.statusCode, 200); assert.match(r.body, /Technique inconnue/); assert.doesNotMatch(r.body, /<img src=x/);
});

// Le signal et son index se valident ensemble ; un événement rejeté plus tard dans le lot annule les deux.
test('ATT&CK : index et maillon atomiques, lot rejeté et renvoi idempotent', t => {
  const v = environnement(t), e = { id: randomUUID(), type: 'vigie_signal', severity: 'info', composant: 'vigie', canal: 'interne', confiance: 'constaté', detail: { tags } };
  const avant = v.db.prepare('SELECT count(*) FROM events').pluck().get();
  assert.throws(() => v.store.add([e, { id: randomUUID(), type: 'invalide', severity: 'info' }]), /événement invalide/);
  assert.equal(v.db.prepare('SELECT count(*) FROM events').pluck().get(), avant);
  assert.equal(v.db.prepare('SELECT count(*) FROM events_techniques').pluck().get(), 0);
  assert.equal(v.store.add([e, e]), 1);
  assert.equal(v.db.prepare('SELECT count(*) FROM events_techniques').pluck().get(), 1);
  assert.ok(v.store.verify().ok);
});
