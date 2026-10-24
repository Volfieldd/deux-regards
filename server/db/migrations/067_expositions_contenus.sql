-- Contenus propres à l’exposition : l’auteur et les cartels ne modifient ni la fiche ni la série des photos.
ALTER TABLE saisons ADD COLUMN author_id INTEGER REFERENCES authors(id) ON DELETE SET NULL;
ALTER TABLE saisons ADD COLUMN cover_id INTEGER REFERENCES photos(id) ON DELETE SET NULL;
ALTER TABLE saisons ADD COLUMN subtitle TEXT NOT NULL DEFAULT '';
ALTER TABLE saisons ADD COLUMN subtitle_en TEXT NOT NULL DEFAULT '';
ALTER TABLE saisons ADD COLUMN subtitle_de TEXT NOT NULL DEFAULT '';
ALTER TABLE saisons ADD COLUMN prologue TEXT NOT NULL DEFAULT '';
ALTER TABLE saisons ADD COLUMN prologue_en TEXT NOT NULL DEFAULT '';
ALTER TABLE saisons ADD COLUMN prologue_de TEXT NOT NULL DEFAULT '';
ALTER TABLE saisons ADD COLUMN conclusion TEXT NOT NULL DEFAULT '';
ALTER TABLE saisons ADD COLUMN conclusion_en TEXT NOT NULL DEFAULT '';
ALTER TABLE saisons ADD COLUMN conclusion_de TEXT NOT NULL DEFAULT '';
CREATE INDEX saisons_author ON saisons (author_id);
CREATE INDEX saisons_cover ON saisons (cover_id);

ALTER TABLE saison_photos ADD COLUMN cartel TEXT NOT NULL DEFAULT '';
ALTER TABLE saison_photos ADD COLUMN cartel_en TEXT NOT NULL DEFAULT '';
ALTER TABLE saison_photos ADD COLUMN cartel_de TEXT NOT NULL DEFAULT '';
