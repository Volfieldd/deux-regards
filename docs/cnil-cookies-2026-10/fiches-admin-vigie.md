# Fiches de qualification de l’administration et de la Vigie

**Pièce initiale sur 1.217.0.** Le [suivi sur 1.226.0](suivi-exigences.md) et sa preuve auth/Vigie actualisent l’expiration OIDC, la purge admin et la robustesse du stockage, désormais corrigées. Les réserves de chiffrement, d’isolation et de durée restent à traiter.

Lecture du commit `f44cdf3` (1.217.0), 24 octobre 2026. Ces qualifications sont proposées aux responsables ; elles ne valent pas validation de la CNIL. Les alternatives doivent préserver le service demandé, notamment la reprise hors ligne.

L’[article 82, expliqué par la CNIL](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi), concerne les opérations sur le terminal, cookies et stockages Web compris. La CNIL reconnaît notamment l’authentification et certaines [personnalisations intrinsèques attendues, § 49](https://www.cnil.fr/sites/cnil/files/atoms/files/lignes_directrices_de_la_cnil_sur_les_cookies_et_autres_traceurs.pdf). Être administrateur n’accorde aucune exemption générale. « Exemption défendable » suppose finalité exclusive, nécessité et durée justifiées ; « à justifier » ne signifie pas « illégal ».

**Base RGPD :** « IL proposée » désigne l’intérêt légitime pour l’administration/sécurité ou la continuité du service, si des données personnelles sont traitées. Cette proposition exige [nécessité et mise en balance](https://www.cnil.fr/fr/les-bases-legales/interet-legitime), sans remplacer un consentement terminal requis. La [fiche Vigie existante](../wiki/RGPD-Vigie.md) prépare cette analyse sans validation finale. Les [principes et bases légales RGPD](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2) restent applicables aux traitements serveur.

**Preuves :** [tests hérités](../audit-cookies-2026-10/preuves/tests-cibles.txt) et [contrôles hérités](../audit-cookies-2026-10/preuves/controles.json) proviennent de l’audit initial ; aucun test nouveau ici. Les tests cités comme seulement « existants » ne sont pas déclarés exécutés. Prestataires : [fournisseurs](fournisseurs.md). Le chiffrement confirmé reste une exigence technique, distincte de l’exemption.

## Administration

### A01 — Session équipe et transaction OIDC

**Service/exclusivité.** Connexion ou vérification d’identité demandée : `[__Host-]session` maintient l’accès ; `[__Host-]oidc-<state>` lie le retour au navigateur. Exemption d’authentification défendable, exclusivement pour cet accès. Une transaction serveur peut réduire le contenu du cookie ; redemander l’identité à chaque page n’offre pas un service équivalent.

**Données/durées.** Bearer aléatoire ; transaction signée contenant PKCE, nonce, state, destination et parfois identité. Cookie session : 8 h initiales, renouvellement admin ; serveur : 8 h d’inactivité/24 h absolues. Transaction : 600 s navigateur, sans expiration locale serveur normale ; trois simultanées, anciennes effacées à la quatrième. Logout/callback effacent les cookies concernés. Lignes session expirées : purge à la nouvelle connexion ou lecture, sans tâche autonome. Identité, ID token et contexte restent lisibles en base.

**Qualification/mesures.** IL proposée ; information d’équipe à compléter sur durées et conservation. Préserver connexion, CSRF, révocation, onglets ; borner transaction et purge. À valider : durée physique et contexte nécessaire.

**Preuves.** [auth.js](../../server/auth.js), 46–51, 157–212, 272–338, 402–481 ; [sessions.js](../../server/sessions.js), 3–60. Tests auth hérités ; contrôle tardif avec client factice, pas Zitadel réel.

### A02 — Transaction Instagram

**Service/exclusivité.** Clic « connecter Instagram » : `ig_state` protège l’association du compte. Exemption de sécurité du service demandé défendable ; aucune extension aux traceurs de Meta. Un état lié à la session serveur est une alternative à comparer, sans retirer la connexion.

**Données/durées.** State de 24 octets aléatoires, signé, chemin `/admin/instagram`, 600 s navigateur ; effacé au callback. Un seul cookie : nouvelle tentative remplace l’ancienne. Aucun horodatage serveur propre au state dans ce code.

**Qualification/mesures.** IL proposée pour sécuriser l’association ; finalité de publication et données Meta à examiner séparément. Informer lors de la connexion, conserver le refus sûr, protéger et borner l’état. À valider : durée effective, onglets, configuration prestataire.

**Preuves.** [admin.js](../../server/routes/admin.js), 772–794. Contrôle HTTP hérité des attributs ; [instagram.test.js](../../test/instagram.test.js) existant, non exécuté ici ; aucune connexion Meta réelle.

### A03 — Flash et notifications toast

**Service/exclusivité.** Retour après une action et possibilité de défaire : cookie `flash`, sessionStorage `toast`. La nécessité du feedback est établie fonctionnellement ; celle d’un stockage supplémentaire reste à justifier. Message lié à la session ou état de page peuvent préserver le retour, à comparer pour rechargement et annulation. Aucune réutilisation pour suivi.

**Données/durées.** Flash signé lisible : texte/détails, parfois nom ou destinataire ; 60 s, `/admin`, effacé au rendu, sans rattachement au compte. Toast : texte, erreur, action d’annulation, date ; lu/retiré à l’initialisation suivante, montré seulement avant 15 s ; sinon conservation jusqu’à lecture/fin d’onglet. Pas d’effacement au logout prévu.

**Qualification/mesures.** Exemption conditionnelle, IL proposée si contenu personnel. Expliquer messages transitoires ; conserver détails utiles et « Défaire », avec confidentialité, rattachement et effacement effectif. À valider : contenus minimaux et délai d’annulation.

**Preuves.** [admin.js](../../server/routes/admin.js), 267–286 ; [admin.js navigateur](../../public/admin/admin.js), 300–313. Lisibilité du flash reproduite ; changement de compte pour ce flash et refus de stockage non exécutés.

### A04 — Langue de l’administration

**Service/exclusivité.** Choix explicite FR/EN/DE ; `admin_langue` uniquement sans photographe lié, sinon préférence en base sur celui-ci. Personnalisation attendue : exemption défendable sans autre finalité. Préférence de compte protégée : alternative possible ; langue par défaut seule ne maintient pas la mémorisation demandée.

**Données/durées.** Code de langue, `/admin`, 365 jours après choix, persiste après logout ; nouvelle sélection remplace la valeur, effacement navigateur possible, sans commande dédiée. Préférence serveur : pas de TTL dédié repéré.

**Qualification/mesures.** Si rattachée à une personne, IL proposée ; sinon qualification personnelle à établir. Informer sur mémoire appareil/compte, conserver les trois langues, prévoir retour au défaut et périmètre clair. À valider : justification d’un an et partage d’appareil.

**Preuves.** [admin.js](../../server/routes/admin.js), 108–116, 1278–1285 ; tests langues-admin hérités. Aucun nouveau contrôle navigateur de ce repli précis.

### A05 — Thème de l’administration

**Service/exclusivité.** Choix clair/sombre/système ; `admin_theme`. Exemption de présentation attendue défendable si choix utilisateur exclusif. Préférence de compte : alternative ; thème système seul ne conserve pas un choix différent.

**Données/durées.** `light`/`dark`, `/admin`, 365 jours après choix ; supprimé au retour au système, conservé après logout. Aucun identifiant dans la valeur, mais envoi possible avec une session.

**Qualification/mesures.** IL proposée si préférence personnelle associée ; information recommandée sur le traceur, obligations RGPD si données personnelles. Maintenir les modes, rendre réinitialisation et portée explicites. À valider : durée d’un an et comportement entre comptes.

**Preuves.** [admin.js](../../server/routes/admin.js), 292–294, 1314–1319 ; tests apparence hérités et Chromium : préférence conservée après logout. Aucun test de conformité juridique déductible de ce succès.

### A06 — Densité de planche et aperçu de thème

**Service/exclusivité.** Curseur de vignettes : localStorage `planche-taille`. Aperçu explicitement demandé : cookie `apercu_theme`, utilisé seulement avec `site.apparence`. Exemptions de présentation à motiver séparément ; aucune autorisation conférée par le cookie. Préférence de compte/état de session : alternatives, en conservant mémorisation et aperçu privé.

**Données/durées.** Taille numérique sans TTL, commune aux comptes du navigateur. Identifiant de thème connu : `/`, 3 600 s, effacé par `?theme=off` ; peut subsister après sortie. Aucune purge propre de la densité.

**Qualification/mesures.** IL proposée si rattachement personnel. Informer sur portée, durée et remise à zéro ; garder curseur, aperçu et permissions. À valider : durée de densité et usage partagé. La robustesse au stockage refusé reste à vérifier.

**Preuves.** [admin.js navigateur](../../public/admin/admin.js), 1321–1338 ; [photos-v2.js](../../public/admin/v2/photos-v2.js), 41–54 ; [brand.js](../../server/routes/brand.js), 18–29. Tests apparence hérités ; densité/refus non rejoués ici.

### A07 — Copie de secours des Carnets

**Service/exclusivité.** Après échec d’enregistrement, localStorage `carnet-<id>-<lang>` permet une reprise proposée à la réouverture. Sauvegarde de saisie liée au service : exemption à documenter, notamment la persistance hors ligne expressément attendue. Mémoire ou serveur seuls ne sont pas équivalents après fermeture hors connexion.

**Données/durées.** Champs complets, date, billet/langue ; aucun TTL malgré la date, aucun compte dans la clé. Effacement après succès, soumission ou refus de reprise ; ni logout ni changement de compte. Données lisibles localement.

**Qualification/mesures.** IL proposée pour continuité ; contenu personnel variable. Expliquer le secours local et sa durée ; conserver la fonction avec confidentialité, isolation, échéance et effacement adaptés. À valider : durée nécessaire et déverrouillage/reprise entre appareils ou comptes ; aucune suppression décidée ici.

**Preuves.** [carnet.js](../../public/admin/carnet.js), 41–96. Chromium hérité : erreur 503 simulée, copie après logout, proposition au second compte autorisé. Aucun accès serveur sans droit démontré ; fermeture réellement hors ligne non testée.

## Vigie

### V01 — Session et transaction de la console

**Service/exclusivité.** Ouverture de la console : `__Host-vigie` et `__Host-vigie-tx`, distincts de l’admin. Exemption d’authentification défendable ; Access/MFA ne dispensent pas les autres usages d’analyse. Transaction serveur déjà présente ; supprimer la session ne maintiendrait pas la navigation authentifiée équivalente.

**Données/durées.** Bearer opaque ; state en cookie, PKCE/nonce côté serveur. Cookie session navigateur ; accès : 15 min inactives/1 h absolue, rafraîchissement automatique exclu. Lignes : 7 jours depuis création, purge horaire. Transaction : 600 s cookie/serveur, usage unique ; nettoyage physique à nouvelle transaction. Sortie/expiration observée effacent la session navigateur. Réauthentification sans rotation actuelle.

**Qualification/mesures.** IL sécurité proposée, mise en balance existante non validée. Informer opérateurs ; préserver droits, Access/MFA, réauthentification, purges et confidentialité. À valider : nécessité des contextes et conservation des transactions physiques.

**Preuves.** [server.js console](../../vigie/console/server.js), 176–211, 248–319, 350 ; [sessions.js console](../../vigie/console/sessions.js), 7–79. Tests console hérités avec fournisseurs simulés ; services réels hors couverture.

### V02 — Thème de la console

**Service/exclusivité.** Bascule explicite clair/sombre, localStorage `vigie-theme`, lu avant affichage. Exemption de présentation attendue défendable si exclusive ; aucun motif de sécurité ne suffit seul. Préférence de compte protégée : alternative ; système seul ne maintient pas forcément le choix.

**Données/durées.** `light`/`dark`, sans TTL ni effacement au logout ; effacement navigateur possible. Lecture/écriture refusée : repli déjà géré sur thème système/page. Indépendant des préférences admin.

**Qualification/mesures.** IL proposée si rattachement personnel ; transparence sur mémoire locale. Maintenir le choix, définir durée/réinitialisation et portée appareil. À valider : durée nécessaire et attentes sur poste partagé.

**Preuves.** [theme.js](../../vigie/console/public/theme.js), 5–11 ; [console.js](../../vigie/console/public/console.js), 16–25. Lecture statique ; aucun scénario navigateur dédié dans les preuves héritées.

### V03 — Journaux, tampons, décisions, exports et sauvegardes serveur

**Service/exclusivité.** Détecter/enquêter, reprendre après panne, maintenir protections, restaurer. Leur seule conservation serveur n’appelle pas une exemption article 82 ; qualifier séparément toute collecte sur terminal. Réduire les champs/accès est une alternative ; retirer tampon ou décisions pendant panne ne rend pas le même service.

**Données/durées.** Identités, IP/contexte, événements, motifs, références et copies. Journal : 183 jours depuis réception par défaut ; signaux : 30 jours depuis événement ; entités/liens : 30/90 jours depuis activité. Alertes closes : 395 jours depuis activité ; décisions : 395 jours depuis levée/échéance. Dossiers clos ordinaires : 183 jours depuis activité ; incidents/suivis : pas d’échéance globale, **D38 ouverte**. Tampon : 50 Mo, retrait après émission/éviction, sans TTL autonome. Cache signé : échéances fonctionnelles, anciennes listes pas automatiquement purgées physiquement. Sauvegardes : 14 instantanés par défaut, rotation au passage suivant, pas garantie de 14 jours. Téléchargements : aucune purge distante. Voir [matrice détaillée](../wiki/RGPD-Vigie.md#4-conservation--état-du-code-et-politique-à-terminer).

**Qualification/mesures.** IL proposée pour sécurité ; documentation légale d’une violation distincte. Finaliser mise en balance, information des personnes/opérateurs, durées et destinataires. Chiffrement confirmé, maintien des preuves/NC2 et restauration ; aucune extension d’usage. À valider : D38, copies externes, supports, contrats.

**Preuves.** [carte technique](../audit-cookies-2026-10/protections-et-caches.md), sections 3–5. Formats et durées lus statiquement ; aucun audit production, restauration réelle ou cycle complet de conservation exécuté ici.
