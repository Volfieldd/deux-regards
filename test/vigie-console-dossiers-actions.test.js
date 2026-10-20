import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environnement } from './console-dossiers.js';
import { revision } from '../vigie/console/ecrans/dossiers.js';

const message = (v, cookie) => JSON.parse(v.sessionOf(cookie).message || 'null');
const poster = (v, cookie, id, geste, body = {}) => v.post(cookie, `/dossiers/${id}/${geste}`, { revision: revision(v.db, id), ...body });
const lire = (v, id) => v.db.prepare('SELECT * FROM dossiers WHERE id = ?').get(id);

test('gestes des dossiers : six confirmations sans écriture, jeton CSRF et droit Intervenant ; plafond retiré', async t => {
  const v = environnement(t), id = v.dossier(); v.entite(id, 'compte', 'a'); v.signal(id);
  const { cookie } = await v.login();
  const avant = lire(v, id);
  for (const g of ['prendre', 'classer', 'detacher', 'rattacher', 'fusionner', 'scinder']) {
    const r = await v.get(cookie, `/dossiers/${id}/${g}`);
    assert.equal(r.statusCode, 200, r.body); assert.match(r.body, /name="_csrf"/); assert.match(r.body, /Rien n’est encore enregistré/);
    assert.deepEqual(lire(v, id), avant);
    assert.equal((await poster(v, cookie, id, g, { _csrf: 'faux' })).statusCode, 403);
  }
  v.ceilings.camille = 'viewer'; const lectrice = await v.login({ sub: 'camille', roles: ['vigie.viewer'] });
  for (const g of ['prendre', 'classer', 'detacher', 'rattacher', 'fusionner', 'scinder']) assert.equal((await poster(v, lectrice.cookie, id, g)).statusCode, 403);
  v.ceilings['sub-seb'] = 'viewer'; assert.equal((await poster(v, cookie, id, 'prendre')).statusCode, 403);
  assert.deepEqual(lire(v, id), avant);
});

test('gestes des dossiers : prise en charge, légitime motivé et apprentissage ; erreur près du formulaire', async t => {
  const v = environnement(t), id = v.dossier(); v.entite(id, 'compte', 'a');
  v.signal(id, { nature: 'indice', regle: 'detecteur.premiere_apparition', sub: 'a', cle: '["pays:JP","appareil:neuf"]' });
  const { cookie } = await v.login();
  const prendre = await poster(v, cookie, id, 'prendre'); assert.equal(prendre.statusCode, 303);
  assert.equal(prendre.headers.location, `/dossiers/${id}`); assert.equal(lire(v, id).statut, 'en_cours');
  assert.match(lire(v, id).traite_par, /\(sub-seb\)/);
  await poster(v, cookie, id, 'classer', { classement: 'legitime', note: '   ' });
  assert.equal(lire(v, id).statut, 'en_cours'); assert.equal(message(v, cookie).k, 'erreur');
  const form = await v.get(cookie, `/dossiers/${id}/classer`); assert.match(form.body, /motif obligatoire/); assert.match(form.body, /pays:JP/);
  await poster(v, cookie, id, 'classer', { classement: 'legitime', note: 'Voyage confirmé' });
  assert.equal(lire(v, id).classement, 'legitime');
  const appris = v.store.setting.get('dossiers_appris'); assert.equal(appris.length, 2);
  assert.equal(appris[0].jusqua, v.clock.t + 90 * 864e5);
  await poster(v, cookie, id, 'prendre'); assert.equal(lire(v, id).statut, 'clos');
  assert.equal(v.store.verify().ok, true);
});

test('gestes des dossiers : détachement motivé, rattachement manuel, fusion vers le plus ancien', async t => {
  const v = environnement(t), ancien = v.dossier(), id = v.dossier();
  v.entite(id, 'compte', 'a'); v.entite(id, 'ip', '198.51.100.7'); v.signal(id);
  const a = v.alerte(id); const { cookie } = await v.login();
  await poster(v, cookie, id, 'detacher', { entite: 'ip:198.51.100.7' }); assert.equal(message(v, cookie).k, 'erreur');
  assert.equal(v.db.prepare("SELECT detache_a FROM dossier_entites WHERE dossier_id = ? AND kind = 'ip'").pluck().get(id), null);
  await poster(v, cookie, id, 'detacher', { entite: 'ip:198.51.100.7', motif: 'adresse partagée' });
  assert.equal(v.db.prepare("SELECT detache_a FROM dossier_entites WHERE dossier_id = ? AND kind = 'ip'").pluck().get(id), v.clock.t);
  await poster(v, cookie, id, 'rattacher', { type: 'ip', cle: '198.51.100.7' });
  assert.equal(v.db.prepare("SELECT force FROM dossier_entites WHERE dossier_id = ? AND kind = 'ip'").pluck().get(id), 'manuel');
  await poster(v, cookie, id, 'fusionner', { autre: String(id) }); assert.equal(message(v, cookie).k, 'erreur');
  const r = await poster(v, cookie, id, 'fusionner', { autre: String(ancien) });
  assert.equal(r.headers.location, `/dossiers/${ancien}`); assert.equal(lire(v, id).fusionne_dans, ancien);
  assert.equal(v.db.prepare('SELECT dossier_id FROM alerts WHERE id = ?').pluck().get(a), ancien);
  assert.equal(v.store.verify().ok, true);
});

