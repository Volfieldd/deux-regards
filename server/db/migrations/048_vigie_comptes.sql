-- Vigie (journalisation de sécurité, docs/etudes/annexe-vigie-architecture.md, section 4.4) : tout changement de rôle,
-- d'état, de photographe lié ou de réglages du circuit d'un compte est noté par la base elle-même, quel que soit son
-- auteur (l'application, un sqlite3 lancé sur le serveur, une injection). L'application ouvre d'abord un « ticket »
-- dans la même transaction ; un changement sans ticket a été fait hors de l'application.
-- Gardé 13 mois, comme le journal. Écrit avec ou sans Vigie (quelques lignes par mois) : une Vigie ajoutée plus tard
-- connaît l'historique.
CREATE TABLE account_change_tickets (
  id      INTEGER PRIMARY KEY,
  at      INTEGER NOT NULL,
  action  TEXT NOT NULL,
  by_sub  TEXT,
  open    INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX account_change_tickets_open ON account_change_tickets (open) WHERE open = 1;

CREATE TABLE account_changes (
  id          INTEGER PRIMARY KEY,
  at          INTEGER NOT NULL,
  op          TEXT NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  sub         TEXT NOT NULL,
  old_roles   TEXT, new_roles   TEXT,
  old_status  TEXT, new_status  TEXT,
  old_author  INTEGER, new_author INTEGER,
  old_adjust  TEXT, new_adjust  TEXT,
  ticket_id   INTEGER REFERENCES account_change_tickets(id) ON DELETE SET NULL
);
CREATE INDEX account_changes_at ON account_changes (at);
CREATE INDEX account_changes_ticket ON account_changes (ticket_id);

CREATE TRIGGER account_changes_insert AFTER INSERT ON accounts
BEGIN
  INSERT INTO account_changes (at, op, sub, new_roles, new_status, new_author, new_adjust, ticket_id)
  VALUES (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 'INSERT', NEW.sub, NEW.roles, NEW.status, NEW.author_id, NEW.adjust,
    (SELECT id FROM account_change_tickets WHERE open = 1 ORDER BY id DESC LIMIT 1));
END;

CREATE TRIGGER account_changes_update AFTER UPDATE OF roles, status, author_id, adjust ON accounts
WHEN OLD.roles IS NOT NEW.roles OR OLD.status IS NOT NEW.status OR OLD.author_id IS NOT NEW.author_id OR OLD.adjust IS NOT NEW.adjust
BEGIN
  INSERT INTO account_changes (at, op, sub, old_roles, new_roles, old_status, new_status, old_author, new_author, old_adjust, new_adjust, ticket_id)
  VALUES (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 'UPDATE', NEW.sub, OLD.roles, NEW.roles, OLD.status, NEW.status,
    OLD.author_id, NEW.author_id, OLD.adjust, NEW.adjust,
    (SELECT id FROM account_change_tickets WHERE open = 1 ORDER BY id DESC LIMIT 1));
END;

CREATE TRIGGER account_changes_delete AFTER DELETE ON accounts
BEGIN
  INSERT INTO account_changes (at, op, sub, old_roles, old_status, old_author, old_adjust, ticket_id)
  VALUES (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 'DELETE', OLD.sub, OLD.roles, OLD.status, OLD.author_id, OLD.adjust,
    (SELECT id FROM account_change_tickets WHERE open = 1 ORDER BY id DESC LIMIT 1));
END;

-- Contexte d'une session à sa création (adresse, réseau, pays, navigateur), rempli seulement quand la Vigie est
-- configurée : une session reprise ailleurs (cookie volé) se voit à la requête suivante.
ALTER TABLE sessions ADD COLUMN ctx_ip TEXT;
ALTER TABLE sessions ADD COLUMN ctx_net TEXT;
ALTER TABLE sessions ADD COLUMN ctx_country TEXT;
ALTER TABLE sessions ADD COLUMN ctx_ua TEXT;

-- Sessions fermées ou expirées (empreinte du jeton, jamais le jeton), gardées 48 h : un cookie qui revient après la fin
-- de sa session a été copié. Remplie par un déclencheur que le site pose au démarrage seulement quand la Vigie est
-- configurée (et retire sinon) : sans Vigie, cette table reste vide.
CREATE TABLE sessions_revoked (
  id          TEXT PRIMARY KEY,
  sub         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  revoked_at  INTEGER NOT NULL,
  ctx_net     TEXT,
  ctx_ua      TEXT
);
CREATE INDEX sessions_revoked_at ON sessions_revoked (revoked_at);
