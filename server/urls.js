// Ordres de la galerie : l'ordre choisi par les auteurs (défaut, sans paramètre) ou par date de publication.
export const ORDRES = ['recentes'];

// URL canonique d'une vue de la galerie selon les filtres actifs (et l'ordre, s'il n'est pas celui par défaut).
export function galleryUrl({ regard, serie, ordre } = {}) {
  const o = ORDRES.includes(ordre) ? ordre : null;
  if (regard && serie) return `/?regard=${encodeURIComponent(regard)}&serie=${encodeURIComponent(serie)}${o ? `&ordre=${o}` : ''}`;
  const base = serie ? `/serie/${encodeURIComponent(serie)}` : regard ? `/auteur/${encodeURIComponent(regard)}` : '/';
  return o ? `${base}?ordre=${o}` : base;
}

export function photoUrl(slug, { regard, serie, ordre } = {}) {
  const qs = new URLSearchParams();
  if (regard) qs.set('regard', regard);
  if (serie) qs.set('serie', serie);
  if (ORDRES.includes(ordre)) qs.set('ordre', ordre);
  const s = qs.toString();
  return `/photo/${encodeURIComponent(slug)}${s ? `?${s}` : ''}`;
}
