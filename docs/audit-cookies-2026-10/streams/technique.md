# Brief pour le fork technique

## Mission et état de départ

Tu reprends le chantier technique issu du diagnostic des cookies et stockages de Nicephos, dépôt `deux-regards`. Le propriétaire veut deux discussions indépendantes : ce stream réalise les corrections techniques ; le [stream CNIL](cnil.md) traite les qualifications et décisions réglementaires. Ce brief prépare cette séparation ; il n’atteste pas la création d’une nouvelle conversation.

L’audit porte sur **1.217.0**, commit `f44cdf31f8c8c8893071e9350962cdf1370202ee`. Aucun code produit n’a été modifié. Les rapports et preuves sont des fichiers locaux non suivis, sans commit ni PR, dans `/tmp/nicephos-diagnostic-cookies-20261024/docs/audit-cookies-2026-10/`. Les résultats initiaux concernent uniquement le code audité : 135 tests ciblés réussis, 4 tests de liens applicatifs et 13 contrôles complémentaires. Ils ne valident aucun correctif futur.

Lis le [rapport révisé](../README.md), particulièrement sa section 11 qui prévaut pour le maintien des fonctions, l’[inventaire technique](../inventaire-technique.md), la [carte des protections](../protections-et-caches.md) et les [preuves](../preuves/controles.json). Les suppressions proposées ailleurs dans l’audit sont des alternatives, pas des suppressions décidées.

## Reprise sûre

Avant toute modification, lire intégralement `docs/wiki/Développer.md`, puis `AGENTS.md`, `PLAN.md`, les règles de tests et de sécurité ; ajouter les documents Vigie pour son périmètre. Revalider `origin/main`, identifier ce qui a changé depuis l’ancrage et créer ton propre worktree depuis cette référence. Vérifier son statut avant écriture ; préserver tout fichier inattendu. Les rapports locaux ne seront pas automatiquement présents dans un nouveau worktree : les consulter à leur emplacement ci-dessus ou en reprendre explicitement les documents utiles.

Le dépôt principal sert à l’instance de test : ne pas y écrire. Aucun accès aux données réelles, bases, sauvegardes, secrets ou `.env`. Aucun déploiement en production. Ports libres et services jetables seulement ; nettoyage limité à ses propres ressources.

## Premiers lots à réaliser

1. **HTTPS en production.** Refuser une URL publique HTTP en production ; conserver les parcours HTTP locaux autorisés pour les tests. Vérifier les attributs des cookies et les refus de configuration sans exposer de secret.
2. **Expiration OIDC côté serveur.** Borner réellement les transactions à leurs dix minutes existantes, y compris lorsqu’un ancien cookie signé est représenté manuellement. Préserver PKCE, state, nonce, vérification du fournisseur, réauthentification et connexions dans plusieurs onglets.
3. **Purges autonomes.** Supprimer les sessions admin expirées sans attendre une autre connexion et purger les récapitulatifs Bonjour à leur échéance existante. Garder les délais actuels, l’usage unique, le plafond mémoire et le choix « jamais sur disque » du récapitulatif. Préserver les déclencheurs Vigie et les empreintes révoquées de 48 heures ; fermer les timers à l’arrêt.
4. **Stockages refusés.** Rendre les accès localStorage/sessionStorage robustes quand le navigateur les refuse. Préserver les parcours, les erreurs compréhensibles et l’isolation entre comptes ; ne pas remplacer un échec par une copie privée durable supplémentaire.

Ces correctifs peuvent avancer sans attendre les arbitrages CNIL. Reproduire chaque défaut, apporter le changement minimal et ajouter le test de régression qui l’aurait vu.

## Sous-lot cryptographique distinct

Le propriétaire a confirmé le **chiffrement en base et dans les cookies avec maintien des fonctionnalités**. Concevoir les formats et migrations avant leur application : objets couverts, chiffrement authentifié, séparation des clés, compatibilité au démarrage, reprise des données existantes, rotation, sauvegardes, restauration et retour arrière. Une signature ou un HMAC ne chiffre pas ; une empreinte du bearer ne protège pas les autres colonnes. Conserver l’empreinte serveur du bearer plutôt que sa valeur réversible.

Traiter les données des comptes/sessions, cookies contenant des données, tampons et copies nécessaires. Préserver D6, le contrôle indépendant des rôles sur les sauvegardes NC2 et la chaîne historique Vigie. Ne pas transmettre silencieusement DATA_KEY à la Vigie ni réécrire son journal. AAD/enc2 reste un sujet de conception identifié. Ne pas modifier les droits ni trancher une durée légale encore ouverte, notamment D38.

## Dépendances et limites

Tenir un registre partagé des dépendances : décision attendue du stream CNIL, objet concerné, fonctions à préserver, lot dépendant et preuve attendue. Demander au stream CNIL les précisions nécessaires sans bloquer les corrections indépendantes. Ne supprimer aucune langue, mémorisation de J’aime, fonction hors ligne, statistique de visiteurs uniques ou cache au seul motif qu’une exemption reste à établir. Ne pas transformer une recommandation technique en obligation CNIL.

## Livrables attendus

Un lot cohérent donne un commit français et une PR **en brouillon**, avec problème, comportement obtenu, vérifications et leurs nombres, preuves utiles expurgées, limites, sécurité et impact sur la Vigie. Respecter les mises à jour documentaires, nouveautés et versions applicables. Tests ciblés proportionnés ; vrai navigateur si un parcours ou son interface change. Rapporter les échecs et couvertures indisponibles ; ne pas réparer un grand outillage hors sujet. Aucune fusion : seul le propriétaire l’autorise.
