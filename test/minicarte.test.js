import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { setup } from './helpers.js';
import { photoMap, echelle, placer, MIN_KM, MAX_KM, ASPECT, NEAR_KM, LARGEURS } from '../server/photo-map.js';
import { project, kmPerUnit } from '../server/geo/projection.js';
import { search } from '../server/geo/cities.js';
import { createSessionStore } from '../server/sessions.js';

// Mini-carte de la visionneuse (PLAN point 8, maquette MQ-04) : cadrée sur la ville et ses voisines « À proximité »,
// barre d'échelle juste à la latitude de la ville, noms placés sans chevauchement, le tout calculé par le serveur (même
// rendu sans script), et jamais une position plus précise que le centre de la ville (docs/wiki/Sécurité.md).
const R = 6371;
const city = (q, cc) => search(q, 10).find(c => !cc || c.cc === cc);
let n = 0;
const at = (q, cc, extra = {}) => {
  const c = city(q, cc);
  n += 1;
  return { id: n, slug: `p${n}`, title: `Photo ${n}`, on_map: 1, city_id: c.id, city_name: c.name, city_cc: c.cc, city_lat: c.lat, city_lon: c.lon, ...extra };
};
const LISBONNE = () => [at('Lisbonne'), at('Lisbonne'), at('Almada'), at('Sintra'), at('Cascais'), at('Setúbal'), at('Évora', 'PT'), at('Porto', 'PT')];
const OSLO = () => [at('Oslo', 'NO'), at('Drammen')];
const QUITO = () => [at('Quito', 'EC')];

test('échelle du fond : kilomètres par unité le long du parallèle, à l’équateur, à Lisbonne et à Oslo', () => {
  // Mesure indépendante : 10° de longitude le long du parallèle (R cos φ Δλ), projetés par la formule du fond.
  for (const [lat, attendu] of [[0, 41.3], [38.73, 34.74], [59.91, 25.27]]) {
    const dx = project(lat, 15)[0] - project(lat, 5)[0];
    const arc = R * Math.cos((lat * Math.PI) / 180) * ((10 * Math.PI) / 180);
    assert.ok(Math.abs(kmPerUnit(lat) * dx - arc) / arc < 0.005, `latitude ${lat}`);
    assert.ok(Math.abs(kmPerUnit(lat) - attendu) < 0.05, `latitude ${lat} : ${kmPerUnit(lat)}`);
  }
  assert.ok(kmPerUnit(-38.73) === kmPerUnit(38.73));                                         // symétrique
});

test('barre d’échelle : longueur ronde, au plus le quart du cadre, en km ou en m, trois langues', () => {
  assert.deepEqual(echelle(118), { km: 20, part: 20 / 118, label: '20\u00a0km' });
  assert.equal(echelle(60).label, '10\u00a0km');
  assert.equal(echelle(4).label, '1\u00a0km');
  assert.equal(echelle(3.9).label, '500\u00a0m');
  assert.equal(echelle(1.7).label, '200\u00a0m');
  assert.equal(echelle(0.3).label, '50\u00a0m');
  assert.equal(echelle(4500, 'fr').label, '1\u202f000\u00a0km');
  assert.equal(echelle(4500, 'en').label, '1,000\u00a0km');
  assert.equal(echelle(4500, 'de').label, '1.000\u00a0km');
  for (let w = 0.2; w < 5000; w *= 1.37) {
    const e = echelle(w);
    assert.ok(e.part > 0.099 && e.part <= 0.25, `${w} km : ${e.part}`);
    assert.ok([1, 2, 5].includes(Number((e.km / 10 ** Math.floor(Math.log10(e.km))).toFixed(6))), `${w} km : ${e.km}`);
  }
});

