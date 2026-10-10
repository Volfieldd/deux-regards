-- Les sessions sont jetables : on recrée la table plutôt que de la migrer.
-- L'identifiant stocké est l'empreinte SHA-256 du jeton du cookie, jamais le jeton lui-même.
DROP TABLE sessions;

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,            -- sha256(jeton) en hex
  sub        TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  roles      TEXT NOT NULL DEFAULT '[]',  -- JSON
  id_token   TEXT,                        -- pour la déconnexion côté IdP
  csrf       TEXT NOT NULL,
  created_at INTEGER NOT NULL,            -- epoch ms, borne l'expiration absolue
  expires_at INTEGER NOT NULL             -- epoch ms, glissante
);
CREATE INDEX sessions_expiry ON sessions (expires_at);
