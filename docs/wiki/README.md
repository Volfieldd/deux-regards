# Sources du wiki

Ces pages sont la source du [wiki GitHub](https://github.com/Volfieldd/deux-regards/wiki). Elles sont versionnées avec le code et relues dans les PR.

## Publication

GitHub ne crée le dépôt du wiki qu'à la création de sa **première page dans l'interface web**. Il faut donc, une seule fois, ouvrir l'onglet *Wiki* du dépôt, puis cliquer sur *Create the first page* et enregistrer (le contenu sera remplacé).

Ensuite, à chaque mise à jour :

```bash
docs/wiki/publish.sh
```

Le script recopie ces pages (sauf ce README) et les captures, génère les pages « Aide » depuis `docs/aide/` (source unique, aussi affichée dans l'admin) et la page « Unraid » depuis `deploy/unraid/README.md` (guide livré avec les fichiers de la pile), puis pousse le tout dans `deux-regards.wiki.git`.

**Où écrire quoi** :

| Contenu | Source |
|---|---|
| Gestes dans l'admin (aide en ligne) | `docs/aide/` |
| Installation et exploitation sur Unraid | `deploy/unraid/README.md` |
| Marches à suivre ponctuelles (chiffrement, deux facteurs, e-mails, app, demandes RGPD, violation, restauration) | `docs/wiki/Procédures.md` |
| Registre, accord, analyse d'impact (RGPD) | `docs/wiki/RGPD.md` |
| Fonctions du site | `docs/specs/README.md`, recopié dans `docs/wiki/Spécifications.md` |
| Le reste (configuration, sécurité, tests, développement) | `docs/wiki/` |
