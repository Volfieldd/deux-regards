-- Signature d'un photographe pour ses posts Instagram (« — Julien · @julien.photo »), ajoutée sous la légende des
-- photos qui en ont une ; photos.ig_signature à 0 la retire pour une photo.
ALTER TABLE authors ADD COLUMN ig_signature TEXT NOT NULL DEFAULT '';
ALTER TABLE photos ADD COLUMN ig_signature INTEGER NOT NULL DEFAULT 1;
