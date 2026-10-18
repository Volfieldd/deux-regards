import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, VIGIE_KEYS } from './helpers.js';
import { fmt, rowSizes, ouvSizes, phoneShares, nobr } from '../server/v2-vues.js';

// Site public v2 : accueil (MQ-01), galerie en rangées et filtres (MQ-02), page d'une série (MQ-03). Mêmes routes, mêmes
// paramètres et mêmes données que la v1 (views/home.eta) : /, /auteur/<slug>, /serie/<slug>, ?regard=&serie=&ordre=.
const site = async (t, opts = {}) => {
  const c = await setup(t, { seeded: true, ...opts });
  return { ...c, visit: (url, o = {}) => c.app.inject({ method: 'GET', url, ...o }) };
};
const v2 = async (t, opts) => { const c = await site(t, opts); c.app.publicVersion.save('v2'); return c; };
// Les liens des vignettes d'une liste de rangées (aria-labelledby = id), dans l'ordre du document.
const tiles = (body, id) => {
  const ul = body.match(new RegExp(`<ul class="rangees[^"]*" aria-labelledby="${id}">([\\s\\S]*?)</ul>`))?.[1] || '';
  return [...ul.matchAll(/<a class="vignette" href="(?:\/(?:en|de))?\/photo\/([^"?]+)/g)].map(m => m[1]);
};
const order = (c, where = '1') => c.db.prepare(`SELECT p.slug FROM photos p JOIN authors a ON a.id = p.author_id JOIN categories c ON c.id = p.category_id
  WHERE p.status = 'published' AND ${where} ORDER BY p.position, p.id`).pluck().all();

test('galerie v2 : les rangées suivent l’ordre composé dans l’admin, et le suivent quand il change', async t => {
  const c = await v2(t);
  assert.deepEqual(tiles((await c.visit('/')).body, 'g-h'), order(c));
  // L'admin réordonne : la dernière passe en tête, la première en dernier.
  const ids = c.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY position, id").pluck().all();
  const set = c.db.prepare('UPDATE photos SET position = ? WHERE id = ?');
  [ids.at(-1), ...ids.slice(1, -1), ids[0]].forEach((id, i) => set.run(i, id));
  const expected = order(c);
  assert.equal(expected[0], c.db.prepare('SELECT slug FROM photos WHERE id = ?').pluck().get(ids.at(-1)));
  assert.deepEqual(tiles((await c.visit('/')).body, 'g-h'), expected);
  // Même ordre sur la page d'un regard, d'une série, et dans les trois langues.
  assert.deepEqual(tiles((await c.visit('/auteur/julien')).body, 'g-h'), order(c, "a.slug = 'julien'"));
  assert.deepEqual(tiles((await c.visit('/de/serie/rue')).body, 'g-h'), order(c, "c.slug = 'rue'"));
  assert.deepEqual(tiles((await c.visit('/en/?regard=sebastien&serie=paysage')).body, 'g-h'), order(c, "a.slug = 'sebastien' AND c.slug = 'paysage'"));
  // « Plus récentes d'abord » : l'ordre de publication, le plus récent en tête.
  const recent = c.db.prepare("SELECT slug FROM photos WHERE status = 'published' ORDER BY published_at DESC, id DESC").pluck().all();
  assert.deepEqual(tiles((await c.visit('/?ordre=recentes')).body, 'g-h'), recent);
});

test('galerie v2 : vignettes au format de chaque photo (.v, .c, classes de format), sizes selon la place, sans style en ligne', async t => {
  const c = await v2(t);
  const b = (await c.visit('/auteur/julien')).body;
  const ul = b.match(/<ul class="rangees" aria-labelledby="g-h">([\s\S]*?)<\/ul>/)[1];
  const lis = [...ul.matchAll(/<li class="([^"]+)">[\s\S]*?sizes="([^"]+)"[\s\S]*?width="(\d+)" height="(\d+)"/g)];
  assert.equal(lis.length, order(c, "a.slug = 'julien'").length);
  for (const [, cls, sizes, w, h] of lis) {
    const f = fmt({ width: Number(w), height: Number(h) });
    assert.ok(cls.split(' ').includes(f.cls), `${cls} : ${f.cls}`);
    assert.equal(cls.split(' ').includes('v'), f.r < 1);
    assert.match(sizes, /^\(max-width: 767px\) calc\(\(100vw - 48px\) \* [\d.]+\)(, \(max-width: \d+px\) \d+px){4}, \d+px$/);
  }
  // Une verticale 2:3 a la même hauteur qu'une 3:2 dans la rangée : sa classe est exacte.
  assert.match(ul, /class="fmt-2x3 v"/);
  // Ni style ni script en ligne (CSP), et l'image n'a pas de texte de remplacement redondant avec le cartel.
  assert.doesNotMatch(b, /\sstyle=/);
  assert.doesNotMatch(b, /<script(?![^>]*\ssrc=)/);
  assert.match(ul, /alt=""/);
  // La vue est celle d'un regard : le cartel ne redit pas l'auteur.
  assert.doesNotMatch(ul.match(/<span class="cartel-m">[^<]*<\/span>/g).join(''), /Julien/);
});

