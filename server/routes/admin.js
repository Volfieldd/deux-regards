import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import multipart from '@fastify/multipart';
import { createAdminRepo, ValidationError } from '../admin-repo.js';
import { importOriginal, removePhotoFiles, ImportError, MAX_FILE_BYTES } from '../media.js';
import { picture } from '../picture.js';
import { sameToken, safeNext } from '../auth.js';
import { pad } from '../format.js';
import sharp from 'sharp';
import { normalizeWatermark, normalizeExif, EXIF_MODES, MIN_WIDTHS } from '../variants.js';
import { FONTS, POSITIONS } from '../watermark.js';
import { THEMES, BRAND_MODES } from '../themes.js';
import { processEmblem, BrandError, EMBLEM_MAX_BYTES } from '../brand.js';

const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_MAX_SIDE = 4000;

const MAX_FILES = 50;
const STATUSES = { draft: 'Brouillon', published: 'Publiée' };

// « IMG_2041 quai-nord.jpg » → « IMG 2041 quai nord »
export const titleFromFilename = name => path.parse(String(name || '')).name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Sans titre';

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

  function render(request, reply, template, data) {
    const siteName = app.siteName();
    return reply.render(`admin/${template}`, {
      siteName, session: request.session, csrf: request.session.csrf, flash: takeFlash(request, reply),
      section: template, picture: (p, o) => picture(p, { base: '/admin/media/', ...o }), pad, STATUSES, variants: app.variants.status(),
      local: request.session.sub.startsWith('local:') || !request.session.id_token,
      description: '', ...data, pageTitle: `${data.title} · Administration · ${siteName}`,
    });
  }

  const byId = id => (Number.isInteger(Number(id)) ? Number(id) : -1);

  // ---------- accueil ----------
  app.get('/admin', async (request, reply) => {
    const photos = repo.photos();
    return render(request, reply, 'home', {
      title: 'Tableau de bord',
      counts: { published: photos.filter(p => p.status === 'published').length, draft: photos.filter(p => p.status === 'draft').length },
      categories: repo.categories().length, authors: repo.authors(), me: repo.authorBySub(request.session.sub),
      proofs: app.proofs.status(), tsa: app.config.tsa,
    });
  });

  // ---------- photos ----------
  app.get('/admin/photos', async (request, reply) => {
    const { q = '', auteur = '', serie = '', statut = '' } = request.query;
    const filter = { q: String(q), author: String(auteur), category: String(serie), status: STATUSES[statut] ? statut : '' };
    const authors = repo.authors();
    return render(request, reply, 'photos', {
      title: 'Photos', photos: repo.photos(filter), filter, authors, categories: repo.categories(),
      filtered: Boolean(filter.q || filter.author || filter.category || filter.status),
      defaultAuthor: repo.authorBySub(request.session.sub)?.id ?? authors[0]?.id,
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
          id = repo.addPhoto({ title: titleFromFilename(part.filename), categoryId, authorId, ...original });
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
      title: photo.title, photo, values: photo, errors: {}, categories: repo.categories(), authors: repo.authors(),
      proof: app.proofs.get(photo.id), tsa: app.config.tsa,
    });
  });

  app.post('/admin/photos/:id', write, async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    try {
      repo.updatePhoto(photo.id, request.body || {});
      app.variants.schedule();          // auteur, date, titre ou option de filigrane ont pu changer
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      reply.code(422);
      return render(request, reply, 'photo', {
        title: photo.title, photo, values: { ...photo, ...err.values }, errors: err.errors, categories: repo.categories(), authors: repo.authors(),
        proof: app.proofs.get(photo.id), tsa: app.config.tsa,
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
    const published = request.body?.status === 'published';
    return done(reply, safeBack(request, '/admin/photos'), `« ${photo.title} » ${published ? 'publiée' : 'repassée en brouillon'}.`);
  });

  app.post('/admin/photos/:id/move', write, async (request, reply) => {
    repo.movePhoto(byId(request.params.id), request.body?.dir);
    return reply.redirect(`/admin/photos#photo-${byId(request.params.id)}`, 303);
  });

  app.post('/admin/photos/:id/delete', write, async (request, reply) => {
    const file = repo.deletePhoto(byId(request.params.id));
    if (!file) return reply.callNotFound();
    removePhotoFiles(storageDir, file);
    return done(reply, '/admin/photos', 'Photo supprimée.');
  });

  // ---------- séries ----------
  const seriesPage = (request, reply, extra = {}) => render(request, reply, 'series', {
    title: 'Séries', categories: repo.categories(), errors: {}, values: {}, ...extra,
  });
  app.get('/admin/series', async (request, reply) => seriesPage(request, reply));

  app.post('/admin/series', write, async (request, reply) => {
    try {
      repo.saveCategory(null, request.body || {});
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return seriesPage(request, reply.code(422), { errors: err.errors, values: err.values });
    }
    return done(reply, '/admin/series', 'Série créée.');
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
    return done(reply, '/admin/series', 'Série enregistrée.');
  });

  app.post('/admin/series/:id/move', write, async (request, reply) => {
    repo.moveCategory(byId(request.params.id), request.body?.dir);
    return reply.redirect('/admin/series', 303);
  });

  app.post('/admin/series/:id/delete', write, async (request, reply) => {
    try {
      if (!repo.deleteCategory(byId(request.params.id))) return reply.callNotFound();
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return failed(reply, '/admin/series', err.errors.delete);
    }
    return done(reply, '/admin/series', 'Série supprimée.');
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
      title: 'Filigrane et métadonnées', watermark, exif, FONTS, POSITIONS, EXIF_MODES, MIN_WIDTHS,
      photos: repo.photos(), previewId: Number(request.query.photo) || firstPhotoId(),
    });
  };
  app.get('/admin/images', imagesPage);

  app.post('/admin/images', write, async (request, reply) => {
    const { watermark: current } = app.variants.context();
    const watermark = normalizeWatermark(request.body || {}, current);
    repo.saveImageSettings(watermark, normalizeExif(request.body || {}));
    app.variants.schedule();
    const note = watermark.enabled && watermark.kind === 'image' && !watermark.image ? ' Aucun logo envoyé : pas de filigrane pour l’instant.' : '';
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
        await sharp(buf).png().toFile(path.join(app.variants.watermarkDir, saved));
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
  const removeBrandFiles = b => { for (const f of [b.emblem, b.favicon64, b.favicon180]) if (f) fs.rmSync(path.join(brandDir, f), { force: true }); };

  app.get('/admin/apparence', async (request, reply) => render(request, reply, 'appearance', {
    title: 'Apparence', THEMES, BRAND_MODES, themeId: app.appearance.themeId(), brand: app.appearance.brand(),
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

  // Emblème : PNG, WebP ou JPEG, transformé en masque (la couleur suit le thème) + favicons.
  app.post('/admin/apparence/embleme', async (request, reply) => {
    let checked = false;
    let error = null;
    let made = null;
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
        try {
          made = await processEmblem(Buffer.concat(chunks));
        } catch (err) {
          if (!(err instanceof BrandError)) throw err;
          error = `Emblème refusé : ${err.message}.`;
        }
      }
    } catch (err) {
      if (!err.code?.startsWith('FST_')) throw err;
      error = 'Envoi invalide.';
    }
    if (!checked) return reply.code(403).send('Jeton CSRF invalide.');
    if (!made) return failed(reply, '/admin/apparence', error || 'Aucun fichier reçu.');
    const id = crypto.randomUUID().slice(0, 8);
    const files = { emblem: `embleme-${id}.png`, favicon64: `favicon-${id}-64.png`, favicon180: `favicon-${id}-180.png` };
    fs.writeFileSync(path.join(brandDir, files.emblem), made.mask);
    fs.writeFileSync(path.join(brandDir, files.favicon64), made.favicon64);
    fs.writeFileSync(path.join(brandDir, files.favicon180), made.favicon180);
    const before = app.appearance.brand();
    saveBrand({ ...before, ...files, ratio: Math.round((made.width / made.height) * 1000) / 1000, mode: 'embleme' });
    removeBrandFiles(before);
    return done(reply, '/admin/apparence', 'Emblème enregistré : il s’affiche avec le nom du site.');
  });

  app.post('/admin/apparence/embleme/delete', write, async (request, reply) => {
    const before = app.appearance.brand();
    saveBrand({ ...before, emblem: null, favicon64: null, favicon180: null, ratio: null, mode: 'texte' });
    removeBrandFiles(before);
    return done(reply, '/admin/apparence', 'Emblème retiré : le nom du site s’affiche seul.');
  });

  // ---------- réglages ----------
  app.get('/admin/reglages', async (request, reply) => render(request, reply, 'settings', {
    title: 'Réglages', settings: repo.settings(), published: repo.photos({ status: 'published' }), defaultName: app.config.siteName,
  }));

  app.post('/admin/reglages', write, async (request, reply) => {
    repo.saveSettings(request.body || {});
    app.variants.schedule();            // {site} peut figurer dans le filigrane
    return done(reply, '/admin/reglages', 'Réglages enregistrés.');
  });
}

// Retour à la liste filtrée d'où vient le formulaire (champ « back »), toujours dans l'admin.
function safeBack(request, fallback) {
  const back = safeNext(request.body?.back, fallback);
  return /^\/admin(\/|\?|#|$)/.test(back) ? back : fallback;
}
