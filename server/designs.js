// Compositions publiques : fonctions communes, présentation choisie par rubrique.
// Aucun chemin de feuille ou de gabarit ne vient d'un formulaire.
export const DESIGNS = {
  v1: { label: 'V1 — Originale', description: 'La présentation historique et la palette existante.', version: 'v1' },
  v2: { label: 'V2 — Essentielle', description: 'La présentation fonctionnelle et la palette existante.', version: 'v2' },
  v3: { label: 'V3 — Plein cadre', description: 'La photo en ouverture et la palette existante.', version: 'v3' },
  obscura: { label: 'Obscura', description: 'Un tirage entier, de l’espace, le temps de regarder.', version: 'v2', darkroom: true },
  panoramique: { label: 'Panoramique', description: 'Une projection large et des séquences photographiques.', version: 'v2', darkroom: true },
  contact: { label: 'Contact', description: 'Une planche de photos, précise et compacte.', version: 'v2', darkroom: true },
  resonances: { label: 'Résonances', description: 'Des images par paires et des regards qui se répondent.', version: 'v2', darkroom: true },
  itinerance: { label: 'Itinérance', description: 'Des images et des récits à parcourir par étapes.', version: 'v2', darkroom: true },
  'hors-cadre': { label: 'Hors cadre', description: 'Un accrochage asymétrique, des respirations et des surprises.', version: 'v2', darkroom: true },
};
export const SECTIONS = {
  accueil: { label: 'Accueil', url: '/' },
  galerie: { label: 'Galeries, séries et recherche', url: '/galerie' },
  photos: { label: 'Visionneuse des photos', url: '/galerie' },
  carte: { label: 'Carte', url: '/carte' },
  voyages: { label: 'Voyages et leurs étapes', url: '/voyages' },
  carnets: { label: 'Carnets et billets', url: '/carnet' },
  expositions: { label: 'Expositions', url: '/expositions' },
  regards: { label: 'À propos des regards', url: '/a-propos' },
  contact: { label: 'Contact', url: '/contact' },
  informations: { label: 'Droits et autres informations', url: '/droits' },
};
export const knownDesign = id => typeof id === 'string' && Object.hasOwn(DESIGNS, id);
export function sectionOf(request) {
  const url = new URL(request.url || '/', 'http://local');
  const p = url.pathname.replace(/^\/(en|de)(?=\/|$)/, '') || '/';
  if (p === '/') return ['regard', 'serie', 'ordre'].some(k => url.searchParams.get(k)) ? 'galerie' : 'accueil';
  if (/^\/(galerie|auteur|serie|series|recherche)(\/|$)/.test(p)) return 'galerie';
  if (/^\/photo(\/|$)/.test(p)) return 'photos';
  if (/^\/carnet(\/|$)/.test(p)) return 'carnets';
  if (/^\/expositions?(\/|$)/.test(p)) return 'expositions';
  if (/^\/voyages?(\/|$)/.test(p)) return 'voyages';
  if (p === '/carte') return 'carte';
  if (p === '/a-propos') return 'regards';
  if (p === '/contact') return 'contact';
  return 'informations';
}
// Une configuration entière est validée avant l'écriture atomique d'une seule valeur.
export function validDesignSettings(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(k => k === 'default' || k === 'sections') && knownDesign(value.default)
    && value.sections !== null && typeof value.sections === 'object' && !Array.isArray(value.sections)
    && Object.entries(value.sections).every(([section, id]) => Object.hasOwn(SECTIONS, section) && knownDesign(id));
}

// Largeurs adaptées à la composition, pour laisser le navigateur choisir une variante proportionnée.
export function designRowSizes(id) {
  const mobile = '(max-width: 700px) calc(100vw - 48px)';
  if (id === 'contact') return `${mobile}, calc((100vw - 192px) / 3)`;
  if (id === 'itinerance') return `${mobile}, calc((100vw - 184px) * .667)`;
  if (id === 'panoramique' || id === 'hors-cadre') return `${mobile}, calc(100vw - 144px)`;
  return `${mobile}, calc((100vw - 200px) / 2)`;
}