test('aides v2 : sizes des rangées, de l’ouverture, mots composés insécables', () => {
  const h = { width: 900, height: 600 }, v = { width: 600, height: 900 };
  // Les rangées composées comme le navigateur : deux photos qui tiennent sur une ligne restent à leur taille (dernière
  // rangée, non étirée) ; trois horizontales de 768 à 895 px : deux étirées (400 px au plus), la troisième seule.
  assert.equal(rowSizes(h, [h, { ...h }]), '(max-width: 767px) calc((100vw - 48px) * 1), (max-width: 895px) 300px, (max-width: 1023px) 300px, (max-width: 1279px) 300px, (max-width: 1599px) 360px, 360px');
  const trois = [h, { ...h }, { ...h }];
  assert.match(rowSizes(trois[0], trois), /\(max-width: 895px\) 400px/);
  assert.match(rowSizes(trois[2], trois), /^\(max-width: 767px\) calc\(\(100vw - 48px\) \* 0\.6\), \(max-width: 895px\) 300px/);
  assert.match(rowSizes(v, [v, { ...v }]), /^\(max-width: 767px\) calc\(\(100vw - 48px\) \* 0\.27\), \(max-width: 895px\) 135px/);
  // Rangée étirée : la part exacte de chaque photo dans la largeur (écran moins les marges et les écarts).
  assert.match(rowSizes(h, [h, v, h], { etiree: true }), /calc\(\(100vw - 176px\) \* 0\.41\)$/);
  // Au téléphone, deux verticales se partagent la rangée.
  assert.deepEqual(phoneShares([v, v]).map(x => Math.round(x * 100)), [27, 27]);
  assert.match(ouvSizes(1.5), /^\(max-width: 359px\) min\(calc\(100vw - 32px\), calc\(max\(300px, 100vh - 300px\) \* 1\.5\), 1290px\)/);
  assert.match(ouvSizes(1.5, 0.6667 / 1.5), /\* 0\.44\)$/);
  assert.equal(nobr('Passage, fin d’après-midi <b>'), 'Passage, fin <span class="nobr">d’après-midi</span> &lt;b&gt;');
});

test('filtre par photographe : une adresse par choix, état actif, comptes qui suivent le regard', async t => {
  const c = await v2(t);
  const b = (await c.visit('/auteur/julien')).body;
  assert.match(b, /<title>Galerie, par Julien \(\d+ photos\) · Test<\/title>/);
  assert.match(b, /<h1 class="titre-page">Galerie<\/h1>/);
  assert.match(b, /<a class="filtre" href="\/auteur\/julien#filtres" aria-current="page"><span class="filtre-nom">Julien<\/span>/);
  assert.match(b, /<a class="filtre" href="\/#filtres"><span class="filtre-nom">Les deux<\/span> <span class="filtre-n">12<\/span>/);
  assert.match(b, /<h2 class="titre-2" id="g-h" tabindex="-1">Les photos de Julien<\/h2><p>6 sur 12&nbsp;· ordre choisi par nous<\/p>/);
  // Série sans photo de Julien : plus un lien, « 0 », et le lecteur d'écran sait pourquoi ; les autres gardent le regard.
  assert.match(b, /<span class="filtre filtre--vide">[\s\S]*?<span class="filtre-nom">Voyage<\/span> <span class="filtre-n">0<span class="sr-only"> photo : aucune de Julien<\/span>/);
  assert.match(b, /href="\/\?regard=julien&amp;serie=rue#filtres"/);
  // L'ordre, dans un <details>, garde le regard.
  assert.match(b, /<a href="\/auteur\/julien\?ordre=recentes#filtres">Plus récentes d’abord<\/a>/);
  // Deux filtres sans photo commune : la page le dit et propose les deux pistes ; chaque filtre se retire (✕).
  const vide = (await c.visit('/?regard=julien&serie=voyage')).body;
  assert.match(vide, /Aucune photo de Julien dans la série Voyage\./);
  assert.match(vide, /<ul class="actifs" aria-label="Filtres choisis">/);
  assert.match(vide, /<a class="actif" href="\/serie\/voyage">Julien<span class="sr-only"> : retirer ce filtre<\/span>/);
  assert.match(vide, /Voir toute la série Voyage \(2 photos\)/);
  assert.match(vide, /<p>0 photo&nbsp;· /);
  // Un regard inconnu est ignoré, comme en v1 : la galerie de tous.
  assert.equal((await c.visit('/auteur/personne')).statusCode, 404);
});

