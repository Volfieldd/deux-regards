# Connexion et comptes

L'administration est réservée aux comptes qui ont un rôle (Administrateur, Photographe, Modérateur, Relecteur). L'application **ne stocke et ne gère aucun mot de passe** : la connexion passe par OpenID Connect, avec Zitadel Cloud comme fournisseur. Google peut y être branché comme fournisseur externe.

## Parcours de connexion

1. On ouvre `/admin`. Sans session, le site redirige vers `/auth/login`, puis vers Zitadel.
2. On se connecte sur Zitadel (compte local ou « Continuer avec Google »). La double authentification se règle dans Zitadel.
3. Zitadel renvoie vers `/auth/callback`. Le site vérifie la réponse (`state`, `nonce`, PKCE, signature, émetteur, audience), puis lit les rôles.
4. Le site cherche le **compte** de cette identité (`sub`) dans sa base, ou le crée à la première connexion. Les rôles vivent dans la base du site : Zitadel ne fait que transporter l'identité.
   - **Première connexion avec le rôle `admin`** dans Zitadel (clé réglable par `OIDC_ADMIN_ROLE`, donné dans l'organisation `OIDC_ORG_ID`) : le compte est créé administrateur. Ce rôle Zitadel ne sert qu'à cette amorce. Une fois en ligne, sans `OIDC_ORG_ID`, il est ignoré (amorce par `ADMIN_SUBS` seulement).
   - **Sinon** : le compte est créé **en attente**, et la page « Compte en attente » s'affiche avec l'identifiant (`sub`) de la personne ; aucune session n'est ouverte. Un administrateur vérifie cet identifiant avec elle, puis lui donne un rôle dans **Comptes et rôles** ; la connexion suivante passe. L'e-mail n'est retenu que s'il est vérifié par le fournisseur (`email_verified`).
   - **Compte supprimé** dans l'admin qui revient : il repart **en attente**, sans rôle, même avec le rôle `admin` de Zitadel.
   - **Compte désactivé** : « Accès refusé » (la date de dernière connexion ne change pas).
5. Avec un rôle, une session est ouverte et l'on arrive sur la page demandée. Les rôles sont relus **à chaque requête** : un rôle retiré, un compte désactivé ou supprimé perd l'accès tout de suite. Une session restée sans rôle (compte en attente) propose « Utiliser un autre compte » et « Se déconnecter ».

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

**Retirer l'accès** à quelqu'un : dans l'admin, **Comptes et rôles**, retirer ses rôles, le désactiver ou supprimer son compte. L'effet est immédiat. Retirer son rôle dans Zitadel ne suffit plus (le rôle Zitadel ne sert qu'à la première connexion) ; le bloquer dans Zitadel l'empêche en revanche de se connecter. Un compte supprimé qui se reconnecte revient « en attente », sans rôle ; « Désactivé » garde le compte et refuse la connexion.

**Garde-fou :** les identités listées dans `ADMIN_SUBS` (variable d'environnement, `sub` séparés par des virgules) sont toujours administratrices, même si leur compte a été modifié dans l'admin : une identité ajoutée à la liste après coup (compte désactivé, rôles retirés) redevient administrateur actif à sa connexion, noté au Journal (« Compte rétabli par ADMIN_SUBS »). Il reste aussi toujours au moins un administrateur actif.

## Lier un compte à un photographe

Dans **Comptes et rôles**, choisir le photographe dans « Photographe lié » (un photographe par compte). Une fois lié, il est proposé par défaut à l'import et dans l'app Terrain. Les anciens liens (champ « Compte de connexion » des fiches Photographes) sont devenus des comptes administrateurs lors de la mise à jour.

Toutes les connexions et les actions de l'admin sont notées dans le **Journal** (gardé 13 mois).

## Sessions

| | |
|---|---|
| Durée | 8 h sans activité, et 24 h au plus même en activité |
| Cookie | `__Host-session` en HTTPS (`session` en HTTP local) : `httpOnly`, `SameSite=Lax`, et `Secure` en HTTPS |
| Stockage | côté serveur ; la base ne garde que l'empreinte SHA-256 du jeton |
| Nouvelle connexion | nouvelle session à chaque fois, l'ancienne est détruite |
| Formulaires | jeton anti-falsification (CSRF) sur toute écriture, déconnexion comprise |
| Retour de Zitadel | 10 minutes au plus après le départ (cookie de transaction signé, un par onglet, quatre au plus : au-delà, les plus anciens sont oubliés) ; sinon « Connexion expirée » |

## Repli sans Zitadel

On peut brancher Google (ou un autre fournisseur OIDC) directement, sans Zitadel. Il faut alors renseigner `OIDC_ALLOWED_SUBS` avec les `sub` des administrateurs : un compte de cette liste dont l'e-mail est vérifié par le fournisseur est créé administrateur à sa première connexion. Tout autre compte du fournisseur arrive « en attente », sans accès, jusqu'à ce qu'un administrateur lui donne un rôle (vérifiez son identifiant avec lui avant).

## Connexion locale de test

Elle sert à essayer l'admin sans Zitadel, sur un poste de développement ou un serveur de test :

1. Mettez `LOCAL_AUTH_TOKEN=<au moins 16 caractères aléatoires>` dans `.env`, puis redémarrez.
2. Ouvrez `/admin`. Le formulaire « Connexion de test » demande l'auteur à incarner et le jeton.
3. Un bandeau rouge « Connexion locale de test » reste affiché dans l'admin.

**Garde-fous :**

- le serveur **refuse de démarrer** avec cette variable si `PUBLIC_URL` est en HTTPS ou si `NODE_ENV=production` ;
- le jeton est exigé : un serveur de test exposé sur le réseau local n'est pas ouvert à tous ;
- les tentatives de connexion sont limitées (`AUTH_RATE_LIMIT`).

Si le photographe choisi est lié à un compte, la session reprend ce compte ; sinon elle utilise un compte `local:<slug>`, administrateur à sa création. Les rôles et l'état d'un compte existant ne changent que dans **Comptes et rôles** ; désactivé ou sans rôle, il n'ouvre pas de session (comme en OIDC).

Générer un jeton : `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
