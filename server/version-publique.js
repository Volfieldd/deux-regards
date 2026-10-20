import fs from 'node:fs';
import path from 'node:path';
import { DESIGNS, knownDesign, validDesignSettings, sectionOf } from './designs.js';

// Présentations historiques et compositions par rubrique. Sans public_design, le comportement
// public_version reste identique. Une configuration explicite choisit un défaut et des exceptions.
// Les six chambres noires partagent les pages V2 et leurs fonctions ; les Carnets utilisent aussi
// ce socle quand une rubrique du nouveau système choisit V1. Les galeries privées restent dédiées.
// Un aperçu est conservé côté serveur, par session autorisée : jamais depuis un paramètre public.
// Il expire avec la session, le retrait du droit ou le redémarrage. Les réponses de session sont
// private, no-store (app.js), y compris les flux et les pages qui utilisent un repli de gabarit.
export const VERSIONS = ['v1', 'v2', 'v3'];
// La v2 et la v3 servent les mêmes pages (gabarits de views/v2/) : Carnets, menu, repli sur la v1, tout ce qui dépend de
// « la refonte » vaut pour les deux.
export const usesV2 = v => v === 'v2' || v === 'v3';
const KEY = 'public_version';
const PERM = 'site.apparence';
const MAX_VIEWS = 64;                      // borne de la mémoire : au-delà, les plus anciennes vues sont oubliées
// Pages qui n'existent qu'en v2 (galeries privées, MQ-16 et MQ-17) : de nouvelles pages, hors menu, sans gabarit v1 ;
// servies en v2 quel que soit le réglage (un invité s'en sert même si le site est en v1).
// Le préfixe « prive- » ne choisit jamais une composition publique.
export const ONLY_V2 = /^prive-[a-z]+$/;

export function createPublicVersion({ db, viewsDir, cache = false }) {
  const read = db.prepare('SELECT value FROM settings WHERE key = ?').pluck();
  const write = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const views = new Map();                   // empreinte du jeton de session → { vue: identifiant de composition, expires }
  const known = new Map();                   // gabarit → existe-t-il en v2 ? (gardé en production seulement)
  const knownV1 = new Map();                 // gabarit → existe-t-il en v1 ?

  const setting = () => {
    let v = null;
    try { v = JSON.parse(read.get(KEY) ?? 'null'); } catch { v = null; }
    return VERSIONS.includes(v) ? v : 'v1';
  };

  const designSettings = () => {
    try { const v = JSON.parse(read.get('public_design') ?? 'null'); return validDesignSettings(v) ? v : null; }
    catch { return null; }
  };
  const designFor = section => { const d = designSettings(); return d?.sections[section] || d?.default || setting(); };
  const versionFor = (design, section) => section === 'carnets' && design === 'v1' && designSettings() ? 'v2' : DESIGNS[design].version;

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
    designSettings,
    designFor,
    versionForSection: section => versionFor(designFor(section), section),
    saveDesign(value) {
      if (value !== null && !validDesignSettings(value)) return false;
      write.run('public_design', JSON.stringify(value));
      return true;
    },
    save(v) { if (!VERSIONS.includes(v)) return false; write.run(KEY, JSON.stringify(v)); return true; },
    canSwitch,
    viewOf,
    // La session voit-elle une autre version que les visiteurs ?
    forcedOn: request => { const v = viewOf(request); return Boolean(v) && v !== designFor(sectionOf(request)); },
    // vue : composition connue, ou « suivre » pour revenir aux réglages de chaque rubrique. Permission obligatoire.
    setView(request, vue) {
      const s = request.session;
      if (!canSwitch(request) || !(knownDesign(vue) || vue === 'suivre')) return false;
      views.delete(s.id);
      if (vue === 'suivre') return true;
      views.set(s.id, { vue, expires: s.expires_at });
      while (views.size > MAX_VIEWS) views.delete(views.keys().next().value);
      return true;
    },
    // Version servie à cette requête : la vue de la session si elle en a une, sinon le réglage.
    // applied : ce que voient les visiteurs ; forced : la session voit autre chose ; switcher : elle a le bouton.
    forRequest(request, section = sectionOf(request)) {
      const appliedDesign = designFor(section);
      const view = viewOf(request);
      const design = view || appliedDesign;
      const version = versionFor(design, section);
      const applied = versionFor(appliedDesign, section);
      return { version, applied, design, appliedDesign, section, view, forced: design !== appliedDesign,
        darkroom: Boolean(DESIGNS[design].darkroom), configured: Boolean(designSettings()), switcher: canSwitch(request) };
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
