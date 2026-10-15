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
import { registerEncounters } from './rencontres.js';
import { registerOutings } from './sorties.js';
import { ADMIN_LANGS, ADMIN_LANG_NAMES, translator } from '../admin-i18n.js';
import { monthYear } from '../format.js';
import { legalMissing } from '../legal.js';

// Carte des visiteurs (page Statistiques) : centre de chaque pays dans le repère 1000 × 520 du fond de carte
// (public/admin/carte-monde.svg, généré par scripts/carte-monde.mjs), nom du pays en français.
const COUNTRY_CENTRES = JSON.parse(fs.readFileSync(new URL('../pays-centres.json', import.meta.url), 'utf8'));
const REGION_NAMES = Object.fromEntries(ADMIN_LANGS.map(l => [l, new Intl.DisplayNames([l], { type: 'region' })]));
const countryName = (code, t) => { if (code === 'XX') return t('Pays inconnu'); try { return (REGION_NAMES[t.lang] || REGION_NAMES.fr).of(code) || code; } catch { return code; } };
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
  // Langue de l'admin : celle du photographe lié au compte, sinon le cookie du compte, sinon le français.
  // request.t traduit (voir server/admin-i18n.js) ; elle sert aux pages et aux messages après redirection.
  const LANG_COOKIE = 'admin_langue';
  app.decorateRequest('t', null);
  app.addHook('preHandler', async request => {
    if (!request.session) return;
    const author = repo.authorBySub(request.session.sub);
    const lang = ADMIN_LANGS.includes(author?.admin_lang) ? author.admin_lang : ADMIN_LANGS.includes(request.cookies[LANG_COOKIE]) ? request.cookies[LANG_COOKIE] : 'fr';
    request.t = translator(lang);
  });
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
      translate: app.translator.enabled, encountersNew: app.encounters.countNew(), urgent: app.todo.urgentCount(), description: '',
      t: request.t, lang: request.t.lang, locale: request.t.locale, adminLangs: ADMIN_LANGS, langNames: ADMIN_LANG_NAMES,
      ...data, pageTitle: `${data.title} · ${request.t('Administration')} · ${siteName}`,
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
    thumb: p.ready ? thumb(p) : null, large: p.ready ? large(p) : null, suggest: p.suggest || [],
  });
  // Séries proposées (server/series-suggest.js) avec leur nom ; thumbs : vignettes des photos voisines (fiche).
  const catNames = () => new Map(repo.categories().map(c => [c.id, c.name]));
  const suggestOf = (list, names = catNames(), thumbs = false) => (list || []).map(x => ({ id: x.category_id, name: names.get(x.category_id) || '', votes: x.votes, size: x.size,
    ...(thumbs ? { like: x.like.map(id => withReady(repo.photo(id))).filter(q => q?.ready).map(q => ({ id: q.id, title: q.title, thumb: thumb(q) })) } : {}) }));
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
      title: request.t('Aujourd’hui'), tasks: app.todo.list(request.t),
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
    // Ce qui manque (liens d'« Aujourd'hui ») : ville (carte du monde) ou traduction du titre, photos publiées.
    // État pour le site (server/readiness.js) : à vérifier, bloquée, sans visage.
    const stateOf = new Map(), people = new Map();
    const st = p => { if (!stateOf.has(p.id)) stateOf.set(p.id, app.readiness.state(p, people, request.t)); return stateOf.get(p.id); };
    const all = repo.photos();
    const sugg = app.seriesSuggest.forPhotos(all), names = catNames();
    const MISSING = { ville: { label: request.t('Publiées sans ville'), test: p => p.status === 'published' && p.city_id == null },
      traduction: { label: request.t('Titres sans traduction'), test: p => p.status === 'published' && (!p.title_en || !p.title_de) },
      verifier: { label: request.t('▲ À vérifier'), test: p => st(p).site.level === 'warn' && !app.readiness.confirmed(p.id, 'site', st(p)) },
      bloquee: { label: request.t('✕ Bloquées'), test: p => st(p).site.level === 'no' },
      'sans-visage': { label: request.t('Sans visage'), test: p => !st(p).faces.has },
      proposee: { label: request.t('✦ Série proposée'), test: p => sugg.has(p.id) } };
    const missing = Object.hasOwn(MISSING, request.query.manque) ? request.query.manque : '';
    // « À finir » : brouillons et titres provisoires.
    const todo = statut === 'afinir';
    const filter = { q: String(q), author: String(auteur), category: String(serie), status: STATUSES[statut] ? statut : '' };
    const authors = repo.authors();
    // Mois de prise de vue dans la langue de l'admin (« oct. 2026 », « Oct 2026 », « Okt. 2026 »).
    let photos = repo.photos(filter).map(p => withReady({ ...p, when: monthYear(p.taken_on, request.t.lang) }));
    if (todo) photos = photos.filter(p => p.status === 'draft' || p.provisional);
    if (missing) photos = photos.filter(MISSING[missing].test);
    photos = photos.map(p => ({ ...p, site: st(p).site, suggest: suggestOf(sugg.get(p.id), names) }));
    // Données de l'inspecteur (une photo choisie) : lues par admin.js, jamais exécutées.
    const data = photos.map(dataOf);
    return render(request, reply, 'photos', {
      title: request.t('Photothèque'), photos, filter, authors, categories: repo.categories(), ratioClass,
      json: JSON.stringify(data).replace(/</g, '\\u003c'),
      filtered: Boolean(filter.q || filter.author || filter.category || filter.status || todo || missing), todo,
      missing: missing ? { key: missing, label: MISSING[missing].label } : null,
      totals: { all: all.length, published: all.filter(p => p.status === 'published').length, draft: all.filter(p => p.status === 'draft').length,
        todo: all.filter(p => p.status === 'draft' || p.provisional).length,
        verifier: all.filter(MISSING.verifier.test).length, bloquee: all.filter(MISSING.bloquee.test).length, 'sans-visage': all.filter(MISSING['sans-visage'].test).length, proposee: sugg.size },
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
          return finish(403, { error: request.t('Jeton CSRF invalide.') }) ?? reply.code(403).send(request.t('Jeton CSRF invalide.'));
        }
        const categoryId = Number(fields.category_id);
        const authorId = Number(fields.author_id);
        if (!repo.categories().some(c => c.id === categoryId) || !repo.authors().some(a => a.id === authorId)) {
          part.file.resume();
          refused.push({ name: part.filename, reason: request.t('série ou auteur invalide') });
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
          refused.push({ name: part.filename, reason: request.t('fichier trop lourd ({n} Mo au plus)', { n: MAX_FILE_BYTES / 1024 / 1024 }) });
          continue;
        }
        let id = null;
        let original = null;
        try {
          original = await importOriginal(storageDir, tmp);
          id = repo.addPhoto({ title: titleFromFilename(part.filename), categoryId, authorId, sourceName: part.filename, ...original });
          await app.variants.renderPhoto(id);
          await app.faces.examine(id);
          app.seriesSuggest.examine(id);
          imported.push({ id, name: part.filename });
        } catch (err) {
          // Rien ne reste d'une image qui n'a pas pu être rendue : ni ligne, ni original, ni variante.
          if (id) repo.deletePhoto(id);
          if (original) removePhotoFiles(storageDir, original.file);
          if (err instanceof ImportError) refused.push({ name: part.filename, reason: request.t(err.message) });
          else {
            request.log.warn({ err, file: part.filename }, 'rendu impossible à l’import');
            refused.push({ name: part.filename, reason: request.t('image illisible ou format non pris en charge par le serveur') });
          }
        }
      }
    } catch (err) {
      if (err.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return reply.code(400).send({ error: request.t('Envoi multipart attendu.') });
      if (err.code !== 'FST_FILES_LIMIT' && err.code !== 'FST_PARTS_LIMIT') throw err;
      refused.push({ name: '…', reason: request.t('{n} fichiers au plus par envoi', { n: MAX_FILES }) });
    }

    if (!checked) return finish(403, { error: request.t('Jeton CSRF invalide.') }) ?? reply.code(403).send(request.t('Jeton CSRF invalide.'));
    request.log.info({ imported: imported.length, refused: refused.length }, 'import de photos');
    if (imported.length) app.proofs.schedule();          // horodatage des nouveaux originaux
    if (wantsJson) return reply.send({ imported, refused });
    const details = refused.map(r => request.t('{name} : {reason}', { name: r.name, reason: r.reason }));
    const text = refused.length ? request.t('{n} photo(s) importée(s) en brouillon, {r} refusée(s).', { n: imported.length, r: refused.length })
      : request.t('{n} photo(s) importée(s) en brouillon.', { n: imported.length });
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
          refuse(422, request.t('série ou auteur invalide'));
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
          refuse(413, request.t('trop lourde ({n} Mo au plus)', { n: MAX_FILE_BYTES / 1024 / 1024 }));
          continue;
        }
        try {
          const original = await importOriginal(storageDir, tmp);
          const title = titleFromFilename(part.filename);
          const id = repo.addPhoto({ title, categoryId, authorId, sourceName: part.filename, ...original });
          await app.faces.examine(id);
          app.seriesSuggest.examine(id);
          tracker.add(id, part.filename);
          result = { code: 200, id, title };
        } catch (err) {
          if (!(err instanceof ImportError)) throw err;
          refuse(422, request.t(err.message));
        }
      }
    } catch (err) {
      if (err.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return reply.code(400).send({ error: request.t('Envoi multipart attendu.') });
      if (err.code !== 'FST_FILES_LIMIT' && err.code !== 'FST_PARTS_LIMIT') throw err;
    }
    if (!checked) return reply.code(403).send({ error: request.t('Jeton CSRF invalide.') });
    if (!result) return reply.code(400).send({ error: request.t('Aucun fichier reçu.') });
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
    if (!p) return reply.code(404).send({ error: request.t('Photo introuvable.') });
    return dataOf(withReady({ ...p, suggest: suggestOf(app.seriesSuggest.forPhoto(repo.photo(p.id))) }));
  });

  // Série proposée : la prendre (category_id) ou garder la série actuelle (garder=1). JSON ou formulaire (fiche,
  // sortie) ; dans les deux cas, la série est désormais choisie et la proposition disparaît.
  app.post('/admin/photos/:id/serie', write, async (request, reply) => {
    const id = byId(request.params.id);
    const photo = repo.photo(id);
    const json = !request.headers.accept?.includes('text/html');
    const back = safeBack(request, `/admin/photos/${id}`);
    if (!photo) return json ? reply.code(404).send({ error: request.t('Photo introuvable.') }) : reply.callNotFound();
    const body = request.body || {};
    let text;
    if (body.garder === '1') {
      repo.keepSeries(id);
      text = request.t('« {title} » reste dans « {name} ».', { title: photo.title, name: photo.category });
    } else {
      const target = repo.categories().find(c => c.id === Number(body.category_id));
      if (!target) return json ? reply.code(422).send({ error: request.t('Série inconnue.') }) : failed(reply, back, request.t('Série inconnue.'));
      repo.setCategories({ [id]: target.id });
      text = request.t('« {title} » classée dans « {name} ».', { title: photo.title, name: target.name });
    }
    return json ? { ok: true, text, category_id: repo.photo(id).category_id } : done(reply, back, text);
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
      title: request.t('Instagram'), s, FRAMES, DEFAULT_TEMPLATE, categories: repo.categories(),
      conf: { configured: app.config.instagram.configured, https: app.config.instagram.https, redirectUri: app.config.instagram.redirectUri, apiVersion: app.config.instagram.apiVersion },
      account: ig.account.get(), connected: ig.account.connected(),
      queue: withPhoto(ig.queue()), history: withPhoto(ig.history(20)).map(x => ({ ...x, engagement: x.status === 'published' ? ig.engagementOf(x.ig_media_id) : null })),
      mostLiked: withPhoto(ig.mostLiked(10)), engagementState: ig.engagementState(), usage: ig.usage(), IG_PRESETS, IG_BOUNDS, ...extra,
    });
  };
  app.get('/admin/instagram', async (request, reply) => igPage(request, reply));
  // Lever une pause « limite atteinte » à la main (Meta a rendu l'accès plus tôt, réglage changé…).
  app.post('/admin/instagram/reprendre', write, async (request, reply) => { app.instagram.resume(); return done(reply, '/admin/instagram', request.t('File Instagram reprise.')); });

  // Likes et commentaires relevés à la demande (sinon une fois par jour) ; pas plus d'une fois toutes les 10 minutes.
  app.post('/admin/instagram/likes', write, async (request, reply) => {
    const ig = app.instagram;
    if (!ig.account.connected()) return failed(reply, '/admin/instagram#likes', request.t('Connectez d’abord le compte Instagram.'));
    if (!ig.canSyncNow()) return failed(reply, '/admin/instagram#likes', request.t('Relevé déjà demandé il y a moins de 10 minutes : réessayez un peu plus tard.'));
    try {
      const r = await ig.syncEngagement();
      return done(reply, '/admin/instagram#likes', r.skipped ? request.t('Aucun post publié depuis le site à relever pour l’instant.')
        : r.count > 1 ? request.t('Likes et commentaires relevés pour {n} posts.', { n: r.count }) : request.t('Likes et commentaires relevés pour {n} post.', { n: r.count }));
    } catch (err) {
      return failed(reply, '/admin/instagram#likes', request.t('Relevé impossible : {error}', { error: request.t(err.message) }));
    }
  });

  app.post('/admin/instagram/reglages', write, async (request, reply) => {
    app.instagram.saveSettings(normalizeSettings(request.body || {}, repo.categories()));
    return done(reply, '/admin/instagram#reglages', request.t('Réglages Instagram enregistrés.'));
  });

  // Connexion : redirection vers Instagram, avec un « state » lié à ce navigateur (cookie signé).
  app.get('/admin/instagram/connexion', async (request, reply) => {
    const c = app.config.instagram;
    if (!c.configured) return failed(reply, '/admin/instagram', request.t('INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET manquent dans la configuration du serveur.'));
    if (!c.https) return failed(reply, '/admin/instagram', request.t('La connexion à Instagram exige que le site soit en HTTPS (PUBLIC_URL).'));
    const state = crypto.randomBytes(24).toString('base64url');
    reply.setCookie(IG_STATE, state, { path: '/admin/instagram', httpOnly: true, secure: secureCookies, sameSite: 'lax', signed: true, maxAge: 600 });
    return reply.redirect(app.instagram.authorizeUrl(state), 303);
  });
  app.get('/admin/instagram/callback', async (request, reply) => {
    const raw = request.cookies[IG_STATE];
    reply.clearCookie(IG_STATE, { path: '/admin/instagram' });
    const expected = raw && request.unsignCookie(raw);
    const { code, state, error_description: denied } = request.query;
    if (!expected?.valid || typeof state !== 'string' || !sameToken(state, expected.value)) return failed(reply, '/admin/instagram', request.t('Connexion refusée : la demande ne vient pas de cet écran ou a expiré. Recommencez.'));
    if (!code) return failed(reply, '/admin/instagram', denied ? request.t('Connexion annulée : {reason}.', { reason: String(denied).slice(0, 200) }) : request.t('Connexion annulée.'));
    try {
      const username = await app.instagram.connect(String(code));
      return done(reply, '/admin/instagram', request.t('Compte Instagram @{username} connecté.', { username }));
    } catch (err) {
      if (!(err instanceof InstagramError)) throw err;
      return failed(reply, '/admin/instagram', request.t('Connexion impossible : {error}', { error: request.t(err.message) }));
    }
  });
  app.post('/admin/instagram/deconnexion', write, async (request, reply) => {
    app.instagram.account.remove();
    return done(reply, '/admin/instagram', request.t('Compte Instagram déconnecté (le jeton est effacé ; retirez aussi l’accès dans Instagram si besoin).'));
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
      // Signature du photographe : gardée sur la photo (la légende du post est recalculée à l'envoi).
      if (body.signature_set) app.db.prepare('UPDATE photos SET ig_signature = ? WHERE id = ?').run(body.signature === 'on' || body.signature === true ? 1 : 0, id);
      app.instagram.enqueue(id, { frame: body.frame, watermark, caption: body.custom === 'on' || body.custom === true ? body.caption : null,
        confirmed: body.confirmer === '1' || body.confirmer === true, byName: request.session.name });
    } catch (err) {
      if (!(err instanceof InstagramError)) throw err;
      return json ? reply.code(422).send({ error: request.t(err.message) }) : failed(reply, back, request.t('Instagram : {error}.', { error: request.t(err.message) }));
    }
    return json ? reply.send({ ok: true, text: request.t('Dans la file Instagram.') }) : done(reply, back, request.t('Photo dans la file Instagram.'));
  });

  for (const [act, label] of [['annuler', t => t('Retirée de la file Instagram.')], ['monter', null], ['descendre', null], ['reessayer', t => t('Remise en tête de file.')], ['publier', t => t('Publiée sur Instagram.')]]) {
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
        return failed(reply, back, request.t('Instagram : {error}.', { error: request.t(err.message).replace(/\.$/, '') }));
      }
      return label ? done(reply, back, label(request.t)) : reply.redirect(back, 303);
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
    if (!repo.photo(id)) return reply.code(404).send({ error: request.t('Photo introuvable.') });
    const caption = app.instagram.caption(id);
    return { caption, warnings: captionWarnings(caption) };
  });

  // ---------- statistiques (anonymes, voir server/stats.js) ----------
  const short = t => [t('janv.'), t('févr.'), t('mars'), t('avr.'), t('mai'), t('juin'), t('juil.'), t('août'), t('sept.'), t('oct.'), t('nov.'), t('déc.')];
  const dayLabel = (d, t) => t('{day} {month}', { day: Number(d.slice(8)), month: short(t)[Number(d.slice(5, 7)) - 1] });
  const monthLabel = (m, t) => `${short(t)[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  const PERIODS = { 30: '30 jours', 90: '3 mois', 365: '12 mois' };
  const periods = t => ({ 30: t('30 jours'), 90: t('3 mois'), 365: t('12 mois') });
  const pageLabel = (page, categories, authors, t) => {
    if (page === 'accueil') return t('Accueil');
    if (page === 'a-propos') return t('À propos');
    if (page === 'droits') return t('Droits d’utilisation');
    if (page === 'carte') return t('Carte');
    if (page === 'confidentialite') return t('Confidentialité');
    if (page === 'bonjour') return t('Je vous ai photographié (/bonjour)');
    const [kind, slug] = page.split(':');
    if (kind === 'serie') return t('Série « {name} »', { name: categories.find(c => c.slug === slug)?.name || slug });
    if (kind === 'auteur') return t('Regard de {name}', { name: authors.find(a => a.slug === slug)?.name || slug });
    return page;
  };
  const instaOf = photo => {
    const ig = app.instagram;
    const s = ig.settings();
    const post = ig.forPhoto(photo.id);
    const active = post && (post.status === 'queued' || post.status === 'publishing');
    const caption = post?.caption || ig.caption(photo.id, s);
    const engagement = post?.status === 'published' ? ig.engagementOf(post.ig_media_id) : null;
    const signature = repo.authors().find(a => a.id === photo.author_id)?.ig_signature || '';
    return { post, active, s, FRAMES, caption, signature, blocked: ig.blocked(photo.id), custom: Boolean(post?.caption), warnings: captionWarnings(caption), connected: ig.account.connected(),
      engagement, likesSpark: engagement && engagement.series.length > 1 ? sparkline(engagement.series.map(d => d.likes)) : '',
      slot: active ? ig.queue().find(x => x.id === post.id)?.slot : null };
  };
  // Ce que la fiche montre en plus du formulaire : audience, Instagram, personnes, sortie, état et confirmations.
  const photoExtras = (photo, t) => ({
    proof: app.proofs.get(photo.id), tsa: app.config.tsa, audience: photoStats(photo.id), shares: app.shares.forPhoto(photo.id), insta: instaOf(photo), encounters: app.encounters.forPhoto(photo.id),
    outingUrl: app.outings.urlOf(photo.author_id, photo.taken_on, photo.taken_time),
    suggest: suggestOf(app.seriesSuggest.forPhoto(repo.photo(photo.id)), undefined, true),
    ready: app.readiness.state(photo.id, null, t), confirmations: app.readiness.confirmations(photo.id), igConfirmed: app.readiness.confirmed(photo.id, 'instagram'),
    siteConfirmed: app.readiness.confirmed(photo.id, 'site'),
  });
  const photoStats = id => {
    const { from, to } = app.stats.range(30);
    const s = app.stats.photo(id, from, to);
    return { ...s, spark: sparkline(s.days.map(d => d.views)) };
  };

  // ---------- signalements des visiteurs ----------
  app.get('/admin/signalements', async (request, reply) => render(request, reply, 'reports', {
    title: request.t('Signalements des visiteurs'), reports: app.feedback.reports().map(r => withReady({ ...r, id: r.pid, reportId: r.id })),
  }));
  app.post('/admin/signalements/:id/traite', write, async (request, reply) => {
    app.feedback.done(byId(request.params.id));
    return done(reply, '/admin/signalements', request.t('Signalement marqué comme traité.'));
  });
  app.post('/admin/signalements/:id/supprimer', write, async (request, reply) => {
    app.feedback.remove(byId(request.params.id));
    return done(reply, '/admin/signalements', request.t('Signalement supprimé.'));
  });

  app.get('/admin/statistiques', async (request, reply) => {
    const days = PERIODS[request.query.periode] ? Number(request.query.periode) : 30;
    const { from, to } = app.stats.range(days);
    const prev = app.stats.range(days * 2);
    const eve = new Date(`${from}T12:00:00Z`);
    eve.setUTCDate(eve.getUTCDate() - 1);
    const before = app.stats.daily(prev.from, eve.toISOString().slice(0, 10));     // période précédente, même durée
    const daily = app.stats.daily(from, to);
    // 12 mois : regroupés par mois (visiteurs : somme des visiteurs de chaque jour).
    let points = daily.map(d => ({ ...d, label: dayLabel(d.day, request.t) }));
    if (days === 365) {
      const months = new Map();
      for (const d of daily) { const m = d.day.slice(0, 7); const o = months.get(m) || { day: m, views: 0, visitors: 0, mobile: 0 }; o.views += d.views; o.visitors += d.visitors; o.mobile += d.mobile; months.set(m, o); }
      points = [...months.values()].map(m => ({ ...m, label: monthLabel(m.day, request.t) }));
    }
    const sum = (list, k) => list.reduce((a, d) => a + d[k], 0);
    const totals = { views: sum(daily, 'views'), visitors: sum(daily, 'visitors'), mobile: sum(daily, 'mobile') };
    const previous = { views: sum(before, 'views'), visitors: sum(before, 'visitors') };
    const photoViews = sum(app.stats.topPhotos(from, to, 100000), 'views');
    const all = new Map(repo.photos().map(p => [p.id, p]));
    const categories = repo.categories();
    const authors = repo.authors();
    return render(request, reply, 'stats', {
      title: request.t('Statistiques'), days, PERIODS: periods(request.t), from, to, totals, previous, photoViews,
      chart: barsAndLine(points, { labels: [points[0].label, points.at(-1).label] }), points,
      top: app.stats.topPhotos(from, to, 10).map(r => ({ ...r, photo: all.get(r.id) && withReady(all.get(r.id)) })).filter(r => r.photo),
      pages: app.stats.topPages(from, to, 8).map(r => ({ ...r, label: pageLabel(r.page, categories, authors, request.t) })),
      sources: app.stats.sources(from, to, 8),
      // Partages : par moyen, et photos les plus partagées.
      shares: (() => {
        const t = request.t;
        const VIA = { whatsapp: 'WhatsApp', facebook: 'Facebook', bluesky: 'Bluesky', x: 'X', pinterest: 'Pinterest', email: t('E-mail'),
          copie: t('Lien copié'), instagram: t('Post Instagram ouvert'), telephone: t('Menu du téléphone'), qr: t('QR scanné') };
        const byVia = app.shares.byVia(from, to).map(r => ({ ...r, label: VIA[r.via] || r.via }));
        return { byVia, total: byVia.reduce((a, r) => a + r.n, 0),
          top: app.shares.topPhotos(from, to, 5).map(r => ({ ...r, photo: all.get(r.id) && withReady(all.get(r.id)) })).filter(r => r.photo) };
      })(),
      ...(() => {
        const countries = app.stats.countries(from, to).map(r => ({ ...r, name: countryName(r.country, request.t) }));
        return { countries, bubbles: countryBubbles(countries) };
      })(),
    });
  });

  // Audience d'une photo (inspecteur de la photothèque) : 30 derniers jours.
  app.get('/admin/photos/:id/statistiques', async (request, reply) => {
    const id = byId(request.params.id);
    if (!repo.photo(id)) return reply.code(404).send({ error: request.t('Photo introuvable.') });
    const s = photoStats(id);
    return { total: s.total, rank: s.rank, spark: s.spark, days: s.days.map(d => d.views) };
  });

  // ---------- apparence de l'admin (clair / sombre) ----------
  // Langue de l'admin : gardée sur le photographe lié au compte (elle le suit d'un appareil à l'autre), sinon dans un
  // cookie du compte.
  app.post('/admin/langue', write, async (request, reply) => {
    const lang = ADMIN_LANGS.includes(request.body?.lang) ? request.body.lang : 'fr';
    const author = repo.authorBySub(request.session.sub);
    if (author) app.db.prepare('UPDATE authors SET admin_lang = ? WHERE id = ?').run(lang, author.id);
    else reply.setCookie(LANG_COOKIE, lang, { path: '/admin', httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 365 * 24 * 3600 });
    return reply.redirect(safeBack(request, '/admin'), 303);
  });

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
      title: request.t('Compléter et publier'), photos, ids: photos.map(p => p.id), categories: repo.categories(), authors: repo.authors(),
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
      const g = app.readiness.gate(ids.filter(id => repo.photo(id)?.status !== 'published'));
      const before = repo.setStatuses(Object.fromEntries(g.ok.map(id => [id, 'published'])));
      queued(before);
      const held = g.verify.length + g.blocked.length;
      const t = request.t;
      const published = g.ok.length > 1 ? t('{n} photos publiées.', { n: g.ok.length }) : t('{n} photo publiée.', { n: g.ok.length });
      const parts = [g.verify.length && t('{n} à vérifier (confirmez dans leur fiche)', { n: g.verify.length }),
        g.blocked.length && (g.blocked.length > 1 ? t('{n} bloquées par un refus', { n: g.blocked.length }) : t('{n} bloquée par un refus', { n: g.blocked.length }))].filter(Boolean);
      const rest = held ? ` ${held > 1 ? t('{n} restent en brouillon :', { n: held }) : t('{n} reste en brouillon :', { n: held })} ${parts.join(', ')}.` : '';
      return done(reply, '/admin/photos', `${published}${rest}`);
    }
    return done(reply, to, request.t('Modifications enregistrées.'));
  });

  // Un champ à la fois (enregistrement à la sortie du champ). Réponse : valeurs telles qu'enregistrées.
  app.post('/admin/photos/:id/champs', write, async (request, reply) => {
    const id = byId(request.params.id);
    try {
      const p = repo.patchPhoto(id, request.body || {});
      if (!p) return reply.code(404).send({ error: request.t('Photo introuvable.') });
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
    const t = request.t;
    const photosWord = n > 1 ? t('{n} photos', { n }) : t('{n} photo', { n });
    const ok = (text, extra = {}) => (json ? reply.send({ ok: true, count: n, text, ...extra }) : done(reply, back, text));
    const ko = (code, text) => (json ? reply.code(code).send({ error: text }) : failed(reply, back, text));
    const each = value => Object.fromEntries(ids.map(id => [id, value]));
    const map = raw => { try { return typeof raw === 'string' ? JSON.parse(raw) : raw || {}; } catch { return {}; } };

    try {
      switch (body.action) {
        case 'publish':
        case 'draft': {
          if (!n) return ko(422, t('Aucune photo sélectionnée.'));
          // Publier : seulement les photos prêtes ; à vérifier → leur fiche (confirmation) ; bloquées → refus.
          // Seulement les brouillons : une photo déjà en ligne n'est ni republiée ni annoncée « restée en brouillon ».
          const online = body.action === 'publish' ? ids.filter(id => repo.photo(id)?.status === 'published') : [];
          const g = body.action === 'publish' ? app.readiness.gate(ids.filter(id => !online.includes(id))) : { ok: ids, verify: [], blocked: [] };
          const refusedOnline = online.filter(id => repo.refusalOf(id));
          const refused = g.blocked.map(b => b.id);
          const before = repo.setStatuses(body.action === 'publish' ? Object.fromEntries(g.ok.map(id => [id, 'published'])) : each('draft'));
          queued(before);
          if (refused.length + refusedOnline.length === n) {
            return ko(422, n > 1
              ? (refusedOnline.length ? t('Ces photos ne peuvent pas être publiées : la personne photographiée refuse la publication (voir Personnes) ; déjà en ligne : appliquez le refus.') : t('Ces photos ne peuvent pas être publiées : la personne photographiée refuse la publication (voir Personnes).'))
              : (refusedOnline.length ? t('Cette photo ne peut pas être publiée : la personne photographiée refuse la publication (voir Personnes) ; déjà en ligne : appliquez le refus.') : t('Cette photo ne peut pas être publiée : la personne photographiée refuse la publication (voir Personnes).')));
          }
          if (g.verify.length && !g.ok.length && !refused.length) {
            const reason = `${t(g.verify[0].reasons[0])}${g.verify.length > 1 ? '…' : ''}`;
            return ko(422, n > 1 ? t('Ces photos sont à vérifier ({reason}) : confirmez dans leur fiche pour publier.', { reason }) : t('Cette photo est à vérifier ({reason}) : confirmez dans sa fiche pour publier.', { reason }));
          }
          // Publication en un clic : un titre provisoire (nom du fichier) est rappelé dans le message.
          const prov = body.action === 'publish' ? ids.filter(id => repo.photoView(id)?.provisional).length : 0;
          const note = !prov ? ''
            : ` ${prov === n ? (n > 1 ? t('Elles gardent le nom du fichier comme titre : corrigez-le dans la photothèque.') : t('Elle garde le nom du fichier comme titre : corrigez-le dans la photothèque.'))
              : prov > 1 ? t('{n} gardent le nom du fichier comme titre : corrigez-le dans la photothèque.', { n: prov }) : t('{n} garde le nom du fichier comme titre : corrigez-le dans la photothèque.', { n: prov })}`;
          const r = refused.length, v = g.verify.length;
          const blocked = (r ? ` ${r > 1 ? t('{n} photos restent en brouillon : la personne photographiée refuse la publication (voir Personnes).', { n: r }) : t('{n} photo reste en brouillon : la personne photographiée refuse la publication (voir Personnes).', { n: r })}` : '')
            + (v ? ` ${v > 1 ? t('{n} photos à vérifier restent en brouillon : confirmez dans leur fiche.', { n: v }) : t('{n} photo à vérifier reste en brouillon : confirmez dans sa fiche.', { n: v })}` : '');
          const m = n - refused.length - g.verify.length - refusedOnline.length;
          const main = body.action === 'publish'
            ? (m > 1 ? t('{n} photos publiées.', { n: m }) : t('{n} photo publiée.', { n: m }))
            : (m > 1 ? t('{n} photos repassées en brouillon.', { n: m }) : t('{n} photo repassée en brouillon.', { n: m }));
          return ok(`${main}${note}${blocked}`, { undo: { action: 'statuses', map: before } });
        }
        case 'map_on':
        case 'map_off': {
          if (!n) return ko(422, t('Aucune photo sélectionnée.'));
          // Sur la carte : seulement les photos qui ont une ville ; les autres sont signalées.
          const before = repo.setOnMap(ids, body.action === 'map_on');
          const changed = Object.keys(before).length;
          const skipped = body.action === 'map_on' ? n - repo.withCity(ids).length : 0;
          const word = c => (c > 1 ? t('{n} photos', { n: c }) : t('{n} photo', { n: c }));
          const text = body.action === 'map_on'
            ? `${t('{photos} sur la carte.', { photos: word(changed) })}${skipped ? ` ${t('{photos} sans ville : choisissez sa ville dans la fiche.', { photos: word(skipped) })}` : ''}`
            : changed > 1 ? t('{n} photos retirées de la carte.', { n: changed }) : t('{n} photo retirée de la carte.', { n: changed });
          return ok(text, { undo: { action: 'map_restore', map: before } });
        }
        case 'map_restore': {
          repo.restoreOnMap(map(body.map));
          return ok(t('Carte rétablie.'));
        }
        case 'category': {
          if (!n) return ko(422, t('Aucune photo sélectionnée.'));
          // « Nouvelle série… » : créée à la volée.
          const targetId = body.category_id === 'new' ? repo.saveCategory(null, { name: body.new_category }) : Number(body.category_id);
          const target = repo.categories().find(c => c.id === targetId);
          if (!target) return ko(422, t('Choisissez une série.'));
          const before = repo.setCategories(each(target.id));
          app.variants.schedule();
          return ok(n > 1 ? t('{n} photos déplacées vers « {name} ».', { n, name: target.name }) : t('{n} photo déplacée vers « {name} ».', { n, name: target.name }), { undo: { action: 'categories', map: before }, category: { id: target.id, name: target.name } });
        }
        case 'fields': {
          if (!n) return ko(422, t('Aucune photo sélectionnée.'));
          const { before, ...v } = repo.setFields(ids, body);
          app.variants.schedule();
          const p = { place: v.place, photos: photosWord };
          const text = v.place && v.taken_on ? t('Lieu « {place} » et date appliqués à {photos}.', p) : v.place ? t('Lieu « {place} » appliqué à {photos}.', p)
            : v.taken_on ? t('Date appliquée à {photos}.', p) : t('Rien à changer pour {photos}.', p);
          return ok(text, { values: v, undo: { action: 'restore-fields', map: before } });
        }
        case 'restore-fields': {
          repo.restoreFields(map(body.map));
          app.variants.schedule();
          return json ? reply.send({ ok: true, text: t('Modification annulée.') }) : done(reply, back, t('Modification annulée.'));
        }
        // Annulations (JSON) : état précédent renvoyé par l'action annulée.
        case 'statuses': {
          // Republier passe par le même contrôle que publier (à vérifier : seulement si une confirmation couvre ses raisons).
          const m = Object.fromEntries(Object.entries(map(body.map)).filter(([id]) => repo.photo(Number(id))));
          const back2 = Object.entries(m).filter(([id, st]) => st === 'published' && repo.photo(Number(id)).status !== 'published').map(([id]) => Number(id));
          const allowed = new Set(app.readiness.gate(back2).ok);
          const undone = repo.setStatuses(Object.fromEntries(Object.entries(m).filter(([id, st]) => st !== 'published' || !back2.includes(Number(id)) || allowed.has(Number(id)))));
          queued(undone);                 // annuler « publier » retire aussi de la file Instagram
          return json ? reply.send({ ok: true, text: t('Action annulée.') }) : done(reply, back, t('Action annulée.'));
        }
        case 'categories': {
          const m = map(body.map);
          repo.setCategories(Object.fromEntries(Object.entries(m).filter(([id]) => repo.photo(Number(id)))));
          app.variants.schedule();
          return json ? reply.send({ ok: true, text: t('Déplacement annulé.') }) : done(reply, back, t('Déplacement annulé.'));
        }
        case 'delete': {
          if (!n) return ko(422, t('Aucune photo sélectionnée.'));
          // Sans confirmation explicite, rien n'est supprimé : page de confirmation (ou refus en JSON).
          if (body.confirm !== '1' && body.confirm !== true) {
            if (json) return ko(422, t('Confirmation requise.'));
            return render(request, reply, 'confirm-delete', { title: t('Supprimer des photos'), photos: ids.map(id => repo.photo(id)), back });
          }
          for (const id of ids) {
            const file = repo.deletePhoto(id);
            if (file) removePhotoFiles(storageDir, file);
          }
          return ok(n > 1 ? t('{n} photos supprimées.', { n }) : t('{n} photo supprimée.', { n }));
        }
        default:
          return ko(400, t('Action inconnue.'));
      }
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return ko(422, Object.values(err.errors).map(e => t(e)).join(' '));
    }
  });

  // Réordonnancement par glisser-déposer (fetch JSON, en-tête x-csrf-token).
  app.post('/admin/photos/order', write, async (request, reply) => {
    try {
      repo.orderPhotos(Array.isArray(request.body?.ids) ? request.body.ids : []);
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(422).send({ error: request.t(err.errors.order) });
      throw err;
    }
    return { ok: true };
  });

  app.get('/admin/photos/:id', async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    return render(request, reply, 'photo', {
      title: photo.title, photo, values: { ...photo, city_label: photo.city_name ? cities.label({ name: photo.city_name, cc: photo.city_cc }) : '' }, errors: {}, categories: repo.categories(), authors: repo.authors(),
      ...photoExtras(photo, request.t),
    });
  });

  app.post('/admin/photos/:id', write, async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    const body = request.body || {};
    try {
      // Publier une photo à vérifier : confirmation explicite exigée, puis gardée (le blocage, lui, est refusé plus bas).
      const publishing = body.status === 'published' && photo.status !== 'published';
      const site = app.readiness.state(photo.id).site;
      const covered = app.readiness.confirmed(photo.id, 'site');
      if (publishing && site.level === 'warn' && !covered && body.confirmer !== '1') {
        const err = new ValidationError({ status: request.t('Photo à vérifier ({reasons}) : cochez la confirmation pour la publier.', { reasons: site.reasons.map(x => request.t(x)).join(' ; ') }) });
        err.values = body;
        throw err;
      }
      repo.updatePhoto(photo.id, body);
      if (body.serie_choisie === '1') repo.keepSeries(photo.id);          // série proposée : choix fait sur la fiche
      // Confirmation cochée (brouillon publié, ou photo déjà en ligne à vérifier) : gardée avec ses raisons.
      if (site.level === 'warn' && !covered && body.confirmer === '1' && body.status === 'published') app.readiness.confirm(photo.id, 'site', request.session.name, site.reasons);
      app.variants.schedule();          // auteur, date, titre ou option de filigrane ont pu changer
      queued({ [photo.id]: photo.status });
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      reply.code(422);
      return render(request, reply, 'photo', {
        title: photo.title, photo, values: { ...photo, ...err.values }, errors: err.errors, categories: repo.categories(), authors: repo.authors(),
        ...photoExtras(photo, request.t),
      });
    }
    return done(reply, `/admin/photos/${photo.id}`, request.t('Photo enregistrée.'));
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
    if (!r.ok) return failed(reply, to, request.t('Preuve non valide : {reason}.', { reason: request.t(r.reason) }));
    const iso = r.genTime.toISOString();
    const when = request.t('{date} à {time}', { date: iso.slice(0, 10), time: iso.slice(11, 19) });
    if (!r.chained) return failed(reply, to, request.t('Signature valide (original intact, horodaté le {when} UTC), mais autorité non vérifiée : aucun certificat racine configuré (TSA_CA_FILE).', { when }));
    return done(reply, to, request.t('Preuve valide : original intact, horodaté le {when} UTC, signature vérifiée jusqu’à l’autorité racine.', { when }));
  });

  app.post('/admin/preuves/reessayer', write, async (request, reply) => {
    app.proofs.schedule({ retryNow: true });
    return done(reply, safeBack(request, '/admin'), request.t('Horodatage relancé : les preuves en attente sont redemandées en arrière-plan.'));
  });

  app.post('/admin/photos/:id/status', write, async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    const published = request.body?.status === 'published';
    if (published && photo.status !== 'published') {
      // Publication en un clic : seulement une photo prête ; à vérifier → la fiche (confirmation), bloquée → refus.
      const g = app.readiness.gate([photo.id]);
      const reasons = list => list.map(x => request.t(x)).join(' ; ');
      if (g.blocked.length) return failed(reply, safeBack(request, '/admin/photos'), request.t('« {title} » ne peut pas être publiée : {reasons}.', { title: photo.title, reasons: reasons(g.blocked[0].reasons) }));
      if (g.verify.length) return failed(reply, `/admin/photos/${photo.id}`, request.t('« {title} » est à vérifier ({reasons}) : confirmez dans la fiche pour la publier.', { title: photo.title, reasons: reasons(g.verify[0].reasons) }));
    }
    repo.setStatus(photo.id, request.body?.status);
    queued({ [photo.id]: photo.status });
    return done(reply, safeBack(request, '/admin/photos'), published ? request.t('« {title} » publiée.', { title: photo.title }) : request.t('« {title} » repassée en brouillon.', { title: photo.title }));
  });

  // Visages : correction à la main (il y a quelqu'un / personne de reconnaissable / revenir à la détection).
  app.post('/admin/photos/:id/visages', write, async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    const v = { oui: 1, non: 0 }[request.body?.valeur];
    app.readiness.setFaces(photo.id, v ?? null);
    app.instagram.dropBlocked();
    return done(reply, `/admin/photos/${photo.id}`, v === 1 ? request.t('Indiqué : quelqu’un est sur la photo.') : v === 0 ? request.t('Indiqué : personne de reconnaissable sur la photo.') : request.t('La détection des visages fait de nouveau foi.'));
  });

  app.post('/admin/photos/:id/move', write, async (request, reply) => {
    repo.movePhoto(byId(request.params.id), request.body?.dir);
    return reply.redirect(`/admin/photos?vue=liste#photo-${byId(request.params.id)}`, 303);   // « Monter » et « Descendre » sont dans la vue liste
  });

  app.post('/admin/photos/:id/delete', write, async (request, reply) => {
    const file = repo.deletePhoto(byId(request.params.id));
    if (!file) return reply.callNotFound();
    removePhotoFiles(storageDir, file);
    return done(reply, '/admin/photos', request.t('Photo supprimée.'));
  });

  // ---------- séries ----------
  const seriesPage = (request, reply, extra = {}) => render(request, reply, 'series', {
    title: request.t('Séries'), categories: repo.categories(), covers: Object.fromEntries(Object.entries(repo.covers()).map(([k, p]) => [k, withReady(p)])),
    boards: Object.fromEntries(Object.entries(repo.boards(3)).map(([k, list]) => [k, list.map(withReady).filter(p => p.ready)])), errors: {}, values: {},
    suggest: app.seriesSuggest.state(), ...extra,
  });
  app.get('/admin/series', async (request, reply) => seriesPage(request, reply));

  // Série proposée : allumer (téléchargement du modèle puis analyse, en arrière-plan) ou éteindre et tout effacer.
  app.get('/admin/series/propositions', async () => app.seriesSuggest.state());
  app.post('/admin/series/propositions', write, async (request, reply) => {
    if (request.body?.action === 'on') {
      app.seriesSuggest.enable();
      return done(reply, '/admin/series#propositions', request.t('Propositions de série allumées : le modèle se télécharge, puis les photos sont analysées.'));
    }
    await app.seriesSuggest.disable();
    return done(reply, '/admin/series#propositions', request.t('Propositions de série éteintes : modèle et empreintes effacés.'));
  });

  app.post('/admin/series', write, async (request, reply) => {
    try {
      const id = repo.saveCategory(null, request.body || {});
      return done(reply, `/admin/series#serie-${id}`, request.t('Série « {name} » créée.', { name: repo.categories().find(c => c.id === id).name }));
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
    return done(reply, `/admin/series#serie-${id}`, request.t('Série enregistrée.'));
  });

  // Ordre des séries par glisser-déposer ou flèches du clavier (fetch JSON).
  app.post('/admin/series/order', write, async (request, reply) => {
    try {
      repo.orderCategories(Array.isArray(request.body?.ids) ? request.body.ids : []);
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(422).send({ error: request.t(err.errors.order) });
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
      return failed(reply, '/admin/series', request.t(err.errors.delete));
    }
    if (r.moved) app.variants.schedule();
    const target = r.moved ? repo.categories().find(c => c.id === Number(request.body.move_to)) : null;
    return done(reply, '/admin/series', r.moved
      ? (r.moved > 1 ? request.t('Série « {name} » supprimée ; {n} photos déplacées vers « {target} ».', { name: r.name, n: r.moved, target: target.name })
        : request.t('Série « {name} » supprimée ; {n} photo déplacée vers « {target} ».', { name: r.name, n: r.moved, target: target.name }))
      : request.t('Série « {name} » supprimée.', { name: r.name }));
  });

  // ---------- auteurs ----------
  const authorsPage = (request, reply, extra = {}) => render(request, reply, 'authors', {
    title: request.t('Photographes'), authors: repo.authors(), errors: {}, values: {}, ...extra,
  });
  app.get('/admin/auteurs', async (request, reply) => authorsPage(request, reply));

  app.post('/admin/auteurs', write, async (request, reply) => {
    try {
      repo.saveAuthor(null, request.body || {});
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return authorsPage(request, reply.code(422), { errors: err.errors, values: err.values });
    }
    return done(reply, '/admin/auteurs', request.t('Auteur ajouté.'));
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
    return done(reply, '/admin/auteurs', request.t('Auteur enregistré.'));
  });

  app.post('/admin/auteurs/:id/delete', write, async (request, reply) => {
    try {
      if (!repo.deleteAuthor(byId(request.params.id))) return reply.callNotFound();
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return failed(reply, '/admin/auteurs', request.t(err.errors.delete));
    }
    return done(reply, '/admin/auteurs', request.t('Auteur supprimé.'));
  });

  // ---------- images : filigrane et métadonnées ----------
  const firstPhotoId = () => repo.photos({ status: 'published' })[0]?.id ?? repo.photos()[0]?.id;
  const imagesPage = (request, reply) => {
    const { watermark, exif } = app.variants.context();
    return render(request, reply, 'images', {
      title: request.t('Filigrane et métadonnées'), watermark, exif, FONTS, POSITIONS, KINDS, TONE_LABELS, EXIF_MODES, MIN_WIDTHS, brand: app.appearance.brand(),
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
      : watermark.kind === 'image' && !watermark.image ? ` ${request.t('Aucun logo envoyé : pas de filigrane pour l’instant.')}`
        : (watermark.kind === 'emblem' || watermark.kind === 'logotype') && !brand[watermark.kind] ? ` ${request.t('Ce dessin n’est pas encore envoyé dans Apparence : pas de filigrane pour l’instant.')}` : '';
    return done(reply, '/admin/images', `${request.t('Réglages enregistrés, images en cours de mise à jour.')}${note}`);
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
        if (part.file.truncated) { error = request.t('Logo trop lourd (5 Mo au plus).'); continue; }
        const buf = Buffer.concat(chunks);
        let meta;
        try { meta = await sharp(buf, { limitInputPixels: LOGO_MAX_SIDE * LOGO_MAX_SIDE }).metadata(); } catch { meta = null; }
        if (!meta || !['png', 'webp'].includes(meta.format)) { error = request.t('Le logo doit être une image PNG ou WebP (de préférence à fond transparent).'); continue; }
        if (meta.width > LOGO_MAX_SIDE || meta.height > LOGO_MAX_SIDE) { error = request.t('Logo trop grand ({n} px de côté au plus).', { n: LOGO_MAX_SIDE }); continue; }
        if (Math.min(meta.width, meta.height) < 8 || Math.max(meta.width, meta.height) > 10 * Math.min(meta.width, meta.height)) {
          error = request.t('Logo trop étiré ou trop petit (8 px de côté au moins, rapport largeur/hauteur de 10 au plus).'); continue;
        }
        saved = `${crypto.randomUUID()}.png`;
        // Écrit sous un nom provisoire (« .part », jamais effacé par le ménage d'un passage en cours),
        // puis renommé au moment même où les réglages le désignent (sans attente entre les deux).
        await sharp(buf).png().toFile(path.join(app.variants.watermarkDir, `${saved}.part`));
      }
    } catch (err) {
      if (!err.code?.startsWith('FST_')) throw err;
      error = request.t('Envoi invalide.');
    }
    if (!checked) return reply.code(403).send(request.t('Jeton CSRF invalide.'));
    if (!saved) return failed(reply, '/admin/images', error || request.t('Aucun fichier reçu.'));
    // L'ancien logo n'est pas effacé ici : un passage en cours l'utilise peut-être ; le ménage de fin de passage s'en charge.
    const { watermark, exif } = app.variants.context();
    repo.saveImageSettings({ ...watermark, image: saved }, exif);
    fs.renameSync(path.join(app.variants.watermarkDir, `${saved}.part`), path.join(app.variants.watermarkDir, saved));
    app.variants.schedule();
    return done(reply, '/admin/images', request.t('Logo enregistré.'));
  });

  app.post('/admin/images/logo/delete', write, async (request, reply) => {
    const { watermark, exif } = app.variants.context();
    repo.saveImageSettings({ ...watermark, image: null }, exif);
    app.variants.schedule();
    return done(reply, '/admin/images', request.t('Logo supprimé.'));
  });

  // ---------- apparence : thème et marque ----------
  const brandDir = path.join(storageDir, 'brand');
  fs.mkdirSync(brandDir, { recursive: true });
  const saveBrand = brand => repo.saveSetting('brand', brand);

  app.get('/admin/apparence', async (request, reply) => render(request, reply, 'appearance', {
    title: request.t('Apparence'), THEMES, BRAND_MODES, BRAND_SLOTS, themeId: app.appearance.themeId(), brand: app.appearance.brand(),
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
    return done(reply, '/admin/apparence', request.t('Apparence enregistrée.'));
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
        if (part.file.truncated) { error = request.t('Image trop lourde ({n} Mo au plus).', { n: EMBLEM_MAX_BYTES / 1024 / 1024 }); continue; }
        upload = Buffer.concat(chunks);
      }
    } catch (err) {
      if (!err.code?.startsWith('FST_')) throw err;
      error = request.t('Envoi invalide.');
    }
    if (!checked) return reply.code(403).send(request.t('Jeton CSRF invalide.'));
    let made = null;
    if (upload) {
      try {
        made = await PROCESS[slot.kind](upload);
      } catch (err) {
        if (!(err instanceof BrandError)) throw err;
        error = request.t('{label} refusé : {error}.', { label: request.t(slot.label), error: request.t(err.message) });
      }
    }
    if (!made) return failed(reply, '/admin/apparence', error || request.t('Aucun fichier reçu.'));

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
    return done(reply, '/admin/apparence', request.t('{label} enregistré.', { label: request.t(slot.label) }));
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
    return done(reply, '/admin/apparence', request.t('{label} retiré.', { label: request.t(slot.label) }));
  });

  // ---------- aide en ligne ----------
  // Relue à chaque affichage en développement (édition de docs/aide), une fois pour toutes en production.
  // Aide dans la langue de l'admin (français si la traduction manque) ; gardée en mémoire en production.
  const helpCache = {};
  const helpIn = lang => (app.config.production ? (helpCache[lang] ??= loadHelp(lang)) : loadHelp(lang));
  app.get('/admin/aide', async (request, reply) => render(request, reply, 'help', { title: request.t('Aide'), help: helpIn(request.t.lang) }));

  // ---------- rencontres (page /bonjour, cartes) ----------
  registerEncounters(app, { repo, render, write, done, failed, withReady });
  registerOutings(app, { repo, render, write, done, failed, withReady });

  // ---------- traductions ----------
  // Proposition de traduction d'un champ (LibreTranslate du réseau local) : l'auteur la relit avant d'enregistrer.
  app.post('/admin/traduction', write, async (request, reply) => {
    const { text, source, target } = request.body || {};
    try {
      return { text: await app.translator.translate(String(text || '').slice(0, 20000), String(source), String(target)) };
    } catch (err) {
      if (!(err instanceof TranslateError)) throw err;
      return reply.code(422).send({ error: request.t(err.message) });
    }
  });

  // ---------- réglages ----------
  const mapCounts = app.db.prepare("SELECT COUNT(*) AS mapCount, COUNT(DISTINCT city_id) AS mapCities FROM photos WHERE status = 'published' AND on_map = 1 AND city_id IS NOT NULL");
  const defaultsNow = () => rightsDefaults(repo.authors().map(a => a.name), app.siteName());
  // Deux pages, un seul enregistrement : « Site public » (textes, ouverture, carte du monde) et « Droits &
  // confidentialité ». Chaque formulaire n'enregistre que ses propres champs (part).
  const settingsPage = (request, reply, part) => render(request, reply, 'settings', {
    heroMax: 8, part, section: part,
    title: part === 'site' ? request.t('Site public') : request.t('Droits & confidentialité'), settings: repo.settings(), published: repo.photos({ status: 'published' }), defaultName: app.config.siteName,
    rights: LANGS.map(l => ({ lang: l, ...RIGHTS[l] })), rightsDefaults: defaultsNow(),
    ...mapCounts.get(), encrypted: app.encounters.encrypted, legalMissing: legalMissing(repo.settings()),
  });
  app.get('/admin/site', async (request, reply) => settingsPage(request, reply, 'site'));
  app.get('/admin/droits', async (request, reply) => settingsPage(request, reply, 'droits'));
  // Ancienne adresse : renvoie vers Site public (le #fragment ne parvient pas au serveur ; les liens de l'admin et de
  // l'aide pointent déjà vers /admin/site ou /admin/droits).
  app.get('/admin/reglages', async (request, reply) => reply.redirect('/admin/site', 301));

  app.post('/admin/reglages', write, async (request, reply) => {
    const part = ['site', 'droits'].includes(request.body?.part) ? request.body.part : null;
    repo.saveSettings(withoutDefaults(request.body || {}, defaultsNow()), part);
    app.variants.schedule();            // {site} peut figurer dans le filigrane
    if (request.body?.hero_op || request.body?.hero_save) return done(reply, '/admin/site#ouverture', request.t('Ordre de l’ouverture enregistré.'));
    return done(reply, part === 'droits' ? '/admin/droits' : '/admin/site', request.t('Réglages enregistrés.'));
  });
}

// Retour à la liste filtrée d'où vient le formulaire (champ « back »), toujours dans l'admin.
function safeBack(request, fallback) {
  const back = safeNext(request.body?.back, fallback);
  return /^\/admin(\/|\?|#|$)/.test(back) ? back : fallback;
}
