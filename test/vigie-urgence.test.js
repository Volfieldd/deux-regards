import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createUrgence } from '../vigie/cloudflare-urgence.js';
import { setup } from './console-env.js';

// Mode urgence de Cloudflare (« I'm Under Attack », phase E) : API de Cloudflare simulée.
const ZONE = 'b'.repeat(32);
function fakeCf(start = 'medium') {
  const cf = { level: start, patches: [], fail: false };
  cf.fetch = async (url, init = {}) => {
    assert.match(url, new RegExp(`/zones/${ZONE}/settings/security_level$`));
    if (cf.fail) return new Response(JSON.stringify({ success: false, errors: [{ message: 'Authentication error' }] }), { status: 403 });
    if (init.method === 'PATCH') { cf.level = JSON.parse(init.body).value; cf.patches.push(cf.level); }
    return new Response(JSON.stringify({ success: true, result: { id: 'security_level', value: cf.level } }), { status: 200 });
  };
  return cf;
}
function urgenceOf(t, cf, clock) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-urg-'));
  const db = openVigieDb(path.join(dir, 'v.db'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const tokenFile = path.join(dir, 'jeton'); fs.writeFileSync(tokenFile, 'x');
  const store = createStore({ db, logKey: 'x'.repeat(40), now: () => clock.t });
  return { store, u: createUrgence({ store, zoneId: ZONE, tokenFile, fetchImpl: cf.fetch, now: () => clock.t }) };
}

test('mode urgence : motif et durée exigés ; activé puis remis au niveau d’avant à l’échéance ; prolongé sans perdre ce niveau ; événements', async t => {
  const clock = { t: Date.parse('2026-10-19T10:00:00Z') };
  const cf = fakeCf('high');
  const { store, u } = urgenceOf(t, cf, clock);
  await assert.rejects(u.activer({ duree: '2h', par: 'test' }), /motif obligatoire/);
  await assert.rejects(u.activer({ motif: 'x', par: 'test' }), /durée/);
  await u.activer({ duree: '2h', par: 'console · Sébastien (sub-seb)', motif: 'attaque massive' });
  assert.equal(cf.level, 'under_attack');
  clock.t += 3600e3;
  await u.activer({ duree: '2h', par: 'test', motif: 'encore' });
  assert.equal(u.etat().avant, 'high', 'niveau d’avant d’origine gardé');
  await u.tick();
  assert.equal(cf.level, 'under_attack');
  clock.t += 2 * 3600e3 + 1;
  await u.tick();
  assert.equal(cf.level, 'high', 'remis à l’échéance');
  assert.equal(u.etat().actif, false);
  const actions = store.db.prepare("SELECT detail FROM events WHERE type = 'vigie_urgence' ORDER BY seq").pluck().all().map(d => JSON.parse(d).action);
  assert.deepEqual(actions, ['activé', 'prolongé', 'échu']);
  // Durée plafonnée (24 h par défaut).
  await u.activer({ duree: '7j', par: 'test', motif: 'long' });
  assert.equal(u.etat().jusqua - clock.t, 24 * 3600e3);
});

test('mode urgence : niveau changé à la main chez Cloudflare → fin notée sans rien écraser ; erreur de Cloudflare remontée', async t => {
  const clock = { t: Date.now() };
  const cf = fakeCf('medium');
  const { u } = urgenceOf(t, cf, clock);
  await u.activer({ duree: '2h', par: 'test', motif: 'essai' });
  cf.level = 'high';                                     // changé à la main
  await u.tick();
  assert.equal(u.etat().actif, false);
  assert.equal(u.etat().fin_raison, 'changé chez Cloudflare');
  assert.equal(cf.level, 'high');
  cf.fail = true;
  await assert.rejects(u.activer({ duree: '1h', par: 'test', motif: 'x' }), /403 : Authentication error/);
});

test('console : mode urgence pour un Analyste avec ré-authentification, alerte haute qui prévient les Administrateurs', async t => {
  const cf = fakeCf('medium');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-urg-c-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tokenFile = path.join(dir, 'jeton'); fs.writeFileSync(tokenFile, 'x');
  // Relais vers le module, créé une fois la base de la console ouverte.
  let u = null;
  const relais = { maxMs: 24 * 3600e3, etat: () => u.etat(), activer: o => u.activer(o), desactiver: o => u.desactiver(o) };
  const v = setup(t, { extra: { urgence: relais } });
  u = createUrgence({ store: v.store, zoneId: ZONE, tokenFile, fetchImpl: cf.fetch, now: () => v.clock.t });
  const { cookie } = await v.login();
  const s = v.sessionOf(cookie);
  const post = body => v.app.inject({ method: 'POST', url: '/urgence', headers: { ...v.h(), 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' }, cookies: { '__Host-vigie': cookie }, payload: new URLSearchParams({ _csrf: s.csrf, ...body }).toString() });
  const page = (await v.app.inject({ url: '/reglages', headers: v.h(), cookies: { '__Host-vigie': cookie } })).body;
  assert.match(page, /Mode urgence de Cloudflare/);
  assert.equal((await post({ etat: 'marche', duree: '2h', motif: 'attaque' })).statusCode, 303);
  assert.equal(cf.level, 'under_attack');
  assert.equal(v.alerts().find(a => a.regle === 'sigma.mode_urgence')?.gravite, 'haut');
  await post({ etat: 'arret' });
  assert.equal(cf.level, 'medium');
});

test('urgence : auteur, motif et raison de fin sont masqués pour la Lectrice, échappés et bornés pour tous', async t => {
  let actif = true;
  let texte = '198.51.100.42 ; 2001:db8:abcd:12::42 <img src=x onerror=alert(1)>';
  const v = setup(t, { roles: 'zitadel', adminSubs: [], extra: { urgence: {
    maxMs: 864e5, etat: () => ({ actif, depuis: v.clock.t, jusqua: v.clock.t + 3600e3, par: `console · ${texte}`, motif: texte,
      fin: v.clock.t, fin_raison: texte }),
  } } });
  for (const role of ['viewer', 'handler', 'analyst', 'admin']) {
    v.ceilings[`sub-${role}`] = role;
    const { cookie, headers } = await v.login({ sub: `sub-${role}`, roles: [`vigie.${role}`] });
    for (const etat of [true, false]) {
      actif = etat;
      const r = await v.app.inject({ url: '/reglages', headers, cookies: { '__Host-vigie': cookie } });
      assert.equal(r.statusCode, 200);
      assert.equal(r.headers['cache-control'], 'no-store');
      assert.equal(r.headers['referrer-policy'], 'no-referrer');
      assert.doesNotMatch(r.body, /<img src=x|onerror="|style=/);
      assert.match(r.body, /&lt;img/);
      if (role === 'viewer') {
        assert.doesNotMatch(r.body, /198\.51\.100\.42|2001:db8:abcd:12::42/);
        assert.match(r.body, /198\.51\.100\.0\/24/);
        assert.match(r.body, /2001:db8:abcd::\/48/);
        assert.doesNotMatch(r.body, /action="\/urgence"/);
      } else assert.match(r.body, /198\.51\.100\.42/);
    }
  }
  texte = 'x'.repeat(301) + 'fin-trop-longue';
  const { cookie, headers } = await v.login({ sub: 'sub-admin', roles: ['vigie.admin'] });
  const r = await v.app.inject({ url: '/reglages', headers, cookies: { '__Host-vigie': cookie } });
  assert.match(r.body, new RegExp('x{300}'));
  assert.doesNotMatch(r.body, /x{301}|fin-trop-longue/);
});
