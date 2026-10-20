import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { parseRef, createEncounters } from '../server/encounters.js';
import { normTime } from '../server/outings.js';
import { createVault, LOCKED } from '../server/vault.js';
import { rightsDue, createReminders } from '../server/reminders.js';
import { transportOptions, maskAddresses } from '../server/mailer.js';
import fs from 'node:fs';
import { TEXTS } from '../server/cards.js';

// Non-régression de la revue du 16 octobre 2026, sous-système « rencontres et RGPD » : demandes sans code sur /bonjour
// (rencontre saisie sur le téléphone, demande de droits en cours, numérotation), portée « les miennes » (personne
// choisie dans l'app, lettre des cartes, « Ce n'est pas elle »), expressions régulières bornées, coffre (chiffré
// injecté), dates impossibles, saisie de carte, effacement et purge (visage, accord, trace anonyme de la sortie),
// relances (échéance d'un mois, plafond, récapitulatif sans nom), export sans données de tiers, historique lisible,
// écrans tendus à la personne, SMTP chiffré.
const KEY = 'cle-de-test-0123456789-abcdefghijklmnop';
const DAY = 864e5;

function multipart(parts) {
  const boundary = '----revue' + Math.random().toString(16).slice(2);
  const chunks = [];
  for (const p of parts) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'text/html' } };
}

async function world(t, opts = {}) {
  const sent = [];
  const ctx = await setup(t, { seeded: true, mailTransport: { sendMail: async m => { sent.push(m); } }, ...opts });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const as = (sub, roles, authorId = null, email = '') => {
    ctx.app.accounts.ensure({ sub, name: sub, email, roles });
    if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token };
    return {
      csrf,
      get: url => ctx.app.inject({ url, cookies, headers: { accept: 'text/html' } }),
      post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
      form: (url, fields) => { const f = multipart(Object.entries({ _csrf: csrf, ...fields }).map(([name, value]) => ({ name, value }))); return ctx.app.inject({ method: 'POST', url, cookies, headers: f.headers, payload: f.payload }); },
    };
  };
  let ip = 0;
  const hello = (payload, lang = '') => ctx.app.inject({ method: 'POST', url: `${lang}/bonjour`, payload, remoteAddress: `198.51.100.${(ip++ % 250) + 1}` });
  const row = ref => ctx.db.prepare('SELECT * FROM encounters WHERE ref IS ?').get(ref);
  const enc = ctx.app.encounters;
  return { ...ctx, sent, seb, jul, as, hello, row, enc };
}

test('A132 : référence et heure bornées avant l’expression régulière (aucun blocage sur 100 Ko d’espaces)', async t => {
  const long = ' '.repeat(100_000);
  let t0 = Date.now();
  assert.equal(parseRef(`J${long}!`), null);
  assert.equal(normTime(`1h${long}!`), null);
  assert.ok(Date.now() - t0 < 100, `trop lent : ${Date.now() - t0} ms`);
  // Les saisies normales restent comprises.
  assert.deepEqual(parseRef(' j 142 k7q '), { prefix: 'J', number: 142, ref: 'J-0142', code: 'K7Q' });
  assert.equal(normTime(' 9 h 05 '), '09:05');
  const c = await world(t);
  t0 = Date.now();
  const r = await c.hello({ ref: `J${long}!`, met_on: '2026-10-11', place: 'Nantes', decision: 'refus', met_time: `1h${'+'.repeat(30_000)}!` });
  assert.equal(r.statusCode, 422);
  assert.equal((await c.app.inject(`/bonjour/merci?ref=J${' '.repeat(15_000)}!`)).statusCode, 200);
  assert.ok(Date.now() - t0 < 1500, `trop lent : ${Date.now() - t0} ms`);
});

