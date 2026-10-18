import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { as, billet, photoId, visitor, setV2 } from './carnet-helpers.js';

// Carnets, le circuit de publication (étude § 1.6, MQ-20) : proposer (vérifications B37, photos proposées avec le billet,
// B43), publier ou programmer (photos publiées ou programmées avec le billet, B44, B45), publication programmée par une
// seule fonction (runDue : sub = null, « publication programmée »), renvoyer avec une remarque, retirer (410),
// republier, supprimer un billet jamais publié. Le journal d'audit note chaque écriture avec les noms des champs, jamais
// leurs valeurs ; l'aperçu et l'enregistrement automatique n'y sont pas.
const flash = res => decodeURIComponent(String(res.headers['set-cookie'] || '')).match(/flash=(\{[^;]*\})/)?.[1] || '';

async function team(t) {
  const c = await setup(t, { seeded: true });
  const seb = as(c, { sub: 'z-seb', name: 'Sébastien', roles: ['photographe'], author: 'sebastien' });
  const jul = as(c, { sub: 'z-jul', name: 'Julien', roles: ['admin'], author: 'julien' });
  const mod = as(c, { sub: 'z-mod', name: 'Modératrice', roles: ['moderateur'] });
  return { ...c, seb, jul, mod };
}
const audit = (db, since = 0) => db.prepare('SELECT sub, name, action, target, status, detail FROM audit_log WHERE id > ? ORDER BY id').all(since);
const lastAudit = db => db.prepare('SELECT MAX(id) FROM audit_log').pluck().get() || 0;

test('proposer : chapô et textes de remplacement exigés (résumé en tête), puis proposé ; ses brouillons de photos partent avec lui', async t => {
  const c = await team(t);
  const draft = c.db.prepare("SELECT id, slug FROM photos WHERE author_id = (SELECT id FROM authors WHERE slug = 'sebastien') ORDER BY id LIMIT 1").get();
  c.db.prepare("UPDATE photos SET status = 'draft', alt_text = '' WHERE id = ?").run(draft.id);
  const cr = await c.seb.post('/admin/carnet', { title: 'Angers, un soir d’octobre', rubrique: 'voyages' });
  assert.equal(cr.statusCode, 303);
  const url = cr.headers.location, id = Number(url.split('/').pop());
  assert.deepEqual(c.app.carnet.get(id).authors, [c.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get()], 'un photographe signe ses billets');
  // Sans chapô ni texte de remplacement : refusé, le résumé dit quoi corriger.
  let r = await c.seb.post(url, { langue: 'fr', title: 'Angers, un soir d’octobre', dek: '', body: `Le quai.\n\nphoto:${draft.slug}`, faire: 'proposer' });
  assert.match(r.headers.location, /verifier=proposer/);
  assert.match(flash(r), /Pas encore propos/);
  const page = (await c.seb.get(r.headers.location)).body;
  assert.match(page, /class="resume-a"/);
  assert.match(page, /href="#chapo"/);
  assert.match(page, /href="#ph-1"/);
  assert.equal(c.app.carnet.get(id).state, 'brouillon');
  // Corrigé : proposé, et la photo brouillon avec lui (circuit des photos).
  c.app.carnet.setPhoto(id, draft.id, { alt: 'Un quai désert au petit matin.' });
  r = await c.seb.post(url, { langue: 'fr', dek: 'Le quai Ligny, le soir.', faire: 'proposer' });
  assert.equal(c.app.carnet.get(id).state, 'propose', flash(r));
  assert.equal(c.db.prepare('SELECT review FROM photos WHERE id = ?').pluck().get(draft.id), 'proposee');
  // La modératrice voit le nombre à valider dans le menu ; Sébastien peut retirer sa proposition.
  assert.match((await c.mod.get('/admin/carnet')).body, /1 billet proposé/);
  r = await c.seb.post(`/admin/carnet/${id}/retirer-proposition`);
  assert.equal(c.app.carnet.get(id).state, 'brouillon');
});

