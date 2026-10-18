import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as, billet, UA } from './carnet-helpers.js';
import { EVENTS } from '../server/securite/vocabulaire.js';
import { parisDay } from '../server/stats.js';

// Carnets et Vigie (registre docs/etudes/vigie-besoins-des-briques.md, section Carnets), côté site, avec une Vigie simulée :
//   BV-12  construction active neutralisée par le rendu d'un billet : malicious_input (émetteur server/carnet-markdown.js ·
//          billet), à l'enregistrement, une fois par champ, langue et contenu ; jamais à l'aperçu ni à l'enregistrement
//          automatique ; « moyen » pour une construction active, « bas » pour du HTML inoffensif ; jamais le texte ;
//   BV-13  valeur hors liste de ?rubrique=, ?par=, ?page=, ?carnet= : input_validation_fail (émetteur · carnet), comme
//          BV-3 ; sauf un billet retiré ou une ancienne adresse, un photographe vu depuis moins de 30 jours ;
//   BV-14  billet d'un autre photographe : authz_fail « hors portée » (objet billet, identifiant, écriture ou non).
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };

function fakeVigie() {
  const v = { events: [] };
  v.send = async (body, headers) => {
    const expected = crypto.createHmac('sha256', KEY).update(`${headers['x-vigie-ts']}.${headers['x-vigie-nonce']}.${body}`).digest('hex');
    assert.equal(headers['x-vigie-sig'], expected, 'signature du lot');
    v.events.push(...JSON.parse(body).lot);
  };
  v.of = (type, emetteur) => v.events.filter(e => e.type === type && (!emetteur || e.origine.emetteur === emetteur));
  return v;
}
async function site(t) {
  const fake = fakeVigie();
  const c = await setup(t, { seeded: true, env: VIGIE, vigieOptions: { send: fake.send, timers: false, pollDecisions: false } });
  c.app.publicVersion.save('v2');
  const flush = async () => { c.app.securite.runTasks(); c.app.securite.retryNow(); await c.app.securite.flush(); return fake; };
  let n = 0;
  const get = url => c.app.inject({ url, remoteAddress: `198.51.100.${++n}`, headers: { 'user-agent': UA, accept: 'text/html' } });
  return { ...c, fake, flush, get };
}
const RENDU = 'server/carnet-markdown.js · billet';

test('BV-12 : construction active neutralisée, signalée à l’enregistrement (moyen), une seule fois par contenu ; HTML inoffensif en bas ; rien à l’aperçu ni au brouillon automatique', async t => {
  const c = await site(t);
  const adm = as(c, { sub: 'z-adm', name: 'Admin', roles: ['admin'] });
  const p = await billet(c, { title: 'Billet de test', publish: false });
  // Aperçu et enregistrement automatique : le rendu ne signale rien.
  await adm.json(`/admin/carnet/${p.id}/apercu`, { langue: 'fr', body: '<script>alert(1)</script>' });
  await adm.json(`/admin/carnet/${p.id}/brouillon`, { langue: 'fr', body: '<script>alert(1)</script>' });
  let v = await c.flush();
  assert.equal(v.of('malicious_input', RENDU).length, 0);
  // Enregistrer : signalé, avec les nombres de constructions, jamais le texte.
  const body = 'Texte <script>alert("SECRET")</script> et [x](jav&#x09;ascript:alert(1)) et ![i](https://ailleurs.example/i.png)';
  await adm.post(`/admin/carnet/${p.id}`, { langue: 'fr', body });
  v = await c.flush();
  const e = v.of('malicious_input', RENDU);
  assert.equal(e.length, 1);
  assert.equal(e[0].severity, 'moyen');
  assert.equal(e[0].origine.composant, 'site · admin');
  assert.equal(e[0].sub, 'z-adm');
  assert.deepEqual([e[0].detail.objet, e[0].detail.billet, e[0].detail.champ, e[0].detail.langue, e[0].detail.familles], ['billet', p.id, 'corps', 'fr', ['xss']]);
  assert.ok(e[0].detail.constructions.script >= 1 && e[0].detail.constructions.schema_refuse >= 1 && e[0].detail.constructions.image_externe >= 1);
  assert.equal(e[0].detail.longueur, body.length);
  assert.ok(!JSON.stringify(v.events).includes('SECRET'), 'jamais le texte du billet');
  // Le même texte réenregistré (autre champ changé) : pas de second signalement ; un autre texte : un nouveau.
  await adm.post(`/admin/carnet/${p.id}`, { langue: 'fr', dek: 'Nouveau chapô.' });
  await adm.post(`/admin/carnet/${p.id}`, { langue: 'de', title: 'Titel <b>fett</b>' });
  v = await c.flush();
  const all = v.of('malicious_input', RENDU);
  assert.equal(all.length, 2);
  assert.deepEqual([all[1].detail.champ, all[1].detail.langue, all[1].severity], ['titre', 'de', 'bas'], 'HTML inoffensif : bas');
  // Un bloc de code qui cite du HTML n'est jamais compté.
  await adm.post(`/admin/carnet/${p.id}`, { langue: 'en', body: '```\n<script>alert(1)</script>\n```' });
  v = await c.flush();
  assert.equal(v.of('malicious_input', RENDU).length, 2);
  // La route de l'aperçu et du brouillon dit à la Vigie que le rendu signale (option de route config.vigie.corps, BV-12).
  const src = (await import('node:fs')).readFileSync(new URL('../server/routes/carnet.js', import.meta.url), 'utf8');
  for (const r of ['brouillon', 'apercu']) assert.match(src, new RegExp(`'/admin/carnet/:id/${r}', \\{ \\.\\.\\.W\\('carnet\\.voir'\\), config: \\{ perm: 'carnet\\.voir', vigie: \\{ corps: 'rendu' \\} \\} \\}`), r);
});

