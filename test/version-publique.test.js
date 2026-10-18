import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { fmt, visSizes } from '../server/v2-vues.js';
import { shortDate } from '../server/format.js';

// Site public v1 / v2 (server/version-publique.js) : réglage pour tous, aperçu réservé à l'administrateur connecté,
// repli sur la v1 d'une page sans gabarit v2, réponses jamais gardées dans un cache partagé pendant l'aperçu.
const PHOTO = '/photo/brume-sur-la-loire';
const isV2 = body => /class="wrap vis-scene/.test(body);
const isV1 = body => /<main class="viewer"/.test(body);

async function site(t, opts = {}) {
  const ctx = await setup(t, { seeded: true, ...opts });
  const store = createSessionStore(ctx.db);
  const as = role => {
    ctx.app.accounts.ensure({ sub: `test:${role}`, name: role, roles: [role] });
    const token = store.create({ sub: `test:${role}`, name: role, roles: [role] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const get = (url, o = {}) => ctx.app.inject({ method: 'GET', url, cookies: { session: token, ...o.cookies }, headers: { accept: 'text/html' } });
    const post = (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'text/html' }, payload: { _csrf: csrf, ...payload } });
    return { token, csrf, get, post, logout: () => ctx.app.inject({ method: 'POST', url: '/auth/logout', cookies: { session: token }, payload: { _csrf: csrf } }) };
  };
  const visit = (url, o = {}) => ctx.app.inject({ method: 'GET', url, ...o });
  return { ...ctx, as, visit };
}

test('par défaut, tout le monde voit la v1, administrateur compris', async t => {
  const c = await site(t);
  assert.equal(c.app.publicVersion.setting(), 'v1');
  assert.ok(isV1((await c.visit(PHOTO)).body));
  assert.ok(isV1((await c.as('admin').get(PHOTO)).body));
});

test('visiteur : la v1 quand le réglage est v1, quels que soient cookies, paramètres ou en-têtes forgés', async t => {
  const c = await site(t);
  const admin = c.as('admin');
  await admin.post('/admin/apparence/apercu-v2', { apercu: '1' });                      // un administrateur est en aperçu
  assert.ok(isV2((await admin.get(PHOTO)).body));
  const forged = [
    { url: `${PHOTO}?v2=1&version=v2&apercu=1&site_public=v2` },
    { url: PHOTO, cookies: { apercu_v2: '1', version: 'v2', site_public: 'v2', apercu_theme: 'nicephos-nuit' } },
    { url: PHOTO, cookies: { session: 'jeton-invente-0123456789' } },
    { url: PHOTO, cookies: { session: crypto.createHash('sha256').update(admin.token).digest('hex') } },   // l'empreinte, pas le jeton
    { url: PHOTO, headers: { 'x-csrf-token': admin.csrf, 'x-version': 'v2', referer: 'http://localhost/admin/apparence' } },
  ];
  for (const o of forged) {
    const res = await c.visit(o.url, { cookies: o.cookies, headers: o.headers });
    assert.equal(res.statusCode, 200);
    assert.ok(isV1(res.body), JSON.stringify(o));
    assert.doesNotMatch(res.body, /Aperçu de la v2/);
    assert.notEqual(res.headers['cache-control'], 'private, no-store');
  }
  // Ouvrir l'aperçu sans session, ou avec un faux jeton CSRF : refusé.
  assert.notEqual((await c.visit('/admin/apparence/apercu-v2', { method: 'POST', payload: { apercu: '1' } })).statusCode, 303);
  const bad = await c.app.inject({ method: 'POST', url: '/admin/apparence/apercu-v2', cookies: { session: c.as('admin').token }, headers: { accept: 'text/html' }, payload: { _csrf: 'faux', apercu: '1' } });
  assert.equal(bad.statusCode, 403);
  assert.ok(isV1((await c.visit(PHOTO)).body));
});

