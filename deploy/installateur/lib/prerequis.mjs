// Prérequis affichés au début de l'installation : ce que la machine doit avoir (vérifié par le lanceur), et les comptes
// et jetons à préparer (vérifiés à la saisie). Chaque élément a son pas à pas, affiché à la demande.

// Droits du jeton Cloudflare de l'installateur, par usage. Les libellés sont ceux du formulaire de Cloudflare
// (My Profile → API Tokens → Create Token → Custom token).
export const DROITS_CLOUDFLARE = {
  base: [
    ['Account', 'Cloudflare Tunnel', 'Edit', 'créer le tunnel et ses adresses publiques'],
    ['Zone', 'Zone', 'Read', 'trouver la zone'],
    ['Zone', 'DNS', 'Edit', 'enregistrements www, @ et * (et DNSSEC avec le durcissement)'],
    ['Zone', 'Zone Settings', 'Edit', 'Always Use HTTPS (et les réglages TLS du durcissement)'],
    ['Zone', 'Single Redirect', 'Edit', 'la redirection de toutes les adresses vers www'],
  ],
  durcissement: [
    ['Zone', 'Zone WAF', 'Edit', 'règles personnalisées et limite de débit des images'],
    ['Zone', 'Managed Headers', 'Edit', 'en-têtes gérés (pays du visiteur, X-Powered-By)'],
    ['Account', 'Account Filter Lists', 'Edit', 'liste vigie_bloquees (vide), lue par la première règle'],
  ],
  vigie: [
    ['Account', 'Access: Apps and Policies', 'Edit', 'application Access devant la console de la Vigie'],
    ['Account', 'Access: Organizations, Identity Providers, and Groups', 'Edit', 'connexion par Zitadel dans Access'],
  ],
};

