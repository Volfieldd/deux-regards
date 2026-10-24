import { SaisonError, LIMITS } from '../saisons.js';
import { createSaisonsAtelier } from '../saisons-atelier.js';
import { variantName, widthsFor } from '../images.js';

const LANGS = ['fr', 'en', 'de'];
const TEXTS = ['title', 'subtitle', 'intro', 'prologue', 'conclusion'].flatMap(f => [f, `${f}_en`, `${f}_de`]);
export const PHASE_LABELS = { brouillon: 'Brouillon', programmee: 'Programmée', ouverte: 'Ouverte', close: 'Close', bilan: 'Bilan publié', retire: 'Retirée' };
const ACTIONS = {
  programmer: { method: 'schedule', label: 'Programmer la saison', message: 'La saison s’ouvrira aux dates indiquées. Ses textes et son accrochage seront figés.', done: 'Saison programmée.' },
  ouvrir: { method: 'open', label: 'Valider l’ouverture', message: 'Validez l’ouverture pendant la période indiquée. Les textes et l’accrochage seront figés.', done: 'Ouverture validée.' },
  annuler: { method: 'cancelSchedule', label: 'Annuler la programmation', message: 'La saison redevient un brouillon. Vous pourrez reprendre ses textes, son calendrier et son accrochage.', done: 'Programmation annulée.' },
  retirer: { method: 'withdraw', label: 'Retirer la saison', message: 'La saison sera retirée de ses accès publics. Ses photographies garderont leur publication et leur série habituelles.', done: 'Saison retirée.' },
};
const REASONS = [
  { value: 'choix_editorial', label: 'Décision éditoriale' },
  { value: 'calendrier', label: 'Changement de calendrier' },
  { value: 'photo_indisponible', label: 'Photographie indisponible' },
];
const positive = value => typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
const byId = value => positive(value) ? Number(value) : -1;
const shapeError = (message, field, reason) => Object.assign(new SaisonError(message, { field }), { signal: reason });

