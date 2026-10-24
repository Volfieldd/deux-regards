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

// BV-35 : le circuit éditorial rejoint le signal public existant, donc la corrélation DS23 et sa réponse douce.
// Ni règle parallèle ni seuil nouveau : les mêmes fenêtres, preuves, dossiers et confirmations doivent s’appliquer.
const H = 3600e3, START = Date.parse('2026-10-24T10:00:00Z');
const CORRELATION = 'sigma.reglage_apres_session_reprise';

function vigieOf(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-bv35-'));
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const clock = { t: START }, now = () => clock.t;
  const store = createStore({ db, logKey: 'cle-de-chaine-vigie-bv35-0123456789', now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now });
  store.onAdded(rows => engine.process(rows));
  const add = (type, extra = {}) => {
    const id = crypto.randomUUID();
    store.add([{ id, recu_a: now(), survenu_a: now(), type, severity: 'bas', canal: 'ingestion signée', confiance: 'rapporté',
      composant: 'site · admin', sub: 'compte-edition', ...extra, detail: extra.detail ? JSON.stringify(extra.detail) : undefined }]);
    return db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  };
  const reprise = (extra = {}) => add('session_context_change', { composant: 'site · connexion', severity: 'haut',
    detail: { navigateur: { avant: 'Safari · macOS', apres: 'Chrome · Linux' } }, ...extra });
  const action = (action, extra = {}) => {
    const change = ['proposer', 'ordonner'].includes(action);
    return add('config_public_changed', { detail: {
      objet: 'propositions_vote', id: 7, action, version_avant: change ? 2 : 3, version: 3,
      photos_avant: 2, photos: action === 'proposer' ? 3 : 2,
      relecture_avant: change || action === 'valider', relecture: !change,
      validation_avant: change, validation: action === 'valider',
    }, ...extra });
  };
  const alerts = () => db.prepare('SELECT * FROM alerts WHERE regle = ? ORDER BY id').all(CORRELATION);
  const signals = () => db.prepare("SELECT detail FROM events WHERE type = 'vigie_signal'").pluck().all().map(d => JSON.parse(d)).filter(d => d.regle === CORRELATION);
  return { db, clock, store, decisions, engine, add, reprise, action, alerts, signals };
}

for (const action of ['proposer', 'ordonner', 'relire', 'valider']) test(`BV-35 : ${action} après une reprise → DS23, preuves et dossier d’ancrage, sans décision en double`, t => {
  const v = vigieOf(t);
  const reprise = v.reprise();
  v.clock.t += 10 * 60e3;
  const geste = v.action(action);
  const [a] = v.alerts();
  assert.ok(a);
  assert.deepEqual([a.entite_kind, a.entite_key, a.gravite, a.cas, a.mode], ['compte', 'compte-edition', 'haut', 'DS23', 'bloquer']);
  assert.equal(v.alerts().length, 1);
  const [s] = v.signals();
  assert.ok(s.evenements.includes(reprise.seq), 'la reprise fait partie des preuves');
  assert.ok(s.evenements.includes(geste.seq), 'le geste éditorial fait partie des preuves');
  assert.equal(v.signals().length, 1);
  assert.deepEqual(v.decisions.active().map(d => [d.kind, d.cible]), [['verifier_identite', 'compte-edition']], 'la décision de la reprise suffit');
  const projetes = v.db.prepare('SELECT phase, nature FROM signaux_projetes WHERE regle = ?').all(CORRELATION);
  assert.deepEqual(projetes.map(p => p.phase), [5], 'la phase explicite reste Ancrage');
  const dossiers = v.db.prepare('SELECT phase_max FROM dossiers WHERE fusionne_dans IS NULL').all();
  assert.ok(dossiers.some(d => d.phase_max === 5));
  assert.equal(v.store.verify().ok, true, 'la chaîne contient les preuves et leurs conséquences');
});

test('BV-35 : activité éditoriale normale ou seul changement de réseau → aucune corrélation DS23', t => {
  const v = vigieOf(t);
  for (const action of ['proposer', 'ordonner', 'relire', 'valider']) v.action(action);
  assert.equal(v.alerts().length, 0);
  assert.equal(v.decisions.active().length, 0);
  v.add('session_context_change', { severity: 'moyen', detail: { reseau: true } });
  v.clock.t += 60e3;
  v.action('valider');
  assert.equal(v.alerts().length, 0, 'un changement de réseau seul ne prouve pas une reprise depuis un autre appareil');
  assert.equal(v.decisions.active().length, 0);
});

test('BV-35 : même compte exigé ; compte absent ou autre compte ne rejoint pas la reprise', t => {
  const v = vigieOf(t);
  v.reprise();
  v.clock.t += 60e3;
  v.action('ordonner', { sub: 'autre-compte' });
  v.action('valider', { sub: null });
  assert.equal(v.alerts().length, 0);
  v.action('valider');
  assert.deepEqual(v.alerts().map(a => a.entite_key), ['compte-edition']);
});

test('BV-35 : fenêtre de corrélation d’une heure inclusive, puis aucune corrélation à une heure et une milliseconde', t => {
  const limite = vigieOf(t);
  limite.reprise();
  limite.clock.t += H;
  limite.action('relire');
  assert.equal(limite.alerts().length, 1);
  const expire = vigieOf(t);
  expire.reprise();
  expire.clock.t += H + 1;
  expire.action('relire');
  assert.equal(expire.alerts().length, 0);
});

test('BV-35 : la corrélation temporal existante rapproche les deux faits sans imposer leur ordre de réception', t => {
  const v = vigieOf(t);
  v.action('ordonner');
  assert.equal(v.alerts().length, 0, 'le geste seul reste ordinaire');
  v.clock.t += 60e3;
  v.reprise();
  assert.equal(v.alerts().length, 1, 'temporal n’est pas temporal_ordered');
});

test('BV-35 : une identité confirmée après la reprise conserve la corrélation sans nouvelle demande de vérification', t => {
  const v = vigieOf(t);
  v.reprise();
  const [premiere] = v.decisions.active();
  v.clock.t += 60e3;
  v.add('authn_reauth_success', { composant: 'site · connexion', severity: 'info' });
  v.clock.t += 60e3;
  v.action('valider');
  const [a] = v.alerts();
  assert.match(a.reponse, /identité confirmée après la dernière session reprise/);
  assert.deepEqual(v.decisions.active().map(d => d.id), [premiere.id]);
});
