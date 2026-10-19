-- Point fort du cadrage de chaque photo (site public v3, PLAN point 9, Spécifications P28) : ce que l'ouverture plein cadre
-- de l'accueil garde quand elle recadre la photo (10 % au plus). Neuf positions : 0, 50 ou 100 % sur chaque axe (de gauche
-- à droite, de haut en bas) ; 50 / 50, le centre, par défaut. Un cadrage d'affichage : ni lieu, ni heure, ni personne.
ALTER TABLE photos ADD COLUMN focal_x INTEGER NOT NULL DEFAULT 50 CHECK (focal_x IN (0, 50, 100));
ALTER TABLE photos ADD COLUMN focal_y INTEGER NOT NULL DEFAULT 50 CHECK (focal_y IN (0, 50, 100));
