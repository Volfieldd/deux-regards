-- Revue du 17 octobre 2026 : position connue d'une adresse (détecteur de voyage) et recherches par adresse, sans
-- parcourir toute la table des événements.
CREATE INDEX events_ip ON events (ip, recu_a);
