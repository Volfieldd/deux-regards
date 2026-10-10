import fs from 'node:fs';
import path from 'node:path';
import { VARIANT_RE } from '../images.js';

// Variantes servies : /media/ pour les photos publiées seulement, /admin/media/ pour l'aperçu
// des brouillons (session admin). Les originaux n'ont aucune route.
export default async function mediaRoutes(app) {
  const dir = path.join(app.config.storageDir, 'variants');
  fs.mkdirSync(dir, { recursive: true });
  // Seules les variantes à jour (empreinte courante) sont servies.
  const photoOf = app.db.prepare("SELECT status, variant_key FROM photos WHERE file LIKE ? || '.%'");

  function lookup(name) {
    const m = VARIANT_RE.exec(name);
    const photo = m && photoOf.get(m[1]);
    return photo && photo.variant_key === (m[2] || '') ? photo.status : undefined;
  }

  app.get('/media/:name', async (request, reply) => {
    if (lookup(request.params.name) !== 'published') return reply.callNotFound();
    return reply.sendFile(request.params.name, dir, { maxAge: '365d', immutable: true });
  });

  app.get('/admin/media/:name', { preHandler: app.requireAdmin }, async (request, reply) => {
    if (!lookup(request.params.name)) return reply.callNotFound();
    return reply.header('cache-control', 'private, max-age=3600').sendFile(request.params.name, dir, { cacheControl: false });
  });
}
