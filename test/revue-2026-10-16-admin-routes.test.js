import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { createAdminRepo } from '../server/admin-repo.js';
import { createImportTracker } from '../server/imports.js';
import { translator } from '../server/admin-i18n.js';

// Non-régression de la revue du 16 octobre 2026, sous-système « admin-routes » (server/routes/admin.js et ce qu'il
// appelle) : fiche d'une photo vue d'un compte à plusieurs rôles (personnes, audience) ; lettre des cartes d'accord
// unique et stable ; suppression d'un photographe qui a encore des données ; circuit de publication (toute
// modification repasse devant le modérateur, mais seulement si quelque chose a changé ; « À valider » d'une page
// restée ouverte ; dépublier ou déprogrammer pour rien ; date impossible ; e-mails dans la langue du destinataire) ;
// traductions du relecteur ; clés « constructor » ou « __proto__ » ; listes d'identifiants bornées ; relance de
// l'horodatage limitée ; messages traduits (t.msg) sans déformer le texte saisi ; compteur Instagram de l'équipe ;
// cookie de message borné ; heure de Paris (journal, rythme des imports) ; import sans JavaScript et arrêt du serveur ;
// recherche de la photothèque ; couvertures des séries.

function multipart(parts) {
  const boundary = '----revue' + Math.random().toString(16).slice(2);
  const chunks = [];
  for (const p of parts) {
    const file = p.filename ? `; filename="${p.filename}"` : '';
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${file}\r\n\r\n`), Buffer.from(p.value), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'text/html' } };
}

// Message affiché après la redirection (cookie signé « flash »).
const flashOf = res => decodeURIComponent(res.cookies.find(c => c.name === 'flash')?.value || '');

async function world(t, opts = {}) {
  const sent = [];
  const ctx = await setup(t, { seeded: true, mailTransport: { sendMail: async m => { sent.push(m); } }, ...opts });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  // Un compte et sa session : rôles, photographe lié, adresse (e-mails choisis), langue (cookie, sans photographe).
  const as = (sub, roles, { authorId = null, email = null, lang = null } = {}) => {
    ctx.app.accounts.ensure({ sub, name: sub, email: email || '', roles });
    if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
    if (email) ctx.app.accounts.setNotify(sub, { on: true });
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token, ...(lang ? { admin_langue: lang } : {}) };
    return {
      csrf, cookies,
      get: url => ctx.app.inject({ url, cookies, headers: { accept: 'text/html' } }),
      getJson: url => ctx.app.inject({ url, cookies, headers: { accept: 'application/json' } }),
      post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
      json: (url, payload) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload }),
      form: (url, parts) => { const f = multipart([{ name: '_csrf', value: csrf }, ...parts]); return ctx.app.inject({ method: 'POST', url, cookies, headers: f.headers, payload: f.payload }); },
    };
  };
  const row = id => ctx.db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  const photosOf = a => ctx.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id').pluck().all(a);
  return { ...ctx, sent, seb, jul, as, row, photosOf };
}

// Photos de Sébastien en brouillon, prêtes (sans visage), proposées puis programmées par le modérateur.
async function scheduled(c, ids) {
  c.db.prepare("UPDATE photos SET status = 'draft', faces = 0, taken_on = '2026-10-13' WHERE author_id = ?").run(c.seb);
  const ph = c.as('seb', ['photographe'], { authorId: c.seb }), mod = c.as('marc', ['moderateur']);
  for (const id of ids) {
    await ph.post(`/admin/photos/${id}/proposer`);
    await mod.post(`/admin/photos/${id}/valider`, { quand: 'date', date: '2099-01-01T10:00' });
    assert.equal(c.row(id).review, 'programmee');
  }
  return { ph, mod };
}

// ---------- A063 : compte à plusieurs rôles ----------

test('fiche d’une photo d’un autre photographe (photographe + relecteur) : ni ses personnes, ni leurs raisons, ni son audience', async t => {
  const c = await world(t);
  const theirs = c.photosOf(c.jul)[0];
  const e = c.app.encounters.saveCard(null, { ref: 'J-0042', signed: 'on', scope_site: 'on', met_on: '2026-10-12', author_id: c.jul, name: 'Alice Secrète', email: 'alice@example.org' });
  c.db.prepare('UPDATE encounters SET refused = 1 WHERE id = ?').run(e);
  c.app.encounters.link(e, [theirs]);
  c.db.prepare('INSERT INTO stats_photos (day, photo_id, views) VALUES (?, ?, 4242)').run(c.app.stats.range(30).to, theirs);
  const both = c.as('seb', ['photographe', 'relecteur'], { authorId: c.seb });
  const fiche = await both.get(`/admin/photos/${theirs}`);
  assert.equal(fiche.statusCode, 200);                                                   // voir la photo : oui (relecteur)
  assert.doesNotMatch(fiche.body, /Alice Secrète|J-0042/);
  assert.doesNotMatch(fiche.body, /id="audience"/);
  assert.equal((await both.get(`/admin/rencontres/${e}`)).statusCode, 404);               // comme la fiche de la rencontre
  assert.doesNotMatch((await both.get('/admin/photos')).body, /J-0042/);                  // infobulle de la photothèque
  assert.doesNotMatch((await both.get('/admin')).body, /La photo du moment/);            // chiffres d'un autre photographe
  // Son propre photographe, lui, voit tout.
  const jul = c.as('jul', ['photographe'], { authorId: c.jul });
  const own = (await jul.get(`/admin/photos/${theirs}`)).body;
  assert.match(own, /Alice Secrète/);
  assert.match(own, /J-0042 refuse la publication/);
  assert.match(own, /id="audience"/);
  assert.match((await jul.get('/admin')).body, /La photo du moment/);
});

// ---------- A066 : lettre des cartes d'accord ----------

test('lettre des cartes : unique même laissée vide, puis enregistrée (changer l’adresse ne la change plus)', async t => {
  const c = await world(t);
  const admin = c.as('root', ['admin']);
  const refused = await admin.post('/admin/auteurs', { name: 'Simone' });
  assert.equal(refused.statusCode, 422);
  assert.match(refused.body, /La lettre S est déjà celle de Sébastien : choisissez-en une autre/);
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM authors WHERE slug = 'simone'").pluck().get(), 0);
  assert.equal((await admin.post('/admin/auteurs', { name: 'Simone', card_prefix: 'm' })).statusCode, 303);
  assert.equal(c.db.prepare("SELECT card_prefix FROM authors WHERE slug = 'simone'").pluck().get(), 'M');
  assert.equal((await admin.post('/admin/auteurs', { name: 'Simon', card_prefix: 'M' })).statusCode, 422);  // saisie : déjà prise
  await admin.post('/admin/auteurs', { name: 'Zoé' });
  assert.equal(c.db.prepare("SELECT card_prefix FROM authors WHERE slug = 'zoe'").pluck().get(), 'Z');      // vide : enregistrée
  // Julien (lettre jamais enregistrée) change d'adresse : il garde J, ses cartes imprimées restent les siennes.
  assert.equal((await admin.post(`/admin/auteurs/${c.jul}`, { name: 'Julien', slug: 'jules', card_prefix: '' })).statusCode, 303);
  assert.deepEqual(c.db.prepare('SELECT slug, card_prefix FROM authors WHERE id = ?').get(c.jul), { slug: 'jules', card_prefix: 'J' });
  // Sébastien enregistre sa fiche sans lettre : il garde la sienne (personne d'autre ne la prend).
  assert.equal((await admin.post(`/admin/auteurs/${c.seb}`, { name: 'Sébastien', slug: 'sebastien', card_prefix: '' })).statusCode, 303);
  assert.equal(c.db.prepare('SELECT card_prefix FROM authors WHERE id = ?').pluck().get(c.seb), 'S');
});

// ---------- A068 : suppression d'un photographe ----------

test('supprimer un photographe sans photo : refusé tant qu’il a des rencontres, des voyages ou un compte lié', async t => {
  const c = await world(t);
  const admin = c.as('root', ['admin']);
  await admin.post('/admin/auteurs', { name: 'Zoé' });
  const zoe = c.db.prepare("SELECT id FROM authors WHERE slug = 'zoe'").pluck().get();
  const enc = c.app.encounters.saveCard(null, { ref: 'Z-0001', met_on: '2026-10-12', author_id: zoe, name: 'Bob', email: 'bob@example.org' });
  const r1 = await admin.post(`/admin/auteurs/${zoe}/delete`);
  assert.equal(r1.statusCode, 303);
  assert.match(flashOf(r1), /Zoé a encore 1 rencontre\(s\)/);
  assert.equal(c.db.prepare('SELECT author_id FROM encounters WHERE id = ?').pluck().get(enc), zoe);
  assert.match((await admin.get('/admin/auteurs')).body, /Impossible pour l’instant : Zoé a encore 1 rencontre/);
  // Rencontre rattachée à Julien ; reste le compte lié.
  c.db.prepare('UPDATE encounters SET author_id = ? WHERE id = ?').run(c.jul, enc);
  c.as('zoe', ['photographe'], { authorId: zoe });
  assert.match(flashOf(await admin.post(`/admin/auteurs/${zoe}/delete`)), /Le compte « zoe » est lié à Zoé/);
  c.app.accounts.update(c.app.accounts.bySub('zoe').id, { authorId: null }, 'test');
  assert.match(flashOf(await admin.post(`/admin/auteurs/${zoe}/delete`)), /Auteur supprimé/);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM authors WHERE id = ?').pluck().get(zoe), 0);
});

// ---------- A012 et A070 : circuit de publication ----------

test('photo programmée : chaque modification (annulations, série, carte) repasse devant le modérateur', async t => {
  const c = await world(t);
  const [a, b, d, e, f, g] = c.photosOf(c.seb);
  const { ph } = await scheduled(c, [a, b, d, e, f, g]);
  const other = c.db.prepare('SELECT id FROM categories WHERE id != ? LIMIT 1').pluck().get(c.row(b).category_id);
  c.db.prepare("UPDATE photos SET city_id = 2988507, city_name = 'Paris', city_cc = 'FR', on_map = 0 WHERE id IN (?, ?)").run(e, f);
  assert.equal((await ph.json('/admin/photos/actions', { action: 'restore-fields', ids: [], map: { [a]: { place: 'Texte non relu', taken_on: '2001-01' } } })).statusCode, 200);
  assert.equal((await ph.json('/admin/photos/actions', { action: 'categories', ids: [], map: { [b]: other } })).statusCode, 200);
  assert.equal((await ph.post(`/admin/photos/${d}/serie`, { category_id: String(other) })).statusCode, 303);
  assert.equal((await ph.json('/admin/photos/actions', { action: 'map_on', ids: [e] })).statusCode, 200);
  assert.equal((await ph.json('/admin/photos/actions', { action: 'map_restore', ids: [], map: { [f]: 1 } })).statusCode, 200);
  for (const id of [a, b, d, e, f]) assert.deepEqual([id, c.row(id).review, c.row(id).publish_at], [id, 'proposee', null]);
  assert.match(c.db.prepare("SELECT message FROM photo_reviews WHERE photo_id = ? AND action = 'modifiee'").pluck().get(a), /à revoir/);
  // Garder la série actuelle, ou une action qui ne change rien : la date choisie par le modérateur tient.
  assert.equal((await ph.post(`/admin/photos/${g}/serie`, { garder: '1' })).statusCode, 303);
  await ph.json('/admin/photos/actions', { action: 'fields', ids: [g], place: '', taken_on: '' });
  await ph.json('/admin/photos/actions', { action: 'map_off', ids: [g] });
  assert.equal(c.row(g).review, 'programmee');
});

test('« Compléter et publier », fiche et textes renvoyés sans changement : la programmation tient', async t => {
  const c = await world(t);
  const [a, b] = c.photosOf(c.seb);
  const { ph } = await scheduled(c, [a, b]);
  const A = c.row(a), B = c.row(b);
  const lot = { ids: `${a},${b}`, [`title_${a}`]: A.title, [`category_id_${a}`]: String(A.category_id), [`place_${a}`]: A.place, [`taken_on_${a}`]: A.taken_on,
    [`title_${b}`]: 'Titre corrigé', [`category_id_${b}`]: String(B.category_id), [`place_${b}`]: B.place, [`taken_on_${b}`]: B.taken_on };
  assert.equal((await ph.post('/admin/photos/lot', lot)).statusCode, 303);
  assert.deepEqual([c.row(a).review, c.row(a).publish_at === A.publish_at], ['programmee', true]);   // pas touchée
  assert.equal(c.row(b).review, 'proposee');                                                        // modifiée
  // Fiche complète et textes seuls, renvoyés tels quels.
  const fiche = { title: A.title, slug: A.slug, category_id: String(A.category_id), author_id: String(A.author_id), place: A.place, taken_on: A.taken_on, legend: A.legend, status: 'draft' };
  assert.equal((await ph.post(`/admin/photos/${a}`, fiche)).statusCode, 303);
  assert.equal((await ph.post(`/admin/photos/${a}/textes`, { title: A.title, legend: A.legend })).statusCode, 303);
  assert.equal(c.row(a).review, 'programmee');
  await ph.post(`/admin/photos/${a}/textes`, { title: A.title, legend: 'Une autre légende' });
  assert.equal(c.row(a).review, 'proposee');
});

// ---------- A014 : traductions du relecteur ----------

test('relecteur : « textes seuls » enregistre les traductions, et un envoi partiel ne les efface pas', async t => {
  const c = await world(t);
  const rita = c.as('rita', ['relecteur']);
  const r = await rita.post('/admin/photos/1/textes', { title: 'Titre relu', title_en: 'Proofread title', title_de: 'Korrigierter Titel', legend_de: 'Legende DE', place_en: 'Place EN' });
  assert.equal(r.statusCode, 303);
  const p = c.row(1);
  assert.deepEqual([p.title, p.title_en, p.title_de, p.legend_de, p.place_en], ['Titre relu', 'Proofread title', 'Korrigierter Titel', 'Legende DE', 'Place EN']);
  await rita.post('/admin/photos/1/textes', { title: 'Titre relu deux fois' });
  assert.deepEqual([c.row(1).title, c.row(1).title_en], ['Titre relu deux fois', 'Proofread title']);
  // Toujours pas la série (plus que du texte).
  const cat = c.row(1).category_id;
  await rita.post('/admin/photos/1/textes', { title: 'x', category_id: String(cat === 1 ? 2 : 1) });
  assert.equal(c.row(1).category_id, cat);
});

// ---------- A069 : « À valider » d'une page restée ouverte ----------

test('« À valider » : une photo dont la proposition a été retirée entre-temps n’est pas publiée', async t => {
  const c = await world(t);
  c.db.prepare("UPDATE photos SET status = 'draft', faces = 0 WHERE author_id = ?").run(c.seb);
  const [a, b, d] = c.photosOf(c.seb);
  const ph = c.as('seb', ['photographe'], { authorId: c.seb }), mod = c.as('marc', ['moderateur']);
  for (const id of [a, b, d]) await ph.post(`/admin/photos/${id}/proposer`);
  await ph.post(`/admin/photos/${a}/retirer-proposition`);
  await mod.post(`/admin/photos/${d}/renvoyer`, { message: 'Recadrer' });
  const r = await mod.post('/admin/a-valider', { ids: [String(a), String(b), String(d)], quand: 'maintenant' });
  assert.deepEqual([c.row(a).status, c.row(b).status, c.row(d).status], ['draft', 'published', 'draft']);
  assert.equal(c.row(d).review, 'a_reprendre');
  assert.match(flashOf(r), /1 photo publiée\. 2 photos ne sont plus proposées : rien n’a été fait pour elles\./);
  // Plus rien de proposé : refus, et rien n'est publié.
  const r2 = await mod.post('/admin/a-valider', { ids: [String(a)], quand: 'maintenant' });
  assert.match(flashOf(r2), /"type":"error"/);
  assert.equal(c.row(a).status, 'draft');
});

// ---------- A074 et A079 : actions sans effet, date impossible ----------

test('dépublier ou déprogrammer une photo qui ne l’est plus : refusé ; date impossible : refusée, pas décalée', async t => {
  const c = await world(t);
  const [a] = c.photosOf(c.seb);
  const { mod } = await scheduled(c, [a]);
  await mod.post(`/admin/photos/${a}/deprogrammer`);
  const again = await mod.post(`/admin/photos/${a}/deprogrammer`);
  assert.match(flashOf(again), /Rien à annuler : la photo n’est pas programmée/);
  const r = await mod.post(`/admin/photos/${a}/depublier`, { raison: 'Doublon' });
  assert.match(flashOf(r), /Rien à dépublier : la photo n’est pas en ligne/);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM photo_notes WHERE photo_id = ?').pluck().get(a), 0);
  for (const date of ['2027-02-29T10:00', '2026-04-31T10:00']) {
    const v = await mod.post(`/admin/photos/${a}/valider`, { quand: 'date', date });
    assert.match(flashOf(v), /Choisissez une date et une heure/);
    assert.equal(c.row(a).publish_at, null);
  }
  await mod.post(`/admin/photos/${a}/valider`, { quand: 'date', date: '2028-02-29T10:00' });      // bissextile : acceptée
  assert.equal(new Date(c.row(a).publish_at).toISOString(), '2028-02-29T09:00:00.000Z');
});

// ---------- A078 : e-mails dans la langue du destinataire ----------

test('circuit : le photographe reçoit ses e-mails dans la langue de son admin ; en français, inchangés', async t => {
  const c = await world(t);
  c.db.prepare("UPDATE photos SET status = 'draft', faces = 0 WHERE author_id = ?").run(c.seb);
  c.db.prepare("UPDATE authors SET admin_lang = 'de' WHERE id = ?").run(c.seb);
  const [a, b] = c.photosOf(c.seb);
  const ph = c.as('seb', ['photographe'], { authorId: c.seb, email: 'seb@example.org' }), mod = c.as('marc', ['moderateur'], { email: 'marc@example.org' });
  await ph.post(`/admin/photos/${a}/proposer`, { message: 'Ma préférée' });
  assert.equal(c.sent.at(-1).to, 'marc@example.org');                                    // le modérateur : français
  assert.match(c.sent.at(-1).text, /seb propose « .+ » à la publication\.\nSon mot : Ma préférée/);
  await mod.post('/admin/a-valider', { ids: [String(a)], quand: 'maintenant' });
  assert.equal(c.sent.at(-1).to, 'seb@example.org');
  assert.match(c.sent.at(-1).subject, /Fotos veröffentlicht/);
  assert.match(c.sent.at(-1).text, /„.+“ ist veröffentlicht \(freigegeben von marc\)\./);
  await ph.post(`/admin/photos/${b}/proposer`);
  await mod.post(`/admin/photos/${b}/valider`, { quand: 'date', date: '2099-01-01T10:00' });
  assert.match(c.sent.at(-1).text, /wird am 1\. Januar 2099 um 10:00 veröffentlicht/);
});

// ---------- A015 : clés héritées d'Object.prototype ----------

test('« constructor », « __proto__ » ou « toString » dans un formulaire ou une adresse : ignorés, jamais d’erreur 500', async t => {
  const c = await world(t);
  const admin = c.as('root', ['admin']);
  const before = c.db.prepare("SELECT value FROM settings WHERE key = 'theme'").pluck().get();
  await admin.post('/admin/apparence', { theme: 'constructor', brand_mode: '__proto__' });
  assert.equal(c.db.prepare("SELECT value FROM settings WHERE key = 'theme'").pluck().get(), before);
  assert.notEqual(c.app.appearance.brand().mode, '__proto__');
  assert.equal((await admin.post('/admin/apparence/marque/constructor/delete')).statusCode, 404);
  // Tableau JSON : ignoré (la route répond en JSON à qui le demande, comme pour l'admin v2).
  assert.equal((await admin.json('/admin/apparence', { theme: ['nicephos-nuit'] })).statusCode, 200);
  assert.equal(c.app.appearance.themeId(), before ? JSON.parse(before) : 'atelier');
  // Un réglage déjà corrompu retombe sur le thème par défaut.
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('theme', '\"constructor\"') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  assert.equal(c.app.appearance.themeId(), 'atelier');
  const preview = await c.app.inject({ url: '/?theme=toString', cookies: admin.cookies });
  assert.ok(!preview.cookies.some(x => x.name === 'apercu_theme'));
  const ph = c.as('seb', ['photographe'], { authorId: c.seb });
  for (const periode of ['constructor', '__proto__', 'toString']) assert.equal((await ph.get(`/admin/statistiques?periode=${periode}`)).statusCode, 200);
  assert.equal((await ph.json('/admin/photos/actions', { action: 'constructor', ids: [c.photosOf(c.seb)[0]] })).statusCode, 400);
  assert.match((await ph.get('/admin/photos?statut=constructor')).body, new RegExp(`data-id="${c.photosOf(c.seb)[0]}"`));
});

// ---------- A064 : listes d'identifiants ----------

test('actions groupées : droit vérifié avant tout, liste bornée ; identifiants existants en une requête', async t => {
  const c = await world(t);
  const many = Array.from({ length: 6000 }, (_, i) => i + 1);
  assert.equal((await c.as('rita', ['relecteur']).json('/admin/photos/actions', { action: 'publish', ids: many })).statusCode, 403);
  const mod = c.as('marc', ['moderateur']);
  const r = await mod.json('/admin/photos/actions', { action: 'publish', ids: many });
  assert.equal(r.statusCode, 413);
  assert.match(r.json().error, /5000 au plus/);
  assert.match(flashOf(await mod.post('/admin/a-valider', { ids: many.map(String) })), /Trop de photos à la fois/);
  const repo = createAdminRepo(c.db);
  assert.deepEqual(repo.existingIds(['3', 1, 3, 99999, 'x', 2.5, null]), [3, 1]);
  assert.deepEqual(repo.existingIds(undefined), []);
});

// ---------- A065 : relance de l'horodatage ----------

test('« Réessayer maintenant » (horodatage) : une relance forcée toutes les 5 minutes au plus', async t => {
  const c = await world(t);
  const calls = [];
  const schedule = c.app.proofs.schedule.bind(c.app.proofs);
  c.app.proofs.schedule = opts => { if (opts?.retryNow) calls.push(opts); return schedule(opts); };
  const ph = c.as('seb', ['photographe'], { authorId: c.seb });
  assert.match(flashOf(await ph.post('/admin/preuves/reessayer')), /Horodatage relancé/);
  assert.match(flashOf(await ph.post('/admin/preuves/reessayer')), /déjà relancé il y a moins de 5 minutes/);
  assert.match(flashOf(await c.as('root', ['admin']).post('/admin/preuves/reessayer')), /déjà relancé/);
  assert.equal(calls.length, 1);
});

// ---------- A017 et A071 : messages traduits ----------

test('t.msg : le texte saisi n’est pas déformé, les morceaux de date le sont toujours, les raisons une à une', () => {
  const en = translator('en'), de = translator('de');
  assert.equal(en.msg('Proposition renvoyée au photographe : Jolie mais floue'), 'Proposal sent back to the photographer: Jolie mais floue');
  assert.equal(de.msg('Proposition renvoyée au photographe : Jolie mais floue'), 'Vorschlag an den Fotografen zurückgeschickt: Jolie mais floue');
  assert.equal(en.msg('à recadrer svp'), 'à recadrer svp');
  assert.equal(en.msg('Julien a encore 7 photo(s).'), 'Julien still has 7 photo(s).');
  assert.equal(de.msg('J-0142 n’a pas encore décidé'), 'J-0142 hat sich noch nicht entschieden');
  assert.equal(de.msg('En attente : trop d’appels à l’API Instagram. File en pause jusqu’à 14 h 30.'), 'Wartend: zu viele Aufrufe der Instagram-API. Warteschlange pausiert bis 14 h 30.');
  assert.equal(en.msg('Instagram : bloquée : J-0402 refuse la publication ; J-0403 n’a pas accepté Instagram.'), 'Instagram: blocked: J-0402 refuses publication ; J-0403 has not accepted Instagram.');
  assert.equal(de.msg('à vérifier : J-0401 n’a pas encore décidé. Confirmez depuis la fiche de la photo'), 'zu prüfen: J-0401 hat sich noch nicht entschieden. Bestätigen Sie auf der Seite des Fotos');
  assert.equal(en.msg('La personne photographiée refuse la publication (rencontre J-0042) : la photo reste en brouillon.'), 'The photographed person refuses publication (encounter J-0042): the photo stays a draft.');
});

test('admin en allemand : raisons « à vérifier », séries et photographes à supprimer, dans sa langue', async t => {
  const c = await world(t);
  const [p] = c.photosOf(c.jul);
  c.db.prepare("UPDATE photos SET status = 'draft', faces = 1, taken_on = '2026-10-12' WHERE id = ?").run(p);
  const e = c.app.encounters.saveCard(null, { ref: 'J-0401', met_on: '2026-10-12', author_id: c.jul, name: 'Alice' });
  c.app.encounters.link(e, [p]);
  const admin = c.as('root', ['admin'], { lang: 'de' });
  const r = await admin.post(`/admin/photos/${p}/status`, { status: 'published' });
  assert.match(flashOf(r), /ist zu prüfen \(J-0401 hat sich noch nicht entschieden\)/);
  const fiche = c.row(p);
  const form = await admin.post(`/admin/photos/${p}`, { title: fiche.title, slug: fiche.slug, category_id: String(fiche.category_id), author_id: String(fiche.author_id), status: 'published' });
  assert.equal(form.statusCode, 422);
  assert.match(form.body, /J-0401 hat sich noch nicht entschieden/);
  assert.doesNotMatch(form.body, /n’a pas encore décidé\)/);
  const serie = c.db.prepare('SELECT c.id, c.name FROM categories c WHERE EXISTS (SELECT 1 FROM photos WHERE category_id = c.id) LIMIT 1').get();
  assert.match(flashOf(await admin.post(`/admin/series/${serie.id}/delete`)), new RegExp(`Die Serie „${serie.name}“ enthält \\d+ Foto\\(s\\)`));
  assert.match(flashOf(await admin.post(`/admin/auteurs/${c.jul}/delete`)), /Julien hat noch \d+ Foto\(s\)/);
});

// ---------- A072 : compteur Instagram de l'équipe ----------

test('« Aujourd’hui » de l’équipe : un échec Instagram suivi d’un envoi annulé reste compté', async t => {
  const c = await world(t);
  const [p] = c.photosOf(c.seb);
  const add = status => c.db.prepare("INSERT INTO instagram_posts (photo_id, status, frame, created_at) VALUES (?, ?, 'white', ?)").run(p, status, Date.now());
  add('failed');
  add('cancelled');
  assert.ok(c.app.todo.list().some(i => /Instagram : 1 publication en échec/.test(i.title)));
  add('queued');                                                                                // remis en file : plus en échec
  assert.ok(!c.app.todo.list().some(i => /publication en échec/.test(i.title)));
});

// ---------- A073 et A077 : import sans JavaScript ----------

test('import sans JavaScript : message toujours lisible (cookie borné), images rendues en arrière-plan', async t => {
  const c = await world(t);
  const admin = c.as('root', ['admin']);
  const fields = [{ name: 'author_id', value: String(c.jul) }, { name: 'category_id', value: '1' }];
  const bad = Array.from({ length: 50 }, (_, i) => ({ name: 'photos', filename: `${'Très-long-nom-de-fichier-accentué-é'.repeat(3)}-${i}.heic`, value: 'pas une image' }));
  const r = await admin.form('/admin/photos/import', [...fields, ...bad]);
  assert.equal(r.statusCode, 303);
  const cookie = r.headers['set-cookie'].find(h => h.startsWith('flash='));
  assert.ok(cookie.length < 4000, `cookie de ${cookie.length} octets`);
  assert.match(flashOf(r), /0 photo\(s\) importée\(s\) en brouillon, 50 refusée\(s\)/);
  assert.match(flashOf(r), /… \(\+\d+\)/);
  // Une vraie photo : réponse aussitôt, brouillon créé, images calculées ensuite.
  const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#468' } }).png().toBuffer();
  const ok = await admin.form('/admin/photos/import', [...fields, { name: 'photos', filename: 'quai.png', value: png }]);
  assert.equal(ok.headers.location, '/admin/photos?statut=draft');
  assert.match(flashOf(ok), /1 photo\(s\) importée\(s\) en brouillon\. Images en cours de calcul/);
  const id = c.db.prepare("SELECT id FROM photos WHERE source_name = 'quai.png'").pluck().get();
  let state;
  for (let i = 0; i < 100 && state !== 'ready'; i++) {
    state = (await admin.getJson(`/admin/photos/traitement?ids=${id}`)).json().photos[0].state;
    if (state !== 'ready') await new Promise(res => setTimeout(res, 100));
  }
  assert.equal(state, 'ready');
});

// ---------- A076 : arrêt du serveur ----------

test('arrêt : le suivi d’import n’attend que les rendus en cours, pas toute la file', async () => {
  const started = [];
  let release;
  const tracker = createImportTracker({ concurrency: 1, render: async id => { started.push(id); await new Promise(r => { release = r; }); } });
  const done = [1, 2, 3].map(id => tracker.add(id, `${id}.jpg`));
  assert.deepEqual(started, [1]);
  tracker.stop();
  let idle = false;
  const waiting = tracker.idle().then(() => { idle = true; });
  await Promise.all(done.slice(1));                                    // les photos en attente ne bloquent plus personne
  assert.equal(idle, false);                                           // la photo en cours, si
  release();
  await waiting;
  assert.deepEqual(started, [1]);
  assert.equal(tracker.get(2).state, 'waiting');                       // rendue au prochain démarrage
});

// ---------- A075 et A081 : heure de Paris ----------

test('journal et rythme des imports : à l’heure de Paris', async t => {
  const c = await world(t);
  c.db.prepare("INSERT INTO audit_log (at, sub, name, action, target, status) VALUES (?, 'root', 'root', 'POST /admin/series', '', 303)").run(Date.UTC(2026, 6, 1, 12, 5));
  assert.match((await c.as('root', ['admin']).get('/admin/journal')).body, /01\/07\/2026 14:05/);
  const repo = createAdminRepo(c.db);
  c.db.prepare("UPDATE photos SET created_at = '2026-10-31 23:30:00' WHERE id = 1").run();       // 1er novembre, 0 h 30 à Paris
  const months = repo.importsByMonth(2, null, new Date('2026-10-31T23:45:00Z'));
  assert.deepEqual(months.map(m => m.month), ['2026-10', '2026-11']);
  assert.equal(months[1].n, 1);
});

// ---------- A080 : recherche de la photothèque ----------

test('photothèque : recherche sans accents, dans les mots-clés et les traductions', async t => {
  const c = await world(t);
  c.db.prepare("UPDATE photos SET title = 'Église Saint-Maurice' WHERE id = 1").run();
  c.db.prepare("UPDATE photos SET keywords = 'zorglub, pont' WHERE id = 2").run();
  c.db.prepare("UPDATE photos SET title_en = 'Mistybridge' WHERE id = 3").run();
  const repo = createAdminRepo(c.db);
  const ids = q => repo.photos({ q }).map(p => p.id);
  assert.ok(ids('eglise').includes(1));
  assert.ok(ids('ÉGLISE').includes(1));
  assert.deepEqual(ids('zorglub'), [2]);
  assert.deepEqual(ids('mistybridge'), [3]);
  assert.match((await c.as('root', ['admin']).get('/admin/photos?q=eglise')).body, /data-id="1"/);
});

// ---------- A067 : couvertures des séries ----------

test('couvertures des séries : la première photo publiée de chaque série, en une requête', async t => {
  const c = await world(t);
  const repo = createAdminRepo(c.db);
  const cat = c.row(1).category_id;
  c.db.prepare("UPDATE photos SET status = 'draft', position = -1 WHERE id = 1").run();             // brouillon en tête de série
  const covers = repo.covers();
  const expected = c.db.prepare("SELECT id FROM photos WHERE category_id = ? ORDER BY (status = 'published') DESC, position, id LIMIT 1").pluck().get(cat);
  assert.equal(covers[cat].id, expected);
  assert.notEqual(covers[cat].id, 1);
  assert.ok(!('rn' in covers[cat]));
  assert.equal(Object.keys(covers).length, c.db.prepare('SELECT COUNT(DISTINCT category_id) FROM photos').pluck().get());
});
