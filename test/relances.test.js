import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { createReminders, RIGHTS_DELAY } from '../server/reminders.js';

// Relances par e-mail : demandes RGPD par quarts du délai d'un mois (photographe, puis administrateur en copie, puis
// prioritaire), récapitulatif réglable (jamais plus d'un par jour), e-mail de test depuis « Comptes et rôles ».
const DAY = 864e5;
async function world(t, { mail = true } = {}) {
  const sent = [];
  const ctx = await setup(t, { seeded: true, mailTransport: mail ? { sendMail: async m => { sent.push(m); } } : null });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const as = (sub, roles, { authorId = null, email = '' } = {}) => {
    ctx.app.accounts.ensure({ sub, name: sub, email, roles });
    if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    return { post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
      get: url => ctx.app.inject({ url, cookies: { session: token }, headers: { accept: 'text/html' } }).then(r => r.body) };
  };
  return { ...ctx, sent, seb, as };
}

test('demande RGPD : photographe tout de suite, rappel au quart, administrateur en copie à la moitié, prioritaire aux trois quarts', async t => {
  const c = await world(t);
  c.as('seb', ['photographe'], { authorId: c.seb, email: 'seb@example.org' });           // e-mails non choisis : envoyé quand même
  c.as('root', ['admin'], { email: 'root@example.org' });
  const id = c.app.encounters.saveCard(null, { ref: 'S-0042', signed: 'on', scope_site: 'on', met_on: '2026-10-12', author_id: c.seb, name: 'Alice Martin', email: 'alice@example.org' });
  const at = ms => c.db.prepare("UPDATE encounters SET rights_request = 'effacement', rights_requested_at = ?, rights_done_at = NULL WHERE id = ?").run(ms, id);
  at(Date.now());
  assert.equal(await c.app.reminders.rights(), 1);
  assert.equal(c.sent[0].to, 'seb@example.org');
  assert.equal(c.sent[0].cc, undefined);
  assert.match(c.sent[0].subject, /Demande RGPD reçue \(S-0042\)/);
  assert.match(c.sent[0].text, /S-0042\) a demandé l’effacement[\s\S]*\/admin\/rencontres\/\d+#droits/);
  assert.doesNotMatch(c.sent.map(m => m.subject + m.text).join(), /Alice|alice@/);       // jamais le nom ni l'adresse
  assert.equal(await c.app.reminders.rights(), 0);                                        // une fois par étape
  at(Date.now() - 8 * DAY);
  await c.app.reminders.rights();
  assert.match(c.sent[1].subject, /^.* · Rappel/);
  assert.equal(c.sent[1].cc, undefined);
  at(Date.now() - 16 * DAY);
  await c.app.reminders.rights();
  assert.match(c.sent[2].subject, /Second rappel/);
  assert.deepEqual([c.sent[2].to, c.sent[2].cc], ['seb@example.org', ['root@example.org']]);
  at(Date.now() - 23 * DAY);
  await c.app.reminders.rights();
  assert.match(c.sent[3].subject, /URGENT/);
  assert.equal(c.sent[3].priority, 'high');
  assert.deepEqual(c.sent[3].cc, ['root@example.org']);
  assert.match(c.sent[3].text, /moins d’une semaine/);
  // Traitée : plus rien.
  c.app.encounters.rightsDone(id);
  await c.app.reminders.rights();
  assert.equal(c.sent.length, 4);
});

test('demande RGPD : serveur arrêté longtemps, une seule relance (l’étape du moment) ; sans photographe, l’administrateur ; nouvelle demande : on repart', async t => {
  const c = await world(t);
  c.as('root', ['admin'], { email: 'root@example.org' });
  const id = c.app.encounters.saveCard(null, { ref: 'S-0043', signed: 'on', scope_site: 'on', met_on: '2026-10-12', author_id: c.seb });
  c.db.prepare("UPDATE encounters SET rights_request = 'acces', rights_requested_at = ? WHERE id = ?").run(Date.now() - 20 * DAY, id);
  await c.app.reminders.rights();
  assert.equal(c.sent.length, 1);
  assert.equal(c.sent[0].to, 'root@example.org');                                        // aucun compte photographe joignable
  assert.match(c.sent[0].subject, /Second rappel/);
  assert.match(c.sent[0].text, /a demandé l’accès/);
  assert.equal(c.app.reminders.stageOf(Date.now() - RIGHTS_DELAY), 4);
  // Demande depuis /bonjour : remise à zéro, e-mail tout de suite.
  const r = await c.app.inject({ method: 'POST', url: '/bonjour', payload: { ref: 'S-0043', rights: 'effacement', email: 'x@example.org' } });
  assert.equal(r.statusCode, 303);
  await new Promise(res => setTimeout(res, 50));
  assert.equal(c.sent.length, 2);
  assert.match(c.sent[1].subject, /Demande RGPD reçue \(S-0043\)/);
});

