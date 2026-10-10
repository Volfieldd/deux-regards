import crypto from 'node:crypto';
import { createOidc } from './oidc.js';
import { createSessionStore, IDLE_TTL } from './sessions.js';
import { createRateLimiter } from './ratelimit.js';

const TX_TTL = 10 * 60; // secondes pour revenir de l'IdP
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
  // Préfixe __Host- : cookie lié à l'hôte exact, Secure, Path=/ (impossible à poser depuis un sous-domaine).
  const prefix = config.secureCookies ? '__Host-' : '';
  const SESSION_COOKIE = `${prefix}session`;
  // Un cookie de transaction par state : deux connexions dans deux onglets ne s'écrasent pas.
  const txCookie = state => `${prefix}oidc-${state}`;
  const cookieBase = { path: '/', httpOnly: true, secure: config.secureCookies, sameSite: 'lax' };

  // Tentatives de connexion par IP sur 10 minutes (30 par défaut) : large pour un humain, freine les abus.
  const allow = createRateLimiter({ limit: config.authRateLimit, windowMs: 10 * 60 * 1000 });
  // Seules les vraies tentatives comptent (retour de l'IdP, envoi du formulaire local) : la simple
  // redirection /auth/login ne permet pas de bloquer la connexion d'un tiers derrière la même adresse.
  const isAttempt = request => request.routeOptions.url === '/auth/callback'
    || (request.routeOptions.url === '/auth/local' && request.method === 'POST');

  if (config.oidc.projectId && !config.oidc.orgId) {
    app.log.warn('OIDC_ORG_ID non défini : un rôle admin donné dans une autre organisation Zitadel serait accepté');
  }

  app.decorate('oidc', oidc);
  app.decorateRequest('session', null);

  app.addHook('onRequest', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    request.session = sessions.load(token);
    if (!request.session) reply.clearCookie(SESSION_COOKIE, cookieBase);
  });

  const renderError = (reply, code, data) => reply.code(code).header('cache-control', 'no-store').render('auth-error', {
    siteName: app.siteName(), pageTitle: `${data.title} · ${app.siteName()}`, description: '', ...data,
  });

  // preHandler des pages d'admin : sans session, retour à la connexion (GET) ou 401.
  app.decorate('requireAdmin', async function (request, reply) {
    reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex');
    if (!request.session) {
      if (request.method === 'GET' || request.method === 'HEAD') {
        return reply.redirect(`/auth/login?next=${encodeURIComponent(request.url)}`);
      }
      return reply.code(401).send({ error: 'Session expirée, reconnectez-vous.' });
    }
    if (!request.session.roles.includes('admin')) {
      return renderError(reply, 403, { title: 'Accès refusé', message: 'Ce compte n’a pas accès à l’administration.' });
    }
    // Expiration glissante : le cookie suit l'échéance de la session.
    const maxAge = Math.floor((request.session.expires_at - Date.now()) / 1000);
    reply.setCookie(SESSION_COOKIE, request.cookies[SESSION_COOKIE], { ...cookieBase, maxAge });
  });

  const csrfOk = request => Boolean(request.session) && sameToken(request.body?._csrf ?? request.headers['x-csrf-token'], request.session.csrf);
  const csrfPage = reply => renderError(reply, 403, {
    title: 'Formulaire expiré', message: 'Ce formulaire n’est plus valide. Rechargez la page et recommencez.',
  });

  // preHandler des routes d'écriture : jeton synchronisé (champ _csrf ou en-tête x-csrf-token).
  // Page d'erreur pour un formulaire, JSON pour un appel fetch.
  app.decorate('verifyCsrf', async function (request, reply) {
    if (csrfOk(request)) return;
    if (request.headers.accept?.includes('text/html')) return csrfPage(reply);
    return reply.code(403).send({ error: 'Jeton CSRF invalide.' });
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!isAttempt(request) || allow(request.ip)) return;
    return renderError(reply.header('retry-after', '600'), 429, {
      title: 'Trop de tentatives', message: 'Trop de tentatives de connexion depuis votre réseau. Réessayez dans quelques minutes.',
    });
  });

  app.get('/auth/login', async (request, reply) => {
    const next = safeNext(request.query.next);
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
    reply.setCookie(txCookie(start.tx.state), JSON.stringify({ ...start.tx, next }), { ...cookieBase, signed: true, maxAge: TX_TTL });
    return reply.header('cache-control', 'no-store').redirect(start.url);
  });

  app.get('/auth/callback', async (request, reply) => {
    const { state } = request.query;
    const name = typeof state === 'string' && STATE_RE.test(state) ? txCookie(state) : null;
    const raw = name && request.cookies[name];
    if (name) reply.clearCookie(name, cookieBase);
    if (request.query.error) {
      request.log.info({ error: request.query.error }, 'connexion refusée par le fournisseur');
      return renderError(reply, 400, { title: 'Connexion annulée', message: 'La connexion n’a pas abouti.', retry: true });
    }

    const unsigned = raw ? request.unsignCookie(raw) : null;
    let tx = null;
    try { tx = unsigned?.valid ? JSON.parse(unsigned.value) : null; } catch { tx = null; }
    // Vérification explicite du state avant tout appel réseau (openid-client la refait).
    if (!tx || !sameToken(state, tx.state)) {
      return renderError(reply, 400, { title: 'Connexion expirée', message: 'Le lien de connexion a expiré ou n’est pas valide.', retry: true });
    }

    let result;
    try {
      result = await oidc.finish(request.query, tx);
    } catch (err) {
      request.log.warn(err, 'échec de la vérification OIDC');
      return renderError(reply, 400, { title: 'Connexion refusée', message: 'La réponse du service de connexion n’a pas pu être vérifiée.', retry: true });
    }

    const { claims } = result;
    if (!result.admin) {
      request.log.warn({ sub: claims.sub }, 'connexion sans le rôle admin');
      return renderError(reply, 403, {
        title: 'Accès refusé', message: 'Ce compte n’a pas accès à l’administration.', switchAccount: true,
      });
    }

    openSession(request, reply, {
      sub: claims.sub,
      name: claims.name || claims.preferred_username || claims.email || '',
      email: claims.email || '',
      roles: [...new Set([...result.roles, 'admin'])],
      idToken: result.idToken,
    });
    return reply.header('cache-control', 'no-store').redirect(safeNext(tx.next));
  });

  // Nouvelle session à chaque connexion ; l'ancienne éventuelle est détruite.
  function openSession(request, reply, user) {
    sessions.destroy(request.cookies[SESSION_COOKIE]);
    reply.setCookie(SESSION_COOKIE, sessions.create(user), { ...cookieBase, maxAge: IDLE_TTL / 1000 });
    request.log.info({ sub: user.sub }, 'connexion admin');
  }

  // Connexion locale de TEST : sans IdP, avec un jeton partagé (LOCAL_AUTH_TOKEN).
  // loadConfig la refuse dès que le site est en ligne (HTTPS ou production).
  if (config.localAuthToken) {
    app.log.warn('authentification locale de test active (LOCAL_AUTH_TOKEN) : jamais en production');
    const authors = app.db.prepare('SELECT slug, name, oidc_sub FROM authors ORDER BY id');
    const renderLocal = (reply, code, data) => reply.code(code).header('cache-control', 'no-store').render('local-login', {
      siteName: app.siteName(), pageTitle: `Connexion de test · ${app.siteName()}`, description: '', authors: authors.all(), ...data,
    });

    app.get('/auth/local', async (request, reply) => {
      const next = safeNext(request.query.next);
      if (request.session) return reply.redirect(next);
      return renderLocal(reply, 200, { next });
    });

    app.post('/auth/local', async (request, reply) => {
      const { token, author, next } = request.body || {};
      const who = authors.all().find(a => a.slug === author);
      if (!sameToken(token, config.localAuthToken) || !who) {
        return renderLocal(reply, 401, { next: safeNext(next), error: 'Jeton ou compte invalide.' });
      }
      // Le sub est celui lié à l'auteur s'il existe, pour tester le lien compte ↔ auteur.
      openSession(request, reply, { sub: who.oidc_sub || `local:${who.slug}`, name: `${who.name} (test)`, roles: ['admin'] });
      return reply.header('cache-control', 'no-store').redirect(safeNext(next), 303);
    });
  }

  // POST + CSRF : une page tierce ne peut pas déconnecter l'utilisateur.
  app.post('/auth/logout', async (request, reply) => {
    if (!request.session) return reply.redirect('/', 303);
    if (!csrfOk(request)) return csrfPage(reply);
    sessions.destroy(request.cookies[SESSION_COOKIE]);
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
