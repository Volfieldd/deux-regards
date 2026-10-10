// Suivi du traitement des photos envoyées une à une (page d'import) : les variantes sont rendues
// en arrière-plan, une photo après l'autre, et chaque étape est consultable (barre de progression).
// En mémoire seulement : après un redémarrage, le passage complet de démarrage rend ce qui manque.
const KEEP_MS = 30 * 60 * 1000;      // les états terminés restent consultables 30 min

export function createImportTracker({ render, onReady = () => {}, onFailed = () => {}, log }) {
  const jobs = new Map();            // id → { name, state: waiting|processing|ready|error, done, total, error, at }
  let queue = Promise.resolve();

  const prune = () => {
    const old = Date.now() - KEEP_MS;
    for (const [id, j] of jobs) if ((j.state === 'ready' || j.state === 'error') && j.at < old) jobs.delete(id);
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
          Object.assign(job, { state: 'error', error: 'image illisible ou format non pris en charge par le serveur', at: Date.now() });
          log?.warn({ err, photo: id, file: name }, 'rendu impossible à l’import');
          onFailed(id);
        }
      };
      return (queue = queue.then(run));
    },
    get: id => jobs.get(id) || null,
    // Photos en attente ou en cours de traitement.
    active: () => [...jobs.values()].filter(j => j.state === 'waiting' || j.state === 'processing').length,
    idle: () => queue,
  };
}
