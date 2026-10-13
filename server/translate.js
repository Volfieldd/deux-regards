// Propositions de traduction (admin) par un serveur LibreTranslate installé à côté du site (TRANSLATE_URL) :
// le texte ne quitte pas le réseau local, rien n'est payant. Une proposition remplit un champ que l'auteur relit et
// enregistre lui-même : jamais de traduction publiée automatiquement. Sans TRANSLATE_URL, le bouton n'apparaît pas.

const LANGS = ['fr', 'en', 'de'];
const MAX = 10000;

export class TranslateError extends Error {}

export function createTranslator({ url, apiKey = null, timeoutMs = 30000, fetchImpl = fetch, log } = {}) {
  const base = url ? url.replace(/\/+$/, '') : null;
  return {
    enabled: Boolean(base),
    async translate(text, source, target) {
      if (!base) throw new TranslateError('Traduction non configurée (TRANSLATE_URL).');
      if (!LANGS.includes(source) || !LANGS.includes(target) || source === target) throw new TranslateError('Langues inconnues.');
      const q = String(text || '').trim();
      if (!q) throw new TranslateError('Rien à traduire : remplissez d’abord le texte dans une autre langue.');
      if (q.length > MAX) throw new TranslateError(`Texte trop long (${MAX} caractères au plus).`);
      let res;
      try {
        res = await fetchImpl(`${base}/translate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q, source, target, format: 'text', ...(apiKey ? { api_key: apiKey } : {}) }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        log?.warn({ err: err.message }, 'traduction : serveur injoignable');
        throw new TranslateError(err.name === 'TimeoutError'
          ? 'Le traducteur met trop de temps à répondre (premier lancement : il charge ses modèles). Réessayez dans un instant.'
          : 'Traducteur injoignable : vérifiez que le conteneur LibreTranslate tourne.');
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.translatedText !== 'string') {
        log?.warn({ status: res.status, error: data.error }, 'traduction : refusée');
        throw new TranslateError(`Le traducteur a refusé la demande${data.error ? ` : ${String(data.error).slice(0, 200)}` : ''}.`);
      }
      return data.translatedText;
    },
  };
}
