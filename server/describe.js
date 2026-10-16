import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MAX_PIXELS } from './images.js';
import { MODELS, ModelError } from './describe-worker.js';

// Descriptions suggérées (R&D du 15 octobre 2026 : le plus fiable sur ce qu'il voit, et il ne nomme jamais personne).
// Florence-2 (Microsoft, licence MIT, version ONNX d'onnx-community), sur ce serveur : aucune image n'en sort.
// Désactivé par défaut. Une phrase courte et factuelle, en anglais (sortie du modèle), traduite par LibreTranslate
// si le site en a un. Les photos sans description sont décrites la nuit (heures réglables), dans un processus à part
// (server/describe-worker.js), sur un seul cœur : le site n'attend pas le calcul ; une photo demandée depuis sa fiche
// passe tout de suite. Le modèle n'est chargé que pendant le calcul. Jamais recopiée seule dans la légende : la fiche
// la propose, l'auteur choisit.
export { MODELS, ModelError };
// « Léger » par défaut : il tient dans la limite de mémoire par défaut du conteneur (3g) ; « Précis » demande
// SITE_MEM_LIMIT=6g (compose).
export const DEFAULTS = { on: false, model: 'base', from: 1, to: 6 };
// Réglage refusé, ou mémoire insuffisante au moment du calcul (la passe s'arrête alors comme pour un modèle absent).
export class DescribeError extends ModelError {}

// Mémoire dont dispose le processus : la limite du conteneur (cgroup v2, sinon v1), sinon la mémoire de la machine.
export function memoryLimit() {
  const read = f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; } };
  const v2 = read('/sys/fs/cgroup/memory.max');
  if (v2 && v2 !== 'max' && Number(v2) > 0) return Math.min(Number(v2), os.totalmem());
  const v1 = read('/sys/fs/cgroup/memory/memory.limit_in_bytes');
  if (v1 && Number(v1) > 0 && Number(v1) < os.totalmem()) return Number(v1);
  return os.totalmem();
}
// Un peu de marge : « 6g » dans compose vaut 6 Gio, à 5 % près selon les réglages.
export const fits = (key, limit) => limit >= MODELS[key].need * 0.95;
// Pourquoi un modèle ne tient pas : la machine elle-même (rien à régler dans le .env), ou la limite du conteneur.
const tooSmall = (key, limit) => {
  const gb = (limit / 2 ** 30).toFixed(1), need = MODELS[key].need / 2 ** 30, name = key === 'large' ? 'Précis' : 'Léger';
  return fits(key, os.totalmem())
    ? `Mémoire insuffisante pour « ${name} » : le site dispose de ${gb} Go, il en faut ${need}. Ajoutez SITE_MEM_LIMIT=${need}g au .env de la pile, puis Compose Up.`
    : `Mémoire insuffisante pour « ${name} » : la machine n’a que ${gb} Go, il en faut ${need}.`;
};
const IDLE_MS = 2 * 60 * 1000;
const WORKER = fileURLToPath(new URL('./describe-worker.js', import.meta.url));
// Demandes depuis les fiches en attente, au plus : au-delà, « réessayez dans quelques minutes ».
export const MAX_ASKED = 20;

