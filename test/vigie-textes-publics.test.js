import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactsOf } from '../server/securite/textes-publics.js';
import { setup, VIGIE_KEYS } from './helpers.js';

// BV-20 et BV-21 (registre des besoins de la Vigie) : textes publiés qui gagnent un contact, textes réécrits en masse.

test('contacts d’un texte : liens (sauf le site), e-mails, téléphones ; jamais une date ni une heure', () => {
  const c = contactsOf('Voir https://exemple.org/x et www.autre.fr, écrire à bob@exemple.org, ou au 06 12 34 56 78 ; aussi https://www.nicephos.art/serie/rue le 2026-10-18 14:05', { ownHosts: ['nicephos.art'] });
  const v = [...c.values()];
  assert.deepEqual(v.filter(x => x.ajout === 'lien').map(x => x.domaine).sort(), ['autre.fr', 'exemple.org']);
  assert.deepEqual(v.filter(x => x.ajout === 'email').map(x => x.domaine), ['exemple.org']);
  assert.equal(v.filter(x => x.ajout === 'telephone').length, 1);
  assert.ok(![...c.keys()].some(k => k.includes('06 12') || k.includes('bob')), 'ni le numéro ni l’adresse en clair');
  assert.equal(contactsOf('Pris le 18.10.2026 à 14 h 05, inventaire 2026-0042').size, 0);
  assert.equal(contactsOf('+33 6 12 34 56 78').size, 1);
});

test('textes publiés : un contact gagné est signalé sans le texte ; le nombre de textes changés par geste ; publication programmée', async t => {
  const { app, db } = await setup(t, { seeded: true, env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { send: async () => {}, timers: false, pollDecisions: false } });
  await app.ready();
  const emitted = [];
  const orig = app.securite.emit;
  app.securite.emit = (type, opts) => { emitted.push({ type, ...opts }); return orig(type, opts); };
  const id = db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  const base = db.prepare('SELECT alt_text FROM photos WHERE id = ?').pluck().get(id);
  app.securite.watchPublication('essai');                                 // instantané de départ déjà pris au démarrage
  db.prepare('UPDATE photos SET alt_text = ? WHERE id = ?').run(`${base} — commande sur https://boutique-piege.example/x ou au 06 12 34 56 78`, id);
  app.securite.watchPublication('essai');
  const contacts = emitted.filter(e => e.detail?.objet === 'texte_public');
  assert.deepEqual(contacts.map(e => e.detail.ajout).sort(), ['lien', 'telephone']);
  assert.equal(contacts.find(e => e.detail.ajout === 'lien').detail.domaine, 'boutique-piege.example');
  assert.equal(contacts[0].detail.champ, 'photos.alt_text');
  assert.ok(!JSON.stringify(contacts).includes('06 12'), 'jamais le numéro');
  const nb = emitted.filter(e => e.detail?.objet === 'textes_publics');
  assert.equal(nb.length, 1);
  assert.equal(nb[0].detail.textes, 1);
  // Même texte relu : rien ; le même lien déjà présent : pas de nouvel ajout.
  emitted.length = 0;
  app.securite.watchPublication('essai');
  assert.equal(emitted.length, 0);
  db.prepare('UPDATE photos SET alt_text = alt_text || ? WHERE id = ?').run(' (mis à jour)', id);
  app.securite.watchPublication('essai');
  assert.equal(emitted.filter(e => e.detail?.objet === 'texte_public').length, 0);
  // Lieu et mots-clés : textes publics aussi (affichés sous la photo, cherchables).
  emitted.length = 0;
  db.prepare('UPDATE photos SET place = ?, keywords = ? WHERE id = ?').run('Paris, réservez sur www.lieu-piege.example', 'mer, contact@piege.example', id);
  app.securite.watchPublication('essai');
  assert.deepEqual(emitted.filter(e => e.detail?.objet === 'texte_public').map(e => `${e.detail.champ}:${e.detail.ajout}`).sort(), ['photos.keywords:email', 'photos.place:lien']);
  // Une photo brouillon : hors des textes publiés ; publiée ensuite, ses textes entrent (et un lien qu'ils portent).
  const brouillon = db.prepare("SELECT id FROM photos WHERE status != 'published' LIMIT 1").pluck().get();
  if (brouillon) {
    emitted.length = 0;
    db.prepare('UPDATE photos SET legend = ? WHERE id = ?').run('voir https://ailleurs.example', brouillon);
    app.securite.watchPublication('essai');
    assert.equal(emitted.length, 0, 'brouillon : rien');
    db.prepare("UPDATE photos SET status = 'published' WHERE id = ?").run(brouillon);
    app.securite.watchPublication('publication programmée');
    assert.equal(emitted.find(e => e.detail?.objet === 'texte_public')?.detail.domaine, 'ailleurs.example');
  }
});

test('Carnets : le corps d’un aperçu ou d’un brouillon (vigie.corps = rendu) n’est pas scanné comme une saisie brute ; un billet publié qui gagne un lien est signalé', async t => {
  const TOKEN = 'jeton-de-test-0123456789';
  const events = [];
  const { app, db } = await setup(t, { seeded: true, env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64, LOCAL_AUTH_TOKEN: TOKEN },
    vigieOptions: { send: async body => { events.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false } });
  const res = await app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
  const piege = '<script>alert(document.cookie)</script> UNION SELECT password FROM users';
  for (const route of ['apercu', 'brouillon']) await app.inject({ method: 'POST', url: `/admin/carnet/999/${route}`, cookies, payload: { body: piege, _csrf: 'x' } });
  await app.inject({ method: 'POST', url: '/admin/reglages', cookies, payload: { tagline: piege, _csrf: 'x' } });
  app.securite.runTasks(); await app.securite.flush();
  const hits = events.filter(e => e.type === 'malicious_input');
  assert.ok(hits.some(e => (e.route || '').startsWith('/admin/reglages')), 'témoin : un formulaire ordinaire est scanné');
  assert.ok(!hits.some(e => (e.route || '').includes('/admin/carnet/')), 'corps rendu : pas scanné');
  // Billet publié : ses textes entrent dans l'instantané.
  const cols = new Set(db.prepare('PRAGMA table_info(posts)').all().map(c => c.name));
  assert.ok(cols.has('body') && cols.has('state'), 'table posts des Carnets');
  const emitted = [];
  const orig = app.securite.emit;
  app.securite.emit = (type, opts) => { emitted.push({ type, ...opts }); return orig(type, opts); };
  app.securite.watchPublication('essai');
  const post = db.prepare("SELECT id FROM posts WHERE state = 'publie' LIMIT 1").pluck().get();
  if (post) {
    db.prepare('UPDATE posts SET body = body || ? WHERE id = ?').run(' Écrivez-moi : pirate@exemple.org', post);
    app.securite.watchPublication('essai');
    const c = emitted.find(e => e.detail?.objet === 'texte_public');
    assert.equal(c?.detail.champ, 'posts.body');
    assert.equal(c?.detail.ajout, 'email');
  }
});
