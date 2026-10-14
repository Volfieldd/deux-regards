import sharp from 'sharp';
import { EncounterError, SCOPES, SCOPE_LABELS } from '../encounters.js';
import { sameToken } from '../auth.js';
import { TEXTS, PER_SHEET, MAX_PAIRS, buildPairs, sheets } from '../cards.js';
import { UI } from '../i18n.js';

// Admin « Rencontres » : demandes reçues par la page /bonjour, accords papier (carte « pour nous ») et refus.
// Enregistré dans le plugin d'administration (session d'admin exigée, comme le reste de /admin).
const CARD_MAX_BYTES = 15 * 1024 * 1024;

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

  // ---------- cartes à imprimer ----------
  // Dernier numéro imprimé par lettre (réglage « cards_printed ») : la planche suivante continue la série.
  const printed = () => { try { return JSON.parse(app.db.prepare("SELECT value FROM settings WHERE key = 'cards_printed'").pluck().get() || '{}'); } catch { return {}; } };
  const prefixOf = a => a.card_prefix || a.slug.charAt(0).toUpperCase();
  const nextNumber = prefix => {
    const used = app.db.prepare("SELECT ref FROM encounters WHERE ref LIKE ? || '-%'").pluck().all(prefix).map(r => Number(r.split('-')[1]) || 0);
    return Math.max(Number(printed()[prefix]) || 0, ...used, 0) + 1;
  };
  function cardsPage(request, reply, extra = {}) {
    const authors = repo.authors().map(a => ({ ...a, prefix: prefixOf(a), next: nextNumber(prefixOf(a)) }));
    return render(request, reply, 'cards', { title: 'Cartes à imprimer', authors, printed: printed(), PER_SHEET, MAX_PAIRS, errors: {}, values: {}, ...extra });
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
      const p = printed();
      p[prefixOf(author)] = Math.max(Number(p[prefixOf(author)]) || 0, from + count - 1);
      app.db.prepare("INSERT INTO settings (key, value) VALUES ('cards_printed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(p));
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
        else body[part.fieldname] = part.value;
        continue;
      }
      if (!checked) { part.file.resume(); break; }
      const chunks = [];
      for await (const chunk of part.file) chunks.push(chunk);
      if (!chunks.length) continue;                                  // champ fichier laissé vide
      if (part.file.truncated) { error = 'Photo de la carte trop lourde (15 Mo au plus).'; continue; }
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

  app.post('/admin/rencontres/:id/supprimer', write, async (request, reply) => {
    const id = byId(request.params.id);
    if (!enc.remove(id)) return reply.callNotFound();
    return done(reply, '/admin/rencontres', 'Rencontre supprimée (adresse, messages et photo de la carte effacés).');
  });
}
