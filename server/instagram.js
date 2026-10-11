import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { MAX_PIXELS } from './images.js';
import { specFor } from './variants.js';
import { overlayFor, resolveTone } from './watermark.js';
import { monthYear } from './format.js';

// Partage des photos publiées sur un compte Instagram professionnel, par l'API officielle de Meta
// (« Instagram API with Instagram Login », graph.instagram.com) :
// - file d'attente, une publication par créneau horaire (heure de Paris) ;
// - image JPEG préparée par le site (1080 px, passe-partout ou recadrage, filigrane au choix), servie à
//   Instagram par une adresse temporaire impossible à deviner, le temps de l'envoi ;
// - légende tirée d'un modèle, personnalisable photo par photo ;
// - jeton d'accès chiffré en base (AES-256-GCM), renouvelé avant son expiration (60 jours).

export const FRAMES = { white: 'Passe-partout blanc', black: 'Passe-partout noir', crop: 'Recadrage (sans bordure)' };
export const DEFAULT_TEMPLATE = `{titre}
{lieu}, {date}

{legende}

📷 {auteur} · série {serie}
Lien en bio · {site}

{hashtags}`;
// autoSeries : séries dont les photos entrent seules dans la file à leur publication. Vide par défaut :
// rien ne part sur Instagram sans un choix explicite (série cochée, ou ajout depuis la fiche).
export const DEFAULTS = { autoSeries: [], times: ['18:30'], frame: 'white', watermark: false, template: DEFAULT_TEMPLATE, hashtags: '#photographie', seriesHashtags: {} };
export const LIMITS = { caption: 2200, hashtags: 30, times: 4, attempts: 3 };
const VARIABLES = ['titre', 'legende', 'lieu', 'date', 'auteur', 'serie', 'site', 'hashtags'];
const GRAPH = 'https://graph.instagram.com';
const SCOPES = 'instagram_business_basic,instagram_business_content_publish';
const SIZE = 1080;

export class InstagramError extends Error {}

