-- Dossiers (étude docs/etudes/vigie-dossiers.md, sections 5 à 9 ; décisions D31 à D39 du 20 octobre 2026) : ce qui
-- touche une même attaque probable, d'une entité à l'autre, avec sa progression (phases), sa confiance, son enjeu et sa
-- gravité expliquée. Les alertes, leurs modes et leurs notifications ne changent pas : le dossier est au-dessus.

CREATE TABLE dossiers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  piste           TEXT NOT NULL CHECK (piste IN ('identite', 'invite', 'serveur', 'externe', 'surveillance')),
  graine_kind     TEXT NOT NULL,
  graine_key      TEXT NOT NULL,
  statut          TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'en_cours', 'sommeil', 'clos')),
  classement      TEXT CHECK (classement IN ('incident', 'faux_positif', 'test', 'legitime')),
  recidive        INTEGER NOT NULL DEFAULT 0,
  phase_max       INTEGER,
  coherence       INTEGER NOT NULL DEFAULT 0,
  confiance       TEXT NOT NULL DEFAULT 'aucune' CHECK (confiance IN ('aucune', 'faible', 'moyenne', 'forte')),
  enjeu           TEXT NOT NULL DEFAULT 'ordinaire' CHECK (enjeu IN ('ordinaire', 'personnel', 'sensible', 'critique')),
  gravite         TEXT NOT NULL DEFAULT 'info',
  dissimulation   INTEGER NOT NULL DEFAULT 0,
  explication     TEXT NOT NULL DEFAULT '{}',
  tronque         INTEGER NOT NULL DEFAULT 0,
  chaine_signalee INTEGER NOT NULL DEFAULT 0,
  fusionne_dans   INTEGER REFERENCES dossiers(id),
  ouvert_a        INTEGER NOT NULL,
  derniere        INTEGER NOT NULL,
  dernier_jalon   INTEGER,
  traite_par      TEXT,
  traite_a        INTEGER,
  note            TEXT
);
CREATE INDEX dossiers_actifs ON dossiers (statut, derniere) WHERE fusionne_dans IS NULL;

-- Entités d'un dossier : acteurs (d'où vient l'action), cibles (ce qui est touché), contexte ; force du lien par lequel
-- elles sont entrées. Seuls les acteurs de lien fort ou moyen servent à retrouver un dossier (une cible ne se traverse
-- jamais, D34).
CREATE TABLE dossier_entites (
  dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  key        TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('acteur', 'cible', 'contexte')),
  force      TEXT NOT NULL CHECK (force IN ('graine', 'fort', 'moyen', 'faible', 'manuel')),
  via        TEXT,
  ajoute_a   INTEGER NOT NULL,
  detache_a  INTEGER,
  PRIMARY KEY (dossier_id, kind, key)
);
CREATE INDEX dossier_entites_cle ON dossier_entites (kind, key) WHERE detache_a IS NULL;

-- Signaux et faits d'un dossier, copiés (les événements sont purgés à 6 mois, un dossier d'incident dure plus).
CREATE TABLE dossier_signaux (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_id  INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  seq         INTEGER,
  regle       TEXT NOT NULL,
  survenu_a   INTEGER NOT NULL,
  nature      TEXT NOT NULL CHECK (nature IN ('jalon', 'indice', 'preuve', 'fait')),
  phase       INTEGER,
  marqueurs   TEXT,
  points      REAL,
  source      TEXT,
  gravite     TEXT,
  entite_kind TEXT,
  entite_key  TEXT,
  sub         TEXT,
  session     TEXT,
  ip          TEXT,
  objet       TEXT,
  promu       INTEGER NOT NULL DEFAULT 0,
  alerte_id   INTEGER,
  cle         TEXT,
  UNIQUE (dossier_id, seq, regle)
);
CREATE INDEX dossier_signaux_temps ON dossier_signaux (dossier_id, survenu_a);

-- Signaux projetés des 30 derniers jours (jalons, indices, preuves, marqueurs), dossier ou pas : le rattachement
-- rétroactif et la confiance d'un compte les relisent ici, par compte, adresse, session ou entité.
CREATE TABLE signaux_projetes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  seq         INTEGER,
  regle       TEXT NOT NULL,
  survenu_a   INTEGER NOT NULL,
  nature      TEXT NOT NULL,
  phase       INTEGER,
  marqueurs   TEXT,
  points      REAL,
  source      TEXT,
  gravite     TEXT,
  entite_kind TEXT,
  entite_key  TEXT,
  sub         TEXT,
  session     TEXT,
  ip          TEXT,
  cle         TEXT
);
CREATE INDEX signaux_projetes_sub ON signaux_projetes (sub, survenu_a);
CREATE INDEX signaux_projetes_entite ON signaux_projetes (entite_kind, entite_key, survenu_a);
CREATE INDEX signaux_projetes_ip ON signaux_projetes (ip, survenu_a);
CREATE INDEX signaux_projetes_temps ON signaux_projetes (survenu_a);
CREATE INDEX signaux_projetes_seq ON signaux_projetes (seq, regle);

ALTER TABLE alerts ADD COLUMN dossier_id INTEGER;
CREATE INDEX alerts_dossier ON alerts (dossier_id) WHERE dossier_id IS NOT NULL;

-- Faits d'une session (rattachement rétroactif, lectures d'une session).
CREATE INDEX events_session ON events (session, recu_a);
