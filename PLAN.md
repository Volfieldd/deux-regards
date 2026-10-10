# Plan d'implémentation

Site photo de Sébastien et Julien. Nom provisoire : « Deux Regards » (déjà pris, à remplacer ; il est défini à un seul endroit dans la config).

Références de design (artefacts claude.ai) :
- Mix retenu : https://claude.ai/artifact/41G7RSWC6zQQh1gsoXtGRG
- Prototype des 4 directions : https://claude.ai/artifact/WAfffW6sWdDvLWLDPRPAq5
- Maquettes (pages photo, mobile, admin) : https://claude.ai/artifact/WDgwfg3Nn9GYXnaQszKnKc

## Principes

- Front simple : HTML/CSS/JS sans framework ni build, rendu côté serveur, dans l'esprit du prototype.
- Backend unique : tout s'administre après authentification.
- Authentification exclusivement OIDC. Aucun mot de passe stocké ni géré par l'application.
- Les originaux ne sont jamais exposés : seules des variantes redimensionnées, sans EXIF, sont servies.

## Stack

| Rôle | Choix |
|---|---|
| Serveur | Node.js LTS + Fastify |
| Données | SQLite (`better-sqlite3`), migrations SQL versionnées |
| Images | `sharp` (resize, AVIF/WebP, suppression EXIF) |
| Gabarits | Eta |
| Auth | `openid-client` (Authorization Code + PKCE) |
| Identité | Zitadel Cloud, Google en IdP externe dans Zitadel |
| Déploiement | Docker + Caddy (HTTPS), sauvegarde de `storage/` et de la base |

## Authentification OIDC

Flux : `/auth/login` → Zitadel (connexion locale ou « Continuer avec Google ») → `/auth/callback` → session.

- Client OIDC de type « Web », Authorization Code + PKCE, `state` et `nonce` vérifiés.
- Scopes : `openid profile email` + `urn:zitadel:iam:org:project:id:{projectId}:aud` pour recevoir les rôles.
- Autorisation : rôle de projet Zitadel `admin`, lu dans le claim `urn:zitadel:iam:org:project:roles`. Sans ce rôle : 403, même authentifié.
- Repli sans Zitadel (Google en direct) : même code, autorisation par liste blanche de `sub` avec `email_verified` à vrai.
- Session côté serveur (table `sessions`), cookie `httpOnly` + `Secure` + `SameSite=Lax`, ID régénéré à la connexion, expiration glissante.
- CSRF : jeton synchronisé sur toutes les routes d'écriture de l'admin.
- Déconnexion : suppression de la session + RP-initiated logout (`end_session_endpoint`).
- Config par variables d'environnement : `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_PROJECT_ID`, `OIDC_REDIRECT_URI`, `OIDC_ADMIN_ROLE`, `OIDC_ALLOWED_SUBS` (repli).
- La double authentification et la politique de connexion se règlent dans Zitadel, pas dans l'application.

## Modèle de données

- `authors` : id, nom, slug, bio, `oidc_sub` (lien avec le compte)
- `categories` : id, nom, slug, ordre
- `photos` : id, slug, titre, catégorie, auteur, lieu, date, légende, statut (brouillon/publiée), ordre, fichier original, dimensions
- `settings` : nom du site, accroche, texte « À propos », photos de l'ouverture
- `sessions` : id, sub, rôles, expiration

## Arborescence

```
server/        Fastify : routes publiques, API admin, auth OIDC
  db/          schéma + migrations
  images/      pipeline sharp
views/         gabarits publics et admin
public/        CSS/JS du site (repris du mix)
admin/         CSS/JS de l'admin
storage/
  originals/   jamais servi
  variants/    servi (640 / 1280 / 2000 px, AVIF + WebP)
```

## Phases

### 0. Socle (fait)
- Projet Node, Fastify, SQLite, migrations, scripts `dev` / `start` / `test`.
- Seed avec les 12 photos et les données du prototype.
- Fichier `.env.example`, `.gitignore` (dont `storage/` et la base).

### 1. Front public, d'après le mix (fait)
- Ouverture plein cadre avec fondu et vignettes (photos choisies dans les réglages).
- Filtre « deux regards » : les deux / Sébastien / Julien.
- Index des séries en grand avec aperçu au survol.
- Grille en quinconce, numérotation `N°04 · Rue · J`.
- Page photo `/photo/:slug` : visionneuse noire, précédente/suivante, clavier, swipe, légende.
- Pages `/serie/:slug`, `/auteur/:slug`, `/a-propos`.
- Le site reste lisible sans JS ; le JS ajoute le fondu, le swipe et le filtre sans rechargement.
- Polices auto-hébergées (@fontsource), CSP stricte sans ressource tierce.

### 2. Images (pipeline fait ; reste l'import depuis l'admin)
- Import : original vers `storage/originals/`, variantes générées, EXIF supprimé, rotation EXIF appliquée avant suppression.
- `srcset` + `sizes`, lazy-loading, dimensions explicites (pas de saut de mise en page).
- Dissuasion : clic droit et glisser désactivés sur les images, en-tête `Cache-Control` long sur les variantes.

### 3. Auth OIDC (fait)
- Routes `/auth/login`, `/auth/callback`, `/auth/logout` (POST + CSRF), préhandlers `requireAdmin` et `verifyCsrf`.
- Transaction (state, nonce, PKCE) dans un cookie signé de 10 min ; `next` limité aux chemins locaux.
- Rôles lus dans l'ID token, complétés par userinfo si Zitadel ne les y met pas.
- Session : jeton aléatoire dans le cookie (`__Host-` en HTTPS), seule son empreinte SHA-256 en base ; 8 h glissantes, 7 jours au plus.
- `/admin` minimal (identité + déconnexion) en attendant la phase 4.
- Tests de bout en bout contre un faux fournisseur OIDC : rôle absent → 403 sans session, `state` invalide → refus, code rejoué, session expirée → redirection, régénération, déconnexion.

### 4. Admin (tout administrable)
- Photos : import multiple par glisser-déposer, édition, brouillon/publiée, réordonnancement par glisser, recherche, filtres, suppression avec confirmation dans la page.
- Séries : création, renommage, ordre, suppression (bloquée si la série contient des photos).
- Auteurs : nom, bio, lien avec le compte OIDC.
- Réglages : nom du site, accroche, à propos, photos de l'ouverture.

### 5. Mise en ligne
- Dockerfile, Caddyfile, volume persistant pour `storage/` et la base.
- Sauvegarde quotidienne, sitemap, Open Graph, passe d'accessibilité (focus, contrastes, `prefers-reduced-motion`, textes alternatifs).

## Côté Zitadel (à faire une fois)

1. Créer une organisation et un projet « site photo » avec un rôle `admin`.
2. Créer une application OIDC « Web », méthode d'authentification « Code » (client_secret_basic ; l'application envoie aussi PKCE), redirect `https://<domaine>/auth/callback` (et `http://localhost:3000/auth/callback` en dev), post-logout redirect vers le site.
3. Ajouter Google comme IdP externe (client OAuth Google à créer dans Google Cloud).
4. Donner le rôle `admin` à Sébastien et Julien ; désactiver l'inscription libre.

## Ouvert

- Nom définitif et domaine.
- Les vraies photos (les maquettes en annoncent 48).