test('récapitulatif : réglé par chacun, vers 8 h, jamais plus d’un par jour, hebdomadaire le lundi, rien s’il n’y a rien', async t => {
  const c = await world(t);
  const ph = c.as('seb', ['photographe'], { authorId: c.seb, email: 'seb@example.org' });
  await ph.post('/admin/compte/notifications', { adresse: '', recap: 'daily' });
  assert.equal(c.app.accounts.bySub('seb').digest, 'daily');
  assert.match(await ph.get('/admin'), /<option value="daily" selected>/);
  const photo = c.db.prepare('SELECT id, title FROM photos WHERE author_id = ? LIMIT 1').get(c.seb);
  c.app.notes.add(photo.id, 'La légende a une faute.', { name: 'marc' });
  let clock = Date.parse('2026-10-19T05:30:00Z');                                         // lundi, 7 h 30 à Paris
  const r = createReminders({ db: c.db, accounts: c.app.accounts, todo: c.app.todo, mailer: c.app.mailer, siteName: () => 'Test', publicUrl: 'https://ex.org', now: () => clock });
  assert.equal(await r.digests(), 0);                                                    // avant 8 h
  clock = Date.parse('2026-10-19T08:00:00Z');
  assert.equal(await r.digests(), 1);
  assert.equal(c.sent[0].to, 'seb@example.org');
  assert.match(c.sent[0].subject, /Ce qui vous attend \(\d+\)/);
  assert.match(c.sent[0].text, /Remarque de marc[\s\S]*https:\/\/ex\.org\/admin\/photos\/\d+#remarques[\s\S]*Récapitulatif quotidien/);
  clock += 3 * 3600e3;
  assert.equal(await r.digests(), 0);                                                    // même jour
  clock += DAY;
  assert.equal(await r.digests(), 1);
  // Hebdomadaire : seulement le lundi.
  await ph.post('/admin/compte/notifications', { adresse: '', recap: 'weekly' });
  clock = Date.parse('2026-10-21T08:00:00Z');                                             // mercredi
  assert.equal(await r.digests(), 0);
  clock = Date.parse('2026-10-26T08:00:00Z');                                             // lundi
  assert.equal(await r.digests(), 1);
  // Rien qui attend : pas d'e-mail ; « jamais » : pas d'e-mail.
  c.db.prepare('UPDATE photo_notes SET done_at = 1').run();
  c.db.prepare("UPDATE accounts SET digest = 'daily', digest_sent_at = NULL WHERE sub = 'seb'").run();
  const before = c.sent.length;
  c.db.prepare("UPDATE photos SET status = 'published', title = 'Titre ' || id, title_en = 'T', title_de = 'T', city_id = 1").run();
  await r.digests();
  const quiet = c.sent.length === before || !/Remarque/.test(c.sent.at(-1).text);
  assert.ok(quiet);
  await ph.post('/admin/compte/notifications', { adresse: '', recap: 'off' });
  clock += DAY;
  const n = c.sent.length;
  await r.digests();
  assert.equal(c.sent.length, n);
});

test('e-mail de test : envoyé à l’adresse choisie ; adresse invalide refusée ; sans SMTP, le dire ; réservé aux comptes', async t => {
  const c = await world(t);
  const admin = c.as('root', ['admin'], { email: 'root@example.org' });
  const page = await admin.get('/admin/comptes');
  assert.match(page, /id="email"[\s\S]*value="root@example.org"/);
  const r = await admin.post('/admin/comptes/test-email', { adresse: 'moi@example.org' });
  assert.equal(r.statusCode, 303);
  assert.equal(c.sent.at(-1).to, 'moi@example.org');
  assert.match(c.sent.at(-1).subject, /E-mail de test/);
  await admin.post('/admin/comptes/test-email', { adresse: 'pas-une-adresse' });
  assert.equal(c.sent.length, 1);
  const ph = c.as('seb', ['photographe'], { authorId: c.seb });
  assert.equal((await ph.post('/admin/comptes/test-email', { adresse: 'x@example.org' })).statusCode, 403);
  // Le serveur de messagerie refuse : l'erreur est dite.
  c.app.mailer.send = async () => { const { MailError } = await import('../server/mailer.js'); throw new MailError('E-mail non envoyé : identifiants refusés par le serveur de messagerie.'); };
  const ko = await admin.post('/admin/comptes/test-email', { adresse: 'moi@example.org' });
  assert.match(decodeURIComponent(ko.cookies.find(x => x.name === 'flash')?.value || ''), /identifiants refusés/);
});

test('e-mail de test sans SMTP : refusé avec la raison, et la page le dit', async t => {
  const c = await world(t, { mail: false });
  const admin = c.as('root', ['admin'], { email: 'root@example.org' });
  assert.match(await admin.get('/admin/comptes'), /non configurés[\s\S]*SMTP_URL et MAIL_FROM/);
  const r = await admin.post('/admin/comptes/test-email', { adresse: 'moi@example.org' });
  assert.match(decodeURIComponent(r.cookies.find(x => x.name === 'flash')?.value || ''), /pas configuré/);
});