test('publier : refusé à un photographe (403) ; l’administrateur publie avec les photos qu’il peut publier ; le journal note les champs, jamais les valeurs', async t => {
  const c = await team(t);
  const p = await billet(c, { title: 'Pourquoi nous ne recadrons pas', authors: ['sebastien'], body: 'Un texte TRÈS-SECRET.\n\nphoto:brume-sur-la-loire', publish: false });
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE slug = 'brume-sur-la-loire'").run();
  assert.equal((await c.seb.post(`/admin/carnet/${p.id}/publier`, { quand: 'maintenant' })).statusCode, 403);
  const since = lastAudit(c.db);
  const r = await c.jul.post(`/admin/carnet/${p.id}`, { langue: 'fr', version: String(p.version), body: 'Un texte TRÈS-SECRET modifié.\n\nphoto:brume-sur-la-loire', faire: 'publier' });
  assert.equal(r.statusCode, 303);
  const post = c.app.carnet.get(p.id);
  assert.equal(post.state, 'publie', flash(r));
  assert.ok(post.published_at > 0);
  assert.equal(c.db.prepare("SELECT status FROM photos WHERE slug = 'brume-sur-la-loire'").pluck().get(), 'published', 'photo publiée avec le billet');
  const lines = audit(c.db, since);
  assert.ok(lines.some(l => l.action === 'POST /admin/carnet/:id' && l.sub === 'z-jul' && /champs : body/.test(l.detail) && /state/.test(l.detail)), JSON.stringify(lines));
  assert.ok(!JSON.stringify(lines).includes('SECRET'), 'jamais la valeur d’un champ');
  // Publié : un brouillon de photo d'un autre photographe, que le compte ne publie pas, bloquerait (B44).
  const q = await billet(c, { title: 'Avec la photo de Julien', authors: ['sebastien'], body: 'photo:deux-minuit', publish: false });
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE slug = 'deux-minuit'").run();
  const pub = as(c, { sub: 'z-seb', name: 'Sébastien', roles: ['photographe'], adjust: { add: ['carnet.publier'], remove: [] } });
  const r2 = await pub.post(`/admin/carnet/${q.id}/publier`, { quand: 'maintenant' });
  assert.match(flash(r2), /ne peut pas les publier/);
  assert.equal(c.app.carnet.get(q.id).state, 'brouillon');
});

test('programmer : date lue librement, passée refusée ; les photos sont programmées à la même heure ; runDue publie, sans session (sub = null), et le note au journal', async t => {
  const c = await team(t);
  const p = await billet(c, { title: 'Programmé', authors: ['julien'], body: 'photo:deux-minuit', publish: false });
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE slug = 'deux-minuit'").run();
  let r = await c.jul.post(`/admin/carnet/${p.id}/publier`, { quand: 'programmer', publish_at: 'n’importe quand' });
  assert.match(flash(r), /Date illisible/);
  r = await c.jul.post(`/admin/carnet/${p.id}/publier`, { quand: 'programmer', publish_at: '01/01/2020 8:00' });
  assert.match(flash(r), /passée/);
  r = await c.jul.post(`/admin/carnet/${p.id}/publier`, { quand: 'programmer', publish_at: '31/12/2099 8:00' });
  let post = c.app.carnet.get(p.id);
  assert.equal(post.state, 'programme', flash(r));
  assert.ok(post.publish_at > Date.now());
  assert.equal(c.db.prepare("SELECT review FROM photos WHERE slug = 'deux-minuit'").pluck().get(), 'programmee', 'la photo, programmée avec le billet');
  // Pas encore l'heure : rien.
  assert.equal(await c.app.carnet.runDue(), 0);
  // L'heure arrive : photos d'abord (circuit des photos), puis le billet, par la seule fonction runDue.
  c.db.prepare('UPDATE posts SET publish_at = ? WHERE id = ?').run(Date.now() - 1000, p.id);
  c.db.prepare("UPDATE photos SET publish_at = ? WHERE slug = 'deux-minuit'").run(Date.now() - 1000);
  const since = lastAudit(c.db);
  await c.app.review.runDue();
  assert.equal(await c.app.carnet.runDue(), 1);
  post = c.app.carnet.get(p.id);
  assert.equal(post.state, 'publie');
  const line = audit(c.db, since).find(l => l.action === 'carnet · publication programmée');
  assert.deepEqual([line.sub, line.name, line.target, line.status], [null, 'publication programmée', String(p.id), 200]);
  assert.match(line.detail, /^champs : state, published_at/);
  const hist = c.app.carnet.history(p.id);
  assert.deepEqual([hist[0].action, hist[0].by_sub, hist[0].by_name], ['publie', null, 'publication programmée']);
});

