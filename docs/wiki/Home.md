# Nicephos — wiki

Nicephos, le site photo de Sébastien et Julien : une galerie publique et une administration réservée aux auteurs. Le nom affiché se change dans l'admin (**Site public**) ou par `SITE_NAME`.

## Pour qui, quelle page

| Vous voulez… | Page |
|---|---|
| Voir à quoi ressemble l'admin | [Visite de l'admin](Visite-de-l-admin) |
| Publier, ranger et retoucher les photos : tous les gestes | [Aide de l'administration](Aide) (aussi dans l'admin, menu « Aide ») |
| Changer de thème, mettre le logo, créer un thème | [Apparence et thèmes](Apparence-et-thèmes) |
| Ajouter un filigrane, choisir les EXIF | [Filigrane et EXIF](Filigrane-et-EXIF) |
| Prouver l'antériorité d'une photo, afficher ses droits | [Preuves d'antériorité et droits](Preuves-et-droits) |
| Publier sur Instagram (file, créneaux, légendes, likes) | [Publication sur Instagram](Instagram) |
| Gérer les personnes photographiées (cartes, QR, app sur l'iPhone, accords, refus) | [Aide → Rencontres](Aide-Rencontres) |
| **Faire une opération ponctuelle** : mise à jour, chiffrement, deux facteurs, e-mails, app iPhone, impression, demande RGPD, violation, restauration | **[Procédures](Procédures)** |
| Installer et lancer le site | [Installation](Installation) |
| Installer et faire tourner le site sur Unraid (pile Compose) | [Guide Unraid](Unraid) |
| Mettre en ligne (Docker, Cloudflare Tunnel), sauvegarder, restaurer | [Déploiement](Déploiement) |
| Régler le serveur (variables d'environnement) | [Configuration](Configuration) |
| Configurer Zitadel, gérer les comptes | [Connexion et comptes](Connexion-et-comptes) |
| Comprendre le traitement des images | [Images et variantes](Images-et-variantes) |
| Connaître les protections en place | [Sécurité](Sécurité) |
| Registre des traitements, accord, analyse d'impact (RGPD) | [RGPD](RGPD) |
| Lancer les tests | [Tests](Tests) |
| Sauvegarder, surveiller, dépanner | [Exploitation](Exploitation) |
| Voir ce que fait le site, fonction par fonction | [Spécifications](Spécifications) |
| Reprendre le développement : code, règles, cycle PR → image → déploiement | [Développer](Développer) |

## En bref

- **Site public :**
  - ouverture plein cadre, filtre par photographe, séries, grille, visionneuse (retour à la série à l'endroit quitté) ;
  - en **français, anglais et allemand** (`/en`, `/de`), langue choisie d'après le pays et le navigateur, sélecteur à drapeaux ;
  - page **Carte** facultative (vignettes des photos sur leur ville) ;
  - page **`/bonjour`** pour les personnes photographiées (QR des cartes et des vêtements) : recevoir sa photo, accepter ou refuser la publication, demander ses données ;
  - pages Droits d'utilisation et **Confidentialité** (RGPD) ;
  - il fonctionne sans JavaScript ; aucune ressource n'est chargée depuis un autre site.
- **Admin :**
  - photos (import, édition, publication, ordre), séries, auteurs, réglages, filigrane et EXIF, statistiques anonymes, publication sur Instagram (avec les likes relevés chaque jour) ;
  - **traductions** des textes proposées par un LibreTranslate local ;
  - **Personnes** et **Sur le terrain** : accords et refus des personnes photographiées, cartes d'accord numérotées à imprimer, QR des vêtements, **app installable sur l'iPhone** (signature au doigt), photo offerte par lien privé, export et effacement des données ;
  - utilisable sur ordinateur et sur iPhone ;
  - accès par connexion OIDC (Zitadel) avec le rôle `admin`. L'application ne gère aucun mot de passe.
- **Données personnelles :** chiffrées dans la base (`DATA_KEY`), durées de conservation automatiques, documents RGPD tenus à jour.
- **Images :**
  - chaque original est horodaté par une autorité tierce (preuve d'antériorité) ;
  - les originaux ne sont jamais servis ;
  - le site sert des variantes AVIF et WebP en 640, 1280 et 2000 px, sans métadonnées par défaut.
- **Technique :** Node.js 22, Fastify, SQLite, sharp et gabarits Eta, sans framework front ni étape de build.

Le code source est sur [GitHub](https://github.com/Volfieldd/deux-regards) (dépôt `deux-regards`, nom de travail du projet) ; les choix, l'historique et la feuille de route sont dans [`PLAN.md`](https://github.com/Volfieldd/deux-regards/blob/main/PLAN.md). Site en ligne : https://www.nicephos.art.
