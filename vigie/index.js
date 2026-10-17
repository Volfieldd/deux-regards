import fs from 'node:fs';
import { loadVigieConfig } from './config.js';
import { openVigieDb, createStore } from './store.js';
import { createDecisions } from './decisions.js';
import { createIngest } from './ingest.js';
import { createZitadelReader } from './zitadel.js';

// Service de la Vigie : réception des événements du site, décisions signées, lecture de Zitadel, vérification de la
// chaîne et purge. La console (phase D) et les règles (phase C) viendront s'y ajouter.

export async function startVigie({ config, logger = true, fetchImpl, now = Date.now } = {}) {
  const db = openVigieDb(config.databasePath);
  const store = createStore({ db, logKey: config.logKey, now });
  const decisions = createDecisions({ store, privateKey: config.decisionsKey, now });
  const ingest = createIngest({ store, decisions, ingestKey: config.ingestKey, now, logger });
  const log = ingest.log;

  // Chaîne vérifiée au démarrage puis chaque nuit ; rupture : critique.
  const check = () => {
    const r = store.verify();
    store.setting.set('chaine_verifiee', { at: now(), ...r });
    if (!r.ok) store.own('log_integrity_fail', { emetteur: 'vigie/store.js', detail: r.rupture });
    return r;
  };
  let version = null;
  try { version = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version; } catch { /* inconnue */ }
  const first = check();
  store.own('vigie_demarrage', { emetteur: 'vigie/index.js', detail: { version, chaine: first.ok ? 'intacte' : 'rompue', zitadel: Boolean(config.zitadel) } });

  const timers = [
    setInterval(() => { try { store.purge(config.retentionDays); check(); } catch (err) { log.error({ err: err.message }, 'Vigie : purge'); } }, 24 * 3600e3),
    setInterval(() => decisions.watch(), 1000),                     // décisions prises par la ligne de commande
    setInterval(() => store.db.prepare('DELETE FROM nonces WHERE at < ?').run(now() - 10 * 60e3), 60e3),
  ];
  for (const t of timers) t.unref();
  const zitadel = config.zitadel ? createZitadelReader({ ...config.zitadel, store, log, fetchImpl, now }) : null;
  zitadel?.start(config.zitadel.intervalMs);

  await ingest.listen({ host: config.host, port: config.ingestPort });
  return {
    store, decisions, ingest, zitadel,
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
