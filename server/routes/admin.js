import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import multipart from '@fastify/multipart';
import { createAdminRepo, ValidationError, titleFromFilename } from '../admin-repo.js';
import { createImportTracker } from '../imports.js';
import { variantName, widthsFor } from '../images.js';
import { importOriginal, removePhotoFiles, ImportError, MAX_FILE_BYTES } from '../media.js';
import { picture } from '../picture.js';
import { sameToken, safeNext } from '../auth.js';
import { pad } from '../format.js';
import sharp from 'sharp';
import { normalizeWatermark, normalizeExif, EXIF_MODES, MIN_WIDTHS } from '../variants.js';
import { FONTS, POSITIONS, KINDS, TONE_LABELS } from '../watermark.js';
import { THEMES, BRAND_MODES, BRAND_SLOTS } from '../themes.js';
import { processEmblem, processIcon, processShare, BrandError, EMBLEM_MAX_BYTES } from '../brand.js';
import { loadHelp } from '../help.js';
import { barsAndLine, sparkline } from '../charts.js';
import { RIGHTS, LANGS, rightsDefaults, withoutDefaults } from '../rights.js';
import { FRAMES, DEFAULT_TEMPLATE, normalizeSettings, captionWarnings, InstagramError } from '../instagram.js';
import { PRESETS as IG_PRESETS, BOUNDS as IG_BOUNDS } from '../instagram-limits.js';
import * as cities from '../geo/cities.js';
import { TranslateError } from '../translate.js';

// Carte des visiteurs (page Statistiques) : centre de chaque pays dans le repère 1000 × 520 du fond de carte
// (public/admin/carte-monde.svg, généré par scripts/carte-monde.mjs), nom du pays en français.
const COUNTRY_CENTRES = JSON.parse(fs.readFileSync(new URL('../pays-centres.json', import.meta.url), 'utf8'));
const REGION_NAMES = new Intl.DisplayNames(['fr'], { type: 'region' });
const countryName = code => { if (code === 'XX') return 'Pays inconnu'; try { return REGION_NAMES.of(code) || code; } catch { return code; } };
// Bulles : surface proportionnelle aux visiteurs (rayon en racine carrée), 3 à 24 unités ; les petites dessinées en dernier.
function countryBubbles(rows) {
  const known = rows.filter(r => COUNTRY_CENTRES[r.country]);
  const max = Math.max(1, ...known.map(r => r.visitors));
  return known.map(r => ({ ...r, x: COUNTRY_CENTRES[r.country][0], y: COUNTRY_CENTRES[r.country][1], r: Math.round((3 + 21 * Math.sqrt(r.visitors / max)) * 10) / 10 }))
    .sort((a, b) => b.visitors - a.visitors);
}

const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_MAX_SIDE = 4000;

const MAX_FILES = 50;
const STATUSES = { draft: 'Brouillon', published: 'Publiée' };

export { titleFromFilename };

