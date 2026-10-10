# Sources du wiki

Ces pages sont la source du [wiki GitHub](https://github.com/Volfieldd/deux-regards/wiki). Elles sont versionnées avec le code et relues dans les PR.

## Publication

GitHub ne crée le dépôt du wiki qu'à la création de sa **première page dans l'interface web**. Il faut donc, une seule fois, ouvrir l'onglet *Wiki* du dépôt, puis cliquer sur *Create the first page* et enregistrer (le contenu sera remplacé).

Ensuite, à chaque mise à jour :

```bash
docs/wiki/publish.sh
```

Le script recopie ces pages (sauf ce README et le script) dans le dépôt `deux-regards.wiki.git`, puis les pousse.
