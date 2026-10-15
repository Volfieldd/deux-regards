import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { EncounterError, SCOPES, SCOPE_LABELS } from '../encounters.js';
import { sameToken } from '../auth.js';
import { ABSOLUTE_TTL } from '../sessions.js';
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

export function registerEncounters(app, { repo, render, P, W, done, failed, withReady }) {
  const enc = app.encounters;
  const STATUS = { nouvelle: 'Nouvelle', en_cours: 'En cours', traitee: 'Traitée' };
  // Libellés et dates dans la langue de l'admin (t : request.t).
  const statusOf = t => ({ nouvelle: t('Nouvelle'), en_cours: t('En cours'), traitee: t('Traitée') });
  const fmtOf = t => ms => new Intl.DateTimeFormat(t.locale, { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
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

  const page = (request, reply, view, data) => render(request, reply, view, { STATUS: statusOf(request.t), SCOPES, SCOPE_LABELS, fmt: fmtOf(request.t), ...data });

  app.get('/admin/rencontres', P('personnes.voir'), async (request, reply) => {
    const status = Object.hasOwn(STATUS, request.query.statut) ? request.query.statut : undefined;
    return page(request, reply, 'encounters', { title: request.t('Personnes photographiées'), list: enc.list({ status }), status, authors: repo.authors(), errors: {}, values: {} });
  });

  function detail(request, reply, id, extra = {}) {
    const e = enc.get(id);
    if (!e) return reply.callNotFound();
    const search = String(request.query.q || '').slice(0, 100);
    return page(request, reply, 'encounter', {
      title: e.ref ? request.t('Rencontre {ref}', { ref: e.ref }) : request.t('Rencontre du {date}', { date: fmtOf(request.t)(e.created_at) }), e, events: enc.events(id),
      photos: enc.photos(id).map(withReady), session: (s => ({ ...s, photos: s.photos.map(withReady) }))(enc.session(id)), candidates: candidates(e, search), search, authors: repo.authors(),
      code: e.ref ? enc.codeOf(e.ref) : null, shares: sharesOf(e, fmtOf(request.t)), errors: {}, values: null,
      outingUrl: e.author_id ? app.outings.urlOf(e.author_id, e.session_day || e.met_on, e.met_time) : null, ...extra,
    });
  }
  // Liens « photo offerte » : adresse, et message prêt à envoyer dans la langue de la personne (mailto).
  function sharesOf(e, fmt) {
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
  app.post('/admin/rencontres/:id/liens', W('personnes.offrir'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.get(id)) return reply.callNotFound();
    try {
      enc.createShare(id, Number(request.body?.photo_id));
    } catch (err) {
      if (!(err instanceof EncounterError)) throw err;
      return failed(reply, `/admin/rencontres/${id}#photos`, err.message);
    }
    return done(reply, `/admin/rencontres/${id}#liens`, request.t('Lien privé créé, valable 30 jours : envoyez-le à la personne.'));
  });
  app.post('/admin/rencontres/:id/liens/:token/retirer', W('personnes.offrir'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.revokeShare(id, String(request.params.token))) return reply.callNotFound();
    return done(reply, `/admin/rencontres/${id}#liens`, request.t('Lien retiré : il ne fonctionne plus.'));
  });

  app.get('/admin/rencontres/:id', P('personnes.voir'), async (request, reply) => detail(request, reply, byId(request.params.id)));

  // ---------- rencontre saisie sur le téléphone (web app installable) ----------
  const LOCALE = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' };
  const appView = (reply, view, data) => reply.header('cache-control', 'no-store').render(`admin/${view}`, { siteName: app.siteName(), UI, t: reply.request.t, lang: reply.request.t.lang, locale: reply.request.t.locale, ...data });
  const authorOf = request => repo.authorBySub(request.session.sub) || null;
  function appPage(request, reply, extra = {}) {
    // Photographe : celui choisi sur l'accueil Terrain (?photographe=), sinon celui du compte.
    const author = repo.authors().find(a => a.id === Number(request.query?.photographe)) || authorOf(request);
    const authors = repo.authors().map(a => ({ ...a, prefix: prefixOf(a), next: `${prefixOf(a)}-${String(nextNumber(prefixOf(a))).padStart(4, '0')}` }));
    // « Déjà rencontrée ? » : les personnes vues par ce photographe ces 30 derniers jours.
    const since = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(Date.now() - 30 * 864e5);
    const recent = author ? app.db.prepare(`SELECT person_id, MAX(COALESCE(NULLIF(session_day, ''), met_on)) AS d FROM encounters WHERE author_id = ? AND person_id IS NOT NULL
      AND COALESCE(NULLIF(session_day, ''), met_on) >= ? AND anonymized = 0 GROUP BY person_id ORDER BY d DESC LIMIT 40`).all(author.id, since)
      .map(r => ({ ...app.people.get(r.person_id), day: r.d })).filter(p => p.id) : [];
    return appView(reply, 'app', { title: request.t('Nouvelle rencontre'), host: app.config.publicUrl.replace(/^https?:\/\/(www\.)?/, ''), author, authors, recent, csrf: request.session.csrf, errors: {}, values: { lang: 'fr', author_id: author?.id }, ...extra });
  }
  app.get('/admin/rencontre', { config: { geolocation: true, perm: 'terrain.app' } }, async (request, reply) => appPage(request, reply));

  // ---------- accueil « Terrain » de l'app ----------
  // Ce qu'ouvre l'icône de l'app : nouvelle rencontre, mon QR (la composition des vêtements, à montrer), ma sortie
  // du jour (les personnes déjà vues aujourd'hui et leur décision), et l'admin complet.
  const parisDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(Date.now());
  const fieldAuthor = request => {
    const authors = repo.authors();
    return { authors, author: authors.find(a => a.id === Number(request.query.photographe)) || authorOf(request) || null };
  };
  app.get('/admin/rencontre/accueil', P('terrain.app'), async (request, reply) => {
    const { authors, author } = fieldAuthor(request);
    const day = parisDay();
    const people = author ? app.db.prepare("SELECT id FROM encounters WHERE author_id = ? AND COALESCE(NULLIF(session_day, ''), NULLIF(met_on, '')) = ? AND anonymized = 0 ORDER BY id")
      .pluck().all(author.id, day).map(id => enc.get(id)).filter(Boolean) : [];
    // La partie de la journée en cours (si la sortie est coupée).
    const nowTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(Date.now());
    const outing = author ? app.outings.partAt(author.slug, day, nowTime) : null;
    return appView(reply, 'app-home', { title: request.t('Terrain'), authors, author, people, day, csrf: request.session.csrf,
      next: author ? `${prefixOf(author)}-${String(nextNumber(prefixOf(author))).padStart(4, '0')}` : null,
      place: outing?.place || '', outingUrl: author ? app.outings.urlOf(author.id, day, nowTime) : null, photos: outing ? outing.photos.length : 0 });
  });
  app.get('/admin/rencontre/qr', P('terrain.app'), async (request, reply) => {
    const { authors, author } = fieldAuthor(request);
    if (!author) return reply.redirect('/admin/rencontre/accueil', 303);
    return appView(reply, 'app-qr', { title: request.t('Mon QR'), author, authors, letter: prefixOf(author), host: app.config.publicUrl.replace(/^https?:\/\/(www\.)?/, '') });
  });

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

  app.post('/admin/rencontre', { config: { geolocation: true, perm: 'terrain.app' } }, async (request, reply) => {
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
        if (part.file.truncated) error = request.t('Photo trop lourde (15 Mo au plus).');
        else if (chunks.length) portrait = Buffer.concat(chunks);
      }
    } catch (err) {
      if (!err.code?.startsWith('FST_')) throw err;
      error = request.t('Envoi invalide.');
    }
    if (!checked) return reply.code(403).send(request.t('Jeton CSRF invalide.'));
    const author = repo.authors().find(a => a.id === Number(body.author_id)) || authorOf(request);
    try {
      if (error) throw new EncounterError({ portrait: error });
      if (portrait && !(await photoFormat(portrait))) throw new EncounterError({ portrait: request.t('La photo doit être une image JPEG, PNG ou WebP.') });
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
  app.get('/admin/rencontre/:id/merci', P('terrain.app'), async (request, reply) => {
    const e = enc.get(byId(request.params.id));
    if (!e || !e.ref) return reply.callNotFound();
    const r = recap(e);
    const qr = await QRCode.toString(r.link, { type: 'svg', errorCorrectionLevel: 'Q', margin: 2 });
    const mailto = e.email ? `mailto:${e.email}?${new URLSearchParams({ subject: r.subject, body: r.text }).toString().replace(/\+/g, '%20')}` : null;
    return appView(reply, 'app-merci', { title: request.t('Rencontre {ref}', { ref: e.ref }), e, A: UI[e.lang] ? UI[e.lang].app : UI.fr.app, qr, mailto, smtp: app.mailer.enabled, csrf: request.session.csrf, flash: request.query.envoi || null });
  });
  app.post('/admin/rencontre/:id/envoyer', W('terrain.app'), async (request, reply) => {
    const e = enc.get(byId(request.params.id));
    if (!e || !e.email) return reply.callNotFound();
    try { await sendRecap(e); } catch (err) { if (!(err instanceof MailError)) throw err; return reply.redirect(`/admin/rencontre/${e.id}/merci?envoi=echec`, 303); }
    return reply.redirect(`/admin/rencontre/${e.id}/merci?envoi=ok`, 303);
  });
  for (const [name, get, type] of [['portrait', id => enc.portraitJpeg(id), 'image/jpeg'], ['signature', id => enc.signaturePng(id), 'image/png']]) {
    app.get(`/admin/rencontres/:id/${name}`, P('personnes.voir'), async (request, reply) => {
      const buf = get(byId(request.params.id));
      if (!buf) return reply.callNotFound();
      // Vignette ronde des listes (visage) : 160 px suffisent.
      if (name === 'portrait' && request.query.mini === '1') {
        return reply.header('cache-control', 'no-store').type('image/jpeg').send(await sharp(buf).resize(160, 160, { fit: 'cover' }).jpeg({ quality: 75 }).toBuffer());
      }
      return reply.header('cache-control', 'no-store').type(type).send(buf);
    });
  }

  // ---------- QR générique d'un photographe (vêtements, accessoires) ----------
  // /bonjour/J : SVG vectoriel (texte en tracés) ou PNG transparent à 300 dpi (600 dpi pour le QR seul).
  app.get('/admin/auteurs/:id/qr/:file', P('terrain.cartes'), async (request, reply) => {
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

  // ---------- sur le terrain ----------
  // Ce qui part dans la rue : l'app sur le téléphone, les cartes d'accord, le QR des vêtements (une seule
  // composition, celle du dos avec le logo, à montrer telle quelle), et une liste de contrôle avant de partir.
  app.get('/admin/terrain', P('terrain.app'), async (request, reply) => {
    const authors = repo.authors();
    const mine = authorOf(request);
    const chosen = authors.find(a => a.id === Number(request.query.photographe)) || mine || authors[0] || null;
    const prefix = chosen ? prefixOf(chosen) : null;
    const until = request.session.created_at ? request.session.created_at + ABSOLUTE_TTL : null;
    return render(request, reply, 'terrain', {
      title: request.t('Sur le terrain'), authors, chosen, prefix,
      next: prefix ? enc.nextNumber(prefix) : null, left: prefix ? enc.cardsLeft(prefix) : 0,
      until: until ? new Intl.DateTimeFormat(request.t.locale, { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(until) : null,
      smtp: app.mailer.enabled, host: app.config.publicUrl.replace(/^https?:\/\/(www\.)?/, ''),
    });
  });

  // ---------- cartes à imprimer ----------
  // Dernier numéro imprimé par lettre (réglage « cards_printed ») : la planche suivante continue la série.
  const prefixOf = a => a.card_prefix || a.slug.charAt(0).toUpperCase();
  const nextNumber = prefix => enc.nextNumber(prefix);
  function cardsPage(request, reply, extra = {}) {
    const authors = repo.authors().map(a => ({ ...a, prefix: prefixOf(a), next: nextNumber(prefixOf(a)) }));
    return render(request, reply, 'cards', { title: request.t('Cartes d’accord'), authors, PER_SHEET, MAX_PAIRS, errors: {}, values: {}, ...extra });
  }
  app.get('/admin/rencontres/cartes', P('terrain.cartes'), async (request, reply) => cardsPage(request, reply));
  app.post('/admin/rencontres/cartes', W('terrain.cartes'), async (request, reply) => {
    const b = request.body || {};
    const author = repo.authors().find(a => a.id === Number(b.author_id));
    const generic = b.mode === 'generiques';
    const count = Math.round(Number(b.count));
    const from = Math.round(Number(b.from));
    const errors = {};
    if (!author) errors.author = request.t('Choisissez le photographe.');
    if (!(count >= 1 && count <= MAX_PAIRS)) errors.count = request.t('De 1 à {max} paires de cartes.', { max: MAX_PAIRS });
    if (!generic && !(from >= 1 && from + count - 1 <= 9999)) errors.from = request.t('Numéro de départ entre 1 et 9999.');
    if (Object.keys(errors).length) return cardsPage(request, reply.code(422), { errors, values: b });
    const qs = new URLSearchParams({ auteur: author.id, nombre: count, ...(generic ? { generiques: '1' } : { de: from }) });
    if (!generic) {
      // Numéros réservés : la prochaine planche de ce photographe commencera après.
      enc.reserve(prefixOf(author), from + count - 1);
    }
    return reply.redirect(`/admin/rencontres/cartes/planche?${qs}`, 303);
  });
  // Planche à imprimer : page autonome (sans l'habillage de l'admin), au format A4.
  app.get('/admin/rencontres/cartes/planche', P('terrain.cartes'), async (request, reply) => {
    const author = repo.authors().find(a => a.id === Number(request.query.auteur));
    const count = Math.min(MAX_PAIRS, Math.max(1, Math.round(Number(request.query.nombre)) || PER_SHEET));
    const generic = request.query.generiques === '1';
    const from = Math.max(1, Math.round(Number(request.query.de)) || 1);
    if (!author || (!generic && from + count - 1 > 9999)) return reply.callNotFound();
    const { host, pairs } = await buildPairs({ publicUrl: app.config.publicUrl, prefix: prefixOf(author), from, count, generic, codeOf: ref => enc.codeOf(ref) });
    return reply.header('cache-control', 'no-store').render('admin/cards-sheet', {
      title: generic ? request.t('Cartes génériques · {name}', { name: author.name }) : request.t('Cartes {from} à {to} · {name}', { from: pairs[0].ref, to: pairs.at(-1).ref, name: author.name }), author, T: TEXTS, host, sheets: sheets(pairs), generic, siteName: app.siteName(),
    });
  });

  // Photo de la carte signée : réencodée en JPEG (1600 px, sans métadonnées), gardée dans la base.
  async function readCardForm(request) {
    const body = {};
    let checked = false; let error = null;
    const images = { card: null, portrait: null };
    for await (const part of request.parts({ limits: { fileSize: CARD_MAX_BYTES, files: 2, fields: 30 } })) {
      if (part.type === 'field') {
        if (part.fieldname === '_csrf') checked = sameToken(part.value, request.session.csrf);
        else if (FIELD.test(part.fieldname)) body[part.fieldname] = part.value;
        continue;
      }
      if (!checked) { part.file.resume(); break; }
      const chunks = [];
      for await (const chunk of part.file) chunks.push(chunk);
      if (!chunks.length || !Object.hasOwn(images, part.fieldname)) continue;   // champ fichier laissé vide
      const card = part.fieldname === 'card';
      if (part.file.truncated) { error = card ? request.t('La photo de la carte est trop lourde (15 Mo au plus).') : request.t('La photo de la personne est trop lourde (15 Mo au plus).'); continue; }
      if (!(await photoFormat(Buffer.concat(chunks)))) {
        error = card ? request.t('La photo de la carte doit être une image JPEG, PNG ou WebP (sur iPhone, l’appareil photo la convertit tout seul).')
          : request.t('La photo de la personne doit être une image JPEG, PNG ou WebP (sur iPhone, l’appareil photo la convertit tout seul).');
        continue;
      }
      images[part.fieldname] = await sharp(Buffer.concat(chunks), { limitInputPixels: 60e6 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    }
    return { body, checked, jpeg: images.card, portrait: images.portrait, error };
  }
  async function saveCard(request, reply, id) {
    let form;
    try { form = await readCardForm(request); } catch (err) { if (!err.code?.startsWith('FST_')) throw err; form = { body: {}, checked: false, error: request.t('Envoi invalide.') }; }
    if (!form.checked) return reply.code(403).send(request.t('Jeton CSRF invalide.'));
    const back = id ? `/admin/rencontres/${id}` : '/admin/rencontres';
    if (form.error) return failed(reply, back, form.error);
    try {
      const saved = enc.saveCard(id, form.body, form.jpeg, form.portrait);
      return done(reply, `/admin/rencontres/${saved}`, form.body.signed === 'on' ? request.t('Accord signé enregistré.') : request.t('Rencontre enregistrée.'));
    } catch (err) {
      if (!(err instanceof EncounterError)) throw err;
      if (id) return detail(request, reply.code(422), id, { errors: err.errors, values: form.body });
      return page(request, reply.code(422), 'encounters', { title: request.t('Personnes photographiées'), list: enc.list(), authors: repo.authors(), errors: err.errors, values: form.body });
    }
  }
  app.post('/admin/rencontres', P('personnes.gerer'), async (request, reply) => saveCard(request, reply, null));
  app.post('/admin/rencontres/:id', P('personnes.gerer'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.get(id)) return reply.callNotFound();
    return saveCard(request, reply, id);
  });

  app.get('/admin/rencontres/:id/carte', P('personnes.voir'), async (request, reply) => {
    const jpeg = enc.cardJpeg(byId(request.params.id));
    if (!jpeg) return reply.callNotFound();
    return reply.header('cache-control', 'no-store').type('image/jpeg').send(jpeg);
  });

  app.post('/admin/rencontres/:id/statut', W('personnes.gerer'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.get(id)) return reply.callNotFound();
    enc.setStatus(id, request.body?.status);
    return done(reply, `/admin/rencontres/${id}`, request.t('Rencontre marquée « {status} ».', { status: statusOf(request.t)[request.body?.status] || '?' }));
  });

  // Accord par session : exclure (ou rétablir) une photo du jour que l'accord ne doit pas couvrir.
  app.post('/admin/rencontres/:id/session/:pid', W('personnes.gerer'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.get(id)) return reply.callNotFound();
    const out = request.body?.exclure === '1';
    const pid = byId(request.params.pid);
    enc.exclude(id, pid, out);
    // Depuis la fiche photo (« Pas sur cette photo ») : retour à la fiche.
    const back = request.body?.depuis === 'photo' ? `/admin/photos/${pid}#rencontres` : `/admin/rencontres/${id}#session`;
    return done(reply, back, out ? request.t('Photo exclue de l’accord de cette sortie : la personne n’y figure pas.') : request.t('Photo de nouveau couverte par l’accord de cette sortie.'));
  });

  app.post('/admin/rencontres/:id/photos', W('personnes.gerer'), async (request, reply) => {
    const id = byId(request.params.id);
    const e = enc.get(id);
    if (!e) return reply.callNotFound();
    const ids = [].concat(request.body?.photo || []).map(Number).filter(Number.isInteger);
    if (!ids.length) return failed(reply, `/admin/rencontres/${id}#photos`, request.t('Cochez au moins une photo.'));
    enc.link(id, ids);
    const refusal = e.refused ? ` ${request.t('La personne refuse la publication : appliquez le refus pour dépublier les photos liées.')}` : '';
    const linkedText = ids.length > 1 ? request.t('{n} photos liées à la rencontre.', { n: ids.length }) : request.t('1 photo liée à la rencontre.');
    return done(reply, `/admin/rencontres/${id}#photos`, `${linkedText}${refusal}`);
  });
  app.post('/admin/rencontres/:id/photos/:pid/retirer', W('personnes.gerer'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.get(id)) return reply.callNotFound();
    enc.unlink(id, byId(request.params.pid));
    return done(reply, `/admin/rencontres/${id}#photos`, request.t('Photo retirée de la rencontre.'));
  });

  // Refus : les photos liées repassent en brouillon et quittent la file Instagram ; elles ne pourront plus être publiées.
  app.post('/admin/rencontres/:id/refus', W('personnes.refus'), async (request, reply) => {
    const id = byId(request.params.id);
    const e = enc.get(id);
    if (!e) return reply.callNotFound();
    if (!e.refused) return failed(reply, `/admin/rencontres/${id}`, request.t('Cette personne n’a pas refusé la publication.'));
    const ids = enc.applyRefusal(id);
    app.instagram.onUnpublished(enc.photos(id).map(p => p.id));
    app.variants.schedule();
    return done(reply, `/admin/rencontres/${id}`, ids.length > 1 ? request.t('{n} photos repassées en brouillon et retirées de la file Instagram.', { n: ids.length })
      : ids.length ? request.t('1 photo repassée en brouillon et retirée de la file Instagram.') : request.t('Aucune photo publiée : les photos liées restent en brouillon et ne pourront pas être publiées.'));
  });

  // ---------- droits de la personne (RGPD) ----------
  // Accès : une archive avec tout ce que la base garde sur elle, les images (signature, photo de repère, carte) et les
  // photos liées (JPEG 2048 px, jamais l'original), et un mode d'emploi dans sa langue.
  const README = {
    fr: (site, ref) => `Vos données chez ${site}${ref ? ` (rencontre ${ref})` : ''}\n\ndonnees.json : tout ce que nous gardons sur vous (rencontre, choix, accord ou refus, historique de vos demandes).\nsignature.png, photo-de-reperage.jpg, carte-signee.jpg : s'ils existent.\nphotos/ : les photos où vous apparaissez.\n\nDurées de conservation et droits : page « Confidentialité » du site.\n`,
    en: (site, ref) => `Your data at ${site}${ref ? ` (meeting ${ref})` : ''}\n\ndonnees.json: everything we keep about you (meeting, choices, consent or refusal, history of your requests).\nsignature.png, photo-de-reperage.jpg, carte-signee.jpg: if they exist.\nphotos/: the photos you appear in.\n\nRetention periods and rights: the website's "Privacy" page.\n`,
    de: (site, ref) => `Ihre Daten bei ${site}${ref ? ` (Begegnung ${ref})` : ''}\n\ndonnees.json: alles, was wir über Sie speichern (Begegnung, Wahl, Einwilligung oder Ablehnung, Verlauf Ihrer Anfragen).\nsignature.png, photo-de-reperage.jpg, carte-signee.jpg: falls vorhanden.\nphotos/: die Fotos, auf denen Sie zu sehen sind.\n\nAufbewahrungsfristen und Rechte: Seite „Datenschutz“ der Website.\n`,
  };
  app.get('/admin/rencontres/:id/export.zip', P('personnes.exporter'), async (request, reply) => {
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
    app.people.sync();
    const t = request.t;
    const details = posts.length ? [t('Encore sur Instagram, à supprimer dans l’application :'), ...posts] : undefined;
    const removed = linked.length > 1 ? t('{n} photos supprimées (effacées des sauvegardes sous 90 jours).', { n: linked.length }) : t('1 photo supprimée (effacée des sauvegardes sous 90 jours).');
    const text = `${r.anonymized ? t('Données de la personne effacées ; son refus reste appliqué aux photos gardées (trace anonyme).') : t('Rencontre et données de la personne effacées.')}${withPhotos && linked.length ? ` ${removed}` : ''}`;
    return done(reply, r.anonymized ? `/admin/rencontres/${id}` : '/admin/rencontres', text, details);
  }
  app.post('/admin/rencontres/:id/effacer', W('personnes.effacer'), async (request, reply) => {
    if (request.body?.photos === 'on' && !request.can('photos.supprimer')) return app.forbid(request, reply);
    return eraseEncounter(request, reply, { withPhotos: request.body?.photos === 'on' });
  });
  app.post('/admin/rencontres/:id/supprimer', W('personnes.effacer'), async (request, reply) => eraseEncounter(request, reply, { withPhotos: false }));
  // ---------- personnes ----------
  // Une personne et ses rencontres (une par sortie) : la liste, la fiche, et ce qu'on y fait (rapprocher, séparer,
  // ajouter à une sortie, lier des photos, exporter, effacer). La création passe d'abord par l'app (Nouvelle rencontre).
  const people = app.people;
  const personPage = (request, reply, view, data) => page(request, reply, view, { section: 'people', ...data });
  app.get('/admin/personnes', P('personnes.voir'), async (request, reply) => {
    const search = String(request.query.q || '').slice(0, 100);
    return personPage(request, reply, 'people', { title: request.t('Personnes photographiées'), list: people.list({ search }), search });
  });
  app.get('/admin/personnes/:id', P('personnes.voir'), async (request, reply) => {
    const id = byId(request.params.id);
    const person = people.get(id);
    if (!person) return reply.callNotFound();
    const search = String(request.query.q || '').slice(0, 100);
    const others = people.suggestions(id).map(o => people.get(o)).filter(Boolean);
    // Rencontres d'autres personnes à rattacher (les plus récentes, ou cherchées par référence ou nom).
    const needle = search.toLowerCase();
    const attachable = enc.list().filter(e => e.person_id !== id && !e.anonymized)
      .filter(e => !needle || [e.ref, e.name, e.email].some(v => String(v || '').toLowerCase().includes(needle))).slice(0, 20);
    const linked = new Set(person.photos.map(p => p.id));
    const photoCandidates = repo.photos({ q: search }).filter(p => !linked.has(p.id) && /^\d{4}-\d{2}-\d{2}$/.test(p.taken_on || '')).slice(0, 24).map(withReady);
    const outings = app.outings.list().slice(0, 40).map(o => ({ author: o.author, day: o.day, starts: o.starts, place: o.place }));
    return personPage(request, reply, 'person', { title: person.name || person.ref || request.t('Personne'), person: { ...person, photos: person.photos.map(withReady) },
      others, attachable, photoCandidates, outings, search, outingUrl: (aid, d, t) => app.outings.urlOf(aid, d, t) });
  });
  const personOr404 = (request, reply) => { const p = people.get(byId(request.params.id)); if (!p) reply.callNotFound(); return p; };
  const toPerson = id => `/admin/personnes/${id}`;
  app.post('/admin/personnes/:id/fusionner', W('personnes.gerer'), async (request, reply) => {
    const p = personOr404(request, reply); if (!p) return reply;
    const other = Number(request.body?.autre);
    if (!people.merge(p.id, other)) return failed(reply, toPerson(p.id), request.t('Rapprochement impossible.'));
    return done(reply, toPerson(p.id), request.t('Rencontres réunies : c’est la même personne.'));
  });
  app.post('/admin/personnes/:id/ecarter', W('personnes.gerer'), async (request, reply) => {
    const p = personOr404(request, reply); if (!p) return reply;
    people.dismiss(p.id, Number(request.body?.autre));
    return done(reply, toPerson(p.id), request.t('Rapprochement écarté : ce sont deux personnes différentes.'));
  });
  app.post('/admin/personnes/:id/rattacher', W('personnes.gerer'), async (request, reply) => {
    const p = personOr404(request, reply); if (!p) return reply;
    if (!people.attach(p.id, Number(request.body?.rencontre))) return failed(reply, toPerson(p.id), request.t('Rencontre introuvable.'));
    return done(reply, toPerson(p.id), request.t('Rencontre rattachée à cette personne.'));
  });
  app.post('/admin/personnes/:id/detacher', W('personnes.gerer'), async (request, reply) => {
    const p = personOr404(request, reply); if (!p) return reply;
    const eid = Number(request.body?.rencontre);
    if (!p.meetings.some(e => e.id === eid)) return failed(reply, toPerson(p.id), request.t('Rencontre introuvable.'));
    const pid = people.detach(eid);
    if (!pid) return failed(reply, toPerson(p.id), request.t('Une personne garde au moins une rencontre.'));
    return done(reply, toPerson(pid), request.t('Rencontre séparée : c’est une autre personne.'));
  });
  app.post('/admin/personnes/:id/sortie', W('personnes.gerer'), async (request, reply) => {
    const p = personOr404(request, reply); if (!p) return reply;
    const [aid, d, t] = String(request.body?.sortie || '').split('|');
    const author = repo.authors().find(a => a.id === Number(aid));
    const id = author ? people.addMeeting(p.id, { authorId: author.id, day: d, time: t === '00:00' ? '' : t }) : null;
    if (!id) return failed(reply, toPerson(p.id), request.t('Choisissez une sortie.'));
    return done(reply, toPerson(p.id), request.t('La personne est ajoutée à cette sortie (sans décision : demandez-lui son accord).'));
  });
  app.post('/admin/personnes/:id/photos', W('personnes.gerer'), async (request, reply) => {
    const p = personOr404(request, reply); if (!p) return reply;
    const ids = [].concat(request.body?.photo || []).map(Number).filter(Number.isInteger);
    if (!ids.length) return failed(reply, toPerson(p.id), request.t('Cochez au moins une photo.'));
    const n = people.linkPhotos(p.id, ids);
    return done(reply, toPerson(p.id), n > 1 ? request.t('{n} photos liées à cette personne (à sa rencontre de la sortie de chaque photo).', { n }) : request.t('{n} photo liée à cette personne (à sa rencontre de la sortie de chaque photo).', { n }));
  });
  // Droits : tout ce qui concerne la personne, toutes rencontres confondues.
  app.get('/admin/personnes/:id/export.zip', P('personnes.exporter'), async (request, reply) => {
    const p = personOr404(request, reply); if (!p) return reply;
    const lang = p.meetings.find(e => e.lang)?.lang || 'fr';
    const entries = [{ name: 'LISEZMOI.txt', data: (README[lang] || README.fr)(app.siteName(), null) }];
    const data = [];
    const seen = new Set();
    for (const e of p.meetings) {
      const x = enc.exportData(e.id);
      if (!x) continue;
      const tag = x.ref || `rencontre-${e.id}`;
      data.push(x.data);
      if (x.files.signature) entries.push({ name: `${tag}/signature.png`, data: x.files.signature });
      if (x.files.portrait) entries.push({ name: `${tag}/photo-de-reperage.jpg`, data: x.files.portrait });
      if (x.files.card) entries.push({ name: `${tag}/carte-signee.jpg`, data: x.files.card });
      for (const ph of enc.photos(e.id)) {
        if (seen.has(ph.id)) continue;
        seen.add(ph.id);
        try { entries.push({ name: `photos/${ph.slug}.jpg`, data: await sharp(path.join(app.config.storageDir, 'originals', ph.file)).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer() }); } catch { /* original introuvable */ }
      }
      app.db.prepare('INSERT INTO encounter_events (encounter_id, at, kind, detail) VALUES (?, ?, ?, ?)').run(e.id, Date.now(), 'export', '{}');
    }
    entries.splice(1, 0, { name: 'donnees.json', data: `${JSON.stringify({ rencontres: data }, null, 2)}\n` });
    const name = `${app.siteName()}-donnees-personne-${p.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    return reply.header('cache-control', 'no-store').header('content-disposition', `attachment; filename="${name}.zip"`).type('application/zip').send(zip(entries));
  });
  app.post('/admin/personnes/:id/effacer', W('personnes.effacer'), async (request, reply) => {
    const p = personOr404(request, reply); if (!p) return reply;
    const withPhotos = request.body?.photos === 'on';
    if (withPhotos && !request.can('photos.supprimer')) return app.forbid(request, reply);
    const linked = p.photos;
    const posts = linked.length ? app.db.prepare(`SELECT permalink FROM instagram_posts WHERE status = 'published' AND permalink IS NOT NULL
      AND photo_id IN (${linked.map(() => '?').join(',')})`).pluck().all(...linked.map(x => x.id)) : [];
    if (withPhotos) {
      for (const ph of linked) { const file = repo.deletePhoto(ph.id); if (file) removePhotoFiles(app.config.storageDir, file); }
      app.instagram.onUnpublished(linked.map(x => x.id));
    }
    let kept = 0;
    for (const e of p.meetings) if (enc.erase(e.id)?.anonymized) kept++;
    people.sync();
    const t = request.t, m = p.meetings.length;
    const details = posts.length ? [t('Encore sur Instagram, à supprimer dans l’application :'), ...posts] : undefined;
    const erased = m > 1 ? t('Personne effacée ({n} rencontres).', { n: m }) : t('Personne effacée ({n} rencontre).', { n: m });
    const removed = linked.length > 1 ? t('{n} photos supprimées.', { n: linked.length }) : t('1 photo supprimée.');
    return done(reply, '/admin/personnes', `${erased}${kept ? ` ${t('Son refus reste appliqué aux photos gardées (trace anonyme).')}` : ''}${withPhotos && linked.length ? ` ${removed}` : ''}`, details);
  });

  app.post('/admin/rencontres/:id/droits-traites', W('personnes.effacer'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.get(id)) return reply.callNotFound();
    enc.rightsDone(id);
    return done(reply, `/admin/rencontres/${id}`, request.t('Demande sur les données marquée comme traitée.'));
  });
}
