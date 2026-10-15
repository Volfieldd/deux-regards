import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Circuit Instagram : le photographe propose (cadre, filigrane, légende, un mot), le modérateur met dans la file ou
// renvoie avec une remarque ; « mettre ses photos dans la file sans validation » se règle photographe par photographe.
async function world(t) {
  const sent = [];
  const ctx = await setup(t, { seeded: true, mailTransport: { sendMail: async m => { sent.push(m); } } });
  const seb = ctx.db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get();
  ctx.db.prepare('UPDATE photos SET faces = 0').run();
  const [a, b] = ctx.db.prepare("SELECT id FROM photos WHERE author_id = ? AND status = 'published' ORDER BY id").pluck().all(seb);
  const other = ctx.db.prepare("SELECT id FROM photos WHERE author_id != ? AND status = 'published' LIMIT 1").pluck().get(seb);
  const as = (sub, roles, { authorId = null, email = null } = {}) => {
    ctx.app.accounts.ensure({ sub, name: sub, email: email || '', roles });
    if (authorId) ctx.app.accounts.update(ctx.app.accounts.bySub(sub).id, { authorId }, 'test');
    if (email) ctx.app.accounts.setNotify(sub, { on: true });
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    return {
      get: url => ctx.app.inject({ url, cookies: { session: token }, headers: { accept: 'text/html' } }),
      post: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } }),
    };
  };
  const ph = as('seb', ['photographe'], { authorId: seb, email: 'seb@example.org' });
  const mod = as('marc', ['moderateur'], { email: 'marc@example.org' });
  const proposals = () => ctx.db.prepare('SELECT * FROM instagram_proposals ORDER BY id').all();
  const posts = () => ctx.db.prepare('SELECT * FROM instagram_posts ORDER BY id').all();
  return { ...ctx, sent, seb, a, b, other, ph, mod, as, proposals, posts };
}
const body = r => r.body;

test('proposer pour Instagram, puis le modérateur met dans la file avec les choix du photographe', async t => {
  const c = await world(t);
  const fiche = body(await c.ph.get(`/admin/photos/${c.a}`));
  assert.match(fiche, new RegExp(`action="/admin/photos/${c.a}/instagram/proposer"`));
  assert.match(fiche, /Proposer pour Instagram/);
  assert.equal((await c.ph.get(`/admin/instagram/apercu.jpg?photo=${c.a}&cadre=black`)).statusCode, 200);    // aperçu de sa photo
  assert.equal((await c.ph.get(`/admin/instagram/apercu.jpg?photo=${c.other}`)).statusCode, 404);
  // Sans la main sur la file : mettre dans la file directement est refusé.
  assert.equal((await c.ph.post('/admin/instagram/file', { photo_id: String(c.a) })).statusCode, 403);
  assert.equal(c.posts().length, 0);
  await c.ph.post(`/admin/photos/${c.a}/instagram/proposer`, { frame: 'black', watermark_set: '1', custom: 'on', caption: 'Ma légende à moi', message: 'Pour vendredi ?' });
  assert.equal(c.proposals().length, 1);
  assert.deepEqual([c.proposals()[0].frame, c.proposals()[0].caption, c.proposals()[0].watermark], ['black', 'Ma légende à moi', 0]);
  assert.equal(c.sent.length, 1);
  assert.equal(c.sent[0].to, 'marc@example.org');
  assert.match(c.sent[0].text, /seb propose « .+ » pour Instagram[\s\S]*Pour vendredi/);
  assert.match(body(await c.ph.get(`/admin/photos/${c.a}`)), /Proposée pour Instagram[\s\S]*Retirer la proposition[\s\S]*Mettre à jour la proposition/);
  // Mettre à jour sa proposition : pas de nouvel e-mail.
  await c.ph.post(`/admin/photos/${c.a}/instagram/proposer`, { frame: 'white', watermark_set: '1', custom: 'on', caption: 'Ma légende corrigée' });
  assert.equal(c.proposals().length, 1);
  assert.equal(c.proposals()[0].caption, 'Ma légende corrigée');
  assert.equal(c.sent.length, 1);
  // Le modérateur : Aujourd'hui, badge, « À valider ».
  const home = body(await c.mod.get('/admin'));
  assert.match(home, /1 photo proposée pour Instagram/);
  assert.match(home, /À valider<span class="nav-badge">1<\/span>/);
  const page = body(await c.mod.get('/admin/a-valider'));
  assert.match(page, /id="instagram"[\s\S]*Pour vendredi[\s\S]*Ma légende corrigée/);
  const pid = c.proposals()[0].id;
  const r = await c.mod.post(`/admin/instagram/propositions/${pid}/valider`);
  assert.equal(r.statusCode, 303);
  const [post] = c.posts();
  assert.deepEqual([post.photo_id, post.status, post.frame, post.caption], [c.a, 'queued', 'white', 'Ma légende corrigée']);
  assert.equal(c.proposals()[0].status, 'validee');
  assert.equal(c.sent.at(-1).to, 'seb@example.org');
  assert.match(c.sent.at(-1).text, /est dans la file Instagram \(validé par marc\)/);
  assert.match(body(await c.mod.get('/admin/instagram')), /<td>Proposée pour Instagram<\/td>[\s\S]*seb/);
  // Déjà dans la file : plus rien à proposer, et la fiche du photographe le dit.
  assert.match(body(await c.ph.get(`/admin/photos/${c.a}`)), /La file Instagram est réglée par le modérateur/);
  await c.ph.post(`/admin/photos/${c.a}/instagram/proposer`, {});
  assert.equal(c.proposals().length, 1);
});

