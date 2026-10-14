import sharp from 'sharp';
import { EncounterError, SCOPES, SCOPE_LABELS } from '../encounters.js';
import { sameToken } from '../auth.js';

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
      code: e.ref ? enc.codeOf(e.ref) : null, errors: {}, values: null, ...extra,
    });
  }
  app.get('/admin/rencontres/:id', async (request, reply) => detail(request, reply, byId(request.params.id)));

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