// Administration : tout passe par requireAdmin ; chaque écriture par verifyCsrf.
export default async function adminRoutes(app) {
  const repo = createAdminRepo(app.db);
  const { storageDir, secureCookies } = app.config;
  const tmpDir = path.join(storageDir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  // Au démarrage, aucun import n'est en cours : les restes d'un import interrompu sont effacés.
  for (const f of fs.readdirSync(tmpDir)) fs.rmSync(path.join(tmpDir, f), { force: true, recursive: true });

  // throwFileSizeLimit: false — un fichier trop lourd est refusé seul (part.file.truncated), pas tout le lot.
  await app.register(multipart, {
    throwFileSizeLimit: false,
    limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES, fields: 10, fieldSize: 2000, parts: MAX_FILES + 10 },
  });

  // Photos envoyées une à une : rendu en arrière-plan, suivi consultable (/admin/photos/traitement).
  const tracker = createImportTracker({
    render: (id, onStep) => app.variants.renderPhoto(id, { onStep }),
    onReady: () => app.proofs.schedule(),
    // Rendu impossible (disque plein, incident passager…) : l'original, déjà validé et rangé, n'est jamais effacé ;
    // la photo reste en brouillon et le passage suivant recalcule ses images.
    onFailed: () => app.variants.schedule(),
    log: app.log,
  });
  app.addHook('onClose', async () => { await tracker.idle(); });

  app.addHook('preHandler', app.requireAdmin);
  // Journal d'audit : qui a modifié quoi (les co-admins ont tous les droits).
  app.addHook('onResponse', async (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.session) {
      request.log.info({ audit: true, sub: request.session.sub, action: `${request.method} ${request.routeOptions.url}`, params: request.params, status: reply.statusCode }, 'action admin');
    }
  });
  const write = { preHandler: app.verifyCsrf };

  // ---------- messages après redirection (cookie signé, lu une fois) ----------
  const FLASH = 'flash';
  const flash = (reply, message) => reply.setCookie(FLASH, JSON.stringify(message), {
    path: '/admin', httpOnly: true, secure: secureCookies, sameSite: 'lax', signed: true, maxAge: 60,
  });
  function takeFlash(request, reply) {
    const raw = request.cookies[FLASH];
    if (!raw) return null;
    reply.clearCookie(FLASH, { path: '/admin' });
    const unsigned = request.unsignCookie(raw);
    try { return unsigned.valid ? JSON.parse(unsigned.value) : null; } catch { return null; }
  }
  const done = (reply, to, text, details) => flash(reply, { type: 'ok', text, details }).redirect(to, 303);
  const failed = (reply, to, text, details) => flash(reply, { type: 'error', text, details }).redirect(to, 303);

  // Apparence de l'admin : « dark », « light », ou rien (celle du système, prefers-color-scheme).
  const THEME_COOKIE = 'admin_theme';
  const adminTheme = request => (['dark', 'light'].includes(request.cookies[THEME_COOKIE]) ? request.cookies[THEME_COOKIE] : '');
  // Barre latérale : les séries, avec une vignette et leur nombre de photos (cibles de dépôt).
  const navSeries = () => {
    const covers = repo.covers();
    return repo.categories().map(c => ({ ...c, thumb: covers[c.id] && rendered(covers[c.id]) ? thumb(covers[c.id]) : null }));
  };

  function render(request, reply, template, data) {
    const siteName = app.siteName();
    return reply.render(`admin/${template}`, {
      // Retour après la bascule clair / sombre : la page affichée, si elle a été obtenue par GET.
      adminTheme: adminTheme(request), navSeries: navSeries(), currentPath: request.method === 'GET' ? request.url : '/admin',
      siteName, session: request.session, csrf: request.session.csrf, flash: takeFlash(request, reply),
      section: template, picture: (p, o) => picture(p, { base: '/admin/media/', ...o }), pad, STATUSES, variants: app.variants.status(),
      local: request.session.sub.startsWith('local:') || !request.session.id_token, activity: tracker.active(),
      translate: app.translator.enabled, description: '', ...data, pageTitle: `${data.title} · Administration · ${siteName}`,
    });
  }

  const byId = id => (Number.isInteger(Number(id)) ? Number(id) : -1);
  // Variantes prêtes : la plus petite existe (les brouillons tout juste envoyés n'en ont pas encore).
  const rendered = p => {
    const job = tracker.get(p.id);
    if (job && (job.state === 'waiting' || job.state === 'processing')) return false;
    return fs.existsSync(path.join(storageDir, 'variants', variantName(p.file, widthsFor(p.width)[0], 'webp', p.variant_key)));
  };
  const withReady = p => p && { ...p, ready: rendered(p) };
  // Images de l'admin : vignette (la plus petite variante) et grande image (1280 px au plus).
  const thumb = p => `/admin/media/${variantName(p.file, widthsFor(p.width)[0], 'webp', p.variant_key)}`;
  const large = p => { const ws = widthsFor(p.width); return `/admin/media/${variantName(p.file, ws.filter(w => w <= 1280).at(-1) ?? ws[0], 'webp', p.variant_key)}`; };
  // Données d'une photo pour l'inspecteur de la photothèque.
  const dataOf = p => ({
    id: p.id, n: p.n, title: p.title, slug: p.slug, legend: p.legend, status: p.status, provisional: p.provisional,
    category_id: p.category_id, category: p.category, author_id: p.author_id, author: p.author, place: p.place,
    taken_on: p.taken_on, when: p.when, width: p.width, height: p.height, ready: p.ready,
    city_id: p.city_id ?? null, city: p.city_name ? cities.label({ name: p.city_name, cc: p.city_cc }) : '', city_source: p.city_source ?? null, on_map: Boolean(p.on_map),
    thumb: p.ready ? thumb(p) : null, large: p.ready ? large(p) : null,
  });
  // Classe de format (« ar-150 » = 3:2) : planche contact justifiée sans style en ligne (CSP).
  const ratioClass = p => (p.width > 0 && p.height > 0 ? `ar-${Math.min(300, Math.max(40, Math.round((p.width / p.height) * 20) * 5))}` : 'ar-150');

  // ---------- accueil ----------
  app.get('/admin', async (request, reply) => {
    // Les fichiers ne sont vérifiés (withReady) que pour les quelques photos affichées.
    const photos = repo.photos();
    const published = photos.filter(p => p.status === 'published');
    const heroSlugs = Array.isArray(repo.settings().hero) ? repo.settings().hero : [];
    const hero = heroSlugs.map(s => published.find(p => p.slug === s)).filter(Boolean);
    const todo = photos.filter(p => p.status === 'draft' || p.provisional);
    return render(request, reply, 'home', {
      title: 'Aujourd’hui',
      todo: todo.slice(0, 6).map(withReady), todoCount: todo.length,
      hero: (hero.length ? hero : published.slice(0, 5)).map(withReady).filter(p => p.ready),
      heroChosen: hero.length > 0,
      rhythm: repo.importsByMonth(12),
      recent: repo.recent(5).map(withReady),
      visitorsToday: app.stats.today(),
      monthTop: (() => { const { from, to } = app.stats.range(30); const t = app.stats.topPhotos(from, to, 1)[0]; const p = t && photos.find(x => x.id === t.id); return p ? { ...withReady(p), views: t.views } : null; })(),
      themeLabel: (THEMES[app.appearance.themeId()] || {}).label,
      publicUrl: app.config.publicUrl,
      counts: { published: photos.filter(p => p.status === 'published').length, draft: photos.filter(p => p.status === 'draft').length },
      categories: repo.categories().length, authors: repo.authors(), me: repo.authorBySub(request.session.sub),
      proofs: app.proofs.status(), tsa: app.config.tsa,
    });
  });

  // ---------- photos ----------
  app.get('/admin/photos', async (request, reply) => {
    const { q = '', auteur = '', serie = '', statut = '' } = request.query;
    // « À finir » : brouillons et titres provisoires.
    const todo = statut === 'afinir';
    const filter = { q: String(q), author: String(auteur), category: String(serie), status: STATUSES[statut] ? statut : '' };
    const authors = repo.authors();
    const all = repo.photos();
    let photos = repo.photos(filter).map(withReady);
    if (todo) photos = photos.filter(p => p.status === 'draft' || p.provisional);
    // Données de l'inspecteur (une photo choisie) : lues par admin.js, jamais exécutées.
    const data = photos.map(dataOf);
    return render(request, reply, 'photos', {
      title: 'Photothèque', photos, filter, authors, categories: repo.categories(), ratioClass,
      json: JSON.stringify(data).replace(/</g, '\\u003c'),
      filtered: Boolean(filter.q || filter.author || filter.category || filter.status || todo), todo,
      totals: { all: all.length, published: all.filter(p => p.status === 'published').length, draft: all.filter(p => p.status === 'draft').length,
        todo: all.filter(p => p.status === 'draft' || p.provisional).length },
      view: request.query.vue === 'liste' ? 'liste' : 'planche', importer: 'importer' in request.query, wide: true,
      defaultAuthor: repo.authorBySub(request.session.sub)?.id ?? authors[0]?.id,
      defaultCategory: repo.categories().find(c => c.slug === filter.category)?.id ?? repo.categories()[0]?.id,
      maxFileBytes: MAX_FILE_BYTES,
    });
  });

  // Import multiple. Le jeton CSRF est le premier champ du formulaire : aucun fichier n'est lu avant lui.
  app.post('/admin/photos/import', async (request, reply) => {
    const wantsJson = !request.headers.accept?.includes('text/html');
    const fields = {};
    const imported = [];
    const refused = [];
    let checked = false;
    const finish = (code, payload) => (wantsJson ? reply.code(code).send(payload) : null);

    try {
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          fields[part.fieldname] = part.value;
          if (part.fieldname === '_csrf') checked = sameToken(part.value, request.session.csrf);
          continue;
        }
        if (!checked) {
          part.file.resume();
          return finish(403, { error: 'Jeton CSRF invalide.' }) ?? reply.code(403).send('Jeton CSRF invalide.');
        }
        const categoryId = Number(fields.category_id);
        const authorId = Number(fields.author_id);
        if (!repo.categories().some(c => c.id === categoryId) || !repo.authors().some(a => a.id === authorId)) {
          part.file.resume();
          refused.push({ name: part.filename, reason: 'série ou auteur invalide' });
          continue;
        }
        const tmp = path.join(tmpDir, crypto.randomUUID());
        try {
          await pipeline(part.file, fs.createWriteStream(tmp));
        } catch (err) {
          fs.rmSync(tmp, { force: true });            // envoi interrompu : rien ne reste dans tmp/
          throw err;
        }
        if (part.file.truncated) {
          fs.rmSync(tmp, { force: true });
          refused.push({ name: part.filename, reason: `fichier trop lourd (${MAX_FILE_BYTES / 1024 / 1024} Mo au plus)` });
          continue;
        }
        let id = null;
        let original = null;
        try {
          original = await importOriginal(storageDir, tmp);
          id = repo.addPhoto({ title: titleFromFilename(part.filename), categoryId, authorId, sourceName: part.filename, ...original });
          await app.variants.renderPhoto(id);
          imported.push({ id, name: part.filename });
        } catch (err) {
          // Rien ne reste d'une image qui n'a pas pu être rendue : ni ligne, ni original, ni variante.
          if (id) repo.deletePhoto(id);
          if (original) removePhotoFiles(storageDir, original.file);
          if (err instanceof ImportError) refused.push({ name: part.filename, reason: err.message });
          else {
            request.log.warn({ err, file: part.filename }, 'rendu impossible à l’import');
            refused.push({ name: part.filename, reason: 'image illisible ou format non pris en charge par le serveur' });
          }
        }
      }
    } catch (err) {
      if (err.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return reply.code(400).send({ error: 'Envoi multipart attendu.' });
      if (err.code !== 'FST_FILES_LIMIT' && err.code !== 'FST_PARTS_LIMIT') throw err;
      refused.push({ name: '…', reason: `${MAX_FILES} fichiers au plus par envoi` });
    }

    if (!checked) return finish(403, { error: 'Jeton CSRF invalide.' }) ?? reply.code(403).send('Jeton CSRF invalide.');
    request.log.info({ imported: imported.length, refused: refused.length }, 'import de photos');
    if (imported.length) app.proofs.schedule();          // horodatage des nouveaux originaux
    if (wantsJson) return reply.send({ imported, refused });
    const details = refused.map(r => `${r.name} : ${r.reason}`);
    const text = `${imported.length} photo(s) importée(s) en brouillon${refused.length ? `, ${refused.length} refusée(s)` : ''}.`;
    return (imported.length ? done : failed)(reply, '/admin/photos?statut=draft', text, details);
  });


  // Envoi d'une seule photo (page d'import, avec JavaScript) : réponse dès l'original rangé,
  // les variantes sont rendues ensuite (suivi : /admin/photos/traitement).
  app.post('/admin/photos/envoi', async (request, reply) => {
    const fields = {};
    let checked = false;
    let result = null;
    const refuse = (code, error) => { result = { code, error }; };
    try {
      for await (const part of request.parts({ limits: { files: 1 } })) {
        if (part.type === 'field') {
          fields[part.fieldname] = part.value;
          if (part.fieldname === '_csrf') checked = sameToken(part.value, request.session.csrf);
          continue;
        }
        if (!checked || result) { part.file.resume(); continue; }
        const categoryId = Number(fields.category_id);
        const authorId = Number(fields.author_id);
        if (!repo.categories().some(c => c.id === categoryId) || !repo.authors().some(a => a.id === authorId)) {
          part.file.resume();
          refuse(422, 'série ou auteur invalide');
          continue;
        }
        const tmp = path.join(tmpDir, crypto.randomUUID());
        try {
          await pipeline(part.file, fs.createWriteStream(tmp));
        } catch (err) {
          fs.rmSync(tmp, { force: true });            // envoi interrompu (annulé) : rien ne reste dans tmp/
          throw err;
        }
        if (part.file.truncated) {
          fs.rmSync(tmp, { force: true });
          refuse(413, `trop lourde (${MAX_FILE_BYTES / 1024 / 1024} Mo au plus)`);
          continue;
        }
        try {
          const original = await importOriginal(storageDir, tmp);
          const title = titleFromFilename(part.filename);
          const id = repo.addPhoto({ title, categoryId, authorId, sourceName: part.filename, ...original });
          tracker.add(id, part.filename);
          result = { code: 200, id, title };
        } catch (err) {
          if (!(err instanceof ImportError)) throw err;
          refuse(422, err.message);
        }
      }
    } catch (err) {
      if (err.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return reply.code(400).send({ error: 'Envoi multipart attendu.' });
      if (err.code !== 'FST_FILES_LIMIT' && err.code !== 'FST_PARTS_LIMIT') throw err;
    }
    if (!checked) return reply.code(403).send({ error: 'Jeton CSRF invalide.' });
    if (!result) return reply.code(400).send({ error: 'Aucun fichier reçu.' });
    const { code, ...payload } = result;
    if (code === 200) request.log.info({ photo: payload.id }, 'photo envoyée');
    return reply.code(code).send(payload);
  });

  // État du traitement : par photo (?ids=1,2) et nombre de photos encore en cours (indicateur d'en-tête).
  app.get('/admin/photos/traitement', async request => {
    const ids = String(request.query.ids || '').split(',').filter(Boolean).map(Number).filter(Number.isInteger).slice(0, 200);
    return {
      active: tracker.active(),
      photos: ids.map(id => {
        const job = tracker.get(id);
        if (job?.state === 'error') return { id, state: 'error', error: job.error };
        const p = repo.photo(id);
        if (!p) return { id, state: 'missing' };
        const ready = rendered(p);
        return { id, state: ready ? 'ready' : (job?.state || 'processing'), done: job?.done ?? 0, total: job?.total ?? 0, thumb: ready ? thumb(p) : null };
      }),
    };
  });

  // Une photo, pour l'inspecteur (photo arrivée par l'import, ou relue après une modification).
  app.get('/admin/photos/:id/donnees', async (request, reply) => {
    const p = repo.photoView(byId(request.params.id));
    if (!p) return reply.code(404).send({ error: 'Photo introuvable.' });
    return dataOf(withReady(p));
  });

  // ---------- Instagram (voir server/instagram.js) ----------
  // Photos passées de brouillon à publiée : dans la file Instagram si leur série est en mise en file automatique.
  // Et photos repassées en brouillon : retirées de la file (elles ne partiront pas).
  function queued(before) {
    const now = id => repo.photo(Number(id))?.status;
    const up = Object.entries(before).filter(([id, st]) => st === 'draft' && now(id) === 'published').map(([id]) => Number(id));
    const down = Object.entries(before).filter(([id, st]) => st === 'published' && now(id) === 'draft').map(([id]) => Number(id));
    if (up.length) app.instagram.onPublished(up);
    if (down.length) app.instagram.onUnpublished(down);
  }
  const IG_STATE = 'ig_state';
  const igPage = (request, reply, extra = {}) => {
    const ig = app.instagram;
    const s = ig.settings();
    const photos = new Map(repo.photos().map(p => [p.id, p]));
    const withPhoto = list => list.map(x => ({ ...x, photo: photos.get(x.photo_id) && withReady(photos.get(x.photo_id)), caption: ig.captionOf(x, s) })).filter(x => x.photo);
    return render(request, reply, 'instagram', {
      title: 'Instagram', s, FRAMES, DEFAULT_TEMPLATE, categories: repo.categories(),
      conf: { configured: app.config.instagram.configured, https: app.config.instagram.https, redirectUri: app.config.instagram.redirectUri, apiVersion: app.config.instagram.apiVersion },
      account: ig.account.get(), connected: ig.account.connected(),
      queue: withPhoto(ig.queue()), history: withPhoto(ig.history(20)).map(x => ({ ...x, engagement: x.status === 'published' ? ig.engagementOf(x.ig_media_id) : null })),
      mostLiked: withPhoto(ig.mostLiked(10)), engagementState: ig.engagementState(), usage: ig.usage(), IG_PRESETS, IG_BOUNDS, ...extra,
    });
  };
  app.get('/admin/instagram', async (request, reply) => igPage(request, reply));
  // Lever une pause « limite atteinte » à la main (Meta a rendu l'accès plus tôt, réglage changé…).
  app.post('/admin/instagram/reprendre', write, async (request, reply) => { app.instagram.resume(); return done(reply, '/admin/instagram', 'File Instagram reprise.'); });

  // Likes et commentaires relevés à la demande (sinon une fois par jour) ; pas plus d'une fois toutes les 10 minutes.
  app.post('/admin/instagram/likes', write, async (request, reply) => {
    const ig = app.instagram;
    if (!ig.account.connected()) return failed(reply, '/admin/instagram#likes', 'Connectez d’abord le compte Instagram.');
    if (!ig.canSyncNow()) return failed(reply, '/admin/instagram#likes', 'Relevé déjà demandé il y a moins de 10 minutes : réessayez un peu plus tard.');
    try {
      const r = await ig.syncEngagement();
      return done(reply, '/admin/instagram#likes', r.skipped ? 'Aucun post publié depuis le site à relever pour l’instant.' : `Likes et commentaires relevés pour ${r.count} post${r.count > 1 ? 's' : ''}.`);
    } catch (err) {
      return failed(reply, '/admin/instagram#likes', `Relevé impossible : ${err.message}`);
    }
  });

  app.post('/admin/instagram/reglages', write, async (request, reply) => {
    app.instagram.saveSettings(normalizeSettings(request.body || {}, repo.categories()));
    return done(reply, '/admin/instagram#reglages', 'Réglages Instagram enregistrés.');
  });

  // Connexion : redirection vers Instagram, avec un « state » lié à ce navigateur (cookie signé).
  app.get('/admin/instagram/connexion', async (request, reply) => {
    const c = app.config.instagram;
    if (!c.configured) return failed(reply, '/admin/instagram', 'INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET manquent dans la configuration du serveur.');
    if (!c.https) return failed(reply, '/admin/instagram', 'La connexion à Instagram exige que le site soit en HTTPS (PUBLIC_URL).');
    const state = crypto.randomBytes(24).toString('base64url');
    reply.setCookie(IG_STATE, state, { path: '/admin/instagram', httpOnly: true, secure: secureCookies, sameSite: 'lax', signed: true, maxAge: 600 });
    return reply.redirect(app.instagram.authorizeUrl(state), 303);
  });
  app.get('/admin/instagram/callback', async (request, reply) => {
    const raw = request.cookies[IG_STATE];
    reply.clearCookie(IG_STATE, { path: '/admin/instagram' });
    const expected = raw && request.unsignCookie(raw);
    const { code, state, error_description: denied } = request.query;
    if (!expected?.valid || typeof state !== 'string' || !sameToken(state, expected.value)) return failed(reply, '/admin/instagram', 'Connexion refusée : la demande ne vient pas de cet écran ou a expiré. Recommencez.');
    if (!code) return failed(reply, '/admin/instagram', `Connexion annulée${denied ? ` : ${String(denied).slice(0, 200)}` : ''}.`);
    try {
      const username = await app.instagram.connect(String(code));
      return done(reply, '/admin/instagram', `Compte Instagram @${username} connecté.`);
    } catch (err) {
      if (!(err instanceof InstagramError)) throw err;
      return failed(reply, '/admin/instagram', `Connexion impossible : ${err.message}`);
    }
  });
  app.post('/admin/instagram/deconnexion', write, async (request, reply) => {
    app.instagram.account.remove();
    return done(reply, '/admin/instagram', 'Compte Instagram déconnecté (le jeton est effacé ; retirez aussi l’accès dans Instagram si besoin).');
  });

  // Une photo dans la file (ou ses options modifiées) : depuis la fiche ou l'inspecteur.
  app.post('/admin/instagram/file', write, async (request, reply) => {
    const body = request.body || {};
    const json = !request.headers.accept?.includes('text/html');
    const id = byId(body.photo_id);
    const back = safeBack(request, `/admin/photos/${id}#instagram`);
    try {
      // Case « filigrane » : absente du formulaire quand elle est décochée, d'où le champ témoin watermark_set.
      const watermark = body.watermark_set ? body.watermark === 'on' || body.watermark === true : undefined;
      app.instagram.enqueue(id, { frame: body.frame, watermark, caption: body.custom === 'on' || body.custom === true ? body.caption : null });
    } catch (err) {
      if (!(err instanceof InstagramError)) throw err;
      return json ? reply.code(422).send({ error: err.message }) : failed(reply, back, `Instagram : ${err.message}.`);
    }
    return json ? reply.send({ ok: true, text: 'Dans la file Instagram.' }) : done(reply, back, 'Photo dans la file Instagram.');
  });

  for (const [act, label] of [['annuler', 'Retirée de la file Instagram.'], ['monter', null], ['descendre', null], ['reessayer', 'Remise en tête de file.'], ['publier', 'Publiée sur Instagram.']]) {
    app.post(`/admin/instagram/:id/${act}`, write, async (request, reply) => {
      const id = byId(request.params.id);
      const back = safeBack(request, '/admin/instagram');
      if (!app.instagram.post(id)) return reply.callNotFound();
      try {
        if (act === 'annuler') app.instagram.cancel(id);
        else if (act === 'monter' || act === 'descendre') app.instagram.move(id, act === 'monter' ? 'up' : 'down');
        else if (act === 'reessayer') app.instagram.retry(id);
        else await app.instagram.publish(id);
      } catch (err) {
        if (!(err instanceof InstagramError)) throw err;
        return failed(reply, back, `Instagram : ${err.message.replace(/\.$/, '')}.`);
      }
      return label ? done(reply, back, label) : reply.redirect(back, 303);
    });
  }

  // Aperçu exact de l'image envoyée, et légende du modèle (bouton « Revenir au modèle »).
  app.get('/admin/instagram/apercu.jpg', async (request, reply) => {
    const id = byId(request.query.photo);
    if (!repo.photo(id)) return reply.callNotFound();
    const frame = Object.hasOwn(FRAMES, request.query.cadre) ? request.query.cadre : app.instagram.settings().frame;
    const buf = await app.instagram.image(id, { frame, watermark: request.query.filigrane === '1' });
    return reply.header('cache-control', 'no-store').type('image/jpeg').send(buf);
  });
  app.get('/admin/instagram/legende', async (request, reply) => {
    const id = byId(request.query.photo);
    if (!repo.photo(id)) return reply.code(404).send({ error: 'Photo introuvable.' });
    const caption = app.instagram.caption(id);
    return { caption, warnings: captionWarnings(caption) };
  });

  // ---------- statistiques (anonymes, voir server/stats.js) ----------
  const SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const dayLabel = d => `${Number(d.slice(8))} ${SHORT[Number(d.slice(5, 7)) - 1]}`;
  const monthLabel = m => `${SHORT[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  const PERIODS = { 30: '30 jours', 90: '3 mois', 365: '12 mois' };
  const pageLabel = (page, categories, authors) => {
    if (page === 'accueil') return 'Accueil';
    if (page === 'a-propos') return 'À propos';
    if (page === 'droits') return 'Droits d’utilisation';
    if (page === 'carte') return 'Carte';
    const [kind, slug] = page.split(':');
    if (kind === 'serie') return `Série « ${categories.find(c => c.slug === slug)?.name || slug} »`;
    if (kind === 'auteur') return `Regard de ${authors.find(a => a.slug === slug)?.name || slug}`;
    return page;
  };
  const instaOf = photo => {
    const ig = app.instagram;
    const s = ig.settings();
    const post = ig.forPhoto(photo.id);
    const active = post && (post.status === 'queued' || post.status === 'publishing');
    const caption = post?.caption || ig.caption(photo.id, s);
    const engagement = post?.status === 'published' ? ig.engagementOf(post.ig_media_id) : null;
    return { post, active, s, FRAMES, caption, custom: Boolean(post?.caption), warnings: captionWarnings(caption), connected: ig.account.connected(),
      engagement, likesSpark: engagement && engagement.series.length > 1 ? sparkline(engagement.series.map(d => d.likes)) : '',
      slot: active ? ig.queue().find(x => x.id === post.id)?.slot : null };
  };
  const photoStats = id => {
    const { from, to } = app.stats.range(30);
    const s = app.stats.photo(id, from, to);
    return { ...s, spark: sparkline(s.days.map(d => d.views)) };
  };

  app.get('/admin/statistiques', async (request, reply) => {
    const days = PERIODS[request.query.periode] ? Number(request.query.periode) : 30;
    const { from, to } = app.stats.range(days);
    const prev = app.stats.range(days * 2);
    const eve = new Date(`${from}T12:00:00Z`);
    eve.setUTCDate(eve.getUTCDate() - 1);
    const before = app.stats.daily(prev.from, eve.toISOString().slice(0, 10));     // période précédente, même durée
    const daily = app.stats.daily(from, to);
    // 12 mois : regroupés par mois (visiteurs : somme des visiteurs de chaque jour).
    let points = daily.map(d => ({ ...d, label: dayLabel(d.day) }));
    if (days === 365) {
      const months = new Map();
      for (const d of daily) { const m = d.day.slice(0, 7); const o = months.get(m) || { day: m, views: 0, visitors: 0, mobile: 0 }; o.views += d.views; o.visitors += d.visitors; o.mobile += d.mobile; months.set(m, o); }
      points = [...months.values()].map(m => ({ ...m, label: monthLabel(m.day) }));
    }
    const sum = (list, k) => list.reduce((a, d) => a + d[k], 0);
    const totals = { views: sum(daily, 'views'), visitors: sum(daily, 'visitors'), mobile: sum(daily, 'mobile') };
    const previous = { views: sum(before, 'views'), visitors: sum(before, 'visitors') };
    const photoViews = sum(app.stats.topPhotos(from, to, 100000), 'views');
    const all = new Map(repo.photos().map(p => [p.id, p]));
    const categories = repo.categories();
    const authors = repo.authors();
    return render(request, reply, 'stats', {
      title: 'Statistiques', days, PERIODS, from, to, totals, previous, photoViews,
      chart: barsAndLine(points, { labels: [points[0].label, points.at(-1).label] }), points,
      top: app.stats.topPhotos(from, to, 10).map(r => ({ ...r, photo: all.get(r.id) && withReady(all.get(r.id)) })).filter(r => r.photo),
      pages: app.stats.topPages(from, to, 8).map(r => ({ ...r, label: pageLabel(r.page, categories, authors) })),
      sources: app.stats.sources(from, to, 8),
      ...(() => {
        const countries = app.stats.countries(from, to).map(r => ({ ...r, name: countryName(r.country) }));
        return { countries, bubbles: countryBubbles(countries) };
      })(),
    });
  });

  // Audience d'une photo (inspecteur de la photothèque) : 30 derniers jours.
  app.get('/admin/photos/:id/statistiques', async (request, reply) => {
    const id = byId(request.params.id);
    if (!repo.photo(id)) return reply.code(404).send({ error: 'Photo introuvable.' });
    const s = photoStats(id);
    return { total: s.total, rank: s.rank, spark: s.spark, days: s.days.map(d => d.views) };
  });

  // ---------- apparence de l'admin (clair / sombre) ----------
  app.post('/admin/theme', write, async (request, reply) => {
    const theme = request.body?.theme;
    if (theme === 'dark' || theme === 'light') reply.setCookie(THEME_COOKIE, theme, { path: '/admin', httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 365 * 24 * 3600 });
    else reply.clearCookie(THEME_COOKIE, { path: '/admin' });
    if (!request.headers.accept?.includes('text/html')) return { ok: true, theme: theme === 'dark' || theme === 'light' ? theme : '' };
    return reply.redirect(safeBack(request, '/admin'), 303);
  });

  // ---------- palette de commandes (⌘K) : photos et séries ----------
  app.get('/admin/recherche.json', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    return {
      photos: repo.photos().map(p => ({ id: p.id, title: p.title, category: p.category, place: p.place, status: p.status, thumb: rendered(p) ? thumb(p) : null })),
      series: repo.categories().map(c => ({ id: c.id, name: c.name, slug: c.slug, count: c.count })),
    };
  });

  // ---------- compléter un lot ----------
  const lotIds = raw => [...new Set(String([].concat(raw || []).join(',')).split(',').filter(Boolean).map(Number))].filter(Number.isInteger).slice(0, 200);
  const lotPage = (request, reply, ids, extra = {}) => {
    const byIdMap = new Map(repo.photos().map(p => [p.id, withReady(p)]));
    const photos = ids.map(id => byIdMap.get(id)).filter(Boolean);
    return render(request, reply, 'batch', {
      title: 'Compléter et publier', photos, ids: photos.map(p => p.id), categories: repo.categories(), authors: repo.authors(),
      errors: {}, values: {}, ...extra,
    });
  };
  app.get('/admin/photos/lot', async (request, reply) => {
    const ids = lotIds(request.query.ids);
    if (!ids.length) return reply.redirect('/admin/photos?statut=draft', 303);
    return lotPage(request, reply, ids);
  });

  // Sans JavaScript : tout le tableau est envoyé d'un coup (champs titre_<id>, serie_<id>…).
  app.post('/admin/photos/lot', write, async (request, reply) => {
    const body = request.body || {};
    const ids = repo.existingIds(lotIds(body.ids));
    const errors = {};
    const values = {};
    for (const id of ids) {
      const fields = { title: body[`title_${id}`], category_id: body[`category_id_${id}`], place: body[`place_${id}`], taken_on: body[`taken_on_${id}`] };
      for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k];
      try {
        repo.patchPhoto(id, fields);
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        errors[id] = err.errors;
        values[id] = fields;
      }
    }
    app.variants.schedule();
    if (Object.keys(errors).length) return lotPage(request, reply.code(422), ids, { errors, values });
    const to = `/admin/photos/lot?ids=${ids.join(',')}`;
    if (body.publish === '1') {
      const before = repo.setStatuses(Object.fromEntries(ids.map(id => [id, 'published'])));
      queued(before);
      return done(reply, '/admin/photos', `${ids.length} photo${ids.length > 1 ? 's publiées' : ' publiée'}.`);
    }
    return done(reply, to, 'Modifications enregistrées.');
  });

  // Un champ à la fois (enregistrement à la sortie du champ). Réponse : valeurs telles qu'enregistrées.
  app.post('/admin/photos/:id/champs', write, async (request, reply) => {
    const id = byId(request.params.id);
    try {
      const p = repo.patchPhoto(id, request.body || {});
      if (!p) return reply.code(404).send({ error: 'Photo introuvable.' });
      app.variants.schedule();
      const shown = repo.photoView(id);
      return { ok: true, photo: { title: p.title, slug: p.slug, category_id: p.category_id, author_id: p.author_id, place: p.place, legend: p.legend, taken_on: p.taken_on, when: shown?.when || '', provisional: shown?.provisional || false,
        city_id: p.city_id ?? null, city: p.city_name ? cities.label({ name: p.city_name, cc: p.city_cc }) : '', city_source: p.city_source ?? null, on_map: Boolean(p.on_map) } };
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return reply.code(422).send({ errors: err.errors });
    }
  });

  // Villes proposées au fil de la frappe (fiche, photothèque) : liste embarquée, aucun service extérieur.
  app.get('/admin/villes', async request => ({ villes: cities.search(String(request.query.q || '').slice(0, 60), 8).map(c => ({ id: c.id, label: c.label })) }));

  // ---------- actions sur plusieurs photos ----------
  // JSON (barre de sélection) ou formulaire classique. Les réponses JSON portent de quoi annuler.
  app.post('/admin/photos/actions', write, async (request, reply) => {
    const body = request.body || {};
    const json = !request.headers.accept?.includes('text/html');
    const back = safeBack(request, '/admin/photos');
    const ids = repo.existingIds(body.ids);
    const n = ids.length;
    const photosWord = `${n} photo${n > 1 ? 's' : ''}`;
    const ok = (text, extra = {}) => (json ? reply.send({ ok: true, count: n, text, ...extra }) : done(reply, back, text));
    const ko = (code, text) => (json ? reply.code(code).send({ error: text }) : failed(reply, back, text));
    const each = value => Object.fromEntries(ids.map(id => [id, value]));
    const map = raw => { try { return typeof raw === 'string' ? JSON.parse(raw) : raw || {}; } catch { return {}; } };

    try {
      switch (body.action) {
        case 'publish':
        case 'draft': {
          if (!n) return ko(422, 'Aucune photo sélectionnée.');
          const before = repo.setStatuses(each(body.action === 'publish' ? 'published' : 'draft'));
          queued(before);
          const verb = body.action === 'publish' ? 'publiée' : 'repassée en brouillon';
          // Publication en un clic : un titre provisoire (nom du fichier) est rappelé dans le message.
          const prov = body.action === 'publish' ? ids.filter(id => repo.photoView(id)?.provisional).length : 0;
          const note = prov ? ` ${prov === n ? (n > 1 ? 'Elles gardent' : 'Elle garde') : `${prov} garde${prov > 1 ? 'nt' : ''}`} le nom du fichier comme titre : corrigez-le dans la photothèque.` : '';
          return ok(`${photosWord} ${n > 1 ? verb.replace('publiée', 'publiées').replace('repassée', 'repassées') : verb}.${note}`, { undo: { action: 'statuses', map: before } });
        }
        case 'map_on':
        case 'map_off': {
          if (!n) return ko(422, 'Aucune photo sélectionnée.');
          // Sur la carte : seulement les photos qui ont une ville ; les autres sont signalées.
          const before = repo.setOnMap(ids, body.action === 'map_on');
          const changed = Object.keys(before).length;
          const skipped = body.action === 'map_on' ? n - repo.withCity(ids).length : 0;
          const word = c => `${c} photo${c > 1 ? 's' : ''}`;
          const text = body.action === 'map_on'
            ? `${word(changed)} sur la carte.${skipped ? ` ${word(skipped)} sans ville : choisissez sa ville dans la fiche.` : ''}`
            : `${word(changed)} retirée${changed > 1 ? 's' : ''} de la carte.`;
          return ok(text, { undo: { action: 'map_restore', map: before } });
        }
        case 'map_restore': {
          repo.restoreOnMap(map(body.map));
          return ok('Carte rétablie.');
        }
        case 'category': {
          if (!n) return ko(422, 'Aucune photo sélectionnée.');
          // « Nouvelle série… » : créée à la volée.
          const targetId = body.category_id === 'new' ? repo.saveCategory(null, { name: body.new_category }) : Number(body.category_id);
          const target = repo.categories().find(c => c.id === targetId);
          if (!target) return ko(422, 'Choisissez une série.');
          const before = repo.setCategories(each(target.id));
          app.variants.schedule();
          return ok(`${photosWord} ${n > 1 ? 'déplacées' : 'déplacée'} vers « ${target.name} ».`, { undo: { action: 'categories', map: before }, category: { id: target.id, name: target.name } });
        }
        case 'fields': {
          if (!n) return ko(422, 'Aucune photo sélectionnée.');
          const { before, ...v } = repo.setFields(ids, body);
          app.variants.schedule();
          const what = [v.place && `lieu « ${v.place} »`, v.taken_on && 'date'].filter(Boolean).join(' et ');
          return ok(`${what ? `${what.charAt(0).toUpperCase()}${what.slice(1)} appliqué${v.place && v.taken_on ? 's' : ''} à` : 'Rien à changer pour'} ${photosWord}.`, { values: v, undo: { action: 'restore-fields', map: before } });
        }
        case 'restore-fields': {
          repo.restoreFields(map(body.map));
          app.variants.schedule();
          return json ? reply.send({ ok: true, text: 'Modification annulée.' }) : done(reply, back, 'Modification annulée.');
        }
        // Annulations (JSON) : état précédent renvoyé par l'action annulée.
        case 'statuses': {
          const m = map(body.map);
          const undone = repo.setStatuses(Object.fromEntries(Object.entries(m).filter(([id]) => repo.photo(Number(id)))));
          queued(undone);                 // annuler « publier » retire aussi de la file Instagram
          return json ? reply.send({ ok: true, text: 'Action annulée.' }) : done(reply, back, 'Action annulée.');
        }
        case 'categories': {
          const m = map(body.map);
          repo.setCategories(Object.fromEntries(Object.entries(m).filter(([id]) => repo.photo(Number(id)))));
          app.variants.schedule();
          return json ? reply.send({ ok: true, text: 'Déplacement annulé.' }) : done(reply, back, 'Déplacement annulé.');
        }
        case 'delete': {
          if (!n) return ko(422, 'Aucune photo sélectionnée.');
          // Sans confirmation explicite, rien n'est supprimé : page de confirmation (ou refus en JSON).
          if (body.confirm !== '1' && body.confirm !== true) {
            if (json) return ko(422, 'Confirmation requise.');
            return render(request, reply, 'confirm-delete', { title: 'Supprimer des photos', photos: ids.map(id => repo.photo(id)), back });
          }
          for (const id of ids) {
            const file = repo.deletePhoto(id);
            if (file) removePhotoFiles(storageDir, file);
          }
          return ok(`${photosWord} ${n > 1 ? 'supprimées' : 'supprimée'}.`);
        }
        default:
          return ko(400, 'Action inconnue.');
      }
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return ko(422, Object.values(err.errors).join(' '));
    }
  });

  // Réordonnancement par glisser-déposer (fetch JSON, en-tête x-csrf-token).
  app.post('/admin/photos/order', write, async (request, reply) => {
    try {
      repo.orderPhotos(Array.isArray(request.body?.ids) ? request.body.ids : []);
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(422).send({ error: err.errors.order });
      throw err;
    }
    return { ok: true };
  });

  app.get('/admin/photos/:id', async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    return render(request, reply, 'photo', {
      title: photo.title, photo, values: { ...photo, city_label: photo.city_name ? cities.label({ name: photo.city_name, cc: photo.city_cc }) : '' }, errors: {}, categories: repo.categories(), authors: repo.authors(),
      proof: app.proofs.get(photo.id), tsa: app.config.tsa, audience: photoStats(photo.id), insta: instaOf(photo),
    });
  });

  app.post('/admin/photos/:id', write, async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    try {
      repo.updatePhoto(photo.id, request.body || {});
      app.variants.schedule();          // auteur, date, titre ou option de filigrane ont pu changer
      queued({ [photo.id]: photo.status });
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      reply.code(422);
      return render(request, reply, 'photo', {
        title: photo.title, photo, values: { ...photo, ...err.values }, errors: err.errors, categories: repo.categories(), authors: repo.authors(),
        proof: app.proofs.get(photo.id), tsa: app.config.tsa, audience: photoStats(photo.id), insta: instaOf(photo),
      });
    }
    return done(reply, `/admin/photos/${photo.id}`, 'Photo enregistrée.');
  });

  // ---------- preuve d'antériorité ----------
  const ext = file => path.extname(file).slice(1);
  const attachment = (reply, name) => reply.header('cache-control', 'no-store').header('content-disposition', `attachment; filename="${name}"`);

  app.get('/admin/photos/:id/original', async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    return attachment(reply, `${photo.slug}.${ext(photo.file)}`).sendFile(photo.file, path.join(storageDir, 'originals'), { cacheControl: false });
  });

  app.get('/admin/photos/:id/preuve.tsr', async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    const t = photo && app.proofs.get(photo.id);
    if (!t || t.status !== 'ok') return reply.callNotFound();
    return attachment(reply, `${photo.slug}.tsr`).type('application/timestamp-reply').send(t.token);
  });

  app.get('/admin/photos/:id/preuve.txt', async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    const t = photo && app.proofs.get(photo.id);
    if (!t || t.status !== 'ok') return reply.callNotFound();
    const name = `${photo.slug}.${ext(photo.file)}`;
    const ca = app.config.tsa.caFile ? 'autorite-horodatage.pem' : '<certificat racine de l’autorité>';
    const text = [
      `Preuve d'antériorité — « ${photo.title} » (${photo.author})`,
      '',
      `Fichier original      : ${name}`,
      `Empreinte SHA-256     : ${photo.sha256}`,
      `Date certifiée (UTC)  : ${t.gen_time}`,
      `Autorité (TSA)        : ${t.signer}`,
      `Service               : ${t.tsa}`,
      `Numéro de série       : ${t.serial}`,
      '',
      'Le jeton d’horodatage RFC 3161 (fichier .tsr) atteste que le fichier ayant cette empreinte',
      'existait à la date certifiée. Il se vérifie sans le site, avec OpenSSL :',
      '',
      `  sha256sum ${name}`,
      `  openssl ts -reply -in ${photo.slug}.tsr -text`,
      `  openssl ts -verify -in ${photo.slug}.tsr -data ${name} -CAfile ${ca}`,
      '',
      'Conservez ensemble : l’original, le fichier .tsr, cette fiche et le certificat de l’autorité.',
      '',
    ].join('\n');
    return attachment(reply, `${photo.slug}-preuve.txt`).type('text/plain; charset=utf-8').send(text);
  });

  app.get('/admin/preuves/autorite.pem', async (request, reply) => {
    if (!app.config.tsa.caFile) return reply.callNotFound();
    return attachment(reply, 'autorite-horodatage.pem').type('application/x-pem-file').send(fs.readFileSync(app.config.tsa.caFile));
  });

  app.post('/admin/photos/:id/verifier', write, async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    const r = await app.proofs.verify(photo.id);
    const to = `/admin/photos/${photo.id}#preuve`;
    if (!r.ok) return failed(reply, to, `Preuve non valide : ${r.reason}.`);
    const when = r.genTime.toISOString().replace('T', ' à ').slice(0, 21);
    if (!r.chained) return failed(reply, to, `Signature valide (original intact, horodaté le ${when} UTC), mais autorité non vérifiée : aucun certificat racine configuré (TSA_CA_FILE).`);
    return done(reply, to, `Preuve valide : original intact, horodaté le ${when} UTC, signature vérifiée jusqu’à l’autorité racine.`);
  });

  app.post('/admin/preuves/reessayer', write, async (request, reply) => {
    app.proofs.schedule({ retryNow: true });
    return done(reply, safeBack(request, '/admin'), 'Horodatage relancé : les preuves en attente sont redemandées en arrière-plan.');
  });

  app.post('/admin/photos/:id/status', write, async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    repo.setStatus(photo.id, request.body?.status);
    queued({ [photo.id]: photo.status });
    const published = request.body?.status === 'published';
    return done(reply, safeBack(request, '/admin/photos'), `« ${photo.title} » ${published ? 'publiée' : 'repassée en brouillon'}.`);
  });

  app.post('/admin/photos/:id/move', write, async (request, reply) => {
    repo.movePhoto(byId(request.params.id), request.body?.dir);
    return reply.redirect(`/admin/photos?vue=liste#photo-${byId(request.params.id)}`, 303);   // « Monter » et « Descendre » sont dans la vue liste
  });

  app.post('/admin/photos/:id/delete', write, async (request, reply) => {
    const file = repo.deletePhoto(byId(request.params.id));
    if (!file) return reply.callNotFound();
    removePhotoFiles(storageDir, file);
    return done(reply, '/admin/photos', 'Photo supprimée.');
  });

  // ---------- séries ----------
  const seriesPage = (request, reply, extra = {}) => render(request, reply, 'series', {
    title: 'Séries', categories: repo.categories(), covers: Object.fromEntries(Object.entries(repo.covers()).map(([k, p]) => [k, withReady(p)])),
    boards: Object.fromEntries(Object.entries(repo.boards(3)).map(([k, list]) => [k, list.map(withReady).filter(p => p.ready)])), errors: {}, values: {}, ...extra,
  });
  app.get('/admin/series', async (request, reply) => seriesPage(request, reply));

  app.post('/admin/series', write, async (request, reply) => {
    try {
      const id = repo.saveCategory(null, request.body || {});
      return done(reply, `/admin/series#serie-${id}`, `Série « ${repo.categories().find(c => c.id === id).name} » créée.`);
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return seriesPage(request, reply.code(422), { errors: err.errors, values: err.values });
    }
  });

  app.post('/admin/series/:id', write, async (request, reply) => {
    const id = byId(request.params.id);
    if (!repo.categories().some(c => c.id === id)) return reply.callNotFound();
    try {
      repo.saveCategory(id, request.body || {});
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return seriesPage(request, reply.code(422), { editErrors: { id, errors: err.errors, values: err.values } });
    }
    return done(reply, `/admin/series#serie-${id}`, 'Série enregistrée.');
  });

  // Ordre des séries par glisser-déposer ou flèches du clavier (fetch JSON).
  app.post('/admin/series/order', write, async (request, reply) => {
    try {
      repo.orderCategories(Array.isArray(request.body?.ids) ? request.body.ids : []);
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(422).send({ error: err.errors.order });
      throw err;
    }
    return { ok: true };
  });

  app.post('/admin/series/:id/move', write, async (request, reply) => {
    repo.moveCategory(byId(request.params.id), request.body?.dir);
    return reply.redirect(`/admin/series#serie-${byId(request.params.id)}`, 303);
  });

  app.post('/admin/series/:id/delete', write, async (request, reply) => {
    let r;
    try {
      r = repo.deleteCategory(byId(request.params.id), { moveTo: request.body?.move_to });
      if (!r) return reply.callNotFound();
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return failed(reply, '/admin/series', err.errors.delete);
    }
    if (r.moved) app.variants.schedule();
    const target = r.moved ? repo.categories().find(c => c.id === Number(request.body.move_to)) : null;
    return done(reply, '/admin/series', r.moved
      ? `Série « ${r.name} » supprimée ; ${r.moved} photo${r.moved > 1 ? 's déplacées' : ' déplacée'} vers « ${target.name} ».`
      : `Série « ${r.name} » supprimée.`);
  });

  // ---------- auteurs ----------
  const authorsPage = (request, reply, extra = {}) => render(request, reply, 'authors', {
    title: 'Auteurs', authors: repo.authors(), errors: {}, values: {}, ...extra,
  });
  app.get('/admin/auteurs', async (request, reply) => authorsPage(request, reply));

  app.post('/admin/auteurs', write, async (request, reply) => {
    try {
      repo.saveAuthor(null, request.body || {});
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return authorsPage(request, reply.code(422), { errors: err.errors, values: err.values });
    }
    return done(reply, '/admin/auteurs', 'Auteur ajouté.');
  });

  app.post('/admin/auteurs/:id', write, async (request, reply) => {
    const id = byId(request.params.id);
    if (!repo.authors().some(a => a.id === id)) return reply.callNotFound();
    try {
      repo.saveAuthor(id, request.body || {});
      app.variants.schedule();          // le nom de l'auteur peut figurer dans le filigrane et l'EXIF
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return authorsPage(request, reply.code(422), { editErrors: { id, errors: err.errors, values: err.values } });
    }
    return done(reply, '/admin/auteurs', 'Auteur enregistré.');
  });

  app.post('/admin/auteurs/:id/delete', write, async (request, reply) => {
    try {
      if (!repo.deleteAuthor(byId(request.params.id))) return reply.callNotFound();
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return failed(reply, '/admin/auteurs', err.errors.delete);
    }
    return done(reply, '/admin/auteurs', 'Auteur supprimé.');
  });

  // ---------- images : filigrane et métadonnées ----------
  const firstPhotoId = () => repo.photos({ status: 'published' })[0]?.id ?? repo.photos()[0]?.id;
  const imagesPage = (request, reply) => {
    const { watermark, exif } = app.variants.context();
    return render(request, reply, 'images', {
      title: 'Filigrane et métadonnées', watermark, exif, FONTS, POSITIONS, KINDS, TONE_LABELS, EXIF_MODES, MIN_WIDTHS, brand: app.appearance.brand(),
      photos: repo.photos(), previewId: Number(request.query.photo) || firstPhotoId(),
    });
  };
  app.get('/admin/images', imagesPage);

  app.post('/admin/images', write, async (request, reply) => {
    const { watermark: current } = app.variants.context();
    const watermark = normalizeWatermark(request.body || {}, current);
    repo.saveImageSettings(watermark, normalizeExif(request.body || {}));
    app.variants.schedule();
    const brand = app.appearance.brand();
    const note = !watermark.enabled ? ''
      : watermark.kind === 'image' && !watermark.image ? ' Aucun logo envoyé : pas de filigrane pour l’instant.'
        : (watermark.kind === 'emblem' || watermark.kind === 'logotype') && !brand[watermark.kind] ? ' Ce dessin n’est pas encore envoyé dans Apparence : pas de filigrane pour l’instant.' : '';
    return done(reply, '/admin/images', `Réglages enregistrés, images en cours de mise à jour.${note}`);
  });

  const sendPreview = async (reply, id, override) => {
    const buf = await app.variants.preview(id, override);
    if (!buf) return reply.callNotFound();
    return reply.header('cache-control', 'no-store').type('image/webp').send(buf);
  };
  // Aperçu des réglages enregistrés (affiché sur la page).
  app.get('/admin/images/apercu.webp', async (request, reply) => sendPreview(reply, byId(request.query.photo || firstPhotoId())));
  // Aperçu des réglages du formulaire, sans les enregistrer (bouton « Aperçu »).
  app.post('/admin/images/apercu', write, async (request, reply) => {
    const { watermark: current } = app.variants.context();
    return sendPreview(reply, byId(request.body?.preview_photo), { watermark: { ...normalizeWatermark(request.body || {}, current), enabled: true } });
  });

  app.get('/admin/images/etat', async () => app.variants.status());

  app.get('/admin/images/logo', async (request, reply) => {
    const { watermark } = app.variants.context();
    if (!watermark.image) return reply.callNotFound();
    return reply.header('cache-control', 'no-store').sendFile(watermark.image, app.variants.watermarkDir);
  });

  // Logo : PNG ou WebP, réencodé en PNG (aucune donnée du fichier envoyé n'est servie telle quelle).
  app.post('/admin/images/logo', async (request, reply) => {
    let checked = false;
    let error = null;
    let saved = null;
    try {
      for await (const part of request.parts({ limits: { fileSize: LOGO_MAX_BYTES, files: 1 } })) {
        if (part.type === 'field') {
          if (part.fieldname === '_csrf') checked = sameToken(part.value, request.session.csrf);
          continue;
        }
        if (!checked) { part.file.resume(); break; }
        const chunks = [];
        for await (const chunk of part.file) chunks.push(chunk);
        if (part.file.truncated) { error = 'Logo trop lourd (5 Mo au plus).'; continue; }
        const buf = Buffer.concat(chunks);
        let meta;
        try { meta = await sharp(buf, { limitInputPixels: LOGO_MAX_SIDE * LOGO_MAX_SIDE }).metadata(); } catch { meta = null; }
        if (!meta || !['png', 'webp'].includes(meta.format)) { error = 'Le logo doit être une image PNG ou WebP (de préférence à fond transparent).'; continue; }
        if (meta.width > LOGO_MAX_SIDE || meta.height > LOGO_MAX_SIDE) { error = `Logo trop grand (${LOGO_MAX_SIDE} px de côté au plus).`; continue; }
        if (Math.min(meta.width, meta.height) < 8 || Math.max(meta.width, meta.height) > 10 * Math.min(meta.width, meta.height)) {
          error = 'Logo trop étiré ou trop petit (8 px de côté au moins, rapport largeur/hauteur de 10 au plus).'; continue;
        }
        saved = `${crypto.randomUUID()}.png`;
        // Écrit sous un nom provisoire (« .part », jamais effacé par le ménage d'un passage en cours),
        // puis renommé au moment même où les réglages le désignent (sans attente entre les deux).
        await sharp(buf).png().toFile(path.join(app.variants.watermarkDir, `${saved}.part`));
      }
    } catch (err) {
      if (!err.code?.startsWith('FST_')) throw err;
      error = 'Envoi invalide.';
    }
    if (!checked) return reply.code(403).send('Jeton CSRF invalide.');
    if (!saved) return failed(reply, '/admin/images', error || 'Aucun fichier reçu.');
    // L'ancien logo n'est pas effacé ici : un passage en cours l'utilise peut-être ; le ménage de fin de passage s'en charge.
    const { watermark, exif } = app.variants.context();
    repo.saveImageSettings({ ...watermark, image: saved }, exif);
    fs.renameSync(path.join(app.variants.watermarkDir, `${saved}.part`), path.join(app.variants.watermarkDir, saved));
    app.variants.schedule();
    return done(reply, '/admin/images', 'Logo enregistré.');
  });

  app.post('/admin/images/logo/delete', write, async (request, reply) => {
    const { watermark, exif } = app.variants.context();
    repo.saveImageSettings({ ...watermark, image: null }, exif);
    app.variants.schedule();
    return done(reply, '/admin/images', 'Logo supprimé.');
  });

  // ---------- apparence : thème et marque ----------
  const brandDir = path.join(storageDir, 'brand');
  fs.mkdirSync(brandDir, { recursive: true });
  const saveBrand = brand => repo.saveSetting('brand', brand);

  app.get('/admin/apparence', async (request, reply) => render(request, reply, 'appearance', {
    title: 'Apparence', THEMES, BRAND_MODES, BRAND_SLOTS, themeId: app.appearance.themeId(), brand: app.appearance.brand(),
  }));

  app.post('/admin/apparence', write, async (request, reply) => {
    const body = request.body || {};
    if (THEMES[body.theme]) repo.saveSetting('theme', body.theme);
    const brand = app.appearance.brand();
    saveBrand({
      ...brand,
      mode: BRAND_MODES[body.brand_mode] ? body.brand_mode : brand.mode,
      subtitle: typeof body.subtitle === 'string' ? body.subtitle.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 60) : brand.subtitle,
    });
    return done(reply, '/admin/apparence', 'Apparence enregistrée.');
  });

  // Marque : quatre emplacements (emblème, icône, logo complet, image de partage). PNG, WebP ou JPEG ;
  // jeton CSRF avant le fichier ; fichiers aux noms versionnés, l'ancien est effacé au remplacement.
  const PROCESS = { mask: processEmblem, icon: processIcon, share: processShare };
  const brandFiles = b => [b.emblem, b.icon, b.logotype, b.share, b.favicon64, b.favicon180].filter(Boolean);
  const sweepBrand = b => { const keep = new Set(brandFiles(b).flatMap(f => [f, `${f}.source`])); for (const f of fs.readdirSync(brandDir)) if (!keep.has(f)) fs.rmSync(path.join(brandDir, f), { force: true }); };
  // Les icônes d'onglet viennent de l'icône simplifiée si elle existe, sinon de l'emblème.
  async function faviconsFrom(b, id) {
    const source = b.icon || b.emblem;
    if (!source) return { favicon64: null, favicon180: null };
    const original = path.join(brandDir, `${source}.source`);
    const input = fs.readFileSync(fs.existsSync(original) ? original : path.join(brandDir, source));   // à défaut, le masque lui-même
    const made = await (b.icon ? processIcon : processEmblem)(input);
    const files = { favicon64: `favicon-${id}-64.png`, favicon180: `favicon-${id}-180.png` };
    fs.writeFileSync(path.join(brandDir, files.favicon64), made.favicon64);
    fs.writeFileSync(path.join(brandDir, files.favicon180), made.favicon180);
    return files;
  }

  app.post('/admin/apparence/marque/:slot', async (request, reply) => {
    const slot = BRAND_SLOTS[request.params.slot];
    if (!slot) return reply.callNotFound();
    let checked = false;
    let error = null;
    let upload = null;
    try {
      for await (const part of request.parts({ limits: { fileSize: EMBLEM_MAX_BYTES, files: 1 } })) {
        if (part.type === 'field') {
          if (part.fieldname === '_csrf') checked = sameToken(part.value, request.session.csrf);
          continue;
        }
        if (!checked) { part.file.resume(); break; }
        const chunks = [];
        for await (const chunk of part.file) chunks.push(chunk);
        if (part.file.truncated) { error = `Image trop lourde (${EMBLEM_MAX_BYTES / 1024 / 1024} Mo au plus).`; continue; }
        upload = Buffer.concat(chunks);
      }
    } catch (err) {
      if (!err.code?.startsWith('FST_')) throw err;
      error = 'Envoi invalide.';
    }
    if (!checked) return reply.code(403).send('Jeton CSRF invalide.');
    let made = null;
    if (upload) {
      try {
        made = await PROCESS[slot.kind](upload);
      } catch (err) {
        if (!(err instanceof BrandError)) throw err;
        error = `${slot.label} refusé : ${err.message}.`;
      }
    }
    if (!made) return failed(reply, '/admin/apparence', error || 'Aucun fichier reçu.');

    const id = crypto.randomUUID().slice(0, 8);
    const file = `${request.params.slot}-${id}.${slot.kind === 'share' ? 'jpg' : 'png'}`;
    fs.writeFileSync(path.join(brandDir, file), slot.kind === 'share' ? made.image : made.mask);
    // Original conservé (privé, jamais servi) pour régénérer les icônes d'onglet.
    if (slot.kind !== 'share') fs.writeFileSync(path.join(brandDir, `${file}.source`), upload);
    let brand = { ...app.appearance.brand(), [slot.field]: file };
    if (slot.ratio) brand[slot.ratio] = Math.round((made.width / made.height) * 1000) / 1000;
    if (slot.field === 'emblem' || slot.field === 'icon') {
      brand = { ...brand, ...(await faviconsFrom(brand, id)), mode: 'embleme' };
    }
    saveBrand(brand);
    sweepBrand(brand);
    app.variants.schedule();            // le dessin peut servir de filigrane
    return done(reply, '/admin/apparence', `${slot.label} enregistré.`);
  });

  app.post('/admin/apparence/marque/:slot/delete', write, async (request, reply) => {
    const slot = BRAND_SLOTS[request.params.slot];
    if (!slot) return reply.callNotFound();
    let brand = { ...app.appearance.brand(), [slot.field]: null };
    if (slot.ratio) brand[slot.ratio] = null;
    if (slot.field === 'emblem' || slot.field === 'icon') {
      brand = { ...brand, ...(await faviconsFrom(brand, crypto.randomUUID().slice(0, 8))) };
      if (!brand.emblem && !brand.icon) brand.mode = 'texte';
    }
    saveBrand(brand);
    sweepBrand(brand);
    app.variants.schedule();
    return done(reply, '/admin/apparence', `${slot.label} retiré.`);
  });

  // ---------- aide en ligne ----------
  // Relue à chaque affichage en développement (édition de docs/aide), une fois pour toutes en production.
  let help = app.config.production ? loadHelp() : null;
  app.get('/admin/aide', async (request, reply) => render(request, reply, 'help', { title: 'Aide', help: help || loadHelp() }));

  // ---------- traductions ----------
  // Proposition de traduction d'un champ (LibreTranslate du réseau local) : l'auteur la relit avant d'enregistrer.
  app.post('/admin/traduction', write, async (request, reply) => {
    const { text, source, target } = request.body || {};
    try {
      return { text: await app.translator.translate(String(text || '').slice(0, 20000), String(source), String(target)) };
    } catch (err) {
      if (!(err instanceof TranslateError)) throw err;
      return reply.code(422).send({ error: err.message });
    }
  });

  // ---------- réglages ----------
  const mapCounts = app.db.prepare("SELECT COUNT(*) AS mapCount, COUNT(DISTINCT city_id) AS mapCities FROM photos WHERE status = 'published' AND on_map = 1 AND city_id IS NOT NULL");
  const defaultsNow = () => rightsDefaults(repo.authors().map(a => a.name), app.siteName());
  app.get('/admin/reglages', async (request, reply) => render(request, reply, 'settings', {
    heroMax: 8,
    title: 'Réglages', settings: repo.settings(), published: repo.photos({ status: 'published' }), defaultName: app.config.siteName,
    rights: LANGS.map(l => ({ lang: l, ...RIGHTS[l] })), rightsDefaults: defaultsNow(),
    ...mapCounts.get(),
  }));

  app.post('/admin/reglages', write, async (request, reply) => {
    repo.saveSettings(withoutDefaults(request.body || {}, defaultsNow()));
    app.variants.schedule();            // {site} peut figurer dans le filigrane
    if (request.body?.hero_op || request.body?.hero_save) return done(reply, '/admin/reglages#ouverture', 'Ordre de l’ouverture enregistré.');
    return done(reply, '/admin/reglages', 'Réglages enregistrés.');
  });
}

// Retour à la liste filtrée d'où vient le formulaire (champ « back »), toujours dans l'admin.
function safeBack(request, fallback) {
  const back = safeNext(request.body?.back, fallback);
  return /^\/admin(\/|\?|#|$)/.test(back) ? back : fallback;
}
