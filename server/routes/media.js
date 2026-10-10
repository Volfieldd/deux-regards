import fs from 'node:fs';
import path from 'node:path';

const VARIANT = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+\.(?:avif|webp)$/;

// Variantes servies : /media/ pour les photos publiées seulement, /admin/media/ pour l'aperçu
// des brouillons (session admin). Les originaux n'ont aucune route.
export default async function mediaRoutes(app) {
  const dir = path.join(app.config.storageDir, 'variants');
  fs.mkdirSync(dir, { recursive: true });
  const statusOf = app.db.prepare("SELECT status FROM photos WHERE file LIKE ? || '.%'").pluck();

  function lookup(name) {
    const m = VARIANT.exec(name);
    return m ? statusOf.get(m[1]) : undefined;
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
