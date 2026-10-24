import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as } from './carnet-helpers.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions } from '../vigie/decisions.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createEngine } from '../vigie/moteur.js';
import { createIngest } from '../vigie/ingest.js';

const KEY = 'cle-factice-bv35-0123456789abcdef';
const owner = (c, slug) => c.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(slug);
const photos = (c, author) => c.db.prepare("SELECT id FROM photos WHERE author_id = ? AND status = 'published' ORDER BY id LIMIT 3").pluck().all(author);
const form = (c, id, ids) => ({ version: String(c.app.saisonsPropositions.get(id).version), ...(ids ? { 'photo_ids[]': ids.map(String) } : {}) });
function season(c, author, ids) {
  const id = c.app.saisons.create({ title: 'Titre privé BV35', title_en: 'Private title BV35', title_de: 'Privater Titel BV35',
    intro: 'Intention privée BV35.', intro_en: 'Private intention.', intro_de: 'Private Absicht.', author_id: author,
    opens_at: Date.now() + 86400000, closes_at: Date.now() + 864000000, cover_id: ids[0] });
  c.app.saisons.setPhotos(id, ids); return id;
}
async function watched(t) {
  const events = [], c = await setup(t, { seeded: true,
    env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { send: async (body, headers) => {
      assert.equal(headers['x-vigie-sig'], crypto.createHmac('sha256', KEY).update(`${headers['x-vigie-ts']}.${headers['x-vigie-nonce']}.${body}`).digest('hex'));
      events.push(...JSON.parse(body).lot);
    }, timers: false, pollDecisions: false },
  });
  const flush = async () => { c.app.securite.retryNow(); await c.app.securite.flush(); };
  const changes = () => events.filter(e => e.type === 'config_public_changed' && e.detail?.objet === 'propositions_vote');
  return { c, events, flush, changes };
}

test('BV-35 HTTP : chaque changement réussi du circuit est persisté et émis une fois, sans liste ni contenu', async t => {
  const { c, events, flush, changes } = await watched(t), a = owner(c, 'sebastien'), ids = photos(c, a), id = season(c, a, ids);
  assert.equal(ids.length, 3);
  const author = as(c, { sub: 'bv35-auteur', roles: ['photographe'], author: 'sebastien' });
  const reviewer = as(c, { sub: 'bv35-relecteur', roles: ['relecteur'] });
  const admin = as(c, { sub: 'bv35-admin', roles: ['admin'] });
  const director = as(c, { sub: 'bv35-direction', roles: ['directeur_publication'] });
  const base = `/admin/saisons/${id}/vote`, states = c.app.saisonsPropositions;
  const expected = (action, version_avant, version, photos_avant, count, relecture_avant, relecture, validation_avant, validation) => ({
    objet: 'propositions_vote', id, action, version_avant, version, photos_avant, photos: count, relecture_avant, relecture, validation_avant, validation,
  });
  async function change(by, action, list, detail, after) {
    await flush(); events.length = 0;
    const response = await by.post(`${base}/${action}`, form(c, id, list));
    assert.equal(response.statusCode, 303);
    assert.deepEqual(states.get(id), after, 'le signal correspond à l’état effectivement enregistré');
    await flush();
    assert.equal(changes().length, 1);
    const event = changes()[0];
    assert.deepEqual(event.detail, detail);
    assert.equal(event.sub, by.sub); assert.equal(event.origine.composant, 'site · admin');
    assert.equal(event.origine.emetteur, 'server/routes/saisons-propositions.js · propositions au vote');
    assert.equal(event.route, `/admin/saisons/:id/vote/${action}`); assert.equal(event.method, 'POST'); assert.equal(event.severity, 'bas');
    assert.match(event.session, /^[0-9a-f]{12}$/);
    const journal = c.db.prepare('SELECT detail FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT 1').pluck().get(`POST /admin/saisons/:id/vote/${action}`);
    assert.ok(journal); assert.doesNotMatch(journal, /Titre privé|Intention privée|bv35-auteur/);
    const serialized = JSON.stringify(event);
    assert.doesNotMatch(serialized, /photo_ids|reviewed_version|validated_version|_csrf|Titre privé|Intention privée|"cookies"|"bulletin"/);
    for (const by of [author, reviewer, admin, director]) {
      assert.equal(serialized.includes(by.cookies.session), false, 'le cookie de session ne sort pas');
      assert.equal(serialized.includes(by.csrf), false, 'le jeton CSRF ne sort pas');
    }
  }
  await change(author, 'proposer', ids.slice(0, 2), expected('proposer', 1, 2, 0, 2, false, false, false, false),
    { version: 2, reviewed_version: null, validated_version: null, photo_ids: ids.slice(0, 2) });
  await change(reviewer, 'relire', null, expected('relire', 2, 2, 2, 2, false, true, false, false),
    { version: 2, reviewed_version: 2, validated_version: null, photo_ids: ids.slice(0, 2) });
  await change(admin, 'valider', null, expected('valider', 2, 2, 2, 2, true, true, false, true),
    { version: 2, reviewed_version: 2, validated_version: 2, photo_ids: ids.slice(0, 2) });
  assert.deepEqual(states.approvedIds(id), ids.slice(0, 2));
  await change(director, 'ordonner', ids.slice(0, 2).reverse(), expected('ordonner', 2, 3, 2, 2, true, false, true, false),
    { version: 3, reviewed_version: null, validated_version: null, photo_ids: ids.slice(0, 2).reverse() });
  assert.deepEqual(states.approvedIds(id), [], 'le changement suspend le vote avant toute revalidation');
  await change(reviewer, 'relire', null, expected('relire', 3, 3, 2, 2, false, true, false, false),
    { version: 3, reviewed_version: 3, validated_version: null, photo_ids: ids.slice(0, 2).reverse() });
  await change(admin, 'valider', null, expected('valider', 3, 3, 2, 2, true, true, false, true),
    { version: 3, reviewed_version: 3, validated_version: 3, photo_ids: ids.slice(0, 2).reverse() });
  await change(author, 'proposer', ids.slice(1), expected('proposer', 3, 4, 2, 2, true, false, true, false),
    { version: 4, reviewed_version: null, validated_version: null, photo_ids: ids.slice(1) });
  assert.deepEqual(states.approvedIds(id), []);
});

