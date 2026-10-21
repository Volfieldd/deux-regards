import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environnement, PIEGE } from './console-dossiers.js';
import { liste, requetesDossiers } from '../vigie/console/ecrans/dossiers.js';

// Contrats visibles de D1 : ordre avant pagination, filtres, erreurs, masquage jusque dans les liens et journal indexé.
test('dossiers : liste et fiche, explication, alertes, réponses et journal ; titres génériques, CSP et échappement', async t => {
  const v = environnement(t), id = v.dossier(), a = v.alerte(id);
  v.entite(id, 'compte', 'compte-a'); v.entite(id, 'ip', '198.51.100.23'); v.entite(id, 'ip', '2001:db8:1:2::9');
  v.signal(id, { alerte_id: a, objet: `personne:${PIEGE}` });
  v.store.own('vigie_dossier', { detail: { action: 'detache', id, par: PIEGE, motif: '198.51.100.23' } });
  v.decisions.create({ kind: 'geler', cible: 'compte-a', duree: '1h', motif: 'essai', par: 'test', alerte: a });
  const { cookie } = await v.login();
  for (const url of ['/dossiers', `/dossiers/${id}`]) {
    const r = await v.get(cookie, url);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.headers['cache-control'], 'no-store'); assert.equal(r.headers['referrer-policy'], 'no-referrer');
    assert.doesNotMatch(r.headers['content-security-policy'], /unsafe-inline/);
    assert.match(r.body, /&lt;img/); assert.ok(!r.body.includes(PIEGE));
    assert.doesNotMatch(r.body, /<[^>]+\sstyle=|<script(?![^>]*src=)/);
    assert.doesNotMatch(r.body.match(/<title>(.*?)<\/title>/s)[1], /compte|198\.51|2001:db8|img/);
  }
  const fiche = await v.get(cookie, `/dossiers/${id}`);
  for (const s of ['Signaux et faits', 'Réponses déjà faites', 'Journal du dossier', 'Enjeu sensible', `/alertes/${a}`, '/scinder']) assert.ok(fiche.body.includes(s), s);
  assert.match((await v.get(cookie, `/alertes/${a}`)).body, new RegExp(`/dossiers/${id}`));
  assert.match((await v.get(cookie, '/entites/compte/compte-a')).body, new RegExp(`Dossier #${id}`));
});

