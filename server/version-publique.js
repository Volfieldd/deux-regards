import fs from 'node:fs';
import path from 'node:path';

// Site public en trois versions, côte à côte : v1 (les gabarits de views/), v2 (ceux de views/v2/, la refonte issue de
// l'audit d'ergonomie du 16 oct. 2026) et v3 (les gabarits v2, redessinés : css/v3/v3.css, accueil en plein cadre,
// views/v3/ ; maquettes de docs/maquettes-v3/). Le réglage « Site public » (Réglages → Apparence) choisit la version de
// tous les visiteurs ; v1 par défaut. Une page qui n'a pas encore de gabarit v2 s'affiche en v1 (repli automatique), en
// v2 comme en v3 : la v3 n'a pas de page à elle, seulement un autre dessin des pages v2.
//
// Vue de la session : un administrateur (permission site.apparence) peut voir le site public dans une autre version que
// celle des visiteurs, d'un clic sur un bouton « Voir en v1 / v2 / v3 » des pages publiques (server/vue-site.js) : aucune
// vue (il suit le réglage, comme les visiteurs), ou « v1 », « v2 », « v3 » (forcée pour lui). La vue est gardée ici, en
// mémoire, pour sa session (l'empreinte de son jeton) : ni cookie, ni paramètre d'adresse, rien que le navigateur puisse
// fabriquer. Elle tombe avec la session (déconnexion, expiration, droit retiré) et au redémarrage du serveur. C'est une
// préférence d'affichage de la session, pas un réglage du site : les visiteurs voient toujours le réglage.
// Toute réponse publique faite à une session (bouton, jeton CSRF, vue forcée) est « private, no-store » (voir app.js) :
// rien de ce que voit un administrateur ne peut entrer dans un cache partagé (Cloudflare) et être servi à un visiteur.
export const VERSIONS = ['v1', 'v2', 'v3'];
// La v2 et la v3 servent les mêmes pages (gabarits de views/v2/) : Carnets, menu, repli sur la v1, tout ce qui dépend de
// « la refonte » vaut pour les deux.
export const usesV2 = v => v === 'v2' || v === 'v3';
const KEY = 'public_version';
const PERM = 'site.apparence';
const MAX_VIEWS = 64;                      // borne de la mémoire : au-delà, les plus anciennes vues sont oubliées
// Pages qui n'existent qu'en v2 (galeries privées, MQ-16 et MQ-17) : de nouvelles pages, hors menu, sans gabarit v1 ;
// servies en v2 quel que soit le réglage (un invité s'en sert même si le site est en v1). La v1 reste figée : aucun de
// ses gabarits n'est touché, et une page v1 n'est jamais servie en v2 par ce biais (préfixe « prive- » seulement).
export const ONLY_V2 = /^prive-[a-z]+$/;

export function createPublicVersion({ db, viewsDir, cache = false }) {
  const read = db.prepare('SELECT value FROM settings WHERE key = ?').pluck();
  const write = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const views = new Map();                   // empreinte du jeton de session → { vue: 'v1' | 'v2' | 'v3', expires }
  const known = new Map();                   // gabarit → existe-t-il en v2 ? (gardé en production seulement)
  const knownV1 = new Map();                 // gabarit → existe-t-il en v1 ?

  const setting = () => {
    let v = null;
    try { v = JSON.parse(read.get(KEY) ?? 'null'); } catch { v = null; }
    return VERSIONS.includes(v) ? v : 'v1';
  };

  // Cette requête peut-elle changer de vue ? Session valide et droit d'apparence, relu à chaque requête.
  const canSwitch = request => Boolean(request.session?.id && request.can?.(PERM));

  // Vue posée pour cette session (« v1 », « v2 », « v3 »), ou null : aucune, échue, ou droit retiré.
  const viewOf = request => {
    const s = request.session;
    if (!s?.id || !views.has(s.id)) return null;
    const v = views.get(s.id);
    if (v.expires <= Date.now()) { views.delete(s.id); return null; }
    return request.can?.(PERM) ? v.vue : null;
  };

  return {
    setting,
    save(v) { if (!VERSIONS.includes(v)) return false; write.run(KEY, JSON.stringify(v)); return true; },
    canSwitch,
    viewOf,
    // La session voit-elle une autre version que les visiteurs ?
    forcedOn: request => { const v = viewOf(request); return Boolean(v) && v !== setting(); },
    // vue : « v1 », « v2 », « v3 », ou « suivre » (oublier la vue : suivre le réglage). Seulement pour une session qui a le droit.
    setView(request, vue) {
      const s = request.session;
      if (!canSwitch(request) || !(VERSIONS.includes(vue) || vue === 'suivre')) return false;
      views.delete(s.id);
      if (vue === 'suivre') return true;
      views.set(s.id, { vue, expires: s.expires_at });
      while (views.size > MAX_VIEWS) views.delete(views.keys().next().value);
      return true;
    },
    // Version servie à cette requête : la vue de la session si elle en a une, sinon le réglage.
    // applied : ce que voient les visiteurs ; forced : la session voit autre chose ; switcher : elle a le bouton.
    forRequest(request) {
      const applied = setting();
      const view = viewOf(request);
      const version = view || applied;
      return { version, applied, view, forced: version !== applied, switcher: canSwitch(request) };
    },
    // Page sans version v1 : toujours en v2.
    onlyV2: template => ONLY_V2.test(template),
    // Le gabarit v2 de cette page existe-t-il ? Sinon, la page reste en v1.
    hasV2(template) {
      if (!/^[a-z][\w-]*$/i.test(template)) return false;                     // pages publiques seulement (pas « admin/… »)
      if (cache && known.has(template)) return known.get(template);
      const ok = fs.existsSync(path.join(viewsDir, 'v2', `${template}.eta`));
      if (cache) known.set(template, ok);
      return ok;
    },
    // Le gabarit v1 de cette page existe-t-il ? Une page née avec la v2 (les Carnets) n'en a pas : en v1, elle n'existe pas
    // (404), et le rendu ne tombe jamais sur un gabarit absent.
    hasV1(template) {
      if (!/^[a-z][\w-]*$/i.test(template)) return true;
      if (cache && knownV1.has(template)) return knownV1.get(template);
      const ok = fs.existsSync(path.join(viewsDir, `${template}.eta`));
      if (cache) knownV1.set(template, ok);
      return ok;
    },
  };
}
