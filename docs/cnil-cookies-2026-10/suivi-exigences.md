# Contrôle d’application des exigences techniques

**24 octobre 2026 — main récupéré à `994a899c8fe1ac663f90671894e5d843d847eb48`, version 1.226.0.** Le diagnostic initial portait sur `f44cdf3`/1.217.0. Cette vérification reprend le code courant, dont le lot de correctifs de la PR #225 et le vote de la PR #224. Elle ne confirme pas la version déployée. Aucun produit ni donnée réelle modifié ; tests sur bases jetables et navigateur isolé.

**Résultat : les cinq correctifs ciblés du premier lot sont appliqués ; les quinze exigences larges ne sont pas toutes closes.** Le chiffrement intégral a une étude, sans livraison générale. Les fiches servent désormais à distinguer ces deux niveaux de résultat.

## Premier lot : résultat vérifié

| Correctif | Code actuel | Preuve rejouée et limite |
|---|---|---|
| HTTPS public en production | HTTP refusé pour PUBLIC_URL ; HTTP interne derrière Cloudflare Tunnel conservé | `app.test.js` et `auth.test.js` : configuration et vrai listener HTTP local, cookies destinés au visiteur HTTPS. Tunnel/TLS réels non inspectés |
| Échéance OIDC de dix minutes | Date signée vérifiée côté serveur avant l’échange du code, y compris pour la vérification d’identité | `auth.test.js` : ancien cookie, date absente/invalide/future, aucun appel IdP au refus, session existante conservée |
| Purge autonome des sessions admin | Démarrage puis heure ; fin glissante et borne absolue ; déclencheur de révocation conservé | `sessions-purge.test.js` : suppression effective, session active, borne absolue, trace limitée et arrêt des minuteries |
| Purge autonome des récapitulatifs | Échéance de la plus ancienne entrée, replanification et vidage à l’arrêt | `bonjour-recap-purge.test.js` : deux suppressions réelles à leurs quinze minutes sans nouvelle requête ; pas de garantie temps réel sous arrêt du processus |
| Stockage navigateur facultatif refusé | Lecture/suppression/écriture du toast et densité v1/v2 protégées | `stockages-navigateur.test.js` et contrôle Chromium : script/curseur utilisables, mémorisation quand autorisée. Refus de stockage implique absence de mémoire entre rechargements |

Références détaillées dans le [contrôle auth/admin/Vigie](preuves/controle-auth-vigie.md) et la [note du lot](../etudes/cookies-correctifs-techniques.md). Ces résultats ne livrent ni chiffrement du flash, ni isolation du brouillon, ni qualification d’exemption.

## T01–T15 : état de l’exigence entière

« Appliqué » désigne les mécanismes présents dans les chemins examinés. « Partiel » indique un résultat déjà assuré et une partie restant ouverte. « Non appliqué » porte sur la protection nouvelle demandée, sans signifier que la fonction a été supprimée. La configuration et le déploiement réels demeurent non vérifiés pour toutes les lignes.

