import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Non-régression de la revue de code et de sécurité du 16 octobre 2026, partie « admin-front » (gabarits et scripts
// de l'admin) : ce que chaque rôle voit (mise à jour des images, propositions de séries, Instagram, audience,
// « Publier » d'Aujourd'hui, raisons des accords) ; fiche photo (« Décrire cette photo » dans son propre formulaire,
// échec affiché, légende dans la bonne langue) ; app Rencontre (photo et signature à refaire après une erreur) ;
// liens mailto encodés ; suppressions confirmées ; journal « refusé » ; signalements accessibles ; textes traduits.
async function world(t, opts = {}) {
  const ctx = await setup(t, { seeded: true, ...opts });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  const jul = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const as = (sub, roles, authorId = null) => {
    ctx.app.accounts.ensure({ sub, name: sub, roles });
    if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token };
    return {
      csrf,
      get: (url, accept = 'text/html') => ctx.app.inject({ url, cookies, headers: { accept } }),
      post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
      json: (url, payload) => ctx.app.inject({ method: 'POST', url, cookies, headers: { accept: 'application/json', 'x-csrf-token': csrf }, payload }),
      // Envoi multipart (app Rencontre), avec une photo facultative.
      multipart: (url, fields, file = null) => {
        const boundary = '----t' + Math.random().toString(16).slice(2);
        const parts = Object.entries({ _csrf: csrf, ...fields }).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
        if (file) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="portrait"; filename="IMG_1.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`), file, Buffer.from('\r\n'));
        parts.push(Buffer.from(`--${boundary}--\r\n`));
        return ctx.app.inject({ method: 'POST', url, cookies, payload: Buffer.concat(parts), headers: { accept: 'text/html', 'content-type': `multipart/form-data; boundary=${boundary}` } });
      },
    };
  };
  const photoOf = a => ctx.db.prepare('SELECT * FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').get(a);
  return { ...ctx, seb, jul, as, photoOf };
}

test('mise à jour des images : titres en échec et suivi réservés à qui règle le filigrane', async t => {
  const c = await world(t);
  await c.app.ready();                                      // le passage de démarrage est fait : il ne videra plus les erreurs
  const theirs = c.photoOf(c.jul);
  c.db.prepare('UPDATE photos SET title = ? WHERE id = ?').run('Titre-secret-de-Julien', theirs.id);
  fs.renameSync(path.join(c.dir, 'originals', theirs.file), path.join(c.dir, 'originals', `${theirs.file}.absent`));
  c.app.variants.schedule({ force: true });
  await c.app.variants.idle();
  assert.equal(c.app.variants.status().errors[0]?.title, 'Titre-secret-de-Julien');
  for (const [sub, roles, author] of [['seb', ['photographe'], c.seb], ['modo', ['moderateur']], ['relu', ['relecteur']]]) {
    const body = (await c.as(sub, roles, author).get('/admin')).body;
    assert.doesNotMatch(body, /Titre-secret-de-Julien/, sub);
    assert.doesNotMatch(body, /data-variants/, sub);                                 // pas de suivi qui recevrait un refus
  }
  const admin = (await c.as('chef', ['admin']).get('/admin')).body;
  assert.match(admin, /data-variants[\s\S]*Titre-secret-de-Julien/);
});

