-- Journal d'un dossier, sans parcourir le journal général (même garde JSON que l'index des alertes).
CREATE INDEX events_dossier ON events
  ((CASE WHEN json_valid(detail) THEN json_extract(detail, '$.id') END), seq)
  WHERE type = 'vigie_dossier';

-- Une scission est une décision durable : le même lien ne réunit pas à nouveau les deux dossiers.
-- Les signaux déplacés restent dans la chaîne ; seule leur appartenance aux dossiers change.
CREATE TABLE dossier_separations (
  gauche INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  droite INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  PRIMARY KEY (gauche, droite),
  CHECK (gauche < droite)
);
CREATE TABLE dossier_signaux_ecartes (
  dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,                  -- 0 : signal sans événement source
  regle TEXT NOT NULL,
  PRIMARY KEY (dossier_id, seq, regle)
);
CREATE INDEX dossier_separations_droite ON dossier_separations (droite);
