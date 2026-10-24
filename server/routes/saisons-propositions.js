import { SaisonError, LIMITS } from '../saisons.js';
import { variantName, widthsFor } from '../images.js';

const positive = value => typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
const invalid = (message, field = 'formulaire') => Object.assign(new SaisonError(message, { field }), { signal: true });
const ACTIONS = {
  proposer: { permission: 'saisons.ecrire', method: 'propose', message: 'Propositions enregistrées.' },
  relire: { permission: 'saisons.vote_relecture', method: 'review', message: 'Relecture enregistrée.' },
  valider: { permission: 'saisons.vote_valider', method: 'validate', message: 'Validation enregistrée.' },
  ordonner: { permission: 'saisons.vote_ordonner', method: 'reorder', message: 'Ordre enregistré. Une nouvelle double validation est nécessaire.' },
};

export function registerSaisonsPropositions(app, { repo, render, P, W, done, withReady }) {
  const c = app.saisonsPropositions, base = id => `/admin/saisons/${id}/vote`;
  const owns = (request, permission, s) => request.owns(permission, s.author_id);
  const outside = (request, id, object = 'saison') => app.securite.emit('authz_fail', { request, emetteur: 'server/routes/saisons-propositions.js · portée', detail: {
    raison: 'hors portée', permission: request.routeOptions.config.perm, objet: object, id, ecriture: request.method === 'POST',
  } });
  const load = request => {
    const s = app.saisons.get(positive(request.params.id) ? Number(request.params.id) : -1);
    if (!s || owns(request, 'saisons.voir', s)) return s;
    outside(request, s.id); return null;
  };
  const available = s => {
    const published = s.photo_ids.filter(id => repo.photo(id)?.status === 'published');
    return new Set(app.readiness.gate(published).ok);
  };
  const photoData = (request, ids, allowed) => ids.map(id => {
    const p = repo.photo(id);
    if (!p || p.status !== 'published' || !allowed.has(id)) return { id, title: request.t('Photo indisponible'), available: false };
    const ready = withReady(p), width = widthsFor(p.width)[0];
    return { id, title: p.title, author_id: p.author_id, available: true, width: p.width, height: p.height,
      thumb: ready.ready ? `/media/${variantName(p.file, width, 'webp', p.variant_key)}` : null };
  });
  const page = (request, reply, s, { error = null, status = 200 } = {}) => {
    const p = c.get(s.id), allowed = available(s), active = !['close', 'bilan', 'retire'].includes(s.phase);
    const can = permission => active && owns(request, permission, s);
    const scope = request.scope('saisons.ecrire');
    reply.code(status).header('cache-control', 'private, no-store').header('x-robots-tag', 'noindex').header('referrer-policy', 'no-referrer');
    return render(request, reply, 'saison-propositions', { title: request.t('Photos proposées au vote'), saisonsAssets: true, saison: s, propositions: p,
      photos: photoData(request, p.photo_ids, allowed), candidates: photoData(request, s.photo_ids, allowed).filter(ph => ph.available && (scope?.all || ph.author_id === scope?.authorId)),
      canPropose: can('saisons.ecrire'), canReview: can('saisons.vote_relecture'), canValidate: can('saisons.vote_valider'), canReorder: can('saisons.vote_ordonner'), active,
      error: error ? request.t.msg(error.message) : null, errorField: error?.field || null });
  };
  const bodyOf = (request, action) => {
    const b = request.body;
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw invalid('Formulaire de propositions attendu.');
    const hasList = ['proposer', 'ordonner'].includes(action);
    for (const [field, value] of Object.entries(b)) {
      if (field === 'photo_ids[]' && hasList) {
        if ([].concat(value).length > LIMITS.photos || [].concat(value).some(v => !positive(v))) throw invalid('Liste de photographies invalide.', 'photo_ids');
      } else if ((['_csrf', 'version'].includes(field) || (action === 'ordonner' && /^position_[1-9]\d{0,15}$/.test(field))) && typeof value === 'string') {
        if (value.length > (field === '_csrf' ? 256 : 16)) throw invalid('Formulaire de propositions invalide.');
      } else throw invalid('Champ de propositions inconnu.');
    }
    if (!positive(b.version)) throw invalid('Version entière positive attendue.', 'version');
    const photo_ids = [].concat(b['photo_ids[]'] || []).map(Number);
    if (new Set(photo_ids).size !== photo_ids.length) throw invalid('Liste de photographies invalide.', 'photo_ids');
    const positions = Object.keys(b).filter(k => k.startsWith('position_'));
    if (positions.length) {
      const order = photo_ids.map(id => b[`position_${id}`]);
      if (positions.length !== photo_ids.length || order.some(v => !positive(v) || Number(v) > photo_ids.length) || new Set(order.map(Number)).size !== order.length)
        throw invalid('Donnez une position distincte à chaque photographie.', 'photo_ids');
      photo_ids.sort((a, z) => Number(b[`position_${a}`]) - Number(b[`position_${z}`]));
    }
    return { version: Number(b.version), ...(hasList ? { photo_ids } : {}) };
  };
  app.get('/admin/saisons/:id/vote', P('saisons.voir'), async (request, reply) => {
    const s = load(request); return s ? page(request, reply, s) : reply.callNotFound();
  });
  for (const [action, config] of Object.entries(ACTIONS)) app.post(`/admin/saisons/:id/vote/${action}`, W(config.permission), async (request, reply) => {
    const s = load(request); if (!s) return reply.callNotFound();
    if (!owns(request, config.permission, s)) { outside(request, s.id); return app.forbid(request, reply); }
    try {
      const input = bodyOf(request, action);
      if (action === 'proposer') {
        for (const id of input.photo_ids) {
          const ph = repo.photo(id);
          if (!ph || !s.photo_ids.includes(id)) { outside(request, id, 'photo'); return reply.callNotFound(); }
          if (!request.owns('saisons.ecrire', ph.author_id)) { outside(request, id, 'photo'); return app.forbid(request, reply); }
        }
      }
      const before = c.get(s.id), after = c[config.method](s.id, input);
      const fields = ['version', 'reviewed_version', 'validated_version', 'photo_ids'].filter(f => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
      if (fields.length) (request.auditChanges ||= []).push(fields.join(', '));
      return done(reply, base(s.id), request.t(config.message));
    } catch (err) {
      if (!(err instanceof SaisonError)) throw err;
      if (err.signal) app.securite.emit('input_validation_fail', { request, emetteur: 'server/routes/saisons-propositions.js · formulaire', detail: {
        objet: 'saison_propositions', champ: err.field || 'formulaire', raison: 'formulaire invalide',
      } });
      return page(request, reply, app.saisons.get(s.id), { error: err, status: err.status });
    }
  });
}
