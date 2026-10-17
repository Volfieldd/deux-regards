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
const TRAPS = ['/.env', '/.git/config', '/.git/HEAD', '/wp-login.php', '/wp-admin', '/wp-admin/*', '/xmlrpc.php', '/phpmyadmin', '/phpmyadmin/*',
  '/server-status', '/.aws/credentials', '/config.php', '/.DS_Store', TRAP_PATH];
const ACCOUNT_TRIGGERS = ['account_changes_insert', 'account_changes_update', 'account_changes_delete'];
const METHODS = new Set(['GET', 'HEAD', 'POST']);
const SENSITIVE = /^\/admin\/(?:personnes|rencontres)\/:id(?:\/|$)/;
const NOT_FOUND_LIMIT = 20, NOT_FOUND_WINDOW = 10 * 60e3;

// Empreinte de la configuration de sécurité : ce qui, changé dans le .env, ouvre ou ferme une porte d'administration.
// Aucun secret n'y figure en clair (DATA_KEY : empreinte courte).
function configPrint(config) {
  const short = v => (v ? crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 12) : null);
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

const parseRoles = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };

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

  // Comptes et rôles (migration 048) : chaque changement noté par la base devient un événement ; ceux qui n'ont pas de
  // ticket de l'application sont critiques.
  if (settings.get('vigie_comptes_vus') == null) settings.set('vigie_comptes_vus', app.accounts.lastChangeId());
  const scanAccounts = () => {
    let last = Number(settings.get('vigie_comptes_vus')) || 0;
    for (;;) {
      const rows = app.accounts.changesSince(last);
      if (!rows.length) break;
      for (const r of rows) {
        const before = parseRoles(r.old_roles), after = parseRoles(r.new_roles);
        const adminGiven = after.includes('admin') && !before.includes('admin') && r.op !== 'DELETE';
        const outside = r.ticket_id == null;
        const type = r.op === 'INSERT' ? 'user_created' : r.op === 'DELETE' ? 'user_deleted' : /ADMIN_SUBS/.test(r.action || '') ? 'user_rescued' : 'privilege_permissions_changed';
        sec.emit(type, {
          severity: outside ? 'critique' : adminGiven ? 'haut' : undefined,
          sub: r.by_sub || undefined,
          emetteur: outside ? 'base de données · déclencheur (hors application)' : `server/accounts.js · ${r.action}`,
          reference: `account_changes#${r.id}`,
          detail: {
            compte: r.sub, operation: r.op, hors_application: outside, administrateur_donne: adminGiven, action: r.action || null,
            avant: r.op === 'INSERT' ? null : { roles: before, etat: r.old_status, photographe: r.old_author },
            apres: r.op === 'DELETE' ? null : { roles: after, etat: r.new_status, photographe: r.new_author },
            circuit: r.old_adjust !== r.new_adjust && r.op === 'UPDATE' ? { avant: r.old_adjust, apres: r.new_adjust } : undefined,
          },
        });
        last = r.id;
      }
      settings.set('vigie_comptes_vus', last);
    }
  };
  app.accounts.onChange(() => { try { scanAccounts(); } catch (err) { app.log.error({ err: err.message }, 'Vigie : comptes'); } });
  sec.every(60e3, scanAccounts);

  // État : administrateurs actifs, déclencheurs présents, schéma des comptes. Un déclencheur disparu est critique.
  const state = () => {
    const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").pluck().all();
    const missing = [...ACCOUNT_TRIGGERS, SESSION_TRIGGER].filter(n => !triggers.includes(n));
    const schema = db.prepare("SELECT group_concat(sql, ';') FROM (SELECT sql FROM sqlite_master WHERE tbl_name IN ('accounts', 'account_changes', 'account_change_tickets') ORDER BY name)").pluck().get() || '';
    const admins = app.accounts.list().filter(a => a.status === 'actif' && (a.roles.includes('admin') || a.locked)).map(a => a.sub).sort();
    sec.emit('sys_state', {
      severity: missing.length ? 'critique' : undefined,
      emetteur: 'server/securite · état',
      detail: { administrateurs: admins, comptes: app.accounts.list().length, declencheurs_absents: missing, schema: crypto.createHash('sha256').update(schema).digest('hex').slice(0, 16), dernier_changement: app.accounts.lastChangeId() },
    });
  };
  sec.every(5 * 60e3, state);
  sec.every(3600e3, purgeRevoked);

  // Déchiffrement impossible d'une donnée personnelle : clé changée, donnée altérée ou réinjectée.
  const offDecrypt = onDecryptFail(kind => sec.emitThrottled(`dechiffrement:${kind}`, 'crypto_decrypt_fail', { emetteur: 'server/vault.js', detail: { nature: kind } }));

  // Démarrage : version, configuration changée depuis le démarrage précédent, restauration de la base.
  app.addHook('onReady', async () => {
    const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    const print = configPrint(config);
    const before = settings.get('vigie_config');
    sec.emit('sys_startup', { emetteur: 'server/index.js', detail: { version: pkg.version, node: process.version, premiere_fois: !before } });
    const changes = before ? configDiff(before, print) : [];
    if (changes.length) sec.emit('sys_config_changed', { emetteur: 'server/securite · configuration', detail: { changements: changes } });
    settings.set('vigie_config', print);
    const restored = settings.get('restauree_le');
    if (restored && JSON.stringify(restored) !== JSON.stringify(settings.get('vigie_restauration_vue'))) {
      sec.emit('sys_restore', { emetteur: 'server/db/restore.js', detail: restored });
      settings.set('vigie_restauration_vue', restored);
    }
    purgeRevoked();
    scanAccounts();
    state();
    sec.start();
  });
  app.addHook('onClose', async () => { offDecrypt(); await sec.stop(); });

  // Méthode qu'aucune page du site n'utilise (PUT, DELETE, TRACE, OPTIONS…).
  // Crochets synchrones (done) : ils ne décalent pas ceux du site (journal d'audit écrit dans le même tour).
  app.addHook('onRequest', (request, reply, done) => {
    if (!METHODS.has(request.method)) sec.emit('input_validation_fail', { request, emetteur: 'server/securite · méthodes', detail: { raison: 'méthode inattendue', methode: request.method } });
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
      detail: { familles: [...new Set([...hits.map(h => h.famille), ...(tool ? ['outil'] : [])])], constats: hits.map(h => ({ famille: h.famille, champ: h.champ, extrait: h.extrait })) },
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

  // Pièges : chemins de scanners et lien caché des pages publiques (interdit par robots.txt, invisible, hors du clavier).
  for (const url of TRAPS) {
    app.route({ method: ['GET', 'HEAD', 'POST'], url, handler: async (request, reply) => {
      sec.emit('malicious_honeypot', { request, emetteur: 'server/securite · pièges', detail: { piege: url === TRAP_PATH ? 'lien caché' : 'chemin de scanner', chemin: request.routeOptions.url } });
      return reply.callNotFound();
    } });
  }

  // Connexion de test désactivée (en ligne) : personne de légitime ne la connaît.
  if (!config.localAuthToken) {
    app.route({ method: ['GET', 'POST'], url: '/auth/local', handler: async (request, reply) => {
      sec.emit('authn_local_attempt', { request, emetteur: 'server/auth.js · connexion de test' });
      return reply.callNotFound();
    } });
  }

  return sec;
}
