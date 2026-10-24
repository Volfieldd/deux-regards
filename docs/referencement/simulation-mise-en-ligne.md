# Simulation de mise en ligne et préparation Search Console

Contrôle exécuté le 24 octobre 2026 pour la PR #227, version 1.227.0. L’image est construite avec le `Dockerfile` du dépôt et ses dépendances verrouillées, puis exécutée en mode production derrière un mandataire HTTPS local. Le corpus et les comptes sont synthétiques. Aucune base, sauvegarde, photo personnelle, propriété Search Console ou infrastructure de production n’a été consultée ou modifiée.

Le [parcours Search Console et le plan éditorial](search-console-et-contenu.md) complètent les observations ci-dessous. Une réponse locale autorisant l’indexation ne signifie pas que Google a indexé la page.

## Cible et corpus

- Image de production contrôlée : `sha256:1e01f8342139eec14b3882b0381a430077ed0db48e9af6b4f261e99617a5350b`.
- Migrations appliquées, volume persistant propre, utilisateur non privilégié, racine du conteneur en lecture seule, capacités retirées et contrôle de santé réussi.
- HTTPS local avec certificat de simulation ; aucune connexion locale de test activée. Le parcours admin utilise une session synthétique, avec le cookie de production `__Host-session`, Secure et HttpOnly.
- 12 images générées du jeu de démonstration, quatre séries, deux auteurs, un voyage et 13 Carnets publics dans trois langues ; un brouillon et un billet privé pour les exclusions. Les textes des Carnets servent uniquement aux essais.
- **123 URL dans le sitemap**, correspondant à 41 destinations déclinées dans les trois langues, plus trois pages de pagination inspectées : **126 pages contrôlées**. Les traductions ne constituent pas de nouveaux sujets éditoriaux.
- Le conteneur a été recréé avec l’image optimisée et le même volume ; le corpus a été conservé. Les choix d’indexation ont été rétablis après leurs essais.

Les URL des preuves sont normalisées vers le domaine documentaire réservé `https://simulation.example` ; elles ne désignent pas un site en ligne. Les jetons de session, secrets, certificats privés et chemins du stockage ne sont pas inclus.

## Résultats observés

| Cas exécuté | Résultat |
|---|---|
| Récupération des 123 URL déclarées et des trois pages 2 | 126 réponses 200, titres/descriptions présents et un titre principal par page |
| Canonique déclarée | Chaque page contrôlée déclare sa propre URL préférée, pagination comprise |
| Langues | Liens alternatifs réciproques vers les versions présentes, sans lien vers une traduction non publiée dans les tests dédiés |
| Découverte | 126 pages retrouvées par les liens HTML à partir des trois accueils ; les variantes de langue sont elles-mêmes déclarées en HTML et dans le sitemap |
| Images du sitemap | 12 variantes distinctes accessibles en HEAD, type d’image attendu, deux chemins d’un original synthétique dont l’existence a été vérifiée répondent 404 |
| Données structurées | Blocs JSON-LD analysables ; les métadonnées des œuvres et billets utilisent les contenus publics |
| Robots | Sitemap déclaré, aucune interdiction globale d’exploration empêchant de lire les directives |
| Exclusions attendues | Carte non publiée, faux chemin, brouillon et billet privé : 404 ; Bonjour, Contact et recherche avec requête : `noindex` |
| Réglages en admin sur la cible HTTPS | Exclusion des images persistée et observée sur la page et l’image ; exclusion du site persistée, `noindex` et sitemap vide ; visibilité initiale rétablie |
| Nouveaux parcours publics | Page auteur nommée ; liens photo et voyage → Carnets publics ouverts au clavier |
| Téléphone en allemand sans JavaScript | Liens présents et utilisables, aucun débordement à 412 px sur auteur/photo/voyage |
| Accessibilité des trois pages modifiées | Trois contrôles axe WCAG A/AA, aucune violation détectée |
| Console et réseau du passage final | Aucune erreur JavaScript, CSP ou HTTP inattendue |

Preuves : [table d’inspection des 126 pages](inspection-locale.csv), [résultats structurés](simulation-resultats.json), [page auteur au bureau](captures/auteur-simulation.png), [maillage des Carnets sur téléphone](captures/carnets-lies-simulation-mobile.png).

## Optimisations vérifiées avant et après