test('aperçu : réservé à l’administrateur (site.apparence), private no-store, bandeau, quitté par POST', async t => {
  const c = await site(t);
  // Un modérateur ou un photographe n'a pas le droit d'apparence : 403, et rien ne change pour lui.
  for (const role of ['moderateur', 'photographe', 'relecteur']) {
    const u = c.as(role);
    assert.equal((await u.post('/admin/apparence/apercu-v2', { apercu: '1' })).statusCode, 403, role);
    assert.ok(isV1((await u.get(PHOTO)).body), role);
  }
  const a = c.as('admin');
  const on = await a.post('/admin/apparence/apercu-v2', { apercu: '1', vers: PHOTO });
  assert.equal(on.statusCode, 303);
  assert.equal(on.headers.location, PHOTO);
  // Journal d'audit : qui, quoi.
  assert.ok(c.db.prepare("SELECT 1 FROM audit_log WHERE sub = 'test:admin' AND detail = 'aperçu de la v2 ouvert'").get());
  const page = await a.get(PHOTO);
  assert.ok(isV2(page.body));
  assert.equal(page.headers['cache-control'], 'private, no-store');
  assert.match(page.body, /Aperçu de la v2 \(visible par vous seul\)/);
  assert.match(page.body, new RegExp(`name="_csrf" value="${a.csrf}"`));
  // Toutes les réponses publiques de la session (pages en v1 comprises, 404, sitemap) ; pas les fichiers statiques.
  for (const url of ['/', '/a-propos', '/en/photo/brume-sur-la-loire', '/nexiste-pas', '/sitemap.xml', '/robots.txt']) {
    assert.equal((await a.get(url)).headers['cache-control'], 'private, no-store', url);
  }
  assert.notEqual((await a.get('/static/css/v2/public.css')).headers['cache-control'], 'private, no-store');
  // En même temps, le visiteur : v1, et une réponse sans « private ».
  const v = await c.visit(PHOTO);
  assert.ok(isV1(v.body));
  assert.equal(v.headers['cache-control'], undefined);
  // Un autre administrateur n'est pas en aperçu (le drapeau est celui d'une session).
  assert.ok(isV1((await c.as('admin').get(PHOTO)).body));
  // Quitter l'aperçu : retour à la page d'où l'on vient, en v1.
  const off = await a.post('/admin/apparence/apercu-v2', { apercu: '0', vers: PHOTO });
  assert.equal(off.headers.location, PHOTO);
  const after = await a.get(PHOTO);
  assert.ok(isV1(after.body));
  assert.notEqual(after.headers['cache-control'], 'private, no-store');
  // Une adresse de retour hors du site est ignorée.
  assert.equal((await a.post('/admin/apparence/apercu-v2', { apercu: '0', vers: '//ailleurs.example/x' })).headers.location, '/admin/apparence');
  assert.equal((await a.post('/admin/apparence/apercu-v2', { apercu: '1', vers: 'https://ailleurs.example/' })).headers.location, '/');
});

test('aperçu : tombe avec la session (déconnexion, droit retiré)', async t => {
  const c = await site(t);
  const a = c.as('admin');
  await a.post('/admin/apparence/apercu-v2', { apercu: '1' });
  assert.ok(isV2((await a.get(PHOTO)).body));
  // Rôle retiré : le droit est relu à chaque requête.
  c.app.accounts.ensure({ sub: 'test:admin', roles: ['admin'] });
  c.db.prepare("UPDATE accounts SET roles = '[\"relecteur\"]' WHERE sub = 'test:admin'").run();
  const res = await a.get(PHOTO);
  assert.ok(isV1(res.body));
  assert.notEqual(res.headers['cache-control'], 'private, no-store');
  c.db.prepare("UPDATE accounts SET roles = '[\"admin\"]' WHERE sub = 'test:admin'").run();
  assert.ok(isV2((await a.get(PHOTO)).body));
  await a.logout();
  assert.ok(isV1((await a.get(PHOTO)).body));
});

