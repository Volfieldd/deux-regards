import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as, billet } from './carnet-helpers.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions } from '../vigie/decisions.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createEngine } from '../vigie/moteur.js';
import { createIngest } from '../vigie/ingest.js';

const KEY = 'cle-factice-attribution-0123456789';

// Barrière SMTP déterministe : la publication a persisté, mais sa réponse HTTP attend encore le message.
async function contexte(t) {
  const entered = Promise.withResolvers(), gate = Promise.withResolvers(), events = [], wires = [];
  t.after(() => gate.resolve());
  const c = await setup(t, { seeded: true,
    mailTransport: { sendMail: async () => { entered.resolve(); await gate.promise; } },
    env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { send: async (body, headers) => { events.push(...JSON.parse(body).lot); wires.push({ body, headers }); }, timers: false, pollDecisions: false } });
  const author = c.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const id = c.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').pluck().get(author);
  c.db.prepare("UPDATE photos SET status = 'draft', faces = 0, title = 'Contact https://relecture.invalid' WHERE id = ?").run(id);
  c.app.accounts.ensure({ sub: 'destinataire', email: 'destinataire@example.test', roles: ['photographe'] });
  c.app.accounts.update(c.app.accounts.bySub('destinataire').id, { authorId: author }, 'test');
  c.app.accounts.setNotify('destinataire', { on: true });
  const actor = as(c, { sub: 'acteur-publication', roles: ['admin'] });
  const limited = as(c, { sub: 'compte-limite', roles: ['directeur_publication'] });
  const start = async () => { await c.app.ready(); await c.app.securite.flush(); events.length = 0; wires.length = 0; };
  const textEvents = () => events.filter(e => ['texte_public', 'textes_publics'].includes(e.detail?.objet));
  return { ...c, id, actor, limited, start, textEvents, events, wires, entered: entered.promise, release: () => gate.resolve() };
}

async function corrélation(t, wires, sub) {
  const db = openVigieDb(':memory:'), store = createStore({ db, logKey: 'cle-de-chaine-relecture-0123456789' });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey });
  const engine = createEngine({ store, decisions, switches: createSwitches({ store }) });
  store.onAdded(rows => engine.process(rows));
  const ingest = createIngest({ store, decisions, ingestKey: KEY });
  t.after(async () => { await ingest.close(); db.close(); });
  for (const wire of wires) {
    const response = await ingest.inject({ method: 'POST', url: '/v1/events', payload: wire.body, headers: wire.headers });
    assert.equal(response.statusCode, 200); assert.equal(response.json().ecartes, 0);
  }
  assert.equal(db.prepare("SELECT COUNT(*) FROM alerts WHERE regle = 'sigma.reglage_apres_session_reprise' AND entite_key = ?").pluck().get(sub), 1);
  assert.ok(db.prepare("SELECT COUNT(*) FROM alerts WHERE regle = 'sigma.texte_public_contact'").pluck().get() >= 1);
  assert.equal(store.verify().ok, true);
}

for (const batch of [false, true]) test(`Vigie : publication ${batch ? 'groupée' : 'unitaire'} attribuée avant SMTP, POST concurrent et minuterie, DS23 conservé`, { timeout: 30000 }, async t => {
  const c = await contexte(t);
  c.db.prepare("UPDATE photos SET review = 'proposee' WHERE id = ?").run(c.id);
  await c.start();
  c.app.securite.emit('session_context_change', { sub: c.actor.sub, severity: 'haut', emetteur: 'test · reprise simulée',
    detail: { navigateur: { avant: 'Safari · macOS', apres: 'Chrome · Linux' } } });
  const pending = c.actor.post(batch ? '/admin/a-valider' : `/admin/photos/${c.id}/valider`, batch ? { ids: [String(c.id)] } : {});
  await c.entered;
  assert.equal(c.db.prepare('SELECT status FROM photos WHERE id = ?').pluck().get(c.id), 'published');
  c.app.securite.watchPublication();
  assert.equal((await c.limited.post('/admin/theme', { theme: 'light' })).statusCode, 303);
  await c.app.securite.flush();
  const contacts = c.textEvents().filter(e => e.detail.domaine === 'relecture.invalid');
  assert.equal(contacts.length, 1); assert.equal(contacts[0].sub, c.actor.sub);
  assert.match(contacts[0].origine.emetteur, /^server\/securite/);
  const count = c.textEvents().length;
  c.release(); assert.equal((await pending).statusCode, 303); await c.app.securite.flush();
  assert.equal(c.textEvents().length, count, 'la réponse ne réémet pas la publication');
  assert.equal(c.db.prepare('SELECT sub FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT 1').pluck().get(batch ? 'POST /admin/a-valider' : 'POST /admin/photos/:id/valider'), c.actor.sub);
  await corrélation(t, c.wires, c.actor.sub);
});