test('cadrage : centré sur la ville, ses voisines « À proximité » dans le cadre avec une marge, jamais moins de MIN_KM', () => {
  for (const photos of [LISBONNE(), OSLO(), QUITO()]) {
    const me = photos[0];
    const m = photoMap(me, photos, 'fr');
    const [x, y] = project(me.city_lat, me.city_lon);
    const v = m.view, km = v.w * kmPerUnit(me.city_lat);
    assert.ok(Math.abs(v.x + v.w / 2 - x) < 0.01 && Math.abs(v.y + v.h / 2 - y) < 0.01, `${me.city_name} : centré`);
    assert.ok(Math.abs(v.h / v.w - ASPECT) < 0.01, 'au format du cadre (100 / 62)');
    assert.ok(km >= MIN_KM - 0.5, `${me.city_name} : ${km} km`);
    assert.ok(km <= MAX_KM + 0.5, `${me.city_name} : ${km} km`);
    // Les villes de la liste « À proximité » qui ont leur pastille sont dans le cadre, à un sixième au moins du bord.
    for (const it of m.list.filter(l => !l.same && m.others.some(o => o.cityId === l.photo.city_id))) {
      const [px, py] = project(it.photo.city_lat, it.photo.city_lon);
      assert.ok(px >= v.x + v.w / 6 - 0.01 && px <= v.x + v.w * 5 / 6 + 0.01 && py >= v.y + v.h / 6 - 0.01 && py <= v.y + v.h * 5 / 6 + 0.01, it.city);
    }
  }
  // Une ville seule : le cadre minimal, 60 km de large, et la barre de 10 km.
  const q = photoMap(QUITO()[0], QUITO(), 'fr');
  assert.ok(Math.abs(q.view.w * kmPerUnit(-0.23) - MIN_KM) < 0.5);
  assert.equal(q.scale.label, '10\u00a0km');
  // Lisbonne : Sintra, Cascais et Setúbal dans le cadre (Setúbal, à 32 km, en est la plus écartée) ; Almada, à 6 km, serait
  // sous la vignette de la ville : listée, sans pastille. Évora, sixième
  // de la liste à 110 km, l'élargirait au-delà de MAX_KM (la ville se perdrait) : listée, avec sa distance, sans pastille.
  // Porto, au-delà de 250 km : ni dans la liste ni sur la carte.
  const photos = LISBONNE();
  const m = photoMap(photos[0], photos, 'fr');
  assert.deepEqual(m.list.map(l => [l.city, l.km]), [['Lisbonne', 0], ['Almada', 6], ['Sintra', 21], ['Cascais', 24], ['Setúbal', 32], ['Évora', 110]]);
  assert.deepEqual(m.others.map(o => o.city), ['Sintra', 'Cascais', 'Setúbal']);
  assert.ok(!m.others.some(o => o.city === 'Porto') && m.others.every(o => o.km <= NEAR_KM));
  const kmL = m.view.w * kmPerUnit(38.73);
  assert.ok(kmL > 100 && kmL < 130, `${kmL} km`);
  assert.deepEqual(photoMap(photos[0], photos.filter(p => p.city_name !== 'Évora'), 'fr').view, m.view);
  // Sans les voisines proches, Évora entre dans le cadre (330 km au plus large).
  const evora = photoMap(photos[0], photos.filter(p => ['Lisbon', 'Évora'].includes(p.city_name)), 'fr');
  assert.deepEqual(evora.others.map(o => o.city), []);
  assert.ok(Math.abs(evora.view.w * kmPerUnit(38.73) - MIN_KM) < 0.5, 'Évora seule : au-delà de MAX_KM, cadre minimal');
  const setubal = photoMap(photos[0], photos.filter(p => ['Lisbon', 'Setúbal'].includes(p.city_name)), 'fr');
  assert.deepEqual(setubal.others.map(o => o.city), ['Setúbal']);
  // Une ville proche hors de la liste et hors du cadre n'a pas de pastille (lien caché, atteint au clavier).
  const loin = photoMap(photos[0], photos, 'fr', { list: 2 });
  assert.ok(loin.others.every(o => o.x > loin.view.x && o.x < loin.view.x + loin.view.w && o.y > loin.view.y && o.y < loin.view.y + loin.view.h));
  assert.ok(!loin.others.some(o => o.city === 'Évora'));
});

