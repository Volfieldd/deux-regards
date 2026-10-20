// Décor borné de MV-12/MV-13 pour les tests de lecture et de gestes ; même console temporaire que les autres écrans.
import { setup } from './console-env.js';
export const PIEGE = '<img src=x onerror=alert(1)>';
export function environnement(t, opts) {
  const v = setup(t, opts);
  const dossier = (extra = {}) => {
    const d = { piste: 'identite', graine_kind: 'compte', graine_key: 'compte-a', statut: 'ouvert', gravite: 'haut', phase_max: 6,
      confiance: 'forte', enjeu: 'sensible', ouvert_a: v.clock.t - 3600e3, derniere: v.clock.t, dernier_jalon: v.clock.t,
      explication: JSON.stringify({ titre: `Compte ${PIEGE} depuis 198.51.100.23 et 2001:db8:1:2::9 : accès → collecte`,
        lignes: ['Haute · Collecte atteinte', `Confiance forte : preuve ${PIEGE}`, 'Enjeu sensible : 12 objets personnels lus'], chaine: [3, 6], non_observees: ['exploration', 'ancrage'], modificateurs: ['plancher : alerte haute'] }), ...extra };
    const ks = Object.keys(d);
    return Number(v.db.prepare(`INSERT INTO dossiers (${ks.join(',')}) VALUES (${ks.map(k => '@' + k).join(',')})`).run(d).lastInsertRowid);
  };
  const entite = (id, kind, key, extra = {}) => v.db.prepare(`INSERT INTO dossier_entites (dossier_id,kind,key,role,force,via,ajoute_a,detache_a)
    VALUES (@dossier_id,@kind,@key,@role,@force,@via,@ajoute_a,@detache_a)`).run({ dossier_id: id, kind, key, role: 'acteur', force: 'fort', via: null, ajoute_a: v.clock.t, detache_a: null, ...extra });
  const signal = (id, extra = {}) => {
    const d = { dossier_id: id, seq: null, regle: 'sigma.cookie_rejoue', survenu_a: v.clock.t, nature: 'preuve', phase: 3, sub: 'compte-a', ...extra };
    const ks = Object.keys(d);
    return Number(v.db.prepare(`INSERT INTO dossier_signaux (${ks.join(',')}) VALUES (${ks.map(k => '@' + k).join(',')})`).run(d).lastInsertRowid);
  };
  const alerte = (id, extra = {}) => {
    const d = { dossier_id: id, regle: 'sigma.cookie_rejoue', gravite: 'haut', mode: 'observer', statut: 'ouverte', entite_kind: 'compte', entite_key: 'compte-a', premiere: v.clock.t, derniere: v.clock.t, ...extra };
    const ks = Object.keys(d);
    return Number(v.db.prepare(`INSERT INTO alerts (${ks.join(',')}) VALUES (${ks.map(k => '@' + k).join(',')})`).run(d).lastInsertRowid);
  };
  const get = (cookie, url) => v.app.inject({ url, headers: v.h(), cookies: { '__Host-vigie': cookie } });
  const post = (cookie, url, body = {}) => {
    const p = new URLSearchParams({ _csrf: v.sessionOf(cookie).csrf });
    for (const [k, val] of Object.entries(body)) { p.delete(k); for (const x of Array.isArray(val) ? val : [val]) p.append(k, x); }
    return v.app.inject({ method: 'POST', url, headers: { ...v.h(), 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' }, cookies: { '__Host-vigie': cookie }, payload: p.toString() });
  };
  return { ...v, dossier, entite, signal, alerte, get, post };
}
