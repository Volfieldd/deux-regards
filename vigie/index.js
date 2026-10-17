import fs from 'node:fs';
import { loadVigieConfig } from './config.js';
import { openVigieDb, createStore } from './store.js';
import { createDecisions } from './decisions.js';
import { createIngest } from './ingest.js';
import { createZitadelReader } from './zitadel.js';
import { createEngine } from './moteur.js';
import { createSwitches } from './interrupteurs.js';

// Service de la Vigie : réception des événements du site, décisions signées, lecture de Zitadel, vérification de la
// chaîne et purge. La console (phase D) et les règles (phase C) viendront s'y ajouter.

export async function startVigie({ config, logger = true, fetchImpl, now = Date.now } = {}) {
  const db = openVigieDb(config.databasePath);
  const store = createStore({ db, logKey: config.logKey, retentionDays: config.retentionDays, now });
  const decisions = createDecisions({ store, privateKey: config.decisionsKey, now });
  const ingest = createIngest({ store, decisions, ingestKey: config.ingestKey, now, logger });
  const log = ingest.log;
  // Moteur d'entités (phase C1) : chaque événement écrit dans la base lui est remis.
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now, log });
  store.onAdded(rows => engine.process(rows));

  // Chaîne vérifiée au démarrage puis chaque jour, avant la purge ; rupture : critique. La tête de la chaîne est
  // écrite dans le journal du conteneur (hors de la base) : une fin de journal effacée se voit en la comparant.
  const check = () => {
    const r = store.verify();
    store.setting.set('chaine_verifiee', { at: now(), ...r });
    if (!r.ok) store.own('log_integrity_fail', { emetteur: 'vigie/store.js', detail: { ruptures: r.ruptures } });
    const h = store.head();
    log.info({ tete_chaine: { seq: h.seq, maillon: h.chain, mac: h.mac }, chaine_intacte: r.ok }, 'Vigie : tête de la chaîne');
    return r;
  };
  // Tâche quotidienne : depuis la dernière exécution enregistrée (un redémarrage ne la repousse pas).
  const daily = () => {
    const last = store.setting.get('derniere_purge', 0);
    if (now() - last < 24 * 3600e3) return;
    check();
    store.purge();
    engine.purge();
    store.setting.set('derniere_purge', now());
  };
  const safe = (name, fn) => () => { try { fn(); } catch (err) { log.error({ err: err.message }, `Vigie : ${name}`); } };
  let version = null;
  try { version = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version; } catch { /* inconnue */ }
  const first = check();
  store.own('vigie_demarrage', { emetteur: 'vigie/index.js', detail: { version, chaine: first.ok ? 'intacte' : 'rompue', zitadel: Boolean(config.zitadel) } });

  const timers = [
    setInterval(safe('purge', daily), 3600e3),
    setInterval(safe('décisions', () => decisions.watch()), 1000),           // décisions prises par la ligne de commande
    setInterval(safe('nonces', () => store.db.prepare('DELETE FROM nonces WHERE at < ?').run(now() - 10 * 60e3)), 60e3),
  ];
  setTimeout(safe('purge', daily), 60e3).unref();
  for (const t of timers) t.unref();
  const zitadel = config.zitadel ? createZitadelReader({ ...config.zitadel, store, log, fetchImpl, now }) : null;
  zitadel?.start(config.zitadel.intervalMs);

  await ingest.listen({ host: config.host, port: config.ingestPort });
  return {
    store, decisions, ingest, zitadel, engine, switches,
    async close() { for (const t of timers) clearInterval(t); zitadel?.stop(); await ingest.close(); db.close(); },
  };
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname); } catch { return false; } })();
if (isMain) {
  let config;
  try { config = loadVigieConfig(); } catch (err) { console.error(`Démarrage refusé : ${err.message}`); process.exit(1); }
  const vigie = await startVigie({ config });
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, async () => { await vigie.close(); process.exit(0); });
}
