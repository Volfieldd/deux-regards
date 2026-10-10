-- Filigrane et métadonnées des variantes.
-- watermark : NULL = réglage général, 0 = jamais de filigrane sur cette photo.
-- variant_key : empreinte des réglages appliqués, présente dans le nom des variantes ('' = variantes brutes).
ALTER TABLE photos ADD COLUMN watermark INTEGER CHECK (watermark IS NULL OR watermark = 0);
ALTER TABLE photos ADD COLUMN variant_key TEXT NOT NULL DEFAULT '';
