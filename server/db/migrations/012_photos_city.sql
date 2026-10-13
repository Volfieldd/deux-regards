-- Ville d'une photo, pour la carte du site : nom, pays et position de la VILLE (GeoNames), jamais la position GPS
-- exacte de la prise de vue. city_source : « gps » (proposée d'après le GPS de l'original) ou « manuel ».
-- on_map : la photo figure sur la carte (décidé par l'auteur, jamais automatique). gps_checked : GPS déjà lu.
ALTER TABLE photos ADD COLUMN city_id INTEGER;
ALTER TABLE photos ADD COLUMN city_name TEXT;
ALTER TABLE photos ADD COLUMN city_cc TEXT;
ALTER TABLE photos ADD COLUMN city_lat REAL;
ALTER TABLE photos ADD COLUMN city_lon REAL;
ALTER TABLE photos ADD COLUMN city_source TEXT;
ALTER TABLE photos ADD COLUMN on_map INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN gps_checked INTEGER NOT NULL DEFAULT 0;
CREATE INDEX photos_on_map ON photos (on_map) WHERE on_map = 1;
