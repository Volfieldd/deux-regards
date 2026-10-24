import crypto from 'node:crypto';
import { createVault } from '../vault.js';
import { createRateLimiter } from '../ratelimit.js';
import { usesV2 } from '../version-publique.js';
import { localize } from '../i18n.js';
import { createSaisonsVotes, SaisonVoteError, NOTICE_VERSION } from '../saisons-votes.js';
import { VOTE_UI } from '../saisons-votes-textes.js';

const TTL = 30 * 60 * 1000;
const validToken = raw => typeof raw === 'string' && /^[A-Za-z0-9_-]{43}$/.test(raw) && Buffer.from(raw, 'base64url').toString('base64url') === raw;
export const voteCookieName = (app, id) => `${app.config.secureCookies ? '__Host-' : ''}exposition_vote_${id}`;
const cookieOptions = app => ({ path: '/', httpOnly: true, secure: app.config.secureCookies, sameSite: 'lax' });
const rawToken = (app, request, sid) => {
  const raw = request.cookies?.[voteCookieName(app, sid)];
  return validToken(raw) ? raw : null;
};
const noCache = reply => reply.header('cache-control', 'private, no-store').header('x-robots-tag', 'noindex').header('referrer-policy', 'no-referrer');

// Le défi CSRF signé ne requiert ni session, ni stockage, ni cookie avant le premier vote. Après celui-ci, il est
// lié au cookie HttpOnly : un formulaire obtenu sur un autre navigateur ne peut pas annuler les votes de celui-ci.
export function installExpositionVotes(app, { now = Date.now, approvedIds = id => app.saisonsPropositions.approvedIds(id), timers = true } = {}) {
  const vault = createVault(app.config.dataKey);
  const key = Buffer.from(crypto.hkdfSync('sha256', app.config.cookieSecret, 'nicephos', 'expositions-formulaire-v1', 32));
  const firstKey = Buffer.from(crypto.hkdfSync('sha256', app.config.cookieSecret, 'nicephos', 'expositions-premier-vote-v1', 32));
  const sign = (scope, raw, stamp) => crypto.createHmac('sha256', key).update(`${scope}\0${raw || ''}\0${stamp}`).digest('base64url');
  const forms = {
    now, enabled: vault.enabled, approvedIds,
    limit: createRateLimiter({ limit: 60, windowMs: 60 * 1000, now }),
    csrf(scope, raw) { const stamp = `${now()}.${crypto.randomBytes(12).toString('base64url')}`; return `${stamp}.${sign(scope, raw, stamp)}`; },
    // Après validation du défi et consentement, deux envois du même formulaire initial retrouvent le même jeton.
    // Clé et usage distincts du MAC CSRF : aucun identifiant de vote n’est exposé dans le formulaire.
    firstToken(sid, csrf) {
      const [issued, nonce] = csrf.split('.');
      return crypto.createHmac('sha256', firstKey).update(`vote:${sid}\0${issued}\0${nonce}`).digest('base64url');
    },
    accepts(scope, raw, value) {
      if (typeof value !== 'string' || value.length > 100 || !/^\d{1,16}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
      const [issued, nonce, mac] = value.split('.'), at = Number(issued), t = now();
      if (!Number.isSafeInteger(at) || at > t || t - at >= TTL) return false;
      return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(sign(scope, raw, `${issued}.${nonce}`)));
    },
  };
  app.decorate('saisonsVotes', createSaisonsVotes({ db: app.db, vault, saisons: app.saisons, approvedIds, readiness: app.readiness, now }));
  app.decorate('expositionVoteForms', forms);
  let timer;
  const purge = () => { try { app.saisonsVotes.purgeDue(); } catch (err) { app.log.error({ err }, 'expositions : purge des votes'); } };
  app.addHook('onReady', async () => { purge(); if (timers) { timer = setInterval(purge, 60 * 1000); timer.unref(); } });
  app.addHook('onClose', async () => clearInterval(timer));
}

