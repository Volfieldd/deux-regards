import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, VIGIE_KEYS } from './helpers.js';
import { ancre, cadrage, pct } from '../server/v2-vues.js';
import { TRAP_PATH } from '../server/securite/piege.js';

// Site public v2, pages sans formulaire d'envoi : À propos, Droits d'utilisation, Mentions légales, Confidentialité,
// Recherche, Carte, Voyages, un voyage, page introuvable. Mêmes routes, mêmes paramètres, mêmes données que la v1 ; le
// contenu légal identique ; jamais l'heure de prise de vue ; la recherche traitée par le même code ; les points
// d'accroche de la Vigie (lien piège, saisies surveillées) inchangés.
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const LANGS = ['', '/en', '/de'];

// Données de la démonstration complétées : villes (carte publiée), un voyage public de trois jours, des heures de prise de
// vue dont une seule montrée (case cochée : page de la photo seulement), des mentions légales chez un hébergeur nommé.
function enrich(db) {
  const city = db.prepare('UPDATE photos SET city_id = ?, city_name = ?, city_cc = ?, city_lat = ?, city_lon = ?, city_source = ?, on_map = 1 WHERE slug = ?');
  city.run(3037656, 'Angers', 'FR', 47.47156, -0.55202, 'manuel', 'quai-7h12');
  city.run(3037656, 'Angers', 'FR', 47.47156, -0.55202, 'manuel', 'brume-sur-la-loire');
  city.run(2990969, 'Nantes', 'FR', 47.21725, -1.55336, 'manuel', 'deux-minuit');
  city.run(2267057, 'Lisbonne', 'PT', 38.71667, -9.13333, 'manuel', 'passage-fin-d-apres-midi');
  const day = db.prepare('UPDATE photos SET taken_on = ?, taken_time = ?, show_time = ? WHERE slug = ?');
  day.run('2024-10-12', '07:12', 0, 'quai-7h12');
  day.run('2024-10-12', '06:05', 0, 'brume-sur-la-loire');
  day.run('2024-10-13', '23:58', 0, 'deux-minuit');
  day.run('2024-10-13', '18:52', 1, 'passage-fin-d-apres-midi');
  const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries({ map_page: true, legal_names: 'Sébastien Exemple et Julien Exemple', legal_address: '1 rue de l’Exemple\n49000 Angers',
    legal_phone: '+33 2 00 00 00 00', legal_director: 'Julien Exemple', legal_email: 'contact@exemple.test', rights_contact: 'contact@exemple.test',
    legal_host: 'hebergeur', legal_host_name: 'Hébergeur Exemple', legal_host_address: '2 rue du Serveur\n75000 Paris', legal_host_phone: '+33 1 00 00 00 00',
    about: 'Nous photographions chacun de notre côté.\n\nPuis nous rassemblons nos images ici.' })) set.run(k, JSON.stringify(v));
  const au = s => db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(s);
  const id = db.prepare("INSERT INTO trips (slug, name, intro, author_id, public, created_at) VALUES ('loire', 'Loire', 'Deux jours au bord du fleuve.', NULL, 1, ?)").run(Date.now()).lastInsertRowid;
  db.prepare('INSERT INTO trip_days (trip_id, author_id, day) VALUES (?, ?, ?)').run(id, au('sebastien'), '2024-10-12');
  db.prepare('INSERT INTO trip_days (trip_id, author_id, day) VALUES (?, ?, ?)').run(id, au('julien'), '2024-10-13');
}
const site = async (t, { vigie, events = null } = {}) => {
  const vigieOptions = vigie ? { send: async body => { events?.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false } : undefined;
  // vigie : true (Vigie simulée), false (sans Vigie, même sous npm run test:vigie), absent (la suite choisit).
  const c = await setup(t, { seeded: true, ...(vigie ? { env: VIGIE, vigieOptions } : vigie === false ? { env: { VIGIE_URL: '' } } : {}) });
  enrich(c.db);
  const visit = (url, o = {}) => c.app.inject({ method: 'GET', url, ...o });
  // Rendu d'une adresse en v1 puis en v2 (même serveur, même base).
  const both = async url => { c.app.publicVersion.save('v1'); const v1 = await visit(url); c.app.publicVersion.save('v2'); const v2 = await visit(url); return { v1, v2 }; };
  return { ...c, visit, both };
};

// Texte des intertitres et paragraphes d'un fragment HTML, entités décodées, espaces (insécables comprises) réduites.
const decode = s => s.replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const norm = s => decode(s).replace(/[\s  ]+/g, ' ').trim();
const blocks = html => [...html.matchAll(/<(h2|p)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => norm(m[2])).filter(Boolean);
const between = (html, a, b) => { const i = html.indexOf(a); assert.ok(i >= 0, a); const j = html.indexOf(b, i); return html.slice(i, j < 0 ? undefined : j); };
// Texte de la v1 (views/privacy.eta, legal.eta, rights.eta : <div class="prose">) et de la v2 (.lecture-texte, sans « ↑ Sommaire »).
const v1Text = html => blocks(between(html, '<div class="prose">', '</main>'));
const v2Text = html => blocks(between(html, '<div class="lecture-texte', '</main>').replace(/<p class="lecture-haut">[\s\S]*?<\/p>/g, ''));
const PAGES = ['/a-propos', '/droits', '/mentions-legales', '/confidentialite', '/recherche', '/recherche?q=loire', '/recherche?q=zzzz', '/carte', '/voyages', '/voyage/loire', '/page-inexistante'];

test('aides v2 : ancres, positions en pourcentage, cadrage de la carte', () => {
  const ids = new Set();
  assert.equal(ancre('Qui est responsable', ids), 'qui-est-responsable');
  assert.equal(ancre('« J’aime », partages et signalements', ids), 'j-aime-partages-et-signalements');
  assert.equal(ancre('Qui est responsable', ids), 'qui-est-responsable-2');
  assert.equal(ancre('Angaben gemäß § 5 DDG', ids), 'angaben-gemass-5-ddg');
  assert.equal(pct(500, 400, 200), 50);
  assert.deepEqual(cadrage([]), { x: 0, y: 0, w: 1000, h: 520 });
  // Une ville seule : 60 unités (environ 22° de longitude), centrée ; deux villes éloignées : un sixième du cadre de chaque côté.
  assert.deepEqual(cadrage([{ x: 480, y: 150 }]), { x: 450, y: 134.4, w: 60, h: 31.2 });
  const v = cadrage([{ x: 100, y: 100 }, { x: 600, y: 300 }]);
  assert.equal(v.w, 750);
  assert.ok(v.x <= 100 && v.x + v.w >= 600 && v.y <= 100 && v.y + v.h >= 300);
  // Jamais hors du fond.
  const bord = cadrage([{ x: 995, y: 515 }]);
  assert.ok(bord.x + bord.w <= 1000 && bord.y + bord.h <= 520);
});

test('pages v2 : rendues dans les trois langues, sans style ni script en ligne, lien piège une fois, jamais l’heure', async t => {
  const c = await site(t, { vigie: true });
  c.app.publicVersion.save('v2');
  for (const prefix of LANGS) {
    for (const url of PAGES) {
      const res = await c.visit(prefix + url);
      assert.equal(res.statusCode, url === '/page-inexistante' ? 404 : 200, prefix + url);
      const b = res.body;
      assert.match(b, /css\/v2\/pages\.css/, `${prefix}${url} : page v2`);
      assert.doesNotMatch(b, /\sstyle=/, `${prefix}${url} : style en ligne`);
      assert.doesNotMatch(b, /<script(?![^>]*\ssrc=)/, `${prefix}${url} : script en ligne`);
      assert.equal(b.split(TRAP_PATH).length - 1, 1, `${prefix}${url} : lien piège une seule fois`);
      assert.match(b, new RegExp(`<a href="${TRAP_PATH}" rel="nofollow" hidden tabindex="-1" aria-hidden="true">`));
      // L'heure de prise de vue (18 h 52, cochée pour la photo de Lisbonne ; les autres non cochées) n'apparaît que sur la
      // page de la photo.
      assert.doesNotMatch(b, /18[\s ]h[\s ]52|18:52|6:52 pm|7[\s ]h[\s ]12|07:12|23[\s ]h[\s ]58|23:58|11:58 pm|6[\s ]h[\s ]05|06:05/, `${prefix}${url} : heure`);
      assert.equal((b.match(/<h1\b/g) || []).length, 1, `${prefix}${url} : un seul h1`);
    }
  }
  // La page de la photo, elle, montre l'heure cochée (contrôle du jeu de données).
  assert.match((await c.visit('/photo/passage-fin-d-apres-midi')).body, /18 h 52|18 h 52/);
  // Sans Vigie, aucun lien piège.
  const sans = await site(t, { vigie: false });
  sans.app.publicVersion.save('v2');
  for (const url of PAGES) assert.ok(!(await sans.visit(url)).body.includes(TRAP_PATH), url);
});

test('confidentialité v2 : le même texte que la v1 dans les trois langues (journal de sécurité compris), avec sommaire et ancres', async t => {
  for (const vigie of [false, true]) {
    const c = await site(t, { vigie });
    for (const prefix of LANGS) {
      const { v1, v2 } = await c.both(`${prefix}/confidentialite`);
      const a = v1Text(v1.body), b = v2Text(v2.body);
      const updated = a.pop();                                                  // v1 : « Mise à jour : … » en dernier
      assert.deepEqual(b, a, `${prefix || '/'} ${vigie ? 'avec' : 'sans'} Vigie`);
      assert.ok(norm(between(v2.body, '<p class="lecture-maj">', '</p>')).endsWith(updated), 'date de mise à jour sous le titre');
      assert.equal(/Journal de sécurité|Security log|Sicherheitsprotokoll/.test(b.join(' ')), vigie, 'journal de sécurité seulement avec la Vigie');
      // Chaque intertitre a son ancre, et le sommaire y mène dans le même ordre.
      const ids = [...between(v2.body, '<div class="lecture-texte', '</main>').matchAll(/<h2 class="titre-3" id="([^"]+)"/g)].map(m => m[1]);
      const som = [...between(v2.body, '<nav class="lecture-som"', '</nav>').matchAll(/<a href="#([^"]+)"/g)].map(m => m[1]);
      assert.deepEqual(som, ids);
      assert.equal(ids.length, (v1.body.match(/<h2>/g) || []).length);
    }
  }
});

test('mentions légales et droits v2 : le même texte que la v1, directeur de la publication et hébergement tels qu’ils sont réglés', async t => {
  const c = await site(t);
  for (const prefix of LANGS) {
    const legal = await c.both(`${prefix}/mentions-legales`);
    const a = v1Text(legal.v1.body), b = v2Text(legal.v2.body);
    assert.deepEqual(b, a, `mentions ${prefix || '/'}`);
    assert.ok(b.includes('Julien Exemple'), 'directeur de la publication');
    assert.ok(b.some(p => p.includes('Hébergeur Exemple, 2 rue du Serveur, 75000 Paris, +33 1 00 00 00 00')), 'hébergeur nommé');
    assert.match(legal.v2.body, /<a href="mailto:contact@exemple\.test">contact@exemple\.test<\/a>/);
    const rights = await c.both(`${prefix}/droits`);
    assert.deepEqual(v2Text(rights.v2.body), v1Text(rights.v1.body), `droits ${prefix || '/'}`);
  }
  // Hébergement par défaut (par les éditeurs) : la phrase de la v1, telle quelle.
  c.db.prepare("UPDATE settings SET value = '\"editeurs\"' WHERE key = 'legal_host'").run();
  const { v1, v2 } = await c.both('/mentions-legales');
  assert.deepEqual(v2Text(v2.body), v1Text(v1.body));
  assert.ok(v2Text(v2.body).includes('Le site est hébergé par ses éditeurs, sur leur propre serveur, en France, à l’adresse ci-dessus.'));
  // Les textes sont échappés (réglages de l'admin).
  c.db.prepare("UPDATE settings SET value = ? WHERE key = 'legal_director'").run(JSON.stringify('<img src=x onerror=alert(1)>'));
  const esc = (await c.visit('/mentions-legales')).body;
  assert.ok(esc.includes('&lt;img src=x onerror=alert(1)&gt;') && !esc.includes('<img src=x'));
});

test('recherche v2 : même route, même paramètre, mêmes résultats ; la saisie réaffichée échappée, jamais réécrite', async t => {
  const c = await site(t);
  for (const q of ['loire', 'Brume', 'zzzz', 'a', '']) {
    const { v1, v2 } = await c.both(`/recherche?q=${encodeURIComponent(q)}`);
    assert.equal(v2.statusCode, v1.statusCode);
    assert.equal(v2.headers['x-robots-tag'], v1.headers['x-robots-tag'], `noindex « ${q} »`);
    const slugs = b => [...b.matchAll(/href="\/photo\/([^"?]+)/g)].map(m => m[1]);
    assert.deepEqual(slugs(v2.body), slugs(v1.body), `résultats « ${q} »`);
    // Le même formulaire GET : action, nom du champ, longueur.
    assert.match(v2.body, /<form class="recherche" method="get" action="\/recherche" role="search">/);
    assert.match(v2.body, /<input id="q" name="q" type="search" value="[^"]*"[^>]* maxlength="100"[^>]* aria-describedby="q-aide"/);
    assert.match(v2.body, /<label class="recherche-l" for="q">Mots-clés<\/label>/);
  }
  const evil = '<script>alert(1)</script>"\'&é ?';
  const { v1, v2 } = await c.both(`/recherche?q=${encodeURIComponent(evil)}`);
  const shown = '&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;é ?';
  for (const [name, b] of [['v1', v1.body], ['v2', v2.body]]) assert.ok(!b.includes('<script>alert(1)'), `${name} : rien d’exécutable`);
  assert.ok(v2.body.includes(`value="${shown}"`), 'dans le champ');
  assert.ok(v2.body.includes(`<title>Rechercher\u202f: ${shown}\u00a0· Test</title>`), 'dans le titre (insécables autour, la saisie telle quelle)');
  assert.ok(v1.body.includes(`<title>Rechercher : ${shown} · Test</title>`));
  // La phrase d'état : les mots autour reçoivent leurs insécables, la saisie (avec son « ? ») reste telle quelle.
  assert.ok(v2.body.includes(`Aucune photo pour « ${shown} ».`), 'dans la phrase d’état');
  // Sans résultat : les séries à parcourir.
  assert.match(v2.body, /Ou parcourez les séries[\s\S]*href="\/serie\/rue"/);
  // Avec résultats : des rangées, le cartel sans l'heure.
  const r = (await c.visit('/recherche?q=quai')).body;
  assert.match(r, /<ul class="rangees" aria-labelledby="r-h">[\s\S]*quai-7h12[\s\S]*Sébastien · Angers · 12 oct\. 2024/);
  // Recherche fermée : 404 en v2 comme en v1.
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('search_page', 'false') ON CONFLICT(key) DO UPDATE SET value = 'false'").run();
  const closed = await c.both('/recherche?q=loire');
  assert.equal(closed.v1.statusCode, 404);
  assert.equal(closed.v2.statusCode, 404);
});

