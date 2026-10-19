# Bascule de la v3 pour tous

Liste de contrôle pour faire voir la v3 du site public à tous les visiteurs (PLAN.md, point 9 ; Spécifications, P28 ; maquettes `docs/maquettes-v3/`). Chaque case se vérifie : on ne bascule pas tant qu'une case reste vide. Le geste lui-même est décrit dans l'aide d'[Apparence](Aide-Apparence#site-public--v1-ou-v2).

**Ce que la v3 change, et ce qu'elle ne change pas.** La v3 sert les pages de la v2 (mêmes adresses, mêmes formulaires, mêmes défenses, mêmes Carnets et galeries privées) avec un autre dessin. Elle a aussi un accueil à elle : la photo d'ouverture en plein cadre, recadrée de 10 % au plus autour de son point fort, l'en-tête et le titre posés dessus au bureau ; les regards présentés par leurs photos ; une ouverture propre au téléphone. Elle ne montre ni prix ni bouton d'achat. **La v1 et la v2 restent** : basculer, c'est choisir la version que voient les visiteurs. Le retour en v2 ou en v1 se fait à tout moment, d'un réglage, sans déploiement ni perte.

Ce qui est propre à la v3 tient dans `public/css/v3/v3.css` et `views/v3/` ; tout le reste est commun avec la v2.

## 1. Préparer le contenu de l'accueil

La v3 repose sur l'ouverture plus que la v2 : ses photos prennent tout l'écran.

