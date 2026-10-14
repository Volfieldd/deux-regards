-- Visages détectés (pas reconnus) : nombre et cadres (fractions de l'image), jamais d'empreinte de visage.
-- faces NULL : pas encore examinée ; -1 : examen impossible. faces_override : correction à la main
-- (1 : il y a quelqu'un ; 0 : personne de reconnaissable ; NULL : la détection fait foi).
ALTER TABLE photos ADD COLUMN faces INTEGER;
ALTER TABLE photos ADD COLUMN face_boxes TEXT;
ALTER TABLE photos ADD COLUMN faces_override INTEGER;
-- Publication d'une photo « à vérifier » : confirmée explicitement, usage par usage, avec ce qui manquait.
CREATE TABLE photo_confirmations (
  id         INTEGER PRIMARY KEY,
  photo_id   INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  usage      TEXT NOT NULL,
  at         INTEGER NOT NULL,
  by_name    TEXT NOT NULL DEFAULT '',
  reasons    TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX photo_confirmations_photo ON photo_confirmations(photo_id);