test('recherche v2 et Vigie : une saisie piégée est signalée comme en v1, une saisie ordinaire jamais', async t => {
  const events = [];
  const c = await site(t, { vigie: true, events });
  const flush = async () => { c.app.securite.runTasks(); c.app.securite.retryNow(); await c.app.securite.flush(); };
  const count = () => events.filter(e => e.type === 'malicious_input').length;
  const seen = {};
  for (const v of ['v1', 'v2']) {
    c.app.publicVersion.save(v);
    const before = count();
    await c.visit(`/recherche?q=${encodeURIComponent("' or 1=1")}`, { remoteAddress: '192.0.2.31' });
    await c.visit(`/de/recherche?q=${encodeURIComponent('<script>x</script>')}`, { remoteAddress: '192.0.2.32' });
    await c.visit(`/recherche?q=${encodeURIComponent('l’aube, <3 et "brume"')}`, { remoteAddress: '192.0.2.33' });
    await flush();
    const mine = events.filter(e => e.type === 'malicious_input').slice(before);
    seen[v] = mine.map(e => [e.detail.familles.join(','), e.detail.constats[0].champ]);
  }
  assert.deepEqual(seen.v1, [['sql', 'query.q'], ['xss', 'query.q']]);
  assert.deepEqual(seen.v2, seen.v1, 'mêmes signalements en v2');
});