- [ ] **Ouverture du bureau** (*Site public → Photos de l'ouverture*) : des **horizontales**, de même format autant que possible (3:2 le plus souvent). Une photo d'un autre format s'affiche entière, sur le noir, au lieu de remplir l'écran. Le cadre prend le format le plus large de la liste.
- [ ] **Ouverture du téléphone** (*Site public → Ouverture au téléphone (v3)*) : des **verticales**. Vide, le téléphone montre l'ouverture du bureau en pleine largeur, le titre dessous : c'est correct, mais moins beau.
- [ ] **Point fort de chaque photo de l'ouverture** (*fiche de la photo → Point fort du cadrage*) : pour chacune, vérifier au bureau (bouton **Voir en v3**) que rien d'important n'est coupé sur les bords ni caché sous le titre, en bas à gauche. Sinon, changer le point fort, ou retirer la photo de l'ouverture.
- [ ] **Photos claires** : sur une photo très claire en haut (ciel blanc, neige), le menu reste lisible (bande sombre fixée en pixels, contraste de 5,8:1 au pire), mais la bande se voit davantage. La regarder et décider si elle reste en tête de diaporama.
- [ ] **Regards** : l'accueil présente chaque photographe par deux de ses photos horizontales, dans l'ordre choisi de la galerie (*Photothèque → ordre*). Il faut deux photographes ayant chacun au moins trois horizontales publiées ; sinon, la v3 montre la liste de la v2. Vérifier que les photos retenues sont celles qu'on veut voir là.

## 2. Avant de basculer

- [ ] **v3 essayée sur trois écrans**, avec **Voir en v3** en haut d'une page publique : un **iPad** (portrait et paysage), un **ordinateur** (si possible un écran large, 16:9 ou plus, où l'ouverture garde des bandes noires sur les côtés plutôt que de recadrer davantage), un **téléphone**. À parcourir : l'accueil (ouverture, « Lire », un trait, retour à la première), la galerie, une série, la visionneuse (photo suivante, plein écran, rotation), Rechercher, Carte, Voyages, À propos, les pages légales, « Je vous ai photographié », Signaler, Partager, une page introuvable, les Carnets ; en français, en anglais et en allemand ; thème de nuit et de jour. Rien de cassé, rien d'illisible, aucun bouton d'achat.
- [ ] **Sans JavaScript** (navigateur réglé sans script, ou extension) : l'accueil montre la première photo et son cartel, sans traits ni « Lire » ; tout le reste marche.
- [ ] **Test des liens internes vert** sur le code qui sera en ligne : `node --test test/liens-internes.test.js` parcourt la v1, la v2 et la v3 en trois langues (registre de la Vigie, BV-5). À lancer après la dernière fusion, pas avant.
- [ ] **Seuils d'aspiration de la Vigie** (BV-4, DS15) : la v3 charge les mêmes images que la v2, plus la photo d'ouverture à la largeur de l'écran (variante de 1 280 ou 2 000 px). Si la v2 n'a pas encore été basculée, faire la case de [la liste de la v2](Bascule-v2) ; sinon, **confirmer avec la session de la Vigie** qu'il n'y a rien à revoir, et noter ici la date.
- [ ] **Sauvegarde récente et vérifiée** : la dernière a moins de 24 h et n'a pas d'alerte (`cat $BACKUP_DIR/last.json`, ou `node server/db/backup.js --etat` dans le conteneur `backup`) ; sinon, une sauvegarde manuelle (`docker compose run --rm backup node server/db/backup.js`). Voir [Déploiement](Déploiement#sauvegardes).
- [ ] **Aucune alerte ouverte** dans la Vigie qui touche le site public (entrée « Sécurité » de l'admin, ou la console).

## 3. Basculer

1. *Apparence* → section **Site public : v1, v2 ou v3** (en tête de page) → cocher **v3** → **Enregistrer la version**.
2. Vérifier depuis une fenêtre privée (sans session d'administrateur), au bureau et au téléphone : l'accueil est en plein cadre, une photo et une page en anglais sont en v3.
3. Le changement est noté au journal de l'admin (*Réglages → Journal* : « site public : v2 → v3 ») et vu par la Vigie (`config_public_changed`). Rien à vider côté Cloudflare : les pages HTML du site ne portent pas d'en-tête de cache (sauf règle de cache ajoutée à la main : la vérifier), et la feuille de la v3 a sa propre adresse (`/static/css/v3/v3.css`).

**Revenir en arrière**, à tout moment et sans perte : même section, cocher **v2** (ou **v1**), **Enregistrer la version**. Les réglages, les textes, les photos, les deux ouvertures et les points forts ne dépendent pas de la version : en v1 et en v2, l'ouverture du téléphone et les points forts ne servent simplement pas.

## 4. La première semaine

Une fois par jour, sept jours :

- [ ] **Alertes de la Vigie** : aspiration (DS15) et pages introuvables (`malicious_excess_404`) surtout ; une alerte sur un visiteur ordinaire est un faux positif à classer comme tel et à signaler à la session de la Vigie.
- [ ] **Pages introuvables** : les 404 par adresse dans la console de la Vigie (événements) ou dans les journaux du site (`docker compose logs site`). Les adresses sont celles de la v2 : une 404 nouvelle est un lien cassé à corriger, et à ajouter au test des liens internes.
- [ ] **Search Console** : rapport *Pages* (pages indexées, erreurs 404 ou 5xx nouvelles), *Sitemaps* (lu sans erreur) et surtout *Signaux Web essentiels* : l'accueil charge maintenant une grande photo dès l'arrivée ; si l'accueil passe en « À améliorer » ou « Mauvaise » (LCP), le signaler (pistes : une variante plus légère pour l'ouverture, un format AVIF plus compressé).
- [ ] **Retours des visiteurs et des photographes** sur le recadrage : une photo mal coupée se règle par son point fort, sans attendre.

Un problème qui touche les visiteurs et qui ne se corrige pas dans la journée : revenir en v2 (§ 3), corriger, recommencer la liste.

## 5. Après la bascule : la v2 et la v1 restent

- [ ] **Retour possible** en v2 ou en v1, toujours, par le § 3.
- [ ] **Les corrections des pages se font dans les gabarits de la v2** (`views/v2/`) : elles valent pour la v2 et la v3. Une correction du dessin propre à la v3 va dans `public/css/v3/v3.css` ou `views/v3/` ; une PR dit si elle touche la v2, la v3, ou les deux.
- [ ] **Correctifs de sécurité et d'accessibilité dans toutes les versions** : routes, formulaires et défenses sont communs ; les gabarits de la v1 ne le sont pas (voir [la liste de la v2](Bascule-v2), § 4).
- [ ] **Pas de style en ligne** dans les gabarits : la CSP du site (`style-src 'self'`) le bloque ; un format ou un point fort passe par une classe (`.fmt-*`, `.focal-*`).
