import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VERSION, TACTIQUES, technique, remplacante, incoherences, libelleTechnique, lire } from '../vigie/attack.js';
import { projeter, projeterDetecteur, TECHNIQUE_VERS, PHASES } from '../vigie/phases.js';
import { loadRules, RuleError } from '../vigie/sigma.js';
import { DETECTEURS } from '../vigie/detecteurs.js';

// Référentiel MITRE ATT&CK de la Vigie et projection vers les phases des dossiers (étude docs/etudes/vigie-dossiers.md,
// sections 3.1 et 4 ; décisions D31 et D32 du 20 octobre 2026) : ATT&CK complet dans la détection, phases dans les
// dossiers seulement.

const { rules, correlations } = loadRules(new URL('../vigie/regles/', import.meta.url).pathname);
const signalent = [...rules, ...correlations].filter(r => r.signal && (r.generate ?? true));
const regle = nom => signalent.find(r => r.name === nom);

test('référentiel ATT&CK : version 20, 15 tactiques dans l’ordre de la matrice, Defense Evasion scindée', () => {
  assert.equal(VERSION, '20.0');
  assert.deepEqual(TACTIQUES.map(t => t.cle), ['reconnaissance', 'resource_development', 'initial_access', 'execution', 'persistence', 'privilege_escalation',
    'stealth', 'defense_impairment', 'credential_access', 'discovery', 'lateral_movement', 'collection', 'command_and_control', 'exfiltration', 'impact']);
  assert.ok(TACTIQUES.every(t => /^TA\d{4}$/.test(t.id) && t.nom_fr));
  assert.deepEqual(technique('T1078').tactiques.sort(), ['initial_access', 'persistence', 'privilege_escalation', 'stealth']);
  assert.deepEqual(technique('t1550.004').tactiques, ['lateral_movement']);
  assert.equal(technique('T1562'), null);
  assert.equal(remplacante('T1562'), 'T1685');
  assert.equal(remplacante('T1562.004'), 'T1686');
  assert.equal(libelleTechnique('T1110.004'), 'T1110.004 Force brute : Bourrage d’identifiants');
  assert.match(libelleTechnique('T1133'), /^T1133 External Remote Services$/, 'technique sans nom français : nom anglais');
  assert.deepEqual(lire(['attack.collection', 'attack.T1213', 'cve.2026-1', 'attack.collection']), { tactiques: ['collection'], techniques: ['T1213'] });
});

test('cohérence ATT&CK : ce que le test signale', () => {
  assert.deepEqual(incoherences(['attack.initial_access', 'attack.t1078']), []);
  assert.deepEqual(incoherences(['attack.t1190']), ['aucune tactique', 'T1190 relève de initial_access, que la règle ne porte pas']);
  assert.deepEqual(incoherences(['attack.defense_evasion', 'attack.t1562']), ['tactique retirée en ATT&CK 20.0 : defense_evasion', 'technique révoquée : T1562, remplacée par T1685']);
  assert.deepEqual(incoherences(['attack.inventee', 'attack.t9999']), ['tactique inconnue : inventee', 'technique inconnue : T9999']);
  assert.deepEqual(incoherences(['attack.credential_access', 'attack.t1110.001']), [], 'une sous-technique hérite des tactiques de sa technique');
});

test('règles livrées et détecteurs : étiquettes ATT&CK justes au regard de la version en vigueur', () => {
  assert.ok(signalent.length >= 80);
  const fausses = signalent.map(r => [r.name, incoherences(r.tags)]).filter(([, i]) => i.length);
  assert.deepEqual(fausses, [], 'à corriger dans vigie/regles/ (ATT&CK change deux fois par an : scripts/attack-referentiel.mjs)');
  for (const [nom, d] of Object.entries(DETECTEURS)) {
    if (!d.tags) { assert.ok(['chaine_attaque', 'silence', 'menaces'].includes(nom), `${nom} : étiquettes ATT&CK`); continue; }
    assert.deepEqual(incoherences(d.tags), [], nom);
  }
});

