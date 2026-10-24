# Dossier CNIL des cookies et mémoires de Nicephos

**Actualisation du 24 octobre 2026 — version vérifiée 1.226.0, commit `994a899c8fe1ac663f90671894e5d843d847eb48`.** Le dossier initial examinait 1.217.0/`f44cdf3`. Le présent suivi repart du main récupéré, intègre les offres gratuites Cloudflare/Zitadel déclarées et vérifie les exigences sur le code courant. Le travail se déroule dans un worktree séparé ; aucune donnée réelle consultée ni fonctionnalité modifiée. La version déployée reste non vérifiée.

**Les cinq correctifs du premier lot technique sont intégrés et vérifiés ; le chiffrement intégral reste à livrer.** Commencer par [le contrôle des exigences](suivi-exigences.md) et [le mode d’emploi des fiches](utiliser-les-fiches.md). Les textes initiaux conservent leur date et leurs preuves ; le suivi précise les constats devenus historiques.

**Précision du propriétaire : l’ensemble est déployé en zone euro.** Cette localisation est enregistrée comme acquise par déclaration dans les [prestataires](fournisseurs.md). Elle complète le dossier géographique sans clôturer les garanties contractuelles des flux tiers, l’exemption par finalité ou les exigences techniques encore ouvertes.

**Position proposée : conserver les fonctions, justifier leurs mémoires et corriger les garanties manquantes.** Les usages d’authentification et certaines préférences disposent d’un fondement d’exemption solide dans leur principe. Le J’aime durable, la copie de secours hors ligne et certaines mémoires de parcours demandent encore une démonstration précise. La mesure d’audience a des garanties favorables, mais son auto-évaluation n’est pas close. Aucun de ces constats ne justifie d’imposer un consentement global pour entrer sur le site.

Le dossier contient **19 fiches de finalités** : les 18 initiales et le nouveau vote d’exposition. Il comprend une grille d’audience renseignée, les preuves/limites, les exigences et leur contrôle d’application, des propositions d’information FR/EN/DE et les pièces prestataires. Il n’atteste ni la conformité globale du site ni une validation de la CNIL. Les conditions de l’installation réelle et les décisions des responsables restent identifiées comme telles.

## 1. Lecture et livrables

| Document | Contenu |
|---|---|
| [Utiliser les fiches](utiliser-les-fiches.md) | Actions du propriétaire et du développeur, décisions acquises, compléments et critères de clôture |
| [Application des exigences](suivi-exigences.md) | Cinq correctifs vérifiés, statuts T01–T15, tests courants et travaux restant à livrer |
| [Fiches du site public](fiches-public.md) | P01–P08 : service demandé, nécessité, alternatives équivalentes, données, durées, preuves et justification |
| [Fiches administration et Vigie](fiches-admin-vigie.md) | A01–A07 et V01–V03, avec séparation terminal/serveur et réserves de conservation |
| [Fiche du vote d’exposition](fiches-votes.md) | P09 : consentement au premier vote, cookie dédié, preuve, retrait/export, purge et écarts de protection |
| [Auto-évaluation d’audience](audience.md) | Pointage de la grille CNIL de juillet 2025, écarts aux recommandations, garanties alternatives à démontrer et mesures conservant les indicateurs |
| [Exigences techniques](exigences-techniques.md) | T01–T15 : résultats attendus, dépendances et preuves de clôture sans conception cryptographique imposée ici |
| [Prestataires](fournisseurs.md) | Fonctions et contrats à qualifier ; relevés expurgés à fournir par le propriétaire |
| [Information FR/EN/DE](information-fr-en-de.md) | Corrections étayées, formulations de travail et conditions avant publication |
| [Sources et méthode](sources.md) | Textes officiels, portée des conclusions et séparation des décisions |

L’[inventaire initial](../audit-cookies-2026-10/inventaire-technique.md) et la [carte des protections](../audit-cookies-2026-10/protections-et-caches.md) restent des pièces techniques. Les propositions antérieures de supprimer certaines mémoires sont des alternatives, pas la cible décidée : **le maintien fonctionnel prévaut**.

