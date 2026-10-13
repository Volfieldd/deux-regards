import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { checkBudget, effectiveLimits, normalizeLimits, rateLimitFrom, backoffMs, LIMIT_DEFAULTS } from '../server/instagram-limits.js';

const H = 3600 * 1000;
const NOW = Date.parse('2026-10-13T10:00:00Z');
const headers = h => ({ get: k => h[k.toLowerCase()] ?? null });

// ---------- règles ----------

test('budget : publications sur 24 h glissantes, écart minimal, appels par heure, pause, quota de Meta', () => {
  const prudent = { ...LIMIT_DEFAULTS };
  assert.equal(checkBudget({ limits: prudent, nowMs: NOW }).ok, true);
  // 25 publications sur 24 h : la suivante quand la plus ancienne sort de la fenêtre.
  const day = Array.from({ length: 25 }, (_, i) => NOW - 23 * H + i * 60 * 1000 * 30);
  const full = checkBudget({ limits: { ...prudent, minGapMinutes: 0 }, nowMs: NOW, publishedAt: day });
  assert.equal(full.ok, false);
  assert.equal(full.until, day[0] + 24 * H);
  assert.match(full.reason, /25 publications sur les dernières 24 h \(limite : 25\)/);
  // Écart minimal de 60 min.
  const gap = checkBudget({ limits: prudent, nowMs: NOW, publishedAt: [NOW - 20 * 60 * 1000] });
  assert.equal(gap.ok, false);
  assert.match(gap.reason, /il y a 20 min ; 60 min au moins/);
  assert.equal(gap.until, NOW + 40 * 60 * 1000);
  // Appels : une publication en demande une dizaine, marge gardée sous le plafond.
  const calls = checkBudget({ limits: prudent, nowMs: NOW, callsAt: Array.from({ length: 91 }, (_, i) => NOW - H + 1000 + i) });
  assert.equal(calls.ok, false);
  assert.match(calls.reason, /91 appels à l’API sur la dernière heure \(limite : 100\)/);
  // Pause demandée par Meta.
  const paused = checkBudget({ limits: prudent, nowMs: NOW, pausedUntil: NOW + 2 * H, pauseReason: 'trop d’appels à l’API Instagram' });
  assert.equal(paused.ok, false);
  assert.match(paused.reason, /file en pause jusqu’à \d\d h \d\d/);
  // Quota lu chez Meta épuisé.
  assert.match(checkBudget({ limits: prudent, nowMs: NOW, liveQuota: { usage: 100, total: 100 } }).reason, /Quota d’Instagram atteint \(100 \/ 100/);
});

test('préréglages : Prudent, Limites de Meta (quota lu), Personnalisé ; bornes', () => {
  assert.deepEqual(effectiveLimits({ preset: 'prudent' }), { preset: 'prudent', postsPerDay: 25, minGapMinutes: 60, callsPerHour: 100 });
  assert.equal(effectiveLimits({ preset: 'meta' }).postsPerDay, 100);
  assert.equal(effectiveLimits({ preset: 'meta' }, { total: 50 }).postsPerDay, 50);          // Meta a baissé : on suit
  assert.equal(effectiveLimits({ preset: 'custom', postsPerDay: 80, minGapMinutes: 5, callsPerHour: 300 }, { total: 50 }).postsPerDay, 50);   // jamais au-dessus de Meta
  assert.equal(effectiveLimits({ preset: 'custom', postsPerDay: 8, minGapMinutes: 5, callsPerHour: 300 }).minGapMinutes, 5);
  assert.deepEqual(normalizeLimits({ limits_preset: 'custom', limits_posts: '500', limits_gap: '-3', limits_calls: 'abc' }),
    { preset: 'custom', postsPerDay: 100, minGapMinutes: 0, callsPerHour: 100 });
  assert.equal(normalizeLimits({ limits_preset: 'illimité' }).preset, 'prudent');
});

test('erreurs de limite de Meta : codes reconnus, attente indiquée, paliers', () => {
  assert.equal(rateLimitFrom(400, headers({}), { error: { code: 100, message: 'Invalid parameter' } }), null);
  assert.match(rateLimitFrom(400, headers({}), { error: { code: 9, error_subcode: 2207042 } }).reason, /quota de publications/);
  for (const code of [4, 17, 32, 613]) assert.match(rateLimitFrom(400, headers({}), { error: { code } }).reason, /trop d’appels/);
  assert.equal(rateLimitFrom(429, headers({ 'retry-after': '120' }), {}).retryAfterMs, 120_000);
  const usage = JSON.stringify({ 1784: [{ type: 'instagram', call_count: 100, estimated_time_to_regain_access: 30 }] });
  assert.equal(rateLimitFrom(400, headers({ 'x-business-use-case-usage': usage }), { error: { code: 4 } }).retryAfterMs, 30 * 60 * 1000);
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(backoffMs), [1, 2, 4, 8, 24, 24].map(h => h * H));
});

// ---------- file d'attente, contre un faux service Meta ----------

