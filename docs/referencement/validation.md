# Référencement administrable — vérification locale

Vérification du 24 octobre 2026, sur un serveur jetable et les seules images de démonstration générées. Aucun accès aux bases, sauvegardes ou photos réelles. Les réglages techniques utilisent `site.apparence`, sans modification des rôles.

## Parcours et résultats

| Cas exécuté | Attendu et observé |
|---|---|
| Admin v1, saisie FR/EN/DE puis enregistrement au clavier | Valeurs retrouvées après rechargement, mêmes titres et descriptions sur les trois accueils publics. |
| Admin v2, site hors moteurs | Choix persisté, `noindex` sur l’accueil public, plan du site vide. |
| Texte trop long envoyé au serveur | Réponse 422, erreur reliée au champ, saisie conservée, publication précédente inchangée. |
| iPhone, WebKit sans JavaScript | Formulaire utilisable, enregistrement et persistance confirmés. Les quatre choix radio ont une cible de 44 px de haut. |
| Bureau et téléphone, français et allemand | Aucun débordement horizontal aux largeurs vérifiées : 320, 390, 768 et 1 280 px ; allemand à 390 px. |
| Accessibilité axe, admin v1/v2 en clair et sombre | Quatre contrôles WCAG A/AA, aucune violation détectée. |

Captures : [admin v2 au bureau](captures/admin-bureau.png), [admin v2 en allemand au téléphone](captures/admin-mobile-de.png). L’écran reprend les composants des réglages existants ; les enregistrements sont explicites et fonctionnent sans script.

Les journaux du parcours navigateur ne contiennent aucune erreur JavaScript ou CSP hors capture. Le seul échec HTTP attendu est la réponse 422 du scénario de validation. La capture WebKit a provoqué le refus CSP connu de la feuille de style injectée par Playwright ; le même parcours a ensuite été exécuté sans cette capture et sans erreur CSP. Une première reprise de l’outil supposait un compte resté en v1 ; sa préférence persistante a été réinitialisée avant le passage final. Ces deux incidents concernaient l’outil de vérification.

## Tests serveur

- `AVIF_EFFORT=0 node --test test/referencement.test.js` : **14/14**, aucun échec, ignoré ou annulé.
- Même commande avec `TEST_AVEC_VIGIE=1` : **14/14**, aucun échec, ignoré ou annulé.
- `AVIF_EFFORT=0 node --test test/admin.test.js` : **20/20**. Deux assertions anciennes attendaient uniquement le nom du site ; elles vérifient désormais le titre automatique complet, avec les noms des photographes.
- `AVIF_EFFORT=0 node --test test/textes-inventaire.test.js test/version-publique.test.js` : **28/28**. Les comparaisons intégrales du corps v1 restent en place ; les nouvelles descriptions sont vérifiées à part. Le bloc JSON-LD est parsé et les scripts exécutables en ligne restent interdits.
- `AVIF_EFFORT=0 node --test test/admin-v2-suivi.test.js` : **7/7**, dont le classement des changements SEO dans « Réglages du site ».
- `AVIF_EFFORT=0 node --test test/nouveautes.test.js` : **2/2** après passage en 1.227.0.
- `node --test test/liens-internes.test.js test/aide.test.js test/traduction.test.js` : **11/11** ; liens internes relancés après ajout du présent rapport : **4/4**.

La première suite globale sans Vigie a terminé avec **1 485/1 489** : quatre assertions anciennes attendaient les titres, descriptions ou l’absence de données structurées d’avant le SEO. Les deux fichiers de compatibilité et les deux assertions de réglages ont été actualisés avec les preuves explicites du nouveau comportement, puis repassés dans les commandes ciblées ci-dessus.

Passages globaux finaux (même sélection que les scripts npm, concurrence bornée à quatre fichiers) :

- `AVIF_EFFORT=0 node --test --test-concurrency=4 "test/**/*.test.js"` : **1 489/1 489**, zéro échec, ignoré ou annulé.
- Même commande avec `TEST_AVEC_VIGIE=1` : **1 489/1 489**, zéro échec, ignoré ou annulé.

Le classement du Journal, ajouté à la dernière passe de relecture, est vérifié par les sept tests ciblés ci-dessus. Les renvois SEO de l’aide ont aussi été vérifiés dans le HTML produit en français, anglais et allemand ; leurs ancres restent celles du français, conformément au fonctionnement commun de l’aide.

Les tests SEO vérifient les formulaires réellement rendus, droits, CSRF, champs invalides sans écriture partielle, persistance indépendante, textes/replis/échappement, les trois présentations, les données structurées, les images et les projections publiques du plan du site. Les cas privés et les langues non publiées des Carnets gardent leurs exclusions. La régression découverte sur les réponses d’images **304** est couverte en GET et HEAD : la directive courante est bien reprise quand le réglage change. La Vigie reçoit les changements et leurs clés, jamais les textes libres ; un refus ou un réenregistrement identique ne simule pas un changement.

## Limites

Aucun essai sur Unraid, Cloudflare ou Zitadel réels ; aucune mesure de classement dans les moteurs. Les réglages s’appliquent aux prochaines réponses du serveur. Les anciennes images en cache demandent éventuellement une purge ; les moteurs choisissent le délai de réexploration et leur résultat. La déclaration du domaine et l’envoi du plan du site dans Search Console restent au propriétaire. L’installation ne modifie pas la visibilité initiale du site.

Le moteur de la Vigie et ses règles sont inchangés : les signaux rejoignent BV-1/DS23, BV-20/BV-21 et DS12. Aucun banc du moteur n’est nécessaire pour ce branchement.

Références techniques : [directives robots et nécessité de laisser lire `noindex`](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag), [plan de site des images](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps), [informations de créateur et de droits des images](https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata).
