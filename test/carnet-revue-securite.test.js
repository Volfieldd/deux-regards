import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as, billet, photoId, authorId, visitor, setV2, UA } from './carnet-helpers.js';
import { renderBody, structureError, STRUCTURE } from '../server/carnet-markdown.js';
import { ancre } from '../server/v2-vues.js';
import { CarnetError } from '../server/carnet.js';

// Carnets, non-régression de la revue de sécurité de la PR #151 (un test par constat) :
//   1. déni de service par le contenu d'un billet : ancres en temps linéaire, structure plafonnée à l'enregistrement
//      (citations et listes sur 8 niveaux, 200 intertitres, marques de mise en forme), rendu protégé (un billet trop
//      lourd déjà en base ne fait pas tomber la page), aperçu et enregistrement automatique limités par compte (429,
//      signalé à la Vigie), rendu public mis en cache par billet, version et langue ;
//   2. publication programmée : une seule mise en ligne par billet, même si deux passages se chevauchent, et jamais
//      celle d'un billet déprogrammé pendant l'envoi d'un e-mail ;
//   3. billet programmé modifié par qui ne publie pas (version rétablie, réglage d'une photo, photo retirée) : il
//      repasse en proposition ;
//   4. « retirer » une photo exige le droit d'écrire, et celui de modifier un billet publié ;
//   5. photo brouillon d'un autre photographe : ni dans le texte, ni en couverture, ni dans l'éditeur, ni publiée avec
//      le billet ;
//   6. liens mailto: avec subject et body seulement ; adresse de « Écrire aux auteurs » sans paramètre.
const flash = res => decodeURIComponent(String(res.headers['set-cookie'] || '')).match(/flash=(\{[^;]*\})/)?.[1] || '';

async function team(t, opts = {}) {
  const c = await setup(t, { seeded: true, ...opts });
  const seb = as(c, { sub: 'z-seb', name: 'Sébastien', roles: ['photographe'], author: 'sebastien' });
  const jul = as(c, { sub: 'z-jul', name: 'Julien', roles: ['admin'], author: 'julien' });
  const mod = as(c, { sub: 'z-mod', name: 'Modératrice', roles: ['moderateur'] });
  return { ...c, seb, jul, mod };
}
const programmed = async (c, body = 'Version validée.\n\nphoto:brume-sur-la-loire') => {
  const p = await billet(c, { authors: ['sebastien'], body, publish: false });
  await c.app.carnet.publish(p.id, { sub: 'z-mod', name: 'Modératrice' }, { at: Date.now() + 3600e3 });
  assert.equal(c.app.carnet.get(p.id).state, 'programme');
  return c.app.carnet.get(p.id);
};

// ---------- 1. déni de service par le contenu ----------
test('revue 1a : ancres d’intertitres en temps linéaire, sans collision', () => {
  const ids = new Set();
  assert.deepEqual([ancre('Le quai', ids), ancre('Le quai', ids), ancre('le-quai-2', ids), ancre('Le quai', ids)], ['le-quai', 'le-quai-2', 'le-quai-2-2', 'le-quai-3']);
  // On compte le travail, pas l'horloge : chaque ancre doit coûter un nombre borné de recherches dans l'ensemble.
  // La recherche pas à pas (a-2, a-3, a-4…) en ferait n²/2, soit 200 millions pour 20 000 ancres.
  class Compte extends Set { recherches = 0; has(v) { this.recherches++; return super.has(v); } }
  const many = new Compte();
  for (let i = 0; i < 20000; i++) ancre('a', many);
  assert.equal(many.size, 20000);
  assert.ok(many.recherches <= 2 * 20000, `20 000 ancres : ${many.recherches} recherches (linéaire : 20 000 à 40 000)`);
});

