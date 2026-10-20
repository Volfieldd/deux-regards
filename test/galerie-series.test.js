import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup, VIGIE_KEYS } from './helpers.js';
import { as, UA } from './carnet-helpers.js';
import { TRAP_PATH } from '../server/securite/piege.js';
import { parisDay } from '../server/stats.js';
import { galerieUrl } from '../server/urls.js';

// Pages /galerie (MQ-02) et /series (index des séries ; le fil d'Ariane et « Toutes les séries » de MQ-03 y mènent),
// PLAN.md point 8. Seulement en v2 et en v3 : en v1, hors vue v2 ou v3 d'un administrateur, introuvables (404) et sans
// aucun lien, comme les Carnets. Mêmes filtres que la galerie de l'accueil (?regard=, ?serie=, ?ordre=), mêmes rangées,
// mêmes sizes. Le chemin piège de la Vigie (/galerie/tout-telecharger) reste hors de leurs routes : une 404, qui alerte.
// Registre de la Vigie : docs/etudes/vigie-besoins-des-briques.md, « /galerie et /series » (BV-32).
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const LANGS = ['', '/en', '/de'];

function fakeVigie() {
  const v = { events: [] };
  v.send = async (body, headers) => {
    const expected = crypto.createHmac('sha256', KEY).update(`${headers['x-vigie-ts']}.${headers['x-vigie-nonce']}.${body}`).digest('hex');
    assert.equal(headers['x-vigie-sig'], expected, 'signature du lot');
    v.events.push(...JSON.parse(body).lot);
  };
  v.of = type => v.events.filter(e => e.type === type);
  return v;
}
// vigie : Vigie simulée (true) ou absente (false, même sous npm run test:vigie).
async function site(t, { vigie = false, version = 'v2' } = {}) {
  const fake = fakeVigie();
  const c = vigie ? await setup(t, { seeded: true, env: VIGIE, vigieOptions: { send: fake.send, timers: false, pollDecisions: false } })
    : await setup(t, { seeded: true, env: { VIGIE_URL: '' } });
  c.app.publicVersion.save(version);
  let n = 0;
  const get = (url, headers = {}) => c.app.inject({ url, remoteAddress: `198.51.100.${(++n % 250) + 1}`, headers: { accept: 'text/html', 'user-agent': UA, ...headers } });
  const flush = async () => { c.app.securite.runTasks(); c.app.securite.retryNow(); await c.app.securite.flush(); return fake; };
  return { ...c, get, flush };
}
const tiles = (body, id) => {
  const ul = body.match(new RegExp(`<ul class="rangees[^"]*" aria-labelledby="${id}">([\\s\\S]*?)</ul>`))?.[1] || '';
  return [...ul.matchAll(/<a class="vignette" href="(?:\/(?:en|de))?\/photo\/([^"?]+)/g)].map(m => m[1]);
};
const order = (c, where = '1') => c.db.prepare(`SELECT p.slug FROM photos p JOIN authors a ON a.id = p.author_id JOIN categories c ON c.id = p.category_id
  WHERE p.status = 'published' AND ${where} ORDER BY p.position, p.id`).pluck().all();
// Liens vers /galerie ou /series (pages ou sous-chemins), le lien piège mis à part.
const linksTo = body => [...body.matchAll(/href="((?:\/(?:en|de))?\/(?:galerie|series)\b[^"]*)"/g)].map(m => m[1]).filter(h => !h.startsWith(TRAP_PATH));
const meta = (body, re) => body.match(re)?.[1];

