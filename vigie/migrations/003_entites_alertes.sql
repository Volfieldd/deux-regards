-- Phase C1 (recadrage du 17 octobre 2026) : entités et score composite, liens, alertes.
-- entities : score qui décroît avec le temps (demi-vie), contributions par source (site, zitadel, bordure, vigie),
-- recalculées à la lecture ; une alerte « moyen » ou « haut » demande deux sources (quorum, D18).
CREATE TABLE entities (
  kind           TEXT NOT NULL CHECK (kind IN ('ip', 'reseau', 'compte', 'session', 'appareil', 'site', 'vigie')),
  key            TEXT NOT NULL,
  score          REAL NOT NULL DEFAULT 0,
  at             INTEGER NOT NULL,
  contributions  TEXT NOT NULL DEFAULT '{}',
  signaux        INTEGER NOT NULL DEFAULT 0,
  premiere       INTEGER NOT NULL,
  derniere       INTEGER NOT NULL,
  PRIMARY KEY (kind, key)
);
CREATE INDEX entities_derniere ON entities (derniere);

-- Liens vus ensemble dans un même événement (cette adresse a utilisé ce compte, cette session…).
CREATE TABLE entity_links (
  a_kind    TEXT NOT NULL,
  a_key     TEXT NOT NULL,
  b_kind    TEXT NOT NULL,
  b_key     TEXT NOT NULL,
  derniere  INTEGER NOT NULL,
  PRIMARY KEY (a_kind, a_key, b_kind, b_key)
);
CREATE INDEX entity_links_b ON entity_links (b_kind, b_key);

-- Alertes : une par règle et par entité tant qu'elle est ouverte (les événements suivants s'y ajoutent).
CREATE TABLE alerts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  regle        TEXT NOT NULL,
  cas          TEXT,
  entite_kind  TEXT NOT NULL,
  entite_key   TEXT NOT NULL,
  gravite      TEXT NOT NULL,
  mode         TEXT NOT NULL,
  statut       TEXT NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte', 'en_cours', 'close')),
  classement   TEXT CHECK (classement IN ('incident', 'faux_positif', 'test')),
  note         TEXT,
  premiere     INTEGER NOT NULL,
  derniere     INTEGER NOT NULL,
  compteur     INTEGER NOT NULL DEFAULT 1,
  score        REAL,
  sources      TEXT NOT NULL DEFAULT '[]',
  reponse      TEXT,
  traite_par   TEXT,
  traite_a     INTEGER
);
CREATE INDEX alerts_ouvertes ON alerts (regle, entite_kind, entite_key) WHERE statut != 'close';
CREATE INDEX alerts_derniere ON alerts (derniere);

CREATE TABLE alert_events (
  alert_id  INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  seq       INTEGER NOT NULL,
  PRIMARY KEY (alert_id, seq)
);
