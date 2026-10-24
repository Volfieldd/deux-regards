import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as } from './carnet-helpers.js';
import { ROLES, grantsOf, SCOPES } from '../server/permissions.js';
import { libelle, cible } from '../server/journal-libelles.js';
import { dictionary, translator } from '../server/admin-i18n.js';

const owner = (c, slug) => c.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(slug);
const photos = (c, author) => c.db.prepare("SELECT id FROM photos WHERE author_id = ? AND status = 'published' ORDER BY id LIMIT 3").pluck().all(author);
function season(c, author, ids) {
  const id = c.app.saisons.create({ title: 'Une exposition <neutre>', title_en: 'An exhibition', title_de: 'Eine Ausstellung', intro: 'Une intention.', intro_en: 'An intention.', intro_de: 'Eine Absicht.', author_id: author, opens_at: Date.now() + 86400000, closes_at: Date.now() + 864000000, cover_id: ids[0] });
  c.app.saisons.setPhotos(id, ids); return id;
}
const form = (c, id, ids) => ({ version: String(c.app.saisonsPropositions.get(id).version), ...(ids ? { 'photo_ids[]': ids.map(String) } : {}) });

test('propositions : matrice explicite, direction distincte sans réordonnancement ni relecture automatique pour l’administration', () => {
  assert.deepEqual(Object.keys(ROLES.directeur_publication.perms).sort(), ['admin.acceder', 'saisons.voir', 'saisons.vote_ordonner']);
  assert.equal(grantsOf(['admin']).has('saisons.vote_ordonner'), false);
  assert.equal(grantsOf(['admin']).has('saisons.vote_relecture'), false);
  assert.equal(grantsOf(['admin']).get('saisons.vote_valider'), SCOPES.ALL);
  assert.equal(grantsOf(['relecteur']).get('saisons.vote_relecture'), SCOPES.ALL);
  assert.equal(grantsOf(['admin', 'directeur_publication']).get('saisons.vote_ordonner'), SCOPES.ALL);
  assert.equal(grantsOf(['directeur_publication']).has('saisons.vote_valider'), false);
  for (const r of ['moderateur', 'photographe']) for (const p of ['saisons.vote_ordonner', 'saisons.vote_relecture', 'saisons.vote_valider']) assert.equal(grantsOf([r]).has(p), false);
});

