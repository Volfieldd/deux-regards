# Spécification : preuve d'antériorité et mentions de droits

| | |
|---|---|
| Statut | Implémenté (branche `feat/preuves-iptc`) |
| Écrans | fiche photo (section « Preuve d'antériorité »), tableau de bord, Réglages → Droits d'utilisation, page publique `/droits` |
| Code | `server/timestamp.js`, `server/proofs.js`, `server/images.js` (`rightsXmp`), `server/routes/admin.js`, `server/routes/public.js` |
| Tests | `test/proofs.test.js`, `test/watermark.test.js`, `e2e/tests/admin.spec.js`, `e2e/tests/public.spec.js` |

## 1. Objectif

1. **Prouver qu'un auteur détenait une photo à une date donnée**, en cas de reprise sans autorisation. Pour cela, l'empreinte de chaque original est horodatée par une autorité tierce. La preuve se vérifie sans le site.
2. **Signer les fichiers servis** avec des mentions de droits standard (IPTC, en XMP), qui pointent vers une page publique de conditions d'utilisation.

Le droit d'auteur naît de la création, sans dépôt. Ces mesures ne créent pas de droit : elles **facilitent la preuve**.

## 2. Preuve d'antériorité

### 2.1 Exigences

| Id | Exigence |
|---|---|
| P1 | À l'import, l'empreinte **SHA-256 de l'original tel que reçu** est calculée et conservée (`photos.sha256`). Les photos plus anciennes reçoivent la leur au démarrage. |
| P2 | Chaque empreinte est envoyée à une **autorité d'horodatage RFC 3161** (TSA). Le jeton signé qu'elle renvoie est conservé en entier (`timestamps.token`). **Seule l'empreinte quitte le serveur**, jamais l'image. |
| P3 | Autorité par défaut : FreeTSA (gratuite, sans compte). On peut la remplacer par n'importe quelle TSA RFC 3161, par exemple une autorité qualifiée eIDAS, via `TSA_URL` et `TSA_CA_FILE`. `TSA_URL=off` désactive l'horodatage (les empreintes restent calculées). |
| P4 | Chaque jeton reçu est contrôlé avant d'être conservé : statut accordé, empreinte et nonce identiques à la demande, signature valide, certificat valide à la date du jeton, chaîne jusqu'au certificat racine attendu (si `TSA_CA_FILE`). |
| P5 | En cas d'échec (réseau, TSA indisponible, jeton refusé), l'erreur est notée et la demande **reprise automatiquement** : après 2, 4, 8… minutes, au plus une fois par jour, avec un passage toutes les heures. L'admin peut relancer tout de suite. L'import n'est jamais bloqué. |
| P6 | La fiche photo affiche l'empreinte, la date certifiée (UTC), l'autorité et le numéro de série. Elle propose le téléchargement de l'**original**, du **jeton** (`.tsr`), d'une **fiche de preuve** (`.txt`, avec les commandes de vérification) et du **certificat de l'autorité**. |
| P7 | Le bouton **Vérifier la preuve** refait tous les contrôles, y compris que l'original sur le disque a toujours la même empreinte. |
| P8 | Le tableau de bord indique combien de photos sont horodatées, et combien attendent après une erreur. |
| P9 | Supprimer une photo supprime sa preuve. L'admin invite à la télécharger avant. |

### 2.2 Vérification indépendante

La preuve tient sans le site. Avec l'original, le jeton et le certificat de l'autorité :

```bash
sha256sum photo.jpg                                    # = empreinte de la fiche
openssl ts -reply -in photo.tsr -text                  # date, autorité, empreinte
openssl ts -verify -in photo.tsr -data photo.jpg -CAfile autorite-horodatage.pem
# → Verification: OK
```

### 2.3 Conception

- `server/timestamp.js` : encodage de la requête `TimeStampReq` (version 1, SHA-256, nonce de 64 bits, certificat demandé), analyse de `TimeStampResp`, puis vérification CMS :
  - l'attribut `messageDigest` égale l'empreinte du `TSTInfo` ;
  - la signature des attributs signés est vérifiée avec le certificat du jeton ;
  - la date du jeton tombe dans la période de validité du certificat ;
  - le certificat est bien émis par la racine attendue.

  Le module n'a aucune dépendance : seul le sous-ensemble DER nécessaire est implémenté.
- `server/proofs.js` : file unique comme pour les variantes ; passage au démarrage, après chaque import, puis toutes les heures.
- Migration `004_proofs.sql` : colonne `photos.sha256` ; table `timestamps` (`photo_id`, `sha256`, `tsa`, `status`, `token`, `gen_time`, `serial`, `signer`, `error`, `attempts`, `updated_at`), supprimée en cascade avec la photo.
- L'empreinte horodatée est conservée avec le jeton. Si l'original changeait (ce que le site ne fait jamais), la preuve serait signalée « non valide » au lieu d'être réémise en silence.

### 2.4 Routes (admin, session et CSRF)

| Route | Rôle |
|---|---|
| `GET /admin/photos/:id/original` | original, en pièce jointe |
| `GET /admin/photos/:id/preuve.tsr` | jeton RFC 3161 (`application/timestamp-reply`) |
| `GET /admin/photos/:id/preuve.txt` | fiche de preuve |
| `GET /admin/preuves/autorite.pem` | certificat racine de l'autorité configurée |
| `POST /admin/photos/:id/verifier` | vérification complète |
| `POST /admin/preuves/reessayer` | relance immédiate des demandes en attente |

### 2.5 Portée et limites

- **Ce que la preuve établit :** le fichier ayant cette empreinte existait au plus tard à la date certifiée. Elle porte sur le fichier **importé** (souvent un export JPEG), pas sur le RAW. Conserver les RAW reste la meilleure preuve d'auteur ; horodater aussi ses RAW se fait hors du site.
- **Valeur juridique :** un horodatage RFC 3161 est un élément de preuve recevable. Un horodatage **qualifié eIDAS** bénéficie en plus d'une présomption d'exactitude de la date (règlement UE 910/2014, art. 41). FreeTSA n'est pas qualifiée ; pour cette présomption, configurer une TSA qualifiée (en général payante).
- **Pour un dépôt formel** d'une sélection de photos : enveloppe e-Soleau (INPI) ou constat de commissaire de justice, hors du site.

## 3. Mentions de droits (IPTC)

### 3.1 Exigences

| Id | Exigence |
|---|---|
| D1 | Dans les modes EXIF « Droits d'auteur », « Prise de vue » et « Tout », les images servies portent aussi des **mentions IPTC en XMP** : créateur, copyright, crédit (nom du site), `WebStatement` et `LicensorURL` vers `/droits`, et la marque « protégé ». En mode « Aucune métadonnée », rien n'est écrit. |
| D2 | Le XMP conserve les accents (UTF-8), contrairement aux champs EXIF ASCII. Les valeurs sont échappées. |
| D3 | La page publique **`/droits`** présente les conditions d'utilisation : texte réglable (par défaut : droit d'auteur, auteurs nommés, reproduction interdite sans autorisation écrite, articles L.122-4 et L.335-2 du CPI) et contact (adresse e-mail ou lien `https://`). Elle est liée depuis le pied de page. |
| D4 | Ces champs sont ceux que lisent Google Images (badge « Licence ») et les logiciels photo (Lightroom, Bridge, digiKam). |

