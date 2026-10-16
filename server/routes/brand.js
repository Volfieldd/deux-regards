import path from 'node:path';
import { THEMES, DEFAULT_THEME, BRAND_DEFAULTS } from '../themes.js';

const PREVIEW_COOKIE = 'apercu_theme';

// Apparence : thème et marque (emblème, favicon) lus dans les réglages, aperçu d'un thème pour les admins.
export function createAppearance(app) {
  const setting = app.db.prepare('SELECT value FROM settings WHERE key = ?').pluck();
  const read = (key, dflt) => { const v = setting.get(key); return v ? JSON.parse(v) : dflt; };

  return {
    brand: () => ({ ...BRAND_DEFAULTS, ...read('brand', {}) }),
    themeId: () => { const id = read('theme', DEFAULT_THEME); return THEMES[id] ? id : DEFAULT_THEME; },

    // Thème de la page : celui des réglages, ou celui en aperçu (?theme=…, mémorisé une heure) pour un admin.
    forRequest(request, reply) {
      let preview = null;
      if (request.can?.('site.apparence')) {
        const asked = typeof request.query?.theme === 'string' ? request.query.theme : null;
        if (asked === 'off') reply.clearCookie(PREVIEW_COOKIE, { path: '/' });
        else if (asked && THEMES[asked]) {
          preview = asked;
          reply.setCookie(PREVIEW_COOKIE, asked, { path: '/', httpOnly: true, sameSite: 'lax', secure: app.config.secureCookies, maxAge: 3600 });
        } else if (!asked && THEMES[request.cookies[PREVIEW_COOKIE]]) preview = request.cookies[PREVIEW_COOKIE];
      }
      const id = preview || this.themeId();
      return { id, ...THEMES[id], preview: Boolean(preview) && preview !== this.themeId() };
    },
  };
}

// Fichiers de marque servis publiquement : seulement ceux désignés par les réglages (noms versionnés).
export default async function brandRoutes(app) {
  const dir = path.join(app.config.storageDir, 'brand');
  const current = () => app.appearance.brand();

  app.get('/brand/:file', async (request, reply) => {
    const b = current();
    if (![b.emblem, b.icon, b.logotype, b.share, b.favicon64, b.favicon180].filter(Boolean).includes(request.params.file)) return reply.callNotFound();
    return reply.sendFile(request.params.file, dir, { maxAge: '365d', immutable: true });
  });

  // Feuille générée : l'emblème en masque CSS (sa couleur suit le thème). Pas de style en ligne (CSP).
  // L'en-tête utilise l'emblème, ou à défaut l'icône ; l'icône le remplace sur téléphone.
  app.get('/brand.css', async (request, reply) => {
    const b = current();
    const mask = (sel, file, ratio) => (file ? `${sel}{-webkit-mask-image:url(/brand/${file});mask-image:url(/brand/${file});aspect-ratio:${ratio || 1}}\n` : '');
    const css = mask('.emblem', b.emblem || b.icon, b.emblem ? b.ratio : b.iconRatio)
      + mask('.emblem-compact', b.icon, b.iconRatio)
      + mask('.logotype', b.logotype, b.logotypeRatio);
    return reply.type('text/css; charset=utf-8').header('cache-control', 'public, max-age=31536000, immutable').send(css);
  });

  // Redirection temporaire, gardée un jour : le fichier visé change (et l'ancien est effacé) à chaque nouvel emblème ;
  // une 301 serait gardée indéfiniment par les navigateurs, qui demanderaient ensuite un fichier disparu.
  app.get('/favicon.ico', async (request, reply) => {
    const b = current();
    if (!b.favicon64) return reply.code(204).send();
    return reply.header('cache-control', 'public, max-age=86400').redirect(`/brand/${b.favicon64}`, 302);
  });
}
