import crypto from 'node:crypto';
import fs from 'node:fs';
import { createSecurite } from './index.js';
import { createDecisionsClient } from './decisions.js';
import { createPublicTexts } from './textes-publics.js';
import { scanObject, isAttackTool } from './detection.js';
import { onDecryptFail, compterDechiffrements } from '../vault.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { clientKey } from '../ratelimit.js';
import { TRAP_PATH } from './piege.js';
import { settingsOf, SESSION_TRIGGER } from './retrait.js';
import { createEdgeVerifier } from './bordure.js';
import { validDesignSettings } from '../designs.js';

// Branchement de la Vigie sur le site (seulement quand VIGIE_URL est réglé ; sans elle, retireVigie() efface ce qu'elle
// avait laissé). Points d'émission communs à tout le site : saisies, pièges, méthodes inattendues, rafales de 404,
// lectures sensibles, comptes et rôles, configuration, restauration, déchiffrement. Les points propres à une route
// (connexion, sessions, CSRF, limites de débit, jetons) appellent app.securite.emit() là où ils se produisent.

// Chemins que cherchent les scanners : le site n'en a aucun (Cloudflare les bloque aussi, règle R3 ; ce qui passe est
// signalé ici).
// Reconnus au chemin, sans route : la réponse reste exactement la 404 du site (pas de 415 ni de 400 d'un analyseur de
// corps, qui trahiraient le piège).
const TRAPS = new Set(['/.env', '/.git/config', '/.git/HEAD', '/wp-login.php', '/wp-admin', '/xmlrpc.php', '/phpmyadmin',
  '/server-status', '/.aws/credentials', '/config.php', '/.DS_Store', TRAP_PATH]);
const TRAP_PREFIXES = ['/wp-admin/', '/phpmyadmin/', '/.git/'];
// Déclencheurs dont dépend la détection des comptes (migrations 048 et 049) : un absent ou modifié est critique.
const ACCOUNT_TRIGGERS = ['account_changes_insert', 'account_changes_update', 'account_changes_delete', 'account_changes_immuable',
  'account_changes_conserve', 'account_change_tickets_immuable', 'account_change_tickets_conserve'];
const METHODS = new Set(['GET', 'HEAD', 'POST']);
const SENSITIVE = /^\/admin\/(personnes|rencontres)\/:id(?:\/|$)/;
// Objet de la fiche lue ou exportée (registre des briques, BV-30) : lectures_massives compte le couple objet et numéro,
// la personne 12 et la rencontre 12 sont deux fiches. Les autres exports (originaux, sélections des galeries) : aucun.
const OBJETS = { personnes: 'personne', rencontres: 'rencontre' };
const objetOf = route => OBJETS[SENSITIVE.exec(route)?.[1]];
// BV-33 : les routes résolues seulement, jamais l'URL ni les filtres saisis. Les galeries précisent dans leur
// gestionnaire quelles vues lisent les données d'un invité ; les autres vues n'émettent pas de lecture.
const LISTES = { '/admin/personnes': 'personne', '/admin/rencontres': 'rencontre', '/admin/comptes': 'compte', '/admin/rencontres/cartes/planche': 'carte' };
const CLASSEES = /^\/admin\/(?:messages\/:id$|galeries\/:id(?:\/|$))/;
const NOT_FOUND_LIMIT = 20, NOT_FOUND_WINDOW = 10 * 60e3;

// Chemin comme le voit le routeur : gabarit de la route trouvée, sinon chemin décodé et normalisé (« /%61dmin »,
// « //admin » sont « /admin »). Jamais l'adresse brute pour une décision de sécurité.
export function routeKey(request) {
  const pattern = request.routeOptions?.url;
  if (pattern) return pattern;
  let p = String(request.url).split('?')[0];
  try { p = decodeURIComponent(p); } catch { /* laissé tel quel */ }
  return p.replace(/\/{2,}/g, '/');
}

