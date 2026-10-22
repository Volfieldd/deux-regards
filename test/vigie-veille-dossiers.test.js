import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environnement } from './console-dossiers.js';
import { createAlertesVeille, REGLE_VEILLE } from '../vigie/veille-alertes.js';
import { createVeilleDossiers } from '../vigie/veille-dossiers.js';
import { createEngine } from '../vigie/moteur.js';
import crypto from 'node:crypto';

const avis = ({ id = 'GHSA-aaaa-bbbb-cccc', cibles = ['site'], gravite = 'haute' } = {}) => ({ id, gravite,
  paquets: [{ nom: 'exemple', version: '1.0.0', usages: cibles.map(cible => ({ cible })) }] });
function decor(t) {
  const v = environnement(t), a = createAlertesVeille({ store: v.store, switches: v.switches });
  const publier = (lignes = [avis()], complet = true) => v.db.transaction(() => a.synchroniser(lignes, { complet, t: v.clock.t }))();
  const dossier = (service = 'site', extra = {}) => {
    const id = v.dossier({ gravite: 'moyen', phase_max: 3, confiance: 'faible', enjeu: 'ordinaire',
      explication: JSON.stringify({ lignes: ['Moyen · Accès atteint', 'Confiance faible', 'Enjeu ordinaire'], modificateurs: [] }), ...extra });
    v.signal(id, { regle: service === 'vigie' ? 'sigma.console_connexions' : 'essai.acces', nature: 'jalon', phase: 3,
      source: service, sub: null, entite_kind: 'ip', entite_key: '198.51.100.7' });
    v.alerte(id, { gravite: 'moyen' });
    return id;
  };
  const D = v.engine.dossiers, fiche = id => D.fiche(id), suivi = () => v.events('vigie_dossier').filter(e => e.detail.action === 'ponderation');
  const veille = () => v.db.prepare('SELECT * FROM alerts WHERE regle = ? ORDER BY id').all(REGLE_VEILLE);
  return { ...v, D, publier, dossier, fiche, suivi, veille };
}

test('D35 veille : un cran après le plancher, sans cumul, phase ni confiance supplémentaire, tri effectif', t => {
  const v = decor(t), site = v.dossier(), vigie = v.dossier('vigie'), tiers = v.dossier('zitadel');
  v.publier([avis(), avis({ id: 'GHSA-dddd-eeee-ffff', gravite: 'critique' })]);
  assert.equal(v.db.prepare('SELECT count(*) FROM dossiers').pluck().get(), 3, 'les avis seuls n’ouvrent rien');
  v.D.actualiserVeille();
  const d = v.fiche(site);
  assert.equal(d.gravite, 'haut'); assert.equal(d.explication.veille.base, 'moyen'); assert.equal(d.explication.veille.alertes.length, 2);
  assert.equal(d.phase_max, 3); assert.equal(d.confiance, 'faible'); assert.equal(d.coherence, 0); assert.equal(d.enjeu, 'ordinaire');
  assert.equal(d.signaux.length, 1); assert.equal(d.alertes.length, 1);
  assert.equal(v.fiche(vigie).gravite, 'moyen'); assert.equal(v.fiche(tiers).gravite, 'moyen');
  assert.ok(v.veille().every(a => a.dossier_id === null), 'le contexte peut servir à plusieurs dossiers');
  const n = v.suivi().length; v.D.actualiserVeille(); v.D.recalculer(site); v.D.recalculer(site);
  assert.equal(v.fiche(site).gravite, 'haut'); assert.equal(v.suivi().length, n);
  assert.equal(v.D.liste()[0].id, site); assert.equal(v.db.prepare('SELECT count(*) FROM decisions').pluck().get(), 0);
});

test('D35 veille : cible explicite, source site et console ; contrôles Vigie, réseau, bordure seuls exclus', t => {
  const v = decor(t), ids = ['site', 'vigie', 'bordure', 'reseau', 'controle'].map(s => v.dossier(s));
  v.publier([avis({ cibles: ['vigie'] })]); v.D.actualiserVeille();
  assert.deepEqual(ids.map(id => v.fiche(id).gravite), ['moyen', 'haut', 'moyen', 'moyen', 'moyen']);
  v.entite(ids[4], 'cible', 'vigie:journal', { role: 'cible' }); v.D.recalculer(ids[4]);
  assert.equal(v.fiche(ids[4]).gravite, 'haut');
  v.D.detacher(ids[4], 'cible', 'vigie:journal', { motif: 'Cible écartée après examen.', par: 'Test' });
  assert.equal(v.fiche(ids[4]).gravite, 'moyen');
  v.entite(ids[2], 'cible', 'site:sortie', { role: 'cible' });
  v.publier([avis()]); v.D.actualiserVeille();
  assert.equal(v.fiche(ids[2]).gravite, 'haut'); assert.equal(v.fiche(ids[1]).gravite, 'moyen', 'cible Vigie retirée du même avis');
});