test('page d’une série v2 : un H1, la fiche, les photos d’abord, sans couverture en tête ; autres séries', async t => {
  const c = await v2(t);
  const b = (await c.visit('/serie/rue')).body;
  const rue = order(c, "c.slug = 'rue'");
  assert.equal(b.match(/<h1/g).length, 1);
  assert.match(b, /<h1 class="titre-page">Rue<\/h1>/);
  assert.match(b, /<title>Rue — série de Sébastien et Julien · Test<\/title>/);
  assert.match(b, /<nav class="ariane" aria-label="Fil d’Ariane"><ol><li><a href="\/#series">Séries<\/a><\/li><li aria-current="page">Rue<\/li><\/ol><\/nav>/);
  assert.match(b, new RegExp(`<li><b>${rue.length} photos</b>, ordre choisi par nous</li>`));
  assert.match(b, /<li>par <a href="\/auteur\/sebastien#filtres">Sébastien<\/a> et <a href="\/auteur\/julien#filtres">Julien<\/a><\/li>/);
  // La première image de la page est la première photo de la série, chargée d'emblée ; pas d'ouverture ni de diaporama.
  const main = b.slice(b.indexOf('<main'));
  assert.equal(main.match(/<img [^>]*>/)[0].includes('fetchpriority="high"'), true);
  assert.deepEqual(tiles(b, 'g-h'), rue);
  assert.ok(main.indexOf(`/photo/${rue[0]}?serie=rue`) < main.indexOf('<img'));
  assert.doesNotMatch(b, /data-ouverture|ouverture-diapo/);
  // La même série par un seul regard, puis les autres séries (pas la série elle-même).
  assert.match(b, /<a href="\/\?regard=julien&amp;serie=rue#filtres"><span class="liste-liens-n">Rue, par Julien<\/span>/);
  const autres = b.slice(b.indexOf('id="a-h"'));
  assert.doesNotMatch(autres, /href="\/serie\/rue"/);
  assert.match(autres, /href="\/serie\/paysage"/);
  // Les vignettes ouvrent la visionneuse dans le contexte de la série, qui y ramène (#galerie).
  assert.match(b, /<section class="wrap partie ser-photos" id="galerie"/);
});

test('accueil v2 : promesse en H1, diaporama à l’arrêt (une seule image chargée), regards, séries, galerie à #galerie', async t => {
  const c = await v2(t);
  const b = (await c.visit('/')).body;
  assert.match(b, /<title>Test — photographies de Sébastien et Julien<\/title>/);
  assert.equal(b.match(/<h1/g).length, 1);
  assert.match(b, /<h1 class="ouverture-h1" id="acc-h1">/);
  // Une seule <picture> dans l'ouverture ; les autres photos attendent dans des <template>.
  const ouv = b.slice(b.indexOf('data-ouverture'), b.indexOf('</section>', b.indexOf('data-ouverture')));
  assert.equal(ouv.match(/<picture/g).length, 1);
  const hero = c.db.prepare("SELECT value FROM settings WHERE key = 'hero'").pluck().get();
  const n = hero ? JSON.parse(hero).length : 5;
  assert.equal(b.match(/<template data-ouv-diapo=/g).length, n - 1);
  // Points et « Lire » : seulement avec le script (.js-seul) ; le premier point est pressé ; rien ne tourne tout seul.
  assert.match(ouv, /<div class="ouverture-ctl js-seul">/);
  assert.match(ouv, /aria-pressed="true" aria-label="Photo 1 sur \d : [^"]+" data-ouv-point="0"/);
  assert.match(ouv, /data-ouv-lire><span class="ouv-lire">[\s\S]*?Lire<span class="sr-only"> le diaporama<\/span>/);
  assert.doesNotMatch(ouv, /autoplay|data-auto/);
  // Les anciennes ancres arrivent quelque part.
  for (const id of ['regards', 'series', 'galerie', 'filtres']) assert.match(b, new RegExp(`id="${id}"`));
  // Le menu : Galerie et Séries mènent aux parties de l'accueil ; ni Carnets ni Tirages.
  assert.match(b, /<nav class="sh-nav" aria-label="Navigation">\s*<ul><li><a href="\/#galerie">Galerie<\/a><\/li><li><a href="\/#series">Séries<\/a><\/li>/);
  assert.match(b, /<nav class="sh-panneau" aria-label="Navigation \(téléphone\)">/);
});

