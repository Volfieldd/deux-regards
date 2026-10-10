import crypto from 'node:crypto';
import { createOidc } from './oidc.js';
import { createSessionStore, IDLE_TTL } from './sessions.js';

const TX_TTL = 10 * 60; // secondes pour revenir de l'IdP
const PROMPTS = new Set(['login', 'select_account']);

// Chemin local uniquement : refuse les URL absolues et « //hôte » (redirection ouverte).
export function safeNext(value, fallback = '/admin') {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : fallback;
}

function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Authentification OIDC (Zitadel), sessions côté serveur et CSRF.
// Expose request.session, app.requireAdmin et app.verifyCsrf.
export async function setupAuth(app, { oidc = createOidc(app.config) } = {}) {
  const { config } = app;
  const sessions = createSessionStore(app.db);
  // Préfixe __Host- : cookie lié à l'hôte exact, Secure, Path=/ (impossible à poser depuis un sous-domaine).
  const prefix = config.secureCookies ? '__Host-' : '';
  const SESSION_COOKIE = `${prefix}session`;
  const TX_COOKIE = `${prefix}oidc`;
  const cookieBase = { path: '/', httpOnly: true, secure: config.secureCookies, sameSite: 'lax' };

  app.decorate('oidc', oidc);
  app.decorateRequest('session', null);

  app.addHook('onRequest', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    request.session = sessions.load(token);
    if (!request.session) reply.clearCookie(SESSION_COOKIE, cookieBase);
  });

  const renderError = (reply, code, data) => reply.code(code).header('cache-control', 'no-store').render('auth-error', {
    siteName: config.siteName, pageTitle: `${data.title} · ${config.siteName}`, description: '', ...data,
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

  // preHandler des routes d'écriture : jeton synchronisé (champ _csrf ou en-tête x-csrf-token).
  app.decorate('verifyCsrf', async function (request, reply) {
    const sent = request.body?._csrf ?? request.headers['x-csrf-token'];
    if (!request.session || !sameToken(sent, request.session.csrf)) {
      return reply.code(403).send({ error: 'Jeton CSRF invalide.' });
    }
  });

  app.get('/auth/login', async (request, reply) => {
    const next = safeNext(request.query.next);
    if (request.session) return reply.redirect(next);
    if (!oidc.configured) {
      return renderError(reply, 503, { title: 'Connexion indisponible', message: 'La connexion n’est pas encore configurée sur ce serveur.' });
    }
    let start;
    try {
      start = await oidc.start({ prompt: PROMPTS.has(request.query.prompt) ? request.query.prompt : undefined });
    } catch (err) {
      request.log.error(err, 'fournisseur OIDC injoignable');
      return renderError(reply, 502, { title: 'Connexion indisponible', message: 'Le service de connexion ne répond pas. Réessayez dans un instant.', retry: true });
    }
    reply.setCookie(TX_COOKIE, JSON.stringify({ ...start.tx, next }), { ...cookieBase, signed: true, maxAge: TX_TTL });
    return reply.header('cache-control', 'no-store').redirect(start.url);
  });

  app.get('/auth/callback', async (request, reply) => {
    const raw = request.cookies[TX_COOKIE];
    reply.clearCookie(TX_COOKIE, cookieBase);
    if (request.query.error) {
      request.log.info({ error: request.query.error }, 'connexion refusée par le fournisseur');
      return renderError(reply, 400, { title: 'Connexion annulée', message: 'La connexion n’a pas abouti.', retry: true });
    }

    const unsigned = raw ? request.unsignCookie(raw) : null;
    let tx = null;
    try { tx = unsigned?.valid ? JSON.parse(unsigned.value) : null; } catch { tx = null; }
    // Vérification explicite du state avant tout appel réseau (openid-client la refait).
    if (!tx || !sameToken(request.query.state, tx.state)) {
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

    // Nouvelle session à chaque connexion ; l'ancienne éventuelle est détruite.
    sessions.destroy(request.cookies[SESSION_COOKIE]);
    const token = sessions.create({
      sub: claims.sub,
      name: claims.name || claims.preferred_username || claims.email || '',
      email: claims.email || '',
      roles: [...new Set([...result.roles, 'admin'])],
      idToken: result.idToken,
    });
    reply.setCookie(SESSION_COOKIE, token, { ...cookieBase, maxAge: IDLE_TTL / 1000 });
    request.log.info({ sub: claims.sub }, 'connexion admin');
    return reply.header('cache-control', 'no-store').redirect(safeNext(tx.next));
  });

  // POST + CSRF : une page tierce ne peut pas déconnecter l'utilisateur.
  app.post('/auth/logout', async (request, reply) => {
    if (!request.session) return reply.redirect('/', 303);
    await app.verifyCsrf(request, reply);
    if (reply.sent) return reply;
    sessions.destroy(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, cookieBase);
    let target = '/';
    try {
      target = (await oidc.logoutUrl(request.session.id_token)) || '/';
    } catch (err) {
      request.log.warn(err, 'déconnexion côté fournisseur impossible');
    }
    return reply.redirect(target, 303);
  });
}
