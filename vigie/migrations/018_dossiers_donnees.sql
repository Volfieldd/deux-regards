-- BV-33 : catégories et volumes minimisés, conservés avec les faits du dossier même après purge du journal.
-- Les anciens événements restent interprétés par leur objet ; aucun contenu de fiche n'est recopié.
ALTER TABLE dossier_signaux ADD COLUMN donnees TEXT;