## 2. Règle d’analyse

Une opération de lecture/écriture du terminal est examinée au titre de l’article 82 ; un éventuel traitement personnel est examiné séparément au titre du RGPD. Un état conservé uniquement sur le serveur n’a pas à obtenir une « exemption de cookie » par lui-même. Le cookie qui permet d’y accéder peut, lui, relever de l’article 82. Voir les références R01–R09 dans [sources.md](sources.md).

L’exemption se rapporte au service réellement demandé et à l’usage exclusif du stockage. Le souhait du propriétaire de proposer une fonction n’est pas à lui seul une demande expresse du visiteur. La nécessité n’est pas prouvée par le seul fait que le code actuel dépend de ce stockage. Inversement, une alternative qui perd la fonction promise n’est pas déclarée équivalente.

Le chiffrement confirmé par le propriétaire est une politique de sécurité à réaliser dans le stream technique. Il ne rend pas les identifiants anonymes, n’accorde aucune exemption et ne remplace ni une base légale ni les durées et droits applicables.

## 3. Matrice de couverture et position proposée

**E** : exemption étayée dans son principe, sous conditions. **J** : justification à compléter. **S** : état serveur seul hors article 82, avec examen RGPD séparé. Aucun statut ne certifie l’installation.

| Fiche | Périmètre et usage | Stockage couvert | Position |
|---|---|---|---|
| P01 | Public : langue retrouvée | Cookie `langue` | E ; durée et information à justifier |
| P02 | Public : galerie et souvenir | Cookie `[__Host-]visiteur`, sessions et autorisations | E ; distinguer durée du cookie et fin du droit |
| P03 | Public : récapitulatif Bonjour | Cookie `bonjour_recap` et magasin mémoire | J ; nécessité et base accessoire à justifier ; purge autonome désormais vérifiée |
| P04 | Public : J’aime durable | localStorage `aime:<slug>`, mémoire IP/photo | J pour le terminal ; S pour la mémoire serveur seule |
| P05 | Public : mouvement réduit | localStorage `nicephos-calm` | E ; durée sans limite et effacement à traiter |
| P06 | Public : retour galerie | sessionStorage `retour-galerie` | J ; nécessité, paramètres et durée du parcours |
| P07 | Public : continuité plein écran | sessionStorage `plein-ecran` | E dans le principe de continuité demandée ; sorties à vérifier |
| P08 | Public : audience | Empreintes temporaires et agrégats | J ; grille détaillée non close |
| P09 | Public : vote d’exposition | Cookie `[__Host-]exposition_vote_<id>`, preuve et bulletins serveur | Consentement contextuel déjà retenu ; chiffrement complet et copies à compléter |
| A01 | Admin : connexion et OIDC | Cookies session et `oidc-<state>`, état serveur | E ; échéance OIDC et purge admin corrigées, confidentialité encore partielle |
| A02 | Admin : connexion Instagram | Cookie `ig_state` | E pour la protection de cette association ; fournisseur séparé |
| A03 | Admin : messages et annulation | Cookie `flash`, sessionStorage `toast` | J pour le stockage choisi ; conserver les détails utiles et Défaire |
| A04 | Admin : langue | Cookie `admin_langue` ou préférence du photographe | E ; portée compte/appareil et durée à définir précisément |
| A05 | Admin : thème | Cookie `admin_theme` | E ; remise à zéro et durée |
| A06 | Admin : densité et aperçu | localStorage `planche-taille`, cookie `apercu_theme` | J à formaliser séparément pour les deux préférences |
| A07 | Admin : secours Carnets | localStorage `carnet-<id>-<lang>` | J ; copie privée durable sans durée ni compte dans la clé actuelle |
| V01 | Vigie : connexion console | Cookies `__Host-vigie`, `__Host-vigie-tx` | E ; vérifier les conditions réelles Access/IdP et les copies serveur |
| V02 | Vigie : thème | localStorage `vigie-theme` | E ; durée et remise à zéro |
| V03 | Vigie : journal, reprise, décisions et copies | États serveur, exports et sauvegardes | S pour le seul stockage serveur ; bases, durées, sécurité et droits restent applicables |

