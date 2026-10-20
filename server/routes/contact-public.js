import { UI, localize } from '../i18n.js';
import { MessageError, USAGES, ALL, PER_DAY } from '../messages.js';
import { scanValue } from '../securite/detection.js';

// Page Contact et demande de licence, côté public (maquette MQ-06, sans la vente de tirages ; registre de la Vigie,
// section « Contact et demande de licence », BV-27 à BV-30). Enregistré dans le plugin pages (trois langues), en v1
// (gabarits sobres, views/contact.eta et views/licence.eta) comme en v2 et v3 (views/v2/…).
//   - /contact (?pour=<photographe>|tous) : « Écrire à Sébastien, à Julien, ou aux deux » ; une page à part plutôt
//     qu'une partie d'À propos : son titre dit l'erreur après un envoi refusé, elle n'est jamais gardée en cache (la page
//     À propos, elle, le reste), et /a-propos#contact y mène, photographe par photographe ;
//   - /droits/demande (?photo=<slug>) : la demande de licence d'une photo, ouverte depuis la visionneuse et la page Droits.
// Mêmes accroches que /bonjour et Signaler (server/routes/public.js) : champ piège (trapped, formulaire « contact » ou
// « licence »), envoi depuis un autre site et limite par adresse (gate) ; réponse « merci » au piège et à l'autre site,
// sans rien enregistrer. Une valeur qu'un navigateur qui suit la page n'envoie jamais (destinataire ou usage hors liste,
// texte plus long que la page ne le permet, photo inconnue) est refusée et signalée (BV-28), sauf si le crochet commun la
// signale déjà comme saisie malveillante (DS11, une seule fois). Jamais le message, le nom ni l'adresse dans un événement.
export function registerContactPages(app, { lang, repo, base, gate, trapped, sameSite, limit }) {
  const t = UI[lang];
  const u = path => localize(path, lang);
  const db = app.db;
  const photoRow = db.prepare("SELECT id, author_id, slug, status FROM photos WHERE slug = ?");

  const emitForged = (request, formulaire, f, where = 'body') => {
    const raw = (where === 'query' ? request.query : request.body)?.[f.champ];
    if (typeof raw === 'string' && scanValue(where, `${where}.${f.champ}`, raw)) return;      // déjà signalé (DS11)
    app.securite.emit('input_validation_fail', { request, emetteur: `server/routes/contact-public.js · ${formulaire}`,
      detail: { raison: f.raison, formulaire, champ: f.champ, ...(f.valeur !== undefined ? { valeur: f.valeur } : { longueur: f.longueur }) } });
  };
  // La photo d'une demande (?photo= ou champ caché) : publiée, ou rien. Inconnue de la base : forgée, signalée ; connue
  // mais dépubliée depuis (vieux lien) : rien à dire.
  const photoOf = (request, where, formulaire = 'licence') => {
    const raw = (where === 'query' ? request.query : request.body)?.photo;
    if (raw == null || raw === '') return null;
    const slug = typeof raw === 'string' ? raw : '';
    const row = slug && slug.length <= 200 ? photoRow.get(slug) : null;
    if (row?.status === 'published') {
      const shown = repo.publishedPhotos({ lang }).find(p => p.slug === slug);
      if (shown) return { ...shown, author_id: row.author_id };
    }
    if (!row) emitForged(request, formulaire, { raison: 'valeur hors liste', champ: 'photo', valeur: String(raw).slice(0, 60) }, where);
    return null;
  };
  const authorsOf = () => repo.authors(lang);
  // Une photo de chaque photographe pour la grille « Écrire à » (MQ-06, cadre 10) : la première publiée dans l'ordre choisi ;
  // pour « Les deux », la suivante de chacun (la même s'il n'en a qu'une).
  const portraits = list => {
    const photos = repo.publishedPhotos({ lang });
    return list.map(a => { const mine = photos.filter(p => p.author_slug === a.slug); return { ...a, photo: mine[0] || null, photo2: mine[1] || mine[0] || null }; });
  };
  const legalLine = () => {
    const s = repo.settings();
    return { names: String(s.legal_names || '').trim(), director: String(s.legal_director || '').trim() };
  };
  // Plafond global (50 messages acceptés par jour, tous formulaires) : au-delà, 503, saisie gardée, et la Vigie prévenue
  // (boîtes bombardées depuis de nombreuses adresses, BV-29).
  const full = (request, formulaire) => {
    if (app.messages.acceptedToday() < PER_DAY) return false;
    app.securite.emit('excess_rate_limit_exceeded', { request, severity: 'moyen', emetteur: `server/routes/contact-public.js · ${formulaire}`, detail: { limite: 'messages_global', formulaire, par_jour: PER_DAY } });
    return true;
  };
  const nocache = reply => reply.header('x-robots-tag', 'noindex').header('cache-control', 'no-store');

  // ---------- Contact ----------
  function contactPage(request, reply, { values = {}, errors = {}, status = 200 } = {}) {
    const siteName = app.siteName();
    const authors = portraits(authorsOf());
    nocache(reply).code(status);
    return reply.render('contact', {
      ...base, siteName, c: t.contact, authors, values, errors, sent: false, legal: legalLine(), ALL,
      pageTitle: `${t.contact.title} · ${siteName}`, canonical: '/contact', description: t.contact.lead,
    });
  }
  app.get('/contact', async (request, reply) => {
    app.stats.hit(request, { page: 'contact' });
    const authors = authorsOf();
    const raw = request.query.pour;
    let pour = '';
    if (typeof raw === 'string' && (raw === ALL || authors.some(a => a.slug === raw))) pour = raw;
    else if (raw != null && raw !== '') emitForged(request, 'contact', { raison: 'valeur hors liste', champ: 'pour', valeur: String(raw).slice(0, 60) }, 'query');
    return contactPage(request, reply, { values: { pour } });
  });
  app.get('/contact/merci', async (request, reply) => {
    const siteName = app.siteName();
    nocache(reply);
    return reply.render('contact', { ...base, siteName, c: t.contact, authors: [], values: {}, errors: {}, sent: true, legal: legalLine(), ALL,
      pageTitle: `${t.contact.thanks} · ${siteName}`, canonical: '/contact', description: '' });
  });
  app.post('/contact', async (request, reply) => {
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const thanks = u('/contact/merci');
    if (trapped(request, 'contact')) return reply.redirect(thanks, 303);                       // piège à robots
    if (!sameSite(request)) { gate(request, limit, 'contact'); return reply.redirect(thanks, 303); }
    if (!gate(request, limit, 'contact')) return contactPage(request, reply, { values: body, errors: { limit: 'limit' }, status: 429 });
    if (full(request, 'contact')) return contactPage(request, reply, { values: body, errors: { global: 'global' }, status: 503 });
    try {
      app.messages.submit('contact', body, { lang, authors: authorsOf() });
    } catch (err) {
      if (!(err instanceof MessageError)) throw err;
      for (const f of err.forged) emitForged(request, 'contact', f);
      return contactPage(request, reply, { values: body, errors: err.errors, status: 422 });
    }
    app.reminders?.messages().catch(e => request.log.warn({ err: e.message }, 'messages : notification'));
    return reply.redirect(thanks, 303);
  });

  // ---------- Demande de licence ----------
  function licencePage(request, reply, { photo = null, values = {}, errors = {}, status = 200 } = {}) {
    const siteName = app.siteName();
    const author = photo ? authorsOf().find(a => a.slug === photo.author_slug) || null : null;
    nocache(reply).code(status);
    return reply.render('licence', {
      ...base, siteName, l: t.licence, c: t.contact, photo, author, values, errors, sent: false, usages: USAGES,
      pageTitle: photo ? `${t.licence.title} · ${photo.title} · ${siteName}` : `${t.licence.title} · ${siteName}`,
      canonical: photo ? `/droits/demande?photo=${encodeURIComponent(photo.slug)}` : '/droits/demande', description: t.licence.lead,
    });
  }
  app.get('/droits/demande', async (request, reply) => {
    app.stats.hit(request, { page: 'droits-demande' });
    const photo = photoOf(request, 'query');
    return licencePage(request, reply, { photo, values: { photo: photo?.slug || '' } });
  });
  app.get('/droits/demande/merci', async (request, reply) => {
    const siteName = app.siteName();
    const photo = photoOf(request, 'query');
    const author = photo ? authorsOf().find(a => a.slug === photo.author_slug) || null : null;
    nocache(reply);
    return reply.render('licence', { ...base, siteName, l: t.licence, c: t.contact, photo, author, values: {}, errors: {}, sent: true, usages: USAGES,
      pageTitle: `${t.contact.thanks} · ${siteName}`, canonical: '/droits/demande', description: '' });
  });
  app.post('/droits/demande', async (request, reply) => {
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const thanks = u('/droits/demande/merci');
    if (trapped(request, 'licence')) return reply.redirect(thanks, 303);
    if (!sameSite(request)) { gate(request, limit, 'licence'); return reply.redirect(thanks, 303); }
    const photo = photoOf(request, 'body');
    const values = { ...body, photo: photo?.slug || '' };
    if (!gate(request, limit, 'licence')) return licencePage(request, reply, { photo, values, errors: { limit: 'limit' }, status: 429 });
    if (full(request, 'licence')) return licencePage(request, reply, { photo, values, errors: { global: 'global' }, status: 503 });
    try {
      app.messages.submit('licence', body, { lang, photo });
    } catch (err) {
      if (!(err instanceof MessageError)) throw err;
      for (const f of err.forged) emitForged(request, 'licence', f);
      return licencePage(request, reply, { photo, values, errors: err.errors, status: 422 });
    }
    app.reminders?.messages().catch(e => request.log.warn({ err: e.message }, 'messages : notification'));
    return reply.redirect(photo ? `${thanks}?photo=${encodeURIComponent(photo.slug)}` : thanks, 303);
  });
}
