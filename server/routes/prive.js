import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { VARIANT_RE } from '../images.js';
import { servedVariant } from '../repli-variantes.js';
import { picture } from '../picture.js';
import { sameToken } from '../auth.js';
import { createRateLimiter } from '../ratelimit.js';
import { truncateIp } from '../ip.js';
import { uaFamily } from '../securite/detection.js';
import { UI, LANGS, localize } from '../i18n.js';
import { PRIVE, dateOf, timeOf, isoDay } from '../prive-i18n.js';
import * as v2 from '../v2-vues.js';
import { shortDate } from '../format.js';
import { createPasswordGate, verifyPassword, needsRehash, hashPassword } from '../passwords.js';
import { createVisitorSessions, visitorRef, ctxPrint, REVOKED_KEEP } from '../visitor-sessions.js';
import { PID_RE, SIZES } from '../spaces.js';
import { writeZip } from '../zip.js';
import { MAX_PIXELS } from '../images.js';
import { resolveTone, overlayFor } from '../watermark.js';
import { insecables } from '../typographie.js';

// Pages des invités d'une galerie privée (annexe de sécurité, § 5 ; maquettes MQ-16 et MQ-17) : hors des pages par
// langue (aucun préfixe /en, /de ; aucun sélecteur /langue/, G37), toujours en v2 (server/version-publique.js), jamais
// indexées ni gardées en cache, sans Referer (G32).
//   GET/POST /g/<jeton>           page du mot de passe (le jeton ne sert qu'à arriver ici)
//   GET /prive/<id>               la galerie (?vue=favoris) ; /prive/<id>/photo/<n> : une photo
//   GET /prive/<id>/m/<variante>  images, contrôlées à chaque requête (G38 ; jamais /media/)
//   GET /prive/<id>/telecharger/<n>/<taille>, POST /prive/<id>/archive, GET /prive/<id>/archive/<n>
//   POST /prive/<id>/selection/<n> (favori), /selection/terminer, /selection/reprendre, /langue ; POST /prive/quitter
// Toute écriture d'un invité exige l'Origin du site (ou Sec-Fetch-Site: same-origin ; « Origin: null », envoyé par les
// navigateurs sous no-referrer, n'en tient pas lieu) et, dès qu'une session existe, son jeton CSRF (G28).
// Vigie (registre docs/etudes/vigie-besoins-des-briques.md, BV-16 à BV-19, BV-22, BV-25) : types existants du vocabulaire
// fermé, composant « site · public », jamais de jeton, de mot de passe, d'étiquette ni d'e-mail.

const EMETTEUR = 'server/routes/prive.js';
const PORTAIL = 'galerie_privee';
const HOUR = 3600e3;
const ARCHIVE_MAX_PHOTOS = 100, ARCHIVE_MAX_BYTES = 1024 ** 3, ARCHIVES_PER_DAY = 3, ARCHIVES_AT_ONCE = 2, DOWNLOADS_PER_HOUR = 50, RENDERS_AT_ONCE = 2;
const RENDER_BUSY = 'ERR_PRIVATE_RENDER_BUSY';

// Admission commune aux téléchargements unitaires et aux archives. Un fichier déjà prêt et les demandes du même rendu
// passent toujours ; les autres échouent sans file d'attente une fois la borne atteinte, pour ne pas retenir de requêtes.
export function createRenderGate({ maximum = RENDERS_AT_ONCE, exists = fs.existsSync } = {}) {
  const jobs = new Map();
  let running = 0;
  return {
    run(file, render) {
      if (exists(file)) return Promise.resolve(file);
      const same = jobs.get(file);
      if (same) return same;
      if (running >= maximum) {
        const err = new Error('trop de rendus privés simultanés');
        err.code = RENDER_BUSY;
        throw err;
      }
      running += 1;
      const job = Promise.resolve().then(render).finally(() => { jobs.delete(file); running -= 1; });
      jobs.set(file, job);
      return job;
    },
    stats: () => ({ running, distinct: jobs.size }),
  };
}