test('publication programmée annulée quand une photo n’est plus publiée : « à reprendre » avec la raison ; déprogrammer revient à la proposition', async t => {
  const c = await team(t);
  const p = await billet(c, { title: 'Annulé', body: 'photo:brume-sur-la-loire', publish: false });
  await c.app.carnet.publish(p.id, { sub: 'z-jul', name: 'Julien' }, { at: Date.now() + 3600e3 });
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE slug = 'brume-sur-la-loire'").run();
  c.db.prepare('UPDATE posts SET publish_at = ? WHERE id = ?').run(Date.now() - 1, p.id);
  assert.equal(await c.app.carnet.runDue(), 0);
  assert.equal(c.app.carnet.get(p.id).state, 'a_reprendre');
  assert.match(c.app.carnet.history(p.id)[0].message, /Brume sur la Loire/);
  // Déprogrammer : un billet proposé redevient proposé.
  const q = await billet(c, { title: 'Déprogrammé', publish: false });
  c.db.prepare("UPDATE photos SET status = 'published'").run();
  await c.app.carnet.propose(q.id, { sub: 'z-seb', name: 'Sébastien' });
  await c.app.carnet.publish(q.id, { sub: 'z-jul', name: 'Julien' }, { at: Date.now() + 3600e3 });
  const r = await c.mod.post(`/admin/carnet/${q.id}/deprogrammer`);
  assert.equal(r.statusCode, 303);
  assert.equal(c.app.carnet.get(q.id).state, 'propose');
});

test('renvoyer (remarque obligatoire), retirer (raison obligatoire, 410 sur le site), republier ; supprimer un billet jamais publié seulement', async t => {
  const c = await team(t);
  setV2(c);
  const p = await billet(c, { title: 'À renvoyer', publish: false });
  await c.app.carnet.propose(p.id, { sub: 'z-seb', name: 'Sébastien' });
  assert.equal((await c.mod.get(`/admin/carnet/${p.id}/renvoyer`)).statusCode, 200);
  let r = await c.mod.post(`/admin/carnet/${p.id}/renvoyer`, { message: '  ' });
  assert.match(flash(r), /remarque/);
  r = await c.mod.post(`/admin/carnet/${p.id}/renvoyer`, { message: 'Le chapô est trop long.' });
  assert.equal(c.app.carnet.get(p.id).state, 'a_reprendre');
  assert.match((await c.seb.get(`/admin/carnet/${p.id}`)).body, /Le chapô est trop long/);
  // Retirer et republier.
  const q = await billet(c, { title: 'À retirer' });
  const see = visitor(c);
  assert.equal((await see('/carnet/a-retirer')).statusCode, 200);
  r = await c.mod.post(`/admin/carnet/${q.id}/retirer`, { reason: '' });
  assert.equal(c.app.carnet.get(q.id).state, 'publie');
  r = await c.mod.post(`/admin/carnet/${q.id}/retirer`, { reason: 'Une erreur de lieu.' });
  assert.equal(c.app.carnet.get(q.id).state, 'retire');
  assert.equal((await see('/carnet/a-retirer')).statusCode, 410);
  assert.doesNotMatch((await see('/carnet')).body, /a-retirer/);
  r = await c.mod.post(`/admin/carnet/${q.id}/republier`);
  assert.equal(c.app.carnet.get(q.id).state, 'publie');
  // Supprimer : un billet publié se retire, il ne se supprime pas.
  r = await c.jul.post(`/admin/carnet/${q.id}/supprimer`);
  assert.match(flash(r), /ne se supprime pas/);
  assert.ok(c.app.carnet.get(q.id));
  const d = await billet(c, { title: 'Brouillon à jeter', authors: ['sebastien'], publish: false });
  r = await c.seb.post(`/admin/carnet/${d.id}/supprimer`);
  assert.equal(r.statusCode, 303, flash(r) + r.body.slice(0, 300));
  assert.equal(c.app.carnet.get(d.id), null);
});

