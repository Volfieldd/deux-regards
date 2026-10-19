# Procédures

Les marches à suivre, pas à pas, pour les opérations ponctuelles. Les gestes quotidiens dans l'admin sont dans l'[Aide de l'administration](Aide) ; l'installation complète sur Unraid dans le [Guide Unraid](Unraid).

**Sommaire**

1. [Déployer une mise à jour](#1-déployer-une-mise-à-jour)
2. [Activer le chiffrement des données personnelles (DATA_KEY)](#2-activer-le-chiffrement-des-données-personnelles-data_key)
3. [Chiffrer les disques sur Unraid](#3-chiffrer-les-disques-sur-unraid)
4. [Activer l'authentification à deux facteurs](#4-activer-lauthentification-à-deux-facteurs)
5. [Configurer l'envoi automatique d'e-mails](#5-configurer-lenvoi-automatique-de-mails)
6. [Installer l'app Rencontre sur l'iPhone](#6-installer-lapp-rencontre-sur-liphone)
7. [Imprimer les cartes d'accord et le QR des vêtements](#7-imprimer-les-cartes-daccord-et-le-qr-des-vêtements)
8. [Répondre à une demande sur des données personnelles](#8-répondre-à-une-demande-sur-des-données-personnelles)
9. [Réagir à une violation de données](#9-réagir-à-une-violation-de-données)
10. [Restaurer une sauvegarde](#10-restaurer-une-sauvegarde)
11. [Publier le wiki](#11-publier-le-wiki)

## 1. Déployer une mise à jour

Chaque fusion dans `main` publie une image privée `ghcr.io/volfieldd/deux-regards` (étiquettes `latest` et `sha-xxxxxxx`). Unraid doit être connecté au registre ([Guide Unraid](Unraid#1-image-docker)) : un `denied` au téléchargement veut dire connexion perdue ou jeton expiré.

1. **Sauvegarde fraîche** : vérifiez la date de `last.json` dans le dossier des sauvegardes (ou attendez la sauvegarde du jour).
2. **Si le fichier de la pile a changé** (nouveau conteneur, comme LibreTranslate) : dans *Compose Manager*, remplacez le contenu de la pile par le nouveau [`deploy/unraid/compose.yaml`](https://github.com/Volfieldd/deux-regards/blob/main/deploy/unraid/compose.yaml). Le `.env` ne change pas, sauf mention contraire dans la PR.
3. **Compose Pull**, puis **Compose Up**. Les migrations de la base s'appliquent au démarrage.
4. **Vérifiez** : le site répond, l'admin s'ouvre, le bandeau « Mise à jour des images » se termine.
5. **Revenir en arrière** : `IMAGE=ghcr.io/volfieldd/deux-regards:sha-xxxxxxx` dans le `.env`, puis Compose Up. Une migration déjà appliquée n'est pas défaite : restaurez alors aussi la base (procédure 10).

> L'avertissement Docker « Your kernel does not support swap limit capabilities » est sans conséquence sur Unraid (pas de swap) : la limite de mémoire s'applique bien.

## 2. Activer le chiffrement des données personnelles (DATA_KEY)

Chiffre dans la base les noms, e-mails, signatures, photos de repère et de carte, messages et positions des rencontres (AES-256-GCM). Une sauvegarde volée ne révèle alors rien.

1. **Générez la clé, une seule fois** (terminal Unraid ou n'importe quel ordinateur) :

   ```bash
   openssl rand -base64 32
   ```

2. **Rangez-la immédiatement** dans un gestionnaire de mots de passe partagé par vous deux (et sur papier dans un endroit sûr, si vous voulez). **Clé perdue = données chiffrées perdues**, sauvegardes comprises.
3. Ajoutez au `.env` de la pile la ligne `DATA_KEY=<la clé>`.
4. **Compose Up**. Au démarrage, les données déjà enregistrées sont chiffrées (une seule fois) ; le journal indique « rencontres : données en clair chiffrées ».
5. **Vérifiez** : Admin → **Droits & confidentialité** affiche « Chiffrement des données personnelles dans la base : **actif** ». Ouvrez une rencontre : tout se lit normalement.

**À ne pas faire** : changer ou retirer la clé. Sans la bonne clé, les données chiffrées s'affichent « donnée chiffrée : clé DATA_KEY absente ou différente », aucune carte d'accord n'est reconnue et l'impression de cartes échoue (la clé de leurs codes est elle aussi scellée) ; rien n'est détruit : remettre la bonne clé suffit. Pour changer de clé, demandez une procédure de rechiffrement (non prévue aujourd'hui).

## 3. Chiffrer les disques sur Unraid

Protège contre le vol du serveur ou un disque revendu (chiffrement LUKS d'Unraid).

1. **Pool chiffré pour les données** : *Main → Add Pool* (ou un pool existant vidé), système de fichiers **« xfs - encrypted »** ou **« btrfs - encrypted »**, puis formatez. Unraid demande une phrase de passe (ou un fichier clé).
2. **Pile arrêtée**, copiez les données : `rsync -a "$NICEPHOS/" /mnt/<pool-chiffré>/nicephos/` (`$NICEPHOS` : votre `NICEPHOS_DIR`, [guide Unraid](Unraid), étape 2 ; `rsync -a` garde les propriétaires, `99:100` et `1000:1000` pour Signal).
3. Changez `NICEPHOS_DIR` dans le `.env` de la pile (Unraid ; `DATA_DIR` ailleurs), puis Compose Up. Vérifiez le site, puis effacez l'ancienne copie.
4. **Sauvegardes** : sur des disques du tableau chiffrés eux aussi (même format, disque par disque), ou une copie hors de la machine déjà chiffrée.
5. **Phrase de passe ou fichier clé ?** Une phrase tapée au démarrage protège mieux (un disque volé ne révèle rien), mais après une coupure de courant le site attend que vous déverrouilliez le tableau. Un fichier clé sur la clé USB d'Unraid démarre seul, mais voyage avec le serveur.
6. Cochez **Droits & confidentialité → « Les données et les sauvegardes sont sur des disques chiffrés »**.

## 4. Activer l'authentification à deux facteurs

1. Console Zitadel → votre organisation → **Settings → Login Behavior and Access** : exigez un second facteur (**Multifactor** : application d'authentification, clé de sécurité ou passkey).
2. Chacun de vous deux se connecte et enregistre son second facteur (application TOTP ou passkey de l'iPhone).
3. Vérifiez qu'une connexion à l'admin demande bien le second facteur.
4. Cochez **Droits & confidentialité → « L'authentification à deux facteurs est activée »**.

Détails Zitadel : [Connexion et comptes](Connexion-et-comptes).

## 5. Configurer l'envoi automatique d'e-mails

Sans configuration, l'app Rencontre propose un bouton qui ouvre Mail sur l'iPhone (rien à faire). Pour que le récapitulatif parte tout seul :

1. **Choisissez la boîte d'envoi** : de préférence un fournisseur européen qui signe un contrat de sous-traitance (RGPD). Un Gmail personnel fonctionne techniquement, mais Google n'offre pas ce contrat pour cet usage.
2. **Créez un mot de passe d'application** (Gmail : Compte Google → Sécurité → Validation en deux étapes → Mots de passe des applications ; autres fournisseurs : « mot de passe d'application » ou identifiants SMTP).
3. Ajoutez au `.env` de la pile, en remplaçant `@` par `%40` dans l'identifiant :

   ```
   SMTP_URL=smtps://adresse%40exemple.fr:motdepasse@smtp.exemple.fr:465
   MAIL_FROM=Nicephos <adresse@exemple.fr>
   ```

4. **Compose Up**, puis enregistrez une rencontre de test avec votre propre adresse : l'écran « Merci » doit afficher « Récapitulatif envoyé ». En cas d'échec, l'écran propose de renvoyer ou d'utiliser Mail, et la cause (identifiants refusés, serveur injoignable) est dans les journaux.

## 6. Installer l'app Rencontre sur l'iPhone

1. Dans **Safari**, ouvrez `https://www.nicephos.art/admin/rencontre` et connectez-vous.
2. Touchez **Partager** puis **Sur l'écran d'accueil** ; validez le nom « Rencontre ».
3. L'icône ouvre l'**accueil Terrain** en plein écran (nouvelle rencontre, mon QR, ma sortie du jour). Au premier usage, autorisez la **position** (« Lors de l'utilisation de l'app ») et l'**appareil photo**.
4. La connexion dure au plus 24 heures : reconnectez-vous en début de sortie.

Utilisation : [Aide → Rencontres](Aide-Rencontres).

## 7. Imprimer les cartes d'accord et le QR des vêtements

- **Cartes** : Admin → **Sur le terrain → Cartes d'accord → Préparer une planche** : photographe, numérotées (QR et code uniques) ou génériques (pour un imprimeur, numéro au tampon), nombre de paires. Imprimez à **100 %** (taille réelle) sur papier épais (250 à 350 g/m²) et découpez.
- **Vêtements** : Admin → **Sur le terrain → QR des vêtements** (photographe choisi en haut) : la composition du dos avec le logo, encre noire ou blanche, SVG pour l'imprimeur. QR de 8 à 10 cm au moins sur un dos.
- **Testez** un QR imprimé avec un téléphone avant de lancer une série.

Détails : [Aide → Rencontres](Aide-Rencontres).

## 8. Répondre à une demande sur des données personnelles

Délai légal : **un mois** à compter de la demande.

1. **Repérez la demande** : badge rouge « Demande d'accès / d'effacement · avant le … » dans **Personnes** (demandes faites sur `/bonjour`). Une demande reçue par e-mail : retrouvez la rencontre (référence, date, lieu) ou créez-la.
2. **Vérifiez l'identité** si la référence n'est pas « vérifiée » : même adresse e-mail que celle déjà connue, ou réponse à votre message. Dans le doute, demandez la référence de sa carte.
3. **Accès** : fiche → **Droits de la personne → Exporter ses données (.zip)**, puis envoyez l'archive en pièce jointe, depuis votre messagerie.
4. **Effacement** : fiche → **Effacer les données de cette personne** ; cochez **Supprimer aussi les photos** si elle le demande. Si un refus doit rester appliqué, une trace anonyme est gardée automatiquement. Supprimez dans l'application Instagram les posts que le message de confirmation liste.
5. **Rectification ou opposition** : corrigez la fiche, ou enregistrez son refus (elle peut aussi le faire sur `/bonjour`).
6. **Répondez-lui**, puis **Marquer la demande comme traitée**.

## 9. Réagir à une violation de données

Exemples : vol du serveur ou d'un disque, accès frauduleux à l'admin, `DATA_KEY` divulguée, archive envoyée à la mauvaise personne.

1. **Contenir** : arrêtez la pile si besoin, changez les mots de passe et `COOKIE_SECRET`, révoquez les sessions (Zitadel, et `DELETE FROM sessions`), gardez les journaux. Si le serveur lui-même est touché, régénérez aussi le **jeton du tunnel** (Cloudflare Zero Trust → Networks → Tunnels → votre tunnel) et mettez le nouveau dans `TUNNEL_TOKEN` : sinon un connecteur copié ailleurs continuerait de recevoir une partie des visites.
2. **Évaluer** : quelles données, combien de personnes, chiffrées ou non.
3. **CNIL sous 72 heures** (www.cnil.fr → « Notifier une violation de données personnelles ») si les personnes sont exposées à un risque.
4. **Informer les personnes** si le risque est élevé.
5. **Consigner** l'incident dans le registre de la page [RGPD](RGPD), même sans notification.

## 10. Restaurer une sauvegarde

Une restauration remet **tout le site** à l'heure de l'instantané : ce qui a été fait depuis, par vous ou par d'autres (photos, rencontres, demandes reçues, effacements, rôles), est défait. Pour une seule photo supprimée par erreur, voyez plutôt la fin de cette section.

1. **Compose Down** (pile arrêtée).
2. Lancez le script de restauration avec le nom de l'instantané (dossier `db/` des sauvegardes) ; commande complète dans le [Guide Unraid](Unraid#sauvegardes) (`docker run … node server/db/restore.js site-AAAA-MM-JJTHHMMSS.db`), ou [Déploiement](Déploiement#restaurer) pour la pile générique. Il refuse si le site tourne, garde la base actuelle (`data/site-avant-restauration-<date>.db`), ferme toutes les sessions et ne recopie que les originaux que cite l'instantané : un original effacé depuis ne revient pas.
3. **Compose Up** : les images servies se recalculent. Avec `DATA_KEY`, gardez la **même clé** que celle de la sauvegarde.
4. **Refaites ce que l'instantané a défait** : le script liste les actions faites après lui, d'après le journal de la base gardée. En priorité celles marquées « ! » : effacement des données d'une personne (refaites-le, c'est une obligation), suppression de photos, rôles retirés ou comptes désactivés (**Comptes et rôles**). Les rencontres saisies et les demandes reçues depuis l'instantané ne sont plus dans le site, seulement dans la base gardée : ne l'effacez pas avant de les avoir reprises.
5. **Consignez** la restauration et les effacements refaits dans le registre de la page [RGPD](RGPD), puis effacez `site-avant-restauration-…` une fois tout vérifié.

La base est sauvegardée chaque jour, 14 instantanés conservés ; les originaux supprimés restent 90 jours dans `supprimes/` (puis en sont effacés).

**Une seule photo supprimée par erreur** : inutile de tout restaurer. Son original est dans `supprimes/originals/` du dossier des sauvegardes pendant 90 jours (`.absents.json` donne la date de suppression de chaque fichier, pour le retrouver). Rendez-le au photographe, qui le réimporte : titre, légendes, mots-clés et série sont à ressaisir, et la preuve d'antériorité est refaite à la date du nouvel import (une preuve téléchargée avant la suppression reste valable pour ce même fichier).

## 11. Publier le wiki

Après une modification de `docs/wiki/`, `docs/aide/` ou `deploy/unraid/README.md` :

```bash
docs/wiki/publish.sh
```

Le script publie ces pages, génère les pages « Aide » et la page [Guide Unraid](Unraid) depuis leurs sources. Voir le [README](https://github.com/Volfieldd/deux-regards/blob/main/docs/wiki/README.md) du dossier.