// À joindre aux pages S2 : la visite n’écrit rien, ne pose aucun cookie et ne charge aucun identifiant dans le HTML.
export function expositionVoteLinks(app, { request, reply, lang, exposition, photo = null }) {
  app.saisonsVotes.purgeDue();
  const raw = rawToken(app, request, exposition.id), root = `/exposition/${exposition.slug}`;
  const t = app.expositionVoteForms.now();
  const closed = exposition.phase !== 'ouverte' || t < exposition.opens_at || t >= exposition.closes_at;
  const values = !closed && app.expositionVoteForms.enabled ? app.expositionVoteForms.approvedIds(exposition.id) : [];
  const approved = Array.isArray(values) && values.length <= 500 && new Set(values).size === values.length ? values : [];
  const visible = new Map((exposition.photos || []).map(p => [p.id, p]));
  // L’ordre public est exactement celui de la liste doublement validée, filtrée par la projection S2. Il ne
  // réordonne jamais l’accrochage et ne révèle ni proposition privée, ni compteur, ni classement des visiteurs.
  const proposals = approved.map(id => visible.get(id)).filter(Boolean).map(p => ({ id: p.id, title: p.title,
    photoHref: localize(`${root}/photo/${p.slug}`, lang), voteHref: localize(`${root}/photo/${p.slug}/voter`, lang) }));
  if (closed && raw) reply.clearCookie(voteCookieName(app, exposition.id), cookieOptions(app));
  return { v: VOTE_UI[lang], proposals, entryHref: !photo && proposals.length ? '#vote-consultatif' : null,
  voteHref: photo && approved.includes(photo.id)
    ? localize(`${root}/photo/${photo.slug}/voter`, lang) : null,
  manageHref: raw && !closed ? localize(`${root}/participation`, lang) : null };
}

