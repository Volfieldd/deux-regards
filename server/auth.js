import crypto from 'node:crypto';
import { registerPermissions, hasRole } from './permissions.js';
import { createOidc } from './oidc.js';
import { createSessionStore, IDLE_TTL } from './sessions.js';
import { createRateLimiter } from './ratelimit.js';

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

  // Sans OIDC_ORG_ID, un rôle « admin » donné dans une autre organisation Zitadel (projet partagé) serait accepté :
  // en ligne, le rôle de l'IdP ne crée alors aucun administrateur (ADMIN_SUBS reste la voie d'amorce).
  const idpRoleTrusted = !(config.oidc.projectId && !config.oidc.orgId && config.deployed);
  if (config.oidc.projectId && !config.oidc.orgId) {
    app.log.warn(idpRoleTrusted ? 'OIDC_ORG_ID non défini : un rôle admin donné dans une autre organisation Zitadel serait accepté'
      : 'OIDC_ORG_ID non défini : le rôle admin de Zitadel est ignoré (amorce par ADMIN_SUBS seulement) ; renseignez OIDC_ORG_ID');
  }

  app.decorate('oidc', oidc);
  app.decorateRequest('session', null);
  // Comptes et journal (server/accounts.js, décorés par buildApp) : les rôles d'une session sont ceux de son compte,
  // relus à chaque requête.
  const { accounts, audit } = app;
  const lastPending = app.db.prepare("SELECT MAX(at) FROM audit_log WHERE sub = ? AND action = 'connexion en attente d’un rôle'").pluck();

  app.addHook('onRequest', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    request.session = sessions.load(token);
    if (!request.session) { reply.clearCookie(SESSION_COOKIE, cookieBase); return; }
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
    if (request.headers.accept?.includes('text/html')) return csrfPage(request, reply);
    return reply.code(403).send({ error: (request.t || (x => x))('Jeton CSRF invalide.') });
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!isAttempt(request) || allow(request.ip)) return;
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
    // L'adresse n'est retenue que si l'IdP l'a vérifiée : sinon, n'importe qui pourrait se présenter sous celle d'un autre
    // (page « Comptes et rôles », e-mails de l'admin). Certains IdP envoient la chaîne « true ».
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    const email = verified && typeof claims.email === 'string' ? claims.email : '';
    const who = { sub: claims.sub, name: claims.name || claims.preferred_username || email || '', email };
    if (result.admin && !idpRoleTrusted) request.log.warn({ sub: claims.sub }, 'rôle admin de l’IdP ignoré : OIDC_ORG_ID non défini');
    // Compte créé à la première connexion : administrateur si l'IdP transporte le rôle « admin », sinon en attente
    // qu'un administrateur lui donne un rôle. Ensuite, seuls comptent les rôles réglés dans l'admin.
    const account = accounts.login({ ...who, idpAdmin: idpRoleTrusted && result.admin });
    if (account.rescued) audit.log({ ...who, action: 'compte rétabli par ADMIN_SUBS' });
    if (account.status === 'desactive') {
      audit.log({ ...who, action: 'connexion refusée (compte désactivé)' });
      return renderError(reply, 403, { title: 'Accès refusé', message: 'Ce compte a été désactivé.', switchAccount: true });
    }
    if (!hasRole(accounts.rolesOf(who.sub))) {
      // Au journal : une ligne par jour au plus pour un compte en attente (pas une par essai, qui noierait le reste).
      const last = lastPending.get(who.sub);
      if (!last || Date.now() - last > 864e5) audit.log({ ...who, action: 'connexion en attente d’un rôle' });
      request.log.warn({ sub: claims.sub }, 'connexion sans rôle : compte en attente');
      return renderError(reply, 403, { ...pendingPage, switchAccount: true, sub: who.sub });
    }

    openSession(request, reply, { ...who, idToken: result.idToken });
    audit.log({ ...who, action: 'connexion' });
    return reply.header('cache-control', 'no-store').redirect(safeNext(tx.next));
  });

  // Nouvelle session à chaque connexion ; l'ancienne éventuelle est détruite. Elle ne porte pas de rôles : ceux du
  // compte sont relus à chaque requête.
  function openSession(request, reply, user) {
    sessions.destroy(request.cookies[SESSION_COOKIE]);
    reply.setCookie(SESSION_COOKIE, sessions.create(user), { ...cookieBase, maxAge: IDLE_TTL / 1000 });
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
      if (request.session) return reply.redirect(next);
      return renderLocal(reply, 200, { next });
    });

    app.post('/auth/local', async (request, reply) => {
      const { token, author, next } = request.body || {};
      const who = authors.all().find(a => a.slug === author);
      if (!sameToken(token, config.localAuthToken) || !who) {
        return renderLocal(reply, 401, { next: safeNext(next), error: 'Jeton ou compte invalide.' });
      }
      // Le compte est celui lié au photographe s'il existe (pour tester le lien compte ↔ photographe), sinon
      // « local:<photographe> », administrateur à sa création. Ses rôles ne changent ensuite que dans « Comptes et
      // rôles » (garde-fous, journal) ; désactivé ou sans rôle, comme en OIDC, aucune session.
      const sub = who.linked || `local:${who.slug}`;
      const account = accounts.ensureLocal({ sub, name: `${who.name} (test)`, authorId: who.id, roles: ['admin'] });
      if (account.status === 'desactive' || !hasRole(accounts.rolesOf(sub))) {
        return renderLocal(reply, 403, { next: safeNext(next), error: 'Ce compte est désactivé ou n’a pas de rôle.' });
      }
      openSession(request, reply, { sub, name: `${who.name} (test)` });
      audit.log({ sub, name: `${who.name} (test)`, action: 'connexion (test)' });
      return reply.header('cache-control', 'no-store').redirect(safeNext(next), 303);
    });
  }

  // POST + CSRF : une page tierce ne peut pas déconnecter l'utilisateur.
  app.post('/auth/logout', async (request, reply) => {
    if (!request.session) return reply.redirect('/', 303);
    if (!csrfOk(request)) return csrfPage(request, reply);
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
