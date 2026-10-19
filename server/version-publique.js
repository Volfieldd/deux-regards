import fs from 'node:fs';
import path from 'node:path';

// Site public en deux versions, côte à côte : v1 (les gabarits de views/) et v2 (ceux de views/v2/, la refonte issue de
// l'audit d'ergonomie du 16 oct. 2026). Le réglage « Site public » (Réglages → Apparence) choisit la version de tous
// les visiteurs ; v1 par défaut. Une page qui n'a pas encore de gabarit v2 s'affiche en v1 (repli automatique).
//
// Aperçu : un administrateur (permission site.apparence) voit la v2 avant de l'appliquer. Le drapeau est gardé ici, en
// mémoire, pour sa session (l'empreinte de son jeton) : ni cookie, ni paramètre d'adresse, rien que le navigateur puisse
// fabriquer. Il tombe avec la session (déconnexion, expiration, droit retiré) et au redémarrage du serveur.
// Pendant l'aperçu, les réponses publiques sont « private, no-store » (voir app.js) : une page v2 ne peut pas entrer
// dans un cache partagé (Cloudflare) et être servie à un visiteur.
export const VERSIONS = ['v1', 'v2'];
const KEY = 'public_version';
const PERM = 'site.apparence';
const MAX_PREVIEWS = 64;
// Pages qui n'existent qu'en v2 (galeries privées, MQ-16 et MQ-17) : de nouvelles pages, hors menu, sans gabarit v1 ;
// servies en v2 quel que soit le réglage (un invité s'en sert même si le site est en v1). La v1 reste figée : aucun de
// ses gabarits n'est touché, et une page v1 n'est jamais servie en v2 par ce biais (préfixe « prive- » seulement).
export const ONLY_V2 = /^prive-[a-z]+$/;                     // borne de la mémoire : au-delà, les plus anciens aperçus sont oubliés

export function createPublicVersion({ db, viewsDir, cache = false }) {
  const read = db.prepare('SELECT value FROM settings WHERE key = ?').pluck();
  const write = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const previews = new Map();                // empreinte du jeton de session → échéance de la session
  const known = new Map();                   // gabarit → existe-t-il en v2 ? (gardé en production seulement)
  const knownV1 = new Map();                 // gabarit → existe-t-il en v1 ?

  const setting = () => {
    let v = null;
    try { v = JSON.parse(read.get(KEY) ?? 'null'); } catch { v = null; }
    return VERSIONS.includes(v) ? v : 'v1';
  };

  // Aperçu actif pour cette requête : session valide, droit d'apparence, drapeau posé pour cette session.
  const previewOn = request => {
    const s = request.session;
    if (!s?.id || !previews.has(s.id)) return false;
    if (previews.get(s.id) <= Date.now()) { previews.delete(s.id); return false; }
    return Boolean(request.can?.(PERM));
  };

  return {
    setting,
    save(v) { if (!VERSIONS.includes(v)) return false; write.run(KEY, JSON.stringify(v)); return true; },
    previewOn,
    // on : vrai pour ouvrir l'aperçu, faux pour le quitter. Seulement pour une session qui a le droit.
    setPreview(request, on) {
      const s = request.session;
      if (!s?.id || !request.can?.(PERM)) return false;
      previews.delete(s.id);
      if (!on) return true;
      previews.set(s.id, s.expires_at);
      while (previews.size > MAX_PREVIEWS) previews.delete(previews.keys().next().value);
      return true;
    },
    // Version servie à cette requête : v2 si le réglage le dit, ou pendant l'aperçu d'un administrateur.
    forRequest(request) {
      const preview = previewOn(request);
      const applied = setting();
      return { version: applied === 'v2' || preview ? 'v2' : 'v1', preview: preview && applied !== 'v2' };
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