test('revue 1b : structure plafonnée à l’enregistrement ; un billet trop lourd déjà en base est rendu vide, sans erreur', async t => {
  assert.equal(STRUCTURE.depth, 8);
  assert.equal(structureError('>'.repeat(8) + ' a'), null);
  assert.match(structureError('>'.repeat(9) + ' a'), /citations/);
  assert.match(structureError('> '.repeat(5000)), /citations/);
  assert.match(structureError(Array.from({ length: 10 }, (_, i) => `${'  '.repeat(i)}- a`).join('\n')), /listes/);
  assert.match(structureError('# a\n'.repeat(201)), /intertitres/);
  assert.equal(structureError('# a\n'.repeat(200)), null);
  assert.match(structureError('_a'.repeat(30000)), /marques/);
  // Le rendu ne lève jamais : structure refusée, ou erreur pendant l'écriture du HTML.
  const ctx = { lang: 'fr', photo: () => null, href: () => null, photoHref: () => '', meta: () => '', picture: () => '', t: {} };
  assert.deepEqual(renderBody('>'.repeat(5000), ctx).warnings, [{ code: 'rendu_impossible' }]);
  const boom = renderBody('photo:1', { ...ctx, photo: () => { throw new Error('boum'); } });
  assert.equal(boom.html, '');
  assert.deepEqual(boom.warnings, [{ code: 'rendu_impossible' }]);

  const c = await team(t);
  setV2(c);
  const p = await billet(c, { authors: ['sebastien'], body: 'Un texte.' });
  for (const body of ['>'.repeat(9) + ' trop', '# a\n'.repeat(201), Array.from({ length: 10 }, (_, i) => `${'  '.repeat(i)}- a`).join('\n')]) {
    assert.throws(() => c.app.carnet.update(p.id, { body }, { sub: 'z-jul' }), err => err instanceof CarnetError && /Texte refusé/.test(err.message));
    assert.throws(() => c.app.carnet.update(p.id, { body_en: body }, { sub: 'z-jul' }), CarnetError);
  }
  assert.equal(c.app.carnet.get(p.id).body, 'Un texte.');
  // Par l'éditeur : refusé avec la raison, rien n'est enregistré.
  const r = await c.jul.post(`/admin/carnet/${p.id}`, { langue: 'fr', body: '>'.repeat(20) + ' a' });
  assert.equal(r.statusCode, 303);
  assert.match(flash(r), /citations imbriqu/);
  assert.equal(c.app.carnet.get(p.id).body, 'Un texte.');
  // Un billet écrit avant le plafond (en base) : la page, la liste et le flux répondent.
  c.db.prepare('UPDATE posts SET body = ?, version = version + 1 WHERE id = ?').run('>'.repeat(5000), p.id);
  const v = visitor(c);
  for (const url of [`/carnet/${p.slug}`, '/carnet', '/carnet/flux.xml']) assert.equal((await v(url)).statusCode, 200, url);
});

