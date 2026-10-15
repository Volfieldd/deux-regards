// Rôles et permissions de l'admin (cadrage du 15 octobre 2026). Le code ne connaît que les permissions, jamais les
// noms de rôles : chaque route de l'admin déclare la sienne (config.perm), et une route qui n'en déclare pas est
// refusée au démarrage. Un rôle est un paquet de permissions ; certaines ont une portée : « tout » ou « les miennes »
// (ce qui appartient au photographe lié au compte). Les rôles vivent dans la base du site ; l'IdP ne fait que
// transporter l'identité.
// Étape 1 (socle) : tous les comptes existants sont administrateurs ; la portée « les miennes » est déclarée ici et
// sera appliquée aux listes à l'étape 3.

// Permission → { scoped : peut se limiter à « les miennes » }.
export const PERMISSIONS = {
  'admin.acceder': {},                 // tableau de bord, aide, langue, thème, recherche, villes, traduction
  'photos.voir': { scoped: true },
  'photos.importer': {},
  'photos.textes': { scoped: true },   // titre, légende, lieu et leurs traductions
  'photos.modifier': { scoped: true }, // tout le reste de la fiche : série, date, photographe, ville, ordre, preuve
  'photos.publier': {},                // publier et dépublier sur le site (droit à part)
  'photos.supprimer': { scoped: true },
  'photos.original': { scoped: true }, // télécharger l'original (avec son GPS)
  'series.gerer': {},
  'series.propositions': {},
  'sorties.voir': { scoped: true },
  'sorties.gerer': { scoped: true },
  'personnes.voir': { scoped: true },
  'personnes.gerer': { scoped: true },
  'personnes.refus': { scoped: true },
  'personnes.demandes': { scoped: true }, // voir les réclamations et demandes RGPD
  'personnes.exporter': {},
  'personnes.effacer': {},             // effacer, et marquer une demande RGPD comme traitée
  'personnes.offrir': { scoped: true },
  'terrain.app': {},
  'terrain.cartes': {},
  'instagram.voir': {},
  'instagram.file': {},
  'instagram.publier': {},             // publier maintenant (droit à part)
  'instagram.compte': {},
  'signalements.traiter': {},
  'statistiques.voir': { scoped: true },
  'taches.adresser': {},               // faire remonter un élément à traiter à un photographe
  'site.textes': {},
  'site.apparence': {},
  'site.filigrane': {},
  'reglages.droits': {},
  'photographes.gerer': {},
  'comptes.gerer': {},
  'journal.voir': {},
};

const ALL = 'tout', OWN = 'les miennes';
const all = list => Object.fromEntries(list.map(p => [p, ALL]));
// Les quatre rôles de départ (d'autres pourront être créés plus tard en cochant des permissions).
export const ROLES = {
  admin: { label: 'Administrateur', perms: all(Object.keys(PERMISSIONS)) },
  photographe: {
    label: 'Photographe',
    perms: {
      ...all(['admin.acceder', 'photos.importer', 'terrain.app', 'terrain.cartes']),
      'photos.voir': OWN, 'photos.textes': OWN, 'photos.modifier': OWN, 'photos.supprimer': OWN, 'photos.original': OWN,
      'sorties.voir': OWN, 'sorties.gerer': OWN,
      'personnes.voir': OWN, 'personnes.gerer': OWN, 'personnes.refus': OWN, 'personnes.demandes': OWN, 'personnes.offrir': OWN,
      'statistiques.voir': OWN,
    },
  },
  moderateur: {
    label: 'Modérateur',
    perms: all(['admin.acceder', 'photos.voir', 'photos.textes', 'photos.publier', 'series.gerer', 'instagram.voir', 'instagram.file',
      'instagram.publier', 'signalements.traiter', 'statistiques.voir', 'taches.adresser', 'site.textes']),
  },
  relecteur: { label: 'Relecteur', perms: all(['admin.acceder', 'photos.voir', 'photos.textes', 'site.textes']) },
};
export const SCOPES = { ALL, OWN };

// Droits d'un ensemble de rôles : permission → « tout » ou « les miennes » (la plus large l'emporte).
export function grantsOf(roles = []) {
  const out = new Map();
  for (const r of roles) {
    for (const [perm, scope] of Object.entries(ROLES[r]?.perms || {})) if (out.get(perm) !== ALL) out.set(perm, scope);
  }
  return out;
}
// Le compte a-t-il au moins un rôle de l'admin ?
export const hasRole = roles => (roles || []).some(r => Object.hasOwn(ROLES, r));

// Branchement sur Fastify : request.can(perm) → « tout », « les miennes » ou false ; app.requirePermission vérifie la
// permission déclarée par la route ; app.forbid répond 403 en HTML ou en JSON selon l'appel.
export function registerPermissions(app, { renderError }) {
  app.decorateRequest('grants', null);
  app.decorateRequest('can', function (perm) {
    if (!Object.hasOwn(PERMISSIONS, perm)) throw new Error(`permission inconnue : ${perm}`);
    this.grants ??= grantsOf(this.session?.roles);
    return this.grants.get(perm) || false;
  });
  const forbid = (request, reply) => {
    const json = !String(request.headers.accept || '').includes('text/html');
    reply.code(403).header('cache-control', 'no-store');
    return json ? reply.send({ error: 'Accès refusé : ce compte n’a pas ce droit.' })
      : renderError(reply, 403, { title: 'Accès refusé', message: 'Ce compte n’a pas le droit de faire cela.' });
  };
  app.decorate('forbid', forbid);
  app.decorate('requirePermission', async function (request, reply) {
    const perm = request.routeOptions.config?.perm;
    if (!perm || !request.can(perm)) return forbid(request, reply);      // fermé par défaut
  });
}