test('barre juste à Lisbonne, à Oslo et à l’équateur : sa longueur, reportée le long du parallèle, est celle écrite', () => {
  for (const photos of [LISBONNE(), OSLO(), QUITO()]) {
    const me = photos[0];
    const m = photoMap(me, photos, 'fr');
    // Mesure indépendante : la longueur de la barre en degrés de longitude à la latitude de la ville, projetée.
    const dLon = (m.scale.km / (R * Math.cos((me.city_lat * Math.PI) / 180))) * (180 / Math.PI);
    const dx = project(me.city_lat, me.city_lon + dLon * 50)[0] - project(me.city_lat, me.city_lon)[0];
    const part = dx / 50 / m.view.w;
    assert.ok(Math.abs(part - m.scale.part) / m.scale.part < 0.01, `${me.city_name} : ${part} ≠ ${m.scale.part}`);
  }
  // Même largeur de cadre en kilomètres, latitudes différentes : la barre a la même part du cadre, en unités différentes.
  const [o, q] = [photoMap(OSLO()[0], OSLO().slice(0, 1), 'fr'), photoMap(QUITO()[0], QUITO(), 'fr')];
  assert.ok(Math.abs(o.scale.part - q.scale.part) < 0.01);
  assert.ok(o.view.w > q.view.w * 1.5, 'à Oslo, 60 km font plus d’unités qu’à l’équateur');
});

test('noms placés sans chevauchement de 288 à 400 px, dans le cadre ; une voisine sans place garde sa pastille', async () => {
  const dense = () => ['Lisbonne', 'Almada', 'Barreiro', 'Seixal', 'Amadora', 'Odivelas', 'Loures', 'Oeiras', 'Moita', 'Montijo', 'Queluz', 'Sacavém'].map(q => at(q, 'PT'));
  for (const photos of [LISBONNE(), OSLO(), QUITO(), dense(), [at('Oslo', 'NO'), at('Drammen'), at('Moss', 'NO'), at('Lillestrøm')]]) {
    const m = photoMap(photos[0], photos, 'fr');
    const pose = placer(m.view, m.me, m.others, m.scale);
    assert.deepEqual(pose.others, m.others.map(o => o.label));
    assert.deepEqual(LARGEURS, [288, 344, 400]);
    for (const { W, H, boxes } of pose.boites) {
      const textes = boxes.filter(b => b.quoi !== 'pastille' && b.quoi !== 'ici');
      for (const t of textes) {
        assert.ok(t.b[0] >= 2 && t.b[1] >= 2 && t.b[2] <= W - 2 && t.b[3] <= H - 2, `${photos[0].city_name}, ${W} px : ${t.quoi} hors du cadre`);
        for (const o of boxes) if (o !== t) {
          // Seul le nom de la ville, faute de place, peut passer sur une pastille (il est dessiné après, avec son liseré).
          if (photos.length > 10 && t.quoi === 'ville' && o.quoi === 'pastille') continue;
          const over = t.b[0] < o.b[2] && o.b[0] < t.b[2] && t.b[1] < o.b[3] && o.b[1] < t.b[3];
          assert.ok(!over, `${photos[0].city_name}, ${W} px : ${t.quoi} sur ${o.quoi}`);
        }
      }
    }
  }
  // Onze voisines serrées autour de Lisbonne : certaines n'ont pas la place de leur nom, toutes gardent leur pastille (et
  // leur nom lu) ; celui de Lisbonne est toujours écrit.
  const serre = dense();
  const m = photoMap(serre[0], serre, 'fr');
  assert.equal(m.others.length, 11);
  // Aucune pastille sous la vignette de la ville (20 px du centre au moins, cadre de 288 px).
  for (const o of m.others) assert.ok(Math.hypot(((o.x - m.me.x) / m.view.w) * 288, ((o.y - m.me.y) / m.view.h) * 288 * ASPECT) >= 20, o.city);
  assert.ok(m.others.some(o => o.label === null) && m.others.some(o => o.label !== null));
  assert.ok(m.me.label.pos);
});