test('revue 1c : aperçu et enregistrement automatique : structure refusée (422), limités par compte (429, signalé à la Vigie)', async t => {
  const KEY = 'cle-de-signature-vigie-0123456789abcdef';
  const events = [];
  const send = async (body, headers) => {
    assert.equal(headers['x-vigie-sig'], crypto.createHmac('sha256', KEY).update(`${headers['x-vigie-ts']}.${headers['x-vigie-nonce']}.${body}`).digest('hex'));
    events.push(...JSON.parse(body).lot);
  };
  const c = await team(t, { env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 }, vigieOptions: { send, timers: false, pollDecisions: false } });
  const p = await billet(c, { authors: ['sebastien'], body: 'Un texte.', publish: false });
  const t0 = performance.now();
  let r = await c.seb.json(`/admin/carnet/${p.id}/apercu`, { langue: 'fr', body: '_a'.repeat(30000) });
  assert.equal(r.statusCode, 422);
  assert.match(r.json().error, /marques/);
  // Sans la garde, le rendu de ces 30 000 marques prend 26 s (mesuré) ; avec elle, quelques dizaines de millisecondes.
  // Plafond à 10 s : cinq fois l'ancien seuil, toujours très loin du défaut, et la charge de la machine n'y change rien.
  assert.ok(performance.now() - t0 < 10_000, `aperçu refusé en ${Math.round(performance.now() - t0)} ms`);
  assert.equal((await c.seb.json(`/admin/carnet/${p.id}/brouillon`, { langue: 'fr', body: '>'.repeat(3000) })).statusCode, 422);
  for (let i = 1; i < 60; i++) assert.equal((await c.seb.json(`/admin/carnet/${p.id}/apercu`, { langue: 'fr', body: 'Un texte.' })).statusCode, 200, `aperçu ${i}`);
  r = await c.seb.json(`/admin/carnet/${p.id}/apercu`, { langue: 'fr', body: 'Un texte.' });
  assert.equal(r.statusCode, 429);
  assert.equal(r.headers['retry-after'], '60');
  for (let i = 1; i < 30; i++) assert.notEqual((await c.seb.json(`/admin/carnet/${p.id}/brouillon`, { langue: 'fr', body: 'Un texte.' })).statusCode, 429, `brouillon ${i}`);
  assert.equal((await c.seb.json(`/admin/carnet/${p.id}/brouillon`, { langue: 'fr', body: 'Un texte.' })).statusCode, 429);
  // Par compte : un autre compte n'est pas limité.
  assert.equal((await c.jul.json(`/admin/carnet/${p.id}/apercu`, { langue: 'fr', body: 'Un texte.' })).statusCode, 200);
  c.app.securite.runTasks(); c.app.securite.retryNow(); await c.app.securite.flush();
  const limits = events.filter(e => e.type === 'excess_rate_limit_exceeded' && e.origine.emetteur === 'server/routes/carnet.js · limite');
  assert.deepEqual(limits.map(e => e.detail.limite).sort(), ['carnet_apercu', 'carnet_brouillon']);
});

test('revue 1d : rendu public mis en cache par billet et version ; une nouvelle version est rendue à nouveau', async t => {
  const c = await team(t);
  setV2(c);
  const p = await billet(c, { authors: ['sebastien'], body: 'Premier état du texte.' });
  const v = visitor(c);
  assert.match((await v(`/carnet/${p.slug}`)).body, /Premier état du texte/);
  // Texte changé en base sans nouvelle version ni date : la page sert encore le rendu en cache.
  c.db.prepare("UPDATE posts SET body = 'Changé sans version.' WHERE id = ?").run(p.id);
  assert.match((await v(`/carnet/${p.slug}`)).body, /Premier état du texte/);
  // Une vraie modification (nouvelle version) : rendue à nouveau.
  c.app.carnet.update(p.id, { body: 'Second état du texte.' }, { sub: 'z-jul' }, { publisher: true });
  const page = (await v(`/carnet/${p.slug}`)).body;
  assert.match(page, /Second état du texte/);
  assert.doesNotMatch(page, /Premier état/);
});

