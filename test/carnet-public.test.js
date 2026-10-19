import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { as, billet, visitor, setV2, UA } from './carnet-helpers.js';
import { TRAP_PATH } from '../server/securite/piege.js';

// Carnets, côté public (étude § 1.7 et § 1.8 ; maquettes MQ-11 et MQ-12) : en v2 seulement. En v1 (réglage public_version)
// et hors aperçu des administrateurs, toutes leurs adresses répondent 404 et aucune page n'y mène ; la v2 appliquée ou
// l'aperçu les montre. Liste et filtres, billet (référencement : canonique, hreflang des langues publiées, Open Graph
// article, JSON-LD BlogPosting, robots), trois langues (langue non publiée : texte français, bandeau, noindex, sans
// redirection), ancienne adresse (301), retiré (410), plan du site, robots.txt, flux Atom, visionneuse ?carnet=.

async function world(t) {
  const c = await setup(t, { seeded: true });
  const p = await billet(c, { title: 'Lisbonne et Porto', authors: ['sebastien', 'julien'], dek: 'Deux jours, deux regards, un même océan.',
    body: 'Nous étions partis.\n\nphoto:brume-sur-la-loire\n\n## Samedi, Lisbonne\n\nphoto:deux-minuit\nphoto:quai-7h12\n\n## Dimanche, Porto\n\nphoto:ligne-d-eau\n\nVoir [la série](serie:1).',
    extra: { title_en: 'Lisbon and Porto', dek_en: 'Two days, two views, one ocean.', body_en: 'We had left.\n\nphoto:brume-sur-la-loire', langs: ['en'] }, at: Date.parse('2026-10-14T06:00:00Z') });
  const q = await billet(c, { title: 'Pourquoi nous ne recadrons pas', rubrique: 'atelier', authors: ['sebastien'], body: 'photo:silence-blanc', at: Date.parse('2026-10-02T06:00:00Z') });
  const r = await billet(c, { title: 'Élise, ou comment demander', rubrique: 'atelier', authors: ['julien'], body: 'photo:elise-contre-jour', at: Date.parse('2026-10-15T06:00:00Z') });
  const draft = await billet(c, { title: 'Brouillon caché', publish: false });
  return { ...c, p, q, r, draft, see: visitor(c) };
}
const PUBLIC = ['/carnet', '/carnet/lisbonne-et-porto', '/en/carnet', '/de/carnet/lisbonne-et-porto', '/carnet/lisbonne-et-porto/partager', '/carnet/flux.xml', '/en/carnet/flux.xml', '/de/carnet/flux.xml', '/carnet?rubrique=voyages'];

test('v1 : toutes les adresses des Carnets répondent 404, aucune page n’y mène, le plan du site ne les cite pas ; jamais d’erreur sans gabarit v1', async t => {
  const c = await world(t);
  for (const url of PUBLIC) assert.equal((await c.see(url)).statusCode, 404, url);
  assert.equal((await c.app.inject({ method: 'POST', url: '/carnet/lisbonne-et-porto/partage', payload: { via: 'copie' } })).statusCode, 404);
  for (const url of ['/', '/en', '/a-propos', '/photo/brume-sur-la-loire', '/photo/brume-sur-la-loire?carnet=lisbonne-et-porto', '/recherche']) {
    const r = await c.see(url);
    assert.equal(r.statusCode, 200, url);
    assert.doesNotMatch(r.body, /\/carnet/, `${url} : aucun lien vers les Carnets en v1`);
  }
  assert.doesNotMatch((await c.see('/sitemap.xml')).body, /carnet/);
  // Le rendu d'une page sans gabarit v1, appelé en v1, donne la page introuvable, jamais une erreur 500.
  assert.equal(c.app.publicVersion.hasV1('carnet'), false);
  assert.equal(c.app.publicVersion.hasV1('photo'), true);
});

