# Preuves d'antériorité

Pour chaque photo importée, le site constitue seul une preuve que **vous déteniez ce fichier à une date donnée**, vérifiable sans le site.

## Comment c'est fait

1. **Empreinte :** à l'import, le site calcule l'**empreinte SHA-256** de l'original, une sorte d'« ADN » du fichier. Un seul pixel changé donne une autre empreinte.
2. **Horodatage :** cette empreinte seule, jamais la photo, est envoyée à une **autorité d'horodatage**, qui renvoie un **jeton signé** attestant la date.
3. **Contrôle :** le site vérifie le jeton (signature, autorité, date), puis le conserve.

En cas d'échec (réseau, service indisponible), le site réessaie seul : quelques minutes plus tard, puis toutes les heures.

## Sur la fiche d'une photo

| Élément | Signification |
|---|---|
| Empreinte SHA-256 | l'« ADN » de l'original |
| **Horodatée le … UTC** | la date garantie (heure universelle : +1 h en hiver, +2 h en été pour Paris) |
| Autorité, n° | qui a signé le jeton, et son numéro |
| En attente | demande pas encore aboutie : bouton **Réessayer maintenant** |

Boutons :

- **Original** : le fichier exact dont l'empreinte a été horodatée.
- **Jeton (.tsr)** : le jeton signé.
- **Fiche de preuve** : un résumé lisible, avec les commandes de vérification.
- **Certificat de l'autorité** : pour vérifier la signature.
- **Vérifier la preuve** : refait tous les contrôles.
  - « **Preuve valide** » : l'original est intact, et la signature est vérifiée jusqu'à l'autorité.
  - « **Preuve non valide : l'original a été modifié** » : le fichier sur le serveur n'est plus celui horodaté. Restaurez-le depuis une sauvegarde.
  - « **Signature valide… mais autorité non vérifiée** » : le serveur n'a pas le certificat racine de l'autorité. Prévenez la personne qui l'administre.

## En cas de litige

Téléchargez les quatre fichiers et gardez-les ensemble, hors du site. N'importe qui peut alors vérifier la preuve avec OpenSSL ; les commandes sont dans la fiche de preuve. Joignez vos **RAW** et les vues voisines de la même séance : la preuve du site établit la **date**, le RAW établit l'**auteur**.

**Avant de supprimer une photo**, téléchargez sa preuve : elle est supprimée avec la photo.