| Exigence | État au code | Résultat et écart restant | Clôture suivante |
|---|---|---|---|
| T01 — Sessions et échéances | Appliqué dans le périmètre examiné | Contrôles serveur des sessions et OIDC présents ; contrats console/visiteur préservés | Vérifier la version déployée et les parcours réels IdP/Access. Les durcissements distincts non livrés, dont rotation après réauthentification console, restent identifiés dans la preuve |
| T02 — Chiffrement complet | Partiel | Coffre AES-GCM existant et preuve de consentement du vote chiffrée ; clé globale facultative, fallback clair, comptes/sessions/cookies/Vigie/copies non entièrement couverts | Livrer la conception, le refus des écritures privées sans clé valable et les preuves de migration/restauration |
| T03 — Purges | Partiel | Sessions/récapitulatifs corrigés ; vote nettoyé à la clôture ; audience encore nettoyée au trafic, autres états/copies à traiter | Horloge et suppression physique pour chaque objet restant, politique des sauvegardes et durées retenues |
| T04 — Préférences | Partiel | Fonctions présentes ; densité robuste au refus ; durées/portée compte ou appareil et effacement incomplets | Décisions motivées puis parcours autre compte/réinitialisation/expiration |
| T05 — J’aime durable | Partiel | Reconnaissance après rechargement conservée ; localStorage sans durée et mémoire IP/photo séparée inchangés | Durée, effacement et justification/choix contextuel ; vérification du retrait et de l’expiration |
| T06 — Retour/plein écran | Partiel | Continuité existante ; borne logique du retour mais nettoyage/qualification du parcours non clos | Parcours borné, sortie/focus/expiration et nécessité documentés ; pas de nouveau parcours complet prétendu ici |
| T07 — Récapitulatif/flash/toast | Partiel | Récapitulatif purgé, stockage toast robuste ; flash signé lisible, toast clair, rattachement privé incomplet | Protéger l’état privé et le lier au bon contexte sans perdre redirection ou Défaire |
| T08 — Secours hors ligne | Non appliqué pour la protection demandée | Copie Carnets encore lisible et non isolée par compte, sans échéance | Concevoir déverrouillage, chiffrement et durée ; tester panne, fermeture, mauvais compte et récupération |
| T09 — Visiteurs uniques | Partiel | Indicateur journalier conservé ; IP/UA complets et équivalence d’isolement non démontrés | Démonstration/minimisation et comparaison sur trafic fictif, sans baisse silencieuse de l’indicateur |
| T10 — Anonymat des restitutions | Non appliqué | Petits chiffres exacts ; aucune analyse alternative ou adaptation cohérente trouvée | Examiner toutes les sorties et déductions, puis livrer la garantie retenue |
| T11 — Opposition audience | Partiel | DNT/GPC honorés par les vues ; choix immédiat propre au site absent ; périmètre partages à définir | Décider et livrer le choix accessible recommandé ou documenter les garanties alternatives justifiées |
| T12 — Partages | Partiel | Boutons/QR/compteurs conservés et séparés ; conservation et articulation de l’opposition non arrêtées | Qualifier les agrégats et appliquer la conservation/information retenues |
| T13 — Vigie | Partiel | Chaîne, clés distinctes et contrôle NC2 existants préservés ; adaptations au chiffrement non livrées | Concevoir et vérifier historique, projection indépendante, reprise, clés et D38 |
| T14 — Formats/copies | Non appliqué pour le programme global | Étude enc2 disponible ; reprises enc1 limitées, sans migration générale ni preuve de restauration du format proposé | Migration/reprise des anciennes valeurs et copies, rotation, retour arrière, effacements |
| T15 — Information | Partiel | Vote intégré à la notice FR/EN/DE et au registre ; autres formulations/durées/audience encore à aligner | Vérifier annonce par annonce avec les décisions et le code effectivement livré |

Cela représente **une exigence appliquée dans le périmètre lu, onze partielles et trois non appliquées pour le résultat nouveau demandé**. Ce décompte est un suivi d’ingénierie, pas un taux de conformité RGPD. Le détail public/audience est dans la [preuve correspondante](preuves/controle-public-audience.md).

## Extension nécessaire : vote d’exposition

La [fiche de vote](fiches-votes.md) complète les dix-huit fiches initiales. Le consentement au premier vote est explicite, sans cookie de vote à la simple visite ni blocage de navigation. Le mécanisme a son retrait/export et des purges. Il ne transforme pas le calcul d’audience en traitement consenti et ne clôt pas T02 : bearer opaque en cookie, index/bulletins et couverture de confidentialité restent à distinguer. La preuve de consentement est chiffrée ; tous les objets ne le sont pas.

Une incohérence distincte de métrique est relevée statiquement : les nouvelles routes photo d’exposition/collection passent `photo` au module d’audience qui attend `photoId`. Elles comptent la page mais pas l’ouverture dans `stats_photos`. À qualifier dans le stream technique selon l’indicateur attendu ; aucune correction fonctionnelle silencieuse ici. Voir les références dans la preuve public/audience.

## Politique du propriétaire sur les caches

Cette demande transversale complète T01–T15. **Elle n’est pas encore appliquée à tous les rendus remplaçables.** Les chemins suivants ont été relus sur 994a899 ; leur état réel dans les navigateurs et la bordure n’a pas été observé.

| Objet | État constaté | Suite compatible avec le maintien des fonctions |
|---|---|---|
| Pages privées et téléchargements | `no-store` déjà présent ; [prive.js](../../server/routes/prive.js), 109 et 433–454 | Conserver et vérifier les en-têtes effectivement servis après proxy |
| Images de galerie privée | `private, no-cache` avec ETag ; le navigateur peut conserver et revalider, [prive.js](../../server/routes/prive.js), 368–369 | Évaluer puis livrer `no-store` si retenu ; mesurer rechargements/réseau et vérifier qu’aucune règle de bordure ne les rend publiques |
| JPEG privés et archives | Rendus réutilisables dans le stockage applicatif, [prive.js](../../server/routes/prive.js), 374–400 et 457–507 | Étudier rendu à la demande et flux temporaires bornés, avec protections de concurrence ; ne pas supprimer la capacité de téléchargement |
| JPEG de cadeau | Mémoire de rendus dans une Map, malgré l’en-tête navigateur `no-store`, [public.js](../../server/routes/public.js), 130–175 | Examiner le recalcul borné ; distinguer cache serveur et consigne navigateur |
| Médias publics | Conservation navigateur d’un an et partagée d’un jour, [media.js](../../server/routes/media.js), 21–31 | Rendre explicite la décision sur ces copies publiques recalculables et le coût des alternatives ; aucun réglage CDN réel n’est présumé |
| Décisions Vigie conservées | Payload signé persisté pour maintenir les protections en panne, [decisions.js](../../server/securite/decisions.js), 160–165 et 201 | Préserver la reprise et appliquer T02/T13/T14 ; le retirer sans mécanisme équivalent ferait perdre une protection |

