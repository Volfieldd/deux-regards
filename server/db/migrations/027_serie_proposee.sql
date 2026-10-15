-- Série proposée (désactivée par défaut). series_checked : 1 quand la série a été choisie à la main (vue rapide,
-- fiche, glisser, action groupée, « Garder ») ; les photos publiées comptent comme rangées. Seules les autres
-- (série reçue à l'import) reçoivent une proposition.
ALTER TABLE photos ADD COLUMN series_checked INTEGER NOT NULL DEFAULT 0;
UPDATE photos SET series_checked = 1 WHERE status = 'published';
-- Empreinte visuelle d'une photo (512 nombres, CLIP), calculée sur le serveur ; vec NULL : analyse impossible.
CREATE TABLE photo_embeddings (
  photo_id   INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
  model      TEXT NOT NULL,
  vec        BLOB,
  created_at INTEGER NOT NULL
);
