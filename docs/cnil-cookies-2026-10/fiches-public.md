# Fiches des finalités du site public

**Pièce initiale sur 1.217.0.** Le [suivi sur 1.226.0](suivi-exigences.md) remplace les constats techniques devenus historiques, notamment la purge du récapitulatif désormais autonome. La [fiche P09](fiches-votes.md) ajoute le vote ; les décisions de finalité/durée encore ouvertes restent à compléter.

Lecture du commit **f44cdf3, version 1.217.0**, le 24 octobre 2026. Les positions proposées restent à décider par les responsables ; elles ne certifient ni la production ni les prestataires. **Les mesures visent à conserver toutes les fonctions ; aucune modification produit n’est réalisée ici.** Une alternative qui perd la mémoire intervisites ou la continuité promise n’est pas équivalente.

L’[article 82](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037813978) concerne le terminal ; le [RGPD](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2) s’applique séparément aux traitements personnels, y compris exclusivement serveur. Une empreinte ou un jeton chiffré peut rester pseudonyme. La [CNIL](https://cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi) reconnaît notamment l’authentification et certaines personnalisations attendues. La [recommandation consolidée, § 5](https://www.cnil.fr/sites/default/files/2026-01/recommandation_cookies_consolidee.pdf) distingue l’information recommandée sur les traceurs exemptés des obligations connexes d’information personnelle.

**Preuves antérieures :** [135 tests réussis](../audit-cookies-2026-10/preuves/tests-cibles.txt), incluant les suites langue, galerie, récapitulatif et confidentialité ; [13 contrôles complémentaires](../audit-cookies-2026-10/preuves/controles.json), dont parcours Chromium langue et J’aime. Les [11 tests statistiques/partage](preuves/tests-audience-partage.txt) ont aussi été relancés dans ce stream ; les autres tests cités comme présents ne sont pas déclarés exécutés. Aucun nouveau test durable créé. Les quatre tests de liens antérieurs ne prouvent pas l’exemption. Les mesures ci-dessous sont proposées, pas livrées ; leurs durées futures restent à arbitrer.

## P01 — Retrouver sa langue

**Service et demande :** choisir une langue et la retrouver lors d’une prochaine arrivée ; clic sur le sélecteur. **Statut : Exemption étayée dans son principe.**

**Nécessité et alternatives :** les chemins `/en` et `/de` assurent la navigation courante, mais ne retrouvent pas seuls le choix intervisites. Une préférence serveur exige aussi une reconnaissance du navigateur ou un compte ; elle n’est pas automatiquement moins intrusive. Le stockage actuel ne sert qu’à l’orientation linguistique ; aucune réutilisation découverte.

**État :** cookie `langue=fr/en/de`, hôte courant, `Path=/`, HttpOnly/Lax, Secure en HTTPS, **365 jours à chaque nouveau choix** ; pas de renouvellement à la lecture ni suppression dédiée. La fermeture du navigateur n’efface pas cette préférence persistante.

**RGPD et information :** la valeur isolée est une préférence non identifiante dans l’exemple CNIL ; si elle est rattachée à une personne, intérêt légitime à la personnalisation proposé, à valider. Informer de la portée appareil et de la durée. **À compléter :** justification des 365 jours, exclusivité réelle, observations prestataires. **Mesures :** maintenir la reconnaissance, rendre le choix de mémorisation compréhensible, prévoir effacement et protection selon la politique crypto.

**Références/preuves :** [public.js](../../server/routes/public.js), 106–113, 259–269 ; [langues.test.js](../../test/langues.test.js), 98–108, exécuté. Contrôles Chromium avec et sans JavaScript réussis ; aucune observation production.

## P02 — Maintenir l’accès à une galerie privée

**Service/demande :** consulter sa galerie après mot de passe accepté ; « Se souvenir » demande une persistance supplémentaire. **Statut : Exemption étayée dans son principe.**

**Nécessité :** conserver une session évite de ressaisir les secrets à chaque ressource. Un secret d’URL augmenterait l’exposition ; un compte obligatoire changerait le service. Jeton et droits servent l’accès et sa sûreté, pas l’audience ; les journaux associés ont leur propre justification.

**État :** `[__Host-]visiteur`, jeton de 32 octets, empreinte seule en base, `/`, HttpOnly/Lax, Secure en HTTPS ; cookie de session ou **30 jours** avec souvenir. Session serveur : 30 jours depuis création/rotation. Autorisation : 12 h d’inactivité et 7 jours absolus, ou 30 jours avec souvenir, plafonnés par invitation/galerie. Le cookie peut subsister après le droit. L’activité actualise les dates, sans prolonger la borne absolue. « Quitter » retire tous les droits et remplace le cookie ; anciens jetons 48 h. Purge au démarrage puis horaire.

**RGPD/info :** registre actuel : contrat pour séance commandée, intérêt légitime pour autres invitations/sécurité ; applicabilité à confirmer. Jeton pseudonyme. Expliquer droits, cookie, souvenir et sortie séparément. **Manquent :** justification des durées et configuration réelle. **Mesures :** maintenir rotation/révocation, borner et protéger l’état ; arbitrer le souvenir partagé entre galeries.

**Références/preuves :** [prive.js](../../server/routes/prive.js), 75–106, 252–265, 564–575 ; [visitor-sessions.js](../../server/visitor-sessions.js), 12–75 ; [spaces.js](../../server/spaces.js), 457–509 ; [app.js](../../server/app.js), 321–323. [prive.test.js](../../test/prive.test.js), 105, 214, 293, 311 : suite exécutée ; pas de parcours externe réel.

## P03 — Montrer le récapitulatif Bonjour

**Service/demande :** après un envoi accepté, montrer une fois les choix transmis. **Statut : Justification à compléter.**

**Nécessité/alternatives :** le couple cookie/mémoire lie la redirection au navigateur. Un rendu direct du POST pourrait conserver le récapitulatif, mais sa gestion des doubles envois, rechargements et retours doit être démontrée avant substitution. Rien ne justifie une perte du récapitulatif. Usage découvert limité à cette remise.

**État :** cookie `bonjour_recap`, jeton de 16 octets, chemin `/bonjour` localisé, HttpOnly/Lax, Secure en HTTPS, 900 secondes par envoi. Mémoire serveur : référence, date/heure, lieu, choix, demandes de droits, tranche d’âge et indicateurs de présence d’un message/e-mail ; ni nom, adresse ni parent. Lecture unique puis suppression ; expiration logique à 15 minutes ; purge seulement lors d’un dépôt/lecture, 500 entrées au plus. Aucun renouvellement à la visite ; plusieurs chemins linguistiques possibles.

**RGPD/info :** données corrélables à une rencontre ; rattachement à la finalité principale et à sa base à valider, sans déduire un consentement traceur de l’envoi. Expliquer contenu et durée réelle. **Manquent :** nécessité du dispositif choisi, purge effective, base accessoire. **Mesures :** garantir le même service, protection crypto et nettoyage autonome ; conserver la règle « jamais sur disque ».

**Références/preuves :** [public.js](../../server/routes/public.js), 66–94, 693–702, 755–759 ; [encounters.js](../../server/encounters.js), 213–214 ; [bonjour-mineurs.test.js](../../test/bonjour-mineurs.test.js), 209–268 : suite exécutée, dont unicité et bornes ; nettoyage physique autonome absent statiquement.

## P04 — Retrouver ses J’aime et limiter les doublons

**Service/demande :** clic J’aime interne, retrait et reconnaissance lors des visites suivantes. **Statut terminal : Justification à compléter. Statut de la mémoire IP/photo seule : Hors article 82 pour l’état serveur seul.**

**Nécessité :** l’état de page seul perd la reconnaissance durable ; ce n’est pas équivalent. Une mémoire serveur nécessite un identifiant navigateur et une analyse comparable. Le clic ne prouve pas automatiquement la nécessité d’une conservation indéfinie. Aucun SDK social ni usage publicitaire trouvé ; ne pas réutiliser cette mémoire comme identifiant d’audience.

**État :** localStorage `aime:<slug>=1`, sans TTL, écrit après succès effectivement compté, retiré lors du retrait réussi. Côté serveur : clé IP/photo, validité 12 h, purge au prochain J’aime/retrait ; 100 000 entrées au plus. Nouvelle réaction comptée renouvelle sa date ; compteur agrégé persistant. La suppression locale ne supprime pas la mémoire serveur, et inversement.

**RGPD/info :** intérêt légitime aux interactions/prévention des doublons proposé, mise en balance nécessaire ; distinct d’un éventuel consentement terminal. Décrire appareil, durée, retrait et IP temporaire. **Manquent :** nécessité de persistance, durée, articulation après 12 h. **Mesures :** conserver le service durable, borner/protéger chaque état ; si exemption non étayée, examiner un choix contextuel valable avant stockage, sans acceptation globale.

**Références/preuves :** [site.js](../../public/js/site.js), 473–493 ; [v2/site.js](../../public/js/v2/site.js), 181–199 ; [feedback.js](../../server/feedback.js), 9–42. Contrôle Chromium J’aime/rechargement exécuté ; [jaime.test.js](../../test/jaime.test.js), 10 : présent, non inclus dans les 135.

## P05 — Retrouver son choix de mouvements réduits

**Service/demande :** bouton de la Chambre noire et préférence système. **Statut : Exemption étayée dans son principe**, sous personnalisation exclusive attendue.

**Nécessité :** `prefers-reduced-motion` ne remplace pas un choix propre au site ; l’état de page ne conserve pas le choix intervisites. Ne pas inférer un état de santé. Aucun autre usage trouvé.

**État :** localStorage `nicephos-calm`, `1/0`, créé/modifié au clic, sans date ni purge ; lecture automatique sur les pages concernées. La préférence système impose la réduction et désactive le bouton correspondant.

**RGPD/info :** caractère personnel à examiner si associée à un compte ou contexte identifiable ; intérêt légitime à la personnalisation proposé dans ce cas, à valider. Expliquer portée appareil et remise à zéro. **Manquent :** durée justifiée, preuve d’exclusivité et effacement. **Mesures :** préserver choix durable et accessibilité, fixer une durée sans la décréter ici ; transmettre les contraintes crypto au chantier technique.

**Références/preuves :** [chambre-noire.js](../../public/js/chambre-noire.js), 4–16 ; [layout.eta](../../views/v2/layout.eta), 57–58. [themes-sections.test.js](../../test/themes-sections.test.js), 47–58 : rendu seulement, présent, non exécuté ici ; aucune preuve antérieure spécifique de persistance/purge.

## P06 — Revenir à la dernière photo de la galerie

**Service/demande :** ouvrir des photos puis revenir au contexte et à la position quittés. **Statut : Justification à compléter.**

**Nécessité/alternatives :** historique et ancre peuvent aider mais doivent conserver aussi filtres, dernière photo parcourue et comportement de retour ; leur équivalence n’est pas démontrée. Aucun usage hors navigation trouvé.

**État :** sessionStorage `retour-galerie` : chemin/requête, slug, état `armed`, date. Validité trois heures depuis **la dernière écriture**, actualisée pendant le parcours ; entrée périmée ignorée, pas effacée par ce contrôle. Durée physique liée à la session de l’onglet ; aucune garantie de destruction absolue en cas de restauration navigateur.

**RGPD/info :** contexte pouvant révéler une navigation/recherche, à examiner selon contenu ; intérêt légitime au parcours proposé si données personnelles, à documenter. Informer sur mémoire d’onglet. **Manquent :** nécessité des trois heures, paramètres minimaux et purge. **Mesures :** préserver toutes les restaurations, borner le contexte et effacer l’état devenu inutile ; ne pas transporter de secret dans l’URL.

**Références/preuves :** [site.js](../../public/js/site.js), 155–200 ; [v2/site.js](../../public/js/v2/site.js), 48–85. [public.spec.js](../../e2e/tests/public.spec.js), 98, 216 : tests présents, non exécutés dans la campagne antérieure ; aucune preuve d’expiration effective.

## P07 — Poursuivre le plein écran entre photos

**Service/demande :** ouvrir le dialogue plein écran puis naviguer entre photos. **Statut : Exemption étayée dans son principe**, continuité du mode demandé.

**Nécessité :** un booléen de page est perdu au changement de document ; redemander l’ouverture à chaque photo dégrade la fonction. Une visionneuse sans navigation complète serait une autre architecture, non validée comme remplacement. Aucun usage de suivi trouvé.

**État :** sessionStorage `plein-ecran=1`, posé à l’ouverture ; relu sur la photo suivante. Retiré à fermeture/Échap et lors de certaines navigations ordinaires ou glissés ; pas de TTL, durée de l’onglet. Le dialogue peut être restauré sans redemander le plein écran natif, réservé aux gestes autorisés par le navigateur.

**RGPD/info :** choix isolé non identifiant ; si rapproché d’une personne, intérêt légitime à la continuité proposé, à valider. Expliquer continuité et sortie. **Manquent :** vérification de toutes les sorties et de la restauration d’onglet. **Mesures :** garder la continuité, borner l’état au parcours, préserver focus et contraintes navigateur ; aucune durée nouvelle décidée.

**Références/preuves :** [v2/site.js](../../public/js/v2/site.js), 89–159 ; [visionneuse-v2.spec.js](../../e2e/tests/visionneuse-v2.spec.js), 72–95 : présent, non exécuté dans la campagne antérieure ; persistance entre documents à contrôler.

## P08 — Mesurer les visiteurs uniques

**Service :** statistiques de fréquentation pour l’éditeur ; aucune demande explicite d’identification quotidienne du visiteur. **Statut : Justification à compléter** ; état conservé seulement au serveur à distinguer des éventuelles opérations de lecture du terminal. Voir le [dossier audience](audience.md).

**Nécessité :** les pages vues seules ne remplacent pas les visiteurs uniques demandés. Maintenir cet indicateur exige une déduplication proportionnée, pas automatiquement les données actuelles. Usage découvert limité à l’audience ; aucune réutilisation en sécurité ou multisite établie.

**État :** empreintes HMAC IP/navigateur et IP seule, clé aléatoire journalière, ensembles en RAM ; renouvellement au premier événement du nouveau jour, pas à minuit par minuteur. Agrégats en base, purge au-delà de 25 mois lors du changement de jour. DNT/GPC et exclusions appliqués ; référent réduit au domaine.

**RGPD/info :** intérêt légitime d’audience proposé ; calcul temporaire personnel à distinguer des restitutions anonymes. **Manquent :** autoévaluation complète, anonymat des petits effectifs, minimisation des en-têtes, opposition, configuration réelle. **Mesures :** préserver l’indicateur, corriger les critères manquants sans prétendre qu’un HMAC anonymise. Aucun délai futur arbitré.

**Références/preuves :** [stats.js](../../server/stats.js), 58–113 ; [statistiques.test.js](../../test/statistiques.test.js), non inclus dans les 135 initiaux mais relancé avec la suite de partage dans ce stream : [11 réussites](preuves/tests-audience-partage.txt). L’[outil CNIL de juillet 2025](https://www.cnil.fr/sites/default/files/2025-07/outil_d_auto-evaluation_mesure_d_audience.pdf) structure l’analyse ; il ne certifie pas la solution. Aucun parcours production effectué.
