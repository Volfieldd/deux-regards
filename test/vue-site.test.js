import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { as, billet, visitor } from './carnet-helpers.js';
import { VUE_TEXTES } from '../server/vue-site.js';

// Bouton « Voir en v1 / Voir en v2 » des pages publiques et vue de la session (server/vue-site.js,
// server/version-publique.js ; décision du propriétaire du 19 octobre 2026 : la v1 est gardée). Pour l'administrateur
// connecté (site.apparence) seulement : vue absente (il suit le réglage), « v1 » ou « v2 » ; jamais pour un visiteur,
// qui voit toujours le réglage ; jamais sur les pages des invités des galeries privées ; réponses d'une session jamais
// en cache partagé (304 compris).
const PHOTO = '/photo/brume-sur-la-loire';
const isV2 = body => /class="wrap vis-scene/.test(body);
const isV1 = body => /<main class="viewer"/.test(body);
const BUTTON = /<aside class="vue-site/;
// Le formulaire du bouton : { vue, vers, bouton, etat }.
const form = body => {
  const m = /<aside class="vue-site[^"]*" aria-label="[^"]+"><form method="post" action="\/admin\/apparence\/apercu-v2"><input type="hidden" name="_csrf" value="([^"]+)"><input type="hidden" name="vue" value="([^"]+)"><input type="hidden" name="vers" value="([^"]*)"><p class="vue-site-t">([^<]+)<\/p><button class="vue-site-b" type="submit">([^<]+)<\/button><\/form><\/aside>/.exec(body);
  return m && { csrf: m[1], vue: m[2], vers: m[3].replace(/&#39;/g, "'").replace(/&amp;/g, '&'), etat: m[4], bouton: m[5] };
};

async function site(t) {
  const c = await setup(t, { seeded: true });
  const admin = (sub = 'vue-admin') => as(c, { sub, roles: ['admin'] });
  return { ...c, admin, see: visitor(c) };
}

test('visiteur : jamais de bouton ; le réglage vaut, même avec cookie, paramètre, en-tête ou session forgés, pendant la vue d’un administrateur', async t => {
  const c = await site(t);
  const a = c.admin();
  for (const applied of ['v1', 'v2']) {
    c.app.publicVersion.save(applied);
    const other = applied === 'v1' ? 'v2' : 'v1';
    assert.equal((await a.post('/admin/apparence/apercu-v2', { vue: other, vers: PHOTO })).statusCode, 303);
    assert.ok((other === 'v2' ? isV2 : isV1)((await a.get(PHOTO)).body), `administrateur en vue ${other}`);
    const forged = [
      { url: `${PHOTO}?vue=${other}&v2=1&version=${other}&apercu=1&site_public=${other}` },
      { url: PHOTO, headers: { cookie: `vue=${other}; apercu_v2=1; version=${other}; site_public=${other}` } },
      { url: PHOTO, headers: { cookie: 'session=jeton-invente-0123456789' } },
      { url: PHOTO, headers: { cookie: `session=${crypto.createHash('sha256').update(a.cookies.session).digest('hex')}` } },   // l'empreinte, pas le jeton
      { url: PHOTO, headers: { 'x-csrf-token': a.csrf, 'x-version': other, 'x-vue': other, referer: 'http://localhost/admin/apparence' } },
    ];
    for (const o of forged) {
      const res = await c.app.inject({ url: o.url, headers: { accept: 'text/html', ...o.headers } });
      assert.equal(res.statusCode, 200);
      assert.ok((applied === 'v2' ? isV2 : isV1)(res.body), `${applied} : ${JSON.stringify(o)}`);
      assert.doesNotMatch(res.body, BUTTON);
      assert.doesNotMatch(res.body, /apercu-v2|name="_csrf"/);
      assert.equal(res.headers['cache-control'], undefined, 'pas de « private » pour un visiteur');
    }
    // Un visiteur ne peut pas poser de vue : sans session, refusé ; aucune trace de vue ensuite.
    const res = await c.app.inject({ method: 'POST', url: '/admin/apparence/apercu-v2', headers: { accept: 'text/html' }, payload: { vue: other } });
    assert.notEqual(res.statusCode, 303);
    assert.ok((applied === 'v2' ? isV2 : isV1)((await c.see(PHOTO)).body));
    await a.post('/admin/apparence/apercu-v2', { vue: 'suivre' });
  }
});

test('équipe sans le droit d’apparence : ni bouton ni vue, mais jamais en cache partagé', async t => {
  const c = await site(t);
  for (const role of ['moderateur', 'photographe', 'relecteur']) {
    const u = as(c, { sub: `vue-${role}`, roles: [role] });
    assert.equal((await u.post('/admin/apparence/apercu-v2', { vue: 'v2' })).statusCode, 403, role);
    const res = await u.get(PHOTO);
    assert.ok(isV1(res.body), role);
    assert.doesNotMatch(res.body, BUTTON, role);
    assert.equal(res.headers['cache-control'], 'private, no-store', role);
  }
});

test('administrateur : bouton, vue v1 et vue v2 dans les deux réglages, retour à « suivre » ; journal d’audit', async t => {
  const c = await site(t);
  const a = c.admin();
  // Réglage v1, aucune vue : la v1, comme les visiteurs ; le bouton propose la v2.
  let page = await a.get(PHOTO);
  assert.ok(isV1(page.body));
  let f = form(page.body);
  assert.deepEqual({ ...f, csrf: undefined }, { csrf: undefined, vue: 'v2', vers: PHOTO, etat: 'Vous voyez la v1, comme les visiteurs.', bouton: 'Voir en v2' });
  assert.equal(f.csrf, a.csrf);
  assert.match(page.body, /<aside class="vue-site" aria-label="Version du site, visible par vous seul">/);
  // Clic : vue v2, retour à la même page.
  let r = await a.post('/admin/apparence/apercu-v2', { vue: f.vue, vers: f.vers });
  assert.equal(r.statusCode, 303);
  assert.equal(r.headers.location, PHOTO);
  page = await a.get(PHOTO);
  assert.ok(isV2(page.body));
  f = form(page.body);
  assert.deepEqual({ vue: f.vue, vers: f.vers, etat: f.etat, bouton: f.bouton }, { vue: 'suivre', vers: PHOTO, etat: 'Vous seul voyez la v2 ; les visiteurs voient la v1.', bouton: 'Voir en v1' });
  assert.match(page.body, /<aside class="vue-site vue-site--forcee"/);
  assert.ok(isV1((await c.see(PHOTO)).body), 'le visiteur reste en v1');
  // Clic : retour à « suivre » (pas une vue v1 forcée).
  await a.post('/admin/apparence/apercu-v2', { vue: f.vue, vers: f.vers });
  assert.equal(c.app.publicVersion.viewOf({ session: { id: crypto.createHash('sha256').update(a.cookies.session).digest('hex') }, can: () => true }), null);
  assert.ok(isV1((await a.get(PHOTO)).body));
  // Vue v1 forcée sous le réglage v1 : permise par la route, sans effet visible (la v1, « comme les visiteurs »).
  await a.post('/admin/apparence/apercu-v2', { vue: 'v1' });
  assert.equal(form((await a.get(PHOTO)).body).etat, 'Vous voyez la v1, comme les visiteurs.');

  // Réglage v2 : la vue v1 forcée reste ; la vue « suivre » donne la v2.
  c.app.publicVersion.save('v2');
  page = await a.get(PHOTO);
  assert.ok(isV1(page.body), 'vue v1 gardée quand le réglage passe en v2');
  f = form(page.body);
  assert.deepEqual({ vue: f.vue, etat: f.etat, bouton: f.bouton }, { vue: 'suivre', etat: 'Vous seul voyez la v1 ; les visiteurs voient la v2.', bouton: 'Voir en v2' });
  assert.ok(isV2((await c.see(PHOTO)).body), 'les visiteurs voient la v2');
  await a.post('/admin/apparence/apercu-v2', { vue: 'suivre', vers: PHOTO });
  page = await a.get(PHOTO);
  assert.ok(isV2(page.body));
  f = form(page.body);
  assert.deepEqual({ vue: f.vue, etat: f.etat, bouton: f.bouton }, { vue: 'v1', etat: 'Vous voyez la v2, comme les visiteurs.', bouton: 'Voir en v1' });
  await a.post('/admin/apparence/apercu-v2', { vue: 'v1', vers: PHOTO });
  assert.ok(isV1((await a.get(PHOTO)).body));
  // Un autre administrateur suit le réglage : la vue est celle d'une session.
  assert.ok(isV2((await c.admin('vue-admin-2').get(PHOTO)).body));

  // Journal d'audit : chaque clic, avec son sens et ce que voient les visiteurs.
  const details = c.db.prepare("SELECT detail FROM audit_log WHERE sub = 'vue-admin' AND action = 'POST /admin/apparence/apercu-v2' ORDER BY id").pluck().all();
  assert.deepEqual(details, ['vue de la session : v2 (visiteurs : v1)', 'vue de la session : suit le réglage (v1)', 'vue de la session : v1 (visiteurs : v1)',
    'vue de la session : suit le réglage (v2)', 'vue de la session : v1 (visiteurs : v2)']);
  // Aucun réglage n'a changé par le bouton.
  assert.equal(c.app.publicVersion.setting(), 'v2');
});

test('route de la vue : CSRF et permission exigés, valeur inconnue refusée, retour borné au site ; ancienne forme apercu=1/0', async t => {
  const c = await site(t);
  const a = c.admin();
  const raw = payload => c.app.inject({ method: 'POST', url: '/admin/apparence/apercu-v2', cookies: a.cookies, headers: { accept: 'text/html' }, payload });
  assert.equal((await raw({ vue: 'v2' })).statusCode, 403, 'sans jeton CSRF');
  assert.equal((await raw({ vue: 'v2', _csrf: 'faux' })).statusCode, 403, 'faux jeton');
  assert.ok(isV1((await a.get(PHOTO)).body));
  for (const vue of ['v3', '', 'V2', 'suivre ', '1']) assert.equal((await a.post('/admin/apparence/apercu-v2', { vue })).statusCode, 400, `vue=${vue}`);
  assert.ok(isV1((await a.get(PHOTO)).body));
  assert.equal((await a.post('/admin/apparence/apercu-v2', { vue: 'v2', vers: 'https://ailleurs.example/' })).headers.location, '/');
  assert.equal((await a.post('/admin/apparence/apercu-v2', { vue: 'v2', vers: '/admin/photos' })).headers.location, '/');
  assert.equal((await a.post('/admin/apparence/apercu-v2', { vue: 'suivre', vers: '//ailleurs.example/x' })).headers.location, '/admin/apparence');
  assert.equal((await a.post('/admin/apparence/apercu-v2', { apercu: '1', vers: '/a-propos' })).headers.location, '/a-propos');
  assert.ok(isV2((await a.get(PHOTO)).body));
  await a.post('/admin/apparence/apercu-v2', { apercu: '0' });
  assert.ok(isV1((await a.get(PHOTO)).body));
});

test('cache : private, no-store pour toute réponse publique d’une session, 304 du flux compris ; jamais pour un visiteur', async t => {
  const c = await site(t);
  await billet(c, { title: 'Lisbonne et Porto' });
  const a = c.admin();
  for (const applied of ['v1', 'v2']) {
    c.app.publicVersion.save(applied);
    for (const vue of ['suivre', 'v1', 'v2']) {
      await a.post('/admin/apparence/apercu-v2', { vue });
      for (const url of ['/', PHOTO, '/en/a-propos', '/de/recherche', '/nexiste-pas', '/sitemap.xml', '/robots.txt', '/carnet']) {
        const res = await a.get(url);
        assert.equal(res.headers['cache-control'], 'private, no-store', `${applied}, vue ${vue} : ${url}`);
      }
      // Flux des Carnets (ETag, 304) : visible en v2 ; la réponse et son 304 restent privés.
      const feed = await a.get('/carnet/flux.xml');
      if ((vue === 'suivre' ? applied : vue) === 'v2') {
        assert.equal(feed.statusCode, 200);
        assert.ok(feed.headers.etag);
        const again = await a.get('/carnet/flux.xml', { 'if-none-match': feed.headers.etag });
        assert.equal(again.statusCode, 304);
        assert.equal(again.headers['cache-control'], 'private, no-store', `304, ${applied}, vue ${vue}`);
      } else assert.equal(feed.statusCode, 404);
      assert.equal(feed.headers['cache-control'], 'private, no-store');
    }
    // Les fichiers statiques, identiques pour tous, gardent leur cache.
    assert.notEqual((await a.get('/static/css/v2/public.css')).headers['cache-control'], 'private, no-store');
    // Le visiteur : jamais « private » ; son flux (v2) garde son cache public et son 304.
    for (const url of ['/', PHOTO]) assert.equal((await c.see(url)).headers['cache-control'], undefined, url);
    if (applied === 'v2') {
      const feed = await c.see('/carnet/flux.xml');
      assert.equal(feed.headers['cache-control'], 'public, max-age=900');
      const again = await c.app.inject({ url: '/carnet/flux.xml', headers: { 'if-none-match': feed.headers.etag } });
      assert.equal(again.statusCode, 304);
      assert.equal(again.headers['cache-control'], 'public, max-age=900');
    }
  }
});

test('Carnets : introuvables en vue v1 (comme pour un visiteur) ; sur une page des Carnets, le bouton ouvre l’accueil en v1 et le dit', async t => {
  const c = await site(t);
  await billet(c, { title: 'Lisbonne et Porto' });
  const a = c.admin();
  // Réglage v2, vue v1 : 404, et la page introuvable porte le bouton qui ramène à la même adresse en v2.
  c.app.publicVersion.save('v2');
  await a.post('/admin/apparence/apercu-v2', { vue: 'v1' });
  for (const url of ['/carnet', '/carnet/lisbonne-et-porto', '/en/carnet', '/carnet/flux.xml']) assert.equal((await a.get(url)).statusCode, 404, url);
  const nf = await a.get('/carnet/lisbonne-et-porto');
  const f404 = form(nf.body);
  assert.deepEqual({ vue: f404.vue, vers: f404.vers, bouton: f404.bouton }, { vue: 'suivre', vers: '/carnet/lisbonne-et-porto', bouton: 'Voir en v2' });
  assert.doesNotMatch((await a.get('/')).body, /href="\/carnet"/, 'aucun lien vers les Carnets en vue v1');
  // Vue « suivre » (v2) : le billet ; le bouton n'y mène pas en v1, il ouvre l'accueil et le dit.
  await a.post('/admin/apparence/apercu-v2', { vue: 'suivre' });
  for (const [url, home, bouton, note] of [['/carnet/lisbonne-et-porto', '/', 'Voir l’accueil en v1', 'Cette page n’existe qu’en v2.'],
    ['/en/carnet', '/en', 'View the home page in v1', 'This page only exists in v2.'], ['/de/carnet', '/de', 'Startseite in v1 ansehen', 'Diese Seite gibt es nur in v2.']]) {
    const page = await a.get(url);
    assert.equal(page.statusCode, 200, url);
    const f = form(page.body);
    assert.equal(f.vue, 'v1', url);
    assert.equal(f.vers, home, url);
    assert.equal(f.bouton, bouton, url);
    assert.ok(f.etat.endsWith(note), `${url} : ${f.etat}`);
  }
  // Réglage v1, vue v2 : le billet ; le bouton ramène à « suivre » sur l'accueil.
  c.app.publicVersion.save('v1');
  await a.post('/admin/apparence/apercu-v2', { vue: 'v2' });
  const f = form((await a.get('/carnet')).body);
  assert.deepEqual({ vue: f.vue, vers: f.vers }, { vue: 'suivre', vers: '/' });
  // Un visiteur, en même temps : 404.
  assert.equal((await c.see('/carnet')).statusCode, 404);
});

test('galeries privées : aucune page des invités ne porte le bouton, même pour un administrateur', async t => {
  const c = await site(t);
  const sp = c.app.spaces;
  const authorId = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const id = sp.createSpace({ title: 'Lisbonne et Porto', closes: new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10) }, { authorId, by: 'test' });
  sp.addPhotos(id, c.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 2").pluck().all());
  sp.setState(id, 'ouverte', null);
  const inv = await sp.createInvite(id, { label: 'Lucie', lang: 'fr', expires: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), favoris: '1' }, { by: 'test', request: null });
  const a = c.admin();
  for (const vue of ['suivre', 'v1', 'v2']) {
    await a.post('/admin/apparence/apercu-v2', { vue });
    const page = await a.get(`/g/${inv.token}`);
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /css\/v2\/prive\.css/);
    assert.doesNotMatch(page.body, BUTTON, vue);
    assert.doesNotMatch(page.body, /apercu-v2/, vue);
  }
  // Sur une page publique ordinaire, à côté, le bouton est là.
  assert.match((await a.get('/')).body, BUTTON);
});

