-- Comptes de l'admin et leurs rôles (les rôles vivent dans la base du site ; l'IdP transporte l'identité).
-- status : actif, en_attente (connecté une fois, sans rôle), desactive. author_id : photographe lié (un compte au plus).
CREATE TABLE accounts (
  id            INTEGER PRIMARY KEY,
  sub           TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  author_id     INTEGER UNIQUE REFERENCES authors(id) ON DELETE SET NULL,
  roles         TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'actif' CHECK (status IN ('actif', 'en_attente', 'desactive')),
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);
-- Les liens compte ↔ photographe existants deviennent des comptes administrateurs.
INSERT INTO accounts (sub, name, author_id, roles, status, created_at)
  SELECT oidc_sub, name, id, '["admin"]', 'actif', CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM authors WHERE oidc_sub IS NOT NULL AND oidc_sub != '';
-- Journal : qui a fait quoi (gardé 13 mois).
CREATE TABLE audit_log (
  id      INTEGER PRIMARY KEY,
  at      INTEGER NOT NULL,
  sub     TEXT,
  name    TEXT NOT NULL DEFAULT '',
  action  TEXT NOT NULL,
  target  TEXT NOT NULL DEFAULT '',
  status  INTEGER,
  detail  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX audit_log_at ON audit_log(at);
CREATE INDEX audit_log_sub ON audit_log(sub);