// Atelier S1b : toutes les routes héritent des gardes du plugin admin. La portée s’applique à la saison et aux photos
// ajoutées ; voir une photo publiée ne donne pas au photographe le droit de composer une exposition avec celle d’un autre.
export function registerSaisons(app, { repo, render: renderAdmin, P, W, done, withReady, zone }) {
  const c = app.saisons;
  const atelier = createSaisonsAtelier({ db: app.db, saisons: c, zone });
  const render = (request, reply, template, data, status = 200) => {
    reply.code(status).header('cache-control', 'private, no-store').header('x-robots-tag', 'noindex').header('referrer-policy', 'no-referrer');
    return renderAdmin(request, reply, template, { saisonsAssets: true, phaseLabels: PHASE_LABELS, ...data });
  };
  const owns = (request, permission, s) => {
    const scope = request.scope(permission);
    return Boolean(scope && (scope.all || (Number.isSafeInteger(scope.authorId) && scope.authorId > 0 && s.author_id === scope.authorId)));
  };
  const outOfScope = (request, id, object = 'saison') => app.securite.emit('authz_fail', { request, emetteur: 'server/routes/saisons.js · portée', detail: {
    raison: 'hors portée', permission: request.routeOptions.config.perm, objet: object, id, ecriture: !['GET', 'HEAD'].includes(request.method),
  } });
  const load = request => {
    const s = c.get(byId(request.params.id));
    if (!s || owns(request, 'saisons.voir', s)) return s;
    outOfScope(request, s.id); return null;
  };
  const back = id => `/admin/saisons/${id}`;
  const langOf = value => LANGS.includes(value) ? value : 'fr';
  const notes = (request, before, after) => {
    const fields = [...TEXTS, 'author_id', 'cover_id', 'opens_at', 'closes_at', 'state', 'decided_at', 'retired_at'].filter(f => String(before?.[f] ?? '') !== String(after[f] ?? ''));
    if (JSON.stringify(before?.photo_ids || []) !== JSON.stringify(after.photo_ids)) fields.push('photo_ids');
    if (JSON.stringify(before?.cartels || []) !== JSON.stringify(after.cartels || [])) fields.push('cartels');
    if (fields.length) (request.auditChanges ||= []).push(fields.join(', '));
  };
  const signal = (request, err) => {
    if (!err.signal) return;
    app.securite.emit('input_validation_fail', { request, emetteur: 'server/routes/saisons.js · formulaire', detail: { objet: 'saison', champ: err.field || 'formulaire', raison: err.signal } });
  };
  const formBody = request => {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw shapeError('Formulaire de saison attendu.', 'formulaire', 'type inattendu');
    for (const [field, value] of Object.entries(body)) {
      const list = ['photo_ids[]', 'ajouter[]'].includes(field);
      const known = [...TEXTS, '_csrf', 'version', 'faire', 'author_id', 'cover_id', 'opens_at', 'closes_at', 'retirer_photo', 'reason'].includes(field) || list || /^position_[1-9]\d{0,15}$/.test(field) || /^cartel_[1-9]\d{0,15}(?:_en|_de)?$/.test(field);
      if (!known) throw shapeError('Champ de saison inconnu.', 'formulaire', 'champ inattendu');
      if (list) {
        if ([].concat(value).length > LIMITS.photos || [].concat(value).some(v => !positive(v))) throw shapeError('Liste de photographies invalide.', 'photo_ids', 'identifiant invalide');
      } else if (typeof value !== 'string') throw shapeError('Texte attendu.', field.slice(0, 60), 'type inattendu');
    }
    if (body.faire != null && body.faire !== 'enregistrer') throw shapeError('Action de saison inconnue.', 'faire', 'action inconnue');
    return body;
  };
  const versionOf = body => {
    if (!positive(body.version)) throw shapeError('Version entière positive attendue.', 'version', 'identifiant invalide');
    return Number(body.version);
  };
  const dateLabel = (request, ms) => ms == null ? '' : new Intl.DateTimeFormat(request.t.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(ms);
  const datesOf = (request, s) => Object.fromEntries(['opens_at', 'closes_at'].map(f => [f, dateLabel(request, s[f])]));
  const authorsOf = request => {
    const scope = request.scope('saisons.ecrire');
    return repo.authors().filter(a => scope?.all || a.id === scope?.authorId);
  };
  const photoData = (request, ids, lang = request.t.lang) => {
    const all = app.publicRepo.photosByIds(ids, lang);
    const allowed = new Set(app.readiness.gate(ids).ok);
    return ids.map(id => {
      const p = all.get(id), visible = p && (p.status === 'published' || request.owns('photos.voir', p.author_id));
      if (!visible) return { id, title: request.t('Photo indisponible'), available: false, ready: false };
      const available = p.status === 'published' && allowed.has(id), q = withReady(p), widths = widthsFor(p.width);
      return { ...q, available, alt: p.alt_text || p.alt || '', thumb: available && q.ready ? `/media/${variantName(p.file, widths[0], 'webp', p.variant_key)}` : null,
        preview: available && q.ready ? `/media/${variantName(p.file, widths.filter(w => w <= 1280).at(-1) || widths[0], 'webp', p.variant_key)}` : null };
    });
  };
  const fieldValue = (body, field, max, fallback) => typeof body?.[field] === 'string' ? body[field].slice(0, max + 1) : fallback;
  const fieldsOf = (s, body) => {
    const fields = atelier.fields(s);
    if (!body) return fields;
    for (const f of Object.keys(fields)) {
      const base = f.replace(/_(en|de)$/, '');
      const max = f.startsWith('cartel_') ? LIMITS.cartel : LIMITS[base] || 40;
      fields[f] = fieldValue(body, f, max, fields[f]);
    }
    return fields;
  };
  function editor(request, reply, s, { body = null, error = null, status = 200 } = {}) {
    const t = request.t, canWrite = owns(request, 'saisons.ecrire', s), scope = request.scope('saisons.ecrire');
    let search = '', page = 1, choices = { photos: [], pages: 1 };
    if (canWrite && s.state === 'brouillon') {
      try {
        search = request.query?.q ?? '';
        const p = request.query?.page ?? '1';
        if (!positive(p)) throw shapeError('Recherche ou page invalide.', 'page', 'identifiant invalide');
        page = Number(p);
        choices = atelier.candidates({ search, page, author_id: scope.all ? null : scope.authorId });
      } catch (err) {
        if (!(err instanceof SaisonError)) throw err;
        signal(request, err); error ||= err; status = Math.max(status, err.status); search = typeof search === 'string' ? search.slice(0, 120) : ''; page = 1;
      }
    }
    const pagerUrl = p => `${back(s.id)}?q=${encodeURIComponent(search)}&page=${p}`;
    const fields = fieldsOf(s, body), cartels = new Map((s.cartels || []).map(x => [x.photo_id, x]));
    const photos = photoData(request, s.photo_ids).map((ph, index) => ({ ...ph, position: fieldValue(body, `position_${ph.id}`, 16, String(index + 1)), cartel: cartels.get(ph.id) }));
    const selected = new Set([].concat(body?.['ajouter[]'] || []).filter(positive).slice(0, LIMITS.photos).map(Number));
    const choiceIds = [...new Set([...choices.photos.map(p => p.id), ...selected])];
    const candidates = photoData(request, choiceIds).filter(p => p.available && !s.photo_ids.includes(p.id) && (scope?.all || p.author_id === scope?.authorId)).map(p => ({ ...p, selected: selected.has(p.id) }));
    return render(request, reply, 'saison', { title: s.title, saison: s, fields, photos, candidates, search,
      formVersion: body ? fieldValue(body, 'version', 16, '') : String(s.version), authors: authorsOf(request), canAssign: Boolean(scope?.all),
      canWrite, canPublish: owns(request, 'saisons.publier', s), zoneLabel: zone, datesLabel: datesOf(request, s),
      error: error ? t.msg(error.message) : null, errorField: error?.field || null,
      pager: { previous: page > 1 ? pagerUrl(page - 1) : null, next: page < choices.pages ? pagerUrl(page + 1) : null, label: t('Page {n} sur {total}', { n: page, total: choices.pages }) },
    }, status);
  }
  const list = (request, reply, { error = null, body = null, status = 200 } = {}) => {
    const filter = typeof request.query?.etat === 'string' && Object.hasOwn(PHASE_LABELS, request.query.etat) ? request.query.etat : '';
    const all = c.list();
    let featured_id = null;
    try { const v = JSON.parse(app.db.prepare("SELECT value FROM settings WHERE key = 'saison_accueil'").pluck().get() || 'null'); if (Number.isSafeInteger(v) && v > 0) featured_id = v; } catch { /* réglage ancien invalide : aucune mise en avant */ }
    const items = all.filter(s => owns(request, 'saisons.voir', s) && (!filter || s.phase === filter)).map(s => ({ ...s, datesLabel: Object.values(datesOf(request, s)).filter(Boolean).join(' → ') }));
    return render(request, reply, 'saisons', { title: request.t('Expositions'), list: items, filter, canWrite: Boolean(request.scope('saisons.ecrire')),
      authors: authorsOf(request), canAssign: Boolean(request.scope('saisons.ecrire')?.all), canFeature: Boolean(request.can('saisons.accueil')), featured_id, featureCandidates: all.filter(s => ['programme', 'publie'].includes(s.state)), fields: { title: fieldValue(body, 'title', LIMITS.title, ''), author_id: fieldValue(body, 'author_id', 16, '') },
      error: error ? request.t.msg(error.message) : null, errorField: error?.field || null }, status);
  };

  app.get('/admin/saisons', P('saisons.voir'), async (request, reply) => list(request, reply));
  app.post('/admin/saisons/accueil', W('saisons.accueil'), async (request, reply) => {
    try {
      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.saison_id !== 'string') throw shapeError('Choix de saison invalide.', 'saison_id', 'type inattendu');
      let id = null;
      if (body.saison_id !== '') {
        if (!positive(body.saison_id)) throw shapeError('Choix de saison invalide.', 'saison_id', 'identifiant invalide');
        id = Number(body.saison_id);
        const s = c.get(id);
        if (!s || !['programme', 'publie'].includes(s.state)) throw new SaisonError('Choisissez une saison validée pour l’accueil.', { field: 'saison_id' });
      }
      app.db.prepare("INSERT INTO settings (key, value) VALUES ('saison_accueil', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(id));
      (request.auditChanges ||= []).push('saison_accueil');
      return done(reply, '/admin/saisons', request.t('Choix de l’accueil enregistré.'));
    } catch (err) {
      if (!(err instanceof SaisonError)) throw err;
      signal(request, err); return list(request, reply, { error: err, status: err.status });
    }
  });
  app.post('/admin/saisons', W('saisons.ecrire'), async (request, reply) => {
    let body;
    try {
      body = formBody(request);
      const scope = request.scope('saisons.ecrire');
      let author_id = null;
      if (scope.all) {
        if (body.author_id != null && body.author_id !== '') {
          if (!positive(body.author_id) || !repo.authors().some(a => a.id === Number(body.author_id))) throw shapeError('Photographe inconnu.', 'author_id', 'identifiant invalide');
          author_id = Number(body.author_id);
        }
      } else {
        if (!scope.authorId || scope.authorId < 1) throw new SaisonError('Aucun photographe lié à votre compte.', { field: 'author_id' });
        if (body.author_id != null && body.author_id !== String(scope.authorId)) return app.forbid(request, reply);
        author_id = scope.authorId;
      }
      const id = c.create({ title: body.title, author_id });
      notes(request, null, c.get(id));
      return done(reply, back(id), request.t('Brouillon d’exposition créé.'));
    } catch (err) {
      if (!(err instanceof SaisonError)) throw err;
      signal(request, err); return list(request, reply, { error: err, body, status: err.status });
    }
  });
  app.get('/admin/saisons/:id', P('saisons.voir'), async (request, reply) => {
    const s = load(request); return s ? editor(request, reply, s) : reply.callNotFound();
  });
  // Les cartels des 500 photos en trois langues peuvent atteindre 7 Mio après encodage URL ; la borne reste locale.
  app.post('/admin/saisons/:id', { ...W('saisons.ecrire'), bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const s = load(request); if (!s) return reply.callNotFound();
    if (!owns(request, 'saisons.ecrire', s)) return app.forbid(request, reply);
    let body;
    try {
      body = formBody(request); versionOf(body);
      const scope = request.scope('saisons.ecrire');
      if (!scope.all && body.author_id != null && body.author_id !== String(s.author_id)) return app.forbid(request, reply);
      if (scope.all && body.author_id && (!positive(body.author_id) || !repo.authors().some(a => a.id === Number(body.author_id)))) throw shapeError('Photographe inconnu.', 'author_id', 'identifiant invalide');
      if (!scope.all) for (const raw of [].concat(body['ajouter[]'] || [])) {
        const p = repo.photo(Number(raw));
        if (p && p.author_id !== scope.authorId) { outOfScope(request, p.id, 'photo'); return app.forbid(request, reply); }
      }
      const after = atelier.save(s.id, body); notes(request, s, after);
      return done(reply, back(s.id), request.t('Exposition enregistrée.'));
    } catch (err) {
      if (!(err instanceof SaisonError)) throw err;
      signal(request, err); return editor(request, reply, c.get(s.id), { body, error: err, status: err.status });
    }
  });
  app.get('/admin/saisons/:id/apercu', P('saisons.voir'), async (request, reply) => {
    const s = load(request); if (!s) return reply.callNotFound();
    const lang = langOf(request.query?.langue), local = f => lang === 'fr' ? s[f] : s[`${f}_${lang}`] || '';
    return render(request, reply, 'saison-apercu', { title: request.t('Aperçu privé'), saison: s, previewLang: lang, previewTitle: local('title'), previewIntro: local('intro'),
      previewSubtitle: local('subtitle'), previewPrologue: local('prologue'), previewConclusion: local('conclusion'), photos: photoData(request, s.photo_ids, lang).map(ph => ({ ...ph, cartel: (s.cartels || []).find(x => x.photo_id === ph.id)?.[lang === 'fr' ? 'cartel' : `cartel_${lang}`] || '' })),
      zoneLabel: zone, datesLabel: datesOf(request, s) });
  });
  const confirm = (request, reply, s, action, { error = null, status = 200, body = null } = {}) => render(request, reply, 'saison-confirmer', {
    title: request.t(ACTIONS[action].label), saison: s, action, actionLabel: request.t(ACTIONS[action].label), confirmText: request.t(ACTIONS[action].message),
    photos: photoData(request, s.photo_ids), zoneLabel: zone, datesLabel: datesOf(request, s), formVersion: body ? fieldValue(body, 'version', 16, '') : String(s.version),
    withdrawReasons: REASONS, reason: typeof body?.reason === 'string' ? body.reason : '', error: error ? request.t.msg(error.message) : null, errorField: error?.field || null,
  }, status);
  app.get('/admin/saisons/:id/confirmer', P('saisons.publier'), async (request, reply) => {
    const s = load(request); if (!s) return reply.callNotFound();
    if (!owns(request, 'saisons.publier', s)) return app.forbid(request, reply);
    const action = request.query?.action;
    return typeof action === 'string' && Object.hasOwn(ACTIONS, action) ? confirm(request, reply, s, action) : reply.callNotFound();
  });
  for (const [action, config] of Object.entries(ACTIONS)) app.post(`/admin/saisons/:id/${action}`, W('saisons.publier'), async (request, reply) => {
    const s = load(request); if (!s) return reply.callNotFound();
    if (!owns(request, 'saisons.publier', s)) return app.forbid(request, reply);
    let body;
    try {
      body = formBody(request); const version = versionOf(body);
      if (action === 'retirer' && !REASONS.some(r => r.value === body.reason)) throw new SaisonError('Choisissez un motif de retrait.', { field: 'reason' });
      const after = c.revise(s.id, { version, action: config.method }); notes(request, s, after);
      if (action === 'retirer') {
        app.audit.log({ sub: request.session.sub, name: request.session.name, action: 'POST /admin/saisons/:id/retirer', target: String(s.id), status: 303,
          detail: `champs : state, retired_at ; motif : ${body.reason}` });
        request.audited = true;
      }
      return done(reply, back(s.id), request.t(config.done));
    } catch (err) {
      if (!(err instanceof SaisonError)) throw err;
      signal(request, err); return confirm(request, reply, c.get(s.id), action, { body, error: err, status: err.status });
    }
  });
}
