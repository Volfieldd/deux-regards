-- « J'aime » des visiteurs : un compteur par photo, anonyme (ni compte, ni cookie ; l'adresse IP n'est gardée qu'en
-- mémoire, quelques heures, pour éviter les doubles « j'aime », jamais en base).
ALTER TABLE photos ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;
-- Signalements des visiteurs : photo inappropriée, suggestion pour le texte, autre. message et email chiffrés (DATA_KEY).
CREATE TABLE photo_reports (
  id         INTEGER PRIMARY KEY,
  photo_id   INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  message    TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  lang       TEXT NOT NULL DEFAULT 'fr',
  status     TEXT NOT NULL DEFAULT 'nouveau',
  created_at INTEGER NOT NULL,
  done_at    INTEGER
);
CREATE INDEX photo_reports_status ON photo_reports(status, created_at);