test('gestes des dossiers : aperçu de scission, validation atomique, effet persistant et rejet d’une confirmation périmée', async t => {
  const v = environnement(t), id = v.dossier(); v.entite(id, 'compte', 'a'); v.entite(id, 'compte', 'b');
  const a = v.alerte(id, { entite_key: 'b' });
  const s1 = v.signal(id, { seq: 100, sub: 'a' }), s2 = v.signal(id, { seq: 101, sub: 'b', alerte_id: a }), s3 = v.signal(id, { seq: 102, sub: 'b', alerte_id: a });
  const { cookie } = await v.login();
  await poster(v, cookie, id, 'scinder', { entites: 'compte:b', signaux: [String(s2)], motif: 'séparer' });
  assert.equal(message(v, cookie).k, 'erreur'); assert.equal(v.db.prepare('SELECT COUNT(*) FROM dossiers').pluck().get(), 1);
  const body = { entites: 'compte:b', signaux: [String(s2), String(s3)], motif: 'Deux personnes distinctes' };
  const r = await poster(v, cookie, id, 'scinder', body); assert.equal(r.statusCode, 200, r.body); assert.match(r.body, /Répartition à confirmer/);
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM dossiers').pluck().get(), 1);
  const empreinte = revision(v.db, id);
  const fait = await poster(v, cookie, id, 'scinder', { ...body, confirme: 'oui' }); assert.equal(fait.headers.location, '/dossiers/2');
  assert.equal(v.db.prepare('SELECT dossier_id FROM dossier_signaux WHERE id = ?').pluck().get(s1), id);
  assert.equal(v.db.prepare('SELECT dossier_id FROM alerts WHERE id = ?').pluck().get(a), 2);
  assert.equal(v.events('vigie_dossier').filter(e => e.detail.action === 'scinde').length, 2);
  assert.equal(v.store.verify().ok, true);
  await poster(v, cookie, id, 'scinder', { ...body, confirme: 'oui', revision: empreinte });
  assert.match(message(v, cookie).texte, /a changé/); assert.equal(v.db.prepare('SELECT COUNT(*) FROM dossiers').pluck().get(), 2);
});

test('gestes des dossiers : Intervenant et Analyste autorisés, base inchangée si Zitadel est indisponible', async t => {
  const v = environnement(t), id = v.dossier();
  for (const role of ['handler', 'analyst']) {
    v.ceilings[role] = role;
    const { cookie } = await v.login({ sub: role, roles: [`vigie.${role}`] });
    v.c.rights.assign({ par: 'sub-seb', parRole: 'admin', sub: role, role });
    const r = await poster(v, cookie, id, 'prendre'); assert.equal(r.statusCode, 303);
    assert.equal(lire(v, id).statut, 'en_cours'); assert.equal(message(v, cookie).k, 'ok');
  }
  const { cookie } = await v.login(); const avant = lire(v, id); v.zitadel.fail = true;
  assert.equal((await poster(v, cookie, id, 'classer', { classement: 'test' })).statusCode, 503);
  assert.deepEqual(lire(v, id), avant);
});

test('classement légitime : aucun apprentissage confirmé sur une liste coupée', async t => {
  const v = environnement(t), id = v.dossier();
  for (let i = 0; i < 201; i++) v.signal(id, { seq: i + 100, nature: 'indice', cle: JSON.stringify([`appareil:${i}`]) });
  const { cookie } = await v.login();
  const page = await v.get(cookie, `/dossiers/${id}/classer`);
  assert.match(page.body, /Plus de 200 indices/); assert.match(page.body, /value="legitime" required disabled/);
  await poster(v, cookie, id, 'classer', { classement: 'legitime', note: 'confirmation forcée' });
  assert.equal(lire(v, id).statut, 'ouvert'); assert.match(message(v, cookie).texte, /200 indices/);
  assert.equal(v.store.setting.get('dossiers_appris'), null);
});
