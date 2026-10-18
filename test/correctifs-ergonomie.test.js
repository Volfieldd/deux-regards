import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setup } from './helpers.js';

// Correctifs relevés par le jury des maquettes (docs/audit-ergonomie-2026-10-16/maquettes/CORRECTIFS-POUR-LE-CODE.md) :
// ce qui se vérifie sans navigateur (gabarits, traductions, feuilles de style). Le rendu lui-même (focus, menu sans
// script, langue de l'app) est vérifié dans e2e/tests/ergonomie.spec.js.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
const css = f => fs.readFileSync(new URL(`../public/admin/${f}`, import.meta.url), 'utf8');

async function admin(t) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  return { ...ctx, cookies, csrf, get: url => ctx.app.inject({ url, cookies }) };
}

function multipart(fields) {
  const boundary = '----test' + Math.random().toString(16).slice(2);
  const body = Object.entries(fields).map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`).join('') + `--${boundary}--\r\n`;
  return { payload: Buffer.from(body), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

test('§ 1 à 4, § 9 : focus d’un champ en erreur, rouge du danger, version en 12 px, boutons au téléphone, focus non caché', () => {
  const a = css('admin.css');
  // Erreur ET focus : la règle vient après celle de l'erreur, et l'emporte (spécificité plus forte, !important).
  const err = a.indexOf('[aria-invalid="true"] { box-shadow: inset 0 0 0 1.5px var(--danger) !important; }');
  const both = a.indexOf(':is(input, select, textarea, button)[aria-invalid="true"]:is(:focus, :focus-visible) {');
  assert.ok(err > 0 && both > err);
  assert.match(a.slice(both, both + 300), /outline: 2px solid var\(--accent-ink\) !important;\s*outline-offset: 2px !important;\s*box-shadow: inset 0 0 0 2px var\(--danger\), 0 0 0 4px var\(--accent-soft\) !important;/);
  assert.match(a, /--danger: #f0605a; --on-danger: #1b0a04; --danger-soft: rgba\(240,96,90,\.13\);/);
  assert.doesNotMatch(a, /vermillon|#e8743b/);
  assert.match(a, /--danger: #b2410a; --on-danger: #ffffff;/);                         // le thème clair ne change pas
  assert.match(a, /\.nav-ver \{ margin-left: auto; font-size: 12px;/);
  assert.match(a, /@media \(max-width: 720px\) \{\n  \/\*[^*]*\*\/\n  \.btn \{ white-space: normal; text-wrap: balance;/);
  assert.match(a, /html:has\(> body\.admin \.tabbar\) \{ scroll-padding-bottom: 90px; \}/);
  assert.match(a, /html:has\(> body\.admin \.main:not\(\.wide\) \.bulk\) \{ scroll-padding-top: 136px; \}/);
  assert.match(a, /\.pal-in:focus-within \{ box-shadow: inset 0 -2px 0 var\(--accent-ink\); \}/);
});

test('§ 8 : menu de l’administration au téléphone, sans script (lien et :target) et avec (bouton, page inerte)', async t => {
  const c = await admin(t);
  const page = (await c.get('/admin')).body;
  assert.match(page, /<nav class="tabbar"[\s\S]*<a href="#admin-nav" data-menu><svg[^>]*>[\s\S]*?<\/svg>Menu<\/a>/);
  assert.doesNotMatch(page, /<button type="button" data-menu/);                       // le bouton, c'est le script qui le pose
  assert.match(page, /<aside class="side" id="admin-nav" data-side>\s*<a class="word"[\s\S]*?<\/a>\s*<a class="side-fermer" href="#contenu" data-menu-close><svg[^>]*>[\s\S]*?<\/svg>Fermer<span class="sr-only"> le menu<\/span><\/a>/);
  assert.match(page, /<main class="main" id="contenu" tabindex="-1">/);
  const a = css('admin.css');
  assert.match(a, /html:not\(\.js\) \.side:target \{ transform: none; visibility: visible;/);
  assert.match(a, /html:not\(\.js\) body\.admin:has\(> \.shell > \.side:target\) > \.shell > \.main,\n  html:not\(\.js\) body\.admin:has\(> \.shell > \.side:target\) > :not\(\.shell, \.skip\) \{ visibility: hidden; \}/);
  assert.match(a, /^\.side-fermer \{ display: none; \}/m);                               // au-delà de 720 px : caché
  const js = fs.readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
  assert.match(js, /link\.replaceWith\(btn\)/);
  assert.match(js, /for \(const el of rest\(\)\) el\.inert = open;/);
  // Anglais et allemand : « Fermer le menu » traduit.
  c.db.prepare("UPDATE authors SET admin_lang = 'de' WHERE slug = 'julien'").run();
  assert.match((await c.get('/admin')).body, /Schließen<span class="sr-only"> das Menü<\/span>/);
});

test('§ 12 : sélecteurs de langue nommés par leur code visible (site et administration)', async t => {
  const c = await admin(t);
  for (const [url, name] of [['/', 'FR</span><span class="sr-only"> – Langue : français'], ['/de/', 'DE</span><span class="sr-only"> – Sprache: Deutsch'], ['/en/a-propos', 'EN</span><span class="sr-only"> – Language: English']]) {
    const body = (await c.app.inject(url)).body;
    assert.ok(body.includes(`<span>${name}</span></summary>`), url);
    assert.doesNotMatch(body, /<summary aria-label/, url);
  }
  const page = (await c.get('/admin')).body;
  assert.match(page, /<span>FR<\/span><span class="sr-only"> – Langue de l’administration : Français<\/span><\/summary>/);
  assert.doesNotMatch(page, /<summary aria-label/);
});

test('§ 13 : « Lieu » et « Ville » ne portent plus le même nom en allemand', async t => {
  const c = await admin(t);
  const id = c.db.prepare('SELECT id FROM photos LIMIT 1').pluck().get();
  const fr = (await c.get(`/admin/photos/${id}`)).body;
  assert.match(fr, /<label for="city_label">Ville de la carte <span class="mono">/);
  c.db.prepare("UPDATE authors SET admin_lang = 'de' WHERE slug = 'julien'").run();
  const de = (await c.get(`/admin/photos/${id}`)).body;
  assert.match(de, /<label for="city_label">Stadt für die Karte <span class="mono">/);
  assert.match(de, /<label>Angezeigter Ort <span class="mono">/);                            // le lieu, texte libre
  assert.doesNotMatch(de, /<label for="city_label">Ort/);
  c.db.prepare("UPDATE authors SET admin_lang = 'en' WHERE slug = 'julien'").run();
  assert.match((await c.get(`/admin/photos/${id}`)).body, /<label for="city_label">Town for the map <span class="mono">/);
  // Photothèque : « Stadt » à côté de « Ort ».
  c.db.prepare("UPDATE authors SET admin_lang = 'de' WHERE slug = 'julien'").run();
  const lib = (await c.get('/admin/photos')).body;
  assert.match(lib, /aria-label="Stadt \(Karte der Website\)"/);
});

test('§ 5 et § 10 : app de terrain, question sans réponse marquée dans la langue de la personne ; langue sans script', async t => {
  const c = await admin(t);
  const blank = (await c.get('/admin/rencontre')).body;
  assert.match(blank, /<p class="app-err" id="err-adult" data-err-for="adult" hidden>/);
  assert.doesNotMatch(blank, /aria-invalid/);
  // Accord donné, âge sans réponse : refusé par le serveur.
  const author = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const m = multipart({ _csrf: c.csrf, author_id: author, lang: 'de', decision: 'accord', scope_site: 'on', name: 'Personne Exemple' });
  const res = await c.app.inject({ method: 'POST', url: '/admin/rencontre', cookies: c.cookies, ...m });
  assert.equal(res.statusCode, 422);
  assert.match(res.body, /<fieldset class="app-age" data-group="adult" aria-describedby="err-adult">/);
  assert.match(res.body, /<p class="app-err" id="err-adult" data-err-for="adult"><span data-l="fr" lang="fr">[^<]+<\/span><span data-l="en" lang="en">[^<]+<\/span><span data-l="de" lang="de">Bitte beantworten Sie diese Frage: Sind Sie 18 Jahre oder älter\?<\/span><\/p>/);
  assert.equal([...res.body.matchAll(/name="adult" value="(oui|non)"[^>]* aria-invalid="true">/g)].length, 2);
  assert.match(res.body, /data-lang="de"/);
  assert.doesNotMatch(res.body, /name="decision" value="accord"[^>]*aria-invalid/);
  // Rien à enregistrer : c'est la décision qui est marquée.
  const none = await c.app.inject({ method: 'POST', url: '/admin/rencontre', cookies: c.cookies, ...multipart({ _csrf: c.csrf, author_id: author, lang: 'en', decision: '' }) });
  assert.equal(none.statusCode, 422);
  assert.match(none.body, /<fieldset class="app-decision" data-group="decision" aria-describedby="err-decision">/);
  assert.equal([...none.body.matchAll(/name="decision" value="[^"]*"[^>]* aria-invalid="true">/g)].length, 3);
  const a = css('app.css');
  assert.match(a, /:is\(input\[type="radio"\], input\[type="checkbox"\]\)\[aria-invalid="true"\] \{ outline: 2px solid var\(--ko\); outline-offset: 1px; \}/);
  assert.match(a, /\[aria-invalid="true"\]:focus-visible \{ outline: 2px solid var\(--ink\) !important; outline-offset: 4px; box-shadow: 0 0 0 2px var\(--ko\); \}/);
  assert.match(a, /\.app-save\[disabled\], \.app-save\[aria-disabled="true"\] \{ opacity: 1; background: transparent;/);
  assert.match(a, /html:has\(\.app-bar\) \{ scroll-padding-top: 88px; \}/);
  assert.match(a, /@supports selector\(:has\(\*\)\) \{\n  \.app-form\[data-lang\] \[data-l\]:not\(\[data-l=""\]\) \{ display: revert; \}/);
  for (const l of ['fr', 'en', 'de']) assert.ok(a.includes(`.app-form:has([data-lang-pick][value="${l}"]:checked) [data-l]:not([data-l="${l}"])`), l);
});
