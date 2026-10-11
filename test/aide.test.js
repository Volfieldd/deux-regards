import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { anchor, loadHelp } from '../server/help.js';

const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
const ids = html => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const hrefs = html => [...html.matchAll(/href="#([^"]+)"/g)].map(m => decodeURIComponent(m[1]));

async function admin(t) {
  const c = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const res = await c.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  const cookies = cookiesOf(res);
  return { ...c, as: url => c.app.inject({ url, cookies }) };
}

test('ancres compatibles avec le wiki GitHub', () => {
  assert.equal(anchor('Changer l’ordre'), 'changer-lordre');
  assert.equal(anchor('Mise à jour des images'), 'mise-à-jour-des-images');
  assert.equal(anchor('La fiche d\'une photo'), 'la-fiche-dune-photo');
});

test('aide : réservée à l’admin, toutes les sections, aucun lien interne cassé', async t => {
  const c = await admin(t);
  assert.equal((await c.app.inject('/admin/aide')).statusCode, 302);
  const res = await c.as('/admin/aide');
  assert.equal(res.statusCode, 200);
  const help = loadHelp();
  assert.equal(help.sections.length, 13);
  const present = ids(res.body);
  for (const s of help.sections) assert.ok(present.has(s.id), s.id);
  for (const h of hrefs(res.body)) assert.ok(present.has(h), `lien vers #${h} sans cible`);
  assert.doesNotMatch(res.body, /\]\(|\*\*|^#+ /m);                 // Markdown entièrement rendu
  assert.match(res.body, /<table>/);
  assert.match(res.body, /data-help-search/);
});

test('chaque écran de l’admin mène à sa section d’aide', async t => {
  const c = await admin(t);
  const help = ids((await c.as('/admin/aide')).body);
  for (const url of ['/admin', '/admin/photos', '/admin/photos/1', '/admin/series', '/admin/statistiques', '/admin/auteurs', '/admin/images', '/admin/apparence', '/admin/reglages']) {
    const body = (await c.as(url)).body;
    const m = /<p class="help-link"><a href="\/admin\/aide#([^"]+)">Aide sur cette page<\/a><\/p>/.exec(body);
    assert.ok(m, `${url} : lien d’aide absent`);
    assert.ok(help.has(m[1]), `${url} : #${m[1]} absent de l’aide`);
  }
  assert.match((await c.as('/admin')).body, /<a href="\/admin\/aide"><svg[^]*?<\/svg>Aide<\/a>/);
});
