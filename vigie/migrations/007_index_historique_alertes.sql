-- Console de la Vigie, phase D3b (fiche d'une alerte, MV-02) : l'historique d'une alerte (ouverture, aggravations, prise
-- en charge, classement, notes) est fait des événements « vigie_alerte » dont detail.id est le numéro de l'alerte. Sans
-- index, la fiche relirait tous les événements de ce type depuis l'ouverture (index events_type) et décoderait leur détail :
-- des milliers de lignes pour une alerte ancienne. Index partiel, sur ce seul type (quelques lignes par alerte), et sur
-- l'expression ; json_valid d'abord : un détail illisible ne fait jamais échouer une écriture. La requête de la console
-- (vigie/console/ecrans/alertes.js, HISTORIQUE) reprend exactement cette expression et cette condition.
-- Coût : une lecture de la table à la création (une fois), puis rien pour les autres types d'événements.
CREATE INDEX events_alerte ON events ((CASE WHEN json_valid(detail) THEN json_extract(detail, '$.id') END)) WHERE type = 'vigie_alerte';
