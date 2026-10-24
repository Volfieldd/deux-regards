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
  'instagram.proposer': { scoped: true }, // proposer une photo pour Instagram (circuit : le modérateur la met dans la file)
  'instagram.file': { scoped: true },  // mettre dans la file, la régler, la retirer ; « les miennes » : réglable par photographe
  'instagram.publier': {},             // publier maintenant (droit à part)
  'instagram.compte': {},
  'signalements.traiter': {},
  // Messages des visiteurs (page Contact, demande de licence ; server/messages.js) : lire (le nom, l'adresse et le message
  // déchiffrés), marquer traité, supprimer. Portée « les miennes » : les messages adressés à son photographe (la photo
  // d'une demande de licence est la sienne) et ceux adressés aux deux. Ni le Modérateur ni le Relecteur : ils ne voient
  // pas les adresses des personnes (comme l'adresse laissée avec un signalement).
  'messages.traiter': { scoped: true },
  'statistiques.voir': { scoped: true },
  // Galeries privées (étude G55, registre de la Vigie BV-14 et BV-23) : voir (liste, fiche, suivi des accès, vue équipe de
  // /prive/…), gérer (galerie, photos, ouverture, fermeture, sélections), partager (créer, prolonger, débloquer, révoquer,
  // effacer un accès). Portée « les miennes » : les galeries du photographe lié ; une galerie commune, portée « tout ».
  'galeries.voir': { scoped: true },
  'galeries.gerer': { scoped: true },
  'galeries.partager': { scoped: true },
  'taches.adresser': {},               // faire remonter un élément à traiter à un photographe
  'circuit.regler': {},                // régler, photographe par photographe, « publier sans validation » et « modifier ses photos publiées »
  // Carnets (billets du site, server/carnet.js) : portée « les miennes » = les billets qu'il signe (l'un des auteurs).
  'carnet.voir': { scoped: true },
  'carnet.ecrire': { scoped: true },    // créer, écrire, régler et proposer ses billets ; supprimer un brouillon
  'carnet.textes': {},                  // corriger les textes de tous les billets (relecture), sans les régler
  'carnet.publier': { scoped: true },   // publier, programmer, renvoyer, retirer et republier (droit à part, comme les photos)
  'carnet.publies.modifier': { scoped: true }, // modifier un billet déjà publié (réglable par photographe)
  // Saisons (SA-Q1, matrice validée le 24 octobre) : préparation propre au photographe, publication réservée
  // à l’administration. La direction de publication est un rôle distinct, sans cumul automatique.
  'saisons.voir': { scoped: true },
  'saisons.ecrire': { scoped: true },
  'saisons.publier': { scoped: true },
  'saisons.accueil': {},
  'saisons.vote_relecture': { scoped: true },
  'saisons.vote_valider': { scoped: true },
  'saisons.vote_ordonner': { scoped: true },
  'site.textes': {},
  'site.apparence': {},
  'site.filigrane': {},
  'reglages.droits': {},
  'photographes.gerer': {},
  'comptes.gerer': {},
  'journal.voir': {},
  // Lien « Sécurité » vers la console de la Vigie et résumé signé de ses alertes (nombres par gravité, heure, numéro) :
  // montrer, rien d'autre. Aucune donnée de la Vigie n'est dans le site ; la console a ses propres verrous.
  'securite.voir': {},
};

const ALL = 'tout', OWN = 'les miennes';
const all = list => Object.fromEntries(list.map(p => [p, ALL]));
// Les rôles de départ (d'autres pourront être créés plus tard en cochant des permissions).
export const ROLES = {
  admin: { label: 'Administrateur', perms: all(Object.keys(PERMISSIONS).filter(p => !['saisons.vote_relecture', 'saisons.vote_ordonner'].includes(p))) },
  directeur_publication: { label: 'Direction de publication', perms: all(['admin.acceder', 'saisons.voir', 'saisons.vote_ordonner']) },
  photographe: {
    label: 'Photographe',
    perms: {
      ...all(['admin.acceder', 'photos.importer']),
      'terrain.app': OWN, 'terrain.cartes': OWN,
      'photos.voir': OWN, 'photos.textes': OWN, 'photos.modifier': OWN, 'photos.supprimer': OWN, 'photos.original': OWN,
      'photos.proposer': OWN, 'photos.publiees.modifier': OWN, 'instagram.proposer': OWN,
      'sorties.voir': OWN, 'sorties.gerer': OWN,
      'personnes.voir': OWN, 'personnes.gerer': OWN, 'personnes.refus': OWN, 'personnes.demandes': OWN, 'personnes.offrir': OWN,
      'statistiques.voir': OWN, 'messages.traiter': OWN,
      'galeries.voir': OWN, 'galeries.gerer': OWN, 'galeries.partager': OWN,
      'carnet.voir': OWN, 'carnet.ecrire': OWN, 'carnet.publies.modifier': OWN,
      'saisons.voir': OWN, 'saisons.ecrire': OWN,
    },
  },
  moderateur: {
    label: 'Modérateur',
    // Le modérateur ne retouche pas les photos : il valide, programme, dépublie, ou renvoie avec une remarque. Ni lui ni le
  // relecteur n'ont accès aux galeries privées (décision D16 de l'étude).
    perms: all(['admin.acceder', 'photos.voir', 'photos.publier', 'series.gerer', 'instagram.voir', 'instagram.file',
      'instagram.publier', 'signalements.traiter', 'statistiques.voir', 'taches.adresser', 'circuit.regler', 'site.textes',
      'carnet.voir', 'carnet.publier']),
  },
  // Le relecteur corrige les textes, y compris ceux des photos déjà en ligne (photos.textes reste sa seule écriture).
  relecteur: { label: 'Relecteur', perms: all(['admin.acceder', 'photos.voir', 'photos.textes', 'photos.publiees.modifier', 'site.textes',
    'carnet.voir', 'carnet.textes', 'carnet.publies.modifier', 'saisons.voir', 'saisons.vote_relecture']) },
};
export const SCOPES = { ALL, OWN };

