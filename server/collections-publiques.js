import fs from 'node:fs';
import path from 'node:path';
import { variantName, widthsFor } from './images.js';

export const collectionPhotoVisible = (p, storageDir) => Boolean(p && p.status === 'published' && storageDir && p.file
  && fs.existsSync(path.join(storageDir, 'variants', variantName(p.file, widthsFor(p.width).at(-1), 'webp', p.variant_key))));

// Une collection conserve sa visite après l’échéance de son exposition d’origine. La publication courante,
// les accords et la présence d’une variante restent nécessaires à chaque photographie, sans couverture de repli.
export function createCollectionsPubliques({ bilans, repo, storageDir, expositions = null }) {
  const project = (c, lang) => {
    if (!c) return null;
    const rows = repo.photosByIds(c.photo_ids, lang), cartels = new Map(c.cartels.map(row => [row.photo_id, row.cartel]));
    const photos = c.photo_ids.map(id => rows.get(id)).filter(p => collectionPhotoVisible(p, storageDir))
      .map(p => ({ ...p, cartel: cartels.get(p.id) || '' }));
    return { ...c, photo_ids: photos.map(p => p.id), photos, cover: photos.find(p => p.id === c.cover_id) || null,
      origin: c.origin && (!expositions || expositions.has(c.origin.saison_id)) ? c.origin : null };
  };
  const list = ({ lang = 'fr', limit = -1, offset = 0 } = {}) => bilans.publicCollections({ lang, limit, offset }).map(c => project(c, lang));
  const bySlug = (slug, { lang = 'fr' } = {}) => project(bilans.publicCollectionBySlug(slug, { lang }), lang);
  function photo(slug, photoSlug, { lang = 'fr' } = {}) {
    if (typeof photoSlug !== 'string' || photoSlug.length > 200) return null;
    const collection = bySlug(slug, { lang });
    if (!collection) return null;
    const index = collection.photos.findIndex(p => p.slug === photoSlug);
    if (index < 0) return null;
    return { collection, photo: collection.photos[index], index, count: collection.photos.length,
      prev: index > 0 ? collection.photos[index - 1] : null, next: index + 1 < collection.photos.length ? collection.photos[index + 1] : null };
  }
  return { list, count: bilans.publicCollectionsCount, bySlug, photo };
}
