-- Revue sécurité : une liste de décisions reçue ne prouve pas leur application. Le reçu est écrit dans la même
-- transaction que la suspension et les autorisations retirées. Il survit au déblocage manuel, jusqu'à la fin de la
-- décision ; l'effacement de l'accès l'emporte. Aucun nom, motif, lien ni adresse n'est recopié.
CREATE TABLE space_vigie_suspensions (
  invite_id INTEGER NOT NULL REFERENCES space_invites(id) ON DELETE CASCADE,
  depuis    INTEGER NOT NULL,
  fin       INTEGER NOT NULL,
  PRIMARY KEY (invite_id, depuis)
);
CREATE INDEX space_vigie_suspensions_fin ON space_vigie_suspensions(fin);

-- Le numéro figure dans les décisions signées encore actives après effacement d'une invitation : ne jamais le
-- réattribuer à une autre personne. Un seul compteur global, sans historique d'invités ni donnée personnelle.
CREATE TABLE space_invite_compteur (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  dernier_id INTEGER NOT NULL
);
INSERT INTO space_invite_compteur (id, dernier_id) SELECT 1, COALESCE(MAX(id), 0) FROM space_invites;
