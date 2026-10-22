-- Une archive privée garde la liste et la taille effectivement exportées. Elles sont revérifiées à chaque téléchargement :
-- une baisse de droits, une photo retirée ou devenue bloquée rend aussitôt l'ancienne archive inaccessible.
ALTER TABLE space_archives ADD COLUMN manifest TEXT;
