import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate } from '../server/db/index.js';
import { createPublicTexts } from '../server/securite/textes-publics.js';
import { createSaisons } from '../server/saisons.js';
import { archiveEndsAt } from '../server/saisons-publiques.js';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as, visitor } from './carnet-helpers.js';

test('S2 Vigie : fournisseur dynamique, identifiants des cartels et phases sans texte brut', () => {
  const db = openDb(':memory:'); migrate(db);
  try {
    let rows = [];
    const seen = [], texts = createPublicTexts({ db, externalSources: ({ now }) => { seen.push(now); return rows; } });
    const before = texts.snapshot({ now: 100 });
    rows = [{ key: 'saisons#7', source: 'saisons', id: 7, phase: 'annonce', champs: { title: 'Titre public' } },
      { key: 'saison_cartels#7:12', source: 'saison_cartels', id: 7, photo_id: 12, champs: { cartel: 'Adresse privée : personne@contact.example ; texte\u001fséparé' } }];
    const shown = texts.refreshExternal(before, { now: 200 }), diff = texts.diff(before, shown);
    assert.deepEqual(seen, [100, 200]);
    assert.deepEqual(diff.ajouts, [{ champ: 'saison_cartels.cartel', id: 7, photo_id: 12, ajout: 'email', domaine: 'contact.example' }]);
    assert.deepEqual(diff.phases, [{ id: 7, phase_avant: null, phase: 'annonce' }]);
    assert.deepEqual(diff.changes.sort(), ['saison_cartels.cartel#7:12', 'saisons.title#7']);
    assert.doesNotMatch(JSON.stringify(diff), /personne@|Adresse privée|séparé/);
    assert.deepEqual(texts.diff(shown, texts.refreshExternal(shown, { now: 201 })), { changes: [], ajouts: [], phases: [] });
    rows = [{ ...rows[0], phase: 'ouverte' }, rows[1]];
    const opened = texts.refreshExternal(shown, { now: 300 });
    assert.deepEqual(texts.diff(shown, opened), { changes: [], ajouts: [], phases: [{ id: 7, phase_avant: 'annonce', phase: 'ouverte' }] });
    rows = [];
    const removed = texts.diff(opened, texts.refreshExternal(opened, { now: 400 }));
    assert.equal(removed.changes.length, 2); assert.deepEqual(removed.ajouts, []);
    assert.deepEqual(removed.phases, [{ id: 7, phase_avant: 'ouverte', phase: null }]);
  } finally { db.close(); }
});

