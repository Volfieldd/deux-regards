-- Circuit de publication : où en est une photo (NULL, proposee, programmee, a_reprendre), date de publication
-- programmée, et l'historique des décisions (qui, quand, quel mot).
ALTER TABLE photos ADD COLUMN review TEXT;
ALTER TABLE photos ADD COLUMN publish_at INTEGER;
CREATE TABLE photo_reviews (
  id         INTEGER PRIMARY KEY,
  photo_id   INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  by_sub     TEXT,
  by_name    TEXT NOT NULL DEFAULT '',
  at         INTEGER NOT NULL,
  message    TEXT NOT NULL DEFAULT '',
  publish_at INTEGER
);
CREATE INDEX photo_reviews_photo ON photo_reviews(photo_id);
-- Comptes : droits réglés photographe par photographe ({ add, remove }), et e-mail de prévenance choisi.
ALTER TABLE accounts ADD COLUMN adjust TEXT NOT NULL DEFAULT '{}';
ALTER TABLE accounts ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN notify_to TEXT NOT NULL DEFAULT '';
