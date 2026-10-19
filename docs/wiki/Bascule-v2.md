# Bascule de la v2 pour tous

Liste de contrôle pour faire voir la v2 du site public à tous les visiteurs (PLAN.md, point 8 ; Spécifications, P23). Chaque case se vérifie ; on ne bascule pas tant qu'une case reste vide. Le geste lui-même est décrit dans l'aide d'[Apparence](Aide-Apparence#site-public--v1-ou-v2).

## 1. Avant de basculer

- [ ] **Aperçu essayé sur trois écrans** : *Apparence → Ouvrir l'aperçu de la v2*, puis le site parcouru sur un **iPad** (en portrait et en paysage), un **ordinateur** et un **téléphone** : accueil et galerie, une série, la visionneuse (photo suivante, plein écran, rotation), Rechercher, Carte, Voyages, À propos, pages légales, « Je vous ai photographié », Signaler, Partager, une page introuvable ; en français, en anglais et en allemand ; thème de nuit et de jour. Rien de cassé, rien d'illisible.
- [ ] **Test des liens internes vert** sur le code qui sera en ligne : `node --test test/liens-internes.test.js` (aucun lien de la v2 vers une 404, en trois langues ; registre de la Vigie, BV-5). Le lancer après la dernière fusion, pas avant.
- [ ] **Seuils d'aspiration de la Vigie recalés** (BV-4, règle DS15 : « toutes les tailles d'une même photo », « plus de 300 images en 10 minutes ») sur le trafic de l'aperçu. **À confirmer avec la session de la Vigie** : ce recalage est le sien (`server/securite/`, `vigie/`) ; noter ici la date et les seuils retenus.
- [ ] **Sauvegarde récente et vérifiée** : la dernière a moins de 24 h et n'a pas d'alerte (`cat $BACKUP_DIR/last.json`, ou `node server/db/backup.js --etat` dans le conteneur `backup`) ; sinon, une sauvegarde manuelle (`docker compose run --rm backup node server/db/backup.js`). Voir [Déploiement](Déploiement#sauvegardes).
- [ ] **Aucune alerte ouverte** dans la Vigie qui touche le site public (entrée « Sécurité » de l'admin, ou la console).

## 2. Basculer

1. *Apparence* → section **Site public : v1 ou v2** (en tête de page) → cocher **v2** → **Enregistrer la version**.
2. Vérifier, depuis une fenêtre privée (sans session d'administrateur) : l'accueil, une photo et une page en anglais sont en v2.
3. Le changement est noté au journal de l'admin (*Réglages → Journal* : « site public : v1 → v2 »). Rien à vider côté Cloudflare : les pages HTML du site ne portent pas d'en-tête de cache (Cloudflare ne les garde pas, sauf règle de cache ajoutée à la main : la vérifier), et les feuilles de la v2 ont leurs propres adresses (`/static/css/v2/…`).

**Revenir en arrière**, à tout moment et sans perte : même section, cocher **v1**, **Enregistrer la version**. Les réglages, les textes et les photos ne dépendent pas de la version ; seule la présentation change.

## 3. La première semaine

Une fois par jour, sept jours :

- [ ] **Alertes de la Vigie** : aspiration (DS15) et pages introuvables (`malicious_excess_404`) surtout ; une alerte sur un visiteur ordinaire est un faux positif à classer comme tel et à signaler à la session de la Vigie (seuils de BV-4 à revoir).
- [ ] **Pages introuvables** : les 404 par adresse dans la console de la Vigie (événements) ou dans les journaux du site (`docker compose logs site`). Une 404 répétée sur une même adresse du site est un lien cassé : le corriger, et ajouter le cas au test des liens internes.
- [ ] **Search Console** : rapport *Pages* (pages indexées, erreurs 404 ou 5xx nouvelles), *Sitemaps* (lu sans erreur) et *Signaux Web essentiels* (aucune page qui passe en « Mauvaise »). Les adresses ne changent pas avec la v2 : le nombre de pages indexées ne doit pas baisser.

Un problème qui touche les visiteurs et qui ne se corrige pas dans la journée : revenir en v1 (§ 2), corriger, recommencer la liste.

## 4. Retirer la v1 (plus tard)

Pas en même temps que la bascule : après **au moins quatre semaines** en v2 pour tous, sans retour en v1 ni alerte restée inexpliquée. Une **PR dédiée**, avec son « Impact sur la Vigie » :

- [ ] gabarits v1 du site public (`views/*.eta` qui ont leur double dans `views/v2/`), les gabarits v2 prenant leur place ; les pages d'erreur et de connexion (`auth-error.eta`, `local-login.eta`) reçoivent d'abord leur version v2 ;
- [ ] CSS v1 (`public/css/site.css` et ce qui ne sert qu'à elle, feuilles de thème v1 comprises une fois le thème repris par `public/css/v2/tokens.css`) ;
- [ ] réglage et aperçu : `server/version-publique.js`, la section « Site public : v1 ou v2 » d'Apparence, la route de l'aperçu, le bandeau, la clé `public_version` ;
- [ ] tests adaptés : `test/version-publique.test.js`, les parcours v1 de `test/liens-internes.test.js`, les comparaisons « la v1 identique », les tests e2e de la v1 ;
- [ ] documentation : aide d'Apparence et du site public (trois langues), [Apparence et thèmes](Apparence-et-thèmes), Spécifications (P23), PLAN.md, cette page.
