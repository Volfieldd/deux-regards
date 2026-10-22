import fs from 'node:fs';
import { loadVigieConfig } from './config.js';
import { openVigieDb, createStore } from './store.js';
import { createDecisions } from './decisions.js';
import { createIngest } from './ingest.js';
import { createZitadelReader } from './zitadel.js';
import { createEngine } from './moteur.js';
import { createThreats } from './menaces.js';
import { createVeille } from './veille.js';
import { checkRoles } from './controle-roles.js';
import { createSwitches } from './interrupteurs.js';
import { createEdge } from './bordure.js';
import { createCfList } from './cloudflare-liste.js';
import { createUrgence } from './cloudflare-urgence.js';
import { createReseau } from './reseau.js';
import { createNotifier } from './notifications.js';
import { createConsole } from './console/server.js';
import { canoniserReseaux } from './reseaux.js';

// Service de la Vigie : réception des événements du site, décisions signées, lecture de Zitadel, vérification de la
// chaîne et purge, moteur de règles, notifications, console (phase D3, facultative).

export async function startVigie({ config, logger = true, fetchImpl, now = Date.now } = {}) {
  const db = openVigieDb(config.databasePath);
  const store = createStore({ db, logKey: config.logKey, retentionDays: config.retentionDays, now });
  const decisions = createDecisions({ store, privateKey: config.decisionsKey, now });
  // engine est défini plus bas : le résumé n'est demandé qu'une fois le service démarré.
  const ingest = createIngest({ store, decisions, ingestKey: config.ingestKey, now, logger, summary: () => engine.summary(), consoleUrl: config.notifications?.consoleUrl });
  const log = ingest.log;
  // Clés de réseau IPv6 mal calculées avant l'audit D3-C4 (entités, liens, alertes ; jamais le journal chaîné) : réécrites une fois.
  const reseaux = canoniserReseaux(store, { now });
  if (reseaux && (reseaux.entites || reseaux.fusions || reseaux.liens || reseaux.alertes)) log.info({ reseaux }, 'Vigie : clés de réseau IPv6 réécrites');
  // Moteur d'entités (phase C1) : chaque événement écrit dans la base lui est remis, par une file (la réception répond
  // sans attendre l'analyse).
  const switches = createSwitches({ store, now });
  const threats = createThreats({ store, fetchImpl, now, log, enabled: config.threatLists });
  const veille = createVeille({ store, fetchImpl, now });
  const engine = createEngine({ store, decisions, switches, threats, now, log });
  store.onAdded(() => engine.enqueue());
  // Notifications (phase D) : Signal, e-mail en secours ; alertes hautes et critiques hors observation.
  const notifier = createNotifier({ store, engine, switches, config: config.notifications || {}, fetchImpl, now, log });
  engine.enqueue();                                  // reprise : événements reçus mais pas encore analysés

  // Chaîne vérifiée au démarrage puis chaque jour, avant la purge ; rupture : critique. La tête de la chaîne est
  // écrite dans le journal du conteneur (hors de la base) : une fin de journal effacée se voit en la comparant.
  // Au démarrage d'une traite (rien d'autre ne tourne encore) ; chaque jour, par paquets (la réception continue).
  const record = r => {
    store.setting.set('chaine_verifiee', { at: now(), ...r });
    if (!r.ok) store.own('log_integrity_fail', { emetteur: 'vigie/store.js', detail: { ruptures: r.ruptures } });
    const h = store.head();
    log.info({ tete_chaine: { seq: h.seq, maillon: h.chain, mac: h.mac }, chaine_intacte: r.ok }, 'Vigie : tête de la chaîne');
    return r;
  };
  const check = () => record(store.verify());
  // Vérification par paquets (tâche quotidienne, bouton « Vérifier la chaîne » de la console) : une seule à la fois ; qui
  // la demande pendant qu'elle tourne attend la même et reçoit le même résultat, noté une fois (audit D3-D9 : des clics
  // répétés empilaient les vérifications, chacune relisant toute la base).
  let verification = null;
  const verifyShared = () => (verification ??= (async () => {
    try { return record(await store.verifyAsync()); } finally { verification = null; }
  })());
  // Tâche quotidienne : depuis la dernière exécution enregistrée (un redémarrage ne la repousse pas).
  let dailyRunning = false;
  const daily = async () => {
    const last = store.setting.get('derniere_purge', 0);
    if (dailyRunning || now() - last < 24 * 3600e3) return;
    dailyRunning = true;
    try {
      await verifyShared();
      store.purge();
      engine.purge();
      store.setting.set('derniere_purge', now());
    } catch (err) { log.error({ err: err.message }, 'Vigie : tâche quotidienne'); } finally { dailyRunning = false; }
  };
  // Une tâche minutée qui échoue est notée, sans arrêter le service : erreur levée, ou promesse rejetée d'une fonction
  // asynchrone (audit D3-D16).
  const safe = (name, fn) => () => {
    const note = err => log.error({ err: err?.message ?? String(err) }, `Vigie : ${name}`);
    try { const r = fn(); if (r && typeof r.then === 'function') r.catch(note); } catch (err) { note(err); }
  };
  // Minuteries de démarrage (une seule fois) : gardées pour que close() les annule (audit D3-D16).
  const delais = [];
  const plusTard = (fn, ms) => { const h = setTimeout(fn, ms); h.unref(); delais.push(h); };
  let version = null;
  try { version = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version; } catch { /* inconnue */ }
  const first = check();
  store.own('vigie_demarrage', { emetteur: 'vigie/index.js', detail: { version, chaine: first.ok ? 'intacte' : 'rompue', zitadel: Boolean(config.zitadel) } });

  const timers = [
    setInterval(safe('purge', daily), 3600e3),
    setInterval(safe('décisions', () => decisions.watch()), 1000),           // décisions prises par la ligne de commande
    setInterval(safe('nonces', () => store.db.prepare('DELETE FROM nonces WHERE at < ?').run(now() - 10 * 60e3)), 60e3),
  ];
  plusTard(safe('purge', daily), 60e3);
  plusTard(safe('veille des bibliothèques', veille.actualiser), 60e3);
  timers.push(setInterval(safe('veille des bibliothèques', veille.actualiser), 3600e3));
  // Site silencieux et fenêtres de corrélation échues : chaque minute ; détecteurs périodiques : chaque heure ; listes de menaces : chaque jour (première après 2 min) ;
  // contrôle des rôles : à chaque nouvelle sauvegarde du site (vérifié chaque heure).
  timers.push(setInterval(safe('détecteurs', () => { engine.tick(); engine.enqueue(); notifier.tick().catch(() => {}); }), 60e3));   // enqueue : écrits de la ligne de commande
  const refreshThreats = () => { if (config.threatLists) threats.update().catch(err => log.warn({ err: err.message }, 'Vigie : listes de menaces')); };
  plusTard(refreshThreats, 120e3);
  timers.push(setInterval(refreshThreats, 24 * 3600e3));
  // Contrôle des rôles : une minute après le démarrage (les administrateurs protégés en dépendent), puis chaque heure.
  const roles = safe('contrôle des rôles', () => checkRoles({ store, siteBackupDir: config.siteBackupDir, now }));
  plusTard(roles, 60e3);
  timers.push(setInterval(roles, 3600e3));
  for (const t of timers) t.unref();
  // Bordure Cloudflare (phase C3) : blocages copiés dans KV, lecture d'Analytics Engine chaque minute.
  const { liste: listeName, ...bordureCfg } = config.bordure || {};
  const edge = config.bordure ? createEdge({ store, decisions, ...bordureCfg, fetchImpl, now, log }) : null;
  // Liste d'adresses bloquées chez Cloudflare (phase E3, facultative).
  const cfList = config.bordure && listeName ? createCfList({ store, decisions, accountId: bordureCfg.accountId, tokenFile: bordureCfg.tokenFile, name: listeName, fetchImpl, now, log }) : null;
  cfList?.start();
  // Mode urgence de Cloudflare (facultatif) : fin vérifiée chaque minute.
  const urgence = config.urgence ? createUrgence({ store, ...config.urgence, fetchImpl, now, log }) : null;
  urgence?.start();
  if (edge) {
    plusTard(() => { edge.push({ force: true }).catch(() => {}); }, 5e3);
    timers.push(setInterval(() => { edge.read().catch(err => log.warn({ err: err.message }, 'Vigie : bordure')); edge.push().catch(() => {}); }, 60e3));
    timers.at(-1).unref();
  }
  // Source « réseau » (phase E4) : journaux du mandataire de sortie et des rejets de l'hôte, lus chaque minute.
  const reseau = config.reseau ? createReseau({ store, ...config.reseau, now, log }) : null;
  if (reseau) {
    const lireReseau = safe('réseau', () => reseau.lire());
    plusTard(lireReseau, 30e3);
    timers.push(setInterval(lireReseau, 60e3));
    timers.at(-1).unref();
  }
  const zitadel = config.zitadel ? createZitadelReader({ ...config.zitadel, store, log, fetchImpl, now }) : null;
  zitadel?.start(config.zitadel.intervalMs);

  // Console (phase D3) : son propre port, sur le réseau du tunnel ; la réception reste sur le réseau interne.
  const consoleApp = config.console ? createConsole({ config: config.console, store, engine, switches, decisions, zitadel, logger, fetchImpl, now,
    notifications: config.notifications || {}, edge, urgence, veille, siteBackupDir: config.siteBackupDir, verifyChain: verifyShared }) : null;

  await ingest.listen({ host: config.host, port: config.ingestPort });
  // La console est facultative : si elle ne peut pas écouter (adresse absente du conteneur, port pris), la réception, le
  // moteur et les décisions continuent ; l'échec est écrit dans le journal du conteneur et ouvre une alerte haute
  // (audit D3-D7 : avant, le service entier quittait et redémarrait en boucle).
  let consoleUp = false;
  if (consoleApp) {
    try { await consoleApp.app.listen({ host: config.console.host, port: config.console.port }); consoleUp = true; } catch (err) {
      log.error({ err: err.message, host: config.console.host, port: config.console.port }, 'Vigie : console indisponible (la réception continue)');
      store.own('vigie_console_indisponible', { emetteur: 'vigie/index.js', detail: { erreur: String(err.code || err.message).slice(0, 120), adresse: `${config.console.host}:${config.console.port}` } });
    }
  }
  return {
    store, decisions, ingest, zitadel, engine, switches, threats, veille, edge, cfList, urgence, reseau, notifier, console: consoleApp, consoleUp, verifyChain: verifyShared,
    async close() { for (const t of timers) clearInterval(t); for (const t of delais) clearTimeout(t); zitadel?.stop(); edge?.stop(); cfList?.stop(); urgence?.stop(); await veille.close(); await consoleApp?.close().catch(() => {}); await ingest.close(); await engine.drain(); db.close(); },
  };
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname); } catch { return false; } })();
if (isMain) {
  let config;
  try { config = loadVigieConfig(); } catch (err) { console.error(`Démarrage refusé : ${err.message}`); process.exit(1); }
  const vigie = await startVigie({ config });
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, async () => { await vigie.close(); process.exit(0); });
}
