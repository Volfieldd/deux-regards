-- Langue de l'administration choisie par chaque photographe (fr, en, de ; vide : français). Un compte qui n'est lié à
-- aucun photographe garde son choix dans un cookie.
ALTER TABLE authors ADD COLUMN admin_lang TEXT NOT NULL DEFAULT '';
