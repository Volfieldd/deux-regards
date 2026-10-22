-- BV-34, complément de D35 validé par le propriétaire : contexte de vulnérabilité des dossiers.
-- Les cibles courantes ne sont pas l'union historique utilisée pour éviter les notifications répétées.
ALTER TABLE veille_alertes ADD COLUMN cibles_actuelles TEXT NOT NULL DEFAULT '[]';
UPDATE veille_alertes SET cibles_actuelles = cibles;
CREATE INDEX veille_alertes_presentes ON veille_alertes (alerte_id) WHERE presente = 1;

-- Révision transactionnelle, aussi changée par un classement en ligne de commande. Un jeton neuf évite qu'un cache
-- lu pendant une transaction annulée soit réutilisé après une autre écriture portant le même compteur numérique.
CREATE TABLE veille_revision (id INTEGER PRIMARY KEY CHECK (id = 1), revision TEXT NOT NULL);
INSERT INTO veille_revision VALUES (1, lower(hex(randomblob(16))));
CREATE TRIGGER veille_revision_ajout AFTER INSERT ON veille_alertes BEGIN
  UPDATE veille_revision SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
CREATE TRIGGER veille_revision_changement AFTER UPDATE ON veille_alertes BEGIN
  UPDATE veille_revision SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
CREATE TRIGGER veille_revision_retrait AFTER DELETE ON veille_alertes BEGIN
  UPDATE veille_revision SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