export default async function privateRoutes(app) {
  const { spaces } = app;
  const { config } = app;
  const sessions = createVisitorSessions({ db: app.db });
  app.decorate('visitorSessions', sessions);
  const renderGate = app.privateRenderGate;
  const gate = app.passwordGate || createPasswordGate();
  const verify = app.passwordVerify || verifyPassword;
  const prefix = config.secureCookies ? '__Host-' : '';
  const COOKIE = `${prefix}visiteur`;
  const cookieBase = { path: '/', httpOnly: true, secure: config.secureCookies, sameSite: 'lax' };
  const siteOrigin = new URL(config.publicUrl).origin;
  const variantsDir = path.join(config.storageDir, 'variants');
  const linkLimit = createRateLimiter({ limit: 60, windowMs: HOUR });                 // ouvertures de /g/ par adresse (G20)
  const passLimit = createRateLimiter({ limit: 20, windowMs: 15 * 60e3 });           // essais par adresse (G20)
  const dlCounts = new Map();
  let building = 0;                                                                    // archives en cours d'écriture
  const waiting = [];                                                          // accès → { start, n }
  const settingRow = app.db.prepare('SELECT value FROM settings WHERE key = ?').pluck();
  const setting = k => { try { return JSON.parse(settingRow.get(k) ?? 'null'); } catch { return null; } };
  const authorName = app.db.prepare('SELECT name FROM authors WHERE id = ?').pluck();
  const sec = (type, opts) => app.securite.emit(type, { composant: 'site · public', ...opts });
  const ref = request => (request.visitor ? `visiteur:${visitorRef(request.visitor.id)}` : undefined);

  // Espaces insécables des pages privées (lexique des maquettes, § 2), dans la langue de la page.
  app.addHook('onSend', async (request, reply, payload) => (typeof payload === 'string' && /^\/(?:g|prive)\//.test(request.routeOptions?.url || '')
    && /^text\/html/.test(String(reply.getHeader('content-type') || '')) ? insecables(payload, /<html lang="(\w\w)"/.exec(payload)?.[1]) : payload));

  // ---------- session visiteur ----------
  app.decorateRequest('visitor', null);
  app.decorateRequest('visitorRevoked', null);
  app.decorateRequest('removed', null);
  app.addHook('onRequest', async request => {
    const token = request.cookies[COOKIE];
    if (!token) return;
    request.visitor = sessions.load(token);
    if (!request.visitor) request.visitorRevoked = sessions.revoked(token);
  });
  const ctxOf = request => ctxPrint(truncateIp(request.ip), uaFamily(request.headers['user-agent']));
  const setCookie = (reply, token, remember) => reply.setCookie(COOKIE, token, { ...cookieBase, ...(remember ? { maxAge: 30 * 86400 } : {}) });

  // ---------- en-têtes ----------
  const pageHeaders = reply => reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex').header('referrer-policy', 'no-referrer');
  const fileHeaders = (reply, cache) => reply.header('cache-control', cache).header('x-robots-tag', 'noindex').header('referrer-policy', 'no-referrer').header('cross-origin-resource-policy', 'same-origin');

  // ---------- rendu ----------
  const contactOf = () => {
    const c = String(setting('privacy_contact') || setting('rights_contact') || '').trim();
    return /^[^\s@"<>'&]+@[^\s@"<>'&]+\.[^\s@"<>'&]+$/.test(c) ? `mailto:${c}` : null;
  };
  const whoOf = s => (s?.author_id ? authorName.get(s.author_id) : null) || app.siteName();
  function page(reply, template, lang, data, code = 200) {
    const l = LANGS.includes(lang) ? lang : 'fr';
    const P = PRIVE[l];
    const siteName = app.siteName();
    pageHeaders(reply).code(code);
    const title = [data.titre, P.label, siteName].filter(Boolean).join(' · ');
    return reply.render(template, {
      lang: l, t: UI[l], P, u: p => localize(p, l), picture, siteName, contact: contactOf(),
      v2: { ...v2, date: d => shortDate(d, l), typo: s => v2.typo(s, l) },
      dateOf: ms => dateOf(ms, l), timeOf: ms => timeOf(ms, l), isoDay, ...data,
      pageTitle: v2.typo(data.pageTitle || title, l), description: '', neutral: true, prive: true,
    });
  }
  const message = (reply, lang, kind, data = {}, code = 200) => page(reply, 'prive-message', lang, { kind, ...data }, code);
  // 404 uniforme des pages privées (T10) : la même pour une galerie qui existe et pour une autre.
  const notFound = (request, reply, lang = request.visitor?.lang || 'fr', kind = 'introuvable', data = {}) => message(reply, lang, kind, data, 404);

  // ---------- provenance et CSRF (G28, BV-25) ----------
  function provenance(request) {
    const o = request.headers.origin;
    if (o && o !== 'null') return o === siteOrigin || o === `${request.protocol}://${request.headers.host}` ? null : 'formulaire envoyé depuis un autre site';
    return request.headers['sec-fetch-site'] === 'same-origin' ? null : 'provenance absente';
  }
  // Envoi accepté ? Sinon, réponse 403 déjà envoyée (et signalement).
  function guard(request, reply, formulaire, { csrf = true } = {}) {
    const lang = request.visitor?.lang || 'fr';
    const raison = provenance(request);
    if (raison) {
      sec('input_validation_fail', { request, reference: ref(request), emetteur: `${EMETTEUR} · provenance`, detail: { raison, formulaire, origine: request.headers.origin ? String(request.headers.origin).slice(0, 100) : undefined } });
      message(reply, lang, 'refuse', {}, 403);
      return false;
    }
    if (!csrf && !request.visitor) return true;
    if (!request.visitor || !sameToken(String(request.body?.csrf ?? ''), request.visitor.csrf)) {
      if (request.visitor) sec('authz_csrf_fail', { request, reference: ref(request), emetteur: `${EMETTEUR} · CSRF`, detail: { jeton: request.body?.csrf ? 'faux' : 'absent', formulaire } });
      message(reply, lang, 'refuse', {}, 403);
      return false;
    }
    return true;
  }
  const impossible = (request, raison, detail = {}) => sec('input_validation_fail', { request, reference: ref(request), emetteur: `${EMETTEUR} · gestes`, detail: { raison, ...detail } });

  // ---------- page du lien ----------
  // Accès retiré ou lien remplacé, rejoué (BV-22) : la page dit que le lien n'est plus valable, la Vigie le sait.
  function replayed(request, r) {
    sec('session_use_after_expire', { request, severity: 'moyen', reference: ref(request), emetteur: `${EMETTEUR} · lien`,
      detail: { portail: PORTAIL, jeton: 'lien', raison: r.old ? 'lien_remplace' : 'acces_revoque', acces: r.invite?.id ?? null, espace: r.space?.id ?? null, meme_reseau_et_navigateur: null } });
  }
  const ended = r => !r.space || r.space.state !== 'ouverte' || r.space.closes_at <= Date.now() || r.invite.expires_at <= Date.now();
  const endDate = r => Math.min(r.invite.expires_at, r.space?.closed_at || r.space?.closes_at || Infinity);
  // Lien reçu : réponse déjà envoyée (404, 410) ou { invite, space } d'un lien qui ouvre la page du mot de passe.
  function link(request, reply) {
    const r = spaces.byLink(request.params.token);
    if (!r || !r.invite || r.space?.state === 'brouillon') {
      // Jeton mal formé ou inconnu : la 404 ordinaire du site, sans rien dire (T1, T2). Format vérifié avant la base.
      if (!r?.invite) sec('token_guess', { request, emetteur: `${EMETTEUR} · lien`, detail: { nature: 'lien de galerie privée' } });
      reply.callNotFound();
      return null;
    }
    const who = whoOf(r.space), lang = r.invite.lang;
    if (r.old || r.invite.revoked_at) { replayed(request, r); message(reply, lang, 'revoque', { who }, 410); return null; }
    if (ended(r)) { message(reply, lang, 'fini', { who, date: endDate(r) }, 410); return null; }
    return r;
  }
  const formData = (request, r, extra = {}) => ({ inv: r.invite, space: r.space, who: whoOf(r.space), token: request.params.token, csrf: request.visitor?.csrf || '', ...extra });

  app.get('/g/:token', async (request, reply) => {
    if (!linkLimit(request.ip)) {
      sec('excess_rate_limit_exceeded', { request, emetteur: `${EMETTEUR} · limite`, detail: { limite: 'galerie_lien', par_heure: 60 } });
      return message(reply.header('retry-after', '3600'), 'fr', 'limite', {}, 429);
    }
    const r = link(request, reply);
    if (!r) return reply;
    // Autorisation déjà ouverte sur ce navigateur : droit à la galerie, adresse sans jeton (G27).
    if (spaces.access(request.visitor, r.space)) return pageHeaders(reply).redirect(`/prive/${r.space.public_id}`, 303);
    // Le GET ne consomme rien et ne vaut pas « ouvert » (G12) : « lien consulté », une fois par adresse et par jour.
    spaces.linkViewed(r.invite, request);
    const inv = r.invite;
    if (inv.suspended_at) return message(reply, inv.lang, 'suspendu', { who: whoOf(r.space) }, 403);
    const pause = inv.locked_until && inv.locked_until > Date.now() ? { until: inv.locked_until, count: inv.failed_count } : null;
    return page(reply, 'prive-acces', inv.lang, formData(request, r, { pause }));
  });

  app.post('/g/:token', async (request, reply) => {
    if (!guard(request, reply, 'galerie_mot_de_passe', { csrf: false })) return reply;
    if (!passLimit(request.ip)) {
      sec('excess_rate_limit_exceeded', { request, emetteur: `${EMETTEUR} · limite`, detail: { limite: 'galerie_mot_de_passe', par_15_min: 20 } });
      return message(reply.header('retry-after', '900'), 'fr', 'limite', {}, 429);
    }
    const r = link(request, reply);
    if (!r) return reply;
    const inv = r.invite, who = whoOf(r.space), lang = inv.lang;
    const busy = () => message(reply.header('retry-after', '5'), lang, 'occupe', { who }, 503);
    // Un seul calcul à la fois pour cet accès, deux en tout (G18) : sinon « réessayez », sans compter l'essai.
    const full = gate.reserve(inv.id);
    if (full) {
      if (full === 'plein') app.securite.emitThrottled('galerie:mot_de_passe_global', 'excess_rate_limit_exceeded', { request, composant: 'site · public', emetteur: `${EMETTEUR} · calculs`, detail: { limite: 'mot_de_passe_global' } });
      return busy();
    }
    // Compté comme un refus AVANT le calcul, dans une transaction (G19, T6).
    const attempt = spaces.beginAttempt(inv.id);
    const failInfo = extra => ({ portail: PORTAIL, acces: inv.id, espace: r.space.id, echecs_consecutifs: attempt.count ?? attempt.inv?.failed_count ?? null, echecs_total: attempt.total ?? attempt.inv?.failed_total ?? null, ...extra });
    if (attempt.state !== 'compte') {
      gate.cancel(inv.id);
      sec('authn_login_fail', { request, severity: 'bas', reference: ref(request), emetteur: `${EMETTEUR} · mot de passe`, detail: failInfo({ pendant_pause: attempt.state === 'pause', pendant_suspension: attempt.state === 'suspendu' }) });
      if (attempt.state === 'suspendu') return message(reply, lang, 'suspendu', { who }, 403);
      return page(reply, 'prive-acces', lang, formData(request, r, { pause: { until: attempt.until, count: attempt.inv.failed_count } }), 403);
    }
    let ok = false;
    try {
      ok = await gate.run(inv.id, () => verify(request.body?.password, inv.password_hash));
    } catch (err) {
      request.log.error({ err: err.message }, 'galerie privée : calcul du mot de passe');
      return busy();
    }
    if (!ok) {
      spaces.failed(attempt);
      spaces.logEvent(r.space.id, inv.id, 'mot_de_passe_refuse', { request });
      sec('authn_login_fail', { request, severity: 'bas', reference: ref(request), emetteur: `${EMETTEUR} · mot de passe`, detail: failInfo({ pendant_pause: false }) });
      if (attempt.palier) {
        // Palier posé (pause d'une minute, de 15 minutes, suspension). Le registre demande un type « authn_login_lock »,
        // absent du vocabulaire fermé : le plus proche est « authn_login_disabled » (connexion refusée parce que l'accès est
        // rendu indisponible), avec detail.type_attendu. À la Vigie de l'ajouter (PR, « Impact sur la Vigie »).
        spaces.logEvent(r.space.id, inv.id, attempt.palier === 'suspension' ? 'suspension' : 'verrou', { request, detail: attempt.palier });
        // Répartition des refus sur 24 h, lue dans le journal des accès (réseaux /24 ou /48 et pays : l'adresse complète
        // n'y est jamais gardée) ; celle de cet essai est dans l'événement.
        sec('authn_login_disabled', { request, severity: attempt.palier === 'suspension' ? 'haut' : 'moyen', reference: ref(request), emetteur: `${EMETTEUR} · verrou`,
          detail: { type_attendu: 'authn_login_lock', portail: PORTAIL, acces: inv.id, espace: r.space.id, palier: attempt.palier, ...spaces.spread(inv.id) } });
        if (attempt.palier === 'suspension') return message(reply, lang, 'suspendu', { who }, 403);
        return page(reply, 'prive-acces', lang, formData(request, r, { pause: { until: attempt.until, count: attempt.count } }), 403);
      }
      const left = spaces.remaining(attempt.count), toSuspend = 30 - attempt.total;
      return page(reply, 'prive-acces', lang, formData(request, r, { error: toSuspend <= left.n ? { last: toSuspend } : left }), 403);
    }
    // Mot de passe accepté : l'essai compté est annulé, la session visiteur est créée ou son jeton change (G24).
    spaces.succeed(attempt);
    if (needsRehash(inv.password_hash)) app.db.prepare('UPDATE space_invites SET password_hash = ? WHERE id = ?').run(await hashPassword(request.body?.password), inv.id);
    const remember = Boolean(request.body?.remember);
    const ctx = ctxOf(request);
    const { token, session } = request.visitor ? sessions.rotate(request.visitor, { raison: 'rotation', ctx }) : sessions.create({ ctx });
    setCookie(reply, token, remember);
    const g = spaces.grant(session, inv, remember);
    spaces.logEvent(r.space.id, inv.id, 'mot_de_passe_ok', { request, detail: g.deviceRank ? `appareil ${g.deviceRank}` : '' });
    // Entrée ordinaire : réseau et pays seulement, ni adresse complète ni navigateur (BV-18, J6).
    const n = { ip_net: truncateIp(request.ip), country: /^[A-Z]{2}$/.test(String(request.headers['cf-ipcountry'] || '')) && config.trustProxy ? String(request.headers['cf-ipcountry']) : undefined };
    app.securite.emit('session_created', { composant: 'site · public', ip_net: n.ip_net, reference: `visiteur:${visitorRef(session.id)}`, emetteur: `${EMETTEUR} · session`,
      detail: { portail: PORTAIL, acces: inv.id, espace: r.space.id, appareil_n: g.devices, nouvel_appareil: Boolean(g.deviceRank), se_souvenir: remember, groupe: Boolean(inv.is_group), pays: n.country } });
    return pageHeaders(reply).redirect(`/prive/${r.space.public_id}`, 303);
  });

  // ---------- accès à une galerie ----------
  // { team, space, invite } ; sinon null (la réponse n'est pas envoyée : à l'appelant de répondre 404).
  // nature : ce que signale la Vigie pour une demande sans droit (BV-17) ; une session qui a eu accès à cette galerie
  // n'est pas signalée (échéance passée, « Quitter »), sauf un accès retiré (BV-22).
  function resolve(request, { nature = 'espace privé', write = false } = {}) {
    const s = spaces.byPid(request.params.pid);
    // Vue équipe : seulement si l'adresse n'est pas bloquée pour l'administration par la Vigie (un blocage de portée
    // « admin » vaut aussi pour la vue équipe des galeries ; revue de sécurité de la PR #149).
    const adminBlocked = (() => { try { return Boolean(app.decisions?.blocked(request.ip, '/admin')); } catch { return false; } })();
    if (s && request.session && !adminBlocked) {
      if (request.owns('galeries.voir', s.author_id)) return { team: true, space: s, invite: null };
      // Une session de l'admin sur la galerie d'un autre photographe : hors portée (BV-14).
      if (request.can('galeries.voir')) app.securite.emit('authz_fail', { request, emetteur: `${EMETTEUR} · portée`, detail: { raison: 'hors portée', permission: 'galeries.voir', objet: 'galerie', id: s.id, ecriture: write } });
    }
    const a = s && spaces.access(request.visitor, s);
    if (a) return { team: false, space: s, invite: a.invite };
    const had = s && spaces.hadAccess(request.visitor, s);
    const revokedTok = request.visitorRevoked;
    if (had && had.raison && had.raison !== 'quitte') {
      sec('session_use_after_expire', { request, severity: 'moyen', reference: ref(request), emetteur: `${EMETTEUR} · session`,
        detail: { portail: PORTAIL, jeton: 'cookie_visiteur', raison: had.raison, acces: had.invite_id, espace: s.id, meme_reseau_et_navigateur: request.visitor.ctx === ctxOf(request) } });
      request.removed = { space: s };
    } else if (revokedTok && revokedTok.raison !== 'expiree' && Date.now() - revokedTok.revoked_at < REVOKED_KEEP && Date.now() - revokedTok.revoked_at > 10e3) {
      // Cookie d'une session « quittée » ou dont le jeton a changé : copié, ou vieil onglet.
      const same = revokedTok.ctx === ctxOf(request);
      sec('session_use_after_expire', { request, severity: same ? 'moyen' : 'haut', emetteur: `${EMETTEUR} · session`, reference: `visiteur:${visitorRef(revokedTok.session_id)}`,
        detail: { portail: PORTAIL, jeton: 'cookie_visiteur', raison: revokedTok.raison === 'quitte' ? 'quitte' : 'jeton_remplace', acces: null, espace: s?.id ?? null, meme_reseau_et_navigateur: same } });
    } else if (!had) {
      sec('token_guess', { request, reference: ref(request), emetteur: `${EMETTEUR} · ${nature === 'image privée' ? 'images' : 'galerie'}`, detail: { nature } });
    }
    return null;
  }
  const deny = (request, reply) => (request.removed ? notFound(request, reply, request.visitor?.lang, 'retire', { who: whoOf(request.removed.space) }) : notFound(request, reply));
  const langOf = (request, a) => (LANGS.includes(request.visitor?.lang) ? request.visitor.lang : a.invite?.lang || 'fr');
  const rightsOf = a => (a.team ? { favoris: false, telechargement: 'non' } : a.invite.rights);
  const firstName = label => String(label || '').split(/[,(]/)[0].trim().split(/\s+/)[0] || '';

  // Données communes des pages d'une galerie.
  function galleryData(request, a, lang) {
    const s = a.space;
    const list = spaces.items(s.id, { lang, forGuests: true });
    const favs = a.invite ? spaces.favorites(a.invite.id) : [];
    const favSet = new Set(favs.map(f => f.item_id));
    const title = v2.typo(spaces.titleOf(s, lang), lang);
    return { team: a.team, space: s, inv: a.invite, list, favSet, nFav: list.filter(p => favSet.has(p.item_id)).length, rights: rightsOf(a), titre: title, title,
      intro: s[lang === 'fr' ? 'intro' : `intro_${lang}`] || s.intro, who: whoOf(s), csrf: request.visitor?.csrf || '', pid: s.public_id,
      first: a.invite ? firstName(a.invite.label) : '', until: a.invite ? Math.min(a.invite.expires_at, s.closes_at) : s.closes_at };
  }
  const visited = (request, a) => {
    if (a.team) return;
    const day0 = Date.now() - 864e5;
    const seen = app.db.prepare("SELECT 1 FROM space_events WHERE invite_id = ? AND kind = 'visite' AND detail = ? AND created_at > ? LIMIT 1").get(a.invite.id, visitorRef(request.visitor.id), day0);
    if (!seen) spaces.logEvent(a.space.id, a.invite.id, 'visite', { request, detail: visitorRef(request.visitor.id) });
  };

  app.get('/prive/:pid', async (request, reply) => {
    const a = resolve(request);
    if (!a) return deny(request, reply);
    const lang = langOf(request, a);
    let vue = request.query.vue;
    if (vue !== undefined && vue !== 'favoris') { impossible(request, 'vue inconnue', { champ: 'vue', valeur: String(vue).slice(0, 40) }); vue = undefined; }
    visited(request, a);
    const d = galleryData(request, a, lang);
    const etat = ['envoye', 'repris', 'archive-limite', 'telechargements-limite', 'figee'].includes(request.query.etat) ? request.query.etat : null;
    return page(reply, 'prive-galerie', lang, { ...d, vue: vue || 'toutes', etat });
  });

  // Photo par sa place dans la galerie (1, 2…), comme l'adresse de la maquette (lexique, § 2).
  const nth = (d, n) => (/^\d{1,4}$/.test(String(n)) ? d.list[Number(n) - 1] || null : null);
  app.get('/prive/:pid/photo/:n', async (request, reply) => {
    const a = resolve(request);
    if (!a) return deny(request, reply);
    const lang = langOf(request, a);
    const d = galleryData(request, a, lang);
    const p = nth(d, request.params.n);
    if (!p) return notFound(request, reply, lang);
    visited(request, a);
    const i = p.n - 1;
    return page(reply, 'prive-photo', lang, { ...d, photo: p, prev: d.list[(i - 1 + d.list.length) % d.list.length], next: d.list[(i + 1) % d.list.length], titre: `${p.title} · ${d.title}` });
  });

  // ---------- images (G38, G39, G40) ----------
  const photoOfFile = app.db.prepare("SELECT p.id, p.file, p.width, p.variant_key, p.faces, p.faces_override, i.confirmed_at FROM space_items i JOIN photos p ON p.id = i.photo_id WHERE i.space_id = ? AND p.file >= ? || '.' AND p.file < ? || '/'");
  app.get('/prive/:pid/m/:name', async (request, reply) => {
    const m = VARIANT_RE.exec(request.params.name);
    const a = m && resolve(request, { nature: 'image privée' });
    if (!m || !a) { if (!m) sec('token_guess', { request, reference: ref(request), emetteur: `${EMETTEUR} · images`, detail: { nature: 'image privée' } }); return reply.code(404).header('cache-control', 'no-store').type('text/plain; charset=utf-8').send('Introuvable.'); }
    const photo = photoOfFile.get(a.space.id, m[1], m[1]);
    // Photo hors de la galerie, ancienne clé, photo devenue bloquée (refus), ou réglage « Tout l'EXIF » (les variantes
    // gardent alors le GPS : jamais servies par cette route, M19).
    // Bloquée (refus), ou à vérifier sans la confirmation de l'équipe : jamais servie (G61, M17).
    const blocked = photo && !spaces.guestVisible(spaces.privateState(photo).level, photo.confirmed_at);
    if (!photo || photo.variant_key !== (m[2] || '') || blocked || setting('exif')?.mode === 'all') {
      if (!photo || photo.variant_key !== (m[2] || '')) sec('token_guess', { request, reference: ref(request), emetteur: `${EMETTEUR} · images`, detail: { nature: 'image privée' } });
      return reply.code(404).header('cache-control', 'no-store').type('text/plain; charset=utf-8').send('Introuvable.');
    }
    // Taille pas encore créée (160 ou 480 px d'une photo d'avant leur ajout) : une plus grande de la même photo
    // (server/repli-variantes.js). Le nom demandé reste celui de la galerie : rien d'autre ne devient joignable.
    const served = servedVariant(variantsDir, photo, request.params.name);
    if (!served) return reply.code(404).header('cache-control', 'no-store').type('text/plain; charset=utf-8').send('Introuvable.');
    // private, no-cache avec ETag : le navigateur garde l'image mais redemande avant chaque usage (304) ; jamais public.
    return fileHeaders(reply, 'private, no-cache').sendFile(served.name, variantsDir, { cacheControl: false, lastModified: false });
  });

  // ---------- téléchargements (G44, G46 ; BV-19) ----------
  const ascii = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').slice(0, 100);
  // JPEG rendu une fois depuis l'original, gardé dans storage/private (hors sauvegarde) : auteur et « usage personnel »,
  // jamais de GPS (withExif remplace tout l'EXIF), jamais l'original. Grande taille : 4 000 px au plus (Tranché 7).
  // Le filigrane est celui des variantes (mêmes réglages, server/variants.js specFor) ; le rendu gardé est nommé d'après
  // leur empreinte : un changement de filigrane le refait (G42, G44).
  function rendered(p, taille) {
    const spec = app.variants.specOf(p.id) || { key: '', mark: null };
    const stem = path.parse(p.file).name;
    const file = path.join(spaces.dirs.downloads, `${stem}-${spec.key || 'brut'}-${taille}.jpg`);
    const width = SIZES[taille];
    return renderGate.run(file, async () => {
      fs.mkdirSync(spaces.dirs.downloads, { recursive: true, mode: 0o700 });
      const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      try {
        const { data, info } = await sharp(path.join(config.storageDir, 'originals', p.file), { limitInputPixels: MAX_PIXELS }).rotate()
          .resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
        const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };
        let pipeline = sharp(data, raw);
        if (spec.mark) {
          const mark = await resolveTone(data, spec.mark, raw);
          const overlay = info.width >= 16 && info.height >= 16 ? await overlayFor(mark, info.width, Math.max(1, info.height - 1)) : null;
          if (overlay) pipeline = pipeline.composite(overlay);
        }
        await pipeline.jpeg({ quality: 88, mozjpeg: true })
          .withExif({ IFD0: { Artist: ascii(p.author), Copyright: `(C) ${ascii(p.author)} - ${ascii(app.siteName())} - usage personnel / personal use` } }).toFile(tmp);
        fs.renameSync(tmp, file);
        // Rendus d'anciens réglages de la même photo et de la même taille : effacés.
        for (const f of fs.readdirSync(spaces.dirs.downloads)) if (f.startsWith(`${stem}-`) && f.endsWith(`-${taille}.jpg`) && path.join(spaces.dirs.downloads, f) !== file) fs.rmSync(path.join(spaces.dirs.downloads, f), { force: true });
      } finally { fs.rmSync(tmp, { force: true }); }
      return file;
    });
  }
  const allowed = (rights, taille) => (taille === 'web' ? ['web', 'grande'].includes(rights.telechargement) : taille === 'grande' && rights.telechargement === 'grande');
  const fileName = (p, taille) => `${ascii(app.siteName()).replace(/\W+/g, '-').toLowerCase() || 'photo'}-${ascii(p.slug || 'photo').slice(0, 60)}-${taille}.jpg`;
  const downloadLimited = inv => {
    const t = Date.now(), e = dlCounts.get(inv.id);
    if (!e || t - e.start > HOUR) { dlCounts.set(inv.id, { start: t, n: 1, told: false }); if (dlCounts.size > 5000) dlCounts.delete(dlCounts.keys().next().value); return false; }
    e.n += 1;
    return e.n > DOWNLOADS_PER_HOUR ? e : false;
  };
  const renderBusy = (request, reply, a, taille) => {
    app.securite.emitThrottled('galerie:rendus_telechargements_global', 'excess_rate_limit_exceeded', {
      request, reference: ref(request), composant: 'site · public', emetteur: `${EMETTEUR} · calculs`,
      detail: { limite: 'rendus_telechargements_global', simultanes: RENDERS_AT_ONCE, portail: PORTAIL, espace: a.space.id, taille, ...(a.invite ? { acces: a.invite.id } : {}) },
    });
    return message(reply.header('retry-after', '5'), langOf(request, a), 'occupe', { who: whoOf(a.space) }, 503);
  };

  app.get('/prive/:pid/telecharger/:n/:taille', async (request, reply) => {
    const a = resolve(request);
    if (!a) return deny(request, reply);
    const lang = langOf(request, a);
    const d = galleryData(request, a, lang);
    const p = nth(d, request.params.n);
    const taille = request.params.taille;
    if (!['web', 'grande'].includes(taille)) { impossible(request, 'taille hors liste', { taille: String(taille).slice(0, 20) }); return notFound(request, reply, lang); }
    if (!p) { impossible(request, 'photo hors galerie', { geste: 'telechargement' }); return notFound(request, reply, lang); }
    if (!a.team && !allowed(a.invite.rights, taille)) { impossible(request, 'taille non permise', { taille, acces: a.invite.id }); return notFound(request, reply, lang); }
    if (a.team && !allowed({ telechargement: 'grande' }, taille)) return notFound(request, reply, lang);
    // Un HEAD (vérification d'un lien) n'est pas un téléchargement.
    // Il ne prépare pas non plus le JPEG absent du cache : les mêmes contrôles ont déjà établi que le GET serait permis.
    if (request.method === 'HEAD') return fileHeaders(reply, 'private, no-store').header('content-disposition', `attachment; filename="${fileName(p, taille)}"`).type('image/jpeg').send();
    if (!a.team && request.method === 'GET') {
      const over = downloadLimited(a.invite);
      if (over) {
        if (!over.told) { over.told = true; sec('excess_rate_limit_exceeded', { request, reference: ref(request), emetteur: `${EMETTEUR} · téléchargements`, detail: { limite: 'telechargements', par_heure: DOWNLOADS_PER_HOUR, portail: PORTAIL, acces: a.invite.id, espace: a.space.id, taille } }); }
        return pageHeaders(reply).redirect(`/prive/${a.space.public_id}?etat=telechargements-limite`, 303);
      }
    }
    let file;
    try { file = await rendered(p, taille); } catch (err) {
      if (err?.code === RENDER_BUSY) return renderBusy(request, reply, a, taille);
      throw err;
    }
    if (!a.team) {
      spaces.countDownload(a.invite);
      spaces.logEvent(a.space.id, a.invite.id, 'telechargement', { request, item: p.item_id, detail: taille });
    } else {
      // Téléchargement par l'équipe (vue équipe) : un export de photos privées, signalé comme tel.
      app.securite.emit('sensitive_export', { request, emetteur: `${EMETTEUR} · téléchargement (équipe)`, detail: { portail: PORTAIL, nature: 'telechargement', espace: a.space.id, taille, photo: p.n } });
    }
    return fileHeaders(reply, 'private, no-store').header('content-disposition', `attachment; filename="${fileName(p, taille)}"`).type('image/jpeg').send(fs.createReadStream(file));
  });

  // Archive ZIP de toute la galerie (« Tout télécharger ») : écrite dans storage/private/archives, effacée après 24 h,
  // 100 photos et 1 Gio au plus, 3 par jour et par accès (G46).
  app.post('/prive/:pid/archive', async (request, reply) => {
    if (!guard(request, reply, 'archive')) return reply;
    const a = resolve(request, { write: true });
    if (!a || a.team) return deny(request, reply);
    const taille = a.invite.rights.telechargement === 'grande' ? 'grande' : a.invite.rights.telechargement === 'web' ? 'web' : null;
    if (!taille) { impossible(request, 'taille non permise', { geste: 'archive', acces: a.invite.id }); return notFound(request, reply); }
    const back = `/prive/${a.space.public_id}`;
    // Place réservée avant tout calcul (transaction synchrone, aucun await avant) : des demandes simultanées ne passent
    // jamais la limite de 3 par jour (G46).
    const file = `${crypto.randomBytes(16).toString('hex')}.zip`;
    const id = spaces.archives.reserve(a.invite.id, file, ARCHIVES_PER_DAY);
    if (!id) {
      sec('excess_rate_limit_exceeded', { request, reference: ref(request), emetteur: `${EMETTEUR} · archives`, detail: { limite: 'archives', par_jour: ARCHIVES_PER_DAY, portail: PORTAIL, acces: a.invite.id, espace: a.space.id, taille } });
      return pageHeaders(reply).redirect(`${back}?etat=archive-limite`, 303);
    }
    // Deux archives en écriture à la fois sur tout le site (rendus et disque) ; les autres attendent leur tour.
    if (building >= ARCHIVES_AT_ONCE) await new Promise(resolve => waiting.push(resolve)); else building += 1;
    let made;
    try {
      const list = spaces.items(a.space.id, { forGuests: true }).slice(0, ARCHIVE_MAX_PHOTOS);
      const entries = [];
      for (const p of list) entries.push({ name: `${String(p.n).padStart(3, '0')}-${fileName(p, taille)}`, path: await rendered(p, taille) });
      fs.mkdirSync(spaces.dirs.archives, { recursive: true, mode: 0o700 });
      // Écrite en flux, photo par photo ; 1 Gio au plus.
      made = await writeZip(path.join(spaces.dirs.archives, file), entries, { shouldStop: bytes => bytes > ARCHIVE_MAX_BYTES });
      spaces.archives.done(id, made.bytes, made.count, { taille, items: list.slice(0, made.count).map(p => ({ item: p.item_id, photo: p.id })) });
    } catch (err) {
      spaces.archives.drop(id);
      fs.rmSync(path.join(spaces.dirs.archives, file), { force: true });
      if (err?.code === RENDER_BUSY) return renderBusy(request, reply, a, taille);
      throw err;
    } finally { const next = waiting.shift(); if (next) next(); else building -= 1; }
    spaces.logEvent(a.space.id, a.invite.id, 'archive', { request, detail: `${made.count} photos` });
    sec('sensitive_export', { request, reference: ref(request), emetteur: `${EMETTEUR} · archive`, detail: { portail: PORTAIL, acces: a.invite.id, espace: a.space.id, nature: 'archive', photos: made.count, octets: made.bytes, taille } });
    return pageHeaders(reply).redirect(`${back}/archive/${id}`, 303);
  });
  app.get('/prive/:pid/archive/:n', async (request, reply) => {
    const a = resolve(request);
    if (!a || a.team) return deny(request, reply);
    const arch = /^\d{1,9}$/.test(request.params.n) ? spaces.archives.get(a.invite.id, Number(request.params.n)) : null;
    if (!arch) return notFound(request, reply, langOf(request, a));
    let manifest = null;
    try { manifest = arch.manifest ? JSON.parse(arch.manifest) : null; } catch { /* archive ancienne ou incomplète */ }
    const current = new Map(spaces.items(a.space.id, { forGuests: true }).map(p => [p.item_id, p.id]));
    const authorized = manifest && allowed(a.invite.rights, manifest.taille) && Array.isArray(manifest.items)
      && manifest.items.length === arch.photos && manifest.items.every(x => Number.isInteger(x?.item) && current.get(x.item) === x.photo);
    if (!authorized) return notFound(request, reply, langOf(request, a));
    const name = `${ascii(app.siteName()).replace(/\W+/g, '-').toLowerCase() || 'photos'}-${a.space.public_id}.zip`;
    return fileHeaders(reply, 'private, no-store').header('content-disposition', `attachment; filename="${name}"`).type('application/zip').send(fs.createReadStream(path.join(spaces.dirs.archives, arch.file)));
  });

  // ---------- favoris et sélection (G48, G50) ----------
  // Retour après un favori : la page d'où vient le formulaire (galerie, vue des favoris, photo), à l'ancre de la photo.
  const backTo = (request, a, n) => {
    const base = `/prive/${a.space.public_id}`;
    const r = String(request.body?.retour || '');
    if (r === 'favoris') return `${base}?vue=favoris#p${n}`;
    if (r === 'photo') return `${base}/photo/${n}`;
    return `${base}#p${n}`;
  };
  app.post('/prive/:pid/selection/terminer', async (request, reply) => {
    if (!guard(request, reply, 'selection')) return reply;
    const a = resolve(request, { write: true });
    if (!a || a.team) return deny(request, reply);
    if (!a.invite.rights.favoris) { impossible(request, 'favoris non ouverts', { formulaire: 'selection', acces: a.invite.id }); return notFound(request, reply); }
    spaces.sendSelection(a.invite);
    spaces.logEvent(a.space.id, a.invite.id, 'selection_envoyee', { request, detail: `${spaces.favorites(a.invite.id).length} favoris` });
    return pageHeaders(reply).redirect(`/prive/${a.space.public_id}?etat=envoye`, 303);
  });
  app.post('/prive/:pid/selection/reprendre', async (request, reply) => {
    if (!guard(request, reply, 'selection')) return reply;
    const a = resolve(request, { write: true });
    if (!a || a.team) return deny(request, reply);
    const ok = spaces.takeBack(a.invite);
    if (ok) spaces.logEvent(a.space.id, a.invite.id, 'selection_reprise', { request });
    return pageHeaders(reply).redirect(`/prive/${a.space.public_id}?etat=${ok ? 'repris' : 'figee'}`, 303);
  });
  app.post('/prive/:pid/selection/:n', async (request, reply) => {
    if (!guard(request, reply, 'favori')) return reply;
    const a = resolve(request, { write: true });
    if (!a || a.team) return deny(request, reply);
    if (!a.invite.rights.favoris) { impossible(request, 'favoris non ouverts', { formulaire: 'favori', acces: a.invite.id }); return notFound(request, reply); }
    const lang = langOf(request, a);
    const d = galleryData(request, a, lang);
    const p = nth(d, request.params.n);
    if (!p) { impossible(request, 'photo hors galerie', { formulaire: 'favori', acces: a.invite.id }); return notFound(request, reply, lang); }
    // Sélection vue par l'équipe : figée pour l'invité (il lui écrit) ; envoyée mais pas vue : la changer la reprend.
    if (a.invite.selection_seen_at && a.invite.selection_sent_at) return pageHeaders(reply).redirect(`/prive/${a.space.public_id}?etat=figee`, 303);
    if (a.invite.selection_sent_at) spaces.takeBack(a.invite);
    const on = spaces.toggleFavorite(a.invite, p.item_id);
    spaces.logEvent(a.space.id, a.invite.id, on ? 'favori' : 'favori_retire', { request, item: p.item_id });
    return pageHeaders(reply).redirect(backTo(request, a, p.n), 303);
  });

  // ---------- langue et départ (G29, G37) ----------
  app.post('/prive/:pid/langue', async (request, reply) => {
    if (!guard(request, reply, 'langue')) return reply;
    const a = resolve(request, { write: true });
    if (!a || a.team) return deny(request, reply);
    const lang = request.body?.lang;
    if (!LANGS.includes(lang)) impossible(request, 'langue inconnue', { formulaire: 'langue', valeur: String(lang ?? '').slice(0, 10) });
    else sessions.setLang(request.visitor, lang);
    const n = /^\d{1,4}$/.test(String(request.body?.photo || '')) ? Number(request.body.photo) : null;
    return pageHeaders(reply).redirect(n ? `/prive/${a.space.public_id}/photo/${n}` : `/prive/${a.space.public_id}`, 303);
  });
  // « Quitter » : les autorisations de la session sont retirées (pas la session), le jeton change, le cache du navigateur
  // est vidé (« cache », pas « cookies », qui effacerait aussi la session de l'admin et la langue).
  app.post('/prive/quitter', async (request, reply) => {
    if (!guard(request, reply, 'quitter')) return reply;
    const lang = request.visitor.lang || 'fr';
    const left = spaces.leave(request.visitor);
    for (const inv of left) spaces.logEvent(inv.space_id, inv.id, 'quitte', { request });
    const { token } = sessions.rotate(request.visitor, { raison: 'quitte', ctx: ctxOf(request) });
    setCookie(reply, token, false);
    reply.header('clear-site-data', '"cache"');
    const until = left.length ? Math.max(...left.map(i => i.expires_at)) : null;
    return message(reply, LANGS.includes(lang) ? lang : left[0]?.lang || 'fr', 'quitte', { until });
  });

  // Purges quotidiennes des sessions visiteur (expirées, jetons fermés depuis 48 h).
  app.decorate('purgeVisitors', () => sessions.purge());
}
