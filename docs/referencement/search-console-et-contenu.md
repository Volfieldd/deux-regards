# Préparer Search Console et une croissance éditoriale utile

Cadre du 24 octobre 2026. Objectif de travail : faire découvrir les photographies, les séries et les récits de Nicephos. La [simulation de mise en ligne](simulation-mise-en-ligne.md) utilise exclusivement un corpus synthétique ; elle ne mesure ni l’inventaire réel du site ni ses positions dans Google.

## Ce que signifie optimiser

Le site fournit aux moteurs des pages accessibles, des liens, des informations cohérentes et des images autorisées. Search Console sert ensuite à vérifier ce que Google a réellement exploré, retenu et montré. Une validation locale, un sitemap accepté ou un test en direct ne prouvent pas l’indexation ni une position. [Inspection d’URL](https://support.google.com/webmasters/answer/9012289?hl=fr)

Le guide actuel de Google pour ses fonctions IA conserve les mêmes fondations : contenu original utile, expérience réelle, informations importantes accessibles en texte, images de qualité et maillage exploitable. Aucun fichier `llms.txt`, balisage IA spécial ou volume idéal de texte n’est demandé. [Guide officiel IA](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)

## Parcours propriétaire après la vraie mise en ligne

| Moment | Geste | Preuve attendue |
|---|---|---|
| Avant d’ouvrir aux moteurs | Choisir le domaine canonique et vérifier que `PUBLIC_URL` lui correspond, en HTTPS ; vérifier les redirections de l’autre forme du domaine | Une seule destination préférée, sans boucle ; certificat public valide ; pages et images accessibles depuis Internet |
| Jour de mise en ligne | Ajouter une propriété **Domaine** dans Search Console et suivre la [validation DNS donnée par Google](https://support.google.com/webmasters/answer/9008080?hl=en) | Propriété validée par le propriétaire ; aucun jeton fictif copié depuis la simulation |
| Même jour | Soumettre `https://votre-domaine.example/sitemap.xml` dans [**Sitemaps**](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) | Document lu par Google ; nombre d’URL découvertes cohérent avec le corpus public et ses langues ; éventuelles parties accessibles |
| Même jour | Inspecter l’accueil, une série, chaque photographe, une photo, un voyage, un Carnet et sa traduction publiée, puis la page 2 des Carnets | Test en direct : récupération réussie, exploration et indexation autorisées pour ces pages ; données structurées cohérentes avec le contenu visible |
| Même jour | Vérifier aussi les exclusions | Pages privées, liens temporaires et formulaires sensibles toujours exclus ; carte non publiée et faux chemin toujours introuvables ; aucun de ces contenus soumis pour indexation |
| Après réexploration | Comparer les données de la version indexée avec le site actuel | Canonique choisie par Google cohérente avec la canonique déclarée ; redirections et langues attendues ; ne pas transformer toute exclusion volontaire en erreur |
| Première semaine | Lire **Indexation des pages**, **Sitemaps**, actions manuelles et problèmes de sécurité | Distinguer exploration impossible, duplication, contenu encore non retenu et exclusion volontaire ; corriger les causes observées |
| Après des données suffisantes | Comparer [**Performances → Web** et **Images**](https://support.google.com/webmasters/answer/7576553?hl=en), par page, requête, pays et appareil | Impressions, clics, CTR et positions réellement mesurés ; choisir les améliorations depuis les requêtes observées, sans objectif chiffré inventé |
| Régulièrement | Examiner [**Signaux Web essentiels**](https://developers.google.com/search/docs/appearance/core-web-vitals) puis vérifier les pages concernées | Mesure terrain suffisante ; traiter les familles de pages affectées, plutôt qu’interpréter un seul test local comme le vécu des visiteurs |

La validation d’une propriété, les DNS, la soumission réelle du sitemap et les demandes d’indexation restent des actions du propriétaire dans les services réels. La simulation n’effectue aucune de ces écritures.

L’API `urlInspection/index:inspect`, lorsqu’elle est autorisée sur une propriété, renvoie l’état connu de l’index. Elle ne lance pas le test en direct de l’interface. [Documentation de l’API](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect)

## Les contrôles IA disponibles en 2026

Google annonce depuis le 31 août 2026 le réglage **Settings → Search generative AI**. Pour un objectif de visibilité, vérifier l’inclusion et son éventuel héritage depuis une propriété parente. Ce réglage appartient à Search Console ; le site ne prétend pas le piloter. L’inclusion dans les fonctions IA de Search et le contrôle de l’entraînement des modèles sont des sujets distincts. [Contrôle officiel](https://support.google.com/webmasters/answer/16908024)

Le rapport **Generative AI performance (Search)** permet de suivre les impressions dans AI Overviews et AI Mode. Il peut être absent faute d’impressions suffisantes. Ses données font aussi partie du total Web ; additionner ces deux rapports compterait une partie des impressions deux fois. [Rapport officiel](https://support.google.com/webmasters/answer/16984139?hl=en)

## Le contenu à développer

Une page supplémentaire doit répondre à une intention précise avec une matière originale. Produire beaucoup de pages surtout pour influencer le classement, sans valeur ajoutée, relève de la politique Google sur l’abus de contenu à grande échelle. L’assistance par IA est compatible avec un travail documenté et relu ; elle ne remplace pas les faits des auteurs. [Contenu généré par IA](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content), [règles antispam](https://developers.google.com/search/docs/essentials/spam-policies)

Le jeu standard de démonstration contient 12 photos, quatre séries et deux photographes, soit 18 pages de contenu distinct avant les index et informations. Trois langues représentent trois versions d’un sujet. Ce comptage décrit le jeu synthétique, pas le catalogue de production.

| Destination existante | Intention du lecteur | Matière à renseigner ou vérifier | Automatisation utile |
|---|---|---|---|
| Accueil | Comprendre ce que propose le site et choisir une entrée | Promesse fidèle au projet et sélection d’images représentatives | Titre, description, aperçu et accès aux rubriques |
| À propos | Identifier les auteurs et leur démarche commune | Présentation signée, exacte et concrète ; contact publié choisi | Repli sur l’introduction publique lorsqu’un texte manque |
| Chaque photographe | Découvrir un regard et ses œuvres | Présentation courte, biographie vérifiée, choix photographique | Nom en titre, photos, description localisée existante |
| Chaque série | Comprendre une sélection et parcourir ses images | Intention propre, lien réel entre les photos, dates pertinentes | Galerie, auteurs, années, description, couverture et liens |
| Chaque photo publiée | Voir l’œuvre, la situer et comprendre ses droits | Titre précis, légende factuelle et texte alternatif vérifié ; lieu seulement s’il est déjà public | Variante adaptée, métadonnées, crédit, droits, série, auteur et récits associés |
| Chaque voyage publié | Suivre une séquence et son contexte | Introduction et chronologie réellement documentées | Photos autorisées, étapes publiques et liens vers les Carnets |
| Chaque Carnet | Lire un récit ou une note d’atelier originale | Expérience, images et explications des auteurs ; traduction relue | Liens entre le billet, ses photos et son voyage, pagination et langues publiées |

Le maillage « Dans les Carnets » reprend désormais six billets publics éligibles au maximum sur une photo ou un voyage. Une citation présente dans une traduction encore en travail ne crée pas un lien public dans cette langue.

## Réserve de sujets, à documenter avant rédaction

Ces pistes sont des briefs, sans texte présenté comme une expérience réelle ni publication automatique :

1. La démarche commune de Sébastien et Julien, avec leurs propres mots.
2. Le regard de chacun, à partir d’une sélection commentée de ses photographies.
3. L’intention de chaque série effectivement publiée.
4. Le récit d’un voyage existant, avec ses dates et photos autorisées.
5. Une note d’atelier sur le choix d’une image, montrant les décisions réellement prises.
6. Deux photographies mises en regard, avec les observations précises des auteurs.
7. La préparation d’une exposition déjà documentée et ses choix d’accrochage.
8. Le bilan éditorial d’une exposition terminée, avec les éléments publiables.
9. Les explications des droits et des demandes de licence réellement proposés.
10. Une question fréquemment reçue, lorsqu’une réponse vérifiée existe et mérite une page ou une section.

Le nombre de pages découlera de cette matière. Une série substantielle ou un récit précis peut justifier sa propre page ; une variation de mot-clé, de ville ou d’ordre de galerie ne crée pas à elle seule un nouveau sujet. Le site conserve ses réglages de publication et ses garde-fous sur les personnes et les lieux.

## Comment juger un accompagnement externe

Un accompagnement utile doit présenter les problèmes observés, les sources, les changements proposés et leur mesure après mise en ligne : qualité éditoriale, exploration, images, expérience de lecture et données Search Console. Les qualifications « IA », « AEO » ou « GEO » ne suffisent pas à démontrer un résultat. Aucun intervenant ne peut fournir à l’avance les clics ou la canonique que Google choisira. [Guide officiel IA](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