| Point | Avant | Après |
|---|---|---|
| Page d’un photographe | Titre principal « Galerie » | Nom du photographe et présentation publique localisée |
| Photos et voyages | Pas de retour vers les billets qui les citent | Jusqu’à six Carnets réellement publics et éligibles dans la langue de la page |
| Outil d’inspection Google avec préférence allemande | 302 vers la version allemande | 200 sur l’URL française demandée ; ses visites restent exclues des statistiques |
| Grandes vignettes | Directive réservée aux Carnets | Autorisées sur les pages publiques indexables avec images autorisées ; limites locales et exclusions prioritaires |
| Dates de l’accueil, galerie et index des séries | Dernière date d’une photo utilisée comme date de la page | Date omise lorsqu’aucun horodatage ne prouve l’ensemble des changements de la page |
| Taille du sitemap | Document unique | Document unique conservé pour ce corpus, index et parties au-delà de 50 000 URL ou 50 Mo UTF-8 |

Le découpage est contrôlé aux bornes par six tests sur des métadonnées légères : nombre d’URL, octets UTF-8, enveloppe XML, index et parties hors plage. Aucun corpus de 50 000 photographies n’a été construit. Les parties sont recalculées sans cache différant les retraits. La convention de date des Carnets reste celle de B69, fondée sur publication/révision ; elle ne mesure pas tous les changements possibles de la liste.

## Mesures de chargement en laboratoire

Trois navigations à froid par page et profil, sur cette image et ce corpus généré. Profil mobile configuré dans Chromium : latence 150 ms, téléchargement 1,6 Mbit/s et ralentissement CPU ×4. Aucun cache Cloudflare ni comportement réseau de production n’est reproduit.

| Page et profil | LCP médian | CLS maximal observé |
|---|---:|---:|
| Accueil, bureau | 160 ms | 0,0014 |
| Photo, bureau | 208 ms | 0,0006 |
| Accueil, mobile simulé | 1 488 ms | 0 |
| Photo, mobile simulé | 1 484 ms | 0 |

Ces observations locales sur des images de démonstration de 900 px ne prouvent pas les performances d’un catalogue réel de photographies de 24 Mpx. L’INP et les Core Web Vitals terrain restent non mesurés. Les objectifs Google sont LCP dans les 2,5 s, INP inférieur à 200 ms et CLS inférieur à 0,1 ; les mesures terrain de Search Console restent à examiner après une mise en ligne réelle. [Recommandations officielles](https://developers.google.com/search/docs/appearance/core-web-vitals)

## Régression serveur exécutée

Deux passages de la même sélection ciblée : **88/88 sans Vigie** et **88/88 avec Vigie**, zéro échec, ignoré ou annulé.

```sh
AVIF_EFFORT=0 node --test --test-concurrency=4 \
  test/referencement.test.js test/referencement-lancement.test.js \
  test/referencement-contenus.test.js test/sitemap.test.js \
  test/langues.test.js test/statistiques.test.js test/carnet-public.test.js \
  test/textes-inventaire.test.js test/version-publique.test.js test/nouveautes.test.js
```

La seconde commande ajoute `TEST_AVEC_VIGIE=1`. Les tests de liens internes, aide et traduction passent également : **11/11**, sans échec ni ignoré. Cette sélection couvre les surfaces modifiées et leurs dépendances proches ; les résultats des anciennes suites globales du premier socle sont conservés dans le [rapport initial](validation.md), séparément.

Les premières passes de l’outillage ont rencontré des erreurs de montage et de préparation : publication du port d’un réseau Docker interne, chapôs traduits mal préparés, parcours initial à partir du seul accueil français, nom de cookie HTTP utilisé sur HTTPS, fenêtre de nouveautés non fermée et résolution du domaine de simulation par le client HTTP hors navigateur. Le montage et les données synthétiques ont été corrigés ; le passage final utilise les trois accueils, le cookie HTTPS normal et les requêtes du navigateur. Ces incidents n’ont pas demandé d’affaiblir une protection du produit. Le détail final vérifiable est conservé dans les preuves ci-dessus.

## Ce qui reste à vérifier dans les services réels

| Observation | État de cette simulation |
|---|---|
| DNS et propriété Search Console | Non validés ; procédure préparée pour le propriétaire |
| Certificat public, tunnel et cache Cloudflare | Non essayés ; HTTPS local seulement |
| Connexion Zitadel réelle | Non essayée ; session de démonstration précréée |
| Sitemap lu par Google et état de l’index | Inconnus |
| Canonique choisie par Google | Inconnue ; seule la canonique déclarée est vérifiée |
| Clics, impressions, CTR et position | Non mesurés ; aucune valeur inventée |
| Rapport et inclusion dans les fonctions IA de Search | À vérifier dans la propriété réelle, selon les données et réglages disponibles |
| Contenu éditorial de production | Non audité ; aucun accès aux données réelles ; briefs fondés sur la structure du site |

Aucune nouvelle page n’est publiée sur le site réel et aucun déploiement ou fusion n’est effectué par cette simulation. Le serveur, le volume et les secrets jetables sont nettoyés après collecte des preuves.
