// Métadonnées de lecture communes aux dossiers et à ATT&CK. Le registre du moteur expose les modes effectifs ;
// les étiquettes des détecteurs restent dans leur barème. Cette réunion ne modifie ni règle ni détection.
import { DETECTEURS } from '../detecteurs.js';
import { lire, technique } from '../attack.js';

export function reglesAttack(engine) {
  return new Map((engine?.rules?.() || []).map(r => {
    const d = r.id.startsWith('detecteur.') ? DETECTEURS[r.id.slice(10)] : null;
    return [r.id, { ...r, tags: r.tags || d?.tags || [] }];
  }));
}
export const techniquesDe = r => lire(r?.tags || []).techniques.filter(id => technique(id));
export const filtreTechnique = v => typeof v === 'string' && /^T\d{4}(?:\.\d{3})?$/.test(v) && technique(v) ? v : '';
