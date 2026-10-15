import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';
import { RELEASES, CURRENT, compare } from '../server/releases.js';

// Nouveautés de l'admin : le fichier (trois langues, versions en ordre, la version installée est la dernière), la
// fenêtre montrée une seule fois avec tout ce qui est arrivé depuis la dernière visite, la page et le menu.
test('fichier des nouveautés : trois langues partout, versions uniques et ordonnées, version installée = la plus récente', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(CURRENT, pkg.version);
  assert.equal(RELEASES[0].version, CURRENT);
  assert.equal(new Set(RELEASES.map(r => r.version)).size, RELEASES.length);
  for (const r of RELEASES) {
    assert.match(r.version, /^1\.\d+\.0$/);
    assert.equal(r.version, `1.${r.pr}.0`);                                             // version = 1.<PR>.0
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    for (const l of ['fr', 'en', 'de']) {
      assert.ok(r.title[l], `${r.version} titre ${l}`);
      for (const i of r.items) assert.ok(i[l], `${r.version} ${l}`);
    }
  }
  assert.ok(RELEASES.at(-1).version === '1.79.0');                                     // point de départ : PR 79
  assert.ok(compare('1.80.0', '1.79.0') > 0 && compare('1.79.0', '1.79.0') === 0 && compare('1.9.0', '1.10.0') < 0);
});

test('fenêtre : une seule fois, tout depuis la dernière visite, dans la langue, selon les droits ; page et menu', async t => {
  const ctx = await setup(t, { seeded: true });
  const as = (sub, roles) => {
    ctx.app.accounts.ensure({ sub, name: sub, roles });
    const token = createSessionStore(ctx.db).create({ sub, name: sub, roles: [] });
    return (url, cookies = {}) => ctx.app.inject({ url, cookies: { session: token, ...cookies }, headers: { accept: 'text/html' } }).then(r => r.body);
  };
  const admin = as('root', ['admin']);
  const first = await admin('/admin');
  assert.match(first, /<dialog class="release-pop" open data-release-pop/);
  assert.match(first, new RegExp(`Nouveau depuis votre dernière visite : ${RELEASES.length} versions`));
  assert.match(first, /1\.79\.0<\/span> Des villes mieux nommées/);
  assert.equal(ctx.app.accounts.bySub('root').seen_release, CURRENT);
  assert.doesNotMatch(await admin('/admin'), /data-release-pop/);                     // une seule fois
  // Depuis une version déjà vue : seulement les suivantes.
  ctx.db.prepare("UPDATE accounts SET seen_release = '1.81.0' WHERE sub = 'root'").run();
  const since = await admin('/admin', { admin_langue: 'en' });
  assert.match(since, /New since your last visit: 2 versions/);
  assert.match(since, /1\.82\.0<\/span> Trips on the site/);
  assert.doesNotMatch(since, /1\.81\.0<\/span>/);
  // Selon les droits : le relecteur ne voit pas les nouveautés des sorties.
  const rel = await as('rita', ['relecteur'])('/admin');
  assert.match(rel, /data-release-pop/);
  assert.doesNotMatch(rel, /Regroupez des sorties en voyages/);
  assert.match(rel, /Un champ Mots-clés sur la fiche/);
  // Page et menu : la version installée.
  const page = await admin('/admin/nouveautes');
  assert.match(page, new RegExp(`Version installée : ${CURRENT.replace(/\./g, '\\.')}`));
  assert.match(page, /href="\/admin\/nouveautes" aria-current="page">[\s\S]*class="nav-ver mono">1\.83\.0</);
  assert.ok(page.indexOf('1.83.0</span> Les nouveautés') < page.indexOf('1.79.0</span> Des villes'));
});
