-- Droits des personnes (RGPD) : demande d'accès ou d'effacement faite sur /bonjour, à traiter sous un mois ;
-- rencontre « anonymisée » quand les données d'une personne sont effacées mais que son refus doit rester appliqué.
ALTER TABLE encounters ADD COLUMN rights_request TEXT;          -- « acces » ou « effacement »
ALTER TABLE encounters ADD COLUMN rights_requested_at INTEGER;
ALTER TABLE encounters ADD COLUMN rights_done_at INTEGER;
ALTER TABLE encounters ADD COLUMN anonymized INTEGER NOT NULL DEFAULT 0;
