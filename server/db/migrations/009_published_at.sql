-- Date de première publication : tri « Plus récentes » de la galerie.
-- Posée par des déclencheurs, quel que soit le chemin qui publie (photothèque, lot, fiche, seed) ;
-- une photo dépubliée puis republiée garde sa première date.
ALTER TABLE photos ADD COLUMN published_at TEXT;

-- Photos déjà publiées : la date d'import est la meilleure approximation disponible.
UPDATE photos SET published_at = created_at WHERE status = 'published';

CREATE TRIGGER photos_published_at_insert AFTER INSERT ON photos
  WHEN NEW.status = 'published' AND NEW.published_at IS NULL
  BEGIN UPDATE photos SET published_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER photos_published_at_update AFTER UPDATE OF status ON photos
  WHEN NEW.status = 'published' AND NEW.published_at IS NULL
  BEGIN UPDATE photos SET published_at = datetime('now') WHERE id = NEW.id; END;

CREATE INDEX photos_published_at ON photos (published_at);
