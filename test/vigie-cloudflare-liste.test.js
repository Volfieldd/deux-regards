import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VIGIE_KEYS } from './helpers.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions } from '../vigie/decisions.js';
import { createCfList, entreeDe } from '../vigie/cloudflare-liste.js';

// Phase E3 : liste d'adresses bloquées chez Cloudflare (annexe Cloudflare § 8), avec une API de Cloudflare simulée.
const ACC = 'a'.repeat(32);

function fakeCloudflare() {
  const cf = { lists: [], items: new Map(), ops: new Map(), calls: [], fail: null };
  let n = 0;
  cf.fetch = async (url, init = {}) => {
    const u = new URL(url);
    cf.calls.push(`${init.method || 'GET'} ${u.pathname.replace(`/client/v4/accounts/${ACC}/rules/lists`, '') || '/'}`);
    if (cf.fail) return new Response(JSON.stringify({ success: false, errors: [{ message: cf.fail }] }), { status: 403 });
    const ok = result => new Response(JSON.stringify({ success: true, result }), { status: 200 });
    const p = u.pathname.replace(`/client/v4/accounts/${ACC}/rules/lists`, '');
    if (p === '' && (init.method || 'GET') === 'GET') return ok(cf.lists);
    if (p === '' && init.method === 'POST') { const l = { id: 'l1', ...JSON.parse(init.body) }; cf.lists.push(l); cf.items.set('l1', []); return ok(l); }
    const op = p.match(/^\/bulk_operations\/(.+)$/);
    if (op) return ok({ id: op[1], status: 'completed' });
    const m = p.match(/^\/([^/]+)\/items$/);
    if (m) {
      const list = cf.items.get(m[1]);
      if ((init.method || 'GET') === 'GET') return ok(list);
      const id = `op${++n}`;
      if (init.method === 'POST') for (const it of JSON.parse(init.body)) list.push({ id: `i${++n}`, ...it });
      if (init.method === 'DELETE') { const del = new Set(JSON.parse(init.body).items.map(x => x.id)); cf.items.set(m[1], list.filter(i => !del.has(i.id))); }
      return ok({ operation_id: id });
    }
    return new Response('{}', { status: 404 });
  };
  return cf;
}

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-cfl-'));
  const db = openVigieDb(path.join(dir, 'v.db'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const store = createStore({ db, logKey: 'x'.repeat(40) });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey });
  const tokenFile = path.join(dir, 'jeton');
  fs.writeFileSync(tokenFile, 'jeton-cf');
  const cf = fakeCloudflare();
  const list = createCfList({ store, decisions, accountId: ACC, tokenFile, fetchImpl: cf.fetch, sleep: async () => {} });
  return { store, decisions, cf, list };
}

test('entrées de liste : IPv4 seule ou en réseau, IPv6 ramenée à son /64 au plus fin', () => {
  assert.equal(entreeDe('203.0.113.7/32'), '203.0.113.7');
  assert.equal(entreeDe('203.0.113.7/24'), '203.0.113.0/24');
  assert.equal(entreeDe('2001:db8:1:2::5/128'), '2001:db8:1:2::/64');
  assert.equal(entreeDe('2001:db8::/32'), '2001:db8::/32');
  assert.equal(entreeDe('n’importe quoi'), null);
});

test('liste Cloudflare : créée si absente ; blocages de tout le site de 24 h et plus seulement ; levée retirée ; entrées à la main jamais touchées', async t => {
  const v = setup(t);
  const long = v.decisions.create({ kind: 'bloquer', cible: '203.0.113.7', portee: 'tout', duree: '7j', motif: 'scan', par: 'test' });
  v.decisions.create({ kind: 'bloquer', cible: '198.51.100.0/24', portee: 'tout', duree: '2h', motif: 'court', par: 'test' });
  v.decisions.create({ kind: 'bloquer', cible: '192.0.2.9', portee: 'admin', duree: '7j', motif: 'admin seule', par: 'test' });
  v.decisions.create({ kind: 'bloquer', cible: '2001:db8:1:2::5', portee: 'tout', duree: '24h', motif: 'v6', par: 'test' });
  const r = await v.list.sync();
  assert.equal(r.total, 2);
  assert.deepEqual(v.cf.items.get('l1').map(i => i.ip).sort(), ['2001:db8:1:2::/64', '203.0.113.7']);
  assert.match(v.cf.items.get('l1')[0].comment, /^Vigie #\d+ jusqu’au /);
  // Une entrée posée à la main reste ; la levée retire celle de la Vigie.
  v.cf.items.get('l1').push({ id: 'manuel', ip: '192.0.2.200', comment: 'ajoutée par Sébastien' });
  v.decisions.lift({ id: long, par: 'test', motif: 'fini' });
  await v.list.sync();
  assert.deepEqual(v.cf.items.get('l1').map(i => i.ip).sort(), ['192.0.2.200', '2001:db8:1:2::/64']);
  // Rien à changer : aucune écriture.
  const writes = v.cf.calls.filter(c => /^(POST|DELETE)/.test(c)).length;
  await v.list.sync();
  assert.equal(v.cf.calls.filter(c => /^(POST|DELETE)/.test(c)).length, writes);
  assert.equal(v.store.setting.get('cf_liste').ok, true);
});

test('liste Cloudflare : droit manquant → erreur gardée pour la santé et signalée une fois par heure', async t => {
  const v = setup(t);
  v.cf.fail = 'Authentication error';
  await v.list.sync();
  await v.list.sync();
  const etat = v.store.setting.get('cf_liste');
  assert.equal(etat.ok, false);
  assert.match(etat.erreur, /403 : Authentication error/);
  assert.equal(v.store.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_bordure_erreur'").pluck().get(), 1);
});
