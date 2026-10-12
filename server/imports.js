// Suivi du traitement des photos envoyées une à une (page d'import) : les variantes sont rendues
// en arrière-plan, IMPORT_CONCURRENCY photos à la fois (2 par défaut), et chaque étape est consultable
// (barre de progression). Un verrou par photo (variants.js) empêche deux rendus de la même photo.
// En mémoire seulement : après un redémarrage, le passage complet de démarrage rend ce qui manque.
const KEEP_MS = 30 * 60 * 1000;      // les états terminés restent consultables 30 min
export const IMPORT_CONCURRENCY = Math.min(Math.max(Math.round(Number(process.env.IMPORT_CONCURRENCY) || 2), 1), 8);

export function createImportTracker({ render, onReady = () => {}, onFailed = () => {}, log, concurrency = IMPORT_CONCURRENCY }) {
  const jobs = new Map();            // id → { name, state: waiting|processing|ready|error, done, total, error, at }
  const waiting = [];                // tâches en attente d'une place, dans l'ordre d'arrivée
  const running = new Set();         // promesses des rendus en cours
  let idleResolvers = [];

  const prune = () => {
    const old = Date.now() - KEEP_MS;
    for (const [id, j] of jobs) if ((j.state === 'ready' || j.state === 'error') && j.at < old) jobs.delete(id);
  };
  const settleIdle = () => {
    if (running.size || waiting.length) return;
    idleResolvers.forEach(r => r());
    idleResolvers = [];
  };
  // Lance les tâches en attente tant qu'il reste des places.
  const pump = () => {
    while (running.size < concurrency && waiting.length) {
      const { run, resolve } = waiting.shift();
      // Une erreur dans un rappel ne doit jamais bloquer les imports suivants.
      const p = run().catch(err => log?.error({ err }, 'suivi d’import'));
      running.add(p);
      p.then(() => { running.delete(p); resolve(); pump(); settleIdle(); });
    }
  };

  return {
    // Met la photo en file ; la promesse renvoyée se résout quand elle est prête (ou en échec).
    add(id, name) {
      prune();
      const job = { name, state: 'waiting', done: 0, total: 0, error: null, at: Date.now() };
      jobs.set(id, job);
      const run = async () => {
        job.state = 'processing';
        try {
          await render(id, (done, total) => { job.done = done; job.total = total; });
          Object.assign(job, { state: 'ready', at: Date.now() });
          onReady(id);
        } catch (err) {
          Object.assign(job, { state: 'error', error: 'images non calculées pour l’instant : la photo est gardée en brouillon, nouvel essai au prochain passage', at: Date.now() });
          log?.warn({ err, photo: id, file: name }, 'rendu impossible à l’import');
          onFailed(id);
        }
      };
      const done = new Promise(resolve => waiting.push({ run, resolve }));
      pump();
      return done;
    },
    get: id => jobs.get(id) || null,
    // Photos en attente ou en cours de traitement.
    active: () => [...jobs.values()].filter(j => j.state === 'waiting' || j.state === 'processing').length,
    idle: () => (running.size || waiting.length ? new Promise(r => idleResolvers.push(r)) : Promise.resolve()),
  };
}