const HTTPS = { PUBLIC_URL: 'https://nicephos.example', COOKIE_SECRET: 'x'.repeat(40), INSTAGRAM_APP_ID: '123456', INSTAGRAM_APP_SECRET: 'app-secret-0123456789' };

function fakeMeta(getApp) {
  const calls = [];
  const behave = { media: null, publish: null, quota: null, inProgress: 0 };
  const json = (body, status = 200, h = {}) => ({ ok: status < 400, status, headers: headers(h), json: async () => body });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push(u.pathname);
    if (u.pathname === '/oauth/access_token') return json({ access_token: 'short', user_id: 1784 });
    if (u.pathname === '/access_token') return json({ access_token: 'IGQVlong0123456789', expires_in: 5184000 });
    if (u.pathname.endsWith('/me')) return json({ user_id: '1784', username: 'nicephos' });
    if (u.pathname.endsWith('/content_publishing_limit')) return behave.quota ? json(behave.quota) : json({ error: { message: 'inconnu' } }, 404);
    if (u.pathname.endsWith('/1784/media')) {
      if (behave.media) return behave.media();
      await getApp().inject(new URL(Object.fromEntries(new URLSearchParams(init.body.toString())).image_url).pathname);
      return json({ id: 'container-1' });
    }
    if (u.pathname.endsWith('/container-1')) return json({ status_code: behave.inProgress-- > 0 ? 'IN_PROGRESS' : 'FINISHED' });
    if (u.pathname.endsWith('/1784/media_publish')) return behave.publish ? behave.publish() : json({ id: 'media-9' });
    if (u.pathname.endsWith('/media-9')) return json({ permalink: 'https://www.instagram.com/p/abc/' });
    return json({ error: { message: 'inconnu' } }, 404);
  };
  return { calls, behave, json, fetchImpl };
}

async function igApp(t, { clock = '2026-10-13T08:00:00Z', env = {} } = {}) {
  let app;
  const meta = fakeMeta(() => app);
  let now = new Date(clock);
  const sleeps = [];
  const ctx = await setup(t, { seeded: true, env: { ...HTTPS, ...env }, instagramOptions: { manual: true, fetchImpl: meta.fetchImpl, sleep: async ms => { sleeps.push(ms); }, now: () => now, timeoutMs: 100 } });
  app = ctx.app;
  await app.instagram.connect('code');
  const photos = ctx.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY position LIMIT 4").pluck().all();
  const row = id => ctx.db.prepare('SELECT status, attempts, error FROM instagram_posts WHERE id = ?').get(id);
  return { ...ctx, meta, sleeps, photos, row, setNow: d => { now = new Date(d); }, now: () => now };
}

test('« Publier maintenant » hors budget : refusé avec explication, la photo reste en file sans essai compté', async t => {
  const { app, photos, row, setNow } = await igApp(t);
  const a = app.instagram.enqueue(photos[0]);
  const b = app.instagram.enqueue(photos[1]);
  await app.instagram.publish(a);
  setNow('2026-10-13T08:20:00Z');
  await assert.rejects(app.instagram.publish(b), /il y a 20 min ; 60 min au moins entre deux publications : prochaine possible à \d\d h \d\d/);
  assert.deepEqual(row(b), { status: 'queued', attempts: 0, error: null });
  setNow('2026-10-13T09:05:00Z');
  await app.instagram.publish(b);
  assert.equal(row(b).status, 'published');
  assert.equal(app.instagram.usage().posts24h, 2);
});

