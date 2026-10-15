-- Remarques adressées au photographe d'une photo (« légende à corriger ») par un modérateur ou un administrateur ;
-- elles apparaissent dans son « Aujourd'hui » jusqu'à ce qu'il les marque faites. Aucune donnée personnelle.
CREATE TABLE photo_notes (
  id         INTEGER PRIMARY KEY,
  photo_id   INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  from_sub   TEXT,
  from_name  TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  done_at    INTEGER,
  done_by    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX photo_notes_photo ON photo_notes(photo_id);
