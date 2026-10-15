-- Partages d'une photo, comptés sans rien savoir du visiteur : un nombre par photo, par moyen (whatsapp, copie,
-- telephone, qr…) et par jour.
CREATE TABLE photo_shares (
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  via      TEXT NOT NULL,
  day      TEXT NOT NULL,
  n        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (photo_id, via, day)
);
