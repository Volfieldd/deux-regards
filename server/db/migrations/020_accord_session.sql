-- Accord par session : une rencontre couvre toutes les photos de son photographe prises ce jour-là (date EXIF),
-- sauf celles qu'on exclut. session_day corrige la date si l'horloge de l'appareil était décalée (sinon : met_on).
ALTER TABLE encounters ADD COLUMN session_day TEXT;
CREATE TABLE encounter_exclusions (
  encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  photo_id     INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY (encounter_id, photo_id)
);
CREATE INDEX photos_session ON photos(author_id, taken_on);
