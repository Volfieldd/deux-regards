# RGPD : registre, accord, analyse d'impact, violation

Les documents à garder pour montrer que le site respecte le RGPD. Ils décrivent ce que le code fait réellement ; la page publique [`/confidentialite`](https://www.nicephos.art/confidentialite) en est la version pour les visiteurs. **À relire et dater ensemble une fois par an**, et à chaque nouvelle fonction qui touche des données personnelles.

Responsables conjoints : **Sébastien et Julien**, photographes de Nicephos. Contact : **info@nicephos.art** (réglable dans Réglages → Confidentialité).

> Ce ne sont pas des conseils juridiques : pour une exposition, une vente de tirages ou un litige, faites relire par un avocat. La CNIL publie des modèles et des guides (www.cnil.fr) qui ont servi de trame.

## 1. Registre des traitements (article 30)

| Traitement | Finalité | Personnes | Données | Base légale | Durée | Destinataires |
|---|---|---|---|---|---|---|
| **Photos de rue** | Création et diffusion artistiques (site, Instagram, expositions, tirages) | Personnes photographiées | Image (photo), date, ville | Liberté d'expression artistique (art. 85 RGPD, art. 80 loi Informatique et Libertés) ; consentement par usage pour la publication d'une personne reconnaissable | Tant que la photo est gardée ; supprimée des sauvegardes 90 jours après sa suppression | Nous deux ; visiteurs du site si publiée ; Meta si l'usage « Instagram » est accepté |
| **Rencontres** (`/bonjour`, cartes, app sur le téléphone) | Gérer l'accord ou le refus de publication, envoyer la photo, répondre | Personnes photographiées (dont mineurs avec un parent) | Référence de carte, nom, e-mail, choix, messages, signature, photo de la personne (visage), position arrondie à ~100 m, majorité, nom du parent | Consentement (art. 6.1.a), retirable à tout moment ; l'accord couvre les photos de la session (le photographe, ce jour-là) | Sans accord ni refus : 12 mois ; photo de la personne : avec l'accord (sans accord : 6 mois) ; accord ou refus : tant qu'une photo liée existe, puis 5 ans | Nous deux ; fournisseur de messagerie si e-mail envoyé |
| **Photo offerte** | Remettre sa photo à la personne | Personnes photographiées | Lien privé, compteurs de visites | Consentement (demande de la personne) | 30 jours, effacé un mois après | Nous deux |
| **Droits des personnes** | Répondre aux demandes d'accès, d'effacement, d'opposition | Personnes concernées | Demande, date, réponse | Obligation légale (art. 6.1.c) | Avec la rencontre | Nous deux |
| **Mesure d'audience** | Connaître la fréquentation | Visiteurs | Compteurs anonymes (pages, pays, provenance), sans IP ni identifiant | Intérêt légitime ; exemption de consentement CNIL (mesure d'audience anonyme) | 25 mois | Nous deux |
| **Cookie de langue** | Retenir la langue choisie | Visiteurs qui choisissent une langue | `langue=fr/en/de` | Demande de la personne (cookie fonctionnel) | 1 an | — |
| **Administration** | Sécurité, journal des actions | Nous deux | Comptes (Zitadel), journal (IP tronquée, actions) | Intérêt légitime (sécurité) | Journaux Docker bornés (3 × 10 Mo) | Zitadel (fournisseur d'identité) |
| **Instagram** | Publier des photos | Personnes photographiées (si usage accepté) | Photo, légende | Consentement (usage « Instagram ») | Selon Meta ; retrait manuel en cas de refus | Meta |

**Sous-traitants** : Cloudflare (acheminement HTTPS, conditions de traitement des données de Cloudflare, transferts encadrés : Data Privacy Framework, clauses contractuelles types) ; Zitadel (connexion à l'admin) ; fournisseur de messagerie si `SMTP_URL` est configuré (préférer un fournisseur européen avec un contrat de sous-traitance ; pas un Gmail personnel). Hébergement : notre serveur, en France.

**Sécurité** (art. 32) : voir [Sécurité](Sécurité) — authentification forte de l'admin, formulaires protégés (CSRF), politique de sécurité des contenus stricte, HTTPS, limites de débit, données personnelles des rencontres chiffrées dans la base (`DATA_KEY`), disques chiffrés (à mettre en place sur Unraid), sauvegardes quotidiennes sur un autre disque.

## 2. Accord entre responsables conjoints (article 26)

À imprimer, signer et garder par chacun.

> **Sébastien** et **Julien** décident ensemble des finalités et des moyens des traitements du site Nicephos décrits au registre ci-dessus. Ils conviennent que :
> 1. **Point de contact** des personnes : info@nicephos.art, relevé par les deux ; chacun peut répondre à toute demande.
> 2. **Information** des personnes : la page `/confidentialite`, tenue à jour par les deux à chaque évolution du site.
> 3. **Droits** (accès, rectification, effacement, opposition, retrait du consentement) : celui qui reçoit la demande la traite dans le mois, depuis l'admin (Rencontres → Droits de la personne), et en informe l'autre.
> 4. **Ses propres photos** : chacun est responsable des photos qu'il prend, de l'accord des personnes photographiées et du respect de leur refus.
> 5. **Sécurité** : chacun protège son compte (authentification à deux facteurs), ne partage ni la clé `DATA_KEY` ni les accès au serveur, et signale à l'autre tout incident sans délai.
> 6. **Violation de données** : la procédure du point 4 ci-dessous s'applique ; la notification à la CNIL est faite par celui qui découvre l'incident, avec l'accord de l'autre si possible dans le délai.
> 7. **L'essentiel de cet accord** est communiqué à toute personne qui le demande.
>
> Fait le ……………… à ………………  — Sébastien : ………………  — Julien : ………………

## 3. Analyse d'impact simplifiée

Une analyse d'impact complète (AIPD) n'est pas obligatoire ici : petit volume, pas de profilage, pas de surveillance systématique, pas de données sensibles au sens de l'article 9 (aucune reconnaissance faciale). Des mineurs pouvant apparaître, voici une analyse simplifiée.

| Risque pour les personnes | Gravité | Mesures en place | Risque résiduel |
|---|---|---|---|
| Publication d'une photo malgré un refus | Importante | Refus bloquant (fiche et actions groupées), « Appliquer le refus » (brouillon, file Instagram), refus gardé même après effacement des données | Faible (Instagram : retrait manuel) |
| Fuite des noms, e-mails, signatures (vol du serveur, d'une sauvegarde) | Importante | Chiffrement des données dans la base (`DATA_KEY` hors base), disques chiffrés, sauvegardes sur un autre disque, accès admin protégé | Faible une fois `DATA_KEY` et disques chiffrés en place |
| Accès non autorisé à l'admin | Importante | Zitadel (deux facteurs), sessions limitées, CSRF, journal des actions | Faible |
| Localisation d'une personne | Modérée | Position arrondie à ~100 m, jamais publiée, effacée avec la rencontre ; carte publique à la ville | Négligeable |
| Mineur photographié sans accord parental | Importante | Case « majeur », sinon signature et nom du parent exigés | Faible |
| Conservation excessive | Modérée | Durées automatiques (12 mois, 6 mois, 5 ans, 90 jours pour les sauvegardes) | Faible |
| Demande de droits ignorée | Modérée | Badge avec échéance d'un mois, export et effacement en un clic | Faible |

## 4. Procédure en cas de violation de données (articles 33 et 34)

**Exemples** : vol ou perte du serveur ou d'un disque de sauvegarde, accès frauduleux à l'admin, clé `DATA_KEY` divulguée, envoi d'une archive d'export à la mauvaise personne.

1. **Contenir** (immédiatement) : couper l'accès (arrêter la pile, changer les mots de passe et `COOKIE_SECRET`, révoquer les sessions dans Zitadel), garder les journaux.
2. **Évaluer** (dans la journée) : quelles données, combien de personnes, chiffrées ou non (`DATA_KEY` et disques chiffrés réduisent fortement le risque si la clé n'a pas fuité).
3. **Notifier la CNIL sous 72 heures** (www.cnil.fr, « Notifier une violation ») si la violation présente un risque pour les personnes ; sinon, la consigner seulement.
4. **Informer les personnes** sans tarder si le risque est élevé (par exemple noms et signatures en clair), par e-mail, en expliquant ce qui s'est passé et ce qu'elles peuvent faire.
5. **Consigner** chaque incident, même sans notification :

| Date | Découvert par | Nature | Données et personnes | Mesures | Notifié CNIL (date) | Personnes informées |
|---|---|---|---|---|---|---|
| | | | | | | |

## 5. Ce qui reste à faire de votre côté

- [ ] **`DATA_KEY`** dans le `.env` de la pile (`openssl rand -base64 32`), avec une copie dans un gestionnaire de mots de passe : perdue, les données chiffrées sont illisibles.
- [ ] **Disques chiffrés** pour les données et les sauvegardes (guide Unraid, « Chiffrer les données »), puis cocher la case dans Réglages → Confidentialité.
- [ ] **Authentification à deux facteurs** dans Zitadel pour les deux comptes, puis cocher la case.
- [ ] **Messagerie** : garder le bouton Mail, ou un fournisseur avec contrat de sous-traitance pour `SMTP_URL`.
- [ ] **Signer l'accord** du point 2 et le garder.
- [ ] **Relire ce document** chaque année (date de la dernière relecture : ………………).
