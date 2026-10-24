import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSaisons } from '../server/saisons.js';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as, visitor } from './carnet-helpers.js';

test('S3 Vigie HTTP : publications et retraits attribués à l’admin, brouillons et cartels indisponibles exclus, aucun texte brut', async t => {
  // Le dernier instantané précède les publications réelles : rejouer cette ancienne heure pour S3 attribuerait
  // à tort leur apparition au calendrier. Seul le calendrier S2 utilise cette heure injectée.
  const at = Date.now() - 2 * 3600000, events = [];
  const c = await setup(t, { seeded: true, env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { send: async body => { events.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false, textesNow: () => at } });
  const opens = at - 3 * 86400000, closes = at - 2 * 86400000, s = createSaisons({ db: c.db, readiness: c.app.readiness, now: () => opens + 60000 });
  const photos = c.db.prepare("SELECT id, slug FROM photos WHERE status = 'published' ORDER BY id LIMIT 2").all(), ids = photos.map(p => p.id);
  const sid = s.create({ title: 'Exposition terminée', title_en: 'Closed exhibition', title_de: 'Abgeschlossene Ausstellung', intro: 'Une intention.', intro_en: 'An intention.', intro_de: 'Eine Absicht.', opens_at: opens, closes_at: closes });
  s.setPhotos(sid, ids); s.update(sid, { cover_id: ids[0] }); s.open(sid);
  const b = c.app.saisonsBilans, rid = b.createReport(sid, { title: 'Bilan encore préparé' });
  b.createReport(sid, { title: 'Autre brouillon', body: 'Texte privé sur https://bilan-prive.example/ne-pas-emettre' });
  c.app.publicVersion.save('v2');
  const admin = as(c, { sub: 'admin-bilans-vigie', roles: ['admin'] });
  await c.app.ready();
  const flush = async () => { c.app.securite.runTasks(); await c.app.securite.flush(); };
  const textEvents = () => events.filter(e => ['texte_public', 'textes_publics'].includes(e.detail?.objet));
  const clear = async () => { await flush(); events.length = 0; };
  const attributed = () => {
    assert.ok(textEvents().length > 0, 'le geste change effectivement des textes publics');
    for (const event of textEvents()) { assert.equal(event.sub, admin.sub); assert.match(event.origine.emetteur, /^server\/securite/); }
    assert.doesNotMatch(JSON.stringify(events), /secret-bilan@|secret-cartel@|06 12 34 56 78|chemin-secret|ne-pas-emettre|bilan-prive\.example|collection-privee\.example/);
  };
  const selection = { 'photo_ids[]': ids.map(String), ...Object.fromEntries(ids.map((id, i) => [`position_${id}`, String(i + 1)])) };
  const rurl = `/admin/saisons/${sid}/bilans/${rid}`;
  await clear();
  assert.equal((await admin.post(rurl, { version: '1', title: 'Bilan visible', title_en: 'Visible retrospective', title_de: 'Sichtbarer Rückblick',
    body: 'Écrivez à secret-bilan@bilan-visible.example ou au 06 12 34 56 78.', body_en: 'An account.', body_de: 'Ein Bericht.', ...selection })).statusCode, 303);
  await flush(); assert.deepEqual(textEvents(), [], 'un brouillon enregistré ne publie pas son récit');
  await clear();
  assert.equal((await admin.post(`${rurl}/publier`, { version: String(b.getReport(rid).version) })).statusCode, 303);
  await flush(); attributed();
  assert.ok(b.getReport(rid).published_at > at);
  assert.ok(textEvents().some(e => e.detail.champ === 'saison_bilans.body' && e.detail.id === rid && e.detail.ajout === 'email' && e.detail.domaine === 'bilan-visible.example'));
  assert.ok(textEvents().some(e => e.detail.champ === 'saison_bilans.body' && e.detail.ajout === 'telephone'));
  assert.ok(textEvents().some(e => e.detail.objet === 'textes_publics' && e.detail.champs.includes('saison_bilans.body')));

  await clear();
  const created = await admin.post(`${rurl}/collections`, { title: 'Collection à préparer' }); assert.equal(created.statusCode, 303);
  const cid = Number(created.headers.location.split('/').at(-1)), curl = created.headers.location;
  const cartels = Object.fromEntries(ids.flatMap(id => ['', '_en', '_de'].map(suffix => [`cartel_${id}${suffix}`, ''])));
  assert.equal((await admin.post(curl, { version: String(b.getCollection(cid).version), title: 'Collection visible', title_en: 'Visible collection', title_de: 'Sichtbare Sammlung',
    subtitle: '', subtitle_en: '', subtitle_de: '', intro: 'Notre regard sur https://collection-visible.example/chemin-secret', intro_en: 'An intention.', intro_de: 'Eine Absicht.',
    prologue: '', prologue_en: '', prologue_de: '', conclusion: '', conclusion_en: '', conclusion_de: '', cover_id: String(ids[0]), ...selection, ...cartels,
    [`cartel_${ids[0]}`]: 'Contact : secret-cartel@cartel-visible.example', [`cartel_${ids[0]}_en`]: 'Caption.', [`cartel_${ids[0]}_de`]: 'Beschriftung.',
  })).statusCode, 303);
  b.createCollection(rid, { title: 'Collection privée', intro: 'Texte privé https://collection-privee.example/ne-pas-emettre' });
  await flush(); assert.deepEqual(textEvents(), [], 'la préparation de collection reste hors des sources publiques');
  await clear();
  assert.equal((await admin.post(`${curl}/publier`, { version: String(b.getCollection(cid).version) })).statusCode, 303);
  await flush(); attributed(); assert.ok(b.getCollection(cid).published_at > at);
  assert.ok(textEvents().some(e => e.detail.champ === 'saison_collections.intro' && e.detail.id === cid && e.detail.domaine === 'collection-visible.example'));
  const cartel = textEvents().find(e => e.detail.champ === 'saison_collection_photos.cartel');
  const cartelId = c.db.prepare('SELECT id FROM saison_collection_photos WHERE collection_id = ? AND photo_id = ?').pluck().get(cid, ids[0]);
  assert.equal(cartel.detail.id, cartelId); assert.equal(cartel.detail.domaine, 'cartel-visible.example');

  // La rubrique réelle, pas l’aperçu du compte, décide de la surveillance du texte public.
  let scans = 0; const rows = b.textRows;
  b.textRows = () => { scans++; return rows(); };
  c.app.publicVersion.save('v1'); c.app.securite.watchPublication(); await clear(); scans = 0;
  assert.equal((await admin.post('/admin/apparence/apercu-v2', { vue: 'v2' })).statusCode, 303); await flush();
  assert.equal(scans, 0); assert.deepEqual(textEvents(), []);
  c.app.publicVersion.save('v2'); c.app.securite.watchPublication(); await clear(); scans = 0;
  const see = visitor(c); assert.equal((await see(`/collection/${b.getCollection(cid).slug}`)).statusCode, 200);
  await see('/static/css/expositions.css'); assert.equal(scans, 0, 'les GET ne scannent pas les textes publics');

  // Le retrait courant d’une photo sort son cartel de la projection et du résumé de comparaison.
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(ids[0]); c.app.securite.watchPublication(); await flush();
  assert.ok(!rows().some(row => row.source === 'saison_collection_photos' && row.id === cartelId));
  assert.ok(textEvents().some(e => e.detail.objet === 'textes_publics' && e.detail.champs.includes('saison_collection_photos.cartel')));
  assert.ok(!textEvents().some(e => e.detail.objet === 'texte_public' && e.detail.domaine === 'cartel-visible.example'));
  assert.equal((await see(`/collection/${b.getCollection(cid).slug}/photo/${photos[0].slug}`)).statusCode, 404);
  await clear();
  assert.equal((await admin.post(`${curl}/retirer`, { version: String(b.getCollection(cid).version) })).statusCode, 303);
  await flush(); attributed(); assert.ok(textEvents().some(e => e.detail.objet === 'textes_publics' && e.detail.champs.includes('saison_collections.intro')));
  await clear();
  assert.equal((await admin.post(`${rurl}/retirer`, { version: String(b.getReport(rid).version) })).statusCode, 303);
  await flush(); attributed(); assert.ok(textEvents().some(e => e.detail.objet === 'textes_publics' && e.detail.champs.includes('saison_bilans.body')));
  const count = textEvents().length; c.app.securite.watchPublication(); await flush(); assert.equal(textEvents().length, count);
});