test('trois langues : le bouton dans la langue de la page, en v1 comme en v2', async t => {
  const c = await site(t);
  const a = c.admin();
  for (const [prefix, lang] of [['', 'fr'], ['/en', 'en'], ['/de', 'de']]) {
    const tx = VUE_TEXTES[lang];
    let page = await a.get(`${prefix}${PHOTO}`);
    assert.match(page.body, new RegExp(`<html lang="${lang}"`));
    let f = form(page.body);
    assert.equal(f.bouton, tx.voir('v2'), lang);
    assert.equal(f.etat, tx.comme('v1').replace(/'/g, '&#39;'), lang);
    assert.equal(f.vers, `${prefix}${PHOTO}`);
    assert.match(page.body, new RegExp(`aria-label="${tx.label}"`));
    await a.post('/admin/apparence/apercu-v2', { vue: 'v2' });
    page = await a.get(`${prefix}${PHOTO}`);
    assert.ok(isV2(page.body));
    f = form(page.body);
    assert.equal(f.bouton, tx.voir('v1'), lang);
    assert.equal(f.etat, tx.seul('v2', 'v1'), lang);
    await a.post('/admin/apparence/apercu-v2', { vue: 'suivre' });
  }
  // Toutes les clés ont leurs trois langues, et elles diffèrent du français.
  for (const k of Object.keys(VUE_TEXTES.fr)) for (const l of ['en', 'de']) {
    const v = VUE_TEXTES[l][k], fr = VUE_TEXTES.fr[k];
    assert.ok(v, `${l} : ${k}`);
    assert.notEqual(typeof v === 'function' ? v('v1', 'v2') : v, typeof fr === 'function' ? fr('v1', 'v2') : fr, `${l} : ${k}`);
  }
});

test('page Apparence : explique le bouton, montre la vue de la session et la change ; plus rien n’annonce un retrait de la v1', async t => {
  const c = await site(t);
  const a = c.admin();
  let page = (await a.get('/admin/apparence')).body;
  assert.match(page, /un petit bouton « Voir en v1 » ou « Voir en v2 », visible par vous seul/);
  assert.match(page, /Votre vue suit ce réglage, comme les visiteurs\./);
  assert.match(page, /<input type="hidden" name="vue" value="v2">\s*<input type="hidden" name="vers" value="\/">/);
  assert.match(page, /Voir le site en v2/);
  await a.post('/admin/apparence/apercu-v2', { vue: 'v2' });
  page = (await a.get('/admin/apparence')).body;
  assert.match(page, /Votre vue : la v2, pour vous seul, sur cette session\./);
  assert.match(page, /<input type="hidden" name="vue" value="suivre">/);
  assert.match(page, /Revenir à la version des visiteurs/);
  const section = page.slice(page.indexOf('id="site-public"'), page.indexOf('</section>', page.indexOf('id="site-public"')));
  assert.doesNotMatch(section, /retir|retrait|Ouvrir l’aperçu/i);
  const { translator } = await import('../server/admin-i18n.js');
  for (const l of ['en', 'de']) {
    for (const k of ['Votre vue suit ce réglage, comme les visiteurs.', 'Revenir à la version des visiteurs', 'Voir le site en {v}', 'Vue inconnue.', 'La v1 est appliquée : tous les visiteurs la voient.']) {
      assert.notEqual(translator(l)(k), k, `${l} : ${k}`);
    }
  }
});