// ---------- 2. publication programmée ----------
test('revue 2 : runDue publie une seule fois, même si deux passages se chevauchent ; jamais un billet déprogrammé', async t => {
  let release; const gate = new Promise(r => { release = r; });
  let hold = false;
  const c = await team(t, { mailTransport: { sendMail: async () => { if (hold) await gate; } } });
  c.db.prepare("UPDATE accounts SET email = 'seb@example.org', notify_email = 1 WHERE sub = 'z-seb'").run();
  const a = await billet(c, { title: 'A', authors: ['sebastien'], body: 'a\n\nphoto:brume-sur-la-loire', publish: false });
  const b = await billet(c, { title: 'B', authors: ['sebastien'], body: 'b\n\nphoto:brume-sur-la-loire', publish: false });
  await c.app.carnet.publish(a.id, { sub: 'x', name: 'x' }, { at: Date.now() + 1000 });
  await c.app.carnet.publish(b.id, { sub: 'x', name: 'x' }, { at: Date.now() + 2000 });
  c.db.prepare("UPDATE posts SET publish_at = ? WHERE state = 'programme'").run(Date.now() - 1000);
  // Le premier passage attend un e-mail lent ; le suivant démarre ; la modératrice déprogramme B entre-temps.
  hold = true;
  const run1 = c.app.carnet.runDue();
  await new Promise(r => setImmediate(r));
  const run2 = c.app.carnet.runDue();
  await new Promise(r => setImmediate(r));
  await c.mod.post(`/admin/carnet/${b.id}/deprogrammer`);
  release();
  const [n1, n2] = await Promise.all([run1, run2]);
  assert.equal(n1, 2, 'les deux billets mis en ligne avant tout e-mail');
  assert.equal(n2, 0, 'le passage suivant ne republie rien');
  const actions = id => c.app.carnet.history(id).map(h => h.action);
  for (const id of [a.id, b.id]) {
    assert.equal(actions(id).filter(x => x === 'publie').length, 1, `billet ${id} publié une fois`);
    assert.equal(c.db.prepare("SELECT COUNT(*) FROM audit_log WHERE action = 'carnet · publication programmée' AND target LIKE ?").pluck().get(`%${c.app.carnet.get(id).title}%`) <= 1, true);
  }
  // Déprogrammé : jamais mis en ligne ensuite ; ici, B était déjà en ligne, la déprogrammation a été refusée.
  assert.ok(!actions(b.id).includes('deprogramme') || c.app.carnet.get(b.id).state !== 'publie', actions(b.id).join(','));
  // Un billet déprogrammé avant l'échéance, puis échu : le passage suivant ne le publie pas.
  const d = await billet(c, { title: 'D', authors: ['sebastien'], body: 'd\n\nphoto:brume-sur-la-loire', publish: false });
  await c.app.carnet.publish(d.id, { sub: 'x', name: 'x' }, { at: Date.now() + 1000 });
  c.app.carnet.unschedule(d.id, { sub: 'z-mod', name: 'Modératrice' });
  c.db.prepare('UPDATE posts SET publish_at = ? WHERE id = ?').run(Date.now() - 1000, d.id);
  assert.equal(await c.app.carnet.runDue(), 0);
  assert.notEqual(c.app.carnet.get(d.id).state, 'publie');
});

// ---------- 3. billet programmé modifié par qui ne publie pas ----------
test('revue 3 : billet programmé : version rétablie, réglage d’une photo ou photo retirée par un photographe → repasse en proposition ; pas pour qui publie', async t => {
  const c = await team(t);
  const pid = photoId(c.db, 'brume-sur-la-loire');
  // Version rétablie.
  let p = await billet(c, { authors: ['sebastien'], body: 'TEXTE NON RELU\n\nphoto:brume-sur-la-loire', publish: false });
  c.app.carnet.update(p.id, { body: 'Version validée.\n\nphoto:brume-sur-la-loire' }, { sub: 'z-seb', name: 'S' });
  const old = c.app.carnet.revisions(p.id).find(rv => JSON.parse(rv.data || rv.snapshot || '{}').body?.startsWith('TEXTE NON RELU'))?.id ?? c.app.carnet.revisions(p.id)[1].id;
  await c.app.carnet.publish(p.id, { sub: 'z-mod', name: 'M' }, { at: Date.now() + 3600e3 });
  await c.seb.post(`/admin/carnet/${p.id}/versions/${old}/retablir`);
  p = c.app.carnet.get(p.id);
  assert.equal(p.state, 'propose');
  assert.equal(p.publish_at, null);
  assert.ok(c.app.carnet.history(p.id).some(h => h.action === 'modifie'));
  // Légende d'une photo.
  p = await programmed(c);
  let r = await c.seb.post(`/admin/carnet/${p.id}/photos/1`, { langue: 'fr', alt: 'Une brume.', legende: 'LÉGENDE NON RELUE' });
  assert.equal(r.statusCode, 303);
  assert.equal(c.app.carnet.get(p.id).state, 'propose');
  // Photo retirée.
  p = await programmed(c);
  r = await c.seb.post(`/admin/carnet/${p.id}`, { langue: 'fr', retirer: String(pid) });
  assert.doesNotMatch(c.app.carnet.get(p.id).body, /photo:/);
  assert.equal(c.app.carnet.get(p.id).state, 'propose');
  // Par l'API du module aussi (tout chemin d'écriture).
  p = await programmed(c);
  c.app.carnet.setPhoto(p.id, pid, { legend: 'Autre légende' });
  assert.equal(c.app.carnet.get(p.id).state, 'propose');
  // Qui publie : le billet reste programmé.
  p = await programmed(c);
  c.app.carnet.setPhoto(p.id, pid, { legend: 'Légende relue' }, { publisher: true });
  await c.jul.post(`/admin/carnet/${p.id}/photos/1`, { langue: 'fr', alt: 'Une brume.', legende: 'Légende de Julien' });
  assert.equal(c.app.carnet.get(p.id).state, 'programme');
  // Sans changement réel : rien ne bouge.
  p = await programmed(c);
  c.app.carnet.setPhoto(p.id, pid, {});
  assert.equal(c.app.carnet.get(p.id).state, 'programme');
});

