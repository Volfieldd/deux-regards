import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { billet, visitor, setV2 } from './carnet-helpers.js';
import { renderBody, linkTarget, scanPlain, activeCount } from '../server/carnet-markdown.js';

// Carnets, le rendu sûr du corps (étude B17 à B26 ; registre de la Vigie, BV-12) : Markdown restreint écrit en HTML par le
// serveur, jeton par jeton ; aucun HTML brut, liens en liste d'autorisation (https, http, mailto, chemin du site, ancre,
// références internes) après décodage des entités et retrait des caractères de contrôle ; images de la photothèque
// seulement. Corpus XSS : la page reste sans script ni attribut d'événement, et ce qui a été neutralisé est compté.
const photo = { id: 1, slug: 'brume', title: 'Brume', width: 900, height: 600, file: 'a.jpg', variant_key: 'k', author_slug: 's', status: 'published', place: 'Anjou' };
const ctx = (extra = {}) => ({
  lang: 'fr', preview: false,
  photo: id => (id === 1 ? { photo, setting: {}, visible: true, alt: 'Une brume', legend: '' } : null),
  href: (kind, id) => (kind === 'serie' && id === 4 ? '/serie/rue' : null),
  photoHref: p => `/photo/${p.slug}?carnet=billet`, meta: () => 'Anjou', picture: (p, o) => `<img src="/media/x.webp" alt="${o.alt}">`,
  t: { seeBig: (n, tot) => ` – voir en grand, photo ${n} sur ${tot}`, diptyque: () => ({ label: 'Deux regards', line: 'deux regards' }), nonPubliee: 'non publiée', galerie: n => `${n} photos` },
  ...extra,
});
// Aucun élément actif dans le HTML produit (hors du texte échappé) : ni <script>, ni attribut on…=, ni lien vers un schéma actif.
const safe = html => {
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<(?!\/?(?:p|h[2-4]|span|a|strong|em|del|code|pre|ul|ol|li|blockquote|figure|figcaption|img|div|table|thead|tbody|tr|th|td|hr|br)\b)[a-z]/i);
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /\s(?:href|src)="\s*(?:javascript|vbscript|data|livescript):/i);
  assert.doesNotMatch(html, /\sstyle=/i);
};

const CORPUS = [
  ['<script>alert(1)</script>', 'script'],
  ['<img src=x onerror=alert(1)>', 'attribut_evenement'],
  ['<svg onload=alert(1)>', 'attribut_evenement'],
  ['[x](javascript:alert(1))', 'schema_refuse'],
  ['[x](JaVaScRiPt:alert(1))', 'schema_refuse'],
  ['[x](jav&#x09;ascript:alert(1))', 'schema_refuse'],
  ['[x](&#106;avascript:alert(1))', 'schema_refuse'],
  ['[x](java\u0000script:alert(1))', null],              // pas un lien pour Marked : du texte
  ['[x]( javascript:alert(1))', 'schema_refuse'],
  ['<javascript:alert(1)>', 'schema_refuse'],
  ['[x](vbscript:msgbox(1))', 'schema_refuse'],
  ['[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)', 'data_url'],
  ['![x](data:image/svg+xml;base64,PHN2Zz4=)', 'image_externe'],
  ['![x](https://ailleurs.example/i.png)', 'image_externe'],
  ['[x](https://ok.example "titre\\" onmouseover=\\"alert(1)")', null],
  ['[x](photo:1"><script>alert(1)</script>)', null],
  ['<a href="javascript:alert(1)">x</a>', 'html_brut'],
  ['<iframe src="https://ailleurs.example"></iframe>', 'html_brut'],
  ['<style>body{display:none}</style>', 'html_brut'],
];

test('corpus XSS : rien d’actif ne sort du rendu ; chaque construction neutralisée est comptée', () => {
  for (const [src, kind] of CORPUS) {
    const r = renderBody(`Texte avant.\n\n${src}\n\nTexte après.`, ctx());
    safe(r.html);
    assert.match(r.html, /Texte après/, src);
    if (kind) assert.ok(r.neutralized[kind] > 0, `${src} → ${kind} : ${JSON.stringify(r.neutralized)}`);
  }
  // Un bloc de code peut citer du HTML : affiché, jamais compté (BV-12).
  const code = renderBody('```\n<script>alert(1)</script>\n```', ctx());
  assert.match(code.html, /<pre tabindex="0"><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/code><\/pre>/);
  assert.equal(activeCount(code.neutralized) + code.neutralized.html_brut, 0);
  // Texte simple (titre, chapô, mention) : compté de la même façon.
  assert.ok(scanPlain('<img src=x onerror=alert(1)>').attribut_evenement > 0);
  assert.ok(scanPlain('javascript:alert(1)').schema_refuse > 0);
  assert.equal(activeCount(scanPlain('Une phrase : « bonjour ».')), 0);
});

