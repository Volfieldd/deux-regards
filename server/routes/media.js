import fs from 'node:fs';
import path from 'node:path';
import { VARIANT_RE } from '../images.js';
import { servedVariant, REPLI_CACHE } from '../repli-variantes.js';

// Variantes servies : /media/ pour les photos publiées seulement, /admin/media/ pour l'aperçu
// des brouillons (session admin). Les originaux n'ont aucune route.
export default async function mediaRoutes(app) {
  const dir = path.join(app.config.storageDir, 'variants');
  fs.mkdirSync(dir, { recursive: true });
  // Seules les variantes à jour (empreinte courante) sont servies.
  // « <uuid>. » ≤ file < « <uuid>/ » : les fichiers « <uuid>.<ext> », via l'index unique de photos.file.
  const photoOf = app.db.prepare("SELECT status, variant_key, author_id, file, width FROM photos WHERE file >= ? || '.' AND file < ? || '/'");

  function find(name) {
    const m = VARIANT_RE.exec(name);
    const photo = m && photoOf.get(m[1], m[1]);
    return photo && photo.variant_key === (m[2] || '') ? photo : undefined;
  }

  // Cache d'un an chez le visiteur (le nom change avec les réglages), mais d'un jour au plus dans un cache partagé
  // (Cloudflare suit CDN-Cache-Control) : une photo dépubliée, refusée ou effacée n'y reste pas servie un an.
  // Taille pas encore créée (160 ou 480 px d'une photo d'avant leur ajout, rattrapée en fond) : une plus grande de la même
  // photo, en cache court (server/repli-variantes.js) ; ni 404, ni image cassée.
  app.get('/media/:name', async (request, reply) => {
    const photo = find(request.params.name);
    if (photo?.status !== 'published') return reply.callNotFound();
    const served = servedVariant(dir, photo, request.params.name);
    if (!served) return reply.callNotFound();
    if (served.repli) return reply.header('cache-control', REPLI_CACHE).header('cdn-cache-control', REPLI_CACHE).sendFile(served.name, dir, { cacheControl: false });
    return reply.header('cdn-cache-control', 'public, max-age=86400').sendFile(served.name, dir, { maxAge: '365d', immutable: true });
  });

  app.get('/admin/media/:name', { preHandler: [app.requireAdmin, app.requirePermission], config: { perm: 'photos.voir' } }, async (request, reply) => {
    const photo = find(request.params.name);
    // Portée « les miennes » : l'image d'une photo d'un autre photographe n'existe pas pour ce compte.
    if (!photo || !request.owns('photos.voir', photo.author_id)) return reply.callNotFound();
    const served = servedVariant(dir, photo, request.params.name);
    if (!served) return reply.callNotFound();
    // Brouillons : jamais conservés par le navigateur après la session (ordinateur partagé).
    return reply.header('cache-control', 'no-store').sendFile(served.name, dir, { cacheControl: false });
  });
}
