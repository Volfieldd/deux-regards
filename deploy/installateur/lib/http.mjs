// Client HTTP des API (Cloudflare, Zitadel) : JSON, délai borné, nouvel essai sur 429 et 5xx, erreurs lisibles qui ne
// contiennent jamais le jeton. En lecture seule (--essai), seules les lectures partent : GET, et les recherches de
// Zitadel (POST …/_search), qui ne changent rien.

export class ErreurApi extends Error {
  constructor(service, methode, chemin, statut, message) {
    super(`${service} : ${methode} ${chemin} → ${statut}${message ? ` (${message})` : ''}`);
    this.name = 'ErreurApi';
    Object.assign(this, { service, methode, chemin, statut, detail: message });
  }
}

export const estLecture = (methode, chemin) => methode === 'GET' || (methode === 'POST' && /\/_search$/.test(chemin.split('?')[0]));

// Message d'erreur de l'API, sous ses différentes formes (Cloudflare : errors[] ; Zitadel : message).
export function messageApi(corps) {
  if (!corps || typeof corps !== 'object') return typeof corps === 'string' ? corps.slice(0, 300) : '';
  if (Array.isArray(corps.errors) && corps.errors.length) return corps.errors.map(e => `${e.code ?? ''} ${e.message ?? ''}`.trim()).join(' ; ');
  return String(corps.message || corps.error_description || corps.error || '').slice(0, 300);
}

const attendre = ms => new Promise(r => setTimeout(r, ms));

export function creerClient({ service, base, jeton, fetch: f = globalThis.fetch, lectureSeule = false, delai = 20_000, pause = 1000, entetes = {} }) {
  const racine = base.replace(/\/+$/, '');
  async function requete(methode, chemin, corps, { absent404 = false } = {}) {
    if (lectureSeule && !estLecture(methode, chemin)) throw new Error(`essai : ${service} ${methode} ${chemin} non envoyé`);
    for (let essai = 0; ; essai++) {
      let rep;
      try {
        rep = await f(`${racine}${chemin}`, {
          method: methode,
          headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json', ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}), ...entetes },
          body: corps !== undefined ? JSON.stringify(corps) : undefined,
          signal: AbortSignal.timeout(delai),
        });
      } catch (err) {
        if (essai < 2) { await attendre(pause * (essai + 1)); continue; }
        throw new ErreurApi(service, methode, chemin, 'réseau', err.cause?.code || err.name || err.message);
      }
      if ((rep.status === 429 || rep.status >= 500) && essai < 2) { await attendre(pause * 2 ** essai); continue; }
      const texte = await rep.text();
      let json = null;
      try { json = texte ? JSON.parse(texte) : {}; } catch { json = texte; }
      if (rep.status === 404 && absent404) return null;
      if (!rep.ok) throw new ErreurApi(service, methode, chemin, rep.status, messageApi(json));
      // Cloudflare répond 200 avec success:false dans de rares cas.
      if (json && typeof json === 'object' && json.success === false) throw new ErreurApi(service, methode, chemin, rep.status, messageApi(json));
      return json;
    }
  }
  return {
    service,
    lectureSeule,
    get: (chemin, o) => requete('GET', chemin, undefined, o),
    post: (chemin, corps = {}, o) => requete('POST', chemin, corps, o),
    put: (chemin, corps = {}, o) => requete('PUT', chemin, corps, o),
    patch: (chemin, corps = {}, o) => requete('PATCH', chemin, corps, o),
    delete: (chemin, o) => requete('DELETE', chemin, undefined, o),
  };
}
