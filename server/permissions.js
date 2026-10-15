// Rôles et permissions de l'admin (cadrage du 15 octobre 2026). Le code ne connaît que les permissions, jamais les
// noms de rôles : chaque route de l'admin déclare la sienne (config.perm), et une route qui n'en déclare pas est
// refusée au démarrage. Un rôle est un paquet de permissions ; certaines ont une portée : « tout » ou « les miennes »
// (ce qui appartient au photographe lié au compte). Les rôles vivent dans la base du site ; l'IdP ne fait que
// transporter l'identité.
// Portée « les miennes » : le photographe lié au compte (page « Comptes et rôles ») ; un compte sans photographe lié
// n'a rien à lui. Ce qui n'est pas à lui n'existe pas pour lui (404), et les listes sont filtrées à la source.

// Permission → { scoped : peut se limiter à « les miennes » }.
export const PERMISSIONS = {
  'admin.acceder': {},                 // tableau de bord, aide, langue, thème, recherche, villes, traduction
  'photos.voir': { scoped: true },
  'photos.importer': {},
  'photos.textes': { scoped: true },   // titre, légende, lieu et leurs traductions
  'photos.modifier': { scoped: true }, // tout le reste de la fiche : série, date, photographe, ville, ordre, preuve
  'photos.proposer': { scoped: true },  // proposer à la publication (circuit : le modérateur valide)
  'photos.publier': { scoped: true },   // publier, programmer et dépublier sur le site, valider les propositions (droit à part)
  'photos.publiees.modifier': { scoped: true }, // modifier une photo déjà publiée (réglable par photographe)
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
  'terrain.app': { scoped: true },      // app Rencontre : les rencontres sont enregistrées pour son photographe
  'terrain.cartes': { scoped: true },   // cartes d'accord et QR de son photographe
  'instagram.voir': {},
  'instagram.file': {},
  'instagram.publier': {},             // publier maintenant (droit à part)
  'instagram.compte': {},
  'signalements.traiter': {},
  'statistiques.voir': { scoped: true },
  'taches.adresser': {},               // faire remonter un élément à traiter à un photographe
  'circuit.regler': {},                // régler, photographe par photographe, « publier sans validation » et « modifier ses photos publiées »
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
      ...all(['admin.acceder', 'photos.importer']),
      'terrain.app': OWN, 'terrain.cartes': OWN,
      'photos.voir': OWN, 'photos.textes': OWN, 'photos.modifier': OWN, 'photos.supprimer': OWN, 'photos.original': OWN,
      'photos.proposer': OWN, 'photos.publiees.modifier': OWN,
      'sorties.voir': OWN, 'sorties.gerer': OWN,
      'personnes.voir': OWN, 'personnes.gerer': OWN, 'personnes.refus': OWN, 'personnes.demandes': OWN, 'personnes.offrir': OWN,
      'statistiques.voir': OWN,
    },
  },
  moderateur: {
    label: 'Modérateur',
    // Le modérateur ne retouche pas les photos : il valide, programme, dépublie, ou renvoie avec une remarque.
    perms: all(['admin.acceder', 'photos.voir', 'photos.publier', 'series.gerer', 'instagram.voir', 'instagram.file',
      'instagram.publier', 'signalements.traiter', 'statistiques.voir', 'taches.adresser', 'circuit.regler', 'site.textes']),
  },
  // Le relecteur corrige les textes, y compris ceux des photos déjà en ligne (photos.textes reste sa seule écriture).
  relecteur: { label: 'Relecteur', perms: all(['admin.acceder', 'photos.voir', 'photos.textes', 'photos.publiees.modifier', 'site.textes']) },
};
export const SCOPES = { ALL, OWN };

// Droits réglables photographe par photographe (page « Circuit de publication », permission circuit.regler) :
// ajoutés (sur ses photos seulement) ou retirés de ce que donnent ses rôles.
export const ADJUSTABLE = {
  'photos.publier': 'Publier ses photos sans validation',
  'photos.publiees.modifier': 'Modifier ses photos une fois publiées',
};
// Droits d'un ensemble de rôles : permission → « tout » ou « les miennes » (la plus large l'emporte), puis les
// réglages du compte (adjust : { add: [...], remove: [...] }, seulement des droits de ADJUSTABLE).
export function grantsOf(roles = [], adjust = {}) {
  const out = new Map();
  for (const r of roles) {
    for (const [perm, scope] of Object.entries(ROLES[r]?.perms || {})) if (out.get(perm) !== ALL) out.set(perm, scope);
  }
  if (roles.includes('admin')) return out;                          // l'administrateur n'est jamais restreint
  for (const perm of adjust.remove || []) if (Object.hasOwn(ADJUSTABLE, perm)) out.delete(perm);
  for (const perm of adjust.add || []) if (Object.hasOwn(ADJUSTABLE, perm) && !out.has(perm)) out.set(perm, PERMISSIONS[perm].scoped ? OWN : ALL);
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
    this.grants ??= grantsOf(this.session?.roles, this.session?.adjust);
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
  // Portée d'une permission pour ce compte : null (refusée), { all: true }, ou { all: false, authorId } (le photographe
  // lié ; aucun : -1, rien n'est à lui).
  app.decorateRequest('scope', function (perm) {
    const g = this.can(perm);
    if (!g) return null;
    if (g === ALL) return { all: true };
    return { all: false, authorId: app.accounts?.authorIdOf(this.session?.sub) ?? -1 };
  });
  // Ce qui appartient au photographe authorId est-il accessible pour cette permission ?
  app.decorateRequest('owns', function (perm, authorId) { const s = this.scope(perm); return Boolean(s && (s.all || s.authorId === authorId)); });
  // Une liste réduite à ce qui est accessible (key : la colonne du photographe).
  app.decorateRequest('mine', function (perm, list, key = 'author_id') { const s = this.scope(perm); return !s ? [] : s.all ? list : list.filter(x => x[key] === s.authorId); });
}
