import crypto from 'node:crypto';
import { registerPermissions, hasRole } from './permissions.js';
import { createOidc } from './oidc.js';
import { createSessionStore, IDLE_TTL, hash as hashToken } from './sessions.js';
import { createRateLimiter } from './ratelimit.js';
import { networkOf } from './securite/reseau.js';
import { uaFamily } from './securite/detection.js';

const TX_TTL = 10 * 60; // secondes pour revenir de l'IdP
// Connexions en cours (un cookie de transaction par onglet) : au-delà, les plus anciennes sont oubliées, et la page
// demandée n'est gardée que si elle est courte — une page tierce qui enchaîne les /auth/login ne peut pas gonfler
// l'en-tête Cookie jusqu'au refus (431) de tout le site pour ce navigateur.
const TX_MAX = 3;
const NEXT_MAX = 1000;
const PROMPTS = new Set(['login', 'select_account']);
const STATE_RE = /^[\w-]{16,128}$/;
const LOCAL = 'http://local.invalid';

// Chemin local uniquement. On laisse l'analyseur d'URL du navigateur trancher :
// « //hôte », « /\\hôte » ou « /<tab>/hôte » (tabulations et sauts de ligne supprimés)
// sortent du site et sont refusés ; le résultat est normalisé, sans caractère de contrôle.
export function safeNext(value, fallback = '/admin') {
  if (typeof value !== 'string' || !value.startsWith('/')) return fallback;
  try {
    const url = new URL(value, LOCAL);
    const local = url.pathname + url.search + url.hash;
    // La normalisation (« /./ », « /../ ») peut produire « //hôte » : refusé aussi après coup.
    return url.origin === LOCAL && !/^\/[/\\]/.test(local) ? local : fallback;
  } catch {
    return fallback;
  }
}

// Comparaison à temps constant, longueur comprise (on compare des empreintes de taille fixe).
export function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const h = v => crypto.createHash('sha256').update(v).digest();
  return crypto.timingSafeEqual(h(a), h(b)) && a.length === b.length;
}

