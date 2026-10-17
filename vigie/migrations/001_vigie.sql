-- Base de la Vigie (docs/etudes/annexe-vigie-architecture.md). Un seul processus l'ouvre en écriture (le service) ;
-- la ligne de commande l'ouvre à côté (WAL).
-- events : tous les faits reçus ou constatés, chaînés (HMAC de la ligne et du maillon précédent, clé VIGIE_LOG_KEY hors
-- de la base) ; seq sans trou : une ligne effacée rompt la suite.
CREATE TABLE events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  id          TEXT NOT NULL UNIQUE,
  recu_a      INTEGER NOT NULL,
  survenu_a   INTEGER,
  type        TEXT NOT NULL,
  severity    TEXT NOT NULL,
  composant   TEXT NOT NULL,
  emetteur    TEXT,
  canal       TEXT NOT NULL,
  confiance   TEXT NOT NULL CHECK (confiance IN ('constaté', 'rapporté')),
  reference   TEXT,
  sub         TEXT,
  session     TEXT,
  ip          TEXT,
  ip_net      TEXT,
  country     TEXT,
  city        TEXT,
  lat         REAL,
  lon         REAL,
  ua          TEXT,
  ua_family   TEXT,
  method      TEXT,
  route       TEXT,
  status      INTEGER,
  detail      TEXT,
  retard      INTEGER NOT NULL DEFAULT 0,
  chain       TEXT NOT NULL
);
CREATE INDEX events_recu ON events (recu_a);
CREATE INDEX events_type ON events (type, recu_a);
CREATE INDEX events_sub ON events (sub, recu_a);
CREATE INDEX events_net ON events (ip_net, recu_a);

-- Compteurs par jour (tableaux de la console sur plusieurs mois, sans relire la table brute).
CREATE TABLE daily (
  day        TEXT NOT NULL,
  type       TEXT NOT NULL,
  severity   TEXT NOT NULL,
  composant  TEXT NOT NULL,
  n          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, type, severity, composant)
);

-- Décisions appliquées par le site (blocages, révocations, gels, verrouillage de l'admin), toujours bornées dans le temps.
CREATE TABLE decisions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  kind      TEXT NOT NULL CHECK (kind IN ('bloquer', 'revoquer_session', 'revoquer_compte', 'geler', 'verrouiller')),
  cible     TEXT NOT NULL,
  portee    TEXT,
  motif     TEXT NOT NULL DEFAULT '',
  par       TEXT NOT NULL,
  cree_a    INTEGER NOT NULL,
  fin       INTEGER NOT NULL,
  leve_a    INTEGER,
  leve_par  TEXT,
  auto      INTEGER NOT NULL DEFAULT 0,
  details   TEXT
);
CREATE INDEX decisions_actives ON decisions (fin) WHERE leve_a IS NULL;

-- Nonces des lots reçus (10 minutes) : un lot rejoué est refusé.
CREATE TABLE nonces (
  nonce  TEXT PRIMARY KEY,
  at     INTEGER NOT NULL
);
CREATE INDEX nonces_at ON nonces (at);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