for (const version of ['v2', 'v3']) {
  test(`${version} : /galerie et /series dans les trois langues (H1, titre, description, canonique, hreflang, menu)`, async t => {
    const c = await site(t, { version });
    for (const lang of LANGS) {
      for (const [path, h1, current] of [['/galerie', { '': 'Galerie', '/en': 'Gallery', '/de': 'Galerie' }[lang], 'galerie'], ['/series', { '': 'Séries', '/en': 'Series', '/de': 'Serien' }[lang], 'series']]) {
        const url = `${lang}${path}`;
        const r = await c.get(url);
        assert.equal(r.statusCode, 200, url);
        const b = r.body;
        assert.equal(b.match(/<h1/g).length, 1, `${url} : un seul H1`);
        assert.match(b, new RegExp(`<h1 class="titre-page">${h1}</h1>`), url);
        assert.match(b, new RegExp(`<html lang="${lang ? lang.slice(1) : 'fr'}"`));
        const title = meta(b, /<title>([^<]+)<\/title>/);
        assert.ok(title.length >= 30 && title.length <= 60, `${url} : titre de ${title.length} signes (${title})`);
        const description = meta(b, /<meta name="description" content="([^"]+)">/);
        assert.ok(description.length >= 110 && description.length <= 155, `${url} : description de ${description.length} signes (${description})`);
        // Canonique sur elle-même ; hreflang vers les trois langues et x-default.
        assert.equal(meta(b, /<link rel="canonical" href="([^"]+)">/), `http://localhost:3000${url}`);
        for (const l of LANGS) assert.ok(b.includes(`<link rel="alternate" hreflang="${l ? l.slice(1) : 'fr'}" href="http://localhost:3000${l}${path}">`), `${url} : hreflang ${l || 'fr'}`);
        assert.ok(b.includes(`<link rel="alternate" hreflang="x-default" href="http://localhost:3000${path}">`));
        // Le menu y mène et dit où l'on est.
        assert.match(b, new RegExp(`<nav class="sh-nav"[^>]*>\\s*<ul><li><a href="${lang}/galerie"${current === 'galerie' ? ' aria-current="page"' : ''}>[^<]+</a></li><li><a href="${lang}/series"${current === 'series' ? ' aria-current="page"' : ''}>`), url);
        // CSP : ni style ni script en ligne.
        assert.doesNotMatch(b, /\sstyle=/);
        assert.doesNotMatch(b, /<script(?![^>]*\ssrc=)(?![^>]*application\/ld\+json)/);
        assert.equal(b.includes('css/v3/v3.css'), version === 'v3');
      }
    }
  });
}

test('v1 : /galerie et /series introuvables (404) dans les trois langues, sans aucun lien ; filtres ignorés, rien de compté', async t => {
  const c = await site(t, { version: 'v1', vigie: true });
  for (const lang of LANGS) for (const p of ['/galerie', '/series', '/galerie?regard=julien&serie=rue', '/galerie?regard=inconnu&ordre=pire']) {
    const r = await c.get(`${lang}${p}`);
    assert.equal(r.statusCode, 404, `${lang}${p}`);
  }
  for (const url of ['/', '/en/', '/de/', '/serie/rue', '/auteur/julien', '/photo/brume-sur-la-loire', '/a-propos', '/recherche', '/page-inexistante', '/galerie'])
    assert.deepEqual(linksTo((await c.get(url)).body), [], `${url} : aucun lien vers /galerie ni /series`);
  const v = await c.flush();
  assert.deepEqual(v.of('input_validation_fail'), [], 'v1 : la page n’existe pas, ses paramètres ne sont pas lus');
  assert.equal(c.db.prepare("SELECT COUNT(*) FROM stats_pages WHERE page IN ('galerie', 'series')").pluck().get(), 0, 'aucune vue comptée');
  // Le plan du site ne les cite pas en v1.
  const map = (await c.get('/sitemap.xml')).body;
  assert.doesNotMatch(map, /\/(?:galerie|series)</);
});

test('vue de la session : un administrateur en vue v2 les voit sur un site en v1 ; en vue v1 sur un site en v2, il voit la v1 (404, sans lien)', async t => {
  const c = await site(t, { version: 'v1' });
  const a = as(c, { sub: 'galerie-admin', roles: ['admin'] });
  assert.equal((await a.post('/admin/apparence/apercu-v2', { vue: 'v2', vers: '/galerie' })).statusCode, 303);
  const g = await a.get('/galerie');
  assert.equal(g.statusCode, 200);
  assert.match(g.headers['cache-control'], /private, no-store/);
  assert.match(g.body, /<h1 class="titre-page">Galerie<\/h1>/);
  assert.equal((await a.get('/de/series')).statusCode, 200);
  assert.ok(linksTo((await a.get('/')).body).includes('/galerie'));
  // Un visiteur, pendant ce temps, suit le réglage : 404.
  assert.equal((await c.get('/galerie')).statusCode, 404);
  assert.equal((await c.get('/series')).statusCode, 404);
  // Site en v2, administrateur en vue v1 : la v1, sans les pages ni leurs liens.
  c.app.publicVersion.save('v2');
  assert.equal((await c.get('/galerie')).statusCode, 200);
  assert.equal((await a.post('/admin/apparence/apercu-v2', { vue: 'v1', vers: '/' })).statusCode, 303);
  assert.equal((await a.get('/galerie')).statusCode, 404);
  assert.equal((await a.get('/series')).statusCode, 404);
  const home = await a.get('/');
  assert.match(home.body, /<section class="grid wrap" id="grid">/, 'la v1');
  assert.deepEqual(linksTo(home.body), []);
});