test('page Séries : le panneau des propositions (et son suivi) seulement avec series.propositions', async t => {
  const c = await world(t);
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('series_suggest', 'true') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  const modo = await c.as('modo', ['moderateur']).get('/admin/series');
  assert.equal(modo.statusCode, 200);
  assert.doesNotMatch(modo.body, /data-suggest-state/);
  assert.doesNotMatch(modo.body, /action="\/admin\/series\/propositions"/);
  const admin = (await c.as('chef', ['admin']).get('/admin/series')).body;
  assert.match(admin, /data-suggest-state="[a-z]+"/);
  assert.match(admin, /action="\/admin\/series\/propositions"/);
  // Le suivi (admin.js) ne recharge plus la page sur une réponse sans état, et s'arrête sur un refus.
  const js = fs.readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
  assert.match(js, /fetch\('\/admin\/series\/propositions'[^\n]*\n[^\n]*res\.status >= 500[^\n]*\n\s*if \(!res\.ok\) return;/);
});

test('fiche photo : « Décrire cette photo » dans son propre formulaire ; échec affiché ; légende dans la bonne langue', async t => {
  const c = await world(t);
  c.app.describer.save({ on: true });
  const p = c.photoOf(c.seb);
  const admin = c.as('chef', ['admin'], c.seb);                                     // langue gardée sur son photographe
  const page = (await admin.get(`/admin/photos/${p.id}`)).body;
  const main = page.slice(page.indexOf(`<form class="panel form" method="post" action="/admin/photos/${p.id}"`));
  const mainForm = main.slice(0, main.indexOf('</form>'));
  // Le premier bouton d'envoi du formulaire d'édition est « Enregistrer » : Entrée enregistre la fiche.
  assert.doesNotMatch(mainForm, /formaction=/);
  assert.match(mainForm, /<button class="btn ghost sm" type="submit" form="desc-form">Décrire cette photo<\/button>/);
  const desc = page.indexOf(`<form id="desc-form" method="post" action="/admin/photos/${p.id}/description" hidden>`);
  assert.ok(desc > page.indexOf(mainForm) + mainForm.length, 'formulaire dédié, après (hors de) celui de la fiche');
  // La route n'enregistre rien d'autre : seul le jeton part avec ce formulaire.
  assert.match(page.slice(desc, page.indexOf('</form>', desc) + 7), /^<form[^>]*><input type="hidden" name="_csrf" value="[^"]+"><\/form>$/);
  // Variante « textes seuls » (relecteur) : même formulaire dédié.
  const texts = (await c.as('relu', ['relecteur']).get(`/admin/photos/${p.id}`)).body;
  assert.match(texts, /type="submit" form="desc-form">Décrire cette photo/);
  assert.match(texts, /<form id="desc-form"/);
  assert.doesNotMatch(texts, /formaction="\/admin\/photos\/\d+\/description"/);
  // Échec du modèle : la raison est affichée (et non « pas encore calculée » seule), avec les mots de la revue ml-geo ;
  // un nouvel essai raté sous une description déjà faite est signalé à côté d'elle.
  c.db.prepare('INSERT INTO photo_descriptions (photo_id, requested_at, error) VALUES (?, NULL, ?)').run(p.id, 'image illisible');
  assert.match((await admin.get(`/admin/photos/${p.id}`)).body, /<span data-desc-text>Dernier essai sans succès : image illisible<\/span>/);
  c.db.prepare("UPDATE photo_descriptions SET text_en = 'A test photo.' WHERE photo_id = ?").run(p.id);
  assert.match((await admin.get(`/admin/photos/${p.id}`)).body, /« A test photo\. »<\/span>[^\n]*<span class="err">Dernier essai sans succès : image illisible<\/span>/);
  // Sans traducteur : la phrase anglaise va dans la légende anglaise, jamais dans la française.
  c.db.prepare("UPDATE photo_descriptions SET text_en = 'A test photo.', error = NULL WHERE photo_id = ?").run(p.id);
  const en = (await admin.get(`/admin/photos/${p.id}`)).body;
  assert.match(en, /data-desc-use="A test photo\." data-desc-field="legend_en"[^>]*>Reprendre comme légende anglaise</);
  // Traduite : la version française va dans la légende française, même quand l'admin est en anglais.
  c.db.prepare("UPDATE photo_descriptions SET text_fr = 'Une photo de test.', text_de = 'Ein Testfoto.' WHERE photo_id = ?").run(p.id);
  await admin.post('/admin/langue', { lang: 'en', back: '/admin' });
  const fr = (await admin.get(`/admin/photos/${p.id}`)).body;
  assert.match(fr, /« A test photo\. »/);                                         // affichée dans la langue de l'admin
  assert.match(fr, /data-desc-use="Une photo de test\." data-desc-field="legend"/);   // reprise en français
});

test('app Rencontre : après une erreur du serveur, l’écran dit que la photo et la signature sont à refaire', async t => {
  const c = await world(t);
  const ph = c.as('seb', ['photographe'], c.seb);
  const signature = `data:image/png;base64,${(await sharp({ create: { width: 600, height: 180, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer()).toString('base64')}`;
  const portrait = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#887766' } }).jpeg().toBuffer();
  // Accord signé, photo prise, « majeure » oubliée : les deux sont à refaire, et l'écran le dit.
  let r = await ph.multipart('/admin/rencontre', { decision: 'accord', scope_site: 'on', name: 'Eve', signature, author_id: c.seb }, portrait);
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /Indiquez si la personne est majeure\.[\s\S]*Faites signer de nouveau la personne et reprenez sa photo/);
  assert.match(r.body, /class="app-photo redo"/);
  assert.match(r.body, /class="app-sign redo"/);
  assert.doesNotMatch(r.body, /style="/);
  // Refus avec une adresse refusée par le serveur : seulement la photo.
  r = await ph.multipart('/admin/rencontre', { decision: 'refus', email: 'bob@exemple', author_id: c.seb }, portrait);
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /Reprenez la photo de la personne : elle n’est pas gardée après une erreur\./);
  assert.doesNotMatch(r.body, /Faites signer/);
  // Rien de perdu : pas de mention.
  r = await ph.multipart('/admin/rencontre', { decision: 'accord', scope_site: 'on', author_id: c.seb });
  assert.equal(r.statusCode, 422);
  assert.doesNotMatch(r.body, /app-redo|class="app-(photo|sign) redo"/);
  // L'écran du téléphone vérifie avant l'envoi les mêmes règles (app.js), dans la langue de l'admin.
  const js = fs.readFileSync(new URL('../public/admin/app.js', import.meta.url), 'utf8');
  for (const m of ['Indiquez si la personne est majeure.', 'La signature manque.', 'Cochez au moins un usage accepté.']) assert.ok(js.includes(`'${m}': { en:`), m);
  assert.match(js, /if \(list\.length\) \{ e\.preventDefault\(\); return; \}\n\s*if \(drawn\)/);       // vérifié avant de bloquer le bouton
});