test('BV-35 HTTP : lecture, répétition sans changement, refus, conflit et circuit figé ne produisent aucun fait éditorial', async t => {
  const { c, events, flush, changes } = await watched(t), a = owner(c, 'sebastien'), b = owner(c, 'julien'), ids = photos(c, a), foreign = photos(c, b)[0];
  const id = season(c, a, [...ids, foreign]), other = season(c, b, [foreign]), base = `/admin/saisons/${id}/vote`, states = c.app.saisonsPropositions;
  const author = as(c, { sub: 'bv35-refus-auteur', roles: ['photographe'], author: 'sebastien' });
  const reviewer = as(c, { sub: 'bv35-refus-relecteur', roles: ['relecteur'] });
  const admin = as(c, { sub: 'bv35-refus-admin', roles: ['admin'] });
  const director = as(c, { sub: 'bv35-refus-direction', roles: ['directeur_publication'] });
  const unbound = as(c, { sub: 'bv35-refus-sans-photographe', roles: ['photographe'] });
  async function unchanged(action, status) {
    await flush(); events.length = 0;
    const before = states.get(id), response = await action();
    assert.equal(response.statusCode, status); assert.deepEqual(states.get(id), before);
    await flush(); assert.deepEqual(changes(), [], 'aucune mutation éditoriale n’a abouti');
  }
  await unchanged(() => author.get(base), 200);
  await unchanged(() => author.post(`${base}/proposer`, form(c, id, [])), 303);
  assert.equal((await author.post(`${base}/proposer`, form(c, id, ids.slice(0, 2)))).statusCode, 303);
  await unchanged(() => author.post(`${base}/proposer`, form(c, id, ids.slice(0, 2).reverse())), 303);
  await unchanged(() => director.post(`${base}/ordonner`, form(c, id, ids.slice(0, 2))), 303);
  await unchanged(() => admin.post(`${base}/valider`, form(c, id)), 409);
  await unchanged(() => reviewer.post(`${base}/relire`, { version: '1' }), 409);
  await unchanged(() => admin.post(`${base}/relire`, form(c, id)), 403);
  await unchanged(() => admin.post(`${base}/ordonner`, form(c, id, ids.slice(0, 2).reverse())), 403);
  await unchanged(() => director.post(`${base}/valider`, form(c, id)), 403);
  await unchanged(() => author.post(`/admin/saisons/${other}/vote/proposer`, form(c, other, [foreign])), 404);
  await unchanged(() => unbound.get(base), 404);
  await unchanged(() => author.post(`${base}/proposer`, form(c, id, [foreign])), 403);
  await unchanged(() => author.post(`${base}/proposer`, form(c, id, [999999])), 404);
  await unchanged(() => author.post(`${base}/proposer`, { ...form(c, id, ids), _csrf: '' }), 403);
  await unchanged(() => author.post(`${base}/proposer`, { ...form(c, id, ids), version: ['2', '2'] }), 422);
  await unchanged(() => author.post(`${base}/proposer`, { ...form(c, id, ids), surprise: 'valeur privée BV35' }), 422);
  await unchanged(() => author.post(`${base}/proposer`, form(c, id, [ids[0], ids[0]])), 422);
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(ids[2]);
  await unchanged(() => author.post(`${base}/proposer`, form(c, id, [ids[2]])), 422);
  assert.equal((await reviewer.post(`${base}/relire`, form(c, id))).statusCode, 303);
  await unchanged(() => reviewer.post(`${base}/relire`, form(c, id)), 303);
  assert.equal((await admin.post(`${base}/valider`, form(c, id))).statusCode, 303);
  await unchanged(() => admin.post(`${base}/valider`, form(c, id)), 303);
  await unchanged(() => director.post(`${base}/ordonner`, form(c, id, ids.slice(0, 2))), 303);
  const completed = () => c.db.prepare("SELECT COUNT(*) FROM audit_log WHERE action = 'POST /admin/saisons/:id/vote/proposer' AND status < 400").pluck().get();
  const beforeFailure = completed();
  c.db.exec("CREATE TEMP TRIGGER bv35_ecriture_refusee BEFORE INSERT ON saison_propositions BEGIN SELECT RAISE(ABORT, 'Écriture interrompue BV35'); END");
  try {
    await unchanged(() => author.post(`${base}/proposer`, form(c, id, [])), 500);
    assert.equal(completed(), beforeFailure, 'une transaction interrompue ne reçoit pas un audit de succès');
    assert.ok(events.some(e => e.type === 'sys_error'));
  } finally { c.db.exec('DROP TRIGGER bv35_ecriture_refusee'); }
  // Une clôture calendaire ne transforme pas un formulaire resté ouvert en changement autorisé.
  c.db.prepare("UPDATE saisons SET state = 'publie', opens_at = ?, closes_at = ? WHERE id = ?").run(Date.now() - 120000, Date.now() - 60000, id);
  assert.equal(c.app.saisons.get(id).phase, 'close');
  for (const [by, action, list] of [[author, 'proposer', []], [director, 'ordonner', ids.slice(0, 2).reverse()], [reviewer, 'relire'], [admin, 'valider']])
    await unchanged(() => by.post(`${base}/${action}`, form(c, id, list)), 409);
  c.db.prepare("UPDATE saisons SET state = 'retire' WHERE id = ?").run(id);
  assert.equal(c.app.saisons.get(id).phase, 'retire');
  await unchanged(() => author.post(`${base}/proposer`, form(c, id, [])), 409);
});