test('aperçu de la v2 d’un administrateur : les Carnets apparaissent pour lui seul (en-tête no-store) ; les visiteurs restent en v1 (404)', async t => {
  const c = await world(t);
  const adm = as(c, { sub: 'z-adm', name: 'Admin', roles: ['admin'] });
  assert.equal((await adm.post('/admin/apparence/apercu-v2', { apercu: '1', vers: '/carnet' })).statusCode, 303);
  const r = await adm.get('/carnet');
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['cache-control'], 'private, no-store');
  assert.match(r.body, /Vous seul voyez la v2/);
  assert.match((await adm.get('/')).body, /<a href="\/carnet"[^>]*>Carnets<\/a>/);
  assert.equal((await c.see('/carnet')).statusCode, 404);
  assert.equal((await c.see('/carnet/flux.xml')).statusCode, 404);
});

test('v2 : la liste (MQ-11) : un H1, les filtres qui comptent, les billets du plus récent au plus ancien, le flux ; menu et pied de page', async t => {
  const c = await world(t);
  setV2(c);
  const r = await c.see('/carnet');
  assert.equal(r.statusCode, 200);
  const h = r.body;
  assert.equal((h.match(/<h1/g) || []).length, 1);
  assert.match(h, /<a href="\/carnet" aria-current="page">Carnets<\/a>/, 'menu : Carnets actif');
  assert.match(h, /<link rel="alternate" type="application\/atom\+xml" title="Carnets de Test \(flux RSS\)" href="\/carnet\/flux.xml">/);
  assert.match(h, /<a class="filtre" href="\/carnet\?rubrique=atelier"><span class="filtre-nom">Notes d’atelier<\/span> <span class="filtre-n">2<\/span><\/a>/);
  assert.match(h, /<a class="filtre" href="\/carnet\?par=julien"><span class="filtre-nom">Julien<\/span> <span class="filtre-n">2<\/span><\/a>/);
  const order = [...h.matchAll(/class="billet-e-titre" id="b-([a-z0-9-]+)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['elise-ou-comment-demander', 'lisbonne-et-porto', 'pourquoi-nous-ne-recadrons-pas']);
  assert.doesNotMatch(h, /brouillon-cache/);
  assert.match(h, /<p class="billet-e-meta"><b>Sébastien et Julien<\/b>&nbsp;· <time datetime="2026-10-14">14\u00a0oct\.\u00a02026<\/time>/);
  assert.match(h, /href="\/carnet\/flux.xml" type="application\/atom\+xml">[\s\S]*Flux RSS des carnets<\/a>/, 'le flux au pied de page');
  assert.equal((h.match(new RegExp(`href="${TRAP_PATH}"`, 'g')) || []).length, c.app.securite.enabled ? 1 : 0, 'lien piège une fois (avec la Vigie)');
  assert.doesNotMatch(h.replace(/="[^"]*"/g, '=""'), /\sstyle=/);
  // Filtre : noindex, compte et « Voir les n billets » ; page au-delà : 404.
  const f = await c.see('/carnet?par=julien');
  assert.equal(f.headers['x-robots-tag'], 'noindex, follow');
  assert.match(f.body, /2 billets signés par Julien, dont un à deux voix\. <a class="lien" href="\/carnet">Voir les 3 billets<\/a>/);
  assert.equal((await c.see('/carnet?page=2')).statusCode, 404);
  // Le menu de toutes les pages v2 mène aux Carnets ; v1 : non.
  assert.match((await c.see('/a-propos')).body, /<li><a href="\/carnet">Carnets<\/a><\/li>/);
});

test('v2 : pagination de 12 billets par page, adresse propre à chaque page, liens « plus récents » et « plus anciens »', async t => {
  const c = await setup(t, { seeded: true });
  setV2(c);
  for (let i = 1; i <= 14; i++) await billet(c, { title: `Billet numéro ${i}`, body: 'photo:brume-sur-la-loire', at: Date.parse('2026-09-01T06:00:00Z') + i * 864e5 });
  const see = visitor(c);
  const one = (await see('/carnet')).body;
  assert.match(one, /Page 1 sur 2\s·\sbillets 1 à 12 sur 14/);
  assert.match(one, /<a class="lien" href="\/carnet\?page=2" rel="next">/);
  const two = await see('/carnet?page=2');
  assert.match(two.body, /<link rel="canonical" href="http:\/\/localhost:3000\/carnet\?page=2">/);
  assert.match(two.body, /<a class="lien" href="\/carnet" rel="prev">/);
  assert.equal((two.body.match(/class="billet-e-titre"/g) || []).length, 2);
});

test('v2 : un billet (MQ-12) : canonique, hreflang des langues publiées seulement, Open Graph article, JSON-LD BlogPosting, sommaire, voisins, photos dans le contexte du billet', async t => {
  const c = await world(t);
  setV2(c);
  const r = await c.see('/carnet/lisbonne-et-porto');
  assert.equal(r.statusCode, 200);
  const h = r.body;
  assert.match(h, /<title>Lisbonne et Porto\s· Test<\/title>/);
  assert.match(h, /<link rel="canonical" href="http:\/\/localhost:3000\/carnet\/lisbonne-et-porto">/);
  assert.deepEqual([...h.matchAll(/hreflang="([a-z-]+)"/g)].map(m => m[1]).filter(x => x !== 'fr' || true).slice(0, 3), ['fr', 'en', 'x-default']);
  assert.doesNotMatch(h, /<link rel="alternate" hreflang="de"/);
  assert.match(h, /<meta property="og:type" content="article">/);
  assert.match(h, /<meta property="article:published_time" content="2026-10-14T08:00:00\+02:00">/);
  assert.match(h, /<meta name="robots" content="max-image-preview:large">/);
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)[1]);
  const post = ld['@graph'][0];
  assert.deepEqual([post['@type'], post.headline, post.datePublished, post.inLanguage, post.author.map(a => a.name)], ['BlogPosting', 'Lisbonne et Porto', '2026-10-14T08:00:00+02:00', 'fr-FR', ['Sébastien', 'Julien']]);
  assert.match(post.image[0], /^http:\/\/localhost:3000\/media\//);
  assert.equal(ld['@graph'][1]['@type'], 'BreadcrumbList');
  assert.match(h, /<nav class="ariane" aria-label="Fil d’Ariane"><ol><li><a href="\/carnet">Carnets<\/a><\/li>/);
  assert.match(h, /<a href="\/carnet" aria-current="true">Carnets<\/a>/);
  assert.match(h, /<p class="sommaire-t" id="som-t">Dans ce billet<\/p>/);
  assert.match(h, /<a href="#samedi-lisbonne">/);
  assert.match(h, /<a href="\/photo\/deux-minuit\?carnet=lisbonne-et-porto">/);
  assert.match(h, /<a href="\/serie\/rue">la série<\/a>/);
  assert.match(h, /<a class="btn btn--filet" href="mailto:[^"]+\?subject=%C3%80%20propos%20de%20%C2%AB%20Lisbonne%20et%20Porto%20%C2%BB">Écrire à Sébastien et Julien<\/a>/);
  assert.match(h, /class="prec"><span class="sens">← Billet précédent<\/span><span class="t">Pourquoi nous ne recadrons pas/);
  assert.match(h, /class="suiv"><span class="sens">Billet suivant →<\/span><span class="t">Élise, ou comment demander/);
  assert.match(h, /<h2 id="planche-t">Les 4 photos de ce billet<\/h2>/);
  // La couverture (première photo) n'est pas répétée seule dans le texte.
  assert.equal((h.match(/href="\/photo\/brume-sur-la-loire\?carnet=lisbonne-et-porto"/g) || []).length, 2, 'ouverture et planche');
  assert.match(h, /voir en grand, photo 1 sur 4/);
});

test('trois langues : traduction publiée en anglais, page allemande en français avec bandeau et noindex, sans redirection ; libellés de l’interface traduits', async t => {
  const c = await world(t);
  setV2(c);
  const en = await c.see('/en/carnet/lisbonne-et-porto');
  assert.equal(en.statusCode, 200);
  assert.match(en.body, /<h1 class="titre-page" id="titre">Lisbon and Porto<\/h1>/);
  assert.match(en.body, /Published on/);
  assert.match(en.body, /<link rel="canonical" href="http:\/\/localhost:3000\/en\/carnet\/lisbonne-et-porto">/);
  assert.match(en.body, />Notebooks<\/a>/);
  const de = await c.app.inject({ url: '/de/carnet/lisbonne-et-porto', headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'de', cookie: 'langue=de' } });
  assert.equal(de.statusCode, 200);
  assert.equal(de.headers['x-robots-tag'], 'noindex, follow');
  assert.match(de.body, /<html lang="de"/);
  assert.match(de.body, /<article aria-labelledby="titre" lang="fr">/);
  assert.match(de.body, /Dieser Beitrag ist nur auf Französisch verfügbar\./);
  assert.match(de.body, />Reisetagebücher<\/a>/);
  assert.doesNotMatch(de.body, /rel="canonical"/);
  const list = (await c.see('/de/carnet')).body;
  assert.match(list, /<p class="nur-fr">Nur auf Französisch<\/p>/);
  assert.match(list, /Beiträge, die neuesten zuerst/);
  // Flux par langue : les billets publiés dans la langue seulement.
  const feedEn = (await c.app.inject('/en/carnet/flux.xml')).body;
  assert.match(feedEn, /<title>Lisbon and Porto<\/title>/);
  assert.doesNotMatch(feedEn, /Pourquoi nous ne recadrons pas/);
});

test('ancienne adresse : 301 ; retiré : 410 ; jamais publié : 404 pour un visiteur, aperçu noindex et no-store pour l’équipe', async t => {
  const c = await world(t);
  setV2(c);
  c.app.carnet.update(c.q.id, { slug: 'nous-ne-recadrons-pas' }, { sub: 'x', name: 'x' });
  const moved = await c.see('/carnet/pourquoi-nous-ne-recadrons-pas');
  assert.deepEqual([moved.statusCode, moved.headers.location], [301, '/carnet/nous-ne-recadrons-pas']);
  assert.equal((await c.see('/en/carnet/pourquoi-nous-ne-recadrons-pas')).headers.location, '/en/carnet/nous-ne-recadrons-pas');
  c.app.carnet.retire(c.r.id, { sub: 'x', name: 'x' }, 'Erreur de légende.');
  const gone = await c.see('/carnet/elise-ou-comment-demander');
  assert.equal(gone.statusCode, 410);
  assert.doesNotMatch(gone.body, /Erreur de légende/);
  assert.equal((await c.see('/carnet/brouillon-cache')).statusCode, 404);
  assert.equal((await c.see('/carnet/inconnu')).statusCode, 404);
  const adm = as(c, { sub: 'z-adm', name: 'Admin', roles: ['admin'] });
  const pre = await adm.get('/carnet/brouillon-cache');
  assert.equal(pre.statusCode, 200);
  assert.equal(pre.headers['x-robots-tag'], 'noindex');
  assert.equal(pre.headers['cache-control'], 'private, no-store');
  assert.match(pre.body, /Aperçu réservé à l’équipe/);
  assert.doesNotMatch(pre.body, /application\/ld\+json/);
  // Une session sans droit sur les Carnets n'a pas d'aperçu.
  const none = await c.see('/carnet/brouillon-cache');
  assert.equal(none.statusCode, 404);
});

test('plan du site (v2 appliquée) : la liste et les billets publiés, dans leurs langues publiées, lastmod ; robots.txt n’interdit pas les Carnets', async t => {
  const c = await world(t);
  setV2(c);
  const xml = (await c.see('/sitemap.xml')).body;
  assert.match(xml, /<loc>http:\/\/localhost:3000\/carnet<\/loc><lastmod>2026-10-15<\/lastmod>/);
  assert.match(xml, /<loc>http:\/\/localhost:3000\/carnet\/lisbonne-et-porto<\/loc><lastmod>2026-10-14<\/lastmod>/);
  assert.match(xml, /<loc>http:\/\/localhost:3000\/en\/carnet\/lisbonne-et-porto<\/loc>/);
  assert.doesNotMatch(xml, /\/de\/carnet\/lisbonne-et-porto<\/loc>/, 'langue non publiée : absente');
  assert.doesNotMatch(xml, /\/en\/carnet\/pourquoi-nous-ne-recadrons-pas<\/loc>/);
  assert.doesNotMatch(xml, /brouillon-cache/);
  c.app.carnet.retire(c.q.id, { sub: 'x', name: 'x' }, 'x');
  assert.doesNotMatch((await c.see('/sitemap.xml')).body, /pourquoi-nous-ne-recadrons-pas/);
  const robots = (await c.see('/robots.txt')).body;
  assert.doesNotMatch(robots, /Disallow: \/carnet/);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Sitemap: /);
});

