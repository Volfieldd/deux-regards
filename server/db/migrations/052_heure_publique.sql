-- Heure de prise de vue sur le site public : choisie photo par photo (fiche de l'admin, « Montrer l'heure sur le
-- site »), décochée par défaut. Le site ne la montre que si la date est au jour (AAAA-MM-JJ) et l'heure connue
-- (taken_time, migration 021) : avec le lieu, l'heure dit où se trouvaient les personnes photographiées.
ALTER TABLE photos ADD COLUMN show_time INTEGER NOT NULL DEFAULT 0 CHECK (show_time IN (0, 1));
