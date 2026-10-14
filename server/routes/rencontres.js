import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { EncounterError, SCOPES, SCOPE_LABELS } from '../encounters.js';
import { sameToken } from '../auth.js';
import { TEXTS, PER_SHEET, MAX_PAIRS, buildPairs, sheets } from '../cards.js';
import { UI } from '../i18n.js';
import QRCode from 'qrcode';
import { composition } from '../textile.js';
import { MailError } from '../mailer.js';
import { removePhotoFiles } from '../media.js';
import { zip } from '../zip.js';

// Admin « Rencontres » : demandes reçues par la page /bonjour, accords papier (carte « pour nous ») et refus.
// Enregistré dans le plugin d'administration (session d'admin exigée, comme le reste de /admin).
const CARD_MAX_BYTES = 15 * 1024 * 1024;
// Photos envoyées (carte signée, photo de repère) : seulement des photos ; jamais un SVG ou un PDF que sharp saurait
// aussi lire (contenu actif, ressources externes).
const PHOTO_FORMATS = ['jpeg', 'png', 'webp'];
async function photoFormat(buf) { try { return PHOTO_FORMATS.includes((await sharp(buf).metadata()).format); } catch { return false; } }
// Champs des formulaires multipart : noms simples seulement (rien comme « __proto__ »).
const FIELD = /^[a-z_]{1,30}$/;

