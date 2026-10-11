-- Partage sur Instagram : compte connecté (jeton chiffré) et file de publication.
CREATE TABLE instagram_account (
  id            INTEGER PRIMARY KEY CHECK (id = 1),      -- un seul compte
  ig_user_id    TEXT NOT NULL,
  username      TEXT NOT NULL,
  token         TEXT NOT NULL,                           -- jeton longue durée, chiffré (AES-256-GCM)
  expires_at    INTEGER NOT NULL,                        -- epoch ms
  refreshed_at  INTEGER NOT NULL,
  connected_at  INTEGER NOT NULL
);
CREATE TABLE instagram_posts (
  id            INTEGER PRIMARY KEY,
  photo_id      INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('queued', 'publishing', 'published', 'failed', 'cancelled')),
  position      INTEGER NOT NULL DEFAULT 0,              -- ordre dans la file
  frame         TEXT NOT NULL CHECK (frame IN ('white', 'black', 'crop')),
  watermark     INTEGER NOT NULL DEFAULT 0,              -- 1 : avec le filigrane des réglages
  caption       TEXT,                                    -- légende personnalisée ; NULL : celle du modèle
  media_token   TEXT,                                    -- adresse temporaire de l'image pendant l'envoi
  ig_media_id   TEXT,
  permalink     TEXT,
  error         TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  published_at  INTEGER
);
CREATE INDEX instagram_posts_photo ON instagram_posts(photo_id);
CREATE INDEX instagram_posts_status ON instagram_posts(status, position);
