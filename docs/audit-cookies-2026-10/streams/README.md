# Reprise de la discussion en deux streams

Préparé le 24 octobre 2026 à la demande du propriétaire. Ces fichiers sont des briefs pour deux discussions autonomes. Ils ne créent pas eux-mêmes de nouvelles conversations dans l’interface et ne lancent aucun correctif produit.

| Stream | Brief à remettre à la nouvelle discussion | Résultat attendu |
|---|---|---|
| Technique | [technique.md](technique.md) | Corriger et vérifier les écarts techniques établis ; maintenir les fonctionnalités ; isoler les migrations de chiffrement |
| Conformité CNIL | [cnil.md](cnil.md) | Établir et documenter les exemptions par finalité, les critères manquants et l’information appropriée |

## Socle commun

- Périmètres séparés dans chaque livrable : site public, administration, Vigie.
- Préserver les fonctionnalités, notamment langue mémorisée, J’aime durable, retour galerie, plein écran, brouillon de secours et statistiques de visiteurs uniques.
- Le propriétaire a retenu le chiffrement en base et dans les cookies. Signature et chiffrement restent distincts ; les copies privées nécessaires et les clés doivent être prises en compte.
- Éviter les caches remplaçables ; distinguer un rendu recalculable de l’état nécessaire à une fonction demandée, notamment une reprise après panne/crash.
- Aucun consentement global imposé pour consulter le site. Une exemption doit être démontrée ; une fonction non exemptée peut demander un choix contextuel préalable.
- Aucun changement des rôles, des finalités ni des décisions de conservation encore ouvertes par simple commodité technique.
- Pas de données réelles, secrets ou déploiement. Worktree propre pour chaque travail, respect des consignes du dépôt et aucune fusion automatique.

## État partagé au moment de la séparation

Code audité : commit `f44cdf31f8c8c8893071e9350962cdf1370202ee`, version 1.217.0, récupéré depuis origin/main au début du diagnostic. Revalider les constats sur la version courante avant une correction.

Le [rapport](../README.md), l’[inventaire technique](../inventaire-technique.md), la [carte des protections](../protections-et-caches.md) et les [preuves](../preuves/controles.json) se trouvent dans le worktree local `/tmp/nicephos-diagnostic-cookies-20261024`. Ces documents ne sont pas encore committés ni publiés. Aucun code produit n’a été modifié pendant le diagnostic.

Résultats existants : 135 tests ciblés réussis, 4 tests de liens applicatifs réussis et 13 contrôles complémentaires, dont des parcours Chromium. Ils ne valident ni la production ni les corrections futures.

## Coordination

Le stream technique peut avancer sur les corrections établies sans attendre une conclusion générale de conformité. Le stream CNIL transmet des exigences précises pour les usages encore incertains. Une qualification juridique ne doit pas être déduite du seul fait qu’un correctif technique passe ses tests.

Les formats de chiffrement, la gestion des clés, les migrations et les contrats de la Vigie relèvent du stream technique ; les finalités, exemptions, durées justifiées et textes d’information relèvent du stream CNIL. Les changements qui touchent les deux doivent expliciter cette dépendance.
