import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import fstatic from '@fastify/static';
import { Eta } from 'eta';
import { clean } from '../util.js';
import { createAccessVerifier } from './access.js';
import { createConsoleOidc } from './oidc.js';
import { createRights, createCeilingReader, ceilingOf, can, ACTIONS, LABELS } from './droits.js';
import { createSessions, IDLE, ABSOLUTE, CEILING_EVERY, CEILING_GRACE, FRESH } from './sessions.js';
import { overview, compteurs } from './vue-ensemble.js';
import { ECRANS } from './ecrans/index.js';

// Console de la Vigie (annexe architecture § 5), sur son propre port (4200, adresse fixe du réseau du tunnel). Trois
// verrous, dans cet ordre, à chaque requête :
//   1. jeton Cloudflare Access (Cf-Access-Jwt-Assertion) vérifié : sans lui, 403 sobre, avant toute autre chose
//      (fichiers statiques compris) ;
//   2. session ouverte par la connexion Zitadel propre à la console (second facteur exigé : amr « mfa ») ;
//   3. droit effectif (deux clés, vigie/console/droits.js), le plafond relu chez Zitadel toutes les 5 minutes et avant
//      toute action.
// Pages rendues sur le serveur (Eta), CSP stricte sans script ni style en ligne, rien en cache, aucun Referer.

const SESSION = '__Host-vigie';
// Effacement d'un cookie __Host- : Secure obligatoire, sinon le navigateur ignore l'en-tête (audit D3-A5).
const EFFACE = { path: '/', secure: true, httpOnly: true, sameSite: 'lax' };
const TX = '__Host-vigie-tx';
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version; } catch { return '0'; } })();

// Chemin local de retour après connexion : jamais une autre origine ; caractère de contrôle ou barre oblique inverse : accueil.
export function safeRetour(v) {
  if (typeof v !== 'string' || /[\u0000-\u001f\u007f\\]/.test(v)) return '/';
  return /^\/(?!\/)[^\s]{0,500}$/.test(v) && !v.startsWith('/auth/') ? v : '/';
}