### 3.2 Champs écrits

| Champ XMP | Valeur |
|---|---|
| `dc:creator` | nom de l'auteur |
| `dc:rights` | `© année auteur` |
| `photoshop:Credit` | nom du site |
| `xmpRights:Marked` | `True` |
| `xmpRights:WebStatement` | `PUBLIC_URL/droits` |
| `plus:Licensor/plus:LicensorURL` | `PUBLIC_URL/droits` |

La version du rendu (`PIPELINE`) passe à 2 : les images déjà signées sont recalculées une fois pour recevoir le XMP.

## 4. Critères d'acceptation (testés)

- Requête conforme : relue par `openssl ts -query`, et la structure est testée.
- Un jeton FreeTSA réel est analysé et vérifié jusqu'à la racine ; un jeton altéré ou une autre racine sont refusés.
- Une réponse portant sur une autre empreinte, ou avec un autre nonce, est refusée.
- Au démarrage, les empreintes manquantes sont calculées, puis horodatées. Après une erreur, la reprise est espacée, et la relance manuelle fonctionne.
- La fiche affiche la preuve, et les téléchargements contiennent exactement l'original et le jeton. La vérification réussit, puis échoue si l'original est modifié.
- À l'import, l'empreinte est celle du fichier reçu. À la suppression, la preuve disparaît.
- Le XMP contient les six champs, avec accents et échappement ; il est absent en mode « Aucune ».
- `/droits` : texte par défaut avec les noms des auteurs, texte et contact personnalisés, aucun lien `javascript:`.
- Contrôle manuel du 10/10/2026 sur le serveur de test : preuve téléchargée depuis l'admin, `openssl ts -verify` → `Verification: OK`.
