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
| `test/db.test.js` | migrations, seed |

L'encodage AVIF est mis au plus rapide pendant les tests (`AVIF_EFFORT=0`, dans le script `npm test`). L'horodatage y est désactivé (`TSA_URL=off`) : les tests qui en ont besoin utilisent un faux service, qui renvoie des jetons FreeTSA réels enregistrés dans `test/fixtures/`.

## Tests navigateur (Playwright)

Ils tournent dans le **conteneur officiel Playwright**, contre un serveur déjà démarré, et n'installent rien sur la machine.

```bash
BASE_URL=http://<hôte>:<port> E2E_LOCAL_AUTH=<LOCAL_AUTH_TOKEN du serveur> npm run e2e
```

| Projet | Contenu |
|---|---|
| `setup` | connexion locale de test ; la session est réutilisée ensuite |
| `desktop`, `mobile` (Pixel 7) | rendu, ouverture et bouton pause, filtres sans rechargement, visionneuse (clavier, glissé), site sans JavaScript, pages de l'admin |
| `parcours` | après les deux précédents : import, édition, publication, réordonnancement et suppression d'une photo ; séries ; filigrane (aperçu, application, retour) ; déconnexion |

- **Données :** le projet `parcours` **modifie les données**, puis les remet en état ; il nettoie aussi les restes d'un passage interrompu.
- **Erreurs :** toute erreur JavaScript, toute violation de la politique de sécurité du contenu et toute ressource en échec fait échouer le test.
- **Résultats :** captures et traces dans `e2e/results/`, rapport HTML dans `e2e/report/`.

Sans `E2E_LOCAL_AUTH`, les tests de l'admin sont ignorés.