export function registerEncounters(app, { repo, render, write, done, failed, withReady }) {
  const enc = app.encounters;
  const STATUS = { nouvelle: 'Nouvelle', en_cours: 'En cours', traitee: 'Traitée' };
  const fmt = ms => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  const byId = id => (Number.isInteger(Number(id)) ? Number(id) : -1);

  // Photos à proposer pour une rencontre : celles de l'auteur de la carte, prises (ou importées) ce jour-là d'abord.
  function candidates(e, search) {
    const linked = new Set(enc.photos(e.id).map(p => p.id));
    const author = e.author_id ? repo.authors().find(a => a.id === e.author_id)?.slug : undefined;
    const day = e.met_on || '';
    const score = p => {
      if (!day) return 0;
      if (p.taken_on === day) return 3;
      const imported = String(p.created_at || '').slice(0, 10);
      if (imported >= day && imported <= new Date(Date.parse(day) + 14 * 864e5).toISOString().slice(0, 10)) return 2;
      return p.taken_on && day.startsWith(p.taken_on.slice(0, 7)) ? 1 : 0;
    };
    return repo.photos({ q: search, author: search ? undefined : author })
      .filter(p => !linked.has(p.id))
      .map(p => ({ ...p, score: score(p) }))
      .sort((a, b) => b.score - a.score || String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 30).map(withReady);
  }

  const page = (request, reply, view, data) => render(request, reply, view, { STATUS, SCOPES, SCOPE_LABELS, fmt, ...data });

  app.get('/admin/rencontres', async (request, reply) => {
    const status = Object.hasOwn(STATUS, request.query.statut) ? request.query.statut : undefined;
    return page(request, reply, 'encounters', { title: 'Rencontres', list: enc.list({ status }), status, authors: repo.authors(), errors: {}, values: {} });
  });

  function detail(request, reply, id, extra = {}) {
    const e = enc.get(id);
    if (!e) return reply.callNotFound();
    const search = String(request.query.q || '').slice(0, 100);
    return page(request, reply, 'encounter', {
      title: e.ref ? `Rencontre ${e.ref}` : `Rencontre du ${fmt(e.created_at)}`, e, events: enc.events(id),
      photos: enc.photos(id).map(withReady), candidates: candidates(e, search), search, authors: repo.authors(),
      code: e.ref ? enc.codeOf(e.ref) : null, shares: sharesOf(e), errors: {}, values: null, ...extra,
    });
  }
  // Liens « photo offerte » : adresse, et message prêt à envoyer dans la langue de la personne (mailto).
  function sharesOf(e) {
    const g = UI[e.lang] ? UI[e.lang].gift : UI.fr.gift;
    const locale = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' }[e.lang] || 'fr-FR';
    return enc.shares(e.id).map(s => {
      const url = `${app.config.publicUrl}/pour-vous/${s.token}`;
      const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(s.expires_at);
      const author = repo.photo(s.photo_id) && repo.authors().find(a => a.id === repo.photo(s.photo_id).author_id)?.name;
      const mail = e.email ? `mailto:${e.email}?${new URLSearchParams({ subject: g.mailSubject(app.siteName()), body: g.mail({ name: e.name, link: url, date, author: author || app.siteName() }) }).toString().replace(/\+/g, '%20')}` : null;
      return { ...s, url, mail, expired: s.expires_at <= Date.now(), until: fmt(s.expires_at) };
    });
  }
  app.post('/admin/rencontres/:id/liens', write, async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.get(id)) return reply.callNotFound();
    try {
      enc.createShare(id, Number(request.body?.photo_id));
    } catch (err) {
      if (!(err instanceof EncounterError)) throw err;
      return failed(reply, `/admin/rencontres/${id}#photos`, err.message);
    }
    return done(reply, `/admin/rencontres/${id}#liens`, 'Lien privé créé, valable 30 jours : envoyez-le à la personne.');
  });
  app.post('/admin/rencontres/:id/liens/:token/retirer', write, async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.revokeShare(id, String(request.params.token))) return reply.callNotFound();
    return done(reply, `/admin/rencontres/${id}#liens`, 'Lien retiré : il ne fonctionne plus.');
  });

  app.get('/admin/rencontres/:id', async (request, reply) => detail(request, reply, byId(request.params.id)));

  // ---------- rencontre saisie sur le téléphone (web app installable) ----------
  const LOCALE = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' };
  const appView = (reply, view, data) => reply.header('cache-control', 'no-store').render(`admin/${view}`, { siteName: app.siteName(), UI, ...data });
  const authorOf = request => repo.authorBySub(request.session.sub) || null;
  function appPage(request, reply, extra = {}) {
    const author = authorOf(request);
    const authors = repo.authors().map(a => ({ ...a, prefix: prefixOf(a), next: `${prefixOf(a)}-${String(nextNumber(prefixOf(a))).padStart(4, '0')}` }));
    return appView(reply, 'app', { title: 'Nouvelle rencontre', host: app.config.publicUrl.replace(/^https?:\/\/(www\.)?/, ''), author, authors, csrf: request.session.csrf, errors: {}, values: { lang: 'fr', author_id: author?.id }, ...extra });
  }
  app.get('/admin/rencontre', { config: { geolocation: true } }, async (request, reply) => appPage(request, reply));

  // Récapitulatif pour la personne, dans sa langue : ce qu'elle a accepté ou refusé, et le lien vers sa page.
  function recap(e) {
    const lang = UI[e.lang] ? e.lang : 'fr';
    const A = UI[lang].app;
    const accepted = e.consent ? SCOPES.filter(s => e.consent[s]).map(s => UI[lang].hello.scopes[s]).join(', ') : '';
    const date = e.created_at ? new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(e.created_at) : '';
    const link = `${app.config.publicUrl}${lang === 'fr' ? '' : `/${lang}`}/bonjour/${e.ref}-${enc.codeOf(e.ref)}`;
    return { link, subject: A.mailSubject(app.siteName()), text: A.mail({ name: e.name, date, place: e.place, accepted, refused: Boolean(e.refused), link, author: e.author || app.siteName() }) };
  }
  async function sendRecap(e) {
    const r = recap(e);
    await app.mailer.send({ to: e.email, subject: r.subject, text: r.text });
    enc.markMailed(e.id);
  }

  app.post('/admin/rencontre', { config: { geolocation: true } }, async (request, reply) => {
    const body = {};
    let checked = false; let portrait = null; let error = null;
    try {
      // fieldSize : la signature (PNG en base64, 500 Ko au plus une fois décodée) tient dans un champ.
      for await (const part of request.parts({ limits: { fileSize: CARD_MAX_BYTES, files: 1, fields: 40, fieldSize: 700_000 } })) {
        if (part.type === 'field') {
          if (part.fieldname === '_csrf') checked = sameToken(part.value, request.session.csrf);
          else if (FIELD.test(part.fieldname)) body[part.fieldname] = part.valueTruncated ? '' : part.value;
          continue;
        }
        if (!checked) { part.file.resume(); break; }
        const chunks = [];
        for await (const chunk of part.file) chunks.push(chunk);
        if (part.file.truncated) error = 'Photo trop lourde (15 Mo au plus).';
        else if (chunks.length) portrait = Buffer.concat(chunks);
      }
    } catch (err) {
      if (!err.code?.startsWith('FST_')) throw err;
      error = 'Envoi invalide.';
    }
    if (!checked) return reply.code(403).send('Jeton CSRF invalide.');
    const author = repo.authors().find(a => a.id === Number(body.author_id)) || authorOf(request);
    try {
      if (error) throw new EncounterError({ portrait: error });
      if (portrait && !(await photoFormat(portrait))) throw new EncounterError({ portrait: 'La photo doit être une image JPEG, PNG ou WebP.' });
      const r = await enc.saveApp(body, { author, portrait });
      const e = enc.get(r.id);
      if (e.email && app.mailer.enabled) await sendRecap(e).catch(() => {});      // échec : bouton « Renvoyer » sur l'écran suivant
      return reply.redirect(`/admin/rencontre/${r.id}/merci`, 303);
    } catch (err) {
      if (!(err instanceof EncounterError)) throw err;
      return appPage(request, reply.code(422), { errors: err.errors, values: { ...body, signature: '' } });
    }
  });

  // Écran « Merci » montré à la personne : QR vers sa page (/bonjour/J-0143-…), dans sa langue ; puis, pour le
  // photographe, le récapitulatif (envoyé par le serveur, ou prêt dans Mail).
  app.get('/admin/rencontre/:id/merci', async (request, reply) => {
    const e = enc.get(byId(request.params.id));
    if (!e || !e.ref) return reply.callNotFound();
    const r = recap(e);
    const qr = await QRCode.toString(r.link, { type: 'svg', errorCorrectionLevel: 'Q', margin: 2 });
    const mailto = e.email ? `mailto:${e.email}?${new URLSearchParams({ subject: r.subject, body: r.text }).toString().replace(/\+/g, '%20')}` : null;
    return appView(reply, 'app-merci', { title: `Rencontre ${e.ref}`, e, A: UI[e.lang] ? UI[e.lang].app : UI.fr.app, qr, mailto, smtp: app.mailer.enabled, csrf: request.session.csrf, flash: request.query.envoi || null });
  });
  app.post('/admin/rencontre/:id/envoyer', write, async (request, reply) => {
    const e = enc.get(byId(request.params.id));
    if (!e || !e.email) return reply.callNotFound();
    try { await sendRecap(e); } catch (err) { if (!(err instanceof MailError)) throw err; return reply.redirect(`/admin/rencontre/${e.id}/merci?envoi=echec`, 303); }
    return reply.redirect(`/admin/rencontre/${e.id}/merci?envoi=ok`, 303);
  });
  for (const [name, get, type] of [['portrait', id => enc.portraitJpeg(id), 'image/jpeg'], ['signature', id => enc.signaturePng(id), 'image/png']]) {
    app.get(`/admin/rencontres/:id/${name}`, async (request, reply) => {
      const buf = get(byId(request.params.id));
      if (!buf) return reply.callNotFound();
      return reply.header('cache-control', 'no-store').type(type).send(buf);
    });
  }

  // ---------- QR générique d'un photographe (vêtements, accessoires) ----------
  // /bonjour/J : SVG vectoriel (texte en tracés) ou PNG transparent à 300 dpi (600 dpi pour le QR seul).
  app.get('/admin/auteurs/:id/qr/:file', async (request, reply) => {
    const author = repo.authors().find(a => a.id === byId(request.params.id));
    const m = /^(qr|vertical|carre|logo)-(noir|blanc)\.(svg|png)$/.exec(request.params.file);
    if (!author || !m) return reply.callNotFound();
    const [, model, ink, ext] = m;
    const letter = author.card_prefix || author.slug.charAt(0).toUpperCase();
    const url = `${app.config.publicUrl}/bonjour/${letter}`;
    // Logos envoyés dans Apparence (masques PNG) ; absents : le nom du site.
    const brand = app.appearance.brand();
    const read = f => { try { return f && /^[\w.-]+\.png$/.test(f) ? fs.readFileSync(path.join(app.config.storageDir, 'brand', f)) : null; } catch { return null; } };
    const svg = await composition({ model, ink, url, display: url.replace(/^https?:\/\/(www\.)?/, ''), name: author.name, siteName: app.siteName(),
      logos: { logotype: read(brand.logotype), emblem: read(brand.emblem) } });
    const name = `${app.siteName()}-${author.slug}-${model}-${ink}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    reply.header('cache-control', 'no-store');
    if (request.query.apercu !== '1') reply.header('content-disposition', `attachment; filename="${name}.${ext}"`);
    if (ext === 'svg') return reply.type('image/svg+xml').send(svg);
    return reply.type('image/png').send(await sharp(Buffer.from(svg), { density: model === 'qr' ? 600 : 300 }).png().toBuffer());
  });

  // ---------- cartes à imprimer ----------
  // Dernier numéro imprimé par lettre (réglage « cards_printed ») : la planche suivante continue la série.
  const prefixOf = a => a.card_prefix || a.slug.charAt(0).toUpperCase();
  const nextNumber = prefix => enc.nextNumber(prefix);
  function cardsPage(request, reply, extra = {}) {
    const authors = repo.authors().map(a => ({ ...a, prefix: prefixOf(a), next: nextNumber(prefixOf(a)) }));
    return render(request, reply, 'cards', { title: 'Cartes à imprimer', authors, PER_SHEET, MAX_PAIRS, errors: {}, values: {}, ...extra });
  }
  app.get('/admin/rencontres/cartes', async (request, reply) => cardsPage(request, reply));
  app.post('/admin/rencontres/cartes', write, async (request, reply) => {
    const b = request.body || {};
    const author = repo.authors().find(a => a.id === Number(b.author_id));
    const generic = b.mode === 'generiques';
    const count = Math.round(Number(b.count));
    const from = Math.round(Number(b.from));
    const errors = {};
    if (!author) errors.author = 'Choisissez le photographe.';
    if (!(count >= 1 && count <= MAX_PAIRS)) errors.count = `De 1 à ${MAX_PAIRS} paires de cartes.`;
    if (!generic && !(from >= 1 && from + count - 1 <= 9999)) errors.from = 'Numéro de départ entre 1 et 9999.';
    if (Object.keys(errors).length) return cardsPage(request, reply.code(422), { errors, values: b });
    const qs = new URLSearchParams({ auteur: author.id, nombre: count, ...(generic ? { generiques: '1' } : { de: from }) });
    if (!generic) {
      // Numéros réservés : la prochaine planche de ce photographe commencera après.
      enc.reserve(prefixOf(author), from + count - 1);
    }
    return reply.redirect(`/admin/rencontres/cartes/planche?${qs}`, 303);
  });
  // Planche à imprimer : page autonome (sans l'habillage de l'admin), au format A4.
  app.get('/admin/rencontres/cartes/planche', async (request, reply) => {
    const author = repo.authors().find(a => a.id === Number(request.query.auteur));
    const count = Math.min(MAX_PAIRS, Math.max(1, Math.round(Number(request.query.nombre)) || PER_SHEET));
    const generic = request.query.generiques === '1';
    const from = Math.max(1, Math.round(Number(request.query.de)) || 1);
    if (!author || (!generic && from + count - 1 > 9999)) return reply.callNotFound();
    const { host, pairs } = await buildPairs({ publicUrl: app.config.publicUrl, prefix: prefixOf(author), from, count, generic, codeOf: ref => enc.codeOf(ref) });
    return reply.header('cache-control', 'no-store').render('admin/cards-sheet', {
      title: `Cartes ${generic ? 'génériques' : `${pairs[0].ref} à ${pairs.at(-1).ref}`} · ${author.name}`, author, T: TEXTS, host, sheets: sheets(pairs), generic, siteName: app.siteName(),
    });
  });

  // Photo de la carte signée : réencodée en JPEG (1600 px, sans métadonnées), gardée dans la base.
  async function readCardForm(request) {
    const body = {};
    let checked = false; let jpeg = null; let error = null;
    for await (const part of request.parts({ limits: { fileSize: CARD_MAX_BYTES, files: 1, fields: 30 } })) {
      if (part.type === 'field') {
        if (part.fieldname === '_csrf') checked = sameToken(part.value, request.session.csrf);
        else if (FIELD.test(part.fieldname)) body[part.fieldname] = part.value;
        continue;
      }
      if (!checked) { part.file.resume(); break; }
      const chunks = [];
      for await (const chunk of part.file) chunks.push(chunk);
      if (!chunks.length) continue;                                  // champ fichier laissé vide
      if (part.file.truncated) { error = 'Photo de la carte trop lourde (15 Mo au plus).'; continue; }
      if (!(await photoFormat(Buffer.concat(chunks)))) { error = 'La photo de la carte doit être une image JPEG, PNG ou WebP (sur iPhone, l’appareil photo la convertit tout seul).'; continue; }
      try {
        jpeg = await sharp(Buffer.concat(chunks), { limitInputPixels: 60e6 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      } catch {
        error = 'La photo de la carte doit être une image JPEG, PNG ou WebP (sur iPhone, l’appareil photo la convertit tout seul).';
      }
    }
    return { body, checked, jpeg, error };
  }
  async function saveCard(request, reply, id) {
    let form;
    try { form = await readCardForm(request); } catch (err) { if (!err.code?.startsWith('FST_')) throw err; form = { body: {}, checked: false, error: 'Envoi invalide.' }; }
    if (!form.checked) return reply.code(403).send('Jeton CSRF invalide.');
    const back = id ? `/admin/rencontres/${id}` : '/admin/rencontres';
    if (form.error) return failed(reply, back, form.error);
    try {
      const saved = enc.saveCard(id, form.body, form.jpeg);
      return done(reply, `/admin/rencontres/${saved}`, form.body.signed === 'on' ? 'Accord signé enregistré.' : 'Rencontre enregistrée.');
    } catch (err) {
      if (!(err instanceof EncounterError)) throw err;
      if (id) return detail(request, reply.code(422), id, { errors: err.errors, values: form.body });
      return page(request, reply.code(422), 'encounters', { title: 'Rencontres', list: enc.list(), authors: repo.authors(), errors: err.errors, values: form.body });
    }
  }
  app.post('/admin/rencontres', async (request, reply) => saveCard(request, reply, null));
  app.post('/admin/rencontres/:id', async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.get(id)) return reply.callNotFound();
    return saveCard(request, reply, id);
  });

  app.get('/admin/rencontres/:id/carte', async (request, reply) => {
    const jpeg = enc.cardJpeg(byId(request.params.id));
    if (!jpeg) return reply.callNotFound();
    return reply.header('cache-control', 'no-store').type('image/jpeg').send(jpeg);
  });

  app.post('/admin/rencontres/:id/statut', write, async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.get(id)) return reply.callNotFound();
    enc.setStatus(id, request.body?.status);
    return done(reply, `/admin/rencontres/${id}`, `Rencontre marquée « ${STATUS[request.body?.status] || '?'} ».`);
  });

  app.post('/admin/rencontres/:id/photos', write, async (request, reply) => {
    const id = byId(request.params.id);
    const e = enc.get(id);
    if (!e) return reply.callNotFound();
    const ids = [].concat(request.body?.photo || []).map(Number).filter(Number.isInteger);
    if (!ids.length) return failed(reply, `/admin/rencontres/${id}#photos`, 'Cochez au moins une photo.');
    enc.link(id, ids);
    const refusal = e.refused ? ' La personne refuse la publication : appliquez le refus pour dépublier les photos liées.' : '';
    return done(reply, `/admin/rencontres/${id}#photos`, `${ids.length} photo${ids.length > 1 ? 's liées' : ' liée'} à la rencontre.${refusal}`);
  });
  app.post('/admin/rencontres/:id/photos/:pid/retirer', write, async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.get(id)) return reply.callNotFound();
    enc.unlink(id, byId(request.params.pid));
    return done(reply, `/admin/rencontres/${id}#photos`, 'Photo retirée de la rencontre.');
  });

  // Refus : les photos liées repassent en brouillon et quittent la file Instagram ; elles ne pourront plus être publiées.
  app.post('/admin/rencontres/:id/refus', write, async (request, reply) => {
    const id = byId(request.params.id);
    const e = enc.get(id);
    if (!e) return reply.callNotFound();
    if (!e.refused) return failed(reply, `/admin/rencontres/${id}`, 'Cette personne n’a pas refusé la publication.');
    const ids = enc.applyRefusal(id);
    app.instagram.onUnpublished(enc.photos(id).map(p => p.id));
    app.variants.schedule();
    return done(reply, `/admin/rencontres/${id}`, ids.length ? `${ids.length} photo${ids.length > 1 ? 's repassées' : ' repassée'} en brouillon et retirée${ids.length > 1 ? 's' : ''} de la file Instagram.` : 'Aucune photo publiée : les photos liées restent en brouillon et ne pourront pas être publiées.');
  });

  // ---------- droits de la personne (RGPD) ----------
  // Accès : une archive avec tout ce que la base garde sur elle, les images (signature, photo de repère, carte) et les
  // photos liées (JPEG 2048 px, jamais l'original), et un mode d'emploi dans sa langue.
  const README = {
    fr: (site, ref) => `Vos données chez ${site}${ref ? ` (rencontre ${ref})` : ''}\n\ndonnees.json : tout ce que nous gardons sur vous (rencontre, choix, accord ou refus, historique de vos demandes).\nsignature.png, photo-de-reperage.jpg, carte-signee.jpg : s'ils existent.\nphotos/ : les photos où vous apparaissez.\n\nDurées de conservation et droits : page « Confidentialité » du site.\n`,
    en: (site, ref) => `Your data at ${site}${ref ? ` (meeting ${ref})` : ''}\n\ndonnees.json: everything we keep about you (meeting, choices, consent or refusal, history of your requests).\nsignature.png, photo-de-reperage.jpg, carte-signee.jpg: if they exist.\nphotos/: the photos you appear in.\n\nRetention periods and rights: the website's "Privacy" page.\n`,
    de: (site, ref) => `Ihre Daten bei ${site}${ref ? ` (Begegnung ${ref})` : ''}\n\ndonnees.json: alles, was wir über Sie speichern (Begegnung, Wahl, Einwilligung oder Ablehnung, Verlauf Ihrer Anfragen).\nsignature.png, photo-de-reperage.jpg, carte-signee.jpg: falls vorhanden.\nphotos/: die Fotos, auf denen Sie zu sehen sind.\n\nAufbewahrungsfristen und Rechte: Seite „Datenschutz“ der Website.\n`,
  };
  app.get('/admin/rencontres/:id/export.zip', async (request, reply) => {
    const id = byId(request.params.id);
    const x = enc.exportData(id);
    if (!x) return reply.callNotFound();
    const entries = [{ name: 'LISEZMOI.txt', data: (README[x.lang] || README.fr)(app.siteName(), x.ref) }, { name: 'donnees.json', data: `${JSON.stringify(x.data, null, 2)}\n` }];
    if (x.files.signature) entries.push({ name: 'signature.png', data: x.files.signature });
    if (x.files.portrait) entries.push({ name: 'photo-de-reperage.jpg', data: x.files.portrait });
    if (x.files.card) entries.push({ name: 'carte-signee.jpg', data: x.files.card });
    for (const p of enc.photos(id)) {
      try {
        const jpeg = await sharp(path.join(app.config.storageDir, 'originals', p.file)).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
        entries.push({ name: `photos/${p.slug}.jpg`, data: jpeg });
      } catch { /* original introuvable : la photo est signalée dans donnees.json */ }
    }
    app.db.prepare('INSERT INTO encounter_events (encounter_id, at, kind, detail) VALUES (?, ?, ?, ?)').run(id, Date.now(), 'export', '{}');
    const name = `${app.siteName()}-donnees-${x.ref || id}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    return reply.header('cache-control', 'no-store').header('content-disposition', `attachment; filename="${name}.zip"`).type('application/zip').send(zip(entries));
  });

  // Effacement à la demande : la rencontre (adresse, messages, signature, images), et sur demande les photos liées
  // (originaux et images ; effacées des sauvegardes sous 90 jours). Un refus reste appliqué sous forme anonyme si des
  // photos liées sont gardées. Les posts déjà publiés sur Instagram sont rappelés : à supprimer dans l'application.
  async function eraseEncounter(request, reply, { withPhotos }) {
    const id = byId(request.params.id);
    const e = enc.get(id);
    if (!e) return reply.callNotFound();
    const linked = enc.photos(id);
    const posts = linked.length ? app.db.prepare(`SELECT permalink FROM instagram_posts WHERE status = 'published' AND permalink IS NOT NULL
      AND photo_id IN (${linked.map(() => '?').join(',')})`).pluck().all(...linked.map(p => p.id)) : [];
    if (withPhotos) {
      for (const p of linked) { const file = repo.deletePhoto(p.id); if (file) removePhotoFiles(app.config.storageDir, file); }
      app.instagram.onUnpublished(linked.map(p => p.id));
    }
    const r = enc.erase(id);
    const details = posts.length ? ['Encore sur Instagram, à supprimer dans l’application :', ...posts] : undefined;
    const text = `${r.anonymized ? 'Données de la personne effacées ; son refus reste appliqué aux photos gardées (trace anonyme).' : 'Rencontre et données de la personne effacées.'}${withPhotos && linked.length ? ` ${linked.length} photo${linked.length > 1 ? 's supprimées' : ' supprimée'} (effacée${linked.length > 1 ? 's' : ''} des sauvegardes sous 90 jours).` : ''}`;
    return done(reply, r.anonymized ? `/admin/rencontres/${id}` : '/admin/rencontres', text, details);
  }
  app.post('/admin/rencontres/:id/effacer', write, async (request, reply) => eraseEncounter(request, reply, { withPhotos: request.body?.photos === 'on' }));
  app.post('/admin/rencontres/:id/supprimer', write, async (request, reply) => eraseEncounter(request, reply, { withPhotos: false }));
  app.post('/admin/rencontres/:id/droits-traites', write, async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.get(id)) return reply.callNotFound();
    enc.rightsDone(id);
    return done(reply, `/admin/rencontres/${id}`, 'Demande sur les données marquée comme traitée.');
  });
}
