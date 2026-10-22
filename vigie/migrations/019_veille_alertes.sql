-- BV-34 : mémoire des correspondances OSV, indépendante de la fenêtre de 24 h du moteur.
-- Une clôture manuelle reste acquise tant que la même version demeure présente sans aggravation.
CREATE TABLE veille_alertes (
  cle          TEXT PRIMARY KEY,
  avis         TEXT NOT NULL,
  nom          TEXT NOT NULL,
  version      TEXT NOT NULL,
  cibles       TEXT NOT NULL,
  alerte_id    INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
  gravite      TEXT NOT NULL,
  presente     INTEGER NOT NULL CHECK (presente IN (0, 1)),
  verifie_a    INTEGER NOT NULL
);
CREATE INDEX veille_alertes_alerte ON veille_alertes (alerte_id);