test('page introuvable v2 : 404, issues (recherche, galerie, séries), langue vers l’accueil, rien vers le chemin piège', async t => {
  const c = await site(t, { vigie: true });
  for (const url of ['/page-inexistante', '/en/photo/inconnue', TRAP_PATH, '/de/voyage/inconnu']) {
    const { v1, v2 } = await c.both(url);
    assert.equal(v1.statusCode, 404);
    assert.equal(v2.statusCode, 404, url);
    const b = v2.body;
    assert.match(b, /<h1 class="titre-page">(Page introuvable|Page not found|Seite nicht gefunden)<\/h1>/);
    assert.match(b, /<form class="recherche" method="get" action="(\/en|\/de)?\/recherche" role="search">/);
    assert.match(b, /class="liste-liens"[\s\S]*#galerie[\s\S]*#series/);
    // Le sélecteur de langue mène à l'accueil de chaque langue, jamais à la même adresse introuvable.
    const langs = [...b.matchAll(/href="\/langue\/(fr|en|de)\?vers=([^"]+)"/g)].map(m => m[2]);
    assert.deepEqual(langs, ['%2F', '%2F', '%2F'], url);
    assert.equal(b.split(TRAP_PATH).length - 1, 1, `${url} : seul le lien piège caché`);
    assert.match(b, /<footer class="sf sf--complet wrap">/);
  }
});

test('carte v2 : cadrée sur les lieux, vignettes en pourcentage, lieux et « ↑ Carte », 404 tant qu’elle n’est pas publiée', async t => {
  const c = await site(t);
  c.app.publicVersion.save('v2');
  const b = (await c.visit('/carte')).body;
  const [x, y, w, h] = b.match(/<svg class="carte-fond" viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(w < 1000 && Math.abs(h - (w * 520) / 1000) < 0.02, `cadrée au format du fond : ${w} × ${h}`);
  const pins = [...b.matchAll(/<a class="pin" href="#lieu-(\d+)"[^>]*data-x="([\d.]+)" data-y="([\d.]+)"[^>]*aria-label="([^"]+)"><svg x="([\d.-]+)%" y="([\d.-]+)%"/g)];
  assert.equal(pins.length, 3, 'Angers, Nantes, Lisbonne');
  for (const [, id, px, py, label, sx, sy] of pins) {
    assert.ok(Number(sx) >= 0 && Number(sx) <= 100 && Number(sy) >= 0 && Number(sy) <= 100, `${label} dans le cadre`);
    assert.ok(Math.abs(Number(sx) - ((px - x) / w) * 100) < 0.01);
    assert.ok(Math.abs(Number(sy) - ((py - y) / h) * 100) < 0.01);
    assert.match(b, new RegExp(`<section class="lieu" id="lieu-${id}"[\\s\\S]*?href="#carte"`), `lieu ${id} et son retour à la carte`);
  }
  assert.match(b, /aria-label="Angers, France : 2 photos"/);
  assert.match(b, /<div class="carte-outils js-seul" role="group"/);
  // Les commandes de déplacement et de zoom sont des boutons nommés (avec script seulement).
  for (const name of ['Zoom avant', 'Zoom arrière', 'Vers l’ouest', 'Vers le nord', 'Vers le sud', 'Vers l’est']) assert.ok(b.includes(`aria-label="${name}"`), name);
  // Non publiée : introuvable pour les visiteurs, en v2 comme en v1.
  c.db.prepare("UPDATE settings SET value = 'false' WHERE key = 'map_page'").run();
  const off = await c.both('/carte');
  assert.equal(off.v1.statusCode, 404);
  assert.equal(off.v2.statusCode, 404);
});

test('voyages v2 : liste, ouverture sans texte sur la photo, carte sans défilement, jours en rangées sans heure', async t => {
  const c = await site(t);
  c.app.publicVersion.save('v2');
  const list = (await c.visit('/voyages')).body;
  assert.match(list, /<h2 class="voyage-e-titre" id="voyage-\d+"><a href="\/voyage\/loire">Loire<\/a><\/h2>/);
  assert.match(list, /aria-current="page">Voyages</);
  const b = (await c.visit('/voyage/loire')).body;
  assert.match(b, /<nav class="ariane"[\s\S]*href="\/voyages">Voyages<\/a>[\s\S]*aria-current="page">Loire</);
  assert.match(b, /<figure class="voyage-ouv-photo fmt-/);
  assert.doesNotMatch(b, /trip-hero|tabindex="0"/, 'ni titre posé sur la photo, ni cadre qui défile');
  // Étapes : liens vers les jours, nommés ; sommaire des jours.
  assert.match(b, /<a class="voyage-etape" href="#jour-1" aria-label="Étape 1, 12 oct\. : Angers">/);
  assert.match(b, /<a class="voyage-etape" href="#jour-2" aria-label="Étape 2, 13 oct\. : (Nantes|Lisbonne)">/);
  assert.match(b, /<nav class="voyage-som"[\s\S]*href="#jour-1"[\s\S]*href="#jour-2"/);
  const jour1 = between(b, '<section class="voyage-jour" id="jour-1"', '</section>');
  assert.match(jour1, /<ul class="rangees" aria-labelledby="jour-1-t">/);
  assert.match(jour1, /<span class="cartel-m">Sébastien · Anjou<\/span>/);
  // Langues : le même voyage, en allemand.
  assert.match((await c.visit('/de/voyage/loire')).body, /<h2 class="titre-2" id="jours-t">Tag für Tag<\/h2>/);
});

test('à propos v2 : l’accroche en titre, le texte de l’admin, les photographes vers leurs photos', async t => {
  const c = await site(t);
  c.app.publicVersion.save('v2');
  const b = (await c.visit('/a-propos')).body;
  assert.match(b, /<h1 class="titre-page">Deux photographes, un même goût pour les heures creuses\.<\/h1>/);
  assert.match(b, /<p>Nous photographions chacun de notre côté\.<\/p>\s*<p>Puis nous rassemblons nos images ici\.<\/p>/);
  assert.match(b, /href="\/auteur\/julien#galerie">Voir les photos de Julien/);
  assert.match(b, /aria-current="page">À propos</);
  assert.doesNotMatch(b, /class="logotype"/);
});

test('v1 inchangée : sans réglage v2, aucune de ces pages ne charge la feuille de la v2 ; robots.txt identique', async t => {
  const c = await site(t, { vigie: true });
  const robots = (await c.visit('/robots.txt')).body;
  for (const url of PAGES) {
    const b = (await c.visit(url)).body;
    assert.doesNotMatch(b, /css\/v2\//, url);
  }
  c.app.publicVersion.save('v2');
  assert.equal((await c.visit('/robots.txt')).body, robots);
  assert.match(robots, new RegExp(`Disallow: ${TRAP_PATH}`));
});