test('propositions HTTP : circuit complet dans les deux administrations, version concurrente, ordre, audit sans valeurs', async t => {
  const c = await setup(t, { seeded: true }), own = owner(c, 'sebastien'), ids = photos(c, own), id = season(c, own, ids), base = `/admin/saisons/${id}/vote`;
  const author = as(c, { sub: 'propositions-auteur', roles: ['photographe'], author: 'sebastien' });
  const rel = as(c, { sub: 'propositions-relecteur', roles: ['relecteur'] });
  const admin = as(c, { sub: 'propositions-admin', roles: ['admin'] });
  const dir = as(c, { sub: 'propositions-direction', roles: ['directeur_publication'] });
  const combined = as(c, { sub: 'propositions-cumul', roles: ['admin', 'directeur_publication'] });
  const mod = as(c, { sub: 'propositions-moderateur', roles: ['moderateur'] });
  assert.equal((await mod.get(base)).statusCode, 403);
  assert.match((await admin.get('/admin/comptes')).body, /value="directeur_publication"/);
  assert.equal((await author.post(`${base}/proposer`, form(c, id, ids.slice(0, 2)))).statusCode, 303);
  const initial = form(c, id);
  assert.equal((await admin.post(`${base}/valider`, initial)).statusCode, 409);
  assert.equal((await admin.post(`${base}/relire`, initial)).statusCode, 403);
  assert.equal((await admin.post(`${base}/ordonner`, form(c, id, ids.slice(0, 2).reverse()))).statusCode, 403);
  assert.equal((await dir.post(`${base}/valider`, initial)).statusCode, 403);
  assert.equal((await rel.post(`${base}/relire`, initial)).statusCode, 303);
  assert.equal((await admin.post(`${base}/valider`, initial)).statusCode, 303);
  assert.deepEqual(c.app.saisonsPropositions.approvedIds(id), ids.slice(0, 2));
  assert.equal((await dir.post(`${base}/ordonner`, form(c, id, ids.slice(0, 2).reverse()))).statusCode, 303);
  assert.deepEqual(c.app.saisonsPropositions.approvedIds(id), []);
  assert.equal((await rel.post(`${base}/relire`, initial)).statusCode, 409, 'ancien formulaire de relecture');
  assert.equal((await admin.post(`${base}/valider`, initial)).statusCode, 409, 'ancienne validation');
  const afterOrder = c.app.saisonsPropositions.get(id);
  assert.equal((await author.post(`${base}/proposer`, form(c, id, ids.slice(0, 2)))).statusCode, 303);
  assert.deepEqual(c.app.saisonsPropositions.get(id), afterOrder, 'le photographe ne réordonne pas par un POST arbitraire');
  assert.equal((await combined.post(`${base}/ordonner`, form(c, id, ids.slice(0, 2)))).statusCode, 303, 'cumul explicite');
  for (const version of ['v1', 'v2']) {
    await author.post('/admin/version', { version, back: base });
    const page = await author.get(base);
    assert.equal(page.statusCode, 200, page.body); assert.match(page.body, /Photos proposées au vote/);
    assert.match(page.headers['cache-control'], /no-store/); assert.equal(page.headers['referrer-policy'], 'no-referrer');
    assert.match(page.body, /Une exposition &lt;neutre&gt;/); assert.doesNotMatch(page.body, /style=|<script(?![^>]*(?:src=|type="application\/json"))/);
    assert.doesNotMatch(page.body, /action="[^"]*\/(?:ordonner|relire|valider)"/);
    assert.match((await author.get(`/admin/saisons/${id}`)).body, new RegExp(`/admin/saisons/${id}/vote`));
  }
  const journal = c.db.prepare("SELECT detail FROM audit_log WHERE action LIKE 'POST /admin/saisons/:id/vote/%'").pluck().all().join(' ');
  assert.match(journal, /photo_ids/); assert.match(journal, /reviewed_version/); assert.match(journal, /validated_version/);
  assert.doesNotMatch(journal, /neutre|propositions-auteur/);
});

test('propositions HTTP : portée exposition et photo, identifiants forgés, CSRF et erreurs bornées', async t => {
  const c = await setup(t, { seeded: true }), a = owner(c, 'sebastien'), b = owner(c, 'julien'), ids = photos(c, a), foreign = photos(c, b)[0];
  const mine = season(c, a, [...ids, foreign]), other = season(c, b, [foreign]);
  const author = as(c, { sub: 'propositions-portee', roles: ['photographe'], author: 'sebastien' });
  const unbound = as(c, { sub: 'propositions-sans-auteur', roles: ['photographe'] });
  const base = `/admin/saisons/${mine}/vote`, before = c.app.saisonsPropositions.get(mine);
  assert.equal((await author.get(`/admin/saisons/${other}/vote`)).statusCode, 404);
  assert.equal((await author.post(`/admin/saisons/${other}/vote/proposer`, form(c, other, [foreign]))).statusCode, 404);
  assert.equal((await unbound.get(base)).statusCode, 404);
  assert.equal((await author.post(`${base}/proposer`, form(c, mine, [foreign]))).statusCode, 403);
  assert.equal((await author.post(`${base}/proposer`, form(c, mine, [999999]))).statusCode, 404);
  assert.equal((await author.post(`${base}/proposer`, { ...form(c, mine, ids), _csrf: '' })).statusCode, 403);
  assert.equal((await author.post(`${base}/proposer`, { ...form(c, mine, ids), version: ['1', '1'] })).statusCode, 422);
  assert.equal((await author.post(`${base}/proposer`, { ...form(c, mine, ids), surprise: 'intrus' })).statusCode, 422);
  assert.equal((await author.post(`${base}/proposer`, { ...form(c, mine), 'photo_ids[]': [String(ids[0]), String(ids[0])] })).statusCode, 422);
  assert.deepEqual(c.app.saisonsPropositions.get(mine), before);
  const page = await author.get(base);
  assert.doesNotMatch(page.body, new RegExp(`name="photo_ids\[\]" value="${foreign}"`));
  c.db.prepare("UPDATE photos SET status = 'draft', title = 'Titre privé qui doit disparaître' WHERE id = ?").run(ids[0]);
  assert.equal((await author.post(`${base}/proposer`, form(c, mine, [ids[0]]))).statusCode, 422);
  assert.doesNotMatch((await author.get(base)).body, /Titre privé qui doit disparaître/);
});