test('dossiers : Lectrice, aucune adresse complète dans le HTML ni les liens et aucun geste', async t => {
  const v = environnement(t), id = v.dossier();
  v.entite(id, 'ip', '198.51.100.23'); v.entite(id, 'ip', '2001:db8:1:2::9');
  v.signal(id, { ip: '198.51.100.23', sub: 'compte 2001:db8:1:2::9' });
  v.store.own('vigie_dossier', { detail: { action: 'classe', id, par: '198.51.100.23', note: '2001:db8:1:2::9' } });
  v.ceilings.camille = 'viewer'; const { cookie } = await v.login({ sub: 'camille', roles: ['vigie.viewer'] });
  for (const url of ['/dossiers', `/dossiers/${id}`]) {
    const r = await v.get(cookie, url); assert.equal(r.statusCode, 200);
    assert.doesNotMatch(decodeURIComponent(r.body), /198\.51\.100\.23|2001:db8:1:2::9/);
    assert.match(r.body, /198\.51\.100\.0\/24/); assert.match(r.body, /2001:db8:1::\/48/);
    assert.doesNotMatch(r.body, /href="\/dossiers\/\d+\/(prendre|classer|scinder|detacher|rattacher|fusionner)/);
  }
  assert.equal((await v.get(cookie, `/dossiers/${id}/classer`)).statusCode, 403);
});

test('dossiers : filtres combinés, valeurs inconnues, tous comprend les fusionnés ; ordre appliqué avant LIMIT', async t => {
  const v = environnement(t);
  for (let i = 0; i < 55; i++) v.dossier({ gravite: 'bas', phase_max: 1, confiance: 'faible' });
  const critique = v.dossier({ gravite: 'critique', phase_max: 7, derniere: v.clock.t - 864e5 });
  const clos = v.dossier({ statut: 'clos' }), fusion = v.dossier({ statut: 'clos', fusionne_dans: critique });
  assert.equal(liste({ db: v.db }).lignes[0].id, critique, 'le plus grave, même ancien, précède la limite de page');
  const filtree = liste({ db: v.db, query: { statut: 'ouverts', piste: 'identite', gravite: 'haute', phase: '7' } });
  assert.deepEqual(filtree.lignes.map(d => d.id), [critique]);
  assert.equal(liste({ db: v.db, query: { statut: 'clos' } }).lignes.length, 1);
  const tous = liste({ db: v.db, query: { statut: 'tous', page: '2' } });
  assert.ok(tous.lignes.some(d => d.id === clos)); assert.ok(tous.lignes.some(d => d.id === fusion));
  const { cookie } = await v.login();
  const r = await v.get(cookie, '/dossiers?statut=faux&piste[]=identite&gravite=inconnue&phase=99&page=9999');
  assert.equal(r.statusCode, 200); assert.match(r.body, /Filtres ignorés/);
  const vide = await v.get(cookie, '/dossiers?piste=invite'); assert.match(vide.body, /Aucun dossier/);
});

test('dossiers : signaux paginés par date et numéro sans doublon, y compris une source purgée ; historique indexé', async t => {
  const v = environnement(t), id = v.dossier();
  for (let i = 0; i < 43; i++) v.signal(id, { seq: 100000 + i, survenu_a: v.clock.t + Math.floor(i / 2) });
  const { cookie } = await v.login(), r = await v.get(cookie, `/dossiers/${id}`);
  assert.equal(r.statusCode, 200); assert.equal((r.body.match(/id="signal-/g) || []).length, 40);
  assert.match(r.body, /Événement source absent/);
  const lien = r.body.match(/href="([^\"]+)">Signaux plus anciens/)[1].replaceAll('&amp;', '&');
  const suite = await v.get(cookie, lien); assert.equal((suite.body.match(/id="signal-/g) || []).length, 3);
  const ids = s => [...s.matchAll(/id="signal-(\d+)"/g)].map(m => m[1]);
  assert.equal(new Set([...ids(r.body), ...ids(suite.body)]).size, 43);
  const q = requetesDossiers(v.db);
  const plan = v.db.prepare(`EXPLAIN QUERY PLAN ${q.histoire.source}`).all(id).map(x => x.detail).join('\n');
  assert.match(plan, /events_dossier/); assert.doesNotMatch(plan, /SCAN events/);
});

test('dossiers : 404 propres et compteurs excluant clos et fusionnés', async t => {
  const v = environnement(t), id = v.dossier(); v.dossier({ statut: 'en_cours' }); v.dossier({ statut: 'sommeil' });
  v.dossier({ statut: 'clos' }); v.dossier({ statut: 'clos', fusionne_dans: id });
  const { cookie } = await v.login();
  for (const n of ['0', '-1', 'abc', '9999999999999', '999']) assert.equal((await v.get(cookie, `/dossiers/${n}`)).statusCode, 404);
  const r = await v.get(cookie, '/'); assert.match(r.body, /3 dossiers non clos/);
  assert.match(r.body, /Dossiers[\s\S]*?3 non clos/);
});

test('dossiers : la limite des alertes est annoncée sans perdre leur compte réel', async t => {
  const v = environnement(t), id = v.dossier();
  for (let i = 0; i < 201; i++) v.alerte(id);
  const { cookie } = await v.login(), r = await v.get(cookie, `/dossiers/${id}`);
  assert.match(r.body, /Les 200 premières alertes sont affichées/);
  assert.match(r.body, /Aucune entité rattachée/);
  assert.match(r.body, /Aucun signal à cette position/);
  assert.doesNotMatch(r.body, /<table/);
  assert.equal((r.body.match(/Alerte #\d+ ·/g) || []).length, 200);
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM alerts WHERE dossier_id = ?').pluck().get(id), 201);
});
