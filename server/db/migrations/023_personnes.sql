-- Personnes : une personne photographiée, qui peut avoir été rencontrée lors de plusieurs sorties (une rencontre par
-- sortie, chacune avec sa carte et son accord). Aucune donnée personnelle ici : nom, adresse, visage restent sur les
-- rencontres (chiffrés). email_hash : empreinte (HMAC) de l'adresse, pour proposer un rapprochement sans la stocker
-- en clair. people_distinct : rapprochements écartés à la main (« ce n'est pas la même personne »).
CREATE TABLE people (
  id         INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
ALTER TABLE encounters ADD COLUMN person_id INTEGER REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE encounters ADD COLUMN email_hash TEXT;
CREATE INDEX encounters_person ON encounters(person_id);
CREATE INDEX encounters_email_hash ON encounters(email_hash);
CREATE TABLE people_distinct (
  a INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  b INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (a, b)
);