test('BV-13 : rubrique, regard, page et contexte de visionneuse hors liste signalés (émetteur · carnet) ; valeurs connues, billet retiré, ancienne adresse : rien', async t => {
  const c = await site(t);
  const p = await billet(c, { title: 'Lisbonne et Porto', authors: ['sebastien', 'julien'], body: 'photo:brume-sur-la-loire\n\nphoto:deux-minuit' });
  const old = await billet(c, { title: 'Ancien titre', body: 'photo:brume-sur-la-loire' });
  c.app.carnet.update(old.id, { slug: 'nouveau-titre' }, { sub: 'x', name: 'x' });
  const gone = await billet(c, { title: 'Retiré', body: 'photo:brume-sur-la-loire' });
  c.app.carnet.retire(gone.id, { sub: 'x', name: 'x' }, 'erreur');
  for (const url of ['/carnet', '/carnet?rubrique=voyages', '/carnet?par=julien', '/carnet?rubrique=voyages&par=sebastien', '/carnet?page=1', '/en/carnet?rubrique=voyages',
    `/photo/brume-sur-la-loire?carnet=${p.slug}`, '/photo/brume-sur-la-loire?carnet=ancien-titre', '/photo/brume-sur-la-loire?carnet=retire', '/carnet?rubrique=', '/carnet?rubrique=%3Cscript%3E'])
    assert.ok([200, 301, 303].includes((await c.get(url)).statusCode), url);
  let v = await c.flush();
  assert.deepEqual(v.of('input_validation_fail').map(e => e.detail.champ), []);
  for (const url of ['/carnet?rubrique=etiquettes', '/carnet?par=marcel', '/carnet?page=deux', '/carnet?page=0', '/de/carnet?rubrique=x', `/photo/brume-sur-la-loire?carnet=${'z'.repeat(80)}`])
    assert.equal((await c.get(url)).statusCode, 200, url);
  assert.equal((await c.get('/carnet?page=9')).statusCode, 404, 'au-delà de la dernière page : 404 (comptée par E17)');
  v = await c.flush();
  const fails = v.of('input_validation_fail');
  assert.deepEqual(fails.map(e => [e.detail.champ, e.detail.valeur]), [['rubrique', 'etiquettes'], ['par', 'marcel'], ['page', 'deux'], ['page', '0'], ['rubrique', 'x'], ['carnet', 'z'.repeat(60)]]);
  assert.ok(fails.every(e => e.origine.emetteur === 'server/routes/public.js · carnet' && e.detail.raison === 'valeur de filtre hors liste' && e.severity === EVENTS.input_validation_fail.severity));
  // Un photographe vu depuis moins de 30 jours (page « auteur: » comptée par la mesure d'audience) : pas signalé.
  c.db.prepare('INSERT INTO stats_pages (day, page, views) VALUES (?, ?, 1)').run(parisDay(new Date()), 'auteur:ancien-nom');
  await c.get('/carnet?par=ancien-nom');
  v = await c.flush();
  assert.equal(v.of('input_validation_fail').length, fails.length);
});

test('BV-14 : le billet d’un autre photographe, dans l’admin ou en aperçu public, signalé « hors portée » (lecture ou écriture) ; un identifiant inconnu ne l’est pas', async t => {
  const c = await site(t);
  const seb = as(c, { sub: 'z-seb', name: 'Sébastien', roles: ['photographe'], author: 'sebastien' });
  const other = await billet(c, { title: 'Celui de Julien', authors: ['julien'], publish: false });
  assert.equal((await seb.get(`/admin/carnet/${other.id}`)).statusCode, 404);
  assert.equal((await seb.post(`/admin/carnet/${other.id}`, { title: 'Volé' })).statusCode, 404);
  assert.equal((await seb.post(`/admin/carnet/${other.id}/publier`, { quand: 'maintenant' })).statusCode, 403, 'sans le droit de publier : refusé avant la portée');
  assert.equal((await seb.get('/admin/carnet/99999')).statusCode, 404);
  assert.equal((await seb.get('/carnet/celui-de-julien')).statusCode, 404);
  const v = await c.flush();
  const scope = v.of('authz_fail').filter(e => e.detail.raison === 'hors portée');
  assert.deepEqual(scope.map(e => [e.origine.emetteur, e.detail.objet, e.detail.id, e.detail.ecriture, e.sub]), [
    ['server/routes/carnet.js · portée', 'billet', other.id, false, 'z-seb'],
    ['server/routes/carnet.js · portée', 'billet', other.id, true, 'z-seb'],
    ['server/routes/public.js · carnet', 'billet', other.id, false, 'z-seb'],
  ]);
  assert.equal(scope[0].detail.permission, 'carnet.voir');
  assert.ok(v.of('authz_fail').some(e => e.detail.raison === 'permission' && e.detail.permission === 'carnet.publier'));
});

test('sans Vigie : mêmes pages, mêmes réponses, rien n’est émis', async t => {
  const c = await setup(t, { seeded: true, env: { VIGIE_URL: '' } });
  c.app.publicVersion.save('v2');
  assert.equal(c.app.securite.enabled, false);
  await billet(c, { title: 'Sans Vigie', body: '<script>x</script>' });
  const get = url => c.app.inject({ url, headers: { 'user-agent': UA, accept: 'text/html' } });
  for (const url of ['/carnet', '/carnet?rubrique=inconnue', '/carnet/sans-vigie']) assert.equal((await get(url)).statusCode, 200, url);
});