export function createConsole({ config, store, engine, switches, decisions, zitadel, logger = true, fetchImpl = fetch, now = Date.now,
  access: accessImpl, oidc: oidcImpl, readCeiling: readCeilingImpl, notifications = {}, edge = null, siteBackupDir = null, verifyChain = null }) {
  const { db } = store;
  const access = accessImpl || createAccessVerifier({ ...config.access, fetchImpl, now });
  const oidc = oidcImpl || createConsoleOidc(config);
  const readCeiling = readCeilingImpl || createCeilingReader({ api: zitadel.api, projectId: config.projectId, orgId: config.orgId });
  const rights = createRights({ db, store, adminSubs: config.adminSubs, mode: config.roles, now });
  const sessions = createSessions({ db, now });
  const eta = new Eta({ views: fileURLToPath(new URL('./views/', import.meta.url)), autoEscape: true, cache: true });
  const consoleOrigin = new URL(config.url).origin;

  // Aucune ligne par requête : le retour de Zitadel porte le code et le state dans son adresse.
  const app = Fastify({ logger, logController: new LogController({ disableRequestLogging: true }), bodyLimit: 64 * 1024, trustProxy: false, return503OnClosing: true });
  const log = app.log;
  app.register(cookie);
  app.register(formbody);
  app.register(fstatic, { root: fileURLToPath(new URL('./public/', import.meta.url)), prefix: '/static/', decorateReply: false, index: false, dotfiles: 'deny',
    cacheControl: false, etag: true, lastModified: false });

  const csp = ["default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'", "connect-src 'self'",
    `form-action 'self' ${oidc.origin}`, "frame-ancestors 'none'", "base-uri 'none'", "object-src 'none'"].join('; ');
  app.addHook('onSend', async (request, reply) => {
    reply.headers({
      'content-security-policy': csp,
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'x-robots-tag': 'noindex, nofollow',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
      'strict-transport-security': 'max-age=31536000',
      // Feuille, script et polices : gardés dans le navigateur seul (jamais dans un cache partagé) ; le reste jamais.
      'cache-control': request.url.startsWith('/static/') && reply.statusCode === 200 ? 'private, max-age=86400' : 'no-store',
    });
  });

  const render = (reply, view, it, code = 200) => reply.code(code).type('text/html; charset=utf-8').send(eta.render(view, { titre: 'Vigie', v: VERSION, ...it }));
  const page = (reply, cas, extra = {}, code = 200) => render(reply, 'acces', { cas, titre: 'Vigie', ...extra }, code);

  // Adresse du visiteur : celle que Cloudflare transmet, seulement une fois le jeton Access vérifié (sinon : la socket).
  const clientIp = (req, verified) => {
    const h = req.headers['cf-connecting-ip'];
    return verified && typeof h === 'string' && net.isIP(h) ? h : req.socket.remoteAddress || null;
  };

  // Connexion refusée (DS30). Jeton Access absent ou faux : une ligne par adresse et par 10 minutes, 30 par heure au plus
  // (un balayage du réseau interne ne noie pas le journal).
  const accessSeen = new Map();
  let accessHour = { h: 0, n: 0 };
  function refuse(req, raison, { sub, detail } = {}) {
    const t = now();
    const verified = raison !== 'access';
    const ip = clientIp(req, verified);
    if (!verified) {
      const h = Math.floor(t / 3600e3);
      if (accessHour.h !== h) accessHour = { h, n: 0 };
      if ((accessSeen.get(ip) ?? -Infinity) > t - 10 * 60e3 || accessHour.n >= 30) return;
      accessSeen.set(ip, t);
      accessHour.n += 1;
      if (accessSeen.size > 1000) accessSeen.clear();
    }
    try {
      store.own('vigie_console_refus', { emetteur: 'vigie/console', sub: clean(sub, 200) || undefined, ip: ip || undefined,
        detail: { raison, route: clean(req.routeOptions?.url || req.url.split('?')[0], 120), access: req.access?.email || undefined, ...detail } });
    } catch (err) { log.error({ err: err.message }, 'Vigie : console : refus non noté'); }
  }

  // 1. Cloudflare Access, sur toutes les requêtes.
  app.addHook('onRequest', async (req, reply) => {
    try {
      req.access = await access.verify(req.headers['cf-access-jwt-assertion']);
    } catch (err) {
      refuse(req, 'access', { detail: { erreur: clean(err.message, 120) } });
      return page(reply, 'interdit', { raison: 'access' }, 403);
    }
    // Adresse du visiteur : celle que transmet Cloudflare, ou aucune (jamais celle du conteneur du tunnel, qui n'a de
    // sens ni dans un verrouillage ni dans une confirmation de sa propre adresse).
    const h = req.headers['cf-connecting-ip'];
    req.ip2 = typeof h === 'string' && net.isIP(h) ? h : null;
  });

  // Relecture du plafond chez Zitadel (une à la fois par compte).
  // Échec récent (moins d'une minute) : on ne retente pas à chaque page (Zitadel lent : jusqu'à 2 × 15 s d'attente
  // par page, audit D3-D6) ; la lecture continue sur le dernier plafond lu, dans la limite de la grâce.
  const inflight = new Map();
  const echec = new Map();                       // sub → heure du dernier échec de relecture
  const echecRecent = sub => now() - (echec.get(sub) ?? -Infinity) < 60e3;
  function recheck(s) {
    if (!inflight.has(s.sub)) {
      inflight.set(s.sub, (async () => {
        let ceiling;
        try { ceiling = await readCeiling(s.sub); } catch (err) {
          if (echec.size > 1000) echec.clear();
          echec.set(s.sub, now());
          throw err;
        }
        echec.delete(s.sub);
        rights.observe(s.sub, ceiling);
        if (!ceiling) sessions.closeSub(s.sub, 'plafond_retire');
        else db.prepare('UPDATE console_sessions SET plafond = ?, plafond_lu = ? WHERE sub = ? AND ferme_a IS NULL').run(ceiling, now(), s.sub);
        return ceiling;
      })().finally(() => inflight.delete(s.sub)));
    }
    return inflight.get(s.sub);
  }

  const isRefresh = req => req.headers['x-vigie-rafraichir'] === '1';
  const toLogin = (req, reply) => {
    if (req.method === 'GET' && !isRefresh(req)) return reply.redirect(`/auth/login?retour=${encodeURIComponent(safeRetour(req.url))}`, 302);
    return page(reply, 'expiree', { raison: 'inactivite' }, 401);
  };

  // 2 et 3. Session et droit effectif, sur toutes les routes sauf /auth/*, /static/* et /robots.txt.
  // Provenance (Fetch Metadata, audit D3-A1) : www.nicephos.art et la console sont du même site au sens des cookies ;
  // un site compromis pourrait faire charger une adresse de la console par le navigateur d'un administrateur (image,
  // feuille) : export noté à son nom, session prolongée. Seules passent les requêtes de la console elle-même, celles
  // tapées ou ouvertes d'un favori, et les navigations de page ; l'export, seulement depuis la console. Navigateur qui
  // n'envoie pas ces en-têtes : rien à vérifier (le jeton Access reste exigé). Refus noté une fois par 10 minutes.
  const MEME_ORIGINE = new Set(['/evenements.csv']);
  let provenanceVue = 0;
  function provenanceRefusee(req) {
    const site = req.headers['sec-fetch-site'];
    if (!site || site === 'same-origin') return false;
    const chemin = req.url.split('?')[0];
    if (MEME_ORIGINE.has(chemin)) return true;
    if (site === 'none') return false;
    const nav = req.method === 'GET' && req.headers['sec-fetch-mode'] === 'navigate' && ['document', undefined].includes(req.headers['sec-fetch-dest']);
    return !nav;
  }

  app.addHook('preHandler', async (req, reply) => {
    if (req.routeOptions?.config?.public || req.url.startsWith('/static/')) return;
    if (provenanceRefusee(req)) {
      if (now() - provenanceVue > 10 * 60e3) { provenanceVue = now(); refuse(req, 'provenance', { detail: { site: clean(req.headers['sec-fetch-site'], 20), dest: clean(req.headers['sec-fetch-dest'], 20) } }); }
      return page(reply, 'interdit', { raison: 'droit', requis: null }, 403);
    }
    const s = sessions.find(req.cookies[SESSION]);
    if (!s) return toLogin(req, reply);
    const t = now();
    const end = (raison, cas, extra, code = 401) => { sessions.close(s.id, raison); reply.clearCookie(SESSION, EFFACE); return page(reply, cas, extra, code); };
    // Le cookie ne vaut qu'avec l'identité Cloudflare Access de son ouverture (cookie volé rejoué sous un autre compte).
    if ((s.access || null) !== (req.access.email || req.access.sub || null)) {
      refuse(req, 'access_autre', { sub: s.sub });
      return end('access_autre', 'interdit', { raison: 'access' }, 403);
    }
    if (t - s.vu_a > IDLE) return end('inactivite', 'expiree', { raison: 'inactivite' });
    if (t - s.cree_a > ABSOLUTE) return end('duree', 'expiree', { raison: 'duree' });
    let ceiling = s.plafond;
    if (t - s.plafond_lu > CEILING_GRACE && echecRecent(s.sub)) return end('plafond_illisible', 'zitadel', {}, 503);
    if (t - s.plafond_lu > CEILING_EVERY && !echecRecent(s.sub)) {
      try { ceiling = await recheck(s); } catch (err) {
        log.warn({ err: err.message }, 'Vigie : console : plafond illisible');
        if (t - s.plafond_lu > CEILING_GRACE) return end('plafond_illisible', 'zitadel', {}, 503);
      }
    }
    const role = rights.effective(s.sub, ceiling);
    if (!role) return end('plafond_retire', 'refusee', { qui: req.access.email }, 403);
    if (!isRefresh(req)) sessions.touch(s.id);
    req.moi = { sub: s.sub, nom: s.nom, role, plafond: ceiling, sid: s.id, csrf: s.csrf, authA: s.auth_a };
    // Formulaires : jeton CSRF de la session, et requête venue de la console elle-même : Sec-Fetch-Site quand le
    // navigateur l'envoie (avec « no-referrer », Chromium envoie « Origin: null » même depuis la console), Origin sinon.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const site = req.headers['sec-fetch-site'], origin = req.headers.origin;
      const token = typeof req.body?._csrf === 'string' ? req.body._csrf : '';
      // Format d'abord (un jeton en caractères multi-octets faisait lever timingSafeEqual : 500 sans trace ; audit D3-A4).
      const ok = /^[A-Za-z0-9_-]{1,100}$/.test(token) && token.length === s.csrf.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(s.csrf));
      const sameOrigin = site ? site === 'same-origin' : !origin || origin === consoleOrigin;
      if (!ok || !sameOrigin) {
        refuse(req, 'csrf', { sub: s.sub });
        return page(reply, 'interdit', { raison: 'droit', requis: null }, 403);
      }
    }
  });

  // Garde des routes d'action (phase D3c) : droit de l'action, plafond relu chez Zitadel à l'instant (illisible : rien
  // n'est fait), ré-authentification de moins de 5 minutes quand l'action l'exige (actions forcées, interrupteurs).
  async function guard(req, reply, action, { reauth = false, libelle = '' } = {}) {
    if (!Object.hasOwn(ACTIONS, action)) throw new Error(`action inconnue : ${action}`);
    const s = sessions.byId(req.moi.sid);
    let ceiling;
    try {
      if (echecRecent(s.sub)) throw new Error('Zitadel en échec il y a moins d’une minute');
      ceiling = await recheck(s);
    } catch (err) {
      log.warn({ err: err.message }, 'Vigie : console : plafond illisible avant une action');
      page(reply, 'zitadel', {}, 503);
      return false;
    }
    const role = rights.effective(s.sub, ceiling);
    if (!role) { reply.clearCookie(SESSION, EFFACE); page(reply, 'refusee', { qui: req.access.email }, 403); return false; }
    req.moi.role = role;
    if (!can(role, action)) { page(reply, 'interdit', { raison: 'droit', requis: LABELS[ACTIONS[action]] }, 403); return false; }
    if (reauth && now() - s.auth_a > FRESH) {
      page(reply, 'reauth', { action: libelle, retour: safeRetour(req.body?.retour), csrf: s.csrf }, 401);
      return false;
    }
    return true;
  }

  // Page en session : le message laissé par une action (fait, ou refusé) y est montré une fois.
  const view = (reply, req, name, it, code = 200) => render(reply, name, {
    moi: { nom: req.moi.nom, sub: req.moi.sub, role: req.moi.role }, csrf: req.moi.csrf,
    compteurs: compteurs({ db, engine, switches, now }), message: isRefresh(req) ? null : sessions.takeMessage(req.moi.sid), ...it,
  }, code);

  // Connexion : aller vers Zitadel (PKCE, state, nonce gardés en base, le state aussi dans un cookie de 10 minutes).
  async function startLogin(req, reply, { retour, reauth = null }) {
    let r;
    try { r = await oidc.start({ reauth: Boolean(reauth) }); } catch (err) {
      log.error({ err: err.message }, 'Vigie : console : Zitadel injoignable');
      return page(reply, 'zitadel', {}, 503);
    }
    sessions.putTx({ ...r.tx, retour, reauth });
    reply.setCookie(TX, r.tx.state, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
    return reply.redirect(r.url, 302);
  }

  app.get('/auth/login', { config: { public: true } }, async (req, reply) => {
    const retour = safeRetour(req.query.retour);
    const s = sessions.find(req.cookies[SESSION]);
    if (s && now() - s.vu_a <= IDLE && now() - s.cree_a <= ABSOLUTE && (s.access || null) === (req.access.email || req.access.sub || null)) return reply.redirect(retour, 302);
    return startLogin(req, reply, { retour });
  });

  app.post('/reauth', async (req, reply) => startLogin(req, reply, { retour: safeRetour(req.body?.retour), reauth: req.moi.sid }));

  app.get('/auth/callback', { config: { public: true } }, async (req, reply) => {
    const q = req.query || {};
    const cookieState = req.cookies[TX];
    reply.clearCookie(TX, EFFACE);
    const tx = typeof q.state === 'string' && q.state === cookieState ? sessions.takeTx(q.state) : null;
    if (!tx) { refuse(req, 'etat'); return page(reply, 'expiree', { raison: 'inactivite' }, 400); }
    if (q.error) {
      refuse(req, 'zitadel', { detail: { erreur: clean(q.error, 60) } });
      return page(reply, 'refusee', { qui: req.access.email }, 403);
    }
    let c;
    try { c = await oidc.finish({ code: q.code, state: q.state, ...(q.iss ? { iss: q.iss } : {}) }, tx); } catch (err) {
      log.warn({ err: err.message }, 'Vigie : console : retour de Zitadel refusé');
      refuse(req, 'jeton', { detail: { erreur: clean(err.message, 120) } });
      return page(reply, 'zitadel', {}, 502);
    }
    const sub = clean(c.sub, 200);
    // Second facteur exigé (D9) : Zitadel met « mfa » dans amr dès deux facteurs (clé d'accès comprise).
    if (!c.amr.includes('mfa')) { refuse(req, 'mfa', { sub, detail: { amr: c.amr.slice(0, 8) } }); return page(reply, 'mfa', {}, 403); }
    // Sans auth_time, l'heure de l'authentification est inconnue : jamais tenue pour récente (audit D3-A3).
    const authA = c.authTime ?? 0;
    if (tx.reauth) {
      const s = sessions.byId(tx.reauth);
      if (!s) return page(reply, 'expiree', { raison: 'inactivite' }, 401);
      // Même compte, et authentification faite à l'instant (prompt=login), pas une session Zitadel ancienne.
      if (s.sub !== sub || !c.authTime || authA < tx.cree_a - 5000) {
        refuse(req, s.sub !== sub ? 'reauth_autre' : 'reauth_ancienne', { sub });
        return page(reply, 'autre', { retour: tx.retour }, 403);
      }
      sessions.setAuth(s.id, authA);
      return reply.redirect(tx.retour, 302);
    }
    const ceiling = ceilingOf(c.roles);
    if (!ceiling) { refuse(req, 'role', { sub }); return page(reply, 'refusee', { qui: req.access.email }, 403); }
    rights.observe(sub, ceiling, { nom: c.nom });
    const role = rights.effective(sub, ceiling);
    const { token } = sessions.open({ sub, nom: c.nom, plafond: ceiling, access: req.access.email || req.access.sub, authA, ip: req.ip2, ua: req.headers['user-agent'] });
    store.own('vigie_console_connexion', { emetteur: 'vigie/console', sub, ip: req.ip2 || undefined, detail: { role, plafond: ceiling, amr: c.amr.slice(0, 8) } });
    reply.setCookie(SESSION, token, { path: '/', httpOnly: true, secure: true, sameSite: 'lax' });
    return reply.redirect(tx.retour, 302);
  });

  app.post('/auth/logout', async (req, reply) => {
    sessions.close(req.moi.sid, 'sortie');
    store.own('vigie_console_sortie', { emetteur: 'vigie/console', sub: req.moi.sub, ip: req.ip2 || undefined });
    reply.clearCookie(SESSION, EFFACE);
    let url = null;
    try { url = await oidc.logoutUrl(); } catch { /* Zitadel injoignable : la session de la console est fermée quand même */ }
    return reply.redirect(url || '/', 302);
  });

  app.get('/robots.txt', { config: { public: true } }, async (req, reply) => reply.type('text/plain').send('User-agent: *\nDisallow: /\n'));

  app.get('/', async (req, reply) => {
    const vue = overview({ db, engine, switches, now, role: req.moi.role });
    if (isRefresh(req)) return render(reply, 'vue-ensemble', { vue, fragment: true, csrf: req.moi.csrf, authA: req.moi.authA, moi: { nom: req.moi.nom, sub: req.moi.sub, role: req.moi.role } });
    return view(reply, req, 'vue-ensemble', { page: 'vue', titre: 'Vue d’ensemble · Vigie', vue, fragment: false, authA: req.moi.authA });
  });

  // Écrans, un module par groupe (vigie/console/ecrans/*.js) : chacun déclare ses routes avec ce contexte. Les routes
  // héritent des trois verrous (crochets ci-dessus) ; une route d'action appelle guard().
  const ctx = { db, store, engine, switches, decisions, rights, now, view, render, page, guard, isRefresh, log, sessions,
    notifications, edge, siteBackupDir, verifyChain, safeRetour,
    moiVue: req => ({ nom: req.moi.nom, sub: req.moi.sub, role: req.moi.role }) };
  const served = new Set();
  for (const mod of ECRANS) for (const url of mod.register(app, ctx) || []) served.add(url);
  // Écrans pas encore codés : page d'attente dans la console (mêmes verrous).
  for (const [url, pageId] of [['/alertes', 'alertes'], ['/evenements', 'evenements'], ['/entites', 'entites'], ['/sante', 'sante'], ['/flux', 'flux'],
    ['/decisions', 'decisions'], ['/reglages', 'reglages'], ['/droits', 'droits']]) {
    if (!served.has(url)) app.get(url, async (req, reply) => view(reply, req, 'a-venir', { page: pageId, titre: 'Vigie' }));
  }

  app.setNotFoundHandler(async (req, reply) => {
    if (!req.moi) return toLogin(req, reply);
    return reply.code(404).type('text/plain; charset=utf-8').send('Page introuvable.');
  });
  app.setErrorHandler(async (err, req, reply) => {
    log.error({ err: err.message, route: req.routeOptions?.url }, 'Vigie : console : erreur');
    const code = err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    return reply.code(code).type('text/plain; charset=utf-8').send(code === 500 ? 'Erreur de la console.' : 'Requête refusée.');
  });

  const timer = setInterval(() => { try { sessions.purge(); } catch { /* base occupée : la fois suivante */ } }, 3600e3);
  timer.unref();
  return { app, rights, sessions, guard, async close() { clearInterval(timer); await app.close(); } };
}