test('/galerie : filtres ?regard=, ?serie=, ?ordre= comme la galerie de l’accueil (rangées dans l’ordre de l’admin, adresses sur /galerie)', async t => {
  const c = await site(t);
  const all = await c.get('/galerie');
  assert.deepEqual(tiles(all.body, 'g-h'), order(c));
  assert.match(all.body, /<a class="filtre" href="\/galerie#filtres" aria-current="page"><span class="filtre-nom">Les deux<\/span>/);
  // Deux filtres ensemble : sur /galerie ; un regard seul, une série seule : leur page (canonique).
  assert.match(all.body, /href="\/galerie\?ordre=recentes#filtres"/);
  const both = await c.get('/galerie?regard=julien&serie=rue');
  assert.deepEqual(tiles(both.body, 'g-h'), order(c, "a.slug = 'julien' AND c.slug = 'rue'"));
  assert.equal(meta(both.body, /<link rel="canonical" href="([^"]+)">/), 'http://localhost:3000/galerie?regard=julien&amp;serie=rue');
  assert.match(both.body, /<title>Galerie, Rue, par Julien \(\d photos?\) · Test<\/title>/);
  const julien = await c.get('/galerie?regard=julien');
  assert.deepEqual(tiles(julien.body, 'g-h'), order(c, "a.slug = 'julien'"));
  assert.equal(meta(julien.body, /<link rel="canonical" href="([^"]+)">/), 'http://localhost:3000/auteur/julien');
  assert.match(julien.body, /href="\/galerie\?regard=julien&amp;serie=rue#filtres"/);
  const recent = c.db.prepare("SELECT slug FROM photos WHERE status = 'published' ORDER BY published_at DESC, id DESC").pluck().all();
  assert.deepEqual(tiles((await c.get('/de/galerie?ordre=recentes')).body, 'g-h'), recent);
  // Valeur inconnue : ignorée, la galerie de tous.
  assert.deepEqual(tiles((await c.get('/galerie?regard=personne&serie=nulle&ordre=pire')).body, 'g-h'), order(c));
  // La visionneuse, ouverte depuis la galerie, y ramène (/galerie#galerie) ; et depuis une vue à deux filtres, sur /galerie.
  const photo = await c.get(`/photo/${order(c)[0]}`);
  assert.match(photo.body, /<a class="sh-retour" href="\/galerie#galerie" data-retour>/);
  const p2 = order(c, "a.slug = 'julien' AND c.slug = 'rue'")[0];
  assert.match((await c.get(`/photo/${p2}?regard=julien&serie=rue`)).body, /<a class="sh-retour" href="\/galerie\?regard=julien&amp;serie=rue#galerie" data-retour>/);
  // Aides des adresses : jamais un sous-chemin de /galerie/.
  for (const f of [{}, { regard: 'a' }, { serie: 's' }, { regard: 'a', serie: 's' }, { ordre: 'recentes' }, { regard: 'a', ordre: 'recentes' }])
    assert.doesNotMatch(galerieUrl(f), /^\/galerie\//);
  assert.equal(galerieUrl({}), '/galerie');
  assert.equal(galerieUrl({ regard: 'a', serie: 's', ordre: 'recentes' }), '/galerie?regard=a&serie=s&ordre=recentes');
});

test('/series : chaque série publiée, dans l’ordre de l’admin, sa couverture à son format, son compte, ses regards, son intention', async t => {
  const c = await site(t);
  c.db.prepare("UPDATE categories SET intent = 'Des passants, des seuils. Julien y cherche les visages. Sébastien les lignes et les quais.' WHERE slug = 'rue'").run();
  const b = (await c.get('/series')).body;
  const expected = c.db.prepare(`SELECT c.slug, COUNT(p.id) n FROM categories c JOIN photos p ON p.category_id = c.id AND p.status = 'published'
    GROUP BY c.id ORDER BY c.position, c.id`).all();
  const cards = [...b.matchAll(/<article class="ser-e[^"]*" aria-labelledby="s-([^"]+)">([\s\S]*?)<\/article>/g)];
  assert.deepEqual(cards.map(m => m[1]), expected.map(e => e.slug));
  for (const [, slug, card] of cards) {
    const n = expected.find(e => e.slug === slug).n;
    assert.match(card, new RegExp(`<h2 class="ser-e-titre" id="s-${slug}"><a href="/serie/${slug}">`));
    assert.match(card, new RegExp(`<b>${n} photos?</b>`));
    // La couverture : la première photo de la série dans l'ordre de la galerie, au format de la photo, sans texte de
    // remplacement redondant avec le nom (alt vide), après le texte dans le document (le nom se lit d'abord).
    const cover = order(c, `c.slug = '${slug}'`)[0];
    const file = c.db.prepare('SELECT file FROM photos WHERE slug = ?').pluck().get(cover);
    assert.ok(card.includes(file.replace(/\.[^.]+$/, '')), `${slug} : couverture ${cover}`);
    assert.match(card, /<figure class="ser-e-img fmt-[\dx]+"><picture>/);
    assert.match(card, /alt=""/);
    assert.ok(card.indexOf('ser-e-titre') < card.indexOf('<picture'));
  }
  // Le texte d'intention : ses deux premières phrases ; rien pour une série sans texte.
  const rue = cards.find(m => m[1] === 'rue')[2];
  assert.match(rue, /<p class="ser-e-int">Des passants, des seuils. Julien y cherche les visages.<\/p>/);
  assert.doesNotMatch(rue, /les lignes et les quais/);
  assert.doesNotMatch(cards.find(m => m[1] !== 'rue')[2], /ser-e-int/);
  // Une seule image chargée d'emblée ; « Toute la galerie » à la fin.
  assert.equal(b.match(/fetchpriority="high"/g).length, 1);
  assert.match(b, /<a class="lien" href="\/galerie">Toute la galerie \(\d+ photos\)/);
  // Une série sans photo publiée n'y est pas.
  c.db.prepare("UPDATE photos SET status = 'draft' WHERE category_id = (SELECT id FROM categories WHERE slug = 'portrait')").run();
  assert.doesNotMatch((await c.get('/series')).body, /id="s-portrait"/);
  // Anglais et allemand : noms et textes de la langue.
  assert.match((await c.get('/en/series')).body, /<ol class="ser-index" aria-label="The \d series">/);
  assert.match((await c.get('/de/series')).body, /<ol class="ser-index" aria-label="Die \d Serien">/);
});

test('accueil v2 : une ouverture, un aperçu de la galerie (douze photos dans l’ordre) et « Toute la galerie » ; « Toutes les séries »', async t => {
  const c = await site(t);
  for (const lang of LANGS) {
    const b = (await c.get(`${lang}/`)).body;
    assert.deepEqual(tiles(b, 'acc-galerie-t'), order(c).slice(0, 12), lang);
    assert.match(b, new RegExp(`<a class="lien" href="${lang}/galerie">${{ '': 'Toute la galerie', '/en': 'The whole gallery', '/de': 'Die ganze Galerie' }[lang]} \\(\\d+ (photos|Fotos)\\)`));
    assert.match(b, new RegExp(`<a class="lien" href="${lang}/series">${{ '': 'Toutes les séries', '/en': 'All series', '/de': 'Alle Serien' }[lang]}`));
    // Les anciennes ancres mènent encore quelque part ; plus de filtres sur l'accueil.
    for (const id of ['regards', 'series', 'galerie', 'filtres']) assert.match(b, new RegExp(`id="${id}"`));
    assert.doesNotMatch(b, /data-filtres/);
    // Plus aucun lien interne vers /#galerie ni /#series.
    assert.doesNotMatch(b, /href="(?:\/en|\/de)?\/#(?:galerie|series)"/);
    assert.equal(meta(b, /<link rel="canonical" href="([^"]+)">/), `http://localhost:3000${lang || ''}/`);
  }
});

test('anciennes adresses /#galerie et /#series : aucun lien interne n’y mène plus en v2 ni en v3', async t => {
  const c = await site(t);
  for (const version of ['v2', 'v3']) {
    c.app.publicVersion.save(version);
    for (const url of ['/', '/galerie', '/series', '/serie/rue', '/auteur/julien', '/photo/brume-sur-la-loire', '/recherche', '/page-inexistante', '/a-propos', '/droits/demande', '/en/', '/de/serie/rue'])
      assert.doesNotMatch((await c.get(url)).body, /href="(?:\/en|\/de)?\/#(?:galerie|series)"/, `${version} ${url}`);
  }
});

test('thèmes par rubrique : la Galerie en V1 → /galerie et /series introuvables, le menu revient aux ancres ; en chambre noire, ouvertes', async t => {
  const c = await site(t, { version: 'v1' });
  c.app.publicVersion.saveDesign({ default: 'v2', sections: { galerie: 'v1' } });
  assert.equal((await c.get('/galerie')).statusCode, 404);
  assert.equal((await c.get('/series')).statusCode, 404);
  const home = (await c.get('/')).body;
  assert.deepEqual(linksTo(home), []);
  assert.match(home, /href="\/#galerie"/);
  c.app.publicVersion.saveDesign({ default: 'v1', sections: { galerie: 'obscura' } });
  assert.equal((await c.get('/galerie')).statusCode, 200);
  assert.equal((await c.get('/series')).statusCode, 200);
  // L'accueil reste en V1, et son menu mène aux pages qui existent.
  const h = (await c.get('/')).body;
  assert.match(h, /<section class="grid wrap" id="grid">/);
  assert.ok(linksTo(h).includes('/galerie') && linksTo(h).includes('/series'));
  c.app.publicVersion.saveDesign(null);
  assert.equal((await c.get('/galerie')).statusCode, 404);
});

test('plan du site : /galerie et /series dans les trois langues avec hreflang (v2, v3), jamais le piège ; robots.txt inchangé', async t => {
  const c = await site(t, { vigie: true });
  for (const version of ['v2', 'v3']) {
    c.app.publicVersion.save(version);
    const map = (await c.get('/sitemap.xml')).body;
    for (const p of ['/galerie', '/series']) for (const l of LANGS) {
      const entry = map.match(new RegExp(`<url><loc>http://localhost:3000${l}${p}</loc>(.*?)</url>`))?.[1];
      assert.ok(entry, `${l}${p} au plan du site`);
      for (const h of LANGS) assert.ok(entry.includes(`hreflang="${h ? h.slice(1) : 'fr'}" href="http://localhost:3000${h}${p}"`), `${l}${p} → ${h || 'fr'}`);
    }
    assert.doesNotMatch(map, /tout-telecharger/);
  }
  const robots = (await c.get('/robots.txt')).body;
  assert.match(robots, /Disallow: \/galerie\/tout-telecharger\n/);
  assert.doesNotMatch(robots, /Disallow: \/galerie\n|Disallow: \/series|Allow: \/galerie/);
  assert.ok(robots.indexOf('Disallow: /galerie/tout-telecharger') < robots.indexOf('Allow: /'));
});

for (const vigie of [true, false]) {
  test(`chemin piège ${vigie ? 'avec' : 'sans'} la Vigie : /galerie/tout-telecharger reste une 404 (barre finale, /en, /de), en v1, v2 et v3 ; lien caché du pied de page`, async t => {
    const c = await site(t, { vigie });
    for (const version of ['v1', 'v2', 'v3']) {
      c.app.publicVersion.save(version);
      for (const url of [TRAP_PATH, `${TRAP_PATH}/`, `${TRAP_PATH}?x=1`, `/en${TRAP_PATH}`, `/de${TRAP_PATH}`, `/en${TRAP_PATH}/`, '/galerie/', '/galerie/autre', '/series/', '/series/rue']) {
        const r = await c.get(url);
        assert.equal(r.statusCode, 404, `${version} ${url}`);
        assert.doesNotMatch(r.body, /<ul class="rangees/, `${version} ${url} : aucune galerie servie`);
      }
      for (const [k, method] of ['HEAD', 'POST'].entries()) assert.equal((await c.app.inject({ method, url: TRAP_PATH, remoteAddress: `203.0.113.${k + 1}${version.slice(1)}` })).statusCode, 404, `${version} ${method}`);
    }
    // Le lien caché, une fois, sur les nouvelles pages comme sur les autres (avec la Vigie seulement).
    c.app.publicVersion.save('v2');
    for (const url of ['/galerie', '/series', '/en/galerie', '/de/series', '/galerie?regard=julien&serie=rue']) {
      const b = (await c.get(url)).body;
      if (vigie) {
        assert.equal(b.match(/tout-telecharger/g)?.length, 1, `${url} : un seul lien piège`);
        assert.match(b, /<a href="\/galerie\/tout-telecharger" rel="nofollow" hidden tabindex="-1" aria-hidden="true">archives<\/a>\n<\/footer>/, url);
      } else assert.doesNotMatch(b, /tout-telecharger/, url);
    }
    if (!vigie) return;
    const v = await c.flush();
    // Le chemin exact alerte (lien caché), une fois par requête, quelle que soit la version ; les variantes (barre finale,
    // langue) ne sont pas le lien caché : une 404 ordinaire.
    const traps = v.of('malicious_honeypot').filter(e => e.detail.piege === 'lien caché');
    assert.equal(traps.length, 3 * 4, 'GET, ?x=1, HEAD et POST, dans chacune des trois versions');
    assert.ok(traps.every(e => e.detail.chemin === TRAP_PATH));
  });
}

test('valeurs impossibles sur /galerie : ignorées, signalées UNE fois par requête (input_validation_fail, BV-3) ; exception des 30 jours', async t => {
  const c = await site(t, { vigie: true });
  const days = n => parisDay(new Date(Date.now() - n * 864e5));
  c.db.prepare('INSERT INTO stats_pages (day, page, views) VALUES (?, ?, 2), (?, ?, 1)').run(days(10), 'serie:ancienne-rue', days(40), 'auteur:parti');
  for (const url of ['/galerie?regard=marcel', '/galerie?regard=marcel&serie=nulle&ordre=pire', '/en/galerie?serie=nulle&ordre=pire',
    '/galerie?serie=ancienne-rue', '/galerie?regard=parti', '/galerie?regard=julien&serie=rue&ordre=recentes', '/galerie?regard=&serie=',
    '/galerie?serie=%3Cscript%3Ealert(1)%3C/script%3E'])
    assert.equal((await c.get(url)).statusCode, 200, url);
  // L'accueil, avec les mêmes paramètres : aligné, une fois par requête aussi.
  assert.equal((await c.get('/?regard=marcel&serie=nulle')).statusCode, 200);
  // /series ne lit aucun filtre.
  assert.equal((await c.get('/series?regard=marcel&serie=nulle')).statusCode, 200);
  const v = await c.flush();
  const fails = v.of('input_validation_fail').filter(e => e.detail.raison === 'valeur de filtre hors liste');
  assert.deepEqual(fails.map(e => [e.route, e.detail.champ, e.detail.valeur, e.detail.champs]), [
    ['/galerie', 'regard', 'marcel', undefined],
    ['/galerie', 'regard', 'marcel', ['regard', 'serie', 'ordre']],
    ['/en/galerie', 'serie', 'nulle', ['serie', 'ordre']],
    ['/galerie', 'regard', 'parti', undefined],
    ['/', 'regard', 'marcel', ['regard', 'serie']],
  ]);
  assert.ok(fails.every(e => e.origine.emetteur === 'server/routes/public.js · filtres'));
  // La saisie malveillante : signalée par le crochet commun (DS11), pas une seconde fois.
  assert.equal(v.of('malicious_input').length, 1);
});

test('valeurs impossibles sans la Vigie : mêmes pages, rien d’émis', async t => {
  const c = await site(t);
  assert.equal(c.app.securite.enabled, false);
  const ref = tiles((await c.get('/galerie')).body, 'g-h');
  assert.deepEqual(tiles((await c.get('/galerie?regard=marcel&serie=nulle&ordre=pire')).body, 'g-h'), ref);
});