test('A034 : sans code, une rencontre saisie sur le téléphone (refus, « plus tard ») ne change pas ; un refus n’est jamais levé', async t => {
  const c = await world(t);
  const author = c.db.prepare('SELECT * FROM authors WHERE id = ?').get(c.jul);
  const refus = await c.enc.saveApp({ decision: 'refus', lang: 'fr' }, { author });
  const later = await c.enc.saveApp({ decision: '', email: 'vraie@exemple.fr', name: 'Vraie', wants_photo: 'on', lang: 'fr' }, { author });
  await c.hello({ ref: refus.ref, decision: 'accord', adult: 'oui', scope_site: 'on', scope_instagram: 'on', name: 'X', email: 'attaquant@exemple.fr' });
  let e = c.enc.get(refus.id);
  assert.deepEqual([e.refused, e.consent, e.email, e.name, e.status], [1, null, '', '', 'nouvelle']);
  assert.equal(c.enc.events(refus.id).at(-1).detail.non_verifiee, true);
  await c.hello({ ref: later.ref, decision: 'accord', adult: 'oui', scope_site: 'on', name: 'Autre', email: 'attaquant@exemple.fr' });
  e = c.enc.get(later.id);
  assert.deepEqual([e.email, e.name, e.consent], ['vraie@exemple.fr', 'Vraie', null]);
  // Avec le code du QR montré par l'app : la personne elle-même, son choix est appliqué.
  await c.hello({ ref: `${refus.ref}-${refus.code}`, decision: 'accord', adult: 'oui', scope_site: 'on', name: 'Zoé', email: 'zoe@exemple.fr' });
  e = c.enc.get(refus.id);
  assert.deepEqual([e.refused, e.consent_source, e.email], [0, 'en_ligne', 'zoe@exemple.fr']);
  // Carte au tampon (référence sans code) : la première demande est notée ; ensuite, sans code, ni l'adresse ni le
  // nom ne sont remplacés, et un accord ne lève pas le refus.
  await c.hello({ ref: 'J-0500', decision: 'refus', email: 'premiere@exemple.fr', name: 'Première' });
  await c.hello({ ref: 'J-0500', decision: 'accord', adult: 'oui', scope_site: 'on', email: 'seconde@exemple.fr', name: 'Seconde' });
  e = c.row('J-0500');
  assert.deepEqual([e.refused, e.consent, e.email, e.name], [1, null, 'premiere@exemple.fr', 'Première']);
});