test('projection : chaque règle et chaque détecteur reçoivent une phase ou un marqueur ; toute technique employée est classée', () => {
  for (const r of signalent) assert.ok(projeter(r), `${r.name} : aucune phase (phase_dossier à ajouter ?)`);
  for (const [nom, d] of Object.entries(DETECTEURS)) if (nom !== 'chaine_attaque') assert.ok(projeterDetecteur(nom, d), nom);
  assert.equal(projeterDetecteur('chaine_attaque', DETECTEURS.chaine_attaque), null, 'calculée sur le dossier');
  const employees = new Set([...signalent.flatMap(r => lire(r.tags).techniques), ...Object.values(DETECTEURS).flatMap(d => lire(d.tags).techniques)]);
  for (const id of employees) assert.ok(TECHNIQUE_VERS.has(id.split('.')[0]), `${id} : à classer dans vigie/phases.js (PAR_TECHNIQUE)`);
});

test('projection : quelques classements de l’étude (section 4.7)', () => {
  const p = nom => { const x = projeter(regle(nom)); return [x.phase ?? null, x.marqueurs.join(), x.nature, x.origine]; };
  assert.deepEqual(p('lectures_massives'), ['collecte', '', 'jalon', 'technique']);
  assert.deepEqual(p('exports_nombreux'), ['exfiltration', '', 'jalon', 'technique'], 'la plus avancée de collecte et exfiltration');
  assert.deepEqual(p('heures_visibles_en_masse'), ['exfiltration', '', 'jalon', 'explicite'], 'publier, c’est sortir');
  assert.deepEqual(p('cookie_rejoue'), ['acces', '', 'preuve', 'technique']);
  assert.deepEqual(p('bordure_nouvel_operateur'), ['acces', '', 'indice', 'technique']);
  assert.deepEqual(p('messages_effaces_en_masse'), ['impact', 'dissimulation', 'jalon', 'technique'], 'marqueur en plus de la phase');
  assert.deepEqual(p('moteur_sature'), [null, 'dissimulation', 'jalon', 'explicite']);
  assert.deepEqual(p('messages_satures'), [null, 'disponibilite', 'jalon', 'technique'], 'le déni de service ne fait pas progresser');
  assert.deepEqual(p('acces_apres_session_reprise'), ['ancrage', '', 'jalon', 'explicite']);
  assert.deepEqual(p('scanner'), ['reperage', '', 'jalon', 'technique']);
  const det = nom => { const x = projeterDetecteur(nom, DETECTEURS[nom]); return [x.phase, x.nature]; };
  assert.deepEqual(det('pivot_identifiants'), ['acces', 'indice']);
  assert.deepEqual(det('vitesse'), ['collecte', 'jalon']);
  assert.deepEqual(det('role_incoherent'), ['ancrage', 'preuve']);
});

test('projection : explicite, puis technique, puis tactique ; rien ne se projette sans étiquette', () => {
  assert.equal(projeter({ tags: ['attack.collection', 'attack.t1213'], phase_dossier: 'exfiltration' }).phase, 'exfiltration');
  assert.equal(projeter({ tags: ['attack.persistence', 'attack.t1078'] }).phase, 'acces', 'la technique avant la tactique');
  assert.equal(projeter({ tags: ['attack.persistence'] }).phase, 'ancrage');
  assert.equal(projeter({ tags: ['attack.stealth'] }).marqueurs[0], 'dissimulation');
  assert.equal(projeter({ tags: ['cve.2026-1'] }), null);
  assert.equal(PHASES.length, 8);
});

test('règles : phase_dossier et nature_dossier validés au chargement', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-attack-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ecrire = vigie => fs.writeFileSync(path.join(dir, 'a.yml'), `title: essai
name: essai
level: high
tags: [attack.initial_access, attack.t1190]
detection:
  s:
    type: malicious_input
  condition: s
vigie: { cas: DS11, entite: { kind: ip, champ: ip }, source_unique: true${vigie} }
`);
  ecrire(', phase_dossier: tentative, nature_dossier: indice');
  const r = loadRules(dir).rules[0];
  assert.deepEqual([r.phase_dossier, r.nature_dossier], ['tentative', 'indice']);
  ecrire(', phase_dossier: compromission');
  assert.throws(() => loadRules(dir), RuleError);
  ecrire(', nature_dossier: certitude');
  assert.throws(() => loadRules(dir), RuleError);
});