test('flux Atom : texte intégral, adresses absolues, id tag: stable, auteurs ; ETag et 304 ; cache public de 15 minutes ; jamais redirigé', async t => {
  const c = await world(t);
  setV2(c);
  const r = await c.app.inject({ url: '/carnet/flux.xml', headers: { 'user-agent': UA, 'accept-language': 'de' } });
  assert.equal(r.statusCode, 200, 'un lecteur en allemand n’est pas redirigé');
  assert.match(r.headers['content-type'], /application\/atom\+xml/);
  assert.equal(r.headers['cache-control'], 'public, max-age=900');
  const x = r.body;
  assert.match(x, /<feed xmlns="http:\/\/www.w3.org\/2005\/Atom" xml:lang="fr">/);
  assert.match(x, /<link rel="self" type="application\/atom\+xml" href="http:\/\/localhost:3000\/carnet\/flux.xml"\/>/);
  assert.match(x, new RegExp(`<id>tag:localhost,\\d{4}-\\d{2}-\\d{2}:carnet/${c.p.id}</id>`));
  assert.equal((x.match(/<entry>/g) || []).length, 3);
  assert.match(x, /<author><name>Sébastien<\/name>/);
  assert.match(x, /src=&quot;http:\/\/localhost:3000\/media\//);
  const again = await c.app.inject({ url: '/carnet/flux.xml', headers: { 'if-none-match': r.headers.etag } });
  assert.equal(again.statusCode, 304);
});

test('visionneuse ?carnet= : retour au billet (à la photo), position et voisines dans l’ordre du billet, ligne « Billet » ; sans le contexte, la visionneuse ordinaire', async t => {
  const c = await world(t);
  setV2(c);
  const r = await c.see('/photo/deux-minuit?carnet=lisbonne-et-porto');
  assert.equal(r.statusCode, 200);
  const h = r.body;
  assert.match(h, /<a class="sh-retour sh-retour--long" href="\/carnet\/lisbonne-et-porto#photo-2" data-retour>[\s\S]*?<span class="sr-only">Retour au billet\u202f: <\/span>Lisbonne et Porto<\/span><\/a>/);
  assert.match(h, /<span class="vis-pos donnee">2 \/ 4&nbsp;· <span>Lisbonne et Porto<\/span><\/span>/);
  assert.match(h, /<a class="vis-fleche vis-prec" href="\/photo\/brume-sur-la-loire\?carnet=lisbonne-et-porto" rel="prev">/);
  assert.match(h, /<a class="vis-fleche vis-suiv" href="\/photo\/quai-7h12\?carnet=lisbonne-et-porto" rel="next">/);
  assert.match(h, /<dt>Billet<\/dt><dd><a href="\/carnet\/lisbonne-et-porto">Lisbonne et Porto<\/a>, photo 2 sur 4<\/dd>/);
  assert.match(h, /aria-label="Photos du billet Lisbonne et Porto"/);
  // En anglais : le billet traduit (ses photos, celles du texte anglais).
  assert.match((await c.see('/en/photo/brume-sur-la-loire?carnet=lisbonne-et-porto')).body, /Back to the post: <\/span>Lisbon and Porto/);
  // Une photo qui n'est pas dans le billet : la visionneuse ordinaire.
  const out = await c.see('/photo/elise-contre-jour?carnet=lisbonne-et-porto');
  assert.equal(out.statusCode, 200);
  assert.doesNotMatch(out.body, /Retour au billet/);
});