test('BV-35 bout en bout : proposition HTTP, ingestion signée, preuves DS23, dossier et décision appliquée à l’écriture suivante', async t => {
  let ingest;
  const receipts = [], c = await setup(t, { seeded: true,
    env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { timers: false, pollDecisions: false, send: async (payload, headers) => {
      const response = await ingest.inject({ method: 'POST', url: '/v1/events', payload, headers });
      receipts.push({ status: response.statusCode, ...response.json(), attendus: JSON.parse(payload).lot.length });
      assert.equal(response.statusCode, 200);
    } },
  });
  const db = openVigieDb(':memory:'), store = createStore({ db, logKey: 'cle-de-chaine-bv35-0123456789abcdef' });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey }), switches = createSwitches({ store });
  const engine = createEngine({ store, decisions, switches });
  store.onAdded(rows => engine.process(rows));
  ingest = createIngest({ store, decisions, ingestKey: KEY });
  t.after(async () => { await ingest.close(); db.close(); });
  const a = owner(c, 'sebastien'), ids = photos(c, a), id = season(c, a, ids), base = `/admin/saisons/${id}/vote`;
  const author = as(c, { sub: 'bv35-bout-en-bout', roles: ['photographe'], author: 'sebastien' });
  c.db.prepare("UPDATE sessions SET auth_time = auth_time - 60000, ctx_net = '192.0.2.0', ctx_ua = 'Safari · macOS' WHERE sub = ?").run(author.sub);
  const roles = c.app.accounts.bySub(author.sub).roles;
  const flush = async () => { c.app.securite.retryNow(); await c.app.securite.flush(); };
  await c.app.ready(); await flush();
  assert.equal(db.prepare("SELECT COUNT(*) FROM alerts WHERE regle = 'sigma.reglage_apres_session_reprise'").pluck().get(), 0);
  // Le contexte repris est simulé ; le geste et tous les maillons qui suivent passent par les vrais composants.
  // La liste des décisions n’est remise au site qu’après le geste, comme entre deux lectures périodiques.
  c.app.securite.emit('session_context_change', { sub: author.sub, severity: 'haut', emetteur: 'test · reprise simulée',
    detail: { navigateur: { avant: 'Safari · macOS', apres: 'Chrome · Linux' } } });
  assert.equal((await author.post(`${base}/proposer`, form(c, id, ids.slice(0, 2)))).statusCode, 303);
  assert.deepEqual(c.app.saisonsPropositions.get(id).photo_ids, ids.slice(0, 2));
  await flush();
  assert.ok(receipts.length > 0);
  for (const r of receipts) assert.deepEqual([r.status, r.recus, r.gardes, r.ecartes], [200, r.attendus, r.attendus, 0]);
  const event = db.prepare("SELECT * FROM events WHERE type = 'config_public_changed' AND json_extract(detail, '$.objet') = 'propositions_vote'").get();
  assert.ok(event); assert.equal(event.sub, author.sub); assert.equal(event.canal, 'ingestion signée'); assert.equal(event.confiance, 'rapporté');
  assert.equal(event.composant, 'site · admin'); assert.equal(event.route, '/admin/saisons/:id/vote/proposer'); assert.match(event.session, /^[0-9a-f]{12}$/);
  assert.deepEqual(JSON.parse(event.detail), { objet: 'propositions_vote', id, action: 'proposer', version_avant: 1, version: 2,
    photos_avant: 0, photos: 2, relecture_avant: false, relecture: false, validation_avant: false, validation: false });
  const reprise = db.prepare("SELECT seq FROM events WHERE type = 'session_context_change' AND sub = ?").get(author.sub);
  const alert = db.prepare("SELECT * FROM alerts WHERE regle = 'sigma.reglage_apres_session_reprise'").get();
  assert.deepEqual([alert.cas, alert.gravite, alert.mode, alert.entite_kind, alert.entite_key], ['DS23', 'haut', 'bloquer', 'compte', author.sub]);
  const signal = db.prepare("SELECT detail FROM events WHERE type = 'vigie_signal' AND json_extract(detail, '$.regle') = 'sigma.reglage_apres_session_reprise'").pluck().get();
  assert.ok(JSON.parse(signal).evenements.includes(event.seq)); assert.ok(JSON.parse(signal).evenements.includes(reprise.seq));
  assert.equal(db.prepare('SELECT phase_max FROM dossiers WHERE id = ?').pluck().get(alert.dossier_id), 5);
  assert.deepEqual(decisions.active().map(d => [d.kind, d.cible]), [['verifier_identite', author.sub]]);
  c.app.decisions.accept(decisions.signed());
  assert.equal(c.app.decisions.state.counts.verifications, 1);
  const before = c.app.saisonsPropositions.get(id);
  const blocked = await author.post(`${base}/proposer`, form(c, id, []), { host: 'localhost', referer: `http://localhost${base}` });
  assert.equal(blocked.statusCode, 303); assert.equal(blocked.headers.location, `/auth/verifier?next=${encodeURIComponent(base)}`);
  assert.deepEqual(c.app.saisonsPropositions.get(id), before, 'la demande d’identité arrête réellement la mutation suivante');
  assert.deepEqual(c.app.accounts.bySub(author.sub).roles, roles, 'les responsabilités du compte restent inchangées');
  assert.match((await author.get(base)).body, /Par sécurité, confirmez votre identité avant de modifier quoi que ce soit/);
  await flush();
  assert.equal(db.prepare("SELECT COUNT(*) FROM events WHERE type = 'config_public_changed' AND json_extract(detail, '$.objet') = 'propositions_vote'").pluck().get(), 1);
  assert.equal(db.prepare("SELECT COUNT(*) FROM events WHERE type = 'authz_reauth_required' AND sub = ?").pluck().get(author.sub), 1);
  assert.equal(store.verify().ok, true, 'les faits, preuves et conséquences restent dans une chaîne intacte');
});
