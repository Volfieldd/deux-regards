import { CATEGORIES_DONNEES } from './vocabulaire.js';

// BV-33 : catégories des données effectivement préparées pour l'écran. Aucune valeur personnelle ne passe dans
// ces métadonnées ; les catégories ne se déduisent ni du texte libre ni d'une requête fournie par le navigateur.
export function categoriesRencontre(e) {
  if (!e || e.anonymized) return [];
  return [
    e.name || e.guardian ? 'identite' : null,
    e.email ? 'coordonnees' : null,
    e.hasPortrait || e.portrait_jpeg ? 'image' : null,
    e.adult === 0 && e.guardian ? 'mineur' : null,
    e.hasSignature || e.signature_png || ((e.hasCard || e.card_jpeg) && e.consent_source === 'carte' && e.consent) ? 'accord_signe' : null,
    e.place || (e.lat != null && e.lon != null) ? 'localisation' : null,
    e.details || e.last?.message ? 'message_libre' : null,
  ].filter(Boolean);
}

// Une liste donne son effectif, pas les identifiants de toutes ses lignes. Cet effectif n'est jamais additionné
// comme autant de fiches distinctes entre plusieurs requêtes (8/30 fiches : étude 4.6).
export function noterLecture(request, { objet, id = null, categorie = [], objets = 1, liste = false }) {
  if (!request.vigieLecture) return;
  request.vigieLecture.detail = { objet, id, categorie: [...new Set(categorie.filter(c => Object.hasOwn(CATEGORIES_DONNEES, c)))],
    objets: Number.isSafeInteger(objets) && objets >= 0 ? Math.min(objets, 10000) : 0, ...(liste ? { liste: true } : {}) };
}
