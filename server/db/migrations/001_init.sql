CREATE TABLE authors (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  bio        TEXT NOT NULL DEFAULT '',
  oidc_sub   TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE photos (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  author_id   INTEGER NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
  place       TEXT NOT NULL DEFAULT '',
  taken_on    TEXT,                       -- AAAA-MM ou AAAA-MM-JJ
  legend      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  position    INTEGER NOT NULL DEFAULT 0,
  file        TEXT NOT NULL UNIQUE,       -- nom de l'original dans storage/originals
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX photos_public ON photos (status, position);
CREATE INDEX photos_category ON photos (category_id);
CREATE INDEX photos_author ON photos (author_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  sub        TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  roles      TEXT NOT NULL DEFAULT '[]',  -- JSON
  id_token   TEXT,                        -- pour la déconnexion côté IdP
  csrf       TEXT NOT NULL,
  expires_at INTEGER NOT NULL             -- epoch ms
);
CREATE INDEX sessions_expiry ON sessions (expires_at);
