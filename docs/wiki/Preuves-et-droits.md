# Preuves d'antériorité et droits

Le site constitue tout seul, pour chaque photo importée, une **preuve d'antériorité** vérifiable sans lui. Il peut aussi **signer les images** servies avec des mentions de droits, qui renvoient vers une page publique de conditions d'utilisation.

La spécification complète est dans [`docs/specs/preuves-et-droits.md`](https://github.com/Volfieldd/deux-regards/blob/main/docs/specs/preuves-et-droits.md).

---

## Ce que fait le site, sans rien demander

À chaque import :

1. Le site calcule l'**empreinte SHA-256** de l'original : une sorte d'« ADN » du fichier. Si un seul pixel change, l'empreinte change.
2. Il envoie **cette empreinte seulement**, jamais la photo, à une **autorité d'horodatage** (FreeTSA par défaut).
3. L'autorité renvoie un **jeton signé** qui atteste : « cette empreinte existait le 10/10/2026 à 11:10:55 UTC ».
4. Le site contrôle le jeton, puis le conserve.

Si l'autorité ne répond pas, le site réessaie tout seul (dans quelques minutes, puis toutes les heures).

## Consulter la preuve d'une photo

**Photos → ouvrir une photo → section « Preuve d'antériorité »**

| Élément | Signification |
|---|---|
| Empreinte SHA-256 | l'« ADN » de l'original importé |
| Horodatée le … UTC | la date garantie par l'autorité (heure universelle : ajouter 1 h en hiver, 2 h en été pour l'heure de Paris) |
| Autorité, n° | qui a signé le jeton, et le numéro unique de ce jeton |

**Vérifier la preuve** refait tous les contrôles :

- l'original sur le serveur est intact ;
- le jeton porte sur lui ;
- la signature de l'autorité est valide.

## Constituer un dossier en cas de litige

Sur la fiche de la photo concernée, téléchargez les quatre fichiers et **gardez-les ensemble**, hors du site :

| Bouton | Fichier | Rôle |
|---|---|---|
| Original | `ma-photo.jpg` | le fichier dont l'empreinte a été horodatée |
| Jeton (.tsr) | `ma-photo.tsr` | le jeton signé par l'autorité |
| Fiche de preuve | `ma-photo-preuve.txt` | résumé lisible et commandes de vérification |
| Certificat de l'autorité | `autorite-horodatage.pem` | pour vérifier la signature |

N'importe qui (avocat, expert, adversaire) peut alors vérifier la preuve **sans le site**, avec OpenSSL :

```bash
sha256sum ma-photo.jpg
openssl ts -reply -in ma-photo.tsr -text
openssl ts -verify -in ma-photo.tsr -data ma-photo.jpg -CAfile autorite-horodatage.pem
# Verification: OK
```

Joignez à ce dossier ce qui prouve que vous êtes l'auteur : le **RAW** d'origine, les vues voisines de la même séance, la carte mémoire. La preuve du site établit la **date** ; le RAW établit l'**auteur**.

> **Avant de supprimer une photo**, téléchargez sa preuve si elle peut encore servir : elle est supprimée avec la photo.

## Ce que la preuve vaut

- **Elle prouve** que le fichier existait au plus tard à la date certifiée, ce qui suffit souvent face à quelqu'un qui a repris la photo plus tard.
- **Elle ne prouve pas** à elle seule qui a pris la photo : d'où l'intérêt de garder les RAW.
- **FreeTSA** est une autorité RFC 3161 reconnue, mais pas « qualifiée » au sens du règlement européen eIDAS. Pour que la date bénéficie d'une **présomption d'exactitude**, configurez une autorité qualifiée (souvent payante), voir [Configuration](Configuration#preuves-dantériorité).
- **Dépôt formel :** pour une sélection de photos, l'**enveloppe e-Soleau** de l'INPI (en ligne, peu coûteuse) ou un constat de commissaire de justice restent possibles, hors du site.

## Signer les images (mentions IPTC)

**Filigrane & EXIF → Métadonnées** : choisissez **Droits d'auteur** (ou « Prise de vue »).

Les images du site contiennent alors, en plus de l'EXIF :

- le **créateur** (nom de l'auteur) et le **copyright** (« © 2024 Sébastien ») ;
- le **crédit** (nom du site) ;
- un **lien vers la page « Droits d'utilisation »**.

Ces champs sont lus par Google Images, qui affiche alors un badge « Licence » avec le lien, et par Lightroom, Bridge ou digiKam. Les accents y sont conservés.

## Page « Droits d'utilisation »

**Réglages → Droits d'utilisation**

- **Texte :** vide, le texte par défaut s'affiche (droit d'auteur, auteurs nommés, reproduction interdite sans autorisation écrite, articles du Code de la propriété intellectuelle). Sinon, écrivez le vôtre, en séparant les paragraphes par une ligne vide.
- **Contact :** une adresse e-mail ou un lien `https://`, affiché comme lien.

La page est publique (`/droits`) et liée en pied de page de tout le site. Elle existe aussi en anglais (`/droits/en`) et en allemand (`/droits/de`), avec un sélecteur de langue et des liens `hreflang` ; textes dans `server/rights.js`, réglables (`rights_text_en`, `rights_text_de`). Les métadonnées IPTC pointent toujours vers `/droits`.

## Questions fréquentes

**« En attente : service injoignable ».**
Le serveur n'arrive pas à joindre l'autorité. Le site réessaie seul ; **Réessayer maintenant** force un essai. Vérifiez l'accès sortant du serveur vers `TSA_URL`.

**« Preuve non valide : l'original a été modifié ».**
Le fichier sur le disque n'est plus celui qui a été horodaté (restauration ratée, manipulation manuelle). Restaurez l'original depuis une sauvegarde.

**Les photos importées avant cette fonction ont-elles une preuve ?**
Oui. Leur empreinte est calculée au démarrage du serveur, puis horodatée à la date de ce calcul (pas à celle de leur import).
