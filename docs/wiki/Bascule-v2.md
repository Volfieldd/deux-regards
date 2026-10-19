# Bascule de la v2 pour tous

Liste de contrôle pour faire voir la v2 du site public à tous les visiteurs (PLAN.md, point 8 ; Spécifications, P23). Chaque case se vérifie ; on ne bascule pas tant qu'une case reste vide. Le geste lui-même est décrit dans l'aide d'[Apparence](Aide-Apparence#site-public--v1-ou-v2).

**La v1 est gardée, pour de bon** (décision du propriétaire, 19 octobre 2026). Basculer, c'est choisir la version que voient les visiteurs, pas retirer l'autre : la v1 reste un retour possible à tout moment, d'un réglage, sans déploiement ni perte ; elle sert de référence pour comparer (un administrateur passe d'une version à l'autre d'un clic sur le bouton « Voir en v1 / Voir en v2 » des pages publiques) ; et elle ne coûte presque rien à garder, puisqu'elle ne reçoit plus que les correctifs de sécurité et d'accessibilité. Les nouveautés (Carnets, galeries privées et la suite) n'existent qu'en v2.

## 1. Avant de basculer

- [ ] **v2 essayée sur trois écrans** : bouton **Voir en v2** en haut d'une page publique (ou *Apparence → Voir le site en v2*), puis le site parcouru sur un **iPad** (en portrait et en paysage), un **ordinateur** et un **téléphone** : accueil et galerie, une série, la visionneuse (photo suivante, plein écran, rotation), Rechercher, Carte, Voyages, À propos, pages légales, « Je vous ai photographié », Signaler, Partager, une page introuvable ; en français, en anglais et en allemand ; thème de nuit et de jour. Rien de cassé, rien d'illisible.
- [ ] **Test des liens internes vert** sur le code qui sera en ligne : `node --test test/liens-internes.test.js` (aucun lien de la v2 vers une 404, en trois langues ; registre de la Vigie, BV-5). Le lancer après la dernière fusion, pas avant.
- [ ] **Seuils d'aspiration de la Vigie recalés** (BV-4, règle DS15 : « toutes les tailles d'une même photo », « plus de 300 images en 10 minutes ») sur le trafic des administrateurs en vue v2. **À confirmer avec la session de la Vigie** : ce recalage est le sien (`server/securite/`, `vigie/`) ; noter ici la date et les seuils retenus.
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

## 4. Après la bascule : la v1 reste

Il n'y a pas d'étape de retrait. La v1 reste en place derrière le réglage :

- [ ] **Retour en v1 toujours possible** : le § 2 (« Revenir en arrière ») reste valable aussi longtemps que la v1 existe, c'est-à-dire toujours.
- [ ] **Correctifs de sécurité et d'accessibilité appliqués aux deux versions** : une PR qui corrige un gabarit ou une route publique dit si la v1 est touchée et la corrige aussi (les routes, les formulaires et leurs défenses sont communs ; les gabarits ne le sont pas).
- [ ] **Pas de nouveauté en v1** : une page ou une fonction nouvelle naît en v2 seulement, introuvable (404) en v1, comme les Carnets ; ses tests vérifient qu'aucune page v1 n'y mène (voir `test/carnet-public.test.js`).
- [ ] **Bouton de l'administrateur** : en vue v1, un administrateur voit exactement ce que verrait un visiteur si l'on revenait en v1 ; c'est la façon de vérifier, de temps en temps, que la v1 tient encore.