export function prerequis({ mode, hote = {} }) {
  const unraid = mode === 'unraid';
  const versionOk = (v, min) => {
    if (!v) return false;
    const a = v.split('.').map(Number), b = min.split('.').map(Number);
    for (let i = 0; i < b.length; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; }
    return true;
  };
  const liste = [
    {
      groupe: 'La machine', titre: unraid ? 'Unraid 6.12 ou plus' : 'Linux 64 bits (x86-64) avec Docker',
      etat: unraid ? (versionOk(hote.unraid, '6.12') ? 'ok' : hote.unraid ? 'ko' : 'inconnu') : 'ok',
      detail: unraid ? `Version trouvée : ${hote.unraid || '?'}.` : 'L’image est construite pour linux/amd64.',
    },
    {
      groupe: 'La machine', titre: 'Docker et Docker Compose v2',
      etat: hote.docker && hote.compose ? 'ok' : 'inconnu',
      detail: `Docker ${hote.docker || '?'}, Compose ${hote.compose || '?'}.${unraid ? ' Compose vient du plugin « Docker Compose Manager » (Apps).' : ''}`,
    },
    ...(unraid ? [{
      groupe: 'La machine', titre: 'Plugin « Docker Compose Manager »', etat: hote.composeManager ? 'ok' : 'ko',
      detail: 'Apps → rechercher « Compose Manager » → Install. La pile apparaît ensuite dans l’onglet Docker, en bas.',
    }] : []),
    {
      groupe: 'La machine', titre: 'Connexion au registre privé ghcr.io', etat: hote.image ? 'ok' : 'inconnu',
      detail: `Image ${hote.image || '?'} téléchargée.${unraid ? (hote.authGardee ? ' Connexion gardée au redémarrage.' : ' Connexion pas encore gardée au redémarrage (le lanceur le propose).') : ''}`,
    },
    {
      groupe: 'La machine', titre: unraid ? 'Un pool pour les données, chiffré de préférence, et d’autres disques pour les sauvegardes' : 'Un dossier pour les données (disque chiffré de préférence) et un autre disque pour les sauvegardes',
      etat: 'a-voir',
      detail: unraid
        ? 'Chemin direct du pool (/mnt/<pool>/…, jamais /mnt/user/…). Pool chiffré : Main → pool → système de fichiers « xfs - encrypted » (voir « Chiffrer les données » du README Unraid). Partages de ces dossiers non exportés (Shares → SMB/NFS Export : No).'
        : 'Les deux dossiers sont créés par l’installateur s’ils n’existent pas.',
    },
    {
      groupe: 'Les comptes', titre: 'Le domaine dans Cloudflare, zone « Active »', etat: 'a-voir',
      detail: 'dash.cloudflare.com → Add a domain (offre Free), puis changer les serveurs DNS chez le registraire comme Cloudflare l’indique. La zone doit être « Active » (quelques minutes à 24 h).',
    },
    {
      groupe: 'Les comptes', titre: 'Un jeton d’API Cloudflare pour l’installateur', etat: 'a-voir',
      detail: [
        'dash.cloudflare.com → My Profile → API Tokens → Create Token → Custom token (« Get started »).',
        'Nom : « Nicephos : installateur ». Permissions (bouton « + Add more » pour chaque ligne) :',
        ...DROITS_CLOUDFLARE.base.map(d => `  • ${d[0]} → ${d[1]} → ${d[2]}   (${d[3]})`),
        'Avec le durcissement conseillé (WAF, limite de débit) :',
        ...DROITS_CLOUDFLARE.durcissement.map(d => `  • ${d[0]} → ${d[1]} → ${d[2]}   (${d[3]})`),
        'Avec la console de la Vigie :',
        ...DROITS_CLOUDFLARE.vigie.map(d => `  • ${d[0]} → ${d[1]} → ${d[2]}   (${d[3]})`),
        'Account Resources : votre compte seulement. Zone Resources : Specific zone → votre domaine.',
        'TTL : jusqu’à demain. Le jeton ne sert qu’à l’installation : supprimez-le ensuite (rappelé à la fin).',
      ].join('\n'),
    },
    {
      groupe: 'Les comptes', titre: 'Une instance Zitadel Cloud', etat: 'a-voir',
      detail: 'zitadel.com → Sign up → créer une instance (offre gratuite, région Europe). Son adresse (https://<nom>.zitadel.cloud) est demandée plus loin.',
    },
    {
      groupe: 'Les comptes', titre: 'Un compte de service Zitadel « installateur » et son jeton', etat: 'a-voir',
      detail: [
        'Console de l’instance (https://<nom>.zitadel.cloud/ui/console) :',
        '  1. Users → Service Users → New : nom d’utilisateur « installateur », type de jeton Bearer → Create.',
        '  2. Dans sa fiche → Personal Access Tokens → New : expiration demain → copier le jeton (montré une fois).',
        '  3. Menu de l’instance (Default settings / Instance) → Managers → Add → « installateur » → rôle IAM_OWNER.',
        '     (ORG_OWNER de l’organisation suffit sans la Vigie : son compte de lecture demande un rôle d’instance.)',
        'Le compte ne sert qu’à l’installation : supprimez-le ensuite (rappelé à la fin).',
      ].join('\n'),
    },
    {
      groupe: 'Les comptes', titre: 'Les adresses e-mail des administrateurs', etat: 'a-voir',
      detail: 'Chacun reçoit de Zitadel une invitation pour choisir son mot de passe, puis enregistre deux facteurs (clé d’accès et application d’authentification) à la première connexion.',
    },
    {
      groupe: 'Facultatif', titre: 'Console de la Vigie : Cloudflare Zero Trust activé', etat: 'a-voir',
      detail: 'one.dash.cloudflare.com → première ouverture : choisir un nom d’équipe et l’offre Free (une carte peut être demandée, sans débit). L’installateur fait le reste (connexion par Zitadel, application Access, politique).',
    },
  ];
  return liste;
}
