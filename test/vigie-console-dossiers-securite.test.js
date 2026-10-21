import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environnement } from './console-dossiers.js';
import { revision } from '../vigie/console/ecrans/dossiers.js';

const gestes = ['prendre', 'classer', 'detacher', 'rattacher', 'fusionner', 'scinder'];
const tables = ['dossiers', 'dossier_entites', 'dossier_signaux', 'alerts', 'dossier_separations', 'dossier_signaux_ecartes'];
// Les refus ont leur propre alerte DS30 : seuls les deux dossiers visés doivent rester intacts.
const etat = v => tables.map(table => v.db.prepare('SELECT * FROM ' + table + (table === 'dossiers' ? ' WHERE id <= 2' : table === 'dossier_separations' ? ' WHERE gauche <= 2 AND droite <= 2' : ' WHERE dossier_id <= 2')).all());
for (const geste of gestes) test('D1 sécurité : ' + geste + ', origine, jeton et révision périmée sans mutation', async t => {
  const v = environnement(t), id = v.dossier(), autre = v.dossier();
  v.entite(id, 'compte', 'a'); v.entite(id, 'compte', 'b');
  v.signal(id, { sub: 'a' }); const sig = v.signal(id, { sub: 'b' });
  const { cookie } = await v.login(), empreinte = revision(v.db, id);
  const body = { _csrf: v.sessionOf(cookie).csrf, revision: empreinte, classement: 'legitime', note: 'Vérifié',
    entite: 'compte:b', type: 'compte', cle: 'nouveau', autre: String(autre), entites: 'compte:b', signaux: String(sig), motif: 'Deux acteurs', confirme: 'oui' };
  const poster = (extra, headers) => v.app.inject({ method: 'POST', url: '/dossiers/' + id + '/' + geste,
    headers: { ...v.h(), 'content-type': 'application/x-www-form-urlencoded', ...headers }, cookies: { '__Host-vigie': cookie },
    payload: new URLSearchParams({ ...body, ...extra }).toString() });
  const avant = etat(v);
  for (const headers of [{ origin: 'https://hostile.example' }, { 'sec-fetch-site': 'same-site', origin: 'https://vigie.example' }]) {
    assert.equal((await poster({}, headers)).statusCode, 403);
    assert.deepEqual(etat(v), avant);
  }
  for (const _csrf of ['', 'é'.repeat(40), 'x'.repeat(101)]) {
    assert.equal((await poster({ _csrf }, { 'sec-fetch-site': 'same-origin' })).statusCode, 403);
    assert.deepEqual(etat(v), avant);
  }
  // Même une entité hors des 200 premières de la vue doit changer l’empreinte confirmée.
  for (let i = 0; i < 202; i++) v.entite(id, 'objet', 'objet-' + i);
  const change = etat(v);
  const r = await poster({}, { 'sec-fetch-site': 'same-origin' });
  assert.equal(r.statusCode, 303);
  assert.match(JSON.parse(v.sessionOf(cookie).message).texte, /a changé/);
  assert.deepEqual(etat(v), change);
  assert.equal(v.store.setting.get('dossiers_appris'), null);
  assert.equal(v.store.verify().ok, true);
});