// Empreinte de la configuration de sécurité : ce qui, changé dans le .env, ouvre ou ferme une porte d'administration.
// Aucun secret n'y figure en clair (DATA_KEY : empreinte HMAC courte, clé dérivée de COOKIE_SECRET).
function configPrint(config) {
  const short = v => (v ? crypto.createHmac('sha256', `vigie-config:${config.cookieSecret}`).update(String(v)).digest('hex').slice(0, 12) : null);
  return {
    ADMIN_SUBS: [...(config.adminSubs || [])].sort(),
    OIDC_ALLOWED_SUBS: [...(config.oidc?.allowedSubs || [])].sort(),
    OIDC_ORG_ID: config.oidc?.orgId || null,
    OIDC_PROJECT_ID: config.oidc?.projectId || null,
    OIDC_ISSUER: config.oidc?.issuer || null,
    OIDC_ADMIN_ROLE: config.oidc?.adminRole || null,
    TRUST_PROXY: config.trustProxy === false ? false : String(config.trustProxy),
    DATA_KEY: short(config.dataKey),
    LOCAL_AUTH_TOKEN: Boolean(config.localAuthToken),
  };
}
function configDiff(before, after) {
  const changes = [];
  for (const k of Object.keys(after)) {
    const a = before?.[k], b = after[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (Array.isArray(b)) changes.push({ cle: k, ajoutes: b.filter(x => !(a || []).includes(x)), retires: (a || []).filter(x => !b.includes(x)) });
    else if (k === 'DATA_KEY') changes.push({ cle: k, changement: !a ? 'ajoutée' : !b ? 'retirée' : 'changée' });
    else changes.push({ cle: k, avant: a ?? null, apres: b });
  }
  return changes;
}

// Rôles d'une ligne du journal : une valeur écrite à la main peut être n'importe quoi.
const parseRoles = v => { try { const r = JSON.parse(v || '[]'); return Array.isArray(r) ? r.map(String) : []; } catch { return []; } };

export function installVigie(app, { config, db, send = null, timers = true, decisionsFetch, pollDecisions = true, externalSources = () => [], textesNow = Date.now }) {
  const settings = settingsOf(db);
  const sec = createSecurite({ url: config.vigie.url, key: config.vigie.ingestKey, storageDir: config.storageDir, log: app.log, send, timers });
  app.decorate('securite', sec);
  // BV-20/21 : fermer le geste sous son auteur avant une attente externe, même si un autre compte répond entre-temps.
  // Une instance par application ; la référence reçoit la session après le crochet d’authentification.
  const publications = new AsyncLocalStorage();
  app.addHook('onRequest', (request, reply, done) => {
    if (['GET', 'HEAD'].includes(request.method)) return done();
    publications.run(request, done);
  });
  app.decorateRequest('vigieLecture', null);
  app.addHook('onRequest', (request, reply, done) => {
    const route = request.routeOptions?.url || '';
    if (!['GET', 'HEAD'].includes(request.method) || !(SENSITIVE.test(route) || LISTES[route] || CLASSEES.test(route) || request.routeOptions?.config?.audit)) return done();
    const c = { actif: true, nombre: 0, octets: null, detail: null };
    request.vigieLecture = c;
    compterDechiffrements(c, done);
  });
  const mesurer = (request, reply, payload, done) => {
    const c = request.vigieLecture;
    // Les fiches, listes, images et ZIP personnels sont des chaînes ou des tampons. Une taille de flux inconnue
    // reste absente : Content-Length n'est pas une preuve des octets transmis. HEAD ne livre aucun corps.
    if (c) c.octets = request.method === 'HEAD' ? 0 : typeof payload === 'string' ? Buffer.byteLength(payload) : Buffer.isBuffer(payload) ? payload.length : null;
    done(null, payload);
  };
  // Crochet de route, après ceux de l'application et de ses plugins : la typographie peut encore modifier le HTML
  // dans onSend. Mesurer avant elle sous-compterait le corps réellement préparé (test de parité admin v1/v2).
  app.addHook('onRoute', options => {
    const route = options.url;
    if (SENSITIVE.test(route) || LISTES[route] || CLASSEES.test(route) || options.config?.audit) options.onSend = [...(options.onSend ? [].concat(options.onSend) : []), mesurer];
  });
  app.addHook('onRequestAbort', (request, done) => { if (request.vigieLecture) request.vigieLecture.actif = false; done(); });
  // Décisions de la Vigie (blocages, révocations, gels, verrouillage), lues et appliquées par le site.
  const decisions = createDecisionsClient({ url: config.vigie.url, key: config.vigie.ingestKey, pubkey: config.vigie.decisionsPubkey, storageDir: config.storageDir,
    log: app.log, apply: config.vigie.apply, adminSubs: config.adminSubs || [], spaces: () => app.spaces, ...(decisionsFetch ? { fetchImpl: decisionsFetch } : {}) });
  app.decorate('decisions', decisions);
  if (!config.vigie.apply) app.log.warn('VIGIE_APPLIQUER=0 : les décisions de la Vigie ne sont pas appliquées');

  // Sessions fermées ou expirées : empreinte, compte et dates, 48 h (un cookie qui revient après a été copié).
  // Posé de nouveau à chaque démarrage (sa définition suit le code).
  db.exec(`DROP TRIGGER IF EXISTS ${SESSION_TRIGGER}; CREATE TRIGGER ${SESSION_TRIGGER} AFTER DELETE ON sessions BEGIN
    INSERT OR REPLACE INTO sessions_revoked (id, sub, created_at, expires_at, revoked_at, ctx_net, ctx_ua, ctx_fp, ctx_asn, ctx_tls, ctx_tls_brut)
    VALUES (OLD.id, OLD.sub, OLD.created_at, OLD.expires_at, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), OLD.ctx_net, OLD.ctx_ua, OLD.ctx_fp, OLD.ctx_asn, OLD.ctx_tls, OLD.ctx_tls_brut);
  END`);
  const purgeRevoked = () => db.prepare('DELETE FROM sessions_revoked WHERE revoked_at < ?').run(Date.now() - 48 * 3600e3);

  // Comptes et rôles (migrations 048 et 049) : chaque changement noté par la base devient un événement ; ceux qui n'ont
  // pas de ticket signé de l'application sont critiques.
  if (settings.get('vigie_comptes_vus') == null) settings.set('vigie_comptes_vus', app.accounts.lastChangeId());
  const scanAccounts = () => {
    let last = Number(settings.get('vigie_comptes_vus')) || 0;
    // Numéros revenus en arrière (base restaurée ou journal vidé) : on repart du début plutôt que de sauter des lignes.
    if (app.accounts.lastChangeId() < last) last = 0;
    let found = false;
    for (;;) {
      const rows = app.accounts.changesSince(last);
      if (!rows.length) break;
      found = true;
      for (const r of rows) {
        const before = parseRoles(r.old_roles), after = parseRoles(r.new_roles);
        const admin = (roles, status) => roles.includes('admin') && status === 'actif';
        const adminGiven = r.op !== 'DELETE' && admin(after, r.new_status) && !(r.op === 'UPDATE' && admin(before, r.old_status));
        const valid = app.accounts.ticketValid(r);
        const outside = valid === false;
        const forged = r.ticket_id != null && valid === false;
        const type = r.op === 'INSERT' ? 'user_created' : r.op === 'DELETE' ? 'user_deleted' : /ADMIN_SUBS/.test(r.action || '') ? 'user_rescued' : 'privilege_permissions_changed';
        sec.emit(type, {
          severity: outside ? 'critique' : adminGiven ? 'haut' : undefined,
          sub: r.by_sub || undefined,
          emetteur: outside ? 'base de données · déclencheur (hors application)' : `server/accounts.js · ${r.action}`,
          reference: `account_changes#${r.id}`,
          detail: {
            compte: r.sub, ancien_sub: r.old_sub || undefined, champs: r.champs || undefined, operation: r.op, hors_application: outside,
            ticket_falsifie: forged || undefined, administrateur_donne: adminGiven, action: outside ? null : r.action || null,
            avant: r.op === 'INSERT' ? null : { roles: before, etat: r.old_status, photographe: r.old_author },
            apres: r.op === 'DELETE' ? null : { roles: after, etat: r.new_status, photographe: r.new_author },
            circuit: r.old_adjust !== r.new_adjust && r.op === 'UPDATE' ? { avant: r.old_adjust, apres: r.new_adjust } : undefined,
          },
        });
        last = r.id;
        settings.set('vigie_comptes_vus', last);
      }
    }
    if (found) state();
  };
  app.accounts.onChange(() => { try { scanAccounts(); } catch (err) { app.log.error({ err: err.message }, 'Vigie : comptes'); } });
  sec.every(60e3, scanAccounts);

  // État : administrateurs actifs, déclencheurs présents, schéma des comptes. Un déclencheur disparu est critique.
  // Le texte de chaque déclencheur est comparé à celui d'origine (retenu au premier démarrage avec la Vigie) : un
  // déclencheur vidé de son effet sous le même nom est signalé comme un absent.
  const triggerSql = () => Object.fromEntries(db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").all().map(t => [t.name, crypto.createHash('sha256').update(t.sql || '').digest('hex').slice(0, 16)]));
  // Référence des déclencheurs : retenue au premier démarrage, et de nouveau après une migration (le code les a changés).
  const lastMigration = () => db.prepare('SELECT MAX(name) FROM migrations').pluck().get() || '';
  const baseline = () => {
    const ref = settings.get('vigie_declencheurs');
    if (ref?.migration === lastMigration() && ref.sql) return ref;
    const fresh = { migration: lastMigration(), sql: triggerSql() };
    settings.set('vigie_declencheurs', fresh);
    return fresh;
  };
  const state = () => {
    const triggers = triggerSql();
    const known = baseline().sql;
    const watched = [...ACCOUNT_TRIGGERS, SESSION_TRIGGER];
    const missing = watched.filter(n => !triggers[n]);
    // Texte comparé pour les déclencheurs des migrations ; celui des sessions, reposé à chaque démarrage, est seulement
    // attendu présent.
    const altered = ACCOUNT_TRIGGERS.filter(n => triggers[n] && known[n] && known[n] !== triggers[n]);
    const openTickets = db.prepare('SELECT COUNT(*) FROM account_change_tickets WHERE open = 1').pluck().get();
    const schema = db.prepare("SELECT group_concat(sql, ';') FROM (SELECT sql FROM sqlite_master WHERE tbl_name IN ('accounts', 'account_changes', 'account_change_tickets') ORDER BY name)").pluck().get() || '';
    const admins = app.accounts.list().filter(a => a.status === 'actif' && (a.roles.includes('admin') || a.locked)).map(a => a.sub).sort();
    sec.emit('sys_state', {
      severity: missing.length || altered.length || openTickets ? 'critique' : undefined,
      emetteur: 'server/securite · état',
      detail: { decisions: decisions.state ? { version: decisions.state.version, ...decisions.state.counts, appliquees: config.vigie.apply } : null, administrateurs: admins, comptes: app.accounts.list().length, declencheurs_absents: missing, declencheurs_modifies: altered, tickets_ouverts: openTickets, schema: crypto.createHash('sha256').update(schema).digest('hex').slice(0, 16), dernier_changement: app.accounts.lastChangeId() },
    });
  };
  sec.every(5 * 60e3, state);
  sec.every(3600e3, purgeRevoked);

  // Déchiffrement impossible d'une donnée personnelle : clé changée, donnée altérée ou réinjectée.
  const offDecrypt = onDecryptFail(kind => sec.emitThrottled(`dechiffrement:${kind}`, 'crypto_decrypt_fail', { emetteur: 'server/vault.js', detail: { nature: kind } }));

  // Démarrage : version, configuration changée depuis le démarrage précédent, restauration de la base.
  // Rien de la Vigie n'empêche le site de démarrer : chaque étape est protégée.
  const step = (name, fn) => { try { fn(); } catch (err) { app.log.error({ err: err.message }, `Vigie : ${name}`); } };
  app.addHook('onReady', async () => {
    step('démarrage', () => {
      let version = null;
      try { version = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version; } catch { /* inconnue */ }
      const print = configPrint(config);
      const before = settings.get('vigie_config');
      sec.emit('sys_startup', { emetteur: 'server/index.js', detail: { version, node: process.version, premiere_fois: !before } });
      const changes = before ? configDiff(before, print) : [];
      if (changes.length) sec.emit('sys_config_changed', { emetteur: 'server/securite · configuration', detail: { changements: changes } });
      settings.set('vigie_config', print);
      // Restauration : signalée une fois ; à la toute première mise en route de la Vigie, une ancienne restauration sert
      // de point de départ (rien à signaler).
      const restored = settings.get('restauree_le');
      if (!before && restored) settings.set('vigie_restauration_vue', restored);
      else if (restored && JSON.stringify(restored) !== JSON.stringify(settings.get('vigie_restauration_vue'))) {
        sec.emit('sys_restore', { emetteur: 'server/db/restore.js', detail: restored });
        settings.set('vigie_restauration_vue', restored);
      }
      baseline();
    });
    step('sessions fermées', purgeRevoked);
    step('comptes', scanAccounts);
    step('état', state);
    sec.start();
    if (pollDecisions) decisions.start();
  });
  app.addHook('onClose', async () => { decisions.stop(); offDecrypt(); await sec.stop(); });

  // Bordure (phase C3) : en-têtes signés du Worker Cloudflare, crus seulement vérifiés (server/securite/bordure.js).
  // Des en-têtes faux sont signalés (une fois par minute et par raison) : quelqu'un les fabrique, ou la clé du Worker
  // n'est pas celle du site.
  const verifyEdge = config.vigie.bordureKey ? createEdgeVerifier({ key: config.vigie.bordureKey }) : null;
  app.decorateRequest('bordure', null);
  if (verifyEdge) {
    app.addHook('onRequest', (request, reply, done) => {
      try {
        const r = verifyEdge(request);
        // Une fois par minute, par raison et par réseau : le bruit d'un visiteur ne masque pas une vraie désynchronisation.
        if (r?.invalide) sec.emitThrottled(`bordure:${r.invalide}:${String(request.ip).slice(0, 48)}`, 'edge_signature_invalid', { request, emetteur: 'server/securite/bordure.js', detail: { raison: r.invalide } });
        request.bordure = r && !r.invalide ? r : null;
      } catch (err) { app.log.error({ err: err.message }, 'Vigie : bordure'); }
      done();
    });
  }

  // Méthode qu'aucune page du site n'utilise (PUT, DELETE, TRACE, OPTIONS…).
  // Crochets synchrones (done) : ils ne décalent pas ceux du site (journal d'audit écrit dans le même tour).
  // Pièges reconnus au chemin (chemins de scanners, lien caché interdit par robots.txt) et connexion de test sollicitée
  // alors qu'elle est désactivée : signalés ici, la requête suit son cours (404 du site, aucune limite consommée).
  // Adresse bloquée par la Vigie : 403 sobre, avant tout le reste (aucune page, aucun indice).
  app.addHook('onRequest', (request, reply, done) => {
    let scope = null;
    try { scope = decisions.blocked(request.ip, routeKey(request)); } catch (err) { app.log.error({ err: err.message }, 'Vigie : blocage'); }
    if (!scope) return done();
    sec.emit('authz_blocked', { request, emetteur: 'server/securite/decisions.js · blocage', detail: { raison: 'adresse bloquée', portee: scope } });
    reply.code(403).header('cache-control', 'no-store').type('text/plain; charset=utf-8').send('Accès refusé.');
  });
  // Admin verrouillée : seuls les comptes et adresses listés y entrent (la connexion est vérifiée dans auth.js).
  app.addHook('preHandler', (request, reply, done) => {
    if (!request.session || !/^\/admin(?:[/?#]|$)/.test(routeKey(request)) || decisions.lockAllows(request.session.sub, request.ip) !== false) return done();
    sec.emit('authz_blocked', { request, emetteur: 'server/securite/decisions.js · verrouillage', detail: { raison: 'administration verrouillée' } });
    reply.code(403).header('cache-control', 'no-store').type('text/plain; charset=utf-8').send('Administration verrouillée.');
  });
  app.addHook('onRequest', (request, reply, done) => {
    try {
      if (!METHODS.has(request.method)) sec.emit('input_validation_fail', { request, emetteur: 'server/securite · méthodes', detail: { raison: 'méthode inattendue', methode: request.method } });
      const p = String(request.url).split('?')[0];
      if (TRAPS.has(p) || TRAP_PREFIXES.some(x => p.startsWith(x))) {
        sec.emit('malicious_honeypot', { request, emetteur: 'server/securite · pièges', detail: { piege: p === TRAP_PATH ? 'lien caché' : 'chemin de scanner', chemin: p.slice(0, 80) } });
      } else if (p === '/auth/local' && !config.localAuthToken) {
        sec.emit('authn_local_attempt', { request, emetteur: 'server/auth.js · connexion de test' });
      }
    } catch (err) { app.log.error({ err: err.message }, 'Vigie : requête'); }
    done();
  });

  // Saisies malveillantes (chemin, paramètres, formulaire, navigateur, provenance) : une tentative, signalée même si le
  // site la refuse ou l'échappe. Depuis une session de l'admin : « haut » (compte volé, ou essai à savoir).
  app.addHook('preValidation', (request, reply, done) => {
    try { scanInputs(request); } catch (err) { app.log.error({ err: err.message }, 'Vigie : saisies'); }
    done();
  });
  const scanInputs = request => {
    const ua = request.headers['user-agent'];
    const hits = [
      ...scanObject('params', request.params),
      ...scanObject('query', request.query),
      // Corps rendu et contrôlé ailleurs (billet des Carnets : aperçu, brouillon ; option de route vigie.corps = 'rendu') :
      // pas scanné comme une saisie brute (le rendu émet ses propres constats, BV-12). Adresse et en-têtes, si.
      ...(request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body) && request.routeOptions?.config?.vigie?.corps !== 'rendu' ? scanObject('body', request.body) : []),
      ...scanObject('header', { 'user-agent': ua, referer: request.headers.referer }),
    ].slice(0, 5);
    const tool = isAttackTool(ua);
    if (!hits.length && !tool) return;
    sec.emit('malicious_input', {
      request,
      // Compte connecté : « haut » pour une saisie dans l'adresse ou le navigateur (fabriquée à la main), « bas » dans un
      // formulaire (gardé pour l'enquête, sans alerte : un texte de l'admin ne doit pas fatiguer la vigilance).
      severity: !request.session ? undefined : hits.length && hits.every(h => h.champ.startsWith('body.')) && !tool ? 'bas' : 'haut',
      composant: request.url.startsWith('/admin') || request.url.startsWith('/auth/') ? 'site · admin' : 'site · public',
      emetteur: 'server/securite · saisies',
      // Extrait seulement pour le chemin, l'adresse et le navigateur : un formulaire (message de /bonjour, fiche d'une
      // personne) peut contenir des données personnelles, chiffrées ailleurs ; on n'en garde que le champ et la longueur.
      detail: { familles: [...new Set([...hits.map(h => h.famille), ...(tool ? ['outil'] : [])])], constats: hits.map(h => ({ famille: h.famille, champ: h.champ, ...(h.champ.startsWith('body.') ? { longueur: h.longueur } : { extrait: h.extrait }) })) },
    });
  };

  // Ce qu'un compte fait une fois entré (registre des briques, docs/etudes/vigie-besoins-des-briques.md, BV-1 et BV-2) :
  // un seul point d'émission, après chaque écriture d'un compte de l'admin, qui compare à l'état d'avant
  //   - les réglages qui changent ce que voient tous les visiteurs ou qui servent de point de contact (version du site
  //     public, mentions légales, contacts des droits et de la confidentialité, accroche, ouvertures du bureau et du téléphone,
  //     thème, EXIF) :
  //     config_public_changed, « moyen » si un contact ou le directeur de la publication change (une adresse remplacée
  //     sert à hameçonner les personnes qui exercent leurs droits) ; valeurs seulement pour les réglages sans donnée
  //     personnelle ;
  //   - ce qui rend publics le lieu et l'heure d'une personne (photos à l'heure visible, EXIF complet avec le GPS) :
  //     privacy_exposure_changed.
  // Quelle que soit la route (aucun emit à ajouter route par route) ; ce qui change hors de l'admin (ligne de commande)
  // est vu à l'écriture suivante.
  const WATCHED = /^(public_design|public_version|site_name|tagline(_en|_de)?|hero(_tel)?|saison_accueil|theme|exif|rights_contact|privacy_contact|carnet_contact|privacy_mfa|privacy_encrypted|legal_[a-z_]+)$/;
  const CONTACT = new Set(['rights_contact', 'privacy_contact', 'carnet_contact', 'legal_email', 'legal_phone', 'legal_address', 'legal_names', 'legal_director']);
  const PLAIN = new Set(['public_design', 'public_version', 'saison_accueil', 'theme', 'exif', 'privacy_mfa', 'privacy_encrypted', 'legal_host']);
  const settingsRows = db.prepare('SELECT key, value FROM settings');
  const shownTimes = db.prepare('SELECT COUNT(*) FROM photos WHERE show_time = 1').pluck();
  const parseJson = v => { try { return JSON.parse(v); } catch { return v; } };
  const exifMode = v => parseJson(v)?.mode ?? null;
  // Identifiants connus uniquement : jamais de contenu arbitraire écrit directement en base.
  // Aplatir les rubriques garde le détail dans la profondeur bornée des événements de la Vigie.
  const publicValue = (key, raw) => {
    if (key === 'exif') return exifMode(raw);
    const value = parseJson(raw) ?? null;
    if (key !== 'public_design' || value === null) return value;
    return validDesignSettings(value) ? { default: value.default, ...value.sections } : 'invalide';
  };
  const snapshot = () => ({ settings: Object.fromEntries(settingsRows.all().filter(r => WATCHED.test(r.key)).map(r => [r.key, r.value])), heure: shownTimes.get() });
  let lastSnapshot = null;
  // Textes publiés (BV-20, BV-21) : instantané comparé comme les réglages. Liens vers le site lui-même exclus.
  const ownHosts = [...new Set(['nicephos.art', (() => { try { return new URL(config.publicUrl).hostname.replace(/^www\./, ''); } catch { return null; } })()].filter(Boolean))];
  const textes = createPublicTexts({ db, ownHosts, externalSources });
  let lastTexts = null;
  let lastTextsAt = null;
  // Rien d'écrit dans la base depuis l'instantané précédent (compteur de SQLite pour cette connexion) : rien à relire.
  const totalChanges = db.prepare('SELECT total_changes()').pluck();
  let lastChanges = -1;
  const emitTextChanges = (before, after, request, emetteur) => {
    const { changes, ajouts, phases } = textes.diff(before, after);
    for (const phase of phases) sec.emit('config_public_changed', { request, emetteur: `${emetteur} · expositions`, detail: { objet: 'exposition', ...phase } });
    if (!changes.length) return;
    // BV-20 : un texte qui gagne un lien, un e-mail ou un téléphone ; ni le texte ni le contact, 10 au plus par geste.
    for (const a of ajouts.slice(0, 10)) {
      sec.emit('config_public_changed', { request, severity: 'moyen', emetteur: `${emetteur} · textes publiés`,
        detail: { objet: 'texte_public', champ: a.champ, id: a.id, photo_id: a.photo_id, ajout: a.ajout, domaine: a.domaine || undefined } });
    }
    // BV-21 : combien de textes publiés ce geste a changés (défacement : beaucoup, d'un coup ou en série).
    sec.emit('config_public_changed', { request, emetteur: `${emetteur} · textes publiés`,
      // « textes » et non « nombre » : la Vigie lit detail.nombre comme le poids d'un résumé (corrélations, points), un
      // geste qui traduit 4 textes compterait pour 5 (faux positif trouvé par le jeu d'attaques, E2).
      detail: { objet: 'textes_publics', textes: changes.length, champs: [...new Set(changes.map(k => k.split('#')[0]))].slice(0, 20), contacts_ajoutes: ajouts.length || undefined } });
  };
  const watchTexts = (request, emetteur) => {
    const changesNow = totalChanges.get(), at = textesNow();
    if (!Number.isSafeInteger(at) || at < 0) throw new TypeError('Horloge des textes publics invalide.');
    if (!lastTexts) { lastTexts = textes.snapshot({ now: at }); lastTextsAt = at; lastChanges = changesNow; return; }
    if (changesNow !== lastChanges) {
      // Rejouer la visibilité au dernier instant connu isole les vraies modifications du geste. Une clôture survenue
      // pendant un traitement lent ne lui est pas imputée : le second diff appartient au calendrier, sans compte.
      const after = textes.snapshot({ now: lastTextsAt });
      emitTextChanges(lastTexts, after, request, emetteur);
      lastTexts = after; lastChanges = changesNow;
    }
    const after = textes.refreshExternal(lastTexts, { now: at });
    emitTextChanges(lastTexts, after, null, 'publication programmée');
    lastTexts = after; lastTextsAt = at;
  };
  // Aussi appelé par les publications programmées (sans compte : request null, sub null), qui mettent des textes en
  // ligne sans écriture de l'admin (photos du circuit ; billets des Carnets à leur arrivée).
  sec.watchPublication = (emetteur = 'publication programmée') => { try { watchTexts(null, emetteur); } catch (err) { app.log.error({ err: err.message }, 'Vigie : textes publiés'); } };
  // Rattraper les échéances avant un geste authentifié, même entre deux passages de la minuterie. Ni les GET ni les
  // fichiers statiques ne paient la projection et les vérifications de variantes des expositions.
  app.addHook('preHandler', (request, reply, done) => {
    if (request.session && !['GET', 'HEAD'].includes(request.method)) sec.watchPublication();
    done();
  });

  const watchWrites = request => {
    watchTexts(request, 'server/securite');
    const now = snapshot();
    const before = lastSnapshot;
    lastSnapshot = now;
    if (!before) return;
    const keys = [...new Set([...Object.keys(now.settings), ...Object.keys(before.settings)])].filter(k => now.settings[k] !== before.settings[k]).sort();
    if (keys.length) {
      const contact = keys.some(k => CONTACT.has(k));
      const valeurs = Object.fromEntries(keys.filter(k => PLAIN.has(k)).map(k => [k, { avant: publicValue(k, before.settings[k]), apres: publicValue(k, now.settings[k]) }]));
      sec.emit('config_public_changed', { request, severity: contact ? 'moyen' : undefined, emetteur: 'server/securite · réglages publics', detail: { cles: keys.slice(0, 30), contact_change: contact, valeurs } });
    }
    const exifAll = exifMode(now.settings.exif) === 'all' && exifMode(before.settings.exif) !== 'all';
    const more = now.heure - before.heure;
    if (more > 0 || exifAll) {
      sec.emit('privacy_exposure_changed', { request, severity: exifAll ? 'moyen' : undefined, emetteur: 'server/securite · données exposées', detail: { heure_visible_ajoutees: Math.max(more, 0), heure_visible_total: now.heure, exif_complet: exifAll || undefined } });
    }
  };
  // Les services de publication appellent ce point après persistance et avant leur première suspension. Le calendrier
  // impose le contexte système, y compris si une tâche programmée est appelée depuis un contexte asynchrone hérité.
  sec.observePublication = ({ scheduled = false } = {}) => {
    const request = scheduled ? null : publications.getStore();
    try {
      if (request?.session) watchWrites(request);
      else watchTexts(null, 'publication programmée');
    } catch (err) { app.log.error({ err: err.message }, 'Vigie : observation de publication'); }
  };
  app.addHook('onReady', async () => { step('réglages publics', () => { lastSnapshot = snapshot(); lastTextsAt = textesNow(); lastTexts = textes.snapshot({ now: lastTextsAt }); lastChanges = totalChanges.get(); }); });

  // Rafales de 404 par adresse (exploration), lectures sensibles de l'admin.
  const notFound = new Map();
  app.addHook('onResponse', (request, reply, done) => {
    if (request.vigieLecture) request.vigieLecture.actif = false;
    try { afterResponse(request, reply); } catch (err) { app.log.error({ err: err.message }, 'Vigie : réponse'); }
    done();
  });
  const afterResponse = (request, reply) => {
    const status = reply.statusCode;
    if (status === 404) {
      const k = clientKey(request.ip);
      const t = Date.now();
      let e = notFound.get(k);
      if (!e || t - e.start > NOT_FOUND_WINDOW) {
        if (notFound.size >= 10_000) notFound.delete(notFound.keys().next().value);
        e = { start: t, count: 0, told: false };
        notFound.set(k, e);
      }
      e.count += 1;
      if (e.count >= NOT_FOUND_LIMIT && !e.told) {
        e.told = true;
        sec.emit('malicious_excess_404', { request, status, emetteur: 'server/securite · 404', detail: { pages_introuvables: e.count, fenetre_min: NOT_FOUND_WINDOW / 60e3 } });
      }
    }
    // Écriture d'un compte de l'admin : réglages publics et données exposées comparés à l'état d'avant (BV-1, BV-2).
    if (request.session && request.method !== 'GET' && request.method !== 'HEAD') { watchWrites(request); return; }
    if (!request.session || status >= 300 || request.method !== 'GET') return;
    const route = request.routeOptions?.url || '';
    const c = request.vigieLecture;
    // Les gestionnaires fournissent des catégories et des effectifs seulement après leurs contrôles d'accès.
    // Le volume désigne le corps préparé pour une réponse réussie, sans les en-têtes ni garantie de réception.
    const detail = { cible: route, objet: objetOf(route) || LISTES[route], id: request.params?.id ?? null, ...c?.detail,
      ...(c ? { dechiffrements: c.nombre, ...(c.octets != null ? { octets_servis: c.octets } : {}) } : {}) };
    if (request.routeOptions?.config?.audit) sec.emit('sensitive_export', { request, status, emetteur: 'server/routes · lecture sensible', detail });
    else if (SENSITIVE.test(route) || LISTES[route] || c?.detail) sec.emit('sensitive_read', { request, status, emetteur: 'server/routes · lecture sensible', detail });
  };

  return sec;
}
