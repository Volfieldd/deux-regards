# Nicephos — wiki

Nicephos, le site photo de Sébastien et Julien : une galerie publique et une administration réservée aux auteurs. Le nom affiché se change dans l'admin (**Réglages**) ou par `SITE_NAME`.

## Pour qui, quelle page

| Vous voulez… | Page |
|---|---|
| Voir à quoi ressemble l'admin | [Visite de l'admin](Visite-de-l-admin) |
| Publier, ranger et retoucher les photos : tous les gestes | [Aide de l'administration](Aide) (aussi dans l'admin, menu « Aide ») |
| Changer de thème, mettre le logo, créer un thème | [Apparence et thèmes](Apparence-et-thèmes) |
| Ajouter un filigrane, choisir les EXIF | [Filigrane et EXIF](Filigrane-et-EXIF) |
| Prouver l'antériorité d'une photo, afficher ses droits | [Preuves d'antériorité et droits](Preuves-et-droits) |
| Installer et lancer le site | [Installation](Installation) |
| Mettre en ligne (Docker, Cloudflare Tunnel), sauvegarder, restaurer | [Déploiement](Déploiement) |
| Régler le serveur (variables d'environnement) | [Configuration](Configuration) |
| Configurer Zitadel, gérer les comptes | [Connexion et comptes](Connexion-et-comptes) |
| Comprendre le traitement des images | [Images et variantes](Images-et-variantes) |
| Connaître les protections en place | [Sécurité](Sécurité) |
| Lancer les tests | [Tests](Tests) |
| Sauvegarder, surveiller, dépanner | [Exploitation](Exploitation) |
| Voir ce que fait le site, fonction par fonction | [Spécifications](Spécifications) |

## En bref

- **Site public :**
  - ouverture plein cadre, filtre par photographe, séries, grille, visionneuse ;
  - il fonctionne sans JavaScript ;
  - aucune ressource n'est chargée depuis un autre site.
- **Admin :**
  - photos (import, édition, publication, ordre), séries, auteurs, réglages, filigrane et EXIF ;
  - accès par connexion OIDC (Zitadel) avec le rôle `admin`. L'application ne gère aucun mot de passe.
- **Images :**
  - chaque original est horodaté par une autorité tierce (preuve d'antériorité) ;
  - les originaux ne sont jamais servis ;
  - le site sert des variantes AVIF et WebP en 640, 1280 et 2000 px, sans métadonnées par défaut.
- **Technique :** Node.js 22, Fastify, SQLite, sharp et gabarits Eta, sans framework front ni étape de build.

Le code source et l'historique sont sur [GitHub](https://github.com/Volfieldd/deux-regards) ; le plan de réalisation est dans [`PLAN.md`](https://github.com/Volfieldd/deux-regards/blob/main/PLAN.md).