test('repli : une page sans gabarit v2 reste en v1 (aperçu comme réglage v2) ; l’admin ne change pas', async t => {
  const c = await site(t);
  const a = c.as('admin');
  await a.post('/admin/apparence/apercu-v2', { apercu: '1' });
  // Page d'erreur d'une adresse publique (views/auth-error.eta) : la seule page publique restée sans gabarit v2, toutes les
  // autres (À propos, page introuvable comprises) ont désormais le leur. Ici, un envoi illisible vers « J'aime ».
  const error = await c.app.inject({ method: 'POST', url: `${PHOTO}/aime`, cookies: { session: a.token }, headers: { accept: 'text/html', 'content-type': 'application/json' }, payload: '{illisible' });
  assert.equal(error.statusCode, 400);
  assert.match(error.body, /css\/site\.css/);                                         // la v1
  assert.doesNotMatch(error.body, /css\/v2\//);
  assert.match(error.body, /cette page n’a pas encore sa version v2/);                 // le bandeau, même en v1
  const notFound = await a.get('/nexiste-pas');
  assert.equal(notFound.statusCode, 404);
  assert.match(notFound.body, /css\/v2\/pages\.css/);                                 // la page introuvable v2
  // L'admin et ses pages ne prennent ni la v2 ni le bandeau.
  const admin = await a.get('/admin/apparence');
  assert.doesNotMatch(admin.body, /css\/v2\/|Aperçu de la v2 \(visible/);
  assert.match(admin.body, /Aperçu de la v2 ouvert/);
  // Un nom de gabarit qui n'est pas celui d'une page publique n'est jamais cherché dans views/v2/.
  assert.equal(c.app.publicVersion.hasV2('../layout'), false);
  assert.equal(c.app.publicVersion.hasV2('admin/home'), false);
  assert.equal(c.app.publicVersion.hasV2('photo'), true);
  assert.equal(c.app.publicVersion.hasV2('about'), true);
  assert.equal(c.app.publicVersion.hasV2('auth-error'), false);
});

test('réglage v2 : tout le monde voit la v2 (sans no-store ni bandeau) ; noté au journal ; valeur inconnue ignorée', async t => {
  const c = await site(t);
  const a = c.as('admin');
  assert.equal((await a.post('/admin/apparence', { site_public: 'v3' })).statusCode, 303);
  assert.equal(c.app.publicVersion.setting(), 'v1');
  assert.equal((await a.post('/admin/apparence', { site_public: 'v2' })).statusCode, 303);
  assert.equal(c.app.publicVersion.setting(), 'v2');
  assert.ok(c.db.prepare("SELECT 1 FROM audit_log WHERE sub = 'test:admin' AND detail = 'site public : v1 → v2'").get());
  for (const lang of ['', '/en', '/de']) {
    const res = await c.visit(`${lang}${PHOTO}`);
    assert.ok(isV2(res.body), lang);
    assert.equal(res.headers['cache-control'], undefined);
    assert.doesNotMatch(res.body, /Aperçu de la v2/);
  }
  // La page Apparence le dit, et ne propose plus l'aperçu.
  const page = (await a.get('/admin/apparence')).body;
  assert.match(page, /value="v2" checked/);
  assert.match(page, /La v2 est appliquée/);
  // Retour en v1.
  await a.post('/admin/apparence', { site_public: 'v1' });
  assert.ok(isV1((await c.visit(PHOTO)).body));
  // Le thème et la marque ne bougent pas quand on n'envoie que la version.
  assert.equal(c.app.appearance.themeId(), 'atelier');
});

test('visionneuse v2 : la photo d’abord, sizes à la hauteur de l’écran, cartel, gestes, sans style ni script en ligne', async t => {
  const c = await site(t);
  c.app.publicVersion.save('v2');
  const res = await c.visit(PHOTO);
  const b = res.body;
  // CSP stricte : aucun attribut style, aucun script en ligne, aucune ressource tierce.
  assert.doesNotMatch(b, /\sstyle="/);
  assert.doesNotMatch(b, /<script(?![^>]*\ssrc=)/);
  assert.doesNotMatch(b, /\ssrcset="[^"]*https?:|\ssrc="https?:|<link[^>]+href="https?:\/\/(?!localhost)(?![^>]*rel="(?:canonical|alternate)")/);
  assert.match(b, /<link rel="stylesheet" href="\/static\/css\/v2\/tokens\.css\?v=[0-9a-f]{10}">/);
  assert.match(b, /<script src="\/static\/js\/v2\/site\.js\?v=[0-9a-f]{10}" defer><\/script>/);
  assert.doesNotMatch(b, /css\/site\.css|themes\/nicephos\.css/);
  // Format posé en classe ; sizes calculé sur la hauteur, plus jamais « 100vw » pour la photo.
  assert.match(b, /class="wrap vis-scene fmt-150"/);
  assert.match(b, /sizes="\(max-width: 767px\) min\(100vw, calc\(\(100vh - 191px\) \* 1\.5\)\)/);
  assert.match(b, /fetchpriority="high"/);
  // Cartel : figcaption avant la photo dans le document, titre en H1 (casse du titre), méta « Auteur · Lieu · date ».
  assert.match(b, /<figcaption class="cartel cartel--grand vis-cartel">.*<h1 class="cartel-t">Brume sur la Loire<\/h1><span class="cartel-m">Sébastien · Anjou · mars 2024<\/span>/s);
  assert.ok(b.indexOf('<figcaption') < b.indexOf('<picture'));
  // Retour qui dit où il mène, flèches nommées, position.
  assert.match(b, /<a class="sh-retour" href="\/#galerie" data-retour>.*<span class="sr-only">Retour\u202f: <\/span>Galerie<\/span><\/a>/s);
  assert.match(b, /rel="prev"><svg[^>]*>.*?<\/svg><span class="vis-fleche-t">Précédente<span class="sr-only">\u202f: /s);
  assert.match(b, /<span class="vis-compte donnee">1 \/ 12<\/span>/);
  // J'aime en bascule (POST, sans script), Partager (page sans script), Signaler, « Vous êtes sur cette photo ? ».
  assert.match(b, /<form class="bascule-form" method="post" action="\/photo\/brume-sur-la-loire\/aime" data-like/);
  assert.match(b, /<button class="bascule" type="submit" aria-pressed="false">/);
  assert.match(b, /href="\/photo\/brume-sur-la-loire\/partager" rel="nofollow" data-share/);
  assert.match(b, /href="\/photo\/brume-sur-la-loire\/signaler" rel="nofollow">Signaler cette photo</);
  assert.match(b, /href="\/bonjour">Recevez-la, ou donnez ou refusez votre accord</);
  // Plein écran et aide du clavier : seulement avec script (.js-seul).
  assert.match(b, /<div class="vis-clavier js-seul">/);
  assert.match(b, /<dialog class="vis-plein" data-plein/);
  // Langue : le code visible dans le nom lu ; menu sans script.
  assert.match(b, /<summary><span>FR<\/span><span class="sr-only"> – Langue\u202f: français<\/span>/);
  assert.match(b, /<details class="sh-menu" data-menu>/);
  // Pas de vente dans ce lot.
  assert.doesNotMatch(b, /tirages|Tirage :|panier/i);
  // Titre de la page : la photo, son auteur, le contexte et la position.
  assert.match(b, /<title>Brume sur la Loire — Sébastien\u00a0· Galerie \(1 \/ 12\)\u00a0· Test<\/title>/);
});

test('visionneuse v2 : contexte d’une série ou d’un regard, allemand, J’aime sans script', async t => {
  const c = await site(t);
  c.app.publicVersion.save('v2');
  const serie = (await c.visit(`${PHOTO}?serie=paysage`)).body;
  assert.match(serie, /<span class="sr-only">Retour\u202f: <\/span>Paysage<\/span>/);
  assert.match(serie, /aria-label="Photos\u202f: Paysage"/);
  assert.match(serie, /href="\/photo\/[^"?]+\?serie=paysage" rel="next"/);
  const de = (await c.visit(`/de${PHOTO}?regard=sebastien`)).body;
  assert.match(de, /<html lang="de"/);
  assert.match(de, /Zurück: <\/span>Sébastien</);
  assert.match(de, /<span class="sh-menu-t">Menü<\/span>/);
  assert.match(de, /DE<\/span><span class="sr-only"> – Sprache: Deutsch/);
  // Sans script : le formulaire J'aime renvoie à la photo, le compteur paraît dès 1.
  const like = await c.visit(`${PHOTO}/aime`, { method: 'POST', payload: {} });
  assert.equal(like.statusCode, 303);
  assert.match((await c.visit(PHOTO)).body, /<span class="bascule-n" data-like-n>1<\/span>/);
});

test('visionneuse v2 : points d’accroche de la Vigie repris (lien piège caché, robots.txt)', async t => {
  const c = await site(t, { env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { send: async () => {}, timers: false, pollDecisions: false } });
  c.app.publicVersion.save('v2');
  const b = (await c.visit(PHOTO)).body;
  assert.ok(isV2(b));
  assert.match(b, /<a href="\/galerie\/tout-telecharger" rel="nofollow" hidden tabindex="-1" aria-hidden="true">archives<\/a>/);
  assert.match((await c.visit('/robots.txt')).body, /Disallow: \/galerie\/tout-telecharger/);
  // Sans Vigie, pas de lien piège (comme en v1).
  const plain = await site(t, { env: { VIGIE_URL: '' } });               // sans Vigie, même sous npm run test:vigie
  plain.app.publicVersion.save('v2');
  assert.doesNotMatch((await plain.visit(PHOTO)).body, /tout-telecharger/);
});

test('aides v2 : format arrondi vers le bas, sizes, date abrégée insécable', () => {
  assert.deepEqual(fmt({ width: 900, height: 600 }), { r: 1.5, cls: 'fmt-150', vertical: false });
  assert.deepEqual(fmt({ width: 4000, height: 2667 }), { r: 1.5, cls: 'fmt-150', vertical: false });
  assert.equal(fmt({ width: 600, height: 920 }).cls, 'fmt-64');                       // jamais plus large que la photo
  assert.deepEqual(fmt({ width: 600, height: 900 }), { r: 0.6667, cls: 'fmt-2x3', vertical: true });   // formats courants : exacts
  assert.equal(fmt({ width: 1920, height: 1080 }).cls, 'fmt-16x9');
  assert.equal(fmt({ width: 10000, height: 1000 }).cls, 'fmt-400');
  assert.equal(fmt({ width: 100, height: 1000 }).cls, 'fmt-30');
  assert.equal(fmt({}).cls, 'fmt-150');
  assert.match(visSizes(fmt({ width: 900, height: 600 })), /min\(calc\(100vw - 160px\), calc\(\(100vh - 191px\) \* 1\.5\), 1350px\)$/);
  assert.match(visSizes(fmt({ width: 600, height: 900 })), /calc\(\(100vh - 120px\) \* 0\.67\)/);
  assert.equal(shortDate('2026-10-10'), '10 oct. 2026');
  assert.equal(shortDate('2026-10-10', 'de'), '10. Okt. 2026');
  assert.equal(shortDate('2024-03'), 'mars 2024');
  assert.equal(shortDate(''), '');
});
