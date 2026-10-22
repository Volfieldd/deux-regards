import { GRAVITES } from '../../veille.js';
import { dateHeure } from '../format.js';

// Lecture seule, y compris pour la Lectrice. Une consultation ne déclenche jamais de requête distante.
export function vueVeille(etat, query = {}) {
  const cible = ['site', 'vigie'].includes(query.cible) ? query.cible : 'tous';
  const gravite = Object.hasOwn(GRAVITES, query.gravite) ? query.gravite : 'toutes';
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  const inclut = p => (cible === 'tous' || p.usages.some(u => u.cible === cible));
  const cherche = x => x.toLowerCase().includes(q.toLowerCase());
  const avis = (etat?.avis || []).map(a => ({ ...a, paquets: a.paquets.filter(inclut) }))
    .filter(a => a.paquets.length && (gravite === 'toutes' || a.gravite === gravite)
      && (!q || cherche([a.id, a.titre, ...a.aliases, ...a.paquets.map(p => p.nom)].join(' '))));
  const pages = Math.max(1, Math.ceil(avis.length / 30));
  const page = Math.min(pages, /^\d{1,4}$/.test(query.p) ? Math.max(1, Number(query.p)) : 1);
  const lien = p => `/veille?${new URLSearchParams({ cible, gravite, q, p: String(p) })}`;
  return { etat, cible, gravite, q, gravites: GRAVITES, avis: avis.slice((page - 1) * 30, page * 30), total: avis.length, page, pages,
    precedent: page > 1 ? lien(page - 1) : null, suivant: page < pages ? lien(page + 1) : null,
    paquets: (etat?.inventaire.paquets || []).filter(p => inclut(p) && (!q || cherche(p.nom))),
    date: t => t == null ? 'Pas encore effectuée' : dateHeure(t) };
}

export function register(app, ctx) {
  app.get('/veille', async (req, reply) => ctx.view(reply, req, 'veille', {
    page: 'veille', titre: 'Veille des vulnérabilités', vue: vueVeille(ctx.veille?.etat() ?? null, req.query),
  }));
}
