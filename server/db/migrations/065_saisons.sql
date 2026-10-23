-- Saisons (jalon S0) : une décision éditoriale distincte de la phase calculée à la lecture.
-- Les instants sont en millisecondes UTC : ouverture incluse, fermeture exclue. Une saison programmée est déjà
-- autorisée à paraître à l'ouverture ; l'horloge ne publie jamais son bilan ni sa sélection permanente.
CREATE TABLE saisons (
  id                  INTEGER PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  state               TEXT NOT NULL DEFAULT 'brouillon',
  title               TEXT NOT NULL,
  title_en            TEXT NOT NULL DEFAULT '',
  title_de            TEXT NOT NULL DEFAULT '',
  intro               TEXT NOT NULL DEFAULT '',
  intro_en            TEXT NOT NULL DEFAULT '',
  intro_de            TEXT NOT NULL DEFAULT '',
  opens_at            INTEGER,
  closes_at           INTEGER,
  report              TEXT NOT NULL DEFAULT '',
  report_en           TEXT NOT NULL DEFAULT '',
  report_de           TEXT NOT NULL DEFAULT '',
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  decided_at          INTEGER,
  retired_at          INTEGER,
  report_published_at INTEGER
);
CREATE INDEX saisons_public ON saisons (state, opens_at, id);

-- L'accrochage ne change ni la série ni la publication des photos. Une photo peut figurer dans plusieurs saisons.
CREATE TABLE saison_photos (
  saison_id INTEGER NOT NULL REFERENCES saisons(id) ON DELETE CASCADE,
  photo_id  INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  PRIMARY KEY (saison_id, photo_id),
  UNIQUE (saison_id, position)
);
CREATE INDEX saison_photos_photo ON saison_photos (photo_id);

-- La sélection du bilan porte seulement sur l'accrochage de cette saison, dans son propre ordre.
CREATE TABLE saison_selection (
  saison_id INTEGER NOT NULL REFERENCES saisons(id) ON DELETE CASCADE,
  photo_id  INTEGER NOT NULL,
  position  INTEGER NOT NULL,
  PRIMARY KEY (saison_id, photo_id),
  UNIQUE (saison_id, position),
  FOREIGN KEY (saison_id, photo_id) REFERENCES saison_photos(saison_id, photo_id) ON DELETE CASCADE
);
CREATE INDEX saison_selection_photo ON saison_selection (photo_id);