test('limite d’appels signalée par Meta : pause du temps indiqué, aucun essai consommé, reprise au créneau suivant', async t => {
  const { app, db, meta, photos, row, setNow } = await igApp(t);
  const usage = JSON.stringify({ 1784: [{ estimated_time_to_regain_access: 45 }] });
  meta.behave.media = () => meta.json({ error: { code: 4, message: 'Application request limit reached' } }, 400, { 'x-business-use-case-usage': usage });
  const post = app.instagram.enqueue(photos[0]);
  await assert.rejects(app.instagram.publish(post), /En attente : trop d’appels à l’API Instagram\. File en pause jusqu’à 10 h 45/);   // 08:00 UTC = 10 h Paris
  assert.equal(row(post).status, 'queued');
  assert.equal(row(post).attempts, 0);
  assert.match(row(post).error, /En attente/);
  const u = app.instagram.usage();
  assert.ok(u.paused);
  assert.equal(u.paused.until, Date.parse('2026-10-13T08:45:00Z'));
  // Pendant la pause (jusqu'à 10 h 45), le créneau de 10 h 30 passe sans appeler Meta.
  meta.behave.media = null;
  app.instagram.saveSettings({ ...app.instagram.settings(), times: ['10:30'] });
  db.prepare("UPDATE settings SET value = json_set(value, '$.lastSlot', '2026-10-12 10:30') WHERE key = 'instagram_state'").run();
  const sentBefore = meta.calls.filter(c => c.endsWith('/1784/media')).length;
  setNow('2026-10-13T08:35:00Z');                                                     // 10 h 35 Paris
  assert.equal(await app.instagram.tick(), null);
  assert.equal(meta.calls.filter(c => c.endsWith('/1784/media')).length, sentBefore);
  assert.equal(row(post).status, 'queued');
  // Après la pause, au créneau suivant : publiée, palier remis à zéro.
  setNow('2026-10-14T08:35:00Z');                                                     // lendemain, 10 h 35
  await app.instagram.tick();
  assert.equal(row(post).status, 'published');
  assert.equal(JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'instagram_state'").pluck().get()).pauseLevel, 0);
});

test('quota de publications atteint à la publication : remise en file, pauses de 1 h puis 2 h ; lecture du quota réel', async t => {
  const { app, meta, photos, row, setNow } = await igApp(t);
  meta.behave.publish = () => meta.json({ error: { code: 9, error_subcode: 2207042, message: 'Limit reached' } }, 400);
  const post = app.instagram.enqueue(photos[0]);
  await assert.rejects(app.instagram.publish(post), /quota de publications d’Instagram atteint\. File en pause jusqu’à 11 h 00/);
  assert.deepEqual([row(post).status, row(post).attempts], ['queued', 0]);
  setNow('2026-10-13T09:01:00Z');
  await assert.rejects(app.instagram.publish(post), /jusqu’à 13 h 01/);                                     // second palier : 2 h
  // Quota réel lu chez Meta : épuisé, refus avant tout envoi.
  app.instagram.resume();
  meta.behave.publish = null;
  meta.behave.quota = { data: [{ quota_usage: 100, config: { quota_total: 100, quota_duration: 86400 } }] };
  const sent = meta.calls.filter(c => c.endsWith('/1784/media')).length;
  await assert.rejects(app.instagram.publish(post), /Quota d’Instagram atteint \(100 \/ 100 sur 24 h\)/);
  assert.equal(meta.calls.filter(c => c.endsWith('/1784/media')).length, sent);
  assert.deepEqual(app.instagram.usage().liveQuota.total, 100);
});

test('budget d’appels du réglage, vérifications espacées du traitement de l’image', async t => {
  const { app, db, meta, sleeps, photos } = await igApp(t);
  // Traitement en deux passages : 3 vérifications, attentes de 2 puis 3 s (au lieu de 30 vérifications toutes les 2 s).
  meta.behave.inProgress = 2;
  await app.instagram.publish(app.instagram.enqueue(photos[0]));
  assert.equal(meta.calls.filter(c => c.endsWith('/container-1')).length, 3);
  assert.deepEqual(sleeps, [2000, 3000]);
  // Personnalisé, 10 appels par heure : plus de marge pour une publication.
  app.instagram.saveSettings({ ...app.instagram.settings(), limits: { preset: 'custom', postsPerDay: 25, minGapMinutes: 0, callsPerHour: 10 } });
  await assert.rejects(app.instagram.publish(app.instagram.enqueue(photos[1])), /appels à l’API sur la dernière heure \(limite : 10\)/);
  assert.ok(db.prepare('SELECT COUNT(*) FROM instagram_calls').pluck().get() > 0);
  assert.equal(db.prepare("SELECT COUNT(*) FROM instagram_calls WHERE kind = 'quota'").pluck().get(), 1);
});

test('admin : réglage des limites, consommation affichée, reprise manuelle', async t => {
  const TOKEN = 'jeton-de-test-0123456789';
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN, INSTAGRAM_APP_ID: '1', INSTAGRAM_APP_SECRET: 's' } });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien' } });
  const cookies = Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = o => ctx.app.inject({ ...o, cookies });
  const post = (url, payload) => as({ method: 'POST', url, payload: { _csrf: csrf, ...payload }, headers: { accept: 'text/html' } });
  let page = (await as({ url: '/admin/instagram' })).body;
  assert.match(page, /name="limits_preset" value="prudent" checked/);
  assert.match(page, /Publications sur 24 h glissantes : <strong>0 \/ 25<\/strong>/);
  await post('/admin/instagram/reglages', { times: '18:30', limits_preset: 'custom', limits_posts: '8', limits_gap: '120', limits_calls: '50' });
  assert.deepEqual(JSON.parse(ctx.db.prepare("SELECT value FROM settings WHERE key = 'instagram'").pluck().get()).limits, { preset: 'custom', postsPerDay: 8, minGapMinutes: 120, callsPerHour: 50 });
  page = (await as({ url: '/admin/instagram' })).body;
  assert.match(page, /0 \/ 8/);
  assert.match(page, /Au moins <strong>120 min<\/strong> entre deux publications/);
  // Pause en cours : bandeau et bouton ; « Reprendre maintenant » la lève.
  ctx.db.prepare("INSERT INTO settings (key, value) VALUES ('instagram_state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ lastSlot: null, pausedUntil: Date.now() + 3600 * 1000, pauseReason: 'trop d’appels à l’API Instagram', pauseLevel: 1 }));
  assert.match((await as({ url: '/admin/instagram' })).body, /File en pause jusqu’[^:]+: trop d’appels à l’API Instagram/);
  await post('/admin/instagram/reprendre', {});
  assert.doesNotMatch((await as({ url: '/admin/instagram' })).body, /File en pause/);
});