test('enregistrement automatique et aperçu : JSON sous CSRF, hors du journal d’audit, jamais dans le billet ; l’éditeur reprend le brouillon', async t => {
  const c = await team(t);
  const p = await billet(c, { title: 'Brouillon automatique', authors: ['sebastien'], body: 'Texte enregistré.', publish: false });
  const since = lastAudit(c.db);
  let r = await c.seb.json(`/admin/carnet/${p.id}/brouillon`, { langue: 'fr', body: 'Texte tapé à l’instant.', title: 'Brouillon automatique' });
  assert.equal(r.statusCode, 200);
  assert.ok(r.json().time);
  r = await c.seb.json(`/admin/carnet/${p.id}/apercu`, { langue: 'fr', body: '## Intertitre\n\nTexte **gras**.' });
  assert.match(r.json().html, /<h2 class="jour" id="intertitre">Intertitre<\/h2>/);
  assert.equal(c.app.carnet.get(p.id).body, 'Texte enregistré.');
  assert.deepEqual(audit(c.db, since).filter(l => /brouillon|apercu/.test(l.action)), []);
  // Sans jeton CSRF : refusé.
  const bad = await c.app.inject({ method: 'POST', url: `/admin/carnet/${p.id}/brouillon`, cookies: c.seb.cookies, headers: { accept: 'application/json' }, payload: { body: 'x' } });
  assert.equal(bad.statusCode, 403);
  // À la réouverture : le texte repris, à enregistrer ou à écarter.
  const page = (await c.seb.get(`/admin/carnet/${p.id}`)).body;
  assert.match(page, /Texte repris de l’enregistrement automatique/);
  assert.match(page, /Texte tapé à l’instant/);
  await c.seb.post(`/admin/carnet/${p.id}/brouillon/ecarter`);
  assert.doesNotMatch((await c.seb.get(`/admin/carnet/${p.id}`)).body, /Texte tapé/);
  // Toute autre écriture d'un billet passe par le journal.
  await c.seb.post(`/admin/carnet/${p.id}`, { langue: 'fr', body: 'Nouveau texte.' });
  assert.ok(audit(c.db, since).some(l => l.action === 'POST /admin/carnet/:id' && l.detail === 'champs : body'));
});

test('verrou optimiste dans l’éditeur : version périmée, rien n’est écrasé, le texte envoyé est gardé à reprendre', async t => {
  const c = await team(t);
  const p = await billet(c, { title: 'Conflit', authors: ['sebastien'], body: 'Version de Julien.', publish: false });
  c.app.carnet.update(p.id, { body: 'Version plus récente.' }, { sub: 'z-jul', name: 'Julien' });
  const r = await c.seb.post(`/admin/carnet/${p.id}`, { langue: 'fr', version: String(p.version), body: 'Mon texte à moi.' });
  assert.match(flash(r), /rien n’a été écrasé/);
  assert.equal(c.app.carnet.get(p.id).body, 'Version plus récente.');
  assert.match((await c.seb.get(`/admin/carnet/${p.id}`)).body, /Mon texte à moi/);
});

test('sans JavaScript : les photos cochées s’ajoutent à la fin du texte, une ligne chacune ; une photo retirée du billet', async t => {
  const c = await team(t);
  const p = await billet(c, { title: 'Sans script', authors: ['sebastien'], body: 'Le texte.', publish: false });
  await c.seb.post(`/admin/carnet/${p.id}`, { langue: 'fr', body: 'Le texte.', photos: ['brume-sur-la-loire', 'deux-minuit'] });
  const a = photoId(c.db, 'brume-sur-la-loire'), b = photoId(c.db, 'deux-minuit');
  assert.equal(c.app.carnet.get(p.id).body, `Le texte.\n\nphoto:${a}\n\nphoto:${b}`);
  await c.seb.post(`/admin/carnet/${p.id}`, { langue: 'fr', retirer: String(b) });
  assert.equal(c.app.carnet.get(p.id).body, `Le texte.\n\nphoto:${a}`);
  // Une photo brouillon de l'autre photographe n'entre pas dans son billet (sa ligne reste du texte, signalée).
  const other = c.db.prepare("SELECT slug FROM photos WHERE author_id = (SELECT id FROM authors WHERE slug = 'julien') LIMIT 1").pluck().get();
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE slug = ?").run(other);
  await c.seb.post(`/admin/carnet/${p.id}`, { langue: 'fr', body: `photo:${other}` });
  assert.equal(c.app.carnet.get(p.id).body, `photo:${other}`);
  assert.doesNotMatch((await c.seb.get(`/admin/carnet/${p.id}`)).body, /\/admin\/media\/[^"]*" [^>]*alt="[^"]*"[^>]*>[^<]*<span class="sr-only"> – voir en grand/);
});
