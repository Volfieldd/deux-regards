-- Rencontres : personnes photographiées dans la rue qui se manifestent (page /bonjour, carte « pour eux » avec
-- sa référence) ou dont l'accord a été signé sur la carte « pour nous ». Voir server/encounters.js.
ALTER TABLE authors ADD COLUMN card_prefix TEXT NOT NULL DEFAULT '';
UPDATE authors SET card_prefix = upper(substr(slug, 1, 1));

CREATE TABLE encounters (
  id             INTEGER PRIMARY KEY,
  ref            TEXT UNIQUE,                 -- « J-0142 » (carte) ; NULL : venue sans carte
  author_id      INTEGER REFERENCES authors(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'nouvelle' CHECK (status IN ('nouvelle', 'en_cours', 'traitee')),
  verified       INTEGER NOT NULL DEFAULT 0,  -- carte vérifiée (code de contrôle) ou accord papier saisi
  email          TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL DEFAULT '',
  lang           TEXT NOT NULL DEFAULT 'fr',
  wants_photo    INTEGER NOT NULL DEFAULT 0,
  consent        TEXT,                        -- JSON {site, instagram, print, name} ; NULL : pas d'accord
  consent_source TEXT,                        -- « carte » (signée) ou « en_ligne »
  consent_at     INTEGER,
  refused        INTEGER NOT NULL DEFAULT 0,  -- la personne refuse la publication (dernier choix exprimé)
  refused_at     INTEGER,
  met_on         TEXT NOT NULL DEFAULT '',    -- AAAA-MM-JJ
  met_time       TEXT NOT NULL DEFAULT '',
  place          TEXT NOT NULL DEFAULT '',
  details        TEXT NOT NULL DEFAULT '',
  card_jpeg      BLOB,                        -- photo de la carte signée (preuve), dans la base : sauvegardes tournantes
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX encounters_status ON encounters(status, updated_at);

-- Historique : chaque message ou choix exprimé, et chaque saisie dans l'admin (preuve de ce qui a été demandé, quand).
CREATE TABLE encounter_events (
  id           INTEGER PRIMARY KEY,
  encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  at           INTEGER NOT NULL,
  kind         TEXT NOT NULL,                 -- visiteur, carte, liaison, refus_applique, statut, note
  verified     INTEGER NOT NULL DEFAULT 0,
  detail       TEXT NOT NULL DEFAULT '{}'     -- JSON
);
CREATE INDEX encounter_events_enc ON encounter_events(encounter_id, at);

CREATE TABLE encounter_photos (
  encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  photo_id     INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY (encounter_id, photo_id)
);
CREATE INDEX encounter_photos_photo ON encounter_photos(photo_id);