test('contrastes (WCAG 1.4.11) : bord des champs et champ actif ≥ 3:1 dans les deux modes ; app Rencontre aussi', () => {
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = rgb => { const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const css = fs.readFileSync(new URL('../public/admin/admin.css', import.meta.url), 'utf8');
  const vars = block => Object.fromEntries([...block.matchAll(/--([\w-]+): (#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
  const dark = vars(css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {'))));
  const lightStart = css.indexOf(':root[data-theme="light"] {');
  const light = { ...dark, ...vars(css.slice(lightStart, css.indexOf('}', lightStart))) };
  for (const [mode, v] of [['sombre', dark], ['clair', light]]) {
    for (const bg of ['s1', 's2']) {
      assert.ok(ratio(v['field-line'], v[bg]) >= 3, `bord des champs sur --${bg} (${mode})`);
      assert.ok(ratio(v['accent-ink'], v[bg]) >= 3, `champ actif sur --${bg} (${mode})`);
    }
  }
  assert.match(css, /select, textarea \{\n[^}]*box-shadow: inset 0 0 0 1px var\(--field-line\)/);
  assert.match(css, /input:focus, select:focus, textarea:focus \{ outline: none; box-shadow: inset 0 0 0 2px var\(--accent-ink\)/);
  const app = fs.readFileSync(new URL('../public/admin/app.css', import.meta.url), 'utf8');
  const field = /--field: (#[0-9a-f]{6})/.exec(app)[1];
  for (const bg of ['#ffffff', '#f6f4ef']) assert.ok(ratio(field, bg) >= 3, `champ de l’app sur ${bg}`);
  assert.match(app, /select \{ [^}]*border: 1px solid var\(--field\)/);
});

// Fonction de premier niveau de public/admin/admin.js, exécutée seule (sans navigateur).
function adminFunction(name, deps = {}) {
  const js = fs.readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
  const start = js.indexOf(`function ${name}(`);
  const src = js.slice(start, js.indexOf('\n}\n', start) + 2);
  return new Function(...Object.keys(deps), `${src}; return ${name};`)(...Object.values(deps));
}

test('listes déroulantes qui agissent : au clavier, les flèches n’appliquent rien ; Entrée ou la sortie appliquent', () => {
  const onPick = adminFunction('onPick');
  const fake = value => Object.assign(new EventTarget(), { value });
  const ev = (type, extra = {}) => Object.assign(new Event(type, { cancelable: true }), extra);
  // Au clavier (Windows : « change » à chaque flèche) : rien jusqu'à Entrée.
  let s = fake('1');
  let acts = [];
  onPick(s, () => acts.push(s.value));
  s.dispatchEvent(ev('focus'));
  for (const v of ['2', '3']) { s.dispatchEvent(ev('keydown', { key: 'ArrowDown' })); s.value = v; s.dispatchEvent(ev('change')); }
  assert.deepEqual(acts, []);
  s.dispatchEvent(ev('keydown', { key: 'Enter' }));
  assert.deepEqual(acts, ['3']);
  s.dispatchEvent(ev('blur'));
  assert.deepEqual(acts, ['3']);                                         // déjà appliqué : pas deux fois
  // Au clavier, puis Tab : appliqué en quittant la liste.
  s = fake('a'); acts = [];
  onPick(s, () => acts.push(s.value));
  s.dispatchEvent(ev('focus'));
  s.dispatchEvent(ev('keydown', { key: 'ArrowDown' })); s.value = 'b'; s.dispatchEvent(ev('change'));
  s.dispatchEvent(ev('blur'));
  assert.deepEqual(acts, ['b']);
  // Au pointeur : dès le choix.
  s = fake('a'); acts = [];
  onPick(s, () => acts.push(s.value));
  s.dispatchEvent(ev('focus'));
  s.dispatchEvent(ev('pointerdown'));
  s.value = 'c'; s.dispatchEvent(ev('change'));
  assert.deepEqual(acts, ['c']);
  // Filtres (rechargement) : jamais en quittant la liste.
  s = fake('x'); acts = [];
  onPick(s, () => acts.push(s.value), { onBlur: false });
  s.dispatchEvent(ev('focus'));
  s.dispatchEvent(ev('keydown', { key: 'ArrowDown' })); s.value = 'y'; s.dispatchEvent(ev('change'));
  s.dispatchEvent(ev('blur'));
  assert.deepEqual(acts, []);
  // Branchée sur les filtres, le photographe de l'inspecteur, et les séries de « Compléter le lot ».
  const js = fs.readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
  assert.match(js, /onPick\(s, \(\) => form\.requestSubmit\(\), \{ onBlur: false \}\)/);
  assert.match(js, /if \(f\.matches\('select'\)\) onPick\(f, \(\) => saveOne\(k/);
  assert.match(js, /if \(f\.matches\('select'\)\) onPick\(f, commit\)/);
  assert.match(js, /onPick\(catSelect, \(\) => \{ if \(catSelect\.value && catSelect\.value !== 'new'\) apply\('category'/);
});

test('suppression d’un voyage ou d’un compte : derrière une étape de confirmation, bouton qui les nomme', async t => {
  const c = await world(t);
  const admin = c.as('chef', ['admin']);
  await admin.post('/admin/voyages', { name: 'Maroc 2025', author_id: '' });
  const trip = c.db.prepare('SELECT * FROM trips ORDER BY id DESC LIMIT 1').get();
  const page = (await admin.get(`/admin/voyages/${trip.id}`)).body;
  assert.match(page, new RegExp(`<details class="danger">\\s*<summary>Supprimer ce voyage</summary>[\\s\\S]*?<form method="post" action="/admin/voyages/${trip.id}/supprimer">[^]*?<button class="btn danger" type="submit">Supprimer « Maroc 2025 »</button></form>\\s*</details>`));
  c.as('autre', ['relecteur']);
  const accounts = (await admin.get('/admin/comptes')).body;
  const other = c.app.accounts.bySub('autre');
  assert.match(accounts, new RegExp(`<details class="danger acc-del">\\s*<summary>Supprimer ce compte</summary>[\\s\\S]*?action="/admin/comptes/${other.id}/supprimer">[^]*?<button class="btn danger" type="submit">Supprimer le compte « autre »</button>`));
  assert.doesNotMatch(accounts, /<button class="linkbtn" type="submit">Supprimer ce (compte|voyage)/);
});

test('liens mailto : l’adresse d’un visiteur est encodée, elle ne peut pas ajouter de destinataire caché ni de texte', async t => {
  const c = await world(t);
  const evil = 'moi@ex.fr?bcc=pirate%40evil.example&body=Cliquez%20ici&x=.aa';
  const p = c.db.prepare("SELECT * FROM photos WHERE status = 'published' ORDER BY id LIMIT 1").get();
  c.app.feedback.report(p.id, { kind: 'inapproprie', email: evil });
  const admin = c.as('chef', ['admin']);
  const reports = (await admin.get('/admin/signalements')).body;
  const href = /href="(mailto:[^"]+)"/.exec(reports)[1].replace(/&amp;/g, '&');
  assert.equal(new URL(href).searchParams.get('bcc'), null);
  assert.equal(new URL(href).searchParams.get('body'), null);
  assert.equal(decodeURIComponent(href.slice('mailto:'.length)), evil);         // l'adresse reste celle saisie
  // Rencontre envoyée depuis /bonjour : « Écrire » garde son sujet, sans copie cachée.
  const { id } = c.app.encounters.submit({ met_on: '2026-10-10', place: 'Angers', wants_photo: 'on', email: evil });
  const page = (await admin.get(`/admin/rencontres/${id}`)).body;
  const write = new URL(/href="(mailto:[^"]+)">Écrire</.exec(page)[1].replace(/&amp;/g, '&'));
  assert.equal(write.searchParams.get('bcc'), null);
  assert.match(write.searchParams.get('subject'), /^Votre photo/);
  // Une adresse ordinaire reste lisible.
  c.app.feedback.report(p.id, { kind: 'inapproprie', email: 'jean.dupont@exemple.fr' });
  assert.match((await admin.get('/admin/signalements')).body, /href="mailto:jean\.dupont@exemple\.fr"/);
});

test('erreurs Instagram : qui ne voit pas les personnes n’y lit ni la référence de carte ni la raison de l’accord', async t => {
  const c = await world(t);
  const p = c.db.prepare("SELECT id FROM photos WHERE status = 'published' AND author_id = ? ORDER BY id LIMIT 1").pluck().get(c.jul);
  c.app.instagram.enqueue(p);
  const id = c.app.encounters.saveCard(null, { ref: 'J-0042', signed: 'on', scope_site: 'on', author_id: c.jul });   // pas Instagram
  c.app.encounters.link(id, [p]);                                                   // la photo sort de la file, en échec
  assert.match(c.db.prepare('SELECT error FROM instagram_posts WHERE photo_id = ?').pluck().get(p), /^bloquée : J-0042/);
  const modo = c.as('modo', ['moderateur']);
  const page = (await modo.get('/admin/instagram')).body;
  assert.doesNotMatch(page, /J-0042/);
  assert.match(page, /bloquée par un accord \(détail réservé au photographe et aux administrateurs\)/);
  assert.match(page, /Sortie de la file : bloquée par un accord/);                 // journal
  const fiche = (await modo.get(`/admin/photos/${p}`)).body;
  assert.doesNotMatch(fiche, /J-0042/);
  assert.match(fiche, /Échec de la publication : bloquée par un accord/);
  // L'administrateur (et le photographe sur sa fiche) gardent le détail.
  assert.match((await c.as('chef', ['admin']).get('/admin/instagram')).body, /bloquée : J-0042 n’a pas accepté Instagram/);
  assert.match((await c.as('jul', ['photographe'], c.jul).get(`/admin/photos/${p}`)).body, /J-0042 n’a pas accepté Instagram/);
});

test('Aujourd’hui : « Publier » seulement pour qui publie et pour une photo prête ; sinon Proposer, Vérifier ou Voir', async t => {
  const c = await world(t);
  const [a, b] = c.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id LIMIT 2').pluck().all(c.seb);
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id IN (?, ?)").run(a, b);
  const id = c.app.encounters.saveCard(null, { ref: 'S-0042', signed: 'on', scope_site: 'on', author_id: c.seb });
  c.db.prepare('UPDATE encounters SET refused = 1 WHERE id = ?').run(id);
  c.app.encounters.link(id, [b]);                                                   // b : bloquée par un refus
  const form = x => new RegExp(`action="/admin/photos/${x}/status"`);
  const ph = (await c.as('seb', ['photographe'], c.seb).get('/admin')).body;           // ne publie pas : propose
  assert.doesNotMatch(ph, form(a));
  assert.match(ph, new RegExp(`href="/admin/photos/${a}#publication">Proposer<`));
  const admin = (await c.as('chef', ['admin']).get('/admin')).body;
  assert.match(admin, form(a));
  assert.doesNotMatch(admin, form(b));
  assert.match(admin, new RegExp(`href="/admin/photos/${b}">[^<]+</a><small>brouillon, bloqué par un accord`));
  assert.match(admin, new RegExp(`href="/admin/photos/${a}">[^<]+</a><small>brouillon, prêt à publier`));
});

test('page Instagram : connexion, déconnexion, relevé et réglages réservés à instagram.compte', async t => {
  const c = await world(t);
  const modo = (await c.as('modo', ['moderateur']).get('/admin/instagram')).body;
  for (const re of [/action="\/admin\/instagram\/reglages"/, /href="\/admin\/instagram\/connexion"/, /action="\/admin\/instagram\/deconnexion"/, /action="\/admin\/instagram\/likes"/, /href="#reglages"/]) assert.doesNotMatch(modo, re);
  assert.match(modo, /Le compte et les réglages Instagram sont gérés par un administrateur\./);
  const admin = (await c.as('chef', ['admin']).get('/admin/instagram')).body;
  assert.match(admin, /action="\/admin\/instagram\/reglages"/);
  assert.match(admin, /href="#reglages"/);
});

test('Compléter le lot : au-delà de 200 photos, la page le dit et mène aux suivantes', async t => {
  const c = await world(t);
  const row = c.db.prepare('SELECT * FROM photos ORDER BY id LIMIT 1').get();
  delete row.id;
  const cols = Object.keys(row);
  const insert = c.db.prepare(`INSERT INTO photos (${cols.join(', ')}) VALUES (${cols.map(k => `@${k}`).join(', ')})`);
  const ids = c.db.transaction(() => Array.from({ length: 205 }, (_, i) => Number(insert.run({ ...row, slug: `lot-${i}`, file: `lot-${i}.jpg`, sha256: `${i}`.padStart(64, '0') }).lastInsertRowid)))();
  const admin = c.as('chef', ['admin']);
  const page = (await admin.get(`/admin/photos/lot?ids=${ids.join(',')}`)).body;
  assert.match(page, /200 photos sur 205 : une page en montre 200 au plus\./);
  assert.match(page, new RegExp(`href="/admin/photos/lot\\?ids=${ids.slice(200).join(',')}">Les 5 suivantes →`));
  assert.doesNotMatch((await admin.get(`/admin/photos/lot?ids=${ids.slice(0, 3).join(',')}`)).body, /une page en montre 200 au plus/);
});

test('photothèque : « Audience » seulement avec statistiques.voir ; données de plusieurs photos en une requête, limitées à la portée', async t => {
  const c = await world(t);
  assert.doesNotMatch((await c.as('relu', ['relecteur']).get('/admin/photos')).body, /data-one-aud/);
  assert.match((await c.as('chef', ['admin']).get('/admin/photos')).body, /data-one-aud/);
  const mine = c.photoOf(c.seb), theirs = c.photoOf(c.jul);
  const ph = await c.as('seb', ['photographe'], c.seb).get(`/admin/photos/donnees?ids=${mine.id},${theirs.id},abc`, 'application/json');
  assert.equal(ph.statusCode, 200);
  assert.deepEqual(ph.json().photos.map(p => p.id), [mine.id]);                      // celle de Julien n'existe pas pour lui
  const admin = (await c.as('chef', ['admin']).get(`/admin/photos/donnees?ids=${mine.id},${theirs.id}`, 'application/json')).json();
  assert.deepEqual(admin.photos.map(p => p.id).sort((a, b) => a - b), [mine.id, theirs.id].sort((a, b) => a - b));
  assert.deepEqual(Object.keys(admin.photos[0]).sort(), Object.keys((await c.as('chef', ['admin']).get(`/admin/photos/${mine.id}/donnees`, 'application/json')).json()).sort());
  const js = fs.readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /Promise\.all\(ids\.map\(reload\)\)/);
});

test('journal : une action refusée par un message d’erreur (redirection) est notée « refusé »', async t => {
  const c = await world(t);
  const admin = c.as('chef', ['admin']);
  const r = await admin.post('/admin/instagram/likes');                              // aucun compte connecté : refus
  assert.equal(r.statusCode, 303);
  const row = c.db.prepare("SELECT status FROM audit_log WHERE action = 'POST /admin/instagram/likes'").get();
  assert.equal(row.status, 422);
  await admin.post('/admin/series', { name: 'Nouvelle' });
  assert.equal(c.db.prepare("SELECT status FROM audit_log WHERE action = 'POST /admin/series'").pluck().get(), 303);
  const page = (await admin.get('/admin/journal')).body;
  assert.match(page, /\/admin\/instagram\/likes[\s\S]*?<span class="enc-tag no">refusé<\/span>/);
});

test('signalements des visiteurs : entrée dans la barre latérale (avec le nombre de nouveaux), la palette et l’aide', async t => {
  const c = await world(t);
  const p = c.db.prepare("SELECT id FROM photos WHERE status = 'published' LIMIT 1").pluck().get();
  c.app.feedback.report(p, { kind: 'inapproprie' });
  c.app.feedback.report(p, { kind: 'autre', message: 'Bonjour' });
  const modo = (await c.as('modo', ['moderateur']).get('/admin/signalements')).body;
  assert.match(modo, /<a href="\/admin\/signalements" aria-current="page"><svg[^]*?<\/svg>Signalements<span class="nav-badge"><span aria-hidden="true">2<\/span><span class="sr-only">2 nouveaux<\/span>/);
  assert.match(modo, /<p class="help-link"><a href="\/admin\/aide#site-public-visionneuse-page-dune-photo">/);
  assert.doesNotMatch((await c.as('relu', ['relecteur']).get('/admin')).body, /href="\/admin\/signalements"/);
  const js = fs.readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
  assert.match(js, /\[tr\('Signalements'\), '\/admin\/signalements', 'signalements\.traiter'\]/);
});

test('libellés : pluriels, « les deux » seulement à deux photographes, case des photos liées, badges lus en entier', async t => {
  const c = await world(t);
  const admin = c.as('chef', ['admin']);
  assert.match((await admin.get('/admin/sorties')).body, />Les deux<\/a>/);
  c.db.prepare("INSERT INTO authors (slug, name) VALUES ('troisieme', 'Troisième')").run();
  assert.match((await admin.get('/admin/sorties')).body, />Tous<\/a>/);
  assert.match((await admin.get('/admin/voyages')).body, /<option value="">tous les photographes<\/option>/);
  // Une personne sans photo : pas de case « Supprimer aussi la photo liée ».
  const id = c.app.encounters.saveCard(null, { ref: 'S-0101', signed: 'on', scope_site: 'on', author_id: c.seb });
  const person = c.db.prepare('SELECT person_id FROM encounters WHERE id = ?').pluck().get(id);
  if (person) assert.doesNotMatch((await admin.get(`/admin/personnes/${person}`)).body, /name="photos"/);
  // Page Séries : « 1 photo analysée », jamais « 1 photos ».
  const series = fs.readFileSync(new URL('../views/admin/series.eta', import.meta.url), 'utf8');
  assert.match(series, /sg\.done > 1 \? t\('\{n\} photos analysées'/);
  // Badges : pas d'aria-label sur un span (ignoré), un texte masqué.
  assert.doesNotMatch(fs.readFileSync(new URL('../views/admin/layout.eta', import.meta.url), 'utf8'), /<span class="nav-badge[^"]*" aria-label=/);
});

test('admin en allemand : teintes du filigrane, légendes de l’app et barre des cartes traduites ; créneaux lisibles', async t => {
  const c = await world(t);
  const admin = c.as('chef', ['admin'], c.seb);
  await admin.post('/admin/langue', { lang: 'de', back: '/admin' });
  const images = (await admin.get('/admin/images')).body;
  assert.match(images, /name="wm_tone" value="light"[^>]*> Hell</);
  assert.match(images, /Automatisch \(hell auf dunklen Fotos, dunkel auf hellen Fotos\)/);
  const app = (await admin.get('/admin/rencontre')).body;
  assert.match(app, /<legend class="sr-only">Entscheidung<\/legend>/);
  assert.match(app, /<legend class="sr-only">Alter<\/legend>/);
  assert.match(app, /aria-label="Unterschrift"/);
  const sheet = (await admin.get(`/admin/rencontres/cartes/planche?auteur=${c.seb}&de=1&nombre=2`)).body;
  assert.match(sheet, /<div class="bar" lang="de">[\s\S]*1 A4-Blatt\.[\s\S]*<button type="button" data-print>Drucken<\/button> <a href="\/admin\/rencontres\/cartes">Zurück<\/a>/);
  // Créneau Instagram : « 16. Oktober », pas « 2026-10-16 ».
  const p = c.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 1").pluck().get();
  c.app.instagram.enqueue(p);
  const ig = (await admin.get('/admin/instagram')).body;
  assert.match(ig, /Geplant am \d{1,2}\. [A-ZÄÖÜ][a-zäöü]+ um \d{2}:\d{2} · Zuschnitt/);       // nom allemand avec sa majuscule
  assert.match((await admin.get(`/admin/photos/${p}`)).body, /In der Warteschlange: geplant für <strong>\d{1,2}\. [A-ZÄÖÜ][a-zäöü]+ um \d{2}:\d{2}<\/strong>/);
});

test('scripts de l’admin : focus, raccourcis, message de confirmation, sélection, envois implicites, suivis', async t => {
  const js = fs.readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../public/admin/admin.css', import.meta.url), 'utf8');
  // Fin d'import : le focus ne quitte pas un champ ; les photos importées ne remplacent ni une saisie ni une sélection.
  assert.match(js, /if \(!at \|\| at === document\.body \|\| section\.contains\(at\)\) next\.focus\(\);/);
  assert.match(js, /if \(!ids\.length \|\| typing\(document\.activeElement\) \|\| selIds\(\)\.length\) return;/);
  assert.match(js, /if \(!titles\.contains\(document\.activeElement\)\) titles\.innerHTML = /);
  // Touches d'une lettre : seulement depuis la planche ou l'inspecteur (WCAG 2.1.4).
  const keys = js.slice(js.indexOf('// ---------- raccourcis ----------'), js.indexOf('// ---------- glisser'));
  assert.ok(keys.indexOf("closest?.('[data-contact], [data-inspector]')) return;") < keys.indexOf("e.key.toLowerCase() === 'p'"));
  // Message de confirmation : région live toujours rendue, écrite au tour suivant ; délai suspendu au survol et au focus.
  const layout = fs.readFileSync(new URL('../views/admin/layout.eta', import.meta.url), 'utf8');
  assert.match(layout, /<div class="toast" role="status" aria-live="polite" data-toast><\/div>/);
  assert.match(css, /\.toast:empty \{[^}]*clip-path: inset\(50%\)/);
  assert.match(js, /box\.addEventListener\('focusin', \(\) => clearTimeout\(timer\)\);/);
  assert.match(js, /box\.addEventListener\('mouseenter'/);
  assert.match(fs.readFileSync(new URL('../views/admin/help.eta', import.meta.url), 'utf8'), /<p class="help-empty" data-help-empty data-text="[^"]+" role="status"><\/p>/);
  // Maj + clic : une sélection posée par le script ne déplace pas l'ancre.
  assert.match(js, /dispatchEvent\(Object\.assign\(new Event\('change', \{ bubbles: true \}\), \{ scripted: true \}\)\)/);
  assert.match(js, /if \(e\.target\.matches\('\.chk'\) && !e\.scripted\) anchor = /);
  // Entrée dans un champ de l'inspecteur ou du lot : jamais le bouton masqué « Changer de série ».
  assert.match(js, /if \(e\.submitter\?\.matches\('\[data-nojs\]'\)\) return;/);
  // Compléter le lot : une photo en échec ou supprimée sort du suivi ; refus : le suivi s'arrête.
  const lot = js.slice(js.indexOf('// Une photo en échec ou supprimée sort du suivi'), js.indexOf('// ----- réordonnancement'));
  assert.match(lot, /if \(!res\.ok\) return clearInterval\(timer\);/);
  assert.match(lot, /p\.state === 'error' \|\| p\.state === 'missing'[\s\S]*removeAttribute\('data-processing'\)/);
  // Palette : pas d'action sans son bouton dans la page.
  assert.match(js, /can\('photos\.supprimer'\) && \$\('\[data-bulk-delete\]'\)\) a\.push/);
  // Glisser vers une série : seulement des photos glissées depuis cette page.
  assert.doesNotMatch(js, /getData\('application\/x-nicephos-photos'\)/);
  assert.match(js, /const ids = \(dragIds \|\| \[\]\)\.filter\(id => data\.has\(id\)\);/);
  // Code mort retiré.
  assert.doesNotMatch(css, /var\(--muted\)/);
  assert.doesNotMatch(js, /dataset\.status \?\?=/);
});