Cette table couvre désormais **treize familles de cookies** et **huit familles de stockage Web** : douze familles initiales, plus celle du vote. Les variantes HTTP/HTTPS et les noms OIDC ou d’expositions dynamiques sont une seule famille par finalité, pas des décisions juridiques distinctes. Les fournisseurs F01–F05 sont des points supplémentaires, non déduits de cette couverture applicative.

## 4. Conclusions opérationnelles par périmètre

### Site public

La langue et la session privée peuvent rester proposées sans demander une acceptation générale, sous les conditions décrites. Le J’aime durable doit être expliqué comme un service de mémorisation, avec nécessité et durée à démontrer ; un clic générique ne justifie pas à lui seul une persistance sans limite. Retour, plein écran et mouvement doivent rester limités à leur fonction, sans rapprochement avec l’audience.

Le récapitulatif conserve son service et la règle « jamais sur disque ». Son nettoyage physique dispose désormais d’une échéance autonome vérifiée. Le vote a son consentement contextuel, sans conditionner la visite. Aucune suppression de fonction ou création de compte visiteur obligatoire n’est décidée.

### Administration

Connexion, OIDC et association Instagram ont un fondement d’authentification identifiable. Le rôle d’opérateur n’accorde pas d’exemption aux préférences et copies annexes. Les notifications détaillées et le secours Carnets doivent rester utiles, tout en étant protégés et associés au bon compte. Un brouillon récupérable après fermeture hors ligne exige une persistance locale ; ce besoin doit être explicité plutôt que remplacé par une mémoire volatile non équivalente.

### Vigie

Les deux cookies de connexion se qualifient séparément de la surveillance serveur. La mise en balance existante de sécurité, les destinataires et les durées restent à finaliser. **D38 n’est pas tranchée par ce dossier.** Le chiffrement doit préserver preuves, droits et fonctionnement en panne ; aucune chaîne réécrite ni clé globale distribuée par ce stream.

## 5. Points empêchant la clôture de l’auto-évaluation d’audience

1. **Empreinte :** IP et navigateur complets sont utilisés. L’alternative au niveau de minimisation recommandé n’est pas documentée.
2. **Sites :** clé aléatoire séparée par instance/jour, mais composante de domaine non explicite ; l’équivalence du cloisonnement réel reste à prouver.
3. **Faibles volumes :** chiffres exacts pouvant valoir un, périodes et sorties annexes ; aucune étude d’anonymat alternative identifiée.
4. **Opposition :** DNT/GPC honorés par les vues/visiteurs, sans commande d’opposition immédiate propre au site dans la page lue.
5. **Temps et information :** nettoyage déclenché par le trafic ; formulations actuelles d’anonymat et d’effacement trop générales.
6. **Périmètre :** partages comptés séparément, exclusions différentes et rétention non définie par une purge identifiée ; usages et contrats réels non vérifiés.

Ce sont des critères à fermer, pas une décision de supprimer les visiteurs uniques. Une mesure recommandée peut être remplacée par une alternative dont les garanties sont démontrées. Garder la fonction ne garantit toutefois pas le maintien de chaque granularité exacte si celle-ci permet d’identifier une visite. L’[analyse détaillée](audience.md) conserve cette distinction.

## 6. Décisions et pièces attendues