test('D35 veille : mise en charge conservée, classement retire la majoration, dossiers clos figés', t => {
  const v = decor(t), ouvert = v.dossier(), clos = v.dossier(); v.publier(); v.D.actualiserVeille();
  v.D.classer(clos, { classement: 'incident', par: 'Test' }); const photographie = v.fiche(clos);
  const a = v.veille()[0];
  v.engine.classify(a.id, { statut: 'en_cours', classement: null, par: 'Test' }); v.D.actualiserVeille();
  assert.equal(v.fiche(ouvert).gravite, 'haut');
  v.engine.classify(a.id, { statut: 'close', classement: 'faux_positif', par: 'Test', note: 'Bibliothèque absente.' }); v.D.actualiserVeille();
  assert.equal(v.fiche(ouvert).gravite, 'moyen'); assert.equal(v.fiche(ouvert).explication.veille, null);
  assert.equal(v.fiche(ouvert).derniere, photographie.derniere);
  assert.equal(v.fiche(clos).gravite, 'haut'); assert.deepEqual(v.fiche(clos).explication, photographie.explication);
  v.publier(); v.D.actualiserVeille(); assert.equal(v.fiche(ouvert).gravite, 'moyen');
  assert.equal(v.store.verify().ok, true);
});

test('D35 veille : gravités basses ou inconnues exclues, aggravation, plafond et disparition complète', t => {
  const v = decor(t), id = v.dossier(), critique = v.dossier('site', { gravite: 'critique' });
  for (const gravite of ['inconnue', 'basse', 'moyenne']) { v.publier([avis({ gravite })]); v.D.actualiserVeille(); assert.equal(v.fiche(id).gravite, 'moyen'); }
  v.publier(); v.D.actualiserVeille(); assert.equal(v.fiche(id).gravite, 'haut');
  assert.equal(v.fiche(critique).gravite, 'critique'); assert.equal(v.fiche(critique).explication.veille.majoration, 0);
  const avant = v.fiche(id);
  v.clock.t += 8 * 864e5; v.publier([], false); v.D.actualiserVeille();
  assert.equal(v.fiche(id).gravite, 'haut', 'un rapprochement incomplet ne retire pas le contexte');
  assert.equal(v.fiche(id).explication.veille.alertes[0].verifie_a, avant.explication.veille.alertes[0].verifie_a);
  v.publier([]); v.D.actualiserVeille(); assert.equal(v.fiche(id).gravite, 'moyen');
  v.publier(); v.D.actualiserVeille(); assert.equal(v.fiche(id).gravite, 'haut');
});

test('D35 veille : cache frais après redémarrage et publication annulée ne laissent aucun poids fantôme', t => {
  const v = decor(t), id = v.dossier(), contexte = createVeilleDossiers(v.db);
  assert.throws(() => v.db.transaction(() => {
    v.publier(); assert.equal(contexte.lire().site.length, 1); v.D.actualiserVeille();
    assert.equal(v.fiche(id).gravite, 'haut'); throw new Error('annulation simulée');
  })(), /annulation/);
  assert.equal(v.fiche(id).gravite, 'moyen'); assert.equal(v.suivi().length, 0); assert.equal(contexte.lire().site.length, 0);
  v.publier([avis({ cibles: ['vigie'] })]); v.D.actualiserVeille(); assert.equal(v.fiche(id).gravite, 'moyen');
  v.publier();
  const nouveau = createEngine({ store: v.store, decisions: v.decisions, switches: v.switches, now: () => v.clock.t });
  nouveau.dossiers.actualiserVeille(); assert.equal(nouveau.dossiers.fiche(id).gravite, 'haut');
});

test('D35 veille : rattrapage borné et repris, sans nouveaux jalons, sommeil ni réouverture', t => {
  const v = decor(t), ids = Array.from({ length: 105 }, () => v.dossier());
  const sommeil = v.dossier('site', { statut: 'sommeil' }); v.publier();
  assert.equal(v.D.actualiserVeille(), 100); assert.equal(v.fiche(ids[104]).gravite, 'moyen');
  const moteur = createEngine({ store: v.store, decisions: v.decisions, switches: v.switches, now: () => v.clock.t });
  assert.equal(moteur.dossiers.actualiserVeille(), 6); assert.equal(v.fiche(ids[104]).gravite, 'haut');
  assert.equal(v.fiche(sommeil).statut, 'sommeil'); assert.equal(v.fiche(sommeil).dernier_jalon, v.clock.t);
  assert.equal(moteur.dossiers.actualiserVeille(), 0);
});