// ---------- 4. « retirer » et les droits ----------
test('revue 4 : « retirer » une photo exige d’écrire (403 sinon) et, sur un billet publié, de modifier les billets publiés', async t => {
  const c = await team(t);
  const pid = photoId(c.db, 'brume-sur-la-loire');
  const p = await billet(c, { authors: ['sebastien'], body: 'Texte.\n\nphoto:brume-sur-la-loire' });
  assert.equal(p.state, 'publie');
  assert.equal((await c.mod.post(`/admin/carnet/${p.id}`, { langue: 'fr', retirer: String(pid) })).statusCode, 403);
  assert.match(c.app.carnet.get(p.id).body, new RegExp(`photo:${pid}`));
  // Photographe sans carnet.publies.modifier : refusé, le billet publié ne change pas.
  c.db.prepare('UPDATE accounts SET adjust = ? WHERE sub = ?').run(JSON.stringify({ remove: ['carnet.publies.modifier'] }), 'z-seb');
  const r = await c.seb.post(`/admin/carnet/${p.id}`, { langue: 'fr', retirer: String(pid) });
  assert.match(c.app.carnet.get(p.id).body, new RegExp(`photo:${pid}`));
  assert.ok(r.statusCode === 403 || /droit|publi/i.test(flash(r)), `${r.statusCode} ${flash(r)}`);
  // Avec le droit : retirée.
  c.db.prepare('UPDATE accounts SET adjust = ? WHERE sub = ?').run('{}', 'z-seb');
  await c.seb.post(`/admin/carnet/${p.id}`, { langue: 'fr', retirer: String(pid) });
  assert.doesNotMatch(c.app.carnet.get(p.id).body, new RegExp(`photo:${pid}`));
});