test('S2 Vigie : ouverture, clôture et échéance sans SQL ; calendrier séparé du prochain geste admin', async t => {
  let at = Date.now(), events = [];
  const c = await setup(t, { seeded: true, env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { send: async body => { events.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false, textesNow: () => at } });
  const s = createSaisons({ db: c.db, readiness: c.app.readiness, now: () => at });
  const photos = c.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 2").pluck().all();
  const opens = at + 3600000, closes = opens + 3600000;
  const make = (title, extra = {}) => {
    const id = s.create({ title, title_en: `${title} EN`, title_de: `${title} DE`, intro: 'Contactez une personne sur https://visite.example/secret ou au 06 12 34 56 78',
      intro_en: 'An intention', intro_de: 'Eine Absicht', opens_at: opens, closes_at: closes, ...extra });
    s.setPhotos(id, photos); s.update(id, { cover_id: photos[0] });
    s.setCartels(id, [{ photo_id: photos[0], cartel: 'Écrivez à personne@cartel.example', cartel_en: 'Caption', cartel_de: 'Bildtext' }]);
    return id;
  };
  const id = make('Exposition prévue'); s.schedule(id);
  const privateId = make('Dossier privé https://brouillon.example');
  const retiredId = make('Exposition retirée https://retire.example'); s.schedule(retiredId); s.withdraw(retiredId);
  c.db.prepare('UPDATE saisons SET report = ?, report_en = ?, report_de = ? WHERE id = ?').run('Bilan privé https://bilan-prive.example', 'Draft report', 'Entwurf', id);
  const admin = as(c, { sub: 'admin-expositions', roles: ['admin'] });
  await c.app.ready();
  const flush = async () => { c.app.securite.runTasks(); await c.app.securite.flush(); };
  const textEvents = () => events.filter(e => ['texte_public', 'textes_publics', 'exposition'].includes(e.detail?.objet));
  await flush(); events = [];
  c.app.securite.watchPublication(); await flush();
  assert.deepEqual(textEvents(), [], 'la rubrique V1 ne publie aucune source d’exposition');
  assert.equal((await admin.post('/admin/apparence/apercu-v2', { vue: 'v2' })).statusCode, 303); await flush();
  assert.deepEqual(textEvents(), [], 'l’aperçu privé V2 ne publie pas les textes dans la Vigie');
  c.app.publicVersion.save('v2'); c.app.securite.watchPublication(); await flush();
  assert.deepEqual(textEvents().filter(e => e.detail.objet === 'exposition').map(e => e.detail), [{ objet: 'exposition', id, phase_avant: null, phase: 'annonce' }]);
  assert.equal(textEvents().filter(e => e.detail.objet === 'texte_public').length, 0, 'les contacts de visite ne sont pas dans l’annonce');
  assert.ok(!textEvents().some(e => [privateId, retiredId].includes(e.detail.id)));
  events = [];
  assert.equal((await admin.post(`/admin/saisons/${privateId}/programmer`, { version: String(s.get(privateId).version) })).statusCode, 303); await flush();
  const published = textEvents().find(e => e.detail.domaine === 'brouillon.example');
  assert.equal(published.sub, 'admin-expositions'); assert.match(published.origine.emetteur, /^server\/securite/);
  assert.equal((await admin.post(`/admin/saisons/${privateId}/retirer`, { version: String(s.get(privateId).version), reason: 'choix_editorial' })).statusCode, 303); await flush();

  // Les requêtes publiques et statiques ne déclenchent aucun scan du fournisseur de textes.
  const rows = c.app.expositions.textRows;
  let scans = 0; c.app.expositions.textRows = options => { scans++; return rows(options); };
  const see = visitor(c); await see('/expositions'); await see('/static/css/expositions.css');
  assert.equal(scans, 0);
  events = [];
  const total = c.db.prepare('SELECT total_changes()').pluck();
  const beforeClock = total.get(); at = opens;
  c.app.securite.watchPublication(); c.app.securite.watchPublication();
  assert.equal(total.get(), beforeClock, 'aucune écriture SQL nécessaire au changement de visibilité');
  await flush();
  const opened = textEvents();
  assert.equal(opened.filter(e => e.detail.objet === 'exposition' && e.detail.phase === 'ouverte').length, 1);
  const caption = opened.find(e => e.detail.champ === 'saison_cartels.cartel');
  assert.equal(caption.detail.id, id); assert.equal(caption.detail.photo_id, photos[0]); assert.equal(caption.detail.domaine, 'cartel.example');
  assert.equal(opened.filter(e => e.detail.objet === 'texte_public').length, 3);
  for (const e of opened) { assert.equal(e.sub ?? null, null); assert.match(e.origine.emetteur, /^publication programmée/); }
  assert.doesNotMatch(JSON.stringify(opened), /personne@|06 12|\/secret|brouillon\.example|retire\.example|bilan-prive\.example/);
  events = []; at = closes;
  c.app.securite.watchPublication(); c.app.securite.watchPublication(); await flush();
  assert.deepEqual(textEvents().map(e => e.detail), [{ objet: 'exposition', id, phase_avant: 'ouverte', phase: 'archive' }]);

  events = []; at = archiveEndsAt(closes);
  const write = await admin.post('/admin/reglages', { part: 'site', tagline: 'Un texte public vers https://accueil.example' });
  assert.equal(write.statusCode, 303); await flush();
  const expiry = textEvents().find(e => e.detail.objet === 'exposition');
  assert.equal(expiry.detail.phase, 'bilan'); assert.equal(expiry.sub ?? null, null); assert.match(expiry.origine.emetteur, /^publication programmée/);
  const edit = textEvents().find(e => e.detail.champ === 'reglages.tagline');
  assert.equal(edit.sub, 'admin-expositions'); assert.match(edit.origine.emetteur, /^server\/securite/);
  assert.ok(textEvents().filter(e => e.detail.objet === 'textes_publics' && e.sub == null).length > 0);
  const count = textEvents().length; c.app.securite.watchPublication(); await flush();
  assert.equal(textEvents().length, count, 'aucune échéance ni modification émise deux fois');
});
