// Ordres de la galerie : l'ordre choisi par les auteurs (défaut, sans paramètre) ou par date de publication.
export const ORDRES = ['recentes'];

// URL canonique d'une vue de la galerie selon les filtres actifs (et l'ordre, s'il n'est pas celui par défaut).
export function galleryUrl({ regard, serie, ordre } = {}) {
  const o = ORDRES.includes(ordre) ? ordre : null;
  if (regard && serie) return `/?regard=${encodeURIComponent(regard)}&serie=${encodeURIComponent(serie)}${o ? `&ordre=${o}` : ''}`;
  const base = serie ? `/serie/${encodeURIComponent(serie)}` : regard ? `/auteur/${encodeURIComponent(regard)}` : '/';
  return o ? `${base}?ordre=${o}` : base;
}

// carnet : la photo ouverte depuis un billet des Carnets (?carnet=<billet>) : retour au billet, voisines du billet ; il
// remplace les filtres de la galerie.
export function photoUrl(slug, { regard, serie, ordre, carnet } = {}) {
  if (carnet) return `/photo/${encodeURIComponent(slug)}?carnet=${encodeURIComponent(carnet)}`;
  const qs = new URLSearchParams();
  if (regard) qs.set('regard', regard);
  if (serie) qs.set('serie', serie);
  if (ORDRES.includes(ordre)) qs.set('ordre', ordre);
  const s = qs.toString();
  return `/photo/${encodeURIComponent(slug)}${s ? `?${s}` : ''}`;
}

// La même vue quand la page /galerie existe (v2 et v3 ; MQ-02) : la galerie entière et les vues sans page à elles
// (deux filtres ensemble, l'ordre seul) y passent ; un regard seul ou une série seule gardent leur page (/auteur/<slug>,
// /serie/<slug>), leur adresse canonique. Jamais de sous-chemin de /galerie/ : le chemin piège de la Vigie
// (server/securite/piege.js, /galerie/tout-telecharger) reste hors des routes.
export function galerieUrl(filter = {}) {
  const url = galleryUrl(filter);
  return url === '/' ? '/galerie' : url.startsWith('/?') ? `/galerie${url.slice(1)}` : url;
}
