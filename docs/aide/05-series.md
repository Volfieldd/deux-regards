# Séries

Les séries regroupent les photos (Rue, Portrait…). Elles forment l'index du site et servent de filtre. Chaque série est une **planche** : ses trois premières photos, son nom et son nombre de photos.

- **Créer :** **＋ Nouvelle série** en haut de la page place le curseur dans la carte de création. Tapez le nom, puis **Entrée** (ou **Créer**) ; **Échap** efface la saisie. La nouvelle série prend la **première place**, avec une adresse déduite du nom.
- **Voir ses photos :** **Photos ›** ouvre la liste des photos filtrée sur cette série.
- **Renommer :** **Renommer** ouvre le nom dans la carte, puis **Enregistrer**. Sous le nom, « Nom en anglais et en allemand » : la version affichée sur les pages anglaises et allemandes du site (facultative ; vide : le nom français). L'adresse (`/serie/<adresse>`) est rangée sous « Adresse de la série (avancé) » : la changer casse les liens déjà partagés.
- **Ordonner :** c'est l'ordre de l'index des séries sur le site.
  - à la souris : saisissez la poignée **⠿ Déplacer** et glissez la carte à sa nouvelle place ;
  - au clavier : Tab jusqu'à la poignée, puis **↑ / ←** (avancer d'une place) ou **↓ / →** (reculer d'une place) ;
  - partout, y compris sur téléphone : menu **⋯**, **Monter d'une place** ou **Descendre d'une place**.

  L'ordre est enregistré aussitôt, et un message indique la nouvelle place.
- **Supprimer :** menu **⋯**, **Supprimer…**. Une fenêtre s'ouvre.
  - Série vide : confirmez.
  - Série avec des photos : **elles ne sont jamais supprimées**. Choisissez la série où les déplacer, puis **Déplacer les *n* photos et supprimer**. Cela change la série de toutes ses photos : c’est réservé à un compte qui peut modifier toutes les photos (administrateur) ; le modérateur ne supprime qu’une série vide.

Pour classer des photos dans une série, le plus rapide est la [sélection multiple](photos#agir-sur-plusieurs-photos) de la page Photos. Sur le site, une série sans photo publiée est grisée et n'est pas cliquable.

## Série proposée

En bas de la page Séries, **Proposer une série** aide à ranger les photos qui arrivent. C'est **désactivé par défaut**.

- **Allumer :** **Allumer les propositions**. Le modèle d'analyse (environ 90 Mo, un modèle libre appelé CLIP) se télécharge une seule fois dans le dossier des données. Les photos existantes sont ensuite analysées en tâche de fond, avec une barre de progression ; chaque photo importée l'est ensuite tout de suite.
- **Ce qu'il propose :** à l'import, chaque photo reçoit la série choisie dans le formulaire. Tant que vous ne l'avez pas choisie vous-même, le serveur compare la photo aux photos déjà rangées (les vôtres et celles de l'autre photographe : la ressemblance se calcule par série). Si une **autre** série lui ressemble nettement plus, il la propose, et en propose deux quand elles sont presque aussi proches. Une série n'est proposée qu'à partir de **3 photos** rangées. Une photo publiée n'a jamais de proposition.
- **Où la voir :** une étoile **✦** et un contour en pointillés la distinguent, sans dépendre de la couleur.
  - sur la vignette de la [planche contact](photos#la-planche-contact), et avec le filtre **✦ Série proposée** ;
  - dans l'[inspecteur](photos#linspecteur) : **Classer dans « … »** l'applique tout de suite, **Garder « … »** confirme la série actuelle ;
  - sur la [fiche de la photo](photos#la-fiche-dune-photo) : **Choisir** remplit le champ Série, et **Enregistrer** valide ; les petites vignettes montrent les photos de la série qui lui ressemblent le plus ;
  - sur la page d'une [sortie](rencontres#les-sorties), sous chaque photo ;
  - dans **Aujourd'hui**, une ligne « *n* photos avec une série proposée ».
- **Une photo à la fois :** rien n'est jamais classé sans votre clic, et il n'y a pas de « tout accepter ». Dès que vous choisissez une série (proposée ou non, ou en glissant la photo vers une série), la proposition disparaît et la photo sert d'exemple pour les suivantes.
- **Éteindre :** **Éteindre et effacer** supprime le modèle et toutes les empreintes d'images.

L'analyse se fait sur votre serveur : aucune image n'est envoyée ailleurs. L'empreinte d'une photo (une suite de nombres) sert seulement à comparer des images entre elles. Elle ne permet pas de reconnaître une personne, et elle est effacée avec la photo.

## Décrire les photos

Sous **Proposer une série**, le panneau **Décrire les photos** propose pour chaque photo une phrase courte et factuelle (« un phare rouge sur une petite île »), affichée sur la fiche sous la légende. C'est **désactivé par défaut**.

- **Allumer :** choisissez le modèle, **Léger** (Florence-2 base, proposé par défaut : environ 270 Mo à télécharger, 2 Go de mémoire pendant le calcul, environ 10 secondes par photo) ou **Précis** (Florence-2 large : environ 850 Mo, 4 Go, un peu plus détaillé). **Précis** demande que le site dispose de 6 Go : ajoutez `SITE_MEM_LIMIT=6g` au `.env` de la pile, puis **Compose Up**. Le panneau indique la mémoire disponible et refuse **Précis** si elle ne suffit pas. Choisissez aussi les **heures de nuit** (de 1 h à 6 h par défaut, heure de Paris), puis **Allumer les descriptions**. Le modèle se télécharge une seule fois, au premier calcul.
- **Quand :** les photos sans description sont décrites pendant les heures de nuit, une à la fois, sur un seul cœur du processeur, pour ne pas gêner le reste du serveur. Le modèle n'occupe la mémoire que pendant le calcul.
- **Sur la fiche :** **Décrire cette photo** la fait passer tout de suite (une minute environ). Puis **Reprendre comme légende** recopie la phrase dans le champ Légende, à relire, à réécrire et à enregistrer. **Décrire de nouveau** la recalcule. Rien n'est jamais recopié seul.
- **Langue :** le modèle écrit en anglais. Si le site a un traducteur (LibreTranslate), la phrase est traduite en français et en allemand ; sinon elle reste en anglais.
- **Éteindre :** **Éteindre et effacer le modèle** retire le modèle du disque ; les descriptions déjà faites restent.

L'analyse se fait sur votre serveur : aucune image n'est envoyée ailleurs. Le modèle décrit ce qu'il voit, sans jamais nommer les personnes.