test('propositions : les libellés dynamiques du rôle et du journal sont traduits', () => {
  const d = dictionary();
  const actions = ['proposer', 'relire', 'valider', 'ordonner'].map(action => `POST /admin/saisons/:id/vote/${action}`);
  for (const langue of ['en', 'de']) {
    const t = translator(langue), label = ROLES.directeur_publication.label;
    assert.ok(d[label]?.[langue]); assert.notEqual(t(label), label);
    for (const action of actions) {
      const label = libelle(action), target = cible(action, '12');
      assert.ok(label); assert.ok(d[label]?.[langue]); assert.notEqual(t(label), label);
      assert.equal(target.kind, 'Exposition n° {id}'); assert.equal(target.href, '/admin/saisons/12');
      assert.ok(d[target.kind]?.[langue]); assert.notEqual(t(target.kind, { id: '12' }), 'Exposition n° 12');
    }
  }
});

test('propositions Vigie : refus signalés sans contenu, conflit courant sans faux signal de validation', async t => {
  const events = [], c = await setup(t, { seeded: true,
    env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-factice-propositions-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { send: async body => { events.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false },
  });
  const a = owner(c, 'sebastien'), b = owner(c, 'julien'), ownIds = photos(c, a), foreign = photos(c, b)[0], id = season(c, a, [...ownIds, foreign]), other = season(c, b, [foreign]);
  const author = as(c, { sub: 'propositions-vigie-auteur', roles: ['photographe'], author: 'sebastien' });
  const admin = as(c, { sub: 'propositions-vigie-admin', roles: ['admin'] }), rel = as(c, { sub: 'propositions-vigie-relecture', roles: ['relecteur'] });
  const base = `/admin/saisons/${id}/vote`;
  assert.equal((await author.get(`/admin/saisons/${other}/vote`)).statusCode, 404);
  assert.equal((await author.post(`${base}/proposer`, form(c, id, [foreign]))).statusCode, 403);
  assert.equal((await admin.post(`${base}/ordonner`, form(c, id, []))).statusCode, 403);
  assert.equal((await author.post(`${base}/proposer`, { ...form(c, id, ownIds), _csrf: '' })).statusCode, 403);
  assert.equal((await author.post(`${base}/proposer`, { ...form(c, id, ownIds), version: [] })).statusCode, 422);
  assert.equal((await author.post(`${base}/proposer`, form(c, id, ownIds))).statusCode, 303);
  assert.equal((await rel.post(`${base}/relire`, { version: '1' })).statusCode, 409);
  c.app.securite.retryNow?.(); await c.app.securite.flush?.();
  assert.ok(events.some(e => e.type === 'authz_fail' && e.detail.objet === 'saison'));
  assert.ok(events.some(e => e.type === 'authz_fail' && e.detail.objet === 'photo'));
  assert.ok(events.some(e => e.type === 'authz_fail' && e.detail.permission === 'saisons.vote_ordonner'));
  assert.ok(events.some(e => e.type === 'authz_csrf_fail'));
  const malformed = events.filter(e => e.type === 'input_validation_fail' && e.detail.objet === 'saison_propositions');
  assert.equal(malformed.length, 1); assert.equal(malformed[0].detail.champ, 'formulaire');
  assert.equal(malformed[0].origine.composant, 'site · admin');
  assert.doesNotMatch(JSON.stringify(events), /Une exposition|Brume sur|"photo_ids"|"_csrf"/);
});
