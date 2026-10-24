import { SaisonBilanError, BILAN_LIMITS } from '../saisons-bilans.js';
import { variantName, widthsFor } from '../images.js';

const LANGS = ['fr', 'en', 'de'];
const REPORT_BASES = ['title', 'body'], COLLECTION_BASES = ['title', 'subtitle', 'intro', 'prologue', 'conclusion'];
const fieldsOf = bases => bases.flatMap(base => LANGS.map(lang => lang === 'fr' ? base : `${base}_${lang}`));
const positive = value => typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
const idOf = value => positive(value) ? Number(value) : -1;
const shapeError = (field, reason = 'type inattendu') => Object.assign(new SaisonBilanError('Formulaire éditorial invalide.', { field }), { signal: reason });

// Bilans et collections : mêmes gardes de session, de permission et de CSRF que l’atelier. Chaque identifiant
// est rattaché à la saison visible avant toute lecture d’un texte ou sélection ; les originaux ne sont jamais lus.
export function registerSaisonsBilans(app, { repo, render: renderAdmin, P, W, done, withReady }) {
  const b = app.saisonsBilans;
  const base = id => `/admin/saisons/${id}/bilans`;
  const reportUrl = r => `${base(r.saison_id)}/${r.id}`;
  const collectionUrl = (s, c) => `/admin/saisons/${s.id}/collections/${c.id}`;
  const owns = (request, perm, s) => { const scope = request.scope(perm); return Boolean(scope && (scope.all || (scope.authorId > 0 && s.author_id === scope.authorId))); };
  const outOfScope = (request, id, objet = 'saison') => app.securite.emit('authz_fail', { request, emetteur: 'server/routes/saisons-bilans.js · portée', detail: {
    raison: 'hors portée', permission: request.routeOptions.config.perm, objet, id, ecriture: !['GET', 'HEAD'].includes(request.method),
  } });
  const loadSaison = request => {
    const s = app.saisons.get(idOf(request.params.id));
    if (!s || owns(request, 'saisons.voir', s)) return s;
    outOfScope(request, s.id); return null;
  };
  const loadReport = (request, s) => {
    const r = b.getReport(idOf(request.params.bilan));
    if (!r || r.saison_id === s.id) return r;
    outOfScope(request, r.id, 'bilan'); return null;
  };
  const loadCollection = (request, s) => {
    const c = b.getCollection(idOf(request.params.collection));
    if (!c || b.getReport(c.bilan_id)?.saison_id === s.id) return c;
    outOfScope(request, c.id, 'collection'); return null;
  };
  const render = (request, reply, view, data, status = 200) => {
    reply.code(status).header('cache-control', 'private, no-store').header('x-robots-tag', 'noindex').header('referrer-policy', 'no-referrer');
    return renderAdmin(request, reply, view, { saisonsAssets: true, ...data });
  };
  const signal = (request, error) => {
    if (error.signal) app.securite.emit('input_validation_fail', { request, emetteur: 'server/routes/saisons-bilans.js · formulaire', detail: { objet: 'bilan', champ: error.field || 'formulaire', raison: error.signal } });
  };
  const parseBody = (request, names, photos = false, cartels = false) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw shapeError('formulaire');
    for (const [field, value] of Object.entries(body)) {
      const list = photos && field === 'photo_ids[]';
      if (!names.includes(field) && field !== '_csrf' && !list && !(photos && /^position_[1-9]\d{0,15}$/.test(field)) && !(cartels && /^cartel_[1-9]\d{0,15}(?:_en|_de)?$/.test(field))) throw shapeError('formulaire', 'champ inattendu');
      if (list) {
        if ([].concat(value).length > BILAN_LIMITS.photos || [].concat(value).some(v => !positive(v))) throw shapeError('photo_ids', 'identifiant invalide');
      } else if (typeof value !== 'string') throw shapeError(field.slice(0, 60));
    }
    return body;
  };
  const version = body => { if (!positive(body.version)) throw shapeError('version', 'identifiant invalide'); return Number(body.version); };
  const selected = body => {
    const ids = [].concat(body['photo_ids[]'] || []).map(Number);
    if (new Set(ids).size !== ids.length) throw shapeError('photo_ids', 'identifiant répété');
    const positions = ids.map(id => {
      if (!positive(body[`position_${id}`]) || Number(body[`position_${id}`]) > BILAN_LIMITS.photos) throw shapeError('photo_ids', 'position invalide');
      return { id, position: Number(body[`position_${id}`]) };
    });
    if (new Set(positions.map(p => p.position)).size !== positions.length) throw new SaisonBilanError('Donnez des positions distinctes entre 1 et 500.', { field: 'photo_ids' });
    return positions.sort((a, b) => a.position - b.position).map(p => p.id);
  };
  const inScope = (request, ids) => {
    const scope = request.scope('saisons.ecrire');
    if (scope?.all) return true;
    for (const id of ids) { const p = repo.photo(id); if (p && p.author_id !== scope?.authorId) { outOfScope(request, id, 'photo'); return false; } }
    return true;
  };
  const textInput = (body, bases) => Object.fromEntries(fieldsOf(bases).map(field => {
    if (typeof body[field] !== 'string') throw shapeError(field);
    return [field, body[field]];
  }));
  const valuesOf = (row, body, bases) => Object.fromEntries(fieldsOf(bases).map(field => [field, typeof body?.[field] === 'string' ? body[field].slice(0, BILAN_LIMITS[field.replace(/_(en|de)$/, '')] + 1) : row[field] || '']));
  const note = (request, before, after, bases) => {
    const changed = [...fieldsOf(bases), 'state', 'published_at', 'rectifies_id', 'cover_id'].filter(field => String(before?.[field] ?? '') !== String(after?.[field] ?? ''));
    if (JSON.stringify(before?.photo_ids || []) !== JSON.stringify(after?.photo_ids || [])) changed.push('photo_ids');
    if (JSON.stringify(before?.cartels || []) !== JSON.stringify(after?.cartels || [])) changed.push('cartels');
    if (changed.length) (request.auditChanges ||= []).push(changed.join(', '));
  };
  const photoData = (request, ids) => {
    const rows = app.publicRepo.photosByIds(ids, request.t.lang), allowed = new Set(app.readiness.gate(ids).ok);
    return ids.map(id => {
      const p = rows.get(id);
      if (!p || (p.status !== 'published' && !request.owns('photos.voir', p.author_id))) return { id, title: request.t('Photo indisponible'), available: false, ready: false };
      const ready = withReady(p), available = p.status === 'published' && allowed.has(id);
      return { ...ready, available, thumb: available && ready.ready ? `/media/${variantName(p.file, widthsFor(p.width)[0], 'webp', p.variant_key)}` : null };
    });
  };
  const photosOf = (request, source, row, body) => {
    const ids = new Set(body ? [].concat(body['photo_ids[]'] || []).filter(positive).map(Number) : row.photo_ids);
    const available = new Set(source), ordered = [...row.photo_ids.filter(id => available.has(id)), ...source.filter(id => !row.photo_ids.includes(id))];
    return photoData(request, ordered).map((p, i) => ({ ...p, selected: ids.has(p.id), position: typeof body?.[`position_${p.id}`] === 'string' ? body[`position_${p.id}`].slice(0, 16) : String(i + 1) }));
  };
  const errors = (request, error) => ({ error: error ? request.t.msg(error.message) : null, errorField: error?.field || null });
  const reportView = (request, reply, s, r, { body = null, error = null, status = 200, confirm = null, collectionTitle = '' } = {}) => render(request, reply, 'saison-bilan', {
    title: r.title, saison: s, report: r, fields: valuesOf(r, body, REPORT_BASES), photos: photosOf(request, s.photo_ids, r, body),
    canEdit: !confirm && owns(request, 'saisons.ecrire', s) && r.state === 'brouillon', canWrite: owns(request, 'saisons.ecrire', s), canPublish: owns(request, 'saisons.publier', s),
    version: body ? typeof body.version === 'string' ? body.version.slice(0, 16) : '' : String(r.version), confirm, collectionTitle, collections: b.listCollections(s.id).filter(c => c.bilan_id === r.id), ...errors(request, error),
  }, status);
  const collectionView = (request, reply, s, c, { body = null, error = null, status = 200, confirm = null } = {}) => {
    const report = b.getReport(c.bilan_id), fields = valuesOf(c, body, COLLECTION_BASES);
    fields.cover_id = typeof body?.cover_id === 'string' ? body.cover_id.slice(0, 16) : c.cover_id == null ? '' : String(c.cover_id);
    for (const photo_id of report.photo_ids) for (const lang of LANGS) {
      const name = `cartel_${photo_id}${lang === 'fr' ? '' : `_${lang}`}`, field = lang === 'fr' ? 'cartel' : `cartel_${lang}`;
      fields[name] = typeof body?.[name] === 'string' ? body[name].slice(0, BILAN_LIMITS.cartel + 1) : c.cartels.find(row => row.photo_id === photo_id)?.[field] || '';
    }
    return render(request, reply, 'saison-collection', { title: c.title, saison: s, collection: c, report, fields,
      photos: photosOf(request, report.photo_ids, c, body), canEdit: !confirm && owns(request, 'saisons.ecrire', s) && c.state === 'brouillon', canPublish: owns(request, 'saisons.publier', s),
      version: body ? typeof body.version === 'string' ? body.version.slice(0, 16) : '' : String(c.version), confirm, ...errors(request, error),
    }, status);
  };

  app.get('/admin/saisons/:id/bilans', P('saisons.voir'), async (request, reply) => {
    const s = loadSaison(request); if (!s) return reply.callNotFound();
    return render(request, reply, 'saison-bilans', { title: request.t('Bilans et prolongements'), saison: s, reports: b.listReports(s.id), canWrite: owns(request, 'saisons.ecrire', s) });
  });
  app.post('/admin/saisons/:id/bilans', W('saisons.ecrire'), async (request, reply) => {
    const s = loadSaison(request); if (!s) return reply.callNotFound();
    if (!owns(request, 'saisons.ecrire', s)) return app.forbid(request, reply);
    let body;
    try {
      body = parseBody(request, ['title', 'rectifies_id']);
      const rectifies_id = body.rectifies_id == null || body.rectifies_id === '' ? null : idOf(body.rectifies_id);
      if (rectifies_id === -1) throw shapeError('rectifies_id', 'identifiant invalide');
      const id = b.createReport(s.id, { title: body.title, rectifies_id }); note(request, null, b.getReport(id), REPORT_BASES);
      return done(reply, `${base(s.id)}/${id}`, request.t('Brouillon de bilan créé.'));
    } catch (error) {
      if (!(error instanceof SaisonBilanError)) throw error;
      signal(request, error);
      return render(request, reply, 'saison-bilans', { title: request.t('Bilans et prolongements'), saison: s, reports: b.listReports(s.id), canWrite: true, createTitle: typeof body?.title === 'string' ? body.title.slice(0, 121) : '', ...errors(request, error) }, error.status);
    }
  });
  app.get('/admin/saisons/:id/bilans/:bilan', P('saisons.voir'), async (request, reply) => {
    const s = loadSaison(request); if (!s) return reply.callNotFound();
    const r = loadReport(request, s); return r ? reportView(request, reply, s, r) : reply.callNotFound();
  });
  app.post('/admin/saisons/:id/bilans/:bilan', W('saisons.ecrire'), async (request, reply) => {
    const s = loadSaison(request); if (!s) return reply.callNotFound();
    const r = loadReport(request, s); if (!r) return reply.callNotFound();
    if (!owns(request, 'saisons.ecrire', s)) return app.forbid(request, reply);
    let body;
    try {
      body = parseBody(request, [...fieldsOf(REPORT_BASES), 'version'], true); const photo_ids = selected(body);
      if (!inScope(request, photo_ids)) return app.forbid(request, reply);
      const after = b.saveReport(r.id, { version: version(body), input: textInput(body, REPORT_BASES), photo_ids }); note(request, r, after, REPORT_BASES);
      return done(reply, reportUrl(after), request.t('Bilan enregistré.'));
    } catch (error) {
      if (!(error instanceof SaisonBilanError)) throw error;
      signal(request, error); return reportView(request, reply, s, b.getReport(r.id), { body, error, status: error.status });
    }
  });
  app.post('/admin/saisons/:id/bilans/:bilan/collections', W('saisons.ecrire'), async (request, reply) => {
    const s = loadSaison(request); if (!s) return reply.callNotFound();
    const r = loadReport(request, s); if (!r) return reply.callNotFound();
    if (!owns(request, 'saisons.ecrire', s)) return app.forbid(request, reply);
    let body;
    try {
      body = parseBody(request, ['title']);
      const id = b.createCollection(r.id, { title: body.title }); note(request, null, b.getCollection(id), COLLECTION_BASES);
      return done(reply, collectionUrl(s, { id }), request.t('Brouillon de collection créé.'));
    } catch (error) {
      if (!(error instanceof SaisonBilanError)) throw error;
      signal(request, error); return reportView(request, reply, s, r, { error, status: error.status, collectionTitle: typeof body?.title === 'string' ? body.title.slice(0, 121) : '' });
    }
  });
  app.get('/admin/saisons/:id/collections/:collection', P('saisons.voir'), async (request, reply) => {
    const s = loadSaison(request); if (!s) return reply.callNotFound();
    const c = loadCollection(request, s); return c ? collectionView(request, reply, s, c) : reply.callNotFound();
  });
  app.post('/admin/saisons/:id/collections/:collection', { ...W('saisons.ecrire'), bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const s = loadSaison(request); if (!s) return reply.callNotFound();
    const c = loadCollection(request, s); if (!c) return reply.callNotFound();
    if (!owns(request, 'saisons.ecrire', s)) return app.forbid(request, reply);
    let body;
    try {
      body = parseBody(request, [...fieldsOf(COLLECTION_BASES), 'version', 'cover_id'], true, true); const photo_ids = selected(body);
      if (!inScope(request, photo_ids)) return app.forbid(request, reply);
      const input = textInput(body, COLLECTION_BASES); input.cover_id = body.cover_id === '' ? null : idOf(body.cover_id);
      if (input.cover_id === -1) throw shapeError('cover_id', 'identifiant invalide');
      const cartels = photo_ids.map(photo_id => ({ photo_id, ...Object.fromEntries(fieldsOf(['cartel']).map(field => {
        const name = field.replace('cartel', `cartel_${photo_id}`);
        if (typeof body[name] !== 'string') throw shapeError(name);
        return [field, body[name]];
      })) }));
      const after = b.saveCollection(c.id, { version: version(body), input, photo_ids, cartels }); note(request, c, after, COLLECTION_BASES);
      return done(reply, collectionUrl(s, after), request.t('Collection enregistrée.'));
    } catch (error) {
      if (!(error instanceof SaisonBilanError)) throw error;
      signal(request, error); return collectionView(request, reply, s, b.getCollection(c.id), { body, error, status: error.status });
    }
  });
  const transitions = { publier: { report: 'publishReport', collection: 'publishCollection', label: 'Publier', message: 'Le contenu sera publié dans ses trois langues. Ses textes et son accrochage seront ensuite figés.', done: 'Publication enregistrée.' },
    retirer: { report: 'withdrawReport', collection: 'withdrawCollection', label: 'Retirer', message: 'Le contenu sera retiré de son accès public. Les photographies conservent leurs règles de publication.', done: 'Retrait enregistré.' } };
  for (const [kind, path] of [['report', '/admin/saisons/:id/bilans/:bilan'], ['collection', '/admin/saisons/:id/collections/:collection']]) for (const [action, transition] of Object.entries(transitions)) {
    const load = kind === 'report' ? loadReport : loadCollection, show = kind === 'report' ? reportView : collectionView, get = kind === 'report' ? b.getReport : b.getCollection;
    const target = (s, row) => kind === 'report' ? reportUrl(row) : collectionUrl(s, row);
    const confirm = request => ({ action, label: request.t(transition.label), message: request.t(transition.message) });
    app.get(`${path}/${action}`, P('saisons.publier'), async (request, reply) => {
      const s = loadSaison(request); if (!s) return reply.callNotFound();
      const row = load(request, s); if (!row) return reply.callNotFound();
      if (!owns(request, 'saisons.publier', s)) return app.forbid(request, reply);
      return show(request, reply, s, row, { confirm: confirm(request) });
    });
    app.post(`${path}/${action}`, W('saisons.publier'), async (request, reply) => {
      const s = loadSaison(request); if (!s) return reply.callNotFound();
      const row = load(request, s); if (!row) return reply.callNotFound();
      if (!owns(request, 'saisons.publier', s)) return app.forbid(request, reply);
      let body;
      try {
        body = parseBody(request, ['version']); const after = b[transition[kind]](row.id, { version: version(body) }); note(request, row, after, kind === 'report' ? REPORT_BASES : COLLECTION_BASES);
        return done(reply, target(s, after), request.t(transition.done));
      } catch (error) {
        if (!(error instanceof SaisonBilanError)) throw error;
        signal(request, error); return show(request, reply, s, get(row.id), { body, error, status: error.status, confirm: confirm(request) });
      }
    });
  }
}
