# Autorités d'horodatage

`freetsa-cacert.pem` : certificat racine de [FreeTSA](https://freetsa.org) (téléchargé depuis
https://freetsa.org/files/cacert.pem, valable jusqu'en 2040). Il sert à vérifier la chaîne des jetons
quand `TSA_URL` est le service par défaut. Pour une autre autorité, indiquer son certificat racine
dans `TSA_CA_FILE`.
