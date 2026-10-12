# Connexion et comptes

L'administration est réservée aux auteurs. L'application **ne stocke et ne gère aucun mot de passe** : la connexion passe par OpenID Connect, avec Zitadel Cloud comme fournisseur. Google peut y être branché comme fournisseur externe.

## Parcours de connexion

1. On ouvre `/admin`. Sans session, le site redirige vers `/auth/login`, puis vers Zitadel.
2. On se connecte sur Zitadel (compte local ou « Continuer avec Google »). La double authentification se règle dans Zitadel.
3. Zitadel renvoie vers `/auth/callback`. Le site vérifie la réponse (`state`, `nonce`, PKCE, signature, émetteur, audience), puis lit les rôles.
4. **Avec le rôle `admin`** (clé réglable par `OIDC_ADMIN_ROLE`, donné dans l'organisation `OIDC_ORG_ID`), une session est ouverte et l'on arrive sur la page demandée.
5. **Sans ce rôle**, la page « Accès refusé » s'affiche, avec un lien « Utiliser un autre compte ». Aucune session n'est créée.

**Déconnexion :** bouton « Se déconnecter » de l'admin. La session est supprimée sur le site **et** chez Zitadel.

## Configurer Zitadel (une fois)

Pas à pas détaillé, avec les écrans de la console : [`deploy/unraid/README.md`, section Zitadel](https://github.com/Volfieldd/deux-regards/blob/main/deploy/unraid/README.md#3-zitadel--la-connexion-à-ladmin). Résumé :

1. Créer une organisation, puis un projet (par exemple « site photo »). Dans le projet, créer le rôle `admin`.
2. Dans le projet, créer une application **Web** :
   - méthode d'authentification **Code** ;
   - URL de redirection `https://<domaine>/auth/callback` (et `http://localhost:3000/auth/callback` pour le développement) ;
   - URL après déconnexion `https://<domaine>/`.
3. Optionnel : ajouter Google comme fournisseur externe (client OAuth à créer dans Google Cloud).
4. Donner le rôle `admin` à Sébastien et Julien, puis désactiver l'inscription libre.
5. Reporter dans `.env` : `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_PROJECT_ID` (identifiant du projet) et `OIDC_ORG_ID` (identifiant de l'organisation).

**Retirer l'accès** à quelqu'un : retirer son rôle dans Zitadel. Sa session sur le site expire au plus tard 24 h après sa connexion ; pour un effet immédiat, supprimer ses sessions en base (voir [Exploitation](Exploitation#opérations-courantes)).

## Lier un compte à un auteur

Le tableau de bord de l'admin affiche l'identifiant `sub` du compte connecté. Pour lier ce compte à un auteur :

1. Copiez le `sub` affiché sur le tableau de bord.
2. Collez-le dans le champ « Compte de connexion » de la fiche de l'auteur (**Auteurs**).

Une fois lié, l'auteur est proposé par défaut à l'import des photos.

## Sessions

| | |
|---|---|
| Durée | 8 h sans activité, et 24 h au plus même en activité |
| Cookie | `__Host-session` en HTTPS (`session` en HTTP local) : `httpOnly`, `SameSite=Lax`, et `Secure` en HTTPS |
| Stockage | côté serveur ; la base ne garde que l'empreinte SHA-256 du jeton |
| Nouvelle connexion | nouvelle session à chaque fois, l'ancienne est détruite |
| Formulaires | jeton anti-falsification (CSRF) sur toute écriture, déconnexion comprise |
| Retour de Zitadel | 10 minutes au plus après le départ (cookie de transaction signé, un par onglet) ; sinon « Connexion expirée » |

## Repli sans Zitadel

On peut brancher Google (ou un autre fournisseur OIDC) directement, sans Zitadel. Il faut alors renseigner `OIDC_ALLOWED_SUBS` avec les `sub` autorisés. Un compte n'entre que s'il est dans cette liste **et** que son e-mail est vérifié par le fournisseur.

## Connexion locale de test

Elle sert à essayer l'admin sans Zitadel, sur un poste de développement ou un serveur de test :

1. Mettez `LOCAL_AUTH_TOKEN=<au moins 16 caractères aléatoires>` dans `.env`, puis redémarrez.
2. Ouvrez `/admin`. Le formulaire « Connexion de test » demande l'auteur à incarner et le jeton.
3. Un bandeau rouge « Connexion locale de test » reste affiché dans l'admin.

**Garde-fous :**

- le serveur **refuse de démarrer** avec cette variable si `PUBLIC_URL` est en HTTPS ou si `NODE_ENV=production` ;
- le jeton est exigé : un serveur de test exposé sur le réseau local n'est pas ouvert à tous ;
- les tentatives de connexion sont limitées (`AUTH_RATE_LIMIT`).

Si l'auteur choisi est lié à un compte OIDC, la session reprend ce `sub` ; sinon elle utilise `local:<slug>`.

Générer un jeton : `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