// ---------- 5. photo brouillon d'un autre photographe ----------
test('revue 5 : photo brouillon d’un autre photographe : neutralisée dans le texte, refusée en couverture, cachée dans l’éditeur, jamais publiée avec le billet', async t => {
  const c = await team(t);
  const jp = c.db.prepare('SELECT id, slug FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').get(authorId(c.db, 'julien'));
  c.db.prepare("UPDATE photos SET status = 'draft', review = NULL, title = 'TITRE PRIVE DE JULIEN' WHERE id = ?").run(jp.id);
  const cr = await c.seb.post('/admin/carnet', { title: 'Mon billet', rubrique: 'voyages' });
  const url = cr.headers.location, id = Number(url.split('/').pop());
  await c.seb.post(url, { langue: 'fr', title: 'Mon billet', dek: 'Chapô', body: `Texte.\n\nphoto:${jp.id}\n\nphoto:${jp.slug}`, version: '1' });
  const body = c.app.carnet.get(id).body;
  assert.match(body, new RegExp(`photo:\\?${jp.id}`));
  assert.match(body, new RegExp(`photo:\\?${jp.slug}`));
  assert.deepEqual(c.app.carnet.photoIds(c.app.carnet.get(id)), []);
  // Couverture et image de partage : refusées, la valeur précédente reste.
  await c.seb.post(url, { langue: 'fr', cover_id: String(jp.id), share_id: String(jp.id) });
  assert.notEqual(c.app.carnet.get(id).cover_id, jp.id);
  assert.notEqual(c.app.carnet.get(id).share_id, jp.id);
  assert.doesNotMatch((await c.seb.get(url)).body, /TITRE PRIVE DE JULIEN/);
  // Un billet de Sébastien qui la contient déjà (écrit avant le correctif) : ni l'éditeur ni la page de la photo ne la
  // montrent à Sébastien ; la publication par la modératrice ne la publie pas.
  const p = await billet(c, { authors: ['sebastien'], body: `Texte.\n\nphoto:${jp.id}`, publish: false });
  const page = await c.seb.get(`/admin/carnet/${p.id}`);
  assert.equal(page.statusCode, 200);
  assert.doesNotMatch(page.body, /TITRE PRIVE DE JULIEN/);
  assert.equal((await c.seb.get(`/admin/carnet/${p.id}/photos/1`)).statusCode, 404);
  await c.mod.post(`/admin/carnet/${p.id}/publier`, { quand: 'maintenant' });
  assert.equal(c.db.prepare('SELECT status FROM photos WHERE id = ?').pluck().get(jp.id), 'draft');
  // Une photo de l'auteur du billet, elle, part avec lui.
  const sp = c.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').pluck().get(authorId(c.db, 'sebastien'));
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE id = ?").run(sp);
  const q = await billet(c, { title: 'Avec la sienne', authors: ['sebastien'], body: `Texte.\n\nphoto:${sp}`, publish: false });
  await c.mod.post(`/admin/carnet/${q.id}/publier`, { quand: 'maintenant' });
  assert.equal(c.db.prepare('SELECT status FROM photos WHERE id = ?').pluck().get(sp), 'published');
});

// ---------- 6. mailto: ----------
test('revue 6 : liens mailto: avec subject et body seulement ; adresse de « Écrire aux auteurs » sans paramètre', async t => {
  const ctx = { lang: 'fr', photo: () => null, href: () => null, photoHref: () => '', meta: () => '', picture: () => '', t: {} };
  const html = s => renderBody(s, ctx).html;
  assert.match(html('[a](mailto:nous@example.org?subject=Bonjour&body=Un%20mot)'), /href="mailto:nous@example\.org\?subject=Bonjour&amp;body=Un%20mot"/);
  for (const bad of ['mailto:nous@example.org?bcc=espion@example.net', 'mailto:nous@example.org?subject=a&cc=espion@example.net', 'mailto:nous@example.org,espion@example.net',
    'mailto:nous@example.org%0Abcc:espion@example.net', 'mailto:nous@example.org?subject=a%0D%0Abcc:espion@example.net&to=espion@example.net']) {
    const out = html(`[a](${bad})`);
    assert.doesNotMatch(out, /espion/, bad);
    assert.doesNotMatch(out, /href="mailto/, bad);
  }
  const c = await team(t);
  setV2(c);
  const get = key => JSON.parse(c.db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(key) ?? 'null');
  for (const bad of ['nous@example.org?bcc=espion@example.net', 'nous@example.org&cc=x@y.fr', 'nous%40example.org@x.fr', 'nous@example.org,espion@example.net']) {
    await c.jul.post('/admin/carnet/reglages', { carnet_contact: bad });
    assert.notEqual(get('carnet_contact'), bad, bad);
  }
  await c.jul.post('/admin/carnet/reglages', { carnet_contact: 'nous@example.org' });
  assert.equal(get('carnet_contact'), 'nous@example.org');
  // Une adresse refusée déjà en base : pas de lien du tout.
  const p = await billet(c, { authors: ['sebastien'], body: 'Un texte.', extra: { contact: true } });
  const v = visitor(c);
  assert.match((await v(`/carnet/${p.slug}`)).body, /href="mailto:nous@example\.org\?subject=/);
  c.db.prepare("UPDATE settings SET value = ? WHERE key = 'carnet_contact'").run(JSON.stringify('nous@example.org?bcc=espion@example.net'));
  const page = (await v(`/carnet/${p.slug}`)).body;
  assert.doesNotMatch(page, /espion/);
  assert.doesNotMatch(page, /href="mailto:/);
});
