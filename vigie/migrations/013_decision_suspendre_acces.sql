-- Décision « suspendre_acces » (registre des briques, BV-18, « Tranché » 5) : un accès d'une galerie privée, suspendu par
-- le site comme après 30 refus. La contrainte CHECK de la colonne kind (migration 001) ne se modifie pas en SQLite : la
-- table est recopiée telle quelle (mêmes colonnes, mêmes numéros, mêmes empreintes mac), puis ses index sont reposés.
CREATE TABLE decisions_neuve (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  kind      TEXT NOT NULL CHECK (kind IN ('bloquer', 'revoquer_session', 'revoquer_compte', 'geler', 'verrouiller', 'suspendre_acces')),
  cible     TEXT NOT NULL,
  portee    TEXT,
  motif     TEXT NOT NULL DEFAULT '',
  par       TEXT NOT NULL,
  cree_a    INTEGER NOT NULL,
  fin       INTEGER NOT NULL,
  leve_a    INTEGER,
  leve_par  TEXT,
  auto      INTEGER NOT NULL DEFAULT 0,
  details   TEXT,
  mac       TEXT,
  alerte_id INTEGER
);
INSERT INTO decisions_neuve (id, kind, cible, portee, motif, par, cree_a, fin, leve_a, leve_par, auto, details, mac, alerte_id)
  SELECT id, kind, cible, portee, motif, par, cree_a, fin, leve_a, leve_par, auto, details, mac, alerte_id FROM decisions;
-- Numérotation gardée : une décision purgée ne voit jamais son numéro redonné.
UPDATE sqlite_sequence SET seq = MAX(seq, (SELECT seq FROM sqlite_sequence WHERE name = 'decisions')) WHERE name = 'decisions_neuve';
INSERT INTO sqlite_sequence (name, seq) SELECT 'decisions_neuve', seq FROM sqlite_sequence WHERE name = 'decisions'
  AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'decisions_neuve');
DROP TABLE decisions;
ALTER TABLE decisions_neuve RENAME TO decisions;
CREATE INDEX decisions_actives ON decisions (fin) WHERE leve_a IS NULL;
CREATE INDEX decisions_alerte ON decisions (alerte_id) WHERE alerte_id IS NOT NULL;
CREATE INDEX decisions_cree ON decisions (cree_a);
