// Export du périmètre : les droits, la confirmation et l'audit protègent aussi le fichier téléchargé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environnement, PIEGE } from './console-dossiers.js';
const incident = v => v.dossier({ statut: 'clos', classement: 'incident' });
const revision = r => r.body.match(/name="revision" value="([a-f0-9]{64})"/)?.[1];
async function telecharger(v, cookie, id) {
  const r = await v.get(cookie, `/dossiers/${id}/export`);
  return v.post(cookie, `/dossiers/${id}/export`, { revision: revision(r) });
}

test('incident : confirmation sans export, fichier minimisé, catégories, période et phases probantes', async t => {
  const v = environnement(t), id = incident(v), autre = incident(v);
  v.entite(id, 'compte', 'compte-rattache'); v.entite(id, 'session', 'session-rattachee');
  v.entite(id, 'compte', 'compte-detache', { detache_a: v.clock.t }); v.entite(id, 'ip', '198.51.100.23');
  v.signal(id, { sub: `compte-${PIEGE}`, session: 'session-a', objet: 'personne:12', seq: 999999,
    ip: '198.51.100.23', donnees: JSON.stringify({ categorie: ['identite', 'mineur', 'inventee'], objets: 1, octets_servis: 42, secret: 'SECRET' }) });
  v.signal(id, { nature: 'fait', phase: 7, regle: 'fait.sensitive_export', objet: null, donnees: JSON.stringify({ categorie: ['identite'], liste: true, objets: 8 }) });
  v.signal(id, { nature: 'jalon', promu: 1, phase: 6, objet: 'personne:12' });
  v.signal(autre, { sub: 'COMPTE-AUTRE-DOSSIER', objet: 'personne:99' });
  const { cookie } = await v.login(), url = `/dossiers/${id}/export`, avant = v.events('vigie_console_export').length;
  const fiche = await v.get(cookie, `/dossiers/${id}`); assert.ok(fiche.body.includes(url));
  const page = await v.get(cookie, url); assert.equal(page.statusCode, 200); assert.ok(revision(page));
  assert.equal(v.events('vigie_console_export').length, avant); assert.equal(page.headers['content-disposition'], undefined);
  assert.doesNotMatch(page.body, /198\.51|<script(?![^>]*src=)|\sstyle=|compte-rattache/);
  assert.doesNotMatch(page.headers['content-security-policy'], /unsafe-inline/);
  const r = await v.post(cookie, url, { revision: revision(page) }); assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.headers['cache-control'], 'no-store'); assert.equal(r.headers['referrer-policy'], 'no-referrer');
  assert.equal(r.headers['x-content-type-options'], 'nosniff'); assert.match(r.headers['content-type'], /^application\/json/);
  assert.equal(r.headers['content-disposition'], `attachment; filename="vigie-incident-${id}.json"`);
  const d = r.json(); assert.equal(d.signaux.length, 3); assert.equal(d.signaux[0].evenement, 999999, 'source purgée conservée par référence');
  assert.equal(d.signaux[0].octets_servis, 42); assert.equal(d.signaux[0].dechiffrements, null);
  assert.deepEqual(d.phases_atteintes.map(p => p.numero), [3, 6], 'un export ordinaire ne prouve pas une exfiltration');
  assert.deepEqual(d.objets_par_categorie.find(c => c.categorie === 'identite').objets, ['personne:12']);
  assert.deepEqual(d.objets_par_categorie.find(c => c.categorie === 'identite').operations_sans_identifiant, [{ signal: d.signaux[1].id, objets_annonces: 8 }]);
  assert.ok(d.comptes.includes('compte-rattache')); assert.ok(d.sessions.includes('session-rattachee'));
  assert.ok(!d.comptes.includes('compte-detache')); assert.equal(d.periode.dernier_signe, new Date(v.clock.t).toISOString());
  assert.doesNotMatch(r.body, /SECRET|inventee|198\.51|COMPTE-AUTRE|personne:99|explication|traite_par/);
  assert.equal(v.events('vigie_console_export').length, avant + 1);
  assert.deepEqual(v.events('vigie_console_export').at(-1).detail, { dossier: id, format: 'incident_json', lignes: 3, tronque: false });
});

for (const role of ['viewer', 'handler', 'analyst', 'admin']) test(`incident : droit d’export ${role}`, async t => {
  const v = environnement(t, { roles: 'zitadel' }), id = incident(v); v.ceilings.essai = role;
  const { cookie } = await v.login({ sub: 'essai', roles: [`vigie.${role}`] });
  const permis = ['analyst', 'admin'].includes(role), page = await v.get(cookie, `/dossiers/${id}/export`);
  assert.equal(page.statusCode, permis ? 200 : 403);
  const r = await v.post(cookie, `/dossiers/${id}/export`, { revision: revision(page) || '' });
  assert.equal(r.statusCode, permis ? 200 : 403); assert.equal(v.events('vigie_console_export').length, permis ? 1 : 0);
  assert.equal((await v.get(cookie, `/dossiers/${id}`)).body.includes(`/dossiers/${id}/export`), permis);
});

