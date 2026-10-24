-- SA-D19/20 : validations d’une liste versionnée, sans copie d’identité du compte agissant.
CREATE TABLE saison_propositions (
  saison_id INTEGER PRIMARY KEY REFERENCES saisons(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  reviewed_version INTEGER CHECK (reviewed_version = version),
  validated_version INTEGER CHECK (validated_version IS NULL OR (reviewed_version IS NOT NULL AND validated_version = version AND reviewed_version = version)),
  updated_at INTEGER NOT NULL
);
CREATE TABLE saison_proposition_photos (
  saison_id INTEGER NOT NULL REFERENCES saison_propositions(saison_id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (saison_id, photo_id),
  UNIQUE (saison_id, position)
);