test('renvoyer avec une remarque ; retirer sa proposition ; photo bloquée ; seulement ses photos', async t => {
  const c = await world(t);
  await c.ph.post(`/admin/photos/${c.a}/instagram/proposer`, { message: 'Celle-ci' });
  const pid = c.proposals()[0].id;
  await c.mod.post(`/admin/instagram/propositions/${pid}/renvoyer`, { message: '' });
  assert.equal(c.proposals()[0].status, 'proposee');                                      // remarque exigée
  await c.mod.post(`/admin/instagram/propositions/${pid}/renvoyer`, { message: 'Le cadre noir irait mieux.' });
  assert.deepEqual([c.proposals()[0].status, c.proposals()[0].remark], ['renvoyee', 'Le cadre noir irait mieux.']);
  assert.match(body(await c.ph.get('/admin')), /Remarque de marc[\s\S]*Instagram : Le cadre noir irait mieux/);
  assert.match(c.sent.at(-1).text, /ne part pas sur Instagram pour l’instant[\s\S]*Le cadre noir/);
  assert.equal(c.posts().length, 0);
  // Reproposer, puis retirer.
  await c.ph.post(`/admin/photos/${c.a}/instagram/proposer`, { frame: 'black', watermark_set: '1' });
  assert.equal(c.proposals().at(-1).status, 'proposee');
  await c.ph.post(`/admin/photos/${c.a}/instagram/retirer-proposition`);
  assert.equal(c.proposals().at(-1).status, 'retiree');
  assert.doesNotMatch(body(await c.mod.get('/admin')), /proposée pour Instagram/);
  // Photo bloquée par un refus : la proposition est refusée, avec la raison.
  c.db.prepare('UPDATE photos SET faces = 1, faces_override = 1 WHERE id = ?').run(c.b);
  const id = c.app.encounters.saveCard(null, { ref: 'S-0090', met_on: '2026-10-12', author_id: c.seb });
  c.db.prepare('UPDATE encounters SET refused = 1 WHERE id = ?').run(id);
  c.db.prepare('INSERT INTO encounter_photos (encounter_id, photo_id) VALUES (?, ?)').run(id, c.b);
  const n = c.proposals().length;
  await c.ph.post(`/admin/photos/${c.b}/instagram/proposer`, {});
  assert.equal(c.proposals().length, n);
  // Pas sur la photo d'un autre photographe ; le photographe ne valide pas.
  assert.ok([403, 404].includes((await c.ph.post(`/admin/photos/${c.other}/instagram/proposer`, {})).statusCode));
  await c.ph.post(`/admin/photos/${c.a}/instagram/proposer`, {});
  assert.equal((await c.ph.post(`/admin/instagram/propositions/${c.proposals().at(-1).id}/valider`)).statusCode, 403);
});

test('réglage par photographe : mettre ses photos dans la file sans validation (ses photos seulement, pas l’ordre)', async t => {
  const c = await world(t);
  const seb = c.app.accounts.bySub('seb');
  assert.match(body(await c.mod.get('/admin/circuit')), /Mettre ses photos dans la file Instagram sans validation/);
  await c.mod.post(`/admin/circuit/${seb.id}`, { modifier: '1', instagram: '1' });
  assert.deepEqual(c.app.accounts.bySub('seb').adjust.add, ['instagram.file']);
  assert.match(body(await c.ph.get(`/admin/photos/${c.a}`)), /action="\/admin\/instagram\/file"[\s\S]*Ajouter à la file Instagram/);
  assert.equal((await c.ph.post('/admin/instagram/file', { photo_id: String(c.a) })).statusCode, 303);
  assert.equal((await c.ph.post('/admin/instagram/file', { photo_id: String(c.other) })).statusCode, 403);
  assert.equal(c.posts().length, 1);
  const theirs = c.app.instagram.enqueue(c.other, { byName: 'marc' });
  const mine = c.posts()[0].id;
  assert.ok([403, 404].includes((await c.ph.post(`/admin/instagram/${theirs}/annuler`)).statusCode));   // pas la sienne : n’existe pas pour lui
  assert.equal((await c.ph.post(`/admin/instagram/${mine}/monter`)).statusCode, 403);       // l'ordre : toute la file
  assert.equal((await c.ph.post(`/admin/instagram/${mine}/annuler`)).statusCode, 303);
  assert.equal(c.posts().filter(p => p.status === 'queued').length, 1);
  assert.equal((await c.ph.get('/admin/instagram')).statusCode, 403);                       // la page de la file : non
  // Retiré : il propose de nouveau.
  await c.mod.post(`/admin/circuit/${seb.id}`, { modifier: '1' });
  assert.equal((await c.ph.post('/admin/instagram/file', { photo_id: String(c.a) })).statusCode, 403);
});