test('liens : https et http (rel adapté, « sponsorisé » → sponsored), mailto, chemin du site, ancre, références internes ; le reste en texte', () => {
  assert.deepEqual(linkTarget('https://example.org/a').kind, 'web');
  assert.deepEqual(linkTarget('mailto:nous@example.org').kind, 'mailto');
  assert.deepEqual(linkTarget('/carnet/autre').kind, 'local');
  assert.deepEqual(linkTarget('#samedi').kind, 'anchor');
  assert.deepEqual(linkTarget('serie:4').ref, { kind: 'serie', id: 4 });
  for (const bad of ['//ailleurs.example/x', 'tel:+33123456789', 'ftp://x', 'file:///etc/passwd', 'mailto:', '/\\ailleurs', 'http://']) assert.equal(linkTarget(bad).kind, 'refused', bad);
  const r = renderBody('[ext](https://example.org) [payé](https://shop.example "sponsorisé") [m](mailto:nous@example.org) [s](serie:4) [cassé](voyage:9) [ici](https://a.example)', ctx());
  assert.match(r.html, /<a href="https:\/\/example\.org\/" rel="external noopener">ext<\/a>/);
  assert.match(r.html, /<a href="https:\/\/shop\.example\/" rel="sponsored external noopener">payé<\/a>/);
  assert.match(r.html, /<a href="mailto:nous@example\.org">m<\/a>/);
  assert.match(r.html, /<a href="\/serie\/rue">s<\/a>/);
  assert.match(r.html, / cassé /, 'référence vers une page non publiée : texte simple (B22)');
  assert.ok(r.warnings.some(w => w.code === 'lien_casse') && r.warnings.some(w => w.code === 'cliquez_ici'));
  assert.doesNotMatch(r.html, /title=/, 'le titre d’un lien n’est jamais recopié');
});

test('photos : une ligne seule (figure), deux (paire ou diptyque), trois à douze (galerie) ; inconnue ou non publiée retirée du rendu public, marquée dans l’aperçu', () => {
  const two = { id: 2, slug: 'nuit', title: 'Nuit', width: 600, height: 900, file: 'b.jpg', variant_key: 'k', author_slug: 'j', status: 'draft' };
  const c = ctx({ photo: id => (id === 1 ? { photo, setting: {}, visible: true, alt: 'Une brume' } : id === 2 ? { photo: two, setting: {}, visible: false, alt: 'Nuit' } : null) });
  const pub = renderBody('photo:1\n\nphoto:2\n\nphoto:99\n\nphoto:pas-un-id', c);
  assert.equal((pub.html.match(/<figure/g) || []).length, 1);
  assert.match(pub.html, /<a href="\/photo\/brume\?carnet=billet">/);
  assert.match(pub.html, /voir en grand, photo 1 sur 1/);
  assert.deepEqual(pub.warnings.map(w => w.code).sort(), ['photo_inconnue', 'photo_inconnue', 'photo_non_publiee']);
  const pre = renderBody('photo:1\nphoto:2', { ...c, preview: true });
  assert.match(pre.html, /class="diptyque f-ecran"/, 'deux photographes : un diptyque');
  assert.match(pre.html, /<b>non publiée<\/b>/);
  // Une seule photo décorative : alt vide.
  const deco = renderBody('photo:1', ctx({ photo: () => ({ photo, setting: { decorative: 1 }, visible: true, alt: 'ignoré' }) }));
  assert.match(deco.html, /alt=""/);
});

test('intertitres (# et ## → h2, ### → h3), ancres stables, sommaire dès deux h2, citation avec sa langue, tableau atteignable au clavier', () => {
  const r = renderBody('# Un\n\n## Deux\n\n#### Saut\n\n### Trois\n\n> (pt-PT) «Olá»\n>\n> Traduction : « Bonjour »\n>\n> — Inês\n\n| a | b |\n|---|---|\n| 1 | 2 |', ctx());
  assert.match(r.html, /<h2 class="jour" id="un"><span class="s-n" aria-hidden="true">1<\/span>Un<\/h2>/);
  assert.match(r.html, /<h4 id="saut">/);
  assert.match(r.html, /<h3 id="trois">/);
  assert.ok(r.warnings.some(w => w.code === 'niveau_saute'));
  assert.deepEqual(r.headings.map(h => h.id), ['un', 'deux']);
  assert.match(r.html, /<figure class="citation"><blockquote lang="pt-PT"><p>«Olá»<\/p>\n<\/blockquote><p class="trad">«\u202fBonjour\u202f»<\/p><figcaption>Inês<\/figcaption><\/figure>/);
  assert.match(r.html, /<table tabindex="0">/);
});

test('page publique d’un billet piégé : ni script ni style en ligne (sauf le JSON-LD, échappé), titre et chapô en texte, aucun attribut d’événement', async t => {
  const c = await setup(t, { seeded: true });
  setV2(c);
  const evil = '</script><script>alert(1)</script> <img src=x onerror=alert(2)>';
  const p = await billet(c, { title: `Titre ${evil}`.slice(0, 110), dek: `Chapô ${evil}`, body: CORPUS.map(([s]) => s).join('\n\n'), extra: { mention: `Mention ${evil}`.slice(0, 290), reply: `Réponse [x](javascript:alert(3)) ${evil}` } });
  const r = await visitor(c)(`/carnet/${p.slug}`);
  assert.equal(r.statusCode, 200);
  const html = r.body;
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  for (const [, attrs, inner] of scripts) {
    if (/application\/ld\+json/.test(attrs)) { assert.doesNotMatch(inner, /</); JSON.parse(inner); } else assert.match(attrs, /src="\/static\//);
  }
  // Les valeurs d'attribut (échappées) mises de côté, et les blocs de données : aucun attribut d'événement, aucun style.
  const tags = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '').replace(/="[^"]*"/g, '=""');
  assert.doesNotMatch(tags, /<[a-z][^>]*\son[a-z]+\s*=/i);
  assert.doesNotMatch(tags, /\sstyle=/i);
  assert.doesNotMatch(html, /href="\s*javascript:/i);
  assert.doesNotMatch(html, /<img[^>]+src="x"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  // Le flux le porte en texte, lui aussi.
  const feed = (await c.app.inject('/carnet/flux.xml')).body;
  assert.doesNotMatch(feed, /<script/i);
});
