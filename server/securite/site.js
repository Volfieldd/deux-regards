import crypto from 'node:crypto';
import fs from 'node:fs';
import { createSecurite } from './index.js';
import { scanObject, isAttackTool } from './detection.js';
import { onDecryptFail } from '../vault.js';
import { clientKey } from '../ratelimit.js';
import { TRAP_PATH } from './piege.js';
import { settingsOf, SESSION_TRIGGER } from './retrait.js';

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
const SENSITIVE = /^\/admin\/(?:personnes|rencontres)\/:id(?:\/|$)/;
const NOT_FOUND_LIMIT = 20, NOT_FOUND_WINDOW = 10 * 60e3;

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

export function installVigie(app, { config, db, send = null, timers = true }) {
  const settings = settingsOf(db);
  const sec = createSecurite({ url: config.vigie.url, key: config.vigie.ingestKey, storageDir: config.storageDir, log: app.log, send, timers });
  app.decorate('securite', sec);

  // Sessions fermées ou expirées : empreinte, compte et dates, 48 h (un cookie qui revient après a été copié).
  db.exec(`CREATE TRIGGER IF NOT EXISTS ${SESSION_TRIGGER} AFTER DELETE ON sessions BEGIN
    INSERT OR REPLACE INTO sessions_revoked (id, sub, created_at, expires_at, revoked_at, ctx_net, ctx_ua)
    VALUES (OLD.id, OLD.sub, OLD.created_at, OLD.expires_at, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), OLD.ctx_net, OLD.ctx_ua);
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
  const state = () => {
    const triggers = triggerSql();
    const known = settings.get('vigie_declencheurs') || {};
    const watched = [...ACCOUNT_TRIGGERS, SESSION_TRIGGER];
    const missing = watched.filter(n => !triggers[n]);
    const altered = watched.filter(n => triggers[n] && known[n] && known[n] !== triggers[n]);
    const openTickets = db.prepare('SELECT COUNT(*) FROM account_change_tickets WHERE open = 1').pluck().get();
    const schema = db.prepare("SELECT group_concat(sql, ';') FROM (SELECT sql FROM sqlite_master WHERE tbl_name IN ('accounts', 'account_changes', 'account_change_tickets') ORDER BY name)").pluck().get() || '';
    const admins = app.accounts.list().filter(a => a.status === 'actif' && (a.roles.includes('admin') || a.locked)).map(a => a.sub).sort();
    sec.emit('sys_state', {
      severity: missing.length || altered.length || openTickets ? 'critique' : undefined,
      emetteur: 'server/securite · état',
      detail: { administrateurs: admins, comptes: app.accounts.list().length, declencheurs_absents: missing, declencheurs_modifies: altered, tickets_ouverts: openTickets, schema: crypto.createHash('sha256').update(schema).digest('hex').slice(0, 16), dernier_changement: app.accounts.lastChangeId() },
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
      if (!settings.get('vigie_declencheurs')) settings.set('vigie_declencheurs', triggerSql());
    });
    step('sessions fermées', purgeRevoked);
    step('comptes', scanAccounts);
    step('état', state);
    sec.start();
  });
  app.addHook('onClose', async () => { offDecrypt(); await sec.stop(); });

  // Méthode qu'aucune page du site n'utilise (PUT, DELETE, TRACE, OPTIONS…).
  // Crochets synchrones (done) : ils ne décalent pas ceux du site (journal d'audit écrit dans le même tour).
  // Pièges reconnus au chemin (chemins de scanners, lien caché interdit par robots.txt) et connexion de test sollicitée
  // alors qu'elle est désactivée : signalés ici, la requête suit son cours (404 du site, aucune limite consommée).
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
      ...(request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body) ? scanObject('body', request.body) : []),
      ...scanObject('header', { 'user-agent': ua, referer: request.headers.referer }),
    ].slice(0, 5);
    const tool = isAttackTool(ua);
    if (!hits.length && !tool) return;
    sec.emit('malicious_input', {
      request,
      severity: request.session ? 'haut' : undefined,
      composant: request.url.startsWith('/admin') || request.url.startsWith('/auth/') ? 'site · admin' : 'site · public',
      emetteur: 'server/securite · saisies',
      // Extrait seulement pour le chemin, l'adresse et le navigateur : un formulaire (message de /bonjour, fiche d'une
      // personne) peut contenir des données personnelles, chiffrées ailleurs ; on n'en garde que le champ et la longueur.
      detail: { familles: [...new Set([...hits.map(h => h.famille), ...(tool ? ['outil'] : [])])], constats: hits.map(h => ({ famille: h.famille, champ: h.champ, ...(h.champ.startsWith('body.') ? { longueur: h.longueur } : { extrait: h.extrait }) })) },
    });
  };

  // Rafales de 404 par adresse (exploration), lectures sensibles de l'admin.
  const notFound = new Map();
  app.addHook('onResponse', (request, reply, done) => {
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
    if (!request.session || status >= 300 || (request.method !== 'GET' && request.method !== 'HEAD')) return;
    const route = request.routeOptions?.url || '';
    if (request.routeOptions?.config?.audit) sec.emit('sensitive_export', { request, status, emetteur: 'server/routes · lecture sensible', detail: { cible: route, id: request.params?.id ?? null } });
    else if (SENSITIVE.test(route)) sec.emit('sensitive_read', { request, status, emetteur: 'server/routes · lecture sensible', detail: { cible: route, id: request.params?.id ?? null } });
  };

  return sec;
}