test('données personnelles : rien de plus précis que le centre de la ville (0,01°) ; seul le lieu de la ville compte', () => {
  const photos = LISBONNE();
  const base = photoMap(photos[0], photos, 'fr');
  // Tout ce qui n'est pas la ville (titre, lieu écrit, légende, champs inventés comme un GPS) ne change rien.
  const autres = photos.map(p => ({ ...p, title: 'Autre', place: 'Miradouro da Graça, banc 3', legend: 'x', gps_lat: 38.71687, gps_lon: -9.13074, lat: 38.7, lon: -9.1 }));
  const m = photoMap(autres[0], autres, 'fr');
  const sans = x => JSON.stringify({ ...x, others: x.others.map(o => ({ ...o, photos: o.photos.map(p => p.id) })), list: x.list.map(l => [l.city, l.km]) });
  assert.equal(sans(m), sans(base));
  // Le centre du cadre et chaque pastille sont la projection d'un centre de ville, lui-même arrondi à 0,01°.
  for (const p of photos) for (const v of [p.city_lat, p.city_lon]) assert.equal(Math.round(v * 100) / 100, v);
  const [x, y] = project(photos[0].city_lat, photos[0].city_lon);
  assert.deepEqual([base.me.x, base.me.y], [x, y]);
  for (const o of base.others) {
    const c = photos.find(p => p.city_id === o.cityId);
    assert.deepEqual([o.x, o.y], project(c.city_lat, c.city_lon));
  }
  // Une autre photo de la même ville, prise ailleurs dans la ville : la même carte, au pixel près.
  const voisine = photoMap(photos[1], photos, 'fr');
  assert.deepEqual([voisine.view, voisine.me.x, voisine.me.y, voisine.scale], [base.view, base.me.x, base.me.y, base.scale]);
  // Le cadre le plus serré (60 km) reste cinquante fois plus large que l'arrondi de la position (0,01°, 1,1 km au plus) :
  // la barre ne descend jamais sous le kilomètre.
  const arrondi = R * (0.01 * Math.PI) / 180;
  assert.ok(MIN_KM >= 50 * arrondi, `${MIN_KM} km`);
  for (const p of [...QUITO(), ...OSLO()]) assert.ok(photoMap(p, [p], 'fr').scale.km >= 1);
});

// ---------- pages ----------

async function site(t) {
  const ctx = await setup(t, { seeded: true });
  const ids = ctx.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY position").pluck().all();
  ['Lisbonne', 'Lisbonne', 'Almada', 'Sintra', 'Cascais', 'Setúbal', 'Oslo', 'Drammen', 'Quito'].forEach((q, i) => {
    const c = city(q, { Oslo: 'NO', Quito: 'EC' }[q]);
    ctx.db.prepare('UPDATE photos SET on_map = 1, city_id = ?, city_name = ?, city_cc = ?, city_lat = ?, city_lon = ? WHERE id = ?').run(c.id, c.name, c.cc, c.lat, c.lon, ids[i]);
  });
  const slug = i => ctx.db.prepare('SELECT slug FROM photos WHERE id = ?').pluck().get(ids[i]);
  const store = createSessionStore(ctx.db);
  const admin = () => {
    ctx.app.accounts.ensure({ sub: 'test:mc', name: 'mc', roles: ['admin'] });
    const token = store.create({ sub: 'test:mc', name: 'mc', roles: ['admin'] });
    const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    return {
      get: url => ctx.app.inject({ method: 'GET', url, cookies: { session: token }, headers: { accept: 'text/html' } }),
      post: (url, payload) => ctx.app.inject({ method: 'POST', url, cookies: { session: token }, headers: { accept: 'text/html' }, payload: { _csrf: csrf, ...payload } }),
    };
  };
  return { ...ctx, ids, slug, admin };
}
const carte = html => /<figure class="vis-carte"[\s\S]*?<\/figure>/.exec(html)?.[0];