test('v2 : rien de la boutique ni des Carnets, aucune route nouvelle, l’heure jamais hors de la page photo', async t => {
  const c = await v2(t);
  const p = c.db.prepare("SELECT id, slug FROM photos WHERE status = 'published' ORDER BY position LIMIT 1").get();
  c.db.prepare("UPDATE photos SET taken_on = '2025-05-01', taken_time = '14:32', show_time = 1 WHERE id = ?").run(p.id);
  for (const url of ['/', '/auteur/julien', '/serie/rue', '/?regard=julien&serie=rue', '/?ordre=recentes', '/en/', '/de/serie/paysage']) {
    const res = await c.visit(url);
    assert.equal(res.statusCode, 200, url);
    assert.doesNotMatch(res.body, /\/tirages|\/panier|\/carnet|Tirage|Kunstdruck|€/, `${url} : boutique ou carnet`);
    assert.doesNotMatch(res.body, /14\s*h\s*32|14:32|2:32/, `${url} : heure`);
    // Seules les adresses du code : aucun lien vers /galerie ni /series (le lien piège de la Vigie mis à part).
    assert.doesNotMatch(res.body, /href="(?:\/(?:en|de))?\/(?:galerie|series)\b(?!\/tout-telecharger)/, `${url} : adresse à créer`);
  }
  assert.match((await c.visit(`/photo/${p.slug}`)).body, /14 h 32|14 h 32/);
  for (const url of ['/galerie', '/series']) assert.equal((await c.visit(url)).statusCode, 404, url);
});

test('repli : la v1 reste celle des visiteurs tant que le réglage est v1', async t => {
  const c = await site(t);
  for (const url of ['/', '/auteur/julien', '/serie/rue', '/?regard=julien&serie=rue']) {
    const b = (await c.visit(url)).body;
    assert.match(b, /<section class="grid wrap" id="grid">/, url);
    assert.match(b, /<section class="hero" id="hero" data-hero>/, url);
    assert.doesNotMatch(b, /css\/v2\/|class="rangees|filtres-barre|ouverture/, url);
  }
});

test('v2 : points d’accroche de la Vigie (lien piège caché, jamais ailleurs ; robots.txt)', async t => {
  const c = await v2(t, { env: { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 },
    vigieOptions: { send: async () => {}, timers: false, pollDecisions: false } });
  for (const url of ['/', '/auteur/julien', '/serie/rue', '/?regard=julien&serie=voyage']) {
    const b = (await c.visit(url)).body;
    assert.equal(b.match(/tout-telecharger/g)?.length, 1, `${url} : un seul lien piège`);
    assert.match(b, /<a href="\/galerie\/tout-telecharger" rel="nofollow" hidden tabindex="-1" aria-hidden="true">archives<\/a>\n<\/footer>/, url);
  }
  assert.match((await c.visit('/robots.txt')).body, /Disallow: \/galerie\/tout-telecharger/);
  // Les filtres passent par les paramètres existants ; un paramètre inconnu ne change rien.
  const odd = (await c.visit('/auteur/julien?vue=tout&page=2&galerie=tout-telecharger')).body;
  assert.deepEqual(tiles(odd, 'g-h'), tiles((await c.visit('/auteur/julien')).body, 'g-h'));
  assert.doesNotMatch(odd.replace(/href="\/langue\/[^"]*"/g, ''), /vue=tout|page=2/);
  const sans = await v2(t, { env: { VIGIE_URL: '' } });
  assert.doesNotMatch((await sans.visit('/')).body, /tout-telecharger/);
});
