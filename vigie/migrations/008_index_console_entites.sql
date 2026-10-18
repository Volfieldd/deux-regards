-- Console de la Vigie (phase D3b) : fiche d'une entité et fiche d'un événement, sans parcourir une table entière.
-- Alertes d'une entité (fiche MV-04, « Alertes de l'adresse ») : les seuls index des alertes commencent par la règle
-- (alerts_ouvertes, alertes non closes) ou par la date (alerts_derniere) ; sans celui-ci, chaque fiche relirait toutes
-- les alertes gardées (13 mois d'alertes closes, une par règle, par entité et par période d'activité).
CREATE INDEX alerts_entite ON alerts (entite_kind, entite_key, derniere);
-- Alertes qui contiennent un événement (fiche d'un événement) : la clé de alert_events commence par l'alerte ; chercher
-- par événement relirait toute la table (une ligne par événement rattaché à une alerte).
CREATE INDEX alert_events_seq ON alert_events (seq);
