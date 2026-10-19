import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { TRAP_PATH } from '../server/securite/piege.js';
import { search } from '../server/geo/cities.js';
import { billet } from './carnet-helpers.js';

// Aucun lien interne vers une page introuvable (registre docs/etudes/vigie-besoins-des-briques.md, BV-5) : la Vigie
// compte les 404 par adresse (malicious_excess_404, score d'adresse DS22) ; un lien cassé du site en ferait compter à des
// visiteurs ordinaires. Depuis l'accueil, en français, en anglais et en allemand, en v1 puis en v2 (réglage
// public_version), on suit chaque lien interne des pages (href, src, srcset, action des formulaires GET, adresses
// absolues du site : canonique, hreflang, og:image ; url() des feuilles de style), et aucune réponse n'est une 404 ni
// une erreur. Le lien piège de la Vigie (it.trapLink, TRAP_PATH) n'est jamais suivi : il doit rester une 404.
// Parcours borné (profondeur, nombre d'adresses) pour rester rapide ; les pages v2 ajoutées plus tard sont couvertes
// d'elles-mêmes (même parcours, réglage v2).
const MAX_DEPTH = 8;
const MAX_URLS = 1500;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
// Ressources : vérifiées (HEAD), jamais lues, sauf les feuilles de style (leurs url()).
const RESOURCE = /^\/(?:static|media|fonts|brand)\/|\.(?:avif|webp|jpe?g|png|svg|ico|css|js|woff2?|webmanifest|xml|txt)$/i;
// Hors du site public : seulement vérifiées, sans les parcourir (admin, connexion).
const OUTSIDE = /^\/(?:admin|auth)(?:[/?#]|$)/;

// Toutes les adresses d'une page HTML (attributs décodés des entités de base).
const unescape = s => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"');
function linksOf(html) {
  const out = [];
  for (const m of html.matchAll(/<(a|link|img|source|script|form|iframe|video|audio|meta)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase(), at = m[2];
    const attr = name => { const x = at.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i')) || at.match(new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, 'i')); return x ? unescape(x[1]) : null; };
    if (tag === 'form') {
      if (!/^get$/i.test(attr('method') || 'get')) continue;            // POST : envoi, pas un lien
      out.push({ url: attr('action') ?? '', kind: 'form' });
      continue;
    }
    if (tag === 'meta') {
      if (/^(?:og:image|og:url|twitter:image)$/i.test(attr('property') || attr('name') || '')) out.push({ url: attr('content') || '', kind: 'meta' });
      continue;
    }
    for (const name of ['href', 'src']) { const v = attr(name); if (v != null) out.push({ url: v, kind: `${tag}@${name}` }); }
    for (const name of ['srcset', 'imagesrcset']) {
      const v = attr(name);
      if (v) for (const part of v.split(',')) { const u = part.trim().split(/\s+/)[0]; if (u) out.push({ url: u, kind: `${tag}@${name}` }); }
    }
  }
  return out;
}
const cssLinks = css => [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map(m => ({ url: m[1], kind: 'css@url' }));

// Adresse interne (chemin et requête), ou null pour un lien externe, une ancre seule, mailto:, tel:, data:…
function internal(raw, from, origin) {
  const s = String(raw).trim();
  if (!s || s.startsWith('#') || /^(?:mailto|tel|sms|javascript|data|blob):/i.test(s)) return null;
  let u;
  try { u = new URL(s, `${origin}${from}`); } catch { return { bad: s }; }
  if (u.origin !== origin) return null;
  return { path: u.pathname, url: `${u.pathname}${u.search}` };
}

// starts : adresses de départ ; cookie : la session d'un visiteur ; follow : pages dont on lit les liens (les autres sont
// seulement vérifiées).
async function crawl(app, { origin, starts = ['/', '/en', '/de'], cookie = null, follow = () => true }) {
  const seen = new Map();                 // adresse → première page qui y mène
  const broken = [];
  const trapSeen = [];
  let pages = 0;
  const queue = [];
  const add = (raw, from, depth, kind) => {
    const i = internal(raw, from, origin);
    if (!i) return;
    if (i.bad) { broken.push({ url: i.bad, from, kind, status: 'adresse invalide' }); return; }
    if (i.path === TRAP_PATH) { trapSeen.push(from); return; }        // piège de la Vigie : jamais suivi
    if (seen.has(i.url)) return;
    seen.set(i.url, from);
    queue.push({ url: i.url, path: i.path, from, depth, kind });
  };
  for (const start of starts) add(start, '/', 0, 'départ');
  while (queue.length) {
    assert.ok(seen.size <= MAX_URLS, `parcours borné : plus de ${MAX_URLS} adresses`);
    const { url, path, from, depth, kind } = queue.shift();
    const resource = RESOURCE.test(path) && !path.endsWith('.css');
    const res = await app.inject({ method: resource ? 'HEAD' : 'GET', url, headers: { 'user-agent': UA, accept: 'text/html,*/*', ...(cookie ? { cookie } : {}) } });
    if (res.statusCode >= 400) {                                       // 404, erreur, ou tout autre refus
      broken.push({ url, from, kind, status: res.statusCode });
      continue;
    }
    if (res.statusCode >= 300 && res.statusCode < 400) { if (res.headers.location) add(res.headers.location, url, depth, 'redirection'); continue; }
    if (resource || OUTSIDE.test(path) || depth >= MAX_DEPTH || !follow(path)) continue;
    const type = String(res.headers['content-type'] || '');
    if (type.startsWith('text/css')) { for (const l of cssLinks(res.body)) add(l.url, url, depth + 1, l.kind); continue; }
    if (!type.startsWith('text/html')) continue;
    pages += 1;
    for (const l of linksOf(res.body)) add(l.url, url, depth + 1, l.kind);
  }
  return { broken, pages, urls: seen.size, trapSeen, seen };
}

// Site de démonstration avec toutes les pages facultatives ouvertes : carte, recherche, mots-clés, un voyage publié, et des
// billets des Carnets (v2 seulement : en v1, aucune page n'y mène) : publiés, traduits, liés entre eux, à une série et au
// voyage ; un billet retiré et un brouillon, vers lesquels aucun lien ne doit mener.
async function world(t, version) {
  const c = await setup(t, { seeded: true });
  await c.app.ready();
  const ids = c.db.prepare('SELECT id, author_id FROM photos ORDER BY id').all();
  const set = c.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  set.run('map_page', 'true');
  set.run('keywords_shown', 'true');
  const pt = name => search(name, 10).find(x => x.cc === 'PT');
  [['2026-09-01', 'Lisbonne'], ['2026-09-02', 'Porto']].forEach(([day, city], i) => {
    const x = pt(city);
    c.db.prepare('UPDATE photos SET taken_on = ?, on_map = 1, city_id = ?, city_name = ?, city_cc = ?, city_lat = ?, city_lon = ?, keywords = ? WHERE id = ?')
      .run(day, x.id, x.name, x.cc, x.lat, x.lon, 'fleuve, matin', ids[i].id);
  });
  const trip = c.app.trips.create({ name: 'Portugal, septembre 2026' });
  c.app.trips.update(trip, { intro: 'Deux jours.' });
  c.app.trips.addDays(trip, [{ author_id: ids[0].author_id, day: '2026-09-01' }, { author_id: ids[1].author_id, day: '2026-09-02' }]);
  c.db.prepare('UPDATE trips SET public = 1 WHERE id = ?').run(trip);
  const first = await billet(c, { title: 'Lisbonne et Porto', authors: ['sebastien', 'julien'], body: `Texte.\n\nphoto:${ids[0].id}\n\n## Lisbonne\n\nphoto:${ids[1].id}\nphoto:${ids[2].id}\n\n## Porto\n\nVoir [la série](serie:1) et [le voyage](voyage:${trip}).\n\nphoto:${ids[3].id}\nphoto:${ids[4].id}\nphoto:${ids[5].id}`,
    extra: { trip_id: trip, title_en: 'Lisbon and Porto', dek_en: 'Two days.', body_en: `Text.\n\nphoto:${ids[0].id}`, langs: ['en'] } });
  await billet(c, { title: 'Notes d’atelier', rubrique: 'atelier', authors: ['julien'], body: `Lire [le billet](carnet:${first.id}).\n\nphoto:${ids[6].id}` });
  const gone = await billet(c, { title: 'Billet retiré', body: `photo:${ids[7].id}` });
  c.app.carnet.retire(gone.id, { sub: 'x', name: 'x' }, 'test');
  await billet(c, { title: 'Brouillon', publish: false });
  c.app.publicVersion.save(version);
  // Une galerie privée ouverte, avec un accès : aucune page publique n'y mène (G35).
  const space = c.app.spaces.createSpace({ title: 'Galerie privée de test', closes: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) }, { authorId: ids[0].author_id, by: 'test' });
  c.app.spaces.addPhotos(space, ids.slice(0, 3).map(p => p.id));
  c.app.spaces.setState(space, 'ouverte', null);
  c.privateAccess = await c.app.spaces.createInvite(space, { label: 'Invitée', expires: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10), favoris: '1', telecharger: '1' }, { by: 'test', request: null });
  c.privateSpace = c.app.spaces.get(space);
  return c;
}

for (const version of ['v1', 'v2']) {
  test(`${version} : aucun lien interne vers une 404 ni une erreur (fr, en, de, depuis l'accueil)`, async t => {
    const c = await world(t, version);
    const origin = new URL(c.config.publicUrl).origin;
    const r = await crawl(c.app, { origin });
    const report = r.broken.map(b => `${b.status} ${b.url} (${b.kind}, depuis ${b.from})`).join('\n');
    assert.equal(r.broken.length, 0, `liens cassés :\n${report}`);
    // Le parcours a bien vu tout le site : chaque langue, les pages facultatives, les photos, les images.
    for (const lang of ['', '/en', '/de']) {
      for (const p of ['/a-propos', '/droits', '/confidentialite', '/mentions-legales', '/carte', '/voyages', '/recherche', '/bonjour', '/photo/brume-sur-la-loire', '/serie/rue', '/auteur/julien'])
        assert.ok([...r.seen.keys()].some(u => u === `${lang}${p}` || u.startsWith(`${lang}${p}?`)), `${lang}${p} parcourue (${version})`);
    }
    assert.ok([...r.seen.keys()].some(u => u.startsWith('/media/')), 'images suivies');
    assert.ok([...r.seen.keys()].some(u => u.startsWith('/voyage/')), 'voyage suivi');
    // Les Carnets : parcourus en v2 (liste, filtres, billets, traduction, visionneuse ?carnet=, flux), jamais en v1.
    const carnet = [...r.seen.keys()].filter(u => /^(?:\/en|\/de)?\/carnet|[?&]carnet=/.test(u));
    if (version === 'v2') {
      for (const u of ['/carnet', '/en/carnet', '/de/carnet', '/carnet/lisbonne-et-porto', '/en/carnet/lisbonne-et-porto', '/carnet/notes-d-atelier', '/carnet?rubrique=atelier', '/carnet?par=julien', '/carnet/flux.xml', '/carnet/lisbonne-et-porto/partager'])
        assert.ok(r.seen.has(u), `${u} parcourue`);
      assert.ok(carnet.some(u => u.startsWith('/photo/') && u.includes('?carnet=lisbonne-et-porto')), 'visionneuse dans le contexte du billet');
      assert.ok(!carnet.some(u => /billet-retire|\/carnet\/brouillon/.test(u)), 'aucun lien vers un billet retiré ou un brouillon');
    } else assert.deepEqual(carnet, [], 'v1 : aucun lien vers les Carnets');
    assert.ok(r.pages > 50, `${r.pages} pages lues`);
    // Bien la version demandée (feuilles de style de la v2 seulement en v2).
    assert.equal([...r.seen.keys()].some(u => u.startsWith('/static/css/v2/')), version === 'v2');
    // Le lien piège (avec la Vigie) n'a jamais été suivi, et reste introuvable.
    if (c.app.securite.enabled) assert.ok(r.trapSeen.length > 0, 'lien piège vu dans les pages');
    assert.ok(![...r.seen.keys()].some(u => u.startsWith(TRAP_PATH)));
    assert.equal((await c.app.inject(TRAP_PATH)).statusCode, 404);
    // Les pages des galeries privées ne sont atteintes depuis aucune page publique (G35, BV-5).
    assert.ok(![...r.seen.keys()].some(u => /^\/(?:g|prive)\//.test(u)), 'aucun lien public vers /g/ ni /prive/');
    t.diagnostic(`${version} : ${r.pages} pages, ${r.urls} adresses`);
  });
}

// BV-5 étendu (registre de la Vigie, prérequis des galeries privées) : avec une session d'invité, chaque lien des pages
// /g/ et /prive/ (vues, photos, téléchargements permis, pied de page) répond sans 404 ; le lien piège n'est pas suivi.
test('galerie privée : avec la session d’un invité, aucun lien de ses pages vers une 404 (BV-5 étendu)', async t => {
  const c = await world(t, 'v1');
  const origin = new URL(c.config.publicUrl).origin;
  const { token, password } = c.privateAccess;
  const enter = await c.app.inject({ method: 'POST', url: `/g/${token}`, headers: { 'content-type': 'application/x-www-form-urlencoded', origin }, payload: `password=${password}` });
  assert.equal(enter.statusCode, 303);
  const cookie = [].concat(enter.headers['set-cookie']).map(x => x.split(';')[0]).find(x => x.includes('visiteur='));
  const pid = c.privateSpace.public_id;
  const r = await crawl(c.app, { origin, starts: [`/prive/${pid}`, `/prive/${pid}?vue=favoris`, `/g/${token}`], cookie, follow: p => /^\/(?:g|prive)\//.test(p) });
  assert.equal(r.broken.length, 0, r.broken.map(b => `${b.status} ${b.url} (${b.kind}, depuis ${b.from})`).join('\n'));
  const seen = [...r.seen.keys()];
  for (const re of [new RegExp(`^/prive/${pid}/photo/3$`), new RegExp(`^/prive/${pid}/m/`), new RegExp(`^/prive/${pid}/telecharger/1/web$`), /^\/confidentialite$/, /^\/mentions-legales$/])
    assert.ok(seen.some(u => re.test(u)), `${re} suivie`);
  assert.ok(!seen.some(u => u.startsWith(TRAP_PATH)));
  assert.ok(!seen.some(u => u.startsWith('/langue/')), 'aucun sélecteur /langue/ sur ces pages (G37)');
});
