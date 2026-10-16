// État d'une photo pour chaque usage (site, Instagram), d'après ses visages et les accords de sa sortie :
//   - prête (ok)        : aucun visage, ou toutes les personnes concernées ont accepté cet usage ;
//   - à vérifier (warn) : un visage, et un accord manque (personne rencontrée, personne sans décision, usage non
//                         accepté, refus dans la sortie) ; publier demande une confirmation explicite, gardée ;
//   - bloquée (no)      : site : un refus lié à la photo ; Instagram : une personne concernée refuse ou n'a pas
//                         accepté Instagram. Aucune confirmation ne lève un blocage.
// Personnes concernées : celles liées à la photo, et celles de sa sortie (même photographe, même partie de journée,
// non exclues) si la photo a un visage. Visages : la correction à la main l'emporte ; pas encore examinée ou examen
// impossible : un visage est supposé (prudence).
import { translator } from './admin-i18n.js';

export const USAGES = ['site', 'instagram'];
export const LEVEL_LABEL = { ok: 'prête', warn: 'à vérifier', no: 'bloquée' };
// Libellé d'un niveau dans la langue de l'admin (t : request.t ; sans t, en français).
export const levelLabel = (level, t = FR) => ({ ok: t('prête'), warn: t('à vérifier'), no: t('bloquée') })[level];
const FR = translator('fr');

// Les raisons sont gardées (confirmations, erreurs Instagram) en français : seulement la référence, jamais le nom
// (chiffré en base). Chaque raison est une fonction de la langue (t) : gardée en français, affichée dans la langue
// de l'admin.
const who = (e, t) => (e.anonymized ? t('refus anonymisé') : e.ref || t('rencontre sans carte n°{id}', { id: e.id }));
// Un accord ne lève « à vérifier » que s'il est sûr : carte ou signature, ou demande en ligne avec le code de contrôle
// de la carte. Un accord en ligne sans code (QR des vêtements, référence tapée) peut venir de n'importe qui.
const trusted = e => ['carte', 'signature'].includes(e.consent_source) || Boolean(e.verified);

export function facesOf(p) {
  if (p.faces_override === 1) return { has: true, n: Math.max(1, p.faces || 0), source: 'main' };
  if (p.faces_override === 0) return { has: false, n: 0, source: 'main' };
  if (p.faces == null || p.faces < 0) return { has: true, n: null, source: p.faces == null ? 'attente' : 'echec' };
  return { has: p.faces > 0, n: p.faces, source: 'detection' };
}

export function createReadiness({ db, encounters }) {
  const photoRow = db.prepare('SELECT id, status, faces, faces_override FROM photos WHERE id = ?');

  // cache (facultatif) : Map partagée entre plusieurs appels, pour ne déchiffrer chaque rencontre qu'une fois.
  // t (facultatif, request.t) : raisons et libellés affichés dans la langue de l'admin ; les raisons en français
  // (celles que l'on garde et compare aux confirmations) restent dans « stored ».
  function state(photoOrId, cache = null, t = null) {
    const p = typeof photoOrId === 'object' ? photoOrId : photoRow.get(photoOrId);
    if (!p) return null;
    const faces = facesOf(p);
    const all = encounters.forPhoto(p.id, cache);
    const linked = all.filter(e => e.via === 'lien');
    const concerned = faces.has ? all : linked;
    const result = { faces, people: concerned };
    for (const u of USAGES) {
      const reasons = [];
      let level = 'ok';
      const refusedLinked = linked.filter(e => e.refused);
      const hard = u === 'site' ? refusedLinked : concerned.filter(e => e.refused || (e.consent && !e.consent.instagram));
      if (hard.length) {
        level = 'no';
        for (const e of hard) reasons.push(e.refused ? t => t('{who} refuse la publication', { who: who(e, t) }) : t => t('{who} n’a pas accepté Instagram', { who: who(e, t) }));
      } else if (faces.has) {
        if (!concerned.length) {
          reasons.push(faces.source === 'main' ? t => t('quelqu’un est sur la photo, sans accord') : faces.n == null ? t => t('visages pas encore examinés')
            : faces.n > 1 ? t => t('{n} visages, personne rencontrée', { n: faces.n }) : t => t('1 visage, personne rencontrée'));
        }
        for (const e of concerned) {
          if (e.refused) reasons.push(t => t('{who} a refusé (même sortie) : est-elle sur la photo ?', { who: who(e, t) }));
          else if (!e.consent) reasons.push(t => t('{who} n’a pas encore décidé', { who: who(e, t) }));
          else if (!e.consent[u]) reasons.push(u === 'site' ? t => t('{who} n’a pas accepté le site', { who: who(e, t) }) : t => t('{who} n’a pas accepté Instagram', { who: who(e, t) }));
          else if (!trusted(e)) reasons.push(t => t('{who} : accord en ligne non vérifié (sans code de carte)', { who: who(e, t) }));
        }
        if (reasons.length) level = 'warn';
      }
      const stored = reasons.map(r => r(FR));
      result[u] = { level, reasons: t ? reasons.map(r => r(t)) : stored, stored, label: levelLabel(level, t || FR) };
    }
    return result;
  }

  // Confirmations explicites (publication d'une photo à vérifier), les plus récentes d'abord.
  const confirmationRows = db.prepare('SELECT * FROM photo_confirmations WHERE photo_id = ? ORDER BY at DESC, id DESC');
  const confirmations = photoId => confirmationRows.all(photoId)
    .map(c => ({ ...c, reasons: (() => { try { return JSON.parse(c.reasons); } catch { return []; } })() }));
  function confirm(photoId, usage, byName, reasons) {
    db.prepare('INSERT INTO photo_confirmations (photo_id, usage, at, by_name, reasons) VALUES (?, ?, ?, ?, ?)').run(photoId, usage, Date.now(), String(byName || '').slice(0, 120), JSON.stringify(reasons || []));
  }

  // Tri avant publication sur le site : bloquées écartées ; à vérifier écartées, sauf si une confirmation couvre déjà
  // leurs raisons (republication, annulation).
  function gate(ids) {
    const ok = [], verify = [], blocked = [];
    for (const id of ids) {
      const s = state(Number(id));
      if (!s) continue;
      if (s.site.level === 'no') blocked.push({ id: Number(id), reasons: s.site.reasons });
      else if (s.site.level === 'warn' && !confirmed(Number(id), 'site', s)) verify.push({ id: Number(id), reasons: s.site.reasons });
      else ok.push(Number(id));
    }
    return { ok, verify, blocked };
  }

  // Une confirmation couvre ce qu'elle a vu : elle vaut tant que les raisons actuelles en font toutes partie.
  function confirmed(photoId, usage, s = null) {
    const r = (s || state(photoId))?.[usage];
    const c = confirmations(photoId).find(x => x.usage === usage);
    return Boolean(r && c && (r.stored || r.reasons).every(x => c.reasons.includes(x)));
  }

  const setFaces = (photoId, value) => db.prepare('UPDATE photos SET faces_override = ? WHERE id = ?').run(value === 1 || value === 0 ? value : null, photoId);

  // À vérifier et pas encore confirmée (photothèque, Aujourd'hui) : une photo confirmée ne réapparaît pas.
  const pending = (p, usage = 'site', cache = null) => { const s = state(p, cache); return s && s[usage].level === 'warn' && !confirmed(p.id ?? p, usage, s); };

  return { state, gate, confirm, confirmed, pending, confirmations, setFaces };
}