| Référence | Décision ou pièce | État au 24 octobre 2026 |
|---|---|---|
| D-C01 | Usage éditorial/opérationnel des statistiques, provenances et partages ; absence de réutilisation marketing/personnelle | À confirmer par les responsables |
| D-C02 | Durées nécessaires des mémoires de préférence et de reprise, renouvellement et moyens d’effacement | À motiver ; aucune nouvelle durée fixée ici |
| D-C03 | Justification du service de J’aime durable et du secours local ; décision de qualification ou choix contextuel si nécessaire | Non close |
| D-C04 | Garanties de minimisation, isolement et anonymat des sorties d’audience | Analyse/code complémentaires nécessaires |
| D-C05 | Bases légales proposées et mises en balance des phases personnelles, notamment sécurité/Vigie | Propositions documentées, non validées par signature des responsables |
| D-C06 | Fonctions Cloudflare, protections Access, domaines/cookies et contrats réels | Offres gratuites et déploiement de l’ensemble en zone euro déclarés par le propriétaire ; documents publics réunis ; relevés des fonctions et rattachement contractuel encore à compléter |
| D-C07 | Couverture de chiffrement, clés, anciennes copies et restauration | Politique confirmée ; étude disponible, couverture générale non livrée selon le contrôle courant |
| D-C08 | Durée des dossiers/incidents, habilitations et copies de sécurité selon les décisions existantes | D38 et éléments du registre restent ouverts |

Les responsables peuvent arrêter une décision motivée, datée et rattachée à la configuration. Une réponse absente ne vaut ni accord ni clôture. Les cas réellement discutables peuvent faire l’objet d’une revue juridique sur ces fiches précises ; aucun label « validé CNIL » ne doit en être déduit.

## 7. Preuves et limites

- **Historiques sur f44cdf3 :** [135 tests initiaux](../audit-cookies-2026-10/preuves/tests-cibles.txt), [13 contrôles complémentaires](../audit-cookies-2026-10/preuves/controles.json), dont Chromium ; puis [11 tests statistiques/partage](preuves/tests-audience-partage.txt), [4 liens applicatifs](preuves/liens-internes.txt) et [liens du dossier initial](preuves/liens-documents.txt). Ne pas les attribuer à la version actuelle.
- **Rejouées sur 994a899 :** [101 tests ciblés](preuves/tests-suivi-technique.txt), [66 avec Vigie simulée](preuves/tests-suivi-vigie.txt), tous réussis sans échec, ignoré ou annulé ; **sept cas Chromium réussis**, sans erreur de script/console relevée, dans le [contrôle navigateur](preuves/controle-navigateur.json). Les deux sélections de tests se recouvrent.
- **Clôture documentaire :** [liens applicatifs](preuves/liens-internes-suivi.txt), [nouveau passage après la précision de localisation](preuves/liens-precision-localisation.txt) et [références du dossier](preuves/liens-documents-suivi.txt).
- **Non exécuté :** observation de production, analyse des contrats du compte réel, instrumentation de visiteurs, restauration réelle, nouveau parcours complet de secours hors ligne/plein écran, preuve juridique d’anonymat ou examen indépendant des cas gris.

Les tests présents mais non rejoués sont identifiés dans les fiches et le suivi. Les mesures proposées ne sont pas présentées comme livrées. Aucune suite complète n’a été relancée pour ce travail documentaire ; les contrôles ciblés sont proportionnés et ne prouvent pas l’exemption.

## 8. Passage au stream technique et information

Les exigences T01–T15 donnent des critères de clôture au [stream technique](../audit-cookies-2026-10/streams/technique.md). Les corrections établies de configuration ou purge peuvent avancer indépendamment ; elles ne tranchent pas un usage juridique encore ouvert. Les changements de durée, finalité ou droits doivent rester explicites.

Les propositions FR/EN/DE sont préparées sans publication et sans promesse anticipée. Les phrases sur anonymat, fin de journée, récapitulatif et cookie privé demandent une information précise. Le registre et l’information de l’équipe doivent suivre le comportement réellement retenu.

Le dossier permet de poursuivre la conservation des fonctions en connaissance des conditions à démontrer. **L’absence de consentement global n’exige pas que toute fonction soit automatiquement activée sans choix : une opération non exemptée doit rester inactive avant un éventuel consentement contextuel valable.** L’entrée et la navigation publique n’en dépendent pas.
