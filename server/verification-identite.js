// Bandeau de la vérification d'identité (décision verifier_identite de la Vigie, décision du propriétaire du 19 octobre
// 2026) : pour une session authentifiée avant que la Vigie redemande l'identité de son compte, l'admin reste lisible mais
// toute écriture est arrêtée (server/auth.js, requireFreshIdentity). Le bandeau le dit et mène à /auth/verifier (nouvelle
// connexion chez Zitadel, second facteur compris), qui ramène à la page affichée.
// Données construites ici, côté serveur, dans la langue de l'admin : les gabarits (admin v1, et l'admin v2 qui n'aura
// qu'à reprendre it.identite) ne font que les afficher. Rien de la décision (motif, règle, alerte) n'y paraît.

// decisions : app.decisions (absent sans Vigie : jamais de bandeau). hrefOf : lien vers /auth/verifier (app.identityHref).
export function createIdentityBanner({ decisions, hrefOf }) {
  return function banner(request) {
    const v = request.session && decisions?.identityRequired(request.session);
    if (!v) return null;
    const t = request.t || (x => x);
    // Retour : la page affichée (obtenue par GET), sinon l'accueil de l'admin.
    const next = request.method === 'GET' && /^\/admin(?:[/?#]|$)/.test(request.url) && request.url.length <= 1000 ? request.url : '/admin';
    return {
      title: t('Par sécurité, confirmez votre identité avant de modifier quoi que ce soit.'),
      detail: t('Une nouvelle connexion est demandée pour ce compte, clé d’accès comprise. Vous pouvez consulter l’administration ; rien ne sera enregistré avant cette confirmation.'),
      href: hrefOf(next),
      action: t('Confirmer mon identité'),
    };
  };
}
