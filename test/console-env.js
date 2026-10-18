// Environnement de test de la console de la Vigie : base dans un dossier temporaire, faux Cloudflare Access (clés RSA
// de test), faux Zitadel (connexion et plafond), connexion simulée. Partagé par les tests test/vigie-console*.test.js.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VIGIE_KEYS } from './helpers.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions } from '../vigie/decisions.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createEngine } from '../vigie/moteur.js';
import { createConsole } from '../vigie/console/server.js';

export const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
export const TEAM = 'nicephos-essai';
export const AUD = 'a1'.repeat(32);
export const ISS = `https://${TEAM}.cloudflareaccess.com`;
export const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
export const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
export const CERTS = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] };
export const START = Date.parse('2026-10-20T10:00:00Z');

export const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
export function accessJwt(clock, { email = 'seb@exemple.org', aud = AUD, iss = ISS, exp, kid = 'k1', key = privateKey, alg = 'RS256', nbf } = {}) {
  const iat = Math.floor(clock.t / 1000);
  const unsigned = `${b64({ alg, kid, typ: 'JWT' })}.${b64({ iss, aud: [aud], email, sub: `cf-${email}`, iat, nbf, exp: exp ?? iat + 3600 })}`;
  return `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')}`;
}

export function setup(t, { roles = 'deux-cles', adminSubs = ['sub-seb'], extra = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-console-'));
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  const clock = { t: START };
  const now = () => clock.t;
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now });
  store.onAdded(rows => engine.process(rows));
  let certFetches = 0;
  const fetchImpl = async () => { certFetches += 1; return new Response(JSON.stringify(CERTS), { status: 200 }); };
  let n = 0;
  const oidc = {
    origin: 'https://idp.example',
    claims: null,
    starts: [],
    async start({ reauth }) { n += 1; this.starts.push({ reauth }); return { url: `https://idp.example/authorize?n=${n}&reauth=${reauth}`, tx: { state: `etat-${n}-${'x'.repeat(30)}`, verifier: 'v', nonce: 'n' } }; },
    async finish() { if (this.claims instanceof Error) throw this.claims; return this.claims; },
    async logoutUrl() { return 'https://idp.example/logout'; },
  };
  const ceilings = { 'sub-seb': 'admin' };
  const zitadel = { fail: false, calls: 0 };
  const readCeiling = async sub => { zitadel.calls += 1; if (zitadel.fail) throw new Error('Zitadel : réponse 503'); return ceilings[sub] ?? null; };
  const config = { url: 'https://vigie.example', access: { team: TEAM, aud: AUD }, adminSubs, roles, projectId: '100', orgId: '200' };
  const c = createConsole({ config, store, engine, switches, decisions, zitadel: null, logger: false, fetchImpl, now, oidc, readCeiling, ...extra });
  t.after(async () => { await c.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const events = type => db.prepare('SELECT * FROM events WHERE type = ? ORDER BY seq').all(type).map(r => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
  const alerts = () => db.prepare('SELECT * FROM alerts ORDER BY id').all();
  const h = (opts = {}) => ({ 'cf-access-jwt-assertion': accessJwt(clock, opts), 'cf-connecting-ip': '198.51.100.7' });
  async function login({ sub = 'sub-seb', nom = 'Sébastien', amr = ['user', 'mfa'], roles: r = ['vigie.admin'], email, retour = '/' } = {}) {
    oidc.claims = { sub, nom, amr, authTime: clock.t, roles: r };
    const headers = h({ email });
    const r1 = await c.app.inject({ url: `/auth/login?retour=${encodeURIComponent(retour)}`, headers });
    const state = r1.cookies.find(x => x.name === '__Host-vigie-tx')?.value;
    const r2 = await c.app.inject({ url: `/auth/callback?code=code&state=${state}`, headers, cookies: { '__Host-vigie-tx': state } });
    const cookie = r2.cookies.find(x => x.name === '__Host-vigie')?.value;
    return { r1, r2, cookie, headers, state };
  }
  const sessionOf = cookie => db.prepare('SELECT * FROM console_sessions WHERE id = ?').get(crypto.createHash('sha256').update(cookie).digest('hex'));
  return { db, store, engine, switches, decisions, clock, c, app: c.app, oidc, ceilings, zitadel, events, alerts, h, login, sessionOf, certFetches: () => certFetches };
}