// ---------- réglages ----------
const tag = s => String(s || '').match(/#[\p{L}\p{N}_]+/gu) || [];
export function normalizeSettings(body = {}, categories = []) {
  const times = [...new Set(String(body.times ?? '').split(/[,;\s]+/).filter(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort().slice(0, LIMITS.times);
  const series = {};
  for (const c of categories) { const h = tag(body[`hashtags_${c.id}`]).join(' '); if (h) series[c.id] = h; }
  const on = v => v === 'on' || v === true;
  return {
    autoSeries: categories.filter(c => on(body[`auto_${c.id}`])).map(c => c.id),
    times: times.length ? times : DEFAULTS.times,
    frame: Object.hasOwn(FRAMES, body.frame) ? body.frame : DEFAULTS.frame,
    watermark: body.watermark === 'on' || body.watermark === true,
    template: typeof body.template === 'string' && body.template.trim() ? body.template.replace(/\r\n/g, '\n').slice(0, LIMITS.caption) : DEFAULT_TEMPLATE,
    hashtags: tag(body.hashtags).join(' ').slice(0, 600),
    seriesHashtags: series,
  };
}

// ---------- légende ----------
export function hashtagsFor(photo, settings) {
  const all = [...tag(settings.hashtags), ...tag(settings.seriesHashtags?.[photo.category_id])];
  const seen = new Set();
  return all.filter(h => { const k = h.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, LIMITS.hashtags);
}

// Remplit le modèle ; une ligne dont toutes les variables sont vides disparaît, et les séparateurs
// orphelins (« , », « · », « — ») d'une variable vide sont retirés.
export function renderCaption(template, photo, settings, siteName) {
  const values = {
    titre: photo.title || '', legende: photo.legend || '', lieu: photo.place || '', date: monthYear(photo.taken_on) || '',
    auteur: photo.author || '', serie: photo.category || '', site: siteName || '', hashtags: hashtagsFor(photo, settings).join(' '),
  };
  const lines = String(template).split('\n').map(line => {
    const vars = [...line.matchAll(/\{(\w+)\}/g)].map(m => m[1]).filter(v => VARIABLES.includes(v));
    if (vars.length && vars.every(v => !values[v])) return null;
    let out = line.replace(/\{(\w+)\}/g, (m, v) => (VARIABLES.includes(v) ? (values[v] ? `\u0000${values[v]}\u0000` : '\u0001') : m));
    if (out.includes('\u0001')) {
      out = out.replace(/\s*[,·—–-]?\s*\u0001\s*([,·—–-](?=\s))?/g, ' ').replace(/^\s*[,·—–-]\s+/, '').replace(/\s+[,·—–-]\s*$/, '');
    }
    return out.replace(/\u0000/g, '').replace(/[ \t]{2,}/g, ' ').trim();
  }).filter(l => l !== null);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITS.caption);
}

export function captionWarnings(text) {
  const w = [];
  if (text.length > LIMITS.caption) w.push(`Légende trop longue : ${text.length} caractères (2 200 au plus).`);
  const n = tag(text).length;
  if (n > LIMITS.hashtags) w.push(`${n} hashtags : Instagram en accepte 30 au plus.`);
  if (/https?:\/\//i.test(text)) w.push('Les liens ne sont pas cliquables dans une légende Instagram : préférez « lien en bio ».');
  return w;
}

// ---------- jeton chiffré ----------
export function sealer(secret) {
  // Clé propre à cet usage (HKDF) : distincte de celle qui signe les cookies, même dérivée du même secret.
  const key = Buffer.from(crypto.hkdfSync('sha256', String(secret), 'nicephos', 'instagram-token-v1', 32));
  return {
    seal(text) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
    },
    open(sealed) {
      const b = Buffer.from(String(sealed), 'base64url');
      const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    },
  };
}

// Les messages d'erreur ne doivent jamais contenir un jeton ou le secret de l'application.
const scrub = (msg, secrets = []) => {
  let out = String(msg || '').replace(/(access_token|client_secret|code)=[^&\s"]+/gi, '$1=…');
  for (const s of secrets) if (s && s.length > 6) out = out.split(s).join('…');
  return out.slice(0, 300);
};

// ---------- heure de Paris ----------
const parisParts = d => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(d).map(p => [p.type, p.value]));
const parisKey = d => { const p = parisParts(d); return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; };
// Les créneaux à venir (« 2026-10-11 18:30 »), à partir de maintenant.
export function upcomingSlots(times, now, count) {
  const out = [];
  const { day, time } = parisKey(now);
  for (let k = 0; out.length < count && k < 400; k++) {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + k);
    const ds = d.toISOString().slice(0, 10);
    for (const t of times) if (k > 0 || t > time) { out.push(`${ds} ${t}`); if (out.length === count) break; }
  }
  return out;
}
// Le dernier créneau passé (« 2026-10-11 18:30 »), ou null avant le premier créneau d'aujourd'hui.
export function lastSlot(times, now) {
  const { day, time } = parisKey(now);
  const past = times.filter(t => t <= time);
  if (past.length) return `${day} ${past.at(-1)}`;
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.toISOString().slice(0, 10)} ${times.at(-1)}`;
}

// ---------- service ----------
export function createInstagram({ db, storageDir, config, variants, siteName, log, fetchImpl = fetch, now = () => new Date(), sleep = ms => new Promise(r => setTimeout(r, ms)), timeoutMs = 30_000 }) {
  const ig = config.instagram;
  const vault = sealer(ig.tokenKey);
  const secrets = () => [ig.appSecret, account.token()];
  const q = {
    setting: db.prepare('SELECT value FROM settings WHERE key = ?').pluck(),
    save: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    photo: db.prepare(`SELECT p.*, a.name AS author, c.name AS category FROM photos p
      JOIN authors a ON a.id = p.author_id JOIN categories c ON c.id = p.category_id WHERE p.id = ?`),
    post: db.prepare('SELECT * FROM instagram_posts WHERE id = ?'),
    active: db.prepare("SELECT * FROM instagram_posts WHERE photo_id = ? AND status IN ('queued', 'publishing') ORDER BY id DESC LIMIT 1"),
    latest: db.prepare("SELECT * FROM instagram_posts WHERE photo_id = ? AND status <> 'cancelled' ORDER BY id DESC LIMIT 1"),
    queue: db.prepare("SELECT * FROM instagram_posts WHERE status IN ('queued', 'publishing') ORDER BY status = 'publishing' DESC, position, id"),
    history: db.prepare("SELECT * FROM instagram_posts WHERE status IN ('published', 'failed') ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT ?"),
    byToken: db.prepare("SELECT * FROM instagram_posts WHERE media_token = ? AND status = 'publishing' AND media_token_at > ?"),
    account: db.prepare('SELECT * FROM instagram_account WHERE id = 1'),
  };
  const read = (key, dflt) => { try { const raw = q.setting.get(key); return raw ? { ...dflt, ...JSON.parse(raw) } : { ...dflt }; } catch { return { ...dflt }; } };
  // Envoi interrompu par un arrêt du serveur : on ne sait pas s'il a abouti, donc pas de nouvel essai automatique.
  db.prepare(`UPDATE instagram_posts SET status = 'failed', media_token = NULL,
    error = 'envoi interrompu par un redémarrage du serveur : vérifiez sur Instagram avant de réessayer' WHERE status = 'publishing'`).run();
  // L'ancien interrupteur global « autoQueue » (coché par défaut) est ignoré : on repart de « aucune série ».
  const settings = () => { const { autoQueue, ...s } = read('instagram', DEFAULTS); return { ...s, autoSeries: Array.isArray(s.autoSeries) ? s.autoSeries.map(Number) : [] }; };

  const account = {
    get: () => q.account.get() || null,
    token() { const a = q.account.get(); try { return a ? vault.open(a.token) : null; } catch { return null; } },
    save({ igUserId, username, token, expiresIn }) {
      const t = now().getTime();
      db.prepare(`INSERT INTO instagram_account (id, ig_user_id, username, token, expires_at, refreshed_at, connected_at) VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET ig_user_id = excluded.ig_user_id, username = excluded.username, token = excluded.token,
          expires_at = excluded.expires_at, refreshed_at = excluded.refreshed_at, connected_at = excluded.connected_at`)
        .run(String(igUserId), String(username), vault.seal(token), t + expiresIn * 1000, t, t);
    },
    remove: () => db.prepare('DELETE FROM instagram_account').run(),
    // « none » : pas de compte ; « unreadable » : jeton indéchiffrable (clé changée, base restaurée ailleurs).
    state() { const a = q.account.get(); if (!a) return 'none'; return this.token() ? 'ok' : 'unreadable'; },
  };

  // Appel à l'API : erreurs Meta traduites, jamais de jeton dans un message.
  async function call(url, { method = 'GET', form } = {}) {
    let res;
    try {
      const signal = AbortSignal.timeout(timeoutMs);               // Meta muette : l'envoi échoue au lieu de bloquer la file
      res = await fetchImpl(url, form ? { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form), signal } : { method, signal });
    } catch (err) {
      throw new InstagramError(`Instagram injoignable : ${scrub(err.message, secrets())}`);
    }
    let data = {};
    try { data = await res.json(); } catch { /* réponse vide */ }
    if (!res.ok || data.error) {
      const e = data.error || {};
      throw new InstagramError(scrub(e.error_user_msg || e.message || data.error_message || `erreur ${res.status}`, secrets()));
    }
    return data;
  }
  const api = (p, params = {}) => `${GRAPH}/${ig.apiVersion}/${p}?${new URLSearchParams(params)}`;

  // ---------- image envoyée à Instagram ----------
  // Rendu coûteux (original décodé, recadrage, mozjpeg) : un seul à la fois, et les derniers gardés en mémoire.
  const cache = new Map();
  let renderQueue = Promise.resolve();
  function image(photoId, options) {
    const p = q.photo.get(photoId);
    if (!p) return Promise.reject(new InstagramError('photo introuvable'));
    const key = JSON.stringify([p.id, p.file, p.variant_key, p.updated_at, p.watermark, options.frame, Boolean(options.watermark), options.watermark ? variants.context().watermark : null]);
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    const job = renderQueue.then(() => cache.get(key) || renderImage(p, options)).then(buf => {
      cache.set(key, buf);
      if (cache.size > 24) cache.delete(cache.keys().next().value);
      return buf;
    });
    renderQueue = job.catch(() => {});
    return job;
  }
  async function renderImage(p, { frame, watermark }) {
    const src = path.join(storageDir, 'originals', p.file);
    const meta = await sharp(src, { limitInputPixels: MAX_PIXELS }).metadata();
    const w = meta.autoOrient?.width ?? meta.width;
    const h = meta.autoOrient?.height ?? meta.height;
    const r = w / h;
    let mark = null;
    if (watermark) {
      const ctx = variants.context();
      mark = specFor(p, { ...ctx, watermark: { ...ctx.watermark, enabled: true } }).mark;   // « jamais sur cette photo » reste respecté
      if (mark) mark = await resolveTone(src, mark, { limitInputPixels: MAX_PIXELS });
    }
    const render = async (iw, ih, fit) => {
      let pipe = sharp(src, { limitInputPixels: MAX_PIXELS }).rotate().resize(iw, ih, { fit, position: 'attention' });
      const buf = await pipe.toBuffer({ resolveWithObject: true });
      if (!mark) return buf.data;
      return sharp(buf.data).composite(await overlayFor(mark, buf.info.width, buf.info.height)).toBuffer();
    };
    let out;
    if (frame === 'crop') {
      const target = Math.min(1.91, Math.max(0.8, r));
      out = sharp(await render(SIZE, Math.round(SIZE / target), 'cover'));
    } else {
      // Passe-partout : toile 4:5 de 1080 × 1350, photo entière avec une marge.
      const inner = await render(Math.round(SIZE * 0.9), Math.round(1350 * 0.9), 'inside');
      const im = await sharp(inner).metadata();
      const bg = frame === 'black' ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
      out = sharp({ create: { width: SIZE, height: 1350, channels: 3, background: bg } })
        .composite([{ input: inner, left: Math.round((SIZE - im.width) / 2), top: Math.round((1350 - im.height) / 2) }]);
    }
    return out.flatten({ background: '#ffffff' }).jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
  }

  // ---------- file ----------
  const optionsOf = (post, s = settings()) => ({ frame: post?.frame || s.frame, watermark: post ? Boolean(post.watermark) : s.watermark });
  function captionOf(post, s = settings()) {
    if (post?.caption) return post.caption;
    const p = q.photo.get(post.photo_id);
    return p ? renderCaption(s.template, p, s, siteName()) : '';
  }
  function enqueue(photoId, { frame, watermark, caption } = {}) {
    const s = settings();
    const p = q.photo.get(photoId);
    if (!p) throw new InstagramError('photo introuvable');
    if (p.status !== 'published') throw new InstagramError('seules les photos publiées sur le site partent sur Instagram');
    const fields = {
      frame: Object.hasOwn(FRAMES, frame) ? frame : s.frame,
      watermark: watermark === undefined ? (s.watermark ? 1 : 0) : (watermark ? 1 : 0),
      caption: typeof caption === 'string' && caption.trim() ? caption.replace(/\r\n/g, '\n').trim().slice(0, LIMITS.caption) : null,
    };
    const existing = q.active.get(photoId);
    if (existing) {
      if (existing.status === 'publishing') throw new InstagramError('envoi en cours : modification impossible');
      db.prepare('UPDATE instagram_posts SET frame = @frame, watermark = @watermark, caption = @caption WHERE id = @id').run({ ...fields, id: existing.id });
      return existing.id;
    }
    const pos = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 FROM instagram_posts WHERE status = 'queued'").pluck().get();
    return Number(db.prepare(`INSERT INTO instagram_posts (photo_id, status, position, frame, watermark, caption, created_at)
      VALUES (?, 'queued', ?, ?, ?, ?, ?)`).run(photoId, pos, fields.frame, fields.watermark, fields.caption, now().getTime()).lastInsertRowid);
  }
  function cancel(postId) {
    return db.prepare("DELETE FROM instagram_posts WHERE id = ? AND status = 'queued'").run(postId).changes > 0;
  }
  function move(postId, dir) {
    const list = db.prepare("SELECT id FROM instagram_posts WHERE status = 'queued' ORDER BY position, id").pluck().all();
    const i = list.indexOf(Number(postId));
    const j = i + (dir === 'up' ? -1 : 1);
    if (i === -1 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const set = db.prepare('UPDATE instagram_posts SET position = ? WHERE id = ?');
    db.transaction(() => list.forEach((id, k) => set.run(k, id)))();
  }
  // Photos qui viennent d'être publiées sur le site : dans la file si leur série est en mise en file
  // automatique (jamais une photo déjà partagée ou déjà dans la file).
  function onPublished(ids) {
    const auto = new Set(settings().autoSeries);
    if (!auto.size) return [];
    const added = [];
    for (const id of ids) {
      if (!auto.has(q.photo.get(id)?.category_id) || q.latest.get(id)) continue;
      try { added.push(enqueue(id)); } catch { /* photo dépubliée entre-temps */ }
    }
    return added;
  }

  // ---------- envoi ----------
  let busy = false;
  async function publish(postId) {
    if (busy) throw new InstagramError('un envoi est déjà en cours');
    const a = account.get();
    const token = account.token();
    if (!ig.configured || !a || !token) throw new InstagramError('compte Instagram non connecté');
    if (!ig.https) throw new InstagramError('Instagram ne peut récupérer l’image que si le site est en HTTPS (PUBLIC_URL)');
    const post = q.post.get(postId);
    if (!post || post.status !== 'queued') throw new InstagramError('publication introuvable dans la file');
    const photo = q.photo.get(post.photo_id);
    if (!photo || photo.status !== 'published') { db.prepare("UPDATE instagram_posts SET status = 'failed', error = ? WHERE id = ?").run('photo dépubliée sur le site', postId); throw new InstagramError('photo dépubliée sur le site'); }
    busy = true;
    let phase = 'prepare';                            // « publish » : Meta a peut-être déjà publié
    const mediaToken = crypto.randomBytes(24).toString('base64url');
    db.prepare("UPDATE instagram_posts SET status = 'publishing', media_token = ?, media_token_at = ?, attempts = attempts + 1, error = NULL WHERE id = ?").run(mediaToken, now().getTime(), postId);
    try {
      const container = await call(api(`${a.ig_user_id}/media`), { form: { image_url: `${config.publicUrl}/partage/instagram/${mediaToken}.jpg`, caption: captionOf(post), access_token: token } });
      for (let k = 0; ; k++) {
        const st = await call(api(container.id, { fields: 'status_code,status', access_token: token }));
        if (st.status_code === 'FINISHED') break;
        if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new InstagramError(`image refusée par Instagram (${scrub(st.status || st.status_code)})`);
        if (k >= 30) throw new InstagramError('Instagram n’a pas fini de traiter l’image');
        await sleep(2000);
      }
      phase = 'publish';
      const media = await call(api(`${a.ig_user_id}/media_publish`), { form: { creation_id: container.id, access_token: token } });
      phase = 'done';
      let permalink = null;
      try { permalink = (await call(api(media.id, { fields: 'permalink', access_token: token }))).permalink || null; } catch { /* le post existe ; lien plus tard */ }
      if (permalink && !/^https:\/\/(www\.)?instagram\.com\//.test(permalink)) permalink = null;      // affiché comme lien : Instagram seulement
      db.prepare(`UPDATE instagram_posts SET status = 'published', media_token = NULL, ig_media_id = ?, permalink = ?, published_at = ?, error = NULL WHERE id = ?`)
        .run(String(media.id), permalink, now().getTime(), postId);
      log?.info({ post: postId, photo: post.photo_id }, 'publié sur Instagram');
      return { permalink };
    } catch (err) {
      let msg = err instanceof InstagramError ? err.message : scrub(err.message, secrets());
      if (err.name === 'TimeoutError' || /aborted|timeout/i.test(msg)) msg = 'Instagram n’a pas répondu à temps';
      const attempts = q.post.get(postId)?.attempts ?? LIMITS.attempts;
      // Échec : la publication reste en tête de file et repart au créneau suivant, 3 essais au plus.
      // Échec pendant la publication elle-même : le post existe peut-être déjà ; pas de nouvel essai (doublon).
      const final = phase === 'publish' || attempts >= LIMITS.attempts;
      if (phase === 'publish') msg = `${msg} — la publication a peut-être abouti : vérifiez sur Instagram avant de réessayer`;
      db.prepare('UPDATE instagram_posts SET status = ?, media_token = NULL, error = ? WHERE id = ?').run(final ? 'failed' : 'queued', msg, postId);
      log?.warn({ post: postId, err: msg }, 'publication Instagram impossible');
      throw new InstagramError(msg);
    } finally {
      busy = false;
    }
  }
  function retry(postId) {
    const pos = db.prepare("SELECT COALESCE(MIN(position), 1) - 1 FROM instagram_posts WHERE status = 'queued'").pluck().get();
    return db.prepare("UPDATE instagram_posts SET status = 'queued', attempts = 0, error = NULL, position = ? WHERE id = ? AND status = 'failed'").run(pos, postId).changes > 0;
  }

  // ---------- connexion (OAuth) ----------
  function authorizeUrl(state) {
    return `https://www.instagram.com/oauth/authorize?${new URLSearchParams({ client_id: ig.appId, redirect_uri: ig.redirectUri, response_type: 'code', scope: SCOPES, state })}`;
  }
  async function connect(code) {
    const clean = String(code || '').replace(/#_$/, '');
    const short = await call('https://api.instagram.com/oauth/access_token', { form: { client_id: ig.appId, client_secret: ig.appSecret, grant_type: 'authorization_code', redirect_uri: ig.redirectUri, code: clean } });
    const shortToken = short.access_token || short.data?.[0]?.access_token;
    if (!shortToken) throw new InstagramError('réponse inattendue d’Instagram (jeton absent)');
    const long = await call(`${GRAPH}/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: ig.appSecret, access_token: shortToken })}`);
    const me = await call(api('me', { fields: 'user_id,username', access_token: long.access_token }));
    account.save({ igUserId: me.user_id || me.id, username: me.username, token: long.access_token, expiresIn: Number(long.expires_in) || 60 * 24 * 3600 });
    return me.username;
  }
  async function refresh(force = false) {
    const a = account.get();
    const token = account.token();
    if (!a || !token) return false;
    const t = now().getTime();
    if (!force && (t - a.refreshed_at < 24 * 3600 * 1000 || a.expires_at - t > 30 * 24 * 3600 * 1000)) return false;
    const r = await call(`${GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })}`);
    db.prepare('UPDATE instagram_account SET token = ?, expires_at = ?, refreshed_at = ? WHERE id = 1').run(vault.seal(r.access_token), t + (Number(r.expires_in) || 60 * 24 * 3600) * 1000, t);
    return true;
  }

  // ---------- créneaux ----------
  // Chaque minute : au premier passage après un créneau, la tête de file part (une photo par créneau).
  let refreshFailedAt = 0;
  async function tick() {
    // Renouvellement du jeton ; après un échec, nouvel essai six heures plus tard (pas à chaque minute).
    if (now().getTime() - refreshFailedAt > 6 * 3600 * 1000) {
      try { await refresh(); } catch (err) { refreshFailedAt = now().getTime(); log?.warn({ err: err.message }, 'jeton Instagram non renouvelé'); }
    }
    const s = settings();
    const slot = lastSlot(s.times, now());
    const state = read('instagram_state', { lastSlot: null });
    // Créneaux comparés dans l'ordre (« AAAA-MM-JJ HH:MM ») : un changement d'heures ne fait rien partir d'avance.
    if (state.lastSlot && slot <= state.lastSlot) return null;
    q.save.run('instagram_state', JSON.stringify({ ...state, lastSlot: slot }));
    if (!state.lastSlot) return null;                 // premier démarrage : on attend le prochain créneau
    // Tête de file parmi les photos encore publiées sur le site (une photo dépubliée ne consomme pas le créneau).
    const next = q.queue.all().find(p => p.status === 'queued' && q.photo.get(p.photo_id)?.status === 'published');
    if (!next || !account.get() || !ig.configured || !ig.https) return null;
    try { return await publish(next.id); } catch { return null; }
  }
  let timer = null;

  return {
    settings,
    saveSettings(s) {
      q.save.run('instagram', JSON.stringify(s));
      const state = read('instagram_state', { lastSlot: null });
      if (state.lastSlot) q.save.run('instagram_state', JSON.stringify({ ...state, lastSlot: [state.lastSlot, lastSlot(s.times, now())].sort().at(-1) }));
    },
    // Photos repassées en brouillon : retirées de la file (pas l'historique).
    onUnpublished(ids) {
      const del = db.prepare("DELETE FROM instagram_posts WHERE photo_id = ? AND status = 'queued'");
      db.transaction(() => ids.forEach(id => del.run(id)))();
    },
    account: { get: account.get, remove: account.remove, state: () => account.state(), connected: () => account.state() === 'ok' },
    isPublic: photoId => q.photo.get(photoId)?.status === 'published',
    image, enqueue, cancel, move, onPublished, publish, retry, captionOf, optionsOf,
    caption: (photoId, s = settings()) => { const p = q.photo.get(photoId); return p ? renderCaption(s.template, p, s, siteName()) : ''; },
    post: id => q.post.get(id),
    forPhoto: photoId => q.latest.get(photoId) || null,
    queue: () => {
      const s = settings();
      const list = q.queue.all();
      const slots = upcomingSlots(s.times, now(), list.length);
      let k = 0;
      return list.map(p => ({ ...p, slot: p.status === 'publishing' ? 'maintenant' : slots[k++] }));
    },
    history: (n = 20) => q.history.all(n),
    // Jeton d'image valable 15 minutes au plus (Instagram la télécharge dans les secondes qui suivent).
    byMediaToken: token => (/^[\w-]{20,64}$/.test(token) ? q.byToken.get(token, now().getTime() - 15 * 60 * 1000) : null),
    authorizeUrl, connect, refresh, tick,
    start() { if (!timer) { timer = setInterval(() => { tick().catch(err => log?.error({ err }, 'file Instagram')); }, 60 * 1000); timer.unref(); } },
    stop() { clearInterval(timer); timer = null; },
  };
}
