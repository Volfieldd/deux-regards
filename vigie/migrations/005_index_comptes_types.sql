-- Abaques de capacité (arbitrage NC6, 17 octobre 2026) : les détecteurs cherchent par compte ET par type (connexions,
-- lectures, échecs) sur une fenêtre ; avec le seul index (compte, heure), une connexion relisait toutes les lignes du
-- compte sur 90 jours. Index couvrant (heure de la source comprise) : l'heure inhabituelle ne lit plus la table.
CREATE INDEX events_sub_type ON events (sub, type, recu_a, survenu_a);