// Le modèle réel : un processus à part (server/describe-worker.js), lancé au premier calcul, arrêté après IDLE_MS
// sans travail (toute sa mémoire est rendue), ou aussitôt pour « Éteindre ». Les tests le remplacent par un faux, ou
// remplacent le processus (worker, args). Un calcul qui dépasse timeoutMs (modèle prêt) arrête le processus.
export function createFlorence({ dir, threads = 1, log, worker = WORKER, args = ['calcul'], timeoutMs = 5 * 60 * 1000, idleMs = IDLE_MS }) {
  let child = null, idle = null, seq = 0, gen = 0;
  const pending = new Map();                     // n° de tâche → { resolve, reject, timer }
  // Arrêt du processus : les tâches en cours échouent avec la raison donnée (rien n'attend un processus mort).
  function stop(reason) {
    gen++;
    clearTimeout(idle);
    const c = child;
    child = null;
    if (c) { c.removeAllListeners(); c.kill('SIGKILL'); }
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new ModelError(reason)); }
    pending.clear();
  }
  function start() {
    if (child) return child;
    const c = fork(worker, args, { serialization: 'advanced', execArgv: [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    c.on('message', m => {
      if (m?.log) { log?.info({ model: m.model }, m.log); return; }
      const p = pending.get(m?.id);
      if (!p) return;
      if (m.phase === 'calcul') { p.timer = setTimeout(() => stop('le calcul a duré trop longtemps : processus arrêté'), timeoutMs); return; }
      pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.error) p.reject(m.model ? new ModelError(m.error) : new Error(m.error));
      else p.resolve(m.text);
      if (!pending.size) { c.unref(); c.channel?.unref(); idle = setTimeout(() => stop('inactif'), idleMs); idle.unref?.(); }
    });
    // Arrêté par le noyau (mémoire du conteneur) ou planté : la tâche échoue, le site continue.
    c.on('exit', (code, signal) => { if (child === c) stop(signal === 'SIGKILL' ? 'le calcul s’est arrêté : mémoire insuffisante ?' : `le calcul s’est arrêté (${signal || code})`); });
    c.on('error', err => { if (child === c) stop(`le calcul n’a pas démarré : ${err.message}`); });
    child = c;
    return c;
  }
  return {
    // Une phrase en anglais pour l'image (fichier ou tampon JPEG). Image illisible : erreur de la photo ; modèle ou
    // processus en échec : ModelError.
    async describe(input, key) {
      // Image réduite d'abord, ici (le modèle travaille en 768 px) : un original de 24 Mpx ne charge pas la mémoire.
      clearTimeout(idle);
      const g = gen;
      const jpeg = await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
      if (g !== gen) throw new ModelError('arrêt demandé');            // « Éteindre » pendant la réduction
      let c;
      try { c = start(); } catch (err) { throw new ModelError(`le calcul n’a pas démarré : ${err.message}`); }
      c.ref(); c.channel?.ref();
      return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject, timer: null });
        try { c.send({ id, jpeg, key, dir, threads }); } catch (err) { pending.delete(id); reject(new ModelError(`le calcul n’a pas démarré : ${err.message}`)); }
      });
    },
    // Libérer la mémoire tout de suite : le processus est arrêté, même en plein téléchargement ou en plein calcul.
    async unload() { stop('arrêt demandé'); },
    // Éteindre et effacer : le modèle est retiré du disque (fichiers partiels compris).
    async remove() { stop('arrêt demandé'); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

export function createDescriber({ db, storageDir, model, translator, log, now = () => Date.now(), memLimit = memoryLimit }) {
  // Une photo supprimée pendant son calcul : rien n'est écrit (pas d'erreur de clé étrangère qui arrêterait la passe).
  const q = {
    setting: db.prepare("SELECT value FROM settings WHERE key = 'describe'").pluck(),
    save: db.prepare("INSERT INTO settings (key, value) VALUES ('describe', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
    get: db.prepare('SELECT * FROM photo_descriptions WHERE photo_id = ?'),
    exists: db.prepare('SELECT 1 FROM photos WHERE id = ?').pluck(),
    // Redemander une photo déjà en attente ne la remet pas en fin de file.
    request: db.prepare(`INSERT INTO photo_descriptions (photo_id, requested_at) VALUES (?, ?)
      ON CONFLICT(photo_id) DO UPDATE SET requested_at = COALESCE(requested_at, excluded.requested_at), error = NULL`),
    store: db.prepare(`INSERT INTO photo_descriptions (photo_id, model, text_en, text_fr, text_de, requested_at, created_at, error)
      SELECT @id, @model, @en, @fr, @de, NULL, @at, NULL WHERE EXISTS (SELECT 1 FROM photos WHERE id = @id)
      ON CONFLICT(photo_id) DO UPDATE SET model = @model, text_en = @en, text_fr = @fr, text_de = @de, requested_at = NULL, created_at = @at, error = NULL`),
    fail: db.prepare(`INSERT INTO photo_descriptions (photo_id, requested_at, error) SELECT @id, NULL, @error WHERE EXISTS (SELECT 1 FROM photos WHERE id = @id)
      ON CONFLICT(photo_id) DO UPDATE SET requested_at = NULL, error = excluded.error`),
    // Demandées d'abord (la plus ancienne demande), puis, la nuit, celles qui n'ont jamais été décrites.
    requested: db.prepare('SELECT d.photo_id AS id, p.file, 1 AS asked FROM photo_descriptions d JOIN photos p ON p.id = d.photo_id WHERE d.requested_at IS NOT NULL ORDER BY d.requested_at LIMIT 1'),
    fresh: db.prepare('SELECT p.id, p.file, 0 AS asked FROM photos p LEFT JOIN photo_descriptions d ON d.photo_id = p.id WHERE d.photo_id IS NULL ORDER BY p.id LIMIT 1'),
    counts: db.prepare('SELECT (SELECT COUNT(*) FROM photos) AS total, (SELECT COUNT(*) FROM photo_descriptions WHERE text_en IS NOT NULL) AS done, (SELECT COUNT(*) FROM photo_descriptions WHERE requested_at IS NOT NULL) AS asked'),
    // Traductions manquées (traducteur arrêté ou lent cette nuit-là, ou configuré depuis) : reprises à chaque passe.
    untranslated: db.prepare("SELECT photo_id AS id, text_en, text_fr, text_de FROM photo_descriptions WHERE text_en IS NOT NULL AND text_en <> '' AND requested_at IS NULL AND (text_fr = '' OR text_de = '') ORDER BY photo_id LIMIT 20"),
    translated: db.prepare('UPDATE photo_descriptions SET text_fr = ?, text_de = ? WHERE photo_id = ? AND text_en = ?'),
  };
  const settings = () => { try { return { ...DEFAULTS, ...JSON.parse(q.setting.get() || '{}') }; } catch { return { ...DEFAULTS }; } };
  const hour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now()).find(p => p.type === 'hour').value);
  // Heures de nuit [from, to[ (heure de Paris), à cheval sur minuit si from > to.
  const night = (s = settings()) => { const h = hour(); return s.from <= s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to; };
  let running = null, lastError = null, closed = false;
  // Modèle réellement utilisé : « Précis » seulement si la mémoire du conteneur le permet (la limite a pu baisser
  // depuis le réglage) ; sinon « Léger », et la page Séries le dit ; null si même « Léger » ne tient pas.
  const effective = s => { const l = memLimit(); const k = s.model === 'large' && !fits('large', l) ? 'base' : s.model; return fits(k, l) ? k : null; };
  const translate = async (en, l) => {
    if (!translator?.enabled || !en) return '';
    try { return await translator.translate(en, 'en', l); } catch (err) { log?.warn({ err: err.message }, 'descriptions : traduction impossible'); return ''; }
  };

  // Une photo. Erreur de l'image : gardée sur la photo, la passe continue. Erreur du modèle (il ne se charge pas, son
  // processus s'arrête, mémoire insuffisante) : la passe s'arrête et la photo de la file de nuit n'est pas marquée
  // (elle sera reprise) ; une photo demandée garde l'erreur (sa fiche ne reste pas « en cours de calcul »).
  // Descriptions éteintes pendant le calcul (« Éteindre ») : rien n'est écrit.
  async function one(row, s) {
    try {
      const key = effective(s);
      if (!key) throw new DescribeError(tooSmall('base', memLimit()));
      const en = await model.describe(path.join(storageDir, 'originals', row.file), key);
      q.store.run({ id: row.id, model: MODELS[key].id, en, fr: await translate(en, 'fr'), de: await translate(en, 'de'), at: now() });
      lastError = null;
    } catch (err) {
      if (closed || !settings().on) return;
      const broken = err instanceof ModelError;
      lastError = err.message;
      if (!broken || row.asked) q.fail.run({ id: row.id, error: String(err.message).slice(0, 300) });
      log?.warn({ err: err.message, photo: row.id }, broken ? 'descriptions : modèle indisponible' : 'descriptions : photo non décrite');
      if (broken) throw err;
    }
  }
  // Une passe : les demandes, puis (la nuit seulement) les photos jamais décrites, une à la fois ; puis les traductions
  // manquées (au plus 20, arrêt au premier échec du traducteur).
  function run() {
    const s = settings();
    if (running || !s.on || closed) return running || Promise.resolve(0);
    running = (async () => {
      let n = 0;
      try {
        for (let row; !closed && settings().on && (row = q.requested.get() || (night() ? q.fresh.get() : null)); n++) await one(row, settings());
      } catch (err) {
        if (!(err instanceof ModelError)) throw err;                // modèle indisponible : nouvel essai à la passe suivante
      }
      if (translator?.enabled && !closed) {
        for (const r of q.untranslated.all()) {
          if (closed) break;
          try {
            const fr = r.text_fr || await translator.translate(r.text_en, 'en', 'fr'), de = r.text_de || await translator.translate(r.text_en, 'en', 'de');
            q.translated.run(fr, de, r.id, r.text_en);
          } catch (err) { log?.warn({ err: err.message }, 'descriptions : traduction impossible'); break; }
        }
      }
      return n;
    })().catch(err => { log?.error({ err }, 'descriptions'); return 0; }).finally(() => { running = null; });
    return running;
  }
  return {
    MODELS, settings, night,
    save(body) {
      const s = settings();
      const h = v => Math.min(23, Math.max(0, Number.parseInt(v, 10) || 0));
      // Modèle choisi explicitement, sinon celui réellement utilisé (un « Précis » enregistré qui ne tient plus
      // devient « Léger » : le formulaire n'est jamais bloqué par un ancien réglage).
      const asked = Object.hasOwn(MODELS, body.model) ? body.model : null;
      const next = { on: Boolean(body.on), model: asked || effective(s) || 'base', from: 'from' in body ? h(body.from) : s.from, to: 'to' in body ? h(body.to) : s.to };
      // Un modèle qui ne tient pas dans la mémoire du conteneur est refusé : il serait arrêté au premier calcul.
      if (next.on && !fits(next.model, memLimit())) throw new DescribeError(tooSmall(next.model, memLimit()));
      // De 3 h à 3 h : aucune heure de nuit, plus rien ne serait décrit sans qu'on le voie.
      if (next.on && next.from === next.to) throw new DescribeError('Heures de nuit : la fin doit être différente du début (par exemple de 1 h à 6 h).');
      q.save.run(JSON.stringify(next));
      if (!next.on) model.unload?.();
      return next;
    },
    // Demander la description d'une photo (fiche) : elle passe avant la file de nuit, tout de suite. null : photo
    // inconnue ; false : trop de demandes en attente (MAX_ASKED), réessayer plus tard.
    request(photoId) {
      if (!q.exists.get(photoId)) return null;
      if (!q.get.get(photoId)?.requested_at && q.counts.get().asked >= MAX_ASKED) return false;
      q.request.run(photoId, now());
      return run();
    },
    forPhoto(photoId, lang = 'fr') {
      const r = q.get.get(photoId);
      if (!r) return null;
      const text = (lang === 'fr' && r.text_fr) || (lang === 'de' && r.text_de) || r.text_en || '';
      return { text, en: r.text_en, translated: Boolean(r.text_en) && text !== r.text_en, pending: r.requested_at != null, error: r.error, at: r.created_at };
    },
    state() { const c = q.counts.get(), s = settings(), limit = memLimit(); return { ...s, ...c, busy: Boolean(running), error: lastError, night: night(), memory: limit, fits: Object.fromEntries(Object.keys(MODELS).map(k => [k, fits(k, limit)])), hostFits: Object.fromEntries(Object.keys(MODELS).map(k => [k, fits(k, os.totalmem())])), effective: effective(s) }; },
    run,
    idle: () => running || Promise.resolve(0),
    // Au démarrage : les photos en échec (sans description) sont reprises une fois ; une photo déjà décrite dont le
    // nouvel essai a échoué garde sa description.
    retryFailed: () => db.prepare('DELETE FROM photo_descriptions WHERE text_en IS NULL AND requested_at IS NULL').run().changes,
    // Arrêt du site : le processus de calcul s'arrête avec lui.
    close: () => { closed = true; return model.unload?.(); },
    async remove() { q.save.run(JSON.stringify({ ...settings(), on: false })); await model.remove?.(); },
  };
}
