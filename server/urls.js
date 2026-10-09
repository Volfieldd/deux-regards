// URL canonique d'une vue de la galerie selon les filtres actifs.
export function galleryUrl({ regard, serie } = {}) {
  if (regard && serie) return `/?regard=${encodeURIComponent(regard)}&serie=${encodeURIComponent(serie)}`;
  if (serie) return `/serie/${encodeURIComponent(serie)}`;
  if (regard) return `/auteur/${encodeURIComponent(regard)}`;
  return '/';
}

export function photoUrl(slug, { regard, serie } = {}) {
  const qs = new URLSearchParams();
  if (regard) qs.set('regard', regard);
  if (serie) qs.set('serie', serie);
  const s = qs.toString();
  return `/photo/${encodeURIComponent(slug)}${s ? `?${s}` : ''}`;
}