export function registerExpositionVotes(app, { lang, base, repo }) {
  const v = VOTE_UI[lang], forms = app.expositionVoteForms, votes = app.saisonsVotes, u = path => localize(path, lang);
  const bySlug = app.db.prepare('SELECT id FROM saisons WHERE slug = ?');
  const publicView = request => usesV2(app.publicVersion.forRequest(request, 'expositions').version);
  const root = s => `/exposition/${s.slug}`, manage = s => `${root(s)}/participation`;
  const open = s => ['programme', 'publie'].includes(s.state) && s.opens_at <= forms.now() && forms.now() < s.closes_at;
  const clear = (reply, s) => reply.clearCookie(voteCookieName(app, s.id), cookieOptions(app));
  const season = (request, reply) => {
    noCache(reply); votes.purgeDue();
    if (!publicView(request) || typeof request.params.slug !== 'string' || request.params.slug.length > 160) return null;
    const row = bySlug.get(request.params.slug), s = row ? app.saisons.get(row.id) : null;
    if (!s) return null;
    if (!open(s) && request.cookies?.[voteCookieName(app, s.id)] !== undefined) clear(reply, s);
    return ['programme', 'publie'].includes(s.state) && s.opens_at <= forms.now() && app.expositions.bySlug(s.slug, { lang }) ? s : null;
  };
  const photo = (s, slug) => {
    if (typeof slug !== 'string' || slug.length > 200) return null;
    return app.expositions.photo(s.slug, slug, { lang })?.photo || null;
  };
  const title = s => s[lang === 'fr' ? 'title' : `title_${lang}`];
  const render = (request, reply, s, data = {}, status = 200) => {
    noCache(reply).code(status);
    return reply.render('exposition-vote', { ...base, v, exposition: s, expositionTitle: title(s), noticeVersion: NOTICE_VERSION,
      date: new Intl.DateTimeFormat({ fr: 'fr-FR', en: 'en-GB', de: 'de-DE' }[lang], { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(s.closes_at),
      siteName: app.siteName(), pageTitle: `${data.mode === 'manage' ? v.manage : v.title} · ${app.siteName()}`, description: '', robots: 'noindex',
      canonical: null, mode: 'vote', state: null, photo: null, error: null, csrf: '', withdrawCsrf: '', exportCsrf: '', available: forms.enabled,
      exhibitionHref: u(root(s)), manageHref: u(manage(s)), ...data });
  };
  const refused = (request, reply, s, data, status = 403, error = 'refused') => render(request, reply, s, { ...data, error }, status);
  const emit = (request, type, detail) => app.securite.emit(type, { request, emetteur: 'server/routes/expositions-votes.js', detail: { formulaire: 'vote_exposition', ...detail } });
  const guard = (request, reply, s, scope, data, { initialVote = false } = {}) => {
    const origin = request.headers.origin, fetch = request.headers['sec-fetch-site'];
    if (fetch === 'cross-site' || fetch === 'same-site' || (origin ? origin !== new URL(app.config.publicUrl).origin : fetch !== 'same-origin')) {
      emit(request, 'input_validation_fail', { raison: 'provenance refusée' }); refused(request, reply, s, data); return false;
    }
    const raw = rawToken(app, request, s.id), csrf = request.body?._csrf;
    const accepted = forms.accepts(scope, raw, csrf)
      // Le formulaire initial peut revenir après réception du cookie, seulement pour le vote et si ce cookie
      // est exactement celui dérivé de son nonce signé. Export et retrait gardent leur liaison ordinaire.
      || (initialVote && raw && forms.accepts(scope, null, csrf)
        && crypto.timingSafeEqual(Buffer.from(raw), Buffer.from(forms.firstToken(s.id, csrf))));
    if (!accepted) {
      emit(request, 'input_validation_fail', { raison: 'défi de formulaire invalide' }); refused(request, reply, s, data); return false;
    }
    if (!forms.limit(request.ip)) {
      emit(request, 'excess_rate_limit_exceeded', { limite: 'vote_exposition' }); refused(request, reply, s, data, 429, 'limit'); return false;
    }
    if (request.body?.website) {
      emit(request, 'malicious_honeypot', { piege: 'champ caché' }); refused(request, reply, s, data); return false;
    }
    return true;
  };
  const voteData = (request, s, p) => {
    const raw = rawToken(app, request, s.id);
    const state = votes.forBrowser(s.id, raw);
    return { photo: p, state, recorded: state.photo_ids.includes(p.id), backHref: u(`${root(s)}/photo/${p.slug}`),
      action: u(`${root(s)}/photo/${p.slug}/voter`), csrf: forms.csrf(`vote:${s.id}:${p.id}`, raw) };
  };
  const manageData = (request, s) => {
    const raw = rawToken(app, request, s.id);
    let state, recoverable = false;
    try { state = votes.forBrowser(s.id, raw); }
    catch (err) {
      // Une preuve altérée ne bloque pas le retrait : l’index du cookie suffit à effacer les bulletins propres.
      if (!(err instanceof SaisonVoteError) || err.status !== 503 || !raw || !forms.enabled) throw err;
      state = { photo_ids: [], consented: false, closes_at: s.closes_at, closed: !open(s) }; recoverable = true;
    }
    const shown = new Map((app.expositions.bySlug(s.slug, { lang })?.photos || []).map(p => [p.id, p]));
    return { mode: 'manage', state, recoverable, ...(recoverable ? { error: 'unavailable' } : {}), items: state.photo_ids.map(id => {
      const p = shown.get(id);
      return { title: p ? p.title : v.unavailablePhoto, href: p ? u(`${root(s)}/photo/${p.slug}`) : null };
    }), withdrawHref: u(`${manage(s)}/retirer`), exportHref: u(`${manage(s)}/export`),
    withdrawCsrf: forms.csrf(`retirer:${s.id}`, raw), exportCsrf: forms.csrf(`export:${s.id}`, raw) };
  };
  const businessError = (request, reply, s, data, err) => {
    if (!(err instanceof SaisonVoteError)) throw err;
    return refused(request, reply, s, data, err.status, err.field === 'consent' ? 'consent' : err.status === 503 ? 'unavailable' : 'stale');
  };

  app.get('/exposition/:slug/photo/:photoSlug/voter', async (request, reply) => {
    const s = season(request, reply); if (!s) return reply.callNotFound();
    if (!open(s)) return render(request, reply, s, { mode: 'manage', state: { closed: true } }, 410);
    const p = photo(s, request.params.photoSlug);
    if (!p || !forms.approvedIds(s.id).includes(p.id)) return reply.callNotFound();
    try { return render(request, reply, s, voteData(request, s, p)); }
    catch (err) { return businessError(request, reply, s, {}, err); }
  });
  app.post('/exposition/:slug/photo/:photoSlug/voter', { bodyLimit: 4096 }, async (request, reply) => {
    const s = season(request, reply); if (!s) return reply.callNotFound();
    const p = photo(s, request.params.photoSlug);
    if (!p) return reply.callNotFound();
    let data;
    try { data = voteData(request, s, p); } catch (err) { return businessError(request, reply, s, {}, err); }
    if (!guard(request, reply, s, `vote:${s.id}:${p.id}`, data, { initialVote: true })) return reply;
    if (!forms.approvedIds(s.id).includes(p.id)) return refused(request, reply, s, data, 409, 'stale');
    const previous = rawToken(app, request, s.id);
    if (!previous && (request.body?.consent !== 'oui' || request.body?.notice_version !== NOTICE_VERSION))
      return refused(request, reply, s, data, 422, 'consent');
    const raw = previous || forms.firstToken(s.id, request.body._csrf);
    try {
      const result = votes.cast(s.id, p.id, raw, { consent: request.body?.consent === 'oui', noticeVersion: request.body?.notice_version });
      // Aucun Set-Cookie sur un refus ; la date est celle de l’exposition, jamais une durée glissante.
      reply.setCookie(voteCookieName(app, s.id), raw, { ...cookieOptions(app), expires: new Date(result.closes_at) });
      return reply.redirect(data.action, 303);
    } catch (err) { return businessError(request, reply, s, data, err); }
  });
  app.get('/exposition/:slug/participation', async (request, reply) => {
    const s = season(request, reply); if (!s) return reply.callNotFound();
    try { return render(request, reply, s, { ...manageData(request, s), removed: request.query.retrait === 'fait' && !rawToken(app, request, s.id) }); }
    catch (err) { return businessError(request, reply, s, { mode: 'manage' }, err); }
  });
  app.post('/exposition/:slug/participation/retirer', { bodyLimit: 4096 }, async (request, reply) => {
    const s = season(request, reply); if (!s) return reply.callNotFound();
    let data;
    try { data = manageData(request, s); } catch (err) { return businessError(request, reply, s, { mode: 'manage' }, err); }
    if (!guard(request, reply, s, `retirer:${s.id}`, data)) return reply;
    if (request.body?.confirm !== 'retirer') return refused(request, reply, s, data, 422, 'confirm');
    try { votes.withdraw(s.id, rawToken(app, request, s.id)); clear(reply, s); return reply.redirect(`${u(manage(s))}?retrait=fait`, 303); }
    catch (err) { return businessError(request, reply, s, data, err); }
  });
  app.post('/exposition/:slug/participation/export', { bodyLimit: 4096 }, async (request, reply) => {
    const s = season(request, reply); if (!s) return reply.callNotFound();
    if (!guard(request, reply, s, `export:${s.id}`, { mode: 'manage' })) return reply;
    try {
      const own = votes.exportForBrowser(s.id, rawToken(app, request, s.id));
      return noCache(reply).header('content-disposition', 'attachment; filename="mes-votes.json"').type('application/json; charset=utf-8')
        .send({ exposition_id: s.id, ...own });
    } catch (err) { return businessError(request, reply, s, { mode: 'manage' }, err); }
  });
}
