-- Descriptions suggérées (Florence-2, sur ce serveur) : une par photo, en anglais (sortie du modèle) et traduite
-- (LibreTranslate, si configuré). requested_at : demandée depuis la fiche (passe avant la file de nuit) ; text_en
-- NULL : pas encore calculée. Jamais recopiée seule dans la légende.
CREATE TABLE photo_descriptions (
  photo_id     INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
  model        TEXT,
  text_en      TEXT,
  text_fr      TEXT NOT NULL DEFAULT '',
  text_de      TEXT NOT NULL DEFAULT '',
  requested_at INTEGER,
  created_at   INTEGER,
  error        TEXT
);
CREATE INDEX photo_descriptions_requested ON photo_descriptions (requested_at);