`no-cache` autorise la conservation avec revalidation ; `no-store` interdit au cache HTTP de stocker cette réponse. Ces directives ne suppriment pas les téléchargements volontaires ni toutes les anciennes copies : [RFC 9111, § 5.2](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2). La politique demandée dépasse les seules conditions d’exemption : elle reste suivie comme choix de sécurité et d’architecture du propriétaire.

## Vérifications exécutées

| Contrôle sur 994a899 | Résultat | Preuve et portée |
|---|---|---|
| Neuf fichiers ciblés : application/auth, purges, stockages, statistiques/partages, modèle et HTTP du vote | **101/101**, zéro échec, ignoré ou annulé | [Journal](preuves/tests-suivi-technique.txt). Statuts, données persistées, effets terminaux et cas d’erreur couverts par les tests existants |
| Auth, deux purges, stockages et console, avec TEST_AVEC_VIGIE=1 | **66/66**, zéro échec, ignoré ou annulé | [Journal](preuves/tests-suivi-vigie.txt). Vigie simulée, aucune connexion fournisseur réelle ; sélection différente, ne pas additionner comme tests distincts |
| Chromium sur serveur jetable | **7/7 cas**, aucune erreur de script/console relevée | [Relevé](preuves/controle-navigateur.json) : accueil, langue, J’aime et densité v1/v2 avec stockage autorisé/refusé ; [script ponctuel](preuves/controle-navigateur.mjs), [capture neutre](preuves/densite-stockage-refuse.png) |
| Liens applicatifs | **4/4**, zéro échec, ignoré ou annulé | [Journal applicatif](preuves/liens-internes-suivi.txt) ; les [références locales du dossier](preuves/liens-documents-suivi.txt) ont leur contrôle séparé |

Commandes ciblées :

```sh
AVIF_EFFORT=0 node --test --test-concurrency=2 test/app.test.js test/auth.test.js test/sessions-purge.test.js test/bonjour-recap-purge.test.js test/stockages-navigateur.test.js test/statistiques.test.js test/partager.test.js test/saisons-votes.test.js test/expositions-votes-http.test.js
AVIF_EFFORT=0 TEST_AVEC_VIGIE=1 node --test --test-concurrency=2 test/auth.test.js test/sessions-purge.test.js test/bonjour-recap-purge.test.js test/stockages-navigateur.test.js test/vigie-console.test.js
AVIF_EFFORT=0 node --test test/liens-internes.test.js
```

Le navigateur utilise le conteneur Playwright 1.64 existant, sans réseau extérieur, le Node 22 déjà installé et les dépendances existantes. Première exécution du script de contrôle interrompue par une attente incorrecte de redirection : la requête de changement de version n’annonçait pas `Accept: text/html`, d’où la réponse JSON 200 conforme au code. Le script a été corrigé et relancé ; ce n’est pas un échec produit.

Ne sont pas couverts : production, cookies ajoutés à la bordure, réglages réels IdP/Access, disque/sauvegardes réels, migration cryptographique future, nouvelle démonstration juridique d’anonymat, parcours complet de reprise hors ligne et navigation plein écran. Aucune suite complète supplémentaire n’a été lancée pour ce suivi documentaire.

## Priorités de livraison

1. T02/T07/T08/T13/T14 : architecture et livraisons de confidentialité/isolation/migrations, objectif déjà demandé.
2. T09–T12 et T03 : exemption d’audience, opposition et purges, en conservant les métriques utiles.
3. T04–T06 et T15 : durées/nécessité, effacement et information cohérente.
4. En parallèle : compléter [les prestataires](fournisseurs.md) et la preuve de version déployée ; le niveau gratuit ne clôt aucune observation d’installation.

Les changements de droits, durées ou architecture de clés non encore arrêtés restent des décisions explicites du propriétaire. La [méthode d’utilisation des fiches](utiliser-les-fiches.md) précise ses décisions et le travail du développeur.