test('v2 et v3 : la page porte le cadre, la barre et les noms dès le HTML du serveur (rendu sans script)', async t => {
  const c = await site(t);
  for (const version of ['v2', 'v3']) {
    c.app.publicVersion.save(version);
    for (const [i, lat] of [[0, 38.73], [6, 59.91], [8, -0.23]]) {
      const html = (await c.app.inject(`/photo/${c.slug(i)}`)).body;
      const fig = carte(html);
      assert.ok(fig, `${version}, photo ${i} : mini-carte`);
      const [vx, , vw] = /viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/.exec(fig).slice(1).map(Number);
      assert.ok(vw * kmPerUnit(lat) >= MIN_KM - 1);
      assert.ok(vx > 0);
      // La barre : sa longueur en pourcentage du cadre, sa longueur écrite, et son nom lu.
      const bar = /<g class="vis-carte-echelle" role="img" aria-label="Échelle\u202f: (\d+)\u00a0km" transform="translate\((-?12) -14\)"><svg x="([\d.]+)%" y="100%" width="([\d.]+)%" overflow="visible">[\s\S]*?<text [^>]*>(\d+)\u00a0km<\/text>/.exec(fig);
      assert.ok(bar, `${version}, photo ${i} : barre`);
      const [, lu, , , pct, ecrit] = bar;
      assert.equal(lu, ecrit);
      assert.ok(Math.abs(Number(pct) / 100 - Number(ecrit) / (vw * kmPerUnit(lat))) < 0.002, `${pct} %`);
      // Rien de tout cela dans un <template> ni dans un bloc réservé au script.
      assert.doesNotMatch(fig, /<template|js-seul/);
    }
    // La ville et ses voisines, nommées ; la cible du doigt n'est pas peinte.
    const lis = carte((await c.app.inject(`/photo/${c.slug(0)}`)).body);
    assert.match(lis, /<svg class="vis-carte-ici"[^>]*>.*<text x="0" y="(34|-27)" text-anchor="(middle|start|end)">Lisbonne<\/text><\/svg>/);
    for (const name of ['Sintra', 'Cascais', 'Setúbal']) assert.match(lis, new RegExp(`aria-label="${name}\u202f: 1 photo\u00a0· \\d+\u00a0km"><svg [^>]*><circle class="vis-carte-cible" r="12"/><circle r="5"/><text [^>]*>${name}</text>`));
    assert.match(lis, /<figcaption>Prise à Lisbonne\s·\s5 photos à proximité<\/figcaption>/);
    // Allemand : la même barre, écrite dans la langue.
    assert.match(carte((await c.app.inject(`/de/photo/${c.slug(0)}`)).body), /aria-label="Maßstab: 20\u00a0km"/);
  }
  // Le script de la v2 ne touche ni au cadre ni à la barre : il ne remplace que le fond par des tuiles plus fines.
  const js = fs.readFileSync(new URL('../public/js/v2/site.js', import.meta.url), 'utf8');
  const bloc = js.slice(js.indexOf("document.querySelectorAll('[data-zoom-map], [data-trip-map]')"), js.indexOf('// Barre de filtres'));
  assert.ok(bloc.length > 100);
  assert.doesNotMatch(bloc, /setAttribute\('viewBox'|echelle|vis-carte-reperes/);
  // CSS : aucun style en ligne ; la longueur de la barre est un attribut SVG, pas un style.
  assert.doesNotMatch(carte((await c.app.inject(`/photo/${c.slug(0)}`)).body), /style=/);
});

test('un compte en v1 voit la v1 : sa carte, à la même échelle que la v2, pendant que les visiteurs voient la v2', async t => {
  const c = await site(t);
  c.app.publicVersion.save('v2');
  const a = c.admin();
  assert.equal((await a.post('/admin/apparence/apercu-v2', { vue: 'v1', vers: `/photo/${c.slug(0)}` })).statusCode, 303);
  const v1 = (await a.get(`/photo/${c.slug(0)}`)).body;
  const visiteur = (await c.app.inject(`/photo/${c.slug(0)}`)).body;
  assert.match(v1, /<main class="viewer"/);
  assert.doesNotMatch(v1, /vis-carte/);
  assert.match(visiteur, /class="vis-carte"/);
  assert.doesNotMatch(visiteur, /class="vmap"/);
  // Même cadre (viewBox) et même barre dans les deux versions.
  const vbV1 = /<figure class="vmap" data-zoom-map>\s*<svg viewBox="([\d. ]+)"/.exec(v1)[1];
  assert.equal(vbV1, /<svg viewBox="([\d. ]+)" preserveAspectRatio/.exec(carte(visiteur))[1]);
  const g = /<g class="vmap-echelle" role="img" aria-label="Échelle : 20\u00a0km"><path d="M([\d.]+) ([\d.]+)h([\d.]+)M/.exec(v1);
  assert.ok(g, 'barre de la v1');
  const [x0, y0, len] = g.slice(1).map(Number);
  const [vx, vy, vw, vh] = vbV1.split(' ').map(Number);
  assert.ok(x0 > vx && x0 + len < vx + vw && y0 > vy && y0 < vy + vh, 'dans le cadre');
  assert.ok(Math.abs(len * kmPerUnit(38.73) - 20) < 0.05, `${len * kmPerUnit(38.73)} km`);
  // Le texte de la barre de la v1 fait 4,6 unités pour 100 : 13 px au moins dans le cadre de 288 px.
  const fsz = Number(/<g class="vmap-echelle"[\s\S]*?font-size="([\d.]+)"/.exec(v1)[1]);
  assert.ok((fsz / vw) * 288 >= 13, `${(fsz / vw) * 288} px`);
});
