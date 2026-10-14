// État d'une photo pour chaque usage (site, Instagram), d'après ses visages et les accords de sa sortie :
//   - prête (ok)        : aucun visage, ou toutes les personnes concernées ont accepté cet usage ;
//   - à vérifier (warn) : un visage, et un accord manque (personne rencontrée, personne sans décision, usage non
//                         accepté, refus dans la sortie) ; publier demande une confirmation explicite, gardée ;
//   - bloquée (no)      : site : un refus lié à la photo ; Instagram : une personne concernée refuse ou n'a pas
//                         accepté Instagram. Aucune confirmation ne lève un blocage.
// Personnes concernées : celles liées à la photo, et celles de sa sortie (même photographe, même partie de journée,
// non exclues) si la photo a un visage. Visages : la correction à la main l'emporte ; pas encore examinée ou examen
// impossible : un visage est supposé (prudence).
export const USAGES = ['site', 'instagram'];
export const LEVEL_LABEL = { ok: 'prête', warn: 'à vérifier', no: 'bloquée' };

const who = e => (e.anonymized ? 'refus anonymisé' : `${e.ref || 'sans carte'}${e.name ? ` · ${e.name}` : ''}`);

export function facesOf(p) {
  if (p.faces_override === 1) return { has: true, n: Math.max(1, p.faces || 0), source: 'main' };
  if (p.faces_override === 0) return { has: false, n: 0, source: 'main' };
  if (p.faces == null || p.faces < 0) return { has: true, n: null, source: p.faces == null ? 'attente' : 'echec' };
  return { has: p.faces > 0, n: p.faces, source: 'detection' };
}

export function createReadiness({ db, encounters }) {
  const photoRow = db.prepare('SELECT id, status, faces, faces_override FROM photos WHERE id = ?');

  function state(photoOrId) {
    const p = typeof photoOrId === 'object' ? photoOrId : photoRow.get(photoOrId);
    if (!p) return null;
    const faces = facesOf(p);
    const all = encounters.forPhoto(p.id);
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
        for (const e of hard) reasons.push(e.refused ? `${who(e)} refuse la publication` : `${who(e)} n’a pas accepté Instagram`);
      } else if (faces.has) {
        if (!concerned.length) reasons.push(faces.source === 'main' ? 'quelqu’un est sur la photo, sans accord' : faces.n == null ? 'visages pas encore examinés' : `${faces.n} visage${faces.n > 1 ? 's' : ''}, personne rencontrée`);
        for (const e of concerned) {
          if (e.refused) reasons.push(`${who(e)} a refusé (même sortie) : est-elle sur la photo ?`);
          else if (!e.consent) reasons.push(`${who(e)} n’a pas encore décidé`);
          else if (!e.consent[u]) reasons.push(`${who(e)} n’a pas accepté ${u === 'site' ? 'le site' : 'Instagram'}`);
        }
        if (reasons.length) level = 'warn';
      }
      result[u] = { level, reasons };
    }
    return result;
  }

  // Confirmations explicites (publication d'une photo à vérifier), les plus récentes d'abord.
  const confirmations = photoId => db.prepare('SELECT * FROM photo_confirmations WHERE photo_id = ? ORDER BY at DESC, id DESC').all(photoId)
    .map(c => ({ ...c, reasons: (() => { try { return JSON.parse(c.reasons); } catch { return []; } })() }));
  function confirm(photoId, usage, byName, reasons) {
    db.prepare('INSERT INTO photo_confirmations (photo_id, usage, at, by_name, reasons) VALUES (?, ?, ?, ?, ?)').run(photoId, usage, Date.now(), String(byName || '').slice(0, 120), JSON.stringify(reasons || []));
  }

  // Tri avant publication sur le site : bloquées écartées, à vérifier écartées sauf confirmation (alors gardée).
  function gate(ids, { confirmed = false, byName = '' } = {}) {
    const ok = [], verify = [], blocked = [];
    for (const id of ids) {
      const s = state(Number(id));
      if (!s) continue;
      if (s.site.level === 'no') blocked.push({ id: Number(id), reasons: s.site.reasons });
      else if (s.site.level === 'warn' && !confirmed) verify.push({ id: Number(id), reasons: s.site.reasons });
      else {
        if (s.site.level === 'warn') confirm(Number(id), 'site', byName, s.site.reasons);
        ok.push(Number(id));
      }
    }
    return { ok, verify, blocked };
  }

  // Une confirmation couvre ce qu'elle a vu : elle vaut tant que les raisons actuelles en font toutes partie.
  function confirmed(photoId, usage) {
    const r = state(photoId)?.[usage];
    const c = confirmations(photoId).find(x => x.usage === usage);
    return Boolean(r && c && r.reasons.every(x => c.reasons.includes(x)));
  }

  const setFaces = (photoId, value) => db.prepare('UPDATE photos SET faces_override = ? WHERE id = ?').run(value === 1 || value === 0 ? value : null, photoId);

  return { state, gate, confirm, confirmed, confirmations, setFaces };
}