// Authentification OIDC (Zitadel), sessions côté serveur et CSRF.
// Expose request.session, app.requireAdmin et app.verifyCsrf.
export async function setupAuth(app, { oidc = createOidc(app.config) } = {}) {
  const { config } = app;
  const sessions = createSessionStore(app.db);
  app.decorate('purgeSessions', () => sessions.purge());
  // Préfixe __Host- : cookie lié à l'hôte exact, Secure, Path=/ (impossible à poser depuis un sous-domaine).
  const prefix = config.secureCookies ? '__Host-' : '';
  const SESSION_COOKIE = `${prefix}session`;
  // Un cookie de transaction par state : deux connexions dans deux onglets ne s'écrasent pas.
  const txCookie = state => `${prefix}oidc-${state}`;
  const cookieBase = { path: '/', httpOnly: true, secure: config.secureCookies, sameSite: 'lax' };
  // Vérification d'identité : lien vers /auth/verifier, et la page de l'admin où revenir (celle d'où part l'écriture,
  // d'après Referer quand il vient du site lui-même ; sinon l'accueil de l'admin).
  const verifyHref = next => `/auth/verifier?next=${encodeURIComponent(next)}`;
  const backTo = request => {
    try {
      const r = new URL(String(request.headers.referer || ''));
      if (r.host !== request.headers.host) return '/admin';
      const p = safeNext(r.pathname + r.search);
      return /^\/admin(?:[/?#]|$)/.test(p) && p.length <= NEXT_MAX ? p : '/admin';
    } catch { return '/admin'; }
  };
  app.decorate('identityHref', verifyHref);

  // Tentatives de connexion par IP sur 10 minutes (30 par défaut) : large pour un humain, freine les abus.
  const allow = createRateLimiter({ limit: config.authRateLimit, windowMs: 10 * 60 * 1000 });
  // Seules les vraies tentatives comptent (retour de l'IdP, envoi du formulaire local) : la simple
  // redirection /auth/login ne permet pas de bloquer la connexion d'un tiers derrière la même adresse.
  const isAttempt = request => request.routeOptions.url === '/auth/callback'
    || (request.routeOptions.url === '/auth/local' && request.method === 'POST');

  // Sans OIDC_ORG_ID, un rôle « admin » donné dans une autre organisation Zitadel (projet partagé) serait accepté :
  // en ligne, le rôle de l'IdP ne crée alors aucun administrateur (ADMIN_SUBS et OIDC_ALLOWED_SUBS, listes explicites de
  // sub, restent les voies d'amorce).
  const idpRoleTrusted = !(config.oidc.projectId && !config.oidc.orgId && config.deployed);
  if (config.oidc.projectId && !config.oidc.orgId) {
    app.log.warn(idpRoleTrusted ? 'OIDC_ORG_ID non défini : un rôle admin donné dans une autre organisation Zitadel serait accepté'
      : 'OIDC_ORG_ID non défini : le rôle admin de Zitadel est ignoré (amorce par ADMIN_SUBS ou OIDC_ALLOWED_SUBS) ; renseignez OIDC_ORG_ID');
  }

  app.decorate('oidc', oidc);
  app.decorateRequest('session', null);
  // Comptes et journal (server/accounts.js, décorés par buildApp) : les rôles d'une session sont ceux de son compte,
  // relus à chaque requête.
  const { accounts, audit, securite } = app;
  // Vigie : contexte d'une session à sa création, et changements déjà signalés (une fois par session et par nature).
  // L'adresse complète n'est pas gardée dans la session (seuls le réseau, le pays et le navigateur servent).
  // Empreinte : navigateur complet, langues, plateforme et mobile annoncés (client hints) ; un vol de cookie depuis un
  // autre appareil la change même quand la famille de navigateur est la même.
  // Empreinte d'appareil : en-têtes stables du navigateur, chiffres retirés de l'agent (une mise à jour du navigateur ou
  // du système ne change pas l'appareil ; revue de la Vigie du 17 octobre 2026).
  const fpOf = h => crypto.createHash('sha256').update(['user-agent', 'accept-language', 'sec-ch-ua-platform', 'sec-ch-ua-mobile'].map(k => (k === 'user-agent' ? String(h[k] || '').replace(/\d+/g, '') : String(h[k] || ''))).join('\n')).digest('hex').slice(0, 16);
  // Bordure (phase C3) : opérateur et empreintes TLS, seulement si le Worker les a signés (request.bordure).
  const ctxOf = request => {
    const n = networkOf(request), b = request.bordure;
    return { ip: null, net: n.ip_net ?? null, country: n.country ?? null, ua: uaFamily(request.headers['user-agent']), fp: fpOf(request.headers),
      asn: b?.asn ?? null, tls: b?.tls ?? null, tlsBrut: b?.tlsBrut ?? null };
  };
  const told = new Map();
  const startedAt = Date.now();
  const tellOnce = (id, kind) => {
    const k = `${id}:${kind}`;
    if (told.has(k)) return false;
    if (told.size >= 10_000) told.delete(told.keys().next().value);
    told.set(k, true);
    return true;
  };
  const sessionChecks = (request, token) => {
    if (!securite.enabled) return;
    const s = request.session;
    if (!s) {
      // Cookie d'une session fermée ou expirée avant cette requête : copié (vol de cookie) ou vieil onglet. Les
      // requêtes parties juste avant la fermeture (10 s) ne comptent pas.
      const r = sessions.revoked(token);
      if (!r || Date.now() - r.revoked_at < 10e3) return;
      const ctx = ctxOf(request);
      if (!tellOnce(`fermee:${r.id}`, ctx.net)) return;                      // une fois par session et par réseau
      // Rejoué depuis un autre appareil : autre réseau ET autre navigateur (famille ou empreinte). Un seul des deux (box
      // qui change d'adresse, même appareil ; navigateur mis à jour) reste « moyen », sans réponse automatique.
      const otherDevice = r.ctx_ua !== ctx.ua || Boolean(r.ctx_fp && r.ctx_fp !== ctx.fp);
      const same = !(r.ctx_net !== ctx.net && otherDevice);
      const a = accounts.bySub(r.sub);
      securite.emit('session_use_after_expire', { request, sub: r.sub, severity: same ? 'moyen' : 'haut', emetteur: 'server/auth.js · session', reference: `session:${String(r.id).slice(0, 12)}`,
        detail: { fermee_il_y_a_min: Math.round((Date.now() - r.revoked_at) / 60e3), expiree: r.expires_at <= r.revoked_at + 1000, meme_reseau_et_navigateur: same, compte_actif: a?.status === 'actif',
        // Bordure : observé seulement (stabilité des empreintes TLS à mesurer avant d'en faire une preuve).
        empreinte_tls_changee: r.ctx_tls && ctx.tls ? r.ctx_tls !== ctx.tls : undefined, operateur_change: r.ctx_asn && ctx.asn ? r.ctx_asn !== ctx.asn : undefined } });
      return;
    }
    if (!s.ctx_ua && !s.ctx_net) {
      // Session sans contexte : ouverte avant la Vigie, ou écrite directement dans la base (jamais par la connexion).
      if (s.created_at > startedAt && tellOnce(s.id, 'sans-contexte')) {
        securite.emit('session_context_change', { request, severity: 'haut', emetteur: 'server/auth.js · session', detail: { raison: 'session sans contexte, créée hors de la connexion' } });
      }
      return;
    }
    const ctx = ctxOf(request);
    const browser = s.ctx_ua !== ctx.ua, country = Boolean(s.ctx_country && ctx.country && s.ctx_country !== ctx.country), net = s.ctx_net !== ctx.net;
    // Même famille de navigateur mais autre empreinte (autre appareil, autres langues) : « moyen », « haut » s'il change
    // aussi de réseau. Session d'avant l'empreinte (ctx_fp vide) : non comparée.
    const device = !browser && Boolean(s.ctx_fp) && s.ctx_fp !== ctx.fp;
    // Bordure (phase C3) : empreinte TLS ou opérateur changés pendant la session. Observés en « info » tant que leur
    // stabilité n'est pas mesurée (docs/wiki/Vigie.md, bordure) ; ils ne relèvent pas la gravité.
    // L'empreinte brute (gardée avec la session, pour l'enquête) n'est pas suivie ici : elle change avec la reprise de
    // session TLS et produirait un événement à chaque nouvelle valeur (revue C3).
    const tls = Boolean(s.ctx_tls && ctx.tls && s.ctx_tls !== ctx.tls), tlsBrut = false;
    const asn = Boolean(s.ctx_asn && ctx.asn && s.ctx_asn !== ctx.asn);
    if (!browser && !device && !country && !net && !tls && !tlsBrut && !asn) return;
    const kind = `${browser ? 'n' : ''}${device ? 'e' : ''}${country ? 'p' : ''}${net ? `r${ctx.net}` : ''}${tls ? `t${ctx.tls}` : ''}${tlsBrut ? `b${ctx.tlsBrut}` : ''}${asn ? `a${ctx.asn}` : ''}`;
    if (!tellOnce(s.id, kind)) return;
    const severity = browser && country ? 'critique' : browser || (device && (net || country)) ? 'haut' : device || country ? 'moyen' : 'info';
    securite.emit('session_context_change', { request, severity, emetteur: 'server/auth.js · session',
      detail: { navigateur: browser ? { avant: s.ctx_ua, apres: ctx.ua } : undefined, empreinte_changee: device || undefined, pays: country ? { avant: s.ctx_country, apres: ctx.country } : undefined, reseau: net ? { avant: s.ctx_net, apres: ctx.net } : undefined,
        tls_change: tls || undefined, tls_brut_change: tlsBrut || undefined, operateur: asn ? { avant: s.ctx_asn, apres: ctx.asn } : undefined } });
  };
  const lastPending = app.db.prepare("SELECT MAX(at) FROM audit_log WHERE sub = ? AND action = 'connexion en attente d’un rôle'").pluck();

  app.addHook('onRequest', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const before = securite.enabled ? sessions.revoked(token) : null;
    request.session = sessions.load(token);
    if (!request.session) {
      reply.clearCookie(SESSION_COOKIE, cookieBase);
      if (before) sessionChecks(request, token);
      else if (securite.enabled && sessions.revoked(token)) securite.emit('session_expired', { request, sub: sessions.revoked(token).sub, emetteur: 'server/auth.js · session' });
      return;
    }
    // Décision de la Vigie (session révoquée, sessions du compte révoquées, compte gelé) : la session est fermée.
    const denied = app.decisions?.sessionDenied(request.session, request.ip);
    if (denied) {
      securite.emit('session_destroyed', { request, emetteur: 'server/auth.js · décision de la Vigie', detail: { motif: denied } });
      sessions.destroy(token);
      reply.clearCookie(SESSION_COOKIE, cookieBase);
      request.session = null;
      return;
    }
    sessionChecks(request, token);
    accounts.ensure({ sub: request.session.sub, name: request.session.name, email: request.session.email });   // sans rôle s'il manquait
    request.session.roles = accounts.rolesOf(request.session.sub);
    request.session.adjust = accounts.adjustOf(request.session.sub);
  });

  const pendingPage = { title: 'Compte en attente', message: 'Votre compte est bien enregistré. Un administrateur doit maintenant lui donner un rôle ; réessayez ensuite.' };
  // data.t : traduction de l'admin (request.t), quand la langue du compte est connue ; la page est alors dans sa langue,
  // liens compris, et le dit (lang).
  const renderError = (reply, code, data) => reply.code(code).header('cache-control', 'no-store').render('auth-error', {
    siteName: app.siteName(), pageTitle: `${data.title} · ${app.siteName()}`, description: '', lang: data.t?.lang || 'fr', ...data,
  });

  // Permissions de chaque route (server/permissions.js).
  registerPermissions(app, { renderError });

  // preHandler des pages d'admin : sans session, retour à la connexion (GET) ou 401.
  app.decorate('requireAdmin', async function (request, reply) {
    reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex');
    if (!request.session) {
      if (request.method === 'GET' || request.method === 'HEAD') {
        return reply.redirect(`/auth/login?next=${encodeURIComponent(request.url)}`);
      }
      return reply.code(401).send({ error: (request.t || (x => x))('Session expirée, reconnectez-vous.') });
    }
    if (!hasRole(request.session.roles)) {
      const a = accounts.bySub(request.session.sub);
      const t = request.t || (x => x);                                          // langue de l'admin, si elle est connue
      // Une sortie : changer de compte (la session sans rôle est oubliée par /auth/login) ou se déconnecter.
      const out = { t: request.t, switchAccount: true, logoutCsrf: request.session.csrf };
      if (a?.status === 'en_attente') return renderError(reply, 403, { title: t(pendingPage.title), message: t(pendingPage.message), sub: a.sub, ...out });
      return renderError(reply, 403, { title: t('Accès refusé'), message: t('Ce compte n’a pas accès à l’administration.'), ...out });
    }
    // Expiration glissante : le cookie suit l'échéance de la session.
    const maxAge = Math.floor((request.session.expires_at - Date.now()) / 1000);
    reply.setCookie(SESSION_COOKIE, request.cookies[SESSION_COOKIE], { ...cookieBase, maxAge });
  });

  const csrfOk = request => Boolean(request.session) && sameToken(request.body?._csrf ?? request.headers['x-csrf-token'], request.session.csrf);
  const csrfPage = (request, reply) => {
    const t = request.t || (x => x);                                            // pas de langue connue : français
    return renderError(reply, 403, { t: request.t, title: t('Formulaire expiré'), message: t('Ce formulaire n’est plus valide. Rechargez la page et recommencez.') });
  };

  // preHandler des routes d'écriture : jeton synchronisé (champ _csrf ou en-tête x-csrf-token).
  // Page d'erreur pour un formulaire, JSON pour un appel fetch.
  app.decorate('verifyCsrf', async function (request, reply) {
    if (csrfOk(request)) return;
    if (request.session) securite.emit('authz_csrf_fail', { request, emetteur: 'server/auth.js · CSRF', detail: { jeton: request.body?._csrf ?? request.headers['x-csrf-token'] ? 'faux' : 'absent' } });
    if (request.headers.accept?.includes('text/html')) return csrfPage(request, reply);
    return reply.code(403).send({ error: (request.t || (x => x))('Jeton CSRF invalide.') });
  });

  // Vérification d'identité demandée par la Vigie (décision verifier_identite ; server/securite/decisions.js) : une
  // écriture de l'admin (méthode autre que GET et HEAD) d'une session authentifiée chez Zitadel avant le début de la
  // décision est arrêtée ; la personne confirme son identité (/auth/verifier : nouvelle connexion, second facteur), puis
  // revient à sa page. Les lectures restent permises : l'admin montre un bandeau qui explique (server/verification-identite.js).
  // Crochet commun de l'admin (server/routes/admin.js), après la session et la permission : jamais dans un gabarit.
  // Préférences d'affichage et aperçu d'un billet : n'écrivent rien que la Vigie protège, laissés passer.
  // Lectures arrêtées elles aussi : les exportations et originaux (routes notées au journal, config.audit), qu'un voleur
  // de cookie de session emporterait en une requête (export d'une personne, sélection d'une galerie, original d'une photo).
  // Le choix v1 / v2 (account_prefs) en est une aussi : la personne peut revenir à l'admin qu'elle connaît.
  const NO_WRITE = new Set(['/admin/langue', '/admin/theme', '/admin/version', '/admin/carnet/:id/apercu']);
  app.decorate('requireFreshIdentity', async function (request, reply) {
    const read = request.method === 'GET' || request.method === 'HEAD';
    if (!request.session || (read && !request.routeOptions.config?.audit) || (!read && NO_WRITE.has(request.routeOptions.url))) return;
    const v = app.decisions?.identityRequired(request.session);
    if (!v) return;
    const t = request.t || (x => x);
    const href = verifyHref(backTo(request));
    // Une fois par minute, par session et par route (l'enregistrement automatique d'un billet ne fait pas une rafale).
    securite.emitThrottled?.(`verifier:${String(request.session.id).slice(0, 12)}:${request.routeOptions.url}`, 'authz_reauth_required', { request, emetteur: 'server/auth.js · vérification d’identité', detail: { depuis: v.depuis } });
    reply.header('cache-control', 'no-store');
    if (request.headers.accept?.includes('text/html')) return reply.redirect(href, 303);
    return reply.code(403).send({ error: t('Par sécurité, confirmez votre identité avant de modifier quoi que ce soit.'), verifier: href });
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!isAttempt(request) || allow(request.ip)) return;
    securite.emit('excess_rate_limit_exceeded', { request, composant: 'site · connexion', emetteur: 'server/auth.js · limite de connexion', detail: { limite: 'connexion', par_10_min: config.authRateLimit } });
    return renderError(reply.header('retry-after', '600'), 429, {
      title: 'Trop de tentatives', message: 'Trop de tentatives de connexion depuis votre réseau. Réessayez dans quelques minutes.',
    });
  });

  // Une session sans rôle (compte en attente, rôles retirés) n'ouvre rien : elle est oubliée, pour qu'on puisse se
  // connecter avec un autre compte. Une session qui a un rôle n'est jamais fermée par un simple GET (page tierce).
  const leaveIfNoRole = (request, reply) => {
    if (!request.session || hasRole(request.session.roles)) return false;
    sessions.destroy(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, cookieBase);
    request.session = null;
    return true;
  };

  app.get('/auth/login', async (request, reply) => {
    let next = safeNext(request.query.next);
    if (next.length > NEXT_MAX) next = '/admin';
    leaveIfNoRole(request, reply);
    if (request.session) return reply.redirect(next);
    if (!oidc.configured) {
      if (config.localAuthToken) return reply.redirect(`/auth/local?next=${encodeURIComponent(next)}`);
      return renderError(reply, 503, { title: 'Connexion indisponible', message: 'La connexion n’est pas encore configurée sur ce serveur.' });
    }
    let start;
    try {
      start = await oidc.start({ prompt: PROMPTS.has(request.query.prompt) ? request.query.prompt : undefined });
    } catch (err) {
      request.log.error(err, 'fournisseur OIDC injoignable');
      return renderError(reply, 502, { title: 'Connexion indisponible', message: 'Le service de connexion ne répond pas. Réessayez dans un instant.', retry: true });
    }
    const pending = Object.keys(request.cookies).filter(n => n.startsWith(`${prefix}oidc-`));
    if (pending.length >= TX_MAX) for (const n of pending) reply.clearCookie(n, cookieBase);
    reply.setCookie(txCookie(start.tx.state), JSON.stringify({ ...start.tx, next, at: Date.now() }), { ...cookieBase, signed: true, maxAge: TX_TTL });
    return reply.header('cache-control', 'no-store').redirect(start.url);
  });

  // Vérification d'identité (décision verifier_identite de la Vigie) : nouvelle connexion chez Zitadel du compte de la
  // session, prompt=login et max_age=300 (la clé d'accès est redemandée, auth_time exigé), comme la ré-authentification
  // de la console de la Vigie. Au retour, une session neuve (jamais l'ancienne prolongée : pas de fixation), seulement
  // pour le même compte et une authentification faite à l'instant.
  app.get('/auth/verifier', async (request, reply) => {
    let next = safeNext(request.query.next);
    if (next.length > NEXT_MAX) next = '/admin';
    if (!request.session) return reply.redirect(`/auth/login?next=${encodeURIComponent(next)}`);
    reply.header('cache-control', 'no-store');
    if (!oidc.configured) {
      if (config.localAuthToken) return reply.redirect(`/auth/local?verifier=1&next=${encodeURIComponent(next)}`);
      return renderError(reply, 503, { title: 'Connexion indisponible', message: 'La connexion n’est pas encore configurée sur ce serveur.' });
    }
    let start;
    try {
      start = await oidc.start({ reauth: true });
    } catch (err) {
      request.log.error(err, 'fournisseur OIDC injoignable');
      return renderError(reply, 502, { title: 'Connexion indisponible', message: 'Le service de connexion ne répond pas. Réessayez dans un instant.', retry: true, retryHref: verifyHref(next) });
    }
    const pending = Object.keys(request.cookies).filter(n => n.startsWith(`${prefix}oidc-`));
    if (pending.length >= TX_MAX) for (const n of pending) reply.clearCookie(n, cookieBase);
    reply.setCookie(txCookie(start.tx.state), JSON.stringify({ ...start.tx, next, reauth: request.session.sub, at: Date.now() }), { ...cookieBase, signed: true, maxAge: TX_TTL });
    return reply.redirect(start.url);
  });

  app.get('/auth/callback', async (request, reply) => {
    const { state } = request.query;
    const name = typeof state === 'string' && STATE_RE.test(state) ? txCookie(state) : null;
    const raw = name && request.cookies[name];
    if (name) reply.clearCookie(name, cookieBase);
    if (request.query.error) {
      request.log.info({ error: request.query.error }, 'connexion refusée par le fournisseur');
      securite.emit('authn_login_fail', { request, severity: 'bas', emetteur: 'server/auth.js · retour OIDC', detail: { raison: 'refus du fournisseur', code: String(request.query.error).slice(0, 60) } });
      return renderError(reply, 400, { title: 'Connexion annulée', message: 'La connexion n’a pas abouti.', retry: true });
    }

    const unsigned = raw ? request.unsignCookie(raw) : null;
    let tx = null;
    try { tx = unsigned?.valid ? JSON.parse(unsigned.value) : null; } catch { tx = null; }
    // Le navigateur n'est pas la borne de confiance : une copie du cookie signé ne doit pas survivre à ses dix minutes.
    // Le state et la date sont contrôlés avant tout appel réseau (openid-client revérifie le state).
    const now = Date.now();
    const expired = tx && (!Number.isSafeInteger(tx.at) || tx.at > now || now - tx.at >= TX_TTL * 1000);
    if (!tx || !sameToken(state, tx.state) || expired) {
      securite.emit('authn_login_fail', { request, emetteur: 'server/auth.js · retour OIDC', detail: { raison: expired ? 'transaction OIDC expirée ou date invalide' : raw ? 'state différent ou cookie de transaction altéré' : 'state sans transaction' } });
      return renderError(reply, 400, { title: 'Connexion expirée', message: 'Le lien de connexion a expiré ou n’est pas valide.', retry: true });
    }

    let result;
    try {
      result = await oidc.finish(request.query, tx);
    } catch (err) {
      request.log.warn(err, 'échec de la vérification OIDC');
      securite.emit('authn_login_fail', { request, emetteur: 'server/auth.js · retour OIDC', detail: { raison: 'réponse du fournisseur non vérifiée', erreur: String(err?.code || err?.name || 'Error').slice(0, 60) } });
      return renderError(reply, 400, { title: 'Connexion refusée', message: 'La réponse du service de connexion n’a pas pu être vérifiée.', retry: true });
    }

    const { claims } = result;
    // Vérification d'identité : le même compte que la session (et que celui qui l'a demandée), authentifié à l'instant.
    if (tx.reauth) {
      const same = claims.sub === tx.reauth && (!request.session || request.session.sub === tx.reauth);
      const fresh = Number.isFinite(result.authTime) && result.authTime >= (Number(tx.at) || Infinity) - 5000;
      if (!same || !fresh) {
        securite.emit('authn_login_fail', { request, sub: claims.sub, severity: same ? 'moyen' : 'haut', emetteur: 'server/auth.js · vérification d’identité',
          detail: { raison: same ? 'vérification d’identité : authentification ancienne' : 'vérification d’identité : autre compte', compte_attendu: same ? undefined : String(tx.reauth).slice(0, 200) } });
        audit.log({ sub: tx.reauth, name: request.session?.name || '', action: same ? 'vérification d’identité refusée (authentification ancienne)' : 'vérification d’identité refusée (autre compte)' });
        return renderError(reply, 403, same
          ? { title: 'Identité non confirmée', message: 'Le service de connexion n’a pas redemandé votre identité. Réessayez.', retry: true, retryHref: verifyHref(safeNext(tx.next)) }
          : { title: 'Identité non confirmée', message: 'Ce n’est pas le compte de cette session : confirmez l’identité avec le même compte.', retry: true, retryHref: verifyHref(safeNext(tx.next)) });
      }
    }
    // L'adresse n'est retenue que si l'IdP l'a vérifiée : sinon, n'importe qui pourrait se présenter sous celle d'un autre
    // (page « Comptes et rôles », e-mails de l'admin). Certains IdP envoient la chaîne « true ».
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    const email = verified && typeof claims.email === 'string' ? claims.email : '';
    const who = { sub: claims.sub, name: claims.name || claims.preferred_username || email || '', email };
    if (result.admin && !result.listed && !idpRoleTrusted) request.log.warn({ sub: claims.sub }, 'rôle admin de l’IdP ignoré : OIDC_ORG_ID non défini');
    // Compte créé à la première connexion : administrateur si l'IdP transporte le rôle « admin », sinon en attente
    // qu'un administrateur lui donne un rôle. Ensuite, seuls comptent les rôles réglés dans l'admin.
    const account = accounts.login({ ...who, idpAdmin: (idpRoleTrusted && result.admin) || Boolean(result.listed) });
    if (account.rescued) audit.log({ ...who, action: 'compte rétabli par ADMIN_SUBS' });
    // Gel par la Vigie : comme un compte désactivé. Admin verrouillée : seuls les comptes et adresses listés.
    if (app.decisions?.frozen(who.sub) || app.decisions?.lockAllows(who.sub, request.ip) === false) {
      securite.emit('authz_blocked', { request, sub: who.sub, emetteur: 'server/auth.js · retour OIDC', detail: { raison: app.decisions.frozen(who.sub) ? 'compte gelé' : 'administration verrouillée' } });
      return renderError(reply, 403, { title: 'Accès refusé', message: 'Ce compte ne peut pas se connecter pour le moment.', switchAccount: true });
    }
    if (account.status === 'desactive') {
      audit.log({ ...who, action: 'connexion refusée (compte désactivé)' });
      securite.emit('authn_login_disabled', { request, sub: who.sub, emetteur: 'server/auth.js · retour OIDC' });
      return renderError(reply, 403, { title: 'Accès refusé', message: 'Ce compte a été désactivé.', switchAccount: true });
    }
    if (!hasRole(accounts.rolesOf(who.sub))) {
      // Au journal : une ligne par jour au plus pour un compte en attente (pas une par essai, qui noierait le reste).
      const last = lastPending.get(who.sub);
      if (!last || Date.now() - last > 864e5) audit.log({ ...who, action: 'connexion en attente d’un rôle' });
      request.log.warn({ sub: claims.sub }, 'connexion sans rôle : compte en attente');
      securite.emit('authn_login_pending', { request, sub: who.sub, emetteur: 'server/auth.js · retour OIDC' });
      return renderError(reply, 403, { ...pendingPage, switchAccount: true, sub: who.sub });
    }

    // Vérification d'identité : l'authentification a eu lieu après le clic (contrôlé plus haut, à 5 s près) ; l'heure du clic
    // sert de plancher, pour qu'une horloge de Zitadel un peu en retard ne laisse pas la session « d'avant » la décision.
    openSession(request, reply, { ...who, idToken: result.idToken, authTime: tx.reauth ? Math.max(result.authTime, Number(tx.at)) : result.authTime });
    audit.log({ ...who, action: tx.reauth ? 'identité confirmée' : 'connexion' });
    if (tx.reauth) securite.emit('authn_reauth_success', { request, sub: who.sub, emetteur: 'server/auth.js · vérification d’identité', detail: { methode: 'oidc', amr: Array.isArray(claims.amr) ? claims.amr.slice(0, 10).map(String) : undefined, verification: Boolean(app.decisions?.verification(who.sub)) } });
    securite.emit('authn_login_success', { request, sub: who.sub, emetteur: 'server/auth.js · retour OIDC',
      detail: { methode: 'oidc', amr: Array.isArray(claims.amr) ? claims.amr.slice(0, 10).map(String) : undefined, administrateur_idp: Boolean(result.admin), appareil: fpOf(request.headers) } });
    return reply.header('cache-control', 'no-store').redirect(safeNext(tx.next));
  });

  // Nouvelle session à chaque connexion ; l'ancienne éventuelle est détruite. Elle ne porte pas de rôles : ceux du
  // compte sont relus à chaque requête.
  // authTime : heure de l'authentification chez l'IdP (auth_time), gardée avec la session (vérification d'identité).
  function openSession(request, reply, user) {
    sessions.destroy(request.cookies[SESSION_COOKIE]);
    const token = sessions.create({ ...user, ctx: securite.enabled ? ctxOf(request) : null });
    reply.setCookie(SESSION_COOKIE, token, { ...cookieBase, maxAge: IDLE_TTL / 1000 });
    securite.emit('session_created', { request, sub: user.sub, emetteur: 'server/auth.js · session', reference: `session:${hashToken(token).slice(0, 12)}`, detail: securite.enabled ? { appareil: fpOf(request.headers) } : undefined });
    request.log.info({ sub: user.sub }, 'connexion admin');
  }

  // Connexion locale de TEST : sans IdP, avec un jeton partagé (LOCAL_AUTH_TOKEN).
  // loadConfig la refuse dès que le site est en ligne (HTTPS ou production).
  if (config.localAuthToken) {
    app.log.warn('authentification locale de test active (LOCAL_AUTH_TOKEN) : jamais en production');
    const authors = app.db.prepare('SELECT a.id, a.slug, a.name, c.sub AS linked FROM authors a LEFT JOIN accounts c ON c.author_id = a.id ORDER BY a.id');
    const renderLocal = (reply, code, data) => reply.code(code).header('cache-control', 'no-store').render('local-login', {
      siteName: app.siteName(), pageTitle: `Connexion de test · ${app.siteName()}`, description: '', authors: authors.all(), ...data,
    });

    app.get('/auth/local', async (request, reply) => {
      const next = safeNext(request.query.next);
      leaveIfNoRole(request, reply);
      // Vérification d'identité (décision verifier_identite) : le formulaire, même avec une session ouverte.
      if (request.session && request.query.verifier === '1') return renderLocal(reply, 200, { next, verifier: true });
      if (request.session) return reply.redirect(next);
      return renderLocal(reply, 200, { next });
    });

    app.post('/auth/local', async (request, reply) => {
      const { token, author, next } = request.body || {};
      const verifier = request.body?.verifier === '1';
      const who = authors.all().find(a => a.slug === author);
      if (!sameToken(token, config.localAuthToken) || !who) {
        securite.emit('authn_login_fail', { request, emetteur: 'server/auth.js · connexion de test', detail: { raison: 'jeton ou compte de test invalide' } });
        return renderLocal(reply, 401, { next: safeNext(next), error: 'Jeton ou compte invalide.' });
      }
      // Le compte est celui lié au photographe s'il existe (pour tester le lien compte ↔ photographe), sinon
      // « local:<photographe> », administrateur à sa création. Ses rôles ne changent ensuite que dans « Comptes et
      // rôles » (garde-fous, journal) ; désactivé ou sans rôle, comme en OIDC, aucune session.
      const sub = who.linked || `local:${who.slug}`;
      // Vérification d'identité : seulement le compte de la session ouverte.
      if (verifier && (!request.session || request.session.sub !== sub)) {
        securite.emit('authn_login_fail', { request, sub, severity: 'haut', emetteur: 'server/auth.js · vérification d’identité', detail: { raison: 'vérification d’identité : autre compte', compte_attendu: request.session?.sub } });
        return renderLocal(reply, 403, { next: safeNext(next), verifier: true, error: 'Ce n’est pas le compte de cette session.' });
      }
      const account = accounts.ensureLocal({ sub, name: `${who.name} (test)`, authorId: who.id, roles: ['admin'] });
      const vigieDenied = app.decisions?.frozen(sub) ? 'compte gelé' : app.decisions?.lockAllows(sub, request.ip) === false ? 'administration verrouillée' : null;
      if (vigieDenied) securite.emit('authz_blocked', { request, sub, emetteur: 'server/auth.js · connexion de test', detail: { raison: vigieDenied } });
      if (account.status === 'desactive' || !hasRole(accounts.rolesOf(sub)) || vigieDenied) {
        return renderLocal(reply, 403, { next: safeNext(next), error: 'Ce compte est désactivé ou n’a pas de rôle.' });
      }
      openSession(request, reply, { sub, name: `${who.name} (test)`, authTime: Date.now() });
      audit.log({ sub, name: `${who.name} (test)`, action: verifier ? 'identité confirmée (test)' : 'connexion (test)' });
      securite.emit('authn_login_success', { request, sub, emetteur: 'server/auth.js · connexion de test', detail: { methode: 'test', appareil: fpOf(request.headers) } });
      if (verifier) securite.emit('authn_reauth_success', { request, sub, emetteur: 'server/auth.js · connexion de test', detail: { methode: 'test', verification: Boolean(app.decisions?.verification(sub)) } });
      return reply.header('cache-control', 'no-store').redirect(safeNext(next), 303);
    });
  }

  // POST + CSRF : une page tierce ne peut pas déconnecter l'utilisateur.
  app.post('/auth/logout', async (request, reply) => {
    if (!request.session) return reply.redirect('/', 303);
    if (!csrfOk(request)) {
      securite.emit('authz_csrf_fail', { request, emetteur: 'server/auth.js · déconnexion', detail: { jeton: request.body?._csrf ? 'faux' : 'absent' } });
      return csrfPage(request, reply);
    }
    sessions.destroy(request.cookies[SESSION_COOKIE]);
    securite.emit('session_destroyed', { request, emetteur: 'server/auth.js · déconnexion' });
    reply.clearCookie(SESSION_COOKIE, cookieBase);
    let target = '/';
    // Session OIDC : déconnexion aussi côté IdP. Session locale de test : rien à faire ailleurs.
    if (oidc.configured && request.session.id_token) {
      try {
        target = (await oidc.logoutUrl(request.session.id_token)) || '/';
      } catch (err) {
        request.log.warn(err, 'déconnexion côté fournisseur impossible');
      }
    }
    return reply.redirect(target, 303);
  });
}
