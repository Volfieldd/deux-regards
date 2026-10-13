import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

// Likes et commentaires des posts publiés depuis le site : relevé quotidien (liste des posts du compte, par pages),
// historique par jour, affichage dans la fiche et sur la page Instagram.
const TOKEN = 'jeton-de-test-0123456789';
const LONG = 'IGQVJlongtoken0123456789abcdef';
const ENV = { INSTAGRAM_APP_ID: '123456', INSTAGRAM_APP_SECRET: 'app-secret-0123456789', LOCAL_AUTH_TOKEN: TOKEN };
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

function fakeMeta() {
  const calls = [];
  const likes = { m1: 10, m2: 3 };
  let fail = false;
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const fetchImpl = async url => {
    const u = new URL(url);
    calls.push({ path: u.pathname, query: Object.fromEntries(u.searchParams) });
    if (u.pathname === '/oauth/access_token') return json({ access_token: 'short-token', user_id: 1784 });
    if (u.pathname === '/access_token') return json({ access_token: LONG, expires_in: 5184000 });
    if (u.pathname.endsWith('/me')) return json({ user_id: '1784', username: 'nicephos' });
    if (u.pathname.endsWith('/1784/media')) {
      if (fail) return json({ error: { message: `Service indisponible access_token=${u.searchParams.get('access_token')}` } }, 500);
      // Deux pages : un post inconnu du site (publié à la main sur Instagram) est ignoré.
      if (!u.searchParams.get('after')) {
        return json({ data: [{ id: 'm1', like_count: likes.m1, comments_count: 2 }, { id: 'x9', like_count: 99, comments_count: 9 }],
          paging: { next: `https://graph.instagram.com/v23.0/1784/media?after=p2&access_token=${LONG}` } });
      }
      return json({ data: [{ id: 'm2', like_count: likes.m2, comments_count: 0 }], paging: {} });
    }
    return json({ error: { message: 'inconnu' } }, 404);
  };
  return { calls, likes, fetchImpl, setFail: v => { fail = v; } };
}

async function igApp(t) {
  const meta = fakeMeta();
  let now = new Date('2026-10-12T03:00:00Z');                                          // 5 h à Paris
  const ctx = await setup(t, { seeded: true, env: ENV, instagramOptions: { manual: true, fetchImpl: meta.fetchImpl, sleep: async () => {}, now: () => now, timeoutMs: 100 } });
  await ctx.app.instagram.connect('code-ok');
  const id = slug => ctx.db.prepare('SELECT id FROM photos WHERE slug = ?').pluck().get(slug);
  const post = (photoId, mediaId) => ctx.db.prepare(`INSERT INTO instagram_posts (photo_id, status, frame, ig_media_id, permalink, created_at, published_at)
    VALUES (?, 'published', 'white', ?, ?, ?, ?)`).run(photoId, mediaId, `https://www.instagram.com/p/${mediaId}/`, Date.parse('2026-10-01'), Date.parse('2026-10-01'));
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = opts => ctx.app.inject({ ...opts, cookies: { ...cookies, ...opts.cookies } });
  return { ...ctx, meta, id, post, as, csrf, setNow: d => { now = d; } };
}

