import { noterLecture } from '../securite/donnees.js';

// Admin « Messages et demandes » : ce que les visiteurs envoient par la page Contact et par la demande de licence
// (server/messages.js ; registre de la Vigie, BV-30). Permission messages.traiter, avec portée : « les miennes » = les
// messages adressés au photographe du compte (la photo d'une demande de licence est la sienne) et ceux adressés aux deux.
//   - La liste ne déchiffre rien : date, nature, destinataire, photo, usage, langue, état ; jamais de nom, d'adresse ni
//     de message.
//   - La fiche (/admin/messages/:id) déchiffre le message : lecture sensible, notée au journal d'audit et signalée à la
//     Vigie (sensitive_read, objet « message » et numéro), comme la fiche d'une personne ou l'accès d'une galerie privée.
//   - Un message hors portée : introuvable (404) comme un numéro inconnu, mais signalé (« hors portée », BV-14).
// Enregistré dans le plugin d'administration (session d'admin exigée, comme le reste de /admin).
export function registerMessages(app, { render, P, W, done, withReady }) {
  const messages = app.messages;
  const PERM = 'messages.traiter';
  const writing = request => request.method !== 'GET' && request.method !== 'HEAD';
  const outOfScope = (request, id) => app.securite.emit('authz_fail', { request, emetteur: 'server/routes/messages.js · portée',
    detail: { raison: 'hors portée', permission: PERM, objet: 'message', id, ecriture: writing(request) } });
  // Le message demandé, s'il existe et que le compte le voit ; sinon null (404), signalé s'il existe.
  const load = request => {
    const id = Number(request.params.id);
    const r = Number.isSafeInteger(id) ? messages.raw(id) : null;
    if (!r) return null;
    if (messages.sees(request.scope(PERM), r)) return r;
    outOfScope(request, r.id);
    return null;
  };
  const photoOf = r => (r.photo_id && r.file ? withReady({ id: r.photo_id, title: r.photo_title, slug: r.photo_slug, file: r.file, width: r.width, height: r.height, variant_key: r.variant_key, status: r.photo_status }) : null);
  const view = r => ({ ...r, photo: photoOf(r) });
  // Lecture notée au journal (libellé « Message lu », server/journal-libelles.js), avec le numéro seul.
  const audit = (request, id) => {
    request.audited = true;
    app.audit.log({ sub: request.session.sub, name: request.session.name, action: 'message lu', target: String(id), status: 200 });
  };

  // La boîte : 50 messages par page (?page=), filtres état (?etat=) et nature (?nature=) appliqués par la base, jamais
  // tronqués en silence.
  app.get('/admin/messages', P(PERM), async (request, reply) => {
    const scope = request.scope(PERM);
    const etat = ['nouveau', 'traite'].includes(request.query.etat) ? request.query.etat : '';
    const nature = ['contact', 'licence'].includes(request.query.nature) ? request.query.nature : '';
    const box = messages.list(scope, { status: etat || null, kind: nature || null, page: request.query.page });
    return render(request, reply, 'messages', {
      title: request.t('Messages et demandes'), list: box.items.map(view), box, ownScope: !scope.all, etat, nature,
    });
  });

  app.get('/admin/messages/:id', P(PERM), async (request, reply) => {
    const r = load(request);
    if (!r) return reply.callNotFound();
    const m = messages.get(r.id);
    // Lecture sensible : le nom, l'adresse et le message, déchiffrés pour ce compte (BV-30).
    audit(request, r.id);
    noterLecture(request, { objet: 'message', id: r.id, categorie: ['identite', 'coordonnees', 'message_libre'] });
    reply.header('cache-control', 'no-store');
    return render(request, reply, 'message', { title: m.kind === 'licence' ? request.t('Demande de licence n° {id}', { id: m.id }) : request.t('Message n° {id}', { id: m.id }), m: view(m) });
  });

  app.post('/admin/messages/:id/traite', W(PERM), async (request, reply) => {
    const r = load(request);
    if (!r) return reply.callNotFound();
    messages.done(r.id);
    return done(reply, `/admin/messages/${r.id}`, request.t('Message marqué comme traité.'));
  });

  app.post('/admin/messages/:id/supprimer', W(PERM), async (request, reply) => {
    const r = load(request);
    if (!r) return reply.callNotFound();
    // Effacement signalé à la Vigie (BV-30, messages_effaces_en_masse), seulement s'il a eu lieu : le numéro seul.
    if (messages.remove(r.id)) app.securite.emit('sensitive_delete', { request, emetteur: 'server/routes/messages.js · suppression', detail: { objet: 'message', id: r.id, categorie: ['identite', 'coordonnees', 'message_libre'] } });
    return done(reply, '/admin/messages', request.t('Message supprimé.'));
  });
}