test('D35 veille : cycle réel respecte Détection, avis identiques et dates ne multiplient pas les audits', t => {
  const v = decor(t), id = v.dossier(); v.publier();
  v.store.setting.set('interrupteurs', { detection: { etat: 'arret', jusqua: v.clock.t + 864e5 } });
  v.engine.tick(); assert.equal(v.fiche(id).gravite, 'moyen');
  v.store.setting.set('interrupteurs', {}); v.engine.tick(); assert.equal(v.fiche(id).gravite, 'haut');
  const n = v.suivi().length; v.clock.t += 864e5; v.publier(); v.engine.tick();
  assert.equal(v.fiche(id).gravite, 'haut'); assert.equal(v.suivi().length, n);
  assert.equal(v.fiche(id).explication.veille.alertes[0].verifie_a, v.clock.t);
});

test('D35 veille : justification bornée, commune à plusieurs dossiers et visible en lecture seule', async t => {
  const v = decor(t), a = v.dossier(), b = v.dossier('vigie');
  v.publier(Array.from({ length: 25 }, (_, i) => avis({ id: `GHSA-test-${i}`, cibles: ['site', 'vigie'] })));
  v.D.actualiserVeille();
  for (const id of [a, b]) { const x = v.fiche(id).explication.veille; assert.equal(x.alertes.length, 20); assert.equal(x.tronque, true); assert.equal(x.majoration, 1); }
  v.ceilings.lecture = 'viewer'; const { cookie } = await v.login({ sub: 'lecture', roles: ['vigie.viewer'] });
  const r = await v.get(cookie, `/dossiers/${a}`);
  assert.equal(r.statusCode, 200); assert.equal(r.headers['cache-control'], 'no-store');
  assert.match(r.body, /Vulnérabilités prises en compte/); assert.match(r.body, /Gravité avant pondération/);
  assert.match(r.body, /20 premières alertes justificatives/); assert.match(r.body, new RegExp(`/alertes/${v.veille()[0].id}`));
  assert.doesNotMatch(r.body, /href="\/dossiers\/\d+\/classer/);
});

test('D35 veille : ouverture réelle, fusion et scission recalculent sans double poids ni réponse supplémentaire', t => {
  const v = decor(t); v.publier();
  for (const n of [1, 2]) v.store.add([{ id: crypto.randomUUID(), type: 'session_use_after_expire', severity: 'haut',
    composant: 'site · connexion', canal: 'ingestion signée', confiance: 'rapporté', recu_a: v.clock.t, survenu_a: v.clock.t,
    sub: `compte-${n}`, session: `session-${n}`, ip: `203.0.113.${n}`, detail: JSON.stringify({ meme_reseau_et_navigateur: false }) }]);
  const ids = v.db.prepare('SELECT id FROM dossiers ORDER BY id').pluck().all(); assert.equal(ids.length, 2);
  for (const id of ids) { const d = v.fiche(id); assert.equal(d.gravite, 'critique'); assert.equal(d.explication.veille.base, 'haut'); }
  const decisions = v.db.prepare('SELECT count(*) FROM decisions').pluck().get();
  const garde = v.D.fusionner(...ids, { par: 'Test' });
  assert.equal(v.fiche(garde).explication.veille.majoration, 1);
  const signaux = v.fiche(garde).signaux.filter(s => s.sub === 'compte-2').map(s => s.id);
  const nouveau = v.D.scinder(garde, { entites: ['compte:compte-2', 'session:session-2', 'ip:203.0.113.2'], signaux,
    motif: 'Deux incidents distincts.', par: 'Test' });
  for (const id of [garde, nouveau]) { assert.equal(v.fiche(id).gravite, 'critique'); assert.equal(v.fiche(id).explication.veille.base, 'haut'); }
  v.publier([]); v.D.actualiserVeille();
  for (const id of [garde, nouveau]) assert.equal(v.fiche(id).gravite, 'haut');
  assert.equal(v.db.prepare('SELECT count(*) FROM decisions').pluck().get(), decisions);
});

test('D35 veille : un contexte illisible n’arrête pas les alertes de détection', t => {
  const v = decor(t);
  v.db.prepare('DROP TABLE veille_revision').run();
  v.store.add([{ id: crypto.randomUUID(), type: 'session_use_after_expire', severity: 'haut', composant: 'site · connexion',
    canal: 'ingestion signée', confiance: 'rapporté', recu_a: v.clock.t, survenu_a: v.clock.t, sub: 'compte-test',
    detail: JSON.stringify({ meme_reseau_et_navigateur: false }) }]);
  assert.ok(v.db.prepare("SELECT 1 FROM alerts WHERE regle = 'sigma.cookie_rejoue'").get());
});
