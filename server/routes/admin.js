// Administration : tout passe par requireAdmin. Les écrans de gestion arrivent en phase 4.
export default async function adminRoutes(app) {
  app.addHook('preHandler', app.requireAdmin);

  app.get('/admin', async (request, reply) => {
    const { siteName } = app.config;
    return reply.render('admin', {
      siteName, session: request.session,
      pageTitle: `Administration · ${siteName}`, description: '',
    });
  });
}