test('incident : CSRF, confirmation absente et périmètre concurrent refusés sans fichier', async t => {
  const v = environnement(t), id = incident(v), { cookie } = await v.login(), url = `/dossiers/${id}/export`;
  const page = await v.get(cookie, url), rev = revision(page);
  assert.equal((await v.post(cookie, url, { revision: rev, _csrf: 'faux' })).statusCode, 403);
  assert.equal((await v.post(cookie, url)).statusCode, 409);
  v.signal(id);
  const r = await v.post(cookie, url, { revision: rev }); assert.equal(r.statusCode, 409); assert.match(r.body, /a changé/);
  assert.equal(r.headers['content-disposition'], undefined); assert.equal(v.events('vigie_console_export').length, 0);
});

test('incident : plafond relu avant téléchargement, panne fermée et révocation effective', async t => {
  const v = environnement(t), id = incident(v), { cookie } = await v.login(), url = `/dossiers/${id}/export`;
  const rev = revision(await v.get(cookie, url)); v.zitadel.fail = true;
  assert.equal((await v.post(cookie, url, { revision: rev })).statusCode, 503);
  v.zitadel.fail = false; v.clock.t += 61_000; v.ceilings['sub-seb'] = 'viewer';
  assert.equal((await v.post(cookie, url, { revision: rev })).statusCode, 403); assert.equal(v.events('vigie_console_export').length, 0);
});

test('incident : autres classements, ouvert, fusionné et identifiants invalides non exportables', async t => {
  const v = environnement(t), cible = incident(v), ids = [v.dossier(), v.dossier({ classement: 'incident' }),
    v.dossier({ statut: 'clos', classement: 'legitime' }), v.dossier({ statut: 'clos', classement: 'incident', fusionne_dans: cible }), '0', 'abc', '99999', '9999999999999'];
  const { cookie } = await v.login();
  for (const id of ids) {
    assert.equal((await v.get(cookie, `/dossiers/${id}/export`)).statusCode, 404);
    assert.equal((await v.post(cookie, `/dossiers/${id}/export`, { revision: 'x' })).statusCode, 404);
  }
  assert.equal(v.events('vigie_console_export').length, 0);
});

test('incident : panne de journalisation, aucun octet du fichier ne sort', async t => {
  const v = environnement(t), id = incident(v), { cookie } = await v.login(), own = v.store.own;
  v.store.own = (type, ...args) => { if (type === 'vigie_console_export') throw Error('disque plein'); return own(type, ...args); };
  const r = await telecharger(v, cookie, id); assert.equal(r.statusCode, 503); assert.match(r.body, /journal/);
  assert.equal(r.headers['content-disposition'], undefined); assert.equal(v.events('vigie_console_export').length, 0);
});

test('incident : aucune troncature silencieuse, métadonnées malformées filtrées et champs bornés', async t => {
  const v = environnement(t), id = v.dossier({ statut: 'clos', classement: 'incident', tronque: 1 });
  v.signal(id, { sub: 'x'.repeat(300), donnees: '{faux', objet: 'photo:9' });
  v.signal(id, { donnees: JSON.stringify({ categorie: ['identite'], objets: -1, dechiffrements: '5', octets_servis: false }) });
  const { cookie } = await v.login(); assert.match((await v.get(cookie, `/dossiers/${id}/export`)).body, /dossier est tronqué/);
  const d = (await telecharger(v, cookie, id)).json(); assert.equal(d.limites.dossier_tronque, true); assert.equal(d.limites.champs_bornes, true);
  assert.equal(d.signaux[0].compte.length, 200); assert.deepEqual(d.signaux[0].categories, []);
  assert.equal(d.signaux[1].objets, null); assert.equal(d.signaux[1].dechiffrements, null); assert.equal(d.signaux[1].octets_servis, null);
  v.db.transaction(() => { for (let i = 0; i < 9999; i++) v.signal(id); })();
  const page = await v.get(cookie, `/dossiers/${id}/export`); assert.match(page.body, /dépasse les limites/); assert.equal(revision(page), undefined);
  const r = await v.post(cookie, `/dossiers/${id}/export`, { revision: 'x' }); assert.equal(r.statusCode, 409); assert.equal(r.headers['content-disposition'], undefined);
});
