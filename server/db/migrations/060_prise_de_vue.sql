-- Prise de vue de chaque photo (visionneuse du site public, maquette MQ-04, PLAN point 8) : boîtier (marque et modèle),
-- objectif, focale en mm, ouverture (nombre f/), vitesse en secondes, sensibilité ISO. Lue une fois dans l'EXIF de
-- l'original (server/prise-de-vue.js), normalisée et bornée ; jamais de GPS, de numéro de série, de propriétaire ni de
-- logiciel. NULL : absente de l'original, ou hors des bornes.
ALTER TABLE photos ADD COLUMN shot_make TEXT;
ALTER TABLE photos ADD COLUMN shot_model TEXT;
ALTER TABLE photos ADD COLUMN shot_lens TEXT;
ALTER TABLE photos ADD COLUMN shot_focal REAL;
ALTER TABLE photos ADD COLUMN shot_fnumber REAL;
ALTER TABLE photos ADD COLUMN shot_exposure REAL;
ALTER TABLE photos ADD COLUMN shot_iso INTEGER;
-- 0 : l'original n'a pas encore été lu (photos importées avant cette migration : rattrapage en arrière-plan, une fois) ;
-- 1 : lu, à l'import ou par le rattrapage. On ne le relit plus.
ALTER TABLE photos ADD COLUMN shot_read INTEGER NOT NULL DEFAULT 0 CHECK (shot_read IN (0, 1));
-- Montrer la prise de vue sur le site (fiche de l'admin, « Montrer la prise de vue sur le site ») : cochée par défaut,
-- ce n'est pas une donnée personnelle. Décochée, ni la visionneuse ni les images servies (mode EXIF « Prise de vue ») ne
-- la portent.
ALTER TABLE photos ADD COLUMN show_shot INTEGER NOT NULL DEFAULT 1 CHECK (show_shot IN (0, 1));
