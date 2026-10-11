# Tests

## Tests unitaires et d'intégration

```bash
npm test
```

Ils utilisent `node:test`, sans dépendance supplémentaire, et prennent environ 30 s. Chaque test travaille dans un dossier temporaire avec sa propre base. Le jeu de démonstration n'est généré qu'une fois par fichier, puis recopié pour chaque test.

| Fichier | Couvre |
|---|---|
| `test/app.test.js` | en-têtes de sécurité, configuration « en ligne », versionnage CSS/JS |
| `test/public.test.js` | pages publiques, filtres, visionneuse, Open Graph, isolement des originaux |
| `test/auth.test.js` | flux OIDC de bout en bout contre un faux fournisseur, sessions, CSRF, redirections, limite de débit |
| `test/admin.test.js` | connexion locale de test, toutes les actions de l'admin, import et ses refus |
| `test/watermark.test.js` | règles du filigrane et des EXIF, rendu (positions, mosaïque, logo, opacité), modes EXIF, recalcul et bascule des URL |
| `test/proofs.test.js` | requête RFC 3161, jetons FreeTSA réels (analyse, signature, chaîne, altération), reprise après erreur, téléchargements, vérification, page `/droits` |
| `test/revue.test.js` | non-régression des constats de la revue d'octobre 2026 : redirections, erreurs génériques, protection de **toutes** les routes d'admin (liste des routes parcourue), configuration, jetons mal formés, suppressions pendant un rendu ou un horodatage, fichiers temporaires, filigrane sur petites images |
| `test/deploiement.test.js` | garde-fou de persistance des données, sauvegarde (instantané, rotation, copie des originaux), `sitemap.xml`, `robots.txt` |
| `test/apparence.test.js` | thèmes, aperçu réservé aux admins, emblème, icône, logo complet, image de partage, favicon |
| `test/ergonomie.test.js` | écrans revus après l'audit d'ergonomie : envoi photo par photo et suivi du traitement, lot complété champ par champ ou d'un coup (sans JavaScript), dates en langage courant, actions groupées et leur annulation, suppression groupée confirmée, séries (cartes, ordre JSON, création en tête, suppression qui déplace les photos), ouverture ordonnée |
| `test/statistiques.test.js` | mesure d’audience : comptage des pages et des photos, visiteur unique par jour, aucune IP stockée, exclusions (robots, admins, DNT/GPC, préchargement, 404, HEAD), changement de jour, purge à 25 mois, suppression d’une photo, pages d’admin |
| `test/instagram.test.js` | Instagram : légendes (variables, lignes vides, hashtags), réglages, jeton chiffré, créneaux à l’heure de Paris, images (passe-partout, recadrage, JPEG sans métadonnées, filigrane), envoi complet contre un faux service Meta (image servie le temps de l’envoi seulement), échecs et nouveaux essais, créneaux, renouvellement du jeton, routes d’admin (file automatique, fiche, aperçu, actions, OAuth `state`, CSRF) |
| `test/aide.test.js` | aide en ligne : toutes les sections, **aucun lien interne cassé**, lien « Aide sur cette page » de chaque écran |
| `test/db.test.js` | migrations, seed |

L'encodage AVIF est mis au plus rapide pendant les tests (`AVIF_EFFORT=0`, dans le script `npm test`). L'horodatage y est désactivé (`TSA_URL=off`) : les tests qui en ont besoin utilisent un faux service, qui renvoie des jetons FreeTSA réels enregistrés dans `test/fixtures/`.

## Tests navigateur (Playwright)

Ils tournent dans le **conteneur officiel Playwright**, contre un serveur déjà démarré, et n'installent rien sur la machine.

```bash
BASE_URL=http://<hôte>:<port> E2E_LOCAL_AUTH=<LOCAL_AUTH_TOKEN du serveur> E2E_ALLOW_WRITES=1 npm run e2e
```

| Projet | Contenu |
|---|---|
| `setup` | connexion locale de test ; la session est réutilisée ensuite |
| `desktop`, `mobile` (Pixel 7) | rendu, ouverture et bouton pause, filtres sans rechargement, visionneuse (clavier, glissé), site sans JavaScript, pages de l'admin |
| `audit` | **seulement avec `E2E_AUDIT=1`** : les cinq parcours de l'audit d'ergonomie, mesurés (actions, tabulations, positions, temps d'import) et capturés dans `e2e/audit/apres/`, plus un audit axe-core sans tolérance (toutes violations) des écrans revus et de leurs états ; nettoie ensuite ce qu'il a créé |
| `captures-bureau`, `captures-mobile` | **seulement avec `E2E_CAPTURES=1`** : captures de la [Visite de l'admin](Visite-de-l-admin) ; avec `E2E_ALLOW_WRITES=1`, aussi les écrans d'import, de lot, de sélection et de suppression (à lancer sur une instance jetable) |
| `parcours` | après les deux précédents, **seulement avec `E2E_ALLOW_WRITES=1`** : import, édition, publication, réordonnancement (glisser-déposer, y compris en dernière place, et menu ⋯) et suppression d'une photo ; séries (création en tête, ordre au clavier, fenêtre de suppression) ; filigrane (aperçu, application, retour) ; déconnexion |

- **Données :** le projet `parcours` **modifie les données**. Il ne suppose rien du contenu, nettoie les restes d'un passage interrompu, puis restaure à l'identique les réglages d'images trouvés (même en cas d'échec). À réserver à un serveur de test.
- **Accessibilité :** audit axe-core (WCAG 2.2 A/AA) des pages publiques ; pour l’admin, **aucune violation tolérée**, en mode sombre **et** en mode clair, sur ordinateur et sur téléphone.
- **Photothèque :** sélection (clic, Maj + clic), inspecteur, loupe, palette ⌘K, bascule clair / sombre (lecture seule, `admin.spec.js`) ; modification dans l’inspecteur, ⌘Z, classement par glisser vers une série puis Annuler (`parcours.spec.js`).
- **Temps :** le diaporama est testé avec l'horloge simulée de Playwright (pas d'attente réelle).
- **Erreurs :** toute erreur JavaScript, toute violation de la politique de sécurité du contenu et toute ressource en échec fait échouer le test.
- **Résultats :** captures et traces dans `e2e/results/`, rapport HTML dans `e2e/report/`.

Sans `E2E_LOCAL_AUTH`, les tests de l'admin sont ignorés.