test('Vigie : dépublication attribuée avant SMTP, même si un autre compte écrit', { timeout: 30000 }, async t => {
  const c = await contexte(t);
  c.db.prepare("UPDATE photos SET status = 'published' WHERE id = ?").run(c.id);
  await c.start();
  const pending = c.actor.post(`/admin/photos/${c.id}/depublier`, { raison: 'Choix éditorial.' });
  await c.entered;
  assert.equal(c.db.prepare('SELECT status FROM photos WHERE id = ?').pluck().get(c.id), 'draft');
  assert.equal((await c.limited.post('/admin/theme', { theme: 'light' })).statusCode, 303);
  c.app.securite.watchPublication(); await c.app.securite.flush();
  assert.equal(c.textEvents().length, 1); assert.equal(c.textEvents()[0].sub, c.actor.sub);
  c.release(); assert.equal((await pending).statusCode, 303); await c.app.securite.flush();
  assert.equal(c.textEvents().length, 1);
});

test('Vigie : publication de Carnet attribuée avant SMTP et rattrapage concurrent', { timeout: 30000 }, async t => {
  const c = await contexte(t);
  const post = await billet(c, { title: 'Contact https://carnet-relecture.invalid', publish: false });
  await c.start();
  const pending = c.actor.post(`/admin/carnet/${post.id}/publier`);
  await c.entered;
  assert.equal(c.app.carnet.get(post.id).state, 'publie');
  c.app.securite.watchPublication();
  assert.equal((await c.limited.post('/admin/theme', { theme: 'light' })).statusCode, 303);
  await c.app.securite.flush();
  const contacts = c.textEvents().filter(e => e.detail.domaine === 'carnet-relecture.invalid');
  assert.equal(contacts.length, 1); assert.equal(contacts[0].sub, c.actor.sub);
  const count = c.textEvents().length;
  c.release(); assert.equal((await pending).statusCode, 303); await c.app.securite.flush();
  assert.equal(c.textEvents().length, count);
});

for (const kind of ['photo', 'carnet']) test(`Vigie : ${kind} programmé sans acteur avant SMTP, jamais imputé au POST suivant`, { timeout: 30000 }, async t => {
  const c = await contexte(t);
  if (kind === 'photo') c.db.prepare("UPDATE photos SET review = 'programmee', publish_at = ? WHERE id = ?").run(Date.now() - 1000, c.id);
  else {
    const post = await billet(c, { title: 'Contact https://relecture.invalid', publish: false });
    c.db.prepare("UPDATE posts SET state = 'programme', publish_at = ? WHERE id = ?").run(Date.now() - 1000, post.id);
  }
  await c.start();
  const pending = kind === 'photo' ? c.app.review.runDue() : c.app.carnet.runDue();
  await c.entered;
  await c.app.securite.flush();
  const contacts = c.textEvents().filter(e => e.detail.domaine === 'relecture.invalid');
  assert.equal(contacts.length, 1, 'observer avant le premier e-mail programmé');
  assert.equal(contacts[0].sub ?? null, null); assert.match(contacts[0].origine.emetteur, /^publication programmée/);
  assert.equal((await c.limited.post('/admin/theme', { theme: 'light' })).statusCode, 303);
  const count = c.textEvents().length;
  c.release(); assert.equal(await pending, 1); await c.app.securite.flush();
  assert.equal(c.textEvents().length, count);
});
