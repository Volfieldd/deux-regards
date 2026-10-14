-- Photos offertes aux personnes photographiées : lien privé (jeton aléatoire), valable 30 jours, vers une version
-- JPEG de la photo (jamais l'original). Compteurs de visites et de téléchargements, pour savoir si elle est arrivée.
CREATE TABLE encounter_shares (
  token        TEXT PRIMARY KEY,
  encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  photo_id     INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  views        INTEGER NOT NULL DEFAULT 0,
  downloads    INTEGER NOT NULL DEFAULT 0,
  last_at      INTEGER
);
CREATE INDEX encounter_shares_enc ON encounter_shares(encounter_id);
