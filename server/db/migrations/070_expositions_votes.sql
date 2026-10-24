-- V1 : un index propre à chaque exposition, jamais le jeton du navigateur, et une preuve de consentement chiffrée.
-- Les bulletins détaillés disparaissent avec leur votant à la clôture ; les totaux restent indépendants.
CREATE TABLE saison_vote_votants (
  saison_id        INTEGER NOT NULL REFERENCES saisons(id) ON DELETE CASCADE,
  navigateur_index TEXT NOT NULL,
  consentement     TEXT NOT NULL,
  PRIMARY KEY (saison_id, navigateur_index)
);

CREATE TABLE saison_votes (
  saison_id        INTEGER NOT NULL REFERENCES saisons(id) ON DELETE CASCADE,
  photo_id         INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  navigateur_index TEXT NOT NULL,
  PRIMARY KEY (saison_id, photo_id, navigateur_index),
  FOREIGN KEY (saison_id, navigateur_index) REFERENCES saison_vote_votants(saison_id, navigateur_index) ON DELETE CASCADE
);
CREATE INDEX saison_votes_votant ON saison_votes (navigateur_index, saison_id);
CREATE INDEX saison_votes_photo ON saison_votes (photo_id);

CREATE TABLE saison_vote_totaux (
  saison_id INTEGER NOT NULL REFERENCES saisons(id) ON DELETE CASCADE,
  photo_id  INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  total     INTEGER NOT NULL CHECK (total >= 0 AND total <= 9007199254740991),
  PRIMARY KEY (saison_id, photo_id)
);
CREATE INDEX saison_vote_totaux_photo ON saison_vote_totaux (photo_id);