test('A025 : une demande de droits en cours garde son type et son échéance ; e-mails des demandes non vérifiées plafonnés', async t => {
  const c = await world(t);
  c.as('root', ['admin'], null, 'root@example.org');
  const id = c.enc.saveCard(null, { ref: 'J-0042', signed: 'on', scope_site: 'on', met_on: '2026-10-01', author_id: c.jul, email: 'alice@exemple.fr' });
  const first = Date.now() - 14 * DAY;
  c.db.prepare("UPDATE encounters SET rights_request = 'effacement', rights_requested_at = ?, rights_reminders = 2 WHERE id = ?").run(first, id);
  await c.hello({ ref: 'J-0042', rights: 'acces', email: 'tiers@evil.example' });
  let e = c.row('J-0042');
  assert.deepEqual([e.rights_request, e.rights_requested_at, e.rights_reminders, e.rights_done_at], ['effacement', first, 2, null]);
  assert.equal(c.enc.events(id).at(-1).detail.rights, 'acces');                          // gardée dans l'historique
  // Traitée : une nouvelle demande repart (nouvelle échéance).
  c.enc.rightsDone(id);
  await c.hello({ ref: 'J-0042', rights: 'acces', email: 'tiers@evil.example' });
  e = c.row('J-0042');
  assert.equal(e.rights_request, 'acces');
  assert.ok(e.rights_requested_at > first);
  // Afflux de demandes d'effacement sans carte : 30 e-mails par jour au plus.
  c.db.prepare('UPDATE encounters SET rights_done_at = ? WHERE id = ?').run(Date.now(), id);
  const ins = c.db.prepare("INSERT INTO encounters (author_id, met_on, place, rights_request, rights_requested_at, created_at, updated_at) VALUES (?, '2026-10-10', 'Nantes', 'effacement', ?, ?, ?)");
  for (let i = 0; i < 35; i++) ins.run(c.jul, Date.now(), Date.now(), Date.now());
  c.sent.length = 0;
  assert.equal(await c.app.reminders.rights(), 30);
  assert.equal(await c.app.reminders.rights(), 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounters WHERE rights_reminders = 0 AND rights_done_at IS NULL').pluck().get(), 5);
  // Une demande sur une rencontre vérifiée part toujours.
  c.db.prepare('UPDATE encounters SET rights_done_at = NULL, rights_reminders = 0, rights_requested_at = ? WHERE id = ?').run(Date.now(), id);
  assert.equal(await c.app.reminders.rights(), 1);
});

test('A035 : l’app ne rattache qu’à une personne de ce photographe ; « Déjà rencontrée ? » et la recherche ne montrent que ses rencontres', async t => {
  const c = await world(t);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(Date.now());
  const julEnc = c.enc.saveCard(null, { ref: 'J-0042', signed: 'on', scope_site: 'on', met_on: today, author_id: c.jul, name: 'Alice Secret', email: 'alice@secret.example' });
  c.app.people.sync();
  const pid = c.db.prepare('SELECT person_id FROM encounters WHERE id = ?').pluck().get(julEnc);
  const seb = c.as('seb', ['photographe'], c.seb);
  const r = await seb.form('/admin/rencontre', { author_id: String(c.seb), person_id: String(pid), decision: 'refus', lang: 'fr' });
  assert.equal(r.statusCode, 303);
  const mine = c.db.prepare('SELECT * FROM encounters WHERE author_id = ? ORDER BY id DESC LIMIT 1').get(c.seb);
  c.app.people.sync();
  assert.notEqual(mine.person_id, pid);
  assert.equal(c.row('J-0042').refused, 0);                                               // le refus ne s'étend pas à Julien
  assert.equal((await seb.get(`/admin/personnes/${pid}`)).statusCode, 404);
  assert.doesNotMatch((await seb.get('/admin/rencontre')).body, /Alice|Secret/);
  // Personne partagée (rapprochée par l'administrateur) : Sébastien n'y lit que ce qu'il a noté.
  c.app.people.merge(pid, mine.person_id);
  const page = (await seb.get('/admin/rencontre')).body;
  assert.match(page, new RegExp(`<option value="${pid}">S-\\d{4} · `));
  assert.doesNotMatch(page, /Alice|Secret|J-0042/);
  // Recherche par l'adresse notée par Julien : rien pour Sébastien, la personne pour l'administrateur.
  assert.doesNotMatch((await seb.get('/admin/personnes?q=alice%40secret')).body, /personnes\/\d+"/);
  const root = c.as('root', ['admin']);
  assert.match((await root.get('/admin/personnes?q=alice%40secret')).body, new RegExp(`/admin/personnes/${pid}"`));
});

test('A036, A147 : une référence tapée sans code ne décale pas la numérotation ; cartes en réserve justes après le téléphone', async t => {
  const c = await world(t);
  const author = c.db.prepare('SELECT * FROM authors WHERE id = ?').get(c.jul);
  assert.equal((await c.hello({ ref: 'J-99999', decision: 'refus' })).statusCode, 422);    // 4 chiffres au plus, comme les cartes
  assert.equal((await c.hello({ ref: 'J-9999', decision: 'refus' })).statusCode, 303);
  assert.equal(c.enc.nextNumber('J'), 1);
  c.enc.reserve('J', 50);                                                                   // planche J-0001 à J-0050
  for (let n = 1; n <= 29; n++) c.enc.saveCard(null, { ref: `J-${String(n).padStart(4, '0')}`, author_id: c.jul });
  assert.equal(c.enc.cardsLeft('J'), 21);
  const app = await c.enc.saveApp({ decision: 'refus', lang: 'fr' }, { author });
  assert.equal(app.ref, 'J-0051');
  assert.equal(c.enc.cardsLeft('J'), 21);                                                  // le numéro de l'app n'était pas imprimé
  assert.equal(c.enc.nextNumber('J'), 52);
  // Un numéro déjà pris par une référence tapée sans code est sauté.
  await c.hello({ ref: 'J-0052', decision: 'refus' });
  assert.equal(c.enc.nextNumber('J'), 53);
  // Rencontre effacée : son numéro n'est jamais redonné.
  c.enc.erase(app.id);
  assert.equal(c.enc.nextNumber('J'), 53);
});

test('A133 : un photographe ne prend pas une référence à la lettre de l’autre ; jamais de rencontre sans photographe', async t => {
  const c = await world(t);
  const seb = c.as('seb', ['photographe'], c.seb);
  const r = await seb.form('/admin/rencontres', { ref: 'J-0500', author_id: String(c.seb) });
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /La lettre de la référence désigne un autre photographe/);
  assert.equal(c.row('J-0500'), undefined);
  assert.equal((await seb.form('/admin/rencontres', { name: 'Sans photographe' })).statusCode, 422);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounters WHERE author_id IS NULL').pluck().get(), 0);
  assert.equal((await seb.form('/admin/rencontres', { ref: 'S-0500', author_id: String(c.seb) })).statusCode, 303);
  assert.throws(() => c.enc.saveCard(null, { ref: 'S-0501', author_id: c.jul }), /La lettre de la référence désigne un autre photographe/);
});

test('A134 : effacer une personne qui refusait garde son refus pour les photos de sa sortie', async t => {
  const c = await world(t);
  const day = '2026-10-13';
  const photo = c.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').pluck().get(c.jul);
  c.db.prepare("UPDATE photos SET taken_on = ?, taken_time = '', faces_override = 1, status = 'published' WHERE id = ?").run(day, photo);
  c.enc.saveCard(null, { ref: 'J-0010', signed: 'on', scope_site: 'on', scope_instagram: 'on', met_on: day, author_id: c.jul });
  const refus = c.enc.saveCard(null, { ref: 'J-0011', met_on: day, author_id: c.jul });
  c.db.prepare('UPDATE encounters SET refused = 1, refused_at = ? WHERE id = ?').run(Date.now(), refus);
  const before = c.app.readiness.state(photo);
  assert.deepEqual([before.site.level, before.instagram.level], ['warn', 'no']);
  assert.deepEqual(c.enc.erase(refus), { anonymized: true });
  const trace = c.db.prepare('SELECT * FROM encounters WHERE id = ?').get(refus);
  assert.deepEqual([trace.ref, trace.name, trace.refused, trace.anonymized, trace.met_on], [null, '', 1, 1, day]);
  const after = c.app.readiness.state(photo);
  assert.deepEqual([after.site.level, after.instagram.level], ['warn', 'no']);
  assert.match(after.instagram.reasons.join(), /refus anonymisé refuse la publication/);
});

test('A135, A146 : un chiffré envoyé par /bonjour n’est jamais déchiffré ; sans la bonne clé, la fiche ne détruit pas les données', async t => {
  const c = await world(t, { env: { DATA_KEY: KEY } });
  const stolen = createVault(KEY).seal('Victime Secrete');
  await c.hello({ met_on: '2026-10-10', place: 'Angers', name: stolen, rights: 'acces', email: 'attaquant@exemple.fr' });
  const id = c.db.prepare('SELECT MAX(id) FROM encounters').pluck().get();
  assert.equal(c.enc.get(id).name, stolen);
  assert.doesNotMatch(JSON.stringify(c.enc.exportData(id).data), /Victime Secrete/);
  // Clé absente : le formulaire renvoie l'avertissement ; enregistré, il ne remplace pas le nom chiffré.
  const named = c.enc.saveCard(null, { ref: 'J-0300', author_id: c.jul, name: 'Alice Martin', place: 'Nantes', email: 'alice@exemple.fr' });
  const locked = createEncounters({ db: c.db, vault: createVault(null) });
  const shown = locked.get(named);
  assert.equal(shown.name, LOCKED);
  locked.saveCard(named, { ref: 'J-0300', author_id: String(c.jul), name: shown.name, place: shown.place, email: shown.email, details: shown.details, met_on: '2026-10-12' });
  const back = c.enc.get(named);
  assert.deepEqual([back.name, back.place, back.email, back.met_on], ['Alice Martin', 'Nantes', 'alice@exemple.fr', '2026-10-12']);
});

test('A136, A149, A016 : récapitulatif sans nom ; photographe sans droit prévenu de passer la main ; échéance d’un mois de date à date', async t => {
  const c = await world(t);
  c.as('root', ['admin'], null, 'root@example.org');
  c.db.prepare("UPDATE accounts SET digest = 'daily' WHERE sub = 'root'").run();
  c.as('seb', ['photographe'], c.seb, 'seb@example.org');
  const id = c.enc.saveCard(null, { ref: 'S-0042', signed: 'on', scope_site: 'on', met_on: '2026-10-12', author_id: c.seb, name: 'Alice Confidentielle' });
  c.db.prepare("UPDATE encounters SET rights_request = 'effacement', rights_requested_at = ? WHERE id = ?").run(Date.now(), id);
  await c.app.reminders.rights();
  const mail = c.sent.find(m => m.to === 'seb@example.org');
  assert.match(mail.text, /Votre compte ne peut ni exporter ni effacer ces données : prévenez dès maintenant l’administrateur/);
  c.sent.length = 0;
  const clock = Date.parse('2026-10-19T08:00:00Z');                                       // un lundi, 10 h à Paris
  await createReminders({ db: c.db, accounts: c.app.accounts, todo: c.app.todo, mailer: c.app.mailer, siteName: () => 'Test', now: () => clock }).digests();
  const digest = c.sent.find(m => m.to === 'root@example.org');
  assert.match(digest.text, /S-0042/);
  assert.doesNotMatch(digest.text, /Alice|Confidentielle/);
  assert.doesNotMatch(c.app.todo.list(undefined, null, { mail: true }).map(i => i.title).join(), /Alice/);
  assert.match(c.app.todo.list().map(i => i.title).join(), /S-0042 · Alice Confidentielle/);   // l'admin, lui, voit le nom
  // Un mois, de date à date, heure de Paris (dernier jour du mois s'il est plus court).
  const paris = ms => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(ms);
  assert.equal(paris(rightsDue(Date.parse('2027-02-01T09:00:00Z'))), '01/03/2027 10:00');
  assert.equal(paris(rightsDue(Date.parse('2027-01-31T09:00:00Z'))), '28/02/2027 10:00');
  assert.equal(paris(rightsDue(Date.parse('2028-01-31T09:00:00Z'))), '29/02/2028 10:00');
  assert.equal(paris(rightsDue(Date.parse('2026-10-01T08:00:00Z'))), '01/11/2026 10:00');  // heure d'été → heure d'hiver
  assert.equal(paris(rightsDue(Date.parse('2026-12-31T22:30:00Z'))), '31/01/2027 23:30');
  c.db.prepare('UPDATE encounters SET rights_requested_at = ?, rights_done_at = NULL WHERE id = ?').run(Date.parse('2027-02-01T09:00:00Z'), id);
  const root = c.as('root', ['admin']);
  assert.match((await root.get(`/admin/rencontres/${id}`)).body, /à traiter avant le <strong>1 mars 2027/);
});

test('A137, A145 : « Ce n’est pas elle » : seulement avec ses personnes ; le refus étendu par le rapprochement est levé', async t => {
  const c = await world(t);
  const a = c.enc.saveCard(null, { ref: 'J-0011', signed: 'on', scope_site: 'on', met_on: '2026-10-12', author_id: c.jul, email: 'p@exemple.fr' });
  const b = c.enc.saveCard(null, { ref: 'J-0012', met_on: '2026-10-13', author_id: c.jul, email: 'p@exemple.fr' });
  await c.hello({ ref: `J-0012-${c.enc.codeOf('J-0012')}`, decision: 'refus' });
  c.app.people.sync();
  const personOf = id => c.db.prepare('SELECT person_id FROM encounters WHERE id = ?').pluck().get(id);
  c.app.people.merge(personOf(b), personOf(a));
  assert.equal(c.enc.get(a).refused, 1);                                                    // étendu
  const pid = c.app.people.detach(a);
  assert.ok(pid);
  assert.deepEqual([c.enc.get(a).refused, c.enc.get(b).refused], [0, 1]);
  assert.equal(c.enc.events(a).at(-1).detail.leve, true);
  // Un photographe n'écarte pas un rapprochement avec une personne de l'autre.
  const theirs = c.enc.saveCard(null, { ref: 'J-0013', met_on: '2026-10-13', author_id: c.jul, email: 'q@exemple.fr' });
  const own = c.enc.saveCard(null, { ref: 'S-0013', met_on: '2026-10-13', author_id: c.seb, email: 'q@exemple.fr' });
  c.app.people.sync();
  const seb = c.as('seb', ['photographe'], c.seb);
  assert.equal((await seb.post(`/admin/personnes/${personOf(own)}/ecarter`, { autre: String(personOf(theirs)) })).statusCode, 403);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM people_distinct').pluck().get(), 1);      // seulement celui de detach
});

test('A138 : SMTP chiffré exigé hors relais local (délais vraiment appliqués) ; adresses masquées dans les journaux', () => {
  assert.equal(transportOptions('smtp://u:p@smtp.example.org:587').requireTLS, true);
  assert.equal(transportOptions('smtps://u:p@smtp.example.org:465').requireTLS, false);
  assert.equal(transportOptions('smtp://localhost:1025').requireTLS, false);
  assert.equal(transportOptions('smtp://u:p@smtp.example.org:587').connectionTimeout, 8000);
  assert.equal(maskAddresses('550 5.1.1 <alice@exemple.fr>: Recipient address rejected'), '550 5.1.1 <…@…>: Recipient address rejected');
});

test('A140 : date impossible refusée sur /bonjour et dans la fiche ; anciennes dates impossibles vidées par la migration', async t => {
  const c = await world(t);
  const r = await c.hello({ photographer: 'J', met_on: '2025-02-30', place: 'Angers', wants_photo: 'on', adult: 'oui', email: 'a@exemple.fr' });
  assert.equal(r.statusCode, 422);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounters').pluck().get(), 0);
  const id = c.enc.saveCard(null, { ref: 'J-0010', author_id: c.jul, met_on: '2026-00-10', session_day: '2025-02-29' });
  assert.deepEqual([c.row('J-0010').met_on, c.row('J-0010').session_day], ['', null]);
  // Données d'avant la correction : la migration les vide, et les pages ne cassent plus.
  c.db.prepare("UPDATE encounters SET met_on = '2025-02-30', session_day = '2026-13-01' WHERE id = ?").run(id);
  const sql = fs.readFileSync(new URL('../server/db/migrations/045_revue_rencontres_rgpd.sql', import.meta.url), 'utf8');
  for (const line of sql.split('\n').filter(l => l.startsWith('UPDATE'))) c.db.exec(line);
  assert.deepEqual([c.row('J-0010').met_on, c.row('J-0010').session_day], ['', null]);
  const root = c.as('root', ['admin']);
  assert.equal((await root.get(`/admin/rencontres/${id}`)).statusCode, 200);
  assert.equal((await root.get('/admin/sorties')).statusCode, 200);
});

test('A141, A155 : carte saisie sur une demande reçue : on complète ; case décochée : accord retiré ; refus jamais levé par la fiche', async t => {
  const c = await world(t);
  await c.hello({ ref: 'J-0005', wants_photo: 'on', adult: 'oui', email: 'alice@exemple.fr', name: 'Alice', place: 'Angers', met_on: '2026-10-11' });
  const id = c.enc.saveCard(null, { ref: 'J-0005', signed: 'on', scope_site: 'on' });
  let e = c.enc.get(id);
  assert.deepEqual([e.email, e.name, e.place, e.met_on, e.consent_source], ['alice@exemple.fr', 'Alice', 'Angers', '2026-10-11', 'carte']);
  // Refus exprimé depuis : réenregistrer la fiche (case toujours cochée) ne le lève pas.
  await c.hello({ ref: `J-0005-${c.enc.codeOf('J-0005')}`, decision: 'refus' });
  c.enc.saveCard(id, { ref: 'J-0005', signed: 'on', scope_site: 'on', scope_instagram: 'on', email: 'alice@exemple.fr' });
  e = c.enc.get(id);
  assert.deepEqual([e.refused, e.consent.instagram], [1, true]);
  // Accord papier saisi par erreur : décocher la case le retire.
  c.enc.saveCard(id, { ref: 'J-0005', email: 'alice@exemple.fr' });
  e = c.enc.get(id);
  assert.deepEqual([e.consent, e.consent_source], [null, null]);
  assert.equal(c.enc.events(id).at(-1).detail.retire, true);
  // Trace anonyme : ni formulaire, ni enregistrement.
  const photo = c.db.prepare('SELECT id FROM photos LIMIT 1').pluck().get();
  c.enc.link(id, [photo]);
  c.enc.erase(id);
  assert.throws(() => c.enc.saveCard(id, { signed: 'on', scope_site: 'on' }), /Refus anonymisé : cette trace ne se modifie pas/);
  assert.equal(c.db.prepare('SELECT refused FROM encounters WHERE id = ?').pluck().get(id), 1);
  const root = c.as('root', ['admin']);
  assert.doesNotMatch((await root.get(`/admin/rencontres/${id}`)).body, /name="signed"/);
});

test('A142, A143 : visage effacé 6 mois après un refus ; accord gardé 5 ans après la disparition de la dernière photo', async t => {
  const c = await world(t);
  const old = Date.now() - 200 * DAY;
  c.db.prepare(`INSERT INTO encounters (ref, author_id, consent, consent_source, refused, refused_at, portrait_jpeg, created_at, updated_at)
    VALUES ('J-0007', ?, '{"site":true}', 'carte', 1, ?, ?, ?, ?)`).run(c.jul, old, Buffer.from('visage'), old - DAY, old);
  c.db.prepare(`INSERT INTO encounters (ref, author_id, consent, consent_source, refused, refused_at, portrait_jpeg, created_at, updated_at)
    VALUES ('J-0008', ?, '{"site":true}', 'carte', 1, ?, ?, ?, ?)`).run(c.jul, Date.now() - 10 * DAY, Buffer.from('visage'), old, old);
  const veryOld = Date.now() - 6 * 365 * DAY;
  c.db.prepare(`INSERT INTO encounters (ref, author_id, consent, consent_source, created_at, updated_at) VALUES ('J-0009', ?, '{"site":true}', 'carte', ?, ?)`).run(c.jul, veryOld, veryOld);
  const photo = c.db.prepare('SELECT id FROM photos LIMIT 1').pluck().get();
  c.db.prepare("INSERT INTO encounter_photos (encounter_id, photo_id) SELECT id, ? FROM encounters WHERE ref = 'J-0009'").run(photo);
  c.enc.purge();
  assert.equal(c.row('J-0007').portrait_jpeg, null);                                       // refus de plus de 6 mois
  assert.ok(c.row('J-0008').portrait_jpeg);                                                 // refus récent : pas encore
  assert.ok(c.row('J-0009').photo_seen_at);
  c.db.prepare('DELETE FROM encounter_photos WHERE photo_id = ?').run(photo);
  c.enc.purge();
  assert.ok(c.row('J-0009'), 'accord gardé après la suppression de la dernière photo');
  c.db.prepare("UPDATE encounters SET photo_seen_at = ? WHERE ref = 'J-0009'").run(Date.now() - 5 * 366 * DAY);
  c.enc.purge();
  assert.equal(c.row('J-0009'), undefined);
});

test('A144, A157 : lire une rencontre ne déchiffre aucune image ; code mort retiré', async t => {
  const c = await world(t, { env: { DATA_KEY: KEY } });
  const vault = createVault(KEY);
  let opened = 0;
  const counting = { ...vault, openBuf: b => { opened++; return vault.openBuf(b); } };
  const enc = createEncounters({ db: c.db, vault: counting });
  const id = enc.saveCard(null, { ref: 'J-0400', author_id: c.jul, name: 'Léa' }, Buffer.from('carte'), Buffer.from('visage'));
  const e = enc.get(id);
  assert.deepEqual([e.name, e.hasCard, e.hasPortrait, e.hasSignature, opened], ['Léa', true, true, false, 0]);
  assert.equal(enc.list()[0].id, id);
  assert.equal(opened, 0);
  assert.deepEqual(enc.cardJpeg(id), Buffer.from('carte'));
  assert.equal(c.enc.remove, undefined);
  assert.equal(c.enc.refusalFor, undefined);
  assert.equal(c.app.people.ids, undefined);
  // Démarrage : seules les valeurs restées en clair sont chiffrées.
  c.db.prepare("INSERT INTO encounters (ref, email, created_at, updated_at) VALUES ('S-0001', 'ancien@exemple.fr', 1, 1)").run();
  assert.equal(c.enc.sealExisting() >= 1, true);
  assert.match(c.row('S-0001').email, /^enc1:/);
  assert.equal(c.enc.sealExisting(), 0);
});

test('A148 : la recherche des personnes passe avant la limite de 500 ; la liste d’un photographe avant la limite aussi', async t => {
  const c = await world(t);
  const old = c.enc.saveCard(null, { ref: 'S-0001', met_on: '2020-01-01', author_id: c.seb, name: 'Ancienne' });
  c.db.prepare('UPDATE encounters SET updated_at = 1 WHERE id = ?').run(old);
  const insP = c.db.prepare('INSERT INTO people (created_at, updated_at) VALUES (1, 1)');
  const insE = c.db.prepare('INSERT INTO encounters (author_id, person_id, met_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
  c.db.transaction(() => { for (let i = 0; i < 510; i++) { const p = insP.run().lastInsertRowid; insE.run(c.jul, p, '2026-10-01', Date.now(), Date.now() + i); } })();
  c.app.people.sync();
  assert.equal(c.app.people.list({ search: 'ancienne' }).length, 1);
  assert.equal(c.app.people.list({ search: 'S-0001', authorId: c.seb }).length, 1);
  assert.equal(c.app.people.list({ search: 'S-0001', authorId: c.jul }).length, 0);
  assert.ok(c.enc.list({ authorId: c.seb }).some(e => e.id === old));
  assert.ok(!c.enc.list().some(e => e.id === old));                                        // sans portée : les 500 plus récentes
});

test('A150, A151, A152 : historique lisible ; liens des photos nommés ; langues déclarées dans l’app et l’objet du message', async t => {
  const c = await world(t);
  const day = '2026-10-13';
  const photo = c.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').pluck().get(c.jul);
  c.db.prepare('UPDATE photos SET taken_on = ? WHERE id = ?').run(day, photo);
  const id = c.enc.saveCard(null, { ref: 'J-0600', signed: 'on', scope_site: 'on', met_on: day, author_id: c.jul, email: 'anna@exemple.de' });
  c.db.prepare("UPDATE encounters SET lang = 'de' WHERE id = ?").run(id);
  c.enc.exclude(id, photo, true);
  c.enc.exclude(id, photo, false);
  await c.hello({ ref: 'J-0600', decision: 'accord', adult: 'oui', scope_site: 'on', name: 'X', email: 'x@exemple.fr' });
  c.db.prepare("INSERT INTO encounter_events (encounter_id, at, kind, verified, detail) VALUES (?, ?, 'refus_personne', 0, '{}')").run(id, Date.now());
  const root = c.as('root', ['admin']);
  const page = (await root.get(`/admin/rencontres/${id}`)).body;
  assert.match(page, new RegExp(`Photo ${photo} exclue de l’accord de la sortie`));
  assert.match(page, /Refus étendu \(refus de la même personne lors d’une autre rencontre\)/);
  assert.match(page, /Sans le code de la carte : pas appliquée telle quelle/);
  assert.doesNotMatch(page, /<br>\s*(session|refus_personne)<\/li>/);
  assert.match(page, new RegExp(`<a href="/admin/photos/${photo}" aria-label="[^"]+">`));
  assert.match(page, /mailto:anna@exemple\.de\?subject=Ihr%20Foto%20\(J-0600\)%20%C2%B7%20Test/);
  const jul = c.as('jul', ['admin'], c.jul);
  const app = (await jul.get('/admin/rencontre')).body;
  assert.match(app, /<span data-l="en" lang="en">/);
  assert.match(app, /<legend class="sr-only">Décision<\/legend>/);
  assert.match((await jul.get('/admin/rencontre/qr')).body, /<span lang="de">Scannen Sie/);
});

test('A154, A156, A038 : cartes au nom de ce site ; export sans données de tiers ; écran « Merci » sans lien direct vers l’admin', async t => {
  const c = await world(t);
  const root = c.as('root', ['admin'], c.jul);
  const sheet = (await root.get(`/admin/rencontres/cartes/planche?auteur=${c.jul}&nombre=1&de=1`)).body;
  assert.match(sheet, /<span>site localhost:3000<\/span>/);                               // PUBLIC_URL de cette instance
  assert.doesNotMatch(sheet, /nicephos\.art/);
  assert.deepEqual(TEXTS.scopes('test.example')[0], 'site test.example');
  // Export : la demande d'un tiers (référence tapée sans code) n'y apporte ni son adresse, ni son nom, ni son message.
  const id = c.enc.saveCard(null, { ref: 'J-0142', signed: 'on', scope_site: 'on', author_id: c.jul, email: 'alice@exemple.fr', name: 'Alice' });
  await c.hello({ ref: 'J-0142', wants_photo: 'on', adult: 'oui', email: 'autre@exemple.org', name: 'Paul', message: 'Message de Paul' });
  const data = JSON.stringify(c.enc.exportData(id).data);
  assert.match(data, /alice@exemple\.fr/);
  assert.doesNotMatch(data, /autre@exemple\.org|Paul/);
  // Écran « Merci » tendu à la personne : les liens vers l'admin attendent que le photographe reprenne le téléphone.
  const author = c.db.prepare('SELECT * FROM authors WHERE id = ?').get(c.jul);
  const app = await c.enc.saveApp({ decision: 'refus', lang: 'fr' }, { author });
  const merci = (await root.get(`/admin/rencontre/${app.id}/merci`)).body;
  assert.match(merci, /<details class="app-next">\s*<summary>Photographe : reprendre le téléphone<\/summary>[\s\S]*href="\/admin\/rencontre\/accueil"[\s\S]*<\/details>/);
});
