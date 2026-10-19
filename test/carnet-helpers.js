import crypto from 'node:crypto';
import { createSessionStore } from '../server/sessions.js';

// Aides des tests des Carnets : un compte avec ses rôles (et son photographe), une session, ses requêtes ; un billet écrit
// et publié par l'API du module (comme l'éditeur).
export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

export function as(ctx, { sub, name = sub, roles, author = null, adjust = null }) {
  ctx.app.accounts.ensure({ sub, name, roles });
  const acc = ctx.app.accounts.bySub(sub);
  if (author) ctx.app.accounts.update(acc.id, { authorId: ctx.db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(author) }, 'test');
  if (adjust) ctx.db.prepare('UPDATE accounts SET adjust = ? WHERE sub = ?').run(JSON.stringify(adjust), sub);
  const token = createSessionStore(ctx.db).create({ sub, name, roles: [] });
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
  const cookies = { session: token };
  let n = 0;
  const ip = () => `192.0.2.${(++n % 250) + 1}`;
  return {
    sub, csrf, cookies,
    get: (url, headers = {}) => ctx.app.inject({ url, cookies, remoteAddress: ip(), headers: { accept: 'text/html', 'user-agent': UA, ...headers } }),
    post: (url, payload = {}, headers = {}) => ctx.app.inject({ method: 'POST', url, cookies, remoteAddress: ip(), headers: { accept: 'text/html', 'user-agent': UA, ...headers }, payload: { _csrf: csrf, ...payload } }),
    json: (url, payload = {}) => ctx.app.inject({ method: 'POST', url, cookies, remoteAddress: ip(), headers: { accept: 'application/json', 'x-csrf-token': csrf, 'user-agent': UA }, payload }),
  };
}

// Un visiteur (sans session) : une adresse par requête, un vrai navigateur (jamais redirigé par la langue).
export function visitor(ctx) {
  let n = 0;
  return url => ctx.app.inject({ url, remoteAddress: `198.51.100.${(++n % 250) + 1}`, headers: { accept: 'text/html', 'user-agent': UA } });
}

export const photoId = (db, slug) => db.prepare('SELECT id FROM photos WHERE slug = ?').pluck().get(slug);
export const authorId = (db, slug) => db.prepare('SELECT id FROM authors WHERE slug = ?').pluck().get(slug);

// Un billet publié (ou laissé dans l'état voulu) : textes en base (photo:<id>), textes de remplacement écrits.
export async function billet(ctx, { title = 'Brume et lumière', rubrique = 'voyages', authors = ['sebastien'], dek = 'Un chapô qui dit l’essentiel.', body = 'Un texte.', publish = true, extra = {}, at = null } = {}) {
  const { app, db } = ctx;
  db.prepare("UPDATE photos SET alt_text = 'Une photo de démonstration.' WHERE alt_text = ''").run();
  const by = { sub: 'test', name: 'Test' };
  const id = app.carnet.create({ title, rubrique, authors: authors.map(a => authorId(db, a)), by });
  const ids = text => text.replace(/photo:([a-z0-9-]+)/g, (m, s) => (/^\d+$/.test(s) ? m : `photo:${photoId(db, s) ?? s}`));
  const more = Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, /^body/.test(k) ? ids(v) : v]));
  app.carnet.update(id, { title, dek, body: ids(body), ...more }, by);
  if (publish) await app.carnet.publish(id, by);
  if (at) db.prepare('UPDATE posts SET published_at = ? WHERE id = ?').run(at, id);
  return app.carnet.get(id);
}

export const setV2 = ctx => ctx.app.publicVersion.save('v2');