test('relevé quotidien : après 6 h (Paris), une fois par jour, posts du site seulement, toutes les pages', async t => {
  const c = await igApp(t);
  const ig = c.app.instagram;
  assert.deepEqual(await ig.syncEngagement(), { count: 0, skipped: true });            // aucun post du site : aucun appel
  assert.equal(c.meta.calls.filter(x => x.path.endsWith('/media')).length, 0);
  c.post(c.id('brume-sur-la-loire'), 'm1');
  c.post(c.id('quai-7h12'), 'm2');
  assert.equal(await ig.maybeSyncEngagement(), null);                                   // avant 6 h
  c.setNow(new Date('2026-10-12T05:30:00Z'));                                          // 7 h 30
  assert.deepEqual(await ig.maybeSyncEngagement(), { count: 2 });
  const listCalls = c.meta.calls.filter(x => x.path.endsWith('/1784/media'));
  assert.equal(listCalls.length, 2);
  assert.equal(listCalls[0].query.fields, 'id,like_count,comments_count');
  const rows = c.db.prepare('SELECT ig_media_id, day, likes, comments FROM instagram_engagement ORDER BY ig_media_id').all();
  assert.deepEqual(rows.map(r => ({ ...r })), [{ ig_media_id: 'm1', day: '2026-10-12', likes: 10, comments: 2 }, { ig_media_id: 'm2', day: '2026-10-12', likes: 3, comments: 0 }]);
  assert.equal(await ig.maybeSyncEngagement(), null);                                   // déjà fait aujourd'hui
  // Le lendemain : nouveau relevé, l'historique s'allonge.
  c.meta.likes.m1 = 14;
  c.setNow(new Date('2026-10-13T06:00:00Z'));
  await ig.maybeSyncEngagement();
  const e = ig.engagementOf('m1');
  assert.deepEqual([e.likes, e.series.map(d => d.likes)], [14, [10, 14]]);
  assert.deepEqual(ig.mostLiked(5).map(m => m.ig_media_id), ['m1', 'm2']);
  assert.ok(c.db.prepare("SELECT COUNT(*) FROM instagram_calls WHERE kind = 'engagement'").pluck().get() >= 4);   // dans le budget d'appels
});

test('échec : message gardé sans le jeton, nouvel essai une heure plus tard seulement', async t => {
  const c = await igApp(t);
  const ig = c.app.instagram;
  c.post(c.id('brume-sur-la-loire'), 'm1');
  c.meta.setFail(true);
  c.setNow(new Date('2026-10-12T06:00:00Z'));
  assert.equal(await ig.maybeSyncEngagement(), null);
  const st = ig.engagementState();
  assert.match(st.error, /Service indisponible/);
  assert.doesNotMatch(st.error, /IGQV/);
  c.meta.setFail(false);
  c.setNow(new Date('2026-10-12T06:30:00Z'));
  assert.equal(await ig.maybeSyncEngagement(), null);                                   // moins d'une heure après
  c.setNow(new Date('2026-10-12T07:05:00Z'));
  assert.deepEqual(await ig.maybeSyncEngagement(), { count: 1 });
  assert.equal(ig.engagementState().error, '');
});

test('admin : likes dans la fiche (courbe), classement sur la page Instagram, relevé à la demande limité', async t => {
  const c = await igApp(t);
  const brume = c.id('brume-sur-la-loire');
  c.post(brume, 'm1');
  c.post(c.id('quai-7h12'), 'm2');
  assert.match((await c.as({ url: `/admin/photos/${brume}` })).body, /relevés chaque matin/);
  c.setNow(new Date('2026-10-12T06:00:00Z'));
  const r = await c.as({ method: 'POST', url: '/admin/instagram/likes', payload: { _csrf: c.csrf }, headers: { accept: 'text/html' } });
  assert.equal(r.statusCode, 303);
  c.meta.likes.m1 = 12;
  c.setNow(new Date('2026-10-13T06:00:00Z'));
  await c.app.instagram.maybeSyncEngagement();
  const fiche = (await c.as({ url: `/admin/photos/${brume}` })).body;
  assert.match(fiche, /<strong>12<\/strong> likes/);
  assert.match(fiche, /<strong>2<\/strong> commentaires/);
  assert.match(fiche, /class="spark"/);
  const page = (await c.as({ url: '/admin/instagram' })).body;
  assert.match(page, /Les plus aimées sur Instagram/);
  assert.match(page, /Brume sur la Loire<\/a>[\s\S]*?<strong>12<\/strong> likes[\s\S]*?Quai, 7h12<\/a>[\s\S]*?<strong>3<\/strong> likes/);
  assert.match(page, /Relever maintenant/);
  // Nouvelle demande moins de 10 minutes après le dernier relevé : refusée avec explication.
  const again = await c.as({ method: 'POST', url: '/admin/instagram/likes', payload: { _csrf: c.csrf }, headers: { accept: 'text/html' } });
  assert.equal(again.statusCode, 303);
  const flash = await c.as({ url: '/admin/instagram', cookies: cookiesOf(again) });      // message transmis par cookie
  assert.match(flash.body, /moins de 10 minutes/);
});