// Droits réglables photographe par photographe (page « Circuit de publication », permission circuit.regler) :
// ajoutés (sur ses photos seulement) ou retirés de ce que donnent ses rôles.
export const ADJUSTABLE = {
  'photos.publier': 'Publier ses photos sans validation',
  'photos.publiees.modifier': 'Modifier ses photos une fois publiées',
  'instagram.file': 'Mettre ses photos dans la file Instagram sans validation',
  'carnet.publier': 'Publier ses billets sans validation',
  'carnet.publies.modifier': 'Modifier ses billets une fois publiés',
};
// Droits d'un ensemble de rôles : permission → « tout » ou « les miennes » (la plus large l'emporte), puis les
// réglages du compte (adjust : { add: [...], remove: [...] }, seulement des droits de ADJUSTABLE). Ces réglages sont
// ceux du rôle Photographe (page « Circuit de publication ») : sans ce rôle, ils ne valent rien, et un retrait n'ôte
// jamais ce qu'un autre rôle du compte donne (un Relecteur garde « modifier les photos publiées »).
export function grantsOf(roles = [], adjust = {}) {
  const out = new Map();
  for (const r of roles) {
    for (const [perm, scope] of Object.entries(ROLES[r]?.perms || {})) if (out.get(perm) !== ALL) out.set(perm, scope);
  }
  if (roles.includes('admin') || !roles.includes('photographe')) return out;   // aucun réglage propre au photographe ne restreint les autres rôles
  const fromOthers = perm => roles.some(r => r !== 'photographe' && ROLES[r]?.perms?.[perm]);
  for (const perm of adjust.remove || []) if (Object.hasOwn(ADJUSTABLE, perm) && !fromOthers(perm)) out.delete(perm);
  for (const perm of adjust.add || []) if (Object.hasOwn(ADJUSTABLE, perm) && !out.has(perm)) out.set(perm, PERMISSIONS[perm].scoped ? OWN : ALL);
  return out;
}
// Le compte a-t-il au moins un rôle de l'admin ?
export const hasRole = roles => (roles || []).some(r => Object.hasOwn(ROLES, r));

// Branchement sur Fastify : request.can(perm) → « tout », « les miennes » ou false ; app.requirePermission vérifie la
// permission déclarée par la route ; app.forbid répond 403 en HTML ou en JSON selon l'appel.
export function registerPermissions(app, { renderError }) {
  app.decorateRequest('grants', null);
  app.decorateRequest('ownAuthor', undefined);
  app.decorateRequest('can', function (perm) {
    if (!Object.hasOwn(PERMISSIONS, perm)) throw new Error(`permission inconnue : ${perm}`);
    this.grants ??= grantsOf(this.session?.roles, this.session?.adjust);
    return this.grants.get(perm) || false;
  });
  // La page refusée de l'admin v2 : posée par views/routes de l'admin (un plugin à part, dont les décorations ne remontent pas à
  // ce niveau), d'où un objet partagé que la route remplit.
  const forbidPage = { render: null };
  app.decorate('forbidPage', forbidPage);
  const forbid = (request, reply) => {
    app.securite?.emit('authz_fail', { request, emetteur: 'server/permissions.js · droit refusé', detail: { raison: 'permission', permission: request.routeOptions?.config?.perm ?? null } });
    const json = !String(request.headers.accept || '').includes('text/html');
    reply.code(403).header('cache-control', 'no-store');
    const t = request.t || (x => x);                                            // langue de l'admin (posée avant ce contrôle)
    // Admin v2 : la page refusée dans la mise en page de l'admin (menu, bandeaux de la Vigie), pour un compte en v2 seulement.
    // Si le rendu v2 échoue (tout de suite ou à l'envoi), la page du site (v1) est servie : un refus ne devient jamais une erreur 500.
    const siteVersion = () => renderError(reply, 403, { t: request.t, title: t('Accès refusé'), message: t('Ce compte n’a pas le droit de faire cela.'), adminLink: true });
    if (!json && forbidPage.render) {
      const lost = err => { request.log.error({ err }, 'page refusée v2 : repli sur la page du site'); return siteVersion(); };
      try { const page = forbidPage.render(request, reply); if (page) return typeof page.then === 'function' ? page.catch(lost) : page; } catch (err) { return lost(err); }
    }
    return json ? reply.send({ error: t('Accès refusé : ce compte n’a pas ce droit.') })
      : renderError(reply, 403, { t: request.t, title: t('Accès refusé'), message: t('Ce compte n’a pas le droit de faire cela.'), adminLink: true });
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
    if (this.ownAuthor === undefined) this.ownAuthor = app.accounts?.authorIdOf(this.session?.sub) ?? -1;   // une fois par requête
    return { all: false, authorId: this.ownAuthor };
  });
  // Ce qui appartient au photographe authorId est-il accessible pour cette permission ?
  app.decorateRequest('owns', function (perm, authorId) { const s = this.scope(perm); return Boolean(s && (s.all || s.authorId === authorId)); });
  // Une liste réduite à ce qui est accessible (key : la colonne du photographe).
  app.decorateRequest('mine', function (perm, list, key = 'author_id') { const s = this.scope(perm); return !s ? [] : s.all ? list : list.filter(x => x[key] === s.authorId); });
}
