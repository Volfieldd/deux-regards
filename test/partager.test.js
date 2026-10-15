import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

// Partager une photo : fenêtre (liens des réseaux, lien à copier, QR, post Instagram s'il existe), page sans
// JavaScript, partages comptés anonymement, aperçus de liens, Statistiques de l'admin.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

test('partager : fenêtre et liens, page sans JavaScript, Instagram si posté, aperçus', async t => {
  const ctx = await setup(t, { seeded: true, env: { PUBLIC_URL: 'http://photos.exemple.fr' } });
  const p = ctx.db.prepare("SELECT id, slug, title FROM photos WHERE status = 'published' ORDER BY position LIMIT 1").get();
  const url = `http://photos.exemple.fr/photo/${p.slug}`;
  const html = (await ctx.app.inject(`/photo/${p.slug}`)).body;
  // Bouton (lien vers la page de partage sans JavaScript) et fenêtre.
  assert.match(html, new RegExp(`class="share-btn" href="/photo/${p.slug}/partager"[^>]*data-share-url="${url}"`));
  assert.match(html, /<dialog class="share-dialog" data-share-dialog/);
  // Liens simples : aucun script tiers, l'adresse de la page dans chaque lien.
  const enc = encodeURIComponent(url);
  for (const href of [`https://wa.me/?text=`, `https://www.facebook.com/sharer/sharer.php?u=${enc}`, 'https://bsky.app/intent/compose?text=', `https://x.com/intent/post?text=`, `https://www.pinterest.com/pin/create/button/?url=${enc}&amp;media=`, 'mailto:?subject=']) {
    assert.ok(html.includes(href), href);
  }
  assert.ok(html.includes(enc), 'adresse encodée dans les liens');
  assert.doesNotMatch(html, /<script[^>]+(facebook|twitter|x\.com|pinterest|bsky)/);
  // Lien à copier et QR (qui compte les scans).
  assert.match(html, new RegExp(`<input readonly value="${url}"`));
  assert.match(html, /<span class="qr"><svg[^>]*>/);
  // Pas de post Instagram : pas de bouton.
  assert.doesNotMatch(html, /Voir sur Instagram/);
  ctx.db.prepare("INSERT INTO instagram_posts (photo_id, status, frame, permalink, created_at, published_at) VALUES (?, 'published', 'crop', 'https://www.instagram.com/p/ABC123/', 1, 2)").run(p.id);
  assert.match((await ctx.app.inject(`/photo/${p.slug}`)).body, /href="https:\/\/www\.instagram\.com\/p\/ABC123\/"[^>]*data-via="instagram"[\s\S]*?Voir sur Instagram/);
  // Aperçus de liens : grande image et description.
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta property="og:description" content="[^"]+">/);
  // Sans JavaScript, en allemand : la même chose en page ; le lien partagé garde la langue.
  const de = await ctx.app.inject(`/de/photo/${p.slug}/partager`);
  assert.equal(de.statusCode, 200);
  assert.match(de.body, /<h1>Teilen<\/h1>/);
  assert.match(de.body, new RegExp(`value="http://photos.exemple.fr/de/photo/${p.slug}"`));
  assert.match(de.body, /Auf Instagram ansehen/);
  assert.equal((await ctx.app.inject('/photo/inconnue/partager')).statusCode, 404);
});

test('partager : comptés anonymement, refusés depuis un autre site, visibles dans les Statistiques', async t => {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN } });
  const p = ctx.db.prepare("SELECT id, slug, title FROM photos WHERE status = 'published' ORDER BY position LIMIT 1").get();
  const share = (via, headers = {}, ip = '203.0.113.40') => ctx.app.inject({ method: 'POST', url: `/photo/${p.slug}/partage`, remoteAddress: ip,
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, payload: `via=${via}` });
  assert.equal((await share('whatsapp')).statusCode, 204);
  assert.equal((await share('copie')).statusCode, 204);
  assert.equal((await share('telephone')).statusCode, 204);
  assert.equal((await share('inconnu')).statusCode, 422);
  assert.equal((await share('whatsapp', { origin: 'https://ailleurs.example' })).statusCode, 429);
  assert.equal((await ctx.app.inject({ method: 'POST', url: '/photo/inconnue/partage', payload: { via: 'x' } })).statusCode, 404);
  // Arrivée par le QR : comptée ; un robot, non.
  await ctx.app.inject({ url: `/photo/${p.slug}?partage=qr`, headers: { 'user-agent': 'Mozilla/5.0' } });
  await ctx.app.inject({ url: `/photo/${p.slug}?partage=qr`, headers: { 'user-agent': 'Googlebot/2.1' } });
  const rows = ctx.db.prepare('SELECT via, n FROM photo_shares WHERE photo_id = ? ORDER BY via').all(p.id);
  assert.deepEqual(rows.map(r => [r.via, r.n]), [['copie', 1], ['qr', 1], ['telephone', 1], ['whatsapp', 1]]);
  // Rien d'autre n'est gardé : ni adresse, ni navigateur.
  assert.deepEqual(Object.keys(ctx.db.prepare('SELECT * FROM photo_shares LIMIT 1').get()).sort(), ['day', 'n', 'photo_id', 'via']);
  // Au plus 60 par heure et par adresse.
  for (let i = 0; i < 60; i++) await share('x', {}, '203.0.113.41');
  assert.equal((await share('x', {}, '203.0.113.41')).statusCode, 429);

  // Admin : Statistiques et audience de la photo.
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const stats = (await ctx.app.inject({ url: '/admin/statistiques', cookies })).body;
  assert.match(stats, /Partages <span class="mono">64 sur la période/);
  assert.match(stats, /WhatsApp/);
  assert.match(stats, /Menu du téléphone/);
  assert.match(stats, /QR scanné/);
  assert.match(stats, new RegExp(`Photos les plus partagées[\\s\\S]*?${p.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match((await ctx.app.inject({ url: `/admin/photos/${p.id}`, cookies })).body, /64 partages/);
});
